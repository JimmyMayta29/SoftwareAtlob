import type ExcelJSType from 'exceljs';
import type {
  EstandarReportDefinition,
  Pdt621ResumenPdfParams,
  Pdt621CasillasOficiales
} from './formatoEstandarEngine';

type EstiloReporte = 'estandar' | 'actual';

async function cargarExcelJs(): Promise<typeof ExcelJSType> {
  const mod: any = await import('exceljs');
  if (mod?.Workbook) return mod as typeof ExcelJSType;
  if (mod?.default?.Workbook) return mod.default as typeof ExcelJSType;
  if (typeof globalThis !== 'undefined' && (globalThis as any).ExcelJS?.Workbook) {
    return (globalThis as any).ExcelJS as typeof ExcelJSType;
  }
  throw new Error('No se pudo inicializar el motor ExcelJS.');
}

function sanitizarNombreHoja(nombre: string): string {
  const limpio = nombre
    .replace(/[\\/*?:[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (limpio || 'REPORTE').slice(0, 31);
}

function formatearFechaHora24h(fecha: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`;
}

function descargarArrayBufferXlsx(buffer: ArrayBuffer, nombreArchivo: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo.endsWith('.xlsx') ? nombreArchivo : `${nombreArchivo}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function estimarLineasTexto(texto: string, anchoChars: number): number {
  if (!texto) return 1;
  const maxPorLinea = Math.max(8, Math.floor(anchoChars));
  return texto.split('\n').reduce((acc, parrafo) => {
    return acc + Math.max(1, Math.ceil(parrafo.length / maxPorLinea));
  }, 0);
}

/**
 * Genera un libro Excel (.xlsx) real con estructura, encabezados combinados,
 * bordes finos, formatos numéricos y configuración de página A4 idénticos al PDF.
 */
export async function generarReporteEstandarExcelBuffer(
  def: EstandarReportDefinition,
  estilo: EstiloReporte = 'estandar'
): Promise<ArrayBuffer> {
  const ExcelJS = await cargarExcelJs();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ATLOB ERP';
  wb.created = new Date();
  wb.modified = new Date();

  const tituloLimpio = def.titulo.replace(/\*/g, '').trim().toUpperCase();
  const ws = wb.addWorksheet(sanitizarNombreHoja(tituloLimpio), {
    views: [{ showGridLines: true }]
  });

  const numCols = Math.max(1, def.columnas.length);
  const esActual = estilo === 'actual';

  // Paleta formal: Estándar B/N o Actual Corporativo Atlob
  const COLOR_HEAD_BG = esActual ? 'FF1E3A5F' : 'FFF8FAFC';
  const COLOR_HEAD_TEXT = esActual ? 'FFFFFFFF' : 'FF000000';
  const COLOR_HEAD_BORDER = esActual ? 'FF2D5280' : 'FF000000';
  const COLOR_GROUP_BG = esActual ? 'FFEFF6FF' : 'FFF8FAFC';
  const COLOR_ZEBRA_BG = 'FFF8FAFC';
  const COLOR_TOTAL_BG = esActual ? 'FFF1F5F9' : 'FFFFFFFF';
  const COLOR_GRAND_TOTAL_BG = esActual ? 'FFE2E8F0' : 'FFF1F5F9';
  const COLOR_GRID = 'FFD1D5DB';

  const BORDER_HEAD: Partial<ExcelJSType.Borders> = {
    top: { style: 'thin', color: { argb: COLOR_HEAD_BORDER } },
    bottom: { style: 'thin', color: { argb: COLOR_HEAD_BORDER } },
    left: { style: 'thin', color: { argb: COLOR_HEAD_BORDER } },
    right: { style: 'thin', color: { argb: COLOR_HEAD_BORDER } }
  };

  const BORDER_CELL: Partial<ExcelJSType.Borders> = {
    top: { style: 'hair', color: { argb: COLOR_GRID } },
    bottom: { style: 'hair', color: { argb: COLOR_GRID } },
    left: { style: 'hair', color: { argb: COLOR_GRID } },
    right: { style: 'hair', color: { argb: COLOR_GRID } }
  };

  // -------------------------------------------------------------------------
  // 1. MEMBRETE SUPERIOR FORMAL (Idéntico al PDF)
  // -------------------------------------------------------------------------
  const colIzqFin = Math.max(1, Math.min(4, Math.floor(numCols * 0.3)));
  const colDerIni = numCols >= 6 ? Math.max(colIzqFin + 2, numCols - 2) : numCols;
  const colCentroIni = colIzqFin + 1;
  const colCentroFin = numCols >= 6 ? colDerIni - 1 : numCols;

  const r1 = ws.addRow([]);
  const r2 = ws.addRow([]);
  const r3 = ws.addRow([]);
  const r4 = ws.addRow([]);
  r1.height = 17;
  r2.height = 14;
  r3.height = 13;
  r4.height = 13;

  // Bloque Izquierdo: Empresa / Período / Dirección / RUC
  if (colIzqFin > 1) {
    ws.mergeCells(1, 1, 1, colIzqFin);
    ws.mergeCells(2, 1, 2, colIzqFin);
    ws.mergeCells(3, 1, 3, colIzqFin);
    ws.mergeCells(4, 1, 4, colIzqFin);
  }
  ws.getCell(1, 1).value = def.empresa.razonSocial.toUpperCase();
  ws.getCell(1, 1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
  ws.getCell(2, 1).value = `PERIODO ${def.empresa.periodo}`;
  ws.getCell(2, 1).font = { name: 'Calibri', size: 8.5, color: { argb: 'FF1E293B' } };
  ws.getCell(3, 1).value = def.empresa.direccion || '';
  ws.getCell(3, 1).font = { name: 'Calibri', size: 8.5, color: { argb: 'FF334155' } };
  ws.getCell(4, 1).value = `R.U.C.: ${def.empresa.ruc}`;
  ws.getCell(4, 1).font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: 'FF000000' } };

  // Bloque Centro: Título y Moneda
  if (numCols >= 4 && colCentroIni <= colCentroFin) {
    if (colCentroFin > colCentroIni) {
      ws.mergeCells(1, colCentroIni, 1, colCentroFin);
      ws.mergeCells(2, colCentroIni, 2, colCentroFin);
    }
    const cTit = ws.getCell(1, colCentroIni);
    cTit.value = tituloLimpio;
    cTit.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
    cTit.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    const cMon = ws.getCell(2, colCentroIni);
    cMon.value = `(${def.moneda.toUpperCase()})`;
    cMon.font = { name: 'Calibri', size: 9, color: { argb: 'FF334155' } };
    cMon.alignment = { horizontal: 'center', vertical: 'middle' };
  } else {
    // Reportes muy angostos (3 columnas, ej. Flujo de Efectivo): título en fila dedicada
    const rTit = ws.addRow([tituloLimpio]);
    rTit.height = 18;
    ws.mergeCells(rTit.number, 1, rTit.number, numCols);
    const cTit = ws.getCell(rTit.number, 1);
    cTit.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
    cTit.alignment = { horizontal: 'center', vertical: 'middle' };

    const rMon = ws.addRow([`(${def.moneda.toUpperCase()})`]);
    rMon.height = 14;
    ws.mergeCells(rMon.number, 1, rMon.number, numCols);
    const cMon = ws.getCell(rMon.number, 1);
    cMon.font = { name: 'Calibri', size: 9, color: { argb: 'FF334155' } };
    cMon.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Bloque Derecho: Fecha/Hora y Estilo
  if (numCols >= 6) {
    if (numCols > colDerIni) {
      ws.mergeCells(1, colDerIni, 1, numCols);
      ws.mergeCells(2, colDerIni, 2, numCols);
    }
    if (def.mostrarFechaHoraImpresion) {
      const cFec = ws.getCell(1, colDerIni);
      cFec.value = `Emitido: ${formatearFechaHora24h()}`;
      cFec.font = { name: 'Calibri', size: 8, color: { argb: 'FF475569' } };
      cFec.alignment = { horizontal: 'right', vertical: 'middle' };
    }
    const cEst = ws.getCell(2, colDerIni);
    cEst.value = esActual ? 'Formato actual Atlob' : 'Formato estándar Atlob';
    cEst.font = { name: 'Calibri', size: 8, color: { argb: 'FF64748B' } };
    cEst.alignment = { horizontal: 'right', vertical: 'middle' };
  }

  // Separador fino
  const rSep = ws.addRow([]);
  rSep.height = 6;

  // -------------------------------------------------------------------------
  // 2. CABECERA DE TABLA (SUPER-HEADERS COMBINADOS + COLUMNAS)
  // -------------------------------------------------------------------------
  const filaInicioTabla = rSep.number + 1;

  if (def.superHeaders && def.superHeaders.length > 0) {
    const rSh = ws.addRow(new Array(numCols).fill(''));
    rSh.height = 19;
    let colCursor = 1;
    for (const sh of def.superHeaders) {
      const span = Math.max(1, sh.colSpan);
      const colFin = Math.min(numCols, colCursor + span - 1);
      if (colFin > colCursor) {
        ws.mergeCells(rSh.number, colCursor, rSh.number, colFin);
      }
      const cell = ws.getCell(rSh.number, colCursor);
      cell.value = sh.label;
      for (let c = colCursor; c <= colFin; c++) {
        const cObj = ws.getCell(rSh.number, c);
        cObj.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: COLOR_HEAD_TEXT } };
        cObj.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEAD_BG } };
        cObj.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cObj.border = BORDER_HEAD;
      }
      colCursor = colFin + 1;
    }
  }

  const rCols = ws.addRow(def.columnas.map((c) => c.label));
  rCols.height = 24;
  def.columnas.forEach((col, idx) => {
    const cell = rCols.getCell(idx + 1);
    cell.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: COLOR_HEAD_TEXT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEAD_BG } };
    cell.alignment = {
      horizontal: col.align || 'center',
      vertical: 'middle',
      wrapText: true
    };
    cell.border = BORDER_HEAD;
  });

  const filaFinCabecera = rCols.number;

  // -------------------------------------------------------------------------
  // 3. ANCHOS ÓPTIMOS DE COLUMNA (PRE-CÁLCULO)
  // -------------------------------------------------------------------------
  const anchosCols: number[] = def.columnas.map((col) => {
    const basePdf = col.cellWidthPdf ? col.cellWidthPdf * 0.56 : 12;
    const minByLabel = Math.min(22, Math.max(6, col.label.length + 2));
    const minNumeric = col.isNumeric ? 13 : 5;
    return Math.max(basePdf, minByLabel * 0.72, minNumeric);
  });

  // Ajustar anchos con datos reales (con tope para wrapText)
  for (const grupo of def.grupos) {
    for (const fila of grupo.filas) {
      def.columnas.forEach((col, idx) => {
        const raw = fila[col.id];
        if (raw === undefined || raw === null || raw === '') return;
        if (col.isNumeric) {
          const num = typeof raw === 'number' ? raw : parseFloat(String(raw));
          if (!Number.isNaN(num)) {
            const len = num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).length + 2;
            anchosCols[idx] = Math.max(anchosCols[idx], Math.min(20, len));
          }
        } else {
          const str = String(raw);
          const techo = /razon|glosa|denominacion|rubro|concepto/i.test(col.id) ? 38 : 20;
          anchosCols[idx] = Math.max(anchosCols[idx], Math.min(techo, str.length + 2));
        }
      });
    }
  }

  // -------------------------------------------------------------------------
  // 4. CUERPO POR GRUPOS + SUBTOTALES + TOTAL GENERAL
  // -------------------------------------------------------------------------
  const firstSumIdx = def.columnas.findIndex((c) => c.isNumeric && c.sumar);

  for (const grupo of def.grupos) {
    // Subtítulo del grupo
    const rGrp = ws.addRow([grupo.tituloGrupo]);
    rGrp.height = 17;
    if (numCols > 1) {
      ws.mergeCells(rGrp.number, 1, rGrp.number, numCols);
    }
    for (let c = 1; c <= numCols; c++) {
      const cell = rGrp.getCell(c);
      cell.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_GROUP_BG } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'hair', color: { argb: 'FF94A3B8' } },
        left: c === 1 ? { style: 'thin', color: { argb: COLOR_GRID } } : undefined,
        right: c === numCols ? { style: 'thin', color: { argb: COLOR_GRID } } : undefined
      };
    }

    // Filas de datos
    grupo.filas.forEach((fila, filaIdx) => {
      const valores = def.columnas.map((col) => {
        const raw = fila[col.id];
        if (col.isNumeric) {
          if (raw === '' || raw === undefined || raw === null) {
            return col.sumar ? 0 : '';
          }
          const num = typeof raw === 'number' ? raw : parseFloat(String(raw));
          return Number.isNaN(num) ? (col.sumar ? 0 : '') : Number(num.toFixed(col.id === 'tipoCambio' ? 3 : 2));
        }
        return raw !== undefined && raw !== null ? String(raw) : '';
      });

      const r = ws.addRow(valores);
      let maxLineas = 1;

      def.columnas.forEach((col, idx) => {
        const cell = r.getCell(idx + 1);
        const esTextoLargo = !col.isNumeric && /razon|glosa|denominacion|rubro|concepto/i.test(col.id);
        cell.font = { name: 'Calibri', size: 8.5, color: { argb: 'FF000000' } };
        if (esActual && filaIdx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ZEBRA_BG } };
        }
        cell.border = BORDER_CELL;
        cell.alignment = {
          horizontal: col.align || (col.isNumeric ? 'right' : 'left'),
          vertical: 'middle',
          wrapText: esTextoLargo
        };

        if (col.isNumeric && typeof valores[idx] === 'number') {
          cell.numFmt = col.id === 'tipoCambio' ? '0.000' : '#,##0.00;-#,##0.00;0.00';
        } else if (!col.isNumeric) {
          cell.numFmt = '@';
          if (esTextoLargo && typeof valores[idx] === 'string') {
            maxLineas = Math.max(maxLineas, estimarLineasTexto(valores[idx] as string, anchosCols[idx]));
          }
        }
      });

      r.height = Math.max(14.5, maxLineas * 12.5);
    });

    // Fila TOTALES del grupo
    const valsTotal = def.columnas.map((col, idx) => {
      if (firstSumIdx > 0) {
        if (idx === 0) return 'TOTALES:';
        if (idx < firstSumIdx) return '';
      } else if (idx === 0) {
        return 'TOTALES:';
      }
      if (col.isNumeric && col.sumar) {
        return Number((grupo.totalesGrupo[col.id] || 0).toFixed(2));
      }
      return '';
    });

    const rTot = ws.addRow(valsTotal);
    rTot.height = 17;
    if (firstSumIdx > 1) {
      ws.mergeCells(rTot.number, 1, rTot.number, firstSumIdx);
    }
    def.columnas.forEach((col, idx) => {
      const cell = rTot.getCell(idx + 1);
      cell.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: 'FF000000' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TOTAL_BG } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: idx === 0 ? { style: 'thin', color: { argb: COLOR_GRID } } : undefined,
        right: idx === numCols - 1 ? { style: 'thin', color: { argb: COLOR_GRID } } : undefined
      };
      if (firstSumIdx > 0 && idx < firstSumIdx) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: col.align || 'right', vertical: 'middle' };
      }
      if (col.isNumeric && col.sumar && typeof valsTotal[idx] === 'number') {
        cell.numFmt = '#,##0.00;-#,##0.00;0.00';
      }
    });

    const rBlank = ws.addRow([]);
    rBlank.height = 5;
  }

  // Fila TOTAL GENERAL final
  const valsGrand = def.columnas.map((col, idx) => {
    if (firstSumIdx > 0) {
      if (idx === 0) return 'TOTAL GENERAL:';
      if (idx < firstSumIdx) return '';
    } else if (idx === 0) {
      return 'TOTAL GENERAL:';
    }
    if (col.isNumeric && col.sumar) {
      return Number((def.totalesGenerales[col.id] || 0).toFixed(2));
    }
    return '';
  });

  const rGrand = ws.addRow(valsGrand);
  rGrand.height = 19;
  if (firstSumIdx > 1) {
    ws.mergeCells(rGrand.number, 1, rGrand.number, firstSumIdx);
  }
  def.columnas.forEach((col, idx) => {
    const cell = rGrand.getCell(idx + 1);
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF000000' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_GRAND_TOTAL_BG } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'double', color: { argb: 'FF000000' } },
      left: idx === 0 ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
      right: idx === numCols - 1 ? { style: 'thin', color: { argb: 'FF000000' } } : undefined
    };
    if (firstSumIdx > 0 && idx < firstSumIdx) {
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    } else {
      cell.alignment = { horizontal: col.align || 'right', vertical: 'middle' };
    }
    if (col.isNumeric && col.sumar && typeof valsGrand[idx] === 'number') {
      cell.numFmt = '#,##0.00;-#,##0.00;0.00';
    }
  });

  // Aplicar anchos de columna
  anchosCols.forEach((w, idx) => {
    ws.getColumn(idx + 1).width = Number(w.toFixed(1));
  });

  // Configuración A4 lista para imprimir 1 página de ancho exacto
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: def.orientacion,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2
    },
    printTitlesRow: `${filaInicioTabla}:${filaFinCabecera}`
  };

  ws.headerFooter = {
    oddFooter: '&C&8Pág. &P de &N'
  };

  const rawBuf = await wb.xlsx.writeBuffer();
  if (rawBuf instanceof ArrayBuffer) return rawBuf;
  const view = new Uint8Array(rawBuf as any);
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}

