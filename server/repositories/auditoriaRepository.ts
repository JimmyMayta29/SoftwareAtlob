import { db } from '../config/database';
import type { PoolClient } from 'pg';
import { auditoriaChainService } from '../services/auditoriaChainService';
import { filtrarDetalleAuditoria, sanitizarMensaje } from '../utils/seguridadDatos';

export interface RegistroAuditoria {
  tenantId?: string;
  empresaId?: string;
  usuarioId?: string;
  usuarioEmail?: string;
  tablaAfectada?: string;
  tabla?: string;
  registroId: string;
  accion: 'INSERT' | 'UPDATE' | 'DELETE' | 'ANULAR' | 'CIERRE_PERIODO' | 'LOGIN' | string;
  datosAnteriores?: any;
  valoresAnteriores?: any;
  datosNuevos?: any;
  valoresNuevos?: any;
  direccionIp?: string;
  userAgent?: string;
}

const AUDITORIA_IN_MEMORY: (RegistroAuditoria & { id: string; createdAt: string })[] = [];

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
          registro.accion,
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

  async listarPorEmpresa(empresaId: string, limit = 50) {
    if (db.isPostgresConnected()) {
      const res = await db.query<RegistroAuditoria>(`
        SELECT id, tenant_id as "tenantId", empresa_id as "empresaId", usuario_id as "usuarioId",
               usuario_email as "usuarioEmail", tabla_afectada as "tablaAfectada", registro_id as "registroId",
               accion, datos_anteriores as "datosAnteriores", datos_nuevos as "datosNuevos",
               direccion_ip as "direccionIp", user_agent as "userAgent", created_at as "createdAt"
        FROM auditoria
        WHERE empresa_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [empresaId, limit]);
      return res.rows.map(filtrarRegistro);
    }
    return AUDITORIA_IN_MEMORY.filter(a => a.empresaId === empresaId).slice(0, limit).map(filtrarRegistro);
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
