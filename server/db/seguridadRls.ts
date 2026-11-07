import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { parse } from 'dotenv';
import { Pool, type PoolClient } from 'pg';

const empresaActiva = "NULLIF(current_setting('app.empresa_id', true), '')::uuid";
const usuarioActivo = "NULLIF(current_setting('app.usuario_id', true), '')::uuid";
const porEmpresa = `empresa_id = ${empresaActiva}`;
const porUsuario = `usuario_id = ${usuarioActivo}`;
const porEstudio = `empresa_id IS NULL AND EXISTS (
  SELECT 1 FROM public.estudio_configuracion AS estudio
  JOIN public.usuarios_estudio AS actor ON actor.id = ${usuarioActivo}
  WHERE estudio.id AND estudio.tenant_id = auditoria.tenant_id
    AND actor.is_active AND actor.rol_global = 'ADMINISTRADOR'
)`;

function politicas(tablas: string[], expresion = porEmpresa): [string, string][] {
  return tablas.map(tabla => [tabla, expresion]);
}

export const ETAPAS_RLS = [
  { id: '5.1', categoria: 'CRITICA', tablas: [
    ...politicas(['credenciales_sunat', 'sunat_empresa_keys', 'sunat_tokens', 'sunat_conexiones', 'sunat_jobs']),
    ...politicas(['refresh_tokens', 'membresias', 'usuario_empresa'], porUsuario),
    ...politicas(['auditoria'], `(${porEmpresa}) OR (${porEstudio})`),
  ] },
  { id: '5.2a', categoria: 'ALTA', tablas: [
    ...politicas(['ejercicios', 'periodos', 'plan_cuentas', 'saldos_mensuales', 'anexos', 'consolidaciones_mensuales']),
    ...politicas(['planilla_lineas'], `EXISTS (SELECT 1 FROM public.planillas AS padre
      WHERE padre.id = planilla_lineas.planilla_id AND padre.empresa_id = ${empresaActiva})`),
  ] },
  { id: '5.2b', categoria: 'ALTA', tablas: politicas([
    'cuentas_financieras', 'movimientos_tesoreria', 'transferencias_cuentas', 'extractos_bancarios',
    'extracto_lineas', 'conciliaciones_bancarias', 'cajas_chicas', 'rendiciones_caja_chica',
    'recibos_honorarios', 'provisiones_sociales',
  ]) },
  { id: '5.2c', categoria: 'ALTA', tablas: politicas([
    'comprobantes_xml', 'declaraciones_pdt621', 'declaraciones_prorrata_igv', 'declaraciones_renta_anual',
    'daot_exclusiones', 'sire_propuestas', 'sire_propuesta_lineas', 'sire_conciliaciones',
    'sire_conciliacion_lineas', 'ple_exportaciones', 'reportes_generados',
  ]) },
  { id: '5.3', categoria: 'BAJA', tablas: politicas([
    'conceptos_planilla', 'config_estados_financieros', 'configuracion_reportes', 'subdiarios',
  ]) },
];

// Se ejecuta fuera del migrador de arranque. Cada etapa es atómica en la transacción del operador.
export async function aplicarEtapaRls(client: PoolClient, etapa: (typeof ETAPAS_RLS)[number]) {
  for (const [tabla, expresion] of etapa.tablas) {
    await client.query(`DROP POLICY IF EXISTS aislamiento_atlob ON public.${tabla}`);
    await client.query(`CREATE POLICY aislamiento_atlob ON public.${tabla} USING (${expresion}) WITH CHECK (${expresion})`);
    await client.query(`ALTER TABLE public.${tabla} ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY`);
  }
}

export async function revertirEtapaRls(client: PoolClient, etapa: (typeof ETAPAS_RLS)[number]) {
  for (const [tabla] of [...etapa.tablas].reverse()) {
    await client.query(`DROP POLICY IF EXISTS aislamiento_atlob ON public.${tabla}`);
    await client.query(`ALTER TABLE public.${tabla} NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY`);
  }
}

const AJUSTES_SESION = ['app.current_empresa_id', 'app.empresa_id', 'app.current_user_id', 'app.usuario_id'];

