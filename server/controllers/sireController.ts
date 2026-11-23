import { Request, Response } from 'express';
import { sanitizarMensaje } from '../utils/seguridadDatos';
import { z } from 'zod';
import { sireService } from '../services/sireService';
import { conciliadorSireService } from '../services/conciliadorSireService';
import { sireLayoutService, CodigoAnexoSire } from '../services/sireLayoutService';
import { sireAnexosService } from '../services/sireAnexosService';
import { archivoValidadorService } from '../services/archivoValidadorService';
import { historialGeneracionesService } from '../services/historialGeneracionesService';
import { empresaDemoService } from '../services/empresaDemoService';
import { successResponse, errorResponse } from '../utils/response';

export const conexionSunatSchema = z.object({
  ruc: z.string().length(11, 'El RUC debe contener exactamente 11 dígitos'),
  usuarioSol: z.string().min(1, 'El usuario SOL es obligatorio'),
  claveSol: z.string().min(1, 'La clave SOL es obligatoria'),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  modoSimulado: z.boolean().optional().default(true)
});

export const descargarSireSchema = z.object({
  tipo: z.enum(['COMPRAS', 'VENTAS']),
  periodo: z.string().regex(/^\d{4}-\d{2}$/, 'El período debe tener formato YYYY-MM')
});

export const solicitarTicketSchema = z.object({
  tipo: z.enum(['COMPRAS', 'VENTAS']),
  periodo: z.string().regex(/^\d{4}-\d{2}$/, 'El período debe tener formato YYYY-MM')
});

export const consultarTicketSchema = z.object({
  tipo: z.enum(['COMPRAS', 'VENTAS']),
  periodo: z.string().regex(/^\d{4}-\d{2}$/, 'El período debe tener formato YYYY-MM'),
  numTicket: z.string().min(1, 'Número de ticket requerido')
});

export const importarPropuestaManualSchema = z.object({
  tipo: z.enum(['COMPRAS', 'VENTAS']),
  periodo: z.string().regex(/^\d{4}-\d{2}$/, 'El período debe tener formato YYYY-MM'),
  nombreArchivo: z.string().min(1),
  contenidoBase64: z.string().min(1)
});

export const aplicarConciliacionSchema = z.object({
  accion: z.enum(['ACEPTAR', 'OBSERVAR', 'IGNORAR']),
  lineasIds: z.array(z.string()).min(1, 'Debe especificar al menos una línea'),
  motivo: z.string().optional()
});

export const asientoAjusteSchema = z.object({
  cuentaAjuste: z.string().optional()
});

export const guardarReglaProveedorSchema = z.object({
  proveedorRuc: z.string().length(11, 'El RUC debe tener 11 dígitos'),
  proveedorRazonSocial: z.string().min(2).optional().default('PROVEEDOR S.A.C.'),
  destinoCompra: z.string(),
  cuentaGasto: z.string().optional(),
  cuentaContableDefault: z.string().optional(),
  centroCostoId: z.string().optional(),
  centroCostoDefault: z.string().optional()
});

export const aceptarPropuestaOficialSchema = z.object({
  tipo: z.enum(['COMPRAS', 'VENTAS']),
  periodo: z.string().regex(/^\d{4}-\d{2}$/, 'El período debe tener formato YYYY-MM')
});

export const reemplazarPropuestaOficialSchema = z.object({
  tipo: z.enum(['COMPRAS', 'VENTAS']),
  periodo: z.string().regex(/^\d{4}-\d{2}$/, 'El período debe tener formato YYYY-MM'),
  comprobantesReemplazo: z.array(z.any()).optional().default([]),
  archivoContenidoTxt: z.string().optional()
});

export const ajustePosteriorSchema = z.object({
  periodoAjuste: z.string().regex(/^\d{4}-\d{2}$/, 'El período de ajuste debe tener formato YYYY-MM'),
  periodoAfectado: z.string().regex(/^\d{4}-\d{2}$/, 'El período afectado debe tener formato YYYY-MM'),
  ajusteData: z.any()
});

export const revertirLineaSchema = z.object({
  motivo: z.string().min(3, 'Debe especificar el motivo de la reversión')
});

