import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  conciliacionV2Api,
  type AceptarSugerenciasInput,
  type ActualizarConfigConciliacionV2Input,
  type ActualizarEstadoChequeInput,
  type ActualizarPerfilBancoInput,
  type ActualizarPlantillaAsientoInput,
  type ActualizarReglaAprendidaInput,
  type ActualizarReglaClasificacionInput,
  type AplicarLineaCarteraInput,
  type CerrarConciliacionV2Input,
  type ConciliarManualGrupoInput,
  type ConciliarPartidaV2Input,
  type ConfirmarImportacionInput,
  type CrearChequeBancarioInput,
  type CrearPerfilBancoInput,
  type CrearPlantillaAsientoInput,
  type CrearReglaAprendidaInput,
  type CrearReglaClasificacionInput,
  type DesconciliarGrupoInput,
  type DesconciliarPartidaV2Input,
  type EjecutarMatchingInput,
  type EstadoChequeBancarioV2,
  type EstadoGrupoConciliacionV2,
  type GenerarAsientoLineaInput,
  type PrevisualizarAsientoLineaInput,
  type PrevisualizarImportacionInput,
  type ReabrirConciliacionV2Input,
  type RechazarSugerenciaInput,
  type RevertirImportacionInput,
  type VincularCuentaContableInput,
} from '../api/conciliacionV2Api';
import { useToast } from '../context/ToastContext';

export type {
  AceptarSugerenciasInput,
  ActualizarEstadoChequeInput,
  ActualizarPlantillaAsientoInput,
  ActualizarReglaAprendidaInput,
  AlertaBancarizacionV2,
  AlertaChequeAntiguedadV2,
  AlertaItfV2,
  AplicarLineaCarteraInput,
  ChequeBancarioV2,
  ConciliarManualGrupoInput,
  CrearChequeBancarioInput,
  CrearPlantillaAsientoInput,
  CrearReglaAprendidaInput,
  DesconciliarGrupoInput,
  EjecutarMatchingInput,
  EstadoChequeBancarioV2,
  EstadoGrupoConciliacionV2,
  GenerarAsientoLineaInput,
  GrupoConciliacionV2,
  HistorialDesconciliacionV2,
  ItemConciliacionV2,
  LineaAsientoPreviewV2,
  OrigenPartidaLibroV2,
  PlantillaAsientoV2,
  PreviewAsientoConciliacionV2,
  PrevisualizarAsientoLineaInput,
  RechazarSugerenciaInput,
  ReglaAprendidaV2,
  ResultadoAplicarCarteraV2,
  ResultadoEjecucionMatchingV2,
  ResultadoGenerarAsientoLineaV2,
  ResumenAlertasControlV2,
  SugerenciaDocumentoCarteraV2,
  TipoDocumentoCarteraV2,
  TipoMatchV2,
  TipoOperacionCarteraEspecialV2,
  TipoOperacionPlantillaV2,
} from '../../server/types/conciliacionV2';