async function fijarContextoSesion(client: PoolClient, valores: [string, string, string, string]) {
  await client.query(
    'SELECT set_config(k, v, true) FROM unnest($1::text[], $2::text[]) AS x(k, v)',
    [AJUSTES_SESION, valores]
  );
}

function poolEnSavepoint(client: PoolClient) {
  return {
    query: client.query.bind(client),
    async connect() {
      let previo: [string, string, string, string] = ['', '', '', ''];
      return {
        async query(sql: string, args?: unknown[]) {
          if (sql === 'BEGIN') {
            const res = await client.query<{ valor: string }>(
              "SELECT COALESCE(current_setting(k, true), '') AS valor FROM unnest($1::text[]) AS k",
              [AJUSTES_SESION]
            );
            previo = [res.rows[0].valor, res.rows[1].valor, res.rows[2].valor, res.rows[3].valor];
            return client.query('SAVEPOINT sp_app_rls');
          }
          if (sql === 'ROLLBACK') await client.query('ROLLBACK TO SAVEPOINT sp_app_rls');
          if (sql === 'COMMIT') await fijarContextoSesion(client, previo);
          if (sql === 'COMMIT' || sql === 'ROLLBACK') return client.query('RELEASE SAVEPOINT sp_app_rls');
          return client.query(sql, args);
        },
        release() {},
      };
    },
  };
}

