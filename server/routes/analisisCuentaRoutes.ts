import { Router, Request, Response } from 'express';
import { analisisCuentaService } from '../services/analisisCuentaService';
import { requireAuth, requireRol } from '../middlewares/auth';
import { sanitizarMensaje } from '../utils/seguridadDatos';

export const analisisCuentaRoutes = Router({ mergeParams: true });

// Todos los endpoints de análisis de cuentas requieren autenticación
analisisCuentaRoutes.use(requireAuth);

function resolverEmpresaId(req: Request): string | null {
  const paramId = (req.params as any)?.empresaId;
  const contextId = req.empresaId;
  const target = paramId || contextId;
  if (!target) return null;
  const queryId = req.query.empresaId as string | undefined;
  const bodyId = req.body?.empresaId as string | undefined;
  if (queryId && queryId !== target) return null;
  if (bodyId && bodyId !== target) return null;
  return target;
}

/**
 * GET /api/empresas/:empresaId/analisis-cuentas/movimientos
 * Obtiene los movimientos contables, saldo inicial y saldo final con rigor decimal.
 */
analisisCuentaRoutes.get('/movimientos', async (req: Request, res: Response) => {
  try {
    const empresaId = resolverEmpresaId(req);
    const periodo = (req.query.periodo as string) || '2026-09';
    const codigoCuenta = (req.query.codigoCuenta as string) || (req.query.cuentaDesde as string);
    const cuentaHasta = req.query.cuentaHasta as string | undefined;
    const anexo = req.query.anexo as string | undefined;

    if (!empresaId) {
      return res.status(403).json({ success: false, error: 'ACCESO_DENEGADO_EMPRESA' });
    }

    const resultado = await analisisCuentaService.obtenerMovimientosCuenta(
      empresaId,
      periodo,
      codigoCuenta,
      anexo,
      cuentaHasta
    );

    res.json({ success: true, data: resultado });
  } catch (err: any) {
    res.status(500).json({ success: false, error: sanitizarMensaje(err) });
  }
});

/**
 * GET /api/empresas/:empresaId/analisis-cuentas/antiguedad
 * Obtiene la antigüedad de saldos (0-30, 31-60, 61-90, >90) por anexo y documento.
 */
analisisCuentaRoutes.get('/antiguedad', async (req: Request, res: Response) => {
  try {
    const empresaId = resolverEmpresaId(req);
    const periodo = (req.query.periodo as string) || '2026-09';
    const cuenta = (req.query.cuenta as string) || (req.query.cuentaDesde as string) || '1212';
    const cuentaHasta = req.query.cuentaHasta as string | undefined;

    if (!empresaId) {
      return res.status(403).json({ success: false, error: 'ACCESO_DENEGADO_EMPRESA' });
    }

    const resultado = await analisisCuentaService.obtenerAntiguedadSaldos(empresaId, periodo, cuenta, cuentaHasta);
    res.json({ success: true, data: resultado });
  } catch (err: any) {
    res.status(500).json({ success: false, error: sanitizarMensaje(err) });
  }
});

/**
 * GET /api/empresas/:empresaId/analisis-cuentas/comparativo-anual
 * Obtiene la evolución comparativa de 12 meses con variación porcentual.
 */
analisisCuentaRoutes.get('/comparativo-anual', async (req: Request, res: Response) => {
  try {
    const empresaId = resolverEmpresaId(req);
    const anio = parseInt(req.query.anio as string, 10) || 2026;
    const cuenta = (req.query.cuenta as string) || '12';

    if (!empresaId) {
      return res.status(403).json({ success: false, error: 'ACCESO_DENEGADO_EMPRESA' });
    }

    const resultado = await analisisCuentaService.obtenerComparativoAnual(empresaId, anio, cuenta);
    res.json({ success: true, data: resultado });
  } catch (err: any) {
    res.status(500).json({ success: false, error: sanitizarMensaje(err) });
  }
});

/**
 * GET /api/empresas/:empresaId/analisis-cuentas/cuentas-control
 * Conciliación de cuentas de control contables vs módulos auxiliares.
 */
analisisCuentaRoutes.get('/cuentas-control', async (req: Request, res: Response) => {
  try {
    const empresaId = resolverEmpresaId(req);
    const periodo = (req.query.periodo as string) || '2026-09';

    if (!empresaId) {
      return res.status(403).json({ success: false, error: 'ACCESO_DENEGADO_EMPRESA' });
    }

    const resultado = await analisisCuentaService.obtenerCuentasControl(empresaId, periodo);
    res.json({ success: true, data: resultado });
  } catch (err: any) {
    res.status(500).json({ success: false, error: sanitizarMensaje(err) });
  }
});

/**
 * GET /api/empresas/:empresaId/analisis-cuentas/alertas
 * Detección de alertas de auditoría preventiva contable.
 */
analisisCuentaRoutes.get('/alertas', async (req: Request, res: Response) => {
  try {
    const empresaId = resolverEmpresaId(req);
    const periodo = (req.query.periodo as string) || '2026-09';

    if (!empresaId) {
      return res.status(403).json({ success: false, error: 'ACCESO_DENEGADO_EMPRESA' });
    }

    const alertas = await analisisCuentaService.obtenerAlertasAuditoria(empresaId, periodo);
    res.json({ success: true, data: alertas });
  } catch (err: any) {
    res.status(500).json({ success: false, error: sanitizarMensaje(err) });
  }
});

/**
 * GET /api/empresas/:empresaId/analisis-cuentas/marcas/:asientoId
 * Lista marcas y notas de auditoría de un asiento.
 */
analisisCuentaRoutes.get('/marcas/:asientoId', async (req: Request, res: Response) => {
  try {
    const empresaId = resolverEmpresaId(req);
    const { asientoId } = req.params;

    if (!empresaId) {
      return res.status(403).json({ success: false, error: 'ACCESO_DENEGADO_EMPRESA' });
    }

    const marcas = await analisisCuentaService.obtenerMarcasAsiento(empresaId, asientoId);
    res.json({ success: true, data: marcas });
  } catch (err: any) {
    res.status(500).json({ success: false, error: sanitizarMensaje(err) });
  }
});

/**
 * POST /api/empresas/:empresaId/analisis-cuentas/marcas
 * Crea o actualiza una marca de auditoría.
 */
analisisCuentaRoutes.post(
  '/marcas',
  requireRol(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'ASISTENTE_CONTABLE', 'AUDITOR_REVISOR']),
  async (req: Request, res: Response) => {
    try {
      const empresaId = resolverEmpresaId(req);
      const { asientoId, lineaId, estadoRevision, comentario } = req.body;

      if (!empresaId) {
        return res.status(403).json({ success: false, error: 'ACCESO_DENEGADO_EMPRESA' });
      }

      if (!asientoId || !estadoRevision) {
        return res.status(400).json({
          success: false,
          error: 'DATOS_INCOMPLETOS: asientoId y estadoRevision son obligatorios',
        });
      }

      const usuarioId = req.user?.id;
      if (!usuarioId) {
        return res.status(401).json({ success: false, error: 'AUTENTICACION_REQUERIDA' });
      }
      const usuarioNombre = req.user?.email || req.user?.nombre || 'Auditor';

      const marca = await analisisCuentaService.guardarMarca(empresaId, {
        asientoId,
        lineaId,
        estadoRevision,
        comentario,
        usuarioId,
        usuarioNombre,
      });

      res.status(201).json({ success: true, data: marca });
    } catch (err: any) {
      res.status(500).json({ success: false, error: sanitizarMensaje(err) });
    }
  }
);

