import zlib from 'node:zlib';
import { ConciliacionV2Error } from '../../conciliacionV2Service';

export const MAX_PDF_STREAM_SALIDA = 16 * 1024 * 1024; // 16 MB
export const MAX_PDF_TOTAL_SALIDA = 32 * 1024 * 1024; // 32 MB
export const MAX_PDF_STREAMS = 200;

export interface AdaptadorPdfTexto {
  extraerLineasTexto(buffer: Buffer): string[];
}

interface FragmentoTextoPdf {
  x: number;
  y: number;
  orden: number;
  texto: string;
}

function esDelimitadorPdf(byte: number): boolean {
  return (
    byte === 0x20 ||
    byte === 0x09 ||
    byte === 0x0a ||
    byte === 0x0d ||
    byte === 0x0c ||
    byte === 0x00 ||
    byte === 0x28 || // (
    byte === 0x29 || // )
    byte === 0x3c || // <
    byte === 0x3e || // >
    byte === 0x5b || // [
    byte === 0x5d || // ]
    byte === 0x7b || // {
    byte === 0x7d || // }
    byte === 0x2f || // /
    byte === 0x25 // %
  );
}

function decodificarCadenaLiteralPdf(bytes: number[]): string {
  const salida: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b === 0x5c && i + 1 < bytes.length) {
      const next = bytes[i + 1];
      if (next === 0x6e) {
        salida.push(0x0a);
        i += 2;
      } else if (next === 0x72) {
        salida.push(0x0d);
        i += 2;
      } else if (next === 0x74) {
        salida.push(0x09);
        i += 2;
      } else if (next === 0x62) {
        salida.push(0x08);
        i += 2;
      } else if (next === 0x66) {
        salida.push(0x0c);
        i += 2;
      } else if (next === 0x0d) {
        i += i + 2 < bytes.length && bytes[i + 2] === 0x0a ? 3 : 2;
      } else if (next === 0x0a) {
        i += 2;
      } else if (next >= 0x30 && next <= 0x37) {
        let octal = String.fromCharCode(next);
        let avance = 2;
        if (i + 2 < bytes.length && bytes[i + 2] >= 0x30 && bytes[i + 2] <= 0x37) {
          octal += String.fromCharCode(bytes[i + 2]);
          avance = 3;
          if (i + 3 < bytes.length && bytes[i + 3] >= 0x30 && bytes[i + 3] <= 0x37) {
            octal += String.fromCharCode(bytes[i + 3]);
            avance = 4;
          }
        }
        salida.push(parseInt(octal, 8) & 0xff);
        i += avance;
      } else {
        salida.push(next);
        i += 2;
      }
    } else {
      salida.push(b);
      i += 1;
    }
  }
  return Buffer.from(salida).toString('latin1');
}

function decodificarCadenaHexPdf(hexRaw: string): string {
  const limpio = hexRaw.replace(/\s+/g, '');
  if (!limpio || !/^[0-9a-fA-F]+$/.test(limpio)) {
    return '';
  }
  const padded = limpio.length % 2 === 1 ? `${limpio}0` : limpio;
  const buf = Buffer.from(padded, 'hex');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    let text = '';
    for (let i = 2; i + 1 < buf.length; i += 2) {
      text += String.fromCharCode((buf[i] << 8) | buf[i + 1]);
    }
    return text;
  }
  if (buf.length >= 4 && buf.length % 2 === 0) {
    let paresCero = 0;
    const totalPares = buf.length / 2;
    for (let i = 0; i < buf.length; i += 2) {
      if (buf[i] === 0x00 && buf[i + 1] >= 0x20) {
        paresCero += 1;
      }
    }
    if (paresCero >= Math.ceil(totalPares * 0.6)) {
      let text = '';
      for (let i = 0; i + 1 < buf.length; i += 2) {
        text += String.fromCharCode((buf[i] << 8) | buf[i + 1]);
      }
      return text;
    }
  }
  return buf.toString('latin1');
}

