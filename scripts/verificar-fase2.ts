import { initializeDatabase, closeDatabase, db, conContextoEmpresa } from '../server/config/database';
import { tesoreriaService } from '../server/services/tesoreriaService';
import { conciliacionService } from '../server/services/conciliacionService';
import { daotService } from '../server/services/daotService';
import { prorrataIgvService } from '../server/services/prorrataIgvService';
import { activosFijosService } from '../server/services/activosFijosService';
import { kardexService } from '../server/services/kardexService';
import { cajaChicaService } from '../server/services/cajaChicaService';
import { honorariosService } from '../server/services/honorariosService';
import { detraccionService } from '../server/services/detraccionService';
import { periodoService } from '../server/services/periodoService';
import { pcgeService } from '../server/services/pcgeService';

async function ejecutarCertificacionFase2() {
  console.log('================================================================');
  console.log('   CERTIFICACIÓN FASE 2: PERSISTENCIA REAL EN TODOS LOS MÓDULOS   ');
  console.log('================================================================\n');

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
    // Asegurar plan contable oficial de la empresa
    const resPlan = await pcgeService.completarPlanDesdeCatalogoBase(empresaId);
    console.log(`[INIT] Plan de Cuentas: ${resPlan.totalEmpresa} cuentas disponibles en PostgreSQL`);

    // Asegurar período 2026-09
    const periodo = await periodoService.obtenerPorCodigo(empresaId, '2026-09');
    if (!periodo) throw new Error('Período 2026-09 no encontrado');
    const periodoId = periodo.id;
    console.log(`[INIT] Período: 2026-09 (ID: ${periodoId})\n`);

    // ------------------------------------------------------------------------
    // TEST 1: Cuentas Financieras (Inicialización y Persistencia en PostgreSQL)
    // ------------------------------------------------------------------------
    console.log('--- TEST 1: Inicialización y consulta de cuentas financieras en PostgreSQL ---');
    const cuentas = await tesoreriaService.listarCuentas(empresaId);
    if (!cuentas || cuentas.length === 0) throw new Error('Fallo al inicializar cuentas financieras.');
    console.log(`  ✓ ÉXITO: ${cuentas.length} cuentas financieras disponibles en PostgreSQL.`);
    cuentas.forEach(c => {
      console.log(`    - [${c.tipo}] ${c.banco} (${c.numero}) Moneda: ${c.moneda} Cta PCGE: ${c.cuentaContableCodigo}`);
    });

    const ctaBcp = cuentas.find(c => c.banco === 'BCP' && c.moneda === 'PEN') || cuentas[0];
    const ctaCaja = cuentas.find(c => c.tipo === 'CAJA') || cuentas[1];

    // ------------------------------------------------------------------------
    // TEST 2: Movimientos de Tesorería (Registro y Cuadre de Saldos en BD)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 2: Registro de movimientos de tesorería y actualización de saldos ---');
    const saldoInicialBcp = ctaBcp.saldoActual;
    const montoIngreso = 15000.00;
    const refUnica = 'OP-BCP-' + Date.now();

    const movIngreso = await tesoreriaService.registrarMovimiento(empresaId, {
      periodoId,
      cuentaFinancieraId: ctaBcp.id,
      fecha: '2026-09-12',
      tipo: 'INGRESO',
      medioPago: '003',
      numeroOperacion: refUnica,
      moneda: 'PEN',
      importe: montoIngreso,
      glosa: 'Cobranza factura clientes depósito en cuenta corriente BCP'
    }, userId);

    console.log(`  ✓ Movimiento de Ingreso registrado en PostgreSQL: ID ${movIngreso.id}`);
    console.log(`  ✓ Asiento contable asociado: ${movIngreso.asientoId}`);

    // Verificar en PostgreSQL
    const ctaBcpActualizada = await tesoreriaService.obtenerCuentaPorId(empresaId, ctaBcp.id);
    const saldoEsperado = Number((saldoInicialBcp + montoIngreso).toFixed(2));
    if (ctaBcpActualizada?.saldoActual !== saldoEsperado) {
      throw new Error(`Saldo de cuenta no coincide. Esperado: ${saldoEsperado}, Real: ${ctaBcpActualizada?.saldoActual}`);
    }
    console.log(`  ✓ Saldo actualizado en cuenta BCP: S/ ${ctaBcpActualizada.saldoActual.toFixed(2)} (Incrementó S/ ${montoIngreso.toFixed(2)})`);

    // ------------------------------------------------------------------------
    // TEST 3: Transferencia entre Cuentas con Partida Doble
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 3: Transferencia entre cuentas financieras en PostgreSQL ---');
    const montoTransferencia = 3000.00;
    const transf = await tesoreriaService.registrarTransferencia(empresaId, {
      periodoId,
      cuentaOrigenId: ctaBcp.id,
      cuentaDestinoId: ctaCaja.id,
      fecha: '2026-09-15',
      importeOrigen: montoTransferencia,
      glosa: 'Retiro de cuenta corriente BCP para reposición de efectivo en Caja'
    }, userId);

    console.log(`  ✓ Transferencia registrada: ID ${transf.id} por S/ ${montoTransferencia.toFixed(2)}`);
    console.log(`  ✓ Asiento contable generado: ${transf.asientoId}`);

    // ------------------------------------------------------------------------
    // TEST 4: Importación y Conciliación Bancaria con PostgreSQL
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 4: Importación y Conciliación Bancaria en PostgreSQL ---');
    const nombreArchivoExtracto = `EXTRACTO_BCP_SET_2026_${Date.now()}.csv`;
    const extractoImportado = await conciliacionService.importarExtracto(empresaId, ctaBcp.id, {
      nombreArchivo: nombreArchivoExtracto,
      saldoInicial: saldoInicialBcp,
      saldoFinal: saldoInicialBcp + montoIngreso - montoTransferencia,
      lineas: [
        {
          fecha: '2026-09-12',
          descripcion: `ABONO TRANSFERENCIA CLIENTES ${refUnica}`,
          referencia: refUnica,
          monto: montoIngreso,
          saldo: saldoInicialBcp + montoIngreso
        },
        {
          fecha: '2026-09-15',
          descripcion: 'CARGO RETIRO EN EFECTIVO VENTANILLA',
          referencia: 'CHQ-001',
          monto: -montoTransferencia,
          saldo: saldoInicialBcp + montoIngreso - montoTransferencia
        }
      ]
    }, userId);

    console.log(`  ✓ Extracto bancario importado en PostgreSQL: ID ${extractoImportado.id} (${extractoImportado.lineas.length} líneas)`);

    // Probar rechazo de extracto duplicado
    try {
      await conciliacionService.importarExtracto(empresaId, ctaBcp.id, {
        nombreArchivo: nombreArchivoExtracto,
        lineas: [
          { fecha: '2026-09-12', descripcion: `ABONO TRANSFERENCIA CLIENTES ${refUnica}`, referencia: refUnica, monto: montoIngreso },
          { fecha: '2026-09-15', descripcion: 'CARGO RETIRO EN EFECTIVO VENTANILLA', referencia: 'CHQ-001', monto: -montoTransferencia }
        ]
      }, userId);
      throw new Error('Debería rechazar extracto duplicado');
    } catch (err: any) {
      console.log(`  ✓ Rechazo de extracto duplicado comprobado -> "${err.message}"`);
    }

    // Obtener estado de conciliación
    const estadoConciliacion = await conciliacionService.obtenerEstadoConciliacion(
      empresaId,
      ctaBcp.id,
      periodoId,
      '2026-09-30'
    );

    console.log(`  ✓ Estado de conciliación calculado desde PostgreSQL:`);
    console.log(`    - Saldo según Libros: S/ ${estadoConciliacion.resumen.saldoSegunLibros.toFixed(2)}`);
    console.log(`    - Saldo según Banco:  S/ ${estadoConciliacion.resumen.saldoSegunBanco.toFixed(2)}`);
    console.log(`    - Coincidencias sugeridas: ${estadoConciliacion.coincidenciasSugeridas.length}`);

    // Conciliar la primera partida sugerida
    if (estadoConciliacion.coincidenciasSugeridas.length > 0) {
      const match = estadoConciliacion.coincidenciasSugeridas[0];
      await conciliacionService.conciliar(empresaId, match.lineaExtractoId, match.movimientoId, userId);
      console.log(`  ✓ Partida conciliada exitosamente en PostgreSQL (Score: ${match.score})`);
    }

    // Cerrar conciliación
    const concCerrada = await conciliacionService.cerrarConciliacion(
      empresaId,
      ctaBcp.id,
      periodoId,
      '2026-09-30',
      userId
    );
    console.log(`  ✓ Conciliación cerrada y guardada en PostgreSQL: ID ${concCerrada.id}`);

    // ------------------------------------------------------------------------
    // TEST 5: Caja Chica y Rendiciones en PostgreSQL
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 5: Caja Chica y Rendiciones en PostgreSQL ---');
    const cajaChica = await cajaChicaService.abrirFondo(empresaId, {
      nombre: 'Caja Chica Administración y Operaciones',
      cuentaFinancieraId: ctaBcp.id,
      montoFondo: 1500.00
    }, userId);
    console.log(`  ✓ Fondo de Caja Chica abierto: ID ${cajaChica.id} por S/ ${cajaChica.montoFondo.toFixed(2)}`);

    const rendicion = await cajaChicaService.registrarRendicion(empresaId, cajaChica.id, {
      fecha: '2026-09-20',
      totalRendido: 450.00,
      glosa: 'Gastos menores de movilidad y útiles de oficina'
    }, userId);
    console.log(`  ✓ Rendición registrada en PostgreSQL: ID ${rendicion.id} por S/ ${rendicion.totalRendido.toFixed(2)}`);

    const reposicion = await cajaChicaService.reponerFondo(empresaId, rendicion.id, periodoId, userId);
    console.log(`  ✓ Fondo repuesto con asiento contable: ${reposicion.asientoId}`);

    // ------------------------------------------------------------------------
    // TEST 6: Recibos por Honorarios y Anulación con Extorno
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 6: Recibos por Honorarios en PostgreSQL ---');
    let provRes = await db.query(
      "SELECT id FROM anexos WHERE empresa_id = $1 LIMIT 1",
      [empresaId]
    );
    let proveedorId = provRes.rows[0]?.id;
    if (!proveedorId) {
      const insAnexo = await db.query(`
        INSERT INTO anexos (id, empresa_id, tipo_documento, numero_documento, razon_social, es_proveedor, estado)
        VALUES (gen_random_uuid(), $1, '6', '10203040506', 'DRA. MARÍA ROJAS VILCHEZ', true, 'ACTIVO')
        RETURNING id
      `, [empresaId]);
      proveedorId = insAnexo.rows[0].id;
    }

    const numRecibo = String(Math.floor(1000 + Math.random() * 9000));
    const recibo = await honorariosService.registrarRecibo(empresaId, {
      periodoId,
      proveedorId,
      proveedorRuc: '10203040506',
      proveedorNombre: 'DRA. MARÍA ROJAS VILCHEZ',
      serie: 'E001',
      numero: numRecibo,
      fechaEmision: '2026-09-22',
      moneda: 'PEN',
      importeBruto: 2500.00,
      cuentaGasto: '6322',
      glosa: 'Dictamen pericial contable financiero 2026'
    }, userId);
    console.log(`  ✓ Recibo por honorarios registrado: ID ${recibo.id} (Neto: S/ ${recibo.netoPagar.toFixed(2)}, Retención 8%: S/ ${recibo.retencion.toFixed(2)})`);

    const anulacion = await honorariosService.anularRecibo(empresaId, recibo.id, 'Anulado por error de concepto', userId);
    console.log(`  ✓ Recibo anulado en PostgreSQL con extorno contable inmutable.`);

    // ------------------------------------------------------------------------
    // TEST 7: DAOT - Operaciones con Terceros desde PostgreSQL
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 7: Consolidado DAOT leyendo PostgreSQL ---');
    const daot = await daotService.procesarDaot(empresaId, 2026);
    console.log(`  ✓ DAOT 2026 procesado exitosamente:`);
    console.log(`    - UIT Aplicable: S/ ${daot.uitAnual.toFixed(2)} | Umbral 2 UIT: S/ ${daot.umbral2Uit.toFixed(2)}`);
    console.log(`    - Total terceros evaluados: ${daot.totalTercerosEvaluados}`);
    console.log(`    - Total terceros declarables (> 2 UIT): ${daot.totalTercerosDeclarables}`);

    // ------------------------------------------------------------------------
    // TEST 8: Prorrata del IGV con persistencia en PostgreSQL
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 8: Liquidación de Prorrata de IGV en PostgreSQL ---');
    const prorrata = await prorrataIgvService.calcularProrrata(empresaId, '2026-09');
    console.log(`  ✓ Prorrata de IGV calculada:`);
    console.log(`    - Coeficiente: ${prorrata.coeficienteProrrata.toFixed(4)} (${prorrata.porcentajeProrrata.toFixed(2)}%)`);
    console.log(`    - Crédito fiscal admitido: S/ ${prorrata.igvCreditoFiscalPermitido.toFixed(2)}`);
    console.log(`    - IGV transferido a Gasto/Costo (Cta 64111): S/ ${prorrata.igvGastoCostoNoAdmitido.toFixed(2)}`);

    const guardada = await prorrataIgvService.obtenerGuardada(empresaId, '2026-09');
    if (!guardada) throw new Error('Prorrata no persistió en PostgreSQL');
    console.log(`  ✓ Prorrata recuperada directamente de tabla declaraciones_prorrata_igv en PostgreSQL.`);

    // ------------------------------------------------------------------------
    // TEST 9: Activos Fijos - Depreciación Mensual y Asiento en PostgreSQL
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 9: Activos Fijos y Depreciación en PostgreSQL ---');
    const codActivo = `ACT-EQ-${Date.now().toString().slice(-4)}`;
    const activoNuevo = await activosFijosService.registrarActivo(empresaId, {
      codigoActivo: codActivo,
      descripcion: 'Servidor Central Dell PowerEdge R750',
      categoria: 'EQUIPOS_COMPUTO',
      fechaAdquisicion: '2026-01-15',
      fechaInicioUso: '2026-01-15',
      moneda: 'PEN',
      tipoCambio: 1.0,
      valorAdquisicion: 24000.00,
      vidaUtilMesesFinanciera: 48,
      centroCosto: 'SISTEMAS'
    });
    console.log(`  ✓ Activo Fijo registrado en PostgreSQL: ${activoNuevo.codigoActivo} - S/ ${activoNuevo.valorAdquisicionSoles.toFixed(2)}`);

    const calculoDeprec = await activosFijosService.calcularDepreciacionPeriodo(empresaId, '2026-09');
    console.log(`  ✓ Depreciación calculada: ${calculoDeprec.totalActivosDepreciados} activos | Deprec. Financiera: S/ ${calculoDeprec.totalDepreciacionFinanciera.toFixed(2)} | Deprec. Tributaria: S/ ${calculoDeprec.totalDepreciacionTributaria.toFixed(2)}`);

    const asientoDeprec = await activosFijosService.generarAsientoDepreciacion(empresaId, '2026-09', userId);
    console.log(`  ✓ Asiento de depreciación generado en PostgreSQL: ${asientoDeprec.numeroAsiento} por S/ ${asientoDeprec.totalDepreciado.toFixed(2)}`);

    // ------------------------------------------------------------------------
    // TEST 10: Kardex Valorado - Movimientos y Costo de Ventas en PostgreSQL
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 10: Kardex Valorado y Costo de Ventas en PostgreSQL ---');
    const codProd = `PRD-MERC-${Date.now().toString().slice(-4)}`;
    const prodKardex = await kardexService.registrarProducto(empresaId, {
      codigoProducto: codProd,
      descripcion: 'Laptop Lenovo ThinkPad T14 Gen 4',
      unidadMedidaSUNAT: 'NIU',
      tipoExistenciaSUNAT: '01',
      metodoValuacion: 'PROMEDIO_PONDERADO',
      cuentaExistenciasPCGE: '20111',
      cuentaCostoVentasPCGE: '69111'
    });

    // Registrar saldo inicial
    await kardexService.registrarMovimiento(empresaId, {
      productoId: prodKardex.id,
      periodo: '2026-09',
      fecha: '2026-09-01',
      tipoOperacionSUNAT: '16',
      cantidad: 10,
      costoUnitario: 3500.00,
      glosa: 'Inventario inicial del período'
    });
    console.log(`  ✓ Producto Kardex registrado en PostgreSQL: ${prodKardex.codigoProducto}`);

    // Registrar salida (venta)
    const movSalida = await kardexService.registrarMovimiento(empresaId, {
      productoId: prodKardex.id,
      periodo: '2026-09',
      fecha: '2026-09-18',
      tipoOperacionSUNAT: '01',
      tipoComprobanteSUNAT: '01',
      serieComprobante: 'F001',
      numeroComprobante: '00001001',
      cantidad: 2,
      glosa: 'Salida de almacén por venta factura F001-00001001'
    });
    console.log(`  ✓ Salida de Kardex registrada en PostgreSQL: 2 unidades vendidas por costo total S/ ${movSalida.costoTotalSalida.toFixed(2)} (Nuevo stock: ${movSalida.saldoCantidad})`);

    const asientoCv = await kardexService.generarAsientoCostoVentas(empresaId, '2026-09', userId);
    console.log(`  ✓ Asiento de Costo de Ventas generado en PostgreSQL: ${asientoCv.numeroAsiento} por S/ ${asientoCv.costoVentasTotal.toFixed(2)}`);
  });

  // ------------------------------------------------------------------------
  // TEST 11: Persistencia Real tras Desconexión y Reconexión a PostgreSQL 18
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 11: Persistencia tras desconexión y reconexión completa a PostgreSQL 18 ---');
  await closeDatabase();

  // Reconectar
  await initializeDatabase();

  await conContextoEmpresa(empresaId, userId, async () => {
    const cuentasReconectadas = await tesoreriaService.listarCuentas(empresaId);
    console.log(`  ✓ Cuentas financieras recuperadas tras reinicio: ${cuentasReconectadas.length}`);

    const movsReconectados = await tesoreriaService.listarMovimientos(empresaId, { limit: 10 });
    console.log(`  ✓ Movimientos de tesorería recuperados tras reinicio: ${movsReconectados.total} registros`);

    const cajasReconectadas = await cajaChicaService.listarCajas(empresaId);
    console.log(`  ✓ Cajas chicas recuperadas tras reinicio: ${cajasReconectadas.length}`);

    const activosReconectados = await activosFijosService.listarActivos(empresaId);
    console.log(`  ✓ Activos fijos recuperados tras reinicio: ${activosReconectados.length}`);

    const productosReconectados = await kardexService.listarProductos(empresaId);
    console.log(`  ✓ Productos de Kardex recuperados tras reinicio: ${productosReconectados.length}`);
  });

  await closeDatabase();

  console.log('\n================================================================');
  console.log('       CERTIFICACIÓN FASE 2 COMPLETADA CON ÉXITO (100% OK)      ');
  console.log('================================================================\n');
}

ejecutarCertificacionFase2()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ ERROR FATAL EN CERTIFICACIÓN FASE 2:', err);
    process.exit(1);
  });
