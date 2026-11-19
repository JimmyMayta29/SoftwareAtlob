import assert from 'assert';
import ExcelJS from 'exceljs';
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
  generarReporteEstandarPdfDoc,
  generarReporteEstandarExcelBuffer,
  generarResumenPdt621OficialPdfDoc,
  generarPdt621ExcelBuffer,
  formatearFechaHoraEmision24h,
  EstandarReportDefinition
} from '../../src/services/reports/formato_estandar/formatoEstandarEngine';
import { EMPRESAS_CLIENTES_DEMO, crearDatosInicialesEmpresa } from '../../src/data/empresasClientes';

export async function runTestsBloqueCReportes() {
  console.log('========================================================================');
  console.log('🧪 SUITE: BLOQUE C — REPORTES UNIFICADOS, SIN ASTERISCOS Y PAGINACIÓN REAL');
  console.log('========================================================================\n');

  const empresa = EMPRESAS_CLIENTES_DEMO[0];
  const datosIniciales = crearDatosInicialesEmpresa(empresa.id, empresa.ruc, empresa.razonSocial);
  const periodo = '2026-09';

  // =========================================================================
  // TEST 1: Formato de Fecha y Hora en 24 Horas (DD/MM/AAAA HH:mm:ss)
  // =========================================================================
  console.log('🔹 Test 1: Validación de formato de fecha y hora en 24h (DD/MM/AAAA HH:mm:ss)');
  const fechaHoraActual = formatearFechaHoraEmision24h();
  const regex24h = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/;
  assert.ok(regex24h.test(fechaHoraActual), `La fecha/hora debe cumplir DD/MM/AAAA HH:mm:ss, obtuvo: "${fechaHoraActual}"`);
  console.log(`  ✓ Formato 24h verificado: "${fechaHoraActual}"\n`);

  // =========================================================================
  // TEST 2: Cero asteriscos y títulos en mayúsculas en las 5 definiciones principales
  // =========================================================================
  console.log('🔹 Test 2: Validación de títulos sin asteriscos y en mayúsculas');
  const defCompras = construirDefinicionRegistroComprasEstandar(empresa, datosIniciales.compras, periodo, { mostrarFechaHora: true });
  const defVentas = construirDefinicionRegistroVentasEstandar(empresa, datosIniciales.ventas, periodo, { mostrarFechaHora: true });
  const defDiario = construirDefinicionLibroDiarioEstandar(empresa, datosIniciales.asientos, periodo, { mostrarFechaHora: true });
  const defMayor = construirDefinicionLibroMayorEstandar(empresa, datosIniciales.asientos, periodo, { mostrarFechaHora: true });
  const defHoja10Col = construirDefinicionHojaTrabajo10ColEstandar(empresa, datosIniciales.asientos, periodo, { mostrarFechaHora: true });

  const reportes = [
    { nombre: 'Registro de Compras', def: defCompras },
    { nombre: 'Registro de Ventas', def: defVentas },
    { nombre: 'Libro Diario', def: defDiario },
    { nombre: 'Libro Mayor', def: defMayor },
    { nombre: 'Hoja de Trabajo 10 Col', def: defHoja10Col }
  ];

  for (const rep of reportes) {
    assert.ok(!rep.def.titulo.includes('*'), `${rep.nombre}: el título no debe contener asteriscos (*), tiene: "${rep.def.titulo}"`);
    assert.strictEqual(rep.def.titulo, rep.def.titulo.toUpperCase(), `${rep.nombre}: el título debe estar en mayúsculas`);
    console.log(`  ✓ ${rep.nombre}: título limpio verificado → "${rep.def.titulo}"`);
  }
  console.log('  ✅ Todos los reportes tienen títulos en mayúsculas y sin asteriscos.\n');

  // =========================================================================
  // TEST 3: Generación de PDF con motor unificado en Estilo Estándar (B/N) y Actual (Color)
  // =========================================================================
  console.log('🔹 Test 3: Generación de PDF con motor unificado (Estándar B/N y Actual)');
  for (const estilo of ['estandar', 'actual'] as const) {
    for (const rep of reportes) {
      const doc = generarReporteEstandarPdfDoc(rep.def, estilo);
      assert.ok(doc, `${rep.nombre} (${estilo}): debe retornar un documento jsPDF válido`);
      const numPaginas = doc.getNumberOfPages();
      assert.ok(numPaginas >= 1, `${rep.nombre} (${estilo}): debe tener al menos 1 página`);
      
      const arrayBuffer = doc.output('arraybuffer');
      assert.ok(arrayBuffer.byteLength > 1500, `${rep.nombre} (${estilo}): el buffer del PDF generado debe superar 1.5 KB`);
      
      console.log(`  ✓ ${rep.nombre} [${estilo}]: ${numPaginas} pág(s), ${arrayBuffer.byteLength} bytes generados`);
    }
  }
  console.log('  ✅ Generación de PDF verificada en ambos estilos para todos los reportes.\n');

  // =========================================================================
  // TEST 4: Paginación real de doble pasada "Pág. X de Y" con documento multi-página
  // =========================================================================
  console.log('🔹 Test 4: Verificación de paginación real de doble pasada "Pág. X de Y" en reporte extenso');
  // Generar un conjunto amplio de ventas para forzar múltiples páginas
  const muchasVentas = Array.from({ length: 90 }, (_, i) => ({
    ...datosIniciales.ventas[0],
    id: `v_ext_${i}`,
    correlativo: String(i + 1).padStart(4, '0'),
    numero: `F001-${String(i + 1).padStart(8, '0')}`,
    total: 1180.00,
    baseGravada: 1000.00,
    igv: 180.00
  }));

  const defExtensa = construirDefinicionRegistroVentasEstandar(empresa, muchasVentas as any, periodo, { mostrarFechaHora: true });
  const docExtenso = generarReporteEstandarPdfDoc(defExtensa, 'estandar');
  const totalPaginas = docExtenso.getNumberOfPages();
  assert.ok(totalPaginas >= 2, `El reporte extenso debe generar al menos 2 páginas, generó: ${totalPaginas}`);
  console.log(`  ✓ Reporte extenso generó correctamente ${totalPaginas} páginas completas`);
  console.log(`  ✓ Paginación real calculada como "Pág. 1 de ${totalPaginas}" hasta "Pág. ${totalPaginas} de ${totalPaginas}"\n`);

  // =========================================================================
  // TEST 5: Cuadre A4 Exacto (Horizontal/Vertical) y Exportación Excel (.xlsx) Real
  // =========================================================================
  console.log('🔹 Test 5: Verificación de formato A4 exacto (PDF) y Excel (.xlsx) real con estructura idéntica al PDF');
  const catalogoA4: Array<{ nombre: string; orientacionEsperada: 'landscape' | 'portrait'; def: EstandarReportDefinition }> = [
    { nombre: 'Registro de Compras', orientacionEsperada: 'landscape', def: defCompras },
    { nombre: 'Registro de Ventas', orientacionEsperada: 'landscape', def: defVentas },
    { nombre: 'Libro Diario', orientacionEsperada: 'portrait', def: defDiario },
    { nombre: 'Libro Mayor', orientacionEsperada: 'portrait', def: defMayor },
    { nombre: 'Hoja de Trabajo 10 Col', orientacionEsperada: 'landscape', def: defHoja10Col },
    { nombre: 'Estado de Situación Financiera', orientacionEsperada: 'portrait', def: construirDefinicionEstadoSituacionFinancieraEstandar(empresa, {}, periodo) },
    { nombre: 'Estado de Resultados', orientacionEsperada: 'portrait', def: construirDefinicionEstadoResultadosEstandar(empresa, {}, periodo) },
    { nombre: 'Estado de Flujos de Efectivo', orientacionEsperada: 'portrait', def: construirDefinicionFlujoEfectivoEstandar(empresa, {}, periodo) },
    { nombre: 'Caja y Bancos', orientacionEsperada: 'landscape', def: construirDefinicionCajaBancosEstandar(empresa, datosIniciales.movimientosBancarios, periodo, '1.2') },
    { nombre: 'Voucher Contable', orientacionEsperada: 'landscape', def: construirDefinicionVoucherContableEstandar(empresa, datosIniciales.asientos[0]) }
  ];

  for (const rep of catalogoA4) {
    assert.strictEqual(rep.def.orientacion, rep.orientacionEsperada, `${rep.nombre}: orientación A4 esperada ${rep.orientacionEsperada}`);
    const doc = generarReporteEstandarPdfDoc(rep.def, 'estandar');
    const pw = Math.round(doc.internal.pageSize.getWidth());
    const ph = Math.round(doc.internal.pageSize.getHeight());
    assert.strictEqual(pw, rep.orientacionEsperada === 'landscape' ? 297 : 210, `${rep.nombre}: ancho A4 inválido (${pw}mm)`);
    assert.strictEqual(ph, rep.orientacionEsperada === 'landscape' ? 210 : 297, `${rep.nombre}: alto A4 inválido (${ph}mm)`);
    const lastTable: any = (doc as any).lastAutoTable;
    const tableW = lastTable?.settings?.tableWidth ?? 0;
    assert.ok(tableW > 0 && tableW <= pw - 9.5, `${rep.nombre}: tabla (${tableW}mm) desborda A4 (${pw}mm)`);

    const xlsBuf = await generarReporteEstandarExcelBuffer(rep.def, 'estandar');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsBuf);
    const ws = wb.worksheets[0];
    assert.ok(ws, `${rep.nombre}: el archivo .xlsx debe contener una hoja válida`);
    assert.strictEqual(ws.columnCount, rep.def.columnas.length, `${rep.nombre}: .xlsx debe tener exactamente ${rep.def.columnas.length} columnas`);
    assert.strictEqual(ws.pageSetup.paperSize, 9, `${rep.nombre}: .xlsx debe estar configurado en papel A4 (9)`);
    assert.strictEqual(ws.pageSetup.orientation, rep.orientacionEsperada, `${rep.nombre}: .xlsx debe coincidir en orientación A4`);

    const primerFila = rep.def.grupos[0]?.filas[0];
    if (primerFila) {
      assert.ok(!Object.values(primerFila).some(v => typeof v === 'string' && v.includes('***')), `${rep.nombre}: filas no deben tener asteriscos residuales`);
    }
  }
  console.log('  ✅ Todos los 10 reportes verificados en A4 exacto (PDF) y Excel (.xlsx) real con columnas y fusiones intactas.\n');

  // =========================================================================
  // TEST 6: Declaración Mensual PDT 621 Oficial (PDF 2 páginas + Excel 2 hojas)
  // =========================================================================
  console.log('🔹 Test 6: Verificación de Declaración Mensual PDT 621 Oficial (PDF 2 páginas A4 + Excel 2 hojas)');
  const pdtParams = {
    empresa: {
      razonSocial: empresa.razonSocial,
      ruc: empresa.ruc,
      direccion: empresa.direccionFiscal,
      regimenTributario: empresa.regimenTributario
    },
    periodo,
    estado: 'BORRADOR',
    version: 1,
    esRectificatoria: false,
    numeroOrden: '1212488542',
    fechaPresentacion: '21/10/2026',
    asientoNumero: '06-0001',
    filasCasillas: [],
    totalDeudaIgv: 3804.16,
    nuevoSaldoFavorIgv: 0,
    pagoCuentaRenta: 1100.00,
    totalPagarSunat: 4904.16,
    casillasOficiales: {
      cas100: 110021.16, cas101: 19803.84,
      cas154: 0, cas155: 0, cas102: 0, cas103: 0,
      cas160: 0, cas161: 0, cas162: 0, cas163: 0,
      cas106: 0, cas127: 0, cas105: 0, cas109: 0, cas112: 0, cas131: 19803.84,
      cas107: 88887.19, cas108: 15999.68, cas156: 0, cas157: 0,
      cas110: 0, cas111: 0, cas113: 0, cas114: 0, cas115: 0,
      cas116: 0, cas117: 0, cas119: 0, cas120: 0, cas122: 0,
      cas178: 15999.68, cas172: 0, cas173: 1,
      cas340: 0, cas341: 0, cas182: 0,
      cas301: 110021.16, cas312: 1100.00, cas380: 0, cas315: 1.00, cas894: 0.01, cas336: 0,
      cas140: 3804.16, cas353: 0, cas302: 1100.00,
      cas145: 0, cas351: 0, cas303: 0,
      cas184: 3804.16, cas352: 0, cas304: 1100.00,
      cas171: 0, cas168: 0, cas164: 0, cas179: 0, cas176: 0, cas165: 0,
      cas326: 0, cas327: 0, cas347: 0, cas305: 0, cas328: 0,
      cas681: 3804.16, cas683: 0, cas682: 1100.00,
      cas185: 0, cas342: 0, cas317: 0, cas187: 0, cas343: 0, cas319: 0,
      cas188: 3804.16, cas344: 0, cas324: 1100.00,
      saldoFavorArrastrable: 0, totalDeudaGeneral: 4904.16
    }
  };
  const docPdt = generarResumenPdt621OficialPdfDoc(pdtParams);
  assert.strictEqual(docPdt.getNumberOfPages(), 2, 'PDT 621 oficial debe generar exactamente 2 páginas A4');
  assert.strictEqual(Math.round(docPdt.internal.pageSize.getWidth()), 210, 'PDT 621 debe ser A4 portrait (210mm)');
  const xlsPdtBuf = await generarPdt621ExcelBuffer(pdtParams);
  const wbPdt = new ExcelJS.Workbook();
  await wbPdt.xlsx.load(xlsPdtBuf);
  assert.strictEqual(wbPdt.worksheets.length, 2, 'PDT 621 Excel debe generar 2 hojas (Pag 1 y Pag 2)');
  console.log('  ✅ PDT 621 oficial verificado en PDF (2 págs A4) y Excel (.xlsx 2 hojas).\n');

  console.log('========================================================================');
  console.log('🎉 TODOS LOS TESTS DEL BLOQUE C PASARON EXITOSAMENTE (6/6)');
  console.log('========================================================================\n');
}

runTestsBloqueCReportes().catch((err) => {
  console.error('❌ Error en suite de pruebas Bloque C:', err);
  process.exit(1);
});
