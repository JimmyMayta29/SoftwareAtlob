import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { db } from '../config/database';
import { env } from '../config/env';
import { USUARIOS_ESTUDIO_MEMORIA } from './authJwtService';

export type TipoLicencia = 'EVALUACION' | 'COMERCIAL';

export interface LicenciaModel {
  id: string;
  tipo: TipoLicencia;
  maxUsuarios: number;
  vigenteHasta: string | null;
  creadaEn: string;
}

export interface EstadoCupoLicencia {
  permitido: boolean;
  usados: number;
  maxUsuarios: number;
  tipo: TipoLicencia;
  vigenteHasta: string | null;
  creadaEn: string;
  motivo?: string;
}

export interface ResumenLicencia {
  id: string;
  tipo: TipoLicencia;
  maxUsuarios: number;
  usuariosActivos: number;
  vigenteHasta: string | null;
  creadaEn: string;
  puedeCrearUsuario: boolean;
  motivoLimite: string | null;
}

let LICENCIA_MEMORIA: LicenciaModel | null = null;

function exigirAlmacen() {
  if (!db.isPostgresConnected() && (env.NODE_ENV === 'production' || env.DATABASE_URL)) {
    throw new Error('DATABASE_NO_DISPONIBLE');
  }
}

function consultar(sql: string, params: unknown[] = [], client?: PoolClient) {
  return client ? client.query(sql, params) : db.query(sql, params);
}

export function establecerLicenciaMemoria(licencia: LicenciaModel | null) {
  LICENCIA_MEMORIA = licencia;
}

export function obtenerLicenciaMemoria(): LicenciaModel | null {
  return LICENCIA_MEMORIA;
}

