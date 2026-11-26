import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { db } from '../../../config/database';
import {
  ActualizarPlantillaAsientoInput,
  ConfigConciliacionV2,
  CrearPlantillaAsientoInput,
  GenerarAsientoLineaInput,
  GrupoConciliacionV2,
  ItemConciliacionV2,
  LineaAsientoPreviewV2,
  OrigenPartidaLibroV2,
  PlantillaAsientoV2,
  PreviewAsientoConciliacionV2,
  PrevisualizarAsientoLineaInput,
  ResultadoGenerarAsientoLineaV2,
  TIPOS_OPERACION_PLANTILLA_V2,
  TipoMatchV2,
  TipoOperacionPlantillaV2,
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERIODO_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const crearPlantillaSchema = z.object({
  codigo: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, 'El código solo puede contener letras, números, "_" y "-".'),
  nombre: z.string().trim().min(2).max(120),
  tipoOperacion: z.enum(TIPOS_OPERACION_PLANTILLA_V2),
  cuentaContrapartidaCodigo: z.string().trim().min(2).max(20).nullable().optional(),
  subdiarioCodigo: z.string().trim().min(2).max(10).optional(),
  glosaPlantilla: z.string().trim().min(3).max(250),
  activo: z.boolean().optional(),
});

const actualizarPlantillaSchema = z.object({
  nombre: z.string().trim().min(2).max(120).optional(),
  tipoOperacion: z.enum(TIPOS_OPERACION_PLANTILLA_V2).optional(),
  cuentaContrapartidaCodigo: z.string().trim().min(2).max(20).nullable().optional(),
  subdiarioCodigo: z.string().trim().min(2).max(10).optional(),
  glosaPlantilla: z.string().trim().min(3).max(250).optional(),
  activo: z.boolean().optional(),
});

const previsualizarSchema = z.object({
  cuentaFinancieraId: z.string().uuid('cuentaFinancieraId debe ser un UUID válido.'),
  periodo: z.string().regex(PERIODO_REGEX, 'periodo debe tener formato YYYY-MM.'),
  extractoLineaId: z.string().uuid('extractoLineaId debe ser un UUID válido.'),
  plantillaId: z.string().trim().min(1).max(64).nullable().optional(),
  tipoOperacion: z.enum(TIPOS_OPERACION_PLANTILLA_V2).optional(),
  cuentaContrapartidaCodigo: z.string().trim().min(2).max(20).nullable().optional(),
  subdiarioCodigo: z.string().trim().min(2).max(10).nullable().optional(),
  centroCostoId: z.string().uuid('centroCostoId debe ser un UUID válido.').nullable().optional(),
  anexoId: z.string().uuid('anexoId debe ser un UUID válido.').nullable().optional(),
  glosa: z.string().trim().max(250).nullable().optional(),
  tipoCambio: z.number().positive('tipoCambio debe ser mayor a cero.').optional(),
});

interface DefinicionPlantillaSistema {
  codigo: string;
  nombre: string;
  tipoOperacion: TipoOperacionPlantillaV2;
  cuentaFija: string | null;
  subdiarioCodigo: string;
  glosaPlantilla: string;
}

export const PLANTILLAS_ASIENTO_SISTEMA: readonly DefinicionPlantillaSistema[] = [
  {
    codigo: 'SYS_ITF',
    nombre: 'ITF — Impuesto a las Transacciones Financieras',
    tipoOperacion: 'ITF',
    cuentaFija: null,
    subdiarioCodigo: '05',
    glosaPlantilla: 'ITF bancario - {descripcion}',
  },
  {
    codigo: 'SYS_COMISION',
    nombre: 'Comisión y Portes Bancarios',
    tipoOperacion: 'COMISION',
    cuentaFija: null,
    subdiarioCodigo: '05',
    glosaPlantilla: 'Comisión bancaria - {descripcion}',
  },
  {
    codigo: 'SYS_MANTENIMIENTO',
    nombre: 'Mantenimiento de Cuenta Bancaria',
    tipoOperacion: 'MANTENIMIENTO',
    cuentaFija: null,
    subdiarioCodigo: '05',
    glosaPlantilla: 'Mantenimiento de cuenta - {descripcion}',
  },
  {
    codigo: 'SYS_INTERES_GASTO',
    nombre: 'Intereses Financieros (Gasto)',
    tipoOperacion: 'INTERES_GASTO',
    cuentaFija: null,
    subdiarioCodigo: '05',
    glosaPlantilla: 'Intereses financieros cargo - {descripcion}',
  },
  {
    codigo: 'SYS_INTERES_INGRESO',
    nombre: 'Intereses Financieros Ganados (Ingreso)',
    tipoOperacion: 'INTERES_INGRESO',
    cuentaFija: null,
    subdiarioCodigo: '05',
    glosaPlantilla: 'Intereses financieros ganados - {descripcion}',
  },
  {
    codigo: 'SYS_DIFERENCIA_CAMBIO_GANANCIA',
    nombre: 'Ganancia por Diferencia de Cambio',
    tipoOperacion: 'DIFERENCIA_CAMBIO_GANANCIA',
    cuentaFija: '776',
    subdiarioCodigo: '05',
    glosaPlantilla: 'Ganancia diferencia de cambio - {descripcion}',
  },
  {
    codigo: 'SYS_DIFERENCIA_CAMBIO_PERDIDA',
    nombre: 'Pérdida por Diferencia de Cambio',
    tipoOperacion: 'DIFERENCIA_CAMBIO_PERDIDA',
    cuentaFija: '676',
    subdiarioCodigo: '05',
    glosaPlantilla: 'Pérdida diferencia de cambio - {descripcion}',
  },
];

// ============================================================================
// FUNCIONES PURAS DE RESOLUCIÓN Y HASH DETERMINÍSTICO
// ============================================================================

