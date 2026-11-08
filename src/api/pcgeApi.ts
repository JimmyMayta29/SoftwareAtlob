import { apiClient } from './client';

export interface CuentaPCGEApi {
  id?: string;
  codigo: string;
  nombre: string;
  elemento: number;
  nivel: number;
  tipoCuenta: string;
  permiteMovimiento: boolean;
  esRegistro: boolean;
  clasificacionEeff: string;
  naturalezaSaldo: 'DEUDORA' | 'ACREEDORA' | 'MIXTA';
  signoEeff: number;
  cuentaCierreRelacionada?: string | null;
  esCorrectora: boolean;
  esInactiva: boolean;
  columnaHojaTrabajo?: string;
}

export const pcgeApi = {
  async obtenerPlanCuentas(empresaId: string, params?: { busqueda?: string; elemento?: string; incluirInactivas?: boolean }): Promise<{ ok: boolean; total: number; cuentas: CuentaPCGEApi[] }> {
    return apiClient.get(`/empresas/${empresaId}/plan-cuentas`, { params });
  },

  async completarPlanDesdeCatalogoBase(empresaId: string): Promise<{ ok: boolean; mensaje: string; resultado: { agregadas: number; existentes: number; totalEmpresa: number } }> {
    return apiClient.post(`/empresas/${empresaId}/plan-cuentas/completar`, {});
  },

  async crearSubcuenta(empresaId: string, subcuenta: {
    codigo: string;
    nombre: string;
    esRegistro?: boolean;
    naturalezaSaldo?: 'DEUDORA' | 'ACREEDORA' | 'MIXTA';
    clasificacionEeff?: string;
  }): Promise<{ ok: boolean; mensaje: string; cuenta: CuentaPCGEApi }> {
    return apiClient.post(`/empresas/${empresaId}/plan-cuentas`, subcuenta);
  },

  async eliminarCuenta(empresaId: string, codigo: string): Promise<{ ok: boolean; mensaje: string }> {
    return apiClient.delete(`/empresas/${empresaId}/plan-cuentas/${codigo}`);
  },

  async marcarInactiva(empresaId: string, codigo: string, inactiva: boolean): Promise<{ ok: boolean; mensaje: string; codigo: string; inactiva: boolean }> {
    return apiClient.patch(`/empresas/${empresaId}/plan-cuentas/${codigo}/inactiva`, { inactiva });
  }
};

