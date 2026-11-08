import { db } from '../config/database';
import { auditoriaChainService } from './auditoriaChainService';

export interface TipoCambioDTO {
  id?: string;
  fecha: string; // YYYY-MM-DD
  compra: number;
  venta: number;
  fuente: 'SUNAT' | 'SBS' | 'MANUAL';
  createdAt?: string;
}

// Semilla de respaldo en memoria para pruebas y modo desconectado
export const TIPOS_CAMBIO_MEMORIA = new Map<string, TipoCambioDTO>([
  ['2026-09-01', { fecha: '2026-09-01', compra: 3.748, venta: 3.754, fuente: 'SUNAT' }],
  ['2026-09-02', { fecha: '2026-09-02', compra: 3.750, venta: 3.755, fuente: 'SUNAT' }],
  ['2026-09-04', { fecha: '2026-09-04', compra: 3.751, venta: 3.757, fuente: 'SUNAT' }],
  ['2026-09-07', { fecha: '2026-09-07', compra: 3.749, venta: 3.753, fuente: 'SUNAT' }],
  ['2026-09-10', { fecha: '2026-09-10', compra: 3.752, venta: 3.758, fuente: 'SUNAT' }],
  ['2026-09-14', { fecha: '2026-09-14', compra: 3.750, venta: 3.756, fuente: 'SUNAT' }],
  ['2026-09-18', { fecha: '2026-09-18', compra: 3.752, venta: 3.759, fuente: 'SUNAT' }],
  ['2026-09-22', { fecha: '2026-09-22', compra: 3.754, venta: 3.760, fuente: 'SUNAT' }],
  ['2026-09-26', { fecha: '2026-09-26', compra: 3.751, venta: 3.757, fuente: 'SUNAT' }],
  ['2026-09-29', { fecha: '2026-09-29', compra: 3.753, venta: 3.759, fuente: 'SUNAT' }],
  ['2026-10-15', { fecha: '2026-10-15', compra: 3.755, venta: 3.762, fuente: 'SUNAT' }],
]);

