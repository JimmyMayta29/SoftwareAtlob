import type Decimal from 'decimal.js';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { db } from '../../../config/database';
import {
  ActualizarEstadoChequeInput,
  AlertaBancarizacionV2,
  AlertaChequeAntiguedadV2,
  AlertaItfV2,
  ChequeBancarioV2,
  CrearChequeBancarioInput,
  ESTADOS_CHEQUE_BANCARIO_V2,
  EstadoChequeBancarioV2,
  EstadoConciliacionV2,
  ResumenAlertasControlV2,
} from '../../../types/conciliacionV2';
import { Money } from '../../../utils/decimal';
import {
  ConciliacionV2Error,
  asegurarPostgresDisponible,
  asegurarUuid,
  derivarEstadoEfectivoExtracto,
  obtenerConfigEnTx,
  obtenerCuentaBancariaEnTx,
  registrarAuditoriaEnTx,
  resolverRangoPeriodo,
  validarPrecondicionOperacionCuenta,
  verificarPeriodoNoCerradoEnTx,
} from '../../conciliacionV2Service';

const FECHA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;
const TASA_ITF = '0.00005';
const UNIDAD_REDONDEO_ITF = '0.05';

export const UMBRAL_BANCARIZACION_PEN = '2000.00';
export const UMBRAL_BANCARIZACION_USD = '500.00';
export const DIAS_ALERTA_CHEQUE_POR_VENCER = 20;
export const DIAS_PLAZO_LEGAL_CHEQUE = 30;

const MEDIOS_NO_BANCARIOS = new Set(['008', '009', 'EFECTIVO', 'SIN_MEDIO_PAGO']);

const TRANSICIONES_CHEQUE: Record<EstadoChequeBancarioV2, ReadonlySet<EstadoChequeBancarioV2>> = {
  GIRADO: new Set(['ENTREGADO', 'COBRADO', 'VENCIDO', 'ANULADO']),
  ENTREGADO: new Set(['COBRADO', 'VENCIDO', 'ANULADO']),
  VENCIDO: new Set(['ANULADO', 'COBRADO']),
  COBRADO: new Set(),
  ANULADO: new Set(),
};

const crearChequeSchema = z.object({
  cuentaFinancieraId: z.string().uuid('cuentaFinancieraId debe ser un UUID válido.'),
  movimientoTesoreriaId: z.string().uuid('movimientoTesoreriaId debe ser un UUID válido.').nullable().optional(),
  extractoLineaId: z.string().uuid('extractoLineaId debe ser un UUID válido.').nullable().optional(),
  anexoId: z.string().uuid('anexoId debe ser un UUID válido.').nullable().optional(),
  numeroCheque: z.string().trim().min(1, 'numeroCheque es obligatorio.').max(40),
  beneficiario: z.string().trim().min(2, 'beneficiario debe tener al menos 2 caracteres.').max(200),
  moneda: z.enum(['PEN', 'USD']).optional(),
  monto: z
    .union([z.string(), z.number()])
    .refine(
      (val) => {
        const text = String(val).trim();
        if (!/^-?\d+(\.\d+)?$/.test(text)) return false;
        return Money.round(text).gt(0);
      },
      { message: 'monto debe ser un decimal estrictamente mayor a 0.00.' }
    ),
  fechaGiro: z.string().regex(FECHA_ISO_REGEX, 'fechaGiro debe tener formato YYYY-MM-DD.'),
  fechaEntrega: z.string().regex(FECHA_ISO_REGEX, 'fechaEntrega debe tener formato YYYY-MM-DD.').nullable().optional(),
  fechaVencimiento: z
    .string()
    .regex(FECHA_ISO_REGEX, 'fechaVencimiento debe tener formato YYYY-MM-DD.')
    .nullable()
    .optional(),
  esNoNegociable: z.boolean().optional(),
  observacion: z.string().trim().max(500).nullable().optional(),
});

const actualizarEstadoChequeSchema = z.object({
  estado: z.enum(ESTADOS_CHEQUE_BANCARIO_V2),
  fechaEntrega: z.string().regex(FECHA_ISO_REGEX, 'fechaEntrega debe tener formato YYYY-MM-DD.').nullable().optional(),
  fechaCobro: z.string().regex(FECHA_ISO_REGEX, 'fechaCobro debe tener formato YYYY-MM-DD.').nullable().optional(),
  extractoLineaId: z.string().uuid('extractoLineaId debe ser un UUID válido.').nullable().optional(),
  observacion: z.string().trim().max(500).nullable().optional(),
});

// ============================================================================
// FUNCIONES PURAS DE CÁLCULO TRIBUTARIO Y CONTROL DE CHEQUES (100% Money)
// ============================================================================

function parsearFechaUtcMs(fechaIso: string): number {
  const [y, m, d] = fechaIso.split('-').map((n) => Number(n));
  return Date.UTC(y, m - 1, d);
}

export function sumarDiasFechaIso(fechaIso: string, dias: number): string {
  const ms = parsearFechaUtcMs(fechaIso) + dias * MS_PER_DAY;
  return new Date(ms).toISOString().slice(0, 10);
}

export function calcularDiasTranscurridos(fechaDesde: string, fechaHasta: string): number {
  const diffMs = parsearFechaUtcMs(fechaHasta) - parsearFechaUtcMs(fechaDesde);
  return Math.floor(diffMs / MS_PER_DAY);
}

