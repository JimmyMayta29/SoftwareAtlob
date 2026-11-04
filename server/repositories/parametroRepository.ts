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
  { id: 'prm-rmv-2026-t1', codigoParametro: 'RMV', descripcion: 'Remuneración Mínima Vital Tramo 1 (S/ 1,230.00)', valorNumerico: 1230.00, vigenteDesde: '2026-10-01', vigenteHasta: null, categoria: 'LABORAL', normaRespaldo: 'Decreto Supremo N° 015-2026-TR (Diario Oficial El Peruano, 28/09/2026 - Primer tramo S/ 1,230.00)' },
  { id: 'prm-rmv-2026-t2-pend', codigoParametro: 'RMV_SEGUNDO_TRAMO_PENDIENTE', descripcion: 'Segundo tramo RMV (+S/ 70 a S/ 1,300) - PENDIENTE DE DECRETO SUPREMO (sin vigencia)', valorNumerico: 1300.00, vigenteDesde: '9999-12-31', vigenteHasta: null, categoria: 'LABORAL', normaRespaldo: 'Decreto Supremo N° 015-2026-TR Disposición Complementaria (Fecha sujeta a expedición de próximo decreto supremo)' },
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

  // Parámetros AFP Comisión Flujo, Mixta y Seguros (Portal SBS https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx)
  { id: 'prm-afp-ap-gen', codigoParametro: 'AFP_APORTE_OBLIGATORIO', descripcion: 'AFP Aporte Obligatorio al Fondo (10%)', valorNumerico: 0.10, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'TUO Ley del SPP D.S. N° 054-97-EF Art. 30° inc. a)' },
  { id: 'prm-afp-ps-gen', codigoParametro: 'AFP_PRIMA_SEGURO', descripcion: 'AFP Prima de Seguro de Invalidez, Sobrevivencia y Gastos de Sepelio (1.37%)', valorNumerico: 0.0137, vigenteDesde: '2026-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Licitación SISCO SBS — Portal SBS Comisiones y Primas SPP (https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx)' },

  // Remuneración Máxima Asegurable (RMA) Oficial SBS 2026 - Topes Trimestrales (Art. 117° Compendio SPP)
  // Nota: Montos confirmados en portal SBS; numeración exacta de cada circular trimestral marcada como pendiente de validar.
  { id: 'prm-afp-tope-seg-2026-q1', codigoParametro: 'TOPE_PRIMA_SEGURO_AFP', descripcion: 'Tope RMA Prima Seguro AFP SBS Trimestre Ene-Mar 2026 (S/ 12,209.11)', valorNumerico: 12209.11, vigenteDesde: '2026-01-01', vigenteHasta: '2026-03-31', categoria: 'AFP', normaRespaldo: 'Circular SBS RMA Ene-Mar 2026 — N° exacto pendiente de validar (Portal SBS https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx)' },
  { id: 'prm-afp-tope-seg-2026-q2', codigoParametro: 'TOPE_PRIMA_SEGURO_AFP', descripcion: 'Tope RMA Prima Seguro AFP SBS Trimestre Abr-Jun 2026 (S/ 12,598.91)', valorNumerico: 12598.91, vigenteDesde: '2026-04-01', vigenteHasta: '2026-06-30', categoria: 'AFP', normaRespaldo: 'Circular SBS RMA Abr-Jun 2026 — N° exacto pendiente de validar (Portal SBS https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx)' },
  { id: 'prm-afp-tope-seg-2026-q3', codigoParametro: 'TOPE_PRIMA_SEGURO_AFP', descripcion: 'Tope RMA Prima Seguro AFP SBS Trimestre Jul-Set 2026 (S/ 12,672.65)', valorNumerico: 12672.65, vigenteDesde: '2026-07-01', vigenteHasta: '2026-09-30', categoria: 'AFP', normaRespaldo: 'Circular SBS RMA Jul-Set 2026 — N° exacto pendiente de validar (Portal SBS https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx)' },
  { id: 'prm-afp-tope-seg-2026-q4', codigoParametro: 'TOPE_PRIMA_SEGURO_AFP', descripcion: 'Tope RMA Prima Seguro AFP SBS Trimestre Oct-Dic 2026 (S/ 12,732.70)', valorNumerico: 12732.70, vigenteDesde: '2026-10-01', vigenteHasta: '2026-12-31', categoria: 'AFP', normaRespaldo: 'Circular SBS RMA Oct-Dic 2026 — N° exacto pendiente de validar (Portal SBS https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx)' },

  // AFP Integra
  { id: 'prm-afp-int-ap', codigoParametro: 'AFP_INTEGRA_APORTE', descripcion: 'AFP Integra - Fondo Obligatorio', valorNumerico: 0.10, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'TUO Ley del SPP D.S. N° 054-97-EF Art. 30° inc. a)' },
  { id: 'prm-afp-int-cf', codigoParametro: 'AFP_INTEGRA_COMISION_FLUJO', descripcion: 'AFP Integra - Comisión sobre flujo (1.55%)', valorNumerico: 0.0155, vigenteDesde: '2026-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Boletín SBS Comisiones y Primas SPP (https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx)' },
  { id: 'prm-afp-int-cm', codigoParametro: 'AFP_INTEGRA_COMISION_MIXTA', descripcion: 'AFP Integra - Comisión mixta sobre flujo (0.00%)', valorNumerico: 0.0000, vigenteDesde: '2026-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Ley N° 29903 / Boletín SBS Comisiones SPP (componente sobre flujo 0.00%; saldo anual administrado por AFP)' },
  { id: 'prm-afp-int-ps', codigoParametro: 'AFP_INTEGRA_PRIMA_SEGURO', descripcion: 'AFP Integra - Prima de seguro (1.37%)', valorNumerico: 0.0137, vigenteDesde: '2026-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Licitación SISCO SBS (https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx)' },

  // AFP Prima
  { id: 'prm-afp-pri-ap', codigoParametro: 'AFP_PRIMA_APORTE', descripcion: 'AFP Prima - Fondo Obligatorio', valorNumerico: 0.10, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'TUO Ley del SPP D.S. N° 054-97-EF Art. 30° inc. a)' },
  { id: 'prm-afp-pri-cf', codigoParametro: 'AFP_PRIMA_COMISION_FLUJO', descripcion: 'AFP Prima - Comisión sobre flujo (1.60%)', valorNumerico: 0.0160, vigenteDesde: '2026-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Boletín SBS Comisiones y Primas SPP (https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx)' },
  { id: 'prm-afp-pri-cm', codigoParametro: 'AFP_PRIMA_COMISION_MIXTA', descripcion: 'AFP Prima - Comisión mixta parametrizada (0.18% — pendiente de validar)', valorNumerico: 0.0018, vigenteDesde: '2026-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Pendiente de validar en boletín SBS vigente (según Ley N° 29903 el tramo sobre flujo migró a 0.00%; parametrizado para escenarios de prueba)' },
  { id: 'prm-afp-pri-ps', codigoParametro: 'AFP_PRIMA_PRIMA_SEGURO', descripcion: 'AFP Prima - Prima de seguro (1.37%)', valorNumerico: 0.0137, vigenteDesde: '2026-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Licitación SISCO SBS (https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx)' },

  // AFP Profuturo
  { id: 'prm-afp-pro-ap', codigoParametro: 'AFP_PROFUTURO_APORTE', descripcion: 'AFP Profuturo - Fondo Obligatorio', valorNumerico: 0.10, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'TUO Ley del SPP D.S. N° 054-97-EF Art. 30° inc. a)' },
  { id: 'prm-afp-pro-cf', codigoParametro: 'AFP_PROFUTURO_COMISION_FLUJO', descripcion: 'AFP Profuturo - Comisión sobre flujo (1.69%)', valorNumerico: 0.0169, vigenteDesde: '2026-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Boletín SBS Comisiones y Primas SPP (https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx)' },
  { id: 'prm-afp-pro-cm', codigoParametro: 'AFP_PROFUTURO_COMISION_MIXTA', descripcion: 'AFP Profuturo - Comisión mixta parametrizada (0.20% — pendiente de validar)', valorNumerico: 0.0020, vigenteDesde: '2026-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Pendiente de validar en boletín SBS vigente (según Ley N° 29903 el tramo sobre flujo migró a 0.00%; parametrizado para escenarios de prueba)' },
  { id: 'prm-afp-pro-ps', codigoParametro: 'AFP_PROFUTURO_PRIMA_SEGURO', descripcion: 'AFP Profuturo - Prima de seguro (1.37%)', valorNumerico: 0.0137, vigenteDesde: '2026-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Licitación SISCO SBS (https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx)' },

  // AFP Habitat
  { id: 'prm-afp-hab-ap', codigoParametro: 'AFP_HABITAT_APORTE', descripcion: 'AFP Habitat - Fondo Obligatorio', valorNumerico: 0.10, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'TUO Ley del SPP D.S. N° 054-97-EF Art. 30° inc. a)' },
  { id: 'prm-afp-hab-cf', codigoParametro: 'AFP_HABITAT_COMISION_FLUJO', descripcion: 'AFP Habitat - Comisión sobre flujo (1.47%)', valorNumerico: 0.0147, vigenteDesde: '2026-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Boletín SBS Comisiones y Primas SPP (https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx)' },
  { id: 'prm-afp-hab-cm', codigoParametro: 'AFP_HABITAT_COMISION_MIXTA', descripcion: 'AFP Habitat - Comisión mixta parametrizada (0.23% — pendiente de validar)', valorNumerico: 0.0023, vigenteDesde: '2026-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Pendiente de validar en boletín SBS vigente (según Ley N° 29903 el tramo sobre flujo migró a 0.00%; parametrizado para escenarios de prueba)' },
  { id: 'prm-afp-hab-ps', codigoParametro: 'AFP_HABITAT_PRIMA_SEGURO', descripcion: 'AFP Habitat - Prima de seguro (1.37%)', valorNumerico: 0.0137, vigenteDesde: '2026-01-01', vigenteHasta: null, categoria: 'AFP', normaRespaldo: 'Licitación SISCO SBS (https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx)' },

  // Parámetros de Conciliación SIRE (R.S. N° 000112-2021/SUNAT y modif. R.S. N° 000040-2022/SUNAT)
  { id: 'prm-sire-tol-base', codigoParametro: 'SIRE_TOLERANCIA_BASE_DECIMAL', descripcion: 'Tolerancia en soles para diferencia de Base Imponible en conciliación SIRE (S/ 0.05)', valorNumerico: 0.05, vigenteDesde: '2021-10-01', vigenteHasta: null, categoria: 'SIRE', normaRespaldo: 'Resolución de Superintendencia N° 000112-2021/SUNAT Art. 8°' },
  { id: 'prm-sire-tol-igv', codigoParametro: 'SIRE_TOLERANCIA_IGV_DECIMAL', descripcion: 'Tolerancia en soles para diferencia de IGV en conciliación SIRE (S/ 0.05)', valorNumerico: 0.05, vigenteDesde: '2021-10-01', vigenteHasta: null, categoria: 'SIRE', normaRespaldo: 'Resolución de Superintendencia N° 000112-2021/SUNAT Art. 8°' },
  { id: 'prm-sire-tol-tot', codigoParametro: 'SIRE_TOLERANCIA_TOTAL_DECIMAL', descripcion: 'Tolerancia en soles para diferencia de Importe Total en conciliación SIRE (S/ 0.05)', valorNumerico: 0.05, vigenteDesde: '2021-10-01', vigenteHasta: null, categoria: 'SIRE', normaRespaldo: 'Resolución de Superintendencia N° 000112-2021/SUNAT Art. 8°' },
  { id: 'prm-sire-tol-dias', codigoParametro: 'SIRE_TOLERANCIA_FECHA_DIAS', descripcion: 'Tolerancia en días para fecha de emisión en cruces SIRE (3 días)', valorNumerico: 3, vigenteDesde: '2021-10-01', vigenteHasta: null, categoria: 'SIRE', normaRespaldo: 'Resolución de Superintendencia N° 000112-2021/SUNAT Art. 8°' },
  { id: 'prm-sire-cta-gasto', codigoParametro: 'SIRE_CUENTA_AJUSTE_GASTO', descripcion: 'Cuenta contable para ajustes por diferencia de importe al gasto (6591)', valorNumerico: 6591, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'SIRE', normaRespaldo: 'PCGE 2019/2026 Subcuenta 6591 Otros gastos de gestión' },
  { id: 'prm-sire-cta-ingreso', codigoParametro: 'SIRE_CUENTA_AJUSTE_INGRESO', descripcion: 'Cuenta contable para ajustes por diferencia de importe al ingreso (7591)', valorNumerico: 7591, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'SIRE', normaRespaldo: 'PCGE 2019/2026 Subcuenta 7591 Otros ingresos de gestión' },
  { id: 'prm-sire-cta-proveedor', codigoParametro: 'SIRE_CUENTA_AJUSTE_PROVEEDOR', descripcion: 'Cuenta contable para pasivo comercial con proveedores (4212)', valorNumerico: 4212, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'SIRE', normaRespaldo: 'PCGE 2019/2026 Subcuenta 4212 Emitidas en cartera' },
  { id: 'prm-sire-cta-cliente', codigoParametro: 'SIRE_CUENTA_AJUSTE_CLIENTE', descripcion: 'Cuenta contable para activo comercial con clientes (1212)', valorNumerico: 1212, vigenteDesde: '2020-01-01', vigenteHasta: null, categoria: 'SIRE', normaRespaldo: 'PCGE 2019/2026 Subcuenta 1212 Emitidas en cartera' },

  // Parámetros e Indicadores de Libros Electrónicos PLE 5.2 (R.S. N° 286-2009/SUNAT y modif.)
  { id: 'prm-ple-ind-oper-activa', codigoParametro: 'PLE_INDICADOR_OPERACION_ACTIVA', descripcion: 'PLE Indicador de operaciones: Empresa en marcha u operativa (1)', valorNumerico: 1, vigenteDesde: '2009-12-31', vigenteHasta: null, categoria: 'PLE', normaRespaldo: 'Resolución de Superintendencia N° 286-2009/SUNAT Anexo 1' },
  { id: 'prm-ple-ind-cierre', codigoParametro: 'PLE_INDICADOR_CIERRE_OPERACION', descripcion: 'PLE Indicador de operaciones: Cierre de operaciones o libro (0)', valorNumerico: 0, vigenteDesde: '2009-12-31', vigenteHasta: null, categoria: 'PLE', normaRespaldo: 'Resolución de Superintendencia N° 286-2009/SUNAT Anexo 1' },
  { id: 'prm-ple-ind-con-info', codigoParametro: 'PLE_INDICADOR_CON_CONTENIDO', descripcion: 'PLE Indicador de contenido: Libro con información en el período (1)', valorNumerico: 1, vigenteDesde: '2009-12-31', vigenteHasta: null, categoria: 'PLE', normaRespaldo: 'Resolución de Superintendencia N° 286-2009/SUNAT Anexo 1' },
  { id: 'prm-ple-ind-sin-info', codigoParametro: 'PLE_INDICADOR_SIN_CONTENIDO', descripcion: 'PLE Indicador de contenido: Libro sin movimiento / vacío en el período (0)', valorNumerico: 0, vigenteDesde: '2009-12-31', vigenteHasta: null, categoria: 'PLE', normaRespaldo: 'Resolución de Superintendencia N° 286-2009/SUNAT Anexo 1' },
  { id: 'prm-ple-ind-mon-pen', codigoParametro: 'PLE_INDICADOR_MONEDA_PEN', descripcion: 'PLE Indicador de moneda: Moneda Nacional Soles (1)', valorNumerico: 1, vigenteDesde: '2009-12-31', vigenteHasta: null, categoria: 'PLE', normaRespaldo: 'Resolución de Superintendencia N° 286-2009/SUNAT Anexo 1' },
  { id: 'prm-ple-ind-mon-usd', codigoParametro: 'PLE_INDICADOR_MONEDA_USD', descripcion: 'PLE Indicador de moneda: Moneda Extranjera Dólares (2)', valorNumerico: 2, vigenteDesde: '2009-12-31', vigenteHasta: null, categoria: 'PLE', normaRespaldo: 'Resolución de Superintendencia N° 286-2009/SUNAT Anexo 1' },
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
    return vigente || null;
  },

  async obtenerParametroRequerido(codigo: string, fechaReferencia: string): Promise<ParametroTributario> {
    const param = await this.obtenerParametroPorCodigo(codigo, fechaReferencia);
    if (!param) {
      throw new Error(
        `CALCULO_BLOQUEADO_PARAMETRO_FALTANTE: No se encuentra configurado el parámetro requerido '${codigo}' vigente para la fecha ${fechaReferencia}. Por normativa y política de cero supuestos, el cálculo de planilla está bloqueado. El Administrador del Estudio (ADMIN_ESTUDIO) debe registrar el parámetro oficial y su norma de respaldo en Parámetros Tributarios/Laborales.`
      );
    }
    return param;
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
    if (!param) {
      throw new Error(
        `CALCULO_BLOQUEADO_PARAMETRO_FALTANTE: No se encuentra configurada la Remuneración Mínima Vital (RMV) para el período ${periodo}. Por normativa y política de cero supuestos, el cálculo de planilla está bloqueado. El Administrador del Estudio (ADMIN_ESTUDIO) debe registrar el parámetro oficial y su norma de respaldo en Parámetros Tributarios/Laborales.`
      );
    }
    return Number(param.valorNumerico);
  },

  async obtenerValidacionParametrosPlanilla(periodo: string): Promise<{
    rmv: number;
    topeRmaSeguro: number;
    advertencias: string[];
  }> {
    const advertencias: string[] = [];
    const fechaRef = `${periodo}-15`;
    const paramRmv = await this.obtenerParametroPorCodigo('RMV', fechaRef);
    if (!paramRmv) {
      throw new Error(
        `CALCULO_BLOQUEADO_PARAMETRO_FALTANTE: No se encuentra configurada la Remuneración Mínima Vital (RMV) para el período ${periodo}. Por normativa oficial y política de cero supuestos, el cálculo de planilla está bloqueado. El Administrador del Estudio (ADMIN_ESTUDIO) debe registrar el parámetro oficial y su norma de respaldo en Parámetros Tributarios/Laborales.`
      );
    }
    const rmv = paramRmv.valorNumerico;
    if (periodo >= '2026-10') {
      advertencias.push(
        'AVISO NORMATIVO: RMV vigente S/ 1,230.00 (D.S. N° 015-2026-TR). RMV segundo tramo pendiente de decreto (+S/ 70 a S/ 1,300).'
      );
    }

    const paramTope = await this.obtenerParametroPorCodigo('TOPE_PRIMA_SEGURO_AFP', fechaRef);
    if (!paramTope) {
      throw new Error(
        `CALCULO_BLOQUEADO_PARAMETRO_FALTANTE: No existe tope oficial RMA (Remuneración Máxima Asegurable SBS) para el período ${periodo}. Por normativa y política de cero supuestos, el cálculo de planilla está bloqueado. El Administrador del Estudio (ADMIN_ESTUDIO) debe registrar el parámetro oficial y su circular SBS de respaldo en Parámetros Tributarios/Laborales.`
      );
    }
    const topeRmaSeguro = paramTope.valorNumerico;

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
