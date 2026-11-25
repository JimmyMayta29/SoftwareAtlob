import { Request, Response } from 'express';
import { z } from 'zod';
import {
  ConciliacionV2Error,
  conciliacionV2Service,
} from '../services/conciliacionV2Service';
import { clasificadorGlosaService } from '../services/conciliacion/clasificador/clasificadorGlosaService';
import {
  ConciliacionImportacionError,
  generarPlantillaCsvSegura,
  importacionExtractoService,
} from '../services/conciliacion/importacion/importacionExtractoService';
import { perfilesBancoService } from '../services/conciliacion/perfilesBanco/perfilesBancoService';
import { matchingService } from '../services/conciliacion/matching/matchingService';
import {
  FORMATOS_EXTRACTO_V2,
  SENTIDOS_MONTO_REGLA,
  TIPOS_CLASIFICACION_EXTRACTO,
  TIPOS_COINCIDENCIA_REGLA,
} from '../types/conciliacionV2';
import { Money } from '../utils/decimal';
import { successResponse, errorResponse } from '../utils/response';
import { sanitizarMensaje } from '../utils/seguridadDatos';

const uuidSchema = z.string().uuid('Identificador UUID inválido.');
const periodoSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'periodo debe tener formato YYYY-MM.');

const ESTADOS_GRUPO_CONCILIACION_V2 = [
  'SUGERIDO',
  'CONCILIADO',
  'CONCILIADO_MANUAL',
  'RECHAZADO',
  'DESCONCILIADO',
] as const;

const toleranciaMontoSchema = z
  .union([z.string(), z.number()])
  .refine(
    (val) => {
      const text = String(val).trim();
      if (!/^-?\d+(\.\d+)?$/.test(text)) return false;
      const dec = Money.create(text);
      return dec.gte(0) && Money.round(dec).lte('999999999999.99');
    },
    { message: 'toleranciaMonto debe ser un decimal entre 0.00 y 999999999999.99.' }
  );

const resumenQuerySchema = z.object({
  cuentaFinancieraId: z.string().uuid('cuentaFinancieraId debe ser un UUID válido.'),
  periodo: periodoSchema,
});

const actualizarConfigBodySchema = z.object({
  conciliacionV2Habilitada: z.boolean().optional(),
  toleranciaDias: z.number().int().min(0).max(30).optional(),
  toleranciaMonto: toleranciaMontoSchema.optional(),
  umbralAutoMatch: z.number().min(0.6).max(1).optional(),
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

const columnaRefSchema = z.union([
  z.string().trim().min(1).max(120),
  z.number().int().min(0).max(200),
]);

const mapeoColumnasSchema = z
  .object({
    fecha: columnaRefSchema,
    descripcion: columnaRefSchema,
    referencia: columnaRefSchema.nullable().optional(),
    monto: columnaRefSchema.nullable().optional(),
    abono: columnaRefSchema.nullable().optional(),
    cargo: columnaRefSchema.nullable().optional(),
    saldo: columnaRefSchema.nullable().optional(),
    signoCargoNegativo: z.boolean().optional(),
  })
  .refine(
    (m) =>
      Boolean(m.monto !== undefined && m.monto !== null) ||
      Boolean(m.abono !== undefined && m.abono !== null && m.cargo !== undefined && m.cargo !== null),
    { message: 'mapeoColumnas requiere columna "monto" o el par "abono" y "cargo".' }
  );

const crearPerfilBodySchema = z.object({
  codigo: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, 'El código solo puede contener letras, números, "_" y "-".'),
  nombre: z.string().trim().min(2).max(120),
  banco: z.string().trim().min(2).max(80),
  formato: z.enum(FORMATOS_EXTRACTO_V2),
  delimitador: z.string().max(5).nullable().optional(),
  codificacion: z.string().trim().min(2).max(20).optional(),
  filaEncabezado: z.number().int().min(1).max(200).optional(),
  formatoFecha: z.string().trim().min(4).max(30).optional(),
  separadorDecimal: z.enum(['.', ',']).optional(),
  mapeoColumnas: mapeoColumnasSchema,
  activo: z.boolean().optional(),
});

const actualizarPerfilBodySchema = z.object({
  nombre: z.string().trim().min(2).max(120).optional(),
  banco: z.string().trim().min(2).max(80).optional(),
  formato: z.enum(FORMATOS_EXTRACTO_V2).optional(),
  delimitador: z.string().max(5).nullable().optional(),
  codificacion: z.string().trim().min(2).max(20).optional(),
  filaEncabezado: z.number().int().min(1).max(200).optional(),
  formatoFecha: z.string().trim().min(4).max(30).optional(),
  separadorDecimal: z.enum(['.', ',']).optional(),
  mapeoColumnas: mapeoColumnasSchema.optional(),
  activo: z.boolean().optional(),
});

const crearReglaBodySchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  banco: z.string().trim().min(2).max(80).nullable().optional(),
  tipoClasificacion: z.enum(TIPOS_CLASIFICACION_EXTRACTO),
  patronTexto: z.string().trim().min(2).max(200),
  tipoCoincidencia: z.enum(TIPOS_COINCIDENCIA_REGLA).optional(),
  sentidoMonto: z.enum(SENTIDOS_MONTO_REGLA).optional(),
  prioridad: z.number().int().min(1).max(1000).optional(),
  activo: z.boolean().optional(),
});

