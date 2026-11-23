import crypto from 'crypto';
import AdmZip from 'adm-zip';
import { ComprobantePropuestaSire } from './sunatGateway';

export type CodigoAnexoSire =
  | 'RVIE_ANEXO_2'
  | 'RVIE_ANEXO_3'
  | 'RVIE_ANEXO_4'
  | 'RVIE_ANEXO_5'
  | 'RCE_ANEXO_8_CP'
  | 'RCE_ANEXO_8_INEX'
  | 'RCE_ANEXO_9'
  | 'RCE_ANEXO_10'
  | 'RCE_ANEXO_11'
  | 'RCE_ANEXO_12_1'
  | 'RCE_ANEXO_12_2'
  | 'RCE_ANEXO_13_1'
  | 'RCE_ANEXO_13_2';

export type TipoLayoutSireValidacion =
  | CodigoAnexoSire
  | 'RCE_REEMPLAZO'
  | 'RVIE_REEMPLAZO'
  | 'RCE_AJUSTE'
  | 'RVIE_AJUSTE';

export interface LayoutSireValidacionResult {
  esValido: boolean;
  totalFilas: number;
  totalErrores: number;
  errores: {
    linea: number;
    columna: number;
    nombreCampo: string;
    valor: string;
    mensaje: string;
  }[];
}

export interface ResultadoArchivoSire {
  anexo: CodigoAnexoSire;
  nombreArchivoTxt: string;
  nombreArchivoZip: string;
  contenidoTxt: string;
  zipBuffer: Buffer;
  hashSha256: string;
  totalCampos: number;
  totalFilas: number;
}

export interface ParametrosNombreArchivoSire {
  rucEmpresa: string;
  periodo: string; // YYYY-MM
  anexo: CodigoAnexoSire;
  indicadorOperaciones?: '0' | '1' | '2';
  tieneContenido?: boolean;
  moneda?: 'PEN' | 'USD' | 'MIXTO';
  oportunidadOverride?: '01' | '02' | '03' | '04' | '05';
  correlativo?: string;
  sinMovimiento?: boolean;
}

export interface EspecificacionAnexoSire {
  anexo: CodigoAnexoSire;
  registro: 'RVIE' | 'RCE' | 'RCE_NO_DOMICILIADO';
  libro: '140400' | '080400' | '080500' | 'COMPLEMENTO';
  oportunidadPorDefecto: '01' | '02' | '03' | '04' | '05';
  usaCorrelativoNN: boolean;
  esArchivoGuionado: boolean;
  totalCampos: number;
  titulo: string;
  norma: string;
  exigeCarOriginal: boolean;
  idxFechaEmision?: number;
  indicesCar?: number[];
}

export const ESPECIFICACIONES_ANEXOS_SIRE: Record<CodigoAnexoSire, EspecificacionAnexoSire> = {
  RVIE_ANEXO_2: {
    anexo: 'RVIE_ANEXO_2',
    registro: 'RVIE',
    libro: '140400',
    oportunidadPorDefecto: '01',
    usaCorrelativoNN: false,
    esArchivoGuionado: false,
    totalCampos: 34,
    titulo: 'Anexo 2 — Complemento de Propuesta RVIE (Ventas)',
    norma: 'R.S. N° 000112-2021/SUNAT',
    exigeCarOriginal: false,
    idxFechaEmision: 4,
  },
  RVIE_ANEXO_3: {
    anexo: 'RVIE_ANEXO_3',
    registro: 'RVIE',
    libro: '140400',
    oportunidadPorDefecto: '02',
    usaCorrelativoNN: false,
    esArchivoGuionado: false,
    totalCampos: 34,
    titulo: 'Anexo 3 — Comparación / Reemplazo de Propuesta RVIE (Ventas)',
    norma: 'R.S. N° 000112-2021/SUNAT',
    exigeCarOriginal: false,
    idxFechaEmision: 4,
  },
  RVIE_ANEXO_4: {
    anexo: 'RVIE_ANEXO_4',
    registro: 'RVIE',
    libro: '140400',
    oportunidadPorDefecto: '03',
    usaCorrelativoNN: true,
    esArchivoGuionado: false,
    totalCampos: 35,
    titulo: 'Anexo 4 — Ajustes Posteriores RVIE (Períodos SIRE)',
    norma: 'R.S. N° 000112-2021/SUNAT',
    exigeCarOriginal: true,
    idxFechaEmision: 4,
    indicesCar: [34],
  },
  RVIE_ANEXO_5: {
    anexo: 'RVIE_ANEXO_5',
    registro: 'RVIE',
    libro: '140400',
    oportunidadPorDefecto: '04',
    usaCorrelativoNN: true,
    esArchivoGuionado: false,
    totalCampos: 35,
    titulo: 'Anexo 5 — Ajustes Posteriores RVIE (Períodos previos PLE / Portal)',
    norma: 'R.S. N° 000112-2021/SUNAT',
    exigeCarOriginal: false,
    idxFechaEmision: 4,
  },
  RCE_ANEXO_8_CP: {
    anexo: 'RCE_ANEXO_8_CP',
    registro: 'RCE',
    libro: '080400',
    oportunidadPorDefecto: '01',
    usaCorrelativoNN: true,
    esArchivoGuionado: true,
    totalCampos: 41,
    titulo: 'Anexo 8 — Complemento de Propuesta RCE (Comprobantes CP)',
    norma: 'R.S. N° 000040-2022/SUNAT',
    exigeCarOriginal: false,
    idxFechaEmision: 4,
  },
  RCE_ANEXO_8_INEX: {
    anexo: 'RCE_ANEXO_8_INEX',
    registro: 'RCE',
    libro: '080400',
    oportunidadPorDefecto: '01',
    usaCorrelativoNN: true,
    esArchivoGuionado: true,
    totalCampos: 3,
    titulo: 'Anexo 8 — Inclusión / Exclusión de Comprobantes RCE (RCEINEX)',
    norma: 'R.S. N° 000040-2022/SUNAT',
    exigeCarOriginal: true,
    indicesCar: [1],
  },
  RCE_ANEXO_9: {
    anexo: 'RCE_ANEXO_9',
    registro: 'RCE_NO_DOMICILIADO',
    libro: '080500',
    oportunidadPorDefecto: '02',
    usaCorrelativoNN: false,
    esArchivoGuionado: false,
    totalCampos: 35,
    titulo: 'Anexo 9 — Operaciones con Sujetos No Domiciliados (080500)',
    norma: 'R.S. N° 000040-2022/SUNAT',
    exigeCarOriginal: false,
    idxFechaEmision: 2,
  },
  RCE_ANEXO_10: {
    anexo: 'RCE_ANEXO_10',
    registro: 'RCE',
    libro: '080400',
    oportunidadPorDefecto: '01',
    usaCorrelativoNN: true,
    esArchivoGuionado: true,
    totalCampos: 5,
    titulo: 'Anexo 10 — Carga Masiva de Tipo de Cambio RCE (RCETCA)',
    norma: 'R.S. N° 000040-2022/SUNAT',
    exigeCarOriginal: true,
    idxFechaEmision: 1,
    indicesCar: [4],
  },
  RCE_ANEXO_11: {
    anexo: 'RCE_ANEXO_11',
    registro: 'RCE',
    libro: '080400',
    oportunidadPorDefecto: '02',
    usaCorrelativoNN: false,
    esArchivoGuionado: false,
    totalCampos: 41,
    titulo: 'Anexo 11 — Reemplazo de Propuesta RCE Domiciliados (080400)',
    norma: 'R.S. N° 000040-2022/SUNAT',
    exigeCarOriginal: false,
    idxFechaEmision: 4,
  },
  RCE_ANEXO_12_1: {
    anexo: 'RCE_ANEXO_12_1',
    registro: 'RCE',
    libro: '080400',
    oportunidadPorDefecto: '03',
    usaCorrelativoNN: true,
    esArchivoGuionado: false,
    totalCampos: 41,
    titulo: 'Anexo 12.1 — Ajustes Posteriores RCE Domiciliados (Períodos SIRE)',
    norma: 'R.S. N° 000040-2022/SUNAT',
    exigeCarOriginal: true,
    idxFechaEmision: 4,
    indicesCar: [36],
  },
  RCE_ANEXO_12_2: {
    anexo: 'RCE_ANEXO_12_2',
    registro: 'RCE_NO_DOMICILIADO',
    libro: '080500',
    oportunidadPorDefecto: '03',
    usaCorrelativoNN: true,
    esArchivoGuionado: false,
    totalCampos: 35,
    titulo: 'Anexo 12.2 — Ajustes Posteriores RCE No Domiciliados (Períodos SIRE)',
    norma: 'R.S. N° 000040-2022/SUNAT',
    exigeCarOriginal: true,
    idxFechaEmision: 2,
    indicesCar: [34],
  },
  RCE_ANEXO_13_1: {
    anexo: 'RCE_ANEXO_13_1',
    registro: 'RCE',
    libro: '080400',
    oportunidadPorDefecto: '04',
    usaCorrelativoNN: true,
    esArchivoGuionado: false,
    totalCampos: 41,
    titulo: 'Anexo 13.1 — Ajustes Posteriores RCE Domiciliados (Pre-SIRE PLE / Portal)',
    norma: 'R.S. N° 000040-2022/SUNAT',
    exigeCarOriginal: false,
    idxFechaEmision: 4,
  },
  RCE_ANEXO_13_2: {
    anexo: 'RCE_ANEXO_13_2',
    registro: 'RCE_NO_DOMICILIADO',
    libro: '080500',
    oportunidadPorDefecto: '04',
    usaCorrelativoNN: true,
    esArchivoGuionado: false,
    totalCampos: 35,
    titulo: 'Anexo 13.2 — Ajustes Posteriores RCE No Domiciliados (Pre-SIRE PLE / Portal)',
    norma: 'R.S. N° 000040-2022/SUNAT',
    exigeCarOriginal: false,
    idxFechaEmision: 2,
  },
};

