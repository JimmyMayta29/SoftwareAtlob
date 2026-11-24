import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import AdmZip from 'adm-zip';
import { ReglaClasificacionV2 } from '../../../types/conciliacionV2';
import { ConciliacionV2Error } from '../../conciliacionV2Service';
import { clasificarLineaExtracto } from '../clasificador/clasificadorGlosaService';
import {
  PERFILES_BANCO_PREDEFINIDOS,
  buscarPerfilPredefinido,
} from '../perfilesBanco/perfilesPredefinidos';
import { generarPlantillaCsvSegura } from './importacionExtractoService';
import {
  normalizarFechaExtracto,
  normalizarMontoExtracto,
  parsearExtractoBancario,
} from './parsers';
import {
  MAX_PDF_STREAMS,
  PdfTextoNativoAdapter,
  setAdaptadorPdfTextoParaTests,
} from './pdfTextoAdapter';
import {
  MAX_BYTES_EXTRACTO,
  MAX_ENTRADAS_ZIP,
  MAX_FILAS_EXTRACTO,
  sanitizarCeldaExportacion,
  validarArchivoImportacion,
} from './validacionArchivo';

let pasados = 0;
function caso(nombre: string, fn: () => void) {
  fn();
  pasados += 1;
  console.log(`  ✅ ${nombre}`);
}

function construirXlsxBuffer(archivos: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [ruta, contenido] of Object.entries(archivos)) {
    zip.addFile(ruta, Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, 'utf8'));
  }
  return zip.toBuffer();
}

function construirXlsxMinimoValido(): Buffer {
  return construirXlsxBuffer({
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>',
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Extracto" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml':
      '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Fecha</t></si><si><t>Descripción</t></si><si><t>Referencia</t></si><si><t>Monto</t></si><si><t>Saldo</t></si><si><t>PAGO PROVEEDOR RUC 20123456789 F001-000123</t></si><si><t>OP-001</t></si></sst>',
    'xl/worksheets/sheet1.xml':
      '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c></row>' +
      '<row r="2"><c r="A2" t="n"><v>46310</v></c><c r="B2" t="s"><v>5</v></c><c r="C2" t="s"><v>6</v></c><c r="D2" t="n"><v>-250.5</v></c><c r="E2" t="n"><v>1749.5</v></c></row>' +
      '<row r="3"><c r="A3" t="str"><v>2026-10-16</v></c><c r="B3" t="inlineStr"><is><t>ABONO INTERES GANADO</t></is></c><c r="C3" t="inlineStr"><is><t>INT-01</t></is></c><c r="D3" t="n"><f>10+5</f><v>15.00</v></c><c r="E3" t="n"><v>1764.50</v></c></row>' +
      '</sheetData></worksheet>',
  });
}

console.log('\n====================================================================');
console.log('🧪 PRUEBAS UNITARIAS — PASO 3 IMPORTACIÓN, PARSERS Y CLASIFICADOR');
console.log('====================================================================');

caso('1. Validación de tamaño, base64 y Content-Type', () => {
  assert.throws(
    () => validarArchivoImportacion({ nombreArchivo: 'a.csv', contenidoBase64: '' }),
    (err: any) => err instanceof ConciliacionV2Error && err.codigo === 'ARCHIVO_VACIO'
  );

  const exceso = Buffer.alloc(MAX_BYTES_EXTRACTO + 1, 0x41).toString('base64');
  assert.throws(
    () => validarArchivoImportacion({ nombreArchivo: 'a.csv', contenidoBase64: exceso }),
    (err: any) => err instanceof ConciliacionV2Error && err.codigo === 'ARCHIVO_EXCEDE_TAMANO'
  );

  assert.throws(
    () =>
      validarArchivoImportacion({
        nombreArchivo: 'a.csv',
        contentType: 'application/pdf',
        contenidoBase64: Buffer.from('Fecha,Monto\n01/10/2026,10.00', 'utf8').toString('base64'),
      }),
    (err: any) => err instanceof ConciliacionV2Error && err.codigo === 'CONTENT_TYPE_INVALIDO'
  );
});

