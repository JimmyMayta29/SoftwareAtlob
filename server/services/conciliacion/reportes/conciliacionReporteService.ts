import { createHash } from 'node:crypto';
import type ExcelJSType from 'exceljs';
import * as ExcelJSNamespace from 'exceljs';
import { db } from '../../../config/database';
import {
  ChequeBancarioV2,
  EstadoChequeBancarioV2,
  PartidaExtractoV2,
  PartidaLibroV2,
  ReporteConciliacionOficialV2,
} from '../../../types/conciliacionV2';
import { Money } from '../../../utils/decimal';
import { ordenarClavesComoJsonb } from '../../auditoriaChainService';
import {
  ConciliacionV2Error,
  asegurarPostgresDisponible,
  asegurarUuid,
  obtenerResumenConciliacionEnTx,
  resolverRangoPeriodo,
} from '../../conciliacionV2Service';

const FECHA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const PREFIJOS_FORMULA_EXCEL = new Set(['=', '+', '-', '@', '\t', '\r']);

function obtenerExcelJs(): typeof ExcelJSType {
  const ns = ExcelJSNamespace as unknown as {
    Workbook?: typeof ExcelJSType.Workbook;
    default?: typeof ExcelJSType;
  };
  if (ns?.Workbook) {
    return ns as unknown as typeof ExcelJSType;
  }
  if (ns?.default?.Workbook) {
    return ns.default;
  }
  throw new Error('No se pudo inicializar el motor ExcelJS en el servidor.');
}

/**
 * Sanitiza un valor antes de escribirlo en una celda de Excel para prevenir
 * inyección de fórmulas (=, +, -, @, \t, \r), incluso tras espacios iniciales.
 */
export function sanitizarCeldaExcel(valor: unknown): string | number | boolean {
  if (valor === null || valor === undefined) {
    return '';
  }
  if (typeof valor === 'number' || typeof valor === 'boolean') {
    return valor;
  }
  const texto = valor instanceof Date ? valor.toISOString() : String(valor);
  if (texto.length === 0) {
    return '';
  }
  const trimmed = texto.trimStart();
  if (
    PREFIJOS_FORMULA_EXCEL.has(texto[0]) ||
    (trimmed.length > 0 && PREFIJOS_FORMULA_EXCEL.has(trimmed[0]))
  ) {
    return `'${texto}`;
  }
  return texto;
}

function mapChequeRow(row: any): ChequeBancarioV2 {
  return {
    id: row.id,
    empresaId: row.empresaId,
    cuentaFinancieraId: row.cuentaFinancieraId,
    movimientoTesoreriaId: row.movimientoTesoreriaId ?? null,
    extractoLineaId: row.extractoLineaId ?? null,
    anexoId: row.anexoId ?? null,
    numeroCheque: row.numeroCheque,
    beneficiario: row.beneficiario,
    moneda: row.moneda === 'USD' ? 'USD' : 'PEN',
    monto: Money.format(row.monto ?? '0'),
    fechaGiro: row.fechaGiro,
    fechaEntrega: row.fechaEntrega ?? null,
    fechaCobro: row.fechaCobro ?? null,
    fechaVencimiento: row.fechaVencimiento ?? null,
    estado: row.estado as EstadoChequeBancarioV2,
    esNoNegociable: Boolean(row.esNoNegociable),
    observacion: row.observacion ?? null,
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

/**
 * Construye el DTO oficial de Conciliación Bancaria V2 leyendo exclusivamente
 * la base de datos transaccional de la empresa y calculando su huella SHA-256 determinística.
 */
export async function construirReporteConciliacionOficial(
  empresaId: string,
  cuentaFinancieraId: string,
  periodo: string,
  fechaCorte?: string
): Promise<ReporteConciliacionOficialV2> {
  asegurarPostgresDisponible();
  asegurarUuid(empresaId, 'empresaId');
  asegurarUuid(cuentaFinancieraId, 'cuentaFinancieraId');
  resolverRangoPeriodo(periodo);

  if (fechaCorte !== undefined && !FECHA_ISO_REGEX.test(fechaCorte)) {
    throw new ConciliacionV2Error(
      400,
      'FECHA_CORTE_INVALIDA',
      'fechaCorte debe tener formato YYYY-MM-DD.'
    );
  }

  return db.withEmpresaTransaction(empresaId, async (client) => {
    const empRes = await client.query<{
      id: string;
      ruc: string;
      razonSocial: string;
      domicilioFiscal: string | null;
    }>(
      `SELECT id,
              ruc,
              razon_social AS "razonSocial",
              domicilio_fiscal AS "domicilioFiscal"
       FROM empresas
       WHERE id = $1
       LIMIT 1`,
      [empresaId]
    );

    if (empRes.rows.length === 0) {
      throw new ConciliacionV2Error(
        404,
        'EMPRESA_NO_ENCONTRADA',
        'La empresa solicitada no existe.'
      );
    }

    const empresa = {
      id: empRes.rows[0].id,
      ruc: String(empRes.rows[0].ruc ?? '').trim(),
      razonSocial: empRes.rows[0].razonSocial,
      domicilioFiscal: empRes.rows[0].domicilioFiscal ?? null,
    };

    const resumen = await obtenerResumenConciliacionEnTx(
      client,
      empresaId,
      cuentaFinancieraId,
      periodo
    );

    const estado: 'ABIERTA' | 'CERRADA' = resumen.conciliacionPeriodo.estado;
    const fechaCorteFinal =
      fechaCorte ?? resumen.conciliacionPeriodo.fechaCorte ?? resumen.fechaFin;

    let cierreOficial: ReporteConciliacionOficialV2['cierreOficial'] = null;
    if (estado === 'CERRADA') {
      const histRes = await client.query<{
        cierreHistorialId: string;
        numeroSecuencia: number;
        fechaCierreHist: Date | string;
        cerradaPor: string | null;
        cerradaPorEmail: string | null;
        hashSnapshotSha256: string;
      }>(
        `SELECT h.id AS "cierreHistorialId",
                h.numero_secuencia AS "numeroSecuencia",
                h.created_at AS "fechaCierreHist",
                h.usuario_id AS "cerradaPor",
                u.email AS "cerradaPorEmail",
                h.hash_snapshot_sha256 AS "hashSnapshotSha256"
         FROM conciliacion_cierres_historial h
         LEFT JOIN usuarios_estudio u
           ON u.id = h.usuario_id
         WHERE h.empresa_id = $1
           AND h.cuenta_financiera_id = $2
           AND h.codigo_periodo = $3
           AND h.tipo_evento = 'CIERRE'
         ORDER BY h.numero_secuencia DESC, h.created_at DESC
         LIMIT 1`,
        [empresaId, cuentaFinancieraId, periodo]
      );

      const hist = histRes.rows[0];
      cierreOficial = {
        cierreHistorialId: hist?.cierreHistorialId ?? null,
        numeroSecuencia: hist ? Number(hist.numeroSecuencia) : null,
        fechaCierre:
          resumen.conciliacionPeriodo.fechaCierre ??
          (hist?.fechaCierreHist ? new Date(hist.fechaCierreHist).toISOString() : null),
        cerradaPor: hist?.cerradaPor ?? resumen.conciliacionPeriodo.cerradaPor ?? null,
        cerradaPorEmail: hist?.cerradaPorEmail ?? null,
        hashSnapshotSha256: hist?.hashSnapshotSha256 ?? null,
      };
    }

    const chequesRes = await client.query(
      `SELECT id,
              empresa_id AS "empresaId",
              cuenta_financiera_id AS "cuentaFinancieraId",
              movimiento_tesoreria_id AS "movimientoTesoreriaId",
              extracto_linea_id AS "extractoLineaId",
              anexo_id AS "anexoId",
              numero_cheque AS "numeroCheque",
              beneficiario,
              moneda,
              monto::text AS monto,
              fecha_giro::text AS "fechaGiro",
              fecha_entrega::text AS "fechaEntrega",
              fecha_cobro::text AS "fechaCobro",
              fecha_vencimiento::text AS "fechaVencimiento",
              estado,
              es_no_negociable AS "esNoNegociable",
              observacion,
              created_by AS "createdBy",
              updated_by AS "updatedBy",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
       FROM cheques_bancarios
       WHERE empresa_id = $1
         AND cuenta_financiera_id = $2
         AND fecha_giro <= $3
       ORDER BY fecha_giro ASC, numero_cheque ASC, id ASC`,
      [empresaId, cuentaFinancieraId, fechaCorteFinal]
    );
    const chequesControlDetalle: ChequeBancarioV2[] = chequesRes.rows.map(mapChequeRow);

    const depositosEnTransito: PartidaLibroV2[] = resumen.movimientosLibros.filter(
      (m) => !m.conciliado && m.tipo === 'INGRESO'
    );
    const chequesNoCobrados: PartidaLibroV2[] = resumen.movimientosLibros.filter(
      (m) => !m.conciliado && m.tipo !== 'INGRESO'
    );
    const abonosNoRegistrados: PartidaExtractoV2[] = resumen.extractoLineas.filter(
      (l) => !l.conciliada && l.estadoConciliacion !== 'DUPLICADO' && Money.create(l.monto).gt(0)
    );
    const cargosNoRegistrados: PartidaExtractoV2[] = resumen.extractoLineas.filter(
      (l) => !l.conciliada && l.estadoConciliacion !== 'DUPLICADO' && Money.create(l.monto).lt(0)
    );

    let montoExtractoConciliadasDec = Money.create(0);
    let totalExtractoConciliadas = 0;
    for (const linea of resumen.extractoLineas) {
      if (linea.conciliada) {
        totalExtractoConciliadas += 1;
        montoExtractoConciliadasDec = Money.add(montoExtractoConciliadasDec, linea.monto);
      }
    }

    let montoLibrosConciliadosDec = Money.create(0);
    let totalLibrosConciliados = 0;
    for (const mov of resumen.movimientosLibros) {
      if (mov.conciliado) {
        totalLibrosConciliados += 1;
        montoLibrosConciliadosDec = Money.add(montoLibrosConciliadosDec, mov.importeConSigno);
      }
    }
    for (const manual of resumen.asientosManualesLibros ?? []) {
      if (manual.conciliado) {
        totalLibrosConciliados += 1;
        montoLibrosConciliadosDec = Money.add(montoLibrosConciliadosDec, manual.importeConSigno);
      }
    }

    const partidasConciliadasResumen = {
      totalExtractoConciliadas,
      montoExtractoConciliadas: Money.format(montoExtractoConciliadasDec),
      totalLibrosConciliados,
      montoLibrosConciliados: Money.format(montoLibrosConciliadosDec),
    };

    const cuadre: ReporteConciliacionOficialV2['cuadre'] = {
      saldoInicialExtracto: resumen.saldoInicialExtracto,
      saldoFinalExtracto: resumen.saldoFinalExtracto,
      depositosEnTransito: resumen.depositosEnTransito,
      chequesNoCobrados: resumen.chequesNoCobrados,
      saldoAjustadoBanco: resumen.saldoAjustadoBanco,
      saldoLibros: resumen.saldoLibros,
      abonosNoRegistrados: resumen.abonosNoRegistrados,
      cargosNoRegistrados: resumen.cargosNoRegistrados,
      saldoAjustadoLibros: resumen.saldoAjustadoLibros,
      diferencia: resumen.diferencia,
      semaforo: resumen.semaforo,
      toleranciaMonto: resumen.toleranciaMonto,
    };

    const bloqueCanonico = ordenarClavesComoJsonb({
      empresa: { id: empresa.id },
      cuenta: { id: resumen.cuenta.id },
      periodo,
      estado,
      fechaCorte: fechaCorteFinal,
      cuadre,
      integridadMayor: resumen.integridadMayor,
      conteos: resumen.conteos,
      partidasConciliadasResumen,
    });

    const hashReporteSha256 = createHash('sha256')
      .update(JSON.stringify(bloqueCanonico), 'utf8')
      .digest('hex');

    return {
      generadoEn: new Date().toISOString(),
      hashReporteSha256,
      empresa,
      cuenta: resumen.cuenta,
      periodo,
      fechaInicio: resumen.fechaInicio,
      fechaFin: resumen.fechaFin,
      estado,
      fechaCorte: fechaCorteFinal,
      cierreOficial,
      cuadre,
      integridadMayor: resumen.integridadMayor,
      conteos: resumen.conteos,
      anexos: {
        depositosEnTransito,
        chequesNoCobrados,
        abonosNoRegistrados,
        cargosNoRegistrados,
        chequesControlDetalle,
      },
      partidasConciliadasResumen,
    };
  });
}

function formatearFechaCorta(fechaIso: string | null | undefined): string {
  if (!fechaIso) return '';
  const base = fechaIso.slice(0, 10);
  const parts = base.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return fechaIso;
}

function numeroSeguro(monto: string | null | undefined): number | string {
  if (monto === null || monto === undefined || monto === '') {
    return '';
  }
  return Money.toNumber(monto);
}

const BORDE_FINO: Partial<ExcelJSType.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};

const RELLENO_ENCABEZADO: ExcelJSType.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF1F5F9' },
};

