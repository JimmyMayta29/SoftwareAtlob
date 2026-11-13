import crypto from 'crypto';
import { db } from '../config/database';
import { Money } from '../utils/decimal';
import { ASIENTOS_MEMORIA } from './asientoService';

export interface ProductoKardexModel {
  id: string;
  empresaId: string;
  codigoProducto: string;
  descripcion: string;
  unidadMedidaSUNAT: string; // NIU (Unidades), KGM (Kilos), LTR (Litros), etc. Tabla 6 SUNAT
  tipoExistenciaSUNAT: string; // 01=Mercaderías, 02=Materia Prima, 03=Materiales Auxiliares
  metodoValuacion: 'PROMEDIO_PONDERADO' | 'PEPS';
  cuentaExistenciasPCGE: string; // Ej: 20111
  cuentaCostoVentasPCGE: string; // Ej: 69111
  cuentaVariacionPCGE: string; // Ej: 6111
  stockActual: number;
  costoUnitarioActual: number;
  costoTotalValorado: number;
  createdAt: string;
  updatedAt: string;
}

export interface MovimientoKardexModel {
  id: string;
  empresaId: string;
  productoId: string;
  periodo: string;
  fecha: string;
  tipoComprobanteSUNAT?: string; // 01=Factura, 03=Boleta, 09=Guía de remisión
  serieComprobante?: string;
  numeroComprobante?: string;
  tipoOperacionSUNAT: string; // 01=Venta, 02=Compra, 05=Devolución, 16=Saldo Inicial
  // ENTRADAS
  cantidadEntrada: number;
  costoUnitarioEntrada: number;
  costoTotalEntrada: number;
  // SALIDAS
  cantidadSalida: number;
  costoUnitarioSalida: number;
  costoTotalSalida: number;
  // SALDOS FINALES
  saldoCantidad: number;
  saldoCostoUnitario: number;
  saldoCostoTotal: number;
  glosa?: string;
  createdAt: string;
}

export const PRODUCTOS_KARDEX_MEMORIA: ProductoKardexModel[] = [];
export const ARTICULOS_MEMORIA = PRODUCTOS_KARDEX_MEMORIA;
export type ArticuloKardexModel = ProductoKardexModel;
export const MOVIMIENTOS_KARDEX_MEMORIA: MovimientoKardexModel[] = [];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function toUuid(id?: string): string {
  if (id && UUID_REGEX.test(id)) return id;
  return crypto.randomUUID();
}

