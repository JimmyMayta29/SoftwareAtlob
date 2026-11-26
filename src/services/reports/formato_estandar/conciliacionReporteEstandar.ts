import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ReporteConciliacionOficialV2 } from '../../../../server/types/conciliacionV2';
import {
  formatearFechaEstandar,
  formatearFechaHoraEmision24h,
} from './formatoEstandarEngine';

type EstiloReporte = 'estandar' | 'actual';

function formatearMontoCadena(valor: string | null | undefined, fallback = 'SIN EXTRACTO'): string {
  if (valor === null || valor === undefined || valor.trim() === '') {
    return fallback;
  }
  const limpio = valor.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(limpio);
  if (!match) return limpio;
  const signo = match[1];
  const entero = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimales = (match[3] ?? '00').padEnd(2, '0').slice(0, 2);
  return `${signo}${entero}.${decimales}`;
}

function obtenerUltimaY(doc: jsPDF, fallbackY: number): number {
  const lastTable = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return typeof lastTable?.finalY === 'number' ? lastTable.finalY : fallbackY;
}

function etiquetaSemaforo(semaforo: ReporteConciliacionOficialV2['cuadre']['semaforo']): {
  texto: string;
  rgb: [number, number, number];
} {
  switch (semaforo) {
    case 'VERDE':
      return { texto: 'VERDE (CUADRADO)', rgb: [21, 128, 61] };
    case 'AMARILLO':
      return { texto: 'AMARILLO (EN TOLERANCIA)', rgb: [180, 83, 9] };
    case 'ROJO':
      return { texto: 'ROJO (CON DIFERENCIA)', rgb: [185, 28, 28] };
    default:
      return { texto: 'SIN EXTRACTO', rgb: [71, 85, 105] };
  }
}

/**
 * Construye el documento jsPDF en formato estándar para el Reporte Oficial de Conciliación V2.
 */
