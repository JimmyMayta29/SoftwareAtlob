import { randomUUID } from 'node:crypto';
import { db } from '../config/database';
import { Money } from '../utils/decimal';
import { auditoriaRepository } from '../repositories/auditoriaRepository';
import { tesoreriaService, MOVIMIENTOS_TESORERIA_MEMORIA, CUENTAS_FINANCIERAS_MEMORIA } from './tesoreriaService';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ExtractoLineaModel {
  id: string;
  extractoId: string;
  empresaId: string;
  fecha: string;
  descripcion: string;
  referencia?: string;
  monto: number; // Positivo = Abono, Negativo = Cargo
  saldo?: number;
  conciliada: boolean;
  movimientoTesoreriaId?: string;
}

export interface ExtractoBancarioModel {
  id: string;
  empresaId: string;
  cuentaFinancieraId: string;
  nombreArchivo: string;
  fechaCorteDesde: string;
  fechaCorteHasta: string;
  saldoInicial: number;
  saldoFinal: number;
  hashArchivo: string;
  estado: 'CARGADO' | 'CONCILIADO' | 'ANULADO';
  lineas: ExtractoLineaModel[];
}

export interface ConciliacionPeriodoModel {
  id: string;
  empresaId: string;
  cuentaFinancieraId: string;
  periodoId: string;
  fechaCorte: string;
  saldoSegunLibros: number;
  saldoSegunBanco: number;
  partidasConciliadas: number;
  partidasEnTransito: number;
  diferencia: number;
  estado: 'ABIERTA' | 'CERRADA';
  cerradaPor?: string;
  fechaCierre?: string;
}

export const EXTRACTOS_MEMORIA: ExtractoBancarioModel[] = [];
export const CONCILIACIONES_MEMORIA: ConciliacionPeriodoModel[] = [];

