import { db } from '../config/database';
import { Money } from '../utils/decimal';
import { parametroRepository } from '../repositories/parametroRepository';
import { empresaRepository } from '../repositories/empresaRepository';
import { COMPRAS_MEMORIA } from './compraService';
import { VENTAS_MEMORIA } from './ventaService';
import { asientoService } from './asientoService';
import { periodoService } from './periodoService';
import { prorrataIgvService } from './prorrataIgvService';
import { auditoriaChainService } from './auditoriaChainService';

export type EstadoDeclaracionPdt621 = 'BORRADOR' | 'PRELIQUIDADO' | 'PRESENTADO' | 'SUSTITUIDA';

export interface ComprobanteRetencionPercepcionIgv {
  id: string;
  empresaId: string;
  periodo: string;
  tipo: 'RETENCION' | 'PERCEPCION';
  rucAgente: string;
  razonSocialAgente: string;
  serie: string;
  numero: string;
  fechaEmision: string;
  importeComprobante: number;
  importeRetenidoPercibido: number;
}

export interface CasillasPdt621 {
  c100_ventasGravadasBase: number;
  c101_ventasGravadasIgv: number;
  c102_descuentosDevolucionesBase: number;
  c103_descuentosDevolucionesIgv: number;
  c106_exportacionesFacturadas: number;
  c109_ventasNoGravadas: number;
  c131_totalDebitoFiscal: number;
  c107_comprasGravadasExclusivasBase: number;
  c108_comprasGravadasExclusivasIgv: number;
  c110_comprasDestinoComunBase: number;
  c111_comprasDestinoComunIgvAdmitido: number;
  c120_comprasSinDerechoCreditoBase: number;
  c178_totalCreditoFiscal: number;
  c140_impuestoResultanteOSaldoMes: number;
  c145_saldoFavorPeriodoAnterior: number;
  c184_tributoAPagarOSaldoFavor: number;
  c171_percepcionesPeriodo: number;
  c179_retencionesPeriodo: number;
  c188_totalDeudaTributariaIgv: number;
  c301_ingresosNetosRenta: number;
  c315_coeficienteOPorcentajeRenta: number;
  c302_pagoACuentaDeterminadoRenta: number;
  c303_saldoFavorRentaCompensado: number;
  c304_pagoACuentaRentaPorPagar: number;
}

export interface LiquidacionIGVResultado {
  id: string;
  periodo: string;
  empresaId: string;
  regimenTributario: string;
  version: number;
  esRectificatoria: boolean;
  declaracionAnteriorId?: string | null;
  motivoRectificatoria?: string;
  estado: EstadoDeclaracionPdt621;
  numeroOrden?: string | null;
  fechaPresentacion?: string | null;
  asientoDeterminacionId?: string | null;

  // Ventas (RVIE)
  ventasGravadas: number;
  debitoFiscalIgv: number;
  descuentosVentasBase: number;
  descuentosVentasIgv: number;
  exportaciones: number;
  ventasNoGravadas: number;
  totalVentas: number;

  // Compras (RCE) separadas por destino
  comprasGravadasCreditoTotal: number; // Destino '1' (Base)
  creditoFiscalDestinoGravado: number; // Destino '1' (IGV)
  comprasGravadasCreditoProrrata: number; // Destino '2' (Base común)
  igvComprasDestinoComunBruto: number; // Destino '2' (IGV antes de prorrata)
  creditoFiscalDestinoComunAdmitido: number; // Destino '2' (IGV tras prorrata)
  igvNoAdmitidoGasto64111: number; // Porción enviada al gasto/costo
  comprasSinCredito: number; // Destino '3' o '4'
  creditoFiscalIgv: number; // Total Crédito Fiscal (108 + 111)

  // Prorrata integrada
  usaProrrata: boolean;
  coeficienteProrrataAplicado: number;
  porcentajeProrrataAplicado: number;

  // Saldo de IGV y Arrastres
  saldoAnteriorAFavor: number;
  retencionesAplicables: number;
  percepcionesAplicables: number;
  igvDeterminado: number; // Débito fiscal - Crédito fiscal (Casilla 140)
  igvPorPagar: number; // Tras deducir saldo a favor y retenciones/percepciones
  nuevoSaldoAFavor: number; // Saldo a favor arrastrable al próximo mes

  // Pago a Cuenta Impuesto a la Renta (leído de parametros_tributarios)
  baseImponibleRenta: number;
  tasaRentaAplicada: number;
  coeficienteRentaConfigurado: number;
  etiquetaRenta: string;
  saldoFavorRentaAnterior: number;
  pagoCuentaRenta: number;

  // Total a Declarar
  totalTributosPorPagar: number;

  // Casillas oficiales PDT 621
  casillas: CasillasPdt621;

  // Trazabilidad de Cálculo
  detalleCalculo: Array<{
    casilla?: string;
    concepto: string;
    formula: string;
    origenDato?: string;
    resultado: number;
  }>;

  // Alerta de Prorrata Mixta
  requiereTratamientoManualProrrata: boolean;
  motivoAlertaProrrata?: string;

  updatedAt: string;
  usuarioId?: string;
}

export interface OpcionesLiquidacionPdt621 {
  saldoAnteriorAFavor?: number;
  retencionesPeriodo?: number;
  percepcionesPeriodo?: number;
  regimenOverride?: 'MYPE_TRIBUTARIO' | 'REGIMEN_GENERAL' | 'REGIMEN_ESPECIAL' | 'NRUS';
  coeficienteRentaOverride?: number;
  ingresosAcumuladosAnioUIT?: number;
  saldoFavorRentaAnterior?: number;
  integrarProrrata?: boolean;
  porcentajeProrrataOverride?: number;
}

export const DECLARACIONES_PDT621_MEMORIA: LiquidacionIGVResultado[] = [];
export const RETENCIONES_PERCEPCIONES_IGV_MEMORIA: ComprobanteRetencionPercepcionIgv[] = [];