export const CATALOGO_PAISES_SIRE = [
  { codigo: '9249', nombre: 'ESTADOS UNIDOS DE AMÉRICA' },
  { codigo: '9245', nombre: 'ESPAÑA' },
  { codigo: '9169', nombre: 'COLOMBIA' },
  { codigo: '9158', nombre: 'CHILE' },
  { codigo: '9493', nombre: 'MÉXICO' },
  { codigo: '9105', nombre: 'BRASIL' },
  { codigo: '9063', nombre: 'ARGENTINA' },
  { codigo: '9149', nombre: 'CANADÁ' },
  { codigo: '9628', nombre: 'REINO UNIDO' },
  { codigo: '9215', nombre: 'CHINA' },
  { codigo: '9364', nombre: 'IRLANDA' },
  { codigo: '9767', nombre: 'SUIZA' },
  { codigo: '9679', nombre: 'SINGAPUR' },
  { codigo: '9586', nombre: 'PANAMÁ' },
];

export const CATALOGO_CONVENIOS_SIRE = [
  { codigo: '00', nombre: '00 - Ninguno' },
  { codigo: '01', nombre: '01 - Canadá' },
  { codigo: '02', nombre: '02 - Chile' },
  { codigo: '03', nombre: '03 - Comunidad Andina (CAN)' },
  { codigo: '04', nombre: '04 - Brasil' },
  { codigo: '05', nombre: '05 - México' },
  { codigo: '06', nombre: '06 - Corea del Sur' },
  { codigo: '07', nombre: '07 - Suiza' },
  { codigo: '08', nombre: '08 - Portugal' },
  { codigo: '09', nombre: '09 - Japón' },
];

export const CATALOGO_VINCULOS_SIRE = [
  { codigo: '00', nombre: '00 - Sin vinculación económica' },
  { codigo: '01', nombre: '01 - Participación directa > 30% capital' },
  { codigo: '02', nombre: '02 - Participación indirecta > 30% capital' },
  { codigo: '03', nombre: '03 - Decisiones gerenciales comunes' },
  { codigo: '09', nombre: '09 - Otros supuestos Art. 24 Reglamento LIR' },
];

export const CATALOGO_TIPOS_RENTA_SIRE = [
  { codigo: '00', nombre: '00 - Otros servicios / Bienes no afectos a retención IR' },
  { codigo: '01', nombre: '01 - Arrendamiento de predios' },
  { codigo: '04', nombre: '04 - Regalías / Licencias de software' },
  { codigo: '16', nombre: '16 - Asistencia técnica (Tasa 15%)' },
  { codigo: '17', nombre: '17 - Servicios digitales (Tasa 30%)' },
  { codigo: '18', nombre: '18 - Actividades independientes / Consultoría (Tasa 30%)' },
  { codigo: '26', nombre: '26 - Dividendos (Tasa 5%)' },
  { codigo: '34', nombre: '34 - Enajenación de bienes / Operaciones mixtas' },
];

export const CATALOGO_MODALIDAD_SERVICIO_SIRE = [
  { codigo: '', nombre: 'No aplica' },
  { codigo: '1', nombre: '1 - Servicio prestado íntegramente en el Perú' },
  { codigo: '2', nombre: '2 - Servicio prestado parte en Perú y parte en extranjero' },
  { codigo: '3', nombre: '3 - Servicio prestado íntegramente en el extranjero' },
];

export const CATALOGO_CLASIFICACION_BIENES_SIRE = [
  { codigo: '1', nombre: '1 - Mercadería, materia prima, suministro, envases y embalajes' },
  { codigo: '2', nombre: '2 - Activo fijo' },
  { codigo: '3', nombre: '3 - Otros activos no considerados en 1 y 2' },
  { codigo: '4', nombre: '4 - Gastos de educación, recreación, salud, culturales, representación, capacitación, viaje, mantenimiento vehículo, premios' },
  { codigo: '5', nombre: '5 - Otros gastos no incluidos en 4' },
];