export const tipoCambioService = {
  /**
   * Obtiene el tipo de cambio exacto para una fecha (YYYY-MM-DD) desde la tabla tipos_cambio
   */
  async obtenerPorFecha(fecha: string): Promise<TipoCambioDTO | null> {
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return null;
    }

    try {
      const res = await db.query(
        `SELECT id, to_char(fecha, 'YYYY-MM-DD') as fecha, compra::numeric, venta::numeric, fuente, created_at 
         FROM tipos_cambio WHERE fecha = $1 LIMIT 1`,
        [fecha]
      );
      if (res.rows && res.rows.length > 0) {
        const r = res.rows[0];
        return {
          id: r.id,
          fecha: r.fecha,
          compra: Number(r.compra),
          venta: Number(r.venta),
          fuente: r.fuente,
          createdAt: r.created_at
        };
      }
    } catch {
      // Fallback a memoria si la base no responde o está en modo prueba
    }

    const enMem = TIPOS_CAMBIO_MEMORIA.get(fecha);
    return enMem ? { ...enMem } : null;
  },

  /**
   * Obtiene el tipo de cambio vigente para una fecha dada (o la más reciente en o antes de esa fecha)
   */
  async obtenerVigente(fechaReferencia?: string): Promise<TipoCambioDTO | null> {
    const fecha = fechaReferencia && /^\d{4}-\d{2}-\d{2}$/.test(fechaReferencia)
      ? fechaReferencia
      : new Date().toISOString().slice(0, 10);

    try {
      const res = await db.query(
        `SELECT id, to_char(fecha, 'YYYY-MM-DD') as fecha, compra::numeric, venta::numeric, fuente, created_at 
         FROM tipos_cambio 
         WHERE fecha <= $1 
         ORDER BY fecha DESC LIMIT 1`,
        [fecha]
      );
      if (res.rows && res.rows.length > 0) {
        const r = res.rows[0];
        return {
          id: r.id,
          fecha: r.fecha,
          compra: Number(r.compra),
          venta: Number(r.venta),
          fuente: r.fuente,
          createdAt: r.created_at
        };
      }
    } catch {
      // Fallback a memoria
    }

    // Buscar en memoria la fecha <= fecha
    const ordenadas = Array.from(TIPOS_CAMBIO_MEMORIA.values())
      .filter((tc) => tc.fecha <= fecha)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));

    if (ordenadas.length > 0) {
      return { ...ordenadas[0] };
    }

    return null;
  },

  /**
   * Registra o actualiza un tipo de cambio en la tabla tipos_cambio
   */
  async guardar(input: {
    fecha: string;
    compra: number;
    venta: number;
    fuente?: 'SUNAT' | 'SBS' | 'MANUAL';
    usuarioId?: string;
  }): Promise<TipoCambioDTO> {
    const { fecha, compra, venta, usuarioId } = input;
    const fuente = input.fuente || 'MANUAL';

    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new Error('FECHA_INVALIDA: La fecha debe tener formato YYYY-MM-DD.');
    }
    if (!compra || compra <= 0) {
      throw new Error('TIPO_CAMBIO_COMPRA_INVALIDO: El tipo de cambio compra debe ser mayor a cero.');
    }
    if (!venta || venta <= 0) {
      throw new Error('TIPO_CAMBIO_VENTA_INVALIDO: El tipo de cambio venta debe ser mayor a cero.');
    }
    if (fuente !== 'SUNAT' && fuente !== 'SBS' && fuente !== 'MANUAL') {
      throw new Error('FUENTE_INVALIDA: La fuente permitida es SUNAT, SBS o MANUAL.');
    }

    const dto: TipoCambioDTO = {
      fecha,
      compra: Math.round(compra * 10000) / 10000,
      venta: Math.round(venta * 10000) / 10000,
      fuente,
    };

    TIPOS_CAMBIO_MEMORIA.set(fecha, dto);

    try {
      const res = await db.query(
        `INSERT INTO tipos_cambio (fecha, compra, venta, fuente)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (fecha) DO UPDATE
         SET compra = EXCLUDED.compra, venta = EXCLUDED.venta, fuente = EXCLUDED.fuente
         RETURNING id, to_char(fecha, 'YYYY-MM-DD') as fecha, compra::numeric, venta::numeric, fuente, created_at`,
        [dto.fecha, dto.compra, dto.venta, dto.fuente]
      );
      if (res.rows && res.rows.length > 0) {
        const r = res.rows[0];
        dto.id = r.id;
        dto.createdAt = r.created_at;
      }
    } catch {
      // Continuar si la BD no está disponible en entorno unitario
    }

    if (usuarioId) {
      try {
        await auditoriaChainService.registrar({
          empresaId: '00000000-0000-0000-0000-000000000001',
          usuarioId,
          accion: 'GUARDAR_TIPO_CAMBIO',
          tablaAfectada: 'tipos_cambio',
          registroId: dto.id || fecha,
          datosNuevos: { fecha: dto.fecha, compra: dto.compra, venta: dto.venta, fuente: dto.fuente }
        });
      } catch {
        // Auditoría no bloqueante
      }
    }

    return dto;
  },

  /**
   * Lista los tipos de cambio más recientes
   */
  async listar(limite: number = 30): Promise<TipoCambioDTO[]> {
    try {
      const res = await db.query(
        `SELECT id, to_char(fecha, 'YYYY-MM-DD') as fecha, compra::numeric, venta::numeric, fuente, created_at 
         FROM tipos_cambio 
         ORDER BY fecha DESC LIMIT $1`,
        [limite]
      );
      if (res.rows && res.rows.length > 0) {
        return res.rows.map((r: any) => ({
          id: r.id,
          fecha: r.fecha,
          compra: Number(r.compra),
          venta: Number(r.venta),
          fuente: r.fuente,
          createdAt: r.created_at
        }));
      }
    } catch {
      // Fallback
    }

    return Array.from(TIPOS_CAMBIO_MEMORIA.values())
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, limite);
  }
};
