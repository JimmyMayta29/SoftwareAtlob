import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { db } from '../config/database';
import { Money } from '../utils/decimal';
import { contabilizacionService } from './contabilizacionService';
import { asientoService } from './asientoService';
import { periodoService } from './periodoService';
import { auditoriaRepository } from '../repositories/auditoriaRepository';
import { CXP_MEMORIA } from './compraService';
import { CXC_MEMORIA } from './ventaService';
import { DETRACCIONES_MEMORIA } from './detraccionService';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CuentaFinancieraModel {
  id: string;
  empresaId: string;
  tipo: 'CAJA' | 'BANCO' | 'DETRACCIONES_BN';
  banco: string;
  numero: string;
  moneda: 'PEN' | 'USD';
  cuentaContableCodigo: string;
  saldoInicial: number;
  saldoActual: number;
  activa: boolean;
}

export interface MovimientoTesoreriaModel {
  id: string;
  empresaId: string;
  periodoId: string;
  cuentaFinancieraId: string;
  fecha: string;
  tipo: 'INGRESO' | 'EGRESO' | 'TRANSFERENCIA' | 'COMISION' | 'ITF' | 'DEPOSITO_DETRACCION';
  medioPago: string;
  numeroOperacion?: string;
  anexoId?: string;
  moneda: 'PEN' | 'USD';
  tipoCambio: number;
  importe: number;
  importeMe?: number;
  saldoSinAplicar: number;
  glosa: string;
  estado: 'BORRADOR' | 'REGISTRADO' | 'ANULADO';
  conciliado: boolean;
  asientoId?: string;
  version: number;
  createdAt: string;
  aplicaciones?: Array<{
    documentoId: string;
    importeAplicado: number;
  }>;
}

export interface TransferenciaModel {
  id: string;
  empresaId: string;
  periodoId: string;
  cuentaOrigenId: string;
  cuentaDestinoId: string;
  fecha: string;
  importeOrigen: number;
  monedaOrigen: 'PEN' | 'USD';
  importeDestino: number;
  monedaDestino: 'PEN' | 'USD';
  tipoCambio: number;
  diferenciaCambio: number;
  tipoDiferencia: 'GANANCIA' | 'PERDIDA' | 'NINGUNA';
  glosa: string;
  estado: 'BORRADOR' | 'REGISTRADO' | 'ANULADO';
  asientoId?: string;
}

// Almacenes en memoria para fallback resiliente
export const CUENTAS_FINANCIERAS_MEMORIA: CuentaFinancieraModel[] = [
  {
    id: 'cta-bcp-soles-01',
    empresaId: '00000000-0000-0000-0000-000000000001',
    tipo: 'BANCO',
    banco: 'BCP',
    numero: '193-4819283-0-21',
    moneda: 'PEN',
    cuentaContableCodigo: '1041',
    saldoInicial: 50000.00,
    saldoActual: 50000.00,
    activa: true
  },
  {
    id: 'cta-bbva-usd-01',
    empresaId: '00000000-0000-0000-0000-000000000001',
    tipo: 'BANCO',
    banco: 'BBVA',
    numero: '0011-0182-0100049182',
    moneda: 'USD',
    cuentaContableCodigo: '10412',
    saldoInicial: 10000.00,
    saldoActual: 10000.00,
    activa: true
  },
  {
    id: 'cta-bn-detracciones-01',
    empresaId: '00000000-0000-0000-0000-000000000001',
    tipo: 'DETRACCIONES_BN',
    banco: 'BANCO_DE_LA_NACION',
    numero: '00-068-192831',
    moneda: 'PEN',
    cuentaContableCodigo: '1042',
    saldoInicial: 15000.00,
    saldoActual: 15000.00,
    activa: true
  }
];

export const MOVIMIENTOS_TESORERIA_MEMORIA: MovimientoTesoreriaModel[] = [];
export const TRANSFERENCIAS_MEMORIA: TransferenciaModel[] = [];

