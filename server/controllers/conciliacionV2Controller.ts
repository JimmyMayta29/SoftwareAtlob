import { Request, Response } from 'express';
import { z } from 'zod';
import {
  ConciliacionV2Error,
  conciliacionV2Service,
} from '../services/conciliacionV2Service';
import { Money } from '../utils/decimal';
import { successResponse, errorResponse } from '../utils/response';
import { sanitizarMensaje } from '../utils/seguridadDatos';

const uuidSchema = z.string().uuid('Identificador UUID inválido.');

const resumenQuerySchema = z.object({
  cuentaFinancieraId: z.string().uuid('cuentaFinancieraId debe ser un UUID válido.'),
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'periodo debe tener formato YYYY-MM.'),
});

const actualizarConfigBodySchema = z.object({
  conciliacionV2Habilitada: z.boolean().optional(),
  toleranciaDias: z.number().int().min(0).max(30).optional(),
  toleranciaMonto: z
    .union([z.string(), z.number()])
    .optional()
    .refine(
      (val) => {
        if (val === undefined) return true;
        const text = String(val).trim();
        if (!/^-?\d+(\.\d+)?$/.test(text)) return false;
        const dec = Money.create(text);
        return dec.gte(0) && Money.round(dec).lte('999999999999.99');
      },
      { message: 'toleranciaMonto debe ser un decimal entre 0.00 y 999999999999.99.' }
    ),
  cuentaItfCodigo: z.string().trim().min(2).max(20).optional(),
  cuentaComisionCodigo: z.string().trim().min(2).max(20).optional(),
  cuentaInteresGastoCodigo: z.string().trim().min(2).max(20).optional(),
  cuentaInteresIngresoCodigo: z.string().trim().min(2).max(20).nullable().optional(),
});

const vincularCuentaBodySchema = z.object({
  cuentaContableId: z.string().uuid('cuentaContableId debe ser un UUID válido.'),
  cci: z.string().trim().max(30).nullable().optional(),
});

const conciliarBodySchema = z.object({
  extractoLineaId: z.string().uuid('extractoLineaId debe ser un UUID válido.'),
  movimientoTesoreriaId: z.string().uuid('movimientoTesoreriaId debe ser un UUID válido.').nullable().optional(),
  estadoConciliacion: z.enum(['CONCILIADO', 'CONCILIADO_MANUAL']).optional(),
  observacion: z.string().trim().max(500).nullable().optional(),
});

const desconciliarBodySchema = z.object({
  extractoLineaId: z.string().uuid('extractoLineaId debe ser un UUID válido.'),
  motivo: z.string().trim().max(500).nullable().optional(),
});

const cerrarBodySchema = z.object({
  cuentaFinancieraId: z.string().uuid('cuentaFinancieraId debe ser un UUID válido.'),
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'periodo debe tener formato YYYY-MM.'),
  fechaCorte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fechaCorte debe tener formato YYYY-MM-DD.').optional(),
});

const reabrirBodySchema = z.object({
  cuentaFinancieraId: z.string().uuid('cuentaFinancieraId debe ser un UUID válido.'),
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'periodo debe tener formato YYYY-MM.'),
  motivo: z.string().trim().min(5, 'El motivo debe tener al menos 5 caracteres.').max(500),
});

function resolverEmpresaId(req: Request): string {
  const empresaRuta = req.empresaId || (req.params as Record<string, string | undefined>)?.empresaId;
  if (!empresaRuta) {
    throw new ConciliacionV2Error(400, 'EMPRESA_REQUERIDA', 'No se especificó la empresa autorizada.');
  }
  const empresaId = uuidSchema.parse(empresaRuta);

  const queryEmpresa = typeof req.query?.empresaId === 'string' ? req.query.empresaId : undefined;
  const bodyEmpresa =
    req.body && typeof req.body === 'object' && typeof req.body.empresaId === 'string'
      ? req.body.empresaId
      : undefined;

  if (queryEmpresa && queryEmpresa !== empresaId) {
    throw new ConciliacionV2Error(
      403,
      'ACCESO_DENEGADO_EMPRESA',
      'El parámetro empresaId de la consulta no coincide con la empresa autorizada en la ruta.'
    );
  }
  if (bodyEmpresa && bodyEmpresa !== empresaId) {
    throw new ConciliacionV2Error(
      403,
      'ACCESO_DENEGADO_EMPRESA',
      'El campo empresaId del cuerpo no coincide con la empresa autorizada en la ruta.'
    );
  }

  return empresaId;
}

function resolverUsuarioId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) {
    throw new ConciliacionV2Error(401, 'AUTENTICACION_REQUERIDA', 'Usuario autenticado requerido.');
  }
  return uuidSchema.parse(userId);
}

