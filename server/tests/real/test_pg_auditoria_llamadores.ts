import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { parse } from 'dotenv';

const DUMMY_EMPRESA_TC_ID = '00000000-0000-0000-0000-000000000001';

function resolverTestDatabaseUrl(): string {
  const localEnv = existsSync('.env') ? parse(readFileSync('.env', 'utf8')) : {};
  const url =
    process.env.TEST_DATABASE_URL ??
    localEnv.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    localEnv.DATABASE_URL;

  assert.ok(url, 'Se requiere TEST_DATABASE_URL o DATABASE_URL apuntando a atlob_test.');

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('TEST_DATABASE_URL/DATABASE_URL no tiene un formato de URL válido.');
  }

  assert.ok(
    ['postgres:', 'postgresql:'].includes(parsed.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) &&
      parsed.username === 'contabilidad_app' &&
      parsed.pathname === '/atlob_test' &&
      [...parsed.searchParams.keys()].every((k) => k === 'sslmode'),
    `La URL de prueba debe apuntar exactamente a contabilidad_app@localhost|127.0.0.1/atlob_test (recibido: ${parsed.username}@${parsed.hostname}${parsed.pathname}).`
  );

  return url;
}

const testDbUrl = resolverTestDatabaseUrl();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';

async function esperarMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('====================================================================');
  console.log('🐘 PRUEBAS PG REALES B.1 + GUARD B.3 — AUDITORÍA EN LLAMADORES');
  console.log('====================================================================');

  const { env } = await import('../../config/env');
  env.NODE_ENV = 'test';

  const {
    initializeDatabase,
    closeDatabase,
    db,
    conContextoEmpresa,
  } = await import('../../config/database');
  const { runMigrations } = await import('../../db/migrate');
  const { auditoriaChainService } = await import('../../services/auditoriaChainService');
  const { daotService } = await import('../../services/daotService');
  const { cronogramaVencimientosService } = await import('../../services/cronogramaVencimientosService');
  const { parametroRepository } = await import('../../repositories/parametroRepository');
  const { tipoCambioService } = await import('../../services/tipoCambioService');

  await initializeDatabase();
  assert.equal(db.isPostgresConnected(), true, 'La base de datos PostgreSQL debe estar conectada.');

  const {
    rows: [identity],
  } = await db.query<{
    database_name: string;
    role_name: string;
    session_role: string;
    rolcanlogin: boolean;
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolbypassrls: boolean;
  }>(`
    SELECT current_database() AS database_name,
           current_user AS role_name,
           session_user AS session_role,
           rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
    FROM pg_roles
    WHERE rolname = current_user
  `);

  assert.equal(identity?.database_name, 'atlob_test', 'current_database() debe ser atlob_test');
  assert.equal(identity.role_name, 'contabilidad_app', 'current_user debe ser contabilidad_app');
  assert.equal(identity.session_role, 'contabilidad_app', 'session_user debe ser contabilidad_app');
  assert.ok(
    identity.rolcanlogin &&
      !(identity.rolsuper || identity.rolcreatedb || identity.rolcreaterole || identity.rolbypassrls),
    'contabilidad_app debe tener LOGIN y no tener rolsuper, rolcreatedb, rolcreaterole ni rolbypassrls'
  );

  await runMigrations();

  const tenantId = randomUUID();
  const empresaId = randomUUID();
  const usuarioId = randomUUID();
  const sufijo = tenantId.slice(0, 8).toUpperCase();
  const codigoParametro = `TEST_AUD_${sufijo}`;
  const rucSintetico = `2099${String(randomInt(1000000, 9999999))}`;
  const emailSintetico = `auditoria.llamadores.${sufijo.toLowerCase()}@atlob.test`;
  const passwordHashDummy = await bcrypt.hash(randomUUID(), 4);

  try {
    // 1. Semilla sintética en PostgreSQL real
    await db.query(
      `INSERT INTO tenants (id, nombre, subdominio, estado)
       VALUES ($1, $2, $3, 'ACTIVO')`,
      [tenantId, `Tenant Auditoría B1 ${sufijo}`, `aud-b1-${sufijo.toLowerCase()}`]
    );

    await db.query(
      `INSERT INTO usuarios_estudio (id, email, password_hash, nombre, rol_global, is_active)
       VALUES ($1, $2, $3, 'Admin Prueba Auditoría', 'ADMINISTRADOR', true)`,
      [usuarioId, emailSintetico, passwordHashDummy]
    );

    await db.query(
      `INSERT INTO empresas (id, tenant_id, codigo_empresa, ruc, razon_social, regimen_tributario, domicilio_fiscal, moneda_principal, is_active)
       VALUES ($1, $2, $3, $4, 'EMPRESA PRUEBA AUDITORIA B1 SAC', 'REGIMEN_GENERAL', 'Av. Prueba 2099, Lima', 'PEN', true)`,
      [empresaId, tenantId, `EMP-AUD-${sufijo}`, rucSintetico]
    );

    await db.withTenantAndEmpresa(usuarioId, empresaId, async (client) => {
      await client.query(
        `INSERT INTO usuario_empresa (id, usuario_id, empresa_id, rol_en_empresa, estado)
         VALUES ($1, $2, $3, 'ADMINISTRADOR', 'ACTIVO')`,
        [randomUUID(), usuarioId, empresaId]
      );
    });

    // ------------------------------------------------------------------
    // Caso 1: daotService.registrarExclusion
    // ------------------------------------------------------------------
    const exclusion = conContextoEmpresa(empresaId, usuarioId, () =>
      daotService.registrarExclusion(
        empresaId,
        {
          anio: 2026,
          tipoOperacion: 'COMPRA',
          rucTercero: '20991112223',
          razonSocialTercero: 'PROVEEDOR TEST DAOT',
          motivoExclusion: 'Exclusión de prueba PG real auditoría',
        },
        usuarioId
      )
    );

    let daotRow: Record<string, any> | undefined;
    let audDaotRow: Record<string, any> | undefined;
    const inicioPolling = Date.now();
    while (Date.now() - inicioPolling < 4000) {
      const resultado = await db.withEmpresaTransaction(empresaId, async (client) => {
        const resDaot = await client.query(
          `SELECT id, empresa_id, anio, tipo_operacion, ruc_tercero, motivo_exclusion
           FROM daot_exclusiones
           WHERE empresa_id = $1 AND id = $2`,
          [empresaId, exclusion.id]
        );
        const resAud = await client.query(
          `SELECT id, tabla_afectada, registro_id, accion
           FROM auditoria_log
           WHERE empresa_id = $1 AND tabla_afectada = 'daot_exclusiones' AND registro_id = $2`,
          [empresaId, exclusion.id]
        );
        return { daot: resDaot.rows[0], aud: resAud.rows[0] };
      });
      daotRow = resultado.daot;
      audDaotRow = resultado.aud;
      if (daotRow && audDaotRow) break;
      await esperarMs(50);
    }

    assert.ok(daotRow, 'Caso 1: debe existir fila real en daot_exclusiones.');
    assert.equal(daotRow.anio, 2026);
    assert.equal(daotRow.tipo_operacion, 'COMPRA');
    assert.equal(daotRow.ruc_tercero, '20991112223');
    assert.ok(audDaotRow, 'Caso 1: debe existir fila real en auditoria_log para daot_exclusiones.');
    assert.equal(audDaotRow.accion, 'EXCLUIR_TERCERO_DAOT');

    const integridadCaso1 = await conContextoEmpresa(empresaId, usuarioId, () =>
      auditoriaChainService.verificarIntegridad(empresaId)
    );
    assert.equal(integridadCaso1.valido, true, `Caso 1: cadena íntegra (${integridadCaso1.mensaje})`);
    assert.ok(integridadCaso1.totalRegistros >= 1);
    console.log('  ✅ Caso 1 PASÓ: daotService.registrarExclusion persistió y selló auditoría');

    // ------------------------------------------------------------------
    // Caso 2: cronogramaVencimientosService.actualizarFilaCronograma
    // ------------------------------------------------------------------
    const filaCronograma = await conContextoEmpresa(empresaId, usuarioId, () =>
      cronogramaVencimientosService.actualizarFilaCronograma(
        {
          periodo: '2099-01',
          ultimoDigitoRuc: '9',
          fechaVencimientoPdt621: '2099-02-20',
          fechaVencimientoPlame: '2099-02-20',
          fechaVencimientoSire: '2099-02-14',
          fuenteResolucion: 'TEST PG REAL',
        },
        usuarioId,
        'ADMIN_ESTUDIO',
        empresaId
      )
    );

    const resCronPg = await db.query<{
      periodo: string;
      ultimo_digito_ruc: string;
      pdt621: string;
      sire: string;
      plame: string;
    }>(
      `SELECT periodo,
              ultimo_digito_ruc,
              to_char(fecha_vencimiento_pdt621, 'YYYY-MM-DD') AS pdt621,
              to_char(fecha_vencimiento_sire, 'YYYY-MM-DD') AS sire,
              to_char(fecha_vencimiento_plame, 'YYYY-MM-DD') AS plame
       FROM cronograma_vencimientos
       WHERE periodo = '2099-01' AND ultimo_digito_ruc = '9'`
    );
    assert.equal(resCronPg.rows.length, 1, 'Caso 2: debe existir fila en cronograma_vencimientos.');
    assert.equal(resCronPg.rows[0].pdt621, '2099-02-20');
    assert.equal(resCronPg.rows[0].sire, '2099-02-14');
    assert.equal(resCronPg.rows[0].plame, '2099-02-20');

    const resAudCron = await db.withEmpresaTransaction(empresaId, async (client) =>
      client.query(
        `SELECT id, tabla_afectada, registro_id, accion
         FROM auditoria_log
         WHERE empresa_id = $1 AND tabla_afectada = 'cronograma_vencimientos' AND registro_id = $2`,
        [empresaId, filaCronograma.id]
      )
    );
    assert.equal(resAudCron.rows.length, 1, 'Caso 2: debe existir entrada en auditoria_log para cronograma_vencimientos.');
    assert.equal(resAudCron.rows[0].accion, 'ACTUALIZAR_CRONOGRAMA_VENCIMIENTOS');

    const integridadCaso2 = await conContextoEmpresa(empresaId, usuarioId, () =>
      auditoriaChainService.verificarIntegridad(empresaId)
    );
    assert.equal(integridadCaso2.valido, true, `Caso 2: cadena íntegra (${integridadCaso2.mensaje})`);
    console.log('  ✅ Caso 2 PASÓ: cronogramaVencimientosService.actualizarFilaCronograma persistió y selló auditoría');

    // ------------------------------------------------------------------
    // Caso 3: parametroRepository.guardarOActualizarParametro
    // ------------------------------------------------------------------
    await conContextoEmpresa(empresaId, usuarioId, () =>
      parametroRepository.guardarOActualizarParametro(
        {
          codigoParametro,
          descripcion: 'Parámetro prueba PG real',
          valorNumerico: 5500,
          vigenteDesde: '2099-01-01',
          categoria: 'RENTA',
          motivo: 'Prueba PG real auditoría',
        },
        usuarioId,
        'ADMIN_ESTUDIO',
        empresaId
      )
    );

    const resParamPg = await db.query<{
      codigo_parametro: string;
      valor_numerico: string;
      categoria: string;
    }>(
      `SELECT codigo_parametro, valor_numerico::numeric, categoria
       FROM parametros_tributarios
       WHERE codigo_parametro = $1 AND vigente_desde = '2099-01-01'`,
      [codigoParametro]
    );
    assert.equal(resParamPg.rows.length, 1, 'Caso 3: debe existir fila en parametros_tributarios.');
    assert.equal(Number(resParamPg.rows[0].valor_numerico), 5500);
    assert.equal(resParamPg.rows[0].categoria, 'RENTA');

    const resAudParam = await db.withEmpresaTransaction(empresaId, async (client) =>
      client.query(
        `SELECT id, tabla_afectada, registro_id, accion
         FROM auditoria_log
         WHERE empresa_id = $1 AND tabla_afectada = 'parametros_tributarios' AND registro_id = $2`,
        [empresaId, codigoParametro]
      )
    );
    assert.equal(resAudParam.rows.length, 1, 'Caso 3: debe existir entrada en auditoria_log para parametros_tributarios.');

    const integridadCaso3 = await conContextoEmpresa(empresaId, usuarioId, () =>
      auditoriaChainService.verificarIntegridad(empresaId)
    );
    assert.equal(integridadCaso3.valido, true, `Caso 3: cadena íntegra (${integridadCaso3.mensaje})`);
    console.log('  ✅ Caso 3 PASÓ: parametroRepository.guardarOActualizarParametro persistió y selló auditoría');

    // ------------------------------------------------------------------
    // Caso 4: tipoCambioService.guardar (FUERA de conContextoEmpresa)
    // ------------------------------------------------------------------
    await tipoCambioService.guardar({
      fecha: '2099-12-31',
      compra: 3.75,
      venta: 3.76,
      fuente: 'MANUAL',
      usuarioId,
    });

    const resTcPg = await db.query<{
      fecha: string;
      compra: string;
      venta: string;
      fuente: string;
    }>(
      `SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, compra::numeric, venta::numeric, fuente
       FROM tipos_cambio
       WHERE fecha = '2099-12-31'`
    );
    assert.equal(resTcPg.rows.length, 1, 'Caso 4a: debe persistir la fila en tipos_cambio para 2099-12-31.');
    assert.equal(Number(resTcPg.rows[0].compra), 3.75);
    assert.equal(Number(resTcPg.rows[0].venta), 3.76);
    assert.equal(resTcPg.rows[0].fuente, 'MANUAL');

    const audTcEmpresa = await db.withEmpresaTransaction(empresaId, async (client) =>
      client.query(
        `SELECT id FROM auditoria_log WHERE tabla_afectada = 'tipos_cambio'`
      )
    );
    assert.equal(audTcEmpresa.rows.length, 0, 'Caso 4b: no debe existir fila en auditoria_log (empresaId) para tipos_cambio.');

    const audTcDummy = await db.withEmpresaTransaction(DUMMY_EMPRESA_TC_ID, async (client) =>
      client.query(
        `SELECT id FROM auditoria_log WHERE tabla_afectada = 'tipos_cambio'`
      )
    );
    assert.equal(audTcDummy.rows.length, 0, 'Caso 4b: no debe existir fila en auditoria_log (dummy UUID) para tipos_cambio.');

    const integridadDummy = await conContextoEmpresa(DUMMY_EMPRESA_TC_ID, usuarioId, () =>
      auditoriaChainService.verificarIntegridad(DUMMY_EMPRESA_TC_ID)
    );
    assert.equal(integridadDummy.totalRegistros, 0, 'Caso 4b: verificarIntegridad sobre dummy UUID debe devolver totalRegistros === 0.');

    const integridadCaso4 = await conContextoEmpresa(empresaId, usuarioId, () =>
      auditoriaChainService.verificarIntegridad(empresaId)
    );
    assert.equal(integridadCaso4.valido, true, `Caso 4c: cadena de empresaId sigue íntegra (${integridadCaso4.mensaje})`);
    console.log('  ✅ Caso 4 PASÓ: tipoCambioService.guardar persistió TC y evidenció fallo FK de empresa dummy en auditoría');

    // ------------------------------------------------------------------
    // Caso 5: Guard B.3 AUDITORIA_SIN_CLIENT_EN_TRANSACCION
    // ------------------------------------------------------------------
    await conContextoEmpresa(empresaId, usuarioId, () =>
      db.withEmpresaTransaction(empresaId, async (client) => {
        await assert.rejects(
          () =>
            auditoriaChainService.registrar({
              empresaId,
              usuarioId,
              tablaAfectada: 'asientos',
              registroId: 'test-guard-1',
              accion: 'TEST_GUARD',
            }),
          /AUDITORIA_SIN_CLIENT_EN_TRANSACCION/
        );

        const registrada = await auditoriaChainService.registrar(
          {
            empresaId,
            usuarioId,
            tablaAfectada: 'asientos',
            registroId: 'test-guard-2',
            accion: 'TEST_GUARD_CON_CLIENT',
            datosNuevos: { estado: 'OK', version: 1 },
          },
          client
        );
        assert.ok(registrada.id, 'Caso 5b: registrar con client transaccional debe devolver entrada con id.');
        assert.ok(registrada.hashActual, 'Caso 5b: registrar con client transaccional debe calcular hashActual.');
      })
    );

    const resGuardPg = await db.withEmpresaTransaction(empresaId, async (client) =>
      client.query<{ registro_id: string; accion: string }>(
        `SELECT registro_id, accion
         FROM auditoria_log
         WHERE empresa_id = $1 AND registro_id IN ('test-guard-1', 'test-guard-2')`,
        [empresaId]
      )
    );
    assert.equal(resGuardPg.rows.length, 1, 'Caso 5: solo test-guard-2 debe persistirse en auditoria_log.');
    assert.equal(resGuardPg.rows[0].registro_id, 'test-guard-2');
    assert.equal(resGuardPg.rows[0].accion, 'TEST_GUARD_CON_CLIENT');

    const integridadFinal = await conContextoEmpresa(empresaId, usuarioId, () =>
      auditoriaChainService.verificarIntegridad(empresaId)
    );
    assert.equal(integridadFinal.valido, true, `Caso 5c: cadena completa debe ser válida (${integridadFinal.mensaje})`);
    assert.ok(
      integridadFinal.totalRegistros >= 4,
      `Caso 5c: totalRegistros debe ser >= 4 (recibido: ${integridadFinal.totalRegistros})`
    );
    console.log(`  ✅ Caso 5 PASÓ: Guard B.3 activo y cadena final íntegra (${integridadFinal.totalRegistros} registros)`);
  } finally {
    // Limpiar únicamente filas sintéticas mutables (nunca auditoria_log ni entidades referenciadas por FK)
    try {
      await db.withEmpresaTransaction(empresaId, async (client) => {
        await client.query(`DELETE FROM daot_exclusiones WHERE empresa_id = $1`, [empresaId]);
      });
    } catch {
      // Ignorar si no llegó a conectarse o no existían filas
    }
    try {
      await db.query(
        `DELETE FROM cronograma_vencimientos WHERE periodo = '2099-01' AND ultimo_digito_ruc = '9'`
      );
      await db.query(
        `DELETE FROM parametros_tributarios WHERE codigo_parametro = $1 AND vigente_desde = '2099-01-01'`,
        [codigoParametro]
      );
      await db.query(`DELETE FROM tipos_cambio WHERE fecha = '2099-12-31'`);
    } catch {
      // Ignorar en caso de fallo previo de conexión
    }
    await closeDatabase();
  }

  console.log('====================================================================');
  console.log('🎉 TODAS LAS PRUEBAS B.1 Y GUARD B.3 PASARON EN POSTGRESQL REAL');
  console.log('====================================================================');
}

main().catch((err) => {
  console.error('\n❌ FALLO EN PRUEBAS PG DE AUDITORÍA Y GUARD B.3:', err);
  process.exitCode = 1;
});