export const validarSireTxtSchema = z.object({
  contenidoTxt: z.string().min(1, 'Contenido del archivo TXT requerido'),
  tipoLayout: z.enum([
    'RCE_REEMPLAZO', 'RVIE_REEMPLAZO', 'RCE_AJUSTE', 'RVIE_AJUSTE',
    'RVIE_ANEXO_2', 'RVIE_ANEXO_3', 'RVIE_ANEXO_4', 'RVIE_ANEXO_5',
    'RCE_ANEXO_8_CP', 'RCE_ANEXO_8_INEX', 'RCE_ANEXO_9', 'RCE_ANEXO_10',
    'RCE_ANEXO_11', 'RCE_ANEXO_12_1', 'RCE_ANEXO_12_2', 'RCE_ANEXO_13_1', 'RCE_ANEXO_13_2',
  ])
});

const generarAnexoSireSchema = z.object({
  anexo: z.enum([
    'RVIE_ANEXO_2', 'RVIE_ANEXO_3', 'RVIE_ANEXO_4', 'RVIE_ANEXO_5',
    'RCE_ANEXO_8_CP', 'RCE_ANEXO_8_INEX', 'RCE_ANEXO_9', 'RCE_ANEXO_10',
    'RCE_ANEXO_11', 'RCE_ANEXO_12_1', 'RCE_ANEXO_12_2', 'RCE_ANEXO_13_1', 'RCE_ANEXO_13_2',
  ]),
  periodo: z.string().regex(/^\d{4}-\d{2}$/, 'El período debe tener formato YYYY-MM'),
  periodoAfectado: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  oportunidad: z.enum(['01', '02', '03', '04', '05']).optional(),
  correlativo: z.string().max(4).optional(),
  sinMovimiento: z.boolean().optional(),
  incluirComprasMeAuto: z.boolean().optional(),
});

const noDomiciliadoSchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/, 'El período debe tener formato YYYY-MM'),
  carSunat: z.string().optional(),
  fechaEmision: z.string().min(8),
  tipoComprobante: z.string().min(1).max(4).optional().default('91'),
  serie: z.string().max(20).optional().default(''),
  numero: z.string().min(1).max(30),
  valorAdquisiciones: z.number().min(0),
  otrosConceptos: z.number().min(0).optional().default(0),
  importeTotal: z.number().min(0).optional(),
  tipoDocSustentaCredito: z.string().optional(),
  serieDocSustentaCredito: z.string().optional(),
  anioDua: z.string().optional(),
  numeroDocSustentaCredito: z.string().optional(),
  retencionIgv: z.number().min(0).optional().default(0),
  moneda: z.enum(['PEN', 'USD']).optional().default('USD'),
  tipoCambio: z.number().positive().optional().default(1),
  paisResidencia: z.string().min(1).optional().default('9249'),
  razonSocialNoDomiciliado: z.string().min(2),
  domicilioExtranjero: z.string().optional(),
  numIdFiscal: z.string().optional(),
  numIdBeneficiario: z.string().optional(),
  razonSocialBeneficiario: z.string().optional(),
  paisBeneficiario: z.string().optional(),
  vinculoContribuyente: z.string().optional().default('00'),
  rentaBruta: z.number().min(0).optional(),
  deduccionCosto: z.number().min(0).optional().default(0),
  rentaNeta: z.number().min(0).optional(),
  tasaRetencion: z.number().min(0).max(100).optional().default(0),
  impuestoRetenido: z.number().min(0).optional(),
  convenioDobleImposicion: z.string().optional().default('00'),
  exoneracionAplicada: z.string().optional(),
  tipoRenta: z.string().optional().default('00'),
  modalidadServicio: z.string().optional(),
  aplicaArt76: z.boolean().optional().default(false),
  carCpModificar: z.string().optional(),
  estado: z.enum(['BORRADOR', 'REGISTRADO', 'ANULADO']).optional().default('REGISTRADO'),
});

const ajusteAnexoSireSchema = z.object({
  periodoPresentacion: z.string().regex(/^\d{4}-\d{2}$/),
  periodoAjustado: z.string().regex(/^\d{4}-\d{2}$/),
  registro: z.enum(['RVIE', 'RCE', 'RCE_NO_DOMICILIADO']),
  codigoAnexo: z.enum([
    'RVIE_ANEXO_2', 'RVIE_ANEXO_4', 'RVIE_ANEXO_5',
    'RCE_ANEXO_8_CP', 'RCE_ANEXO_8_INEX', 'RCE_ANEXO_10',
    'RCE_ANEXO_12_1', 'RCE_ANEXO_12_2', 'RCE_ANEXO_13_1', 'RCE_ANEXO_13_2',
  ]),
  tipoOperacion: z.enum(['INCLUSION', 'EXCLUSION', 'MODIFICACION', 'TIPO_CAMBIO']).optional().default('MODIFICACION'),
  oportunidad: z.enum(['01', '02', '03', '04', '05']).optional().default('03'),
  correlativo: z.string().max(4).optional().default('01'),
  carOriginal: z.string().optional().default(''),
  datosJson: z.record(z.string(), z.any()).optional().default({}),
  estado: z.enum(['BORRADOR', 'GENERADO', 'ENVIADO']).optional().default('BORRADOR'),
});