export function resolverCuentaContrapartidaConfig(
  tipoOperacion: TipoOperacionPlantillaV2,
  config: ConfigConciliacionV2
): string | null {
  switch (tipoOperacion) {
    case 'ITF':
      return config.cuentaItfCodigo;
    case 'COMISION':
    case 'MANTENIMIENTO':
      return config.cuentaComisionCodigo;
    case 'INTERES_GASTO':
      return config.cuentaInteresGastoCodigo;
    case 'INTERES_INGRESO':
      return config.cuentaInteresIngresoCodigo;
    case 'DIFERENCIA_CAMBIO_GANANCIA':
      return '776';
    case 'DIFERENCIA_CAMBIO_PERDIDA':
      return '676';
    case 'OTRO':
    default:
      return null;
  }
}

export function construirPlantillaSistema(
  def: DefinicionPlantillaSistema,
  empresaId: string,
  config: ConfigConciliacionV2
): PlantillaAsientoV2 {
  const cuentaContrapartidaCodigo =
    def.cuentaFija ?? resolverCuentaContrapartidaConfig(def.tipoOperacion, config);
  return {
    id: def.codigo,
    empresaId,
    codigo: def.codigo,
    nombre: def.nombre,
    tipoOperacion: def.tipoOperacion,
    cuentaContrapartidaCodigo,
    subdiarioCodigo: def.subdiarioCodigo,
    glosaPlantilla: def.glosaPlantilla,
    esSistema: true,
    activo: true,
    createdBy: null,
    updatedBy: null,
    createdAt: '',
    updatedAt: '',
  };
}

export function mapearClasificacionATipoOperacion(
  tipoClasificacion: string | null | undefined,
  monto: string | number
): TipoOperacionPlantillaV2 {
  const montoDec = Money.round(monto);
  switch (tipoClasificacion) {
    case 'ITF':
      return 'ITF';
    case 'COMISION_BANCARIA':
      return 'COMISION';
    case 'MANTENIMIENTO':
      return 'MANTENIMIENTO';
    case 'INTERES_GASTO':
      return 'INTERES_GASTO';
    case 'INTERES_INGRESO':
      return 'INTERES_INGRESO';
    default:
      return montoDec.gte(0) ? 'OTRO' : 'OTRO';
  }
}

export function validarSentidoOperacionAsiento(
  tipoOperacion: TipoOperacionPlantillaV2,
  montoExtracto: string | number
): void {
  const montoDec = Money.round(montoExtracto);
  if (montoDec.isZero()) {
    throw new ConciliacionV2Error(
      409,
      'IMPORTE_CERO',
      'La línea del extracto tiene monto 0.00 y no puede contabilizarse.'
    );
  }

  const soloAbonos = new Set<TipoOperacionPlantillaV2>([
    'INTERES_INGRESO',
    'DIFERENCIA_CAMBIO_GANANCIA',
  ]);
  const soloCargos = new Set<TipoOperacionPlantillaV2>([
    'ITF',
    'COMISION',
    'MANTENIMIENTO',
    'INTERES_GASTO',
    'DIFERENCIA_CAMBIO_PERDIDA',
  ]);

  if (soloAbonos.has(tipoOperacion) && montoDec.lt(0)) {
    throw new ConciliacionV2Error(
      409,
      'SENTIDO_MONTO_INCOMPATIBLE',
      `La operación ${tipoOperacion} corresponde a un abono bancario (monto > 0).`
    );
  }
  if (soloCargos.has(tipoOperacion) && montoDec.gt(0)) {
    throw new ConciliacionV2Error(
      409,
      'SENTIDO_MONTO_INCOMPATIBLE',
      `La operación ${tipoOperacion} corresponde a un cargo bancario (monto < 0).`
    );
  }
}

export function construirLineasPreviewAsiento(params: {
  montoExtracto: string | number;
  cuentaBanco: { id: string; codigo: string; nombre: string };
  cuentaContrapartida: { id: string; codigo: string; nombre: string };
  anexoId: string | null;
  centroCostoId: string | null;
  glosa: string;
}): {
  lineas: LineaAsientoPreviewV2[];
  totalDebe: string;
  totalHaber: string;
  cuadrado: boolean;
} {
  const montoDec = Money.round(params.montoExtracto);
  const absDec = montoDec.abs();
  const absFmt = Money.format(absDec);
  const esAbono = montoDec.gt(0);

  const lineaDebeCuenta = esAbono ? params.cuentaBanco : params.cuentaContrapartida;
  const lineaHaberCuenta = esAbono ? params.cuentaContrapartida : params.cuentaBanco;

  const lineas: LineaAsientoPreviewV2[] = [
    {
      linea: 1,
      cuentaId: lineaDebeCuenta.id,
      cuentaCodigo: lineaDebeCuenta.codigo,
      cuentaNombre: lineaDebeCuenta.nombre,
      anexoId: lineaDebeCuenta.id === params.cuentaContrapartida.id ? params.anexoId : null,
      centroCostoId:
        lineaDebeCuenta.id === params.cuentaContrapartida.id ? params.centroCostoId : null,
      debe: absFmt,
      haber: '0.00',
      glosaLinea: params.glosa,
    },
    {
      linea: 2,
      cuentaId: lineaHaberCuenta.id,
      cuentaCodigo: lineaHaberCuenta.codigo,
      cuentaNombre: lineaHaberCuenta.nombre,
      anexoId: lineaHaberCuenta.id === params.cuentaContrapartida.id ? params.anexoId : null,
      centroCostoId:
        lineaHaberCuenta.id === params.cuentaContrapartida.id ? params.centroCostoId : null,
      debe: '0.00',
      haber: absFmt,
      glosaLinea: params.glosa,
    },
  ];

  let sumDebe = Money.create(0);
  let sumHaber = Money.create(0);
  for (const l of lineas) {
    sumDebe = Money.add(sumDebe, l.debe);
    sumHaber = Money.add(sumHaber, l.haber);
  }

  return {
    lineas,
    totalDebe: Money.format(sumDebe),
    totalHaber: Money.format(sumHaber),
    cuadrado: Money.isEqual(sumDebe, sumHaber) && sumDebe.gt(0),
  };
}