export const conciliacionV2Keys = {
  all: (empresaId: string | null | undefined) => ['conciliacionV2', empresaId] as const,
  config: (empresaId: string | null | undefined) => ['conciliacionV2', 'config', empresaId] as const,
  cuentas: (empresaId: string | null | undefined) => ['conciliacionV2', 'cuentas', empresaId] as const,
  cuentasContables: (empresaId: string | null | undefined) =>
    ['conciliacionV2', 'cuentasContables', empresaId] as const,
  resumen: (
    empresaId: string | null | undefined,
    cuentaFinancieraId: string | null | undefined,
    periodo: string
  ) => ['conciliacionV2', 'resumen', empresaId, cuentaFinancieraId, periodo] as const,
  perfiles: (empresaId: string | null | undefined) =>
    ['conciliacionV2', 'perfiles', empresaId] as const,
  reglas: (empresaId: string | null | undefined) =>
    ['conciliacionV2', 'reglas', empresaId] as const,
  importaciones: (
    empresaId: string | null | undefined,
    cuentaFinancieraId?: string | null
  ) => ['conciliacionV2', 'importaciones', empresaId, cuentaFinancieraId ?? 'ALL'] as const,
  grupos: (
    empresaId: string | null | undefined,
    cuentaFinancieraId: string | null | undefined,
    periodo: string,
    estado?: EstadoGrupoConciliacionV2
  ) => ['conciliacionV2', 'grupos', empresaId, cuentaFinancieraId, periodo, estado ?? 'ALL'] as const,
  historialDesconciliacion: (
    empresaId: string | null | undefined,
    cuentaFinancieraId?: string | null,
    periodo?: string | null
  ) =>
    [
      'conciliacionV2',
      'historial-desconciliacion',
      empresaId,
      cuentaFinancieraId ?? 'ALL',
      periodo ?? 'ALL',
    ] as const,
  reglasAprendidas: (empresaId: string | null | undefined) =>
    ['conciliacionV2', 'reglas-aprendidas', empresaId] as const,
  carteraSugerencias: (
    empresaId: string | null | undefined,
    extractoLineaId: string | null | undefined
  ) => ['conciliacionV2', 'cartera-sugerencias', empresaId, extractoLineaId] as const,
  plantillasAsiento: (empresaId: string | null | undefined) =>
    ['conciliacionV2', 'plantillas-asiento', empresaId] as const,
  cheques: (
    empresaId: string | null | undefined,
    cuentaFinancieraId?: string | null,
    estado?: EstadoChequeBancarioV2 | ''
  ) =>
    ['conciliacionV2', 'cheques', empresaId, cuentaFinancieraId ?? 'ALL', estado || 'ALL'] as const,
  alertasControl: (
    empresaId: string | null | undefined,
    cuentaFinancieraId: string | null | undefined,
    periodo: string
  ) => ['conciliacionV2', 'alertas-control', empresaId, cuentaFinancieraId, periodo] as const,
};

export function extraerMensajeErrorConciliacion(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  return fallback;
}

export function useConciliacionV2Config(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: conciliacionV2Keys.config(empresaId),
    queryFn: () => conciliacionV2Api.obtenerConfig(empresaId!),
    enabled: Boolean(empresaId),
    retry: false,
  });
}

export function useActualizarConfigConciliacionV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (payload: ActualizarConfigConciliacionV2Input) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.actualizarConfig(empresaId, payload);
    },
    onSuccess: (configActualizada) => {
      queryClient.setQueryData(conciliacionV2Keys.config(empresaId), configActualizada);
      void queryClient.invalidateQueries({ queryKey: conciliacionV2Keys.config(empresaId) });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'resumen', empresaId] });
      toast.success('Configuración de Conciliación Bancaria V2 guardada correctamente.', 'Configuración V2');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo actualizar la configuración de Conciliación V2.'),
        'Error de Configuración'
      );
    },
  });
}

export function useCuentasBancariasV2(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: conciliacionV2Keys.cuentas(empresaId),
    queryFn: () => conciliacionV2Api.listarCuentas(empresaId!),
    enabled: Boolean(empresaId),
    retry: false,
  });
}

export function useCuentasContablesDisponiblesV2(
  empresaId: string | null | undefined,
  enabled = true
) {
  return useQuery({
    queryKey: conciliacionV2Keys.cuentasContables(empresaId),
    queryFn: () => conciliacionV2Api.listarCuentasContablesDisponibles(empresaId!),
    enabled: Boolean(empresaId) && enabled,
    retry: false,
  });
}

export function useVincularCuentaContableV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({
      cuentaId,
      payload,
    }: {
      cuentaId: string;
      payload: VincularCuentaContableInput;
    }) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.vincularCuentaContable(empresaId, cuentaId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conciliacionV2Keys.cuentas(empresaId) });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'resumen', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['cuentasFinancieras', empresaId] });
      toast.success('Cuenta bancaria vinculada al Plan Contable correctamente.', 'Vinculación Contable');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo vincular la cuenta contable.'),
        'Error al Vincular'
      );
    },
  });
}

