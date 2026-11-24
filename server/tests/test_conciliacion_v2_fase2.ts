import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { parse } from 'dotenv';
import express from 'express';
import { Pool, type PoolClient } from 'pg';
import {
  CASOS_CLASIFICADOR_12_TIPOS,
  CELDAS_FORMULA_INJECTION,
  aBase64,
  construirArchivoMayor5MbBase64,
  construirCsvConBytesNul,
  construirCsvFalsoConFirmaZip,
  construirCsvMasDe10000Filas,
  construirExtractoBancoNacionTxt,
  construirExtractoBbvaCsv,
  construirExtractoBbvaXlsx,
  construirExtractoBcpCsv,
  construirExtractoBcpXlsx,
  construirExtractoFechaFueraPeriodoCsv,
  construirExtractoInterbankCsv,
  construirExtractoMes2ContinuidadRotaCsv,
  construirExtractoMontoVacioCsv,
  construirExtractoPdfTexto,
  construirExtractoSaldoIncoherenteCsv,
  construirExtractoScotiabankCsv,
  construirPdfConJavaScript,
  construirPdfMasDe200Streams,
  construirPdfMultiStreamExcedeTotal,
  construirPdfSinTextoExtraible,
  construirXlsxConFormulaSinValorEnSaldo,
  construirXlsxConMacros,
  construirXlsxConReferenciaCelda,
  construirXlsxConXxe,
  construirXlsxZipBomb,
  construirXlsxZipBombCabecerasFalseadas,
} from './fixtures/conciliacion/datasetsFase2';

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
// BLOQUE A — PRUEBAS UNITARIAS PURAS (SIN POSTGRESQL)
// ============================================================================

