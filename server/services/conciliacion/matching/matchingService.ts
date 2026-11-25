import type { PoolClient } from 'pg';
import { z } from 'zod';
import { db } from '../../../config/database';
import {
  AceptarSugerenciasInput,
  ActualizarReglaAprendidaInput,
  ConciliarManualGrupoInput,
  CrearReglaAprendidaInput,
  EjecutarMatchingInput,
  EstadoGrupoConciliacionV2,
  GrupoConciliacionV2,
  HistorialDesconciliacionV2,
  ItemConciliacionV2,
  OrigenPartidaLibroV2,
  ReglaAprendidaV2,
  ResultadoEjecucionMatchingV2,
  TIPOS_CLASIFICACION_EXTRACTO,
  TipoClasificacionExtracto,
  TipoMatchV2,
} from '../../../types/conciliacionV2';
import { Money } from '../../../utils/decimal';
import {
  ConciliacionV2Error,
  asegurarPostgresDisponible,
  asegurarUuid,
  obtenerConfigEnTx,
  obtenerCuentaBancariaEnTx,
  obtenerResumenConciliacionEnTx,
  registrarAuditoriaEnTx,
  resolverRangoPeriodo,
  validarPrecondicionOperacionCuenta,
  verificarPeriodoNoCerradoEnTx,
} from '../../conciliacionV2Service';
import {
  GrupoCandidatoMatching,
  PartidaBancoMatching,
  PartidaLibroMatching,
  ejecutarMotorMatching,
} from './matchingEngine';

const PERIODO_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const ESTADOS_GRUPO_VALIDOS = new Set<EstadoGrupoConciliacionV2>([
  'SUGERIDO',
  'CONCILIADO',
  'CONCILIADO_MANUAL',
  'RECHAZADO',
  'DESCONCILIADO',
]);

const ejecutarMatchingSchema = z.object({
  cuentaFinancieraId: z.string().uuid('cuentaFinancieraId debe ser un UUID válido.'),
  periodo: z.string().regex(PERIODO_REGEX, 'periodo debe tener formato YYYY-MM.'),
  umbralAutoMatch: z.number().min(0.6).max(1).optional(),
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
  limpiarSugerenciasPrevias: z.boolean().optional(),
});

const aceptarSugerenciasSchema = z.object({
  grupoIds: z
    .array(z.string().uuid('Cada grupoId debe ser un UUID válido.'))
    .min(1, 'Debe indicar al menos un grupo sugerido para aceptar.')
    .max(200, 'No se pueden aceptar más de 200 grupos en una sola operación.'),
});

const rechazarSugerenciaSchema = z.object({
  motivo: z.string().trim().max(500).nullable().optional(),
});

const desconciliarGrupoSchema = z.object({
  motivo: z
    .string()
    .trim()
    .min(5, 'El motivo de desconciliación debe tener al menos 5 caracteres.')
    .max(500, 'El motivo de desconciliación no puede superar 500 caracteres.'),
});

const conciliarManualGrupoSchema = z.object({
  cuentaFinancieraId: z.string().uuid('cuentaFinancieraId debe ser un UUID válido.'),
  periodo: z.string().regex(PERIODO_REGEX, 'periodo debe tener formato YYYY-MM.'),
  extractoLineaIds: z
    .array(z.string().uuid('Cada extractoLineaId debe ser un UUID válido.'))
    .min(1, 'Debe seleccionar al menos una línea de extracto bancario.')
    .max(50, 'No se pueden agrupar más de 50 líneas bancarias por grupo.'),
  libroItems: z
    .array(
      z.object({
        origenLibro: z.enum(['MOVIMIENTO_TESORERIA', 'ASIENTO_MANUAL']),
        id: z.string().uuid('Cada id de partida libro debe ser un UUID válido.'),
      })
    )
    .min(1, 'Debe seleccionar al menos una partida de libro.')
    .max(50, 'No se pueden agrupar más de 50 partidas de libro por grupo.'),
  observacion: z.string().trim().max(500).nullable().optional(),
  aprenderRegla: z
    .object({
      patronContraparte: z
        .string()
        .trim()
        .min(2, 'El patrón de contraparte debe tener al menos 2 caracteres.')
        .max(200),
      rucContraparte: z
        .string()
        .trim()
        .regex(/^\d{8,15}$/, 'rucContraparte debe tener entre 8 y 15 dígitos.')
        .nullable()
        .optional(),
      anexoId: z.string().uuid('anexoId debe ser un UUID válido.').nullable().optional(),
      cuentaContableId: z
        .string()
        .uuid('cuentaContableId debe ser un UUID válido.')
        .nullable()
        .optional(),
      tipoClasificacion: z.enum(TIPOS_CLASIFICACION_EXTRACTO).nullable().optional(),
    })
    .nullable()
    .optional(),
});

const crearReglaAprendidaSchema = z.object({
  patronContraparte: z
    .string()
    .trim()
    .min(2, 'patronContraparte debe tener al menos 2 caracteres.')
    .max(200),
  rucContraparte: z
    .string()
    .trim()
    .regex(/^\d{8,15}$/, 'rucContraparte debe tener entre 8 y 15 dígitos.')
    .nullable()
    .optional(),
  anexoId: z.string().uuid('anexoId debe ser un UUID válido.').nullable().optional(),
  cuentaContableId: z
    .string()
    .uuid('cuentaContableId debe ser un UUID válido.')
    .nullable()
    .optional(),
  tipoClasificacion: z.enum(TIPOS_CLASIFICACION_EXTRACTO).nullable().optional(),
  activo: z.boolean().optional(),
});

const actualizarReglaAprendidaSchema = z.object({
  patronContraparte: z
    .string()
    .trim()
    .min(2, 'patronContraparte debe tener al menos 2 caracteres.')
    .max(200)
    .optional(),
  rucContraparte: z
    .string()
    .trim()
    .regex(/^\d{8,15}$/, 'rucContraparte debe tener entre 8 y 15 dígitos.')
    .nullable()
    .optional(),
  anexoId: z.string().uuid('anexoId debe ser un UUID válido.').nullable().optional(),
  cuentaContableId: z
    .string()
    .uuid('cuentaContableId debe ser un UUID válido.')
    .nullable()
    .optional(),
  tipoClasificacion: z.enum(TIPOS_CLASIFICACION_EXTRACTO).nullable().optional(),
  activo: z.boolean().optional(),
});

function calcularTipoMatch(cantidadBanco: number, cantidadLibro: number): TipoMatchV2 {
  if (cantidadBanco === 1 && cantidadLibro === 1) return '1:1';
  if (cantidadBanco === 1 && cantidadLibro > 1) return '1:N';
  if (cantidadBanco > 1 && cantidadLibro === 1) return 'N:1';
  return 'N:M';
}

function ordenarUuidsUnicos(ids: string[]): string[] {
  return Array.from(new Set(ids)).sort();
}

async function bloquearCuentaFinancieraEnTx(
  client: PoolClient,
  empresaId: string,
  cuentaFinancieraId: string
): Promise<void> {
  await client.query(
    `SELECT id
     FROM cuentas_financieras
     WHERE empresa_id = $1 AND id = $2
     FOR UPDATE`,
    [empresaId, cuentaFinancieraId]
  );
}