export function useResumenConciliacionV2(
  empresaId: string | null | undefined,
  cuentaFinancieraId: string | null | undefined,
  periodo: string
) {
  return useQuery({
    queryKey: conciliacionV2Keys.resumen(empresaId, cuentaFinancieraId, periodo),
    queryFn: () => conciliacionV2Api.obtenerResumen(empresaId!, cuentaFinancieraId!, periodo),
    enabled: Boolean(empresaId && cuentaFinancieraId && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)),
    retry: false,
  });
}

export function useConciliarPartidaV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (payload: ConciliarPartidaV2Input) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.conciliarPartida(empresaId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'resumen', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'alertas-control', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['movimientosTesoreria', empresaId] });
      toast.success('Partida conciliada correctamente.', 'Conciliación V2');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo conciliar la partida seleccionada.'),
        'Error al Conciliar'
      );
    },
  });
}

export function useDesconciliarPartidaV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (payload: DesconciliarPartidaV2Input) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.desconciliarPartida(empresaId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'resumen', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'grupos', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'alertas-control', empresaId] });
      void queryClient.invalidateQueries({
        queryKey: ['conciliacionV2', 'historial-desconciliacion', empresaId],
      });
      void queryClient.invalidateQueries({ queryKey: ['movimientosTesoreria', empresaId] });
      toast.success('Partida desconciliada correctamente.', 'Conciliación V2');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo desconciliar la partida seleccionada.'),
        'Error al Desconciliar'
      );
    },
  });
}

export function useCerrarConciliacionV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (payload: CerrarConciliacionV2Input) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.cerrarConciliacion(empresaId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'resumen', empresaId] });
      toast.success('Conciliación bancaria del periodo cerrada exitosamente.', 'Cierre de Conciliación');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo cerrar la conciliación bancaria.'),
        'Error al Cerrar'
      );
    },
  });
}

export function useReabrirConciliacionV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (payload: ReabrirConciliacionV2Input) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.reabrirConciliacion(empresaId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'resumen', empresaId] });
      toast.success('Conciliación bancaria reabierta exitosamente.', 'Reapertura de Conciliación');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo reabrir la conciliación bancaria.'),
        'Error al Reabrir'
      );
    },
  });
}

// ============================================================================
// FASE 2: PERFILES BANCARIOS, REGLAS DE CLASIFICACIÓN E IMPORTACIÓN EXTRACTOS
// ============================================================================

export function usePerfilesBancoV2(empresaId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: conciliacionV2Keys.perfiles(empresaId),
    queryFn: () => conciliacionV2Api.listarPerfiles(empresaId!),
    enabled: Boolean(empresaId) && enabled,
    retry: false,
  });
}

export function useCrearPerfilBancoV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (payload: CrearPerfilBancoInput) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.crearPerfil(empresaId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conciliacionV2Keys.perfiles(empresaId) });
      toast.success('Perfil bancario personalizado creado correctamente.', 'Perfiles Bancarios');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo crear el perfil bancario.'),
        'Error en Perfil Bancario'
      );
    },
  });
}

export function useActualizarPerfilBancoV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({
      perfilId,
      payload,
    }: {
      perfilId: string;
      payload: ActualizarPerfilBancoInput;
    }) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.actualizarPerfil(empresaId, perfilId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conciliacionV2Keys.perfiles(empresaId) });
      toast.success('Perfil bancario actualizado correctamente.', 'Perfiles Bancarios');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo actualizar el perfil bancario.'),
        'Error en Perfil Bancario'
      );
    },
  });
}

export function useEliminarPerfilBancoV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (perfilId: string) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.eliminarPerfil(empresaId, perfilId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conciliacionV2Keys.perfiles(empresaId) });
      toast.success('Perfil bancario eliminado.', 'Perfiles Bancarios');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo eliminar el perfil bancario.'),
        'Error al Eliminar Perfil'
      );
    },
  });
}

export function useReglasClasificacionV2(empresaId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: conciliacionV2Keys.reglas(empresaId),
    queryFn: () => conciliacionV2Api.listarReglasClasificacion(empresaId!),
    enabled: Boolean(empresaId) && enabled,
    retry: false,
  });
}

