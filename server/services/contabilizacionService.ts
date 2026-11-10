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
  igv?: number;
  tasaIgv?: number;
  baseGravadaDestino2?: number;
  baseGravadaDestino3?: number;
  baseNoGravada?: number;
  exonerado?: number;
  isc?: number;
  icbper?: number;
  otrosTributos?: number;
  tratamientoTributosNoRecuperables?: 'COSTO' | 'GASTO';
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
  clienteId?: string;
  docTipo?: string;
  docSerie?: string;
  docNumero?: string;
  fechaEmision?: string;
  fechaContable?: string;
  baseImponible?: number;
  igv?: number;
  tasaIgv?: number;
  baseExonerada?: number;
  baseInafecta?: number;
  baseExportacion?: number;
  isc?: number;
  icbper?: number;
  otrosTributos?: number;
  cuentaVenta?: string;
  cuentaCosto?: string;
  costoVenta?: number;
  moneda?: 'PEN' | 'USD';
  tipoCambio?: number;
  tieneDetraccion?: boolean;
  montoDetraccion?: number;
  porcentajeDetraccion?: number;
  codigoDetraccion?: string;
  tienePercepcion?: boolean;
  montoPercepcion?: number;
  porcentajePercepcion?: number;
  tieneRetencion?: boolean;
  montoRetencion?: number;
  anticipoDeducido?: number;
  esAnticipo?: boolean;
  esGratuito?: boolean;
  descuentoGlobal?: number;
  descuentoFueraFactura?: number;
  motivoNota?: string;
  glosa?: string;
}

