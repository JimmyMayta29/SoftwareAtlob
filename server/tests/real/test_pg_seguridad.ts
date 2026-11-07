import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { parse } from 'dotenv';
import { Pool, type PoolClient } from 'pg';
import { aplicarEtapaRls, ETAPAS_RLS, revertirEtapaRls } from '../../db/seguridadRls';
import { prepararPruebaClavesEmpresa, probarClavesEmpresa } from './test_pg_fk_empresa';

const ajustes = ['app.current_empresa_id', 'app.empresa_id', 'app.current_user_id', 'app.usuario_id'];

async function guardarContexto(client: PoolClient, values: string[]) {
  await client.query('SELECT set_config(k, v, true) FROM unnest($1::text[], $2::text[]) AS x(k,v)', [ajustes, values]);
}

// Todas las consultas llegan a PostgreSQL. Los savepoints mantienen DDL, datos y sesiones dentro del rollback externo.
function poolEnTransaccion(client: PoolClient) {
  return {
    query: client.query.bind(client),
    async connect() {
      let contextoPrevio: string[];
      return {
        async query(sql: string, args?: unknown[]) {
          if (sql === 'BEGIN') {
            const res = await client.query<{ valor: string }>('SELECT COALESCE(current_setting(k,true), \'\') AS valor FROM unnest($1::text[]) AS k', [ajustes]);
            contextoPrevio = res.rows.map(r => r.valor);
            return client.query('SAVEPOINT conexion_aplicacion');
          }
          if (sql === 'ROLLBACK') await client.query('ROLLBACK TO SAVEPOINT conexion_aplicacion');
          if (sql === 'COMMIT') await guardarContexto(client, contextoPrevio);
          if (sql === 'COMMIT' || sql === 'ROLLBACK') return client.query('RELEASE SAVEPOINT conexion_aplicacion');
          return client.query(sql, args);
        },
        release() {},
      };
    },
  };
}

async function estadoRls(client: PoolClient, tablas: string[]) {
  const { rows } = await client.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean; politicas: number }>(`
    SELECT relrowsecurity, relforcerowsecurity,
      (SELECT count(*)::int FROM pg_policy WHERE polrelid=c.oid) AS politicas
    FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1::text[]) ORDER BY c.relname
  `, [tablas]);
  assert.equal(rows.length, tablas.length);
  return rows;
}

