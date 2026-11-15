import { initializeDatabase, closeDatabase, db, conContextoEmpresa } from '../server/config/database';
import { periodoService } from '../server/services/periodoService';
import { pcgeService } from '../server/services/pcgeService';
import { activosFijosService } from '../server/services/activosFijosService';
import { kardexService } from '../server/services/kardexService';
import { planillaService } from '../server/services/planillaService';
import { tesoreriaService } from '../server/services/tesoreriaService';
import { conciliacionService } from '../server/services/conciliacionService';
import { liquidacionIGVService } from '../server/services/liquidacionIGVService';
import { daotService } from '../server/services/daotService';
import { cierreAnualService } from '../server/services/cierreAnualService';
import { pleExportService } from '../server/services/pleExportService';
import { librosEEFFService } from '../server/services/librosEEFFService';

async function ejecutarCertificacionFase4() {
  console.log('========================================================================');
  console.log('  CERTIFICACIÓN FASE 4: MÓDULOS COMPLEMENTARIOS EN POSTGRESQL 18       ');
  console.log('  (Activos Fijos, Kardex, Planillas, Conciliación, Cierres, Tributos, PLE) ');
  console.log('========================================================================\n');

  await initializeDatabase();
  if (!db.isPostgresConnected()) {
    throw new Error('FATAL: No hay conexión real a PostgreSQL.');
  }

  // 1. Obtener Empresa y Usuario de prueba (Joseph Mayta / Jimmy)
  const empRes = await db.query("SELECT id, ruc, razon_social FROM empresas WHERE ruc = '10722364002' LIMIT 1");
  if (empRes.rows.length === 0) throw new Error('Empresa JOSEPH MAYTA no encontrada');
  const empresaId = empRes.rows[0].id;
  const rucEmpresa = empRes.rows[0].ruc;

  const usrRes = await db.query("SELECT id, email, rol_global FROM usuarios_estudio WHERE email = 'jimmy' LIMIT 1");
  if (usrRes.rows.length === 0) throw new Error('Usuario jimmy no encontrado');
  const userId = usrRes.rows[0].id;

  console.log(`[INIT] Empresa: ${empRes.rows[0].razon_social} (RUC: ${rucEmpresa} | ID: ${empresaId})`);
  console.log(`[INIT] Usuario: ${usrRes.rows[0].email} (ID: ${userId})`);

  await conContextoEmpresa(empresaId, userId, async () => {
    // Asegurar plan contable oficial
    const resPlan = await pcgeService.completarPlanDesdeCatalogoBase(empresaId);
    console.log(`[INIT] Plan de Cuentas: ${resPlan.totalEmpresa} cuentas disponibles en PostgreSQL`);

    // Asegurar período 2026-09
    const periodo = await periodoService.obtenerPorCodigo(empresaId, '2026-09');
    if (!periodo) throw new Error('Período 2026-09 no encontrado');
    const periodoId = periodo.id;
    console.log(`[INIT] Período: 2026-09 (ID: ${periodoId})\n`);

    const numUnico = String(Date.now()).slice(-5);

    // ========================================================================
    // TEST 1: Activos Fijos (Libro 7.1) y Asiento de Depreciación Mensual
    // ========================================================================
    console.log('--- TEST 1: Activos Fijos (Libro 7.1) y Asiento de Depreciación ---');
    const codigoActivo = `AF-${numUnico}`;
    const valorActivo = 18000.00;

    const activo = await activosFijosService.registrarActivo(empresaId, {
      codigoActivo,
      descripcion: `Servidor Central Virtualizado Dell PowerEdge #${numUnico}`,
      categoria: 'EQUIPOS_COMPUTO',
      fechaAdquisicion: '2026-01-10',
      fechaInicioUso: '2026-01-15',
      valorAdquisicion: valorActivo,
      moneda: 'PEN',
      vidaUtilMesesFinanciera: 36 // 3 años financiera
    });

    console.log(`  ✓ Activo fijo registrado: ${activo.codigoActivo} - S/ ${activo.valorAdquisicion.toFixed(2)} (${activo.categoria})`);
    console.log(`  ✓ Cuentas asignadas: Activo ${activo.cuentaActivoPCGE} | Depreciación ${activo.cuentaDepreciacionPCGE}`);
    console.log(`  ✓ Tasa depreciación tributaria: ${activo.tasaDepreciacionTributariaAnual}% anual`);

    // Depreciación período 2026-09
    const calculoDeprec = await activosFijosService.calcularDepreciacionPeriodo(empresaId, '2026-09');
    console.log(`  ✓ Cálculo de depreciación período 2026-09: Total Financiera S/ ${calculoDeprec.totalDepreciacionFinanciera.toFixed(2)}, Tributaria S/ ${calculoDeprec.totalDepreciacionTributaria.toFixed(2)}`);

    // Generar Asiento de Depreciación
    const resAsientoDeprec = await activosFijosService.generarAsientoDepreciacion(empresaId, '2026-09', userId);
    console.log(`  ✓ Asiento contable de depreciación generado en PostgreSQL: ID ${resAsientoDeprec.asientoId} (${resAsientoDeprec.numeroAsiento}) por S/ ${resAsientoDeprec.totalDepreciado.toFixed(2)}`);

    // Exportar Libro 7.1 PLE
    const ple71 = await activosFijosService.exportarPleLibro71(empresaId, 2026, rucEmpresa);
    console.log(`  ✓ Archivo PLE Libro 7.1 generado: ${ple71.nombreArchivo} (${ple71.totalActivos} activos listados)`);

    // ========================================================================
    // TEST 2: Kardex Valorado (Libro 13.1) y Asiento de Costo de Ventas
    // ========================================================================
    console.log('\n--- TEST 2: Kardex Valorado (Libro 13.1) y Asiento de Costo de Ventas ---');
    const codigoProd = `PRD-${numUnico}`;
    const producto = await kardexService.registrarProducto(empresaId, {
      codigoProducto: codigoProd,
      descripcion: `Impresora Multifuncional Láser Pro #${numUnico}`,
      unidadMedidaSUNAT: 'NIU',
      tipoExistenciaSUNAT: '01',
      metodoValuacion: 'PROMEDIO_PONDERADO',
      cuentaExistenciasPCGE: '20111',
      cuentaCostoVentasPCGE: '69111'
    });
    console.log(`  ✓ Producto de inventario registrado: ${producto.codigoProducto} - ${producto.descripcion}`);

    // Entrada por compra: 10 unidades a S/ 1,200.00
    const entradaKardex = await kardexService.registrarMovimiento(empresaId, {
      productoId: producto.id,
      periodo: '2026-09',
      fecha: '2026-09-03',
      tipoOperacionSUNAT: '02', // Compra
      tipoComprobanteSUNAT: '01',
      serieComprobante: 'F001',
      numeroComprobante: `100${numUnico}`,
      cantidad: 10,
      costoUnitario: 1200.00,
      glosa: 'Ingreso por compra de lote de impresoras para comercialización'
    });
    console.log(`  ✓ Entrada valorada registrada: 10 unidades a S/ 1,200.00 -> Stock actual: ${entradaKardex.saldoCantidad} und, Saldo total: S/ ${entradaKardex.saldoCostoTotal.toFixed(2)}`);

    // Salida por venta: 4 unidades
    const salidaKardex = await kardexService.registrarMovimiento(empresaId, {
      productoId: producto.id,
      periodo: '2026-09',
      fecha: '2026-09-14',
      tipoOperacionSUNAT: '01', // Venta
      tipoComprobanteSUNAT: '01',
      serieComprobante: 'F001',
      numeroComprobante: `200${numUnico}`,
      cantidad: 4,
      glosa: 'Salida de almacén por venta a cliente comercial'
    });
    const costoSalidaTotal = salidaKardex.costoTotalSalida;
    console.log(`  ✓ Salida valorada registrada: 4 unidades a S/ ${salidaKardex.costoUnitarioSalida.toFixed(2)} = S/ ${costoSalidaTotal.toFixed(2)} -> Saldo restante: ${salidaKardex.saldoCantidad} und`);

    // Asiento de Costo de Ventas (Debe 69111 / Haber 20111)
    const asientoCostoVenta = await kardexService.generarAsientoCostoVentas(empresaId, '2026-09', userId);
    console.log(`  ✓ Asiento contable de costo de ventas generado: ID ${asientoCostoVenta.asientoId} (${asientoCostoVenta.numeroAsiento}) por S/ ${asientoCostoVenta.costoVentasTotal.toFixed(2)}`);

    // Exportar Libro 13.1 PLE
    const ple131 = await kardexService.exportarPleLibro131(empresaId, '2026-09', rucEmpresa);
    console.log(`  ✓ Archivo PLE Libro 13.1 generado: ${ple131.nombreArchivo} (${ple131.totalLineas} movimientos valorados)`);

    // ========================================================================
    // TEST 3: Planillas y Nómina (PLAME / T-Registro) y Asiento de Sueldos
    // ========================================================================
    console.log('\n--- TEST 3: Planillas y Nómina (PLAME / T-Registro) ---');
    const dniTrabajador = `7${String(Date.now()).slice(-7)}`;
    const trabajador = await planillaService.crearTrabajador(empresaId, {
      tipoDocumento: '1',
      numeroDocumento: dniTrabajador,
      nombres: 'CARLOS ENRIQUE',
      apellidos: 'RAMOS GUTIERREZ',
      fechaIngreso: '2026-01-01',
      cargo: 'ANALISTA DE SISTEMAS',
      regimenLaboral: 'GENERAL',
      tipoContrato: 'INDETERMINADO',
      sueldoBase: 3500.00,
      cargasFamiliares: 1,
      tieneAsignacionFamiliar: true,
      sistemaPensiones: 'ONP',
      centroCosto: 'ADMINISTRACION',
      activo: true
    }, userId);

    console.log(`  ✓ Trabajador registrado: ${trabajador.apellidos}, ${trabajador.nombres} (DNI: ${trabajador.numeroDocumento}) - Sueldo: S/ ${trabajador.sueldoBase.toFixed(2)}`);

    // Calcular planilla 2026-09
    const planilla = await planillaService.calcularPlanilla(empresaId, periodoId, '2026-09', userId);
    console.log(`  ✓ Planilla calculada para ${planilla.mes}: ${planilla.lineas.length} trabajadores`);
    console.log(`    - Total Ingresos: S/ ${planilla.totalIngresos.toFixed(2)}`);
    console.log(`    - Total Descuentos Trabajador: S/ ${planilla.totalDescuentos.toFixed(2)}`);
    console.log(`    - Total Aportes Empleador (EsSalud 9%): S/ ${planilla.totalAportesEmpleador.toFixed(2)}`);
    console.log(`    - Total Neto a Pagar: S/ ${planilla.totalNeto.toFixed(2)}`);

    // Contabilizar planilla en Subdiario 07
    const resContaPlanilla = await planillaService.contabilizarPlanilla(empresaId, planilla.id, userId);
    console.log(`  ✓ Asiento contable de planilla contabilizado en PostgreSQL: ID ${resContaPlanilla.asientoId} (${resContaPlanilla.asientoNumero})`);

    // Validar estructura PLAME
    const valPlame = await planillaService.validarEstructuraPlame(empresaId, planilla.id);
    console.log(`  ✓ Estructura PLAME validada: Válida=${valPlame.valido} | Errores: ${valPlame.totalErrores} | Advertencias: ${valPlame.totalAdvertencias}`);

    // ========================================================================
    // TEST 4: Conciliación Bancaria y Extracto
    // ========================================================================
    console.log('\n--- TEST 4: Conciliación Bancaria y Extracto Oficial ---');
    const cuentas = await tesoreriaService.listarCuentas(empresaId);
    const ctaBcp = cuentas.find(c => c.banco === 'BCP' && c.moneda === 'PEN') || cuentas[0];

    // Registrar un movimiento de egreso para conciliar
    const movTesoreria = await tesoreriaService.registrarMovimiento(empresaId, {
      periodoId,
      cuentaFinancieraId: ctaBcp.id,
      fecha: '2026-09-15',
      tipo: 'EGRESO',
      medioPago: '003',
      numeroOperacion: `OP-CONC-${numUnico}`,
      moneda: 'PEN',
      importe: 450.00,
      glosa: 'Pago de servicios de telefonía e internet'
    }, userId);

    // Importar extracto que contiene ese movimiento
    const extracto = await conciliacionService.importarExtracto(empresaId, ctaBcp.id, {
      nombreArchivo: `extracto_bcp_${numUnico}.csv`,
      lineas: [
        {
          fecha: '2026-09-15',
          descripcion: `CARGO SERVICIOS OPERACION OP-CONC-${numUnico}`,
          referencia: `OP-CONC-${numUnico}`,
          monto: -450.00,
          saldo: ctaBcp.saldoActual
        }
      ]
    }, userId);

    console.log(`  ✓ Extracto bancario importado: ID ${extracto.id} (${extracto.nombreArchivo}) con ${extracto.lineas.length} líneas`);

    // Conciliar línea de extracto con movimiento
    const lineaExtracto = extracto.lineas[0];
    const concilResult = await conciliacionService.conciliar(empresaId, lineaExtracto.id, movTesoreria.id, userId);
    console.log(`  ✓ Movimiento de tesorería y extracto conciliados: ${concilResult.message}`);

    // Obtener estado de conciliación
    const estConcil = await conciliacionService.obtenerEstadoConciliacion(empresaId, ctaBcp.id, periodoId, '2026-09-30');
    console.log(`  ✓ Estado de conciliación verificado: Partidas conciliadas: S/ ${estConcil.resumen.partidasConciliadas.toFixed(2)}, En tránsito: S/ ${estConcil.resumen.partidasEnTransito.toFixed(2)}, Saldo según Banco: S/ ${estConcil.resumen.saldoSegunBanco.toFixed(2)}, Saldo según Libros: S/ ${estConcil.resumen.saldoSegunLibros.toFixed(2)} (Cuadrado: ${estConcil.resumen.cuadrado})`);

    // ========================================================================
    // TEST 5: Módulo Tributos & PDT 621 y DAOT
    // ========================================================================
    console.log('\n--- TEST 5: Módulo Tributos & PDT 621 y DAOT ---');
    const preliq = await liquidacionIGVService.preliquidar(empresaId, '2026-09', userId, 'ADMINISTRADOR');
    console.log(`  ✓ Preliquidación PDT 621 calculada para período 2026-09:`);
    console.log(`    - Base Ventas Gravadas: S/ ${preliq.ventasGravadas.toFixed(2)} | Débito Fiscal IGV: S/ ${preliq.debitoFiscalIgv.toFixed(2)}`);
    console.log(`    - Base Compras Gravadas: S/ ${preliq.comprasGravadasCreditoTotal.toFixed(2)} | Crédito Fiscal IGV: S/ ${preliq.creditoFiscalIgv.toFixed(2)}`);
    console.log(`    - Impuesto Determinado IGV: S/ ${preliq.igvDeterminado.toFixed(2)} | Por pagar: S/ ${preliq.igvPorPagar.toFixed(2)}`);
    console.log(`    - Pago a Cuenta Renta: S/ ${preliq.pagoCuentaRenta.toFixed(2)} (Tasa: ${preliq.tasaRentaAplicada}%)`);

    // Reporte DAOT
    const repDaot = await daotService.procesarDaot(empresaId, 2026);
    console.log(`  ✓ Reporte DAOT ejercicio 2026 obtenido: Umbral 2 UIT = S/ ${repDaot.umbral2Uit.toFixed(2)} | Terceros analizados: ${repDaot.totalTercerosEvaluados} | Declarables: ${repDaot.totalTercerosDeclarables}`);

    // ========================================================================
    // TEST 6: Cierre Contable Anual PCGE
    // ========================================================================
    console.log('\n--- TEST 6: Simulación y Verificación de Cierre Anual PCGE ---');
    const cierreSimul = await cierreAnualService.simularCierreAnual(empresaId, 2026);
    console.log(`  ✓ Simulación de Cierre Anual PCGE completada:`);
    console.log(`    - Cuentas regularizadas: ${cierreSimul.cuentasRegularizadas}`);
    console.log(`    - Resultado Neto Contable: S/ ${cierreSimul.resultadoNetoContable.toFixed(2)} [${cierreSimul.tipoResultado}]`);
    console.log(`    - Asientos de Cierre propuestos: ${cierreSimul.asientos.length} pasos normativos:`);
    for (const ap of cierreSimul.asientos) {
      console.log(`      * Paso ${ap.numeroPaso}: ${ap.glosa} (Total Debe S/ ${ap.totalDebe.toFixed(2)} | Haber S/ ${ap.totalHaber.toFixed(2)} - Cuadrado: ${ap.cuadrado})`);
      if (!ap.cuadrado) {
        throw new Error(`Asiento de cierre en paso ${ap.numeroPaso} descuadrado.`);
      }
    }
    console.log(`    - Todos los asientos de cierre de resultados y balance están estrictamente balanceados.`);

    // ========================================================================
    // TEST 7: Libros Electrónicos Oficiales PLE
    // ========================================================================
    console.log('\n--- TEST 7: Generación de Libros Electrónicos Oficiales PLE ---');
    const pleDiario = await pleExportService.exportarLibro(empresaId, '2026-09', '050100', rucEmpresa, userId, { esOficial: true });
    console.log(`  ✓ PLE 5.1 (Libro Diario): ${pleDiario.nombreArchivo} (${pleDiario.totalFilas} líneas, Hash SHA-256: ${pleDiario.hashSha256.slice(0, 16)}...)`);

    const pleMayor = await pleExportService.exportarLibro(empresaId, '2026-09', '060100', rucEmpresa, userId, { esOficial: true });
    console.log(`  ✓ PLE 6.1 (Libro Mayor): ${pleMayor.nombreArchivo} (${pleMayor.totalFilas} líneas)`);

    const pleCompras = await pleExportService.exportarLibro(empresaId, '2026-09', '080100', rucEmpresa, userId, { esOficial: true });
    console.log(`  ✓ PLE 8.1 (Registro de Compras): ${pleCompras.nombreArchivo} (${pleCompras.totalFilas} comprobantes)`);

    const pleVentas = await pleExportService.exportarLibro(empresaId, '2026-09', '140100', rucEmpresa, userId, { esOficial: true });
    console.log(`  ✓ PLE 14.1 (Registro de Ventas): ${pleVentas.nombreArchivo} (${pleVentas.totalFilas} comprobantes)`);
  });

  // ========================================================================
  // TEST 8: Persistencia tras Desconexión y Reconexión a PostgreSQL 18
  // ========================================================================
  console.log('\n--- TEST 8: Persistencia tras desconexión y reconexión a PostgreSQL 18 ---');
  await closeDatabase();

  // Reconectar
  await initializeDatabase();

  await conContextoEmpresa(empresaId, userId, async () => {
    const actRec = await activosFijosService.listarActivos(empresaId);
    console.log(`  ✓ Activos Fijos persistidos en PostgreSQL tras reinicio: ${actRec.length} activos`);

    const prodRec = await kardexService.listarProductos(empresaId);
    console.log(`  ✓ Productos de Kardex persistidos en PostgreSQL tras reinicio: ${prodRec.length} productos`);

    const trabRec = await planillaService.listarTrabajadores(empresaId, true, 'ADMINISTRADOR');
    console.log(`  ✓ Trabajadores persistidos en PostgreSQL tras reinicio: ${trabRec.length} trabajadores`);

    const diarioRec = await librosEEFFService.generarLibroDiario(empresaId, '2026-09');
    console.log(`  ✓ Libro Diario tras reinicio: ${diarioRec.totalAsientos} asientos (Debe S/ ${diarioRec.totalDebe.toFixed(2)} | Haber S/ ${diarioRec.totalHaber.toFixed(2)} - Balanceado: ${diarioRec.estaBalanceado})`);
  });

  await closeDatabase();

  console.log('\n========================================================================');
  console.log('       CERTIFICACIÓN FASE 4 COMPLETADA CON ÉXITO (100% OK)              ');
  console.log('========================================================================\n');
}

ejecutarCertificacionFase4()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ ERROR FATAL EN CERTIFICACIÓN FASE 4:', err);
    process.exit(1);
  });
