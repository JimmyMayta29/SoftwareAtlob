import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRol } from '../middlewares/auth';
import { cronogramaVencimientosService, DigitoRucCronograma } from '../services/cronogramaVencimientosService';
import { successResponse, errorResponse } from '../utils/response';

const router = Router();

router.use(requireAuth);

const actualizarCronogramaSchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/),
  ultimoDigitoRuc: z.enum(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'B']),
  fechaVencimientoPdt621: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fechaVencimientoPlame: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fechaVencimientoSire: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fechaVencimientoDaot: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fechaVencimientoRentaAnual: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fuenteResolucion: z.string().max(150).optional(),
  esSupuestoValidar: z.boolean().optional()
});

router.get('/', (req: Request, res: Response) => {
  try {
    const periodo = (req.query.periodo as string) || '2026-09';
    const ruc = (req.query.ruc as string) || '20100000001';
    const buenContribuyente = req.query.buenContribuyente === 'true';
    const filas = cronogramaVencimientosService.listarPorPeriodo(periodo);
    const alertaEmpresa = cronogramaVencimientosService.calcularAlertaVencimiento(periodo, ruc, buenContribuyente);
    return successResponse(res, { filas, alertaEmpresa });
  } catch (err: any) {
    return errorResponse(res, err.message || 'Error consultando cronograma de vencimientos', 400);
  }
});

router.put('/', requireRol(['ADMIN_ESTUDIO', 'ADMINISTRADOR', 'ADMIN']), async (req: Request, res: Response) => {
  try {
    const parsed = actualizarCronogramaSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return errorResponse(res, 'Datos de cronograma inválidos', 400, parsed.error.issues);
    }
    const user = (req as any).user;
    const rol = (req as any).userRolEnEmpresa || user?.rolGlobal || 'ADMINISTRADOR';
    const userId = user?.id || 'usr-admin-01';
    const empresaId = req.empresaId || '00000000-0000-0000-0000-000000000001';

    const actualizada = await cronogramaVencimientosService.actualizarFilaCronograma(
      parsed.data as { periodo: string; ultimoDigitoRuc: DigitoRucCronograma },
      userId,
      rol,
      empresaId
    );
    return successResponse(res, actualizada);
  } catch (err: any) {
    if (err.message?.includes('PERMISO_DENEGADO')) {
      return errorResponse(res, err.message, 403);
    }
    return errorResponse(res, err.message || 'Error actualizando cronograma de vencimientos', 400);
  }
});

export const cronogramaVencimientosRoutes = router;
