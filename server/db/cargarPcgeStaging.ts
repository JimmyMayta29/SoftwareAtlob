import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import AdmZip from 'adm-zip';
import { parse } from 'dotenv';
import { XMLParser } from 'fast-xml-parser';
import { Client } from 'pg';

const HOJAS = {
  Plan_Cuentas: [
    'codigo denominacion elemento nivel codigo_padre tipo_cuenta naturaleza admite_movimiento moneda ' +
    'exige_anexo exige_documento exige_centro_costo exige_fecha_vencimiento cuenta_destino_debe cuenta_destino_haber ' +
    'instrucciones_uso fuente_norma estado_validacion observaciones estado_financiero grupo_estado columna_hoja_trabajo ' +
    'funcion_resultado signo_presentacion es_correctora clasificacion_corriente fuente_clasificacion estado_clasificacion',
    1627,
  ],
  Pendientes: ['codigo denominacion_literal pagina_pdf numeral_fuente tipo_observacion razon tratamiento estado', 22],
  Pendientes_Clasificacion: ['codigo denominacion elemento nivel campos_pendientes motivo fuente_clasificacion estado_clasificacion', 76],
} as const;

type Hoja = keyof typeof HOJAS;
type Fila = { hoja: Hoja; fila: number; datos: Record<string, string | null> };
type Celda = { '@_r': string; '@_t'?: string; f?: unknown; is?: { t?: string }; v?: string };
type FilaXml = { '@_r': string; c?: Celda[] };

class ErrorCarga extends Error {}

function exigir(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new ErrorCarga(mensaje);
}

function leerLibro(archivo: string) {
  const maxBytes = 8 * 1024 * 1024;
  const archivoLocal = statSync(archivo);
  exigir(archivoLocal.isFile() && archivoLocal.size <= maxBytes, 'El archivo excede el tamaño permitido para el PCGE v2 o no es un archivo regular.');
  const contenido = readFileSync(archivo);
  exigir(contenido.length <= maxBytes, 'El archivo excede el tamaño permitido para el PCGE v2.');
  const sha256 = createHash('sha256').update(contenido).digest('hex');
  const zip = new AdmZip(contenido);
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: false,
    htmlEntities: true,
    isArray: nombre => ['sheet', 'Relationship', 'row', 'c'].includes(nombre),
  });

  function leerXml(ruta: string) {
    const entrada = zip.getEntry(ruta);
    exigir(entrada && entrada.header.size <= maxBytes, 'Falta un componente del libro o excede el tamaño permitido.');
    const xml = entrada.getData().toString('utf8');
    exigir(!/<!DOCTYPE|<!ENTITY/i.test(xml), 'El libro contiene declaraciones XML no permitidas.');
    return parser.parse(xml);
  }

  const hojas = leerXml('xl/workbook.xml').workbook?.sheets?.sheet;
  const relaciones = leerXml('xl/_rels/workbook.xml.rels').Relationships?.Relationship;
  exigir(Array.isArray(hojas) && Array.isArray(relaciones), 'No se pudo leer el índice de hojas.');
  const filas: Fila[] = [];

  for (const hoja of Object.keys(HOJAS) as Hoja[]) {
    const [campos, total] = HOJAS[hoja];
    const encabezados = campos.split(' ');
    const hojaXml = hojas.find(item => item['@_name'] === hoja);
    const destino = relaciones.find(item => item['@_Id'] === hojaXml?.['@_r:id'])?.['@_Target'];
    exigir(hojaXml && typeof destino === 'string' && /^\/?(?:xl\/)?worksheets\/sheet\d+\.xml$/.test(destino), `Falta la hoja ${hoja}.`);
    const ruta = destino.startsWith('/') ? destino.slice(1) : destino.startsWith('xl/') ? destino : `xl/${destino}`;
    const filasXml: FilaXml[] = leerXml(ruta).worksheet?.sheetData?.row;
    exigir(Array.isArray(filasXml), `No se pudo leer la hoja ${hoja}.`);
    const fuente = filasXml.filter(fila => fila.c?.length);
    exigir(fuente.length === total + 1, `Cantidad de filas inesperada en ${hoja}.`);
    const columnas = encabezados.map((_, i) => i < 26 ? String.fromCharCode(65 + i) : `A${String.fromCharCode(65 + i - 26)}`);

    fuente.forEach((original, indice) => {
      const fila = indice + 1;
      exigir(original['@_r'] === String(fila), `Numeración inesperada en ${hoja}, fila ${fila}.`);
      const celdas = new Map<string, string>();
      for (const celda of original.c ?? []) {
        const columna = /^([A-Z]+)\d+$/.exec(celda['@_r'])?.[1] ?? '';
        exigir(columnas.includes(columna) && celda['@_r'] === `${columna}${fila}` && !celdas.has(columna) && celda.f === undefined,
          `Celda inesperada en ${hoja}, fila ${fila}.`);
        const tipo = celda['@_t'];
        const valor = tipo === 'inlineStr' ? celda.is?.t : celda.v;
        exigir((tipo === undefined || tipo === 'n' || tipo === 'inlineStr') && (valor === undefined || typeof valor === 'string'),
          `Formato de celda no admitido en ${hoja}, fila ${fila}.`);
        celdas.set(columna, valor ?? '');
      }
      if (fila === 1) {
        exigir(encabezados.every((campo, i) => celdas.get(columnas[i]) === campo), `Encabezado inesperado en ${hoja}.`);
        return;
      }
      const datos = Object.fromEntries(encabezados.map((campo, i) => [campo, celdas.get(columnas[i]) || null]));
      exigir(/^\d+$/.test(datos.codigo ?? '') && (datos.denominacion ?? datos.denominacion_literal)?.trim(),
        `Cuenta incompleta en ${hoja}, fila ${fila}.`);
      filas.push({ hoja, fila, datos });
    });
  }

  const plan = filas.filter(fila => fila.hoja === 'Plan_Cuentas');
  const pendientes = filas.filter(fila => fila.hoja === 'Pendientes_Clasificacion');
  const codigosPlan = new Set(plan.map(fila => fila.datos.codigo));
  exigir(codigosPlan.size === plan.length, 'Hay códigos repetidos en Plan_Cuentas.');
  exigir(pendientes.every(fila => codigosPlan.has(fila.datos.codigo) && fila.datos.estado_clasificacion === 'PENDIENTE_CONTADOR'),
    'Hay pendientes de clasificación sin cuenta o con un estado inesperado.');
  return {
    sha256,
    filas,
    cuentas: plan.length,
    cuentasPendientesValidacion: plan.filter(fila => fila.datos.estado_validacion === 'PENDIENTE_CONTADOR').length,
    cuentasPendientesClasificacion: plan.filter(fila => fila.datos.estado_clasificacion === 'PENDIENTE_CONTADOR').length,
    observaciones: filas.filter(fila => fila.hoja === 'Pendientes').length,
    filasPendientesClasificacion: pendientes.length,
    codigosPendientesClasificacion: new Set(pendientes.map(fila => fila.datos.codigo)).size,
  };
}

