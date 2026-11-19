import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EmpresaCliente, Comprobante } from '../../../types';
import {
  descargarReporteEstandarExcel,
  generarReporteEstandarExcelBuffer,
  generarPdt621ExcelBuffer,
  descargarPdt621Excel,
  resolverCasillasOficialesPdt621
} from './excelEstandarEngine';

export {
  generarReporteEstandarExcelBuffer,
  generarPdt621ExcelBuffer,
  descargarPdt621Excel
};

export interface ColumnaReporteEstandar {
  id: string;
  label: string;
  subLabel?: string;
  align?: 'left' | 'center' | 'right';
  cellWidthPdf?: number;
  isNumeric?: boolean;
  sumar?: boolean;
}

export interface SuperHeaderColumna {
  label: string;
  colSpan: number;
}

export interface FilaGrupoReporteEstandar {
  grupoId: string;
  tituloGrupo: string; // ej: "Tipo Doc.: 01  FACTURA"
  filas: Array<Record<string, any>>;
  totalesGrupo: Record<string, number>;
}

export interface EstandarReportDefinition {
  titulo: string;
  orientacion: 'landscape' | 'portrait';
  empresa: {
    razonSocial: string;
    ruc: string;
    direccion: string;
    periodo: string;
  };
  moneda: string; // "SOLES"
  superHeaders?: SuperHeaderColumna[];
  columnas: ColumnaReporteEstandar[];
  grupos: FilaGrupoReporteEstandar[];
  totalesGenerales: Record<string, number>;
  mostrarFechaHoraImpresion?: boolean;
}

/**
 * Formatea importes en formato estándar:
 * - Coma para miles, punto para decimales (2 decimales fijos)
 * - Muestra 0.00 cuando es cero
 * - Negativos con signo menos (-150.00)
 */
export function formatearImporteEstandar(num: number | undefined | null): string {
  const val = typeof num === 'number' && !isNaN(num) ? num : 0;
  return val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Formatea fechas a formato d/mm/aaaa (día sin cero inicial)
 */
export function formatearFechaEstandar(fechaStr: string | undefined | null): string {
  if (!fechaStr) return '';
  const clean = fechaStr.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    const anio = parts[0];
    const mes = parts[1].padStart(2, '0');
    const dia = parts[2].padStart(2, '0');
    return `${dia}/${mes}/${anio}`;
  }
  return fechaStr;
}

/**
 * Formatea fecha y hora de emisión estricta en 24 horas: DD/MM/AAAA HH:mm:ss
 */
export function formatearFechaHoraEmision24h(fecha: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dia = pad(fecha.getDate());
  const mes = pad(fecha.getMonth() + 1);
  const anio = fecha.getFullYear();
  const horas = pad(fecha.getHours());
  const minutos = pad(fecha.getMinutes());
  const segundos = pad(fecha.getSeconds());
  return `${dia}/${mes}/${anio} ${horas}:${minutos}:${segundos}`;
}

const DESCRIPCION_TIPO_COMPROBANTE: Record<string, string> = {
  '01': 'FACTURA',
  '02': 'RECIBO POR HONORARIOS',
  '03': 'BOLETA DE VENTA',
  '07': 'NOTA DE CRÉDITO',
  '08': 'NOTA DE DÉBITO',
  '12': 'TICKET O CINTA EMITIDO POR MÁQUINA REGISTRADORA',
  '14': 'RECIBO POR SERVICIOS PÚBLICOS',
  '50': 'DECLARACIÓN ÚNICA DE ADUANAS (DUA)',
  '52': 'DESPACHO SIMPLIFICADO DE IMPORTACIÓN',
  '00': 'OTROS DOCUMENTOS'
};

/**
 * Convierte el periodo YYYY-MM en nombre del mes en mayúsculas
 */
function obtenerNombreMesPeriodo(periodo: string): string {
  const meses = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];
  if (periodo && periodo.includes('-')) {
    const mesNum = parseInt(periodo.split('-')[1], 10);
    if (mesNum >= 1 && mesNum <= 12) {
      return meses[mesNum - 1];
    }
  }
  return 'DEL EJERCICIO';
}

/**
 * Construye la definición tabular de 22 columnas para el REGISTRO DE COMPRAS
 */
export function construirDefinicionRegistroComprasEstandar(
  empresa: EmpresaCliente,
  compras: any[],
  periodo: string,
  opciones?: { mostrarFechaHora?: boolean }
): EstandarReportDefinition {
  const mesNombre = obtenerNombreMesPeriodo(periodo);
  const anio = periodo ? periodo.split('-')[0] : '2026';

  // 29 columnas del reporte calibradas exactamente a A4 Horizontal (287 mm útiles, margen 5 mm)
  const columnas: ColumnaReporteEstandar[] = [
    { id: 'orden', label: 'O', align: 'center', cellWidthPdf: 5 },
    { id: 'voucher', label: 'N° VOU', align: 'center', cellWidthPdf: 11 },
    { id: 'fechaEmision', label: 'F. Emis.', align: 'center', cellWidthPdf: 11.5 },
    { id: 'fechaVenc', label: 'F. Venc.', align: 'center', cellWidthPdf: 11.5 },
    // Documento
    { id: 'docTipo', label: 'T/D', subLabel: 'Doc', align: 'center', cellWidthPdf: 4.5 },
    { id: 'docSerie', label: 'Serie', subLabel: 'Doc', align: 'center', cellWidthPdf: 7.5 },
    { id: 'docNumero', label: 'Número', subLabel: 'Doc', align: 'left', cellWidthPdf: 11 },
    // Referencia
    { id: 'refFecha', label: 'Fecha', subLabel: 'Ref', align: 'center', cellWidthPdf: 10 },
    { id: 'refTipo', label: 'T/D', subLabel: 'Ref', align: 'center', cellWidthPdf: 4.5 },
    { id: 'refSerie', label: 'Serie', subLabel: 'Ref', align: 'center', cellWidthPdf: 6.5 },
    { id: 'refNumero', label: 'Número', subLabel: 'Ref', align: 'left', cellWidthPdf: 9.5 },
    // Proveedor
    { id: 'provTipoDoc', label: 'Doc', subLabel: 'Prov', align: 'center', cellWidthPdf: 4.5 },
    { id: 'provNumero', label: 'Número', subLabel: 'Prov', align: 'left', cellWidthPdf: 14 },
    { id: 'provRazon', label: 'Razón Social', subLabel: 'Prov', align: 'left', cellWidthPdf: 29 },
    // Bases e Impuestos
    { id: 'baseA', label: 'Base A 18%', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 12.5 },
    { id: 'baseB', label: 'Base B Pror.', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 10.5 },
    { id: 'baseC', label: 'Base C S/C', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 10.5 },
    { id: 'adqNoGrav', label: 'Adq. No Gr.', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 10.5 },
    { id: 'isc', label: 'I.S.C.', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 8.5 },
    { id: 'igvA', label: 'IGV 18%', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 11.5 },
    { id: 'igv10', label: 'IGV 10%', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 9.5 },
    { id: 'igvB', label: 'IGV B', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 9 },
    { id: 'igvC', label: 'IGV C', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 9 },
    { id: 'icbper', label: 'ICBPER', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 8.5 },
    { id: 'otrosTrib', label: 'Otros Trib.', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 9 },
    { id: 'total', label: 'Total', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 13 },
    { id: 'tipoCambio', label: 'T/C', align: 'right', isNumeric: true, cellWidthPdf: 7 },
    // Spot
    { id: 'spotFecha', label: 'Fecha', subLabel: 'Spot', align: 'center', cellWidthPdf: 10 },
    { id: 'spotNumero', label: 'Número', subLabel: 'Spot', align: 'left', cellWidthPdf: 8 }
  ];

  // Super-headers agrupados
  const superHeaders: SuperHeaderColumna[] = [
    { label: '', colSpan: 4 },
    { label: 'Documento', colSpan: 3 },
    { label: 'Referencia del Documento', colSpan: 4 },
    { label: 'Datos del Proveedor', colSpan: 3 },
    { label: 'Base Imponible y Crédito Fiscal', colSpan: 4 },
    { label: 'Tributos y Gravámenes', colSpan: 7 },
    { label: '', colSpan: 2 },
    { label: 'Constancia Detracción SPOT', colSpan: 2 }
  ];

  // Agrupar compras por tipo de comprobante
  const gruposMap = new Map<string, any[]>();
  compras.forEach((c) => {
    const tipo = c.tipoComprobante || c.tipoDoc || '01';
    if (!gruposMap.has(tipo)) {
      gruposMap.set(tipo, []);
    }
    gruposMap.get(tipo)!.push(c);
  });

  const tiposOrdenados = Array.from(gruposMap.keys()).sort();

  let correlativoGlobal = 0;
  const totalesGenerales: Record<string, number> = {
    baseA: 0,
    baseB: 0,
    baseC: 0,
    adqNoGrav: 0,
    isc: 0,
    igvA: 0,
    igv10: 0,
    igvB: 0,
    igvC: 0,
    icbper: 0,
    otrosTrib: 0,
    total: 0
  };

  const grupos: FilaGrupoReporteEstandar[] = tiposOrdenados.map((tipo) => {
    const comprasTipo = gruposMap.get(tipo)!;
    const descTipo = DESCRIPCION_TIPO_COMPROBANTE[tipo] || `TIPO ${tipo}`;
    const tituloGrupo = `Tipo Doc.: ${tipo}  ${descTipo}`;

    const totalesGrupo: Record<string, number> = {
      baseA: 0,
      baseB: 0,
      baseC: 0,
      adqNoGrav: 0,
      isc: 0,
      igvA: 0,
      igv10: 0,
      igvB: 0,
      igvC: 0,
      icbper: 0,
      otrosTrib: 0,
      total: 0
    };

    const filas = comprasTipo.map((c) => {
      correlativoGlobal++;

      // Extraer campos normalizados compatibles tanto con Comprobante (legacy) como CompraModel (API)
      const baseA = Number(c.baseGravada ?? c.baseImponibleGravada ?? 0);
      const baseB = Number(c.baseMixta ?? 0);
      const baseC = Number(c.baseSinCredito ?? 0);
      const adqNoGrav = Number(c.baseNoGravada ?? c.adquisicionesNoGravadas ?? c.exonerado ?? 0);
      const isc = Number(c.isc ?? 0);
      const igvA = Number(c.igv ?? 0);
      const igv10 = Number(c.igv10 ?? 0);
      const igvB = Number(c.igvB ?? 0);
      const igvC = Number(c.igvC ?? 0);
      const icbper = Number(c.icbper ?? 0);
      const otrosTrib = Number(c.otrosTributos ?? 0);
      const total = Number(c.total ?? 0);

      // Acumular en grupo
      totalesGrupo.baseA += baseA;
      totalesGrupo.baseB += baseB;
      totalesGrupo.baseC += baseC;
      totalesGrupo.adqNoGrav += adqNoGrav;
      totalesGrupo.isc += isc;
      totalesGrupo.igvA += igvA;
      totalesGrupo.igv10 += igv10;
      totalesGrupo.igvB += igvB;
      totalesGrupo.igvC += igvC;
      totalesGrupo.icbper += icbper;
      totalesGrupo.otrosTrib += otrosTrib;
      totalesGrupo.total += total;

      // Acumular en totales generales
      totalesGenerales.baseA += baseA;
      totalesGenerales.baseB += baseB;
      totalesGenerales.baseC += baseC;
      totalesGenerales.adqNoGrav += adqNoGrav;
      totalesGenerales.isc += isc;
      totalesGenerales.igvA += igvA;
      totalesGenerales.igv10 += igv10;
      totalesGenerales.igvB += igvB;
      totalesGenerales.igvC += igvC;
      totalesGenerales.icbper += icbper;
      totalesGenerales.otrosTrib += otrosTrib;
      totalesGenerales.total += total;

      const tc = Number(c.tipoCambio || 1.0);
      const voucherStr = c.asientoNumero || c.asientoGeneradoNumero || (c.asientoId ? c.asientoId.slice(-6) : `01${String(correlativoGlobal).padStart(4, '0')}`);

      return {
        orden: String(correlativoGlobal),
        voucher: voucherStr,
        fechaEmision: formatearFechaEstandar(c.fechaEmision),
        fechaVenc: formatearFechaEstandar(c.fechaVencimiento || c.fechaVenc),
        docTipo: c.tipoComprobante || c.tipoDoc || '01',
        docSerie: c.serie || '',
        docNumero: c.numero || '',
        refFecha: formatearFechaEstandar(c.docModificaFecha),
        refTipo: c.docModificaTipo || '',
        refSerie: c.docModificaSerie || '',
        refNumero: c.docModificaNumero || '',
        provTipoDoc: c.proveedorTipoDoc || '6',
        provNumero: c.proveedorRuc || c.rucEmisor || '',
        provRazon: (c.proveedorNombre || c.razonSocialEmisor || '').trim(),
        baseA,
        baseB,
        baseC,
        adqNoGrav,
        isc,
        igvA,
        igv10,
        igvB,
        igvC,
        icbper,
        otrosTrib,
        total,
        tipoCambio: tc > 1 ? tc.toFixed(3) : '',
        spotFecha: formatearFechaEstandar(c.detraccionFecha || c.spotFecha),
        spotNumero: c.detraccionNumero || c.spotNumero || ''
      };
    });

    return {
      grupoId: tipo,
      tituloGrupo,
      filas,
      totalesGrupo
    };
  });

  return {
    titulo: `REGISTRO DE COMPRAS DEL MES DE ${mesNombre}`,
    orientacion: 'landscape',
    empresa: {
      razonSocial: empresa.razonSocial || 'EMPRESA CONTABLE',
      ruc: empresa.ruc || '20000000001',
      direccion: empresa.direccionFiscal || 'LIMA - PERÚ',
      periodo: `${anio} - ${mesNombre}`
    },
    moneda: 'SOLES',
    superHeaders,
    columnas,
    grupos,
    totalesGenerales,
    mostrarFechaHoraImpresion: !!opciones?.mostrarFechaHora
  };
}

/**
 * Exporta el reporte a PDF cumpliendo con la especificación visual del formato estándar:
 * - Negro sobre blanco puro (#000000 sobre #FFFFFF)
 * - Sin colores de fondo, sin sombreado, sin degradados
 * - Tipografía fina (peso 300)
 * - Membrete legal formal a la izquierda y título centrado entre asteriscos
 * - Cabecera enmarcada repetida en cada página
 * - Filas sin bordes intermedios
 * - Cada grupo con subtítulo, línea fina y TOTALES:
 * - TOTAL GENERAL con línea superior y doble subrayado contable
 * - Pie de página centrado "Pag. N"
 */

/**
 * Construye la definición tabular para el REGISTRO DE VENTAS E INGRESOS (Formato 14.1 PLE)
 */
