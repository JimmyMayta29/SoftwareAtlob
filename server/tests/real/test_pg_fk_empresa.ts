import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { REGISTRO_DATOS_EMPRESA } from '../../storage/registroDatosEmpresa';
import { verificarRegistroDatosEmpresa } from '../run_tests_registro_empresa';

interface ClaveCatalogo {
  nombre: string;
  hija: string;
  padre: string;
  columnas: string[];
  columnasPadre: string[];
  columnasNulas: string[];
  borrado: string;
  actualizacion: string;
  coincidencia: string;
  diferible: boolean;
  diferida: boolean;
  validada: boolean;
  aplicada: boolean;
}

async function catalogoClavesEmpresa(client: PoolClient) {
  const { rows } = await client.query<ClaveCatalogo>(`
    SELECT c.conname AS nombre, h.relname AS hija, p.relname AS padre,
           ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY AS k(num, orden)
             JOIN pg_attribute a ON a.attrelid = h.oid AND a.attnum = k.num ORDER BY k.orden) AS columnas,
           ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY AS k(num, orden)
             JOIN pg_attribute a ON a.attrelid = p.oid AND a.attnum = k.num ORDER BY k.orden) AS "columnasPadre",
           ARRAY(SELECT a.attname::text FROM unnest(c.confdelsetcols) WITH ORDINALITY AS k(num, orden)
             JOIN pg_attribute a ON a.attrelid = h.oid AND a.attnum = k.num ORDER BY k.orden) AS "columnasNulas",
           c.confdeltype AS borrado, c.confupdtype AS actualizacion, c.confmatchtype AS coincidencia,
           c.condeferrable AS diferible, c.condeferred AS diferida, c.convalidated AS validada, c.conenforced AS aplicada
      FROM pg_constraint c JOIN pg_class h ON h.oid = c.conrelid JOIN pg_class p ON p.oid = c.confrelid
     WHERE c.contype = 'f' AND h.relnamespace = 'public'::regnamespace AND p.relnamespace = 'public'::regnamespace
     ORDER BY c.conname
  `);
  const empresas = new Set(REGISTRO_DATOS_EMPRESA.filter(t => t.columnaEmpresa || t.empresaDesde).map(t => t.tabla));
  return rows.filter(fk => empresas.has(fk.hija) && empresas.has(fk.padre) && fk.padre !== 'empresas');
}

function contexto(client: PoolClient, empresa: string) {
  return client.query("SELECT set_config('app.empresa_id', $1, true), set_config('app.current_empresa_id', $1, true)", [empresa]);
}

async function rechazar(client: PoolClient, nombre: string, sql: string, valores: string[]) {
  await client.query('SAVEPOINT probar_referencia');
  try {
    await assert.rejects(
      () => client.query(sql, valores),
      (err: any) => (err.code === '23503' || err.code === '23001') && err.constraint === nombre
    );
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT probar_referencia');
    await client.query('RELEASE SAVEPOINT probar_referencia');
  }
  console.log(`   ✔ ${nombre} aplicó la restricción.`);
}

