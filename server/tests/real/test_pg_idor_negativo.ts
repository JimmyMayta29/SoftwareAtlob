process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import express from 'express';
import bcrypt from 'bcryptjs';
import { parse } from 'dotenv';
import { Pool } from 'pg';

async function testIdorNegativo() {
  console.log('====================================================================');
  console.log('🛡️ PRUEBA NEGATIVA DE VULNERABILIDADES IDOR Y AUTORIZACIÓN (FASE A)');
  console.log('====================================================================\n');

  const connectionString = process.env.TEST_DATABASE_URL || parse(readFileSync('.env')).TEST_DATABASE_URL;
  assert(connectionString, 'TEST_DATABASE_URL requerida');
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = '';

  const { setPostgresPool } = await import('../../config/database');
  const { authJwtService } = await import('../../services/authJwtService');
  const { apiRoutes } = await import('../../routes');
  const pool = new Pool({ connectionString });
  setPostgresPool(pool);
  const client = await pool.connect();

  const app = express();
  app.use(express.json());
  app.use('/api', apiRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;

  const request = (path: string, token?: string, method = 'GET', body?: unknown) => fetch(`http://127.0.0.1:${port}/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json'
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const tenantId = randomUUID();
  const empA = randomUUID();
  const empB = randomUUID();
  const usrContadorA = randomUUID();
  const usrAsistenteA = randomUUID();
  const usrContadorB = randomUUID();
  const pleBId = randomUUID();

  try {
    // Temporariamente desactivar RLS para sembrar fixtures fiablemente
    await client.query('ALTER TABLE usuario_empresa NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY');
    await client.query('ALTER TABLE ple_exportaciones NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY');

    await client.query("INSERT INTO tenants (id, nombre) VALUES ($1, 'Tenant IDOR Test')", [tenantId]);
    await client.query(`
      INSERT INTO empresas (id, tenant_id, codigo_empresa, ruc, razon_social, regimen_tributario, domicilio_fiscal)
      VALUES
        ($1, $3, 'EMPA_IDOR', '20700000001', 'EMPRESA A IDOR SAC', 'REGIMEN_GENERAL', 'AV A 100'),
        ($2, $3, 'EMPB_IDOR', '20700000002', 'EMPRESA B IDOR SAC', 'REGIMEN_GENERAL', 'AV B 200')
    `, [empA, empB, tenantId]);

    const passwordHash = await bcrypt.hash('Password_Idor_2026!', 10);
    await client.query(`
      INSERT INTO usuarios_estudio (id, email, password_hash, nombre, rol_global, is_active)
      VALUES
        ($1, 'contador_a@idor.invalid', $4, 'Contador A', 'CONTADOR_SENIOR', TRUE),
        ($2, 'asistente_a@idor.invalid', $4, 'Asistente A', 'ASISTENTE_CONTABLE', TRUE),
        ($3, 'contador_b@idor.invalid', $4, 'Contador B', 'CONTADOR_SENIOR', TRUE)
    `, [usrContadorA, usrAsistenteA, usrContadorB, passwordHash]);

    await client.query(`
      INSERT INTO usuario_empresa (usuario_id, empresa_id, rol_en_empresa, estado)
      VALUES
        ($1, $3, 'CONTADOR_SENIOR', 'ACTIVO'),
        ($2, $3, 'ASISTENTE_CONTABLE', 'ACTIVO'),
        ($4, $5, 'CONTADOR_SENIOR', 'ACTIVO')
    `, [usrContadorA, usrAsistenteA, empA, usrContadorB, empB]);

    await client.query(`
      INSERT INTO ple_exportaciones (id, empresa_id, codigo_libro, periodo, nombre_archivo, contenido_txt, hash_sha256, total_filas)
      VALUES ($1, $2, '050100', '2026-09', 'LE2070000000220260900050100001111.txt', 'CONTENIDO PRIVADO B', 'hash123', 1)
    `, [pleBId, empB]);

    // Reactivar RLS estrictamente
    await client.query('ALTER TABLE usuario_empresa ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY');
    await client.query('ALTER TABLE ple_exportaciones ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY');

    // Iniciar sesión con Usuario de Empresa A
    const sesionA = await authJwtService.login('contador_a@idor.invalid', 'Password_Idor_2026!');
    const tokenA = sesionA.accessToken;
    assert.equal(sesionA.empresaActivaId, empA, 'Sesión A debe pertenecer a Empresa A');

    console.log('1. Probando rechazo de endpoints protegidos sin autenticación (401)...');
    assert.equal((await request(`/empresas/${empA}/analisis-cuentas/movimientos`)).status, 401);
    assert.equal((await request(`/empresas/${empA}/metodo-inventario`, undefined, 'PUT', {})).status, 401);
    assert.equal((await request('/tributos/cronograma', undefined, 'PUT', {})).status, 401);
    assert.equal((await request(`/ple/exportaciones/${pleBId}/descargar`)).status, 401);
    console.log('   ✔ 401 verificado en todos los endpoints sin token.');

    console.log('2. Probando IDOR: Usuario de Empresa A intentando consultar análisis de cuentas de Empresa B (403)...');
    // A) Ataque por URL directa a Empresa B
    const resMovB = await request(`/empresas/${empB}/analisis-cuentas/movimientos`, tokenA);
    assert.equal(resMovB.status, 403, 'Acceso directo a empresa ajena debe ser 403');

    // B) Ataque por inyección de parámetro empresaId ajeno en query
    const resMovParam = await request(`/empresas/${empA}/analisis-cuentas/movimientos?empresaId=${empB}`, tokenA);
    assert.equal(resMovParam.status, 403, 'Inyección de empresaId en query debe ser 403');
    const errMovParam = await resMovParam.json();
    assert.equal(errMovParam.error, 'ACCESO_DENEGADO_EMPRESA');

    const resAnt = await request(`/empresas/${empB}/analisis-cuentas/antiguedad`, tokenA);
    assert.equal(resAnt.status, 403);

    const resCtas = await request(`/empresas/${empB}/analisis-cuentas/cuentas-control`, tokenA);
    assert.equal(resCtas.status, 403);

    const resAlertas = await request(`/empresas/${empB}/analisis-cuentas/alertas`, tokenA);
    assert.equal(resAlertas.status, 403);

    const resComp = await request(`/empresas/${empB}/analisis-cuentas/comparativo-anual`, tokenA);
    assert.equal(resComp.status, 403);

    const resMarca = await request(`/empresas/${empB}/analisis-cuentas/marcas`, tokenA, 'POST', {
      asientoId: randomUUID(), tipoMarca: 'CONCILIADO', nota: 'Ataque IDOR'
    });
    assert.equal(resMarca.status, 403);

    // Inyección de empresaId ajeno en body de POST marcas
    const resMarcaBody = await request(`/empresas/${empA}/analisis-cuentas/marcas`, tokenA, 'POST', {
      empresaId: empB, asientoId: randomUUID(), tipoMarca: 'CONCILIADO', nota: 'Ataque IDOR'
    });
    assert.equal(resMarcaBody.status, 403);
    const errMarcaBody = await resMarcaBody.json();
    assert.equal(errMarcaBody.error, 'ACCESO_DENEGADO_EMPRESA');
    console.log('   ✔ 403 y ACCESO_DENEGADO_EMPRESA verificados en endpoints de análisis de cuentas contra URL e inyección de parámetros.');

    console.log('3. Probando IDOR: Descarga de archivo PLE de Empresa B por usuario de Empresa A (403/404)...');
    const resPle = await request(`/ple/exportaciones/${pleBId}/descargar`, tokenA);
    assert([403, 404].includes(resPle.status), 'Usuario de Empresa A no debe descargar exportación PLE de Empresa B');
    assert.notEqual(resPle.status, 200, 'Descarga IDOR no debe retornar 200');
    console.log('   ✔ IDOR bloqueado en descarga PLE.');

    console.log('4. Probando autorización RBAC en método de inventario (requiere ADMINISTRADOR)...');
    const resInvNoAdmin = await request(`/empresas/${empA}/metodo-inventario`, tokenA, 'PUT', { metodoInventario: 'PERMANENTE' });
    assert.equal(resInvNoAdmin.status, 403, 'CONTADOR_SENIOR no debe poder cambiar método de inventario (requiere ADMINISTRADOR)');
    console.log('   ✔ 403 verificado para usuario no-administrador en método de inventario.');

    console.log('5. Probando autorización en cronograma de vencimientos (requiere ADMINISTRADOR)...');
    const resCronNoAdmin = await request('/tributos/cronograma', tokenA, 'PUT', {
      periodo: '2026-09', ultimoDigitoRuc: '0', fechaVencimientoPdt621: '2026-10-20'
    });
    assert.equal(resCronNoAdmin.status, 403, 'Solo ADMINISTRADOR puede actualizar cronograma de vencimientos');
    console.log('   ✔ 403 verificado para usuario no-administrador en cronograma de vencimientos.');

    console.log('\n====================================================================');
    console.log('✅ TODAS LAS PRUEBAS NEGATIVAS IDOR Y DE AUTORIZACIÓN PASARON (EXIT 0)');
    console.log('====================================================================\n');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    try {
      await client.query('ALTER TABLE usuario_empresa NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY');
      await client.query('ALTER TABLE ple_exportaciones NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY');
      await client.query("DELETE FROM ple_exportaciones WHERE id = $1", [pleBId]);
      await client.query("DELETE FROM usuario_empresa WHERE usuario_id IN ($1, $2, $3)", [usrContadorA, usrAsistenteA, usrContadorB]);
      await client.query("DELETE FROM empresas WHERE id IN ($1, $2)", [empA, empB]);
      await client.query("DELETE FROM usuarios_estudio WHERE id IN ($1, $2, $3)", [usrContadorA, usrAsistenteA, usrContadorB]);
      await client.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
      await client.query('ALTER TABLE usuario_empresa ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY');
      await client.query('ALTER TABLE ple_exportaciones ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY');
    } catch (e) {
      console.error('Error limpiando fixtures IDOR:', e);
    }
    client.release();
    await pool.end();
  }
}

testIdorNegativo().catch((err) => {
  console.error('ERROR EN PRUEBA IDOR NEGATIVA:', err);
  process.exitCode = 1;
});
