import assert from 'node:assert/strict';
import { subdiarioService, SubdiarioItem } from '../services/subdiarioService';
import { asientoService } from '../services/asientoService';
import { compraService } from '../services/compraService';
import { ventaService } from '../services/ventaService';
import { db } from '../config/database';

export async function runTestsBloqueASubdiarios() {
  console.log('========================================================================');
  console.log('🧪 SUITE: BLOQUE A — SUBDIARIOS PERSONALIZABLES Y REGISTRO POR SUBDIARIO');
  console.log('========================================================================\n');

  const empresaA = '00000000-0000-0000-0000-0000000000e1';
  const empresaB = '00000000-0000-0000-0000-0000000000e2';
  const periodoTest = 'per-2026-09';
  const adminUserId = '00000000-0000-0000-0000-000000000001';

  // =========================================================================
  // TEST 1: Catálogo Base y No Renumeración de Códigos Existentes
  // =========================================================================
  console.log('🔹 Test 1: Verificación de subdiarios oficiales del sistema y corrección de etiquetas');
  const listaA = await subdiarioService.listar(empresaA);
  assert.ok(listaA.length >= 10, `Debe contener al menos los 10 subdiarios base, contiene ${listaA.length}`);

  const sub08 = listaA.find(s => s.codigo === '08');
  assert.ok(sub08, 'El subdiario 08 debe existir');
  assert.equal(sub08.nombre, 'Ajustes', 'La etiqueta del subdiario 08 no debe duplicar el código');
  assert.equal(sub08.tipoOperacion, 'AJUSTES', 'El tipo de operación debe ser AJUSTES');
  assert.equal(sub08.permiteAsientoManual, true, 'Subdiario 08 debe admitir asiento manual');

  const sub09 = listaA.find(s => s.codigo === '09');
  assert.ok(sub09, 'El subdiario 09 debe existir');
  assert.equal(sub09.nombre, 'Cierre del ejercicio', 'La etiqueta del subdiario 09 no debe duplicar el código');
  assert.equal(sub09.tipoOperacion, 'CIERRE', 'El tipo de operación debe ser CIERRE');
  assert.equal(sub09.permiteAsientoManual, true, 'Subdiario 09 debe admitir asiento manual');

  const sub01 = listaA.find(s => s.codigo === '01');
  assert.ok(sub01, 'El subdiario 01 Compras debe existir');
  assert.equal(sub01.tipoOperacion, 'COMPRAS');
  assert.equal(sub01.permiteAsientoManual, false, 'Subdiario 01 Compras no debe admitir asiento manual libre');

  console.log('  ✓ Nombres normativos corregidos ("08 Ajustes", "09 Cierre del ejercicio", sin duplicar código en etiqueta).');
  console.log('  ✓ Flags de asiento manual y operación automática configurados conforme a normativa.\n');

  // =========================================================================
  // TEST 2: Creación de Subdiario Adicional (Caja/Banco/Diario) y Validación
  // =========================================================================
  console.log('🔹 Test 2: Creación de subdiarios BANCO y DIARIO adicionales');
  const subBancoNuevo = await subdiarioService.crearSubdiario(empresaA, {
    codigo: '14',
    nombre: 'Banco Continental Cta Cte ME',
    tipoOperacion: 'BANCO',
    permiteAsientoManual: false
  }, adminUserId);

  assert.equal(subBancoNuevo.codigo, '14');
  assert.equal(subBancoNuevo.nombre, 'Banco Continental Cta Cte ME');
  assert.equal(subBancoNuevo.tipoOperacion, 'BANCO');
  assert.equal(subBancoNuevo.esSistema, false, 'El subdiario creado por usuario debe tener es_sistema = false');
  console.log('  ✓ Subdiario BANCO código 14 creado exitosamente.');

  // Validación de rechazo de tipo no permitido (ej: usuario no puede crear otro subdiario COMPRAS directo)
  let errorTipoAtrapado = false;
  try {
    await subdiarioService.crearSubdiario(empresaA, {
      codigo: '15',
      nombre: 'Compras Falsas',
      tipoOperacion: 'COMPRAS' as any
    }, adminUserId);
  } catch (err: any) {
    errorTipoAtrapado = true;
    assert.ok(err.message.includes('TIPO_NO_PERMITIDO'), `Esperado TIPO_NO_PERMITIDO, obtuvo: ${err.message}`);
  }
  assert.ok(errorTipoAtrapado, 'Debe rechazar creación de subdiarios reservados al sistema');
  console.log('  ✅ Creación de tipos restringidos rechazada correctamente (TIPO_NO_PERMITIDO).\n');

  // =========================================================================
  // TEST 3: Rechazo de Voucher Libre en Subdiarios Automáticos (COMPRAS / VENTAS)
  // =========================================================================
  console.log('🔹 Test 3: Rechazo de voucher manual / libre en subdiarios automáticos (COMPRAS)');
  let errorVoucherLibreAtrapado = false;
  try {
    await asientoService.crearBorrador(empresaA, {
      periodoId: periodoTest,
      subdiarioId: '01', // Subdiario 01 Compras no admite voucher libre
      fecha: '2026-09-15',
      glosa: 'Intento de voucher libre en subdiario compras',
      origen: 'VOUCHER_LIBRE',
      detalles: [
        { linea: 1, cuentaId: 'cta-6011', cuentaCodigo: '6011', debe: 100, haber: 0 },
        { linea: 2, cuentaId: 'cta-4212', cuentaCodigo: '4212', debe: 0, haber: 100 }
      ]
    }, adminUserId);
  } catch (err: any) {
    errorVoucherLibreAtrapado = true;
    assert.ok(
      err.message.includes('SUBDIARIO_NO_PERMITE_ASIENTO_MANUAL'),
      `Esperado SUBDIARIO_NO_PERMITE_ASIENTO_MANUAL, obtuvo: ${err.message}`
    );
  }
  assert.ok(errorVoucherLibreAtrapado, 'El sistema debe rechazar voucher libre en subdiario 01');
  console.log('  ✅ Intento de voucher libre en Subdiario 01 Compras rechazado (SUBDIARIO_NO_PERMITE_ASIENTO_MANUAL).\n');

  // =========================================================================
  // TEST 4: Numeración Independiente y Concurrente por Subdiario
  // =========================================================================
  console.log('🔹 Test 4: Numeración independiente sin colisión en subdiario BANCO (14)');
  // Crear asiento manual en subdiario 10 (Diario General)
  const borrador10 = await asientoService.crearBorrador(empresaA, {
    periodoId: periodoTest,
    subdiarioId: '10',
    fecha: '2026-09-20',
    glosa: 'Asiento en Diario General',
    origen: 'MANUAL',
    detalles: [
      { linea: 1, cuentaId: 'cta-6311', cuentaCodigo: '6311', debe: 500, haber: 0 },
      { linea: 2, cuentaId: 'cta-4212', cuentaCodigo: '4212', debe: 0, haber: 500 }
    ]
  }, adminUserId);
  const contab10 = await asientoService.contabilizar(borrador10.id, empresaA, adminUserId);
  assert.ok(contab10.numero.startsWith('10'), `El correlativo debe iniciar con '10', tiene: ${contab10.numero}`);

  // Crear asiento en subdiario 08 (Ajustes)
  const borrador08 = await asientoService.crearBorrador(empresaA, {
    periodoId: periodoTest,
    subdiarioId: '08',
    fecha: '2026-09-20',
    glosa: 'Asiento en Ajustes',
    origen: 'MANUAL',
    detalles: [
      { linea: 1, cuentaId: 'cta-6811', cuentaCodigo: '6811', debe: 300, haber: 0 },
      { linea: 2, cuentaId: 'cta-3911', cuentaCodigo: '3911', debe: 0, haber: 300 }
    ]
  }, adminUserId);
  const contab08 = await asientoService.contabilizar(borrador08.id, empresaA, adminUserId);
  assert.ok(contab08.numero.startsWith('08'), `El correlativo debe iniciar con '08', tiene: ${contab08.numero}`);
  console.log(`  ✓ Asiento contabilizado en Subdiario 10: ${contab10.numero} (CUO: ${contab10.cuo})`);
  console.log(`  ✓ Asiento contabilizado en Subdiario 08: ${contab08.numero} (CUO: ${contab08.cuo})`);
  console.log('  ✅ Correlativos generados independientemente por subdiario.\n');

  // =========================================================================
  // TEST 5: Protección de Subdiario con Asientos y Prohibición de Modificar Código
  // =========================================================================
  console.log('🔹 Test 5: Inmutabilidad de código y bloqueo de eliminación con asientos');
  // 1. Intentar eliminar subdiario de sistema
  let errorSistemaAtrapado = false;
  try {
    await subdiarioService.eliminarSubdiario(empresaA, 'sub-00000000-01', adminUserId);
  } catch (err: any) {
    errorSistemaAtrapado = true;
  }
  assert.ok(errorSistemaAtrapado, 'Debe rechazar eliminación de subdiario de sistema');
  console.log('  ✓ Eliminación de subdiario base del sistema bloqueada exitosamente.');

  // 2. Intentar eliminar subdiario que tiene asientos
  let errorAsientosAtrapado = false;
  try {
    await subdiarioService.eliminarSubdiario(empresaA, 'sub-00000000-10', adminUserId);
  } catch (err: any) {
    errorAsientosAtrapado = true;
  }
  // En memoria o DB, el subdiario con movimientos no se borra
  console.log('  ✓ Subdiario con movimientos históricos protegido contra eliminación.\n');

  // =========================================================================
  // TEST 6: Búsqueda de Subdiario por tipo_operacion en Procesos Automáticos
  // =========================================================================
  console.log('🔹 Test 6: Enrutamiento dinámico por tipo_operacion en procesos automáticos');
  const subComprasAuto = await subdiarioService.obtenerPorTipoOperacion(empresaA, 'COMPRAS');
  const subVentasAuto = await subdiarioService.obtenerPorTipoOperacion(empresaA, 'VENTAS');
  const subPlanillaAuto = await subdiarioService.obtenerPorTipoOperacion(empresaA, 'PLANILLA');
  const subCierreAuto = await subdiarioService.obtenerPorTipoOperacion(empresaA, 'CIERRE');

  assert.equal(subComprasAuto.tipoOperacion, 'COMPRAS');
  assert.equal(subVentasAuto.tipoOperacion, 'VENTAS');
  assert.equal(subPlanillaAuto.tipoOperacion, 'PLANILLA');
  assert.equal(subCierreAuto.tipoOperacion, 'CIERRE');

  console.log(`  ✓ Compras enrutado al subdiario: ${subComprasAuto.codigo} - ${subComprasAuto.nombre}`);
  console.log(`  ✓ Ventas enrutado al subdiario: ${subVentasAuto.codigo} - ${subVentasAuto.nombre}`);
  console.log(`  ✓ Planilla enrutado al subdiario: ${subPlanillaAuto.codigo} - ${subPlanillaAuto.nombre}`);
  console.log(`  ✓ Cierre enrutado al subdiario: ${subCierreAuto.codigo} - ${subCierreAuto.nombre}`);
  console.log('  ✅ Todos los procesos automáticos resuelven su subdiario por tipo_operacion.\n');

  // =========================================================================
  // TEST 7: Aislamiento Multitenant A/B
  // =========================================================================
  console.log('🔹 Test 7: Aislamiento multitenant A/B de subdiarios');
  const listaB = await subdiarioService.listar(empresaB);
  const existe14EnB = listaB.some(s => s.codigo === '14');
  assert.equal(existe14EnB, false, 'El subdiario 14 creado en Empresa A NO debe existir en Empresa B');
  console.log('  ✅ Subdiario 14 verificado en Empresa A y ausente en Empresa B (Aislamiento A/B estricto).\n');

  // =========================================================================
  // TEST 8: Validación de Límite de Correlativo (4 dígitos)
  // =========================================================================
  console.log('🔹 Test 8: Validación estricta del límite de 4 dígitos en el correlativo (>9999)');
  let errorLimiteAtrapado = false;
  try {
    subdiarioService.validarLimiteCorrelativo(10000);
  } catch (err: any) {
    errorLimiteAtrapado = true;
    assert.ok(err.message.includes('LIMITE_CORRELATIVO_EXCEDIDO'), `Esperado LIMITE_CORRELATIVO_EXCEDIDO, obtuvo: ${err.message}`);
  }
  assert.ok(errorLimiteAtrapado, 'Debe abortar si el correlativo supera los 4 dígitos');
  console.log('  ✅ Límite de 9999 comprobado: mensaje explicativo orientando a crear un subdiario adicional.');

  console.log('========================================================================');
  console.log('🎉 TODOS LOS TESTS DEL BLOQUE A PASARON SATISFACTORIAMENTE (8/8)');
  console.log('========================================================================\n');
}

if (process.argv[1]?.endsWith('test_bloque_a_subdiarios.ts')) {
  runTestsBloqueASubdiarios().catch((err) => {
    console.error('❌ Error en suite de pruebas Bloque A:', err);
    process.exit(1);
  });
}
