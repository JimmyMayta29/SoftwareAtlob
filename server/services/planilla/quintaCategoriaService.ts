import { Money } from '../../utils/decimal';
import { parametroRepository } from '../../repositories/parametroRepository';
import type { TrabajadorModel, ProyeccionQuintaDetalle, PlanillaModel } from '../planillaService';

/**
 * Retorna el divisor oficial de Renta de Quinta Categoría según el Art. 40° del Reglamento de la LIR (D.S. N° 122-94-EF)
 * - Enero a Marzo: 12
 * - Abril: 9
 * - Mayo a Julio: 8
 * - Agosto: 5
 * - Septiembre a Noviembre: 4 (incluye Octubre = 4)
 * - Diciembre: 1 (regularización final)
 */
export function obtenerDivisorQuintaCategoria(mesNumero: number): number {
  if (mesNumero >= 1 && mesNumero <= 3) return 12;
  if (mesNumero === 4) return 9;
  if (mesNumero >= 5 && mesNumero <= 7) return 8;
  if (mesNumero === 8) return 5;
  if (mesNumero >= 9 && mesNumero <= 11) return 4;
  return 1; // Diciembre
}

/**
 * Determina hasta qué mes anterior se deducen las retenciones previas según Art. 40° Rgto. LIR
 * - Ene-Mar: no deducen retenciones previas (mes corte 0)
 * - Abril: deduce retenciones de Ene-Mar (mes corte 3)
 * - May-Jul: deduce retenciones de Ene-Abr (mes corte 4)
 * - Agosto: deduce retenciones de Ene-Jul (mes corte 7)
 * - Set-Nov: deduce retenciones de Ene-Ago (mes corte 8)
 * - Diciembre: deduce retenciones de Ene-Nov (mes corte 11)
 */
export function obtenerMesCorteRetencionesPrevias(mesNumero: number): number {
  if (mesNumero <= 3) return 0;
  if (mesNumero === 4) return 3;
  if (mesNumero >= 5 && mesNumero <= 7) return 4;
  if (mesNumero === 8) return 7;
  if (mesNumero >= 9 && mesNumero <= 11) return 8;
  return 11;
}

export function calcularDiasLaborablesMes(
  mesStr: string,
  fechaIngreso: string,
  fechaCese?: string
): number {
  const [anioStr, mStr] = mesStr.split('-');
  const anio = Number(anioStr);
  const mes = Number(mStr);
  const fechaInicioMes = `${mesStr}-01`;
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const fechaFinMes = `${mesStr}-${String(ultimoDia).padStart(2, '0')}`;

  if (fechaIngreso > fechaFinMes) return 0;
  if (fechaCese && fechaCese < fechaInicioMes) return 0;

  let diaIni = 1;
  if (fechaIngreso.startsWith(mesStr)) {
    diaIni = Number(fechaIngreso.split('-')[2]);
  }

  let diaFin = 30; // Base comercial estándar 30 días para cálculo mensual
  if (fechaCese && fechaCese.startsWith(mesStr)) {
    diaFin = Math.min(30, Number(fechaCese.split('-')[2]));
  }

  return Math.max(0, diaFin - diaIni + 1);
}