export function construirDefinicionRegistroVentasEstandar(
  empresa: EmpresaCliente,
  ventas: any[],
  periodo: string,
  opciones?: { mostrarFechaHora?: boolean }
): EstandarReportDefinition {
  const mesNombre = obtenerNombreMesPeriodo(periodo);
  const anio = periodo ? periodo.split('-')[0] : '2026';

  // 25 columnas calibradas exactamente a A4 Horizontal (287 mm útiles, margen 5 mm)
  const columnas: ColumnaReporteEstandar[] = [
    { id: 'orden', label: 'O', align: 'center', cellWidthPdf: 5 },
    { id: 'voucher', label: 'N° VOU', align: 'center', cellWidthPdf: 11 },
    { id: 'fechaEmision', label: 'F. Emis.', align: 'center', cellWidthPdf: 12 },
    { id: 'fechaVenc', label: 'F. Venc.', align: 'center', cellWidthPdf: 12 },
    { id: 'docTipo', label: 'T/D', subLabel: 'Doc', align: 'center', cellWidthPdf: 5 },
    { id: 'docSerie', label: 'Serie', subLabel: 'Doc', align: 'center', cellWidthPdf: 8 },
    { id: 'docNumero', label: 'Número', subLabel: 'Doc', align: 'left', cellWidthPdf: 12 },
    { id: 'refFecha', label: 'Fecha', subLabel: 'Ref', align: 'center', cellWidthPdf: 11 },
    { id: 'refTipo', label: 'T/D', subLabel: 'Ref', align: 'center', cellWidthPdf: 5 },
    { id: 'refSerie', label: 'Serie', subLabel: 'Ref', align: 'center', cellWidthPdf: 7.5 },
    { id: 'refNumero', label: 'Número', subLabel: 'Ref', align: 'left', cellWidthPdf: 10.5 },
    { id: 'cliTipoDoc', label: 'Doc', subLabel: 'Cli', align: 'center', cellWidthPdf: 5 },
    { id: 'cliNumero', label: 'Número', subLabel: 'Cli', align: 'left', cellWidthPdf: 15 },
    { id: 'cliRazon', label: 'Cliente / Razón Social', subLabel: 'Cli', align: 'left', cellWidthPdf: 36 },
    { id: 'valExp', label: 'Export.', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 12.5 },
    { id: 'baseGrav', label: 'Base 18%', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 14 },
    { id: 'exonerado', label: 'Exoner.', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 11.5 },
    { id: 'inafecto', label: 'Inafecta', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 11.5 },
    { id: 'isc', label: 'I.S.C.', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 10 },
    { id: 'igv', label: 'IGV 18%', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 13.5 },
    { id: 'igv10', label: 'IGV 10%', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 11 },
    { id: 'icbper', label: 'ICBPER', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 10 },
    { id: 'otrosTrib', label: 'Otros', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 11 },
    { id: 'total', label: 'Total', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 16 },
    { id: 'tipoCambio', label: 'T/C', align: 'right', isNumeric: true, cellWidthPdf: 11 }
  ];

  const superHeaders: SuperHeaderColumna[] = [
    { label: '', colSpan: 4 },
    { label: 'Comprobante de Pago', colSpan: 3 },
    { label: 'Referencia Comprobante Modificado', colSpan: 4 },
    { label: 'Información del Cliente', colSpan: 3 },
    { label: 'Bases Imponibles y Operaciones Gravadas / Exoneradas', colSpan: 4 },
    { label: 'Tributos y Gravámenes', colSpan: 5 },
    { label: '', colSpan: 2 }
  ];

  const gruposMap = new Map<string, any[]>();
  ventas.forEach((v) => {
    const tipo = v.tipoComprobante || v.tipoDoc || '01';
    if (!gruposMap.has(tipo)) gruposMap.set(tipo, []);
    gruposMap.get(tipo)!.push(v);
  });

  const tiposOrdenados = Array.from(gruposMap.keys()).sort();
  let correlativoGlobal = 0;
  const totalesGenerales: Record<string, number> = {
    valExp: 0,
    baseGrav: 0,
    exonerado: 0,
    inafecto: 0,
    isc: 0,
    igv: 0,
    igv10: 0,
    icbper: 0,
    otrosTrib: 0,
    total: 0
  };

  const grupos: FilaGrupoReporteEstandar[] = tiposOrdenados.map((tipo) => {
    const ventasTipo = gruposMap.get(tipo)!;
    const descTipo = DESCRIPCION_TIPO_COMPROBANTE[tipo] || `TIPO ${tipo}`;
    const tituloGrupo = `Tipo Doc.: ${tipo}  ${descTipo}`;

    const totalesGrupo: Record<string, number> = {
      valExp: 0,
      baseGrav: 0,
      exonerado: 0,
      inafecto: 0,
      isc: 0,
      igv: 0,
      igv10: 0,
      icbper: 0,
      otrosTrib: 0,
      total: 0
    };

    const filas = ventasTipo.map((v) => {
      correlativoGlobal++;
      const valExp = Number(v.valorExportacion ?? 0);
      const baseGrav = Number(v.baseGravada ?? v.baseImponibleGravada ?? 0);
      const exonerado = Number(v.exonerado ?? 0);
      const inafecto = Number(v.inafecto ?? 0);
      const isc = Number(v.isc ?? 0);
      const igv = Number(v.igv ?? 0);
      const igv10 = Number(v.igv10 ?? 0);
      const icbper = Number(v.icbper ?? 0);
      const otrosTrib = Number(v.otrosTributos ?? 0);
      const total = Number(v.total ?? 0);

      totalesGrupo.valExp += valExp;
      totalesGrupo.baseGrav += baseGrav;
      totalesGrupo.exonerado += exonerado;
      totalesGrupo.inafecto += inafecto;
      totalesGrupo.isc += isc;
      totalesGrupo.igv += igv;
      totalesGrupo.igv10 += igv10;
      totalesGrupo.icbper += icbper;
      totalesGrupo.otrosTrib += otrosTrib;
      totalesGrupo.total += total;

      totalesGenerales.valExp += valExp;
      totalesGenerales.baseGrav += baseGrav;
      totalesGenerales.exonerado += exonerado;
      totalesGenerales.inafecto += inafecto;
      totalesGenerales.isc += isc;
      totalesGenerales.igv += igv;
      totalesGenerales.igv10 += igv10;
      totalesGenerales.icbper += icbper;
      totalesGenerales.otrosTrib += otrosTrib;
      totalesGenerales.total += total;

      const tc = Number(v.tipoCambio || 1.0);
      const voucherStr = v.asientoNumero || v.asientoGeneradoNumero || `02${String(correlativoGlobal).padStart(4, '0')}`;

      return {
        orden: String(correlativoGlobal),
        voucher: voucherStr,
        fechaEmision: formatearFechaEstandar(v.fechaEmision),
        fechaVenc: formatearFechaEstandar(v.fechaVencimiento || v.fechaVenc),
        docTipo: v.tipoComprobante || v.tipoDoc || '01',
        docSerie: v.serie || '',
        docNumero: v.numero || '',
        refFecha: formatearFechaEstandar(v.docModificaFecha),
        refTipo: v.docModificaTipo || '',
        refSerie: v.docModificaSerie || '',
        refNumero: v.docModificaNumero || '',
        cliTipoDoc: v.clienteTipoDoc || '6',
        cliNumero: v.clienteRuc || v.rucReceptor || '',
        cliRazon: (v.clienteNombre || v.razonSocialReceptor || '').trim(),
        valExp,
        baseGrav,
        exonerado,
        inafecto,
        isc,
        igv,
        igv10,
        icbper,
        otrosTrib,
        total,
        tipoCambio: tc > 1 ? tc.toFixed(3) : ''
      };
    });

    return {
      grupoId: tipo,
      tituloGrupo,
      filas,
      totalesGrupo
    };
  });

  return {
    titulo: `REGISTRO DE VENTAS E INGRESOS DEL MES DE ${mesNombre}`,
    orientacion: 'landscape',
    empresa: {
      razonSocial: empresa.razonSocial || 'EMPRESA CONTABLE',
      ruc: empresa.ruc || '20000000001',
      direccion: empresa.direccionFiscal || 'LIMA - PERÚ',
      periodo: `${anio} - ${mesNombre}`
    },
    moneda: 'SOLES',
    superHeaders,
    columnas,
    grupos,
    totalesGenerales,
    mostrarFechaHoraImpresion: !!opciones?.mostrarFechaHora
  };
}

/**
 * Construye la definición tabular para el LIBRO DIARIO (Formato 5.1 PLE)
 */
export function construirDefinicionLibroDiarioEstandar(
  empresa: EmpresaCliente,
  asientos: any[],
  periodo: string,
  opciones?: { mostrarFechaHora?: boolean }
): EstandarReportDefinition {
  const mesNombre = obtenerNombreMesPeriodo(periodo);
  const anio = periodo ? periodo.split('-')[0] : '2026';

  // 10 columnas calibradas exactamente a A4 Vertical (198 mm útiles, margen 6 mm)
  const columnas: ColumnaReporteEstandar[] = [
    { id: 'cuo', label: 'CUO', align: 'center', cellWidthPdf: 15 },
    { id: 'fecha', label: 'Fecha', align: 'center', cellWidthPdf: 13.5 },
    { id: 'glosa', label: 'Glosa / Descripción', align: 'left', cellWidthPdf: 37.5 },
    { id: 'codLibro', label: 'Libro', align: 'center', cellWidthPdf: 10 },
    { id: 'voucher', label: 'N° VOU', align: 'center', cellWidthPdf: 13.5 },
    { id: 'docSustentatorio', label: 'Doc. Sust.', align: 'left', cellWidthPdf: 18 },
    { id: 'cuentaCodigo', label: 'Cuenta', align: 'center', cellWidthPdf: 12.5 },
    { id: 'cuentaDenominacion', label: 'Denominación de la Cuenta', align: 'left', cellWidthPdf: 40 },
    { id: 'debe', label: 'Debe (S/)', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 19 },
    { id: 'haber', label: 'Haber (S/)', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 19 }
  ];

  const superHeaders: SuperHeaderColumna[] = [
    { label: 'Operación Contable', colSpan: 3 },
    { label: 'Referencia', colSpan: 3 },
    { label: 'Cuenta Contable Asociada (PCGE)', colSpan: 2 },
    { label: 'Movimiento (Soles)', colSpan: 2 }
  ];

  const subdiariosNombres: Record<string, string> = {
    '00': 'APERTURA',
    '01': 'COMPRAS',
    '02': 'VENTAS',
    '03': 'PLANILLA',
    '04': 'CAJA Y BANCOS',
    '05': 'DIARIO GENERAL',
    '06': 'HONORARIOS',
    '07': 'PROVISIONES',
    '08': 'AJUSTES',
    '09': 'CIERRE'
  };

  const gruposMap = new Map<string, any[]>();
  asientos.forEach((a) => {
    const sub = a.subdiario || a.subdiarioId || '05';
    if (!gruposMap.has(sub)) gruposMap.set(sub, []);
    gruposMap.get(sub)!.push(a);
  });

  const subsOrdenados = Array.from(gruposMap.keys()).sort();
  const totalesGenerales: Record<string, number> = { debe: 0, haber: 0 };

  const grupos: FilaGrupoReporteEstandar[] = subsOrdenados.map((sub) => {
    const asientosSub = gruposMap.get(sub)!;
    const descSub = subdiariosNombres[sub] || `SUBDIARIO ${sub}`;
    const tituloGrupo = `SUBDIARIO: ${sub} - ${descSub}`;

    const totalesGrupo: Record<string, number> = { debe: 0, haber: 0 };
    const filas: any[] = [];

    asientosSub.forEach((a) => {
      const cuoVal = a.cuo || a.numeroAsiento || a.numero || 'AST-0001';
      const fechaVal = formatearFechaEstandar(a.fechaContable || a.fecha);
      const glosaGen = a.glosa || a.glosaGeneral || 'Asiento contable';
      const codLibro = a.codigoLibro || (sub === '01' ? '080100' : sub === '02' ? '140100' : '050100');
      const vouVal = a.numeroAsiento || a.numeroVoucher || a.numero || cuoVal;

      const lineas = a.items || a.lineas || a.detalles || [];
      lineas.forEach((l: any) => {
        const d = Number(l.debe || 0);
        const h = Number(l.haber || 0);
        totalesGrupo.debe += d;
        totalesGrupo.haber += h;
        totalesGenerales.debe += d;
        totalesGenerales.haber += h;

        const docRef = l.docSerie && l.docNumero 
          ? `${l.docSerie}-${l.docNumero}` 
          : l.numeroComprobante || (a.documentoReferencia || '-');

        filas.push({
          cuo: cuoVal,
          fecha: fechaVal,
          glosa: l.glosa || glosaGen,
          codLibro,
          voucher: vouVal,
          docSustentatorio: docRef,
          cuentaCodigo: l.codigoCuenta || l.cuentaCodigo || l.codigo || l.cuentaId || '1011',
          cuentaDenominacion: l.denominacionCuenta || l.cuentaDenominacion || l.denominacion || 'Cuenta PCGE',
          debe: d,
          haber: h
        });
      });
    });

    return {
      grupoId: sub,
      tituloGrupo,
      filas,
      totalesGrupo
    };
  });

  return {
    titulo: `LIBRO DIARIO DEL MES DE ${mesNombre}`,
    orientacion: 'portrait',
    empresa: {
      razonSocial: empresa.razonSocial || 'EMPRESA CONTABLE',
      ruc: empresa.ruc || '20000000001',
      direccion: empresa.direccionFiscal || 'LIMA - PERÚ',
      periodo: `${anio} - ${mesNombre}`
    },
    moneda: 'SOLES',
    superHeaders,
    columnas,
    grupos,
    totalesGenerales,
    mostrarFechaHoraImpresion: !!opciones?.mostrarFechaHora
  };
}

/**
 * Construye la definición tabular para el LIBRO MAYOR (Formato 6.1 PLE)
 */
export function construirDefinicionLibroMayorEstandar(
  empresa: EmpresaCliente,
  asientos: any[],
  periodo: string,
  opciones?: { mostrarFechaHora?: boolean }
): EstandarReportDefinition {
  const mesNombre = obtenerNombreMesPeriodo(periodo);
  const anio = periodo ? periodo.split('-')[0] : '2026';

  // 8 columnas calibradas exactamente a A4 Vertical (198 mm útiles, margen 6 mm)
  const columnas: ColumnaReporteEstandar[] = [
    { id: 'fecha', label: 'Fecha', align: 'center', cellWidthPdf: 14.5 },
    { id: 'cuo', label: 'CUO / Asiento', align: 'center', cellWidthPdf: 18 },
    { id: 'voucher', label: 'N° VOU', align: 'center', cellWidthPdf: 15.5 },
    { id: 'glosa', label: 'Glosa de la Operación', align: 'left', cellWidthPdf: 66 },
    { id: 'debe', label: 'Debe (S/)', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 21 },
    { id: 'haber', label: 'Haber (S/)', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 21 },
    { id: 'saldoDeudor', label: 'Saldo Deudor', align: 'right', isNumeric: true, cellWidthPdf: 21 },
    { id: 'saldoAcreedor', label: 'Saldo Acreedor', align: 'right', isNumeric: true, cellWidthPdf: 21 }
  ];

  const superHeaders: SuperHeaderColumna[] = [
    { label: 'Datos de la Operación Contable', colSpan: 4 },
    { label: 'Movimientos del Período', colSpan: 2 },
    { label: 'Saldos Acumulados', colSpan: 2 }
  ];

  const movimientosPorCuenta = new Map<string, { denominacion: string; lineas: any[] }>();

  asientos.forEach((a) => {
    const cuo = a.cuo || a.numeroAsiento || a.numero || 'AST-0001';
    const vou = a.numeroAsiento || a.numeroVoucher || a.numero || cuo;
    const fecha = formatearFechaEstandar(a.fechaContable || a.fecha);
    const glosaGen = a.glosa || a.glosaGeneral || 'Operación contable';

    const lineas = a.items || a.lineas || a.detalles || [];
    lineas.forEach((l: any) => {
      const cta = String(l.codigoCuenta || l.cuentaCodigo || l.codigo || l.cuentaId || '1011');
      const nom = l.denominacionCuenta || l.cuentaDenominacion || l.denominacion || 'Cuenta PCGE';

      if (!movimientosPorCuenta.has(cta)) {
        movimientosPorCuenta.set(cta, { denominacion: nom, lineas: [] });
      }
      movimientosPorCuenta.get(cta)!.lineas.push({
        fecha,
        cuo,
        voucher: vou,
        glosa: l.glosa || glosaGen,
        debe: Number(l.debe || 0),
        haber: Number(l.haber || 0)
      });
    });
  });

  const cuentasOrdenadas = Array.from(movimientosPorCuenta.keys()).sort();
  const totalesGenerales: Record<string, number> = { debe: 0, haber: 0 };

  const grupos: FilaGrupoReporteEstandar[] = cuentasOrdenadas.map((cta) => {
    const cuentaData = movimientosPorCuenta.get(cta)!;
    const tituloGrupo = `CUENTA: ${cta} - ${cuentaData.denominacion.toUpperCase()}`;

    const totalesGrupo: Record<string, number> = { debe: 0, haber: 0 };
    let saldoAcum = 0;

    const filas = cuentaData.lineas.map((l) => {
      totalesGrupo.debe += l.debe;
      totalesGrupo.haber += l.haber;
      totalesGenerales.debe += l.debe;
      totalesGenerales.haber += l.haber;

      saldoAcum += (l.debe - l.haber);

      return {
        fecha: l.fecha,
        cuo: l.cuo,
        voucher: l.voucher,
        glosa: l.glosa,
        debe: l.debe,
        haber: l.haber,
        saldoDeudor: saldoAcum >= 0 ? saldoAcum : 0,
        saldoAcreedor: saldoAcum < 0 ? Math.abs(saldoAcum) : 0
      };
    });

    return {
      grupoId: cta,
      tituloGrupo,
      filas,
      totalesGrupo
    };
  });

  return {
    titulo: `LIBRO MAYOR DEL MES DE ${mesNombre}`,
    orientacion: 'portrait',
    empresa: {
      razonSocial: empresa.razonSocial || 'EMPRESA CONTABLE',
      ruc: empresa.ruc || '20000000001',
      direccion: empresa.direccionFiscal || 'LIMA - PERÚ',
      periodo: `${anio} - ${mesNombre}`
    },
    moneda: 'SOLES',
    superHeaders,
    columnas,
    grupos,
    totalesGenerales,
    mostrarFechaHoraImpresion: !!opciones?.mostrarFechaHora
  };
}

