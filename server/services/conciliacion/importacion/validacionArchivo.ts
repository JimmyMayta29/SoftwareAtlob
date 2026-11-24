import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import { FormatoExtractoV2 } from '../../../types/conciliacionV2';
import { ConciliacionV2Error } from '../../conciliacionV2Service';

export const MAX_BYTES_EXTRACTO = 5 * 1024 * 1024; // 5 MB
export const MAX_FILAS_EXTRACTO = 10_000;
export const MAX_ENTRADAS_ZIP = 100;
export const MAX_DESCOMPRIMIDO_ZIP = 25 * 1024 * 1024; // 25 MB
export const MAX_RATIO_ZIP = 50;

const EXT_A_FORMATO: Record<string, FormatoExtractoV2> = {
  '.xlsx': 'XLSX',
  '.csv': 'CSV',
  '.txt': 'TXT',
  '.pdf': 'PDF',
};

const CONTENT_TYPES_PERMITIDOS: Record<FormatoExtractoV2, ReadonlySet<string>> = {
  XLSX: new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
  ]),
  CSV: new Set([
    'text/csv',
    'application/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/octet-stream',
  ]),
  TXT: new Set([
    'text/plain',
    'text/csv',
    'application/octet-stream',
  ]),
  PDF: new Set([
    'application/pdf',
    'application/octet-stream',
  ]),
};

const BASE64_CHARS_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;
const PDF_TOKEN_PROHIBIDO_REGEX = /\/(?:javascript|js|launch|embeddedfile|richmedia|xfa)(?=[^a-z0-9]|$)/i;
const XML_DECLARACION_PROHIBIDA_REGEX = /<!DOCTYPE|<!ENTITY/i;

export interface EntradaValidacionArchivo {
  nombreArchivo: string;
  contentType?: string | null;
  contenidoBase64: string;
}

export interface ResultadoValidacionArchivo {
  buffer: Buffer;
  formatoArchivo: FormatoExtractoV2;
  hashArchivo: string;
  tamanoBytes: number;
  nombreArchivoNormalizado: string;
  contentTypeNormalizado: string | null;
}

function obtenerExtension(nombreArchivo: string): string {
  const limpio = nombreArchivo.trim().toLowerCase();
  const ultimoPunto = limpio.lastIndexOf('.');
  if (ultimoPunto <= 0 || ultimoPunto === limpio.length - 1) {
    return '';
  }
  return limpio.slice(ultimoPunto);
}

function normalizarContentType(contentType?: string | null): string | null {
  if (!contentType || typeof contentType !== 'string') {
    return null;
  }
  const base = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return base.length > 0 ? base : null;
}

function detectarFirmaBinaria(buffer: Buffer): 'ZIP' | 'PDF' | 'ELF' | 'PE' | 'OLE2' | null {
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return 'ZIP';
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'PDF';
  }
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return 'ELF';
  }
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return 'PE';
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    return 'OLE2';
  }
  return null;
}

/**
 * Decodifica contenido Base64 aplicando límite estricto de tamaño antes y después de decodificar.
 */
