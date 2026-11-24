/**
 * Contratos públicos DTO para Conciliación Bancaria V2 (Fase 1 y Fase 2).
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

export const FORMATOS_EXTRACTO_V2 = ['XLSX', 'CSV', 'TXT', 'PDF'] as const;

export type FormatoExtractoV2 = (typeof FORMATOS_EXTRACTO_V2)[number];

export const TIPOS_CLASIFICACION_EXTRACTO = [
  'ITF',
  'COMISION_BANCARIA',
  'MANTENIMIENTO',
  'INTERES_GASTO',
  'INTERES_INGRESO',
  'DETRACCION',
  'TRIBUTO_SUNAT',
  'AFP_ONP_ESSALUD',
  'PLANILLA',
  'CHEQUE',
  'TRANSFERENCIA',
  'OTRO',
] as const;

export type TipoClasificacionExtracto = (typeof TIPOS_CLASIFICACION_EXTRACTO)[number];

export const TIPOS_COINCIDENCIA_REGLA = ['CONTIENE', 'PREFIJO', 'PALABRAS_CLAVE'] as const;

export type TipoCoincidenciaRegla = (typeof TIPOS_COINCIDENCIA_REGLA)[number];

export const SENTIDOS_MONTO_REGLA = ['CARGO', 'ABONO', 'AMBOS'] as const;

export type SentidoMontoRegla = (typeof SENTIDOS_MONTO_REGLA)[number];

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
  importId?: string | null;
  lineaRawId?: string | null;
  tipoClasificacion?: TipoClasificacionExtracto | null;
  rucExtraido?: string | null;
  contraparteExtraida?: string | null;
  docExtraido?: string | null;
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

export interface MapeoColumnasPerfil {
  fecha: string | number;
  descripcion: string | number;
  referencia?: string | number | null;
  monto?: string | number | null;
  abono?: string | number | null;
  cargo?: string | number | null;
  saldo?: string | number | null;
  signoCargoNegativo?: boolean;
}

export interface PerfilBancoV2 {
  id: string | null;
  empresaId: string | null;
  codigo: string;
  nombre: string;
  banco: string;
  formato: FormatoExtractoV2;
  delimitador: string | null;
  codificacion: string;
  filaEncabezado: number;
  formatoFecha: string;
  separadorDecimal: '.' | ',';
  mapeoColumnas: MapeoColumnasPerfil;
  esSistema: boolean;
  predefinido: boolean;
  activo: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CrearPerfilBancoInput {
  codigo: string;
  nombre: string;
  banco: string;
  formato: FormatoExtractoV2;
  delimitador?: string | null;
  codificacion?: string;
  filaEncabezado?: number;
  formatoFecha?: string;
  separadorDecimal?: '.' | ',';
  mapeoColumnas: MapeoColumnasPerfil;
  activo?: boolean;
}

export interface ActualizarPerfilBancoInput {
  nombre?: string;
  banco?: string;
  formato?: FormatoExtractoV2;
  delimitador?: string | null;
  codificacion?: string;
  filaEncabezado?: number;
  formatoFecha?: string;
  separadorDecimal?: '.' | ',';
  mapeoColumnas?: MapeoColumnasPerfil;
  activo?: boolean;
}

export interface ReglaClasificacionV2 {
  id: string | null;
  empresaId: string | null;
  nombre: string;
  banco: string | null;
  tipoClasificacion: TipoClasificacionExtracto;
  patronTexto: string;
  tipoCoincidencia: TipoCoincidenciaRegla;
  sentidoMonto: SentidoMontoRegla;
  prioridad: number;
  esSistema: boolean;
  activo: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CrearReglaClasificacionInput {
  nombre: string;
  banco?: string | null;
  tipoClasificacion: TipoClasificacionExtracto;
  patronTexto: string;
  tipoCoincidencia?: TipoCoincidenciaRegla;
  sentidoMonto?: SentidoMontoRegla;
  prioridad?: number;
  activo?: boolean;
}

export interface ActualizarReglaClasificacionInput {
  nombre?: string;
  banco?: string | null;
  tipoClasificacion?: TipoClasificacionExtracto;
  patronTexto?: string;
  tipoCoincidencia?: TipoCoincidenciaRegla;
  sentidoMonto?: SentidoMontoRegla;
  prioridad?: number;
  activo?: boolean;
}

export interface PrevisualizarImportacionInput {
  cuentaFinancieraId: string;
  periodo?: string | null;
  perfilBancoId?: string | null;
  perfilCodigo?: string | null;
  mapeoPersonalizado?: Partial<MapeoColumnasPerfil> & {
    filaEncabezado?: number;
    delimitador?: string | null;
    formatoFecha?: string;
    separadorDecimal?: '.' | ',';
  };
  nombreArchivo: string;
  contentType?: string | null;
  contenidoBase64: string;
  saldoInicialDeclarado?: string | number | null;
  saldoFinalDeclarado?: string | number | null;
}

export interface ConfirmarImportacionInput extends PrevisualizarImportacionInput {}

export interface ErrorFilaImportacion {
  numFila: number | null;
  codigo: string;
  campo?: string | null;
  mensaje: string;
  valor?: string | null;
}

export interface AdvertenciaImportacion {
  codigo: string;
  mensaje: string;
  saldoAnteriorEsperado?: string | null;
  saldoInicialArchivo?: string | null;
}

export interface LineaPrevisualizadaV2 {
  numFila: number;
  fecha: string;
  descripcion: string;
  referencia: string | null;
  monto: string;
  saldo: string | null;
  hashLinea: string;
  esDuplicada: boolean;
  estadoSugerido: EstadoConciliacionV2;
  tipoClasificacion: TipoClasificacionExtracto;
  rucExtraido: string | null;
  contraparteExtraida: string | null;
  docExtraido: string | null;
  rawJson: Record<string, unknown>;
}

export interface ResultadoPrevisualizacionImportacionV2 {
  valido: boolean;
  cuentaFinancieraId: string;
  periodo: string;
  fechaDesde: string | null;
  fechaHasta: string | null;
  nombreArchivo: string;
  formatoArchivo: FormatoExtractoV2;
  hashArchivo: string;
  tamanoBytes: number;
  perfilAplicadoCodigo: string | null;
  perfilBancoId: string | null;
  saldoInicial: string;
  totalAbonos: string;
  totalCargos: string;
  saldoFinal: string;
  saldoFinalCalculado: string;
  cuadreSaldosValido: boolean;
  totalFilasArchivo: number;
  filasNuevas: number;
  filasDuplicadas: number;
  errores: ErrorFilaImportacion[];
  advertencias: AdvertenciaImportacion[];
  lineas: LineaPrevisualizadaV2[];
}

export interface ResultadoConfirmacionImportacionV2 {
  importId: string;
  extractoBancarioId: string | null;
  yaExistiaSinNuevas: boolean;
  hashArchivo: string;
  periodo: string;
  fechaDesde: string;
  fechaHasta: string;
  saldoInicial: string;
  totalAbonos: string;
  totalCargos: string;
  saldoFinal: string;
  totalFilasArchivo: number;
  filasNuevas: number;
  filasDuplicadas: number;
  estado: 'ACTIVO';
  advertencias: AdvertenciaImportacion[];
}

export interface ImportacionExtractoResumenV2 {
  id: string;
  empresaId: string;
  cuentaFinancieraId: string;
  extractoBancarioId: string | null;
  perfilBancoId: string | null;
  bancoPerfilCodigo: string | null;
  nombreArchivo: string;
  formatoArchivo: FormatoExtractoV2;
  tamanoBytes: number;
  hashArchivo: string;
  periodo: string | null;
  fechaDesde: string;
  fechaHasta: string;
  saldoInicial: string;
  totalAbonos: string;
  totalCargos: string;
  saldoFinal: string;
  totalFilasArchivo: number;
  filasNuevas: number;
  filasDuplicadas: number;
  estado: 'ACTIVO' | 'REVERTIDO';
  motivoReversion: string | null;
  revertidoPor: string | null;
  revertidoEn: string | null;
  usuarioId: string | null;
  createdAt: string;
}

export interface RevertirImportacionInput {
  motivo: string;
}

export interface ResultadoReversionImportacionV2 {
  importId: string;
  estado: 'REVERTIDO';
  filasEliminadas: number;
  extractoAnulado: boolean;
  motivo: string;
  revertidoEn: string;
}
