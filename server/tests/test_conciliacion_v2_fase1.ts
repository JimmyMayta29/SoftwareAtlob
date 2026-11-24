import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { parse } from 'dotenv';
import express from 'express';
import { Pool, type PoolClient } from 'pg';
import {
  CASOS_CALCULO_NUMERICO_V2,
  crearConfigConciliacionFixture,
} from './fixtures/conciliacion/datasetsFase1';

// ============================================================================
// UTILIDADES DE PRUEBA Y VALIDACIÓN DE ENTORNO
// ============================================================================

const soloUnitarias =
  process.argv.includes('--solo-unitarias') ||
  process.env.ATLOB_CONCILIACION_SOLO_UNITARIAS === '1';

let totalCasos = 0;
let casosPasados = 0;

async function ejecutarCaso(nombre: string, fn: () => void | Promise<void>) {
  totalCasos += 1;
  await fn();
  casosPasados += 1;
  console.log(`  ✅ PASÓ: ${nombre}`);
}

function resolverTestDatabaseUrl(): string {
  const localEnv = existsSync('.env') ? parse(readFileSync('.env', 'utf8')) : {};
  const url = process.env.TEST_DATABASE_URL ?? localEnv.TEST_DATABASE_URL;
  assert.ok(url, 'TEST_DATABASE_URL requerida en entorno o .env para ejecutar Bloque B en atlob_test.');

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('TEST_DATABASE_URL no tiene un formato de URL válido.');
  }

  assert.ok(
    ['postgres:', 'postgresql:'].includes(parsed.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) &&
      parsed.username === 'contabilidad_app' &&
      parsed.pathname === '/atlob_test' &&
      [...parsed.searchParams.keys()].every((k) => k === 'sslmode'),
    `TEST_DATABASE_URL debe apuntar a /atlob_test local como usuario contabilidad_app (recibido: ${parsed.username}@${parsed.hostname}${parsed.pathname}).`
  );

  return url;
}

async function fijarContextoRls(client: PoolClient, empresaId: string, usuarioId = '') {
  await client.query(
    `SELECT set_config('app.empresa_id', $1, true),
            set_config('app.current_empresa_id', $1, true),
            set_config('app.usuario_id', $2, true),
            set_config('app.current_user_id', $2, true)`,
    [empresaId, usuarioId]
  );
}

