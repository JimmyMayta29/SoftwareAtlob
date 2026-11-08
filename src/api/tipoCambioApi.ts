import { apiClient } from './client';

export interface TipoCambioDTO {
  id?: string;
  fecha: string;
  compra: number;
  venta: number;
  fuente: 'SUNAT' | 'SBS' | 'MANUAL';
  createdAt?: string;
}

export const tipoCambioApi = {
  obtenerVigente: async (fecha?: string): Promise<TipoCambioDTO | null> => {
    const params = fecha ? { fecha } : {};
    const res = await apiClient.get<{ data: TipoCambioDTO | null }>('/tipo-cambio/vigente', { params });
    return res.data?.data || null;
  },

  obtenerPorFecha: async (fecha: string): Promise<TipoCambioDTO | null> => {
    const res = await apiClient.get<{ data: TipoCambioDTO | null }>('/tipo-cambio', { params: { fecha } });
    return res.data?.data || null;
  },

  guardar: async (datos: {
    fecha: string;
    compra: number;
    venta: number;
    fuente?: 'SUNAT' | 'SBS' | 'MANUAL';
  }): Promise<TipoCambioDTO> => {
    const res = await apiClient.post<{ data: TipoCambioDTO }>('/tipo-cambio', datos);
    return res.data.data;
  },

  listar: async (limite: number = 30): Promise<TipoCambioDTO[]> => {
    const res = await apiClient.get<{ data: TipoCambioDTO[] }>('/tipo-cambio', { params: { limite } });
    return res.data?.data || [];
  }
};