export function decodificarBase64Seguro(contenidoBase64: string): Buffer {
  if (typeof contenidoBase64 !== 'string') {
    throw new ConciliacionV2Error(400, 'ARCHIVO_VACIO', 'El contenido del archivo en base64 es obligatorio.');
  }

  let limpio = contenidoBase64.trim();
  const dataUriIdx = limpio.indexOf(';base64,');
  if (limpio.startsWith('data:') && dataUriIdx !== -1) {
    limpio = limpio.slice(dataUriIdx + ';base64,'.length);
  }
  limpio = limpio.replace(/\s+/g, '');

  if (limpio.length === 0) {
    throw new ConciliacionV2Error(400, 'ARCHIVO_VACIO', 'El archivo proporcionado está vacío.');
  }

  // Límite previo aproximado antes de asignar Buffer (4 chars base64 = 3 bytes).
  const maxBase64Chars = Math.ceil(MAX_BYTES_EXTRACTO / 3) * 4;
  if (limpio.length > maxBase64Chars) {
    throw new ConciliacionV2Error(
      400,
      'ARCHIVO_EXCEDE_TAMANO',
      `El archivo excede el tamaño máximo permitido de ${MAX_BYTES_EXTRACTO} bytes (5 MB).`
    );
  }

  if (limpio.length % 4 !== 0 || !BASE64_CHARS_REGEX.test(limpio)) {
    throw new ConciliacionV2Error(400, 'BASE64_INVALIDO', 'El contenido base64 del archivo no tiene un formato válido.');
  }

  const buffer = Buffer.from(limpio, 'base64');
  if (buffer.length === 0) {
    throw new ConciliacionV2Error(400, 'ARCHIVO_VACIO', 'El archivo decodificado está vacío.');
  }
  if (buffer.length > MAX_BYTES_EXTRACTO) {
    throw new ConciliacionV2Error(
      400,
      'ARCHIVO_EXCEDE_TAMANO',
      `El archivo excede el tamaño máximo permitido de ${MAX_BYTES_EXTRACTO} bytes (5 MB).`
    );
  }

  return buffer;
}

function esRutaZipInsegura(entryName: string): boolean {
  if (!entryName || entryName.includes('\0')) {
    return true;
  }
  if (entryName.startsWith('/') || entryName.startsWith('\\') || /^[a-zA-Z]:/.test(entryName)) {
    return true;
  }
  const segmentos = entryName.split(/[\\/]+/);
  return segmentos.some((seg) => seg === '..');
}