export function calcularFechaVencimientoCheque(
  fechaGiro: string,
  fechaVencimiento?: string | null
): string {
  if (fechaVencimiento && FECHA_ISO_REGEX.test(fechaVencimiento)) {
    return fechaVencimiento;
  }
  return sumarDiasFechaIso(fechaGiro, DIAS_PLAZO_LEGAL_CHEQUE);
}

export function validarTransicionEstadoCheque(
  estadoActual: EstadoChequeBancarioV2,
  estadoNuevo: EstadoChequeBancarioV2
): void {
  if (estadoActual === estadoNuevo) {
    throw new ConciliacionV2Error(
      409,
      'TRANSICION_CHEQUE_INVALIDA',
      `El cheque ya se encuentra en estado ${estadoActual}.`
    );
  }
  const permitidos = TRANSICIONES_CHEQUE[estadoActual];
  if (!permitidos || !permitidos.has(estadoNuevo)) {
    throw new ConciliacionV2Error(
      409,
      'TRANSICION_CHEQUE_INVALIDA',
      `Transición de estado inválida para cheque: ${estadoActual} -> ${estadoNuevo}.`
    );
  }
}

export interface ResultadoCalculoItf {
  montoBase: string;
  itfExacto: string;
  itfRedondeado: string;
}

/**
 * Calcula el ITF peruano (0.005% = 0.00005) usando Money (decimal.js) y criterio
 * de redondeo a múltiplos de S/ 0.05 (ROUND_HALF_UP).
 */
export function calcularItfEsperado(montoOperacion: string | number | Decimal): ResultadoCalculoItf {
  const baseDec = Money.round(montoOperacion).abs();
  if (baseDec.lte(0)) {
    return {
      montoBase: '0.00',
      itfExacto: '0.00',
      itfRedondeado: '0.00',
    };
  }
  const exactoBruto = baseDec.times(TASA_ITF);
  const itfExactoDec = Money.round(exactoBruto);
  const unidades05 = exactoBruto.dividedBy(UNIDAD_REDONDEO_ITF).toDecimalPlaces(0);
  const itfRedondeadoDec = Money.round(unidades05.times(UNIDAD_REDONDEO_ITF));

  return {
    montoBase: Money.format(baseDec),
    itfExacto: Money.format(itfExactoDec),
    itfRedondeado: Money.format(itfRedondeadoDec),
  };
}

export interface EvaluacionBancarizacion {
  aplicaControl: boolean;
  superaUmbral: boolean;
  medioNoBancario: boolean;
  umbralLegal: string;
  monto: string;
  moneda: 'PEN' | 'USD';
  severidad: 'ADVERTENCIA' | 'CRITICA' | null;
  motivo: string | null;
}

/**
 * Evalúa la obligación de usar Medios de Pago bancarios según Ley N° 28194
 * (modificada por D.Leg. 1529): umbral S/ 2,000.00 o US$ 500.00.
 */
export function evaluarBancarizacionLey28194(params: {
  moneda: 'PEN' | 'USD';
  monto: string | number | Decimal;
  medioPago?: string | null;
  esNoNegociable?: boolean | null;
}): EvaluacionBancarizacion {
  const moneda: 'PEN' | 'USD' = params.moneda === 'USD' ? 'USD' : 'PEN';
  const umbralLegal = moneda === 'USD' ? UMBRAL_BANCARIZACION_USD : UMBRAL_BANCARIZACION_PEN;
  const montoDec = Money.round(params.monto).abs();
  const superaUmbral = montoDec.gte(umbralLegal);
  const medioNorm = (params.medioPago ?? '').trim().toUpperCase();
  const medioNoBancario = medioNorm === '' || MEDIOS_NO_BANCARIOS.has(medioNorm);

  if (!superaUmbral) {
    return {
      aplicaControl: false,
      superaUmbral: false,
      medioNoBancario,
      umbralLegal,
      monto: Money.format(montoDec),
      moneda,
      severidad: null,
      motivo: null,
    };
  }

  if (medioNoBancario) {
    const simbolo = moneda === 'USD' ? 'US$' : 'S/';
    return {
      aplicaControl: true,
      superaUmbral: true,
      medioNoBancario: true,
      umbralLegal,
      monto: Money.format(montoDec),
      moneda,
      severidad: 'CRITICA',
      motivo: `Operación de ${simbolo} ${Money.format(montoDec)} alcanza/supera umbral Ley 28194 (${simbolo} ${umbralLegal}) usando medio no bancario (${medioNorm || 'SIN_MEDIO_PAGO'}). Riesgo de pérdida de costo/gasto y crédito fiscal.`,
    };
  }

  if (medioNorm === '007' && params.esNoNegociable === false) {
    const simbolo = moneda === 'USD' ? 'US$' : 'S/';
    return {
      aplicaControl: true,
      superaUmbral: true,
      medioNoBancario: false,
      umbralLegal,
      monto: Money.format(montoDec),
      moneda,
      severidad: 'ADVERTENCIA',
      motivo: `Cheque de ${simbolo} ${Money.format(montoDec)} supera umbral Ley 28194 (${simbolo} ${umbralLegal}) sin cláusula NO NEGOCIABLE / INTRANSFERIBLE.`,
    };
  }

  return {
    aplicaControl: false,
    superaUmbral: true,
    medioNoBancario: false,
    umbralLegal,
    monto: Money.format(montoDec),
    moneda,
    severidad: null,
    motivo: null,
  };
}

export interface EvaluacionAntiguedadCheque {
  diasTranscurridos: number;
  enAlerta: boolean;
  vencidoPlazoLegal: boolean;
  motivo: string | null;
}

