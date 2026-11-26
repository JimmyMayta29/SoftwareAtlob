import { Request, Response } from 'express';
import { sanitizarMensaje } from '../utils/seguridadDatos';
import { z } from 'zod';
import { asientoService } from '../services/asientoService';
import { contabilizacionService, TipoOperacionContable } from '../services/contabilizacionService';
import { periodoService } from '../services/periodoService';
import { librosEEFFService } from '../services/librosEEFFService';
import { auditoriaRepository } from '../repositories/auditoriaRepository';
import { successResponse, errorResponse } from '../utils/response';

// Esquemas de validación Zod
export const detalleInputSchema = z.preprocess((val: any) => {
  if (val && typeof val === 'object') {
    const cuenta = val.cuentaId || val.cuentaCodigo;
    const linea = val.linea !== undefined ? Number(val.linea) : undefined;
    const debe = val.debe !== undefined ? Number(val.debe) : 0;
    const haber = val.haber !== undefined ? Number(val.haber) : 0;
    return {
      ...val,
      cuentaId: cuenta,
      cuentaCodigo: val.cuentaCodigo || cuenta,
      linea,
      debe: isNaN(debe) ? 0 : debe,
      haber: isNaN(haber) ? 0 : haber,
      anexoNumero: val.anexoNumero || val.anexoNumDoc || val.numeroDocumento || null,
      docNumero: val.docNumero || val.numeroComprobante || null,
      docTipo: val.docTipo || val.tipoComprobante || null,
      docSerie: val.docSerie || val.serieComprobante || null,
      fechaEmision: val.fechaEmision || val.fechaEmisionDoc || null,
      fechaVencimiento: val.fechaVencimiento || val.fechaVencimientoDoc || null,
      glosaLinea: val.glosaLinea || val.glosa || null
    };
  }
  return val;
}, z.object({
  linea: z.number().int().positive().optional(),
  cuentaId: z.string().min(1, 'La cuenta contable es requerida'),
  cuentaCodigo: z.string().optional(),
  cuentaDenominacion: z.string().optional(),
  anexoId: z.string().nullable().optional(),
  anexoNumero: z.string().nullable().optional(),
  anexoTipoDoc: z.string().nullable().optional(),
  anexoNombre: z.string().nullable().optional(),
  debe: z.number().min(0).default(0),
  haber: z.number().min(0).default(0),
  debeMe: z.number().min(0).optional().default(0),
  haberMe: z.number().min(0).optional().default(0),
  centroCostoId: z.string().nullable().optional(),
  docTipo: z.string().nullable().optional(),
  docSerie: z.string().nullable().optional(),
  docNumero: z.string().nullable().optional(),
  fechaEmision: z.string().nullable().optional(),
  fechaVencimiento: z.string().nullable().optional(),
  glosaLinea: z.string().nullable().optional()
}));