const actualizarReglaBodySchema = z.object({
  nombre: z.string().trim().min(2).max(120).optional(),
  banco: z.string().trim().min(2).max(80).nullable().optional(),
  tipoClasificacion: z.enum(TIPOS_CLASIFICACION_EXTRACTO).optional(),
  patronTexto: z.string().trim().min(2).max(200).optional(),
  tipoCoincidencia: z.enum(TIPOS_COINCIDENCIA_REGLA).optional(),
  sentidoMonto: z.enum(SENTIDOS_MONTO_REGLA).optional(),
  prioridad: z.number().int().min(1).max(1000).optional(),
  activo: z.boolean().optional(),
});

const listarImportacionesQuerySchema = z.object({
  cuentaFinancieraId: z.string().uuid('cuentaFinancieraId debe ser un UUID válido.').optional(),
});

const mapeoPersonalizadoSchema = z.object({
  fecha: columnaRefSchema.optional(),
  descripcion: columnaRefSchema.optional(),
  referencia: columnaRefSchema.nullable().optional(),
  monto: columnaRefSchema.nullable().optional(),
  abono: columnaRefSchema.nullable().optional(),
  cargo: columnaRefSchema.nullable().optional(),
  saldo: columnaRefSchema.nullable().optional(),
  signoCargoNegativo: z.boolean().optional(),
  filaEncabezado: z.number().int().min(1).max(200).optional(),
  delimitador: z.string().max(5).nullable().optional(),
  formatoFecha: z.string().trim().min(4).max(30).optional(),
  separadorDecimal: z.enum(['.', ',']).optional(),
});

const importacionBodySchema = z.object({
  cuentaFinancieraId: z.string().uuid('cuentaFinancieraId debe ser un UUID válido.'),
  periodo: z
    .string()
    .trim()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'periodo debe tener formato YYYY-MM.')
    .nullable()
    .optional(),
  perfilBancoId: z.string().uuid('perfilBancoId debe ser un UUID válido.').nullable().optional(),
  perfilCodigo: z.string().trim().min(2).max(50).nullable().optional(),
  mapeoPersonalizado: mapeoPersonalizadoSchema.optional(),
  nombreArchivo: z.string().trim().min(1, 'nombreArchivo es requerido.').max(255),
  contentType: z.string().trim().max(120).nullable().optional(),
  contenidoBase64: z
    .string()
    .trim()
    .min(1, 'contenidoBase64 es requerido.')
    .max(8_000_000, 'contenidoBase64 excede el límite máximo permitido (8,000,000 caracteres).'),
  saldoInicialDeclarado: z.union([z.string().trim().min(1).max(40), z.number().finite()]).nullable().optional(),
  saldoFinalDeclarado: z.union([z.string().trim().min(1).max(40), z.number().finite()]).nullable().optional(),
});

