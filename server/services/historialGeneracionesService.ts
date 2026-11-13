import crypto from 'crypto';
import { db } from '../config/database';
import { auditoriaRepository } from '../repositories/auditoriaRepository';

export interface HistorialGeneracionModel {
  id: string;
  empresaId: string;
  periodo: string; // YYYY-MM
  modulo: 'SIRE' | 'PLE';
  tipoOperacion: 'PROPUESTA_DESCARGA' | 'PROPUESTA_MANUAL' | 'REEMPLAZO_PROPUESTA' | 'AJUSTE_POSTERIOR' | 'LIBRO_ELECTRONICO';
  subtipo: string; // Ej: 'RCE', 'RVIE', '080100', '050100', etc.
  nombreArchivo: string;
  hashSha256: string;
  totalRegistros: number;
  totalImporte?: number;
  esOficial: boolean;
  ticketSunat?: string;
  usuarioId: string;
  createdAt: string;
}

export const HISTORIAL_GENERACIONES_MEMORIA: HistorialGeneracionModel[] = [];

export const historialGeneracionesService = {
  async registrarGeneracion(datos: {
    empresaId: string;
    periodo: string;
    modulo: 'SIRE' | 'PLE';
    tipoOperacion: HistorialGeneracionModel['tipoOperacion'];
    subtipo: string;
    nombreArchivo: string;
    hashSha256?: string;
    contenido?: string | Buffer;
    totalRegistros: number;
    totalImporte?: number;
    esOficial?: boolean;
    ticketSunat?: string;
    usuarioId: string;
  }): Promise<HistorialGeneracionModel> {
    let hash = datos.hashSha256;
    if (!hash && datos.contenido) {
      hash = crypto.createHash('sha256').update(datos.contenido).digest('hex');
    }
    if (!hash) {
      hash = crypto.createHash('sha256').update(`${datos.nombreArchivo}-${Date.now()}`).digest('hex');
    }

    const item: HistorialGeneracionModel = {
      id: `gen-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      empresaId: datos.empresaId,
      periodo: datos.periodo,
      modulo: datos.modulo,
      tipoOperacion: datos.tipoOperacion,
      subtipo: datos.subtipo,
      nombreArchivo: datos.nombreArchivo,
      hashSha256: hash,
      totalRegistros: datos.totalRegistros,
      totalImporte: datos.totalImporte !== undefined ? Number(datos.totalImporte.toFixed(2)) : undefined,
      esOficial: datos.esOficial ?? true,
      ticketSunat: datos.ticketSunat,
      usuarioId: datos.usuarioId,
      createdAt: new Date().toISOString()
    };

    HISTORIAL_GENERACIONES_MEMORIA.push(item);

    if (db.isPostgresConnected()) {
      try {
        const pleUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id)
          ? item.id
          : crypto.randomUUID();
        const usrUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(datos.usuarioId)
          ? datos.usuarioId
          : null;
        await db.query(`
          INSERT INTO ple_exportaciones (
            id, empresa_id, periodo, codigo_libro, nombre_archivo, contenido_txt,
            hash_sha256, total_filas, es_oficial, validaciones_superadas, usuario_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10)
        `, [
          pleUuid, datos.empresaId, datos.periodo, datos.subtipo, datos.nombreArchivo,
          datos.contenido ? String(datos.contenido) : '', item.hashSha256,
          datos.totalRegistros, item.esOficial, usrUuid
        ]);
      } catch {
        // Fallback a memoria
      }
    }

    await auditoriaRepository.registrar({
      empresaId: datos.empresaId,
      usuarioId: datos.usuarioId,
      tablaAfectada: 'historial_generaciones_electronicas',
      registroId: item.id,
      accion: 'REGISTRO_GENERACION',
      datosNuevos: {
        modulo: item.modulo,
        subtipo: item.subtipo,
        nombreArchivo: item.nombreArchivo,
        hash: item.hashSha256,
        totalRegistros: item.totalRegistros
      }
    });

    return item;
  },

  listarPorEmpresa(empresaId: string, filtros?: { modulo?: 'SIRE' | 'PLE'; periodo?: string }): HistorialGeneracionModel[] {
    return HISTORIAL_GENERACIONES_MEMORIA.filter(item => {
      if (item.empresaId !== empresaId) return false;
      if (filtros?.modulo && item.modulo !== filtros.modulo) return false;
      if (filtros?.periodo && item.periodo !== filtros.periodo) return false;
      return true;
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  obtenerPorId(id: string): HistorialGeneracionModel | null {
    return HISTORIAL_GENERACIONES_MEMORIA.find(h => h.id === id) || null;
  }
};

