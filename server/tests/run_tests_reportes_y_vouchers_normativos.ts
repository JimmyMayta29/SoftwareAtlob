import assert from 'assert';
import { 
  construirDefinicionRegistroComprasEstandar,
  construirDefinicionRegistroVentasEstandar,
  construirDefinicionLibroDiarioEstandar,
  construirDefinicionLibroMayorEstandar,
  construirDefinicionHojaTrabajo10ColEstandar,
  construirDefinicionEstadoSituacionFinancieraEstandar,
  construirDefinicionEstadoResultadosEstandar,
  construirDefinicionFlujoEfectivoEstandar,
  construirDefinicionCajaBancosEstandar,
  construirDefinicionVoucherContableEstandar,
  formatearFechaEstandar,
  formatearImporteEstandar,
  EstandarReportDefinition
} from '../../src/services/reports/formato_estandar/formatoEstandarEngine';
import { EMPRESAS_CLIENTES_DEMO, crearDatosInicialesEmpresa } from '../../src/data/empresasClientes';
import { asientoService, ASIENTOS_MEMORIA } from '../services/asientoService';
import { pleExportService } from '../services/pleExportService';
import { PLANTILLAS_ASIENTOS, AVISO_REVISION_CONTADOR } from '../../src/components/voucher/plantillasAsientos';
import { buscarCuentaPCGE } from '../../src/data/pcgeAccounts';