/**
 * Descarga el reporte estándar en Excel (.xlsx) real con formato idéntico al PDF.
 */
export async function descargarReporteEstandarExcel(
  def: EstandarReportDefinition,
  estilo: EstiloReporte = 'estandar'
): Promise<void> {
  const buffer = await generarReporteEstandarExcelBuffer(def, estilo);
  const tituloArchivo = def.titulo.replace(/\*/g, '').trim().replace(/\s+/g, '_');
  const nombreArchivo = `${tituloArchivo}_${def.empresa.ruc}_${def.empresa.periodo.replace(/[^0-9]/g, '')}.xlsx`;
  descargarArrayBufferXlsx(buffer, nombreArchivo);
}

/**
 * Extrae todas las casillas oficiales de PDT 621 a partir de params.casillasOficiales
 * o con fallback limpio desde filasCasillas.
 */
export function resolverCasillasOficialesPdt621(params: Pdt621ResumenPdfParams): Pdt621CasillasOficiales {
  if (params.casillasOficiales) return params.casillasOficiales;

  const findTrib = (cas: string): number => {
    const f = params.filasCasillas.find((x) => x.casillaTributo === cas);
    return f ? Number(f.montoTributo || 0) : 0;
  };
  const findBase = (cas: string): number => {
    const f = params.filasCasillas.find((x) => x.casillaBase === cas);
    return f && f.montoBase !== undefined && f.montoBase !== null ? Number(f.montoBase) : 0;
  };

  return {
    cas100: findBase('100'), cas101: findTrib('101'),
    cas154: findBase('154'), cas155: findTrib('155'),
    cas102: findBase('102'), cas103: findTrib('103'),
    cas160: findBase('160'), cas161: findTrib('161'),
    cas162: findBase('162'), cas163: findTrib('163'),
    cas106: findBase('106'), cas127: findBase('127'),
    cas105: findBase('105'), cas109: findBase('109'), cas112: findBase('112'),
    cas131: findTrib('131'),
    cas107: findBase('107'), cas108: findTrib('108'),
    cas156: findBase('156'), cas157: findTrib('157'),
    cas110: findBase('110'), cas111: findTrib('111'), cas113: findBase('113'),
    cas114: findBase('114'), cas115: findTrib('115'),
    cas116: findBase('116'), cas117: findTrib('117'), cas119: findBase('119'),
    cas120: findBase('120'), cas122: findBase('122'),
    cas178: findTrib('178'), cas172: 0, cas173: 1,
    cas340: 0, cas341: 0, cas182: 0,
    cas301: findBase('301'), cas312: findTrib('312'),
    cas380: 0, cas315: 1, cas894: 0.01, cas336: 0,
    cas140: findTrib('140'), cas353: 0, cas302: findTrib('312'),
    cas145: findTrib('145'), cas351: 0, cas303: 0,
    cas184: findTrib('184'), cas352: 0, cas304: params.pagoCuentaRenta,
    cas171: findTrib('171'), cas168: findTrib('168'), cas164: findTrib('164'),
    cas179: 0, cas176: 0, cas165: 0,
    cas326: 0, cas327: 0,
    cas347: 0, cas305: 0,
    cas328: 0,
    cas681: params.totalDeudaIgv, cas683: 0, cas682: params.pagoCuentaRenta,
    cas185: 0, cas342: 0, cas317: 0,
    cas187: 0, cas343: 0, cas319: 0,
    cas188: params.totalDeudaIgv, cas344: 0, cas324: params.pagoCuentaRenta,
    saldoFavorArrastrable: params.nuevoSaldoFavorIgv,
    totalDeudaGeneral: params.totalPagarSunat
  };
}

