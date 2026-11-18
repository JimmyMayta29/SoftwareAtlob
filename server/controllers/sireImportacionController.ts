import { Request, Response } from 'express';
import { z } from 'zod';
import { sireImportacionService } from '../services/sireImportacionService';
import { successResponse, errorResponse } from '../utils/response';
import { sanitizarMensaje } from '../utils/seguridadDatos';

export const analizarSireSchema = z.object({
  tipo: z.enum(['COMPRAS', 'VENTAS']),
  periodo: z.string().min(6, 'El período debe tener al menos 6 caracteres'),
  nombreArchivo: z.string().min(1, 'Nombre de archivo requerido'),
  archivoBase64: z.string().min(1, 'Contenido base64 requerido')
});

export const contabilizarSireSchema = z.object({
  tipo: z.enum(['COMPRAS', 'VENTAS']),
  periodo: z.string().min(6, 'El período debe tener al menos 6 caracteres'),
  filas: z.array(z.any()).min(1, 'Debe enviar al menos una fila para contabilizar')
});

export const sireImportacionController = {
  async analizar(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const data = analizarSireSchema.parse(req.body);
      const buffer = Buffer.from(data.archivoBase64, 'base64');

      const resultado = await sireImportacionService.analizarArchivoZip(
        empresaId,
        data.tipo,
        data.periodo,
        buffer,
        data.nombreArchivo
      );

      return successResponse(res, resultado, 'Análisis de archivo SIRE completado exitosamente.');
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async contabilizar(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const data = contabilizarSireSchema.parse(req.body);
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';

      const resultado = await sireImportacionService.contabilizarFilasSeleccionadas(
        empresaId,
        data.tipo,
        data.periodo,
        data.filas,
        userId
      );

      return successResponse(res, resultado, 'Comprobantes aprobados y contabilizados exitosamente.');
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async obtenerReglas(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const reglas = sireImportacionService.obtenerReglasMapeo(empresaId);
      return successResponse(res, reglas);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async guardarReglas(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const reglas = req.body;
      const actualizadas = sireImportacionService.guardarReglasMapeo(empresaId, reglas);
      return successResponse(res, actualizadas, 'Reglas de mapeo SIRE guardadas exitosamente.');
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  }
};
