import AdmZip from 'adm-zip';
import { jsPDF } from 'jspdf';

export interface FilaExtractoSintetica {
  fecha: string;
  descripcion: string;
  referencia: string;
  abono?: string;
  cargo?: string;
  monto?: string;
  saldo: string;
}

export function aBase64(contenido: string | Buffer): string {
  return (Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, 'utf8')).toString('base64');
}

function escaparCsvCampo(valor: string): string {
  if (/[",\r\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function indiceAColumnaExcel(idx: number): string {
  let n = idx + 1;
  let col = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

export function construirXlsxSintetico(
  filas: Array<Array<string | number>>,
  opciones: {
    incluirVba?: boolean;
    xmlDoctypeXxe?: boolean;
    inflarZipBomb?: boolean;
    soloWorkbook?: boolean;
  } = {}
): Buffer {
  const zip = new AdmZip();

  zip.addFile(
    '[Content_Types].xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
        `</Types>`,
      'utf8'
    )
  );

  zip.addFile(
    '_rels/.rels',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
      'utf8'
    )
  );

  const doctype = opciones.xmlDoctypeXxe
    ? `<!DOCTYPE workbook [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>`
    : '';

  zip.addFile(
    'xl/workbook.xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>${doctype}` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="Extracto" sheetId="1" r:id="rId1"/></sheets>` +
        `</workbook>`,
      'utf8'
    )
  );

  zip.addFile(
    'xl/_rels/workbook.xml.rels',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
        `</Relationships>`,
      'utf8'
    )
  );

  const sharedStrings: string[] = [];
  const ssIndex = new Map<string, number>();
  const obtenerSs = (texto: string): number => {
    if (ssIndex.has(texto)) return ssIndex.get(texto)!;
    const idx = sharedStrings.length;
    sharedStrings.push(texto);
    ssIndex.set(texto, idx);
    return idx;
  };

  const rowsXml = filas
    .map((fila, rIdx) => {
      const numFila = rIdx + 1;
      const cellsXml = fila
        .map((celda, cIdx) => {
          const ref = `${indiceAColumnaExcel(cIdx)}${numFila}`;
          if (typeof celda === 'number') {
            return `<c r="${ref}" t="n"><v>${celda}</v></c>`;
          }
          const idx = obtenerSs(celda);
          return `<c r="${ref}" t="s"><v>${idx}</v></c>`;
        })
        .join('');
      return `<row r="${numFila}">${cellsXml}</row>`;
    })
    .join('');

  zip.addFile(
    'xl/sharedStrings.xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>` +
        `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">` +
        sharedStrings.map((s) => `<si><t>${escaparXml(s)}</t></si>`).join('') +
        `</sst>`,
      'utf8'
    )
  );

  zip.addFile(
    'xl/worksheets/sheet1.xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<sheetData>${rowsXml}</sheetData>` +
        `</worksheet>`,
      'utf8'
    )
  );

  if (opciones.incluirVba) {
    zip.addFile('xl/vbaProject.bin', Buffer.from('VBA_MACRO_SINTETICA_TEST'));
  }

  if (opciones.inflarZipBomb) {
    // 250 KB repetitivos se comprimen a < 1 KB (ratio > 250:1, supera MAX_RATIO_ZIP=50)
    zip.addFile('xl/payload_inflado.txt', Buffer.alloc(250_000, 0x41));
  }

  return zip.toBuffer();
}

/**
 * 1. BCP (CSV y XLSX): columnas Fecha, Descripción operación, Nro. operación, Monto, Saldo
 */
export function construirExtractoBcpCsv(filas?: FilaExtractoSintetica[]): string {
  const data = filas ?? [
    {
      fecha: '02/03/2026',
      descripcion: 'ABONO CLIENTE: COMERCIAL ANDINA SAC RUC 20991112223 F001-0000101',
      referencia: 'OP-30001',
      monto: '2500.00',
      saldo: '3500.00',
    },
    {
      fecha: '05/03/2026',
      descripcion: 'TRANSFERENCIA PROVEEDOR: TRANSPORTES SUR SAC RUC 20994445556 F002-0000202',
      referencia: 'OP-30002',
      monto: '-1000.00',
      saldo: '2500.00',
    },
    {
      fecha: '05/03/2026',
      descripcion: 'IMPUESTO TRANSACCIONES FINANCIERAS ITF',
      referencia: 'ITF-0001',
      monto: '-0.05',
      saldo: '2499.95',
    },
    {
      fecha: '05/03/2026',
      descripcion: 'IMPUESTO TRANSACCIONES FINANCIERAS ITF',
      referencia: 'ITF-0001',
      monto: '-0.05',
      saldo: '2499.90',
    },
    {
      fecha: '08/03/2026',
      descripcion: 'COMISION MANTENIMIENTO CUENTA EMPRESARIAL',
      referencia: 'COM-0009',
      monto: '-25.00',
      saldo: '2474.90',
    },
  ];

  const lineas = [
    ['Fecha', 'Descripción operación', 'Nro. operación', 'Monto', 'Saldo'].join(','),
    ...data.map((f) =>
      [f.fecha, f.descripcion, f.referencia, f.monto ?? '0.00', f.saldo].map(escaparCsvCampo).join(',')
    ),
  ];
  return lineas.join('\r\n');
}

