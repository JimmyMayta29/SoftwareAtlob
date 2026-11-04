import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pleApi, PleLibroConfig, PleExportacion, PleValidacionResult } from '../api/pleApi';

export function usePleLibros(empresaId: string) {
  return useQuery({
    queryKey: ['pleLibros', empresaId],
    queryFn: () => pleApi.listarLibros(empresaId),
    enabled: Boolean(empresaId)
  });
}

export const usePleLibrosCatalogo = usePleLibros;
export type { PleLibroConfig, PleExportacion, PleValidacionResult };

export function usePlePrevalidar(empresaId: string, periodo: string, codigoLibro: string) {
  return useQuery({
    queryKey: ['plePrevalidar', empresaId, periodo, codigoLibro],
    queryFn: () => pleApi.prevalidar(empresaId, periodo, codigoLibro),
    enabled: Boolean(empresaId && periodo && codigoLibro)
  });
}

export function useExportarPle(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ periodo, codigoLibro, ruc, sinMovimiento, esOficial, moneda }: { periodo: string; codigoLibro: string; ruc?: string; sinMovimiento?: boolean; esOficial?: boolean; moneda?: 'PEN' | 'USD' }) =>
      pleApi.exportar(empresaId, periodo, codigoLibro, ruc, sinMovimiento, esOficial, moneda),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pleExportaciones', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['pleHistorial', empresaId] });
    }
  });
}

export function useExportarPleJob(empresaId: string) {
  return useMutation({
    mutationFn: ({ periodo, codigoLibro, ruc }: { periodo: string; codigoLibro: string; ruc?: string }) =>
      pleApi.exportarJob(empresaId, periodo, codigoLibro, ruc)
  });
}

export function usePleExportacion(id: string) {
  return useQuery({
    queryKey: ['pleExportacion', id],
    queryFn: () => pleApi.obtenerExportacion(id),
    enabled: Boolean(id)
  });
}

export function usePleExportaciones(empresaId: string) {
  return useQuery({
    queryKey: ['pleExportaciones', empresaId],
    queryFn: () => pleApi.listarExportaciones(empresaId),
    enabled: Boolean(empresaId)
  });
}

export function useValidarTxtPle() {
  return useMutation({
    mutationFn: ({ contenidoTxt, codigoLibro, nombreArchivo }: { contenidoTxt: string; codigoLibro?: string; nombreArchivo?: string }) =>
      pleApi.validarTxt(contenidoTxt, codigoLibro, nombreArchivo)
  });
}

export function useHistorialPle(empresaId: string, periodo?: string) {
  return useQuery({
    queryKey: ['pleHistorial', empresaId, periodo],
    queryFn: () => pleApi.listarHistorial(empresaId, periodo),
    enabled: Boolean(empresaId)
  });
}

