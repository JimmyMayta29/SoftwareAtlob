import { randomUUID } from 'node:crypto';
import { conContextoEmpresa, db } from '../config/database';
import { authJwtService } from './authJwtService';
import { sireService } from './sireService';
import { xmlImportService } from './xmlImportService';
import { pleExportService } from './pleExportService';
import { cryptoService } from './cryptoService';

export interface SunatJobModel {
  id: string;
  empresaId: string;
  tipoTrabajo: 'DESCARGA_SIRE_COMPRAS' | 'DESCARGA_SIRE_VENTAS' | 'IMPORTACION_XML_LOTE' | 'GENERACION_PLE';
  parametros: any;
  estado: 'EN_COLA' | 'PROCESANDO' | 'COMPLETADO' | 'ERROR';
  progreso: number; // 0 a 100
  reintentos: number;
  maxReintentos: number;
  resultado?: any;
  errorMensaje?: string;
  createdAt: string;
  updatedAt: string;
}

export const SUNAT_JOBS_MEMORIA: SunatJobModel[] = [];

async function guardarAvance(job: SunatJobModel, userId: string) {
  if (!db.isPostgresConnected()) return;
  await db.withTenantAndEmpresa(userId, job.empresaId, client => client.query(`
    UPDATE sunat_jobs SET estado=$3, progreso=$4, reintentos=$5, resultado=$6, error_mensaje=$7, updated_at=CURRENT_TIMESTAMP
    WHERE id=$1 AND empresa_id=$2
  `, [job.id, job.empresaId, job.estado, job.progreso, job.reintentos,
    job.resultado === undefined ? null : JSON.stringify(cryptoService.sanitizarObjeto(job.resultado)), job.errorMensaje ?? null]));
}

export const sunatJobsService = {
  /**
   * Crea un nuevo trabajo en segundo plano
   */
  async crearJob(
    empresaId: string,
    tipoTrabajo: SunatJobModel['tipoTrabajo'],
    parametros: any,
    userId?: string
  ): Promise<SunatJobModel> {
    const postgres = db.isPostgresConnected();
    const job: SunatJobModel = {
      id: postgres ? randomUUID() : `job-${randomUUID()}`,
      empresaId,
      tipoTrabajo,
      parametros: cryptoService.sanitizarObjeto(parametros),
      estado: 'EN_COLA',
      progreso: 0,
      reintentos: 0,
      maxReintentos: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (postgres) {
      if (!userId) throw new Error('USUARIO_REQUERIDO');
      await db.withTenantAndEmpresa(userId, empresaId, client => client.query(`
        INSERT INTO sunat_jobs (id, empresa_id, tipo_trabajo, parametros) VALUES ($1,$2,$3,$4)
      `, [job.id, empresaId, tipoTrabajo, JSON.stringify(job.parametros)]));
    } else {
      SUNAT_JOBS_MEMORIA.push(job);
    }

    // Ejecutar procesamiento asíncrono
    setTimeout(() => {
      this.procesarJob(job, userId || 'SISTEMA_JOB_RUNNER').catch(() => {});
    }, 50);

    return job;
  },

  async obtenerJob(jobId: string, empresaId?: string): Promise<SunatJobModel | null> {
    if (db.isPostgresConnected()) {
      if (!empresaId || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(jobId)) return null;
      const res = await db.query<SunatJobModel>(`
        SELECT id, empresa_id AS "empresaId", tipo_trabajo AS "tipoTrabajo", estado, progreso, reintentos,
          max_reintentos AS "maxReintentos", resultado, error_mensaje AS "errorMensaje",
          created_at AS "createdAt", updated_at AS "updatedAt"
        FROM sunat_jobs WHERE id=$1 AND empresa_id=$2
      `, [jobId, empresaId]);
      return res.rows[0] ?? null;
    }
    return SUNAT_JOBS_MEMORIA.find(j => j.id === jobId && (!empresaId || j.empresaId === empresaId)) || null;
  },

  /**
   * Procesa un trabajo en la cola con reintentos y retroceso exponencial
   */
  async procesarJob(job: SunatJobModel, userId: string) {
    if (job.estado === 'COMPLETADO' || job.estado === 'ERROR') return;
    if (db.isPostgresConnected()) {
      const membresias = await authJwtService.obtenerMembresias(userId);
      if (!membresias.some(m => m.empresaId === job.empresaId && m.estado === 'ACTIVO' && m.rolEnEmpresa !== 'AUDITOR_REVISOR')) {
        job.estado = 'ERROR';
        job.errorMensaje = 'PERMISO_INSUFICIENTE';
        await guardarAvance(job, userId);
        return;
      }
    }
    return conContextoEmpresa(job.empresaId, userId, () => this.ejecutarJob(job, userId));
  },

  async ejecutarJob(job: SunatJobModel, userId: string) {

    job.estado = 'PROCESANDO';
    job.progreso = 25;
    job.updatedAt = new Date().toISOString();

    try {
      await guardarAvance(job, userId);
      if (job.tipoTrabajo === 'DESCARGA_SIRE_COMPRAS') {
        job.progreso = 50;
        const res = await sireService.descargarPropuesta(job.empresaId, 'COMPRAS', job.parametros.periodo, userId);
        job.progreso = 100;
        job.estado = 'COMPLETADO';
        job.resultado = {
          totalRegistros: res.totalRegistros,
          totalImporte: res.totalImporte,
          hash: res.hashArchivo
        };
      } else if (job.tipoTrabajo === 'DESCARGA_SIRE_VENTAS') {
        job.progreso = 50;
        const res = await sireService.descargarPropuesta(job.empresaId, 'VENTAS', job.parametros.periodo, userId);
        job.progreso = 100;
        job.estado = 'COMPLETADO';
        job.resultado = {
          totalRegistros: res.totalRegistros,
          totalImporte: res.totalImporte,
          hash: res.hashArchivo
        };
      } else if (job.tipoTrabajo === 'IMPORTACION_XML_LOTE') {
        job.progreso = 50;
        const archivos = job.parametros.archivos || [];
        const res = await xmlImportService.importarLote(job.empresaId, archivos, userId);
        job.progreso = 100;
        job.estado = 'COMPLETADO';
        job.resultado = res;
      } else if (job.tipoTrabajo === 'GENERACION_PLE') {
        job.progreso = 50;
        const res = await pleExportService.exportarLibro(
          job.empresaId,
          job.parametros.periodo,
          job.parametros.codigoLibro,
          job.parametros.ruc || '20601234567',
          userId
        );
        job.progreso = 100;
        job.estado = 'COMPLETADO';
        job.resultado = {
          exportacionId: res.id,
          nombreArchivo: res.nombreArchivo,
          totalFilas: res.totalFilas,
          hash: res.hashSha256,
          esOficial: res.esOficial
        };
      }
    } catch (err: any) {
      job.reintentos++;
      const sanitizado = cryptoService.sanitizarError(err);
      if (job.reintentos < job.maxReintentos) {
        job.estado = 'EN_COLA';
        job.errorMensaje = `Reintento ${job.reintentos}/${job.maxReintentos}: ${sanitizado}`;
        const backoffMs = Math.pow(2, job.reintentos) * 1000;
        setTimeout(() => {
          this.procesarJob(job, userId).catch(() => {});
        }, backoffMs);
      } else {
        job.estado = 'ERROR';
        job.errorMensaje = sanitizado;
      }
    } finally {
      job.updatedAt = new Date().toISOString();
      await guardarAvance(job, userId);
    }
  }
};
