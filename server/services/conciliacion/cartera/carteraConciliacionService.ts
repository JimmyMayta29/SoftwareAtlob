import { randomUUID } from 'node:crypto';
import type Decimal from 'decimal.js';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { db } from '../../../config/database';
import {
  AplicarLineaCarteraInput,
  GrupoConciliacionV2,
  ItemConciliacionV2,
  OrigenPartidaLibroV2,
  ResultadoAplicarCarteraV2,
  SugerenciaDocumentoCarteraV2,
  TIPOS_OPERACION_CARTERA_ESPECIAL_V2,
  TipoDocumentoCarteraV2,
  TipoMatchV2,
  TipoOperacionCarteraEspecialV2,
} from '../../../types/conciliacionV2';
import { Money } from '../../../utils/decimal';
import { asientoService } from '../../asientoService';
import {
  ConciliacionV2Error,
  asegurarPostgresDisponible,
  asegurarUuid,
  obtenerConfigEnTx,
  obtenerCuentaBancariaEnTx,
  registrarAuditoriaEnTx,
  resolverRangoPeriodo,
  validarPrecondicionOperacionCuenta,
  verificarPeriodoNoCerradoEnTx,
} from '../../conciliacionV2Service';
import { tesoreriaService } from '../../tesoreriaService';
import { evaluarBancarizacionLey28194 } from '../cheques/chequesYControlService';

const PERIODO_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const aplicarLineaCarteraSchema = z.object({
  cuentaFinancieraId: z.string().uuid('cuentaFinancieraId debe ser un UUID válido.'),
  periodo: z.string().regex(PERIODO_REGEX, 'periodo debe tener formato YYYY-MM.'),
  extractoLineaId: z.string().uuid('extractoLineaId debe ser un UUID válido.'),
  tipoCartera: z.enum(['CXC', 'CXP', 'OTRO_PERUANO']),
  tipoOperacionEspecial: z.enum(TIPOS_OPERACION_CARTERA_ESPECIAL_V2).optional(),
  aplicaciones: z
    .array(
      z.object({
        documentoId: z.string().uuid('documentoId debe ser un UUID válido.'),
        importeAplicado: z
          .union([z.string(), z.number()])
          .refine(
            (v) => /^-?\d+(\.\d+)?$/.test(String(v).trim()) && Money.round(v).gt(0),
            { message: 'importeAplicado debe ser mayor a 0.00.' }
          ),
      })
    )
    .max(100)
    .optional(),
  medioPago: z.string().trim().min(1).max(30).optional(),
  tipoCambio: z.number().positive('tipoCambio debe ser mayor a cero.').optional(),
  anexoId: z.string().uuid('anexoId debe ser un UUID válido.').nullable().optional(),
  cuentaContrapartidaCodigo: z.string().trim().min(2).max(20).nullable().optional(),
  detraccionId: z.string().uuid('detraccionId debe ser un UUID válido.').nullable().optional(),
  esAnticipo: z.boolean().optional(),
  tieneRetencion: z.boolean().optional(),
  montoRetencion: z.union([z.string(), z.number()]).nullable().optional(),
  porcentajeRetencion: z.number().min(0).max(100).nullable().optional(),
  comisionPosMonto: z.union([z.string(), z.number()]).nullable().optional(),
  cuentaComisionPosCodigo: z.string().trim().min(2).max(20).nullable().optional(),
  generarAsientoComisionPos: z.boolean().optional(),
  esCheque: z.boolean().optional(),
  esDepositoCheque: z.boolean().optional(),
  numeroCheque: z.string().trim().max(40).nullable().optional(),
  diferenciaCambio: z.union([z.string(), z.number()]).nullable().optional(),
  tipoDiferencia: z.enum(['GANANCIA', 'PERDIDA', 'NINGUNA']).optional(),
  montoOriginalDoc: z.union([z.string(), z.number()]).nullable().optional(),
  glosa: z.string().trim().max(250).nullable().optional(),
});

// ============================================================================
// FUNCIONES PURAS DE SCORING Y CÁLCULO MONETARIO PERUANO (100% Money)
// ============================================================================

