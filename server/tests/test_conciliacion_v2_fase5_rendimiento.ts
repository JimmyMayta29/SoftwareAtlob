import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import bcrypt from 'bcryptjs';
import { parse } from 'dotenv';
import { Pool, type PoolClient } from 'pg';

function resolverTestDatabaseUrl(): string {
  const localEnv = existsSync('.env') ? parse(readFileSync('.env', 'utf8')) : {};
  const url = process.env.TEST_DATABASE_URL ?? localEnv.TEST_DATABASE_URL;
  assert.ok(
    url,
    'TEST_DATABASE_URL requerida en entorno o .env para ejecutar la prueba de rendimiento en atlob_test.'
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

function centsToDecimalString(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${neg ? '-' : ''}${whole.toString()}.${frac.toString().padStart(2, '0')}`;
}

interface MovimientoSeedSpec {
  id: string;
  fecha: string;
  tipo: 'INGRESO' | 'EGRESO';
  medioPago: string;
  numeroOperacion: string | null;
  importeStr: string;
  signedCents: bigint;
  glosa: string;
}

function generarDatasetSintetico5000(): {
  movimientos: MovimientoSeedSpec[];
  csvTexto: string;
  saldoFinalEsperado: string;
} {
  const movimientos: MovimientoSeedSpec[] = [];
  const csvLineas: string[] = ['Fecha,Descripción operación,Nro. operación,Monto,Saldo'];
  let saldoAcumuladoCents = 0n;

  // 1) 4,500 movimientos Capa 1 (numero_operacion único OP5-00001..OP5-04500 e importes variados determinísticos)
  for (let i = 1; i <= 4500; i += 1) {
    const op = `OP5-${String(i).padStart(5, '0')}`;
    const dia = String(((i - 1) % 28) + 1).padStart(2, '0');
    const fechaIso = `2026-11-${dia}`;
    const fechaCsv = `${dia}/11/2026`;
    const tipo: 'INGRESO' | 'EGRESO' = i % 3 === 0 ? 'INGRESO' : 'EGRESO';
    const magCents = BigInt(10000 + ((i * 137) % 90000)); // 100.00 .. 999.99
    const signedCents = tipo === 'INGRESO' ? magCents : -magCents;
    const importeStr = centsToDecimalString(magCents);
    const glosa = `Operacion Capa 1 ${op}`;

    movimientos.push({
      id: randomUUID(),
      fecha: fechaIso,
      tipo,
      medioPago: '003',
      numeroOperacion: op,
      importeStr,
      signedCents,
      glosa,
    });

    saldoAcumuladoCents += signedCents;
    const descCsv =
      tipo === 'INGRESO' ? `ABONO CLIENTE ${op}` : `TRANSFERENCIA PROVEEDOR ${op}`;
    csvLineas.push(
      `${fechaCsv},${descCsv},${op},${centsToDecimalString(signedCents)},${centsToDecimalString(saldoAcumuladoCents)}`
    );
  }

  // 2) 300 movimientos Capa 2 (sin numero_operacion, fecha/monto/glosa única determinística)
  for (let j = 1; j <= 300; j += 1) {
    const dia = String(((j - 1) % 28) + 1).padStart(2, '0');
    const fechaIso = `2026-11-${dia}`;
    const fechaCsv = `${dia}/11/2026`;
    const tipo: 'INGRESO' | 'EGRESO' = j % 2 === 0 ? 'INGRESO' : 'EGRESO';
    const magCents = BigInt(200000 + j * 100 + (j % 7) * 13); // 2001.00 .. 2300.78
    const signedCents = tipo === 'INGRESO' ? magCents : -magCents;
    const importeStr = centsToDecimalString(magCents);
    const tag = `C2X${String(j).padStart(3, '0')}`;
    const glosa = `SERVICIO PROVEEDOR ${tag} LIMA`;

    movimientos.push({
      id: randomUUID(),
      fecha: fechaIso,
      tipo,
      medioPago: '003',
      numeroOperacion: null,
      importeStr,
      signedCents,
      glosa,
    });

    saldoAcumuladoCents += signedCents;
    csvLineas.push(
      `${fechaCsv},${glosa},,${centsToDecimalString(signedCents)},${centsToDecimalString(saldoAcumuladoCents)}`
    );
  }

  // 3) 200 movimientos sin correspondencia en extracto (en tránsito en libros)
  for (let k = 1; k <= 200; k += 1) {
    const dia = String(((k - 1) % 28) + 1).padStart(2, '0');
    const fechaIso = `2026-11-${dia}`;
    const tipo: 'INGRESO' | 'EGRESO' = k % 2 === 0 ? 'INGRESO' : 'EGRESO';
    const magCents = BigInt(700000 + k * 107); // 7001.07 .. 7214.00
    const glosa = `MOVIMIENTO TRANSITO LIBRO ${String(k).padStart(3, '0')}`;

    movimientos.push({
      id: randomUUID(),
      fecha: fechaIso,
      tipo,
      medioPago: '003',
      numeroOperacion: null,
      importeStr: centsToDecimalString(magCents),
      signedCents: tipo === 'INGRESO' ? magCents : -magCents,
      glosa,
    });
  }

  // 4) 200 líneas CSV sin match en libros
  for (let k = 1; k <= 200; k += 1) {
    const dia = String(((k - 1) % 28) + 1).padStart(2, '0');
    const fechaCsv = `${dia}/11/2026`;
    const signo: 1 | -1 = k % 2 === 0 ? 1 : -1;
    const magCents = BigInt(900000 + k * 113); // 9001.13 .. 9226.00
    const signedCents = signo === 1 ? magCents : -magCents;
    const descCsv = `MOVIMIENTO BANCO SIN REGISTRO ${String(k).padStart(3, '0')}`;

    saldoAcumuladoCents += signedCents;
    csvLineas.push(
      `${fechaCsv},${descCsv},,${centsToDecimalString(signedCents)},${centsToDecimalString(saldoAcumuladoCents)}`
    );
  }

  assert.equal(movimientos.length, 5000, 'Deben existir exactamente 5000 movimientos sintéticos.');
  assert.equal(csvLineas.length, 5001, 'El CSV debe tener 1 encabezado + 5000 líneas.');

  return {
    movimientos,
    csvTexto: `${csvLineas.join('\n')}\n`,
    saldoFinalEsperado: centsToDecimalString(saldoAcumuladoCents),
  };
}

interface ExplainResumen {
  titulo: string;
  executionTimeMs: number | null;
  sharedHitBlocks: number | null;
  tieneSubPlan: boolean;
  planLines: string[];
  jsonPlanStr: string;
}

async function ejecutarExplain(
  client: PoolClient,
  titulo: string,
  sql: string,
  params: unknown[]
): Promise<ExplainResumen> {
  const res = await client.query<{ 'QUERY PLAN': string }>(
    `EXPLAIN (ANALYZE, BUFFERS) ${sql}`,
    params
  );
  const planLines = res.rows.map((r) => r['QUERY PLAN']);
  console.log(`\n--- EXPLAIN (ANALYZE, BUFFERS): ${titulo} ---`);
  for (const line of planLines) {
    console.log(line);
  }

  const jsonRes = await client.query<{ 'QUERY PLAN': unknown[] }>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
    params
  );
  const jsonPlanRaw = jsonRes.rows[0]?.['QUERY PLAN'] ?? [];
  const jsonPlanStr = JSON.stringify(jsonPlanRaw);
  const firstEntry = (Array.isArray(jsonPlanRaw) ? jsonPlanRaw[0] : undefined) as
    | {
        'Execution Time'?: number;
        Plan?: { 'Shared Hit Blocks'?: number };
      }
    | undefined;

  const executionTimeMs =
    typeof firstEntry?.['Execution Time'] === 'number'
      ? Number(firstEntry['Execution Time'].toFixed(3))
      : null;
  const sharedHitBlocks =
    typeof firstEntry?.Plan?.['Shared Hit Blocks'] === 'number'
      ? firstEntry.Plan['Shared Hit Blocks']
      : null;
  const tieneSubPlan =
    jsonPlanStr.includes('SubPlan') || planLines.some((line) => line.includes('SubPlan'));

  return {
    titulo,
    executionTimeMs,
    sharedHitBlocks,
    tieneSubPlan,
    planLines,
    jsonPlanStr,
  };
}

async function main() {
  const tComandoStart = performance.now();
  const testDbUrl = resolverTestDatabaseUrl();

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = '';

  console.log('\n====================================================================');
  console.log('⚡ FASE 5 — LÍNEA BASE DE RENDIMIENTO POSTGRESQL (5,000 x 5,000)');
  console.log('====================================================================');

  const pool = new Pool({
    connectionString: testDbUrl,
    options: '-c search_path=public,pg_catalog',
    max: 10,
    connectionTimeoutMillis: 10000,
  });

  const { env } = await import('../config/env');
  env.NODE_ENV = 'test';
  const { setPostgresPool, conContextoEmpresa } = await import('../config/database');
  const { runMigrations } = await import('../db/migrate');
  setPostgresPool(pool, true);

  const { auditoriaChainService } = await import('../services/auditoriaChainService');
  const { importacionExtractoService } = await import(
    '../services/conciliacion/importacion/importacionExtractoService'
  );
  const { conciliacionV2Service } = await import('../services/conciliacionV2Service');
  const { matchingService } = await import('../services/conciliacion/matching/matchingService');

  // Verificación estricta de seguridad sobre atlob_test / contabilidad_app
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
  const empresaId = randomUUID();
  const usuarioId = randomUUID();
  const ejercicioId = randomUUID();
  const periodoId = randomUUID();
  const subdiarioId = randomUUID();
  const cta10411Id = randomUUID();
  const cta5011Id = randomUUID();
  const cuentaFinancieraId = randomUUID();
  const asientoRefId = randomUUID();
  const asientoDet1Id = randomUUID();
  const asientoDet2Id = randomUUID();

  const sufijo = tenantId.slice(0, 8);
  const ruc = `2099${String(randomInt(1000000, 9999999))}`;
  const hashDummy = await bcrypt.hash(randomUUID(), 4);

  const { movimientos, csvTexto, saldoFinalEsperado } = generarDatasetSintetico5000();

  try {
    // ------------------------------------------------------------------
    // 1. Seed sintético determinístico con UNNEST rápido
    // ------------------------------------------------------------------
    const tSeedInicio = performance.now();
    const seedClient = await pool.connect();
    try {
      await seedClient.query('BEGIN');

      await seedClient.query(
        `INSERT INTO tenants (id, nombre, subdominio, estado) VALUES ($1, $2, $3, 'ACTIVO')`,
        [tenantId, `Tenant Concil V2 F5 ${sufijo}`, `concil-f5-${sufijo}`]
      );

      await seedClient.query(
        `INSERT INTO usuarios_estudio (id, email, password_hash, nombre, rol_global, is_active)
         VALUES ($1, $2, $3, 'Admin F5 Perf', 'ADMINISTRADOR', true)`,
        [usuarioId, `admin.f5.${sufijo}@atlob.test`, hashDummy]
      );

      await seedClient.query(
        `INSERT INTO empresas (id, tenant_id, codigo_empresa, ruc, razon_social, regimen_tributario, domicilio_fiscal, moneda_principal, is_active)
         VALUES ($1, $2, $3, $4, 'EMPRESA CONCIL F5 PERF SAC', 'REGIMEN_GENERAL', 'Av. F5 5000', 'PEN', true)`,
        [empresaId, tenantId, `EMP-F5-${sufijo}`, ruc]
      );

      await fijarContextoRls(seedClient, empresaId, usuarioId);

      await seedClient.query(
        `INSERT INTO usuario_empresa (id, usuario_id, empresa_id, rol_en_empresa, estado)
         VALUES ($1, $2, $3, 'ADMINISTRADOR', 'ACTIVO')`,
        [randomUUID(), usuarioId, empresaId]
      );

      await seedClient.query(
        `INSERT INTO ejercicios (id, empresa_id, anio, estado) VALUES ($1, $2, 2026, 'ABIERTO')`,
        [ejercicioId, empresaId]
      );

      await seedClient.query(
        `INSERT INTO periodos (id, empresa_id, ejercicio_id, anio, mes, codigo_periodo, estado)
         VALUES ($1, $2, $3, 2026, 11, '2026-11', 'ABIERTO')`,
        [periodoId, empresaId, ejercicioId]
      );

      await seedClient.query(
        `INSERT INTO subdiarios (id, empresa_id, codigo, descripcion, tipo, is_active)
         VALUES ($1, $2, '05', 'BANCOS F5', 'BANCOS', true)`,
        [subdiarioId, empresaId]
      );

      await seedClient.query(
        `INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento, is_active)
         VALUES
           ($1, $3, '10411', 'Banco BCP F5 MN', 5, 'ACTIVO', true, true),
           ($2, $3, '5011',  'Capital Social F5', 4, 'PATRIMONIO', true, true)`,
        [cta10411Id, cta5011Id, empresaId]
      );

      await seedClient.query(
        `INSERT INTO cuentas_financieras (
           id, empresa_id, tipo, banco, numero, moneda, cuenta_contable_codigo, cuenta_contable_id, saldo_inicial, saldo_actual, activa
         ) VALUES ($1, $2, 'BANCO', 'BCP', '193-995000-F5', 'PEN', '10411', $3, 0.00, 0.00, true)`,
        [cuentaFinancieraId, empresaId, cta10411Id]
      );

      await seedClient.query(
        `INSERT INTO conciliacion_config_empresa (
           empresa_id, conciliacion_v2_habilitada, tolerancia_dias, tolerancia_monto, umbral_auto_match,
           cuenta_itf_codigo, cuenta_comision_codigo, cuenta_interes_gasto_codigo, cuenta_interes_ingreso_codigo
         ) VALUES ($1, true, 3, 0.00, 0.9000, '6412', '6391', '67311', NULL)`,
        [empresaId]
      );

      // 1 asiento de referencia para los movimientos de tesorería
      await seedClient.query(
        `INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, numero, cuo, fecha, glosa, moneda, estado)
         VALUES ($1, $2, $3, $4, '05110001', $5, '2026-11-01', 'Asiento referencia tesoreria F5', 'PEN', 'BORRADOR')`,
        [asientoRefId, empresaId, periodoId, subdiarioId, `CUO-F5-${sufijo}`]
      );
      await seedClient.query(
        `INSERT INTO asiento_detalle (id, asiento_id, empresa_id, linea, cuenta_id, debe, haber, glosa_linea)
         VALUES
           ($1, $3, $4, 1, $5, 100.00, 0.00, 'Referencia banco 10411'),
           ($2, $3, $4, 2, $6, 0.00, 100.00, 'Contrapartida capital 5011')`,
        [asientoDet1Id, asientoDet2Id, asientoRefId, empresaId, cta10411Id, cta5011Id]
      );

      // Inserción masiva de 5,000 movimientos de tesorería con UNNEST
      const ids = movimientos.map((m) => m.id);
      const fechas = movimientos.map((m) => m.fecha);
      const tipos = movimientos.map((m) => m.tipo);
      const mediosPago = movimientos.map((m) => m.medioPago);
      const numerosOp = movimientos.map((m) => m.numeroOperacion);
      const importes = movimientos.map((m) => m.importeStr);
      const glosas = movimientos.map((m) => m.glosa);

      await seedClient.query(
        `INSERT INTO movimientos_tesoreria (
           id, empresa_id, periodo_id, cuenta_financiera_id,
           fecha, tipo, medio_pago, numero_operacion,
           moneda, tipo_cambio, importe, glosa,
           estado, conciliado, asiento_id, created_by
         )
         SELECT
           u.id,
           $1::uuid,
           $2::uuid,
           $3::uuid,
           u.fecha,
           u.tipo,
           u.medio_pago,
           u.numero_operacion,
           'PEN',
           1.0000,
           u.importe,
           u.glosa,
           'REGISTRADO',
           false,
           $4::uuid,
           $5::uuid
         FROM UNNEST(
           $6::uuid[],
           $7::date[],
           $8::varchar[],
           $9::varchar[],
           $10::varchar[],
           $11::numeric[],
           $12::text[]
         ) AS u(id, fecha, tipo, medio_pago, numero_operacion, importe, glosa)`,
        [
          empresaId,
          periodoId,
          cuentaFinancieraId,
          asientoRefId,
          usuarioId,
          ids,
          fechas,
          tipos,
          mediosPago,
          numerosOp,
          importes,
          glosas,
        ]
      );

      await seedClient.query('COMMIT');
    } catch (err) {
      await seedClient.query('ROLLBACK');
      throw err;
    } finally {
      seedClient.release();
    }
    const tSeedMs = Number((performance.now() - tSeedInicio).toFixed(2));
    console.log(`✅ Seed sintético completado en ${tSeedMs} ms (5,000 movimientos_tesoreria).`);

    // ------------------------------------------------------------------
    // 2. Medición a) confirmarImportacion (5,000 líneas CSV)
    // ------------------------------------------------------------------
    const csvBase64 = Buffer.from(csvTexto, 'utf8').toString('base64');
    const tImportStart = performance.now();
    const resImport = await conContextoEmpresa(empresaId, usuarioId, () =>
      importacionExtractoService.confirmarImportacion(
        empresaId,
        {
          cuentaFinancieraId,
          nombreArchivo: `extracto_f5_5000_${sufijo}.csv`,
          contentType: 'text/csv',
          contenidoBase64: csvBase64,
          perfilCodigo: 'BCP_ESTANDAR',
          periodo: '2026-11',
          saldoInicialDeclarado: '0.00',
          saldoFinalDeclarado: saldoFinalEsperado,
        },
        usuarioId
      )
    );
    const tImportMs = Number((performance.now() - tImportStart).toFixed(2));
    assert.equal(
      resImport.filasNuevas,
      5000,
      `Se esperaban 5000 filasNuevas, recibido: ${resImport.filasNuevas}`
    );
    assert.equal(resImport.saldoFinal, saldoFinalEsperado);
    assert.ok(
      tImportMs < 15000,
      `Regresión de rendimiento en confirmarImportacion (5,000 filas): ${tImportMs} ms >= 15000 ms`
    );
    console.log(
      `✅ Importación CSV 5,000 filas: ${tImportMs} ms (filasNuevas=${resImport.filasNuevas}, saldoFinal=${resImport.saldoFinal})`
    );

    // ------------------------------------------------------------------
    // 3. Medición b) obtenerResumenConciliacion (antes de matching)
    // ------------------------------------------------------------------
    const tResumenAntesStart = performance.now();
    const resumenAntes = await conContextoEmpresa(empresaId, usuarioId, () =>
      conciliacionV2Service.obtenerResumenConciliacion(empresaId, cuentaFinancieraId, '2026-11')
    );
    const tResumenAntesMatchMs = Number((performance.now() - tResumenAntesStart).toFixed(2));
    assert.equal(
      resumenAntes.conteos.totalExtracto,
      5000,
      `totalExtracto esperado 5000, recibido ${resumenAntes.conteos.totalExtracto}`
    );
    assert.equal(
      resumenAntes.conteos.totalLibros,
      5000,
      `totalLibros esperado 5000, recibido ${resumenAntes.conteos.totalLibros}`
    );
    assert.ok(
      tResumenAntesMatchMs < 2000,
      `Regresión de rendimiento en obtenerResumenConciliacion pre-matching: ${tResumenAntesMatchMs} ms >= 2000 ms`
    );
    console.log(
      `✅ obtenerResumen (pre-matching): ${tResumenAntesMatchMs} ms (totalExtracto=${resumenAntes.conteos.totalExtracto}, totalLibros=${resumenAntes.conteos.totalLibros})`
    );

    // ------------------------------------------------------------------
    // 4. Medición c) ejecutarMatching (5,000 x 5,000)
    // ------------------------------------------------------------------
    const tMatchingStart = performance.now();
    const resMatching = await conContextoEmpresa(empresaId, usuarioId, () =>
      matchingService.ejecutarMatching(empresaId, usuarioId, {
        cuentaFinancieraId,
        periodo: '2026-11',
      })
    );
    const tMatchingMs = Number((performance.now() - tMatchingStart).toFixed(2));
    assert.ok(
      resMatching.autoConciliados + resMatching.sugeridos >= 4500,
      `Se esperaba autoConciliados + sugeridos >= 4500, recibido: ${resMatching.autoConciliados} + ${resMatching.sugeridos}`
    );
    assert.ok(
      tMatchingMs < 25000,
      `Regresión de rendimiento en ejecutarMatching (5,000 x 5,000): ${tMatchingMs} ms >= 25000 ms`
    );
    console.log(
      `✅ ejecutarMatching: ${tMatchingMs} ms (autoConciliados=${resMatching.autoConciliados}, sugeridos=${resMatching.sugeridos}, totalGrupos=${resMatching.gruposCreados.length})`
    );

    // ------------------------------------------------------------------
    // 5. Medición d) obtenerResumenConciliacion (post-matching)
    // ------------------------------------------------------------------
    const tResumenPostStart = performance.now();
    const resumenPost = await conContextoEmpresa(empresaId, usuarioId, () =>
      conciliacionV2Service.obtenerResumenConciliacion(empresaId, cuentaFinancieraId, '2026-11')
    );
    const tResumenPostMatchMs = Number((performance.now() - tResumenPostStart).toFixed(2));
    assert.equal(resumenPost.conteos.totalExtracto, 5000);
    assert.equal(resumenPost.conteos.totalLibros, 5000);
    assert.ok(
      tResumenPostMatchMs < 2000,
      `Regresión de rendimiento en obtenerResumenConciliacion post-matching: ${tResumenPostMatchMs} ms >= 2000 ms`
    );
    console.log(
      `✅ obtenerResumen (post-matching): ${tResumenPostMatchMs} ms (conciliadasExtracto=${resumenPost.conteos.conciliadasExtracto}, conciliadosLibros=${resumenPost.conteos.conciliadosLibros})`
    );

    // ------------------------------------------------------------------
    // 6. EXPLAIN (ANALYZE, BUFFERS) en transacción RLS real
    // ------------------------------------------------------------------
    let explainExtracto!: ExplainResumen;
    let explainMovimientos!: ExplainResumen;
    let explainMapaGruposPasoA!: ExplainResumen;
    let explainMapaItemsPasoB!: ExplainResumen;
    let explainCargarGrupos!: ExplainResumen;
    let explainCargarItemsPlano!: ExplainResumen;
    let explainLookupExtracto!: ExplainResumen;
    let explainLookupMovimientos!: ExplainResumen;

    const grupoIdsUnicos = Array.from(
      new Set(resMatching.gruposCreados.map((g) => g.id))
    ).sort();
    const extractoLineaIds = Array.from(
      new Set(
        resMatching.gruposCreados.flatMap((g) =>
          g.itemsBanco
            .map((it) => it.extractoLineaId)
            .filter((id): id is string => Boolean(id))
        )
      )
    ).sort();
    const movimientoTesoreriaIds = Array.from(
      new Set(
        resMatching.gruposCreados.flatMap((g) =>
          g.itemsLibro
            .map((it) => it.movimientoTesoreriaId)
            .filter((id): id is string => Boolean(id))
        )
      )
    ).sort();

    const explainClient = await pool.connect();
    try {
      await explainClient.query('BEGIN');
      await fijarContextoRls(explainClient, empresaId, usuarioId);

      // 1) Query real de extracto_lineas usada en obtenerResumenConciliacionEnTx (sin JOINs a conciliacion ni SubPlan)
      explainExtracto = await ejecutarExplain(
        explainClient,
        '1) extracto_lineas (obtenerResumenConciliacionEnTx, sin JOINs ni SubPlan)',
        `SELECT el.id,
                el.extracto_id AS "extractoId",
                el.fecha::text AS fecha,
                el.descripcion,
                el.referencia,
                el.monto::text AS monto,
                el.saldo::text AS saldo,
                el.conciliada,
                el.estado_conciliacion AS "estadoConciliacionRaw",
                el.movimiento_tesoreria_id AS "movimientoTesoreriaId",
                el.diferencia_importe::text AS "diferenciaImporte",
                el.observacion_conciliacion AS "observacionConciliacion",
                el.conciliado_en AS "conciliadoEn",
                el.import_id AS "importId",
                el.linea_raw_id AS "lineaRawId",
                el.tipo_clasificacion AS "tipoClasificacion",
                el.ruc_extraido AS "rucExtraido",
                el.contraparte_extraida AS "contraparteExtraida",
                el.doc_extraido AS "docExtraido"
         FROM extracto_lineas el
         JOIN extractos_bancarios eb
           ON eb.id = el.extracto_id
          AND eb.empresa_id = el.empresa_id
         WHERE el.empresa_id = $1
           AND eb.cuenta_financiera_id = $2
           AND eb.estado <> 'ANULADO'
           AND el.fecha BETWEEN $3 AND $4
         ORDER BY el.fecha ASC, el.created_at ASC`,
        [empresaId, cuentaFinancieraId, '2026-11-01', '2026-11-30']
      );

      assert.equal(
        explainExtracto.jsonPlanStr.includes('SubPlan'),
        false,
        `Regresión N+1 detectada en EXPLAIN JSON de extracto_lineas: contiene SubPlan`
      );

      // 2) Query real de movimientos_tesoreria usada en obtenerResumenConciliacionEnTx (solo LEFT JOIN anexos, sin SubPlan)
      explainMovimientos = await ejecutarExplain(
        explainClient,
        '2) movimientos_tesoreria (obtenerResumenConciliacionEnTx, solo LEFT JOIN anexos, sin SubPlan)',
        `SELECT mt.id,
                mt.periodo_id AS "periodoId",
                mt.cuenta_financiera_id AS "cuentaFinancieraId",
                mt.fecha::text AS fecha,
                mt.tipo,
                mt.medio_pago AS "medioPago",
                mt.numero_operacion AS "numeroOperacion",
                mt.moneda,
                mt.tipo_cambio::text AS "tipoCambio",
                mt.importe::text AS importe,
                mt.glosa,
                mt.estado,
                mt.conciliado,
                mt.estado_conciliacion_libro AS "estadoConciliacionLibroRaw",
                mt.asiento_id AS "asientoId",
                mt.anexo_id AS "anexoId",
                ax.razon_social AS "anexoNombre",
                ax.numero_documento AS "anexoRuc"
         FROM movimientos_tesoreria mt
         LEFT JOIN anexos ax
           ON ax.empresa_id = mt.empresa_id
          AND ax.id = mt.anexo_id
         WHERE mt.empresa_id = $1
           AND mt.cuenta_financiera_id = $2
           AND mt.estado = 'REGISTRADO'
           AND (
             mt.fecha BETWEEN $3 AND $4
             OR (mt.fecha < $3 AND mt.conciliado = false)
           )
         ORDER BY mt.fecha ASC, mt.created_at ASC`,
        [empresaId, cuentaFinancieraId, '2026-11-01', '2026-11-30']
      );

      assert.equal(
        explainMovimientos.jsonPlanStr.includes('SubPlan'),
        false,
        `Regresión N+1 detectada en EXPLAIN JSON de movimientos_tesoreria: contiene SubPlan`
      );

      // 3a) Mapa grupos activos Paso A (obtenerResumenConciliacionEnTx)
      explainMapaGruposPasoA = await ejecutarExplain(
        explainClient,
        '3a) Mapa grupos activos Paso A (conciliacion_grupo)',
        `SELECT id, estado
         FROM conciliacion_grupo
         WHERE empresa_id = $1
           AND cuenta_financiera_id = $2
           AND estado IN ('SUGERIDO', 'CONCILIADO', 'CONCILIADO_MANUAL')
         ORDER BY created_at DESC, id DESC`,
        [empresaId, cuentaFinancieraId]
      );

      // 3b) Mapa ítems activos Paso B (obtenerResumenConciliacionEnTx, sin joins)
      explainMapaItemsPasoB = await ejecutarExplain(
        explainClient,
        '3b) Mapa ítems activos Paso B (conciliacion_item sin joins)',
        `SELECT grupo_id AS "grupoId",
                lado,
                origen_libro AS "origenLibro",
                extracto_linea_id AS "extractoLineaId",
                movimiento_tesoreria_id AS "movimientoTesoreriaId",
                asiento_detalle_id AS "asientoDetalleId"
         FROM conciliacion_item
         WHERE empresa_id = $1
           AND grupo_id = ANY($2::uuid[])`,
        [empresaId, grupoIdsUnicos]
      );

      // 4) cargarGruposConItemsEnTx (matchingService: conciliacion_grupo + conciliacion_item plano + lookup plano)
      explainCargarGrupos = await ejecutarExplain(
        explainClient,
        '4) cargarGruposConItemsEnTx (matchingService: conciliacion_grupo por ANY($2::uuid[]))',
        `SELECT cg.id,
                cg.empresa_id AS "empresaId",
                cg.cuenta_financiera_id AS "cuentaFinancieraId",
                cg.periodo_id AS "periodoId",
                cg.tipo_match AS "tipoMatch",
                cg.regla_aplicada AS "reglaAplicada",
                cg.capa_matching AS "capaMatching",
                cg.score::float8 AS score,
                cg.estado,
                cg.diferencia_monto::text AS "diferenciaMonto",
                cg.observacion,
                cg.usuario_id AS "usuarioId",
                cg.confirmado_por AS "confirmadoPor",
                cg.confirmado_en AS "confirmadoEn",
                cg.created_at AS "createdAt",
                cg.updated_at AS "updatedAt"
         FROM conciliacion_grupo cg
         WHERE cg.empresa_id = $1
           AND cg.id = ANY($2::uuid[])
         ORDER BY cg.created_at ASC, cg.id ASC`,
        [empresaId, grupoIdsUnicos]
      );

      explainCargarItemsPlano = await ejecutarExplain(
        explainClient,
        '4) cargarGruposConItemsEnTx (matchingService: conciliacion_item plano + lookup plano extracto_lineas/movimientos_tesoreria - items)',
        `SELECT id,
                grupo_id AS "grupoId",
                lado,
                origen_libro AS "origenLibro",
                extracto_linea_id AS "extractoLineaId",
                movimiento_tesoreria_id AS "movimientoTesoreriaId",
                asiento_id AS "asientoId",
                asiento_detalle_id AS "asientoDetalleId",
                monto_imputado::text AS "montoImputado"
         FROM conciliacion_item
         WHERE empresa_id = $1
           AND grupo_id = ANY($2::uuid[])
         ORDER BY created_at ASC, id ASC`,
        [empresaId, grupoIdsUnicos]
      );

      explainLookupExtracto = await ejecutarExplain(
        explainClient,
        '4) cargarGruposConItemsEnTx (matchingService: lookup plano extracto_lineas por ANY($2::uuid[]))',
        `SELECT id,
                fecha::text AS fecha,
                descripcion,
                referencia
         FROM extracto_lineas
         WHERE empresa_id = $1
           AND id = ANY($2::uuid[])`,
        [empresaId, extractoLineaIds]
      );

      explainLookupMovimientos = await ejecutarExplain(
        explainClient,
        '4) cargarGruposConItemsEnTx (matchingService: lookup plano movimientos_tesoreria por ANY($2::uuid[]))',
        `SELECT id,
                fecha::text AS fecha,
                glosa,
                numero_operacion AS "numeroOperacion"
         FROM movimientos_tesoreria
         WHERE empresa_id = $1
           AND id = ANY($2::uuid[])`,
        [empresaId, movimientoTesoreriaIds]
      );

      await explainClient.query('ROLLBACK');
    } finally {
      explainClient.release();
    }

    // ------------------------------------------------------------------
    // 7. Integridad de cadena de auditoría
    // ------------------------------------------------------------------
    const tAuditStart = performance.now();
    const integridad = await conContextoEmpresa(empresaId, usuarioId, () =>
      auditoriaChainService.verificarIntegridad(empresaId)
    );
    const tAuditMs = Number((performance.now() - tAuditStart).toFixed(2));
    assert.equal(
      integridad.valido,
      true,
      `Cadena de auditoría inválida: ${integridad.mensaje}`
    );

    const tPreCleanupMs = Number((performance.now() - tComandoStart).toFixed(2));

    const resumirExplain = (e: ExplainResumen) => ({
      titulo: e.titulo,
      executionTimeMs: e.executionTimeMs,
      sharedHitBlocks: e.sharedHitBlocks,
      tieneSubPlan: e.tieneSubPlan,
    });

    const resumenBenchmark = {
      dataset: {
        movimientosTesoreria: 5000,
        extractoLineasCsv: 5000,
        capa1Esperados: 4500,
        capa2Esperados: 300,
        enTransitoLibro: 200,
        sinMatchBanco: 200,
      },
      tiemposMs: {
        tSeedMs,
        tImportMs,
        tResumenAntesMatchMs,
        tMatchingMs,
        tResumenPostMatchMs,
        tAuditoriaIntegridadMs: tAuditMs,
        tPreCleanupMs,
      },
      explains: {
        extractoLineas: resumirExplain(explainExtracto),
        movimientosTesoreria: resumirExplain(explainMovimientos),
        mapaGruposActivos: {
          pasoAGrupos: resumirExplain(explainMapaGruposPasoA),
          pasoBItems: resumirExplain(explainMapaItemsPasoB),
        },
        cargarGruposConItems: {
          grupos: resumirExplain(explainCargarGrupos),
          itemsPlano: resumirExplain(explainCargarItemsPlano),
          lookupExtractoLineas: resumirExplain(explainLookupExtracto),
          lookupMovimientosTesoreria: resumirExplain(explainLookupMovimientos),
        },
      },
      resultados: {
        filasNuevas: resImport.filasNuevas,
        autoConciliados: resMatching.autoConciliados,
        sugeridos: resMatching.sugeridos,
        gruposCreados: resMatching.gruposCreados.length,
        diferenciaPendiente: resMatching.diferenciaPendiente,
        auditoriaValida: integridad.valido,
        auditoriaRegistros: integridad.totalRegistros,
      },
    };

    console.log('\n====================================================================');
    console.log('📊 BENCHMARK_FASE5');
    console.log(JSON.stringify(resumenBenchmark, null, 2));
    console.log('====================================================================');
  } finally {
    const cleanClient = await pool.connect();
    try {
      await cleanClient.query(
        `SELECT set_config('app.empresa_id', $1, false),
                set_config('app.current_empresa_id', $1, false),
                set_config('app.usuario_id', $2, false),
                set_config('app.current_user_id', $2, false)`,
        [empresaId, usuarioId]
      );

      const sentencias = [
        [`DELETE FROM conciliacion_reglas_aprendidas WHERE empresa_id = $1`, [empresaId]],
        [`DELETE FROM conciliacion_item WHERE empresa_id = $1`, [empresaId]],
        [`DELETE FROM conciliacion_grupo WHERE empresa_id = $1`, [empresaId]],
        [`DELETE FROM conciliaciones_bancarias WHERE empresa_id = $1`, [empresaId]],
        [`DELETE FROM extracto_lineas WHERE empresa_id = $1`, [empresaId]],
        [`DELETE FROM extracto_import WHERE empresa_id = $1`, [empresaId]],
        [`DELETE FROM extractos_bancarios WHERE empresa_id = $1`, [empresaId]],
        [`DELETE FROM movimientos_tesoreria WHERE empresa_id = $1`, [empresaId]],
        [`DELETE FROM conciliacion_config_empresa WHERE empresa_id = $1`, [empresaId]],
        [`DELETE FROM cuentas_financieras WHERE empresa_id = $1`, [empresaId]],
        [`DELETE FROM anexos WHERE empresa_id = $1`, [empresaId]],
        [`DELETE FROM asiento_detalle WHERE empresa_id = $1`, [empresaId]],
        [`DELETE FROM asientos WHERE empresa_id = $1`, [empresaId]],
        [`DELETE FROM subdiarios WHERE empresa_id = $1`, [empresaId]],
        [`DELETE FROM plan_cuentas WHERE empresa_id = $1`, [empresaId]],
        [`DELETE FROM periodos WHERE empresa_id = $1`, [empresaId]],
        [`DELETE FROM ejercicios WHERE empresa_id = $1`, [empresaId]],
      ] as const;

      for (const [sql, params] of sentencias) {
        try {
          await cleanClient.query(sql, [...params]);
        } catch {
          // Ignorar tablas protegidas por triggers o FKs hacia tablas append-only (auditoria_log, extracto_linea_raw)
        }
      }

      try {
        await cleanClient.query(`DELETE FROM refresh_tokens WHERE usuario_id = $1`, [usuarioId]);
        await cleanClient.query(`DELETE FROM usuario_empresa WHERE usuario_id = $1`, [usuarioId]);
      } catch {
        // Ignorar si ya fue limpiado
      }

      for (const [sql, params] of [
        [`DELETE FROM empresas WHERE id = $1`, [empresaId]],
        [`DELETE FROM usuarios_estudio WHERE id = $1`, [usuarioId]],
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
    const tComandoCompletoMs = Number((performance.now() - tComandoStart).toFixed(2));
    console.log(`\n⏱️ Tiempo total punta-a-punta (con limpieza): ${tComandoCompletoMs} ms`);
  }
}

main().catch((err) => {
  console.error('\n❌ FALLO EN PRUEBA DE RENDIMIENTO FASE 5:', err);
  process.exitCode = 1;
});
