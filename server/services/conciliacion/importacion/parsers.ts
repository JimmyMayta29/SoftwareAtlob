import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import {
  FormatoExtractoV2,
  MapeoColumnasPerfil,
} from '../../../types/conciliacionV2';
import { Money } from '../../../utils/decimal';
import { ConciliacionV2Error } from '../../conciliacionV2Service';
import { AdaptadorPdfTexto, obtenerAdaptadorPdfTexto } from './pdfTextoAdapter';
import { MAX_FILAS_EXTRACTO } from './validacionArchivo';

export interface CeldaTablaCruda {
  valor: string;
  esNumericoXml?: boolean;
  esFormulaSinValor?: boolean;
}

export interface FilaTablaCruda {
  numFila: number;
  celdas: CeldaTablaCruda[];
}

export interface ErrorParseoFila {
  codigo: string;
  campo: string;
  mensaje: string;
  valor: string | null;
}

export interface FilaExtractoParseada {
  numFila: number;
  fecha: string | null;
  descripcion: string;
  referencia: string | null;
  monto: string | null;
  saldo: string | null;
  rawJson: Record<string, unknown>;
  errores: ErrorParseoFila[];
}

export interface OpcionesParseoExtracto {
  formatoArchivo: FormatoExtractoV2;
  delimitador?: string | null;
  codificacion?: string | null;
  filaEncabezado?: number;
  formatoFecha?: string;
  separadorDecimal?: '.' | ',';
  mapeoColumnas?: MapeoColumnasPerfil | null;
  adaptadorPdf?: AdaptadorPdfTexto;
}

const REGEX_ISO = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/;
const REGEX_DMY_4 = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s.*)?$/;
const REGEX_DMY_2 = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2})(?:\s.*)?$/;
const REGEX_EXCEL_SERIAL = /^\d+(?:\.\d+)?$/;

