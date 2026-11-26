import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { parse } from 'dotenv';
import type ExcelJSType from 'exceljs';
import * as ExcelJSNamespace from 'exceljs';
import express from 'express';
import { Pool, type PoolClient } from 'pg';
import type { ReporteConciliacionOficialV2 } from '../types/conciliacionV2';

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

function obtenerExcelJs(): typeof ExcelJSType {
  const ns = ExcelJSNamespace as unknown as {
    Workbook?: typeof ExcelJSType.Workbook;
    default?: typeof ExcelJSType;
  };
  if (ns?.Workbook) {
    return ns as unknown as typeof ExcelJSType;
  }
  if (ns?.default?.Workbook) {
    return ns.default;
  }
  throw new Error('No se pudo inicializar ExcelJS en la suite de pruebas.');
}

function resolverTestDatabaseUrl(): string {
  const localEnv = existsSync('.env') ? parse(readFileSync('.env', 'utf8')) : {};
  const url =
    process.env.TEST_DATABASE_URL ??
    localEnv.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    localEnv.DATABASE_URL;
  assert.ok(
    url,
    'TEST_DATABASE_URL (o DATABASE_URL apuntando a atlob_test) requerida en entorno o .env.'
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

async function verificarLibroExcelSanitizado(
  buffer: Buffer,
  textosMaliciososEsperados: string[]
): Promise<void> {
  const ExcelJS = obtenerExcelJs();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  assert.ok(wb.worksheets.length >= 5, 'El libro XLSX oficial debe contener las 5 hojas.');

  const textosEncontrados = new Set<string>();

  for (const ws of wb.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        assert.notEqual(
          cell.type,
          ExcelJS.ValueType.Formula,
          `Ninguna celda debe ser fórmula ejecutable en hoja "${ws.name}" (${cell.address}).`
        );
        if (
          cell.value &&
          typeof cell.value === 'object' &&
          !(cell.value instanceof Date) &&
          'formula' in cell.value
        ) {
          assert.fail(`Se detectó objeto fórmula en hoja "${ws.name}" (${cell.address}).`);
        }

        if (typeof cell.value === 'string') {
          const val = cell.value;
          const trimmed = val.trimStart();
          assert.equal(
            ['=', '+', '-', '@', '\t', '\r'].includes(trimmed[0] ?? ''),
            false,
            `Celda sin sanitizar en hoja "${ws.name}" (${cell.address}): "${val}"`
          );
          for (const malicioso of textosMaliciososEsperados) {
            if (val === `'${malicioso}`) {
              textosEncontrados.add(malicioso);
            }
          }
        }
      });
    });
  }

  for (const malicioso of textosMaliciososEsperados) {
    assert.ok(
      textosEncontrados.has(malicioso),
      `El texto sanitizado "'${malicioso}" debe aparecer explícitamente en el XLSX.`
    );
  }
}

// ============================================================================
// BLOQUE A — PRUEBAS UNITARIAS PURAS (SIN POSTGRESQL) — ESCENARIO 7
// ============================================================================

