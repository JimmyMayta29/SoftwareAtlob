export interface ErrorValidacionLinea {
  linea: number;
  columna: number;
  nombreCampo: string;
  valor: string;
  mensaje: string;
}

export interface ResultadoValidacionTxt {
  esValido: boolean;
  tipoFormato: string;
  nombreArchivo?: string;
  totalLineas: number;
  totalErrores: number;
  totalAdvertencias: number;
  errores: ErrorValidacionLinea[];
  advertencias: string[];
  resumenControl: {
    totalFilas: number;
    sumaDebe?: number;
    sumaHaber?: number;
    sumaBase?: number;
    sumaIgv?: number;
    sumaTotal?: number;
  };
}

// Catálogo de especificaciones de columnas oficiales PLE y SIRE
export const ESPECIFICACION_COLUMNAS_PLE: Record<string, { nombre: string; totalCampos: number; campos: string[] }> = {
  '050100': {
    nombre: 'Libro Diario (Formato 5.1)',
    totalCampos: 21,
    campos: [
      'Periodo', 'CUO', 'CorrelativoAsiento', 'CuentaContable', 'UnidadOperacion',
      'CentroCostos', 'Moneda', 'TipoDocTercero', 'NumDocTercero', 'TipoComprobante',
      'SerieComprobante', 'NumeroComprobante', 'FechaContable', 'FechaVencimiento',
      'FechaOperacion', 'Glosa', 'GlosaReferencial', 'Debe', 'Haber', 'LibroReferencial', 'Estado'
    ]
  },
  '060100': {
    nombre: 'Libro Mayor (Formato 6.1)',
    totalCampos: 16,
    campos: [
      'Periodo', 'CUO', 'CorrelativoAsiento', 'CuentaContable', 'UnidadOperacion',
      'CentroCostos', 'Moneda', 'TipoDocTercero', 'NumDocTercero', 'TipoComprobante',
      'SerieComprobante', 'NumeroComprobante', 'FechaContable', 'Glosa', 'Debe', 'Haber'
    ]
  },
  '080100': {
    nombre: 'Registro de Compras (Formato 8.1)',
    totalCampos: 42,
    campos: [
      'Periodo', 'CUO', 'CorrelativoAsiento', 'FechaEmision', 'FechaVencimiento',
      'TipoComprobante', 'Serie', 'AnioDua', 'Numero', 'NumeroFinal',
      'TipoDocProveedor', 'NumDocProveedor', 'RazonSocialProveedor', 'BaseGravadaDestino1',
      'IgvDestino1', 'BaseGravadaDestino2', 'IgvDestino2', 'BaseGravadaDestino3',
      'IgvDestino3', 'NoGravadas', 'ISC', 'ICBPER', 'OtrosTributos', 'ImporteTotal',
      'Moneda', 'TipoCambio', 'FechaDocModificado', 'TipoDocModificado', 'SerieDocModificado',
      'AduanaDocModificado', 'NumeroDocModificado', 'FechaDetraccion', 'NumeroDetraccion',
      'MarcaRetencion', 'ClasificacionBienes', 'ContratoProyecto', 'ErrorTipo1',
      'ErrorTipo2', 'ErrorTipo3', 'MedioPago', 'EstadoAnotacion', 'Libre'
    ]
  },
  '080200': {
    nombre: 'Registro de Compras - No Domiciliados (Formato 8.2)',
    totalCampos: 36,
    campos: [
      'Periodo', 'CUO', 'CorrelativoAsiento', 'FechaEmision', 'TipoComprobante',
      'Serie', 'Numero', 'ValorAdquisicion', 'OtrosConceptos', 'ImporteTotal',
      'TipoCmpCredito', 'SerieCmpCredito', 'AnioDua', 'NumCmpCredito', 'RetencionIgv',
      'Moneda', 'TipoCambio', 'PaisResidencia', 'RazonSocialNoDomiciliado', 'DomicilioExtranjero',
      'TIN', 'NIFBeneficiario', 'RazonBeneficiario', 'PaisBeneficiario', 'Vinculo',
      'RentaBruta', 'Deduccion', 'RentaNeta', 'TasaRetencion', 'ImpuestoRetenido',
      'ConvenioDobleImposicion', 'Exoneracion', 'TipoRenta', 'ModalidadServicio', 'AplicacionArt76', 'Estado'
    ]
  },
  '140100': {
    nombre: 'Registro de Ventas e Ingresos (Formato 14.1)',
    totalCampos: 35,
    campos: [
      'Periodo', 'CUO', 'CorrelativoAsiento', 'FechaEmision', 'FechaVencimiento',
      'TipoComprobante', 'Serie', 'Numero', 'NumeroFinal', 'TipoDocCliente',
      'NumDocCliente', 'RazonSocialCliente', 'Exportacion', 'BaseGravada', 'DescuentoBase',
      'IGV', 'DescuentoIgv', 'Exonerado', 'Inafecto', 'ISC', 'BaseIvap', 'IVAP',
      'ICBPER', 'OtrosTributos', 'Total', 'Moneda', 'TipoCambio', 'FechaDocModificado',
      'TipoDocModificado', 'SerieDocModificado', 'NumeroDocModificado', 'ContratoProyecto',
      'ErrorTipo1', 'MedioPago', 'EstadoAnotacion'
    ]
  },
  '010100': {
    nombre: 'Libro Caja y Bancos - Efectivo (Formato 1.1)',
    totalCampos: 15,
    campos: [
      'Periodo', 'CUO', 'CorrelativoAsiento', 'CuentaContable', 'UnidadOperacion',
      'CentroCostos', 'Moneda', 'TipoComprobante', 'SerieComprobante', 'NumeroComprobante',
      'FechaOperacion', 'Glosa', 'Debe', 'Haber', 'Estado'
    ]
  },
  '010200': {
    nombre: 'Libro Caja y Bancos - Cuenta Corriente (Formato 1.2)',
    totalCampos: 15,
    campos: [
      'Periodo', 'CUO', 'CorrelativoAsiento', 'EntidadFinanciera', 'CuentaCorriente',
      'FechaOperacion', 'MedioPago', 'Glosa', 'TipoDocTercero', 'NumDocTercero',
      'RazonSocialTercero', 'NumeroTransaccion', 'Debe', 'Haber', 'Estado'
    ]
  }
};

