import { Request, Response } from 'express';
import { z } from 'zod';
import { parametroRepository } from '../repositories/parametroRepository';
import { successResponse, errorResponse } from '../utils/response';

const guardarParametroSchema = z.object({
  codigoParametro: z.string().min(2).max(60),
  descripcion: z.string().min(3).max(200),
  valorNumerico: z.number().nonnegative(),
  vigenteDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vigenteHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  categoria: z.enum(['IGV', 'RENTA', 'LABORAL', 'DETRACCIONES', 'UIT', 'AFP']).default('RENTA'),
  motivo: z.string().optional()
});

export const parametroController = {
  async listar(req: Request, res: Response) {
    try {
      const parametros = await parametroRepository.obtenerParametros();
      return successResponse(res, parametros);
    } catch (error) {
      return errorResponse(res, 'Error consultando parámetros tributarios');
    }
  },

  async historial(req: Request, res: Response) {
    try {
      const historial = parametroRepository.obtenerHistorialCambios();
      return successResponse(res, historial);
    } catch (error) {
      return errorResponse(res, 'Error consultando historial de parámetros tributarios');
    }
  },

  async guardar(req: Request, res: Response) {
    try {
      const parsed = guardarParametroSchema.safeParse(req.body);
      if (!parsed.success) {
        return errorResponse(res, 'Datos de parámetro inválidos', 400, parsed.error.issues);
      }

      const user = (req as any).user;
      const rol = String(req.userRolEnEmpresa || user?.rolGlobal || 'CONTADOR_SENIOR');
      const userId = user?.id || 'usr-admin-01';
      const empresaId = req.empresaId || '00000000-0000-0000-0000-000000000001';

      const actualizado = await parametroRepository.guardarOActualizarParametro(
        parsed.data,
        userId,
        rol,
        empresaId
      );
      return successResponse(res, actualizado);
    } catch (error: any) {
      if (error.message?.includes('PERMISO_DENEGADO')) {
        return errorResponse(res, error.message, 403);
      }
      return errorResponse(res, error.message || 'Error actualizando parámetro tributario', 400);
    }
  },

  async obtenerCronograma(req: Request, res: Response) {
    try {
      const { periodo = '2026-09', digito = '0' } = req.query as { periodo?: string; digito?: string };
      const cronograma = await parametroRepository.obtenerCronograma(periodo, digito);
      return successResponse(res, cronograma);
    } catch (error) {
      return errorResponse(res, 'Error consultando cronograma de vencimientos');
    }
  }
};
