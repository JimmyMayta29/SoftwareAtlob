import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  tesoreriaPlanillaApi,
  CuentaFinancieraApi, 
  MovimientoTesoreriaApi, 
  ReciboHonorarioApi, 
  TrabajadorApi, 
  PlanillaApi 
} from '../api/tesoreriaPlanillaApi';

// Cuentas Financieras
export function useCuentasFinancieras(empresaId: string) {
  return useQuery({
    queryKey: ['cuentasFinancieras', empresaId],
    queryFn: async () => {
      const data = await tesoreriaPlanillaApi.listarCuentas(empresaId);
      return data || [];
    },
    enabled: Boolean(empresaId)
  });
}

export function useCrearCuentaFinanciera(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: any) => tesoreriaPlanillaApi.crearCuenta(empresaId, datos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cuentasFinancieras', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['flujoCaja', empresaId] });
    }
  });
}

// Movimientos de Tesorería
export function useMovimientosTesoreria(empresaId: string, params?: any) {
  return useQuery({
    queryKey: ['movimientosTesoreria', empresaId, params],
    queryFn: async () => {
      const data = await tesoreriaPlanillaApi.listarMovimientos(empresaId, params);
      return data || { items: [], total: 0 };
    },
    enabled: Boolean(empresaId)
  });
}

export function useRegistrarMovimientoTesoreria(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: any) => tesoreriaPlanillaApi.registrarMovimiento(empresaId, datos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimientosTesoreria', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['cuentasFinancieras', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['cuentasPorCobrar', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['cuentasPorPagar', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['flujoCaja', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['detracciones', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['asientos', empresaId] });
    }
  });
}

export function useAnularMovimientoTesoreria(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => 
      tesoreriaPlanillaApi.anularMovimiento(empresaId, id, motivo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimientosTesoreria', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['cuentasFinancieras', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['cuentasPorCobrar', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['cuentasPorPagar', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['flujoCaja', empresaId] });
    }
  });
}

// Transferencias
export function useRegistrarTransferencia(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: any) => tesoreriaPlanillaApi.registrarTransferencia(empresaId, datos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cuentasFinancieras', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['movimientosTesoreria', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['flujoCaja', empresaId] });
    }
  });
}

// Conciliación Bancaria
export function useConciliacionBancaria(empresaId: string, cuentaFinancieraId: string, periodoId: string, fechaCorte?: string) {
  return useQuery({
    queryKey: ['conciliacion', empresaId, cuentaFinancieraId, periodoId, fechaCorte],
    queryFn: async () => {
      const data = await tesoreriaPlanillaApi.obtenerConciliacion(empresaId, cuentaFinancieraId, periodoId, fechaCorte);
      return data || null;
    },
    enabled: Boolean(empresaId && cuentaFinancieraId)
  });
}

export function useImportarExtracto(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: any) => tesoreriaPlanillaApi.importarExtracto(empresaId, datos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conciliacion', empresaId] });
    }
  });
}

export function useConciliarPartida(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ extractoLineaId, movimientoId }: { extractoLineaId: string; movimientoId: string }) =>
      tesoreriaPlanillaApi.conciliarPartida(empresaId, extractoLineaId, movimientoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conciliacion', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['movimientosTesoreria', empresaId] });
    }
  });
}

export function useDesconciliarPartida(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (extractoLineaId: string) => tesoreriaPlanillaApi.desconciliarPartida(empresaId, extractoLineaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conciliacion', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['movimientosTesoreria', empresaId] });
    }
  });
}

export function useCerrarConciliacion(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cuentaFinancieraId, periodoId, fechaCorte }: any) =>
      tesoreriaPlanillaApi.cerrarConciliacion(empresaId, cuentaFinancieraId, periodoId, fechaCorte),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conciliacion', empresaId] });
    }
  });
}

// Recibos por Honorarios
export function useHonorarios(empresaId: string, params?: any) {
  return useQuery({
    queryKey: ['honorarios', empresaId, params],
    queryFn: async () => {
      const data = await tesoreriaPlanillaApi.listarHonorarios(empresaId, params);
      return data || [];
    },
    enabled: Boolean(empresaId)
  });
}

export function useRegistrarHonorario(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: any) => tesoreriaPlanillaApi.registrarHonorario(empresaId, datos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['honorarios', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['cuentasPorPagar', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['asientos', empresaId] });
    }
  });
}

export function useAnularHonorario(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      tesoreriaPlanillaApi.anularHonorario(empresaId, id, motivo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['honorarios', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['cuentasPorPagar', empresaId] });
    }
  });
}

// Trabajadores y Planillas
export function useTrabajadores(empresaId: string) {
  return useQuery({
    queryKey: ['trabajadores', empresaId],
    queryFn: async () => {
      const data = await tesoreriaPlanillaApi.listarTrabajadores(empresaId);
      return data || [];
    },
    enabled: Boolean(empresaId)
  });
}

export function useCrearTrabajador(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: any) => tesoreriaPlanillaApi.crearTrabajador(empresaId, datos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trabajadores', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['tregistro', empresaId] });
    }
  });
}