export const ESPECIFICACION_COLUMNAS_SIRE: Record<string, { nombre: string; totalCampos: number; campos: string[] }> = {
  'SIRE_RCE_REEMPLAZO': {
    nombre: 'SIRE RCE - Reemplazo de Propuesta (Anexo 8)',
    totalCampos: 42,
    campos: [
      'RucEmisor', 'RazonSocialEmisor', 'TipoComprobante', 'Serie', 'Numero', 'NumeroFinal',
      'FechaEmision', 'FechaVencimiento', 'TipoDocProveedor', 'NumDocProveedor', 'RazonSocialProveedor',
      'BaseGravada1', 'Igv1', 'BaseGravada2', 'Igv2', 'BaseGravada3', 'Igv3', 'NoGravadas',
      'ISC', 'ICBPER', 'OtrosTributos', 'Total', 'Moneda', 'TipoCambio', 'FechaDocModificado',
      'TipoDocModificado', 'SerieDocModificado', 'AduanaModificado', 'NumeroDocModificado',
      'Detraccion', 'FechaDetraccion', 'NumeroDetraccion', 'Retencion', 'Clasificacion',
      'ContratoProyecto', 'Error1', 'Error2', 'Error3', 'Error4', 'MedioPago', 'Estado', 'CAR'
    ]
  },
  'SIRE_RVIE_REEMPLAZO': {
    nombre: 'SIRE RVIE - Reemplazo de Propuesta (Anexo 2/3)',
    totalCampos: 34,
    campos: [
      'RucEmisor', 'RazonSocialEmisor', 'TipoComprobante', 'Serie', 'Numero', 'NumeroFinal',
      'FechaEmision', 'FechaVencimiento', 'TipoDocCliente', 'NumDocCliente', 'RazonSocialCliente',
      'Exportacion', 'BaseGravada', 'DescuentoBase', 'IGV', 'DescuentoIgv', 'Exonerado', 'Inafecto',
      'ISC', 'BaseIvap', 'IVAP', 'ICBPER', 'OtrosTributos', 'Total', 'Moneda', 'TipoCambio',
      'FechaDocModificado', 'TipoDocModificado', 'SerieDocModificado', 'NumeroDocModificado',
      'Proyecto', 'TipoNota', 'Estado', 'CAR'
    ]
  },
  'SIRE_RCE_AJUSTE': {
    nombre: 'SIRE RCE - Ajustes Posteriores (Anexo 11)',
    totalCampos: 43,
    campos: [
      'PeriodoAfectado', 'CarOriginal', 'RucEmisor', 'RazonSocialEmisor', 'TipoComprobante',
      'Serie', 'Numero', 'NumeroFinal', 'FechaEmision', 'FechaVencimiento', 'TipoDocProveedor',
      'NumDocProveedor', 'RazonSocialProveedor', 'BaseGravada', 'IGV', 'Base2', 'Igv2', 'Base3', 'Igv3',
      'ISC', 'ICBPER', 'Otros', 'Total', 'Moneda', 'TipoCambio', 'FechaMod', 'TipoMod', 'SerieMod',
      'NumMod', 'Detraccion', 'FecDet', 'NumDet', 'Retencion', 'Bienes', 'Proyecto', 'Err1', 'Err2',
      'Err3', 'Err4', 'MedioPago', 'Estado', 'CAR', 'IndicadorAjuste'
    ]
  },
  'SIRE_RVIE_AJUSTE': {
    nombre: 'SIRE RVIE - Ajustes Posteriores (Anexo 4/5)',
    totalCampos: 35,
    campos: [
      'PeriodoAfectado', 'CarOriginal', 'RucEmisor', 'RazonSocialEmisor', 'TipoComprobante',
      'Serie', 'Numero', 'NumeroFinal', 'FechaEmision', 'FechaVencimiento', 'TipoDocCliente',
      'NumDocCliente', 'RazonSocialCliente', 'Exportacion', 'BaseGravada', 'DescuentoBase',
      'IGV', 'DescuentoIgv', 'Exonerado', 'Inafecto', 'ISC', 'BaseIvap', 'IVAP', 'ICBPER',
      'Otros', 'Total', 'Moneda', 'TipoCambio', 'FechaMod', 'TipoMod', 'SerieMod', 'NumMod',
      'Proyecto', 'Estado', 'CAR'
    ]
  }
};

