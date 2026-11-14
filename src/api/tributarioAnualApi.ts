import { apiClient } from './client';

export interface AlertaFiscal {
  id: string;
  tipo: 'BANCARIZACION' | 'DETRACCION_PENDIENTE' | 'PROVEEDOR_RIESGO' | 'CORRELATIVO_SALTADO' | 'COMPROBANTE_DUPLICADO' | 'RATIO_CREDITO_FISCAL';
  nivelRiesgo: 'CRITICO' | 'MEDIO' | 'INFORMATIVO';
  titulo: string;
  descripcion: string;
  baseLegal: string;
  comprobanteRef?: string;
  montoInvolucrado?: number;
  recomendacion: string;
}

export interface DiagnosticoAuditoriaPreventiva {
  empresaId: string;
  anio: number;
  fechaDiagnostico: string;
  scoreSaludFiscal: number;
  nivelRiesgoGeneral: 'BAJO' | 'MEDIO' | 'ALTO';
  resumenMetricas: {
    totalComprobantesAnalizados: number;
    totalComprasAnalizadas: number;
    totalVentasAnalizadas: number;
    totalAlertasDetectadas: number;
    alertasCriticas: number;
    alertasMedias: number;
    alertasInformativas: number;
    montoTotalEnRiesgo: number;
  };
  alertas: AlertaFiscal[];
}

export interface RegistroTerceroDaot {
  tipoDocIdentidad: '6' | '1' | '4' | '7';
  numeroDocIdentidad: string;
  razonSocialONombres: string;
  totalCompras: number;
  totalVentas: number;
  totalOperaciones: number;
  superaUmbral2Uit: boolean;
  umbral2UitAplicable: number;
  condicion: 'DECLARABLE' | 'EXCEPTUADO';
}

export interface ResumenDaotEjecucion {
  empresaId: string;
  anio: number;
  uitAnual: number;
  umbral2Uit: number;
  totalTercerosEvaluados: number;
  totalTercerosDeclarables: number;
  montoTotalDeclarable: number;
  totalComprasDeclarables: number;
  totalVentasDeclarables: number;
  registros: RegistroTerceroDaot[];
  txtGenerado?: string;
  nombreArchivoTxt: string;
}

export interface PropuestaAsientoCierre {
  numeroPaso: number;
  codigoCuentaEnlace: string;
  denominacionPaso: string;
  subdiario: string;
  numeroAsiento: string;
  fecha: string;
  glosa: string;
  lineas: Array<{
    id: string;
    codigoCuenta: string;
    denominacionCuenta: string;
    debe: number;
    haber: number;
    glosa: string;
  }>;
  totalDebe: number;
  totalHaber: number;
  cuadrado: boolean;
}

export interface ResultadoCierreAnual {
  empresaId: string;
  anio: number;
  fechaEjecucion: string;
  totalAsientosGenerados: number;
  resultadoNetoContable: number;
  tipoResultado: 'UTILIDAD' | 'PERDIDA' | 'EQUILIBRIO';
  cuentasRegularizadas: number;
  asientos: PropuestaAsientoCierre[];
}

export interface CalculoDjAnualRenta {
  empresaId: string;
  anio: number;
  regimenTributario: 'REGIMEN_GENERAL' | 'MYPE_TRIBUTARIO';
  uitAplicable: number;
  utilidadContableAntesImpuestos: number;
  totalAdiciones: number;
  adicionesDetalle: Array<{ id: string; codigo: string; descripcion: string; baseLegal: string; monto: number }>;
  totalDeducciones: number;
  deduccionesDetalle: Array<{ id: string; codigo: string; descripcion: string; baseLegal: string; monto: number }>;
  rentaNetaImponible: number;
  impuestoRentaCalculado: number;
  tasaEfectiva: number;
  totalCreditos: number;
  creditosDetalle: {
    pagosACuentaMensuales: number;
    saldoAFavorAnterior: number;
    itanPagado: number;
  };
  saldoPorRegularizar: number;
  estadoDeclaracion: 'POR_PAGAR_SUNAT' | 'SALDO_A_FAVOR';
}

function extractData<T>(res: any, fallback: T): T {
  if (res && res.data !== undefined && res.data !== null) return res.data;
  if (res !== undefined && res !== null) return res;
  return fallback;
}

export const tributarioAnualApi = {
  async getAuditoriaPreventiva(empresaId: string, anio: number = 2026): Promise<DiagnosticoAuditoriaPreventiva> {
    const res: any = await apiClient.get(`/empresas/${empresaId}/auditoria/preventiva?anio=${anio}`);
    const data = res?.data || res;
    if (!data) throw new Error('No se pudo obtener el diagnóstico de auditoría preventiva');
    return data;
  },

  async getDaotResumen(empresaId: string, anio: number = 2026): Promise<ResumenDaotEjecucion> {
    const res: any = await apiClient.get(`/empresas/${empresaId}/daot/resumen?anio=${anio}`);
    const data = res?.data || res;
    if (!data) throw new Error('No se pudo obtener el resumen DAOT');
    return data;
  },

  async simularCierreAnual(empresaId: string, anio: number = 2026): Promise<ResultadoCierreAnual> {
    const res: any = await apiClient.post(`/empresas/${empresaId}/cierre-anual/simular`, { anio });
    const data = res?.data || res;
    if (!data) throw new Error('No se pudo simular el cierre anual');
    return data;
  },

  async ejecutarCierreAnual(empresaId: string, anio: number = 2026): Promise<{ ok: boolean; mensaje: string; asientosCreados: number }> {
    const res: any = await apiClient.post(`/empresas/${empresaId}/cierre-anual/ejecutar`, { anio });
    const data = res?.data || res;
    if (!data) throw new Error('No se pudo ejecutar el cierre anual');
    return data;
  },

  async revertirCierreAnual(empresaId: string, anio: number = 2026): Promise<{ ok: boolean; mensaje: string }> {
    const res: any = await apiClient.post(`/empresas/${empresaId}/cierre-anual/revertir`, { anio });
    const data = res?.data || res;
    if (!data) throw new Error('No se pudo revertir el cierre anual');
    return data;
  },

  async calcularDjAnual(empresaId: string, anio: number = 2026, params?: any): Promise<CalculoDjAnualRenta> {
    const res: any = await apiClient.post(`/empresas/${empresaId}/dj-anual/calcular`, { anio, ...params });
    const data = res?.data || res;
    if (!data) throw new Error('No se pudo calcular la DJ Anual de Renta');
    return data;
  }
};