function coincidePeriodo(registroPeriodoId: string | undefined, fecha: string | undefined, periodoObjetivo: string): boolean {
  if (registroPeriodoId === periodoObjetivo || registroPeriodoId === `per-${periodoObjetivo}`) {
    return true;
  }
  if (fecha && fecha.startsWith(periodoObjetivo)) {
    return true;
  }
  return false;
}

function obtenerPeriodoAnterior(periodo: string): string {
  const [anioStr, mesStr] = periodo.split('-');
  let anio = Number(anioStr) || 2026;
  let mes = Number(mesStr) || 1;
  mes -= 1;
  if (mes < 1) {
    mes = 12;
    anio -= 1;
  }
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

function validarPermisoOperativoTributos(rolUsuario?: string) {
  const rol = (rolUsuario || '').toUpperCase();
  if (rol.includes('AUDITOR')) {
    throw new Error('PERMISO_DENEGADO: El rol AUDITOR es de solo lectura y no puede preliquidar, presentar ni rectificar declaraciones tributarias.');
  }
}

export const liquidacionIGVService = {
  /**
   * Registra un comprobante de retención o percepción de IGV para el período
   */
  registrarRetencionPercepcion(item: Omit<ComprobanteRetencionPercepcionIgv, 'id'>): ComprobanteRetencionPercepcionIgv {
    const nuevo: ComprobanteRetencionPercepcionIgv = {
      ...item,
      id: `rp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    };
    RETENCIONES_PERCEPCIONES_IGV_MEMORIA.push(nuevo);
    return nuevo;
  },

  /**
   * Calcula la Declaración Mensual IGV-Renta (PDT 621) leyendo exclusivamente
   * las tablas de ventas, compras, retenciones/percepciones y parametros_tributarios.
   */
  async calcular(
    empresaId: string,
    periodo: string = '2026-09',
    saldoAnteriorAFavorOrOpciones: number | OpcionesLiquidacionPdt621 = 0
  ): Promise<LiquidacionIGVResultado> {
    const opciones: OpcionesLiquidacionPdt621 =
      typeof saldoAnteriorAFavorOrOpciones === 'number'
        ? { saldoAnteriorAFavor: saldoAnteriorAFavorOrOpciones }
        : saldoAnteriorAFavorOrOpciones || {};

    // Si existe una declaración activa (no sustituida) en estado PRELIQUIDADO o PRESENTADO y no se pasaron overrides nuevos,
    // recalculamos sobre los datos actuales manteniendo metadatos de estado y versión.
    const declActiva = this.obtenerDeclaracionActiva(empresaId, periodo);

    const empresa = await empresaRepository.obtenerPorId(empresaId).catch(() => null);
    const regimen = opciones.regimenOverride || empresa?.regimenTributario || 'MYPE_TRIBUTARIO';
    const anio = Number(periodo.split('-')[0]) || 2026;
    const fechaRef = `${periodo}-15`;

    // 1. Leer parámetros tributarios desde la tabla editable (cero hardcoding)
    const tasaIgv = await parametroRepository.obtenerValorNumerico('TASA_IGV', 0.18, fechaRef);
    const valorUit = await parametroRepository.obtenerUitPorAnio(anio);
    const tasaMypeSub300 = await parametroRepository.obtenerValorNumerico('TASA_RENTA_MYPE_SUB300', 0.01, fechaRef);
    const topeMypeUit = await parametroRepository.obtenerValorNumerico('TOPE_RENTA_MYPE_MENSUAL_UIT', 300, fechaRef);
    const tasaRgMin = await parametroRepository.obtenerValorNumerico('TASA_RENTA_RG_MIN', 0.015, fechaRef);
    const tasaRer = await parametroRepository.obtenerValorNumerico('TASA_RENTA_RER', 0.015, fechaRef);
    const cuotaNrus1 = await parametroRepository.obtenerValorNumerico('CUOTA_NRUS_CAT1', 20.00, fechaRef);

    const coefEmpresa = opciones.coeficienteRentaOverride !== undefined
      ? Number(opciones.coeficienteRentaOverride)
      : Number((empresa as any)?.coeficienteRenta || 0);

    let tasaRenta = tasaMypeSub300;
    let etiquetaRenta = `Régimen MYPE Tributario (${(tasaMypeSub300 * 100).toFixed(2)}% hasta ${topeMypeUit} UIT)`;

    if (regimen === 'REGIMEN_ESPECIAL') {
      tasaRenta = tasaRer;
      etiquetaRenta = `Régimen Especial de Renta RER (${(tasaRer * 100).toFixed(2)}% definitivo)`;
    } else if (regimen === 'REGIMEN_GENERAL') {
      tasaRenta = Math.max(tasaRgMin, coefEmpresa);
      etiquetaRenta = coefEmpresa > tasaRgMin
        ? `Régimen General — Coeficiente Art. 85° LIR (${(tasaRenta * 100).toFixed(2)}%)`
        : `Régimen General — Porcentaje mínimo (${(tasaRgMin * 100).toFixed(2)}%)`;
    } else if (regimen === 'NRUS') {
      tasaRenta = 0;
      etiquetaRenta = `Nuevo RUS — Cuota fija mensual (S/ ${cuotaNrus1.toFixed(2)})`;
    } else {
      // MYPE_TRIBUTARIO: 1.0% hasta 300 UIT; si supera 300 UIT aplica max(1.5%, coeficiente)
      const superaTope300Uit = (opciones.ingresosAcumuladosAnioUIT || 0) > topeMypeUit;
      if (superaTope300Uit) {
        tasaRenta = Math.max(tasaRgMin, coefEmpresa);
        etiquetaRenta = `RMT > ${topeMypeUit} UIT (${(tasaRenta * 100).toFixed(2)}% a cuenta)`;
      } else {
        tasaRenta = tasaMypeSub300;
        etiquetaRenta = `Régimen MYPE Tributario (${(tasaRenta * 100).toFixed(2)}% hasta ${topeMypeUit} UIT = S/ ${(topeMypeUit * valorUit).toLocaleString('es-PE')})`;
      }
    }

    // 2. Leer Ventas desde comprobantes_venta (VENTAS_MEMORIA y/o PostgreSQL)
    let ventasBrutasGravadas = Money.create(0);
    let igvVentasBrutas = Money.create(0);
    let descuentosVentasBase = Money.create(0);
    let descuentosVentasIgv = Money.create(0);
    let exportaciones = Money.create(0);
    let ventasNoGravadas = Money.create(0);
    let totalVentas = Money.create(0);

    const ventasMemoria = VENTAS_MEMORIA.filter(
      v => v.empresaId === empresaId && v.estado !== 'ANULADO' && coincidePeriodo(v.periodoId, v.fechaContable || v.fechaEmision, periodo)
    );

    if (ventasMemoria.length > 0) {
      for (const v of ventasMemoria) {
        const bg = Math.abs(Number((v as any).baseGravada ?? (v as any).baseImponible ?? 0));
        const igv = Math.abs(Number(v.igv || 0));
        const exp = Math.abs(Number((v as any).exportacion ?? (v.tipoOperacion === '0200' ? (v as any).inafecto || 0 : 0)));
        const bng = Math.abs(Number((v as any).baseNoGravada || 0) + Number((v as any).exonerado || 0) + (v.tipoOperacion !== '0200' ? Number((v as any).inafecto || 0) : 0));
        const tot = Math.abs(Number(v.total || 0));

        if (v.tipoComprobante === '07') {
          descuentosVentasBase = Money.add(descuentosVentasBase, bg);
          descuentosVentasIgv = Money.add(descuentosVentasIgv, igv);
          totalVentas = Money.sub(totalVentas, tot);
        } else {
          ventasBrutasGravadas = Money.add(ventasBrutasGravadas, bg);
          igvVentasBrutas = Money.add(igvVentasBrutas, igv);
          exportaciones = Money.add(exportaciones, exp);
          ventasNoGravadas = Money.add(ventasNoGravadas, bng);
          totalVentas = Money.add(totalVentas, tot);
        }
      }
    } else if (db.isPostgresConnected()) {
      const vRes = await db.query(`
        SELECT COALESCE(SUM(base_gravada), 0) as bg,
               COALESCE(SUM(igv), 0) as igv,
               COALESCE(SUM(base_no_gravada + exonerado), 0) as bng,
               COALESCE(SUM(total), 0) as tot
        FROM comprobantes_venta
        WHERE empresa_id = $1 AND periodo_id = $2 AND estado <> 'ANULADO'
      `, [empresaId, periodo]);

      if (vRes.rows.length > 0) {
        ventasBrutasGravadas = Money.create(vRes.rows[0].bg);
        igvVentasBrutas = Money.create(vRes.rows[0].igv);
        ventasNoGravadas = Money.create(vRes.rows[0].bng);
        totalVentas = Money.create(vRes.rows[0].tot);
      }
    }

    const ventasGravadasNetas = Money.sub(ventasBrutasGravadas, descuentosVentasBase);
    const debitoFiscal = Money.sub(igvVentasBrutas, descuentosVentasIgv);

    // 3. Leer Compras desde comprobantes_compra (COMPRAS_MEMORIA y/o PostgreSQL)
    // Solo comprobantes que dan derecho a crédito fiscal, separando destino '1', '2' y '3'/'4'
    let comprasCreditoTotal = Money.create(0);
    let igvComprasDestino1 = Money.create(0);
    let comprasCreditoProrrata = Money.create(0);
    let igvComprasDestino2Bruto = Money.create(0);
    let comprasSinCredito = Money.create(0);

    const comprasMemoria = COMPRAS_MEMORIA.filter(
      c => c.empresaId === empresaId && c.estado !== 'ANULADO' && coincidePeriodo(c.periodoId, c.fechaContable || c.fechaEmision, periodo)
    );

    if (comprasMemoria.length > 0) {
      for (const c of comprasMemoria) {
        const signo = c.tipoComprobante === '07' ? -1 : 1;
        const destino = String(c.tipoAdquisicion || (c as any).codigoDestinoIgv || '1');
        // Comprobantes tipo '02' (Recibo por Honorarios) o con derechoCreditoFiscal === false van a sin derecho a crédito
        const daDerechoCf = (c as any).derechoCreditoFiscal !== false && c.tipoComprobante !== '02';
        const bg = Number((c as any).baseGravada ?? (c as any).baseImponible ?? 0) * signo;
        const igv = Number(c.igv || 0) * signo;
        const bng = (Number((c as any).baseNoGravada || 0) + Number((c as any).exonerado || 0)) * signo;

        if (!daDerechoCf || destino === '3' || destino === '4') {
          comprasSinCredito = Money.add(comprasSinCredito, bg + bng);
        } else if (destino === '2') {
          comprasCreditoProrrata = Money.add(comprasCreditoProrrata, bg);
          igvComprasDestino2Bruto = Money.add(igvComprasDestino2Bruto, igv);
          if (bng !== 0) comprasSinCredito = Money.add(comprasSinCredito, bng);
        } else {
          // Destino '1': Destinado exclusivamente a operaciones gravadas
          comprasCreditoTotal = Money.add(comprasCreditoTotal, bg);
          igvComprasDestino1 = Money.add(igvComprasDestino1, igv);
          if (bng !== 0) comprasSinCredito = Money.add(comprasSinCredito, bng);
        }
      }
    } else if (db.isPostgresConnected()) {
      const cRes = await db.query(`
        SELECT tipo_adquisicion,
               COALESCE(SUM(base_gravada), 0) as bg,
               COALESCE(SUM(igv), 0) as igv
        FROM comprobantes_compra
        WHERE empresa_id = $1 AND periodo_id = $2 AND estado <> 'ANULADO'
        GROUP BY tipo_adquisicion
      `, [empresaId, periodo]);

      cRes.rows.forEach((row: any) => {
        if (row.tipo_adquisicion === '1') {
          comprasCreditoTotal = Money.add(comprasCreditoTotal, row.bg);
          igvComprasDestino1 = Money.add(igvComprasDestino1, row.igv);
        } else if (row.tipo_adquisicion === '2') {
          comprasCreditoProrrata = Money.add(comprasCreditoProrrata, row.bg);
          igvComprasDestino2Bruto = Money.add(igvComprasDestino2Bruto, row.igv);
        } else {
          comprasSinCredito = Money.add(comprasSinCredito, row.bg);
        }
      });
    }

    // 4. Evaluar integración con Prorrata del IGV para las compras de destino común ('2')
    const prorrataGuardada = prorrataIgvService.obtenerGuardada(empresaId, periodo);
    const hayVentasNoGravadas = ventasNoGravadas.greaterThan(0);
    const hayComprasProrrata = comprasCreditoProrrata.greaterThan(0);
    const requiereProrrata = hayVentasNoGravadas && hayComprasProrrata;

    let usaProrrata = false;
    let coefProrrata = 1.0;
    let porcProrrata = 100.0;

    if (opciones.porcentajeProrrataOverride !== undefined) {
      usaProrrata = true;
      porcProrrata = Number(opciones.porcentajeProrrataOverride.toFixed(2));
      coefProrrata = Number((porcProrrata / 100).toFixed(4));
    } else if (opciones.integrarProrrata === true || (prorrataGuardada?.integrarEnPdt621 && hayComprasProrrata)) {
      const calcProrrata = await prorrataIgvService.calcularProrrata(empresaId, periodo);
      usaProrrata = calcProrrata.porcentajeProrrata < 100;
      coefProrrata = calcProrrata.coeficienteProrrata;
      porcProrrata = calcProrrata.porcentajeProrrata;
    } else if (requiereProrrata && opciones.integrarProrrata !== false) {
      const calcProrrata = await prorrataIgvService.calcularProrrata(empresaId, periodo);
      usaProrrata = true;
      coefProrrata = calcProrrata.coeficienteProrrata;
      porcProrrata = calcProrrata.porcentajeProrrata;
    }

    const igvDestino2Admitido = usaProrrata
      ? Money.round(Money.mul(igvComprasDestino2Bruto, Money.div(Money.create(porcProrrata), 100)))
      : igvComprasDestino2Bruto;
    const igvNoAdmitidoGasto = Money.sub(igvComprasDestino2Bruto, igvDestino2Admitido);

    const creditoFiscalTotal = Money.add(igvComprasDestino1, igvDestino2Admitido);

    // 5. Saldo a Favor del Período Anterior (arrastre automático si no se especificó override)
    let saldoAnteriorVal = opciones.saldoAnteriorAFavor;
    if (saldoAnteriorVal === undefined || saldoAnteriorVal === 0) {
      const perAnt = obtenerPeriodoAnterior(periodo);
      const declMesAnterior = this.obtenerDeclaracionActiva(empresaId, perAnt);
      if (declMesAnterior && saldoAnteriorVal === undefined) {
        saldoAnteriorVal = declMesAnterior.nuevoSaldoAFavor;
      } else if (declMesAnterior && saldoAnteriorVal === 0 && typeof saldoAnteriorAFavorOrOpciones !== 'number') {
        saldoAnteriorVal = declMesAnterior.nuevoSaldoAFavor;
      }
    }
    const saldoFavorAnterior = Money.create(saldoAnteriorVal || 0);

    // 6. Retenciones y Percepciones del IGV del período
    const rpRegistros = RETENCIONES_PERCEPCIONES_IGV_MEMORIA.filter(
      r => r.empresaId === empresaId && r.periodo === periodo
    );
    const sumaRetencionesMem = rpRegistros
      .filter(r => r.tipo === 'RETENCION')
      .reduce((acc, r) => Money.add(acc, r.importeRetenidoPercibido), Money.create(0));
    const sumaPercepcionesMem = rpRegistros
      .filter(r => r.tipo === 'PERCEPCION')
      .reduce((acc, r) => Money.add(acc, r.importeRetenidoPercibido), Money.create(0));

    const retencionesAplicables = opciones.retencionesPeriodo !== undefined
      ? Money.create(opciones.retencionesPeriodo)
      : sumaRetencionesMem;
    const percepcionesAplicables = opciones.percepcionesPeriodo !== undefined
      ? Money.create(opciones.percepcionesPeriodo)
      : sumaPercepcionesMem;

    // 7. Determinación del IGV Neto, Tributo a Pagar o Saldo a Favor para el próximo mes
    const igvDeterminado = Money.sub(debitoFiscal, creditoFiscalTotal); // Casilla 140
    const igvTrasSaldoAnterior = Money.sub(igvDeterminado, saldoFavorAnterior); // Casilla 184
    const saldoNetoIgvFinal = Money.sub(
      Money.sub(igvTrasSaldoAnterior, percepcionesAplicables),
      retencionesAplicables
    );

    let igvPorPagar = Money.create(0);
    let nuevoSaldoAFavor = Money.create(0);

    if (saldoNetoIgvFinal.greaterThan(0)) {
      igvPorPagar = Money.round(saldoNetoIgvFinal);
      nuevoSaldoAFavor = Money.create(0);
    } else {
      igvPorPagar = Money.create(0);
      nuevoSaldoAFavor = Money.round(saldoNetoIgvFinal.abs());
    }

    // 8. Pago a Cuenta del Impuesto a la Renta (Casillas 301, 315, 302, 303, 304)
    const baseRenta = Money.add(Money.add(ventasGravadasNetas, exportaciones), ventasNoGravadas);
    const pagoCuentaDeterminado = regimen === 'NRUS'
      ? Money.create(cuotaNrus1)
      : Money.round(baseRenta.times(tasaRenta));
    const saldoFavorRentaAnt = Money.create(opciones.saldoFavorRentaAnterior || 0);
    const compensacionRenta = Money.create(
      Math.min(Money.toNumber(pagoCuentaDeterminado), Money.toNumber(saldoFavorRentaAnt))
    );
    const pagoCuentaRenta = Money.sub(pagoCuentaDeterminado, compensacionRenta);

    const totalTributos = Money.add(igvPorPagar, pagoCuentaRenta);

    const casillas: CasillasPdt621 = {
      c100_ventasGravadasBase: Money.toNumber(ventasBrutasGravadas),
      c101_ventasGravadasIgv: Money.toNumber(igvVentasBrutas),
      c102_descuentosDevolucionesBase: Money.toNumber(descuentosVentasBase),
      c103_descuentosDevolucionesIgv: Money.toNumber(descuentosVentasIgv),
      c106_exportacionesFacturadas: Money.toNumber(exportaciones),
      c109_ventasNoGravadas: Money.toNumber(ventasNoGravadas),
      c131_totalDebitoFiscal: Money.toNumber(debitoFiscal),
      c107_comprasGravadasExclusivasBase: Money.toNumber(comprasCreditoTotal),
      c108_comprasGravadasExclusivasIgv: Money.toNumber(igvComprasDestino1),
      c110_comprasDestinoComunBase: Money.toNumber(comprasCreditoProrrata),
      c111_comprasDestinoComunIgvAdmitido: Money.toNumber(igvDestino2Admitido),
      c120_comprasSinDerechoCreditoBase: Money.toNumber(comprasSinCredito),
      c178_totalCreditoFiscal: Money.toNumber(creditoFiscalTotal),
      c140_impuestoResultanteOSaldoMes: Money.toNumber(igvDeterminado),
      c145_saldoFavorPeriodoAnterior: Money.toNumber(saldoFavorAnterior),
      c184_tributoAPagarOSaldoFavor: Money.toNumber(igvTrasSaldoAnterior),
      c171_percepcionesPeriodo: Money.toNumber(percepcionesAplicables),
      c179_retencionesPeriodo: Money.toNumber(retencionesAplicables),
      c188_totalDeudaTributariaIgv: Money.toNumber(igvPorPagar),
      c301_ingresosNetosRenta: Money.toNumber(baseRenta),
      c315_coeficienteOPorcentajeRenta: Number((tasaRenta * 100).toFixed(2)),
      c302_pagoACuentaDeterminadoRenta: Money.toNumber(pagoCuentaDeterminado),
      c303_saldoFavorRentaCompensado: Money.toNumber(compensacionRenta),
      c304_pagoACuentaRentaPorPagar: Money.toNumber(pagoCuentaRenta)
    };

    const detalleCalculo = [
      {
        casilla: '100 / 101 / 131',
        concepto: 'Débito Fiscal IGV (Ventas Netas Gravadas)',
        formula: `Base S/ ${Money.toNumber(ventasGravadasNetas).toFixed(2)} × ${(tasaIgv * 100).toFixed(0)}% (Bruto S/ ${Money.toNumber(igvVentasBrutas).toFixed(2)} - NC S/ ${Money.toNumber(descuentosVentasIgv).toFixed(2)})`,
        origenDato: 'comprobantes_venta',
        resultado: Money.toNumber(debitoFiscal)
      },
      {
        casilla: '107 / 108',
        concepto: 'Crédito Fiscal Compras Destino Gravado Exclusivo (Tipo 1)',
        formula: `Base Destino 1 S/ ${Money.toNumber(comprasCreditoTotal).toFixed(2)} × ${(tasaIgv * 100).toFixed(0)}%`,
        origenDato: 'comprobantes_compra (destino = 1)',
        resultado: Money.toNumber(igvComprasDestino1)
      },
      {
        casilla: '110 / 111',
        concepto: 'Crédito Fiscal Compras Destino Común / Mixto (Tipo 2)',
        formula: usaProrrata
          ? `IGV Común S/ ${Money.toNumber(igvComprasDestino2Bruto).toFixed(2)} × Prorrata ${porcProrrata.toFixed(2)}% (No admitido Cta 64111: S/ ${Money.toNumber(igvNoAdmitidoGasto).toFixed(2)})`
          : `Base Destino 2 S/ ${Money.toNumber(comprasCreditoProrrata).toFixed(2)} (100% acreditable)`,
        origenDato: 'comprobantes_compra (destino = 2) + declaraciones_prorrata_igv',
        resultado: Money.toNumber(igvDestino2Admitido)
      },
      {
        casilla: '140 / 145 / 184',
        concepto: 'IGV Determinado y Aplicación de Saldo a Favor Anterior',
        formula: `Débito (S/ ${Money.toNumber(debitoFiscal).toFixed(2)}) - Crédito Total (S/ ${Money.toNumber(creditoFiscalTotal).toFixed(2)}) - Saldo Ant. (S/ ${Money.toNumber(saldoFavorAnterior).toFixed(2)})`,
        origenDato: 'declaraciones_pdt621 (t-1)',
        resultado: Money.toNumber(igvTrasSaldoAnterior)
      },
      {
        casilla: '171 / 179 / 188',
        concepto: 'Deducción de Percepciones y Retenciones del IGV',
        formula: `Casilla 184 (S/ ${Money.toNumber(igvTrasSaldoAnterior).toFixed(2)}) - Percepciones (S/ ${Money.toNumber(percepcionesAplicables).toFixed(2)}) - Retenciones (S/ ${Money.toNumber(retencionesAplicables).toFixed(2)})`,
        origenDato: 'retenciones_percepciones_igv',
        resultado: Money.toNumber(igvPorPagar)
      },
      {
        casilla: '301 / 315 / 304',
        concepto: 'Pago a Cuenta Mensual del Impuesto a la Renta',
        formula: `Ingresos Netos (S/ ${Money.toNumber(baseRenta).toFixed(2)}) × ${(tasaRenta * 100).toFixed(2)}% - Compensación (S/ ${Money.toNumber(compensacionRenta).toFixed(2)})`,
        origenDato: 'comprobantes_venta + parametros_tributarios',
        resultado: Money.toNumber(pagoCuentaRenta)
      }
    ];

    const resultado: LiquidacionIGVResultado = {
      id: declActiva?.id || `pdt621-${empresaId}-${periodo}-v1`,
      periodo,
      empresaId,
      regimenTributario: regimen,
      version: declActiva?.version || 1,
      esRectificatoria: declActiva?.esRectificatoria || false,
      declaracionAnteriorId: declActiva?.declaracionAnteriorId || null,
      motivoRectificatoria: declActiva?.motivoRectificatoria,
      estado: declActiva?.estado || 'BORRADOR',
      numeroOrden: declActiva?.numeroOrden || null,
      fechaPresentacion: declActiva?.fechaPresentacion || null,
      asientoDeterminacionId: declActiva?.asientoDeterminacionId || null,

      ventasGravadas: Money.toNumber(ventasGravadasNetas),
      debitoFiscalIgv: Money.toNumber(debitoFiscal),
      descuentosVentasBase: Money.toNumber(descuentosVentasBase),
      descuentosVentasIgv: Money.toNumber(descuentosVentasIgv),
      exportaciones: Money.toNumber(exportaciones),
      ventasNoGravadas: Money.toNumber(ventasNoGravadas),
      totalVentas: Money.toNumber(totalVentas),

      comprasGravadasCreditoTotal: Money.toNumber(comprasCreditoTotal),
      creditoFiscalDestinoGravado: Money.toNumber(igvComprasDestino1),
      comprasGravadasCreditoProrrata: Money.toNumber(comprasCreditoProrrata),
      igvComprasDestinoComunBruto: Money.toNumber(igvComprasDestino2Bruto),
      creditoFiscalDestinoComunAdmitido: Money.toNumber(igvDestino2Admitido),
      igvNoAdmitidoGasto64111: Money.toNumber(igvNoAdmitidoGasto),
      comprasSinCredito: Money.toNumber(comprasSinCredito),
      creditoFiscalIgv: Money.toNumber(creditoFiscalTotal),

      usaProrrata,
      coeficienteProrrataAplicado: coefProrrata,
      porcentajeProrrataAplicado: porcProrrata,

      saldoAnteriorAFavor: Money.toNumber(saldoFavorAnterior),
      retencionesAplicables: Money.toNumber(retencionesAplicables),
      percepcionesAplicables: Money.toNumber(percepcionesAplicables),
      igvDeterminado: Money.toNumber(igvDeterminado),
      igvPorPagar: Money.toNumber(igvPorPagar),
      nuevoSaldoAFavor: Money.toNumber(nuevoSaldoAFavor),

      baseImponibleRenta: Money.toNumber(baseRenta),
      tasaRentaAplicada: tasaRenta,
      coeficienteRentaConfigurado: coefEmpresa,
      etiquetaRenta,
      saldoFavorRentaAnterior: Money.toNumber(compensacionRenta),
      pagoCuentaRenta: Money.toNumber(pagoCuentaRenta),

      totalTributosPorPagar: Money.toNumber(totalTributos),

      casillas,
      detalleCalculo,

      requiereTratamientoManualProrrata: requiereProrrata,
      motivoAlertaProrrata: requiereProrrata
        ? `Se detectaron adquisiciones comunes (Destino 2: S/ ${Money.toNumber(comprasCreditoProrrata).toFixed(2)}) junto con ventas no gravadas (S/ ${Money.toNumber(ventasNoGravadas).toFixed(2)}). Se aplicó el coeficiente de prorrata (${porcProrrata.toFixed(2)}%) conforme al Art. 6° del Reglamento de la Ley del IGV.`
        : undefined,

      updatedAt: new Date().toISOString()
    };

    this.guardarDeclaracionEnMemoria(resultado);
    return resultado;
  },

  guardarDeclaracionEnMemoria(declaracion: LiquidacionIGVResultado) {
    const idx = DECLARACIONES_PDT621_MEMORIA.findIndex(
      d => d.empresaId === declaracion.empresaId && d.periodo === declaracion.periodo && d.version === declaracion.version
    );
    if (idx >= 0) {
      DECLARACIONES_PDT621_MEMORIA[idx] = declaracion;
    } else {
      DECLARACIONES_PDT621_MEMORIA.push(declaracion);
    }
  },

  obtenerDeclaracionActiva(empresaId: string, periodo: string): LiquidacionIGVResultado | null {
    const candidatas = DECLARACIONES_PDT621_MEMORIA
      .filter(d => d.empresaId === empresaId && d.periodo === periodo && d.estado !== 'SUSTITUIDA')
      .sort((a, b) => b.version - a.version);
    return candidatas[0] || null;
  },

  obtenerHistorial(empresaId: string, periodo: string): LiquidacionIGVResultado[] {
    return DECLARACIONES_PDT621_MEMORIA
      .filter(d => d.empresaId === empresaId && d.periodo === periodo)
      .sort((a, b) => b.version - a.version);
  },

  /**
   * Transiciona la declaración de BORRADOR a PRELIQUIDADO y genera el asiento
   * contable de determinación del impuesto (IGV + Pago a cuenta de Renta + Prorrata 64111 si aplica).
   * Bloquea estrictamente al rol AUDITOR.
   */
  async preliquidar(
    empresaId: string,
    periodo: string,
    usuarioId: string,
    rolUsuario: string,
    opciones: OpcionesLiquidacionPdt621 = {}
  ): Promise<LiquidacionIGVResultado> {
    validarPermisoOperativoTributos(rolUsuario);

    const calculada = await this.calcular(empresaId, periodo, opciones);
    await periodoService.abrirPeriodo(empresaId, periodo, usuarioId).catch(() => null);

    // Construir detalles de partida doble para el asiento de determinación del impuesto
    const detalles: Array<{ linea: number; cuentaId: string; glosa?: string; debe: number; haber: number }> = [];
    let linea = 1;

    // 1. Si hubo IGV de destino común no admitido por prorrata -> Cargo a 64111, Abono a 40111
    if (calculada.igvNoAdmitidoGasto64111 > 0) {
      detalles.push({
        linea: linea++,
        cuentaId: '64111',
        glosa: `IGV no acreditable por prorrata (${calculada.porcentajeProrrataAplicado.toFixed(2)}%) — Período ${periodo}`,
        debe: calculada.igvNoAdmitidoGasto64111,
        haber: 0
      });
      detalles.push({
        linea: linea++,
        cuentaId: '40111',
        glosa: `Ajuste de crédito fiscal común por prorrata — Período ${periodo}`,
        debe: 0,
        haber: calculada.igvNoAdmitidoGasto64111
      });
    }

    // 2. Aplicación de retenciones y percepciones del IGV contra 40111
    if (calculada.retencionesAplicables > 0) {
      detalles.push({
        linea: linea++,
        cuentaId: '40111',
        glosa: `Aplicación de retenciones del IGV del período ${periodo}`,
        debe: calculada.retencionesAplicables,
        haber: 0
      });
      detalles.push({
        linea: linea++,
        cuentaId: '40114',
        glosa: `Compensación de cuenta de retenciones IGV ${periodo}`,
        debe: 0,
        haber: calculada.retencionesAplicables
      });
    }

    if (calculada.percepcionesAplicables > 0) {
      detalles.push({
        linea: linea++,
        cuentaId: '40111',
        glosa: `Aplicación de percepciones del IGV del período ${periodo}`,
        debe: calculada.percepcionesAplicables,
        haber: 0
      });
      detalles.push({
        linea: linea++,
        cuentaId: '40113',
        glosa: `Compensación de cuenta de percepciones IGV ${periodo}`,
        debe: 0,
        haber: calculada.percepcionesAplicables
      });
    }

    // 3. Provisión del Pago a Cuenta mensual del Impuesto a la Renta (Cta 1671 / 40171)
    if (calculada.pagoCuentaRenta > 0) {
      detalles.push({
        linea: linea++,
        cuentaId: '1671',
        glosa: `Pago a cuenta Impuesto a la Renta 3ra Cat. (${calculada.etiquetaRenta}) — ${periodo}`,
        debe: calculada.pagoCuentaRenta,
        haber: 0
      });
      detalles.push({
        linea: linea++,
        cuentaId: '40171',
        glosa: `Determinación obligación Renta 3ra Cat. mensual — ${periodo}`,
        debe: 0,
        haber: calculada.pagoCuentaRenta
      });
    }

    // Si todos los importes fueron 0 (mes sin deuda de renta ni ajustes), registrar asiento de determinación nominal de control
    if (detalles.length === 0 && calculada.debitoFiscalIgv > 0) {
      detalles.push({
        linea: linea++,
        cuentaId: '40111',
        glosa: `Determinación mensual IGV cuenta propia — ${periodo}`,
        debe: calculada.debitoFiscalIgv,
        haber: 0
      });
      detalles.push({
        linea: linea++,
        cuentaId: '40111',
        glosa: `Aplicación de crédito fiscal y saldo a favor — ${periodo}`,
        debe: 0,
        haber: calculada.debitoFiscalIgv
      });
    }

    let asientoId: string | null = calculada.asientoDeterminacionId || null;
    if (detalles.length >= 2) {
      const borrador = await asientoService.crearBorrador(
        empresaId,
        {
          periodoId: `per-${periodo}`,
          subdiarioId: '06',
          fecha: `${periodo}-28`,
          glosa: `DETERMINACIÓN MENSUAL PDT 621 IGV-RENTA (${periodo}) V.${calculada.version}`,
          moneda: 'PEN',
          tipoCambio: 1.0,
          detalles
        },
        usuarioId
      );
      const contabilizado = await asientoService.contabilizar(borrador.id, empresaId, usuarioId);
      asientoId = contabilizado.id;
    }

    const actualizada: LiquidacionIGVResultado = {
      ...calculada,
      estado: 'PRELIQUIDADO',
      asientoDeterminacionId: asientoId,
      usuarioId,
      updatedAt: new Date().toISOString()
    };

    this.guardarDeclaracionEnMemoria(actualizada);

    await auditoriaChainService.registrar({
      empresaId,
      usuarioId,
      accion: 'PRELIQUIDAR_PDT621',
      tablaAfectada: 'declaraciones_pdt621',
      registroId: actualizada.id,
      datosNuevos: {
        periodo,
        version: actualizada.version,
        igvPorPagar: actualizada.igvPorPagar,
        nuevoSaldoAFavor: actualizada.nuevoSaldoAFavor,
        pagoCuentaRenta: actualizada.pagoCuentaRenta,
        asientoDeterminacionId: asientoId
      }
    });

    return actualizada;
  },

  /**
   * Marca la declaración como PRESENTADO registrando el número de orden y la fecha de presentación manuales.
   */
  async presentar(
    empresaId: string,
    periodo: string,
    datosPresentacion: { numeroOrden: string; fechaPresentacion: string },
    usuarioId: string,
    rolUsuario: string
  ): Promise<LiquidacionIGVResultado> {
    validarPermisoOperativoTributos(rolUsuario);

    if (!datosPresentacion.numeroOrden || !datosPresentacion.numeroOrden.trim()) {
      throw new Error('NUMERO_ORDEN_REQUERIDO: Debe ingresar el número de orden de la constancia de presentación.');
    }
    if (!datosPresentacion.fechaPresentacion || !datosPresentacion.fechaPresentacion.trim()) {
      throw new Error('FECHA_PRESENTACION_REQUERIDA: Debe ingresar la fecha de presentación.');
    }

    let decl = this.obtenerDeclaracionActiva(empresaId, periodo);
    if (!decl) {
      decl = await this.preliquidar(empresaId, periodo, usuarioId, rolUsuario);
    } else if (decl.estado === 'BORRADOR') {
      decl = await this.preliquidar(empresaId, periodo, usuarioId, rolUsuario, {
        saldoAnteriorAFavor: decl.saldoAnteriorAFavor,
        retencionesPeriodo: decl.retencionesAplicables,
        percepcionesPeriodo: decl.percepcionesAplicables
      });
    }

    const presentada: LiquidacionIGVResultado = {
      ...decl,
      estado: 'PRESENTADO',
      numeroOrden: datosPresentacion.numeroOrden.trim(),
      fechaPresentacion: datosPresentacion.fechaPresentacion.trim(),
      usuarioId,
      updatedAt: new Date().toISOString()
    };

    this.guardarDeclaracionEnMemoria(presentada);

    await auditoriaChainService.registrar({
      empresaId,
      usuarioId,
      accion: 'PRESENTAR_PDT621',
      tablaAfectada: 'declaraciones_pdt621',
      registroId: presentada.id,
      datosNuevos: {
        periodo,
        version: presentada.version,
        numeroOrden: presentada.numeroOrden,
        fechaPresentacion: presentada.fechaPresentacion,
        totalTributosPorPagar: presentada.totalTributosPorPagar
      }
    });

    return presentada;
  },

  /**
   * Genera una declaración RECTIFICATORIA conservando intacta la versión anterior (con estado 'SUSTITUIDA')
   * en el historial de versiones de `declaraciones_pdt621`.
   */
  async rectificar(
    empresaId: string,
    periodo: string,
    opcionesNuevas: OpcionesLiquidacionPdt621 & {
      motivoRectificatoria?: string;
      numeroOrdenRectificatoria?: string;
      fechaPresentacionRectificatoria?: string;
    },
    usuarioId: string,
    rolUsuario: string
  ): Promise<{ rectificatoria: LiquidacionIGVResultado; versionAnteriorConservada: LiquidacionIGVResultado }> {
    validarPermisoOperativoTributos(rolUsuario);

    let anterior = this.obtenerDeclaracionActiva(empresaId, periodo);
    if (!anterior) {
      anterior = await this.preliquidar(empresaId, periodo, usuarioId, rolUsuario);
    }

    // Conservar copia inmutable de la versión sustituida
    const copiaAnterior: LiquidacionIGVResultado = {
      ...anterior,
      casillas: { ...anterior.casillas },
      detalleCalculo: [...anterior.detalleCalculo],
      estado: 'SUSTITUIDA',
      updatedAt: new Date().toISOString()
    };
    this.guardarDeclaracionEnMemoria(copiaAnterior);

    const nuevaVersion = anterior.version + 1;

    // Calcular con los nuevos parámetros o comprobantes actualizados del período
    const baseRecalculada = await this.calcular(empresaId, periodo, opcionesNuevas);

    // Remover cualquier registro temporal que calcular() haya sobreescrito en version 1
    // y asegurar que copiaAnterior permanezca intacta en su versión original
    this.guardarDeclaracionEnMemoria(copiaAnterior);

    const estadoFinal: EstadoDeclaracionPdt621 = opcionesNuevas.numeroOrdenRectificatoria
      ? 'PRESENTADO'
      : 'PRELIQUIDADO';

    const rectificatoria: LiquidacionIGVResultado = {
      ...baseRecalculada,
      id: `pdt621-${empresaId}-${periodo}-v${nuevaVersion}`,
      version: nuevaVersion,
      esRectificatoria: true,
      declaracionAnteriorId: copiaAnterior.id,
      motivoRectificatoria: opcionesNuevas.motivoRectificatoria || 'Declaración rectificatoria de tributos mensuales',
      estado: estadoFinal,
      numeroOrden: opcionesNuevas.numeroOrdenRectificatoria || null,
      fechaPresentacion: opcionesNuevas.fechaPresentacionRectificatoria || null,
      usuarioId,
      updatedAt: new Date().toISOString()
    };

    this.guardarDeclaracionEnMemoria(rectificatoria);

    await auditoriaChainService.registrar({
      empresaId,
      usuarioId,
      accion: 'RECTIFICAR_PDT621',
      tablaAfectada: 'declaraciones_pdt621',
      registroId: rectificatoria.id,
      datosAnteriores: {
        id: copiaAnterior.id,
        version: copiaAnterior.version,
        igvPorPagar: copiaAnterior.igvPorPagar,
        pagoCuentaRenta: copiaAnterior.pagoCuentaRenta,
        numeroOrden: copiaAnterior.numeroOrden
      },
      datosNuevos: {
        id: rectificatoria.id,
        version: rectificatoria.version,
        declaracionAnteriorId: copiaAnterior.id,
        igvPorPagar: rectificatoria.igvPorPagar,
        pagoCuentaRenta: rectificatoria.pagoCuentaRenta,
        motivoRectificatoria: rectificatoria.motivoRectificatoria
      }
    });

    return {
      rectificatoria,
      versionAnteriorConservada: copiaAnterior
    };
  }
};