async function cargar(sha256: string, filas: Fila[]) {
  const connectionString = parse(readFileSync(new URL('../../.env', import.meta.url))).DATABASE_URL;
  exigir(connectionString, 'Configure DATABASE_URL en el archivo .env local.');
  const url = new URL(connectionString);
  exigir(['postgresql:', 'postgres:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && url.pathname === '/sistema_contable' && decodeURIComponent(url.username) === 'contabilidad_app',
  'DATABASE_URL debe identificar contabilidad_app en sistema_contable de PostgreSQL local.');

  const client = new Client({
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: url.port ? Number(url.port) : 5432,
    user: 'contabilidad_app',
    database: 'sistema_contable',
    password: decodeURIComponent(url.password),
    connectionTimeoutMillis: 5000,
    options: '-c search_path=pg_catalog',
  });
  try {
    await client.connect();
    const { rows: [sesion] } = await client.query(`
      SELECT current_database() = 'sistema_contable' AND current_user = 'contabilidad_app'
        AND session_user = 'contabilidad_app'
        AND inet_server_addr() IN ('127.0.0.1'::inet, '::1'::inet)
        AND current_setting('server_version_num')::int BETWEEN 180000 AND 189999
        AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole) AS correcta
      FROM pg_roles WHERE rolname = current_user
    `);
    exigir(sesion?.correcta, 'La conexión no corresponde al rol y a la base PostgreSQL 18 locales autorizados.');
    await client.query('BEGIN');
    try {
      await client.query(`
        SELECT pg_advisory_xact_lock(738291005);
        CREATE SCHEMA IF NOT EXISTS staging;
        CREATE TABLE IF NOT EXISTS staging.pcge_importacion (
          archivo_sha256 TEXT NOT NULL,
          hoja TEXT NOT NULL,
          fila INTEGER NOT NULL,
          datos JSONB NOT NULL,
          PRIMARY KEY (archivo_sha256, hoja, fila)
        )
      `);
      const registros = JSON.stringify(filas);
      const insercion = await client.query(`
        INSERT INTO staging.pcge_importacion (archivo_sha256, hoja, fila, datos)
        SELECT $1, hoja, fila, datos
        FROM jsonb_to_recordset($2::jsonb) AS fuente(hoja TEXT, fila INTEGER, datos JSONB)
        ON CONFLICT (archivo_sha256, hoja, fila) DO NOTHING
      `, [sha256, registros]);
      const { rows: [control] } = await client.query(`
        WITH cargado AS (
          SELECT hoja, fila, datos FROM staging.pcge_importacion WHERE archivo_sha256 = $1
        )
        SELECT count(*)::int AS total,
          count(fuente.fila)::int AS iguales
        FROM cargado
        LEFT JOIN jsonb_to_recordset($2::jsonb) AS fuente(hoja TEXT, fila INTEGER, datos JSONB)
          USING (hoja, fila, datos)
      `, [sha256, registros]);
      exigir(control.total === filas.length && control.iguales === filas.length,
        'Las filas de staging no coinciden con el libro. Se revierte la operación.');
      await client.query('COMMIT');
      return insercion.rowCount;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

async function ejecutar() {
  const [archivo, opcion, ...resto] = process.argv.slice(2);
  exigir(archivo && (!opcion || opcion === '--verificar') && resto.length === 0,
    'Uso: npm run cargar:pcge -- <ruta-al-libro.xlsx> [--verificar]');
  const { filas, ...resumen } = leerLibro(archivo);
  if (opcion === '--verificar') {
    console.log(JSON.stringify({ ...resumen, filasFuente: filas.length, modo: 'verificación local' }, null, 2));
    return;
  }
  const filasNuevas = await cargar(resumen.sha256, filas);
  console.log(JSON.stringify({ ...resumen, filasVerificadas: filas.length, filasNuevas, tabla: 'staging.pcge_importacion' }, null, 2));
}

void ejecutar().catch(error => {
  console.error(error instanceof ErrorCarga ? error.message : 'No se pudo leer el libro, la configuración local o completar la transacción de staging.');
  process.exitCode = 1;
});
