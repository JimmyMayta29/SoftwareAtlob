import { db } from '../config/database';
import { PLAN_CONTABLE_PCGE, buscarCuentaPCGE } from '../../src/data/pcgeAccounts';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CuentaPCGEItem {
  id?: string;
  empresaId?: string;
  codigo: string;
  nombre: string;
  elemento: number;
  nivel: number;
  tipoCuenta: string;
  permiteMovimiento: boolean;
  esRegistro: boolean;
  clasificacionEeff: string;
  naturalezaSaldo: 'DEUDORA' | 'ACREEDORA' | 'MIXTA';
  signoEeff: number; // 1 o -1
  cuentaCierreRelacionada?: string | null;
  esCorrectora: boolean;
  esInactiva: boolean;
  columnaHojaTrabajo?: string;
  estadoClasificacion?: string;
}

// Catálogo cargado en memoria desde pcge_base_v2.json para fallback inmediato
let catalogoMemoriaCache: Map<string, any> | null = null;

function obtenerCatalogoMemoria(): Map<string, any> {
  if (catalogoMemoriaCache) return catalogoMemoriaCache;
  const mapa = new Map<string, any>();
  const rutaJson = path.join(__dirname, '../data/pcge_base_v2.json');
  if (fs.existsSync(rutaJson)) {
    const raw = fs.readFileSync(rutaJson, 'utf8');
    const { cuentas } = JSON.parse(raw);
    for (const c of cuentas) {
      mapa.set(c.codigo, c);
    }
  }
  catalogoMemoriaCache = mapa;
  return mapa;
}

// Plan en memoria por empresa para entorno sin base de datos
export const PLAN_CUENTAS_EMPRESA_MEMORIA = new Map<string, CuentaPCGEItem[]>();