/**
 * Construye la definición tabular para el BALANCE DE COMPROBACIÓN (Hoja de Trabajo 10 Columnas)
 */
export function construirDefinicionHojaTrabajo10ColEstandar(
  empresa: EmpresaCliente,
  asientos: any[],
  periodo: string,
  opciones?: { mostrarFechaHora?: boolean }
): EstandarReportDefinition {
  const mesNombre = obtenerNombreMesPeriodo(periodo);
  const anio = periodo ? periodo.split('-')[0] : '2026';

  // 12 columnas calibradas exactamente a A4 Horizontal (283 mm útiles, margen 7 mm)
  const columnas: ColumnaReporteEstandar[] = [
    { id: 'codigo', label: 'Cuenta', align: 'center', cellWidthPdf: 15 },
    { id: 'denominacion', label: 'Denominación de la Cuenta', align: 'left', cellWidthPdf: 58 },
    { id: 'debeMayor', label: 'Debe', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 21 },
    { id: 'haberMayor', label: 'Haber', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 21 },
    { id: 'saldoDeudor', label: 'Deudor', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 21 },
    { id: 'saldoAcreedor', label: 'Acreedor', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 21 },
    { id: 'ajusteDebe', label: 'Debe', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 21 },
    { id: 'ajusteHaber', label: 'Haber', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 21 },
    { id: 'balanceActivo', label: 'Activo', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 21 },
    { id: 'balancePasivo', label: 'Pasivo/Pat.', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 21 },
    { id: 'resultadoPerdida', label: 'Pérdidas', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 21 },
    { id: 'resultadoGanancia', label: 'Ganancias', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 21 }
  ];

  const superHeaders: SuperHeaderColumna[] = [
    { label: 'Cuenta PCGE', colSpan: 2 },
    { label: 'Sumas del Mayor', colSpan: 2 },
    { label: 'Saldos del Período', colSpan: 2 },
    { label: 'Ajustes / Transf.', colSpan: 2 },
    { label: 'Balance de Situación', colSpan: 2 },
    { label: 'Resultados del Ejercicio', colSpan: 2 }
  ];

  const cuentasMap = new Map<string, { denominacion: string; debe: number; haber: number }>();

  asientos.forEach((a) => {
    const lineas = a.items || a.lineas || a.detalles || [];
    lineas.forEach((l: any) => {
      const cta = String(l.codigoCuenta || l.cuentaCodigo || l.codigo || l.cuentaId || '1011');
      const nom = l.denominacionCuenta || l.cuentaDenominacion || l.denominacion || 'Cuenta contable';
      const d = Number(l.debe || 0);
      const h = Number(l.haber || 0);

      if (!cuentasMap.has(cta)) {
        cuentasMap.set(cta, { denominacion: nom, debe: 0, haber: 0 });
      }
      const item = cuentasMap.get(cta)!;
      item.debe += d;
      item.haber += h;
    });
  });

  const totalesGenerales: Record<string, number> = {
    debeMayor: 0,
    haberMayor: 0,
    saldoDeudor: 0,
    saldoAcreedor: 0,
    ajusteDebe: 0,
    ajusteHaber: 0,
    balanceActivo: 0,
    balancePasivo: 0,
    resultadoPerdida: 0,
    resultadoGanancia: 0
  };

  const elementosMap = new Map<string, any[]>();
  const nombresElementos: Record<string, string> = {
    '1': 'ELEMENTO 1 - ACTIVO DISPONIBLE Y EXIGIBLE',
    '2': 'ELEMENTO 2 - ACTIVO REALIZABLE',
    '3': 'ELEMENTO 3 - ACTIVO INMOVILIZADO',
    '4': 'ELEMENTO 4 - PASIVO',
    '5': 'ELEMENTO 5 - PATRIMONIO NETO',
    '6': 'ELEMENTO 6 - GASTOS POR NATURALEZA',
    '7': 'ELEMENTO 7 - INGRESOS',
    '8': 'ELEMENTO 8 - SALDOS INTERMEDIARIOS DE GESTIÓN',
    '9': 'ELEMENTO 9 - CUENTAS ANALÍTICAS DE EXPLOTACIÓN'
  };

  Array.from(cuentasMap.keys()).sort().forEach((cta) => {
    const elem = cta.charAt(0);
    if (!elementosMap.has(elem)) elementosMap.set(elem, []);

    const c = cuentasMap.get(cta)!;
    const diff = c.debe - c.haber;
    const deudor = diff > 0 ? diff : 0;
    const acreedor = diff < 0 ? Math.abs(diff) : 0;

    let ajusteD = 0;
    let ajusteH = 0;
    let balActivo = 0;
    let balPasivo = 0;
    let resPerdida = 0;
    let resGanancia = 0;

    if (elem === '6' && (cta.startsWith('69') || cta.startsWith('61'))) {
      ajusteD = deudor;
      ajusteH = acreedor;
    } else if (elem === '9' || cta.startsWith('79')) {
      ajusteD = deudor;
      ajusteH = acreedor;
    }

    if (['1', '2', '3'].includes(elem)) {
      balActivo = deudor;
      balPasivo = acreedor;
    } else if (['4', '5'].includes(elem)) {
      balActivo = deudor;
      balPasivo = acreedor;
    } else if (['6', '9'].includes(elem)) {
      resPerdida = deudor;
      resGanancia = acreedor;
    } else if (['7'].includes(elem)) {
      resPerdida = deudor;
      resGanancia = acreedor;
    }

    elementosMap.get(elem)!.push({
      codigo: cta,
      denominacion: c.denominacion,
      debeMayor: c.debe,
      haberMayor: c.haber,
      saldoDeudor: deudor,
      saldoAcreedor: acreedor,
      ajusteDebe: ajusteD,
      ajusteHaber: ajusteH,
      balanceActivo: balActivo,
      balancePasivo: balPasivo,
      resultadoPerdida: resPerdida,
      resultadoGanancia: resGanancia
    });
  });

  const grupos: FilaGrupoReporteEstandar[] = Array.from(elementosMap.keys()).sort().map((elem) => {
    const filas = elementosMap.get(elem)!;
    const tituloGrupo = nombresElementos[elem] || `ELEMENTO ${elem}`;

    const totalesGrupo: Record<string, number> = {
      debeMayor: 0,
      haberMayor: 0,
      saldoDeudor: 0,
      saldoAcreedor: 0,
      ajusteDebe: 0,
      ajusteHaber: 0,
      balanceActivo: 0,
      balancePasivo: 0,
      resultadoPerdida: 0,
      resultadoGanancia: 0
    };

    filas.forEach((f) => {
      Object.keys(totalesGrupo).forEach((k) => {
        totalesGrupo[k] += (f[k] || 0);
        totalesGenerales[k] += (f[k] || 0);
      });
    });

    return {
      grupoId: elem,
      tituloGrupo,
      filas,
      totalesGrupo
    };
  });

  return {
    titulo: `BALANCE DE COMPROBACIÓN — HOJA DE TRABAJO (10 COLUMNAS) ${anio}`,
    orientacion: 'landscape',
    empresa: {
      razonSocial: empresa.razonSocial || 'EMPRESA CONTABLE',
      ruc: empresa.ruc || '20000000001',
      direccion: empresa.direccionFiscal || 'LIMA - PERÚ',
      periodo: `EJERCICIO ${anio}`
    },
    moneda: 'SOLES',
    superHeaders,
    columnas,
    grupos,
    totalesGenerales,
    mostrarFechaHoraImpresion: !!opciones?.mostrarFechaHora
  };
}

/**
 * Construye la definición tabular para el ESTADO DE SITUACIÓN FINANCIERA (Formato 3.1)
 */
export function construirDefinicionEstadoSituacionFinancieraEstandar(
  empresa: EmpresaCliente,
  dataEEFF: any,
  periodo: string,
  opciones?: { mostrarFechaHora?: boolean }
): EstandarReportDefinition {
  const anio = periodo ? periodo.split('-')[0] : '2026';

  // 5 columnas calibradas exactamente a A4 Vertical (190 mm útiles, margen 10 mm)
  const columnas: ColumnaReporteEstandar[] = [
    { id: 'codigo', label: 'Código', align: 'center', cellWidthPdf: 16 },
    { id: 'rubro', label: 'Rubro / Concepto Financiero', align: 'left', cellWidthPdf: 94 },
    { id: 'nota', label: 'Nota', align: 'center', cellWidthPdf: 14 },
    { id: 'ejercicioActual', label: `Ejercicio ${anio} (S/)`, align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 33 },
    { id: 'ejercicioAnterior', label: `Ejercicio ${Number(anio) - 1} (S/)`, align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 33 }
  ];

  const superHeaders: SuperHeaderColumna[] = [
    { label: 'Clasificación Financiera Oficial', colSpan: 3 },
    { label: 'Importes al Cierre del Período', colSpan: 2 }
  ];

  const gruposDef = [
    {
      id: 'ACT_CTE',
      titulo: '1. ACTIVO CORRIENTE',
      filas: [
        { codigo: '10', rubro: 'Efectivo y equivalentes de efectivo', nota: '3', ejercicioActual: Number(dataEEFF?.efectivo || 125000), ejercicioAnterior: 110000 },
        { codigo: '12', rubro: 'Cuentas por cobrar comerciales - Terceros', nota: '4', ejercicioActual: Number(dataEEFF?.cuentasPorCobrar || 45200), ejercicioAnterior: 38000 },
        { codigo: '20', rubro: 'Inventarios / Mercaderías manufacturadas', nota: '5', ejercicioActual: Number(dataEEFF?.inventarios || 78400), ejercicioAnterior: 65000 },
        { codigo: '18', rubro: 'Servicios y otros contratados por anticipado', nota: '6', ejercicioActual: 6200, ejercicioAnterior: 4500 }
      ]
    },
    {
      id: 'ACT_NO_CTE',
      titulo: '2. ACTIVO NO CORRIENTE',
      filas: [
        { codigo: '33', rubro: 'Propiedad, planta y equipo (Costo neto)', nota: '7', ejercicioActual: Number(dataEEFF?.activoFijo || 185000), ejercicioAnterior: 195000 },
        { codigo: '34', rubro: 'Intangibles distintos de la plusvalía', nota: '8', ejercicioActual: 12000, ejercicioAnterior: 15000 }
      ]
    },
    {
      id: 'PAS_CTE',
      titulo: '3. PASIVO CORRIENTE',
      filas: [
        { codigo: '40', rubro: 'Tributos, contraprestaciones y aportes por pagar', nota: '9', ejercicioActual: Number(dataEEFF?.tributosPorPagar || 14800), ejercicioAnterior: 12500 },
        { codigo: '41', rubro: 'Remuneraciones y participaciones por pagar', nota: '10', ejercicioActual: Number(dataEEFF?.remuneracionesPorPagar || 18900), ejercicioAnterior: 16800 },
        { codigo: '42', rubro: 'Cuentas por pagar comerciales - Terceros', nota: '11', ejercicioActual: Number(dataEEFF?.cuentasPorPagar || 62100), ejercicioAnterior: 54000 }
      ]
    },
    {
      id: 'PAT_NETO',
      titulo: '4. PATRIMONIO NETO',
      filas: [
        { codigo: '50', rubro: 'Capital social emitido', nota: '12', ejercicioActual: Number(dataEEFF?.capitalSocial || 250000), ejercicioAnterior: 250000 },
        { codigo: '58', rubro: 'Reservas legales', nota: '13', ejercicioActual: 25000, ejercicioAnterior: 20000 },
        { codigo: '59', rubro: 'Resultados acumulados y del ejercicio', nota: '14', ejercicioActual: Number(dataEEFF?.resultadosAcumulados || 81000), ejercicioAnterior: 69200 }
      ]
    }
  ];

  const totalesGenerales: Record<string, number> = { ejercicioActual: 0, ejercicioAnterior: 0 };
  const grupos: FilaGrupoReporteEstandar[] = gruposDef.map((g) => {
    const totalesGrupo: Record<string, number> = { ejercicioActual: 0, ejercicioAnterior: 0 };
    g.filas.forEach((f) => {
      totalesGrupo.ejercicioActual += f.ejercicioActual;
      totalesGrupo.ejercicioAnterior += f.ejercicioAnterior;
      totalesGenerales.ejercicioActual += f.ejercicioActual;
      totalesGenerales.ejercicioAnterior += f.ejercicioAnterior;
    });

    return {
      grupoId: g.id,
      tituloGrupo: g.titulo,
      filas: g.filas,
      totalesGrupo
    };
  });

  return {
    titulo: 'ESTADO DE SITUACIÓN FINANCIERA (BALANCE GENERAL)',
    orientacion: 'portrait',
    empresa: {
      razonSocial: empresa.razonSocial || 'EMPRESA CONTABLE',
      ruc: empresa.ruc || '20000000001',
      direccion: empresa.direccionFiscal || 'LIMA - PERÚ',
      periodo: `AL 31 DE DICIEMBRE DE ${anio}`
    },
    moneda: 'SOLES',
    superHeaders,
    columnas,
    grupos,
    totalesGenerales,
    mostrarFechaHoraImpresion: !!opciones?.mostrarFechaHora
  };
}

/**
 * Construye la definición tabular para el ESTADO DE RESULTADOS (Formato 3.20)
 */
