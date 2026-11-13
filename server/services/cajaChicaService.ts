import { randomUUID } from 'node:crypto';
import { db } from '../config/database';
import { Money } from '../utils/decimal';
import { contabilizacionService } from './contabilizacionService';
import { asientoService } from './asientoService';
import { periodoService } from './periodoService';
import { auditoriaRepository } from '../repositories/auditoriaRepository';
import { CUENTAS_FINANCIERAS_MEMORIA } from './tesoreriaService';

export interface CajaChicaModel {
  id: string;
  empresaId: string;
  nombre: string;
  responsableAnexoId?: string;
  cuentaFinancieraId: string;
  montoFondo: number;
  saldoActual: number;
  estado: 'ABIERTA' | 'CERRADA';
}

export interface RendicionCajaChicaModel {
  id: string;
  cajaChicaId: string;
  empresaId: string;
  fecha: string;
  totalRendido: number;
  glosa: string;
  estado: 'PENDIENTE' | 'REPUERTA' | 'ANULADA';
  asientoReposicionId?: string;
}

export const CAJAS_CHICAS_MEMORIA: CajaChicaModel[] = [];
export const RENDICIONES_MEMORIA: RendicionCajaChicaModel[] = [];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const cajaChicaService = {
  async listarCajas(empresaId: string): Promise<CajaChicaModel[]> {
    if (db.isPostgresConnected()) {
      try {
        const res = await db.query(
          'SELECT * FROM cajas_chicas WHERE empresa_id = $1 ORDER BY created_at DESC',
          [empresaId]
        );
        if (res.rows.length > 0) {
          return res.rows.map(row => ({
            id: String(row.id),
            empresaId: String(row.empresa_id),
            nombre: String(row.nombre),
            responsableAnexoId: row.responsable_anexo_id ? String(row.responsable_anexo_id) : undefined,
            cuentaFinancieraId: String(row.cuenta_financiera_id),
            montoFondo: Number(row.monto_fondo),
            saldoActual: Number(row.saldo_actual),
            estado: row.estado as 'ABIERTA' | 'CERRADA'
          }));
        }
      } catch {}
    }
    return CAJAS_CHICAS_MEMORIA.filter(c => c.empresaId === empresaId);
  },

  async abrirFondo(
    empresaId: string,
    datos: {
      nombre: string;
      responsableAnexoId?: string;
      cuentaFinancieraId: string;
      montoFondo: number;
      periodoId?: string;
    },
    userId: string
  ): Promise<CajaChicaModel> {
    const ctaBanco = CUENTAS_FINANCIERAS_MEMORIA.find(c => c.id === datos.cuentaFinancieraId && c.empresaId === empresaId);
    if (!ctaBanco && !db.isPostgresConnected()) throw new Error('CUENTA_ORIGEN_NO_EXISTE');

    const idCaja = UUID_REGEX.test(empresaId) ? randomUUID() : `cc-${Date.now()}`;
    const nuevaCaja: CajaChicaModel = {
      id: idCaja,
      empresaId,
      nombre: datos.nombre,
      responsableAnexoId: datos.responsableAnexoId,
      cuentaFinancieraId: datos.cuentaFinancieraId,
      montoFondo: datos.montoFondo,
      saldoActual: datos.montoFondo,
      estado: 'ABIERTA'
    };

    CAJAS_CHICAS_MEMORIA.push(nuevaCaja);

    if (db.isPostgresConnected() && UUID_REGEX.test(empresaId) && UUID_REGEX.test(datos.cuentaFinancieraId)) {
      try {
        await db.query(`
          INSERT INTO cajas_chicas (
            id, empresa_id, nombre, responsable_anexo_id, cuenta_financiera_id, monto_fondo, saldo_actual, estado
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          idCaja, empresaId, datos.nombre,
          datos.responsableAnexoId && UUID_REGEX.test(datos.responsableAnexoId) ? datos.responsableAnexoId : null,
          datos.cuentaFinancieraId, datos.montoFondo, datos.montoFondo, 'ABIERTA'
        ]);
      } catch (err) {
        console.warn('⚠️ [cajaChicaService] Error persistiendo apertura caja chica en PostgreSQL:', err);
      }
    }

    await auditoriaRepository.registrar({
      empresaId,
      usuarioId: userId,
      accion: 'APERTURA_CAJA_CHICA',
      tabla: 'cajas_chicas',
      registroId: nuevaCaja.id,
      valoresNuevos: nuevaCaja
    });

    return nuevaCaja;
  },

  async registrarRendicion(
    empresaId: string,
    cajaChicaId: string,
    datos: {
      fecha: string;
      totalRendido: number;
      glosa: string;
    },
    userId: string
  ): Promise<RendicionCajaChicaModel> {
    const caja = CAJAS_CHICAS_MEMORIA.find(c => c.id === cajaChicaId && c.empresaId === empresaId);
    if (!caja) throw new Error('CAJA_CHICA_NO_EXISTE');

    if (datos.totalRendido > caja.saldoActual) {
      throw new Error('FONDO_INSUFICIENTE: El total rendido supera el saldo disponible en la caja chica.');
    }

    caja.saldoActual = Money.toNumber(Money.sub(caja.saldoActual, datos.totalRendido));

    const rendId = UUID_REGEX.test(empresaId) ? randomUUID() : `rend-${Date.now()}`;
    const rendicion: RendicionCajaChicaModel = {
      id: rendId,
      cajaChicaId,
      empresaId,
      fecha: datos.fecha,
      totalRendido: datos.totalRendido,
      glosa: datos.glosa,
      estado: 'PENDIENTE'
    };

    RENDICIONES_MEMORIA.push(rendicion);

    if (db.isPostgresConnected() && UUID_REGEX.test(cajaChicaId) && UUID_REGEX.test(empresaId)) {
      try {
        await db.query(`
          INSERT INTO rendiciones_caja_chica (
            id, caja_chica_id, empresa_id, fecha, total_rendido, glosa, estado, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDIENTE', $7)
        `, [
          rendId, cajaChicaId, empresaId, datos.fecha, datos.totalRendido, datos.glosa,
          UUID_REGEX.test(userId) ? userId : null
        ]);
        await db.query('UPDATE cajas_chicas SET saldo_actual = $1 WHERE id = $2', [caja.saldoActual, cajaChicaId]);
      } catch (err) {
        console.warn('⚠️ [cajaChicaService] Error persistiendo rendición en PostgreSQL:', err);
      }
    }

    return rendicion;
  },

  async reponerFondo(
    empresaId: string,
    rendicionId: string,
    periodoId: string,
    userId: string
  ) {
    const rendicion = RENDICIONES_MEMORIA.find(r => r.id === rendicionId && r.empresaId === empresaId);
    if (!rendicion) throw new Error('RENDICION_NO_EXISTE');
    if (rendicion.estado === 'REPUERTA') throw new Error('RENDICION_YA_REPUERTA');

    const caja = CAJAS_CHICAS_MEMORIA.find(c => c.id === rendicion.cajaChicaId);
    if (!caja) throw new Error('CAJA_NO_EXISTE');

    const ctaBanco = CUENTAS_FINANCIERAS_MEMORIA.find(c => c.id === caja.cuentaFinancieraId);
    if (!ctaBanco && !db.isPostgresConnected()) throw new Error('CUENTA_FINANCIERA_NO_EXISTE');

    const ctaFinCodigo = ctaBanco?.cuentaContableCodigo || '1041';

    // Asiento de reposición de caja chica
    const propuesta = await contabilizacionService.generar(empresaId, 'CAJA_CHICA_REPOSICION', {
      total: rendicion.totalRendido,
      cuentaFinancieraCodigo: ctaFinCodigo,
      glosa: `Reposición de Caja Chica - ${rendicion.glosa}`
    });

    const asiento = await asientoService.crearAsiento(empresaId, {
      periodoId,
      subdiario: '05',
      fecha: rendicion.fecha,
      moneda: 'PEN',
      tipoCambio: 1.0,
      glosa: `Reposición de fondo fijo ${caja.nombre}`,
      origenModulo: 'TESORERIA',
      lineas: propuesta.lineas.map(l => ({
        codigoCuenta: l.codigoCuenta,
        debe: l.debe,
        haber: l.haber,
        glosa: l.glosaLinea
      }))
    }, userId);

    caja.saldoActual = Money.toNumber(Money.add(caja.saldoActual, rendicion.totalRendido));
    if (ctaBanco) {
      ctaBanco.saldoActual = Money.toNumber(Money.sub(ctaBanco.saldoActual, rendicion.totalRendido));
    }

    rendicion.estado = 'REPUERTA';
    rendicion.asientoReposicionId = asiento.id;

    if (db.isPostgresConnected() && UUID_REGEX.test(rendicionId)) {
      try {
        await db.query(`
          UPDATE rendiciones_caja_chica
          SET estado = 'REPUERTA', asiento_reposicion_id = $1
          WHERE id = $2
        `, [asiento.id && UUID_REGEX.test(asiento.id) ? asiento.id : null, rendicionId]);
        if (UUID_REGEX.test(caja.id)) {
          await db.query('UPDATE cajas_chicas SET saldo_actual = $1 WHERE id = $2', [caja.saldoActual, caja.id]);
        }
      } catch (err) {
        console.warn('⚠️ [cajaChicaService] Error actualizando reposición en PostgreSQL:', err);
      }
    }

    return {
      success: true,
      message: 'Fondo de caja chica repuesto exitosamente',
      asientoId: asiento.id
    };
  }
};