async function ejecutarBloqueUnitario() {
  const { ConciliacionV2Error } = await import('../services/conciliacionV2Service');
  const {
    MAX_BYTES_EXTRACTO,
    MAX_FILAS_EXTRACTO,
    sanitizarCeldaExportacion,
    validarArchivoImportacion,
  } = await import('../services/conciliacion/importacion/validacionArchivo');
  const { parsearExtractoBancario, normalizarFechaExtracto, normalizarMontoExtracto } = await import(
    '../services/conciliacion/importacion/parsers'
  );
  const { buscarPerfilPredefinido } = await import(
    '../services/conciliacion/perfilesBanco/perfilesPredefinidos'
  );
  const { clasificarLineaExtracto } = await import(
    '../services/conciliacion/clasificador/clasificadorGlosaService'
  );
  const { generarPlantillaCsvSegura } = await import(
    '../services/conciliacion/importacion/importacionExtractoService'
  );
  const { PdfTextoNativoAdapter } = await import(
    '../services/conciliacion/importacion/pdfTextoAdapter'
  );

  console.log('\n====================================================================');
  console.log('🧪 BLOQUE A — UNITARIAS FASE 2 (PARSERS, SEGURIDAD, CLASIFICADOR)');
  console.log('====================================================================');

  await ejecutarCaso('A1. Parsing y normalización Money exacta en los 5 bancos (CSV/TXT/XLSX) + PDF jsPDF', () => {
    assert.equal(normalizarFechaExtracto('05/03/2026', 'DD/MM/YYYY'), '2026-03-05');
    assert.equal(normalizarFechaExtracto('2026-03-05'), '2026-03-05');
    assert.equal(normalizarMontoExtracto('S/ (1,250.55)', '.'), '-1250.55');
    assert.equal(normalizarMontoExtracto('1.234,56', ','), '1234.56');

    // 1. BCP CSV + XLSX
    const perfilBcp = buscarPerfilPredefinido('BCP_ESTANDAR')!;
    const bcpCsv = parsearExtractoBancario(Buffer.from(construirExtractoBcpCsv(), 'utf8'), {
      formatoArchivo: 'CSV',
      delimitador: perfilBcp.delimitador,
      codificacion: perfilBcp.codificacion,
      filaEncabezado: perfilBcp.filaEncabezado,
      formatoFecha: perfilBcp.formatoFecha,
      separadorDecimal: perfilBcp.separadorDecimal,
      mapeoColumnas: perfilBcp.mapeoColumnas,
    });
    assert.equal(bcpCsv.length, 5);
    assert.equal(bcpCsv[0].monto, '2500.00');
    assert.equal(bcpCsv[1].monto, '-1000.00');
    assert.equal(bcpCsv[2].monto, '-0.05');
    assert.equal(bcpCsv[3].monto, '-0.05');
    assert.equal(bcpCsv[4].saldo, '2474.90');
    assert.ok(bcpCsv.every((f) => f.errores.length === 0));

    const bcpXlsxBuf = construirExtractoBcpXlsx();
    validarArchivoImportacion({
      nombreArchivo: 'bcp.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contenidoBase64: aBase64(bcpXlsxBuf),
    });
    const bcpXlsx = parsearExtractoBancario(bcpXlsxBuf, {
      formatoArchivo: 'XLSX',
      filaEncabezado: 1,
      formatoFecha: 'DD/MM/YYYY',
      separadorDecimal: '.',
      mapeoColumnas: perfilBcp.mapeoColumnas,
    });
    assert.equal(bcpXlsx.length, 2);
    assert.equal(bcpXlsx[0].monto, '2500.00');
    assert.equal(bcpXlsx[1].monto, '-0.05');

    // 2. Interbank CSV (';', Abono/Cargo)
    const perfilIbk = buscarPerfilPredefinido('INTERBANK_ESTANDAR')!;
    const ibk = parsearExtractoBancario(Buffer.from(construirExtractoInterbankCsv(), 'utf8'), {
      formatoArchivo: 'CSV',
      delimitador: perfilIbk.delimitador,
      codificacion: perfilIbk.codificacion,
      filaEncabezado: perfilIbk.filaEncabezado,
      formatoFecha: perfilIbk.formatoFecha,
      separadorDecimal: perfilIbk.separadorDecimal,
      mapeoColumnas: perfilIbk.mapeoColumnas,
    });
    assert.equal(ibk.length, 3);
    assert.equal(ibk[0].monto, '1800.50');
    assert.equal(ibk[1].monto, '-450.25');
    assert.equal(ibk[2].monto, '-0.05');

    // 3. BBVA CSV & XLSX
    const perfilBbva = buscarPerfilPredefinido('BBVA_ESTANDAR')!;
    const bbvaCsv = parsearExtractoBancario(Buffer.from(construirExtractoBbvaCsv(), 'utf8'), {
      formatoArchivo: 'CSV',
      delimitador: ',',
      filaEncabezado: 1,
      formatoFecha: perfilBbva.formatoFecha,
      separadorDecimal: perfilBbva.separadorDecimal,
      mapeoColumnas: perfilBbva.mapeoColumnas,
    });
    assert.equal(bbvaCsv.length, 2);
    assert.equal(bbvaCsv[0].monto, '45.30');
    assert.equal(bbvaCsv[1].monto, '-800.00');

    const bbvaXlsx = parsearExtractoBancario(construirExtractoBbvaXlsx(), {
      formatoArchivo: 'XLSX',
      filaEncabezado: 1,
      formatoFecha: perfilBbva.formatoFecha,
      separadorDecimal: perfilBbva.separadorDecimal,
      mapeoColumnas: perfilBbva.mapeoColumnas,
    });
    assert.equal(bbvaXlsx.length, 2);
    assert.equal(bbvaXlsx[0].monto, '45.30');
    assert.equal(bbvaXlsx[1].monto, '-800.00');

    // 4. Scotiabank CSV
    const perfilScotia = buscarPerfilPredefinido('SCOTIABANK_ESTANDAR')!;
    const scotia = parsearExtractoBancario(Buffer.from(construirExtractoScotiabankCsv(), 'utf8'), {
      formatoArchivo: 'CSV',
      delimitador: perfilScotia.delimitador,
      filaEncabezado: perfilScotia.filaEncabezado,
      formatoFecha: perfilScotia.formatoFecha,
      separadorDecimal: perfilScotia.separadorDecimal,
      mapeoColumnas: perfilScotia.mapeoColumnas,
    });
    assert.equal(scotia.length, 2);
    assert.equal(scotia[0].monto, '-600.00');
    assert.equal(scotia[0].referencia, 'CHQ-000881');
    assert.equal(scotia[1].monto, '1200.00');

    // 5. Banco de la Nación TXT ('|' y '\t', LATIN1)
    const perfilBn = buscarPerfilPredefinido('BANCO_NACION_ESTANDAR')!;
    const bnPipe = parsearExtractoBancario(construirExtractoBancoNacionTxt('|'), {
      formatoArchivo: 'TXT',
      delimitador: '|',
      codificacion: 'LATIN1',
      filaEncabezado: 1,
      formatoFecha: perfilBn.formatoFecha,
      separadorDecimal: perfilBn.separadorDecimal,
      mapeoColumnas: perfilBn.mapeoColumnas,
    });
    assert.equal(bnPipe.length, 2);
    assert.equal(bnPipe[0].monto, '320.00');
    assert.equal(bnPipe[1].monto, '-120.00');

    const bnTab = parsearExtractoBancario(construirExtractoBancoNacionTxt('\t'), {
      formatoArchivo: 'TXT',
      delimitador: '\t',
      codificacion: 'LATIN1',
      filaEncabezado: 1,
      formatoFecha: perfilBn.formatoFecha,
      separadorDecimal: perfilBn.separadorDecimal,
      mapeoColumnas: perfilBn.mapeoColumnas,
    });
    assert.equal(bnTab.length, 2);
    assert.equal(bnTab[0].saldo, '1320.00');

    // 6. PDF-texto dinámico con jsPDF
    const pdfBuf = construirExtractoPdfTexto();
    validarArchivoImportacion({
      nombreArchivo: 'estado_cuenta.pdf',
      contentType: 'application/pdf',
      contenidoBase64: aBase64(pdfBuf),
    });
    const pdfRows = parsearExtractoBancario(pdfBuf, {
      formatoArchivo: 'PDF',
      formatoFecha: 'DD/MM/YYYY',
      separadorDecimal: '.',
      adaptadorPdf: new PdfTextoNativoAdapter(),
    });
    assert.equal(pdfRows.length, 3, 'PDF generado con jsPDF debe extraer 3 movimientos');
    assert.equal(pdfRows[0].fecha, '2026-03-02');
    assert.equal(pdfRows[0].monto, '1500.00');
    assert.equal(pdfRows[0].saldo, '2500.00');
    assert.equal(pdfRows[1].monto, '-500.00');
    assert.equal(pdfRows[2].monto, '-0.05');
  });

  await ejecutarCaso('A2. Seguridad de archivos: >5MB, >10k filas, zip-bomb, macros, XXE, PDF activo/sin texto, fake ZIP/NUL y Formula Injection', () => {
    assert.equal(MAX_BYTES_EXTRACTO, 5 * 1024 * 1024);
    assert.equal(MAX_FILAS_EXTRACTO, 10_000);

    // > 5 MB
    assert.throws(
      () =>
        validarArchivoImportacion({
          nombreArchivo: 'grande.csv',
          contentType: 'text/csv',
          contenidoBase64: construirArchivoMayor5MbBase64(),
        }),
      (err: unknown) => err instanceof ConciliacionV2Error && err.codigo === 'ARCHIVO_EXCEDE_TAMANO'
    );

    // > 10,000 filas
    assert.throws(
      () =>
        parsearExtractoBancario(construirCsvMasDe10000Filas(), {
          formatoArchivo: 'CSV',
        }),
      (err: unknown) => err instanceof ConciliacionV2Error && err.codigo === 'ARCHIVO_EXCEDE_FILAS'
    );

    // .xlsx zip-bomb
    assert.throws(
      () =>
        validarArchivoImportacion({
          nombreArchivo: 'bomb.xlsx',
          contenidoBase64: aBase64(construirXlsxZipBomb()),
        }),
      (err: unknown) => err instanceof ConciliacionV2Error && err.codigo === 'ZIP_BOMB_DETECTADO'
    );

    // .xlsx con vbaProject.bin
    assert.throws(
      () =>
        validarArchivoImportacion({
          nombreArchivo: 'macros.xlsx',
          contenidoBase64: aBase64(construirXlsxConMacros()),
        }),
      (err: unknown) => err instanceof ConciliacionV2Error && err.codigo === 'XLSX_MACROS_PROHIBIDAS'
    );

    // .xlsx con XXE <!DOCTYPE / <!ENTITY
    assert.throws(
      () =>
        validarArchivoImportacion({
          nombreArchivo: 'xxe.xlsx',
          contenidoBase64: aBase64(construirXlsxConXxe()),
        }),
      (err: unknown) => err instanceof ConciliacionV2Error && err.codigo === 'XML_ENTIDAD_PROHIBIDA'
    );

    // .pdf con /JavaScript
    assert.throws(
      () =>
        validarArchivoImportacion({
          nombreArchivo: 'malicioso.pdf',
          contentType: 'application/pdf',
          contenidoBase64: aBase64(construirPdfConJavaScript()),
        }),
      (err: unknown) => err instanceof ConciliacionV2Error && err.codigo === 'PDF_CONTENIDO_PROHIBIDO'
    );

    // .pdf sin texto extraíble (solo gráficos)
    const pdfSinTexto = construirPdfSinTextoExtraible();
    validarArchivoImportacion({
      nombreArchivo: 'escaneado.pdf',
      contentType: 'application/pdf',
      contenidoBase64: aBase64(pdfSinTexto),
    });
    assert.throws(
      () =>
        parsearExtractoBancario(pdfSinTexto, {
          formatoArchivo: 'PDF',
          adaptadorPdf: new PdfTextoNativoAdapter(),
        }),
      (err: unknown) => err instanceof ConciliacionV2Error && err.codigo === 'PDF_SIN_TEXTO_EXTRAIBLE'
    );

    // .csv falso con magic bytes ZIP (PK\x03\x04)
    assert.throws(
      () =>
        validarArchivoImportacion({
          nombreArchivo: 'falso.csv',
          contentType: 'text/csv',
          contenidoBase64: aBase64(construirCsvFalsoConFirmaZip()),
        }),
      (err: unknown) => err instanceof ConciliacionV2Error && err.codigo === 'FIRMA_ARCHIVO_INVALIDA'
    );

    // .csv con bytes NUL
    assert.throws(
      () =>
        validarArchivoImportacion({
          nombreArchivo: 'nulos.csv',
          contentType: 'text/csv',
          contenidoBase64: aBase64(construirCsvConBytesNul()),
        }),
      (err: unknown) => err instanceof ConciliacionV2Error && err.codigo === 'ARCHIVO_BINARIO_NO_PERMITIDO'
    );

    // Formula injection y plantilla CSV segura
    for (const celda of CELDAS_FORMULA_INJECTION) {
      const sanitizada = sanitizarCeldaExportacion(celda);
      assert.ok(sanitizada.startsWith("'"), `Celda "${celda}" debe neutralizarse con comilla simple`);
    }
    assert.equal(sanitizarCeldaExportacion('ABONO NORMAL'), 'ABONO NORMAL');

    const plantilla = generarPlantillaCsvSegura();
    assert.ok(plantilla.startsWith('\uFEFFFecha,Descripcion,Referencia,Abono,Cargo,Saldo'));
    assert.ok(!/^[=+\-@]/m.test(plantilla.replace(/^\uFEFF/, '')));

    // 1. .xlsx con referencia de columna gigante (AAAAAAAAA1) y fuera de límite (XFD1) -> ARCHIVO_XLSX_CORRUPTO sin OOM
    for (const refInvalida of ['AAAAAAAAA1', 'XFD1'] as const) {
      const xlsxRefBuf = construirXlsxConReferenciaCelda(refInvalida);
      validarArchivoImportacion({
        nombreArchivo: `ref_${refInvalida}.xlsx`,
        contenidoBase64: aBase64(xlsxRefBuf),
      });
      assert.throws(
        () => parsearExtractoBancario(xlsxRefBuf, { formatoArchivo: 'XLSX' }),
        (err: unknown) => err instanceof ConciliacionV2Error && err.codigo === 'ARCHIVO_XLSX_CORRUPTO'
      );
    }

    // 2. .xlsx zip-bomb con cabeceras central directory falseadas (uncompressedSize y compressedSize pequeños) -> ZIP_BOMB_DETECTADO
    assert.throws(
      () =>
        validarArchivoImportacion({
          nombreArchivo: 'bomb_spoofed.xlsx',
          contenidoBase64: aBase64(construirXlsxZipBombCabecerasFalseadas()),
        }),
      (err: unknown) => err instanceof ConciliacionV2Error && err.codigo === 'ZIP_BOMB_DETECTADO'
    );

    // 3. .pdf multi-stream > 32 MB acumulado (MAX_PDF_TOTAL_SALIDA) y > 200 streams -> PDF_STREAM_EXCEDE_LIMITE
    const pdfTotalExcedido = construirPdfMultiStreamExcedeTotal();
    validarArchivoImportacion({
      nombreArchivo: 'multistream_36mb.pdf',
      contentType: 'application/pdf',
      contenidoBase64: aBase64(pdfTotalExcedido),
    });
    assert.throws(
      () =>
        parsearExtractoBancario(pdfTotalExcedido, {
          formatoArchivo: 'PDF',
          adaptadorPdf: new PdfTextoNativoAdapter(),
        }),
      (err: unknown) => err instanceof ConciliacionV2Error && err.codigo === 'PDF_STREAM_EXCEDE_LIMITE'
    );

    const pdfMuchosStreams = construirPdfMasDe200Streams();
    validarArchivoImportacion({
      nombreArchivo: 'mas_200_streams.pdf',
      contentType: 'application/pdf',
      contenidoBase64: aBase64(pdfMuchosStreams),
    });
    assert.throws(
      () =>
        parsearExtractoBancario(pdfMuchosStreams, {
          formatoArchivo: 'PDF',
          adaptadorPdf: new PdfTextoNativoAdapter(),
        }),
      (err: unknown) => err instanceof ConciliacionV2Error && err.codigo === 'PDF_STREAM_EXCEDE_LIMITE'
    );

    // 4. .xlsx con fórmula <f>SUM(A1:A2)</f> y etiqueta vacía <v/> en columna saldo -> FORMULA_NO_PERMITIDA_SIN_VALOR
    const xlsxFormulaBuf = construirXlsxConFormulaSinValorEnSaldo();
    validarArchivoImportacion({
      nombreArchivo: 'formula_saldo.xlsx',
      contenidoBase64: aBase64(xlsxFormulaBuf),
    });
    const filasFormula = parsearExtractoBancario(xlsxFormulaBuf, { formatoArchivo: 'XLSX' });
    assert.equal(filasFormula.length, 1);
    assert.ok(
      filasFormula[0].errores.some(
        (e) => e.codigo === 'FORMULA_NO_PERMITIDA_SIN_VALOR' && e.campo === 'saldo'
      ),
      'Celda con fórmula y <v/> vacío en saldo debe rechazarse con FORMULA_NO_PERMITIDA_SIN_VALOR'
    );
  });

  await ejecutarCaso('A3. Clasificador de glosa (12 tipos), extracción RUC/contraparte/doc y reglas personalizadas', () => {
    const vistos = new Set<string>();
    for (const caso of CASOS_CLASIFICADOR_12_TIPOS) {
      const res = clasificarLineaExtracto(caso.descripcion, caso.referencia, caso.monto, [], 'BCP');
      assert.equal(
        res.tipoClasificacion,
        caso.esperado,
        `Glosa "${caso.descripcion}" debe clasificar como ${caso.esperado} (obtenido: ${res.tipoClasificacion})`
      );
      vistos.add(res.tipoClasificacion);
    }
    assert.equal(vistos.size, 12, 'Deben cubrirse los 12 tipos de clasificación');

    const transf = clasificarLineaExtracto(
      'TRANSFERENCIA PROVEEDOR: SERVICIOS NORTE SAC RUC 20997778881 F001-00008888',
      'OP-8888',
      '-1250.00',
      [],
      'BCP'
    );
    assert.equal(transf.rucExtraido, '20997778881');
    assert.equal(transf.contraparteExtraida, 'SERVICIOS NORTE SAC');
    assert.equal(transf.docExtraido, 'F001-00008888');

    // Prioridad de regla personalizada sobre regla base
    const custom = clasificarLineaExtracto(
      'COMISION ESPECIAL CLIENTE VIP',
      'REF-1',
      '-50.00',
      [
        {
          id: '00000000-0000-4000-8000-000000000010',
          empresaId: '00000000-0000-4000-8000-000000000001',
          nombre: 'CUSTOM_VIP',
          banco: 'BCP',
          tipoClasificacion: 'MANTENIMIENTO',
          patronTexto: 'CLIENTE VIP',
          tipoCoincidencia: 'CONTIENE',
          sentidoMonto: 'CARGO',
          prioridad: 5,
          esSistema: false,
          activo: true,
          createdAt: null,
          updatedAt: null,
        },
      ],
      'BCP'
    );
    assert.equal(custom.tipoClasificacion, 'MANTENIMIENTO');
    assert.equal(custom.reglaAplicada, 'CUSTOM_VIP');
  });
}

