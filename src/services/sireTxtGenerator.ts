import { Comprobante } from '../types';

/**
 * Genera el archivo plano oficial de Registro de Compras Electrónico (RCE) - Anexo 11 (Reemplazo 08040002, 41 campos)
 * Nomenclatura oficial SIRE: LE + RUC (11) + AÑO (4) + MES (2) + '00080400021' + I + M + '2.txt'
 */
export function generarSireRceTxt(ruc: string, periodo: string, comprobantes: Comprobante[]): { nombreArchivo: string; contenido: string } {
  const [anio, mes] = periodo.split('-');
  const indCont = comprobantes.length > 0 ? '1' : '0';
  const indMon = comprobantes.some(c => c.moneda !== 'PEN') ? '2' : '1';
  const nombreArchivo = `LE${ruc}${anio}${mes}00080400021${indCont}${indMon}2.txt`;

  const lineas: string[] = [];

  comprobantes.forEach((c) => {
    const fechaEmisionArr = c.fechaEmision.slice(0, 10).split('-');
    const fechaEmisionFmt = fechaEmisionArr.length === 3 ? `${fechaEmisionArr[2]}/${fechaEmisionArr[1]}/${fechaEmisionArr[0]}` : c.fechaEmision;

    const fechaVencArr = (c.fechaVencimiento || c.fechaEmision).slice(0, 10).split('-');
    const fechaVencFmt = fechaVencArr.length === 3 ? `${fechaVencArr[2]}/${fechaVencArr[1]}/${fechaVencArr[0]}` : (c.fechaVencimiento || '');
    const tipoDocPrv = c.rucEmisor.length === 11 ? '6' : c.rucEmisor.length === 8 ? '1' : '0';

    const campos = [
      c.rucReceptor || ruc, // 1. RUC Generador
      c.razonSocialReceptor || 'EMPRESA CONTRIBUYENTE S.A.C.', // 2. Razón social
      `${anio}${mes}`, // 3. Periodo AAAAMM
      c.car || '', // 4. CAR SUNAT
      fechaEmisionFmt, // 5. Fecha emisión
      fechaVencFmt, // 6. Fecha vencimiento
      c.tipoDoc, // 7. Tipo CP
      c.serie, // 8. Serie
      '', // 9. Año DUA/DSI
      c.numero, // 10. Número
      '', // 11. Número final
      tipoDocPrv, // 12. Tipo doc proveedor
      c.rucEmisor, // 13. Num doc proveedor
      c.razonSocialEmisor, // 14. Razón social proveedor
      c.baseImponibleGravada.toFixed(2), // 15. BI DG
      c.igv.toFixed(2), // 16. IGV DG
      '0.00', // 17. BI DGNG
      '0.00', // 18. IGV DGNG
      '0.00', // 19. BI DNG
      '0.00', // 20. IGV DNG
      (c.adquisicionesNoGravadas || 0).toFixed(2), // 21. No gravadas
      (c.isc || 0).toFixed(2), // 22. ISC
      (c.icbper || 0).toFixed(2), // 23. ICBPER
      (c.otrosTributos || 0).toFixed(2), // 24. Otros tributos
      c.total.toFixed(2), // 25. Total
      c.moneda, // 26. Moneda
      c.moneda === 'PEN' ? '' : c.tipoCambio.toFixed(3), // 27. Tipo cambio
      '', '', '', '', '', // 28-32. Doc modificado
      c.clasificacionBienServicio || '', // 33. Clasificación bienes
      '', // 34. ID Contrato/Proyecto
      '', // 35. PorcPart
      '', // 36. IMB
      '', // 37. CAR CP a modificar
      c.sujetoADetraccion ? '1' : '', // 38. Marca detracción
      '', // 39. Tipo nota
      c.estadoSunat === 'ANULADO' ? '2' : '1', // 40. Estado
      '' // 41. Incal
    ];

    lineas.push(campos.join('|') + '|');
  });

  return {
    nombreArchivo,
    contenido: lineas.length > 0 ? lineas.join('\r\n') + '\r\n' : ''
  };
}

/**
 * Genera el archivo plano oficial de Registro de Ventas e Ingresos Electrónico (RVIE) - Anexo 3 (Reemplazo 14040002, 34 campos)
 */
