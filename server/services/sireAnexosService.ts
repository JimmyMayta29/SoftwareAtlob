import crypto from 'node:crypto';
import { db } from '../config/database';
import { empresaRepository } from '../repositories/empresaRepository';
import { auditoriaRepository } from '../repositories/auditoriaRepository';
import { historialGeneracionesService } from './historialGeneracionesService';
import { sireService } from './sireService';
import {
  sireLayoutService,
  CodigoAnexoSire,
  ESPECIFICACIONES_ANEXOS_SIRE,
  construirNombreArchivoSire,
  generarCarOficial,
} from './sireLayoutService';

export interface NoDomiciliadoInput {
  periodo: string;
  carSunat?: string;
  fechaEmision: string;
  tipoComprobante?: string;
  serie?: string;
  numero: string;
  valorAdquisiciones: number;
  otrosConceptos?: number;
  importeTotal?: number;
  tipoDocSustentaCredito?: string;
  serieDocSustentaCredito?: string;
  anioDua?: string;
  numeroDocSustentaCredito?: string;
  retencionIgv?: number;
  moneda?: 'PEN' | 'USD';
  tipoCambio?: number;
  paisResidencia?: string;
  razonSocialNoDomiciliado: string;
  domicilioExtranjero?: string;
  numIdFiscal?: string;
  numIdBeneficiario?: string;
  razonSocialBeneficiario?: string;
  paisBeneficiario?: string;
  vinculoContribuyente?: string;
  rentaBruta?: number;
  deduccionCosto?: number;
  rentaNeta?: number;
  tasaRetencion?: number;
  impuestoRetenido?: number;
  convenioDobleImposicion?: string;
  exoneracionAplicada?: string;
  tipoRenta?: string;
  modalidadServicio?: string;
  aplicaArt76?: boolean;
  carCpModificar?: string;
  estado?: 'BORRADOR' | 'REGISTRADO' | 'ANULADO';
}

export interface NoDomiciliadoModel extends NoDomiciliadoInput {
  id: string;
  empresaId: string;
  createdAt: string;
  updatedAt: string;
}

export type CodigoAnexoAjusteDb =
  | 'RVIE_ANEXO_2'
  | 'RVIE_ANEXO_4'
  | 'RVIE_ANEXO_5'
  | 'RCE_ANEXO_8_CP'
  | 'RCE_ANEXO_8_INEX'
  | 'RCE_ANEXO_10'
  | 'RCE_ANEXO_12_1'
  | 'RCE_ANEXO_12_2'
  | 'RCE_ANEXO_13_1'
  | 'RCE_ANEXO_13_2';

export interface AjusteSireInput {
  periodoPresentacion: string;
  periodoAjustado: string;
  registro: 'RVIE' | 'RCE' | 'RCE_NO_DOMICILIADO';
  codigoAnexo: CodigoAnexoAjusteDb;
  tipoOperacion?: 'INCLUSION' | 'EXCLUSION' | 'MODIFICACION' | 'TIPO_CAMBIO';
  oportunidad?: '01' | '02' | '03' | '04' | '05';
  correlativo?: string;
  carOriginal?: string;
  datosJson: Record<string, any>;
  estado?: 'BORRADOR' | 'GENERADO' | 'ENVIADO';
}

export interface AjusteSireModel extends AjusteSireInput {
  id: string;
  empresaId: string;
  createdAt: string;
  updatedAt: string;
}

export const SIRE_NO_DOMICILIADOS_MEMORIA: NoDomiciliadoModel[] = [];
export const SIRE_AJUSTES_MEMORIA: AjusteSireModel[] = [];

const esUuidValido = (v?: string | null): boolean =>
  Boolean(v && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v));

function normalizarNoDomiciliadoCalculos(input: NoDomiciliadoInput) {
  const valAdq = Number(Number(input.valorAdquisiciones || 0).toFixed(2));
  const otros = Number(Number(input.otrosConceptos || 0).toFixed(2));
  const importeTotal =
    input.importeTotal !== undefined && input.importeTotal !== null
      ? Number(Number(input.importeTotal).toFixed(2))
      : Number((valAdq + otros).toFixed(2));
  const rentaBruta =
    input.rentaBruta !== undefined && input.rentaBruta !== null
      ? Number(Number(input.rentaBruta).toFixed(2))
      : valAdq;
  const deduccionCosto = Number(Number(input.deduccionCosto || 0).toFixed(2));
  const rentaNeta =
    input.rentaNeta !== undefined && input.rentaNeta !== null
      ? Number(Number(input.rentaNeta).toFixed(2))
      : Number(Math.max(0, rentaBruta - deduccionCosto).toFixed(2));
  const tasaRetencion = Number(Number(input.tasaRetencion || 0).toFixed(2));
  const impuestoRetenido =
    input.impuestoRetenido !== undefined && input.impuestoRetenido !== null
      ? Number(Number(input.impuestoRetenido).toFixed(2))
      : Number(((rentaNeta * tasaRetencion) / 100).toFixed(2));

  return {
    valAdq,
    otros,
    importeTotal,
    retencionIgv: Number(Number(input.retencionIgv || 0).toFixed(2)),
    tipoCambio: Number(Number(input.tipoCambio || 1).toFixed(4)),
    rentaBruta,
    deduccionCosto,
    rentaNeta,
    tasaRetencion,
    impuestoRetenido,
  };
}

function normalizarFechaPg(val: any): string {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val).slice(0, 10);
}

