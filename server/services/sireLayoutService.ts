import crypto from 'crypto';
import AdmZip from 'adm-zip';
import { ComprobantePropuestaSire } from './sunatGateway';

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

/**
 * Servicio de Layouts Oficiales para SIRE (RCE y RVIE):
 * Genera y valida archivos TXT y ZIP de Reemplazo y Ajustes conforme a las R.S. N° 000112-2021/SUNAT
 * y R.S. N° 000040-2022/SUNAT.
 */
export const sireLayoutService = {
  /**
   * Parsea el contenido TXT de la propuesta SIRE descargada de SUNAT (delimitado por pipes)
   */
  parsearPropuestaSireTxt(contenidoTxt: string, tipo: 'COMPRAS' | 'VENTAS'): ComprobantePropuestaSire[] {
    const lineas = contenidoTxt.split(/\r?\n/).filter(l => l.trim().length > 0);
    const comprobantes: ComprobantePropuestaSire[] = [];

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      if (linea.startsWith('--') || linea.startsWith('//')) continue; // Ignorar comentarios

      const cols = linea.split('|');
      // Cada línea termina en pipe, por lo que el split puede tener una columna vacía al final
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
        '6', // Tipo doc receptor (6=RUC)
        sanitizarCampoPlano(c.rucReceptor),
        sanitizarCampoPlano(c.razonSocialReceptor),
        c.baseGravada.toFixed(2),
        c.igv.toFixed(2),
        '0.00', // No gravadas
        '0.00', // Otros cargos
        c.total.toFixed(2),
        c.moneda,
        (c.tipoCambio || 1.0).toFixed(3),
        c.tieneDetraccion ? '1' : '0',
        c.codigoDetraccion || '',
        c.car || generarCarOficial(c.rucEmisor, c.tipoComprobante, c.serie, c.numero),
        '1' // Estado activo
      ];
      return campos.join('|') + '|';
    });
    return lineas.join('\r\n');
  },

  /**
   * Genera el archivo plano de REEMPLAZO DE PROPUESTA RCE (Anexo 8 oficial SUNAT - 42 campos exactos)
   * Nomenclatura: LE + RUC(11) + AAAA(4) + MM(2) + 00 + 080400 + 00 + 1 + 1 + 1 + 1 .txt
   */
  generarReemplazoRce(
    rucEmpresa: string,
    periodo: string,
    comprobantes: any[]
  ): {
    nombreArchivoTxt: string;
    nombreArchivoZip: string;
    contenidoTxt: string;
    zipBuffer: Buffer;
    hashSha256: string;
    totalCampos: number;
    totalFilas: number;
  } {
    const [anio, mes] = periodo.split('-');
    const nombreArchivoTxt = `LE${rucEmpresa}${anio}${mes}00080400001111.txt`;
    const nombreArchivoZip = `LE${rucEmpresa}${anio}${mes}00080400001111.zip`;

    const lineas: string[] = [];

    for (const c of comprobantes) {
      const fechaEmisionFmt = (c.fechaEmision || '').includes('-')
        ? c.fechaEmision.split('-').reverse().join('/')
        : c.fechaEmision;
      const fechaVencFmt = c.fechaVencimiento && c.fechaVencimiento.includes('-')
        ? c.fechaVencimiento.split('-').reverse().join('/')
        : (c.fechaVencimiento || '');

      const baseVal = Number(c.baseGravada || c.base || 0);
      const igvVal = Number(c.igv || 0);
      const totalVal = Number(c.total || (baseVal + igvVal));
      const tcVal = Number(c.tipoCambio || 1.0);
      const rucPrv = c.proveedorRuc || c.rucEmisor || '20000000001';
      const nomPrv = c.proveedorNombre || c.razonSocialEmisor || 'PROVEEDOR S.A.C.';
      const car = c.car || generarCarOficial(rucPrv, c.tipoComprobante, c.serie, c.numero);

      // Estructura oficial Anexo 8 (42 campos)
      const campos = [
        sanitizarCampoPlano(rucEmpresa), // 1. RUC Emisor / Empresa
        sanitizarCampoPlano(c.razonSocialEmpresa || 'EMPRESA CONTRIBUYENTE S.A.C.'), // 2. Razón social
        sanitizarCampoPlano(c.tipoComprobante || '01'), // 3. Tipo comprobante
        sanitizarCampoPlano(c.serie || 'F001'), // 4. Serie
        sanitizarCampoPlano(c.numero || '00000001'), // 5. Número
        '', // 6. Número final si es rango
        fechaEmisionFmt, // 7. Fecha de emisión (DD/MM/AAAA)
        fechaVencFmt, // 8. Fecha de vencimiento
        '6', // 9. Tipo doc identidad proveedor (6=RUC)
        sanitizarCampoPlano(rucPrv), // 10. Número doc proveedor
        sanitizarCampoPlano(nomPrv), // 11. Razón social proveedor
        baseVal.toFixed(2), // 12. Base imponible gravada op. destinadas a ventas gravadas
        igvVal.toFixed(2), // 13. IGV/IPM operaciones gravadas
        '0.00', // 14. Base imponible gravada op. gravadas y no gravadas
        '0.00', // 15. IGV/IPM común
        '0.00', // 16. Base gravada sin derecho crédito fiscal
        '0.00', // 17. IGV sin derecho crédito
        Number(c.baseNoGravada || 0).toFixed(2), // 18. Valor adquisiciones no gravadas
        '0.00', // 19. ISC
        '0.00', // 20. ICBPER
        '0.00', // 21. Otros tributos y cargos
        totalVal.toFixed(2), // 22. Total adquisiciones
        c.moneda || 'PEN', // 23. Código de moneda
        tcVal.toFixed(3), // 24. Tipo de cambio
        c.fechaDocModificado ? c.fechaDocModificado.split('-').reverse().join('/') : '', // 25. Fecha doc modificado
        c.tipoDocModificado || '', // 26. Tipo doc modificado
        c.serieDocModificado || '', // 27. Serie doc modificado
        '', // 28. Código DUA doc modificado
        c.numeroDocModificado || '', // 29. Número doc modificado
        c.tieneDetraccion ? '1' : '', // 30. Detracción
        c.fechaConstanciaDetraccion || '', // 31. Fecha constancia detracción
        c.numeroConstanciaDetraccion || '', // 32. Número constancia detracción
        c.sujetoRetencion ? '1' : '', // 33. Retención
        c.clasificacionBienes || '', // 34. Clasificación
        c.contratoProyecto || '', // 35. Proyecto
        '', // 36. Error Tipo 1
        '', // 37. Error Tipo 2
        '', // 38. Error Tipo 3
        '', // 39. Error Tipo 4
        '1', // 40. Medio de pago
        '1', // 41. Estado de anotación (1=En plazo)
        car // 42. CAR
      ];

      lineas.push(campos.join('|') + '|');
    }

    const contenidoTxt = lineas.join('\r\n');
    const hashSha256 = crypto.createHash('sha256').update(contenidoTxt, 'utf8').digest('hex');

    const zip = new AdmZip();
    zip.addFile(nombreArchivoTxt, Buffer.from(contenidoTxt, 'utf8'));
    const zipBuffer = zip.toBuffer();

    return {
      nombreArchivoTxt,
      nombreArchivoZip,
      contenidoTxt,
      zipBuffer,
      hashSha256,
      totalCampos: 42,
      totalFilas: lineas.length
    };
  },

  /**
   * Genera el archivo plano de REEMPLAZO DE PROPUESTA RVIE (Anexo 2 / 3 oficial SUNAT - 34 campos exactos)
   * Nomenclatura: LE + RUC(11) + AAAA(4) + MM(2) + 00 + 140400 + 00 + 1 + 1 + 1 + 1 .txt
   */
  generarReemplazoRvie(
    rucEmpresa: string,
    periodo: string,
    comprobantes: any[]
  ): {
    nombreArchivoTxt: string;
    nombreArchivoZip: string;
    contenidoTxt: string;
    zipBuffer: Buffer;
    hashSha256: string;
    totalCampos: number;
    totalFilas: number;
  } {
    const [anio, mes] = periodo.split('-');
    const nombreArchivoTxt = `LE${rucEmpresa}${anio}${mes}00140400001111.txt`;
    const nombreArchivoZip = `LE${rucEmpresa}${anio}${mes}00140400001111.zip`;

    const lineas: string[] = [];

    for (const v of comprobantes) {
      const fechaEmisionFmt = (v.fechaEmision || '').includes('-')
        ? v.fechaEmision.split('-').reverse().join('/')
        : v.fechaEmision;
      const fechaVencFmt = v.fechaVencimiento && v.fechaVencimiento.includes('-')
        ? v.fechaVencimiento.split('-').reverse().join('/')
        : (v.fechaVencimiento || '');

      const baseVal = Number(v.baseGravada || v.base || 0);
      const igvVal = Number(v.igv || 0);
      const totalVal = Number(v.total || (baseVal + igvVal));
      const tcVal = Number(v.tipoCambio || 1.0);
      const rucCli = v.clienteRuc || v.rucReceptor || '20000000002';
      const nomCli = v.clienteNombre || v.razonSocialReceptor || 'CLIENTE S.A.C.';
      const car = v.car || generarCarOficial(rucEmpresa, v.tipoComprobante, v.serie, v.numero);

      // Estructura oficial Anexo 2 / 3 (34 campos)
      const campos = [
        sanitizarCampoPlano(rucEmpresa), // 1. RUC Emisor
        sanitizarCampoPlano(v.razonSocialEmpresa || 'EMPRESA CONTRIBUYENTE S.A.C.'), // 2. Razón social
        sanitizarCampoPlano(v.tipoComprobante || '01'), // 3. Tipo comprobante
        sanitizarCampoPlano(v.serie || 'F001'), // 4. Serie
        sanitizarCampoPlano(v.numero || '00000001'), // 5. Número
        '', // 6. Número final
        fechaEmisionFmt, // 7. Fecha de emisión
        fechaVencFmt, // 8. Fecha de vencimiento
        '6', // 9. Tipo doc identidad cliente
        sanitizarCampoPlano(rucCli), // 10. Número doc cliente
        sanitizarCampoPlano(nomCli), // 11. Razón social cliente
        '0.00', // 12. Valor facturado exportación
        baseVal.toFixed(2), // 13. Base gravada
        '0.00', // 14. Descuento base
        igvVal.toFixed(2), // 15. IGV
        '0.00', // 16. Descuento IGV
        '0.00', // 17. Exonerado
        '0.00', // 18. Inafecto
        '0.00', // 19. ISC
        '0.00', // 20. Base IVAP
        '0.00', // 21. IVAP
        '0.00', // 22. ICBPER
        '0.00', // 23. Otros tributos
        totalVal.toFixed(2), // 24. Total
        v.moneda || 'PEN', // 25. Moneda
        tcVal.toFixed(3), // 26. Tipo de cambio
        v.fechaDocModificado ? v.fechaDocModificado.split('-').reverse().join('/') : '', // 27. Fecha modificado
        v.tipoDocModificado || '', // 28. Tipo modificado
        v.serieDocModificado || '', // 29. Serie modificado
        v.numeroDocModificado || '', // 30. Número modificado
        v.identificadorProyecto || '', // 31. Proyecto
        v.tipoNotaCredito || '', // 32. Tipo NC/ND
        '1', // 33. Estado anotación
        car // 34. CAR
      ];

      lineas.push(campos.join('|') + '|');
    }

    const contenidoTxt = lineas.join('\r\n');
    const hashSha256 = crypto.createHash('sha256').update(contenidoTxt, 'utf8').digest('hex');

    const zip = new AdmZip();
    zip.addFile(nombreArchivoTxt, Buffer.from(contenidoTxt, 'utf8'));
    const zipBuffer = zip.toBuffer();

    return {
      nombreArchivoTxt,
      nombreArchivoZip,
      contenidoTxt,
      zipBuffer,
      hashSha256,
      totalCampos: 34,
      totalFilas: lineas.length
    };
  },

  /**
   * Genera el archivo plano de AJUSTES POSTERIORES RCE (Anexo 11 oficial SUNAT - 43 campos)
   * Nomenclatura: LE + RUC(11) + AAAA(4) + MM(2) + 00 + 080500 + 00 + 1 + 1 + 1 + 1 .txt
   */
  generarAjustesRce(
    rucEmpresa: string,
    periodoAjuste: string,
    periodoAfectado: string,
    ajustes: any[]
  ): {
    nombreArchivoTxt: string;
    nombreArchivoZip: string;
    contenidoTxt: string;
    zipBuffer: Buffer;
    hashSha256: string;
    totalCampos: number;
    totalFilas: number;
  } {
    const [anio, mes] = periodoAjuste.split('-');
    const nombreArchivoTxt = `LE${rucEmpresa}${anio}${mes}00080500001111.txt`;
    const nombreArchivoZip = `LE${rucEmpresa}${anio}${mes}00080500001111.zip`;

    const lineas: string[] = [];

    for (const a of ajustes) {
      const periodoAfectadoNum = periodoAfectado.replace('-', '') + '00';
      const carOriginal = a.carOriginal || a.car || '';
      const baseVal = Number(a.baseGravada || a.base || 0);
      const igvVal = Number(a.igv || 0);
      const totalVal = Number(a.total || (baseVal + igvVal));
      const tcVal = Number(a.tipoCambio || 1.0);
      const rucPrv = a.proveedorRuc || '20000000001';
      const nomPrv = a.proveedorNombre || 'PROVEEDOR S.A.C.';

      // Anexo 11: 43 campos (incluye el período afectado como campo 1 y CAR original como campo 2)
      const campos = [
        periodoAfectadoNum, // 1. Período que se ajusta (AAAAMM00)
        carOriginal, // 2. CAR del comprobante que se ajusta
        sanitizarCampoPlano(rucEmpresa), // 3. RUC Emisor
        sanitizarCampoPlano(a.razonSocialEmpresa || 'EMPRESA CONTRIBUYENTE S.A.C.'), // 4. Razón social
        sanitizarCampoPlano(a.tipoComprobante || '01'), // 5. Tipo comprobante
        sanitizarCampoPlano(a.serie || 'F001'), // 6. Serie
        sanitizarCampoPlano(a.numero || '00000001'), // 7. Número
        '', // 8. Número final
        a.fechaEmision ? a.fechaEmision.split('-').reverse().join('/') : '', // 9. Fecha emisión
        a.fechaVencimiento ? a.fechaVencimiento.split('-').reverse().join('/') : '', // 10. Fecha vencimiento
        '6', // 11. Tipo doc proveedor
        sanitizarCampoPlano(rucPrv), // 12. RUC proveedor
        sanitizarCampoPlano(nomPrv), // 13. Razón social proveedor
        baseVal.toFixed(2), // 14. Base gravada
        igvVal.toFixed(2), // 15. IGV
        '0.00', '0.00', '0.00', '0.00', // 16-19. Otros destinos
        '0.00', // 20. ISC
        '0.00', // 21. ICBPER
        '0.00', // 22. Otros tributos
        totalVal.toFixed(2), // 23. Total
        a.moneda || 'PEN', // 24. Moneda
        tcVal.toFixed(3), // 25. TC
        '', '', '', '', // 26-29. Doc modificado
        '', '', '', '', // 30-33. Detracción y retención
        '', '', // 34-35. Bienes y contrato
        '', '', '', '', // 36-39. Errores
        '1', // 40. Medio de pago
        '8', // 41. Estado de anotación (8: Ajuste posterior)
        a.car || carOriginal, // 42. CAR asignado
        '0' // 43. Indicador de ajuste
      ];

      lineas.push(campos.join('|') + '|');
    }

    const contenidoTxt = lineas.join('\r\n');
    const hashSha256 = crypto.createHash('sha256').update(contenidoTxt, 'utf8').digest('hex');

    const zip = new AdmZip();
    zip.addFile(nombreArchivoTxt, Buffer.from(contenidoTxt, 'utf8'));
    const zipBuffer = zip.toBuffer();

    return {
      nombreArchivoTxt,
      nombreArchivoZip,
      contenidoTxt,
      zipBuffer,
      hashSha256,
      totalCampos: 43,
      totalFilas: lineas.length
    };
  },

  /**
   * Genera el archivo plano de AJUSTES POSTERIORES RVIE (Anexo 4 / 5 oficial SUNAT - 35 campos)
   */
  generarAjustesRvie(
    rucEmpresa: string,
    periodoAjuste: string,
    periodoAfectado: string,
    ajustes: any[]
  ): {
    nombreArchivoTxt: string;
    nombreArchivoZip: string;
    contenidoTxt: string;
    zipBuffer: Buffer;
    hashSha256: string;
    totalCampos: number;
    totalFilas: number;
  } {
    const [anio, mes] = periodoAjuste.split('-');
    const nombreArchivoTxt = `LE${rucEmpresa}${anio}${mes}00140500001111.txt`;
    const nombreArchivoZip = `LE${rucEmpresa}${anio}${mes}00140500001111.zip`;

    const lineas: string[] = [];

    for (const a of ajustes) {
      const periodoAfectadoNum = periodoAfectado.replace('-', '') + '00';
      const carOriginal = a.carOriginal || a.car || '';
      const baseVal = Number(a.baseGravada || a.base || 0);
      const igvVal = Number(a.igv || 0);
      const totalVal = Number(a.total || (baseVal + igvVal));
      const tcVal = Number(a.tipoCambio || 1.0);
      const rucCli = a.clienteRuc || '20000000002';
      const nomCli = a.clienteNombre || 'CLIENTE S.A.C.';

      // Anexo 4 / 5 (35 campos)
      const campos = [
        periodoAfectadoNum, // 1. Período ajustado
        carOriginal, // 2. CAR original
        sanitizarCampoPlano(rucEmpresa), // 3. RUC emisor
        sanitizarCampoPlano(a.razonSocialEmpresa || 'EMPRESA CONTRIBUYENTE S.A.C.'), // 4. Razón social
        sanitizarCampoPlano(a.tipoComprobante || '01'), // 5. Tipo
        sanitizarCampoPlano(a.serie || 'F001'), // 6. Serie
        sanitizarCampoPlano(a.numero || '00000001'), // 7. Número
        '', // 8. Número final
        a.fechaEmision ? a.fechaEmision.split('-').reverse().join('/') : '', // 9. Fecha emisión
        a.fechaVencimiento ? a.fechaVencimiento.split('-').reverse().join('/') : '', // 10. Vencimiento
        '6', // 11. Tipo doc cliente
        sanitizarCampoPlano(rucCli), // 12. RUC cliente
        sanitizarCampoPlano(nomCli), // 13. Razón social
        '0.00', // 14. Exportación
        baseVal.toFixed(2), // 15. Base gravada
        '0.00', // 16. Descuento
        igvVal.toFixed(2), // 17. IGV
        '0.00', // 18. Descuento IGV
        '0.00', // 19. Exonerado
        '0.00', // 20. Inafecto
        '0.00', // 21. ISC
        '0.00', '0.00', // 22-23. IVAP
        '0.00', // 24. ICBPER
        '0.00', // 25. Otros tributos
        totalVal.toFixed(2), // 26. Total
        a.moneda || 'PEN', // 27. Moneda
        tcVal.toFixed(3), // 28. TC
        '', '', '', '', // 29-32. Doc modificado
        '', // 33. Proyecto
        '8', // 34. Estado anotación (8: Ajuste)
        a.car || carOriginal // 35. CAR
      ];

      lineas.push(campos.join('|') + '|');
    }

    const contenidoTxt = lineas.join('\r\n');
    const hashSha256 = crypto.createHash('sha256').update(contenidoTxt, 'utf8').digest('hex');

    const zip = new AdmZip();
    zip.addFile(nombreArchivoTxt, Buffer.from(contenidoTxt, 'utf8'));
    const zipBuffer = zip.toBuffer();

    return {
      nombreArchivoTxt,
      nombreArchivoZip,
      contenidoTxt,
      zipBuffer,
      hashSha256,
      totalCampos: 35,
      totalFilas: lineas.length
    };
  },

  /**
   * Valida estrictamente un archivo TXT de reemplazo o ajuste SIRE contra su layout oficial
   */
  validarLayoutTxt(
    contenidoTxt: string,
    tipoLayout: 'RCE_REEMPLAZO' | 'RVIE_REEMPLAZO' | 'RCE_AJUSTE' | 'RVIE_AJUSTE'
  ): LayoutSireValidacionResult {
    const camposEsperadosPorTipo: Record<string, number> = {
      RCE_REEMPLAZO: 42,
      RVIE_REEMPLAZO: 34,
      RCE_AJUSTE: 43,
      RVIE_AJUSTE: 35
    };

    const columnasEsperadas = camposEsperadosPorTipo[tipoLayout] || 42;
    const lineas = contenidoTxt.split(/\r?\n/).filter(l => l.trim().length > 0);
    const errores: LayoutSireValidacionResult['errores'] = [];

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

      // Dividir por | (omitiendo el último elemento vacío posterior a la pleca final)
      const cols = linea.split('|');
      if (linea.endsWith('|')) {
        cols.pop();
      }

      if (cols.length !== columnasEsperadas) {
        errores.push({
          linea: numLinea,
          columna: cols.length,
          nombreCampo: 'NUMERO_COLUMNAS',
          valor: `${cols.length} columnas`,
          mensaje: `La estructura de la línea ${numLinea} contiene ${cols.length} columnas pero el formato oficial ${tipoLayout} exige exactamente ${columnasEsperadas} columnas.`
        });
      }

      // Validaciones individuales de campo comunes
      const idxFechaEmision = (tipoLayout === 'RCE_AJUSTE' || tipoLayout === 'RVIE_AJUSTE') ? 8 : 6;
      if (cols.length > idxFechaEmision) {
        const fechaEmision = cols[idxFechaEmision]; // Fecha emisión
        if (fechaEmision && !/^\d{2}\/\d{2}\/\d{4}$/.test(fechaEmision) && !/^\d{4}-\d{2}-\d{2}$/.test(fechaEmision)) {
          errores.push({
            linea: numLinea,
            columna: idxFechaEmision + 1,
            nombreCampo: 'FECHA_EMISION',
            valor: fechaEmision,
            mensaje: `Formato de fecha inválido '${fechaEmision}'. Se requiere DD/MM/AAAA.`
          });
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