/**
 * Sanitiza valores de texto para archivos planos SIRE / PLE:
 * Reemplaza pipes '|', saltos de línea y tabuladores para no quebrar el número de campos.
 */
export function sanitizarCampoPlano(valor: any): string {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/\|/g, '-')
    .replace(/\r?\n/g, ' ')
    .replace(/\t/g, ' ')
    .trim();
}

export function formatearFechaDDMMYYYY(valor?: string): string {
  if (!valor) return '';
  const limpio = String(valor).trim().slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(limpio)) return limpio;
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpio)) {
    const [a, m, d] = limpio.split('-');
    return `${d}/${m}/${a}`;
  }
  return limpio;
}

export function formatearPeriodoAAAAMM(periodo?: string): string {
  const digits = String(periodo || '').replace(/\D/g, '');
  return digits.slice(0, 6);
}

/**
 * Genera el Código de Anotación de Registro (CAR) oficial de 27 caracteres:
 * RUC (11) + Tipo comprobante (2) + Serie (4) + Número (10)
 */
export function generarCarOficial(ruc: string, tipoCmp: string, serie: string, numero: string): string {
  const rucFmt = sanitizarCampoPlano(ruc).replace(/\D/g, '').padEnd(11, '0').substring(0, 11);
  const tipoFmt = sanitizarCampoPlano(tipoCmp).padStart(2, '0').substring(0, 2);
  const serieFmt = sanitizarCampoPlano(serie).toUpperCase().padEnd(4, '0').substring(0, 4);
  const numDigits = sanitizarCampoPlano(numero).replace(/\D/g, '');
  const numFmt = (numDigits || '1').padStart(10, '0').substring(0, 10);
  return `${rucFmt}${tipoFmt}${serieFmt}${numFmt}`;
}

function normalizarCorrelativo(correlativo?: string): string {
  const digits = String(correlativo || '01').replace(/\D/g, '');
  return (digits || '1').padStart(2, '0').slice(-2);
}

function normalizarRuc(rucEmpresa: string): string {
  return sanitizarCampoPlano(rucEmpresa).replace(/\D/g, '').padEnd(11, '0').slice(0, 11);
}

export function construirNombreArchivoSire(params: ParametrosNombreArchivoSire): {
  nombreArchivoTxt: string;
  nombreArchivoZip: string;
} {
  const ruc = normalizarRuc(params.rucEmpresa);
  const per = formatearPeriodoAAAAMM(params.periodo);
  const spec = ESPECIFICACIONES_ANEXOS_SIRE[params.anexo];
  const corr = normalizarCorrelativo(params.correlativo);

  if (params.anexo === 'RCE_ANEXO_8_CP') {
    const base = `${ruc}-CP-${per}-${corr}`;
    return { nombreArchivoTxt: `${base}.txt`, nombreArchivoZip: `${base}.zip` };
  }
  if (params.anexo === 'RCE_ANEXO_8_INEX') {
    const base = `${ruc}-RCEINEX-${per}-${corr}`;
    return { nombreArchivoTxt: `${base}.txt`, nombreArchivoZip: `${base}.zip` };
  }
  if (params.anexo === 'RCE_ANEXO_10') {
    const base = `${ruc}-RCETCA-${per}-${corr}`;
    return { nombreArchivoTxt: `${base}.txt`, nombreArchivoZip: `${base}.zip` };
  }

  const op = params.indicadorOperaciones || '1';
  const contenido = params.sinMovimiento || params.tieneContenido === false ? '0' : '1';
  const moneda = params.moneda === 'USD' || params.moneda === 'MIXTO' ? '2' : '1';
  const oportunidad =
    spec.oportunidadPorDefecto === '04' && params.oportunidadOverride === '05'
      ? '05'
      : spec.oportunidadPorDefecto === '04'
        ? '04'
        : spec.oportunidadPorDefecto;
  const sufijoNN = spec.usaCorrelativoNN ? corr : '';
  const base = `LE${ruc}${per}00${spec.libro}${oportunidad}${op}${contenido}${moneda}2${sufijoNN}`;

  return {
    nombreArchivoTxt: `${base}.txt`,
    nombreArchivoZip: `${base}.zip`,
  };
}

function empacarResultadoSire(
  anexo: CodigoAnexoSire,
  nombre: { nombreArchivoTxt: string; nombreArchivoZip: string },
  lineas: string[],
  totalCampos: number
): ResultadoArchivoSire {
  const contenidoTxt = lineas.length > 0 ? `${lineas.join('\r\n')}\r\n` : '';
  const hashSha256 = crypto.createHash('sha256').update(contenidoTxt, 'utf8').digest('hex');

  const zip = new AdmZip();
  zip.addFile(nombre.nombreArchivoTxt, Buffer.from(contenidoTxt, 'utf8'));
  const zipBuffer = zip.toBuffer();

  return {
    anexo,
    nombreArchivoTxt: nombre.nombreArchivoTxt,
    nombreArchivoZip: nombre.nombreArchivoZip,
    contenidoTxt,
    zipBuffer,
    hashSha256,
    totalCampos,
    totalFilas: lineas.length,
  };
}

function detectarMonedaMixta(items: any[], monedaExplicita?: 'PEN' | 'USD' | 'MIXTO'): 'PEN' | 'USD' | 'MIXTO' {
  if (monedaExplicita) return monedaExplicita;
  return items.some(i => String(i.moneda || 'PEN').toUpperCase() !== 'PEN') ? 'USD' : 'PEN';
}

function formatearTc(moneda: string, tcValor: any): string {
  if (String(moneda || 'PEN').toUpperCase() === 'PEN') return '';
  const tc = Number(tcValor || 1);
  return tc > 0 ? tc.toFixed(3) : '1.000';
}

