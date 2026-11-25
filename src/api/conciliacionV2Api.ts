import { apiClient } from './client';
import {
  ESTADOS_CONCILIACION_V2,
  FORMATOS_EXTRACTO_V2,
  SENTIDOS_MONTO_REGLA,
  TIPOS_CLASIFICACION_EXTRACTO,
  TIPOS_COINCIDENCIA_REGLA,
  type AceptarSugerenciasInput,
  type ActualizarConfigConciliacionV2Input,
  type ActualizarPerfilBancoInput,
  type ActualizarReglaAprendidaInput,
  type ActualizarReglaClasificacionInput,
  type AdvertenciaImportacion,
  type CerrarConciliacionV2Input,
  type ConciliarManualGrupoInput,
  type ConciliarPartidaV2Input,
  type ConfigConciliacionV2,
  type ConfirmarImportacionInput,
  type CrearPerfilBancoInput,
  type CrearReglaAprendidaInput,
  type CrearReglaClasificacionInput,
  type CuentaBancariaV2,
  type CuentaContableDisponibleV2,
  type DesconciliarGrupoInput,
  type DesconciliarPartidaV2Input,
  type EjecutarMatchingInput,
  type ErrorFilaImportacion,
  type EstadoConciliacionV2,
  type EstadoGrupoConciliacionV2,
  type EstadoLibroV2,
  type FormatoExtractoV2,
  type GrupoConciliacionV2,
  type HistorialDesconciliacionV2,
  type ImportacionExtractoResumenV2,
  type IntegridadMayor104x,
  type ItemConciliacionV2,
  type LineaPrevisualizadaV2,
  type MapeoColumnasPerfil,
  type OrigenPartidaLibroV2,
  type PartidaExtractoV2,
  type PartidaLibroV2,
  type PerfilBancoV2,
  type PrevisualizarImportacionInput,
  type ReabrirConciliacionV2Input,
  type RechazarSugerenciaInput,
  type ReglaAprendidaV2,
  type ReglaClasificacionV2,
  type ResultadoCierreV2,
  type ResultadoConfirmacionImportacionV2,
  type ResultadoEjecucionMatchingV2,
  type ResultadoPrevisualizacionImportacionV2,
  type ResultadoReversionImportacionV2,
  type ResumenConciliacionV2,
  type RevertirImportacionInput,
  type SemaforoConciliacion,
  type SentidoMontoRegla,
  type TipoClasificacionExtracto,
  type TipoCoincidenciaRegla,
  type TipoMatchV2,
  type VincularCuentaContableInput,
} from '../../server/types/conciliacionV2';

export {
  ESTADOS_CONCILIACION_V2,
  FORMATOS_EXTRACTO_V2,
  SENTIDOS_MONTO_REGLA,
  TIPOS_CLASIFICACION_EXTRACTO,
  TIPOS_COINCIDENCIA_REGLA,
};

