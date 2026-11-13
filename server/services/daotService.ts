import { randomUUID } from 'node:crypto';
import { db } from '../config/database';
import { Money } from '../utils/decimal';
import { COMPRAS_MEMORIA } from './compraService';
import { VENTAS_MEMORIA } from './ventaService';
import { parametroRepository } from '../repositories/parametroRepository';
import { empresaRepository } from '../repositories/empresaRepository';
import { auditoriaChainService } from './auditoriaChainService';

export interface ExclusionDaotItem {
  id: string;
  empresaId: string;
  anio: number;
  tipoOperacion: 'COMPRA' | 'VENTA' | 'AMBOS';
  rucTercero: string;
  razonSocialTercero?: string;
  comprobanteId?: string | null;
  motivoExclusion: string;
  usuarioId: string;
  createdAt: string;
}

export interface RegistroTerceroDaot {
  tipoDocIdentidad: '6' | '1' | '4' | '7'; // 6=RUC, 1=DNI, 4=Carnet Extranjería, 7=Pasaporte
  numeroDocIdentidad: string;
  razonSocialONombres: string;
  // Bases imponibles netas sin IGV (R.S. N° 024-2002/SUNAT Art. 4°)
  baseCompras: number;
  baseVentas: number;
  baseOperaciones: number;
  // Importes totales informativos (compatibilidad e inspección)
  totalCompras: number;
  totalVentas: number;
  totalOperaciones: number;
  cantidadComprobantes: number;
  superaUmbral2Uit: boolean;
  umbral2UitAplicable: number;
  condicion: 'DECLARABLE' | 'EXCEPTUADO' | 'EXCLUIDO_DEPURACION';
  excluidoManualmente?: boolean;
  motivoExclusion?: string;
  exclusionId?: string;
}

