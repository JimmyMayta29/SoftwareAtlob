import { apiClient } from './client';
import {
  ESTADOS_CONCILIACION_V2,
  type ActualizarConfigConciliacionV2Input,
  type CerrarConciliacionV2Input,
  type ConciliarPartidaV2Input,
  type ConfigConciliacionV2,
  type CuentaBancariaV2,
  type CuentaContableDisponibleV2,
  type DesconciliarPartidaV2Input,
  type EstadoConciliacionV2,
  type EstadoLibroV2,
  type IntegridadMayor104x,
  type PartidaExtractoV2,
  type PartidaLibroV2,
  type ReabrirConciliacionV2Input,
  type ResultadoCierreV2,
  type ResumenConciliacionV2,
  type SemaforoConciliacion,
  type VincularCuentaContableInput,
} from '../../server/types/conciliacionV2';

export { ESTADOS_CONCILIACION_V2 };
export type {
  ActualizarConfigConciliacionV2Input,
  CerrarConciliacionV2Input,
  ConciliarPartidaV2Input,
  ConfigConciliacionV2,
  CuentaBancariaV2,
  CuentaContableDisponibleV2,
  DesconciliarPartidaV2Input,
  EstadoConciliacionV2,
  EstadoLibroV2,
  IntegridadMayor104x,
  PartidaExtractoV2,
  PartidaLibroV2,
  ReabrirConciliacionV2Input,
  ResultadoCierreV2,
  ResumenConciliacionV2,
  SemaforoConciliacion,
  VincularCuentaContableInput,
};

interface RespuestaApi<T> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

function extraerData<T>(res: unknown): T {
  if (res && typeof res === 'object' && 'data' in res) {
    const envoltorio = res as RespuestaApi<T>;
    if (envoltorio.data !== undefined) {
      return envoltorio.data;
    }
  }
  throw new Error('Respuesta inválida del servidor en Conciliación Bancaria V2.');
}

function baseUrl(empresaId: string): string {
  return `/empresas/${empresaId}/conciliacion-v2`;
}

export const conciliacionV2Api = {
  async obtenerConfig(empresaId: string): Promise<ConfigConciliacionV2> {
    const res = await apiClient.get<RespuestaApi<ConfigConciliacionV2>>(`${baseUrl(empresaId)}/config`);
    return extraerData<ConfigConciliacionV2>(res);
  },

  async actualizarConfig(
    empresaId: string,
    payload: ActualizarConfigConciliacionV2Input
  ): Promise<ConfigConciliacionV2> {
    const res = await apiClient.put<RespuestaApi<ConfigConciliacionV2>>(
      `${baseUrl(empresaId)}/config`,
      payload
    );
    return extraerData<ConfigConciliacionV2>(res);
  },

  async listarCuentas(empresaId: string): Promise<CuentaBancariaV2[]> {
    const res = await apiClient.get<RespuestaApi<CuentaBancariaV2[]>>(`${baseUrl(empresaId)}/cuentas`);
    return extraerData<CuentaBancariaV2[]>(res);
  },

  async listarCuentasContablesDisponibles(empresaId: string): Promise<CuentaContableDisponibleV2[]> {
    const res = await apiClient.get<RespuestaApi<CuentaContableDisponibleV2[]>>(
      `${baseUrl(empresaId)}/cuentas-contables-disponibles`
    );
    return extraerData<CuentaContableDisponibleV2[]>(res);
  },

  async vincularCuentaContable(
    empresaId: string,
    cuentaId: string,
    payload: VincularCuentaContableInput
  ): Promise<CuentaBancariaV2> {
    const res = await apiClient.put<RespuestaApi<CuentaBancariaV2>>(
      `${baseUrl(empresaId)}/cuentas/${cuentaId}/vincular-contable`,
      payload
    );
    return extraerData<CuentaBancariaV2>(res);
  },

  async obtenerResumen(
    empresaId: string,
    cuentaFinancieraId: string,
    periodo: string
  ): Promise<ResumenConciliacionV2> {
    const res = await apiClient.get<RespuestaApi<ResumenConciliacionV2>>(`${baseUrl(empresaId)}/resumen`, {
      params: { cuentaFinancieraId, periodo },
    });
    return extraerData<ResumenConciliacionV2>(res);
  },

  async conciliarPartida(
    empresaId: string,
    payload: ConciliarPartidaV2Input
  ): Promise<PartidaExtractoV2> {
    const res = await apiClient.post<RespuestaApi<PartidaExtractoV2>>(
      `${baseUrl(empresaId)}/partidas/conciliar`,
      payload
    );
    return extraerData<PartidaExtractoV2>(res);
  },

  async desconciliarPartida(
    empresaId: string,
    payload: DesconciliarPartidaV2Input
  ): Promise<PartidaExtractoV2> {
    const res = await apiClient.post<RespuestaApi<PartidaExtractoV2>>(
      `${baseUrl(empresaId)}/partidas/desconciliar`,
      payload
    );
    return extraerData<PartidaExtractoV2>(res);
  },

  async cerrarConciliacion(
    empresaId: string,
    payload: CerrarConciliacionV2Input
  ): Promise<ResultadoCierreV2> {
    const res = await apiClient.post<RespuestaApi<ResultadoCierreV2>>(
      `${baseUrl(empresaId)}/cerrar`,
      payload
    );
    return extraerData<ResultadoCierreV2>(res);
  },

  async reabrirConciliacion(
    empresaId: string,
    payload: ReabrirConciliacionV2Input
  ): Promise<ResultadoCierreV2> {
    const res = await apiClient.post<RespuestaApi<ResultadoCierreV2>>(
      `${baseUrl(empresaId)}/reabrir`,
      payload
    );
    return extraerData<ResultadoCierreV2>(res);
  },
};