export async function prepararPruebaClavesEmpresa(client: PoolClient) {
  const { rows: [sesion] } = await client.query(`
    SELECT current_database() AS bd, current_user AS rol, session_user AS usuario,
           rolsuper OR rolbypassrls AS evita_rls
    FROM pg_roles WHERE rolname = current_user
  `);
  assert(sesion?.bd === 'atlob_test' && sesion.rol === 'contabilidad_app' &&
    sesion.usuario === 'contabilidad_app' && !sesion.evita_rls, 'La prueba FK requiere contabilidad_app en atlob_test.');
  const antes = await catalogoClavesEmpresa(client);
  assert.equal(antes.length, 75);
  assert(antes.every(fk => fk.columnas.length === 1 && fk.columnasPadre.length === 1 && fk.validada && fk.aplicada),
    'La prueba requiere las 75 relaciones originales activas.');

  const tenant = randomUUID();
  await client.query("INSERT INTO tenants (id, nombre) VALUES ($1, 'Prueba de integridad FK')", [tenant]);
  async function insertarMaestros(ruc: string) {
    const empresa = randomUUID();
    const ejercicio = randomUUID();
    const periodo = randomUUID();
    const subdiario = randomUUID();
    const cuenta = randomUUID();
    const anexo = randomUUID();
    const banco = randomUUID();
    const trabajador = randomUUID();
    const planilla = randomUUID();
    const regla = randomUUID();
    const propuesta = randomUUID();
    await client.query(`INSERT INTO empresas
      (id, tenant_id, codigo_empresa, ruc, razon_social, regimen_tributario, domicilio_fiscal)
      VALUES ($1, $2, 'PRUEBA-FK', $3, 'Empresa de prueba FK', 'REGIMEN_GENERAL', 'Domicilio de prueba')`,
      [empresa, tenant, ruc]);
    await contexto(client, empresa);
    await client.query('INSERT INTO ejercicios (id, empresa_id, anio) VALUES ($1, $2, 2026)', [ejercicio, empresa]);
    await client.query(`INSERT INTO periodos (id, empresa_id, ejercicio_id, anio, mes, codigo_periodo)
      VALUES ($1, $2, $3, 2026, 11, '2026-11')`, [periodo, empresa, ejercicio]);
    await client.query(`INSERT INTO subdiarios (id, empresa_id, codigo, descripcion, tipo)
      VALUES ($1, $2, '01', 'Subdiario de prueba', 'APERTURA')`, [subdiario, empresa]);
    await client.query(`INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, nivel, tipo_cuenta)
      VALUES ($1, $2, '1011', 'Cuenta de prueba', 4, 'ACTIVO')`, [cuenta, empresa]);
    await client.query(`INSERT INTO anexos (id, empresa_id, tipo_documento, numero_documento, razon_social, tipo_entidad)
      VALUES ($1, $2, '6', $3, 'Anexo de prueba', 'AMBOS')`, [anexo, empresa, ruc]);
    await client.query(`INSERT INTO cuentas_financieras (id, empresa_id, tipo, banco, numero)
      VALUES ($1, $2, 'CAJA', 'CAJA_CENTRAL', '01')`, [banco, empresa]);
    await client.query(`INSERT INTO trabajadores (id, empresa_id, numero_documento, nombres, apellidos, fecha_ingreso, cargo, sueldo_base, sistema_pensiones)
      VALUES ($1, $2, '00000001', 'Trabajador', 'Prueba', DATE '2026-11-01', 'Prueba', 1000, 'ONP')`, [trabajador, empresa]);
    await client.query(`INSERT INTO planillas (id, empresa_id, periodo_id, mes, fecha_calculo)
      VALUES ($1, $2, $3, '2026-11', DATE '2026-11-15')`, [planilla, empresa, periodo]);
    await client.query(`INSERT INTO reglas_contabilizacion (id, empresa_id, tipo_operacion, nombre)
      VALUES ($1, $2, 'VENTA', 'Regla de prueba')`, [regla, empresa]);
    await client.query(`INSERT INTO sire_propuestas (id, empresa_id, tipo, periodo, hash_archivo)
      VALUES ($1, $2, 'COMPRAS', '2026-11', 'hash-de-prueba')`, [propuesta, empresa]);
    return { empresa, periodo, subdiario, cuenta, anexo, banco, trabajador, planilla, regla, propuesta };
  }

  const a = await insertarMaestros('20000000001');
  const b = await insertarMaestros('20000000002');
  await contexto(client, a.empresa);
  const { rows: [linea] } = await client.query(`INSERT INTO planilla_lineas
    (planilla_id, trabajador_id, sueldo_basico, total_remuneracion, total_descuentos, neto_pagar)
    VALUES ($1, $2, 1000, 1000, 0, 1000) RETURNING id`, [a.planilla, a.trabajador]);
  const { rows: [detalle] } = await client.query(`INSERT INTO reglas_contabilizacion_detalle
    (regla_id, orden, codigo_cuenta, lado, base_calculo)
    VALUES ($1, 1, '1011', 'DEBE', 'TOTAL') RETURNING id`, [a.regla]);
  await contexto(client, '');
  return { antes, a, b, linea: linea.id as string, detalle: detalle.id as string };
}

