export interface RangoMesPeriodo {
  fechaInicio: string;
  fechaFin: string;
  diasMes: number;
}

const REGEX_PERIODO_MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Calcula las cotas reales (primer y último día) para un periodo mensual YYYY-MM.
 */
export function obtenerRangoMesPeriodo(periodo: string): RangoMesPeriodo {
  const match = REGEX_PERIODO_MES.exec(periodo);
  if (!match) {
    throw new Error(`Periodo inválido "${periodo}": se esperaba el formato YYYY-MM con mes entre 01 y 12.`);
  }

  const anio = Number(match[1]);
  const mes = Number(match[2]);
  const diasMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const mesStr = match[2];
  const diaFinStr = String(diasMes).padStart(2, '0');

  return {
    fechaInicio: `${anio}-${mesStr}-01`,
    fechaFin: `${anio}-${mesStr}-${diaFinStr}`,
    diasMes,
  };
}
