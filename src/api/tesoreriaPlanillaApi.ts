import { apiClient } from './client';

export interface CuentaFinancieraApi {
  id: string;
  empresaId: string;
  tipo: 'CAJA' | 'BANCO' | 'DETRACCIONES_BN';
  banco: string;
  numero: string;
  moneda: 'PEN' | 'USD';
  cuentaContableCodigo: string;
  saldoInicial: number;
  saldoActual: number;
  activa: boolean;
}

export interface MovimientoTesoreriaApi {
  id: string;
  empresaId: string;
  periodoId: string;
  cuentaFinancieraId: string;
  fecha: string;
  tipo: 'INGRESO' | 'EGRESO' | 'TRANSFERENCIA' | 'COMISION' | 'ITF' | 'DEPOSITO_DETRACCION';
  medioPago: string;
  numeroOperacion?: string;
  anexoId?: string;
  moneda: 'PEN' | 'USD';
  tipoCambio: number;
  importe: number;
  saldoSinAplicar: number;
  glosa: string;
  estado: 'BORRADOR' | 'REGISTRADO' | 'ANULADO';
  conciliado: boolean;
  asientoId?: string;
  version: number;
  createdAt: string;
  aplicaciones?: Array<{
    documentoId: string;
    importeAplicado: number;
  }>;
}

export interface ConciliacionResumenApi {
  cuenta: {
    id: string;
    banco: string;
    numero: string;
    moneda: string;
  };
  fechaCorte: string;
  resumen: {
    saldoSegunLibros: number;
    saldoSegunBanco: number;
    partidasConciliadas: number;
    partidasEnTransito: number;
    diferencia: number;
    cuadrado: boolean;
  };
  coincidenciasSugeridas: Array<{
    lineaExtractoId: string;
    movimientoId: string;
    score: number;
    motivo: string;
  }>;
  extractoLineas: Array<{
    id: string;
    fecha: string;
    descripcion: string;
    referencia?: string;
    monto: number;
    saldo?: number;
    conciliada: boolean;
    movimientoTesoreriaId?: string;
  }>;
  movimientosLibros: MovimientoTesoreriaApi[];
}

export interface ReciboHonorarioApi {
  id: string;
  empresaId: string;
  periodoId: string;
  proveedorId: string;
  proveedorNombre?: string;
  proveedorRuc?: string;
  serie: string;
  numero: string;
  fechaEmision: string;
  fechaPago?: string;
  moneda: 'PEN' | 'USD';
  tipoCambio: number;
  importeBruto: number;
  aplicaRetencion: boolean;
  tasaRetencion: number;
  retencion: number;
  netoPagar: number;
  suspensionCuarta: boolean;
  numeroResolucionSuspension?: string;
  vigenciaSuspensionDesde?: string;
  vigenciaSuspensionHasta?: string;
  cuentaGasto: string;
  glosa: string;
  estado: 'BORRADOR' | 'REGISTRADO' | 'PAGADO' | 'ANULADO';
  asientoId?: string;
  cuentaPorPagarId?: string;
  version: number;
  origenParametroTasa?: string;
}

export interface TrabajadorApi {
  id: string;
  empresaId: string;
  tipoDocumento: string;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  fechaNacimiento?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  fechaIngreso: string;
  fechaCese?: string;
  motivoCese?: string;
  cargo: string;
  tipoContrato?: 'INDETERMINADO' | 'PLAZO_FIJO' | 'TIEMPO_PARCIAL' | 'SUJETO_MODALIDAD';
  fechaInicioContrato?: string;
  fechaFinContrato?: string;
  regimenLaboral: 'GENERAL' | 'MYPE_MICRO' | 'MYPE_PEQUENA';
  sueldoBase: number;
  cargasFamiliares?: number;
  tieneAsignacionFamiliar: boolean;
  sistemaPensiones: 'ONP' | 'AFP';
  afpAdministradora?: 'INTEGRA' | 'PRIMA' | 'PROFUTURO' | 'HABITAT';
  afpTipoComision?: 'FLUJO' | 'MIXTA';
  cuspp?: string;
  centroCosto: string;
  cuentaBancoSueldo?: string;
  cciSueldo?: string;
  bancoSueldo?: string;
  afiliadoEps?: boolean;
  activo: boolean;
}

