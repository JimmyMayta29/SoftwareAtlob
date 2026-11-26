import { randomUUID } from 'node:crypto';
import type Decimal from 'decimal.js';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { db } from '../config/database';
import { Money } from '../utils/decimal';
import { auditoriaChainService } from './auditoriaChainService';
import { obtenerRangoMesPeriodo } from '../../src/utils/periodoFecha';
import {
  ActualizarConfigConciliacionV2Input,
  CerrarConciliacionV2Input,
  ConciliarPartidaV2Input,
  ConfigConciliacionV2,
  CuentaBancariaV2,
  CuentaContableDisponibleV2,
  DesconciliarPartidaV2Input,
  ESTADOS_CONCILIACION_V2,
  EstadoConciliacionV2,
  EstadoLibroV2,
  IntegridadMayor104x,
  PartidaExtractoV2,
  PartidaLibroV2,
  ReabrirConciliacionV2Input,
  ResultadoCierreV2,
  ResumenConciliacionV2,
  SemaforoConciliacion,
  TipoClasificacionExtracto,
  VincularCuentaContableInput,
} from '../types/conciliacionV2';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FECHA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ESTADOS_CONCILIACION_SET = new Set<string>(ESTADOS_CONCILIACION_V2);

const SUGERENCIA_INTERES_INGRESO = '7793';
const DEFAULT_UMBRAL_AUTO_MATCH = 0.90;

export class ConciliacionV2Error extends Error {
  public readonly statusCode: number;
  public readonly codigo: string;

  constructor(statusCode: number, codigo: string, message: string) {
    super(`${codigo}: ${message}`);
    this.name = 'ConciliacionV2Error';
    this.statusCode = statusCode;
    this.codigo = codigo;
  }
}

const actualizarConfigSchema = z.object({
  conciliacionV2Habilitada: z.boolean().optional(),
  toleranciaDias: z.number().int().min(0).max(30).optional(),
  toleranciaMonto: z
    .union([z.string(), z.number()])
    .optional()
    .refine(
      (val) => {
        if (val === undefined) return true;
        const text = String(val).trim();
        if (!/^-?\d+(\.\d+)?$/.test(text)) return false;
        const dec = Money.create(text);
        return dec.gte(0) && Money.round(dec).lte('999999999999.99');
      },
      { message: 'toleranciaMonto debe ser un decimal entre 0.00 y 999999999999.99.' }
    ),
  umbralAutoMatch: z.number().min(0.6).max(1).optional(),
  cuentaItfCodigo: z.string().trim().min(2).max(20).optional(),
  cuentaComisionCodigo: z.string().trim().min(2).max(20).optional(),
  cuentaInteresGastoCodigo: z.string().trim().min(2).max(20).optional(),
  cuentaInteresIngresoCodigo: z.string().trim().min(2).max(20).nullable().optional(),
});

const vincularCuentaSchema = z.object({
  cuentaContableId: z.string().uuid('cuentaContableId debe ser un UUID válido.'),
  cci: z
    .string()
    .trim()
    .max(30, 'El CCI no puede superar 30 caracteres.')
    .nullable()
    .optional(),
});

const conciliarPartidaSchema = z.object({
  extractoLineaId: z.string().uuid('extractoLineaId debe ser un UUID válido.'),
  movimientoTesoreriaId: z.string().uuid('movimientoTesoreriaId debe ser un UUID válido.').nullable().optional(),
  estadoConciliacion: z.enum(['CONCILIADO', 'CONCILIADO_MANUAL']).optional(),
  observacion: z.string().trim().max(500).nullable().optional(),
});

const desconciliarPartidaSchema = z.object({
  extractoLineaId: z.string().uuid('extractoLineaId debe ser un UUID válido.'),
  motivo: z.string().trim().max(500).nullable().optional(),
});

const cerrarConciliacionSchema = z.object({
  cuentaFinancieraId: z.string().uuid('cuentaFinancieraId debe ser un UUID válido.'),
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'periodo debe tener formato YYYY-MM.'),
  fechaCorte: z.string().regex(FECHA_ISO_REGEX, 'fechaCorte debe tener formato YYYY-MM-DD.').optional(),
});

const reabrirConciliacionSchema = z.object({
  cuentaFinancieraId: z.string().uuid('cuentaFinancieraId debe ser un UUID válido.'),
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'periodo debe tener formato YYYY-MM.'),
  motivo: z.string().trim().min(5, 'El motivo de reapertura debe tener al menos 5 caracteres.').max(500),
});

export function asegurarPostgresDisponible(): void {
  if (!db.isPostgresConnected()) {
    throw new ConciliacionV2Error(
      503,
      'POSTGRESQL_NO_DISPONIBLE',
      'PostgreSQL no está conectado. Conciliación Bancaria V2 requiere persistencia transaccional.'
    );
  }
}

export function asegurarUuid(valor: string, nombreCampo: string): void {
  if (!valor || !UUID_REGEX.test(valor)) {
    throw new ConciliacionV2Error(400, 'IDENTIFICADOR_INVALIDO', `${nombreCampo} debe ser un UUID válido.`);
  }
}

export function resolverRangoPeriodo(periodo: string) {
  try {
    return obtenerRangoMesPeriodo(periodo);
  } catch (err) {
    throw new ConciliacionV2Error(400, 'PERIODO_INVALIDO', (err as Error).message);
  }
}

function parsearUmbralAutoMatch(raw: unknown): number {
  if (raw === null || raw === undefined) {
    return DEFAULT_UMBRAL_AUTO_MATCH;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0.6 || parsed > 1) {
    return DEFAULT_UMBRAL_AUTO_MATCH;
  }
  return Number(parsed.toFixed(4));
}

function flagGlobalConciliacionV2(): boolean {
  return process.env.CONCILIACION_V2 === 'true' || process.env.CONCILIACION_V2 === '1';
}

function buildDefaultConfig(empresaId: string): ConfigConciliacionV2 {
  return {
    empresaId,
    conciliacionV2Habilitada: flagGlobalConciliacionV2(),
    toleranciaDias: 3,
    toleranciaMonto: '0.00',
    umbralAutoMatch: DEFAULT_UMBRAL_AUTO_MATCH,
    cuentaItfCodigo: '6412',
    cuentaComisionCodigo: '6391',
    cuentaInteresGastoCodigo: '67311',
    cuentaInteresIngresoCodigo: null,
    sugerenciaCuentaInteresIngreso: SUGERENCIA_INTERES_INGRESO,
    configuradaEnBd: false,
    updatedBy: null,
    updatedAt: null,
  };
}

// ============================================================================
// CÁLCULOS PUROS EXPORTADOS Y TESTEABLES (100% decimal.js / Money)
// ============================================================================

/**
 * Sincroniza el campo booleano legacy `conciliada` con el estado V2 de la línea del extracto.
 */
export function derivarEstadoEfectivoExtracto(
  conciliada: boolean,
  estadoConciliacion?: string | null
): EstadoConciliacionV2 {
  if (conciliada === true && (!estadoConciliacion || estadoConciliacion === 'PENDIENTE_LIBROS')) {
    return 'CONCILIADO';
  }
  if (
    conciliada === false &&
    (estadoConciliacion === 'CONCILIADO' || estadoConciliacion === 'CONCILIADO_MANUAL')
  ) {
    return 'PENDIENTE_LIBROS';
  }
  if (estadoConciliacion && ESTADOS_CONCILIACION_SET.has(estadoConciliacion)) {
    return estadoConciliacion as EstadoConciliacionV2;
  }
  return 'PENDIENTE_LIBROS';
}

/**
 * Deriva dinámicamente en Fase 1 el estado V2 del lado libro sin persistir columnas adicionales en movimientos_tesoreria.
 */
export function derivarEstadoLibroV2(mov: {
  conciliado: boolean;
  tipo: string;
  medioPago?: string | null;
}): EstadoLibroV2 {
  if (mov.conciliado === true) {
    return 'CONCILIADO';
  }
  if (mov.conciliado === false && mov.tipo === 'EGRESO' && mov.medioPago === '007') {
    return 'CHEQUE_NO_COBRADO';
  }
  return 'PENDIENTE_BANCO';
}

export interface CalcularResumenConciliacionV2Params {
  tieneExtracto: boolean;
  saldoFinalExtracto: string | number | Decimal | null | undefined;
  saldoLibros: string | number | Decimal;
  depositosEnTransito: string | number | Decimal;
  chequesNoCobrados: string | number | Decimal;
  abonosNoRegistrados: string | number | Decimal;
  cargosNoRegistrados: string | number | Decimal;
  toleranciaMonto?: string | number | Decimal;
}

export interface ResumenNumericoConciliacionV2 {
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
}

/**
 * Calcula los totales ajustados, diferencia de cuadre y semáforo usando exclusivamente `Money` (`decimal.js`).
 */
export function calcularResumenNumericoConciliacionV2(
  params: CalcularResumenConciliacionV2Params
): ResumenNumericoConciliacionV2 {
  const saldoLibrosDec = Money.round(params.saldoLibros);
  const depositosDec = Money.round(params.depositosEnTransito);
  const chequesDec = Money.round(params.chequesNoCobrados);
  const abonosDec = Money.round(params.abonosNoRegistrados);
  const cargosDec = Money.round(params.cargosNoRegistrados);
  const toleranciaDec = Money.round(params.toleranciaMonto ?? '0.00');

  const saldoAjustadoLibrosDec = Money.sub(Money.add(saldoLibrosDec, abonosDec), cargosDec);

  if (!params.tieneExtracto) {
    return {
      saldoFinalExtracto: null,
      saldoLibros: Money.format(saldoLibrosDec),
      depositosEnTransito: Money.format(depositosDec),
      chequesNoCobrados: Money.format(chequesDec),
      abonosNoRegistrados: Money.format(abonosDec),
      cargosNoRegistrados: Money.format(cargosDec),
      saldoAjustadoBanco: null,
      saldoAjustadoLibros: Money.format(saldoAjustadoLibrosDec),
      diferencia: null,
      semaforo: 'SIN_EXTRACTO',
    };
  }

  const saldoFinalBancoDec = Money.round(params.saldoFinalExtracto ?? '0.00');
  const saldoAjustadoBancoDec = Money.sub(Money.add(saldoFinalBancoDec, depositosDec), chequesDec);
  const diferenciaDec = Money.sub(saldoAjustadoBancoDec, saldoAjustadoLibrosDec);

  let semaforo: SemaforoConciliacion;
  if (Money.isEqual(diferenciaDec, 0)) {
    semaforo = 'VERDE';
  } else if (toleranciaDec.gt(0) && diferenciaDec.abs().lte(toleranciaDec)) {
    semaforo = 'AMARILLO';
  } else {
    semaforo = 'ROJO';
  }

  return {
    saldoFinalExtracto: Money.format(saldoFinalBancoDec),
    saldoLibros: Money.format(saldoLibrosDec),
    depositosEnTransito: Money.format(depositosDec),
    chequesNoCobrados: Money.format(chequesDec),
    abonosNoRegistrados: Money.format(abonosDec),
    cargosNoRegistrados: Money.format(cargosDec),
    saldoAjustadoBanco: Money.format(saldoAjustadoBancoDec),
    saldoAjustadoLibros: Money.format(saldoAjustadoLibrosDec),
    diferencia: Money.format(diferenciaDec),
    semaforo,
  };
}

/**
 * Bloquea operaciones de conciliación si la cuenta financiera no tiene cuenta contable PCGE vinculada.
 */
export function validarPrecondicionOperacionCuenta(
  cuentaContableId: string | null | undefined
): asserts cuentaContableId is string {
  if (!cuentaContableId || cuentaContableId.trim() === '') {
    throw new ConciliacionV2Error(
      409,
      'CUENTA_CONTABLE_NO_VINCULADA',
      'La cuenta bancaria no tiene una cuenta contable PCGE vinculada (cuenta_contable_id es NULL). Vincule una cuenta contable 10x antes de operar.'
    );
  }
}

/**
 * Valida que la cuenta contable configurada para asientos automáticos de conciliación exista en la empresa.
 */
export function validarCuentasAsientoConfig(
  tipoAsiento: 'ITF' | 'COMISION' | 'INTERES_GASTO' | 'INTERES_INGRESO',
  config: ConfigConciliacionV2,
  codigosPlanEmpresa: Set<string>
): string {
  let codigo: string | null = null;
  if (tipoAsiento === 'ITF') {
    codigo = config.cuentaItfCodigo;
  } else if (tipoAsiento === 'COMISION') {
    codigo = config.cuentaComisionCodigo;
  } else if (tipoAsiento === 'INTERES_GASTO') {
    codigo = config.cuentaInteresGastoCodigo;
  } else if (tipoAsiento === 'INTERES_INGRESO') {
    if (!config.cuentaInteresIngresoCodigo || config.cuentaInteresIngresoCodigo.trim() === '') {
      throw new ConciliacionV2Error(
        409,
        'CUENTA_INTERES_INGRESO_NO_CONFIGURADA',
        `Debe configurar cuentaInteresIngresoCodigo en la configuración de conciliación antes de generar asientos de intereses ganados (sugerencia PCGE: ${SUGERENCIA_INTERES_INGRESO}).`
      );
    }
    codigo = config.cuentaInteresIngresoCodigo;
  }

  if (!codigo || !codigosPlanEmpresa.has(codigo)) {
    throw new ConciliacionV2Error(
      409,
      'CUENTA_PCGE_INEXISTENTE_EN_EMPRESA',
      `La cuenta PCGE "${codigo || '(vacía)'}" requerida para ${tipoAsiento} no existe o no está activa en el plan de cuentas de la empresa.`
    );
  }

  return codigo;
}