export const licenciaService = {
  async obtenerLicencia(client?: PoolClient, opciones?: { bloquear?: boolean }): Promise<LicenciaModel | null> {
    exigirAlmacen();
    if (db.isPostgresConnected()) {
      const bloqueo = client && opciones?.bloquear ? ' FOR UPDATE' : '';
      const res = await consultar(
        `SELECT id, tipo, max_usuarios AS "maxUsuarios", vigente_hasta AS "vigenteHasta", creada_en AS "creadaEn"
         FROM licencia
         ORDER BY creada_en DESC
         LIMIT 1${bloqueo}`,
        [],
        client
      );
      if (!res.rows[0]) return null;
      const fila = res.rows[0];
      return {
        id: String(fila.id),
        tipo: fila.tipo === 'COMERCIAL' ? 'COMERCIAL' : 'EVALUACION',
        maxUsuarios: Number(fila.maxUsuarios),
        vigenteHasta: fila.vigenteHasta ? new Date(fila.vigenteHasta).toISOString() : null,
        creadaEn: new Date(fila.creadaEn).toISOString(),
      };
    }
    return LICENCIA_MEMORIA;
  },

  async crearLicenciaInicial(
    client?: PoolClient,
    opciones?: { tipo?: TipoLicencia; maxUsuarios?: number; vigenteHasta?: string | null }
  ): Promise<LicenciaModel> {
    exigirAlmacen();
    const tipo: TipoLicencia = opciones?.tipo ?? 'EVALUACION';
    const maxUsuarios = opciones?.maxUsuarios ?? 3;
    const vigenteHasta = opciones?.vigenteHasta ?? null;
    const creadaEn = new Date().toISOString();

    if (db.isPostgresConnected()) {
      const existente = await this.obtenerLicencia(client, { bloquear: Boolean(client) });
      if (existente) return existente;
      const id = crypto.randomUUID();
      const res = await consultar(
        `INSERT INTO licencia (id, tipo, max_usuarios, vigente_hasta, creada_en)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING
         RETURNING id, tipo, max_usuarios AS "maxUsuarios", vigente_hasta AS "vigenteHasta", creada_en AS "creadaEn"`,
        [id, tipo, maxUsuarios, vigenteHasta, creadaEn],
        client
      );
      if (res.rows[0]) {
        const fila = res.rows[0];
        return {
          id: String(fila.id),
          tipo: fila.tipo,
          maxUsuarios: Number(fila.maxUsuarios),
          vigenteHasta: fila.vigenteHasta ? new Date(fila.vigenteHasta).toISOString() : null,
          creadaEn: new Date(fila.creadaEn).toISOString(),
        };
      }
      const recuperada = await this.obtenerLicencia(client);
      if (!recuperada) throw new Error('LICENCIA_NO_DISPONIBLE: No se pudo registrar la licencia inicial.');
      return recuperada;
    }

    if (!LICENCIA_MEMORIA) {
      LICENCIA_MEMORIA = {
        id: crypto.randomUUID(),
        tipo,
        maxUsuarios,
        vigenteHasta,
        creadaEn,
      };
    }
    return LICENCIA_MEMORIA;
  },

  async usuariosActivos(client?: PoolClient): Promise<number> {
    exigirAlmacen();
    if (db.isPostgresConnected()) {
      const res = await consultar(
        'SELECT COUNT(*)::int AS total FROM usuarios_estudio WHERE is_active = TRUE',
        [],
        client
      );
      return Number(res.rows[0]?.total ?? 0);
    }
    return USUARIOS_ESTUDIO_MEMORIA.filter(u => u.isActive).length;
  },

  async puedeCrearUsuario(client?: PoolClient, opciones?: { bloquear?: boolean }): Promise<EstadoCupoLicencia> {
    exigirAlmacen();
    if (db.isPostgresConnected() && client && opciones?.bloquear) {
      await client.query('SELECT pg_advisory_xact_lock(1398099540)');
    }
    const licencia = (await this.obtenerLicencia(client, opciones)) ?? {
      id: 'licencia-local-evaluacion',
      tipo: 'EVALUACION' as TipoLicencia,
      maxUsuarios: 3,
      vigenteHasta: null,
      creadaEn: new Date().toISOString(),
    };
    const usados = await this.usuariosActivos(client);

    if (licencia.vigenteHasta && new Date(licencia.vigenteHasta).getTime() < Date.now()) {
      return {
        permitido: false,
        usados,
        maxUsuarios: licencia.maxUsuarios,
        tipo: licencia.tipo,
        vigenteHasta: licencia.vigenteHasta,
        creadaEn: licencia.creadaEn,
        motivo: 'LICENCIA_VENCIDA: La vigencia de la licencia ha expirado. Contacta a soporte para renovarla.',
      };
    }

    if (usados >= licencia.maxUsuarios) {
      const etiqueta = licencia.tipo === 'COMERCIAL' ? 'Comercial' : 'Evaluación';
      return {
        permitido: false,
        usados,
        maxUsuarios: licencia.maxUsuarios,
        tipo: licencia.tipo,
        vigenteHasta: licencia.vigenteHasta,
        creadaEn: licencia.creadaEn,
        motivo: `LIMITE_LICENCIA_ALCANZADO: La licencia de ${etiqueta} permite un máximo de ${licencia.maxUsuarios} usuarios activos (${usados} de ${licencia.maxUsuarios} en uso). Desactiva un usuario existente o amplía tu licencia.`,
      };
    }

    return {
      permitido: true,
      usados,
      maxUsuarios: licencia.maxUsuarios,
      tipo: licencia.tipo,
      vigenteHasta: licencia.vigenteHasta,
      creadaEn: licencia.creadaEn,
    };
  },

  async validarCupoDisponible(client?: PoolClient): Promise<EstadoCupoLicencia> {
    const estado = await this.puedeCrearUsuario(client, { bloquear: Boolean(client) });
    if (!estado.permitido) {
      throw new Error(estado.motivo || 'LIMITE_LICENCIA_ALCANZADO: No hay cupos disponibles en la licencia.');
    }
    return estado;
  },

  async obtenerResumen(client?: PoolClient): Promise<ResumenLicencia> {
    const licencia = await this.obtenerLicencia(client);
    const estado = await this.puedeCrearUsuario(client);
    return {
      id: licencia?.id ?? 'licencia-local-evaluacion',
      tipo: estado.tipo,
      maxUsuarios: estado.maxUsuarios,
      usuariosActivos: estado.usados,
      vigenteHasta: estado.vigenteHasta,
      creadaEn: estado.creadaEn,
      puedeCrearUsuario: estado.permitido,
      motivoLimite: estado.motivo ?? null,
    };
  },
};
