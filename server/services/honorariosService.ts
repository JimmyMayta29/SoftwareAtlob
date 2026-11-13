import { randomUUID } from 'node:crypto';
import { db } from '../config/database';
import { Money } from '../utils/decimal';
import { contabilizacionService } from './contabilizacionService';
import { asientoService } from './asientoService';
import { periodoService } from './periodoService';
import { parametroRepository } from '../repositories/parametroRepository';
import { auditoriaRepository } from '../repositories/auditoriaRepository';
import { CXP_MEMORIA } from './compraService';

export interface CuentaPorPagarModel {
  id: string;
  empresaId: string;
  comprobanteId: string;
  proveedorId: string;
  proveedorNombre?: string;
  proveedorRuc?: string;
  serieNumero: string;
  importeOriginal: number;
  saldo: number;
  moneda: 'PEN' | 'USD';
  fechaEmision: string;
  fechaVencimiento: string;
  diasCredito: number;
  estado: 'PENDIENTE' | 'PARCIAL' | 'CANCELADO';
}

export interface ReciboHonorarioModel {
  id: string;
  empresaId: string;
  periodoId: string;
  proveedorId: string;
  proveedorNombre?: string;
  proveedorRuc?: string;
  serie: string;
  numero: string;
  fechaEmision: string;
  fechaPago?: string;
  moneda: 'PEN' | 'USD';
  tipoCambio: number;
  importeBruto: number;
  aplicaRetencion: boolean;
  tasaRetencion: number;
  retencion: number;
  netoPagar: number;
  suspensionCuarta: boolean;
  numeroResolucionSuspension?: string;
  vigenciaSuspensionDesde?: string;
  vigenciaSuspensionHasta?: string;
  cuentaGasto: string;
  glosa: string;
  estado: 'BORRADOR' | 'REGISTRADO' | 'PAGADO' | 'ANULADO';
  asientoId?: string;
  cuentaPorPagarId?: string;
  version: number;
  origenParametroTasa?: string;
}