type TokenPdf =
  | { tipo: 'str'; valor: string }
  | { tipo: 'array'; items: Array<string | number> }
  | { tipo: 'num'; valor: number }
  | { tipo: 'op'; valor: string };

function tokenizarContenidoBtEt(contenido: Buffer): TokenPdf[] {
  const tokens: TokenPdf[] = [];
  const len = contenido.length;
  let i = 0;

  const leerCadenaLiteral = (): string => {
    i += 1; // saltar '('
    const bytes: number[] = [];
    let profundidad = 1;
    while (i < len && profundidad > 0) {
      const b = contenido[i];
      if (b === 0x5c && i + 1 < len) {
        bytes.push(b, contenido[i + 1]);
        i += 2;
        continue;
      }
      if (b === 0x28) {
        profundidad += 1;
        bytes.push(b);
      } else if (b === 0x29) {
        profundidad -= 1;
        if (profundidad > 0) {
          bytes.push(b);
        }
      } else {
        bytes.push(b);
      }
      i += 1;
    }
    return decodificarCadenaLiteralPdf(bytes);
  };

  const leerCadenaHex = (): string => {
    i += 1; // saltar '<'
    const start = i;
    while (i < len && contenido[i] !== 0x3e) {
      i += 1;
    }
    const hex = contenido.subarray(start, i).toString('ascii');
    if (i < len && contenido[i] === 0x3e) {
      i += 1;
    }
    return decodificarCadenaHexPdf(hex);
  };

  while (i < len) {
    const b = contenido[i];

    // Espacios
    if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d || b === 0x0c || b === 0x00) {
      i += 1;
      continue;
    }

    // Comentarios PDF
    if (b === 0x25) {
      while (i < len && contenido[i] !== 0x0a && contenido[i] !== 0x0d) {
        i += 1;
      }
      continue;
    }

    // Cadena literal (...)
    if (b === 0x28) {
      tokens.push({ tipo: 'str', valor: leerCadenaLiteral() });
      continue;
    }

    // Diccionario << ... >> o cadena hex <...>
    if (b === 0x3c) {
      if (i + 1 < len && contenido[i + 1] === 0x3c) {
        i += 2;
        continue;
      }
      tokens.push({ tipo: 'str', valor: leerCadenaHex() });
      continue;
    }

    if (b === 0x3e) {
      i += i + 1 < len && contenido[i + 1] === 0x3e ? 2 : 1;
      continue;
    }

    // Arreglo [...] (principalmente para TJ)
    if (b === 0x5b) {
      i += 1;
      const items: Array<string | number> = [];
      while (i < len && contenido[i] !== 0x5d) {
        const cur = contenido[i];
        if (cur === 0x20 || cur === 0x09 || cur === 0x0a || cur === 0x0d || cur === 0x0c || cur === 0x00) {
          i += 1;
          continue;
        }
        if (cur === 0x28) {
          items.push(leerCadenaLiteral());
          continue;
        }
        if (cur === 0x3c) {
          items.push(leerCadenaHex());
          continue;
        }
        const startNum = i;
        while (i < len && !esDelimitadorPdf(contenido[i])) {
          i += 1;
        }
        const palabra = contenido.subarray(startNum, i).toString('ascii');
        const num = Number(palabra);
        if (!Number.isNaN(num) && palabra.length > 0) {
          items.push(num);
        }
      }
      if (i < len && contenido[i] === 0x5d) {
        i += 1;
      }
      tokens.push({ tipo: 'array', items });
      continue;
    }

    // Nombre /...
    if (b === 0x2f) {
      const start = i;
      i += 1;
      while (i < len && !esDelimitadorPdf(contenido[i])) {
        i += 1;
      }
      tokens.push({ tipo: 'op', valor: contenido.subarray(start, i).toString('ascii') });
      continue;
    }

    // Operadores de un carácter (' o ")
    if (b === 0x27 || b === 0x22) {
      tokens.push({ tipo: 'op', valor: String.fromCharCode(b) });
      i += 1;
      continue;
    }

    // Números u operadores alfabéticos
    const start = i;
    while (i < len && !esDelimitadorPdf(contenido[i])) {
      i += 1;
    }
    const palabra = contenido.subarray(start, i).toString('ascii');
    if (palabra.length === 0) {
      i += 1;
      continue;
    }
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(palabra)) {
      tokens.push({ tipo: 'num', valor: Number(palabra) });
    } else {
      tokens.push({ tipo: 'op', valor: palabra });
    }
  }

  return tokens;
}