function normalizarTextoCartera(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS_CARTERA = new Set([
  'DE',
  'DEL',
  'LA',
  'LAS',
  'EL',
  'LOS',
  'Y',
  'EN',
  'POR',
  'PARA',
  'SAC',
  'SRL',
  'SA',
  'SAA',
  'EIRL',
  'PAGO',
  'ABONO',
  'CARGO',
  'TRANSFERENCIA',
  'FACTURA',
  'BOLETA',
  'OP',
]);

function extraerTokensNombre(texto: string | null | undefined): Set<string> {
  const norm = normalizarTextoCartera(texto).replace(/-/g, ' ');
  if (!norm) return new Set();
  const out = new Set<string>();
  for (const tk of norm.split(' ')) {
    if (tk.length >= 3 && !STOPWORDS_CARTERA.has(tk)) {
      out.add(tk);
    }
  }
  return out;
}

function construirPatronesComprobante(serie: string, numero: string): string[] {
  const s = serie.trim().toUpperCase();
  const n = numero.trim().toUpperCase();
  const nSinCeros = n.replace(/^0+/, '') || '0';
  return Array.from(
    new Set([
      `${s}-${n}`,
      `${s}${n}`,
      `${s}-${nSinCeros}`,
      `${s}${nSinCeros}`,
    ])
  );
}

export interface EvaluacionScoreCartera {
  score: number;
  motivos: string[];
  diferenciaAbsSaldo: string;
}

export function calcularScoreDocumentoCartera(params: {
  montoLineaAbs: string | number | Decimal;
  descripcionLinea: string;
  referenciaLinea: string | null;
  rucExtraido: string | null;
  contraparteExtraida: string | null;
  docExtraido: string | null;
  anexoRuc: string | null;
  anexoNombre: string | null;
  serie: string;
  numero: string;
  saldoPendiente: string | number | Decimal;
}): EvaluacionScoreCartera {
  let score = 0;
  const motivos: string[] = [];

  const montoAbsDec = Money.round(params.montoLineaAbs).abs();
  const saldoDec = Money.round(params.saldoPendiente);
  const difSaldoDec = Money.sub(montoAbsDec, saldoDec).abs();

  const textoCompleto = normalizarTextoCartera(
    `${params.descripcionLinea} ${params.referenciaLinea ?? ''} ${params.docExtraido ?? ''}`
  );
  const textoCompacto = textoCompleto.replace(/[\s-]+/g, '');

  // 1. RUC coincidente
  const rucAnexo = params.anexoRuc?.trim() || null;
  const rucLinea = params.rucExtraido?.trim() || null;
  if (rucAnexo && (rucLinea === rucAnexo || textoCompacto.includes(rucAnexo))) {
    score += 0.35;
    motivos.push(`RUC coincidente (${rucAnexo})`);
  }

  // 2. Serie-número en descripción / docExtraido / referencia
  const patronesDoc = construirPatronesComprobante(params.serie, params.numero);
  const docMatch = patronesDoc.some((pat) => {
    const patNorm = normalizarTextoCartera(pat);
    const patCompacto = patNorm.replace(/[\s-]+/g, '');
    return (
      textoCompleto.includes(patNorm) ||
      textoCompacto.includes(patCompacto) ||
      (params.docExtraido &&
        normalizarTextoCartera(params.docExtraido).replace(/[\s-]+/g, '').includes(patCompacto))
    );
  });
  if (docMatch) {
    score += 0.35;
    motivos.push(`Comprobante coincidente (${params.serie}-${params.numero})`);
  }

  // 3. Monto exacto o compatible con aplicación parcial / retención / detracción / POS
  if (Money.isEqual(montoAbsDec, saldoDec)) {
    score += 0.35;
    motivos.push('Monto exacto al saldo pendiente');
  } else if (saldoDec.gt(0)) {
    const netoRet3 = Money.sub(saldoDec, Money.round(saldoDec.times('0.03')));
    const netoDet4 = Money.sub(saldoDec, Money.round(saldoDec.times('0.04')));
    const netoDet10 = Money.sub(saldoDec, Money.round(saldoDec.times('0.10')));
    const netoDet12 = Money.sub(saldoDec, Money.round(saldoDec.times('0.12')));

    if (
      Money.isEqual(montoAbsDec, netoRet3) ||
      Money.isEqual(montoAbsDec, netoDet4) ||
      Money.isEqual(montoAbsDec, netoDet10) ||
      Money.isEqual(montoAbsDec, netoDet12)
    ) {
      score += 0.25;
      motivos.push('Importe compatible con neto tras retención IGV / detracción SPOT');
    } else if (montoAbsDec.lt(saldoDec)) {
      const ratio = montoAbsDec.dividedBy(saldoDec);
      if (ratio.gte('0.94')) {
        score += 0.22;
        motivos.push('Importe compatible con cobro neto tras comisión POS o retención');
      } else {
        score += 0.15;
        motivos.push('Importe compatible con aplicación parcial');
      }
    } else {
      score += 0.1;
      motivos.push('Saldo menor al importe bancario (aplicación múltiple)');
    }
  }

  // 4. Nombre de contraparte
  const tokensAnexo = extraerTokensNombre(params.anexoNombre);
  const tokensLinea = extraerTokensNombre(
    `${params.contraparteExtraida ?? ''} ${params.descripcionLinea}`
  );
  if (tokensAnexo.size > 0 && tokensLinea.size > 0) {
    let inter = 0;
    for (const tk of tokensAnexo) {
      if (tokensLinea.has(tk)) inter += 1;
    }
    const overlap = inter / Math.min(tokensAnexo.size, tokensLinea.size);
    if (overlap >= 0.5) {
      score += Number((0.2 * overlap).toFixed(2));
      motivos.push('Nombre de contraparte coincidente');
    }
  }

  const scoreFinal = Number(Math.min(1, Math.max(0, score)).toFixed(2));
  return {
    score: scoreFinal,
    motivos,
    diferenciaAbsSaldo: Money.format(difSaldoDec),
  };
}

export interface ResultadoCalculoEspecialCartera {
  importeMovimientoTesoreria: string;
  montoRetencion: string;
  porcentajeRetencion: number | null;
  comisionPosMonto: string;
  totalCobranzaBruta: string;
  saldoSinAplicar: string;
}

/**
 * Calcula importes exactos con Money para Retención IGV (CRE 3%), Detracción SPOT,
 * Comisión POS (neto banco + comisión = cobranza total) y Anticipos.
 */
export function calcularImportesAplicacionCartera(params: {
  montoLineaAbs: string | number | Decimal;
  totalAplicado: string | number | Decimal;
  tipoOperacionEspecial: TipoOperacionCarteraEspecialV2;
  tieneRetencion?: boolean;
  montoRetencion?: string | number | null;
  porcentajeRetencion?: number | null;
  comisionPosMonto?: string | number | null;
  generarAsientoComisionPos?: boolean;
  esAnticipo?: boolean;
}): ResultadoCalculoEspecialCartera {
  const bancoAbsDec = Money.round(params.montoLineaAbs).abs();
  const totalAppDec = Money.round(params.totalAplicado);

  let retencionDec = Money.create(0);
  let pctRetencion: number | null = params.porcentajeRetencion ?? null;
  let comisionPosDec = Money.create(0);
  let importeMovDec = bancoAbsDec;

  const usaRetencion =
    params.tipoOperacionEspecial === 'RETENCION_IGV' || params.tieneRetencion === true;

  if (usaRetencion) {
    if (params.montoRetencion !== null && params.montoRetencion !== undefined) {
      retencionDec = Money.round(params.montoRetencion);
    } else {
      const pct = pctRetencion !== null && pctRetencion > 0 ? pctRetencion : 3;
      pctRetencion = pct;
      if (totalAppDec.gt(bancoAbsDec)) {
        retencionDec = Money.round(totalAppDec.times(pct).dividedBy(100));
      } else {
        const factorNeto = Money.create(1).minus(Money.create(pct).dividedBy(100));
        const brutoEstimado = factorNeto.gt(0)
          ? Money.round(bancoAbsDec.dividedBy(factorNeto))
          : bancoAbsDec;
        retencionDec = Money.sub(brutoEstimado, bancoAbsDec);
      }
    }
    if (retencionDec.lt(0)) {
      throw new ConciliacionV2Error(
        400,
        'RETENCION_INVALIDA',
        'El monto de retención IGV no puede ser negativo.'
      );
    }
    importeMovDec = Money.add(bancoAbsDec, retencionDec);
  } else if (params.tipoOperacionEspecial === 'COMISION_POS') {
    if (params.comisionPosMonto !== null && params.comisionPosMonto !== undefined) {
      comisionPosDec = Money.round(params.comisionPosMonto);
    } else if (totalAppDec.gt(bancoAbsDec)) {
      comisionPosDec = Money.sub(totalAppDec, bancoAbsDec);
    }
    if (comisionPosDec.lt(0)) {
      throw new ConciliacionV2Error(
        400,
        'COMISION_POS_INVALIDA',
        'La comisión POS no puede ser negativa.'
      );
    }
    if (comisionPosDec.gt(0) && params.generarAsientoComisionPos !== false) {
      importeMovDec = Money.add(bancoAbsDec, comisionPosDec);
    }
  }

  const saldoSinAplicarDec = Money.sub(importeMovDec, totalAppDec);
  if (saldoSinAplicarDec.isNegative()) {
    throw new ConciliacionV2Error(
      409,
      'IMPORTE_APLICADO_EXCEDE_OPERACION',
      `La suma aplicada (${Money.format(totalAppDec)}) supera el importe total de la operación (${Money.format(importeMovDec)}).`
    );
  }
  if (saldoSinAplicarDec.gt(0) && !params.esAnticipo && totalAppDec.gt(0)) {
    throw new ConciliacionV2Error(
      409,
      'SALDO_SIN_APLICAR_REQUIERE_ANTICIPO',
      `Existe un remanente sin aplicar (${Money.format(saldoSinAplicarDec)}). Marque esAnticipo = true para registrarlo como anticipo.`
    );
  }

  return {
    importeMovimientoTesoreria: Money.format(importeMovDec),
    montoRetencion: Money.format(retencionDec),
    porcentajeRetencion: pctRetencion,
    comisionPosMonto: Money.format(comisionPosDec),
    totalCobranzaBruta: Money.format(importeMovDec),
    saldoSinAplicar: Money.format(saldoSinAplicarDec),
  };
}

/**
 * [M-03] Impide usar esCheque=true en abonos bancarios (> 0); para cobros de cheques
 * depositados debe usarse esDepositoCheque=true.
 */
export function validarCombinacionChequeCartera(esAbono: boolean, esCheque?: boolean): void {
  if (esAbono && esCheque === true) {
    throw new ConciliacionV2Error(
      400,
      'CHEQUE_CARTERA_SOLO_DEPOSITO',
      'Para abonos bancarios de cheques de clientes use esDepositoCheque=true; esCheque=true aplica únicamente a egresos o cobros aún no depositados en banco.'
    );
  }
}

/**
 * [M-01] Determina las cuentas PCGE secundarias que deben validarse activas en
 * plan_cuentas antes de invocar tesoreriaService.registrarMovimiento.
 */
export function obtenerCuentasSecundariasCartera(params: {
  esAbono: boolean;
  tipoOpEspecial: TipoOperacionCarteraEspecialV2;
  tieneRetencion?: boolean;
  esCheque?: boolean;
  esDepositoCheque?: boolean;
  esAnticipo?: boolean;
  tipoDiferencia?: 'GANANCIA' | 'PERDIDA' | 'NINGUNA';
}): Array<{ codigo: string; etiqueta: string }> {
  const cuentas: Array<{ codigo: string; etiqueta: string }> = [];

  if (params.tipoOpEspecial === 'RETENCION_IGV' || params.tieneRetencion === true) {
    cuentas.push({ codigo: '40114', etiqueta: 'Retención IGV (40114)' });
  }
  if (params.esCheque === true || params.esDepositoCheque === true) {
    cuentas.push({ codigo: '1031', etiqueta: 'Cheques / Efectivo en tránsito (1031)' });
  }
  if (params.esAbono && params.esAnticipo === true) {
    cuentas.push({ codigo: '1221', etiqueta: 'Anticipos de clientes (1221)' });
  }
  if (!params.esAbono && params.esAnticipo === true) {
    cuentas.push({ codigo: '422', etiqueta: 'Anticipos a proveedores (422)' });
  }
  if (params.tipoDiferencia === 'GANANCIA') {
    cuentas.push({ codigo: '776', etiqueta: 'Ganancia por diferencia de cambio (776)' });
  } else if (params.tipoDiferencia === 'PERDIDA') {
    cuentas.push({ codigo: '676', etiqueta: 'Pérdida por diferencia de cambio (676)' });
  }

  return cuentas;
}

/**
 * [A-01] Formatea el monto imputado en conciliacion_item del lado LIBRO usando
 * exactamente el flujo bancario neto registrado en movimientos_tesoreria.importe con signo.
 */
export function formatearMontoLibroMovimiento(
  esAbono: boolean,
  importeMovimiento: string | number | Decimal
): string {
  const movDec = Money.round(importeMovimiento);
  return Money.format(esAbono ? movDec : movDec.negated());
}

// ============================================================================
// HELPERS INTERNOS EN TRANSACCIÓN
// ============================================================================

async function validarCuentaPlanActivaEnTx(
  client: PoolClient,
  empresaId: string,
  codigo: string,
  etiqueta: string
): Promise<{ id: string; codigo: string; nombre: string }> {
  const res = await client.query<{
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
     WHERE empresa_id = $1 AND codigo = $2
     LIMIT 1`,
    [empresaId, codigo.trim()]
  );

  const row = res.rows[0];
  if (!row || !row.isActive || row.esInactiva || !row.permiteMovimiento) {
    throw new ConciliacionV2Error(
      409,
      'CUENTA_PCGE_INEXISTENTE_EN_EMPRESA',
      `La cuenta PCGE "${codigo}" (${etiqueta}) no existe, está inactiva o no permite movimiento en la empresa.`
    );
  }
  return { id: row.id, codigo: row.codigo, nombre: row.nombre };
}

async function existeCuentaActivaPlanEnTx(
  client: PoolClient,
  empresaId: string,
  codigo: string
): Promise<boolean> {
  const res = await client.query<{ id: string }>(
    `SELECT id
     FROM plan_cuentas
     WHERE empresa_id = $1
       AND codigo = $2
       AND is_active = true
       AND COALESCE(es_inactiva, false) = false
       AND permite_movimiento = true
     LIMIT 1`,
    [empresaId, codigo.trim()]
  );
  return res.rows.length > 0;
}

async function resolverPeriodoIdEnTx(
  client: PoolClient,
  empresaId: string,
  codigoPeriodo: string
): Promise<string> {
  const res = await client.query<{ id: string; estado: string }>(
    `SELECT id, estado FROM periodos WHERE empresa_id = $1 AND codigo_periodo = $2 LIMIT 1`,
    [empresaId, codigoPeriodo]
  );
  if (res.rows.length === 0) {
    throw new ConciliacionV2Error(
      404,
      'PERIODO_NO_ENCONTRADO',
      `El periodo contable ${codigoPeriodo} no existe en la empresa.`
    );
  }
  if (res.rows[0].estado === 'CERRADO' || res.rows[0].estado === 'BLOQUEADO_AUDITORIA') {
    throw new ConciliacionV2Error(
      409,
      'PERIODO_CERRADO',
      `El periodo contable ${codigoPeriodo} está ${res.rows[0].estado}.`
    );
  }
  return res.rows[0].id;
}

async function resolverTipoCambioEnTx(
  client: PoolClient,
  moneda: 'PEN' | 'USD',
  fecha: string,
  tipoCambioInput?: number
): Promise<number> {
  if (tipoCambioInput && tipoCambioInput > 0) {
    return tipoCambioInput;
  }
  if (moneda === 'PEN') {
    return 1.0;
  }
  const res = await client.query<{ venta: string }>(
    `SELECT venta::text AS venta FROM tipos_cambio WHERE fecha <= $1 ORDER BY fecha DESC LIMIT 1`,
    [fecha]
  );
  if (!res.rows[0]?.venta) {
    throw new ConciliacionV2Error(
      409,
      'TIPO_CAMBIO_NO_DISPONIBLE',
      `No existe tipo de cambio USD registrado en tipos_cambio para la fecha ${fecha}.`
    );
  }
  return Number(res.rows[0].venta);
}

async function rechazarSugerenciasSuperpuestasLineaEnTx(
  client: PoolClient,
  empresaId: string,
  usuarioId: string,
  grupoExcluidoId: string,
  extractoLineaId: string
): Promise<void> {
  const superpuestosRes = await client.query<{ id: string }>(
    `SELECT cg.id
     FROM conciliacion_grupo cg
     WHERE cg.empresa_id = $1
       AND cg.estado = 'SUGERIDO'
       AND cg.id <> $2
       AND EXISTS (
         SELECT 1
         FROM conciliacion_item ci
         WHERE ci.empresa_id = cg.empresa_id
           AND ci.grupo_id = cg.id
           AND ci.lado = 'BANCO'
           AND ci.extracto_linea_id = $3
       )
     ORDER BY cg.id ASC
     FOR UPDATE OF cg`,
    [empresaId, grupoExcluidoId, extractoLineaId]
  );

  if (superpuestosRes.rows.length === 0) return;

  const ids = superpuestosRes.rows.map((r) => r.id);
  const afectadasRes = await client.query<{ extractoLineaId: string }>(
    `SELECT DISTINCT extracto_linea_id AS "extractoLineaId"
     FROM conciliacion_item
     WHERE empresa_id = $1
       AND grupo_id = ANY($2::uuid[])
       AND lado = 'BANCO'
       AND extracto_linea_id IS NOT NULL`,
    [empresaId, ids]
  );

  await client.query(
    `UPDATE conciliacion_grupo
     SET estado = 'RECHAZADO',
         observacion = COALESCE(observacion || ' ', '') || '[Superpuesto por aplicación a cartera]',
         updated_at = CURRENT_TIMESTAMP
     WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
    [empresaId, ids]
  );

  const otrasLineas = afectadasRes.rows
    .map((r) => r.extractoLineaId)
    .filter((id) => id !== extractoLineaId);

  if (otrasLineas.length > 0) {
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
      [empresaId, otrasLineas]
    );
  }

  for (const gid of ids) {
    await registrarAuditoriaEnTx(client, {
      empresaId,
      usuarioId,
      tablaAfectada: 'conciliacion_grupo',
      registroId: gid,
      accion: 'UPDATE',
      datosAnteriores: { estado: 'SUGERIDO' },
      datosNuevos: { estado: 'RECHAZADO', motivo: 'Superpuesto por aplicación a cartera' },
    });
  }
}