async function queryEnEmpresa<T extends Record<string, any> = any>(
  pool: Pool,
  empresaId: string,
  usuarioId: string,
  sql: string,
  params: unknown[] = []
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await fijarContextoRls(client, empresaId, usuarioId);
    const res = await client.query<T>(sql, params);
    await client.query('COMMIT');
    return res;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================================
// BLOQUE A — PRUEBAS UNITARIAS / PURAS (SIN POSTGRESQL)
// ============================================================================

async function ejecutarBloqueUnitario() {
  const {
    ConciliacionV2Error,
    calcularResumenNumericoConciliacionV2,
    derivarEstadoEfectivoExtracto,
    derivarEstadoLibroV2,
    validarPrecondicionOperacionCuenta,
    validarCuentasAsientoConfig,
  } = await import('../services/conciliacionV2Service');

  console.log('\n====================================================================');
  console.log('🧪 BLOQUE A — PRUEBAS UNITARIAS / PURAS CONCILIACIÓN BANCARIA V2');
  console.log('====================================================================');

  await ejecutarCaso('A1. Fórmula exacta con Money (decimal.js), IEEE-754 centavos y semáforos', () => {
    // Verificar explícitamente que IEEE-754 nativo falla en los casos trampa, pero Money no
    assert.notEqual(0.1 + 0.2, 0.3, 'Control IEEE-754: 0.1 + 0.2 no es 0.3 en binario flotante');
    assert.notEqual(1000.1 - 400.2 - 599.9, 0, 'Control IEEE-754: 1000.1 - 400.2 - 599.9 deja residuo binario');

    for (const caso of CASOS_CALCULO_NUMERICO_V2) {
      const res = calcularResumenNumericoConciliacionV2(caso.input);
      assert.equal(res.saldoFinalExtracto, caso.esperado.saldoFinalExtracto, `${caso.nombre}: saldoFinalExtracto`);
      assert.equal(res.saldoAjustadoBanco, caso.esperado.saldoAjustadoBanco, `${caso.nombre}: saldoAjustadoBanco`);
      assert.equal(res.saldoAjustadoLibros, caso.esperado.saldoAjustadoLibros, `${caso.nombre}: saldoAjustadoLibros`);
      assert.equal(res.diferencia, caso.esperado.diferencia, `${caso.nombre}: diferencia`);
      assert.equal(res.semaforo, caso.esperado.semaforo, `${caso.nombre}: semaforo`);
    }

    // Diferencia negativa fuera de tolerancia -> ROJO
    const negRojo = calcularResumenNumericoConciliacionV2({
      tieneExtracto: true,
      saldoFinalExtracto: '999.49',
      depositosEnTransito: '0.00',
      chequesNoCobrados: '0.00',
      saldoLibros: '1000.00',
      abonosNoRegistrados: '0.00',
      cargosNoRegistrados: '0.00',
      toleranciaMonto: '0.50',
    });
    assert.equal(negRojo.diferencia, '-0.51');
    assert.equal(negRojo.semaforo, 'ROJO');
  });

  await ejecutarCaso('A2. Derivación de estados efectivos extracto (legacy <-> V2) y estado libro V2', () => {
    // Extracto: sincronía legacy -> V2
    assert.equal(derivarEstadoEfectivoExtracto(true, 'PENDIENTE_LIBROS'), 'CONCILIADO');
    assert.equal(derivarEstadoEfectivoExtracto(true, null), 'CONCILIADO');
    assert.equal(derivarEstadoEfectivoExtracto(true, undefined), 'CONCILIADO');
    assert.equal(derivarEstadoEfectivoExtracto(true, 'CONCILIADO_MANUAL'), 'CONCILIADO_MANUAL');
    assert.equal(derivarEstadoEfectivoExtracto(true, 'CONCILIADO'), 'CONCILIADO');

    // Extracto: desconciliado legacy frente a estado V2 conciliado -> PENDIENTE_LIBROS
    assert.equal(derivarEstadoEfectivoExtracto(false, 'CONCILIADO'), 'PENDIENTE_LIBROS');
    assert.equal(derivarEstadoEfectivoExtracto(false, 'CONCILIADO_MANUAL'), 'PENDIENTE_LIBROS');
    assert.equal(derivarEstadoEfectivoExtracto(false, null), 'PENDIENTE_LIBROS');
    assert.equal(derivarEstadoEfectivoExtracto(false, 'ESTADO_DESCONOCIDO'), 'PENDIENTE_LIBROS');

    // Extracto: otros estados V2 válidos cuando conciliada = false
    assert.equal(derivarEstadoEfectivoExtracto(false, 'CARGO_BANCARIO_ITF'), 'CARGO_BANCARIO_ITF');
    assert.equal(derivarEstadoEfectivoExtracto(false, 'SUGERIDO'), 'SUGERIDO');
    assert.equal(derivarEstadoEfectivoExtracto(false, 'DIFERENCIA_IMPORTE'), 'DIFERENCIA_IMPORTE');
    assert.equal(derivarEstadoEfectivoExtracto(false, 'DUPLICADO'), 'DUPLICADO');

    // Libro V2 dinámico
    assert.equal(derivarEstadoLibroV2({ conciliado: true, tipo: 'EGRESO', medioPago: '007' }), 'CONCILIADO');
    assert.equal(derivarEstadoLibroV2({ conciliado: true, tipo: 'INGRESO', medioPago: '003' }), 'CONCILIADO');
    assert.equal(derivarEstadoLibroV2({ conciliado: false, tipo: 'EGRESO', medioPago: '007' }), 'CHEQUE_NO_COBRADO');
    assert.equal(derivarEstadoLibroV2({ conciliado: false, tipo: 'INGRESO', medioPago: '007' }), 'PENDIENTE_BANCO');
    assert.equal(derivarEstadoLibroV2({ conciliado: false, tipo: 'EGRESO', medioPago: '003' }), 'PENDIENTE_BANCO');
    assert.equal(derivarEstadoLibroV2({ conciliado: false, tipo: 'ITF', medioPago: null }), 'PENDIENTE_BANCO');
  });

  await ejecutarCaso('A3. Bloqueos obligatorios (cuenta sin vincular, interés ingreso null, PCGE inexistente)', () => {
    for (const valorInvalido of [null, undefined, '', '   ']) {
      assert.throws(
        () => validarPrecondicionOperacionCuenta(valorInvalido),
        (err: unknown) =>
          err instanceof ConciliacionV2Error &&
          err.statusCode === 409 &&
          err.codigo === 'CUENTA_CONTABLE_NO_VINCULADA'
      );
    }

    assert.doesNotThrow(() =>
      validarPrecondicionOperacionCuenta('11111111-1111-4111-8111-111111111111')
    );

    const planEmpresa = new Set(['6412', '6391', '67311']);

    // Interés ingreso null -> CUENTA_INTERES_INGRESO_NO_CONFIGURADA
    assert.throws(
      () =>
        validarCuentasAsientoConfig(
          'INTERES_INGRESO',
          crearConfigConciliacionFixture({ cuentaInteresIngresoCodigo: null }),
          planEmpresa
        ),
      (err: unknown) =>
        err instanceof ConciliacionV2Error &&
        err.statusCode === 409 &&
        err.codigo === 'CUENTA_INTERES_INGRESO_NO_CONFIGURADA'
    );

    // Código configurado que no existe en plan_cuentas de la empresa -> CUENTA_PCGE_INEXISTENTE_EN_EMPRESA
    assert.throws(
      () =>
        validarCuentasAsientoConfig(
          'INTERES_INGRESO',
          crearConfigConciliacionFixture({ cuentaInteresIngresoCodigo: '7793' }),
          planEmpresa
        ),
      (err: unknown) =>
        err instanceof ConciliacionV2Error &&
        err.statusCode === 409 &&
        err.codigo === 'CUENTA_PCGE_INEXISTENTE_EN_EMPRESA'
    );

    assert.throws(
      () =>
        validarCuentasAsientoConfig(
          'ITF',
          crearConfigConciliacionFixture({ cuentaItfCodigo: '6499' }),
          planEmpresa
        ),
      (err: unknown) =>
        err instanceof ConciliacionV2Error &&
        err.statusCode === 409 &&
        err.codigo === 'CUENTA_PCGE_INEXISTENTE_EN_EMPRESA'
    );

    // Códigos existentes en el plan de la empresa -> pasan y retornan el código
    assert.equal(
      validarCuentasAsientoConfig('ITF', crearConfigConciliacionFixture(), planEmpresa),
      '6412'
    );
    assert.equal(
      validarCuentasAsientoConfig('COMISION', crearConfigConciliacionFixture(), planEmpresa),
      '6391'
    );
    assert.equal(
      validarCuentasAsientoConfig('INTERES_GASTO', crearConfigConciliacionFixture(), planEmpresa),
      '67311'
    );
    planEmpresa.add('7793');
    assert.equal(
      validarCuentasAsientoConfig(
        'INTERES_INGRESO',
        crearConfigConciliacionFixture({ cuentaInteresIngresoCodigo: '7793' }),
        planEmpresa
      ),
      '7793'
    );
  });
}

// ============================================================================
// BLOQUE B — PRUEBAS DE INTEGRACIÓN REAL EN POSTGRESQL (atlob_test)
// ============================================================================

async function ejecutarBloquePostgresReal() {
  const testDbUrl = resolverTestDatabaseUrl();

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = '';
  const prevFlagV2 = process.env.CONCILIACION_V2;
  delete process.env.CONCILIACION_V2;

  console.log('\n====================================================================');
  console.log('🐘 BLOQUE B — INTEGRACIÓN REAL EN POSTGRESQL (atlob_test / contabilidad_app)');
  console.log('====================================================================');

  const pool = new Pool({
    connectionString: testDbUrl,
    options: '-c search_path=public,pg_catalog',
    max: 10,
    connectionTimeoutMillis: 5000,
  });

  const { env } = await import('../config/env');
  env.NODE_ENV = 'test';
  const { setPostgresPool, conContextoEmpresa } = await import('../config/database');
  const { runMigrations } = await import('../db/migrate');
  setPostgresPool(pool, true);

  const { ConciliacionV2Error, conciliacionV2Service } = await import('../services/conciliacionV2Service');
  const { conciliacionV2Controller } = await import('../controllers/conciliacionV2Controller');
  const { conciliacionService } = await import('../services/conciliacionService');
  const { asientoService } = await import('../services/asientoService');
  const { auditoriaChainService } = await import('../services/auditoriaChainService');
  const { authJwtService } = await import('../services/authJwtService');
  const { apiRoutes } = await import('../routes');

  const checkClient = await pool.connect();
  try {
    const {
      rows: [identity],
    } = await checkClient.query<{
      database_name: string;
      role_name: string;
      session_role: string;
      version_num: number;
      database_owner: string;
      rolcanlogin: boolean;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolbypassrls: boolean;
    }>(`
      SELECT current_database() AS database_name,
             current_user AS role_name,
             session_user AS session_role,
             current_setting('server_version_num')::int AS version_num,
             (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) AS database_owner,
             rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
      FROM pg_roles
      WHERE rolname = current_user
    `);

    assert.equal(identity?.database_name, 'atlob_test', 'Debe conectarse a atlob_test');
    assert.equal(identity.role_name, 'contabilidad_app', 'Debe usar rol contabilidad_app');
    assert.equal(identity.session_role, 'contabilidad_app', 'session_user debe ser contabilidad_app');
    assert.equal(identity.database_owner, 'contabilidad_app', 'atlob_test debe pertenecer a contabilidad_app');
    assert.ok(
      identity.rolcanlogin &&
        !identity.rolsuper &&
        !identity.rolcreatedb &&
        !identity.rolcreaterole &&
        !identity.rolbypassrls,
      'contabilidad_app debe tener LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE y NOBYPASSRLS'
    );
    assert.ok(identity.version_num >= 150000, 'Se requiere PostgreSQL >= 15 para FK compuesta ON DELETE SET NULL (cuenta_contable_id)');
  } finally {
    checkClient.release();
  }

  await runMigrations();

  // Identificadores únicos para aislamiento total de ejecución
  const tenantId = randomUUID();
  const empA = randomUUID();
  const empB = randomUUID();
  const usrAdmin = randomUUID();
  const usrSenior = randomUUID();
  const usrAsistente = randomUUID();
  const usrSoloB = randomUUID();

  const ej2024A = randomUUID();
  const ej2026A = randomUUID();
  const ej2026B = randomUUID();

  const per202402A = randomUUID();
  const per202602A = randomUUID();
  const per202603A = randomUUID();
  const per202602B = randomUUID();

  const sub01A = randomUUID();
  const sub01B = randomUUID();

  const cta1041A = randomUUID();
  const cta1042A = randomUUID();
  const cta70111A = randomUUID();
  const cta6412A = randomUUID();
  const cta6391A = randomUUID();
  const cta67311A = randomUUID();
  const cta7793A = randomUUID();
  const cta1041B = randomUUID();

  const cuentaAId = randomUUID();
  const cuentaBId = randomUUID();
  const cuentaSinVincularId = randomUUID();
  const cuentaEmpBId = randomUUID();

  const ext202402AId = randomUUID();
  const ext202602AId = randomUUID();
  const ext202603AId = randomUUID();
  const extCuentaBId = randomUUID();
  const extSinVincularId = randomUUID();

  const lin202402Id = randomUUID();
  const linFeb1Id = randomUUID();
  const linFeb2Id = randomUUID();
  const linMar1Id = randomUUID();
  const linCtaBId = randomUUID();
  const linSinVincId = randomUUID();

  const mov202402Id = randomUUID();
  const movFeb1Id = randomUUID();
  const movFeb2Id = randomUUID();
  const movMar1Id = randomUUID();
  const movCtaBId = randomUUID();

  const asientoExactoId = randomUUID();
  const asientoBorradorId = randomUUID();
  const asientoMarzoId = randomUUID();
  const asientoDescuadreId = randomUUID();

  let httpServer: ReturnType<typeof express.application.listen> | null = null;
  let httpPort = 0;

  const rucA = `20${randomInt(100000000, 999999999)}`;
  const rucB = `20${randomInt(100000000, 999999999)}`;
  const sufijo = tenantId.slice(0, 8);
  const hashDummy = await bcrypt.hash(randomUUID(), 4);

  try {
    // ------------------------------------------------------------------
    // Sembrar estructura base en atlob_test
    // ------------------------------------------------------------------
    const seedClient = await pool.connect();
    try {
      await seedClient.query('BEGIN');
      await seedClient.query(
        `INSERT INTO tenants (id, nombre, subdominio, estado) VALUES ($1, $2, $3, 'ACTIVO')`,
        [tenantId, `Tenant Concil V2 ${sufijo}`, `concil-v2-${sufijo}`]
      );

      await seedClient.query(
        `INSERT INTO usuarios_estudio (id, email, password_hash, nombre, rol_global, is_active)
         VALUES
           ($1, $5, $9, 'Admin Concil V2', 'ADMINISTRADOR', true),
           ($2, $6, $9, 'Senior Concil V2', 'CONTADOR_SENIOR', true),
           ($3, $7, $9, 'Asistente Concil V2', 'ASISTENTE_CONTABLE', true),
           ($4, $8, $9, 'Contador Empresa B', 'CONTADOR_SENIOR', true)`,
        [
          usrAdmin,
          usrSenior,
          usrAsistente,
          usrSoloB,
          `admin.concil.${sufijo}@atlob.test`,
          `senior.concil.${sufijo}@atlob.test`,
          `asistente.concil.${sufijo}@atlob.test`,
          `solob.concil.${sufijo}@atlob.test`,
          hashDummy,
        ]
      );

      await seedClient.query(
        `INSERT INTO empresas (id, tenant_id, codigo_empresa, ruc, razon_social, regimen_tributario, domicilio_fiscal, moneda_principal, is_active)
         VALUES
           ($1, $3, $4, $6, 'EMPRESA CONCIL V2 A SAC', 'REGIMEN_GENERAL', 'Av. A 100', 'PEN', true),
           ($2, $3, $5, $7, 'EMPRESA CONCIL V2 B SAC', 'REGIMEN_GENERAL', 'Av. B 200', 'PEN', true)`,
        [empA, empB, tenantId, `EMP-CA-${sufijo}`, `EMP-CB-${sufijo}`, rucA, rucB]
      );

      // Membresías por empresa (usuario_empresa tiene RLS por usuario_id)
      for (const [usuarioId, empresaId, rolEnEmpresa] of [
        [usrAdmin, empA, 'ADMINISTRADOR'],
        [usrSenior, empA, 'CONTADOR_SENIOR'],
        [usrAsistente, empA, 'ASISTENTE_CONTABLE'],
        [usrSoloB, empB, 'ADMINISTRADOR'],
      ] as const) {
        await fijarContextoRls(seedClient, empresaId, usuarioId);
        await seedClient.query(
          `INSERT INTO usuario_empresa (id, usuario_id, empresa_id, rol_en_empresa, estado)
           VALUES ($1, $2, $3, $4, 'ACTIVO')`,
          [randomUUID(), usuarioId, empresaId, rolEnEmpresa]
        );
      }

      // Empresa A: ejercicios, periodos, subdiario, plan_cuentas, cuentas_financieras
      await fijarContextoRls(seedClient, empA, usrAdmin);
      await seedClient.query(
        `INSERT INTO ejercicios (id, empresa_id, anio, estado)
         VALUES ($1, $3, 2024, 'ABIERTO'), ($2, $3, 2026, 'ABIERTO')`,
        [ej2024A, ej2026A, empA]
      );
      await seedClient.query(
        `INSERT INTO periodos (id, empresa_id, ejercicio_id, anio, mes, codigo_periodo, estado)
         VALUES
           ($1, $4, $5, 2024, 2, '2024-02', 'ABIERTO'),
           ($2, $4, $6, 2026, 2, '2026-02', 'ABIERTO'),
           ($3, $4, $6, 2026, 3, '2026-03', 'ABIERTO')`,
        [per202402A, per202602A, per202603A, empA, ej2024A, ej2026A]
      );
      await seedClient.query(
        `INSERT INTO subdiarios (id, empresa_id, codigo, descripcion, tipo, is_active)
         VALUES ($1, $2, '05', 'BANCOS', 'BANCOS', true)`,
        [sub01A, empA]
      );
      await seedClient.query(
        `INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento, is_active)
         VALUES
           ($1, $8, '10411', 'Banco Cuenta A MN', 5, 'ACTIVO', true, true),
           ($2, $8, '10412', 'Banco Cuenta B MN', 5, 'ACTIVO', true, true),
           ($3, $8, '70111', 'Ventas Mercaderías', 5, 'INGRESO', true, true),
           ($4, $8, '6412',  'Impuesto a las Transacciones Financieras', 4, 'GASTO', true, true),
           ($5, $8, '6391',  'Gastos Bancarios', 4, 'GASTO', true, true),
           ($6, $8, '67311', 'Intereses Bancarios', 5, 'GASTO', true, true),
           ($7, $8, '7793',  'Otros Ingresos Financieros', 4, 'INGRESO', true, true)`,
        [cta1041A, cta1042A, cta70111A, cta6412A, cta6391A, cta67311A, cta7793A, empA]
      );

      await seedClient.query(
        `INSERT INTO cuentas_financieras (
           id, empresa_id, tipo, banco, numero, moneda, cuenta_contable_codigo, cuenta_contable_id, saldo_inicial, saldo_actual, activa
         ) VALUES
           ($1, $4, 'BANCO', 'BCP', '193-0001-A', 'PEN', '10411', $5, 0.00, 0.00, true),
           ($2, $4, 'BANCO', 'BBVA', '0011-0002-B', 'PEN', '10412', $6, 0.00, 0.00, true),
           ($3, $4, 'BANCO', 'SCOTIABANK', '009-0003-C', 'PEN', '1041', NULL, 0.00, 0.00, true)`,
        [cuentaAId, cuentaBId, cuentaSinVincularId, empA, cta1041A, cta1042A]
      );

      // Movimientos de tesorería para Cuenta A:
      // - 2024-02-29: +1000.00 (conciliado = true, bisiesto)
      // - 2026-02-10: +400.00 (conciliado = false -> será conciliado vía legacy)
      // - 2026-02-18: -150.00 (conciliado = false, medio_pago '007' cheque -> será conciliado y desconciliado vía V2)
      // - 2026-03-01: +8000.00 (conciliado = false -> debe quedar excluido en consulta 2026-02)
      // Cuenta B:
      // - 2026-02-15: +5555.00 (debe quedar excluido al consultar Cuenta A)
      await seedClient.query(
        `INSERT INTO movimientos_tesoreria (
           id, empresa_id, periodo_id, cuenta_financiera_id, fecha, tipo, medio_pago,
           numero_operacion, moneda, tipo_cambio, importe, glosa, estado, conciliado
         ) VALUES
           ($1,  $6, $7,  $10, '2024-02-29', 'INGRESO', '003', 'OP-240229', 'PEN', 1.0000, 1000.00, 'Abono bisiesto 2024', 'REGISTRADO', true),
           ($2,  $6, $8,  $10, '2026-02-10', 'INGRESO', '003', 'OP-260210', 'PEN', 1.0000,  400.00, 'Cobranza feb 1',      'REGISTRADO', false),
           ($3,  $6, $8,  $10, '2026-02-18', 'EGRESO',  '007', 'CH-260218', 'PEN', 1.0000,  150.00, 'Cheque proveedor',    'REGISTRADO', false),
           ($4,  $6, $9,  $10, '2026-03-01', 'INGRESO', '003', 'OP-260301', 'PEN', 1.0000, 8000.00, 'Cobranza marzo',      'REGISTRADO', false),
           ($5,  $6, $8,  $11, '2026-02-15', 'INGRESO', '003', 'OP-CTAB',   'PEN', 1.0000, 5555.00, 'Movimiento Cuenta B', 'REGISTRADO', false)`,
        [
          mov202402Id,
          movFeb1Id,
          movFeb2Id,
          movMar1Id,
          movCtaBId,
          empA,
          per202402A,
          per202602A,
          per202603A,
          cuentaAId,
          cuentaBId,
        ]
      );

      // Extractos bancarios (Cuenta A en 2024-02, 2026-02, 2026-03; Cuenta B en 2026-02; Cuenta C sin vincular en 2026-02)
      await seedClient.query(
        `INSERT INTO extractos_bancarios (
           id, empresa_id, cuenta_financiera_id, nombre_archivo, fecha_corte_desde, fecha_corte_hasta,
           saldo_inicial, saldo_final, hash_archivo, estado
         ) VALUES
           ($1, $6, $7,  'ext_2024_02.csv', '2024-02-01', '2024-02-29',    0.00, 1000.00, $10, 'CARGADO'),
           ($2, $6, $7,  'ext_2026_02.csv', '2026-02-01', '2026-02-28', 1000.00, 1250.00, $11, 'CARGADO'),
           ($3, $6, $7,  'ext_2026_03.csv', '2026-03-01', '2026-03-31', 1250.00, 9250.00, $12, 'CARGADO'),
           ($4, $6, $8,  'ext_ctab_02.csv', '2026-02-01', '2026-02-28',    0.00, 5555.00, $13, 'CARGADO'),
           ($5, $6, $9,  'ext_ctac_02.csv', '2026-02-01', '2026-02-28',    0.00,  100.00, $14, 'CARGADO')`,
        [
          ext202402AId,
          ext202602AId,
          ext202603AId,
          extCuentaBId,
          extSinVincularId,
          empA,
          cuentaAId,
          cuentaBId,
          cuentaSinVincularId,
          `h2402-${sufijo}`,
          `h2602-${sufijo}`,
          `h2603-${sufijo}`,
          `hctab-${sufijo}`,
          `hctac-${sufijo}`,
        ]
      );

      await seedClient.query(
        `INSERT INTO extracto_lineas (
           id, extracto_id, empresa_id, fecha, descripcion, referencia, monto, saldo, conciliada, estado_conciliacion, movimiento_tesoreria_id
         ) VALUES
           ($1, $7,  $12, '2024-02-29', 'ABONO BISIESTO',   'OP-240229',  1000.00, 1000.00, true,  'CONCILIADO',       $13),
           ($2, $8,  $12, '2026-02-10', 'ABONO CLIENTE FEB', 'OP-260210',   400.00, 1400.00, false, 'PENDIENTE_LIBROS', NULL),
           ($3, $8,  $12, '2026-02-28', 'PAGO CHEQUE PROV',  'CH-260218',  -150.00, 1250.00, false, 'PENDIENTE_LIBROS', NULL),
           ($4, $9,  $12, '2026-03-01', 'ABONO MARZO',       'OP-260301',  8000.00, 9250.00, false, 'PENDIENTE_LIBROS', NULL),
           ($5, $10, $12, '2026-02-15', 'ABONO CUENTA B',    'OP-CTAB',    5555.00, 5555.00, false, 'PENDIENTE_LIBROS', NULL),
           ($6, $11, $12, '2026-02-20', 'ABONO SIN VINC',    'OP-SINV',     100.00,  100.00, false, 'PENDIENTE_LIBROS', NULL)`,
        [
          lin202402Id,
          linFeb1Id,
          linFeb2Id,
          linMar1Id,
          linCtaBId,
          linSinVincId,
          ext202402AId,
          ext202602AId,
          ext202603AId,
          extCuentaBId,
          extSinVincularId,
          empA,
          mov202402Id,
        ]
      );

      // Asientos contables para validar integridad Mayor 104x hasta 2026-02-28 (saldoLibros Cuenta A = 1000 + 400 - 150 = 1250.00)
      // 1) Asiento CONTABILIZADO por 1250.00 en 2026-02-20 (cuadra exacto con Tesorería)
      // 2) Asiento BORRADOR por 999.00 en 2026-02-21 (NO debe sumar al Mayor)
      // 3) Asiento CONTABILIZADO por 8000.00 en 2026-03-01 (fuera de 2026-02, NO debe sumar en 2026-02)
      await seedClient.query(
        `INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, numero, cuo, fecha, glosa, moneda, estado)
         VALUES
           ($1, $4, $5, $7, '05020001', $8,  '2026-02-20', 'Mayor exacto feb 2026', 'PEN', 'BORRADOR'),
           ($2, $4, $5, $7, '05020002', $9,  '2026-02-21', 'Borrador no contabilizado', 'PEN', 'BORRADOR'),
           ($3, $4, $6, $7, '05030001', $10, '2026-03-01', 'Mayor marzo 2026', 'PEN', 'BORRADOR')`,
        [
          asientoExactoId,
          asientoBorradorId,
          asientoMarzoId,
          empA,
          per202602A,
          per202603A,
          sub01A,
          `CUO-EX-${sufijo}`,
          `CUO-BR-${sufijo}`,
          `CUO-MR-${sufijo}`,
        ]
      );

      await seedClient.query(
        `INSERT INTO asiento_detalle (id, asiento_id, empresa_id, linea, cuenta_id, debe, haber)
         VALUES
           ($1, $7, $10, 1, $11, 1250.00,    0.00),
           ($2, $7, $10, 2, $12,    0.00, 1250.00),
           ($3, $8, $10, 1, $11,  999.00,    0.00),
           ($4, $8, $10, 2, $12,    0.00,  999.00),
           ($5, $9, $10, 1, $11, 8000.00,    0.00),
           ($6, $9, $10, 2, $12,    0.00, 8000.00)`,
        [
          randomUUID(),
          randomUUID(),
          randomUUID(),
          randomUUID(),
          randomUUID(),
          randomUUID(),
          asientoExactoId,
          asientoBorradorId,
          asientoMarzoId,
          empA,
          cta1041A,
          cta70111A,
        ]
      );

      await seedClient.query(
        `UPDATE asientos SET estado = 'CONTABILIZADO' WHERE id IN ($1, $2)`,
        [asientoExactoId, asientoMarzoId]
      );
      await seedClient.query('COMMIT');

      // Empresa B: estructura mínima en transacción propia para respetar triggers diferidos bajo RLS
      await seedClient.query('BEGIN');
      await fijarContextoRls(seedClient, empB, usrSoloB);
      await seedClient.query(
        `INSERT INTO ejercicios (id, empresa_id, anio, estado) VALUES ($1, $2, 2026, 'ABIERTO')`,
        [ej2026B, empB]
      );
      await seedClient.query(
        `INSERT INTO periodos (id, empresa_id, ejercicio_id, anio, mes, codigo_periodo, estado)
         VALUES ($1, $2, $3, 2026, 2, '2026-02', 'ABIERTO')`,
        [per202602B, empB, ej2026B]
      );
      await seedClient.query(
        `INSERT INTO subdiarios (id, empresa_id, codigo, descripcion, tipo, is_active)
         VALUES ($1, $2, '05', 'BANCOS B', 'BANCOS', true)`,
        [sub01B, empB]
      );
      await seedClient.query(
        `INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento, is_active)
         VALUES ($1, $2, '10411', 'Banco Empresa B', 5, 'ACTIVO', true, true)`,
        [cta1041B, empB]
      );
      await seedClient.query(
        `INSERT INTO cuentas_financieras (
           id, empresa_id, tipo, banco, numero, moneda, cuenta_contable_codigo, cuenta_contable_id, saldo_inicial, saldo_actual, activa
         ) VALUES ($1, $2, 'BANCO', 'BCP', '193-9999-B', 'PEN', '10411', $3, 0.00, 0.00, true)`,
        [cuentaEmpBId, empB, cta1041B]
      );

      await seedClient.query('COMMIT');
    } catch (err) {
      await seedClient.query('ROLLBACK');
      throw err;
    } finally {
      seedClient.release();
    }

    // Levantar Express en memoria con apiRoutes reales para validar RBAC/HTTP/JWT
    const app = express();
    app.use(express.json());
    app.use('/api', apiRoutes);
    httpServer = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => httpServer!.once('listening', resolve));
    httpPort = (httpServer.address() as { port: number }).port;

    const apiFetch = async (path: string, token: string, method = 'GET', body?: unknown) => {
      const resp = await fetch(`http://127.0.0.1:${httpPort}/api${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const json = await resp.json().catch(() => null);
      return { status: resp.status, body: json };
    };

    const sesionAdmin = await authJwtService.emitirSesion(
      {
        id: usrAdmin,
        email: `admin.concil.${sufijo}@atlob.test`,
        passwordHash: hashDummy,
        nombre: 'Admin Concil V2',
        rolGlobal: 'ADMINISTRADOR',
        mfaActivado: false,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      true,
      empA
    );
    const sesionSenior = await authJwtService.emitirSesion(
      {
        id: usrSenior,
        email: `senior.concil.${sufijo}@atlob.test`,
        passwordHash: hashDummy,
        nombre: 'Senior Concil V2',
        rolGlobal: 'CONTADOR_SENIOR',
        mfaActivado: false,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      false,
      empA
    );
    const sesionAsistente = await authJwtService.emitirSesion(
      {
        id: usrAsistente,
        email: `asistente.concil.${sufijo}@atlob.test`,
        passwordHash: hashDummy,
        nombre: 'Asistente Concil V2',
        rolGlobal: 'ASISTENTE_CONTABLE',
        mfaActivado: false,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      false,
      empA
    );
    const sesionSoloB = await authJwtService.emitirSesion(
      {
        id: usrSoloB,
        email: `solob.concil.${sufijo}@atlob.test`,
        passwordHash: hashDummy,
        nombre: 'Contador Empresa B',
        rolGlobal: 'CONTADOR_SENIOR',
        mfaActivado: false,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      false,
      empB
    );

    // ------------------------------------------------------------------
    // CASO 4: Filtro estricto por cuenta_financiera_id y rango real del mes
    // ------------------------------------------------------------------
    await ejecutarCaso('B4. Filtro estricto por cuenta_financiera_id y rango real (2024-02 bisiesto, 2026-02 28d, excluye Cuenta B y 2026-03)', async () => {
      const resumen2024 = await conciliacionV2Service.obtenerResumenConciliacion(empA, cuentaAId, '2024-02');
      assert.equal(resumen2024.fechaInicio, '2024-02-01');
      assert.equal(resumen2024.fechaFin, '2024-02-29', 'Febrero 2024 bisiesto debe terminar el 29');
      assert.equal(resumen2024.extractoLineas.length, 1);
      assert.equal(resumen2024.extractoLineas[0].id, lin202402Id);
      assert.equal(resumen2024.saldoLibros, '1000.00');

      const resumen2026Feb = await conciliacionV2Service.obtenerResumenConciliacion(empA, cuentaAId, '2026-02');
      assert.equal(resumen2026Feb.fechaInicio, '2026-02-01');
      assert.equal(resumen2026Feb.fechaFin, '2026-02-28', 'Febrero 2026 no bisiesto debe terminar el 28');
      assert.equal(resumen2026Feb.tieneExtracto, true);
      assert.equal(resumen2026Feb.saldoFinalExtracto, '1250.00');
      assert.equal(resumen2026Feb.saldoLibros, '1250.00');

      const idsLineas = resumen2026Feb.extractoLineas.map((l) => l.id);
      assert.deepEqual(idsLineas, [linFeb1Id, linFeb2Id], 'Solo líneas de Cuenta A en 2026-02');
      assert.ok(!idsLineas.includes(linCtaBId), 'No debe incluir líneas de Cuenta B');
      assert.ok(!idsLineas.includes(linMar1Id), 'No debe incluir líneas de 2026-03');

      const idsMovs = resumen2026Feb.movimientosLibros.map((m) => m.id);
      assert.deepEqual(idsMovs, [movFeb1Id, movFeb2Id], 'Solo movimientos de Cuenta A en 2026-02');
      assert.ok(!idsMovs.includes(movCtaBId), 'No debe incluir movimientos de Cuenta B');
      assert.ok(!idsMovs.includes(movMar1Id), 'No debe incluir movimientos de 2026-03');
    });

    // ------------------------------------------------------------------
    // CASO 5: Control de integridad Tesorería vs Mayor 104x (asiento_detalle)
    // ------------------------------------------------------------------
    await ejecutarCaso('B5. Control de integridad Tesorería vs Mayor 104x (cuadrado y con alerta por descuadre)', async () => {
      const resumenCuadrado = await conciliacionV2Service.obtenerResumenConciliacion(empA, cuentaAId, '2026-02');
      assert.equal(resumenCuadrado.integridadMayor.verificada, true);
      assert.equal(resumenCuadrado.integridadMayor.cuentaContableId, cta1041A);
      assert.equal(resumenCuadrado.integridadMayor.saldoTesoreria, '1250.00');
      assert.equal(resumenCuadrado.integridadMayor.saldoMayor104x, '1250.00');
      assert.equal(resumenCuadrado.integridadMayor.diferenciaIntegridadMayor, '0.00');
      assert.equal(resumenCuadrado.integridadMayor.alertaIntegridad, false);
      assert.equal(resumenCuadrado.integridadMayor.motivoAlerta, null);

      // Insertar un asiento manual contabilizado adicional en 2026-02 que descuadra Mayor vs Tesorería en 250.50
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await fijarContextoRls(c, empA, usrAdmin);
        await c.query(
          `INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, numero, cuo, fecha, glosa, moneda, estado)
           VALUES ($1, $2, $3, $4, '05020003', $5, '2026-02-25', 'Asiento manual descuadre', 'PEN', 'BORRADOR')`,
          [asientoDescuadreId, empA, per202602A, sub01A, `CUO-DS-${sufijo}`]
        );
        await c.query(
          `INSERT INTO asiento_detalle (id, asiento_id, empresa_id, linea, cuenta_id, debe, haber)
           VALUES
             ($1, $3, $4, 1, $5, 250.50, 0.00),
             ($2, $3, $4, 2, $6, 0.00, 250.50)`,
          [randomUUID(), randomUUID(), asientoDescuadreId, empA, cta1041A, cta70111A]
        );
        await c.query(`UPDATE asientos SET estado = 'CONTABILIZADO' WHERE id = $1`, [asientoDescuadreId]);
        await c.query('COMMIT');
      } catch (err) {
        await c.query('ROLLBACK');
        throw err;
      } finally {
        c.release();
      }

      const resumenDescuadre = await conciliacionV2Service.obtenerResumenConciliacion(empA, cuentaAId, '2026-02');
      assert.equal(resumenDescuadre.integridadMayor.verificada, true);
      assert.equal(resumenDescuadre.integridadMayor.saldoTesoreria, '1250.00');
      assert.equal(resumenDescuadre.integridadMayor.saldoMayor104x, '1500.50');
      assert.equal(resumenDescuadre.integridadMayor.diferenciaIntegridadMayor, '-250.50');
      assert.equal(resumenDescuadre.integridadMayor.alertaIntegridad, true);
      assert.match(resumenDescuadre.integridadMayor.motivoAlerta ?? '', /Descuadre/);
    });

    // ------------------------------------------------------------------
    // CASO 6: Bloqueos reales en PostgreSQL y vinculación contable
    // ------------------------------------------------------------------
    await ejecutarCaso('B6. Bloqueos reales en PG (cuenta_contable_id NULL, vinculación con auditoría, PCGE inexistente y NULL explícito)', async () => {
      await assert.rejects(
        () => conciliacionV2Service.conciliarPartida(empA, usrAdmin, { extractoLineaId: linSinVincId }),
        (err: unknown) =>
          err instanceof ConciliacionV2Error &&
          err.statusCode === 409 &&
          err.codigo === 'CUENTA_CONTABLE_NO_VINCULADA'
      );

      await assert.rejects(
        () => conciliacionV2Service.desconciliarPartida(empA, usrAdmin, { extractoLineaId: linSinVincId }),
        (err: unknown) =>
          err instanceof ConciliacionV2Error &&
          err.statusCode === 409 &&
          err.codigo === 'CUENTA_CONTABLE_NO_VINCULADA'
      );

      await assert.rejects(
        () =>
          conciliacionV2Service.cerrarConciliacion(empA, usrAdmin, {
            cuentaFinancieraId: cuentaSinVincularId,
            periodo: '2026-02',
          }),
        (err: unknown) =>
          err instanceof ConciliacionV2Error &&
          err.statusCode === 409 &&
          err.codigo === 'CUENTA_CONTABLE_NO_VINCULADA'
      );

      // Vincular cuenta contable desbloquea operaciones y audita en auditoria_log
      const vinculada = await conciliacionV2Service.vincularCuentaContable(
        empA,
        cuentaSinVincularId,
        usrAdmin,
        { cuentaContableId: cta1042A, cci: '00219300012345678901' }
      );
      assert.equal(vinculada.cuentaContableId, cta1042A);
      assert.equal(vinculada.requiereVinculacionContable, false);
      assert.equal(vinculada.cci, '00219300012345678901');

      const audVinc = await queryEnEmpresa(
        pool,
        empA,
        usrAdmin,
        `SELECT tabla_afectada, accion, datos_nuevos
         FROM auditoria_log
         WHERE empresa_id = $1 AND tabla_afectada = 'cuentas_financieras' AND registro_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [empA, cuentaSinVincularId]
      );
      assert.equal(audVinc.rows.length, 1, 'Debe registrar vinculación en auditoria_log');
      assert.equal(audVinc.rows[0].accion, 'UPDATE');
      assert.equal(audVinc.rows[0].datos_nuevos.cuentaContableId, cta1042A);

      // Operación ahora desbloqueada
      const partidaDesbloqueada = await conciliacionV2Service.conciliarPartida(empA, usrAdmin, {
        extractoLineaId: linSinVincId,
        observacion: 'Desbloqueada tras vinculación',
      });
      assert.equal(partidaDesbloqueada.conciliada, true);

      // Intentar actualizarConfig con código PCGE inexistente en empresa -> 409
      await assert.rejects(
        () =>
          conciliacionV2Service.actualizarConfig(empA, usrAdmin, {
            cuentaInteresIngresoCodigo: '99999',
          }),
        (err: unknown) =>
          err instanceof ConciliacionV2Error &&
          err.statusCode === 409 &&
          err.codigo === 'CUENTA_PCGE_INEXISTENTE_EN_EMPRESA'
      );

      // Persistir cuentaInteresIngresoCodigo: null explícitamente -> NULL en BD
      const cfgNull = await conciliacionV2Service.actualizarConfig(empA, usrAdmin, {
        cuentaInteresIngresoCodigo: null,
      });
      assert.equal(cfgNull.cuentaInteresIngresoCodigo, null);

      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await fijarContextoRls(c, empA, usrAdmin);
        const cfgDb = await c.query(
          `SELECT cuenta_interes_ingreso_codigo FROM conciliacion_config_empresa WHERE empresa_id = $1`,
          [empA]
        );
        assert.equal(cfgDb.rows.length, 1);
        assert.equal(cfgDb.rows[0].cuenta_interes_ingreso_codigo, null);
        await c.query('COMMIT');
      } finally {
        c.release();
      }

      // Limpiar fila de config creada en B6 para probar estado virgen en B7
      const cClean = await pool.connect();
      try {
        await cClean.query('BEGIN');
        await fijarContextoRls(cClean, empA, usrAdmin);
        await cClean.query(`DELETE FROM conciliacion_config_empresa WHERE empresa_id = $1`, [empA]);
        await cClean.query('COMMIT');
      } finally {
        cClean.release();
      }
    });

    // ------------------------------------------------------------------
    // CASO 7: Feature flag CONCILIACION_V2, RBAC HTTP/Controller y auditoria_log
    // ------------------------------------------------------------------
    await ejecutarCaso('B7. Feature flag CONCILIACION_V2, RBAC 403/400/200 y auditoria_log', async () => {
      // Sin fila en conciliacion_config_empresa -> false y null
      const cfgDefault = await conciliacionV2Service.obtenerConfig(empA);
      assert.equal(cfgDefault.configuradaEnBd, false);
      assert.equal(cfgDefault.conciliacionV2Habilitada, false);
      assert.equal(cfgDefault.cuentaInteresIngresoCodigo, null);
      assert.equal(cfgDefault.sugerenciaCuentaInteresIngreso, '7793');

      // RBAC vía HTTP real: CONTADOR_SENIOR y ASISTENTE_CONTABLE -> 403 PERMISO_INSUFICIENTE
      const resSenior = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/config`,
        sesionSenior.accessToken,
        'PUT',
        { conciliacionV2Habilitada: true }
      );
      assert.equal(resSenior.status, 403);

      const resAsistente = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/config`,
        sesionAsistente.accessToken,
        'PUT',
        { conciliacionV2Habilitada: true }
      );
      assert.equal(resAsistente.status, 403);

      // Validación directa del guard rolGlobal en conciliacionV2Controller
      let ctrlStatus = 0;
      let ctrlPayload: any = null;
      const mockRes = {
        status(code: number) {
          ctrlStatus = code;
          return this;
        },
        json(payload: unknown) {
          ctrlPayload = payload;
          return this;
        },
      } as any;
      await conciliacionV2Controller.actualizarConfig(
        {
          user: { id: usrSenior, email: 'senior@test', rolGlobal: 'CONTADOR_SENIOR' },
          empresaId: empA,
          params: { empresaId: empA },
          body: { conciliacionV2Habilitada: true },
        } as any,
        mockRes
      );
      assert.equal(ctrlStatus, 403);
      assert.equal(ctrlPayload?.details?.codigo, 'PERMISO_INSUFICIENTE');

      // Validación HTTP 400 por parámetro inválido
      const resBad = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/resumen?cuentaFinancieraId=no-uuid&periodo=2026-02`,
        sesionAdmin.accessToken,
        'GET'
      );
      assert.equal(resBad.status, 400);

      // ADMINISTRADOR actualiza config -> 200 y audita en auditoria_log
      const resAdmin = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/config`,
        sesionAdmin.accessToken,
        'PUT',
        {
          conciliacionV2Habilitada: true,
          toleranciaDias: 5,
          toleranciaMonto: '0.50',
          cuentaInteresIngresoCodigo: '7793',
        }
      );
      assert.equal(resAdmin.status, 200);
      assert.equal(resAdmin.body?.success, true);
      assert.equal(resAdmin.body?.data?.conciliacionV2Habilitada, true);
      assert.equal(resAdmin.body?.data?.configuradaEnBd, true);
      assert.equal(resAdmin.body?.data?.toleranciaDias, 5);
      assert.equal(resAdmin.body?.data?.toleranciaMonto, '0.50');
      assert.equal(resAdmin.body?.data?.cuentaInteresIngresoCodigo, '7793');

      const audCfg = await queryEnEmpresa(
        pool,
        empA,
        usrAdmin,
        `SELECT accion, usuario_id, datos_nuevos
         FROM auditoria_log
         WHERE empresa_id = $1 AND tabla_afectada = 'conciliacion_config_empresa' AND registro_id = $1::text
         ORDER BY created_at DESC LIMIT 1`,
        [empA]
      );
      assert.equal(audCfg.rows.length, 1);
      assert.equal(audCfg.rows[0].usuario_id, usrAdmin);
      assert.equal(audCfg.rows[0].datos_nuevos.conciliacionV2Habilitada, true);
    });

    // ------------------------------------------------------------------
    // CASO 8: Sincronía legacy <-> V2 en ambos sentidos en PostgreSQL real
    // ------------------------------------------------------------------
    await ejecutarCaso('B8. Sincronía legacy <-> V2 bidireccional en PostgreSQL real con auditoría', async () => {
      // Sentido 1 (Legacy -> V2): conciliacionService.conciliar marca conciliada=true sin tocar estado_conciliacion
      await conContextoEmpresa(empA, usrAdmin, () =>
        conciliacionService.conciliar(empA, linFeb1Id, movFeb1Id, usrAdmin)
      );

      const rawLegacy = await queryEnEmpresa(
        pool,
        empA,
        usrAdmin,
        `SELECT conciliada, estado_conciliacion, movimiento_tesoreria_id
         FROM extracto_lineas WHERE id = $1`,
        [linFeb1Id]
      );
      assert.equal(rawLegacy.rows[0].conciliada, true);
      assert.equal(rawLegacy.rows[0].estado_conciliacion, 'PENDIENTE_LIBROS');

      const resumenTrasLegacy = await conciliacionV2Service.obtenerResumenConciliacion(empA, cuentaAId, '2026-02');
      const lin1V2 = resumenTrasLegacy.extractoLineas.find((l) => l.id === linFeb1Id)!;
      const mov1V2 = resumenTrasLegacy.movimientosLibros.find((m) => m.id === movFeb1Id)!;
      assert.equal(lin1V2.conciliada, true);
      assert.equal(lin1V2.estadoConciliacion, 'CONCILIADO', 'V2 debe derivar CONCILIADO ante conciliada=true legacy');
      assert.equal(mov1V2.estadoLibroV2, 'CONCILIADO');
      assert.equal(resumenTrasLegacy.abonosNoRegistrados, '0.00');
      assert.equal(resumenTrasLegacy.depositosEnTransito, '0.00');
      assert.equal(resumenTrasLegacy.cargosNoRegistrados, '150.00');
      assert.equal(resumenTrasLegacy.chequesNoCobrados, '150.00');
      assert.equal(resumenTrasLegacy.conteos.chequesNoCobrados, 1);

      // Sentido 2 (V2 -> Legacy): conciliarPartida actualiza V2 + legacy + movimientos_tesoreria
      const concV2 = await conciliacionV2Service.conciliarPartida(empA, usrSenior, {
        extractoLineaId: linFeb2Id,
        movimientoTesoreriaId: movFeb2Id,
        observacion: 'Cruce manual V2',
      });
      assert.equal(concV2.conciliada, true);
      assert.equal(concV2.estadoConciliacion, 'CONCILIADO_MANUAL');
      assert.equal(concV2.movimientoTesoreriaId, movFeb2Id);
      assert.equal(concV2.diferenciaImporte, '0.00');

      const pgPostConc = await queryEnEmpresa(
        pool,
        empA,
        usrSenior,
        `SELECT el.conciliada, el.estado_conciliacion, el.movimiento_tesoreria_id, mt.conciliado
         FROM extracto_lineas el
         JOIN movimientos_tesoreria mt ON mt.id = el.movimiento_tesoreria_id
         WHERE el.id = $1`,
        [linFeb2Id]
      );
      assert.equal(pgPostConc.rows[0].conciliada, true);
      assert.equal(pgPostConc.rows[0].estado_conciliacion, 'CONCILIADO_MANUAL');
      assert.equal(pgPostConc.rows[0].conciliado, true);

      // Desconciliar V2 -> revierte extracto_lineas y movimientos_tesoreria y registra auditoria_log
      const desconcV2 = await conciliacionV2Service.desconciliarPartida(empA, usrSenior, {
        extractoLineaId: linFeb2Id,
        motivo: 'Reversión controlada QA',
      });
      assert.equal(desconcV2.conciliada, false);
      assert.equal(desconcV2.estadoConciliacion, 'PENDIENTE_LIBROS');
      assert.equal(desconcV2.movimientoTesoreriaId, null);

      const pgPostDesconcLin = await queryEnEmpresa(
        pool,
        empA,
        usrSenior,
        `SELECT conciliada, estado_conciliacion, movimiento_tesoreria_id, conciliado_en
         FROM extracto_lineas WHERE id = $1`,
        [linFeb2Id]
      );
      assert.equal(pgPostDesconcLin.rows[0].conciliada, false);
      assert.equal(pgPostDesconcLin.rows[0].estado_conciliacion, 'PENDIENTE_LIBROS');
      assert.equal(pgPostDesconcLin.rows[0].movimiento_tesoreria_id, null);
      assert.equal(pgPostDesconcLin.rows[0].conciliado_en, null);

      const pgPostDesconcMov = await queryEnEmpresa(
        pool,
        empA,
        usrSenior,
        `SELECT conciliado FROM movimientos_tesoreria WHERE id = $1`,
        [movFeb2Id]
      );
      assert.equal(pgPostDesconcMov.rows[0].conciliado, false);

      const audPartida = await queryEnEmpresa(
        pool,
        empA,
        usrSenior,
        `SELECT accion, datos_nuevos
         FROM auditoria_log
         WHERE empresa_id = $1 AND tabla_afectada = 'extracto_lineas' AND registro_id = $2::text
         ORDER BY created_at ASC`,
        [empA, linFeb2Id]
      );
      assert.equal(audPartida.rows.length, 2, 'Debe auditar tanto conciliación como desconciliación');
      assert.equal(audPartida.rows[0].datos_nuevos.estadoConciliacion, 'CONCILIADO_MANUAL');
      assert.equal(audPartida.rows[1].datos_nuevos.estadoConciliacion, 'PENDIENTE_LIBROS');
      assert.equal(audPartida.rows[1].datos_nuevos.motivo, 'Reversión controlada QA');
    });

    // ------------------------------------------------------------------
    // CASO 9: Cierre, snapshot, reapertura y aislamiento RLS multiempresa
    // ------------------------------------------------------------------
    await ejecutarCaso('B9. Cierre, snapshot, reapertura auditada y aislamiento RLS multiempresa', async () => {
      // Introducir temporalmente una línea de extracto sin conciliar de 10.00 para provocar diferencia !== 0.00
      const linDescuadreId = randomUUID();
      await queryEnEmpresa(
        pool,
        empA,
        usrSenior,
        `INSERT INTO extracto_lineas (id, extracto_id, empresa_id, fecha, descripcion, monto, conciliada, estado_conciliacion)
         VALUES ($1, $2, $3, '2026-02-27', 'ABONO NO REGISTRADO DESC', 10.00, false, 'PENDIENTE_LIBROS')`,
        [linDescuadreId, ext202602AId, empA]
      );

      await assert.rejects(
        () =>
          conciliacionV2Service.cerrarConciliacion(empA, usrSenior, {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-02',
          }),
        (err: unknown) =>
          err instanceof ConciliacionV2Error &&
          err.statusCode === 409 &&
          err.codigo === 'DIFERENCIA_CONCILIACION_NO_CERO'
      );

      // Eliminar la línea temporal para cuadrar en 0.00 (1250 - 150) - (1250 - 150) = 0.00
      await queryEnEmpresa(pool, empA, usrSenior, `DELETE FROM extracto_lineas WHERE id = $1`, [linDescuadreId]);

      const cierre = await conciliacionV2Service.cerrarConciliacion(empA, usrSenior, {
        cuentaFinancieraId: cuentaAId,
        periodo: '2026-02',
      });
      assert.equal(cierre.estado, 'CERRADA');
      assert.equal(cierre.diferencia, '0.00');
      assert.equal(cierre.cerradaPor, usrSenior);
      assert.ok(cierre.fechaCierre !== null);

      const cbDb = await queryEnEmpresa(
        pool,
        empA,
        usrSenior,
        `SELECT estado, snapshot_json, diferencia::text AS diferencia
         FROM conciliaciones_bancarias WHERE id = $1`,
        [cierre.id]
      );
      assert.equal(cbDb.rows[0].estado, 'CERRADA');
      assert.equal(cbDb.rows[0].snapshot_json?.diferencia, '0.00');
      assert.equal(cbDb.rows[0].snapshot_json?.semaforo, 'VERDE');

      // Bloqueos mientras está CERRADA
      await assert.rejects(
        () =>
          conciliacionV2Service.conciliarPartida(empA, usrSenior, {
            extractoLineaId: linFeb2Id,
            movimientoTesoreriaId: movFeb2Id,
          }),
        (err: unknown) =>
          err instanceof ConciliacionV2Error &&
          err.statusCode === 409 &&
          err.codigo === 'CONCILIACION_CERRADA'
      );

      await assert.rejects(
        () =>
          conciliacionV2Service.desconciliarPartida(empA, usrSenior, {
            extractoLineaId: linFeb1Id,
          }),
        (err: unknown) =>
          err instanceof ConciliacionV2Error &&
          err.statusCode === 409 &&
          err.codigo === 'CONCILIACION_CERRADA'
      );

      // Reabrir conciliación con motivo válido
      const reapertura = await conciliacionV2Service.reabrirConciliacion(empA, usrAdmin, {
        cuentaFinancieraId: cuentaAId,
        periodo: '2026-02',
        motivo: 'Corrección de cheque en tránsito detectado',
      });
      assert.equal(reapertura.estado, 'ABIERTA');
      assert.equal(reapertura.motivoReapertura, 'Corrección de cheque en tránsito detectado');
      assert.equal(reapertura.reabiertaPor, usrAdmin);
      assert.ok(reapertura.fechaReapertura !== null);

      const audReap = await queryEnEmpresa(
        pool,
        empA,
        usrAdmin,
        `SELECT accion, datos_anteriores, datos_nuevos
         FROM auditoria_log
         WHERE empresa_id = $1 AND tabla_afectada = 'conciliaciones_bancarias' AND registro_id = $2::text
         ORDER BY created_at ASC`,
        [empA, cierre.id]
      );
      assert.equal(audReap.rows.length, 2, 'Debe registrar cierre y reapertura en auditoria_log');
      assert.equal(audReap.rows[0].accion, 'CIERRE_PERIODO');
      assert.equal(audReap.rows[1].accion, 'UPDATE');
      assert.equal(audReap.rows[1].datos_nuevos.estado, 'ABIERTA');
      assert.equal(audReap.rows[1].datos_nuevos.motivoReapertura, 'Corrección de cheque en tránsito detectado');

      // Aislamiento RLS multiempresa en conciliacion_config_empresa y endpoints V2
      const rlsClient = await pool.connect();
      try {
        await rlsClient.query('BEGIN');

        // Sin contexto -> 0 filas
        await fijarContextoRls(rlsClient, '', '');
        const sinCtx = await rlsClient.query(
          `SELECT empresa_id FROM conciliacion_config_empresa WHERE empresa_id = $1`,
          [empA]
        );
        assert.equal(sinCtx.rowCount, 0, 'Sin app.empresa_id no debe verse conciliacion_config_empresa');

        // Contexto Empresa B -> no ve ni modifica Empresa A
        await fijarContextoRls(rlsClient, empB, usrSoloB);
        const selB = await rlsClient.query(
          `SELECT empresa_id FROM conciliacion_config_empresa WHERE empresa_id = $1`,
          [empA]
        );
        assert.equal(selB.rowCount, 0, 'Contexto Empresa B no debe ver configuración de Empresa A');

        const updB = await rlsClient.query(
          `UPDATE conciliacion_config_empresa SET tolerancia_dias = 9 WHERE empresa_id = $1`,
          [empA]
        );
        assert.equal(updB.rowCount, 0, 'UPDATE cruzado en conciliacion_config_empresa debe afectar 0 filas');

        await rlsClient.query('SAVEPOINT sp_rls_ins');
        await assert.rejects(
          () =>
            rlsClient.query(
              `INSERT INTO conciliacion_config_empresa (empresa_id, conciliacion_v2_habilitada) VALUES ($1, true)`,
              [empA]
            ),
          { code: '42501' }
        );
        await rlsClient.query('ROLLBACK TO SAVEPOINT sp_rls_ins');
        await rlsClient.query('RELEASE SAVEPOINT sp_rls_ins');
        await rlsClient.query('ROLLBACK');
      } finally {
        rlsClient.release();
      }

      // Servicio V2 bajo Empresa B no ve datos de Empresa A
      const cfgB = await conciliacionV2Service.obtenerConfig(empB);
      assert.equal(cfgB.configuradaEnBd, false);
      assert.equal(cfgB.conciliacionV2Habilitada, false);

      await assert.rejects(
        () => conciliacionV2Service.obtenerResumenConciliacion(empB, cuentaAId, '2026-02'),
        (err: unknown) =>
          err instanceof ConciliacionV2Error &&
          err.statusCode === 404 &&
          err.codigo === 'CUENTA_FINANCIERA_NO_ENCONTRADA'
      );

      await assert.rejects(
        () => conciliacionV2Service.conciliarPartida(empB, usrSoloB, { extractoLineaId: linFeb1Id }),
        (err: unknown) =>
          err instanceof ConciliacionV2Error &&
          err.statusCode === 404 &&
          err.codigo === 'PARTIDA_EXTRACTO_NO_ENCONTRADA'
      );

      // Endpoint HTTP V2 bajo usuario de Empresa B pidiendo Empresa A -> 403
      const httpCross = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/config`,
        sesionSoloB.accessToken,
        'GET'
      );
      assert.equal(httpCross.status, 403, 'Usuario de Empresa B no debe acceder a endpoints V2 de Empresa A');
    });

    // ------------------------------------------------------------------
    // CASO 10: Concurrencia auditoria_log entre V2 y otros módulos + JSONB anidado
    // ------------------------------------------------------------------
    await ejecutarCaso('B10. Concurrencia auditoria_log entre V2, asientos y escritor unificado con datos anidados', async () => {
      const empB10 = randomUUID();
      const ejB10 = randomUUID();
      const perB10 = randomUUID();
      const subB10 = randomUUID();
      const cta1041B10 = randomUUID();
      const cta1042B10 = randomUUID();
      const cta70111B10 = randomUUID();
      const cta6412B10 = randomUUID();
      const cta6391B10 = randomUUID();
      const cta67311B10 = randomUUID();
      const cta7793B10 = randomUUID();
      const cuentaB10Id = randomUUID();
      const cuentaSinVincB10Id = randomUUID();
      const extB10Id = randomUUID();
      const linB10Id = randomUUID();
      const movB10Id = randomUUID();
      const rucB10 = `20${randomInt(100000000, 999999999)}`;

      const b10Seed = await pool.connect();
      try {
        await b10Seed.query('BEGIN');
        await b10Seed.query(
          `INSERT INTO empresas (id, tenant_id, codigo_empresa, ruc, razon_social, regimen_tributario, domicilio_fiscal, moneda_principal, is_active)
           VALUES ($1, $2, $3, $4, 'EMPRESA CONCIL V2 B10 SAC', 'REGIMEN_GENERAL', 'Av. B10 100', 'PEN', true)`,
          [empB10, tenantId, `EMP-B10-${sufijo}`, rucB10]
        );
        await fijarContextoRls(b10Seed, empB10, usrAdmin);
        await b10Seed.query(
          `INSERT INTO usuario_empresa (id, usuario_id, empresa_id, rol_en_empresa, estado)
           VALUES ($1, $2, $3, 'ADMINISTRADOR', 'ACTIVO')`,
          [randomUUID(), usrAdmin, empB10]
        );
        await b10Seed.query(
          `INSERT INTO ejercicios (id, empresa_id, anio, estado) VALUES ($1, $2, 2026, 'ABIERTO')`,
          [ejB10, empB10]
        );
        await b10Seed.query(
          `INSERT INTO periodos (id, empresa_id, ejercicio_id, anio, mes, codigo_periodo, estado)
           VALUES ($1, $2, $3, 2026, 2, '2026-02', 'ABIERTO')`,
          [perB10, empB10, ejB10]
        );
        await b10Seed.query(
          `INSERT INTO subdiarios (id, empresa_id, codigo, descripcion, tipo, is_active)
           VALUES ($1, $2, '05', 'BANCOS B10', 'BANCOS', true)`,
          [subB10, empB10]
        );
        await b10Seed.query(
          `INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento, is_active)
           VALUES
             ($1, $8, '10411', 'Banco BCP B10 MN', 5, 'ACTIVO', true, true),
             ($2, $8, '10412', 'Banco BBVA B10 MN', 5, 'ACTIVO', true, true),
             ($3, $8, '70111', 'Ventas Mercaderías B10', 5, 'INGRESO', true, true),
             ($4, $8, '6412',  'Impuesto a las Transacciones Financieras B10', 4, 'GASTO', true, true),
             ($5, $8, '6391',  'Gastos Bancarios B10', 4, 'GASTO', true, true),
             ($6, $8, '67311', 'Intereses Bancarios B10', 5, 'GASTO', true, true),
             ($7, $8, '7793',  'Otros Ingresos Financieros B10', 4, 'INGRESO', true, true)`,
          [cta1041B10, cta1042B10, cta70111B10, cta6412B10, cta6391B10, cta67311B10, cta7793B10, empB10]
        );
        await b10Seed.query(
          `INSERT INTO cuentas_financieras (
             id, empresa_id, tipo, banco, numero, moneda, cuenta_contable_codigo, cuenta_contable_id, saldo_inicial, saldo_actual, activa
           ) VALUES
             ($1, $3, 'BANCO', 'BCP', '193-B10-001', 'PEN', '10411', $4, 0.00, 0.00, true),
             ($2, $3, 'BANCO', 'BBVA', '0011-B10-002', 'PEN', '1041', NULL, 0.00, 0.00, true)`,
          [cuentaB10Id, cuentaSinVincB10Id, empB10, cta1041B10]
        );
        await b10Seed.query(
          `INSERT INTO movimientos_tesoreria (
             id, empresa_id, periodo_id, cuenta_financiera_id, fecha, tipo, medio_pago,
             numero_operacion, moneda, tipo_cambio, importe, glosa, estado, conciliado
           ) VALUES ($1, $2, $3, $4, '2026-02-15', 'INGRESO', '003', 'OP-B10-1', 'PEN', 1.0000, 500.00, 'Abono B10', 'REGISTRADO', false)`,
          [movB10Id, empB10, perB10, cuentaB10Id]
        );
        await b10Seed.query(
          `INSERT INTO extractos_bancarios (
             id, empresa_id, cuenta_financiera_id, nombre_archivo, fecha_corte_desde, fecha_corte_hasta,
             saldo_inicial, saldo_final, hash_archivo, estado
           ) VALUES ($1, $2, $3, 'ext_b10_02.csv', '2026-02-01', '2026-02-28', 0.00, 500.00, $4, 'CARGADO')`,
          [extB10Id, empB10, cuentaB10Id, `hb10-${sufijo}`]
        );
        await b10Seed.query(
          `INSERT INTO extracto_lineas (
             id, extracto_id, empresa_id, fecha, descripcion, referencia, monto, saldo, conciliada, estado_conciliacion, movimiento_tesoreria_id
           ) VALUES ($1, $2, $3, '2026-02-15', 'ABONO B10', 'OP-B10-1', 500.00, 500.00, false, 'PENDIENTE_LIBROS', NULL)`,
          [linB10Id, extB10Id, empB10]
        );
        await b10Seed.query('COMMIT');
      } catch (err) {
        await b10Seed.query('ROLLBACK');
        throw err;
      } finally {
        b10Seed.release();
      }

      try {
        // Lote 1 en paralelo: V2 (config + vinculación + conciliación) + módulo asientos + escritor unificado sin client con detalles anidados
        const [cfg1, vincB10, partB10, asientoB10, audUnif1] = await Promise.all([
          conciliacionV2Service.actualizarConfig(empB10, usrAdmin, {
            conciliacionV2Habilitada: true,
            toleranciaDias: 4,
            toleranciaMonto: '0.25',
            cuentaInteresIngresoCodigo: '7793',
          }),
          conciliacionV2Service.vincularCuentaContable(empB10, cuentaSinVincB10Id, usrAdmin, {
            cuentaContableId: cta1042B10,
            cci: '00219300099988877766',
          }),
          conciliacionV2Service.conciliarPartida(empB10, usrAdmin, {
            extractoLineaId: linB10Id,
            movimientoTesoreriaId: movB10Id,
            observacion: 'Cruce concurrente B10',
          }),
          conContextoEmpresa(empB10, usrAdmin, () =>
            asientoService.crearAsiento(
              empB10,
              {
                periodoId: perB10,
                subdiarioId: subB10,
                fecha: '2026-02-20',
                glosa: 'Asiento real concurrente B10',
                moneda: 'PEN',
                lineas: [
                  { linea: 1, cuentaId: cta1041B10, debe: 250, haber: 0, glosaLinea: 'Cargo banco B10' },
                  { linea: 2, cuentaId: cta70111B10, debe: 0, haber: 250, glosaLinea: 'Abono ventas B10' },
                ],
              },
              usrAdmin
            )
          ),
          auditoriaChainService.registrar({
            empresaId: empB10,
            usuarioId: usrAdmin,
            tablaAfectada: 'asientos',
            registroId: randomUUID(),
            accion: 'INSERT',
            datosNuevos: {
              totalHaber: 100,
              numero: '05020099',
              detalles: [
                {
                  glosaLinea: 'Cargo concurrente',
                  haber: 0,
                  debe: 100,
                  cuentaNombre: 'BCP',
                  cuentaCodigo: '10411',
                  linea: 1,
                },
                {
                  glosaLinea: 'Abono concurrente',
                  haber: 100,
                  debe: 0,
                  cuentaNombre: 'CxC',
                  cuentaCodigo: '1212',
                  linea: 2,
                },
              ],
              cuo: `CUO-B10-${sufijo}-1`,
              totalDebe: 100,
              glosa: 'Asiento concurrente con detalles anidados B10',
            },
          }),
        ]);

        assert.equal(cfg1.conciliacionV2Habilitada, true);
        assert.equal(vincB10.cuentaContableId, cta1042B10);
        assert.equal(partB10.conciliada, true);
        assert.equal(asientoB10.estado, 'CONTABILIZADO');
        assert.ok(audUnif1.hashActual);

        // Lote 2 en paralelo: cierre V2 + actualización config V2 + segundo escritor unificado anidado para garantizar intercalado
        const [cierreB10, cfg2, audUnif2] = await Promise.all([
          conciliacionV2Service.cerrarConciliacion(empB10, usrAdmin, {
            cuentaFinancieraId: cuentaB10Id,
            periodo: '2026-02',
          }),
          conciliacionV2Service.actualizarConfig(empB10, usrAdmin, {
            toleranciaDias: 7,
            toleranciaMonto: '1.00',
          }),
          auditoriaChainService.registrar({
            empresaId: empB10,
            usuarioId: usrAdmin,
            tablaAfectada: 'asientos',
            registroId: randomUUID(),
            accion: 'UPDATE',
            datosNuevos: {
              glosa: 'Segundo evento concurrente anidado B10',
              totalDebe: 350,
              cuo: `CUO-B10-${sufijo}-2`,
              detalles: [
                {
                  cuentaNombre: 'BBVA',
                  linea: 1,
                  debe: 350,
                  cuentaCodigo: '10412',
                  haber: 0,
                  glosaLinea: 'Cargo 2',
                },
                {
                  cuentaNombre: 'Ventas',
                  linea: 2,
                  debe: 0,
                  cuentaCodigo: '70111',
                  haber: 350,
                  glosaLinea: 'Abono 2',
                },
              ],
              totalHaber: 350,
              numero: '05020100',
            },
          }),
        ]);

        assert.equal(cierreB10.estado, 'CERRADA');
        assert.equal(cfg2.toleranciaDias, 7);
        assert.ok(audUnif2.hashActual);

        // Verificar en PostgreSQL real que hay >= 4 filas en auditoria_log y la cadena es 100% íntegra
        const countRes = await queryEnEmpresa<{ total: number }>(
          pool,
          empB10,
          usrAdmin,
          `SELECT COUNT(*)::int AS total FROM auditoria_log WHERE empresa_id = $1`,
          [empB10]
        );
        assert.ok(
          countRes.rows[0].total >= 4,
          `Se esperaban >= 4 filas en auditoria_log para empB10, se obtuvieron ${countRes.rows[0].total}`
        );

        const resultado = await conContextoEmpresa(empB10, usrAdmin, () =>
          auditoriaChainService.verificarIntegridad(empB10)
        );
        assert.equal(resultado.valido, true, `Cadena de auditoría corrupta: ${resultado.mensaje}`);
        assert.ok(
          resultado.totalRegistros >= 4,
          `verificarIntegridad debe validar >= 4 registros (validados: ${resultado.totalRegistros})`
        );
      } finally {
        // Limpieza de tablas mutables creadas por B10 (respetando inmutabilidad de auditoria_log y asientos contabilizados)
        const b10Clean = await pool.connect();
        try {
          await b10Clean.query(
            `SELECT set_config('app.empresa_id', $1, false),
                    set_config('app.current_empresa_id', $1, false),
                    set_config('app.usuario_id', $2, false),
                    set_config('app.current_user_id', $2, false)`,
            [empB10, usrAdmin]
          );
          const sentenciasB10 = [
            [`DELETE FROM conciliaciones_bancarias WHERE empresa_id = $1`, [empB10]],
            [`DELETE FROM extracto_lineas WHERE empresa_id = $1`, [empB10]],
            [`DELETE FROM extractos_bancarios WHERE empresa_id = $1`, [empB10]],
            [`DELETE FROM movimientos_tesoreria WHERE empresa_id = $1`, [empB10]],
            [`DELETE FROM conciliacion_config_empresa WHERE empresa_id = $1`, [empB10]],
            [`DELETE FROM cuentas_financieras WHERE empresa_id = $1`, [empB10]],
            [`DELETE FROM correlativos WHERE empresa_id = $1`, [empB10]],
            [`DELETE FROM asiento_detalle WHERE empresa_id = $1`, [empB10]],
            [`DELETE FROM asientos WHERE empresa_id = $1`, [empB10]],
            [`DELETE FROM subdiarios WHERE empresa_id = $1`, [empB10]],
            [`DELETE FROM plan_cuentas WHERE empresa_id = $1`, [empB10]],
            [`DELETE FROM periodos WHERE empresa_id = $1`, [empB10]],
            [`DELETE FROM ejercicios WHERE empresa_id = $1`, [empB10]],
            [`DELETE FROM usuario_empresa WHERE empresa_id = $1`, [empB10]],
            [`DELETE FROM empresas WHERE id = $1`, [empB10]],
          ] as const;

          for (const [sql, params] of sentenciasB10) {
            try {
              await b10Clean.query(sql, [...params]);
            } catch {
              // auditoria_log y asientos contabilizados quedan protegidos por trigger de inmutabilidad
            }
          }
        } finally {
          b10Clean.release();
        }
      }
    });
  } finally {
    if (prevFlagV2 !== undefined) {
      process.env.CONCILIACION_V2 = prevFlagV2;
    } else {
      delete process.env.CONCILIACION_V2;
    }

    if (httpServer) {
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    }

    // Limpieza ordenada por FK en atlob_test (respetando triggers append-only de auditoria_log y asientos contabilizados)
    const cleanClient = await pool.connect();
    try {
      for (const empId of [empA, empB]) {
        await cleanClient.query(
          `SELECT set_config('app.empresa_id', $1, false),
                  set_config('app.current_empresa_id', $1, false),
                  set_config('app.usuario_id', $2, false),
                  set_config('app.current_user_id', $2, false)`,
          [empId, usrAdmin]
        );
        const sentencias = [
          [`DELETE FROM conciliaciones_bancarias WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM extracto_lineas WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM extractos_bancarios WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM movimientos_tesoreria WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM conciliacion_config_empresa WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM cuentas_financieras WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM asiento_detalle WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM asientos WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM subdiarios WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM plan_cuentas WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM periodos WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM ejercicios WHERE empresa_id = $1`, [empId]],
        ] as const;

        for (const [sql, params] of sentencias) {
          try {
            await cleanClient.query(sql, [...params]);
          } catch {
            // Asientos contabilizados pueden quedar protegidos por trigger de inmutabilidad
          }
        }
      }

      for (const uid of [usrAdmin, usrSenior, usrAsistente, usrSoloB]) {
        await cleanClient.query(
          `SELECT set_config('app.usuario_id', $1, false), set_config('app.current_user_id', $1, false)`,
          [uid]
        );
        try {
          await cleanClient.query(`DELETE FROM refresh_tokens WHERE usuario_id = $1`, [uid]);
          await cleanClient.query(`DELETE FROM usuario_empresa WHERE usuario_id = $1`, [uid]);
        } catch {
          // Ignorar si la tabla ya fue limpiada
        }
      }

      for (const [sql, params] of [
        [`DELETE FROM empresas WHERE id = ANY($1::uuid[])`, [[empA, empB]]],
        [`DELETE FROM usuarios_estudio WHERE id = ANY($1::uuid[])`, [[usrAdmin, usrSenior, usrAsistente, usrSoloB]]],
        [`DELETE FROM tenants WHERE id = $1`, [tenantId]],
      ] as const) {
        try {
          await cleanClient.query(sql, [...params]);
        } catch {
          // auditoria_log es append-only y conserva trazas de prueba con UUID único
        }
      }
    } finally {
      cleanClient.release();
    }

    setPostgresPool(null, false);
    await pool.end();
  }
}

// ============================================================================
// PUNTO DE ENTRADA
// ============================================================================

async function main() {
  process.env.NODE_ENV = 'test';
  if (soloUnitarias) {
    process.env.DATABASE_URL = '';
  }

  await ejecutarBloqueUnitario();

  if (!soloUnitarias) {
    await ejecutarBloquePostgresReal();
  } else {
    console.log('\nℹ️  Modo --solo-unitarias activo: Bloque B (PostgreSQL) omitido intencionalmente.');
  }

  console.log('\n====================================================================');
  console.log(
    `🎉 CONCILIACIÓN BANCARIA V2 FASE 1: ${casosPasados}/${totalCasos} casos aprobados`
  );
  console.log('====================================================================');
}

main().catch((err) => {
  console.error('\n❌ FALLO EN SUITE CONCILIACIÓN V2 FASE 1:', err);
  process.exitCode = 1;
});