export function calcularHashVistaPrevia(params: {
  extractoLineaId: string;
  tipoOperacion: TipoOperacionPlantillaV2;
  fecha: string;
  periodo: string;
  subdiarioCodigo: string;
  moneda: 'PEN' | 'USD';
  tipoCambio: string;
  glosa: string;
  lineas: LineaAsientoPreviewV2[];
}): string {
  const payload = {
    extractoLineaId: params.extractoLineaId,
    tipoOperacion: params.tipoOperacion,
    fecha: params.fecha,
    periodo: params.periodo,
    subdiarioCodigo: params.subdiarioCodigo,
    moneda: params.moneda,
    tipoCambio: Money.create(params.tipoCambio).toFixed(4),
    glosa: params.glosa,
    lineas: params.lineas.map((l) => ({
      linea: l.linea,
      cuentaId: l.cuentaId,
      cuentaCodigo: l.cuentaCodigo,
      anexoId: l.anexoId ?? null,
      centroCostoId: l.centroCostoId ?? null,
      debe: Money.format(l.debe),
      haber: Money.format(l.haber),
      glosaLinea: l.glosaLinea,
    })),
  };

  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function interpolarGlosaPlantilla(
  plantilla: string,
  datos: { descripcion: string; fecha: string; referencia: string | null; monto: string }
): string {
  return plantilla
    .replace(/\{descripcion\}/gi, datos.descripcion)
    .replace(/\{fecha\}/gi, datos.fecha)
    .replace(/\{referencia\}/gi, datos.referencia ?? '')
    .replace(/\{monto\}/gi, datos.monto)
    .trim()
    .slice(0, 250);
}

// ============================================================================
// HELPERS TRANSACCIONALES INTERNOS
// ============================================================================

function mapPlantillaRow(row: any): PlantillaAsientoV2 {
  return {
    id: row.id,
    empresaId: row.empresaId,
    codigo: row.codigo,
    nombre: row.nombre,
    tipoOperacion: row.tipoOperacion as TipoOperacionPlantillaV2,
    cuentaContrapartidaCodigo: row.cuentaContrapartidaCodigo ?? null,
    subdiarioCodigo: row.subdiarioCodigo,
    glosaPlantilla: row.glosaPlantilla,
    esSistema: Boolean(row.esSistema),
    activo: Boolean(row.activo),
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

const SELECT_PLANTILLA_COLS = `
  id,
  empresa_id AS "empresaId",
  codigo,
  nombre,
  tipo_operacion AS "tipoOperacion",
  cuenta_contrapartida_codigo AS "cuentaContrapartidaCodigo",
  subdiario_codigo AS "subdiarioCodigo",
  glosa_plantilla AS "glosaPlantilla",
  es_sistema AS "esSistema",
  activo,
  created_by AS "createdBy",
  updated_by AS "updatedBy",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

interface CuentaPlanActiva {
  id: string;
  codigo: string;
  nombre: string;
  requiereAnexo: boolean;
  requiereCentroCosto: boolean;
}

async function validarCuentaActivaPlanEnTx(
  client: PoolClient,
  empresaId: string,
  codigoOId: { id?: string | null; codigo?: string | null },
  etiqueta: string
): Promise<CuentaPlanActiva> {
  const res = codigoOId.id
    ? await client.query<{
        id: string;
        codigo: string;
        nombre: string;
        isActive: boolean;
        esInactiva: boolean;
        permiteMovimiento: boolean;
        requiereAnexo: boolean;
        requiereCentroCosto: boolean;
      }>(
        `SELECT id,
                codigo,
                nombre,
                is_active AS "isActive",
                COALESCE(es_inactiva, false) AS "esInactiva",
                permite_movimiento AS "permiteMovimiento",
                COALESCE(requiere_anexo, false) AS "requiereAnexo",
                COALESCE(requiere_centro_costo, false) AS "requiereCentroCosto"
         FROM plan_cuentas
         WHERE empresa_id = $1 AND id = $2
         LIMIT 1`,
        [empresaId, codigoOId.id]
      )
    : await client.query<{
        id: string;
        codigo: string;
        nombre: string;
        isActive: boolean;
        esInactiva: boolean;
        permiteMovimiento: boolean;
        requiereAnexo: boolean;
        requiereCentroCosto: boolean;
      }>(
        `SELECT id,
                codigo,
                nombre,
                is_active AS "isActive",
                COALESCE(es_inactiva, false) AS "esInactiva",
                permite_movimiento AS "permiteMovimiento",
                COALESCE(requiere_anexo, false) AS "requiereAnexo",
                COALESCE(requiere_centro_costo, false) AS "requiereCentroCosto"
         FROM plan_cuentas
         WHERE empresa_id = $1 AND codigo = $2
         LIMIT 1`,
        [empresaId, (codigoOId.codigo ?? '').trim()]
      );

  const row = res.rows[0];
  if (!row || !row.isActive || row.esInactiva || !row.permiteMovimiento) {
    throw new ConciliacionV2Error(
      409,
      'CUENTA_PCGE_INEXISTENTE_EN_EMPRESA',
      `La cuenta PCGE "${codigoOId.codigo || codigoOId.id || '(vacía)'}" (${etiqueta}) no existe, está inactiva o no permite movimiento en el plan de cuentas de la empresa.`
    );
  }

  return {
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre,
    requiereAnexo: Boolean(row.requiereAnexo),
    requiereCentroCosto: Boolean(row.requiereCentroCosto),
  };
}

async function validarSubdiarioEnTx(
  client: PoolClient,
  empresaId: string,
  subdiarioCodigo: string
): Promise<string> {
  const codigoNorm = subdiarioCodigo.trim().padStart(2, '0');
  const res = await client.query<{ codigo: string }>(
    `SELECT codigo
     FROM subdiarios
     WHERE empresa_id = $1 AND codigo = $2 AND is_active = true
     LIMIT 1`,
    [empresaId, codigoNorm]
  );
  if (res.rows.length === 0) {
    throw new ConciliacionV2Error(
      409,
      'SUBDIARIO_NO_ENCONTRADO',
      `El subdiario ${codigoNorm} no existe o está inactivo en la empresa.`
    );
  }
  return res.rows[0].codigo;
}

async function resolverPeriodoEnTx(
  client: PoolClient,
  empresaId: string,
  codigoPeriodo: string
): Promise<string> {
  const res = await client.query<{ id: string; estado: string }>(
    `SELECT id, estado
     FROM periodos
     WHERE empresa_id = $1 AND codigo_periodo = $2
     LIMIT 1`,
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
): Promise<string> {
  if (moneda === 'PEN') {
    return '1.0000';
  }
  if (tipoCambioInput && tipoCambioInput > 0) {
    return Money.create(tipoCambioInput).toFixed(4);
  }
  const tcRes = await client.query<{ venta: string }>(
    `SELECT venta::text AS venta
     FROM tipos_cambio
     WHERE fecha <= $1
     ORDER BY fecha DESC
     LIMIT 1`,
    [fecha]
  );
  if (tcRes.rows[0]?.venta) {
    return Money.create(tcRes.rows[0].venta).toFixed(4);
  }
  return '1.0000';
}

async function previsualizarAsientoLineaEnTx(
  client: PoolClient,
  empresaId: string,
  parsed: z.infer<typeof previsualizarSchema>,
  bloquearLinea: boolean
): Promise<{
  preview: PreviewAsientoConciliacionV2;
  linea: {
    id: string;
    fecha: string;
    descripcion: string;
    referencia: string | null;
    monto: string;
    tipoClasificacion: string | null;
  };
  cuentaBanco: {
    id: string;
    cuentaContableId: string;
    cuentaContableCodigo: string;
    moneda: 'PEN' | 'USD';
    saldoActual: string;
  };
  periodoId: string;
}> {
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
  const periodoId = await resolverPeriodoEnTx(client, empresaId, parsed.periodo);

  const lockClause = bloquearLinea ? 'FOR UPDATE OF el' : '';
  const lineaRes = await client.query<{
    id: string;
    fecha: string;
    descripcion: string;
    referencia: string | null;
    monto: string;
    conciliada: boolean;
    estadoConciliacion: string;
    tipoClasificacion: string | null;
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
            el.tipo_clasificacion AS "tipoClasificacion",
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
     ${lockClause}`,
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
      'No se puede contabilizar una línea perteneciente a un extracto anulado.'
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
      'No se puede contabilizar una línea marcada como DUPLICADO.'
    );
  }

  const periodoLinea = linea.fecha.slice(0, 7);
  if (periodoLinea !== parsed.periodo) {
    await verificarPeriodoNoCerradoEnTx(
      client,
      empresaId,
      parsed.cuentaFinancieraId,
      periodoLinea
    );
    await resolverPeriodoEnTx(client, empresaId, periodoLinea);
  }

  const config = await obtenerConfigEnTx(client, empresaId);

  let plantilla: PlantillaAsientoV2 | null = null;
  if (parsed.plantillaId) {
    if (UUID_REGEX.test(parsed.plantillaId)) {
      const pRes = await client.query(
        `SELECT ${SELECT_PLANTILLA_COLS}
         FROM conciliacion_plantillas_asiento
         WHERE empresa_id = $1 AND id = $2 AND activo = true
         LIMIT 1`,
        [empresaId, parsed.plantillaId]
      );
      if (pRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'PLANTILLA_ASIENTO_NO_ENCONTRADA',
          'La plantilla de asiento indicada no existe o está inactiva en la empresa.'
        );
      }
      plantilla = mapPlantillaRow(pRes.rows[0]);
    } else {
      const codUpper = parsed.plantillaId.toUpperCase();
      const pDbRes = await client.query(
        `SELECT ${SELECT_PLANTILLA_COLS}
         FROM conciliacion_plantillas_asiento
         WHERE empresa_id = $1 AND codigo = $2 AND activo = true
         LIMIT 1`,
        [empresaId, codUpper]
      );
      if (pDbRes.rows.length > 0) {
        plantilla = mapPlantillaRow(pDbRes.rows[0]);
      } else {
        const sysDef = PLANTILLAS_ASIENTO_SISTEMA.find((s) => s.codigo === codUpper);
        if (!sysDef) {
          throw new ConciliacionV2Error(
            404,
            'PLANTILLA_ASIENTO_NO_ENCONTRADA',
            'La plantilla de asiento indicada no existe.'
          );
        }
        plantilla = construirPlantillaSistema(sysDef, empresaId, config);
      }
    }
  }

  const tipoOperacion: TipoOperacionPlantillaV2 =
    parsed.tipoOperacion ??
    plantilla?.tipoOperacion ??
    mapearClasificacionATipoOperacion(linea.tipoClasificacion, linea.monto);

  validarSentidoOperacionAsiento(tipoOperacion, linea.monto);

  const contrapartidaExplicita = parsed.cuentaContrapartidaCodigo?.trim() || null;
  const contrapartidaPlantilla = plantilla?.cuentaContrapartidaCodigo?.trim() || null;
  const contrapartidaConfig = resolverCuentaContrapartidaConfig(tipoOperacion, config);
  const codigoContrapartida =
    contrapartidaExplicita ?? contrapartidaPlantilla ?? contrapartidaConfig;

  if (tipoOperacion === 'INTERES_INGRESO' && !codigoContrapartida) {
    throw new ConciliacionV2Error(
      409,
      'CUENTA_INTERES_INGRESO_NO_CONFIGURADA',
      `Debe configurar cuentaInteresIngresoCodigo en la configuración de conciliación (o indicar cuentaContrapartidaCodigo explícitamente) antes de contabilizar intereses ganados (sugerencia PCGE: ${config.sugerenciaCuentaInteresIngreso}).`
    );
  }

  if (!codigoContrapartida) {
    throw new ConciliacionV2Error(
      400,
      'CUENTA_CONTRAPARTIDA_REQUERIDA',
      'Debe indicar cuentaContrapartidaCodigo o seleccionar una plantilla con cuenta configurada.'
    );
  }

  const cuentaBancoPlan = await validarCuentaActivaPlanEnTx(
    client,
    empresaId,
    { id: cuenta.cuentaContableId, codigo: cuenta.cuentaContableCodigo },
    'Cuenta bancaria 104x vinculada'
  );
  const cuentaContraPlan = await validarCuentaActivaPlanEnTx(
    client,
    empresaId,
    { codigo: codigoContrapartida },
    `Contrapartida ${tipoOperacion}`
  );

  if (parsed.anexoId) {
    const axRes = await client.query<{ id: string }>(
      `SELECT id FROM anexos WHERE empresa_id = $1 AND id = $2 LIMIT 1`,
      [empresaId, parsed.anexoId]
    );
    if (axRes.rows.length === 0) {
      throw new ConciliacionV2Error(
        404,
        'ANEXO_NO_ENCONTRADO',
        'El anexo indicado no existe en la empresa.'
      );
    }
  }
  if (parsed.centroCostoId) {
    const ccRes = await client.query<{ id: string }>(
      `SELECT id FROM centros_costo WHERE empresa_id = $1 AND id = $2 AND is_active = true LIMIT 1`,
      [empresaId, parsed.centroCostoId]
    );
    if (ccRes.rows.length === 0) {
      throw new ConciliacionV2Error(
        404,
        'CENTRO_COSTO_NO_ENCONTRADO',
        'El centro de costo indicado no existe o está inactivo.'
      );
    }
  }

  if (cuentaContraPlan.requiereAnexo && !parsed.anexoId) {
    throw new ConciliacionV2Error(
      409,
      'ANEXO_REQUERIDO',
      `La cuenta ${cuentaContraPlan.codigo} exige indicar un anexo.`
    );
  }
  if (cuentaContraPlan.requiereCentroCosto && !parsed.centroCostoId) {
    throw new ConciliacionV2Error(
      409,
      'CENTRO_COSTO_REQUERIDO',
      `La cuenta ${cuentaContraPlan.codigo} exige indicar un centro de costo.`
    );
  }

  const subdiarioCodigo = await validarSubdiarioEnTx(
    client,
    empresaId,
    parsed.subdiarioCodigo || plantilla?.subdiarioCodigo || '05'
  );

  const moneda: 'PEN' | 'USD' = cuenta.moneda === 'USD' ? 'USD' : 'PEN';
  const tipoCambio = await resolverTipoCambioEnTx(client, moneda, linea.fecha, parsed.tipoCambio);

  const glosa =
    parsed.glosa?.trim() ||
    (plantilla
      ? interpolarGlosaPlantilla(plantilla.glosaPlantilla, {
          descripcion: linea.descripcion,
          fecha: linea.fecha,
          referencia: linea.referencia,
          monto: Money.format(Money.round(linea.monto).abs()),
        })
      : `${tipoOperacion} - ${linea.descripcion}`.slice(0, 250));

  const calculado = construirLineasPreviewAsiento({
    montoExtracto: linea.monto,
    cuentaBanco: {
      id: cuentaBancoPlan.id,
      codigo: cuentaBancoPlan.codigo,
      nombre: cuentaBancoPlan.nombre,
    },
    cuentaContrapartida: {
      id: cuentaContraPlan.id,
      codigo: cuentaContraPlan.codigo,
      nombre: cuentaContraPlan.nombre,
    },
    anexoId: parsed.anexoId ?? null,
    centroCostoId: parsed.centroCostoId ?? null,
    glosa,
  });

  const hashVistaPrevia = calcularHashVistaPrevia({
    extractoLineaId: linea.id,
    tipoOperacion,
    fecha: linea.fecha,
    periodo: parsed.periodo,
    subdiarioCodigo,
    moneda,
    tipoCambio,
    glosa,
    lineas: calculado.lineas,
  });

  return {
    preview: {
      hashVistaPrevia,
      extractoLineaId: linea.id,
      tipoOperacion,
      fecha: linea.fecha,
      periodo: parsed.periodo,
      subdiarioCodigo,
      moneda,
      tipoCambio,
      glosa,
      totalDebe: calculado.totalDebe,
      totalHaber: calculado.totalHaber,
      cuadrado: calculado.cuadrado,
      lineas: calculado.lineas,
    },
    linea: {
      id: linea.id,
      fecha: linea.fecha,
      descripcion: linea.descripcion,
      referencia: linea.referencia,
      monto: linea.monto,
      tipoClasificacion: linea.tipoClasificacion,
    },
    cuentaBanco: {
      id: cuenta.id,
      cuentaContableId: cuenta.cuentaContableId,
      cuentaContableCodigo: cuentaBancoPlan.codigo,
      moneda,
      saldoActual: cuenta.saldoActual,
    },
    periodoId,
  };
}