function mapRowNoDomiciliado(row: any): NoDomiciliadoModel {
  return {
    id: String(row.id),
    empresaId: String(row.empresa_id),
    periodo: String(row.periodo),
    carSunat: row.car_sunat || '',
    fechaEmision: normalizarFechaPg(row.fecha_emision),
    tipoComprobante: String(row.tipo_comprobante || '91'),
    serie: String(row.serie || ''),
    numero: String(row.numero),
    valorAdquisiciones: Number(row.valor_adquisiciones || 0),
    otrosConceptos: Number(row.otros_conceptos || 0),
    importeTotal: Number(row.importe_total || 0),
    tipoDocSustentaCredito: row.tipo_doc_sustenta_credito || '',
    serieDocSustentaCredito: row.serie_doc_sustenta_credito || '',
    anioDua: row.anio_dua || '',
    numeroDocSustentaCredito: row.numero_doc_sustenta_credito || '',
    retencionIgv: Number(row.retencion_igv || 0),
    moneda: (row.moneda || 'USD') as 'PEN' | 'USD',
    tipoCambio: Number(row.tipo_cambio || 1),
    paisResidencia: row.pais_residencia || '9249',
    razonSocialNoDomiciliado: row.razon_social_no_domiciliado,
    domicilioExtranjero: row.domicilio_extranjero || '',
    numIdFiscal: row.num_id_fiscal || '',
    numIdBeneficiario: row.num_id_beneficiario || '',
    razonSocialBeneficiario: row.razon_social_beneficiario || '',
    paisBeneficiario: row.pais_beneficiario || '',
    vinculoContribuyente: row.vinculo_contribuyente || '00',
    rentaBruta: Number(row.renta_bruta || 0),
    deduccionCosto: Number(row.deduccion_costo || 0),
    rentaNeta: Number(row.renta_neta || 0),
    tasaRetencion: Number(row.tasa_retencion || 0),
    impuestoRetenido: Number(row.impuesto_retenido || 0),
    convenioDobleImposicion: row.convenio_doble_imposicion || '00',
    exoneracionAplicada: row.exoneracion_aplicada || '',
    tipoRenta: row.tipo_renta || '00',
    modalidadServicio: row.modalidad_servicio || '',
    aplicaArt76: Boolean(row.aplica_art76),
    carCpModificar: row.car_cp_modificar || '',
    estado: (row.estado || 'REGISTRADO') as NoDomiciliadoModel['estado'],
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

function mapRowAjuste(row: any): AjusteSireModel {
  return {
    id: String(row.id),
    empresaId: String(row.empresa_id),
    periodoPresentacion: String(row.periodo_presentacion),
    periodoAjustado: String(row.periodo_ajustado),
    registro: row.registro,
    codigoAnexo: row.codigo_anexo,
    tipoOperacion: row.tipo_operacion,
    oportunidad: row.oportunidad,
    correlativo: String(row.correlativo || '01'),
    carOriginal: row.car_original || '',
    datosJson: typeof row.datos_json === 'string' ? JSON.parse(row.datos_json) : (row.datos_json || {}),
    estado: row.estado || 'BORRADOR',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

async function obtenerDatosEmpresa(empresaId: string): Promise<{ ruc: string; razonSocial: string }> {
  const emp = await empresaRepository.obtenerPorId(empresaId);
  if (emp) {
    return { ruc: emp.ruc, razonSocial: emp.razonSocial };
  }
  return { ruc: '20000000001', razonSocial: 'EMPRESA CONTRIBUYENTE S.A.C.' };
}

async function cargarComprobantesPeriodoErp(
  empresaId: string,
  tipo: 'COMPRAS' | 'VENTAS',
  periodo: string
): Promise<any[]> {
  if (!db.isPostgresConnected() || !esUuidValido(empresaId)) {
    return [];
  }
  const empInfo = await obtenerDatosEmpresa(empresaId);

  return db.withEmpresaTransaction(empresaId, async (client) => {
    if (tipo === 'COMPRAS') {
      const res = await client.query(`
        SELECT
          c.id, c.fecha_emision::text AS fecha_emision, c.fecha_vencimiento::text AS fecha_vencimiento,
          c.tipo_comprobante, c.serie, c.numero,
          c.moneda, c.tipo_cambio::float8 AS tipo_cambio,
          c.base_gravada::float8 AS base_gravada, c.igv::float8 AS igv,
          c.base_no_gravada::float8 AS base_no_gravada, c.exonerado::float8 AS exonerado,
          c.isc::float8 AS isc, c.icbper::float8 AS icbper,
          c.otros_tributos::float8 AS otros_tributos, c.total::float8 AS total,
          c.tipo_adquisicion, c.tiene_detraccion, c.estado,
          a.tipo_documento AS tipo_doc_tercero, a.numero_documento AS num_doc_tercero, a.razon_social AS razon_tercero,
          dm.fecha_emision::text AS mod_fecha, dm.tipo_comprobante AS mod_tipo,
          dm.serie AS mod_serie, dm.numero AS mod_numero
        FROM comprobantes_compra c
        JOIN periodos p ON p.id = c.periodo_id
        JOIN anexos a ON a.id = c.proveedor_id
        LEFT JOIN comprobantes_compra dm ON dm.id = c.documento_modificado_id
        WHERE c.empresa_id = $1 AND p.codigo_periodo = $2 AND c.estado <> 'ANULADO'
        ORDER BY c.fecha_emision ASC, c.serie ASC, c.numero ASC
      `, [empresaId, periodo]);

      return res.rows.map((r: any) => ({
        id: r.id,
        razonSocialEmpresa: empInfo.razonSocial,
        fechaEmision: r.fecha_emision,
        fechaVencimiento: r.fecha_vencimiento || r.fecha_emision,
        tipoComprobante: r.tipo_comprobante,
        serie: r.serie,
        numero: r.numero,
        tipoDocProveedor: r.tipo_doc_tercero || '6',
        proveedorRuc: r.num_doc_tercero,
        proveedorNombre: r.razon_tercero,
        moneda: r.moneda || 'PEN',
        tipoCambio: Number(r.tipo_cambio || 1),
        baseGravada: Number(r.base_gravada || 0),
        igv: Number(r.igv || 0),
        baseNoGravada: Number(r.base_no_gravada || 0),
        exonerado: Number(r.exonerado || 0),
        isc: Number(r.isc || 0),
        icbper: Number(r.icbper || 0),
        otrosTributos: Number(r.otros_tributos || 0),
        total: Number(r.total || 0),
        tipoAdquisicion: r.tipo_adquisicion || '1',
        tieneDetraccion: Boolean(r.tiene_detraccion),
        estado: r.estado,
        fechaDocModificado: r.mod_fecha || '',
        tipoDocModificado: r.mod_tipo || '',
        serieDocModificado: r.mod_serie || '',
        numeroDocModificado: r.mod_numero || '',
        car: generarCarOficial(r.num_doc_tercero || empInfo.ruc, r.tipo_comprobante, r.serie, r.numero),
      }));
    }

    const res = await client.query(`
      SELECT
        v.id, v.fecha_emision::text AS fecha_emision, v.fecha_vencimiento::text AS fecha_vencimiento,
        v.tipo_comprobante, v.serie, v.numero,
        v.moneda, v.tipo_cambio::float8 AS tipo_cambio,
        v.base_gravada::float8 AS base_gravada, v.igv::float8 AS igv,
        v.base_no_gravada::float8 AS base_no_gravada, v.exonerado::float8 AS exonerado,
        v.isc::float8 AS isc, v.icbper::float8 AS icbper,
        v.otros_tributos::float8 AS otros_tributos, v.total::float8 AS total,
        v.tipo_operacion, v.estado,
        a.tipo_documento AS tipo_doc_tercero, a.numero_documento AS num_doc_tercero, a.razon_social AS razon_tercero,
        dm.fecha_emision::text AS mod_fecha, dm.tipo_comprobante AS mod_tipo,
        dm.serie AS mod_serie, dm.numero AS mod_numero
      FROM comprobantes_venta v
      JOIN periodos p ON p.id = v.periodo_id
      JOIN anexos a ON a.id = v.cliente_id
      LEFT JOIN comprobantes_venta dm ON dm.id = v.documento_modificado_id
      WHERE v.empresa_id = $1 AND p.codigo_periodo = $2
      ORDER BY v.fecha_emision ASC, v.serie ASC, v.numero ASC
    `, [empresaId, periodo]);

    return res.rows.map((r: any) => ({
      id: r.id,
      razonSocialEmpresa: empInfo.razonSocial,
      fechaEmision: r.fecha_emision,
      fechaVencimiento: r.fecha_vencimiento || r.fecha_emision,
      tipoComprobante: r.tipo_comprobante,
      serie: r.serie,
      numero: r.numero,
      tipoDocCliente: r.tipo_doc_tercero || (String(r.num_doc_tercero || '').length === 11 ? '6' : '1'),
      clienteRuc: r.num_doc_tercero,
      clienteNombre: r.razon_tercero,
      moneda: r.moneda || 'PEN',
      tipoCambio: Number(r.tipo_cambio || 1),
      exportacion: r.tipo_operacion === 'EXPORTACION' ? Number(r.base_no_gravada || r.exonerado || 0) : 0,
      baseGravada: Number(r.base_gravada || 0),
      igv: Number(r.igv || 0),
      exonerado: Number(r.exonerado || 0),
      inafecto: Number(r.base_no_gravada || 0),
      isc: Number(r.isc || 0),
      icbper: Number(r.icbper || 0),
      otrosTributos: Number(r.otros_tributos || 0),
      total: Number(r.total || 0),
      estado: r.estado,
      fechaDocModificado: r.mod_fecha || '',
      tipoDocModificado: r.mod_tipo || '',
      serieDocModificado: r.mod_serie || '',
      numeroDocModificado: r.mod_numero || '',
      car: generarCarOficial(empInfo.ruc, r.tipo_comprobante, r.serie, r.numero),
    }));
  });
}

export const sireAnexosService = {
  async obtenerPropuestaYResumenPeriodo(empresaId: string, tipo: 'COMPRAS' | 'VENTAS', periodo: string) {
    const propuesta = await sireService.obtenerPropuesta(empresaId, tipo, periodo);
    const registrosErp = await cargarComprobantesPeriodoErp(empresaId, tipo, periodo);
    const empresa = await obtenerDatosEmpresa(empresaId);

    const resumenErp = registrosErp.reduce(
      (acc, r) => {
        const signoAnulado = r.estado === 'ANULADO' ? 0 : 1;
        acc.totalRegistros += 1;
        acc.totalBase += (Number(r.baseGravada || 0) + Number(r.baseNoGravada || 0) + Number(r.exonerado || 0)) * signoAnulado;
        acc.totalIgv += Number(r.igv || 0) * signoAnulado;
        acc.totalImporte += Number(r.total || 0) * signoAnulado;
        return acc;
      },
      { totalRegistros: 0, totalBase: 0, totalIgv: 0, totalImporte: 0 }
    );

    return {
      empresa,
      tipo,
      periodo,
      propuestaSunat: propuesta,
      registrosErp,
      resumenErp: {
        totalRegistros: resumenErp.totalRegistros,
        totalBase: Number(resumenErp.totalBase.toFixed(2)),
        totalIgv: Number(resumenErp.totalIgv.toFixed(2)),
        totalImporte: Number(resumenErp.totalImporte.toFixed(2)),
      },
    };
  },

  async listarNoDomiciliados(empresaId: string, periodo?: string, userId?: string): Promise<NoDomiciliadoModel[]> {
    if (db.isPostgresConnected() && esUuidValido(empresaId)) {
      const exec = (client: any) => {
        const params: any[] = [empresaId];
        let sql = `SELECT * FROM sire_no_domiciliados WHERE empresa_id = $1`;
        if (periodo) {
          params.push(periodo);
          sql += ` AND periodo = $2`;
        }
        sql += ` ORDER BY fecha_emision ASC, created_at ASC`;
        return client.query(sql, params).then((res: any) => res.rows.map(mapRowNoDomiciliado));
      };
      return userId ? db.withTenantAndEmpresa(userId, empresaId, exec) : db.withEmpresaTransaction(empresaId, exec);
    }
    return SIRE_NO_DOMICILIADOS_MEMORIA.filter(
      (r) => r.empresaId === empresaId && (!periodo || r.periodo === periodo)
    );
  },

  async crearNoDomiciliado(empresaId: string, input: NoDomiciliadoInput, userId: string): Promise<NoDomiciliadoModel> {
    const calc = normalizarNoDomiciliadoCalculos(input);
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    if (db.isPostgresConnected() && esUuidValido(empresaId)) {
      const creado = await db.withTenantAndEmpresa(userId, empresaId, async (client) => {
        const res = await client.query(`
          INSERT INTO sire_no_domiciliados (
            id, empresa_id, periodo, car_sunat, fecha_emision, tipo_comprobante, serie, numero,
            valor_adquisiciones, otros_conceptos, importe_total,
            tipo_doc_sustenta_credito, serie_doc_sustenta_credito, anio_dua, numero_doc_sustenta_credito, retencion_igv,
            moneda, tipo_cambio, pais_residencia, razon_social_no_domiciliado, domicilio_extranjero,
            num_id_fiscal, num_id_beneficiario, razon_social_beneficiario, pais_beneficiario, vinculo_contribuyente,
            renta_bruta, deduccion_costo, renta_neta, tasa_retencion, impuesto_retenido,
            convenio_doble_imposicion, exoneracion_aplicada, tipo_renta, modalidad_servicio, aplica_art76,
            car_cp_modificar, estado, usuario_id
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11,
            $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21,
            $22, $23, $24, $25, $26,
            $27, $28, $29, $30, $31,
            $32, $33, $34, $35, $36,
            $37, $38, $39
          ) RETURNING *
        `, [
          id, empresaId, input.periodo, input.carSunat || '', input.fechaEmision,
          input.tipoComprobante || '91', input.serie || '', input.numero,
          calc.valAdq, calc.otros, calc.importeTotal,
          input.tipoDocSustentaCredito || '', input.serieDocSustentaCredito || '',
          input.anioDua || '', input.numeroDocSustentaCredito || '', calc.retencionIgv,
          input.moneda || 'USD', calc.tipoCambio, input.paisResidencia || '9249',
          input.razonSocialNoDomiciliado, input.domicilioExtranjero || '',
          input.numIdFiscal || '', input.numIdBeneficiario || '', input.razonSocialBeneficiario || '',
          input.paisBeneficiario || '', input.vinculoContribuyente || '00',
          calc.rentaBruta, calc.deduccionCosto, calc.rentaNeta, calc.tasaRetencion, calc.impuestoRetenido,
          input.convenioDobleImposicion || '00', input.exoneracionAplicada || '',
          input.tipoRenta || '00', input.modalidadServicio || '', Boolean(input.aplicaArt76),
          input.carCpModificar || '', input.estado || 'REGISTRADO', esUuidValido(userId) ? userId : null
        ]);
        return mapRowNoDomiciliado(res.rows[0]);
      });

      await auditoriaRepository.registrar({
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'sire_no_domiciliados',
        registroId: creado.id,
        accion: 'INSERT',
        datosNuevos: { periodo: creado.periodo, numero: creado.numero, importeTotal: creado.importeTotal }
      });

      return creado;
    }

    const modelo: NoDomiciliadoModel = {
      ...input,
      id,
      empresaId,
      tipoComprobante: input.tipoComprobante || '91',
      serie: input.serie || '',
      valorAdquisiciones: calc.valAdq,
      otrosConceptos: calc.otros,
      importeTotal: calc.importeTotal,
      retencionIgv: calc.retencionIgv,
      moneda: input.moneda || 'USD',
      tipoCambio: calc.tipoCambio,
      paisResidencia: input.paisResidencia || '9249',
      vinculoContribuyente: input.vinculoContribuyente || '00',
      rentaBruta: calc.rentaBruta,
      deduccionCosto: calc.deduccionCosto,
      rentaNeta: calc.rentaNeta,
      tasaRetencion: calc.tasaRetencion,
      impuestoRetenido: calc.impuestoRetenido,
      convenioDobleImposicion: input.convenioDobleImposicion || '00',
      tipoRenta: input.tipoRenta || '00',
      aplicaArt76: Boolean(input.aplicaArt76),
      estado: input.estado || 'REGISTRADO',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    SIRE_NO_DOMICILIADOS_MEMORIA.push(modelo);
    return modelo;
  },

  async actualizarNoDomiciliado(
    empresaId: string,
    registroId: string,
    input: NoDomiciliadoInput,
    userId: string
  ): Promise<NoDomiciliadoModel> {
    const calc = normalizarNoDomiciliadoCalculos(input);

    if (db.isPostgresConnected() && esUuidValido(empresaId)) {
      return db.withTenantAndEmpresa(userId, empresaId, async (client) => {
        const res = await client.query(`
          UPDATE sire_no_domiciliados SET
            periodo = $3, car_sunat = $4, fecha_emision = $5, tipo_comprobante = $6, serie = $7, numero = $8,
            valor_adquisiciones = $9, otros_conceptos = $10, importe_total = $11,
            tipo_doc_sustenta_credito = $12, serie_doc_sustenta_credito = $13, anio_dua = $14, numero_doc_sustenta_credito = $15, retencion_igv = $16,
            moneda = $17, tipo_cambio = $18, pais_residencia = $19, razon_social_no_domiciliado = $20, domicilio_extranjero = $21,
            num_id_fiscal = $22, num_id_beneficiario = $23, razon_social_beneficiario = $24, pais_beneficiario = $25, vinculo_contribuyente = $26,
            renta_bruta = $27, deduccion_costo = $28, renta_neta = $29, tasa_retencion = $30, impuesto_retenido = $31,
            convenio_doble_imposicion = $32, exoneracion_aplicada = $33, tipo_renta = $34, modalidad_servicio = $35, aplica_art76 = $36,
            car_cp_modificar = $37, estado = $38, updated_at = CURRENT_TIMESTAMP
          WHERE empresa_id = $1 AND id = $2
          RETURNING *
        `, [
          empresaId, registroId, input.periodo, input.carSunat || '', input.fechaEmision,
          input.tipoComprobante || '91', input.serie || '', input.numero,
          calc.valAdq, calc.otros, calc.importeTotal,
          input.tipoDocSustentaCredito || '', input.serieDocSustentaCredito || '',
          input.anioDua || '', input.numeroDocSustentaCredito || '', calc.retencionIgv,
          input.moneda || 'USD', calc.tipoCambio, input.paisResidencia || '9249',
          input.razonSocialNoDomiciliado, input.domicilioExtranjero || '',
          input.numIdFiscal || '', input.numIdBeneficiario || '', input.razonSocialBeneficiario || '',
          input.paisBeneficiario || '', input.vinculoContribuyente || '00',
          calc.rentaBruta, calc.deduccionCosto, calc.rentaNeta, calc.tasaRetencion, calc.impuestoRetenido,
          input.convenioDobleImposicion || '00', input.exoneracionAplicada || '',
          input.tipoRenta || '00', input.modalidadServicio || '', Boolean(input.aplicaArt76),
          input.carCpModificar || '', input.estado || 'REGISTRADO'
        ]);
        if (res.rows.length === 0) throw new Error('NO_DOMICILIADO_NO_ENCONTRADO');
        return mapRowNoDomiciliado(res.rows[0]);
      });
    }

    const idx = SIRE_NO_DOMICILIADOS_MEMORIA.findIndex((r) => r.empresaId === empresaId && r.id === registroId);
    if (idx < 0) throw new Error('NO_DOMICILIADO_NO_ENCONTRADO');
    SIRE_NO_DOMICILIADOS_MEMORIA[idx] = {
      ...SIRE_NO_DOMICILIADOS_MEMORIA[idx],
      ...input,
      valorAdquisiciones: calc.valAdq,
      otrosConceptos: calc.otros,
      importeTotal: calc.importeTotal,
      retencionIgv: calc.retencionIgv,
      tipoCambio: calc.tipoCambio,
      rentaBruta: calc.rentaBruta,
      deduccionCosto: calc.deduccionCosto,
      rentaNeta: calc.rentaNeta,
      tasaRetencion: calc.tasaRetencion,
      impuestoRetenido: calc.impuestoRetenido,
      updatedAt: new Date().toISOString(),
    };
    return SIRE_NO_DOMICILIADOS_MEMORIA[idx];
  },

  async eliminarNoDomiciliado(empresaId: string, registroId: string, userId: string): Promise<{ success: boolean }> {
    if (db.isPostgresConnected() && esUuidValido(empresaId)) {
      await db.withTenantAndEmpresa(userId, empresaId, async (client) => {
        const res = await client.query(`DELETE FROM sire_no_domiciliados WHERE empresa_id = $1 AND id = $2`, [empresaId, registroId]);
        if ((res.rowCount || 0) === 0) throw new Error('NO_DOMICILIADO_NO_ENCONTRADO');
      });
      return { success: true };
    }
    const idx = SIRE_NO_DOMICILIADOS_MEMORIA.findIndex((r) => r.empresaId === empresaId && r.id === registroId);
    if (idx < 0) throw new Error('NO_DOMICILIADO_NO_ENCONTRADO');
    SIRE_NO_DOMICILIADOS_MEMORIA.splice(idx, 1);
    return { success: true };
  },

  async listarAjustes(
    empresaId: string,
    filtros?: { periodo?: string; registro?: string; codigoAnexo?: string },
    userId?: string
  ): Promise<AjusteSireModel[]> {
    if (db.isPostgresConnected() && esUuidValido(empresaId)) {
      const exec = (client: any) => {
        const params: any[] = [empresaId];
        let sql = `SELECT * FROM sire_ajustes_posteriores WHERE empresa_id = $1`;
        if (filtros?.periodo) {
          params.push(filtros.periodo);
          sql += ` AND periodo_presentacion = $${params.length}`;
        }
        if (filtros?.registro) {
          params.push(filtros.registro);
          sql += ` AND registro = $${params.length}`;
        }
        if (filtros?.codigoAnexo) {
          params.push(filtros.codigoAnexo);
          sql += ` AND codigo_anexo = $${params.length}`;
        }
        sql += ` ORDER BY created_at DESC`;
        return client.query(sql, params).then((res: any) => res.rows.map(mapRowAjuste));
      };
      return userId ? db.withTenantAndEmpresa(userId, empresaId, exec) : db.withEmpresaTransaction(empresaId, exec);
    }
    return SIRE_AJUSTES_MEMORIA.filter((a) => {
      if (a.empresaId !== empresaId) return false;
      if (filtros?.periodo && a.periodoPresentacion !== filtros.periodo) return false;
      if (filtros?.registro && a.registro !== filtros.registro) return false;
      if (filtros?.codigoAnexo && a.codigoAnexo !== filtros.codigoAnexo) return false;
      return true;
    });
  },

  async crearAjuste(empresaId: string, input: AjusteSireInput, userId: string): Promise<AjusteSireModel> {
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    if (db.isPostgresConnected() && esUuidValido(empresaId)) {
      const creado = await db.withTenantAndEmpresa(userId, empresaId, async (client) => {
        const res = await client.query(`
          INSERT INTO sire_ajustes_posteriores (
            id, empresa_id, periodo_presentacion, periodo_ajustado, registro, codigo_anexo,
            tipo_operacion, oportunidad, correlativo, car_original, datos_json, estado, usuario_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
          RETURNING *
        `, [
          id, empresaId, input.periodoPresentacion, input.periodoAjustado,
          input.registro, input.codigoAnexo, input.tipoOperacion || 'MODIFICACION',
          input.oportunidad || '03', String(input.correlativo || '01').padStart(2, '0').slice(-2),
          input.carOriginal || '', JSON.stringify(input.datosJson || {}),
          input.estado || 'BORRADOR', esUuidValido(userId) ? userId : null
        ]);
        return mapRowAjuste(res.rows[0]);
      });

      await auditoriaRepository.registrar({
        empresaId,
        usuarioId: userId,
        tablaAfectada: 'sire_ajustes_posteriores',
        registroId: creado.id,
        accion: 'INSERT',
        datosNuevos: { codigoAnexo: creado.codigoAnexo, periodo: creado.periodoPresentacion }
      });
      return creado;
    }

    const modelo: AjusteSireModel = {
      ...input,
      id,
      empresaId,
      tipoOperacion: input.tipoOperacion || 'MODIFICACION',
      oportunidad: input.oportunidad || '03',
      correlativo: String(input.correlativo || '01').padStart(2, '0').slice(-2),
      estado: input.estado || 'BORRADOR',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    SIRE_AJUSTES_MEMORIA.push(modelo);
    return modelo;
  },

  async actualizarAjuste(
    empresaId: string,
    ajusteId: string,
    input: Partial<AjusteSireInput>,
    userId: string
  ): Promise<AjusteSireModel> {
    if (db.isPostgresConnected() && esUuidValido(empresaId)) {
      return db.withTenantAndEmpresa(userId, empresaId, async (client) => {
        const prev = await client.query(`SELECT * FROM sire_ajustes_posteriores WHERE empresa_id = $1 AND id = $2`, [empresaId, ajusteId]);
        if (prev.rows.length === 0) throw new Error('AJUSTE_SIRE_NO_ENCONTRADO');
        const actual = mapRowAjuste(prev.rows[0]);
        const merged = { ...actual, ...input };
        const res = await client.query(`
          UPDATE sire_ajustes_posteriores SET
            periodo_presentacion = $3, periodo_ajustado = $4, registro = $5, codigo_anexo = $6,
            tipo_operacion = $7, oportunidad = $8, correlativo = $9, car_original = $10,
            datos_json = $11::jsonb, estado = $12, updated_at = CURRENT_TIMESTAMP
          WHERE empresa_id = $1 AND id = $2
          RETURNING *
        `, [
          empresaId, ajusteId, merged.periodoPresentacion, merged.periodoAjustado,
          merged.registro, merged.codigoAnexo, merged.tipoOperacion || 'MODIFICACION',
          merged.oportunidad || '03', String(merged.correlativo || '01').padStart(2, '0').slice(-2),
          merged.carOriginal || '', JSON.stringify(merged.datosJson || {}), merged.estado || 'BORRADOR'
        ]);
        return mapRowAjuste(res.rows[0]);
      });
    }
    const idx = SIRE_AJUSTES_MEMORIA.findIndex((a) => a.empresaId === empresaId && a.id === ajusteId);
    if (idx < 0) throw new Error('AJUSTE_SIRE_NO_ENCONTRADO');
    SIRE_AJUSTES_MEMORIA[idx] = { ...SIRE_AJUSTES_MEMORIA[idx], ...input, updatedAt: new Date().toISOString() };
    return SIRE_AJUSTES_MEMORIA[idx];
  },

  async eliminarAjuste(empresaId: string, ajusteId: string, userId: string): Promise<{ success: boolean }> {
    if (db.isPostgresConnected() && esUuidValido(empresaId)) {
      await db.withTenantAndEmpresa(userId, empresaId, async (client) => {
        const res = await client.query(`DELETE FROM sire_ajustes_posteriores WHERE empresa_id = $1 AND id = $2`, [empresaId, ajusteId]);
        if ((res.rowCount || 0) === 0) throw new Error('AJUSTE_SIRE_NO_ENCONTRADO');
      });
      return { success: true };
    }
    const idx = SIRE_AJUSTES_MEMORIA.findIndex((a) => a.empresaId === empresaId && a.id === ajusteId);
    if (idx < 0) throw new Error('AJUSTE_SIRE_NO_ENCONTRADO');
    SIRE_AJUSTES_MEMORIA.splice(idx, 1);
    return { success: true };
  },

  async listarCandidatosTipoCambio(empresaId: string, periodo: string, userId?: string) {
    const comprasPeriodo = await cargarComprobantesPeriodoErp(empresaId, 'COMPRAS', periodo);
    const comprasMe = comprasPeriodo
      .filter((c) => c.moneda !== 'PEN')
      .map((c) => ({
        id: `erp-${c.id}`,
        origen: 'ERP' as const,
        fechaEmision: c.fechaEmision,
        tipoComprobante: c.tipoComprobante,
        serie: c.serie,
        numero: c.numero,
        proveedorRuc: c.proveedorRuc,
        proveedorNombre: c.proveedorNombre,
        moneda: c.moneda,
        tipoCambio: Number(c.tipoCambio || 1),
        carSunat: c.car,
      }));
    const guardados = await this.listarAjustes(empresaId, { periodo, codigoAnexo: 'RCE_ANEXO_10' }, userId);
    const extras = guardados.map((g) => ({
      id: g.id,
      origen: 'ANEXO_10' as const,
      fechaEmision: g.datosJson?.fechaEmision || `${periodo}-01`,
      tipoComprobante: g.datosJson?.tipoComprobante || '01',
      serie: g.datosJson?.serie || '',
      numero: g.datosJson?.numero || '',
      proveedorRuc: g.datosJson?.proveedorRuc || '',
      proveedorNombre: g.datosJson?.proveedorNombre || '',
      moneda: g.datosJson?.moneda || 'USD',
      tipoCambio: Number(g.datosJson?.tipoCambio || 1),
      carSunat: g.carOriginal || g.datosJson?.carSunat || '',
    }));

    return { comprasMe, guardados: extras };
  },

  async obtenerResumenAnexosPeriodo(empresaId: string, periodo: string, userId?: string) {
    const empresa = await obtenerDatosEmpresa(empresaId);
    const [compras, ventas, noDom, ajustes] = await Promise.all([
      cargarComprobantesPeriodoErp(empresaId, 'COMPRAS', periodo),
      cargarComprobantesPeriodoErp(empresaId, 'VENTAS', periodo),
      this.listarNoDomiciliados(empresaId, periodo, userId),
      this.listarAjustes(empresaId, { periodo }, userId),
    ]);

    const conteoPorAnexo: Record<CodigoAnexoSire, number> = {
      RVIE_ANEXO_2: ajustes.filter((a) => a.codigoAnexo === 'RVIE_ANEXO_2').length,
      RVIE_ANEXO_3: ventas.length,
      RVIE_ANEXO_4: ajustes.filter((a) => a.codigoAnexo === 'RVIE_ANEXO_4').length,
      RVIE_ANEXO_5: ajustes.filter((a) => a.codigoAnexo === 'RVIE_ANEXO_5').length,
      RCE_ANEXO_8_CP: ajustes.filter((a) => a.codigoAnexo === 'RCE_ANEXO_8_CP').length,
      RCE_ANEXO_8_INEX: ajustes.filter((a) => a.codigoAnexo === 'RCE_ANEXO_8_INEX').length,
      RCE_ANEXO_9: noDom.filter((n) => n.estado !== 'ANULADO').length,
      RCE_ANEXO_10: ajustes.filter((a) => a.codigoAnexo === 'RCE_ANEXO_10').length + compras.filter((c) => c.moneda !== 'PEN').length,
      RCE_ANEXO_11: compras.length,
      RCE_ANEXO_12_1: ajustes.filter((a) => a.codigoAnexo === 'RCE_ANEXO_12_1').length,
      RCE_ANEXO_12_2: ajustes.filter((a) => a.codigoAnexo === 'RCE_ANEXO_12_2').length,
      RCE_ANEXO_13_1: ajustes.filter((a) => a.codigoAnexo === 'RCE_ANEXO_13_1').length,
      RCE_ANEXO_13_2: ajustes.filter((a) => a.codigoAnexo === 'RCE_ANEXO_13_2').length,
    };

    const anexos = (Object.keys(ESPECIFICACIONES_ANEXOS_SIRE) as CodigoAnexoSire[]).map((codigo) => {
      const spec = ESPECIFICACIONES_ANEXOS_SIRE[codigo];
      const totalRegistros = conteoPorAnexo[codigo] || 0;
      const nombres = construirNombreArchivoSire({
        rucEmpresa: empresa.ruc,
        periodo,
        anexo: codigo,
        tieneContenido: totalRegistros > 0,
        correlativo: '01',
      });
      return {
        ...spec,
        totalRegistros,
        nombreArchivoTxt: nombres.nombreArchivoTxt,
        nombreArchivoZip: nombres.nombreArchivoZip,
      };
    });

    return { empresa, periodo, anexos };
  },

  async generarPaqueteAnexo(
    empresaId: string,
    params: {
      anexo: CodigoAnexoSire;
      periodo: string;
      periodoAfectado?: string;
      oportunidad?: '01' | '02' | '03' | '04' | '05';
      correlativo?: string;
      sinMovimiento?: boolean;
      incluirComprasMeAuto?: boolean;
    },
    userId: string
  ) {
    const empresa = await obtenerDatosEmpresa(empresaId);
    const { anexo, periodo } = params;
    const correlativo = params.correlativo || '01';
    const periodoAfectado = params.periodoAfectado || periodo;

    let resultado;
    if (anexo === 'RVIE_ANEXO_3') {
      const ventas = params.sinMovimiento ? [] : await cargarComprobantesPeriodoErp(empresaId, 'VENTAS', periodo);
      resultado = sireLayoutService.generarReemplazoRvie(empresa.ruc, periodo, ventas, { sinMovimiento: params.sinMovimiento });
    } else if (anexo === 'RCE_ANEXO_11') {
      const compras = params.sinMovimiento ? [] : await cargarComprobantesPeriodoErp(empresaId, 'COMPRAS', periodo);
      resultado = sireLayoutService.generarReemplazoRce(empresa.ruc, periodo, compras, { sinMovimiento: params.sinMovimiento });
    } else if (anexo === 'RCE_ANEXO_9') {
      const noDom = params.sinMovimiento
        ? []
        : (await this.listarNoDomiciliados(empresaId, periodo, userId)).filter((n) => n.estado !== 'ANULADO');
      resultado = sireLayoutService.generarNoDomiciliadosAnexo9(empresa.ruc, periodo, noDom, { sinMovimiento: params.sinMovimiento });
    } else if (anexo === 'RVIE_ANEXO_2') {
      const filas = (await this.listarAjustes(empresaId, { periodo, codigoAnexo: 'RVIE_ANEXO_2' }, userId)).map((a) => ({
        ...a.datosJson,
        razonSocialEmpresa: empresa.razonSocial,
        car: a.datosJson?.car || a.carOriginal || '',
      }));
      resultado = sireLayoutService.generarComplementoRvieAnexo2(empresa.ruc, periodo, filas, { sinMovimiento: params.sinMovimiento });
    } else if (anexo === 'RCE_ANEXO_8_CP') {
      const filas = (await this.listarAjustes(empresaId, { periodo, codigoAnexo: 'RCE_ANEXO_8_CP' }, userId)).map((a) => ({
        ...a.datosJson,
        razonSocialEmpresa: empresa.razonSocial,
      }));
      resultado = sireLayoutService.generarComplementoRceAnexo8(empresa.ruc, periodo, filas, { correlativo });
    } else if (anexo === 'RCE_ANEXO_8_INEX') {
      const filas = (await this.listarAjustes(empresaId, { periodo, codigoAnexo: 'RCE_ANEXO_8_INEX' }, userId)).map((a) => ({
        carSunat: a.carOriginal || a.datosJson?.carSunat || '',
        tipoOperacion: (a.tipoOperacion === 'INCLUSION' ? 'INCLUSION' : 'EXCLUSION') as 'INCLUSION' | 'EXCLUSION',
        indicador: a.datosJson?.indicador as '1' | '2' | undefined,
      }));
      resultado = sireLayoutService.generarExclusionInclusionRceAnexo8(empresa.ruc, periodo, filas, { correlativo });
    } else if (anexo === 'RCE_ANEXO_10') {
      const manuales = (await this.listarAjustes(empresaId, { periodo, codigoAnexo: 'RCE_ANEXO_10' }, userId)).map((a) => ({
        fechaEmision: a.datosJson?.fechaEmision || `${periodo}-01`,
        moneda: a.datosJson?.moneda || 'USD',
        tipoCambio: Number(a.datosJson?.tipoCambio || 1),
        carSunat: a.carOriginal || a.datosJson?.carSunat || '',
      }));
      const candidatos = params.incluirComprasMeAuto !== false
        ? (await this.listarCandidatosTipoCambio(empresaId, periodo, userId)).comprasMe
        : [];
      const combinados = [...manuales, ...candidatos];
      resultado = sireLayoutService.generarTipoCambioAnexo10(empresa.ruc, periodo, combinados, { correlativo });
    } else if (anexo === 'RVIE_ANEXO_4' || anexo === 'RVIE_ANEXO_5') {
      const filas = (await this.listarAjustes(empresaId, { periodo, codigoAnexo: anexo }, userId)).map((a) => ({
        ...a.datosJson,
        razonSocialEmpresa: empresa.razonSocial,
        periodoAfectado: a.periodoAjustado,
        carCpModificar: a.carOriginal || a.datosJson?.carCpModificar || '',
      }));
      const oppAjuste = (params.oportunidad === '03' || params.oportunidad === '04' || params.oportunidad === '05'
        ? params.oportunidad
        : (anexo === 'RVIE_ANEXO_5' ? '04' : '03')) as '03' | '04' | '05';
      resultado = sireLayoutService.generarAjustesRvie(empresa.ruc, periodo, periodoAfectado, filas, {
        esPreSire: anexo === 'RVIE_ANEXO_5',
        oportunidad: oppAjuste,
        correlativo,
      });
    } else if (anexo === 'RCE_ANEXO_12_1' || anexo === 'RCE_ANEXO_13_1') {
      const filas = (await this.listarAjustes(empresaId, { periodo, codigoAnexo: anexo }, userId)).map((a) => ({
        ...a.datosJson,
        razonSocialEmpresa: empresa.razonSocial,
        periodoAfectado: a.periodoAjustado,
        carCpModificar: a.carOriginal || a.datosJson?.carCpModificar || '',
      }));
      const oppAjuste = (params.oportunidad === '03' || params.oportunidad === '04' || params.oportunidad === '05'
        ? params.oportunidad
        : (anexo === 'RCE_ANEXO_13_1' ? '04' : '03')) as '03' | '04' | '05';
      resultado = sireLayoutService.generarAjustesRce(empresa.ruc, periodo, periodoAfectado, filas, {
        esPreSire: anexo === 'RCE_ANEXO_13_1',
        oportunidad: oppAjuste,
        correlativo,
      });
    } else {
      // RCE_ANEXO_12_2 | RCE_ANEXO_13_2
      const filas = (await this.listarAjustes(empresaId, { periodo, codigoAnexo: anexo }, userId)).map((a) => ({
        ...a.datosJson,
        periodoAfectado: a.periodoAjustado,
        carCpModificar: a.carOriginal || a.datosJson?.carCpModificar || '',
      }));
      const oppAjuste = (params.oportunidad === '03' || params.oportunidad === '04' || params.oportunidad === '05'
        ? params.oportunidad
        : (anexo === 'RCE_ANEXO_13_2' ? '04' : '03')) as '03' | '04' | '05';
      resultado = sireLayoutService.generarAjustesNoDomiciliados(empresa.ruc, periodo, periodoAfectado, filas, {
        esPreSire: anexo === 'RCE_ANEXO_13_2',
        oportunidad: oppAjuste,
        correlativo,
      });
    }

    const validacion = sireLayoutService.validarLayoutTxt(resultado.contenidoTxt, anexo);

    await historialGeneracionesService.registrarGeneracion({
      empresaId,
      periodo,
      modulo: 'SIRE',
      tipoOperacion:
        anexo === 'RVIE_ANEXO_3' || anexo === 'RCE_ANEXO_11' || anexo === 'RCE_ANEXO_9'
          ? 'REEMPLAZO_PROPUESTA'
          : 'AJUSTE_POSTERIOR',
      subtipo: anexo,
      nombreArchivo: resultado.nombreArchivoZip,
      hashSha256: resultado.hashSha256,
      contenido: resultado.contenidoTxt,
      totalRegistros: resultado.totalFilas,
      esOficial: true,
      usuarioId: userId,
    });

    return {
      anexo,
      especificacion: ESPECIFICACIONES_ANEXOS_SIRE[anexo],
      nombreArchivoTxt: resultado.nombreArchivoTxt,
      nombreArchivoZip: resultado.nombreArchivoZip,
      contenidoTxt: resultado.contenidoTxt,
      zipBase64: resultado.zipBuffer.toString('base64'),
      hashSha256: resultado.hashSha256,
      totalCampos: resultado.totalCampos,
      totalFilas: resultado.totalFilas,
      validacion,
    };
  },
};
