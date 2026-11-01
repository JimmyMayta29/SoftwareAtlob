import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, ROLES_ESCRITURA, ROLES_LECTURA } from '../middlewares/auth';
import { empresaGuard } from '../middlewares/empresaGuard';
import { prorrataIgvService } from '../services/prorrataIgvService';
import { successResponse, errorResponse } from '../utils/response';

const router = Router();

router.use(requireAuth);

const calcularProrrataSchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/),
  ventasGravadasOverride: z.number().nonnegative().optional(),
  exportacionesOverride: z.number().nonnegative().optional(),
  ventasNoGravadasOverride: z.number().nonnegative().optional(),
  baseDestinoComunOverride: z.number().nonnegative().optional(),
  igvDestinoComunOverride: z.number().nonnegative().optional(),
  integrarEnPdt621: z.boolean().optional(),
  usarVentana12Meses: z.boolean().optional()
});

router.get('/', empresaGuard({ rolesPermitidos: ROLES_LECTURA, bloquearPeriodoCerrado: false }), async (req: Request, res: Response) => {
  try {
    const empresaId = req.empresaId!;
    const periodo = (req.query.periodo as string) || '2026-09';
    const usarVentana12Meses = req.query.usar12m === 'true';
    const resultado = await prorrataIgvService.calcularProrrata(empresaId, periodo, { usarVentana12Meses });
    return successResponse(res, resultado);
  } catch (err: any) {
    return errorResponse(res, err.message || 'Error calculando Prorrata del IGV', 400);
  }
});

router.post('/calcular', empresaGuard({ rolesPermitidos: ROLES_ESCRITURA }), async (req: Request, res: Response) => {
  try {
    const empresaId = req.empresaId!;
    const parsed = calcularProrrataSchema.safeParse(req.body);
    if (!parsed.success) {
      return errorResponse(res, 'Parámetros de prorrata inválidos', 400, parsed.error.issues);
    }
    const { periodo, ...opciones } = parsed.data;
    const resultado = await prorrataIgvService.calcularProrrata(empresaId, periodo, opciones);
    return successResponse(res, resultado);
  } catch (err: any) {
    return errorResponse(res, err.message || 'Error procesando Prorrata del IGV', 400);
  }
});

router.patch('/integracion-pdt621', empresaGuard({ rolesPermitidos: ROLES_ESCRITURA }), async (req: Request, res: Response) => {
  try {
    const empresaId = req.empresaId!;
    const { periodo = '2026-09', integrarEnPdt621 = true } = req.body || {};
    const resultado = await prorrataIgvService.configurarIntegracionPdt621(empresaId, String(periodo), Boolean(integrarEnPdt621));
    return successResponse(res, resultado);
  } catch (err: any) {
    return errorResponse(res, err.message || 'Error actualizando integración de Prorrata con PDT 621', 400);
  }
});

export const prorrataIgvRoutes = router;