function construirFilaRvieBase(
  rucEmpresa: string,
  periodoDefault: string,
  v: any,
  opts: { incluirCarModificar?: boolean; periodoFila?: string } = {}
): string {
  const esAnulado = v.estado === 'ANULADO' || v.estadoSunat === 'ANULADO';
  const periodoFila = formatearPeriodoAAAAMM(opts.periodoFila || v.periodoAfectado || periodoDefault);
  const moneda = String(v.moneda || 'PEN').toUpperCase();
  const baseVal = esAnulado ? 0 : Number(v.baseGravada ?? v.base ?? 0);
  const descBaseVal = esAnulado ? 0 : Number(v.descuentoBase ?? 0);
  const igvVal = esAnulado ? 0 : Number(v.igv ?? 0);
  const descIgvVal = esAnulado ? 0 : Number(v.descuentoIgv ?? 0);
  const exportVal = esAnulado ? 0 : Number(v.exportacion ?? v.valorExportacion ?? 0);
  const exoneradoVal = esAnulado ? 0 : Number(v.exonerado ?? 0);
  const inafectoVal = esAnulado ? 0 : Number(v.inafecto ?? v.baseNoGravada ?? 0);
  const iscVal = esAnulado ? 0 : Number(v.isc ?? 0);
  const baseIvapVal = esAnulado ? 0 : Number(v.baseIvap ?? 0);
  const ivapVal = esAnulado ? 0 : Number(v.ivap ?? 0);
  const icbperVal = esAnulado ? 0 : Number(v.icbper ?? 0);
  const otrosVal = esAnulado ? 0 : Number(v.otrosTributos ?? 0);
  const totalVal = esAnulado
    ? 0
    : Number(v.total ?? baseVal - descBaseVal + igvVal - descIgvVal + exportVal + exoneradoVal + inafectoVal + iscVal + baseIvapVal + ivapVal + icbperVal + otrosVal);

  const cliDoc = sanitizarCampoPlano(v.clienteRuc || v.rucReceptor || v.numDocCliente || '');
  const tipoDocCli = sanitizarCampoPlano(
    v.tipoDocCliente || (cliDoc.length === 11 ? '6' : cliDoc.length === 8 ? '1' : cliDoc ? '4' : '0')
  );
  const nomCli = sanitizarCampoPlano(v.clienteNombre || v.razonSocialReceptor || v.razonSocialCliente || 'CLIENTES VARIOS');
  const car = sanitizarCampoPlano(v.car || generarCarOficial(rucEmpresa, v.tipoComprobante || '01', v.serie || 'F001', v.numero || '1'));

  const campos = [
    normalizarRuc(rucEmpresa), // 1. RUC Emisor
    sanitizarCampoPlano(v.razonSocialEmpresa || v.razonSocialEmisor || 'EMPRESA CONTRIBUYENTE S.A.C.'), // 2. Razón social
    periodoFila, // 3. Periodo AAAAMM
    car, // 4. CAR SUNAT
    formatearFechaDDMMYYYY(v.fechaEmision), // 5. Fecha emisión
    formatearFechaDDMMYYYY(v.fechaVencimiento), // 6. Fecha vencimiento
    sanitizarCampoPlano(v.tipoComprobante || '01'), // 7. Tipo CP
    sanitizarCampoPlano(v.serie || 'F001'), // 8. Serie
    sanitizarCampoPlano(v.numero || '00000001'), // 9. Número
    sanitizarCampoPlano(v.numeroFinal || ''), // 10. Número final rango
    tipoDocCli, // 11. Tipo doc cliente
    cliDoc, // 12. Número doc cliente
    nomCli, // 13. Razón social cliente
    exportVal.toFixed(2), // 14. Exportación
    baseVal.toFixed(2), // 15. Base gravada
    descBaseVal.toFixed(2), // 16. Descuento base
    igvVal.toFixed(2), // 17. IGV
    descIgvVal.toFixed(2), // 18. Descuento IGV
    exoneradoVal.toFixed(2), // 19. Exonerado
    inafectoVal.toFixed(2), // 20. Inafecto
    iscVal.toFixed(2), // 21. ISC
    baseIvapVal.toFixed(2), // 22. Base IVAP
    ivapVal.toFixed(2), // 23. IVAP
    icbperVal.toFixed(2), // 24. ICBPER
    otrosVal.toFixed(2), // 25. Otros tributos
    totalVal.toFixed(2), // 26. Total
    moneda, // 27. Moneda
    formatearTc(moneda, v.tipoCambio), // 28. Tipo de cambio
    formatearFechaDDMMYYYY(v.fechaDocModificado), // 29. Fecha modificado
    sanitizarCampoPlano(v.tipoDocModificado || ''), // 30. Tipo modificado
    sanitizarCampoPlano(v.serieDocModificado || ''), // 31. Serie modificado
    sanitizarCampoPlano(v.numeroDocModificado || ''), // 32. Número modificado
    sanitizarCampoPlano(v.identificadorProyecto || v.idProyecto || ''), // 33. Proyecto
    sanitizarCampoPlano(v.tipoNotaCredito || v.tipoNota || ''), // 34. Tipo nota
  ];

  if (opts.incluirCarModificar) {
    campos.push(sanitizarCampoPlano(v.carCpModificar || v.carOriginal || '')); // 35. CAR CP a modificar
  }

  return `${campos.join('|')}|`;
}

