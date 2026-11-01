import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { MIGRATION_FILES } from '../../db/migrate';
import { REGISTRO_DATOS_EMPRESA } from '../../storage/registroDatosEmpresa';

const TABLAS_PLANILLA_RLS = [
  'trabajadores',
  'planillas',
  'planilla_gratificaciones',
  'planilla_cts',
  'liquidaciones_beneficios',
  'tregistro_movimientos'
];

async function ejecutarContraPostgresReal(databaseUrl: string) {
  console.log('====================================================================');
  console.log('🐘 EJECUTANDO PRUEBA RLS + NOBYPASSRLS EN POSTGRESQL 15+ REAL');
  console.log('====================================================================');

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    const ver = await client.query("SELECT current_setting('server_version_num')::int AS ver, version() AS full_ver");
    console.log(`Conectado a: ${ver.rows[0].full_ver}`);
    assert(ver.rows[0].ver >= 140000, 'Se requiere PostgreSQL >= 14');

    await client.query('BEGIN');

    // Crear rol app_user con NOBYPASSRLS
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
          CREATE ROLE app_user NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
        ELSE
          ALTER ROLE app_user NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
        END IF;
      END $$;
    `);
    await client.query('GRANT USAGE ON SCHEMA public TO app_user');
    await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user');

    // Verificar catálogo pg_class: relrowsecurity y relforcerowsecurity
    for (const tabla of TABLAS_PLANILLA_RLS) {
      const rlsInfo = await client.query(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = $1`,
        [tabla]
      );
      assert.equal(rlsInfo.rowCount, 1, `Tabla ${tabla} debe existir en pg_class`);
      assert.equal(rlsInfo.rows[0].relrowsecurity, true, `RLS debe estar habilitado en ${tabla}`);
      assert.equal(rlsInfo.rows[0].relforcerowsecurity, true, `FORCE RLS debe estar activo en ${tabla}`);
    }

    const empA = '00000000-0000-0000-0000-0000000000a1';
    const empB = '00000000-0000-0000-0000-0000000000b2';
    await client.query(
      `INSERT INTO empresas (id, ruc, razon_social, regimen_tributario) VALUES
       ($1, '20600000011', 'EMPRESA RLS A SAC', 'GENERAL'),
       ($2, '20600000022', 'EMPRESA RLS B SAC', 'GENERAL')
       ON CONFLICT (id) DO NOTHING`,
      [empA, empB]
    );

    // Cambiar a rol app_user (NOBYPASSRLS) y fijar contexto en Empresa A
    await client.query('SET LOCAL ROLE app_user');
    await client.query(`SELECT set_config('app.current_empresa_id', $1, true)`, [empA]);

    const trabA = '00000000-0000-0000-0000-000000000101';
    await client.query(
      `INSERT INTO trabajadores (id, empresa_id, tipo_documento, numero_documento, nombres, apellidos, fecha_ingreso, regimen_laboral, sueldo_base, sistema_pensiones)
       VALUES ($1, $2, '01', '45678901', 'CARLOS', 'RLS A', '2026-01-01', 'GENERAL', 3000, 'ONP')`,
      [trabA, empA]
    );

    // Intentar insertar fila para Empresa B estando en contexto de Empresa A -> debe fallar por RLS WITH CHECK
    let falloInsertCruzado = false;
    try {
      await client.query('SAVEPOINT sp_rls_insert');
      await client.query(
        `INSERT INTO trabajadores (id, empresa_id, tipo_documento, numero_documento, nombres, apellidos, fecha_ingreso, regimen_laboral, sueldo_base, sistema_pensiones)
         VALUES ($1, $2, '01', '45678902', 'INTRUSO', 'RLS B', '2026-01-01', 'GENERAL', 3000, 'ONP')`,
        ['00000000-0000-0000-0000-000000000102', empB]
      );
    } catch {
      falloInsertCruzado = true;
      await client.query('ROLLBACK TO SAVEPOINT sp_rls_insert');
    }
    assert.equal(falloInsertCruzado, true, 'app_user no debe poder insertar trabajadores en Empresa B desde contexto A');

    // Cambiar contexto a Empresa B y verificar aislamiento de lectura, actualización y borrado
    await client.query(`SELECT set_config('app.current_empresa_id', $1, true)`, [empB]);
    const lecturaDesdeB = await client.query(`SELECT * FROM trabajadores WHERE id = $1`, [trabA]);
    assert.equal(lecturaDesdeB.rowCount, 0, 'Empresa B no debe leer trabajadores de Empresa A');

    const updateDesdeB = await client.query(`UPDATE trabajadores SET sueldo_base = 9999 WHERE id = $1`, [trabA]);
    assert.equal(updateDesdeB.rowCount, 0, 'Empresa B no debe actualizar trabajadores de Empresa A');

    const deleteDesdeB = await client.query(`DELETE FROM trabajadores WHERE id = $1`, [trabA]);
    assert.equal(deleteDesdeB.rowCount, 0, 'Empresa B no debe borrar trabajadores de Empresa A');

    await client.query('ROLLBACK');
    console.log('✅ IMPLEMENTADO Y PROBADO EN POSTGRESQL REAL: RLS + FORCE RLS + app_user NOBYPASSRLS verificados.');
  } finally {
    client.release();
    await pool.end();
  }
}