function construirFechaIsoValidada(anio: number, mes: number, dia: number): string | null {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) {
    return null;
  }
  if (anio < 1900 || anio > 2100 || mes < 1 || mes > 12 || dia < 1 || dia > 31) {
    return null;
  }
  const dt = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    dt.getUTCFullYear() !== anio ||
    dt.getUTCMonth() + 1 !== mes ||
    dt.getUTCDate() !== dia
  ) {
    return null;
  }
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Normaliza fechas de extracto bancario (`YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `DD/MM/YY`, serial Excel)
 * a formato ISO `YYYY-MM-DD`, validando calendario real.
 */
export function normalizarFechaExtracto(
  valor: string | number | null | undefined,
  formatoFechaPreferido = 'DD/MM/YYYY'
): string | null {
  if (valor === null || valor === undefined) {
    return null;
  }
  const raw = String(valor).trim();
  if (!raw) {
    return null;
  }

  let match = REGEX_ISO.exec(raw);
  if (match) {
    return construirFechaIsoValidada(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  const esMesPrimero = formatoFechaPreferido.toUpperCase().startsWith('MM');

  match = REGEX_DMY_4.exec(raw);
  if (match) {
    const p1 = Number(match[1]);
    const p2 = Number(match[2]);
    const anio = Number(match[3]);
    return esMesPrimero
      ? construirFechaIsoValidada(anio, p1, p2)
      : construirFechaIsoValidada(anio, p2, p1);
  }

  match = REGEX_DMY_2.exec(raw);
  if (match) {
    const p1 = Number(match[1]);
    const p2 = Number(match[2]);
    const yy = Number(match[3]);
    const anio = yy <= 69 ? 2000 + yy : 1900 + yy;
    return esMesPrimero
      ? construirFechaIsoValidada(anio, p1, p2)
      : construirFechaIsoValidada(anio, p2, p1);
  }

  if (REGEX_EXCEL_SERIAL.test(raw)) {
    const serial = Math.floor(Number(raw));
    if (serial >= 1 && serial <= 2958465) {
      // Excel considera erróneamente 1900 bisiesto (serial 60 = 29/02/1900)
      const diasAjustados = serial >= 60 ? serial : serial + 1;
      const ms = Date.UTC(1899, 11, 30) + diasAjustados * 86_400_000;
      const dt = new Date(ms);
      return construirFechaIsoValidada(
        dt.getUTCFullYear(),
        dt.getUTCMonth() + 1,
        dt.getUTCDate()
      );
    }
  }

  return null;
}

/**
 * Normaliza un importe textual o numérico usando exclusivamente `Money` (`decimal.js`, ROUND_HALF_UP).
 * Retorna `null` si está vacío o no tiene formato monetario válido.
 */
export function normalizarMontoExtracto(
  valor: string | number | null | undefined,
  separadorDecimal: '.' | ',' = '.',
  esNumericoXml = false
): string | null {
  if (valor === null || valor === undefined) {
    return null;
  }

  let texto = String(valor).trim();
  if (!texto || texto === '-' || texto === '--') {
    return null;
  }

  let negativo = false;

  const limpiarMoneda = (s: string) =>
    s
      .replace(/^(?:S\/\.?|PEN|USD|US\$|\$)\s*/i, '')
      .replace(/\s*(?:S\/\.?|PEN|USD)$/i, '')
      .trim();

  texto = limpiarMoneda(texto);

  // Paréntesis contables negativos: (1,250.50) o S/ (1,250.50)
  if (texto.startsWith('(') && texto.endsWith(')')) {
    negativo = true;
    texto = limpiarMoneda(texto.slice(1, -1).trim());
  }

  if (!texto) {
    return null;
  }

  // Signo prefijo o sufijo
  if (texto.startsWith('-')) {
    negativo = !negativo;
    texto = texto.slice(1).trim();
  } else if (texto.startsWith('+')) {
    texto = texto.slice(1).trim();
  }

  if (texto.endsWith('-')) {
    negativo = !negativo;
    texto = texto.slice(0, -1).trim();
  } else if (texto.endsWith('+')) {
    texto = texto.slice(0, -1).trim();
  }

  // Eliminar espacios internos (p. ej. "1 250.00")
  texto = texto.replace(/\s+/g, '');
  if (!texto) {
    return null;
  }

  // Si proviene de <v> numérico XML de Excel, siempre usa '.' decimal canónico
  const sepEfectivo: '.' | ',' = esNumericoXml ? '.' : separadorDecimal;

  if (sepEfectivo === ',') {
    // Formato 1.234,56 -> quitar '.' de miles y cambiar ',' por '.'
    if (texto.includes('.') && texto.includes(',')) {
      texto = texto.replace(/\./g, '').replace(',', '.');
    } else if (texto.includes(',')) {
      // Verificar que no haya múltiples comas de miles sin decimal
      const partes = texto.split(',');
      if (partes.length === 2) {
        texto = `${partes[0]}.${partes[1]}`;
      } else {
        return null;
      }
    } else if (/^\d{1,3}(?:\.\d{3})+$/.test(texto)) {
      texto = texto.replace(/\./g, '');
    }
  } else {
    // Formato 1,234.56 -> quitar ',' de miles
    if (texto.includes(',') && texto.includes('.')) {
      texto = texto.replace(/,/g, '');
    } else if (texto.includes(',')) {
      // Si tiene varias comas tipo 1,000,000 -> miles; si una sola coma con 3 dígitos -> miles
      if (/^\d{1,3}(?:,\d{3})+$/.test(texto)) {
        texto = texto.replace(/,/g, '');
      } else if (/^\d+,\d{1,2}$/.test(texto)) {
        // Fallback seguro si el archivo trae coma decimal puntual sin puntos
        texto = texto.replace(',', '.');
      } else {
        return null;
      }
    }
  }

  if (!/^\d+(?:\.\d+)?$/.test(texto)) {
    return null;
  }

  const decimal = Money.round(negativo ? `-${texto}` : texto);
  if (Money.isEqual(decimal, 0)) {
    return '0.00';
  }
  return Money.format(decimal);
}

function normalizarNombreColumna(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function letraColumnaAIndice(col: string): number {
  let idx = 0;
  const upper = col.toUpperCase();
  for (let i = 0; i < upper.length; i += 1) {
    idx = idx * 26 + (upper.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function decodificarBufferTexto(buffer: Buffer, codificacion?: string | null): string {
  const sinBom =
    buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
      ? buffer.subarray(3)
      : buffer;

  const enc = (codificacion ?? '').trim().toUpperCase();
  if (enc === 'LATIN1' || enc === 'ISO-8859-1' || enc === 'WIN1252' || enc === 'WINDOWS-1252') {
    return sinBom.toString('latin1');
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(sinBom);
  } catch {
    return sinBom.toString('latin1');
  }
}

function detectarDelimitadorCsv(texto: string): string {
  const candidatos = [',', ';', '\t', '|'];
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 10);

  if (lineas.length === 0) {
    return ',';
  }

  let mejorDelim = ',';
  let mejorPuntaje = 0;

  for (const delim of candidatos) {
    const conteos = lineas.map((linea) => {
      let enComillas = false;
      let count = 0;
      for (let i = 0; i < linea.length; i += 1) {
        const ch = linea[i];
        if (ch === '"') {
          if (enComillas && linea[i + 1] === '"') {
            i += 1;
          } else {
            enComillas = !enComillas;
          }
        } else if (!enComillas && ch === delim) {
          count += 1;
        }
      }
      return count;
    });

    const min = Math.min(...conteos);
    const total = conteos.reduce((a, b) => a + b, 0);
    const puntaje = min > 0 ? min * 1000 + total : total;
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejorDelim = delim;
    }
  }

  return mejorDelim;
}

/**
 * Parser CSV/TXT estricto compatible con RFC 4180 (comillas dobles escapadas, saltos de línea embebidos)
 * con límite de seguridad de filas.
 */
export function parsearCsvRfc4180(
  buffer: Buffer,
  delimitador: string | null | undefined,
  codificacion: string | null | undefined,
  filaEncabezado = 1
): FilaTablaCruda[] {
  const texto = decodificarBufferTexto(buffer, codificacion);
  const delim = delimitador && delimitador.length > 0 ? delimitador : detectarDelimitadorCsv(texto);

  const filas: FilaTablaCruda[] = [];
  let filaActual: CeldaTablaCruda[] = [];
  let campoActual = '';
  let enComillas = false;
  let numFila = 1;
  const maxFilasPermitidas = MAX_FILAS_EXTRACTO + Math.max(1, filaEncabezado);

  const cerrarFila = () => {
    filaActual.push({ valor: campoActual });
    campoActual = '';
    const tieneContenido = filaActual.some((c) => c.valor.trim().length > 0);
    if (tieneContenido) {
      if (filas.length >= maxFilasPermitidas) {
        throw new ConciliacionV2Error(
          400,
          'ARCHIVO_EXCEDE_FILAS',
          `El archivo supera el máximo permitido de ${MAX_FILAS_EXTRACTO} filas de movimientos.`
        );
      }
      filas.push({ numFila, celdas: filaActual });
    }
    filaActual = [];
    numFila += 1;
  };

  for (let i = 0; i < texto.length; i += 1) {
    const ch = texto[i];

    if (enComillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campoActual += '"';
          i += 1;
        } else {
          enComillas = false;
        }
      } else {
        campoActual += ch;
      }
      continue;
    }

    if (ch === '"' && campoActual.length === 0) {
      enComillas = true;
      continue;
    }

    if (ch === delim) {
      filaActual.push({ valor: campoActual });
      campoActual = '';
      continue;
    }

    if (ch === '\r') {
      if (texto[i + 1] === '\n') {
        i += 1;
      }
      cerrarFila();
      continue;
    }

    if (ch === '\n') {
      cerrarFila();
      continue;
    }

    campoActual += ch;
  }

  if (campoActual.length > 0 || filaActual.length > 0) {
    cerrarFila();
  }

  return filas;
}

function extraerTextoNodoXml(nodo: unknown): string {
  if (nodo === null || nodo === undefined) {
    return '';
  }
  if (typeof nodo === 'string' || typeof nodo === 'number' || typeof nodo === 'boolean') {
    return String(nodo);
  }
  if (Array.isArray(nodo)) {
    return nodo.map(extraerTextoNodoXml).join('');
  }
  if (typeof nodo === 'object') {
    const obj = nodo as Record<string, unknown>;
    if ('#text' in obj) {
      return String(obj['#text'] ?? '');
    }
    if ('t' in obj) {
      return extraerTextoNodoXml(obj.t);
    }
    if ('r' in obj) {
      return extraerTextoNodoXml(obj.r);
    }
  }
  return '';
}

function resolverRutaHojaXlsx(zip: AdmZip, parser: XMLParser): string {
  const wbEntry = zip.getEntry('xl/workbook.xml');
  if (!wbEntry) {
    throw new ConciliacionV2Error(400, 'XLSX_SIN_WORKBOOK', 'Falta xl/workbook.xml en el archivo .xlsx.');
  }

  const wbXml = parser.parse(wbEntry.getData().toString('utf8'));
  const sheetsRaw = wbXml?.workbook?.sheets?.sheet;
  const sheets = Array.isArray(sheetsRaw) ? sheetsRaw : sheetsRaw ? [sheetsRaw] : [];
  if (sheets.length === 0) {
    throw new ConciliacionV2Error(400, 'XLSX_SIN_HOJAS', 'El libro .xlsx no contiene hojas de cálculo.');
  }

  const primeraHoja = sheets[0];
  const rId = primeraHoja?.['@_r:id'];

  const relsEntry = zip.getEntry('xl/_rels/workbook.xml.rels');
  if (relsEntry && rId) {
    const relsXml = parser.parse(relsEntry.getData().toString('utf8'));
    const relsRaw = relsXml?.Relationships?.Relationship;
    const rels = Array.isArray(relsRaw) ? relsRaw : relsRaw ? [relsRaw] : [];
    const rel = rels.find((r: any) => r?.['@_Id'] === rId);
    const target = rel?.['@_Target'];
    if (typeof target === 'string' && !target.includes('..')) {
      const limpia = target.startsWith('/') ? target.slice(1) : target.startsWith('xl/') ? target : `xl/${target}`;
      if (zip.getEntry(limpia)) {
        return limpia;
      }
    }
  }

  if (zip.getEntry('xl/worksheets/sheet1.xml')) {
    return 'xl/worksheets/sheet1.xml';
  }

  const fallback = zip
    .getEntries()
    .find((e) => !e.isDirectory && /^xl\/worksheets\/sheet\d+\.xml$/i.test(e.entryName));
  if (!fallback) {
    throw new ConciliacionV2Error(400, 'XLSX_SIN_HOJAS', 'No se encontró ninguna hoja worksheet válida en el .xlsx.');
  }
  return fallback.entryName;
}

/**
 * Parser seguro de archivos `.xlsx` basado en `adm-zip` y `fast-xml-parser`.
 * Nunca evalúa fórmulas `<f>`: lee solo valores literales o marca celdas con fórmula sin valor.
 */
export function parsearXlsxSeguro(buffer: Buffer, filaEncabezado = 1): FilaTablaCruda[] {
  const zip = new AdmZip(buffer);
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: false,
    htmlEntities: true,
    isArray: (nombre) => ['sheet', 'Relationship', 'row', 'c', 'si', 'r'].includes(nombre),
  });

  // SharedStrings opcional
  const sharedStrings: string[] = [];
  const ssEntry = zip.getEntry('xl/sharedStrings.xml');
  if (ssEntry) {
    const ssXml = parser.parse(ssEntry.getData().toString('utf8'));
    const items = ssXml?.sst?.si;
    if (Array.isArray(items)) {
      for (const si of items) {
        sharedStrings.push(extraerTextoNodoXml(si));
      }
    }
  }

  const rutaHoja = resolverRutaHojaXlsx(zip, parser);
  const sheetEntry = zip.getEntry(rutaHoja);
  if (!sheetEntry) {
    throw new ConciliacionV2Error(400, 'XLSX_SIN_HOJAS', 'No se pudo leer la hoja principal del archivo .xlsx.');
  }

  const sheetXml = parser.parse(sheetEntry.getData().toString('utf8'));
  const rowsRaw = sheetXml?.worksheet?.sheetData?.row;
  const rows = Array.isArray(rowsRaw) ? rowsRaw : rowsRaw ? [rowsRaw] : [];
  const maxFilasPermitidas = MAX_FILAS_EXTRACTO + Math.max(1, filaEncabezado);

  const filas: FilaTablaCruda[] = [];

  for (let rIdx = 0; rIdx < rows.length; rIdx += 1) {
    const rowObj = rows[rIdx];
    const numFila = rowObj?.['@_r'] ? Number(rowObj['@_r']) : rIdx + 1;
    const cellsRaw = Array.isArray(rowObj?.c) ? rowObj.c : rowObj?.c ? [rowObj.c] : [];
    const celdas: CeldaTablaCruda[] = [];
    let siguienteIndiceFallback = 0;

    for (const cell of cellsRaw) {
      const ref = typeof cell?.['@_r'] === 'string' ? cell['@_r'] : '';
      const colMatch = /^([A-Z]+)\d+$/i.exec(ref);
      const colIdx = colMatch ? letraColumnaAIndice(colMatch[1]) : siguienteIndiceFallback;
      siguienteIndiceFallback = colIdx + 1;

      while (celdas.length <= colIdx) {
        celdas.push({ valor: '' });
      }

      const tipo = cell?.['@_t'];
      const tieneFormula = cell?.f !== undefined;
      const valorRaw = cell?.v;
      const inlineRaw = cell?.is;

      if (tieneFormula && valorRaw === undefined && inlineRaw === undefined) {
        celdas[colIdx] = { valor: '', esFormulaSinValor: true };
        continue;
      }

      if (tipo === 's') {
        const sIdx = Number(valorRaw);
        const text = Number.isInteger(sIdx) && sIdx >= 0 && sIdx < sharedStrings.length ? sharedStrings[sIdx] : '';
        celdas[colIdx] = { valor: text };
      } else if (tipo === 'inlineStr') {
        celdas[colIdx] = { valor: extraerTextoNodoXml(inlineRaw) };
      } else if (tipo === 'str') {
        celdas[colIdx] = { valor: valorRaw !== undefined ? String(valorRaw) : '' };
      } else if (tipo === 'b') {
        celdas[colIdx] = { valor: valorRaw === '1' || valorRaw === 'true' ? 'TRUE' : 'FALSE' };
      } else if (tipo === 'e') {
        celdas[colIdx] = { valor: '' };
      } else {
        // t === 'n' o undefined: valor numérico literal en XML
        const text = valorRaw !== undefined && valorRaw !== null ? String(valorRaw) : '';
        celdas[colIdx] = {
          valor: text,
          esNumericoXml: text.length > 0 && /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text.trim()),
        };
      }
    }

    const tieneContenido = celdas.some((c) => c.valor.trim().length > 0 || c.esFormulaSinValor);
    if (tieneContenido) {
      if (filas.length >= maxFilasPermitidas) {
        throw new ConciliacionV2Error(
          400,
          'ARCHIVO_EXCEDE_FILAS',
          `El archivo .xlsx supera el máximo permitido de ${MAX_FILAS_EXTRACTO} filas de movimientos.`
        );
      }
      filas.push({ numFila, celdas });
    }
  }

  return filas;
}

const REGEX_INICIO_FECHA_PDF = /^(\d{2}[/-]\d{2}[/-]\d{2,4}|\d{4}[/-]\d{2}[/-]\d{2})\b/;
const REGEX_MONTO_TOKEN_PDF = /^(?:\(?(?:S\/\.?|PEN|USD|\$)?\s*[+-]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})[+-]?\)?|\(?(?:S\/\.?|PEN|USD|\$)?\s*[+-]?\d+(?:[.,]\d{2})[+-]?\)?)$/i;

/**
 * Parsea líneas extraídas de un PDF bancario tabular sin OCR en filas estructuradas de extracto.
 */
export function parsearPdfExtracto(
  buffer: Buffer,
  opciones: Pick<OpcionesParseoExtracto, 'formatoFecha' | 'separadorDecimal' | 'adaptadorPdf'>
): FilaExtractoParseada[] {
  const adaptador = opciones.adaptadorPdf ?? obtenerAdaptadorPdfTexto();
  const lineasTexto = adaptador.extraerLineasTexto(buffer);
  const formatoFecha = opciones.formatoFecha ?? 'DD/MM/YYYY';
  const sepDecimal = opciones.separadorDecimal ?? '.';

  let abonoAntesCargo = false;
  for (const linea of lineasTexto.slice(0, 25)) {
    const norm = normalizarNombreColumna(linea);
    const idxAbono = norm.indexOf('abono');
    const idxCargo = norm.indexOf('cargo');
    const idxHaber = norm.indexOf('haber');
    const idxDebe = norm.indexOf('debe');
    if (idxAbono !== -1 && idxCargo !== -1) {
      abonoAntesCargo = idxAbono < idxCargo;
      break;
    }
    if (idxHaber !== -1 && idxDebe !== -1) {
      abonoAntesCargo = idxHaber < idxDebe;
      break;
    }
  }

  const filas: FilaExtractoParseada[] = [];

  for (let idx = 0; idx < lineasTexto.length; idx += 1) {
    const linea = lineasTexto[idx].trim();
    if (!linea) {
      continue;
    }

    const matchFecha = REGEX_INICIO_FECHA_PDF.exec(linea);
    if (!matchFecha) {
      continue;
    }

    if (filas.length >= MAX_FILAS_EXTRACTO) {
      throw new ConciliacionV2Error(
        400,
        'ARCHIVO_EXCEDE_FILAS',
        `El archivo PDF supera el máximo permitido de ${MAX_FILAS_EXTRACTO} filas de movimientos.`
      );
    }

    const numFila = idx + 1;
    const fechaRaw = matchFecha[1];
    const fecha = normalizarFechaExtracto(fechaRaw, formatoFecha);
    let resto = linea.slice(fechaRaw.length).trim();

    // Si hay una segunda fecha (fecha valor) inmediatamente después, omitirla de la glosa
    const matchSegundaFecha = REGEX_INICIO_FECHA_PDF.exec(resto);
    if (matchSegundaFecha) {
      resto = resto.slice(matchSegundaFecha[1].length).trim();
    }

    const tokens = resto.split(/\s+/).filter((t) => t.length > 0);
    const montosAlFinal: string[] = [];
    while (tokens.length > 0 && montosAlFinal.length < 3) {
      const ultimo = tokens[tokens.length - 1];
      if (REGEX_MONTO_TOKEN_PDF.test(ultimo)) {
        montosAlFinal.unshift(tokens.pop()!);
      } else {
        break;
      }
    }

    let referencia: string | null = null;
    if (tokens.length >= 2) {
      const posibleRef = tokens[tokens.length - 1];
      if (/^(?:[A-Z]{1,4}-?\d{2,}|\d{4,})$/i.test(posibleRef) && !/^(?:RUC|ITF)$/i.test(posibleRef)) {
        referencia = tokens.pop()!;
      }
    }

    const descripcion = tokens.join(' ').trim();
    const errores: ErrorParseoFila[] = [];

    if (!fecha) {
      errores.push({
        codigo: 'FECHA_INVALIDA',
        campo: 'fecha',
        mensaje: `Fecha inválida en la fila ${numFila}: "${fechaRaw}".`,
        valor: fechaRaw,
      });
    }
    if (!descripcion) {
      errores.push({
        codigo: 'DESCRIPCION_VACIA',
        campo: 'descripcion',
        mensaje: `La fila ${numFila} no tiene descripción válida.`,
        valor: null,
      });
    }

    let monto: string | null = null;
    let saldo: string | null = null;

    if (montosAlFinal.length === 1) {
      monto = normalizarMontoExtracto(montosAlFinal[0], sepDecimal);
    } else if (montosAlFinal.length === 2) {
      monto = normalizarMontoExtracto(montosAlFinal[0], sepDecimal);
      saldo = normalizarMontoExtracto(montosAlFinal[1], sepDecimal);
    } else if (montosAlFinal.length === 3) {
      const first = normalizarMontoExtracto(montosAlFinal[0], sepDecimal);
      const second = normalizarMontoExtracto(montosAlFinal[1], sepDecimal);
      saldo = normalizarMontoExtracto(montosAlFinal[2], sepDecimal);
      if (first !== null && second !== null) {
        const abonoStr = abonoAntesCargo ? first : second;
        const cargoStr = abonoAntesCargo ? second : first;
        const neto = Money.sub(Money.create(abonoStr).abs(), Money.create(cargoStr).abs());
        monto = Money.isEqual(neto, 0) ? '0.00' : Money.format(neto);
      }
    }

    if (monto === null) {
      errores.push({
        codigo: 'MONTO_VACIO_O_INVALIDO',
        campo: 'monto',
        mensaje: `La fila ${numFila} no contiene un monto válido.`,
        valor: montosAlFinal.join(' ') || null,
      });
    }

    filas.push({
      numFila,
      fecha,
      descripcion,
      referencia,
      monto,
      saldo,
      rawJson: {
        lineaOriginal: linea,
        fechaRaw,
        descripcion,
        referencia,
        montosDetectados: montosAlFinal,
      },
      errores,
    });
  }

  return filas;
}

function resolverIndiceColumna(
  refColumna: string | number | null | undefined,
  encabezadosNorm: string[],
  aliasesAlternativos: string[] = []
): number | null {
  if (refColumna === null || refColumna === undefined) {
    return null;
  }
  if (typeof refColumna === 'number') {
    return Number.isInteger(refColumna) && refColumna >= 0 ? refColumna : null;
  }

  const texto = refColumna.trim();
  if (!texto) {
    return null;
  }

  if (/^\d+$/.test(texto)) {
    const idx = Number(texto);
    return idx >= 0 ? idx : null;
  }

  const buscadoNorm = normalizarNombreColumna(texto);
  const idxExacto = encabezadosNorm.findIndex((h) => h === buscadoNorm);
  if (idxExacto !== -1) {
    return idxExacto;
  }

  for (const alias of aliasesAlternativos) {
    const aliasNorm = normalizarNombreColumna(alias);
    const idxAlias = encabezadosNorm.findIndex((h) => h === aliasNorm || h.includes(aliasNorm));
    if (idxAlias !== -1) {
      return idxAlias;
    }
  }

  // Coincidencia parcial segura por contención de nombre de encabezado
  const idxParcial = encabezadosNorm.findIndex(
    (h) => h.length > 0 && (h.includes(buscadoNorm) || buscadoNorm.includes(h))
  );
  if (idxParcial !== -1) {
    return idxParcial;
  }

  // Fallback a letra de columna Excel (A, B, ..., AA)
  if (/^[A-Z]{1,3}$/i.test(texto)) {
    return letraColumnaAIndice(texto);
  }

  return null;
}

function resolverIndiceAutomatico(
  encabezadosNorm: string[],
  candidatos: string[]
): number | null {
  for (const cand of candidatos) {
    const norm = normalizarNombreColumna(cand);
    const idx = encabezadosNorm.findIndex((h) => h === norm || h.includes(norm));
    if (idx !== -1) {
      return idx;
    }
  }
  return null;
}

/**
 * Parsea un archivo de extracto (`XLSX`, `CSV`, `TXT`, `PDF`) aplicando el perfil de banco
 * o mapeo de columnas y normalizando fechas y montos con `Money`.
 */
export function parsearExtractoBancario(
  buffer: Buffer,
  opciones: OpcionesParseoExtracto
): FilaExtractoParseada[] {
  if (opciones.formatoArchivo === 'PDF') {
    return parsearPdfExtracto(buffer, opciones);
  }

  const filaEncabezado = Math.max(1, opciones.filaEncabezado ?? 1);
  const formatoFecha = opciones.formatoFecha ?? 'DD/MM/YYYY';
  const sepDecimal: '.' | ',' = opciones.separadorDecimal ?? '.';

  const filasCrudas =
    opciones.formatoArchivo === 'XLSX'
      ? parsearXlsxSeguro(buffer, filaEncabezado)
      : parsearCsvRfc4180(buffer, opciones.delimitador, opciones.codificacion, filaEncabezado);

  if (filasCrudas.length === 0) {
    return [];
  }

  const idxEncabezado = filasCrudas.findIndex((f) => f.numFila >= filaEncabezado);
  if (idxEncabezado === -1) {
    return [];
  }

  const filaHeader = filasCrudas[idxEncabezado];
  const encabezadosRaw = filaHeader.celdas.map((c) => c.valor.trim());
  const encabezadosNorm = encabezadosRaw.map(normalizarNombreColumna);
  const filasDatos = filasCrudas.slice(idxEncabezado + 1);

  if (filasDatos.length > MAX_FILAS_EXTRACTO) {
    throw new ConciliacionV2Error(
      400,
      'ARCHIVO_EXCEDE_FILAS',
      `El archivo supera el máximo permitido de ${MAX_FILAS_EXTRACTO} filas de movimientos.`
    );
  }

  const mapeo = opciones.mapeoColumnas;
  const idxFecha =
    resolverIndiceColumna(mapeo?.fecha, encabezadosNorm, ['fecha', 'fecha operacion', 'fecha de operacion', 'fecha mov']) ??
    resolverIndiceAutomatico(encabezadosNorm, ['fecha operacion', 'fecha de operacion', 'fecha mov', 'fecha']);

  const idxDescripcion =
    resolverIndiceColumna(mapeo?.descripcion, encabezadosNorm, ['descripcion operacion', 'descripcion', 'glosa', 'concepto', 'detalle']) ??
    resolverIndiceAutomatico(encabezadosNorm, ['descripcion operacion', 'descripcion', 'glosa', 'concepto', 'detalle']);

  const idxReferencia =
    resolverIndiceColumna(mapeo?.referencia, encabezadosNorm, ['nro operacion', 'nro de operacion', 'numero operacion', 'referencia', 'documento', 'nro documento']) ??
    resolverIndiceAutomatico(encabezadosNorm, ['nro operacion', 'nro de operacion', 'numero operacion', 'referencia', 'documento', 'nro documento']);

  const idxMonto =
    resolverIndiceColumna(mapeo?.monto, encabezadosNorm, ['monto', 'importe', 'valor']) ??
    resolverIndiceAutomatico(encabezadosNorm, ['monto', 'importe']);

  const idxAbono =
    resolverIndiceColumna(mapeo?.abono, encabezadosNorm, ['abono', 'abonos', 'credito', 'haber', 'ingreso']) ??
    resolverIndiceAutomatico(encabezadosNorm, ['abono', 'abonos', 'credito', 'haber']);

  const idxCargo =
    resolverIndiceColumna(mapeo?.cargo, encabezadosNorm, ['cargo', 'cargos', 'debito', 'debe', 'egreso']) ??
    resolverIndiceAutomatico(encabezadosNorm, ['cargo', 'cargos', 'debito', 'debe']);

  const idxSaldo =
    resolverIndiceColumna(mapeo?.saldo, encabezadosNorm, ['saldo', 'saldo contable', 'saldo disponible']) ??
    resolverIndiceAutomatico(encabezadosNorm, ['saldo contable', 'saldo disponible', 'saldo']);

  const usarAbonoCargo = idxAbono !== null && idxCargo !== null && (mapeo?.abono !== undefined || mapeo?.cargo !== undefined || idxMonto === null);
  const signoCargoNegativo = mapeo?.signoCargoNegativo ?? true;

  if (idxFecha === null || idxDescripcion === null || (idxMonto === null && !usarAbonoCargo)) {
    throw new ConciliacionV2Error(
      400,
      'MAPEO_COLUMNAS_INVALIDO',
      'No se pudieron identificar las columnas obligatorias (fecha, descripción y monto o abono/cargo) en el encabezado del archivo.'
    );
  }

  return filasDatos.map((fila) => {
    const rawJson: Record<string, unknown> = {};
    fila.celdas.forEach((celda, colIdx) => {
      const nombreCol = encabezadosRaw[colIdx] || `col_${colIdx + 1}`;
      rawJson[nombreCol] = celda.esFormulaSinValor ? '[FORMULA_SIN_VALOR]' : celda.valor;
    });

    const celdaFecha = fila.celdas[idxFecha];
    const celdaDesc = fila.celdas[idxDescripcion];
    const celdaRef = idxReferencia !== null ? fila.celdas[idxReferencia] : undefined;
    const celdaSaldo = idxSaldo !== null ? fila.celdas[idxSaldo] : undefined;

    const errores: ErrorParseoFila[] = [];

    const fechaRaw = celdaFecha?.valor?.trim() ?? '';
    const fecha = normalizarFechaExtracto(fechaRaw, formatoFecha);
    if (!fecha) {
      errores.push({
        codigo: 'FECHA_INVALIDA',
        campo: 'fecha',
        mensaje: `Fila ${fila.numFila}: fecha inválida o vacía ("${fechaRaw}").`,
        valor: fechaRaw || null,
      });
    }

    const descripcion = (celdaDesc?.valor ?? '').trim();
    if (!descripcion) {
      errores.push({
        codigo: 'DESCRIPCION_VACIA',
        campo: 'descripcion',
        mensaje: `Fila ${fila.numFila}: la descripción es obligatoria.`,
        valor: null,
      });
    }

    const referencia = celdaRef?.valor?.trim() ? celdaRef.valor.trim().slice(0, 100) : null;

    let monto: string | null = null;
    if (usarAbonoCargo && idxAbono !== null && idxCargo !== null) {
      const cAbono = fila.celdas[idxAbono];
      const cCargo = fila.celdas[idxCargo];

      if (cAbono?.esFormulaSinValor || cCargo?.esFormulaSinValor) {
        errores.push({
          codigo: 'FORMULA_NO_PERMITIDA_SIN_VALOR',
          campo: 'monto',
          mensaje: `Fila ${fila.numFila}: celda financiera contiene fórmula sin valor literal.`,
          valor: null,
        });
      } else {
        const abonoStr = cAbono?.valor?.trim() ?? '';
        const cargoStr = cCargo?.valor?.trim() ?? '';
        const abonoNorm = abonoStr ? normalizarMontoExtracto(abonoStr, sepDecimal, cAbono?.esNumericoXml) : '0.00';
        const cargoNorm = cargoStr ? normalizarMontoExtracto(cargoStr, sepDecimal, cCargo?.esNumericoXml) : '0.00';

        if ((!abonoStr && !cargoStr) || abonoNorm === null || cargoNorm === null) {
          errores.push({
            codigo: 'MONTO_VACIO_O_INVALIDO',
            campo: 'monto',
            mensaje: `Fila ${fila.numFila}: abono/cargo vacío o inválido.`,
            valor: `${abonoStr}|${cargoStr}`,
          });
        } else {
          const abonoDec = Money.create(abonoNorm).abs();
          const cargoDec = Money.create(cargoNorm).abs();
          const neto = Money.sub(abonoDec, cargoDec);
          monto = Money.isEqual(neto, 0) ? '0.00' : Money.format(neto);
        }
      }
    } else if (idxMonto !== null) {
      const cMonto = fila.celdas[idxMonto];
      if (cMonto?.esFormulaSinValor) {
        errores.push({
          codigo: 'FORMULA_NO_PERMITIDA_SIN_VALOR',
          campo: 'monto',
          mensaje: `Fila ${fila.numFila}: celda de monto contiene fórmula sin valor literal.`,
          valor: null,
        });
      } else {
        const montoRaw = cMonto?.valor?.trim() ?? '';
        const montoNorm = normalizarMontoExtracto(montoRaw, sepDecimal, cMonto?.esNumericoXml);
        if (montoNorm === null) {
          errores.push({
            codigo: 'MONTO_VACIO_O_INVALIDO',
            campo: 'monto',
            mensaje: `Fila ${fila.numFila}: monto vacío o inválido ("${montoRaw}").`,
            valor: montoRaw || null,
          });
        } else if (!signoCargoNegativo) {
          const invertido = Money.create(montoNorm).negated();
          monto = Money.isEqual(invertido, 0) ? '0.00' : Money.format(invertido);
        } else {
          monto = montoNorm;
        }
      }
    }

    let saldo: string | null = null;
    if (celdaSaldo) {
      if (celdaSaldo.esFormulaSinValor) {
        errores.push({
          codigo: 'FORMULA_NO_PERMITIDA_SIN_VALOR',
          campo: 'saldo',
          mensaje: `Fila ${fila.numFila}: celda de saldo contiene fórmula sin valor literal.`,
          valor: null,
        });
      } else {
        const saldoRaw = celdaSaldo.valor.trim();
        if (saldoRaw.length > 0) {
          saldo = normalizarMontoExtracto(saldoRaw, sepDecimal, celdaSaldo.esNumericoXml);
          if (saldo === null) {
            errores.push({
              codigo: 'SALDO_INVALIDO',
              campo: 'saldo',
              mensaje: `Fila ${fila.numFila}: saldo inválido ("${saldoRaw}").`,
              valor: saldoRaw,
            });
          }
        }
      }
    }

    return {
      numFila: fila.numFila,
      fecha,
      descripcion,
      referencia,
      monto,
      saldo,
      rawJson,
      errores,
    };
  });
}