export interface TesoreriaAutomatizadaInput {
  subdiario?: '03' | '04' | '05';
  tipoOperacionTesoreria:
    | 'COBRANZA'
    | 'PAGO'
    | 'TRANSFERENCIA'
    | 'DEPOSITO_DETRACCION'
    | 'AUTODETRACCION'
    | 'PAGO_TRIBUTOS_DETRACCION'
    | 'LIBERACION_DETRACCION'
    | 'CAJA_CHICA_APERTURA'
    | 'CAJA_CHICA_PAGO'
    | 'CAJA_CHICA_REPOSICION';
  monto: number;
  montoMe?: number;
  moneda?: 'PEN' | 'USD';
  tipoCambio?: number;
  glosa: string;
  cuentaFinancieraCodigo?: string;
  cuentaContrapartidaCodigo?: string;
  anexoId?: string;
  anexoNombre?: string;
  docTipo?: string;
  docSerie?: string;
  docNumero?: string;
  tieneRetencion?: boolean;
  montoRetencion?: number;
  porcentajeRetencion?: number;
  diferenciaCambio?: number;
  tipoDiferencia?: 'GANANCIA' | 'PERDIDA' | 'NINGUNA';
  montoOriginalDoc?: number;
  esCheque?: boolean;
  esDepositoCheque?: boolean;
  esAnticipo?: boolean;
  tipoTributo?: 'IGV' | 'RENTA' | 'ESSALUD' | 'ONP';
  cuentaDestinoCodigo?: string;
  montoDestino?: number;
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
        // 1. Gasto Mercadería (cuenta de detalle divisionaria 60111)
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '60111',
          denominacionCuenta: 'Mercaderías manufacturadas - Costo',
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
        const datosVenta: VentaAutomatizadaInput = {
          clienteId: datos.anexoId || 'anx-cliente',
          docTipo: datos.docTipo || '01',
          docSerie: datos.docSerie || 'F001',
          docNumero: datos.docNumero || '00000001',
          fechaEmision: new Date().toISOString().substring(0, 10),
          baseImponible: datos.baseImponible !== undefined ? datos.baseImponible : Money.toNumber(base),
          igv: datos.igv !== undefined ? datos.igv : Money.toNumber(igv),
          cuentaVenta: (datos as any).cuentaVenta,
          cuentaCosto: (datos as any).cuentaCosto,
          baseExonerada: (datos as any).baseExonerada || (datos as any).exonerado,
          baseInafecta: (datos as any).baseInafecta || (datos as any).baseNoGravada,
          baseExportacion: (datos as any).baseExportacion,
          isc: (datos as any).isc,
          icbper: (datos as any).icbper,
          otrosTributos: (datos as any).otrosTributos,
          tieneDetraccion: (datos as any).tieneDetraccion,
          montoDetraccion: (datos as any).montoDetraccion,
          porcentajeDetraccion: (datos as any).porcentajeDetraccion,
          codigoDetraccion: (datos as any).codigoDetraccion || (datos as any).codigoBienDetraccion,
          tienePercepcion: (datos as any).tienePercepcion,
          montoPercepcion: (datos as any).montoPercepcion,
          porcentajePercepcion: (datos as any).porcentajePercepcion,
          tieneRetencion: (datos as any).tieneRetencion,
          montoRetencion: (datos as any).montoRetencion,
          anticipoDeducido: (datos as any).anticipoDeducido,
          esAnticipo: (datos as any).esAnticipo,
          esGratuito: (datos as any).esGratuito,
          descuentoGlobal: (datos as any).descuentoGlobal,
          descuentoFueraFactura: (datos as any).descuentoFueraFactura,
          costoVenta: (datos as any).costoVenta,
          motivoNota: (datos as any).motivoNota,
          moneda: datos.moneda,
          tipoCambio: datos.tipoCambio,
          glosa: datos.glosa
        };
        return await this.generarAsientoVentaAutomatizada(empresaId, datosVenta);
      }

      case 'COBRANZA': {
        const datosCobranza: TesoreriaAutomatizadaInput = {
          subdiario: '03',
          tipoOperacionTesoreria: 'COBRANZA',
          monto: Money.toNumber(total),
          moneda: datos.moneda || 'PEN',
          tipoCambio: datos.tipoCambio,
          glosa: datos.glosa || 'Cobranza en cuenta corriente',
          cuentaFinancieraCodigo: datos.cuentaFinancieraCodigo || '1041',
          cuentaContrapartidaCodigo: (datos as any).cuentaContrapartidaCodigo || (datos as any).cuentaCobrarCodigo || '1212',
          anexoId: datos.anexoId,
          anexoNombre: datos.anexoRazonSocial,
          docTipo: datos.docTipo,
          docSerie: datos.docSerie,
          docNumero: datos.docNumero,
          esCheque: (datos as any).esCheque,
          esDepositoCheque: (datos as any).esDepositoCheque,
          esAnticipo: (datos as any).esAnticipo,
          diferenciaCambio: datos.diferenciaCambio,
          tipoDiferencia: datos.tipoDiferencia
        };
        return await this.generarAsientoTesoreriaAutomatizada(empresaId, datosCobranza);
      }

      case 'PAGO': {
        const datosPago: TesoreriaAutomatizadaInput = {
          subdiario: '04',
          tipoOperacionTesoreria: 'PAGO',
          monto: Money.toNumber(total),
          moneda: datos.moneda || 'PEN',
          tipoCambio: datos.tipoCambio,
          glosa: datos.glosa || 'Pago con transferencia bancaria',
          cuentaFinancieraCodigo: datos.cuentaFinancieraCodigo || '1041',
          cuentaContrapartidaCodigo: (datos as any).cuentaContrapartidaCodigo || (datos as any).cuentaPagarCodigo || '4212',
          anexoId: datos.anexoId,
          anexoNombre: datos.anexoRazonSocial,
          docTipo: datos.docTipo,
          docSerie: datos.docSerie,
          docNumero: datos.docNumero,
          tieneRetencion: (datos as any).tieneRetencion,
          montoRetencion: (datos as any).montoRetencion,
          porcentajeRetencion: (datos as any).porcentajeRetencion,
          diferenciaCambio: datos.diferenciaCambio,
          tipoDiferencia: datos.tipoDiferencia
        };
        return await this.generarAsientoTesoreriaAutomatizada(empresaId, datosPago);
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
    let ctaCompra = input.cuentaCompra || '60111';
    if (ctaCompra === '6011') ctaCompra = '60111';

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
    const esCompraExistencias = ctaCompra.startsWith('60') || (tieneDesglose && input.desgloseCuentas!.some(i => i.cuentaCodigo.startsWith('60')));
    // Decisión B.1: selector 'COSTO' | 'GASTO'; por defecto COSTO si la compra es de existencias y GASTO si no.
    const tratamientoTributos = input.tratamientoTributosNoRecuperables || (esCompraExistencias ? 'COSTO' : 'GASTO');

    const montoNoGravado = Money.create((input.baseNoGravada || 0) + (input.exonerado || 0));
    const montoIsc = Money.create(input.isc || 0);
    const montoIcbper = Money.create(input.icbper || 0);
    const montoOtrosTrib = Money.create(input.otrosTributos || 0);
    const montoPercepcion = input.tienePercepcion && input.montoPercepcion ? Money.create(input.montoPercepcion) : Money.create(0);
    const montoRetencion = input.tieneRetencion && input.montoRetencion ? Money.create(input.montoRetencion) : Money.create(0);

    // Incompatibilidad normativa: Bloqueo de Percepción + Retención en el mismo comprobante
    const tieneRet = Boolean(input.tieneRetencion || montoRetencion.greaterThan(0));
    const tienePerc = Boolean(input.tienePercepcion || montoPercepcion.greaterThan(0));
    if (tieneRet && tienePerc) {
      throw new Error('COMBINACION_TRIBUTARIA_BLOQUEADA: Un comprobante no puede estar sujeto simultáneamente al Régimen de Percepciones y al Régimen de Retenciones del IGV (RS 037-2002/SUNAT y Ley 28053). [SUPUESTO A VALIDAR con contador]');
    }

    if (input.destino === '1' || input.destino === '2') {
      // Destinos 1 y 2: Derecho a crédito fiscal
      if (input.igv !== undefined) {
        igv = Money.create(input.igv);
      } else if (input.tasaIgv === 10 || input.tasaIgv === 0.10) {
        igv = Money.round(base.times(0.10));
      } else if (input.tasaIgv === 14 || input.tasaIgv === 0.14) {
        igv = Money.round(base.times(0.14));
      } else {
        igv = Money.round(base.times(0.18));
      }
      costoCompra = base;
      totalComprobante = Money.add(base, igv);

      // 1. Cuentas de compra (Gasto / Costo)
      if (tieneDesglose) {
        for (const item of input.desgloseCuentas!) {
          if (item.monto > 0) {
            lineas.push({
              linea: lineaNum++,
              codigoCuenta: item.cuentaCodigo === '6011' ? '60111' : item.cuentaCodigo,
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
        glosaLinea: `Crédito fiscal IGV ${input.tasaIgv === 10 || input.tasaIgv === 0.10 ? '10%' : (input.tasaIgv === 14 || input.tasaIgv === 0.14 ? '14%' : '18%')} compra ${input.docSerie}-${input.docNumero}`
      });
    } else if (input.destino === '3') {
      // Destino 3: Sin derecho a crédito fiscal -> IGV sumado al costo en cuentaCompra (60111)
      igv = Money.round(base.times(0.18));
      costoCompra = Money.add(base, igv); // IGV sumado al costo
      totalComprobante = costoCompra;

      // 1. Costo con IGV incluido en 60111
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
    } else {
      // Destino 4: No gravado (exonerado / inafecto)
      costoCompra = base;
      totalComprobante = base;

      lineas.push({
        linea: lineaNum++,
        codigoCuenta: ctaCompra,
        denominacionCuenta: 'Mercaderías manufacturadas - No gravadas (Destino 4)',
        debe: Money.toNumber(costoCompra),
        haber: 0.00,
        glosaLinea: `Compra no gravada (Destino 4) ${input.docSerie}-${input.docNumero}`,
        docTipo: input.docTipo,
        docSerie: input.docSerie,
        docNumero: input.docNumero,
        anexoId: input.proveedorId
      });
    }

    // Conceptos tributarios complementarios (Exoneradas adicionales, ISC, ICBPER, Otros Tributos)
    if (montoNoGravado.greaterThan(0) && input.destino !== '4') {
      lineas.push({
        linea: lineaNum++,
        codigoCuenta: ctaCompra,
        denominacionCuenta: 'Mercaderías manufacturadas - Adquisiciones no gravadas',
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

    // Decisión B.1: Si tratamientoTributos === 'COSTO', se cargan a la cuenta de costo (60111).
    // Si es 'GASTO', se cargan a las cuentas por naturaleza 6412 (ISC), 6413 (ICBPER) y 6491 (Otros tributos).
    if (montoIsc.greaterThan(0)) {
      lineas.push({
        linea: lineaNum++,
        codigoCuenta: tratamientoTributos === 'COSTO' ? ctaCompra : '6412',
        denominacionCuenta: tratamientoTributos === 'COSTO' ? 'Mercaderías manufacturadas - Costo (ISC)' : 'Impuesto selectivo al consumo',
        debe: Money.toNumber(montoIsc),
        haber: 0.00,
        glosaLinea: tratamientoTributos === 'COSTO' ? `ISC atribuible al costo de existencias ${input.docSerie}-${input.docNumero}` : `ISC compra ${input.docSerie}-${input.docNumero}`
      });
      totalComprobante = Money.add(totalComprobante, montoIsc);
    }

    if (montoIcbper.greaterThan(0)) {
      lineas.push({
        linea: lineaNum++,
        codigoCuenta: tratamientoTributos === 'COSTO' ? ctaCompra : '6413',
        denominacionCuenta: tratamientoTributos === 'COSTO' ? 'Mercaderías manufacturadas - Costo (ICBPER)' : 'Impuesto al consumo de las bolsas de plástico',
        debe: Money.toNumber(montoIcbper),
        haber: 0.00,
        glosaLinea: tratamientoTributos === 'COSTO' ? `ICBPER atribuible al costo de existencias ${input.docSerie}-${input.docNumero}` : `ICBPER bolsas ${input.docSerie}-${input.docNumero}`
      });
      totalComprobante = Money.add(totalComprobante, montoIcbper);
    }

    if (montoOtrosTrib.greaterThan(0)) {
      lineas.push({
        linea: lineaNum++,
        codigoCuenta: tratamientoTributos === 'COSTO' ? ctaCompra : '6491',
        denominacionCuenta: tratamientoTributos === 'COSTO' ? 'Mercaderías manufacturadas - Costo (Otros tributos)' : 'Otros tributos y recargos no gravados',
        debe: Money.toNumber(montoOtrosTrib),
        haber: 0.00,
        glosaLinea: tratamientoTributos === 'COSTO' ? `Otros tributos no recuperables al costo ${input.docSerie}-${input.docNumero}` : `Otros tributos compra ${input.docSerie}-${input.docNumero}`
      });
      totalComprobante = Money.add(totalComprobante, montoOtrosTrib);
    }

    // Destino al Almacén (SOLO en método PERMANENTE para compras de existencias clase 60)
    // Conforme a NIC 2 (párrafos 10 y 11) y Decisión B.3 del usuario:
    // El costo de existencias al almacén (20111 / 6111) incluye la base gravada, las adquisiciones no gravadas
    // y los tributos no recuperables cuando el tratamiento seleccionado es COSTO.
    if (metodoInventario === 'PERMANENTE' && esCompraExistencias) {
      let baseAlmacen = (input.destino === '3' ? Money.add(base, igv) : base);
      if (montoNoGravado.greaterThan(0) && input.destino !== '4') {
        baseAlmacen = Money.add(baseAlmacen, montoNoGravado);
      }
      if (input.destino === '4') {
        baseAlmacen = base;
      }
      if (tratamientoTributos === 'COSTO') {
        baseAlmacen = Money.add(baseAlmacen, Money.add(montoIsc, Money.add(montoIcbper, montoOtrosTrib)));
      }

      if (baseAlmacen.greaterThan(0)) {
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '20111',
          denominacionCuenta: 'Mercaderías manufacturadas - Costo almacén',
          debe: Money.toNumber(baseAlmacen),
          haber: 0.00,
          glosaLinea: 'Destino de existencias ingresadas al almacén'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '6111',
          denominacionCuenta: 'Variación de existencias - Mercaderías',
          debe: 0.00,
          haber: Money.toNumber(baseAlmacen),
          glosaLinea: 'Variación de existencias - Mercaderías'
        });
      }
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
   * Genera el asiento automatizado de venta evaluando el método de inventario y normativa SUNAT.
   * - Soporta Factura, Boleta, NC, ND, Exportación, Exonerada, Inafecta, Detracción SPOT clientes,
   *   Percepción cobrada, Anticipos, Operaciones gratuitas, Tributos adicionales (ISC, ICBPER)
   *   y Moneda Extranjera (USD).
   * - Si es PERMANENTE: genera asiento de costo de ventas D 69121 (o 69111 si exportación) / H 20111
   *   si se provee costo de ventas o salida de kardex.
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
    const esDolares = input.moneda === 'USD';
    const tipoCambio = input.tipoCambio && input.tipoCambio > 0 ? input.tipoCambio : 1.0;

    // Incompatibilidad normativa: Bloqueo de Percepción + Retención en el mismo comprobante
    const tieneRet = Boolean(input.tieneRetencion || (input.montoRetencion && input.montoRetencion > 0));
    const tienePerc = Boolean(input.tienePercepcion || (input.montoPercepcion && input.montoPercepcion > 0));
    if (tieneRet && tienePerc) {
      throw new Error('COMBINACION_TRIBUTARIA_BLOQUEADA: Un comprobante no puede estar sujeto simultáneamente al Régimen de Percepciones y al Régimen de Retenciones del IGV (RS 037-2002/SUNAT y Ley 28053). [SUPUESTO A VALIDAR con contador]');
    }

    let base = Money.create(input.baseImponible || 0);
    const descGlobal = Money.create(input.descuentoGlobal || 0);
    if (descGlobal.greaterThan(0)) {
      base = Money.sub(base, descGlobal);
    }

    let igv = Money.create(0);
    if (input.igv !== undefined) {
      igv = Money.create(input.igv);
    } else if (input.tasaIgv === 10 || input.tasaIgv === 0.10) {
      igv = Money.round(base.times(0.10));
    } else if (input.tasaIgv === 14 || input.tasaIgv === 0.14) {
      igv = Money.round(base.times(0.14));
    } else if (base.greaterThan(0)) {
      igv = Money.round(base.times(0.18));
    }

    const baseExonerada = Money.create(input.baseExonerada || 0);
    const baseInafecta = Money.create(input.baseInafecta || 0);
    const baseExportacion = Money.create(input.baseExportacion || 0);
    const isc = Money.create(input.isc || 0);
    const icbper = Money.create(input.icbper || 0);
    const otros = Money.create(input.otrosTributos || 0);
    const montoPercepcion = tienePerc && input.montoPercepcion ? Money.create(input.montoPercepcion) : Money.create(0);
    const montoDetraccion = input.tieneDetraccion && input.montoDetraccion ? Money.create(input.montoDetraccion) : Money.create(0);
    const anticipoDeducido = Money.create(input.anticipoDeducido || 0);

    const docTipo = input.docTipo || '01';
    const docSerie = input.docSerie || 'F001';
    const docNumero = input.docNumero || '00000001';
    const clienteId = input.clienteId;

    const lineas: LineaAsientoPropuesta[] = [];
    let lineaNum = 1;

    // Caso 1: NOTA DE CRÉDITO ('07')
    if (docTipo === '07') {
      const totalNC = Money.add(base, igv);
      if (input.descuentoFueraFactura || input.motivoNota?.includes('DESCUENTO')) {
        // Descuento concedido fuera de factura -> D: 7411 / D: 40111 / H: 1212
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '7411',
          denominacionCuenta: 'Descuentos, rebajas y bonificaciones concedidos - Terceros',
          debe: Money.toNumber(base),
          haber: 0.00,
          glosaLinea: `Descuento concedido NC ${docSerie}-${docNumero}`,
          docTipo, docSerie, docNumero, anexoId: clienteId
        });
        if (igv.greaterThan(0)) {
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: '40111',
            denominacionCuenta: 'IGV - Cuenta propia (Ajuste débito fiscal)',
            debe: Money.toNumber(igv),
            haber: 0.00,
            glosaLinea: `Ajuste débito fiscal IGV NC ${docSerie}-${docNumero}`
          });
        }
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '1212',
          denominacionCuenta: 'Facturas, boletas y otros comprobantes por cobrar - Emitidas',
          debe: 0.00,
          haber: Money.toNumber(totalNC),
          glosaLinea: `Disminución cuenta por cobrar cliente NC ${docSerie}-${docNumero}`,
          docTipo, docSerie, docNumero, anexoId: clienteId
        });
      } else {
        // Anulación total o descuento en venta -> D: 70121 / D: 40111 / H: 1212
        const ctaVenta = input.cuentaVenta || (baseExportacion.greaterThan(0) ? '70111' : '70121');
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: ctaVenta,
          denominacionCuenta: ctaVenta === '70111' ? 'Mercaderías - venta de exportación - Terceros' : 'Mercaderías - venta local - Terceros',
          debe: Money.toNumber(base),
          haber: 0.00,
          glosaLinea: `Reversa venta por NC ${docSerie}-${docNumero}`,
          docTipo, docSerie, docNumero, anexoId: clienteId
        });
        if (igv.greaterThan(0)) {
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: '40111',
            denominacionCuenta: 'IGV - Cuenta propia (Ajuste débito fiscal)',
            debe: Money.toNumber(igv),
            haber: 0.00,
            glosaLinea: `Ajuste débito fiscal IGV NC ${docSerie}-${docNumero}`
          });
        }
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '1212',
          denominacionCuenta: 'Facturas, boletas y otros comprobantes por cobrar - Emitidas',
          debe: 0.00,
          haber: Money.toNumber(totalNC),
          glosaLinea: `Disminución de exigibilidad cliente NC ${docSerie}-${docNumero}`,
          docTipo, docSerie, docNumero, anexoId: clienteId
        });

        // Si hay devolución física al almacén en inventario PERMANENTE
        if (metodoInventario === 'PERMANENTE' && input.costoVenta !== undefined && input.costoVenta > 0) {
          const costo = Money.create(input.costoVenta);
          const ctaCosto = input.cuentaCosto || (ctaVenta === '70111' ? '69111' : '69121');
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: '20111',
            denominacionCuenta: 'Mercaderías manufacturadas - Costo almacén',
            debe: Money.toNumber(costo),
            haber: 0.00,
            glosaLinea: `Reingreso al almacén por devolución NC ${docSerie}-${docNumero}`
          });
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: ctaCosto,
            denominacionCuenta: 'Costo de ventas - Reversa',
            debe: 0.00,
            haber: Money.toNumber(costo),
            glosaLinea: `Ajuste costo de ventas por devolución NC ${docSerie}-${docNumero}`
          });
        }
      }
    } else if (docTipo === '08') {
      // Caso 2: NOTA DE DÉBITO ('08')
      const totalND = Money.add(base, igv);
      lineas.push({
        linea: lineaNum++,
        codigoCuenta: '1212',
        denominacionCuenta: 'Facturas, boletas y otros comprobantes por cobrar - Emitidas',
        debe: Money.toNumber(totalND),
        haber: 0.00,
        glosaLinea: `Incremento de exigibilidad cliente ND ${docSerie}-${docNumero}`,
        docTipo, docSerie, docNumero, anexoId: clienteId
      });
      if (igv.greaterThan(0)) {
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '40111',
          denominacionCuenta: 'IGV - Cuenta propia (Débito fiscal)',
          debe: 0.00,
          haber: Money.toNumber(igv),
          glosaLinea: `Débito fiscal IGV ND ${docSerie}-${docNumero}`
        });
      }
      const esInteresMora = Boolean(input.motivoNota?.includes('INTERES') || input.motivoNota?.includes('MORA') || input.motivoNota?.includes('PENALIDAD'));
      const ctaND = esInteresMora ? '7721' : (input.cuentaVenta || '70121');
      const nomND = esInteresMora ? 'Intereses sobre cuentas por cobrar comerciales' : 'Mercaderías - venta local - Terceros';
      lineas.push({
        linea: lineaNum++,
        codigoCuenta: ctaND,
        denominacionCuenta: nomND,
        debe: 0.00,
        haber: Money.toNumber(base),
        glosaLinea: esInteresMora ? `Intereses por mora / penalidad ND ${docSerie}-${docNumero}` : `Aumento de precio base ND ${docSerie}-${docNumero}`
      });
    } else if (input.esGratuito) {
      // Caso 3: OPERACIÓN A TÍTULO GRATUITO (Retiro de bienes, Art. 3 TUO LIGV)
      const totalGastoGratuito = (metodoInventario === 'PERMANENTE' && input.costoVenta !== undefined && input.costoVenta > 0)
        ? Money.add(igv, Money.create(input.costoVenta))
        : igv;

      lineas.push({
        linea: lineaNum++,
        codigoCuenta: '659',
        denominacionCuenta: 'Otros gastos de gestión - Donaciones y entregas a título gratuito',
        debe: Money.toNumber(totalGastoGratuito),
        haber: 0.00,
        glosaLinea: `Gasto por entrega a título gratuito según ${docSerie}-${docNumero}`,
        docTipo, docSerie, docNumero, anexoId: clienteId
      });
      if (igv.greaterThan(0)) {
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '40111',
          denominacionCuenta: 'IGV - Cuenta propia (Débito fiscal asumido)',
          debe: 0.00,
          haber: Money.toNumber(igv),
          glosaLinea: `IGV débito fiscal retiro a título gratuito ${docSerie}-${docNumero}`
        });
      }
      if (metodoInventario === 'PERMANENTE' && input.costoVenta !== undefined && input.costoVenta > 0) {
        const costo = Money.create(input.costoVenta);
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '20111',
          denominacionCuenta: 'Mercaderías manufacturadas - Costo almacén',
          debe: 0.00,
          haber: Money.toNumber(costo),
          glosaLinea: `Salida de existencias entregadas a título gratuito ${docSerie}-${docNumero}`
        });
      }
    } else {
      // Caso 4: FACTURA, BOLETA O VENTA ORDINARIA ('01', '03', '12', etc.)
      const totalVenta = Money.add(
        base,
        Money.add(igv, Money.add(baseExonerada, Money.add(baseInafecta, Money.add(baseExportacion, Money.add(isc, Money.add(icbper, Money.add(otros, montoPercepcion)))))))
      );
      let totalCobrar = totalVenta;
      if (anticipoDeducido.greaterThan(0)) {
        totalCobrar = Money.sub(totalCobrar, anticipoDeducido);
      }

      // --- Cuentas por Cobrar (DEBE) ---
      if (montoDetraccion.greaterThan(0)) {
        const netoCobrar = Money.sub(totalCobrar, montoDetraccion);
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '12121',
          denominacionCuenta: 'Facturas por cobrar - Emitidas en cartera - Saldo comercial neto',
          debe: Money.toNumber(netoCobrar),
          haber: 0.00,
          glosaLinea: `Cobro neto según comprobante ${docSerie}-${docNumero}`,
          docTipo, docSerie, docNumero, anexoId: clienteId
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '12122',
          denominacionCuenta: 'Facturas por cobrar - Emitidas en cartera - SPOT Detracciones por cobrar',
          debe: Money.toNumber(montoDetraccion),
          haber: 0.00,
          glosaLinea: `Detracción SPOT cliente Banco de la Nación ${docSerie}-${docNumero}`,
          docTipo, docSerie, docNumero, anexoId: clienteId
        });
      } else {
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '1212',
          denominacionCuenta: docTipo === '03' ? 'Boletas por cobrar - Emitidas en cartera' : 'Facturas por cobrar - Emitidas en cartera',
          debe: Money.toNumber(totalCobrar),
          haber: 0.00,
          glosaLinea: `Cobro según comprobante ${docSerie}-${docNumero}`,
          docTipo, docSerie, docNumero, anexoId: clienteId
        });
      }

      if (anticipoDeducido.greaterThan(0)) {
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '1221',
          denominacionCuenta: 'Anticipos de clientes - Facturados',
          debe: Money.toNumber(anticipoDeducido),
          haber: 0.00,
          glosaLinea: `Deducción de anticipo facturado previamente ${docSerie}-${docNumero}`,
          docTipo, docSerie, docNumero, anexoId: clienteId
        });
      }

      // --- Pasivos Tributarios (HABER) ---
      if (igv.greaterThan(0)) {
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '40111',
          denominacionCuenta: 'IGV - Cuenta propia',
          debe: 0.00,
          haber: Money.toNumber(igv),
          glosaLinea: `Débito fiscal IGV ${input.tasaIgv === 10 || input.tasaIgv === 0.10 ? '10%' : (input.tasaIgv === 14 || input.tasaIgv === 0.14 ? '14%' : '18%')} venta ${docSerie}-${docNumero}`
        });
      }

      if (montoPercepcion.greaterThan(0)) {
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '40113',
          denominacionCuenta: 'IGV - Régimen de percepciones por pagar',
          debe: 0.00,
          haber: Money.toNumber(montoPercepcion),
          glosaLinea: `Percepción cobrada al cliente ${docSerie}-${docNumero}`
        });
      }

      if (isc.greaterThan(0)) {
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '40121',
          denominacionCuenta: 'Impuesto selectivo al consumo',
          debe: 0.00,
          haber: Money.toNumber(isc),
          glosaLinea: `ISC venta ${docSerie}-${docNumero}`
        });
      }

      if (icbper.greaterThan(0)) {
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '401891',
          denominacionCuenta: 'Impuesto al consumo de las bolsas de plástico',
          debe: 0.00,
          haber: Money.toNumber(icbper),
          glosaLinea: `ICBPER bolsas de plástico ${docSerie}-${docNumero}`
        });
      }

      if (otros.greaterThan(0)) {
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '40189',
          denominacionCuenta: 'Otros impuestos y cargos por pagar',
          debe: 0.00,
          haber: Money.toNumber(otros),
          glosaLinea: `Otros tributos venta ${docSerie}-${docNumero}`
        });
      }

      // --- Ingresos por Venta (HABER) ---
      if (input.esAnticipo) {
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '1221',
          denominacionCuenta: 'Anticipos de clientes - Facturados',
          debe: 0.00,
          haber: Money.toNumber(base),
          glosaLinea: `Anticipo recibido de cliente comprobante ${docSerie}-${docNumero}`,
          docTipo, docSerie, docNumero, anexoId: clienteId
        });
      } else {
        if (base.greaterThan(0)) {
          const ctaVenta = input.cuentaVenta || '70121';
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: ctaVenta,
            denominacionCuenta: 'Mercaderías manufacturadas - Venta local - Terceros',
            debe: 0.00,
            haber: Money.toNumber(base),
            glosaLinea: `Venta de mercaderías comprobante ${docSerie}-${docNumero}`
          });
        }
        if (baseExonerada.greaterThan(0)) {
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: '70122',
            denominacionCuenta: 'Mercaderías - Venta Local - Operaciones Exoneradas',
            debe: 0.00,
            haber: Money.toNumber(baseExonerada),
            glosaLinea: `Venta exonerada del IGV (Apéndice I y II) ${docSerie}-${docNumero}`
          });
        }
        if (baseInafecta.greaterThan(0)) {
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: '70123',
            denominacionCuenta: 'Mercaderías - Venta Local - Operaciones Inafectas',
            debe: 0.00,
            haber: Money.toNumber(baseInafecta),
            glosaLinea: `Operaciones inafectas al IGV ${docSerie}-${docNumero}`
          });
        }
        if (baseExportacion.greaterThan(0)) {
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: '70111',
            denominacionCuenta: 'Mercaderías - Venta de Exportación - Terceros',
            debe: 0.00,
            haber: Money.toNumber(baseExportacion),
            glosaLinea: `Venta de exportación comprobante ${docSerie}-${docNumero}`
          });
        }
      }

      // --- Costo de Ventas (en método PERMANENTE) ---
      if (metodoInventario === 'PERMANENTE' && input.costoVenta !== undefined && input.costoVenta > 0) {
        const costo = Money.create(input.costoVenta);
        const ctaCosto = input.cuentaCosto || (baseExportacion.greaterThan(0) || input.cuentaVenta === '70111' ? '69111' : '69121');
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: ctaCosto,
          denominacionCuenta: ctaCosto === '69111' ? 'Mercaderías manufacturadas - Exportación (Costo de ventas)' : 'Mercaderías manufacturadas - Terceros (Costo de ventas)',
          debe: Money.toNumber(costo),
          haber: 0.00,
          glosaLinea: `Costo de ventas salida de almacén según kardex ${docSerie}-${docNumero}`
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '20111',
          denominacionCuenta: 'Mercaderías manufacturadas - Costo almacén',
          debe: 0.00,
          haber: Money.toNumber(costo),
          glosaLinea: `Descargo de existencias por venta ${docSerie}-${docNumero}`
        });
      }
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
      glosaGeneral: input.glosa || `Venta automática ${docTipo} ${docSerie}-${docNumero}`,
      lineas,
      totalDebe: Money.toNumber(sumDebe),
      totalHaber: Money.toNumber(sumHaber),
      cuadrado: Money.isEqual(sumDebe, sumHaber),
      diferencia: Money.toNumber(dif),
      metodoInventario
    };
  },

  /**
   * Generación integral de asientos contables de Tesorería (Subdiarios 03, 04 y 05)
   * Cobranzas, pagos, cheques en cartera, anticipos, retenciones CRE 3%, caja chica y detracciones SPOT
   */
  async generarAsientoTesoreriaAutomatizada(
    empresaId: string,
    input: TesoreriaAutomatizadaInput
  ): Promise<ResultadoPrevisualizacion> {
    const lineas: LineaAsientoPropuesta[] = [];
    let lineaNum = 1;
    const monto = Money.create(input.monto);
    const esDolares = input.moneda === 'USD';
    const tipoCambio = input.tipoCambio && input.tipoCambio > 0 ? input.tipoCambio : 1.0;

    switch (input.tipoOperacionTesoreria) {
      case 'COBRANZA': {
        if (input.esDepositoCheque) {
          // ESC-COB-3.04 (Fase Depósito): D: 10411 / H: 1031
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: input.cuentaFinancieraCodigo || '10411',
            denominacionCuenta: 'Cuentas corrientes operativas - Moneda nacional',
            debe: Money.toNumber(monto),
            haber: 0.00,
            glosaLinea: input.glosa || 'Depósito en cuenta corriente de cheque en cartera'
          });
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: '1031',
            denominacionCuenta: 'Efectivo en tránsito - Cheques en cartera',
            debe: 0.00,
            haber: Money.toNumber(monto),
            glosaLinea: 'Descargo de cheque en cartera por depósito bancario'
          });
        } else {
          // Cobranza normal / cheque recibido / anticipo
          const ctaFin = input.esCheque
            ? '1031'
            : (input.cuentaFinancieraCodigo || (esDolares ? '10412' : '10411'));
          const nomCtaFin = ctaFin === '1031'
            ? 'Efectivo en tránsito - Cheques en cartera'
            : (ctaFin === '1011'
              ? 'Caja central - Efectivo'
              : (ctaFin === '10412'
                ? 'Cuentas corrientes operativas - Moneda extranjera'
                : 'Cuentas corrientes operativas - Moneda nacional'));

          const ctaCobrar = input.esAnticipo
            ? '1221'
            : (input.cuentaContrapartidaCodigo || '1212');
          const nomCtaCobrar = ctaCobrar === '1221'
            ? 'Anticipos de clientes'
            : (ctaCobrar === '12122'
              ? 'Facturas por cobrar - SPOT Detracciones Banco de la Nación'
              : 'Facturas por cobrar - Emitidas en cartera');

          const difCambio = input.diferenciaCambio ? Money.create(input.diferenciaCambio) : Money.create(0);
          const tipoDif = input.tipoDiferencia || 'NINGUNA';

          if (tipoDif === 'GANANCIA' && !difCambio.isZero()) {
            // Sube TC: Debe Banco (monto total cobrado), Haber 1212 (monto original), Haber 776 (ganancia)
            const montoOriginal = Money.sub(monto, difCambio);
            lineas.push({
              linea: lineaNum++,
              codigoCuenta: ctaFin,
              denominacionCuenta: nomCtaFin,
              debe: Money.toNumber(monto),
              haber: 0.00,
              glosaLinea: input.glosa || 'Cobranza en moneda extranjera al TC cobro'
            });
            lineas.push({
              linea: lineaNum++,
              codigoCuenta: ctaCobrar,
              denominacionCuenta: nomCtaCobrar,
              debe: 0.00,
              haber: Money.toNumber(montoOriginal),
              glosaLinea: 'Cancelación de factura al tipo de cambio original',
              anexoId: input.anexoId
            });
            lineas.push({
              linea: lineaNum++,
              codigoCuenta: '776',
              denominacionCuenta: 'Ganancia por diferencia de cambio',
              debe: 0.00,
              haber: Money.toNumber(difCambio),
              glosaLinea: 'Ganancia por tipo de cambio en cobranza de clientes'
            });
          } else if (tipoDif === 'PERDIDA' && !difCambio.isZero()) {
            // Baja TC: Debe Banco (monto cobrado), Debe 676 (pérdida), Haber 1212 (monto original)
            const montoOriginal = Money.add(monto, difCambio);
            lineas.push({
              linea: lineaNum++,
              codigoCuenta: ctaFin,
              denominacionCuenta: nomCtaFin,
              debe: Money.toNumber(monto),
              haber: 0.00,
              glosaLinea: input.glosa || 'Cobranza en moneda extranjera al TC cobro'
            });
            lineas.push({
              linea: lineaNum++,
              codigoCuenta: '676',
              denominacionCuenta: 'Pérdida por diferencia de cambio',
              debe: Money.toNumber(difCambio),
              haber: 0.00,
              glosaLinea: 'Pérdida por tipo de cambio en cobranza de clientes'
            });
            lineas.push({
              linea: lineaNum++,
              codigoCuenta: ctaCobrar,
              denominacionCuenta: nomCtaCobrar,
              debe: 0.00,
              haber: Money.toNumber(montoOriginal),
              glosaLinea: 'Cancelación de factura al tipo de cambio original',
              anexoId: input.anexoId
            });
          } else {
            // Ordinario
            lineas.push({
              linea: lineaNum++,
              codigoCuenta: ctaFin,
              denominacionCuenta: nomCtaFin,
              debe: Money.toNumber(monto),
              haber: 0.00,
              glosaLinea: input.glosa || 'Cobranza de cliente'
            });
            lineas.push({
              linea: lineaNum++,
              codigoCuenta: ctaCobrar,
              denominacionCuenta: nomCtaCobrar,
              debe: 0.00,
              haber: Money.toNumber(monto),
              glosaLinea: input.esAnticipo ? 'Registro de anticipo recibido de cliente' : 'Cancelación de factura por cobrar',
              anexoId: input.anexoId
            });
          }
        }
        break;
      }

      case 'PAGO': {
        const ctaPasivo = input.cuentaContrapartidaCodigo || '4212';
        const nomCtaPasivo = ctaPasivo === '4213'
          ? 'Cuentas por pagar comerciales - Detracciones Banco de la Nación'
          : (ctaPasivo === '424'
            ? 'Honorarios por pagar (Cuarta categoría)'
            : (ctaPasivo === '40111'
              ? 'Gobierno nacional - IGV cuenta propia'
              : (ctaPasivo === '40171'
                ? 'Impuesto a la renta de tercera categoría'
                : (ctaPasivo === '4031'
                  ? 'Instituciones públicas - ESSALUD por pagar'
                  : (ctaPasivo === '4032'
                    ? 'Instituciones públicas - ONP por pagar'
                    : 'Cuentas por pagar comerciales - Emitidas')))));

        const ctaFin = input.cuentaFinancieraCodigo || (esDolares ? '10412' : '10411');
        const nomCtaFin = ctaFin === '1011'
          ? 'Caja central - Efectivo'
          : (ctaFin === '1021'
            ? 'Fondos fijos - Caja chica'
            : (ctaFin === '10412'
              ? 'Cuentas corrientes operativas - Moneda extranjera'
              : 'Cuentas corrientes operativas - Moneda nacional'));

        // ESC-PAG-4.02: Pago con Emisión de Comprobante de Retención Electrónica CRE Tipo 20
        if (input.tieneRetencion && input.montoRetencion && input.montoRetencion > 0) {
          const retencion = Money.create(input.montoRetencion);
          const neto = Money.sub(monto, retencion);

          lineas.push({
            linea: lineaNum++,
            codigoCuenta: ctaPasivo,
            denominacionCuenta: nomCtaPasivo,
            debe: Money.toNumber(monto),
            haber: 0.00,
            glosaLinea: input.glosa || 'Cancelación total factura sujeta a retención del IGV 3%',
            anexoId: input.anexoId
          });
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: '40114',
            denominacionCuenta: 'IGV - Régimen de retenciones por pagar (3%)',
            debe: 0.00,
            haber: Money.toNumber(retencion),
            glosaLinea: 'Retención de IGV 3% al pago emitida mediante CRE'
          });
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: ctaFin,
            denominacionCuenta: nomCtaFin,
            debe: 0.00,
            haber: Money.toNumber(neto),
            glosaLinea: 'Desembolso bancario neto (97%) deducida la retención CRE'
          });
        } else {
          // Diferencia de cambio en pagos
          const difCambio = input.diferenciaCambio ? Money.create(input.diferenciaCambio) : Money.create(0);
          const tipoDif = input.tipoDiferencia || 'NINGUNA';

          if (tipoDif === 'PERDIDA' && !difCambio.isZero()) {
            // Sube TC: Debe 4212 (original), Debe 676 (pérdida), Haber Banco (monto pagado)
            const montoOriginal = Money.sub(monto, difCambio);
            lineas.push({
              linea: lineaNum++,
              codigoCuenta: ctaPasivo,
              denominacionCuenta: nomCtaPasivo,
              debe: Money.toNumber(montoOriginal),
              haber: 0.00,
              glosaLinea: 'Cancelación de pasivo al tipo de cambio original',
              anexoId: input.anexoId
            });
            lineas.push({
              linea: lineaNum++,
              codigoCuenta: '676',
              denominacionCuenta: 'Pérdida por diferencia de cambio',
              debe: Money.toNumber(difCambio),
              haber: 0.00,
              glosaLinea: 'Pérdida por tipo de cambio en pago a proveedores'
            });
            lineas.push({
              linea: lineaNum++,
              codigoCuenta: ctaFin,
              denominacionCuenta: nomCtaFin,
              debe: 0.00,
              haber: Money.toNumber(monto),
              glosaLinea: input.glosa || 'Desembolso bancario al tipo de cambio del pago'
            });
          } else if (tipoDif === 'GANANCIA' && !difCambio.isZero()) {
            // Baja TC: Debe 4212 (original), Haber 776 (ganancia), Haber Banco (monto pagado)
            const montoOriginal = Money.add(monto, difCambio);
            lineas.push({
              linea: lineaNum++,
              codigoCuenta: ctaPasivo,
              denominacionCuenta: nomCtaPasivo,
              debe: Money.toNumber(montoOriginal),
              haber: 0.00,
              glosaLinea: 'Cancelación de pasivo al tipo de cambio original',
              anexoId: input.anexoId
            });
            lineas.push({
              linea: lineaNum++,
              codigoCuenta: '776',
              denominacionCuenta: 'Ganancia por diferencia de cambio',
              debe: 0.00,
              haber: Money.toNumber(difCambio),
              glosaLinea: 'Ganancia por tipo de cambio en pago a proveedores'
            });
            lineas.push({
              linea: lineaNum++,
              codigoCuenta: ctaFin,
              denominacionCuenta: nomCtaFin,
              debe: 0.00,
              haber: Money.toNumber(monto),
              glosaLinea: input.glosa || 'Desembolso bancario al tipo de cambio del pago'
            });
          } else {
            // Ordinario
            lineas.push({
              linea: lineaNum++,
              codigoCuenta: ctaPasivo,
              denominacionCuenta: nomCtaPasivo,
              debe: Money.toNumber(monto),
              haber: 0.00,
              glosaLinea: input.glosa || 'Cancelación de obligación',
              anexoId: input.anexoId
            });
            lineas.push({
              linea: lineaNum++,
              codigoCuenta: ctaFin,
              denominacionCuenta: nomCtaFin,
              debe: 0.00,
              haber: Money.toNumber(monto),
              glosaLinea: input.glosa || 'Desembolso financiero'
            });
          }
        }
        break;
      }

      case 'CAJA_CHICA_APERTURA': {
        // ESC-COB-3.06: D: 1021 / H: 10411
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '1021',
          denominacionCuenta: 'Fondos fijos - Caja chica moneda nacional',
          debe: Money.toNumber(monto),
          haber: 0.00,
          glosaLinea: input.glosa || 'Constitución y apertura de fondo fijo de caja chica'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: input.cuentaFinancieraCodigo || '10411',
          denominacionCuenta: 'Cuentas corrientes operativas - Moneda nacional',
          debe: 0.00,
          haber: Money.toNumber(monto),
          glosaLinea: 'Emisión de cheque / transferencia para constitución de fondo fijo'
        });
        break;
      }

      case 'CAJA_CHICA_PAGO': {
        // ESC-PAG-4.03: D: 4212 / H: 1021
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: input.cuentaContrapartidaCodigo || '4212',
          denominacionCuenta: 'Cuentas por pagar comerciales - Emitidas (Gastos menores)',
          debe: Money.toNumber(monto),
          haber: 0.00,
          glosaLinea: input.glosa || 'Cancelación de compras menores con cargo a caja chica',
          anexoId: input.anexoId
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '1021',
          denominacionCuenta: 'Fondos fijos - Caja chica moneda nacional',
          debe: 0.00,
          haber: Money.toNumber(monto),
          glosaLinea: 'Descargo de comprobante autorizado de caja chica'
        });
        break;
      }

      case 'CAJA_CHICA_REPOSICION': {
        // ESC-PAG-4.07: D: 1021 / H: 10411
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '1021',
          denominacionCuenta: 'Fondos fijos - Caja chica moneda nacional (Reposición)',
          debe: Money.toNumber(monto),
          haber: 0.00,
          glosaLinea: input.glosa || 'Reposición de fondos por rendición de gastos menores'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: input.cuentaFinancieraCodigo || '10411',
          denominacionCuenta: 'Cuentas corrientes operativas - Moneda nacional',
          debe: 0.00,
          haber: Money.toNumber(monto),
          glosaLinea: 'Cheque / transferencia bancaria de reposición de caja chica'
        });
        break;
      }

      case 'DEPOSITO_DETRACCION': {
        // ESC-SPOT-5.01: D: 4213 / H: 10411
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '4213',
          denominacionCuenta: 'Cuentas por pagar comerciales - Detracciones Banco de la Nación',
          debe: Money.toNumber(monto),
          haber: 0.00,
          glosaLinea: input.glosa || 'Depósito de detracción SPOT a cuenta de proveedor en Banco de la Nación',
          anexoId: input.anexoId
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: input.cuentaFinancieraCodigo || '10411',
          denominacionCuenta: 'Cuentas corrientes operativas - Moneda nacional',
          debe: 0.00,
          haber: Money.toNumber(monto),
          glosaLinea: 'Débito bancario comercial por pago de detracción SPOT'
        });
        break;
      }

      case 'AUTODETRACCION': {
        // ESC-SPOT-5.02: D: 1071 / H: 1212 o 12122
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '1071',
          denominacionCuenta: 'Fondos sujetos a restricción - Banco de la Nación (Detracciones)',
          debe: Money.toNumber(monto),
          haber: 0.00,
          glosaLinea: input.glosa || 'Depósito de autodetracción en cuenta propia Banco de la Nación'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: input.cuentaContrapartidaCodigo || '1212',
          denominacionCuenta: 'Facturas por cobrar - Emitidas en cartera (SPOT autodetracción)',
          debe: 0.00,
          haber: Money.toNumber(monto),
          glosaLinea: 'Aplicación de autodetracción a cuenta por cobrar comercial',
          anexoId: input.anexoId
        });
        break;
      }

      case 'PAGO_TRIBUTOS_DETRACCION': {
        // ESC-SPOT-5.03: D: 40111 / H: 1071
        const ctaTributo = input.cuentaContrapartidaCodigo || '40111';
        const nomTributo = ctaTributo === '40171'
          ? 'Impuesto a la renta - Tercera categoría por pagar'
          : (ctaTributo === '4031'
            ? 'Instituciones públicas - ESSALUD por pagar'
            : (ctaTributo === '4032'
              ? 'Instituciones públicas - ONP por pagar'
              : 'Gobierno nacional - IGV cuenta propia'));

        lineas.push({
          linea: lineaNum++,
          codigoCuenta: ctaTributo,
          denominacionCuenta: nomTributo,
          debe: Money.toNumber(monto),
          haber: 0.00,
          glosaLinea: input.glosa || 'Pago de deuda tributaria SUNAT con cargo a cuenta de detracciones'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '1071',
          denominacionCuenta: 'Fondos sujetos a restricción - Banco de la Nación (Detracciones)',
          debe: 0.00,
          haber: Money.toNumber(monto),
          glosaLinea: 'Débito en cuenta Banco de la Nación para pago de tributo SUNAT'
        });
        break;
      }

      case 'LIBERACION_DETRACCION': {
        // ESC-SPOT-5.04: D: 10411 / H: 1071
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: input.cuentaFinancieraCodigo || '10411',
          denominacionCuenta: 'Cuentas corrientes operativas - Moneda nacional',
          debe: Money.toNumber(monto),
          haber: 0.00,
          glosaLinea: input.glosa || 'Ingreso por liberación de fondos de detracciones autorizada por SUNAT'
        });
        lineas.push({
          linea: lineaNum++,
          codigoCuenta: '1071',
          denominacionCuenta: 'Fondos sujetos a restricción - Banco de la Nación (Detracciones)',
          debe: 0.00,
          haber: Money.toNumber(monto),
          glosaLinea: 'Descargo de cuenta Banco de la Nación por liberación de fondos'
        });
        break;
      }

      case 'TRANSFERENCIA': {
        // ESC-PAG-4.06: D: Cta Destino / H: Cta Origen
        const ctaOrigen = input.cuentaFinancieraCodigo || '10411';
        const ctaDestino = input.cuentaDestinoCodigo || '10412';
        const montoOrigen = monto;
        const montoDestino = input.montoDestino ? Money.create(input.montoDestino) : monto;
        const difCambio = input.diferenciaCambio ? Money.create(input.diferenciaCambio) : Money.create(0);

        lineas.push({
          linea: lineaNum++,
          codigoCuenta: ctaDestino,
          denominacionCuenta: 'Cuenta financiera destino',
          debe: Money.toNumber(montoDestino),
          haber: 0.00,
          glosaLinea: input.glosa || 'Transferencia entre cuentas - Ingreso a destino'
        });

        if (input.tipoDiferencia === 'PERDIDA' && !difCambio.isZero()) {
          lineas.push({
            linea: lineaNum++,
            codigoCuenta: '676',
            denominacionCuenta: 'Pérdida por diferencia de cambio',
            debe: Money.toNumber(difCambio),
            haber: 0.00,
            glosaLinea: 'Ajuste por diferencia de cambio en transferencia bancaria'
          });
        }

        lineas.push({
          linea: lineaNum++,
          codigoCuenta: ctaOrigen,
          denominacionCuenta: 'Cuenta financiera origen',
          debe: 0.00,
          haber: Money.toNumber(montoOrigen),
          glosaLinea: input.glosa || 'Transferencia entre cuentas - Salida de origen'
        });

        if (input.tipoDiferencia === 'GANANCIA' && !difCambio.isZero()) {
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
    }

    // Calcular totales y verificar cuadre
    let sumDebe = Money.create(0);
    let sumHaber = Money.create(0);

    for (const l of lineas) {
      if (esDolares && !input.diferenciaCambio) {
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
      glosaGeneral: input.glosa || `Movimiento de tesorería ${input.tipoOperacionTesoreria}`,
      lineas,
      totalDebe: Money.toNumber(sumDebe),
      totalHaber: Money.toNumber(sumHaber),
      cuadrado: Money.isEqual(sumDebe, sumHaber),
      diferencia: Money.toNumber(dif)
    };
  }

};