export const tesoreriaService = {
  // --------------------------------------------------------------------------
  // CUENTAS FINANCIERAS
  // --------------------------------------------------------------------------
  async listarCuentas(empresaId: string): Promise<CuentaFinancieraModel[]> {
    if (db.isPostgresConnected()) {
      const res = await db.query<CuentaFinancieraModel>(`
        SELECT id, empresa_id as "empresaId", tipo, banco, numero, moneda,
               cuenta_contable_codigo as "cuentaContableCodigo",
               saldo_inicial::numeric as "saldoInicial", saldo_actual::numeric as "saldoActual", activa
        FROM cuentas_financieras
        WHERE empresa_id = $1
        ORDER BY tipo, banco
      `, [empresaId]);
      if (res.rows && res.rows.length > 0) {
        return res.rows.map(r => ({
          ...r,
          saldoInicial: Number(r.saldoInicial || 0),
          saldoActual: Number(r.saldoActual || 0)
        }));
      }

      // Si no existen cuentas para la empresa en PostgreSQL, inicializar cuentas base oficiales
      const cuentasBase = [
        { tipo: 'CAJA' as const, banco: 'CAJA_CENTRAL', numero: '001', moneda: 'PEN' as const, cuentaContableCodigo: '1011', saldoInicial: 0 },
        { tipo: 'BANCO' as const, banco: 'BCP', numero: '193-4819283-0-21', moneda: 'PEN' as const, cuentaContableCodigo: '1041', saldoInicial: 0 },
        { tipo: 'BANCO' as const, banco: 'BBVA', numero: '0011-0182-0100049182', moneda: 'USD' as const, cuentaContableCodigo: '10412', saldoInicial: 0 },
        { tipo: 'DETRACCIONES_BN' as const, banco: 'BANCO_DE_LA_NACION', numero: '00-068-192831', moneda: 'PEN' as const, cuentaContableCodigo: '1042', saldoInicial: 0 }
      ];

      for (const cb of cuentasBase) {
        const id = randomUUID();
        try {
          await db.query(`
            INSERT INTO cuentas_financieras (
              id, empresa_id, tipo, banco, numero, moneda, cuenta_contable_codigo, saldo_inicial, saldo_actual, activa
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
            ON CONFLICT (empresa_id, banco, numero) DO NOTHING
          `, [id, empresaId, cb.tipo, cb.banco, cb.numero, cb.moneda, cb.cuentaContableCodigo, cb.saldoInicial, cb.saldoInicial]);
        } catch {}
      }

      const resAfter = await db.query<CuentaFinancieraModel>(`
        SELECT id, empresa_id as "empresaId", tipo, banco, numero, moneda,
               cuenta_contable_codigo as "cuentaContableCodigo",
               saldo_inicial::numeric as "saldoInicial", saldo_actual::numeric as "saldoActual", activa
        FROM cuentas_financieras
        WHERE empresa_id = $1
        ORDER BY tipo, banco
      `, [empresaId]);
      if (resAfter.rows && resAfter.rows.length > 0) {
        return resAfter.rows.map(r => ({
          ...r,
          saldoInicial: Number(r.saldoInicial || 0),
          saldoActual: Number(r.saldoActual || 0)
        }));
      }
    }
    const cuentas = CUENTAS_FINANCIERAS_MEMORIA.filter(c => c.empresaId === empresaId);
    return cuentas || [];
  },

  async obtenerCuentaPorId(empresaId: string, id: string): Promise<CuentaFinancieraModel | null> {
    if (db.isPostgresConnected()) {
      const res = await db.query<CuentaFinancieraModel>(`
        SELECT id, empresa_id as "empresaId", tipo, banco, numero, moneda,
               cuenta_contable_codigo as "cuentaContableCodigo",
               saldo_inicial::numeric as "saldoInicial", saldo_actual::numeric as "saldoActual", activa
        FROM cuentas_financieras
        WHERE (id::text = $1) AND empresa_id = $2
      `, [id, empresaId]);
      if (res.rows[0]) {
        return {
          ...res.rows[0],
          saldoInicial: Number(res.rows[0].saldoInicial || 0),
          saldoActual: Number(res.rows[0].saldoActual || 0)
        };
      }
    }
    const cuentas = await this.listarCuentas(empresaId);
    return cuentas.find(c => c.id === id) || null;
  },

  async crearCuenta(empresaId: string, datos: Omit<CuentaFinancieraModel, 'id' | 'empresaId' | 'saldoActual'>): Promise<CuentaFinancieraModel> {
    const id = (db.isPostgresConnected() || UUID_REGEX.test(empresaId)) ? randomUUID() : `cta-${Date.now()}`;
    const nueva: CuentaFinancieraModel = {
      id,
      empresaId,
      tipo: datos.tipo,
      banco: datos.banco,
      numero: datos.numero,
      moneda: datos.moneda,
      cuentaContableCodigo: datos.cuentaContableCodigo || (datos.tipo === 'CAJA' ? '1011' : (datos.tipo === 'DETRACCIONES_BN' ? '1042' : '1041')),
      saldoInicial: datos.saldoInicial || 0,
      saldoActual: datos.saldoInicial || 0,
      activa: datos.activa !== undefined ? datos.activa : true
    };

    if (db.isPostgresConnected()) {
      await db.query(`
        INSERT INTO cuentas_financieras (
          id, empresa_id, tipo, banco, numero, moneda, cuenta_contable_codigo, saldo_inicial, saldo_actual, activa
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        nueva.id, nueva.empresaId, nueva.tipo, nueva.banco, nueva.numero,
        nueva.moneda, nueva.cuentaContableCodigo, nueva.saldoInicial, nueva.saldoActual, nueva.activa
      ]);
    }
    CUENTAS_FINANCIERAS_MEMORIA.push(nueva);
    return nueva;
  },

  // --------------------------------------------------------------------------
  // MOVIMIENTOS DE TESORERÍA (INGRESOS, EGRESOS, DETRACCIONES SPOT)
  // --------------------------------------------------------------------------
  async listarMovimientos(empresaId: string, filtros?: {
    cuentaFinancieraId?: string;
    tipo?: string;
    estado?: string;
    fechaDesde?: string;
    fechaHasta?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, filtros?.page || 1);
    const limit = Math.min(100, Math.max(1, filtros?.limit || 50));
    const offset = (page - 1) * limit;

    if (db.isPostgresConnected()) {
      let where = `WHERE empresa_id = $1`;
      const values: any[] = [empresaId];

      if (filtros?.cuentaFinancieraId) {
        values.push(filtros.cuentaFinancieraId);
        where += ` AND cuenta_financiera_id::text = $${values.length}`;
      }
      if (filtros?.tipo && filtros.tipo !== 'TODOS') {
        values.push(filtros.tipo);
        where += ` AND tipo = $${values.length}`;
      }
      if (filtros?.estado && filtros.estado !== 'TODOS') {
        values.push(filtros.estado);
        where += ` AND estado = $${values.length}`;
      }
      if (filtros?.fechaDesde) {
        values.push(filtros.fechaDesde);
        where += ` AND fecha >= $${values.length}`;
      }
      if (filtros?.fechaHasta) {
        values.push(filtros.fechaHasta);
        where += ` AND fecha <= $${values.length}`;
      }

      const countRes = await db.query(`
        SELECT COUNT(*) as total FROM movimientos_tesoreria
        ${where}
      `, values);
      const total = parseInt(countRes.rows[0]?.total || '0', 10);

      values.push(limit, offset);
      const dataRes = await db.query(`
        SELECT id, empresa_id as "empresaId", periodo_id as "periodoId",
               cuenta_financiera_id as "cuentaFinancieraId", fecha::text, tipo,
               medio_pago as "medioPago", numero_operacion as "numeroOperacion",
               anexo_id as "anexoId", moneda, tipo_cambio::numeric as "tipoCambio",
               importe::numeric as "importe", importe_me::numeric as "importeMe",
               saldo_sin_aplicar::numeric as "saldoSinAplicar",
               glosa, estado, conciliado, asiento_id as "asientoId",
               version, created_at as "createdAt"
        FROM movimientos_tesoreria
        ${where}
        ORDER BY fecha DESC, created_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `, values);

      const items: MovimientoTesoreriaModel[] = dataRes.rows.map(r => ({
        ...r,
        tipoCambio: Number(r.tipoCambio || 1),
        importe: Number(r.importe || 0),
        importeMe: Number(r.importeMe || 0),
        saldoSinAplicar: Number(r.saldoSinAplicar || 0)
      }));

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    }

    let items = MOVIMIENTOS_TESORERIA_MEMORIA.filter(m => m.empresaId === empresaId);

    if (filtros?.cuentaFinancieraId) {
      items = items.filter(m => m.cuentaFinancieraId === filtros.cuentaFinancieraId);
    }
    if (filtros?.tipo && filtros.tipo !== 'TODOS') {
      items = items.filter(m => m.tipo === filtros.tipo);
    }
    if (filtros?.estado && filtros.estado !== 'TODOS') {
      items = items.filter(m => m.estado === filtros.estado);
    }
    if (filtros?.fechaDesde) {
      items = items.filter(m => m.fecha >= filtros.fechaDesde!);
    }
    if (filtros?.fechaHasta) {
      items = items.filter(m => m.fecha <= filtros.fechaHasta!);
    }

    // Orden cronológico descendente
    items.sort((a, b) => b.fecha.localeCompare(a.fecha));

    const total = items.length;
    const paginated = items.slice(offset, offset + limit);

    return {
      items: paginated,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  },

  async registrarMovimiento(
    empresaId: string,
    datos: {
      periodoId: string;
      cuentaFinancieraId: string;
      fecha: string;
      tipo: 'INGRESO' | 'EGRESO' | 'COMISION' | 'ITF' | 'DEPOSITO_DETRACCION';
      medioPago: string;
      numeroOperacion?: string;
      anexoId?: string;
      moneda?: 'PEN' | 'USD';
      tipoCambio?: number;
      importe: number;
      glosa: string;
      detraccionId?: string;
      subdiario?: string;
      cuentaContrapartidaCodigo?: string;
      tieneRetencion?: boolean;
      montoRetencion?: number;
      porcentajeRetencion?: number;
      esCheque?: boolean;
      esDepositoCheque?: boolean;
      esAnticipo?: boolean;
      diferenciaCambio?: number;
      tipoDiferencia?: 'GANANCIA' | 'PERDIDA' | 'NINGUNA';
      montoOriginalDoc?: number;
      aplicaciones?: Array<{
        documentoId: string;
        importeAplicado: number;
      }>;
    },
    userId: string,
    conexion?: PoolClient
  ): Promise<MovimientoTesoreriaModel> {
    if (conexion) {
      return this.registrarMovimientoEnConexion(empresaId, datos, userId, conexion);
    }

    // 1. Validar Período Contable Abierto
    const mesPeriodo = datos.fecha.substring(0, 7);
    const estadoPeriodo = await periodoService.obtenerEstadoPeriodo(empresaId, mesPeriodo);
    if (estadoPeriodo === 'CERRADO' || estadoPeriodo === 'BLOQUEADO') {
      throw new Error(`PERIODO_CERRADO: El período contable ${mesPeriodo} se encuentra ${estadoPeriodo}. No se permiten movimientos de tesorería.`);
    }

    // 2. Validar Cuenta Financiera
    const cuenta = await this.obtenerCuentaPorId(empresaId, datos.cuentaFinancieraId);
    if (!cuenta) {
      throw new Error('CUENTA_FINANCIERA_NO_EXISTE: La cuenta financiera especificada no existe.');
    }

    const moneda = datos.moneda || cuenta.moneda || 'PEN';
    const tipoCambio = datos.tipoCambio || 1.0;
    const importeTotal = Money.create(datos.importe);
    let totalAplicado = Money.create(0);

    // 3. Procesar Aplicaciones a Cartera (CxC o CxP)
    const aplicacionesProcesadas: Array<{ documentoId: string; importeAplicado: number }> = [];

    if (datos.tipo === 'INGRESO' && datos.aplicaciones && datos.aplicaciones.length > 0) {
      // Aplicar a Cuentas por Cobrar
      for (const app of datos.aplicaciones) {
        let doc = CXC_MEMORIA.find(d => d.id === app.documentoId && d.empresaId === empresaId);
        if (!doc && db.isPostgresConnected()) {
          try {
            const res = await db.query(
              'SELECT id, comprobante_id, cliente_id, moneda, importe_original, saldo, estado FROM cuentas_por_cobrar WHERE empresa_id = $1 AND (id::text = $2 OR comprobante_id::text = $2) LIMIT 1',
              [empresaId, app.documentoId]
            );
            if (res.rows.length > 0) {
              const r = res.rows[0];
              doc = {
                id: String(r.id),
                empresaId,
                comprobanteId: String(r.comprobante_id),
                clienteId: String(r.cliente_id),
                serieNumero: '',
                importeOriginal: Number(r.importe_original),
                saldo: Number(r.saldo),
                moneda: r.moneda,
                fechaEmision: '',
                fechaVencimiento: '',
                diasCredito: 0,
                estado: r.estado
              };
            }
          } catch {}
        }

        if (!doc) {
          throw new Error(`DOCUMENTO_NO_ENCONTRADO: El documento por cobrar ${app.documentoId} no existe en la empresa.`);
        }
        if (doc.estado === 'CANCELADO' || doc.saldo <= 0) {
          throw new Error(`DOCUMENTO_YA_CANCELADO: El comprobante ${doc.comprobanteId} ya se encuentra totalmente cancelado.`);
        }

        const montoApp = Money.create(app.importeAplicado);
        if (montoApp.greaterThan(doc.saldo)) {
          throw new Error(`SALDO_INSUFICIENTE_APLICACION: El monto aplicado (${Money.toNumber(montoApp)}) excede el saldo pendiente (${doc.saldo}).`);
        }

        const nuevoSaldo = Money.sub(doc.saldo, montoApp);
        doc.saldo = Money.toNumber(nuevoSaldo);
        doc.estado = nuevoSaldo.isZero() ? 'CANCELADO' : 'PARCIAL';
        totalAplicado = Money.add(totalAplicado, montoApp);
        aplicacionesProcesadas.push({ documentoId: doc.id, importeAplicado: Money.toNumber(montoApp) });

        if (db.isPostgresConnected()) {
          try {
            await db.query(
              'UPDATE cuentas_por_cobrar SET saldo = $1, estado = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND empresa_id = $4',
              [doc.saldo, doc.estado, doc.id, empresaId]
            );
          } catch (err) {
            console.warn('⚠️ [tesoreriaService] Error actualizando saldo de CxC en PostgreSQL:', err);
          }
        }
      }
    } else if (datos.tipo === 'EGRESO' && datos.aplicaciones && datos.aplicaciones.length > 0) {
      // Aplicar a Cuentas por Pagar
      for (const app of datos.aplicaciones) {
        let doc = CXP_MEMORIA.find(d => d.id === app.documentoId && d.empresaId === empresaId);
        if (!doc && db.isPostgresConnected()) {
          try {
            const res = await db.query(
              'SELECT id, comprobante_id, proveedor_id, moneda, importe_original, saldo, estado FROM cuentas_por_pagar WHERE empresa_id = $1 AND (id::text = $2 OR comprobante_id::text = $2) LIMIT 1',
              [empresaId, app.documentoId]
            );
            if (res.rows.length > 0) {
              const r = res.rows[0];
              doc = {
                id: String(r.id),
                empresaId,
                comprobanteId: String(r.comprobante_id),
                proveedorId: String(r.proveedor_id),
                serieNumero: '',
                importeOriginal: Number(r.importe_original),
                saldo: Number(r.saldo),
                moneda: r.moneda,
                fechaEmision: '',
                fechaVencimiento: '',
                diasCredito: 0,
                estado: r.estado
              };
            }
          } catch {}
        }

        if (!doc) {
          throw new Error(`DOCUMENTO_NO_ENCONTRADO: El documento por pagar ${app.documentoId} no existe en la empresa.`);
        }
        if (doc.estado === 'CANCELADO' || doc.saldo <= 0) {
          throw new Error(`DOCUMENTO_YA_CANCELADO: El comprobante ${doc.comprobanteId} ya se encuentra totalmente cancelado.`);
        }

        const montoApp = Money.create(app.importeAplicado);
        if (montoApp.greaterThan(doc.saldo)) {
          throw new Error(`SALDO_INSUFICIENTE_APLICACION: El monto aplicado (${Money.toNumber(montoApp)}) excede el saldo pendiente (${doc.saldo}).`);
        }

        const nuevoSaldo = Money.sub(doc.saldo, montoApp);
        doc.saldo = Money.toNumber(nuevoSaldo);
        doc.estado = nuevoSaldo.isZero() ? 'CANCELADO' : 'PARCIAL';
        totalAplicado = Money.add(totalAplicado, montoApp);
        aplicacionesProcesadas.push({ documentoId: doc.id, importeAplicado: Money.toNumber(montoApp) });

        if (db.isPostgresConnected()) {
          try {
            await db.query(
              'UPDATE cuentas_por_pagar SET saldo = $1, estado = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND empresa_id = $4',
              [doc.saldo, doc.estado, doc.id, empresaId]
            );
          } catch (err) {
            console.warn('⚠️ [tesoreriaService] Error actualizando saldo de CxP en PostgreSQL:', err);
          }
        }
      }
    }

    // Saldo sin aplicar queda como anticipo
    const saldoSinAplicar = Money.sub(importeTotal, totalAplicado);
    if (saldoSinAplicar.isNegative()) {
      throw new Error(`IMPORTE_INSUFICIENTE: La suma de aplicaciones (${Money.toNumber(totalAplicado)}) supera el importe del movimiento (${Money.toNumber(importeTotal)}).`);
    }

    // 4. Si es Depósito de Detracción SPOT, actualizar estado de la detracción en el BN
    if (datos.tipo === 'DEPOSITO_DETRACCION') {
      const detraccion = DETRACCIONES_MEMORIA.find(d => 
        d.empresaId === empresaId && (d.id === datos.detraccionId || d.comprobanteCompraId === datos.detraccionId)
      );
      if (detraccion) {
        detraccion.estado = 'DEPOSITADA';
        detraccion.numeroConstancia = datos.numeroOperacion || `CONST-${Date.now()}`;
        detraccion.fechaDeposito = datos.fecha;
        detraccion.permiteCreditoFiscal = true;
      }
    }

    // 5. Generar Asiento Contable a través de ContabilizacionService y AsientoService
    let tipoOpContable: any = 'PAGO';
    let subdiario: any = datos.subdiario || (datos.tipo === 'INGRESO' ? '03' : (datos.tipo === 'DEPOSITO_DETRACCION' ? '05' : '04'));

    if (datos.tipo === 'INGRESO') {
      tipoOpContable = 'COBRANZA';
    } else if (datos.tipo === 'EGRESO') {
      tipoOpContable = 'PAGO';
    } else if (datos.tipo === 'DEPOSITO_DETRACCION') {
      tipoOpContable = 'DETRACCION_DEPOSITO';
    }

    const propuestaAsiento = await contabilizacionService.generar(empresaId, tipoOpContable, {
      total: Money.toNumber(importeTotal),
      glosa: datos.glosa || `${datos.tipo} en ${cuenta.banco} ${cuenta.numero}`,
      cuentaFinancieraCodigo: cuenta.cuentaContableCodigo,
      cuentaContrapartidaCodigo: datos.cuentaContrapartidaCodigo,
      anexoId: datos.anexoId,
      moneda,
      tipoCambio,
      tieneRetencion: datos.tieneRetencion,
      montoRetencion: datos.montoRetencion,
      porcentajeRetencion: datos.porcentajeRetencion,
      esCheque: datos.esCheque,
      esDepositoCheque: datos.esDepositoCheque,
      esAnticipo: datos.esAnticipo,
      diferenciaCambio: datos.diferenciaCambio,
      tipoDiferencia: datos.tipoDiferencia,
      montoOriginalDoc: datos.montoOriginalDoc
    } as any);

    const asientoCreado = await asientoService.crearAsiento(empresaId, {
      periodoId: datos.periodoId || `per-${mesPeriodo}`,
      subdiario,
      fecha: datos.fecha,
      moneda,
      tipoCambio,
      glosa: datos.glosa || `${datos.tipo} ${cuenta.banco} ${cuenta.numero}`,
      origenModulo: 'TESORERIA',
      lineas: propuestaAsiento.lineas.map(l => ({
        codigoCuenta: l.codigoCuenta,
        debe: l.debe,
        haber: l.haber,
        debeMe: l.debeMe,
        haberMe: l.haberMe,
        glosa: l.glosaLinea,
        anexoId: l.anexoId
      }))
    }, userId);

    // 6. Actualizar Saldo de la Cuenta Financiera
    if (datos.tipo === 'INGRESO') {
      cuenta.saldoActual = Money.toNumber(Money.add(cuenta.saldoActual, importeTotal));
    } else {
      cuenta.saldoActual = Money.toNumber(Money.sub(cuenta.saldoActual, importeTotal));
    }

    // 7. Persistir Movimiento
    const id = (db.isPostgresConnected() || UUID_REGEX.test(empresaId)) ? randomUUID() : `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    let perId = datos.periodoId;
    if (db.isPostgresConnected()) {
      if (!UUID_REGEX.test(perId)) {
        const per = await periodoService.obtenerPorCodigo(empresaId, mesPeriodo);
        if (per) perId = per.id;
      }
    }

    const nuevoMovimiento: MovimientoTesoreriaModel = {
      id,
      empresaId,
      periodoId: perId || `per-${mesPeriodo}`,
      cuentaFinancieraId: datos.cuentaFinancieraId,
      fecha: datos.fecha,
      tipo: datos.tipo,
      medioPago: datos.medioPago || '003',
      numeroOperacion: datos.numeroOperacion,
      anexoId: datos.anexoId,
      moneda,
      tipoCambio,
      importe: Money.toNumber(importeTotal),
      importeMe: moneda === 'USD' ? Money.toNumber(importeTotal) : 0,
      saldoSinAplicar: Money.toNumber(saldoSinAplicar),
      glosa: datos.glosa,
      estado: 'REGISTRADO',
      conciliado: false,
      asientoId: asientoCreado.id,
      version: 1,
      createdAt: new Date().toISOString(),
      aplicaciones: aplicacionesProcesadas
    };

    if (db.isPostgresConnected()) {
      await db.query(`
        INSERT INTO movimientos_tesoreria (
          id, empresa_id, periodo_id, cuenta_financiera_id, fecha, tipo,
          medio_pago, numero_operacion, anexo_id, moneda, tipo_cambio,
          importe, importe_me, saldo_sin_aplicar, glosa, estado, conciliado,
          asiento_id, version, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, 'REGISTRADO', false,
          $16, 1, $17
        )
      `, [
        nuevoMovimiento.id, empresaId, nuevoMovimiento.periodoId, nuevoMovimiento.cuentaFinancieraId,
        nuevoMovimiento.fecha, nuevoMovimiento.tipo, nuevoMovimiento.medioPago,
        nuevoMovimiento.numeroOperacion || null,
        UUID_REGEX.test(nuevoMovimiento.anexoId || '') ? nuevoMovimiento.anexoId : null,
        nuevoMovimiento.moneda, nuevoMovimiento.tipoCambio, nuevoMovimiento.importe,
        nuevoMovimiento.importeMe || 0, nuevoMovimiento.saldoSinAplicar, nuevoMovimiento.glosa,
        UUID_REGEX.test(asientoCreado.id) ? asientoCreado.id : null,
        UUID_REGEX.test(userId) ? userId : null
      ]);

      await db.query(`
        UPDATE cuentas_financieras
        SET saldo_actual = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND empresa_id = $3
      `, [cuenta.saldoActual, cuenta.id, empresaId]);

      if (datos.tipo === 'EGRESO') {
        for (const app of aplicacionesProcesadas) {
          if (UUID_REGEX.test(app.documentoId)) {
            try {
              await db.query(`
                INSERT INTO aplicaciones_pago (
                  empresa_id, cuenta_por_pagar_id, asiento_id, fecha_pago, importe_aplicado, moneda, tipo_cambio, referencia_banco
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              `, [
                empresaId, app.documentoId,
                UUID_REGEX.test(asientoCreado.id) ? asientoCreado.id : null,
                nuevoMovimiento.fecha, app.importeAplicado, moneda, tipoCambio,
                nuevoMovimiento.numeroOperacion || null
              ]);
            } catch {}
          }
        }
      } else if (datos.tipo === 'INGRESO') {
        for (const app of aplicacionesProcesadas) {
          if (UUID_REGEX.test(app.documentoId)) {
            try {
              await db.query(`
                INSERT INTO aplicaciones_cobranza (
                  empresa_id, cuenta_por_cobrar_id, asiento_id, fecha_cobro, importe_aplicado, moneda, tipo_cambio, referencia_banco
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              `, [
                empresaId, app.documentoId,
                UUID_REGEX.test(asientoCreado.id) ? asientoCreado.id : null,
                nuevoMovimiento.fecha, app.importeAplicado, moneda, tipoCambio,
                nuevoMovimiento.numeroOperacion || null
              ]);
            } catch {}
          }
        }
      }
    }

    MOVIMIENTOS_TESORERIA_MEMORIA.push(nuevoMovimiento);

    await auditoriaRepository.registrar({
      empresaId,
      usuarioId: userId,
      accion: 'REGISTRAR_MOVIMIENTO_TESORERIA',
      tabla: 'movimientos_tesoreria',
      registroId: nuevoMovimiento.id,
      valoresNuevos: nuevoMovimiento
    });

    return nuevoMovimiento;
  },

  async registrarMovimientoEnConexion(
    empresaId: string,
    datos: {
      periodoId: string;
      cuentaFinancieraId: string;
      fecha: string;
      tipo: 'INGRESO' | 'EGRESO' | 'COMISION' | 'ITF' | 'DEPOSITO_DETRACCION';
      medioPago: string;
      numeroOperacion?: string;
      anexoId?: string;
      moneda?: 'PEN' | 'USD';
      tipoCambio?: number;
      importe: number;
      glosa: string;
      detraccionId?: string;
      subdiario?: string;
      cuentaContrapartidaCodigo?: string;
      tieneRetencion?: boolean;
      montoRetencion?: number;
      porcentajeRetencion?: number;
      esCheque?: boolean;
      esDepositoCheque?: boolean;
      esAnticipo?: boolean;
      diferenciaCambio?: number;
      tipoDiferencia?: 'GANANCIA' | 'PERDIDA' | 'NINGUNA';
      montoOriginalDoc?: number;
      aplicaciones?: Array<{
        documentoId: string;
        importeAplicado: number;
      }>;
    },
    userId: string,
    conexion: PoolClient
  ): Promise<MovimientoTesoreriaModel> {
    // 1. Validar Período Contable Abierto directamente sobre conexion
    const mesPeriodo = datos.fecha.substring(0, 7);
    const perByIdRes = UUID_REGEX.test(datos.periodoId || '')
      ? await conexion.query<{ id: string; codigo_periodo: string; estado: string }>(
          `SELECT id, codigo_periodo, estado FROM periodos WHERE empresa_id = $1 AND id = $2 LIMIT 1`,
          [empresaId, datos.periodoId]
        )
      : { rows: [] as Array<{ id: string; codigo_periodo: string; estado: string }> };

    const perByCodigoRes = await conexion.query<{ id: string; codigo_periodo: string; estado: string }>(
      `SELECT id, codigo_periodo, estado FROM periodos WHERE empresa_id = $1 AND codigo_periodo = $2 LIMIT 1`,
      [empresaId, mesPeriodo]
    );

    const periodoRow = perByCodigoRes.rows[0] || perByIdRes.rows[0];
    if (!periodoRow) {
      throw new Error(`PERIODO_NO_ENCONTRADO: No existe el período contable ${mesPeriodo} en la empresa.`);
    }
    const estadosBloqueo = new Set(['CERRADO', 'BLOQUEADO', 'BLOQUEADO_AUDITORIA']);
    if (
      estadosBloqueo.has(periodoRow.estado) ||
      (perByIdRes.rows[0] && estadosBloqueo.has(perByIdRes.rows[0].estado))
    ) {
      const estadoBloqueo = estadosBloqueo.has(periodoRow.estado)
        ? periodoRow.estado
        : perByIdRes.rows[0].estado;
      throw new Error(
        `PERIODO_CERRADO: El período contable ${mesPeriodo} se encuentra ${estadoBloqueo}. No se permiten movimientos de tesorería.`
      );
    }
    const resolvedPeriodoId = perByIdRes.rows[0]?.id || periodoRow.id;

    // 2. Validar y bloquear Cuenta Financiera directamente sobre conexion
    const ctaRes = await conexion.query<{
      id: string;
      empresaId: string;
      tipo: 'CAJA' | 'BANCO' | 'DETRACCIONES_BN';
      banco: string;
      numero: string;
      moneda: 'PEN' | 'USD';
      cuentaContableCodigo: string;
      saldoInicial: string;
      saldoActual: string;
      activa: boolean;
    }>(
      `SELECT id, empresa_id as "empresaId", tipo, banco, numero, moneda,
              cuenta_contable_codigo as "cuentaContableCodigo",
              saldo_inicial::text as "saldoInicial", saldo_actual::text as "saldoActual", activa
       FROM cuentas_financieras
       WHERE id::text = $1 AND empresa_id = $2
       FOR UPDATE`,
      [datos.cuentaFinancieraId, empresaId]
    );
    if (ctaRes.rows.length === 0) {
      throw new Error('CUENTA_FINANCIERA_NO_EXISTE: La cuenta financiera especificada no existe.');
    }
    const ctaRow = ctaRes.rows[0];
    if (!ctaRow.activa) {
      throw new Error('CUENTA_FINANCIERA_INACTIVA: La cuenta financiera especificada se encuentra inactiva.');
    }

    const moneda = datos.moneda || ctaRow.moneda || 'PEN';
    const tipoCambio = datos.tipoCambio && datos.tipoCambio > 0 ? datos.tipoCambio : 1.0;
    const importeTotal = Money.round(datos.importe);
    if (importeTotal.lessThanOrEqualTo(0)) {
      throw new Error('IMPORTE_INVALIDO: El importe del movimiento debe ser mayor a 0.00.');
    }
    let totalAplicado = Money.create(0);

    // 3. Procesar Aplicaciones a Cartera (CxC o CxP) con bloqueo FOR UPDATE
    const aplicacionesProcesadas: Array<{ documentoId: string; importeAplicado: number }> = [];

    if (datos.tipo === 'INGRESO' && datos.aplicaciones && datos.aplicaciones.length > 0) {
      for (const app of datos.aplicaciones) {
        const res = await conexion.query<{
          id: string;
          comprobante_id: string;
          cliente_id: string;
          moneda: string;
          importe_original: string;
          saldo: string;
          estado: string;
        }>(
          `SELECT id, comprobante_id, cliente_id, moneda, importe_original::text as importe_original, saldo::text as saldo, estado
           FROM cuentas_por_cobrar
           WHERE empresa_id = $1 AND (id::text = $2 OR comprobante_id::text = $2)
           LIMIT 1
           FOR UPDATE`,
          [empresaId, app.documentoId]
        );
        if (res.rows.length === 0) {
          throw new Error(`DOCUMENTO_NO_ENCONTRADO: El documento por cobrar ${app.documentoId} no existe en la empresa.`);
        }
        const docRow = res.rows[0];
        const saldoActualDoc = Money.create(docRow.saldo);
        if (docRow.estado === 'CANCELADO' || saldoActualDoc.lessThanOrEqualTo(0)) {
          throw new Error(`DOCUMENTO_YA_CANCELADO: El comprobante ${docRow.comprobante_id} ya se encuentra totalmente cancelado.`);
        }

        const montoApp = Money.round(app.importeAplicado);
        if (montoApp.lessThanOrEqualTo(0)) {
          throw new Error('IMPORTE_APLICACION_INVALIDO: El importe aplicado debe ser mayor a 0.00.');
        }
        if (montoApp.greaterThan(saldoActualDoc)) {
          throw new Error(
            `SALDO_INSUFICIENTE_APLICACION: El monto aplicado (${Money.format(montoApp)}) excede el saldo pendiente (${Money.format(saldoActualDoc)}).`
          );
        }

        const nuevoSaldo = Money.sub(saldoActualDoc, montoApp);
        const nuevoEstado = nuevoSaldo.isZero() ? 'CANCELADO' : 'PARCIAL';

        await conexion.query(
          `UPDATE cuentas_por_cobrar SET saldo = $1, estado = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND empresa_id = $4`,
          [Money.toNumber(nuevoSaldo), nuevoEstado, docRow.id, empresaId]
        );

        totalAplicado = Money.add(totalAplicado, montoApp);
        aplicacionesProcesadas.push({ documentoId: String(docRow.id), importeAplicado: Money.toNumber(montoApp) });
      }
    } else if (datos.tipo === 'EGRESO' && datos.aplicaciones && datos.aplicaciones.length > 0) {
      for (const app of datos.aplicaciones) {
        const res = await conexion.query<{
          id: string;
          comprobante_id: string;
          proveedor_id: string;
          moneda: string;
          importe_original: string;
          saldo: string;
          estado: string;
        }>(
          `SELECT id, comprobante_id, proveedor_id, moneda, importe_original::text as importe_original, saldo::text as saldo, estado
           FROM cuentas_por_pagar
           WHERE empresa_id = $1 AND (id::text = $2 OR comprobante_id::text = $2)
           LIMIT 1
           FOR UPDATE`,
          [empresaId, app.documentoId]
        );
        if (res.rows.length === 0) {
          throw new Error(`DOCUMENTO_NO_ENCONTRADO: El documento por pagar ${app.documentoId} no existe en la empresa.`);
        }
        const docRow = res.rows[0];
        const saldoActualDoc = Money.create(docRow.saldo);
        if (docRow.estado === 'CANCELADO' || saldoActualDoc.lessThanOrEqualTo(0)) {
          throw new Error(`DOCUMENTO_YA_CANCELADO: El comprobante ${docRow.comprobante_id} ya se encuentra totalmente cancelado.`);
        }

        const montoApp = Money.round(app.importeAplicado);
        if (montoApp.lessThanOrEqualTo(0)) {
          throw new Error('IMPORTE_APLICACION_INVALIDO: El importe aplicado debe ser mayor a 0.00.');
        }
        if (montoApp.greaterThan(saldoActualDoc)) {
          throw new Error(
            `SALDO_INSUFICIENTE_APLICACION: El monto aplicado (${Money.format(montoApp)}) excede el saldo pendiente (${Money.format(saldoActualDoc)}).`
          );
        }

        const nuevoSaldo = Money.sub(saldoActualDoc, montoApp);
        const nuevoEstado = nuevoSaldo.isZero() ? 'CANCELADO' : 'PARCIAL';

        await conexion.query(
          `UPDATE cuentas_por_pagar SET saldo = $1, estado = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND empresa_id = $4`,
          [Money.toNumber(nuevoSaldo), nuevoEstado, docRow.id, empresaId]
        );

        totalAplicado = Money.add(totalAplicado, montoApp);
        aplicacionesProcesadas.push({ documentoId: String(docRow.id), importeAplicado: Money.toNumber(montoApp) });
      }
    }

    const saldoSinAplicar = Money.sub(importeTotal, totalAplicado);
    if (saldoSinAplicar.isNegative()) {
      throw new Error(
        `IMPORTE_INSUFICIENTE: La suma de aplicaciones (${Money.format(totalAplicado)}) supera el importe del movimiento (${Money.format(importeTotal)}).`
      );
    }

    // 4. Si es Depósito de Detracción SPOT, actualizar estado en BD dentro de la misma TX
    if (datos.tipo === 'DEPOSITO_DETRACCION' && datos.detraccionId && UUID_REGEX.test(datos.detraccionId)) {
      const detRes = await conexion.query<{ id: string }>(
        `SELECT id FROM detracciones WHERE empresa_id = $1 AND (id = $2 OR comprobante_id = $2) LIMIT 1 FOR UPDATE`,
        [empresaId, datos.detraccionId]
      );
      if (detRes.rows.length > 0) {
        const constancia = datos.numeroOperacion || `CONST-${Date.now()}`;
        await conexion.query(
          `UPDATE detracciones
           SET estado = 'DEPOSITADA',
               numero_constancia = $1,
               fecha_deposito = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3 AND empresa_id = $4`,
          [constancia, datos.fecha, detRes.rows[0].id, empresaId]
        );
      }
    }

    // 5. Generar Asiento Contable dentro de la misma TX
    let tipoOpContable: any = 'PAGO';
    const subdiario: any = datos.subdiario || (datos.tipo === 'INGRESO' ? '03' : (datos.tipo === 'DEPOSITO_DETRACCION' ? '05' : '04'));

    if (datos.tipo === 'INGRESO') {
      tipoOpContable = 'COBRANZA';
    } else if (datos.tipo === 'EGRESO') {
      tipoOpContable = 'PAGO';
    } else if (datos.tipo === 'DEPOSITO_DETRACCION') {
      tipoOpContable = 'DETRACCION_DEPOSITO';
    }

    const propuestaAsiento = await contabilizacionService.generar(empresaId, tipoOpContable, {
      total: Money.toNumber(importeTotal),
      glosa: datos.glosa || `${datos.tipo} en ${ctaRow.banco} ${ctaRow.numero}`,
      cuentaFinancieraCodigo: ctaRow.cuentaContableCodigo,
      cuentaContrapartidaCodigo: datos.cuentaContrapartidaCodigo,
      anexoId: datos.anexoId,
      moneda,
      tipoCambio,
      tieneRetencion: datos.tieneRetencion,
      montoRetencion: datos.montoRetencion,
      porcentajeRetencion: datos.porcentajeRetencion,
      esCheque: datos.esCheque,
      esDepositoCheque: datos.esDepositoCheque,
      esAnticipo: datos.esAnticipo,
      diferenciaCambio: datos.diferenciaCambio,
      tipoDiferencia: datos.tipoDiferencia,
      montoOriginalDoc: datos.montoOriginalDoc
    } as any);

    const asientoCreado = await asientoService.crearAsiento(empresaId, {
      periodoId: resolvedPeriodoId,
      subdiario,
      fecha: datos.fecha,
      moneda,
      tipoCambio,
      glosa: datos.glosa || `${datos.tipo} ${ctaRow.banco} ${ctaRow.numero}`,
      origenModulo: 'TESORERIA',
      lineas: propuestaAsiento.lineas.map(l => ({
        codigoCuenta: l.codigoCuenta,
        debe: l.debe,
        haber: l.haber,
        debeMe: l.debeMe,
        haberMe: l.haberMe,
        glosa: l.glosaLinea,
        anexoId: l.anexoId
      }))
    }, userId, conexion);

    // 6. Calcular nuevo saldo de cuenta financiera con Money
    const saldoActualCuenta = Money.create(ctaRow.saldoActual);
    const nuevoSaldoCuenta = datos.tipo === 'INGRESO'
      ? Money.add(saldoActualCuenta, importeTotal)
      : Money.sub(saldoActualCuenta, importeTotal);

    // 7. Persistir Movimiento, saldo de cuenta y aplicaciones en la misma TX (sin tragar errores)
    const id = randomUUID();
    const nuevoMovimiento: MovimientoTesoreriaModel = {
      id,
      empresaId,
      periodoId: resolvedPeriodoId,
      cuentaFinancieraId: ctaRow.id,
      fecha: datos.fecha,
      tipo: datos.tipo,
      medioPago: datos.medioPago || '003',
      numeroOperacion: datos.numeroOperacion,
      anexoId: datos.anexoId,
      moneda,
      tipoCambio,
      importe: Money.toNumber(importeTotal),
      importeMe: moneda === 'USD' ? Money.toNumber(importeTotal) : 0,
      saldoSinAplicar: Money.toNumber(saldoSinAplicar),
      glosa: datos.glosa,
      estado: 'REGISTRADO',
      conciliado: false,
      asientoId: asientoCreado.id,
      version: 1,
      createdAt: new Date().toISOString(),
      aplicaciones: aplicacionesProcesadas
    };

    await conexion.query(`
      INSERT INTO movimientos_tesoreria (
        id, empresa_id, periodo_id, cuenta_financiera_id, fecha, tipo,
        medio_pago, numero_operacion, anexo_id, moneda, tipo_cambio,
        importe, importe_me, saldo_sin_aplicar, glosa, estado, conciliado,
        asiento_id, version, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, 'REGISTRADO', false,
        $16, 1, $17
      )
    `, [
      nuevoMovimiento.id, empresaId, nuevoMovimiento.periodoId, nuevoMovimiento.cuentaFinancieraId,
      nuevoMovimiento.fecha, nuevoMovimiento.tipo, nuevoMovimiento.medioPago,
      nuevoMovimiento.numeroOperacion || null,
      UUID_REGEX.test(nuevoMovimiento.anexoId || '') ? nuevoMovimiento.anexoId : null,
      nuevoMovimiento.moneda, nuevoMovimiento.tipoCambio, nuevoMovimiento.importe,
      nuevoMovimiento.importeMe || 0, nuevoMovimiento.saldoSinAplicar, nuevoMovimiento.glosa,
      UUID_REGEX.test(asientoCreado.id) ? asientoCreado.id : null,
      UUID_REGEX.test(userId) ? userId : null
    ]);

    await conexion.query(`
      UPDATE cuentas_financieras
      SET saldo_actual = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND empresa_id = $3
    `, [Money.toNumber(nuevoSaldoCuenta), ctaRow.id, empresaId]);

    if (datos.tipo === 'EGRESO') {
      for (const app of aplicacionesProcesadas) {
        await conexion.query(`
          INSERT INTO aplicaciones_pago (
            empresa_id, cuenta_por_pagar_id, asiento_id, fecha_pago, importe_aplicado,
            moneda, tipo_cambio, referencia_banco, movimiento_tesoreria_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          empresaId,
          app.documentoId,
          UUID_REGEX.test(asientoCreado.id) ? asientoCreado.id : null,
          nuevoMovimiento.fecha,
          app.importeAplicado,
          moneda,
          tipoCambio,
          nuevoMovimiento.numeroOperacion || null,
          nuevoMovimiento.id
        ]);
      }
    } else if (datos.tipo === 'INGRESO') {
      for (const app of aplicacionesProcesadas) {
        await conexion.query(`
          INSERT INTO aplicaciones_cobranza (
            empresa_id, cuenta_por_cobrar_id, asiento_id, fecha_cobranza, importe_aplicado,
            moneda, tipo_cambio, referencia_banco, movimiento_tesoreria_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          empresaId,
          app.documentoId,
          UUID_REGEX.test(asientoCreado.id) ? asientoCreado.id : null,
          nuevoMovimiento.fecha,
          app.importeAplicado,
          moneda,
          tipoCambio,
          nuevoMovimiento.numeroOperacion || null,
          nuevoMovimiento.id
        ]);
      }
    }

    await auditoriaRepository.registrar({
      empresaId,
      usuarioId: userId,
      accion: 'REGISTRAR_MOVIMIENTO_TESORERIA',
      tabla: 'movimientos_tesoreria',
      registroId: nuevoMovimiento.id,
      valoresNuevos: nuevoMovimiento
    }, conexion);

    return nuevoMovimiento;
  },

  // --------------------------------------------------------------------------
  // TRANSFERENCIAS ENTRE CUENTAS (CON DIFERENCIA DE CAMBIO Y PARTIDA DOBLE)
  // --------------------------------------------------------------------------
  async registrarTransferencia(
    empresaId: string,
    datos: {
      periodoId: string;
      cuentaOrigenId: string;
      cuentaDestinoId: string;
      fecha: string;
      importeOrigen: number;
      importeDestino?: number;
      tipoCambio?: number;
      glosa: string;
    },
    userId: string
  ): Promise<TransferenciaModel> {
    const mesPeriodo = datos.fecha.substring(0, 7);
    const estadoPeriodo = await periodoService.obtenerEstadoPeriodo(empresaId, mesPeriodo);
    if (estadoPeriodo === 'CERRADO' || estadoPeriodo === 'BLOQUEADO') {
      throw new Error(`PERIODO_CERRADO: El período contable ${mesPeriodo} se encuentra cerrado.`);
    }

    const ctaOrigen = await this.obtenerCuentaPorId(empresaId, datos.cuentaOrigenId);
    const ctaDestino = await this.obtenerCuentaPorId(empresaId, datos.cuentaDestinoId);
    if (!ctaOrigen || !ctaDestino) {
      throw new Error('CUENTAS_INVALIDAS: Cuentas de origen y destino deben existir en la empresa.');
    }

    const montoOrigen = Money.create(datos.importeOrigen);
    const tc = datos.tipoCambio || 1.0;

    let montoDestino = datos.importeDestino !== undefined 
      ? Money.create(datos.importeDestino) 
      : (ctaOrigen.moneda === ctaDestino.moneda 
          ? montoOrigen 
          : (ctaOrigen.moneda === 'USD' && ctaDestino.moneda === 'PEN' ? Money.mul(montoOrigen, tc) : Money.div(montoOrigen, tc)));

    // Calcular valores en PEN para verificar diferencia de cambio
    const montoOrigenPen = ctaOrigen.moneda === 'USD' ? Money.mul(montoOrigen, tc) : montoOrigen;
    const montoDestinoPen = ctaDestino.moneda === 'USD' ? Money.mul(montoDestino, tc) : montoDestino;

    const diff = Money.sub(montoDestinoPen, montoOrigenPen);
    let tipoDif: 'GANANCIA' | 'PERDIDA' | 'NINGUNA' = 'NINGUNA';
    let difCambioAbs = 0;

    if (!diff.isZero()) {
      if (diff.isPositive()) {
        tipoDif = 'GANANCIA'; // Cuenta 776
        difCambioAbs = Money.toNumber(diff);
      } else {
        tipoDif = 'PERDIDA';  // Cuenta 676
        difCambioAbs = Math.abs(Money.toNumber(diff));
      }
    }

    // Contabilizar asiento de transferencia
    const propuesta = await contabilizacionService.generar(empresaId, 'TRANSFERENCIA', {
      total: Money.toNumber(montoOrigenPen),
      cuentaOrigenCodigo: ctaOrigen.cuentaContableCodigo,
      cuentaDestinoCodigo: ctaDestino.cuentaContableCodigo,
      montoOrigen: Money.toNumber(montoOrigenPen),
      montoDestino: Money.toNumber(montoDestinoPen),
      diferenciaCambio: difCambioAbs,
      tipoDiferencia: tipoDif,
      glosa: datos.glosa || `Transferencia de ${ctaOrigen.banco} a ${ctaDestino.banco}`
    });

    const asiento = await asientoService.crearAsiento(empresaId, {
      periodoId: datos.periodoId || `per-${mesPeriodo}`,
      subdiario: '05',
      fecha: datos.fecha,
      moneda: 'PEN',
      tipoCambio: tc,
      glosa: datos.glosa || `Transferencia entre cuentas bancarias`,
      origenModulo: 'TESORERIA',
      lineas: propuesta.lineas.map(l => ({
        codigoCuenta: l.codigoCuenta,
        debe: l.debe,
        haber: l.haber,
        glosa: l.glosaLinea
      }))
    }, userId);

    // Actualizar saldos financieros
    ctaOrigen.saldoActual = Money.toNumber(Money.sub(ctaOrigen.saldoActual, montoOrigen));
    ctaDestino.saldoActual = Money.toNumber(Money.add(ctaDestino.saldoActual, montoDestino));

    const id = (db.isPostgresConnected() || UUID_REGEX.test(empresaId)) ? randomUUID() : `trf-${Date.now()}`;
    let perId = datos.periodoId;
    if (db.isPostgresConnected() && !UUID_REGEX.test(perId)) {
      const per = await periodoService.obtenerPorCodigo(empresaId, mesPeriodo);
      if (per) perId = per.id;
    }

    const nuevaTransf: TransferenciaModel = {
      id,
      empresaId,
      periodoId: perId || `per-${mesPeriodo}`,
      cuentaOrigenId: datos.cuentaOrigenId,
      cuentaDestinoId: datos.cuentaDestinoId,
      fecha: datos.fecha,
      importeOrigen: Money.toNumber(montoOrigen),
      monedaOrigen: ctaOrigen.moneda,
      importeDestino: Money.toNumber(montoDestino),
      monedaDestino: ctaDestino.moneda,
      tipoCambio: tc,
      diferenciaCambio: difCambioAbs,
      tipoDiferencia: tipoDif,
      glosa: datos.glosa,
      estado: 'REGISTRADO',
      asientoId: asiento.id
    };

    if (db.isPostgresConnected()) {
      await db.query(`
        INSERT INTO transferencias_cuentas (
          id, empresa_id, periodo_id, cuenta_origen_id, cuenta_destino_id,
          fecha, importe_origen, moneda_origen, importe_destino, moneda_destino,
          tipo_cambio, diferencia_cambio, tipo_diferencia, glosa, estado,
          asiento_id, version, created_by
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, 'REGISTRADO',
          $15, 1, $16
        )
      `, [
        nuevaTransf.id, empresaId, nuevaTransf.periodoId, nuevaTransf.cuentaOrigenId,
        nuevaTransf.cuentaDestinoId, nuevaTransf.fecha, nuevaTransf.importeOrigen,
        nuevaTransf.monedaOrigen, nuevaTransf.importeDestino, nuevaTransf.monedaDestino,
        nuevaTransf.tipoCambio, nuevaTransf.diferenciaCambio, nuevaTransf.tipoDiferencia,
        nuevaTransf.glosa, UUID_REGEX.test(asiento.id) ? asiento.id : null,
        UUID_REGEX.test(userId) ? userId : null
      ]);

      await db.query(`
        UPDATE cuentas_financieras SET saldo_actual = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND empresa_id = $3
      `, [ctaOrigen.saldoActual, ctaOrigen.id, empresaId]);

      await db.query(`
        UPDATE cuentas_financieras SET saldo_actual = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND empresa_id = $3
      `, [ctaDestino.saldoActual, ctaDestino.id, empresaId]);
    }

    TRANSFERENCIAS_MEMORIA.push(nuevaTransf);
    return nuevaTransf;
  },

  // --------------------------------------------------------------------------
  // ANULAR MOVIMIENTO (EXTORNO Y REVERSIÓN DE APLICACIONES)
  // --------------------------------------------------------------------------
  async anularMovimiento(empresaId: string, movimientoId: string, motivo: string, userId: string) {
    let mov = MOVIMIENTOS_TESORERIA_MEMORIA.find(m => m.id === movimientoId && m.empresaId === empresaId);
    if (!mov && db.isPostgresConnected()) {
      const res = await db.query(`
        SELECT id, empresa_id as "empresaId", periodo_id as "periodoId",
               cuenta_financiera_id as "cuentaFinancieraId", fecha::text, tipo,
               medio_pago as "medioPago", numero_operacion as "numeroOperacion",
               anexo_id as "anexoId", moneda, tipo_cambio::numeric as "tipoCambio",
               importe::numeric as "importe", importe_me::numeric as "importeMe",
               saldo_sin_aplicar::numeric as "saldoSinAplicar",
               glosa, estado, conciliado, asiento_id as "asientoId",
               version, created_at as "createdAt"
        FROM movimientos_tesoreria
        WHERE id::text = $1 AND empresa_id = $2
      `, [movimientoId, empresaId]);
      if (res.rows[0]) {
        mov = {
          ...res.rows[0],
          tipoCambio: Number(res.rows[0].tipoCambio || 1),
          importe: Number(res.rows[0].importe || 0),
          importeMe: Number(res.rows[0].importeMe || 0),
          saldoSinAplicar: Number(res.rows[0].saldoSinAplicar || 0)
        };
      }
    }

    if (!mov) {
      throw new Error('MOVIMIENTO_NO_ENCONTRADO: El movimiento de tesorería no existe.');
    }
    if (mov.estado === 'ANULADO') {
      throw new Error('MOVIMIENTO_YA_ANULADO: El movimiento ya se encuentra en estado ANULADO.');
    }

    const mes = mov.fecha.substring(0, 7);
    const estadoPeriodo = await periodoService.obtenerEstadoPeriodo(empresaId, mes);
    if (estadoPeriodo === 'CERRADO' || estadoPeriodo === 'BLOQUEADO') {
      throw new Error(`PERIODO_CERRADO: No se puede anular un movimiento en el período cerrado ${mes}.`);
    }

    // 1. Revertir Asiento Contable con Extorno
    if (mov.asientoId) {
      await asientoService.anularAsiento(empresaId, mov.asientoId, motivo, userId);
    }

    // 2. Revertir Aplicaciones en Cartera
    if (mov.aplicaciones && mov.aplicaciones.length > 0) {
      if (mov.tipo === 'INGRESO') {
        for (const app of mov.aplicaciones) {
          const doc = CXC_MEMORIA.find(d => d.id === app.documentoId);
          if (doc) {
            doc.saldo = Money.toNumber(Money.add(doc.saldo, app.importeAplicado));
            doc.estado = doc.saldo >= doc.importeOriginal ? 'PENDIENTE' : 'PARCIAL';
          }
        }
      } else if (mov.tipo === 'EGRESO') {
        for (const app of mov.aplicaciones) {
          const doc = CXP_MEMORIA.find(d => d.id === app.documentoId);
          if (doc) {
            doc.saldo = Money.toNumber(Money.add(doc.saldo, app.importeAplicado));
            doc.estado = doc.saldo >= doc.importeOriginal ? 'PENDIENTE' : 'PARCIAL';
          }
        }
      }
    }

    // 3. Revertir Saldo en Cuenta Financiera
    const cuenta = await this.obtenerCuentaPorId(empresaId, mov.cuentaFinancieraId);
    if (cuenta) {
      if (mov.tipo === 'INGRESO') {
        cuenta.saldoActual = Money.toNumber(Money.sub(cuenta.saldoActual, mov.importe));
      } else {
        cuenta.saldoActual = Money.toNumber(Money.add(cuenta.saldoActual, mov.importe));
      }
    }

    mov.estado = 'ANULADO';

    if (db.isPostgresConnected()) {
      await db.query(`
        UPDATE movimientos_tesoreria
        SET estado = 'ANULADO', updated_at = CURRENT_TIMESTAMP
        WHERE id::text = $1 AND empresa_id = $2
      `, [movimientoId, empresaId]);

      if (cuenta) {
        await db.query(`
          UPDATE cuentas_financieras
          SET saldo_actual = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 AND empresa_id = $3
        `, [cuenta.saldoActual, cuenta.id, empresaId]);
      }
    }

    await auditoriaRepository.registrar({
      empresaId,
      usuarioId: userId,
      accion: 'ANULAR_MOVIMIENTO_TESORERIA',
      tabla: 'movimientos_tesoreria',
      registroId: mov.id,
      valoresAnteriores: { estado: 'REGISTRADO' },
      valoresNuevos: { estado: 'ANULADO', motivo }
    });

    return { success: true, message: 'Movimiento anulado y aplicaciones revertidas exitosamente' };
  },

  // --------------------------------------------------------------------------
  // FLUJO DE CAJA RESUMIDO
  // --------------------------------------------------------------------------
  async obtenerFlujoCaja(empresaId: string, fechaDesde?: string, fechaHasta?: string) {
    const cuentas = await this.listarCuentas(empresaId);
    let totalIngresos = 0;
    let totalEgresos = 0;

    if (db.isPostgresConnected()) {
      let where = `WHERE empresa_id = $1 AND estado = 'REGISTRADO'`;
      const values: any[] = [empresaId];
      if (fechaDesde) {
        values.push(fechaDesde);
        where += ` AND fecha >= $${values.length}`;
      }
      if (fechaHasta) {
        values.push(fechaHasta);
        where += ` AND fecha <= $${values.length}`;
      }

      const res = await db.query(`
        SELECT tipo, SUM(importe) as total
        FROM movimientos_tesoreria
        ${where}
        GROUP BY tipo
      `, values);

      for (const row of res.rows) {
        const val = Number(row.total || 0);
        if (row.tipo === 'INGRESO') totalIngresos += val;
        else if (row.tipo === 'EGRESO' || row.tipo === 'DEPOSITO_DETRACCION' || row.tipo === 'COMISION' || row.tipo === 'ITF') {
          totalEgresos += val;
        }
      }
    } else {
      let movimientos = MOVIMIENTOS_TESORERIA_MEMORIA.filter(m => m.empresaId === empresaId && m.estado === 'REGISTRADO');

      if (fechaDesde) movimientos = movimientos.filter(m => m.fecha >= fechaDesde);
      if (fechaHasta) movimientos = movimientos.filter(m => m.fecha <= fechaHasta);

      for (const m of movimientos) {
        if (m.tipo === 'INGRESO') totalIngresos += m.importe;
        else if (m.tipo === 'EGRESO' || m.tipo === 'DEPOSITO_DETRACCION' || m.tipo === 'COMISION' || m.tipo === 'ITF') {
          totalEgresos += m.importe;
        }
      }
    }

    const saldoTotalCuentas = cuentas.reduce((acc, c) => acc + (c.activa ? c.saldoActual : 0), 0);

    return {
      fechaDesde: fechaDesde || '2026-09-01',
      fechaHasta: fechaHasta || '2026-09-30',
      totalIngresos: Number(totalIngresos.toFixed(2)),
      totalEgresos: Number(totalEgresos.toFixed(2)),
      flujoNeto: Number((totalIngresos - totalEgresos).toFixed(2)),
      saldoTotalDisponible: Number(saldoTotalCuentas.toFixed(2)),
      cuentas: cuentas.map(c => ({
        id: c.id,
        banco: c.banco,
        numero: c.numero,
        tipo: c.tipo,
        moneda: c.moneda,
        saldoActual: c.saldoActual
      }))
    };
  }
};
