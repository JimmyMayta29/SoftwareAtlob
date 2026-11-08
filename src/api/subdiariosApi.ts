import { apiRequest } from './client';

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
    const params = new URLSearchParams();
    if (options?.soloActivos !== undefined) params.set('soloActivos', String(options.soloActivos));
    if (options?.permiteManual !== undefined) params.set('permiteManual', String(options.permiteManual));

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await apiRequest<{ success: boolean; data: SubdiarioItem[] }>(
      `/empresas/${empresaId}/subdiarios${qs}`,
      { method: 'GET' }
    );
    return res.data || [];
  },

  async obtener(empresaId: string, id: string): Promise<SubdiarioItem> {
    const res = await apiRequest<{ success: boolean; data: SubdiarioItem }>(
      `/empresas/${empresaId}/subdiarios/${id}`,
      { method: 'GET' }
    );
    return res.data;
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
    const res = await apiRequest<{ success: boolean; data: SubdiarioItem }>(
      `/empresas/${empresaId}/subdiarios`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }
    );
    return res.data;
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
    const res = await apiRequest<{ success: boolean; data: SubdiarioItem }>(
      `/empresas/${empresaId}/subdiarios/${id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }
    );
    return res.data;
  },

  async eliminar(empresaId: string, id: string): Promise<{ eliminada: boolean }> {
    const res = await apiRequest<{ success: boolean; eliminada: boolean }>(
      `/empresas/${empresaId}/subdiarios/${id}`,
      { method: 'DELETE' }
    );
    return res;
  }
};

