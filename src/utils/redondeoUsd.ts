export interface LineaMonedaUI {
  id?: string;
  linea?: number;
  importe: number;
  [key: string]: any;
}

export function redondear2Decimales(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export function convertirMontoUsd(monto: number, tipoCambio: number, direccion: 'USD_A_PEN' | 'PEN_A_USD' = 'USD_A_PEN'): number {
  if (tipoCambio <= 0) return 0;
  const raw = direccion === 'USD_A_PEN' ? monto * tipoCambio : monto / tipoCambio;
  return redondear2Decimales(raw);
}

export function convertirLineasConConservacionUI(
  lineas: LineaMonedaUI[],
  totalOrigen: number,
  tipoCambio: number,
  direccion: 'USD_A_PEN' | 'PEN_A_USD' = 'USD_A_PEN'
) {
  if (tipoCambio <= 0) {
    return {
      totalConvertido: 0,
      lineas: lineas.map((l) => ({ ...l, importeConvertido: 0 })),
      sumaLineas: 0
    };
  }

  const totalConvertido = convertirMontoUsd(totalOrigen, tipoCambio, direccion);
  const convertidas = lineas.map((l) => ({
    ...l,
    importeConvertido: convertirMontoUsd(l.importe, tipoCambio, direccion)
  }));

  const suma = convertidas.reduce((acc, l) => acc + l.importeConvertido, 0);
  const sumaRedondeada = redondear2Decimales(suma);
  const diferencia = redondear2Decimales(totalConvertido - sumaRedondeada);

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
    convertidas[maxIdx].importeConvertido = redondear2Decimales(convertidas[maxIdx].importeConvertido + diferencia);
  }

  return {
    totalConvertido,
    lineas: convertidas,
    sumaLineas: totalConvertido
  };
}
