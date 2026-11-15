import { initializeDatabase, closeDatabase, db, conContextoEmpresa } from '../server/config/database';
import { compraService } from '../server/services/compraService';
import { ventaService } from '../server/services/ventaService';
import { tesoreriaService } from '../server/services/tesoreriaService';
import { periodoService } from '../server/services/periodoService';
import { pcgeService } from '../server/services/pcgeService';
import { librosEEFFService } from '../server/services/librosEEFFService';
import { anexoService } from '../server/services/anexoService';

async function ejecutarCertificacionFase3() {
  console.log('========================================================================');
  console.log('  CERTIFICACIÓN FASE 3: COMPRAS, VENTAS, CARTERA, TESORERÍA Y LIBROS/EEFF ');
  console.log('========================================================================\n');

  await initializeDatabase();
  if (!db.isPostgresConnected()) {
    throw new Error('FATAL: No hay conexión real a PostgreSQL.');
  }

  // 1. Obtener Empresa y Usuario de prueba (Joseph Mayta / Jimmy)
  const empRes = await db.query("SELECT id, ruc, razon_social FROM empresas WHERE ruc = '10722364002' LIMIT 1");
  if (empRes.rows.length === 0) throw new Error('Empresa JOSEPH MAYTA no encontrada');
  const empresaId = empRes.rows[0].id;

  const usrRes = await db.query("SELECT id, email, rol_global FROM usuarios_estudio WHERE email = 'jimmy' LIMIT 1");
  if (usrRes.rows.length === 0) throw new Error('Usuario jimmy no encontrado');
  const userId = usrRes.rows[0].id;

  console.log(`[INIT] Empresa: ${empRes.rows[0].razon_social} (ID: ${empresaId})`);
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

    // Cuentas financieras de la empresa
    const cuentas = await tesoreriaService.listarCuentas(empresaId);
    const ctaBcp = cuentas.find(c => c.banco === 'BCP' && c.moneda === 'PEN') || cuentas[0];
    const ctaCaja = cuentas.find(c => c.tipo === 'CAJA') || cuentas[1];

    // Asegurar Anexos (Proveedor y Cliente)
    const provs = await anexoService.listar(empresaId, { tipoEntidad: 'PROVEEDOR' });
    let proveedor = provs[0];
    if (!proveedor) {
      proveedor = await anexoService.crear(empresaId, {
        tipoDocumento: '6',
        numeroDocumento: '20501234567',
        razonSocial: 'DISTRIBUIDORA MAYORISTA LIMA S.A.C.',
        tipoEntidad: 'PROVEEDOR',
        condicionSunat: 'HABIDO',
        estadoSunat: 'ACTIVO'
      });
    }
    const proveedorId = proveedor.id;

    const clis = await anexoService.listar(empresaId, { tipoEntidad: 'CLIENTE' });
    let cliente = clis[0];
    if (!cliente) {
      cliente = await anexoService.crear(empresaId, {
        tipoDocumento: '6',
        numeroDocumento: '20609876543',
        razonSocial: 'COMERCIAL SAN PEDRO S.A.C.',
        tipoEntidad: 'CLIENTE',
        condicionSunat: 'HABIDO',
        estadoSunat: 'ACTIVO'
      });
    }
    const clienteId = cliente.id;

    const numUnico = String(Date.now()).slice(-6);

    // ------------------------------------------------------------------------
    // TEST 1: Registro de Factura de Compra de Mercadería a Crédito
    // ------------------------------------------------------------------------
    console.log('--- TEST 1: Registro de Factura de Compra a Crédito y Asiento en Subdiario 01 ---');
    const serieCompra = 'F001';
    const numeroCompra = numUnico;
    const baseCompra = 10000.00;
    const igvCompra = 1800.00;
    const totalCompra = 11800.00;

    const compra = await compraService.registrar(empresaId, {
      periodoId,
      fechaEmision: '2026-09-05',
      fechaVencimiento: '2026-10-05',
      fechaContable: '2026-09-05',
      tipoComprobante: '01',
      serie: serieCompra,
      numero: numeroCompra,
      proveedorId,
      moneda: 'PEN',
      tipoCambio: 3.75,
      baseGravada: baseCompra,
      igv: igvCompra,
      total: totalCompra,
      tipoAdquisicion: '1',
      formaPago: 'CREDITO',
      diasCredito: 30,
      glosa: 'Compra de mercaderías para stock almacén'
    }, userId);

    console.log(`  ✓ Factura de compra registrada: ID ${compra.id} (${serieCompra}-${numeroCompra})`);
    console.log(`  ✓ Asiento contable de compras generado: ${compra.asientoId}`);

    // Verificar en PostgreSQL (comprobantes_compra y cuentas_por_pagar)
    const cxpCheck = await db.query(
      "SELECT id, importe_original, saldo, estado FROM cuentas_por_pagar WHERE comprobante_id = $1 AND empresa_id = $2",
      [compra.id, empresaId]
    );
    if (cxpCheck.rows.length === 0) throw new Error('Cuenta por pagar no persistió en PostgreSQL');
    const cxpId = cxpCheck.rows[0].id;
    const cxpSaldo = Number(cxpCheck.rows[0].saldo);
    if (cxpSaldo !== totalCompra) throw new Error(`Saldo CxP inválido. Esperado: ${totalCompra}, Real: ${cxpSaldo}`);
    console.log(`  ✓ Cuenta por Pagar creada en PostgreSQL: ID ${cxpId} - Saldo: S/ ${cxpSaldo.toFixed(2)} [${cxpCheck.rows[0].estado}]`);

    // Verificar Registro de Compras
    const regCompras = await compraService.obtenerRegistroCompras(empresaId, periodoId);
    const encontradoRC = regCompras.comprobantes.some(c => c.serie === serieCompra && c.numero === numeroCompra);
    if (!encontradoRC) throw new Error('Factura de compra no figura en el Registro de Compras oficial');
    console.log(`  ✓ Comprobante verificado en Registro de Compras (PLE 8.1): Total Base: S/ ${regCompras.totales.adquisicionesGravadasCreditoTotal.toFixed(2)}, IGV: S/ ${regCompras.totales.totalIgv.toFixed(2)}`);

    // ------------------------------------------------------------------------
    // TEST 2: Pago total de la Factura de Compra desde Tesorería
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 2: Pago de Factura de Compra en Tesorería y Cancelación de CxP ---');
    const saldoAntesPago = ctaBcp.saldoActual;

    const pagoCompra = await tesoreriaService.registrarMovimiento(empresaId, {
      periodoId,
      cuentaFinancieraId: ctaBcp.id,
      fecha: '2026-09-10',
      tipo: 'EGRESO',
      medioPago: '003', // Transferencia
      numeroOperacion: `TRF-PAGO-${numUnico}`,
      moneda: 'PEN',
      importe: totalCompra,
      anexoId: proveedorId,
      glosa: `Pago factura ${serieCompra}-${numeroCompra} a Distribuidora Mayorista`,
      aplicaciones: [
        { documentoId: cxpId, importeAplicado: totalCompra }
      ]
    }, userId);

    console.log(`  ✓ Movimiento de pago registrado: ID ${pagoCompra.id} por S/ ${totalCompra.toFixed(2)}`);
    console.log(`  ✓ Asiento contable de egreso en Subdiario 04: ${pagoCompra.asientoId}`);

    // Verificar cancelación en PostgreSQL
    const cxpActualizada = await db.query(
      "SELECT saldo, estado FROM cuentas_por_pagar WHERE id = $1 AND empresa_id = $2",
      [cxpId, empresaId]
    );
    const saldoPostPago = Number(cxpActualizada.rows[0].saldo);
    const estadoPostPago = cxpActualizada.rows[0].estado;
    if (saldoPostPago !== 0 || estadoPostPago !== 'CANCELADO') {
      throw new Error(`Fallo en amortización de CxP. Saldo: ${saldoPostPago}, Estado: ${estadoPostPago}`);
    }
    console.log(`  ✓ Saldo CxP actualizado en PostgreSQL: S/ ${saldoPostPago.toFixed(2)} [${estadoPostPago}]`);

    // Verificar saldo de la cuenta bancaria
    const ctaBcpPostPago = await tesoreriaService.obtenerCuentaPorId(empresaId, ctaBcp.id);
    const saldoEsperadoBcp = Number((saldoAntesPago - totalCompra).toFixed(2));
    if (ctaBcpPostPago?.saldoActual !== saldoEsperadoBcp) {
      throw new Error(`Saldo bancario BCP no coincide tras pago. Esperado: ${saldoEsperadoBcp}, Real: ${ctaBcpPostPago?.saldoActual}`);
    }
    console.log(`  ✓ Saldo en cuenta BCP verificado: S/ ${ctaBcpPostPago.saldoActual.toFixed(2)} (Disminuyó S/ ${totalCompra.toFixed(2)})`);

    // ------------------------------------------------------------------------
    // TEST 3: Registro de Factura de Venta de Mercadería a Crédito
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 3: Registro de Factura de Venta a Crédito y Asiento en Subdiario 02 ---');
    const serieVenta = 'F001';
    const numeroVenta = numUnico;
    const baseVenta = 20000.00;
    const igvVenta = 3600.00;
    const totalVenta = 23600.00;

    const venta = await ventaService.registrar(empresaId, {
      periodoId,
      fechaEmision: '2026-09-12',
      fechaVencimiento: '2026-10-12',
      fechaContable: '2026-09-12',
      tipoComprobante: '01',
      serie: serieVenta,
      numero: numeroVenta,
      clienteId,
      moneda: 'PEN',
      tipoCambio: 3.75,
      baseGravada: baseVenta,
      igv: igvVenta,
      total: totalVenta,
      tipoOperacion: 'VENTA_INTERNA',
      formaPago: 'CREDITO',
      diasCredito: 30,
      glosa: 'Venta de mercaderías según pedido comercial'
    }, userId);

    console.log(`  ✓ Factura de venta registrada: ID ${venta.id} (${serieVenta}-${numeroVenta})`);
    console.log(`  ✓ Asiento contable de ventas generado: ${venta.asientoId}`);

    // Verificar en PostgreSQL (cuentas_por_cobrar)
    const cxcCheck = await db.query(
      "SELECT id, importe_original, saldo, estado FROM cuentas_por_cobrar WHERE comprobante_id = $1 AND empresa_id = $2",
      [venta.id, empresaId]
    );
    if (cxcCheck.rows.length === 0) throw new Error('Cuenta por cobrar no persistió en PostgreSQL');
    const cxcId = cxcCheck.rows[0].id;
    const cxcSaldo = Number(cxcCheck.rows[0].saldo);
    if (cxcSaldo !== totalVenta) throw new Error(`Saldo CxC inválido. Esperado: ${totalVenta}, Real: ${cxcSaldo}`);
    console.log(`  ✓ Cuenta por Cobrar creada en PostgreSQL: ID ${cxcId} - Saldo: S/ ${cxcSaldo.toFixed(2)} [${cxcCheck.rows[0].estado}]`);

    // Verificar Registro de Ventas
    const regVentas = await ventaService.obtenerRegistroVentas(empresaId, periodoId);
    const encontradoRV = regVentas.comprobantes.some(c => c.serie === serieVenta && c.numero === numeroVenta);
    if (!encontradoRV) throw new Error('Factura de venta no figura en el Registro de Ventas oficial');
    console.log(`  ✓ Comprobante verificado en Registro de Ventas (PLE 14.1): Total Base: S/ ${regVentas.totales.totalBaseGravada.toFixed(2)}, IGV: S/ ${regVentas.totales.totalIgv.toFixed(2)}`);

    // ------------------------------------------------------------------------
    // TEST 4: Cobranza en Dos Partes (Parcial y Cancelación) desde Tesorería
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 4: Cobranzas en Tesorería (Parcial en BCP y Cancelación en Caja) ---');
    const cobro1 = 13600.00;
    const cobro2 = 10000.00;

    // Cobro 1: Parcial por BCP
    const movCobro1 = await tesoreriaService.registrarMovimiento(empresaId, {
      periodoId,
      cuentaFinancieraId: ctaBcp.id,
      fecha: '2026-09-18',
      tipo: 'INGRESO',
      medioPago: '003',
      numeroOperacion: `DEP-COBRO-${numUnico}-1`,
      moneda: 'PEN',
      importe: cobro1,
      anexoId: clienteId,
      glosa: `Abono parcial factura cliente ${serieVenta}-${numeroVenta}`,
      aplicaciones: [
        { documentoId: cxcId, importeAplicado: cobro1 }
      ]
    }, userId);

    const cxcParcial = await db.query("SELECT saldo, estado FROM cuentas_por_cobrar WHERE id = $1", [cxcId]);
    console.log(`  ✓ Cobro parcial registrado en PostgreSQL: ID ${movCobro1.id} -> Saldo restante CxC: S/ ${Number(cxcParcial.rows[0].saldo).toFixed(2)} [${cxcParcial.rows[0].estado}]`);

    // Cobro 2: Saldo final en efectivo en Caja Central
    const movCobro2 = await tesoreriaService.registrarMovimiento(empresaId, {
      periodoId,
      cuentaFinancieraId: ctaCaja.id,
      fecha: '2026-09-20',
      tipo: 'INGRESO',
      medioPago: '008', // Efectivo
      numeroOperacion: `REC-CAJA-${numUnico}`,
      moneda: 'PEN',
      importe: cobro2,
      anexoId: clienteId,
      glosa: `Cancelación saldo final factura cliente ${serieVenta}-${numeroVenta}`,
      aplicaciones: [
        { documentoId: cxcId, importeAplicado: cobro2 }
      ]
    }, userId);

    const cxcFinal = await db.query("SELECT saldo, estado FROM cuentas_por_cobrar WHERE id = $1", [cxcId]);
    const saldoFinalCobro = Number(cxcFinal.rows[0].saldo);
    const estadoFinalCobro = cxcFinal.rows[0].estado;
    if (saldoFinalCobro !== 0 || estadoFinalCobro !== 'CANCELADO') {
      throw new Error(`Fallo en cancelación final de CxC. Saldo: ${saldoFinalCobro}, Estado: ${estadoFinalCobro}`);
    }
    console.log(`  ✓ Cobranza final completada en PostgreSQL: ID ${movCobro2.id} -> Saldo CxC: S/ ${saldoFinalCobro.toFixed(2)} [${estadoFinalCobro}]`);

    // ------------------------------------------------------------------------
    // TEST 5: Libros Oficiales (Libro Diario y Libro Mayor)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 5: Verificación de Libro Diario y Libro Mayor en PostgreSQL ---');
    const diario = await librosEEFFService.generarLibroDiario(empresaId, '2026-09');
    console.log(`  ✓ Libro Diario generado con ${diario.totalAsientos} asientos contables contabilizados.`);
    console.log(`    - Suma Total Debe:  S/ ${diario.totalDebe.toFixed(2)}`);
    console.log(`    - Suma Total Haber: S/ ${diario.totalHaber.toFixed(2)}`);
    console.log(`    - Cuadrado y balanceado: ${diario.estaBalanceado}`);
    if (!diario.estaBalanceado) {
      throw new Error(`Libro Diario descuadrado: Debe != Haber`);
    }

    const mayor = await librosEEFFService.generarLibroMayor(empresaId, '2026-09');
    console.log(`  ✓ Libro Mayor generado con ${mayor.cuentas.length} cuentas con movimientos.`);
    console.log(`    - Total Sumas Debe:  S/ ${mayor.totalSumasDebe.toFixed(2)}`);
    console.log(`    - Total Sumas Haber: S/ ${mayor.totalSumasHaber.toFixed(2)}`);
    console.log(`    - Total Saldo Deudor:   S/ ${mayor.totalSaldoDeudor.toFixed(2)}`);
    console.log(`    - Total Saldo Acreedor: S/ ${mayor.totalSaldoAcreedor.toFixed(2)}`);
    console.log(`    - Mayor Cuadrado: ${mayor.estaCuadrado}`);
    if (!mayor.estaCuadrado) {
      throw new Error('Libro Mayor descuadrado');
    }

    // ------------------------------------------------------------------------
    // TEST 6: Balance de Comprobación (Hoja de Trabajo de 10 Columnas)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 6: Balance de Comprobación y Hoja de Trabajo de 10 Columnas ---');
    const hoja10 = await librosEEFFService.generarHojaTrabajo10Columnas(empresaId, '2026-09');
    console.log(`  ✓ Hoja de Trabajo de 10 Columnas calculada:`);
    console.log(`    1. Sumas del Mayor: Debe S/ ${hoja10.totales.montosDebe.toFixed(2)} | Haber S/ ${hoja10.totales.montosHaber.toFixed(2)} (Cuadrado: ${hoja10.controlesCuadre.montosCuadrados})`);
    console.log(`    2. Saldos: Deudor S/ ${hoja10.totales.saldoDeudor.toFixed(2)} | Acreedor S/ ${hoja10.totales.saldoAcreedor.toFixed(2)} (Cuadrado: ${hoja10.controlesCuadre.saldosCuadrados})`);
    console.log(`    3. Inventario: Activo S/ ${hoja10.totales.inventarioActivo.toFixed(2)} | Pasivo S/ ${hoja10.totales.inventarioPasivo.toFixed(2)}`);
    console.log(`    4. Resultados por Naturaleza: Pérdida S/ ${hoja10.totales.naturalezaPerdida.toFixed(2)} | Ganancia S/ ${hoja10.totales.naturalezaGanancia.toFixed(2)}`);
    console.log(`    5. Resultados por Función: Pérdida S/ ${hoja10.totales.funcionPerdida.toFixed(2)} | Ganancia S/ ${hoja10.totales.funcionGanancia.toFixed(2)}`);
    console.log(`    ✓ Resultado del Ejercicio: S/ ${hoja10.resultadoEjercicio.monto.toFixed(2)} [${hoja10.resultadoEjercicio.tipo}]`);
    console.log(`    ✓ Validación de Controles: Montos Cuadrados: ${hoja10.controlesCuadre.montosCuadrados} | Saldos: ${hoja10.controlesCuadre.saldosCuadrados} | Todo Cuadrado: ${hoja10.controlesCuadre.todoCuadrado}`);

    if (!hoja10.controlesCuadre.montosCuadrados || !hoja10.controlesCuadre.saldosCuadrados) {
      throw new Error(`Hoja de Trabajo no superó las validaciones contables de cuadre.`);
    }

    // ------------------------------------------------------------------------
    // TEST 7: Estados Financieros Oficiales (Situación Financiera y Resultados)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 7: Estados Financieros Oficiales ---');
    const eeffSituacion = await librosEEFFService.generarEstadoSituacionFinanciera(empresaId, '2026-09');
    console.log(`  ✓ Estado de Situación Financiera:`);
    console.log(`    - Total Activo: S/ ${eeffSituacion.totalActivo.toFixed(2)} (Corriente: S/ ${eeffSituacion.totalActivoCorriente.toFixed(2)}, No Corriente: S/ ${eeffSituacion.totalActivoNoCorriente.toFixed(2)})`);
    console.log(`    - Total Pasivo: S/ ${eeffSituacion.totalPasivo.toFixed(2)} (Corriente: S/ ${eeffSituacion.totalPasivoCorriente.toFixed(2)})`);
    console.log(`    - Total Patrimonio: S/ ${eeffSituacion.totalPatrimonio.toFixed(2)}`);
    console.log(`    - Total Pasivo + Patrimonio: S/ ${eeffSituacion.totalPasivoYPatrimonio.toFixed(2)}`);
    console.log(`    - Ecuación Contable Cuadrada: ${eeffSituacion.estaCuadrado}`);

    if (!eeffSituacion.estaCuadrado) {
      throw new Error(`Descuadre en Balance General: Activo != Pasivo + Patrimonio (Diferencia: ${eeffSituacion.diferenciaCuadre})`);
    }

    const eeffResultados = await librosEEFFService.generarEstadoResultados(empresaId, '2026-09');
    console.log(`  ✓ Estado de Resultados:`);
    console.log(`    - Ventas Netas: S/ ${eeffResultados.porFuncion.ventasNetas.toFixed(2)}`);
    console.log(`    - Costo de Ventas: S/ ${eeffResultados.porFuncion.costoVentas.toFixed(2)}`);
    console.log(`    - Utilidad Bruta: S/ ${eeffResultados.porFuncion.utilidadBruta.toFixed(2)}`);
    console.log(`    - Utilidad Neta (Por Función): S/ ${eeffResultados.porFuncion.utilidadNeta.toFixed(2)}`);
    console.log(`    - Utilidad Neta (Por Naturaleza): S/ ${eeffResultados.porNaturaleza.utilidadNeta.toFixed(2)}`);
    console.log(`    - Coincidencia Exacta Naturaleza vs Función: ${eeffResultados.coincidenciaExacta}`);
  });

  // ------------------------------------------------------------------------
  // TEST 8: Persistencia Real tras Desconexión y Reconexión a PostgreSQL 18
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 8: Persistencia tras desconexión y reconexión completa a PostgreSQL 18 ---');
  await closeDatabase();

  // Reconectar
  await initializeDatabase();

  await conContextoEmpresa(empresaId, userId, async () => {
    const comprasReconectadas = await compraService.listar(empresaId, { limit: 10 });
    console.log(`  ✓ Comprobantes de compra recuperados tras reinicio: ${comprasReconectadas.total} registros`);

    const ventasReconectadas = await ventaService.listar(empresaId, { limit: 10 });
    console.log(`  ✓ Comprobantes de venta recuperados tras reinicio: ${ventasReconectadas.total} registros`);

    const cxpReconectadas = await db.query("SELECT count(*) FROM cuentas_por_pagar WHERE empresa_id = $1", [empresaId]);
    console.log(`  ✓ Cuentas por pagar recuperadas tras reinicio: ${cxpReconectadas.rows[0].count} registros`);

    const cxcReconectadas = await db.query("SELECT count(*) FROM cuentas_por_cobrar WHERE empresa_id = $1", [empresaId]);
    console.log(`  ✓ Cuentas por cobrar recuperadas tras reinicio: ${cxcReconectadas.rows[0].count} registros`);

    const libroDiarioReconectado = await librosEEFFService.generarLibroDiario(empresaId, '2026-09');
    console.log(`  ✓ Libro Diario recalculado tras reinicio: ${libroDiarioReconectado.totalAsientos} asientos (Balanceado: ${libroDiarioReconectado.estaBalanceado})`);
  });

  await closeDatabase();

  console.log('\n========================================================================');
  console.log('       CERTIFICACIÓN FASE 3 COMPLETADA CON ÉXITO (100% OK)              ');
  console.log('========================================================================\n');
}

ejecutarCertificacionFase3()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ ERROR FATAL EN CERTIFICACIÓN FASE 3:', err);
    process.exit(1);
  });
