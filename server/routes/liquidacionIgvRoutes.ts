import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, ROLES_ESCRITURA, ROLES_LECTURA } from '../middlewares/auth';
import { empresaGuard } from '../middlewares/empresaGuard';
import { liquidacionIGVService } from '../services/liquidacionIGVService';
import { successResponse, errorResponse } from '../utils/response';

const router = Router();

router.use(requireAuth);

const opcionesPdt621Schema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/).default('2026-09'),
  saldoAnteriorAFavor: z.number().nonnegative().optional(),
  retencionesPeriodo: z.number().nonnegative().optional(),
  percepcionesPeriodo: z.number().nonnegative().optional(),
  regimenOverride: z.enum(['MYPE_TRIBUTARIO', 'REGIMEN_GENERAL', 'REGIMEN_ESPECIAL', 'NRUS']).optional(),
  coeficienteRentaOverride: z.number().min(0).max(1).optional(),
  ingresosAcumuladosAnioUIT: z.number().nonnegative().optional(),
  saldoFavorRentaAnterior: z.number().nonnegative().optional(),
  integrarProrrata: z.boolean().optional(),
  porcentajeProrrataOverride: z.number().min(0).max(100).optional()
});

const presentarSchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/),
  numeroOrden: z.string().min(3).max(40),
  fechaPresentacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

router.get('/', empresaGuard({ rolesPermitidos: ROLES_LECTURA, bloquearPeriodoCerrado: false }), async (req: Request, res: Response) => {
  try {
    const empresaId = req.empresaId || (req.headers['x-empresa-id'] as string);
    const periodo = (req.query.periodo as string) || '2026-09';
    const saldoAnterior = req.query.saldoAnterior !== undefined ? Number(req.query.saldoAnterior) : undefined;
    const retenciones = req.query.retenciones !== undefined ? Number(req.query.retenciones) : undefined;
    const percepciones = req.query.percepciones !== undefined ? Number(req.query.percepciones) : undefined;
    const integrarProrrata = req.query.integrarProrrata !== undefined ? req.query.integrarProrrata === 'true' : undefined;

    const liquidacion = await liquidacionIGVService.calcular(empresaId, periodo, {
      saldoAnteriorAFavor: saldoAnterior,
      retencionesPeriodo: retenciones,
      percepcionesPeriodo: percepciones,
      integrarProrrata
    });
    const historial = liquidacionIGVService.obtenerHistorial(empresaId, periodo);
    return successResponse(res, { liquidacion, historial });
  } catch (err: any) {
    return errorResponse(res, err.message || 'Error calculando declaración PDT 621', 400);
  }
});

router.get('/historial', empresaGuard({ rolesPermitidos: ROLES_LECTURA, bloquearPeriodoCerrado: false }), async (req: Request, res: Response) => {
  try {
    const empresaId = req.empresaId || (req.headers['x-empresa-id'] as string);
    const periodo = (req.query.periodo as string) || '2026-09';
    const historial = liquidacionIGVService.obtenerHistorial(empresaId, periodo);
    return successResponse(res, historial);
  } catch (err: any) {
    return errorResponse(res, err.message || 'Error consultando historial PDT 621', 400);
  }
});

router.post('/preliquidar', empresaGuard({ rolesPermitidos: ROLES_ESCRITURA }), async (req: Request, res: Response) => {
  try {
    const empresaId = req.empresaId || (req.headers['x-empresa-id'] as string);
    const parsed = opcionesPdt621Schema.safeParse(req.body || {});
    if (!parsed.success) {
      return errorResponse(res, 'Parámetros de preliquidación inválidos', 400, parsed.error.issues);
    }
    const user = (req as any).user;
    const rol = String(req.userRolEnEmpresa || user?.rolGlobal || 'CONTADOR_SENIOR');
    const userId = user?.id || 'usr-contador-01';
    const { periodo, ...opciones } = parsed.data;

    const resultado = await liquidacionIGVService.preliquidar(empresaId, periodo, userId, rol, opciones);
    return successResponse(res, resultado);
  } catch (err: any) {
    if (err.message?.includes('PERMISO_DENEGADO')) {
      return errorResponse(res, err.message, 403);
    }
    return errorResponse(res, err.message || 'Error al preliquidar PDT 621', 400);
  }
});

router.post('/presentar', empresaGuard({ rolesPermitidos: ROLES_ESCRITURA }), async (req: Request, res: Response) => {
  try {
    const empresaId = req.empresaId || (req.headers['x-empresa-id'] as string);
    const parsed = presentarSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return errorResponse(res, 'Datos de presentación inválidos', 400, parsed.error.issues);
    }
    const user = (req as any).user;
    const rol = String(req.userRolEnEmpresa || user?.rolGlobal || 'CONTADOR_SENIOR');
    const userId = user?.id || 'usr-contador-01';

    const resultado = await liquidacionIGVService.presentar(
      empresaId,
      parsed.data.periodo,
      {
        numeroOrden: parsed.data.numeroOrden,
        fechaPresentacion: parsed.data.fechaPresentacion
      },
      userId,
      rol
    );
    return successResponse(res, resultado);
  } catch (err: any) {
    if (err.message?.includes('PERMISO_DENEGADO')) {
      return errorResponse(res, err.message, 403);
    }
    return errorResponse(res, err.message || 'Error registrando presentación PDT 621', 400);
  }
});

router.post('/rectificar', empresaGuard({ rolesPermitidos: ROLES_ESCRITURA }), async (req: Request, res: Response) => {
  try {
    const empresaId = req.empresaId || (req.headers['x-empresa-id'] as string);
    const user = (req as any).user;
    const rol = String(req.userRolEnEmpresa || user?.rolGlobal || 'CONTADOR_SENIOR');
    const userId = user?.id || 'usr-contador-01';
    const {
      periodo = '2026-09',
      motivoRectificatoria,
      numeroOrdenRectificatoria,
      fechaPresentacionRectificatoria,
      ...opciones
    } = req.body || {};

    const resultado = await liquidacionIGVService.rectificar(
      empresaId,
      String(periodo),
      {
        ...opciones,
        motivoRectificatoria,
        numeroOrdenRectificatoria,
        fechaPresentacionRectificatoria
      },
      userId,
      rol
    );
    return successResponse(res, resultado);
  } catch (err: any) {
    if (err.message?.includes('PERMISO_DENEGADO')) {
      return errorResponse(res, err.message, 403);
    }
    return errorResponse(res, err.message || 'Error generando rectificatoria PDT 621', 400);
  }
});

export const liquidacionIgvRoutes = router;