function mapTipoMovimientoDesdeOperacion(
  tipoOperacion: TipoOperacionPlantillaV2,
  montoExtracto: string | number
): 'ITF' | 'COMISION' | 'INGRESO' | 'EGRESO' {
  if (tipoOperacion === 'ITF') return 'ITF';
  if (tipoOperacion === 'COMISION' || tipoOperacion === 'MANTENIMIENTO') return 'COMISION';
  return Money.round(montoExtracto).gt(0) ? 'INGRESO' : 'EGRESO';
}

async function rechazarSugerenciasSuperpuestasAsientoEnTx(
  client: PoolClient,
  empresaId: string,
  usuarioId: string,
  grupoExcluidoId: string,
  extractoLineaId: string
): Promise<void> {
  const sugRes = await client.query<{ id: string }>(
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

  if (sugRes.rows.length === 0) return;

  const sugIds = sugRes.rows.map((r) => r.id);
  const afectadasRes = await client.query<{ extractoLineaId: string }>(
    `SELECT DISTINCT extracto_linea_id AS "extractoLineaId"
     FROM conciliacion_item
     WHERE empresa_id = $1
       AND grupo_id = ANY($2::uuid[])
       AND lado = 'BANCO'
       AND extracto_linea_id IS NOT NULL`,
    [empresaId, sugIds]
  );

  await client.query(
    `UPDATE conciliacion_grupo
     SET estado = 'RECHAZADO',
         observacion = COALESCE(observacion || ' ', '') || '[Reemplazada por asiento bancario generado]',
         updated_at = CURRENT_TIMESTAMP
     WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
    [empresaId, sugIds]
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

  for (const grupoRechazadoId of sugIds) {
    await registrarAuditoriaEnTx(client, {
      empresaId,
      usuarioId,
      tablaAfectada: 'conciliacion_grupo',
      registroId: grupoRechazadoId,
      accion: 'UPDATE',
      datosAnteriores: { estado: 'SUGERIDO' },
      datosNuevos: { estado: 'RECHAZADO', motivo: 'Reemplazada por asiento bancario generado' },
    });
  }
}

// ============================================================================
// SERVICIO PRINCIPAL: PLANTILLAS, VISTA PREVIA Y GENERACIÓN DE ASIENTOS
// ============================================================================

export const asientosConciliacionService = {
  async listarPlantillasAsiento(empresaId: string): Promise<PlantillaAsientoV2[]> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const config = await obtenerConfigEnTx(client, empresaId);
      const res = await client.query(
        `SELECT ${SELECT_PLANTILLA_COLS}
         FROM conciliacion_plantillas_asiento
         WHERE empresa_id = $1
         ORDER BY es_sistema DESC, nombre ASC`,
        [empresaId]
      );

      const enBd: PlantillaAsientoV2[] = res.rows.map(mapPlantillaRow);
      const codigosEnBd = new Set(enBd.map((p) => p.codigo.toUpperCase()));

      const predefinidas = PLANTILLAS_ASIENTO_SISTEMA.filter(
        (def) => !codigosEnBd.has(def.codigo.toUpperCase())
      ).map((def) => construirPlantillaSistema(def, empresaId, config));

      return [...predefinidas, ...enBd];
    });
  },

  async crearPlantillaAsiento(
    empresaId: string,
    userId: string,
    input: CrearPlantillaAsientoInput
  ): Promise<PlantillaAsientoV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');

    const parsed = crearPlantillaSchema.parse(input);
    const codigoNorm = parsed.codigo.toUpperCase();

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const dupRes = await client.query<{ id: string }>(
        `SELECT id FROM conciliacion_plantillas_asiento WHERE empresa_id = $1 AND codigo = $2 LIMIT 1`,
        [empresaId, codigoNorm]
      );
      if (dupRes.rows.length > 0) {
        throw new ConciliacionV2Error(
          409,
          'PLANTILLA_DUPLICADA',
          `Ya existe una plantilla de asiento con el código ${codigoNorm}.`
        );
      }

      if (parsed.cuentaContrapartidaCodigo) {
        await validarCuentaActivaPlanEnTx(
          client,
          empresaId,
          { codigo: parsed.cuentaContrapartidaCodigo },
          'Contrapartida de plantilla'
        );
      }

      const subdiarioCodigo = await validarSubdiarioEnTx(
        client,
        empresaId,
        parsed.subdiarioCodigo ?? '05'
      );

      const insRes = await client.query(
        `INSERT INTO conciliacion_plantillas_asiento (
           empresa_id,
           codigo,
           nombre,
           tipo_operacion,
           cuenta_contrapartida_codigo,
           subdiario_codigo,
           glosa_plantilla,
           es_sistema,
           activo,
           created_by,
           updated_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9, $9)
         RETURNING ${SELECT_PLANTILLA_COLS}`,
        [
          empresaId,
          codigoNorm,
          parsed.nombre,
          parsed.tipoOperacion,
          parsed.cuentaContrapartidaCodigo ?? null,
          subdiarioCodigo,
          parsed.glosaPlantilla,
          parsed.activo ?? true,
          userId,
        ]
      );

      const creada = mapPlantillaRow(insRes.rows[0]);

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'conciliacion_plantillas_asiento',
        registroId: creada.id,
        accion: 'INSERT',
        datosNuevos: creada,
      });

      return creada;
    });
  },

  async actualizarPlantillaAsiento(
    empresaId: string,
    userId: string,
    plantillaId: string,
    input: ActualizarPlantillaAsientoInput
  ): Promise<PlantillaAsientoV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');
    asegurarUuid(plantillaId, 'plantillaId');

    const parsed = actualizarPlantillaSchema.parse(input);

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const actualRes = await client.query(
        `SELECT ${SELECT_PLANTILLA_COLS}
         FROM conciliacion_plantillas_asiento
         WHERE empresa_id = $1 AND id = $2
         FOR UPDATE`,
        [empresaId, plantillaId]
      );
      if (actualRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'PLANTILLA_ASIENTO_NO_ENCONTRADA',
          'La plantilla de asiento indicada no existe en la empresa.'
        );
      }
      const anterior = mapPlantillaRow(actualRes.rows[0]);

      if (parsed.cuentaContrapartidaCodigo) {
        await validarCuentaActivaPlanEnTx(
          client,
          empresaId,
          { codigo: parsed.cuentaContrapartidaCodigo },
          'Contrapartida de plantilla'
        );
      }

      const subdiarioCodigo = parsed.subdiarioCodigo
        ? await validarSubdiarioEnTx(client, empresaId, parsed.subdiarioCodigo)
        : anterior.subdiarioCodigo;

      const updRes = await client.query(
        `UPDATE conciliacion_plantillas_asiento
         SET nombre = $1,
             tipo_operacion = $2,
             cuenta_contrapartida_codigo = $3,
             subdiario_codigo = $4,
             glosa_plantilla = $5,
             activo = $6,
             updated_by = $7,
             updated_at = CURRENT_TIMESTAMP
         WHERE empresa_id = $8 AND id = $9
         RETURNING ${SELECT_PLANTILLA_COLS}`,
        [
          parsed.nombre ?? anterior.nombre,
          parsed.tipoOperacion ?? anterior.tipoOperacion,
          parsed.cuentaContrapartidaCodigo !== undefined
            ? parsed.cuentaContrapartidaCodigo
            : anterior.cuentaContrapartidaCodigo,
          subdiarioCodigo,
          parsed.glosaPlantilla ?? anterior.glosaPlantilla,
          parsed.activo ?? anterior.activo,
          userId,
          empresaId,
          plantillaId,
        ]
      );

      const actualizada = mapPlantillaRow(updRes.rows[0]);

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'conciliacion_plantillas_asiento',
        registroId: plantillaId,
        accion: 'UPDATE',
        datosAnteriores: anterior,
        datosNuevos: actualizada,
      });

      return actualizada;
    });
  },

  async eliminarPlantillaAsiento(
    empresaId: string,
    userId: string,
    plantillaId: string
  ): Promise<{ id: string; eliminada: true }> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');
    asegurarUuid(plantillaId, 'plantillaId');

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const actualRes = await client.query(
        `SELECT ${SELECT_PLANTILLA_COLS}
         FROM conciliacion_plantillas_asiento
         WHERE empresa_id = $1 AND id = $2
         FOR UPDATE`,
        [empresaId, plantillaId]
      );
      if (actualRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'PLANTILLA_ASIENTO_NO_ENCONTRADA',
          'La plantilla de asiento indicada no existe en la empresa.'
        );
      }

      const anterior = mapPlantillaRow(actualRes.rows[0]);
      if (anterior.esSistema) {
        throw new ConciliacionV2Error(
          409,
          'PLANTILLA_SISTEMA_PROTEGIDA',
          'No se puede eliminar una plantilla de sistema. Puede desactivarla si no desea usarla.'
        );
      }

      await client.query(
        `DELETE FROM conciliacion_plantillas_asiento WHERE empresa_id = $1 AND id = $2`,
        [empresaId, plantillaId]
      );

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'conciliacion_plantillas_asiento',
        registroId: plantillaId,
        accion: 'DELETE',
        datosAnteriores: anterior,
      });

      return { id: plantillaId, eliminada: true };
    });
  },

  async previsualizarAsientoLinea(
    empresaId: string,
    input: PrevisualizarAsientoLineaInput
  ): Promise<PreviewAsientoConciliacionV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');

    const parsed = previsualizarSchema.parse(input);
    resolverRangoPeriodo(parsed.periodo);

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const res = await previsualizarAsientoLineaEnTx(client, empresaId, parsed, false);
      return res.preview;
    });
  },

  async generarAsientoDesdeLinea(
    empresaId: string,
    userId: string,
    input: GenerarAsientoLineaInput
  ): Promise<ResultadoGenerarAsientoLineaV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');

    if (input?.confirmadoVistaPrevia !== true || !input?.hashVistaPrevia?.trim()) {
      throw new ConciliacionV2Error(
        400,
        'VISTA_PREVIA_OBLIGATORIA',
        'Debe confirmar la vista previa del asiento (confirmadoVistaPrevia = true y hashVistaPrevia) antes de generar.'
      );
    }

    const parsed = previsualizarSchema.parse(input);
    resolverRangoPeriodo(parsed.periodo);

    return db.withEmpresaTransaction(empresaId, async (client) => {
      await client.query(
        `SELECT id FROM cuentas_financieras WHERE empresa_id = $1 AND id = $2 FOR UPDATE`,
        [empresaId, parsed.cuentaFinancieraId]
      );

      const { preview, linea, cuentaBanco, periodoId } = await previsualizarAsientoLineaEnTx(
        client,
        empresaId,
        parsed,
        true
      );

      if (preview.hashVistaPrevia !== input.hashVistaPrevia.trim()) {
        throw new ConciliacionV2Error(
          409,
          'VISTA_PREVIA_DESACTUALIZADA',
          'Los datos del extracto o de la plantilla cambiaron desde la vista previa. Vuelva a previsualizar antes de confirmar.'
        );
      }

      const periodoAsientoId =
        linea.fecha.slice(0, 7) === parsed.periodo
          ? periodoId
          : await resolverPeriodoEnTx(client, empresaId, linea.fecha.slice(0, 7));

      const esUsd = preview.moneda === 'USD';
      const asiento = await asientoService.crearAsiento(
        empresaId,
        {
          periodoId: periodoAsientoId,
          subdiario: preview.subdiarioCodigo,
          fecha: preview.fecha,
          moneda: preview.moneda,
          tipoCambio: Number(preview.tipoCambio),
          glosa: preview.glosa,
          origenModulo: 'TESORERIA',
          prohibirAutoCreacionCuentas: true,
          lineas: preview.lineas.map((l) => ({
            linea: l.linea,
            cuentaId: l.cuentaId,
            codigoCuenta: l.cuentaCodigo,
            anexoId: l.anexoId ?? undefined,
            centroCostoId: l.centroCostoId ?? undefined,
            debe: Money.toNumber(l.debe),
            haber: Money.toNumber(l.haber),
            debeMe: esUsd ? Money.toNumber(l.debe) : 0,
            haberMe: esUsd ? Money.toNumber(l.haber) : 0,
            glosaLinea: l.glosaLinea,
          })),
        },
        userId,
        client
      );

      const montoAbsDec = Money.round(linea.monto).abs();
      const tipoMovimiento = mapTipoMovimientoDesdeOperacion(preview.tipoOperacion, linea.monto);
      const movId = randomUUID();
      const saldoActualDec = Money.round(cuentaBanco.saldoActual);
      const nuevoSaldoDec =
        tipoMovimiento === 'INGRESO'
          ? Money.add(saldoActualDec, montoAbsDec)
          : Money.sub(saldoActualDec, montoAbsDec);

      await client.query(
        `INSERT INTO movimientos_tesoreria (
           id, empresa_id, periodo_id, cuenta_financiera_id, fecha, tipo,
           medio_pago, numero_operacion, anexo_id, moneda, tipo_cambio,
           importe, importe_me, saldo_sin_aplicar, glosa, estado, conciliado,
           estado_conciliacion_libro, asiento_id, version, created_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           '003', $7, $8, $9, $10,
           $11, $12, 0.00, $13, 'REGISTRADO', true,
           'CONCILIADO', $14, 1, $15
         )`,
        [
          movId,
          empresaId,
          periodoAsientoId,
          cuentaBanco.id,
          preview.fecha,
          tipoMovimiento,
          linea.referencia ?? null,
          parsed.anexoId ?? null,
          preview.moneda,
          Number(preview.tipoCambio),
          Money.toNumber(montoAbsDec),
          esUsd ? Money.toNumber(montoAbsDec) : 0,
          preview.glosa,
          asiento.id,
          userId,
        ]
      );

      await client.query(
        `UPDATE cuentas_financieras
         SET saldo_actual = $1, updated_at = CURRENT_TIMESTAMP
         WHERE empresa_id = $2 AND id = $3`,
        [Money.toNumber(nuevoSaldoDec), empresaId, cuentaBanco.id]
      );

      const reglaAplicada = `PLANTILLA_${preview.tipoOperacion}`;
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
         VALUES ($1, $2, $3, '1:1', $4, 0, 1.0000, 'CONCILIADO_MANUAL', 0.00, $5, $6, $6, CURRENT_TIMESTAMP)
         RETURNING id, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [empresaId, cuentaBanco.id, periodoId, reglaAplicada, preview.glosa, userId]
      );
      const grupoId = insGrupoRes.rows[0].id;

      const montoBancoFmt = Money.format(linea.monto);
      const montoLibroFmt = Money.format(
        tipoMovimiento === 'INGRESO' ? montoAbsDec : montoAbsDec.negated()
      );

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
        [empresaId, grupoId, movId, asiento.id, montoLibroFmt]
      );

      const updLinea = await client.query(
        `UPDATE extracto_lineas
         SET conciliada = true,
             estado_conciliacion = 'CONCILIADO_MANUAL',
             movimiento_tesoreria_id = $1,
             diferencia_importe = 0.00,
             observacion_conciliacion = $2,
             conciliado_en = CURRENT_TIMESTAMP
         WHERE empresa_id = $3 AND id = $4 AND conciliada = false`,
        [movId, preview.glosa, empresaId, linea.id]
      );
      if (updLinea.rowCount !== 1) {
        throw new ConciliacionV2Error(
          409,
          'CONCURRENCIA_CONCILIACION',
          'La línea de extracto fue conciliada en paralelo por otra operación.'
        );
      }

      // Rechazar sugerencias previas superpuestas sobre esta línea de extracto y restaurar otras líneas
      await rechazarSugerenciasSuperpuestasAsientoEnTx(
        client,
        empresaId,
        userId,
        grupoId,
        linea.id
      );

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'movimientos_tesoreria',
        registroId: movId,
        accion: 'INSERT',
        datosNuevos: {
          id: movId,
          cuentaFinancieraId: cuentaBanco.id,
          tipo: tipoMovimiento,
          medioPago: '003',
          importe: Money.format(montoAbsDec),
          glosa: preview.glosa,
          asientoId: asiento.id,
          extractoLineaId: linea.id,
          estadoConciliacionLibro: 'CONCILIADO',
        },
      });

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'conciliacion_grupo',
        registroId: grupoId,
        accion: 'INSERT',
        datosNuevos: {
          grupoId,
          reglaAplicada,
          asientoId: asiento.id,
          movimientoTesoreriaId: movId,
          extractoLineaId: linea.id,
          hashVistaPrevia: preview.hashVistaPrevia,
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
          fecha: preview.fecha,
          descripcion: linea.descripcion,
          referencia: linea.referencia,
        },
      ];

      const itemsLibro: ItemConciliacionV2[] = [
        {
          id: itemLibroRes.rows[0].id,
          grupoId,
          lado: 'LIBRO',
          origenLibro: 'MOVIMIENTO_TESORERIA' as OrigenPartidaLibroV2,
          extractoLineaId: null,
          movimientoTesoreriaId: movId,
          asientoId: asiento.id,
          asientoDetalleId: null,
          montoImputado: montoLibroFmt,
          fecha: preview.fecha,
          descripcion: preview.glosa,
          referencia: linea.referencia,
        },
      ];

      const grupo: GrupoConciliacionV2 = {
        id: grupoId,
        empresaId,
        cuentaFinancieraId: cuentaBanco.id,
        periodoId,
        tipoMatch: '1:1' as TipoMatchV2,
        reglaAplicada,
        capaMatching: 0,
        score: 1,
        estado: 'CONCILIADO_MANUAL',
        diferenciaMonto: '0.00',
        observacion: preview.glosa,
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
        movimientoTesoreriaId: movId,
        asientoId: asiento.id,
        asientoNumero: asiento.numero ?? null,
        cuo: asiento.cuo ?? null,
        previewHashUsado: preview.hashVistaPrevia,
      };
    });
  },
};