export const quintaCategoriaService = {
  obtenerDivisorQuintaCategoria,
  obtenerMesCorteRetencionesPrevias,
  calcularDiasLaborablesMes,

  async calcularProyeccionQuinta(
    empresaId: string,
    trabajador: TrabajadorModel,
    mes: string, // 'YYYY-MM'
    remuneracionOrdinariaMes: any, // Decimal
    ingresosVariablesMes: any, // Decimal
    planillasMemoria: PlanillaModel[],
    deduccionAdicionalInput?: number
  ): Promise<ProyeccionQuintaDetalle> {
    const [anioStr, mesStr] = mes.split('-');
    const anio = Number(anioStr);
    const mesNumero = Number(mesStr);
    const fechaRef = `${mes}-28`;

    // 1. Obtener UIT y Parámetros del Año
    const valorUit = await parametroRepository.obtenerUitPorAnio(anio);
    const numUitDeduccion = await parametroRepository.obtenerValorNumerico('DEDUCCION_5TA_UIT', 7, fechaRef);
    const topeUitAdicional = await parametroRepository.obtenerValorNumerico('TOPE_DEDUCCION_ADICIONAL_5TA_UIT', 3, fechaRef);
    const tasaT1 = await parametroRepository.obtenerValorNumerico('TASA_5TA_TRAMO_1', 0.08, fechaRef);
    const tasaT2 = await parametroRepository.obtenerValorNumerico('TASA_5TA_TRAMO_2', 0.14, fechaRef);
    const tasaT3 = await parametroRepository.obtenerValorNumerico('TASA_5TA_TRAMO_3', 0.17, fechaRef);
    const tasaT4 = await parametroRepository.obtenerValorNumerico('TASA_5TA_TRAMO_4', 0.20, fechaRef);
    const tasaT5 = await parametroRepository.obtenerValorNumerico('TASA_5TA_TRAMO_5', 0.30, fechaRef);
    const tasaBonifExtra = trabajador.afiliadoEps
      ? await parametroRepository.obtenerValorNumerico('TASA_BONIF_EXTRA_EPS', 0.0675, fechaRef)
      : await parametroRepository.obtenerValorNumerico('TASA_BONIF_EXTRA_ESSALUD', 0.09, fechaRef);

    // 2. Acumular Remuneraciones Percibidas y Retenciones Previas del Mismo Empleador y/o Empleador Anterior
    let remAnteriores = Money.create(trabajador.remuneracionesPreviasAnio || 0);
    let retencionesPreviasReales = Money.create(trabajador.retencionesPrevias5taAnio || 0);

    const mesCorteRetenciones = obtenerMesCorteRetencionesPrevias(mesNumero);

    const planillasAnioPrevias = planillasMemoria.filter(
      p => p.empresaId === empresaId && p.mes.startsWith(`${anio}-`) && p.mes < mes
    );

    for (const pl of planillasAnioPrevias) {
      const linea = pl.lineas.find(l => l.trabajadorId === trabajador.id);
      if (linea) {
        remAnteriores = Money.add(remAnteriores, Money.create(linea.totalRemuneracion));
        const numMesPla = Number(pl.mes.split('-')[1]);
        if (numMesPla <= mesCorteRetenciones) {
          retencionesPreviasReales = Money.add(retencionesPreviasReales, Money.create(linea.retencionQuintaCategoria));
        }
      }
    }

    // 3. Proyección de Remuneraciones Ordinarias de Meses Restantes (mesNumero + 1 hasta 12)
    const mesesRestantes = Math.max(0, 12 - mesNumero);
    let remProyectadaRestante = Money.create(0);
    const remuneracionMensualContrato = Money.toNumber(remuneracionOrdinariaMes);

    for (let m = mesNumero + 1; m <= 12; m++) {
      const mStr = `${anio}-${String(m).padStart(2, '0')}`;
      const diasMes = calcularDiasLaborablesMes(mStr, trabajador.fechaIngreso, trabajador.fechaCese);
      if (diasMes > 0) {
        const factorDias = diasMes >= 30 ? 1 : diasMes / 30;
        remProyectadaRestante = Money.add(
          remProyectadaRestante,
          Money.round(Money.create(remuneracionMensualContrato).times(factorDias))
        );
      }
    }

    // Proyección de Gratificaciones Ordinarias de Julio y Diciembre (Ley 27735 y Ley 30334)
    const factorRegimenGratif =
      trabajador.regimenLaboral === 'GENERAL' ? 1.0 :
      trabajador.regimenLaboral === 'MYPE_PEQUENA' ? 0.5 : 0.0;

    let mesesGratifJulio = 0;
    let mesesGratifDiciembre = 0;

    for (let m = 1; m <= 6; m++) {
      const mStr = `${anio}-${String(m).padStart(2, '0')}`;
      if (calcularDiasLaborablesMes(mStr, trabajador.fechaIngreso, trabajador.fechaCese) >= 30) {
        mesesGratifJulio++;
      }
    }
    for (let m = 7; m <= 12; m++) {
      const mStr = `${anio}-${String(m).padStart(2, '0')}`;
      if (calcularDiasLaborablesMes(mStr, trabajador.fechaIngreso, trabajador.fechaCese) >= 30) {
        mesesGratifDiciembre++;
      }
    }

    let gratifProyectada = Money.create(0);
    let bonifExtraProyectada = Money.create(0);

    if (mesNumero >= 7) {
      if (mesNumero < 12) {
        const gDic = Money.round(
          Money.create(remuneracionMensualContrato).times(factorRegimenGratif).dividedBy(6).times(mesesGratifDiciembre)
        );
        const bDic = Money.round(gDic.times(tasaBonifExtra));
        gratifProyectada = Money.add(gratifProyectada, gDic);
        bonifExtraProyectada = Money.add(bonifExtraProyectada, bDic);
      }
    } else {
      const gJul = Money.round(
        Money.create(remuneracionMensualContrato).times(factorRegimenGratif).dividedBy(6).times(mesesGratifJulio)
      );
      const gDic = Money.round(
        Money.create(remuneracionMensualContrato).times(factorRegimenGratif).dividedBy(6).times(mesesGratifDiciembre)
      );
      gratifProyectada = Money.add(gJul, gDic);
      bonifExtraProyectada = Money.round(gratifProyectada.times(tasaBonifExtra));
    }

    // 4. Renta Bruta Anual Proyectada
    const remMesTotal = Money.add(Money.create(remuneracionOrdinariaMes), Money.create(ingresosVariablesMes));
    const rentaBrutaAnual = Money.add(
      remAnteriores,
      Money.add(remMesTotal, Money.add(remProyectadaRestante, Money.add(gratifProyectada, bonifExtraProyectada)))
    );

    // 5. Deducción de 7 UIT fija + hasta 3 UIT adicional acreditada
    const deduccion7Uit = Money.round(Money.create(valorUit).times(numUitDeduccion));
    const topeAdicionalSoles = Money.toNumber(Money.round(Money.create(valorUit).times(topeUitAdicional)));
    const montoAdicionalSolicitado = Number(deduccionAdicionalInput ?? trabajador.deduccionAdicional3Uit ?? 0);
    const deduccionAdicional3Uit = Money.round(
      Money.create(Math.max(0, Math.min(montoAdicionalSolicitado, topeAdicionalSoles)))
    );
    const totalDeduccionUit = Money.add(deduccion7Uit, deduccionAdicional3Uit);

    const rentaNetaAnual = Money.toNumber(rentaBrutaAnual) > Money.toNumber(totalDeduccionUit)
      ? Money.sub(rentaBrutaAnual, totalDeduccionUit)
      : Money.create(0);

    // 6. Aplicación de Escala Progresiva Acumulativa por Tramos
    const tope1 = 5 * valorUit;
    const tope2 = 20 * valorUit;
    const tope3 = 35 * valorUit;
    const tope4 = 45 * valorUit;
    const rnNum = Money.toNumber(rentaNetaAnual);

    const baseT1 = Math.max(0, Math.min(rnNum, tope1));
    const baseT2 = Math.max(0, Math.min(rnNum - tope1, tope2 - tope1));
    const baseT3 = Math.max(0, Math.min(rnNum - tope2, tope3 - tope2));
    const baseT4 = Math.max(0, Math.min(rnNum - tope3, tope4 - tope3));
    const baseT5 = Math.max(0, rnNum - tope4);

    const impT1 = Money.round(Money.create(baseT1).times(tasaT1));
    const impT2 = Money.round(Money.create(baseT2).times(tasaT2));
    const impT3 = Money.round(Money.create(baseT3).times(tasaT3));
    const impT4 = Money.round(Money.create(baseT4).times(tasaT4));
    const impT5 = Money.round(Money.create(baseT5).times(tasaT5));

    const impuestoAnual = Money.add(impT1, Money.add(impT2, Money.add(impT3, Money.add(impT4, impT5))));

    // Si no hubo planillas previas reales pero estamos en mes > 3 y proyectamos meses previos sin certificado externo, estimar retenciones previas
    if (
      planillasAnioPrevias.length === 0 &&
      (trabajador.retencionesPrevias5taAnio || 0) === 0 &&
      (trabajador.remuneracionesPreviasAnio || 0) === 0 &&
      mesCorteRetenciones > 0
    ) {
      let mesesPreviosConRetencion = 0;
      for (let m = 1; m <= mesCorteRetenciones; m++) {
        const mStr = `${anio}-${String(m).padStart(2, '0')}`;
        if (calcularDiasLaborablesMes(mStr, trabajador.fechaIngreso, trabajador.fechaCese) > 0) {
          mesesPreviosConRetencion++;
        }
      }
      retencionesPreviasReales = Money.round(impuestoAnual.dividedBy(12).times(mesesPreviosConRetencion));
    }

    const divisor = obtenerDivisorQuintaCategoria(mesNumero);
    const saldoImpuesto = Money.toNumber(impuestoAnual) > Money.toNumber(retencionesPreviasReales)
      ? Money.sub(impuestoAnual, retencionesPreviasReales)
      : Money.create(0);

    const retencionMensual = Money.round(saldoImpuesto.dividedBy(divisor));

    return {
      anio,
      mesNumero,
      valorUit,
      remuneracionesAnteriores: Money.toNumber(remAnteriores),
      remuneracionOrdinariaMes: Money.toNumber(Money.round(remuneracionOrdinariaMes)),
      ingresosVariablesMes: Money.toNumber(Money.round(ingresosVariablesMes)),
      remuneracionProyectadaRestante: Money.toNumber(remProyectadaRestante),
      gratificacionesProyectadas: Money.toNumber(gratifProyectada),
      bonificacionExtraProyectada: Money.toNumber(bonifExtraProyectada),
      rentaBrutaAnualProyectada: Money.toNumber(rentaBrutaAnual),
      deduccion7Uit: Money.toNumber(deduccion7Uit),
      deduccionAdicional3Uit: Money.toNumber(deduccionAdicional3Uit),
      rentaNetaAnualQuinta: Money.toNumber(rentaNetaAnual),
      impuestoTramo1_8pct: Money.toNumber(impT1),
      impuestoTramo2_14pct: Money.toNumber(impT2),
      impuestoTramo3_17pct: Money.toNumber(impT3),
      impuestoTramo4_20pct: Money.toNumber(impT4),
      impuestoTramo5_30pct: Money.toNumber(impT5),
      impuestoAnualCalculado: Money.toNumber(impuestoAnual),
      retencionesAnterioresDeducibles: Money.toNumber(retencionesPreviasReales),
      divisorMes: divisor,
      retencionMensual: Money.toNumber(retencionMensual),
      remuneracionBrutaAnualProyectada: Money.toNumber(rentaBrutaAnual),
      impuestoAnualProyectado: Money.toNumber(impuestoAnual)
    } as any;
  }
};