export type {
  AceptarSugerenciasInput,
  ActualizarConfigConciliacionV2Input,
  ActualizarPerfilBancoInput,
  ActualizarReglaAprendidaInput,
  ActualizarReglaClasificacionInput,
  AdvertenciaImportacion,
  CerrarConciliacionV2Input,
  ConciliarManualGrupoInput,
  ConciliarPartidaV2Input,
  ConfigConciliacionV2,
  ConfirmarImportacionInput,
  CrearPerfilBancoInput,
  CrearReglaAprendidaInput,
  CrearReglaClasificacionInput,
  CuentaBancariaV2,
  CuentaContableDisponibleV2,
  DesconciliarGrupoInput,
  DesconciliarPartidaV2Input,
  EjecutarMatchingInput,
  ErrorFilaImportacion,
  EstadoConciliacionV2,
  EstadoGrupoConciliacionV2,
  EstadoLibroV2,
  FormatoExtractoV2,
  GrupoConciliacionV2,
  HistorialDesconciliacionV2,
  ImportacionExtractoResumenV2,
  IntegridadMayor104x,
  ItemConciliacionV2,
  LineaPrevisualizadaV2,
  MapeoColumnasPerfil,
  OrigenPartidaLibroV2,
  PartidaExtractoV2,
  PartidaLibroV2,
  PerfilBancoV2,
  PrevisualizarImportacionInput,
  ReabrirConciliacionV2Input,
  RechazarSugerenciaInput,
  ReglaAprendidaV2,
  ReglaClasificacionV2,
  ResultadoCierreV2,
  ResultadoConfirmacionImportacionV2,
  ResultadoEjecucionMatchingV2,
  ResultadoPrevisualizacionImportacionV2,
  ResultadoReversionImportacionV2,
  ResumenConciliacionV2,
  RevertirImportacionInput,
  SemaforoConciliacion,
  SentidoMontoRegla,
  TipoClasificacionExtracto,
  TipoCoincidenciaRegla,
  TipoMatchV2,
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

function extraerDataOpcional<T>(res: unknown): T | undefined {
  if (res === null || res === undefined || res === '') return undefined;
  if (typeof res === 'object' && 'data' in res) {
    return (res as RespuestaApi<T>).data;
  }
  return undefined;
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

  // --- Fase 2: Perfiles bancarios ---

  async listarPerfiles(empresaId: string): Promise<PerfilBancoV2[]> {
    const res = await apiClient.get<RespuestaApi<PerfilBancoV2[]>>(`${baseUrl(empresaId)}/perfiles`);
    return extraerData<PerfilBancoV2[]>(res);
  },

  async crearPerfil(
    empresaId: string,
    payload: CrearPerfilBancoInput
  ): Promise<PerfilBancoV2> {
    const res = await apiClient.post<RespuestaApi<PerfilBancoV2>>(
      `${baseUrl(empresaId)}/perfiles`,
      payload
    );
    return extraerData<PerfilBancoV2>(res);
  },

  async actualizarPerfil(
    empresaId: string,
    perfilId: string,
    payload: ActualizarPerfilBancoInput
  ): Promise<PerfilBancoV2> {
    const res = await apiClient.put<RespuestaApi<PerfilBancoV2>>(
      `${baseUrl(empresaId)}/perfiles/${perfilId}`,
      payload
    );
    return extraerData<PerfilBancoV2>(res);
  },

  async eliminarPerfil(
    empresaId: string,
    perfilId: string
  ): Promise<{ eliminado: boolean; id: string } | void> {
    const res = await apiClient.delete<RespuestaApi<{ eliminado: boolean; id: string }>>(
      `${baseUrl(empresaId)}/perfiles/${perfilId}`
    );
    return extraerDataOpcional<{ eliminado: boolean; id: string }>(res);
  },

  // --- Fase 2: Reglas de clasificación ---

  async listarReglasClasificacion(empresaId: string): Promise<ReglaClasificacionV2[]> {
    const res = await apiClient.get<RespuestaApi<ReglaClasificacionV2[]>>(
      `${baseUrl(empresaId)}/reglas-clasificacion`
    );
    return extraerData<ReglaClasificacionV2[]>(res);
  },

  async crearReglaClasificacion(
    empresaId: string,
    payload: CrearReglaClasificacionInput
  ): Promise<ReglaClasificacionV2> {
    const res = await apiClient.post<RespuestaApi<ReglaClasificacionV2>>(
      `${baseUrl(empresaId)}/reglas-clasificacion`,
      payload
    );
    return extraerData<ReglaClasificacionV2>(res);
  },

  async actualizarReglaClasificacion(
    empresaId: string,
    reglaId: string,
    payload: ActualizarReglaClasificacionInput
  ): Promise<ReglaClasificacionV2> {
    const res = await apiClient.put<RespuestaApi<ReglaClasificacionV2>>(
      `${baseUrl(empresaId)}/reglas-clasificacion/${reglaId}`,
      payload
    );
    return extraerData<ReglaClasificacionV2>(res);
  },

  async eliminarReglaClasificacion(
    empresaId: string,
    reglaId: string
  ): Promise<{ eliminado: boolean; id: string } | void> {
    const res = await apiClient.delete<RespuestaApi<{ eliminado: boolean; id: string }>>(
      `${baseUrl(empresaId)}/reglas-clasificacion/${reglaId}`
    );
    return extraerDataOpcional<{ eliminado: boolean; id: string }>(res);
  },

  // --- Fase 2: Importación de extractos ---

  async listarImportaciones(
    empresaId: string,
    cuentaFinancieraId?: string
  ): Promise<ImportacionExtractoResumenV2[]> {
    const res = await apiClient.get<RespuestaApi<ImportacionExtractoResumenV2[]>>(
      `${baseUrl(empresaId)}/importaciones`,
      {
        params: cuentaFinancieraId ? { cuentaFinancieraId } : undefined,
      }
    );
    return extraerData<ImportacionExtractoResumenV2[]>(res);
  },

  async descargarPlantillaCsv(empresaId: string): Promise<Blob> {
    const res: unknown = await apiClient.get(`${baseUrl(empresaId)}/importaciones/plantilla-csv`, {
      responseType: 'blob',
    });
    if (res instanceof Blob) {
      return res;
    }
    if (typeof res === 'string') {
      return new Blob([res], { type: 'text/csv;charset=utf-8;' });
    }
    throw new Error('No se pudo descargar la plantilla CSV de extracto.');
  },

  async previsualizarImportacion(
    empresaId: string,
    payload: PrevisualizarImportacionInput
  ): Promise<ResultadoPrevisualizacionImportacionV2> {
    const res = await apiClient.post<RespuestaApi<ResultadoPrevisualizacionImportacionV2>>(
      `${baseUrl(empresaId)}/importaciones/previsualizar`,
      payload
    );
    return extraerData<ResultadoPrevisualizacionImportacionV2>(res);
  },

  async confirmarImportacion(
    empresaId: string,
    payload: ConfirmarImportacionInput
  ): Promise<ResultadoConfirmacionImportacionV2> {
    const res = await apiClient.post<RespuestaApi<ResultadoConfirmacionImportacionV2>>(
      `${baseUrl(empresaId)}/importaciones/confirmar`,
      payload
    );
    return extraerData<ResultadoConfirmacionImportacionV2>(res);
  },

  async revertirImportacion(
    empresaId: string,
    importId: string,
    payload: RevertirImportacionInput
  ): Promise<ResultadoReversionImportacionV2> {
    const res = await apiClient.post<RespuestaApi<ResultadoReversionImportacionV2>>(
      `${baseUrl(empresaId)}/importaciones/${importId}/revertir`,
      payload
    );
    return extraerData<ResultadoReversionImportacionV2>(res);
  },

  // --- Fase 3: Motor de matching, grupos, historial y reglas aprendidas ---

  async ejecutarMatching(
    empresaId: string,
    payload: EjecutarMatchingInput
  ): Promise<ResultadoEjecucionMatchingV2> {
    const res = await apiClient.post<RespuestaApi<ResultadoEjecucionMatchingV2>>(
      `${baseUrl(empresaId)}/matching/ejecutar`,
      payload
    );
    return extraerData<ResultadoEjecucionMatchingV2>(res);
  },

  async listarGruposMatching(
    empresaId: string,
    params: {
      cuentaFinancieraId: string;
      periodo: string;
      estado?: EstadoGrupoConciliacionV2;
    }
  ): Promise<GrupoConciliacionV2[]> {
    const res = await apiClient.get<RespuestaApi<GrupoConciliacionV2[]>>(
      `${baseUrl(empresaId)}/matching/grupos`,
      { params }
    );
    return extraerData<GrupoConciliacionV2[]>(res);
  },

  async aceptarSugerencias(
    empresaId: string,
    payload: AceptarSugerenciasInput
  ): Promise<GrupoConciliacionV2[]> {
    const res = await apiClient.post<RespuestaApi<GrupoConciliacionV2[]>>(
      `${baseUrl(empresaId)}/matching/sugerencias/aceptar`,
      payload
    );
    return extraerData<GrupoConciliacionV2[]>(res);
  },

  async rechazarSugerencia(
    empresaId: string,
    grupoId: string,
    payload?: RechazarSugerenciaInput
  ): Promise<GrupoConciliacionV2> {
    const res = await apiClient.post<RespuestaApi<GrupoConciliacionV2>>(
      `${baseUrl(empresaId)}/matching/sugerencias/${grupoId}/rechazar`,
      payload ?? {}
    );
    return extraerData<GrupoConciliacionV2>(res);
  },

  async conciliarManualGrupo(
    empresaId: string,
    payload: ConciliarManualGrupoInput
  ): Promise<GrupoConciliacionV2> {
    const res = await apiClient.post<RespuestaApi<GrupoConciliacionV2>>(
      `${baseUrl(empresaId)}/matching/manual`,
      payload
    );
    return extraerData<GrupoConciliacionV2>(res);
  },

  async desconciliarGrupo(
    empresaId: string,
    grupoId: string,
    payload: DesconciliarGrupoInput
  ): Promise<GrupoConciliacionV2> {
    const res = await apiClient.post<RespuestaApi<GrupoConciliacionV2>>(
      `${baseUrl(empresaId)}/matching/grupos/${grupoId}/desconciliar`,
      payload
    );
    return extraerData<GrupoConciliacionV2>(res);
  },

  async listarHistorialDesconciliacion(
    empresaId: string,
    params?: { cuentaFinancieraId?: string; periodo?: string }
  ): Promise<HistorialDesconciliacionV2[]> {
    const res = await apiClient.get<RespuestaApi<HistorialDesconciliacionV2[]>>(
      `${baseUrl(empresaId)}/matching/historial-desconciliacion`,
      { params }
    );
    return extraerData<HistorialDesconciliacionV2[]>(res);
  },

  async listarReglasAprendidas(empresaId: string): Promise<ReglaAprendidaV2[]> {
    const res = await apiClient.get<RespuestaApi<ReglaAprendidaV2[]>>(
      `${baseUrl(empresaId)}/reglas-aprendidas`
    );
    return extraerData<ReglaAprendidaV2[]>(res);
  },

  async crearReglaAprendida(
    empresaId: string,
    payload: CrearReglaAprendidaInput
  ): Promise<ReglaAprendidaV2> {
    const res = await apiClient.post<RespuestaApi<ReglaAprendidaV2>>(
      `${baseUrl(empresaId)}/reglas-aprendidas`,
      payload
    );
    return extraerData<ReglaAprendidaV2>(res);
  },

  async actualizarReglaAprendida(
    empresaId: string,
    reglaId: string,
    payload: ActualizarReglaAprendidaInput
  ): Promise<ReglaAprendidaV2> {
    const res = await apiClient.put<RespuestaApi<ReglaAprendidaV2>>(
      `${baseUrl(empresaId)}/reglas-aprendidas/${reglaId}`,
      payload
    );
    return extraerData<ReglaAprendidaV2>(res);
  },

  async eliminarReglaAprendida(
    empresaId: string,
    reglaId: string
  ): Promise<{ eliminado: boolean; id: string } | void> {
    const res = await apiClient.delete<RespuestaApi<{ eliminado: boolean; id: string }>>(
      `${baseUrl(empresaId)}/reglas-aprendidas/${reglaId}`
    );
    return extraerDataOpcional<{ eliminado: boolean; id: string }>(res);
  },
};