export const kardexService = {
  /**
   * Registra un nuevo producto en el catálogo de inventarios
   */
  async registrarProducto(empresaId: string, input: {
    codigoProducto: string;
    descripcion: string;
    unidadMedidaSUNAT?: string;
    tipoExistenciaSUNAT?: string;
    metodoValuacion?: 'PROMEDIO_PONDERADO' | 'PEPS';
    cuentaExistenciasPCGE?: string;
    cuentaCostoVentasPCGE?: string;
  }): Promise<ProductoKardexModel> {
    const rawId = `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    let finalId = rawId;

    if (db.isPostgresConnected()) {
      try {
        const uuidVal = toUuid(rawId);
        const res = await db.query(`
          INSERT INTO articulos_kardex (
            id, empresa_id, codigo_producto, descripcion, unidad_medida_sunat, tipo_existencia_sunat,
            metodo_valuacion, cuenta_existencias_pcge, cuenta_costo_ventas_pcge, cuenta_variacion_pcge,
            stock_actual, costo_unitario_actual, costo_total_valorado
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 0, 0)
          ON CONFLICT (empresa_id, codigo_producto) DO UPDATE SET
            descripcion = EXCLUDED.descripcion,
            unidad_medida_sunat = EXCLUDED.unidad_medida_sunat,
            tipo_existencia_sunat = EXCLUDED.tipo_existencia_sunat,
            metodo_valuacion = EXCLUDED.metodo_valuacion,
            cuenta_existencias_pcge = EXCLUDED.cuenta_existencias_pcge,
            cuenta_costo_ventas_pcge = EXCLUDED.cuenta_costo_ventas_pcge,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `, [
          uuidVal, empresaId, input.codigoProducto, input.descripcion,
          input.unidadMedidaSUNAT || 'NIU', input.tipoExistenciaSUNAT || '01',
          input.metodoValuacion || 'PROMEDIO_PONDERADO',
          input.cuentaExistenciasPCGE || '20111', input.cuentaCostoVentasPCGE || '69111',
          '6111'
        ]);
        if (res.rows.length > 0) {
          finalId = String(res.rows[0].id);
        }
      } catch {
        // Fallback a memoria
      }
    }

    const nuevo: ProductoKardexModel = {
      id: finalId,
      empresaId,
      codigoProducto: input.codigoProducto,
      descripcion: input.descripcion,
      unidadMedidaSUNAT: input.unidadMedidaSUNAT || 'NIU',
      tipoExistenciaSUNAT: input.tipoExistenciaSUNAT || '01',
      metodoValuacion: input.metodoValuacion || 'PROMEDIO_PONDERADO',
      cuentaExistenciasPCGE: input.cuentaExistenciasPCGE || '20111',
      cuentaCostoVentasPCGE: input.cuentaCostoVentasPCGE || '69111',
      cuentaVariacionPCGE: '6111',
      stockActual: 0,
      costoUnitarioActual: 0,
      costoTotalValorado: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    PRODUCTOS_KARDEX_MEMORIA.push(nuevo);
    return nuevo;
  },

  /**
   * Lista los productos del catálogo de inventarios
   */
  async listarProductos(empresaId: string): Promise<ProductoKardexModel[]> {
    if (db.isPostgresConnected()) {
      try {
        const res = await db.query(
          `SELECT * FROM articulos_kardex WHERE empresa_id = $1 ORDER BY codigo_producto ASC`,
          [empresaId]
        );
        if (res.rows.length > 0) {
          return res.rows.map(r => ({
            id: String(r.id),
            empresaId: String(r.empresa_id),
            codigoProducto: String(r.codigo_producto),
            descripcion: String(r.descripcion),
            unidadMedidaSUNAT: String(r.unidad_medida_sunat),
            tipoExistenciaSUNAT: String(r.tipo_existencia_sunat),
            metodoValuacion: r.metodo_valuacion,
            cuentaExistenciasPCGE: String(r.cuenta_existencias_pcge),
            cuentaCostoVentasPCGE: String(r.cuenta_costo_ventas_pcge),
            cuentaVariacionPCGE: String(r.cuenta_variacion_pcge),
            stockActual: Number(r.stock_actual),
            costoUnitarioActual: Number(r.costo_unitario_actual),
            costoTotalValorado: Number(r.costo_total_valorado),
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
            updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString()
          }));
        }
      } catch {
        // Fallback a memoria
      }
    }
    return PRODUCTOS_KARDEX_MEMORIA.filter(p => p.empresaId === empresaId);
  },

  /**
   * Registra un movimiento de entrada o salida aplicando el método de valuación
   */
  async registrarMovimiento(empresaId: string, input: {
    productoId: string;
    periodo: string;
    fecha: string;
    tipoOperacionSUNAT: string; // 01=Venta, 02=Compra, 16=Saldo Inicial
    tipoComprobanteSUNAT?: string;
    serieComprobante?: string;
    numeroComprobante?: string;
    cantidad: number;
    costoUnitario?: number; // Requerido para entradas
    glosa?: string;
  }): Promise<MovimientoKardexModel> {
    const prod = PRODUCTOS_KARDEX_MEMORIA.find(p => p.id === input.productoId && p.empresaId === empresaId);
    if (!prod) {
      throw new Error(`Producto con ID ${input.productoId} no encontrado.`);
    }

    const esEntrada = ['02', '16', '05'].includes(input.tipoOperacionSUNAT); // Compra, saldo inicial, devolución
    const cantidad = Math.abs(input.cantidad);

    let cantEntrada = 0;
    let cuEntrada = 0;
    let totEntrada = 0;

    let cantSalida = 0;
    let cuSalida = 0;
    let totSalida = 0;

    let nuevoStock = prod.stockActual;
    let nuevoCostoTotal = prod.costoTotalValorado;
    let nuevoCostoUnitario = prod.costoUnitarioActual;

    if (esEntrada) {
      cantEntrada = cantidad;
      cuEntrada = input.costoUnitario || 0;
      totEntrada = Money.toNumber(Money.mul(cantEntrada, cuEntrada));

      nuevoStock = Money.toNumber(Money.add(prod.stockActual, cantEntrada));
      nuevoCostoTotal = Money.toNumber(Money.add(prod.costoTotalValorado, totEntrada));
      nuevoCostoUnitario = nuevoStock > 0 ? Money.toNumber(Money.div(nuevoCostoTotal, nuevoStock)) : 0;
    } else {
      // Es Salida (Venta)
      if (cantidad > prod.stockActual) {
        throw new Error(`Stock insuficiente para el producto ${prod.codigoProducto}. Stock actual: ${prod.stockActual}, solicitado: ${cantidad}.`);
      }

      cantSalida = cantidad;
      // Valuación según costo promedio ponderado móvil
      cuSalida = prod.costoUnitarioActual;
      totSalida = Money.toNumber(Money.mul(cantSalida, cuSalida));

      nuevoStock = Money.toNumber(Money.sub(prod.stockActual, cantSalida));
      nuevoCostoTotal = Money.toNumber(Money.sub(prod.costoTotalValorado, totSalida));
      nuevoCostoUnitario = nuevoStock > 0 ? Money.toNumber(Money.div(nuevoCostoTotal, nuevoStock)) : 0;
    }

    const movId = `mov-kdx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const movUuid = toUuid(movId);
    let prodDbId = prod.id;

    if (db.isPostgresConnected()) {
      try {
        if (!UUID_REGEX.test(prodDbId)) {
          const prodCheck = await db.query(
            `SELECT id FROM articulos_kardex WHERE empresa_id = $1 AND codigo_producto = $2 LIMIT 1`,
            [empresaId, prod.codigoProducto]
          );
          if (prodCheck.rows.length > 0) {
            prodDbId = String(prodCheck.rows[0].id);
          }
        }

        if (UUID_REGEX.test(prodDbId)) {
          await db.query(`
            INSERT INTO movimientos_kardex (
              id, empresa_id, producto_id, periodo, fecha, tipo_comprobante_sunat,
              serie_comprobante, numero_comprobante, tipo_operacion_sunat,
              cantidad_entrada, costo_unitario_entrada, costo_total_entrada,
              cantidad_salida, costo_unitario_salida, costo_total_salida,
              saldo_cantidad, saldo_costo_unitario, saldo_costo_total, glosa
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          `, [
            movUuid, empresaId, prodDbId, input.periodo, input.fecha,
            input.tipoComprobanteSUNAT || (esEntrada ? '01' : '01'),
            input.serieComprobante || (esEntrada ? 'F001' : 'F001'),
            input.numeroComprobante || '00000001',
            input.tipoOperacionSUNAT,
            cantEntrada, cuEntrada, totEntrada,
            cantSalida, cuSalida, totSalida,
            nuevoStock, nuevoCostoUnitario, nuevoCostoTotal,
            input.glosa || (esEntrada ? 'Ingreso a almacén por compras' : 'Salida de almacén por venta')
          ]);

          await db.query(`
            UPDATE articulos_kardex
            SET stock_actual = $1, costo_unitario_actual = $2, costo_total_valorado = $3, updated_at = CURRENT_TIMESTAMP
            WHERE id = $4 AND empresa_id = $5
          `, [nuevoStock, nuevoCostoUnitario, nuevoCostoTotal, prodDbId, empresaId]);
        }
      } catch {
        // Fallback a memoria
      }
    }

    const nuevoMovimiento: MovimientoKardexModel = {
      id: db.isPostgresConnected() ? movUuid : movId,
      empresaId,
      productoId: prod.id,
      periodo: input.periodo,
      fecha: input.fecha,
      tipoComprobanteSUNAT: input.tipoComprobanteSUNAT || (esEntrada ? '01' : '01'),
      serieComprobante: input.serieComprobante || (esEntrada ? 'F001' : 'F001'),
      numeroComprobante: input.numeroComprobante || '00000001',
      tipoOperacionSUNAT: input.tipoOperacionSUNAT,
      cantidadEntrada: cantEntrada,
      costoUnitarioEntrada: cuEntrada,
      costoTotalEntrada: totEntrada,
      cantidadSalida: cantSalida,
      costoUnitarioSalida: cuSalida,
      costoTotalSalida: totSalida,
      saldoCantidad: nuevoStock,
      saldoCostoUnitario: nuevoCostoUnitario,
      saldoCostoTotal: nuevoCostoTotal,
      glosa: input.glosa || (esEntrada ? 'Ingreso a almacén por compras' : 'Salida de almacén por venta'),
      createdAt: new Date().toISOString()
    };

    MOVIMIENTOS_KARDEX_MEMORIA.push(nuevoMovimiento);

    // Actualizar producto
    prod.stockActual = nuevoStock;
    prod.costoUnitarioActual = nuevoCostoUnitario;
    prod.costoTotalValorado = nuevoCostoTotal;
    prod.updatedAt = new Date().toISOString();

    return nuevoMovimiento;
  },

  /**
   * Obtiene la tarjeta de Kardex valorado de un producto
   */
  async obtenerKardexProducto(empresaId: string, productoId: string): Promise<{
    producto: ProductoKardexModel;
    movimientos: MovimientoKardexModel[];
    totalEntradasValoradas: number;
    totalSalidasValoradas: number;
    saldoFinalValorado: number;
  }> {
    const prod = PRODUCTOS_KARDEX_MEMORIA.find(p => p.id === productoId && p.empresaId === empresaId);
    if (!prod) {
      throw new Error(`Producto ${productoId} no encontrado.`);
    }

    if (db.isPostgresConnected()) {
      try {
        let prodDbId = productoId;
        if (!UUID_REGEX.test(prodDbId) && prod) {
          const chk = await db.query(
            `SELECT id FROM articulos_kardex WHERE empresa_id = $1 AND codigo_producto = $2 LIMIT 1`,
            [empresaId, prod.codigoProducto]
          );
          if (chk.rows.length > 0) prodDbId = String(chk.rows[0].id);
        }
        if (UUID_REGEX.test(prodDbId)) {
          const movRows = await db.query(
            `SELECT * FROM movimientos_kardex WHERE empresa_id = $1 AND producto_id = $2 ORDER BY fecha ASC`,
            [empresaId, prodDbId]
          );
          if (movRows.rows.length > 0) {
            const movimientosPg: MovimientoKardexModel[] = movRows.rows.map(m => ({
              id: String(m.id),
              empresaId: String(m.empresa_id),
              productoId: String(m.producto_id),
              periodo: String(m.periodo),
              fecha: m.fecha instanceof Date ? m.fecha.toISOString().slice(0, 10) : String(m.fecha).slice(0, 10),
              tipoComprobanteSUNAT: m.tipo_comprobante_sunat,
              serieComprobante: m.serie_comprobante,
              numeroComprobante: m.numero_comprobante,
              tipoOperacionSUNAT: m.tipo_operacion_sunat,
              cantidadEntrada: Number(m.cantidad_entrada),
              costoUnitarioEntrada: Number(m.costo_unitario_entrada),
              costoTotalEntrada: Number(m.costo_total_entrada),
              cantidadSalida: Number(m.cantidad_salida),
              costoUnitarioSalida: Number(m.costo_unitario_salida),
              costoTotalSalida: Number(m.costo_total_salida),
              saldoCantidad: Number(m.saldo_cantidad),
              saldoCostoUnitario: Number(m.saldo_costo_unitario),
              saldoCostoTotal: Number(m.saldo_costo_total),
              glosa: m.glosa,
              createdAt: m.created_at ? new Date(m.created_at).toISOString() : new Date().toISOString()
            }));
            const totalEntradas = movimientosPg.reduce((acc, m) => acc + m.costoTotalEntrada, 0);
            const totalSalidas = movimientosPg.reduce((acc, m) => acc + m.costoTotalSalida, 0);
            return {
              producto: prod,
              movimientos: movimientosPg,
              totalEntradasValoradas: totalEntradas,
              totalSalidasValoradas: totalSalidas,
              saldoFinalValorado: prod.costoTotalValorado
            };
          }
        }
      } catch {
        // Fallback a memoria
      }
    }

    const movimientos = MOVIMIENTOS_KARDEX_MEMORIA
      .filter(m => m.productoId === productoId && m.empresaId === empresaId)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    const totalEntradas = movimientos.reduce((acc, m) => acc + m.costoTotalEntrada, 0);
    const totalSalidas = movimientos.reduce((acc, m) => acc + m.costoTotalSalida, 0);

    return {
      producto: prod,
      movimientos,
      totalEntradasValoradas: totalEntradas,
      totalSalidasValoradas: totalSalidas,
      saldoFinalValorado: prod.costoTotalValorado
    };
  },

  /**
   * Genera el asiento contable de Costo de Ventas para el periodo
   * Cargo: 69111 Costo de ventas
   * Abono: 20111 Mercaderías manufacturadas
   */
  async generarAsientoCostoVentas(empresaId: string, periodo: string): Promise<{
    asientoId: string;
    numeroAsiento: string;
    costoVentasTotal: number;
    mensaje: string;
  }> {
    const salidasPeriodo = MOVIMIENTOS_KARDEX_MEMORIA.filter(m => 
      m.empresaId === empresaId && 
      m.periodo === periodo && 
      m.cantidadSalida > 0
    );

    const totalCostoVentas = salidasPeriodo.reduce((acc, m) => acc + m.costoTotalSalida, 0);

    if (totalCostoVentas <= 0) {
      throw new Error(`No existen salidas valoradas en el Kardex para el período ${periodo}.`);
    }

    const fechaAsiento = `${periodo}-28`;
    const numAsiento = `11${periodo.replace('-', '').slice(2)}0001`;

    const lineas = [
      {
        linea: 1,
        codigoCuenta: '69111',
        denominacionCuenta: 'Mercaderías manufacturadas - Terceros (Costo de ventas)',
        debe: totalCostoVentas,
        haber: 0,
        glosa: `Reconocimiento del costo de ventas del período ${periodo}`
      },
      {
        linea: 2,
        codigoCuenta: '20111',
        denominacionCuenta: 'Mercaderías manufacturadas - Almacén Central',
        debe: 0,
        haber: totalCostoVentas,
        glosa: `Descargo de inventarios por ventas realizadas ${periodo}`
      }
    ];

    const asiento = {
      id: `asiento-cv-${empresaId}-${periodo}`,
      empresaId,
      subdiarioId: '11',
      subdiario: '11',
      numeroAsiento: numAsiento,
      periodoId: periodo,
      periodo,
      fecha: fechaAsiento,
      moneda: 'PEN',
      tipoCambio: 3.75,
      tipoOperacion: 'AJUSTE',
      glosa: `Asiento mensual de Costo de Ventas según Kardex Valorado ${periodo}`,
      detalles: lineas,
      totalDebe: totalCostoVentas,
      totalHaber: totalCostoVentas,
      cuadrado: true,
      estado: 'CONTABILIZADO',
      origenAutomatico: true
    };

    ASIENTOS_MEMORIA.unshift(asiento);

    return {
      asientoId: asiento.id,
      numeroAsiento: numAsiento,
      costoVentasTotal: totalCostoVentas,
      mensaje: `Asiento de Costo de Ventas ${numAsiento} generado con éxito en el Subdiario 11 por S/ ${totalCostoVentas.toFixed(2)}.`
    };
  },

  /**
   * Genera el archivo plano oficial PLE Libro 13.1 (Registro de Inventario Permanente Valorado)
   * Nomenclatura: LE{RUC}{AAAA}{MM}00130100001111.txt
   */
  async exportarPleLibro131(empresaId: string, periodo: string, ruc: string = '20100000001'): Promise<{
    nombreArchivo: string;
    contenidoTxt: string;
    totalLineas: number;
  }> {
    const movs = MOVIMIENTOS_KARDEX_MEMORIA.filter(m => m.empresaId === empresaId && m.periodo === periodo);
    const anio = periodo.split('-')[0];
    const mes = periodo.split('-')[1];

    const lineas = movs.map(m => {
      const prod = PRODUCTOS_KARDEX_MEMORIA.find(p => p.id === m.productoId);
      return [
        `${anio}${mes}00`, // Período
        m.id.slice(0, 10), // Correlativo
        'M001', // Código establecimiento
        prod?.tipoExistenciaSUNAT || '01', // Tipo existencia
        prod?.codigoProducto || 'PROD', // Código de producto
        prod?.descripcion.replace(/\|/g, ' ') || '',
        prod?.unidadMedidaSUNAT || 'NIU',
        m.tipoOperacionSUNAT,
        m.tipoComprobanteSUNAT || '01',
        m.serieComprobante || 'F001',
        m.numeroComprobante || '00000001',
        m.cantidadEntrada.toFixed(2),
        m.costoUnitarioEntrada.toFixed(4),
        m.costoTotalEntrada.toFixed(2),
        m.cantidadSalida.toFixed(2),
        m.costoUnitarioSalida.toFixed(4),
        m.costoTotalSalida.toFixed(2),
        m.saldoCantidad.toFixed(2),
        m.saldoCostoUnitario.toFixed(4),
        m.saldoCostoTotal.toFixed(2),
        '1' // Estado de la anotación
      ].join('|') + '|';
    });

    const nombreArchivo = `LE${ruc}${anio}${mes}00130100001111.txt`;
    const contenidoTxt = lineas.join('\r\n');

    return {
      nombreArchivo,
      contenidoTxt,
      totalLineas: movs.length
    };
  }
};