// ============================================================================
// AUDITORÍA TRANSACCIONAL ENCADENADA (auditoria_log)
// ============================================================================

export async function registrarAuditoriaEnTx(
  client: PoolClient,
  params: {
    empresaId: string;
    usuarioId: string;
    tablaAfectada: string;
    registroId: string;
    accion: string;
    datosAnteriores?: unknown;
    datosNuevos?: unknown;
  }
): Promise<void> {
  asegurarUuid(params.empresaId, 'empresaId');
  asegurarUuid(params.usuarioId, 'usuarioId');
  await auditoriaChainService.registrar(params, client);
}

export async function registrarAuditoriaLoteEnTx(
  client: PoolClient,
  eventos: Array<{
    empresaId: string;
    usuarioId: string;
    tablaAfectada: string;
    registroId: string;
    accion: string;
    datosAnteriores?: unknown;
    datosNuevos?: unknown;
  }>
): Promise<void> {
  for (const evento of eventos) {
    asegurarUuid(evento.empresaId, 'empresaId');
    asegurarUuid(evento.usuarioId, 'usuarioId');
  }
  await auditoriaChainService.registrarLote(eventos, client);
}

// ============================================================================
// HELPERS INTERNOS DE LECTURA/MAPEO EN TRANSACCIÓN
// ============================================================================