function mapReglaAprendidaRow(row: any): ReglaAprendidaV2 {
  return {
    id: row.id,
    empresaId: row.empresaId,
    patronContraparte: row.patronContraparte,
    rucContraparte: row.rucContraparte ?? null,
    anexoId: row.anexoId ?? null,
    anexoNombre: row.anexoNombre ?? null,
    cuentaContableId: row.cuentaContableId ?? null,
    cuentaContableCodigo: row.cuentaContableCodigo ?? null,
    tipoClasificacion: (row.tipoClasificacion ?? null) as TipoClasificacionExtracto | null,
    usosConfirmados: Number(row.usosConfirmados ?? 1),
    activo: Boolean(row.activo),
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function mapHistorialDesconciliacionRow(row: any): HistorialDesconciliacionV2 {
  return {
    id: row.id,
    empresaId: row.empresaId,
    grupoId: row.grupoId ?? null,
    extractoLineaId: row.extractoLineaId ?? null,
    movimientoTesoreriaId: row.movimientoTesoreriaId ?? null,
    estadoAnteriorBanco: row.estadoAnteriorBanco ?? null,
    estadoAnteriorLibro: row.estadoAnteriorLibro ?? null,
    motivo: row.motivo,
    snapshotGrupoJson:
      row.snapshotGrupoJson && typeof row.snapshotGrupoJson === 'object'
        ? row.snapshotGrupoJson
        : {},
    usuarioId: row.usuarioId ?? null,
    usuarioEmail: row.usuarioEmail ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

async function resolverPeriodoIdEnTx(
  client: PoolClient,
  empresaId: string,
  codigoPeriodo: string
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `SELECT id
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
  return res.rows[0].id;
}

async function validarReferenciasReglaAprendidaEnTx(
  client: PoolClient,
  empresaId: string,
  anexoId: string | null | undefined,
  cuentaContableId: string | null | undefined
): Promise<void> {
  if (anexoId) {
    const anexoRes = await client.query<{ id: string }>(
      `SELECT id FROM anexos WHERE empresa_id = $1 AND id = $2 LIMIT 1`,
      [empresaId, anexoId]
    );
    if (anexoRes.rows.length === 0) {
      throw new ConciliacionV2Error(
        404,
        'ANEXO_NO_ENCONTRADO',
        'El anexo indicado en la regla aprendida no existe para esta empresa.'
      );
    }
  }

  if (cuentaContableId) {
    const pcRes = await client.query<{ id: string; isActive: boolean; permiteMovimiento: boolean }>(
      `SELECT id, is_active AS "isActive", permite_movimiento AS "permiteMovimiento"
       FROM plan_cuentas
       WHERE empresa_id = $1 AND id = $2
       LIMIT 1`,
      [empresaId, cuentaContableId]
    );
    if (pcRes.rows.length === 0) {
      throw new ConciliacionV2Error(
        404,
        'CUENTA_CONTABLE_NO_ENCONTRADA',
        'La cuenta contable indicada en la regla aprendida no existe en el plan de cuentas de la empresa.'
      );
    }
    if (!pcRes.rows[0].isActive || !pcRes.rows[0].permiteMovimiento) {
      throw new ConciliacionV2Error(
        409,
        'CUENTA_CONTABLE_INVALIDA',
        'La cuenta contable indicada en la regla aprendida está inactiva o no permite movimiento.'
      );
    }
  }
}

async function listarReglasAprendidasEnTx(
  client: PoolClient,
  empresaId: string,
  soloActivas = false
): Promise<ReglaAprendidaV2[]> {
  const res = await client.query(
    `SELECT r.id,
            r.empresa_id AS "empresaId",
            r.patron_contraparte AS "patronContraparte",
            r.ruc_contraparte AS "rucContraparte",
            r.anexo_id AS "anexoId",
            ax.razon_social AS "anexoNombre",
            r.cuenta_contable_id AS "cuentaContableId",
            pc.codigo AS "cuentaContableCodigo",
            r.tipo_clasificacion AS "tipoClasificacion",
            r.usos_confirmados AS "usosConfirmados",
            r.activo,
            r.created_by AS "createdBy",
            r.updated_by AS "updatedBy",
            r.created_at AS "createdAt",
            r.updated_at AS "updatedAt"
     FROM conciliacion_reglas_aprendidas r
     LEFT JOIN anexos ax
       ON ax.empresa_id = r.empresa_id
      AND ax.id = r.anexo_id
     LEFT JOIN plan_cuentas pc
       ON pc.empresa_id = r.empresa_id
      AND pc.id = r.cuenta_contable_id
     WHERE r.empresa_id = $1
       AND ($2::boolean = false OR r.activo = true)
     ORDER BY r.usos_confirmados DESC, r.updated_at DESC, r.patron_contraparte ASC`,
    [empresaId, soloActivas]
  );

  return res.rows.map(mapReglaAprendidaRow);
}

async function obtenerReglaAprendidaPorIdEnTx(
  client: PoolClient,
  empresaId: string,
  reglaId: string
): Promise<ReglaAprendidaV2 | null> {
  const res = await client.query(
    `SELECT r.id,
            r.empresa_id AS "empresaId",
            r.patron_contraparte AS "patronContraparte",
            r.ruc_contraparte AS "rucContraparte",
            r.anexo_id AS "anexoId",
            ax.razon_social AS "anexoNombre",
            r.cuenta_contable_id AS "cuentaContableId",
            pc.codigo AS "cuentaContableCodigo",
            r.tipo_clasificacion AS "tipoClasificacion",
            r.usos_confirmados AS "usosConfirmados",
            r.activo,
            r.created_by AS "createdBy",
            r.updated_by AS "updatedBy",
            r.created_at AS "createdAt",
            r.updated_at AS "updatedAt"
     FROM conciliacion_reglas_aprendidas r
     LEFT JOIN anexos ax
       ON ax.empresa_id = r.empresa_id
      AND ax.id = r.anexo_id
     LEFT JOIN plan_cuentas pc
       ON pc.empresa_id = r.empresa_id
      AND pc.id = r.cuenta_contable_id
     WHERE r.empresa_id = $1 AND r.id = $2
     LIMIT 1`,
    [empresaId, reglaId]
  );

  return res.rows[0] ? mapReglaAprendidaRow(res.rows[0]) : null;
}

async function cargarGruposConItemsEnTx(
  client: PoolClient,
  empresaId: string,
  grupoIds: string[]
): Promise<GrupoConciliacionV2[]> {
  if (grupoIds.length === 0) return [];

  const gruposRes = await client.query(
    `SELECT cg.id,
            cg.empresa_id AS "empresaId",
            cg.cuenta_financiera_id AS "cuentaFinancieraId",
            cg.periodo_id AS "periodoId",
            cg.tipo_match AS "tipoMatch",
            cg.regla_aplicada AS "reglaAplicada",
            cg.capa_matching AS "capaMatching",
            cg.score::float8 AS score,
            cg.estado,
            cg.diferencia_monto::text AS "diferenciaMonto",
            cg.observacion,
            cg.usuario_id AS "usuarioId",
            cg.confirmado_por AS "confirmadoPor",
            cg.confirmado_en AS "confirmadoEn",
            cg.created_at AS "createdAt",
            cg.updated_at AS "updatedAt"
     FROM conciliacion_grupo cg
     WHERE cg.empresa_id = $1
       AND cg.id = ANY($2::uuid[])
     ORDER BY cg.created_at ASC, cg.id ASC`,
    [empresaId, grupoIds]
  );

  if (gruposRes.rows.length === 0) return [];

  const itemsRes = await client.query(
    `SELECT ci.id,
            ci.grupo_id AS "grupoId",
            ci.lado,
            ci.origen_libro AS "origenLibro",
            ci.extracto_linea_id AS "extractoLineaId",
            ci.movimiento_tesoreria_id AS "movimientoTesoreriaId",
            ci.asiento_id AS "asientoId",
            ci.asiento_detalle_id AS "asientoDetalleId",
            ci.monto_imputado::text AS "montoImputado",
            COALESCE(el.fecha::text, mt.fecha::text, a.fecha::text) AS fecha,
            COALESCE(
              el.descripcion,
              mt.glosa,
              NULLIF(TRIM(ad.glosa_linea), ''),
              a.glosa
            ) AS descripcion,
            COALESCE(
              el.referencia,
              mt.numero_operacion,
              NULLIF(CONCAT_WS('-', ad.doc_tipo, ad.doc_serie, ad.doc_numero), ''),
              a.numero
            ) AS referencia
     FROM conciliacion_item ci
     LEFT JOIN extracto_lineas el
       ON el.empresa_id = ci.empresa_id
      AND el.id = ci.extracto_linea_id
     LEFT JOIN movimientos_tesoreria mt
       ON mt.empresa_id = ci.empresa_id
      AND mt.id = ci.movimiento_tesoreria_id
     LEFT JOIN asiento_detalle ad
       ON ad.empresa_id = ci.empresa_id
      AND ad.id = ci.asiento_detalle_id
     LEFT JOIN asientos a
       ON a.empresa_id = ci.empresa_id
      AND a.id = COALESCE(ci.asiento_id, ad.asiento_id)
     WHERE ci.empresa_id = $1
       AND ci.grupo_id = ANY($2::uuid[])
     ORDER BY ci.created_at ASC, ci.id ASC`,
    [empresaId, grupoIds]
  );

  const itemsPorGrupo = new Map<
    string,
    { banco: ItemConciliacionV2[]; libro: ItemConciliacionV2[] }
  >();

  for (const row of itemsRes.rows) {
    let bucket = itemsPorGrupo.get(row.grupoId);
    if (!bucket) {
      bucket = { banco: [], libro: [] };
      itemsPorGrupo.set(row.grupoId, bucket);
    }

    const item: ItemConciliacionV2 = {
      id: row.id,
      grupoId: row.grupoId,
      lado: row.lado,
      origenLibro: (row.origenLibro ?? null) as OrigenPartidaLibroV2 | null,
      extractoLineaId: row.extractoLineaId ?? null,
      movimientoTesoreriaId: row.movimientoTesoreriaId ?? null,
      asientoId: row.asientoId ?? null,
      asientoDetalleId: row.asientoDetalleId ?? null,
      montoImputado: Money.format(row.montoImputado ?? '0'),
      fecha: row.fecha ?? null,
      descripcion: row.descripcion ?? null,
      referencia: row.referencia ?? null,
    };

    if (item.lado === 'BANCO') {
      bucket.banco.push(item);
    } else {
      bucket.libro.push(item);
    }
  }

  return gruposRes.rows.map((g) => {
    const items = itemsPorGrupo.get(g.id) ?? { banco: [], libro: [] };
    return {
      id: g.id,
      empresaId: g.empresaId,
      cuentaFinancieraId: g.cuentaFinancieraId,
      periodoId: g.periodoId,
      tipoMatch: g.tipoMatch as TipoMatchV2,
      reglaAplicada: g.reglaAplicada,
      capaMatching: Number(g.capaMatching),
      score: Number(Number(g.score).toFixed(4)),
      estado: g.estado as EstadoGrupoConciliacionV2,
      diferenciaMonto: Money.format(g.diferenciaMonto ?? '0'),
      observacion: g.observacion ?? null,
      usuarioId: g.usuarioId ?? null,
      confirmadoPor: g.confirmadoPor ?? null,
      confirmadoEn: g.confirmadoEn ? new Date(g.confirmadoEn).toISOString() : null,
      createdAt: new Date(g.createdAt).toISOString(),
      updatedAt: new Date(g.updatedAt).toISOString(),
      itemsBanco: items.banco,
      itemsLibro: items.libro,
    };
  });
}

async function restaurarLineasExtractoDeSugeridosEnTx(
  client: PoolClient,
  empresaId: string,
  extractoLineaIds: string[]
): Promise<void> {
  const idsOrdenados = ordenarUuidsUnicos(extractoLineaIds);
  if (idsOrdenados.length === 0) return;

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
    [empresaId, idsOrdenados]
  );
}

async function rechazarSugerenciasSuperpuestasEnTx(
  client: PoolClient,
  empresaId: string,
  usuarioId: string,
  excluirGrupoId: string | null,
  extractoLineaIds: string[],
  movimientoTesoreriaIds: string[],
  asientoDetalleIds: string[],
  motivo: string
): Promise<void> {
  const bancoIdsOrdenados = ordenarUuidsUnicos(extractoLineaIds);
  const movIdsOrdenados = ordenarUuidsUnicos(movimientoTesoreriaIds);
  const asientoDetIdsOrdenados = ordenarUuidsUnicos(asientoDetalleIds);

  const superpuestosRes = await client.query<{ id: string }>(
    `SELECT cg.id
     FROM conciliacion_grupo cg
     WHERE cg.empresa_id = $1
       AND cg.estado = 'SUGERIDO'
       AND ($2::uuid IS NULL OR cg.id <> $2)
       AND EXISTS (
         SELECT 1
         FROM conciliacion_item ci
         WHERE ci.grupo_id = cg.id
           AND ci.empresa_id = cg.empresa_id
           AND (
             (ci.lado = 'BANCO' AND ci.extracto_linea_id = ANY($3::uuid[]))
             OR (ci.lado = 'LIBRO' AND ci.origen_libro = 'MOVIMIENTO_TESORERIA' AND ci.movimiento_tesoreria_id = ANY($4::uuid[]))
             OR (ci.lado = 'LIBRO' AND ci.origen_libro = 'ASIENTO_MANUAL' AND ci.asiento_detalle_id = ANY($5::uuid[]))
           )
       )
     ORDER BY cg.id ASC
     FOR UPDATE OF cg`,
    [empresaId, excluirGrupoId, bancoIdsOrdenados, movIdsOrdenados, asientoDetIdsOrdenados]
  );

  if (superpuestosRes.rows.length === 0) return;

  const ids = ordenarUuidsUnicos(superpuestosRes.rows.map((r) => r.id));
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
         observacion = CASE
           WHEN observacion IS NULL OR observacion = '' THEN $1
           ELSE observacion || ' [' || $1 || ']'
         END,
         updated_at = CURRENT_TIMESTAMP
     WHERE empresa_id = $2 AND id = ANY($3::uuid[])`,
    [motivo, empresaId, ids]
  );

  const lineasAfectadas = ordenarUuidsUnicos(afectadasRes.rows.map((r) => r.extractoLineaId));
  await restaurarLineasExtractoDeSugeridosEnTx(client, empresaId, lineasAfectadas);

  for (const grupoRechazadoId of ids) {
    await registrarAuditoriaEnTx(client, {
      empresaId,
      usuarioId,
      tablaAfectada: 'conciliacion_grupo',
      registroId: grupoRechazadoId,
      accion: 'UPDATE',
      datosAnteriores: { estado: 'SUGERIDO' },
      datosNuevos: {
        estado: 'RECHAZADO',
        motivo: 'Reemplazada por conciliación confirmada',
      },
    });
  }
}

async function aplicarConfirmacionConciliacionEnTx(
  client: PoolClient,
  params: {
    empresaId: string;
    estadoDestino: 'CONCILIADO' | 'CONCILIADO_MANUAL';
    diferenciaMonto: string;
    observacion: string | null;
    itemsBanco: Array<{ extractoLineaId: string }>;
    itemsLibro: Array<{
      origenLibro: OrigenPartidaLibroV2;
      movimientoTesoreriaId: string | null;
    }>;
  }
): Promise<void> {
  const { empresaId, estadoDestino, diferenciaMonto, observacion, itemsBanco, itemsLibro } = params;

  const bancoIds = ordenarUuidsUnicos(itemsBanco.map((b) => b.extractoLineaId));
  const movIds = ordenarUuidsUnicos(
    itemsLibro
      .filter((l) => l.origenLibro === 'MOVIMIENTO_TESORERIA' && l.movimientoTesoreriaId)
      .map((l) => l.movimientoTesoreriaId as string)
  );
  const primerMovId = movIds[0] ?? null;
  const primeraLineaId = itemsBanco[0]?.extractoLineaId ?? bancoIds[0] ?? null;

  if (bancoIds.length > 0 && primeraLineaId) {
    const updBanco = await client.query(
      `UPDATE extracto_lineas
       SET conciliada = true,
           estado_conciliacion = $1,
           movimiento_tesoreria_id = $2,
           diferencia_importe = CASE WHEN id = $7::uuid THEN $3::numeric ELSE 0.00 END,
           observacion_conciliacion = COALESCE($4, observacion_conciliacion),
           conciliado_en = CURRENT_TIMESTAMP
       WHERE id = ANY($6::uuid[])
         AND empresa_id = $5
         AND conciliada = false`,
      [
        estadoDestino,
        primerMovId,
        Money.format(diferenciaMonto),
        observacion,
        empresaId,
        bancoIds,
        primeraLineaId,
      ]
    );

    if (updBanco.rowCount !== bancoIds.length) {
      throw new ConciliacionV2Error(
        409,
        'CONCURRENCIA_CONCILIACION',
        'Una o más partidas fueron conciliadas en paralelo por otra operación.'
      );
    }
  }

  if (movIds.length > 0) {
    const updMov = await client.query(
      `UPDATE movimientos_tesoreria
       SET conciliado = true,
           estado_conciliacion_libro = 'CONCILIADO',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($2::uuid[])
         AND empresa_id = $1
         AND conciliado = false`,
      [empresaId, movIds]
    );

    if (updMov.rowCount !== movIds.length) {
      throw new ConciliacionV2Error(
        409,
        'CONCURRENCIA_CONCILIACION',
        'Una o más partidas fueron conciliadas en paralelo por otra operación.'
      );
    }
  }
}

async function persistirGrupoCandidatoEnTx(
  client: PoolClient,
  params: {
    empresaId: string;
    userId: string;
    cuentaFinancieraId: string;
    periodoId: string;
    grupo: GrupoCandidatoMatching;
  }
): Promise<string> {
  const { empresaId, userId, cuentaFinancieraId, periodoId, grupo } = params;
  const esAuto = grupo.estado === 'CONCILIADO';

  const insGrupoRes = await client.query<{ id: string }>(
    `INSERT INTO conciliacion_grupo (
       empresa_id,
       cuenta_financiera_id,
       periodo_id,
       tipo_match,
       regla_aplicada,
       capa_matching,
       score,
       estado,
       diferencia_monto,
       observacion,
       usuario_id,
       confirmado_por,
       confirmado_en
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, ${esAuto ? 'CURRENT_TIMESTAMP' : 'NULL'})
     RETURNING id`,
    [
      empresaId,
      cuentaFinancieraId,
      periodoId,
      grupo.tipoMatch,
      grupo.reglaAplicada,
      grupo.capaMatching,
      grupo.score.toFixed(4),
      grupo.estado,
      Money.format(grupo.diferenciaMonto),
      grupo.observacion,
      userId,
      esAuto ? userId : null,
    ]
  );

  const grupoId = insGrupoRes.rows[0].id;

  for (const ib of grupo.itemsBanco) {
    await client.query(
      `INSERT INTO conciliacion_item (
         empresa_id,
         grupo_id,
         lado,
         origen_libro,
         extracto_linea_id,
         movimiento_tesoreria_id,
         asiento_id,
         asiento_detalle_id,
         monto_imputado
       )
       VALUES ($1, $2, 'BANCO', NULL, $3, NULL, NULL, NULL, $4)`,
      [empresaId, grupoId, ib.partida.id, Money.format(ib.montoImputado)]
    );
  }

  for (const il of grupo.itemsLibro) {
    if (il.partida.origenLibro === 'MOVIMIENTO_TESORERIA') {
      await client.query(
        `INSERT INTO conciliacion_item (
           empresa_id,
           grupo_id,
           lado,
           origen_libro,
           extracto_linea_id,
           movimiento_tesoreria_id,
           asiento_id,
           asiento_detalle_id,
           monto_imputado
         )
         VALUES ($1, $2, 'LIBRO', 'MOVIMIENTO_TESORERIA', NULL, $3, $4, NULL, $5)`,
        [
          empresaId,
          grupoId,
          il.partida.id,
          il.partida.asientoId ?? null,
          Money.format(il.montoImputado),
        ]
      );
    } else {
      const asientoId = il.partida.asientoId;
      const asientoDetalleId = il.partida.asientoDetalleId ?? il.partida.id;
      if (!asientoId || !asientoDetalleId) {
        throw new ConciliacionV2Error(
          409,
          'ASIENTO_MANUAL_INCOMPLETO',
          'La partida de asiento manual no tiene asiento_id y asiento_detalle_id válidos.'
        );
      }
      await client.query(
        `INSERT INTO conciliacion_item (
           empresa_id,
           grupo_id,
           lado,
           origen_libro,
           extracto_linea_id,
           movimiento_tesoreria_id,
           asiento_id,
           asiento_detalle_id,
           monto_imputado
         )
         VALUES ($1, $2, 'LIBRO', 'ASIENTO_MANUAL', NULL, NULL, $3, $4, $5)`,
        [empresaId, grupoId, asientoId, asientoDetalleId, Money.format(il.montoImputado)]
      );
    }
  }

  if (esAuto) {
    await aplicarConfirmacionConciliacionEnTx(client, {
      empresaId,
      estadoDestino: 'CONCILIADO',
      diferenciaMonto: grupo.diferenciaMonto,
      observacion: grupo.observacion,
      itemsBanco: grupo.itemsBanco.map((ib) => ({ extractoLineaId: ib.partida.id })),
      itemsLibro: grupo.itemsLibro.map((il) => ({
        origenLibro: il.partida.origenLibro,
        movimientoTesoreriaId:
          il.partida.origenLibro === 'MOVIMIENTO_TESORERIA' ? il.partida.id : null,
      })),
    });
  } else {
    const bancoIds = ordenarUuidsUnicos(grupo.itemsBanco.map((ib) => ib.partida.id));
    const updSug = await client.query(
      `UPDATE extracto_lineas
       SET estado_conciliacion = 'SUGERIDO',
           observacion_conciliacion = COALESCE($1, observacion_conciliacion)
       WHERE id = ANY($3::uuid[])
         AND empresa_id = $2
         AND conciliada = false`,
      [grupo.observacion, empresaId, bancoIds]
    );

    if (updSug.rowCount !== bancoIds.length) {
      throw new ConciliacionV2Error(
        409,
        'CONCURRENCIA_CONCILIACION',
        'Una o más partidas fueron conciliadas en paralelo por otra operación.'
      );
    }
  }

  await registrarAuditoriaEnTx(client, {
    empresaId,
    usuarioId: userId,
    tablaAfectada: 'conciliacion_grupo',
    registroId: grupoId,
    accion: 'INSERT',
    datosNuevos: {
      cuentaFinancieraId,
      periodoId,
      tipoMatch: grupo.tipoMatch,
      reglaAplicada: grupo.reglaAplicada,
      capaMatching: grupo.capaMatching,
      score: grupo.score,
      estado: grupo.estado,
      diferenciaMonto: Money.format(grupo.diferenciaMonto),
      itemsBanco: grupo.itemsBanco.map((b) => ({ id: b.partida.id, monto: b.montoImputado })),
      itemsLibro: grupo.itemsLibro.map((l) => ({
        origenLibro: l.partida.origenLibro,
        id: l.partida.id,
        monto: l.montoImputado,
      })),
    },
  });

  return grupoId;
}

export const matchingService = {
  async ejecutarMatching(
    empresaId: string,
    userId: string,
    input: EjecutarMatchingInput
  ): Promise<ResultadoEjecucionMatchingV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');

    const parsed = ejecutarMatchingSchema.parse(input);
    resolverRangoPeriodo(parsed.periodo);

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const inicioMs = Date.now();

      await bloquearCuentaFinancieraEnTx(client, empresaId, parsed.cuentaFinancieraId);

      const cuenta = await obtenerCuentaBancariaEnTx(client, empresaId, parsed.cuentaFinancieraId);
      validarPrecondicionOperacionCuenta(cuenta.cuentaContableId);

      const periodoId = await resolverPeriodoIdEnTx(client, empresaId, parsed.periodo);
      await verificarPeriodoNoCerradoEnTx(
        client,
        empresaId,
        parsed.cuentaFinancieraId,
        parsed.periodo
      );

      const config = await obtenerConfigEnTx(client, empresaId);

      if (parsed.limpiarSugerenciasPrevias !== false) {
        const prevSugRes = await client.query<{ id: string }>(
          `SELECT id
           FROM conciliacion_grupo
           WHERE empresa_id = $1
             AND cuenta_financiera_id = $2
             AND periodo_id = $3
             AND estado = 'SUGERIDO'
           ORDER BY id ASC
           FOR UPDATE`,
          [empresaId, parsed.cuentaFinancieraId, periodoId]
        );

        if (prevSugRes.rows.length > 0) {
          const prevIds = ordenarUuidsUnicos(prevSugRes.rows.map((r) => r.id));
          const prevLineasRes = await client.query<{ extractoLineaId: string }>(
            `SELECT DISTINCT extracto_linea_id AS "extractoLineaId"
             FROM conciliacion_item
             WHERE empresa_id = $1
               AND grupo_id = ANY($2::uuid[])
               AND lado = 'BANCO'
               AND extracto_linea_id IS NOT NULL`,
            [empresaId, prevIds]
          );

          await client.query(
            `UPDATE conciliacion_grupo
             SET estado = 'RECHAZADO',
                 observacion = CASE
                   WHEN observacion IS NULL OR observacion = '' THEN 'Reemplazado por nueva ejecución de matching.'
                   ELSE observacion || ' [Reemplazado por nueva ejecución]'
                 END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
            [empresaId, prevIds]
          );

          await restaurarLineasExtractoDeSugeridosEnTx(
            client,
            empresaId,
            ordenarUuidsUnicos(prevLineasRes.rows.map((r) => r.extractoLineaId))
          );

          for (const prevId of prevIds) {
            await registrarAuditoriaEnTx(client, {
              empresaId,
              usuarioId: userId,
              tablaAfectada: 'conciliacion_grupo',
              registroId: prevId,
              accion: 'UPDATE',
              datosAnteriores: { estado: 'SUGERIDO' },
              datosNuevos: {
                estado: 'RECHAZADO',
                motivo: 'Limpieza previa a nueva ejecución de matching',
              },
            });
          }
        }
      }

      const resumen = await obtenerResumenConciliacionEnTx(
        client,
        empresaId,
        parsed.cuentaFinancieraId,
        parsed.periodo
      );

      const partidasBanco: PartidaBancoMatching[] = resumen.extractoLineas
        .filter(
          (l) =>
            !l.conciliada &&
            l.estadoConciliacion !== 'DUPLICADO' &&
            !l.grupoConciliacionId
        )
        .map((l) => ({
          id: l.id,
          fecha: l.fecha,
          monto: l.monto,
          referencia: l.referencia,
          descripcion: l.descripcion,
          rucExtraido: l.rucExtraido ?? null,
          contraparteExtraida: l.contraparteExtraida ?? null,
          docExtraido: l.docExtraido ?? null,
        }));

      const partidasLibroCombinadas = [
        ...resumen.movimientosLibros,
        ...(resumen.asientosManualesLibros ?? []),
      ];

      const partidasLibro: PartidaLibroMatching[] = partidasLibroCombinadas
        .filter((m) => !m.conciliado && !m.grupoConciliacionId)
        .map((m) => ({
          id: m.id,
          origenLibro: m.origen ?? 'MOVIMIENTO_TESORERIA',
          asientoId: m.asientoId,
          asientoDetalleId: m.asientoDetalleId ?? null,
          fecha: m.fecha,
          importeConSigno: m.importeConSigno,
          numeroOperacion: m.numeroOperacion,
          glosa: m.glosa,
          anexoId: m.anexoId ?? null,
          anexoNombre: m.anexoNombre ?? null,
          anexoRuc: m.anexoRuc ?? null,
          docRef: m.docRef ?? null,
        }));

      const reglasAprendidas = await listarReglasAprendidasEnTx(client, empresaId, true);

      const toleranciaDias = parsed.toleranciaDias ?? config.toleranciaDias;
      const toleranciaMonto =
        parsed.toleranciaMonto !== undefined
          ? Money.format(parsed.toleranciaMonto)
          : config.toleranciaMonto;
      const umbralAutoMatch = parsed.umbralAutoMatch ?? config.umbralAutoMatch ?? 0.9;

      const resultadoMotor = ejecutarMotorMatching({
        partidasBanco,
        partidasLibro,
        reglasAprendidas,
        parametros: {
          toleranciaDias,
          toleranciaMonto,
          umbralAutoMatch,
        },
      });

      const grupoIdsCreados: string[] = [];
      for (const candidato of resultadoMotor.grupos) {
        const gid = await persistirGrupoCandidatoEnTx(client, {
          empresaId,
          userId,
          cuentaFinancieraId: parsed.cuentaFinancieraId,
          periodoId,
          grupo: candidato,
        });
        grupoIdsCreados.push(gid);
      }

      const gruposCreados = await cargarGruposConItemsEnTx(client, empresaId, grupoIdsCreados);
      const duracionMs = Math.max(0, Date.now() - inicioMs);

      return {
        cuentaFinancieraId: parsed.cuentaFinancieraId,
        periodo: parsed.periodo,
        autoConciliados: resultadoMotor.estadisticas.autoConciliados,
        sugeridos: resultadoMotor.estadisticas.sugeridos,
        diferenciaPendiente: resultadoMotor.estadisticas.diferenciaPendiente,
        gruposCreados,
        duracionMs,
      };
    });
  },

  async listarGrupos(
    empresaId: string,
    cuentaFinancieraId: string,
    periodo: string,
    estado?: string
  ): Promise<GrupoConciliacionV2[]> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(cuentaFinancieraId, 'cuentaFinancieraId');
    resolverRangoPeriodo(periodo);

    if (estado !== undefined && estado !== '' && !ESTADOS_GRUPO_VALIDOS.has(estado as EstadoGrupoConciliacionV2)) {
      throw new ConciliacionV2Error(
        400,
        'ESTADO_GRUPO_INVALIDO',
        `El estado de grupo "${estado}" no es válido.`
      );
    }

    return db.withEmpresaTransaction(empresaId, async (client) => {
      await obtenerCuentaBancariaEnTx(client, empresaId, cuentaFinancieraId);

      const idsRes = await client.query<{ id: string }>(
        `SELECT cg.id
         FROM conciliacion_grupo cg
         JOIN periodos p
           ON p.id = cg.periodo_id
          AND p.empresa_id = cg.empresa_id
         WHERE cg.empresa_id = $1
           AND cg.cuenta_financiera_id = $2
           AND p.codigo_periodo = $3
           AND ($4::varchar IS NULL OR cg.estado = $4)
         ORDER BY cg.created_at DESC, cg.id ASC`,
        [empresaId, cuentaFinancieraId, periodo, estado && estado.length > 0 ? estado : null]
      );

      return cargarGruposConItemsEnTx(
        client,
        empresaId,
        idsRes.rows.map((r) => r.id)
      );
    });
  },

  async aceptarSugerencias(
    empresaId: string,
    userId: string,
    input: AceptarSugerenciasInput
  ): Promise<GrupoConciliacionV2[]> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');

    const parsed = aceptarSugerenciasSchema.parse(input);
    const grupoIdsUnicos = ordenarUuidsUnicos(parsed.grupoIds);

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const cuentasRes = await client.query<{ cuentaFinancieraId: string }>(
        `SELECT DISTINCT cg.cuenta_financiera_id AS "cuentaFinancieraId"
         FROM conciliacion_grupo cg
         WHERE cg.empresa_id = $1
           AND cg.id = ANY($2::uuid[])
         ORDER BY cg.cuenta_financiera_id ASC`,
        [empresaId, grupoIdsUnicos]
      );

      if (cuentasRes.rows.length > 0) {
        const cuentaIdsOrdenadas = cuentasRes.rows.map((r) => r.cuentaFinancieraId);
        await client.query(
          `SELECT id
           FROM cuentas_financieras
           WHERE empresa_id = $1
             AND id = ANY($2::uuid[])
           ORDER BY id ASC
           FOR UPDATE`,
          [empresaId, cuentaIdsOrdenadas]
        );
      }

      const config = await obtenerConfigEnTx(client, empresaId);
      const toleranciaDec = Money.round(config.toleranciaMonto);

      const gruposRes = await client.query<{
        id: string;
        cuentaFinancieraId: string;
        periodoId: string;
        codigoPeriodo: string;
        estado: string;
        observacion: string | null;
        cuentaContableId: string | null;
      }>(
        `SELECT cg.id,
                cg.cuenta_financiera_id AS "cuentaFinancieraId",
                cg.periodo_id AS "periodoId",
                p.codigo_periodo AS "codigoPeriodo",
                cg.estado,
                cg.observacion,
                cf.cuenta_contable_id AS "cuentaContableId"
         FROM conciliacion_grupo cg
         JOIN periodos p
           ON p.id = cg.periodo_id
          AND p.empresa_id = cg.empresa_id
         JOIN cuentas_financieras cf
           ON cf.id = cg.cuenta_financiera_id
          AND cf.empresa_id = cg.empresa_id
         WHERE cg.empresa_id = $1
           AND cg.id = ANY($2::uuid[])
         ORDER BY cg.id ASC
         FOR UPDATE OF cg`,
        [empresaId, grupoIdsUnicos]
      );

      const mapaGrupos = new Map(gruposRes.rows.map((r) => [r.id, r]));
      for (const gid of grupoIdsUnicos) {
        const g = mapaGrupos.get(gid);
        if (!g) {
          throw new ConciliacionV2Error(
            404,
            'GRUPO_CONCILIACION_NO_ENCONTRADO',
            `El grupo de conciliación ${gid} no existe para esta empresa.`
          );
        }
        if (g.estado !== 'SUGERIDO') {
          throw new ConciliacionV2Error(
            409,
            'ESTADO_GRUPO_INVALIDO',
            `El grupo ${gid} está en estado ${g.estado}; solo se pueden aceptar grupos en estado SUGERIDO.`
          );
        }
        validarPrecondicionOperacionCuenta(g.cuentaContableId);
        await verificarPeriodoNoCerradoEnTx(
          client,
          empresaId,
          g.cuentaFinancieraId,
          g.codigoPeriodo
        );
      }

      for (const gid of grupoIdsUnicos) {
        const g = mapaGrupos.get(gid)!;
        const itemsRes = await client.query<{
          lado: 'BANCO' | 'LIBRO';
          origenLibro: OrigenPartidaLibroV2 | null;
          extractoLineaId: string | null;
          movimientoTesoreriaId: string | null;
          asientoId: string | null;
          asientoDetalleId: string | null;
        }>(
          `SELECT lado,
                  origen_libro AS "origenLibro",
                  extracto_linea_id AS "extractoLineaId",
                  movimiento_tesoreria_id AS "movimientoTesoreriaId",
                  asiento_id AS "asientoId",
                  asiento_detalle_id AS "asientoDetalleId"
           FROM conciliacion_item
           WHERE empresa_id = $1 AND grupo_id = $2
           ORDER BY created_at ASC, id ASC`,
          [empresaId, gid]
        );

        const bancoIds = ordenarUuidsUnicos(
          itemsRes.rows
            .filter((r) => r.lado === 'BANCO' && r.extractoLineaId)
            .map((r) => r.extractoLineaId as string)
        );
        const movIds = ordenarUuidsUnicos(
          itemsRes.rows
            .filter((r) => r.lado === 'LIBRO' && r.origenLibro === 'MOVIMIENTO_TESORERIA' && r.movimientoTesoreriaId)
            .map((r) => r.movimientoTesoreriaId as string)
        );
        const asientoDetIds = ordenarUuidsUnicos(
          itemsRes.rows
            .filter((r) => r.lado === 'LIBRO' && r.origenLibro === 'ASIENTO_MANUAL' && r.asientoDetalleId)
            .map((r) => r.asientoDetalleId as string)
        );

        if (bancoIds.length === 0 || movIds.length + asientoDetIds.length === 0) {
          throw new ConciliacionV2Error(
            409,
            'GRUPO_SIN_ITEMS_VALIDOS',
            `El grupo sugerido ${gid} no contiene partidas válidas en ambos lados.`
          );
        }

        const lineasRes = await client.query<{
          id: string;
          fecha: string;
          monto: string;
          conciliada: boolean;
          estadoConciliacion: string;
          extractoEstado: string;
        }>(
          `SELECT el.id,
                  el.fecha::text AS fecha,
                  el.monto::text AS monto,
                  el.conciliada,
                  el.estado_conciliacion AS "estadoConciliacion",
                  eb.estado AS "extractoEstado"
           FROM extracto_lineas el
           JOIN extractos_bancarios eb
             ON eb.id = el.extracto_id
            AND eb.empresa_id = el.empresa_id
           WHERE el.empresa_id = $1 AND el.id = ANY($2::uuid[])
           ORDER BY el.id ASC
           FOR UPDATE OF el`,
          [empresaId, bancoIds]
        );

        if (lineasRes.rows.length !== bancoIds.length) {
          throw new ConciliacionV2Error(
            404,
            'PARTIDA_EXTRACTO_NO_ENCONTRADA',
            'Una o más líneas del extracto del grupo sugerido ya no existen.'
          );
        }

        let sumaBancoDec = Money.create(0);
        for (const l of lineasRes.rows) {
          if (l.extractoEstado === 'ANULADO') {
            throw new ConciliacionV2Error(409, 'EXTRACTO_ANULADO', 'El extracto bancario está anulado.');
          }
          if (l.conciliada || l.estadoConciliacion === 'DUPLICADO') {
            throw new ConciliacionV2Error(
              409,
              'PARTIDA_YA_CONCILIADA',
              `La línea de extracto ${l.id} ya fue conciliada o marcada como duplicada.`
            );
          }
          const perLinea = l.fecha.slice(0, 7);
          if (perLinea !== g.codigoPeriodo) {
            await verificarPeriodoNoCerradoEnTx(client, empresaId, g.cuentaFinancieraId, perLinea);
          }
          sumaBancoDec = Money.add(sumaBancoDec, l.monto);
        }

        let sumaLibroDec = Money.create(0);
        if (movIds.length > 0) {
          const movsRes = await client.query<{
            id: string;
            fecha: string;
            tipo: string;
            importe: string;
            estado: string;
            conciliado: boolean;
          }>(
            `SELECT id,
                    fecha::text AS fecha,
                    tipo,
                    importe::text AS importe,
                    estado,
                    conciliado
             FROM movimientos_tesoreria
             WHERE empresa_id = $1 AND id = ANY($2::uuid[])
             ORDER BY id ASC
             FOR UPDATE`,
            [empresaId, movIds]
          );

          if (movsRes.rows.length !== movIds.length) {
            throw new ConciliacionV2Error(
              404,
              'MOVIMIENTO_TESORERIA_NO_ENCONTRADO',
              'Uno o más movimientos de tesorería del grupo sugerido ya no existen.'
            );
          }

          for (const m of movsRes.rows) {
            if (m.estado !== 'REGISTRADO') {
              throw new ConciliacionV2Error(
                409,
                'MOVIMIENTO_NO_REGISTRADO',
                `El movimiento ${m.id} no está en estado REGISTRADO.`
              );
            }
            if (m.conciliado) {
              throw new ConciliacionV2Error(
                409,
                'MOVIMIENTO_YA_CONCILIADO',
                `El movimiento de tesorería ${m.id} ya se encuentra conciliado.`
              );
            }
            const perMov = m.fecha.slice(0, 7);
            if (perMov !== g.codigoPeriodo) {
              await verificarPeriodoNoCerradoEnTx(client, empresaId, g.cuentaFinancieraId, perMov);
            }
            const imp = Money.round(m.importe);
            sumaLibroDec = Money.add(sumaLibroDec, m.tipo === 'INGRESO' ? imp : imp.negated());
          }
        }

        if (asientoDetIds.length > 0) {
          const detsRes = await client.query<{
            id: string;
            fecha: string;
            debe: string;
            haber: string;
            estado: string;
            yaConciliado: boolean;
          }>(
            `SELECT ad.id,
                    a.fecha::text AS fecha,
                    ad.debe::text AS debe,
                    ad.haber::text AS haber,
                    a.estado,
                    EXISTS (
                      SELECT 1
                      FROM conciliacion_item ci2
                      JOIN conciliacion_grupo cg2
                        ON cg2.id = ci2.grupo_id
                       AND cg2.empresa_id = ci2.empresa_id
                      WHERE ci2.empresa_id = ad.empresa_id
                        AND ci2.lado = 'LIBRO'
                        AND ci2.origen_libro = 'ASIENTO_MANUAL'
                        AND ci2.asiento_detalle_id = ad.id
                        AND cg2.estado IN ('CONCILIADO', 'CONCILIADO_MANUAL')
                        AND cg2.id <> $3
                    ) AS "yaConciliado"
             FROM asiento_detalle ad
             JOIN asientos a
               ON a.id = ad.asiento_id
              AND a.empresa_id = ad.empresa_id
             WHERE ad.empresa_id = $1 AND ad.id = ANY($2::uuid[])
             ORDER BY ad.id ASC
             FOR UPDATE OF ad`,
            [empresaId, asientoDetIds, gid]
          );

          if (detsRes.rows.length !== asientoDetIds.length) {
            throw new ConciliacionV2Error(
              404,
              'ASIENTO_MANUAL_NO_ENCONTRADO',
              'Una o más líneas de asiento manual del grupo sugerido ya no existen.'
            );
          }

          for (const d of detsRes.rows) {
            if (d.estado !== 'CONTABILIZADO') {
              throw new ConciliacionV2Error(
                409,
                'ASIENTO_NO_CONTABILIZADO',
                `El asiento manual de detalle ${d.id} no está en estado CONTABILIZADO.`
              );
            }
            if (d.yaConciliado) {
              throw new ConciliacionV2Error(
                409,
                'ASIENTO_MANUAL_YA_CONCILIADO',
                `El asiento manual ${d.id} ya está conciliado en otro grupo.`
              );
            }
            const perDet = d.fecha.slice(0, 7);
            if (perDet !== g.codigoPeriodo) {
              await verificarPeriodoNoCerradoEnTx(client, empresaId, g.cuentaFinancieraId, perDet);
            }
            const debeDec = Money.round(d.debe);
            const haberDec = Money.round(d.haber);
            const signedDec = debeDec.gt(0) ? debeDec : haberDec.negated();
            sumaLibroDec = Money.add(sumaLibroDec, signedDec);
          }
        }

        const difDec = Money.sub(sumaBancoDec, sumaLibroDec);
        if (difDec.abs().gt(toleranciaDec)) {
          throw new ConciliacionV2Error(
            409,
            'DIFERENCIA_EXCEDE_TOLERANCIA',
            `La diferencia (${Money.format(difDec)}) excede la tolerancia permitida (${config.toleranciaMonto}).`
          );
        }

        const diferenciaFormateada = Money.format(difDec);

        await client.query(
          `UPDATE conciliacion_grupo
           SET estado = 'CONCILIADO',
               diferencia_monto = $1,
               confirmado_por = $2,
               confirmado_en = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE empresa_id = $3 AND id = $4`,
          [diferenciaFormateada, userId, empresaId, gid]
        );

        await aplicarConfirmacionConciliacionEnTx(client, {
          empresaId,
          estadoDestino: 'CONCILIADO',
          diferenciaMonto: diferenciaFormateada,
          observacion: g.observacion,
          itemsBanco: bancoIds.map((id) => ({ extractoLineaId: id })),
          itemsLibro: itemsRes.rows
            .filter((r) => r.lado === 'LIBRO')
            .map((r) => ({
              origenLibro: (r.origenLibro ?? 'MOVIMIENTO_TESORERIA') as OrigenPartidaLibroV2,
              movimientoTesoreriaId: r.movimientoTesoreriaId,
            })),
        });

        await rechazarSugerenciasSuperpuestasEnTx(
          client,
          empresaId,
          userId,
          gid,
          bancoIds,
          movIds,
          asientoDetIds,
          'Superpuesto por aceptación de sugerencia'
        );

        await registrarAuditoriaEnTx(client, {
          empresaId,
          usuarioId: userId,
          tablaAfectada: 'conciliacion_grupo',
          registroId: gid,
          accion: 'UPDATE',
          datosAnteriores: { estado: 'SUGERIDO' },
          datosNuevos: {
            estado: 'CONCILIADO',
            diferenciaMonto: diferenciaFormateada,
            confirmadoPor: userId,
          },
        });
      }

      return cargarGruposConItemsEnTx(client, empresaId, grupoIdsUnicos);
    });
  },

  async rechazarSugerencia(
    empresaId: string,
    userId: string,
    grupoId: string,
    motivo?: string | null
  ): Promise<GrupoConciliacionV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');
    asegurarUuid(grupoId, 'grupoId');

    const parsed = rechazarSugerenciaSchema.parse({ motivo });

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const grupoCuentaRes = await client.query<{ cuentaFinancieraId: string }>(
        `SELECT cuenta_financiera_id AS "cuentaFinancieraId"
         FROM conciliacion_grupo
         WHERE empresa_id = $1 AND id = $2`,
        [empresaId, grupoId]
      );

      if (grupoCuentaRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'GRUPO_CONCILIACION_NO_ENCONTRADO',
          'El grupo de conciliación indicado no existe para esta empresa.'
        );
      }

      await bloquearCuentaFinancieraEnTx(
        client,
        empresaId,
        grupoCuentaRes.rows[0].cuentaFinancieraId
      );

      const grupoRes = await client.query<{
        id: string;
        cuentaFinancieraId: string;
        codigoPeriodo: string;
        estado: string;
        observacion: string | null;
        cuentaContableId: string | null;
      }>(
        `SELECT cg.id,
                cg.cuenta_financiera_id AS "cuentaFinancieraId",
                p.codigo_periodo AS "codigoPeriodo",
                cg.estado,
                cg.observacion,
                cf.cuenta_contable_id AS "cuentaContableId"
         FROM conciliacion_grupo cg
         JOIN periodos p
           ON p.id = cg.periodo_id
          AND p.empresa_id = cg.empresa_id
         JOIN cuentas_financieras cf
           ON cf.id = cg.cuenta_financiera_id
          AND cf.empresa_id = cg.empresa_id
         WHERE cg.empresa_id = $1 AND cg.id = $2
         FOR UPDATE OF cg`,
        [empresaId, grupoId]
      );

      if (grupoRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'GRUPO_CONCILIACION_NO_ENCONTRADO',
          'El grupo de conciliación indicado no existe para esta empresa.'
        );
      }

      const g = grupoRes.rows[0];
      validarPrecondicionOperacionCuenta(g.cuentaContableId);
      await verificarPeriodoNoCerradoEnTx(
        client,
        empresaId,
        g.cuentaFinancieraId,
        g.codigoPeriodo
      );

      if (g.estado !== 'SUGERIDO') {
        throw new ConciliacionV2Error(
          409,
          'ESTADO_GRUPO_INVALIDO',
          `Solo se pueden rechazar grupos en estado SUGERIDO (estado actual: ${g.estado}).`
        );
      }

      const itemsRes = await client.query<{ extractoLineaId: string }>(
        `SELECT extracto_linea_id AS "extractoLineaId"
         FROM conciliacion_item
         WHERE empresa_id = $1
           AND grupo_id = $2
           AND lado = 'BANCO'
           AND extracto_linea_id IS NOT NULL`,
        [empresaId, grupoId]
      );

      const nuevaObs = parsed.motivo
        ? g.observacion
          ? `${g.observacion} [Rechazado: ${parsed.motivo}]`
          : `Rechazado: ${parsed.motivo}`
        : g.observacion;

      await client.query(
        `UPDATE conciliacion_grupo
         SET estado = 'RECHAZADO',
             observacion = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE empresa_id = $2 AND id = $3`,
        [nuevaObs ?? null, empresaId, grupoId]
      );

      await restaurarLineasExtractoDeSugeridosEnTx(
        client,
        empresaId,
        itemsRes.rows.map((r) => r.extractoLineaId)
      );

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'conciliacion_grupo',
        registroId: grupoId,
        accion: 'UPDATE',
        datosAnteriores: { estado: 'SUGERIDO', observacion: g.observacion },
        datosNuevos: {
          estado: 'RECHAZADO',
          observacion: nuevaObs ?? null,
          motivo: parsed.motivo ?? null,
        },
      });

      const [grupoActualizado] = await cargarGruposConItemsEnTx(client, empresaId, [grupoId]);
      return grupoActualizado;
    });
  },

  async conciliarManualGrupo(
    empresaId: string,
    userId: string,
    input: ConciliarManualGrupoInput,
    actorRol?: string
  ): Promise<GrupoConciliacionV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');

    const parsed = conciliarManualGrupoSchema.parse(input);
    if (
      parsed.aprenderRegla &&
      actorRol !== undefined &&
      !['ADMINISTRADOR', 'CONTADOR_SENIOR'].includes(actorRol)
    ) {
      throw new ConciliacionV2Error(
        403,
        'PERMISO_INSUFICIENTE',
        'Solo ADMINISTRADOR o CONTADOR_SENIOR pueden guardar reglas aprendidas.'
      );
    }
    resolverRangoPeriodo(parsed.periodo);

    const bancoIdsUnicos = ordenarUuidsUnicos(parsed.extractoLineaIds);
    if (bancoIdsUnicos.length !== parsed.extractoLineaIds.length) {
      throw new ConciliacionV2Error(
        400,
        'ITEMS_DUPLICADOS',
        'extractoLineaIds contiene identificadores duplicados.'
      );
    }

    const libroKeysSet = new Set<string>();
    for (const item of parsed.libroItems) {
      const k = `${item.origenLibro}:${item.id}`;
      if (libroKeysSet.has(k)) {
        throw new ConciliacionV2Error(
          400,
          'ITEMS_DUPLICADOS',
          'libroItems contiene partidas duplicadas.'
        );
      }
      libroKeysSet.add(k);
    }

    return db.withEmpresaTransaction(empresaId, async (client) => {
      await bloquearCuentaFinancieraEnTx(client, empresaId, parsed.cuentaFinancieraId);

      const cuenta = await obtenerCuentaBancariaEnTx(client, empresaId, parsed.cuentaFinancieraId);
      validarPrecondicionOperacionCuenta(cuenta.cuentaContableId);

      const periodoId = await resolverPeriodoIdEnTx(client, empresaId, parsed.periodo);
      await verificarPeriodoNoCerradoEnTx(
        client,
        empresaId,
        parsed.cuentaFinancieraId,
        parsed.periodo
      );

      const config = await obtenerConfigEnTx(client, empresaId);
      const toleranciaDec = Money.round(config.toleranciaMonto);

      // 1. Validar y bloquear líneas de extracto bancario
      const lineasRes = await client.query<{
        id: string;
        fecha: string;
        monto: string;
        conciliada: boolean;
        estadoConciliacion: string;
        cuentaFinancieraId: string;
        extractoEstado: string;
        yaConciliadaGrupo: boolean;
      }>(
        `SELECT el.id,
                el.fecha::text AS fecha,
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
         WHERE el.empresa_id = $1 AND el.id = ANY($2::uuid[])
         ORDER BY el.id ASC
         FOR UPDATE OF el`,
        [empresaId, bancoIdsUnicos]
      );

      if (lineasRes.rows.length !== bancoIdsUnicos.length) {
        throw new ConciliacionV2Error(
          404,
          'PARTIDA_EXTRACTO_NO_ENCONTRADA',
          'Una o más líneas del extracto bancario no existen para esta empresa.'
        );
      }

      const mapaLineas = new Map(lineasRes.rows.map((r) => [r.id, r]));
      let sumaBancoDec = Money.create(0);
      for (const bid of bancoIdsUnicos) {
        const l = mapaLineas.get(bid)!;
        if (l.cuentaFinancieraId !== parsed.cuentaFinancieraId) {
          throw new ConciliacionV2Error(
            409,
            'CUENTA_FINANCIERA_INCOMPATIBLE',
            `La línea de extracto ${bid} pertenece a otra cuenta financiera.`
          );
        }
        if (l.extractoEstado === 'ANULADO') {
          throw new ConciliacionV2Error(
            409,
            'EXTRACTO_ANULADO',
            'No se puede conciliar una línea de un extracto anulado.'
          );
        }
        if (l.conciliada || l.yaConciliadaGrupo) {
          throw new ConciliacionV2Error(
            409,
            'PARTIDA_YA_CONCILIADA',
            `La línea de extracto ${bid} ya se encuentra conciliada.`
          );
        }
        if (l.estadoConciliacion === 'DUPLICADO') {
          throw new ConciliacionV2Error(
            409,
            'PARTIDA_DUPLICADA',
            `La línea de extracto ${bid} está marcada como DUPLICADO.`
          );
        }
        const perLinea = l.fecha.slice(0, 7);
        if (perLinea !== parsed.periodo) {
          await verificarPeriodoNoCerradoEnTx(
            client,
            empresaId,
            parsed.cuentaFinancieraId,
            perLinea
          );
        }
        sumaBancoDec = Money.add(sumaBancoDec, l.monto);
      }

      // 2. Validar y bloquear partidas de libro (MOVIMIENTO_TESORERIA y ASIENTO_MANUAL)
      const movIds = ordenarUuidsUnicos(
        parsed.libroItems
          .filter((i) => i.origenLibro === 'MOVIMIENTO_TESORERIA')
          .map((i) => i.id)
      );
      const asientoDetIds = ordenarUuidsUnicos(
        parsed.libroItems
          .filter((i) => i.origenLibro === 'ASIENTO_MANUAL')
          .map((i) => i.id)
      );

      const mapaMovs = new Map<
        string,
        { id: string; asientoId: string | null; montoSigned: string }
      >();
      if (movIds.length > 0) {
        const movsRes = await client.query<{
          id: string;
          cuentaFinancieraId: string;
          fecha: string;
          tipo: string;
          importe: string;
          estado: string;
          conciliado: boolean;
          asientoId: string | null;
          yaConciliadoGrupo: boolean;
        }>(
          `SELECT mt.id,
                  mt.cuenta_financiera_id AS "cuentaFinancieraId",
                  mt.fecha::text AS fecha,
                  mt.tipo,
                  mt.importe::text AS importe,
                  mt.estado,
                  mt.conciliado,
                  mt.asiento_id AS "asientoId",
                  EXISTS (
                    SELECT 1
                    FROM conciliacion_item ci
                    JOIN conciliacion_grupo cg
                      ON cg.id = ci.grupo_id
                     AND cg.empresa_id = ci.empresa_id
                    WHERE ci.empresa_id = mt.empresa_id
                      AND ci.lado = 'LIBRO'
                      AND ci.origen_libro = 'MOVIMIENTO_TESORERIA'
                      AND ci.movimiento_tesoreria_id = mt.id
                      AND cg.estado IN ('CONCILIADO', 'CONCILIADO_MANUAL')
                  ) AS "yaConciliadoGrupo"
           FROM movimientos_tesoreria mt
           WHERE mt.empresa_id = $1 AND mt.id = ANY($2::uuid[])
           ORDER BY mt.id ASC
           FOR UPDATE OF mt`,
          [empresaId, movIds]
        );

        if (movsRes.rows.length !== movIds.length) {
          throw new ConciliacionV2Error(
            404,
            'MOVIMIENTO_TESORERIA_NO_ENCONTRADO',
            'Uno o más movimientos de tesorería no existen para esta empresa.'
          );
        }

        for (const m of movsRes.rows) {
          if (m.cuentaFinancieraId !== parsed.cuentaFinancieraId) {
            throw new ConciliacionV2Error(
              409,
              'CUENTA_FINANCIERA_INCOMPATIBLE',
              `El movimiento de tesorería ${m.id} pertenece a otra cuenta financiera.`
            );
          }
          if (m.estado !== 'REGISTRADO') {
            throw new ConciliacionV2Error(
              409,
              'MOVIMIENTO_NO_REGISTRADO',
              `El movimiento de tesorería ${m.id} no está en estado REGISTRADO.`
            );
          }
          if (m.conciliado || m.yaConciliadoGrupo) {
            throw new ConciliacionV2Error(
              409,
              'MOVIMIENTO_YA_CONCILIADO',
              `El movimiento de tesorería ${m.id} ya se encuentra conciliado.`
            );
          }
          const perMov = m.fecha.slice(0, 7);
          if (perMov !== parsed.periodo) {
            await verificarPeriodoNoCerradoEnTx(
              client,
              empresaId,
              parsed.cuentaFinancieraId,
              perMov
            );
          }
          const impDec = Money.round(m.importe);
          const signedDec = m.tipo === 'INGRESO' ? impDec : impDec.negated();
          mapaMovs.set(m.id, {
            id: m.id,
            asientoId: m.asientoId ?? null,
            montoSigned: Money.format(signedDec),
          });
        }
      }

      const mapaAsientosDet = new Map<
        string,
        { id: string; asientoId: string; montoSigned: string }
      >();
      if (asientoDetIds.length > 0) {
        const detsRes = await client.query<{
          id: string;
          asientoId: string;
          cuentaId: string;
          fecha: string;
          debe: string;
          haber: string;
          estado: string;
          tieneMovimientoTesoreria: boolean;
          yaConciliadoGrupo: boolean;
        }>(
          `SELECT ad.id,
                  ad.asiento_id AS "asientoId",
                  ad.cuenta_id AS "cuentaId",
                  a.fecha::text AS fecha,
                  ad.debe::text AS debe,
                  ad.haber::text AS haber,
                  a.estado,
                  EXISTS (
                    SELECT 1
                    FROM movimientos_tesoreria mt
                    WHERE mt.empresa_id = a.empresa_id
                      AND mt.asiento_id = a.id
                      AND mt.estado <> 'ANULADO'
                  ) AS "tieneMovimientoTesoreria",
                  EXISTS (
                    SELECT 1
                    FROM conciliacion_item ci
                    JOIN conciliacion_grupo cg
                      ON cg.id = ci.grupo_id
                     AND cg.empresa_id = ci.empresa_id
                    WHERE ci.empresa_id = ad.empresa_id
                      AND ci.lado = 'LIBRO'
                      AND ci.origen_libro = 'ASIENTO_MANUAL'
                      AND ci.asiento_detalle_id = ad.id
                      AND cg.estado IN ('CONCILIADO', 'CONCILIADO_MANUAL')
                  ) AS "yaConciliadoGrupo"
           FROM asiento_detalle ad
           JOIN asientos a
             ON a.id = ad.asiento_id
            AND a.empresa_id = ad.empresa_id
           WHERE ad.empresa_id = $1 AND ad.id = ANY($2::uuid[])
           ORDER BY ad.id ASC
           FOR UPDATE OF ad`,
          [empresaId, asientoDetIds]
        );

        if (detsRes.rows.length !== asientoDetIds.length) {
          throw new ConciliacionV2Error(
            404,
            'ASIENTO_MANUAL_NO_ENCONTRADO',
            'Una o más líneas de asiento manual no existen para esta empresa.'
          );
        }

        for (const d of detsRes.rows) {
          if (d.cuentaId !== cuenta.cuentaContableId) {
            throw new ConciliacionV2Error(
              409,
              'CUENTA_CONTABLE_INCOMPATIBLE',
              `El asiento manual ${d.id} no corresponde a la cuenta contable vinculada a la cuenta bancaria.`
            );
          }
          if (d.estado !== 'CONTABILIZADO') {
            throw new ConciliacionV2Error(
              409,
              'ASIENTO_NO_CONTABILIZADO',
              `El asiento manual ${d.id} no está en estado CONTABILIZADO.`
            );
          }
          if (d.tieneMovimientoTesoreria) {
            throw new ConciliacionV2Error(
              409,
              'ASIENTO_TIENE_TESORERIA',
              `El asiento ${d.asientoId} tiene un movimiento de tesorería asociado; concilie el movimiento de tesorería correspondiente.`
            );
          }
          if (d.yaConciliadoGrupo) {
            throw new ConciliacionV2Error(
              409,
              'ASIENTO_MANUAL_YA_CONCILIADO',
              `El asiento manual ${d.id} ya se encuentra conciliado.`
            );
          }
          const perDet = d.fecha.slice(0, 7);
          if (perDet !== parsed.periodo) {
            await verificarPeriodoNoCerradoEnTx(
              client,
              empresaId,
              parsed.cuentaFinancieraId,
              perDet
            );
          }
          const debeDec = Money.round(d.debe);
          const haberDec = Money.round(d.haber);
          if (debeDec.lte(0) && haberDec.lte(0)) {
            throw new ConciliacionV2Error(
              409,
              'ASIENTO_IMPORTE_CERO',
              `La línea de asiento manual ${d.id} tiene importe cero.`
            );
          }
          const signedDec = debeDec.gt(0) ? debeDec : haberDec.negated();
          mapaAsientosDet.set(d.id, {
            id: d.id,
            asientoId: d.asientoId,
            montoSigned: Money.format(signedDec),
          });
        }
      }

      let sumaLibroDec = Money.create(0);
      for (const item of parsed.libroItems) {
        const montoStr =
          item.origenLibro === 'MOVIMIENTO_TESORERIA'
            ? mapaMovs.get(item.id)!.montoSigned
            : mapaAsientosDet.get(item.id)!.montoSigned;
        sumaLibroDec = Money.add(sumaLibroDec, montoStr);
      }

      const diferenciaDec = Money.sub(sumaBancoDec, sumaLibroDec);
      if (diferenciaDec.abs().gt(toleranciaDec)) {
        throw new ConciliacionV2Error(
          409,
          'DIFERENCIA_EXCEDE_TOLERANCIA',
          `La diferencia entre banco y libros (${Money.format(diferenciaDec)}) excede la tolerancia configurada (${config.toleranciaMonto}).`
        );
      }

      const diferenciaFormateada = Money.format(diferenciaDec);
      const tipoMatch = calcularTipoMatch(bancoIdsUnicos.length, parsed.libroItems.length);
      const observacion =
        parsed.observacion?.trim() ||
        `Conciliación manual ${tipoMatch} con diferencia ${diferenciaFormateada}.`;

      const insGrupoRes = await client.query<{ id: string }>(
        `INSERT INTO conciliacion_grupo (
           empresa_id,
           cuenta_financiera_id,
           periodo_id,
           tipo_match,
           regla_aplicada,
           capa_matching,
           score,
           estado,
           diferencia_monto,
           observacion,
           usuario_id,
           confirmado_por,
           confirmado_en
         )
         VALUES ($1, $2, $3, $4, 'CONCILIACION_MANUAL', 0, 1.0000, 'CONCILIADO_MANUAL', $5, $6, $7, $7, CURRENT_TIMESTAMP)
         RETURNING id`,
        [
          empresaId,
          parsed.cuentaFinancieraId,
          periodoId,
          tipoMatch,
          diferenciaFormateada,
          observacion,
          userId,
        ]
      );

      const grupoId = insGrupoRes.rows[0].id;

      for (const bid of bancoIdsUnicos) {
        const l = mapaLineas.get(bid)!;
        await client.query(
          `INSERT INTO conciliacion_item (
             empresa_id,
             grupo_id,
             lado,
             origen_libro,
             extracto_linea_id,
             movimiento_tesoreria_id,
             asiento_id,
             asiento_detalle_id,
             monto_imputado
           )
           VALUES ($1, $2, 'BANCO', NULL, $3, NULL, NULL, NULL, $4)`,
          [empresaId, grupoId, bid, Money.format(l.monto)]
        );
      }

      for (const item of parsed.libroItems) {
        if (item.origenLibro === 'MOVIMIENTO_TESORERIA') {
          const m = mapaMovs.get(item.id)!;
          await client.query(
            `INSERT INTO conciliacion_item (
               empresa_id,
               grupo_id,
               lado,
               origen_libro,
               extracto_linea_id,
               movimiento_tesoreria_id,
               asiento_id,
               asiento_detalle_id,
               monto_imputado
             )
             VALUES ($1, $2, 'LIBRO', 'MOVIMIENTO_TESORERIA', NULL, $3, $4, NULL, $5)`,
            [empresaId, grupoId, m.id, m.asientoId, m.montoSigned]
          );
        } else {
          const d = mapaAsientosDet.get(item.id)!;
          await client.query(
            `INSERT INTO conciliacion_item (
               empresa_id,
               grupo_id,
               lado,
               origen_libro,
               extracto_linea_id,
               movimiento_tesoreria_id,
               asiento_id,
               asiento_detalle_id,
               monto_imputado
             )
             VALUES ($1, $2, 'LIBRO', 'ASIENTO_MANUAL', NULL, NULL, $3, $4, $5)`,
            [empresaId, grupoId, d.asientoId, d.id, d.montoSigned]
          );
        }
      }

      await aplicarConfirmacionConciliacionEnTx(client, {
        empresaId,
        estadoDestino: 'CONCILIADO_MANUAL',
        diferenciaMonto: diferenciaFormateada,
        observacion,
        itemsBanco: bancoIdsUnicos.map((id) => ({ extractoLineaId: id })),
        itemsLibro: parsed.libroItems.map((i) => ({
          origenLibro: i.origenLibro,
          movimientoTesoreriaId: i.origenLibro === 'MOVIMIENTO_TESORERIA' ? i.id : null,
        })),
      });

      await rechazarSugerenciasSuperpuestasEnTx(
        client,
        empresaId,
        userId,
        grupoId,
        bancoIdsUnicos,
        movIds,
        asientoDetIds,
        'Superpuesto por conciliación manual'
      );

      if (parsed.aprenderRegla) {
        const reglaIn = parsed.aprenderRegla;
        await validarReferenciasReglaAprendidaEnTx(
          client,
          empresaId,
          reglaIn.anexoId ?? null,
          reglaIn.cuentaContableId ?? null
        );

        const upsertRes = await client.query<{ id: string; usosConfirmados: number }>(
          `INSERT INTO conciliacion_reglas_aprendidas (
             empresa_id,
             patron_contraparte,
             ruc_contraparte,
             anexo_id,
             cuenta_contable_id,
             tipo_clasificacion,
             usos_confirmados,
             activo,
             created_by,
             updated_by
           )
           VALUES ($1, $2, $3, $4, $5, $6, 1, true, $7, $7)
           ON CONFLICT (empresa_id, patron_contraparte)
           DO UPDATE SET
             ruc_contraparte = COALESCE(EXCLUDED.ruc_contraparte, conciliacion_reglas_aprendidas.ruc_contraparte),
             anexo_id = COALESCE(EXCLUDED.anexo_id, conciliacion_reglas_aprendidas.anexo_id),
             cuenta_contable_id = COALESCE(EXCLUDED.cuenta_contable_id, conciliacion_reglas_aprendidas.cuenta_contable_id),
             tipo_clasificacion = COALESCE(EXCLUDED.tipo_clasificacion, conciliacion_reglas_aprendidas.tipo_clasificacion),
             usos_confirmados = conciliacion_reglas_aprendidas.usos_confirmados + 1,
             activo = true,
             updated_by = $7,
             updated_at = CURRENT_TIMESTAMP
           RETURNING id, usos_confirmados AS "usosConfirmados"`,
          [
            empresaId,
            reglaIn.patronContraparte,
            reglaIn.rucContraparte ?? null,
            reglaIn.anexoId ?? null,
            reglaIn.cuentaContableId ?? null,
            reglaIn.tipoClasificacion ?? null,
            userId,
          ]
        );

        await registrarAuditoriaEnTx(client, {
          empresaId,
          usuarioId: userId,
          tablaAfectada: 'conciliacion_reglas_aprendidas',
          registroId: upsertRes.rows[0].id,
          accion: upsertRes.rows[0].usosConfirmados === 1 ? 'INSERT' : 'UPDATE',
          datosNuevos: {
            patronContraparte: reglaIn.patronContraparte,
            rucContraparte: reglaIn.rucContraparte ?? null,
            anexoId: reglaIn.anexoId ?? null,
            cuentaContableId: reglaIn.cuentaContableId ?? null,
            tipoClasificacion: reglaIn.tipoClasificacion ?? null,
            usosConfirmados: upsertRes.rows[0].usosConfirmados,
          },
        });
      }

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'conciliacion_grupo',
        registroId: grupoId,
        accion: 'INSERT',
        datosNuevos: {
          cuentaFinancieraId: parsed.cuentaFinancieraId,
          periodo: parsed.periodo,
          tipoMatch,
          estado: 'CONCILIADO_MANUAL',
          diferenciaMonto: diferenciaFormateada,
          extractoLineaIds: bancoIdsUnicos,
          libroItems: parsed.libroItems,
        },
      });

      const [grupoCreado] = await cargarGruposConItemsEnTx(client, empresaId, [grupoId]);
      return grupoCreado;
    });
  },

  async desconciliarGrupo(
    empresaId: string,
    userId: string,
    grupoId: string,
    motivo: string
  ): Promise<GrupoConciliacionV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');
    asegurarUuid(grupoId, 'grupoId');

    const motivoNormalizado = typeof motivo === 'string' ? motivo.trim() : '';
    if (motivoNormalizado.length < 5) {
      throw new ConciliacionV2Error(
        400,
        'MOTIVO_DESCONCILIACION_REQUERIDO',
        'El motivo de desconciliación es obligatorio y debe tener al menos 5 caracteres.'
      );
    }
    const parsed = desconciliarGrupoSchema.parse({ motivo: motivoNormalizado });

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const grupoCuentaRes = await client.query<{ cuentaFinancieraId: string }>(
        `SELECT cuenta_financiera_id AS "cuentaFinancieraId"
         FROM conciliacion_grupo
         WHERE empresa_id = $1 AND id = $2`,
        [empresaId, grupoId]
      );

      if (grupoCuentaRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'GRUPO_CONCILIACION_NO_ENCONTRADO',
          'El grupo de conciliación indicado no existe para esta empresa.'
        );
      }

      await bloquearCuentaFinancieraEnTx(
        client,
        empresaId,
        grupoCuentaRes.rows[0].cuentaFinancieraId
      );

      const grupoRes = await client.query<{
        id: string;
        cuentaFinancieraId: string;
        periodoId: string;
        codigoPeriodo: string;
        estado: string;
        cuentaContableId: string | null;
      }>(
        `SELECT cg.id,
                cg.cuenta_financiera_id AS "cuentaFinancieraId",
                cg.periodo_id AS "periodoId",
                p.codigo_periodo AS "codigoPeriodo",
                cg.estado,
                cf.cuenta_contable_id AS "cuentaContableId"
         FROM conciliacion_grupo cg
         JOIN periodos p
           ON p.id = cg.periodo_id
          AND p.empresa_id = cg.empresa_id
         JOIN cuentas_financieras cf
           ON cf.id = cg.cuenta_financiera_id
          AND cf.empresa_id = cg.empresa_id
         WHERE cg.empresa_id = $1 AND cg.id = $2
         FOR UPDATE OF cg`,
        [empresaId, grupoId]
      );

      if (grupoRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'GRUPO_CONCILIACION_NO_ENCONTRADO',
          'El grupo de conciliación indicado no existe para esta empresa.'
        );
      }

      const g = grupoRes.rows[0];
      if (g.estado !== 'CONCILIADO' && g.estado !== 'CONCILIADO_MANUAL') {
        throw new ConciliacionV2Error(
          409,
          'ESTADO_GRUPO_INVALIDO',
          `Solo se pueden desconciliar grupos en estado CONCILIADO o CONCILIADO_MANUAL (estado actual: ${g.estado}).`
        );
      }

      validarPrecondicionOperacionCuenta(g.cuentaContableId);
      await verificarPeriodoNoCerradoEnTx(
        client,
        empresaId,
        g.cuentaFinancieraId,
        g.codigoPeriodo
      );

      const [snapshotGrupoAntes] = await cargarGruposConItemsEnTx(client, empresaId, [grupoId]);

      const bancoIds = ordenarUuidsUnicos(
        snapshotGrupoAntes.itemsBanco
          .map((ib) => ib.extractoLineaId)
          .filter((id): id is string => Boolean(id))
      );
      const movIds = ordenarUuidsUnicos(
        snapshotGrupoAntes.itemsLibro
          .filter((il) => il.origenLibro === 'MOVIMIENTO_TESORERIA' && il.movimientoTesoreriaId)
          .map((il) => il.movimientoTesoreriaId as string)
      );
      const asientoDetIds = ordenarUuidsUnicos(
        snapshotGrupoAntes.itemsLibro
          .filter((il) => il.origenLibro === 'ASIENTO_MANUAL' && il.asientoDetalleId)
          .map((il) => il.asientoDetalleId as string)
      );

      const estadosPreviosBanco: Array<{ id: string; estadoConciliacion: string; conciliada: boolean }> = [];
      if (bancoIds.length > 0) {
        const lineasRes = await client.query<{
          id: string;
          fecha: string;
          conciliada: boolean;
          estadoConciliacion: string;
        }>(
          `SELECT id,
                  fecha::text AS fecha,
                  conciliada,
                  estado_conciliacion AS "estadoConciliacion"
           FROM extracto_lineas
           WHERE empresa_id = $1 AND id = ANY($2::uuid[])
           ORDER BY id ASC
           FOR UPDATE`,
          [empresaId, bancoIds]
        );

        for (const l of lineasRes.rows) {
          estadosPreviosBanco.push({
            id: l.id,
            estadoConciliacion: l.estadoConciliacion,
            conciliada: Boolean(l.conciliada),
          });
          const perLinea = l.fecha.slice(0, 7);
          if (perLinea !== g.codigoPeriodo) {
            await verificarPeriodoNoCerradoEnTx(client, empresaId, g.cuentaFinancieraId, perLinea);
          }
        }
      }

      const estadosPreviosLibro: Array<{ id: string; estadoConciliacionLibro: string; conciliado: boolean }> = [];
      if (movIds.length > 0) {
        const movsRes = await client.query<{
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
           WHERE empresa_id = $1 AND id = ANY($2::uuid[])
           ORDER BY id ASC
           FOR UPDATE`,
          [empresaId, movIds]
        );

        for (const m of movsRes.rows) {
          estadosPreviosLibro.push({
            id: m.id,
            estadoConciliacionLibro: m.estadoConciliacionLibro,
            conciliado: Boolean(m.conciliado),
          });
          const perMov = m.fecha.slice(0, 7);
          if (perMov !== g.codigoPeriodo) {
            await verificarPeriodoNoCerradoEnTx(client, empresaId, g.cuentaFinancieraId, perMov);
          }
        }
      }

      if (asientoDetIds.length > 0) {
        const detsRes = await client.query<{
          id: string;
          fecha: string;
        }>(
          `SELECT ad.id,
                  a.fecha::text AS fecha
           FROM asiento_detalle ad
           JOIN asientos a
             ON a.id = ad.asiento_id
            AND a.empresa_id = ad.empresa_id
           WHERE ad.empresa_id = $1 AND ad.id = ANY($2::uuid[])
           ORDER BY ad.id ASC
           FOR UPDATE OF ad`,
          [empresaId, asientoDetIds]
        );

        for (const d of detsRes.rows) {
          const perDet = d.fecha.slice(0, 7);
          if (perDet !== g.codigoPeriodo) {
            await verificarPeriodoNoCerradoEnTx(client, empresaId, g.cuentaFinancieraId, perDet);
          }
        }
      }

      // Marcar el grupo como DESCONCILIADO primero para verificar referencias activas restantes
      await client.query(
        `UPDATE conciliacion_grupo
         SET estado = 'DESCONCILIADO',
             updated_at = CURRENT_TIMESTAMP
         WHERE empresa_id = $1 AND id = $2`,
        [empresaId, grupoId]
      );

      if (bancoIds.length > 0) {
        await client.query(
          `UPDATE extracto_lineas el
           SET conciliada = false,
               estado_conciliacion = 'PENDIENTE_LIBROS',
               movimiento_tesoreria_id = NULL,
               diferencia_importe = 0.00,
               conciliado_en = NULL
           WHERE el.empresa_id = $1
             AND el.id = ANY($2::uuid[])
             AND NOT EXISTS (
               SELECT 1
               FROM conciliacion_item ci
               JOIN conciliacion_grupo cg
                 ON cg.id = ci.grupo_id
                AND cg.empresa_id = ci.empresa_id
               WHERE ci.empresa_id = el.empresa_id
                 AND ci.lado = 'BANCO'
                 AND ci.extracto_linea_id = el.id
                 AND cg.estado IN ('CONCILIADO', 'CONCILIADO_MANUAL')
             )`,
          [empresaId, bancoIds]
        );
      }

      if (movIds.length > 0) {
        await client.query(
          `UPDATE movimientos_tesoreria mt
           SET conciliado = false,
               estado_conciliacion_libro = CASE
                 WHEN mt.medio_pago = '007' AND mt.tipo = 'EGRESO' THEN 'CHEQUE_NO_COBRADO'
                 ELSE 'PENDIENTE_BANCO'
               END,
               updated_at = CURRENT_TIMESTAMP
           WHERE mt.empresa_id = $1
             AND mt.id = ANY($2::uuid[])
             AND NOT EXISTS (
               SELECT 1
               FROM extracto_lineas el
               WHERE el.empresa_id = mt.empresa_id
                 AND el.movimiento_tesoreria_id = mt.id
                 AND el.conciliada = true
             )
             AND NOT EXISTS (
               SELECT 1
               FROM conciliacion_item ci
               JOIN conciliacion_grupo cg
                 ON cg.id = ci.grupo_id
                AND cg.empresa_id = ci.empresa_id
               WHERE ci.empresa_id = mt.empresa_id
                 AND ci.lado = 'LIBRO'
                 AND ci.origen_libro = 'MOVIMIENTO_TESORERIA'
                 AND ci.movimiento_tesoreria_id = mt.id
                 AND cg.estado IN ('CONCILIADO', 'CONCILIADO_MANUAL')
             )`,
          [empresaId, movIds]
        );
      }

      const estadoAnteriorBanco =
        estadosPreviosBanco[0]?.estadoConciliacion ?? g.estado;
      const estadoAnteriorLibro =
        estadosPreviosLibro[0]?.estadoConciliacionLibro ?? 'CONCILIADO';

      const snapshotJson = {
        ...snapshotGrupoAntes,
        periodo: g.codigoPeriodo,
        estadosPreviosBanco,
        estadosPreviosLibro,
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
          grupoId,
          bancoIds[0] ?? null,
          movIds[0] ?? null,
          estadoAnteriorBanco,
          estadoAnteriorLibro,
          parsed.motivo,
          JSON.stringify(snapshotJson),
          userId,
        ]
      );

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'conciliacion_grupo',
        registroId: grupoId,
        accion: 'UPDATE',
        datosAnteriores: {
          estado: g.estado,
          estadosPreviosBanco,
          estadosPreviosLibro,
        },
        datosNuevos: {
          estado: 'DESCONCILIADO',
          motivo: parsed.motivo,
          historialId: histRes.rows[0].id,
        },
      });

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'conciliacion_historial_desconciliacion',
        registroId: histRes.rows[0].id,
        accion: 'INSERT',
        datosNuevos: {
          grupoId,
          motivo: parsed.motivo,
          estadoAnteriorBanco,
          estadoAnteriorLibro,
        },
      });

      const [grupoActualizado] = await cargarGruposConItemsEnTx(client, empresaId, [grupoId]);
      return grupoActualizado;
    });
  },

  async listarHistorialDesconciliacion(
    empresaId: string,
    cuentaFinancieraId?: string,
    periodo?: string
  ): Promise<HistorialDesconciliacionV2[]> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');

    if (cuentaFinancieraId !== undefined && cuentaFinancieraId !== '') {
      asegurarUuid(cuentaFinancieraId, 'cuentaFinancieraId');
    }
    if (periodo !== undefined && periodo !== '') {
      resolverRangoPeriodo(periodo);
    }

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const res = await client.query(
        `SELECT h.id,
                h.empresa_id AS "empresaId",
                h.grupo_id AS "grupoId",
                h.extracto_linea_id AS "extractoLineaId",
                h.movimiento_tesoreria_id AS "movimientoTesoreriaId",
                h.estado_anterior_banco AS "estadoAnteriorBanco",
                h.estado_anterior_libro AS "estadoAnteriorLibro",
                h.motivo,
                h.snapshot_grupo_json AS "snapshotGrupoJson",
                h.usuario_id AS "usuarioId",
                u.email AS "usuarioEmail",
                h.created_at AS "createdAt"
         FROM conciliacion_historial_desconciliacion h
         LEFT JOIN conciliacion_grupo cg
           ON cg.id = h.grupo_id
          AND cg.empresa_id = h.empresa_id
         LEFT JOIN periodos p
           ON p.id = cg.periodo_id
          AND p.empresa_id = cg.empresa_id
         LEFT JOIN usuarios_estudio u
           ON u.id = h.usuario_id
         WHERE h.empresa_id = $1
           AND (
             $2::uuid IS NULL
             OR cg.cuenta_financiera_id = $2
             OR (h.snapshot_grupo_json->>'cuentaFinancieraId') = $2::text
           )
           AND (
             $3::varchar IS NULL
             OR p.codigo_periodo = $3
             OR (h.snapshot_grupo_json->>'periodo') = $3
           )
         ORDER BY h.created_at DESC, h.id DESC`,
        [
          empresaId,
          cuentaFinancieraId && cuentaFinancieraId.length > 0 ? cuentaFinancieraId : null,
          periodo && periodo.length > 0 ? periodo : null,
        ]
      );

      return res.rows.map(mapHistorialDesconciliacionRow);
    });
  },

  async listarReglasAprendidas(
    empresaId: string,
    soloActivas = false
  ): Promise<ReglaAprendidaV2[]> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    return db.withEmpresaTransaction(empresaId, (client) =>
      listarReglasAprendidasEnTx(client, empresaId, soloActivas)
    );
  },

  async crearReglaAprendida(
    empresaId: string,
    userId: string,
    input: CrearReglaAprendidaInput
  ): Promise<ReglaAprendidaV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');

    const parsed = crearReglaAprendidaSchema.parse(input);

    return db.withEmpresaTransaction(empresaId, async (client) => {
      await validarReferenciasReglaAprendidaEnTx(
        client,
        empresaId,
        parsed.anexoId ?? null,
        parsed.cuentaContableId ?? null
      );

      const dupRes = await client.query<{ id: string }>(
        `SELECT id
         FROM conciliacion_reglas_aprendidas
         WHERE empresa_id = $1 AND patron_contraparte = $2
         LIMIT 1`,
        [empresaId, parsed.patronContraparte]
      );
      if (dupRes.rows.length > 0) {
        throw new ConciliacionV2Error(
          409,
          'REGLA_APRENDIDA_DUPLICADA',
          `Ya existe una regla aprendida para el patrón "${parsed.patronContraparte}".`
        );
      }

      const insRes = await client.query<{ id: string }>(
        `INSERT INTO conciliacion_reglas_aprendidas (
           empresa_id,
           patron_contraparte,
           ruc_contraparte,
           anexo_id,
           cuenta_contable_id,
           tipo_clasificacion,
           usos_confirmados,
           activo,
           created_by,
           updated_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $8)
         RETURNING id`,
        [
          empresaId,
          parsed.patronContraparte,
          parsed.rucContraparte ?? null,
          parsed.anexoId ?? null,
          parsed.cuentaContableId ?? null,
          parsed.tipoClasificacion ?? null,
          parsed.activo ?? true,
          userId,
        ]
      );

      const creada = await obtenerReglaAprendidaPorIdEnTx(client, empresaId, insRes.rows[0].id);
      if (!creada) {
        throw new ConciliacionV2Error(500, 'ERROR_INTERNO', 'No se pudo recuperar la regla creada.');
      }

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'conciliacion_reglas_aprendidas',
        registroId: creada.id,
        accion: 'INSERT',
        datosNuevos: creada,
      });

      return creada;
    });
  },

  async actualizarReglaAprendida(
    empresaId: string,
    userId: string,
    reglaId: string,
    input: ActualizarReglaAprendidaInput
  ): Promise<ReglaAprendidaV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');
    asegurarUuid(reglaId, 'reglaId');

    const parsed = actualizarReglaAprendidaSchema.parse(input);

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const anterior = await obtenerReglaAprendidaPorIdEnTx(client, empresaId, reglaId);
      if (!anterior) {
        throw new ConciliacionV2Error(
          404,
          'REGLA_APRENDIDA_NO_ENCONTRADA',
          'La regla aprendida indicada no existe para esta empresa.'
        );
      }

      const nuevoPatron = parsed.patronContraparte ?? anterior.patronContraparte;
      const nuevoRuc =
        parsed.rucContraparte !== undefined ? parsed.rucContraparte : anterior.rucContraparte;
      const nuevoAnexoId = parsed.anexoId !== undefined ? parsed.anexoId : anterior.anexoId;
      const nuevaCuentaId =
        parsed.cuentaContableId !== undefined
          ? parsed.cuentaContableId
          : anterior.cuentaContableId;
      const nuevoTipo =
        parsed.tipoClasificacion !== undefined
          ? parsed.tipoClasificacion
          : anterior.tipoClasificacion;
      const nuevoActivo = parsed.activo !== undefined ? parsed.activo : anterior.activo;

      if (nuevoPatron !== anterior.patronContraparte) {
        const dupRes = await client.query<{ id: string }>(
          `SELECT id
           FROM conciliacion_reglas_aprendidas
           WHERE empresa_id = $1 AND patron_contraparte = $2 AND id <> $3
           LIMIT 1`,
          [empresaId, nuevoPatron, reglaId]
        );
        if (dupRes.rows.length > 0) {
          throw new ConciliacionV2Error(
            409,
            'REGLA_APRENDIDA_DUPLICADA',
            `Ya existe otra regla aprendida para el patrón "${nuevoPatron}".`
          );
        }
      }

      await validarReferenciasReglaAprendidaEnTx(client, empresaId, nuevoAnexoId, nuevaCuentaId);

      await client.query(
        `UPDATE conciliacion_reglas_aprendidas
         SET patron_contraparte = $1,
             ruc_contraparte = $2,
             anexo_id = $3,
             cuenta_contable_id = $4,
             tipo_clasificacion = $5,
             activo = $6,
             updated_by = $7,
             updated_at = CURRENT_TIMESTAMP
         WHERE empresa_id = $8 AND id = $9`,
        [
          nuevoPatron,
          nuevoRuc ?? null,
          nuevoAnexoId ?? null,
          nuevaCuentaId ?? null,
          nuevoTipo ?? null,
          nuevoActivo,
          userId,
          empresaId,
          reglaId,
        ]
      );

      const actualizada = await obtenerReglaAprendidaPorIdEnTx(client, empresaId, reglaId);
      if (!actualizada) {
        throw new ConciliacionV2Error(
          500,
          'ERROR_INTERNO',
          'No se pudo recuperar la regla aprendida actualizada.'
        );
      }

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'conciliacion_reglas_aprendidas',
        registroId: reglaId,
        accion: 'UPDATE',
        datosAnteriores: anterior,
        datosNuevos: actualizada,
      });

      return actualizada;
    });
  },

  async eliminarReglaAprendida(
    empresaId: string,
    userId: string,
    reglaId: string
  ): Promise<{ id: string; eliminada: boolean }> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(userId, 'userId');
    asegurarUuid(reglaId, 'reglaId');

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const anterior = await obtenerReglaAprendidaPorIdEnTx(client, empresaId, reglaId);
      if (!anterior) {
        throw new ConciliacionV2Error(
          404,
          'REGLA_APRENDIDA_NO_ENCONTRADA',
          'La regla aprendida indicada no existe para esta empresa.'
        );
      }

      await client.query(
        `DELETE FROM conciliacion_reglas_aprendidas
         WHERE empresa_id = $1 AND id = $2`,
        [empresaId, reglaId]
      );

      await registrarAuditoriaEnTx(client, {
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'conciliacion_reglas_aprendidas',
        registroId: reglaId,
        accion: 'DELETE',
        datosAnteriores: anterior,
      });

      return { id: reglaId, eliminada: true };
    });
  },
};