async function probarRls(client: PoolClient) {
  const { setPostgresPool } = await import('../../config/database');
  const { authJwtService } = await import('../../services/authJwtService');
  const { sunatJobsService } = await import('../../services/sunatJobsService');
  setPostgresPool(poolEnTransaccion(client));
  const tenant = randomUUID();
  const companias = [randomUUID(), randomUUID()];
  const actores = [randomUUID(), randomUUID()];
  const jobs = [randomUUID(), randomUUID()];
  const clave = randomUUID();
  const hash = await bcrypt.hash(clave, 4);
  const correos = actores.map(id => `${id}@example.invalid`);
  await client.query('INSERT INTO tenants (id,nombre) VALUES ($1,$2)', [tenant, 'Prueba de aislamiento']);
  for (const i of [0, 1]) {
    const empresa = companias[i];
    const actor = actores[i];
    const ruc = `20${randomInt(100000000, 1000000000)}`;
    await client.query(`INSERT INTO empresas (id,tenant_id,codigo_empresa,ruc,razon_social,regimen_tributario,domicilio_fiscal)
      VALUES ($1,$2,$3,$4,$3,'REGIMEN_GENERAL','Prueba')`, [empresa, tenant, empresa.slice(0, 12), ruc]);
    await client.query(`INSERT INTO usuarios_estudio (id,email,password_hash,nombre,rol_global) VALUES ($1,$2,$3,'Prueba','CONTADOR_SENIOR')`, [actor, correos[i], hash]);
    await client.query(`INSERT INTO usuario_empresa (usuario_id,empresa_id,rol_en_empresa) VALUES ($1,$2,'CONTADOR_SENIOR')`, [actor, empresa]);
    await client.query('INSERT INTO ejercicios (empresa_id,anio) VALUES ($1,2026)', [empresa]);
    await client.query("INSERT INTO cuentas_financieras (empresa_id,tipo,banco,numero) VALUES ($1,'CAJA','Prueba','1')", [empresa]);
    await client.query("INSERT INTO sire_propuestas (empresa_id,tipo,periodo,hash_archivo) VALUES ($1,'COMPRAS','2026-11','prueba')", [empresa]);
    await client.query("INSERT INTO subdiarios (empresa_id,codigo,descripcion,tipo) VALUES ($1,'01','Prueba','APERTURA')", [empresa]);
    await client.query("INSERT INTO sunat_jobs (id,empresa_id,tipo_trabajo) VALUES ($1,$2,'IMPORTACION_XML_LOTE')", [jobs[i], empresa]);
    await client.query("INSERT INTO credenciales_sunat (empresa_id,usuario_sol,clave_sol_encrypted,clave_sol_iv,clave_sol_tag) VALUES ($1,'fixture','fixture','fixture','fixture')", [empresa]);
    await client.query("INSERT INTO sunat_empresa_keys (empresa_id,encrypted_dek) VALUES ($1,'fixture')", [empresa]);
    await client.query("INSERT INTO sunat_tokens (empresa_id,access_token_encrypted,expires_at) VALUES ($1,'fixture',CURRENT_TIMESTAMP)", [empresa]);
    await client.query("INSERT INTO sunat_conexiones (empresa_id,ruc,usuario_sol_encrypted,clave_sol_encrypted) VALUES ($1,$2,'fixture','fixture')", [empresa, ruc]);
    await client.query("INSERT INTO auditoria (empresa_id,usuario_id,tabla_afectada,registro_id,accion) VALUES ($1,$2,'prueba',$3,'INSERT')", [empresa, actor, actor]);
  }

  const testigos = ['sunat_jobs', 'ejercicios', 'cuentas_financieras', 'sire_propuestas', 'subdiarios'];
  for (const [indice, etapa] of ETAPAS_RLS.entries()) {
    const tablas = etapa.tablas.map(([tabla]) => tabla);
    const previo = await estadoRls(client, tablas);
    assert(previo.every(r => !r.relrowsecurity && !r.relforcerowsecurity && r.politicas === 0));
    await aplicarEtapaRls(client, etapa);
    assert((await estadoRls(client, tablas)).every(r => r.relrowsecurity && r.relforcerowsecurity && r.politicas === 1));
    await client.query('SAVEPOINT datos_etapa');

    await guardarContexto(client, ['', '', '', '']);
    for (const tabla of tablas) {
      const visible = await client.query(`SELECT 1 FROM public.${tabla} LIMIT 1`);
      assert.equal(visible.rowCount, 0, tabla);
    }
    const testigo = testigos[indice];
    const testigosEmpresa = indice === 0
      ? [testigo, 'credenciales_sunat', 'sunat_empresa_keys', 'sunat_tokens', 'sunat_conexiones', 'auditoria']
      : [testigo];
    for (const i of [0, 1]) {
      await guardarContexto(client, ['', companias[i], '', actores[i]]);
      for (const tabla of testigosEmpresa) {
        const visible = await client.query(`SELECT empresa_id FROM public.${tabla} WHERE empresa_id=ANY($1::uuid[])`, [companias]);
        assert.deepEqual(visible.rows.map(r => r.empresa_id), [companias[i]], tabla);
      }
      const membresias = await client.query('SELECT usuario_id FROM usuario_empresa WHERE usuario_id=ANY($1::uuid[])', [actores]);
      assert.deepEqual(membresias.rows.map(r => r.usuario_id), [actores[i]]);
    }
    await guardarContexto(client, ['', companias[0], '', actores[0]]);
    await client.query('SAVEPOINT escritura_cruzada');
    await assert.rejects(client.query(`UPDATE public.${testigo} SET empresa_id=$1 WHERE empresa_id=$2`, [companias[1], companias[0]]), { code: '42501' });
    await client.query('ROLLBACK TO SAVEPOINT escritura_cruzada');
    await client.query('RELEASE SAVEPOINT escritura_cruzada');
    await guardarContexto(client, ['', '', '', '']);

    const sesion = await authJwtService.login(correos[0], clave);
    assert.equal(sesion.empresaActivaId, companias[0]);
    assert.equal((await authJwtService.cambiarEmpresaActiva(actores[0], companias[0])).empresaActivaId, companias[0]);
    await assert.rejects(authJwtService.cambiarEmpresaActiva(actores[0], companias[1]), /ACCESO_DENEGADO/);
    assert.equal(authJwtService.verificarAccessToken((await authJwtService.refreshAccessToken(sesion.refreshToken)).accessToken).sub, actores[0]);

    const trabajo = {
      id: jobs[0], empresaId: companias[0], tipoTrabajo: 'IMPORTACION_XML_LOTE' as const,
      parametros: { archivos: [] }, estado: 'EN_COLA' as 'EN_COLA' | 'COMPLETADO' | 'ERROR',
      progreso: 0, reintentos: 0, maxReintentos: 1, createdAt: '', updatedAt: '',
    };
    await new Promise<void>((resolve, reject) => setImmediate(() => {
      sunatJobsService.procesarJob(trabajo, actores[0]).then(resolve, reject);
    }));
    assert.equal(trabajo.estado, 'COMPLETADO');
    await guardarContexto(client, ['', companias[0], '', actores[0]]);
    assert.equal((await client.query('SELECT estado FROM sunat_jobs WHERE id=$1', [jobs[0]])).rows[0]?.estado, 'COMPLETADO');
    await client.query("UPDATE usuario_empresa SET estado='REVOCADO' WHERE usuario_id=$1 AND empresa_id=$2", [actores[0], companias[0]]);
    await guardarContexto(client, ['', '', '', '']);
    await assert.rejects(authJwtService.refreshAccessToken(sesion.refreshToken), /REFRESH_FALLIDO/);
    await assert.rejects(authJwtService.cambiarEmpresaActiva(actores[0], companias[0]), /ACCESO_DENEGADO/);
    const revocado = { ...trabajo, estado: 'EN_COLA' as const };
    await sunatJobsService.procesarJob(revocado, actores[0]);
    assert.equal(revocado.estado, 'ERROR');
    await client.query('ROLLBACK TO SAVEPOINT datos_etapa');
    await client.query('RELEASE SAVEPOINT datos_etapa');

    await client.query('SAVEPOINT restaurar_etapa');
    await revertirEtapaRls(client, etapa);
    assert.deepEqual(await estadoRls(client, tablas), previo);
    await client.query('ROLLBACK TO SAVEPOINT restaurar_etapa');
    await client.query('RELEASE SAVEPOINT restaurar_etapa');
    console.log(`RLS ${etapa.id}: ${tablas.length} tablas, A/B, sin contexto, login, renovación, cambio, revocación, trabajo y reversión OK.`);
  }
}

