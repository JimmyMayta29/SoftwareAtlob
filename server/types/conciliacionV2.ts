/**
 * Contratos públicos DTO para Conciliación Bancaria V2 (Fase 1).
 *
 * Convención monetaria para consumidores (incluyendo frontend):
 * Todos los importes monetarios en respuestas DTO se devuelven como cadenas
 * decimales exactas con 2 decimales (`'0.00'`) generadas exclusivamente
 * mediante `Money.format(...)` (`decimal.js`, ROUND_HALF_UP), sin aritmética
 * flotante IEEE-754.
 */

export const ESTADOS_CONCILIACION_V2 = [
  'CONCILIADO',
  'CONCILIADO_MANUAL',
  'SUGERIDO',
  'PENDIENTE_LIBROS',
  'PENDIENTE_BANCO',
  'CHEQUE_NO_COBRADO',
  'CARGO_BANCARIO_ITF',
  'DIFERENCIA_IMPORTE',
  'DUPLICADO',
] as const;

export type EstadoConciliacionV2 = (typeof ESTADOS_CONCILIACION_V2)[number];

export type SemaforoConciliacion = 'VERDE' | 'AMARILLO' | 'ROJO' | 'SIN_EXTRACTO';

export type EstadoLibroV2 = 'CONCILIADO' | 'PENDIENTE_BANCO' | 'CHEQUE_NO_COBRADO';

export interface ConfigConciliacionV2 {
  empresaId: string;
  conciliacionV2Habilitada: boolean;
  toleranciaDias: number;
  toleranciaMonto: string;
  cuentaItfCodigo: string;
  cuentaComisionCodigo: string;
  cuentaInteresGastoCodigo: string;
  cuentaInteresIngresoCodigo: string | null;
  sugerenciaCuentaInteresIngreso: string;
  configuradaEnBd: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface ActualizarConfigConciliacionV2Input {
  conciliacionV2Habilitada?: boolean;
  toleranciaDias?: number;
  toleranciaMonto?: string | number;
  cuentaItfCodigo?: string;
  cuentaComisionCodigo?: string;
  cuentaInteresGastoCodigo?: string;
  cuentaInteresIngresoCodigo?: string | null;
}

export interface CuentaBancariaV2 {
  id: string;
  empresaId: string;
  tipo: string;
  banco: string;
  numero: string;
  moneda: string;
  cci: string | null;
  alias: string | null;
  cuentaContableId: string | null;
  cuentaContableCodigo: string;
  cuentaContableNombre: string | null;
  requiereVinculacionContable: boolean;
  saldoInicial: string;
  saldoActual: string;
  activa: boolean;
}

export interface CuentaContableDisponibleV2 {
  id: string;
  codigo: string;
  nombre: string;
  nivel: number;
  tipoCuenta: string;
  permiteMovimiento: boolean;
  isActive: boolean;
}

export interface VincularCuentaContableInput {
  cuentaContableId: string;
  cci?: string | null;
}

export interface PartidaExtractoV2 {
  id: string;
  extractoId: string;
  fecha: string;
  descripcion: string;
  referencia: string | null;
  /** Positivo = abono bancario, Negativo = cargo bancario */
  monto: string;
  saldo: string | null;
  conciliada: boolean;
  estadoConciliacion: EstadoConciliacionV2;
  movimientoTesoreriaId: string | null;
  diferenciaImporte: string;
  observacionConciliacion: string | null;
  conciliadoEn: string | null;
}

export interface PartidaLibroV2 {
  id: string;
  periodoId: string;
  cuentaFinancieraId: string;
  fecha: string;
  tipo: string;
  medioPago: string;
  numeroOperacion: string | null;
  moneda: string;
  tipoCambio: string;
  importe: string;
  /** Positivo para INGRESO, negativo para egresos/comisiones/ITF/salidas */
  importeConSigno: string;
  glosa: string;
  estado: string;
  conciliado: boolean;
  estadoLibroV2: EstadoLibroV2;
  asientoId: string | null;
}

export interface IntegridadMayor104x {
  verificada: boolean;
  cuentaContableId: string | null;
  cuentaContableCodigo: string | null;
  saldoTesoreria: string;
  saldoMayor104x: string | null;
  diferenciaIntegridadMayor: string | null;
  alertaIntegridad: boolean;
  motivoAlerta: string | null;
}

export interface ResumenConciliacionV2 {
  empresaId: string;
  periodo: string;
  fechaInicio: string;
  fechaFin: string;
  cuenta: CuentaBancariaV2;
  tieneExtracto: boolean;
  saldoInicialExtracto: string | null;
  saldoFinalExtracto: string | null;
  saldoLibros: string;
  depositosEnTransito: string;
  chequesNoCobrados: string;
  abonosNoRegistrados: string;
  cargosNoRegistrados: string;
  saldoAjustadoBanco: string | null;
  saldoAjustadoLibros: string;
  diferencia: string | null;
  semaforo: SemaforoConciliacion;
  toleranciaMonto: string;
  integridadMayor: IntegridadMayor104x;
  conciliacionPeriodo: {
    id: string | null;
    estado: 'ABIERTA' | 'CERRADA';
    fechaCorte: string | null;
    cerradaPor: string | null;
    fechaCierre: string | null;
    motivoReapertura: string | null;
    reabiertaPor: string | null;
    fechaReapertura: string | null;
  };
  conteos: {
    totalExtracto: number;
    conciliadasExtracto: number;
    pendientesLibros: number;
    totalLibros: number;
    conciliadosLibros: number;
    pendientesBanco: number;
    chequesNoCobrados: number;
  };
  extractoLineas: PartidaExtractoV2[];
  movimientosLibros: PartidaLibroV2[];
}

export interface ConciliarPartidaV2Input {
  extractoLineaId: string;
  movimientoTesoreriaId?: string | null;
  estadoConciliacion?: 'CONCILIADO' | 'CONCILIADO_MANUAL';
  observacion?: string | null;
}

export interface DesconciliarPartidaV2Input {
  extractoLineaId: string;
  motivo?: string | null;
}

export interface CerrarConciliacionV2Input {
  cuentaFinancieraId: string;
  periodo: string;
  fechaCorte?: string;
}

export interface ReabrirConciliacionV2Input {
  cuentaFinancieraId: string;
  periodo: string;
  motivo: string;
}

export interface ResultadoCierreV2 {
  id: string;
  empresaId: string;
  cuentaFinancieraId: string;
  periodoId: string;
  periodo: string;
  fechaCorte: string;
  estado: 'ABIERTA' | 'CERRADA';
  saldoSegunLibros: string;
  saldoSegunBanco: string;
  saldoInicialBanco: string | null;
  saldoFinalBanco: string | null;
  depositosEnTransito: string;
  chequesNoCobrados: string;
  abonosNoRegistrados: string;
  cargosNoRegistrados: string;
  saldoMayor104x: string | null;
  diferenciaIntegridadMayor: string;
  diferencia: string;
  cerradaPor: string | null;
  fechaCierre: string | null;
  motivoReapertura: string | null;
  reabiertaPor: string | null;
  fechaReapertura: string | null;
}
