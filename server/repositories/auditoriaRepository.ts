import { db } from '../config/database';
import type { PoolClient } from 'pg';
import { AUDITORIA_LOG_CHAIN_MEMORIA, auditoriaChainService } from '../services/auditoriaChainService';
import { filtrarDetalleAuditoria, sanitizarMensaje } from '../utils/seguridadDatos';

export type OrigenAuditoria = 'OPERATIVA' | 'ENCADENADA';
export type FiltroOrigenAuditoria = 'TODOS' | OrigenAuditoria;

export interface RegistroAuditoria {
  id?: string;
  tenantId?: string | null;
  empresaId?: string;
  usuarioId?: string;
  usuarioEmail?: string | null;
  tablaAfectada?: string;
  tabla?: string;
  registroId: string;
  accion: 'INSERT' | 'UPDATE' | 'DELETE' | 'ANULAR' | 'CIERRE_PERIODO' | 'LOGIN' | string;
  datosAnteriores?: any;
  valoresAnteriores?: any;
  datosNuevos?: any;
  valoresNuevos?: any;
  direccionIp?: string | null;
  userAgent?: string | null;
  createdAt?: string;
  origen?: OrigenAuditoria;
  hashActual?: string | null;
  hashAnterior?: string | null;
}

const AUDITORIA_IN_MEMORY: (Omit<RegistroAuditoria, 'id' | 'createdAt'> & { id: string; createdAt: string })[] = [];

function filtrarRegistro<T extends RegistroAuditoria>(registro: T) {
  const { datosAnteriores, datosNuevos, valoresAnteriores, valoresNuevos, ...metadatos } = registro;
  const tabla = registro.tablaAfectada || registro.tabla || 'general';
  return {
    ...metadatos,
    datosAnteriores: filtrarDetalleAuditoria(tabla, datosAnteriores ?? valoresAnteriores),
    datosNuevos: filtrarDetalleAuditoria(tabla, datosNuevos ?? valoresNuevos)
  };
}