caso('2. Magic bytes y rechazo de discrepancia/NUL/macros/XXE/zip-bomb', () => {
  const xlsxValido = construirXlsxMinimoValido();
  const resXlsx = validarArchivoImportacion({
    nombreArchivo: 'extracto.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    contenidoBase64: xlsxValido.toString('base64'),
  });
  assert.equal(resXlsx.formatoArchivo, 'XLSX');
  assert.equal(resXlsx.hashArchivo.length, 64);

  // CSV con firma PK (xlsx disfrazado)
  assert.throws(
    () =>
      validarArchivoImportacion({
        nombreArchivo: 'disfraz.csv',
        contentType: 'text/csv',
        contenidoBase64: xlsxValido.toString('base64'),
      }),
    (err: any) => err instanceof ConciliacionV2Error && err.codigo === 'FIRMA_ARCHIVO_INVALIDA'
  );

  // CSV con byte NUL
  assert.throws(
    () =>
      validarArchivoImportacion({
        nombreArchivo: 'nul.csv',
        contenidoBase64: Buffer.from('a,b\x00c', 'latin1').toString('base64'),
      }),
    (err: any) => err instanceof ConciliacionV2Error && err.codigo === 'ARCHIVO_BINARIO_NO_PERMITIDO'
  );

  // .xlsm prohibido
  assert.throws(
    () =>
      validarArchivoImportacion({
        nombreArchivo: 'macro.xlsm',
        contenidoBase64: xlsxValido.toString('base64'),
      }),
    (err: any) => err instanceof ConciliacionV2Error && err.codigo === 'XLSX_MACROS_PROHIBIDAS'
  );

  // vbaProject.bin dentro de .xlsx
  const xlsxConMacro = construirXlsxBuffer({
    'xl/workbook.xml': '<workbook/>',
    'xl/vbaProject.bin': Buffer.from('VBA', 'utf8'),
  });
  assert.throws(
    () =>
      validarArchivoImportacion({
        nombreArchivo: 'con_macro.xlsx',
        contenidoBase64: xlsxConMacro.toString('base64'),
      }),
    (err: any) => err instanceof ConciliacionV2Error && err.codigo === 'XLSX_MACROS_PROHIBIDAS'
  );

  // XXE <!DOCTYPE / <!ENTITY
  const xlsxConXxe = construirXlsxBuffer({
    'xl/workbook.xml': '<!DOCTYPE foo [<!ENTITY xxe "evil">]><workbook/>',
  });
  assert.throws(
    () =>
      validarArchivoImportacion({
        nombreArchivo: 'xxe.xlsx',
        contenidoBase64: xlsxConXxe.toString('base64'),
      }),
    (err: any) => err instanceof ConciliacionV2Error && err.codigo === 'XML_ENTIDAD_PROHIBIDA'
  );

  // Zip con > 100 entradas
  const muchasEntradas: Record<string, string> = { 'xl/workbook.xml': '<workbook/>' };
  for (let i = 0; i < MAX_ENTRADAS_ZIP; i += 1) {
    muchasEntradas[`xl/extra_${i}.xml`] = '<x/>';
  }
  assert.throws(
    () =>
      validarArchivoImportacion({
        nombreArchivo: 'muchas.xlsx',
        contenidoBase64: construirXlsxBuffer(muchasEntradas).toString('base64'),
      }),
    (err: any) => err instanceof ConciliacionV2Error && err.codigo === 'ZIP_BOMB_DETECTADO'
  );

  // Zip bomb por ratio (> 50:1)
  const payloadRepetitivo = Buffer.alloc(60_000, 0x41); // 60KB de 'A' comprime a ~150 bytes -> ratio ~400:1
  const xlsxRatioAlto = construirXlsxBuffer({
    'xl/workbook.xml': '<workbook/>',
    'xl/worksheets/sheet1.xml': payloadRepetitivo,
  });
  assert.throws(
    () =>
      validarArchivoImportacion({
        nombreArchivo: 'bomba.xlsx',
        contenidoBase64: xlsxRatioAlto.toString('base64'),
      }),
    (err: any) => err instanceof ConciliacionV2Error && err.codigo === 'ZIP_BOMB_DETECTADO'
  );

  // ALTO 1: Zip bomb con cabecera Central Directory falseada (size=100 cuando el stream descomprime >25MB)
  const payload26Mb = Buffer.alloc(26 * 1024 * 1024, 0x42);
  const zip26Mb = construirXlsxBuffer({
    'xl/workbook.xml': '<workbook/>',
    'xl/worksheets/sheet1.xml': payload26Mb,
  });
  // Falsear uncompressedSize en Central Directory (PK\x01\x02 + 24) a 100 bytes para sheet1.xml
  const sigCen = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  let posCen = 0;
  while ((posCen = zip26Mb.indexOf(sigCen, posCen)) !== -1) {
    const nameLen = zip26Mb.readUInt16LE(posCen + 28);
    const nombreEntry = zip26Mb.subarray(posCen + 46, posCen + 46 + nameLen).toString('utf8');
    if (nombreEntry === 'xl/worksheets/sheet1.xml') {
      zip26Mb.writeUInt32LE(100, posCen + 24);
    }
    posCen += 4;
  }
  assert.throws(
    () =>
      validarArchivoImportacion({
        nombreArchivo: 'bomba_falseada.xlsx',
        contenidoBase64: zip26Mb.toString('base64'),
      }),
    (err: any) => err instanceof ConciliacionV2Error && err.codigo === 'ZIP_BOMB_DETECTADO'
  );
});