const revertirImportacionBodySchema = z.object({
  motivo: z.string().trim().min(5, 'El motivo debe tener al menos 5 caracteres.').max(500),
});

const ejecutarMatchingBodySchema = z.object({
  cuentaFinancieraId: z.string().uuid('cuentaFinancieraId debe ser un UUID válido.'),
  periodo: periodoSchema,
  umbralAutoMatch: z.number().min(0.6).max(1).optional(),
  toleranciaDias: z.number().int().min(0).max(30).optional(),
  toleranciaMonto: toleranciaMontoSchema.optional(),
  limpiarSugerenciasPrevias: z.boolean().optional(),
});

const listarGruposQuerySchema = z.object({
  cuentaFinancieraId: z.string().uuid('cuentaFinancieraId debe ser un UUID válido.'),
  periodo: periodoSchema,
  estado: z.enum(ESTADOS_GRUPO_CONCILIACION_V2).optional(),
});

const aceptarSugerenciasBodySchema = z.object({
  grupoIds: z
    .array(z.string().uuid('Cada grupoId debe ser un UUID válido.'))
    .min(1, 'Debe indicar al menos un grupo sugerido para aceptar.')
    .max(200, 'No se pueden aceptar más de 200 grupos en una sola operación.'),
});

const rechazarSugerenciaBodySchema = z.object({
  motivo: z.string().trim().max(500).nullable().optional(),
});

const conciliarManualGrupoBodySchema = z.object({
  cuentaFinancieraId: z.string().uuid('cuentaFinancieraId debe ser un UUID válido.'),
  periodo: periodoSchema,
  extractoLineaIds: z
    .array(z.string().uuid('Cada extractoLineaId debe ser un UUID válido.'))
    .min(1, 'Debe seleccionar al menos una línea de extracto bancario.')
    .max(50, 'No se pueden agrupar más de 50 líneas bancarias por grupo.'),
  libroItems: z
    .array(
      z.object({
        origenLibro: z.enum(['MOVIMIENTO_TESORERIA', 'ASIENTO_MANUAL']),
        id: z.string().uuid('Cada id de partida libro debe ser un UUID válido.'),
      })
    )
    .min(1, 'Debe seleccionar al menos una partida de libro.')
    .max(50, 'No se pueden agrupar más de 50 partidas de libro por grupo.'),
  observacion: z.string().trim().max(500).nullable().optional(),
  aprenderRegla: z
    .object({
      patronContraparte: z
        .string()
        .trim()
        .min(2, 'El patrón de contraparte debe tener al menos 2 caracteres.')
        .max(200),
      rucContraparte: z
        .string()
        .trim()
        .regex(/^\d{8,15}$/, 'rucContraparte debe tener entre 8 y 15 dígitos.')
        .nullable()
        .optional(),
      anexoId: z.string().uuid('anexoId debe ser un UUID válido.').nullable().optional(),
      cuentaContableId: z
        .string()
        .uuid('cuentaContableId debe ser un UUID válido.')
        .nullable()
        .optional(),
      tipoClasificacion: z.enum(TIPOS_CLASIFICACION_EXTRACTO).nullable().optional(),
    })
    .nullable()
    .optional(),
});

const desconciliarGrupoBodySchema = z.object({
  motivo: z
    .string()
    .trim()
    .min(5, 'El motivo de desconciliación debe tener al menos 5 caracteres.')
    .max(500, 'El motivo de desconciliación no puede superar 500 caracteres.'),
});

