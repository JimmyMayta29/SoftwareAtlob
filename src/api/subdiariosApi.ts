import { apiClient } from './client';

export type TipoOperacionSubdiario =
  | 'APERTURA'
  | 'COMPRAS'
  | 'VENTAS'
  | 'PLANILLA'
  | 'HONORARIOS'
  | 'CAJA'
  | 'BANCO'
  | 'DIARIO'
  | 'PROVISIONES'
  | 'AJUSTES'
  | 'CIERRE';

export interface SubdiarioItem {
  id: string;
  empresaId: string;
  codigo: string;
  nombre: string;
  tipoOperacion: TipoOperacionSubdiario;
  permiteAsientoManual: boolean;
  cuentaFinancieraId?: string | null;
  esSistema: boolean;
  activo: boolean;
  orden: number;
  creadoPor?: string | null;
  creadoEn: string;
}

export const subdiariosApi = {
  async listar(empresaId: string, options?: { soloActivos?: boolean; permiteManual?: boolean }): Promise<SubdiarioItem[]> {
    const params: Record<string, any> = {};
    if (options?.soloActivos !== undefined) params.soloActivos = options.soloActivos;
    if (options?.permiteManual !== undefined) params.permiteManual = options.permiteManual;

    const res: any = await apiClient.get(`/empresas/${empresaId}/subdiarios`, { params });
    return res?.data || res || [];
  },

  async obtener(empresaId: string, id: string): Promise<SubdiarioItem> {
    const res: any = await apiClient.get(`/empresas/${empresaId}/subdiarios/${id}`);
    return res?.data || res;
  },

  async crear(
    empresaId: string,
    data: {
      codigo: string;
      nombre: string;
      tipoOperacion: TipoOperacionSubdiario;
      cuentaFinancieraId?: string | null;
      permiteAsientoManual?: boolean;
    }
  ): Promise<SubdiarioItem> {
    const res: any = await apiClient.post(`/empresas/${empresaId}/subdiarios`, data);
    return res?.data || res;
  },

  async actualizar(
    empresaId: string,
    id: string,
    data: {
      nombre?: string;
      activo?: boolean;
      cuentaFinancieraId?: string | null;
      permiteAsientoManual?: boolean;
    }
  ): Promise<SubdiarioItem> {
    const res: any = await apiClient.put(`/empresas/${empresaId}/subdiarios/${id}`, data);
    return res?.data || res;
  },

  async eliminar(empresaId: string, id: string): Promise<{ eliminada: boolean }> {
    const res: any = await apiClient.delete(`/empresas/${empresaId}/subdiarios/${id}`);
    return res?.data || res;
  }
};
