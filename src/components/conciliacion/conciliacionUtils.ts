import Decimal from 'decimal.js';

/**
 * Convierte un importe decimal (string o number) a centavos enteros exactos
 * sin errores de punto flotante IEEE-754.
 */
export function aCentavos(valor: string | number | null | undefined): number {
  if (valor === null || valor === undefined || valor === '') return 0;
  try {
    return new Decimal(valor).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  } catch {
    return 0;
  }
}

/**
 * Formatea una cantidad entera en centavos a moneda legible (S/ o US$).
 */
export function formatearCentavos(centavos: number, moneda = 'PEN'): string {
  const negativo = centavos < 0;
  const abs = Math.abs(Math.round(centavos));
  const entero = Math.floor(abs / 100);
  const decimales = String(abs % 100).padStart(2, '0');
  const enteroFormateado = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const simbolo = moneda === 'USD' ? 'US$' : 'S/';
  return `${negativo ? '-' : ''}${simbolo} ${enteroFormateado}.${decimales}`;
}

/**
 * Formatea un importe decimal (string) a moneda legible (S/ o US$).
 */
export function formatearMonedaExacta(valor: string | null | undefined, moneda = 'PEN'): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  try {
    const dec = new Decimal(valor);
    const fijo = dec.toFixed(2);
    const negativo = fijo.startsWith('-');
    const absoluto = negativo ? fijo.slice(1) : fijo;
    const [entero, decimales] = absoluto.split('.');
    const enteroFormateado = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const simbolo = moneda === 'USD' ? 'US$' : 'S/';
    return `${negativo ? '-' : ''}${simbolo} ${enteroFormateado}.${decimales}`;
  } catch {
    return '—';
  }
}
