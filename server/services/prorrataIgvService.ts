import { randomUUID } from 'node:crypto';
import { db } from '../config/database';
import { Money } from '../utils/decimal';
import { COMPRAS_MEMORIA } from './compraService';
import { VENTAS_MEMORIA } from './ventaService';

export interface MesHistoricoProrrata {
  periodo: string;
  ventasGravadas: number;
  exportaciones: number;
  ventasNoGravadas: number;
  totalMes: number;
}

export interface LiquidacionProrrataIgv {
  id?: string;
  empresaId: string;
  periodo: string;
  ventasGravadas: number;
  exportacionesMes: number;
  ventasNoGravadas: number; // Exoneradas + Inafectas
  ventasTotales: number;
  // Acumulado de 12 meses (Art. 6° num. 6 Reglamento LIGV)
  ventasGravadas12Meses: number;
  exportaciones12Meses: number;
  ventasNoGravadas12Meses: number;
  ventasTotales12Meses: number;
  serie12Meses: MesHistoricoProrrata[];
  coeficienteProrrata: number; // Factor entre 0 y 1 (ej: 0.6000)
  porcentajeProrrata: number; // Porcentaje a 2 decimales (ej: 60.00)
  // Compras Tipo 2 (Destino común)
  totalBaseComprasDestinoComun: number;
  totalIgvDestinoComun: number;
  igvCreditoFiscalPermitido: number;
  igvGastoCostoNoAdmitido: number;
  cuentaGastoAsignada: string; // 64111 IGV no acreditable (Costo o Gasto según Art. 69° LIGV)
  integrarEnPdt621: boolean;
  esRegularizacionAnual: boolean;
  baseLegal: string;
  updatedAt: string;
}

