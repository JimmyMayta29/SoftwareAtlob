import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { parse } from 'dotenv';
import { Pool, PoolClient } from 'pg';
import { REGISTRO_DATOS_EMPRESA } from '../../storage/registroDatosEmpresa';

const TABLAS_A_PROBAR = [
  'trabajadores',
  'planillas',
  'planilla_gratificaciones',
  'planilla_cts',
  'liquidaciones_beneficios',
  'tregistro_movimientos',
  'asientos',
  'auditoria_log'
] as const;

function fijarEmpresa(client: PoolClient, empresaId: string) {
  return client.query("SELECT set_config('app.empresa_id', $1, true)", [empresaId]);
}

async function comprobarRestriccion(client: PoolClient, probar: () => Promise<unknown>, code: string, constraint?: string) {
  await client.query('SAVEPOINT verificar_rechazo');
  try {
    await assert.rejects(probar, constraint ? { code, constraint } : { code });
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT verificar_rechazo');
    await client.query('RELEASE SAVEPOINT verificar_rechazo');
  }
}

async function ejecutarPruebaComportamientoPostgresReal(databaseUrl: string) {
  console.log('====================================================================');
  console.log('🐘 INICIANDO PRUEBA COMPORTAMENTAL EN POSTGRESQL 18.x REAL (RLS + NOBYPASSRLS)');
  console.log('====================================================================\n');

  const ownerPool = new Pool({ connectionString: databaseUrl, options: '-c search_path=public,pg_catalog', max: 5, connectionTimeoutMillis: 5000 });
  let ownerClient: PoolClient | undefined;

  try {
    ownerClient = await ownerPool.connect();
    const { rows: [identity] } = await ownerClient.query(`
      SELECT current_database() AS database_name, current_user AS role_name, session_user AS session_role,
             current_setting('server_version_num')::int AS version_num, version() AS full_version,
             (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) AS database_owner,
             rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
        FROM pg_roles WHERE rolname = current_user
    `);
    assert(identity?.database_name === 'atlob_test', 'La conexión debe estar en atlob_test.');
    assert(identity.role_name === 'contabilidad_app' && identity.session_role === 'contabilidad_app', 'La sesión debe usar contabilidad_app.');
    assert(identity.database_owner === 'contabilidad_app', 'atlob_test debe pertenecer a contabilidad_app.');
    assert(identity.rolcanlogin && !identity.rolsuper && !identity.rolcreatedb && !identity.rolcreaterole && !identity.rolbypassrls,
      'contabilidad_app debe tener LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE y NOBYPASSRLS.');
    assert(identity.version_num >= 180000 && identity.version_num < 190000, 'Se requiere PostgreSQL 18.x.');
    console.log(`🔌 ${identity.full_version}\n   ${identity.role_name} @ ${identity.database_name}\n`);

    // El migrador real usa este pool, validado antes de emitir DDL.
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = '';
    const { setPostgresPool } = await import('../../config/database');
    const { runMigrations } = await import('../../db/migrate');
    setPostgresPool(ownerPool);
    console.log('1. Aplicando migraciones con el migrador de la aplicación...');
    await runMigrations();
    console.log('   ✔ Migraciones aplicadas con contabilidad_app.');

    const { rows: tablas } = await ownerClient.query<{ tabla: string }>(`
      SELECT table_name AS tabla FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name
    `);
    const registradas = new Set(REGISTRO_DATOS_EMPRESA.map(item => item.tabla));
    const existentes = new Set(tablas.map(item => item.tabla));
    console.log(`   Tablas públicas: ${existentes.size}. Registro: ${REGISTRO_DATOS_EMPRESA.length} entradas, ${registradas.size} nombres únicos.`);
    console.log('   Faltan:', [...registradas].filter(tabla => !existentes.has(tabla)).sort().join(', ') || 'ninguna');
    console.log('   Sobran:', [...existentes].filter(tabla => !registradas.has(tabla)).join(', ') || 'ninguna');
    const { rows: politicas } = await ownerClient.query<{
      relname: string; propietario: string; relrowsecurity: boolean; relforcerowsecurity: boolean;
      tiene_empresa_id: boolean; tiene_politica: boolean;
    }>(`
      WITH estado AS (
        SELECT c.relname, pg_get_userbyid(c.relowner) AS propietario, c.relrowsecurity, c.relforcerowsecurity,
          EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'empresa_id'
                    AND NOT a.attisdropped) AS tiene_empresa_id,
          EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid) AS tiene_politica
        FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
      )
      SELECT * FROM estado WHERE tiene_empresa_id OR tiene_politica OR relrowsecurity ORDER BY relname
    `);
    console.table(politicas);
    const { rows: clavesForaneas } = await ownerClient.query(`
      SELECT conrelid::regclass::text AS tabla, conname AS restriccion,
             confrelid::regclass::text AS referencia, convalidated AS validada
      FROM pg_constraint WHERE contype = 'f' AND conrelid IN (
        'asientos'::regclass, 'asiento_detalle'::regclass, 'correlativos'::regclass,
        'comprobantes_compra'::regclass, 'comprobantes_venta'::regclass, 'planillas'::regclass
      ) ORDER BY tabla, restriccion
    `);
    console.table(clavesForaneas);

    const protegidas = politicas.filter(tabla => tabla.tiene_politica || tabla.relrowsecurity);
    for (const tabla of [...TABLAS_A_PROBAR, 'centros_costo', 'reglas_contabilizacion_detalle']) {
      assert(protegidas.some(item => item.relname === tabla), `${tabla} debe tener una política RLS`);
    }
    for (const tabla of protegidas) {
      assert(tabla.tiene_politica && tabla.relrowsecurity && tabla.relforcerowsecurity,
        `${tabla.relname} debe tener política, ENABLE y FORCE RLS`);
      assert(registradas.has(tabla.relname), `${tabla.relname} debe estar inscrita en REGISTRO_DATOS_EMPRESA`);
    }
    console.log(`   ✔ Política, ENABLE y FORCE RLS comprobados en ${protegidas.length} tablas.`);

    // 4. Sembrar datos maestros de prueba (Tenant, Empresas A y B, Ejercicio, Periodo, Subdiario, Cuentas)
    console.log('\n4. Sembrando datos maestros aislados para Empresa A y Empresa B...');
    const tenantId = '00000000-0000-0000-0000-000000000001';
    const empA = '00000000-0000-0000-0000-0000000000a1';
    const empB = '00000000-0000-0000-0000-0000000000b2';
    const usrAdmin = '00000000-0000-0000-0000-000000000001';

    await ownerClient.query('BEGIN');
    await ownerClient.query(`
      INSERT INTO tenants (id, nombre, subdominio) VALUES ($1, 'TENANT TEST', 'tenant-test')
      ON CONFLICT (id) DO NOTHING
    `, [tenantId]);

    await ownerClient.query(`
      INSERT INTO usuarios_estudio (id, email, nombre, password_hash, rol_global, is_active)
      VALUES ($1, 'admin@test.pe', 'ADMIN TEST', 'DESHABILITADO', 'ADMINISTRADOR', FALSE)
      ON CONFLICT (id) DO NOTHING
    `, [usrAdmin]);

    await ownerClient.query(`
      INSERT INTO empresas (id, tenant_id, codigo_empresa, ruc, razon_social, regimen_tributario, domicilio_fiscal, moneda_principal)
      VALUES
        ($2, $1, 'EMPA', '20600000011', 'EMPRESA A SAC', 'REGIMEN_GENERAL', 'AV A 123', 'PEN'),
        ($3, $1, 'EMPB', '20600000022', 'EMPRESA B SAC', 'REGIMEN_GENERAL', 'AV B 456', 'PEN')
      ON CONFLICT (id) DO NOTHING
    `, [tenantId, empA, empB]);

    for (const [empresaId, ejercicioId, periodoId, subdiarioId] of [
      [empA, '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021'],
      [empB, '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000022'],
    ]) {
      await fijarEmpresa(ownerClient, empresaId);
      await ownerClient.query(`
        INSERT INTO ejercicios (id, empresa_id, anio, estado) VALUES ($1, $2, 2026, 'ABIERTO')
        ON CONFLICT (id) DO NOTHING
      `, [ejercicioId, empresaId]);
      await ownerClient.query(`
        INSERT INTO periodos (id, empresa_id, ejercicio_id, anio, mes, codigo_periodo, estado)
        VALUES ($1, $2, $3, 2026, 9, '2026-09', 'ABIERTO') ON CONFLICT (id) DO NOTHING
      `, [periodoId, empresaId, ejercicioId]);
      await ownerClient.query(`
        INSERT INTO subdiarios (id, empresa_id, codigo, descripcion, tipo)
        VALUES ($1, $2, '01', 'OPERACIONES MANUALES', 'APERTURA') ON CONFLICT (id) DO NOTHING
      `, [subdiarioId, empresaId]);
    }

    await fijarEmpresa(ownerClient, empA);
    await ownerClient.query(`
      INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento) VALUES
        ('00000000-0000-0000-0000-0000000000c1', $1, '1011', 'Caja M/N', 4, 'ACTIVO', TRUE),
        ('00000000-0000-0000-0000-0000000000c2', $1, '70111', 'Ventas M/N', 5, 'INGRESO', TRUE)
      ON CONFLICT (id) DO NOTHING
    `, [empA]);
    await ownerClient.query('COMMIT');

    // 5. Demostración de aislamiento RLS con el mismo rol que usa la aplicación.
    console.log('5. Demostrando aislamiento RLS con contabilidad_app...');
    
    const appClient = await ownerPool.connect();
    try {
      await appClient.query('BEGIN');

      // A) Sin variable app.empresa_id no se ve ningún registro.
      console.log('   a) Probando consulta sin app.empresa_id (debe devolver 0 filas)...');
      await fijarEmpresa(appClient, '');
      for (const tabla of TABLAS_A_PROBAR) {
        const sinContexto = await appClient.query(`SELECT * FROM ${tabla}`);
        assert.equal(sinContexto.rowCount, 0, `Sin contexto de empresa, ${tabla} no debe devolver filas`);
      }
      console.log('      ✔ Sin app.empresa_id se obtienen 0 filas.');

      // B) Fijar contexto en Empresa A:
      console.log('   b) Fijando contexto en Empresa A...');
      await fijarEmpresa(appClient, empA);

      // Insertar trabajador para Empresa A
      const trabAId = '00000000-0000-0000-0000-000000000101';
      await appClient.query(`
        INSERT INTO trabajadores (id, empresa_id, tipo_documento, numero_documento, nombres, apellidos, fecha_ingreso, cargo, regimen_laboral, sueldo_base, sistema_pensiones)
        VALUES ($1, $2, '01', '41223344', 'TRABAJADOR A', 'APELLIDO A', '2026-01-01', 'CONTADOR', 'GENERAL', 3200.00, 'ONP')
      `, [trabAId, empA]);

      // Insertar planillas para Empresa A
      const planAId = '00000000-0000-0000-0000-000000000201';
      await appClient.query(`
        INSERT INTO planillas (id, empresa_id, periodo_id, mes, fecha_calculo, total_ingresos, total_descuentos, total_aportes_empleador, total_neto, estado)
        VALUES ($1, $2, '00000000-0000-0000-0000-000000000011', '2026-09', '2026-09-30', 3200, 416, 288, 2784, 'CALCULADA')
      `, [planAId, empA]);

      // Insertar gratificación para Empresa A
      const gratAId = '00000000-0000-0000-0000-000000000301';
      await appClient.query(`
        INSERT INTO planilla_gratificaciones (id, empresa_id, periodo, semestre, trabajador_id, sueldo_computable, remuneracion_computable, gratificacion_ordinaria, bonificacion_extraordinaria, neto_pagar)
        VALUES ($1, $2, '2026-07', 'JULIO', $3, 3200, 3200, 3200, 288, 3488)
      `, [gratAId, empA, trabAId]);

      // Insertar CTS para Empresa A
      const ctsAId = '00000000-0000-0000-0000-000000000401';
      await appClient.query(`
        INSERT INTO planilla_cts (id, empresa_id, periodo, semestre, trabajador_id, sueldo_computable, remuneracion_computable, cts_depositada)
        VALUES ($1, $2, '2026-05', 'MAYO', $3, 3200, 3733.33, 1866.67)
      `, [ctsAId, empA, trabAId]);

      // Insertar LBS para Empresa A
      const lbsAId = '00000000-0000-0000-0000-000000000501';
      await appClient.query(`
        INSERT INTO liquidaciones_beneficios (id, empresa_id, trabajador_id, periodo_cese, fecha_ingreso, fecha_cese, motivo_cese, remuneracion_computable, neto_liquidacion)
        VALUES ($1, $2, $3, '2026-09', '2026-01-01', '2026-09-15', '01', 3200, 2500)
      `, [lbsAId, empA, trabAId]);

      // Insertar T-Registro para Empresa A
      const tregAId = '00000000-0000-0000-0000-000000000601';
      await appClient.query(`
        INSERT INTO tregistro_movimientos (id, empresa_id, trabajador_id, tipo_movimiento, fecha_efectiva, linea_estructura_txt)
        VALUES ($1, $2, $3, 'ALTA', '2026-01-01', '01|41223344|604|1|1|01/01/2026|||')
      `, [tregAId, empA, trabAId]);

      // Insertar Asiento para Empresa A
      const asientoAId = '00000000-0000-0000-0000-000000000701';
      await appClient.query(`
        INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, fecha, glosa, moneda, estado)
        VALUES ($1, $2, '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021', '2026-09-15', 'Asiento Empresa A', 'PEN', 'BORRADOR')
      `, [asientoAId, empA]);

      // Insertar Auditoría para Empresa A
      const audAId = '00000000-0000-0000-0000-000000000801';
      await appClient.query(`
        INSERT INTO auditoria_log (id, empresa_id, usuario_id, tabla_afectada, registro_id, accion, hash_previo, hash_actual)
        VALUES ($1, $2, $3, 'trabajadores', $4, 'INSERT', '000000', '111111')
      `, [audAId, empA, usrAdmin, trabAId]);

      const trabBId = crypto.randomUUID();
      await fijarEmpresa(appClient, empB);
      await appClient.query(`
        INSERT INTO trabajadores (id, empresa_id, tipo_documento, numero_documento, nombres, apellidos, fecha_ingreso, cargo, sueldo_base, sistema_pensiones)
        VALUES ($1, $2, '01', '49887765', 'TRABAJADOR B', 'APELLIDO B', '2026-01-01', 'CONTADOR', 2500, 'ONP')
      `, [trabBId, empB]);
      await fijarEmpresa(appClient, empA);

      // C) Intentar INSERT con empresa_id de Empresa B estando en contexto de A -> debe ser rechazado
      console.log('   c) Intentando INSERT con empresa_id de Empresa B estando en contexto de A (debe fallar)...');
      for (const tabla of TABLAS_A_PROBAR) {
        await comprobarRestriccion(appClient, async () => {
          if (tabla === 'trabajadores') {
            await appClient.query(`
              INSERT INTO trabajadores (id, empresa_id, tipo_documento, numero_documento, nombres, apellidos, fecha_ingreso, cargo, regimen_laboral, sueldo_base, sistema_pensiones)
              VALUES ('00000000-0000-0000-0000-000000000102', $1, '01', '49887766', 'INTRUSO', 'B', '2026-01-01', 'CONTADOR', 'GENERAL', 2500, 'ONP')
            `, [empB]);
          } else if (tabla === 'planillas') {
            await appClient.query(`
              INSERT INTO planillas (id, empresa_id, periodo_id, mes, fecha_calculo, total_ingresos, total_descuentos, total_aportes_empleador, total_neto, estado)
              VALUES ('00000000-0000-0000-0000-000000000202', $1, '00000000-0000-0000-0000-000000000012', '2026-09', '2026-09-30', 2500, 300, 225, 2200, 'CALCULADA')
            `, [empB]);
          } else if (tabla === 'asientos') {
            await appClient.query(`
              INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, fecha, glosa, moneda, estado)
              VALUES ('00000000-0000-0000-0000-000000000702', $1, '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000022', '2026-09-15', 'Asiento intruso', 'PEN', 'BORRADOR')
            `, [empB]);
          } else if (tabla === 'auditoria_log') {
            await appClient.query(`
              INSERT INTO auditoria_log (id, empresa_id, usuario_id, tabla_afectada, registro_id, accion, hash_previo, hash_actual)
              VALUES ('00000000-0000-0000-0000-000000000802', $1, $2, 'trabajadores', 'reg-02', 'INSERT', '000000', '222222')
            `, [empB, usrAdmin]);
          } else if (tabla === 'planilla_gratificaciones') {
            await appClient.query(`
              INSERT INTO planilla_gratificaciones (empresa_id, trabajador_id, periodo, semestre)
              VALUES ($1, $2, '2026-07', 'JULIO')
            `, [empB, trabBId]);
          } else if (tabla === 'planilla_cts') {
            await appClient.query(`
              INSERT INTO planilla_cts (empresa_id, trabajador_id, periodo, semestre)
              VALUES ($1, $2, '2026-05', 'MAYO')
            `, [empB, trabBId]);
          } else if (tabla === 'liquidaciones_beneficios') {
            await appClient.query(`
              INSERT INTO liquidaciones_beneficios (empresa_id, trabajador_id, periodo_cese, fecha_ingreso, fecha_cese, motivo_cese)
              VALUES ($1, $2, '2026-09', '2026-01-01', '2026-09-15', '01')
            `, [empB, trabBId]);
          } else {
            await appClient.query(`
              INSERT INTO tregistro_movimientos (empresa_id, trabajador_id, tipo_movimiento, fecha_efectiva, linea_estructura_txt)
              VALUES ($1, $2, 'ALTA', '2026-01-01', '01|49887765|604|1|1|01/01/2026|||')
            `, [empB, trabBId]);
          }
        }, '42501');
      }
      console.log('      ✔ INSERT cruzado en las ocho tablas fue rechazado por RLS (SQLSTATE 42501).');

      // D) Cambiar contexto a Empresa B:
      console.log('   d) Cambiando contexto a Empresa B...');
      await fijarEmpresa(appClient, empB);

      // Verificar que SELECT devuelve 0 filas para los registros de Empresa A
      const selTrab = await appClient.query(`SELECT * FROM trabajadores WHERE id = $1`, [trabAId]);
      assert.equal(selTrab.rowCount, 0, 'Contexto B no debe ver trabajadores de Empresa A');

      const selPlan = await appClient.query(`SELECT * FROM planillas WHERE id = $1`, [planAId]);
      assert.equal(selPlan.rowCount, 0, 'Contexto B no debe ver planillas de Empresa A');

      const selGrat = await appClient.query(`SELECT * FROM planilla_gratificaciones WHERE id = $1`, [gratAId]);
      assert.equal(selGrat.rowCount, 0, 'Contexto B no debe ver gratificaciones de Empresa A');

      const selCts = await appClient.query(`SELECT * FROM planilla_cts WHERE id = $1`, [ctsAId]);
      assert.equal(selCts.rowCount, 0, 'Contexto B no debe ver CTS de Empresa A');

      const selLbs = await appClient.query(`SELECT * FROM liquidaciones_beneficios WHERE id = $1`, [lbsAId]);
      assert.equal(selLbs.rowCount, 0, 'Contexto B no debe ver liquidaciones de Empresa A');

      const selTreg = await appClient.query(`SELECT * FROM tregistro_movimientos WHERE id = $1`, [tregAId]);
      assert.equal(selTreg.rowCount, 0, 'Contexto B no debe ver T-Registro de Empresa A');

      const selAsiento = await appClient.query(`SELECT * FROM asientos WHERE id = $1`, [asientoAId]);
      assert.equal(selAsiento.rowCount, 0, 'Contexto B no debe ver asientos de Empresa A');

      const selAud = await appClient.query(`SELECT * FROM auditoria_log WHERE id = $1`, [audAId]);
      assert.equal(selAud.rowCount, 0, 'Contexto B no debe ver auditoría de Empresa A');

      // Verificar que UPDATE y DELETE sobre filas de Empresa A afectan exactamente 0 filas
      const updTrab = await appClient.query(`UPDATE trabajadores SET sueldo_base = 9999 WHERE id = $1`, [trabAId]);
      assert.equal(updTrab.rowCount, 0, 'UPDATE cruzado debe afectar 0 filas');

      const delTrab = await appClient.query(`DELETE FROM trabajadores WHERE id = $1`, [trabAId]);
      assert.equal(delTrab.rowCount, 0, 'DELETE cruzado debe afectar 0 filas');

      const updAsiento = await appClient.query(`UPDATE asientos SET glosa = 'HACK' WHERE id = $1`, [asientoAId]);
      assert.equal(updAsiento.rowCount, 0, 'UPDATE cruzado en asientos debe afectar 0 filas');

      const delAsiento = await appClient.query(`DELETE FROM asientos WHERE id = $1`, [asientoAId]);
      assert.equal(delAsiento.rowCount, 0, 'DELETE cruzado en asientos debe afectar 0 filas');

      console.log('      ✔ Comprobado: SELECT, UPDATE y DELETE cruzados afectan 0 filas.');

      for (const [empresa, propia, ajena] of [[empB, trabBId, trabAId], [empA, trabAId, trabBId]]) {
        await fijarEmpresa(appClient, empresa);
        assert.equal((await appClient.query('SELECT id FROM trabajadores WHERE id = $1', [propia])).rowCount, 1);
        assert.equal((await appClient.query('SELECT id FROM trabajadores WHERE id = $1', [ajena])).rowCount, 0);
      }
      console.log('      ✔ Con filas válidas para A y B, cada sesión ve una fila propia y cero ajenas.');

      const centros = new Map<string, string>();
      const detalles = new Map<string, string>();
      const reglas = new Map<string, string>();
      for (const empresa of [empA, empB]) {
        await fijarEmpresa(appClient, empresa);
        const { rows: [centro] } = await appClient.query<{ id: string }>(`
          INSERT INTO centros_costo (empresa_id, codigo, descripcion)
          VALUES ($1, 'ATLOB-PG', 'Centro de prueba RLS') RETURNING id
        `, [empresa]);
        const { rows: [regla] } = await appClient.query<{ id: string }>(`
          INSERT INTO reglas_contabilizacion (empresa_id, tipo_operacion, nombre)
          VALUES ($1, 'VENTA', 'Regla de prueba RLS') RETURNING id
        `, [empresa]);
        const { rows: [detalle] } = await appClient.query<{ id: string }>(`
          INSERT INTO reglas_contabilizacion_detalle (regla_id, orden, codigo_cuenta, lado, base_calculo)
          VALUES ($1, 1, '101', 'DEBE', 'TOTAL') RETURNING id
        `, [regla.id]);
        centros.set(empresa, centro.id);
        reglas.set(empresa, regla.id);
        detalles.set(empresa, detalle.id);
      }
      for (const [propia, ajena] of [[empB, empA], [empA, empB]]) {
        await appClient.query("SELECT set_config('app.current_empresa_id', $1, true)", [ajena]);
        await fijarEmpresa(appClient, propia);
        const centrosVisibles = await appClient.query('SELECT id FROM centros_costo WHERE id = ANY($1::uuid[])', [[...centros.values()]]);
        const detallesVisibles = await appClient.query('SELECT id FROM reglas_contabilizacion_detalle WHERE id = ANY($1::uuid[])', [[...detalles.values()]]);
        assert.deepEqual(centrosVisibles.rows.map(row => row.id), [centros.get(propia)]);
        assert.deepEqual(detallesVisibles.rows.map(row => row.id), [detalles.get(propia)]);
        await comprobarRestriccion(appClient, () => appClient.query(`
          INSERT INTO reglas_contabilizacion_detalle (regla_id, orden, codigo_cuenta, lado, base_calculo)
          VALUES ($1, 2, '101', 'DEBE', 'TOTAL')
        `, [reglas.get(ajena)]), '42501');
      }
      console.log('      ✔ app.empresa_id aísla centros_costo y reglas_contabilizacion_detalle; detalle cruzado rechazado (42501).');

      const periodoId = '00000000-0000-0000-0000-000000000011';
      const subdiarioId = '00000000-0000-0000-0000-000000000021';
      const insertarAsiento = (numero: string, cuo: string, subdiario = subdiarioId) => appClient.query(`
        INSERT INTO asientos (empresa_id, periodo_id, subdiario_id, numero, cuo, fecha, glosa)
        VALUES ($1, $2, $3, $4, $5, '2026-09-15', 'Asiento de restricciones')
      `, [empA, periodoId, subdiario, numero, cuo]);
      const insertarCorrelativo = () => appClient.query(`
        INSERT INTO correlativos (empresa_id, periodo_id, subdiario_id) VALUES ($1, $2, $3)
      `, [empA, periodoId, subdiarioId]);
      await insertarAsiento('ATLOB-PG-01', 'ATLOB-PG-CUO-01');
      await comprobarRestriccion(appClient, () => insertarAsiento('ATLOB-PG-01', 'ATLOB-PG-CUO-02'), '23505', 'uq_asiento_empresa_periodo_subdiario_numero');
      await comprobarRestriccion(appClient, () => insertarAsiento('ATLOB-PG-02', 'ATLOB-PG-CUO-01'), '23505', 'uq_asiento_empresa_periodo_cuo');
      await insertarCorrelativo();
      await comprobarRestriccion(appClient, insertarCorrelativo, '23505', 'uq_correlativo_empresa_periodo_subdiario');
      await comprobarRestriccion(appClient, () => insertarAsiento('ATLOB-PG-02', 'ATLOB-PG-CUO-02', crypto.randomUUID()), '23503', 'asientos_subdiario_id_fkey');
      console.log('      ✔ Correlativo, numeración y CUO duplicados: SQLSTATE 23505 en las tres restricciones esperadas.');
      console.log('      ✔ Subdiario inexistente: SQLSTATE 23503 (asientos_subdiario_id_fkey).');

      await appClient.query('ROLLBACK');
    } finally {
      appClient.release(true);
    }

    // 6. Demostración de FORCE RLS sobre el rol propietario/dueño de las tablas
    console.log('\n6. Demostrando FORCE RLS efectivo sobre el rol propietario de la tabla...');
    const ownerRlsClient = await ownerPool.connect();
    try {
      await ownerRlsClient.query('BEGIN');
      // Sin contexto de empresa canónico.
      await fijarEmpresa(ownerRlsClient, '');
      // Con FORCE RLS activo, el dueño de la tabla (no superusuario) es restringido por la política
      const resOwner = await ownerRlsClient.query(`SELECT count(*)::int as count FROM trabajadores`);
      assert.equal(resOwner.rows[0].count, 0, 'Incluso el rol dueño con FORCE RLS ve 0 filas cuando no hay empresa activa.');
      console.log('   ✔ FORCE RLS verificado: las políticas se aplican obligatoriamente.');
      await ownerRlsClient.query('ROLLBACK');
    } finally {
      ownerRlsClient.release(true);
    }

    // 7. Demostración de Inmutabilidad de auditoria_log (Rechazo de UPDATE, DELETE y TRUNCATE)
    console.log('\n7. Demostrando rechazo de UPDATE, DELETE y TRUNCATE en auditoria_log (Append-Only)...');
    const audTestClient = await ownerPool.connect();
    try {
      await audTestClient.query('BEGIN');
      await fijarEmpresa(audTestClient, empA);

      const logId = '00000000-0000-0000-0000-000000000999';
      await audTestClient.query(`
        INSERT INTO auditoria_log (id, empresa_id, usuario_id, tabla_afectada, registro_id, accion, hash_previo, hash_actual)
        VALUES ($1, $2, $3, 'test_inmutable', 'reg-01', 'INSERT', '000000', '333333')
      `, [logId, empA, usrAdmin]);

      // Intento 1: UPDATE
      let falloUpdateAud = false;
      await audTestClient.query('SAVEPOINT sp_aud_upd');
      try {
        await audTestClient.query(`UPDATE auditoria_log SET tabla_afectada = 'HACKEADO' WHERE id = $1`, [logId]);
      } catch (e: any) {
        falloUpdateAud = true;
        assert.match(e.message, /AUDITORIA_INMUTABLE/, 'Error debe mencionar AUDITORIA_INMUTABLE');
        await audTestClient.query('ROLLBACK TO SAVEPOINT sp_aud_upd');
      }
      assert.equal(falloUpdateAud, true, 'auditoria_log debe rechazar UPDATE');

      // Intento 2: DELETE
      let falloDeleteAud = false;
      await audTestClient.query('SAVEPOINT sp_aud_del');
      try {
        await audTestClient.query(`DELETE FROM auditoria_log WHERE id = $1`, [logId]);
      } catch (e: any) {
        falloDeleteAud = true;
        assert.match(e.message, /AUDITORIA_INMUTABLE/, 'Error debe mencionar AUDITORIA_INMUTABLE');
        await audTestClient.query('ROLLBACK TO SAVEPOINT sp_aud_del');
      }
      assert.equal(falloDeleteAud, true, 'auditoria_log debe rechazar DELETE');

      // Intento 3: TRUNCATE
      let falloTruncateAud = false;
      await audTestClient.query('SAVEPOINT sp_aud_trunc');
      try {
        await audTestClient.query(`TRUNCATE TABLE auditoria_log`);
      } catch (e: any) {
        falloTruncateAud = true;
        assert.match(e.message, /AUDITORIA_INMUTABLE/, 'Error debe mencionar AUDITORIA_INMUTABLE');
        await audTestClient.query('ROLLBACK TO SAVEPOINT sp_aud_trunc');
      }
      assert.equal(falloTruncateAud, true, 'auditoria_log debe rechazar TRUNCATE');

      console.log('   ✔ Comprobado: auditoria_log rechazó UPDATE, DELETE y TRUNCATE mediante trigger append-only.');
      await audTestClient.query('ROLLBACK');
    } finally {
      audTestClient.release(true);
    }

    // 8. Demostración de Trigger de Inmutabilidad de Asientos Contabilizados
    console.log('\n8. Demostrando trigger de inmutabilidad de asientos contabilizados...');
    const inmutClient = await ownerPool.connect();
    try {
      await inmutClient.query('BEGIN');
      await fijarEmpresa(inmutClient, empA);

      const asientoSelloId = '00000000-0000-0000-0000-000000000888';
      await inmutClient.query(`
        INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, numero, fecha, glosa, moneda, estado)
        VALUES ($1, $2, '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021', '01090001', '2026-09-15', 'Asiento Contabilizado Inmutable', 'PEN', 'BORRADOR')
      `, [asientoSelloId, empA]);

      await inmutClient.query(`
        INSERT INTO asiento_detalle (id, asiento_id, empresa_id, linea, cuenta_id, debe, haber)
        VALUES
          ('00000000-0000-0000-0000-000000000881', $1, $2, 1, '00000000-0000-0000-0000-0000000000c1', 1500, 0),
          ('00000000-0000-0000-0000-000000000882', $1, $2, 2, '00000000-0000-0000-0000-0000000000c2', 0, 1500)
      `, [asientoSelloId, empA]);

      await inmutClient.query(`
        UPDATE asientos SET estado = 'CONTABILIZADO' WHERE id = $1
      `, [asientoSelloId]);

      // Intento de UPDATE sobre asiento contabilizado
      let falloUpdateAsiento = false;
      await inmutClient.query('SAVEPOINT sp_asiento_upd');
      try {
        await inmutClient.query(`UPDATE asientos SET glosa = 'Glosa alterada' WHERE id = $1`, [asientoSelloId]);
      } catch (e: any) {
        falloUpdateAsiento = true;
        assert.match(e.message, /(ASIENTO_INMUTABLE|DETALLE_INMUTABLE)/, 'Error debe mencionar ASIENTO_INMUTABLE o DETALLE_INMUTABLE');
        await inmutClient.query('ROLLBACK TO SAVEPOINT sp_asiento_upd');
      }
      assert.equal(falloUpdateAsiento, true, 'No debe permitir UPDATE a un asiento ya contabilizado');

      // Intento de DELETE sobre asiento contabilizado
      let falloDeleteAsiento = false;
      await inmutClient.query('SAVEPOINT sp_asiento_del');
      try {
        await inmutClient.query(`DELETE FROM asientos WHERE id = $1`, [asientoSelloId]);
      } catch (e: any) {
        falloDeleteAsiento = true;
        assert.match(e.message, /(ASIENTO_INMUTABLE|DETALLE_INMUTABLE)/, 'Error debe mencionar ASIENTO_INMUTABLE o DETALLE_INMUTABLE');
        await inmutClient.query('ROLLBACK TO SAVEPOINT sp_asiento_del');
      }
      assert.equal(falloDeleteAsiento, true, 'No debe permitir DELETE a un asiento ya contabilizado');

      console.log('   ✔ Comprobado: asiento contabilizado protegido contra UPDATE y DELETE por fn_inmutabilidad_asiento.');
      await inmutClient.query('ROLLBACK');
    } finally {
      inmutClient.release(true);
    }

    // 9. Demostración de Concurrencia Atómica (Dos contabilizaciones simultáneas del mismo asiento)
    console.log('\n9. Demostrando concurrencia atómica: dos contabilizaciones simultáneas del mismo asiento (solo una gana)...');
    const concAClient = await ownerPool.connect();
    const concBClient = await ownerPool.connect();

    try {
      // Crear un asiento borrador listo para contabilizar
      const asientoBorradorId = crypto.randomUUID();
      const detalle1Id = crypto.randomUUID();
      const detalle2Id = crypto.randomUUID();
      await ownerClient.query('BEGIN');
      await fijarEmpresa(ownerClient, empA);
      await ownerClient.query(`
        INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, fecha, glosa, moneda, estado)
        VALUES ($1, $2, '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021', '2026-09-15', 'Asiento Concurrente', 'PEN', 'BORRADOR')
      `, [asientoBorradorId, empA]);

      await ownerClient.query(`
        INSERT INTO asiento_detalle (id, asiento_id, empresa_id, linea, cuenta_id, debe, haber)
        VALUES
          ($3, $1, $2, 1, '00000000-0000-0000-0000-0000000000c1', 200, 0),
          ($4, $1, $2, 2, '00000000-0000-0000-0000-0000000000c2', 0, 200)
      `, [asientoBorradorId, empA, detalle1Id, detalle2Id]);
      // El borrador debe ser visible en las dos conexiones que compiten por contabilizarlo.
      await ownerClient.query('COMMIT');

      // Función que simula el flujo de contabilización atómica con SELECT ... FOR UPDATE
      async function contabilizarConcurrente(client: PoolClient, workerName: string): Promise<string> {
        await client.query('BEGIN');
        // Establecer contexto de empresa
        await fijarEmpresa(client, empA);

        // Bloqueo pesimista de fila
        const aRes = await client.query(
          `SELECT id, estado FROM asientos WHERE id = $1 FOR UPDATE`,
          [asientoBorradorId]
        );
        if (aRes.rowCount === 0) {
          await client.query('ROLLBACK');
          throw new Error('ASIENTO_NO_ENCONTRADO');
        }

        const estadoActual = aRes.rows[0].estado;
        if (estadoActual === 'CONTABILIZADO') {
          await client.query('ROLLBACK');
          throw new Error('ASIENTO_YA_CONTABILIZADO');
        }

        // Simular pequeño retraso de procesamiento para provocar contención
        await new Promise(r => setTimeout(r, 50));

        // Actualizar correlativo y estado
        await client.query(`
          UPDATE asientos SET
            estado = 'CONTABILIZADO',
            numero = $2,
            version = version + 1
          WHERE id = $1
        `, [asientoBorradorId, `T-${asientoBorradorId.replaceAll('-', '').slice(0, 18)}`]);

        await client.query('COMMIT');
        return `${workerName}_GANO`;
      }

      // Disparar ambas contabilizaciones en paralelo
      const resultados = await Promise.allSettled([
        contabilizarConcurrente(concAClient, 'WORKER_1'),
        contabilizarConcurrente(concBClient, 'WORKER_2')
      ]);

      const exitosos = resultados.filter(r => r.status === 'fulfilled');
      const rechazados = resultados.filter(r => r.status === 'rejected');

      assert.equal(exitosos.length, 1, 'Exactamente una transacción debe tener éxito en contabilizar');
      assert.equal(rechazados.length, 1, 'Exactamente una transacción debe ser rechazada por colisión');

      const errorRechazo = (rechazados[0] as PromiseRejectedResult).reason;
      assert.match(
        errorRechazo.message,
        /ASIENTO_YA_CONTABILIZADO/,
        'El segundo worker debe recibir ASIENTO_YA_CONTABILIZADO tras desbloquearse la fila'
      );

      console.log(`   ✔ Concurrencia atómica verificada: 1 éxito (${(exitosos[0] as PromiseFulfilledResult<any>).value}), 1 rechazo (${errorRechazo.message}).`);
    } finally {
      concAClient.release(true);
      concBClient.release(true);
    }

    // 10. Demostración de Trigger Diferido de Partida Doble (trg_asiento_partida_doble / fn_validar_partida_doble)
    console.log('\n10. Demostrando rechazo de COMMIT en asiento CONTABILIZADO descuadrado (trg_asiento_partida_doble)...');
    const descClient = await ownerPool.connect();
    try {
      await descClient.query('BEGIN');
      await fijarEmpresa(descClient, empA);

      const asientoDescId = crypto.randomUUID();
      await descClient.query(`
        INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, numero, fecha, glosa, moneda, estado)
        VALUES ($1, $2, '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021', '01099999', '2026-09-20', 'Asiento Descuadrado Prueba Trigger', 'PEN', 'BORRADOR')
      `, [asientoDescId, empA]);

      await descClient.query(`
        INSERT INTO asiento_detalle (id, asiento_id, empresa_id, linea, cuenta_id, debe, haber)
        VALUES
          ($3, $1, $2, 1, '00000000-0000-0000-0000-0000000000c1', 1500.00, 0),
          ($4, $1, $2, 2, '00000000-0000-0000-0000-0000000000c2', 0, 1499.99)
      `, [asientoDescId, empA, crypto.randomUUID(), crypto.randomUUID()]);

      await descClient.query("UPDATE asientos SET estado = 'CONTABILIZADO' WHERE id = $1", [asientoDescId]);
      await assert.rejects(() => descClient.query('COMMIT'), { code: 'P0001', message: /ASIENTO_DESCUADRADO/ });
      console.log('   ✔ trg_asiento_partida_doble abortó el COMMIT (1500.00 vs 1499.99, SQLSTATE P0001, ASIENTO_DESCUADRADO).');
    } finally {
      descClient.release(true);
    }

    console.log('\n====================================================================');
    console.log('✅ TODAS LAS PRUEBAS DE COMPORTAMIENTO EN POSTGRESQL REAL PASARON.');
    console.log('   Etiqueta de estado: IMPLEMENTADO Y PROBADO EN POSTGRESQL REAL');
    console.log('====================================================================\n');
  } finally {
    ownerClient?.release(true);
    await ownerPool.end();
  }
}

