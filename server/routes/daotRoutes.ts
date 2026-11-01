import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, ROLES_ESCRITURA, ROLES_LECTURA } from '../middlewares/auth';
import { empresaGuard } from '../middlewares/empresaGuard';
import { daotService } from '../services/daotService';
import { successResponse, errorResponse } from '../utils/response';

const router = Router();

router.use(requireAuth);

const exclusionSchema = z.object({
  anio: z.number().int().min(2020).max(2035).default(2026),
  tipoOperacion: z.enum(['COMPRA', 'VENTA', 'AMBOS']).default('AMBOS'),
  rucTercero: z.string().min(8).max(15),
  razonSocialTercero: z.string().optional(),
  comprobanteId: z.string().nullable().optional(),
  motivoExclusion: z.string().min(4).max(300)
});

router.get('/', empresaGuard({ rolesPermitidos: ROLES_LECTURA, bloquearPeriodoCerrado: false }), async (req: Request, res: Response) => {
  try {
    const empresaId = req.empresaId!;
    const anio = Number(req.query.anio) || 2026;
    const resultado = await daotService.procesarDaot(empresaId, anio);
    return successResponse(res, resultado);
  } catch (err: any) {
    return errorResponse(res, err.message || 'Error procesando DAOT', 400);
  }
});

router.post('/excluir', empresaGuard({ rolesPermitidos: ROLES_ESCRITURA }), async (req: Request, res: Response) => {
  try {
    const empresaId = req.empresaId!;
    const parsed = exclusionSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return errorResponse(res, 'Datos de exclusión DAOT inválidos', 400, parsed.error.issues);
    }
    const user = (req as any).user;
    const userId = user?.id || 'usr-contador-01';
    const exclusion = daotService.registrarExclusion(empresaId, parsed.data, userId);
    const resumen = await daotService.procesarDaot(empresaId, parsed.data.anio);
    return successResponse(res, { exclusion, resumen });
  } catch (err: any) {
    return errorResponse(res, err.message || 'Error excluyendo tercero de DAOT', 400);
  }
});

router.delete('/excluir/:exclusionId', empresaGuard({ rolesPermitidos: ROLES_ESCRITURA }), async (req: Request, res: Response) => {
  try {
    const empresaId = req.empresaId!;
    const anio = Number(req.query.anio) || 2026;
    const user = (req as any).user;
    const userId = user?.id || 'usr-contador-01';
    daotService.eliminarExclusion(empresaId, String(req.params.exclusionId), userId);
    const resumen = await daotService.procesarDaot(empresaId, anio);
    return successResponse(res, resumen);
  } catch (err: any) {
    return errorResponse(res, err.message || 'Error restaurando tercero en DAOT', 400);
  }
});

export const daotRoutes = router;