function construirFilaRceBase(
  rucEmpresa: string,
  periodoDefault: string,
  c: any,
  opts: { carModificarOverride?: string; periodoFila?: string; mantenerCar?: boolean } = {}
): string {
  const periodoFila = formatearPeriodoAAAAMM(opts.periodoFila || c.periodoAfectado || periodoDefault);
  const moneda = String(c.moneda || 'PEN').toUpperCase();
  const tipoAdq = String(c.tipoAdquisicion || '1');
  const baseVal = Number(c.baseGravada ?? c.base ?? 0);
  const igvVal = Number(c.igv ?? 0);
  const noGravBase = Number(c.baseNoGravada ?? 0) + Number(c.exonerado ?? 0);
  const iscVal = Number(c.isc ?? 0);
  const icbperVal = Number(c.icbper ?? 0);
  const otrosVal = Number(c.otrosTributos ?? 0);

  let biDg = 0;
  let igvDg = 0;
  let biDgng = 0;
  let igvDgng = 0;
  let biDng = 0;
  let igvDng = 0;
  let valNoGrav = noGravBase;

  if (tipoAdq === '2') {
    biDgng = baseVal;
    igvDgng = igvVal;
  } else if (tipoAdq === '3') {
    biDng = baseVal;
    igvDng = igvVal;
  } else if (tipoAdq === '4') {
    valNoGrav = noGravBase + baseVal;
  } else {
    biDg = baseVal;
    igvDg = igvVal;
  }

  const totalVal = Number(c.total ?? biDg + igvDg + biDgng + igvDgng + biDng + igvDng + valNoGrav + iscVal + icbperVal + otrosVal);
  const rucPrv = sanitizarCampoPlano(c.proveedorRuc || c.rucEmisor || c.numDocProveedor || '');
  const nomPrv = sanitizarCampoPlano(c.proveedorNombre || c.razonSocialEmisor || c.razonSocialProveedor || 'PROVEEDOR S.A.C.');
  const tipoDocPrv = sanitizarCampoPlano(c.tipoDocProveedor || (rucPrv.length === 11 ? '6' : rucPrv.length === 8 ? '1' : '0'));
  const car = opts.mantenerCar === false ? '' : sanitizarCampoPlano(c.car || generarCarOficial(rucPrv || rucEmpresa, c.tipoComprobante || '01', c.serie || 'F001', c.numero || '1'));
  const carModificar = sanitizarCampoPlano(opts.carModificarOverride ?? c.carCpModificar ?? c.carOriginal ?? '');

  // Estructura oficial Anexo 11 / Anexo 8 CP / Anexo 12.1 / Anexo 13.1 — 41 campos exactos
  const campos = [
    normalizarRuc(rucEmpresa), // 1. RUC Generador
    sanitizarCampoPlano(c.razonSocialEmpresa || c.razonSocialUsuario || 'EMPRESA CONTRIBUYENTE S.A.C.'), // 2. Razón social
    periodoFila, // 3. Periodo AAAAMM
    car, // 4. CAR SUNAT
    formatearFechaDDMMYYYY(c.fechaEmision), // 5. Fecha emisión
    formatearFechaDDMMYYYY(c.fechaVencimiento), // 6. Fecha vencimiento
    sanitizarCampoPlano(c.tipoComprobante || '01'), // 7. Tipo comprobante
    sanitizarCampoPlano(c.serie || ''), // 8. Serie
    sanitizarCampoPlano(c.anioDua || ''), // 9. Año DUA/DSI
    sanitizarCampoPlano(c.numero || '00000001'), // 10. Número
    sanitizarCampoPlano(c.numeroFinal || ''), // 11. Número final
    tipoDocPrv, // 12. Tipo doc proveedor
    rucPrv, // 13. Número doc proveedor
    nomPrv, // 14. Razón social proveedor
    biDg.toFixed(2), // 15. BI Gravada DG
    igvDg.toFixed(2), // 16. IGV DG
    biDgng.toFixed(2), // 17. BI Gravada DGNG
    igvDgng.toFixed(2), // 18. IGV DGNG
    biDng.toFixed(2), // 19. BI Gravada DNG
    igvDng.toFixed(2), // 20. IGV DNG
    valNoGrav.toFixed(2), // 21. Valor adquisiciones no gravadas
    iscVal.toFixed(2), // 22. ISC
    icbperVal.toFixed(2), // 23. ICBPER
    otrosVal.toFixed(2), // 24. Otros tributos
    totalVal.toFixed(2), // 25. Importe total
    moneda, // 26. Moneda
    formatearTc(moneda, c.tipoCambio), // 27. Tipo de cambio
    formatearFechaDDMMYYYY(c.fechaDocModificado), // 28. Fecha doc modificado
    sanitizarCampoPlano(c.tipoDocModificado || ''), // 29. Tipo doc modificado
    sanitizarCampoPlano(c.serieDocModificado || ''), // 30. Serie doc modificado
    sanitizarCampoPlano(c.codigoDuaModificado || ''), // 31. Código DUA doc modificado
    sanitizarCampoPlano(c.numeroDocModificado || ''), // 32. Número doc modificado
    sanitizarCampoPlano(c.clasificacionBienes || ''), // 33. Clasificación bienes/servicios
    sanitizarCampoPlano(c.idProyecto || c.contratoProyecto || ''), // 34. ID Contrato/Proyecto
    c.porcPart !== undefined && c.porcPart !== '' ? String(c.porcPart) : '', // 35. PorcPart
    c.imb !== undefined && c.imb !== '' ? Number(c.imb).toFixed(2) : '', // 36. IMB Ley 31053
    carModificar, // 37. CAR CP a modificar
    c.tieneDetraccion ? '1' : '', // 38. Marca detracción
    sanitizarCampoPlano(c.tipoNota || ''), // 39. Tipo nota
    sanitizarCampoPlano(c.estadoComp || (c.estado === 'ANULADO' ? '2' : '1')), // 40. Estado comprobante
    sanitizarCampoPlano(c.incal || ''), // 41. Incal
  ];

  return `${campos.join('|')}|`;
}

function construirFilaNoDomiciliado(
  periodoDefault: string,
  n: any,
  opts: { carModificarOverride?: string; periodoFila?: string } = {}
): string {
  const periodoFila = formatearPeriodoAAAAMM(opts.periodoFila || n.periodoAfectado || n.periodo || periodoDefault);
  const moneda = String(n.moneda || 'USD').toUpperCase();
  const valAdq = Number(n.valorAdquisiciones ?? 0);
  const otros = Number(n.otrosConceptos ?? 0);
  const impTotal = Number(n.importeTotal ?? valAdq + otros);
  const retIgv = Number(n.retencionIgv ?? 0);
  const rentaBruta = Number(n.rentaBruta ?? valAdq);
  const deduccion = Number(n.deduccionCosto ?? 0);
  const rentaNeta = Number(n.rentaNeta ?? Math.max(0, rentaBruta - deduccion));
  const tasaRet = Number(n.tasaRetencion ?? 0);
  const impRetenido = Number(n.impuestoRetenido ?? (rentaNeta * tasaRet) / 100);
  const carMod = sanitizarCampoPlano(opts.carModificarOverride ?? n.carCpModificar ?? n.carOriginal ?? '');

  // Estructura oficial Anexo 9 / Anexo 12.2 / Anexo 13.2 — 35 campos exactos
  const campos = [
    periodoFila, // 1. Periodo AAAAMM
    sanitizarCampoPlano(n.carSunat || n.car || ''), // 2. CAR SUNAT
    formatearFechaDDMMYYYY(n.fechaEmision), // 3. Fecha emisión
    sanitizarCampoPlano(n.tipoComprobante || '91'), // 4. Tipo CP
    sanitizarCampoPlano(n.serie || ''), // 5. Serie
    sanitizarCampoPlano(n.numero || '00000001'), // 6. Número
    valAdq.toFixed(2), // 7. Valor adquisiciones
    otros.toFixed(2), // 8. Otros conceptos
    impTotal.toFixed(2), // 9. Importe total
    sanitizarCampoPlano(n.tipoDocSustentaCredito || ''), // 10. Tipo doc sustenta crédito
    sanitizarCampoPlano(n.serieDocSustentaCredito || ''), // 11. Serie doc sustenta
    sanitizarCampoPlano(n.anioDua || ''), // 12. Año DUA
    sanitizarCampoPlano(n.numeroDocSustentaCredito || ''), // 13. Número doc sustenta
    retIgv.toFixed(2), // 14. Retención IGV
    moneda, // 15. Moneda
    formatearTc(moneda, n.tipoCambio), // 16. Tipo de cambio
    sanitizarCampoPlano(n.paisResidencia || '9249'), // 17. País residencia
    sanitizarCampoPlano(n.razonSocialNoDomiciliado || ''), // 18. Razón social no domiciliado
    sanitizarCampoPlano(n.domicilioExtranjero || ''), // 19. Domicilio extranjero
    sanitizarCampoPlano(n.numIdFiscal || ''), // 20. ID Fiscal / TIN
    sanitizarCampoPlano(n.numIdBeneficiario || ''), // 21. ID Beneficiario
    sanitizarCampoPlano(n.razonSocialBeneficiario || ''), // 22. Razón social beneficiario
    sanitizarCampoPlano(n.paisBeneficiario || ''), // 23. País beneficiario
    sanitizarCampoPlano(n.vinculoContribuyente || '00'), // 24. Vínculo contribuyente
    rentaBruta.toFixed(2), // 25. Renta bruta
    deduccion.toFixed(2), // 26. Deducción costo
    rentaNeta.toFixed(2), // 27. Renta neta
    tasaRet.toFixed(2), // 28. Tasa retención
    impRetenido.toFixed(2), // 29. Impuesto retenido
    sanitizarCampoPlano(n.convenioDobleImposicion || '00'), // 30. Convenio doble imposición
    sanitizarCampoPlano(n.exoneracionAplicada || ''), // 31. Exoneración aplicada
    sanitizarCampoPlano(n.tipoRenta || '00'), // 32. Tipo renta
    sanitizarCampoPlano(n.modalidadServicio || ''), // 33. Modalidad servicio
    n.aplicaArt76 ? '1' : '', // 34. Aplicación Art. 76 LIR
    carMod, // 35. CAR CP a modificar
  ];

  return `${campos.join('|')}|`;
}