export function construirExtractoBcpXlsx(filas?: FilaExtractoSintetica[]): Buffer {
  const data = filas ?? [
    {
      fecha: '02/03/2026',
      descripcion: 'ABONO CLIENTE: COMERCIAL ANDINA SAC RUC 20991112223 F001-0000101',
      referencia: 'OP-30001',
      monto: '2500.00',
      saldo: '3500.00',
    },
    {
      fecha: '05/03/2026',
      descripcion: 'IMPUESTO TRANSACCIONES FINANCIERAS ITF',
      referencia: 'ITF-0001',
      monto: '-0.05',
      saldo: '3499.95',
    },
  ];
  return construirXlsxSintetico([
    ['Fecha', 'Descripción operación', 'Nro. operación', 'Monto', 'Saldo'],
    ...data.map((f) => [f.fecha, f.descripcion, f.referencia, Number(f.monto ?? 0), Number(f.saldo)]),
  ]);
}

/**
 * 2. Interbank (CSV delimitador ';', columnas Abono / Cargo / Saldo contable)
 */
export function construirExtractoInterbankCsv(): string {
  const filas = [
    ['Fecha de operación', 'Descripción', 'Nro. de operación', 'Abono', 'Cargo', 'Saldo contable'],
    ['03/03/2026', 'ABONO TRANSF CLIENTE RUC 20992223334 F001-0000301', 'IBK-101', '1800.50', '0.00', '2800.50'],
    ['04/03/2026', 'PAGO SERVICIO SUNAT NPS 987654', 'IBK-102', '0.00', '450.25', '2350.25'],
    ['04/03/2026', 'CARGO ITF OPERACION', 'IBK-ITF', '0.00', '0.05', '2350.20'],
  ];
  return filas.map((r) => r.join(';')).join('\n');
}

/**
 * 3. BBVA (CSV y XLSX con Concepto / Referencia / Importe / Saldo)
 */
export function construirExtractoBbvaCsv(): string {
  const filas = [
    ['Fecha', 'Concepto', 'Referencia', 'Importe', 'Saldo'],
    ['06/03/2026', 'ABONO INTERES GANADO CUENTA', 'BBVA-001', '45.30', '1045.30'],
    ['07/03/2026', 'PAGO PLANILLA HABERES MARZO', 'BBVA-002', '-800.00', '245.30'],
  ];
  return filas.map((r) => r.map(escaparCsvCampo).join(',')).join('\n');
}

export function construirExtractoBbvaXlsx(): Buffer {
  return construirXlsxSintetico([
    ['Fecha', 'Concepto', 'Referencia', 'Importe', 'Saldo'],
    ['06/03/2026', 'ABONO INTERES GANADO CUENTA', 'BBVA-001', 45.3, 1045.3],
    ['07/03/2026', 'PAGO PLANILLA HABERES MARZO', 'BBVA-002', -800, 245.3],
  ]);
}

/**
 * 4. Scotiabank (CSV con Documento / Abono / Cargo / Saldo)
 */
export function construirExtractoScotiabankCsv(): string {
  const filas = [
    ['Fecha', 'Descripción', 'Documento', 'Abono', 'Cargo', 'Saldo'],
    ['09/03/2026', 'COBRO CHEQUE PROVEEDOR RUC 20993334445', 'CHQ-000881', '0.00', '600.00', '1400.00'],
    ['10/03/2026', 'DEPOSITO CLIENTE F003-0000512', 'DEP-0091', '1200.00', '0.00', '2600.00'],
  ];
  return filas.map((r) => r.map(escaparCsvCampo).join(',')).join('\n');
}

/**
 * 5. Banco de la Nación (TXT delimitado por '|' y tabulación opcional, LATIN1)
 */