export const conciliacionService = {
  // --------------------------------------------------------------------------
  // IMPORTACIÓN DE EXTRACTO BANCARIO (CSV / HOJA DE CÁLCULO)
  // --------------------------------------------------------------------------
  async importarExtracto(
    empresaId: string,
    cuentaFinancieraId: string,
    archivo: {
      nombreArchivo: string;
      lineas: Array<{
        fecha: string;
        descripcion: string;
        referencia?: string;
        monto: number;
        saldo?: number;
      }>;
      saldoInicial?: number;
      saldoFinal?: number;
    },
    userId: string
  ): Promise<ExtractoBancarioModel> {
    if (!archivo.lineas || archivo.lineas.length === 0) {
      throw new Error('ARCHIVO_VACIO: El archivo de extracto bancario no contiene filas válidas.');
    }

    // 1. Validar fila por fila
    archivo.lineas.forEach((fila, idx) => {
      if (!fila.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fila.fecha)) {
        throw new Error(`FORMATO_FECHA_INVALIDO: Fila ${idx + 1} tiene fecha inválida (${fila.fecha}). Se requiere YYYY-MM-DD.`);
      }
      if (typeof fila.monto !== 'number' || isNaN(fila.monto)) {
        throw new Error(`MONTO_INVALIDO: Fila ${idx + 1} tiene un importe inválido.`);
      }
    });

    // 2. Control estricto de Duplicados (Hash de contenido)
    const contenidoString = archivo.lineas.map(l => `${l.fecha}_${l.monto}_${l.referencia || ''}`).join('|');
    let hash = 0;
    for (let i = 0; i < contenidoString.length; i++) {
      hash = (hash << 5) - hash + contenidoString.charCodeAt(i);
      hash |= 0;
    }
    const hashArchivo = `hash-${Math.abs(hash)}`;

    if (db.isPostgresConnected()) {
      const dupRes = await db.query(
        'SELECT id FROM extractos_bancarios WHERE empresa_id = $1 AND cuenta_financiera_id = $2 AND hash_archivo = $3',
        [empresaId, cuentaFinancieraId, hashArchivo]
      );
      if (dupRes.rows.length > 0) {
        throw new Error('EXTRACTO_DUPLICADO: Este extracto bancario ya fue importado previamente para esta cuenta.');
      }
    } else {
      const duplicado = EXTRACTOS_MEMORIA.find(
        e => e.empresaId === empresaId && e.cuentaFinancieraId === cuentaFinancieraId && e.hashArchivo === hashArchivo
      );
      if (duplicado) {
        throw new Error('EXTRACTO_DUPLICADO: Este extracto bancario ya fue importado previamente para esta cuenta.');
      }
    }

    const extractoId = UUID_REGEX.test(empresaId) ? randomUUID() : `ext-${Date.now()}`;
    const fechas = archivo.lineas.map(l => l.fecha).sort();
    const fechaDesde = fechas[0];
    const fechaHasta = fechas[fechas.length - 1];

    const lineasProcesadas: ExtractoLineaModel[] = archivo.lineas.map((l, index) => ({
      id: UUID_REGEX.test(empresaId) ? randomUUID() : `extline-${Date.now()}-${index}`,
      extractoId,
      empresaId,
      fecha: l.fecha,
      descripcion: l.descripcion,
      referencia: l.referencia,
      monto: l.monto,
      saldo: l.saldo,
      conciliada: false
    }));

    const nuevoExtracto: ExtractoBancarioModel = {
      id: extractoId,
      empresaId,
      cuentaFinancieraId,
      nombreArchivo: archivo.nombreArchivo,
      fechaCorteDesde: fechaDesde,
      fechaCorteHasta: fechaHasta,
      saldoInicial: archivo.saldoInicial || 0,
      saldoFinal: archivo.saldoFinal || (lineasProcesadas[lineasProcesadas.length - 1]?.saldo || 0),
      hashArchivo,
      estado: 'CARGADO',
      lineas: lineasProcesadas
    };

    EXTRACTOS_MEMORIA.push(nuevoExtracto);

    if (db.isPostgresConnected() && UUID_REGEX.test(empresaId) && UUID_REGEX.test(cuentaFinancieraId)) {
      try {
        await db.query(`
          INSERT INTO extractos_bancarios (
            id, empresa_id, cuenta_financiera_id, nombre_archivo, fecha_corte_desde, fecha_corte_hasta,
            saldo_inicial, saldo_final, hash_archivo, estado
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'CARGADO')
          ON CONFLICT (empresa_id, cuenta_financiera_id, hash_archivo) DO UPDATE SET estado = 'CARGADO'
        `, [
          extractoId, empresaId, cuentaFinancieraId, archivo.nombreArchivo, fechaDesde, fechaHasta,
          nuevoExtracto.saldoInicial, nuevoExtracto.saldoFinal, hashArchivo
        ]);

        for (const l of lineasProcesadas) {
          await db.query(`
            INSERT INTO extracto_lineas (
              id, extracto_id, empresa_id, fecha, descripcion, referencia, monto, saldo, conciliada
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
          `, [
            l.id, extractoId, empresaId, l.fecha, l.descripcion, l.referencia || null, l.monto, l.saldo || null
          ]);
        }
      } catch (err) {
        console.warn('⚠️ [conciliacionService] Error persistiendo extracto en PostgreSQL:', err);
      }
    }

    await auditoriaRepository.registrar({
      empresaId,
      usuarioId: userId,
      accion: 'IMPORTAR_EXTRACTO_BANCARIO',
      tabla: 'extractos_bancarios',
      registroId: extractoId,
      valoresNuevos: { nombreArchivo: archivo.nombreArchivo, totalLineas: lineasProcesadas.length }
    });

    return nuevoExtracto;
  },

  // --------------------------------------------------------------------------
  // CÁLCULO DE CONCILIACIÓN Y COINCIDENCIAS AUTOMÁTICAS
  // --------------------------------------------------------------------------
  async obtenerEstadoConciliacion(
    empresaId: string,
    cuentaFinancieraId: string,
    periodoId: string,
    fechaCorte: string
  ) {
    const cuenta = await tesoreriaService.obtenerCuentaPorId(empresaId, cuentaFinancieraId);
    if (!cuenta) {
      throw new Error('CUENTA_NO_ENCONTRADA: Cuenta financiera no válida.');
    }

    let movimientosLibros: any[] = [];
    let lineasExtracto: ExtractoLineaModel[] = [];
    let saldoBanco = cuenta.saldoInicial;

    if (db.isPostgresConnected()) {
      const movRes = await db.query(`
        SELECT id, empresa_id as "empresaId", periodo_id as "periodoId",
               cuenta_financiera_id as "cuentaFinancieraId", fecha::text, tipo,
               medio_pago as "medioPago", numero_operacion as "numeroOperacion",
               anexo_id as "anexoId", moneda, tipo_cambio::numeric as "tipoCambio",
               importe::numeric as "importe", importe_me::numeric as "importeMe",
               saldo_sin_aplicar::numeric as "saldoSinAplicar",
               glosa, estado, conciliado, asiento_id as "asientoId"
        FROM movimientos_tesoreria
        WHERE empresa_id = $1 AND cuenta_financiera_id::text = $2 AND estado = 'REGISTRADO' AND fecha <= $3
        ORDER BY fecha ASC
      `, [empresaId, cuentaFinancieraId, fechaCorte]);

      movimientosLibros = movRes.rows.map(r => ({
        ...r,
        importe: Number(r.importe || 0),
        tipoCambio: Number(r.tipoCambio || 1)
      }));

      const linRes = await db.query(`
        SELECT id, extracto_id as "extractoId", empresa_id as "empresaId",
               fecha::text, descripcion, referencia, monto::numeric as "monto",
               saldo::numeric as "saldo", conciliada,
               movimiento_tesoreria_id as "movimientoTesoreriaId"
        FROM extracto_lineas
        WHERE empresa_id = $1 AND extracto_id IN (
          SELECT id FROM extractos_bancarios WHERE empresa_id = $1 AND cuenta_financiera_id::text = $2
        ) AND fecha <= $3
        ORDER BY fecha ASC
      `, [empresaId, cuentaFinancieraId, fechaCorte]);

      lineasExtracto = linRes.rows.map(r => ({
        ...r,
        monto: Number(r.monto || 0),
        saldo: r.saldo !== null ? Number(r.saldo) : undefined
      }));

      const extRes = await db.query(`
        SELECT saldo_final::numeric as "saldoFinal"
        FROM extractos_bancarios
        WHERE empresa_id = $1 AND cuenta_financiera_id::text = $2
        ORDER BY fecha_corte_hasta DESC
        LIMIT 1
      `, [empresaId, cuentaFinancieraId]);

      if (extRes.rows[0]) {
        saldoBanco = Number(extRes.rows[0].saldoFinal || 0);
      } else {
        saldoBanco = cuenta.saldoInicial + lineasExtracto.reduce((acc, l) => acc + l.monto, 0);
      }
    } else {
      movimientosLibros = MOVIMIENTOS_TESORERIA_MEMORIA.filter(m => 
        m.empresaId === empresaId &&
        m.cuentaFinancieraId === cuentaFinancieraId &&
        m.estado === 'REGISTRADO' &&
        m.fecha <= fechaCorte
      );

      const extractos = EXTRACTOS_MEMORIA.filter(e => 
        e.empresaId === empresaId && e.cuentaFinancieraId === cuentaFinancieraId
      );
      lineasExtracto = extractos.flatMap(e => e.lineas).filter(l => l.fecha <= fechaCorte);
      const ultimoExtracto = extractos[extractos.length - 1];
      saldoBanco = ultimoExtracto?.saldoFinal ?? (cuenta.saldoInicial + lineasExtracto.reduce((acc, l) => acc + l.monto, 0));
    }

    // 3. Sugerencia de Coincidencias Automáticas
    // Coincidencia: Mismo importe exacto (tomando signo), fecha cercana (+- 3 días) y/o coincidencia de referencia
    const coincidenciasSugeridas: Array<{
      lineaExtractoId: string;
      movimientoId: string;
      score: number;
      motivo: string;
    }> = [];

    for (const le of lineasExtracto) {
      if (le.conciliada) continue;

      for (const ml of movimientosLibros) {
        if (ml.conciliado) continue;

        // Comprobar monto: Ingreso en libros (+) = Monto positivo en extracto; Egreso en libros (-) = Monto negativo en extracto
        const montoEsperado = ml.tipo === 'INGRESO' ? ml.importe : -ml.importe;
        const montoCoincide = Math.abs(le.monto - montoEsperado) < 0.01;

        if (montoCoincide) {
          const diffDias = Math.abs(
            (new Date(le.fecha).getTime() - new Date(ml.fecha).getTime()) / (1000 * 60 * 60 * 24)
          );

          if (diffDias <= 3) {
            let score = 80;
            let motivo = `Monto exacto (S/ ${Math.abs(le.monto).toFixed(2)}) y fecha cercana (${diffDias} días de diferencia)`;

            if (ml.numeroOperacion && le.referencia && le.referencia.includes(ml.numeroOperacion)) {
              score = 100;
              motivo += ` con número de operación coincidente (${ml.numeroOperacion})`;
            }

            coincidenciasSugeridas.push({
              lineaExtractoId: le.id,
              movimientoId: ml.id,
              score,
              motivo
            });
            break;
          }
        }
      }
    }

    // 4. Totales de Conciliación
    // Saldo según libros
    let saldoLibros = cuenta.saldoInicial;
    for (const m of movimientosLibros) {
      if (m.tipo === 'INGRESO') saldoLibros += m.importe;
      else saldoLibros -= m.importe;
    }

    // Partidas conciliadas
    const lineasConciliadas = lineasExtracto.filter(l => l.conciliada);
    const partidasConciliadas = lineasConciliadas.reduce((acc, l) => acc + l.monto, 0);

    // Partidas en tránsito (movimientos en libros pendientes de conciliar)
    const movimientosEnTransito = movimientosLibros.filter(m => !m.conciliado);
    let totalEnTransitoLibros = 0;
    for (const m of movimientosEnTransito) {
      totalEnTransitoLibros += (m.tipo === 'INGRESO' ? m.importe : -m.importe);
    }

    // Diferencia final de cuadre
    const diferencia = Number((saldoLibros - saldoBanco - totalEnTransitoLibros).toFixed(2));

    return {
      cuenta: {
        id: cuenta.id,
        banco: cuenta.banco,
        numero: cuenta.numero,
        moneda: cuenta.moneda
      },
      fechaCorte,
      resumen: {
        saldoSegunLibros: Number(saldoLibros.toFixed(2)),
        saldoSegunBanco: Number(saldoBanco.toFixed(2)),
        partidasConciliadas: Number(partidasConciliadas.toFixed(2)),
        partidasEnTransito: Number(totalEnTransitoLibros.toFixed(2)),
        diferencia: Math.abs(diferencia) < 0.01 ? 0.00 : diferencia,
        cuadrado: Math.abs(diferencia) < 0.01
      },
      coincidenciasSugeridas,
      extractoLineas: lineasExtracto,
      movimientosLibros
    };
  },

  // --------------------------------------------------------------------------
  // CONCILIACIÓN MANUAL / AUTOMÁTICA
  // --------------------------------------------------------------------------
  async conciliar(empresaId: string, extractoLineaId: string, movimientoId: string, userId: string) {
    const extracto = EXTRACTOS_MEMORIA.find(e => e.empresaId === empresaId && e.lineas.some(l => l.id === extractoLineaId));
    if (extracto) {
      const linea = extracto.lineas.find(l => l.id === extractoLineaId)!;
      linea.conciliada = true;
      linea.movimientoTesoreriaId = movimientoId;
    }

    const movimiento = MOVIMIENTOS_TESORERIA_MEMORIA.find(m => m.id === movimientoId && m.empresaId === empresaId);
    if (movimiento) {
      movimiento.conciliado = true;
    }

    if (db.isPostgresConnected()) {
      try {
        await db.query(
          'UPDATE extracto_lineas SET conciliada = true, movimiento_tesoreria_id = $1 WHERE id::text = $2 AND empresa_id = $3',
          [UUID_REGEX.test(movimientoId) ? movimientoId : null, extractoLineaId, empresaId]
        );
        if (UUID_REGEX.test(movimientoId)) {
          await db.query('UPDATE movimientos_tesoreria SET conciliado = true WHERE id::text = $1 AND empresa_id = $2', [movimientoId, empresaId]);
        }
      } catch (err) {
        console.warn('⚠️ [conciliacionService] Error actualizando conciliación en PostgreSQL:', err);
      }
    }

    return { success: true, message: 'Partida conciliada exitosamente' };
  },

  async desconciliar(empresaId: string, extractoLineaId: string, userId: string) {
    let movId: string | undefined;
    const extracto = EXTRACTOS_MEMORIA.find(e => e.empresaId === empresaId && e.lineas.some(l => l.id === extractoLineaId));
    if (extracto) {
      const linea = extracto.lineas.find(l => l.id === extractoLineaId)!;
      movId = linea.movimientoTesoreriaId;
      linea.conciliada = false;
      linea.movimientoTesoreriaId = undefined;
      if (movId) {
        const movimiento = MOVIMIENTOS_TESORERIA_MEMORIA.find(m => m.id === movId);
        if (movimiento) movimiento.conciliado = false;
      }
    }

    if (db.isPostgresConnected()) {
      try {
        const linRes = await db.query(
          'SELECT movimiento_tesoreria_id FROM extracto_lineas WHERE id::text = $1 AND empresa_id = $2',
          [extractoLineaId, empresaId]
        );
        const pgMovId = linRes.rows[0]?.movimiento_tesoreria_id || movId;

        await db.query(
          'UPDATE extracto_lineas SET conciliada = false, movimiento_tesoreria_id = null WHERE id::text = $1 AND empresa_id = $2',
          [extractoLineaId, empresaId]
        );
        if (pgMovId) {
          await db.query('UPDATE movimientos_tesoreria SET conciliado = false WHERE id::text = $1 AND empresa_id = $2', [pgMovId, empresaId]);
        }
      } catch (err) {
        console.warn('⚠️ [conciliacionService] Error desconciliando en PostgreSQL:', err);
      }
    }

    return { success: true, message: 'Partida desconciliada' };
  },

  // --------------------------------------------------------------------------
  // CERRAR CONCILIACIÓN DE PERÍODO
  // --------------------------------------------------------------------------
  async cerrarConciliacion(empresaId: string, cuentaFinancieraId: string, periodoId: string, fechaCorte: string, userId: string) {
    const estado = await this.obtenerEstadoConciliacion(empresaId, cuentaFinancieraId, periodoId, fechaCorte);

    const cncId = UUID_REGEX.test(empresaId) ? randomUUID() : `cnc-${Date.now()}`;
    const conciliacion: ConciliacionPeriodoModel = {
      id: cncId,
      empresaId,
      cuentaFinancieraId,
      periodoId,
      fechaCorte,
      saldoSegunLibros: estado.resumen.saldoSegunLibros,
      saldoSegunBanco: estado.resumen.saldoSegunBanco,
      partidasConciliadas: estado.resumen.partidasConciliadas,
      partidasEnTransito: estado.resumen.partidasEnTransito,
      diferencia: estado.resumen.diferencia,
      estado: 'CERRADA',
      cerradaPor: userId,
      fechaCierre: new Date().toISOString()
    };

    CONCILIACIONES_MEMORIA.push(conciliacion);

    if (db.isPostgresConnected() && UUID_REGEX.test(empresaId) && UUID_REGEX.test(cuentaFinancieraId)) {
      try {
        let pId = periodoId;
        if (!UUID_REGEX.test(pId)) {
          const mes = fechaCorte.substring(0, 7);
          const pRes = await db.query('SELECT id FROM periodos WHERE empresa_id = $1 AND anio = $2 AND mes = $3 LIMIT 1', [empresaId, Number(mes.split('-')[0]), Number(mes.split('-')[1])]);
          if (pRes.rows.length > 0) pId = pRes.rows[0].id;
        }

        if (UUID_REGEX.test(pId)) {
          await db.query(`
            INSERT INTO conciliaciones_bancarias (
              id, empresa_id, cuenta_financiera_id, periodo_id, fecha_corte,
              saldo_segun_libros, saldo_segun_banco, partidas_conciliadas, partidas_en_transito,
              diferencia, estado, cerrada_por, fecha_cierre
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'CERRADA', $11, CURRENT_TIMESTAMP)
            ON CONFLICT (empresa_id, cuenta_financiera_id, periodo_id) DO UPDATE SET
              saldo_segun_libros = EXCLUDED.saldo_segun_libros,
              saldo_segun_banco = EXCLUDED.saldo_segun_banco,
              partidas_conciliadas = EXCLUDED.partidas_conciliadas,
              partidas_en_transito = EXCLUDED.partidas_en_transito,
              diferencia = EXCLUDED.diferencia,
              estado = 'CERRADA',
              fecha_cierre = CURRENT_TIMESTAMP
          `, [
            cncId, empresaId, cuentaFinancieraId, pId, fechaCorte,
            estado.resumen.saldoSegunLibros, estado.resumen.saldoSegunBanco, estado.resumen.partidasConciliadas,
            estado.resumen.partidasEnTransito, estado.resumen.diferencia,
            UUID_REGEX.test(userId) ? userId : null
          ]);
        }
      } catch (err) {
        console.warn('⚠️ [conciliacionService] Error guardando conciliacion en PostgreSQL:', err);
      }
    }

    await auditoriaRepository.registrar({
      empresaId,
      usuarioId: userId,
      accion: 'CERRAR_CONCILIACION_BANCARIA',
      tabla: 'conciliaciones_bancarias',
      registroId: conciliacion.id,
      valoresNuevos: conciliacion
    });

    return conciliacion;
  }
};