function manejarError(res: Response, err: unknown, fallback = 'Error en Conciliación Bancaria V2') {
  if (err instanceof z.ZodError) {
    const detalle = err.issues
      .map((issue) => `${issue.path.join('.') || 'campo'}: ${issue.message}`)
      .join('; ');
    return errorResponse(res, sanitizarMensaje(`VALIDACION_INVALIDA: ${detalle}`), 400, {
      codigo: 'VALIDACION_INVALIDA',
      issues: err.issues,
    });
  }
  if (err instanceof ConciliacionV2Error) {
    return errorResponse(res, sanitizarMensaje(err.message), err.statusCode, {
      codigo: err.codigo,
    });
  }
  return errorResponse(res, sanitizarMensaje(err, fallback), 500);
}

export const conciliacionV2Controller = {
  async obtenerConfig(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const config = await conciliacionV2Service.obtenerConfig(empresaId);
      return successResponse(res, config);
    } catch (err) {
      return manejarError(res, err, 'Error obteniendo configuración de conciliación V2');
    }
  },

  async actualizarConfig(req: Request, res: Response) {
    try {
      if (req.user?.rolGlobal !== 'ADMINISTRADOR') {
        return errorResponse(
          res,
          'PERMISO_INSUFICIENTE: Solo un ADMINISTRADOR global puede actualizar la configuración de conciliación.',
          403,
          { codigo: 'PERMISO_INSUFICIENTE' }
        );
      }
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const payload = actualizarConfigBodySchema.parse(req.body ?? {});
      const actualizada = await conciliacionV2Service.actualizarConfig(empresaId, userId, payload);
      return successResponse(res, actualizada, 'Configuración de conciliación V2 actualizada.');
    } catch (err) {
      return manejarError(res, err, 'Error actualizando configuración de conciliación V2');
    }
  },

  async listarCuentas(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const cuentas = await conciliacionV2Service.listarCuentas(empresaId);
      return successResponse(res, cuentas);
    } catch (err) {
      return manejarError(res, err, 'Error listando cuentas bancarias');
    }
  },

  async listarCuentasContablesDisponibles(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const cuentas = await conciliacionV2Service.listarCuentasContablesDisponibles(empresaId);
      return successResponse(res, cuentas);
    } catch (err) {
      return manejarError(res, err, 'Error listando cuentas contables disponibles');
    }
  },

  async vincularCuentaContable(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const cuentaId = uuidSchema.parse(req.params.cuentaId);
      const payload = vincularCuentaBodySchema.parse(req.body ?? {});
      const cuenta = await conciliacionV2Service.vincularCuentaContable(
        empresaId,
        cuentaId,
        userId,
        payload
      );
      return successResponse(res, cuenta, 'Cuenta contable vinculada correctamente.');
    } catch (err) {
      return manejarError(res, err, 'Error vinculando cuenta contable');
    }
  },

  async obtenerResumen(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const query = resumenQuerySchema.parse({
        cuentaFinancieraId: req.query.cuentaFinancieraId,
        periodo: req.query.periodo,
      });
      const resumen = await conciliacionV2Service.obtenerResumenConciliacion(
        empresaId,
        query.cuentaFinancieraId,
        query.periodo
      );
      return successResponse(res, resumen);
    } catch (err) {
      return manejarError(res, err, 'Error obteniendo resumen de conciliación V2');
    }
  },

  async conciliarPartida(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const payload = conciliarBodySchema.parse(req.body ?? {});
      const partida = await conciliacionV2Service.conciliarPartida(empresaId, userId, payload);
      return successResponse(res, partida, 'Partida conciliada correctamente.');
    } catch (err) {
      return manejarError(res, err, 'Error conciliando partida');
    }
  },

  async desconciliarPartida(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const payload = desconciliarBodySchema.parse(req.body ?? {});
      const partida = await conciliacionV2Service.desconciliarPartida(empresaId, userId, payload);
      return successResponse(res, partida, 'Partida desconciliada correctamente.');
    } catch (err) {
      return manejarError(res, err, 'Error desconciliando partida');
    }
  },

  async cerrarConciliacion(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const payload = cerrarBodySchema.parse(req.body ?? {});
      const resultado = await conciliacionV2Service.cerrarConciliacion(empresaId, userId, payload);
      return successResponse(res, resultado, 'Conciliación bancaria cerrada exitosamente.');
    } catch (err) {
      return manejarError(res, err, 'Error cerrando conciliación bancaria');
    }
  },

  async reabrirConciliacion(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const payload = reabrirBodySchema.parse(req.body ?? {});
      const resultado = await conciliacionV2Service.reabrirConciliacion(empresaId, userId, payload);
      return successResponse(res, resultado, 'Conciliación bancaria reabierta exitosamente.');
    } catch (err) {
      return manejarError(res, err, 'Error reabriendo conciliación bancaria');
    }
  },
};
