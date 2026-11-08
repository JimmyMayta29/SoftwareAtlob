import Decimal from 'decimal.js';

export interface LineaMoneda {
  id?: string;
  linea?: number;
  importe: number;
  [key: string]: any;
}

export interface ResultadoConversionLineas {
  tipoCambio: number;
  totalOrigen: number;
  totalConvertido: number;
  sumaLineasConvertidas: number;
  diferenciaAjustada: number;
  lineas: Array<LineaMoneda & { importeConvertido: number }>;
}

/**
 * Servicio de Redondeo y Conversión Multimoneda (USD / PEN).
 * Aplica redondeo estándar bancario/contable (mitad hacia arriba a 2 decimales) sin truncar.
 * Garantiza estrictamente que la suma de las líneas convertidas sea idéntica al total general convertido.
 */
export const redondeoUsdService = {
  /**
   * Redondeo estándar aritmético a 2 decimales (Half-Up, sin truncamiento)
   */
  redondear2(valor: number): number {
    return new Decimal(valor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  },

  /**
   * Convierte un monto unitario de USD a PEN o viceversa con redondeo estándar
   */
  convertirMonto(monto: number, tipoCambio: number, direccion: 'USD_A_PEN' | 'PEN_A_USD' = 'USD_A_PEN'): number {
    if (tipoCambio <= 0) throw new Error('El tipo de cambio debe ser mayor a cero.');
    const dMonto = new Decimal(monto);
    const dTc = new Decimal(tipoCambio);
    const resultado = direccion === 'USD_A_PEN' ? dMonto.times(dTc) : dMonto.dividedBy(dTc);
    return resultado.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  },

  /**
   * Convierte un conjunto de líneas y su total asegurando que la suma de las líneas
   * coincida exactamente con el total convertido (conservación de la partida y total).
   */
  convertirLineasConConservacion(
    lineas: LineaMoneda[],
    totalOrigen: number,
    tipoCambio: number,
    direccion: 'USD_A_PEN' | 'PEN_A_USD' = 'USD_A_PEN'
  ): ResultadoConversionLineas {
    if (tipoCambio <= 0) throw new Error('El tipo de cambio debe ser mayor a cero.');

    const totalConvertido = this.convertirMonto(totalOrigen, tipoCambio, direccion);

    if (lineas.length === 0) {
      return {
        tipoCambio,
        totalOrigen,
        totalConvertido,
        sumaLineasConvertidas: 0,
        diferenciaAjustada: 0,
        lineas: []
      };
    }

    // Paso 1: Convertir individualmente cada línea con redondeo estándar a 2 decimales
    const convertidas = lineas.map((l) => ({
      ...l,
      importeConvertido: this.convertirMonto(l.importe, tipoCambio, direccion)
    }));

    // Paso 2: Calcular la suma de las líneas convertidas con precisión exacta
    const sumaConvertidasDec = convertidas.reduce(
      (acc, l) => acc.plus(new Decimal(l.importeConvertido)),
      new Decimal(0)
    );
    const sumaConvertidas = sumaConvertidasDec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

    // Paso 3: Determinar discrepancia por redondeo individual (típicamente +/- 0.01)
    const diferenciaDec = new Decimal(totalConvertido).minus(sumaConvertidasDec);
    const diferencia = diferenciaDec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

    // Paso 4: Si existe diferencia, ajustar en la línea de mayor valor absoluto para no distorsionar proporciones
    if (diferencia !== 0 && convertidas.length > 0) {
      let maxIdx = 0;
      let maxVal = Math.abs(convertidas[0].importeConvertido);
      for (let i = 1; i < convertidas.length; i++) {
        const val = Math.abs(convertidas[i].importeConvertido);
        if (val > maxVal) {
          maxVal = val;
          maxIdx = i;
        }
      }

      const ajustado = new Decimal(convertidas[maxIdx].importeConvertido)
        .plus(diferenciaDec)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toNumber();

      convertidas[maxIdx].importeConvertido = ajustado;
    }

    const sumaFinal = convertidas.reduce((acc, l) => acc + l.importeConvertido, 0);
    const sumaFinalRedondeada = this.redondear2(sumaFinal);

    return {
      tipoCambio,
      totalOrigen,
      totalConvertido,
      sumaLineasConvertidas: sumaFinalRedondeada,
      diferenciaAjustada: diferencia,
      lineas: convertidas
    };
  }
};
