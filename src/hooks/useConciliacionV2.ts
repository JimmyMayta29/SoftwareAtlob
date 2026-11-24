import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  conciliacionV2Api,
  type ActualizarConfigConciliacionV2Input,
  type ActualizarPerfilBancoInput,
  type ActualizarReglaClasificacionInput,
  type CerrarConciliacionV2Input,
  type ConciliarPartidaV2Input,
  type ConfirmarImportacionInput,
  type CrearPerfilBancoInput,
  type CrearReglaClasificacionInput,
  type DesconciliarPartidaV2Input,
  type PrevisualizarImportacionInput,
  type ReabrirConciliacionV2Input,
  type RevertirImportacionInput,
  type VincularCuentaContableInput,
} from '../api/conciliacionV2Api';
import { useToast } from '../context/ToastContext';

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