export function construirExtractoBancoNacionTxt(delimitador: '|' | '\t' = '|'): Buffer {
  const filas = [
    ['Fecha', 'Descripción', 'Nro. Documento', 'Abono', 'Cargo', 'Saldo'],
    ['11/03/2026', 'DETRACCION SPOT RUC 20995556667 F001-0000777', 'BN-7001', '320.00', '0.00', '1320.00'],
    ['12/03/2026', 'PAGO TRIBUTO SUNAT RENTA', 'BN-7002', '0.00', '120.00', '1200.00'],
  ];
  return Buffer.from(filas.map((r) => r.join(delimitador)).join('\r\n'), 'latin1');
}

/**
 * 6. PDF-texto generado dinámicamente con jsPDF (para parser PDF nativo)
 */
export function construirExtractoPdfTexto(): Buffer {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);

  const lineas = [
    'ESTADO DE CUENTA BANCARIO SINTETICO - MARZO 2026',
    'FECHA       DESCRIPCION                              REF       MONTO      SALDO',
    '02/03/2026  ABONO CLIENTE RUC 20991112223 F001-0001  OP-9001   1500.00    2500.00',
    '03/03/2026  TRANSFERENCIA PROVEEDOR F002-0002        OP-9002   -500.00    2000.00',
    '03/03/2026  CARGO ITF BANCARIO                       ITF-901     -0.05    1999.95',
  ];

  let y = 50;
  for (const linea of lineas) {
    doc.text(linea, 30, y);
    y += 18;
  }

  return Buffer.from(doc.output('arraybuffer'));
}

/**
 * 7. Constructores de archivos malformados / vectores de ataque
 */
export function construirArchivoMayor5MbBase64(): string {
  // 5 MB + 2 KB en UTF-8
  const tamano = 5 * 1024 * 1024 + 2048;
  const encabezado = 'Fecha,Descripción operación,Nro. operación,Monto,Saldo\n';
  const relleno = '01/03/2026,MOVIMIENTO RELLENO,OP-1,1.00,1.00\n';
  const repeticiones = Math.ceil((tamano - encabezado.length) / relleno.length);
  const texto = encabezado + relleno.repeat(repeticiones);
  return Buffer.from(texto, 'utf8').toString('base64');
}

export function construirCsvMasDe10000Filas(): Buffer {
  const lineas = ['Fecha,Descripción operación,Nro. operación,Monto,Saldo'];
  for (let i = 1; i <= 10_005; i += 1) {
    lineas.push(`01/03/2026,MOVIMIENTO ${i},OP-${i},1.00,${i}.00`);
  }
  return Buffer.from(lineas.join('\n'), 'utf8');
}

export function construirXlsxZipBomb(): Buffer {
  return construirXlsxSintetico(
    [
      ['Fecha', 'Descripción operación', 'Nro. operación', 'Monto', 'Saldo'],
      ['01/03/2026', 'TEST', 'OP-1', 100, 100],
    ],
    { inflarZipBomb: true }
  );
}

export function construirXlsxConMacros(): Buffer {
  return construirXlsxSintetico(
    [
      ['Fecha', 'Descripción operación', 'Nro. operación', 'Monto', 'Saldo'],
      ['01/03/2026', 'TEST', 'OP-1', 100, 100],
    ],
    { incluirVba: true }
  );
}

export function construirXlsxConXxe(): Buffer {
  return construirXlsxSintetico(
    [
      ['Fecha', 'Descripción operación', 'Nro. operación', 'Monto', 'Saldo'],
      ['01/03/2026', 'TEST', 'OP-1', 100, 100],
    ],
    { xmlDoctypeXxe: true }
  );
}

export function construirPdfConJavaScript(): Buffer {
  return Buffer.from(
    '%PDF-1.4\n' +
      '1 0 obj << /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert("xss")) >> >> endobj\n' +
      '%%EOF\n',
    'latin1'
  );
}

export function construirPdfSinTextoExtraible(): Buffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setDrawColor(0);
  doc.rect(20, 20, 200, 80);
  return Buffer.from(doc.output('arraybuffer'));
}

export function construirCsvFalsoConFirmaZip(): Buffer {
  return construirExtractoBcpXlsx();
}

export function construirCsvConBytesNul(): Buffer {
  return Buffer.from('Fecha,Descripción operación,Nro. operación,Monto,Saldo\n01/03/2026,TEST\x00BIN,OP-1,10.00,10.00\n', 'utf8');
}

