import { apiClient } from './client';
import {
  ESTADOS_CHEQUE_BANCARIO_V2,
  ESTADOS_CONCILIACION_V2,
  FORMATOS_EXTRACTO_V2,
  SENTIDOS_MONTO_REGLA,
  TIPOS_CLASIFICACION_EXTRACTO,
  TIPOS_COINCIDENCIA_REGLA,
  TIPOS_DOCUMENTO_CARTERA_V2,
  TIPOS_OPERACION_CARTERA_ESPECIAL_V2,
  TIPOS_OPERACION_PLANTILLA_V2,
  type AceptarSugerenciasInput,
  type ActualizarConfigConciliacionV2Input,
  type ActualizarEstadoChequeInput,
  type ActualizarPerfilBancoInput,
  type ActualizarPlantillaAsientoInput,
  type ActualizarReglaAprendidaInput,
  type ActualizarReglaClasificacionInput,
  type AdvertenciaImportacion,
  type AlertaBancarizacionV2,
  type AlertaChequeAntiguedadV2,
  type AlertaItfV2,
  type AplicarLineaCarteraInput,
  type CerrarConciliacionV2Input,
  type ChequeBancarioV2,
  type ConciliarManualGrupoInput,
  type ConciliarPartidaV2Input,
  type ConfigConciliacionV2,
  type ConfirmarImportacionInput,
  type CrearChequeBancarioInput,
  type CrearPerfilBancoInput,
  type CrearPlantillaAsientoInput,
  type CrearReglaAprendidaInput,
  type CrearReglaClasificacionInput,
  type CuentaBancariaV2,
  type CuentaContableDisponibleV2,
  type DesconciliarGrupoInput,
  type DesconciliarPartidaV2Input,
  type EjecutarMatchingInput,
  type ErrorFilaImportacion,
  type EstadoChequeBancarioV2,
  type EstadoConciliacionV2,
  type EstadoGrupoConciliacionV2,
  type EstadoLibroV2,
  type FormatoExtractoV2,
  type GenerarAsientoLineaInput,
  type GrupoConciliacionV2,
  type HistorialCierreConciliacionV2,
  type HistorialDesconciliacionV2,
  type ImportacionExtractoResumenV2,
  type IntegridadMayor104x,
  type ItemConciliacionV2,
  type LineaAsientoPreviewV2,
  type LineaPrevisualizadaV2,
  type MapeoColumnasPerfil,
  type OrigenPartidaLibroV2,
  type PartidaExtractoV2,
  type PartidaLibroV2,
  type PerfilBancoV2,
  type PlantillaAsientoV2,
  type PreviewAsientoConciliacionV2,
  type PrevisualizarAsientoLineaInput,
  type PrevisualizarImportacionInput,
  type ReabrirConciliacionV2Input,
  type RechazarSugerenciaInput,
  type ReglaAprendidaV2,
  type ReglaClasificacionV2,
  type ReporteConciliacionOficialV2,
  type ResultadoAplicarCarteraV2,
  type ResultadoCierreV2,
  type ResultadoConfirmacionImportacionV2,
  type ResultadoEjecucionMatchingV2,
  type ResultadoGenerarAsientoLineaV2,
  type ResultadoPle010200V2,
  type ResultadoPrevisualizacionImportacionV2,
  type ResultadoReversionImportacionV2,
  type ResumenAlertasControlV2,
  type ResumenConciliacionV2,
  type RevertirImportacionInput,
  type SemaforoConciliacion,
  type SentidoMontoRegla,
  type SugerenciaDocumentoCarteraV2,
  type TipoClasificacionExtracto,
  type TipoCoincidenciaRegla,
  type TipoDocumentoCarteraV2,
  type TipoEventoCierreV2,
  type TipoMatchV2,
  type TipoOperacionCarteraEspecialV2,
  type TipoOperacionPlantillaV2,
  type VincularCuentaContableInput,
} from '../../server/types/conciliacionV2';

export {
  ESTADOS_CHEQUE_BANCARIO_V2,
  ESTADOS_CONCILIACION_V2,
  FORMATOS_EXTRACTO_V2,
  SENTIDOS_MONTO_REGLA,
  TIPOS_CLASIFICACION_EXTRACTO,
  TIPOS_COINCIDENCIA_REGLA,
  TIPOS_DOCUMENTO_CARTERA_V2,
  TIPOS_OPERACION_CARTERA_ESPECIAL_V2,
  TIPOS_OPERACION_PLANTILLA_V2,
};

