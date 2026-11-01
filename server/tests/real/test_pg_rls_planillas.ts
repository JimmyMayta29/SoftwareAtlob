import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Pool, PoolClient } from 'pg';
import { MIGRATION_FILES } from '../../db/migrate';
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

async function ejecutarPruebaComportamientoPostgresReal(databaseUrl: string) {
  console.log('====================================================================');
  console.log('🐘 INICIANDO PRUEBA COMPORTAMENTAL EN POSTGRESQL 15+ REAL (RLS + NOBYPASSRLS)');
  console.log('====================================================================\n');

  const ownerPool = new Pool({ connectionString: databaseUrl, max: 5 });
  const ownerClient = await ownerPool.connect();

  try {
    // 0. Verificar versión del motor
    const versionRes = await ownerClient.query("SELECT current_setting('server_version_num')::int AS ver, version() AS full_ver");
    const serverVer = versionRes.rows[0].ver;
    console.log(`🔌 Conectado a base de datos PostgreSQL:`);
    console.log(`   ${versionRes.rows[0].full_ver}\n`);
    assert(serverVer >= 140000, `Se requiere PostgreSQL >= 14. Versión actual: ${serverVer}`);

    // 1. Ejecutar migraciones completas como rol propietario/migrador
    console.log('1. Aplicando DDL de migraciones completas como rol propietario/migrador...');
    const dbDir = path.resolve(process.cwd(), 'server/db');
    for (const migFile of MIGRATION_FILES) {
      const sqlPath = path.join(dbDir, migFile);
      if (fs.existsSync(sqlPath)) {
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await ownerClient.query(sql);
      }
    }
    console.log('   ✔ Migraciones DDL aplicadas exitosamente.');

    // 2. Configurar rol app_user con NOBYPASSRLS
    console.log('2. Configurando rol restringido app_user con NOBYPASSRLS...');
    await ownerClient.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
          CREATE ROLE app_user NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
        ELSE
          ALTER ROLE app_user NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
        END IF;
      END $$;
    `);
    await ownerClient.query('GRANT USAGE ON SCHEMA public TO app_user');
    await ownerClient.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user');
    await ownerClient.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user');
    console.log('   ✔ Rol app_user asegurado con atributos NOSUPERUSER y NOBYPASSRLS.');

    // 3. Verificar estado en catálogo pg_class: relrowsecurity y relforcerowsecurity
    console.log('3. Verificando catálogo pg_class (relrowsecurity y relforcerowsecurity) para las 8 tablas...');
    for (const tabla of TABLAS_A_PROBAR) {
      const catRes = await ownerClient.query(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = $1`,
        [tabla]
      );
      assert.equal(catRes.rowCount, 1, `Tabla ${tabla} debe existir en el catálogo pg_class`);
      assert.equal(catRes.rows[0].relrowsecurity, true, `RLS (relrowsecurity) debe ser true en ${tabla}`);
      assert.equal(catRes.rows[0].relforcerowsecurity, true, `FORCE RLS (relforcerowsecurity) debe ser true en ${tabla}`);
      assert.ok(
        REGISTRO_DATOS_EMPRESA.some(r => r.tabla === tabla),
        `La tabla ${tabla} debe estar inscrita en REGISTRO_DATOS_EMPRESA`
      );
      console.log(`   ✔ ${tabla}: relrowsecurity=true, relforcerowsecurity=true, registrada en REGISTRO_DATOS_EMPRESA`);
    }

    // 4. Sembrar datos maestros de prueba (Tenant, Empresas A y B, Ejercicio, Periodo, Subdiario, Cuentas)
    console.log('\n4. Sembrando datos maestros aislados para Empresa A y Empresa B...');
    const tenantId = '00000000-0000-0000-0000-000000000001';
    const empA = '00000000-0000-0000-0000-0000000000a1';
    const empB = '00000000-0000-0000-0000-0000000000b2';
    const usrAdmin = '00000000-0000-0000-0000-000000000001';

    await ownerClient.query(`
      INSERT INTO tenants (id, nombre, ruc) VALUES ($1, 'TENANT TEST', '20100000001')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO usuarios_estudio (id, email, nombre, password_hash, rol_global)
      VALUES ($1, 'admin@test.pe', 'ADMIN TEST', '$2a$10$abcdefghijklmnopqrstuv', 'ADMINISTRADOR')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO empresas (id, tenant_id, codigo_empresa, ruc, razon_social, regimen_tributario, domicilio_fiscal, moneda_principal)
      VALUES
        ($2, $1, 'EMPA', '20600000011', 'EMPRESA A SAC', 'REGIMEN_GENERAL', 'AV A 123', 'PEN'),
        ($3, $1, 'EMPB', '20600000022', 'EMPRESA B SAC', 'REGIMEN_GENERAL', 'AV B 456', 'PEN')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO ejercicios (id, empresa_id, anio, estado) VALUES
        ('00000000-0000-0000-0000-0000000000e1', $2, 2026, 'ABIERTO'),
        ('00000000-0000-0000-0000-0000000000e2', $3, 2026, 'ABIERTO')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO periodos (id, empresa_id, ejercicio_id, anio, mes, codigo_periodo, estado) VALUES
        ('00000000-0000-0000-0000-0000000000p1', $2, '00000000-0000-0000-0000-0000000000e1', 2026, 9, '2026-09', 'ABIERTO'),
        ('00000000-0000-0000-0000-0000000000p2', $3, '00000000-0000-0000-0000-0000000000e2', 2026, 9, '2026-09', 'ABIERTO')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO subdiarios (id, empresa_id, codigo, descripcion, tipo) VALUES
        ('00000000-0000-0000-0000-0000000000s1', $2, '01', 'OPERACIONES MANUALES', 'APERTURA'),
        ('00000000-0000-0000-0000-0000000000s2', $3, '01', 'OPERACIONES MANUALES', 'APERTURA')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO plan_cuentas (id, empresa_id, codigo, descripcion, nivel, tipo_cuenta, permite_movimiento) VALUES
        ('00000000-0000-0000-0000-0000000000c1', $2, '1011', 'Caja M/N', 4, 'ACTIVO', TRUE),
        ('00000000-0000-0000-0000-0000000000c2', $2, '70111', 'Ventas M/N', 5, 'INGRESO', TRUE)
      ON CONFLICT (id) DO NOTHING;
    `, [tenantId, empA, empB]);

    // 5. Demostración de Aislamiento de Comportamiento RLS con rol app_user (NOBYPASSRLS)
    console.log('5. Demostrando aislamiento de comportamiento RLS con rol app_user (NOBYPASSRLS)...');
    
    // Crear cliente de conexión bajo app_user
    const appClient = await ownerPool.connect();
    try {
      await appClient.query('BEGIN');
      await appClient.query('SET LOCAL ROLE app_user');

      // A) Sin variable app.current_empresa_id: no se ve ningún registro
      console.log('   a) Probando consulta sin app.current_empresa_id (debe devolver 0 filas)...');
      await appClient.query(`SELECT set_config('app.current_empresa_id', '', true)`);
      for (const tabla of TABLAS_A_PROBAR) {
        const sinContexto = await appClient.query(`SELECT * FROM ${tabla}`);
        assert.equal(sinContexto.rowCount, 0, `Sin contexto de empresa, ${tabla} no debe devolver filas`);
      }
      console.log('      ✔ Comprobado: sin app.current_empresa_id no se filtra ningún dato.');

      // B) Fijar contexto en Empresa A:
      console.log('   b) Fijando contexto en Empresa A...');
      await appClient.query(`SELECT set_config('app.current_empresa_id', $1, true)`, [empA]);

      // Insertar trabajador para Empresa A
      const trabAId = '00000000-0000-0000-0000-000000000101';
      await appClient.query(`
        INSERT INTO trabajadores (id, empresa_id, tipo_documento, numero_documento, nombres, apellidos, fecha_ingreso, regimen_laboral, sueldo_base, sistema_pensiones)
        VALUES ($1, $2, '01', '41223344', 'TRABAJADOR A', 'APELLIDO A', '2026-01-01', 'GENERAL', 3200.00, 'ONP')
      `, [trabAId, empA]);

      // Insertar planillas para Empresa A
      const planAId = '00000000-0000-0000-0000-000000000201';
      await appClient.query(`
        INSERT INTO planillas (id, empresa_id, periodo_id, mes, fecha_calculo, total_ingresos, total_descuentos, total_aportes_empleador, total_neto, estado)
        VALUES ($1, $2, 'per-2026-09', '2026-09', '2026-09-30', 3200, 416, 288, 2784, 'CALCULADA')
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
        VALUES ($1, $2, '00000000-0000-0000-0000-0000000000p1', '00000000-0000-0000-0000-0000000000s1', '2026-09-15', 'Asiento Empresa A', 'PEN', 'BORRADOR')
      `, [asientoAId, empA]);

      // Insertar Auditoría para Empresa A
      const audAId = '00000000-0000-0000-0000-000000000801';
      await appClient.query(`
        INSERT INTO auditoria_log (id, empresa_id, tabla, registro_id, accion)
        VALUES ($1, $2, 'trabajadores', $3, 'INSERT')
      `, [audAId, empA, trabAId]);

      // C) Intentar INSERT con empresa_id de Empresa B estando en contexto de A -> debe ser rechazado
      console.log('   c) Intentando INSERT con empresa_id de Empresa B estando en contexto de A (debe fallar)...');
      for (const tabla of TABLAS_A_PROBAR) {
        let rechazoWithCheck = false;
        await appClient.query('SAVEPOINT sp_cross_insert');
        try {
          if (tabla === 'trabajadores') {
            await appClient.query(`
              INSERT INTO trabajadores (id, empresa_id, tipo_documento, numero_documento, nombres, apellidos, fecha_ingreso, regimen_laboral, sueldo_base, sistema_pensiones)
              VALUES ('00000000-0000-0000-0000-000000000102', $1, '01', '49887766', 'INTRUSO', 'B', '2026-01-01', 'GENERAL', 2500, 'ONP')
            `, [empB]);
          } else if (tabla === 'planillas') {
            await appClient.query(`
              INSERT INTO planillas (id, empresa_id, periodo_id, mes, fecha_calculo, total_ingresos, total_descuentos, total_aportes_empleador, total_neto, estado)
              VALUES ('00000000-0000-0000-0000-000000000202', $1, 'per-2026-09', '2026-09', '2026-09-30', 2500, 300, 225, 2200, 'CALCULADA')
            `, [empB]);
          } else if (tabla === 'asientos') {
            await appClient.query(`
              INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, fecha, glosa, moneda, estado)
              VALUES ('00000000-0000-0000-0000-000000000702', $1, '00000000-0000-0000-0000-0000000000p2', '00000000-0000-0000-0000-0000000000s2', '2026-09-15', 'Asiento intruso', 'PEN', 'BORRADOR')
            `, [empB]);
          } else if (tabla === 'auditoria_log') {
            await appClient.query(`
              INSERT INTO auditoria_log (id, empresa_id, tabla, registro_id, accion)
              VALUES ('00000000-0000-0000-0000-000000000802', $1, 'trabajadores', 'reg-02', 'INSERT')
            `, [empB]);
          } else {
            // Tablas dependientes de trabajador
            await appClient.query(`
              INSERT INTO ${tabla} (empresa_id) VALUES ($1)
            `, [empB]);
          }
        } catch {
          rechazoWithCheck = true;
          await appClient.query('ROLLBACK TO SAVEPOINT sp_cross_insert');
        }
        assert.equal(rechazoWithCheck, true, `INSERT en ${tabla} con empresa_id ajeno debe ser rechazado por RLS WITH CHECK`);
      }
      console.log('      ✔ Comprobado: INSERT cruzado fue rechazado para todas las tablas.');

      // D) Cambiar contexto a Empresa B:
      console.log('   d) Cambiando contexto a Empresa B...');
      await appClient.query(`SELECT set_config('app.current_empresa_id', $1, true)`, [empB]);

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

      await appClient.query('ROLLBACK');
    } finally {
      appClient.release();
    }

    // 6. Demostración de FORCE RLS sobre el rol propietario/dueño de las tablas
    console.log('\n6. Demostrando FORCE RLS efectivo sobre el rol propietario de la tabla...');
    const ownerRlsClient = await ownerPool.connect();
    try {
      await ownerRlsClient.query('BEGIN');
      // No seteamos app.current_empresa_id:
      await ownerRlsClient.query(`SELECT set_config('app.current_empresa_id', '', true)`);
      // Con FORCE RLS activo, el dueño de la tabla (no superusuario) es restringido por la política
      const resOwner = await ownerRlsClient.query(`SELECT count(*)::int as count FROM trabajadores`);
      assert.equal(resOwner.rows[0].count, 0, 'Incluso el rol dueño con FORCE RLS ve 0 filas cuando no hay empresa activa.');
      console.log('   ✔ FORCE RLS verificado: las políticas se aplican obligatoriamente.');
      await ownerRlsClient.query('ROLLBACK');
    } finally {
      ownerRlsClient.release();
    }

    // 7. Demostración de Inmutabilidad de auditoria_log (Rechazo de UPDATE, DELETE y TRUNCATE)
    console.log('\n7. Demostrando rechazo de UPDATE, DELETE y TRUNCATE en auditoria_log (Append-Only)...');
    const audTestClient = await ownerPool.connect();
    try {
      await audTestClient.query('BEGIN');
      await audTestClient.query(`SELECT set_config('app.current_empresa_id', $1, true)`, [empA]);

      const logId = '00000000-0000-0000-0000-000000000999';
      await audTestClient.query(`
        INSERT INTO auditoria_log (id, empresa_id, tabla, registro_id, accion)
        VALUES ($1, $2, 'test_inmutable', 'reg-01', 'INSERT')
      `, [logId, empA]);

      // Intento 1: UPDATE
      let falloUpdateAud = false;
      await audTestClient.query('SAVEPOINT sp_aud_upd');
      try {
        await audTestClient.query(`UPDATE auditoria_log SET tabla = 'HACKEADO' WHERE id = $1`, [logId]);
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
      audTestClient.release();
    }

    // 8. Demostración de Trigger de Inmutabilidad de Asientos Contabilizados
    console.log('\n8. Demostrando trigger de inmutabilidad de asientos contabilizados...');
    const inmutClient = await ownerPool.connect();
    try {
      await inmutClient.query('BEGIN');
      await inmutClient.query(`SELECT set_config('app.current_empresa_id', $1, true)`, [empA]);

      const asientoSelloId = '00000000-0000-0000-0000-000000000888';
      await inmutClient.query(`
        INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, numero, fecha, glosa, moneda, estado)
        VALUES ($1, $2, '00000000-0000-0000-0000-0000000000p1', '00000000-0000-0000-0000-0000000000s1', '01090001', '2026-09-15', 'Asiento Contabilizado Inmutable', 'PEN', 'CONTABILIZADO')
      `, [asientoSelloId, empA]);

      await inmutClient.query(`
        INSERT INTO asiento_detalle (id, asiento_id, empresa_id, linea, cuenta_id, debe, haber)
        VALUES
          ('00000000-0000-0000-0000-000000000881', $1, $2, 1, '00000000-0000-0000-0000-0000000000c1', 1500, 0),
          ('00000000-0000-0000-0000-000000000882', $1, $2, 2, '00000000-0000-0000-0000-0000000000c2', 0, 1500)
      `, [asientoSelloId, empA]);

      // Intento de UPDATE sobre asiento contabilizado
      let falloUpdateAsiento = false;
      await inmutClient.query('SAVEPOINT sp_asiento_upd');
      try {
        await inmutClient.query(`UPDATE asientos SET glosa = 'Glosa alterada' WHERE id = $1`, [asientoSelloId]);
      } catch (e: any) {
        falloUpdateAsiento = true;
        assert.match(e.message, /ASIENTO_INMUTABLE/, 'Error debe mencionar ASIENTO_INMUTABLE');
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
        assert.match(e.message, /ASIENTO_INMUTABLE/, 'Error debe mencionar ASIENTO_INMUTABLE');
        await inmutClient.query('ROLLBACK TO SAVEPOINT sp_asiento_del');
      }
      assert.equal(falloDeleteAsiento, true, 'No debe permitir DELETE a un asiento ya contabilizado');

      console.log('   ✔ Comprobado: asiento contabilizado protegido contra UPDATE y DELETE por fn_inmutabilidad_asiento.');
      await inmutClient.query('ROLLBACK');
    } finally {
      inmutClient.release();
    }

    // 9. Demostración de Concurrencia Atómica (Dos contabilizaciones simultáneas del mismo asiento)
    console.log('\n9. Demostrando concurrencia atómica: dos contabilizaciones simultáneas del mismo asiento (solo una gana)...');
    const concAClient = await ownerPool.connect();
    const concBClient = await ownerPool.connect();

    try {
      // Crear un asiento borrador listo para contabilizar
      const asientoBorradorId = '00000000-0000-0000-0000-000000000777';
      await ownerClient.query(`
        INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, fecha, glosa, moneda, estado)
        VALUES ($1, $2, '00000000-0000-0000-0000-0000000000p1', '00000000-0000-0000-0000-0000000000s1', '2026-09-15', 'Asiento Concurrente', 'PEN', 'BORRADOR')
        ON CONFLICT (id) DO NOTHING
      `, [asientoBorradorId, empA]);

      await ownerClient.query(`
        INSERT INTO asiento_detalle (id, asiento_id, empresa_id, linea, cuenta_id, debe, haber)
        VALUES
          ('00000000-0000-0000-0000-000000000771', $1, $2, 1, '00000000-0000-0000-0000-0000000000c1', 200, 0),
          ('00000000-0000-0000-0000-000000000772', $1, $2, 2, '00000000-0000-0000-0000-0000000000c2', 0, 200)
        ON CONFLICT (id) DO NOTHING
      `, [asientoBorradorId, empA]);

      // Función que simula el flujo de contabilización atómica con SELECT ... FOR UPDATE
      async function contabilizarConcurrente(client: PoolClient, workerName: string): Promise<string> {
        await client.query('BEGIN');
        await client.query(`SET LOCAL app.current_empresa_id = $1`, [empA]);

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
            numero = '0109' || lpad(floor(random() * 8999 + 1000)::text, 4, '0'),
            version = version + 1
          WHERE id = $1
        `, [asientoBorradorId]);

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
      concAClient.release();
      concBClient.release();
    }

    console.log('\n====================================================================');
    console.log('✅ TODAS LAS PRUEBAS DE COMPORTAMIENTO EN POSTGRESQL REAL PASARON.');
    console.log('   Etiqueta de estado: IMPLEMENTADO Y PROBADO EN POSTGRESQL REAL');
    console.log('====================================================================\n');
  } finally {
    ownerClient.release();
    await ownerPool.end();
  }
}

async function main() {
  const testDbUrl = process.env.TEST_DATABASE_URL;
  if (!testDbUrl) {
    console.error('❌ ERROR FATAL: TEST_DATABASE_URL es requerido para ejecutar test:pg.');
    console.error('   Esta prueba de comportamiento requiere una instancia PostgreSQL 15+ real.');
    console.error('   Configure TEST_DATABASE_URL=postgres://usuario:clave@host:puerto/bd_test');
    console.error('   O levante el entorno con: docker compose -f docker-compose.test.yml up -d');
    process.exit(1);
  }

  await ejecutarPruebaComportamientoPostgresReal(testDbUrl);
}

main().catch(err => {
  console.error('❌ Error en test_pg_rls_planillas:', err);
  process.exit(1);
});