export function evaluarAntiguedadCheque(params: {
  fechaGiro: string;
  fechaCorte: string;
  estado: EstadoChequeBancarioV2 | 'PENDIENTE';
}): EvaluacionAntiguedadCheque {
  const diasTranscurridos = Math.max(0, calcularDiasTranscurridos(params.fechaGiro, params.fechaCorte));
  const vencidoPlazoLegal =
    params.estado === 'VENCIDO' || diasTranscurridos > DIAS_PLAZO_LEGAL_CHEQUE;
  const enAlerta = vencidoPlazoLegal || diasTranscurridos >= DIAS_ALERTA_CHEQUE_POR_VENCER;

  if (!enAlerta) {
    return {
      diasTranscurridos,
      enAlerta: false,
      vencidoPlazoLegal: false,
      motivo: null,
    };
  }

  const motivo = vencidoPlazoLegal
    ? `Cheque vencido para presentación bancaria (${diasTranscurridos} días desde giro; plazo legal Ley de Títulos Valores: ${DIAS_PLAZO_LEGAL_CHEQUE} días).`
    : `Cheque próximo a vencer (${diasTranscurridos} días desde giro; límite legal: ${DIAS_PLAZO_LEGAL_CHEQUE} días).`;

  return {
    diasTranscurridos,
    enAlerta: true,
    vencidoPlazoLegal,
    motivo,
  };
}

// ============================================================================
// HELPERS INTERNOS DE PERSISTENCIA
// ============================================================================

