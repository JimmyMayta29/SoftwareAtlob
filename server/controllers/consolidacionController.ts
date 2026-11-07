import { Request, Response } from 'express';
import { consolidacionMensualService } from '../services/consolidacionMensualService';
import { successResponse, errorResponse } from '../utils/response';

export const consolidacionController = {
  async calcular(req: Request, res: Response) {
    try {
      const empresaId = req.empresaId;
      const { periodoId } = req.body;
      const userId = req.user?.id || 'usr-default';
      if (!empresaId || !periodoId) {
        return errorResponse(res, 'empresaId y periodoId son obligatorios', 400);
      }
      const resultado = await consolidacionMensualService.calcular(empresaId, periodoId, userId);
      return successResponse(res, resultado);
    } catch (error: any) {
      return errorResponse(res, error.message || 'Error al calcular consolidación mensual', 400);
    }
  },

  async contabilizar(req: Request, res: Response) {
    try {
      const empresaId = req.empresaId;
      const { periodoId } = req.body;
      const userId = req.user?.id || 'usr-default';
      if (!empresaId || !periodoId) {
        return errorResponse(res, 'empresaId y periodoId son obligatorios', 400);
      }
      const resultado = await consolidacionMensualService.contabilizar(empresaId, periodoId, userId);
      return successResponse(res, resultado, 'Consolidación mensual contabilizada con éxito');
    } catch (error: any) {
      return errorResponse(res, error.message || 'Error al contabilizar consolidación mensual', 400);
    }
  },

  async extornar(req: Request, res: Response) {
    try {
      const empresaId = req.empresaId;
      const { periodoId, motivo } = req.body;
      const userId = req.user?.id || 'usr-default';
      if (!empresaId || !periodoId || !motivo) {
        return errorResponse(res, 'empresaId, periodoId y motivo son obligatorios', 400);
      }
      const resultado = await consolidacionMensualService.extornar(empresaId, periodoId, userId, motivo);
      return successResponse(res, resultado, 'Consolidación mensual extornada con éxito');
    } catch (error: any) {
      return errorResponse(res, error.message || 'Error al extornar consolidación mensual', 400);
    }
  }
};

