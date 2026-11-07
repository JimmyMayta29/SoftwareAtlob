import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { Pool, type PoolClient } from 'pg';
import { REGISTRO_DATOS_EMPRESA } from '../storage/registroDatosEmpresa';

export interface ResultadoDiagnosticoFk {
  modulo: string;
  restriccion: string;
  hija: string;
  columnaFk: string;
  padre: string;
  columnaPadre: string;
  borrado: string;
  filasHija: number;
  filasConReferencia: number;
  filasHuerfanas: number;
  filasOtraEmpresa: number;
}

const MODULO_POR_TABLA_HIJA: Record<string, string> = {
  asientos: '01_contabilidad',
  asiento_detalle: '01_contabilidad',
  correlativos: '01_contabilidad',
  periodos: '01_contabilidad',
  reglas_contabilizacion_detalle: '01_contabilidad',
  saldos_mensuales: '01_contabilidad',
  comprobantes_compra: '02_comprobantes',
  comprobantes_venta: '02_comprobantes',
  aplicaciones_cobranza: '03_cartera',
  aplicaciones_pago: '03_cartera',
  cuentas_por_cobrar: '03_cartera',
  cuentas_por_pagar: '03_cartera',
  cajas_chicas: '04_tesoreria',
  conciliaciones_bancarias: '04_tesoreria',
  extracto_lineas: '04_tesoreria',
  extractos_bancarios: '04_tesoreria',
  movimientos_tesoreria: '04_tesoreria',
  rendiciones_caja_chica: '04_tesoreria',
  transferencias_cuentas: '04_tesoreria',
  liquidaciones_beneficios: '05_planillas',
  planilla_cts: '05_planillas',
  planilla_gratificaciones: '05_planillas',
  planilla_lineas: '05_planillas',
  planillas: '05_planillas',
  provisiones_sociales: '05_planillas',
  tregistro_movimientos: '05_planillas',
  declaraciones_pdt621: '06_tributos',
  declaraciones_prorrata_igv: '06_tributos',
  recibos_honorarios: '06_tributos',
  retenciones_percepciones_igv: '06_tributos',
  sire_conciliacion_lineas: '07_sire',
  sire_conciliaciones: '07_sire',
  sire_propuesta_lineas: '07_sire',
};

const TRADUCCION_BORRADO: Record<string, string> = {
  a: 'NO ACTION',
  r: 'RESTRICT',
  c: 'CASCADE',
  n: 'SET NULL',
  d: 'SET DEFAULT',
};

function validarIdentificadorSql(identificador: string): string {
  assert(/^[a-z_][a-z0-9_]*$/.test(identificador), `Identificador SQL inválido: ${identificador}`);
  return identificador;
}