export const CELDAS_FORMULA_INJECTION = [
  '=CMD|"/C calc"!A0',
  '+SUM(A1:A2)',
  '-2+3*cmd',
  '@SUM(1+1)',
  '  =HYPERLINK("http://ejemplo.invalid")',
] as const;

export function construirExtractoSaldoIncoherenteCsv(): string {
  return [
    'Fecha,Descripción operación,Nro. operación,Monto,Saldo',
    '02/03/2026,ABONO INICIAL,OP-1,1000.00,1000.00',
    '03/03/2026,CARGO INCOHERENTE,OP-2,-200.00,950.00',
  ].join('\r\n');
}

export function construirExtractoMontoVacioCsv(): string {
  return [
    'Fecha,Descripción operación,Nro. operación,Monto,Saldo',
    '02/03/2026,ABONO VALIDO,OP-1,500.00,500.00',
    '03/03/2026,FILA MONTO INVALIDO,OP-2,ABC,500.00',
  ].join('\r\n');
}

export function construirExtractoFechaFueraPeriodoCsv(): string {
  return [
    'Fecha,Descripción operación,Nro. operación,Monto,Saldo',
    '02/03/2026,ABONO MARZO,OP-1,500.00,500.00',
    '05/04/2026,MOVIMIENTO ABRIL FUERA DE MARZO,OP-2,-100.00,400.00',
  ].join('\r\n');
}

export function construirExtractoMes2ContinuidadRotaCsv(): string {
  // Mes 1 (2026-03) cierra en 2474.90; Mes 2 (2026-04) inicia con saldoInicial 3000.00 (cuadra internamente, pero rompe continuidad)
  return [
    'Fecha,Descripción operación,Nro. operación,Monto,Saldo',
    '02/04/2026,ABONO MES 2,OP-4001,500.00,3500.00',
    '04/04/2026,CARGO ITF MES 2,ITF-4001,-0.05,3499.95',
  ].join('\r\n');
}

export const CASOS_CLASIFICADOR_12_TIPOS = [
  {
    descripcion: 'IMPUESTO TRANSACCIONES FINANCIERAS ITF',
    referencia: 'ITF-01',
    monto: '-0.05',
    esperado: 'ITF',
  },
  {
    descripcion: 'COMISION POR ENVIO ESTADO DE CUENTA',
    referencia: 'COM-01',
    monto: '-12.00',
    esperado: 'COMISION_BANCARIA',
  },
  {
    descripcion: 'MANTENIMIENTO DE CUENTA CORRIENTE MN',
    referencia: 'MNT-01',
    monto: '-30.00',
    esperado: 'MANTENIMIENTO',
  },
  {
    descripcion: 'INTERES POR SOBREGIRO EN CUENTA',
    referencia: 'INT-01',
    monto: '-45.20',
    esperado: 'INTERES_GASTO',
  },
  {
    descripcion: 'ABONO INTERES GANADO DEL PERIODO',
    referencia: 'INT-02',
    monto: '19.85',
    esperado: 'INTERES_INGRESO',
  },
  {
    descripcion: 'PAGO DETRACCION SPOT RUC 20991112223',
    referencia: 'DET-01',
    monto: '-240.00',
    esperado: 'DETRACCION',
  },
  {
    descripcion: 'PAGO TRIBUTO SUNAT NPS 11223344',
    referencia: 'TRIB-01',
    monto: '-1500.00',
    esperado: 'TRIBUTO_SUNAT',
  },
  {
    descripcion: 'PAGO PLANILLA AFP PRIMA PERIODO 03/2026',
    referencia: 'AFP-01',
    monto: '-680.00',
    esperado: 'AFP_ONP_ESSALUD',
  },
  {
    descripcion: 'PAGO DE PLANILLA HABERES QUINCENA',
    referencia: 'PLN-01',
    monto: '-4200.00',
    esperado: 'PLANILLA',
  },
  {
    descripcion: 'PAGO CHEQUE GIRADO CHQ-000555',
    referencia: 'CHQ-000555',
    monto: '-950.00',
    esperado: 'CHEQUE',
  },
  {
    descripcion: 'TRANSFERENCIA PROVEEDOR: SERVICIOS NORTE SAC RUC 20997778881 F001-00008888',
    referencia: 'OP-8888',
    monto: '-1250.00',
    esperado: 'TRANSFERENCIA',
  },
  {
    descripcion: 'CARGO OPERATIVO VARIOS DE VENTANILLA',
    referencia: 'VAR-01',
    monto: '-15.00',
    esperado: 'OTRO',
  },
] as const;