function extraerFragmentosDeStream(streamBuffer: Buffer, offsetOrdenBase: number): FragmentoTextoPdf[] {
  const tokens = tokenizarContenidoBtEt(streamBuffer);
  const fragmentos: FragmentoTextoPdf[] = [];

  let enBloqueTexto = false;
  let x = 0;
  let y = 0;
  let lineStartX = 0;
  let leading = 12;
  let orden = offsetOrdenBase;
  const pila: TokenPdf[] = [];

  const popNums = (n: number): number[] => {
    const res: number[] = [];
    for (let k = 0; k < n; k += 1) {
      const t = pila.pop();
      res.unshift(t && t.tipo === 'num' ? t.valor : 0);
    }
    return res;
  };

  const limpiarPila = () => {
    pila.length = 0;
  };

  const agregarFragmento = (texto: string) => {
    const limpio = texto.replace(/\u0000/g, '').trim();
    if (!limpio) {
      return;
    }
    orden += 1;
    fragmentos.push({ x, y, orden, texto: limpio });
  };

  for (const token of tokens) {
    if (token.tipo !== 'op') {
      pila.push(token);
      continue;
    }

    const op = token.valor;
    if (op === 'BT') {
      enBloqueTexto = true;
      x = 0;
      y = 0;
      lineStartX = 0;
      limpiarPila();
      continue;
    }
    if (op === 'ET') {
      enBloqueTexto = false;
      limpiarPila();
      continue;
    }

    if (!enBloqueTexto) {
      limpiarPila();
      continue;
    }

    if (op === 'TL') {
      const [tl] = popNums(1);
      if (tl > 0) {
        leading = tl;
      }
      limpiarPila();
    } else if (op === 'Td' || op === 'TD') {
      const [dx, dy] = popNums(2);
      if (op === 'TD' && dy !== 0) {
        leading = Math.abs(dy);
      }
      lineStartX += dx;
      x = lineStartX;
      y += dy;
      limpiarPila();
    } else if (op === 'Tm') {
      const [, , , , e, f] = popNums(6);
      lineStartX = e;
      x = e;
      y = f;
      limpiarPila();
    } else if (op === 'T*') {
      x = lineStartX;
      y -= leading;
      limpiarPila();
    } else if (op === 'Tj') {
      const arg = pila.pop();
      if (arg && arg.tipo === 'str') {
        agregarFragmento(arg.valor);
        x += Math.max(arg.valor.length * 4, 1);
      }
      limpiarPila();
    } else if (op === 'TJ') {
      const arg = pila.pop();
      if (arg && arg.tipo === 'array') {
        let combinado = '';
        for (const item of arg.items) {
          if (typeof item === 'string') {
            combinado += item;
          } else if (typeof item === 'number' && item < -180 && !combinado.endsWith(' ')) {
            combinado += ' ';
          }
        }
        agregarFragmento(combinado);
        x += Math.max(combinado.length * 4, 1);
      }
      limpiarPila();
    } else if (op === "'") {
      x = lineStartX;
      y -= leading;
      const arg = pila.pop();
      if (arg && arg.tipo === 'str') {
        agregarFragmento(arg.valor);
        x += Math.max(arg.valor.length * 4, 1);
      }
      limpiarPila();
    } else if (op === '"') {
      x = lineStartX;
      y -= leading;
      const arg = pila.pop();
      if (arg && arg.tipo === 'str') {
        agregarFragmento(arg.valor);
        x += Math.max(arg.valor.length * 4, 1);
      }
      limpiarPila();
    } else {
      limpiarPila();
    }
  }

  return fragmentos;
}