export async function aplicarEtapasRlsEnAtlobTest(connectionString: string): Promise<void> {
  const destino = new URL(connectionString);
  assert(
    ['postgres:', 'postgresql:'].includes(destino.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname) &&
      destino.username === 'contabilidad_app' &&
      destino.pathname === '/atlob_test' &&
      [...destino.searchParams.keys()].every(k => k === 'sslmode'),
    'PROHIBIDO_FUERA_DE_ATLOB_TEST: Solo se permite ejecutar contra atlob_test local como contabilidad_app.'
  );

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = '';
  const { setPostgresPool } = await import('../config/database');
  const { authJwtService } = await import('../services/authJwtService');
  const { sunatJobsService } = await import('../services/sunatJobsService');

  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const client = await pool.connect();
    try {
      const { rows: [idRow] } = await client.query<{
        base: string; actor: string; login: string; version: number; restringido: boolean;
      }>(`
        SELECT current_database() AS base,
               current_user AS actor,
               session_user AS login,
               current_setting('server_version_num')::int AS version,
               r.rolcanlogin AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls) AS restringido
          FROM pg_roles r
         WHERE r.rolname = current_user
      `);
      assert(
        idRow.base === 'atlob_test' &&
          idRow.actor === 'contabilidad_app' &&
          idRow.login === 'contabilidad_app' &&
          idRow.restringido &&
          idRow.version >= 180000 &&
          idRow.version < 190000,
        'SESION_INVALIDA_ATLOB_TEST'
      );

      const { rows: [conteoAntes] } = await client.query<{ total: number }>(`
        SELECT count(*)::int AS total FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relrowsecurity AND relforcerowsecurity
      `);
      console.log(`INICIO_APLICACION_RLS | base=${idRow.base} | rol=${idRow.actor} | tablas_rls_iniciales=${conteoAntes.total}`);

      setPostgresPool(poolEnSavepoint(client));
      const testigosPorEtapa: Record<string, string> = {
        '5.1': 'sunat_jobs',
        '5.2a': 'ejercicios',
        '5.2b': 'cuentas_financieras',
        '5.2c': 'sire_propuestas',
        '5.3': 'subdiarios',
      };

      for (const etapa of ETAPAS_RLS) {
        const nombresTablas = etapa.tablas.map(([t]) => t);
        await client.query('BEGIN');
        try {
          await client.query('SELECT pg_advisory_xact_lock(738291005)');
          await aplicarEtapaRls(client, etapa);

          const { rows: verifPoliticas } = await client.query<{
            relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; politicas: number;
          }>(`
            SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
                   (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS politicas
              FROM pg_class c
             WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY($1::text[])
             ORDER BY c.relname
          `, [nombresTablas]);
          assert.equal(verifPoliticas.length, nombresTablas.length);
          assert(verifPoliticas.every(r => r.relrowsecurity && r.relforcerowsecurity && r.politicas === 1));

          await client.query('SAVEPOINT verificacion_etapa');
          try {
            const tenant = randomUUID();
            const companias = [randomUUID(), randomUUID()] as const;
            const actores = [randomUUID(), randomUUID()] as const;
            const jobs = [randomUUID(), randomUUID()] as const;
            const clave = randomUUID();
            const hash = await bcrypt.hash(clave, 4);
            const correos = actores.map(id => `${id}@rls.invalid`);
            const { rows: [rolRow] } = await client.query<{ id: string }>("SELECT id::text AS id FROM roles LIMIT 1");

            await fijarContextoSesion(client, ['', '', '', '']);
            await client.query('INSERT INTO tenants (id, nombre) VALUES ($1, $2)', [tenant, 'Tenant verificación RLS']);

            for (const i of [0, 1] as const) {
              const emp = companias[i];
              const usr = actores[i];
              const ruc = `20${randomInt(100000000, 1000000000)}`;
              await fijarContextoSesion(client, ['', '', '', '']);
              await client.query(
                `INSERT INTO empresas (id, tenant_id, codigo_empresa, ruc, razon_social, regimen_tributario, domicilio_fiscal)
                 VALUES ($1, $2, $3, $4, $3, 'REGIMEN_GENERAL', 'Domicilio RLS')`,
                [emp, tenant, emp.slice(0, 12), ruc]
              );
              await client.query(
                `INSERT INTO usuarios_estudio (id, email, password_hash, nombre, rol_global)
                 VALUES ($1, $2, $3, 'Actor RLS', 'CONTADOR_SENIOR')`,
                [usr, correos[i], hash]
              );

              await fijarContextoSesion(client, [emp, emp, usr, usr]);
              await client.query(
                `INSERT INTO usuario_empresa (usuario_id, empresa_id, rol_en_empresa)
                 VALUES ($1, $2, 'CONTADOR_SENIOR')`,
                [usr, emp]
              );
              if (rolRow?.id) {
                await client.query(
                  'INSERT INTO membresias (usuario_id, empresa_id, rol_id, is_active) VALUES ($1, $2, $3, TRUE)',
                  [usr, emp, rolRow.id]
                );
              }
              await client.query(
                "INSERT INTO refresh_tokens (token_id, usuario_id, empresa_id, expires_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '1 day')",
                [randomUUID(), usr, emp]
              );
              await client.query(
                "INSERT INTO sunat_jobs (id, empresa_id, tipo_trabajo) VALUES ($1, $2, 'IMPORTACION_XML_LOTE')",
                [jobs[i], emp]
              );
              await client.query(
                "INSERT INTO credenciales_sunat (empresa_id, usuario_sol, clave_sol_encrypted, clave_sol_iv, clave_sol_tag) VALUES ($1, 'fx', 'fx', 'fx', 'fx')",
                [emp]
              );
              await client.query("INSERT INTO sunat_empresa_keys (empresa_id, encrypted_dek) VALUES ($1, 'fx')", [emp]);
              await client.query(
                "INSERT INTO sunat_tokens (empresa_id, access_token_encrypted, expires_at) VALUES ($1, 'fx', CURRENT_TIMESTAMP)",
                [emp]
              );
              await client.query(
                "INSERT INTO sunat_conexiones (empresa_id, ruc, usuario_sol_encrypted, clave_sol_encrypted) VALUES ($1, $2, 'fx', 'fx')",
                [emp, ruc]
              );
              await client.query(
                "INSERT INTO auditoria (empresa_id, usuario_id, tabla_afectada, registro_id, accion) VALUES ($1, $2, 'prueba_rls', $3, 'INSERT')",
                [emp, usr, usr]
              );
              const { rows: [ej] } = await client.query<{ id: string }>(
                'INSERT INTO ejercicios (empresa_id, anio) VALUES ($1, 2026) RETURNING id::text AS id',
                [emp]
              );
              const { rows: [per] } = await client.query<{ id: string }>(
                "INSERT INTO periodos (empresa_id, ejercicio_id, anio, mes, codigo_periodo) VALUES ($1, $2, 2026, 11, '2026-11') RETURNING id::text AS id",
                [emp, ej.id]
              );
              const { rows: [trab] } = await client.query<{ id: string }>(
                "INSERT INTO trabajadores (empresa_id, numero_documento, nombres, apellidos, fecha_ingreso, cargo, sueldo_base, sistema_pensiones) VALUES ($1, $2, 'T', 'P', DATE '2026-11-01', 'C', 1500, 'ONP') RETURNING id::text AS id",
                [emp, `4000000${i}`]
              );
              const { rows: [plan] } = await client.query<{ id: string }>(
                "INSERT INTO planillas (empresa_id, periodo_id, mes, fecha_calculo) VALUES ($1, $2, '2026-11', DATE '2026-11-15') RETURNING id::text AS id",
                [emp, per.id]
              );
              await client.query(
                'INSERT INTO planilla_lineas (planilla_id, trabajador_id, sueldo_basico, total_remuneracion, total_descuentos, neto_pagar) VALUES ($1, $2, 1500, 1500, 0, 1500)',
                [plan.id, trab.id]
              );
              await client.query(
                "INSERT INTO cuentas_financieras (empresa_id, tipo, banco, numero) VALUES ($1, 'CAJA', 'Caja RLS', '01')",
                [emp]
              );
              await client.query(
                "INSERT INTO sire_propuestas (empresa_id, tipo, periodo, hash_archivo) VALUES ($1, 'COMPRAS', '2026-11', 'hash_rls')",
                [emp]
              );
              await client.query(
                "INSERT INTO subdiarios (empresa_id, codigo, descripcion, tipo) VALUES ($1, '01', 'Apertura RLS', 'APERTURA')",
                [emp]
              );
            }

            // 1. Sin contexto -> 0 filas visibles en todas las tablas de la etapa
            await fijarContextoSesion(client, ['', '', '', '']);
            for (const tabla of nombresTablas) {
              const sinCtx = await client.query(`SELECT 1 FROM public.${tabla} LIMIT 1`);
              assert.equal(sinCtx.rowCount, 0, `Sin contexto ${tabla} debe devolver 0 filas`);
            }

            // 2. Aislamiento A/B por empresa y por identidad + rechazo 42501
            const testigo = testigosPorEtapa[etapa.id];
            for (const i of [0, 1] as const) {
              await fijarContextoSesion(client, [companias[i], companias[i], actores[i], actores[i]]);
              const vis = await client.query<{ empresa_id: string }>(
                `SELECT empresa_id::text AS empresa_id FROM public.${testigo} WHERE empresa_id = ANY($1::uuid[])`,
                [companias]
              );
              assert.deepEqual(vis.rows.map(r => r.empresa_id), [companias[i]]);

              if (etapa.id === '5.2a') {
                const lineasVis = await client.query('SELECT id FROM public.planilla_lineas');
                assert.equal(lineasVis.rowCount, 1, 'planilla_lineas debe aislarse por empresa de planillas');
              }

              for (const tablaIdentidad of ['usuario_empresa', 'refresh_tokens', ...(rolRow?.id ? ['membresias'] : [])]) {
                const idVis = await client.query<{ usuario_id: string }>(
                  `SELECT DISTINCT usuario_id::text AS usuario_id FROM public.${tablaIdentidad} WHERE usuario_id = ANY($1::uuid[])`,
                  [actores]
                );
                assert.deepEqual(idVis.rows.map(r => r.usuario_id), [actores[i]], `Identidad aislada en ${tablaIdentidad}`);
              }
            }

            await fijarContextoSesion(client, [companias[0], companias[0], actores[0], actores[0]]);
            await client.query('SAVEPOINT sp_cruzado');
            await assert.rejects(
              client.query(`UPDATE public.${testigo} SET empresa_id = $1 WHERE empresa_id = $2`, [companias[1], companias[0]]),
              { code: '42501' }
            );
            await client.query('ROLLBACK TO SAVEPOINT sp_cruzado');
            await client.query('RELEASE SAVEPOINT sp_cruzado');

            // 3. Login y renovación con contexto limpio
            await fijarContextoSesion(client, ['', '', '', '']);
            const sesion = await authJwtService.login(correos[0], clave);
            assert.equal(sesion.empresaActivaId, companias[0]);
            assert.equal((await authJwtService.cambiarEmpresaActiva(actores[0], companias[0])).empresaActivaId, companias[0]);
            await assert.rejects(authJwtService.cambiarEmpresaActiva(actores[0], companias[1]), /ACCESO_DENEGADO/);
            const renovada = await authJwtService.refreshAccessToken(sesion.refreshToken);
            assert.equal(authJwtService.verificarAccessToken(renovada.accessToken).sub, actores[0]);

            // 4. Workers con membresía activa
            const trabajo = {
              id: jobs[0],
              empresaId: companias[0],
              tipoTrabajo: 'IMPORTACION_XML_LOTE' as const,
              parametros: { archivos: [] },
              estado: 'EN_COLA' as 'EN_COLA' | 'COMPLETADO' | 'ERROR',
              progreso: 0,
              reintentos: 0,
              maxReintentos: 1,
              createdAt: '',
              updatedAt: '',
            };
            await new Promise<void>((resolve, reject) =>
              setImmediate(() => {
                sunatJobsService.procesarJob(trabajo, actores[0]).then(resolve, reject);
              })
            );
            assert.equal(trabajo.estado, 'COMPLETADO');
            await fijarContextoSesion(client, [companias[0], companias[0], actores[0], actores[0]]);
            assert.equal(
              (await client.query<{ estado: string }>('SELECT estado FROM sunat_jobs WHERE id = $1', [jobs[0]])).rows[0]?.estado,
              'COMPLETADO'
            );

            // 5. Membresía revocada -> renovación, cambio de empresa y worker bloqueados
            await client.query(
              "UPDATE usuario_empresa SET estado = 'REVOCADO' WHERE usuario_id = $1 AND empresa_id = $2",
              [actores[0], companias[0]]
            );
            await fijarContextoSesion(client, ['', '', '', '']);
            await assert.rejects(authJwtService.refreshAccessToken(sesion.refreshToken), /REFRESH_FALLIDO/);
            await assert.rejects(authJwtService.cambiarEmpresaActiva(actores[0], companias[0]), /ACCESO_DENEGADO/);
            const trabajoRevocado = { ...trabajo, estado: 'EN_COLA' as const };
            await sunatJobsService.procesarJob(trabajoRevocado, actores[0]);
            assert.equal(trabajoRevocado.estado, 'ERROR');
          } finally {
            await client.query('ROLLBACK TO SAVEPOINT verificacion_etapa');
            await client.query('RELEASE SAVEPOINT verificacion_etapa');
          }

          await client.query('COMMIT');

          const { rows: [conteoEtapa] } = await client.query<{ total: number }>(`
            SELECT count(*)::int AS total FROM pg_class
            WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relrowsecurity AND relforcerowsecurity
          `);
          console.log(
            `ETAPA_RLS_${etapa.id} [${etapa.categoria}] APLICADA | tablas_etapa=${nombresTablas.length} (${nombresTablas.join(', ')}) | sin_contexto=0_filas | aislamiento_AB=OK(42501) | login=OK | renovacion=OK | workers=COMPLETADO | membresia_revocada=BLOQUEADO | total_tablas_rls=${conteoEtapa.total}`
          );
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        }
      }

      const { rows: [conteoFinal] } = await client.query<{ total: number; politicas: number }>(`
        SELECT count(*)::int AS total,
               (SELECT count(*)::int FROM pg_policy p JOIN pg_class c2 ON c2.oid = p.polrelid WHERE c2.relnamespace = 'public'::regnamespace) AS politicas
          FROM pg_class
         WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relrowsecurity AND relforcerowsecurity
      `);
      console.log(`FIN_APLICACION_RLS | base=atlob_test | tablas_rls_finales=${conteoFinal.total} | politicas_totales=${conteoFinal.politicas} | EXIT=0`);
    } finally {
      setPostgresPool(null, false);
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv.includes('--aplicar-en-atlob-test')) {
  const local = existsSync('.env') ? parse(readFileSync('.env')) : {};
  const url = process.env.TEST_DATABASE_URL ?? local.TEST_DATABASE_URL;
  if (!url) {
    console.error('ERROR_RLS: TEST_DATABASE_URL requerida.');
    process.exit(1);
  }
  aplicarEtapasRlsEnAtlobTest(url).catch((err: Error) => {
    console.error(`ERROR_RLS: ${err.message}`);
    process.exitCode = 1;
  });
}
