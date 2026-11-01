import { Router, Request, Response } from 'express';
import { requireAuth, ROLES_ESCRITURA, ROLES_LECTURA } from '../middlewares/auth';
import { empresaGuard } from '../middlewares/empresaGuard';
import { djRentaAnualService } from '../services/djRentaAnualService';
import { successResponse, errorResponse } from '../utils/response';

const router = Router();

router.use(requireAuth);

router.get('/', empresaGuard({ rolesPermitidos: ROLES_LECTURA, bloquearPeriodoCerrado: false }), async (req: Request, res: Response) => {
  try {
    const empresaId = req.empresaId!;
    const anio = Number(req.query.anio) || 2026;
    const regimen = req.query.regimen as 'REGIMEN_GENERAL' | 'MYPE_TRIBUTARIO' | undefined;
    const resultado = await djRentaAnualService.calcularDjAnual(empresaId, anio, { regimen });
    return successResponse(res, resultado);
  } catch (err: any) {
    return errorResponse(res, err.message || 'Error calculando Declaración Anual de Renta', 400);
  }
});

router.post('/calcular', empresaGuard({ rolesPermitidos: ROLES_ESCRITURA }), async (req: Request, res: Response) => {
  try {
    const empresaId = req.empresaId!;
    const {
      anio = 2026,
      regimen,
      utilidadContableOverride,
      adicionesManuales,
      reemplazarAdicionesBase,
      deduccionesManuales,
      reemplazarDeduccionesBase,
      sistemaCompensacionPerdidas,
      perdidaArrastrableDeclarada,
      pagosACuentaMensualesOverride,
      saldoAFavorAnterior,
      itanPagado
    } = req.body || {};

    const resultado = await djRentaAnualService.calcularDjAnual(empresaId, Number(anio), {
      regimen,
      utilidadContableOverride: utilidadContableOverride !== undefined ? Number(utilidadContableOverride) : undefined,
      adicionesManuales,
      reemplazarAdicionesBase,
      deduccionesManuales,
      reemplazarDeduccionesBase,
      sistemaCompensacionPerdidas,
      perdidaArrastrableDeclarada: perdidaArrastrableDeclarada !== undefined ? Number(perdidaArrastrableDeclarada) : undefined,
      pagosACuentaMensualesOverride: pagosACuentaMensualesOverride !== undefined ? Number(pagosACuentaMensualesOverride) : undefined,
      saldoAFavorAnterior: saldoAFavorAnterior !== undefined ? Number(saldoAFavorAnterior) : undefined,
      itanPagado: itanPagado !== undefined ? Number(itanPagado) : undefined
    });
    return successResponse(res, resultado);
  } catch (err: any) {
    return errorResponse(res, err.message || 'Error procesando Declaración Anual de Renta', 400);
  }
});

export const djRentaAnualRoutes = router;
