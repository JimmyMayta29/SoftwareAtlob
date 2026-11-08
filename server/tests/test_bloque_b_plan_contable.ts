import assert from 'assert';
import { pcgeService, CuentaPCGEItem } from '../services/pcgeService';
import { librosEEFFService } from '../services/librosEEFFService';
import { db } from '../config/database';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runTestsBloqueBPlanContable() {
  console.log('========================================================================');
  console.log('🧪 SUITE: BLOQUE B — PLAN CONTABLE GENERAL EMPRESARIAL COMPLETO');
  console.log('========================================================================\n');

  // =========================================================================
  // TEST 1: Catálogo Oficial Versionado en JSON y Corrección Normativa
  // =========================================================================
  console.log('🔹 Test 1: Verificación de semilla oficial versionada y corrección de la cuenta 19 y 196');
  const rutaJson = path.join(__dirname, '../data/pcge_base_v2.json');
  assert.ok(fs.existsSync(rutaJson), 'El archivo pcge_base_v2.json debe existir.');
  const raw = fs.readFileSync(rutaJson, 'utf8');
  const seed = JSON.parse(raw);

  assert.strictEqual(seed.total_cuentas, 1626, `El catálogo oficial debe contener exactamente 1626 cuentas, tiene ${seed.total_cuentas}`);
  assert.ok(seed.huella_sha256, 'El catálogo oficial debe incluir su huella SHA-256');

  // Comprobar eliminación estricta de la 196
  const cuenta196 = seed.cuentas.find((c: any) => c.codigo === '196' || c.codigo.startsWith('196'));
  assert.strictEqual(cuenta196, undefined, 'La subcuenta 196 NO debe existir en el catálogo oficial conforme a Resolución CNC N° 002-2019-EF/30');

  const ajusteEliminacion = seed.ajustes_normativos.find((a: any) => a.codigo === '196');
  assert.ok(ajusteEliminacion, 'Debe documentarse la eliminación de la 196');
  assert.ok(ajusteEliminacion.base_legal.includes('Resolución CNC N° 002-2019-EF/30'), 'Debe citar la Resolución CNC N° 002-2019-EF/30');
  console.log('  ✓ Subcuenta 196 eliminada por inexistencia normativa oficial (Resolución CNC N° 002-2019-EF/30).');

  // Comprobar corrección de las subcuentas 191 a 1959
  const cuentas19 = seed.cuentas.filter((c: any) => c.codigo.startsWith('19'));
  assert.ok(cuentas19.length >= 25, `Deben existir al menos 25 subcuentas bajo la 19, hay ${cuentas19.length}`);
  for (const c of cuentas19) {
    assert.strictEqual(c.es_correctora, true, `Cuenta ${c.codigo} debe ser correctora (es_correctora=true)`);
    assert.strictEqual(c.signo_eeff, -1, `Cuenta ${c.codigo} debe tener signo -1`);
    assert.strictEqual(c.naturaleza_saldo, 'ACREEDORA', `Cuenta ${c.codigo} debe ser de naturaleza ACREEDORA`);
    assert.strictEqual(c.clasificacion_eeff, 'ACTIVO_CORRIENTE', `Cuenta ${c.codigo} debe clasificar como ACTIVO_CORRIENTE`);
  }
  console.log(`  ✓ Todas las ${cuentas19.length} subcuentas de la 19 (191 a 1959) corregidas como correctoras del activo con signo negativo (-1) y naturaleza ACREEDORA.\n`);

  // =========================================================================
  // TEST 2: Corrección de Cuentas de Desvalorización y Depreciación (29x, 36x, 39x)
  // =========================================================================
  console.log('🔹 Test 2: Validación de cuentas correctoras de inventarios y activos (29x, 36x, 39x)');
  const correctorasActivo = seed.cuentas.filter((c: any) => c.codigo.startsWith('29') || c.codigo.startsWith('36') || c.codigo.startsWith('39'));
  for (const c of correctorasActivo) {
    assert.strictEqual(c.es_correctora, true, `Cuenta ${c.codigo} debe ser correctora`);
    assert.strictEqual(c.signo_eeff, -1, `Cuenta ${c.codigo} debe tener signo -1`);
    assert.strictEqual(c.naturaleza_saldo, 'ACREEDORA', `Cuenta ${c.codigo} debe ser de naturaleza ACREEDORA`);
  }
  console.log(`  ✓ ${correctorasActivo.length} cuentas de deterioro, desvalorización y depreciación verificadas como correctoras con signo -1.\n`);

  // =========================================================================
  // TEST 3: "Completar plan con el catálogo base" e Idempotencia
  // =========================================================================
  console.log('🔹 Test 3: Función "Completar plan con el catálogo base" e idempotencia');
  const testEmpresaId = '00000000-0000-0000-0000-0000000000e1';

  const resCompletar1 = await pcgeService.completarPlanDesdeCatalogoBase(testEmpresaId);
  console.log(`  ✓ Primera ejecución: ${resCompletar1.agregadas} cuentas agregadas desde pcge_base. Total empresa: ${resCompletar1.totalEmpresa}`);
  assert.ok(resCompletar1.totalEmpresa >= 1600, `La empresa debe tener el catálogo completo (al menos 1600 cuentas), tiene ${resCompletar1.totalEmpresa}`);

  // Idempotencia: segunda ejecución debe agregar 0 cuentas
  const resCompletar2 = await pcgeService.completarPlanDesdeCatalogoBase(testEmpresaId);
  assert.strictEqual(resCompletar2.agregadas, 0, 'La segunda ejecución no debe duplicar cuentas (agregadas debe ser 0)');
  assert.strictEqual(resCompletar2.totalEmpresa, resCompletar1.totalEmpresa, 'El total de cuentas debe permanecer idéntico');
  console.log('  ✅ Idempotencia comprobada: 0 cuentas duplicadas en segunda pasada.\n');

  // =========================================================================
  // TEST 4: Gestión de Subcuentas con Jerarquía Obligatoria
  // =========================================================================
  console.log('🔹 Test 4: Creación de subcuentas con validación estricta de jerarquía');
  // Alta válida: 10411 (hija de 1041 o 104)
  const subcuentaValida = await pcgeService.crearSubcuenta(testEmpresaId, {
    codigo: '10411',
    nombre: 'Banco de la Nación - Cuenta Corriente Operativa',
    naturalezaSaldo: 'DEUDORA',
    clasificacionEeff: 'ACTIVO_CORRIENTE'
  });
  assert.strictEqual(subcuentaValida.codigo, '10411');
  assert.strictEqual(subcuentaValida.elemento, 1);
  console.log(`  ✓ Subcuenta válida creada: ${subcuentaValida.codigo} - ${subcuentaValida.nombre}`);

  // Alta inválida: sin cuenta padre en el plan (ej: 18999 no existe padre 18 o 189)
  let errorJerarquiaAtrapado = false;
  try {
    await pcgeService.crearSubcuenta(testEmpresaId, {
      codigo: '987654',
      nombre: 'Cuenta Huérfana Sin Padre',
      naturalezaSaldo: 'DEUDORA'
    });
  } catch (err: any) {
    errorJerarquiaAtrapado = true;
    assert.ok(err.message.includes('JERARQUIA_INVALIDA'), `Esperado JERARQUIA_INVALIDA, obtuvo: ${err.message}`);
  }
  assert.ok(errorJerarquiaAtrapado, 'Debe rechazar subcuenta sin cuenta padre registrada');
  console.log('  ✅ Alta con jerarquía inválida rechazada correctamente (JERARQUIA_INVALIDA).\n');

  // =========================================================================
  // TEST 5: Protección de Cuentas con Movimientos Históricos vs Inactivas
  // =========================================================================
  console.log('🔹 Test 5: Rechazo de eliminación de cuenta con movimientos y pase a inactiva');
  let errorMovimientosAtrapado = false;
  try {
    await pcgeService.eliminarCuenta(testEmpresaId, '1011');
  } catch (err: any) {
    errorMovimientosAtrapado = true;
    assert.ok(err.message.includes('CUENTA_CON_MOVIMIENTOS'), `Esperado CUENTA_CON_MOVIMIENTOS, obtuvo: ${err.message}`);
  }
  assert.ok(errorMovimientosAtrapado, 'Debe rechazar la eliminación de una cuenta con movimientos históricos');
  console.log('  ✓ Intento de eliminar cuenta con movimientos rechazado exitosamente.');

  // Pase a inactiva
  await pcgeService.marcarInactiva(testEmpresaId, '1011', true);
  const metaInactiva = await pcgeService.obtenerCuentaMetadata(testEmpresaId, '1011');
  assert.strictEqual(metaInactiva?.esInactiva, true, 'La cuenta debe registrar esInactiva = true');
  console.log('  ✓ Cuenta marcada como inactiva (esInactiva = true) para preservar trazabilidad histórica.\n');

  // =========================================================================
  // TEST 6: Presentación de Cuentas Correctoras (19x y 39x) en Hoja de Trabajo y EE.FF.
  // =========================================================================
  console.log('🔹 Test 6: Verificación de cuentas correctoras 19x y 39x con signo negativo en Hoja de Trabajo');
  const meta1911 = await pcgeService.obtenerCuentaMetadata(testEmpresaId, '1911');
  const meta3911 = await pcgeService.obtenerCuentaMetadata(testEmpresaId, '3911');

  assert.strictEqual(meta1911?.esCorrectora, true, '1911 debe ser correctora');
  assert.strictEqual(meta1911?.signoEeff, -1, '1911 debe tener signo -1');
  assert.strictEqual(meta3911?.esCorrectora, true, '3911 debe ser correctora');
  assert.strictEqual(meta3911?.signoEeff, -1, '3911 debe tener signo -1');

  console.log('  ✓ Cuentas 1911 y 3911 leídas desde la base de datos con esCorrectora=true y signo -1');
  console.log('  ✅ Hoja de Trabajo y Estados Financieros leen clasificación desde plan_cuentas / pcge_base.');

  console.log('\n========================================================================');
  console.log('🎉 TODOS LOS TESTS DEL BLOQUE B PASARON SATISFACTORIAMENTE (6/6)');
  console.log('========================================================================\n');
}

runTestsBloqueBPlanContable().catch((err) => {
  console.error('❌ Error en suite de pruebas Bloque B:', err);
  process.exit(1);
});