function validarXlsxSeguro(buffer: Buffer): void {
  const firma = detectarFirmaBinaria(buffer);
  if (firma !== 'ZIP') {
    throw new ConciliacionV2Error(
      400,
      'FIRMA_ARCHIVO_INVALIDA',
      'El archivo .xlsx no posee una firma binaria ZIP/XLSX válida (PK\\x03\\x04).'
    );
  }

  let zip: AdmZip;
  let entries: AdmZip.IZipEntry[];
  try {
    zip = new AdmZip(buffer);
    entries = zip.getEntries();
  } catch {
    throw new ConciliacionV2Error(
      400,
      'ARCHIVO_XLSX_CORRUPTO',
      'No se pudo abrir el contenedor ZIP del archivo .xlsx.'
    );
  }

  if (entries.length === 0) {
    throw new ConciliacionV2Error(400, 'ARCHIVO_XLSX_CORRUPTO', 'El archivo .xlsx no contiene entradas internas.');
  }

  if (entries.length > MAX_ENTRADAS_ZIP) {
    throw new ConciliacionV2Error(
      400,
      'ZIP_BOMB_DETECTADO',
      `El archivo .xlsx supera el máximo permitido de ${MAX_ENTRADAS_ZIP} entradas ZIP.`
    );
  }

  let totalDeclarado = 0;
  let totalDescomprimidoReal = 0;
  let tieneWorkbook = false;

  for (const entry of entries) {
    const nombre = entry.entryName;
    if (esRutaZipInsegura(nombre)) {
      throw new ConciliacionV2Error(
        400,
        'ZIP_PATH_TRAVERSAL_DETECTADO',
        `El archivo .xlsx contiene una ruta interna insegura: "${nombre}".`
      );
    }

    const nombreLower = nombre.toLowerCase();
    if (nombreLower.includes('vbaproject.bin') || nombreLower.endsWith('.xlsm')) {
      throw new ConciliacionV2Error(
        400,
        'XLSX_MACROS_PROHIBIDAS',
        'No se permiten archivos con macros (vbaProject.bin) por seguridad.'
      );
    }

    if (entry.isDirectory) {
      continue;
    }

    const headerSize = Math.max(0, Number(entry.header?.size ?? 0));
    const compressedSize = Math.max(0, Number(entry.header?.compressedSize ?? 0));

    totalDeclarado += headerSize;
    if (headerSize > MAX_DESCOMPRIMIDO_ZIP || totalDeclarado > MAX_DESCOMPRIMIDO_ZIP) {
      throw new ConciliacionV2Error(
        400,
        'ZIP_BOMB_DETECTADO',
        'El archivo .xlsx supera el límite máximo de 25 MB descomprimidos.'
      );
    }

    if (compressedSize > 0 && headerSize / compressedSize > MAX_RATIO_ZIP) {
      throw new ConciliacionV2Error(
        400,
        'ZIP_BOMB_DETECTADO',
        'El archivo .xlsx supera el ratio máximo de compresión permitido (50:1).'
      );
    }
    if (compressedSize === 0 && headerSize > 0) {
      throw new ConciliacionV2Error(
        400,
        'ZIP_BOMB_DETECTADO',
        'El archivo .xlsx contiene metadatos de compresión inválidos.'
      );
    }

    let data: Buffer;
    try {
      data = entry.getData();
    } catch {
      throw new ConciliacionV2Error(
        400,
        'ARCHIVO_XLSX_CORRUPTO',
        `No se pudo descomprimir la entrada interna "${nombre}" del archivo .xlsx.`
      );
    }

    totalDescomprimidoReal += data.length;
    if (data.length > MAX_DESCOMPRIMIDO_ZIP || totalDescomprimidoReal > MAX_DESCOMPRIMIDO_ZIP) {
      throw new ConciliacionV2Error(
        400,
        'ZIP_BOMB_DETECTADO',
        'El tamaño real descomprimido del .xlsx supera el límite de 25 MB.'
      );
    }

    if (compressedSize > 0 && data.length / compressedSize > MAX_RATIO_ZIP) {
      throw new ConciliacionV2Error(
        400,
        'ZIP_BOMB_DETECTADO',
        'El ratio real de descompresión del archivo .xlsx supera el límite permitido (50:1).'
      );
    }
    if (compressedSize === 0 && data.length > 0) {
      throw new ConciliacionV2Error(
        400,
        'ZIP_BOMB_DETECTADO',
        'El archivo .xlsx contiene una entrada inconsistente sin tamaño comprimido.'
      );
    }

    if (nombreLower === 'xl/workbook.xml') {
      tieneWorkbook = true;
    }

    if (nombreLower.endsWith('.xml') || nombreLower.endsWith('.rels')) {
      const xmlText = data.toString('utf8');
      if (XML_DECLARACION_PROHIBIDA_REGEX.test(xmlText)) {
        throw new ConciliacionV2Error(
          400,
          'XML_ENTIDAD_PROHIBIDA',
          `El XML interno "${nombre}" contiene declaraciones DOCTYPE/ENTITY prohibidas.`
        );
      }
      if (
        nombreLower === '[content_types].xml' &&
        xmlText.toLowerCase().includes('vnd.ms-excel.sheet.macroenabled')
      ) {
        throw new ConciliacionV2Error(
          400,
          'XLSX_MACROS_PROHIBIDAS',
          'No se permiten libros habilitados para macros.'
        );
      }
    }
  }

  if (!tieneWorkbook) {
    throw new ConciliacionV2Error(
      400,
      'XLSX_SIN_WORKBOOK',
      'El archivo .xlsx no contiene la estructura obligatoria xl/workbook.xml.'
    );
  }
}

function validarPdfSeguro(buffer: Buffer): void {
  const firma = detectarFirmaBinaria(buffer);
  if (firma !== 'PDF') {
    throw new ConciliacionV2Error(
      400,
      'FIRMA_ARCHIVO_INVALIDA',
      'El archivo .pdf no posee una cabecera %PDF- válida.'
    );
  }

  const contenidoLatin1 = buffer.toString('latin1');
  if (PDF_TOKEN_PROHIBIDO_REGEX.test(contenidoLatin1)) {
    throw new ConciliacionV2Error(
      400,
      'PDF_CONTENIDO_PROHIBIDO',
      'El archivo PDF contiene directivas activas o incrustadas prohibidas (/JavaScript, /JS, /Launch, /EmbeddedFile, /RichMedia o /XFA).'
    );
  }
}