export const auditoriaRepository = {
  async registrar(evento: RegistroAuditoria, client?: PoolClient): Promise<void> {
    const registro = filtrarRegistro(evento);
    if (db.isPostgresConnected()) {
      try {
        const VALID_ACCIONES = ['INSERT', 'UPDATE', 'DELETE', 'ANULAR', 'CIERRE_PERIODO', 'LOGIN'];
        let accionNormalizada = (registro.accion || 'INSERT').toUpperCase();
        if (!VALID_ACCIONES.includes(accionNormalizada)) {
          if (accionNormalizada.includes('DELETE') || accionNormalizada.includes('ELIMIN')) accionNormalizada = 'DELETE';
          else if (accionNormalizada.includes('UPDATE') || accionNormalizada.includes('ACTUALIZ') || accionNormalizada.includes('MODIFIC')) accionNormalizada = 'UPDATE';
          else if (accionNormalizada.includes('ANUL')) accionNormalizada = 'ANULAR';
          else if (accionNormalizada.includes('CIERRE')) accionNormalizada = 'CIERRE_PERIODO';
          else if (accionNormalizada.includes('LOGIN')) accionNormalizada = 'LOGIN';
          else accionNormalizada = 'INSERT';
        }
        const sql = `
          INSERT INTO auditoria (
            tenant_id, empresa_id, usuario_id, usuario_email, tabla_afectada,
            registro_id, accion, datos_anteriores, datos_nuevos, direccion_ip, user_agent
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;
        const params = [
          registro.tenantId || null,
          registro.empresaId || null,
          registro.usuarioId || null,
          registro.usuarioEmail || null,
          registro.tablaAfectada || registro.tabla || 'general',
          registro.registroId,
          accionNormalizada,
          JSON.stringify(registro.datosAnteriores) ?? null,
          JSON.stringify(registro.datosNuevos) ?? null,
          registro.direccionIp || null,
          registro.userAgent || null
        ];
        if (client) await client.query(sql, params);
        else await db.query(sql, params);
        return;
      } catch (err) {
        if (client) throw err;
        console.error('Error registrando auditoría en PostgreSQL:', sanitizarMensaje(err));
      }
    }

    AUDITORIA_IN_MEMORY.unshift({
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
      ...registro
    });

    if (registro.empresaId) {
      await auditoriaChainService.registrar({
        empresaId: registro.empresaId,
        usuarioId: registro.usuarioId || 'usr-sistema',
        tablaAfectada: registro.tablaAfectada || registro.tabla || 'general',
        registroId: registro.registroId,
        accion: registro.accion,
        datosAnteriores: registro.datosAnteriores,
        datosNuevos: registro.datosNuevos
      });
    }
  },

  async listarPorEmpresa(
    empresaId: string,
    limit = 50,
    filtroOrigen: FiltroOrigenAuditoria = 'TODOS'
  ) {
    const limitSafe = Math.max(1, Math.min(500, Math.trunc(Number(limit) || 50)));
    const origenSafe: FiltroOrigenAuditoria =
      filtroOrigen === 'OPERATIVA' || filtroOrigen === 'ENCADENADA' ? filtroOrigen : 'TODOS';

    if (db.isPostgresConnected()) {
      const sqlOperativa = `
        SELECT a.id::text AS id,
               a.tenant_id AS "tenantId",
               a.empresa_id AS "empresaId",
               a.usuario_id AS "usuarioId",
               a.usuario_email::text AS "usuarioEmail",
               a.tabla_afectada::text AS "tablaAfectada",
               a.registro_id::text AS "registroId",
               a.accion::text AS accion,
               a.datos_anteriores AS "datosAnteriores",
               a.datos_nuevos AS "datosNuevos",
               a.direccion_ip::text AS "direccionIp",
               a.user_agent AS "userAgent",
               a.created_at AS "createdAt",
               'OPERATIVA'::text AS origen,
               NULL::text AS "hashActual",
               NULL::text AS "hashAnterior"
        FROM auditoria a
        WHERE a.empresa_id = $1
      `;
      const sqlEncadenada = `
        SELECT al.id::text AS id,
               NULL::uuid AS "tenantId",
               al.empresa_id AS "empresaId",
               al.usuario_id AS "usuarioId",
               COALESCE(u.email, al.usuario_id::text) AS "usuarioEmail",
               al.tabla_afectada::text AS "tablaAfectada",
               al.registro_id::text AS "registroId",
               al.accion::text AS accion,
               al.datos_anteriores AS "datosAnteriores",
               al.datos_nuevos AS "datosNuevos",
               NULL::text AS "direccionIp",
               NULL::text AS "userAgent",
               al.created_at AS "createdAt",
               'ENCADENADA'::text AS origen,
               al.hash_actual::text AS "hashActual",
               al.hash_previo::text AS "hashAnterior"
        FROM auditoria_log al
        LEFT JOIN usuarios_estudio u ON u.id = al.usuario_id
        WHERE al.empresa_id = $1
      `;

      const sql =
        origenSafe === 'TODOS'
          ? `SELECT * FROM (${sqlOperativa} UNION ALL ${sqlEncadenada}) AS combinado ORDER BY "createdAt" DESC LIMIT $2`
          : origenSafe === 'OPERATIVA'
            ? `${sqlOperativa} ORDER BY a.created_at DESC LIMIT $2`
            : `${sqlEncadenada} ORDER BY al.created_at DESC LIMIT $2`;

      const res = await db.withEmpresaTransaction(empresaId, async (client) =>
        client.query<RegistroAuditoria>(sql, [empresaId, limitSafe])
      );
      return res.rows.map(filtrarRegistro);
    }

    const operativos: RegistroAuditoria[] =
      origenSafe === 'ENCADENADA'
        ? []
        : AUDITORIA_IN_MEMORY.filter((a) => a.empresaId === empresaId).map((a) => ({
            ...a,
            origen: 'OPERATIVA' as const,
            hashActual: null,
            hashAnterior: null,
          }));

    const encadenados: RegistroAuditoria[] =
      origenSafe === 'OPERATIVA'
        ? []
        : AUDITORIA_LOG_CHAIN_MEMORIA.filter((l) => l.empresaId === empresaId).map((l) => ({
            id: l.id,
            tenantId: null,
            empresaId: l.empresaId,
            usuarioId: l.usuarioId,
            usuarioEmail: l.usuarioId,
            tablaAfectada: l.tablaAfectada,
            registroId: l.registroId,
            accion: l.accion,
            datosAnteriores: l.datosAnteriores,
            datosNuevos: l.datosNuevos,
            direccionIp: null,
            userAgent: null,
            createdAt: l.createdAt,
            origen: 'ENCADENADA' as const,
            hashActual: l.hashActual,
            hashAnterior: l.hashPrevio,
          }));

    return [...operativos, ...encadenados]
      .sort((a, b) => {
        const tsA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tsB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tsB - tsA;
      })
      .slice(0, limitSafe)
      .map(filtrarRegistro);
  },

  async listarEventosSeguridad(limit = 50, client?: PoolClient) {
    if (db.isPostgresConnected()) {
      const sql = `
        SELECT id, tenant_id as "tenantId", empresa_id as "empresaId", usuario_id as "usuarioId",
               usuario_email as "usuarioEmail", tabla_afectada as "tablaAfectada", registro_id as "registroId",
               accion, datos_anteriores as "datosAnteriores", datos_nuevos as "datosNuevos",
               direccion_ip as "direccionIp", user_agent as "userAgent", created_at as "createdAt"
        FROM auditoria
        WHERE tabla_afectada IN ('estudio_configuracion', 'usuarios_estudio')
        ORDER BY created_at DESC
        LIMIT $1
      `;
      const res = client ? await client.query<RegistroAuditoria>(sql, [limit]) : await db.query<RegistroAuditoria>(sql, [limit]);
      return res.rows.map(filtrarRegistro);
    }
    return AUDITORIA_IN_MEMORY
      .filter(a => ['estudio_configuracion', 'usuarios_estudio'].includes(a.tablaAfectada || a.tabla || ''))
      .slice(0, limit)
      .map(filtrarRegistro);
  }
};