function mapChequeRow(row: any): ChequeBancarioV2 {
  return {
    id: row.id,
    empresaId: row.empresaId,
    cuentaFinancieraId: row.cuentaFinancieraId,
    movimientoTesoreriaId: row.movimientoTesoreriaId ?? null,
    extractoLineaId: row.extractoLineaId ?? null,
    anexoId: row.anexoId ?? null,
    numeroCheque: row.numeroCheque,
    beneficiario: row.beneficiario,
    moneda: row.moneda === 'USD' ? 'USD' : 'PEN',
    monto: Money.format(row.monto ?? '0'),
    fechaGiro: row.fechaGiro,
    fechaEntrega: row.fechaEntrega ?? null,
    fechaCobro: row.fechaCobro ?? null,
    fechaVencimiento: row.fechaVencimiento ?? null,
    estado: row.estado as EstadoChequeBancarioV2,
    esNoNegociable: Boolean(row.esNoNegociable),
    observacion: row.observacion ?? null,
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

const SELECT_CHEQUE_COLS = `
  id,
  empresa_id AS "empresaId",
  cuenta_financiera_id AS "cuentaFinancieraId",
  movimiento_tesoreria_id AS "movimientoTesoreriaId",
  extracto_linea_id AS "extractoLineaId",
  anexo_id AS "anexoId",
  numero_cheque AS "numeroCheque",
  beneficiario,
  moneda,
  monto::text AS monto,
  fecha_giro::text AS "fechaGiro",
  fecha_entrega::text AS "fechaEntrega",
  fecha_cobro::text AS "fechaCobro",
  fecha_vencimiento::text AS "fechaVencimiento",
  estado,
  es_no_negociable AS "esNoNegociable",
  observacion,
  created_by AS "createdBy",
  updated_by AS "updatedBy",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

async function asegurarVinculoChequeUnicoEnTx(
  client: PoolClient,
  empresaId: string,
  columna: 'movimiento_tesoreria_id' | 'extracto_linea_id',
  valorId: string,
  excluirChequeId: string | null
): Promise<void> {
  const res = await client.query<{ id: string }>(
    `SELECT id
     FROM cheques_bancarios
     WHERE empresa_id = $1
       AND ${columna} = $2
       AND estado <> 'ANULADO'
       AND ($3::uuid IS NULL OR id <> $3::uuid)
     LIMIT 1`,
    [empresaId, valorId, excluirChequeId]
  );
  if (res.rows.length > 0) {
    throw new ConciliacionV2Error(
      409,
      'CHEQUE_VINCULO_DUPLICADO',
      'La partida bancaria o el movimiento de tesorería ya se encuentra vinculado a otro cheque activo.'
    );
  }
}

async function validarReferenciasChequeEnTx(
  client: PoolClient,
  empresaId: string,
  cuentaFinancieraId: string,
  refs: {
    movimientoTesoreriaId?: string | null;
    extractoLineaId?: string | null;
    anexoId?: string | null;
    excluirChequeId?: string | null;
  }
): Promise<{ fechaExtractoLinea: string | null }> {
  let fechaExtractoLinea: string | null = null;
  const excluirId = refs.excluirChequeId ?? null;

  if (refs.movimientoTesoreriaId) {
    const movRes = await client.query<{ cuentaFinancieraId: string; estado: string }>(
      `SELECT cuenta_financiera_id AS "cuentaFinancieraId", estado
       FROM movimientos_tesoreria
       WHERE empresa_id = $1 AND id = $2
       LIMIT 1`,
      [empresaId, refs.movimientoTesoreriaId]
    );
    if (movRes.rows.length === 0) {
      throw new ConciliacionV2Error(
        404,
        'MOVIMIENTO_TESORERIA_NO_ENCONTRADO',
        'El movimiento de tesorería indicado para el cheque no existe en la empresa.'
      );
    }
    if (movRes.rows[0].cuentaFinancieraId !== cuentaFinancieraId) {
      throw new ConciliacionV2Error(
        409,
        'CUENTA_FINANCIERA_INCOMPATIBLE',
        'El movimiento de tesorería pertenece a otra cuenta financiera.'
      );
    }
    if (movRes.rows[0].estado === 'ANULADO') {
      throw new ConciliacionV2Error(
        409,
        'MOVIMIENTO_ANULADO',
        'No se puede vincular un cheque a un movimiento de tesorería anulado.'
      );
    }
    await asegurarVinculoChequeUnicoEnTx(
      client,
      empresaId,
      'movimiento_tesoreria_id',
      refs.movimientoTesoreriaId,
      excluirId
    );
  }

  if (refs.extractoLineaId) {
    const elRes = await client.query<{
      cuentaFinancieraId: string;
      extractoEstado: string;
      fecha: string;
    }>(
      `SELECT eb.cuenta_financiera_id AS "cuentaFinancieraId",
              eb.estado AS "extractoEstado",
              el.fecha::text AS fecha
       FROM extracto_lineas el
       JOIN extractos_bancarios eb
         ON eb.id = el.extracto_id
        AND eb.empresa_id = el.empresa_id
       WHERE el.empresa_id = $1 AND el.id = $2
       LIMIT 1`,
      [empresaId, refs.extractoLineaId]
    );
    if (elRes.rows.length === 0) {
      throw new ConciliacionV2Error(
        404,
        'PARTIDA_EXTRACTO_NO_ENCONTRADA',
        'La línea de extracto indicada para el cheque no existe en la empresa.'
      );
    }
    if (elRes.rows[0].cuentaFinancieraId !== cuentaFinancieraId) {
      throw new ConciliacionV2Error(
        409,
        'CUENTA_FINANCIERA_INCOMPATIBLE',
        'La línea de extracto pertenece a otra cuenta financiera.'
      );
    }
    if (elRes.rows[0].extractoEstado === 'ANULADO') {
      throw new ConciliacionV2Error(
        409,
        'EXTRACTO_ANULADO',
        'No se puede vincular un cheque a un extracto anulado.'
      );
    }
    await asegurarVinculoChequeUnicoEnTx(
      client,
      empresaId,
      'extracto_linea_id',
      refs.extractoLineaId,
      excluirId
    );
    fechaExtractoLinea = elRes.rows[0].fecha;
  }

  if (refs.anexoId) {
    const axRes = await client.query<{ id: string }>(
      `SELECT id FROM anexos WHERE empresa_id = $1 AND id = $2 LIMIT 1`,
      [empresaId, refs.anexoId]
    );
    if (axRes.rows.length === 0) {
      throw new ConciliacionV2Error(
        404,
        'ANEXO_NO_ENCONTRADO',
        'El anexo indicado para el cheque no existe en la empresa.'
      );
    }
  }

  return { fechaExtractoLinea };
}

// ============================================================================
// SERVICIO PRINCIPAL: CHEQUES Y CONTROL TRIBUTARIO
// ============================================================================

export const chequesYControlService = {
  async listarCheques(
    empresaId: string,
    filtros?: { cuentaFinancieraId?: string; estado?: string }
  ): Promise<ChequeBancarioV2[]> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');

    if (filtros?.cuentaFinancieraId) {
      asegurarUuid(filtros.cuentaFinancieraId, 'cuentaFinancieraId');
    }
    if (
      filtros?.estado &&
      !(ESTADOS_CHEQUE_BANCARIO_V2 as readonly string[]).includes(filtros.estado)
    ) {
      throw new ConciliacionV2Error(
        400,
        'ESTADO_CHEQUE_INVALIDO',
        `Estado de cheque no válido: ${filtros.estado}.`
      );
    }

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const conditions = ['empresa_id = $1'];
      const params: unknown[] = [empresaId];

      if (filtros?.cuentaFinancieraId) {
        params.push(filtros.cuentaFinancieraId);
        conditions.push(`cuenta_financiera_id = $${params.length}`);
      }
      if (filtros?.estado) {
        params.push(filtros.estado);
        conditions.push(`estado = $${params.length}`);
      }

      const res = await client.query(
        `SELECT ${SELECT_CHEQUE_COLS}
         FROM cheques_bancarios
         WHERE ${conditions.join(' AND ')}
         ORDER BY fecha_giro DESC, created_at DESC`,
        params
      );

      return res.rows.map(mapChequeRow);
    });
  },

  async registrarCheque(
    empresaId: string,
    userId: string,
    input: CrearChequeBancarioInput
  ): Promise<ChequeBancarioV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');

    const parsed = crearChequeSchema.parse(input);
    const montoDec = Money.round(parsed.monto);
    const fechaVencimiento = calcularFechaVencimientoCheque(
      parsed.fechaGiro,
      parsed.fechaVencimiento ?? null
    );

    if (parsed.fechaEntrega && parsed.fechaEntrega < parsed.fechaGiro) {
      throw new ConciliacionV2Error(
        400,
        'FECHA_CHEQUE_INVALIDA',
        'fechaEntrega no puede ser anterior a fechaGiro.'
      );
    }
    if (fechaVencimiento < parsed.fechaGiro) {
      throw new ConciliacionV2Error(
        400,
        'FECHA_CHEQUE_INVALIDA',
        'fechaVencimiento no puede ser anterior a fechaGiro.'
      );
    }

    return db.withEmpresaTransaction(empresaId, async (client) => {
      await client.query(
        `SELECT id FROM cuentas_financieras WHERE empresa_id = $1 AND id = $2 FOR UPDATE`,
        [empresaId, parsed.cuentaFinancieraId]
      );

      const cuenta = await obtenerCuentaBancariaEnTx(client, empresaId, parsed.cuentaFinancieraId);
      validarPrecondicionOperacionCuenta(cuenta.cuentaContableId);
      if (!cuenta.activa) {
        throw new ConciliacionV2Error(
          409,
          'CUENTA_FINANCIERA_INACTIVA',
          'La cuenta financiera se encuentra inactiva.'
        );
      }

      const moneda = parsed.moneda ?? (cuenta.moneda === 'USD' ? 'USD' : 'PEN');
      if (moneda !== cuenta.moneda) {
        throw new ConciliacionV2Error(
          409,
          'MONEDA_INCOMPATIBLE',
          `La moneda del cheque (${moneda}) debe coincidir con la moneda de la cuenta financiera (${cuenta.moneda}).`
        );
      }

      await verificarPeriodoNoCerradoEnTx(
        client,
        empresaId,
        parsed.cuentaFinancieraId,
        parsed.fechaGiro.slice(0, 7)
      );

      await validarReferenciasChequeEnTx(client, empresaId, parsed.cuentaFinancieraId, {
        movimientoTesoreriaId: parsed.movimientoTesoreriaId ?? null,
        extractoLineaId: parsed.extractoLineaId ?? null,
        anexoId: parsed.anexoId ?? null,
      });

      const dupRes = await client.query<{ id: string }>(
        `SELECT id
         FROM cheques_bancarios
         WHERE empresa_id = $1
           AND cuenta_financiera_id = $2
           AND numero_cheque = $3
         LIMIT 1`,
        [empresaId, parsed.cuentaFinancieraId, parsed.numeroCheque]
      );
      if (dupRes.rows.length > 0) {
        throw new ConciliacionV2Error(
          409,
          'CHEQUE_DUPLICADO',
          `Ya existe el cheque N° ${parsed.numeroCheque} registrado en esta cuenta financiera.`
        );
      }

      const insRes = await client.query(
        `INSERT INTO cheques_bancarios (
           empresa_id,
           cuenta_financiera_id,
           movimiento_tesoreria_id,
           extracto_linea_id,
           anexo_id,
           numero_cheque,
           beneficiario,
           moneda,
           monto,
           fecha_giro,
           fecha_entrega,
           fecha_vencimiento,
           estado,
           es_no_negociable,
           observacion,
           created_by,
           updated_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'GIRADO', $13, $14, $15, $15)
         RETURNING ${SELECT_CHEQUE_COLS}`,
        [
          empresaId,
          parsed.cuentaFinancieraId,
          parsed.movimientoTesoreriaId ?? null,
          parsed.extractoLineaId ?? null,
          parsed.anexoId ?? null,
          parsed.numeroCheque,
          parsed.beneficiario,
          moneda,
          Money.format(montoDec),
          parsed.fechaGiro,
          parsed.fechaEntrega ?? null,
          fechaVencimiento,
          Boolean(parsed.esNoNegociable),
          parsed.observacion ?? null,
          userId,
        ]
      );

      const creado = mapChequeRow(insRes.rows[0]);

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'cheques_bancarios',
        registroId: creado.id,
        accion: 'INSERT',
        datosNuevos: creado,
      });

      return creado;
    });
  },

  async actualizarEstadoCheque(
    empresaId: string,
    userId: string,
    chequeId: string,
    input: ActualizarEstadoChequeInput
  ): Promise<ChequeBancarioV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');
    asegurarUuid(chequeId, 'chequeId');

    const parsed = actualizarEstadoChequeSchema.parse(input);

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const actualRes = await client.query(
        `SELECT ${SELECT_CHEQUE_COLS}
         FROM cheques_bancarios
         WHERE empresa_id = $1 AND id = $2
         FOR UPDATE`,
        [empresaId, chequeId]
      );
      if (actualRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'CHEQUE_NO_ENCONTRADO',
          'El cheque bancario solicitado no existe en la empresa.'
        );
      }

      const anterior = mapChequeRow(actualRes.rows[0]);

      await client.query(
        `SELECT id FROM cuentas_financieras WHERE empresa_id = $1 AND id = $2 FOR UPDATE`,
        [empresaId, anterior.cuentaFinancieraId]
      );
      const cuenta = await obtenerCuentaBancariaEnTx(client, empresaId, anterior.cuentaFinancieraId);
      validarPrecondicionOperacionCuenta(cuenta.cuentaContableId);

      validarTransicionEstadoCheque(anterior.estado, parsed.estado);

      const { fechaExtractoLinea } = await validarReferenciasChequeEnTx(
        client,
        empresaId,
        anterior.cuentaFinancieraId,
        {
          extractoLineaId: parsed.extractoLineaId ?? null,
          excluirChequeId: chequeId,
        }
      );

      const hoyIso = new Date().toISOString().slice(0, 10);
      const nuevaFechaEntrega =
        parsed.estado === 'ENTREGADO'
          ? (parsed.fechaEntrega ?? anterior.fechaEntrega ?? hoyIso)
          : (parsed.fechaEntrega ?? anterior.fechaEntrega);

      const nuevaFechaCobro =
        parsed.estado === 'COBRADO'
          ? (parsed.fechaCobro ?? fechaExtractoLinea ?? hoyIso)
          : anterior.fechaCobro;

      if (nuevaFechaEntrega && nuevaFechaEntrega < anterior.fechaGiro) {
        throw new ConciliacionV2Error(
          400,
          'FECHA_CHEQUE_INVALIDA',
          'fechaEntrega no puede ser anterior a fechaGiro.'
        );
      }
      if (nuevaFechaCobro && nuevaFechaCobro < anterior.fechaGiro) {
        throw new ConciliacionV2Error(
          400,
          'FECHA_CHEQUE_INVALIDA',
          'fechaCobro no puede ser anterior a fechaGiro.'
        );
      }

      const periodoEvaluar = (nuevaFechaCobro ?? anterior.fechaGiro).slice(0, 7);
      await verificarPeriodoNoCerradoEnTx(
        client,
        empresaId,
        anterior.cuentaFinancieraId,
        periodoEvaluar
      );

      const nuevaObservacion =
        parsed.observacion !== undefined ? parsed.observacion : anterior.observacion;
      const nuevoExtractoLineaId =
        parsed.extractoLineaId !== undefined ? parsed.extractoLineaId : anterior.extractoLineaId;

      const updRes = await client.query(
        `UPDATE cheques_bancarios
         SET estado = $1,
             fecha_entrega = $2,
             fecha_cobro = $3,
             extracto_linea_id = $4,
             observacion = $5,
             updated_by = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE empresa_id = $7 AND id = $8
         RETURNING ${SELECT_CHEQUE_COLS}`,
        [
          parsed.estado,
          nuevaFechaEntrega ?? null,
          nuevaFechaCobro ?? null,
          nuevoExtractoLineaId ?? null,
          nuevaObservacion ?? null,
          userId,
          empresaId,
          chequeId,
        ]
      );

      const actualizado = mapChequeRow(updRes.rows[0]);

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'cheques_bancarios',
        registroId: chequeId,
        accion: 'UPDATE',
        datosAnteriores: anterior,
        datosNuevos: actualizado,
      });

      return actualizado;
    });
  },

  async obtenerAlertasControl(
    empresaId: string,
    cuentaFinancieraId: string,
    periodo: string
  ): Promise<ResumenAlertasControlV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(cuentaFinancieraId, 'cuentaFinancieraId');
    const { fechaInicio, fechaFin } = resolverRangoPeriodo(periodo);

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const cuenta = await obtenerCuentaBancariaEnTx(client, empresaId, cuentaFinancieraId);
      const config = await obtenerConfigEnTx(client, empresaId);

      // 1. Control ITF: líneas ITF sin contabilizar + comparación ITF esperado (0.005%) vs cobrado
      const extractoRes = await client.query<{
        id: string;
        fecha: string;
        descripcion: string;
        monto: string;
        conciliada: boolean;
        estadoConciliacionRaw: string | null;
        tipoClasificacion: string | null;
      }>(
        `SELECT el.id,
                el.fecha::text AS fecha,
                el.descripcion,
                el.monto::text AS monto,
                el.conciliada,
                el.estado_conciliacion AS "estadoConciliacionRaw",
                el.tipo_clasificacion AS "tipoClasificacion"
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

      const itfPendientes: AlertaItfV2[] = [];
      let totalItfPendienteDec = Money.create(0);
      let itfEsperadoRedondeadoDec = Money.create(0);
      let itfCobradoDec = Money.create(0);
      let primeraLineaIdAfecta: string | null = null;

      for (const row of extractoRes.rows) {
        const estadoEfectivo: EstadoConciliacionV2 = derivarEstadoEfectivoExtracto(
          Boolean(row.conciliada),
          row.estadoConciliacionRaw
        );
        if (estadoEfectivo === 'DUPLICADO') {
          continue;
        }

        const montoDec = Money.round(row.monto);
        const esLineaItf =
          row.tipoClasificacion === 'ITF' ||
          row.estadoConciliacionRaw === 'CARGO_BANCARIO_ITF' ||
          /\bITF\b|IMPUESTO\s+TRANSACCIONES\s+FINANCIERAS/i.test(row.descripcion);

        if (esLineaItf) {
          const absItf = montoDec.abs();
          itfCobradoDec = Money.add(itfCobradoDec, absItf);
          if (!row.conciliada) {
            itfPendientes.push({
              extractoLineaId: row.id,
              fecha: row.fecha,
              descripcion: row.descripcion,
              monto: Money.format(absItf),
              estadoConciliacion: estadoEfectivo,
              cuentaItfCodigo: config.cuentaItfCodigo,
              contabilizado: false,
            });
            totalItfPendienteDec = Money.add(totalItfPendienteDec, absItf);
          }
        } else if (!montoDec.isZero()) {
          if (!primeraLineaIdAfecta) primeraLineaIdAfecta = row.id;
          const calc = calcularItfEsperado(montoDec.abs());
          itfEsperadoRedondeadoDec = Money.add(itfEsperadoRedondeadoDec, calc.itfRedondeado);
        }
      }

      const diferenciaItfDec = Money.sub(itfEsperadoRedondeadoDec, itfCobradoDec);
      if (
        primeraLineaIdAfecta &&
        itfEsperadoRedondeadoDec.gte('0.05') &&
        diferenciaItfDec.abs().gt('0.05')
      ) {
        itfPendientes.push({
          extractoLineaId: primeraLineaIdAfecta,
          fecha: fechaFin,
          descripcion: `ITF esperado 0.005% (${Money.format(itfEsperadoRedondeadoDec)}) vs cobrado en extracto (${Money.format(itfCobradoDec)}) — diferencia ${Money.format(diferenciaItfDec)}`,
          monto: Money.format(diferenciaItfDec.abs()),
          estadoConciliacion: 'CARGO_BANCARIO_ITF',
          cuentaItfCodigo: config.cuentaItfCodigo,
          contabilizado: false,
        });
        totalItfPendienteDec = Money.add(totalItfPendienteDec, diferenciaItfDec.abs());
      }

      // 2. Control de Bancarización Ley 28194 (PEN >= 2,000.00 / USD >= 500.00)
      const alertasBancarizacion: AlertaBancarizacionV2[] = [];

      const movsNoBancRes = await client.query<{
        id: string;
        fecha: string;
        moneda: 'PEN' | 'USD';
        importe: string;
        medioPago: string;
        glosa: string;
      }>(
        `SELECT id,
                fecha::text AS fecha,
                moneda,
                importe::text AS importe,
                medio_pago AS "medioPago",
                glosa
         FROM movimientos_tesoreria
         WHERE empresa_id = $1
           AND cuenta_financiera_id = $2
           AND estado = 'REGISTRADO'
           AND fecha BETWEEN $3 AND $4
         ORDER BY fecha ASC`,
        [empresaId, cuentaFinancieraId, fechaInicio, fechaFin]
      );

      for (const m of movsNoBancRes.rows) {
        const evalBanc = evaluarBancarizacionLey28194({
          moneda: m.moneda,
          monto: m.importe,
          medioPago: m.medioPago,
        });
        if (evalBanc.aplicaControl && evalBanc.severidad && evalBanc.motivo) {
          alertasBancarizacion.push({
            origen: 'LIBRO',
            referenciaId: m.id,
            fecha: m.fecha,
            moneda: evalBanc.moneda,
            monto: evalBanc.monto,
            umbralLegal: evalBanc.umbralLegal,
            medioPago: m.medioPago,
            descripcion: m.glosa,
            motivo: evalBanc.motivo,
            severidad: evalBanc.severidad,
          });
        }
      }

      // Comprobantes de compra al contado o aplicaciones de pago del periodo sin movimiento bancario
      const comprasSinBancoRes = await client.query<{
        id: string;
        fecha: string;
        moneda: 'PEN' | 'USD';
        total: string;
        serie: string;
        numero: string;
        razonSocial: string | null;
      }>(
        `SELECT cc.id,
                cc.fecha_emision::text AS fecha,
                cc.moneda,
                cc.total::text AS total,
                cc.serie,
                cc.numero,
                ax.razon_social AS "razonSocial"
         FROM comprobantes_compra cc
         LEFT JOIN anexos ax
           ON ax.id = cc.proveedor_id
          AND ax.empresa_id = cc.empresa_id
         WHERE cc.empresa_id = $1
           AND cc.estado = 'REGISTRADO'
           AND cc.forma_pago = 'CONTADO'
           AND cc.fecha_emision BETWEEN $2 AND $3
           AND NOT EXISTS (
             SELECT 1
             FROM cuentas_por_pagar cxp
             JOIN aplicaciones_pago ap
               ON ap.cuenta_por_pagar_id = cxp.id
              AND ap.empresa_id = cxp.empresa_id
             WHERE cxp.empresa_id = cc.empresa_id
               AND cxp.comprobante_id = cc.id
               AND ap.movimiento_tesoreria_id IS NOT NULL
           )
         ORDER BY cc.fecha_emision ASC`,
        [empresaId, fechaInicio, fechaFin]
      );

      for (const comp of comprasSinBancoRes.rows) {
        const evalBanc = evaluarBancarizacionLey28194({
          moneda: comp.moneda,
          monto: comp.total,
          medioPago: '008',
        });
        if (evalBanc.aplicaControl && evalBanc.motivo) {
          alertasBancarizacion.push({
            origen: 'LIBRO',
            referenciaId: comp.id,
            fecha: comp.fecha,
            moneda: evalBanc.moneda,
            monto: evalBanc.monto,
            umbralLegal: evalBanc.umbralLegal,
            medioPago: '008',
            descripcion: `Compra contado ${comp.serie}-${comp.numero}${comp.razonSocial ? ` (${comp.razonSocial})` : ''}`,
            motivo: `Comprobante al contado sin medio bancario trazado en tesorería (${evalBanc.umbralLegal} ${evalBanc.moneda}).`,
            severidad: 'ADVERTENCIA',
          });
        }
      }

      // Cheques sin cláusula NO NEGOCIABLE por encima del umbral Ley 28194
      const chequesTodosRes = await client.query<{
        id: string;
        movimientoTesoreriaId: string | null;
        numeroCheque: string;
        beneficiario: string;
        moneda: 'PEN' | 'USD';
        monto: string;
        fechaGiro: string;
        estado: EstadoChequeBancarioV2;
        esNoNegociable: boolean;
      }>(
        `SELECT id,
                movimiento_tesoreria_id AS "movimientoTesoreriaId",
                numero_cheque AS "numeroCheque",
                beneficiario,
                moneda,
                monto::text AS monto,
                fecha_giro::text AS "fechaGiro",
                estado,
                es_no_negociable AS "esNoNegociable"
         FROM cheques_bancarios
         WHERE empresa_id = $1
           AND cuenta_financiera_id = $2
           AND fecha_giro <= $3
           AND estado <> 'ANULADO'
         ORDER BY fecha_giro ASC`,
        [empresaId, cuentaFinancieraId, fechaFin]
      );

      for (const ch of chequesTodosRes.rows) {
        if (ch.fechaGiro >= fechaInicio && ch.fechaGiro <= fechaFin && !ch.esNoNegociable) {
          const evalChequeBanc = evaluarBancarizacionLey28194({
            moneda: ch.moneda,
            monto: ch.monto,
            medioPago: '007',
            esNoNegociable: ch.esNoNegociable,
          });
          if (evalChequeBanc.aplicaControl && evalChequeBanc.severidad && evalChequeBanc.motivo) {
            alertasBancarizacion.push({
              origen: 'LIBRO',
              referenciaId: ch.id,
              fecha: ch.fechaGiro,
              moneda: evalChequeBanc.moneda,
              monto: evalChequeBanc.monto,
              umbralLegal: evalChequeBanc.umbralLegal,
              medioPago: '007',
              descripcion: `Cheque N° ${ch.numeroCheque} - ${ch.beneficiario}`,
              motivo: evalChequeBanc.motivo,
              severidad: evalChequeBanc.severidad,
            });
          }
        }
      }

      // 3. Antigüedad de cheques no cobrados (cheques_bancarios + movimientos_tesoreria medio_pago = '007')
      const chequesAntiguedad: AlertaChequeAntiguedadV2[] = [];
      let totalChequesNoCobradosAlertaDec = Money.create(0);
      const movsConChequeTabla = new Set<string>();

      for (const ch of chequesTodosRes.rows) {
        if (ch.movimientoTesoreriaId) {
          movsConChequeTabla.add(ch.movimientoTesoreriaId);
        }
        if (ch.estado === 'COBRADO') continue;

        const evalAnt = evaluarAntiguedadCheque({
          fechaGiro: ch.fechaGiro,
          fechaCorte: fechaFin,
          estado: ch.estado,
        });
        if (evalAnt.enAlerta && evalAnt.motivo) {
          const montoFmt = Money.format(ch.monto);
          chequesAntiguedad.push({
            chequeId: ch.id,
            movimientoTesoreriaId: ch.movimientoTesoreriaId,
            numeroCheque: ch.numeroCheque,
            beneficiario: ch.beneficiario,
            fechaGiro: ch.fechaGiro,
            diasTranscurridos: evalAnt.diasTranscurridos,
            monto: montoFmt,
            moneda: ch.moneda,
            estadoCheque: ch.estado,
            vencidoPlazoLegal: evalAnt.vencidoPlazoLegal,
            motivo: evalAnt.motivo,
          });
          totalChequesNoCobradosAlertaDec = Money.add(totalChequesNoCobradosAlertaDec, montoFmt);
        }
      }

      const movsChequePendRes = await client.query<{
        id: string;
        fecha: string;
        moneda: 'PEN' | 'USD';
        importe: string;
        numeroOperacion: string | null;
        anexoNombre: string | null;
        glosa: string;
      }>(
        `SELECT mt.id,
                mt.fecha::text AS fecha,
                mt.moneda,
                mt.importe::text AS importe,
                mt.numero_operacion AS "numeroOperacion",
                ax.razon_social AS "anexoNombre",
                mt.glosa
         FROM movimientos_tesoreria mt
         LEFT JOIN anexos ax
           ON ax.id = mt.anexo_id
          AND ax.empresa_id = mt.empresa_id
         WHERE mt.empresa_id = $1
           AND mt.cuenta_financiera_id = $2
           AND mt.estado = 'REGISTRADO'
           AND mt.conciliado = false
           AND mt.tipo = 'EGRESO'
           AND mt.medio_pago = '007'
           AND mt.fecha <= $3
         ORDER BY mt.fecha ASC`,
        [empresaId, cuentaFinancieraId, fechaFin]
      );

      for (const mc of movsChequePendRes.rows) {
        if (movsConChequeTabla.has(mc.id)) continue;

        const evalAnt = evaluarAntiguedadCheque({
          fechaGiro: mc.fecha,
          fechaCorte: fechaFin,
          estado: 'PENDIENTE',
        });
        if (evalAnt.enAlerta && evalAnt.motivo) {
          const montoFmt = Money.format(mc.importe);
          chequesAntiguedad.push({
            chequeId: null,
            movimientoTesoreriaId: mc.id,
            numeroCheque: mc.numeroOperacion ?? null,
            beneficiario: mc.anexoNombre ?? mc.glosa,
            fechaGiro: mc.fecha,
            diasTranscurridos: evalAnt.diasTranscurridos,
            monto: montoFmt,
            moneda: mc.moneda === 'USD' ? 'USD' : 'PEN',
            estadoCheque: 'PENDIENTE',
            vencidoPlazoLegal: evalAnt.vencidoPlazoLegal,
            motivo: evalAnt.motivo,
          });
          totalChequesNoCobradosAlertaDec = Money.add(totalChequesNoCobradosAlertaDec, montoFmt);
        }
      }

      const totalAlertas =
        itfPendientes.length + alertasBancarizacion.length + chequesAntiguedad.length;

      return {
        empresaId,
        cuentaFinancieraId: cuenta.id,
        periodo,
        fechaCorte: fechaFin,
        itfPendientes,
        totalItfPendiente: Money.format(totalItfPendienteDec),
        alertasBancarizacion,
        chequesAntiguedad,
        totalChequesNoCobradosAlerta: Money.format(totalChequesNoCobradosAlertaDec),
        totalAlertas,
      };
    });
  },
};