export async function probarClavesEmpresa(
  client: PoolClient,
  muestra: Awaited<ReturnType<typeof prepararPruebaClavesEmpresa>>
) {
  const { antes, a, b, linea, detalle } = muestra;
  const despues = await catalogoClavesEmpresa(client);
  assert.deepEqual(despues, antes.map(fk => ({
    ...fk,
    columnas: ['empresa_id', ...fk.columnas],
    columnasPadre: ['empresa_id', ...fk.columnasPadre],
    columnasNulas: fk.borrado === 'n' ? fk.columnas : [],
  })));
  await verificarRegistroDatosEmpresa(client);
  console.log('   ✔ Las 75 FK compuestas están validadas y preservan sus acciones. Registro declarativo verificado.');

  await contexto(client, b.empresa);
  const { rows: [asientoB] } = await client.query(`INSERT INTO asientos (empresa_id, periodo_id, subdiario_id, fecha, glosa)
    VALUES ($1, $2, $3, DATE '2026-11-15', 'Asiento de prueba') RETURNING id`, [b.empresa, b.periodo, b.subdiario]);
  const compra = `INSERT INTO comprobantes_compra
    (empresa_id, periodo_id, proveedor_id, fecha_emision, fecha_contable, tipo_comprobante, serie, numero, total)
    VALUES ($1, $2, $3, DATE '2026-11-15', DATE '2026-11-15', '01', 'F001', '1', 1) RETURNING id`;
  const { rows: [compraB] } = await client.query(compra, [b.empresa, b.periodo, b.anexo]);
  await contexto(client, a.empresa);
  await rechazar(client, 'asientos_periodo_id_fkey', `INSERT INTO asientos (empresa_id, periodo_id, subdiario_id, fecha, glosa)
    VALUES ($1, $2, $3, DATE '2026-11-15', 'Asiento de prueba')`, [a.empresa, b.periodo, a.subdiario]);
  await rechazar(client, 'asiento_detalle_asiento_id_fkey', `INSERT INTO asiento_detalle
    (empresa_id, asiento_id, cuenta_id, linea, debe) VALUES ($1, $2, $3, 1, 1)`, [a.empresa, asientoB.id, a.cuenta]);
  await rechazar(client, 'correlativos_subdiario_id_fkey', `INSERT INTO correlativos
    (empresa_id, periodo_id, subdiario_id) VALUES ($1, $2, $3)`, [a.empresa, a.periodo, b.subdiario]);
  await rechazar(client, 'comprobantes_compra_proveedor_id_fkey', compra, [a.empresa, a.periodo, b.anexo]);
  const { rows: [compraA] } = await client.query(compra, [a.empresa, a.periodo, a.anexo]);
  const cuentaPorPagar = `INSERT INTO cuentas_por_pagar
    (empresa_id, comprobante_id, proveedor_id, importe_original, saldo, fecha_emision, fecha_vencimiento)
    VALUES ($1, $2, $3, 1, 1, DATE '2026-11-15', DATE '2026-11-16') RETURNING id`;
  await rechazar(client, 'cuentas_por_pagar_comprobante_id_fkey', cuentaPorPagar, [a.empresa, compraB.id, a.anexo]);
  await client.query(cuentaPorPagar, [a.empresa, compraA.id, a.anexo]);
  const caja = `INSERT INTO cajas_chicas (empresa_id, cuenta_financiera_id, nombre, monto_fondo, saldo_actual)
    VALUES ($1, $2, 'Caja de prueba', 1, 1)`;
  await rechazar(client, 'cajas_chicas_cuenta_financiera_id_fkey', caja, [a.empresa, b.banco]);
  await client.query(caja, [a.empresa, a.banco]);

  const lineaPlanilla = `INSERT INTO planilla_lineas
    (planilla_id, trabajador_id, sueldo_basico, total_remuneracion, total_descuentos, neto_pagar)
    VALUES ($1, $2, 1000, 1000, 0, 1000) RETURNING empresa_id`;
  await rechazar(client, 'planilla_lineas_trabajador_id_fkey', lineaPlanilla, [a.planilla, b.trabajador]);
  assert.equal((await client.query(lineaPlanilla, [a.planilla, a.trabajador])).rows[0].empresa_id, a.empresa);
  assert.equal((await client.query('SELECT empresa_id FROM planilla_lineas WHERE id = $1', [linea])).rows[0].empresa_id, a.empresa);
  assert.equal((await client.query('SELECT empresa_id FROM reglas_contabilizacion_detalle WHERE id = $1', [detalle])).rows[0].empresa_id, a.empresa);
  await rechazar(client, 'reglas_contabilizacion_detalle_regla_id_fkey',
    'UPDATE reglas_contabilizacion_detalle SET empresa_id = $1 WHERE id = $2', [b.empresa, detalle]);

  const honorarios = `INSERT INTO recibos_honorarios
    (empresa_id, periodo_id, proveedor_id, serie, numero, fecha_emision, importe_bruto, neto_pagar, glosa)
    VALUES ($1, $2, $3, 'E001', '1', DATE '2026-11-15', 1, 1, 'Recibo de prueba')`;
  await rechazar(client, 'recibos_honorarios_proveedor_id_fkey', honorarios, [a.empresa, a.periodo, b.anexo]);
  await client.query(honorarios, [a.empresa, a.periodo, a.anexo]);
  const conciliacion = `INSERT INTO sire_conciliaciones (empresa_id, propuesta_id, tipo, periodo)
    VALUES ($1, $2, 'COMPRAS', '2026-11')`;
  await rechazar(client, 'sire_conciliaciones_propuesta_id_fkey', conciliacion, [a.empresa, b.propuesta]);
  await client.query(conciliacion, [a.empresa, a.propuesta]);

  const { rows: [anexo] } = await client.query(`INSERT INTO anexos
    (empresa_id, tipo_documento, numero_documento, razon_social, tipo_entidad)
    VALUES ($1, '6', '20000000003', 'Anexo descartable', 'AMBOS') RETURNING id`, [a.empresa]);
  const { rows: [saldo] } = await client.query(`INSERT INTO saldos_mensuales
    (empresa_id, periodo, cuenta_codigo, cuenta_nombre, anexo_id) VALUES ($1, '2026-11', '1011', 'Prueba', $2) RETURNING id`,
    [a.empresa, anexo.id]);
  await client.query('DELETE FROM anexos WHERE id = $1', [anexo.id]);
  assert.deepEqual((await client.query('SELECT empresa_id, anexo_id FROM saldos_mensuales WHERE id = $1', [saldo.id])).rows[0],
    { empresa_id: a.empresa, anexo_id: null });
  await rechazar(client, 'planilla_lineas_trabajador_id_fkey', 'DELETE FROM trabajadores WHERE id = $1', [a.trabajador]);
  await client.query('DELETE FROM planillas WHERE id = $1', [a.planilla]);
  assert.equal((await client.query('SELECT id FROM planilla_lineas WHERE planilla_id = $1', [a.planilla])).rowCount, 0);
  await contexto(client, '');
  console.log('   ✔ Alcance de hijas, relleno histórico, SET NULL, RESTRICT y CASCADE comprobados.');
}
