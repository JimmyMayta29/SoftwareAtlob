import { apiClient } from './client';
import {
  HojaTrabajo10ColumnasReporte,
  OpcionesHojaTrabajo10Col,
  LibroDiarioESTANDARReporte,
  OpcionesLibroDiarioESTANDAR
} from '../services/reportesEngine';

export const reportesApi = {
  async getHojaTrabajo10Columnas(
    empresaId: string,
    periodo: string,
    opciones?: OpcionesHojaTrabajo10Col
  ): Promise<HojaTrabajo10ColumnasReporte> {
    const params = new URLSearchParams();
    if (periodo) params.set('periodo', periodo);
    if (opciones?.acumuladoAlMes !== undefined) params.set('acumulado', String(opciones.acumuladoAlMes));
    if (opciones?.correctorasActivoEnNegativo !== undefined) params.set('correctorasEnNegativo', String(opciones.correctorasActivoEnNegativo));
    if (opciones?.incluirCierreYAjustes !== undefined) params.set('incluirCierre', String(opciones.incluirCierreYAjustes));
    if (opciones?.mapeoFuncionPersonalizado) {
      params.set('mapeoFuncion', JSON.stringify(opciones.mapeoFuncionPersonalizado));
    }

    const res: any = await apiClient.get(`/empresas/${empresaId}/reportes/hoja-trabajo-10-columnas?${params.toString()}`);
    return res && res.data ? res.data : res;
  },

  async getLibroMayor(empresaId: string, periodo: string, acumulado = false): Promise<any> {
    const params = new URLSearchParams();
    if (periodo) params.set('periodo', periodo);
    params.set('acumulado', String(acumulado));
    const res: any = await apiClient.get(`/empresas/${empresaId}/libro-mayor?${params.toString()}`);
    return res && res.data ? res.data : res;
  },

  async getBalanceComprobacion(empresaId: string, periodo: string, acumulado = true): Promise<any> {
    const params = new URLSearchParams();
    if (periodo) params.set('periodo', periodo);
    params.set('acumulado', String(acumulado));
    const res: any = await apiClient.get(`/empresas/${empresaId}/balance-comprobacion?${params.toString()}`);
    return res && res.data ? res.data : res;
  },

  async getEstadoSituacionFinanciera(empresaId: string, periodo: string, acumulado = true): Promise<any> {
    const params = new URLSearchParams();
    if (periodo) params.set('periodo', periodo);
    params.set('acumulado', String(acumulado));
    const res: any = await apiClient.get(`/empresas/${empresaId}/estado-situacion-financiera?${params.toString()}`);
    return res && res.data ? res.data : res;
  },

  async getEstadoResultados(empresaId: string, periodo: string, acumulado = true): Promise<any> {
    const params = new URLSearchParams();
    if (periodo) params.set('periodo', periodo);
    params.set('acumulado', String(acumulado));
    const res: any = await apiClient.get(`/empresas/${empresaId}/estado-resultados?${params.toString()}`);
    return res && res.data ? res.data : res;
  },

  async getFlujoEfectivo(empresaId: string, periodo: string, acumulado = true): Promise<any> {
    const params = new URLSearchParams();
    if (periodo) params.set('periodo', periodo);
    params.set('acumulado', String(acumulado));
    const res: any = await apiClient.get(`/empresas/${empresaId}/flujo-efectivo?${params.toString()}`);
    return res && res.data ? res.data : res;
  },

  async getRatiosFinancieros(empresaId: string, periodo: string): Promise<any> {
    const params = new URLSearchParams();
    if (periodo) params.set('periodo', periodo);
    const res: any = await apiClient.get(`/empresas/${empresaId}/ratios-financieros?${params.toString()}`);
    return res && res.data ? res.data : res;
  },

  async getLibroDiarioESTANDAR(
    empresaId: string,
    periodo: string,
    opciones?: OpcionesLibroDiarioESTANDAR
  ): Promise<LibroDiarioESTANDARReporte> {
    const params = new URLSearchParams();
    if (periodo) params.set('periodo', periodo);
    if (opciones?.incluirAjustesYCierre !== undefined) params.set('incluirCierre', String(opciones.incluirAjustesYCierre));
    if (opciones?.formatoFecha) params.set('formatoFecha', opciones.formatoFecha);
    if (opciones?.voucherDesde) params.set('voucherDesde', opciones.voucherDesde);
    if (opciones?.voucherHasta) params.set('voucherHasta', opciones.voucherHasta);

    const res: any = await apiClient.get(`/empresas/${empresaId}/reportes/libro-diario-estructurado?${params.toString()}`);
    return res && res.data ? res.data : res;
  },

  async descargarPle51Diario(empresaId: string, periodo: string): Promise<string> {
    const res: any = await apiClient.get(`/empresas/${empresaId}/reportes/ple-5-1-diario?periodo=${periodo}`, {
      responseType: 'text'
    });
    return typeof res === 'string' ? res : (res?.data || '');
  }
};