export interface ResumenDaotEjecucion {
  empresaId: string;
  anio: number;
  uitAnual: number;
  cantidadUitUmbral: number;
  umbral2Uit: number;
  totalTercerosEvaluados: number;
  totalTercerosDeclarables: number;
  totalTercerosExcluidos: number;
  montoTotalDeclarable: number;
  baseTotalDeclarable: number;
  totalComprasDeclarables: number;
  totalVentasDeclarables: number;
  baseComprasDeclarables: number;
  baseVentasDeclarables: number;
  registros: RegistroTerceroDaot[];
  exclusionesActivas: ExclusionDaotItem[];
  txtGenerado: string;
  txtCostos: string;
  txtIngresos: string;
  nombreArchivoTxt: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DAOT_EXCLUSIONES_MEMORIA: ExclusionDaotItem[] = [];

export const daotService = {
  /**
   * Obtiene la UIT según el año del ejercicio desde parametros_tributarios
   */
  async obtenerUitPorAnio(anio: number): Promise<number> {
    return parametroRepository.obtenerUitPorAnio(anio);
  },

  /**
   * Registra una exclusión / depuración de un tercero u operación para el DAOT con motivo obligatorio
   */
  registrarExclusion(
    empresaId: string,
    input: {
      anio: number;
      tipoOperacion: 'COMPRA' | 'VENTA' | 'AMBOS';
      rucTercero: string;
      razonSocialTercero?: string;
      comprobanteId?: string | null;
      motivoExclusion: string;
    },
    usuarioId: string = 'usr-contador-01'
  ): ExclusionDaotItem {
    if (!input.motivoExclusion || input.motivoExclusion.trim().length < 4) {
      throw new Error('MOTIVO_EXCLUSION_REQUERIDO: Debe indicar el motivo normativo u operativo de exclusión del DAOT.');
    }

    const rucLimpio = input.rucTercero.trim();
    const existenteIdx = DAOT_EXCLUSIONES_MEMORIA.findIndex(
      e =>
        e.empresaId === empresaId &&
        e.anio === input.anio &&
        e.rucTercero === rucLimpio &&
        (e.comprobanteId || null) === (input.comprobanteId || null)
    );

    const itemId = existenteIdx >= 0
      ? DAOT_EXCLUSIONES_MEMORIA[existenteIdx].id
      : (UUID_REGEX.test(empresaId) ? randomUUID() : `daot-excl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

    const item: ExclusionDaotItem = {
      id: itemId,
      empresaId,
      anio: input.anio,
      tipoOperacion: input.tipoOperacion || 'AMBOS',
      rucTercero: rucLimpio,
      razonSocialTercero: input.razonSocialTercero,
      comprobanteId: input.comprobanteId || null,
      motivoExclusion: input.motivoExclusion.trim(),
      usuarioId,
      createdAt: new Date().toISOString()
    };

    if (existenteIdx >= 0) {
      DAOT_EXCLUSIONES_MEMORIA[existenteIdx] = item;
    } else {
      DAOT_EXCLUSIONES_MEMORIA.push(item);
    }

    if (db.isPostgresConnected() && UUID_REGEX.test(empresaId)) {
      void (async () => {
        try {
          const tipos = input.tipoOperacion === 'AMBOS' ? ['COMPRA', 'VENTA'] : [input.tipoOperacion || 'COMPRA'];
          for (const tipo of tipos) {
            await db.query(`
              INSERT INTO daot_exclusiones (
                id, empresa_id, anio, tipo_operacion, ruc_tercero, comprobante_id, motivo_exclusion, usuario_id
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
              UUID_REGEX.test(item.id) ? item.id : randomUUID(),
              empresaId, input.anio, tipo, rucLimpio, input.comprobanteId || null,
              item.motivoExclusion, UUID_REGEX.test(usuarioId) ? usuarioId : null
            ]);
          }
        } catch (err) {
          console.warn('⚠️ [daotService] Error persistiendo exclusión en PostgreSQL:', err);
        }
      })();
    }

    void auditoriaChainService.registrar({
      empresaId,
      usuarioId,
      accion: 'EXCLUIR_TERCERO_DAOT',
      tablaAfectada: 'daot_exclusiones',
      registroId: item.id,
      datosNuevos: {
        anio: item.anio,
        rucTercero: item.rucTercero,
        tipoOperacion: item.tipoOperacion,
        motivoExclusion: item.motivoExclusion
      }
    });

    return item;
  },

  /**
   * Restaura un tercero previamente excluido de la depuración DAOT
   */
  eliminarExclusion(empresaId: string, exclusionId: string, usuarioId: string = 'usr-contador-01'): boolean {
    const idx = DAOT_EXCLUSIONES_MEMORIA.findIndex(e => e.empresaId === empresaId && e.id === exclusionId);
    if (idx === -1) return false;
    const eliminado = DAOT_EXCLUSIONES_MEMORIA[idx];
    DAOT_EXCLUSIONES_MEMORIA.splice(idx, 1);

    if (db.isPostgresConnected() && UUID_REGEX.test(exclusionId)) {
      void (async () => {
        try {
          await db.query('DELETE FROM daot_exclusiones WHERE id = $1 AND empresa_id = $2', [exclusionId, empresaId]);
        } catch {}
      })();
    }

    void auditoriaChainService.registrar({
      empresaId,
      usuarioId,
      accion: 'RESTAURAR_TERCERO_DAOT',
      tablaAfectada: 'daot_exclusiones',
      registroId: exclusionId,
      datosAnteriores: { rucTercero: eliminado.rucTercero, motivoExclusion: eliminado.motivoExclusion }
    });

    return true;
  },

  listarExclusiones(empresaId: string, anio: number): ExclusionDaotItem[] {
    return DAOT_EXCLUSIONES_MEMORIA.filter(e => e.empresaId === empresaId && e.anio === anio);
  },

  /**
   * Procesa las operaciones anuales con terceros y genera el consolidado DAOT (Formulario Virtual 3500).
   */
  async procesarDaot(empresaId: string, anio: number = 2026): Promise<ResumenDaotEjecucion> {
    const compras = COMPRAS_MEMORIA.filter(c => c.empresaId === empresaId);
    const ventas = VENTAS_MEMORIA.filter(v => v.empresaId === empresaId);
    const empresa = await empresaRepository.obtenerPorId(empresaId).catch(() => null);

    const rucEmpresa = empresa?.ruc || '20100000001';
    const uitAnual = await this.obtenerUitPorAnio(anio);
    const cantidadUitUmbral = await parametroRepository.obtenerValorNumerico('UMBRAL_DAOT_UIT', 2, `${anio}-06-01`);
    const umbral2Uit = Money.toNumber(Money.mul(uitAnual, cantidadUitUmbral)); // S/ 11,000 en 2026 (2 UIT × S/ 5,500)

    const exclusionesAnio = this.listarExclusiones(empresaId, anio);
    const mapaExclusionTercero = new Map<string, ExclusionDaotItem>();
    const setComprobantesExcluidos = new Set<string>();

    for (const ex of exclusionesAnio) {
      if (ex.comprobanteId) {
        setComprobantesExcluidos.add(ex.comprobanteId);
      } else {
        mapaExclusionTercero.set(ex.rucTercero, ex);
      }
    }

    // Filtrar por año
    const comprasAnio = compras.filter(
      c => (c.fechaEmision || '').startsWith(String(anio)) || (c.periodoId || '').includes(String(anio))
    );
    const ventasAnio = ventas.filter(
      v => (v.fechaEmision || '').startsWith(String(anio)) || (v.periodoId || '').includes(String(anio))
    );

    const mapaTerceros = new Map<string, {
      tipoDoc: '6' | '1' | '4' | '7';
      numeroDoc: string;
      nombre: string;
      baseCompras: number;
      baseVentas: number;
      compras: number;
      ventas: number;
      cantidadComprobantes: number;
    }>();

    // Procesar Compras (excluyendo comprobantes anulados, recibos 4ta si se depuran, o comprobantes excluidos)
    for (const c of comprasAnio) {
      if (c.estado === 'ANULADO') continue;
      if (setComprobantesExcluidos.has(c.id)) continue;

      const doc = ((c as any).proveedorRuc || (c as any).emisorRuc || c.proveedorId || '').trim();
      if (!doc) continue;

      const signo = c.tipoComprobante === '07' ? -1 : 1;
      const tipoDoc: '6' | '1' | '4' | '7' = doc.length === 11 ? '6' : doc.length === 8 ? '1' : '4';
      const nombre = ((c as any).proveedorRazonSocial || (c as any).emisorRazonSocial || 'PROVEEDOR VARIOS').trim();

      const baseGrav = Number((c as any).baseGravada ?? (c as any).baseImponible ?? 0);
      const baseNoGrav = Number((c as any).baseNoGravada || 0) + Number((c as any).exonerado || 0);
      const baseCalc = (baseGrav + baseNoGrav > 0 ? baseGrav + baseNoGrav : Number(c.total || 0)) * signo;
      const total = (Number(c.total) || baseCalc) * signo;

      const actual = mapaTerceros.get(doc) || {
        tipoDoc,
        numeroDoc: doc,
        nombre,
        baseCompras: 0,
        baseVentas: 0,
        compras: 0,
        ventas: 0,
        cantidadComprobantes: 0
      };

      actual.baseCompras = Money.toNumber(Money.add(actual.baseCompras, baseCalc));
      actual.compras = Money.toNumber(Money.add(actual.compras, total));
      actual.cantidadComprobantes += 1;
      mapaTerceros.set(doc, actual);
    }

    // Procesar Ventas
    for (const v of ventasAnio) {
      if (v.estado === 'ANULADO') continue;
      if (setComprobantesExcluidos.has(v.id)) continue;

      const doc = ((v as any).clienteRuc || (v as any).emisorRuc || v.clienteId || '').trim();
      if (!doc) continue;

      const signo = v.tipoComprobante === '07' ? -1 : 1;
      const tipoDoc: '6' | '1' | '4' | '7' = doc.length === 11 ? '6' : doc.length === 8 ? '1' : '4';
      const nombre = ((v as any).clienteRazonSocial || 'CLIENTE VARIOS').trim();

      const baseGrav = Number((v as any).baseGravada ?? (v as any).baseImponible ?? 0);
      const baseNoGrav = Number((v as any).baseNoGravada || 0) + Number((v as any).exonerado || 0) + Number((v as any).inafecto || 0);
      const baseCalc = (baseGrav + baseNoGrav > 0 ? baseGrav + baseNoGrav : Number(v.total || 0)) * signo;
      const total = (Number(v.total) || baseCalc) * signo;

      const actual = mapaTerceros.get(doc) || {
        tipoDoc,
        numeroDoc: doc,
        nombre,
        baseCompras: 0,
        baseVentas: 0,
        compras: 0,
        ventas: 0,
        cantidadComprobantes: 0
      };

      actual.baseVentas = Money.toNumber(Money.add(actual.baseVentas, baseCalc));
      actual.ventas = Money.toNumber(Money.add(actual.ventas, total));
      actual.cantidadComprobantes += 1;
      mapaTerceros.set(doc, actual);
    }

    const registros: RegistroTerceroDaot[] = [];
    let montoTotalDeclarable = Money.create(0);
    let baseTotalDeclarable = Money.create(0);
    let totalComprasDeclarables = Money.create(0);
    let totalVentasDeclarables = Money.create(0);
    let baseComprasDeclarables = Money.create(0);
    let baseVentasDeclarables = Money.create(0);

    for (const t of mapaTerceros.values()) {
      const baseOps = Money.toNumber(Money.add(t.baseCompras, t.baseVentas));
      const totalOps = Money.toNumber(Money.add(t.compras, t.ventas));
      const exclusion = mapaExclusionTercero.get(t.numeroDoc);
      const estaExcluido = Boolean(exclusion);

      // Evaluación contra el umbral parametrizado de 2 UIT sobre la base neta de operaciones
      const superaPorBase = t.baseCompras > umbral2Uit || t.baseVentas > umbral2Uit || baseOps > umbral2Uit;
      const supera = !estaExcluido && superaPorBase;

      if (supera) {
        montoTotalDeclarable = Money.add(montoTotalDeclarable, totalOps);
        baseTotalDeclarable = Money.add(baseTotalDeclarable, baseOps);
        totalComprasDeclarables = Money.add(totalComprasDeclarables, t.compras);
        totalVentasDeclarables = Money.add(totalVentasDeclarables, t.ventas);
        baseComprasDeclarables = Money.add(baseComprasDeclarables, t.baseCompras);
        baseVentasDeclarables = Money.add(baseVentasDeclarables, t.baseVentas);
      }

      registros.push({
        tipoDocIdentidad: t.tipoDoc,
        numeroDocIdentidad: t.numeroDoc,
        razonSocialONombres: t.nombre,
        baseCompras: t.baseCompras,
        baseVentas: t.baseVentas,
        baseOperaciones: baseOps,
        totalCompras: t.compras,
        totalVentas: t.ventas,
        totalOperaciones: totalOps,
        cantidadComprobantes: t.cantidadComprobantes,
        superaUmbral2Uit: supera,
        umbral2UitAplicable: umbral2Uit,
        condicion: estaExcluido ? 'EXCLUIDO_DEPURACION' : supera ? 'DECLARABLE' : 'EXCEPTUADO',
        excluidoManualmente: estaExcluido,
        motivoExclusion: exclusion?.motivoExclusion,
        exclusionId: exclusion?.id
      });
    }

    // Ordenar de mayor a menor base de operaciones
    registros.sort((a, b) => b.baseOperaciones - a.baseOperaciones);

    // Generar formato TXT oficial DAOT Formulario 3500
    const declarables = registros.filter(r => r.condicion === 'DECLARABLE');
    const lineasTxt = declarables.map((d, idx) => {
      const tipoPersona = d.numeroDocIdentidad.startsWith('20') ? '01' : '02';
      return [
        String(idx + 1),
        '6',
        rucEmpresa,
        String(anio),
        tipoPersona,
        d.tipoDocIdentidad,
        d.numeroDocIdentidad,
        d.razonSocialONombres.replace(/\|/g, ' ').slice(0, 100),
        d.baseCompras.toFixed(2),
        d.baseVentas.toFixed(2),
        d.totalCompras.toFixed(2),
        d.totalVentas.toFixed(2)
      ].join('|') + '|';
    });

    const lineasCostos = declarables
      .filter(d => d.baseCompras > umbral2Uit)
      .map((d, idx) => {
        const tipoPersona = d.numeroDocIdentidad.startsWith('20') ? '01' : '02';
        return [
          String(idx + 1),
          '6',
          rucEmpresa,
          String(anio),
          tipoPersona,
          d.tipoDocIdentidad,
          d.numeroDocIdentidad,
          Math.round(d.baseCompras).toString(),
          d.razonSocialONombres.replace(/\|/g, ' ').slice(0, 100)
        ].join('|') + '|';
      });

    const lineasIngresos = declarables
      .filter(d => d.baseVentas > umbral2Uit)
      .map((d, idx) => {
        const tipoPersona = d.numeroDocIdentidad.startsWith('20') ? '01' : '02';
        return [
          String(idx + 1),
          '6',
          rucEmpresa,
          String(anio),
          tipoPersona,
          d.tipoDocIdentidad,
          d.numeroDocIdentidad,
          Math.round(d.baseVentas).toString(),
          d.razonSocialONombres.replace(/\|/g, ' ').slice(0, 100)
        ].join('|') + '|';
      });

    const txtGenerado = lineasTxt.join('\r\n');
    const txtCostos = lineasCostos.join('\r\n');
    const txtIngresos = lineasIngresos.join('\r\n');
    const nombreArchivoTxt = `DAOT_3500_${rucEmpresa}_${anio}.txt`;

    return {
      empresaId,
      anio,
      uitAnual,
      cantidadUitUmbral,
      umbral2Uit,
      totalTercerosEvaluados: registros.length,
      totalTercerosDeclarables: declarables.length,
      totalTercerosExcluidos: registros.filter(r => r.condicion === 'EXCLUIDO_DEPURACION').length,
      montoTotalDeclarable: Money.toNumber(montoTotalDeclarable),
      baseTotalDeclarable: Money.toNumber(baseTotalDeclarable),
      totalComprasDeclarables: Money.toNumber(totalComprasDeclarables),
      totalVentasDeclarables: Money.toNumber(totalVentasDeclarables),
      baseComprasDeclarables: Money.toNumber(baseComprasDeclarables),
      baseVentasDeclarables: Money.toNumber(baseVentasDeclarables),
      registros,
      exclusionesActivas: exclusionesAnio,
      txtGenerado,
      txtCostos,
      txtIngresos,
      nombreArchivoTxt
    };
  }
};