caso('3. Validación PDF activo prohibido y extracción nativa /FlateDecode', () => {
  for (const token of ['/JavaScript', '/JS', '/Launch', '/EmbeddedFile', '/RichMedia', '/XFA']) {
    const pdfMalo = Buffer.from(`%PDF-1.4\n1 0 obj << ${token} (alert) >> endobj\n%%EOF`, 'latin1');
    assert.throws(
      () =>
        validarArchivoImportacion({
          nombreArchivo: 'malo.pdf',
          contentType: 'application/pdf',
          contenidoBase64: pdfMalo.toString('base64'),
        }),
      (err: any) => err instanceof ConciliacionV2Error && err.codigo === 'PDF_CONTENIDO_PROHIBIDO',
      `Debe rechazar token ${token}`
    );
  }

  // PDF escaneado sin texto -> PDF_SIN_TEXTO_EXTRAIBLE
  const pdfVacio = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF', 'latin1');
  const adaptador = new PdfTextoNativoAdapter();
  assert.throws(
    () => adaptador.extraerLineasTexto(pdfVacio),
    (err: any) => err instanceof ConciliacionV2Error && err.codigo === 'PDF_SIN_TEXTO_EXTRAIBLE'
  );

  // PDF con stream /FlateDecode real y operadores BT...ET
  const streamTexto = Buffer.from(
    'BT\n1 0 0 1 50 700 Tm (05/10/2026 PAGO PROVEEDOR F001-000010 -150.00 850.00) Tj\n' +
      '1 0 0 1 50 685 Tm [(06/10/2026 ) -200 (ABONO CLIENTE 500.00 1350.00)] TJ\nET',
    'latin1'
  );
  const comprimido = zlib.deflateSync(streamTexto);
  const pdfValido = Buffer.concat([
    Buffer.from(`%PDF-1.4\n1 0 obj << /Length ${comprimido.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'),
    comprimido,
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);

  validarArchivoImportacion({
    nombreArchivo: 'extracto.pdf',
    contentType: 'application/pdf',
    contenidoBase64: pdfValido.toString('base64'),
  });

  const filasPdf = parsearExtractoBancario(pdfValido, { formatoArchivo: 'PDF' });
  assert.equal(filasPdf.length, 2);
  assert.equal(filasPdf[0].fecha, '2026-10-05');
  assert.equal(filasPdf[0].monto, '-150.00');
  assert.equal(filasPdf[0].saldo, '850.00');
  assert.equal(filasPdf[1].fecha, '2026-10-06');
  assert.equal(filasPdf[1].monto, '500.00');
  assert.equal(filasPdf[1].saldo, '1350.00');

  // Override temporal para tests
  setAdaptadorPdfTextoParaTests({
    extraerLineasTexto: () => ['07/10/2026 ITF BANCARIO -0.05 1349.95'],
  });
  const filasOverride = parsearExtractoBancario(pdfValido, { formatoArchivo: 'PDF' });
  assert.equal(filasOverride.length, 1);
  assert.equal(filasOverride[0].monto, '-0.05');
  setAdaptadorPdfTextoParaTests(null);

  // MEDIO: Rechazar PDF con más de MAX_PDF_STREAMS (200) streams
  const muchosStreams: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  for (let i = 0; i <= MAX_PDF_STREAMS; i += 1) {
    muchosStreams.push(Buffer.from(`${i + 1} 0 obj << /Length 2 >>\nstream\n()\nendstream\nendobj\n`, 'latin1'));
  }
  muchosStreams.push(Buffer.from('%%EOF', 'latin1'));
  assert.throws(
    () => adaptador.extraerLineasTexto(Buffer.concat(muchosStreams)),
    (err: any) => err instanceof ConciliacionV2Error && err.codigo === 'PDF_STREAM_EXCEDE_LIMITE'
  );

  // MEDIO: Rechazar PDF cuyo acumulado de streams supere MAX_PDF_TOTAL_SALIDA (32 MB)
  const bloque12Mb = zlib.deflateSync(Buffer.alloc(12 * 1024 * 1024, 0x20));
  const pdfAcumulado = Buffer.concat([
    Buffer.from('%PDF-1.4\n', 'latin1'),
    Buffer.from(`1 0 obj << /Length ${bloque12Mb.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'),
    bloque12Mb,
    Buffer.from('\nendstream\nendobj\n', 'latin1'),
    Buffer.from(`2 0 obj << /Length ${bloque12Mb.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'),
    bloque12Mb,
    Buffer.from('\nendstream\nendobj\n', 'latin1'),
    Buffer.from(`3 0 obj << /Length ${bloque12Mb.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'),
    bloque12Mb,
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);
  assert.throws(
    () => adaptador.extraerLineasTexto(pdfAcumulado),
    (err: any) => err instanceof ConciliacionV2Error && err.codigo === 'PDF_STREAM_EXCEDE_LIMITE'
  );
});

caso('4. Sanitización contra Formula Injection y plantilla CSV segura', () => {
  assert.equal(sanitizarCeldaExportacion('=CMD()'), "'=CMD()");
  assert.equal(sanitizarCeldaExportacion('+1+1'), "'+1+1");
  assert.equal(sanitizarCeldaExportacion('-100'), "'-100");
  assert.equal(sanitizarCeldaExportacion('@SUM(A1:A2)'), "'@SUM(A1:A2)");
  assert.equal(sanitizarCeldaExportacion('\t=1'), "'\t=1");
  assert.equal(sanitizarCeldaExportacion('\r=1'), "'\r=1");
  assert.equal(sanitizarCeldaExportacion('  =1'), "'  =1");
  assert.equal(sanitizarCeldaExportacion('PAGO NORMAL'), 'PAGO NORMAL');

  const plantilla = generarPlantillaCsvSegura();
  assert.ok(plantilla.startsWith('\uFEFF'), 'Plantilla debe incluir BOM UTF-8');
  const filasPlantilla = parsearExtractoBancario(Buffer.from(plantilla, 'utf8'), {
    formatoArchivo: 'CSV',
    mapeoColumnas: buscarPerfilPredefinido('BCP_ESTANDAR')!.mapeoColumnas,
  });
  assert.equal(filasPlantilla.length, 3);
  assert.equal(filasPlantilla[0].monto, '1500.00');
  assert.equal(filasPlantilla[1].monto, '-250.00');
  assert.equal(filasPlantilla[2].monto, '-0.05');
});

caso('5. Parsers XLSX (sharedStrings, inlineStr, serial date, fórmulas) y CSV RFC4180 + tope 10k filas', () => {
  const xlsxValido = construirXlsxMinimoValido();
  const filasXlsx = parsearExtractoBancario(xlsxValido, {
    formatoArchivo: 'XLSX',
    mapeoColumnas: buscarPerfilPredefinido('BCP_ESTANDAR')!.mapeoColumnas,
  });
  assert.equal(filasXlsx.length, 2);
  assert.equal(filasXlsx[0].fecha, '2026-10-15');
  assert.equal(filasXlsx[0].monto, '-250.50');
  assert.equal(filasXlsx[0].saldo, '1749.50');
  assert.equal(filasXlsx[1].fecha, '2026-10-16');
  assert.equal(filasXlsx[1].monto, '15.00'); // lee <v> literal, ignora <f>

  // Fórmula sin valor literal en celda financiera debe fallar la fila
  const xlsxFormulaSinValor = construirXlsxBuffer({
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':
      '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Fecha</t></is></c><c r="B1" t="inlineStr"><is><t>Descripcion</t></is></c><c r="C1" t="inlineStr"><is><t>Monto</t></is></c></row>' +
      '<row r="2"><c r="A2" t="str"><v>2026-10-01</v></c><c r="B2" t="str"><v>TEST</v></c><c r="C2"><f>SUM(A1:A2)</f></c></row>' +
      '</sheetData></worksheet>',
  });
  const filasFormula = parsearExtractoBancario(xlsxFormulaSinValor, { formatoArchivo: 'XLSX' });
  assert.equal(filasFormula[0].errores[0].codigo, 'FORMULA_NO_PERMITIDA_SIN_VALOR');

  // BAJO: Fórmula con <v/> vacío en columna financiera o en saldo debe marcar FORMULA_NO_PERMITIDA_SIN_VALOR
  const xlsxFormulaVacio = construirXlsxBuffer({
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':
      '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Fecha</t></is></c><c r="B1" t="inlineStr"><is><t>Descripcion</t></is></c><c r="C1" t="inlineStr"><is><t>Monto</t></is></c><c r="D1" t="inlineStr"><is><t>Saldo</t></is></c></row>' +
      '<row r="2"><c r="A2" t="str"><v>2026-10-01</v></c><c r="B2" t="str"><v>TEST</v></c><c r="C2" t="n"><v>10.00</v></c><c r="D2"><f>C2+10</f><v/></c></row>' +
      '</sheetData></worksheet>',
  });
  const filasFormulaVacio = parsearExtractoBancario(xlsxFormulaVacio, { formatoArchivo: 'XLSX' });
  assert.equal(filasFormulaVacio[0].errores[0].codigo, 'FORMULA_NO_PERMITIDA_SIN_VALOR');
  assert.equal(filasFormulaVacio[0].errores[0].campo, 'saldo');

  // ALTO 2: Referencia de columna XLSX fuera de límite (>255) o inválida debe rechazar ARCHIVO_XLSX_CORRUPTO
  const xlsxColumnaGigante = construirXlsxBuffer({
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':
      '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      '<row r="1"><c r="XFD1" t="str"><v>DOS</v></c></row>' +
      '</sheetData></worksheet>',
  });
  assert.throws(
    () => parsearExtractoBancario(xlsxColumnaGigante, { formatoArchivo: 'XLSX' }),
    (err: any) => err instanceof ConciliacionV2Error && err.codigo === 'ARCHIVO_XLSX_CORRUPTO'
  );

  const xlsxRefInvalida = construirXlsxBuffer({
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':
      '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      '<row r="1"><c r="INVALID" t="str"><v>X</v></c></row>' +
      '</sheetData></worksheet>',
  });
  assert.throws(
    () => parsearExtractoBancario(xlsxRefInvalida, { formatoArchivo: 'XLSX' }),
    (err: any) => err instanceof ConciliacionV2Error && err.codigo === 'ARCHIVO_XLSX_CORRUPTO'
  );

  // CSV RFC 4180 con punto y coma, comillas escapadas y coma decimal
  const csvEuropeo =
    'Fecha;Descripcion;Abono;Cargo;Saldo\n' +
    '01/10/2026;"COBRO ""FACTURA"" A";1.500,25;0,00;1.500,25\n' +
    '02-10-26;"CARGO VARIOS";0,00;(100,10);1.400,15\n';
  const filasCsv = parsearExtractoBancario(Buffer.from(csvEuropeo, 'latin1'), {
    formatoArchivo: 'CSV',
    separadorDecimal: ',',
    codificacion: 'LATIN1',
  });
  assert.equal(filasCsv.length, 2);
  assert.equal(filasCsv[0].descripcion, 'COBRO "FACTURA" A');
  assert.equal(filasCsv[0].monto, '1500.25');
  assert.equal(filasCsv[1].fecha, '2026-10-02');
  assert.equal(filasCsv[1].monto, '-100.10');

  // Tope de 10,000 filas
  const muchasLineas = ['Fecha,Descripcion,Monto'];
  for (let i = 0; i < MAX_FILAS_EXTRACTO + 1; i += 1) {
    muchasLineas.push('01/10/2026,MOV,1.00');
  }
  assert.throws(
    () => parsearExtractoBancario(Buffer.from(muchasLineas.join('\n'), 'utf8'), { formatoArchivo: 'CSV' }),
    (err: any) => err instanceof ConciliacionV2Error && err.codigo === 'ARCHIVO_EXCEDE_FILAS'
  );

  // Normalizadores
  assert.equal(normalizarFechaExtracto('31/02/2026'), null);
  assert.equal(normalizarFechaExtracto('05/10/2026'), '2026-10-05');
  assert.equal(normalizarMontoExtracto('S/ (1,234.565)', '.'), '-1234.57');
  assert.equal(normalizarMontoExtracto('100.00-', '.'), '-100.00');
});

caso('6. Perfiles predefinidos (5 bancos) y clasificador (12 tipos + extracción + ReDoS-safe)', () => {
  assert.equal(PERFILES_BANCO_PREDEFINIDOS.length, 5);
  for (const cod of [
    'BCP_ESTANDAR',
    'INTERBANK_ESTANDAR',
    'BBVA_ESTANDAR',
    'SCOTIABANK_ESTANDAR',
    'BANCO_NACION_ESTANDAR',
  ]) {
    const p = buscarPerfilPredefinido(cod);
    assert.ok(p && p.esSistema && p.predefinido, `Debe existir perfil ${cod}`);
  }

  const casosClasif: Array<[string, string | null, string, string]> = [
    ['IMP. ITF OPERACION', null, '-0.05', 'ITF'],
    ['COMISION POR TRANSFERENCIA', null, '-15.00', 'COMISION_BANCARIA'],
    ['MANTENIMIENTO DE CUENTA', null, '-12.00', 'MANTENIMIENTO'],
    ['INTERES DEUDOR SOBREGIRO', null, '-45.00', 'INTERES_GASTO'],
    ['INTERES ABONADO DEL MES', null, '22.10', 'INTERES_INGRESO'],
    ['DEPOSITO DETRACCION SPOT', null, '-350.00', 'DETRACCION'],
    ['PAGO TRIBUTO SUNAT NPS 123', null, '-800.00', 'TRIBUTO_SUNAT'],
    ['PAGO PLANILLA AFP INTEGRA', null, '-420.00', 'AFP_ONP_ESSALUD'],
    ['PAGO DE HABERES PLANILLA', null, '-5500.00', 'PLANILLA'],
    ['COBRO CHEQUE CHQ-009876', null, '-1200.00', 'CHEQUE'],
    ['TRANSFERENCIA PROVEEDOR: ACME SAC RUC 20555666777 F001-000123', 'OP-99', '-900.00', 'TRANSFERENCIA'],
    ['MOVIMIENTO DIVERSO NO CATEGORIZADO', null, '10.00', 'OTRO'],
  ];

  for (const [desc, ref, monto, esperado] of casosClasif) {
    const res = clasificarLineaExtracto(desc, ref, monto, [], 'BCP');
    assert.equal(res.tipoClasificacion, esperado, `Glosa "${desc}" debe clasificar como ${esperado}`);
  }

  const ext = clasificarLineaExtracto(
    'TRANSFERENCIA PROVEEDOR: INDUSTRIAS DEL NORTE SAC RUC 20555666777 F001-000123',
    'OP-99',
    '-900.00'
  );
  assert.equal(ext.rucExtraido, '20555666777');
  assert.equal(ext.docExtraido, 'F001-000123');
  assert.equal(ext.contraparteExtraida, 'INDUSTRIAS DEL NORTE SAC');

  // Regla personalizada priorizada
  const reglasCustom: ReglaClasificacionV2[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      empresaId: '22222222-2222-4222-8222-222222222222',
      nombre: 'CUSTOM_SUNAT_ESPECIAL',
      banco: 'BCP',
      tipoClasificacion: 'TRIBUTO_SUNAT',
      patronTexto: 'TESORO PUBLICO',
      tipoCoincidencia: 'PALABRAS_CLAVE',
      sentidoMonto: 'CARGO',
      prioridad: 5,
      esSistema: false,
      activo: true,
      createdAt: null,
      updatedAt: null,
    },
  ];
  const resCustom = clasificarLineaExtracto('CARGO TESORO PUBLICO VARIOS', null, '-100.00', reglasCustom, 'BCP');
  assert.equal(resCustom.tipoClasificacion, 'TRIBUTO_SUNAT');
  assert.equal(resCustom.reglaAplicada, 'CUSTOM_SUNAT_ESPECIAL');

  // Seguridad ReDoS con cadena larga repetitiva
  const t0 = Date.now();
  clasificarLineaExtracto('A '.repeat(250) + '!', 'REF'.repeat(40), '-10.00', reglasCustom, 'BCP');
  assert.ok(Date.now() - t0 < 50, 'Clasificador debe ejecutarse en tiempo lineal < 50ms');
});

console.log(`\n🎉 TODAS LAS PRUEBAS UNITARIAS PASO 3 PASARON: ${pasados}/${pasados}\n`);