export function construirDefinicionEstadoResultadosEstandar(
  empresa: EmpresaCliente,
  dataEEFF: any,
  periodo: string,
  opciones?: { mostrarFechaHora?: boolean }
): EstandarReportDefinition {
  const anio = periodo ? periodo.split('-')[0] : '2026';

  // 4 columnas calibradas exactamente a A4 Vertical (190 mm útiles, margen 10 mm)
  const columnas: ColumnaReporteEstandar[] = [
    { id: 'rubro', label: 'Concepto / Rubro del Estado de Resultados', align: 'left', cellWidthPdf: 108 },
    { id: 'nota', label: 'Nota', align: 'center', cellWidthPdf: 14 },
    { id: 'ejercicioActual', label: `Ejercicio ${anio} (S/)`, align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 34 },
    { id: 'ejercicioAnterior', label: `Ejercicio ${Number(anio) - 1} (S/)`, align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 34 }
  ];

  const superHeaders: SuperHeaderColumna[] = [
    { label: 'Estructura Financiera por Función y Naturaleza', colSpan: 2 },
    { label: 'Resultados del Ejercicio (Soles)', colSpan: 2 }
  ];

  const gruposDef = [
    {
      id: 'ING_OP',
      titulo: '1. INGRESOS Y MARGEN BRUTO',
      filas: [
        { rubro: 'Ventas netas de bienes y servicios (Terceros)', nota: '15', ejercicioActual: Number(dataEEFF?.ventasNetas || 320000), ejercicioAnterior: 290000 },
        { rubro: '(-) Costo de ventas de mercaderías', nota: '16', ejercicioActual: -Number(dataEEFF?.costoVentas || 185000), ejercicioAnterior: -168000 }
      ]
    },
    {
      id: 'GAS_OP',
      titulo: '2. GASTOS DE OPERACIÓN',
      filas: [
        { rubro: '(-) Gastos de administración', nota: '17', ejercicioActual: -Number(dataEEFF?.gastosAdmin || 42000), ejercicioAnterior: -38000 },
        { rubro: '(-) Gastos de ventas y comercialización', nota: '18', ejercicioActual: -Number(dataEEFF?.gastosVentas || 28000), ejercicioAnterior: -25000 }
      ]
    },
    {
      id: 'RES_FIN',
      titulo: '3. INGRESOS Y GASTOS FINANCIEROS',
      filas: [
        { rubro: 'Ingresos financieros y diferencia de cambio a favor', nota: '19', ejercicioActual: 3200, ejercicioAnterior: 2800 },
        { rubro: '(-) Gastos financieros y comisiones bancarias', nota: '20', ejercicioActual: -1800, ejercicioAnterior: -1500 }
      ]
    },
    {
      id: 'IMP_RENTA',
      titulo: '4. IMPUESTO A LA RENTA Y RESULTADO NETO',
      filas: [
        { rubro: '(-) Impuesto a la renta del ejercicio (Régimen General / MYPE)', nota: '21', ejercicioActual: -Number(dataEEFF?.impuestoRenta || 19500), ejercicioAnterior: -17200 },
        { rubro: 'UTILIDAD NETA DEL EJERCICIO', nota: '', ejercicioActual: Number(dataEEFF?.utilidadNeta || 46900), ejercicioAnterior: 43100 }
      ]
    }
  ];

  const totalesGenerales: Record<string, number> = { ejercicioActual: 0, ejercicioAnterior: 0 };
  const grupos: FilaGrupoReporteEstandar[] = gruposDef.map((g) => {
    const totalesGrupo: Record<string, number> = { ejercicioActual: 0, ejercicioAnterior: 0 };
    g.filas.forEach((f) => {
      totalesGrupo.ejercicioActual += f.ejercicioActual;
      totalesGrupo.ejercicioAnterior += f.ejercicioAnterior;
      totalesGenerales.ejercicioActual += f.ejercicioActual;
      totalesGenerales.ejercicioAnterior += f.ejercicioAnterior;
    });

    return {
      grupoId: g.id,
      tituloGrupo: g.titulo,
      filas: g.filas,
      totalesGrupo
    };
  });

  return {
    titulo: 'ESTADO DE RESULTADOS POR FUNCIÓN Y NATURALEZA',
    orientacion: 'portrait',
    empresa: {
      razonSocial: empresa.razonSocial || 'EMPRESA CONTABLE',
      ruc: empresa.ruc || '20000000001',
      direccion: empresa.direccionFiscal || 'LIMA - PERÚ',
      periodo: `EJERCICIO ${anio}`
    },
    moneda: 'SOLES',
    superHeaders,
    columnas,
    grupos,
    totalesGenerales,
    mostrarFechaHoraImpresion: !!opciones?.mostrarFechaHora
  };
}

/**
 * Construye la definición tabular para el ESTADO DE FLUJOS DE EFECTIVO (Formato 3.18)
 */
export function construirDefinicionFlujoEfectivoEstandar(
  empresa: EmpresaCliente,
  dataEEFF: any,
  periodo: string,
  opciones?: { mostrarFechaHora?: boolean }
): EstandarReportDefinition {
  const anio = periodo ? periodo.split('-')[0] : '2026';

  // 3 columnas calibradas exactamente a A4 Vertical (190 mm útiles, margen 10 mm)
  const columnas: ColumnaReporteEstandar[] = [
    { id: 'rubro', label: 'Concepto del Flujo de Efectivo', align: 'left', cellWidthPdf: 132 },
    { id: 'nota', label: 'Nota', align: 'center', cellWidthPdf: 18 },
    { id: 'importe', label: 'Flujo Neto (S/)', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 40 }
  ];

  const superHeaders: SuperHeaderColumna[] = [
    { label: 'Método Directo SUNAT (Formato 3.18)', colSpan: 2 },
    { label: 'Importe (Soles)', colSpan: 1 }
  ];

  const gruposDef = [
    {
      id: 'FLUJO_OP',
      titulo: '1. ACTIVIDADES DE OPERACIÓN',
      filas: [
        { rubro: 'Cobranza de la venta de bienes y prestación de servicios', nota: 'A', importe: Number(dataEEFF?.cobranzaClientes || 310000) },
        { rubro: '(-) Pagos a proveedores por el suministro de bienes y servicios', nota: 'B', importe: -Number(dataEEFF?.pagoProveedores || 195000) },
        { rubro: '(-) Pagos de remuneraciones y beneficios sociales al personal', nota: 'C', importe: -Number(dataEEFF?.pagoPlanilla || 52000) },
        { rubro: '(-) Pagos de tributos y gravámenes a SUNAT y EsSalud', nota: 'D', importe: -Number(dataEEFF?.pagoTributos || 18500) }
      ]
    },
    {
      id: 'FLUJO_INV',
      titulo: '2. ACTIVIDADES DE INVERSIÓN',
      filas: [
        { rubro: '(-) Pagos por compra de propiedad, planta y equipo', nota: 'E', importe: -15000 },
        { rubro: 'Cobranza por venta de activos fijos en desuso', nota: 'F', importe: 2500 }
      ]
    },
    {
      id: 'FLUJO_FIN',
      titulo: '3. ACTIVIDADES DE FINANCIAMIENTO',
      filas: [
        { rubro: 'Obtención de préstamos de entidades financieras', nota: 'G', importe: 20000 },
        { rubro: '(-) Amortización de pasivos financieros y leasing', nota: 'H', importe: -12000 }
      ]
    },
    {
      id: 'SALDO_EFECTIVO',
      titulo: '4. CONCILIACIÓN DEL SALDO DE EFECTIVO',
      filas: [
        { rubro: 'AUMENTO (DISMINUCIÓN) NETO DE EFECTIVO DEL EJERCICIO', nota: '', importe: 40000 },
        { rubro: 'Saldo de efectivo y equivalentes al inicio del ejercicio', nota: '', importe: 85000 },
        { rubro: 'SALDO DE EFECTIVO Y EQUIVALENTES AL CIERRE DEL EJERCICIO', nota: '', importe: 125000 }
      ]
    }
  ];

  const totalesGenerales: Record<string, number> = { importe: 0 };
  const grupos: FilaGrupoReporteEstandar[] = gruposDef.map((g) => {
    const totalesGrupo: Record<string, number> = { importe: 0 };
    g.filas.forEach((f) => {
      totalesGrupo.importe += f.importe;
      totalesGenerales.importe += f.importe;
    });

    return {
      grupoId: g.id,
      tituloGrupo: g.titulo,
      filas: g.filas,
      totalesGrupo
    };
  });

  return {
    titulo: 'ESTADO DE FLUJOS DE EFECTIVO (MÉTODO DIRECTO)',
    orientacion: 'portrait',
    empresa: {
      razonSocial: empresa.razonSocial || 'EMPRESA CONTABLE',
      ruc: empresa.ruc || '20000000001',
      direccion: empresa.direccionFiscal || 'LIMA - PERÚ',
      periodo: `EJERCICIO ${anio}`
    },
    moneda: 'SOLES',
    superHeaders,
    columnas,
    grupos,
    totalesGenerales,
    mostrarFechaHoraImpresion: !!opciones?.mostrarFechaHora
  };
}

/**
 * Construye la definición tabular para LIBRO CAJA Y BANCOS (Formatos 1.1 y 1.2)
 */
export function construirDefinicionCajaBancosEstandar(
  empresa: EmpresaCliente,
  movimientos: any[],
  periodo: string,
  formato: '1.1' | '1.2' = '1.2',
  opciones?: { mostrarFechaHora?: boolean }
): EstandarReportDefinition {
  const mesNombre = obtenerNombreMesPeriodo(periodo);
  const anio = periodo ? periodo.split('-')[0] : '2026';
  const esCtaCte = formato === '1.2';

  // 9 columnas calibradas exactamente a A4 Horizontal (283 mm útiles, margen 7 mm)
  const columnas: ColumnaReporteEstandar[] = [
    { id: 'correlativo', label: 'N° Corr', align: 'center', cellWidthPdf: 15 },
    { id: 'fecha', label: 'Fecha Oper.', align: 'center', cellWidthPdf: 16 },
    { id: 'medioPago', label: 'Medio Pago', align: 'center', cellWidthPdf: 22 },
    { id: 'glosa', label: 'Descripción / Glosa de la Operación', align: 'left', cellWidthPdf: 76 },
    { id: 'cuentaCodigo', label: 'Cta PCGE', align: 'center', cellWidthPdf: 16 },
    { id: 'cuentaDenominacion', label: 'Denominación de la Cuenta', align: 'left', cellWidthPdf: 60 },
    { id: 'debe', label: esCtaCte ? 'Depósitos (Debe)' : 'Entradas (Debe)', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 26 },
    { id: 'haber', label: esCtaCte ? 'Giros (Haber)' : 'Salidas (Haber)', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 26 },
    { id: 'saldo', label: 'Saldo (S/)', align: 'right', isNumeric: true, cellWidthPdf: 26 }
  ];

  const superHeaders: SuperHeaderColumna[] = [
    { label: 'Operación Bancaria / Caja', colSpan: 4 },
    { label: 'Cuenta Contable Asociada', colSpan: 2 },
    { label: 'Movimientos y Saldos (Soles)', colSpan: 3 }
  ];

  let saldo = 0;
  const totalesGenerales: Record<string, number> = { debe: 0, haber: 0 };
  const filas = (movimientos || []).map((m, idx) => {
    const debe = m.tipo === 'INGRESO' || m.debe > 0 ? Number(m.monto || m.debe || 0) : 0;
    const haber = m.tipo === 'EGRESO' || m.haber > 0 ? Number(m.monto || m.haber || 0) : 0;
    totalesGenerales.debe += debe;
    totalesGenerales.haber += haber;
    saldo += (debe - haber);

    return {
      correlativo: m.correlativo || String(idx + 1).padStart(4, '0'),
      fecha: formatearFechaEstandar(m.fecha),
      medioPago: m.medioPago || (esCtaCte ? '003 - TRANSF' : '008 - EFECTIVO'),
      glosa: m.glosa || m.descripcion || 'Operación de fondos',
      cuentaCodigo: m.cuentaContable || (debe > 0 ? '1212' : '4212'),
      cuentaDenominacion: m.denominacion || (debe > 0 ? 'Cobranza comercial' : 'Pago a proveedor'),
      debe,
      haber,
      saldo
    };
  });

  const grupos: FilaGrupoReporteEstandar[] = [
    {
      grupoId: 'MOVIMIENTOS',
      tituloGrupo: esCtaCte 
        ? 'CUENTA CORRIENTE BCP SOLES N° 193-4819283-0-21' 
        : 'MOVIMIENTOS DE CAJA EFECTIVO (FONDO FIJO)',
      filas,
      totalesGrupo: { ...totalesGenerales }
    }
  ];

  return {
    titulo: esCtaCte
      ? `LIBRO CAJA Y BANCOS — CTA. CTE. (FORMATO 1.2) DEL MES DE ${mesNombre}`
      : `LIBRO CAJA Y BANCOS — EFECTIVO (FORMATO 1.1) DEL MES DE ${mesNombre}`,
    orientacion: 'landscape',
    empresa: {
      razonSocial: empresa.razonSocial || 'EMPRESA CONTABLE',
      ruc: empresa.ruc || '20000000001',
      direccion: empresa.direccionFiscal || 'LIMA - PERÚ',
      periodo: `${anio} - ${mesNombre}`
    },
    moneda: 'SOLES',
    superHeaders,
    columnas,
    grupos,
    totalesGenerales,
    mostrarFechaHoraImpresion: !!opciones?.mostrarFechaHora
  };
}

/**
 * Construye la definición tabular para el VOUCHER CONTABLE INDIVIDUAL (Comprobante de Diario)
 */
export function construirDefinicionVoucherContableEstandar(
  empresa: EmpresaCliente,
  asiento: any,
  opciones?: { mostrarFechaHora?: boolean }
): EstandarReportDefinition {
  const vouNumero = asiento.numeroAsiento || asiento.numeroVoucher || asiento.numero || 'AST-0001';
  const subdiario = asiento.subdiario || asiento.subdiarioId || '05';
  const fecha = formatearFechaEstandar(asiento.fechaContable || asiento.fecha);
  const periodo = asiento.periodo || '2026-09';
  const glosa = asiento.glosa || asiento.glosaGeneral || 'Asiento contable de diario';

  // 9 columnas calibradas exactamente a A4 Horizontal (283 mm útiles, margen 7 mm)
  const columnas: ColumnaReporteEstandar[] = [
    { id: 'linea', label: 'Nº', align: 'center', cellWidthPdf: 9 },
    { id: 'codigoCuenta', label: 'Cuenta PCGE', align: 'center', cellWidthPdf: 18 },
    { id: 'denominacion', label: 'Denominación de la Cuenta', align: 'left', cellWidthPdf: 68 },
    { id: 'centroCosto', label: 'C.Costo', align: 'center', cellWidthPdf: 16 },
    { id: 'docRef', label: 'Doc. Referencia', align: 'center', cellWidthPdf: 26 },
    { id: 'anexo', label: 'Anexo (RUC/DNI)', align: 'left', cellWidthPdf: 28 },
    { id: 'glosaLinea', label: 'Glosa de la Línea', align: 'left', cellWidthPdf: 66 },
    { id: 'debe', label: 'Debe (S/)', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 26 },
    { id: 'haber', label: 'Haber (S/)', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 26 }
  ];

  const superHeaders: SuperHeaderColumna[] = [
    { label: 'Imputación Contable', colSpan: 4 },
    { label: 'Documentación y Referencia', colSpan: 3 },
    { label: 'Movimientos (Soles)', colSpan: 2 }
  ];

  const lineas = asiento.lineas || asiento.detalles || [];
  const totalesGenerales: Record<string, number> = { debe: 0, haber: 0 };

  const filas = lineas.map((l: any, idx: number) => {
    const d = Number(l.debe || 0);
    const h = Number(l.haber || 0);
    totalesGenerales.debe += d;
    totalesGenerales.haber += h;

    const docStr = l.docSerie && l.docNumero 
      ? `${l.docSerie}-${l.docNumero}` 
      : l.numeroComprobante || (asiento.documentoReferencia || '-');

    return {
      linea: l.linea || String(idx + 1),
      codigoCuenta: l.codigoCuenta || l.cuentaCodigo || l.codigo || l.cuentaId || '1011',
      denominacion: l.denominacionCuenta || l.cuentaDenominacion || l.denominacion || 'Cuenta PCGE',
      centroCosto: l.centroCosto || '-',
      docRef: docStr,
      anexo: l.anexoNumDoc || l.anexoNumero || l.anexoId || '-',
      glosaLinea: l.glosa || glosa,
      debe: d,
      haber: h
    };
  });

  const grupos: FilaGrupoReporteEstandar[] = [
    {
      grupoId: 'DETALLE_VOUCHER',
      tituloGrupo: `VOUCHER N° ${vouNumero} | SUBDIARIO: ${subdiario} | FECHA: ${fecha} | GLOSA: ${glosa}`,
      filas,
      totalesGrupo: { ...totalesGenerales }
    }
  ];

  return {
    titulo: `COMPROBANTE DE DIARIO (VOUCHER CONTABLE) N° ${vouNumero}`,
    orientacion: 'landscape',
    empresa: {
      razonSocial: empresa.razonSocial || 'EMPRESA CONTABLE',
      ruc: empresa.ruc || '20000000001',
      direccion: empresa.direccionFiscal || 'LIMA - PERÚ',
      periodo: `PERIODO ${periodo}`
    },
    moneda: 'SOLES',
    superHeaders,
    columnas,
    grupos,
    totalesGenerales,
    mostrarFechaHoraImpresion: !!opciones?.mostrarFechaHora
  };
}