export interface OpcionesCalculoProrrata {
  ventasGravadasOverride?: number;
  exportacionesOverride?: number;
  ventasNoGravadasOverride?: number;
  baseDestinoComunOverride?: number;
  igvDestinoComunOverride?: number;
  integrarEnPdt621?: boolean;
  usarVentana12Meses?: boolean;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DECLARACIONES_PRORRATA_MEMORIA: LiquidacionProrrataIgv[] = [];

function coincidePeriodo(registroPeriodoId: string | undefined, fecha: string | undefined, periodoObjetivo: string): boolean {
  if (registroPeriodoId === periodoObjetivo || registroPeriodoId === `per-${periodoObjetivo}`) {
    return true;
  }
  if (fecha && fecha.startsWith(periodoObjetivo)) {
    return true;
  }
  return false;
}

function obtenerUltimos12Periodos(periodoFin: string): string[] {
  const [anioStr, mesStr] = periodoFin.split('-');
  let anio = Number(anioStr) || 2026;
  let mes = Number(mesStr) || 9;
  const lista: string[] = [];
  for (let i = 0; i < 12; i++) {
    lista.unshift(`${anio}-${String(mes).padStart(2, '0')}`);
    mes -= 1;
    if (mes < 1) {
      mes = 12;
      anio -= 1;
    }
  }
  return lista;
}

export const prorrataIgvService = {
  /**
   * Calcula la liquidación de prorrata del crédito fiscal de IGV para un período
   * conforme al Art. 23° del TUO de la Ley del IGV y Art. 6° num. 6 del Reglamento.
   */
  async calcularProrrata(
    empresaId: string,
    periodo: string,
    opciones: OpcionesCalculoProrrata = {}
  ): Promise<LiquidacionProrrataIgv> {
    const ventasMes = VENTAS_MEMORIA.filter(
      v => v.empresaId === empresaId && v.estado !== 'ANULADO' && coincidePeriodo(v.periodoId, v.fechaContable || v.fechaEmision, periodo)
    );
    const comprasMes = COMPRAS_MEMORIA.filter(
      c => c.empresaId === empresaId && c.estado !== 'ANULADO' && coincidePeriodo(c.periodoId, c.fechaContable || c.fechaEmision, periodo)
    );

    // 1. Ventas del mes evaluado
    let ventasGravadasMes = Money.create(0);
    let exportacionesMes = Money.create(0);
    let ventasNoGravadasMes = Money.create(0);

    for (const v of ventasMes) {
      const signo = v.tipoComprobante === '07' ? -1 : 1;
      const bg = Number((v as any).baseGravada ?? (v as any).baseImponible ?? 0) * signo;
      const exp = Number((v as any).exportacion ?? (v.tipoOperacion === '0200' ? (v as any).inafecto || 0 : 0)) * signo;
      const bng = (Number((v as any).baseNoGravada || 0) + Number((v as any).exonerado || 0) + (v.tipoOperacion !== '0200' ? Number((v as any).inafecto || 0) : 0)) * signo;

      ventasGravadasMes = Money.add(ventasGravadasMes, bg);
      exportacionesMes = Money.add(exportacionesMes, exp);
      ventasNoGravadasMes = Money.add(ventasNoGravadasMes, bng);
    }

    if (opciones.ventasGravadasOverride !== undefined) {
      ventasGravadasMes = Money.create(opciones.ventasGravadasOverride);
    }
    if (opciones.exportacionesOverride !== undefined) {
      exportacionesMes = Money.create(opciones.exportacionesOverride);
    }
    if (opciones.ventasNoGravadasOverride !== undefined) {
      ventasNoGravadasMes = Money.create(opciones.ventasNoGravadasOverride);
    }

    // Construir serie de los últimos 12 meses incluyendo el período actual
    const periodos12 = obtenerUltimos12Periodos(periodo);
    const serie12Meses: MesHistoricoProrrata[] = [];
    let grav12 = Money.create(0);
    let exp12 = Money.create(0);
    let noGrav12 = Money.create(0);

    for (const per of periodos12) {
      if (per === periodo) {
        const g = Money.toNumber(ventasGravadasMes);
        const e = Money.toNumber(exportacionesMes);
        const ng = Money.toNumber(ventasNoGravadasMes);
        const tot = Money.toNumber(Money.add(Money.add(g, e), ng));
        serie12Meses.push({ periodo: per, ventasGravadas: g, exportaciones: e, ventasNoGravadas: ng, totalMes: tot });
        grav12 = Money.add(grav12, g);
        exp12 = Money.add(exp12, e);
        noGrav12 = Money.add(noGrav12, ng);
      } else {
        const vPer = VENTAS_MEMORIA.filter(
          v => v.empresaId === empresaId && v.estado !== 'ANULADO' && coincidePeriodo(v.periodoId, v.fechaContable || v.fechaEmision, per)
        );
        let gPer = Money.create(0);
        let ePer = Money.create(0);
        let ngPer = Money.create(0);
        for (const v of vPer) {
          const signo = v.tipoComprobante === '07' ? -1 : 1;
          gPer = Money.add(gPer, Number((v as any).baseGravada ?? (v as any).baseImponible ?? 0) * signo);
          ePer = Money.add(ePer, Number((v as any).exportacion ?? 0) * signo);
          ngPer = Money.add(ngPer, (Number((v as any).baseNoGravada || 0) + Number((v as any).exonerado || 0) + Number((v as any).inafecto || 0)) * signo);
        }
        const totPer = Money.toNumber(Money.add(Money.add(gPer, ePer), ngPer));
        serie12Meses.push({
          periodo: per,
          ventasGravadas: Money.toNumber(gPer),
          exportaciones: Money.toNumber(ePer),
          ventasNoGravadas: Money.toNumber(ngPer),
          totalMes: totPer
        });
        if (opciones.usarVentana12Meses) {
          grav12 = Money.add(grav12, gPer);
          exp12 = Money.add(exp12, ePer);
          noGrav12 = Money.add(noGrav12, ngPer);
        }
      }
    }

    // Determinar numerador y denominador (Art. 6° num. 6 Reglamento LIGV)
    const usar12M = Boolean(opciones.usarVentana12Meses);
    const baseGravCalc = usar12M ? grav12 : ventasGravadasMes;
    const baseExpCalc = usar12M ? exp12 : exportacionesMes;
    const baseNoGravCalc = usar12M ? noGrav12 : ventasNoGravadasMes;

    const numerador = Money.add(baseGravCalc, baseExpCalc);
    const denominador = Money.add(numerador, baseNoGravCalc);

    const coeficienteRaw = Money.toNumber(denominador) > 0
      ? Money.toNumber(NumeradorDivDenominador(numerador, denominador))
      : 1.0;

    const coeficiente = Number(coeficienteRaw.toFixed(4));
    const porcentaje = Number((coeficienteRaw * 100).toFixed(2));

    // 2. Compras Tipo 2 (Destino común: destinadas conjuntamente a operaciones gravadas y no gravadas)
    const comprasTipo2 = comprasMes.filter(c => c.tipoAdquisicion === '2' || (c as any).codigoDestinoIgv === '2');
    let baseTipo2 = Money.create(0);
    let igvTipo2 = Money.create(0);

    for (const c of comprasTipo2) {
      const signo = c.tipoComprobante === '07' ? -1 : 1;
      baseTipo2 = Money.add(baseTipo2, Number((c as any).baseGravada ?? (c as any).baseImponible ?? 0) * signo);
      igvTipo2 = Money.add(igvTipo2, Number(c.igv || 0) * signo);
    }

    if (opciones.baseDestinoComunOverride !== undefined) {
      baseTipo2 = Money.create(opciones.baseDestinoComunOverride);
    }
    if (opciones.igvDestinoComunOverride !== undefined) {
      igvTipo2 = Money.create(opciones.igvDestinoComunOverride);
    }

    // IGV admitido como Crédito Fiscal = IGV Tipo 2 * (Porcentaje / 100)
    const factorPorcentaje = Money.div(Money.create(porcentaje), 100);
    const igvAdmitido = Money.toNumber(Money.round(Money.mul(igvTipo2, factorPorcentaje)));
    // IGV no admitido = IGV Tipo 2 - IGV Admitido -> Se transfiere a costo/gasto (Cta 64111)
    const igvNoAdmitido = Money.toNumber(Money.sub(igvTipo2, igvAdmitido));

    const esDiciembre = periodo.endsWith('-12');
    const previa = DECLARACIONES_PRORRATA_MEMORIA.find(d => d.empresaId === empresaId && d.periodo === periodo);
    const integrarEnPdt621 = opciones.integrarEnPdt621 !== undefined
      ? opciones.integrarEnPdt621
      : (previa ? previa.integrarEnPdt621 : true);

    const resultado: LiquidacionProrrataIgv = {
      id: previa?.id || `prorrata-${empresaId}-${periodo}`,
      empresaId,
      periodo,
      ventasGravadas: Money.toNumber(Money.add(ventasGravadasMes, exportacionesMes)),
      exportacionesMes: Money.toNumber(exportacionesMes),
      ventasNoGravadas: Money.toNumber(ventasNoGravadasMes),
      ventasTotales: Money.toNumber(Money.add(Money.add(ventasGravadasMes, exportacionesMes), ventasNoGravadasMes)),
      ventasGravadas12Meses: Money.toNumber(grav12),
      exportaciones12Meses: Money.toNumber(exp12),
      ventasNoGravadas12Meses: Money.toNumber(noGrav12),
      ventasTotales12Meses: Money.toNumber(Money.add(Money.add(grav12, exp12), noGrav12)),
      serie12Meses,
      coeficienteProrrata: coeficiente,
      porcentajeProrrata: porcentaje,
      totalBaseComprasDestinoComun: Money.toNumber(baseTipo2),
      totalIgvDestinoComun: Money.toNumber(igvTipo2),
      igvCreditoFiscalPermitido: igvAdmitido,
      igvGastoCostoNoAdmitido: igvNoAdmitido,
      cuentaGastoAsignada: '64111',
      integrarEnPdt621,
      esRegularizacionAnual: esDiciembre,
      baseLegal: 'Art. 23° TUO de la Ley del IGV (D.S. N° 055-99-EF) y Art. 6° num. 6 del Reglamento LIGV',
      updatedAt: new Date().toISOString()
    };

    const idx = DECLARACIONES_PRORRATA_MEMORIA.findIndex(d => d.empresaId === empresaId && d.periodo === periodo);
    if (idx >= 0) {
      DECLARACIONES_PRORRATA_MEMORIA[idx] = resultado;
    } else {
      DECLARACIONES_PRORRATA_MEMORIA.push(resultado);
    }

    if (db.isPostgresConnected() && UUID_REGEX.test(empresaId)) {
      try {
        const prorrataId = UUID_REGEX.test(resultado.id || '') ? resultado.id! : randomUUID();
        resultado.id = prorrataId;
        await db.query(`
          INSERT INTO declaraciones_prorrata_igv (
            id, empresa_id, periodo, ventas_gravadas_mes, exportaciones_mes, ventas_no_gravadas_mes,
            ventas_gravadas_12m, exportaciones_12m, ventas_no_gravadas_12m,
            coeficiente_prorrata, porcentaje_prorrata, igv_destino_comun, credito_fiscal_admitido,
            igv_costo_gasto_64111, integrar_en_pdt621, es_regularizacion_anual, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP
          )
          ON CONFLICT (empresa_id, periodo) DO UPDATE SET
            ventas_gravadas_mes = EXCLUDED.ventas_gravadas_mes,
            exportaciones_mes = EXCLUDED.exportaciones_mes,
            ventas_no_gravadas_mes = EXCLUDED.ventas_no_gravadas_mes,
            ventas_gravadas_12m = EXCLUDED.ventas_gravadas_12m,
            exportaciones_12m = EXCLUDED.exportaciones_12m,
            ventas_no_gravadas_12m = EXCLUDED.ventas_no_gravadas_12m,
            coeficiente_prorrata = EXCLUDED.coeficiente_prorrata,
            porcentaje_prorrata = EXCLUDED.porcentaje_prorrata,
            igv_destino_comun = EXCLUDED.igv_destino_comun,
            credito_fiscal_admitido = EXCLUDED.credito_fiscal_admitido,
            igv_costo_gasto_64111 = EXCLUDED.igv_costo_gasto_64111,
            integrar_en_pdt621 = EXCLUDED.integrar_en_pdt621,
            es_regularizacion_anual = EXCLUDED.es_regularizacion_anual,
            updated_at = CURRENT_TIMESTAMP
        `, [
          prorrataId, empresaId, periodo, resultado.ventasGravadas, resultado.exportacionesMes, resultado.ventasNoGravadas,
          resultado.ventasGravadas12Meses, resultado.exportaciones12Meses, resultado.ventasNoGravadas12Meses,
          resultado.coeficienteProrrata, resultado.porcentajeProrrata, resultado.totalIgvDestinoComun, resultado.igvCreditoFiscalPermitido,
          resultado.igvGastoCostoNoAdmitido, resultado.integrarEnPdt621, resultado.esRegularizacionAnual
        ]);
      } catch (err) {
        console.warn('⚠️ [prorrataIgvService] Error persistiendo prorrata en PostgreSQL:', err);
      }
    }

    return resultado;
  },

  async configurarIntegracionPdt621(
    empresaId: string,
    periodo: string,
    integrarEnPdt621: boolean
  ): Promise<LiquidacionProrrataIgv> {
    return this.calcularProrrata(empresaId, periodo, { integrarEnPdt621 });
  },

  obtenerGuardada(empresaId: string, periodo: string): LiquidacionProrrataIgv | null {
    return DECLARACIONES_PRORRATA_MEMORIA.find(d => d.empresaId === empresaId && d.periodo === periodo) || null;
  }
};

function NumeradorDivDenominador(num: any, den: any) {
  return Money.div(num, den);
}