async function ejecutar() {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = '';
  const envLocal = existsSync('.env') ? parse(readFileSync('.env')) : {};
  const connectionString = process.env.TEST_DATABASE_URL ?? envLocal.TEST_DATABASE_URL;
  assert(connectionString, 'TEST_DATABASE_URL_REQUERIDA');
  const destino = new URL(connectionString);
  assert(['postgres:', 'postgresql:'].includes(destino.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname)
    && destino.username === 'contabilidad_app' && destino.pathname === '/atlob_test' && [...destino.searchParams.keys()].every(k => k === 'sslmode'), 'DESTINO_DE_PRUEBA_INVALIDO');
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000, max: 1 });
  try {
    const client = await pool.connect();
    try {
      const { rows: [identidad] } = await client.query(`SELECT current_database() AS base, current_user AS actor, session_user AS login,
        current_setting('server_version_num')::int AS version, pg_get_userbyid(datdba) AS propietario,
        r.rolcanlogin AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls) AS restringido
        FROM pg_database d JOIN pg_roles r ON r.rolname=current_user WHERE d.datname=current_database()`);
      assert(identidad.base === 'atlob_test' && identidad.actor === 'contabilidad_app' && identidad.login === identidad.actor
        && identidad.propietario === identidad.actor && identidad.restringido && identidad.version >= 180000 && identidad.version < 190000, 'SESION_DE_PRUEBA_INVALIDA');
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock(738291004)');
        await probarRls(client);
      } finally {
        await client.query('ROLLBACK');
      }
      assert((await estadoRls(client, ETAPAS_RLS.flatMap(e => e.tablas.map(([t]) => t)))).every(r => !r.relrowsecurity && !r.relforcerowsecurity && r.politicas === 0));
      console.log('ROLLBACK_RLS_COMPLETO=OK');
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock(738291004)');
        const muestra = await prepararPruebaClavesEmpresa(client);
        const modulos = ['01_contabilidad', '02_comprobantes', '03_cartera', '04_tesoreria', '05_planillas', '06_tributos', '07_sire'];
        for (const modulo of modulos) {
          console.log(`FK módulo ${modulo}: aplicando en transacción de prueba.`);
          const archivo = new URL(`../../db/fk_empresa_${modulo}.sql`, import.meta.url);
          await client.query(readFileSync(archivo, 'utf8'));
        }
        await probarClavesEmpresa(client, muestra);
      } finally {
        await client.query('ROLLBACK');
      }
      const { rows: [restos] } = await client.query(`SELECT count(*)::int AS total FROM pg_constraint
        WHERE connamespace='public'::regnamespace AND right(conname, 13)='_fkey_empresa'`);
      assert.equal(restos.total, 0);
      console.log('ROLLBACK_FK_COMPLETO=OK');
    } finally { client.release(); }
  } finally { await pool.end(); }
}

void ejecutar().catch((error: { code?: string; constraint?: string; message?: string; stack?: string }) => {
  console.error(`PRUEBA_PG_SEGURIDAD=${error.code ?? 'ERROR'}${error.constraint ? ` (${error.constraint})` : ''}: ${error.message ?? ''}`);
  const location = error.stack?.split('\n').find(line => /at .*test_pg_seguridad\.ts:\d+/.test(line));
  if (location) console.error(location.trim());
  process.exitCode = 1;
});
