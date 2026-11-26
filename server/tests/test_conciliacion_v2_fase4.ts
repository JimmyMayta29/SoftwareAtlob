import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { parse } from 'dotenv';
import express from 'express';
import { Pool, type PoolClient } from 'pg';
import type { ConfigConciliacionV2 } from '../types/conciliacionV2';

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
  assert.ok(
    url,
    'TEST_DATABASE_URL requerida en entorno o .env para ejecutar Bloque B en atlob_test.'
  );

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
// BLOQUE A — PRUEBAS UNITARIAS PURAS (SIN POSTGRESQL)
// ============================================================================

async function ejecutarBloqueUnitario() {
  const {
    calcularImportesAplicacionCartera,
    calcularScoreDocumentoCartera,
  } = await import('../services/conciliacion/cartera/carteraConciliacionService');
  const {
    PLANTILLAS_ASIENTO_SISTEMA,
    calcularHashVistaPrevia,
    construirLineasPreviewAsiento,
    construirPlantillaSistema,
    interpolarGlosaPlantilla,
    resolverCuentaContrapartidaConfig,
    validarSentidoOperacionAsiento,
  } = await import('../services/conciliacion/asientos/asientosConciliacionService');
  const {
    calcularFechaVencimientoCheque,
    calcularItfEsperado,
    evaluarAntiguedadCheque,
    evaluarBancarizacionLey28194,
    validarTransicionEstadoCheque,
  } = await import('../services/conciliacion/cheques/chequesYControlService');

  const configBase: ConfigConciliacionV2 = {
    empresaId: '00000000-0000-0000-0000-000000000001',
    conciliacionV2Habilitada: true,
    toleranciaDias: 3,
    toleranciaMonto: '0.00',
    umbralAutoMatch: 0.9,
    cuentaItfCodigo: '6412',
    cuentaComisionCodigo: '6391',
    cuentaInteresGastoCodigo: '67311',
    cuentaInteresIngresoCodigo: null,
    sugerenciaCuentaInteresIngreso: '7793',
    configuradaEnBd: true,
    updatedBy: null,
    updatedAt: null,
  };

  console.log('\n====================================================================');
  console.log('🧪 BLOQUE A — UNITARIAS FASE 4 (CARTERA, ASIENTOS Y CHEQUES)');
  console.log('====================================================================');

  await ejecutarCaso(
    'A1. Cartera Money: retención IGV (CRE 3%), detracción SPOT, comisión POS, anticipo y scoring',
    () => {
      // Retención IGV 3% implícita y explícita
      const ret3 = calcularImportesAplicacionCartera({
        montoLineaAbs: '2289.20',
        totalAplicado: '2360.00',
        tipoOperacionEspecial: 'RETENCION_IGV',
        tieneRetencion: true,
        porcentajeRetencion: 3,
      });
      assert.equal(ret3.montoRetencion, '70.80');
      assert.equal(ret3.importeMovimientoTesoreria, '2360.00');
      assert.equal(ret3.saldoSinAplicar, '0.00');

      const retExp = calcularImportesAplicacionCartera({
        montoLineaAbs: '970.00',
        totalAplicado: '1000.00',
        tipoOperacionEspecial: 'RETENCION_IGV',
        montoRetencion: '30.00',
      });
      assert.equal(retExp.montoRetencion, '30.00');
      assert.equal(retExp.importeMovimientoTesoreria, '1000.00');
      assert.equal(retExp.saldoSinAplicar, '0.00');

      // Detracción SPOT
      const spot = calcularImportesAplicacionCartera({
        montoLineaAbs: '283.20',
        totalAplicado: '283.20',
        tipoOperacionEspecial: 'DETRACCION_SPOT',
      });
      assert.equal(spot.importeMovimientoTesoreria, '283.20');
      assert.equal(spot.saldoSinAplicar, '0.00');

      // Comisión POS: abono neto + comisión = cobranza bruta (precisión sin flotantes)
      const pos = calcularImportesAplicacionCartera({
        montoLineaAbs: '964.55',
        totalAplicado: '1000.00',
        tipoOperacionEspecial: 'COMISION_POS',
        comisionPosMonto: '35.45',
        generarAsientoComisionPos: true,
      });
      assert.equal(pos.comisionPosMonto, '35.45');
      assert.equal(pos.totalCobranzaBruta, '1000.00');
      assert.equal(pos.importeMovimientoTesoreria, '1000.00');
      assert.equal(pos.saldoSinAplicar, '0.00');

      // Anticipo con remanente sin aplicar
      const anticipoParcial = calcularImportesAplicacionCartera({
        montoLineaAbs: '1500.00',
        totalAplicado: '1100.00',
        tipoOperacionEspecial: 'ESTANDAR',
        esAnticipo: true,
      });
      assert.equal(anticipoParcial.saldoSinAplicar, '400.00');

      const anticipoPuro = calcularImportesAplicacionCartera({
        montoLineaAbs: '800.00',
        totalAplicado: '0.00',
        tipoOperacionEspecial: 'ESTANDAR',
        esAnticipo: true,
      });
      assert.equal(anticipoPuro.saldoSinAplicar, '800.00');

      // Bloqueos monetarios estrictos
      assert.throws(
        () =>
          calcularImportesAplicacionCartera({
            montoLineaAbs: '500.00',
            totalAplicado: '500.01',
            tipoOperacionEspecial: 'ESTANDAR',
          }),
        /IMPORTE_APLICADO_EXCEDE_OPERACION/
      );
      assert.throws(
        () =>
          calcularImportesAplicacionCartera({
            montoLineaAbs: '500.00',
            totalAplicado: '300.00',
            tipoOperacionEspecial: 'ESTANDAR',
            esAnticipo: false,
          }),
        /SALDO_SIN_APLICAR_REQUIERE_ANTICIPO/
      );

      // Scoring determinista (RUC + comprobante + monto + contraparte)
      const exacto = calcularScoreDocumentoCartera({
        montoLineaAbs: '1180.00',
        descripcionLinea: 'ABONO RUC 20555666777 FACTURA F001-00045 ACME PERU SAC',
        referenciaLinea: 'F001-45',
        rucExtraido: '20555666777',
        contraparteExtraida: 'ACME PERU',
        docExtraido: 'F001-00045',
        anexoRuc: '20555666777',
        anexoNombre: 'ACME PERU S.A.C.',
        serie: 'F001',
        numero: '00045',
        saldoPendiente: '1180.00',
      });
      assert.equal(exacto.score, 1);
      assert.ok(exacto.motivos.length >= 3);

      const parcial = calcularScoreDocumentoCartera({
        montoLineaAbs: '400.00',
        descripcionLinea: 'ABONO GENERICO',
        referenciaLinea: null,
        rucExtraido: null,
        contraparteExtraida: null,
        docExtraido: null,
        anexoRuc: '20111222333',
        anexoNombre: 'OTRO CLIENTE SRL',
        serie: 'F002',
        numero: '00099',
        saldoPendiente: '1000.00',
      });
      assert.equal(parcial.score, 0.15);
    }
  );

  await ejecutarCaso(
    'A2. Vista previa obligatoria (hash SHA-256 determinístico), rechazo por alteración e INTERES_INGRESO sin cuenta',
    () => {
      const defInteresIng = PLANTILLAS_ASIENTO_SISTEMA.find(
        (p) => p.tipoOperacion === 'INTERES_INGRESO'
      )!;
      const tplInteresIng = construirPlantillaSistema(
        defInteresIng,
        configBase.empresaId,
        configBase
      );
      assert.equal(tplInteresIng.cuentaContrapartidaCodigo, null);
      assert.equal(resolverCuentaContrapartidaConfig('INTERES_INGRESO', configBase), null);

      assert.throws(
        () => validarSentidoOperacionAsiento('ITF', '10.00'),
        /SENTIDO_MONTO_INCOMPATIBLE/
      );
      assert.throws(
        () => validarSentidoOperacionAsiento('INTERES_INGRESO', '-10.00'),
        /SENTIDO_MONTO_INCOMPATIBLE/
      );
      assert.throws(
        () => validarSentidoOperacionAsiento('OTRO', '0.00'),
        /IMPORTE_CERO/
      );

      const calc = construirLineasPreviewAsiento({
        montoExtracto: '-5.00',
        cuentaBanco: { id: 'cta-1041', codigo: '10411', nombre: 'BCP MN' },
        cuentaContrapartida: { id: 'cta-6412', codigo: '6412', nombre: 'ITF' },
        anexoId: null,
        centroCostoId: null,
        glosa: 'ITF bancario - CARGO ITF',
      });
      assert.equal(calc.cuadrado, true);
      assert.equal(calc.totalDebe, '5.00');
      assert.equal(calc.totalHaber, '5.00');
      assert.equal(calc.lineas[0].cuentaCodigo, '6412');
      assert.equal(calc.lineas[0].debe, '5.00');
      assert.equal(calc.lineas[1].cuentaCodigo, '10411');
      assert.equal(calc.lineas[1].haber, '5.00');

      const glosaInterp = interpolarGlosaPlantilla('ITF bancario - {descripcion}', {
        descripcion: 'CARGO ITF',
        fecha: '2026-03-15',
        referencia: 'ITF-01',
        monto: '5.00',
      });
      assert.equal(glosaInterp, 'ITF bancario - CARGO ITF');

      const baseParams = {
        extractoLineaId: '11111111-1111-4111-8111-111111111111',
        tipoOperacion: 'ITF' as const,
        fecha: '2026-03-15',
        periodo: '2026-03',
        subdiarioCodigo: '05',
        moneda: 'PEN' as const,
        tipoCambio: '1.0000',
        glosa: glosaInterp,
        lineas: calc.lineas,
      };

      const hash1 = calcularHashVistaPrevia(baseParams);
      const hash2 = calcularHashVistaPrevia({ ...baseParams });
      assert.equal(hash1, hash2);

      // Alterar 1 céntimo, glosa, fecha o subdiario invalida el hash SHA-256
      const hashMontoAlterado = calcularHashVistaPrevia({
        ...baseParams,
        lineas: calc.lineas.map((l, idx) =>
          idx === 0 ? { ...l, debe: '5.01' } : { ...l, haber: '5.01' }
        ),
      });
      const hashGlosaAlterada = calcularHashVistaPrevia({
        ...baseParams,
        glosa: 'ITF bancario - ALTERADO',
      });
      const hashSubdiarioAlterado = calcularHashVistaPrevia({
        ...baseParams,
        subdiarioCodigo: '04',
      });

      assert.notEqual(hash1, hashMontoAlterado);
      assert.notEqual(hash1, hashGlosaAlterada);
      assert.notEqual(hash1, hashSubdiarioAlterado);
    }
  );

  await ejecutarCaso(
    'A3. ITF esperado 0.005%, bancarización Ley 28194 (2000 PEN / 500 USD), estados y antigüedad de cheques',
    () => {
      // ITF 0.005% con redondeo a múltiplos de 0.05
      assert.equal(calcularItfEsperado('1000.00').itfRedondeado, '0.05');
      assert.equal(calcularItfEsperado('500.00').itfRedondeado, '0.05');
      assert.equal(calcularItfEsperado('400.00').itfRedondeado, '0.00');
      assert.equal(calcularItfEsperado('2500.00').itfRedondeado, '0.15');
      assert.equal(calcularItfEsperado('10000.00').itfRedondeado, '0.50');

      // Bancarización Ley 28194 PEN (2,000.00) y USD (500.00)
      assert.equal(
        evaluarBancarizacionLey28194({ moneda: 'PEN', monto: '1999.99', medioPago: '008' }).aplicaControl,
        false
      );
      const penCrit = evaluarBancarizacionLey28194({
        moneda: 'PEN',
        monto: '2000.00',
        medioPago: '008',
      });
      assert.equal(penCrit.aplicaControl, true);
      assert.equal(penCrit.severidad, 'CRITICA');
      assert.equal(penCrit.umbralLegal, '2000.00');

      assert.equal(
        evaluarBancarizacionLey28194({ moneda: 'USD', monto: '499.99', medioPago: '009' }).aplicaControl,
        false
      );
      const usdCrit = evaluarBancarizacionLey28194({
        moneda: 'USD',
        monto: '500.00',
        medioPago: '009',
      });
      assert.equal(usdCrit.aplicaControl, true);
      assert.equal(usdCrit.severidad, 'CRITICA');
      assert.equal(usdCrit.umbralLegal, '500.00');

      assert.equal(
        evaluarBancarizacionLey28194({ moneda: 'PEN', monto: '8000.00', medioPago: '003' }).aplicaControl,
        false
      );
      const chequeSinClausula = evaluarBancarizacionLey28194({
        moneda: 'PEN',
        monto: '2500.00',
        medioPago: '007',
        esNoNegociable: false,
      });
      assert.equal(chequeSinClausula.aplicaControl, true);
      assert.equal(chequeSinClausula.severidad, 'ADVERTENCIA');

      // Vencimiento y antigüedad de cheques (20 / 30 días)
      assert.equal(calcularFechaVencimientoCheque('2026-03-01'), '2026-03-31');
      const ok15 = evaluarAntiguedadCheque({
        fechaGiro: '2026-03-16',
        fechaCorte: '2026-03-31',
        estado: 'GIRADO',
      });
      assert.equal(ok15.enAlerta, false);

      const alerta20 = evaluarAntiguedadCheque({
        fechaGiro: '2026-03-11',
        fechaCorte: '2026-03-31',
        estado: 'ENTREGADO',
      });
      assert.equal(alerta20.diasTranscurridos, 20);
      assert.equal(alerta20.enAlerta, true);
      assert.equal(alerta20.vencidoPlazoLegal, false);

      const vencido31 = evaluarAntiguedadCheque({
        fechaGiro: '2026-02-28',
        fechaCorte: '2026-03-31',
        estado: 'GIRADO',
      });
      assert.equal(vencido31.diasTranscurridos, 31);
      assert.equal(vencido31.enAlerta, true);
      assert.equal(vencido31.vencidoPlazoLegal, true);

      // Máquina de estados de cheques
      validarTransicionEstadoCheque('GIRADO', 'ENTREGADO');
      validarTransicionEstadoCheque('ENTREGADO', 'COBRADO');
      validarTransicionEstadoCheque('GIRADO', 'VENCIDO');
      validarTransicionEstadoCheque('VENCIDO', 'ANULADO');
      for (const [desde, hasta] of [
        ['COBRADO', 'GIRADO'],
        ['COBRADO', 'ANULADO'],
        ['ENTREGADO', 'GIRADO'],
        ['ANULADO', 'COBRADO'],
        ['GIRADO', 'GIRADO'],
      ] as const) {
        assert.throws(
          () => validarTransicionEstadoCheque(desde, hasta),
          /TRANSICION_CHEQUE_INVALIDA/
        );
      }
    }
  );
}