export async function obtenerConfigEnTx(
  client: PoolClient,
  empresaId: string
): Promise<ConfigConciliacionV2> {
  const res = await client.query(
    `SELECT empresa_id AS "empresaId",
            conciliacion_v2_habilitada AS "conciliacionV2Habilitada",
            tolerancia_dias AS "toleranciaDias",
            tolerancia_monto::text AS "toleranciaMonto",
            umbral_auto_match::float8 AS "umbralAutoMatch",
            cuenta_itf_codigo AS "cuentaItfCodigo",
            cuenta_comision_codigo AS "cuentaComisionCodigo",
            cuenta_interes_gasto_codigo AS "cuentaInteresGastoCodigo",
            cuenta_interes_ingreso_codigo AS "cuentaInteresIngresoCodigo",
            updated_by AS "updatedBy",
            updated_at AS "updatedAt"
     FROM conciliacion_config_empresa
     WHERE empresa_id = $1`,
    [empresaId]
  );

  if (res.rows.length === 0) {
    return buildDefaultConfig(empresaId);
  }

  const row = res.rows[0];
  return {
    empresaId: row.empresaId,
    conciliacionV2Habilitada: Boolean(row.conciliacionV2Habilitada),
    toleranciaDias: Number(row.toleranciaDias),
    toleranciaMonto: Money.format(row.toleranciaMonto ?? '0'),
    umbralAutoMatch: parsearUmbralAutoMatch(row.umbralAutoMatch),
    cuentaItfCodigo: row.cuentaItfCodigo,
    cuentaComisionCodigo: row.cuentaComisionCodigo,
    cuentaInteresGastoCodigo: row.cuentaInteresGastoCodigo,
    cuentaInteresIngresoCodigo: row.cuentaInteresIngresoCodigo ?? null,
    sugerenciaCuentaInteresIngreso: SUGERENCIA_INTERES_INGRESO,
    configuradaEnBd: true,
    updatedBy: row.updatedBy ?? null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

function mapCuentaBancariaRow(row: any): CuentaBancariaV2 {
  const cuentaContableId = row.cuentaContableId ?? null;
  return {
    id: row.id,
    empresaId: row.empresaId,
    tipo: row.tipo,
    banco: row.banco,
    numero: row.numero,
    moneda: row.moneda,
    cci: row.cci ?? null,
    alias: row.alias ?? null,
    cuentaContableId,
    cuentaContableCodigo: row.cuentaContableCodigo,
    cuentaContableNombre: row.cuentaContableNombre ?? null,
    requiereVinculacionContable: cuentaContableId === null,
    saldoInicial: Money.format(row.saldoInicial ?? '0'),
    saldoActual: Money.format(row.saldoActual ?? '0'),
    activa: Boolean(row.activa),
  };
}

export async function obtenerCuentaBancariaEnTx(
  client: PoolClient,
  empresaId: string,
  cuentaFinancieraId: string
): Promise<CuentaBancariaV2> {
  const res = await client.query(
    `SELECT cf.id,
            cf.empresa_id AS "empresaId",
            cf.tipo,
            cf.banco,
            cf.numero,
            cf.moneda,
            cf.cci,
            cf.alias,
            cf.cuenta_contable_id AS "cuentaContableId",
            COALESCE(pc.codigo, cf.cuenta_contable_codigo) AS "cuentaContableCodigo",
            pc.nombre AS "cuentaContableNombre",
            cf.saldo_inicial::text AS "saldoInicial",
            cf.saldo_actual::text AS "saldoActual",
            cf.activa
     FROM cuentas_financieras cf
     LEFT JOIN plan_cuentas pc
       ON pc.empresa_id = cf.empresa_id
      AND pc.id = cf.cuenta_contable_id
     WHERE cf.empresa_id = $1 AND cf.id = $2`,
    [empresaId, cuentaFinancieraId]
  );

  if (res.rows.length === 0) {
    throw new ConciliacionV2Error(
      404,
      'CUENTA_FINANCIERA_NO_ENCONTRADA',
      'La cuenta financiera solicitada no existe para esta empresa.'
    );
  }

  return mapCuentaBancariaRow(res.rows[0]);
}

function mapPartidaExtractoRow(row: any): PartidaExtractoV2 {
  const conciliada = Boolean(row.conciliada);
  return {
    id: row.id,
    extractoId: row.extractoId,
    fecha: row.fecha,
    descripcion: row.descripcion,
    referencia: row.referencia ?? null,
    monto: Money.format(row.monto ?? '0'),
    saldo: row.saldo !== null && row.saldo !== undefined ? Money.format(row.saldo) : null,
    conciliada,
    estadoConciliacion: derivarEstadoEfectivoExtracto(conciliada, row.estadoConciliacionRaw),
    movimientoTesoreriaId: row.movimientoTesoreriaId ?? null,
    diferenciaImporte: Money.format(row.diferenciaImporte ?? '0'),
    observacionConciliacion: row.observacionConciliacion ?? null,
    conciliadoEn: row.conciliadoEn ? new Date(row.conciliadoEn).toISOString() : null,
    importId: row.importId ?? null,
    lineaRawId: row.lineaRawId ?? null,
    tipoClasificacion: (row.tipoClasificacion ?? null) as TipoClasificacionExtracto | null,
    rucExtraido: row.rucExtraido ?? null,
    contraparteExtraida: row.contraparteExtraida ?? null,
    docExtraido: row.docExtraido ?? null,
    grupoConciliacionId: row.grupoConciliacionId ?? null,
  };
}

function mapResultadoCierreRow(row: any, periodo: string): ResultadoCierreV2 {
  return {
    id: row.id,
    empresaId: row.empresaId,
    cuentaFinancieraId: row.cuentaFinancieraId,
    periodoId: row.periodoId,
    periodo,
    fechaCorte: row.fechaCorte,
    estado: row.estado,
    saldoSegunLibros: Money.format(row.saldoSegunLibros ?? '0'),
    saldoSegunBanco: Money.format(row.saldoSegunBanco ?? '0'),
    saldoInicialBanco:
      row.saldoInicialBanco !== null && row.saldoInicialBanco !== undefined
        ? Money.format(row.saldoInicialBanco)
        : null,
    saldoFinalBanco:
      row.saldoFinalBanco !== null && row.saldoFinalBanco !== undefined
        ? Money.format(row.saldoFinalBanco)
        : null,
    depositosEnTransito: Money.format(row.depositosEnTransito ?? '0'),
    chequesNoCobrados: Money.format(row.chequesNoCobrados ?? '0'),
    abonosNoRegistrados: Money.format(row.abonosNoRegistrados ?? '0'),
    cargosNoRegistrados: Money.format(row.cargosNoRegistrados ?? '0'),
    saldoMayor104x:
      row.saldoMayor104x !== null && row.saldoMayor104x !== undefined
        ? Money.format(row.saldoMayor104x)
        : null,
    diferenciaIntegridadMayor: Money.format(row.diferenciaIntegridadMayor ?? '0'),
    diferencia: Money.format(row.diferencia ?? '0'),
    cerradaPor: row.cerradaPor ?? null,
    fechaCierre: row.fechaCierre ? new Date(row.fechaCierre).toISOString() : null,
    motivoReapertura: row.motivoReapertura ?? null,
    reabiertaPor: row.reabiertaPor ?? null,
    fechaReapertura: row.fechaReapertura ? new Date(row.fechaReapertura).toISOString() : null,
  };
}

export async function verificarPeriodoNoCerradoEnTx(
  client: PoolClient,
  empresaId: string,
  cuentaFinancieraId: string,
  codigoPeriodo: string
): Promise<void> {
  const res = await client.query<{ estado: string }>(
    `SELECT cb.estado
     FROM conciliaciones_bancarias cb
     JOIN periodos p
       ON p.id = cb.periodo_id
      AND p.empresa_id = cb.empresa_id
     WHERE cb.empresa_id = $1
       AND cb.cuenta_financiera_id = $2
       AND p.codigo_periodo = $3
     LIMIT 1`,
    [empresaId, cuentaFinancieraId, codigoPeriodo]
  );

  if (res.rows[0]?.estado === 'CERRADA') {
    throw new ConciliacionV2Error(
      409,
      'CONCILIACION_CERRADA',
      `La conciliación del periodo ${codigoPeriodo} para esta cuenta se encuentra CERRADA. Debe reabrirla antes de modificar partidas.`
    );
  }
}

export async function obtenerResumenConciliacionEnTx(
  client: PoolClient,
  empresaId: string,
  cuentaFinancieraId: string,
  periodo: string
): Promise<ResumenConciliacionV2> {
  const { fechaInicio, fechaFin } = resolverRangoPeriodo(periodo);
  const config = await obtenerConfigEnTx(client, empresaId);
  const cuenta = await obtenerCuentaBancariaEnTx(client, empresaId, cuentaFinancieraId);

  // 1. Extractos del periodo (rango solapado con [fechaInicio, fechaFin] o líneas en ese rango)
  const extractosRes = await client.query<{
    id: string;
    fechaCorteDesde: string;
    fechaCorteHasta: string;
    saldoInicial: string;
    saldoFinal: string;
  }>(
    `SELECT id,
            fecha_corte_desde::text AS "fechaCorteDesde",
            fecha_corte_hasta::text AS "fechaCorteHasta",
            saldo_inicial::text AS "saldoInicial",
            saldo_final::text AS "saldoFinal"
     FROM extractos_bancarios
     WHERE empresa_id = $1
       AND cuenta_financiera_id = $2
       AND estado <> 'ANULADO'
       AND (
         (fecha_corte_desde <= $4 AND fecha_corte_hasta >= $3)
         OR EXISTS (
           SELECT 1
           FROM extracto_lineas el
           WHERE el.extracto_id = extractos_bancarios.id
             AND el.empresa_id = $1
             AND el.fecha BETWEEN $3 AND $4
         )
       )
     ORDER BY fecha_corte_desde ASC, fecha_corte_hasta ASC, created_at ASC`,
    [empresaId, cuentaFinancieraId, fechaInicio, fechaFin]
  );

  const tieneExtracto = extractosRes.rows.length > 0;
  const saldoInicialExtracto = tieneExtracto
    ? Money.format(extractosRes.rows[0].saldoInicial)
    : null;
  const saldoFinalExtracto = tieneExtracto
    ? Money.format(extractosRes.rows[extractosRes.rows.length - 1].saldoFinal)
    : null;

  // 1b. Lectura dedicada de mapas de grupos activos para (empresaId, cuentaFinancieraId)
  //     sin DISTINCT ON ni JOINs anidados para evitar Nested Loop / Index Scan Backward.
  const grupoPorExtracto = new Map<string, string>();
  const grupoPorMovTes = new Map<string, string>();
  const grupoPorAsientoDet = new Map<string, string>();
  const conciliadoGrupoPorAsientoDet = new Map<string, string>();

  const gruposActivosRes = await client.query<{ id: string; estado: string }>(
    `SELECT id, estado
     FROM conciliacion_grupo
     WHERE empresa_id = $1
       AND cuenta_financiera_id = $2
       AND estado IN ('SUGERIDO', 'CONCILIADO', 'CONCILIADO_MANUAL')
     ORDER BY created_at DESC, id DESC`,
    [empresaId, cuentaFinancieraId]
  );

  if (gruposActivosRes.rows.length > 0) {
    const ordenPorGrupo = new Map<string, number>();
    const estadoPorGrupo = new Map<string, string>();
    const grupoIds: string[] = [];

    for (let idx = 0; idx < gruposActivosRes.rows.length; idx += 1) {
      const g = gruposActivosRes.rows[idx];
      ordenPorGrupo.set(g.id, idx);
      estadoPorGrupo.set(g.id, g.estado);
      grupoIds.push(g.id);
    }

    const itemsRes = await client.query<{
      grupoId: string;
      lado: string;
      origenLibro: string | null;
      extractoLineaId: string | null;
      movimientoTesoreriaId: string | null;
      asientoDetalleId: string | null;
    }>(
      `SELECT grupo_id AS "grupoId",
              lado,
              origen_libro AS "origenLibro",
              extracto_linea_id AS "extractoLineaId",
              movimiento_tesoreria_id AS "movimientoTesoreriaId",
              asiento_detalle_id AS "asientoDetalleId"
       FROM conciliacion_item
       WHERE empresa_id = $1
         AND grupo_id = ANY($2::uuid[])`,
      [empresaId, grupoIds]
    );

    const asignarMasReciente = (
      map: Map<string, string>,
      clave: string | null,
      grupoId: string
    ) => {
      if (!clave) return;
      const existente = map.get(clave);
      if (existente === undefined) {
        map.set(clave, grupoId);
        return;
      }
      const ordenNuevo = ordenPorGrupo.get(grupoId) ?? Number.MAX_SAFE_INTEGER;
      const ordenExistente = ordenPorGrupo.get(existente) ?? Number.MAX_SAFE_INTEGER;
      if (ordenNuevo < ordenExistente) {
        map.set(clave, grupoId);
      }
    };

    for (const item of itemsRes.rows) {
      if (item.lado === 'BANCO' && item.extractoLineaId) {
        asignarMasReciente(grupoPorExtracto, item.extractoLineaId, item.grupoId);
      } else if (item.lado === 'LIBRO') {
        if (item.origenLibro === 'MOVIMIENTO_TESORERIA' && item.movimientoTesoreriaId) {
          asignarMasReciente(grupoPorMovTes, item.movimientoTesoreriaId, item.grupoId);
        } else if (item.origenLibro === 'ASIENTO_MANUAL' && item.asientoDetalleId) {
          asignarMasReciente(grupoPorAsientoDet, item.asientoDetalleId, item.grupoId);
          const estadoGrupo = estadoPorGrupo.get(item.grupoId);
          if (estadoGrupo === 'CONCILIADO' || estadoGrupo === 'CONCILIADO_MANUAL') {
            asignarMasReciente(conciliadoGrupoPorAsientoDet, item.asientoDetalleId, item.grupoId);
          }
        }
      }
    }
  }

  // 2. Líneas de extracto dentro de [fechaInicio, fechaFin]
  const lineasRes = await client.query(
    `SELECT el.id,
            el.extracto_id AS "extractoId",
            el.fecha::text AS fecha,
            el.descripcion,
            el.referencia,
            el.monto::text AS monto,
            el.saldo::text AS saldo,
            el.conciliada,
            el.estado_conciliacion AS "estadoConciliacionRaw",
            el.movimiento_tesoreria_id AS "movimientoTesoreriaId",
            el.diferencia_importe::text AS "diferenciaImporte",
            el.observacion_conciliacion AS "observacionConciliacion",
            el.conciliado_en AS "conciliadoEn",
            el.import_id AS "importId",
            el.linea_raw_id AS "lineaRawId",
            el.tipo_clasificacion AS "tipoClasificacion",
            el.ruc_extraido AS "rucExtraido",
            el.contraparte_extraida AS "contraparteExtraida",
            el.doc_extraido AS "docExtraido"
     FROM extracto_lineas el
     JOIN extractos_bancarios eb
       ON eb.id = el.extracto_id
      AND eb.empresa_id = el.empresa_id
     WHERE el.empresa_id = $1
       AND eb.cuenta_financiera_id = $2
       AND eb.estado <> 'ANULADO'
       AND el.fecha BETWEEN $3 AND $4
     ORDER BY el.fecha ASC, el.created_at ASC`,
    [empresaId, cuentaFinancieraId, fechaInicio, fechaFin]
  );

  const extractoLineas: PartidaExtractoV2[] = lineasRes.rows.map((r) => ({
    ...mapPartidaExtractoRow(r),
    grupoConciliacionId: grupoPorExtracto.get(r.id) ?? null,
  }));

  let abonosNoRegistradosDec = Money.create(0);
  let cargosNoRegistradosDec = Money.create(0);
  let conciliadasExtracto = 0;
  let pendientesLibros = 0;

  for (const linea of extractoLineas) {
    if (linea.conciliada) {
      conciliadasExtracto += 1;
      continue;
    }
    if (linea.estadoConciliacion === 'DUPLICADO') {
      continue;
    }
    pendientesLibros += 1;
    const montoDec = Money.create(linea.monto);
    if (montoDec.gt(0)) {
      abonosNoRegistradosDec = Money.add(abonosNoRegistradosDec, montoDec);
    } else if (montoDec.lt(0)) {
      cargosNoRegistradosDec = Money.add(cargosNoRegistradosDec, montoDec.abs());
    }
  }

  // 3. Saldo acumulado en Tesorería hasta fechaFin
  const saldoMovRes = await client.query<{ neto: string }>(
    `SELECT COALESCE(
              SUM(CASE WHEN tipo = 'INGRESO' THEN importe ELSE -importe END),
              0
            )::text AS neto
     FROM movimientos_tesoreria
     WHERE empresa_id = $1
       AND cuenta_financiera_id = $2
       AND fecha <= $3
       AND estado = 'REGISTRADO'`,
    [empresaId, cuentaFinancieraId, fechaFin]
  );

  const saldoLibrosDec = Money.add(cuenta.saldoInicial, saldoMovRes.rows[0]?.neto ?? '0');

  // 4. Movimientos de libros del periodo + pendientes en tránsito anteriores a fechaInicio
  const movsRes = await client.query(
    `SELECT mt.id,
            mt.periodo_id AS "periodoId",
            mt.cuenta_financiera_id AS "cuentaFinancieraId",
            mt.fecha::text AS fecha,
            mt.tipo,
            mt.medio_pago AS "medioPago",
            mt.numero_operacion AS "numeroOperacion",
            mt.moneda,
            mt.tipo_cambio::text AS "tipoCambio",
            mt.importe::text AS importe,
            mt.glosa,
            mt.estado,
            mt.conciliado,
            mt.estado_conciliacion_libro AS "estadoConciliacionLibroRaw",
            mt.asiento_id AS "asientoId",
            mt.anexo_id AS "anexoId",
            ax.razon_social AS "anexoNombre",
            ax.numero_documento AS "anexoRuc"
     FROM movimientos_tesoreria mt
     LEFT JOIN anexos ax
       ON ax.empresa_id = mt.empresa_id
      AND ax.id = mt.anexo_id
     WHERE mt.empresa_id = $1
       AND mt.cuenta_financiera_id = $2
       AND mt.estado = 'REGISTRADO'
       AND (
         mt.fecha BETWEEN $3 AND $4
         OR (mt.fecha < $3 AND mt.conciliado = false)
       )
     ORDER BY mt.fecha ASC, mt.created_at ASC`,
    [empresaId, cuentaFinancieraId, fechaInicio, fechaFin]
  );

  let depositosEnTransitoDec = Money.create(0);
  let chequesNoCobradosDec = Money.create(0);
  let conciliadosLibros = 0;
  let pendientesBanco = 0;
  let conteoChequesNoCobrados = 0;

  const movimientosLibros: PartidaLibroV2[] = movsRes.rows.map((r) => {
    const conciliado = Boolean(r.conciliado);
    const estadoDerivado = derivarEstadoLibroV2({
      conciliado,
      tipo: r.tipo,
      medioPago: r.medioPago,
    });
    const estadoLibroV2: EstadoLibroV2 =
      !conciliado && r.estadoConciliacionLibroRaw === 'CHEQUE_NO_COBRADO'
        ? 'CHEQUE_NO_COBRADO'
        : estadoDerivado;
    const importeDec = Money.round(r.importe ?? '0');
    const importeConSignoDec = r.tipo === 'INGRESO' ? importeDec : importeDec.negated();

    if (conciliado) {
      conciliadosLibros += 1;
    } else {
      if (estadoLibroV2 === 'CHEQUE_NO_COBRADO') {
        conteoChequesNoCobrados += 1;
      } else {
        pendientesBanco += 1;
      }

      if (r.tipo === 'INGRESO') {
        depositosEnTransitoDec = Money.add(depositosEnTransitoDec, importeDec);
      } else {
        chequesNoCobradosDec = Money.add(chequesNoCobradosDec, importeDec);
      }
    }

    return {
      id: r.id,
      periodoId: r.periodoId,
      cuentaFinancieraId: r.cuentaFinancieraId,
      fecha: r.fecha,
      tipo: r.tipo,
      medioPago: r.medioPago,
      numeroOperacion: r.numeroOperacion ?? null,
      moneda: r.moneda,
      tipoCambio: Money.create(r.tipoCambio ?? '1').toFixed(4),
      importe: Money.format(importeDec),
      importeConSigno: Money.format(importeConSignoDec),
      glosa: r.glosa,
      estado: r.estado,
      conciliado,
      estadoLibroV2,
      asientoId: r.asientoId ?? null,
      origen: 'MOVIMIENTO_TESORERIA',
      asientoDetalleId: null,
      docRef: r.numeroOperacion ?? null,
      anexoId: r.anexoId ?? null,
      anexoNombre: r.anexoNombre ?? null,
      anexoRuc: r.anexoRuc ?? null,
      grupoConciliacionId: grupoPorMovTes.get(r.id) ?? null,
    };
  });

  // 4b. Asientos manuales directos a la cuenta contable 104x sin movimiento de tesorería asociado
  //     (se devuelven en `asientosManualesLibros` sin alterar `movimientosLibros`, `conteos`, `saldoLibrosDec`
  //      ni `depositosEnTransito`/`chequesNoCobrados` para preservar 100% compatibilidad con Fase 1)
  const asientosManualesLibros: PartidaLibroV2[] = [];
  if (cuenta.cuentaContableId) {
    const manualesRes = await client.query(
      `SELECT ad.id,
              a.periodo_id AS "periodoId",
              a.fecha::text AS fecha,
              a.moneda,
              a.tipo_cambio::text AS "tipoCambio",
              ad.debe::text AS debe,
              ad.haber::text AS haber,
              ad.glosa_linea AS "glosaLinea",
              a.glosa AS "glosaAsiento",
              a.numero AS "numeroAsiento",
              a.estado,
              ad.asiento_id AS "asientoId",
              ad.doc_tipo AS "docTipo",
              ad.doc_serie AS "docSerie",
              ad.doc_numero AS "docNumero",
              ad.anexo_id AS "anexoId",
              ax.razon_social AS "anexoNombre",
              ax.numero_documento AS "anexoRuc"
       FROM asiento_detalle ad
       JOIN asientos a
         ON a.id = ad.asiento_id
        AND a.empresa_id = ad.empresa_id
       LEFT JOIN anexos ax
         ON ax.empresa_id = ad.empresa_id
        AND ax.id = ad.anexo_id
       WHERE ad.empresa_id = $1
         AND ad.cuenta_id = $2
         AND a.estado = 'CONTABILIZADO'
         AND (ad.debe > 0 OR ad.haber > 0)
         AND NOT EXISTS (
           SELECT 1
           FROM movimientos_tesoreria mt
           WHERE mt.empresa_id = a.empresa_id
             AND mt.asiento_id = a.id
             AND mt.estado <> 'ANULADO'
         )
         AND a.fecha <= $3
       ORDER BY a.fecha ASC, a.created_at ASC, ad.linea ASC`,
      [empresaId, cuenta.cuentaContableId, fechaFin]
    );

    for (const r of manualesRes.rows) {
      const conciliado = conciliadoGrupoPorAsientoDet.has(r.id);
      if (r.fecha < fechaInicio && conciliado) {
        continue;
      }

      const debeDec = Money.round(r.debe ?? '0');
      const haberDec = Money.round(r.haber ?? '0');
      const esIngreso = debeDec.gt(0);
      const importeDec = esIngreso ? debeDec : haberDec;
      const importeConSignoDec = esIngreso ? importeDec : importeDec.negated();
      const docRef = [r.docTipo, r.docSerie, r.docNumero].filter(Boolean).join('-') || null;
      const glosaLinea = typeof r.glosaLinea === 'string' ? r.glosaLinea.trim() : '';

      asientosManualesLibros.push({
        id: r.id,
        periodoId: r.periodoId,
        cuentaFinancieraId,
        fecha: r.fecha,
        tipo: esIngreso ? 'INGRESO' : 'EGRESO',
        medioPago: 'MANUAL',
        numeroOperacion: docRef ?? r.numeroAsiento ?? null,
        moneda: r.moneda,
        tipoCambio: Money.create(r.tipoCambio ?? '1').toFixed(4),
        importe: Money.format(importeDec),
        importeConSigno: Money.format(importeConSignoDec),
        glosa: glosaLinea.length > 0 ? glosaLinea : r.glosaAsiento,
        estado: r.estado,
        conciliado,
        estadoLibroV2: conciliado ? 'CONCILIADO' : 'PENDIENTE_BANCO',
        asientoId: r.asientoId,
        origen: 'ASIENTO_MANUAL',
        asientoDetalleId: r.id,
        docRef,
        anexoId: r.anexoId ?? null,
        anexoNombre: r.anexoNombre ?? null,
        anexoRuc: r.anexoRuc ?? null,
        grupoConciliacionId: grupoPorAsientoDet.get(r.id) ?? null,
      });
    }
  }

  // 5. Cálculo numérico puro con Money
  const numerico = calcularResumenNumericoConciliacionV2({
    tieneExtracto,
    saldoFinalExtracto,
    saldoLibros: saldoLibrosDec,
    depositosEnTransito: depositosEnTransitoDec,
    chequesNoCobrados: chequesNoCobradosDec,
    abonosNoRegistrados: abonosNoRegistradosDec,
    cargosNoRegistrados: cargosNoRegistradosDec,
    toleranciaMonto: config.toleranciaMonto,
  });

  // 6. Control de integridad vs Mayor 104x
  let integridadMayor: IntegridadMayor104x;
  if (!cuenta.cuentaContableId) {
    integridadMayor = {
      verificada: false,
      cuentaContableId: null,
      cuentaContableCodigo: cuenta.cuentaContableCodigo || null,
      saldoTesoreria: numerico.saldoLibros,
      saldoMayor104x: null,
      diferenciaIntegridadMayor: null,
      alertaIntegridad: true,
      motivoAlerta:
        'Cuenta financiera sin cuenta contable PCGE vinculada (cuenta_contable_id es NULL). Vincule una cuenta 10x para habilitar la conciliación y el control contra Mayor.',
    };
  } else {
    const mayorRes = await client.query<{ totalDebe: string; totalHaber: string }>(
      `SELECT COALESCE(SUM(ad.debe), 0)::text AS "totalDebe",
              COALESCE(SUM(ad.haber), 0)::text AS "totalHaber"
       FROM asiento_detalle ad
       JOIN asientos a
         ON a.id = ad.asiento_id
        AND a.empresa_id = ad.empresa_id
       WHERE ad.empresa_id = $1
         AND ad.cuenta_id = $2
         AND a.estado = 'CONTABILIZADO'
         AND a.fecha <= $3`,
      [empresaId, cuenta.cuentaContableId, fechaFin]
    );

    const totalDebeDec = Money.create(mayorRes.rows[0]?.totalDebe ?? '0');
    const totalHaberDec = Money.create(mayorRes.rows[0]?.totalHaber ?? '0');
    const saldoMayorDec = Money.sub(totalDebeDec, totalHaberDec);
    const diffIntegridadDec = Money.sub(saldoLibrosDec, saldoMayorDec);
    const alertaIntegridad = !Money.isEqual(diffIntegridadDec, 0);

    integridadMayor = {
      verificada: true,
      cuentaContableId: cuenta.cuentaContableId,
      cuentaContableCodigo: cuenta.cuentaContableCodigo,
      saldoTesoreria: numerico.saldoLibros,
      saldoMayor104x: Money.format(saldoMayorDec),
      diferenciaIntegridadMayor: Money.format(diffIntegridadDec),
      alertaIntegridad,
      motivoAlerta: alertaIntegridad
        ? `Descuadre entre Tesorería (${numerico.saldoLibros}) y Libro Mayor ${cuenta.cuentaContableCodigo} (${Money.format(saldoMayorDec)}) por ${Money.format(diffIntegridadDec)}.`
        : null,
    };
  }

  // 7. Estado de cierre en conciliaciones_bancarias
  const cierreRes = await client.query(
    `SELECT cb.id,
            cb.estado,
            cb.fecha_corte::text AS "fechaCorte",
            cb.cerrada_por AS "cerradaPor",
            cb.fecha_cierre AS "fechaCierre",
            cb.motivo_reapertura AS "motivoReapertura",
            cb.reabierta_por AS "reabiertaPor",
            cb.fecha_reapertura AS "fechaReapertura"
     FROM conciliaciones_bancarias cb
     JOIN periodos p
       ON p.id = cb.periodo_id
      AND p.empresa_id = cb.empresa_id
     WHERE cb.empresa_id = $1
       AND cb.cuenta_financiera_id = $2
       AND p.codigo_periodo = $3
     LIMIT 1`,
    [empresaId, cuentaFinancieraId, periodo]
  );

  const cierreRow = cierreRes.rows[0];

  return {
    empresaId,
    periodo,
    fechaInicio,
    fechaFin,
    cuenta,
    tieneExtracto,
    saldoInicialExtracto,
    saldoFinalExtracto: numerico.saldoFinalExtracto,
    saldoLibros: numerico.saldoLibros,
    depositosEnTransito: numerico.depositosEnTransito,
    chequesNoCobrados: numerico.chequesNoCobrados,
    abonosNoRegistrados: numerico.abonosNoRegistrados,
    cargosNoRegistrados: numerico.cargosNoRegistrados,
    saldoAjustadoBanco: numerico.saldoAjustadoBanco,
    saldoAjustadoLibros: numerico.saldoAjustadoLibros,
    diferencia: numerico.diferencia,
    semaforo: numerico.semaforo,
    toleranciaMonto: config.toleranciaMonto,
    integridadMayor,
    conciliacionPeriodo: {
      id: cierreRow?.id ?? null,
      estado: cierreRow?.estado === 'CERRADA' ? 'CERRADA' : 'ABIERTA',
      fechaCorte: cierreRow?.fechaCorte ?? null,
      cerradaPor: cierreRow?.cerradaPor ?? null,
      fechaCierre: cierreRow?.fechaCierre ? new Date(cierreRow.fechaCierre).toISOString() : null,
      motivoReapertura: cierreRow?.motivoReapertura ?? null,
      reabiertaPor: cierreRow?.reabiertaPor ?? null,
      fechaReapertura: cierreRow?.fechaReapertura
        ? new Date(cierreRow.fechaReapertura).toISOString()
        : null,
    },
    conteos: {
      totalExtracto: extractoLineas.length,
      conciliadasExtracto,
      pendientesLibros,
      totalLibros: movimientosLibros.length,
      conciliadosLibros,
      pendientesBanco,
      chequesNoCobrados: conteoChequesNoCobrados,
    },
    extractoLineas,
    movimientosLibros,
    asientosManualesLibros,
  };
}

// ============================================================================
// SERVICIO PRINCIPAL TRANSACCIONAL
// ============================================================================

export const conciliacionV2Service = {
  async obtenerConfig(empresaId: string): Promise<ConfigConciliacionV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    return db.withEmpresaTransaction(empresaId, (client) => obtenerConfigEnTx(client, empresaId));
  },

  async actualizarConfig(
    empresaId: string,
    userId: string,
    input: ActualizarConfigConciliacionV2Input
  ): Promise<ConfigConciliacionV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');

    const parsed = actualizarConfigSchema.parse(input);

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const actual = await obtenerConfigEnTx(client, empresaId);

      const siguienteHabilitada =
        parsed.conciliacionV2Habilitada !== undefined
          ? parsed.conciliacionV2Habilitada
          : actual.conciliacionV2Habilitada;
      const siguienteToleranciaDias =
        parsed.toleranciaDias !== undefined ? parsed.toleranciaDias : actual.toleranciaDias;
      const siguienteToleranciaMonto =
        parsed.toleranciaMonto !== undefined
          ? Money.format(parsed.toleranciaMonto)
          : actual.toleranciaMonto;
      const siguienteUmbralAutoMatch =
        parsed.umbralAutoMatch !== undefined
          ? Number(parsed.umbralAutoMatch.toFixed(4))
          : parsearUmbralAutoMatch(actual.umbralAutoMatch);
      const siguienteItf = parsed.cuentaItfCodigo ?? actual.cuentaItfCodigo;
      const siguienteComision = parsed.cuentaComisionCodigo ?? actual.cuentaComisionCodigo;
      const siguienteInteresGasto =
        parsed.cuentaInteresGastoCodigo ?? actual.cuentaInteresGastoCodigo;
      const siguienteInteresIngreso =
        parsed.cuentaInteresIngresoCodigo !== undefined
          ? parsed.cuentaInteresIngresoCodigo
          : actual.cuentaInteresIngresoCodigo;

      const codigosValidar = Array.from(
        new Set(
          [siguienteItf, siguienteComision, siguienteInteresGasto, siguienteInteresIngreso].filter(
            (c): c is string => typeof c === 'string' && c.trim().length > 0
          )
        )
      );

      if (codigosValidar.length > 0) {
        const planRes = await client.query<{
          codigo: string;
          isActive: boolean;
          esInactiva: boolean;
          permiteMovimiento: boolean;
        }>(
          `SELECT codigo,
                  is_active AS "isActive",
                  COALESCE(es_inactiva, false) AS "esInactiva",
                  permite_movimiento AS "permiteMovimiento"
           FROM plan_cuentas
           WHERE empresa_id = $1 AND codigo = ANY($2::varchar[])`,
          [empresaId, codigosValidar]
        );

        const mapaPlan = new Map(planRes.rows.map((r) => [r.codigo, r]));

        for (const codigo of codigosValidar) {
          const cuentaPlan = mapaPlan.get(codigo);
          if (!cuentaPlan || cuentaPlan.isActive !== true || cuentaPlan.esInactiva !== false) {
            throw new ConciliacionV2Error(
              409,
              'CUENTA_PCGE_INEXISTENTE_EN_EMPRESA',
              `La cuenta PCGE "${codigo}" no existe o no está activa (is_active = true) en el plan de cuentas de la empresa.`
            );
          }
          if (cuentaPlan.permiteMovimiento !== true) {
            throw new ConciliacionV2Error(
              409,
              'CUENTA_PCGE_NO_IMPUTABLE',
              `La cuenta PCGE "${codigo}" es una cuenta título o de agrupación (permite_movimiento = false) y no puede configurarse para asientos.`
            );
          }
        }
      }

      const upsertRes = await client.query(
        `INSERT INTO conciliacion_config_empresa (
          empresa_id,
          conciliacion_v2_habilitada,
          tolerancia_dias,
          tolerancia_monto,
          umbral_auto_match,
          cuenta_itf_codigo,
          cuenta_comision_codigo,
          cuenta_interes_gasto_codigo,
          cuenta_interes_ingreso_codigo,
          updated_by,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
        ON CONFLICT (empresa_id) DO UPDATE SET
          conciliacion_v2_habilitada = EXCLUDED.conciliacion_v2_habilitada,
          tolerancia_dias = EXCLUDED.tolerancia_dias,
          tolerancia_monto = EXCLUDED.tolerancia_monto,
          umbral_auto_match = EXCLUDED.umbral_auto_match,
          cuenta_itf_codigo = EXCLUDED.cuenta_itf_codigo,
          cuenta_comision_codigo = EXCLUDED.cuenta_comision_codigo,
          cuenta_interes_gasto_codigo = EXCLUDED.cuenta_interes_gasto_codigo,
          cuenta_interes_ingreso_codigo = EXCLUDED.cuenta_interes_ingreso_codigo,
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
        RETURNING empresa_id AS "empresaId",
                  conciliacion_v2_habilitada AS "conciliacionV2Habilitada",
                  tolerancia_dias AS "toleranciaDias",
                  tolerancia_monto::text AS "toleranciaMonto",
                  umbral_auto_match::float8 AS "umbralAutoMatch",
                  cuenta_itf_codigo AS "cuentaItfCodigo",
                  cuenta_comision_codigo AS "cuentaComisionCodigo",
                  cuenta_interes_gasto_codigo AS "cuentaInteresGastoCodigo",
                  cuenta_interes_ingreso_codigo AS "cuentaInteresIngresoCodigo",
                  updated_by AS "updatedBy",
                  updated_at AS "updatedAt"`,
        [
          empresaId,
          siguienteHabilitada,
          siguienteToleranciaDias,
          siguienteToleranciaMonto,
          siguienteUmbralAutoMatch,
          siguienteItf,
          siguienteComision,
          siguienteInteresGasto,
          siguienteInteresIngreso,
          userId,
        ]
      );

      const saved = upsertRes.rows[0];
      const resultado: ConfigConciliacionV2 = {
        empresaId: saved.empresaId,
        conciliacionV2Habilitada: Boolean(saved.conciliacionV2Habilitada),
        toleranciaDias: Number(saved.toleranciaDias),
        toleranciaMonto: Money.format(saved.toleranciaMonto ?? '0'),
        umbralAutoMatch: parsearUmbralAutoMatch(saved.umbralAutoMatch),
        cuentaItfCodigo: saved.cuentaItfCodigo,
        cuentaComisionCodigo: saved.cuentaComisionCodigo,
        cuentaInteresGastoCodigo: saved.cuentaInteresGastoCodigo,
        cuentaInteresIngresoCodigo: saved.cuentaInteresIngresoCodigo ?? null,
        sugerenciaCuentaInteresIngreso: SUGERENCIA_INTERES_INGRESO,
        configuradaEnBd: true,
        updatedBy: saved.updatedBy ?? null,
        updatedAt: saved.updatedAt ? new Date(saved.updatedAt).toISOString() : null,
      };

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'conciliacion_config_empresa',
        registroId: empresaId,
        accion: actual.configuradaEnBd ? 'UPDATE' : 'INSERT',
        datosAnteriores: actual.configuradaEnBd
          ? {
              conciliacionV2Habilitada: actual.conciliacionV2Habilitada,
              toleranciaDias: actual.toleranciaDias,
              toleranciaMonto: actual.toleranciaMonto,
              umbralAutoMatch: parsearUmbralAutoMatch(actual.umbralAutoMatch),
              cuentaItfCodigo: actual.cuentaItfCodigo,
              cuentaComisionCodigo: actual.cuentaComisionCodigo,
              cuentaInteresGastoCodigo: actual.cuentaInteresGastoCodigo,
              cuentaInteresIngresoCodigo: actual.cuentaInteresIngresoCodigo,
              updatedBy: actual.updatedBy,
            }
          : null,
        datosNuevos: {
          conciliacionV2Habilitada: resultado.conciliacionV2Habilitada,
          toleranciaDias: resultado.toleranciaDias,
          toleranciaMonto: resultado.toleranciaMonto,
          umbralAutoMatch: resultado.umbralAutoMatch,
          cuentaItfCodigo: resultado.cuentaItfCodigo,
          cuentaComisionCodigo: resultado.cuentaComisionCodigo,
          cuentaInteresGastoCodigo: resultado.cuentaInteresGastoCodigo,
          cuentaInteresIngresoCodigo: resultado.cuentaInteresIngresoCodigo,
          updatedBy: resultado.updatedBy,
        },
      });

      return resultado;
    });
  },

  async listarCuentas(empresaId: string): Promise<CuentaBancariaV2[]> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const res = await client.query(
        `SELECT cf.id,
                cf.empresa_id AS "empresaId",
                cf.tipo,
                cf.banco,
                cf.numero,
                cf.moneda,
                cf.cci,
                cf.alias,
                cf.cuenta_contable_id AS "cuentaContableId",
                COALESCE(pc.codigo, cf.cuenta_contable_codigo) AS "cuentaContableCodigo",
                pc.nombre AS "cuentaContableNombre",
                cf.saldo_inicial::text AS "saldoInicial",
                cf.saldo_actual::text AS "saldoActual",
                cf.activa
         FROM cuentas_financieras cf
         LEFT JOIN plan_cuentas pc
           ON pc.empresa_id = cf.empresa_id
          AND pc.id = cf.cuenta_contable_id
         WHERE cf.empresa_id = $1
         ORDER BY cf.activa DESC, cf.banco ASC, cf.numero ASC`,
        [empresaId]
      );

      return res.rows.map(mapCuentaBancariaRow);
    });
  },

  async listarCuentasContablesDisponibles(empresaId: string): Promise<CuentaContableDisponibleV2[]> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const res = await client.query(
        `SELECT id,
                codigo,
                nombre,
                nivel,
                tipo_cuenta AS "tipoCuenta",
                permite_movimiento AS "permiteMovimiento",
                is_active AS "isActive"
         FROM plan_cuentas
         WHERE empresa_id = $1
           AND codigo LIKE '10%'
           AND is_active = true
           AND COALESCE(es_inactiva, false) = false
           AND permite_movimiento = true
         ORDER BY codigo ASC`,
        [empresaId]
      );

      return res.rows.map((r) => ({
        id: r.id,
        codigo: r.codigo,
        nombre: r.nombre,
        nivel: Number(r.nivel),
        tipoCuenta: r.tipoCuenta,
        permiteMovimiento: Boolean(r.permiteMovimiento),
        isActive: Boolean(r.isActive),
      }));
    });
  },

  async vincularCuentaContable(
    empresaId: string,
    cuentaId: string,
    userId: string,
    input: VincularCuentaContableInput
  ): Promise<CuentaBancariaV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(cuentaId, 'cuentaId');
    asegurarUuid(userId, 'userId');

    const parsed = vincularCuentaSchema.parse(input);

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const cuentaAnterior = await obtenerCuentaBancariaEnTx(client, empresaId, cuentaId);

      const pcRes = await client.query<{
        id: string;
        codigo: string;
        nombre: string;
        isActive: boolean;
        esInactiva: boolean;
        permiteMovimiento: boolean;
      }>(
        `SELECT id,
                codigo,
                nombre,
                is_active AS "isActive",
                COALESCE(es_inactiva, false) AS "esInactiva",
                permite_movimiento AS "permiteMovimiento"
         FROM plan_cuentas
         WHERE empresa_id = $1 AND id = $2`,
        [empresaId, parsed.cuentaContableId]
      );

      if (pcRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'CUENTA_CONTABLE_NO_ENCONTRADA',
          'La cuenta contable indicada no existe en el plan de cuentas de la empresa.'
        );
      }

      const pc = pcRes.rows[0];
      if (!String(pc.codigo).startsWith('10')) {
        throw new ConciliacionV2Error(
          409,
          'CUENTA_PCGE_INVALIDA_PARA_BANCO',
          `La cuenta contable ${pc.codigo} no pertenece al grupo 10 (Efectivo y Equivalentes de Efectivo) y no puede vincularse a una cuenta financiera.`
        );
      }
      if (!pc.isActive || pc.esInactiva) {
        throw new ConciliacionV2Error(
          409,
          'CUENTA_CONTABLE_INACTIVA',
          `La cuenta contable ${pc.codigo} está inactiva en la empresa.`
        );
      }
      if (!pc.permiteMovimiento) {
        throw new ConciliacionV2Error(
          409,
          'CUENTA_CONTABLE_NO_PERMITE_MOVIMIENTO',
          `La cuenta contable ${pc.codigo} no es de movimiento (permite_movimiento = false).`
        );
      }

      const actualizarCci = parsed.cci !== undefined;
      const nuevoCci = parsed.cci === undefined ? cuentaAnterior.cci : parsed.cci || null;

      await client.query(
        `UPDATE cuentas_financieras
         SET cuenta_contable_id = $1,
             cuenta_contable_codigo = $2,
             cci = CASE WHEN $3::boolean THEN $4 ELSE cci END,
             updated_at = CURRENT_TIMESTAMP
         WHERE empresa_id = $5 AND id = $6`,
        [pc.id, pc.codigo, actualizarCci, nuevoCci, empresaId, cuentaId]
      );

      const cuentaNueva = await obtenerCuentaBancariaEnTx(client, empresaId, cuentaId);

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'cuentas_financieras',
        registroId: cuentaId,
        accion: 'UPDATE',
        datosAnteriores: {
          cuentaContableId: cuentaAnterior.cuentaContableId,
          cuentaContableCodigo: cuentaAnterior.cuentaContableCodigo,
          cci: cuentaAnterior.cci,
        },
        datosNuevos: {
          cuentaContableId: cuentaNueva.cuentaContableId,
          cuentaContableCodigo: cuentaNueva.cuentaContableCodigo,
          cci: cuentaNueva.cci,
        },
      });

      return cuentaNueva;
    });
  },

  async obtenerResumenConciliacion(
    empresaId: string,
    cuentaFinancieraId: string,
    periodo: string
  ): Promise<ResumenConciliacionV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(cuentaFinancieraId, 'cuentaFinancieraId');
    resolverRangoPeriodo(periodo);

    return db.withEmpresaTransaction(empresaId, (client) =>
      obtenerResumenConciliacionEnTx(client, empresaId, cuentaFinancieraId, periodo)
    );
  },

  async conciliarPartida(
    empresaId: string,
    userId: string,
    input: ConciliarPartidaV2Input
  ): Promise<PartidaExtractoV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');

    const parsed = conciliarPartidaSchema.parse(input);
    const estadoDestino = parsed.estadoConciliacion ?? 'CONCILIADO_MANUAL';

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const cuentaLookupRes = await client.query<{ cuentaFinancieraId: string }>(
        `SELECT eb.cuenta_financiera_id AS "cuentaFinancieraId"
         FROM extracto_lineas el
         JOIN extractos_bancarios eb
           ON eb.id = el.extracto_id
          AND eb.empresa_id = el.empresa_id
         WHERE el.id = $1 AND el.empresa_id = $2`,
        [parsed.extractoLineaId, empresaId]
      );

      if (cuentaLookupRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'PARTIDA_EXTRACTO_NO_ENCONTRADA',
          'La partida del extracto bancario no existe para esta empresa.'
        );
      }

      await client.query(
        `SELECT id
         FROM cuentas_financieras
         WHERE empresa_id = $1 AND id = $2
         FOR UPDATE`,
        [empresaId, cuentaLookupRes.rows[0].cuentaFinancieraId]
      );

      const lineaRes = await client.query<{
        id: string;
        extractoId: string;
        fecha: string;
        descripcion: string;
        referencia: string | null;
        monto: string;
        conciliada: boolean;
        estadoConciliacionRaw: string | null;
        movimientoTesoreriaId: string | null;
        diferenciaImporte: string;
        observacionConciliacion: string | null;
        cuentaFinancieraId: string;
        extractoEstado: string;
        cuentaContableId: string | null;
      }>(
        `SELECT el.id,
                el.extracto_id AS "extractoId",
                el.fecha::text AS fecha,
                el.descripcion,
                el.referencia,
                el.monto::text AS monto,
                el.conciliada,
                el.estado_conciliacion AS "estadoConciliacionRaw",
                el.movimiento_tesoreria_id AS "movimientoTesoreriaId",
                el.diferencia_importe::text AS "diferenciaImporte",
                el.observacion_conciliacion AS "observacionConciliacion",
                eb.cuenta_financiera_id AS "cuentaFinancieraId",
                eb.estado AS "extractoEstado",
                cf.cuenta_contable_id AS "cuentaContableId"
         FROM extracto_lineas el
         JOIN extractos_bancarios eb
           ON eb.id = el.extracto_id
          AND eb.empresa_id = el.empresa_id
         JOIN cuentas_financieras cf
           ON cf.id = eb.cuenta_financiera_id
          AND cf.empresa_id = eb.empresa_id
         WHERE el.id = $1 AND el.empresa_id = $2
         FOR UPDATE OF el`,
        [parsed.extractoLineaId, empresaId]
      );

      if (lineaRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'PARTIDA_EXTRACTO_NO_ENCONTRADA',
          'La partida del extracto bancario no existe para esta empresa.'
        );
      }

      const linea = lineaRes.rows[0];
      if (linea.extractoEstado === 'ANULADO') {
        throw new ConciliacionV2Error(
          409,
          'EXTRACTO_ANULADO',
          'No se puede conciliar una línea perteneciente a un extracto anulado.'
        );
      }

      validarPrecondicionOperacionCuenta(linea.cuentaContableId);

      const codigoPeriodoLinea = linea.fecha.slice(0, 7);
      await verificarPeriodoNoCerradoEnTx(
        client,
        empresaId,
        linea.cuentaFinancieraId,
        codigoPeriodoLinea
      );

      const movAnteriorId = linea.movimientoTesoreriaId;
      const movNuevoId = parsed.movimientoTesoreriaId ?? null;
      let diferenciaImporteDec = Money.create(0);

      if (movNuevoId) {
        const movRes = await client.query<{
          id: string;
          cuentaFinancieraId: string;
          fecha: string;
          tipo: string;
          importe: string;
          estado: string;
        }>(
          `SELECT id,
                  cuenta_financiera_id AS "cuentaFinancieraId",
                  fecha::text AS fecha,
                  tipo,
                  importe::text AS importe,
                  estado
           FROM movimientos_tesoreria
           WHERE id = $1 AND empresa_id = $2
           FOR UPDATE`,
          [movNuevoId, empresaId]
        );

        if (movRes.rows.length === 0) {
          throw new ConciliacionV2Error(
            404,
            'MOVIMIENTO_TESORERIA_NO_ENCONTRADO',
            'El movimiento de tesorería indicado no existe para esta empresa.'
          );
        }

        const mov = movRes.rows[0];
        if (mov.cuentaFinancieraId !== linea.cuentaFinancieraId) {
          throw new ConciliacionV2Error(
            409,
            'CUENTA_FINANCIERA_INCOMPATIBLE',
            'El movimiento de tesorería pertenece a una cuenta financiera distinta a la del extracto.'
          );
        }
        if (mov.estado === 'ANULADO') {
          throw new ConciliacionV2Error(
            409,
            'MOVIMIENTO_ANULADO',
            'No se puede conciliar contra un movimiento de tesorería anulado.'
          );
        }

        const codigoPeriodoMov = mov.fecha.slice(0, 7);
        if (codigoPeriodoMov !== codigoPeriodoLinea) {
          await verificarPeriodoNoCerradoEnTx(
            client,
            empresaId,
            linea.cuentaFinancieraId,
            codigoPeriodoMov
          );
        }

        const dupLinkRes = await client.query<{ id: string }>(
          `SELECT id
           FROM extracto_lineas
           WHERE empresa_id = $1
             AND movimiento_tesoreria_id = $2
             AND conciliada = true
             AND id <> $3
           LIMIT 1`,
          [empresaId, movNuevoId, linea.id]
        );
        if (dupLinkRes.rows.length > 0) {
          throw new ConciliacionV2Error(
            409,
            'MOVIMIENTO_YA_CONCILIADO',
            'El movimiento de tesorería ya se encuentra conciliado con otra línea del extracto.'
          );
        }

        const montoExtractoDec = Money.round(linea.monto);
        const montoLibroDec = Money.round(mov.importe);
        const montoLibroConSigno = mov.tipo === 'INGRESO' ? montoLibroDec : montoLibroDec.negated();
        diferenciaImporteDec = Money.sub(montoExtractoDec, montoLibroConSigno);

        await client.query(
          `UPDATE movimientos_tesoreria
           SET conciliado = true,
               estado_conciliacion_libro = 'CONCILIADO',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND empresa_id = $2`,
          [movNuevoId, empresaId]
        );
      }

      if (movAnteriorId && movAnteriorId !== movNuevoId) {
        const otrasRefsRes = await client.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total
           FROM extracto_lineas
           WHERE empresa_id = $1
             AND movimiento_tesoreria_id = $2
             AND conciliada = true
             AND id <> $3`,
          [empresaId, movAnteriorId, linea.id]
        );
        const otrosGruposRes = await client.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total
           FROM conciliacion_item ci
           JOIN conciliacion_grupo cg
             ON cg.id = ci.grupo_id
            AND cg.empresa_id = ci.empresa_id
           WHERE ci.empresa_id = $1
             AND ci.lado = 'LIBRO'
             AND ci.origen_libro = 'MOVIMIENTO_TESORERIA'
             AND ci.movimiento_tesoreria_id = $2
             AND cg.estado IN ('CONCILIADO', 'CONCILIADO_MANUAL')`,
          [empresaId, movAnteriorId]
        );
        if (
          Number(otrasRefsRes.rows[0]?.total ?? '0') === 0 &&
          Number(otrosGruposRes.rows[0]?.total ?? '0') === 0
        ) {
          await client.query(
            `UPDATE movimientos_tesoreria
             SET conciliado = false,
                 estado_conciliacion_libro = CASE
                   WHEN tipo = 'EGRESO' AND medio_pago = '007' THEN 'CHEQUE_NO_COBRADO'
                   ELSE 'PENDIENTE_BANCO'
                 END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND empresa_id = $2`,
            [movAnteriorId, empresaId]
          );
        }
      }

      const diferenciaFormateada = Money.format(diferenciaImporteDec);
      const updRes = await client.query(
        `UPDATE extracto_lineas
         SET conciliada = true,
             estado_conciliacion = $1,
             movimiento_tesoreria_id = $2,
             diferencia_importe = $3,
             observacion_conciliacion = $4,
             conciliado_en = CURRENT_TIMESTAMP
         WHERE id = $5 AND empresa_id = $6
         RETURNING id,
                   extracto_id AS "extractoId",
                   fecha::text AS fecha,
                   descripcion,
                   referencia,
                   monto::text AS monto,
                   saldo::text AS saldo,
                   conciliada,
                   estado_conciliacion AS "estadoConciliacionRaw",
                   movimiento_tesoreria_id AS "movimientoTesoreriaId",
                   diferencia_importe::text AS "diferenciaImporte",
                   observacion_conciliacion AS "observacionConciliacion",
                   conciliado_en AS "conciliadoEn",
                   import_id AS "importId",
                   linea_raw_id AS "lineaRawId",
                   tipo_clasificacion AS "tipoClasificacion",
                   ruc_extraido AS "rucExtraido",
                   contraparte_extraida AS "contraparteExtraida",
                   doc_extraido AS "docExtraido"`,
        [
          estadoDestino,
          movNuevoId,
          diferenciaFormateada,
          parsed.observacion ?? null,
          linea.id,
          empresaId,
        ]
      );

      // Rechazar grupos SUGERIDO vinculados a la línea o al movimiento conciliado
      const sugeridosRes = await client.query<{ id: string; observacion: string | null }>(
        `SELECT cg.id, cg.observacion
         FROM conciliacion_grupo cg
         WHERE cg.empresa_id = $1
           AND cg.estado = 'SUGERIDO'
           AND EXISTS (
             SELECT 1
             FROM conciliacion_item ci
             WHERE ci.empresa_id = cg.empresa_id
               AND ci.grupo_id = cg.id
               AND (
                 (ci.lado = 'BANCO' AND ci.extracto_linea_id = $2)
                 OR (
                   $3::uuid IS NOT NULL
                   AND ci.lado = 'LIBRO'
                   AND ci.origen_libro = 'MOVIMIENTO_TESORERIA'
                   AND ci.movimiento_tesoreria_id = $3
                 )
               )
           )
         FOR UPDATE OF cg`,
        [empresaId, linea.id, movNuevoId]
      );

      if (sugeridosRes.rows.length > 0) {
        const sugeridoIds = sugeridosRes.rows.map((r) => r.id);
        const motivoRechazo = 'Superpuesto por conciliación individual de partida';

        const otrasLineasSugRes = await client.query<{ extractoLineaId: string }>(
          `SELECT DISTINCT extracto_linea_id AS "extractoLineaId"
           FROM conciliacion_item
           WHERE empresa_id = $1
             AND grupo_id = ANY($2::uuid[])
             AND lado = 'BANCO'
             AND extracto_linea_id IS NOT NULL
             AND extracto_linea_id <> $3`,
          [empresaId, sugeridoIds, linea.id]
        );

        await client.query(
          `UPDATE conciliacion_grupo
           SET estado = 'RECHAZADO',
               observacion = CASE
                 WHEN observacion IS NULL OR observacion = '' THEN $1
                 ELSE observacion || ' [' || $1 || ']'
               END,
               updated_at = CURRENT_TIMESTAMP
           WHERE empresa_id = $2 AND id = ANY($3::uuid[])`,
          [motivoRechazo, empresaId, sugeridoIds]
        );

        const otrasLineasIds = otrasLineasSugRes.rows.map((r) => r.extractoLineaId);
        if (otrasLineasIds.length > 0) {
          await client.query(
            `UPDATE extracto_lineas el
             SET estado_conciliacion = 'PENDIENTE_LIBROS'
             WHERE el.empresa_id = $1
               AND el.id = ANY($2::uuid[])
               AND el.conciliada = false
               AND el.estado_conciliacion = 'SUGERIDO'
               AND NOT EXISTS (
                 SELECT 1
                 FROM conciliacion_item ci
                 JOIN conciliacion_grupo cg
                   ON cg.id = ci.grupo_id
                  AND cg.empresa_id = ci.empresa_id
                 WHERE ci.empresa_id = el.empresa_id
                   AND ci.lado = 'BANCO'
                   AND ci.extracto_linea_id = el.id
                   AND cg.estado IN ('SUGERIDO', 'CONCILIADO', 'CONCILIADO_MANUAL')
               )`,
            [empresaId, otrasLineasIds]
          );
        }

        for (const sg of sugeridosRes.rows) {
          const nuevaObs = sg.observacion
            ? `${sg.observacion} [${motivoRechazo}]`
            : motivoRechazo;
          await registrarAuditoriaEnTx(client, {
            empresaId,
            usuarioId: userId,
            tablaAfectada: 'conciliacion_grupo',
            registroId: sg.id,
            accion: 'UPDATE',
            datosAnteriores: {
              estado: 'SUGERIDO',
              observacion: sg.observacion,
            },
            datosNuevos: {
              estado: 'RECHAZADO',
              observacion: nuevaObs,
              motivo: motivoRechazo,
              gruposRechazadosIds: sugeridoIds,
            },
          });
        }
      }

      const partidaActualizada = mapPartidaExtractoRow(updRes.rows[0]);

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'extracto_lineas',
        registroId: linea.id,
        accion: 'UPDATE',
        datosAnteriores: {
          extractoId: linea.extractoId,
          conciliada: linea.conciliada,
          estadoConciliacion: derivarEstadoEfectivoExtracto(
            Boolean(linea.conciliada),
            linea.estadoConciliacionRaw
          ),
          movimientoTesoreriaId: linea.movimientoTesoreriaId,
          diferenciaImporte: Money.format(linea.diferenciaImporte ?? '0'),
          observacionConciliacion: linea.observacionConciliacion,
        },
        datosNuevos: {
          extractoId: partidaActualizada.extractoId,
          conciliada: partidaActualizada.conciliada,
          estadoConciliacion: partidaActualizada.estadoConciliacion,
          movimientoTesoreriaId: partidaActualizada.movimientoTesoreriaId,
          diferenciaImporte: partidaActualizada.diferenciaImporte,
          observacionConciliacion: partidaActualizada.observacionConciliacion,
          conciliadoEn: partidaActualizada.conciliadoEn,
        },
      });

      return partidaActualizada;
    });
  },

  async desconciliarPartida(
    empresaId: string,
    userId: string,
    input: DesconciliarPartidaV2Input
  ): Promise<PartidaExtractoV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');

    const parsed = desconciliarPartidaSchema.parse(input);

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const cuentaLookupRes = await client.query<{ cuentaFinancieraId: string }>(
        `SELECT eb.cuenta_financiera_id AS "cuentaFinancieraId"
         FROM extracto_lineas el
         JOIN extractos_bancarios eb
           ON eb.id = el.extracto_id
          AND eb.empresa_id = el.empresa_id
         WHERE el.id = $1 AND el.empresa_id = $2`,
        [parsed.extractoLineaId, empresaId]
      );

      if (cuentaLookupRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'PARTIDA_EXTRACTO_NO_ENCONTRADA',
          'La partida del extracto bancario no existe para esta empresa.'
        );
      }

      await client.query(
        `SELECT id
         FROM cuentas_financieras
         WHERE empresa_id = $1 AND id = $2
         FOR UPDATE`,
        [empresaId, cuentaLookupRes.rows[0].cuentaFinancieraId]
      );

      const lineaRes = await client.query<{
        id: string;
        extractoId: string;
        fecha: string;
        conciliada: boolean;
        estadoConciliacionRaw: string | null;
        movimientoTesoreriaId: string | null;
        diferenciaImporte: string;
        observacionConciliacion: string | null;
        cuentaFinancieraId: string;
        cuentaContableId: string | null;
      }>(
        `SELECT el.id,
                el.extracto_id AS "extractoId",
                el.fecha::text AS fecha,
                el.conciliada,
                el.estado_conciliacion AS "estadoConciliacionRaw",
                el.movimiento_tesoreria_id AS "movimientoTesoreriaId",
                el.diferencia_importe::text AS "diferenciaImporte",
                el.observacion_conciliacion AS "observacionConciliacion",
                eb.cuenta_financiera_id AS "cuentaFinancieraId",
                cf.cuenta_contable_id AS "cuentaContableId"
         FROM extracto_lineas el
         JOIN extractos_bancarios eb
           ON eb.id = el.extracto_id
          AND eb.empresa_id = el.empresa_id
         JOIN cuentas_financieras cf
           ON cf.id = eb.cuenta_financiera_id
          AND cf.empresa_id = eb.empresa_id
         WHERE el.id = $1 AND el.empresa_id = $2
         FOR UPDATE OF el`,
        [parsed.extractoLineaId, empresaId]
      );

      if (lineaRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'PARTIDA_EXTRACTO_NO_ENCONTRADA',
          'La partida del extracto bancario no existe para esta empresa.'
        );
      }

      const linea = lineaRes.rows[0];
      validarPrecondicionOperacionCuenta(linea.cuentaContableId);

      const codigoPeriodo = linea.fecha.slice(0, 7);
      await verificarPeriodoNoCerradoEnTx(client, empresaId, linea.cuentaFinancieraId, codigoPeriodo);

      const estadoAnteriorBanco = derivarEstadoEfectivoExtracto(
        Boolean(linea.conciliada),
        linea.estadoConciliacionRaw
      );

      // Verificar si la partida pertenece a algún grupo activo de Fase 3
      const gruposActivosRes = await client.query<{
        id: string;
        periodoId: string;
        codigoPeriodo: string;
        tipoMatch: string;
        reglaAplicada: string;
        capaMatching: number;
        score: number;
        estado: string;
        diferenciaMonto: string;
        observacion: string | null;
        totalItems: number;
        totalBanco: number;
        totalLibro: number;
      }>(
        `SELECT cg.id,
                cg.periodo_id AS "periodoId",
                p.codigo_periodo AS "codigoPeriodo",
                cg.tipo_match AS "tipoMatch",
                cg.regla_aplicada AS "reglaAplicada",
                cg.capa_matching AS "capaMatching",
                cg.score::float8 AS score,
                cg.estado,
                cg.diferencia_monto::text AS "diferenciaMonto",
                cg.observacion,
                (
                  SELECT COUNT(*)::int
                  FROM conciliacion_item ci2
                  WHERE ci2.empresa_id = cg.empresa_id
                    AND ci2.grupo_id = cg.id
                ) AS "totalItems",
                (
                  SELECT COUNT(*)::int
                  FROM conciliacion_item ci2
                  WHERE ci2.empresa_id = cg.empresa_id
                    AND ci2.grupo_id = cg.id
                    AND ci2.lado = 'BANCO'
                ) AS "totalBanco",
                (
                  SELECT COUNT(*)::int
                  FROM conciliacion_item ci2
                  WHERE ci2.empresa_id = cg.empresa_id
                    AND ci2.grupo_id = cg.id
                    AND ci2.lado = 'LIBRO'
                ) AS "totalLibro"
         FROM conciliacion_grupo cg
         JOIN periodos p
           ON p.id = cg.periodo_id
          AND p.empresa_id = cg.empresa_id
         WHERE cg.empresa_id = $1
           AND cg.estado IN ('CONCILIADO', 'CONCILIADO_MANUAL')
           AND EXISTS (
             SELECT 1
             FROM conciliacion_item ci
             WHERE ci.empresa_id = cg.empresa_id
               AND ci.grupo_id = cg.id
               AND ci.lado = 'BANCO'
               AND ci.extracto_linea_id = $2
           )
         FOR UPDATE OF cg`,
        [empresaId, linea.id]
      );

      for (const g of gruposActivosRes.rows) {
        if (g.totalBanco > 1 || g.totalLibro > 1 || g.totalItems > 2) {
          throw new ConciliacionV2Error(
            409,
            'GRUPO_CONCILIACION_COMPUESTO',
            'Esta partida pertenece a un grupo de conciliación compuesto (1:N / N:1). Desconcilie el grupo completo desde matching.'
          );
        }
      }

      const movIdsCandidatos = new Set<string>();
      if (linea.movimientoTesoreriaId) {
        movIdsCandidatos.add(linea.movimientoTesoreriaId);
      }

      interface Grupo1a1DesconciliadoInfo {
        grupo: (typeof gruposActivosRes.rows)[number];
        items: Array<{
          id: string;
          lado: string;
          origenLibro: string | null;
          extractoLineaId: string | null;
          movimientoTesoreriaId: string | null;
          asientoId: string | null;
          asientoDetalleId: string | null;
          montoImputado: string;
        }>;
        movimientoId: string | null;
        asientoId: string | null;
        estadoAnteriorLibro: string;
        estadosPreviosBanco: Array<{ id: string; estadoConciliacion: string; conciliada: boolean }>;
        estadosPreviosLibro: Array<{ id: string; estadoConciliacionLibro: string; conciliado: boolean }>;
      }

      const grupos1a1Info: Grupo1a1DesconciliadoInfo[] = [];

      for (const g of gruposActivosRes.rows) {
        if (g.codigoPeriodo !== codigoPeriodo) {
          await verificarPeriodoNoCerradoEnTx(
            client,
            empresaId,
            linea.cuentaFinancieraId,
            g.codigoPeriodo
          );
        }

        const itemsRes = await client.query<{
          id: string;
          lado: string;
          origenLibro: string | null;
          extractoLineaId: string | null;
          movimientoTesoreriaId: string | null;
          asientoId: string | null;
          asientoDetalleId: string | null;
          montoImputado: string;
        }>(
          `SELECT id,
                  lado,
                  origen_libro AS "origenLibro",
                  extracto_linea_id AS "extractoLineaId",
                  movimiento_tesoreria_id AS "movimientoTesoreriaId",
                  asiento_id AS "asientoId",
                  asiento_detalle_id AS "asientoDetalleId",
                  monto_imputado::text AS "montoImputado"
           FROM conciliacion_item
           WHERE empresa_id = $1 AND grupo_id = $2`,
          [empresaId, g.id]
        );

        const estadosPreviosBanco = [
          {
            id: linea.id,
            estadoConciliacion: estadoAnteriorBanco,
            conciliada: Boolean(linea.conciliada),
          },
        ];
        const estadosPreviosLibro: Array<{
          id: string;
          estadoConciliacionLibro: string;
          conciliado: boolean;
        }> = [];

        let movGrupoId: string | null = null;
        let asientoGrupoId: string | null = null;
        let estadoAnteriorLibro = 'CONCILIADO';

        const itemLibro = itemsRes.rows.find((it) => it.lado === 'LIBRO');
        if (itemLibro?.origenLibro === 'MOVIMIENTO_TESORERIA' && itemLibro.movimientoTesoreriaId) {
          movGrupoId = itemLibro.movimientoTesoreriaId;
          movIdsCandidatos.add(movGrupoId);

          const movPrevRes = await client.query<{
            id: string;
            fecha: string;
            conciliado: boolean;
            estadoConciliacionLibro: string;
          }>(
            `SELECT id,
                    fecha::text AS fecha,
                    conciliado,
                    estado_conciliacion_libro AS "estadoConciliacionLibro"
             FROM movimientos_tesoreria
             WHERE empresa_id = $1 AND id = $2
             FOR UPDATE`,
            [empresaId, movGrupoId]
          );

          if (movPrevRes.rows.length > 0) {
            const mp = movPrevRes.rows[0];
            estadoAnteriorLibro = mp.estadoConciliacionLibro;
            estadosPreviosLibro.push({
              id: mp.id,
              estadoConciliacionLibro: mp.estadoConciliacionLibro,
              conciliado: Boolean(mp.conciliado),
            });
            const perMov = mp.fecha.slice(0, 7);
            if (perMov !== codigoPeriodo && perMov !== g.codigoPeriodo) {
              await verificarPeriodoNoCerradoEnTx(
                client,
                empresaId,
                linea.cuentaFinancieraId,
                perMov
              );
            }
          }
        } else if (itemLibro?.origenLibro === 'ASIENTO_MANUAL' && itemLibro.asientoDetalleId) {
          asientoGrupoId = itemLibro.asientoId ?? null;
          const detPrevRes = await client.query<{ id: string; asientoId: string; fecha: string }>(
            `SELECT ad.id,
                    ad.asiento_id AS "asientoId",
                    a.fecha::text AS fecha
             FROM asiento_detalle ad
             JOIN asientos a
               ON a.id = ad.asiento_id
              AND a.empresa_id = ad.empresa_id
             WHERE ad.empresa_id = $1 AND ad.id = $2
             FOR UPDATE OF ad`,
            [empresaId, itemLibro.asientoDetalleId]
          );

          if (detPrevRes.rows.length > 0) {
            asientoGrupoId = detPrevRes.rows[0].asientoId;
            const perDet = detPrevRes.rows[0].fecha.slice(0, 7);
            if (perDet !== codigoPeriodo && perDet !== g.codigoPeriodo) {
              await verificarPeriodoNoCerradoEnTx(
                client,
                empresaId,
                linea.cuentaFinancieraId,
                perDet
              );
            }
          }
        }

        await client.query(
          `UPDATE conciliacion_grupo
           SET estado = 'DESCONCILIADO',
               updated_at = CURRENT_TIMESTAMP
           WHERE empresa_id = $1 AND id = $2`,
          [empresaId, g.id]
        );

        grupos1a1Info.push({
          grupo: g,
          items: itemsRes.rows,
          movimientoId: movGrupoId,
          asientoId: asientoGrupoId,
          estadoAnteriorLibro,
          estadosPreviosBanco,
          estadosPreviosLibro,
        });
      }

      const updRes = await client.query(
        `UPDATE extracto_lineas
         SET conciliada = false,
             estado_conciliacion = 'PENDIENTE_LIBROS',
             movimiento_tesoreria_id = NULL,
             diferencia_importe = 0.00,
             observacion_conciliacion = COALESCE($1, observacion_conciliacion),
             conciliado_en = NULL
         WHERE id = $2 AND empresa_id = $3
         RETURNING id,
                   extracto_id AS "extractoId",
                   fecha::text AS fecha,
                   descripcion,
                   referencia,
                   monto::text AS monto,
                   saldo::text AS saldo,
                   conciliada,
                   estado_conciliacion AS "estadoConciliacionRaw",
                   movimiento_tesoreria_id AS "movimientoTesoreriaId",
                   diferencia_importe::text AS "diferenciaImporte",
                   observacion_conciliacion AS "observacionConciliacion",
                   conciliado_en AS "conciliadoEn",
                   import_id AS "importId",
                   linea_raw_id AS "lineaRawId",
                   tipo_clasificacion AS "tipoClasificacion",
                   ruc_extraido AS "rucExtraido",
                   contraparte_extraida AS "contraparteExtraida",
                   doc_extraido AS "docExtraido"`,
        [parsed.motivo ?? null, linea.id, empresaId]
      );

      for (const movId of movIdsCandidatos) {
        const otrasRefsRes = await client.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total
           FROM extracto_lineas
           WHERE empresa_id = $1
             AND movimiento_tesoreria_id = $2
             AND conciliada = true
             AND id <> $3`,
          [empresaId, movId, linea.id]
        );
        const otrosGruposRes = await client.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total
           FROM conciliacion_item ci
           JOIN conciliacion_grupo cg
             ON cg.id = ci.grupo_id
            AND cg.empresa_id = ci.empresa_id
           WHERE ci.empresa_id = $1
             AND ci.lado = 'LIBRO'
             AND ci.origen_libro = 'MOVIMIENTO_TESORERIA'
             AND ci.movimiento_tesoreria_id = $2
             AND cg.estado IN ('CONCILIADO', 'CONCILIADO_MANUAL')`,
          [empresaId, movId]
        );

        if (
          Number(otrasRefsRes.rows[0]?.total ?? '0') === 0 &&
          Number(otrosGruposRes.rows[0]?.total ?? '0') === 0
        ) {
          await client.query(
            `UPDATE movimientos_tesoreria
             SET conciliado = false,
                 estado_conciliacion_libro = CASE
                   WHEN tipo = 'EGRESO' AND medio_pago = '007' THEN 'CHEQUE_NO_COBRADO'
                   ELSE 'PENDIENTE_BANCO'
                 END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND empresa_id = $2`,
            [movId, empresaId]
          );
        }
      }

      const motivoHistorial = parsed.motivo?.trim() || 'Desconciliación individual desde partida';
      for (const info of grupos1a1Info) {
        const snapshotGrupoJson = {
          id: info.grupo.id,
          cuentaFinancieraId: linea.cuentaFinancieraId,
          periodoId: info.grupo.periodoId,
          periodo: info.grupo.codigoPeriodo,
          tipoMatch: info.grupo.tipoMatch,
          reglaAplicada: info.grupo.reglaAplicada,
          capaMatching: Number(info.grupo.capaMatching),
          score: Number(Number(info.grupo.score).toFixed(4)),
          estado: info.grupo.estado,
          diferenciaMonto: Money.format(info.grupo.diferenciaMonto ?? '0'),
          observacion: info.grupo.observacion,
          items: info.items,
          estadosPreviosBanco: info.estadosPreviosBanco,
          estadosPreviosLibro: info.estadosPreviosLibro,
        };

        const histRes = await client.query<{ id: string }>(
          `INSERT INTO conciliacion_historial_desconciliacion (
             empresa_id,
             grupo_id,
             extracto_linea_id,
             movimiento_tesoreria_id,
             estado_anterior_banco,
             estado_anterior_libro,
             motivo,
             snapshot_grupo_json,
             usuario_id
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
           RETURNING id`,
          [
            empresaId,
            info.grupo.id,
            linea.id,
            info.movimientoId,
            estadoAnteriorBanco,
            info.estadoAnteriorLibro,
            motivoHistorial,
            JSON.stringify(snapshotGrupoJson),
            userId,
          ]
        );

        const historialId = histRes.rows[0].id;

        await registrarAuditoriaEnTx(client, {
          empresaId,
          usuarioId: userId,
          tablaAfectada: 'conciliacion_grupo',
          registroId: info.grupo.id,
          accion: 'UPDATE',
          datosAnteriores: {
            estado: info.grupo.estado,
            estadosPreviosBanco: info.estadosPreviosBanco,
            estadosPreviosLibro: info.estadosPreviosLibro,
          },
          datosNuevos: {
            estado: 'DESCONCILIADO',
            motivo: motivoHistorial,
            historialId,
          },
        });

        await registrarAuditoriaEnTx(client, {
          empresaId,
          usuarioId: userId,
          tablaAfectada: 'conciliacion_historial_desconciliacion',
          registroId: historialId,
          accion: 'INSERT',
          datosNuevos: {
            grupoId: info.grupo.id,
            extractoLineaId: linea.id,
            movimientoTesoreriaId: info.movimientoId,
            asientoId: info.asientoId,
            motivo: motivoHistorial,
            estadoAnteriorBanco,
            estadoAnteriorLibro: info.estadoAnteriorLibro,
          },
        });
      }

      const partidaActualizada = mapPartidaExtractoRow(updRes.rows[0]);

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'extracto_lineas',
        registroId: linea.id,
        accion: 'UPDATE',
        datosAnteriores: {
          extractoId: linea.extractoId,
          conciliada: linea.conciliada,
          estadoConciliacion: derivarEstadoEfectivoExtracto(
            Boolean(linea.conciliada),
            linea.estadoConciliacionRaw
          ),
          movimientoTesoreriaId: linea.movimientoTesoreriaId,
          diferenciaImporte: Money.format(linea.diferenciaImporte ?? '0'),
        },
        datosNuevos: {
          extractoId: partidaActualizada.extractoId,
          conciliada: partidaActualizada.conciliada,
          estadoConciliacion: partidaActualizada.estadoConciliacion,
          movimientoTesoreriaId: null,
          diferenciaImporte: partidaActualizada.diferenciaImporte,
          observacionConciliacion: partidaActualizada.observacionConciliacion,
          motivo: parsed.motivo ?? null,
        },
      });

      return partidaActualizada;
    });
  },

  async cerrarConciliacion(
    empresaId: string,
    userId: string,
    input: CerrarConciliacionV2Input
  ): Promise<ResultadoCierreV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');

    const parsed = cerrarConciliacionSchema.parse(input);
    const { fechaInicio, fechaFin } = resolverRangoPeriodo(parsed.periodo);
    const fechaCorte = parsed.fechaCorte ?? fechaFin;

    if (fechaCorte < fechaInicio || fechaCorte > fechaFin) {
      throw new ConciliacionV2Error(
        400,
        'FECHA_CORTE_FUERA_DE_PERIODO',
        `La fechaCorte (${fechaCorte}) debe pertenecer al periodo ${parsed.periodo} (${fechaInicio} a ${fechaFin}).`
      );
    }

    return db.withEmpresaTransaction(empresaId, async (client) => {
      await client.query(
        `SELECT id
         FROM cuentas_financieras
         WHERE empresa_id = $1 AND id = $2
         FOR UPDATE`,
        [empresaId, parsed.cuentaFinancieraId]
      );

      const resumen = await obtenerResumenConciliacionEnTx(
        client,
        empresaId,
        parsed.cuentaFinancieraId,
        parsed.periodo
      );

      validarPrecondicionOperacionCuenta(resumen.cuenta.cuentaContableId);

      if (!resumen.tieneExtracto) {
        throw new ConciliacionV2Error(
          409,
          'EXTRACTO_NO_IMPORTADO',
          `No existe extracto bancario importado para la cuenta y el periodo ${parsed.periodo}.`
        );
      }

      if (resumen.diferencia === null || !Money.isEqual(resumen.diferencia, 0)) {
        throw new ConciliacionV2Error(
          409,
          'DIFERENCIA_CONCILIACION_NO_CERO',
          `La diferencia de conciliación (${resumen.diferencia ?? 'N/A'}) debe ser exactamente 0.00 para cerrar el periodo.`
        );
      }

      const periodoRes = await client.query<{ id: string }>(
        `SELECT id
         FROM periodos
         WHERE empresa_id = $1 AND codigo_periodo = $2
         LIMIT 1`,
        [empresaId, parsed.periodo]
      );

      if (periodoRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'PERIODO_NO_ENCONTRADO',
          `El periodo contable ${parsed.periodo} no existe en la empresa.`
        );
      }

      const periodoId = periodoRes.rows[0].id;

      const existenteRes = await client.query<{ id: string; estado: string }>(
        `SELECT id, estado
         FROM conciliaciones_bancarias
         WHERE empresa_id = $1
           AND cuenta_financiera_id = $2
           AND periodo_id = $3
         FOR UPDATE`,
        [empresaId, parsed.cuentaFinancieraId, periodoId]
      );

      const existente = existenteRes.rows[0];
      if (existente?.estado === 'CERRADA') {
        throw new ConciliacionV2Error(
          409,
          'CONCILIACION_YA_CERRADA',
          `La conciliación del periodo ${parsed.periodo} para esta cuenta ya se encuentra CERRADA.`
        );
      }

      let partidasConciliadasDec = Money.create(0);
      for (const linea of resumen.extractoLineas) {
        if (linea.conciliada) {
          partidasConciliadasDec = Money.add(partidasConciliadasDec, linea.monto);
        }
      }
      const partidasEnTransitoDec = Money.sub(
        resumen.depositosEnTransito,
        resumen.chequesNoCobrados
      );

      const snapshotJson = {
        periodo: parsed.periodo,
        fechaCorte,
        saldoInicialBanco: resumen.saldoInicialExtracto,
        saldoFinalBanco: resumen.saldoFinalExtracto,
        saldoLibros: resumen.saldoLibros,
        depositosEnTransito: resumen.depositosEnTransito,
        chequesNoCobrados: resumen.chequesNoCobrados,
        abonosNoRegistrados: resumen.abonosNoRegistrados,
        cargosNoRegistrados: resumen.cargosNoRegistrados,
        saldoAjustadoBanco: resumen.saldoAjustadoBanco,
        saldoAjustadoLibros: resumen.saldoAjustadoLibros,
        diferencia: resumen.diferencia,
        semaforo: resumen.semaforo,
        integridadMayor: resumen.integridadMayor,
        conteos: resumen.conteos,
      };

      const conciliacionId = existente?.id ?? randomUUID();
      const upsertRes = await client.query(
        `INSERT INTO conciliaciones_bancarias (
          id,
          empresa_id,
          cuenta_financiera_id,
          periodo_id,
          fecha_corte,
          saldo_segun_libros,
          saldo_segun_banco,
          partidas_conciliadas,
          partidas_en_transito,
          diferencia,
          estado,
          cerrada_por,
          fecha_cierre,
          saldo_inicial_banco,
          saldo_final_banco,
          depositos_en_transito,
          cheques_no_cobrados,
          abonos_no_registrados,
          cargos_no_registrados,
          saldo_mayor_104x,
          diferencia_integridad_mayor,
          snapshot_json
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'CERRADA', $11, CURRENT_TIMESTAMP,
          $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb
        )
        ON CONFLICT (empresa_id, cuenta_financiera_id, periodo_id) DO UPDATE SET
          fecha_corte = EXCLUDED.fecha_corte,
          saldo_segun_libros = EXCLUDED.saldo_segun_libros,
          saldo_segun_banco = EXCLUDED.saldo_segun_banco,
          partidas_conciliadas = EXCLUDED.partidas_conciliadas,
          partidas_en_transito = EXCLUDED.partidas_en_transito,
          diferencia = EXCLUDED.diferencia,
          estado = 'CERRADA',
          cerrada_por = EXCLUDED.cerrada_por,
          fecha_cierre = CURRENT_TIMESTAMP,
          saldo_inicial_banco = EXCLUDED.saldo_inicial_banco,
          saldo_final_banco = EXCLUDED.saldo_final_banco,
          depositos_en_transito = EXCLUDED.depositos_en_transito,
          cheques_no_cobrados = EXCLUDED.cheques_no_cobrados,
          abonos_no_registrados = EXCLUDED.abonos_no_registrados,
          cargos_no_registrados = EXCLUDED.cargos_no_registrados,
          saldo_mayor_104x = EXCLUDED.saldo_mayor_104x,
          diferencia_integridad_mayor = EXCLUDED.diferencia_integridad_mayor,
          snapshot_json = EXCLUDED.snapshot_json
        RETURNING id,
                  empresa_id AS "empresaId",
                  cuenta_financiera_id AS "cuentaFinancieraId",
                  periodo_id AS "periodoId",
                  fecha_corte::text AS "fechaCorte",
                  estado,
                  saldo_segun_libros::text AS "saldoSegunLibros",
                  saldo_segun_banco::text AS "saldoSegunBanco",
                  saldo_inicial_banco::text AS "saldoInicialBanco",
                  saldo_final_banco::text AS "saldoFinalBanco",
                  depositos_en_transito::text AS "depositosEnTransito",
                  cheques_no_cobrados::text AS "chequesNoCobrados",
                  abonos_no_registrados::text AS "abonosNoRegistrados",
                  cargos_no_registrados::text AS "cargosNoRegistrados",
                  saldo_mayor_104x::text AS "saldoMayor104x",
                  diferencia_integridad_mayor::text AS "diferenciaIntegridadMayor",
                  diferencia::text AS diferencia,
                  cerrada_por AS "cerradaPor",
                  fecha_cierre AS "fechaCierre",
                  motivo_reapertura AS "motivoReapertura",
                  reabierta_por AS "reabiertaPor",
                  fecha_reapertura AS "fechaReapertura"`,
        [
          conciliacionId,
          empresaId,
          parsed.cuentaFinancieraId,
          periodoId,
          fechaCorte,
          resumen.saldoLibros,
          resumen.saldoFinalExtracto ?? '0.00',
          Money.format(partidasConciliadasDec),
          Money.format(partidasEnTransitoDec),
          resumen.diferencia,
          userId,
          resumen.saldoInicialExtracto,
          resumen.saldoFinalExtracto,
          resumen.depositosEnTransito,
          resumen.chequesNoCobrados,
          resumen.abonosNoRegistrados,
          resumen.cargosNoRegistrados,
          resumen.integridadMayor.saldoMayor104x,
          resumen.integridadMayor.diferenciaIntegridadMayor ?? '0.00',
          JSON.stringify(snapshotJson),
        ]
      );

      const resultado = mapResultadoCierreRow(upsertRes.rows[0], parsed.periodo);

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'conciliaciones_bancarias',
        registroId: resultado.id,
        accion: 'CIERRE_PERIODO',
        datosAnteriores: existente ? { id: existente.id, estado: existente.estado } : null,
        datosNuevos: {
          cuentaFinancieraId: resultado.cuentaFinancieraId,
          periodoId: resultado.periodoId,
          periodo: resultado.periodo,
          fechaCorte: resultado.fechaCorte,
          estado: resultado.estado,
          saldoSegunLibros: resultado.saldoSegunLibros,
          saldoSegunBanco: resultado.saldoSegunBanco,
          saldoInicialBanco: resultado.saldoInicialBanco,
          saldoFinalBanco: resultado.saldoFinalBanco,
          depositosEnTransito: resultado.depositosEnTransito,
          chequesNoCobrados: resultado.chequesNoCobrados,
          abonosNoRegistrados: resultado.abonosNoRegistrados,
          cargosNoRegistrados: resultado.cargosNoRegistrados,
          saldoMayor104x: resultado.saldoMayor104x,
          diferenciaIntegridadMayor: resultado.diferenciaIntegridadMayor,
          diferencia: resultado.diferencia,
          cerradaPor: resultado.cerradaPor,
          fechaCierre: resultado.fechaCierre,
        },
      });

      return resultado;
    });
  },

  async reabrirConciliacion(
    empresaId: string,
    userId: string,
    input: ReabrirConciliacionV2Input
  ): Promise<ResultadoCierreV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');

    const parsed = reabrirConciliacionSchema.parse(input);
    resolverRangoPeriodo(parsed.periodo);

    return db.withEmpresaTransaction(empresaId, async (client) => {
      await client.query(
        `SELECT id
         FROM cuentas_financieras
         WHERE empresa_id = $1 AND id = $2
         FOR UPDATE`,
        [empresaId, parsed.cuentaFinancieraId]
      );

      const periodoRes = await client.query<{ id: string }>(
        `SELECT id
         FROM periodos
         WHERE empresa_id = $1 AND codigo_periodo = $2
         LIMIT 1`,
        [empresaId, parsed.periodo]
      );

      if (periodoRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'PERIODO_NO_ENCONTRADO',
          `El periodo contable ${parsed.periodo} no existe en la empresa.`
        );
      }

      const periodoId = periodoRes.rows[0].id;

      const actualRes = await client.query(
        `SELECT id,
                estado,
                fecha_corte::text AS "fechaCorte",
                cerrada_por AS "cerradaPor",
                fecha_cierre AS "fechaCierre"
         FROM conciliaciones_bancarias
         WHERE empresa_id = $1
           AND cuenta_financiera_id = $2
           AND periodo_id = $3
         FOR UPDATE`,
        [empresaId, parsed.cuentaFinancieraId, periodoId]
      );

      if (actualRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'CONCILIACION_NO_ENCONTRADA',
          `No existe conciliación registrada para la cuenta y el periodo ${parsed.periodo}.`
        );
      }

      const actual = actualRes.rows[0];
      if (actual.estado !== 'CERRADA') {
        throw new ConciliacionV2Error(
          409,
          'CONCILIACION_NO_ESTA_CERRADA',
          `La conciliación del periodo ${parsed.periodo} no se encuentra CERRADA (estado actual: ${actual.estado}).`
        );
      }

      const updRes = await client.query(
        `UPDATE conciliaciones_bancarias
         SET estado = 'ABIERTA',
             motivo_reapertura = $1,
             reabierta_por = $2,
             fecha_reapertura = CURRENT_TIMESTAMP
         WHERE id = $3 AND empresa_id = $4
         RETURNING id,
                   empresa_id AS "empresaId",
                   cuenta_financiera_id AS "cuentaFinancieraId",
                   periodo_id AS "periodoId",
                   fecha_corte::text AS "fechaCorte",
                   estado,
                   saldo_segun_libros::text AS "saldoSegunLibros",
                   saldo_segun_banco::text AS "saldoSegunBanco",
                   saldo_inicial_banco::text AS "saldoInicialBanco",
                   saldo_final_banco::text AS "saldoFinalBanco",
                   depositos_en_transito::text AS "depositosEnTransito",
                   cheques_no_cobrados::text AS "chequesNoCobrados",
                   abonos_no_registrados::text AS "abonosNoRegistrados",
                   cargos_no_registrados::text AS "cargosNoRegistrados",
                   saldo_mayor_104x::text AS "saldoMayor104x",
                   diferencia_integridad_mayor::text AS "diferenciaIntegridadMayor",
                   diferencia::text AS diferencia,
                   cerrada_por AS "cerradaPor",
                   fecha_cierre AS "fechaCierre",
                   motivo_reapertura AS "motivoReapertura",
                   reabierta_por AS "reabiertaPor",
                   fecha_reapertura AS "fechaReapertura"`,
        [parsed.motivo, userId, actual.id, empresaId]
      );

      const resultado = mapResultadoCierreRow(updRes.rows[0], parsed.periodo);

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'conciliaciones_bancarias',
        registroId: resultado.id,
        accion: 'UPDATE',
        datosAnteriores: {
          estado: actual.estado,
          fechaCorte: actual.fechaCorte,
          cerradaPor: actual.cerradaPor,
          fechaCierre: actual.fechaCierre ? new Date(actual.fechaCierre).toISOString() : null,
        },
        datosNuevos: {
          cuentaFinancieraId: resultado.cuentaFinancieraId,
          periodoId: resultado.periodoId,
          periodo: resultado.periodo,
          estado: resultado.estado,
          motivoReapertura: resultado.motivoReapertura,
          reabiertaPor: resultado.reabiertaPor,
          fechaReapertura: resultado.fechaReapertura,
        },
      });

      return resultado;
    });
  },
};
