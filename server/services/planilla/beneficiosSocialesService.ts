import { Money } from '../../utils/decimal';
import { parametroRepository } from '../../repositories/parametroRepository';
import { calcularDiasLaborablesMes } from './quintaCategoriaService';
import type {
  TrabajadorModel,
  GratificacionLineaModel,
  CtsLineaModel,
  PlanillaModel
} from '../planillaService';

export const beneficiosSocialesService = {
  async calcularGratificaciones(
    empresaId: string,
    periodo: string, // 'YYYY-07' o 'YYYY-12'
    trabajadoresActivos: TrabajadorModel[],
    userId: string
  ): Promise<{
    periodo: string;
    semestre: 'JULIO' | 'DICIEMBRE';
    totalGratificacionOrdinaria: number;
    totalBonificacionExtraordinaria: number;
    totalRetencionQuinta: number;
    totalNetoPagar: number;
    lineas: GratificacionLineaModel[];
    items: GratificacionLineaModel[];
    advertencias?: string[];
  }> {
    const [anioStr, mesStr] = periodo.split('-');
    const anio = Number(anioStr);
    const semestre: 'JULIO' | 'DICIEMBRE' = mesStr === '12' ? 'DICIEMBRE' : 'JULIO';
    const fechaRef = `${periodo}-15`;

    const paramRmv = (await parametroRepository.obtenerParametroPorCodigo('RMV', fechaRef))
      || (await parametroRepository.obtenerParametroPorCodigo('RMV_2026', fechaRef));
    const rmvMonto = paramRmv ? paramRmv.valorNumerico : 0;
    const tasaAsigFam = await parametroRepository.obtenerValorNumerico('TASA_ASIGNACION_FAMILIAR', 0.10, fechaRef);
    const montoAsigFam = Money.toNumber(Money.round(Money.create(rmvMonto).times(tasaAsigFam)));
    const tasaBonifEssalud = await parametroRepository.obtenerValorNumerico('TASA_BONIF_EXTRA_ESSALUD', 0.09, fechaRef);
    const tasaBonifEps = await parametroRepository.obtenerValorNumerico('TASA_BONIF_EXTRA_EPS', 0.0675, fechaRef);

    const mesesSemestre = semestre === 'JULIO' ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12];
    const lineas: GratificacionLineaModel[] = [];
    let totGratif = Money.create(0);
    let totBonif = Money.create(0);
    let totQuinta = Money.create(0);
    let totNeto = Money.create(0);
    const advertencias: string[] = [];

    for (const trab of trabajadoresActivos) {
      let mesesComp = 0;
      let diasComp = 0;
      for (const m of mesesSemestre) {
        const mStr = `${anio}-${String(m).padStart(2, '0')}`;
        const diasMes = calcularDiasLaborablesMes(mStr, trab.fechaIngreso, trab.fechaCese);
        if (diasMes >= 30) {
          mesesComp++;
        } else if (diasMes > 0) {
          diasComp += diasMes;
        }
      }

      if (mesesComp === 0 && diasComp === 0) continue;

      const sueldoComp = Money.create(trab.sueldoBase);
      const asigFam = (trab.tieneAsignacionFamiliar || (trab.cargasFamiliares || 0) > 0)
        ? Money.create(montoAsigFam)
        : Money.create(0);
      const remComputable = Money.add(sueldoComp, asigFam);

      const factorRegimen =
        trab.regimenLaboral === 'GENERAL' ? 1.0 :
        trab.regimenLaboral === 'MYPE_PEQUENA' ? 0.5 : 0.0;

      const gratifPorMeses = remComputable.times(factorRegimen).dividedBy(6).times(mesesComp);
      const gratifPorDias = remComputable.times(factorRegimen).dividedBy(180).times(diasComp);
      const gratificacionOrdinaria = Money.round(Money.add(gratifPorMeses, gratifPorDias));

      const tasaBonif = trab.afiliadoEps ? tasaBonifEps : tasaBonifEssalud;
      const bonifExtra = factorRegimen > 0
        ? Money.round(gratificacionOrdinaria.times(tasaBonif))
        : Money.create(0);

      const netoPagar = Money.add(gratificacionOrdinaria, bonifExtra);

      totGratif = Money.add(totGratif, gratificacionOrdinaria);
      totBonif = Money.add(totBonif, bonifExtra);
      totNeto = Money.add(totNeto, netoPagar);

      const item: any = {
        id: `grat-${Date.now()}-${trab.id}`,
        empresaId,
        periodo,
        semestre,
        trabajadorId: trab.id,
        trabajadorNombre: `${trab.apellidos}, ${trab.nombres}`,
        trabajadorDocumento: trab.numeroDocumento,
        regimenLaboral: trab.regimenLaboral,
        mesesComputables: mesesComp,
        diasComputables: diasComp,
        sueldoComputable: Money.toNumber(sueldoComp),
        sueldoBasico: Money.toNumber(sueldoComp),
        asignacionFamiliar: Money.toNumber(asigFam),
        promedioVariables: 0,
        remuneracionComputable: Money.toNumber(remComputable),
        gratificacionOrdinaria: Money.toNumber(gratificacionOrdinaria),
        montoGratificacion: Money.toNumber(gratificacionOrdinaria),
        tasaBonifExtraordinaria: tasaBonif,
        tasaBonificacion: tasaBonif,
        bonificacionExtraordinaria: Money.toNumber(bonifExtra),
        retencionQuinta: 0,
        netoPagar: Money.toNumber(netoPagar),
        netoGratificacion: Money.toNumber(netoPagar),
        bancoAbono: trab.bancoSueldo || 'BCP',
        cuentaAbono: trab.cuentaBancoSueldo || 'Pendiente apertura',
        centroCosto: trab.centroCosto || 'ADMINISTRACION',
        estado: 'CALCULADA',
        createdAt: new Date().toISOString()
      };

      lineas.push(item);
    }

    return {
      periodo,
      semestre,
      totalGratificacionOrdinaria: Money.toNumber(totGratif),
      totalBonificacionExtraordinaria: Money.toNumber(totBonif),
      totalRetencionQuinta: Money.toNumber(totQuinta),
      totalNetoPagar: Money.toNumber(totNeto),
      lineas,
      items: lineas,
      advertencias
    };
  },

  async calcularCts(
    empresaId: string,
    periodo: string, // 'YYYY-05' (Nov-Abr) o 'YYYY-11' (May-Oct)
    trabajadoresActivos: TrabajadorModel[],
    planillasMemoria: PlanillaModel[],
    gratificacionesHistoricas: GratificacionLineaModel[],
    userId: string
  ): Promise<{
    periodo: string;
    semestre: 'MAYO' | 'NOVIEMBRE';
    totalCtsDepositada: number;
    lineas: CtsLineaModel[];
    items: CtsLineaModel[];
    advertencias?: string[];
  }> {
    const [anioStr, mesStr] = periodo.split('-');
    const anio = Number(anioStr);
    const semestre: 'MAYO' | 'NOVIEMBRE' = mesStr === '11' ? 'NOVIEMBRE' : 'MAYO';
    const fechaRef = `${periodo}-15`;

    const paramRmv = (await parametroRepository.obtenerParametroPorCodigo('RMV', fechaRef))
      || (await parametroRepository.obtenerParametroPorCodigo('RMV_2026', fechaRef));
    const rmvMonto = paramRmv ? paramRmv.valorNumerico : 0;
    const tasaAsigFam = await parametroRepository.obtenerValorNumerico('TASA_ASIGNACION_FAMILIAR', 0.10, fechaRef);
    const montoAsigFam = Money.toNumber(Money.round(Money.create(rmvMonto).times(tasaAsigFam)));

    // Semestre CTS Mayo: Nov(anio-1) a Abr(anio); Semestre CTS Noviembre: May(anio) a Oct(anio)
    const mesesSemestreCts = semestre === 'MAYO'
      ? [`${anio - 1}-11`, `${anio - 1}-12`, `${anio}-01`, `${anio}-02`, `${anio}-03`, `${anio}-04`]
      : [`${anio}-05`, `${anio}-06`, `${anio}-07`, `${anio}-08`, `${anio}-09`, `${anio}-10`];

    // Periodo de gratificación del semestre anterior para el cálculo de 1/6 (Art. 18° TUO D.Leg. 650)
    // Para CTS Mayo corresponde Diciembre del año anterior; para CTS Noviembre corresponde Julio del mismo año
    const periodoGratifSemestreAnterior = semestre === 'MAYO' ? `${anio - 1}-12` : `${anio}-07`;

    const lineas: CtsLineaModel[] = [];
    let totCts = Money.create(0);
    const advertenciasGlobales: string[] = [];

    for (const trab of trabajadoresActivos) {
      let mesesComp = 0;
      let diasComp = 0;
      for (const mStr of mesesSemestreCts) {
        const diasMes = calcularDiasLaborablesMes(mStr, trab.fechaIngreso, trab.fechaCese);
        if (diasMes >= 30) {
          mesesComp++;
        } else if (diasMes > 0) {
          diasComp += diasMes;
        }
      }

      if (mesesComp === 0 && diasComp === 0) continue;

      const sueldoComp = Money.create(trab.sueldoBase);
      const asigFam = (trab.tieneAsignacionFamiliar || (trab.cargasFamiliares || 0) > 0)
        ? Money.create(montoAsigFam)
        : Money.create(0);

      // Promedio de horas extras y variables (Arts. 16° y 17° D.S. N° 001-97-TR: al menos 3 meses en semestre)
      const planillasSemCts = planillasMemoria.filter(
        p => p.empresaId === empresaId && mesesSemestreCts.includes(p.mes)
      );
      let mesesConVariablesCts = 0;
      let sumaVariablesCts = Money.create(0);
      for (const pl of planillasSemCts) {
        const lin = pl.lineas.find(x => x.trabajadorId === trab.id);
        if (lin && (lin.horasExtras + (lin.bonificacionesGravadas || 0) + lin.otrosIngresos) > 0) {
          mesesConVariablesCts++;
          sumaVariablesCts = Money.add(sumaVariablesCts, Money.create(lin.horasExtras + (lin.bonificacionesGravadas || 0) + lin.otrosIngresos));
        }
      }
      const promedioVariables = mesesConVariablesCts >= 3
        ? Money.round(sumaVariablesCts.dividedBy(6))
        : Money.create(0);

      const factorRegimen =
        trab.regimenLaboral === 'GENERAL' ? 1.0 :
        trab.regimenLaboral === 'MYPE_PEQUENA' ? 0.5 : 0.0;

      // 1/6 de la gratificación realmente pagada en el semestre anterior (Art. 18° TUO D.Leg. 650)
      const baseOrdinaria = Money.add(sueldoComp, asigFam);
      let sextoGratificacion = Money.create(0);
      let tieneHistorialGratif = false;

      // 1. Buscar en registros persistidos de gratificaciones del período anterior
      const gratifPrevia = gratificacionesHistoricas.find(
        g => g.empresaId === empresaId && g.trabajadorId === trab.id && g.periodo === periodoGratifSemestreAnterior
      );

      if (gratifPrevia && gratifPrevia.gratificacionOrdinaria > 0) {
        sextoGratificacion = Money.round(Money.create(gratifPrevia.gratificacionOrdinaria).dividedBy(6));
        tieneHistorialGratif = true;
      } else if (trab.remuneracionesPreviasAnio && (trab as any).gratificacionSemestreAnterior) {
        sextoGratificacion = Money.round(Money.create((trab as any).gratificacionSemestreAnterior).dividedBy(6));
        tieneHistorialGratif = true;
      } else {
        // Estimación subsidiaria con advertencia explícita
        sextoGratificacion = Money.round(baseOrdinaria.times(factorRegimen).dividedBy(6));
        const adv = `ADVERTENCIA CTS (${trab.apellidos}): No se encontró registro histórico de gratificación pagada en el período ${periodoGratifSemestreAnterior}. Se utilizó 1/6 estimado de la remuneración computable actual (S/ ${Money.toNumber(sextoGratificacion).toFixed(2)}).`;
        advertenciasGlobales.push(adv);
      }

      const remComputable = Money.add(baseOrdinaria, Money.add(promedioVariables, sextoGratificacion));

      // CTS = (Remuneración Computable * factorRegimen) * (meses / 12 + dias / 360)
      const ctsPorMeses = remComputable.times(factorRegimen).dividedBy(12).times(mesesComp);
      const ctsPorDias = remComputable.times(factorRegimen).dividedBy(360).times(diasComp);
      const ctsDepositada = Money.round(Money.add(ctsPorMeses, ctsPorDias));

      totCts = Money.add(totCts, ctsDepositada);

      const item: any = {
        id: `cts-${Date.now()}-${trab.id}`,
        empresaId,
        periodo,
        semestre,
        trabajadorId: trab.id,
        trabajadorNombre: `${trab.apellidos}, ${trab.nombres}`,
        trabajadorDocumento: trab.numeroDocumento,
        regimenLaboral: trab.regimenLaboral,
        mesesComputables: mesesComp,
        diasComputables: diasComp,
        sueldoComputable: Money.toNumber(sueldoComp),
        sueldoBasico: Money.toNumber(sueldoComp),
        asignacionFamiliar: Money.toNumber(asigFam),
        sextoGratificacion: Money.toNumber(sextoGratificacion),
        promedioVariables: Money.toNumber(promedioVariables),
        remuneracionComputable: Money.toNumber(remComputable),
        ctsDepositada: Money.toNumber(ctsDepositada),
        montoCts: Money.toNumber(ctsDepositada),
        bancoCts: trab.bancoSueldo || 'BCP',
        cuentaCts: trab.cuentaBancoSueldo || 'Pendiente apertura',
        centroCosto: trab.centroCosto || 'ADMINISTRACION',
        estado: 'CALCULADA',
        createdAt: new Date().toISOString(),
        advertencias: !tieneHistorialGratif
          ? [`No se encontró gratificación histórica de ${periodoGratifSemestreAnterior}; se empleó 1/6 estimado.`]
          : []
      };

      lineas.push(item);
    }

    return {
      periodo,
      semestre,
      totalCtsDepositada: Money.toNumber(totCts),
      lineas,
      items: lineas,
      advertencias: advertenciasGlobales
    };
  }
};
