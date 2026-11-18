import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.NODE_ENV = 'test';

import { sireImportacionService, CAR_IMPORTADOS_MEMORIA } from '../services/sireImportacionService';

const pathCompras = 'C:/Users/jimmy/.gemini/antigravity/brain/c5fc0e8d-1797-44a5-aa78-5f5498d15392/.user_uploaded/media_1795015305815_65394e35.zip';
const pathVentas = 'C:/Users/jimmy/.gemini/antigravity/brain/c5fc0e8d-1797-44a5-aa78-5f5498d15392/.user_uploaded/media_1795015305849_7a90e03b.zip';

async function main() {
  console.log('========================================================================');
  console.log('🧪 PRUEBA END-TO-END DE IMPORTACIÓN SIRE (RCE COMPRAS Y RVIE VENTAS)');
  console.log('========================================================================\n');

  const bufCompras = fs.readFileSync(pathCompras);
  const bufVentas = fs.readFileSync(pathVentas);

  // 1. Detección de archivo invertido (Ventas subido en Compras)
  let errorInvertido = false;
  try {
    await sireImportacionService.analizarArchivoZip('00000000-0000-0000-0000-000000000001', 'COMPRAS', '2026-10', bufVentas, 'ventas_en_compras.zip');
  } catch (err: any) {
    errorInvertido = true;
    console.log('✅ [TEST 1] Correctamente rechazado archivo de Ventas en Compras:', err.message);
  }
  assert.ok(errorInvertido, 'Debe rechazar un ZIP de ventas en compras');

  // Detección de archivo invertido (Compras subido en Ventas)
  let errorInvertido2 = false;
  try {
    await sireImportacionService.analizarArchivoZip('00000000-0000-0000-0000-000000000001', 'VENTAS', '2026-10', bufCompras, 'compras_en_ventas.zip');
  } catch (err: any) {
    errorInvertido2 = true;
    console.log('✅ [TEST 1.2] Correctamente rechazado archivo de Compras en Ventas:', err.message);
  }
  assert.ok(errorInvertido2, 'Debe rechazar un ZIP de compras en ventas');

  // 2. Análisis de Compras (RCE Propuesta)
  console.log('\n--- 2. Analizando RCE Compras Propuesta ---');
  const resCompras = await sireImportacionService.analizarArchivoZip('00000000-0000-0000-0000-000000000001', 'COMPRAS', '2026-10', bufCompras, 'compras.zip');
  console.log('  RUC Emisor detectado:', resCompras.rucEmisor);
  console.log('  Razón Social Emisor:', resCompras.razonSocialEmisor);
  console.log('  Periodo detectado:', resCompras.periodo);
  console.log('  Total Registros:', resCompras.totalRegistros);
  console.log('  Total Base Imponible:', resCompras.totalBaseImponible);
  console.log('  Total IGV:', resCompras.totalIgv);
  console.log('  Total Importe:', resCompras.totalImporte);
  console.log('  Resumen Estados:', resCompras.resumenEstados);

  assert.equal(resCompras.totalRegistros, 37, 'Debe contener 37 comprobantes de compra');
  assert.equal(resCompras.rucEmisor, '20615425436', 'RUC debe coincidir');
  assert.equal(resCompras.periodo, '202610', 'Periodo debe ser 202610');
  assert.equal(resCompras.totalBaseImponible, 49412.61, 'Base imponible debe ser exacta');
  assert.equal(resCompras.totalIgv, 8894.26, 'IGV debe ser exacto');
  assert.equal(resCompras.totalImporte, 58354.45, 'Total importe debe ser exacto');

  // Verificar que todas las filas tengan orden ascendente por fecha de emisión
  for (let i = 1; i < resCompras.filas.length; i++) {
    assert.ok(
      resCompras.filas[i].fechaEmisionIso >= resCompras.filas[i - 1].fechaEmisionIso,
      `Filas deben estar ordenadas cronológicamente (${resCompras.filas[i].fechaEmisionIso} >= ${resCompras.filas[i - 1].fechaEmisionIso})`
    );
  }
  console.log('✅ [TEST 2] Compras: 37 registros parseados y ordenados por fecha de emisión ascendente.');

  // 3. Análisis de Ventas (RVIE Exp2)
  console.log('\n--- 3. Analizando RVIE Ventas Exp2 ---');
  const resVentas = await sireImportacionService.analizarArchivoZip('00000000-0000-0000-0000-000000000001', 'VENTAS', '2026-10', bufVentas, 'ventas.zip');
  console.log('  RUC Emisor detectado:', resVentas.rucEmisor);
  console.log('  Razón Social Emisor:', resVentas.razonSocialEmisor);
  console.log('  Periodo detectado:', resVentas.periodo);
  console.log('  Total Registros:', resVentas.totalRegistros);
  console.log('  Total Base Imponible:', resVentas.totalBaseImponible);
  console.log('  Total IGV:', resVentas.totalIgv);
  console.log('  Total Importe:', resVentas.totalImporte);
  console.log('  Resumen Estados:', resVentas.resumenEstados);

  assert.equal(resVentas.totalRegistros, 47, 'Debe contener 47 comprobantes de venta');
  assert.equal(resVentas.rucEmisor, '20615425436', 'RUC debe coincidir');
  assert.equal(resVentas.periodo, '202610', 'Periodo debe ser 202610');
  assert.equal(resVentas.totalBaseImponible, 50021.16, 'Base imponible debe ser exacta');
  assert.equal(resVentas.totalIgv, 9003.84, 'IGV debe ser exacto');
  assert.equal(resVentas.totalImporte, 59025.00, 'Total importe debe ser exacto');

  for (let i = 1; i < resVentas.filas.length; i++) {
    assert.ok(
      resVentas.filas[i].fechaEmisionIso >= resVentas.filas[i - 1].fechaEmisionIso,
      `Filas deben estar ordenadas cronológicamente (${resVentas.filas[i].fechaEmisionIso} >= ${resVentas.filas[i - 1].fechaEmisionIso})`
    );
  }
  console.log('✅ [TEST 3] Ventas: 47 registros parseados y ordenados por fecha de emisión ascendente.');

  // 4. Prueba de Cuenta Inexistente en PCGE -> Debe marcar REQUIERE_REVISION y dejar cuenta vacía
  console.log('\n--- 4. Probando Regla de Cuentas: No inventar cuentas que no existan en el PCGE ---');
  sireImportacionService.guardarReglasMapeo('empresa-test-cuentas', {
    compras: {
      clasif1_mercaderias: '999999', // Código inexistente en PCGE
      clasif2_activoFijo: '33011',
      clasif3_otrosActivos: '34',
      clasif4_servicios: '63111',
      clasif5_otrosGastos: '65',
      igvCreditoFiscal: '40111',
      proveedorRuc: '4212',
      proveedorDni: '4212',
      cuentaDetraccion: '422'
    }
  });

  const resTestInexistente = await sireImportacionService.analizarArchivoZip('empresa-test-cuentas', 'COMPRAS', '2026-10', bufCompras, 'compras.zip');
  const filaSinCuenta = resTestInexistente.filas[0];
  assert.equal(filaSinCuenta.cuentaPropuestaCodigo, '', 'Cuenta propuesta debe estar vacía para que el usuario la elija');
  assert.equal(filaSinCuenta.cuentaRequiereRevision, true, 'Debe marcarse como requiere revisión');
  assert.equal(filaSinCuenta.estadoValidacion, 'REQUIERE_REVISION', 'Estado debe ser REQUIERE_REVISION');
  console.log('✅ [TEST 4] Cuenta no existente en PCGE deja campo de cuenta vacío y marca REQUIERE_REVISION.');

  // 5. Simulación de Detección de Duplicados (CAR ya importado)
  console.log('\n--- 5. Probando Detección de Duplicados por CAR ---');
  const primerCar = resCompras.filas[0].car;
  CAR_IMPORTADOS_MEMORIA.add(primerCar);

  const resConDup = await sireImportacionService.analizarArchivoZip('00000000-0000-0000-0000-000000000001', 'COMPRAS', '2026-10', bufCompras, 'compras.zip');
  const filaDuplicada = resConDup.filas.find(f => f.car === primerCar);
  assert.ok(filaDuplicada, 'Fila debe existir');
  assert.equal(filaDuplicada?.estadoValidacion, 'YA_IMPORTADO', 'Debe marcarse como YA_IMPORTADO');
  assert.equal(filaDuplicada?.incluir, false, 'No debe estar marcada para incluir');
  console.log(`✅ [TEST 5] Comprobante con CAR ${primerCar} marcado como YA_IMPORTADO y desmarcado.`);

  // Limpiar prueba de duplicado
  CAR_IMPORTADOS_MEMORIA.delete(primerCar);

  // 6. Prueba de Contabilización de Filas Seleccionadas
  console.log('\n--- 6. Probando Contabilización de Filas Seleccionadas ---');
  // Tomar 2 filas de compras para contabilizar
  const filasParaContabCompras = [resCompras.filas[0], resCompras.filas[1]];
  const resultadoContab = await sireImportacionService.contabilizarFilasSeleccionadas(
    '00000000-0000-0000-0000-000000000001',
    'COMPRAS',
    '2026-10',
    filasParaContabCompras,
    'usr-test-01'
  );

  console.log('  Resultado Contabilización Compras:', {
    exitosos: resultadoContab.exitosos,
    fallidos: resultadoContab.fallidos,
    comprobantesIds: resultadoContab.comprobantesIds,
    asientosIds: resultadoContab.asientosIds,
    errores: resultadoContab.errores
  });

  assert.equal(resultadoContab.exitosos, 2, 'Debe contabilizar 2 comprobantes exitosamente');
  assert.equal(resultadoContab.fallidos, 0, 'No debe haber fallidos');
  assert.equal(resultadoContab.comprobantesIds.length, 2, 'Debe devolver 2 IDs de comprobantes');
  assert.equal(resultadoContab.asientosIds.length, 2, 'Debe generar 2 asientos contables vinculados');
  console.log('✅ [TEST 6] 2 comprobantes de compras contabilizados con sus asientos generados.');

  // Contabilizar 2 filas de ventas
  const filasParaContabVentas = [resVentas.filas[0], resVentas.filas[1]];
  const resultadoContabVentas = await sireImportacionService.contabilizarFilasSeleccionadas(
    '00000000-0000-0000-0000-000000000001',
    'VENTAS',
    '2026-10',
    filasParaContabVentas,
    'usr-test-01'
  );

  console.log('  Resultado Contabilización Ventas:', {
    exitosos: resultadoContabVentas.exitosos,
    fallidos: resultadoContabVentas.fallidos,
    comprobantesIds: resultadoContabVentas.comprobantesIds,
    asientosIds: resultadoContabVentas.asientosIds,
    errores: resultadoContabVentas.errores
  });

  assert.equal(resultadoContabVentas.exitosos, 2, 'Debe contabilizar 2 comprobantes de venta exitosamente');
  assert.equal(resultadoContabVentas.fallidos, 0, 'No debe haber fallidos en ventas');
  assert.equal(resultadoContabVentas.comprobantesIds.length, 2, 'Debe devolver 2 IDs de comprobantes de ventas');
  assert.equal(resultadoContabVentas.asientosIds.length, 2, 'Debe generar 2 asientos contables vinculados para ventas');
  console.log('✅ [TEST 6.2] 2 comprobantes de ventas contabilizados con sus asientos generados.');

  console.log('\n========================================================================');
  console.log('🎉 TODAS LAS PRUEBAS END-TO-END DE IMPORTACIÓN SIRE PASARON CON ÉXITO');
  console.log('========================================================================');
}

main().catch(err => {
  console.error('❌ Error en prueba:', err);
  process.exit(1);
});