function agruparFragmentosEnLineas(fragmentos: FragmentoTextoPdf[]): string[] {
  if (fragmentos.length === 0) {
    return [];
  }

  const tieneCoordenadas = fragmentos.some((f) => f.x !== 0 || f.y !== 0);
  if (!tieneCoordenadas) {
    return fragmentos
      .map((f) => f.texto.replace(/\s+/g, ' ').trim())
      .filter((l) => l.length > 0);
  }

  // Ordenar de arriba hacia abajo (Y descendente) y de izquierda a derecha (X ascendente)
  const ordenados = [...fragmentos].sort((a, b) => {
    const diffY = b.y - a.y;
    if (Math.abs(diffY) > 2.0) {
      return diffY;
    }
    if (Math.abs(a.x - b.x) > 0.5) {
      return a.x - b.x;
    }
    return a.orden - b.orden;
  });

  const filas: Array<{ yRef: number; items: FragmentoTextoPdf[] }> = [];
  for (const frag of ordenados) {
    const ultima = filas[filas.length - 1];
    if (ultima && Math.abs(frag.y - ultima.yRef) <= 2.0) {
      ultima.items.push(frag);
    } else {
      filas.push({ yRef: frag.y, items: [frag] });
    }
  }

  return filas
    .map((fila) => {
      fila.items.sort((a, b) => (a.x !== b.x ? a.x - b.x : a.orden - b.orden));
      return fila.items
        .map((it) => it.texto)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    })
    .filter((linea) => linea.length > 0);
}

/**
 * Adaptador nativo sin OCR para extraer líneas de texto de PDFs digitales
 * soportando streams sin comprimir y /FlateDecode con límite estricto de salida.
 */
export class PdfTextoNativoAdapter implements AdaptadorPdfTexto {
  extraerLineasTexto(buffer: Buffer): string[] {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new ConciliacionV2Error(
        400,
        'PDF_SIN_TEXTO_EXTRAIBLE',
        'El archivo PDF está vacío o no contiene texto extraíble.'
      );
    }

    const textoLatin1 = buffer.toString('latin1');
    const lineasTotales: string[] = [];
    let pos = 0;
    let ordenBase = 0;
    let streamsProcesados = 0;
    let totalBytesDecodificados = 0;

    while (pos < buffer.length) {
      const idxStream = textoLatin1.indexOf('stream', pos);
      if (idxStream === -1) {
        break;
      }

      // Verificar delimitador previo a 'stream' para evitar coincidencias en 'endstream' u otros nombres
      const charPrev = idxStream > 0 ? textoLatin1[idxStream - 1] : '\n';
      if (!/[\s>\]]/.test(charPrev)) {
        pos = idxStream + 6;
        continue;
      }

      let inicioDatos = idxStream + 6;
      if (buffer[inicioDatos] === 0x0d && buffer[inicioDatos + 1] === 0x0a) {
        inicioDatos += 2;
      } else if (buffer[inicioDatos] === 0x0a) {
        inicioDatos += 1;
      } else if (buffer[inicioDatos] === 0x0d) {
        inicioDatos += 1;
      } else {
        pos = idxStream + 6;
        continue;
      }

      const idxEnd = textoLatin1.indexOf('endstream', inicioDatos);
      if (idxEnd === -1) {
        break;
      }

      streamsProcesados += 1;
      if (streamsProcesados > MAX_PDF_STREAMS) {
        throw new ConciliacionV2Error(
          400,
          'PDF_STREAM_EXCEDE_LIMITE',
          `El archivo PDF supera el límite máximo permitido de ${MAX_PDF_STREAMS} streams.`
        );
      }

      let finDatos = idxEnd;
      if (finDatos >= inicioDatos + 2 && buffer[finDatos - 2] === 0x0d && buffer[finDatos - 1] === 0x0a) {
        finDatos -= 2;
      } else if (finDatos >= inicioDatos + 1 && (buffer[finDatos - 1] === 0x0a || buffer[finDatos - 1] === 0x0d)) {
        finDatos -= 1;
      }