export async function ejecutarDiagnosticoFkSoloLectura(client: PoolClient): Promise<{
  baseDatos: string;
  usuario: string;
  totalEmpresas: number;
  relaciones: ResultadoDiagnosticoFk[];
}> {
  await client.query('BEGIN TRANSACTION READ ONLY');
  try {
    await client.query('SET LOCAL transaction_read_only = on');
    const { rows: [meta] } = await client.query<{ bd: string; usr: string; ro: string }>(`
      SELECT current_database() AS bd, current_user AS usr, current_setting('transaction_read_only') AS ro
    `);
    assert.equal(meta.ro, 'on', 'La sesión debe estar estrictamente en modo READ ONLY');

    const { rows: empresasRows } = await client.query<{ id: string }>('SELECT id::text AS id FROM public.empresas ORDER BY id');
    const empresasIds = empresasRows.map(r => r.id);

    const tablasEmpresa = new Set(
      REGISTRO_DATOS_EMPRESA.filter(t => t.columnaEmpresa || t.empresaDesde).map(t => t.tabla)
    );
    const origenEmpresaPorHija = new Map(
      REGISTRO_DATOS_EMPRESA.filter(t => t.empresaDesde).map(t => [t.tabla, t.empresaDesde!])
    );

    const { rows: fksRaw } = await client.query<{
      nombre: string;
      hija: string;
      padre: string;
      columnas: string[];
      columnasPadre: string[];
      borrado: string;
      hijaTieneEmpresaId: boolean;
    }>(`
      SELECT c.conname AS nombre,
             h.relname AS hija,
             p.relname AS padre,
             ARRAY(
               SELECT a.attname::text
               FROM unnest(c.conkey) WITH ORDINALITY AS k(num, orden)
               JOIN pg_attribute a ON a.attrelid = h.oid AND a.attnum = k.num
               ORDER BY k.orden
             ) AS columnas,
             ARRAY(
               SELECT a.attname::text
               FROM unnest(c.confkey) WITH ORDINALITY AS k(num, orden)
               JOIN pg_attribute a ON a.attrelid = p.oid AND a.attnum = k.num
               ORDER BY k.orden
             ) AS "columnasPadre",
             c.confdeltype AS borrado,
             EXISTS (
               SELECT 1 FROM pg_attribute a
               WHERE a.attrelid = h.oid AND a.attname = 'empresa_id' AND NOT a.attisdropped
             ) AS "hijaTieneEmpresaId"
        FROM pg_constraint c
        JOIN pg_class h ON h.oid = c.conrelid
        JOIN pg_class p ON p.oid = c.confrelid
       WHERE c.contype = 'f'
         AND h.relnamespace = 'public'::regnamespace
         AND p.relnamespace = 'public'::regnamespace
       ORDER BY h.relname, c.conname
    `);

    const fks = fksRaw.filter(fk => tablasEmpresa.has(fk.hija) && tablasEmpresa.has(fk.padre) && fk.padre !== 'empresas');
    assert.equal(fks.length, 75, `Se esperaban 75 relaciones de empresa, se encontraron ${fks.length}`);

    // Recolectar mapa de padres (id -> empresa_id) iterando contextos de empresa bajo READ ONLY
    const padresUnicos = [...new Set(fks.map(fk => fk.padre))];
    const mapaPadres = new Map<string, Map<string, string>>();
    for (const padre of padresUnicos) {
      validarIdentificadorSql(padre);
      const porId = new Map<string, string>();
      if (empresasIds.length === 0) {
        await client.query("SELECT set_config('app.empresa_id', '', true), set_config('app.current_empresa_id', '', true)");
        const { rows } = await client.query<{ id: string; empresa_id: string }>(
          `SELECT id::text AS id, empresa_id::text AS empresa_id FROM public.${padre}`
        );
        for (const r of rows) porId.set(r.id, r.empresa_id);
      } else {
        for (const empId of empresasIds) {
          await client.query("SELECT set_config('app.empresa_id', $1, true), set_config('app.current_empresa_id', $1, true)", [empId]);
          const { rows } = await client.query<{ id: string; empresa_id: string }>(
            `SELECT id::text AS id, empresa_id::text AS empresa_id FROM public.${padre}`
          );
          for (const r of rows) porId.set(r.id, r.empresa_id);
        }
      }
      mapaPadres.set(padre, porId);
    }

    const relaciones: ResultadoDiagnosticoFk[] = [];
    for (const fk of fks) {
      const hija = validarIdentificadorSql(fk.hija);
      const padre = validarIdentificadorSql(fk.padre);
      const columnaFk = validarIdentificadorSql(fk.columnas[fk.columnas.length - 1]);
      const columnaPadre = validarIdentificadorSql(fk.columnasPadre[fk.columnasPadre.length - 1]);
      const padresDeTabla = mapaPadres.get(padre)!;

      let expresionEmpresaHija = 'h.empresa_id::text';
      let joinPadrePropio = '';
      if (!fk.hijaTieneEmpresaId) {
        const origen = origenEmpresaPorHija.get(hija);
        assert(origen, `Falta origen de empresa para tabla hija ${hija}`);
        const tablaOrigen = validarIdentificadorSql(origen.tabla);
        const colOrigen = validarIdentificadorSql(origen.columna);
        joinPadrePropio = `LEFT JOIN public.${tablaOrigen} po ON po.id = h.${colOrigen}`;
        expresionEmpresaHija = 'po.empresa_id::text';
      }

      const consultaHija = `
        SELECT ${expresionEmpresaHija} AS empresa_hija, h.${columnaFk}::text AS ref_id
        FROM public.${hija} h
        ${joinPadrePropio}
      `;

      let filasHija = 0;
      let filasConReferencia = 0;
      let filasHuerfanas = 0;
      let filasOtraEmpresa = 0;

      const contextos = empresasIds.length > 0 ? empresasIds : [''];
      for (const empId of contextos) {
        await client.query("SELECT set_config('app.empresa_id', $1, true), set_config('app.current_empresa_id', $1, true)", [empId]);
        const { rows } = await client.query<{ empresa_hija: string | null; ref_id: string | null }>(consultaHija);
        for (const fila of rows) {
          filasHija++;
          if (fila.ref_id === null) continue;
          filasConReferencia++;
          const empresaPadre = padresDeTabla.get(fila.ref_id);
          if (!empresaPadre) {
            filasHuerfanas++;
          } else if (fila.empresa_hija !== empresaPadre) {
            filasOtraEmpresa++;
          }
        }
      }

      relaciones.push({
        modulo: MODULO_POR_TABLA_HIJA[hija] ?? 'desconocido',
        restriccion: fk.nombre,
        hija,
        columnaFk,
        padre,
        columnaPadre,
        borrado: TRADUCCION_BORRADO[fk.borrado] ?? fk.borrado,
        filasHija,
        filasConReferencia,
        filasHuerfanas,
        filasOtraEmpresa,
      });
    }

    relaciones.sort((a, b) => a.modulo.localeCompare(b.modulo) || a.hija.localeCompare(b.hija) || a.restriccion.localeCompare(b.restriccion));
    return {
      baseDatos: meta.bd,
      usuario: meta.usr,
      totalEmpresas: empresasIds.length,
      relaciones,
    };
  } finally {
    await client.query('ROLLBACK');
  }
}