async function main() {
  const local = fs.existsSync('.env') ? parse(fs.readFileSync('.env')) : {};
  const testDbUrl = process.env.TEST_DATABASE_URL ?? local.TEST_DATABASE_URL;
  assert(testDbUrl, 'Configure TEST_DATABASE_URL en .env local antes de ejecutar test:pg.');
  let destino: URL;
  try {
    destino = new URL(testDbUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL no tiene el formato de una URL de PostgreSQL.');
  }
  assert(
    ['postgres:', 'postgresql:'].includes(destino.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname) &&
    destino.username === 'contabilidad_app' && destino.pathname === '/atlob_test' &&
    [...destino.searchParams.keys()].every(key => key === 'sslmode'),
    'TEST_DATABASE_URL debe usar contabilidad_app en atlob_test de PostgreSQL local.'
  );

  await ejecutarPruebaComportamientoPostgresReal(testDbUrl);
}

main().catch((error: Error & { code?: string; constraint?: string }) => {
  if (error.code && error.code !== 'ERR_ASSERTION') {
    console.error(`❌ PostgreSQL rechazó la operación (${error.code}${error.constraint ? `, ${error.constraint}` : ''}).`);
  } else {
    console.error(`❌ ${error.message}`);
  }
  process.exitCode = 1;
});