export const archivoValidadorService = {
  /**
   * Identifica el tipo de libro o layout a partir del nombre del archivo oficial
   */
  detectarTipoLayout(nombreArchivo: string): string {
    const nom = nombreArchivo.toUpperCase();
    if (nom.includes('080400')) return 'SIRE_RCE_REEMPLAZO';
    if (nom.includes('140400')) return 'SIRE_RVIE_REEMPLAZO';
    if (nom.includes('080500')) return 'SIRE_RCE_AJUSTE';
    if (nom.includes('140500')) return 'SIRE_RVIE_AJUSTE';

    // PLE
    for (const cod of Object.keys(ESPECIFICACION_COLUMNAS_PLE)) {
      if (nom.includes(cod)) return cod;
    }

    return 'DESCONOCIDO';
  },

  /**
   * Lee y valida un archivo TXT plano de PLE o SIRE informando errores por línea y columna
   */
  validarArchivoTxt(
    contenidoTxt: string,
    tipoLayout?: string,
    nombreArchivo?: string
  ): ResultadoValidacionTxt {
    const layout = tipoLayout || (nombreArchivo ? this.detectarTipoLayout(nombreArchivo) : '080100');
    const spec = ESPECIFICACION_COLUMNAS_PLE[layout] || ESPECIFICACION_COLUMNAS_SIRE[layout];

    const errores: ErrorValidacionLinea[] = [];
    const advertencias: string[] = [];

    // Validar si el archivo es un mes sin movimiento (I = 0)
    const esMesSinMovimiento = nombreArchivo ? nombreArchivo.includes('001011.txt') || nombreArchivo.includes('000011.txt') : false;

    const lineas = contenidoTxt.split(/\r?\n/).filter(l => l.trim().length > 0);

    if (esMesSinMovimiento && lineas.length === 0) {
      return {
        esValido: true,
        tipoFormato: layout,
        nombreArchivo,
        totalLineas: 0,
        totalErrores: 0,
        totalAdvertencias: 0,
        errores: [],
        advertencias: ['Archivo PLE generado correctamente para mes sin movimiento (Indicador 0).'],
        resumenControl: { totalFilas: 0 }
      };
    }

    if (!spec) {
      return {
        esValido: false,
        tipoFormato: layout,
        nombreArchivo,
        totalLineas: lineas.length,
        totalErrores: 1,
        totalAdvertencias: 0,
        errores: [{
          linea: 1,
          columna: 1,
          nombreCampo: 'FORMATO_DESCONOCIDO',
          valor: layout,
          mensaje: `No se reconoce la especificación de columnas para el layout '${layout}'.`
        }],
        advertencias: [],
        resumenControl: { totalFilas: lineas.length }
      };
    }

    let sumaDebe = 0;
    let sumaHaber = 0;
    let sumaBase = 0;
    let sumaIgv = 0;
    let sumaTotal = 0;

    for (let i = 0; i < lineas.length; i++) {
      const numLinea = i + 1;
      const linea = lineas[i];

      // Omitir líneas de comentario
      if (linea.startsWith('--') || linea.startsWith('//')) {
        continue;
      }

      // 1. Debe terminar con pipe '|'
      if (!linea.endsWith('|')) {
        errores.push({
          linea: numLinea,
          columna: linea.length,
          nombreCampo: 'DELIMITADOR_FINAL',
          valor: linea.slice(-1),
          mensaje: `La línea ${numLinea} debe terminar con el delimitador pleca (|).`
        });
      }

      // Dividir columnas
      const cols = linea.split('|');
      if (linea.endsWith('|')) {
        cols.pop(); // Quitar elemento vacío final
      }

      // 2. Conteo exacto de columnas
      if (cols.length !== spec.totalCampos) {
        errores.push({
          linea: numLinea,
          columna: cols.length,
          nombreCampo: 'CONTEO_COLUMNAS',
          valor: `${cols.length} columnas`,
          mensaje: `La línea ${numLinea} contiene ${cols.length} columnas pero la especificación oficial de ${spec.nombre} exige exactamente ${spec.totalCampos} columnas.`
        });
      }

      // 3. Validar tipo de datos por columna
      for (let c = 0; c < Math.min(cols.length, spec.campos.length); c++) {
        const val = cols[c];
        const numCol = c + 1;
        const nombreCampo = spec.campos[c];

        // Fechas
        if (nombreCampo.toLowerCase().includes('fecha') && val.trim().length > 0) {
          const esFechaOk = /^\d{2}\/\d{2}\/\d{4}$/.test(val) || /^\d{4}-\d{2}-\d{2}$/.test(val);
          if (!esFechaOk) {
            errores.push({
              linea: numLinea,
              columna: numCol,
              nombreCampo,
              valor: val,
              mensaje: `Formato de fecha inválido en línea ${numLinea}, columna ${numCol} (${nombreCampo}): '${val}'. Debe ser DD/MM/AAAA.`
            });
          }
        }

        // Montos numéricos cuantitativos
        const esMonto = ['debe', 'haber', 'base', 'igv', 'total', 'importe', 'adquisicion', 'retencion', 'isc', 'icbper']
          .some(k => nombreCampo.toLowerCase().includes(k));

        if (esMonto && val.trim().length > 0) {
          const num = Number(val);
          if (isNaN(num)) {
            errores.push({
              linea: numLinea,
              columna: numCol,
              nombreCampo,
              valor: val,
              mensaje: `Valor numérico inválido en línea ${numLinea}, columna ${numCol} (${nombreCampo}): '${val}'.`
            });
          } else {
            // Sumas de control
            if (nombreCampo === 'Debe') sumaDebe += num;
            if (nombreCampo === 'Haber') sumaHaber += num;
            if (nombreCampo.includes('Base')) sumaBase += num;
            if (nombreCampo.includes('Igv') || nombreCampo.includes('IGV')) sumaIgv += num;
            if (nombreCampo.includes('Total') || nombreCampo.includes('ImporteTotal')) sumaTotal += num;
          }
        }
      }
    }

    return {
      esValido: errores.length === 0,
      tipoFormato: layout,
      nombreArchivo,
      totalLineas: lineas.length,
      totalErrores: errores.length,
      totalAdvertencias: advertencias.length,
      errores,
      advertencias,
      resumenControl: {
        totalFilas: lineas.length,
        sumaDebe: Number(sumaDebe.toFixed(2)),
        sumaHaber: Number(sumaHaber.toFixed(2)),
        sumaBase: Number(sumaBase.toFixed(2)),
        sumaIgv: Number(sumaIgv.toFixed(2)),
        sumaTotal: Number(sumaTotal.toFixed(2))
      }
    };
  }
};