export function generarReporteConciliacionPdfDoc(
  reporte: ReporteConciliacionOficialV2,
  estilo: EstiloReporte = 'estandar'
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const marginTop = 36;
  const marginBottom = 16;
  const usableWidth = pageWidth - marginX * 2;

  const primaryRgb: [number, number, number] = estilo === 'actual' ? [30, 58, 95] : [17, 24, 39];
  const mutedRgb: [number, number, number] = [90, 96, 106];
  const headFillColor: [number, number, number] = estilo === 'actual' ? [30, 58, 95] : [248, 250, 252];
  const headTextColor: [number, number, number] = estilo === 'actual' ? [255, 255, 255] : [0, 0, 0];
  const lineColor: [number, number, number] = estilo === 'actual' ? [45, 82, 128] : [60, 60, 60];
  const totalFillColor: [number, number, number] = [241, 245, 249];

  const emitidoStr = formatearFechaHoraEmision24h();
  const semaforoInfo = etiquetaSemaforo(reporte.cuadre.semaforo);

  const dibujarEncabezadoPagina = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.text(reporte.empresa.razonSocial.toUpperCase(), marginX, 8, { maxWidth: usableWidth * 0.62 });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
    doc.text(`R.U.C.: ${reporte.empresa.ruc}  ·  PERÍODO: ${reporte.periodo}`, marginX, 12);
    if (reporte.empresa.domicilioFiscal) {
      doc.text(reporte.empresa.domicilioFiscal, marginX, 15.5, { maxWidth: usableWidth * 0.62 });
    }

    doc.text(`Emitido: ${emitidoStr}`, pageWidth - marginX, 8, { align: 'right' });
    doc.text(`Estado: ${reporte.estado}  ·  Corte: ${formatearFechaEstandar(reporte.fechaCorte)}`, pageWidth - marginX, 12, {
      align: 'right',
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(semaforoInfo.rgb[0], semaforoInfo.rgb[1], semaforoInfo.rgb[2]);
    doc.text(`Semáforo: ${semaforoInfo.texto}`, pageWidth - marginX, 15.8, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.text('CONCILIACIÓN BANCARIA OFICIAL', pageWidth / 2, 23, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(0, 0, 0);
    doc.text(
      `Cuenta: ${reporte.cuenta.banco} — ${reporte.cuenta.numero} (${reporte.cuenta.moneda})  ·  PCGE: ${reporte.cuenta.cuentaContableCodigo}${reporte.cuenta.cci ? `  ·  CCI: ${reporte.cuenta.cci}` : ''}`,
      pageWidth / 2,
      27.8,
      { align: 'center', maxWidth: usableWidth }
    );

    doc.setDrawColor(lineColor[0], lineColor[1], lineColor[2]);
    doc.setLineWidth(0.3);
    doc.line(marginX, 31, pageWidth - marginX, 31);
  };

  // 1. Tabla dual Banco vs Libros
  autoTable(doc, {
    startY: marginTop,
    margin: { top: marginTop, bottom: marginBottom, left: marginX, right: marginX },
    tableWidth: usableWidth,
    theme: 'plain',
    head: [
      [
        {
          content: 'SEGÚN EXTRACTO BANCARIO',
          colSpan: 2,
          styles: { halign: 'center', fontStyle: 'bold', fillColor: headFillColor, textColor: headTextColor },
        },
        { content: '', styles: { fillColor: [255, 255, 255] } },
        {
          content: 'SEGÚN LIBROS CONTABLES',
          colSpan: 2,
          styles: { halign: 'center', fontStyle: 'bold', fillColor: headFillColor, textColor: headTextColor },
        },
      ],
    ],
    body: [
      [
        'Saldo Inicial Extracto (ref.)',
        formatearMontoCadena(reporte.cuadre.saldoInicialExtracto),
        '',
        'Saldo según Libros (Tesorería)',
        formatearMontoCadena(reporte.cuadre.saldoLibros, '0.00'),
      ],
      [
        'Saldo Final Extracto Bancario',
        formatearMontoCadena(reporte.cuadre.saldoFinalExtracto),
        '',
        '(+) Abonos No Registrados',
        formatearMontoCadena(reporte.cuadre.abonosNoRegistrados, '0.00'),
      ],
      [
        '(+) Depósitos en Tránsito',
        formatearMontoCadena(reporte.cuadre.depositosEnTransito, '0.00'),
        '',
        '(-) Cargos No Registrados',
        formatearMontoCadena(reporte.cuadre.cargosNoRegistrados, '0.00'),
      ],
      [
        '(-) Cheques / Egresos No Cobrados',
        formatearMontoCadena(reporte.cuadre.chequesNoCobrados, '0.00'),
        '',
        '',
        '',
      ],
      [
        { content: '(=) Saldo Ajustado Banco', styles: { fontStyle: 'bold', fillColor: totalFillColor } },
        {
          content: formatearMontoCadena(reporte.cuadre.saldoAjustadoBanco),
          styles: { fontStyle: 'bold', fillColor: totalFillColor },
        },
        '',
        { content: '(=) Saldo Ajustado Libros', styles: { fontStyle: 'bold', fillColor: totalFillColor } },
        {
          content: formatearMontoCadena(reporte.cuadre.saldoAjustadoLibros, '0.00'),
          styles: { fontStyle: 'bold', fillColor: totalFillColor },
        },
      ],
      [
        { content: 'Diferencia de Cuadre', styles: { fontStyle: 'bold', fillColor: totalFillColor } },
        {
          content: formatearMontoCadena(reporte.cuadre.diferencia, 'N/A'),
          styles: { fontStyle: 'bold', fillColor: totalFillColor },
        },
        '',
        { content: `Tolerancia: ${formatearMontoCadena(reporte.cuadre.toleranciaMonto, '0.00')}`, styles: { fontStyle: 'bold', fillColor: totalFillColor } },
        {
          content: semaforoInfo.texto,
          styles: { fontStyle: 'bold', fillColor: totalFillColor, textColor: semaforoInfo.rgb },
        },
      ],
    ],
    styles: {
      font: 'helvetica',
      fontSize: 7.4,
      cellPadding: 1.4,
      textColor: [0, 0, 0],
      lineWidth: 0.12,
      lineColor: [203, 213, 225],
    },
    columnStyles: {
      0: { cellWidth: 62, halign: 'left' },
      1: { cellWidth: 28, halign: 'right' },
      2: { cellWidth: 6, lineWidth: 0 },
      3: { cellWidth: 62, halign: 'left' },
      4: { cellWidth: 28, halign: 'right' },
    },
    didDrawPage: dibujarEncabezadoPagina,
  });

  // 2. Integridad Mayor 104x y Resumen de Partidas Conciliadas
  let nextY = obtenerUltimaY(doc, marginTop + 50) + 5;
  autoTable(doc, {
    startY: nextY,
    margin: { top: marginTop, bottom: marginBottom, left: marginX, right: marginX },
    tableWidth: usableWidth,
    theme: 'plain',
    head: [
      [
        {
          content: 'INTEGRIDAD MAYOR (CUENTA 104x) Y RESUMEN DE CONCILIACIÓN',
          colSpan: 4,
          styles: { halign: 'left', fontStyle: 'bold', fillColor: headFillColor, textColor: headTextColor },
        },
      ],
    ],
    body: [
      [
        'Cuenta PCGE Mayor',
        reporte.integridadMayor.cuentaContableCodigo ?? 'NO VINCULADA',
        'Estado Integridad',
        reporte.integridadMayor.alertaIntegridad ? 'ALERTA DE INTEGRIDAD' : 'CONFORME',
      ],
      [
        'Saldo Tesorería',
        formatearMontoCadena(reporte.integridadMayor.saldoTesoreria, '0.00'),
        'Saldo Mayor 104x',
        formatearMontoCadena(reporte.integridadMayor.saldoMayor104x, 'N/A'),
      ],
      [
        'Diferencia Integridad Mayor',
        formatearMontoCadena(reporte.integridadMayor.diferenciaIntegridadMayor, 'N/A'),
        'Extracto Conciliado / Libros Conciliados',
        `${reporte.partidasConciliadasResumen.totalExtractoConciliadas} (${formatearMontoCadena(reporte.partidasConciliadasResumen.montoExtractoConciliadas, '0.00')}) / ${reporte.partidasConciliadasResumen.totalLibrosConciliados} (${formatearMontoCadena(reporte.partidasConciliadasResumen.montoLibrosConciliados, '0.00')})`,
      ],
      ...(reporte.integridadMayor.motivoAlerta
        ? [[{ content: `Observación: ${reporte.integridadMayor.motivoAlerta}`, colSpan: 4, styles: { fontStyle: 'italic' as const } }]]
        : []),
    ],
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      cellPadding: 1.3,
      textColor: [0, 0, 0],
      lineWidth: 0.12,
      lineColor: [203, 213, 225],
    },
    columnStyles: {
      0: { cellWidth: 44, fontStyle: 'bold' },
      1: { cellWidth: 48, halign: 'right' },
      2: { cellWidth: 46, fontStyle: 'bold' },
      3: { cellWidth: 48, halign: 'right' },
    },
    didDrawPage: dibujarEncabezadoPagina,
  });

  // 3. Anexos de partidas pendientes
  const renderizarAnexo = (
    titulo: string,
    headCols: string[],
    rows: Array<Array<string>>,
    colWidths: number[],
    rightCols: number[]
  ) => {
    const startY = obtenerUltimaY(doc, marginTop) + 5;
    autoTable(doc, {
      startY,
      margin: { top: marginTop, bottom: marginBottom, left: marginX, right: marginX },
      tableWidth: usableWidth,
      theme: 'plain',
      head: [
        [
          {
            content: titulo,
            colSpan: headCols.length,
            styles: { halign: 'left', fontStyle: 'bold', fillColor: headFillColor, textColor: headTextColor },
          },
        ],
        headCols.map((h, i) => ({
          content: h,
          styles: {
            halign: rightCols.includes(i) ? ('right' as const) : ('left' as const),
            fontStyle: 'bold' as const,
            fillColor: [241, 245, 249] as [number, number, number],
            textColor: [0, 0, 0] as [number, number, number],
          },
        })),
      ],
      body:
        rows.length > 0
          ? rows
          : [[{ content: 'Sin partidas pendientes registradas.', colSpan: headCols.length, styles: { halign: 'center' as const, textColor: mutedRgb } }]],
      styles: {
        font: 'helvetica',
        fontSize: 6.8,
        cellPadding: 1.1,
        textColor: [0, 0, 0],
        lineWidth: 0.1,
        lineColor: [226, 232, 240],
        overflow: 'linebreak',
      },
      columnStyles: Object.fromEntries(
        colWidths.map((w, idx) => [
          idx,
          { cellWidth: w, halign: rightCols.includes(idx) ? 'right' : 'left' },
        ])
      ),
      didDrawPage: dibujarEncabezadoPagina,
    });
  };

  renderizarAnexo(
    `ANEXO 1: DEPÓSITOS EN TRÁNSITO (${reporte.anexos.depositosEnTransito.length}) — Total: ${formatearMontoCadena(reporte.cuadre.depositosEnTransito, '0.00')}`,
    ['Fecha', 'Operación / Ref.', 'Tercero', 'Glosa', 'Importe'],
    reporte.anexos.depositosEnTransito.map((d) => [
      formatearFechaEstandar(d.fecha),
      d.numeroOperacion ?? d.docRef ?? '-',
      d.anexoNombre ?? d.anexoRuc ?? '-',
      d.glosa,
      formatearMontoCadena(d.importe, '0.00'),
    ]),
    [22, 30, 42, 66, 26],
    [4]
  );

  renderizarAnexo(
    `ANEXO 2: CHEQUES Y EGRESOS NO COBRADOS (${reporte.anexos.chequesNoCobrados.length}) — Total: ${formatearMontoCadena(reporte.cuadre.chequesNoCobrados, '0.00')}`,
    ['Fecha', 'N° Cheque / Ref.', 'Beneficiario / Tercero', 'Glosa', 'Importe'],
    reporte.anexos.chequesNoCobrados.map((c) => [
      formatearFechaEstandar(c.fecha),
      c.numeroOperacion ?? c.docRef ?? '-',
      c.anexoNombre ?? c.anexoRuc ?? '-',
      c.glosa,
      formatearMontoCadena(c.importe, '0.00'),
    ]),
    [22, 30, 42, 66, 26],
    [4]
  );

  renderizarAnexo(
    `ANEXO 3: ABONOS NO REGISTRADOS EN LIBROS (${reporte.anexos.abonosNoRegistrados.length}) — Total: ${formatearMontoCadena(reporte.cuadre.abonosNoRegistrados, '0.00')}`,
    ['Fecha', 'Referencia', 'Descripción Extracto', 'Clasificación', 'Monto'],
    reporte.anexos.abonosNoRegistrados.map((a) => [
      formatearFechaEstandar(a.fecha),
      a.referencia ?? '-',
      a.descripcion,
      a.tipoClasificacion ?? '-',
      formatearMontoCadena(a.monto, '0.00'),
    ]),
    [22, 28, 82, 28, 26],
    [4]
  );

  renderizarAnexo(
    `ANEXO 4: CARGOS NO REGISTRADOS EN LIBROS (${reporte.anexos.cargosNoRegistrados.length}) — Total: ${formatearMontoCadena(reporte.cuadre.cargosNoRegistrados, '0.00')}`,
    ['Fecha', 'Referencia', 'Descripción Extracto', 'Clasificación', 'Monto'],
    reporte.anexos.cargosNoRegistrados.map((c) => [
      formatearFechaEstandar(c.fecha),
      c.referencia ?? '-',
      c.descripcion,
      c.tipoClasificacion ?? '-',
      formatearMontoCadena(c.monto, '0.00'),
    ]),
    [22, 28, 82, 28, 26],
    [4]
  );

  renderizarAnexo(
    `ANEXO 5: CONTROL DE CHEQUES BANCARIOS (${reporte.anexos.chequesControlDetalle.length})`,
    ['N° Cheque', 'Beneficiario', 'F. Giro', 'F. Cobro', 'Estado', 'Monto'],
    reporte.anexos.chequesControlDetalle.map((ch) => [
      ch.numeroCheque,
      ch.beneficiario,
      formatearFechaEstandar(ch.fechaGiro),
      formatearFechaEstandar(ch.fechaCobro),
      ch.estado,
      formatearMontoCadena(ch.monto, '0.00'),
    ]),
    [26, 62, 24, 24, 24, 26],
    [5]
  );

  // 4. Trazabilidad SHA-256 y 3 Firmas al final del documento
  nextY = obtenerUltimaY(doc, marginTop) + 6;
  if (nextY + 46 > pageHeight - marginBottom) {
    doc.addPage();
    dibujarEncabezadoPagina();
    nextY = marginTop + 2;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.text('TRAZABILIDAD CRIPTOGRÁFICA Y CIERRE', marginX, nextY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6);
  doc.setTextColor(40, 40, 40);
  doc.text(`SHA-256 Reporte: ${reporte.hashReporteSha256}`, marginX, nextY + 4.5);

  let yFirmaBase = nextY + 26;
  if (reporte.cierreOficial) {
    doc.text(
      `Cierre Oficial #${reporte.cierreOficial.numeroSecuencia ?? '-'}  ·  Fecha Cierre: ${reporte.cierreOficial.fechaCierre ?? '-'}  ·  Usuario: ${reporte.cierreOficial.cerradaPorEmail ?? reporte.cierreOficial.cerradaPor ?? '-'}`,
      marginX,
      nextY + 8.5,
      { maxWidth: usableWidth }
    );
    doc.text(
      `SHA-256 Snapshot Cierre: ${reporte.cierreOficial.hashSnapshotSha256 ?? '-'}`,
      marginX,
      nextY + 12.5
    );
    yFirmaBase = nextY + 32;
  }

  if (yFirmaBase + 14 > pageHeight - marginBottom) {
    doc.addPage();
    dibujarEncabezadoPagina();
    yFirmaBase = marginTop + 24;
  }

  const firmaAncho = 48;
  const xFirmas = [marginX + 6, pageWidth / 2 - firmaAncho / 2, pageWidth - marginX - firmaAncho - 6];
  const labelsFirmas = ['Elaborado por', 'Revisado por', 'Aprobado por'];

  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.28);
  xFirmas.forEach((xf, idx) => {
    doc.line(xf, yFirmaBase, xf + firmaAncho, yFirmaBase);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text(labelsFirmas[idx], xf + firmaAncho / 2, yFirmaBase + 4.5, { align: 'center' });
  });

  // Paginación final: Pág. X de Y
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
    doc.text(`Pág. ${i} de ${totalPages}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
  }

  doc.setProperties({
    title: `Conciliacion Bancaria Oficial ${reporte.periodo}`,
    subject: estilo === 'actual' ? 'Formato actual' : 'Formato estandar',
    author: 'ATLOB ERP',
  });

  return doc;
}

/**
 * Genera y descarga el PDF oficial de Conciliación Bancaria V2 en el navegador.
 */
export function descargarReporteConciliacionPdf(
  reporte: ReporteConciliacionOficialV2,
  estilo: EstiloReporte = 'estandar'
): void {
  const doc = generarReporteConciliacionPdfDoc(reporte, estilo);
  const periodoCompacto = reporte.periodo.replace(/[^0-9]/g, '');
  const cuentaLimpia = reporte.cuenta.numero.replace(/[^a-zA-Z0-9_-]/g, '');
  const nombreArchivo = `Conciliacion_Bancaria_${reporte.empresa.ruc}_${cuentaLimpia}_${periodoCompacto}.pdf`;
  doc.save(nombreArchivo);
}