export const pcgeService = {
  /**
   * Obtiene la metadata normativa de una cuenta, buscando en orden:
   * 1. plan_cuentas de la empresa
   * 2. pcge_base (tabla compartida o catálogo JSON v2)
   * 3. pcgeAccounts.ts (fallback 75 cuentas)
   */
  async obtenerCuentaMetadata(empresaId: string, codigo: string): Promise<CuentaPCGEItem | null> {
    if (db.isPostgresConnected()) {
      const res = await db.query(`
        SELECT pc.id, pc.empresa_id as "empresaId", pc.codigo, pc.nombre, pc.nivel,
               pc.tipo_cuenta as "tipoCuenta", pc.permite_movimiento as "permiteMovimiento",
               pc.es_registro as "esRegistro", pc.clasificacion_eeff as "clasificacionEeff",
               pc.naturaleza_saldo as "naturalezaSaldo", pc.signo_eeff as "signoEeff",
               pc.cuenta_cierre_relacionada as "cuentaCierreRelacionada",
               pc.es_correctora as "esCorrectora", pc.es_inactiva as "esInactiva"
        FROM plan_cuentas pc
        WHERE pc.empresa_id = $1 AND pc.codigo = $2
      `, [empresaId, codigo]);

      if (res.rows.length > 0) {
        const r = res.rows[0];
        const el = parseInt(r.codigo.charAt(0), 10) || 1;
        return {
          id: r.id,
          empresaId: r.empresaId,
          codigo: r.codigo,
          nombre: r.nombre,
          elemento: el,
          nivel: r.nivel,
          tipoCuenta: r.tipoCuenta,
          permiteMovimiento: r.permiteMovimiento,
          esRegistro: r.esRegistro,
          clasificacionEeff: r.clasificacionEeff,
          naturalezaSaldo: r.naturalezaSaldo,
          signoEeff: r.signoEeff,
          cuentaCierreRelacionada: r.cuentaCierreRelacionada,
          esCorrectora: r.esCorrectora,
          esInactiva: r.esInactiva
        };
      }

      // Buscar en pcge_base compartido
      const baseRes = await db.query(`
        SELECT codigo, denominacion as nombre, elemento, nivel, tipo_cuenta as "tipoCuenta",
               es_registro as "esRegistro", clasificacion_eeff as "clasificacionEeff",
               naturaleza_saldo as "naturalezaSaldo", signo_eeff as "signoEeff",
               cuenta_cierre_relacionada as "cuentaCierreRelacionada",
               es_correctora as "esCorrectora", columna_hoja_trabajo as "columnaHojaTrabajo"
        FROM pcge_base
        WHERE codigo = $1
      `, [codigo]);

      if (baseRes.rows.length > 0) {
        const b = baseRes.rows[0];
        return {
          empresaId,
          codigo: b.codigo,
          nombre: b.nombre,
          elemento: parseInt(b.elemento, 10) || 1,
          nivel: b.nivel,
          tipoCuenta: b.tipoCuenta,
          permiteMovimiento: b.esRegistro,
          esRegistro: b.esRegistro,
          clasificacionEeff: b.clasificacionEeff,
          naturalezaSaldo: b.naturalezaSaldo,
          signoEeff: b.signoEeff,
          cuentaCierreRelacionada: b.cuentaCierreRelacionada,
          esCorrectora: b.esCorrectora,
          esInactiva: false,
          columnaHojaTrabajo: b.columnaHojaTrabajo
        };
      }
    }

    // Memoria: buscar primero en el plan de cuentas de la empresa
    const listaEmpresa = PLAN_CUENTAS_EMPRESA_MEMORIA.get(empresaId);
    if (listaEmpresa) {
      const encontrada = listaEmpresa.find(x => x.codigo === codigo);
      if (encontrada) {
        return encontrada;
      }
    }

    // Memoria / Catálogo JSON base
    const cat = obtenerCatalogoMemoria();
    if (cat.has(codigo)) {
      const c = cat.get(codigo);
      return {
        empresaId,
        codigo: c.codigo,
        nombre: c.denominacion,
        elemento: parseInt(c.elemento, 10) || 1,
        nivel: c.nivel,
        tipoCuenta: c.tipo_cuenta,
        permiteMovimiento: c.es_registro,
        esRegistro: c.es_registro,
        clasificacionEeff: c.clasificacion_eeff,
        naturalezaSaldo: c.naturaleza_saldo,
        signoEeff: c.signo_eeff,
        cuentaCierreRelacionada: c.cuenta_cierre_relacionada,
        esCorrectora: c.es_correctora,
        esInactiva: false,
        columnaHojaTrabajo: c.columna_hoja_trabajo
      };
    }

    // Fallback 75 cuentas
    const pcge75 = buscarCuentaPCGE(codigo);
    if (pcge75) {
      const esCorr = codigo.startsWith('19') || codigo.startsWith('29') || codigo.startsWith('36') || codigo.startsWith('39');
      const nat = esCorr ? 'ACREEDORA' : (pcge75.naturaleza || 'DEUDORA');
      return {
        empresaId,
        codigo: pcge75.codigo,
        nombre: pcge75.nombre,
        elemento: pcge75.elemento,
        nivel: pcge75.nivel,
        tipoCuenta: pcge75.tipo === 'BALANCE' ? (pcge75.elemento <= 3 ? 'ACTIVO' : pcge75.elemento === 4 ? 'PASIVO' : 'PATRIMONIO') : 'GASTO',
        permiteMovimiento: pcge75.permiteMovimiento,
        esRegistro: pcge75.permiteMovimiento,
        clasificacionEeff: pcge75.elemento <= 2 ? 'ACTIVO_CORRIENTE' : pcge75.elemento === 3 ? 'ACTIVO_NO_CORRIENTE' : 'NO_APLICA',
        naturalezaSaldo: nat as any,
        signoEeff: esCorr ? -1 : 1,
        esCorrectora: esCorr,
        esInactiva: false
      };
    }

    return null;
  },

  /**
   * Obtiene mapa indexado de todas las cuentas de la empresa para acelerar reportes
   */
  async obtenerMapaCuentasEmpresa(empresaId: string): Promise<Map<string, CuentaPCGEItem>> {
    const mapa = new Map<string, CuentaPCGEItem>();

    if (db.isPostgresConnected()) {
      const res = await db.query(`
        SELECT pc.id, pc.empresa_id as "empresaId", pc.codigo, pc.nombre, pc.nivel,
               pc.tipo_cuenta as "tipoCuenta", pc.permite_movimiento as "permiteMovimiento",
               pc.es_registro as "esRegistro", pc.clasificacion_eeff as "clasificacionEeff",
               pc.naturaleza_saldo as "naturalezaSaldo", pc.signo_eeff as "signoEeff",
               pc.cuenta_cierre_relacionada as "cuentaCierreRelacionada",
               pc.es_correctora as "esCorrectora", pc.es_inactiva as "esInactiva",
               pc.estado_clasificacion as "estadoClasificacion",
               pc.columna_hoja_trabajo as "columnaHojaTrabajo"
        FROM plan_cuentas pc
        WHERE pc.empresa_id = $1
      `, [empresaId]);

      for (const r of res.rows) {
        const el = parseInt(r.codigo.charAt(0), 10) || 1;
        mapa.set(r.codigo, {
          id: r.id,
          empresaId: r.empresaId,
          codigo: r.codigo,
          nombre: r.nombre,
          elemento: el,
          nivel: r.nivel,
          tipoCuenta: r.tipoCuenta,
          permiteMovimiento: r.permiteMovimiento,
          esRegistro: r.esRegistro,
          clasificacionEeff: r.clasificacionEeff,
          naturalezaSaldo: r.naturalezaSaldo,
          signoEeff: r.signoEeff,
          cuentaCierreRelacionada: r.cuentaCierreRelacionada,
          esCorrectora: r.esCorrectora,
          esInactiva: r.esInactiva,
          estadoClasificacion: r.estadoClasificacion,
          columnaHojaTrabajo: r.columnaHojaTrabajo
        });
      }
    }

    // Complementar con catálogo base en memoria si la empresa no tiene algunas
    const catMem = obtenerCatalogoMemoria();
    for (const [cod, c] of catMem.entries()) {
      if (!mapa.has(cod)) {
        mapa.set(cod, {
          empresaId,
          codigo: c.codigo,
          nombre: c.denominacion,
          elemento: parseInt(c.elemento, 10) || 1,
          nivel: c.nivel,
          tipoCuenta: c.tipo_cuenta,
          permiteMovimiento: c.es_registro,
          esRegistro: c.es_registro,
          clasificacionEeff: c.clasificacion_eeff,
          naturalezaSaldo: c.naturaleza_saldo,
          signoEeff: c.signo_eeff,
          cuentaCierreRelacionada: c.cuenta_cierre_relacionada,
          esCorrectora: c.es_correctora,
          esInactiva: false,
          columnaHojaTrabajo: c.columna_hoja_trabajo
        });
      }
    }

    return mapa;
  },

  /**
   * "Completar plan con el catálogo base": agrega a la empresa las cuentas del catálogo base
   * que aún no existan en su plan, respetando denominaciones y cuentas ya registradas.
   */
  async completarPlanDesdeCatalogoBase(empresaId: string): Promise<{ agregadas: number; existentes: number; totalEmpresa: number }> {
    if (db.isPostgresConnected()) {
      const client = await db.getClient();
      try {
        await client.query('BEGIN');

        // Contar cuentas antes
        const { rows: [antes] } = await client.query('SELECT count(*)::int as total FROM plan_cuentas WHERE empresa_id = $1', [empresaId]);

        // Insertar desde pcge_base respetando ON CONFLICT (empresa_id, codigo) DO NOTHING
        const insertRes = await client.query(`
          INSERT INTO plan_cuentas (
            empresa_id, codigo, nombre, nivel, tipo_cuenta,
            permite_movimiento, es_registro, clasificacion_eeff,
            naturaleza_saldo, signo_eeff, cuenta_cierre_relacionada,
            es_correctora, es_inactiva, estado_financiero, grupo_estado,
            columna_hoja_trabajo, funcion_resultado, exige_anexo,
            exige_documento, exige_centro_costo, exige_fecha_vencimiento,
            cuenta_destino_debe, cuenta_destino_haber, estado_clasificacion, origen
          )
          SELECT $1, pb.codigo, pb.denominacion, pb.nivel, pb.tipo_cuenta,
                 pb.es_registro, pb.es_registro, pb.clasificacion_eeff,
                 pb.naturaleza_saldo, pb.signo_eeff, pb.cuenta_cierre_relacionada,
                 pb.es_correctora, pb.es_registro = FALSE, pb.estado_financiero, pb.grupo_estado,
                 pb.columna_hoja_trabajo, pb.funcion_resultado, pb.exige_anexo,
                 pb.exige_documento, pb.exige_centro_costo, pb.exige_fecha_vencimiento,
                 pb.cuenta_destino_debe, pb.cuenta_destino_haber, pb.estado_clasificacion, pb.origen
          FROM pcge_base pb
          ON CONFLICT (empresa_id, codigo) DO UPDATE SET
            estado_financiero = EXCLUDED.estado_financiero,
            columna_hoja_trabajo = EXCLUDED.columna_hoja_trabajo,
            estado_clasificacion = EXCLUDED.estado_clasificacion,
            es_correctora = EXCLUDED.es_correctora,
            signo_eeff = EXCLUDED.signo_eeff,
            naturaleza_saldo = EXCLUDED.naturaleza_saldo,
            clasificacion_eeff = EXCLUDED.clasificacion_eeff;
        `, [empresaId]);

        const { rows: [despues] } = await client.query('SELECT count(*)::int as total FROM plan_cuentas WHERE empresa_id = $1', [empresaId]);
        await client.query('COMMIT');

        const agregadas = (despues?.total || 0) - (antes?.total || 0);
        return {
          agregadas,
          existentes: antes?.total || 0,
          totalEmpresa: despues?.total || 0
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // Modo Memoria
    const catMem = obtenerCatalogoMemoria();
    let lista = PLAN_CUENTAS_EMPRESA_MEMORIA.get(empresaId);
    if (!lista) {
      lista = PLAN_CONTABLE_PCGE.map(p => {
        const esCorr = p.codigo.startsWith('19') || p.codigo.startsWith('29') || p.codigo.startsWith('39');
        return {
          empresaId,
          codigo: p.codigo,
          nombre: p.nombre,
          elemento: p.elemento,
          nivel: p.nivel,
          tipoCuenta: p.tipo === 'BALANCE' ? (p.elemento <= 3 ? 'ACTIVO' : p.elemento === 4 ? 'PASIVO' : 'PATRIMONIO') : 'GASTO',
          permiteMovimiento: p.permiteMovimiento,
          esRegistro: p.permiteMovimiento,
          clasificacionEeff: p.elemento <= 2 ? 'ACTIVO_CORRIENTE' : 'NO_APLICA',
          naturalezaSaldo: (esCorr ? 'ACREEDORA' : (p.naturaleza || 'DEUDORA')) as any,
          signoEeff: esCorr ? -1 : 1,
          esCorrectora: esCorr,
          esInactiva: false
        };
      });
      PLAN_CUENTAS_EMPRESA_MEMORIA.set(empresaId, lista);
    }

    const codigosExistentes = new Set(lista.map(c => c.codigo));
    let agregadas = 0;
    for (const [cod, c] of catMem.entries()) {
      if (!codigosExistentes.has(cod)) {
        lista.push({
          empresaId,
          codigo: c.codigo,
          nombre: c.denominacion,
          elemento: parseInt(c.elemento, 10) || 1,
          nivel: c.nivel,
          tipoCuenta: c.tipo_cuenta,
          permiteMovimiento: c.es_registro,
          esRegistro: c.es_registro,
          clasificacionEeff: c.clasificacion_eeff,
          naturalezaSaldo: c.naturaleza_saldo,
          signoEeff: c.signo_eeff,
          cuentaCierreRelacionada: c.cuenta_cierre_relacionada,
          esCorrectora: c.es_correctora,
          esInactiva: false,
          columnaHojaTrabajo: c.columna_hoja_trabajo
        });
        codigosExistentes.add(cod);
        agregadas++;
      }
    }

    return {
      agregadas,
      existentes: codigosExistentes.size - agregadas,
      totalEmpresa: lista.length
    };
  },

  /**
   * Agrega una subcuenta validando estrictamente la jerarquía del código:
   * 1. Debe existir una cuenta padre inmediata en el plan o catálogo base (ej: para 10411 debe existir 1041 o 104)
   * 2. Mismo elemento contable
   * 3. Nivel correlativo superior al padre
   */
  async crearSubcuenta(empresaId: string, params: {
    codigo: string;
    nombre: string;
    esRegistro?: boolean;
    naturalezaSaldo?: 'DEUDORA' | 'ACREEDORA' | 'MIXTA';
    clasificacionEeff?: string;
  }): Promise<CuentaPCGEItem> {
    const cod = params.codigo.trim();
    const nom = params.nombre.trim();
    if (cod.length < 3) {
      throw new Error('JERARQUIA_INVALIDA: La subcuenta debe poseer al menos 3 dígitos.');
    }
    if (!nom) {
      throw new Error('DENOMINACION_REQUERIDA: Ingrese la denominación de la subcuenta.');
    }

    const elemento = parseInt(cod.charAt(0), 10);
    if (isNaN(elemento) || elemento < 0 || elemento > 9) {
      throw new Error('ELEMENTO_INVALIDO: El código de cuenta debe iniciar con un dígito de elemento del 0 al 9.');
    }

    // Buscar cuenta padre jerárquica (prefijo más largo existente)
    let codigoPadre = '';
    for (let len = cod.length - 1; len >= 2; len--) {
      const prefijo = cod.substring(0, len);
      const padreInfo = await this.obtenerCuentaMetadata(empresaId, prefijo);
      if (padreInfo) {
        codigoPadre = prefijo;
        if (padreInfo.elemento !== elemento) {
          throw new Error(`JERARQUIA_INVALIDA: La cuenta padre ${prefijo} pertenece al elemento ${padreInfo.elemento}, diferente del elemento ${elemento} de la subcuenta.`);
        }
        break;
      }
    }

    if (!codigoPadre) {
      throw new Error(`JERARQUIA_INVALIDA: La subcuenta ${cod} no tiene una cuenta padre registrada en el plan. Ingrese primero la divisionaria o cuenta principal.`);
    }

    // Determinar atributos heredados del padre o del catálogo
    const padre = await this.obtenerCuentaMetadata(empresaId, codigoPadre);
    const esCorrectora = padre?.esCorrectora || cod.startsWith('19') || cod.startsWith('29') || cod.startsWith('36') || cod.startsWith('39');
    const signoEeff = esCorrectora ? -1 : (padre?.signoEeff ?? 1);
    const natSaldo = params.naturalezaSaldo || (esCorrectora ? 'ACREEDORA' : (padre?.naturalezaSaldo || 'DEUDORA'));
    const tipoCta = padre?.tipoCuenta || (elemento <= 3 ? 'ACTIVO' : elemento === 4 ? 'PASIVO' : elemento === 5 ? 'PATRIMONIO' : 'GASTO');
    const clasif = params.clasificacionEeff || padre?.clasificacionEeff || (elemento <= 2 ? 'ACTIVO_CORRIENTE' : elemento === 3 ? 'ACTIVO_NO_CORRIENTE' : 'NO_APLICA');
    const esReg = params.esRegistro ?? true;

    if (db.isPostgresConnected()) {
      const res = await db.query(`
        INSERT INTO plan_cuentas (
          empresa_id, codigo, nombre, nivel, tipo_cuenta,
          permite_movimiento, es_registro, clasificacion_eeff,
          naturaleza_saldo, signo_eeff, cuenta_cierre_relacionada,
          es_correctora, es_inactiva
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, FALSE)
        ON CONFLICT (empresa_id, codigo) DO UPDATE SET
          nombre = EXCLUDED.nombre,
          permite_movimiento = EXCLUDED.permite_movimiento,
          es_registro = EXCLUDED.es_registro,
          es_inactiva = FALSE
        RETURNING id;
      `, [empresaId, cod, nom, cod.length, tipoCta, esReg, esReg, clasif, natSaldo, signoEeff, padre?.cuentaCierreRelacionada || null, esCorrectora]);

      return {
        id: res.rows[0].id,
        empresaId,
        codigo: cod,
        nombre: nom,
        elemento,
        nivel: cod.length,
        tipoCuenta: tipoCta,
        permiteMovimiento: esReg,
        esRegistro: esReg,
        clasificacionEeff: clasif,
        naturalezaSaldo: natSaldo,
        signoEeff,
        esCorrectora,
        esInactiva: false
      };
    }

    // Modo Memoria
    const item: CuentaPCGEItem = {
      empresaId,
      codigo: cod,
      nombre: nom,
      elemento,
      nivel: cod.length,
      tipoCuenta: tipoCta,
      permiteMovimiento: esReg,
      esRegistro: esReg,
      clasificacionEeff: clasif,
      naturalezaSaldo: natSaldo,
      signoEeff,
      esCorrectora,
      esInactiva: false
    };

    let lista = PLAN_CUENTAS_EMPRESA_MEMORIA.get(empresaId);
    if (!lista) {
      lista = [];
      PLAN_CUENTAS_EMPRESA_MEMORIA.set(empresaId, lista);
    }
    const idx = lista.findIndex(c => c.codigo === cod);
    if (idx >= 0) {
      lista[idx] = item;
    } else {
      lista.unshift(item);
    }
    return item;
  },

  /**
   * Intenta eliminar una cuenta. Si tiene movimientos históricos, rechaza la operación
   * y exige mantenerla o marcarla como inactiva (es_inactiva = true).
   */
  async eliminarCuenta(empresaId: string, codigo: string): Promise<{ eliminada: boolean; desactivada?: boolean }> {
    if (db.isPostgresConnected()) {
      const client = await db.getClient();
      try {
        await client.query('BEGIN');

        // 1. Obtener ID de la cuenta
        const { rows: [cta] } = await client.query('SELECT id FROM plan_cuentas WHERE empresa_id = $1 AND codigo = $2', [empresaId, codigo]);
        if (!cta) {
          throw new Error(`CUENTA_NO_ENCONTRADA: La cuenta ${codigo} no existe en la empresa.`);
        }

        // 2. Comprobar movimientos en asiento_detalle
        const { rows: [movs] } = await client.query(`
          SELECT count(*)::int as total
          FROM asiento_detalle ad
          JOIN asientos a ON a.id = ad.asiento_id
          WHERE a.empresa_id = $1 AND ad.cuenta_id = $2
        `, [empresaId, cta.id]);

        if (movs && movs.total > 0) {
          throw new Error(`CUENTA_CON_MOVIMIENTOS: No se permite eliminar la cuenta ${codigo} porque registra ${movs.total} movimiento(s) histórico(s). Debe mantenerla como inactiva.`);
        }

        // 3. Eliminar físicamente si no tiene movimientos
        await client.query('DELETE FROM plan_cuentas WHERE id = $1', [cta.id]);
        await client.query('COMMIT');
        return { eliminada: true };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // Modo Memoria
    let lista = PLAN_CUENTAS_EMPRESA_MEMORIA.get(empresaId) || [];
    // Simulación de comprobación de movimientos
    if (codigo === '101' || codigo === '1011' || codigo === '70111' || codigo === '6011' || codigo === '40111') {
      throw new Error(`CUENTA_CON_MOVIMIENTOS: No se permite eliminar la cuenta ${codigo} porque registra movimientos históricos. Debe mantenerla como inactiva.`);
    }
    const filtered = lista.filter(c => c.codigo !== codigo);
    PLAN_CUENTAS_EMPRESA_MEMORIA.set(empresaId, filtered);
    return { eliminada: true };
  },

  /**
   * Marca una cuenta como inactiva para períodos futuros sin borrar su historial
   */
  async marcarInactiva(empresaId: string, codigo: string, inactiva: boolean = true): Promise<void> {
    if (db.isPostgresConnected()) {
      await db.query(`
        UPDATE plan_cuentas
        SET es_inactiva = $3, is_active = NOT $3
        WHERE empresa_id = $1 AND codigo = $2;
      `, [empresaId, codigo, inactiva]);
      return;
    }

    const lista = PLAN_CUENTAS_EMPRESA_MEMORIA.get(empresaId) || [];
    const c = lista.find(x => x.codigo === codigo);
    if (c) {
      c.esInactiva = inactiva;
    }
  }
};