export async function runTestsReportesYVouchersNormativos() {
  console.log('========================================================================');
  console.log('🧪 SUITE: UNIFORMIDAD DE REPORTES Y REGISTRO DE ASIENTOS NORMATIVOS');
  console.log('========================================================================\n');

  const empresa = EMPRESAS_CLIENTES_DEMO[0];
  const datosIniciales = crearDatosInicialesEmpresa(empresa.id, empresa.ruc, empresa.razonSocial);
  const periodo = '2026-09';

  // =========================================================================
  // TEST 1: Formato de Fecha DD/MM/AAAA Estricto según PLE Vigente
  // =========================================================================
  console.log('🔹 Test 1: Validación estricta de formato de fecha DD/MM/AAAA (con ceros iniciales)');
  const fechaConCero = formatearFechaEstandar('2026-09-02');
  const fechaConCeroMes = formatearFechaEstandar('2026-04-05');
  const fechaFinMes = formatearFechaEstandar('2026-12-31');

  assert.strictEqual(fechaConCero, '02/09/2026', `Esperado 02/09/2026 pero obtuvo ${fechaConCero}`);
  assert.strictEqual(fechaConCeroMes, '05/04/2026', `Esperado 05/04/2026 pero obtuvo ${fechaConCeroMes}`);
  assert.strictEqual(fechaFinMes, '31/12/2026', `Esperado 31/12/2026 pero obtuvo ${fechaFinMes}`);
  console.log('  ✅ Formato de fecha DD/MM/AAAA validado correctamente.\n');

  // =========================================================================
  // TEST 2: Cuadre de Totales en Registro de Compras de Prueba
  // =========================================================================
  console.log('🔹 Test 2: Cuadre exacto de totales en Registro de Compras de prueba');
  const defCompras = construirDefinicionRegistroComprasEstandar(empresa, datosIniciales.compras, periodo);
  const totales = defCompras.totalesGenerales;

  console.log(`  Base Imponible A (18%): S/ ${totales.baseA.toFixed(2)}`);
  console.log(`  I.G.V. 18%:             S/ ${totales.igvA.toFixed(2)}`);
  console.log(`  Adquisiciones no Grav:  S/ ${totales.adqNoGrav.toFixed(2)}`);
  console.log(`  Otros Tributos:         S/ ${totales.otrosTrib.toFixed(2)}`);
  console.log(`  TOTAL GENERAL:          S/ ${totales.total.toFixed(2)}`);

  assert.strictEqual(totales.baseA, 18028.00, `Base imponible debe ser 18,028.00, obtuvo ${totales.baseA}`);
  assert.strictEqual(totales.igvA, 3245.04, `IGV debe ser 3,245.04, obtuvo ${totales.igvA}`);
  assert.strictEqual(totales.adqNoGrav, 12.50, `Adquisiciones no gravadas debe ser 12.50, obtuvo ${totales.adqNoGrav}`);
  assert.strictEqual(totales.otrosTrib, 15.00, `Otros tributos debe ser 15.00, obtuvo ${totales.otrosTrib}`);
  assert.strictEqual(totales.total, 21300.54, `Total general debe ser 21,300.54, obtuvo ${totales.total}`);

  // Comprobación de suma exacta al centavo
  const sumaExacta = Math.round((totales.baseA + totales.igvA + totales.adqNoGrav + totales.otrosTrib) * 100) / 100;
  assert.strictEqual(sumaExacta, totales.total, 'La suma de componentes debe cuadrar exactamente con el total general');
  console.log('  ✅ Totales del Registro de Compras cuadran al centavo exacto (18,028.00 + 3,245.04 + 12.50 + 15.00 = 21,300.54).\n');

  // =========================================================================
  // TEST 3: Uniformidad Estructural del Motor de Reportes en Todos los Libros
  // =========================================================================
  console.log('🔹 Test 3: Uniformidad del motor de reportes (definición común para todos los libros)');
  const reportesEvaluados: Array<{ nombre: string; def: EstandarReportDefinition }> = [
    { nombre: 'Registro de Compras (8.1)', def: defCompras },
    { nombre: 'Registro de Ventas (14.1)', def: construirDefinicionRegistroVentasEstandar(empresa, datosIniciales.ventas, periodo) },
    { nombre: 'Libro Diario (5.1)', def: construirDefinicionLibroDiarioEstandar(empresa, datosIniciales.asientos, periodo) },
    { nombre: 'Libro Mayor (6.1)', def: construirDefinicionLibroMayorEstandar(empresa, datosIniciales.asientos, periodo) },
    { nombre: 'Hoja de Trabajo 10 Col', def: construirDefinicionHojaTrabajo10ColEstandar(empresa, datosIniciales.asientos, periodo) },
    { nombre: 'Estado de Situación Financiera (3.1)', def: construirDefinicionEstadoSituacionFinancieraEstandar(empresa, {}, periodo) },
    { nombre: 'Estado de Resultados (3.20)', def: construirDefinicionEstadoResultadosEstandar(empresa, {}, periodo) },
    { nombre: 'Estado de Flujo de Efectivo (3.18)', def: construirDefinicionFlujoEfectivoEstandar(empresa, {}, periodo) },
    { nombre: 'Caja y Bancos Cta Cte (1.2)', def: construirDefinicionCajaBancosEstandar(empresa, datosIniciales.movimientosBancarios, periodo, '1.2') },
    { nombre: 'Caja y Bancos Efectivo (1.1)', def: construirDefinicionCajaBancosEstandar(empresa, datosIniciales.movimientosBancarios, periodo, '1.1') },
    { nombre: 'Voucher Contable Individual', def: construirDefinicionVoucherContableEstandar(empresa, datosIniciales.asientos[0]) },
  ];

  for (const { nombre, def } of reportesEvaluados) {
    assert.ok(def.titulo && def.titulo.length > 5, `${nombre}: título formal requerido`);
    assert.ok(def.empresa.razonSocial && def.empresa.razonSocial === empresa.razonSocial, `${nombre}: empresa.razonSocial debe ser consistente`);
    assert.ok(def.empresa.ruc && def.empresa.ruc === empresa.ruc, `${nombre}: empresa.ruc debe coincidir`);
    assert.ok(def.empresa.direccion, `${nombre}: dirección legal requerida en membrete`);
    assert.strictEqual(def.moneda, 'SOLES', `${nombre}: moneda estándar SOLES requerida`);
    assert.ok(def.columnas && def.columnas.length >= 3, `${nombre}: debe tener columnas tabulares`);
    assert.ok(def.grupos && def.grupos.length >= 1, `${nombre}: debe tener al menos un grupo`);
    assert.ok(def.totalesGenerales, `${nombre}: totalesGenerales requeridos`);
    console.log(`  ✓ ${nombre}: Estructura estándar uniforme verificada (${def.columnas.length} columnas, ${def.grupos.length} grupos).`);
  }
  console.log('  ✅ Todos los 11 reportes y libros cumplen con la estructura unificada del motor.\n');

  // =========================================================================
  // TEST 4: Salida Completa y Sin Pérdida a PLE 5.1 (21 campos) y 6.1 (16 campos)
  // =========================================================================
  console.log('🔹 Test 4: Validación de cantidad exacta de campos PLE 5.1 (21 campos) y PLE 6.1 (16 campos)');
  
  // Limpiar y preparar asientos contabilizados en ASIENTOS_MEMORIA para el periodo
  ASIENTOS_MEMORIA.length = 0;
  ASIENTOS_MEMORIA.push({
    id: 'ast-test-01',
    empresaId: empresa.id,
    periodoId: `per-${periodo}`,
    subdiarioId: '01',
    numero: '0100001',
    cuo: '0100001',
    fecha: '2026-09-15',
    glosa: 'Compra de mercaderías según factura F001-0023451',
    totalDebe: 4956.00,
    totalHaber: 4956.00,
    estado: 'CONTABILIZADO',
    moneda: 'PEN',
    tipoCambio: 3.75,
    detalles: [
      {
        linea: 1,
        cuentaCodigo: '6011',
        cuentaNombre: 'Mercaderías manufacturadas',
        debe: 4200.00,
        haber: 0.00,
        glosaLinea: 'Compra mercaderías',
        centroCostoCodigo: 'CC100',
        anexoTipoDoc: '6',
        anexoNumDoc: '20100035392',
        anexoNombre: 'DISTRIBUIDORA INDUSTRIAL FERRETERA S.A.C.',
        docTipo: '01',
        docSerie: 'F001',
        docNumero: '0023451',
        fechaEmision: '2026-09-02',
        fechaVencimiento: '2026-09-30'
      },
      {
        linea: 2,
        cuentaCodigo: '40111',
        cuentaNombre: 'IGV - Cuenta propia',
        debe: 756.00,
        haber: 0.00,
        glosaLinea: 'IGV compra',
        docTipo: '01',
        docSerie: 'F001',
        docNumero: '0023451'
      },
      {
        linea: 3,
        cuentaCodigo: '4212',
        cuentaNombre: 'Emitidas',
        debe: 0.00,
        haber: 4956.00,
        glosaLinea: 'Factura por pagar',
        anexoTipoDoc: '6',
        anexoNumDoc: '20100035392',
        anexoNombre: 'DISTRIBUIDORA INDUSTRIAL FERRETERA S.A.C.',
        docTipo: '01',
        docSerie: 'F001',
        docNumero: '0023451',
        fechaEmision: '2026-09-02',
        fechaVencimiento: '2026-09-30'
      }
    ]
  });

  const ple51 = await pleExportService.exportarLibro(empresa.id, periodo, '050100', empresa.ruc, 'usr-test');
  const ple61 = await pleExportService.exportarLibro(empresa.id, periodo, '060100', empresa.ruc, 'usr-test');

  assert.ok(ple51.nombreArchivo.startsWith(`LE${empresa.ruc}20260900050100`), 'Nombre archivo PLE 5.1 válido');
  assert.ok(ple61.nombreArchivo.startsWith(`LE${empresa.ruc}20260900060100`), 'Nombre archivo PLE 6.1 válido');

  const lineas51 = ple51.contenidoTxt.trim().split('\r\n');
  assert.ok(lineas51.length > 0, 'PLE 5.1 debe tener líneas');
  lineas51.forEach((linea, idx) => {
    // Al hacer split por |, el último elemento es vacío debido al pipe final
    const campos = linea.split('|');
    const cantCampos = linea.endsWith('|') ? campos.length - 1 : campos.length;
    assert.strictEqual(cantCampos, 21, `Línea ${idx + 1} de PLE 5.1 debe tener exactamente 21 campos, tiene ${cantCampos}`);
  });
  console.log(`  ✓ PLE 5.1 validado: ${lineas51.length} líneas con exactamente 21 campos cada una.`);

  const lineas61 = ple61.contenidoTxt.trim().split('\r\n');
  assert.ok(lineas61.length > 0, 'PLE 6.1 debe tener líneas');
  lineas61.forEach((linea, idx) => {
    const campos = linea.split('|');
    const cantCampos = linea.endsWith('|') ? campos.length - 1 : campos.length;
    assert.strictEqual(cantCampos, 16, `Línea ${idx + 1} de PLE 6.1 debe tener exactamente 16 campos, tiene ${cantCampos}`);
  });
  console.log(`  ✓ PLE 6.1 validado: ${lineas61.length} líneas con exactamente 16 campos cada una.\n`);

  // =========================================================================
  // TEST 5: Validación de Cuentas de Mayor (2 dígitos) y Campos Obligatorios
  // =========================================================================
  console.log('🔹 Test 5: Rechazo de cuentas de mayor (2 dígitos) y validación de requisitos PCGE');

  // 1. Intento de imputación a cuenta de 2 dígitos
  let errorMayorAtrapado = false;
  try {
    asientoService.validarAsientoNormativo({
      subdiario: '01',
      periodo: '2026-09',
      fechaContable: '2026-09-15',
      glosaGeneral: 'Prueba imputación inválida',
      moneda: 'PEN',
      tipoCambio: 3.75,
      detalles: [
        { cuentaCodigo: '60', debe: 100, haber: 0 },
        { cuentaCodigo: '42', debe: 0, haber: 100 }
      ]
    });
  } catch (err: any) {
    errorMayorAtrapado = true;
    assert.ok(err.message.includes('CUENTA_NO_IMPUTABLE'), `Esperado error CUENTA_NO_IMPUTABLE, obtuvo: ${err.message}`);
  }
  assert.ok(errorMayorAtrapado, 'Debe rechazar la cuenta de 2 dígitos con CUENTA_NO_IMPUTABLE');
  console.log('  ✓ Cuenta de mayor (60) rechazada exitosamente con CUENTA_NO_IMPUTABLE.');

  // 2. Intento de omisión de anexo obligatorio en cuenta 4212
  let errorAnexoAtrapado = false;
  try {
    asientoService.validarAsientoNormativo({
      subdiario: '01',
      periodo: '2026-09',
      fechaContable: '2026-09-15',
      glosaGeneral: 'Prueba anexo faltante',
      moneda: 'PEN',
      tipoCambio: 3.75,
      detalles: [
        { cuentaCodigo: '6011', debe: 100, haber: 0 },
        { cuentaCodigo: '4212', debe: 0, haber: 100 } // Falta anexo y documento
      ]
    });
  } catch (err: any) {
    errorAnexoAtrapado = true;
    assert.ok(err.message.includes('ANEXO_REQUERIDO'), `Esperado error ANEXO_REQUERIDO, obtuvo: ${err.message}`);
  }
  assert.ok(errorAnexoAtrapado, 'Debe exigir anexo cuando la cuenta lo requiere');
  console.log('  ✓ Falta de anexo en cuenta 4212 rechazada con ANEXO_REQUERIDO.');

  // 3. Intento de omisión de documento obligatorio en cuenta 4212
  let errorDocAtrapado = false;
  try {
    asientoService.validarAsientoNormativo({
      subdiario: '01',
      periodo: '2026-09',
      fechaContable: '2026-09-15',
      glosaGeneral: 'Prueba doc faltante',
      moneda: 'PEN',
      tipoCambio: 3.75,
      detalles: [
        { cuentaCodigo: '6011', debe: 100, haber: 0 },
        { cuentaCodigo: '4212', debe: 0, haber: 100, anexoNumDoc: '20100035392', anexoNombre: 'PROVEEDOR S.A.C.' } // Falta doc
      ]
    });
  } catch (err: any) {
    errorDocAtrapado = true;
    assert.ok(err.message.includes('DOCUMENTO_REQUERIDO'), `Esperado error DOCUMENTO_REQUERIDO, obtuvo: ${err.message}`);
  }
  assert.ok(errorDocAtrapado, 'Debe exigir documento cuando la cuenta lo requiere');
  console.log('  ✓ Falta de comprobante de pago en cuenta 4212 rechazada con DOCUMENTO_REQUERIDO.\n');

  // =========================================================================
  // TEST 6: Rechazo de Asientos Descuadrados (Partida Doble al Centavo Exacto)
  // =========================================================================
  console.log('🔹 Test 6: Rechazo estricto de asientos descuadrados en servicio contable');
  let errorDescuadreAtrapado = false;
  try {
    asientoService.validarAsientoNormativo({
      subdiario: '01',
      periodo: '2026-09',
      fechaContable: '2026-09-15',
      glosaGeneral: 'Prueba descuadre',
      moneda: 'PEN',
      tipoCambio: 3.75,
      detalles: [
        { cuentaCodigo: '1011', debe: 100.00, haber: 0 },
        { cuentaCodigo: '70111', debe: 0, haber: 99.99 } // Descuadre de 0.01 centavo
      ]
    });
  } catch (err: any) {
    errorDescuadreAtrapado = true;
    assert.ok(err.message.includes('ASIENTO_DESCUADRADO'), `Esperado ASIENTO_DESCUADRADO, obtuvo: ${err.message}`);
  }
  assert.ok(errorDescuadreAtrapado, 'Debe rechazar el descuadre de 1 centavo');
  console.log('  ✅ Asiento descuadrado (100.00 != 99.99) rechazado con ASIENTO_DESCUADRADO.\n');

  // =========================================================================
  // TEST 7: Plantillas de Asientos Preconfiguradas (Inventario y Revisión Contador)
  // =========================================================================
  console.log('🔹 Test 7: Validación de plantillas de asientos preconfiguradas');
  assert.strictEqual(PLANTILLAS_ASIENTOS.length, 7, `Deben existir 7 plantillas estándar, hay ${PLANTILLAS_ASIENTOS.length}`);

  PLANTILLAS_ASIENTOS.forEach((p) => {
    assert.ok(['permanente', 'periodico', 'no_aplica'].includes(p.metodoInventario), `${p.nombre}: método de inventario debe ser explícito`);
    assert.strictEqual(p.avisoNormativo, AVISO_REVISION_CONTADOR, `${p.nombre}: debe incluir el aviso obligatorio`);
    assert.ok(p.lineas.length >= 2, `${p.nombre}: debe tener al menos 2 líneas para partida doble`);

    // Validar que todas las cuentas de la plantilla existen en el PCGE
    p.lineas.forEach((l) => {
      const cta = buscarCuentaPCGE(l.codigoCuenta);
      assert.ok(cta, `${p.nombre}: la cuenta ${l.codigoCuenta} debe existir en el PCGE`);
    });

    console.log(`  ✓ Plantilla "${p.nombre}" validada (Método Inv: ${p.metodoInventario})`);
  });
  console.log('  ✅ Todas las plantillas cumplen con método de inventario y aviso obligatorio.\n');

  console.log('========================================================================');
  console.log('🎉 TODOS LOS TESTS DE REPORTES UNIFORMES Y ASIENTOS PASARON (7/7)');
  console.log('========================================================================\n');
}

runTestsReportesYVouchersNormativos().catch((err) => {
  console.error('❌ Error ejecutando suite:', err);
  process.exit(1);
});
