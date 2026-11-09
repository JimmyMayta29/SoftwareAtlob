import { empresaRepository } from '../repositories/empresaRepository';
import { Money } from '../utils/decimal';
import { db } from '../config/database';

export type TipoOperacionContable =
  | 'COMPRA_MERCADERIA'
  | 'COMPRA_SERVICIO'
  | 'COMPRA_ACTIVO'
  | 'VENTA'
  | 'COBRANZA'
  | 'PAGO'
  | 'HONORARIO'
  | 'PLANILLA'
  | 'DETRACCION'
  | 'DETRACCION_DEPOSITO'
  | 'TRANSFERENCIA'
  | 'PAGO_PLANILLA'
  | 'CAJA_CHICA_REPOSICION'
  | 'DESTINO_FUNCION'
  | 'DESTINO_ALMACEN'
  | 'DIFERENCIA_CAMBIO';

export interface DatosOperacionContable {
  total: number;
  baseImponible?: number;
  igv?: number;
  retencion?: number;
  neto?: number;
  glosa: string;
  docTipo?: string;
  docSerie?: string;
  docNumero?: string;
  fechaEmision?: string;
  fechaVencimiento?: string;
  anexoId?: string;
  anexoRuc?: string;
  anexoRazonSocial?: string;
  moneda?: 'PEN' | 'USD';
  tipoCambio?: number;
  porcentajeAdmin?: number;
  porcentajeVentas?: number;

  // Fase 4: Cuentas específicas y transferencias
  cuentaFinancieraCodigo?: string; // Ej: 1041, 1011, 1042
  cuentaOrigenCodigo?: string;
  cuentaDestinoCodigo?: string;
  montoOrigen?: number;
  montoDestino?: number;
  monedaOrigen?: 'PEN' | 'USD';
  monedaDestino?: 'PEN' | 'USD';
  diferenciaCambio?: number;
  tipoDiferencia?: 'GANANCIA' | 'PERDIDA' | 'NINGUNA';
  cuentaGastoHonorario?: string; // Ej: 6321

  // Fase 4: Desglose detallado de Planilla
  sueldoBasico?: number;
  asignacionFamiliar?: number;
  horasExtras?: number;
  otrosIngresos?: number;
  aporteONP?: number;
  aporteAFP?: number;
  comisionAFP?: number;
  seguroAFP?: number;
  retencionQuinta?: number;
  otrosDescuentos?: number;
  aporteEsSalud?: number;
  netoPlanilla?: number;
}

export interface LineaAsientoPropuesta {
  linea: number;
  codigoCuenta: string;
  denominacionCuenta: string;
  cuentaId?: string;
  anexoId?: string;
  debe: number;
  haber: number;
  debeMe?: number;
  haberMe?: number;
  glosaLinea: string;
  docTipo?: string;
  docSerie?: string;
  docNumero?: string;
  fechaVencimiento?: string;
}

export interface ResultadoPrevisualizacion {
  glosaGeneral: string;
  lineas: LineaAsientoPropuesta[];
  totalDebe: number;
  totalHaber: number;
  cuadrado: boolean;
  diferencia: number;
}


export interface CompraAutomatizadaInput {
  proveedorId: string;
  docTipo: string;
  docSerie: string;
  docNumero: string;
  fechaEmision: string;
  fechaContable?: string;
  baseImponible: number;
  baseGravadaDestino2?: number;
  baseGravadaDestino3?: number;
  baseNoGravada?: number;
  exonerado?: number;
  isc?: number;
  icbper?: number;
  otrosTributos?: number;
  tienePercepcion?: boolean;
  montoPercepcion?: number;
  cuentaCompra?: string;
  desgloseCuentas?: Array<{
    cuentaCodigo: string;
    denominacion?: string;
    monto: number;
    centroCostoId?: string;
    glosa?: string;
  }>;
  destino: '1' | '2' | '3' | '4';
  moneda?: 'PEN' | 'USD';
  tipoCambio?: number;
  tieneDetraccion?: boolean;
  montoDetraccion?: number;
  tieneRetencion?: boolean;
  montoRetencion?: number;
  glosa?: string;
}

export interface VentaAutomatizadaInput {
  clienteId: string;
  docTipo: string;
  docSerie: string;
  docNumero: string;
  fechaEmision: string;
  fechaContable?: string;
  baseImponible: number;
  igv?: number;
  cuentaVenta?: string;
  costoVenta?: number;
  moneda?: 'PEN' | 'USD';
  tipoCambio?: number;
  glosa?: string;
}