// ============================================================================
// SERVICIO PRINCIPAL: CARTERA CXC/CXP EN CONCILIACIÓN V2
// ============================================================================

export const carteraConciliacionService = {
  async sugerirDocumentosPendientes(
    empresaId: string,
    extractoLineaId: string
  ): Promise<SugerenciaDocumentoCarteraV2[]> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(extractoLineaId, 'extractoLineaId');

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const lineaRes = await client.query<{
        id: string;
        fecha: string;
        descripcion: string;
        referencia: string | null;
        monto: string;
        rucExtraido: string | null;
        contraparteExtraida: string | null;
        docExtraido: string | null;
        extractoEstado: string;
      }>(
        `SELECT el.id,
                el.fecha::text AS fecha,
                el.descripcion,
                el.referencia,
                el.monto::text AS monto,
                el.ruc_extraido AS "rucExtraido",
                el.contraparte_extraida AS "contraparteExtraida",
                el.doc_extraido AS "docExtraido",
                eb.estado AS "extractoEstado"
         FROM extracto_lineas el
         JOIN extractos_bancarios eb
           ON eb.id = el.extracto_id
          AND eb.empresa_id = el.empresa_id
         WHERE el.empresa_id = $1 AND el.id = $2
         LIMIT 1`,
        [empresaId, extractoLineaId]
      );

      if (lineaRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'PARTIDA_EXTRACTO_NO_ENCONTRADA',
          'La línea de extracto bancario indicada no existe en la empresa.'
        );
      }

      const linea = lineaRes.rows[0];
      if (linea.extractoEstado === 'ANULADO') {
        throw new ConciliacionV2Error(
          409,
          'EXTRACTO_ANULADO',
          'El extracto al que pertenece la línea está anulado.'
        );
      }

      const montoDec = Money.round(linea.monto);
      if (montoDec.isZero()) {
        return [];
      }

      const esAbono = montoDec.gt(0);
      const montoAbs = montoDec.abs();
      const tipoCartera: TipoDocumentoCarteraV2 = esAbono ? 'CXC' : 'CXP';

      const docsRes = esAbono
        ? await client.query<{
            documentoId: string;
            comprobanteId: string;
            anexoId: string;
            anexoRuc: string | null;
            anexoNombre: string | null;
            tipoComprobante: string;
            serie: string;
            numero: string;
            moneda: string;
            fechaEmision: string;
            fechaVencimiento: string;
            importeOriginal: string;
            saldoPendiente: string;
            estado: string;
          }>(
            `SELECT cxc.id AS "documentoId",
                    cxc.comprobante_id AS "comprobanteId",
                    cxc.cliente_id AS "anexoId",
                    ax.numero_documento AS "anexoRuc",
                    ax.razon_social AS "anexoNombre",
                    cv.tipo_comprobante AS "tipoComprobante",
                    cv.serie,
                    cv.numero,
                    cxc.moneda,
                    cxc.fecha_emision::text AS "fechaEmision",
                    cxc.fecha_vencimiento::text AS "fechaVencimiento",
                    cxc.importe_original::text AS "importeOriginal",
                    cxc.saldo::text AS "saldoPendiente",
                    cxc.estado
             FROM cuentas_por_cobrar cxc
             JOIN comprobantes_venta cv
               ON cv.id = cxc.comprobante_id
              AND cv.empresa_id = cxc.empresa_id
             LEFT JOIN anexos ax
               ON ax.id = cxc.cliente_id
              AND ax.empresa_id = cxc.empresa_id
             WHERE cxc.empresa_id = $1
               AND cxc.estado IN ('PENDIENTE', 'PARCIAL')
               AND cxc.saldo > 0
               AND cv.estado <> 'ANULADO'
             ORDER BY cxc.fecha_vencimiento ASC, cxc.id ASC`,
            [empresaId]
          )
        : await client.query<{
            documentoId: string;
            comprobanteId: string;
            anexoId: string;
            anexoRuc: string | null;
            anexoNombre: string | null;
            tipoComprobante: string;
            serie: string;
            numero: string;
            moneda: string;
            fechaEmision: string;
            fechaVencimiento: string;
            importeOriginal: string;
            saldoPendiente: string;
            estado: string;
          }>(
            `SELECT cxp.id AS "documentoId",
                    cxp.comprobante_id AS "comprobanteId",
                    cxp.proveedor_id AS "anexoId",
                    ax.numero_documento AS "anexoRuc",
                    ax.razon_social AS "anexoNombre",
                    cc.tipo_comprobante AS "tipoComprobante",
                    cc.serie,
                    cc.numero,
                    cxp.moneda,
                    cxp.fecha_emision::text AS "fechaEmision",
                    cxp.fecha_vencimiento::text AS "fechaVencimiento",
                    cxp.importe_original::text AS "importeOriginal",
                    cxp.saldo::text AS "saldoPendiente",
                    cxp.estado
             FROM cuentas_por_pagar cxp
             JOIN comprobantes_compra cc
               ON cc.id = cxp.comprobante_id
              AND cc.empresa_id = cxp.empresa_id
             LEFT JOIN anexos ax
               ON ax.id = cxp.proveedor_id
              AND ax.empresa_id = cxp.empresa_id
             WHERE cxp.empresa_id = $1
               AND cxp.estado IN ('PENDIENTE', 'PARCIAL')
               AND cxp.saldo > 0
               AND cc.estado <> 'ANULADO'
             ORDER BY cxp.fecha_vencimiento ASC, cxp.id ASC`,
            [empresaId]
          );

      const evaluados = docsRes.rows.map((doc) => {
        const evalScore = calcularScoreDocumentoCartera({
          montoLineaAbs: montoAbs,
          descripcionLinea: linea.descripcion,
          referenciaLinea: linea.referencia,
          rucExtraido: linea.rucExtraido,
          contraparteExtraida: linea.contraparteExtraida,
          docExtraido: linea.docExtraido,
          anexoRuc: doc.anexoRuc,
          anexoNombre: doc.anexoNombre,
          serie: doc.serie,
          numero: doc.numero,
          saldoPendiente: doc.saldoPendiente,
        });

        const sugerencia: SugerenciaDocumentoCarteraV2 = {
          documentoId: doc.documentoId,
          tipoCartera,
          comprobanteId: doc.comprobanteId,
          anexoId: doc.anexoId,
          anexoRuc: doc.anexoRuc ?? null,
          anexoNombre: doc.anexoNombre ?? null,
          tipoComprobante: doc.tipoComprobante,
          serie: doc.serie,
          numero: doc.numero,
          moneda: doc.moneda,
          fechaEmision: doc.fechaEmision,
          fechaVencimiento: doc.fechaVencimiento,
          importeOriginal: Money.format(doc.importeOriginal),
          saldoPendiente: Money.format(doc.saldoPendiente),
          estado: doc.estado,
          score: evalScore.score,
          motivos: evalScore.motivos,
        };

        return {
          sugerencia,
          difSaldo: Money.create(evalScore.diferenciaAbsSaldo),
        };
      });

      evaluados.sort((a, b) => {
        if (b.sugerencia.score !== a.sugerencia.score) {
          return b.sugerencia.score - a.sugerencia.score;
        }
        const cmpDif = a.difSaldo.comparedTo(b.difSaldo);
        if (cmpDif !== 0) return cmpDif;
        const cmpVenc = a.sugerencia.fechaVencimiento.localeCompare(
          b.sugerencia.fechaVencimiento
        );
        if (cmpVenc !== 0) return cmpVenc;
        return a.sugerencia.documentoId.localeCompare(b.sugerencia.documentoId);
      });

      return evaluados.map((e) => e.sugerencia);
    });
  },

  async aplicarLineaACartera(
    empresaId: string,
    userId: string,
    input: AplicarLineaCarteraInput
  ): Promise<ResultadoAplicarCarteraV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');

    const parsed = aplicarLineaCarteraSchema.parse(input);
    resolverRangoPeriodo(parsed.periodo);

    const aplicacionesIn = parsed.aplicaciones ?? [];
    const docIdsUnicos = Array.from(new Set(aplicacionesIn.map((a) => a.documentoId))).sort();
    if (docIdsUnicos.length !== aplicacionesIn.length) {
      throw new ConciliacionV2Error(
        400,
        'DOCUMENTOS_DUPLICADOS',
        'aplicaciones contiene documentoId duplicados.'
      );
    }

    const tipoOpEspecial: TipoOperacionCarteraEspecialV2 =
      parsed.tipoOperacionEspecial ?? 'ESTANDAR';

    return db.withEmpresaTransaction(empresaId, async (client) => {
      // 1. Bloquear cuenta financiera y validar vinculación PCGE + periodo
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

      await verificarPeriodoNoCerradoEnTx(
        client,
        empresaId,
        parsed.cuentaFinancieraId,
        parsed.periodo
      );
      const periodoId = await resolverPeriodoIdEnTx(client, empresaId, parsed.periodo);
      const config = await obtenerConfigEnTx(client, empresaId);

      // 2. Bloquear línea de extracto FOR UPDATE OF el
      const lineaRes = await client.query<{
        id: string;
        fecha: string;
        descripcion: string;
        referencia: string | null;
        monto: string;
        conciliada: boolean;
        estadoConciliacion: string;
        cuentaFinancieraId: string;
        extractoEstado: string;
        yaConciliadaGrupo: boolean;
      }>(
        `SELECT el.id,
                el.fecha::text AS fecha,
                el.descripcion,
                el.referencia,
                el.monto::text AS monto,
                el.conciliada,
                el.estado_conciliacion AS "estadoConciliacion",
                eb.cuenta_financiera_id AS "cuentaFinancieraId",
                eb.estado AS "extractoEstado",
                EXISTS (
                  SELECT 1
                  FROM conciliacion_item ci
                  JOIN conciliacion_grupo cg
                    ON cg.id = ci.grupo_id
                   AND cg.empresa_id = ci.empresa_id
                  WHERE ci.empresa_id = el.empresa_id
                    AND ci.lado = 'BANCO'
                    AND ci.extracto_linea_id = el.id
                    AND cg.estado IN ('CONCILIADO', 'CONCILIADO_MANUAL')
                ) AS "yaConciliadaGrupo"
         FROM extracto_lineas el
         JOIN extractos_bancarios eb
           ON eb.id = el.extracto_id
          AND eb.empresa_id = el.empresa_id
         WHERE el.empresa_id = $1 AND el.id = $2
         FOR UPDATE OF el`,
        [empresaId, parsed.extractoLineaId]
      );

      if (lineaRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'PARTIDA_EXTRACTO_NO_ENCONTRADA',
          'La línea de extracto bancario indicada no existe en la empresa.'
        );
      }

      const linea = lineaRes.rows[0];
      if (linea.cuentaFinancieraId !== parsed.cuentaFinancieraId) {
        throw new ConciliacionV2Error(
          409,
          'CUENTA_FINANCIERA_INCOMPATIBLE',
          'La línea de extracto pertenece a otra cuenta financiera.'
        );
      }
      if (linea.extractoEstado === 'ANULADO') {
        throw new ConciliacionV2Error(
          409,
          'EXTRACTO_ANULADO',
          'No se puede aplicar una línea de un extracto anulado.'
        );
      }
      if (linea.conciliada || linea.yaConciliadaGrupo) {
        throw new ConciliacionV2Error(
          409,
          'PARTIDA_YA_CONCILIADA',
          'La línea del extracto bancario ya se encuentra conciliada.'
        );
      }
      if (linea.estadoConciliacion === 'DUPLICADO') {
        throw new ConciliacionV2Error(
          409,
          'PARTIDA_DUPLICADA',
          'La línea del extracto está marcada como DUPLICADO.'
        );
      }

      const periodoLinea = linea.fecha.slice(0, 7);
      const periodoMovId =
        periodoLinea === parsed.periodo
          ? periodoId
          : await (async () => {
              await verificarPeriodoNoCerradoEnTx(
                client,
                empresaId,
                parsed.cuentaFinancieraId,
                periodoLinea
              );
              return resolverPeriodoIdEnTx(client, empresaId, periodoLinea);
            })();

      const montoLineaDec = Money.round(linea.monto);
      if (montoLineaDec.isZero()) {
        throw new ConciliacionV2Error(
          409,
          'IMPORTE_CERO',
          'La línea del extracto tiene monto 0.00.'
        );
      }

      const esAbono = montoLineaDec.gt(0);
      validarCombinacionChequeCartera(esAbono, parsed.esCheque);
      if (esAbono && parsed.tipoCartera === 'CXP') {
        throw new ConciliacionV2Error(
          409,
          'SENTIDO_CARTERA_INCOMPATIBLE',
          'Un abono bancario (> 0) no puede aplicarse a Cuentas por Pagar (CXP).'
        );
      }
      if (!esAbono && parsed.tipoCartera === 'CXC') {
        throw new ConciliacionV2Error(
          409,
          'SENTIDO_CARTERA_INCOMPATIBLE',
          'Un cargo bancario (< 0) no puede aplicarse a Cuentas por Cobrar (CXC).'
        );
      }
      if (tipoOpEspecial === 'COMISION_POS' && !esAbono) {
        throw new ConciliacionV2Error(
          409,
          'SENTIDO_CARTERA_INCOMPATIBLE',
          'COMISION_POS solo aplica a abonos bancarios (> 0).'
        );
      }
      if (
        parsed.tipoCartera !== 'OTRO_PERUANO' &&
        !parsed.esAnticipo &&
        aplicacionesIn.length === 0
      ) {
        throw new ConciliacionV2Error(
          400,
          'APLICACIONES_REQUERIDAS',
          'Debe indicar al menos un documento en aplicaciones, o marcar esAnticipo = true.'
        );
      }

      // 3. Bloquear y validar saldos de documentos CxC / CxP FOR UPDATE
      const saldosAnteriores = new Map<string, string>();
      let primerAnexoDoc: string | null = null;
      let totalAplicadoDec = Money.create(0);

      if (docIdsUnicos.length > 0 && parsed.tipoCartera !== 'OTRO_PERUANO') {
        const esCxc = parsed.tipoCartera === 'CXC';
        const docsRes = esCxc
          ? await client.query<{
              id: string;
              anexoId: string;
              saldo: string;
              estado: string;
            }>(
              `SELECT id, cliente_id AS "anexoId", saldo::text AS saldo, estado
               FROM cuentas_por_cobrar
               WHERE empresa_id = $1 AND id = ANY($2::uuid[])
               ORDER BY id ASC
               FOR UPDATE`,
              [empresaId, docIdsUnicos]
            )
          : await client.query<{
              id: string;
              anexoId: string;
              saldo: string;
              estado: string;
            }>(
              `SELECT id, proveedor_id AS "anexoId", saldo::text AS saldo, estado
               FROM cuentas_por_pagar
               WHERE empresa_id = $1 AND id = ANY($2::uuid[])
               ORDER BY id ASC
               FOR UPDATE`,
              [empresaId, docIdsUnicos]
            );

        if (docsRes.rows.length !== docIdsUnicos.length) {
          throw new ConciliacionV2Error(
            404,
            'DOCUMENTO_CARTERA_NO_ENCONTRADO',
            'Uno o más documentos de cartera no existen en la empresa.'
          );
        }

        const mapaDocs = new Map(docsRes.rows.map((r) => [r.id, r]));
        for (const app of aplicacionesIn) {
          const doc = mapaDocs.get(app.documentoId)!;
          if (!primerAnexoDoc) primerAnexoDoc = doc.anexoId;

          const saldoActualDec = Money.round(doc.saldo);
          if (doc.estado === 'CANCELADO' || saldoActualDec.lte(0)) {
            throw new ConciliacionV2Error(
              409,
              'DOCUMENTO_YA_CANCELADO',
              `El documento ${doc.id} ya se encuentra totalmente cancelado.`
            );
          }

          const montoAppDec = Money.round(app.importeAplicado);
          if (montoAppDec.lte(0)) {
            throw new ConciliacionV2Error(
              400,
              'IMPORTE_APLICACION_INVALIDO',
              'El importe aplicado debe ser mayor a 0.00.'
            );
          }
          if (montoAppDec.gt(saldoActualDec)) {
            throw new ConciliacionV2Error(
              409,
              'SALDO_INSUFICIENTE_APLICACION',
              `El monto aplicado (${Money.format(montoAppDec)}) excede el saldo pendiente (${Money.format(saldoActualDec)}) del documento ${doc.id}.`
            );
          }

          saldosAnteriores.set(doc.id, Money.format(saldoActualDec));
          totalAplicadoDec = Money.add(totalAplicadoDec, montoAppDec);
        }
      }

      const anexoIdResuelto = parsed.anexoId ?? primerAnexoDoc ?? undefined;
      if (anexoIdResuelto) {
        const axRes = await client.query<{ id: string }>(
          `SELECT id FROM anexos WHERE empresa_id = $1 AND id = $2 LIMIT 1`,
          [empresaId, anexoIdResuelto]
        );
        if (axRes.rows.length === 0) {
          throw new ConciliacionV2Error(
            404,
            'ANEXO_NO_ENCONTRADO',
            'El anexo indicado no existe en la empresa.'
          );
        }
      }

      // 4. Calcular importes según caso especial peruano (100% Money)
      const calc = calcularImportesAplicacionCartera({
        montoLineaAbs: montoLineaDec.abs(),
        totalAplicado: totalAplicadoDec,
        tipoOperacionEspecial: tipoOpEspecial,
        tieneRetencion: parsed.tieneRetencion,
        montoRetencion: parsed.montoRetencion,
        porcentajeRetencion: parsed.porcentajeRetencion,
        comisionPosMonto: parsed.comisionPosMonto,
        generarAsientoComisionPos: parsed.generarAsientoComisionPos,
        esAnticipo: parsed.esAnticipo,
      });

      // Resolver tipo de movimiento y contrapartida PCGE
      let tipoMovTesoreria: 'INGRESO' | 'EGRESO' | 'DEPOSITO_DETRACCION' = esAbono
        ? 'INGRESO'
        : 'EGRESO';
      let cuentaContrapartidaCodigo = parsed.cuentaContrapartidaCodigo?.trim() || undefined;

      if (tipoOpEspecial === 'DETRACCION_SPOT') {
        if (!esAbono && aplicacionesIn.length === 0) {
          tipoMovTesoreria = 'DEPOSITO_DETRACCION';
        } else if (!cuentaContrapartidaCodigo) {
          if (!esAbono) {
            cuentaContrapartidaCodigo = (await existeCuentaActivaPlanEnTx(client, empresaId, '4213'))
              ? '4213'
              : '4212';
          } else {
            cuentaContrapartidaCodigo = (await existeCuentaActivaPlanEnTx(
              client,
              empresaId,
              '12122'
            ))
              ? '12122'
              : '1212';
          }
        }
      } else if (tipoOpEspecial === 'TRIBUTO_SUNAT' && !cuentaContrapartidaCodigo) {
        cuentaContrapartidaCodigo = '40111';
      } else if (tipoOpEspecial === 'AFP_ONP_ESSALUD' && !cuentaContrapartidaCodigo) {
        cuentaContrapartidaCodigo = '4031';
      } else if (tipoOpEspecial === 'LOTE_PLANILLA' && !cuentaContrapartidaCodigo) {
        cuentaContrapartidaCodigo = '4111';
      } else if (parsed.esAnticipo && !cuentaContrapartidaCodigo && !esAbono) {
        cuentaContrapartidaCodigo = (await existeCuentaActivaPlanEnTx(client, empresaId, '422'))
          ? '422'
          : '4212';
      }

      // Validar que cuenta 104x vinculada, contrapartida y cuentas secundarias existan activas y permitan movimiento
      await validarCuentaPlanActivaEnTx(
        client,
        empresaId,
        cuenta.cuentaContableCodigo,
        'Cuenta bancaria 104x vinculada'
      );
      if (cuentaContrapartidaCodigo) {
        await validarCuentaPlanActivaEnTx(
          client,
          empresaId,
          cuentaContrapartidaCodigo,
          `Contrapartida ${tipoOpEspecial}`
        );
      }
      const cuentasSecundarias = obtenerCuentasSecundariasCartera({
        esAbono,
        tipoOpEspecial,
        tieneRetencion: parsed.tieneRetencion,
        esCheque: parsed.esCheque,
        esDepositoCheque: parsed.esDepositoCheque,
        esAnticipo: parsed.esAnticipo,
        tipoDiferencia: parsed.tipoDiferencia,
      });
      for (const ctaSec of cuentasSecundarias) {
        await validarCuentaPlanActivaEnTx(client, empresaId, ctaSec.codigo, ctaSec.etiqueta);
      }

      const moneda: 'PEN' | 'USD' = cuenta.moneda === 'USD' ? 'USD' : 'PEN';
      const tipoCambio = await resolverTipoCambioEnTx(
        client,
        moneda,
        linea.fecha,
        parsed.tipoCambio
      );
      const medioPago = parsed.medioPago ?? (parsed.esCheque ? '007' : '003');
      const glosa =
        parsed.glosa?.trim() ||
        `Conciliación ${parsed.tipoCartera} (${tipoOpEspecial}) - ${linea.descripcion}`.slice(
          0,
          250
        );

      // 5. INVOCAR SIEMPRE tesoreriaService.registrarMovimiento(..., userId, client)
      const mov = await tesoreriaService.registrarMovimiento(
        empresaId,
        {
          periodoId: periodoMovId,
          cuentaFinancieraId: cuenta.id,
          fecha: linea.fecha,
          tipo: tipoMovTesoreria,
          medioPago,
          numeroOperacion: parsed.numeroCheque ?? linea.referencia ?? undefined,
          anexoId: anexoIdResuelto,
          moneda,
          tipoCambio,
          importe: Money.toNumber(calc.importeMovimientoTesoreria),
          glosa,
          detraccionId: parsed.detraccionId ?? undefined,
          cuentaContrapartidaCodigo,
          tieneRetencion:
            tipoOpEspecial === 'RETENCION_IGV' || parsed.tieneRetencion === true
              ? true
              : undefined,
          montoRetencion: Money.create(calc.montoRetencion).gt(0)
            ? Money.toNumber(calc.montoRetencion)
            : undefined,
          porcentajeRetencion: calc.porcentajeRetencion ?? undefined,
          esCheque: parsed.esCheque,
          esDepositoCheque: parsed.esDepositoCheque,
          esAnticipo: parsed.esAnticipo,
          diferenciaCambio:
            parsed.diferenciaCambio !== null && parsed.diferenciaCambio !== undefined
              ? Money.toNumber(parsed.diferenciaCambio)
              : undefined,
          tipoDiferencia: parsed.tipoDiferencia,
          montoOriginalDoc:
            parsed.montoOriginalDoc !== null && parsed.montoOriginalDoc !== undefined
              ? Money.toNumber(parsed.montoOriginalDoc)
              : undefined,
          prohibirAutoCreacionCuentas: true,
          aplicaciones:
            aplicacionesIn.length > 0 && parsed.tipoCartera !== 'OTRO_PERUANO'
              ? aplicacionesIn.map((a) => ({
                  documentoId: a.documentoId,
                  importeAplicado: Money.toNumber(a.importeAplicado),
                }))
              : undefined,
        } as any,
        userId,
        client
      );

      // 6. Si es COMISION_POS con comisión > 0 y generarAsientoComisionPos != false,
      //    generar asiento de comisión POS vía asientoService.crearAsiento(..., client)
      //    y su movimiento COMISION en la misma TX para preservar Mayor 104x == Tesorería.
      let asientoComisionPosId: string | null = null;
      let movComisionId: string | null = null;
      const comisionPosDec = Money.create(calc.comisionPosMonto);

      if (
        tipoOpEspecial === 'COMISION_POS' &&
        comisionPosDec.gt(0) &&
        parsed.generarAsientoComisionPos !== false
      ) {
        const cuentaComisionCodigo =
          parsed.cuentaComisionPosCodigo?.trim() || config.cuentaComisionCodigo;
        const cuentaComisionPlan = await validarCuentaPlanActivaEnTx(
          client,
          empresaId,
          cuentaComisionCodigo,
          'Comisión POS'
        );
        const cuentaBancoPlan = await validarCuentaPlanActivaEnTx(
          client,
          empresaId,
          cuenta.cuentaContableCodigo,
          'Cuenta bancaria 104x'
        );

        const glosaComision = `Comisión POS - ${linea.descripcion}`.slice(0, 250);
        const esUsd = moneda === 'USD';
        const comisionNum = Money.toNumber(comisionPosDec);

        const asientoComision = await asientoService.crearAsiento(
          empresaId,
          {
            periodoId: periodoMovId,
            subdiario: '05',
            fecha: linea.fecha,
            moneda,
            tipoCambio,
            glosa: glosaComision,
            origenModulo: 'TESORERIA',
            prohibirAutoCreacionCuentas: true,
            lineas: [
              {
                linea: 1,
                cuentaId: cuentaComisionPlan.id,
                codigoCuenta: cuentaComisionPlan.codigo,
                debe: comisionNum,
                haber: 0,
                debeMe: esUsd ? comisionNum : 0,
                haberMe: 0,
                glosaLinea: glosaComision,
              },
              {
                linea: 2,
                cuentaId: cuentaBancoPlan.id,
                codigoCuenta: cuentaBancoPlan.codigo,
                debe: 0,
                haber: comisionNum,
                debeMe: 0,
                haberMe: esUsd ? comisionNum : 0,
                glosaLinea: glosaComision,
              },
            ],
          },
          userId,
          client
        );

        asientoComisionPosId = asientoComision.id;
        movComisionId = randomUUID();

        await client.query(
          `INSERT INTO movimientos_tesoreria (
             id, empresa_id, periodo_id, cuenta_financiera_id, fecha, tipo,
             medio_pago, numero_operacion, anexo_id, moneda, tipo_cambio,
             importe, importe_me, saldo_sin_aplicar, glosa, estado, conciliado,
             estado_conciliacion_libro, asiento_id, version, created_by
           ) VALUES (
             $1, $2, $3, $4, $5, 'COMISION',
             '003', $6, NULL, $7, $8,
             $9, $10, 0.00, $11, 'REGISTRADO', true,
             'CONCILIADO', $12, 1, $13
           )`,
          [
            movComisionId,
            empresaId,
            periodoMovId,
            cuenta.id,
            linea.fecha,
            linea.referencia ?? null,
            moneda,
            tipoCambio,
            comisionNum,
            esUsd ? comisionNum : 0,
            glosaComision,
            asientoComisionPosId,
            userId,
          ]
        );

        const ctaSaldoRes = await client.query<{ saldoActual: string }>(
          `SELECT saldo_actual::text AS "saldoActual"
           FROM cuentas_financieras
           WHERE empresa_id = $1 AND id = $2
           FOR UPDATE`,
          [empresaId, cuenta.id]
        );
        const nuevoSaldoTrasCom = Money.sub(ctaSaldoRes.rows[0].saldoActual, comisionPosDec);
        await client.query(
          `UPDATE cuentas_financieras
           SET saldo_actual = $1, updated_at = CURRENT_TIMESTAMP
           WHERE empresa_id = $2 AND id = $3`,
          [Money.toNumber(nuevoSaldoTrasCom), empresaId, cuenta.id]
        );

        await registrarAuditoriaEnTx(client, {
          empresaId,
          usuarioId: userId,
          tablaAfectada: 'movimientos_tesoreria',
          registroId: movComisionId,
          accion: 'INSERT',
          datosNuevos: {
            cuentaFinancieraId: cuenta.id,
            tipo: 'COMISION',
            medioPago: '003',
            importe: Money.format(comisionPosDec),
            glosa: glosaComision,
            asientoId: asientoComisionPosId,
            extractoLineaId: linea.id,
            estadoConciliacionLibro: 'CONCILIADO',
          },
        });
      }

      // 7. Consultar saldos actualizados de los documentos CxC/CxP
      const documentosActualizados: ResultadoAplicarCarteraV2['documentosActualizados'] = [];
      if (docIdsUnicos.length > 0 && parsed.tipoCartera !== 'OTRO_PERUANO') {
        const esCxc = parsed.tipoCartera === 'CXC';
        const updDocsRes = esCxc
          ? await client.query<{ id: string; saldo: string; estado: string }>(
              `SELECT id, saldo::text AS saldo, estado
               FROM cuentas_por_cobrar
               WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
              [empresaId, docIdsUnicos]
            )
          : await client.query<{ id: string; saldo: string; estado: string }>(
              `SELECT id, saldo::text AS saldo, estado
               FROM cuentas_por_pagar
               WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
              [empresaId, docIdsUnicos]
            );

        const mapUpd = new Map(updDocsRes.rows.map((r) => [r.id, r]));
        for (const app of aplicacionesIn) {
          const row = mapUpd.get(app.documentoId);
          if (row) {
            documentosActualizados.push({
              documentoId: app.documentoId,
              saldoAnterior: saldosAnteriores.get(app.documentoId) ?? '0.00',
              saldoNuevo: Money.format(row.saldo),
              estadoNuevo: row.estado,
            });
          }
        }
      }

      // 8. Crear grupo de conciliación + items BANCO y LIBRO, marcar línea y movimiento
      const reglaAplicada = `CARTERA_${tipoOpEspecial}`;
      const tipoMatch: TipoMatchV2 = movComisionId ? '1:N' : '1:1';
      const observacion =
        tipoOpEspecial === 'RETENCION_IGV' && Money.create(calc.montoRetencion).gt(0)
          ? `${glosa} [Retención IGV: ${calc.montoRetencion}]`
          : glosa;

      const insGrupoRes = await client.query<{
        id: string;
        createdAt: string;
        updatedAt: string;
      }>(
        `INSERT INTO conciliacion_grupo (
           empresa_id, cuenta_financiera_id, periodo_id, tipo_match, regla_aplicada,
           capa_matching, score, estado, diferencia_monto, observacion,
           usuario_id, confirmado_por, confirmado_en
         )
         VALUES ($1, $2, $3, $4, $5, 0, 1.0000, 'CONCILIADO_MANUAL', 0.00, $6, $7, $7, CURRENT_TIMESTAMP)
         RETURNING id, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [empresaId, cuenta.id, periodoId, tipoMatch, reglaAplicada, observacion, userId]
      );
      const grupoId = insGrupoRes.rows[0].id;

      const montoBancoFmt = Money.format(linea.monto);
      const montoLibroConSignoFmt = formatearMontoLibroMovimiento(esAbono, mov.importe);

      const itemBancoRes = await client.query<{ id: string }>(
        `INSERT INTO conciliacion_item (
           empresa_id, grupo_id, lado, origen_libro, extracto_linea_id,
           movimiento_tesoreria_id, asiento_id, asiento_detalle_id, monto_imputado
         )
         VALUES ($1, $2, 'BANCO', NULL, $3, NULL, NULL, NULL, $4)
         RETURNING id`,
        [empresaId, grupoId, linea.id, montoBancoFmt]
      );

      const itemLibroRes = await client.query<{ id: string }>(
        `INSERT INTO conciliacion_item (
           empresa_id, grupo_id, lado, origen_libro, extracto_linea_id,
           movimiento_tesoreria_id, asiento_id, asiento_detalle_id, monto_imputado
         )
         VALUES ($1, $2, 'LIBRO', 'MOVIMIENTO_TESORERIA', NULL, $3, $4, NULL, $5)
         RETURNING id`,
        [empresaId, grupoId, mov.id, mov.asientoId ?? null, montoLibroConSignoFmt]
      );

      const itemsLibro: ItemConciliacionV2[] = [
        {
          id: itemLibroRes.rows[0].id,
          grupoId,
          lado: 'LIBRO',
          origenLibro: 'MOVIMIENTO_TESORERIA' as OrigenPartidaLibroV2,
          extractoLineaId: null,
          movimientoTesoreriaId: mov.id,
          asientoId: mov.asientoId ?? null,
          asientoDetalleId: null,
          montoImputado: montoLibroConSignoFmt,
          fecha: linea.fecha,
          descripcion: glosa,
          referencia: linea.referencia,
        },
      ];

      if (movComisionId && asientoComisionPosId) {
        const montoComisionNegFmt = Money.format(comisionPosDec.negated());
        const itemComRes = await client.query<{ id: string }>(
          `INSERT INTO conciliacion_item (
             empresa_id, grupo_id, lado, origen_libro, extracto_linea_id,
             movimiento_tesoreria_id, asiento_id, asiento_detalle_id, monto_imputado
           )
           VALUES ($1, $2, 'LIBRO', 'MOVIMIENTO_TESORERIA', NULL, $3, $4, NULL, $5)
           RETURNING id`,
          [empresaId, grupoId, movComisionId, asientoComisionPosId, montoComisionNegFmt]
        );
        itemsLibro.push({
          id: itemComRes.rows[0].id,
          grupoId,
          lado: 'LIBRO',
          origenLibro: 'MOVIMIENTO_TESORERIA' as OrigenPartidaLibroV2,
          extractoLineaId: null,
          movimientoTesoreriaId: movComisionId,
          asientoId: asientoComisionPosId,
          asientoDetalleId: null,
          montoImputado: montoComisionNegFmt,
          fecha: linea.fecha,
          descripcion: `Comisión POS - ${linea.descripcion}`,
          referencia: linea.referencia,
        });
      }

      const updLinea = await client.query(
        `UPDATE extracto_lineas
         SET conciliada = true,
             estado_conciliacion = 'CONCILIADO_MANUAL',
             movimiento_tesoreria_id = $1,
             diferencia_importe = 0.00,
             observacion_conciliacion = $2,
             conciliado_en = CURRENT_TIMESTAMP
         WHERE empresa_id = $3 AND id = $4 AND conciliada = false`,
        [mov.id, observacion, empresaId, linea.id]
      );
      if (updLinea.rowCount !== 1) {
        throw new ConciliacionV2Error(
          409,
          'CONCURRENCIA_CONCILIACION',
          'La línea de extracto fue conciliada en paralelo por otra operación.'
        );
      }

      await client.query(
        `UPDATE movimientos_tesoreria
         SET conciliado = true,
             estado_conciliacion_libro = 'CONCILIADO',
             updated_at = CURRENT_TIMESTAMP
         WHERE empresa_id = $1 AND id = $2`,
        [empresaId, mov.id]
      );

      await rechazarSugerenciasSuperpuestasLineaEnTx(
        client,
        empresaId,
        userId,
        grupoId,
        linea.id
      );

      // 9. Evaluar bancarización Ley 28194
      const evalBanc = evaluarBancarizacionLey28194({
        moneda,
        monto: calc.importeMovimientoTesoreria,
        medioPago,
        esNoNegociable: parsed.esCheque ? true : undefined,
      });
      const alertaBancarizacion = evalBanc.aplicaControl ? evalBanc.motivo : null;

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'conciliacion_grupo',
        registroId: grupoId,
        accion: 'INSERT',
        datosNuevos: {
          grupoId,
          reglaAplicada,
          tipoCartera: parsed.tipoCartera,
          tipoOperacionEspecial: tipoOpEspecial,
          extractoLineaId: linea.id,
          movimientoTesoreriaId: mov.id,
          asientoId: mov.asientoId ?? null,
          asientoComisionPosId,
          documentosActualizados,
          saldoSinAplicar: Money.format(mov.saldoSinAplicar ?? 0),
          alertaBancarizacion,
        },
      });

      const itemsBanco: ItemConciliacionV2[] = [
        {
          id: itemBancoRes.rows[0].id,
          grupoId,
          lado: 'BANCO',
          origenLibro: null,
          extractoLineaId: linea.id,
          movimientoTesoreriaId: null,
          asientoId: null,
          asientoDetalleId: null,
          montoImputado: montoBancoFmt,
          fecha: linea.fecha,
          descripcion: linea.descripcion,
          referencia: linea.referencia,
        },
      ];

      const grupo: GrupoConciliacionV2 = {
        id: grupoId,
        empresaId,
        cuentaFinancieraId: cuenta.id,
        periodoId,
        tipoMatch,
        reglaAplicada,
        capaMatching: 0,
        score: 1,
        estado: 'CONCILIADO_MANUAL',
        diferenciaMonto: '0.00',
        observacion,
        usuarioId: userId,
        confirmadoPor: userId,
        confirmadoEn: new Date(insGrupoRes.rows[0].createdAt).toISOString(),
        createdAt: new Date(insGrupoRes.rows[0].createdAt).toISOString(),
        updatedAt: new Date(insGrupoRes.rows[0].updatedAt).toISOString(),
        itemsBanco,
        itemsLibro,
      };

      return {
        grupo,
        movimientoTesoreriaId: mov.id,
        asientoId: mov.asientoId ?? '',
        documentosActualizados,
        saldoSinAplicar: Money.format(mov.saldoSinAplicar ?? 0),
        asientoComisionPosId,
        alertaBancarizacion,
      };
    });
  },
};
