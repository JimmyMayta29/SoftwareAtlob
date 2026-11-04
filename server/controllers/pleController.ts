import { Request, Response } from 'express';
import { z } from 'zod';
import { pleExportService } from '../services/pleExportService';
import { archivoValidadorService } from '../services/archivoValidadorService';
import { historialGeneracionesService } from '../services/historialGeneracionesService';
import { sunatJobsService } from '../services/sunatJobsService';
import { empresaDemoService } from '../services/empresaDemoService';
import { successResponse, errorResponse } from '../utils/response';

export const exportarPleSchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/, 'El período debe tener formato YYYY-MM'),
  codigoLibro: z.string().min(1, 'Código de libro requerido'),
  ruc: z.string().length(11).optional(),
  sinMovimiento: z.boolean().optional().default(false),
  esOficial: z.boolean().optional(),
  moneda: z.enum(['PEN', 'USD']).optional()
});

export const prevalidarPleSchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/, 'El período debe tener formato YYYY-MM'),
  codigoLibro: z.string().min(1, 'Código de libro requerido')
});

export const validarTxtPleSchema = z.object({
  contenidoTxt: z.string().min(1, 'Contenido del archivo TXT requerido'),
  codigoLibro: z.string().optional(),
  nombreArchivo: z.string().optional()
});

export const pleController = {
  // 1. Catálogo de libros configurados
  async listarLibros(req: Request, res: Response) {
    try {
      const libros = pleExportService.listarLibrosConfig();
      return successResponse(res, libros);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  // 2. Prevalidación técnica y contable
  async prevalidar(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const periodo = req.query.periodo as string || '2026-09';
      const codigoLibro = req.query.codigoLibro as string || '080100';

      const prev = await pleExportService.prevalidar(empresaId, periodo, codigoLibro);
      return successResponse(res, prev);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  // 3. Generación y exportación de archivo oficial PLE
  async exportar(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      empresaDemoService.validarOperacionOficialPermitida(empresaId, 'PLE_ENVIO');
      const data = exportarPleSchema.parse(req.body);
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';

      // Exportación directa
      const exp = await pleExportService.exportarLibro(
        empresaId,
        data.periodo,
        data.codigoLibro,
        data.ruc || '20601234567',
        userId,
        { sinMovimiento: data.sinMovimiento, esOficial: data.esOficial, moneda: data.moneda }
      );

      // Registrar en historial oficial
      await historialGeneracionesService.registrarGeneracion({
        empresaId,
        periodo: data.periodo,
        modulo: 'PLE',
        tipoOperacion: 'LIBRO_ELECTRONICO',
        subtipo: data.codigoLibro,
        nombreArchivo: exp.nombreArchivo,
        hashSha256: exp.hashSha256,
        totalRegistros: exp.totalFilas,
        totalImporte: exp.totalesControl.sumaTotal || exp.totalesControl.sumaDebe,
        esOficial: exp.esOficial,
        usuarioId: userId
      });

      return successResponse(res, exp, 'Archivo plano de libro electrónico PLE generado exitosamente.');
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  // 4. Encolar exportación como job asíncrono
  async exportarJob(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      empresaDemoService.validarOperacionOficialPermitida(empresaId, 'PLE_ENVIO');
      const data = exportarPleSchema.parse(req.body);

      const job = sunatJobsService.crearJob(empresaId, 'GENERACION_PLE', {
        periodo: data.periodo,
        codigoLibro: data.codigoLibro,
        ruc: data.ruc
      });

      return successResponse(res, { jobId: job.id, estado: job.estado }, 'Generación de archivo PLE encolada.', 202);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  // 5. Consultar exportación generada
  async obtenerExportacion(req: Request, res: Response) {
    try {
      const id = req.params.id;
      const exportacion = pleExportService.obtenerExportacion(id);
      if (!exportacion) return errorResponse(res, 'EXPORTACION_NO_ENCONTRADA', 404);
      return successResponse(res, exportacion);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async listarExportaciones(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const exportaciones = pleExportService.listarExportaciones(empresaId);
      return successResponse(res, exportaciones);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  // 6. Lector y validador de archivos TXT PLE informando errores por línea y columna
  async validarTxt(req: Request, res: Response) {
    try {
      const data = validarTxtPleSchema.parse(req.body);
      const resultado = archivoValidadorService.validarArchivoTxt(
        data.contenidoTxt,
        data.codigoLibro,
        data.nombreArchivo
      );
      return successResponse(res, resultado);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  // 7. Historial de exportaciones PLE
  async listarHistorial(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const periodo = req.query.periodo as string | undefined;
      const historial = historialGeneracionesService.listarPorEmpresa(empresaId, { modulo: 'PLE', periodo });
      return successResponse(res, historial);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  // 8. Consulta de estado de trabajo asíncrono
  async consultarJob(req: Request, res: Response) {
    try {
      const jobId = req.params.id;
      const job = sunatJobsService.obtenerJob(jobId);
      if (!job) return errorResponse(res, 'Trabajo no encontrado.', 404);
      return successResponse(res, job);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  }
};