// ============================================================================
// BLOQUE B — INTEGRACIÓN REAL EN POSTGRESQL (atlob_test / contabilidad_app)
// ============================================================================

async function ejecutarBloquePostgresReal() {
  const testDbUrl = resolverTestDatabaseUrl();

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = '';

  console.log('\n====================================================================');
  console.log('🐘 BLOQUE B — INTEGRACIÓN REAL FASE 4 EN POSTGRESQL (atlob_test)');
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

  const { auditoriaChainService } = await import('../services/auditoriaChainService');
  const { analisisCuentaService } = await import('../services/analisisCuentaService');
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

    assert.equal(identity?.database_name, 'atlob_test');
    assert.equal(identity.role_name, 'contabilidad_app');
    assert.equal(identity.session_role, 'contabilidad_app');
    assert.equal(identity.database_owner, 'contabilidad_app');
    assert.ok(
      identity.rolcanlogin &&
        !(
          identity.rolsuper ||
          identity.rolcreatedb ||
          identity.rolcreaterole ||
          identity.rolbypassrls
        ),
      'contabilidad_app debe tener LOGIN y no tener rolsuper, rolcreatedb, rolcreaterole ni rolbypassrls'
    );
    assert.ok(identity.version_num >= 150000);
  } finally {
    checkClient.release();
  }

  await runMigrations();

  const tenantId = randomUUID();
  const empA = randomUUID();
  const empB = randomUUID();
  const usrAdmin = randomUUID();
  const usrSenior = randomUUID();
  const usrAsistente = randomUUID();
  const usrAuditor = randomUUID();
  const usrSoloB = randomUUID();

  const ej2026A = randomUUID();
  const ej2026B = randomUUID();
  const per202602A = randomUUID();
  const per202603A = randomUUID();
  const per202603B = randomUUID();

  const sub01A = randomUUID();
  const sub02A = randomUUID();
  const sub03A = randomUUID();
  const sub04A = randomUUID();
  const sub05A = randomUUID();
  const sub05B = randomUUID();

  const cta10411A = randomUUID();
  const cta10412A = randomUUID();
  const cta10413A = randomUUID();
  const cta1212A = randomUUID();
  const cta1221A = randomUUID();
  const cta4212A = randomUUID();
  const cta40111A = randomUUID();
  const cta40114A = randomUUID();
  const cta60111A = randomUUID();
  const cta6391A = randomUUID();
  const cta6412A = randomUUID();
  const cta67311A = randomUUID();
  const cta70111A = randomUUID();
  const cta7793A = randomUUID();
  const cta10411B = randomUUID();

  const cuentaAId = randomUUID();
  const cuentaCtrlId = randomUUID();
  const cuentaRetId = randomUUID();
  const cuentaBId = randomUUID();

  const anexoCli1Id = randomUUID();
  const anexoCli2Id = randomUUID();
  const anexoProv1Id = randomUUID();

  const compV1Id = randomUUID();
  const compV2Id = randomUUID();
  const compV3Id = randomUUID();
  const compV4Id = randomUUID();
  const compV5Id = randomUUID();
  const compVRetId = randomUUID();
  const compC1Id = randomUUID();

  const cxc1Id = randomUUID();
  const cxc2Id = randomUUID();
  const cxc3Id = randomUUID();
  const cxc4Id = randomUUID();
  const cxc5Id = randomUUID();
  const cxcRetId = randomUUID();
  const cxp1Id = randomUUID();

  const extAId = randomUUID();
  const extCtrlId = randomUUID();
  const extRetId = randomUUID();

  const linParcialId = randomUUID();
  const linMultipleId = randomUUID();
  const linComisionPosId = randomUUID();
  const linAnticipoId = randomUUID();
  const linRollbackSaldosId = randomUUID();
  const linRollbackPosId = randomUUID();
  const linItfId = randomUUID();
  const linComisionId = randomUUID();
  const linInteresIngId = randomUUID();

  const linRetIgvId = randomUUID();
  const linRetCxcId = randomUUID();
  const linChequeCobradoId = randomUUID();
  const linItfSubcobroId = randomUUID();
  const linOpGrandeId = randomUUID();

  const movEfectivoCritId = randomUUID();
  const plantillaSysId = randomUUID();

  const sufijo = tenantId.slice(0, 8);
  const rucA = `2099${String(randomInt(1000000, 9999999))}`;
  const rucB = `2099${String(randomInt(1000000, 9999999))}`;
  const hashDummy = await bcrypt.hash(randomUUID(), 4);

  let httpServer: ReturnType<typeof express.application.listen> | null = null;
  let httpPort = 0;

  try {
    const seedClient = await pool.connect();
    try {
      await seedClient.query('BEGIN');
      await seedClient.query(
        `INSERT INTO tenants (id, nombre, subdominio, estado) VALUES ($1, $2, $3, 'ACTIVO')`,
        [tenantId, `Tenant Concil V2 F4 ${sufijo}`, `concil-f4-${sufijo}`]
      );

      await seedClient.query(
        `INSERT INTO usuarios_estudio (id, email, password_hash, nombre, rol_global, is_active)
         VALUES
           ($1, $6,  $11, 'Admin F4',     'ADMINISTRADOR',      true),
           ($2, $7,  $11, 'Senior F4',    'CONTADOR_SENIOR',    true),
           ($3, $8,  $11, 'Asistente F4', 'ASISTENTE_CONTABLE', true),
           ($4, $9,  $11, 'Auditor F4',   'AUDITOR_REVISOR',    true),
           ($5, $10, $11, 'Solo B F4',    'CONTADOR_SENIOR',    true)`,
        [
          usrAdmin,
          usrSenior,
          usrAsistente,
          usrAuditor,
          usrSoloB,
          `admin.f4.${sufijo}@atlob.test`,
          `senior.f4.${sufijo}@atlob.test`,
          `asistente.f4.${sufijo}@atlob.test`,
          `auditor.f4.${sufijo}@atlob.test`,
          `solob.f4.${sufijo}@atlob.test`,
          hashDummy,
        ]
      );

      await seedClient.query(
        `INSERT INTO empresas (id, tenant_id, codigo_empresa, ruc, razon_social, regimen_tributario, domicilio_fiscal, moneda_principal, is_active)
         VALUES
           ($1, $3, $4, $6, 'EMPRESA CONCIL F4 A SAC', 'REGIMEN_GENERAL', 'Av. F4 A 100', 'PEN', true),
           ($2, $3, $5, $7, 'EMPRESA CONCIL F4 B SAC', 'REGIMEN_GENERAL', 'Av. F4 B 200', 'PEN', true)`,
        [empA, empB, tenantId, `EMP-F4A-${sufijo}`, `EMP-F4B-${sufijo}`, rucA, rucB]
      );

      for (const [uid, eid, rol] of [
        [usrAdmin, empA, 'ADMINISTRADOR'],
        [usrSenior, empA, 'CONTADOR_SENIOR'],
        [usrAsistente, empA, 'ASISTENTE_CONTABLE'],
        [usrAuditor, empA, 'AUDITOR_REVISOR'],
        [usrSoloB, empB, 'ADMINISTRADOR'],
      ] as const) {
        await fijarContextoRls(seedClient, eid, uid);
        await seedClient.query(
          `INSERT INTO usuario_empresa (id, usuario_id, empresa_id, rol_en_empresa, estado)
           VALUES ($1, $2, $3, $4, 'ACTIVO')`,
          [randomUUID(), uid, eid, rol]
        );
      }

      // Empresa A
      await fijarContextoRls(seedClient, empA, usrAdmin);
      await seedClient.query(
        `INSERT INTO ejercicios (id, empresa_id, anio, estado) VALUES ($1, $2, 2026, 'ABIERTO')`,
        [ej2026A, empA]
      );
      await seedClient.query(
        `INSERT INTO periodos (id, empresa_id, ejercicio_id, anio, mes, codigo_periodo, estado)
         VALUES
           ($1, $4, $3, 2026, 2, '2026-02', 'ABIERTO'),
           ($2, $4, $3, 2026, 3, '2026-03', 'ABIERTO')`,
        [per202602A, per202603A, ej2026A, empA]
      );
      await seedClient.query(
        `INSERT INTO subdiarios (id, empresa_id, codigo, descripcion, tipo, is_active)
         VALUES
           ($1, $6, '01', 'COMPRAS F4',   'COMPRAS',   true),
           ($2, $6, '02', 'VENTAS F4',    'VENTAS',    true),
           ($3, $6, '03', 'COBRANZAS F4', 'COBRANZAS', true),
           ($4, $6, '04', 'PAGOS F4',     'PAGOS',     true),
           ($5, $6, '05', 'BANCOS F4',    'BANCOS',    true)`,
        [sub01A, sub02A, sub03A, sub04A, sub05A, empA]
      );

      await seedClient.query(
        `INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento, is_active)
         VALUES
           ($1,  $16, '10411', 'Banco BCP F4 MN',                 5, 'ACTIVO',  true, true),
           ($2,  $16, '10412', 'Banco BBVA F4 Control MN',        5, 'ACTIVO',  true, true),
           ($3,  $16, '10413', 'Banco IBK F4 Retenciones MN',     5, 'ACTIVO',  true, true),
           ($4,  $16, '1212',  'Facturas por cobrar emitidas',    4, 'ACTIVO',  true, true),
           ($5,  $16, '1221',  'Anticipos de clientes',           4, 'PASIVO',  true, true),
           ($6,  $16, '4212',  'Facturas por pagar emitidas',     4, 'PASIVO',  true, true),
           ($7,  $16, '40111', 'IGV cuenta propia',               5, 'PASIVO',  true, true),
           ($8,  $16, '40114', 'IGV regimen retenciones 3%',      5, 'PASIVO',  true, true),
           ($9,  $16, '60111', 'Mercaderias manufacturadas',      5, 'GASTO',   true, true),
           ($10, $16, '6391',  'Gastos y comisiones bancarias',   4, 'GASTO',   true, true),
           ($11, $16, '6412',  'ITF',                             4, 'GASTO',   true, true),
           ($12, $16, '67311', 'Intereses por prestamos',         5, 'GASTO',   true, true),
           ($13, $16, '70111', 'Ventas mercaderias terceros',     5, 'INGRESO', true, true),
           ($14, $16, '7793',  'Otros ingresos financieros',      4, 'INGRESO', true, true),
           ($15, $16, '422',   'Anticipos a proveedores',         3, 'ACTIVO',  true, true)`,
        [
          cta10411A,
          cta10412A,
          cta10413A,
          cta1212A,
          cta1221A,
          cta4212A,
          cta40111A,
          cta40114A,
          cta60111A,
          cta6391A,
          cta6412A,
          cta67311A,
          cta70111A,
          cta7793A,
          randomUUID(),
          empA,
        ]
      );

      await seedClient.query(
        `INSERT INTO cuentas_financieras (
           id, empresa_id, tipo, banco, numero, moneda, cuenta_contable_codigo, cuenta_contable_id, saldo_inicial, saldo_actual, activa
         ) VALUES
           ($1, $4, 'BANCO', 'BCP',       '193-994001-F4',  'PEN', '10411', $5, 0.00, 0.00, true),
           ($2, $4, 'BANCO', 'BBVA',      '0011-994002-F4', 'PEN', '10412', $6, 0.00, 0.00, true),
           ($3, $4, 'BANCO', 'INTERBANK', '200-994003-F4',  'PEN', '10413', $7, 0.00, 0.00, true)`,
        [cuentaAId, cuentaCtrlId, cuentaRetId, empA, cta10411A, cta10412A, cta10413A]
      );

      // cuenta_interes_ingreso_codigo = NULL para probar bloqueo 409 CUENTA_INTERES_INGRESO_NO_CONFIGURADA
      await seedClient.query(
        `INSERT INTO conciliacion_config_empresa (
           empresa_id, conciliacion_v2_habilitada, tolerancia_dias, tolerancia_monto, umbral_auto_match,
           cuenta_itf_codigo, cuenta_comision_codigo, cuenta_interes_gasto_codigo, cuenta_interes_ingreso_codigo
         ) VALUES ($1, true, 3, 0.00, 0.9000, '6412', '6391', '67311', NULL)`,
        [empA]
      );

      // Plantilla de sistema en BD para verificar protección DELETE -> 409 PLANTILLA_SISTEMA_PROTEGIDA
      await seedClient.query(
        `INSERT INTO conciliacion_plantillas_asiento (
           id, empresa_id, codigo, nombre, tipo_operacion, cuenta_contrapartida_codigo,
           subdiario_codigo, glosa_plantilla, es_sistema, activo, created_by, updated_by
         ) VALUES (
           $1, $2, 'SYS_ITF_F4', 'Plantilla Sistema ITF', 'ITF', '6412',
           '05', 'ITF bancario - {descripcion}', true, true, $3, $3
         )`,
        [plantillaSysId, empA, usrAdmin]
      );

      await seedClient.query(
        `INSERT INTO anexos (id, empresa_id, tipo_documento, numero_documento, razon_social, tipo_entidad)
         VALUES
           ($1, $4, '6', '20601112233', 'CLIENTE PACIFICO SUR SAC',      'CLIENTE'),
           ($2, $4, '6', '20604445566', 'DISTRIBUIDORA ANDES NORTE SAC', 'CLIENTE'),
           ($3, $4, '6', '20519998877', 'SERVICIOS LOGISTICOS LIMA SAC', 'PROVEEDOR')`,
        [anexoCli1Id, anexoCli2Id, anexoProv1Id, empA]
      );

      // Comprobantes de venta (6 facturas) + CxC + asientos de provisión en 1212
      const ventasSeed = [
        { id: compV1Id, cxcId: cxc1Id, cli: anexoCli1Id, serie: 'F001', num: '00010', fecha: '2026-03-02', venc: '2026-03-20', total: 1000.0 },
        { id: compV2Id, cxcId: cxc2Id, cli: anexoCli1Id, serie: 'F001', num: '00011', fecha: '2026-03-04', venc: '2026-03-22', total: 1500.0 },
        { id: compV3Id, cxcId: cxc3Id, cli: anexoCli2Id, serie: 'F001', num: '00012', fecha: '2026-03-06', venc: '2026-03-25', total: 1000.0 },
        { id: compV4Id, cxcId: cxc4Id, cli: anexoCli2Id, serie: 'F001', num: '00013', fecha: '2026-03-07', venc: '2026-03-27', total: 800.0 },
        { id: compV5Id, cxcId: cxc5Id, cli: anexoCli2Id, serie: 'F001', num: '00014', fecha: '2026-03-08', venc: '2026-03-28', total: 200.0 },
        { id: compVRetId, cxcId: cxcRetId, cli: anexoCli1Id, serie: 'F001', num: '00015', fecha: '2026-03-09', venc: '2026-03-29', total: 1000.0 },
      ];

      for (let i = 0; i < ventasSeed.length; i += 1) {
        const v = ventasSeed[i];
        const asientoVId = randomUUID();
        await seedClient.query(
          `INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, numero, cuo, fecha, glosa, moneda, estado)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PEN', 'BORRADOR')`,
          [
            asientoVId,
            empA,
            per202603A,
            sub02A,
            `0203000${i + 1}`,
            `CUO-V-F4-${i + 1}-${sufijo}`,
            v.fecha,
            `Provisión Venta ${v.serie}-${v.num}`,
          ]
        );
        await seedClient.query(
          `INSERT INTO asiento_detalle (id, asiento_id, empresa_id, linea, cuenta_id, anexo_id, doc_tipo, doc_serie, doc_numero, fecha_vencimiento, debe, haber, glosa_linea)
           VALUES
             ($1, $3, $4, 1, $5, $7, '01', $8, $9, $10, $11, 0.00, 'CxC Factura'),
             ($2, $3, $4, 2, $6, $7, '01', $8, $9, NULL, 0.00, $11, 'Ingreso Ventas')`,
          [
            randomUUID(),
            randomUUID(),
            asientoVId,
            empA,
            cta1212A,
            cta70111A,
            v.cli,
            v.serie,
            v.num,
            v.venc,
            v.total,
          ]
        );
        await seedClient.query(`UPDATE asientos SET estado = 'CONTABILIZADO' WHERE id = $1`, [asientoVId]);

        await seedClient.query(
          `INSERT INTO comprobantes_venta (
             id, empresa_id, periodo_id, fecha_emision, fecha_vencimiento, fecha_contable,
             tipo_comprobante, serie, numero, cliente_id, moneda, tipo_cambio,
             base_gravada, igv, exonerado, total, forma_pago, dias_credito, estado, asiento_id
           ) VALUES (
             $1, $2, $3, $4, $5, $4,
             '01', $6, $7, $8, 'PEN', 1.0000,
             0.00, 0.00, $9, $9, 'CREDITO', 15, 'REGISTRADO', $10
           )`,
          [v.id, empA, per202603A, v.fecha, v.venc, v.serie, v.num, v.cli, v.total, asientoVId]
        );
        await seedClient.query(
          `INSERT INTO cuentas_por_cobrar (
             id, empresa_id, comprobante_id, cliente_id, moneda, importe_original, saldo,
             fecha_emision, fecha_vencimiento, estado
           ) VALUES ($1, $2, $3, $4, 'PEN', $5, $5, $6, $7, 'PENDIENTE')`,
          [v.cxcId, empA, v.id, v.cli, v.total, v.fecha, v.venc]
        );
      }

      // Comprobante de compra + CxP para retención IGV 3%
      const asientoCId = randomUUID();
      await seedClient.query(
        `INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, numero, cuo, fecha, glosa, moneda, estado)
         VALUES ($1, $2, $3, $4, '01030001', $5, '2026-03-03', 'Provisión Compra F002-00201', 'PEN', 'BORRADOR')`,
        [asientoCId, empA, per202603A, sub01A, `CUO-C-F4-1-${sufijo}`]
      );
      await seedClient.query(
        `INSERT INTO asiento_detalle (id, asiento_id, empresa_id, linea, cuenta_id, anexo_id, doc_tipo, doc_serie, doc_numero, fecha_vencimiento, debe, haber, glosa_linea)
         VALUES
           ($1, $3, $4, 1, $5, $7, '01', 'F002', '00201', NULL, 2000.00, 0.00, 'Compra'),
           ($2, $3, $4, 2, $6, $7, '01', 'F002', '00201', '2026-03-28', 0.00, 2000.00, 'CxP Factura')`,
        [randomUUID(), randomUUID(), asientoCId, empA, cta60111A, cta4212A, anexoProv1Id]
      );
      await seedClient.query(`UPDATE asientos SET estado = 'CONTABILIZADO' WHERE id = $1`, [asientoCId]);

      await seedClient.query(
        `INSERT INTO comprobantes_compra (
           id, empresa_id, periodo_id, fecha_emision, fecha_vencimiento, fecha_contable,
           tipo_comprobante, serie, numero, proveedor_id, moneda, tipo_cambio,
           base_gravada, igv, exonerado, total, forma_pago, dias_credito, tiene_retencion, estado, asiento_id
         ) VALUES (
           $1, $2, $3, '2026-03-03', '2026-03-28', '2026-03-03',
           '01', 'F002', '00201', $4, 'PEN', 1.0000,
           0.00, 0.00, 2000.00, 2000.00, 'CREDITO', 25, true, 'REGISTRADO', $5
         )`,
        [compC1Id, empA, per202603A, anexoProv1Id, asientoCId]
      );
      await seedClient.query(
        `INSERT INTO cuentas_por_pagar (
           id, empresa_id, comprobante_id, proveedor_id, moneda, importe_original, saldo,
           fecha_emision, fecha_vencimiento, estado
         ) VALUES ($1, $2, $3, $4, 'PEN', 2000.00, 2000.00, '2026-03-03', '2026-03-28', 'PENDIENTE')`,
        [cxp1Id, empA, compC1Id, anexoProv1Id]
      );

      // Extractos bancarios en 2026-03
      await seedClient.query(
        `INSERT INTO extractos_bancarios (
           id, empresa_id, cuenta_financiera_id, nombre_archivo, fecha_corte_desde, fecha_corte_hasta,
           saldo_inicial, saldo_final, hash_archivo, estado
         ) VALUES
           ($1, $2, $3, 'ext_f4_principal_202603.csv', '2026-03-01', '2026-03-31', 0.00, 5417.60, $4, 'CARGADO'),
           ($5, $2, $6, 'ext_f4_control_202603.csv',   '2026-03-01', '2026-03-31', 0.00, -11200.05, $7, 'CARGADO'),
           ($8, $2, $9, 'ext_f4_retencion_202603.csv', '2026-03-01', '2026-03-31', 0.00, -970.00, $10, 'CARGADO')`,
        [
          extAId,
          empA,
          cuentaAId,
          `hash-ext-f4a-${sufijo}`,
          extCtrlId,
          cuentaCtrlId,
          `hash-ext-f4ctrl-${sufijo}`,
          extRetId,
          cuentaRetId,
          `hash-ext-f4ret-${sufijo}`,
        ]
      );

      await seedClient.query(
        `INSERT INTO extracto_lineas (
           id, extracto_id, empresa_id, fecha, descripcion, referencia, monto, saldo,
           conciliada, estado_conciliacion, tipo_clasificacion, ruc_extraido, contraparte_extraida, doc_extraido
         ) VALUES
           ($1,  $10, $11, '2026-03-10', 'ABONO PARCIAL F001-00010 RUC 20601112233 CLIENTE PACIFICO SUR', 'OP-101', 400.00,  400.00,  false, 'PENDIENTE_LIBROS', 'TRANSFERENCIA',     '20601112233', 'CLIENTE PACIFICO SUR',    'F001-00010'),
           ($2,  $10, $11, '2026-03-12', 'ABONO MULTIPLE F001-00010 F001-00011 RUC 20601112233',         'OP-102', 2100.00, 2500.00, false, 'PENDIENTE_LIBROS', 'TRANSFERENCIA',     '20601112233', 'CLIENTE PACIFICO SUR',    'F001-00011'),
           ($3,  $10, $11, '2026-03-13', 'ABONO POS IZ*VENTAS TARJETA F001-00012 RUC 20604445566',       'POS-01', 964.55,  3464.55, false, 'PENDIENTE_LIBROS', 'TRANSFERENCIA',     '20604445566', 'DISTRIBUIDORA ANDES',     'F001-00012'),
           ($4,  $10, $11, '2026-03-14', 'ANTICIPO CLIENTE DISTRIBUIDORA ANDES NORTE RUC 20604445566',   'ANT-01', 500.00,  3964.55, false, 'PENDIENTE_LIBROS', 'TRANSFERENCIA',     '20604445566', 'DISTRIBUIDORA ANDES',     NULL),
           ($5,  $10, $11, '2026-03-14', 'ABONO ROLLBACK SALDO',                                         'RB-01',  500.00,  4464.55, false, 'PENDIENTE_LIBROS', 'TRANSFERENCIA',     NULL,          NULL,                      NULL),
           ($6,  $10, $11, '2026-03-14', 'ABONO ROLLBACK COMISION POS',                                  'RB-02',  964.55,  5429.10, false, 'PENDIENTE_LIBROS', 'TRANSFERENCIA',     NULL,          NULL,                      NULL),
           ($7,  $10, $11, '2026-03-15', 'CARGO ITF BANCARIO MARZO',                                     'ITF-03', -5.00,   5424.10, false, 'PENDIENTE_LIBROS', 'ITF',               NULL,          NULL,                      NULL),
           ($8,  $10, $11, '2026-03-16', 'COMISION MANTENIMIENTO CUENTA',                                'COM-03', -25.00,  5399.10, false, 'PENDIENTE_LIBROS', 'COMISION_BANCARIA', NULL,          NULL,                      NULL),
           ($9,  $10, $11, '2026-03-17', 'ABONO INTERESES GANADOS MARZO',                                'INT-03', 18.50,   5417.60, false, 'PENDIENTE_LIBROS', 'INTERES_INGRESO',   NULL,          NULL,                      NULL),
           ($12, $17, $11, '2026-03-18', 'PAGO RETENCION CRE F002-00201 RUC 20519998877',                'RET-01', -1940.00,-1940.00,false, 'PENDIENTE_LIBROS', 'TRANSFERENCIA',     '20519998877', 'SERVICIOS LOGISTICOS',    'F002-00201'),
           ($18, $17, $11, '2026-03-19', 'COBRO RETENCION IGV 3% F001-00015 RUC 20601112233',            'RET-02', 970.00,  -970.00, false, 'PENDIENTE_LIBROS', 'TRANSFERENCIA',     '20601112233', 'CLIENTE PACIFICO SUR',    'F001-00015'),
           ($13, $16, $11, '2026-03-20', 'COBRO CHEQUE NRO 000451',                                      'CHQ-451',-1200.00,-1200.00,false, 'PENDIENTE_LIBROS', 'CHEQUE',            NULL,          NULL,                      NULL),
           ($14, $16, $11, '2026-03-21', 'ITF COBRADO BANCARIO',                                         'ITF-C1', -0.05,  -1200.05,false, 'PENDIENTE_LIBROS', 'ITF',               NULL,          NULL,                      NULL),
           ($15, $16, $11, '2026-03-22', 'TRANSFERENCIA PROVEEDOR MAYOR',                                'OP-10K', -10000.00,-11200.05,false,'PENDIENTE_LIBROS','TRANSFERENCIA',     NULL,          NULL,                      NULL)`,
        [
          linParcialId,
          linMultipleId,
          linComisionPosId,
          linAnticipoId,
          linRollbackSaldosId,
          linRollbackPosId,
          linItfId,
          linComisionId,
          linInteresIngId,
          extAId,
          empA,
          linRetIgvId,
          linChequeCobradoId,
          linItfSubcobroId,
          linOpGrandeId,
          extCtrlId,
          extRetId,
          linRetCxcId,
        ]
      );

      // Movimiento en efectivo >= 2,000 PEN en cuentaCtrlId para probar alerta Ley 28194 CRITICA
      await seedClient.query(
        `INSERT INTO movimientos_tesoreria (
           id, empresa_id, periodo_id, cuenta_financiera_id, fecha, tipo, medio_pago,
           numero_operacion, moneda, tipo_cambio, importe, glosa, estado, conciliado
         ) VALUES (
           $1, $2, $3, $4, '2026-03-23', 'EGRESO', '008',
           'EFEC-2500', 'PEN', 1.0000, 2500.00, 'Pago en efectivo sin bancarización', 'REGISTRADO', false
         )`,
        [movEfectivoCritId, empA, per202603A, cuentaCtrlId]
      );
      await seedClient.query('COMMIT');

      // Empresa B
      await seedClient.query('BEGIN');
      await fijarContextoRls(seedClient, empB, usrSoloB);
      await seedClient.query(
        `INSERT INTO ejercicios (id, empresa_id, anio, estado) VALUES ($1, $2, 2026, 'ABIERTO')`,
        [ej2026B, empB]
      );
      await seedClient.query(
        `INSERT INTO periodos (id, empresa_id, ejercicio_id, anio, mes, codigo_periodo, estado)
         VALUES ($1, $2, $3, 2026, 3, '2026-03', 'ABIERTO')`,
        [per202603B, empB, ej2026B]
      );
      await seedClient.query(
        `INSERT INTO subdiarios (id, empresa_id, codigo, descripcion, tipo, is_active)
         VALUES ($1, $2, '05', 'BANCOS F4 B', 'BANCOS', true)`,
        [sub05B, empB]
      );
      await seedClient.query(
        `INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento, is_active)
         VALUES ($1, $2, '10411', 'Banco BCP F4 B', 5, 'ACTIVO', true, true)`,
        [cta10411B, empB]
      );
      await seedClient.query(
        `INSERT INTO cuentas_financieras (
           id, empresa_id, tipo, banco, numero, moneda, cuenta_contable_codigo, cuenta_contable_id, saldo_inicial, saldo_actual, activa
         ) VALUES ($1, $2, 'BANCO', 'BCP', '193-994099-B', 'PEN', '10411', $3, 0.00, 0.00, true)`,
        [cuentaBId, empB, cta10411B]
      );
      await seedClient.query('COMMIT');
    } catch (err) {
      await seedClient.query('ROLLBACK');
      throw err;
    } finally {
      seedClient.release();
    }

    const app = express();
    app.use(express.json({ limit: '5mb' }));
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
      const text = await resp.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: resp.status, body: json, text };
    };

    const emitir = (
      id: string,
      email: string,
      nombre: string,
      rolGlobal: any,
      esAdmin: boolean,
      empId: string
    ) =>
      authJwtService.emitirSesion(
        {
          id,
          email,
          passwordHash: hashDummy,
          nombre,
          rolGlobal,
          mfaActivado: false,
          isActive: true,
          createdAt: new Date().toISOString(),
        },
        esAdmin,
        empId
      );

    const sesionAdmin = await emitir(
      usrAdmin,
      `admin.f4.${sufijo}@atlob.test`,
      'Admin F4',
      'ADMINISTRADOR',
      true,
      empA
    );
    const sesionSenior = await emitir(
      usrSenior,
      `senior.f4.${sufijo}@atlob.test`,
      'Senior F4',
      'CONTADOR_SENIOR',
      false,
      empA
    );
    const sesionAsistente = await emitir(
      usrAsistente,
      `asistente.f4.${sufijo}@atlob.test`,
      'Asistente F4',
      'ASISTENTE_CONTABLE',
      false,
      empA
    );
    const sesionAuditor = await emitir(
      usrAuditor,
      `auditor.f4.${sufijo}@atlob.test`,
      'Auditor F4',
      'AUDITOR_REVISOR',
      false,
      empA
    );
    const sesionSoloB = await emitir(
      usrSoloB,
      `solob.f4.${sufijo}@atlob.test`,
      'Solo B F4',
      'CONTADOR_SENIOR',
      false,
      empB
    );

    let movParcialId = '';
    let movMultipleId = '';
    let movComisionPosId = '';
    let movAnticipoId = '';
    let movRetIgvId = '';
    let movRetCxcId = '';
    let plantillaCustomId = '';
    let chequeCicloId = '';

    // ------------------------------------------------------------------
    // B1. Cartera CxC/CxP vía tesoreriaService.registrarMovimiento
    // ------------------------------------------------------------------
    await ejecutarCaso(
      'B1. Cartera CxC/CxP: sugerencias, aplicación parcial, múltiple, anticipo, COMISION_POS y RETENCION_IGV en PG real',
      async () => {
        // 1) GET /cartera/sugerencias/:extractoLineaId (RUC + comprobante + monto)
        const sugRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cartera/sugerencias/${linMultipleId}`,
          sesionSenior.accessToken,
          'GET'
        );
        assert.equal(sugRes.status, 200, `Error sugerencias cartera: ${sugRes.text}`);
        const sugerencias = sugRes.body?.data as any[];
        assert.ok(sugerencias.length >= 4);
        // cxc2 (F001-00011 + RUC 20601112233) debe rankear arriba con score alto
        const sugCxc2 = sugerencias.find((s) => s.documentoId === cxc2Id);
        const sugCxc3 = sugerencias.find((s) => s.documentoId === cxc3Id);
        assert.ok(sugCxc2 && sugCxc2.score >= 0.7);
        assert.ok(sugCxc3 && sugCxc2.score > sugCxc3.score);

        // 2) Aplicación parcial: 400.00 a cxc1 (1000.00 -> 600.00 PARCIAL)
        const appParcialRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cartera/aplicar`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaId: linParcialId,
            tipoCartera: 'CXC',
            aplicaciones: [{ documentoId: cxc1Id, importeAplicado: '400.00' }],
          }
        );
        assert.equal(appParcialRes.status, 201, `Error aplicación parcial: ${appParcialRes.text}`);
        assert.equal(appParcialRes.body?.data?.saldoSinAplicar, '0.00');
        assert.equal(appParcialRes.body?.data?.documentosActualizados?.[0]?.saldoNuevo, '600.00');
        assert.equal(appParcialRes.body?.data?.documentosActualizados?.[0]?.estadoNuevo, 'PARCIAL');
        movParcialId = appParcialRes.body.data.movimientoTesoreriaId;

        // 3) Aplicación múltiple en 1 sola operación: cxc1 (600.00 -> CANCELADO) + cxc2 (1500.00 -> CANCELADO)
        const appMultipleRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cartera/aplicar`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaId: linMultipleId,
            tipoCartera: 'CXC',
            aplicaciones: [
              { documentoId: cxc1Id, importeAplicado: '600.00' },
              { documentoId: cxc2Id, importeAplicado: '1500.00' },
            ],
          }
        );
        assert.equal(appMultipleRes.status, 201, `Error aplicación múltiple: ${appMultipleRes.text}`);
        assert.equal(appMultipleRes.body?.data?.documentosActualizados?.length, 2);
        for (const d of appMultipleRes.body.data.documentosActualizados) {
          assert.equal(d.saldoNuevo, '0.00');
          assert.equal(d.estadoNuevo, 'CANCELADO');
        }
        movMultipleId = appMultipleRes.body.data.movimientoTesoreriaId;

        // 4) Caso COMISION_POS: abono neto 964.55 + comisión POS 35.45 = 1000.00 -> cancela cxc3
        const appPosRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cartera/aplicar`,
          sesionAsistente.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaId: linComisionPosId,
            tipoCartera: 'CXC',
            tipoOperacionEspecial: 'COMISION_POS',
            comisionPosMonto: '35.45',
            generarAsientoComisionPos: true,
            aplicaciones: [{ documentoId: cxc3Id, importeAplicado: '1000.00' }],
          }
        );
        assert.equal(appPosRes.status, 201, `Error COMISION_POS: ${appPosRes.text}`);
        assert.ok(appPosRes.body?.data?.asientoComisionPosId);
        assert.equal(appPosRes.body?.data?.documentosActualizados?.[0]?.saldoNuevo, '0.00');
        assert.equal(appPosRes.body?.data?.documentosActualizados?.[0]?.estadoNuevo, 'CANCELADO');
        movComisionPosId = appPosRes.body.data.movimientoTesoreriaId;

        // 5) Caso Anticipo / Remanente (saldoSinAplicar > 0)
        const appAnticipoRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cartera/aplicar`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaId: linAnticipoId,
            tipoCartera: 'CXC',
            esAnticipo: true,
            anexoId: anexoCli2Id,
            aplicaciones: [],
          }
        );
        assert.equal(appAnticipoRes.status, 201, `Error anticipo: ${appAnticipoRes.text}`);
        assert.equal(appAnticipoRes.body?.data?.saldoSinAplicar, '500.00');
        movAnticipoId = appAnticipoRes.body.data.movimientoTesoreriaId;

        // 6) Caso RETENCION_IGV CxP (en cuentaRetId: 1940.00 neto + 60.00 CRE 3% = 2000.00 bruto -> cancela cxp1)
        const appRetRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cartera/aplicar`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaRetId,
            periodo: '2026-03',
            extractoLineaId: linRetIgvId,
            tipoCartera: 'CXP',
            tipoOperacionEspecial: 'RETENCION_IGV',
            tieneRetencion: true,
            porcentajeRetencion: 3,
            aplicaciones: [{ documentoId: cxp1Id, importeAplicado: '2000.00' }],
          }
        );
        assert.equal(appRetRes.status, 201, `Error RETENCION_IGV CxP: ${appRetRes.text}`);
        assert.equal(appRetRes.body?.data?.documentosActualizados?.[0]?.saldoNuevo, '0.00');
        assert.equal(appRetRes.body?.data?.documentosActualizados?.[0]?.estadoNuevo, 'CANCELADO');
        movRetIgvId = appRetRes.body.data.movimientoTesoreriaId;

        // 7) Caso RETENCION_IGV CxC (en cuentaRetId: 970.00 neto + 30.00 retención 3% = 1000.00 bruto -> cancela cxcRet)
        const appRetCxcRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cartera/aplicar`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaRetId,
            periodo: '2026-03',
            extractoLineaId: linRetCxcId,
            tipoCartera: 'CXC',
            tipoOperacionEspecial: 'RETENCION_IGV',
            tieneRetencion: true,
            porcentajeRetencion: 3,
            aplicaciones: [{ documentoId: cxcRetId, importeAplicado: '1000.00' }],
          }
        );
        assert.equal(appRetCxcRes.status, 201, `Error RETENCION_IGV CxC: ${appRetCxcRes.text}`);
        assert.equal(appRetCxcRes.body?.data?.documentosActualizados?.[0]?.saldoNuevo, '0.00');
        assert.equal(appRetCxcRes.body?.data?.documentosActualizados?.[0]?.estadoNuevo, 'CANCELADO');
        movRetCxcId = appRetCxcRes.body.data.movimientoTesoreriaId;

        // Verificar que movimientos_tesoreria.importe guarda el flujo bancario neto (1940.00 / 970.00)
        const movRetCheck = await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `SELECT id, tipo, importe::text AS importe
           FROM movimientos_tesoreria
           WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
          [empA, [movRetIgvId, movRetCxcId]]
        );
        const mapMovRet = new Map(movRetCheck.rows.map((r) => [r.id, r]));
        assert.equal(Number(mapMovRet.get(movRetIgvId)?.importe), 1940);
        assert.equal(Number(mapMovRet.get(movRetCxcId)?.importe), 970);

        // Verificar en PostgreSQL: aplicaciones_cobranza, aplicaciones_pago, vista unificada, asientos cuadrados, líneas/movs conciliados
        const bdCartera = await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `SELECT id, saldo::text AS saldo, estado
           FROM cuentas_por_cobrar
           WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
          [empA, [cxc1Id, cxc2Id, cxc3Id, cxc4Id, cxcRetId]]
        );
        const mapCxc = new Map(bdCartera.rows.map((r) => [r.id, r]));
        assert.equal(Number(mapCxc.get(cxc1Id)?.saldo), 0);
        assert.equal(mapCxc.get(cxc1Id)?.estado, 'CANCELADO');
        assert.equal(Number(mapCxc.get(cxc2Id)?.saldo), 0);
        assert.equal(mapCxc.get(cxc2Id)?.estado, 'CANCELADO');
        assert.equal(Number(mapCxc.get(cxc3Id)?.saldo), 0);
        assert.equal(mapCxc.get(cxc3Id)?.estado, 'CANCELADO');
        assert.equal(Number(mapCxc.get(cxcRetId)?.saldo), 0);
        assert.equal(mapCxc.get(cxcRetId)?.estado, 'CANCELADO');
        assert.equal(Number(mapCxc.get(cxc4Id)?.saldo), 800);
        assert.equal(mapCxc.get(cxc4Id)?.estado, 'PENDIENTE');

        const appsCobRes = await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `SELECT cuenta_por_cobrar_id AS "cxcId",
                  movimiento_tesoreria_id AS "movId",
                  fecha_cobranza::text AS "fechaCobranza",
                  importe_aplicado::text AS "importeAplicado",
                  asiento_id AS "asientoId"
           FROM aplicaciones_cobranza
           WHERE empresa_id = $1
             AND movimiento_tesoreria_id = ANY($2::uuid[])`,
          [empA, [movParcialId, movMultipleId, movComisionPosId, movRetCxcId]]
        );
        assert.equal(appsCobRes.rows.length, 5);
        for (const r of appsCobRes.rows) {
          assert.ok(r.movId, 'aplicaciones_cobranza.movimiento_tesoreria_id debe estar poblado');
          assert.ok(r.fechaCobranza, 'aplicaciones_cobranza.fecha_cobranza debe estar poblado');
          assert.ok(r.asientoId);
        }

        const vistaRes = await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `SELECT tipo_aplicacion AS "tipo",
                  movimiento_tesoreria_id AS "movId",
                  importe_aplicado::text AS "importeAplicado"
           FROM v_conciliacion_aplicaciones_cartera
           WHERE empresa_id = $1
             AND movimiento_tesoreria_id = ANY($2::uuid[])`,
          [empA, [movParcialId, movMultipleId, movComisionPosId, movRetIgvId, movRetCxcId]]
        );
        assert.equal(vistaRes.rows.length, 6);
        assert.equal(vistaRes.rows.filter((r) => r.tipo === 'COBRANZA').length, 5);
        assert.equal(vistaRes.rows.filter((r) => r.tipo === 'PAGO').length, 1);

        // Verificar asientos contabilizados y cuadrados (SUM(debe) = SUM(haber))
        const asientosCheck = await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `SELECT a.id, a.estado,
                  SUM(ad.debe)::text AS "totalDebe",
                  SUM(ad.haber)::text AS "totalHaber"
           FROM asientos a
           JOIN asiento_detalle ad ON ad.asiento_id = a.id AND ad.empresa_id = a.empresa_id
           WHERE a.empresa_id = $1
             AND a.id IN (
               SELECT asiento_id FROM movimientos_tesoreria
               WHERE empresa_id = $1 AND id = ANY($2::uuid[])
               UNION ALL
               SELECT $3::uuid
             )
           GROUP BY a.id, a.estado`,
          [
            empA,
            [movParcialId, movMultipleId, movComisionPosId, movAnticipoId, movRetIgvId, movRetCxcId],
            appPosRes.body.data.asientoComisionPosId,
          ]
        );
        assert.equal(asientosCheck.rows.length, 7);
        for (const a of asientosCheck.rows) {
          assert.equal(a.estado, 'CONTABILIZADO');
          assert.equal(Number(a.totalDebe), Number(a.totalHaber));
        }

        // Líneas y movimientos conciliados
        const estadoLinMov = await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `SELECT el.id, el.conciliada, el.estado_conciliacion AS "estLinea",
                  mt.conciliado AS "movConc", mt.estado_conciliacion_libro AS "estLibro"
           FROM extracto_lineas el
           JOIN movimientos_tesoreria mt
             ON mt.id = el.movimiento_tesoreria_id AND mt.empresa_id = el.empresa_id
           WHERE el.empresa_id = $1 AND el.id = ANY($2::uuid[])`,
          [
            empA,
            [linParcialId, linMultipleId, linComisionPosId, linAnticipoId, linRetIgvId, linRetCxcId],
          ]
        );
        assert.equal(estadoLinMov.rows.length, 6);
        for (const row of estadoLinMov.rows) {
          assert.equal(row.conciliada, true);
          assert.equal(row.estLinea, 'CONCILIADO_MANUAL');
          assert.equal(row.movConc, true);
          assert.equal(row.estLibro, 'CONCILIADO');
        }

        // Integridad Mayor 10411 en 0.00
        const resumenRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/resumen?cuentaFinancieraId=${cuentaAId}&periodo=2026-03`,
          sesionSenior.accessToken,
          'GET'
        );
        assert.equal(resumenRes.status, 200);
        assert.equal(resumenRes.body?.data?.integridadMayor?.verificada, true);
        assert.equal(resumenRes.body?.data?.integridadMayor?.diferenciaIntegridadMayor, '0.00');
        assert.equal(resumenRes.body?.data?.integridadMayor?.alertaIntegridad, false);

        // Integridad Mayor 10413 (RETENCION_IGV CXP + CXC) en 0.00 exacto
        const resumenRetRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/resumen?cuentaFinancieraId=${cuentaRetId}&periodo=2026-03`,
          sesionSenior.accessToken,
          'GET'
        );
        assert.equal(resumenRetRes.status, 200);
        assert.equal(resumenRetRes.body?.data?.integridadMayor?.verificada, true);
        assert.equal(resumenRetRes.body?.data?.integridadMayor?.saldoTesoreria, '-970.00');
        assert.equal(resumenRetRes.body?.data?.integridadMayor?.saldoMayor104x, '-970.00');
        assert.equal(resumenRetRes.body?.data?.integridadMayor?.diferenciaIntegridadMayor, '0.00');
        assert.equal(resumenRetRes.body?.data?.integridadMayor?.alertaIntegridad, false);

        // Auditoría Fase 4 en conciliacion_grupo y movimientos_tesoreria
        const audB1Res = await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `SELECT tabla_afectada AS "tabla", registro_id AS "registroId", datos_nuevos AS "datosNuevos"
           FROM auditoria_log
           WHERE empresa_id = $1
             AND tabla_afectada IN ('conciliacion_grupo', 'movimientos_tesoreria')`,
          [empA]
        );
        const audGrupoPos = audB1Res.rows.find(
          (r) =>
            r.tabla === 'conciliacion_grupo' &&
            r.datosNuevos?.movimientoTesoreriaId === movComisionPosId
        );
        assert.ok(audGrupoPos, 'Debe existir traza auditoria_log de conciliacion_grupo para COMISION_POS');
        assert.equal(audGrupoPos.datosNuevos.tipoCartera, 'CXC');
        assert.equal(audGrupoPos.datosNuevos.tipoOperacionEspecial, 'COMISION_POS');
        assert.equal(audGrupoPos.datosNuevos.extractoLineaId, linComisionPosId);
        assert.equal(audGrupoPos.datosNuevos.movimientoTesoreriaId, movComisionPosId);
        assert.ok(Array.isArray(audGrupoPos.datosNuevos.documentosActualizados));

        const audMovCom = audB1Res.rows.find(
          (r) =>
            r.tabla === 'movimientos_tesoreria' &&
            r.datosNuevos?.tipo === 'COMISION' &&
            r.datosNuevos?.extractoLineaId === linComisionPosId
        );
        assert.ok(audMovCom, 'Debe existir evento movimientos_tesoreria en auditoria_log para COMISION_POS');
        assert.ok(
          typeof audMovCom.datosNuevos?.glosa === 'string' &&
            audMovCom.datosNuevos.glosa.includes('Comisión POS'),
          'auditoria_log debe conservar glosa en movimientos_tesoreria'
        );
      }
    );

    // ------------------------------------------------------------------
    // B2. Atomicidad / Rollback total en POST /cartera/aplicar
    // ------------------------------------------------------------------
    await ejecutarCaso(
      'B2. Atomicidad / Rollback total: fallo intermedio deja 0 escrituras parciales en cartera, tesorería, asientos y extracto',
      async () => {
        const snapshotAntes = await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `SELECT
             (SELECT COUNT(*)::int FROM aplicaciones_cobranza WHERE empresa_id = $1) AS "cntApps",
             (SELECT COUNT(*)::int FROM movimientos_tesoreria WHERE empresa_id = $1) AS "cntMovs",
             (SELECT COUNT(*)::int FROM asientos WHERE empresa_id = $1) AS "cntAsientos",
             (SELECT COUNT(*)::int FROM conciliacion_grupo WHERE empresa_id = $1) AS "cntGrupos"`,
          [empA]
        );

        // 0) [M-03] Rechazo 400 CHEQUE_CARTERA_SOLO_DEPOSITO al enviar esCheque=true en abono bancario (> 0)
        const failChequeAbonoRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cartera/aplicar`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaId: linRollbackSaldosId,
            tipoCartera: 'CXC',
            esCheque: true,
            aplicaciones: [{ documentoId: cxc4Id, importeAplicado: '500.00' }],
          }
        );
        assert.equal(failChequeAbonoRes.status, 400);
        assert.equal(failChequeAbonoRes.body?.details?.codigo, 'CHEQUE_CARTERA_SOLO_DEPOSITO');

        // 1) 2da aplicación supera el saldo pendiente (200.00) tras 1ra válida (100.00 <= 800.00) -> 409
        const failSaldoRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cartera/aplicar`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaId: linRollbackSaldosId,
            tipoCartera: 'CXC',
            aplicaciones: [
              { documentoId: cxc4Id, importeAplicado: '100.00' },
              { documentoId: cxc5Id, importeAplicado: '400.00' },
            ],
          }
        );
        assert.equal(failSaldoRes.status, 409);
        assert.equal(failSaldoRes.body?.details?.codigo, 'SALDO_INSUFICIENTE_APLICACION');

        // 2) Fallo en paso 6 (cuentaComisionPosCodigo inexistente) DESPUÉS de tesoreriaService.registrarMovimiento -> rollback total
        const failComisionRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cartera/aplicar`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaId: linRollbackPosId,
            tipoCartera: 'CXC',
            tipoOperacionEspecial: 'COMISION_POS',
            comisionPosMonto: '35.45',
            cuentaComisionPosCodigo: '639999',
            generarAsientoComisionPos: true,
            aplicaciones: [
              { documentoId: cxc4Id, importeAplicado: '800.00' },
              { documentoId: cxc5Id, importeAplicado: '200.00' },
            ],
          }
        );
        assert.equal(failComisionRes.status, 409);
        assert.equal(failComisionRes.body?.details?.codigo, 'CUENTA_PCGE_INEXISTENTE_EN_EMPRESA');

        // Verificar que BD permanece 100% intacta
        const snapshotDespues = await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `SELECT
             (SELECT COUNT(*)::int FROM aplicaciones_cobranza WHERE empresa_id = $1) AS "cntApps",
             (SELECT COUNT(*)::int FROM movimientos_tesoreria WHERE empresa_id = $1) AS "cntMovs",
             (SELECT COUNT(*)::int FROM asientos WHERE empresa_id = $1) AS "cntAsientos",
             (SELECT COUNT(*)::int FROM conciliacion_grupo WHERE empresa_id = $1) AS "cntGrupos"`,
          [empA]
        );
        assert.deepEqual(snapshotDespues.rows[0], snapshotAntes.rows[0]);

        const docsIntactos = await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `SELECT id, saldo::text AS saldo, estado
           FROM cuentas_por_cobrar
           WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
          [empA, [cxc4Id, cxc5Id]]
        );
        const mapDocs = new Map(docsIntactos.rows.map((r) => [r.id, r]));
        assert.equal(Number(mapDocs.get(cxc4Id)?.saldo), 800);
        assert.equal(mapDocs.get(cxc4Id)?.estado, 'PENDIENTE');
        assert.equal(Number(mapDocs.get(cxc5Id)?.saldo), 200);
        assert.equal(mapDocs.get(cxc5Id)?.estado, 'PENDIENTE');

        const lineasIntactas = await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `SELECT id, conciliada, estado_conciliacion AS "estadoConciliacion"
           FROM extracto_lineas
           WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
          [empA, [linRollbackSaldosId, linRollbackPosId]]
        );
        for (const l of lineasIntactas.rows) {
          assert.equal(l.conciliada, false);
          assert.equal(l.estadoConciliacion, 'PENDIENTE_LIBROS');
        }
      }
    );

    // ------------------------------------------------------------------
    // B3. Plantillas y Asientos con Vista Previa Obligatoria
    // ------------------------------------------------------------------
    await ejecutarCaso(
      'B3. Plantillas y Asientos: vista previa obligatoria (400/409), INTERES_INGRESO NULL (409), CRUD plantillas + esSistema (409), ITF/Comisión e integridad 104x',
      async () => {
        // 1) POST /asientos/generar sin vista previa -> 400
        const sinPreviewRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/asientos/generar`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaId: linItfId,
            tipoOperacion: 'ITF',
            confirmadoVistaPrevia: false,
            hashVistaPrevia: '0123456789abcdef0123456789abcdef',
          }
        );
        assert.equal(sinPreviewRes.status, 400);
        assert.equal(sinPreviewRes.body?.details?.codigo, 'VALIDACION_INVALIDA');

        // 2) POST /asientos/generar con hashVistaPrevia alterado -> 409 VISTA_PREVIA_DESACTUALIZADA
        const hashMaloRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/asientos/generar`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaId: linItfId,
            tipoOperacion: 'ITF',
            confirmadoVistaPrevia: true,
            hashVistaPrevia: '0000000000000000000000000000000000000000000000000000000000000000',
          }
        );
        assert.equal(hashMaloRes.status, 409);
        assert.equal(hashMaloRes.body?.details?.codigo, 'VISTA_PREVIA_DESACTUALIZADA');

        // 3) INTERES_INGRESO con cuentaInteresIngresoCodigo = NULL -> 409 CUENTA_INTERES_INGRESO_NO_CONFIGURADA
        const prevIntIngRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/asientos/previsualizar`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaId: linInteresIngId,
            tipoOperacion: 'INTERES_INGRESO',
          }
        );
        assert.equal(prevIntIngRes.status, 409);
        assert.equal(prevIntIngRes.body?.details?.codigo, 'CUENTA_INTERES_INGRESO_NO_CONFIGURADA');

        const genIntIngRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/asientos/generar`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaId: linInteresIngId,
            tipoOperacion: 'INTERES_INGRESO',
            confirmadoVistaPrevia: true,
            hashVistaPrevia: '0123456789abcdef0123456789abcdef',
          }
        );
        assert.equal(genIntIngRes.status, 409);
        assert.equal(genIntIngRes.body?.details?.codigo, 'CUENTA_INTERES_INGRESO_NO_CONFIGURADA');

        // 4) CRUD /plantillas-asiento + protección esSistema -> 409
        const listTplRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/plantillas-asiento`,
          sesionSenior.accessToken,
          'GET'
        );
        assert.equal(listTplRes.status, 200);
        assert.ok((listTplRes.body?.data as any[]).some((p) => p.esSistema === true));

        const delSysRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/plantillas-asiento/${plantillaSysId}`,
          sesionAdmin.accessToken,
          'DELETE'
        );
        assert.equal(delSysRes.status, 409);
        assert.equal(delSysRes.body?.details?.codigo, 'PLANTILLA_SISTEMA_PROTEGIDA');

        const crearTplRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/plantillas-asiento`,
          sesionSenior.accessToken,
          'POST',
          {
            codigo: 'COM_MANT_F4',
            nombre: 'Comisión Mantenimiento Cuenta F4',
            tipoOperacion: 'COMISION',
            cuentaContrapartidaCodigo: '6391',
            subdiarioCodigo: '05',
            glosaPlantilla: 'Portes y mantenimiento - {descripcion}',
          }
        );
        assert.equal(crearTplRes.status, 201, `Error crear plantilla: ${crearTplRes.text}`);
        plantillaCustomId = crearTplRes.body.data.id;

        const updTplRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/plantillas-asiento/${plantillaCustomId}`,
          sesionSenior.accessToken,
          'PUT',
          {
            nombre: 'Comisión Mantenimiento Actualizada F4',
            glosaPlantilla: 'Comisión cuenta F4 - {descripcion}',
          }
        );
        assert.equal(updTplRes.status, 200);
        assert.equal(updTplRes.body?.data?.nombre, 'Comisión Mantenimiento Actualizada F4');

        // Crear y eliminar plantilla temporal para cubrir DELETE
        const crearTmpRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/plantillas-asiento`,
          sesionSenior.accessToken,
          'POST',
          {
            codigo: 'TMP_BORRAR_F4',
            nombre: 'Temporal Borrable',
            tipoOperacion: 'OTRO',
            cuentaContrapartidaCodigo: '6391',
            glosaPlantilla: 'Temporal {descripcion}',
          }
        );
        assert.equal(crearTmpRes.status, 201);
        const delTmpRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/plantillas-asiento/${crearTmpRes.body.data.id}`,
          sesionSenior.accessToken,
          'DELETE'
        );
        assert.equal(delTmpRes.status, 200);
        assert.equal(delTmpRes.body?.data?.eliminada, true);

        // 5) Previsualizar y generar asiento real de ITF (6412)
        const prevItfRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/asientos/previsualizar`,
          sesionAsistente.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaId: linItfId,
            tipoOperacion: 'ITF',
          }
        );
        assert.equal(prevItfRes.status, 200, `Error previsualizar ITF: ${prevItfRes.text}`);
        assert.equal(prevItfRes.body?.data?.cuadrado, true);
        assert.equal(prevItfRes.body?.data?.totalDebe, '5.00');
        assert.equal(prevItfRes.body?.data?.totalHaber, '5.00');

        const genItfRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/asientos/generar`,
          sesionAsistente.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaId: linItfId,
            tipoOperacion: 'ITF',
            confirmadoVistaPrevia: true,
            hashVistaPrevia: prevItfRes.body.data.hashVistaPrevia,
          }
        );
        assert.equal(genItfRes.status, 201, `Error generar ITF: ${genItfRes.text}`);
        assert.equal(genItfRes.body?.data?.previewHashUsado, prevItfRes.body.data.hashVistaPrevia);

        // 6) Previsualizar y generar asiento real de Comisión (6391) usando plantilla personalizada
        const prevComRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/asientos/previsualizar`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaId: linComisionId,
            plantillaId: plantillaCustomId,
          }
        );
        assert.equal(prevComRes.status, 200);
        assert.equal(prevComRes.body?.data?.cuadrado, true);
        assert.equal(prevComRes.body?.data?.totalDebe, '25.00');

        const genComRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/asientos/generar`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaId: linComisionId,
            plantillaId: plantillaCustomId,
            confirmadoVistaPrevia: true,
            hashVistaPrevia: prevComRes.body.data.hashVistaPrevia,
          }
        );
        assert.equal(genComRes.status, 201, `Error generar Comisión: ${genComRes.text}`);

        // Verificar asientos contabilizados cuadrados + integridadMayor 10411 = 0.00
        const asientosB3 = await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `SELECT a.id, a.estado, SUM(ad.debe)::text AS debe, SUM(ad.haber)::text AS haber
           FROM asientos a
           JOIN asiento_detalle ad ON ad.asiento_id = a.id AND ad.empresa_id = a.empresa_id
           WHERE a.empresa_id = $1 AND a.id = ANY($2::uuid[])
           GROUP BY a.id, a.estado`,
          [empA, [genItfRes.body.data.asientoId, genComRes.body.data.asientoId]]
        );
        assert.equal(asientosB3.rows.length, 2);
        for (const a of asientosB3.rows) {
          assert.equal(a.estado, 'CONTABILIZADO');
          assert.equal(Number(a.debe), Number(a.haber));
        }

        const resumenTrasB3 = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/resumen?cuentaFinancieraId=${cuentaAId}&periodo=2026-03`,
          sesionSenior.accessToken,
          'GET'
        );
        assert.equal(resumenTrasB3.status, 200);
        assert.equal(resumenTrasB3.body?.data?.integridadMayor?.diferenciaIntegridadMayor, '0.00');
        assert.equal(resumenTrasB3.body?.data?.integridadMayor?.alertaIntegridad, false);

        // Verificar auditoria_log de asientos/generar (hashVistaPrevia y glosa)
        const audB3Res = await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `SELECT tabla_afectada AS "tabla", registro_id AS "registroId", datos_nuevos AS "datosNuevos"
           FROM auditoria_log
           WHERE empresa_id = $1
             AND tabla_afectada IN ('conciliacion_grupo', 'movimientos_tesoreria')`,
          [empA]
        );
        const audGrupoItf = audB3Res.rows.find(
          (r) =>
            r.tabla === 'conciliacion_grupo' &&
            r.datosNuevos?.extractoLineaId === linItfId
        );
        assert.ok(audGrupoItf, 'Debe existir traza auditoria_log de conciliacion_grupo para ITF');
        assert.equal(audGrupoItf.datosNuevos.hashVistaPrevia, prevItfRes.body.data.hashVistaPrevia);
        assert.equal(audGrupoItf.datosNuevos.asientoId, genItfRes.body.data.asientoId);

        const audMovItf = audB3Res.rows.find(
          (r) =>
            r.tabla === 'movimientos_tesoreria' &&
            r.datosNuevos?.extractoLineaId === linItfId
        );
        assert.ok(audMovItf, 'Debe existir traza movimientos_tesoreria en auditoria_log para ITF');
        assert.ok(
          typeof audMovItf.datosNuevos?.glosa === 'string' &&
            audMovItf.datosNuevos.glosa.length > 0,
          'auditoria_log de movimientos_tesoreria debe conservar glosa'
        );
      }
    );

    // ------------------------------------------------------------------
    // B4. Cheques, Control Tributario, Cadena Auditoría, RBAC/RLS e Invariancia Cartera
    // ------------------------------------------------------------------
    await ejecutarCaso(
      'B4. Cheques, /alertas-control (ITF 0.005%, Ley 28194, vencido >30d), invariancia Cartera, auditoria_log, RLS y RBAC',
      async () => {
        // 1) Ciclo de cheque: POST -> ENTREGADO -> COBRADO vinculado a extracto; COBRADO -> GIRADO (409)
        const crearChequeRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cheques`,
          sesionAsistente.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaCtrlId,
            anexoId: anexoProv1Id,
            numeroCheque: '000451',
            beneficiario: 'SERVICIOS LOGISTICOS LIMA SAC',
            moneda: 'PEN',
            monto: '1200.00',
            fechaGiro: '2026-02-15',
            esNoNegociable: true,
          }
        );
        assert.equal(crearChequeRes.status, 201, `Error crear cheque: ${crearChequeRes.text}`);
        assert.equal(crearChequeRes.body?.data?.estado, 'GIRADO');
        assert.equal(crearChequeRes.body?.data?.fechaVencimiento, '2026-03-17');
        chequeCicloId = crearChequeRes.body.data.id;

        const entregarRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cheques/${chequeCicloId}/estado`,
          sesionAsistente.accessToken,
          'PUT',
          { estado: 'ENTREGADO', fechaEntrega: '2026-02-18' }
        );
        assert.equal(entregarRes.status, 200);
        assert.equal(entregarRes.body?.data?.estado, 'ENTREGADO');

        const cobrarRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cheques/${chequeCicloId}/estado`,
          sesionSenior.accessToken,
          'PUT',
          {
            estado: 'COBRADO',
            fechaCobro: '2026-03-20',
            extractoLineaId: linChequeCobradoId,
          }
        );
        assert.equal(cobrarRes.status, 200);
        assert.equal(cobrarRes.body?.data?.estado, 'COBRADO');
        assert.equal(cobrarRes.body?.data?.extractoLineaId, linChequeCobradoId);

        const transInvalidaRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cheques/${chequeCicloId}/estado`,
          sesionSenior.accessToken,
          'PUT',
          { estado: 'GIRADO' }
        );
        assert.equal(transInvalidaRes.status, 409);
        assert.equal(transInvalidaRes.body?.details?.codigo, 'TRANSICION_CHEQUE_INVALIDA');

        // [B-03] Rechazo 409 CHEQUE_VINCULO_DUPLICADO al intentar vincular otro cheque a la misma línea de extracto
        const dupVinculoPostRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cheques`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaCtrlId,
            anexoId: anexoProv1Id,
            numeroCheque: '000499',
            beneficiario: 'SERVICIOS LOGISTICOS LIMA SAC',
            moneda: 'PEN',
            monto: '1200.00',
            fechaGiro: '2026-03-20',
            extractoLineaId: linChequeCobradoId,
          }
        );
        assert.equal(dupVinculoPostRes.status, 409);
        assert.equal(dupVinculoPostRes.body?.details?.codigo, 'CHEQUE_VINCULO_DUPLICADO');

        // 2) Segundo cheque vencido (> 30 días al 2026-03-31) y sin cláusula NO NEGOCIABLE (>= 2000 PEN)
        const chequeVencidoRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cheques`,
          sesionSenior.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaCtrlId,
            anexoId: anexoProv1Id,
            numeroCheque: '000452',
            beneficiario: 'SERVICIOS LOGISTICOS LIMA SAC',
            moneda: 'PEN',
            monto: '2200.00',
            fechaGiro: '2026-02-10',
            esNoNegociable: false,
          }
        );
        assert.equal(chequeVencidoRes.status, 201);
        const chequeVencidoId = chequeVencidoRes.body.data.id as string;

        const listarChequesRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cheques?cuentaFinancieraId=${cuentaCtrlId}`,
          sesionAuditor.accessToken,
          'GET'
        );
        assert.equal(listarChequesRes.status, 200);
        assert.equal((listarChequesRes.body?.data as any[]).length, 2);

        // 3) GET /alertas-control detecta desviación ITF 0.005%, Ley 28194 y cheque vencido > 30 días
        const alertasRes = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/alertas-control?cuentaFinancieraId=${cuentaCtrlId}&periodo=2026-03`,
          sesionAuditor.accessToken,
          'GET'
        );
        assert.equal(alertasRes.status, 200, `Error alertas-control: ${alertasRes.text}`);
        const alertas = alertasRes.body.data;
        assert.ok(
          (alertas.itfPendientes as any[]).some((a) =>
            String(a.descripcion).includes('ITF esperado 0.005%')
          ),
          'Debe detectar desviación de ITF esperado 0.005% vs cobrado'
        );
        assert.ok(
          (alertas.alertasBancarizacion as any[]).some(
            (b) => b.referenciaId === movEfectivoCritId && b.severidad === 'CRITICA'
          ),
          'Debe detectar alerta CRITICA de bancarización Ley 28194 (efectivo >= 2000 PEN)'
        );
        assert.ok(
          (alertas.chequesAntiguedad as any[]).some(
            (c) =>
              c.chequeId === chequeVencidoId &&
              c.diasTranscurridos > 30 &&
              c.vencidoPlazoLegal === true
          ),
          'Debe detectar cheque vencido > 30 días'
        );

        // 4) Invariancia de Cartera / Antigüedad de Saldos (cuentas_por_cobrar & cuentas_por_pagar + analisisCuentaService)
        const antiguedad1212 = await conContextoEmpresa(empA, usrAdmin, () =>
          analisisCuentaService.obtenerAntiguedadSaldos(empA, '2026-03', '1212')
        );
        const sumaTramos1212 = Number(
          (
            antiguedad1212.totalTramo0_30 +
            antiguedad1212.totalTramo31_60 +
            antiguedad1212.totalTramo61_90 +
            antiguedad1212.totalTramoMas90
          ).toFixed(2)
        );
        assert.equal(antiguedad1212.totalSaldo, sumaTramos1212);
        assert.equal(antiguedad1212.totalSaldo, 1000); // cxc4 (800) + cxc5 (200)

        const controles = await conContextoEmpresa(empA, usrAdmin, () =>
          analisisCuentaService.obtenerCuentasControl(empA, '2026-03')
        );
        const ctrl1212 = controles.find((c) => c.codigoCuenta === '1212')!;
        assert.equal(ctrl1212.estado, 'CUADRADO');
        assert.equal(ctrl1212.diferencia, 0);
        assert.equal(ctrl1212.saldoAuxiliar, 1000);

        const ctrl4212 = controles.find((c) => c.codigoCuenta === '4212')!;
        assert.equal(ctrl4212.estado, 'CUADRADO');
        assert.equal(ctrl4212.diferencia, 0);
        assert.equal(ctrl4212.saldoAuxiliar, 0);

        // 5) Cadena de auditoría íntegra
        const checkAud = await conContextoEmpresa(empA, usrAdmin, () =>
          auditoriaChainService.verificarIntegridad(empA)
        );
        assert.equal(checkAud.valido, true, `Cadena de auditoría corrupta: ${checkAud.mensaje}`);
        assert.ok(checkAud.totalRegistros >= 10);

        // 6) Aislamiento RLS multiempresa (403 cruzado y 404 con IDs ajenos en ruta propia)
        const crossSug = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cartera/sugerencias/${linParcialId}`,
          sesionSoloB.accessToken,
          'GET'
        );
        assert.equal(crossSug.status, 403);

        const crossAlertas = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/alertas-control?cuentaFinancieraId=${cuentaCtrlId}&periodo=2026-03`,
          sesionSoloB.accessToken,
          'GET'
        );
        assert.equal(crossAlertas.status, 403);

        const bSugA = await apiFetch(
          `/empresas/${empB}/conciliacion-v2/cartera/sugerencias/${linRollbackSaldosId}`,
          sesionSoloB.accessToken,
          'GET'
        );
        assert.equal(bSugA.status, 404);

        const bUpdTplA = await apiFetch(
          `/empresas/${empB}/conciliacion-v2/plantillas-asiento/${plantillaCustomId}`,
          sesionSoloB.accessToken,
          'PUT',
          { nombre: 'Intento RLS' }
        );
        assert.equal(bUpdTplA.status, 404);

        const bChequeA = await apiFetch(
          `/empresas/${empB}/conciliacion-v2/cheques/${chequeCicloId}/estado`,
          sesionSoloB.accessToken,
          'PUT',
          { estado: 'ANULADO' }
        );
        assert.equal(bChequeA.status, 404);

        const bAlertasCuentaA = await apiFetch(
          `/empresas/${empB}/conciliacion-v2/alertas-control?cuentaFinancieraId=${cuentaCtrlId}&periodo=2026-03`,
          sesionSoloB.accessToken,
          'GET'
        );
        assert.equal(bAlertasCuentaA.status, 404);

        // 7) RBAC estricto
        // ASISTENTE_CONTABLE no puede crear/editar/eliminar plantillas de asiento -> 403
        const asisPostTpl = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/plantillas-asiento`,
          sesionAsistente.accessToken,
          'POST',
          {
            codigo: 'NO_PERMITIDO_ASIS',
            nombre: 'No Permitido',
            tipoOperacion: 'OTRO',
            cuentaContrapartidaCodigo: '6391',
            glosaPlantilla: 'Bloqueado',
          }
        );
        assert.equal(asisPostTpl.status, 403);

        const asisDelTpl = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/plantillas-asiento/${plantillaCustomId}`,
          sesionAsistente.accessToken,
          'DELETE'
        );
        assert.equal(asisDelTpl.status, 403);

        // Lector (AUDITOR_REVISOR): 200 en lecturas, 403 en mutaciones
        const audSug = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cartera/sugerencias/${linRollbackSaldosId}`,
          sesionAuditor.accessToken,
          'GET'
        );
        assert.equal(audSug.status, 200);

        const audTpl = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/plantillas-asiento`,
          sesionAuditor.accessToken,
          'GET'
        );
        assert.equal(audTpl.status, 200);

        const audMutCartera = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cartera/aplicar`,
          sesionAuditor.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaId: linRollbackSaldosId,
            tipoCartera: 'CXC',
            esAnticipo: true,
          }
        );
        assert.equal(audMutCartera.status, 403);

        const audMutPlantilla = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/plantillas-asiento`,
          sesionAuditor.accessToken,
          'POST',
          {
            codigo: 'AUD_BLOQ',
            nombre: 'Bloqueado',
            tipoOperacion: 'OTRO',
            glosaPlantilla: 'Bloqueado',
          }
        );
        assert.equal(audMutPlantilla.status, 403);

        const audMutPreview = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/asientos/previsualizar`,
          sesionAuditor.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaId: linInteresIngId,
            tipoOperacion: 'OTRO',
            cuentaContrapartidaCodigo: '7793',
          }
        );
        assert.equal(audMutPreview.status, 403);

        const audMutGenerar = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/asientos/generar`,
          sesionAuditor.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            extractoLineaId: linInteresIngId,
            tipoOperacion: 'OTRO',
            confirmadoVistaPrevia: true,
            hashVistaPrevia: 'x',
          }
        );
        assert.equal(audMutGenerar.status, 403);

        const audMutCheque = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cheques`,
          sesionAuditor.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaCtrlId,
            numeroCheque: '999999',
            beneficiario: 'NO PERMITIDO',
            monto: '100.00',
            fechaGiro: '2026-03-10',
          }
        );
        assert.equal(audMutCheque.status, 403);

        const audMutChequeEst = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cheques/${chequeVencidoId}/estado`,
          sesionAuditor.accessToken,
          'PUT',
          { estado: 'ANULADO' }
        );
        assert.equal(audMutChequeEst.status, 403);
      }
    );
  } finally {
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    }

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
          [`DELETE FROM cheques_bancarios WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM conciliacion_plantillas_asiento WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM aplicaciones_cobranza WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM aplicaciones_pago WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM cuentas_por_cobrar WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM cuentas_por_pagar WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM comprobantes_venta WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM comprobantes_compra WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM conciliacion_item WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM conciliacion_grupo WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM conciliaciones_bancarias WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM extracto_lineas WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM extracto_import WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM extractos_bancarios WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM movimientos_tesoreria WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM conciliacion_config_empresa WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM cuentas_financieras WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM anexos WHERE empresa_id = $1`, [empId]],
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
            // Ignorar tablas protegidas por triggers append-only (auditoria_log, asientos contabilizados)
          }
        }
      }

      for (const uid of [usrAdmin, usrSenior, usrAsistente, usrAuditor, usrSoloB]) {
        await cleanClient.query(
          `SELECT set_config('app.usuario_id', $1, false), set_config('app.current_user_id', $1, false)`,
          [uid]
        );
        try {
          await cleanClient.query(`DELETE FROM refresh_tokens WHERE usuario_id = $1`, [uid]);
          await cleanClient.query(`DELETE FROM usuario_empresa WHERE usuario_id = $1`, [uid]);
        } catch {
          // Ignorar si ya fue limpiado
        }
      }

      for (const [sql, params] of [
        [`DELETE FROM empresas WHERE id = ANY($1::uuid[])`, [[empA, empB]]],
        [
          `DELETE FROM usuarios_estudio WHERE id = ANY($1::uuid[])`,
          [[usrAdmin, usrSenior, usrAsistente, usrAuditor, usrSoloB]],
        ],
        [`DELETE FROM tenants WHERE id = $1`, [tenantId]],
      ] as const) {
        try {
          await cleanClient.query(sql, [...params]);
        } catch {
          // Tablas inmutables conservan trazas de prueba con UUID único
        }
      }
    } finally {
      cleanClient.release();
    }

    setPostgresPool(null, false);
    await pool.end();
  }
}

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
    `🎉 CONCILIACIÓN BANCARIA V2 FASE 4: ${casosPasados}/${totalCasos} casos aprobados`
  );
  console.log('====================================================================');
}

main().catch((err) => {
  console.error('\n❌ FALLO EN SUITE CONCILIACIÓN V2 FASE 4:', err);
  process.exitCode = 1;
});