export const contabilizacionService = {
  /**
   * Genera las líneas de asiento propuestas evaluando las reglas configuradas por empresa.
   * Si no hay reglas personalizadas en BD, usa los parámetros estándar del PCGE y proporciones de la empresa.
   */
  async generar(
    empresaId: string,
    tipoOperacion: TipoOperacionContable,
    datos: DatosOperacionContable
  ): Promise<ResultadoPrevisualizacion> {
    const total = Money.create(datos.total);
    const tipoCambio = datos.tipoCambio && datos.tipoCambio > 0 ? datos.tipoCambio : 1.0;
    const esDolares = datos.moneda === 'USD';

    // Determinar base imponible e IGV
    const igv = datos.igv !== undefined
      ? Money.create(datos.igv)
      : Money.round(total.minus(total.dividedBy(1.18)));
    const base = datos.baseImponible !== undefined
      ? Money.create(datos.baseImponible)
      : Money.sub(total, igv);

    const lineas: LineaAsientoPropuesta[] = [];
    let lineaNum = 1;

    // Proporciones de destino de la empresa (por defecto 60% Admin / 40% Ventas)
    const pctAdmin = datos.porcentajeAdmin !== undefined ? datos.porcentajeAdmin : 60;
    const pctVentas = datos.porcentajeVentas !== undefined ? datos.porcentajeVentas : 40;

    switch (tipoOperacion) {
      case 'COMPRA_MERCADERIA': {
        // 1. Gasto Mercadería
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '6011',
          denominacionCuenta: 'Mercaderías manufacturadas',
          debe: Money.toNumber(base),
          haber: 0.00,
          glosaLinea: `Por la compra según ${datos.docSerie}-${datos.docNumero}`,
          docTipo: datos.docTipo,
          docSerie: datos.docSerie,
          docNumero: datos.docNumero,
          anexoId: datos.anexoId
        });
        // 2. Crédito Fiscal IGV
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '40111',
          denominacionCuenta: 'IGV - Cuenta propia',
          debe: Money.toNumber(igv),
          haber: 0.00,
          glosaLinea: `IGV por compra ${datos.docSerie}-${datos.docNumero}`
        });
        // 3. Pasivo Proveedor
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '4212',
          denominacionCuenta: 'Facturas, boletas y otros comprobantes por pagar - Emitidas',
          debe: 0.00,
          haber: Money.toNumber(total),
          glosaLinea: `Obligación por compra ${datos.docSerie}-${datos.docNumero}`,
          docTipo: datos.docTipo,
          docSerie: datos.docSerie,
          docNumero: datos.docNumero,
          anexoId: datos.anexoId,
          fechaVencimiento: datos.fechaVencimiento
        });
        // 4 y 5. Asiento de Destino al Almacén (Elemento 2 vs 61)
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '20111',
          denominacionCuenta: 'Mercaderías manufacturadas - Costo',
          debe: Money.toNumber(base),
          haber: 0.00,
          glosaLinea: 'Destino de mercaderías ingresadas al almacén'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '6111',
          denominacionCuenta: 'Mercaderías',
          debe: 0.00,
          haber: Money.toNumber(base),
          glosaLinea: 'Variación de existencias - Mercaderías'
        });
        break;
      }

      case 'COMPRA_SERVICIO': {
        // 1. Servicio
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '6311',
          denominacionCuenta: 'Transporte de carga y servicios prestados por terceros',
          debe: Money.toNumber(base),
          haber: 0.00,
          glosaLinea: `Gasto por servicios según ${datos.docSerie}-${datos.docNumero}`,
          anexoId: datos.anexoId
        });
        // 2. IGV
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '40111',
          denominacionCuenta: 'IGV - Cuenta propia',
          debe: Money.toNumber(igv),
          haber: 0.00,
          glosaLinea: `IGV servicio ${datos.docSerie}-${datos.docNumero}`
        });
        // 3. Proveedor
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '4212',
          denominacionCuenta: 'Facturas por pagar - Emitidas',
          debe: 0.00,
          haber: Money.toNumber(total),
          glosaLinea: `Obligación por servicio ${datos.docSerie}-${datos.docNumero}`,
          anexoId: datos.anexoId
        });
        // 4, 5 y 6. Destino por Función (94/95 vs 79)
        const montoAdmin = Money.round(base.times(pctAdmin).dividedBy(100));
        const montoVentas = Money.sub(base, montoAdmin);

        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '941',
          denominacionCuenta: `Gastos de Administración (${pctAdmin}%)`,
          debe: Money.toNumber(montoAdmin),
          haber: 0.00,
          glosaLinea: `Distribución de gastos administrativos (${pctAdmin}%)`
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '951',
          denominacionCuenta: `Gastos de Ventas (${pctVentas}%)`,
          debe: Money.toNumber(montoVentas),
          haber: 0.00,
          glosaLinea: `Distribución de gastos de ventas (${pctVentas}%)`
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '791',
          denominacionCuenta: 'Cargas imputables a cuenta de costos y gastos',
          debe: 0.00,
          haber: Money.toNumber(base),
          glosaLinea: 'Transferencia de gastos por función'
        });
        break;
      }

      case 'COMPRA_ACTIVO': {
        // 1. Activo Fijo (Propiedad, Planta y Equipo)
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '33311',
          denominacionCuenta: 'Maquinarias y equipos de explotación - Costo',
          debe: Money.toNumber(base),
          haber: 0.00,
          glosaLinea: `Adquisición de activo fijo según ${datos.docSerie}-${datos.docNumero}`,
          anexoId: datos.anexoId
        });
        // 2. IGV
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '40111',
          denominacionCuenta: 'IGV - Cuenta propia',
          debe: Money.toNumber(igv),
          haber: 0.00,
          glosaLinea: `IGV adquisición de activo ${datos.docSerie}-${datos.docNumero}`
        });
        // 3. Proveedor / Cuentas por pagar diversas
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '4212',
          denominacionCuenta: 'Facturas por pagar - Emitidas',
          debe: 0.00,
          haber: Money.toNumber(total),
          glosaLinea: `Obligación por compra de activo ${datos.docSerie}-${datos.docNumero}`,
          anexoId: datos.anexoId
        });
        break;
      }

      case 'VENTA': {
        // 1. Cliente
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '1212',
          denominacionCuenta: 'Facturas por cobrar - Emitidas en cartera',
          debe: Money.toNumber(total),
          haber: 0.00,
          glosaLinea: `Cobro según comprobante ${datos.docSerie}-${datos.docNumero}`,
          anexoId: datos.anexoId,
          docTipo: datos.docTipo,
          docSerie: datos.docSerie,
          docNumero: datos.docNumero
        });
        // 2. Débito Fiscal IGV
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '40111',
          denominacionCuenta: 'IGV - Cuenta propia',
          debe: 0.00,
          haber: Money.toNumber(igv),
          glosaLinea: `Débito fiscal IGV 18% venta ${datos.docSerie}-${datos.docNumero}`
        });
        // 3. Ingreso por Venta
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '70111',
          denominacionCuenta: 'Mercaderías manufacturadas - Venta local',
          debe: 0.00,
          haber: Money.toNumber(base),
          glosaLinea: `Venta de mercaderías comprobante ${datos.docSerie}-${datos.docNumero}`
        });
        break;
      }

      case 'COBRANZA': {
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '1041',
          denominacionCuenta: 'Cuentas corrientes operativas',
          debe: Money.toNumber(total),
          haber: 0.00,
          glosaLinea: datos.glosa || 'Cobranza en cuenta corriente'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '1212',
          denominacionCuenta: 'Facturas por cobrar - Emitidas en cartera',
          debe: 0.00,
          haber: Money.toNumber(total),
          glosaLinea: `Cancelación de cuenta por cobrar`,
          anexoId: datos.anexoId
        });
        break;
      }

      case 'PAGO': {
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '4212',
          denominacionCuenta: 'Facturas por pagar - Emitidas',
          debe: Money.toNumber(total),
          haber: 0.00,
          glosaLinea: `Cancelación a proveedor`,
          anexoId: datos.anexoId
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '1041',
          denominacionCuenta: 'Cuentas corrientes operativas',
          debe: 0.00,
          haber: Money.toNumber(total),
          glosaLinea: datos.glosa || 'Pago con transferencia bancaria'
        });
        break;
      }

      case 'HONORARIO': {
        const retencion = datos.retencion !== undefined
          ? Money.create(datos.retencion)
          : (total.greaterThan(1500) ? Money.round(total.times(0.08)) : Money.create(0));
        const neto = Money.sub(total, retencion);

        // Gasto Honorarios
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '6321',
          denominacionCuenta: 'Asesoría y consultoría - Administrativa',
          debe: Money.toNumber(total),
          haber: 0.00,
          glosaLinea: `Gasto por honorarios profesionales ${datos.docSerie}-${datos.docNumero}`,
          anexoId: datos.anexoId
        });
        if (!retencion.isZero()) {
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: '40172',
            denominacionCuenta: 'Renta de cuarta categoría por pagar (8%)',
            debe: 0.00,
            haber: Money.toNumber(retencion),
            glosaLinea: `Retención 8% Impuesto a la Renta de 4ta categoría`
          });
        }
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '424',
          denominacionCuenta: 'Honorarios por pagar',
          debe: 0.00,
          haber: Money.toNumber(neto),
          glosaLinea: `Neto a pagar honorario ${datos.docSerie}-${datos.docNumero}`,
          anexoId: datos.anexoId
        });
        // Destino por Función (94/95 vs 79)
        const montoAdmin = Money.round(total.times(pctAdmin).dividedBy(100));
        const montoVentas = Money.sub(total, montoAdmin);

        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '941',
          denominacionCuenta: `Gastos de Administración (${pctAdmin}%)`,
          debe: Money.toNumber(montoAdmin),
          haber: 0.00,
          glosaLinea: `Destino administrativo honorario`
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '951',
          denominacionCuenta: `Gastos de Ventas (${pctVentas}%)`,
          debe: Money.toNumber(montoVentas),
          haber: 0.00,
          glosaLinea: `Destino ventas honorario`
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '791',
          denominacionCuenta: 'Cargas imputables a cuenta de costos y gastos',
          debe: 0.00,
          haber: Money.toNumber(total),
          glosaLinea: `Transferencia de cargas por honorario profesional`
        });
        break;
      }

      case 'PLANILLA': {
        const tieneDetalle = datos.sueldoBasico !== undefined;
        const sueldoBruto = tieneDetalle
          ? Money.create((datos.sueldoBasico || 0) + (datos.asignacionFamiliar || 0) + (datos.horasExtras || 0) + (datos.otrosIngresos || 0))
          : total;
        const essalud = tieneDetalle && datos.aporteEsSalud !== undefined
          ? Money.create(datos.aporteEsSalud)
          : Money.round(sueldoBruto.times(0.09));
        const onp = tieneDetalle && datos.aporteONP !== undefined
          ? Money.create(datos.aporteONP)
          : (tieneDetalle ? Money.create(0) : Money.round(sueldoBruto.times(0.13)));
        const afpTotal = tieneDetalle
          ? Money.create((datos.aporteAFP || 0) + (datos.comisionAFP || 0) + (datos.seguroAFP || 0))
          : Money.create(0);
        const renta5ta = tieneDetalle && datos.retencionQuinta !== undefined
          ? Money.create(datos.retencionQuinta)
          : Money.create(0);
        const otrosDesc = tieneDetalle && datos.otrosDescuentos !== undefined
          ? Money.create(datos.otrosDescuentos)
          : Money.create(0);

        const netoPagar = tieneDetalle && datos.netoPlanilla !== undefined
          ? Money.create(datos.netoPlanilla)
          : Money.sub(sueldoBruto, Money.add(onp, Money.add(afpTotal, renta5ta)));

        const costoTotal = Money.add(sueldoBruto, essalud);

        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '6211',
          denominacionCuenta: 'Sueldos y salarios',
          debe: Money.toNumber(sueldoBruto),
          haber: 0.00,
          glosaLinea: 'Planilla mensual de remuneraciones del personal'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '6271',
          denominacionCuenta: 'Régimen de prestaciones de salud (EsSalud 9%)',
          debe: Money.toNumber(essalud),
          haber: 0.00,
          glosaLinea: 'Aporte patronal de EsSalud 9%'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '4031',
          denominacionCuenta: 'EsSalud por pagar',
          debe: 0.00,
          haber: Money.toNumber(essalud),
          glosaLinea: 'Tributos por pagar EsSalud'
        });

        if (!onp.isZero()) {
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: '4032',
            denominacionCuenta: 'ONP - Sistema Nacional de Pensiones por pagar (13%)',
            debe: 0.00,
            haber: Money.toNumber(onp),
            glosaLinea: 'Retención aportes previsionales ONP'
          });
        }

        if (!afpTotal.isZero()) {
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: '407',
            denominacionCuenta: 'Administradoras de Fondos de Pensiones (AFP) por pagar',
            debe: 0.00,
            haber: Money.toNumber(afpTotal),
            glosaLinea: 'Retención aportes previsionales AFP (Fondo + Seguros)'
          });
        }

        if (!renta5ta.isZero()) {
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: '40173',
            denominacionCuenta: 'Renta de quinta categoría por pagar',
            debe: 0.00,
            haber: Money.toNumber(renta5ta),
            glosaLinea: 'Retención de Impuesto a la Renta de 5ta categoría'
          });
        }

        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '4111',
          denominacionCuenta: 'Remuneraciones por pagar',
          debe: 0.00,
          haber: Money.toNumber(netoPagar),
          glosaLinea: 'Neto a pagar a trabajadores en planilla'
        });

        // Destino por Función (94/95 vs 79)
        const adminDestino = Money.round(costoTotal.times(pctAdmin).dividedBy(100));
        const ventasDestino = Money.sub(costoTotal, adminDestino);

        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '941',
          denominacionCuenta: `Gastos de Administración (${pctAdmin}%)`,
          debe: Money.toNumber(adminDestino),
          haber: 0.00,
          glosaLinea: 'Destino de planilla a gastos administrativos'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '951',
          denominacionCuenta: `Gastos de Ventas (${pctVentas}%)`,
          debe: Money.toNumber(ventasDestino),
          haber: 0.00,
          glosaLinea: 'Destino de planilla a gastos de ventas'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '791',
          denominacionCuenta: 'Cargas imputables a cuenta de costos y gastos',
          debe: 0.00,
          haber: Money.toNumber(costoTotal),
          glosaLinea: 'Transferencia de costos de planilla por función'
        });
        break;
      }

      case 'TRANSFERENCIA': {
        const ctaOrigen = datos.cuentaOrigenCodigo || '10411';
        const ctaDestino = datos.cuentaDestinoCodigo || '10412';
        const montoOrigen = Money.create(datos.montoOrigen ?? datos.total);
        const montoDestino = Money.create(datos.montoDestino ?? datos.total);
        const difCambio = Money.create(datos.diferenciaCambio || 0);

        // Cuenta Destino al Debe
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: ctaDestino,
          denominacionCuenta: 'Cuenta financiera destino',
          debe: Money.toNumber(montoDestino),
          haber: 0.00,
          glosaLinea: datos.glosa || 'Transferencia entre cuentas - Ingreso a destino'
        });

        // Si hay pérdida por diferencia de cambio (Debe cuenta 676)
        if (datos.tipoDiferencia === 'PERDIDA' && !difCambio.isZero()) {
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: '676',
            denominacionCuenta: 'Pérdida por diferencia de cambio',
            debe: Money.toNumber(difCambio),
            haber: 0.00,
            glosaLinea: 'Ajuste por diferencia de cambio en transferencia bancaria'
          });
        }

        // Cuenta Origen al Haber
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: ctaOrigen,
          denominacionCuenta: 'Cuenta financiera origen',
          debe: 0.00,
          haber: Money.toNumber(montoOrigen),
          glosaLinea: datos.glosa || 'Transferencia entre cuentas - Salida de origen'
        });

        // Si hay ganancia por diferencia de cambio (Haber cuenta 776)
        if (datos.tipoDiferencia === 'GANANCIA' && !difCambio.isZero()) {
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: '776',
            denominacionCuenta: 'Ganancia por diferencia de cambio',
            debe: 0.00,
            haber: Money.toNumber(difCambio),
            glosaLinea: 'Ajuste por diferencia de cambio en transferencia bancaria'
          });
        }
        break;
      }

      case 'DETRACCION_DEPOSITO': {
        const ctaFinanciera = datos.cuentaFinancieraCodigo || '1042';
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '4212',
          denominacionCuenta: 'Facturas por pagar - Emitidas (Cancelación detracción SPOT)',
          debe: Money.toNumber(total),
          haber: 0.00,
          glosaLinea: datos.glosa || 'Depósito de detracción SPOT a cuenta Banco de la Nación',
          anexoId: datos.anexoId
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: ctaFinanciera,
          denominacionCuenta: 'Banco de la Nación - Cuenta de detracciones SPOT',
          debe: 0.00,
          haber: Money.toNumber(total),
          glosaLinea: datos.glosa || 'Salida de fondos para depósito de detracción'
        });
        break;
      }

      case 'PAGO_PLANILLA': {
        const ctaFinanciera = datos.cuentaFinancieraCodigo || '1041';
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '4111',
          denominacionCuenta: 'Remuneraciones por pagar',
          debe: Money.toNumber(total),
          haber: 0.00,
          glosaLinea: datos.glosa || 'Pago de sueldos y salarios de planilla'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: ctaFinanciera,
          denominacionCuenta: 'Cuentas corrientes operativas',
          debe: 0.00,
          haber: Money.toNumber(total),
          glosaLinea: datos.glosa || 'Transferencia bancaria por pago de haberes'
        });
        break;
      }

      case 'CAJA_CHICA_REPOSICION': {
        const ctaFinanciera = datos.cuentaFinancieraCodigo || '1041';
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '659',
          denominacionCuenta: 'Otros gastos de gestión - Rendición de Caja Chica',
          debe: Money.toNumber(total),
          haber: 0.00,
          glosaLinea: datos.glosa || 'Reposición de fondos por rendición de gastos menores'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: ctaFinanciera,
          denominacionCuenta: 'Cuentas corrientes operativas',
          debe: 0.00,
          haber: Money.toNumber(total),
          glosaLinea: datos.glosa || 'Cheque / transferencia reposición fondo de caja chica'
        });
        // Destino
        const adminDestino = Money.round(total.times(pctAdmin).dividedBy(100));
        const ventasDestino = Money.sub(total, adminDestino);
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '941',
          denominacionCuenta: `Gastos de Administración (${pctAdmin}%)`,
          debe: Money.toNumber(adminDestino),
          haber: 0.00,
          glosaLinea: 'Destino reposición caja chica'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '951',
          denominacionCuenta: `Gastos de Ventas (${pctVentas}%)`,
          debe: Money.toNumber(ventasDestino),
          haber: 0.00,
          glosaLinea: 'Destino reposición caja chica'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '791',
          denominacionCuenta: 'Cargas imputables a cuenta de costos y gastos',
          debe: 0.00,
          haber: Money.toNumber(total),
          glosaLinea: 'Transferencia por destino caja chica'
        });
        break;
      }

      default:
        break;
    }

    // Calcular totales y verificar cuadre
    let sumDebe = Money.create(0);
    let sumHaber = Money.create(0);

    for (const l of lineas) {
      if (esDolares) {
        l.debeMe = l.debe;
        l.haberMe = l.haber;
        l.debe = Money.toNumber(Money.mul(l.debe, tipoCambio));
        l.haber = Money.toNumber(Money.mul(l.haber, tipoCambio));
      }
      sumDebe = Money.add(sumDebe, l.debe);
      sumHaber = Money.add(sumHaber, l.haber);
    }

    const dif = Money.sub(sumDebe, sumHaber);

    return {
      glosaGeneral: datos.glosa || `Asiento automático de ${tipoOperacion}`,
      lineas,
      totalDebe: Money.toNumber(sumDebe),
      totalHaber: Money.toNumber(sumHaber),
      cuadrado: Money.isEqual(sumDebe, sumHaber),
      diferencia: Money.toNumber(dif)
    };
  },

  /**
   * Genera el asiento automatizado de compra evaluando el método de inventario y el destino SUNAT (1, 2, 3 o 4).
   * - En destinos 3 o 4: el IGV NO se separa en 40111, se suma al costo/gasto (cuentaCompra).
   * - Si el método es PERMANENTE: genera asiento de destino al almacén (20111 / 6111).
   * - Si el método es PERIODICO: omite el destino en la compra (se calcula en la consolidación mensual).
   */
  async generarAsientoCompraAutomatizada(
    empresaId: string,
    input: CompraAutomatizadaInput
  ): Promise<ResultadoPrevisualizacion & { metodoInventario: 'PERIODICO' | 'PERMANENTE'; costoTotal: number }> {
    const empresa = await empresaRepository.obtenerPorId(empresaId);
    if (!empresa?.metodoInventario) {
      throw new Error('METODO_INVENTARIO_REQUERIDO: La empresa no tiene definido un método de inventario (PERIODICO o PERMANENTE). Debe ser configurado por un Administrador del estudio antes de generar asientos automáticos.');
    }

    const metodoInventario = empresa.metodoInventario;
    const base = Money.create(input.baseImponible);
    const tipoCambio = input.tipoCambio && input.tipoCambio > 0 ? input.tipoCambio : 1.0;
    const esDolares = input.moneda === 'USD';
    const ctaCompra = input.cuentaCompra || '6011';

    // Validación preventiva de cuenta de mayor (2 dígitos)
    if (ctaCompra.length === 2 || ['10', '12', '14', '16', '20', '33', '40', '42', '50', '60', '70'].includes(ctaCompra)) {
      throw new Error(`CUENTA_NO_IMPUTABLE: La cuenta de compra ${ctaCompra} es una cuenta de mayor y no permite apuntes directos.`);
    }

    const lineas: LineaAsientoPropuesta[] = [];
    let lineaNum = 1;

    let igv = Money.create(0);
    let costoCompra = base;
    let totalComprobante = base;

    const tieneDesglose = Array.isArray(input.desgloseCuentas) && input.desgloseCuentas.length > 0;
    const montoNoGravado = Money.create((input.baseNoGravada || 0) + (input.exonerado || 0));
    const montoIsc = Money.create(input.isc || 0);
    const montoIcbper = Money.create(input.icbper || 0);
    const montoOtrosTrib = Money.create(input.otrosTributos || 0);
    const montoPercepcion = input.tienePercepcion && input.montoPercepcion ? Money.create(input.montoPercepcion) : Money.create(0);
    const montoRetencion = input.tieneRetencion && input.montoRetencion ? Money.create(input.montoRetencion) : Money.create(0);

    if (input.destino === '1' || input.destino === '2') {
      // Destinos 1 y 2: Derecho a crédito fiscal
      igv = Money.round(base.times(0.18));
      costoCompra = base;
      totalComprobante = Money.add(base, igv);

      // 1. Cuentas de compra (Gasto / Costo)
      if (tieneDesglose) {
        for (const item of input.desgloseCuentas!) {
          if (item.monto > 0) {
            lineas.push({
              linea: lineaNum++,
              codigoCuenta: item.cuentaCodigo,
              denominacionCuenta: item.denominacion || 'Compra / Gasto desglosado',
              debe: Number(item.monto),
              haber: 0.00,
              glosaLinea: item.glosa || `Compra desglosada ${input.docSerie}-${input.docNumero}`,
              docTipo: input.docTipo,
              docSerie: input.docSerie,
              docNumero: input.docNumero,
              anexoId: input.proveedorId
            });
          }
        }
      } else {
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: ctaCompra,
          denominacionCuenta: 'Mercaderías manufacturadas - Costo',
          debe: Money.toNumber(costoCompra),
          haber: 0.00,
          glosaLinea: `Compra comprobante ${input.docSerie}-${input.docNumero} (Destino ${input.destino})`,
          docTipo: input.docTipo,
          docSerie: input.docSerie,
          docNumero: input.docNumero,
          anexoId: input.proveedorId
        });
      }

      // 2. Crédito Fiscal IGV
      lineas.push({
        linea: lineaNum++,
        codigoCuenta: '40111',
        denominacionCuenta: 'IGV - Cuenta propia',
        debe: Money.toNumber(igv),
        haber: 0.00,
        glosaLinea: `Crédito fiscal IGV 18% compra ${input.docSerie}-${input.docNumero}`
      });

      // 3. Destino al Almacén (SOLO en método PERMANENTE para cuentas clase 60)
      if (metodoInventario === 'PERMANENTE' && ctaCompra.startsWith('60')) {
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '20111',
          denominacionCuenta: 'Mercaderías manufacturadas - Costo almacén',
          debe: Money.toNumber(costoCompra),
          haber: 0.00,
          glosaLinea: 'Destino de mercaderías ingresadas al almacén'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '6111',
          denominacionCuenta: 'Mercaderías',
          debe: 0.00,
          haber: Money.toNumber(costoCompra),
          glosaLinea: 'Variación de existencias - Mercaderías'
        });
      }
    } else if (input.destino === '3') {
      // Destino 3: Sin derecho a crédito fiscal -> IGV sumado al costo en cuentaCompra (6011)
      igv = Money.round(base.times(0.18));
      costoCompra = Money.add(base, igv); // IGV sumado al costo
      totalComprobante = costoCompra;

      // 1. Costo con IGV incluido en 6011
      lineas.push({
        linea: lineaNum++,
        codigoCuenta: ctaCompra,
        denominacionCuenta: 'Mercaderías manufacturadas (Costo + IGV no recuperable)',
        debe: Money.toNumber(costoCompra),
        haber: 0.00,
        glosaLinea: `Compra con IGV al costo (Destino 3) ${input.docSerie}-${input.docNumero}`,
        docTipo: input.docTipo,
        docSerie: input.docSerie,
        docNumero: input.docNumero,
        anexoId: input.proveedorId
      });

      // Destino al Almacén por el valor total de costo (SOLO en método PERMANENTE)
      if (metodoInventario === 'PERMANENTE') {
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '20111',
          denominacionCuenta: 'Mercaderías manufacturadas - Costo almacén',
          debe: Money.toNumber(costoCompra),
          haber: 0.00,
          glosaLinea: 'Destino al almacén por costo total (Base + IGV sin crédito fiscal)'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '6111',
          denominacionCuenta: 'Mercaderías',
          debe: 0.00,
          haber: Money.toNumber(costoCompra),
          glosaLinea: 'Variación de existencias - Mercaderías'
        });
      }
    } else {
      // Destino 4: No gravado (exonerado / inafecto)
      costoCompra = base;
      totalComprobante = base;

      lineas.push({
        linea: lineaNum++,
        codigoCuenta: ctaCompra,
        denominacionCuenta: 'Mercaderías no gravadas / exoneradas',
        debe: Money.toNumber(costoCompra),
        haber: 0.00,
        glosaLinea: `Compra no gravada (Destino 4) ${input.docSerie}-${input.docNumero}`,
        docTipo: input.docTipo,
        docSerie: input.docSerie,
        docNumero: input.docNumero,
        anexoId: input.proveedorId
      });

      if (metodoInventario === 'PERMANENTE') {
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '20111',
          denominacionCuenta: 'Mercaderías manufacturadas - Costo almacén',
          debe: Money.toNumber(costoCompra),
          haber: 0.00,
          glosaLinea: 'Destino al almacén mercaderías'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '6111',
          denominacionCuenta: 'Mercaderías',
          debe: 0.00,
          haber: Money.toNumber(costoCompra),
          glosaLinea: 'Variación de existencias - Mercaderías'
        });
      }
    }

    // Conceptos tributarios complementarios (Exoneradas adicionales, ISC, ICBPER, Otros Tributos, Percepción)
    if (montoNoGravado.greaterThan(0) && input.destino !== '4') {
      lineas.push({
        linea: lineaNum++,
        codigoCuenta: ctaCompra,
        denominacionCuenta: 'Adquisiciones no gravadas / exoneradas',
        debe: Money.toNumber(montoNoGravado),
        haber: 0.00,
        glosaLinea: `Operaciones no gravadas / exoneradas ${input.docSerie}-${input.docNumero}`,
        docTipo: input.docTipo,
        docSerie: input.docSerie,
        docNumero: input.docNumero,
        anexoId: input.proveedorId
      });
      totalComprobante = Money.add(totalComprobante, montoNoGravado);
    }

    if (montoIsc.greaterThan(0)) {
      lineas.push({
        linea: lineaNum++,
        codigoCuenta: '6412',
        denominacionCuenta: 'Impuesto selectivo al consumo',
        debe: Money.toNumber(montoIsc),
        haber: 0.00,
        glosaLinea: `ISC compra ${input.docSerie}-${input.docNumero}`
      });
      totalComprobante = Money.add(totalComprobante, montoIsc);
    }

    if (montoIcbper.greaterThan(0)) {
      lineas.push({
        linea: lineaNum++,
        codigoCuenta: '6413',
        denominacionCuenta: 'Impuesto al consumo de las bolsas de plástico',
        debe: Money.toNumber(montoIcbper),
        haber: 0.00,
        glosaLinea: `ICBPER bolsas ${input.docSerie}-${input.docNumero}`
      });
      totalComprobante = Money.add(totalComprobante, montoIcbper);
    }

    if (montoOtrosTrib.greaterThan(0)) {
      lineas.push({
        linea: lineaNum++,
        codigoCuenta: '6491',
        denominacionCuenta: 'Otros tributos y recargos no gravados',
        debe: Money.toNumber(montoOtrosTrib),
        haber: 0.00,
        glosaLinea: `Otros tributos compra ${input.docSerie}-${input.docNumero}`
      });
      totalComprobante = Money.add(totalComprobante, montoOtrosTrib);
    }

    if (montoPercepcion.greaterThan(0)) {
      lineas.push({
        linea: lineaNum++,
        codigoCuenta: '40113',
        denominacionCuenta: 'IGV - Régimen de percepciones',
        debe: Money.toNumber(montoPercepcion),
        haber: 0.00,
        glosaLinea: `Percepción de IGV compra ${input.docSerie}-${input.docNumero}`
      });
      totalComprobante = Money.add(totalComprobante, montoPercepcion);
    }

    // Obligación comercial al Proveedor y Retenciones / Detracciones
    const montoDet = input.tieneDetraccion && input.montoDetraccion ? Money.create(input.montoDetraccion) : Money.create(0);
    let netoPagar = totalComprobante;

    if (montoDet.greaterThan(0)) {
      netoPagar = Money.sub(netoPagar, montoDet);
    }

    if (montoRetencion.greaterThan(0)) {
      netoPagar = Money.sub(netoPagar, montoRetencion);
      lineas.push({
        linea: lineaNum++,
        codigoCuenta: '40114',
        denominacionCuenta: 'IGV - Régimen de retenciones',
        debe: 0.00,
        haber: Money.toNumber(montoRetencion),
        glosaLinea: `Retención de IGV 3% ${input.docSerie}-${input.docNumero}`,
        docTipo: input.docTipo,
        docSerie: input.docSerie,
        docNumero: input.docNumero,
        anexoId: input.proveedorId
      });
    }

    lineas.push({
      linea: lineaNum++,
      codigoCuenta: '4212',
      denominacionCuenta: 'Facturas, boletas y otros comprobantes por pagar - Emitidas',
      debe: 0.00,
      haber: Money.toNumber(netoPagar),
      glosaLinea: `Obligación neta por compra ${input.docSerie}-${input.docNumero}`,
      docTipo: input.docTipo,
      docSerie: input.docSerie,
      docNumero: input.docNumero,
      anexoId: input.proveedorId
    });

    if (montoDet.greaterThan(0)) {
      lineas.push({
        linea: lineaNum++,
        codigoCuenta: '4213',
        denominacionCuenta: 'Detracciones por pagar (SPOT)',
        debe: 0.00,
        haber: Money.toNumber(montoDet),
        glosaLinea: `Detracción SPOT ${input.docSerie}-${input.docNumero}`,
        docTipo: input.docTipo,
        docSerie: input.docSerie,
        docNumero: input.docNumero,
        anexoId: input.proveedorId
      });
    }

    // Calcular totales y verificar cuadre
    let sumDebe = Money.create(0);
    let sumHaber = Money.create(0);

    for (const l of lineas) {
      if (esDolares) {
        l.debeMe = l.debe;
        l.haberMe = l.haber;
        l.debe = Money.toNumber(Money.mul(l.debe, tipoCambio));
        l.haber = Money.toNumber(Money.mul(l.haber, tipoCambio));
      }
      sumDebe = Money.add(sumDebe, l.debe);
      sumHaber = Money.add(sumHaber, l.haber);
    }

    const dif = Money.sub(sumDebe, sumHaber);

    return {
      glosaGeneral: input.glosa || `Compra automática ${input.docTipo} ${input.docSerie}-${input.docNumero}`,
      lineas,
      totalDebe: Money.toNumber(sumDebe),
      totalHaber: Money.toNumber(sumHaber),
      cuadrado: Money.isEqual(sumDebe, sumHaber),
      diferencia: Money.toNumber(dif),
      metodoInventario,
      costoTotal: Money.toNumber(costoCompra)
    };
  },

  /**
   * Genera el asiento automatizado de venta evaluando el método de inventario.
   * - Si es PERMANENTE: genera asiento de costo de ventas D 69111 / H 20111 si se provee costo de ventas o salida de kardex.
   * - Si es PERIODICO: omite el costo en la venta y se registra en la consolidación mensual.
   */
  async generarAsientoVentaAutomatizada(
    empresaId: string,
    input: VentaAutomatizadaInput
  ): Promise<ResultadoPrevisualizacion & { metodoInventario: 'PERIODICO' | 'PERMANENTE' }> {
    const empresa = await empresaRepository.obtenerPorId(empresaId);
    if (!empresa?.metodoInventario) {
      throw new Error('METODO_INVENTARIO_REQUERIDO: La empresa no tiene definido un método de inventario (PERIODICO o PERMANENTE). Debe ser configurado por un Administrador del estudio antes de generar asientos automáticos.');
    }

    const metodoInventario = empresa.metodoInventario;
    const base = Money.create(input.baseImponible);
    const igv = input.igv !== undefined ? Money.create(input.igv) : Money.round(base.times(0.18));
    const total = Money.add(base, igv);
    const tipoCambio = input.tipoCambio && input.tipoCambio > 0 ? input.tipoCambio : 1.0;
    const esDolares = input.moneda === 'USD';
    const ctaVenta = input.cuentaVenta || '70111';

    const lineas: LineaAsientoPropuesta[] = [];
    let lineaNum = 1;

    // 1. Cliente
    lineas.push({
      linea: lineaNum++,
      codigoCuenta: '1212',
      denominacionCuenta: 'Facturas, boletas y otros comprobantes por cobrar - Emitidas en cartera',
      debe: Money.toNumber(total),
      haber: 0.00,
      glosaLinea: `Cobro según comprobante ${input.docSerie}-${input.docNumero}`,
      docTipo: input.docTipo,
      docSerie: input.docSerie,
      docNumero: input.docNumero,
      anexoId: input.clienteId
    });

    // 2. Débito Fiscal IGV
    lineas.push({
      linea: lineaNum++,
      codigoCuenta: '40111',
      denominacionCuenta: 'IGV - Cuenta propia',
      debe: 0.00,
      haber: Money.toNumber(igv),
      glosaLinea: `Débito fiscal IGV 18% venta ${input.docSerie}-${input.docNumero}`
    });

    // 3. Ingreso por Venta
    lineas.push({
      linea: lineaNum++,
      codigoCuenta: ctaVenta,
      denominacionCuenta: 'Mercaderías manufacturadas - Venta local',
      debe: 0.00,
      haber: Money.toNumber(base),
      glosaLinea: `Venta de mercaderías comprobante ${input.docSerie}-${input.docNumero}`
    });

    // 4 y 5. Costo de ventas (SOLO si método PERMANENTE y costoVenta > 0)
    if (metodoInventario === 'PERMANENTE' && input.costoVenta !== undefined && input.costoVenta > 0) {
      const costo = Money.create(input.costoVenta);
      lineas.push({
        linea: lineaNum++,
        codigoCuenta: '69111',
        denominacionCuenta: 'Mercaderías manufacturadas - Terceros (Costo de ventas)',
        debe: Money.toNumber(costo),
        haber: 0.00,
        glosaLinea: `Costo de ventas salida de almacén según kardex ${input.docSerie}-${input.docNumero}`
      });
      lineas.push({
        linea: lineaNum++,
        codigoCuenta: '20111',
        denominacionCuenta: 'Mercaderías manufacturadas - Costo almacén',
        debe: 0.00,
        haber: Money.toNumber(costo),
        glosaLinea: `Descargo de existencias por venta ${input.docSerie}-${input.docNumero}`
      });
    }

    // Calcular totales y verificar cuadre
    let sumDebe = Money.create(0);
    let sumHaber = Money.create(0);

    for (const l of lineas) {
      if (esDolares) {
        l.debeMe = l.debe;
        l.haberMe = l.haber;
        l.debe = Money.toNumber(Money.mul(l.debe, tipoCambio));
        l.haber = Money.toNumber(Money.mul(l.haber, tipoCambio));
      }
      sumDebe = Money.add(sumDebe, l.debe);
      sumHaber = Money.add(sumHaber, l.haber);
    }

    const dif = Money.sub(sumDebe, sumHaber);

    return {
      glosaGeneral: input.glosa || `Venta automática ${input.docTipo} ${input.docSerie}-${input.docNumero}`,
      lineas,
      totalDebe: Money.toNumber(sumDebe),
      totalHaber: Money.toNumber(sumHaber),
      cuadrado: Money.isEqual(sumDebe, sumHaber),
      diferencia: Money.toNumber(dif),
      metodoInventario
    };
  }

};