export const sireController = {
  // 1. Conexión y credenciales
  async guardarConexion(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      empresaDemoService.validarOperacionOficialPermitida(empresaId, 'SOL_CONEXION');
      const data = conexionSunatSchema.parse(req.body);
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';
      const result = await sireService.guardarConexion(empresaId, data, userId);
      return successResponse(res, result, 'Credenciales SUNAT guardadas y cifradas exitosamente.');
    } catch (err: any) {
      const mensaje = sanitizarMensaje(err);
      return errorResponse(res, mensaje.startsWith('EMPRESA_DEMO_BLOQUEO_SUNAT:')
        ? 'EMPRESA_DEMO_BLOQUEO_SUNAT: La empresa demo no admite credenciales SUNAT.'
        : 'Error al guardar credenciales SUNAT');
    }
  },

  async obtenerEstadoConexion(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const estado = await sireService.obtenerEstadoConexion(empresaId);
      return successResponse(res, estado);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async validarConexion(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      empresaDemoService.validarOperacionOficialPermitida(empresaId, 'SOL_CONEXION');
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';
      const resultado = await sireService.validarConexion(empresaId, userId);
      return successResponse(res, resultado);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  // 2. Descargas SIRE REST y Tickets
  async solicitarTicket(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      empresaDemoService.validarOperacionOficialPermitida(empresaId, 'SIRE_ENVIO');
      const data = solicitarTicketSchema.parse(req.body);
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';
      const result = await sireService.solicitarDescargaTicket(empresaId, data.tipo, data.periodo, userId);
      return successResponse(res, result, 'Ticket de descarga SIRE solicitado ante SUNAT.', 202);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async consultarTicket(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const data = consultarTicketSchema.parse(req.body);
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';
      const result = await sireService.consultarTicketDescarga(empresaId, data.tipo, data.periodo, data.numTicket, userId);
      return successResponse(res, result);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async descargarPropuesta(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      empresaDemoService.validarOperacionOficialPermitida(empresaId, 'SIRE_ENVIO');
      const data = descargarSireSchema.parse(req.body);
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';
      const propuesta = await sireService.descargarPropuesta(empresaId, data.tipo, data.periodo, userId);

      await historialGeneracionesService.registrarGeneracion({
        empresaId,
        periodo: data.periodo,
        modulo: 'SIRE',
        tipoOperacion: 'PROPUESTA_DESCARGA',
        subtipo: data.tipo,
        nombreArchivo: `PROPUESTA_${data.tipo}_${data.periodo}.txt`,
        hashSha256: propuesta.hashArchivo,
        totalRegistros: propuesta.totalRegistros,
        totalImporte: propuesta.totalImporte,
        esOficial: true,
        usuarioId: userId
      });

      return successResponse(res, propuesta, 'Propuesta SIRE descargada exitosamente.');
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async importarPropuestaManual(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const data = importarPropuestaManualSchema.parse(req.body);
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';
      const buffer = Buffer.from(data.contenidoBase64, 'base64');
      const propuesta = await sireService.importarPropuestaManual(empresaId, data.tipo, data.periodo, buffer, data.nombreArchivo, userId);

      await historialGeneracionesService.registrarGeneracion({
        empresaId,
        periodo: data.periodo,
        modulo: 'SIRE',
        tipoOperacion: 'PROPUESTA_MANUAL',
        subtipo: data.tipo,
        nombreArchivo: data.nombreArchivo,
        hashSha256: propuesta.hashArchivo,
        totalRegistros: propuesta.totalRegistros,
        totalImporte: propuesta.totalImporte,
        esOficial: true,
        usuarioId: userId
      });

      return successResponse(res, propuesta, 'Propuesta manual SIRE importada exitosamente.');
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  // 3. Conciliación SIRE
  async obtenerConciliacion(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const tipo = (req.query.tipo as any) || 'COMPRAS';
      const periodo = (req.query.periodo as string) || '2026-09';
      const tolerancia = req.query.tolerancia ? parseFloat(req.query.tolerancia as string) : undefined;

      const resultado = await conciliadorSireService.conciliarPeriodo(empresaId, tipo, periodo, { toleranciaImporte: tolerancia });
      return successResponse(res, resultado);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async aplicarConciliacion(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const data = aplicarConciliacionSchema.parse(req.body);
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';

      const resultado = await conciliadorSireService.procesarLote(
        empresaId,
        data.accion,
        data.lineasIds,
        data.motivo,
        userId
      );
      return successResponse(res, resultado);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async generarAsientoAjuste(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const lineaId = req.params.lineaId;
      const data = asientoAjusteSchema.parse(req.body);
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';

      const resultado = await conciliadorSireService.generarAsientoAjusteDiferencia(
        empresaId,
        lineaId,
        userId,
        data.cuentaAjuste
      );
      return successResponse(res, resultado, 'Asiento de ajuste generado con éxito.');
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async revertirAceptacionLinea(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const lineaId = req.params.lineaId;
      const data = revertirLineaSchema.parse(req.body);
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';
      const resultado = await conciliadorSireService.revertirAceptacionPropuesta(
        empresaId,
        lineaId,
        data.motivo,
        userId
      );
      return successResponse(res, resultado);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  // 4. Reglas de proveedor
  async guardarReglaProveedor(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const data = guardarReglaProveedorSchema.parse(req.body);
      const destinoNorm = data.destinoCompra.startsWith('DESTINO_')
        ? data.destinoCompra as any
        : `DESTINO_${data.destinoCompra}` as any;
      const cuenta = data.cuentaGasto || data.cuentaContableDefault || '60111';
      const cc = data.centroCostoId || data.centroCostoDefault;

      const resultado = await conciliadorSireService.guardarReglaProveedor(empresaId, {
        empresaId,
        proveedorRuc: data.proveedorRuc,
        proveedorRazonSocial: data.proveedorRazonSocial,
        destinoCompra: destinoNorm,
        cuentaGasto: cuenta,
        centroCostoId: cc,
        formaPagoDefault: 'CONTADO',
        aprobacionAutomatica: true
      });
      return successResponse(res, resultado, 'Regla de contabilización por proveedor guardada exitosamente.');
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async listarReglasProveedor(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const reglas = conciliadorSireService.listarReglasProveedor(empresaId);
      return successResponse(res, reglas);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  // 5. Cierre, Reemplazo y Ajustes SIRE
  async aceptarPropuestaOficial(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      empresaDemoService.validarOperacionOficialPermitida(empresaId, 'SIRE_ENVIO');
      const data = aceptarPropuestaOficialSchema.parse(req.body);
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';
      const resultado = await conciliadorSireService.aceptarPropuestaSireOficial(empresaId, data.tipo, data.periodo, userId);
      return successResponse(res, resultado, 'Propuesta oficial SIRE aceptada ante SUNAT.');
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async reemplazarPropuestaOficial(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      empresaDemoService.validarOperacionOficialPermitida(empresaId, 'SIRE_ENVIO');
      const data = reemplazarPropuestaOficialSchema.parse(req.body);
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';
      const resultado = await conciliadorSireService.reemplazarPropuestaSireOficial(
        empresaId,
        data.tipo,
        data.periodo,
        data.comprobantesReemplazo,
        userId
      );
      return successResponse(res, resultado, 'Propuesta oficial SIRE reemplazada exitosamente.');
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async registrarAjustePosterior(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const data = ajustePosteriorSchema.parse(req.body);
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';
      const resultado = await conciliadorSireService.registrarAjustePosterior(
        empresaId,
        data.periodoAjuste,
        data.periodoAfectado,
        data.ajusteData,
        userId
      );
      return successResponse(res, resultado, 'Ajuste posterior SIRE registrado.');
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  // 6. Validación de archivos planos SIRE
  async validarTxtSire(req: Request, res: Response) {
    try {
      const data = validarSireTxtSchema.parse(req.body);
      const resultado = sireLayoutService.validarLayoutTxt(data.contenidoTxt, data.tipoLayout);
      return successResponse(res, resultado);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  // 7. Historial SIRE
  async listarHistorial(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const periodo = req.query.periodo as string | undefined;
      const historial = historialGeneracionesService.listarPorEmpresa(empresaId, { modulo: 'SIRE', periodo });
      return successResponse(res, historial);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  // 8. Propuesta real + Anexos Oficiales completos SIRE
  async obtenerPropuestaPeriodo(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const tipo = ((req.query.tipo as string) || 'COMPRAS').toUpperCase() === 'VENTAS' ? 'VENTAS' : 'COMPRAS';
      const periodo = (req.query.periodo as string) || '2026-09';
      const data = await sireAnexosService.obtenerPropuestaYResumenPeriodo(empresaId, tipo, periodo);
      return successResponse(res, data);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async obtenerResumenAnexos(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const periodo = (req.query.periodo as string) || '2026-09';
      const userId = (req as any).user?.id;
      const data = await sireAnexosService.obtenerResumenAnexosPeriodo(empresaId, periodo, userId);
      return successResponse(res, data);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async generarPaqueteAnexo(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const data = generarAnexoSireSchema.parse(req.body);
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';
      const paquete = await sireAnexosService.generarPaqueteAnexo(
        empresaId,
        {
          anexo: data.anexo as CodigoAnexoSire,
          periodo: data.periodo,
          periodoAfectado: data.periodoAfectado,
          oportunidad: data.oportunidad,
          correlativo: data.correlativo,
          sinMovimiento: data.sinMovimiento,
          incluirComprasMeAuto: data.incluirComprasMeAuto,
        },
        userId
      );
      return successResponse(res, paquete, `Paquete ${paquete.nombreArchivoZip} generado y validado.`);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async listarNoDomiciliados(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const periodo = req.query.periodo as string | undefined;
      const userId = (req as any).user?.id;
      const filas = await sireAnexosService.listarNoDomiciliados(empresaId, periodo, userId);
      return successResponse(res, filas);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async crearNoDomiciliado(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const data = noDomiciliadoSchema.parse(req.body);
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';
      const creado = await sireAnexosService.crearNoDomiciliado(empresaId, data, userId);
      return successResponse(res, creado, 'Registro No Domiciliado guardado en PostgreSQL.', 201);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async actualizarNoDomiciliado(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const registroId = req.params.registroId;
      const data = noDomiciliadoSchema.parse(req.body);
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';
      const actualizado = await sireAnexosService.actualizarNoDomiciliado(empresaId, registroId, data, userId);
      return successResponse(res, actualizado, 'Registro No Domiciliado actualizado.');
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async eliminarNoDomiciliado(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const registroId = req.params.registroId;
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';
      const result = await sireAnexosService.eliminarNoDomiciliado(empresaId, registroId, userId);
      return successResponse(res, result, 'Registro No Domiciliado eliminado.');
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async listarAjustesAnexos(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const userId = (req as any).user?.id;
      const filas = await sireAnexosService.listarAjustes(
        empresaId,
        {
          periodo: req.query.periodo as string | undefined,
          registro: req.query.registro as string | undefined,
          codigoAnexo: req.query.codigoAnexo as string | undefined,
        },
        userId
      );
      return successResponse(res, filas);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async crearAjusteAnexo(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const data = ajusteAnexoSireSchema.parse(req.body);
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';
      const creado = await sireAnexosService.crearAjuste(empresaId, data, userId);
      return successResponse(res, creado, 'Registro de anexo SIRE guardado.', 201);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async actualizarAjusteAnexo(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const ajusteId = req.params.ajusteId;
      const data = ajusteAnexoSireSchema.partial().parse(req.body);
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';
      const actualizado = await sireAnexosService.actualizarAjuste(empresaId, ajusteId, data, userId);
      return successResponse(res, actualizado, 'Registro de anexo SIRE actualizado.');
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async eliminarAjusteAnexo(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const ajusteId = req.params.ajusteId;
      const userId = (req as any).user?.id || '00000000-0000-0000-0000-000000000001';
      const result = await sireAnexosService.eliminarAjuste(empresaId, ajusteId, userId);
      return successResponse(res, result, 'Registro de anexo SIRE eliminado.');
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  },

  async listarCandidatosTipoCambio(req: Request, res: Response) {
    try {
      const empresaId = req.params.id;
      const periodo = (req.query.periodo as string) || '2026-09';
      const userId = (req as any).user?.id;
      const data = await sireAnexosService.listarCandidatosTipoCambio(empresaId, periodo, userId);
      return successResponse(res, data);
    } catch (err: any) {
      return errorResponse(res, sanitizarMensaje(err));
    }
  }
};