export interface PlanillaApi {
  id: string;
  empresaId: string;
  periodoId: string;
  mes: string;
  fechaCalculo: string;
  fechaPago?: string;
  totalIngresos: number;
  totalDescuentos: number;
  totalAportesEmpleador: number;
  totalNeto: number;
  estado: 'BORRADOR' | 'CALCULADA' | 'CONTABILIZADA' | 'PAGADA';
  asientoId?: string;
  lineas: Array<{
    id: string;
    trabajadorId: string;
    trabajadorNombre: string;
    trabajadorDocumento: string;
    trabajadorCargo?: string;
    regimenLaboral?: string;
    sistemaPensiones?: string;
    afpAdministradora?: string;
    cuspp?: string;
    diasLaborados: number;
    diasFaltas?: number;
    minutosTardanza?: number;
    horasExtras25?: number;
    horasExtras35?: number;
    montoHorasExtras25?: number;
    montoHorasExtras35?: number;
    sueldoBasico: number;
    asignacionFamiliar: number;
    horasExtras: number;
    bonificacionesGravadas?: number;
    conceptosNoGravados?: number;
    otrosIngresos: number;
    descuentoFaltasTardanzas?: number;
    totalRemuneracion: number;
    aporteObligatorioPension: number;
    comisionAfp: number;
    primaSeguroAfp: number;
    retencionQuinta: number;
    adelantosPrestamos?: number;
    otrosDescuentos: number;
    totalDescuentos: number;
    aporteEssalud: number;
    netoPagar: number;
    centroCosto: string;
    proyeccionQuinta?: any;
  }>;
}

export interface FlujoCajaApi {
  fechaDesde: string;
  fechaHasta: string;
  totalIngresos: number;
  totalEgresos: number;
  flujoNeto: number;
  saldoTotalDisponible: number;
  cuentas: Array<{
    id: string;
    banco: string;
    numero: string;
    tipo: string;
    moneda: string;
    saldoActual: number;
  }>;
}

function extractData<T>(res: any, fallback?: T): T {
  if (res && res.data !== undefined) return res.data;
  if (res !== undefined) return res;
  return fallback as T;
}

