import { Router, Request, Response } from 'express';
import { subdiarioService } from '../services/subdiarioService';
import { requireAuth, requireEmpresaMembership, requireRol } from '../middlewares/auth';
import { sanitizarMensaje } from '../utils/seguridadDatos';

export const subdiarioRoutes = Router({ mergeParams: true });

// Todos los endpoints de subdiarios requieren autenticación y acceso a la empresa
subdiarioRoutes.use(requireAuth);
subdiarioRoutes.use(requireEmpresaMembership());

/**
 * GET /api/empresas/:empresaId/subdiarios
 * Lista todos los subdiarios de la empresa
 */
subdiarioRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const { empresaId } = req.params;
    const soloActivos = req.query.soloActivos === 'true';
    const permiteManual = req.query.permiteManual !== undefined ? req.query.permiteManual === 'true' : undefined;

    const subdiarios = await subdiarioService.listar(empresaId, { soloActivos, permiteManual });
    res.json({
      success: true,
      data: subdiarios,
      total: subdiarios.length
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: sanitizarMensaje(err) });
  }
});

/**
 * GET /api/empresas/:empresaId/subdiarios/:id
 * Obtiene un subdiario por ID o código
 */
subdiarioRoutes.get('/:id', async (req: Request, res: Response) => {
  try {
    const { empresaId, id } = req.params;
    let sub = await subdiarioService.obtenerPorId(empresaId, id);
    if (!sub) {
      sub = await subdiarioService.obtenerPorCodigo(empresaId, id);
    }
    if (!sub) {
      return res.status(404).json({ success: false, error: 'SUBDIARIO_NO_ENCONTRADO' });
    }
    res.json({ success: true, data: sub });
  } catch (err: any) {
    res.status(500).json({ success: false, error: sanitizarMensaje(err) });
  }
});

/**
 * POST /api/empresas/:empresaId/subdiarios
 * Crea un subdiario adicional (solo ADMINISTRADOR / ADMIN_ESTUDIO)
 */
subdiarioRoutes.post('/', requireRol(['ADMIN_ESTUDIO', 'ADMINISTRADOR']), async (req: Request, res: Response) => {
  try {
    const { empresaId } = req.params;
    const { codigo, nombre, tipoOperacion, cuentaFinancieraId, permiteAsientoManual } = req.body;

    if (!codigo || !nombre || !tipoOperacion) {
      return res.status(400).json({
        success: false,
        error: 'CAMPOS_REQUERIDOS: codigo, nombre y tipoOperacion son obligatorios.'
      });
    }

    const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';
    const nuevo = await subdiarioService.crearSubdiario(
      empresaId,
      { codigo, nombre, tipoOperacion, cuentaFinancieraId, permiteAsientoManual },
      userId
    );

    res.status(201).json({ success: true, data: nuevo });
  } catch (err: any) {
    const mensaje = sanitizarMensaje(err);
    const status = mensaje.includes('CODIGO_DUPLICADO') || mensaje.includes('TIPO_NO_PERMITIDO') ? 400 : 500;
    res.status(status).json({ success: false, error: mensaje });
  }
});

/**
 * PUT /api/empresas/:empresaId/subdiarios/:id
 * Modifica nombre, cuenta financiera o estado de un subdiario (el código es inmutable)
 */
subdiarioRoutes.put('/:id', requireRol(['ADMIN_ESTUDIO', 'ADMINISTRADOR']), async (req: Request, res: Response) => {
  try {
    const { empresaId, id } = req.params;
    const { nombre, activo, cuentaFinancieraId, permiteAsientoManual } = req.body;
    const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';

    const actualizado = await subdiarioService.actualizarSubdiario(
      empresaId,
      id,
      { nombre, activo, cuentaFinancieraId, permiteAsientoManual },
      userId
    );

    res.json({ success: true, data: actualizado });
  } catch (err: any) {
    res.status(500).json({ success: false, error: sanitizarMensaje(err) });
  }
});

/**
 * DELETE /api/empresas/:empresaId/subdiarios/:id
 * Elimina un subdiario personalizado sin asientos
 */
subdiarioRoutes.delete('/:id', requireRol(['ADMIN_ESTUDIO', 'ADMINISTRADOR']), async (req: Request, res: Response) => {
  try {
    const { empresaId, id } = req.params;
    const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';

    const resultado = await subdiarioService.eliminarSubdiario(empresaId, id, userId);
    res.json({ success: true, ...resultado });
  } catch (err: any) {
    const mensaje = sanitizarMensaje(err);
    const status = mensaje.includes('SUBDIARIO_CON_ASIENTOS') || mensaje.includes('SUBDIARIO_SISTEMA') ? 400 : 500;
    res.status(status).json({ success: false, error: mensaje });
  }
});