      const diccionario = textoLatin1.slice(Math.max(0, idxStream - 512), idxStream);
      const usaFlate = /\/Filter\b[^]*?\/FlateDecode\b/i.test(diccionario) || /\/FlateDecode\b/i.test(diccionario);
      const rawSlice = buffer.subarray(inicioDatos, Math.max(inicioDatos, finDatos));

      const restante = MAX_PDF_TOTAL_SALIDA - totalBytesDecodificados;
      if (restante <= 0) {
        throw new ConciliacionV2Error(
          400,
          'PDF_STREAM_EXCEDE_LIMITE',
          'Los streams del PDF exceden el límite total acumulado de descompresión (32 MB).'
        );
      }

      let streamDecodificado: Buffer | null = null;
      if (usaFlate) {
        try {
          const bloque = zlib.inflateSync(rawSlice, {
            maxOutputLength: Math.min(MAX_PDF_STREAM_SALIDA, restante),
          });
          totalBytesDecodificados += bloque.length;
          if (totalBytesDecodificados > MAX_PDF_TOTAL_SALIDA) {
            throw new ConciliacionV2Error(
              400,
              'PDF_STREAM_EXCEDE_LIMITE',
              'Los streams del PDF exceden el límite total acumulado de descompresión (32 MB).'
            );
          }
          streamDecodificado = bloque;
        } catch (err: any) {
          if (err instanceof ConciliacionV2Error) {
            throw err;
          }
          const codigo = err?.code ?? '';
          const msg = String(err?.message ?? '');
          if (codigo === 'ERR_BUFFER_TOO_LARGE' || msg.includes('maxOutputLength') || msg.includes('Cannot create a Buffer')) {
            throw new ConciliacionV2Error(
              400,
              'PDF_STREAM_EXCEDE_LIMITE',
              'Un stream comprimido del PDF excede el límite seguro de descompresión.'
            );
          }
          // Stream corrupto o filtro combinado no soportado: capturar sin abortar el resto del PDF
          streamDecodificado = null;
        }
      } else {
        if (rawSlice.length > MAX_PDF_STREAM_SALIDA || rawSlice.length > restante) {
          throw new ConciliacionV2Error(
            400,
            'PDF_STREAM_EXCEDE_LIMITE',
            'Un stream del PDF excede el límite seguro de tamaño acumulado (32 MB).'
          );
        }
        totalBytesDecodificados += rawSlice.length;
        streamDecodificado = rawSlice;
      }

      if (streamDecodificado && streamDecodificado.includes('BT')) {
        const fragmentos = extraerFragmentosDeStream(streamDecodificado, ordenBase);
        ordenBase += fragmentos.length + 1;
        const lineas = agruparFragmentosEnLineas(fragmentos);
        lineasTotales.push(...lineas);
      }

      pos = idxEnd + 9;
    }

    // Respaldo para PDFs planos con BT...ET fuera de streams estándar
    if (lineasTotales.length === 0 && buffer.includes('BT') && buffer.includes('ET')) {
      const fragmentos = extraerFragmentosDeStream(buffer, ordenBase);
      lineasTotales.push(...agruparFragmentosEnLineas(fragmentos));
    }

    if (lineasTotales.length === 0) {
      throw new ConciliacionV2Error(
        400,
        'PDF_SIN_TEXTO_EXTRAIBLE',
        'El archivo PDF no contiene texto extraíble (posiblemente es un documento escaneado sin capa de texto).'
      );
    }

    return lineasTotales;
  }
}

const adaptadorNativoPorDefecto = new PdfTextoNativoAdapter();
let adaptadorPdfOverride: AdaptadorPdfTexto | null = null;

export function setAdaptadorPdfTextoParaTests(adaptador: AdaptadorPdfTexto | null): void {
  adaptadorPdfOverride = adaptador;
}

export function obtenerAdaptadorPdfTexto(): AdaptadorPdfTexto {
  return adaptadorPdfOverride ?? adaptadorNativoPorDefecto;
}