async function ejecutarBloqueUnitario() {
  const {
    sanitizarCeldaExcel,
    generarReporteConciliacionExcel,
    generarReporteConciliacionPdfBuffer,
  } = await import('../services/conciliacion/reportes/conciliacionReporteService');
  const { calcularResumenNumericoConciliacionV2 } = await import(
    '../services/conciliacionV2Service'
  );

  console.log('\n====================================================================');
  console.log('🧪 BLOQUE A — UNITARIAS FASE 6 (SANITIZACIÓN EXCEL, PDF 1.4 Y CUADRE)');
  console.log('====================================================================');

  await ejecutarCaso(
    '7.1. sanitizarCeldaExcel escapa prefijos peligrosos (=, +, -, @, \\t, \\r) y preserva valores seguros',
    () => {
      assert.equal(sanitizarCeldaExcel("=CMD|'/C calc'!A0"), "'=CMD|'/C calc'!A0");
      assert.equal(sanitizarCeldaExcel('+1+1'), "'+1+1");
      assert.equal(sanitizarCeldaExcel('-2+3'), "'-2+3");
      assert.equal(sanitizarCeldaExcel('@SUM(1,1)'), "'@SUM(1,1)");
      assert.equal(sanitizarCeldaExcel('   =1+1'), "'   =1+1");
      assert.equal(sanitizarCeldaExcel('\t=HYPERLINK("x")'), "'\t=HYPERLINK(\"x\")");
      assert.equal(sanitizarCeldaExcel('\r+10'), "'\r+10");

      assert.equal(sanitizarCeldaExcel('Pago factura F001-00010'), 'Pago factura F001-00010');
      assert.equal(sanitizarCeldaExcel(1250.5), 1250.5);
      assert.equal(sanitizarCeldaExcel(true), true);
      assert.equal(sanitizarCeldaExcel(null), '');
      assert.equal(sanitizarCeldaExcel(undefined), '');
      assert.equal(sanitizarCeldaExcel(''), '');
    }
  );

  await ejecutarCaso(
    '7.2. Generación pura XLSX (anti-fórmulas) y PDF 1.4 (%PDF-1.4, %%EOF, 3 firmas) sin PostgreSQL',
    async () => {
      const hashDummy = 'a'.repeat(64);
      const reporteSintetico: ReporteConciliacionOficialV2 = {
        generadoEn: '2026-03-31T23:59:59.000Z',
        hashReporteSha256: hashDummy,
        empresa: {
          id: '00000000-0000-4000-8000-000000000010',
          ruc: '20991112223',
          razonSocial: 'EMPRESA SINTETICA FASE 6 SAC',
          domicilioFiscal: 'Av. Prueba 600',
        },
        cuenta: {
          id: '00000000-0000-4000-8000-000000000020',
          empresaId: '00000000-0000-4000-8000-000000000010',
          tipo: 'BANCO',
          banco: 'BCP',
          numero: '193-000600-F6',
          moneda: 'PEN',
          cci: null,
          alias: 'Cuenta Principal',
          cuentaContableId: '00000000-0000-4000-8000-000000000030',
          cuentaContableCodigo: '10411',
          cuentaContableNombre: 'Banco BCP MN',
          requiereVinculacionContable: false,
          saldoInicial: '0.00',
          saldoActual: '1150.00',
          activa: true,
        },
        periodo: '2026-03',
        fechaInicio: '2026-03-01',
        fechaFin: '2026-03-31',
        estado: 'CERRADA',
        fechaCorte: '2026-03-31',
        cierreOficial: {
          cierreHistorialId: '00000000-0000-4000-8000-000000000040',
          numeroSecuencia: 1,
          fechaCierre: '2026-03-31T23:59:00.000Z',
          cerradaPor: '00000000-0000-4000-8000-000000000050',
          cerradaPorEmail: 'admin.f6@atlob.test',
          hashSnapshotSha256: 'b'.repeat(64),
        },
        cuadre: {
          saldoInicialExtracto: '0.00',
          saldoFinalExtracto: '1050.00',
          depositosEnTransito: '250.00',
          chequesNoCobrados: '100.00',
          saldoAjustadoBanco: '1200.00',
          saldoLibros: '1150.00',
          abonosNoRegistrados: '80.00',
          cargosNoRegistrados: '30.00',
          saldoAjustadoLibros: '1200.00',
          diferencia: '0.00',
          semaforo: 'VERDE',
          toleranciaMonto: '5.00',
        },
        integridadMayor: {
          verificada: true,
          cuentaContableId: '00000000-0000-4000-8000-000000000030',
          cuentaContableCodigo: '10411',
          saldoTesoreria: '1150.00',
          saldoMayor104x: '1150.00',
          diferenciaIntegridadMayor: '0.00',
          alertaIntegridad: false,
          motivoAlerta: null,
        },
        conteos: {
          totalExtracto: 3,
          conciliadasExtracto: 1,
          pendientesLibros: 2,
          totalLibros: 3,
          conciliadosLibros: 1,
          pendientesBanco: 1,
          chequesNoCobrados: 1,
        },
        anexos: {
          depositosEnTransito: [
            {
              id: '00000000-0000-4000-8000-000000000101',
              periodoId: '00000000-0000-4000-8000-000000000102',
              cuentaFinancieraId: '00000000-0000-4000-8000-000000000020',
              fecha: '2026-03-28',
              tipo: 'INGRESO',
              medioPago: '003',
              numeroOperacion: 'OP-F6-01',
              moneda: 'PEN',
              tipoCambio: '1.0000',
              importe: '250.00',
              importeConSigno: '250.00',
              glosa: "=CMD|'/C calc'!A0",
              estado: 'REGISTRADO',
              conciliado: false,
              estadoLibroV2: 'PENDIENTE_BANCO',
              asientoId: null,
            },
          ],
          chequesNoCobrados: [
            {
              id: '00000000-0000-4000-8000-000000000103',
              periodoId: '00000000-0000-4000-8000-000000000102',
              cuentaFinancieraId: '00000000-0000-4000-8000-000000000020',
              fecha: '2026-03-29',
              tipo: 'EGRESO',
              medioPago: '007',
              numeroOperacion: 'CHQ-001',
              moneda: 'PEN',
              tipoCambio: '1.0000',
              importe: '100.00',
              importeConSigno: '-100.00',
              glosa: '+1+1',
              estado: 'REGISTRADO',
              conciliado: false,
              estadoLibroV2: 'CHEQUE_NO_COBRADO',
              asientoId: null,
            },
          ],
          abonosNoRegistrados: [
            {
              id: '00000000-0000-4000-8000-000000000104',
              extractoId: '00000000-0000-4000-8000-000000000105',
              fecha: '2026-03-30',
              descripcion: '-2+3',
              referencia: 'EXT-AB-1',
              monto: '80.00',
              saldo: '1080.00',
              conciliada: false,
              estadoConciliacion: 'PENDIENTE_LIBROS',
              movimientoTesoreriaId: null,
              diferenciaImporte: '0.00',
              observacionConciliacion: null,
              conciliadoEn: null,
            },
          ],
          cargosNoRegistrados: [
            {
              id: '00000000-0000-4000-8000-000000000106',
              extractoId: '00000000-0000-4000-8000-000000000105',
              fecha: '2026-03-31',
              descripcion: '@SUM(1,1)',
              referencia: 'EXT-CG-1',
              monto: '-30.00',
              saldo: '1050.00',
              conciliada: false,
              estadoConciliacion: 'PENDIENTE_LIBROS',
              movimientoTesoreriaId: null,
              diferenciaImporte: '0.00',
              observacionConciliacion: null,
              conciliadoEn: null,
            },
          ],
          chequesControlDetalle: [],
        },
        partidasConciliadasResumen: {
          totalExtractoConciliadas: 1,
          montoExtractoConciliadas: '1000.00',
          totalLibrosConciliados: 1,
          montoLibrosConciliados: '1000.00',
        },
      };

      const xlsxBuffer = await generarReporteConciliacionExcel(reporteSintetico);
      assert.ok(Buffer.isBuffer(xlsxBuffer) && xlsxBuffer.length > 1000);
      await verificarLibroExcelSanitizado(xlsxBuffer, [
        "=CMD|'/C calc'!A0",
        '+1+1',
        '-2+3',
        '@SUM(1,1)',
      ]);

      const pdfBuffer = generarReporteConciliacionPdfBuffer(reporteSintetico);
      const pdfTexto = pdfBuffer.toString('latin1');
      assert.ok(pdfTexto.startsWith('%PDF-1.4'), 'PDF debe iniciar con %PDF-1.4');
      assert.ok(pdfTexto.trimEnd().endsWith('%%EOF'), 'PDF debe terminar con %%EOF');
      assert.ok(pdfTexto.includes('Elaborado por'), 'PDF debe incluir firma Elaborado por');
      assert.ok(pdfTexto.includes('Revisado por'), 'PDF debe incluir firma Revisado por');
      assert.ok(pdfTexto.includes('Aprobado por'), 'PDF debe incluir firma Aprobado por');

      const amarillo = calcularResumenNumericoConciliacionV2({
        tieneExtracto: true,
        saldoFinalExtracto: '1052.00',
        saldoLibros: '1150.00',
        depositosEnTransito: '250.00',
        chequesNoCobrados: '100.00',
        abonosNoRegistrados: '80.00',
        cargosNoRegistrados: '30.00',
        toleranciaMonto: '5.00',
      });
      assert.equal(amarillo.diferencia, '2.00');
      assert.equal(amarillo.semaforo, 'AMARILLO');
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
  console.log('🐘 BLOQUE B — INTEGRACIÓN REAL FASE 6 EN POSTGRESQL (atlob_test)');
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

  const { conciliacionV2Service } = await import('../services/conciliacionV2Service');
  const {
    construirReporteConciliacionOficial,
    generarReporteConciliacionExcel,
    generarReporteConciliacionPdfBuffer,
  } = await import('../services/conciliacion/reportes/conciliacionReporteService');
  const { exportarLibro010200DesdePostgres } = await import('../services/pleExportService');
  const { archivoValidadorService } = await import('../services/archivoValidadorService');
  const { auditoriaRepository } = await import('../repositories/auditoriaRepository');
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
  const per202603A = randomUUID();
  const per202603B = randomUUID();

  const sub03A = randomUUID();
  const sub04A = randomUUID();
  const sub05A = randomUUID();
  const sub05B = randomUUID();

  const cta10411A = randomUUID();
  const cta1212A = randomUUID();
  const cta4212A = randomUUID();
  const cta6391A = randomUUID();
  const cta6412A = randomUUID();
  const cta67311A = randomUUID();
  const cta70111A = randomUUID();
  const cta7793A = randomUUID();
  const cta10411B = randomUUID();

  const cuentaAId = randomUUID();
  const cuentaBId = randomUUID();

  const anexoCliId = randomUUID();
  const anexoProvId = randomUUID();

  const asientoConcId = randomUUID();
  const asientoDepTransId = randomUUID();
  const asientoCheqPendId = randomUUID();

  const movConcId = randomUUID();
  const movDepTransId = randomUUID();
  const movCheqPendId = randomUUID();

  const extAId = randomUUID();
  const linConcId = randomUUID();
  const linAbonoPendId = randomUUID();
  const linCargoPendId = randomUUID();

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
        [tenantId, `Tenant Concil V2 F6 ${sufijo}`, `concil-f6-${sufijo}`]
      );

      await seedClient.query(
        `INSERT INTO usuarios_estudio (id, email, password_hash, nombre, rol_global, is_active)
         VALUES
           ($1, $6,  $11, 'Admin F6',     'ADMINISTRADOR',      true),
           ($2, $7,  $11, 'Senior F6',    'CONTADOR_SENIOR',    true),
           ($3, $8,  $11, 'Asistente F6', 'ASISTENTE_CONTABLE', true),
           ($4, $9,  $11, 'Auditor F6',   'AUDITOR_REVISOR',    true),
           ($5, $10, $11, 'Solo B F6',    'ADMINISTRADOR',      true)`,
        [
          usrAdmin,
          usrSenior,
          usrAsistente,
          usrAuditor,
          usrSoloB,
          `admin.f6.${sufijo}@atlob.test`,
          `senior.f6.${sufijo}@atlob.test`,
          `asistente.f6.${sufijo}@atlob.test`,
          `auditor.f6.${sufijo}@atlob.test`,
          `solob.f6.${sufijo}@atlob.test`,
          hashDummy,
        ]
      );

      await seedClient.query(
        `INSERT INTO empresas (id, tenant_id, codigo_empresa, ruc, razon_social, regimen_tributario, domicilio_fiscal, moneda_principal, is_active)
         VALUES
           ($1, $3, $4, $6, 'EMPRESA CONCIL F6 A SAC', 'REGIMEN_GENERAL', 'Av. F6 A 100', 'PEN', true),
           ($2, $3, $5, $7, 'EMPRESA CONCIL F6 B SAC', 'REGIMEN_GENERAL', 'Av. F6 B 200', 'PEN', true)`,
        [empA, empB, tenantId, `EMP-F6A-${sufijo}`, `EMP-F6B-${sufijo}`, rucA, rucB]
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
         VALUES ($1, $2, $3, 2026, 3, '2026-03', 'ABIERTO')`,
        [per202603A, empA, ej2026A]
      );
      await seedClient.query(
        `INSERT INTO subdiarios (id, empresa_id, codigo, descripcion, tipo, is_active)
         VALUES
           ($1, $4, '03', 'COBRANZAS F6', 'COBRANZAS', true),
           ($2, $4, '04', 'PAGOS F6',     'PAGOS',     true),
           ($3, $4, '05', 'BANCOS F6',    'BANCOS',    true)`,
        [sub03A, sub04A, sub05A, empA]
      );

      await seedClient.query(
        `INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento, is_active)
         VALUES
           ($1, $9, '10411', 'Banco BCP F6 MN',                5, 'ACTIVO',  true, true),
           ($2, $9, '1212',  'Facturas por cobrar emitidas',   4, 'ACTIVO',  true, true),
           ($3, $9, '4212',  'Facturas por pagar emitidas',    4, 'PASIVO',  true, true),
           ($4, $9, '6391',  'Gastos y comisiones bancarias',  4, 'GASTO',   true, true),
           ($5, $9, '6412',  'ITF',                            4, 'GASTO',   true, true),
           ($6, $9, '67311', 'Intereses por prestamos',        5, 'GASTO',   true, true),
           ($7, $9, '70111', 'Ventas mercaderias terceros',    5, 'INGRESO', true, true),
           ($8, $9, '7793',  'Otros ingresos financieros',     4, 'INGRESO', true, true)`,
        [cta10411A, cta1212A, cta4212A, cta6391A, cta6412A, cta67311A, cta70111A, cta7793A, empA]
      );

      await seedClient.query(
        `INSERT INTO cuentas_financieras (
           id, empresa_id, tipo, banco, numero, moneda, cuenta_contable_codigo, cuenta_contable_id, saldo_inicial, saldo_actual, activa
         ) VALUES ($1, $2, 'BANCO', 'BCP', '193-996001-F6', 'PEN', '10411', $3, 0.00, 1150.00, true)`,
        [cuentaAId, empA, cta10411A]
      );

      // Tolerancia = 5.00 para probar que incluso dentro de tolerancia (AMARILLO) el cierre exige diferencia = 0.00
      await seedClient.query(
        `INSERT INTO conciliacion_config_empresa (
           empresa_id, conciliacion_v2_habilitada, tolerancia_dias, tolerancia_monto, umbral_auto_match,
           cuenta_itf_codigo, cuenta_comision_codigo, cuenta_interes_gasto_codigo, cuenta_interes_ingreso_codigo
         ) VALUES ($1, true, 3, 5.00, 0.9000, '6412', '6391', '67311', '7793')`,
        [empA]
      );

      await seedClient.query(
        `INSERT INTO anexos (id, empresa_id, tipo_documento, numero_documento, razon_social, tipo_entidad)
         VALUES
           ($1, $3, '6', '20601234567', 'CLIENTE ANDINO F6 SAC',     'CLIENTE'),
           ($2, $3, '6', '20517654321', 'PROVEEDOR SUR F6 EIRL',     'PROVEEDOR')`,
        [anexoCliId, anexoProvId, empA]
      );

      // Asientos contabilizados + movimientos tesorería (saldo libros = 1000 + 250 - 100 = 1150.00)
      const asientosSeed = [
        {
          asientoId: asientoConcId,
          subId: sub03A,
          num: '03030001',
          cuo: `CUO-F6-1-${sufijo}`,
          fecha: '2026-03-05',
          glosa: 'Cobranza factura F001-00010',
          esIngreso: true,
          contraId: cta1212A,
          anexoId: anexoCliId,
          monto: 1000.0,
        },
        {
          asientoId: asientoDepTransId,
          subId: sub03A,
          num: '03030002',
          cuo: `CUO-F6-2-${sufijo}`,
          fecha: '2026-03-28',
          glosa: "=CMD|'/C calc'!A0",
          esIngreso: true,
          contraId: cta1212A,
          anexoId: anexoCliId,
          monto: 250.0,
        },
        {
          asientoId: asientoCheqPendId,
          subId: sub04A,
          num: '04030001',
          cuo: `CUO-F6-3-${sufijo}`,
          fecha: '2026-03-29',
          glosa: '+1+1',
          esIngreso: false,
          contraId: cta4212A,
          anexoId: anexoProvId,
          monto: 100.0,
        },
      ];

      for (const a of asientosSeed) {
        await seedClient.query(
          `INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, numero, cuo, fecha, glosa, moneda, estado)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PEN', 'BORRADOR')`,
          [a.asientoId, empA, per202603A, a.subId, a.num, a.cuo, a.fecha, a.glosa]
        );
        await seedClient.query(
          `INSERT INTO asiento_detalle (id, asiento_id, empresa_id, linea, cuenta_id, anexo_id, debe, haber, glosa_linea)
           VALUES
             ($1, $3, $4, 1, $5, $7, $8, $9, $10),
             ($2, $3, $4, 2, $6, $7, $9, $8, $10)`,
          [
            randomUUID(),
            randomUUID(),
            a.asientoId,
            empA,
            cta10411A,
            a.contraId,
            a.anexoId,
            a.esIngreso ? a.monto : 0.0,
            a.esIngreso ? 0.0 : a.monto,
            a.glosa,
          ]
        );
        await seedClient.query(`UPDATE asientos SET estado = 'CONTABILIZADO' WHERE id = $1`, [
          a.asientoId,
        ]);
      }

      await seedClient.query(
        `INSERT INTO movimientos_tesoreria (
           id, empresa_id, periodo_id, cuenta_financiera_id, fecha, tipo, medio_pago,
           numero_operacion, moneda, tipo_cambio, importe, glosa, estado, conciliado,
           asiento_id, anexo_id
         ) VALUES
           ($1, $4, $5, $6, '2026-03-05', 'INGRESO', '003', 'OP-F6-001', 'PEN', 1.0000, 1000.00, 'Cobranza factura F001-00010', 'REGISTRADO', true,  $7,  $10),
           ($2, $4, $5, $6, '2026-03-28', 'INGRESO', '003', 'OP-F6-002', 'PEN', 1.0000, 250.00,  $12,                           'REGISTRADO', false, $8,  $10),
           ($3, $4, $5, $6, '2026-03-29', 'EGRESO',  '007', 'CHQ-F6-01', 'PEN', 1.0000, 100.00,  '+1+1',                        'REGISTRADO', false, $9,  $11)`,
        [
          movConcId,
          movDepTransId,
          movCheqPendId,
          empA,
          per202603A,
          cuentaAId,
          asientoConcId,
          asientoDepTransId,
          asientoCheqPendId,
          anexoCliId,
          anexoProvId,
          "=CMD|'/C calc'!A0",
        ]
      );

      // Extracto bancario: inicialmente con saldo_final = 1060.00 (diferencia = +10.00 > tolerancia 5.00 -> ROJO)
      await seedClient.query(
        `INSERT INTO extractos_bancarios (
           id, empresa_id, cuenta_financiera_id, nombre_archivo, fecha_corte_desde, fecha_corte_hasta,
           saldo_inicial, saldo_final, hash_archivo, estado
         ) VALUES ($1, $2, $3, 'ext_f6_202603.csv', '2026-03-01', '2026-03-31', 0.00, 1060.00, $4, 'CARGADO')`,
        [extAId, empA, cuentaAId, `hash-ext-f6-${sufijo}`]
      );

      await seedClient.query(
        `INSERT INTO extracto_lineas (
           id, extracto_id, empresa_id, fecha, descripcion, referencia, monto, saldo,
           conciliada, estado_conciliacion, movimiento_tesoreria_id
         ) VALUES
           ($1, $4, $5, '2026-03-05', 'ABONO FACTURA F001-00010', 'OP-F6-001', 1000.00, 1000.00, true,  'CONCILIADO',       $6),
           ($2, $4, $5, '2026-03-30', '-2+3',                     'EXT-AB-01', 80.00,   1080.00, false, 'PENDIENTE_LIBROS', NULL),
           ($3, $4, $5, '2026-03-31', '@SUM(1,1)',                'EXT-CG-01', -30.00,  1050.00, false, 'PENDIENTE_LIBROS', NULL)`,
        [linConcId, linAbonoPendId, linCargoPendId, extAId, empA, movConcId]
      );
      await seedClient.query('COMMIT');

      // Empresa B aislada
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
         VALUES ($1, $2, '05', 'BANCOS F6 B', 'BANCOS', true)`,
        [sub05B, empB]
      );
      await seedClient.query(
        `INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento, is_active)
         VALUES ($1, $2, '10411', 'Banco BCP F6 B', 5, 'ACTIVO', true, true)`,
        [cta10411B, empB]
      );
      await seedClient.query(
        `INSERT INTO cuentas_financieras (
           id, empresa_id, tipo, banco, numero, moneda, cuenta_contable_codigo, cuenta_contable_id, saldo_inicial, saldo_actual, activa
         ) VALUES ($1, $2, 'BANCO', 'BCP', '193-996099-B', 'PEN', '10411', $3, 0.00, 0.00, true)`,
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
      const arrayBuf = await resp.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const text = buffer.toString('utf8');
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: resp.status, headers: resp.headers, body: json, text, buffer };
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
      `admin.f6.${sufijo}@atlob.test`,
      'Admin F6',
      'ADMINISTRADOR',
      true,
      empA
    );
    const sesionSenior = await emitir(
      usrSenior,
      `senior.f6.${sufijo}@atlob.test`,
      'Senior F6',
      'CONTADOR_SENIOR',
      false,
      empA
    );
    const sesionAsistente = await emitir(
      usrAsistente,
      `asistente.f6.${sufijo}@atlob.test`,
      'Asistente F6',
      'ASISTENTE_CONTABLE',
      false,
      empA
    );
    const sesionAuditor = await emitir(
      usrAuditor,
      `auditor.f6.${sufijo}@atlob.test`,
      'Auditor F6',
      'AUDITOR_REVISOR',
      false,
      empA
    );
    const sesionSoloB = await emitir(
      usrSoloB,
      `solob.f6.${sufijo}@atlob.test`,
      'Solo B F6',
      'ADMINISTRADOR',
      true,
      empB
    );

    let primerHashSnapshot = '';
    let primerCierreHistId = '';

    // ------------------------------------------------------------------
    // ESCENARIO 1: Cierre bloqueado cuando hay diferencia != 0 (fuera y dentro de tolerancia)
    // ------------------------------------------------------------------
    await ejecutarCaso(
      '1. Cierre bloqueado cuando hay diferencia != 0 (fuera y dentro de tolerancia)',
      async () => {
        // 1a) Fuera de tolerancia (saldoFinal = 1060.00 -> diferencia = +10.00 > 5.00 -> ROJO)
        await assert.rejects(
          () =>
            conciliacionV2Service.cerrarConciliacion(empA, usrAdmin, {
              cuentaFinancieraId: cuentaAId,
              periodo: '2026-03',
              fechaCorte: '2026-03-31',
            }),
          (err: any) =>
            err?.codigo === 'DIFERENCIA_CONCILIACION_NO_CERO' && err?.statusCode === 409
        );

        // 1b) Dentro de tolerancia (saldoFinal = 1052.00 -> diferencia = +2.00 <= 5.00 -> AMARILLO)
        await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `UPDATE extractos_bancarios SET saldo_final = 1052.00 WHERE empresa_id = $1 AND id = $2`,
          [empA, extAId]
        );

        const respTol = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/cerrar`,
          sesionAdmin.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            fechaCorte: '2026-03-31',
          }
        );
        assert.equal(respTol.status, 409, `Se esperaba 409 con diferencia +2.00: ${respTol.text}`);
        assert.equal(respTol.body?.details?.codigo, 'DIFERENCIA_CONCILIACION_NO_CERO');

        // Verificar que NO se insertó ningún evento CIERRE en conciliacion_cierres_historial
        const histCountRes = await queryEnEmpresa<{ total: string }>(
          pool,
          empA,
          usrAdmin,
          `SELECT COUNT(*)::text AS total
           FROM conciliacion_cierres_historial
           WHERE empresa_id = $1 AND cuenta_financiera_id = $2`,
          [empA, cuentaAId]
        );
        assert.equal(histCountRes.rows[0].total, '0');

        // Restaurar saldoFinal exacto = 1050.00 para cuadre perfecto (diferencia = 0.00 -> VERDE)
        await queryEnEmpresa(
          pool,
          empA,
          usrAdmin,
          `UPDATE extractos_bancarios SET saldo_final = 1050.00 WHERE empresa_id = $1 AND id = $2`,
          [empA, extAId]
        );
      }
    );

    // ------------------------------------------------------------------
    // ESCENARIO 2: Cierre exitoso inmutable + snapshot SHA-256 + protección trigger
    // ------------------------------------------------------------------
    await ejecutarCaso(
      '2. Cierre exitoso inmutable (#1), snapshot SHA-256 (64 hex) y bloqueo UPDATE/DELETE por trigger PG',
      async () => {
        const resCierre = await conciliacionV2Service.cerrarConciliacion(empA, usrAdmin, {
          cuentaFinancieraId: cuentaAId,
          periodo: '2026-03',
          fechaCorte: '2026-03-31',
        });

        assert.equal(resCierre.estado, 'CERRADA');
        assert.equal(resCierre.diferencia, '0.00');
        assert.equal(resCierre.diferenciaIntegridadMayor, '0.00');
        assert.ok(resCierre.cierreHistorialId);
        assert.match(resCierre.hashSnapshotSha256 ?? '', /^[0-9a-f]{64}$/);

        primerHashSnapshot = resCierre.hashSnapshotSha256!;
        primerCierreHistId = resCierre.cierreHistorialId!;

        const historial = await conciliacionV2Service.listarHistorialCierres(
          empA,
          cuentaAId,
          '2026-03'
        );
        assert.equal(historial.length, 1);
        assert.equal(historial[0].id, primerCierreHistId);
        assert.equal(historial[0].tipoEvento, 'CIERRE');
        assert.equal(historial[0].numeroSecuencia, 1);
        assert.equal(historial[0].hashSnapshotSha256, primerHashSnapshot);

        // Intentar UPDATE directo sobre conciliacion_cierres_historial -> debe fallar por fn_conciliacion_cierres_hist_inmutable
        await assert.rejects(
          () =>
            queryEnEmpresa(
              pool,
              empA,
              usrAdmin,
              `UPDATE conciliacion_cierres_historial
               SET motivo = 'ALTERACION_ILEGAL'
               WHERE empresa_id = $1 AND id = $2`,
              [empA, primerCierreHistId]
            ),
          (err: any) =>
            String(err?.message ?? '').includes('CONCILIACION_CIERRE_HISTORIAL_INMUTABLE')
        );

        // Intentar DELETE directo sobre conciliacion_cierres_historial -> debe fallar por fn_conciliacion_cierres_hist_inmutable
        await assert.rejects(
          () =>
            queryEnEmpresa(
              pool,
              empA,
              usrAdmin,
              `DELETE FROM conciliacion_cierres_historial
               WHERE empresa_id = $1 AND id = $2`,
              [empA, primerCierreHistId]
            ),
          (err: any) =>
            String(err?.message ?? '').includes('CONCILIACION_CIERRE_HISTORIAL_INMUTABLE')
        );
      }
    );

    // ------------------------------------------------------------------
    // ESCENARIO 3: Reapertura solo ADMINISTRADOR y secuencia #2 -> nuevo cierre #3
    // ------------------------------------------------------------------
    await ejecutarCaso(
      '3. Reapertura bloqueada a no-ADMINISTRADOR (403), exitosa para ADMINISTRADOR (#2) y nuevo cierre (#3)',
      async () => {
        for (const sesionNoAdmin of [sesionSenior, sesionAsistente, sesionAuditor]) {
          const respNoAdmin = await apiFetch(
            `/empresas/${empA}/conciliacion-v2/reabrir`,
            sesionNoAdmin.accessToken,
            'POST',
            {
              cuentaFinancieraId: cuentaAId,
              periodo: '2026-03',
              motivo: 'Intento de reapertura sin permisos administrativos',
            }
          );
          assert.equal(
            respNoAdmin.status,
            403,
            `Usuario sin rol ADMINISTRADOR debe recibir 403 al reabrir (recibido ${respNoAdmin.status})`
          );
        }

        // Validación de motivo corto (< 5 caracteres)
        const respMotivoCorto = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/reabrir`,
          sesionAdmin.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            motivo: 'abc',
          }
        );
        assert.equal(respMotivoCorto.status, 400);

        // Reapertura válida por ADMINISTRADOR con motivo >= 10 caracteres
        const motivoValido = 'Reapertura autorizada por revisión de auditoría mensual';
        const respReapertura = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/reabrir`,
          sesionAdmin.accessToken,
          'POST',
          {
            cuentaFinancieraId: cuentaAId,
            periodo: '2026-03',
            motivo: motivoValido,
          }
        );
        assert.equal(respReapertura.status, 200, `Error al reabrir: ${respReapertura.text}`);
        assert.equal(respReapertura.body?.data?.estado, 'ABIERTA');
        assert.equal(respReapertura.body?.data?.motivoReapertura, motivoValido);
        assert.match(respReapertura.body?.data?.hashSnapshotSha256 ?? '', /^[0-9a-f]{64}$/);

        // Nuevo cierre debe crear secuencia #3
        const segundoCierre = await conciliacionV2Service.cerrarConciliacion(empA, usrAdmin, {
          cuentaFinancieraId: cuentaAId,
          periodo: '2026-03',
          fechaCorte: '2026-03-31',
        });
        assert.equal(segundoCierre.estado, 'CERRADA');
        assert.match(segundoCierre.hashSnapshotSha256 ?? '', /^[0-9a-f]{64}$/);

        const historial = await conciliacionV2Service.listarHistorialCierres(
          empA,
          cuentaAId,
          '2026-03'
        );
        assert.equal(historial.length, 3);
        const ordenadoAsc = [...historial].sort((a, b) => a.numeroSecuencia - b.numeroSecuencia);
        assert.deepEqual(
          ordenadoAsc.map((h) => ({ seq: h.numeroSecuencia, tipo: h.tipoEvento })),
          [
            { seq: 1, tipo: 'CIERRE' },
            { seq: 2, tipo: 'REAPERTURA' },
            { seq: 3, tipo: 'CIERRE' },
          ]
        );
        assert.equal(ordenadoAsc[1].motivo, motivoValido);
      }
    );

    // ------------------------------------------------------------------
    // ESCENARIO 4: Reporte Oficial JSON / XLSX / PDF reproducible y sanitizado
    // ------------------------------------------------------------------
    await ejecutarCaso(
      '4. Reporte Oficial JSON idempotente, XLSX sanitizado contra fórmulas y PDF 1.4 con 3 firmas',
      async () => {
        const rep1 = await construirReporteConciliacionOficial(empA, cuentaAId, '2026-03');
        await new Promise((resolve) => setTimeout(resolve, 15));
        const rep2 = await construirReporteConciliacionOficial(empA, cuentaAId, '2026-03');

        assert.equal(rep1.estado, 'CERRADA');
        assert.match(rep1.hashReporteSha256, /^[0-9a-f]{64}$/);
        assert.equal(
          rep1.hashReporteSha256,
          rep2.hashReporteSha256,
          'Construir el reporte oficial dos veces debe producir exactamente el mismo hashReporteSha256'
        );
        assert.equal(rep1.cierreOficial?.numeroSecuencia, 3);
        assert.match(rep1.cierreOficial?.hashSnapshotSha256 ?? '', /^[0-9a-f]{64}$/);
        assert.equal(
          rep1.cierreOficial?.hashSnapshotSha256,
          rep2.cierreOficial?.hashSnapshotSha256
        );

        // Verificar que los 4 textos maliciosos están presentes en los anexos del reporte real
        assert.ok(
          rep1.anexos.depositosEnTransito.some((d) => d.glosa === "=CMD|'/C calc'!A0")
        );
        assert.ok(rep1.anexos.chequesNoCobrados.some((c) => c.glosa === '+1+1'));
        assert.ok(rep1.anexos.abonosNoRegistrados.some((a) => a.descripcion === '-2+3'));
        assert.ok(rep1.anexos.cargosNoRegistrados.some((c) => c.descripcion === '@SUM(1,1)'));

        // XLSX desde servicio + relectura con ExcelJS
        const xlsxBuffer = await generarReporteConciliacionExcel(rep1);
        await verificarLibroExcelSanitizado(xlsxBuffer, [
          "=CMD|'/C calc'!A0",
          '+1+1',
          '-2+3',
          '@SUM(1,1)',
        ]);

        // XLSX por HTTP también debe llegar sanitizado y con header X-Report-Sha256
        const httpXlsx = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/reporte/oficial?cuentaFinancieraId=${cuentaAId}&periodo=2026-03&formato=xlsx`,
          sesionAuditor.accessToken,
          'GET'
        );
        assert.equal(httpXlsx.status, 200);
        assert.equal(httpXlsx.headers.get('x-report-sha256'), rep1.hashReporteSha256);
        await verificarLibroExcelSanitizado(httpXlsx.buffer, [
          "=CMD|'/C calc'!A0",
          '+1+1',
          '-2+3',
          '@SUM(1,1)',
        ]);

        // PDF 1.4 desde servicio + HTTP
        const pdfBuffer = generarReporteConciliacionPdfBuffer(rep1);
        const pdfTexto = pdfBuffer.toString('latin1');
        assert.ok(pdfTexto.startsWith('%PDF-1.4'));
        assert.ok(pdfTexto.trimEnd().endsWith('%%EOF'));
        assert.ok(pdfTexto.includes('Elaborado por'));
        assert.ok(pdfTexto.includes('Revisado por'));
        assert.ok(pdfTexto.includes('Aprobado por'));

        const httpPdf = await apiFetch(
          `/empresas/${empA}/conciliacion-v2/reporte/oficial?cuentaFinancieraId=${cuentaAId}&periodo=2026-03&formato=pdf`,
          sesionAuditor.accessToken,
          'GET'
        );
        assert.equal(httpPdf.status, 200);
        assert.equal(httpPdf.headers.get('content-type'), 'application/pdf');
        assert.ok(httpPdf.buffer.toString('latin1').startsWith('%PDF-1.4'));
      }
    );

    // ------------------------------------------------------------------
    // ESCENARIO 5: PLE 1.2 (010200) desde PG real + validador + aislamiento multiempresa
    // ------------------------------------------------------------------
    await ejecutarCaso(
      '5. PLE 1.2 (010200) desde PostgreSQL real (15 campos |, CRLF, sin BOM, válido) y aislamiento Empresa B',
      async () => {
        const pleA = await exportarLibro010200DesdePostgres(empA, '2026-03', cuentaAId);
        assert.equal(pleA.codigoLibro, '010200');
        assert.equal(pleA.ruc, rucA);
        assert.equal(pleA.periodo, '2026-03');
        assert.equal(pleA.totalFilas, 3);
        assert.equal(pleA.sumaDebe, '1250.00');
        assert.equal(pleA.sumaHaber, '100.00');
        assert.equal(
          pleA.validacionEstructura.esValido,
          true,
          `PLE 010200 inválido: ${JSON.stringify(pleA.validacionEstructura.errores)}`
        );
        assert.equal(pleA.validacionEstructura.totalErrores, 0);

        // UTF-8 sin BOM
        assert.equal(pleA.contenidoTxt.startsWith('\uFEFF'), false);
        const txtBuf = Buffer.from(pleA.contenidoTxt, 'utf8');
        assert.equal(
          txtBuf[0] === 0xef && txtBuf[1] === 0xbb && txtBuf[2] === 0xbf,
          false,
          'El archivo PLE 010200 no debe tener BOM UTF-8.'
        );

        // Separador CRLF (\r\n) y 15 campos terminados en |
        assert.ok(pleA.contenidoTxt.includes('\r\n'));
        const lineas = pleA.contenidoTxt.split('\r\n');
        assert.equal(lineas.length, 3);
        for (const linea of lineas) {
          assert.ok(linea.endsWith('|'), `La línea PLE debe terminar en '|': ${linea}`);
          const campos = linea.slice(0, -1).split('|');
          assert.equal(campos.length, 15, `Cada línea PLE 010200 debe tener 15 campos: ${linea}`);
        }

        // Revalidar explícitamente con archivoValidadorService
        const reval = archivoValidadorService.validarArchivoTxt(
          pleA.contenidoTxt,
          '010200',
          pleA.nombreArchivo
        );
        assert.equal(reval.esValido, true);
        assert.equal(reval.totalLineas, 3);

        // Aislamiento Empresa B: PLE de Empresa B NO contiene movimientos de Empresa A
        const pleB = await exportarLibro010200DesdePostgres(empB, '2026-03');
        assert.equal(pleB.ruc, rucB);
        assert.equal(pleB.totalFilas, 0);
        assert.equal(pleB.contenidoTxt, '');
        assert.equal(pleB.contenidoTxt.includes('OP-F6-001'), false);
        assert.equal(pleB.contenidoTxt.includes('193-996001-F6'), false);

        // Aislamiento estricto en reportes/cierres entre Empresa B y Empresa A (servicio + HTTP + RLS)
        await assert.rejects(
          () => construirReporteConciliacionOficial(empB, cuentaAId, '2026-03'),
          (err: any) => err?.codigo === 'CUENTA_FINANCIERA_NO_ENCONTRADA' && err?.statusCode === 404
        );
        await assert.rejects(
          () => conciliacionV2Service.listarHistorialCierres(empB, cuentaAId, '2026-03'),
          (err: any) => err?.codigo === 'CUENTA_FINANCIERA_NO_ENCONTRADA' && err?.statusCode === 404
        );

        for (const rutaA of [
          `/empresas/${empA}/conciliacion-v2/reporte/oficial?cuentaFinancieraId=${cuentaAId}&periodo=2026-03`,
          `/empresas/${empA}/conciliacion-v2/cierres/historial?cuentaFinancieraId=${cuentaAId}&periodo=2026-03`,
          `/empresas/${empA}/conciliacion-v2/ple-010200?periodo=2026-03`,
        ]) {
          const respCruzado = await apiFetch(rutaA, sesionSoloB.accessToken, 'GET');
          assert.equal(
            respCruzado.status,
            403,
            `Usuario de Empresa B debe recibir 403 al consultar ${rutaA}`
          );
        }

        // RLS directo en PG: Empresa B ve 0 filas de cierres de Empresa A
        const rlsCheckB = await queryEnEmpresa<{ total: string }>(
          pool,
          empB,
          usrSoloB,
          `SELECT COUNT(*)::text AS total FROM conciliacion_cierres_historial WHERE empresa_id = $1`,
          [empA]
        );
        assert.equal(rlsCheckB.rows[0].total, '0');
      }
    );

    // ------------------------------------------------------------------
    // ESCENARIO 6: Auditoría Dual Opción A sin doble escritura + integridad
    // ------------------------------------------------------------------
    await ejecutarCaso(
      '6. Auditoría Dual Opción A sin doble escritura, filtros TODOS/ENCADENADA/OPERATIVA y cadena íntegra',
      async () => {
        // Verificar 0 doble escritura en `auditoria` para operaciones V2 de cierre/reapertura
        const audOperativaAntes = await queryEnEmpresa<{ total: string }>(
          pool,
          empA,
          usrAdmin,
          `SELECT COUNT(*)::text AS total FROM auditoria WHERE empresa_id = $1`,
          [empA]
        );
        assert.equal(
          audOperativaAntes.rows[0].total,
          '0',
          'Las operaciones V2 de cierre/reapertura no deben duplicar registros en la tabla auditoria.'
        );

        const audChainAntes = await queryEnEmpresa<{ total: string }>(
          pool,
          empA,
          usrAdmin,
          `SELECT COUNT(*)::text AS total
           FROM auditoria_log
           WHERE empresa_id = $1
             AND tabla_afectada IN ('conciliaciones_bancarias', 'conciliacion_cierres_historial')`,
          [empA]
        );
        // 2 cierres (2 registros c/u) + 1 reapertura (2 registros) = 6 registros encadenados
        assert.equal(audChainAntes.rows[0].total, '6');

        // Registrar 1 evento operativo explícito para comprobar la unificación real de ambas fuentes
        await conContextoEmpresa(empA, usrAdmin, () =>
          auditoriaRepository.registrar({
            empresaId: empA,
            usuarioId: usrAdmin,
            tablaAfectada: 'comprobantes_venta',
            registroId: randomUUID(),
            accion: 'INSERT',
            datosNuevos: { detalle: 'Evento operativo sintético Fase 6' },
          })
        );

        const soloEncadenada = await auditoriaRepository.listarPorEmpresa(empA, 50, 'ENCADENADA');
        const soloOperativa = await auditoriaRepository.listarPorEmpresa(empA, 50, 'OPERATIVA');
        const todos = await auditoriaRepository.listarPorEmpresa(empA, 50, 'TODOS');

        assert.equal(soloEncadenada.length, 6);
        for (const item of soloEncadenada) {
          assert.equal(item.origen, 'ENCADENADA');
          assert.match(item.hashActual ?? '', /^[0-9a-f]{64}$/);
          assert.match(item.hashAnterior ?? '', /^[0-9a-f]{64}$/);
        }

        assert.equal(soloOperativa.length, 1);
        assert.equal(soloOperativa[0].origen, 'OPERATIVA');
        assert.equal(soloOperativa[0].hashActual, null);
        assert.equal(soloOperativa[0].hashAnterior, null);

        assert.equal(todos.length, 7);
        assert.equal(todos.filter((r) => r.origen === 'ENCADENADA').length, 6);
        assert.equal(todos.filter((r) => r.origen === 'OPERATIVA').length, 1);

        const integridad = await conContextoEmpresa(empA, usrAdmin, () =>
          auditoriaChainService.verificarIntegridad(empA)
        );
        assert.equal(integridad.valido, true, integridad.mensaje);
        assert.equal(integridad.totalRegistros, 6);
        assert.match(integridad.ultimoHash ?? '', /^[0-9a-f]{64}$/);
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
                  set_config('app.current_user_id', $2, false),
                  set_config('app.restaurando_backup', 'true', false)`,
          [empId, usrAdmin]
        );
        const sentencias = [
          [`DELETE FROM conciliacion_cierres_historial WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM conciliaciones_bancarias WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM cheques_bancarios WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM conciliacion_item WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM conciliacion_grupo WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM extracto_lineas WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM extractos_bancarios WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM movimientos_tesoreria WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM conciliacion_config_empresa WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM cuentas_financieras WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM asiento_detalle WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM asientos WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM anexos WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM subdiarios WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM plan_cuentas WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM periodos WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM ejercicios WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM auditoria WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM auditoria_log WHERE empresa_id = $1`, [empId]],
        ] as const;

        for (const [sql, params] of sentencias) {
          try {
            await cleanClient.query(sql, [...params]);
          } catch {
            // Ignorar tablas append-only con REVOKE DELETE si aplica
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

      await cleanClient.query(`SELECT set_config('app.restaurando_backup', 'false', false)`);
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
    `🎉 CONCILIACIÓN BANCARIA V2 FASE 6: ${casosPasados}/${totalCasos} casos aprobados`
  );
  console.log('====================================================================');
}

main().catch((err) => {
  console.error('\n❌ FALLO EN SUITE CONCILIACIÓN V2 FASE 6:', err);
  process.exitCode = 1;
});