export function useCrearReglaClasificacionV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (payload: CrearReglaClasificacionInput) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.crearReglaClasificacion(empresaId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conciliacionV2Keys.reglas(empresaId) });
      toast.success('Regla de clasificación creada correctamente.', 'Reglas de Clasificación');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo crear la regla de clasificación.'),
        'Error en Regla'
      );
    },
  });
}

export function useActualizarReglaClasificacionV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({
      reglaId,
      payload,
    }: {
      reglaId: string;
      payload: ActualizarReglaClasificacionInput;
    }) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.actualizarReglaClasificacion(empresaId, reglaId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conciliacionV2Keys.reglas(empresaId) });
      toast.success('Regla de clasificación actualizada correctamente.', 'Reglas de Clasificación');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo actualizar la regla de clasificación.'),
        'Error en Regla'
      );
    },
  });
}

export function useEliminarReglaClasificacionV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (reglaId: string) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.eliminarReglaClasificacion(empresaId, reglaId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conciliacionV2Keys.reglas(empresaId) });
      toast.success('Regla de clasificación eliminada.', 'Reglas de Clasificación');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo eliminar la regla de clasificación.'),
        'Error al Eliminar Regla'
      );
    },
  });
}

export function useHistorialImportacionesV2(
  empresaId: string | null | undefined,
  cuentaFinancieraId?: string | null,
  enabled = true
) {
  return useQuery({
    queryKey: conciliacionV2Keys.importaciones(empresaId, cuentaFinancieraId),
    queryFn: () =>
      conciliacionV2Api.listarImportaciones(empresaId!, cuentaFinancieraId ?? undefined),
    enabled: Boolean(empresaId) && enabled,
    retry: false,
  });
}

export function usePrevisualizarImportacionV2(empresaId: string | null | undefined) {
  const toast = useToast();

  return useMutation({
    mutationFn: (payload: PrevisualizarImportacionInput) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.previsualizarImportacion(empresaId, payload);
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo previsualizar el archivo de extracto.'),
        'Error en Previsualización'
      );
    },
  });
}

export function useConfirmarImportacionV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (payload: ConfirmarImportacionInput) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.confirmarImportacion(empresaId, payload);
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'resumen', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'importaciones', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'alertas-control', empresaId] });
      void queryClient.invalidateQueries({ queryKey: conciliacionV2Keys.cuentas(empresaId) });
      if (res.yaExistiaSinNuevas) {
        toast.info(
          `El extracto ya había sido importado (${res.filasDuplicadas} líneas omitidas por duplicidad).`,
          'Importación de Extracto'
        );
      } else {
        toast.success(
          `Extracto importado: ${res.filasNuevas} líneas nuevas (${res.filasDuplicadas} duplicadas omitidas).`,
          'Importación Confirmada'
        );
      }
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo confirmar la importación del extracto.'),
        'Error al Confirmar Importación'
      );
    },
  });
}

export function useRevertirImportacionV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({
      importId,
      payload,
    }: {
      importId: string;
      payload: RevertirImportacionInput;
    }) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.revertirImportacion(empresaId, importId, payload);
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'resumen', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'importaciones', empresaId] });
      toast.success(
        `Lote revertido correctamente (${res.filasEliminadas} líneas eliminadas).`,
        'Reversión de Importación'
      );
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo revertir el lote de importación.'),
        'Error al Revertir'
      );
    },
  });
}

// ============================================================================
// FASE 3: MOTOR DE MATCHING, GRUPOS, HISTORIAL Y REGLAS APRENDIDAS
// ============================================================================

export function useGruposMatching(
  empresaId: string | null | undefined,
  cuentaFinancieraId: string | null | undefined,
  periodo: string,
  estado?: EstadoGrupoConciliacionV2,
  enabled = true
) {
  return useQuery({
    queryKey: conciliacionV2Keys.grupos(empresaId, cuentaFinancieraId, periodo, estado),
    queryFn: () =>
      conciliacionV2Api.listarGruposMatching(empresaId!, {
        cuentaFinancieraId: cuentaFinancieraId!,
        periodo,
        ...(estado ? { estado } : {}),
      }),
    enabled:
      enabled &&
      Boolean(empresaId && cuentaFinancieraId && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)),
    retry: false,
  });
}

