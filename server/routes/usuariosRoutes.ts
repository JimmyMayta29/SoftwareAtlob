import { Router, Request, Response } from 'express';
import { requireAuth, requireRol } from '../middlewares/auth';
import { licenciaService } from '../services/licenciaService';
import { usuarioEstudioService } from '../services/usuarioEstudioService';
import { sanitizarMensaje } from '../utils/seguridadDatos';
import { errorResponse, successResponse } from '../utils/response';

export const usuariosRoutes = Router();

function codigoHttpError(mensaje: string): number {
  if (mensaje.includes('LIMITE_LICENCIA_ALCANZADO') || mensaje.includes('PERMISO_INSUFICIENTE')) return 403;
  if (mensaje.includes('USUARIO_DUPLICADO')) return 409;
  if (mensaje.includes('USUARIO_NO_ENCONTRADO')) return 404;
  return 400;
}

function metadatosRequest(req: Request) {
  return {
    ip: req.ip,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined
  };
}

/**
 * GET /api/licencia/resumen
 * Resumen de licencia local (tipo, usuarios activos y máximo permitido) para Acerca de y panel de administración.
 */
usuariosRoutes.get('/licencia/resumen', requireAuth, async (_req: Request, res: Response) => {
  try {
    const resumen = await licenciaService.obtenerResumen();
    return successResponse(res, resumen);
  } catch (err: any) {
    return errorResponse(res, sanitizarMensaje(err, 'No se pudo consultar la licencia de la instalación.'), 500);
  }
});

/**
 * GET /api/usuarios
 * Lista usuarios del estudio, estado de 2FA y resumen de licencia (solo ADMINISTRADOR).
 */
usuariosRoutes.get('/usuarios', requireAuth, requireRol(['ADMINISTRADOR']), async (_req: Request, res: Response) => {
  try {
    const estado = await usuarioEstudioService.listarEstadoUsuarios();
    return successResponse(res, estado);
  } catch (err: any) {
    return errorResponse(res, sanitizarMensaje(err, 'No se pudo listar los usuarios del estudio.'), 500);
  }
});

/**
 * POST /api/usuarios
 * Crea un colaborador validando en el servidor el límite de usuarios activos de la licencia.
 */
usuariosRoutes.post('/usuarios', requireAuth, requireRol(['ADMINISTRADOR']), async (req: Request, res: Response) => {
  try {
    const creado = await usuarioEstudioService.crearColaborador(req.user!.id, req.body, metadatosRequest(req));
    return successResponse(res, creado, 'Colaborador creado correctamente.', 201);
  } catch (err: any) {
    const msg = sanitizarMensaje(err, 'No se pudo crear el colaborador.');
    return errorResponse(res, msg, codigoHttpError(msg));
  }
});

/**
 * PATCH /api/usuarios/:id/estado
 * Activa o desactiva un colaborador. Al reactivar, valida el límite de usuarios en el servidor.
 */
usuariosRoutes.patch('/usuarios/:id/estado', requireAuth, requireRol(['ADMINISTRADOR']), async (req: Request, res: Response) => {
  try {
    if (typeof req.body?.activo !== 'boolean') {
      return errorResponse(res, 'DATOS_INVALIDOS: Debe indicar el campo booleano activo.', 400);
    }
    const actualizado = await usuarioEstudioService.cambiarEstadoUsuario(
      req.user!.id,
      String(req.params.id),
      req.body.activo,
      metadatosRequest(req)
    );
    return successResponse(
      res,
      actualizado,
      req.body.activo ? 'Usuario reactivado correctamente.' : 'Usuario desactivado correctamente.'
    );
  } catch (err: any) {
    const msg = sanitizarMensaje(err, 'No se pudo actualizar el estado del usuario.');
    return errorResponse(res, msg, codigoHttpError(msg));
  }
});

/**
 * POST /api/usuarios/mfa/enrolar
 * Genera una clave TOTP que se muestra una sola vez (sin guardarla en logs ni auditoría).
 */
usuariosRoutes.post('/usuarios/mfa/enrolar', requireAuth, requireRol(['ADMINISTRADOR']), async (req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const enrolamiento = await usuarioEstudioService.iniciarEnrolamientoMfa(req.user!.id);
    return successResponse(res, enrolamiento, 'Vincule su aplicación autenticadora e ingrese el código de 6 dígitos.');
  } catch (err: any) {
    const msg = sanitizarMensaje(err, 'No se pudo generar la clave de vinculación 2FA.');
    return errorResponse(res, msg, codigoHttpError(msg));
  }
});

/**
 * POST /api/usuarios/mfa/activar
 * Verifica el código TOTP, activa 2FA en el estudio y registra el hecho en auditoría (sin semilla).
 */
usuariosRoutes.post('/usuarios/mfa/activar', requireAuth, requireRol(['ADMINISTRADOR']), async (req: Request, res: Response) => {
  try {
    const resultado = await usuarioEstudioService.activarMfaEstudio(
      req.user!.id,
      req.body?.codigo,
      metadatosRequest(req)
    );
    return successResponse(res, resultado, 'Autenticación en dos pasos (2FA) activada correctamente.');
  } catch (err: any) {
    const msg = sanitizarMensaje(err, 'No se pudo activar el segundo factor.');
    return errorResponse(res, msg, codigoHttpError(msg));
  }
});

/**
 * POST /api/usuarios/mfa/desactivar
 * Desactiva 2FA en el estudio y registra el hecho en auditoría (sin semilla).
 */
usuariosRoutes.post('/usuarios/mfa/desactivar', requireAuth, requireRol(['ADMINISTRADOR']), async (req: Request, res: Response) => {
  try {
    const resultado = await usuarioEstudioService.desactivarMfaEstudio(req.user!.id, metadatosRequest(req));
    return successResponse(res, resultado, 'Autenticación en dos pasos (2FA) desactivada.');
  } catch (err: any) {
    const msg = sanitizarMensaje(err, 'No se pudo desactivar el segundo factor.');
    return errorResponse(res, msg, codigoHttpError(msg));
  }
});