export const HONORARIOS_MEMORIA: ReciboHonorarioModel[] = [];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const honorariosService = {
  async listarRecibos(empresaId: string, filtros?: {
    fechaDesde?: string;
    fechaHasta?: string;
    proveedorId?: string;
    estado?: string;
  }): Promise<ReciboHonorarioModel[]> {
    if (db.isPostgresConnected()) {
      try {
        let sql = `
          SELECT r.*, a.razon_social as prov_nombre, a.numero_documento as prov_ruc
          FROM recibos_honorarios r
          LEFT JOIN anexos a ON a.id = r.proveedor_id
          WHERE r.empresa_id = $1
        `;
        const params: any[] = [empresaId];
        let pIdx = 2;
        if (filtros?.proveedorId) {
          sql += ` AND r.proveedor_id = $${pIdx++}`;
          params.push(filtros.proveedorId);
        }
        if (filtros?.estado && filtros.estado !== 'TODOS') {
          sql += ` AND r.estado = $${pIdx++}`;
          params.push(filtros.estado);
        }
        if (filtros?.fechaDesde) {
          sql += ` AND r.fecha_emision >= $${pIdx++}`;
          params.push(filtros.fechaDesde);
        }
        if (filtros?.fechaHasta) {
          sql += ` AND r.fecha_emision <= $${pIdx++}`;
          params.push(filtros.fechaHasta);
        }
        sql += ' ORDER BY r.fecha_emision DESC';
        const res = await db.query(sql, params);
        if (res.rows.length > 0) {
          return res.rows.map(row => ({
            id: String(row.id),
            empresaId: String(row.empresa_id),
            periodoId: String(row.periodo_id),
            proveedorId: String(row.proveedor_id),
            proveedorNombre: row.prov_nombre || undefined,
            proveedorRuc: row.prov_ruc || undefined,
            serie: String(row.serie),
            numero: String(row.numero),
            fechaEmision: row.fecha_emision instanceof Date ? row.fecha_emision.toISOString().slice(0, 10) : String(row.fecha_emision).slice(0, 10),
            fechaPago: row.fecha_pago ? (row.fecha_pago instanceof Date ? row.fecha_pago.toISOString().slice(0, 10) : String(row.fecha_pago).slice(0, 10)) : undefined,
            moneda: row.moneda as 'PEN' | 'USD',
            tipoCambio: Number(row.tipo_cambio),
            importeBruto: Number(row.importe_bruto),
            aplicaRetencion: Boolean(row.aplica_retencion),
            tasaRetencion: Number(row.tasa_retencion),
            retencion: Number(row.retencion),
            netoPagar: Number(row.neto_pagar),
            suspensionCuarta: Boolean(row.suspension_cuarta),
            numeroResolucionSuspension: row.numero_resolucion_suspension || undefined,
            vigenciaSuspensionDesde: row.vigencia_suspension_desde ? (row.vigencia_suspension_desde instanceof Date ? row.vigencia_suspension_desde.toISOString().slice(0, 10) : String(row.vigencia_suspension_desde).slice(0, 10)) : undefined,
            vigenciaSuspensionHasta: row.vigencia_suspension_hasta ? (row.vigencia_suspension_hasta instanceof Date ? row.vigencia_suspension_hasta.toISOString().slice(0, 10) : String(row.vigencia_suspension_hasta).slice(0, 10)) : undefined,
            cuentaGasto: String(row.cuenta_gasto),
            glosa: String(row.glosa),
            estado: row.estado as any,
            asientoId: row.asiento_id ? String(row.asiento_id) : undefined,
            cuentaPorPagarId: row.cuenta_por_pagar_id ? String(row.cuenta_por_pagar_id) : undefined,
            version: Number(row.version || 1)
          }));
        }
      } catch {
        // fallback a memoria
      }
    }

    let items = HONORARIOS_MEMORIA.filter(h => h.empresaId === empresaId);

    if (filtros?.proveedorId) items = items.filter(h => h.proveedorId === filtros.proveedorId);
    if (filtros?.estado && filtros.estado !== 'TODOS') items = items.filter(h => h.estado === filtros.estado);
    if (filtros?.fechaDesde) items = items.filter(h => h.fechaEmision >= filtros.fechaDesde!);
    if (filtros?.fechaHasta) items = items.filter(h => h.fechaEmision <= filtros.fechaHasta!);

    items.sort((a, b) => b.fechaEmision.localeCompare(a.fechaEmision));
    return items;
  },

  async registrarRecibo(
    empresaId: string,
    datos: {
      periodoId: string;
      proveedorId: string;
      proveedorNombre?: string;
      proveedorRuc?: string;
      serie: string;
      numero: string;
      fechaEmision: string;
      fechaPago?: string;
      moneda?: 'PEN' | 'USD';
      tipoCambio?: number;
      importeBruto: number;
      cuentaGasto?: string;
      glosa?: string;
      suspensionCuarta?: boolean;
      numeroResolucionSuspension?: string;
      vigenciaSuspensionDesde?: string;
      vigenciaSuspensionHasta?: string;
    },
    userId: string
  ): Promise<ReciboHonorarioModel> {
    const mes = datos.fechaEmision.substring(0, 7);
    const estadoPeriodo = await periodoService.obtenerEstadoPeriodo(empresaId, mes);
    if (estadoPeriodo === 'CERRADO' || estadoPeriodo === 'BLOQUEADO') {
      throw new Error(`PERIODO_CERRADO: El período contable ${mes} se encuentra ${estadoPeriodo}. No se pueden registrar honorarios.`);
    }

    // 1. Obtener parámetros tributarios dinámicos con vigencia por fecha
    const paramTasa = await parametroRepository.obtenerParametroPorCodigo('TASA_RETENCION_4TA', datos.fechaEmision);
    const paramTope = await parametroRepository.obtenerParametroPorCodigo('TOPE_RETENCION_4TA', datos.fechaEmision);

    const tasaRetencionDecimal = paramTasa ? paramTasa.valorNumerico : 0.08;
    const topeMonto = paramTope ? paramTope.valorNumerico : 1500.00;

    const bruto = Money.create(datos.importeBruto);
    let retencion = Money.create(0);
    let aplicaRetencion = false;

    // 2. Evaluar suspensión acreditada
    const tieneSuspensionValida = Boolean(
      datos.suspensionCuarta &&
      (!datos.vigenciaSuspensionDesde || datos.fechaEmision >= datos.vigenciaSuspensionDesde) &&
      (!datos.vigenciaSuspensionHasta || datos.fechaEmision <= datos.vigenciaSuspensionHasta)
    );

    if (tieneSuspensionValida) {
      retencion = Money.create(0);
      aplicaRetencion = false;
    } else if (bruto.greaterThan(topeMonto)) {
      retencion = Money.round(bruto.times(tasaRetencionDecimal));
      aplicaRetencion = true;
    }

    const neto = Money.sub(bruto, retencion);

    // 3. Generar Asiento Contable a través de ContabilizacionService y AsientoService
    const propuesta = await contabilizacionService.generar(empresaId, 'HONORARIO', {
      total: Money.toNumber(bruto),
      retencion: Money.toNumber(retencion),
      neto: Money.toNumber(neto),
      glosa: datos.glosa || `Honorario profesional según ${datos.serie}-${datos.numero}`,
      docSerie: datos.serie,
      docNumero: datos.numero,
      anexoId: datos.proveedorId,
      moneda: datos.moneda || 'PEN',
      tipoCambio: datos.tipoCambio || 1.0,
      cuentaGastoHonorario: datos.cuentaGasto || '6321'
    });

    const asiento = await asientoService.crearAsiento(empresaId, {
      periodoId: datos.periodoId || `per-${mes}`,
      subdiario: '08',
      fecha: datos.fechaEmision,
      moneda: datos.moneda || 'PEN',
      tipoCambio: datos.tipoCambio || 1.0,
      glosa: datos.glosa || `Honorarios profesionales ${datos.serie}-${datos.numero}`,
      origenModulo: 'HONORARIO',
      lineas: propuesta.lineas.map(l => ({
        codigoCuenta: l.codigoCuenta,
        debe: l.debe,
        haber: l.haber,
        glosa: l.glosaLinea,
        anexoId: l.anexoId
      }))
    }, userId);

    const reciboId = UUID_REGEX.test(empresaId) ? randomUUID() : `rh-${Date.now()}`;
    const cuentaPorPagarId = UUID_REGEX.test(empresaId) ? randomUUID() : `cxp-rh-${Date.now()}`;

    // 4. Crear Cuenta por Pagar en Cartera (para permitir pago por Tesorería)
    const nuevaCxP: CuentaPorPagarModel = {
      id: cuentaPorPagarId,
      empresaId,
      comprobanteId: reciboId,
      proveedorId: datos.proveedorId,
      proveedorNombre: datos.proveedorNombre || 'Prestador de Servicios',
      proveedorRuc: datos.proveedorRuc || '10000000001',
      serieNumero: `${datos.serie}-${datos.numero}`,
      importeOriginal: Money.toNumber(neto),
      saldo: Money.toNumber(neto),
      moneda: datos.moneda || 'PEN',
      fechaEmision: datos.fechaEmision,
      fechaVencimiento: datos.fechaPago || datos.fechaEmision,
      diasCredito: 0,
      estado: 'PENDIENTE'
    };
    CXP_MEMORIA.push(nuevaCxP);

    // 5. Persistir Recibo por Honorarios
    const nuevoRecibo: ReciboHonorarioModel = {
      id: reciboId,
      empresaId,
      periodoId: datos.periodoId || `per-${mes}`,
      proveedorId: datos.proveedorId,
      proveedorNombre: datos.proveedorNombre,
      proveedorRuc: datos.proveedorRuc,
      serie: datos.serie,
      numero: datos.numero,
      fechaEmision: datos.fechaEmision,
      fechaPago: datos.fechaPago,
      moneda: datos.moneda || 'PEN',
      tipoCambio: datos.tipoCambio || 1.0,
      importeBruto: Money.toNumber(bruto),
      aplicaRetencion,
      tasaRetencion: tasaRetencionDecimal * 100,
      retencion: Money.toNumber(retencion),
      netoPagar: Money.toNumber(neto),
      suspensionCuarta: tieneSuspensionValida,
      numeroResolucionSuspension: datos.numeroResolucionSuspension,
      vigenciaSuspensionDesde: datos.vigenciaSuspensionDesde,
      vigenciaSuspensionHasta: datos.vigenciaSuspensionHasta,
      cuentaGasto: datos.cuentaGasto || '6321',
      glosa: datos.glosa || `Honorario profesional según ${datos.serie}-${datos.numero}`,
      estado: 'REGISTRADO',
      asientoId: asiento.id,
      cuentaPorPagarId,
      version: 1,
      origenParametroTasa: `Parámetro vigente: ${(tasaRetencionDecimal * 100).toFixed(0)}% (Tope S/ ${topeMonto.toFixed(2)})`
    };

    HONORARIOS_MEMORIA.push(nuevoRecibo);

    if (db.isPostgresConnected() && UUID_REGEX.test(empresaId)) {
      try {
        let periodoIdSql = datos.periodoId;
        const pRes = await db.query(
          'SELECT id FROM periodos WHERE empresa_id = $1 AND anio = $2 AND mes = $3 LIMIT 1',
          [empresaId, Number(mes.split('-')[0]), Number(mes.split('-')[1])]
        );
        if (pRes.rows.length > 0) {
          periodoIdSql = pRes.rows[0].id;
        }

        let proveedorIdSql = datos.proveedorId;
        let anexoExiste = false;
        if (UUID_REGEX.test(proveedorIdSql)) {
          const aRes = await db.query('SELECT id FROM anexos WHERE id = $1 AND empresa_id = $2', [proveedorIdSql, empresaId]);
          anexoExiste = aRes.rows.length > 0;
        }
        if (!anexoExiste) {
          const rucDoc = datos.proveedorRuc || '10000000001';
          const insAnexo = await db.query(`
            INSERT INTO anexos (empresa_id, tipo_documento, numero_documento, razon_social, tipo_persona)
            VALUES ($1, $2, $3, $4, 'NATURAL')
            ON CONFLICT (empresa_id, tipo_documento, numero_documento) DO UPDATE SET razon_social = EXCLUDED.razon_social
            RETURNING id
          `, [empresaId, rucDoc.length === 8 ? '1' : '6', rucDoc, datos.proveedorNombre || `Proveedor ${rucDoc}`]);
          proveedorIdSql = insAnexo.rows[0].id;
        }

        await db.query(`
          INSERT INTO recibos_honorarios (
            id, empresa_id, periodo_id, proveedor_id, serie, numero, fecha_emision, fecha_pago,
            moneda, tipo_cambio, importe_bruto, aplica_retencion, tasa_retencion, retencion, neto_pagar,
            suspension_cuarta, numero_resolucion_suspension, vigencia_suspension_desde, vigencia_suspension_hasta,
            cuenta_gasto, glosa, estado, asiento_id, cuenta_por_pagar_id, version, created_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19,
            $20, $21, $22, $23, $24, $25, $26
          )
          ON CONFLICT (empresa_id, serie, numero, proveedor_id) DO UPDATE SET
            importe_bruto = EXCLUDED.importe_bruto,
            retencion = EXCLUDED.retencion,
            neto_pagar = EXCLUDED.neto_pagar,
            estado = EXCLUDED.estado,
            updated_at = CURRENT_TIMESTAMP
        `, [
          UUID_REGEX.test(reciboId) ? reciboId : randomUUID(),
          empresaId, periodoIdSql, proveedorIdSql, datos.serie, datos.numero, datos.fechaEmision, datos.fechaPago || null,
          datos.moneda || 'PEN', datos.tipoCambio || 1.0, Money.toNumber(bruto), aplicaRetencion, tasaRetencionDecimal * 100, Money.toNumber(retencion), Money.toNumber(neto),
          tieneSuspensionValida, datos.numeroResolucionSuspension || null, datos.vigenciaSuspensionDesde || null, datos.vigenciaSuspensionHasta || null,
          datos.cuentaGasto || '6321', nuevoRecibo.glosa, 'REGISTRADO',
          asiento.id && UUID_REGEX.test(asiento.id) ? asiento.id : null,
          null, 1, UUID_REGEX.test(userId) ? userId : null
        ]);
      } catch (err) {
        console.warn('⚠️ [honorariosService] Error persistiendo recibo en PostgreSQL:', err);
      }
    }

    await auditoriaRepository.registrar({
      empresaId,
      usuarioId: userId,
      accion: 'REGISTRAR_RECIBO_HONORARIOS',
      tabla: 'recibos_honorarios',
      registroId: nuevoRecibo.id,
      valoresNuevos: nuevoRecibo
    });

    return nuevoRecibo;
  },

  async anularRecibo(empresaId: string, id: string, motivo: string, userId: string) {
    const recibo = HONORARIOS_MEMORIA.find(r => r.id === id && r.empresaId === empresaId);
    if (!recibo) throw new Error('RECIBO_NO_ENCONTRADO');
    if (recibo.estado === 'ANULADO') throw new Error('RECIBO_YA_ANULADO');

    const mes = recibo.fechaEmision.substring(0, 7);
    const estadoPeriodo = await periodoService.obtenerEstadoPeriodo(empresaId, mes);
    if (estadoPeriodo === 'CERRADO' || estadoPeriodo === 'BLOQUEADO') {
      throw new Error(`PERIODO_CERRADO: No se puede anular un recibo en el período cerrado ${mes}.`);
    }

    // Extorno contable
    if (recibo.asientoId) {
      await asientoService.anularAsiento(empresaId, recibo.asientoId, motivo, userId);
    }

    // Anular CxP
    if (recibo.cuentaPorPagarId) {
      const cxpIdx = CXP_MEMORIA.findIndex(c => c.id === recibo.cuentaPorPagarId);
      if (cxpIdx !== -1) CXP_MEMORIA.splice(cxpIdx, 1);
    }

    recibo.estado = 'ANULADO';

    if (db.isPostgresConnected() && UUID_REGEX.test(id)) {
      try {
        await db.query(`
          UPDATE recibos_honorarios
          SET estado = 'ANULADO', updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND empresa_id = $2
        `, [id, empresaId]);
      } catch (err) {
        console.warn('⚠️ [honorariosService] Error anulando recibo en PostgreSQL:', err);
      }
    }

    await auditoriaRepository.registrar({
      empresaId,
      usuarioId: userId,
      accion: 'ANULAR_RECIBO_HONORARIOS',
      tabla: 'recibos_honorarios',
      registroId: recibo.id,
      valoresAnteriores: { estado: 'REGISTRADO' },
      valoresNuevos: { estado: 'ANULADO', motivo }
    });

    return { success: true, message: 'Recibo por honorarios anulado y extornado' };
  }
};
