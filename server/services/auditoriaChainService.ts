import crypto, { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { db, estaEnTransaccionActiva } from '../config/database';
import { env } from '../config/env';
import { filtrarDetalleAuditoria, sanitizarMensaje } from '../utils/seguridadDatos';

export interface AuditoriaLogEntry {
  id: string;
  empresaId: string;
  usuarioId: string;
  tablaAfectada: string;
  registroId: string;
  accion: string;
  datosAnteriores?: any;
  datosNuevos?: any;
  hashPrevio: string;
  hashActual: string;
  createdAt: string;
}

export interface RegistrarAuditoriaChainParams {
  empresaId: string;
  usuarioId: string;
  tablaAfectada: string;
  registroId: string;
  accion: string;
  datosAnteriores?: any;
  datosNuevos?: any;
}

export type AuditoriaChainLog = AuditoriaLogEntry;

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

// Almacén append-only en memoria (en PostgreSQL se persiste en tabla auditoria_log con permisos REVOKE UPDATE, DELETE)
export const AUDITORIA_LOG_CHAIN_MEMORIA: AuditoriaLogEntry[] = [];

const UUID_PG_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esUuidValido(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID_PG_REGEX.test(valor);
}

/**
 * Obtiene la cadena de auditoría de una empresa desde PostgreSQL bajo contexto RLS
 * estricto (`withEmpresaTransaction`) o desde el almacenamiento en memoria si no hay Postgres.
 */
async function obtenerLogsAuditoriaEmpresa(empresaId: string): Promise<AuditoriaLogEntry[]> {
  if (db.isPostgresConnected()) {
    if (!esUuidValido(empresaId)) {
      throw new Error('EMPRESA_ID_INVALIDO');
    }
    const res = await db.withEmpresaTransaction(empresaId, async (client) =>
      client.query<AuditoriaLogEntry>(`
        SELECT id, empresa_id as "empresaId", usuario_id as "usuarioId",
               tabla_afectada as "tablaAfectada", registro_id as "registroId",
               accion, datos_anteriores as "datosAnteriores", datos_nuevos as "datosNuevos",
               hash_previo as "hashPrevio", hash_actual as "hashActual", created_at as "createdAt"
        FROM auditoria_log
        WHERE empresa_id = $1
        ORDER BY created_at ASC, id ASC
      `, [empresaId])
    );
    return res.rows;
  }
  return AUDITORIA_LOG_CHAIN_MEMORIA.filter(l => l.empresaId === empresaId);
}

/**
 * Ordena recursivamente las claves de objetos siguiendo la regla interna de PostgreSQL JSONB
 * (longitud de clave UTF-8 ascendente, luego orden lexicográfico UTF-8/codepoint) para que el hash
 * calculado coincida exactamente con el JSONB recuperado por `verificarIntegridad`.
 */
export function ordenarClavesComoJsonb(valor: unknown): unknown {
  if (valor === null || valor === undefined) {
    return valor;
  }
  if (Array.isArray(valor)) {
    return valor.map((item) => (item === undefined ? null : ordenarClavesComoJsonb(item)));
  }
  if (valor instanceof Date) {
    return valor.toISOString();
  }
  if (typeof valor === 'object') {
    const origen = valor as Record<string, unknown>;
    const claves = Object.keys(origen)
      .filter((k) => origen[k] !== undefined)
      .sort((a, b) => {
        const lenA = Buffer.byteLength(a, 'utf8');
        const lenB = Buffer.byteLength(b, 'utf8');
        if (lenA !== lenB) return lenA - lenB;
        return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
      });
    const destino: Record<string, unknown> = {};
    for (const clave of claves) {
      destino[clave] = ordenarClavesComoJsonb(origen[clave]);
    }
    return destino;
  }
  return valor;
}

export const auditoriaChainService = {
  /**
   * Calcula el hash criptográfico SHA-256 de una entrada de auditoría encadenada
   */
  calcularHash(
    id: string,
    empresaId: string,
    usuarioId: string,
    tablaAfectada: string,
    registroId: string,
    accion: string,
    datosNuevos: any,
    hashPrevio: string
  ): string {
    const raw = `${id}|${empresaId}|${usuarioId}|${tablaAfectada}|${registroId}|${accion}|${JSON.stringify(datosNuevos || {})}|${hashPrevio}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  },

  /**
   * Registra un nuevo evento de auditoría agregándolo al final de la cadena inmutable.
   * Si se recibe `client`, participa atómicamente de esa transacción propagando errores.
   */
  async registrar(params: RegistrarAuditoriaChainParams, client?: PoolClient): Promise<AuditoriaLogEntry> {
    const modoEntorno = process.env.NODE_ENV || env.NODE_ENV;
    if (!client && estaEnTransaccionActiva() && (modoEntorno === 'test' || modoEntorno === 'development')) {
      throw new Error(
        'AUDITORIA_SIN_CLIENT_EN_TRANSACCION: auditoriaChainService.registrar fue invocado sin PoolClient dentro de una transacción activa. Pase el client transaccional para preservar atomicidad y evitar bloqueos.'
      );
    }

    const datosAnterioresFiltrados = filtrarDetalleAuditoria(params.tablaAfectada, params.datosAnteriores ?? null);
    const datosNuevosFiltrados = filtrarDetalleAuditoria(params.tablaAfectada, params.datosNuevos ?? null);
    const datosAnteriores = ordenarClavesComoJsonb(datosAnterioresFiltrados ?? null);
    const datosNuevos = ordenarClavesComoJsonb(datosNuevosFiltrados ?? null);

    const escribirEnTx = async (txClient: PoolClient): Promise<AuditoriaLogEntry> => {
      const id = randomUUID();

      await txClient.query(
        "SELECT pg_advisory_xact_lock(hashtext('auditoria_log:' || $1))",
        [params.empresaId]
      );

      const prevRes = await txClient.query<{ hash_actual: string | null; created_at: string | null }>(
        `SELECT hash_actual, created_at::text AS created_at
         FROM auditoria_log
         WHERE empresa_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [params.empresaId]
      );

      const hashPrevio = prevRes.rows[0]?.hash_actual || GENESIS_HASH;
      const prevCreatedAt = prevRes.rows[0]?.created_at ?? null;
      const hashActual = this.calcularHash(
        id,
        params.empresaId,
        params.usuarioId,
        params.tablaAfectada,
        params.registroId,
        params.accion,
        datosNuevos,
        hashPrevio
      );

      const insertRes = await txClient.query<{ created_at: Date | string }>(
        `INSERT INTO auditoria_log (
          id, empresa_id, usuario_id, tabla_afectada, registro_id,
          accion, datos_anteriores, datos_nuevos, hash_previo, hash_actual, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10,
          GREATEST(clock_timestamp(), COALESCE($11::timestamptz + interval '1 microsecond', clock_timestamp()))
        )
        RETURNING created_at`,
        [
          id,
          params.empresaId,
          params.usuarioId,
          params.tablaAfectada,
          params.registroId,
          params.accion,
          datosAnteriores !== undefined && datosAnteriores !== null ? JSON.stringify(datosAnteriores) : null,
          datosNuevos !== undefined && datosNuevos !== null ? JSON.stringify(datosNuevos) : null,
          hashPrevio,
          hashActual,
          prevCreatedAt,
        ]
      );

      const rawCreatedAt = insertRes.rows[0]?.created_at;
      const createdAt = rawCreatedAt instanceof Date
        ? rawCreatedAt.toISOString()
        : rawCreatedAt
          ? new Date(rawCreatedAt).toISOString()
          : new Date().toISOString();

      return {
        id,
        empresaId: params.empresaId,
        usuarioId: params.usuarioId,
        tablaAfectada: params.tablaAfectada,
        registroId: params.registroId,
        accion: params.accion,
        datosAnteriores,
        datosNuevos,
        hashPrevio,
        hashActual,
        createdAt,
      };
    };

    if (client) {
      if (!esUuidValido(params.empresaId) || !esUuidValido(params.usuarioId)) {
        throw new Error('AUDITORIA_LOG_IDENTIFICADOR_INVALIDO: empresaId y usuarioId deben ser UUID válidos.');
      }
      return await escribirEnTx(client);
    }

    if (db.isPostgresConnected() && esUuidValido(params.empresaId) && esUuidValido(params.usuarioId)) {
      try {
        return await db.withEmpresaTransaction(params.empresaId, async (txClient) => escribirEnTx(txClient));
      } catch (err) {
        console.error('Error insertando en auditoria_log (Postgres):', sanitizarMensaje(err));
      }
    }

    const id = db.isPostgresConnected()
      ? randomUUID()
      : `aud-chain-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    // Obtener el último hash de la empresa en memoria
    const logsEmpresa = AUDITORIA_LOG_CHAIN_MEMORIA.filter(l => l.empresaId === params.empresaId);
    const hashPrevio = logsEmpresa.length > 0
      ? logsEmpresa[logsEmpresa.length - 1].hashActual
      : GENESIS_HASH;

    const hashActual = this.calcularHash(
      id,
      params.empresaId,
      params.usuarioId,
      params.tablaAfectada,
      params.registroId,
      params.accion,
      datosNuevos,
      hashPrevio
    );

    const entrada: AuditoriaLogEntry = {
      id,
      empresaId: params.empresaId,
      usuarioId: params.usuarioId,
      tablaAfectada: params.tablaAfectada,
      registroId: params.registroId,
      accion: params.accion,
      datosAnteriores,
      datosNuevos,
      hashPrevio,
      hashActual,
      createdAt: now
    };

    AUDITORIA_LOG_CHAIN_MEMORIA.push(entrada);
    return entrada;
  },

  /**
   * Registra un lote de eventos de auditoría encadenados dentro de una transacción activa,
   * agrupando por empresaId, tomando un único advisory lock por empresa e insertando en
   * chunks de 500 filas con timestamps estrictamente crecientes en microsegundos.
   */
  async registrarLote(
    eventos: RegistrarAuditoriaChainParams[],
    client: PoolClient
  ): Promise<AuditoriaLogEntry[]> {
    if (!client || typeof client.query !== 'function') {
      throw new Error(
        'AUDITORIA_LOTE_CLIENT_REQUERIDO: auditoriaChainService.registrarLote requiere un PoolClient transaccional válido.'
      );
    }
    if (!Array.isArray(eventos)) {
      throw new Error('AUDITORIA_LOTE_EVENTOS_INVALIDO: eventos debe ser un arreglo.');
    }
    if (eventos.length === 0) {
      return [];
    }

    for (const ev of eventos) {
      if (!ev || !esUuidValido(ev.empresaId) || !esUuidValido(ev.usuarioId)) {
        throw new Error('AUDITORIA_LOG_IDENTIFICADOR_INVALIDO: empresaId y usuarioId deben ser UUID válidos.');
      }
    }

    const porEmpresa = new Map<string, Array<{ index: number; evento: RegistrarAuditoriaChainParams }>>();
    for (let i = 0; i < eventos.length; i++) {
      const evento = eventos[i];
      let grupo = porEmpresa.get(evento.empresaId);
      if (!grupo) {
        grupo = [];
        porEmpresa.set(evento.empresaId, grupo);
      }
      grupo.push({ index: i, evento });
    }

    const resultados: AuditoriaLogEntry[] = new Array(eventos.length);
    const CHUNK_SIZE = 500;

    for (const [empresaId, items] of porEmpresa.entries()) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('auditoria_log:' || $1))",
        [empresaId]
      );

      const prevRes = await client.query<{ hash_actual: string | null; created_at: Date | string | null }>(
        `SELECT hash_actual, created_at::text AS created_at
         FROM auditoria_log
         WHERE empresa_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [empresaId]
      );

      let hashPrevio = prevRes.rows[0]?.hash_actual || GENESIS_HASH;
      const prevMaxCreatedAt = prevRes.rows[0]?.created_at ?? null;

      const baseTsRes = await client.query<{ base_ts: string }>(
        `SELECT GREATEST(
           clock_timestamp(),
           COALESCE($1::timestamptz + interval '1 microsecond', clock_timestamp())
         )::text AS base_ts`,
        [prevMaxCreatedAt]
      );
      const baseTs = baseTsRes.rows[0].base_ts;

      const preparadas: Array<{
        index: number;
        entry: AuditoriaLogEntry;
        datosAnterioresJson: string | null;
        datosNuevosJson: string | null;
      }> = [];

      for (const { index, evento } of items) {
        const datosAnterioresFiltrados = filtrarDetalleAuditoria(evento.tablaAfectada, evento.datosAnteriores ?? null);
        const datosNuevosFiltrados = filtrarDetalleAuditoria(evento.tablaAfectada, evento.datosNuevos ?? null);
        const datosAnteriores = ordenarClavesComoJsonb(datosAnterioresFiltrados ?? null);
        const datosNuevos = ordenarClavesComoJsonb(datosNuevosFiltrados ?? null);

        const id = randomUUID();
        const hashActual = this.calcularHash(
          id,
          empresaId,
          evento.usuarioId,
          evento.tablaAfectada,
          evento.registroId,
          evento.accion,
          datosNuevos,
          hashPrevio
        );

        const entry: AuditoriaLogEntry = {
          id,
          empresaId,
          usuarioId: evento.usuarioId,
          tablaAfectada: evento.tablaAfectada,
          registroId: evento.registroId,
          accion: evento.accion,
          datosAnteriores,
          datosNuevos,
          hashPrevio,
          hashActual,
          createdAt: '',
        };

        preparadas.push({
          index,
          entry,
          datosAnterioresJson:
            datosAnteriores !== undefined && datosAnteriores !== null ? JSON.stringify(datosAnteriores) : null,
          datosNuevosJson:
            datosNuevos !== undefined && datosNuevos !== null ? JSON.stringify(datosNuevos) : null,
        });

        hashPrevio = hashActual;
      }

      for (let indiceGlobal = 0; indiceGlobal < preparadas.length; indiceGlobal += CHUNK_SIZE) {
        const chunk = preparadas.slice(indiceGlobal, indiceGlobal + CHUNK_SIZE);

        const ids: string[] = [];
        const usuarioIds: string[] = [];
        const tablasAfectadas: string[] = [];
        const registrosIds: string[] = [];
        const acciones: string[] = [];
        const datosAnterioresArr: Array<string | null> = [];
        const datosNuevosArr: Array<string | null> = [];
        const hashesPrevios: string[] = [];
        const hashesActuales: string[] = [];

        for (const item of chunk) {
          ids.push(item.entry.id);
          usuarioIds.push(item.entry.usuarioId);
          tablasAfectadas.push(item.entry.tablaAfectada);
          registrosIds.push(item.entry.registroId);
          acciones.push(item.entry.accion);
          datosAnterioresArr.push(item.datosAnterioresJson);
          datosNuevosArr.push(item.datosNuevosJson);
          hashesPrevios.push(item.entry.hashPrevio);
          hashesActuales.push(item.entry.hashActual);
        }

        const insertRes = await client.query<{ created_at: Date | string }>(
          `INSERT INTO auditoria_log (
            id, empresa_id, usuario_id, tabla_afectada, registro_id,
            accion, datos_anteriores, datos_nuevos, hash_previo, hash_actual, created_at
          )
          SELECT
            u.id,
            $1::uuid,
            u.usuario_id,
            u.tabla_afectada,
            u.registro_id,
            u.accion,
            u.datos_anteriores::jsonb,
            u.datos_nuevos::jsonb,
            u.hash_previo,
            u.hash_actual,
            $2::timestamptz + (($3::bigint + u.ord - 1) * interval '1 microsecond')
          FROM UNNEST(
            $4::text[],
            $5::uuid[],
            $6::text[],
            $7::text[],
            $8::text[],
            $9::text[],
            $10::text[],
            $11::text[],
            $12::text[]
          ) WITH ORDINALITY AS u(
            id,
            usuario_id,
            tabla_afectada,
            registro_id,
            accion,
            datos_anteriores,
            datos_nuevos,
            hash_previo,
            hash_actual,
            ord
          )
          ORDER BY u.ord
          RETURNING created_at`,
          [
            empresaId,
            baseTs,
            indiceGlobal,
            ids,
            usuarioIds,
            tablasAfectadas,
            registrosIds,
            acciones,
            datosAnterioresArr,
            datosNuevosArr,
            hashesPrevios,
            hashesActuales,
          ]
        );

        for (let k = 0; k < chunk.length; k++) {
          const rawCreatedAt = insertRes.rows[k]?.created_at;
          const createdAt = rawCreatedAt instanceof Date
            ? rawCreatedAt.toISOString()
            : rawCreatedAt
              ? new Date(rawCreatedAt).toISOString()
              : new Date().toISOString();
          chunk[k].entry.createdAt = createdAt;
          resultados[chunk[k].index] = chunk[k].entry;
        }
      }
    }

    return resultados;
  },

  /**
   * Recorre toda la cadena criptográfica de una empresa y verifica si ha habido manipulación,
   * inserción forzada o eliminación de registros históricos.
   */
  async verificarIntegridad(empresaId: string): Promise<{
    valido: boolean;
    totalRegistros: number;
    mensaje: string;
    indiceCorrupto?: number;
    ultimoHash?: string;
  }> {
    const logs = await obtenerLogsAuditoriaEmpresa(empresaId);

    if (logs.length === 0) {
      return {
        valido: true,
        totalRegistros: 0,
        mensaje: 'Cadena de auditoría sin registros (Génesis intacto).'
      };
    }

    for (let i = 0; i < logs.length; i++) {
      const actual = logs[i];
      const hashPrevioEsperado = i === 0 ? GENESIS_HASH : logs[i - 1].hashActual;

      // 1. Validar enlace al bloque anterior
      if (actual.hashPrevio !== hashPrevioEsperado) {
        return {
          valido: false,
          totalRegistros: logs.length,
          indiceCorrupto: i,
          mensaje: `INTEGRIDAD_COMPROMETIDA: Enlace roto en registro #${i} (ID: ${actual.id}). Hash previo almacenado no coincide con el registro anterior.`
        };
      }

      // 2. Recalcular el hash del bloque actual
      const hashRecalculado = this.calcularHash(
        actual.id,
        actual.empresaId,
        actual.usuarioId,
        actual.tablaAfectada,
        actual.registroId,
        actual.accion,
        actual.datosNuevos,
        actual.hashPrevio
      );

      if (actual.hashActual !== hashRecalculado) {
        return {
          valido: false,
          totalRegistros: logs.length,
          indiceCorrupto: i,
          mensaje: `INTEGRIDAD_COMPROMETIDA: Contenido alterado en registro #${i} (ID: ${actual.id}). El hash recalculado difiere del hash sellado.`
        };
      }
    }

    return {
      valido: true,
      totalRegistros: logs.length,
      mensaje: `Cadena de auditoría 100% íntegra (${logs.length} registros verificados).`,
      ultimoHash: logs[logs.length - 1].hashActual
    };
  },

  /**
   * Proyecta y enmascara entradas de auditoría al leer o exportar sin reescribir filas almacenadas
   * ni alterar hashPrevio / hashActual de la cadena inmutable.
   */
  async exportarPorEmpresa(empresaId: string): Promise<AuditoriaLogEntry[]> {
    const logs = await obtenerLogsAuditoriaEmpresa(empresaId);

    return logs.map(entrada => ({
      id: entrada.id,
      empresaId: entrada.empresaId,
      usuarioId: entrada.usuarioId,
      tablaAfectada: entrada.tablaAfectada,
      registroId: entrada.registroId,
      accion: entrada.accion,
      datosAnteriores: filtrarDetalleAuditoria(entrada.tablaAfectada, entrada.datosAnteriores),
      datosNuevos: filtrarDetalleAuditoria(entrada.tablaAfectada, entrada.datosNuevos),
      hashPrevio: entrada.hashPrevio,
      hashActual: entrada.hashActual,
      createdAt: entrada.createdAt
    }));
  }
};