export function useEjecutarMatching(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (payload: EjecutarMatchingInput) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.ejecutarMatching(empresaId, payload);
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'resumen', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'grupos', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'alertas-control', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['movimientosTesoreria', empresaId] });
      toast.success(
        `Matching completado en ${res.duracionMs} ms: ${res.autoConciliados} auto-conciliados y ${res.sugeridos} sugeridos.`,
        'Matching Automático'
      );
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo ejecutar el matching automático.'),
        'Error en Matching Automático'
      );
    },
  });
}

export function useAceptarSugerencias(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (payload: AceptarSugerenciasInput) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.aceptarSugerencias(empresaId, payload);
    },
    onSuccess: (grupos) => {
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'resumen', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'grupos', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'alertas-control', empresaId] });
      void queryClient.invalidateQueries({
        queryKey: conciliacionV2Keys.reglasAprendidas(empresaId),
      });
      void queryClient.invalidateQueries({ queryKey: ['movimientosTesoreria', empresaId] });
      toast.success(
        grupos.length === 1
          ? 'Sugerencia aceptada y conciliada correctamente.'
          : `${grupos.length} sugerencias aceptadas y conciliadas.`,
        'Sugerencias de Matching'
      );
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudieron aceptar las sugerencias.'),
        'Error al Aceptar Sugerencias'
      );
    },
  });
}

export function useRechazarSugerencia(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({
      grupoId,
      payload,
    }: {
      grupoId: string;
      payload?: RechazarSugerenciaInput;
    }) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.rechazarSugerencia(empresaId, grupoId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'resumen', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'grupos', empresaId] });
      toast.info('Sugerencia rechazada. Las partidas quedan pendientes.', 'Sugerencia Rechazada');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo rechazar la sugerencia.'),
        'Error al Rechazar Sugerencia'
      );
    },
  });
}

export function useConciliarManualGrupo(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (payload: ConciliarManualGrupoInput) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.conciliarManualGrupo(empresaId, payload);
    },
    onSuccess: (grupo) => {
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'resumen', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'grupos', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'alertas-control', empresaId] });
      void queryClient.invalidateQueries({
        queryKey: conciliacionV2Keys.reglasAprendidas(empresaId),
      });
      void queryClient.invalidateQueries({ queryKey: ['movimientosTesoreria', empresaId] });
      toast.success(
        `Grupo ${grupo.tipoMatch} conciliado manualmente.`,
        'Conciliación Manual'
      );
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo conciliar la selección.'),
        'Error en Conciliación Manual'
      );
    },
  });
}

export function useDesconciliarGrupo(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({
      grupoId,
      payload,
    }: {
      grupoId: string;
      payload: DesconciliarGrupoInput;
    }) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.desconciliarGrupo(empresaId, grupoId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'resumen', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'grupos', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'alertas-control', empresaId] });
      void queryClient.invalidateQueries({
        queryKey: ['conciliacionV2', 'historial-desconciliacion', empresaId],
      });
      void queryClient.invalidateQueries({ queryKey: ['movimientosTesoreria', empresaId] });
      toast.success('Grupo desconciliado y registrado en historial.', 'Desconciliación');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo desconciliar el grupo.'),
        'Error al Desconciliar'
      );
    },
  });
}

export function useHistorialDesconciliacion(
  empresaId: string | null | undefined,
  cuentaFinancieraId?: string | null,
  periodo?: string | null,
  enabled = true
) {
  return useQuery({
    queryKey: conciliacionV2Keys.historialDesconciliacion(
      empresaId,
      cuentaFinancieraId,
      periodo
    ),
    queryFn: () =>
      conciliacionV2Api.listarHistorialDesconciliacion(empresaId!, {
        ...(cuentaFinancieraId ? { cuentaFinancieraId } : {}),
        ...(periodo ? { periodo } : {}),
      }),
    enabled: Boolean(empresaId) && enabled,
    retry: false,
  });
}

export function useReglasAprendidas(empresaId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: conciliacionV2Keys.reglasAprendidas(empresaId),
    queryFn: () => conciliacionV2Api.listarReglasAprendidas(empresaId!),
    enabled: Boolean(empresaId) && enabled,
    retry: false,
  });
}