const RELLENO_TOTAL: ExcelJSType.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE2E8F0' },
};

const NUM_FMT_MONTO = '#,##0.00;-#,##0.00;0.00';

function aplicarEncabezadoHoja(
  ws: ExcelJSType.Worksheet,
  titulo: string,
  reporte: ReporteConciliacionOficialV2,
  totalCols: number
): number {
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = sanitizarCeldaExcel(titulo);
  titleCell.font = { name: 'Calibri', size: 12, bold: true };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };

  ws.mergeCells(2, 1, 2, totalCols);
  const empCell = ws.getCell(2, 1);
  empCell.value = sanitizarCeldaExcel(
    `${reporte.empresa.razonSocial} | RUC: ${reporte.empresa.ruc} | Cuenta: ${reporte.cuenta.banco} ${reporte.cuenta.numero} (${reporte.cuenta.moneda})`
  );
  empCell.font = { name: 'Calibri', size: 9.5, bold: false };

  ws.mergeCells(3, 1, 3, totalCols);
  const perCell = ws.getCell(3, 1);
  perCell.value = sanitizarCeldaExcel(
    `Período: ${reporte.periodo} | Corte: ${formatearFechaCorta(reporte.fechaCorte)} | Estado: ${reporte.estado} | Semáforo: ${reporte.cuadre.semaforo}`
  );
  perCell.font = { name: 'Calibri', size: 9.5, bold: false };

  return 5;
}

