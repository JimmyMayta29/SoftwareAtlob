import { Money } from '../../utils/decimal';
import { parametroRepository } from '../../repositories/parametroRepository';
import { calcularDiasLaborablesMes } from './quintaCategoriaService';
import type { TrabajadorModel, LiquidacionBeneficiosModel } from '../planillaService';

export const liquidacionService = {
  async calcularLiquidacionBeneficios(
    empresaId: string,
    trab: TrabajadorModel,
    input: {
      trabajadorId: string;
      fechaCese: string;
      motivoCese?: string;
      diasVacacionesPendientes?: number;
      mesesCtsTruncos?: number;
      diasCtsTruncos?: number;
      mesesGratiTruncos?: number;
      incluirRemuneracionMesCese?: boolean;
    },
    userId: string
  ): Promise<LiquidacionBeneficiosModel & {
    remuneracionMensualPendiente: number;
    detallesLaborales: {
      diasVacacionesPendientes: number;
      mesesCts: number;
      diasCts: number;
      mesesGratificacion: number;
      conceptosAfectosAporte: string[];
      conceptosInafectosAporte: string[];
      conceptosGravados5ta: string[];
      conceptosInafectos5ta: string[];
      requiereValidacionLaboralista: boolean;
      observacionesLaborales: string[];
    };
  }> {
    if (input.fechaCese < trab.fechaIngreso) {
      throw new Error('FECHA_CESE_INVALIDA: La fecha de cese no puede ser anterior a la fecha de ingreso.');
    }

    const periodoCese = input.fechaCese.slice(0, 7);
    const [anioCese, mesCese, diaCese] = input.fechaCese.split('-').map(Number);
    const [anioIng, mesIng, diaIng] = trab.fechaIngreso.split('-').map(Number);

    const paramRmvCese = await parametroRepository.obtenerParametroPorCodigo('RMV', input.fechaCese);
    const rmvMonto = paramRmvCese ? paramRmvCese.valorNumerico : 0;
    const tasaAsigFam = await parametroRepository.obtenerValorNumerico('TASA_ASIGNACION_FAMILIAR', 0.10, input.fechaCese);
    const tasaOnp = await parametroRepository.obtenerValorNumerico('TASA_ONP', 0.13, input.fechaCese);
    const tasaEssalud = await parametroRepository.obtenerValorNumerico('TASA_ESSALUD', 0.09, input.fechaCese);
    const tasaBonifExtra = trab.afiliadoEps
      ? await parametroRepository.obtenerValorNumerico('TASA_BONIF_EXTRA_EPS', 0.0675, input.fechaCese)
      : await parametroRepository.obtenerValorNumerico('TASA_BONIF_EXTRA_ESSALUD', 0.09, input.fechaCese);

    const asigFam = (trab.tieneAsignacionFamiliar || (trab.cargasFamiliares || 0) > 0)
      ? Money.round(Money.create(rmvMonto).times(tasaAsigFam))
      : Money.create(0);
    const remComputable = Money.add(Money.create(trab.sueldoBase), asigFam);

    // 1. Remuneración de días laborados en el mes de cese (baja a mitad de mes)
    const diasTrabajadosMesCese = calcularDiasLaborablesMes(periodoCese, trab.fechaIngreso, input.fechaCese);
    const incluirSueldoMes = input.incluirRemuneracionMesCese ?? true;
    const sueldoPropMes = incluirSueldoMes
      ? Money.round(Money.create(trab.sueldoBase).times(diasTrabajadosMesCese).dividedBy(30))
      : Money.create(0);
    const remProporcionalMes = incluirSueldoMes && diasTrabajadosMesCese > 0
      ? Money.add(sueldoPropMes, asigFam)
      : Money.create(0);

    // 2. Gratificación Trunca (Meses calendarios completos en el semestre)
    const inicioSemGratifMes = mesCese <= 6 ? 1 : 7;
    let gratifTruncaMeses = 0;
    if (input.mesesGratiTruncos !== undefined) {
      gratifTruncaMeses = Number(input.mesesGratiTruncos);
    } else {
      for (let m = inicioSemGratifMes; m <= mesCese; m++) {
        const mStr = `${anioCese}-${String(m).padStart(2, '0')}`;
        const d = calcularDiasLaborablesMes(mStr, trab.fechaIngreso, input.fechaCese);
        if (d >= 30) gratifTruncaMeses++;
      }
    }
    const factorGratifCts =
      trab.regimenLaboral === 'GENERAL' ? 1.0 :
      trab.regimenLaboral === 'MYPE_PEQUENA' ? 0.5 : 0.0;

    const gratifTruncaMonto = Money.round(
      remComputable.times(factorGratifCts).dividedBy(6).times(gratifTruncaMeses)
    );
    const bonifExtraTruncaMonto = Money.round(gratifTruncaMonto.times(tasaBonifExtra));

    // 3. CTS Trunca (Desde 01/May o 01/Nov hasta fecha de cese)
    const inicioSemCts = mesCese >= 5 && mesCese <= 10
      ? `${anioCese}-05-01`
      : mesCese >= 11
        ? `${anioCese}-11-01`
        : `${anioCese - 1}-11-01`;
    const fechaInicioCtsEfectiva = trab.fechaIngreso > inicioSemCts ? trab.fechaIngreso : inicioSemCts;
    const [aIniCts, mIniCts, dIniCts] = fechaInicioCtsEfectiva.split('-').map(Number);
    const totalDiasCtsCalc = Math.max(0, (anioCese - aIniCts) * 360 + (mesCese - mIniCts) * 30 + (Math.min(30, diaCese) - dIniCts + 1));
    const ctsTruncaMeses = input.mesesCtsTruncos !== undefined ? Number(input.mesesCtsTruncos) : Math.floor(totalDiasCtsCalc / 30);
    const ctsTruncaDias = input.diasCtsTruncos !== undefined ? Number(input.diasCtsTruncos) : (totalDiasCtsCalc % 30);
    const totalDiasCts = ctsTruncaMeses * 30 + ctsTruncaDias;

    const sextoGratifCts = Money.round(remComputable.times(factorGratifCts).dividedBy(6));
    const remCompCts = Money.add(remComputable, sextoGratifCts);
    const ctsTruncaMonto = Money.round(
      remCompCts.times(factorGratifCts).dividedBy(360).times(totalDiasCts)
    );

    // 4. Vacaciones Truncas
    const totalDiasDesdeIngreso = Math.max(0, (anioCese - anioIng) * 360 + (mesCese - mesIng) * 30 + (Math.min(30, diaCese) - diaIng + 1));
    const diasRecordVacacionalTrunco = totalDiasDesdeIngreso % 360 || (totalDiasDesdeIngreso > 0 ? 360 : 0);
    const factorVacaciones = trab.regimenLaboral === 'GENERAL' ? 1.0 : 0.5;
    const vacacionesTruncasMonto = input.diasVacacionesPendientes !== undefined
      ? Money.round(remComputable.dividedBy(30).times(Number(input.diasVacacionesPendientes)).times(factorVacaciones))
      : Money.round(remComputable.times(factorVacaciones).dividedBy(360).times(diasRecordVacacionalTrunco));

    // 5. Base afecta a aportes previsionales (ONP/AFP) y EsSalud (solo remuneración y vacaciones truncas)
    const baseAfectaPension = Money.add(remProporcionalMes, vacacionesTruncasMonto);
    let descuentoPension = Money.create(0);
    if (trab.sistemaPensiones === 'ONP') {
      descuentoPension = Money.round(baseAfectaPension.times(tasaOnp));
    } else {
      const admin = trab.afpAdministradora || 'INTEGRA';
      const codComision = `AFP_${admin}_COMISION_${trab.afpTipoComision || 'FLUJO'}`;
      const codPrima = `AFP_${admin}_PRIMA_SEGURO`;
      const tasaFondo = 0.10;
      const tasaComision = await parametroRepository.obtenerValorNumerico(codComision, 0.0155, input.fechaCese);
      const tasaPrima = await parametroRepository.obtenerValorNumerico(codPrima, 0.0184, input.fechaCese);
      const topeSeguro = await parametroRepository.obtenerValorNumerico('TOPE_PRIMA_SEGURO_AFP', 12410.00, input.fechaCese);

      const aporteFondo = Money.round(baseAfectaPension.times(tasaFondo));
      const comisionAfp = Money.round(baseAfectaPension.times(tasaComision));
      const basePrima = Math.min(Money.toNumber(baseAfectaPension), topeSeguro);
      const primaAfp = Money.round(Money.create(basePrima).times(tasaPrima));

      descuentoPension = Money.add(aporteFondo, Money.add(comisionAfp, primaAfp));
    }

    const aporteEssalud = Money.round(baseAfectaPension.times(tasaEssalud));

    // 6. Base afecta a Renta de 5ta Categoría en Liquidación (Remuneración + Vacaciones + Gratificación Trunca + Bonificación Extraordinaria)
    // Nota: La CTS Trunca se encuentra EXENTA de Impuesto a la Renta según Art. 56° del TUO del D.Leg. N° 650
    const conceptosGravados5taMonto = Money.add(
      baseAfectaPension,
      Money.add(gratifTruncaMonto, bonifExtraTruncaMonto)
    );

    // Retención estimada de 5ta sobre liquidación (si supera el tramo imponible mensualizado)
    const retencionQuinta = Money.create(0);

    const totalBrutoBeneficios = Money.add(
      remProporcionalMes,
      Money.add(vacacionesTruncasMonto, Money.add(gratifTruncaMonto, Money.add(bonifExtraTruncaMonto, ctsTruncaMonto)))
    );

    const totalDescuentos = Money.add(descuentoPension, retencionQuinta);
    const netoLiquidacion = Money.sub(totalBrutoBeneficios, totalDescuentos);

    const id = `lbs-${Date.now()}-${trab.id}`;

    return {
      id,
      empresaId,
      trabajadorId: trab.id,
      trabajadorNombre: `${trab.apellidos}, ${trab.nombres}`,
      trabajadorDocumento: trab.numeroDocumento,
      trabajadorCargo: trab.cargo,
      periodoCese,
      fechaIngreso: trab.fechaIngreso,
      fechaCese: input.fechaCese,
      motivoCese: input.motivoCese || 'RENUNCIA VOLUNTARIA',
      regimenLaboral: trab.regimenLaboral,
      remuneracionComputable: Money.toNumber(remComputable),
      diasTrabajadosMesCese,
      remuneracionProporcionalMes: Money.toNumber(remProporcionalMes),
      remuneracionMensualPendiente: Money.toNumber(remProporcionalMes),
      ctsTruncaMeses,
      ctsTruncaDias,
      ctsTruncaMonto: Money.toNumber(ctsTruncaMonto),
      vacacionesTruncasMeses: Math.floor(diasRecordVacacionalTrunco / 30),
      vacacionesTruncasDias: diasRecordVacacionalTrunco % 30,
      vacacionesTruncasMonto: Money.toNumber(vacacionesTruncasMonto),
      gratificacionTruncaMeses: gratifTruncaMeses,
      gratificacionTruncaMonto: Money.toNumber(gratifTruncaMonto),
      bonifExtraTruncaMonto: Money.toNumber(bonifExtraTruncaMonto),
      totalBrutoBeneficios: Money.toNumber(totalBrutoBeneficios),
      descuentoPension: Money.toNumber(descuentoPension),
      retencionQuinta: Money.toNumber(retencionQuinta),
      otrosDescuentos: 0,
      aporteEssalud: Money.toNumber(aporteEssalud),
      netoLiquidacion: Money.toNumber(netoLiquidacion),
      centroCosto: trab.centroCosto || 'ADMINISTRACION',
      estado: 'EMITIDA',
      createdAt: new Date().toISOString(),
      detallesLaborales: {
        diasVacacionesPendientes: input.diasVacacionesPendientes ?? Math.floor(diasRecordVacacionalTrunco / 30) * 30,
        mesesCts: ctsTruncaMeses,
        diasCts: ctsTruncaDias,
        mesesGratificacion: gratifTruncaMeses,
        conceptosAfectosAporte: ['Remuneración proporcional mes cese', 'Vacaciones truncas'],
        conceptosInafectosAporte: ['Gratificación trunca (Ley 30334)', 'Bonificación extraordinaria 9% (Ley 30334)', 'CTS trunca (D.Leg. 650)'],
        conceptosGravados5ta: ['Remuneración proporcional', 'Vacaciones truncas', 'Gratificación trunca', 'Bonificación extraordinaria 9%'],
        conceptosInafectos5ta: ['CTS trunca (Art. 56° D.Leg. 650)'],
        requiereValidacionLaboralista: true,
        observacionesLaborales: [
          'La CTS trunca debe depositarse o pagarse directamente dentro de las 48 horas del cese (Art. 3° D.S. 001-97-TR).',
          'Las vacaciones truncas requieren validar si existen convenios de reducción o descanso físico gozado no registrado.',
          'La regularización definitiva de Renta de 5ta categoría al cese debe considerar el Certificado de Retenciones (Formulario 1439 SUNAT).'
        ]
      }
    };
  }
};