export function generarSireRvieTxt(ruc: string, periodo: string, comprobantes: Comprobante[]): { nombreArchivo: string; contenido: string } {
  const [anio, mes] = periodo.split('-');
  const indCont = comprobantes.length > 0 ? '1' : '0';
  const indMon = comprobantes.some(c => c.moneda !== 'PEN') ? '2' : '1';
  const nombreArchivo = `LE${ruc}${anio}${mes}00140400021${indCont}${indMon}2.txt`;

  const lineas: string[] = [];

  comprobantes.forEach((c) => {
    const esAnulado = c.estadoSunat === 'ANULADO';
    const fechaEmisionArr = c.fechaEmision.slice(0, 10).split('-');
    const fechaEmisionFmt = fechaEmisionArr.length === 3 ? `${fechaEmisionArr[2]}/${fechaEmisionArr[1]}/${fechaEmisionArr[0]}` : c.fechaEmision;

    const fechaVencArr = (c.fechaVencimiento || c.fechaEmision).slice(0, 10).split('-');
    const fechaVencFmt = fechaVencArr.length === 3 ? `${fechaVencArr[2]}/${fechaVencArr[1]}/${fechaVencArr[0]}` : fechaEmisionFmt;

    const tipoDocIdentidad = c.rucReceptor.length === 11 ? '6' : c.rucReceptor.length === 8 ? '1' : '0';

    const campos = [
      c.rucEmisor || ruc, // 1. RUC Emisor
      c.razonSocialEmisor || 'EMPRESA CONTRIBUYENTE S.A.C.', // 2. Razón social
      `${anio}${mes}`, // 3. Periodo AAAAMM
      c.car || '', // 4. CAR SUNAT
      fechaEmisionFmt, // 5. Fecha emisión
      fechaVencFmt, // 6. Fecha vencimiento
      c.tipoDoc, // 7. Tipo CP
      c.serie, // 8. Serie
      c.numero, // 9. Número
      '', // 10. Número final
      tipoDocIdentidad, // 11. Tipo doc cliente
      c.rucReceptor, // 12. Num doc cliente
      c.razonSocialReceptor, // 13. Razón social cliente
      '0.00', // 14. Exportación
      (esAnulado ? 0 : c.baseImponibleGravada).toFixed(2), // 15. Base gravada
      '0.00', // 16. Descuento base
      (esAnulado ? 0 : c.igv).toFixed(2), // 17. IGV
      '0.00', // 18. Descuento IGV
      '0.00', // 19. Exonerado
      (esAnulado ? 0 : (c.adquisicionesNoGravadas || 0)).toFixed(2), // 20. Inafecto
      (esAnulado ? 0 : (c.isc || 0)).toFixed(2), // 21. ISC
      '0.00', // 22. Base IVAP
      '0.00', // 23. IVAP
      (esAnulado ? 0 : (c.icbper || 0)).toFixed(2), // 24. ICBPER
      (esAnulado ? 0 : (c.otrosTributos || 0)).toFixed(2), // 25. Otros tributos
      (esAnulado ? 0 : c.total).toFixed(2), // 26. Total
      c.moneda, // 27. Moneda
      c.moneda === 'PEN' ? '' : c.tipoCambio.toFixed(3), // 28. Tipo de cambio
      '', '', '', '', // 29-32. Doc modificado
      '', // 33. Proyecto
      '' // 34. Tipo nota
    ];

    lineas.push(campos.join('|') + '|');
  });

  return {
    nombreArchivo,
    contenido: lineas.length > 0 ? lineas.join('\r\n') + '\r\n' : ''
  };
}

/**
 * Exporta a CSV descargable para abrir inmediatamente en una hoja de cálculo
 */
export function exportarComprobantesCsv(comprobantes: Comprobante[], tipo: 'COMPRAS' | 'VENTAS'): string {
  const encabezados = [
    'CAR_SUNAT',
    'TIPO_COMPROBANTE',
    'SERIE',
    'NUMERO',
    'FECHA_EMISION',
    'FECHA_VENCIMIENTO',
    'RUC_EMISOR',
    'RAZON_SOCIAL_EMISOR',
    'RUC_RECEPTOR',
    'RAZON_SOCIAL_RECEPTOR',
    'MONEDA',
    'TIPO_CAMBIO',
    'BASE_IMPONIBLE_GRAVADA',
    'IGV_18_PORCIENTO',
    'TOTAL',
    'DETRACCION_SPOT',
    'MONTO_DETRACCION',
    'CUENTA_PCGE',
    'ESTADO_SUNAT'
  ];

  const filas = comprobantes.map(c => [
    `"${c.car}"`,
    `"${c.tipoDoc}"`,
    `"${c.serie}"`,
    `"${c.numero}"`,
    `"${c.fechaEmision}"`,
    `"${c.fechaVencimiento || c.fechaEmision}"`,
    `"${c.rucEmisor}"`,
    `"${c.razonSocialEmisor.replace(/"/g, '""')}"`,
    `"${c.rucReceptor}"`,
    `"${c.razonSocialReceptor.replace(/"/g, '""')}"`,
    `"${c.moneda}"`,
    c.tipoCambio.toFixed(3),
    c.baseImponibleGravada.toFixed(2),
    c.igv.toFixed(2),
    c.total.toFixed(2),
    c.sujetoADetraccion ? `"SI (${c.tasaDetraccion}%)"` : '"NO"',
    c.montoDetraccion ? c.montoDetraccion.toFixed(2) : '0.00',
    `"${c.cuentaContableAsignada || '6011'}"`,
    `"${c.estadoSunat}"`
  ].join(';'));

  return [encabezados.join(';'), ...filas].join('\r\n');
}
