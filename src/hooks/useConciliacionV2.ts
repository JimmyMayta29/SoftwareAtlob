import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  conciliacionV2Api,
  type ActualizarConfigConciliacionV2Input,
  type CerrarConciliacionV2Input,
  type ConciliarPartidaV2Input,
  type DesconciliarPartidaV2Input,
  type ReabrirConciliacionV2Input,
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
