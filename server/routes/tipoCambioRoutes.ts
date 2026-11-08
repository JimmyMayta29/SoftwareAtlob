import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/auth';
import { tipoCambioService } from '../services/tipoCambioService';
import { successResponse, errorResponse } from '../utils/response';

const router = Router();

router.use(requireAuth);

const tipoCambioSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  compra: z.number().positive('El tipo de cambio compra debe ser positivo'),
  venta: z.number().positive('El tipo de cambio venta debe ser positivo'),
  fuente: z.enum(['SUNAT', 'SBS', 'MANUAL']).default('MANUAL')
});

// GET /api/tipo-cambio/vigente?fecha=YYYY-MM-DD
router.get('/vigente', async (req: Request, res: Response) => {
  try {
    const fecha = req.query.fecha as string | undefined;
    const tc = await tipoCambioService.obtenerVigente(fecha);
    return successResponse(res, tc);
  } catch (err: any) {
    return errorResponse(res, err.message || 'Error al obtener tipo de cambio vigente', 500);
  }
});

// GET /api/tipo-cambio?fecha=YYYY-MM-DD
router.get('/', async (req: Request, res: Response) => {
  try {
    const fecha = req.query.fecha as string | undefined;
    if (fecha) {
      const tc = await tipoCambioService.obtenerPorFecha(fecha);
      return successResponse(res, tc);
    }
    const limite = req.query.limite ? parseInt(req.query.limite as string, 10) : 30;
    const lista = await tipoCambioService.listar(limite);
    return successResponse(res, lista);
  } catch (err: any) {
    return errorResponse(res, err.message || 'Error al listar tipos de cambio', 500);
  }
});

// POST /api/tipo-cambio
router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = tipoCambioSchema.safeParse(req.body);
    if (!parsed.success) {
      return errorResponse(res, 'Datos de tipo de cambio inválidos', 400, parsed.error.issues);
    }
    const user = (req as any).user;
    const tc = await tipoCambioService.guardar({
      ...parsed.data,
      usuarioId: user?.id
    });
    return successResponse(res, tc, 'Tipo de cambio guardado exitosamente', 201);
  } catch (err: any) {
    return errorResponse(res, err.message || 'Error al guardar tipo de cambio', 400);
  }
});

export const tipoCambioRoutes = router;