/**
 * Genera el Excel (.xlsx) oficial de la Declaración Mensual PDT 621
 * replicando 1:1 las 2 páginas del formulario SUNAT 0621 tal cual figura en el sistema.
 */
export async function generarPdt621ExcelBuffer(params: Pdt621ResumenPdfParams): Promise<ArrayBuffer> {
  const ExcelJS = await cargarExcelJs();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ATLOB ERP';
  wb.created = new Date();

  const c = resolverCasillasOficialesPdt621(params);
  const periodoCompacto = params.periodo.replace('-', '');
  const tipoDecl = params.esRectificatoria ? 'Rectificatoria' : 'Original';
  const nroOrden = params.numeroOrden || 'PENDIENTE';
  const fechaPres = params.fechaPresentacion || 'PENDIENTE';

  const BORDER_THIN: Partial<ExcelJSType.Borders> = {
    top: { style: 'thin', color: { argb: 'FF64748B' } },
    bottom: { style: 'thin', color: { argb: 'FF64748B' } },
    left: { style: 'thin', color: { argb: 'FF64748B' } },
    right: { style: 'thin', color: { argb: 'FF64748B' } }
  };

  const BORDER_LIGHT: Partial<ExcelJSType.Borders> = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };

  const escribirEncabezadoSunat = (ws: ExcelJSType.Worksheet, paginaNum: number, totalCols: number) => {
    // 6 filas de encabezado oficial 0621
    for (let i = 1; i <= 6; i++) {
      ws.addRow(new Array(totalCols).fill(''));
      ws.getRow(i).height = i === 1 ? 18 : 15;
    }

    const colCentroFin = totalCols - 2;
    const colDerIni = totalCols - 1;

    // Izquierda: SUNAT / DECLARACIÓN PAGO / 0621 (cols 1..2)
    ws.mergeCells(1, 1, 2, 2);
    ws.mergeCells(3, 1, 3, 2);
    ws.mergeCells(4, 1, 6, 2);
    ws.getCell(1, 1).value = 'SUNAT';
    ws.getCell(1, 1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF0F172A' } };
    ws.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'bottom' };

    ws.getCell(3, 1).value = 'DECLARACIÓN PAGO';
    ws.getCell(3, 1).font = { name: 'Calibri', size: 8, bold: true, color: { argb: 'FF334155' } };
    ws.getCell(3, 1).alignment = { horizontal: 'center', vertical: 'middle' };

    ws.getCell(4, 1).value = '0621';
    ws.getCell(4, 1).font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF0F172A' } };
    ws.getCell(4, 1).alignment = { horizontal: 'center', vertical: 'middle' };

    // Centro: título + datos
    ws.mergeCells(1, 3, 1, colCentroFin);
    ws.getCell(1, 3).value = 'PDT IGV - RENTA MENSUAL';
    ws.getCell(1, 3).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    ws.getCell(1, 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    ws.getCell(1, 3).alignment = { horizontal: 'center', vertical: 'middle' };

    ws.mergeCells(2, 3, 2, colCentroFin);
    ws.getCell(2, 3).value = `RUC: ${params.empresa.ruc}`;
    ws.getCell(2, 3).font = { name: 'Calibri', size: 9, bold: true };

    ws.mergeCells(3, 3, 3, colCentroFin);
    ws.getCell(3, 3).value = `Razón Social: ${params.empresa.razonSocial.toUpperCase()}`;
    ws.getCell(3, 3).font = { name: 'Calibri', size: 9, bold: true };

    ws.mergeCells(4, 3, 4, colCentroFin);
    ws.getCell(4, 3).value = `N° de Orden: ${nroOrden}     |     Período: ${periodoCompacto}`;
    ws.getCell(4, 3).font = { name: 'Calibri', size: 8.5 };

    ws.mergeCells(5, 3, 5, colCentroFin);
    ws.getCell(5, 3).value = `Declaración: ${tipoDecl} (v${params.version})     |     F. Presentación: ${fechaPres}`;
    ws.getCell(5, 3).font = { name: 'Calibri', size: 8.5 };

    ws.mergeCells(6, 3, 6, colCentroFin);
    ws.getCell(6, 3).value = `Moneda: Soles     |     Estado: ${params.estado}`;
    ws.getCell(6, 3).font = { name: 'Calibri', size: 8.5 };

    // Derecha: Copia contribuyente / Pag N
    ws.mergeCells(1, colDerIni, 2, totalCols);
    ws.mergeCells(3, colDerIni, 4, totalCols);
    ws.mergeCells(5, colDerIni, 6, totalCols);
    ws.getCell(1, colDerIni).value = 'Copia para el contribuyente';
    ws.getCell(1, colDerIni).font = { name: 'Calibri', size: 8, bold: true, color: { argb: 'FF475569' } };
    ws.getCell(1, colDerIni).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    ws.getCell(3, colDerIni).value = `(Pag. ${paginaNum})`;
    ws.getCell(3, colDerIni).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
    ws.getCell(3, colDerIni).alignment = { horizontal: 'center', vertical: 'middle' };

    ws.getCell(5, colDerIni).value = 'ATLOB ERP v2.0';
    ws.getCell(5, colDerIni).font = { name: 'Calibri', size: 7.5, color: { argb: 'FF94A3B8' } };
    ws.getCell(5, colDerIni).alignment = { horizontal: 'center', vertical: 'middle' };

    // Borde exterior y separadores verticales del encabezado
    for (let r = 1; r <= 6; r++) {
      for (let col = 1; col <= totalCols; col++) {
        const cell = ws.getCell(r, col);
        cell.border = {
          top: r === 1 ? { style: 'thin', color: { argb: 'FF475569' } } : undefined,
          bottom: r === 6 || (r === 1 && col >= 3 && col <= colCentroFin)
            ? { style: 'thin', color: { argb: 'FF475569' } }
            : undefined,
          left: col === 1 || col === 3 || col === colDerIni ? { style: 'thin', color: { argb: 'FF475569' } } : undefined,
          right: col === totalCols ? { style: 'thin', color: { argb: 'FF475569' } } : undefined
        };
      }
    }
    const rGap = ws.addRow([]);
    rGap.height = 6;
  };

  // =========================================================================
  // HOJA 1: PÁGINA 1 — BASES, DÉBITO, CRÉDITO, IVAP Y RENTA (6 columnas)
  // Col 1: Bloque vertical | Col 2: Concepto | Col 3: Cas Base | Col 4: Base | Col 5: Cas Trib | Col 6: Tributo
  // =========================================================================
  const ws1 = wb.addWorksheet('Pag 1 - Bases', { views: [{ showGridLines: true }] });
  ws1.columns = [
    { width: 4.5 },
    { width: 49 },
    { width: 6.5 },
    { width: 16 },
    { width: 6.5 },
    { width: 16 }
  ];
  escribirEncabezadoSunat(ws1, 1, 6);

  const agregarSeccionPag1 = (
    tituloIzq: string,
    tituloDer: string,
    filas: Array<{
      concepto: string;
      casBase?: string;
      valBase?: number | null;
      esRatioBase?: boolean;
      casTrib?: string;
      valTrib?: number | null;
      destacado?: boolean;
      sinColLateral?: boolean;
    }>,
    bloquesVerticales?: Array<{ texto: string; inicioIdx: number; cantidad: number }>
  ) => {
    // Barra de sección
    const rSec = ws1.addRow([tituloIzq, '', '', '', tituloDer, '']);
    rSec.height = 17;
    ws1.mergeCells(rSec.number, 1, rSec.number, 4);
    ws1.mergeCells(rSec.number, 5, rSec.number, 6);
    for (let col = 1; col <= 6; col++) {
      const cell = rSec.getCell(col);
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.border = BORDER_THIN;
      cell.alignment = { horizontal: col >= 5 ? 'right' : 'left', vertical: 'middle' };
    }

    // Subcabecera CONCEPTO | BASE | TRIBUTO
    const rSub = ws1.addRow(['CONCEPTO', '', 'BASE', '', 'TRIBUTO', '']);
    rSub.height = 16;
    ws1.mergeCells(rSub.number, 1, rSub.number, 2);
    ws1.mergeCells(rSub.number, 3, rSub.number, 4);
    ws1.mergeCells(rSub.number, 5, rSub.number, 6);
    for (let col = 1; col <= 6; col++) {
      const cell = rSub.getCell(col);
      cell.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: 'FF1E293B' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      cell.border = BORDER_THIN;
      cell.alignment = { horizontal: col <= 2 ? 'left' : 'center', vertical: 'middle' };
    }

    const filaBaseInicio = rSub.number + 1;

    filas.forEach((f) => {
      const rowNum = ws1.addRow([
        '',
        f.concepto,
        f.casBase || '',
        f.casBase && f.valBase !== undefined && f.valBase !== null && (f.valBase !== 0 || f.esRatioBase || f.destacado)
          ? Number(f.valBase.toFixed(f.esRatioBase ? 4 : 2))
          : '',
        f.casTrib || '',
        f.casTrib && f.valTrib !== undefined && f.valTrib !== null && (f.valTrib !== 0 || f.destacado)
          ? Number(f.valTrib.toFixed(2))
          : ''
      ]).number;

      const r = ws1.getRow(rowNum);
      r.height = 15.5;

      if (f.sinColLateral) {
        ws1.mergeCells(rowNum, 1, rowNum, 2);
        ws1.getCell(rowNum, 1).value = f.concepto;
      }

      const bgFila = f.destacado ? 'FFF8FAFC' : 'FFFFFFFF';
      for (let col = 1; col <= 6; col++) {
        const cell = ws1.getCell(rowNum, col);
        const esCas = (col === 3 && !!f.casBase) || (col === 5 && !!f.casTrib);
        cell.border = f.destacado ? BORDER_THIN : BORDER_LIGHT;
        if (esCas) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          cell.font = { name: 'Consolas', size: 8, bold: true, color: { argb: 'FF334155' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (col === 4 || col === 6) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgFila } };
          cell.font = { name: 'Consolas', size: 8.5, bold: !!f.destacado, color: { argb: 'FF0F172A' } };
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          if (typeof cell.value === 'number') {
            cell.numFmt = col === 4 && f.esRatioBase ? '0.0000' : '#,##0.00;-#,##0.00;0.00';
          }
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgFila } };
          cell.font = { name: 'Calibri', size: 8.5, bold: !!f.destacado, color: { argb: 'FF0F172A' } };
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }
      }
    });

    if (bloquesVerticales) {
      for (const b of bloquesVerticales) {
        const rIni = filaBaseInicio + b.inicioIdx;
        const rFin = rIni + b.cantidad - 1;
        ws1.mergeCells(rIni, 1, rFin, 1);
        const cell = ws1.getCell(rIni, 1);
        cell.value = b.texto;
        cell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: 'FF334155' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', textRotation: 90 };
        cell.border = BORDER_LIGHT;
      }
    }

    const rGap = ws1.addRow([]);
    rGap.height = 6;
  };

  // IGV VENTAS
  agregarSeccionPag1(
    'IGV VENTAS',
    'IGV CUENTA PROPIA',
    [
      { concepto: 'Ventas Netas', casBase: '100', valBase: c.cas100, casTrib: '101', valTrib: c.cas101 },
      { concepto: 'Ventas Netas Gravadas Ley N° 31556 y modificatorias', casBase: '154', valBase: c.cas154, casTrib: '155', valTrib: c.cas155 },
      { concepto: 'Descuentos Concedidos y/o devoluciones de Ventas', casBase: '102', valBase: c.cas102, casTrib: '103', valTrib: c.cas103 },
      { concepto: 'Ventas de bienes (ley 27037 inc. 11.1, 12.1, 12.3 y 12.4)', casBase: '160', valBase: c.cas160, casTrib: '161', valTrib: c.cas161 },
      { concepto: 'Descuentos y devoluciones (ley 27037)', casBase: '162', valBase: c.cas162, casTrib: '163', valTrib: c.cas163 },
      { concepto: 'Facturadas en el período', casBase: '106', valBase: c.cas106 },
      { concepto: 'Embarcadas en el período', casBase: '127', valBase: c.cas127 },
      { concepto: 'Ventas no Gravadas (Sin Considerar exportaciones)', casBase: '105', valBase: c.cas105, sinColLateral: true },
      { concepto: 'Ventas no Gravadas (Sin efecto en ratio)', casBase: '109', valBase: c.cas109, sinColLateral: true },
      { concepto: 'Otras ventas (inciso ii), numeral 6.2 - art. 6 del Reglamento', casBase: '112', valBase: c.cas112, sinColLateral: true },
      { concepto: 'TOTAL', casTrib: '131', valTrib: c.cas131, destacado: true, sinColLateral: true }
    ],
    [
      { texto: 'Gravadas', inicioIdx: 0, cantidad: 5 },
      { texto: 'Exportación', inicioIdx: 5, cantidad: 2 }
    ]
  );

  // IGV COMPRAS
  agregarSeccionPag1(
    'IGV COMPRAS',
    'IGV CUENTA PROPIA',
    [
      { concepto: 'Compras netas destinada a ventas gravadas exclusivamente', casBase: '107', valBase: c.cas107, casTrib: '108', valTrib: c.cas108 },
      { concepto: 'Compras Netas destinadas a Vtas Gravadas Ley N° 31556 y modificatorias', casBase: '156', valBase: c.cas156, casTrib: '157', valTrib: c.cas157 },
      { concepto: 'Compras netas destinada a ventas gravadas y no gravadas', casBase: '110', valBase: c.cas110, casTrib: '111', valTrib: c.cas111 },
      { concepto: 'Compras netas destinada a ventas no gravadas exclusivamente', casBase: '113', valBase: c.cas113 },
      { concepto: 'Compras netas destinada a ventas gravadas exclusivamente', casBase: '114', valBase: c.cas114, casTrib: '115', valTrib: c.cas115 },
      { concepto: 'Compras netas destinada a ventas gravadas y no gravadas', casBase: '116', valBase: c.cas116, casTrib: '117', valTrib: c.cas117 },
      { concepto: 'Compras netas destinada a ventas no gravadas exclusivamente', casBase: '119', valBase: c.cas119 },
      { concepto: 'Compras internas no gravadas', casBase: '120', valBase: c.cas120, sinColLateral: true },
      { concepto: 'Compras importadas no gravadas', casBase: '122', valBase: c.cas122, sinColLateral: true },
      { concepto: 'TOTAL', casTrib: '178', valTrib: c.cas178, destacado: true, sinColLateral: true },
      { concepto: 'CRÉDITO FISCAL ESPECIAL', casTrib: '172', valTrib: c.cas172, destacado: true, sinColLateral: true },
      { concepto: 'COEFICIENTE', casBase: '173', valBase: c.cas173, esRatioBase: true, destacado: true, sinColLateral: true }
    ],
    [
      { texto: 'Nacionales', inicioIdx: 0, cantidad: 4 },
      { texto: 'Importadas', inicioIdx: 4, cantidad: 3 }
    ]
  );

  // IVAP
  agregarSeccionPag1('IVAP', 'IVAP', [
    { concepto: 'Ventas Gravadas', casBase: '340', valBase: c.cas340, casTrib: '341', valTrib: c.cas341, sinColLateral: true },
    { concepto: 'Otros Créditos IVAP', casTrib: '182', valTrib: c.cas182, sinColLateral: true }
  ]);

  // RENTA
  agregarSeccionPag1('RENTA', 'RENTA', [
    { concepto: 'Ingresos Netos', casBase: '301', valBase: c.cas301, casTrib: '312', valTrib: c.cas312, destacado: true, sinColLateral: true },
    { concepto: 'Coeficiente', casBase: '380', valBase: c.cas380, esRatioBase: true, sinColLateral: true },
    { concepto: 'Porcentaje', casBase: '315', valBase: c.cas315, sinColLateral: true },
    { concepto: 'Coeficiente Calculado (aplicado para el Cálculo de la Cas312)', casBase: '894', valBase: c.cas894, esRatioBase: true, sinColLateral: true },
    { concepto: 'Pagos a Cuenta en Exceso del Presente Ejercicio', casTrib: '336', valTrib: c.cas336, sinColLateral: true }
  ]);

  ws1.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 }
  };

  // =========================================================================
  // HOJA 2: PÁGINA 2 — DETERMINACIÓN DE LA DEUDA (8 columnas)
  // Col 1..2: Concepto | Col 3..4: IGV | Col 5..6: IVAP | Col 7..8: RENTA
  // =========================================================================
  const ws2 = wb.addWorksheet('Pag 2 - Deuda', { views: [{ showGridLines: true }] });
  ws2.columns = [
    { width: 12 },
    { width: 32 },
    { width: 5.5 },
    { width: 13.5 },
    { width: 5.5 },
    { width: 13.5 },
    { width: 5.5 },
    { width: 13.5 }
  ];
  escribirEncabezadoSunat(ws2, 2, 8);

  // Barra Determinación de la Deuda
  const rDet = ws2.addRow(['DETERMINACIÓN DE LA DEUDA', '', '', '', '', '', 'DETERMINACIÓN DE LA DEUDA', '']);
  rDet.height = 18;
  ws2.mergeCells(rDet.number, 1, rDet.number, 5);
  ws2.mergeCells(rDet.number, 6, rDet.number, 8);
  for (let col = 1; col <= 8; col++) {
    const cell = rDet.getCell(col);
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    cell.border = BORDER_THIN;
    cell.alignment = { horizontal: col >= 6 ? 'right' : 'left', vertical: 'middle' };
  }

  // Cabecera CONCEPTO | IGV | IVAP | RENTA
  const rHead2 = ws2.addRow(['CONCEPTO', '', 'IGV', '', 'IVAP', '', 'RENTA', '']);
  rHead2.height = 17;
  ws2.mergeCells(rHead2.number, 1, rHead2.number, 2);
  ws2.mergeCells(rHead2.number, 3, rHead2.number, 4);
  ws2.mergeCells(rHead2.number, 5, rHead2.number, 6);
  ws2.mergeCells(rHead2.number, 7, rHead2.number, 8);
  for (let col = 1; col <= 8; col++) {
    const cell = rHead2.getCell(col);
    cell.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: 'FF1E293B' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    cell.border = BORDER_THIN;
    cell.alignment = { horizontal: col <= 2 ? 'left' : 'center', vertical: 'middle' };
  }

  const filasDeuda: Array<{
    concepto: string;
    igv?: [string, number];
    ivap?: [string, number];
    renta?: [string, number];
    destacado?: boolean;
    esTotalFinal?: boolean;
  }> = [
    { concepto: 'Impuesto Resultante o Saldo a Favor', igv: ['140', c.cas140], ivap: ['353', c.cas353], renta: ['302', c.cas302] },
    { concepto: 'Saldo a Favor del Período anterior', igv: ['145', c.cas145], ivap: ['351', c.cas351], renta: ['303', c.cas303] },
    { concepto: 'Tributo a Pagar o Saldo a Favor', igv: ['184', c.cas184], ivap: ['352', c.cas352], renta: ['304', c.cas304], destacado: true },
    { concepto: 'Percepciones declaradas en el período', igv: ['171', c.cas171] },
    { concepto: 'Saldo de percepciones de períodos anteriores', igv: ['168', c.cas168] },
    { concepto: 'Saldo de percepciones no aplicadas', igv: ['164', c.cas164] },
    { concepto: 'Retenciones declaradas en el período', igv: ['179', c.cas179] },
    { concepto: 'Saldo de retenciones de períodos anteriores', igv: ['176', c.cas176] },
    { concepto: 'Saldo de Retenciones no aplicadas', igv: ['165', c.cas165] },
    { concepto: 'Retenciones de tercera declaradas en período', renta: ['326', c.cas326] },
    { concepto: 'Retenciones de tercera declaradas en periodos anteriores', renta: ['327', c.cas327] },
    { concepto: 'Compensación Saldo a Favor del Exportador', ivap: ['347', c.cas347], renta: ['305', c.cas305] },
    { concepto: 'Impuesto Temporal a los Activos Netos', renta: ['328', c.cas328] },
    { concepto: 'Sub Total', igv: ['681', c.cas681], ivap: ['683', c.cas683], renta: ['682', c.cas682], destacado: true },
    { concepto: 'Pagos previos', igv: ['185', c.cas185], ivap: ['342', c.cas342], renta: ['317', c.cas317] },
    { concepto: 'Interés moratorio', igv: ['187', c.cas187], ivap: ['343', c.cas343], renta: ['319', c.cas319] },
    { concepto: 'TOTAL DEUDA TRIBUTARIA', igv: ['188', c.cas188], ivap: ['344', c.cas344], renta: ['324', c.cas324], destacado: true, esTotalFinal: true }
  ];

  for (const fd of filasDeuda) {
    const valOpcional = (par?: [string, number]): [string, number | ''] => {
      if (!par) return ['', ''];
      const [cas, num] = par;
      const mostrar = num !== 0 || fd.destacado || fd.esTotalFinal;
      return [cas, mostrar ? Number(num.toFixed(2)) : ''];
    };
    const [casIgv, valIgv] = valOpcional(fd.igv);
    const [casIvap, valIvap] = valOpcional(fd.ivap);
    const [casRenta, valRenta] = valOpcional(fd.renta);

    const r = ws2.addRow([fd.concepto, '', casIgv, valIgv, casIvap, valIvap, casRenta, valRenta]);
    r.height = fd.esTotalFinal ? 20 : 16.5;
    ws2.mergeCells(r.number, 1, r.number, 2);

    const bg = fd.esTotalFinal ? 'FFE2E8F0' : fd.destacado ? 'FFF8FAFC' : 'FFFFFFFF';
    for (let col = 1; col <= 8; col++) {
      const cell = r.getCell(col);
      const esCas = (col === 3 && !!casIgv) || (col === 5 && !!casIvap) || (col === 7 && !!casRenta);
      cell.border = fd.destacado || fd.esTotalFinal ? BORDER_THIN : BORDER_LIGHT;
      if (esCas) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        cell.font = { name: 'Consolas', size: 8, bold: true, color: { argb: 'FF334155' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (col === 4 || col === 6 || col === 8) {
        const esNeg = typeof cell.value === 'number' && cell.value < 0;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.font = {
          name: 'Consolas',
          size: fd.esTotalFinal ? 9 : 8.5,
          bold: !!(fd.destacado || fd.esTotalFinal || esNeg),
          color: { argb: esNeg ? 'FFBE123C' : 'FF0F172A' }
        };
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        if (typeof cell.value === 'number') {
          cell.numFmt = '#,##0.00;-#,##0.00;0.00';
        }
      } else {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.font = { name: 'Calibri', size: fd.esTotalFinal ? 9 : 8.5, bold: !!(fd.destacado || fd.esTotalFinal), color: { argb: 'FF0F172A' } };
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      }
    }
  }

  // Bloque Resumen Ejecutivo Atlob Consultores
  ws2.addRow([]).height = 8;
  const rExecTit = ws2.addRow(['ATLOB CONSULTORES · RESUMEN EJECUTIVO DE OBLIGACIÓN MENSUAL']);
  rExecTit.height = 18;
  ws2.mergeCells(rExecTit.number, 1, rExecTit.number, 8);
  for (let col = 1; col <= 8; col++) {
    const cell = rExecTit.getCell(col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  }

  const rExec1 = ws2.addRow([
    'IGV Propio (1011)',
    '',
    'S/',
    Number(c.cas188.toFixed(2)),
    'Renta 3ra (3031)',
    '',
    'S/',
    Number(c.cas324.toFixed(2))
  ]);
  rExec1.height = 17;
  ws2.mergeCells(rExec1.number, 1, rExec1.number, 2);
  ws2.mergeCells(rExec1.number, 5, rExec1.number, 6);
  for (let col = 1; col <= 8; col++) {
    const cell = rExec1.getCell(col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.font = { name: col === 4 || col === 8 ? 'Consolas' : 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: col === 4 || col === 8 ? 'right' : col === 3 || col === 7 ? 'center' : 'left', vertical: 'middle' };
    if (col === 4 || col === 8) cell.numFmt = '#,##0.00';
  }

  const rExec2 = ws2.addRow([
    'Saldo a Favor IGV Próx. Mes',
    '',
    'S/',
    Number(c.saldoFavorArrastrable.toFixed(2)),
    'TOTAL A PAGAR SUNAT (GUÍA 1662 / NPS)',
    '',
    'S/',
    Number(c.totalDeudaGeneral.toFixed(2))
  ]);
  rExec2.height = 20;
  ws2.mergeCells(rExec2.number, 1, rExec2.number, 2);
  ws2.mergeCells(rExec2.number, 5, rExec2.number, 6);
  for (let col = 1; col <= 8; col++) {
    const cell = rExec2.getCell(col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    cell.font = {
      name: col === 4 || col === 8 ? 'Consolas' : 'Calibri',
      size: col >= 5 ? 10 : 8.5,
      bold: true,
      color: { argb: col === 8 ? 'FF34D399' : 'FFFFFFFF' }
    };
    cell.alignment = { horizontal: col === 4 || col === 8 ? 'right' : col === 3 || col === 7 ? 'center' : 'left', vertical: 'middle' };
    if (col === 4 || col === 8) cell.numFmt = '#,##0.00';
  }

  ws2.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 }
  };

  const rawBuf = await wb.xlsx.writeBuffer();
  if (rawBuf instanceof ArrayBuffer) return rawBuf;
  const view = new Uint8Array(rawBuf as any);
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}

export async function descargarPdt621Excel(params: Pdt621ResumenPdfParams): Promise<void> {
  const buffer = await generarPdt621ExcelBuffer(params);
  const nombreArchivo = `PDT621_${params.empresa.ruc}_${params.periodo.replace('-', '')}_V${params.version}.xlsx`;
  descargarArrayBufferXlsx(buffer, nombreArchivo);
}