export const tesoreriaPlanillaApi = {
  // Cuentas Financieras
  async listarCuentas(empresaId: string): Promise<CuentaFinancieraApi[]> {
    const res = await apiClient.get<any>(`/empresas/${empresaId}/cuentas-financieras`);
    return extractData<CuentaFinancieraApi[]>(res, []);
  },

  async crearCuenta(empresaId: string, datos: any): Promise<CuentaFinancieraApi> {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/cuentas-financieras`, datos);
    return extractData<CuentaFinancieraApi>(res);
  },

  // Movimientos
  async listarMovimientos(empresaId: string, params?: any): Promise<{ items: MovimientoTesoreriaApi[]; total: number }> {
    const res = await apiClient.get<any>(
      `/empresas/${empresaId}/movimientos-tesoreria`,
      { params }
    );
    return extractData<{ items: MovimientoTesoreriaApi[]; total: number }>(res, { items: [], total: 0 });
  },

  async registrarMovimiento(empresaId: string, datos: any): Promise<MovimientoTesoreriaApi> {
    const res = await apiClient.post<any>(
      `/empresas/${empresaId}/movimientos-tesoreria`,
      datos
    );
    return extractData<MovimientoTesoreriaApi>(res);
  },

  async anularMovimiento(empresaId: string, movimientoId: string, motivo: string) {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/movimientos-tesoreria/${movimientoId}/anular`, { motivo });
    return extractData(res);
  },

  // Transferencias
  async registrarTransferencia(empresaId: string, datos: any) {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/transferencias`, datos);
    return extractData(res);
  },

  // Conciliación
  async importarExtracto(empresaId: string, datos: any) {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/extractos`, datos);
    return extractData(res);
  },

  async obtenerConciliacion(empresaId: string, cuentaFinancieraId: string, periodoId: string, fechaCorte?: string): Promise<ConciliacionResumenApi> {
    const res = await apiClient.get<any>(`/empresas/${empresaId}/conciliaciones`, {
      params: { cuentaFinancieraId, periodoId, fechaCorte }
    });
    return extractData<ConciliacionResumenApi>(res);
  },

  async conciliarPartida(empresaId: string, extractoLineaId: string, movimientoId: string) {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/conciliaciones/conciliar`, { extractoLineaId, movimientoId });
    return extractData(res);
  },

  async desconciliarPartida(empresaId: string, extractoLineaId: string) {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/conciliaciones/desconciliar`, { extractoLineaId });
    return extractData(res);
  },

  async cerrarConciliacion(empresaId: string, cuentaFinancieraId: string, periodoId: string, fechaCorte: string) {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/conciliaciones/cerrar`, { cuentaFinancieraId, periodoId, fechaCorte });
    return extractData(res);
  },

  // Honorarios
  async listarHonorarios(empresaId: string, params?: any): Promise<ReciboHonorarioApi[]> {
    const res = await apiClient.get<any>(`/empresas/${empresaId}/honorarios`, { params });
    return extractData<ReciboHonorarioApi[]>(res, []);
  },

  async registrarHonorario(empresaId: string, datos: any): Promise<ReciboHonorarioApi> {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/honorarios`, datos);
    return extractData<ReciboHonorarioApi>(res);
  },

  async anularHonorario(empresaId: string, honorarioId: string, motivo: string) {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/honorarios/${honorarioId}/anular`, { motivo });
    return extractData(res);
  },

  // Trabajadores y Planillas
  async listarTrabajadores(empresaId: string, completo = true): Promise<TrabajadorApi[]> {
    const res = await apiClient.get<any>(`/empresas/${empresaId}/trabajadores`, {
      params: completo ? { completo: 'true' } : undefined
    });
    return extractData<TrabajadorApi[]>(res, []);
  },

  async crearTrabajador(empresaId: string, datos: any): Promise<TrabajadorApi> {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/trabajadores`, datos);
    return extractData<TrabajadorApi>(res);
  },

  async actualizarTrabajador(empresaId: string, trabajadorId: string, datos: any): Promise<TrabajadorApi> {
    const res = await apiClient.put<any>(`/empresas/${empresaId}/trabajadores/${trabajadorId}`, datos);
    return extractData<TrabajadorApi>(res);
  },

  async listarPlanillas(empresaId: string, mes?: string): Promise<PlanillaApi[]> {
    const res = await apiClient.get<any>(`/empresas/${empresaId}/planillas`, { params: mes ? { mes } : undefined });
    const data = extractData<any>(res, []);
    if (!data) return [];
    return Array.isArray(data) ? data : [data];
  },

  async obtenerPlanillaPorMes(empresaId: string, mes: string): Promise<PlanillaApi | null> {
    const res = await apiClient.get<any>(`/empresas/${empresaId}/planillas`, { params: { mes } });
    return extractData<PlanillaApi | null>(res, null);
  },

  async calcularPlanilla(empresaId: string, periodoId: string, mes: string, novedades?: any[]): Promise<PlanillaApi> {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/planillas/calcular`, {
      periodoId,
      mes,
      novedades
    });
    return extractData<PlanillaApi>(res);
  },

  async contabilizarPlanilla(empresaId: string, planillaId: string) {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/planillas/${planillaId}/contabilizar`);
    return extractData(res);
  },

  async anularPlanilla(empresaId: string, planillaId: string, motivo: string) {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/planillas/${planillaId}/anular`, { motivo });
    return extractData(res);
  },

  async validarPlame(empresaId: string, planillaId: string) {
    const res = await apiClient.get<any>(`/empresas/${empresaId}/planillas/${planillaId}/validar-plame`);
    return extractData(res);
  },

  async exportarPlame(empresaId: string, planillaId: string) {
    const res = await apiClient.get<any>(`/empresas/${empresaId}/planillas/${planillaId}/exportar-plame`);
    return extractData(res);
  },

  // Gratificaciones, CTS, Liquidación de Beneficios y T-Registro
  async listarGratificaciones(empresaId: string, periodo?: string) {
    const res = await apiClient.get<any>(`/empresas/${empresaId}/planillas/gratificaciones`, { params: { periodo } });
    return extractData<any[]>(res, []);
  },

  async calcularGratificaciones(empresaId: string, periodo: string) {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/planillas/gratificaciones/calcular`, { periodo });
    return extractData<any>(res);
  },

  async contabilizarGratificaciones(empresaId: string, periodo: string) {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/planillas/gratificaciones/contabilizar`, { periodo });
    return extractData<any>(res);
  },

  async listarCts(empresaId: string, periodo?: string) {
    const res = await apiClient.get<any>(`/empresas/${empresaId}/planillas/cts`, { params: { periodo } });
    return extractData<any[]>(res, []);
  },

  async calcularCts(empresaId: string, periodo: string) {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/planillas/cts/calcular`, { periodo });
    return extractData<any>(res);
  },

  async contabilizarCts(empresaId: string, periodo: string) {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/planillas/cts/contabilizar`, { periodo });
    return extractData<any>(res);
  },

  async listarLiquidacionesBeneficios(empresaId: string) {
    const res = await apiClient.get<any>(`/empresas/${empresaId}/planillas/liquidaciones-beneficios`);
    return extractData<any[]>(res, []);
  },

  async calcularLiquidacionBeneficios(empresaId: string, datos: any) {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/planillas/liquidaciones-beneficios/calcular`, datos);
    return extractData<any>(res);
  },

  async exportarTRegistro(empresaId: string) {
    const res = await apiClient.get<any>(`/empresas/${empresaId}/planillas/exportar-tregistro`);
    return extractData<any>(res);
  },

  // Parámetros editables (RMV, UIT, Tasas ONP/AFP/EsSalud/5ta) con vigencia
  async listarParametrosLaborales(): Promise<any[]> {
    const res = await apiClient.get<any>('/parametros');
    return extractData<any[]>(res, []);
  },

  async guardarParametroLaboral(datos: {
    codigoParametro: string;
    descripcion: string;
    valorNumerico: number;
    tipoDato: string;
    vigenteDesde: string;
    vigenteHasta?: string | null;
  }): Promise<any> {
    const res = await apiClient.post<any>('/parametros', datos);
    return extractData<any>(res);
  },

  // Flujo de Caja
  async obtenerFlujoCaja(empresaId: string, desde?: string, hasta?: string): Promise<FlujoCajaApi> {
    const res = await apiClient.get<any>(`/empresas/${empresaId}/flujo-de-caja`, {
      params: { desde, hasta }
    });
    return extractData<FlujoCajaApi>(res);
  }
};