function aplicarCabeceraTabla(
  ws: ExcelJSType.Worksheet,
  fila: number,
  headers: string[]
): void {
  const row = ws.getRow(fila);
  headers.forEach((h, idx) => {
    const cell = row.getCell(idx + 1);
    cell.value = sanitizarCeldaExcel(h);
    cell.font = { name: 'Calibri', size: 9.5, bold: true };
    cell.fill = RELLENO_ENCABEZADO;
    cell.border = BORDE_FINO;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  row.height = 22;
}

/**
 * Genera el libro Excel (.xlsx) multipestaña oficial de Conciliación Bancaria V2
 * con sanitización estricta contra inyección de fórmulas en todas las celdas de texto.
 */
export async function generarReporteConciliacionExcel(
  reporte: ReporteConciliacionOficialV2
): Promise<Buffer> {
  const ExcelJS = obtenerExcelJs();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ATLOB ERP';
  wb.created = new Date();

  // --------------------------------------------------------------------------
  // Hoja 1: Resumen Conciliacion
  // --------------------------------------------------------------------------
  const wsResumen = wb.addWorksheet('Resumen Conciliacion', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  wsResumen.columns = [
    { width: 34 },
    { width: 20 },
    { width: 6 },
    { width: 34 },
    { width: 20 },
  ];

  wsResumen.mergeCells(1, 1, 1, 5);
  const cTitle = wsResumen.getCell(1, 1);
  cTitle.value = 'CONCILIACION BANCARIA OFICIAL';
  cTitle.font = { name: 'Calibri', size: 14, bold: true };
  cTitle.alignment = { horizontal: 'center', vertical: 'middle' };

  const metaRows: Array<[string, unknown, string, unknown]> = [
    ['Razón Social:', reporte.empresa.razonSocial, 'RUC:', reporte.empresa.ruc],
    ['Domicilio Fiscal:', reporte.empresa.domicilioFiscal ?? '-', 'Período:', `${reporte.periodo} (${formatearFechaCorta(reporte.fechaInicio)} - ${formatearFechaCorta(reporte.fechaFin)})`],
    ['Entidad Bancaria:', reporte.cuenta.banco, 'N° Cuenta:', reporte.cuenta.numero],
    ['CCI:', reporte.cuenta.cci ?? '-', 'Moneda:', reporte.cuenta.moneda],
    ['Cuenta Contable PCGE:', `${reporte.cuenta.cuentaContableCodigo} ${reporte.cuenta.cuentaContableNombre ?? ''}`.trim(), 'Fecha Corte:', formatearFechaCorta(reporte.fechaCorte)],
    ['Estado Conciliación:', reporte.estado, 'Semáforo Cuadre:', reporte.cuadre.semaforo],
    ['Generado en:', reporte.generadoEn, 'Tolerancia Monto:', numeroSeguro(reporte.cuadre.toleranciaMonto)],
  ];

  let rIdx = 3;
  for (const [k1, v1, k2, v2] of metaRows) {
    const row = wsResumen.getRow(rIdx);
    row.getCell(1).value = k1;
    row.getCell(1).font = { name: 'Calibri', size: 9.5, bold: true };
    row.getCell(2).value = sanitizarCeldaExcel(v1);
    row.getCell(2).font = { name: 'Calibri', size: 9.5 };
    row.getCell(4).value = k2;
    row.getCell(4).font = { name: 'Calibri', size: 9.5, bold: true };
    row.getCell(5).value = sanitizarCeldaExcel(v2);
    row.getCell(5).font = { name: 'Calibri', size: 9.5 };
    if (k2 === 'Tolerancia Monto:' && typeof row.getCell(5).value === 'number') {
      row.getCell(5).numFmt = NUM_FMT_MONTO;
    }
    rIdx += 1;
  }

  rIdx += 1;
  // Cabecera dual Banco vs Libros
  wsResumen.mergeCells(rIdx, 1, rIdx, 2);
  wsResumen.mergeCells(rIdx, 4, rIdx, 5);
  const hBanco = wsResumen.getCell(rIdx, 1);
  hBanco.value = 'SEGÚN EXTRACTO BANCARIO';
  hBanco.font = { name: 'Calibri', size: 10, bold: true };
  hBanco.fill = RELLENO_ENCABEZADO;
  hBanco.border = BORDE_FINO;
  hBanco.alignment = { horizontal: 'center' };
  wsResumen.getCell(rIdx, 2).fill = RELLENO_ENCABEZADO;
  wsResumen.getCell(rIdx, 2).border = BORDE_FINO;

  const hLibros = wsResumen.getCell(rIdx, 4);
  hLibros.value = 'SEGÚN LIBROS CONTABLES';
  hLibros.font = { name: 'Calibri', size: 10, bold: true };
  hLibros.fill = RELLENO_ENCABEZADO;
  hLibros.border = BORDE_FINO;
  hLibros.alignment = { horizontal: 'center' };
  wsResumen.getCell(rIdx, 5).fill = RELLENO_ENCABEZADO;
  wsResumen.getCell(rIdx, 5).border = BORDE_FINO;
  rIdx += 1;

  const cuadreDual: Array<[string, string | null, string, string | null, boolean]> = [
    ['Saldo Inicial Extracto (referencial)', reporte.cuadre.saldoInicialExtracto, 'Saldo según Libros (Tesorería)', reporte.cuadre.saldoLibros, false],
    ['Saldo Final Extracto Bancario', reporte.cuadre.saldoFinalExtracto, '(+) Abonos Bancarios No Registrados', reporte.cuadre.abonosNoRegistrados, false],
    ['(+) Depósitos en Tránsito', reporte.cuadre.depositosEnTransito, '(-) Cargos Bancarios No Registrados', reporte.cuadre.cargosNoRegistrados, false],
    ['(-) Cheques / Egresos No Cobrados', reporte.cuadre.chequesNoCobrados, '', null, false],
    ['(=) Saldo Ajustado Banco', reporte.cuadre.saldoAjustadoBanco, '(=) Saldo Ajustado Libros', reporte.cuadre.saldoAjustadoLibros, true],
  ];

  for (const [lblB, valB, lblL, valL, esTotal] of cuadreDual) {
    const row = wsResumen.getRow(rIdx);
    row.getCell(1).value = sanitizarCeldaExcel(lblB);
    row.getCell(1).font = { name: 'Calibri', size: 9.5, bold: esTotal };
    row.getCell(1).border = BORDE_FINO;
    row.getCell(2).value = valB !== null ? numeroSeguro(valB) : 'SIN EXTRACTO';
    row.getCell(2).font = { name: 'Calibri', size: 9.5, bold: esTotal };
    row.getCell(2).border = BORDE_FINO;
    if (typeof row.getCell(2).value === 'number') {
      row.getCell(2).numFmt = NUM_FMT_MONTO;
      row.getCell(2).alignment = { horizontal: 'right' };
    } else {
      row.getCell(2).alignment = { horizontal: 'right' };
    }

    row.getCell(4).value = sanitizarCeldaExcel(lblL);
    row.getCell(4).font = { name: 'Calibri', size: 9.5, bold: esTotal };
    row.getCell(4).border = BORDE_FINO;
    row.getCell(5).value = valL !== null ? numeroSeguro(valL) : '';
    row.getCell(5).font = { name: 'Calibri', size: 9.5, bold: esTotal };
    row.getCell(5).border = BORDE_FINO;
    if (typeof row.getCell(5).value === 'number') {
      row.getCell(5).numFmt = NUM_FMT_MONTO;
      row.getCell(5).alignment = { horizontal: 'right' };
    }
    if (esTotal) {
      [1, 2, 4, 5].forEach((c) => {
        row.getCell(c).fill = RELLENO_TOTAL;
      });
    }
    rIdx += 1;
  }

  rIdx += 1;
  const diffRow = wsResumen.getRow(rIdx);
  diffRow.getCell(1).value = 'Diferencia de Conciliación (Banco Ajust. - Libros Ajust.)';
  diffRow.getCell(1).font = { name: 'Calibri', size: 10, bold: true };
  diffRow.getCell(1).fill = RELLENO_TOTAL;
  diffRow.getCell(1).border = BORDE_FINO;
  diffRow.getCell(2).value =
    reporte.cuadre.diferencia !== null ? numeroSeguro(reporte.cuadre.diferencia) : 'N/A';
  diffRow.getCell(2).font = { name: 'Calibri', size: 10, bold: true };
  diffRow.getCell(2).fill = RELLENO_TOTAL;
  diffRow.getCell(2).border = BORDE_FINO;
  if (typeof diffRow.getCell(2).value === 'number') {
    diffRow.getCell(2).numFmt = NUM_FMT_MONTO;
  }
  diffRow.getCell(2).alignment = { horizontal: 'right' };
  diffRow.getCell(4).value = 'Semáforo de Cuadre';
  diffRow.getCell(4).font = { name: 'Calibri', size: 10, bold: true };
  diffRow.getCell(4).fill = RELLENO_TOTAL;
  diffRow.getCell(4).border = BORDE_FINO;
  diffRow.getCell(5).value = sanitizarCeldaExcel(reporte.cuadre.semaforo);
  diffRow.getCell(5).font = { name: 'Calibri', size: 10, bold: true };
  diffRow.getCell(5).fill = RELLENO_TOTAL;
  diffRow.getCell(5).border = BORDE_FINO;
  diffRow.getCell(5).alignment = { horizontal: 'center' };
  rIdx += 2;

  // Bloque Integridad Mayor 104x
  wsResumen.mergeCells(rIdx, 1, rIdx, 5);
  const hInt = wsResumen.getCell(rIdx, 1);
  hInt.value = 'CONTROL DE INTEGRIDAD VS LIBRO MAYOR (CUENTA 104x)';
  hInt.font = { name: 'Calibri', size: 10, bold: true };
  hInt.fill = RELLENO_ENCABEZADO;
  hInt.border = BORDE_FINO;
  rIdx += 1;

  const intRows: Array<[string, unknown, string, unknown]> = [
    [
      'Cuenta Contable Mayor:',
      reporte.integridadMayor.cuentaContableCodigo ?? 'No vinculada',
      'Verificada:',
      reporte.integridadMayor.verificada ? 'SI' : 'NO',
    ],
    [
      'Saldo Tesorería:',
      numeroSeguro(reporte.integridadMayor.saldoTesoreria),
      'Saldo Mayor 104x:',
      reporte.integridadMayor.saldoMayor104x !== null
        ? numeroSeguro(reporte.integridadMayor.saldoMayor104x)
        : 'N/A',
    ],
    [
      'Diferencia Integridad Mayor:',
      reporte.integridadMayor.diferenciaIntegridadMayor !== null
        ? numeroSeguro(reporte.integridadMayor.diferenciaIntegridadMayor)
        : 'N/A',
      'Alerta Integridad:',
      reporte.integridadMayor.alertaIntegridad ? 'ALERTA' : 'CONFORME',
    ],
  ];
  for (const [k1, v1, k2, v2] of intRows) {
    const row = wsResumen.getRow(rIdx);
    row.getCell(1).value = k1;
    row.getCell(1).font = { name: 'Calibri', size: 9.5, bold: true };
    row.getCell(1).border = BORDE_FINO;
    row.getCell(2).value = typeof v1 === 'number' ? v1 : sanitizarCeldaExcel(v1);
    row.getCell(2).border = BORDE_FINO;
    if (typeof row.getCell(2).value === 'number') row.getCell(2).numFmt = NUM_FMT_MONTO;

    row.getCell(4).value = k2;
    row.getCell(4).font = { name: 'Calibri', size: 9.5, bold: true };
    row.getCell(4).border = BORDE_FINO;
    row.getCell(5).value = typeof v2 === 'number' ? v2 : sanitizarCeldaExcel(v2);
    row.getCell(5).border = BORDE_FINO;
    if (typeof row.getCell(5).value === 'number') row.getCell(5).numFmt = NUM_FMT_MONTO;
    rIdx += 1;
  }
  if (reporte.integridadMayor.motivoAlerta) {
    wsResumen.mergeCells(rIdx, 1, rIdx, 5);
    const mCell = wsResumen.getCell(rIdx, 1);
    mCell.value = sanitizarCeldaExcel(`Observación Integridad: ${reporte.integridadMayor.motivoAlerta}`);
    mCell.font = { name: 'Calibri', size: 9, italic: true };
    rIdx += 1;
  }

  rIdx += 1;
  // Bloque Conteos y Partidas Conciliadas
  wsResumen.mergeCells(rIdx, 1, rIdx, 5);
  const hPart = wsResumen.getCell(rIdx, 1);
  hPart.value = 'RESUMEN DE CONTEOS Y PARTIDAS CONCILIADAS';
  hPart.font = { name: 'Calibri', size: 10, bold: true };
  hPart.fill = RELLENO_ENCABEZADO;
  hPart.border = BORDE_FINO;
  rIdx += 1;

  const conteoRows: Array<[string, unknown, string, unknown]> = [
    [
      'Partidas Extracto (Total / Conciliadas / Pendientes):',
      `${reporte.conteos.totalExtracto} / ${reporte.conteos.conciliadasExtracto} / ${reporte.conteos.pendientesLibros}`,
      'Total Extracto Conciliado:',
      numeroSeguro(reporte.partidasConciliadasResumen.montoExtractoConciliadas),
    ],
    [
      'Partidas Libros (Total / Conciliadas / Pendientes):',
      `${reporte.conteos.totalLibros} / ${reporte.conteos.conciliadosLibros} / ${reporte.conteos.pendientesBanco + reporte.conteos.chequesNoCobrados}`,
      'Total Libros Conciliado:',
      numeroSeguro(reporte.partidasConciliadasResumen.montoLibrosConciliados),
    ],
  ];
  for (const [k1, v1, k2, v2] of conteoRows) {
    const row = wsResumen.getRow(rIdx);
    row.getCell(1).value = k1;
    row.getCell(1).font = { name: 'Calibri', size: 9.5, bold: true };
    row.getCell(1).border = BORDE_FINO;
    row.getCell(2).value = sanitizarCeldaExcel(v1);
    row.getCell(2).border = BORDE_FINO;
    row.getCell(4).value = k2;
    row.getCell(4).font = { name: 'Calibri', size: 9.5, bold: true };
    row.getCell(4).border = BORDE_FINO;
    row.getCell(5).value = typeof v2 === 'number' ? v2 : sanitizarCeldaExcel(v2);
    row.getCell(5).border = BORDE_FINO;
    if (typeof row.getCell(5).value === 'number') row.getCell(5).numFmt = NUM_FMT_MONTO;
    rIdx += 1;
  }

  rIdx += 1;
  // Huella criptográfica SHA-256 y cierre
  wsResumen.mergeCells(rIdx, 1, rIdx, 5);
  const hSec = wsResumen.getCell(rIdx, 1);
  hSec.value = 'TRAZABILIDAD CRIPTOGRÁFICA Y CIERRE OFICIAL';
  hSec.font = { name: 'Calibri', size: 10, bold: true };
  hSec.fill = RELLENO_ENCABEZADO;
  hSec.border = BORDE_FINO;
  rIdx += 1;

  wsResumen.getCell(rIdx, 1).value = 'SHA-256 Reporte:';
  wsResumen.getCell(rIdx, 1).font = { name: 'Calibri', size: 9, bold: true };
  wsResumen.mergeCells(rIdx, 2, rIdx, 5);
  wsResumen.getCell(rIdx, 2).value = sanitizarCeldaExcel(reporte.hashReporteSha256);
  wsResumen.getCell(rIdx, 2).font = { name: 'Consolas', size: 8.5 };
  rIdx += 1;

  if (reporte.cierreOficial) {
    wsResumen.getCell(rIdx, 1).value = 'Cierre Oficial (Secuencia / Fecha):';
    wsResumen.getCell(rIdx, 1).font = { name: 'Calibri', size: 9, bold: true };
    wsResumen.mergeCells(rIdx, 2, rIdx, 5);
    wsResumen.getCell(rIdx, 2).value = sanitizarCeldaExcel(
      `#${reporte.cierreOficial.numeroSecuencia ?? '-'} | ${reporte.cierreOficial.fechaCierre ?? '-'} | ${reporte.cierreOficial.cerradaPorEmail ?? reporte.cierreOficial.cerradaPor ?? '-'}`
    );
    rIdx += 1;

    wsResumen.getCell(rIdx, 1).value = 'SHA-256 Snapshot Cierre:';
    wsResumen.getCell(rIdx, 1).font = { name: 'Calibri', size: 9, bold: true };
    wsResumen.mergeCells(rIdx, 2, rIdx, 5);
    wsResumen.getCell(rIdx, 2).value = sanitizarCeldaExcel(reporte.cierreOficial.hashSnapshotSha256 ?? '-');
    wsResumen.getCell(rIdx, 2).font = { name: 'Consolas', size: 8.5 };
    rIdx += 1;
  }

  // 3 Bloques de firma
  rIdx += 3;
  const firmaLineRow = wsResumen.getRow(rIdx);
  firmaLineRow.getCell(1).value = '______________________________';
  firmaLineRow.getCell(1).alignment = { horizontal: 'center' };
  firmaLineRow.getCell(2).value = '______________________________';
  firmaLineRow.getCell(2).alignment = { horizontal: 'center' };
  wsResumen.mergeCells(rIdx, 4, rIdx, 5);
  firmaLineRow.getCell(4).value = '______________________________';
  firmaLineRow.getCell(4).alignment = { horizontal: 'center' };
  rIdx += 1;

  const firmaLabelRow = wsResumen.getRow(rIdx);
  firmaLabelRow.getCell(1).value = 'Elaborado por';
  firmaLabelRow.getCell(1).font = { name: 'Calibri', size: 9.5, bold: true };
  firmaLabelRow.getCell(1).alignment = { horizontal: 'center' };
  firmaLabelRow.getCell(2).value = 'Revisado por';
  firmaLabelRow.getCell(2).font = { name: 'Calibri', size: 9.5, bold: true };
  firmaLabelRow.getCell(2).alignment = { horizontal: 'center' };
  wsResumen.mergeCells(rIdx, 4, rIdx, 5);
  firmaLabelRow.getCell(4).value = 'Aprobado por';
  firmaLabelRow.getCell(4).font = { name: 'Calibri', size: 9.5, bold: true };
  firmaLabelRow.getCell(4).alignment = { horizontal: 'center' };

  // --------------------------------------------------------------------------
  // Hoja 2: Depositos en Transito
  // --------------------------------------------------------------------------
  const wsDep = wb.addWorksheet('Depositos en Transito');
  wsDep.columns = [
    { width: 13 },
    { width: 12 },
    { width: 14 },
    { width: 18 },
    { width: 14 },
    { width: 28 },
    { width: 36 },
    { width: 10 },
    { width: 16 },
    { width: 18 },
  ];
  let rowDep = aplicarEncabezadoHoja(wsDep, 'ANEXO 1: DEPOSITOS EN TRANSITO', reporte, 10);
  aplicarCabeceraTabla(wsDep, rowDep, [
    'Fecha',
    'Tipo',
    'Medio Pago',
    'N° Operación / Ref.',
    'RUC Tercero',
    'Razón Social Tercero',
    'Glosa',
    'Moneda',
    'Importe',
    'Estado Libro',
  ]);
  rowDep += 1;

  let sumDep = Money.create(0);
  for (const item of reporte.anexos.depositosEnTransito) {
    const r = wsDep.getRow(rowDep);
    const impDec = Money.round(item.importe);
    sumDep = Money.add(sumDep, impDec);
    r.getCell(1).value = sanitizarCeldaExcel(formatearFechaCorta(item.fecha));
    r.getCell(2).value = sanitizarCeldaExcel(item.tipo);
    r.getCell(3).value = sanitizarCeldaExcel(item.medioPago);
    r.getCell(4).value = sanitizarCeldaExcel(item.numeroOperacion ?? item.docRef ?? '');
    r.getCell(5).value = sanitizarCeldaExcel(item.anexoRuc ?? '');
    r.getCell(6).value = sanitizarCeldaExcel(item.anexoNombre ?? '');
    r.getCell(7).value = sanitizarCeldaExcel(item.glosa);
    r.getCell(8).value = sanitizarCeldaExcel(item.moneda);
    r.getCell(9).value = Money.toNumber(impDec);
    r.getCell(9).numFmt = NUM_FMT_MONTO;
    r.getCell(10).value = sanitizarCeldaExcel(item.estadoLibroV2);
    for (let c = 1; c <= 10; c++) r.getCell(c).border = BORDE_FINO;
    rowDep += 1;
  }
  const totDepRow = wsDep.getRow(rowDep);
  totDepRow.getCell(8).value = 'TOTAL';
  totDepRow.getCell(8).font = { bold: true };
  totDepRow.getCell(9).value = Money.toNumber(sumDep);
  totDepRow.getCell(9).font = { bold: true };
  totDepRow.getCell(9).numFmt = NUM_FMT_MONTO;
  for (let c = 1; c <= 10; c++) {
    totDepRow.getCell(c).fill = RELLENO_TOTAL;
    totDepRow.getCell(c).border = BORDE_FINO;
  }

  // --------------------------------------------------------------------------
  // Hoja 3: Cheques No Cobrados
  // --------------------------------------------------------------------------
  const wsCheqPend = wb.addWorksheet('Cheques No Cobrados');
  wsCheqPend.columns = [
    { width: 13 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 14 },
    { width: 28 },
    { width: 36 },
    { width: 10 },
    { width: 16 },
    { width: 20 },
  ];
  let rowCh = aplicarEncabezadoHoja(wsCheqPend, 'ANEXO 2: CHEQUES Y EGRESOS NO COBRADOS', reporte, 10);
  aplicarCabeceraTabla(wsCheqPend, rowCh, [
    'Fecha',
    'Tipo',
    'Medio Pago',
    'N° Cheque / Oper.',
    'RUC Benef.',
    'Beneficiario / Tercero',
    'Glosa',
    'Moneda',
    'Importe',
    'Estado Libro',
  ]);
  rowCh += 1;

  let sumCh = Money.create(0);
  for (const item of reporte.anexos.chequesNoCobrados) {
    const r = wsCheqPend.getRow(rowCh);
    const impDec = Money.round(item.importe);
    sumCh = Money.add(sumCh, impDec);
    r.getCell(1).value = sanitizarCeldaExcel(formatearFechaCorta(item.fecha));
    r.getCell(2).value = sanitizarCeldaExcel(item.tipo);
    r.getCell(3).value = sanitizarCeldaExcel(item.medioPago);
    r.getCell(4).value = sanitizarCeldaExcel(item.numeroOperacion ?? item.docRef ?? '');
    r.getCell(5).value = sanitizarCeldaExcel(item.anexoRuc ?? '');
    r.getCell(6).value = sanitizarCeldaExcel(item.anexoNombre ?? '');
    r.getCell(7).value = sanitizarCeldaExcel(item.glosa);
    r.getCell(8).value = sanitizarCeldaExcel(item.moneda);
    r.getCell(9).value = Money.toNumber(impDec);
    r.getCell(9).numFmt = NUM_FMT_MONTO;
    r.getCell(10).value = sanitizarCeldaExcel(item.estadoLibroV2);
    for (let c = 1; c <= 10; c++) r.getCell(c).border = BORDE_FINO;
    rowCh += 1;
  }
  const totChRow = wsCheqPend.getRow(rowCh);
  totChRow.getCell(8).value = 'TOTAL';
  totChRow.getCell(8).font = { bold: true };
  totChRow.getCell(9).value = Money.toNumber(sumCh);
  totChRow.getCell(9).font = { bold: true };
  totChRow.getCell(9).numFmt = NUM_FMT_MONTO;
  for (let c = 1; c <= 10; c++) {
    totChRow.getCell(c).fill = RELLENO_TOTAL;
    totChRow.getCell(c).border = BORDE_FINO;
  }

  // --------------------------------------------------------------------------
  // Hoja 4: Partidas Extracto Pend.
  // --------------------------------------------------------------------------
  const wsExt = wb.addWorksheet('Partidas Extracto Pend.');
  wsExt.columns = [
    { width: 22 },
    { width: 13 },
    { width: 38 },
    { width: 18 },
    { width: 18 },
    { width: 24 },
    { width: 14 },
    { width: 16 },
    { width: 20 },
  ];
  let rowExt = aplicarEncabezadoHoja(wsExt, 'ANEXO 3 Y 4: PARTIDAS DEL EXTRACTO PENDIENTES EN LIBROS', reporte, 9);
  aplicarCabeceraTabla(wsExt, rowExt, [
    'Clasificación Anexo',
    'Fecha',
    'Descripción Extracto',
    'Referencia',
    'Tipo Clasificación',
    'Contraparte',
    'RUC Extraído',
    'Monto',
    'Estado Conciliación',
  ]);
  rowExt += 1;

  const pendientesExt: Array<{ categoria: string; item: PartidaExtractoV2 }> = [
    ...reporte.anexos.abonosNoRegistrados.map((item) => ({
      categoria: 'ABONO NO REGISTRADO',
      item,
    })),
    ...reporte.anexos.cargosNoRegistrados.map((item) => ({
      categoria: 'CARGO NO REGISTRADO',
      item,
    })),
  ];

  let sumExtNeto = Money.create(0);
  for (const { categoria, item } of pendientesExt) {
    const r = wsExt.getRow(rowExt);
    const mDec = Money.round(item.monto);
    sumExtNeto = Money.add(sumExtNeto, mDec);
    r.getCell(1).value = sanitizarCeldaExcel(categoria);
    r.getCell(2).value = sanitizarCeldaExcel(formatearFechaCorta(item.fecha));
    r.getCell(3).value = sanitizarCeldaExcel(item.descripcion);
    r.getCell(4).value = sanitizarCeldaExcel(item.referencia ?? '');
    r.getCell(5).value = sanitizarCeldaExcel(item.tipoClasificacion ?? '');
    r.getCell(6).value = sanitizarCeldaExcel(item.contraparteExtraida ?? '');
    r.getCell(7).value = sanitizarCeldaExcel(item.rucExtraido ?? '');
    r.getCell(8).value = Money.toNumber(mDec);
    r.getCell(8).numFmt = NUM_FMT_MONTO;
    r.getCell(9).value = sanitizarCeldaExcel(item.estadoConciliacion);
    for (let c = 1; c <= 9; c++) r.getCell(c).border = BORDE_FINO;
    rowExt += 1;
  }
  const totExtRow = wsExt.getRow(rowExt);
  totExtRow.getCell(7).value = 'NETO';
  totExtRow.getCell(7).font = { bold: true };
  totExtRow.getCell(8).value = Money.toNumber(sumExtNeto);
  totExtRow.getCell(8).font = { bold: true };
  totExtRow.getCell(8).numFmt = NUM_FMT_MONTO;
  for (let c = 1; c <= 9; c++) {
    totExtRow.getCell(c).fill = RELLENO_TOTAL;
    totExtRow.getCell(c).border = BORDE_FINO;
  }

  // --------------------------------------------------------------------------
  // Hoja 5: Control de Cheques
  // --------------------------------------------------------------------------
  const wsCtrlCheq = wb.addWorksheet('Control de Cheques');
  wsCtrlCheq.columns = [
    { width: 16 },
    { width: 30 },
    { width: 13 },
    { width: 13 },
    { width: 13 },
    { width: 13 },
    { width: 10 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 30 },
  ];
  let rowCtrl = aplicarEncabezadoHoja(wsCtrlCheq, 'CONTROL DETALLADO DE CHEQUES BANCARIOS', reporte, 11);
  aplicarCabeceraTabla(wsCtrlCheq, rowCtrl, [
    'N° Cheque',
    'Beneficiario',
    'Fecha Giro',
    'Fecha Entrega',
    'Fecha Cobro',
    'Fecha Venc.',
    'Moneda',
    'Monto',
    'Estado',
    'No Negociable',
    'Observación',
  ]);
  rowCtrl += 1;

  let sumCtrl = Money.create(0);
  for (const ch of reporte.anexos.chequesControlDetalle) {
    const r = wsCtrlCheq.getRow(rowCtrl);
    const mDec = Money.round(ch.monto);
    if (ch.estado !== 'ANULADO') {
      sumCtrl = Money.add(sumCtrl, mDec);
    }
    r.getCell(1).value = sanitizarCeldaExcel(ch.numeroCheque);
    r.getCell(2).value = sanitizarCeldaExcel(ch.beneficiario);
    r.getCell(3).value = sanitizarCeldaExcel(formatearFechaCorta(ch.fechaGiro));
    r.getCell(4).value = sanitizarCeldaExcel(formatearFechaCorta(ch.fechaEntrega));
    r.getCell(5).value = sanitizarCeldaExcel(formatearFechaCorta(ch.fechaCobro));
    r.getCell(6).value = sanitizarCeldaExcel(formatearFechaCorta(ch.fechaVencimiento));
    r.getCell(7).value = sanitizarCeldaExcel(ch.moneda);
    r.getCell(8).value = Money.toNumber(mDec);
    r.getCell(8).numFmt = NUM_FMT_MONTO;
    r.getCell(9).value = sanitizarCeldaExcel(ch.estado);
    r.getCell(10).value = ch.esNoNegociable ? 'SI' : 'NO';
    r.getCell(11).value = sanitizarCeldaExcel(ch.observacion ?? '');
    for (let c = 1; c <= 11; c++) r.getCell(c).border = BORDE_FINO;
    rowCtrl += 1;
  }
  const totCtrlRow = wsCtrlCheq.getRow(rowCtrl);
  totCtrlRow.getCell(7).value = 'ACTIVOS';
  totCtrlRow.getCell(7).font = { bold: true };
  totCtrlRow.getCell(8).value = Money.toNumber(sumCtrl);
  totCtrlRow.getCell(8).font = { bold: true };
  totCtrlRow.getCell(8).numFmt = NUM_FMT_MONTO;
  for (let c = 1; c <= 11; c++) {
    totCtrlRow.getCell(c).fill = RELLENO_TOTAL;
    totCtrlRow.getCell(c).border = BORDE_FINO;
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

// ============================================================================
// GENERADOR PDF 1.4 PURO EN TYPESCRIPT (SIN DOM / SIN CANVAS / COMPATIBLE ESBUILD)
// ============================================================================

const REEMPLAZOS_WINANSI: Record<string, string> = {
  '\u2014': '-',
  '\u2013': '-',
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u2022': '*',
  '\u00B7': '.',
  '\u2265': '>=',
  '\u2264': '<=',
};

function normalizarTextoPdf(input: string): string {
  let salida = '';
  for (const ch of input) {
    if (REEMPLAZOS_WINANSI[ch]) {
      salida += REEMPLAZOS_WINANSI[ch];
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code >= 0x20 && code <= 0x7e) {
      salida += ch;
    } else if (code >= 0xa0 && code <= 0xff) {
      salida += ch;
    } else if (ch === '\t') {
      salida += ' ';
    } else if (ch === '\n' || ch === '\r') {
      salida += ' ';
    } else {
      salida += '?';
    }
  }
  return salida;
}

function escaparPdfString(texto: string): string {
  const norm = normalizarTextoPdf(texto);
  return norm
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function truncarTexto(texto: string, maxChars: number): string {
  const limpio = normalizarTextoPdf(texto).trim();
  if (limpio.length <= maxChars) return limpio;
  return `${limpio.slice(0, Math.max(1, maxChars - 3))}...`;
}

class PdfPuroBuilder {
  private readonly pageWidth = 595.28; // A4 portrait
  private readonly pageHeight = 841.89;
  private readonly marginX = 40;
  private readonly topY = 800;
  private readonly bottomY = 48;
  private pages: string[][] = [];
  private currentOps: string[] = [];
  private y = 800;

  constructor(private readonly headerRenderer?: (builder: PdfPuroBuilder) => void) {
    this.nuevaPagina(false);
  }

  public getY(): number {
    return this.y;
  }

  public setY(nextY: number): void {
    this.y = nextY;
  }

  public nuevaPagina(dibujarHeader = true): void {
    if (this.currentOps.length > 0) {
      this.pages.push(this.currentOps);
    }
    this.currentOps = [];
    this.y = this.topY;
    if (dibujarHeader && this.headerRenderer) {
      this.headerRenderer(this);
    }
  }

  public asegurarEspacio(alturaRequerida: number): void {
    if (this.y - alturaRequerida < this.bottomY) {
      this.nuevaPagina(true);
    }
  }

  public texto(
    x: number,
    y: number,
    contenido: string,
    opts?: { bold?: boolean; size?: number; align?: 'left' | 'right' | 'center'; maxWidthChars?: number }
  ): void {
    const size = opts?.size ?? 9;
    const font = opts?.bold ? 'F2' : 'F1';
    const raw = opts?.maxWidthChars ? truncarTexto(contenido, opts.maxWidthChars) : normalizarTextoPdf(contenido);
    const escaped = escaparPdfString(raw);
    let drawX = x;
    const approxWidth = raw.length * size * 0.48;
    if (opts?.align === 'right') {
      drawX = x - approxWidth;
    } else if (opts?.align === 'center') {
      drawX = x - approxWidth / 2;
    }
    this.currentOps.push(
      `BT /${font} ${size.toFixed(2)} Tf 1 0 0 1 ${drawX.toFixed(2)} ${y.toFixed(2)} Tm (${escaped}) Tj ET`
    );
  }

  public linea(x1: number, y1: number, x2: number, y2: number, width = 0.6): void {
    this.currentOps.push(
      `${width.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`
    );
  }

  public rectanguloSombreado(x: number, y: number, w: number, h: number, gray = 0.93): void {
    this.currentOps.push(
      `q ${gray.toFixed(2)} g ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f Q`
    );
  }

  public construirBuffer(): Buffer {
    if (this.currentOps.length > 0) {
      this.pages.push(this.currentOps);
      this.currentOps = [];
    }

    const totalPages = this.pages.length;
    // Agregar pie de página a todas las páginas
    for (let i = 0; i < totalPages; i++) {
      const ops = this.pages[i];
      const pie = escaparPdfString(`Pagina ${i + 1} de ${totalPages}`);
      ops.push(
        `BT /F1 8.00 Tf 1 0 0 1 ${(this.pageWidth / 2 - 25).toFixed(2)} 24.00 Tm (${pie}) Tj ET`
      );
    }

    // Objetos:
    // 1: Catalog
    // 2: Pages
    // 3: Font F1 (Helvetica)
    // 4: Font F2 (Helvetica-Bold)
    // 5..4+2*N: Page i y Content i
    const objects: Array<{ id: number; body: Buffer }> = [];
    const pageObjectIds: number[] = [];

    for (let i = 0; i < totalPages; i++) {
      const pageObjId = 5 + i * 2;
      const contentObjId = 6 + i * 2;
      pageObjectIds.push(pageObjId);

      const streamStr = this.pages[i].join('\n');
      const streamBuf = Buffer.from(streamStr, 'latin1');

      objects.push({
        id: pageObjId,
        body: Buffer.from(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pageWidth.toFixed(2)} ${this.pageHeight.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >>`,
          'latin1'
        ),
      });

      const contentHeader = Buffer.from(
        `<< /Length ${streamBuf.length} >>\nstream\n`,
        'latin1'
      );
      const contentFooter = Buffer.from('\nendstream', 'latin1');
      objects.push({
        id: contentObjId,
        body: Buffer.concat([contentHeader, streamBuf, contentFooter]),
      });
    }

    const fixedObjects: Array<{ id: number; body: Buffer }> = [
      {
        id: 1,
        body: Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'),
      },
      {
        id: 2,
        body: Buffer.from(
          `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${totalPages} >>`,
          'latin1'
        ),
      },
      {
        id: 3,
        body: Buffer.from(
          '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
          'latin1'
        ),
      },
      {
        id: 4,
        body: Buffer.from(
          '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
          'latin1'
        ),
      },
    ];

    const allObjects = [...fixedObjects, ...objects].sort((a, b) => a.id - b.id);
    const chunks: Buffer[] = [];
    const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1');
    chunks.push(header);
    let offset = header.length;

    const offsets: number[] = [0];
    for (const obj of allObjects) {
      offsets[obj.id] = offset;
      const prefix = Buffer.from(`${obj.id} 0 obj\n`, 'latin1');
      const suffix = Buffer.from('\nendobj\n', 'latin1');
      chunks.push(prefix, obj.body, suffix);
      offset += prefix.length + obj.body.length + suffix.length;
    }

    const xrefStart = offset;
    const xrefLines = [`xref`, `0 ${allObjects.length + 1}`, '0000000000 65535 f '];
    for (let id = 1; id <= allObjects.length; id++) {
      xrefLines.push(`${String(offsets[id]).padStart(10, '0')} 00000 n `);
    }
    const xrefStr =
      xrefLines.join('\n') +
      `\ntrailer\n<< /Size ${allObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
    chunks.push(Buffer.from(xrefStr, 'latin1'));

    return Buffer.concat(chunks);
  }
}

function fmtMontoPdf(valor: string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return 'SIN EXTRACTO';
  return Money.format(valor);
}

/**
 * Genera el PDF oficial (PDF 1.4 puro, sin dependencias DOM/canvas) para backend y desktop.
 */
export function generarReporteConciliacionPdfBuffer(
  reporte: ReporteConciliacionOficialV2
): Buffer {
  const left = 40;
  const right = 555;
  const width = right - left;

  const dibujarCabecera = (pdf: PdfPuroBuilder) => {
    pdf.texto(left, 804, 'CONCILIACION BANCARIA OFICIAL', { bold: true, size: 13 });
    pdf.texto(right, 804, `Periodo: ${reporte.periodo}`, { bold: true, size: 9.5, align: 'right' });
    pdf.texto(left, 788, `${reporte.empresa.razonSocial.toUpperCase()}  |  RUC: ${reporte.empresa.ruc}`, {
      bold: true,
      size: 9,
      maxWidthChars: 92,
    });
    pdf.texto(
      left,
      775,
      `Cuenta: ${reporte.cuenta.banco} ${reporte.cuenta.numero} (${reporte.cuenta.moneda})  |  PCGE: ${reporte.cuenta.cuentaContableCodigo}`,
      { size: 8.5, maxWidthChars: 96 }
    );
    pdf.texto(
      left,
      763,
      `Corte: ${formatearFechaCorta(reporte.fechaCorte)}  |  Estado: ${reporte.estado}  |  Semaforo: ${reporte.cuadre.semaforo}`,
      { size: 8.5 }
    );
    pdf.linea(left, 756, right, 756, 0.8);
    pdf.setY(740);
  };

  const pdf = new PdfPuroBuilder(dibujarCabecera);
  dibujarCabecera(pdf);

  // Huella SHA-256 y Cierre Oficial
  pdf.texto(left, pdf.getY(), `SHA-256 Reporte: ${reporte.hashReporteSha256}`, { size: 7.5 });
  pdf.setY(pdf.getY() - 12);
  if (reporte.cierreOficial) {
    pdf.texto(
      left,
      pdf.getY(),
      `Cierre #${reporte.cierreOficial.numeroSecuencia ?? '-'} | Fecha: ${reporte.cierreOficial.fechaCierre ?? '-'} | Snapshot SHA-256: ${reporte.cierreOficial.hashSnapshotSha256 ?? '-'}`,
      { size: 7.2, maxWidthChars: 105 }
    );
    pdf.setY(pdf.getY() - 14);
  } else {
    pdf.setY(pdf.getY() - 4);
  }

  // Bloque Comparativo Banco vs Libros
  pdf.asegurarEspacio(110);
  const yBox = pdf.getY();
  pdf.rectanguloSombreado(left, yBox - 12, width, 15, 0.9);
  pdf.texto(left + 4, yBox - 8, 'CUADRE COMPARATIVO: BANCO VS LIBROS', { bold: true, size: 9 });
  pdf.setY(yBox - 24);

  const filasCuadre: Array<[string, string, string, string, boolean]> = [
    ['Saldo Inicial Extracto', fmtMontoPdf(reporte.cuadre.saldoInicialExtracto), 'Saldo Segun Libros', fmtMontoPdf(reporte.cuadre.saldoLibros), false],
    ['Saldo Final Extracto', fmtMontoPdf(reporte.cuadre.saldoFinalExtracto), '(+) Abonos No Registrados', fmtMontoPdf(reporte.cuadre.abonosNoRegistrados), false],
    ['(+) Depositos en Transito', fmtMontoPdf(reporte.cuadre.depositosEnTransito), '(-) Cargos No Registrados', fmtMontoPdf(reporte.cuadre.cargosNoRegistrados), false],
    ['(-) Cheques No Cobrados', fmtMontoPdf(reporte.cuadre.chequesNoCobrados), '', '', false],
    ['(=) Saldo Ajustado Banco', fmtMontoPdf(reporte.cuadre.saldoAjustadoBanco), '(=) Saldo Ajustado Libros', fmtMontoPdf(reporte.cuadre.saldoAjustadoLibros), true],
  ];

  const col1X = left + 4;
  const col2X = left + 250;
  const col3X = left + 275;
  const col4X = right - 4;

  for (const [l1, v1, l2, v2, bold] of filasCuadre) {
    const cy = pdf.getY();
    if (bold) {
      pdf.rectanguloSombreado(left, cy - 3, width, 14, 0.94);
    }
    pdf.texto(col1X, cy, l1, { bold, size: 8.3 });
    pdf.texto(col2X, cy, v1, { bold, size: 8.3, align: 'right' });
    pdf.texto(col3X, cy, l2, { bold, size: 8.3 });
    if (v2) {
      pdf.texto(col4X, cy, v2, { bold, size: 8.3, align: 'right' });
    }
    pdf.setY(cy - 14);
  }

  pdf.texto(
    left + 4,
    pdf.getY(),
    `Diferencia Cuadre: ${reporte.cuadre.diferencia ?? 'SIN EXTRACTO'}   |   Tolerancia: ${reporte.cuadre.toleranciaMonto}   |   Semaforo: ${reporte.cuadre.semaforo}`,
    { bold: true, size: 8.5 }
  );
  pdf.setY(pdf.getY() - 18);

  // Integridad Mayor 104x
  pdf.asegurarEspacio(55);
  const yInt = pdf.getY();
  pdf.rectanguloSombreado(left, yInt - 12, width, 15, 0.9);
  pdf.texto(left + 4, yInt - 8, 'INTEGRIDAD MAYOR 104x', { bold: true, size: 9 });
  pdf.setY(yInt - 24);
  pdf.texto(
    left + 4,
    pdf.getY(),
    `Cuenta Mayor: ${reporte.integridadMayor.cuentaContableCodigo ?? 'NO VINCULADA'}  |  Saldo Tesoreria: ${reporte.integridadMayor.saldoTesoreria}  |  Saldo Mayor: ${reporte.integridadMayor.saldoMayor104x ?? 'N/A'}  |  Dif.: ${reporte.integridadMayor.diferenciaIntegridadMayor ?? 'N/A'}`,
    { size: 8.2 }
  );
  pdf.setY(pdf.getY() - 13);
  pdf.texto(
    left + 4,
    pdf.getY(),
    `Estado Integridad: ${reporte.integridadMayor.alertaIntegridad ? 'ALERTA' : 'CONFORME'}${reporte.integridadMayor.motivoAlerta ? ' - ' + reporte.integridadMayor.motivoAlerta : ''}`,
    { bold: reporte.integridadMayor.alertaIntegridad, size: 8, maxWidthChars: 100 }
  );
  pdf.setY(pdf.getY() - 18);

  // Resumen de los 4 anexos y control de cheques
  const resumenAnexos: Array<{ titulo: string; items: Array<{ fecha: string; desc: string; monto: string }> }> = [
    {
      titulo: `ANEXO 1 - DEPOSITOS EN TRANSITO (${reporte.anexos.depositosEnTransito.length}) | Total: ${reporte.cuadre.depositosEnTransito}`,
      items: reporte.anexos.depositosEnTransito.map((d) => ({
        fecha: formatearFechaCorta(d.fecha),
        desc: `${d.numeroOperacion ?? d.docRef ?? ''} ${d.glosa}`.trim(),
        monto: d.importe,
      })),
    },
    {
      titulo: `ANEXO 2 - CHEQUES NO COBRADOS (${reporte.anexos.chequesNoCobrados.length}) | Total: ${reporte.cuadre.chequesNoCobrados}`,
      items: reporte.anexos.chequesNoCobrados.map((c) => ({
        fecha: formatearFechaCorta(c.fecha),
        desc: `${c.numeroOperacion ?? c.docRef ?? ''} ${c.anexoNombre ?? ''} ${c.glosa}`.trim(),
        monto: c.importe,
      })),
    },
    {
      titulo: `ANEXO 3 - ABONOS NO REGISTRADOS (${reporte.anexos.abonosNoRegistrados.length}) | Total: ${reporte.cuadre.abonosNoRegistrados}`,
      items: reporte.anexos.abonosNoRegistrados.map((a) => ({
        fecha: formatearFechaCorta(a.fecha),
        desc: `${a.referencia ?? ''} ${a.descripcion}`.trim(),
        monto: a.monto,
      })),
    },
    {
      titulo: `ANEXO 4 - CARGOS NO REGISTRADOS (${reporte.anexos.cargosNoRegistrados.length}) | Total: ${reporte.cuadre.cargosNoRegistrados}`,
      items: reporte.anexos.cargosNoRegistrados.map((c) => ({
        fecha: formatearFechaCorta(c.fecha),
        desc: `${c.referencia ?? ''} ${c.descripcion}`.trim(),
        monto: c.monto,
      })),
    },
  ];

  for (const anexo of resumenAnexos) {
    pdf.asegurarEspacio(32);
    const ya = pdf.getY();
    pdf.rectanguloSombreado(left, ya - 11, width, 13, 0.92);
    pdf.texto(left + 4, ya - 8, anexo.titulo, { bold: true, size: 8.3 });
    pdf.setY(ya - 22);

    if (anexo.items.length === 0) {
      pdf.texto(left + 8, pdf.getY(), 'Sin partidas pendientes en este anexo.', { size: 7.8 });
      pdf.setY(pdf.getY() - 14);
    } else {
      for (const it of anexo.items) {
        pdf.asegurarEspacio(14);
        const yi = pdf.getY();
        pdf.texto(left + 6, yi, it.fecha, { size: 7.8 });
        pdf.texto(left + 64, yi, it.desc, { size: 7.8, maxWidthChars: 74 });
        pdf.texto(right - 4, yi, it.monto, { size: 7.8, align: 'right' });
        pdf.setY(yi - 12);
      }
      pdf.setY(pdf.getY() - 4);
    }
  }

  // Control de cheques + Partidas conciliadas
  pdf.asegurarEspacio(36);
  pdf.texto(
    left,
    pdf.getY(),
    `Control de Cheques emitidos hasta corte: ${reporte.anexos.chequesControlDetalle.length} | Partidas conciliadas Extracto: ${reporte.partidasConciliadasResumen.totalExtractoConciliadas} (${reporte.partidasConciliadasResumen.montoExtractoConciliadas}) | Libros: ${reporte.partidasConciliadasResumen.totalLibrosConciliados} (${reporte.partidasConciliadasResumen.montoLibrosConciliados})`,
    { size: 7.8, maxWidthChars: 108 }
  );
  pdf.setY(pdf.getY() - 28);

  // 3 Líneas de firma obligatorias
  pdf.asegurarEspacio(65);
  const yFirma = Math.min(pdf.getY(), 110);
  const anchoFirma = 135;
  const f1X1 = left + 10;
  const f2X1 = left + 190;
  const f3X1 = left + 370;

  pdf.linea(f1X1, yFirma, f1X1 + anchoFirma, yFirma, 0.7);
  pdf.linea(f2X1, yFirma, f2X1 + anchoFirma, yFirma, 0.7);
  pdf.linea(f3X1, yFirma, f3X1 + anchoFirma, yFirma, 0.7);

  pdf.texto(f1X1 + anchoFirma / 2, yFirma - 12, 'Elaborado por', { bold: true, size: 8.5, align: 'center' });
  pdf.texto(f2X1 + anchoFirma / 2, yFirma - 12, 'Revisado por', { bold: true, size: 8.5, align: 'center' });
  pdf.texto(f3X1 + anchoFirma / 2, yFirma - 12, 'Aprobado por', { bold: true, size: 8.5, align: 'center' });

  return pdf.construirBuffer();
}