const historialDesconciliacionQuerySchema = z.object({
  cuentaFinancieraId: z.string().uuid('cuentaFinancieraId debe ser un UUID válido.').optional(),
  periodo: periodoSchema.optional(),
});

const listarReglasAprendidasQuerySchema = z.object({
  soloActivas: z.enum(['true', 'false']).optional(),
});

const crearReglaAprendidaBodySchema = z.object({
  patronContraparte: z
    .string()
    .trim()
    .min(2, 'patronContraparte debe tener al menos 2 caracteres.')
    .max(200),
  rucContraparte: z
    .string()
    .trim()
    .regex(/^\d{8,15}$/, 'rucContraparte debe tener entre 8 y 15 dígitos.')
    .nullable()
    .optional(),
  anexoId: z.string().uuid('anexoId debe ser un UUID válido.').nullable().optional(),
  cuentaContableId: z
    .string()
    .uuid('cuentaContableId debe ser un UUID válido.')
    .nullable()
    .optional(),
  tipoClasificacion: z.enum(TIPOS_CLASIFICACION_EXTRACTO).nullable().optional(),
  activo: z.boolean().optional(),
});

const actualizarReglaAprendidaBodySchema = crearReglaAprendidaBodySchema.partial();

function normalizarQueryOpcional(val: unknown): unknown {
  return typeof val === 'string' && val.trim() === '' ? undefined : val;
}

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
      ...(err instanceof ConciliacionImportacionError && err.errores ? { errores: err.errores } : {}),
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

  async listarPerfiles(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const perfiles = await perfilesBancoService.listarPerfiles(empresaId);
      return successResponse(res, perfiles);
    } catch (err) {
      return manejarError(res, err, 'Error listando perfiles bancarios');
    }
  },

  async crearPerfil(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const payload = crearPerfilBodySchema.parse(req.body ?? {});
      const perfil = await perfilesBancoService.crearPerfil(empresaId, payload, userId);
      return successResponse(res, perfil, 'Perfil bancario creado correctamente.', 201);
    } catch (err) {
      return manejarError(res, err, 'Error creando perfil bancario');
    }
  },

  async actualizarPerfil(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const perfilId = uuidSchema.parse(req.params.perfilId);
      const payload = actualizarPerfilBodySchema.parse(req.body ?? {});
      const perfil = await perfilesBancoService.actualizarPerfil(empresaId, perfilId, payload, userId);
      return successResponse(res, perfil, 'Perfil bancario actualizado correctamente.');
    } catch (err) {
      return manejarError(res, err, 'Error actualizando perfil bancario');
    }
  },

  async eliminarPerfil(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const perfilId = uuidSchema.parse(req.params.perfilId);
      const resultado = await perfilesBancoService.eliminarPerfil(empresaId, perfilId, userId);
      return successResponse(res, resultado, 'Perfil bancario eliminado correctamente.');
    } catch (err) {
      return manejarError(res, err, 'Error eliminando perfil bancario');
    }
  },

  async listarReglasClasificacion(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const reglas = await clasificadorGlosaService.listarReglas(empresaId);
      return successResponse(res, reglas);
    } catch (err) {
      return manejarError(res, err, 'Error listando reglas de clasificación');
    }
  },

  async crearReglaClasificacion(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const payload = crearReglaBodySchema.parse(req.body ?? {});
      const regla = await clasificadorGlosaService.crearRegla(empresaId, payload, userId);
      return successResponse(res, regla, 'Regla de clasificación creada correctamente.', 201);
    } catch (err) {
      return manejarError(res, err, 'Error creando regla de clasificación');
    }
  },

  async actualizarReglaClasificacion(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const reglaId = uuidSchema.parse(req.params.reglaId);
      const payload = actualizarReglaBodySchema.parse(req.body ?? {});
      const regla = await clasificadorGlosaService.actualizarRegla(empresaId, reglaId, payload, userId);
      return successResponse(res, regla, 'Regla de clasificación actualizada correctamente.');
    } catch (err) {
      return manejarError(res, err, 'Error actualizando regla de clasificación');
    }
  },

  async eliminarReglaClasificacion(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const reglaId = uuidSchema.parse(req.params.reglaId);
      const resultado = await clasificadorGlosaService.eliminarRegla(empresaId, reglaId, userId);
      return successResponse(res, resultado, 'Regla de clasificación eliminada correctamente.');
    } catch (err) {
      return manejarError(res, err, 'Error eliminando regla de clasificación');
    }
  },

  async descargarPlantillaCsv(req: Request, res: Response) {
    try {
      resolverEmpresaId(req);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="plantilla_extracto_bancario_v2.csv"');
      return res.status(200).send(generarPlantillaCsvSegura());
    } catch (err) {
      return manejarError(res, err, 'Error generando plantilla CSV de extracto');
    }
  },

  async listarImportaciones(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const query = listarImportacionesQuerySchema.parse({
        cuentaFinancieraId: req.query.cuentaFinancieraId,
      });
      const importaciones = await importacionExtractoService.listarImportaciones(
        empresaId,
        query.cuentaFinancieraId
      );
      return successResponse(res, importaciones);
    } catch (err) {
      return manejarError(res, err, 'Error listando importaciones de extractos');
    }
  },

  async previsualizarImportacion(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const payload = importacionBodySchema.parse(req.body ?? {});
      const resultado = await importacionExtractoService.previsualizarImportacion(empresaId, payload);
      return successResponse(res, resultado);
    } catch (err) {
      return manejarError(res, err, 'Error previsualizando importación de extracto');
    }
  },

  async confirmarImportacion(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const payload = importacionBodySchema.parse(req.body ?? {});
      const resultado = await importacionExtractoService.confirmarImportacion(empresaId, payload, userId);
      const statusCode = resultado.yaExistiaSinNuevas ? 200 : 201;
      const mensaje = resultado.yaExistiaSinNuevas
        ? 'El extracto ya había sido importado previamente sin filas nuevas.'
        : 'Extracto bancario importado correctamente.';
      return successResponse(res, resultado, mensaje, statusCode);
    } catch (err) {
      return manejarError(res, err, 'Error confirmando importación de extracto');
    }
  },

  async revertirImportacion(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const importId = uuidSchema.parse(req.params.importId);
      const payload = revertirImportacionBodySchema.parse(req.body ?? {});
      const resultado = await importacionExtractoService.revertirImportacion(
        empresaId,
        importId,
        payload.motivo,
        userId
      );
      return successResponse(res, resultado, 'Importación de extracto revertida correctamente.');
    } catch (err) {
      return manejarError(res, err, 'Error revirtiendo importación de extracto');
    }
  },

  async ejecutarMatching(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const payload = ejecutarMatchingBodySchema.parse(req.body ?? {});
      const resultado = await matchingService.ejecutarMatching(empresaId, userId, payload);
      return successResponse(res, resultado, 'Motor de matching ejecutado correctamente.');
    } catch (err) {
      return manejarError(res, err, 'Error ejecutando motor de matching');
    }
  },

  async listarGruposMatching(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const query = listarGruposQuerySchema.parse({
        cuentaFinancieraId: req.query.cuentaFinancieraId,
        periodo: req.query.periodo,
        estado: normalizarQueryOpcional(req.query.estado),
      });
      const grupos = await matchingService.listarGrupos(
        empresaId,
        query.cuentaFinancieraId,
        query.periodo,
        query.estado
      );
      return successResponse(res, grupos);
    } catch (err) {
      return manejarError(res, err, 'Error listando grupos de conciliación');
    }
  },

  async aceptarSugerencias(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const payload = aceptarSugerenciasBodySchema.parse(req.body ?? {});
      const grupos = await matchingService.aceptarSugerencias(empresaId, userId, payload);
      return successResponse(res, grupos, 'Sugerencias de conciliación aceptadas correctamente.');
    } catch (err) {
      return manejarError(res, err, 'Error aceptando sugerencias de conciliación');
    }
  },

  async rechazarSugerencia(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const grupoId = uuidSchema.parse(req.params.grupoId);
      const payload = rechazarSugerenciaBodySchema.parse(req.body ?? {});
      const grupo = await matchingService.rechazarSugerencia(
        empresaId,
        userId,
        grupoId,
        payload.motivo
      );
      return successResponse(res, grupo, 'Sugerencia de conciliación rechazada correctamente.');
    } catch (err) {
      return manejarError(res, err, 'Error rechazando sugerencia de conciliación');
    }
  },

  async conciliarManualGrupo(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const payload = conciliarManualGrupoBodySchema.parse(req.body ?? {});
      const grupo = await matchingService.conciliarManualGrupo(empresaId, userId, payload);
      return successResponse(res, grupo, 'Grupo conciliado manualmente correctamente.', 201);
    } catch (err) {
      return manejarError(res, err, 'Error conciliando grupo manualmente');
    }
  },

  async desconciliarGrupo(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const grupoId = uuidSchema.parse(req.params.grupoId);
      const payload = desconciliarGrupoBodySchema.parse(req.body ?? {});
      const grupo = await matchingService.desconciliarGrupo(
        empresaId,
        userId,
        grupoId,
        payload.motivo
      );
      return successResponse(res, grupo, 'Grupo desconciliado correctamente.');
    } catch (err) {
      return manejarError(res, err, 'Error desconciliando grupo');
    }
  },

  async listarHistorialDesconciliacion(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const query = historialDesconciliacionQuerySchema.parse({
        cuentaFinancieraId: normalizarQueryOpcional(req.query.cuentaFinancieraId),
        periodo: normalizarQueryOpcional(req.query.periodo),
      });
      const historial = await matchingService.listarHistorialDesconciliacion(
        empresaId,
        query.cuentaFinancieraId,
        query.periodo
      );
      return successResponse(res, historial);
    } catch (err) {
      return manejarError(res, err, 'Error listando historial de desconciliación');
    }
  },

  async listarReglasAprendidas(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const query = listarReglasAprendidasQuerySchema.parse({
        soloActivas: normalizarQueryOpcional(req.query.soloActivas),
      });
      const reglas = await matchingService.listarReglasAprendidas(
        empresaId,
        query.soloActivas === 'true'
      );
      return successResponse(res, reglas);
    } catch (err) {
      return manejarError(res, err, 'Error listando reglas aprendidas');
    }
  },

  async crearReglaAprendida(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const payload = crearReglaAprendidaBodySchema.parse(req.body ?? {});
      const regla = await matchingService.crearReglaAprendida(empresaId, userId, payload);
      return successResponse(res, regla, 'Regla aprendida creada correctamente.', 201);
    } catch (err) {
      return manejarError(res, err, 'Error creando regla aprendida');
    }
  },

  async actualizarReglaAprendida(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const reglaId = uuidSchema.parse(req.params.reglaId);
      const payload = actualizarReglaAprendidaBodySchema.parse(req.body ?? {});
      const regla = await matchingService.actualizarReglaAprendida(
        empresaId,
        userId,
        reglaId,
        payload
      );
      return successResponse(res, regla, 'Regla aprendida actualizada correctamente.');
    } catch (err) {
      return manejarError(res, err, 'Error actualizando regla aprendida');
    }
  },

  async eliminarReglaAprendida(req: Request, res: Response) {
    try {
      const empresaId = resolverEmpresaId(req);
      const userId = resolverUsuarioId(req);
      const reglaId = uuidSchema.parse(req.params.reglaId);
      const resultado = await matchingService.eliminarReglaAprendida(empresaId, userId, reglaId);
      return successResponse(res, resultado, 'Regla aprendida eliminada correctamente.');
    } catch (err) {
      return manejarError(res, err, 'Error eliminando regla aprendida');
    }
  },
};