export function useCrearReglaAprendida(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (payload: CrearReglaAprendidaInput) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.crearReglaAprendida(empresaId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: conciliacionV2Keys.reglasAprendidas(empresaId),
      });
      toast.success('Regla aprendida registrada correctamente.', 'Reglas Aprendidas');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo crear la regla aprendida.'),
        'Error en Regla Aprendida'
      );
    },
  });
}

export function useActualizarReglaAprendida(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({
      reglaId,
      payload,
    }: {
      reglaId: string;
      payload: ActualizarReglaAprendidaInput;
    }) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.actualizarReglaAprendida(empresaId, reglaId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: conciliacionV2Keys.reglasAprendidas(empresaId),
      });
      toast.success('Regla aprendida actualizada.', 'Reglas Aprendidas');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo actualizar la regla aprendida.'),
        'Error en Regla Aprendida'
      );
    },
  });
}

export function useEliminarReglaAprendida(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (reglaId: string) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.eliminarReglaAprendida(empresaId, reglaId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: conciliacionV2Keys.reglasAprendidas(empresaId),
      });
      toast.success('Regla aprendida eliminada.', 'Reglas Aprendidas');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo eliminar la regla aprendida.'),
        'Error al Eliminar Regla'
      );
    },
  });
}

// ============================================================================
// FASE 4: CARTERA CXC/CXP, PLANTILLAS, ASIENTOS BANCARIOS, CHEQUES Y ALERTAS
// ============================================================================

export function useSugerenciasCarteraV2(
  empresaId: string | null | undefined,
  extractoLineaId: string | null | undefined,
  enabled = true
) {
  return useQuery({
    queryKey: conciliacionV2Keys.carteraSugerencias(empresaId, extractoLineaId),
    queryFn: () => conciliacionV2Api.sugerirDocumentosCartera(empresaId!, extractoLineaId!),
    enabled: Boolean(empresaId && extractoLineaId) && enabled,
    retry: false,
  });
}

export function useAplicarLineaCarteraV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (payload: AplicarLineaCarteraInput) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.aplicarLineaCartera(empresaId, payload);
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'resumen', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'grupos', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'cheques', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'alertas-control', empresaId] });
      void queryClient.invalidateQueries({
        queryKey: ['conciliacionV2', 'cartera-sugerencias', empresaId],
      });
      void queryClient.invalidateQueries({ queryKey: ['movimientosTesoreria', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['cuentasPorCobrar', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['cuentasPorPagar', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['asientos', empresaId] });

      const docsCount = res.documentosActualizados.length;
      toast.success(
        docsCount > 0
          ? `Línea aplicada a ${docsCount} documento(s) y conciliada correctamente.`
          : 'Operación registrada en tesorería y conciliada correctamente.',
        'Aplicación a Cartera'
      );
      if (res.alertaBancarizacion) {
        toast.warning(res.alertaBancarizacion, 'Control Ley 28194');
      }
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo aplicar la línea bancaria a cartera.'),
        'Error al Aplicar Cartera'
      );
    },
  });
}

export function usePlantillasAsientoV2(empresaId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: conciliacionV2Keys.plantillasAsiento(empresaId),
    queryFn: () => conciliacionV2Api.listarPlantillasAsiento(empresaId!),
    enabled: Boolean(empresaId) && enabled,
    retry: false,
  });
}

export function useCrearPlantillaAsientoV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (payload: CrearPlantillaAsientoInput) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.crearPlantillaAsiento(empresaId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: conciliacionV2Keys.plantillasAsiento(empresaId),
      });
      toast.success('Plantilla de asiento creada correctamente.', 'Plantillas de Asiento');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo crear la plantilla de asiento.'),
        'Error en Plantilla'
      );
    },
  });
}

export function useActualizarPlantillaAsientoV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({
      plantillaId,
      payload,
    }: {
      plantillaId: string;
      payload: ActualizarPlantillaAsientoInput;
    }) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.actualizarPlantillaAsiento(empresaId, plantillaId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: conciliacionV2Keys.plantillasAsiento(empresaId),
      });
      toast.success('Plantilla de asiento actualizada.', 'Plantillas de Asiento');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo actualizar la plantilla de asiento.'),
        'Error en Plantilla'
      );
    },
  });
}