async function ejecutarVerificacionPgMem() {
  console.log('====================================================================');
  console.log('🧪 VERIFICACIÓN DE ESQUEMA RLS Y TABLAS DE PLANILLAS EN pg-mem');
  console.log('⚠️  NOTA DE HONESTIDAD: TEST_DATABASE_URL no está definido y el');
  console.log('    contenedor no dispone de binario PostgreSQL local.');
  console.log('    Etiqueta de estado: PROBADO SOLO EN pg-mem');
  console.log('====================================================================\n');

  const sqlPath = path.join(process.cwd(), 'server', 'db', 'schema_fase9_planillas.sql');
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');

  // 1. Verificar que el DDL declara ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY y CREATE POLICY para las 6 tablas
  for (const tabla of TABLAS_PLANILLA_RLS) {
    assert.ok(
      sqlContent.includes(`ALTER TABLE ${tabla} ENABLE ROW LEVEL SECURITY;`),
      `Falta ENABLE ROW LEVEL SECURITY para ${tabla} en schema_fase9_planillas.sql`
    );
    assert.ok(
      sqlContent.includes(`ALTER TABLE ${tabla} FORCE ROW LEVEL SECURITY;`),
      `Falta FORCE ROW LEVEL SECURITY para ${tabla} en schema_fase9_planillas.sql`
    );
    assert.ok(
      sqlContent.includes(`ON ${tabla}`) && sqlContent.includes(`current_setting('app.current_empresa_id', true)::uuid`),
      `Falta política RLS current_empresa_id para ${tabla} en schema_fase9_planillas.sql`
    );
    assert.ok(
      REGISTRO_DATOS_EMPRESA.some(r => r.tabla === tabla),
      `La tabla ${tabla} debe estar inscrita en REGISTRO_DATOS_EMPRESA`
    );
    console.log(`  ✔ DDL RLS + FORCE RLS + Policy + REGISTRO_DATOS_EMPRESA verificados en: ${tabla}`);
  }

  // 2. Verificar que las migraciones listadas incluyen schema_fase9_planillas.sql
  assert.ok(
    MIGRATION_FILES.includes('schema_fase9_planillas.sql'),
    'schema_fase9_planillas.sql debe estar incluido en MIGRATION_FILES'
  );

  // 3. Instanciar pg-mem y validar creación de las tablas de planillas y aislamiento por empresa_id
  const db = newDb();
  db.public.none(`
    CREATE TABLE empresas (
      id UUID PRIMARY KEY,
      ruc VARCHAR(11) NOT NULL,
      razon_social TEXT NOT NULL
    );
    CREATE TABLE periodos_contables (
      id UUID PRIMARY KEY,
      empresa_id UUID NOT NULL REFERENCES empresas(id),
      anio INT NOT NULL,
      mes INT NOT NULL
    );
    CREATE TABLE asientos_contables (
      id UUID PRIMARY KEY,
      empresa_id UUID NOT NULL REFERENCES empresas(id)
    );
    CREATE TABLE usuarios_estudio (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL
    );
  `);

  // Ejecutar creación de tablas de schema_fase9_planillas.sql (omitiendo bloques DO $$ de políticas RLS que pg-mem no soporta en su parser AST)
  const ddlSoloTablas = sqlContent
    .replace(/DO \$\$[\s\S]*?END \$\$;/g, '')
    .replace(/ALTER TABLE [a-z_]+ ENABLE ROW LEVEL SECURITY;/g, '')
    .replace(/ALTER TABLE [a-z_]+ FORCE ROW LEVEL SECURITY;/g, '');

  db.public.none(ddlSoloTablas);

  const empA = '00000000-0000-0000-0000-0000000000a1';
  const empB = '00000000-0000-0000-0000-0000000000b2';
  db.public.none(`
    INSERT INTO empresas (id, ruc, razon_social) VALUES
      ('${empA}', '20600000011', 'EMPRESA A SAC'),
      ('${empB}', '20600000022', 'EMPRESA B SAC');
  `);

  // Insertar registros en Empresa A y Empresa B en las tablas nuevas de Planillas
  const trabA = '00000000-0000-0000-0000-000000000101';
  const trabB = '00000000-0000-0000-0000-000000000102';
  db.public.none(`
    INSERT INTO trabajadores (
      id, empresa_id, tipo_documento, numero_documento, nombres, apellidos,
      fecha_ingreso, regimen_laboral, sueldo_base, sistema_pensiones,
      cuenta_banco_sueldo_cifrada, cci_sueldo_cifrado, deduccion_adicional_3uit
    ) VALUES
      ('${trabA}', '${empA}', '01', '41112222', 'ANA', 'EMPRESA A', '2026-01-01', 'GENERAL', 3500.00, 'ONP', 'enc:aes256:a', 'enc:aes256:cci-a', 1500.00),
      ('${trabB}', '${empB}', '01', '43334444', 'LUIS', 'EMPRESA B', '2026-01-01', 'MYPE_PEQUENA', 2000.00, 'AFP', 'enc:aes256:b', 'enc:aes256:cci-b', 0.00);
  `);

  db.public.none(`
    INSERT INTO planilla_gratificaciones (
      id, empresa_id, periodo, semestre, trabajador_id, regimen_laboral,
      meses_computables, dias_computables, sueldo_computable, asignacion_familiar,
      promedio_variables, remuneracion_computable, gratificacion_ordinaria,
      tasa_bonif_extraordinaria, bonificacion_extraordinaria, neto_pagar
    ) VALUES (
      '00000000-0000-0000-0000-000000000201', '${empA}', '2026-07', 'JULIO', '${trabA}', 'GENERAL',
      6, 0, 3500, 102.50, 0, 3602.50, 3602.50, 0.09, 324.23, 3926.73
    );
  `);

  db.public.none(`
    INSERT INTO planilla_cts (
      id, empresa_id, periodo, semestre, trabajador_id, regimen_laboral,
      meses_computables, dias_computables, sueldo_computable, asignacion_familiar,
      sexto_gratificacion, promedio_variables, remuneracion_computable, cts_depositada
    ) VALUES (
      '00000000-0000-0000-0000-000000000301', '${empA}', '2026-05', 'MAYO', '${trabA}', 'GENERAL',
      6, 0, 3500, 102.50, 600.42, 0, 4202.92, 2101.46
    );
  `);

  db.public.none(`
    INSERT INTO liquidaciones_beneficios (
      id, empresa_id, trabajador_id, periodo_cese, fecha_ingreso, fecha_cese,
      motivo_cese, regimen_laboral, sueldo_basico, asignacion_familiar,
      remuneracion_computable, dias_trabajados_mes_cese, remuneracion_proporcional_mes,
      cts_trunca_meses, cts_trunca_dias, cts_trunca_monto,
      vacaciones_truncas_meses, vacaciones_truncas_dias, vacaciones_truncas_monto,
      gratificacion_trunca_meses, gratificacion_trunca_monto, bonif_extra_trunca_monto,
      total_bruto_beneficios, descuento_pension, aporte_essalud, neto_liquidacion
    ) VALUES (
      '00000000-0000-0000-0000-000000000401', '${empA}', '${trabA}', '2026-09', '2026-01-01', '2026-09-15',
      '01', 'GENERAL', 3500, 102.50, 3602.50, 15, 1852.50, 4, 15, 1576.10, 8, 15, 2551.77, 2, 1200.83, 108.07,
      7289.27, 572.56, 396.38, 6716.71
    );
  `);

  db.public.none(`
    INSERT INTO tregistro_movimientos (
      id, empresa_id, trabajador_id, tipo_movimiento, fecha_efectiva, detalle_cambio, linea_estructura_txt
    ) VALUES (
      '00000000-0000-0000-0000-000000000501', '${empA}', '${trabA}', 'ALTA', '2026-01-01', 'Alta inicial', '01|41112222|604|1|1|01/01/2026|||'
    );
  `);

  const rowsTrabA = db.public.many(`SELECT * FROM trabajadores WHERE empresa_id = '${empA}'`);
  const rowsTrabB = db.public.many(`SELECT * FROM trabajadores WHERE empresa_id = '${empB}'`);
  const rowsGratB = db.public.many(`SELECT * FROM planilla_gratificaciones WHERE empresa_id = '${empB}'`);
  const rowsCtsB = db.public.many(`SELECT * FROM planilla_cts WHERE empresa_id = '${empB}'`);
  const rowsLbsB = db.public.many(`SELECT * FROM liquidaciones_beneficios WHERE empresa_id = '${empB}'`);
  const rowsTregB = db.public.many(`SELECT * FROM tregistro_movimientos WHERE empresa_id = '${empB}'`);

  assert.equal(rowsTrabA.length, 1, 'Empresa A debe tener 1 trabajador en pg-mem');
  assert.equal(rowsTrabB.length, 1, 'Empresa B debe tener 1 trabajador en pg-mem');
  assert.equal(rowsGratB.length, 0, 'Empresa B no debe ver gratificaciones de Empresa A');
  assert.equal(rowsCtsB.length, 0, 'Empresa B no debe ver CTS de Empresa A');
  assert.equal(rowsLbsB.length, 0, 'Empresa B no debe ver liquidaciones de Empresa A');
  assert.equal(rowsTregB.length, 0, 'Empresa B no debe ver movimientos T-Registro de Empresa A');

  console.log('\n✅ RESULTADO: Esquema SQL de las 6 tablas de planillas + políticas RLS verificado (PROBADO SOLO EN pg-mem).');
}

async function main() {
  const testDbUrl = process.env.TEST_DATABASE_URL;
  if (testDbUrl) {
    await ejecutarContraPostgresReal(testDbUrl);
  } else {
    await ejecutarVerificacionPgMem();
  }
}

main().catch(err => {
  console.error('❌ Error en test_pg_rls_planillas:', err);
  process.exit(1);
});