export type {
  AceptarSugerenciasInput,
  ActualizarConfigConciliacionV2Input,
  ActualizarEstadoChequeInput,
  ActualizarPerfilBancoInput,
  ActualizarPlantillaAsientoInput,
  ActualizarReglaAprendidaInput,
  ActualizarReglaClasificacionInput,
  AdvertenciaImportacion,
  AlertaBancarizacionV2,
  AlertaChequeAntiguedadV2,
  AlertaItfV2,
  AplicarLineaCarteraInput,
  CerrarConciliacionV2Input,
  ChequeBancarioV2,
  ConciliarManualGrupoInput,
  ConciliarPartidaV2Input,
  ConfigConciliacionV2,
  ConfirmarImportacionInput,
  CrearChequeBancarioInput,
  CrearPerfilBancoInput,
  CrearPlantillaAsientoInput,
  CrearReglaAprendidaInput,
  CrearReglaClasificacionInput,
  CuentaBancariaV2,
  CuentaContableDisponibleV2,
  DesconciliarGrupoInput,
  DesconciliarPartidaV2Input,
  EjecutarMatchingInput,
  ErrorFilaImportacion,
  EstadoChequeBancarioV2,
  EstadoConciliacionV2,
  EstadoGrupoConciliacionV2,
  EstadoLibroV2,
  FormatoExtractoV2,
  GenerarAsientoLineaInput,
  GrupoConciliacionV2,
  HistorialCierreConciliacionV2,
  HistorialDesconciliacionV2,
  ImportacionExtractoResumenV2,
  IntegridadMayor104x,
  ItemConciliacionV2,
  LineaAsientoPreviewV2,
  LineaPrevisualizadaV2,
  MapeoColumnasPerfil,
  OrigenPartidaLibroV2,
  PartidaExtractoV2,
  PartidaLibroV2,
  PerfilBancoV2,
  PlantillaAsientoV2,
  PreviewAsientoConciliacionV2,
  PrevisualizarAsientoLineaInput,
  PrevisualizarImportacionInput,
  ReabrirConciliacionV2Input,
  RechazarSugerenciaInput,
  ReglaAprendidaV2,
  ReglaClasificacionV2,
  ReporteConciliacionOficialV2,
  ResultadoAplicarCarteraV2,
  ResultadoCierreV2,
  ResultadoConfirmacionImportacionV2,
  ResultadoEjecucionMatchingV2,
  ResultadoGenerarAsientoLineaV2,
  ResultadoPle010200V2,
  ResultadoPrevisualizacionImportacionV2,
  ResultadoReversionImportacionV2,
  ResumenAlertasControlV2,
  ResumenConciliacionV2,
  RevertirImportacionInput,
  SemaforoConciliacion,
  SentidoMontoRegla,
  SugerenciaDocumentoCarteraV2,
  TipoClasificacionExtracto,
  TipoCoincidenciaRegla,
  TipoDocumentoCarteraV2,
  TipoEventoCierreV2,
  TipoMatchV2,
  TipoOperacionCarteraEspecialV2,
  TipoOperacionPlantillaV2,
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

async function leerErrorDesdeBlob(blob: Blob): Promise<string | null> {
  try {
    const texto = await blob.text();
    const parsed = JSON.parse(texto) as {
      error?: string;
      message?: string;
      details?: { message?: string };
    };
    if (typeof parsed?.details?.message === 'string' && parsed.details.message.trim().length > 0) {
      return parsed.details.message;
    }
    if (typeof parsed?.error === 'string' && parsed.error.trim().length > 0) {
      return parsed.error;
    }
    if (typeof parsed?.message === 'string' && parsed.message.trim().length > 0) {
      return parsed.message;
    }
  } catch {
    // No es un cuerpo JSON de error
  }
  return null;
}

async function solicitarBlob(
  url: string,
  params: Record<string, string | undefined> | undefined,
  mimeFallback: string,
  errorFallback: string
): Promise<Blob> {
  try {
    const res: unknown = await apiClient.get(url, {
      params,
      responseType: 'blob',
    });
    if (res instanceof Blob) {
      if (res.type.includes('application/json')) {
        const msg = await leerErrorDesdeBlob(res);
        throw new Error(msg ?? errorFallback);
      }
      return res;
    }
    if (typeof res === 'string') {
      return new Blob([res], { type: mimeFallback });
    }
    if (res && typeof res === 'object' && 'error' in res) {
      const msg = (res as { error?: unknown }).error;
      throw new Error(typeof msg === 'string' && msg ? msg : errorFallback);
    }
    throw new Error(errorFallback);
  } catch (err: unknown) {
    const errObj = err as { response?: { data?: unknown } };
    if (errObj?.response?.data instanceof Blob) {
      const msg = await leerErrorDesdeBlob(errObj.response.data);
      if (msg) {
        throw new Error(msg);
      }
    }
    if (err instanceof Error) {
      throw err;
    }
    throw new Error(errorFallback);
  }
}

/**
 * Dispara la descarga de un Blob en el navegador y libera el Object URL inmediatamente.
 */
export function descargarArchivoBlob(blob: Blob, nombreArchivo: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nombreArchivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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

  // --- Fase 4: Cartera CxC/CxP, Plantillas, Asientos Bancarios, Cheques y Alertas ---

  async sugerirDocumentosCartera(
    empresaId: string,
    extractoLineaId: string
  ): Promise<SugerenciaDocumentoCarteraV2[]> {
    const res = await apiClient.get<RespuestaApi<SugerenciaDocumentoCarteraV2[]>>(
      `${baseUrl(empresaId)}/cartera/sugerencias/${extractoLineaId}`
    );
    return extraerData<SugerenciaDocumentoCarteraV2[]>(res);
  },

  async aplicarLineaCartera(
    empresaId: string,
    payload: AplicarLineaCarteraInput
  ): Promise<ResultadoAplicarCarteraV2> {
    const res = await apiClient.post<RespuestaApi<ResultadoAplicarCarteraV2>>(
      `${baseUrl(empresaId)}/cartera/aplicar`,
      payload
    );
    return extraerData<ResultadoAplicarCarteraV2>(res);
  },

  async listarPlantillasAsiento(empresaId: string): Promise<PlantillaAsientoV2[]> {
    const res = await apiClient.get<RespuestaApi<PlantillaAsientoV2[]>>(
      `${baseUrl(empresaId)}/plantillas-asiento`
    );
    return extraerData<PlantillaAsientoV2[]>(res);
  },

  async crearPlantillaAsiento(
    empresaId: string,
    payload: CrearPlantillaAsientoInput
  ): Promise<PlantillaAsientoV2> {
    const res = await apiClient.post<RespuestaApi<PlantillaAsientoV2>>(
      `${baseUrl(empresaId)}/plantillas-asiento`,
      payload
    );
    return extraerData<PlantillaAsientoV2>(res);
  },

  async actualizarPlantillaAsiento(
    empresaId: string,
    plantillaId: string,
    payload: ActualizarPlantillaAsientoInput
  ): Promise<PlantillaAsientoV2> {
    const res = await apiClient.put<RespuestaApi<PlantillaAsientoV2>>(
      `${baseUrl(empresaId)}/plantillas-asiento/${plantillaId}`,
      payload
    );
    return extraerData<PlantillaAsientoV2>(res);
  },

  async eliminarPlantillaAsiento(
    empresaId: string,
    plantillaId: string
  ): Promise<{ eliminado: boolean; id: string } | void> {
    const res = await apiClient.delete<RespuestaApi<{ eliminado: boolean; id: string }>>(
      `${baseUrl(empresaId)}/plantillas-asiento/${plantillaId}`
    );
    return extraerDataOpcional<{ eliminado: boolean; id: string }>(res);
  },

  async previsualizarAsientoLinea(
    empresaId: string,
    payload: PrevisualizarAsientoLineaInput
  ): Promise<PreviewAsientoConciliacionV2> {
    const res = await apiClient.post<RespuestaApi<PreviewAsientoConciliacionV2>>(
      `${baseUrl(empresaId)}/asientos/previsualizar`,
      payload
    );
    return extraerData<PreviewAsientoConciliacionV2>(res);
  },

  async generarAsientoLinea(
    empresaId: string,
    payload: GenerarAsientoLineaInput
  ): Promise<ResultadoGenerarAsientoLineaV2> {
    const res = await apiClient.post<RespuestaApi<ResultadoGenerarAsientoLineaV2>>(
      `${baseUrl(empresaId)}/asientos/generar`,
      payload
    );
    return extraerData<ResultadoGenerarAsientoLineaV2>(res);
  },

  async listarCheques(
    empresaId: string,
    params?: { cuentaFinancieraId?: string; estado?: EstadoChequeBancarioV2 }
  ): Promise<ChequeBancarioV2[]> {
    const res = await apiClient.get<RespuestaApi<ChequeBancarioV2[]>>(
      `${baseUrl(empresaId)}/cheques`,
      { params }
    );
    return extraerData<ChequeBancarioV2[]>(res);
  },

  async registrarCheque(
    empresaId: string,
    payload: CrearChequeBancarioInput
  ): Promise<ChequeBancarioV2> {
    const res = await apiClient.post<RespuestaApi<ChequeBancarioV2>>(
      `${baseUrl(empresaId)}/cheques`,
      payload
    );
    return extraerData<ChequeBancarioV2>(res);
  },

  async actualizarEstadoCheque(
    empresaId: string,
    chequeId: string,
    payload: ActualizarEstadoChequeInput
  ): Promise<ChequeBancarioV2> {
    const res = await apiClient.put<RespuestaApi<ChequeBancarioV2>>(
      `${baseUrl(empresaId)}/cheques/${chequeId}/estado`,
      payload
    );
    return extraerData<ChequeBancarioV2>(res);
  },

  async obtenerAlertasControl(
    empresaId: string,
    params: { cuentaFinancieraId: string; periodo: string }
  ): Promise<ResumenAlertasControlV2> {
    const res = await apiClient.get<RespuestaApi<ResumenAlertasControlV2>>(
      `${baseUrl(empresaId)}/alertas-control`,
      { params }
    );
    return extraerData<ResumenAlertasControlV2>(res);
  },

  // --- Fase 6: Historial inmutable de cierres, reporte oficial y PLE 1.2 (010200) ---

  async listarHistorialCierres(
    empresaId: string,
    cuentaFinancieraId: string,
    periodo?: string
  ): Promise<HistorialCierreConciliacionV2[]> {
    const res = await apiClient.get<RespuestaApi<HistorialCierreConciliacionV2[]>>(
      `${baseUrl(empresaId)}/cierres/historial`,
      {
        params: {
          cuentaFinancieraId,
          ...(periodo ? { periodo } : {}),
        },
      }
    );
    return extraerData<HistorialCierreConciliacionV2[]>(res);
  },

  async obtenerReporteOficial(
    empresaId: string,
    params: { cuentaFinancieraId: string; periodo: string; fechaCorte?: string }
  ): Promise<ReporteConciliacionOficialV2> {
    const res = await apiClient.get<RespuestaApi<ReporteConciliacionOficialV2>>(
      `${baseUrl(empresaId)}/reporte/oficial`,
      {
        params: {
          cuentaFinancieraId: params.cuentaFinancieraId,
          periodo: params.periodo,
          ...(params.fechaCorte ? { fechaCorte: params.fechaCorte } : {}),
          formato: 'json',
        },
      }
    );
    return extraerData<ReporteConciliacionOficialV2>(res);
  },

  async descargarReporteOficialExcel(
    empresaId: string,
    params: { cuentaFinancieraId: string; periodo: string; fechaCorte?: string }
  ): Promise<Blob> {
    return solicitarBlob(
      `${baseUrl(empresaId)}/reporte/oficial`,
      {
        cuentaFinancieraId: params.cuentaFinancieraId,
        periodo: params.periodo,
        ...(params.fechaCorte ? { fechaCorte: params.fechaCorte } : {}),
        formato: 'xlsx',
      },
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'No se pudo descargar el reporte oficial en Excel.'
    );
  },

  async exportarPle010200Json(
    empresaId: string,
    params: { periodo: string; cuentaFinancieraId?: string }
  ): Promise<ResultadoPle010200V2> {
    const res = await apiClient.get<RespuestaApi<ResultadoPle010200V2>>(
      `${baseUrl(empresaId)}/ple-010200`,
      {
        params: {
          periodo: params.periodo,
          ...(params.cuentaFinancieraId ? { cuentaFinancieraId: params.cuentaFinancieraId } : {}),
          formato: 'json',
        },
      }
    );
    return extraerData<ResultadoPle010200V2>(res);
  },

  async descargarPle010200Txt(
    empresaId: string,
    params: { periodo: string; cuentaFinancieraId?: string }
  ): Promise<Blob> {
    return solicitarBlob(
      `${baseUrl(empresaId)}/ple-010200`,
      {
        periodo: params.periodo,
        ...(params.cuentaFinancieraId ? { cuentaFinancieraId: params.cuentaFinancieraId } : {}),
        formato: 'txt',
      },
      'text/plain;charset=utf-8',
      'No se pudo descargar el archivo PLE 1.2 (010200).'
    );
  },
};