export function useEliminarPlantillaAsientoV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (plantillaId: string) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.eliminarPlantillaAsiento(empresaId, plantillaId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: conciliacionV2Keys.plantillasAsiento(empresaId),
      });
      toast.success('Plantilla de asiento eliminada.', 'Plantillas de Asiento');
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo eliminar la plantilla de asiento.'),
        'Error al Eliminar Plantilla'
      );
    },
  });
}

export function usePrevisualizarAsientoLineaV2(empresaId: string | null | undefined) {
  return useMutation({
    mutationFn: (payload: PrevisualizarAsientoLineaInput) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.previsualizarAsientoLinea(empresaId, payload);
    },
  });
}

export function useGenerarAsientoLineaV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (payload: GenerarAsientoLineaInput) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.generarAsientoLinea(empresaId, payload);
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'resumen', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'grupos', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'alertas-control', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['movimientosTesoreria', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['asientos', empresaId] });

      const refAsiento = res.asientoNumero || res.cuo || res.asientoId.slice(0, 8);
      toast.success(
        `Asiento ${refAsiento} generado y conciliado correctamente.`,
        'Asiento Bancario'
      );
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo contabilizar y conciliar la línea.'),
        'Error al Generar Asiento'
      );
    },
  });
}

export function useChequesV2(
  empresaId: string | null | undefined,
  cuentaFinancieraId?: string | null,
  estado?: EstadoChequeBancarioV2 | '',
  enabled = true
) {
  return useQuery({
    queryKey: conciliacionV2Keys.cheques(empresaId, cuentaFinancieraId, estado),
    queryFn: () =>
      conciliacionV2Api.listarCheques(empresaId!, {
        ...(cuentaFinancieraId ? { cuentaFinancieraId } : {}),
        ...(estado ? { estado } : {}),
      }),
    enabled: Boolean(empresaId) && enabled,
    retry: false,
  });
}

export function useRegistrarChequeV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (payload: CrearChequeBancarioInput) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.registrarCheque(empresaId, payload);
    },
    onSuccess: (cheque) => {
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'cheques', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'alertas-control', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'resumen', empresaId] });
      toast.success(
        `Cheque N° ${cheque.numeroCheque} registrado en estado ${cheque.estado}.`,
        'Gestión de Cheques'
      );
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo registrar el cheque bancario.'),
        'Error en Cheque'
      );
    },
  });
}

export function useActualizarEstadoChequeV2(empresaId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({
      chequeId,
      payload,
    }: {
      chequeId: string;
      payload: ActualizarEstadoChequeInput;
    }) => {
      if (!empresaId) {
        return Promise.reject(new Error('No hay una empresa activa seleccionada.'));
      }
      return conciliacionV2Api.actualizarEstadoCheque(empresaId, chequeId, payload);
    },
    onSuccess: (cheque) => {
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'cheques', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'alertas-control', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'resumen', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacionV2', 'grupos', empresaId] });
      void queryClient.invalidateQueries({ queryKey: ['movimientosTesoreria', empresaId] });
      toast.success(
        `Cheque N° ${cheque.numeroCheque} actualizado a ${cheque.estado}.`,
        'Gestión de Cheques'
      );
    },
    onError: (err) => {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo actualizar el estado del cheque.'),
        'Error al Actualizar Cheque'
      );
    },
  });
}

export function useAlertasControlV2(
  empresaId: string | null | undefined,
  cuentaFinancieraId: string | null | undefined,
  periodo: string,
  enabled = true
) {
  return useQuery({
    queryKey: conciliacionV2Keys.alertasControl(empresaId, cuentaFinancieraId, periodo),
    queryFn: () =>
      conciliacionV2Api.obtenerAlertasControl(empresaId!, {
        cuentaFinancieraId: cuentaFinancieraId!,
        periodo,
      }),
    enabled:
      enabled &&
      Boolean(empresaId && cuentaFinancieraId && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)),
    retry: false,
  });
}