// ============================================================================
// BLOQUE B — INTEGRACIÓN REAL EN POSTGRESQL (atlob_test / contabilidad_app)
// ============================================================================

async function ejecutarBloquePostgresReal() {
  const testDbUrl = resolverTestDatabaseUrl();

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = '';

  console.log('\n====================================================================');
  console.log('🐘 BLOQUE B — INTEGRACIÓN REAL FASE 2 EN POSTGRESQL (atlob_test)');
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
        !(identity.rolsuper || identity.rolcreatedb || identity.rolcreaterole || identity.rolbypassrls),
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
  const per202604A = randomUUID();
  const per202603B = randomUUID();
  const sub01A = randomUUID();
  const sub01B = randomUUID();

  const cta1041A = randomUUID();
  const cta1042A = randomUUID();
  const cta6412A = randomUUID();
  const cta6391A = randomUUID();
  const cta67311A = randomUUID();
  const cta7793A = randomUUID();
  const cta1041B = randomUUID();

  const cuentaAId = randomUUID();
  const cuentaBbvaId = randomUUID();
  const cuentaBId = randomUUID();

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
        [tenantId, `Tenant Concil V2 F2 ${sufijo}`, `concil-f2-${sufijo}`]
      );

      await seedClient.query(
        `INSERT INTO usuarios_estudio (id, email, password_hash, nombre, rol_global, is_active)
         VALUES
           ($1, $6,  $11, 'Admin F2',     'ADMINISTRADOR',      true),
           ($2, $7,  $11, 'Senior F2',    'CONTADOR_SENIOR',    true),
           ($3, $8,  $11, 'Asistente F2', 'ASISTENTE_CONTABLE', true),
           ($4, $9,  $11, 'Auditor F2',   'AUDITOR_REVISOR',    true),
           ($5, $10, $11, 'Solo B F2',    'CONTADOR_SENIOR',    true)`,
        [
          usrAdmin,
          usrSenior,
          usrAsistente,
          usrAuditor,
          usrSoloB,
          `admin.f2.${sufijo}@atlob.test`,
          `senior.f2.${sufijo}@atlob.test`,
          `asistente.f2.${sufijo}@atlob.test`,
          `auditor.f2.${sufijo}@atlob.test`,
          `solob.f2.${sufijo}@atlob.test`,
          hashDummy,
        ]
      );

      await seedClient.query(
        `INSERT INTO empresas (id, tenant_id, codigo_empresa, ruc, razon_social, regimen_tributario, domicilio_fiscal, moneda_principal, is_active)
         VALUES
           ($1, $3, $4, $6, 'EMPRESA CONCIL F2 A SAC', 'REGIMEN_GENERAL', 'Av. F2 A 100', 'PEN', true),
           ($2, $3, $5, $7, 'EMPRESA CONCIL F2 B SAC', 'REGIMEN_GENERAL', 'Av. F2 B 200', 'PEN', true)`,
        [empA, empB, tenantId, `EMP-F2A-${sufijo}`, `EMP-F2B-${sufijo}`, rucA, rucB]
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
           ($1, $3, $4, 2026, 3, '2026-03', 'ABIERTO'),
           ($2, $3, $4, 2026, 4, '2026-04', 'ABIERTO')`,
        [per202603A, per202604A, empA, ej2026A]
      );
      await seedClient.query(
        `INSERT INTO subdiarios (id, empresa_id, codigo, descripcion, tipo, is_active)
         VALUES ($1, $2, '05', 'BANCOS F2', 'BANCOS', true)`,
        [sub01A, empA]
      );
      await seedClient.query(
        `INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento, is_active)
         VALUES
           ($1, $7, '10411', 'Banco BCP F2 MN', 5, 'ACTIVO', true, true),
           ($2, $7, '10412', 'Banco BBVA F2 MN', 5, 'ACTIVO', true, true),
           ($3, $7, '6412',  'ITF F2', 4, 'GASTO', true, true),
           ($4, $7, '6391',  'Comisiones F2', 4, 'GASTO', true, true),
           ($5, $7, '67311', 'Interes Gasto F2', 5, 'GASTO', true, true),
           ($6, $7, '7793',  'Interes Ingreso F2', 4, 'INGRESO', true, true)`,
        [cta1041A, cta1042A, cta6412A, cta6391A, cta67311A, cta7793A, empA]
      );
      await seedClient.query(
        `INSERT INTO cuentas_financieras (
           id, empresa_id, tipo, banco, numero, moneda, cuenta_contable_codigo, cuenta_contable_id, saldo_inicial, saldo_actual, activa
         ) VALUES
           ($1, $3, 'BANCO', 'BCP',  '193-990001-F2', 'PEN', '10411', $4, 1000.00, 2474.90, true),
           ($2, $3, 'BANCO', 'BBVA', '0011-990002-F2', 'PEN', '10412', $5, 1000.00, 245.30, true)`,
        [cuentaAId, cuentaBbvaId, empA, cta1041A, cta1042A]
      );
      await seedClient.query(
        `INSERT INTO conciliacion_config_empresa (
           empresa_id, conciliacion_v2_habilitada, tolerancia_dias, tolerancia_monto,
           cuenta_itf_codigo, cuenta_comision_codigo, cuenta_interes_gasto_codigo, cuenta_interes_ingreso_codigo
         ) VALUES ($1, true, 3, 0.00, '6412', '6391', '67311', '7793')`,
        [empA]
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
         VALUES ($1, $2, '05', 'BANCOS F2 B', 'BANCOS', true)`,
        [sub01B, empB]
      );
      await seedClient.query(
        `INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento, is_active)
         VALUES ($1, $2, '10411', 'Banco BCP B', 5, 'ACTIVO', true, true)`,
        [cta1041B, empB]
      );
      await seedClient.query(
        `INSERT INTO cuentas_financieras (
           id, empresa_id, tipo, banco, numero, moneda, cuenta_contable_codigo, cuenta_contable_id, saldo_inicial, saldo_actual, activa
         ) VALUES ($1, $2, 'BANCO', 'BCP', '193-990099-B', 'PEN', '10411', $3, 0.00, 0.00, true)`,
        [cuentaBId, empB, cta1041B]
      );
      await seedClient.query('COMMIT');
    } catch (err) {
      await seedClient.query('ROLLBACK');
      throw err;
    } finally {
      seedClient.release();
    }

    const app = express();
    app.use(express.json({ limit: '10mb' }));
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

    const emitir = (id: string, email: string, nombre: string, rolGlobal: any, esAdmin: boolean, empId: string) =>
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

    const sesionAdmin = await emitir(usrAdmin, `admin.f2.${sufijo}@atlob.test`, 'Admin F2', 'ADMINISTRADOR', true, empA);
    const sesionSenior = await emitir(usrSenior, `senior.f2.${sufijo}@atlob.test`, 'Senior F2', 'CONTADOR_SENIOR', false, empA);
    const sesionAsistente = await emitir(usrAsistente, `asistente.f2.${sufijo}@atlob.test`, 'Asistente F2', 'ASISTENTE_CONTABLE', false, empA);
    const sesionAuditor = await emitir(usrAuditor, `auditor.f2.${sufijo}@atlob.test`, 'Auditor F2', 'AUDITOR_REVISOR', false, empA);
    const sesionSoloB = await emitir(usrSoloB, `solob.f2.${sufijo}@atlob.test`, 'Solo B F2', 'CONTADOR_SENIOR', false, empB);

    let importMes1Id = '';
    let primeraLineaId = '';
    const bcpCsvMes1Base64 = aBase64(construirExtractoBcpCsv());

    // ------------------------------------------------------------------
    // B1. Flujo completo de importación + idempotencia + proyección en /resumen
    // ------------------------------------------------------------------
    await ejecutarCaso('B1. Flujo completo previsualizar -> confirmar -> GET /resumen -> idempotencia 2da importación', async () => {
      const prev = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/importaciones/previsualizar`,
        sesionSenior.accessToken,
        'POST',
        {
          cuentaFinancieraId: cuentaAId,
          periodo: '2026-03',
          perfilCodigo: 'BCP_ESTANDAR',
          nombreArchivo: 'extracto_bcp_202603.csv',
          contentType: 'text/csv',
          contenidoBase64: bcpCsvMes1Base64,
        }
      );
      assert.equal(prev.status, 200);
      assert.equal(prev.body?.data?.valido, true);
      assert.equal(prev.body?.data?.cuadreSaldosValido, true);
      assert.equal(prev.body?.data?.saldoInicial, '1000.00');
      assert.equal(prev.body?.data?.totalAbonos, '2500.00');
      assert.equal(prev.body?.data?.totalCargos, '1025.10');
      assert.equal(prev.body?.data?.saldoFinal, '2474.90');
      assert.equal(prev.body?.data?.filasNuevas, 5);
      assert.equal(prev.body?.data?.filasDuplicadas, 0);

      const lineasPrev = prev.body.data.lineas as any[];
      assert.equal(lineasPrev[0].rucExtraido, '20991112223');
      assert.equal(lineasPrev[0].docExtraido, 'F001-0000101');
      assert.equal(lineasPrev[2].tipoClasificacion, 'ITF');
      assert.equal(lineasPrev[3].tipoClasificacion, 'ITF');
      assert.notEqual(
        lineasPrev[2].hashLinea,
        lineasPrev[3].hashLinea,
        'Dos cargos ITF idénticos en el mismo día deben recibir hashLinea distinto'
      );

      const conf1 = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/importaciones/confirmar`,
        sesionSenior.accessToken,
        'POST',
        {
          cuentaFinancieraId: cuentaAId,
          periodo: '2026-03',
          perfilCodigo: 'BCP_ESTANDAR',
          nombreArchivo: 'extracto_bcp_202603.csv',
          contentType: 'text/csv',
          contenidoBase64: bcpCsvMes1Base64,
        }
      );
      assert.equal(conf1.status, 201);
      assert.equal(conf1.body?.data?.yaExistiaSinNuevas, false);
      assert.equal(conf1.body?.data?.filasNuevas, 5);
      assert.equal(conf1.body?.data?.filasDuplicadas, 0);
      assert.equal(conf1.body?.data?.estado, 'ACTIVO');
      importMes1Id = conf1.body.data.importId;

      const resumen = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/resumen?cuentaFinancieraId=${cuentaAId}&periodo=2026-03`,
        sesionSenior.accessToken,
        'GET'
      );
      assert.equal(resumen.status, 200);
      const lineasResumen = resumen.body?.data?.extractoLineas as any[];
      assert.equal(lineasResumen.length, 5);
      primeraLineaId = lineasResumen[0].id;
      assert.equal(lineasResumen[0].importId, importMes1Id);
      assert.ok(lineasResumen[0].lineaRawId);
      assert.equal(lineasResumen[0].rucExtraido, '20991112223');
      assert.equal(lineasResumen[0].docExtraido, 'F001-0000101');
      assert.equal(lineasResumen[2].tipoClasificacion, 'ITF');

      // 2da importación del mismo archivo -> idempotencia sin duplicación
      const prev2 = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/importaciones/previsualizar`,
        sesionSenior.accessToken,
        'POST',
        {
          cuentaFinancieraId: cuentaAId,
          periodo: '2026-03',
          perfilCodigo: 'BCP_ESTANDAR',
          nombreArchivo: 'extracto_bcp_202603.csv',
          contentType: 'text/csv',
          contenidoBase64: bcpCsvMes1Base64,
        }
      );
      assert.equal(prev2.status, 200);
      assert.equal(prev2.body?.data?.filasNuevas, 0);
      assert.equal(prev2.body?.data?.filasDuplicadas, 5);
      assert.equal(prev2.body?.data?.lineas[2].esDuplicada, true);
      assert.equal(prev2.body?.data?.lineas[3].esDuplicada, true);

      const conf2 = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/importaciones/confirmar`,
        sesionSenior.accessToken,
        'POST',
        {
          cuentaFinancieraId: cuentaAId,
          periodo: '2026-03',
          perfilCodigo: 'BCP_ESTANDAR',
          nombreArchivo: 'extracto_bcp_202603.csv',
          contentType: 'text/csv',
          contenidoBase64: bcpCsvMes1Base64,
        }
      );
      assert.equal(conf2.status, 200);
      assert.equal(conf2.body?.data?.yaExistiaSinNuevas, true);
      assert.equal(conf2.body?.data?.filasNuevas, 0);
      assert.equal(conf2.body?.data?.filasDuplicadas, 5);

      const countLineas = await queryEnEmpresa<{ total: number }>(
        pool,
        empA,
        usrAdmin,
        `SELECT COUNT(*)::int AS total FROM extracto_lineas WHERE empresa_id = $1 AND import_id = $2`,
        [empA, importMes1Id]
      );
      assert.equal(countLineas.rows[0].total, 5, 'La segunda importación no debe duplicar filas en extracto_lineas');
    });

    // ------------------------------------------------------------------
    // B2. Inmutabilidad de extracto_linea_raw + Aislamiento RLS multiempresa
    // ------------------------------------------------------------------
    await ejecutarCaso('B2. Inmutabilidad de extracto_linea_raw y aislamiento RLS en las 4 tablas nuevas', async () => {
      // Trigger de inmutabilidad en extracto_linea_raw (UPDATE y DELETE bloqueados)
      const immClient = await pool.connect();
      try {
        await immClient.query('BEGIN');
        await fijarContextoRls(immClient, empA, usrAdmin);

        await immClient.query('SAVEPOINT sp_upd_raw');
        await assert.rejects(
          () =>
            immClient.query(
              `UPDATE extracto_linea_raw SET fue_duplicada = true WHERE empresa_id = $1 AND import_id = $2`,
              [empA, importMes1Id]
            ),
          /EXTRACTO_LINEA_RAW_INMUTABLE/
        );
        await immClient.query('ROLLBACK TO SAVEPOINT sp_upd_raw');

        await immClient.query('SAVEPOINT sp_del_raw');
        await assert.rejects(
          () =>
            immClient.query(
              `DELETE FROM extracto_linea_raw WHERE empresa_id = $1 AND import_id = $2`,
              [empA, importMes1Id]
            ),
          /EXTRACTO_LINEA_RAW_INMUTABLE/
        );
        await immClient.query('ROLLBACK TO SAVEPOINT sp_del_raw');
        await immClient.query('COMMIT');
      } finally {
        immClient.release();
      }

      // Crear perfil y regla en Empresa A para probar RLS en las 4 tablas nuevas
      const perfilA = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/perfiles`,
        sesionSenior.accessToken,
        'POST',
        {
          codigo: `PERF_RLS_${sufijo.toUpperCase()}`,
          nombre: 'Perfil RLS A',
          banco: 'BCP',
          formato: 'CSV',
          delimitador: ',',
          mapeoColumnas: {
            fecha: 'Fecha',
            descripcion: 'Descripción',
            monto: 'Monto',
            saldo: 'Saldo',
          },
        }
      );
      assert.equal(perfilA.status, 201);
      const perfilAId = perfilA.body.data.id as string;

      const reglaA = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/reglas-clasificacion`,
        sesionSenior.accessToken,
        'POST',
        {
          nombre: `REGLA_RLS_${sufijo.toUpperCase()}`,
          tipoClasificacion: 'COMISION_BANCARIA',
          patronTexto: 'CARGO RLS',
          tipoCoincidencia: 'CONTIENE',
          sentidoMonto: 'CARGO',
          prioridad: 15,
        }
      );
      assert.equal(reglaA.status, 201);
      const reglaAId = reglaA.body.data.id as string;

      const rlsClient = await pool.connect();
      try {
        await rlsClient.query('BEGIN');

        // Sin contexto -> 0 filas en las 4 tablas
        await fijarContextoRls(rlsClient, '', '');
        for (const tabla of [
          'conciliacion_perfiles_banco',
          'conciliacion_reglas_clasificacion',
          'extracto_import',
          'extracto_linea_raw',
        ]) {
          const res = await rlsClient.query(`SELECT id FROM ${tabla} WHERE empresa_id = $1`, [empA]);
          assert.equal(res.rowCount, 0, `Sin contexto RLS no debe leerse ${tabla}`);
        }

        // Contexto Empresa B -> 0 filas visibles, 0 filas modificables, INSERT con empA rechazado (42501)
        await fijarContextoRls(rlsClient, empB, usrSoloB);
        for (const tabla of [
          'conciliacion_perfiles_banco',
          'conciliacion_reglas_clasificacion',
          'extracto_import',
          'extracto_linea_raw',
        ]) {
          const res = await rlsClient.query(`SELECT id FROM ${tabla} WHERE empresa_id = $1`, [empA]);
          assert.equal(res.rowCount, 0, `Empresa B no debe ver filas de Empresa A en ${tabla}`);
        }

        const updPerfil = await rlsClient.query(
          `UPDATE conciliacion_perfiles_banco SET nombre = 'HACK' WHERE id = $1`,
          [perfilAId]
        );
        assert.equal(updPerfil.rowCount, 0);

        const updRegla = await rlsClient.query(
          `UPDATE conciliacion_reglas_clasificacion SET patron_texto = 'HACK' WHERE id = $1`,
          [reglaAId]
        );
        assert.equal(updRegla.rowCount, 0);

        const updImport = await rlsClient.query(
          `UPDATE extracto_import SET estado = 'REVERTIDO' WHERE id = $1`,
          [importMes1Id]
        );
        assert.equal(updImport.rowCount, 0);

        await rlsClient.query('SAVEPOINT sp_rls_perfil_ins');
        await assert.rejects(
          () =>
            rlsClient.query(
              `INSERT INTO conciliacion_perfiles_banco (empresa_id, codigo, nombre, banco, formato, mapeo_columnas_json)
               VALUES ($1, 'HACK', 'Hack', 'BCP', 'CSV', '{"fecha":"F","descripcion":"D","monto":"M"}'::jsonb)`,
              [empA]
            ),
          { code: '42501' }
        );
        await rlsClient.query('ROLLBACK TO SAVEPOINT sp_rls_perfil_ins');

        await rlsClient.query('SAVEPOINT sp_rls_regla_ins');
        await assert.rejects(
          () =>
            rlsClient.query(
              `INSERT INTO conciliacion_reglas_clasificacion (empresa_id, nombre, tipo_clasificacion, patron_texto)
               VALUES ($1, 'HACK', 'OTRO', 'HACK')`,
              [empA]
            ),
          { code: '42501' }
        );
        await rlsClient.query('ROLLBACK TO SAVEPOINT sp_rls_regla_ins');
        await rlsClient.query('ROLLBACK');
      } finally {
        rlsClient.release();
      }

      // HTTP cross-empresa
      const crossPerfiles = await apiFetch(`/empresas/${empA}/conciliacion-v2/perfiles`, sesionSoloB.accessToken);
      assert.equal(crossPerfiles.status, 403);
      const crossReglas = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/reglas-clasificacion`,
        sesionSoloB.accessToken
      );
      assert.equal(crossReglas.status, 403);
      const crossImp = await apiFetch(`/empresas/${empA}/conciliacion-v2/importaciones`, sesionSoloB.accessToken);
      assert.equal(crossImp.status, 403);
    });

    // ------------------------------------------------------------------
    // B3. Rechazos (SALDO_INCOHERENTE, FECHA_FUERA_DE_PERIODO, MONTO_VACIO_O_INVALIDO) y advertencia CONTINUIDAD_SALDO_ANTERIOR
    // ------------------------------------------------------------------
    await ejecutarCaso('B3. Rechazos por saldo/fecha/monto inválido y advertencia CONTINUIDAD_SALDO_ANTERIOR en mes 2', async () => {
      // 1. Saldo incoherente
      const incPrev = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/importaciones/previsualizar`,
        sesionSenior.accessToken,
        'POST',
        {
          cuentaFinancieraId: cuentaAId,
          periodo: '2026-03',
          perfilCodigo: 'BCP_ESTANDAR',
          nombreArchivo: 'incoherente.csv',
          contenidoBase64: aBase64(construirExtractoSaldoIncoherenteCsv()),
        }
      );
      assert.equal(incPrev.status, 200);
      assert.equal(incPrev.body?.data?.valido, false);
      assert.ok(
        incPrev.body.data.errores.some((e: any) => e.codigo === 'SALDO_INCOHERENTE' && e.numFila === 3)
      );

      const incConf = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/importaciones/confirmar`,
        sesionSenior.accessToken,
        'POST',
        {
          cuentaFinancieraId: cuentaAId,
          periodo: '2026-03',
          perfilCodigo: 'BCP_ESTANDAR',
          nombreArchivo: 'incoherente.csv',
          contenidoBase64: aBase64(construirExtractoSaldoIncoherenteCsv()),
        }
      );
      assert.equal(incConf.status, 400);
      assert.equal(incConf.body?.details?.codigo, 'SALDO_INCOHERENTE');

      // 2. Fecha fuera de periodo
      const fueraPrev = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/importaciones/previsualizar`,
        sesionSenior.accessToken,
        'POST',
        {
          cuentaFinancieraId: cuentaAId,
          periodo: '2026-03',
          perfilCodigo: 'BCP_ESTANDAR',
          nombreArchivo: 'fuera_periodo.csv',
          contenidoBase64: aBase64(construirExtractoFechaFueraPeriodoCsv()),
        }
      );
      assert.equal(fueraPrev.status, 200);
      assert.equal(fueraPrev.body?.data?.valido, false);
      assert.ok(
        fueraPrev.body.data.errores.some((e: any) => e.codigo === 'FECHA_FUERA_DE_PERIODO' && e.numFila === 3)
      );

      // 3. Monto vacío o inválido
      const montoPrev = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/importaciones/previsualizar`,
        sesionSenior.accessToken,
        'POST',
        {
          cuentaFinancieraId: cuentaAId,
          periodo: '2026-03',
          perfilCodigo: 'BCP_ESTANDAR',
          nombreArchivo: 'monto_invalido.csv',
          contenidoBase64: aBase64(construirExtractoMontoVacioCsv()),
        }
      );
      assert.equal(montoPrev.status, 200);
      assert.equal(montoPrev.body?.data?.valido, false);
      assert.ok(
        montoPrev.body.data.errores.some((e: any) => e.codigo === 'MONTO_VACIO_O_INVALIDO' && e.numFila === 3)
      );

      // 4. Mes 2 con continuidad de saldo rota (no bloquea si cuadra internamente, pero advierte)
      const mes2Prev = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/importaciones/previsualizar`,
        sesionSenior.accessToken,
        'POST',
        {
          cuentaFinancieraId: cuentaAId,
          periodo: '2026-04',
          perfilCodigo: 'BCP_ESTANDAR',
          nombreArchivo: 'mes2_abril.csv',
          contenidoBase64: aBase64(construirExtractoMes2ContinuidadRotaCsv()),
        }
      );
      assert.equal(mes2Prev.status, 200);
      assert.equal(mes2Prev.body?.data?.valido, true);
      assert.equal(mes2Prev.body?.data?.cuadreSaldosValido, true);
      const adv = (mes2Prev.body?.data?.advertencias as any[]).find(
        (a) => a.codigo === 'CONTINUIDAD_SALDO_ANTERIOR'
      );
      assert.ok(adv, 'Debe emitir advertencia CONTINUIDAD_SALDO_ANTERIOR');
      assert.equal(adv.saldoAnteriorEsperado, '2474.90');
      assert.equal(adv.saldoInicialArchivo, '3000.00');
    });

    // ------------------------------------------------------------------
    // B4. Reversión completa, bloqueo si hay partida conciliada y reimportación limpia
    // ------------------------------------------------------------------
    await ejecutarCaso('B4. Bloqueo reversión con partida conciliada, desconciliación, reversión y reimportación limpia', async () => {
      const conc = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/partidas/conciliar`,
        sesionSenior.accessToken,
        'POST',
        {
          extractoLineaId: primeraLineaId,
          estadoConciliacion: 'CONCILIADO_MANUAL',
          observacion: 'Conciliación temporal para probar bloqueo de reversión',
        }
      );
      assert.equal(conc.status, 200);

      // Intentar revertir con partida conciliada -> 409 IMPORTACION_CON_PARTIDAS_CONCILIADAS
      const revBloq = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/importaciones/${importMes1Id}/revertir`,
        sesionSenior.accessToken,
        'POST',
        { motivo: 'Intento de reversión con partida conciliada' }
      );
      assert.equal(revBloq.status, 409);
      assert.equal(revBloq.body?.details?.codigo, 'IMPORTACION_CON_PARTIDAS_CONCILIADAS');

      // Desconciliar
      const desconc = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/partidas/desconciliar`,
        sesionSenior.accessToken,
        'POST',
        {
          extractoLineaId: primeraLineaId,
          motivo: 'Desconciliar antes de revertir lote',
        }
      );
      assert.equal(desconc.status, 200);

      // Revertir lote
      const revOk = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/importaciones/${importMes1Id}/revertir`,
        sesionSenior.accessToken,
        'POST',
        { motivo: 'Corrección de archivo del banco marzo 2026' }
      );
      assert.equal(revOk.status, 200);
      assert.equal(revOk.body?.data?.estado, 'REVERTIDO');
      assert.equal(revOk.body?.data?.filasEliminadas, 5);
      assert.equal(revOk.body?.data?.extractoAnulado, true);

      // Verificar en BD: extracto_lineas borradas, extracto_import REVERTIDO, extractos_bancarios ANULADO, extracto_linea_raw INTACTO
      const pgLineas = await queryEnEmpresa<{ total: number }>(
        pool,
        empA,
        usrAdmin,
        `SELECT COUNT(*)::int AS total FROM extracto_lineas WHERE empresa_id = $1 AND import_id = $2`,
        [empA, importMes1Id]
      );
      assert.equal(pgLineas.rows[0].total, 0);

      const pgRaw = await queryEnEmpresa<{ total: number }>(
        pool,
        empA,
        usrAdmin,
        `SELECT COUNT(*)::int AS total FROM extracto_linea_raw WHERE empresa_id = $1 AND import_id = $2`,
        [empA, importMes1Id]
      );
      assert.equal(pgRaw.rows[0].total, 5, 'extracto_linea_raw debe conservar sus 5 filas tras la reversión');

      const pgImport = await queryEnEmpresa<{ estado: string; ext_estado: string }>(
        pool,
        empA,
        usrAdmin,
        `SELECT ei.estado, eb.estado AS ext_estado
         FROM extracto_import ei
         JOIN extractos_bancarios eb ON eb.id = ei.extracto_bancario_id
         WHERE ei.id = $1`,
        [importMes1Id]
      );
      assert.equal(pgImport.rows[0].estado, 'REVERTIDO');
      assert.equal(pgImport.rows[0].ext_estado, 'ANULADO');

      // Reimportar el mismo archivo sin choque con uq_extracto_hash ni uq_extracto_lineas_emp_hash_activo
      const reimp = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/importaciones/confirmar`,
        sesionSenior.accessToken,
        'POST',
        {
          cuentaFinancieraId: cuentaAId,
          periodo: '2026-03',
          perfilCodigo: 'BCP_ESTANDAR',
          nombreArchivo: 'extracto_bcp_202603.csv',
          contentType: 'text/csv',
          contenidoBase64: bcpCsvMes1Base64,
        }
      );
      assert.equal(reimp.status, 201);
      assert.equal(reimp.body?.data?.yaExistiaSinNuevas, false);
      assert.equal(reimp.body?.data?.filasNuevas, 5);
      assert.notEqual(reimp.body?.data?.importId, importMes1Id);
    });

    // ------------------------------------------------------------------
    // B5. CRUD Perfiles/Reglas, RBAC (AUDITOR_REVISOR y ASISTENTE_CONTABLE), Auditoría y Regresión flag apagado
    // ------------------------------------------------------------------
    await ejecutarCaso('B5. CRUD perfiles/reglas, RBAC Auditor/Asistente, cadena auditoria_log y regresión flag apagado', async () => {
      // CRUD Perfil
      const crearPerf = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/perfiles`,
        sesionSenior.accessToken,
        'POST',
        {
          codigo: `PERFIL_CRUD_${sufijo.toUpperCase()}`,
          nombre: 'Perfil Banco Custom',
          banco: 'BBVA',
          formato: 'CSV',
          delimitador: ',',
          mapeoColumnas: {
            fecha: 'Fecha',
            descripcion: 'Concepto',
            referencia: 'Referencia',
            monto: 'Importe',
            saldo: 'Saldo',
          },
        }
      );
      assert.equal(crearPerf.status, 201);
      const perfId = crearPerf.body.data.id as string;

      const updPerf = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/perfiles/${perfId}`,
        sesionSenior.accessToken,
        'PUT',
        { nombre: 'Perfil Banco Custom Editado' }
      );
      assert.equal(updPerf.status, 200);
      assert.equal(updPerf.body.data.nombre, 'Perfil Banco Custom Editado');

      // CRUD Regla
      const crearRegla = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/reglas-clasificacion`,
        sesionSenior.accessToken,
        'POST',
        {
          nombre: `REGLA_CRUD_${sufijo.toUpperCase()}`,
          tipoClasificacion: 'PLANILLA',
          patronTexto: 'REMUNERACIONES',
          tipoCoincidencia: 'CONTIENE',
          sentidoMonto: 'CARGO',
          prioridad: 20,
        }
      );
      assert.equal(crearRegla.status, 201);
      const reglaId = crearRegla.body.data.id as string;

      const updRegla = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/reglas-clasificacion/${reglaId}`,
        sesionSenior.accessToken,
        'PUT',
        { prioridad: 12 }
      );
      assert.equal(updRegla.status, 200);
      assert.equal(updRegla.body.data.prioridad, 12);

      // Eliminar perfil y regla CRUD
      const delPerf = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/perfiles/${perfId}`,
        sesionSenior.accessToken,
        'DELETE'
      );
      assert.equal(delPerf.status, 200);

      const delRegla = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/reglas-clasificacion/${reglaId}`,
        sesionSenior.accessToken,
        'DELETE'
      );
      assert.equal(delRegla.status, 200);

      // RBAC AUDITOR_REVISOR: solo lectura (200 en GET, 403 en mutaciones)
      const audGetPerfiles = await apiFetch(`/empresas/${empA}/conciliacion-v2/perfiles`, sesionAuditor.accessToken);
      assert.equal(audGetPerfiles.status, 200);
      const audGetReglas = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/reglas-clasificacion`,
        sesionAuditor.accessToken
      );
      assert.equal(audGetReglas.status, 200);
      const audGetImp = await apiFetch(`/empresas/${empA}/conciliacion-v2/importaciones`, sesionAuditor.accessToken);
      assert.equal(audGetImp.status, 200);
      const audPlantilla = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/importaciones/plantilla-csv`,
        sesionAuditor.accessToken
      );
      assert.equal(audPlantilla.status, 200);
      assert.ok(audPlantilla.text.includes('Fecha,Descripcion,Referencia,Abono,Cargo,Saldo'));

      const audPostPerfil = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/perfiles`,
        sesionAuditor.accessToken,
        'POST',
        { codigo: 'NO_PERMITIDO', nombre: 'X', banco: 'BCP', formato: 'CSV', mapeoColumnas: { fecha: 'F', descripcion: 'D', monto: 'M' } }
      );
      assert.equal(audPostPerfil.status, 403);
      const audPostRegla = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/reglas-clasificacion`,
        sesionAuditor.accessToken,
        'POST',
        { nombre: 'NO_PERMITIDO', tipoClasificacion: 'OTRO', patronTexto: 'XX' }
      );
      assert.equal(audPostRegla.status, 403);
      const audPrev = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/importaciones/previsualizar`,
        sesionAuditor.accessToken,
        'POST',
        {
          cuentaFinancieraId: cuentaBbvaId,
          nombreArchivo: 'bbva.csv',
          contenidoBase64: aBase64(construirExtractoBbvaCsv()),
        }
      );
      assert.equal(audPrev.status, 403);
      const audConf = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/importaciones/confirmar`,
        sesionAuditor.accessToken,
        'POST',
        {
          cuentaFinancieraId: cuentaBbvaId,
          nombreArchivo: 'bbva.csv',
          contenidoBase64: aBase64(construirExtractoBbvaCsv()),
        }
      );
      assert.equal(audConf.status, 403);

      // RBAC ASISTENTE_CONTABLE: puede previsualizar y confirmar (200/201), pero 403 en revertir y editar perfiles/reglas
      const bbvaB64 = aBase64(construirExtractoBbvaCsv());
      const asisPrev = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/importaciones/previsualizar`,
        sesionAsistente.accessToken,
        'POST',
        {
          cuentaFinancieraId: cuentaBbvaId,
          periodo: '2026-03',
          perfilCodigo: 'BBVA_ESTANDAR',
          nombreArchivo: 'bbva_202603.csv',
          contenidoBase64: bbvaB64,
        }
      );
      assert.equal(asisPrev.status, 200);
      assert.equal(asisPrev.body?.data?.valido, true);

      const asisConf = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/importaciones/confirmar`,
        sesionAsistente.accessToken,
        'POST',
        {
          cuentaFinancieraId: cuentaBbvaId,
          periodo: '2026-03',
          perfilCodigo: 'BBVA_ESTANDAR',
          nombreArchivo: 'bbva_202603.csv',
          contenidoBase64: bbvaB64,
        }
      );
      assert.equal(asisConf.status, 201);
      const importBbvaId = asisConf.body.data.importId as string;

      const asisRev = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/importaciones/${importBbvaId}/revertir`,
        sesionAsistente.accessToken,
        'POST',
        { motivo: 'Intento asistente sin permiso' }
      );
      assert.equal(asisRev.status, 403);

      const asisPostPerfil = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/perfiles`,
        sesionAsistente.accessToken,
        'POST',
        { codigo: 'ASIS_NO', nombre: 'X', banco: 'BCP', formato: 'CSV', mapeoColumnas: { fecha: 'F', descripcion: 'D', monto: 'M' } }
      );
      assert.equal(asisPostPerfil.status, 403);

      const asisPostRegla = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/reglas-clasificacion`,
        sesionAsistente.accessToken,
        'POST',
        { nombre: 'ASIS_NO', tipoClasificacion: 'OTRO', patronTexto: 'XX' }
      );
      assert.equal(asisPostRegla.status, 403);

      // Cadena de auditoría intacta
      const integridad = await conciliacionV2Service.obtenerConfig(empA);
      assert.equal(integridad.conciliacionV2Habilitada, true);
      const checkAud = await conContextoEmpresa(empA, usrAdmin, () =>
        auditoriaChainService.verificarIntegridad(empA)
      );
      assert.equal(checkAud.valido, true, `Cadena de auditoría corrupta: ${checkAud.mensaje}`);
      assert.ok(checkAud.totalRegistros >= 6, `Esperados >= 6 registros de auditoría, obtenidos ${checkAud.totalRegistros}`);

      // Regresión con flag CONCILIACION_V2 apagado -> endpoints legacy intactos
      const cfgOff = await apiFetch(
        `/empresas/${empA}/conciliacion-v2/config`,
        sesionAdmin.accessToken,
        'PUT',
        { conciliacionV2Habilitada: false }
      );
      assert.equal(cfgOff.status, 200);
      assert.equal(cfgOff.body?.data?.conciliacionV2Habilitada, false);

      const legacyCuentas = await apiFetch(`/empresas/${empA}/cuentas-financieras`, sesionSenior.accessToken);
      assert.equal(legacyCuentas.status, 200);
      assert.ok(Array.isArray(legacyCuentas.body?.data) && legacyCuentas.body.data.length >= 2);

      const legacyConc = await apiFetch(
        `/empresas/${empA}/conciliaciones?cuentaFinancieraId=${cuentaAId}&periodoId=${per202603A}&fechaCorte=2026-03-31`,
        sesionSenior.accessToken
      );
      assert.equal(legacyConc.status, 200);
      assert.equal(legacyConc.body?.success, true);
    });
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
          [`DELETE FROM conciliaciones_bancarias WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM extracto_lineas WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM extractos_bancarios WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM conciliacion_reglas_clasificacion WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM conciliacion_perfiles_banco WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM movimientos_tesoreria WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM conciliacion_config_empresa WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM cuentas_financieras WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM subdiarios WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM plan_cuentas WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM periodos WHERE empresa_id = $1`, [empId]],
          [`DELETE FROM ejercicios WHERE empresa_id = $1`, [empId]],
        ] as const;

        for (const [sql, params] of sentencias) {
          try {
            await cleanClient.query(sql, [...params]);
          } catch {
            // Ignorar tablas protegidas por triggers inmutables
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
        [`DELETE FROM usuarios_estudio WHERE id = ANY($1::uuid[])`, [[usrAdmin, usrSenior, usrAsistente, usrAuditor, usrSoloB]]],
        [`DELETE FROM tenants WHERE id = $1`, [tenantId]],
      ] as const) {
        try {
          await cleanClient.query(sql, [...params]);
        } catch {
          // auditoria_log y extracto_linea_raw son inmutables y conservan trazas de prueba con UUID único
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
    `🎉 CONCILIACIÓN BANCARIA V2 FASE 2: ${casosPasados}/${totalCasos} casos aprobados`
  );
  console.log('====================================================================');
}

main().catch((err) => {
  console.error('\n❌ FALLO EN SUITE CONCILIACIÓN V2 FASE 2:', err);
  process.exitCode = 1;
});