export function generarReporteEstandarPdfDoc(
  def: EstandarReportDefinition,
  estilo: 'estandar' | 'actual' = 'estandar'
): jsPDF {
  const tituloLimpio = def.titulo.replace(/\*/g, '').trim().toUpperCase();
  const doc = new jsPDF({
    orientation: def.orientacion,
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const numCols = def.columnas.length;
  const esDenso = def.orientacion === 'landscape' && numCols >= 20;
  const esPortraitDenso = def.orientacion === 'portrait' && numCols >= 8;

  // Márgenes calibrados estrictamente a A4 (297×210 landscape / 210×297 portrait)
  const marginX = esDenso ? 5 : esPortraitDenso ? 6 : def.orientacion === 'portrait' ? 10 : 7;
  const marginTop = def.orientacion === 'portrait' ? 32 : 28;
  const marginBottom = 13;
  const usableWidth = Number((pageWidth - marginX * 2).toFixed(2));

  const bodyFontSize = esDenso ? 4.7 : esPortraitDenso ? 5.7 : def.orientacion === 'portrait' ? 7.4 : 6.1;
  const headFontSize = esDenso ? 4.4 : esPortraitDenso ? 5.6 : def.orientacion === 'portrait' ? 7.3 : 6.0;
  const cellPad = esDenso ? 0.45 : esPortraitDenso ? 0.65 : def.orientacion === 'portrait' ? 1.3 : 0.75;

  // Normalización matemática exacta de anchos de columna al ancho útil A4 (0 mm de desborde)
  const rawWidths = def.columnas.map((c) => (c.cellWidthPdf && c.cellWidthPdf > 0 ? c.cellWidthPdf : 15));
  const rawSum = rawWidths.reduce((acc, w) => acc + w, 0) || usableWidth;
  const scaleFactor = usableWidth / rawSum;
  const scaledWidths = rawWidths.map((w) => Number((w * scaleFactor).toFixed(2)));
  const residual = Number((usableWidth - scaledWidths.reduce((acc, w) => acc + w, 0)).toFixed(2));
  let wideColIdx = 0;
  for (let i = 1; i < scaledWidths.length; i++) {
    if (scaledWidths[i] > scaledWidths[wideColIdx]) wideColIdx = i;
  }
  scaledWidths[wideColIdx] = Number((scaledWidths[wideColIdx] + residual).toFixed(2));

  const footFillColor: [number, number, number] = estilo === 'actual' ? [241, 245, 249] : [255, 255, 255];
  const footTextColor: [number, number, number] = estilo === 'actual' ? [17, 24, 39] : [0, 0, 0];
  const headFillColor: [number, number, number] = estilo === 'actual' ? [30, 58, 95] : [248, 250, 252];
  const headTextColor: [number, number, number] = estilo === 'actual' ? [255, 255, 255] : [0, 0, 0];
  const headLineColor: [number, number, number] = estilo === 'actual' ? [45, 82, 128] : [0, 0, 0];

  // Encabezados para autoTable
  const headRows: any[] = [];

  if (def.superHeaders && def.superHeaders.length > 0) {
    headRows.push(
      def.superHeaders.map((sh) => ({
        content: sh.label,
        colSpan: sh.colSpan,
        styles: {
          halign: 'center' as const,
          valign: 'middle' as const,
          fontStyle: 'bold' as const,
          fillColor: headFillColor,
          textColor: headTextColor,
          lineWidth: 0.15,
          lineColor: headLineColor,
          overflow: 'linebreak' as const
        }
      }))
    );
  }

  headRows.push(
    def.columnas.map((col) => ({
      content: col.label,
      styles: {
        halign: col.align || 'center',
        valign: 'middle' as const,
        fontStyle: 'bold' as const,
        fillColor: headFillColor,
        textColor: headTextColor,
        lineWidth: 0.15,
        lineColor: headLineColor,
        overflow: 'linebreak' as const
      }
    }))
  );

  // Construir filas del cuerpo agrupadas con colSpan limpio en filas de totales
  const firstSumIdx = def.columnas.findIndex((c) => c.isNumeric && c.sumar);
  const bodyRows: any[] = [];

  const construirFilaTotalesPdf = (
    etiqueta: string,
    totalesMap: Record<string, number>,
    esGranTotal: boolean
  ) => {
    const lineWidthObj = esGranTotal
      ? { top: 0.3, bottom: 0.6, left: 0, right: 0 }
      : { top: 0.2, bottom: 0.2, left: 0, right: 0 };
    const fill = esGranTotal ? footFillColor : ([255, 255, 255] as [number, number, number]);
    const textCol = esGranTotal ? footTextColor : ([0, 0, 0] as [number, number, number]);
    const pad = esGranTotal
      ? { top: 1.6, bottom: 2.0, left: cellPad, right: cellPad }
      : { top: 1.2, bottom: 1.4, left: cellPad, right: cellPad };

    const row: any[] = [];
    if (firstSumIdx > 0) {
      row.push({
        content: etiqueta,
        colSpan: firstSumIdx,
        styles: {
          fontStyle: 'bold' as const,
          textColor: textCol,
          fillColor: fill,
          halign: 'right' as const,
          lineWidth: lineWidthObj,
          lineColor: [0, 0, 0] as [number, number, number],
          cellPadding: pad
        }
      });
      for (let i = firstSumIdx; i < numCols; i++) {
        const col = def.columnas[i];
        row.push({
          content: col.isNumeric && col.sumar ? formatearImporteEstandar(totalesMap[col.id]) : '',
          styles: {
            fontStyle: 'bold' as const,
            textColor: textCol,
            fillColor: fill,
            halign: col.align || 'right',
            lineWidth: lineWidthObj,
            lineColor: [0, 0, 0] as [number, number, number],
            cellPadding: pad
          }
        });
      }
    } else {
      def.columnas.forEach((col, idx) => {
        row.push({
          content: idx === 0 ? etiqueta : col.isNumeric && col.sumar ? formatearImporteEstandar(totalesMap[col.id]) : '',
          styles: {
            fontStyle: 'bold' as const,
            textColor: textCol,
            fillColor: fill,
            halign: idx === 0 ? 'left' : col.align || 'right',
            lineWidth: lineWidthObj,
            lineColor: [0, 0, 0] as [number, number, number],
            cellPadding: pad
          }
        });
      });
    }
    return row;
  };

  def.grupos.forEach((grupo) => {
    bodyRows.push([
      {
        content: grupo.tituloGrupo,
        colSpan: numCols,
        styles: {
          fontStyle: 'bold',
          textColor: [0, 0, 0],
          fillColor: estilo === 'actual' ? [239, 246, 255] : [250, 250, 250],
          halign: 'left',
          cellPadding: { top: 1.6, bottom: 1.1, left: 1, right: 1 }
        }
      }
    ]);

    grupo.filas.forEach((fila) => {
      const rowData = def.columnas.map((col) => {
        const raw = fila[col.id];
        if (col.isNumeric) {
          if ((raw === '' || raw === undefined || raw === null) && !col.sumar) return '';
          if (col.id === 'tipoCambio') {
            const num = typeof raw === 'number' ? raw : parseFloat(String(raw));
            return Number.isNaN(num) || num === 0 ? '' : num.toFixed(3);
          }
          return formatearImporteEstandar(typeof raw === 'number' ? raw : parseFloat(String(raw)) || 0);
        }
        return raw !== undefined && raw !== null ? String(raw) : '';
      });
      bodyRows.push(rowData);
    });

    bodyRows.push(construirFilaTotalesPdf('TOTALES:', grupo.totalesGrupo, false));
  });

  const footRows = [construirFilaTotalesPdf('TOTAL GENERAL:', def.totalesGenerales, true)];

  // Estilos por columna exactamente ajustados a usableWidth
  const columnStyles: Record<number, any> = {};
  def.columnas.forEach((col, idx) => {
    const esDescriptiva = !col.isNumeric && /razon|glosa|denominacion|rubro|concepto/i.test(col.id);
    columnStyles[idx] = {
      halign: col.align || 'left',
      cellWidth: scaledWidths[idx],
      overflow: esDescriptiva && !esDenso ? 'linebreak' : 'ellipsize'
    };
  });

  autoTable(doc, {
    head: headRows,
    body: bodyRows,
    foot: footRows,
    tableWidth: usableWidth,
    showFoot: 'lastPage',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    startY: marginTop,
    margin: { top: marginTop, bottom: marginBottom, left: marginX, right: marginX },
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontStyle: 'normal',
      fontSize: bodyFontSize,
      cellPadding: cellPad,
      textColor: [0, 0, 0],
      overflow: 'ellipsize',
      valign: 'middle'
    },
    headStyles: {
      font: 'helvetica',
      fontStyle: 'bold',
      fontSize: headFontSize,
      textColor: headTextColor,
      fillColor: headFillColor,
      lineWidth: 0.15,
      lineColor: headLineColor,
      overflow: 'linebreak'
    },
    alternateRowStyles: estilo === 'actual' ? {
      fillColor: [248, 250, 252] as [number, number, number]
    } : undefined,
    columnStyles,
    didDrawPage: () => {
      const esPortrait = def.orientacion === 'portrait';

      // 1. Membrete Superior Izquierdo (acotado para no invadir fecha/título)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(esPortrait ? 8 : 8.5);
      doc.setTextColor(0, 0, 0);
      const maxIzqW = esPortrait ? usableWidth - 46 : usableWidth * 0.34;
      doc.text(def.empresa.razonSocial.toUpperCase(), marginX, 7.5, { maxWidth: maxIzqW });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.text(`PERIODO ${def.empresa.periodo}`, marginX, 11.2);
      doc.text(def.empresa.direccion || '', marginX, 14.5, { maxWidth: maxIzqW });
      doc.text(`R.U.C.: ${def.empresa.ruc}`, marginX, 17.8);

      // 2. Fecha y Hora de Impresión en 24h a la derecha
      if (def.mostrarFechaHoraImpresion) {
        const fechaHora = `Emitido: ${formatearFechaHoraEmision24h()}`;
        doc.setFontSize(6);
        doc.setTextColor(60, 60, 60);
        doc.text(fechaHora, pageWidth - marginX, 7.5, { align: 'right' });
      }
      doc.setFontSize(6);
      doc.setTextColor(90, 90, 90);
      doc.text(
        esPortrait ? 'Formato A4 Vertical' : 'Formato A4 Horizontal',
        pageWidth - marginX,
        11,
        { align: 'right' }
      );

      // 3. Título Central sin asteriscos ni solapamientos
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(esPortrait ? 8.8 : 9.2);
      if (esPortrait) {
        doc.text(tituloLimpio, pageWidth / 2, 23.2, { align: 'center', maxWidth: usableWidth });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.text(`(${def.moneda.toUpperCase()})`, pageWidth / 2, 27.3, { align: 'center' });
      } else {
        doc.text(tituloLimpio, pageWidth / 2, 11.5, { align: 'center', maxWidth: usableWidth * 0.52 });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text(`(${def.moneda.toUpperCase()})`, pageWidth / 2, 16, { align: 'center' });
      }
    }
  });

  // Paginación real garantizada en segunda pasada: "Pág. X de Y"
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(0, 0, 0);
    doc.text(`Pág. ${i} de ${totalPages}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
  }

  doc.setProperties({
    title: tituloLimpio,
    subject: estilo === 'actual' ? 'Formato actual' : 'Formato estandar',
    author: 'ATLOB ERP'
  });

  return doc;
}

export function exportarReporteEstandarPdf(
  def: EstandarReportDefinition,
  estilo: 'estandar' | 'actual' = 'estandar'
): void {
  const doc = generarReporteEstandarPdfDoc(def, estilo);
  const tituloArchivo = def.titulo.replace(/\*/g, '').trim().replace(/\s+/g, '_');
  const nombreArchivo = `${tituloArchivo}_${def.empresa.ruc}_${def.empresa.periodo.replace(/[^0-9]/g, '')}.pdf`;
  doc.save(nombreArchivo);
}

/**
 * Exporta el reporte a Excel (.xlsx) real con exactamente la misma estructura,
 * encabezados combinados, bordes finos, formatos numéricos y página A4 que el PDF.
 */
export async function exportarReporteEstandarHojaCalculo(
  def: EstandarReportDefinition,
  estilo: 'estandar' | 'actual' = 'estandar'
): Promise<void> {
  await descargarReporteEstandarExcel(def, estilo);
}

export interface Pdt621CasillasOficiales {
  cas100: number; cas101: number;
  cas154: number; cas155: number;
  cas102: number; cas103: number;
  cas160: number; cas161: number;
  cas162: number; cas163: number;
  cas106: number; cas127: number;
  cas105: number; cas109: number; cas112: number;
  cas131: number;
  cas107: number; cas108: number;
  cas156: number; cas157: number;
  cas110: number; cas111: number; cas113: number;
  cas114: number; cas115: number;
  cas116: number; cas117: number; cas119: number;
  cas120: number; cas122: number;
  cas178: number; cas172: number; cas173: number;
  cas340: number; cas341: number; cas182: number;
  cas301: number; cas312: number;
  cas380: number; cas315: number; cas894: number; cas336: number;
  cas140: number; cas353: number; cas302: number;
  cas145: number; cas351: number; cas303: number;
  cas184: number; cas352: number; cas304: number;
  cas171: number; cas168: number; cas164: number;
  cas179: number; cas176: number; cas165: number;
  cas326: number; cas327: number;
  cas347: number; cas305: number;
  cas328: number;
  cas681: number; cas683: number; cas682: number;
  cas185: number; cas342: number; cas317: number;
  cas187: number; cas343: number; cas319: number;
  cas188: number; cas344: number; cas324: number;
  saldoFavorArrastrable: number;
  totalDeudaGeneral: number;
}

export interface Pdt621ResumenPdfParams {
  empresa: {
    razonSocial: string;
    ruc: string;
    direccion?: string;
    regimenTributario?: string;
  };
  periodo: string;
  estado: string;
  version: number;
  esRectificatoria?: boolean;
  numeroOrden?: string | null;
  fechaPresentacion?: string | null;
  asientoNumero?: string | null;
  filasCasillas: Array<{
    seccion: string;
    casillaBase?: string;
    montoBase?: number | null;
    casillaTributo: string;
    concepto: string;
    montoTributo: number;
    enteroSunat: number;
  }>;
  totalDeudaIgv: number;
  nuevoSaldoFavorIgv: number;
  pagoCuentaRenta: number;
  totalPagarSunat: number;
  casillasOficiales?: Pdt621CasillasOficiales;
}

/**
 * Genera el documento jsPDF de la Declaración Mensual IGV-Renta (PDT 621)
 * replicando 1:1 el diseño oficial SUNAT 0621 de 2 páginas A4 Verticales
 * exactamente igual a la vista del sistema, con bordes finos y tarjeta ejecutiva Atlob Consultores.
 */
export function generarResumenPdt621OficialPdfDoc(params: Pdt621ResumenPdfParams): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth(); // 210
  const pageHeight = doc.internal.pageSize.getHeight(); // 297
  const marginX = 10;
  const usableW = pageWidth - marginX * 2; // 190 mm exactos

  const c = resolverCasillasOficialesPdt621(params);
  const periodoCompacto = params.periodo.replace('-', '');
  const tipoDecl = params.esRectificatoria ? 'Rectificatoria' : 'Original';
  const nroOrden = params.numeroOrden || '1212488542';
  const fechaPres = params.fechaPresentacion || '21/10/2026';

  const fmtMonto = (val: number | undefined | null, mostrarCero = false): string => {
    if (val === undefined || val === null || Number.isNaN(val)) return '';
    if (val === 0 && !mostrarCero) return '';
    return formatearImporteEstandar(val);
  };

  const fmtRatio = (val: number | undefined | null): string => {
    if (val === undefined || val === null || Number.isNaN(val)) return '';
    return Number(val).toFixed(4);
  };

  // Helper: Encabezado Oficial SUNAT 0621 (idéntico al sistema)
  const dibujarEncabezadoSunat = (paginaNum: number): number => {
    const y0 = 8;
    const hTotal = 25;
    const wIzq = 44;
    const wDer = 34;
    const wCen = usableW - wIzq - wDer; // 112 mm
    const xCen = marginX + wIzq;
    const xDer = xCen + wCen;

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(100, 116, 139); // slate-500 hairline
    doc.setLineWidth(0.25);
    doc.rect(marginX, y0, usableW, hTotal, 'FD');

    // Divisores verticales
    doc.line(xCen, y0, xCen, y0 + hTotal);
    doc.line(xDer, y0, xDer, y0 + hTotal);

    // Columna Izquierda: SUNAT / DECLARACIÓN PAGO / 0621
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('SUNAT', marginX + wIzq / 2, y0 + 6, { align: 'center' });
    doc.setFontSize(6.5);
    doc.setTextColor(51, 65, 85);
    doc.text('DECLARACIÓN PAGO', marginX + wIzq / 2, y0 + 10, { align: 'center' });
    doc.setFont('courier', 'bold');
    doc.setFontSize(17);
    doc.setTextColor(15, 23, 42);
    doc.text('0621', marginX + wIzq / 2, y0 + 21, { align: 'center' });

    // Columna Centro: barra título + metadatos
    doc.setFillColor(248, 250, 252);
    doc.rect(xCen, y0, wCen, 5.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text('PDT IGV - RENTA MENSUAL', xCen + wCen / 2, y0 + 3.9, { align: 'center' });

    const mx = xCen + 2.5;
    const valX = xCen + 23;
    const col2LblX = xCen + 62;
    const col2ValX = xCen + 86;

    doc.setFontSize(6.8);
    const pintarMeta = (lbl: string, val: string, xL: number, xV: number, y: number, mono = false, maxW = 86) => {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105);
      doc.text(lbl, xL, y);
      doc.setFont(mono ? 'courier' : 'helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(val, xV, y, { maxWidth: maxW });
    };

    pintarMeta('RUC', params.empresa.ruc, mx, valX, y0 + 9.2, true);
    pintarMeta('Razón Social', params.empresa.razonSocial.toUpperCase().slice(0, 52), mx, valX, y0 + 12.8, false);
    pintarMeta('N° de Orden', nroOrden, mx, valX, y0 + 16.4, true, 36);
    pintarMeta('Período', periodoCompacto, col2LblX, col2ValX, y0 + 16.4, true, 24);
    pintarMeta('Declaración', tipoDecl, mx, valX, y0 + 20.0, false, 36);
    pintarMeta('F. Presentación', fechaPres, col2LblX, col2ValX, y0 + 20.0, true, 24);
    pintarMeta('Moneda', 'Soles', mx, valX, y0 + 23.5, false, 36);
    pintarMeta('Estado', `${params.estado} (v${params.version})`, col2LblX, col2ValX, y0 + 23.5, false, 24);

    // Columna Derecha: Copia contribuyente / (Pag. N) / ATLOB ERP v2.0
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Copia para el', xDer + wDer / 2, y0 + 5.5, { align: 'center' });
    doc.text('contribuyente', xDer + wDer / 2, y0 + 8.8, { align: 'center' });
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`(Pag. ${paginaNum})`, xDer + wDer / 2, y0 + 15.5, { align: 'center' });
    doc.setFont('courier', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    doc.text('ATLOB ERP v2.0', xDer + wDer / 2, y0 + 22.8, { align: 'center' });

    return y0 + hTotal;
  };

  // Helper: Celda de Casilla SUNAT [100 | 110,021.16] con borde fino exacto
  const dibujarCeldaCasilla = (
    x: number,
    y: number,
    w: number,
    h: number,
    casilla?: string,
    valorTexto?: string,
    opts?: { negativo?: boolean; destacado?: boolean }
  ) => {
    const padX = 1.2;
    const padY = 0.7;
    const bx = x + padX;
    const by = y + padY;
    const bw = w - padX * 2;
    const bh = h - padY * 2;
    const wNum = 9.5;

    if (!casilla) return;

    // Caja blanca externa
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(186, 198, 212);
    doc.setLineWidth(0.15);
    doc.rect(bx, by, bw, bh, 'FD');

    // Mini-caja de código de casilla en gris suave
    doc.setFillColor(241, 245, 249);
    doc.rect(bx, by, wNum, bh, 'FD');

    doc.setFont('courier', 'bold');
    doc.setFontSize(6.3);
    doc.setTextColor(51, 65, 85);
    doc.text(casilla, bx + wNum / 2, by + bh / 2 + 1.1, { align: 'center' });

    if (valorTexto) {
      doc.setFont('courier', 'bold');
      doc.setFontSize(opts?.destacado ? 7.2 : 6.9);
      if (opts?.negativo) {
        doc.setTextColor(190, 18, 60);
      } else {
        doc.setTextColor(15, 23, 42);
      }
      doc.text(valorTexto, bx + bw - 1.4, by + bh / 2 + 1.1, { align: 'right' });
    }
  };

  // Helper: Renderizar tabla de 3 columnas (Pág. 1: CONCEPTO | BASE | TRIBUTO)
  const dibujarSeccionPag1 = (
    yStart: number,
    tituloIzq: string,
    tituloDer: string,
    filas: Array<{
      concepto: string;
      casBase?: string;
      txtBase?: string;
      negBase?: boolean;
      casTrib?: string;
      txtTrib?: string;
      negTrib?: boolean;
      destacado?: boolean;
      sinBanda?: boolean;
    }>,
    bandas?: Array<{ label: string; startIdx: number; count: number }>
  ): number => {
    const hHeader = 5.0;
    const hSub = 4.5;
    const hRow = 5.45;
    const wBanda = 5.5;
    const wBase = 44;
    const wTrib = 44;
    const wConceptoTotal = usableW - wBase - wTrib; // 102 mm
    const xBase = marginX + wConceptoTotal;
    const xTrib = xBase + wBase;
    const hTotal = hHeader + hSub + filas.length * hRow;

    // 1. Barra de título de sección
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.25);
    doc.rect(marginX, yStart, usableW, hHeader, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(15, 23, 42);
    doc.text(tituloIzq, marginX + 2, yStart + 3.5);
    doc.setFontSize(6.8);
    doc.setTextColor(51, 65, 85);
    doc.text(tituloDer, marginX + usableW - 2, yStart + 3.5, { align: 'right' });

    // 2. Subcabecera CONCEPTO | BASE | TRIBUTO
    const ySub = yStart + hHeader;
    doc.setFillColor(248, 250, 252);
    doc.rect(marginX, ySub, usableW, hSub, 'FD');
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.18);
    doc.line(xBase, ySub, xBase, ySub + hSub);
    doc.line(xTrib, ySub, xTrib, ySub + hSub);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(30, 41, 59);
    doc.text('CONCEPTO', marginX + 2, ySub + 3.2);
    doc.text('BASE', xBase + wBase / 2, ySub + 3.2, { align: 'center' });
    doc.text('TRIBUTO', xTrib + wTrib / 2, ySub + 3.2, { align: 'center' });

    // 3. Filas
    let y = ySub + hSub;
    const yFilasStart = y;

    filas.forEach((f) => {
      if (f.destacado) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, y, usableW, hRow, 'F');
      }

      // Líneas divisorias finas de fila y columnas
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.15);
      const xLineaIzq = !f.sinBanda && bandas ? marginX + wBanda : marginX;
      doc.line(xLineaIzq, y + hRow, marginX + usableW, y + hRow);

      doc.setDrawColor(186, 198, 212);
      doc.line(xBase, y, xBase, y + hRow);
      doc.line(xTrib, y, xTrib, y + hRow);

      if (f.destacado) {
        doc.setDrawColor(100, 116, 139);
        doc.setLineWidth(0.22);
        doc.line(marginX, y, marginX + usableW, y);
      }

      // Texto concepto
      const xTxt = !f.sinBanda && bandas ? marginX + wBanda + 2 : marginX + 2;
      doc.setFont('helvetica', f.destacado ? 'bold' : 'normal');
      doc.setFontSize(6.6);
      doc.setTextColor(15, 23, 42);
      doc.text(f.concepto, xTxt, y + hRow / 2 + 1.1, { maxWidth: xBase - xTxt - 1.5 });

      // Casillas Base y Tributo
      dibujarCeldaCasilla(xBase, y, wBase, hRow, f.casBase, f.txtBase, {
        negativo: f.negBase,
        destacado: f.destacado
      });
      dibujarCeldaCasilla(xTrib, y, wTrib, hRow, f.casTrib, f.txtTrib, {
        negativo: f.negTrib,
        destacado: f.destacado
      });

      y += hRow;
    });

    // 4. Bandas laterales verticales (Gravadas, Exportación, Nacionales, Importadas)
    if (bandas) {
      for (const b of bandas) {
        const by = yFilasStart + b.startIdx * hRow;
        const bh = b.count * hRow;
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(186, 198, 212);
        doc.setLineWidth(0.18);
        doc.rect(marginX, by, wBanda, bh, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.4);
        doc.setTextColor(51, 65, 85);
        const tw = doc.getTextWidth(b.label);
        const txtX = marginX + wBanda / 2 + 0.9;
        const txtY = by + (bh + tw) / 2;
        doc.text(b.label, txtX, txtY, { angle: 90 });
      }
    }

    // Marco exterior nítido
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.25);
    doc.rect(marginX, yStart, usableW, hTotal, 'S');

    return yStart + hTotal;
  };

  // =========================================================================
  // PÁGINA 1: BASES, DÉBITO, CRÉDITO, IVAP Y RENTA
  // =========================================================================
  let yCursor = dibujarEncabezadoSunat(1) + 2.8;

  yCursor = dibujarSeccionPag1(
    yCursor,
    'IGV VENTAS',
    'IGV CUENTA PROPIA',
    [
      { concepto: 'Ventas Netas', casBase: '100', txtBase: fmtMonto(c.cas100), casTrib: '101', txtTrib: fmtMonto(c.cas101) },
      { concepto: 'Ventas Netas Gravadas Ley N° 31556 y modificatorias', casBase: '154', txtBase: fmtMonto(c.cas154), casTrib: '155', txtTrib: fmtMonto(c.cas155) },
      { concepto: 'Descuentos Concedidos y/o devoluciones de Ventas', casBase: '102', txtBase: fmtMonto(c.cas102), negBase: c.cas102 > 0, casTrib: '103', txtTrib: fmtMonto(c.cas103), negTrib: c.cas103 > 0 },
      { concepto: 'Ventas de bienes (ley 27037 inc. 11.1, 12.1, 12.3 y 12.4)', casBase: '160', txtBase: fmtMonto(c.cas160), casTrib: '161', txtTrib: fmtMonto(c.cas161) },
      { concepto: 'Descuentos y devoluciones (ley 27037)', casBase: '162', txtBase: fmtMonto(c.cas162), casTrib: '163', txtTrib: fmtMonto(c.cas163) },
      { concepto: 'Facturadas en el período', casBase: '106', txtBase: fmtMonto(c.cas106) },
      { concepto: 'Embarcadas en el período', casBase: '127', txtBase: fmtMonto(c.cas127) },
      { concepto: 'Ventas no Gravadas (Sin Considerar exportaciones)', casBase: '105', txtBase: fmtMonto(c.cas105), sinBanda: true },
      { concepto: 'Ventas no Gravadas (Sin efecto en ratio)', casBase: '109', txtBase: fmtMonto(c.cas109), sinBanda: true },
      { concepto: 'Otras ventas (inciso ii), numeral 6.2 - art. 6 del Reglamento', casBase: '112', txtBase: fmtMonto(c.cas112), sinBanda: true },
      { concepto: 'TOTAL', casTrib: '131', txtTrib: fmtMonto(c.cas131, true), destacado: true, sinBanda: true }
    ],
    [
      { label: 'Gravadas', startIdx: 0, count: 5 },
      { label: 'Exportación', startIdx: 5, count: 2 }
    ]
  ) + 2.8;

  yCursor = dibujarSeccionPag1(
    yCursor,
    'IGV COMPRAS',
    'IGV CUENTA PROPIA',
    [
      { concepto: 'Compras netas destinada a ventas gravadas exclusivamente', casBase: '107', txtBase: fmtMonto(c.cas107), casTrib: '108', txtTrib: fmtMonto(c.cas108) },
      { concepto: 'Compras Netas destinadas a Vtas Gravadas Ley N° 31556 y modificatorias', casBase: '156', txtBase: fmtMonto(c.cas156), casTrib: '157', txtTrib: fmtMonto(c.cas157) },
      { concepto: 'Compras netas destinada a ventas gravadas y no gravadas', casBase: '110', txtBase: fmtMonto(c.cas110), casTrib: '111', txtTrib: fmtMonto(c.cas111) },
      { concepto: 'Compras netas destinada a ventas no gravadas exclusivamente', casBase: '113', txtBase: fmtMonto(c.cas113) },
      { concepto: 'Compras netas destinada a ventas gravadas exclusivamente', casBase: '114', txtBase: fmtMonto(c.cas114), casTrib: '115', txtTrib: fmtMonto(c.cas115) },
      { concepto: 'Compras netas destinada a ventas gravadas y no gravadas', casBase: '116', txtBase: fmtMonto(c.cas116), casTrib: '117', txtTrib: fmtMonto(c.cas117) },
      { concepto: 'Compras netas destinada a ventas no gravadas exclusivamente', casBase: '119', txtBase: fmtMonto(c.cas119) },
      { concepto: 'Compras internas no gravadas', casBase: '120', txtBase: fmtMonto(c.cas120), sinBanda: true },
      { concepto: 'Compras importadas no gravadas', casBase: '122', txtBase: fmtMonto(c.cas122), sinBanda: true },
      { concepto: 'TOTAL', casTrib: '178', txtTrib: fmtMonto(c.cas178, true), destacado: true, sinBanda: true },
      { concepto: 'CRÉDITO FISCAL ESPECIAL', casTrib: '172', txtTrib: fmtMonto(c.cas172), destacado: true, sinBanda: true },
      { concepto: 'COEFICIENTE', casBase: '173', txtBase: fmtRatio(c.cas173), destacado: true, sinBanda: true }
    ],
    [
      { label: 'Nacionales', startIdx: 0, count: 4 },
      { label: 'Importadas', startIdx: 4, count: 3 }
    ]
  ) + 2.8;

  yCursor = dibujarSeccionPag1(yCursor, 'IVAP', 'IVAP', [
    { concepto: 'Ventas Gravadas', casBase: '340', txtBase: fmtMonto(c.cas340), casTrib: '341', txtTrib: fmtMonto(c.cas341), sinBanda: true },
    { concepto: 'Otros Créditos IVAP', casTrib: '182', txtTrib: fmtMonto(c.cas182), sinBanda: true }
  ]) + 2.8;

  dibujarSeccionPag1(yCursor, 'RENTA', 'RENTA', [
    { concepto: 'Ingresos Netos', casBase: '301', txtBase: fmtMonto(c.cas301), casTrib: '312', txtTrib: fmtMonto(c.cas312, true), destacado: true, sinBanda: true },
    { concepto: 'Coeficiente', casBase: '380', txtBase: fmtRatio(c.cas380), sinBanda: true },
    { concepto: 'Porcentaje', casBase: '315', txtBase: fmtMonto(c.cas315, true), sinBanda: true },
    { concepto: 'Coeficiente Calculado (aplicado para el Cálculo de la Cas312)', casBase: '894', txtBase: fmtRatio(c.cas894), sinBanda: true },
    { concepto: 'Pagos a Cuenta en Exceso del Presente Ejercicio', casTrib: '336', txtTrib: fmtMonto(c.cas336), sinBanda: true }
  ]);

  // Pie de página Pág. 1
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Atlob Consultores ERP · Declaración Mensual PDT 621 — Período ${params.periodo}`, marginX, pageHeight - 7);
  doc.text('Pág. 1 de 2', pageWidth - marginX, pageHeight - 7, { align: 'right' });

  // =========================================================================
  // PÁGINA 2: DETERMINACIÓN DE LA DEUDA + RESUMEN EJECUTIVO ATLOB CONSULTORES
  // =========================================================================
  doc.addPage('a4', 'portrait');
  let y2 = dibujarEncabezadoSunat(2) + 4;

  const hBar2 = 5.6;
  const hSub2 = 5.0;
  const hRow2 = 6.4;
  const wColTributo = 36;
  const wColConcepto2 = usableW - wColTributo * 3; // 82 mm
  const xIgv = marginX + wColConcepto2;
  const xIvap = xIgv + wColTributo;
  const xRenta = xIvap + wColTributo;

  const filasDeuda: Array<{
    concepto: string;
    igv?: [string, number];
    ivap?: [string, number];
    renta?: [string, number];
    destacado?: boolean;
    totalFinal?: boolean;
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
    { concepto: 'TOTAL DEUDA TRIBUTARIA', igv: ['188', c.cas188], ivap: ['344', c.cas344], renta: ['324', c.cas324], destacado: true, totalFinal: true }
  ];

  const hTabla2 = hBar2 + hSub2 + filasDeuda.length * hRow2;

  // Barra Determinación
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.25);
  doc.rect(marginX, y2, usableW, hBar2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(15, 23, 42);
  doc.text('DETERMINACIÓN DE LA DEUDA', marginX + 2.5, y2 + 3.9);
  doc.setFontSize(6.8);
  doc.setTextColor(51, 65, 85);
  doc.text('DETERMINACIÓN DE LA DEUDA', marginX + usableW - 2.5, y2 + 3.9, { align: 'right' });

  // Subcabecera CONCEPTO | IGV | IVAP | RENTA
  const ySub2 = y2 + hBar2;
  doc.setFillColor(248, 250, 252);
  doc.rect(marginX, ySub2, usableW, hSub2, 'FD');
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.18);
  doc.line(xIgv, ySub2, xIgv, ySub2 + hSub2);
  doc.line(xIvap, ySub2, xIvap, ySub2 + hSub2);
  doc.line(xRenta, ySub2, xRenta, ySub2 + hSub2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(30, 41, 59);
  doc.text('CONCEPTO', marginX + 2.5, ySub2 + 3.5);
  doc.text('IGV', xIgv + wColTributo / 2, ySub2 + 3.5, { align: 'center' });
  doc.text('IVAP', xIvap + wColTributo / 2, ySub2 + 3.5, { align: 'center' });
  doc.text('RENTA', xRenta + wColTributo / 2, ySub2 + 3.5, { align: 'center' });

  let yFila2 = ySub2 + hSub2;
  for (const fd of filasDeuda) {
    if (fd.totalFinal) {
      doc.setFillColor(241, 245, 249);
      doc.rect(marginX, yFila2, usableW, hRow2, 'F');
    } else if (fd.destacado) {
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, yFila2, usableW, hRow2, 'F');
    }

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.15);
    doc.line(marginX, yFila2 + hRow2, marginX + usableW, yFila2 + hRow2);
    doc.setDrawColor(186, 198, 212);
    doc.line(xIgv, yFila2, xIgv, yFila2 + hRow2);
    doc.line(xIvap, yFila2, xIvap, yFila2 + hRow2);
    doc.line(xRenta, yFila2, xRenta, yFila2 + hRow2);

    if (fd.totalFinal) {
      doc.setDrawColor(71, 85, 105);
      doc.setLineWidth(0.35);
      doc.line(marginX, yFila2, marginX + usableW, yFila2);
    } else if (fd.destacado) {
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.2);
      doc.line(marginX, yFila2, marginX + usableW, yFila2);
    }

    doc.setFont('helvetica', fd.destacado || fd.totalFinal ? 'bold' : 'normal');
    doc.setFontSize(fd.totalFinal ? 7.2 : 6.8);
    doc.setTextColor(15, 23, 42);
    doc.text(fd.concepto, marginX + 2.5, yFila2 + hRow2 / 2 + 1.1, { maxWidth: wColConcepto2 - 4 });

    if (fd.igv) {
      dibujarCeldaCasilla(xIgv, yFila2, wColTributo, hRow2, fd.igv[0], fmtMonto(fd.igv[1], !!(fd.destacado || fd.totalFinal)), {
        negativo: fd.igv[1] < 0,
        destacado: fd.destacado || fd.totalFinal
      });
    }
    if (fd.ivap) {
      dibujarCeldaCasilla(xIvap, yFila2, wColTributo, hRow2, fd.ivap[0], fmtMonto(fd.ivap[1], false), {
        negativo: fd.ivap[1] < 0,
        destacado: fd.destacado || fd.totalFinal
      });
    }
    if (fd.renta) {
      dibujarCeldaCasilla(xRenta, yFila2, wColTributo, hRow2, fd.renta[0], fmtMonto(fd.renta[1], !!(fd.destacado || fd.totalFinal)), {
        negativo: fd.renta[1] < 0,
        destacado: fd.destacado || fd.totalFinal
      });
    }

    yFila2 += hRow2;
  }

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.25);
  doc.rect(marginX, y2, usableW, hTabla2, 'S');

  // Tarjeta Resumen Ejecutivo — Atlob Consultores (idéntica al pie del sistema)
  const yExec = y2 + hTabla2 + 6;
  const hExec = 38;
  doc.setFillColor(15, 23, 42); // Slate-900
  doc.setDrawColor(71, 85, 105);
  doc.setLineWidth(0.3);
  doc.rect(marginX, yExec, usableW, hExec, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('ATLOB CONSULTORES · RESUMEN EJECUTIVO DE OBLIGACIÓN MENSUAL', marginX + 4, yExec + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`IGV Propio (1011): `, marginX + 4, yExec + 12.5);
  doc.setFont('courier', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(`S/ ${formatearImporteEstandar(c.cas188)}`, marginX + 30, yExec + 12.5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`Renta 3ra Cat (3031): `, marginX + 64, yExec + 12.5);
  doc.setFont('courier', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(`S/ ${formatearImporteEstandar(c.cas324)}`, marginX + 94, yExec + 12.5);

  if (c.cas344 > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(203, 213, 225);
    doc.text(`IVAP (1021): `, marginX + 4, yExec + 17);
    doc.setFont('courier', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(`S/ ${formatearImporteEstandar(c.cas344)}`, marginX + 24, yExec + 17);
  }

  // Total a Pagar SUNAT a la derecha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.3);
  doc.setTextColor(148, 163, 184);
  doc.text('TOTAL A PAGAR SUNAT (GUÍA 1662 / NPS)', marginX + usableW - 4, yExec + 6, { align: 'right' });
  doc.setFont('courier', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(52, 211, 153); // Emerald-400
  doc.text(`S/ ${formatearImporteEstandar(c.totalDeudaGeneral)}`, marginX + usableW - 4, yExec + 14.5, { align: 'right' });

  // Línea divisoria + 3 sub-tarjetas de créditos/saldos arrastrables
  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(0.2);
  doc.line(marginX + 4, yExec + 20, marginX + usableW - 4, yExec + 20);

  const subW = (usableW - 12) / 3;
  const subY = yExec + 23;
  const subH = 11.5;
  const subTarjetas: Array<{ lbl: string; val: string; rgb: [number, number, number] }> = [
    { lbl: 'Saldo a Favor IGV Próximo Mes:', val: `S/ ${formatearImporteEstandar(c.saldoFavorArrastrable)}`, rgb: [110, 231, 183] },
    { lbl: 'Saldo Percepciones no aplicadas [164]:', val: `S/ ${formatearImporteEstandar(c.cas164)}`, rgb: [147, 197, 253] },
    { lbl: 'Saldo Retenciones no aplicadas [165]:', val: `S/ ${formatearImporteEstandar(c.cas165)}`, rgb: [252, 211, 77] }
  ];

  subTarjetas.forEach((st, i) => {
    const sx = marginX + 4 + i * (subW + 2);
    doc.setFillColor(30, 41, 59);
    doc.setDrawColor(71, 85, 105);
    doc.setLineWidth(0.18);
    doc.rect(sx, subY, subW, subH, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.1);
    doc.setTextColor(148, 163, 184);
    doc.text(st.lbl, sx + 2.5, subY + 4.3);

    doc.setFont('courier', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(st.rgb[0], st.rgb[1], st.rgb[2]);
    doc.text(st.val, sx + 2.5, subY + 9.2);
  });

  // Nota formal al pie
  const yNota = yExec + hExec + 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.7);
  doc.setTextColor(71, 85, 105);
  const infoVoucher = params.asientoNumero ? ` · Voucher Determinación: ${params.asientoNumero}` : '';
  doc.text(
    `Régimen: ${params.empresa.regimenTributario || 'MYPE_TRIBUTARIO'}${infoVoucher} · Emitido: ${formatearFechaHoraEmision24h()}`,
    marginX,
    yNota
  );
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Documento de liquidación tributaria generado por Atlob Consultores ERP conforme a la estructura oficial SUNAT PDT 621. No constituye envío telemático directo a SUNAT.',
    marginX,
    yNota + 4.2,
    { maxWidth: usableW }
  );

  // Pie de página Pág. 2
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Atlob Consultores ERP · Declaración Mensual PDT 621 — Período ${params.periodo}`, marginX, pageHeight - 7);
  doc.text('Pág. 2 de 2', pageWidth - marginX, pageHeight - 7, { align: 'right' });

  doc.setProperties({
    title: `DECLARACION MENSUAL PDT 621 - ${params.periodo}`,
    subject: 'Declaración Pago 0621 IGV - Renta Mensual',
    author: 'ATLOB ERP'
  });

  return doc;
}

/**
 * Exporta el PDF Oficial de la Declaración Mensual IGV-Renta (PDT 621)
 * con las 2 páginas oficiales idénticas a la interfaz del sistema.
 */
export function exportarResumenPdt621EstandarPdf(params: Pdt621ResumenPdfParams): void {
  const doc = generarResumenPdt621OficialPdfDoc(params);
  const nombreArchivo = `PDT621_${params.empresa.ruc}_${params.periodo.replace('-', '')}_V${params.version}.pdf`;
  doc.save(nombreArchivo);
}

/**
 * 6. BOLETA DE PAGO DE REMUNERACIONES (D.S. N° 009-2011-TR / R.M. N° 020-2008-TR)
 * En Formato estándar Atlob (monocromo / corporativo limpio).
 */
export interface BoletaPagoPdfItem {
  trabajadorNombre: string;
  trabajadorDocumento: string;
  cargo?: string;
  regimenLaboral?: string;
  fechaIngreso?: string;
  cuspp?: string;
  sistemaPensiones: 'ONP' | 'AFP';
  afpAdministradora?: string;
  afpTipoComision?: string;
  centroCosto?: string;
  bancoSueldo?: string;
  cuentaBancoSueldo?: string;
  diasTrabajados: number;
  diasFaltas?: number;
  horasOrdinarias: number;
  horasExtras25?: number;
  horasExtras35?: number;
  sueldoBasico: number;
  asignacionFamiliar: number;
  montoHorasExtras25?: number;
  montoHorasExtras35?: number;
  bonificacionesGravadas?: number;
  conceptosNoGravados?: number;
  totalRemuneracion: number;
  aporteObligatorioPension: number;
  comisionAfp: number;
  primaSeguroAfp: number;
  retencionQuintaCategoria: number;
  descuentoFaltasTardanzas?: number;
  adelantosPrestamos?: number;
  totalDescuentos: number;
  aporteEssalud: number;
  netoPagar: number;
}

function renderizarBoletaEnPagina(
  doc: jsPDF,
  empresa: { ruc: string; razonSocial: string; regimenTributario?: string },
  periodo: string,
  boleta: BoletaPagoPdfItem,
  offsetY: number = 10
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;

  // Cabecera Empleador y Título Oficial D.S. 001-98-TR / D.S. 009-2011-TR
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(empresa.razonSocial.toUpperCase(), marginX, offsetY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`R.U.C.: ${empresa.ruc}`, marginX, offsetY + 4);
  doc.text('Formato estándar Atlob — D.S. N° 001-98-TR / D.S. N° 009-2011-TR', marginX, offsetY + 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('BOLETA DE PAGO DE REMUNERACIONES', pageWidth / 2, offsetY + 2, { align: 'center' });
  doc.setFontSize(8);
  doc.text(`PERÍODO DE PAGO: ${periodo}`, pageWidth / 2, offsetY + 7, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`MONEDA: SOLES (S/)`, pageWidth - marginX, offsetY, { align: 'right' });
  doc.text(`C. COSTO: ${boleta.centroCosto || 'ADMINISTRACION'}`, pageWidth - marginX, offsetY + 4, { align: 'right' });

  doc.setLineWidth(0.3);
  doc.line(marginX, offsetY + 11, pageWidth - marginX, offsetY + 11);

  // Datos del Trabajador
  const yDatos = offsetY + 15;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('TRABAJADOR:', marginX, yDatos);
  doc.setFont('helvetica', 'normal');
  doc.text(boleta.trabajadorNombre.toUpperCase(), marginX + 24, yDatos);

  doc.setFont('helvetica', 'bold');
  doc.text('DOC. IDENTIDAD:', pageWidth / 2 + 10, yDatos);
  doc.setFont('helvetica', 'normal');
  doc.text(boleta.trabajadorDocumento, pageWidth / 2 + 36, yDatos);

  doc.setFont('helvetica', 'bold');
  doc.text('CARGO / OCUP.:', marginX, yDatos + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.text((boleta.cargo || 'COLABORADOR').toUpperCase(), marginX + 24, yDatos + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.text('F. INGRESO:', pageWidth / 2 + 10, yDatos + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.text(boleta.fechaIngreso || '-', pageWidth / 2 + 36, yDatos + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.text('SIST. PENSIÓN:', marginX, yDatos + 9);
  doc.setFont('helvetica', 'normal');
  const pensionTexto =
    boleta.sistemaPensiones === 'AFP'
      ? `AFP ${boleta.afpAdministradora || ''} (${boleta.afpTipoComision || 'FLUJO'}) — CUSPP: ${boleta.cuspp || '-'}`
      : 'ONP - D.L. 19990 (13%)';
  doc.text(pensionTexto, marginX + 24, yDatos + 9);

  doc.setFont('helvetica', 'bold');
  doc.text('RÉGIMEN LAB.:', pageWidth / 2 + 10, yDatos + 9);
  doc.setFont('helvetica', 'normal');
  doc.text(boleta.regimenLaboral || 'GENERAL (D.L. 728)', pageWidth / 2 + 36, yDatos + 9);

  doc.setFont('helvetica', 'bold');
  doc.text('JORNADA MES:', marginX, yDatos + 13.5);
  doc.setFont('helvetica', 'normal');
  const hExtras = (boleta.horasExtras25 || 0) + (boleta.horasExtras35 || 0);
  doc.text(
    `${boleta.diasTrabajados} días lab. | ${boleta.diasFaltas || 0} faltas | ${boleta.horasOrdinarias} hrs ord. | ${hExtras} hrs extras`,
    marginX + 24,
    yDatos + 13.5
  );

  if (boleta.bancoSueldo || boleta.cuentaBancoSueldo) {
    doc.setFont('helvetica', 'bold');
    doc.text('ABONO BANCO:', pageWidth / 2 + 10, yDatos + 13.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`${boleta.bancoSueldo || ''} ${boleta.cuentaBancoSueldo || ''}`.trim(), pageWidth / 2 + 36, yDatos + 13.5);
  }

  // Construcción de filas de Conceptos PLAME
  const filasConceptos: string[][] = [];
  filasConceptos.push([
    '0121',
    'REMUNERACIÓN O JORNAL BÁSICO',
    formatearImporteEstandar(boleta.sueldoBasico),
    '',
    ''
  ]);
  if (boleta.asignacionFamiliar > 0) {
    filasConceptos.push([
      '0201',
      'ASIGNACIÓN FAMILIAR (LEY N° 25129 - 10% RMV)',
      formatearImporteEstandar(boleta.asignacionFamiliar),
      '',
      ''
    ]);
  }
  if ((boleta.montoHorasExtras25 || 0) > 0) {
    filasConceptos.push([
      '0105',
      `TRABAJO EN SOBRETIEMPO (HORAS EXTRAS 25% — ${boleta.horasExtras25} HRS)`,
      formatearImporteEstandar(boleta.montoHorasExtras25 || 0),
      '',
      ''
    ]);
  }
  if ((boleta.montoHorasExtras35 || 0) > 0) {
    filasConceptos.push([
      '0106',
      `TRABAJO EN SOBRETIEMPO (HORAS EXTRAS 35% — ${boleta.horasExtras35} HRS)`,
      formatearImporteEstandar(boleta.montoHorasExtras35 || 0),
      '',
      ''
    ]);
  }
  if ((boleta.bonificacionesGravadas || 0) > 0) {
    filasConceptos.push([
      '0306',
      'BONIFICACIONES REGULARES GRAVADAS',
      formatearImporteEstandar(boleta.bonificacionesGravadas || 0),
      '',
      ''
    ]);
  }
  if ((boleta.conceptosNoGravados || 0) > 0) {
    filasConceptos.push([
      '0909',
      'CONCEPTOS NO REMUNERATIVOS / MOVILIDAD SUPEDITADA',
      formatearImporteEstandar(boleta.conceptosNoGravados || 0),
      '',
      ''
    ]);
  }

  // Descuentos del trabajador
  if (boleta.sistemaPensiones === 'ONP' && boleta.aporteObligatorioPension > 0) {
    filasConceptos.push([
      '0607',
      'SISTEMA NACIONAL DE PENSIONES - D.L. 19990 (ONP 13%)',
      '',
      formatearImporteEstandar(boleta.aporteObligatorioPension),
      ''
    ]);
  }
  if (boleta.sistemaPensiones === 'AFP') {
    if (boleta.aporteObligatorioPension > 0) {
      filasConceptos.push([
        '0608',
        `SPP - APORTE OBLIGATORIO AFP (10%) - ${boleta.afpAdministradora || ''}`,
        '',
        formatearImporteEstandar(boleta.aporteObligatorioPension),
        ''
      ]);
    }
    if (boleta.comisionAfp > 0) {
      filasConceptos.push([
        '0601',
        `SPP - COMISIÓN PORCENTUAL AFP (${boleta.afpTipoComision || 'FLUJO'})`,
        '',
        formatearImporteEstandar(boleta.comisionAfp),
        ''
      ]);
    }
    if (boleta.primaSeguroAfp > 0) {
      filasConceptos.push([
        '0606',
        'SPP - PRIMA DE SEGURO DE INVALIDEZ Y SOBREVIVENCIA AFP',
        '',
        formatearImporteEstandar(boleta.primaSeguroAfp),
        ''
      ]);
    }
  }
  if (boleta.retencionQuintaCategoria > 0) {
    filasConceptos.push([
      '0605',
      'RENTA DE QUINTA CATEGORÍA RETENCIONES (ART. 75° LIR)',
      '',
      formatearImporteEstandar(boleta.retencionQuintaCategoria),
      ''
    ]);
  }
  if ((boleta.descuentoFaltasTardanzas || 0) > 0) {
    filasConceptos.push([
      '0705',
      'INASISTENCIAS Y TARDANZAS DEDUCIBLES',
      '',
      formatearImporteEstandar(boleta.descuentoFaltasTardanzas || 0),
      ''
    ]);
  }
  if ((boleta.adelantosPrestamos || 0) > 0) {
    filasConceptos.push([
      '0701',
      'ADELANTOS DE REMUNERACIONES / PRÉSTAMOS AL PERSONAL',
      '',
      formatearImporteEstandar(boleta.adelantosPrestamos || 0),
      ''
    ]);
  }

  // Aportes del empleador
  if (boleta.aporteEssalud > 0) {
    filasConceptos.push([
      '0804',
      'ESSALUD SEGURO REGULAR TRABAJADOR (9% EMPLEADOR)',
      '',
      '',
      formatearImporteEstandar(boleta.aporteEssalud)
    ]);
  }

  autoTable(doc, {
    startY: yDatos + 17,
    margin: { left: marginX, right: marginX },
    head: [[
      'CÓD. PLAME',
      'CONCEPTO REMUNERATIVO / DESCUENTO / APORTE',
      'INGRESOS (S/)',
      'DESCUENTOS (S/)',
      'APORTES EMP. (S/)'
    ]],
    body: filasConceptos,
    foot: [[
      '',
      'TOTALES BOLETA DE PAGO',
      formatearImporteEstandar(boleta.totalRemuneracion),
      formatearImporteEstandar(boleta.totalDescuentos),
      formatearImporteEstandar(boleta.aporteEssalud)
    ]],
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 1.4,
      textColor: [0, 0, 0],
      lineColor: [180, 180, 180],
      lineWidth: 0.1
    },
    headStyles: {
      fontStyle: 'bold',
      fillColor: [235, 238, 242],
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25
    },
    footStyles: {
      fontStyle: 'bold',
      fillColor: [243, 244, 246],
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25
    },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 86 },
      2: { cellWidth: 26, halign: 'right' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' }
    }
  });

  const finalY = ((doc as any).lastAutoTable?.finalY || yDatos + 60) + 5;
  doc.setFillColor(235, 238, 242);
  doc.rect(marginX, finalY, pageWidth - marginX * 2, 8, 'F');
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(marginX, finalY, pageWidth - marginX * 2, 8, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('NETO A PAGAR AL TRABAJADOR:', marginX + 4, finalY + 5.5);
  doc.text(`S/ ${formatearImporteEstandar(boleta.netoPagar)}`, pageWidth - marginX - 4, finalY + 5.5, { align: 'right' });

  // Líneas de firma Empleador / Trabajador
  const yFirma = finalY + 24;
  doc.setLineWidth(0.2);
  doc.line(marginX + 18, yFirma, marginX + 75, yFirma);
  doc.line(pageWidth - marginX - 75, yFirma, pageWidth - marginX - 18, yFirma);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('FIRMA Y SELLO DEL EMPLEADOR', marginX + 46.5, yFirma + 4, { align: 'center' });
  doc.text('RECIBÍ CONFORME (FIRMA DEL TRABAJADOR)', pageWidth - marginX - 46.5, yFirma + 4, { align: 'center' });
  doc.text(`DNI: ${boleta.trabajadorDocumento}`, pageWidth - marginX - 46.5, yFirma + 8, { align: 'center' });
}

export function exportarBoletaPagoEstandarPdf(params: {
  empresa: { ruc: string; razonSocial: string; regimenTributario?: string };
  periodo: string;
  boleta: BoletaPagoPdfItem;
}): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  renderizarBoletaEnPagina(doc, params.empresa, params.periodo, params.boleta, 12);
  const nombreArchivo = `BOLETA_${params.empresa.ruc}_${params.periodo.replace('-', '')}_${params.boleta.trabajadorDocumento}.pdf`;
  doc.save(nombreArchivo);
}

export function exportarLoteBoletasPagoEstandarPdf(params: {
  empresa: { ruc: string; razonSocial: string; regimenTributario?: string };
  periodo: string;
  boletas: BoletaPagoPdfItem[];
}): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  params.boletas.forEach((b, idx) => {
    if (idx > 0) doc.addPage();
    renderizarBoletaEnPagina(doc, params.empresa, params.periodo, b, 12);
  });
  const nombreArchivo = `BOLETAS_PAGO_${params.empresa.ruc}_${params.periodo.replace('-', '')}_LOTE.pdf`;
  doc.save(nombreArchivo);
}

export function generarBoletaPagoPdfBuffer(params: {
  empresa: { ruc: string; razonSocial: string; regimenTributario?: string };
  periodo: string;
  boleta: BoletaPagoPdfItem;
}): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  renderizarBoletaEnPagina(doc, params.empresa, params.periodo, params.boleta, 12);
  return Buffer.from(doc.output('arraybuffer'));
}

export function generarLoteBoletasPagoPdfBuffer(params: {
  empresa: { ruc: string; razonSocial: string; regimenTributario?: string };
  periodo: string;
  boletas: BoletaPagoPdfItem[];
}): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  params.boletas.forEach((b, idx) => {
    if (idx > 0) doc.addPage();
    renderizarBoletaEnPagina(doc, params.empresa, params.periodo, b, 12);
  });
  return Buffer.from(doc.output('arraybuffer'));
}

/**
 * 7. LIQUIDACIÓN DE BENEFICIOS SOCIALES (LBS) EN FORMATO ESTÁNDAR ATLOB
 */
export function exportarLiquidacionBeneficiosEstandarPdf(params: {
  empresa: { ruc: string; razonSocial: string };
  liquidacion: {
    trabajadorNombre: string;
    trabajadorDocumento: string;
    regimenLaboral: string;
    fechaIngreso: string;
    fechaCese: string;
    motivoCese: string;
    sueldoBasico: number;
    asignacionFamiliar: number;
    remuneracionComputable: number;
    ctsTrunca: number;
    vacacionesTruncas: number;
    gratificacionTrunca: number;
    bonificacionExtraTrunca: number;
    remuneracionMensualPendiente: number;
    totalBrutoBeneficios: number;
    descuentoPensiones: number;
    descuentoQuinta: number;
    aporteEssalud: number;
    netoLiquidacion: number;
  };
}): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const liq = params.liquidacion;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(params.empresa.razonSocial.toUpperCase(), marginX, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`R.U.C.: ${params.empresa.ruc}`, marginX, 18);
  doc.text('Formato estándar Atlob (SOLES)', pageWidth - marginX, 14, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('LIQUIDACIÓN DE BENEFICIOS SOCIALES', pageWidth / 2, 24, { align: 'center' });
  doc.setLineWidth(0.3);
  doc.line(marginX, 27, pageWidth - marginX, 27);

  doc.setFontSize(8);
  doc.text(`TRABAJADOR: ${liq.trabajadorNombre.toUpperCase()}`, marginX, 33);
  doc.text(`DOC. IDENTIDAD: ${liq.trabajadorDocumento}`, pageWidth / 2 + 10, 33);
  doc.setFont('helvetica', 'normal');
  doc.text(`RÉGIMEN LABORAL: ${liq.regimenLaboral}`, marginX, 38);
  doc.text(`MOTIVO DE CESE: ${liq.motivoCese}`, pageWidth / 2 + 10, 38);
  doc.text(`FECHA DE INGRESO: ${liq.fechaIngreso}`, marginX, 43);
  doc.text(`FECHA DE CESE: ${liq.fechaCese}`, pageWidth / 2 + 10, 43);
  doc.text(`REMUNERACIÓN COMPUTABLE: S/ ${formatearImporteEstandar(liq.remuneracionComputable)}`, marginX, 48);

  autoTable(doc, {
    startY: 53,
    margin: { left: marginX, right: marginX },
    head: [['CONCEPTO DE LIQUIDACIÓN DE BENEFICIOS SOCIALES', 'BASE LEGAL', 'IMPORTE (S/)']],
    body: [
      ['1. Remuneración proporcional por días trabajados en el mes de cese', 'D.S. 003-97-TR', formatearImporteEstandar(liq.remuneracionMensualPendiente)],
      ['2. Compensación por Tiempo de Servicios — CTS Trunca', 'D.S. 001-97-TR', formatearImporteEstandar(liq.ctsTrunca)],
      ['3. Vacaciones Truncas / Pendientes de Goce', 'D. Leg. N° 713', formatearImporteEstandar(liq.vacacionesTruncas)],
      ['4. Gratificación Legal Trunca', 'Ley N° 27735', formatearImporteEstandar(liq.gratificacionTrunca)],
      ['5. Bonificación Extraordinaria Temporal (9% / 6.75%)', 'Ley N° 29351 / 30334', formatearImporteEstandar(liq.bonificacionExtraTrunca)],
      ['TOTAL INGRESOS Y BENEFICIOS BRUTOS', '', formatearImporteEstandar(liq.totalBrutoBeneficios)],
      ['(-) Retención Sistema de Pensiones (ONP / AFP sobre conceptos afectos)', 'D.L. 19990 / SPP', `- ${formatearImporteEstandar(liq.descuentoPensiones)}`],
      ['(-) Retención Impuesto a la Renta 5ta Categoría', 'Art. 75° LIR', `- ${formatearImporteEstandar(liq.descuentoQuinta)}`],
      ['(+) Aporte Empleador EsSalud (Informativo)', 'Ley N° 26790', formatearImporteEstandar(liq.aporteEssalud)]
    ],
    foot: [['NETO A PAGAR POR LIQUIDACIÓN DE BENEFICIOS SOCIALES', '', `S/ ${formatearImporteEstandar(liq.netoLiquidacion)}`]],
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, lineColor: [180, 180, 180], lineWidth: 0.1 },
    headStyles: { fontStyle: 'bold', fillColor: [235, 238, 242], textColor: [0, 0, 0], lineWidth: 0.25 },
    footStyles: { fontStyle: 'bold', fillColor: [235, 238, 242], textColor: [0, 0, 0], lineWidth: 0.25 },
    columnStyles: {
      0: { cellWidth: 112 },
      1: { cellWidth: 38, halign: 'center' },
      2: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
    }
  });

  const finalY = ((doc as any).lastAutoTable?.finalY || 140) + 25;
  doc.setLineWidth(0.2);
  doc.line(marginX + 15, finalY, marginX + 75, finalY);
  doc.line(pageWidth - marginX - 75, finalY, pageWidth - marginX - 15, finalY);
  doc.setFontSize(7.5);
  doc.text('FIRMA Y SELLO DEL EMPLEADOR', marginX + 45, finalY + 5, { align: 'center' });
  doc.text('CONSTANCIA DE RECEPCIÓN DEL TRABAJADOR', pageWidth - marginX - 45, finalY + 5, { align: 'center' });

  doc.save(`LIQUIDACION_BENEFICIOS_${params.empresa.ruc}_${liq.trabajadorDocumento}.pdf`);
}

/**
 * Definición estándar para ANÁLISIS DE CUENTAS POR ANEXO Y COMPROBANTE (Formatos 3.3 a 3.14)
 */
export function construirDefinicionAnalisisCuentasEstandar(
  empresa: EmpresaCliente,
  periodo: string,
  cuenta: string,
  movimientos: any[],
  totales: {
    saldoInicialPen: number;
    totalDebePen: number;
    totalHaberPen: number;
    saldoFinalPen: number;
  },
  opciones?: { mostrarFechaHora?: boolean }
): EstandarReportDefinition {
  // 10 columnas calibradas exactamente a A4 Horizontal (283 mm útiles, margen 7 mm)
  const columnas: ColumnaReporteEstandar[] = [
    { id: 'fecha', label: 'Fecha', align: 'center', cellWidthPdf: 17 },
    { id: 'voucher', label: 'N° Asiento', align: 'center', cellWidthPdf: 20 },
    { id: 'cuenta', label: 'Cuenta', align: 'center', cellWidthPdf: 16 },
    { id: 'anexo', label: 'RUC/DNI', align: 'center', cellWidthPdf: 23 },
    { id: 'razonSocial', label: 'Denominación del Anexo', align: 'left', cellWidthPdf: 57 },
    { id: 'docRef', label: 'Doc. Referencia', align: 'center', cellWidthPdf: 25 },
    { id: 'glosa', label: 'Glosa del Asiento', align: 'left', cellWidthPdf: 57 },
    { id: 'debe', label: 'Cargos S/', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 22 },
    { id: 'haber', label: 'Abonos S/', align: 'right', isNumeric: true, sumar: true, cellWidthPdf: 22 },
    { id: 'saldo', label: 'Saldo S/', align: 'right', isNumeric: true, cellWidthPdf: 24 }
  ];

  const filas = movimientos.map((m) => ({
    fecha: formatearFechaEstandar(m.fechaContable),
    voucher: m.voucherNumero,
    cuenta: m.codigoCuenta,
    anexo: m.anexoNumeroDoc || '-',
    razonSocial: m.anexoRazonSocial || '-',
    docRef: m.docNumero ? `${m.docTipo || '01'}-${m.docSerie || ''}-${m.docNumero}` : '-',
    glosa: m.glosaLinea || m.glosaAsiento || '-',
    debe: m.debePen,
    haber: m.haberPen,
    saldo: m.saldoPen
  }));

  const grupos: FilaGrupoReporteEstandar[] = [
    {
      grupoId: 'analisis_cuentas_general',
      tituloGrupo: `CUENTA ANALIZADA: ${cuenta || 'TODAS'}`,
      filas,
      totalesGrupo: {
        debe: totales.totalDebePen,
        haber: totales.totalHaberPen,
        saldo: totales.saldoFinalPen
      }
    }
  ];

  return {
    titulo: 'ANÁLISIS DE CUENTAS POR ANEXO Y COMPROBANTE DE REFERENCIA',
    orientacion: 'landscape',
    empresa: {
      razonSocial: empresa.razonSocial,
      ruc: empresa.ruc,
      direccion: (empresa as any).domicilioFiscal || (empresa as any).direccion || 'Av. Principal 123',
      periodo: `${periodo} — CUENTA: ${cuenta || 'TODAS'}`
    },
    moneda: 'SOLES',
    columnas,
    grupos,
    totalesGenerales: {
      debe: totales.totalDebePen,
      haber: totales.totalHaberPen,
      saldo: totales.saldoFinalPen
    },
    mostrarFechaHoraImpresion: opciones?.mostrarFechaHora ?? true
  };
}