function validarTextoPlanoSeguro(buffer: Buffer, formato: 'CSV' | 'TXT'): void {
  // Saltar posible BOM UTF-8 antes de inspeccionar firma
  const sinBom =
    buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
      ? buffer.subarray(3)
      : buffer;

  const firma = detectarFirmaBinaria(buffer) ?? detectarFirmaBinaria(sinBom);
  if (firma !== null) {
    throw new ConciliacionV2Error(
      400,
      'FIRMA_ARCHIVO_INVALIDA',
      `El archivo .${formato.toLowerCase()} posee una firma binaria (${firma}) incompatible con su extensión.`
    );
  }

  if (buffer.includes(0x00)) {
    throw new ConciliacionV2Error(
      400,
      'ARCHIVO_BINARIO_NO_PERMITIDO',
      `El archivo .${formato.toLowerCase()} contiene bytes NUL (0x00) incompatibles con texto plano.`
    );
  }
}

/**
 * Valida extensión, Content-Type declarado, tamaño máximo, magic bytes y protecciones
 * estructurales (zip-bomb, macros, XXE, directivas activas PDF) antes de cualquier parseo.
 */
export function validarArchivoImportacion(entrada: EntradaValidacionArchivo): ResultadoValidacionArchivo {
  const nombreArchivo = (entrada.nombreArchivo ?? '').trim();
  if (!nombreArchivo) {
    throw new ConciliacionV2Error(400, 'NOMBRE_ARCHIVO_REQUERIDO', 'El nombre del archivo es obligatorio.');
  }

  const extension = obtenerExtension(nombreArchivo);
  if (extension === '.xlsm') {
    throw new ConciliacionV2Error(
      400,
      'XLSX_MACROS_PROHIBIDAS',
      'Los archivos .xlsm con macros están prohibidos. Exporte el extracto como .xlsx, .csv, .txt o .pdf.'
    );
  }

  const formatoArchivo = EXT_A_FORMATO[extension];
  if (!formatoArchivo) {
    throw new ConciliacionV2Error(
      400,
      'FORMATO_NO_SOPORTADO',
      `Extensión de archivo no soportada ("${extension || 'sin extensión'}"). Formatos permitidos: .xlsx, .csv, .txt, .pdf.`
    );
  }

  const contentTypeNormalizado = normalizarContentType(entrada.contentType);
  if (contentTypeNormalizado !== null) {
    const permitidos = CONTENT_TYPES_PERMITIDOS[formatoArchivo];
    if (!permitidos.has(contentTypeNormalizado)) {
      throw new ConciliacionV2Error(
        400,
        'CONTENT_TYPE_INVALIDO',
        `El Content-Type declarado ("${contentTypeNormalizado}") no corresponde al formato ${formatoArchivo}.`
      );
    }
  }

  const buffer = decodificarBase64Seguro(entrada.contenidoBase64);
  const hashArchivo = createHash('sha256').update(buffer).digest('hex');

  if (formatoArchivo === 'XLSX') {
    validarXlsxSeguro(buffer);
  } else if (formatoArchivo === 'PDF') {
    validarPdfSeguro(buffer);
  } else {
    validarTextoPlanoSeguro(buffer, formatoArchivo);
  }

  return {
    buffer,
    formatoArchivo,
    hashArchivo,
    tamanoBytes: buffer.length,
    nombreArchivoNormalizado: nombreArchivo.slice(0, 255),
    contentTypeNormalizado,
  };
}

/**
 * Protege celdas exportadas a CSV/hojas de cálculo contra Formula Injection (CSV/DDE Injection).
 */
export function sanitizarCeldaExportacion(valor: string): string {
  const texto = String(valor ?? '');
  if (texto.length === 0) {
    return '';
  }
  const inicioOriginalPeligroso = /^[=+\-@\t\r]/.test(texto);
  const inicioTrasTrim = /^[=+\-@\t\r]/.test(texto.trimStart());
  if (inicioOriginalPeligroso || inicioTrasTrim) {
    return `'${texto}`;
  }
  return texto;
}
