import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  sireApi, 
  SunatConexionEstado, 
  SireConciliacionResumen, 
  ReglaProveedorSire 
} from '../api/sireApi';

// Hook de Conexión SUNAT SIRE
export function useSireConexionEstado(empresaId: string) {
  return useQuery({
    queryKey: ['sireConexionEstado', empresaId],
    queryFn: async () => {
      const data = await sireApi.obtenerEstadoConexion(empresaId);
      return data || { configurado: false, estado: 'SIN_CONFIGURAR', modoSimulado: true };
    },
    enabled: Boolean(empresaId)
  });
}

export function useGuardarConexionSire(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: any) => sireApi.guardarConexion(empresaId, datos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sireConexionEstado', empresaId] });
    }
  });
}

export function useValidarConexionSire(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => sireApi.validarConexion(empresaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sireConexionEstado', empresaId] });
    }
  });
}

// Hook de Conciliación SIRE
export function useSireConciliacion(empresaId: string, tipo: 'COMPRAS' | 'VENTAS', periodo: string, tolerancia?: number) {
  return useQuery({
    queryKey: ['sireConciliacion', empresaId, tipo, periodo, tolerancia],
    queryFn: async () => {
      const data = await sireApi.obtenerConciliacion(empresaId, tipo, periodo, tolerancia);
      return data || {
        id: '',
        empresaId,
        tipo,
        periodo,
        fechaConciliacion: new Date().toISOString(),
        totalCoinciden: 0,
        totalSoloSistema: 0,
        totalSoloSunat: 0,
        totalDiferencias: 0,
        lineas: []
      };
    },
    enabled: Boolean(empresaId && periodo)
  });
}

export function useDescargarPropuestaSire(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tipo, periodo }: { tipo: 'COMPRAS' | 'VENTAS'; periodo: string }) =>
      sireApi.descargarPropuesta(empresaId, tipo, periodo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sireConciliacion', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['sireHistorial', empresaId] });
    }
  });
}

export function useSolicitarTicketSire(empresaId: string) {
  return useMutation({
    mutationFn: ({ tipo, periodo }: { tipo: 'COMPRAS' | 'VENTAS'; periodo: string }) =>
      sireApi.solicitarTicket(empresaId, tipo, periodo)
  });
}

export function useConsultarTicketSire(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tipo, periodo, numTicket }: { tipo: 'COMPRAS' | 'VENTAS'; periodo: string; numTicket: string }) =>
      sireApi.consultarTicket(empresaId, tipo, periodo, numTicket),
    onSuccess: (data) => {
      if (data.estado === '03') {
        queryClient.invalidateQueries({ queryKey: ['sireConciliacion', empresaId] });
        queryClient.invalidateQueries({ queryKey: ['sireHistorial', empresaId] });
      }
    }
  });
}

export function useAplicarConciliacionSire(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accion, lineasIds, motivo }: { accion: 'ACEPTAR' | 'OBSERVAR' | 'IGNORAR'; lineasIds: string[]; motivo?: string }) =>
      sireApi.aplicarConciliacion(empresaId, accion, lineasIds, motivo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sireConciliacion', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['compras', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['ventas', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['asientos', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['cxp', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['cxc', empresaId] });
    }
  });
}

export function useGenerarAsientoAjusteSire(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineaId, cuentaAjuste }: { lineaId: string; cuentaAjuste?: string }) =>
      sireApi.generarAsientoAjuste(empresaId, lineaId, cuentaAjuste),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sireConciliacion', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['asientos', empresaId] });
    }
  });
}

export function useRevertirLineaSire(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineaId, motivo }: { lineaId: string; motivo: string }) =>
      sireApi.revertirLinea(empresaId, lineaId, motivo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sireConciliacion', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['compras', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['asientos', empresaId] });
    }
  });
}

export function useReglasProveedorSire(empresaId: string) {
  return useQuery({
    queryKey: ['sireReglasProveedor', empresaId],
    queryFn: () => sireApi.listarReglasProveedor(empresaId),
    enabled: Boolean(empresaId)
  });
}

export function useGuardarReglaProveedorSire(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (regla: any) => sireApi.guardarReglaProveedor(empresaId, regla),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sireReglasProveedor', empresaId] });
    }
  });
}

export function useAceptarPropuestaOficialSire(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tipo, periodo }: { tipo: 'COMPRAS' | 'VENTAS'; periodo: string }) =>
      sireApi.aceptarPropuestaOficial(empresaId, tipo, periodo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sireConciliacion', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['sireHistorial', empresaId] });
    }
  });
}

export function useReemplazarPropuestaOficialSire(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { tipo: 'COMPRAS' | 'VENTAS'; periodo: string; comprobantesReemplazo?: any[]; archivoContenidoTxt?: string }) =>
      sireApi.reemplazarPropuestaOficial(empresaId, params.tipo, params.periodo, params.comprobantesReemplazo, params.archivoContenidoTxt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sireConciliacion', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['sireHistorial', empresaId] });
    }
  });
}

export function useRegistrarAjustePosteriorSire(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { tipo?: string; periodoAjuste: string; periodoAfectado: string; ajusteData?: any; comprobante?: any }) =>
      sireApi.registrarAjustePosterior(empresaId, params.periodoAjuste, params.periodoAfectado, params.ajusteData || params.comprobante),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sireHistorial', empresaId] });
    }
  });
}

export function useHistorialSire(empresaId: string, periodo?: string) {
  return useQuery({
    queryKey: ['sireHistorial', empresaId, periodo],
    queryFn: () => sireApi.listarHistorial(empresaId, periodo),
    enabled: Boolean(empresaId)
  });
}

// Comprobantes XML
export function useComprobantesXmlList(empresaId: string) {
  return useQuery({
    queryKey: ['comprobantesXml', empresaId],
    queryFn: () => sireApi.listarComprobantesXml(empresaId),
    enabled: Boolean(empresaId)
  });
}

export function useImportarComprobantesXml(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archivos: Array<{ nombre: string; contenidoBase64: string }>) =>
      sireApi.importarXml(empresaId, archivos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comprobantesXml', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['compras', empresaId] });
    }
  });
}

// Compatibilidad retroactiva
export const useSunatConexionEstado = useSireConexionEstado;
export const useGuardarConexionSunat = useGuardarConexionSire;
export const useValidarConexionSunat = useValidarConexionSire;