export function useActualizarTrabajador(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ trabajadorId, datos }: { trabajadorId: string; datos: any }) =>
      tesoreriaPlanillaApi.actualizarTrabajador(empresaId, trabajadorId, datos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trabajadores', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['tregistro', empresaId] });
    }
  });
}

export function usePlanillas(empresaId: string, mes?: string) {
  return useQuery({
    queryKey: ['planillas', empresaId, mes],
    queryFn: async () => {
      const data = await tesoreriaPlanillaApi.listarPlanillas(empresaId, mes);
      return data || [];
    },
    enabled: Boolean(empresaId)
  });
}

export function useCalcularPlanilla(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ periodoId, mes, novedades }: { periodoId: string; mes: string; novedades?: any[] }) =>
      tesoreriaPlanillaApi.calcularPlanilla(empresaId, periodoId, mes, novedades),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planillas', empresaId] });
    }
  });
}

export function useContabilizarPlanilla(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planillaId: string) => tesoreriaPlanillaApi.contabilizarPlanilla(empresaId, planillaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planillas', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['asientos', empresaId] });
    }
  });
}

export function useAnularPlanilla(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planillaId, motivo }: { planillaId: string; motivo: string }) =>
      tesoreriaPlanillaApi.anularPlanilla(empresaId, planillaId, motivo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planillas', empresaId] });
    }
  });
}

export function useValidarPlame(empresaId: string) {
  return useMutation({
    mutationFn: (planillaId: string) => tesoreriaPlanillaApi.validarPlame(empresaId, planillaId)
  });
}

export function useExportarPlame(empresaId: string) {
  return useMutation({
    mutationFn: (planillaId: string) => tesoreriaPlanillaApi.exportarPlame(empresaId, planillaId)
  });
}

export function useExportarTRegistro(empresaId: string) {
  return useMutation({
    mutationFn: () => tesoreriaPlanillaApi.exportarTRegistro(empresaId)
  });
}

export function useGratificaciones(empresaId: string, periodo?: string) {
  return useQuery({
    queryKey: ['gratificaciones', empresaId, periodo],
    queryFn: async () => {
      const data = await tesoreriaPlanillaApi.listarGratificaciones(empresaId, periodo);
      return data || [];
    },
    enabled: Boolean(empresaId)
  });
}

export function useCalcularGratificaciones(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (periodo: string) => tesoreriaPlanillaApi.calcularGratificaciones(empresaId, periodo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gratificaciones', empresaId] });
    }
  });
}

export function useContabilizarGratificaciones(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (periodo: string) => tesoreriaPlanillaApi.contabilizarGratificaciones(empresaId, periodo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gratificaciones', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['asientos', empresaId] });
    }
  });
}

export function useCts(empresaId: string, periodo?: string) {
  return useQuery({
    queryKey: ['cts', empresaId, periodo],
    queryFn: async () => {
      const data = await tesoreriaPlanillaApi.listarCts(empresaId, periodo);
      return data || [];
    },
    enabled: Boolean(empresaId)
  });
}

export function useCalcularCts(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (periodo: string) => tesoreriaPlanillaApi.calcularCts(empresaId, periodo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cts', empresaId] });
    }
  });
}

export function useContabilizarCts(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (periodo: string) => tesoreriaPlanillaApi.contabilizarCts(empresaId, periodo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cts', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['asientos', empresaId] });
    }
  });
}

export function useLiquidacionesBeneficios(empresaId: string) {
  return useQuery({
    queryKey: ['liquidacionesBeneficios', empresaId],
    queryFn: async () => {
      const data = await tesoreriaPlanillaApi.listarLiquidacionesBeneficios(empresaId);
      return data || [];
    },
    enabled: Boolean(empresaId)
  });
}

export function useCalcularLiquidacionBeneficios(empresaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) => tesoreriaPlanillaApi.calcularLiquidacionBeneficios(empresaId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['liquidacionesBeneficios', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['trabajadores', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['tregistro', empresaId] });
    }
  });
}

export function useParametrosLaborales() {
  return useQuery({
    queryKey: ['parametrosLaborales'],
    queryFn: async () => {
      const data = await tesoreriaPlanillaApi.listarParametrosLaborales();
      return data || [];
    }
  });
}

export function useGuardarParametroLaboral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: {
      codigoParametro: string;
      descripcion: string;
      valorNumerico: number;
      tipoDato: string;
      vigenteDesde: string;
      vigenteHasta?: string | null;
    }) => tesoreriaPlanillaApi.guardarParametroLaboral(datos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parametrosLaborales'] });
    }
  });
}

// Flujo de Caja
export function useFlujoCaja(empresaId: string, desde?: string, hasta?: string) {
  return useQuery({
    queryKey: ['flujoCaja', empresaId, desde, hasta],
    queryFn: async () => {
      const data = await tesoreriaPlanillaApi.obtenerFlujoCaja(empresaId, desde, hasta);
      return data || null;
    },
    enabled: Boolean(empresaId)
  });
}