async function ejecutarCli() {
  const local = existsSync('.env') ? parse(readFileSync('.env')) : {};
  const objetivo = process.argv.includes('--test') ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
  const connectionString = process.env[objetivo] ?? local[objetivo];
  assert(connectionString, `${objetivo}_REQUERIDA`);
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const client = await pool.connect();
    try {
      const resultado = await ejecutarDiagnosticoFkSoloLectura(client);
      const totalHuerfanas = resultado.relaciones.reduce((acc, r) => acc + r.filasHuerfanas, 0);
      const totalOtraEmpresa = resultado.relaciones.reduce((acc, r) => acc + r.filasOtraEmpresa, 0);
      console.log(`DIAGNOSTICO_FK_SOLO_LECTURA | base=${resultado.baseDatos} | rol=${resultado.usuario} | empresas=${resultado.totalEmpresas} | relaciones=${resultado.relaciones.length} | huerfanas=${totalHuerfanas} | otra_empresa=${totalOtraEmpresa}`);
      for (const [idx, rel] of resultado.relaciones.entries()) {
        console.log(
          `${String(idx + 1).padStart(2, '0')}. [${rel.modulo}] ${rel.restriccion} | ${rel.hija}(${rel.columnaFk}) -> ${rel.padre}(${rel.columnaPadre}) [${rel.borrado}] | filas=${rel.filasHija} | con_ref=${rel.filasConReferencia} | huerfanas=${rel.filasHuerfanas} | otra_empresa=${rel.filasOtraEmpresa}`
        );
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  ejecutarCli().catch((err: Error) => {
    console.error(`ERROR_DIAGNOSTICO_FK: ${err.message}`);
    process.exitCode = 1;
  });
}
