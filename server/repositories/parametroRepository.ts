import { db } from '../config/database';
import { auditoriaRepository } from './auditoriaRepository';
import { auditoriaChainService } from '../services/auditoriaChainService';

export interface ParametroTributario {
  id?: string;
  codigoParametro: string;
  descripcion: string;
  valorNumerico: number;
  vigenteDesde: string;
  vigenteHasta?: string | null;
  categoria: string;
  normaRespaldo?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface HistorialCambioParametro {
  id: string;
  codigoParametro: string;
  valorAnterior: number | null;
  valorNuevo: number;
  vigenteDesde: string;
  vigenteHasta?: string | null;
  usuarioId: string;
  rolUsuario: string;
  motivo: string;
  fechaCambio: string;
}

export interface CronogramaVencimiento {
  id?: string;
  periodo: string;
  ultimoDigitoRuc: string;
  fechaVencimientoPdt621: string;
  fechaVencimientoSire: string;
  fechaVencimientoPlame: string;
}

// Semilla en memoria autoritativa (Cero hardcoding en servicios, con norma oficial de respaldo)
export const PARAMETROS_IN_MEMORY: ParametroTributario[] = [
  { id: 'prm-igv-18', codigoParametro: 'TASA_IGV', descripcion: 'Tasa General del IGV (16%) + IPM (2%) = 18%', valorNumerico: 0.18, vigenteDesde: '2011-03-01', vigenteHasta: null, categoria: 'IGV', normaRespaldo: 'TUO Ley del IGV D.S. N° 055-99-EF Art. 17° y Ley N° 29666' },
  { id: 'prm-uit-2026', codigoParametro: 'VALOR_UIT_2026', descripcion: 'Valor oficial UIT 2026 (D.S. N° 301-2025-EF)', valorNumerico: 5500.00, vigenteDesde: '2026-01-01', vigenteHasta: '2026-12-31', categoria: 'UIT', normaRespaldo: 'Decreto Supremo N° 301-2025-EF (El Peruano, 17/12/2025)' },
  { id: 'prm-uit-2025', codigoParametro: 'VALOR_UIT_2025', descripcion: 'Valor oficial UIT 2025 (D.S. N° 260-2024-EF)', valorNumerico: 5350.00, vigenteDesde: '2025-01-01', vigenteHasta: '2025-12-31', categoria: 'UIT', normaRespaldo: 'Decreto Supremo N° 260-2024-EF' },
  { id: 'prm-uit-2024', codigoParametro: 'VALOR_UIT_2024', descripcion: 'Valor oficial UIT 2024 (D.S. N° 309-2023-EF)', valorNumerico: 5150.00, vigenteDesde: '2024-01-01', vigenteHasta: '2024-12-31', categoria: 'UIT', normaRespaldo: 'Decreto Supremo N° 309-2023-EF' },
  { id: 'prm-daot-uit', codigoParametro: 'UMBRAL_DAOT_UIT', descripcion: 'Umbral anual en UIT para Operaciones con Terceros DAOT (2 UIT)', valorNumerico: 2, vigenteDesde: '2002-01-01', vigenteHasta: null, categoria: 'UIT', normaRespaldo: 'R.S. N° 024-2002/SUNAT Art. 3° inc. b)' },
  { id: 'prm-rta-mype-sub300', codigoParametro: 'TASA_RENTA_MYPE_SUB300', descripcion: 'Pago a cuenta mensual MYPE Tributario hasta 300 UIT (1.0%)', valorNumerico: 0.01, vigenteDesde: '2017-01-01', vigenteHasta: null, categoria: 'RENTA', normaRespaldo: 'Decreto Legislativo N° 1269 Art. 6° num. 6.1' },
  { id: 'prm-rta-mype-tope300', codigoParametro: 'TOPE_RENTA_MYPE_MENSUAL_UIT', descripcion: 'Tope de ingresos netos anuales para tasa 1.0% MYPE Tributario (300 UIT)', valorNumerico: 300, vigenteDesde: '2017-01-01', vigenteHasta: null, categoria: 'RENTA', normaRespaldo: 'Decreto Legislativo N° 1269 Art. 6°' },
  { id: 'prm-rta-rg-min', codigoParametro: 'TASA_RENTA_RG_MIN', descripcion: 'Pago a cuenta mínimo mensual Régimen General / RMT > 300 UIT (1.5%)', valorNumerico: 0.015, vigenteDesde: '2015-01-01', vigenteHasta: null, categoria: 'RENTA', normaRespaldo: 'TUO Ley del Impuesto a la Renta D.S. N° 179-2004-EF Art. 85°' },
  { id: 'prm-rta-rer', codigoParametro: 'TASA_RENTA_RER', descripcion: 'Cuota mensual definitiva Régimen Especial de Renta RER (1.5%)', valorNumerico: 0.015, vigenteDesde: '2007-01-01', vigenteHasta: null, categoria: 'RENTA', normaRespaldo: 'TUO LIR D.S. N° 179-2004-EF Art. 120°' },
  { id: 'prm-rta-nrus-c1', codigoParametro: 'CUOTA_NRUS_CAT1', descripcion: 'Cuota mensual Nuevo RUS Categoría 1 (hasta S/ 5,000)', valorNumerico: 20.00, vigenteDesde: '2017-01-01', vigenteHasta: null, categoria: 'RENTA', normaRespaldo: 'Decreto Legislativo N° 937 y D.L. N° 1270 Art. 7°' },
  { id: 'prm-rta-nrus-c2', codigoParametro: 'CUOTA_NRUS_CAT2', descripcion: 'Cuota mensual Nuevo RUS Categoría 2 (hasta S/ 8,000)', valorNumerico: 50.00, vigenteDesde: '2017-01-01', vigenteHasta: null, categoria: 'RENTA', normaRespaldo: 'Decreto Legislativo N° 937 y D.L. N° 1270 Art. 7°' },
  { id: 'prm-rta-anual-mype-t1', codigoParametro: 'TASA_RENTA_ANUAL_MYPE_T1', descripcion: 'Tasa Anual Renta MYPE Tributario Tramo 1 hasta 15 UIT (10%)', valorNumerico: 0.10, vigenteDesde: '2017-01-01', vigenteHasta: null, categoria: 'RENTA', normaRespaldo: 'Decreto Legislativo N° 1269 Art. 5°' },
  { id: 'prm-rta-anual-mype-uit', codigoParametro: 'TRAMO_RENTA_ANUAL_MYPE_UIT', descripcion: 'Tope del primer tramo Renta Anual MYPE Tributario en UIT (15 UIT)', valorNumerico: 15, vigenteDesde: '2017-01-01', vigenteHasta: null, categoria: 'RENTA', normaRespaldo: 'Decreto Legislativo N° 1269 Art. 5°' },
  { id: 'prm-rta-anual-rg', codigoParametro: 'TASA_RENTA_ANUAL_GENERAL', descripcion: 'Tasa Anual Impuesto a la Renta Régimen General y exceso RMT (29.5%)', valorNumerico: 0.295, vigenteDesde: '2017-01-01', vigenteHasta: null, categoria: 'RENTA', normaRespaldo: 'TUO LIR D.S. N° 179-2004-EF Art. 55° y D.L. N° 1261' },
  { id: 'prm-rta-4ta', codigoParametro: 'TASA_RETENCION_4TA', descripcion: 'Tasa Retención 4ta Categoría Recibos por Honorarios (8%)', valorNumerico: 0.08, vigenteDesde: '2015-01-01', vigenteHasta: null, categoria: 'RENTA', normaRespaldo: 'TUO LIR D.S. N° 179-2004-EF Art. 74° y Ley N° 30296' },
  { id: 'prm-tope-4ta', codigoParametro: 'TOPE_RETENCION_4TA', descripcion: 'Monto a partir del cual aplica retención 4ta por recibo (S/ 1,500)', valorNumerico: 1500.00, vigenteDesde: '2007-01-01', vigenteHasta: null, categoria: 'RENTA', normaRespaldo: 'D.S. N° 215-2006-EF Art. 2°' },
  { id: 'prm-essalud', codigoParametro: 'TASA_ESSALUD', descripcion: 'Aporte Patronal EsSalud (9%)', valorNumerico: 0.09, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'LABORAL', normaRespaldo: 'Ley N° 26790 Art. 6° inc. a)' },
  { id: 'prm-bonif-ext-essalud', codigoParametro: 'TASA_BONIF_EXTRA_ESSALUD', descripcion: 'Bonificación Extraordinaria Gratificaciones Ley 30334 - EsSalud (9%)', valorNumerico: 0.09, vigenteDesde: '2015-05-01', vigenteHasta: null, categoria: 'LABORAL', normaRespaldo: 'Ley N° 29351 y Ley N° 30334 Art. 3°' },
  { id: 'prm-bonif-ext-eps', codigoParametro: 'TASA_BONIF_EXTRA_EPS', descripcion: 'Bonificación Extraordinaria Gratificaciones Ley 30334 - Afiliado EPS (6.75%)', valorNumerico: 0.0675, vigenteDesde: '2015-05-01', vigenteHasta: null, categoria: 'LABORAL', normaRespaldo: 'Ley N° 30334 y D.S. N° 012-2016-TR Art. 6°' },
  { id: 'prm-onp', codigoParametro: 'TASA_ONP', descripcion: 'Aporte Obligatorio Sistema Nacional de Pensiones ONP (13%)', valorNumerico: 0.13, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'LABORAL', normaRespaldo: 'D.L. N° 19990 y Ley N° 26504 Art. 2°' },
  { id: 'prm-rmv-2022', codigoParametro: 'RMV', descripcion: 'Remuneración Mínima Vital 2022-2024 (S/ 1,025.00)', valorNumerico: 1025.00, vigenteDesde: '2022-05-01', vigenteHasta: '2024-12-31', categoria: 'LABORAL', normaRespaldo: 'Decreto Supremo N° 003-2022-TR (Vigencia: 01/05/2022 al 31/12/2024)' },
  { id: 'prm-rmv-2025', codigoParametro: 'RMV', descripcion: 'Remuneración Mínima Vital 2025-2026 (S/ 1,130.00)', valorNumerico: 1130.00, vigenteDesde: '2025-01-01', vigenteHasta: '2026-09-30', categoria: 'LABORAL', normaRespaldo: 'Decreto Supremo N° 006-2024-TR (Vigencia: 01/01/2025 al 30/09/2026)' },
  { id: 'prm-rmv-2026-t1', codigoParametro: 'RMV', descripcion: 'Remuneración Mínima Vital Tramo 1 (S/ 1,230.00)', valorNumerico: 1230.00, vigenteDesde: '2026-10-01', vigenteHasta: '2026-12-31', categoria: 'LABORAL', normaRespaldo: 'Decreto Supremo N° 015-2026-TR (Publicado 28/09/2026 - Primer tramo S/ 1,230.00)' },
  { id: 'prm-rmv-2027-t2', codigoParametro: 'RMV', descripcion: 'Remuneración Mínima Vital Tramo 2 (S/ 1,300.00)', valorNumerico: 1300.00, vigenteDesde: '2027-01-01', vigenteHasta: null, categoria: 'LABORAL', normaRespaldo: 'Decreto Supremo N° 015-2026-TR (Segundo tramo S/ 1,300.00 - SUPUESTO A VALIDAR fecha exacta)' },
  { id: 'prm-uit', codigoParametro: 'UIT', descripcion: 'Valor oficial UIT 2026 (S/ 5,500.00)', valorNumerico: 5500.00, vigenteDesde: '2026-01-01', vigenteHasta: null, categoria: 'UIT', normaRespaldo: 'Decreto Supremo N° 301-2025-EF (El Peruano, 17/12/2025)' },
  { id: 'prm-asig-fam-alias', codigoParametro: 'ASIGNACION_FAMILIAR', descripcion: 'Tasa Asignación Familiar única por trabajador con derecho (10% de RMV)', valorNumerico: 0.10, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'LABORAL', normaRespaldo: 'Ley N° 25129 Art. 1° y D.S. N° 035-90-TR Art. 4°' },
  { id: 'prm-asig-fam', codigoParametro: 'TASA_ASIGNACION_FAMILIAR', descripcion: 'Tasa Asignación Familiar única por trabajador con derecho (10% de RMV)', valorNumerico: 0.10, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'LABORAL', normaRespaldo: 'Ley N° 25129 Art. 1° y D.S. N° 035-90-TR Art. 4°' },
  { id: 'prm-he-25', codigoParametro: 'TASA_HORA_EXTRA_25', descripcion: 'Sobretasa Horas Extras 2 primeras horas (25%)', valorNumerico: 0.25, vigenteDesde: '2002-01-01', vigenteHasta: null, categoria: 'LABORAL', normaRespaldo: 'TUO D.Leg. N° 854 (D.S. N° 007-2002-TR) Art. 10°' },
  { id: 'prm-he-35', codigoParametro: 'TASA_HORA_EXTRA_35', descripcion: 'Sobretasa Horas Extras a partir de 3ra hora (35%)', valorNumerico: 0.35, vigenteDesde: '2002-01-01', vigenteHasta: null, categoria: 'LABORAL', normaRespaldo: 'TUO D.Leg. N° 854 (D.S. N° 007-2002-TR) Art. 10°' },
  { id: 'prm-ded-5ta-uit', codigoParametro: 'DEDUCCION_5TA_UIT', descripcion: 'Deducción anual fija Renta de 5ta Categoría en UIT (7 UIT)', valorNumerico: 7, vigenteDesde: '2000-01-01', vigenteHasta: null, categoria: 'RENTA', normaRespaldo: 'TUO LIR D.S. N° 179-2004-EF Art. 46° primer párrafo' },
  { id: 'prm-ded-5ta-ad-uit', codigoParametro: 'TOPE_DEDUCCION_ADICIONAL_5TA_UIT', descripcion: 'Tope Deducción Adicional por Gastos 4ta/5ta Categoría (3 UIT)', valorNumerico: 3, vigenteDesde: '2017-01-01', vigenteHasta: null, categoria: 'RENTA', normaRespaldo: 'TUO LIR D.S. N° 179-2004-EF Art. 46° segundo párrafo (D.L. N° 1258)' },
  { id: 'prm-5ta-t1', codigoParametro: 'TASA_5TA_TRAMO_1', descripcion: 'Tasa Renta 5ta Categoría Tramo 1: Hasta 5 UIT (8%)', valorNumerico: 0.08, vigenteDesde: '2015-01-01', vigenteHasta: null, categoria: 'RENTA', normaRespaldo: 'TUO LIR D.S. N° 179-2004-EF Art. 53° (Ley N° 30296)' },
  { id: 'prm-5ta-t2', codigoParametro: 'TASA_5TA_TRAMO_2', descripcion: 'Tasa Renta 5ta Categoría Tramo 2: Más de 5 hasta 20 UIT (14%)', valorNumerico: 0.14, vigenteDesde: '2015-01-01', vigenteHasta: null, categoria: 'RENTA', normaRespaldo: 'TUO LIR D.S. N° 179-2004-EF Art. 53° (Ley N° 30296)' },
  { id: 'prm-5ta-t3', codigoParametro: 'TASA_5TA_TRAMO_3', descripcion: 'Tasa Renta 5ta Categoría Tramo 3: Más de 20 hasta 35 UIT (17%)', valorNumerico: 0.17, vigenteDesde: '2015-01-01', vigenteHasta: null, categoria: 'RENTA', normaRespaldo: 'TUO LIR D.S. N° 179-2004-EF Art. 53° (Ley N° 30296)' },
  { id: 'prm-5ta-t4', codigoParametro: 'TASA_5TA_TRAMO_4', descripcion: 'Tasa Renta 5ta Categoría Tramo 4: Más de 35 hasta 45 UIT (20%)', valorNumerico: 0.20, vigenteDesde: '2015-01-01', vigenteHasta: null, categoria: 'RENTA', normaRespaldo: 'TUO LIR D.S. N° 179-2004-EF Art. 53° (Ley N° 30296)' },
  { id: 'prm-5ta-t5', codigoParametro: 'TASA_5TA_TRAMO_5', descripcion: 'Tasa Renta 5ta Categoría Tramo 5: Más de 45 UIT (30%)', valorNumerico: 0.30, vigenteDesde: '2015-01-01', vigenteHasta: null, categoria: 'RENTA', normaRespaldo: 'TUO LIR D.S. N° 179-2004-EF Art. 53° (Ley N° 30296)' },

  // Parámetros AFP Comisión Flujo, Mixta y Seguros (Vigentes - SUPUESTO A VALIDAR trimestralmente en portal SBS)
  { id: 'prm-afp-ap-gen', codigoParametro: 'AFP_APORTE_OBLIGATORIO', descripcion: 'AFP Aporte Obligatorio al Fondo (10%)', valorNumerico: 0.10, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'TUO Ley del SPP D.S. N° 054-97-EF Art. 30° inc. a)' },
  { id: 'prm-afp-ps-gen', codigoParametro: 'AFP_PRIMA_SEGURO', descripcion: 'AFP Prima de Seguro Invalidez y Sobrevivencia (1.84% semilla editable)', valorNumerico: 0.0184, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'TUO SPP D.S. N° 054-97-EF Art. 30° / Licitación SISCO SBS (SUPUESTO A VALIDAR según SISCO vigente)' },
  // Tope Remuneración Máxima Asegurable (RMA) para cálculo de prima de seguro AFP - Serie Trimestral SBS (Art. 117° Compendio SPP)
  { id: 'prm-afp-tope-seg-2024-q1', codigoParametro: 'TOPE_PRIMA_SEGURO_AFP', descripcion: 'Tope RMA Prima Seguro AFP SBS Trimestre Ene-Mar 2024 (S/ 12,135.22)', valorNumerico: 12135.22, vigenteDesde: '2024-01-01', vigenteHasta: '2024-03-31', categoria: 'AFP', normaRespaldo: 'Circular SBS N° AFP-178-2023 (El Peruano, Dic 2023)' },
  { id: 'prm-afp-tope-seg-2024-q2', codigoParametro: 'TOPE_PRIMA_SEGURO_AFP', descripcion: 'Tope RMA Prima Seguro AFP SBS Trimestre Abr-Jun 2024 (S/ 12,324.96)', valorNumerico: 12324.96, vigenteDesde: '2024-04-01', vigenteHasta: '2024-06-30', categoria: 'AFP', normaRespaldo: 'Circular SBS N° AFP-179-2024 (El Peruano, Mar 2024)' },
  { id: 'prm-afp-tope-seg-2024-q3', codigoParametro: 'TOPE_PRIMA_SEGURO_AFP', descripcion: 'Tope RMA Prima Seguro AFP SBS Trimestre Jul-Set 2024 (S/ 12,410.00)', valorNumerico: 12410.00, vigenteDesde: '2024-07-01', vigenteHasta: '2024-09-30', categoria: 'AFP', normaRespaldo: 'Circular SBS N° AFP-180-2024 (El Peruano, Jun 2024)' },
  { id: 'prm-afp-tope-seg-2024-q4', codigoParametro: 'TOPE_PRIMA_SEGURO_AFP', descripcion: 'Tope RMA Prima Seguro AFP SBS Trimestre Oct-Dic 2024 (S/ 12,410.00)', valorNumerico: 12410.00, vigenteDesde: '2024-10-01', vigenteHasta: '2024-12-31', categoria: 'AFP', normaRespaldo: 'Circular SBS N° AFP-181-2024 (El Peruano, Set 2024)' },
  { id: 'prm-afp-tope-seg-2025-q1', codigoParametro: 'TOPE_PRIMA_SEGURO_AFP', descripcion: 'Tope RMA Prima Seguro AFP SBS Trimestre Ene-Mar 2025 (S/ 12,410.00)', valorNumerico: 12410.00, vigenteDesde: '2025-01-01', vigenteHasta: '2025-03-31', categoria: 'AFP', normaRespaldo: 'Circular SBS N° AFP-181-2024 proyectada (SUPUESTO A VALIDAR según publicación trimestral SBS)' },
  { id: 'prm-afp-tope-seg-2025-q2', codigoParametro: 'TOPE_PRIMA_SEGURO_AFP', descripcion: 'Tope RMA Prima Seguro AFP SBS Trimestre Abr-Jun 2025 (S/ 12,410.00)', valorNumerico: 12410.00, vigenteDesde: '2025-04-01', vigenteHasta: '2025-06-30', categoria: 'AFP', normaRespaldo: 'Circular SBS trimestral no publicada (SUPUESTO A VALIDAR)' },
  { id: 'prm-afp-tope-seg-2025-q3', codigoParametro: 'TOPE_PRIMA_SEGURO_AFP', descripcion: 'Tope RMA Prima Seguro AFP SBS Trimestre Jul-Set 2025 (S/ 12,410.00)', valorNumerico: 12410.00, vigenteDesde: '2025-07-01', vigenteHasta: '2025-09-30', categoria: 'AFP', normaRespaldo: 'Circular SBS trimestral no publicada (SUPUESTO A VALIDAR)' },
  { id: 'prm-afp-tope-seg-2025-q4', codigoParametro: 'TOPE_PRIMA_SEGURO_AFP', descripcion: 'Tope RMA Prima Seguro AFP SBS Trimestre Oct-Dic 2025 (S/ 12,410.00)', valorNumerico: 12410.00, vigenteDesde: '2025-10-01', vigenteHasta: '2025-12-31', categoria: 'AFP', normaRespaldo: 'Circular SBS trimestral no publicada (SUPUESTO A VALIDAR)' },
  { id: 'prm-afp-tope-seg-2026-q1', codigoParametro: 'TOPE_PRIMA_SEGURO_AFP', descripcion: 'Tope RMA Prima Seguro AFP SBS Trimestre Ene-Mar 2026 (S/ 12,410.00)', valorNumerico: 12410.00, vigenteDesde: '2026-01-01', vigenteHasta: '2026-03-31', categoria: 'AFP', normaRespaldo: 'Circular SBS trimestral no publicada (SUPUESTO A VALIDAR)' },
  { id: 'prm-afp-tope-seg-2026-q2', codigoParametro: 'TOPE_PRIMA_SEGURO_AFP', descripcion: 'Tope RMA Prima Seguro AFP SBS Trimestre Abr-Jun 2026 (S/ 12,410.00)', valorNumerico: 12410.00, vigenteDesde: '2026-04-01', vigenteHasta: '2026-06-30', categoria: 'AFP', normaRespaldo: 'Circular SBS trimestral no publicada (SUPUESTO A VALIDAR)' },
  { id: 'prm-afp-tope-seg-2026-q3', codigoParametro: 'TOPE_PRIMA_SEGURO_AFP', descripcion: 'Tope RMA Prima Seguro AFP SBS Trimestre Jul-Set 2026 (S/ 12,410.00)', valorNumerico: 12410.00, vigenteDesde: '2026-07-01', vigenteHasta: '2026-09-30', categoria: 'AFP', normaRespaldo: 'Circular SBS trimestral no publicada (SUPUESTO A VALIDAR)' },
  { id: 'prm-afp-tope-seg-2026-q4', codigoParametro: 'TOPE_PRIMA_SEGURO_AFP', descripcion: 'Tope RMA Prima Seguro AFP SBS Trimestre Oct-Dic 2026 (S/ 12,410.00)', valorNumerico: 12410.00, vigenteDesde: '2026-10-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Circular SBS trimestral no publicada (SUPUESTO A VALIDAR)' },
  { id: 'prm-afp-int-ap', codigoParametro: 'AFP_INTEGRA_APORTE', descripcion: 'AFP Integra - Fondo Obligatorio', valorNumerico: 0.10, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'TUO Ley del SPP D.S. N° 054-97-EF Art. 30° inc. a)' },
  { id: 'prm-afp-int-cf', codigoParametro: 'AFP_INTEGRA_COMISION_FLUJO', descripcion: 'AFP Integra - Comisión sobre flujo', valorNumerico: 0.0155, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Boletín de Comisiones y Primas SPP - Portal SBS (SUPUESTO A VALIDAR)' },
  { id: 'prm-afp-int-cm', codigoParametro: 'AFP_INTEGRA_COMISION_MIXTA', descripcion: 'AFP Integra - Comisión mixta sobre flujo', valorNumerico: 0.0015, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Boletín de Comisiones y Primas SPP - Portal SBS (SUPUESTO A VALIDAR)' },
  { id: 'prm-afp-int-ps', codigoParametro: 'AFP_INTEGRA_PRIMA_SEGURO', descripcion: 'AFP Integra - Prima de seguro', valorNumerico: 0.0184, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Licitación SISCO SBS - Portal SBS (SUPUESTO A VALIDAR)' },

  { id: 'prm-afp-pri-ap', codigoParametro: 'AFP_PRIMA_APORTE', descripcion: 'AFP Prima - Fondo Obligatorio', valorNumerico: 0.10, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'TUO Ley del SPP D.S. N° 054-97-EF Art. 30° inc. a)' },
  { id: 'prm-afp-pri-cf', codigoParametro: 'AFP_PRIMA_COMISION_FLUJO', descripcion: 'AFP Prima - Comisión sobre flujo', valorNumerico: 0.0160, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Boletín de Comisiones y Primas SPP - Portal SBS (SUPUESTO A VALIDAR)' },
  { id: 'prm-afp-pri-cm', codigoParametro: 'AFP_PRIMA_COMISION_MIXTA', descripcion: 'AFP Prima - Comisión mixta sobre flujo', valorNumerico: 0.0018, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Boletín de Comisiones y Primas SPP - Portal SBS (SUPUESTO A VALIDAR)' },
  { id: 'prm-afp-pri-ps', codigoParametro: 'AFP_PRIMA_PRIMA_SEGURO', descripcion: 'AFP Prima - Prima de seguro', valorNumerico: 0.0184, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Licitación SISCO SBS - Portal SBS (SUPUESTO A VALIDAR)' },

  { id: 'prm-afp-pro-ap', codigoParametro: 'AFP_PROFUTURO_APORTE', descripcion: 'AFP Profuturo - Fondo Obligatorio', valorNumerico: 0.10, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'TUO Ley del SPP D.S. N° 054-97-EF Art. 30° inc. a)' },
  { id: 'prm-afp-pro-cf', codigoParametro: 'AFP_PROFUTURO_COMISION_FLUJO', descripcion: 'AFP Profuturo - Comisión sobre flujo', valorNumerico: 0.0169, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Boletín de Comisiones y Primas SPP - Portal SBS (SUPUESTO A VALIDAR)' },
  { id: 'prm-afp-pro-cm', codigoParametro: 'AFP_PROFUTURO_COMISION_MIXTA', descripcion: 'AFP Profuturo - Comisión mixta sobre flujo', valorNumerico: 0.0020, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Boletín de Comisiones y Primas SPP - Portal SBS (SUPUESTO A VALIDAR)' },
  { id: 'prm-afp-pro-ps', codigoParametro: 'AFP_PROFUTURO_PRIMA_SEGURO', descripcion: 'AFP Profuturo - Prima de seguro', valorNumerico: 0.0184, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Licitación SISCO SBS - Portal SBS (SUPUESTO A VALIDAR)' },

  { id: 'prm-afp-hab-ap', codigoParametro: 'AFP_HABITAT_APORTE', descripcion: 'AFP Habitat - Fondo Obligatorio', valorNumerico: 0.10, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'TUO Ley del SPP D.S. N° 054-97-EF Art. 30° inc. a)' },
  { id: 'prm-afp-hab-cf', codigoParametro: 'AFP_HABITAT_COMISION_FLUJO', descripcion: 'AFP Habitat - Comisión sobre flujo', valorNumerico: 0.0147, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Boletín de Comisiones y Primas SPP - Portal SBS (SUPUESTO A VALIDAR)' },
  { id: 'prm-afp-hab-cm', codigoParametro: 'AFP_HABITAT_COMISION_MIXTA', descripcion: 'AFP Habitat - Comisión mixta sobre flujo', valorNumerico: 0.0023, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Boletín de Comisiones y Primas SPP - Portal SBS (SUPUESTO A VALIDAR)' },
  { id: 'prm-afp-hab-ps', codigoParametro: 'AFP_HABITAT_PRIMA_SEGURO', descripcion: 'AFP Habitat - Prima de seguro', valorNumerico: 0.0184, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Licitación SISCO SBS - Portal SBS (SUPUESTO A VALIDAR)' },
];

export const HISTORIAL_PARAMETROS_MEMORIA: HistorialCambioParametro[] = [
  {
    id: 'hist-prm-001',
    codigoParametro: 'VALOR_UIT_2026',
    valorAnterior: 5350.00,
    valorNuevo: 5500.00,
    vigenteDesde: '2026-01-01',
    vigenteHasta: '2026-12-31',
    usuarioId: 'usr-admin-01',
    rolUsuario: 'ADMIN_ESTUDIO',
    motivo: 'Actualización oficial UIT 2026 según D.S. N° 301-2025-EF',
    fechaCambio: '2026-01-01T00:00:00.000Z'
  }
];

const CRONOGRAMA_IN_MEMORY: CronogramaVencimiento[] = [
  { periodo: '2026-09', ultimoDigitoRuc: '0', fechaVencimientoPdt621: '2026-10-15', fechaVencimientoSire: '2026-10-14', fechaVencimientoPlame: '2026-10-15' },
  { periodo: '2026-09', ultimoDigitoRuc: '1', fechaVencimientoPdt621: '2026-10-16', fechaVencimientoSire: '2026-10-15', fechaVencimientoPlame: '2026-10-16' },
  { periodo: '2026-09', ultimoDigitoRuc: '2', fechaVencimientoPdt621: '2026-10-19', fechaVencimientoSire: '2026-10-16', fechaVencimientoPlame: '2026-10-19' },
  { periodo: '2026-09', ultimoDigitoRuc: '3', fechaVencimientoPdt621: '2026-10-20', fechaVencimientoSire: '2026-10-19', fechaVencimientoPlame: '2026-10-20' },
  { periodo: '2026-09', ultimoDigitoRuc: '4', fechaVencimientoPdt621: '2026-10-21', fechaVencimientoSire: '2026-10-20', fechaVencimientoPlame: '2026-10-21' },
  { periodo: '2026-09', ultimoDigitoRuc: '5', fechaVencimientoPdt621: '2026-10-22', fechaVencimientoSire: '2026-10-21', fechaVencimientoPlame: '2026-10-22' },
  { periodo: '2026-09', ultimoDigitoRuc: '6', fechaVencimientoPdt621: '2026-10-23', fechaVencimientoSire: '2026-10-22', fechaVencimientoPlame: '2026-10-23' },
  { periodo: '2026-09', ultimoDigitoRuc: '7', fechaVencimientoPdt621: '2026-10-26', fechaVencimientoSire: '2026-10-23', fechaVencimientoPlame: '2026-10-26' },
  { periodo: '2026-09', ultimoDigitoRuc: '8', fechaVencimientoPdt621: '2026-10-27', fechaVencimientoSire: '2026-10-26', fechaVencimientoPlame: '2026-10-27' },
  { periodo: '2026-09', ultimoDigitoRuc: '9', fechaVencimientoPdt621: '2026-10-28', fechaVencimientoSire: '2026-10-27', fechaVencimientoPlame: '2026-10-28' },
  { periodo: '2026-09', ultimoDigitoRuc: 'B', fechaVencimientoPdt621: '2026-10-29', fechaVencimientoSire: '2026-10-28', fechaVencimientoPlame: '2026-10-29' },
];

function esRolAdministradorEstudio(rol?: string): boolean {
  const r = (rol || '').toUpperCase();
  return r === 'ADMIN_ESTUDIO' || r === 'ADMINISTRADOR' || r === 'ADMIN';
}

export const parametroRepository = {
  async obtenerParametros(): Promise<ParametroTributario[]> {
    if (db.isPostgresConnected()) {
      const res = await db.query(`
        SELECT id, codigo_parametro as "codigoParametro", descripcion, valor_numerico as "valorNumerico",
               vigente_desde as "vigenteDesde", vigente_hasta as "vigenteHasta", categoria
        FROM parametros_tributarios
        ORDER BY categoria, codigo_parametro
      `);
      if (res.rows.length > 0) {
        return res.rows.map((r: any) => ({
          ...r,
          valorNumerico: Number(r.valorNumerico)
        }));
      }
    }
    return [...PARAMETROS_IN_MEMORY];
  },

  async obtenerParametroPorCodigo(codigo: string, fechaReferencia = new Date().toISOString().split('T')[0]): Promise<ParametroTributario | null> {
    if (db.isPostgresConnected()) {
      const res = await db.query(`
        SELECT id, codigo_parametro as "codigoParametro", descripcion, valor_numerico as "valorNumerico",
               vigente_desde as "vigenteDesde", vigente_hasta as "vigenteHasta", categoria
        FROM parametros_tributarios
        WHERE codigo_parametro = $1 AND vigente_desde <= $2 AND (vigente_hasta IS NULL OR vigente_hasta >= $2)
        ORDER BY vigente_desde DESC
        LIMIT 1
      `, [codigo, fechaReferencia]);
      if (res.rows.length > 0) {
        return {
          ...res.rows[0],
          valorNumerico: Number(res.rows[0].valorNumerico)
        };
      }
    }
    const candidatos = PARAMETROS_IN_MEMORY
      .filter(p => p.codigoParametro === codigo)
      .sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde));
    if (candidatos.length === 0) return null;
    const vigente = candidatos.find(
      p => p.vigenteDesde <= fechaReferencia && (!p.vigenteHasta || p.vigenteHasta >= fechaReferencia)
    );
    return vigente || candidatos[0];
  },

  async obtenerValorNumerico(codigo: string, fallback: number, fechaReferencia?: string): Promise<number> {
    const param = await this.obtenerParametroPorCodigo(codigo, fechaReferencia);
    return param ? Number(param.valorNumerico) : fallback;
  },

  async obtenerUitPorAnio(anio: number): Promise<number> {
    const codigoAnio = `VALOR_UIT_${anio}`;
    const especifico = await this.obtenerParametroPorCodigo(codigoAnio, `${anio}-06-01`);
    if (especifico) return Number(especifico.valorNumerico);
    const actual = await this.obtenerParametroPorCodigo('VALOR_UIT_2026', `${anio}-06-01`);
    return actual ? Number(actual.valorNumerico) : 5500.00;
  },

  async obtenerRmvPorPeriodo(periodo: string): Promise<number> {
    const param = await this.obtenerParametroPorCodigo('RMV', `${periodo}-15`);
    return param ? Number(param.valorNumerico) : 1130.00;
  },

  async obtenerValidacionParametrosPlanilla(periodo: string): Promise<{
    rmv: number;
    topeRmaSeguro: number;
    advertencias: string[];
  }> {
    const advertencias: string[] = [];
    const fechaRef = `${periodo}-15`;
    const paramRmv = await this.obtenerParametroPorCodigo('RMV', fechaRef);
    const rmv = paramRmv ? paramRmv.valorNumerico : 1130.00;
    if (rmv >= 1300) {
      advertencias.push(
        'ADVERTENCIA: La RMV de S/ 1,300.00 corresponde al segundo tramo del D.S. N° 015-2026-TR [SUPUESTO A VALIDAR: fecha exacta de entrada en vigencia sujeta a ratificación en El Peruano].'
      );
    }

    const paramTope = await this.obtenerParametroPorCodigo('TOPE_PRIMA_SEGURO_AFP', fechaRef);
    const topeRmaSeguro = paramTope ? paramTope.valorNumerico : 12410.00;
    if (paramTope && paramTope.normaRespaldo && paramTope.normaRespaldo.includes('SUPUESTO A VALIDAR')) {
      advertencias.push(
        `ADVERTENCIA PREVISIONAL: El tope de prima seguro AFP (S/ ${topeRmaSeguro.toFixed(2)}) para el período ${periodo} no cuenta con Circular SBS definitiva publicada. Se utilizó el valor proyectado (Circular SBS N° AFP-181-2024) [SUPUESTO A VALIDAR: requiere verificación trimestral en portal SBS].`
      );
    }

    return { rmv, topeRmaSeguro, advertencias };
  },

  async guardarOActualizarParametro(
    input: {
      codigoParametro: string;
      descripcion: string;
      valorNumerico: number;
      tipoDato?: string;
      vigenteDesde: string;
      vigenteHasta?: string | null;
      categoria?: string;
      motivo?: string;
    },
    usuarioId: string,
    rolUsuario: string = 'ADMIN_ESTUDIO',
    empresaContextoId: string = '00000000-0000-0000-0000-000000000001'
  ): Promise<ParametroTributario> {
    if (!esRolAdministradorEstudio(rolUsuario)) {
      throw new Error('PERMISO_DENEGADO: Solo ADMIN_ESTUDIO o ADMINISTRADOR puede modificar la tabla parametros_tributarios.');
    }

    const codigo = input.codigoParametro.trim().toUpperCase();
    const existenteExactoIdx = PARAMETROS_IN_MEMORY.findIndex(
      p => p.codigoParametro === codigo && p.vigenteDesde === input.vigenteDesde
    );
    const existenteCodigoIdx = PARAMETROS_IN_MEMORY.findIndex(p => p.codigoParametro === codigo);
    const valorAnterior = existenteExactoIdx >= 0
      ? PARAMETROS_IN_MEMORY[existenteExactoIdx].valorNumerico
      : (existenteCodigoIdx >= 0 ? PARAMETROS_IN_MEMORY[existenteCodigoIdx].valorNumerico : null);
    const ahora = new Date().toISOString();

    const nuevoParametro: ParametroTributario = {
      id: existenteExactoIdx >= 0 ? PARAMETROS_IN_MEMORY[existenteExactoIdx].id : `prm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      codigoParametro: codigo,
      descripcion: input.descripcion.trim(),
      valorNumerico: Number(input.valorNumerico),
      vigenteDesde: input.vigenteDesde,
      vigenteHasta: input.vigenteHasta || null,
      categoria: input.categoria || 'RENTA',
      updatedAt: ahora,
      updatedBy: usuarioId
    };

    if (existenteExactoIdx >= 0) {
      PARAMETROS_IN_MEMORY[existenteExactoIdx] = nuevoParametro;
    } else {
      PARAMETROS_IN_MEMORY.push(nuevoParametro);
    }

    if (db.isPostgresConnected()) {
      try {
        await db.query(`
          INSERT INTO parametros_tributarios (codigo_parametro, descripcion, valor_numerico, vigente_desde, vigente_hasta, categoria)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (codigo_parametro, vigente_desde)
          DO UPDATE SET descripcion = EXCLUDED.descripcion,
                        valor_numerico = EXCLUDED.valor_numerico,
                        vigente_hasta = EXCLUDED.vigente_hasta,
                        categoria = EXCLUDED.categoria
        `, [
          nuevoParametro.codigoParametro,
          nuevoParametro.descripcion,
          nuevoParametro.valorNumerico,
          nuevoParametro.vigenteDesde,
          nuevoParametro.vigenteHasta,
          nuevoParametro.categoria
        ]);
      } catch {
        // Fallback silencioso en modo memoria
      }
    }

    const cambio: HistorialCambioParametro = {
      id: `hist-prm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      codigoParametro: codigo,
      valorAnterior,
      valorNuevo: nuevoParametro.valorNumerico,
      vigenteDesde: nuevoParametro.vigenteDesde,
      vigenteHasta: nuevoParametro.vigenteHasta,
      usuarioId,
      rolUsuario,
      motivo: input.motivo || 'Actualización administrativa de parámetro tributario',
      fechaCambio: ahora
    };
    HISTORIAL_PARAMETROS_MEMORIA.unshift(cambio);

    await auditoriaChainService.registrar({
      empresaId: empresaContextoId,
      usuarioId,
      accion: valorAnterior === null ? 'CREAR_PARAMETRO_TRIBUTARIO' : 'ACTUALIZAR_PARAMETRO_TRIBUTARIO',
      tablaAfectada: 'parametros_tributarios',
      registroId: codigo,
      datosAnteriores: valorAnterior !== null ? { valorNumerico: valorAnterior } : undefined,
      datosNuevos: {
        codigoParametro: codigo,
        valorNumerico: nuevoParametro.valorNumerico,
        vigenteDesde: nuevoParametro.vigenteDesde,
        vigenteHasta: nuevoParametro.vigenteHasta,
        motivo: cambio.motivo
      }
    });

    await auditoriaRepository.registrar({
      empresaId: empresaContextoId,
      usuarioId,
      tablaAfectada: 'parametros_tributarios',
      registroId: codigo,
      accion: valorAnterior === null ? 'INSERT' : 'UPDATE',
      datosAnteriores: valorAnterior !== null ? { valorNumerico: valorAnterior } : undefined,
      datosNuevos: { ...nuevoParametro, motivo: cambio.motivo }
    });

    return nuevoParametro;
  },

  obtenerHistorialCambios(): HistorialCambioParametro[] {
    return [...HISTORIAL_PARAMETROS_MEMORIA];
  },

  async obtenerCronograma(periodo: string, ultimoDigitoRuc: string): Promise<CronogramaVencimiento | null> {
    if (db.isPostgresConnected()) {
      const res = await db.query(`
        SELECT periodo, ultimo_digito_ruc as "ultimoDigitoRuc",
               fecha_vencimiento_pdt621 as "fechaVencimientoPdt621",
               fecha_vencimiento_sire as "fechaVencimientoSire",
               fecha_vencimiento_plame as "fechaVencimientoPlame"
        FROM cronograma_vencimientos
        WHERE periodo = $1 AND ultimo_digito_ruc = $2
        LIMIT 1
      `, [periodo, ultimoDigitoRuc]);
      if (res.rows.length > 0) return res.rows[0];
    }
    return CRONOGRAMA_IN_MEMORY.find(c => c.periodo === periodo && c.ultimoDigitoRuc === ultimoDigitoRuc) || null;
  }
};