/**
 * Servicio de Layouts Oficiales para SIRE (RVIE Anexos 2-5 y RCE Anexos 8-13):
 * Genera y valida archivos TXT (UTF-8 sin BOM, CRLF) y ZIP conforme a
 * R.S. N° 000112-2021/SUNAT y R.S. N° 000040-2022/SUNAT.
 */
export const sireLayoutService = {
  /**
   * Parsea el contenido TXT de la propuesta SIRE descargada de SUNAT (delimitado por pipes)
   */
  parsearPropuestaSireTxt(contenidoTxt: string, _tipo: 'COMPRAS' | 'VENTAS'): ComprobantePropuestaSire[] {
    const lineas = contenidoTxt.split(/\r?\n/).filter(l => l.trim().length > 0);
    const comprobantes: ComprobantePropuestaSire[] = [];

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      if (linea.startsWith('--') || linea.startsWith('//')) continue;

      const cols = linea.split('|');
      if (cols.length < 15) continue;

      const rucEmisor = cols[0]?.trim() || '';
      const razonSocialEmisor = cols[1]?.trim() || '';
      const tipoComprobante = cols[2]?.trim() || '01';
      const serie = cols[3]?.trim() || 'F001';
      const numero = cols[4]?.trim() || '00000001';
      const fechaEmision = cols[5]?.trim() || '';
      const fechaVencimiento = cols[6]?.trim() || undefined;
      const rucReceptor = cols[8]?.trim() || '';
      const razonSocialReceptor = cols[9]?.trim() || '';
      const baseGravada = parseFloat(cols[10]?.trim() || '0') || 0;
      const igv = parseFloat(cols[11]?.trim() || '0') || 0;
      const total = parseFloat(cols[14]?.trim() || cols[13]?.trim() || '0') || (baseGravada + igv);
      const moneda = (cols[15]?.trim() === 'USD' ? 'USD' : 'PEN') as 'PEN' | 'USD';
      const tipoCambio = parseFloat(cols[16]?.trim() || '1') || 1.0;
      const tieneDetraccion = cols[17]?.trim() === '1' || cols[17]?.trim() === 'S';
      const codigoDetraccion = cols[18]?.trim() || undefined;
      const car = cols[19]?.trim() || generarCarOficial(rucEmisor, tipoComprobante, serie, numero);

      comprobantes.push({
        car,
        tipoComprobante,
        serie,
        numero,
        fechaEmision,
        fechaVencimiento,
        rucEmisor,
        razonSocialEmisor,
        rucReceptor,
        razonSocialReceptor,
        moneda,
        tipoCambio,
        baseGravada: Number(baseGravada.toFixed(2)),
        igv: Number(igv.toFixed(2)),
        total: Number(total.toFixed(2)),
        tieneDetraccion,
        codigoDetraccion,
        clasificacion: 'MERCADERIA'
      });
    }

    return comprobantes;
  },

  /**
   * Genera el contenido TXT simulado de una propuesta para empaquetarla en el ZIP de descarga
   */
  generarPropuestaSireTxt(comprobantes: ComprobantePropuestaSire[]): string {
    const lineas = comprobantes.map(c => {
      const campos = [
        sanitizarCampoPlano(c.rucEmisor),
        sanitizarCampoPlano(c.razonSocialEmisor),
        sanitizarCampoPlano(c.tipoComprobante),
        sanitizarCampoPlano(c.serie),
        sanitizarCampoPlano(c.numero),
        sanitizarCampoPlano(c.fechaEmision),
        sanitizarCampoPlano(c.fechaVencimiento || ''),
        '6',
        sanitizarCampoPlano(c.rucReceptor),
        sanitizarCampoPlano(c.razonSocialReceptor),
        c.baseGravada.toFixed(2),
        c.igv.toFixed(2),
        '0.00',
        '0.00',
        c.total.toFixed(2),
        c.moneda,
        (c.tipoCambio || 1.0).toFixed(3),
        c.tieneDetraccion ? '1' : '0',
        c.codigoDetraccion || '',
        c.car || generarCarOficial(c.rucEmisor, c.tipoComprobante, c.serie, c.numero),
        '1'
      ];
      return `${campos.join('|')}|`;
    });
    return lineas.join('\r\n');
  },

  /**
   * RVIE Anexo 2 — Complemento de Propuesta RVIE (140400, oportunidad 01, 34 campos)
   */
  generarComplementoRvieAnexo2(
    rucEmpresa: string,
    periodo: string,
    comprobantes: any[],
    opts: { sinMovimiento?: boolean; indicadorOperaciones?: '0' | '1' | '2' } = {}
  ): ResultadoArchivoSire {
    const lineas = opts.sinMovimiento ? [] : comprobantes.map(v => construirFilaRvieBase(rucEmpresa, periodo, v));
    const nombre = construirNombreArchivoSire({
      rucEmpresa,
      periodo,
      anexo: 'RVIE_ANEXO_2',
      indicadorOperaciones: opts.indicadorOperaciones,
      tieneContenido: lineas.length > 0,
      moneda: detectarMonedaMixta(comprobantes),
      sinMovimiento: opts.sinMovimiento,
    });
    return empacarResultadoSire('RVIE_ANEXO_2', nombre, lineas, 34);
  },

  /**
   * RVIE Anexo 3 — Reemplazo de Propuesta RVIE (LE...14040002...2.txt, 34 campos)
   */
  generarReemplazoRvie(
    rucEmpresa: string,
    periodo: string,
    comprobantes: any[],
    opts: { sinMovimiento?: boolean; indicadorOperaciones?: '0' | '1' | '2' } = {}
  ): ResultadoArchivoSire {
    const lineas = opts.sinMovimiento ? [] : comprobantes.map(v => construirFilaRvieBase(rucEmpresa, periodo, v));
    const nombre = construirNombreArchivoSire({
      rucEmpresa,
      periodo,
      anexo: 'RVIE_ANEXO_3',
      indicadorOperaciones: opts.indicadorOperaciones,
      tieneContenido: lineas.length > 0,
      moneda: detectarMonedaMixta(comprobantes),
      sinMovimiento: opts.sinMovimiento,
    });
    return empacarResultadoSire('RVIE_ANEXO_3', nombre, lineas, 34);
  },

  /**
   * RVIE Anexo 4 (CC=03, SIRE) / Anexo 5 (CC=04|05, Pre-SIRE PLE/Portal) — Ajustes Posteriores RVIE (35 campos)
   */
  generarAjustesRvie(
    rucEmpresa: string,
    periodoAjuste: string,
    periodoAfectado: string,
    ajustes: any[],
    opts: { esPreSire?: boolean; oportunidad?: '03' | '04' | '05'; correlativo?: string } = {}
  ): ResultadoArchivoSire {
    const oportunidad = opts.oportunidad || (opts.esPreSire ? '04' : '03');
    const anexo: CodigoAnexoSire = oportunidad === '04' || oportunidad === '05' ? 'RVIE_ANEXO_5' : 'RVIE_ANEXO_4';
    const lineas = ajustes.map(a =>
      construirFilaRvieBase(rucEmpresa, periodoAfectado, a, {
        incluirCarModificar: true,
        periodoFila: periodoAfectado,
      })
    );
    const nombre = construirNombreArchivoSire({
      rucEmpresa,
      periodo: periodoAjuste,
      anexo,
      oportunidadOverride: oportunidad,
      correlativo: opts.correlativo,
      tieneContenido: lineas.length > 0,
      moneda: detectarMonedaMixta(ajustes),
    });
    return empacarResultadoSire(anexo, nombre, lineas, 35);
  },

  /**
   * RCE Anexo 8 CP — Complemento de Propuesta RCE ({RUC}-CP-{AAAAMM}-{NN}.txt, 41 campos)
   */
  generarComplementoRceAnexo8(
    rucEmpresa: string,
    periodo: string,
    comprobantes: any[],
    opts: { correlativo?: string } = {}
  ): ResultadoArchivoSire {
    const lineas = comprobantes.map(c => construirFilaRceBase(rucEmpresa, periodo, c, { carModificarOverride: '' }));
    const nombre = construirNombreArchivoSire({
      rucEmpresa,
      periodo,
      anexo: 'RCE_ANEXO_8_CP',
      correlativo: opts.correlativo,
    });
    return empacarResultadoSire('RCE_ANEXO_8_CP', nombre, lineas, 41);
  },

  /**
   * RCE Anexo 8 INEX — Inclusión / Exclusión de Comprobantes ({RUC}-RCEINEX-{AAAAMM}-{NN}.txt, 3 campos)
   */
  generarExclusionInclusionRceAnexo8(
    rucEmpresa: string,
    periodo: string,
    registros: Array<{ carSunat?: string; car?: string; indicador?: '1' | '2'; tipoOperacion?: 'INCLUSION' | 'EXCLUSION' }>,
    opts: { correlativo?: string } = {}
  ): ResultadoArchivoSire {
    const per = formatearPeriodoAAAAMM(periodo);
    const lineas = registros.map(r => {
      const ind = r.indicador || (r.tipoOperacion === 'INCLUSION' ? '1' : '2');
      const car = sanitizarCampoPlano(r.carSunat || r.car || '');
      return `${[per, car, ind].join('|')}|`;
    });
    const nombre = construirNombreArchivoSire({
      rucEmpresa,
      periodo,
      anexo: 'RCE_ANEXO_8_INEX',
      correlativo: opts.correlativo,
    });
    return empacarResultadoSire('RCE_ANEXO_8_INEX', nombre, lineas, 3);
  },

  /**
   * RCE Anexo 9 — Operaciones con Sujetos No Domiciliados (LE...08050002...2.txt, 35 campos)
   */
  generarNoDomiciliadosAnexo9(
    rucEmpresa: string,
    periodo: string,
    registros: any[],
    opts: { sinMovimiento?: boolean; indicadorOperaciones?: '0' | '1' | '2' } = {}
  ): ResultadoArchivoSire {
    const lineas = opts.sinMovimiento
      ? []
      : registros.map(n => construirFilaNoDomiciliado(periodo, n, { carModificarOverride: '' }));
    const nombre = construirNombreArchivoSire({
      rucEmpresa,
      periodo,
      anexo: 'RCE_ANEXO_9',
      indicadorOperaciones: opts.indicadorOperaciones,
      tieneContenido: lineas.length > 0,
      moneda: detectarMonedaMixta(registros),
      sinMovimiento: opts.sinMovimiento,
    });
    return empacarResultadoSire('RCE_ANEXO_9', nombre, lineas, 35);
  },

  /**
   * RCE Anexo 10 — Complemento de Tipo de Cambio ({RUC}-RCETCA-{AAAAMM}-{NN}.txt, 5 campos)
   */
  generarTipoCambioAnexo10(
    rucEmpresa: string,
    periodo: string,
    registros: Array<{ fechaEmision: string; moneda: string; tipoCambio: number; carSunat?: string; car?: string }>,
    opts: { correlativo?: string } = {}
  ): ResultadoArchivoSire {
    const per = formatearPeriodoAAAAMM(periodo);
    const lineas = registros.map(r => {
      const campos = [
        per, // 1. Periodo AAAAMM
        formatearFechaDDMMYYYY(r.fechaEmision), // 2. Fecha emisión DD/MM/AAAA
        sanitizarCampoPlano((r.moneda || 'USD').toUpperCase()), // 3. Moneda
        Number(r.tipoCambio || 1).toFixed(3), // 4. Tipo de cambio
        sanitizarCampoPlano(r.carSunat || r.car || ''), // 5. CAR SUNAT (27 dígitos)
      ];
      return `${campos.join('|')}|`;
    });
    const nombre = construirNombreArchivoSire({
      rucEmpresa,
      periodo,
      anexo: 'RCE_ANEXO_10',
      correlativo: opts.correlativo,
    });
    return empacarResultadoSire('RCE_ANEXO_10', nombre, lineas, 5);
  },

  /**
   * RCE Anexo 11 — Reemplazo de Propuesta RCE Domiciliados (LE...08040002...2.txt, 41 campos)
   */
  generarReemplazoRce(
    rucEmpresa: string,
    periodo: string,
    comprobantes: any[],
    opts: { sinMovimiento?: boolean; indicadorOperaciones?: '0' | '1' | '2' } = {}
  ): ResultadoArchivoSire {
    const lineas = opts.sinMovimiento
      ? []
      : comprobantes.map(c => construirFilaRceBase(rucEmpresa, periodo, c, { carModificarOverride: '' }));
    const nombre = construirNombreArchivoSire({
      rucEmpresa,
      periodo,
      anexo: 'RCE_ANEXO_11',
      indicadorOperaciones: opts.indicadorOperaciones,
      tieneContenido: lineas.length > 0,
      moneda: detectarMonedaMixta(comprobantes),
      sinMovimiento: opts.sinMovimiento,
    });
    return empacarResultadoSire('RCE_ANEXO_11', nombre, lineas, 41);
  },

  /**
   * RCE Anexo 12.1 (CC=03, SIRE) / Anexo 13.1 (CC=04|05, Pre-SIRE PLE/Portal) — Ajustes Posteriores Domiciliados (41 campos)
   */
  generarAjustesRce(
    rucEmpresa: string,
    periodoAjuste: string,
    periodoAfectado: string,
    ajustes: any[],
    opts: { esPreSire?: boolean; oportunidad?: '03' | '04' | '05'; correlativo?: string } = {}
  ): ResultadoArchivoSire {
    const oportunidad = opts.oportunidad || (opts.esPreSire ? '04' : '03');
    const anexo: CodigoAnexoSire = oportunidad === '04' || oportunidad === '05' ? 'RCE_ANEXO_13_1' : 'RCE_ANEXO_12_1';
    const lineas = ajustes.map(a =>
      construirFilaRceBase(rucEmpresa, periodoAfectado, a, {
        periodoFila: periodoAfectado,
        carModificarOverride: a.carCpModificar || a.carOriginal || a.car || '',
      })
    );
    const nombre = construirNombreArchivoSire({
      rucEmpresa,
      periodo: periodoAjuste,
      anexo,
      oportunidadOverride: oportunidad,
      correlativo: opts.correlativo,
      tieneContenido: lineas.length > 0,
      moneda: detectarMonedaMixta(ajustes),
    });
    return empacarResultadoSire(anexo, nombre, lineas, 41);
  },

  /**
   * RCE Anexo 12.2 (CC=03, SIRE) / Anexo 13.2 (CC=04|05, Pre-SIRE PLE/Portal) — Ajustes No Domiciliados (35 campos)
   */
  generarAjustesNoDomiciliados(
    rucEmpresa: string,
    periodoAjuste: string,
    periodoAfectado: string,
    ajustes: any[],
    opts: { esPreSire?: boolean; oportunidad?: '03' | '04' | '05'; correlativo?: string } = {}
  ): ResultadoArchivoSire {
    const oportunidad = opts.oportunidad || (opts.esPreSire ? '04' : '03');
    const anexo: CodigoAnexoSire = oportunidad === '04' || oportunidad === '05' ? 'RCE_ANEXO_13_2' : 'RCE_ANEXO_12_2';
    const lineas = ajustes.map(a =>
      construirFilaNoDomiciliado(periodoAfectado, a, {
        periodoFila: periodoAfectado,
        carModificarOverride: a.carCpModificar || a.carOriginal || a.car || '',
      })
    );
    const nombre = construirNombreArchivoSire({
      rucEmpresa,
      periodo: periodoAjuste,
      anexo,
      oportunidadOverride: oportunidad,
      correlativo: opts.correlativo,
      tieneContenido: lineas.length > 0,
      moneda: detectarMonedaMixta(ajustes),
    });
    return empacarResultadoSire(anexo, nombre, lineas, 35);
  },

  /**
   * Valida estrictamente un archivo TXT SIRE contra su anexo oficial
   */
  validarLayoutTxt(
    contenidoTxt: string,
    tipoLayout: TipoLayoutSireValidacion
  ): LayoutSireValidacionResult {
    const mapaAlias: Record<string, CodigoAnexoSire> = {
      RCE_REEMPLAZO: 'RCE_ANEXO_11',
      RVIE_REEMPLAZO: 'RVIE_ANEXO_3',
      RCE_AJUSTE: 'RCE_ANEXO_12_1',
      RVIE_AJUSTE: 'RVIE_ANEXO_4',
    };
    const codigoAnexo = (mapaAlias[tipoLayout] || tipoLayout) as CodigoAnexoSire;
    const spec = ESPECIFICACIONES_ANEXOS_SIRE[codigoAnexo] || ESPECIFICACIONES_ANEXOS_SIRE.RCE_ANEXO_11;

    const lineas = contenidoTxt.split(/\r?\n/).filter(l => l.trim().length > 0);
    const errores: LayoutSireValidacionResult['errores'] = [];

    // Mes sin movimiento válido cuando contenido está vacío
    if (lineas.length === 0) {
      return {
        esValido: true,
        totalFilas: 0,
        totalErrores: 0,
        errores: [],
      };
    }

    for (let i = 0; i < lineas.length; i++) {
      const numLinea = i + 1;
      const linea = lineas[i];

      if (!linea.endsWith('|')) {
        errores.push({
          linea: numLinea,
          columna: linea.length,
          nombreCampo: 'DELIMITADOR_FINAL',
          valor: linea.slice(-1),
          mensaje: `La línea ${numLinea} debe finalizar con delimitador de pleca (|) conforme al estándar SUNAT.`
        });
      }

      const cols = linea.split('|');
      if (linea.endsWith('|')) {
        cols.pop();
      }

      if (cols.length !== spec.totalCampos) {
        errores.push({
          linea: numLinea,
          columna: cols.length,
          nombreCampo: 'NUMERO_COLUMNAS',
          valor: `${cols.length} columnas`,
          mensaje: `La estructura de la línea ${numLinea} contiene ${cols.length} columnas pero el formato oficial ${codigoAnexo} exige exactamente ${spec.totalCampos} columnas.`
        });
      }

      if (spec.idxFechaEmision !== undefined && cols.length > spec.idxFechaEmision) {
        const fechaEmision = cols[spec.idxFechaEmision];
        if (fechaEmision && !/^\d{2}\/\d{2}\/\d{4}$/.test(fechaEmision)) {
          errores.push({
            linea: numLinea,
            columna: spec.idxFechaEmision + 1,
            nombreCampo: 'FECHA_EMISION',
            valor: fechaEmision,
            mensaje: `Formato de fecha inválido '${fechaEmision}'. Se requiere DD/MM/AAAA.`
          });
        }
      }

      if (spec.exigeCarOriginal && spec.indicesCar) {
        for (const idxCar of spec.indicesCar) {
          const carVal = cols[idxCar] || '';
          if (!carVal || carVal.length !== 27) {
            errores.push({
              linea: numLinea,
              columna: idxCar + 1,
              nombreCampo: 'CAR_SUNAT',
              valor: carVal,
              mensaje: `El anexo ${codigoAnexo} exige CAR SUNAT válido de 27 caracteres en la columna ${idxCar + 1}.`
            });
          }
        }
      }
    }

    return {
      esValido: errores.length === 0,
      totalFilas: lineas.length,
      totalErrores: errores.length,
      errores
    };
  }
};