export const asientoInputSchema = z.preprocess((val: any) => {
  if (val && typeof val === 'object') {
    const subdiarioId = val.subdiarioId || val.subdiario;
    const periodoId = val.periodoId || val.periodo;
    const fecha = val.fecha || val.fechaContable;
    const glosa = val.glosa || val.glosaGeneral;
    let tipoCambio = Number(val.tipoCambio);
    if (isNaN(tipoCambio) || tipoCambio <= 0) tipoCambio = 1.0;

    let detalles = Array.isArray(val.detalles) ? val.detalles : [];
    detalles = detalles.map((d: any, idx: number) => ({
      ...d,
      linea: d.linea || (idx + 1)
    }));

    return {
      ...val,
      subdiarioId,
      periodoId,
      fecha,
      glosa,
      tipoCambio,
      detalles
    };
  }
  return val;
}, z.object({
  id: z.string().optional(),
  idempotencyKey: z.string().max(64).optional(),
  periodoId: z.string().min(1, 'El período contable es obligatorio'),
  subdiarioId: z.string().min(1, 'El subdiario contable es obligatorio'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha YYYY-MM-DD requerido'),
  glosa: z.string().min(3, 'La glosa debe tener al menos 3 caracteres').max(255),
  moneda: z.enum(['PEN', 'USD']).default('PEN'),
  tipoCambio: z.number().positive().default(1.0),
  origen: z.string().optional().default('MANUAL'),
  origenId: z.string().nullable().optional(),
  version: z.number().int().optional(),
  contabilizarDirecto: z.boolean().optional(),
  detalles: z.array(detalleInputSchema).min(2, 'El asiento debe tener al menos 2 líneas para cumplir la partida doble')
}));

export const previsualizarSchema = z.object({
  tipoOperacion: z.enum([
    'COMPRA_MERCADERIA', 'COMPRA_SERVICIO', 'VENTA', 'COBRANZA', 'PAGO',
    'HONORARIO', 'PLANILLA', 'DETRACCION', 'DESTINO_FUNCION', 'DESTINO_ALMACEN', 'DIFERENCIA_CAMBIO'
  ]),
  total: z.number().positive('El importe total debe ser mayor a 0'),
  baseImponible: z.number().optional(),
  igv: z.number().optional(),
  retencion: z.number().optional(),
  glosa: z.string().min(2),
  docTipo: z.string().optional(),
  docSerie: z.string().optional(),
  docNumero: z.string().optional(),
  anexoId: z.string().optional(),
  moneda: z.enum(['PEN', 'USD']).optional().default('PEN'),
  tipoCambio: z.number().positive().optional().default(1.0),
  porcentajeAdmin: z.number().min(0).max(100).optional(),
  porcentajeVentas: z.number().min(0).max(100).optional()
});

export const anularAsientoSchema = z.object({
  motivo: z.string().min(5, 'Debe especificar el motivo de anulación')
});

export const reabrirPeriodoSchema = z.object({
  motivo: z.string().min(10, 'Debe detallar el motivo de reapertura del período')
});

export const asientoController = {
  async listar(req: Request, res: Response) {
    try {
      const empresaId = req.params.id || req.empresaId!;
      const filtros = {
        periodoId: req.query.periodoId as string,
        subdiarioId: req.query.subdiarioId as string,
        estado: req.query.estado as any,
        fechaDesde: req.query.fechaDesde as string,
        fechaHasta: req.query.fechaHasta as string,
        search: req.query.search as string,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 25
      };

      const resultado = await asientoService.listar(empresaId, filtros);
      return successResponse(res, resultado);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async obtener(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const asiento = await asientoService.obtenerPorId(id);
      if (!asiento) {
        return errorResponse(res, 'ASIENTO_NO_ENCONTRADO: Asiento no encontrado', 404);
      }
      return successResponse(res, asiento);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async crear(req: Request, res: Response) {
    try {
      const empresaId = req.params.id || req.empresaId!;
      const userId = req.user?.id || '00000000-0000-0000-0000-000000000001';
      const esAdmin = (req.user as any)?.rolGlobal === 'ADMINISTRADOR' || (req.user as any)?.rol === 'ADMINISTRADOR';

      if (req.body.contabilizarDirecto) {
        const contabilizado = await asientoService.crearYContabilizar(empresaId, req.body, userId, { esAdmin });
        return successResponse(res, contabilizado, `Asiento contabilizado exitosamente con N° ${contabilizado.numero}`, 201);
      }

      const nuevo = await asientoService.crearBorrador(empresaId, req.body, userId);
      return successResponse(res, nuevo, 'Asiento borrador creado exitosamente', 201);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async actualizar(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id || '00000000-0000-0000-0000-000000000001';
      const expectedVersion = req.body.version || 1;

      const actualizado = await asientoService.actualizarBorrador(id, req.body, userId, expectedVersion, req.empresaId);
      return successResponse(res, actualizado, 'Asiento actualizado correctamente');
    } catch (err: any) {
      const status = err.message.startsWith('VERSION_DESACTUALIZADA') ? 409 : 400;
      return errorResponse(res, err.message, status);
    }
  },

  async contabilizar(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const empresaId = req.empresaId!;
      const userId = req.user?.id || '00000000-0000-0000-0000-000000000001';
      const esAdmin = (req.user as any)?.rolGlobal === 'ADMINISTRADOR' || (req.user as any)?.rol === 'ADMINISTRADOR';

      const contabilizado = await asientoService.contabilizar(id, empresaId, userId, { enforceSegregacion: true });
      return successResponse(res, contabilizado, `Asiento contabilizado con éxito con N° ${contabilizado.numero}`);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async anular(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const empresaId = req.empresaId!;
      const userId = req.user?.id || '00000000-0000-0000-0000-000000000001';
      const { motivo } = req.body;

      const resultado = await asientoService.anular(id, motivo, userId, empresaId);
      return successResponse(res, resultado, 'Asiento anulado y extorno generado exitosamente');
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async duplicar(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const empresaId = req.empresaId!;
      const userId = req.user?.id || '00000000-0000-0000-0000-000000000001';

      const copia = await asientoService.duplicar(id, userId, empresaId);
      return successResponse(res, copia, 'Asiento duplicado como borrador');
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async previsualizar(req: Request, res: Response) {
    try {
      const empresaId = req.params.id || req.empresaId!;
      const { tipoOperacion, ...datos } = req.body;

      const propuesta = await contabilizacionService.generar(
        empresaId,
        tipoOperacion as TipoOperacionContable,
        datos
      );

      return successResponse(res, propuesta);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async listarPeriodos(req: Request, res: Response) {
    try {
      const empresaId = req.params.id || req.empresaId!;
      const anio = req.query.anio ? parseInt(req.query.anio as string, 10) : 2026;
      const periodos = await periodoService.listar(empresaId, anio);
      return successResponse(res, periodos);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async cerrarPeriodo(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const empresaId = req.empresaId!;
      const userId = req.user?.id || '00000000-0000-0000-0000-000000000001';

      const cerrado = await periodoService.cerrar(id, userId, empresaId);
      return successResponse(res, cerrado, 'Período contable cerrado exitosamente');
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async reabrirPeriodo(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const empresaId = req.empresaId!;
      const userId = req.user?.id || '00000000-0000-0000-0000-000000000001';
      const userRole = req.userRolEnEmpresa || req.user?.rolGlobal || 'ADMINISTRADOR';
      const { motivo } = req.body;

      const reabierto = await periodoService.reabrir(id, motivo, userId, userRole, empresaId);
      return successResponse(res, reabierto, 'Período contable reabierto');
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async listarAuditoria(req: Request, res: Response) {
    try {
      const empresaId = req.params.id || req.empresaId!;
      const rawLimit = req.query.limit !== undefined ? Number(req.query.limit) : 50;
      const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, Math.trunc(rawLimit))) : 50;

      const rawOrigen =
        req.query.origen !== undefined ? String(req.query.origen).trim().toUpperCase() : 'TODOS';
      const origenNormalizado = rawOrigen === '' ? 'TODOS' : rawOrigen;
      if (!['TODOS', 'OPERATIVA', 'ENCADENADA'].includes(origenNormalizado)) {
        return errorResponse(
          res,
          'Parámetro origen inválido. Valores permitidos: TODOS, OPERATIVA, ENCADENADA.',
          400
        );
      }

      const registros = await auditoriaRepository.listarPorEmpresa(
        empresaId,
        limit,
        origenNormalizado as 'TODOS' | 'OPERATIVA' | 'ENCADENADA'
      );
      return successResponse(res, registros);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async obtenerLibroDiario(req: Request, res: Response) {
    try {
      const empresaId = req.params.id || req.empresaId!;
      const periodo = (req.query.periodo as string) || (req.query.periodoId as string) || '2026-09';
      const libro = await librosEEFFService.generarLibroDiario(empresaId, periodo);
      return successResponse(res, libro);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async obtenerLibroMayor(req: Request, res: Response) {
    try {
      const empresaId = req.params.id || req.empresaId!;
      const periodo = (req.query.periodo as string) || '2026-09';
      const acumulado = req.query.acumulado === 'true';
      const mayor = await librosEEFFService.generarLibroMayor(empresaId, periodo, acumulado);
      return successResponse(res, mayor);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async obtenerBalanceComprobacion(req: Request, res: Response) {
    try {
      const empresaId = req.params.id || req.empresaId!;
      const periodo = (req.query.periodo as string) || '2026-09';
      const acumulado = req.query.acumulado !== 'false';
      const balance = await librosEEFFService.generarBalanceComprobacion(empresaId, periodo, acumulado);
      return successResponse(res, balance);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async obtenerEstadoSituacionFinanciera(req: Request, res: Response) {
    try {
      const empresaId = req.params.id || req.empresaId!;
      const periodo = (req.query.periodo as string) || '2026-09';
      const acumulado = req.query.acumulado !== 'false';
      const es = await librosEEFFService.generarEstadoSituacionFinanciera(empresaId, periodo, acumulado);
      return successResponse(res, es);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async obtenerEstadoResultados(req: Request, res: Response) {
    try {
      const empresaId = req.params.id || req.empresaId!;
      const periodo = (req.query.periodo as string) || '2026-09';
      const acumulado = req.query.acumulado !== 'false';
      const er = await librosEEFFService.generarEstadoResultados(empresaId, periodo, acumulado);
      return successResponse(res, er);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async obtenerFlujoEfectivo(req: Request, res: Response) {
    try {
      const empresaId = req.params.id || req.empresaId!;
      const periodo = (req.query.periodo as string) || '2026-09';
      const acumulado = req.query.acumulado !== 'false';
      const fe = await librosEEFFService.generarEstadoFlujoEfectivo(empresaId, periodo, acumulado);
      return successResponse(res, fe);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async obtenerRatiosFinancieros(req: Request, res: Response) {
    try {
      const empresaId = req.params.id || req.empresaId!;
      const periodo = (req.query.periodo as string) || '2026-09';
      const ratios = await librosEEFFService.calcularRatiosFinancieros(empresaId, periodo);
      return successResponse(res, ratios);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async reconstruirSaldos(req: Request, res: Response) {
    try {
      const empresaId = req.params.id || req.empresaId!;
      const periodo = (req.body.periodo as string) || '2026-09';
      const rec = await librosEEFFService.reconstruirSaldosMensuales(empresaId, periodo);
      return successResponse(res, rec);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async verificarSaldos(req: Request, res: Response) {
    try {
      const empresaId = req.params.id || req.empresaId!;
      const periodo = (req.query.periodo as string) || '2026-09';
      const ver = await librosEEFFService.verificarIntegridadSaldosContraDiario(empresaId, periodo);
      return successResponse(res, ver);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async obtenerHojaTrabajo10Columnas(req: Request, res: Response) {
    try {
      const empresaId = req.params.id || req.params.empresaId || req.empresaId!;
      const periodo = (req.query.periodo as string) || '2026-09';
      const acumulado = req.query.acumulado !== 'false';
      const correctorasEnNegativo = req.query.correctorasEnNegativo === 'true';
      const incluirCierre = req.query.incluirCierre !== 'false';
      let mapeoFuncionPersonalizado: any;
      if (typeof req.query.mapeoFuncion === 'string' && req.query.mapeoFuncion.trim()) {
        try {
          mapeoFuncionPersonalizado = JSON.parse(req.query.mapeoFuncion);
        } catch {
          mapeoFuncionPersonalizado = undefined;
        }
      }

      const hoja = await librosEEFFService.generarHojaTrabajo10Columnas(empresaId, periodo, {
        acumuladoAlMes: acumulado,
        correctorasActivoEnNegativo: correctorasEnNegativo,
        incluirCierreYAjustes: incluirCierre,
        mapeoFuncionPersonalizado
      });
      return successResponse(res, hoja);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async obtenerLibroDiarioESTANDAR(req: Request, res: Response) {
    try {
      const empresaId = req.params.id || req.params.empresaId || req.empresaId!;
      const periodo = (req.query.periodo as string) || '2026-09';
      const incluirCierre = req.query.incluirCierre !== 'false';
      const formatoFecha = (req.query.formatoFecha as any) || 'DD/MM/AAAA';
      const voucherDesde = req.query.voucherDesde as string;
      const voucherHasta = req.query.voucherHasta as string;

      const diario = await librosEEFFService.generarLibroDiarioESTANDAR(empresaId, periodo, {
        incluirAjustesYCierre: incluirCierre,
        formatoFecha,
        voucherDesde,
        voucherHasta
      });
      return successResponse(res, diario);
    } catch (err: any) {
      return errorResponse(res, err.message);
    }
  },

  async descargarPle51Diario(req: Request, res: Response) {
    try {
      const empresaId = req.params.id || req.params.empresaId || req.empresaId!;
      const periodo = (req.query.periodo as string) || '2026-09';
      const resultado = await librosEEFFService.generarPle51DiarioTxt(empresaId, periodo);

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${resultado.nombreArchivo}"`);
      return res.send(resultado.contenidoTxt);
    } catch (err: any) {
      return errorResponse(res, err.message, 500);
    }
  }
};
