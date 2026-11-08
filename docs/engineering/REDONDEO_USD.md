# Regla de Conversión y Redondeo en Moneda Extranjera (USD / PEN)

Este documento especifica la política oficial de redondeo y conversión multimoneda implementada en **ATLOB ERP** para cumplir con la normativa tributaria y contable peruana (SUNAT y PCGE).

## 1. Principio Fundamental de Redondeo
- **Algoritmo**: Redondeo aritmético estándar a dos decimales (*Half-Up*, es decir, mitad hacia arriba si el tercer decimal es $\ge 5$).
- **Prohibición de Truncamiento**: No se permite truncar decimales (`Math.floor` o cortes de cadena). Toda operación intermedia o final se redondea con precisión decimal mediante `decimal.js` en el servidor y función matemática estándar en la interfaz.

## 2. Conservación de la Suma de Líneas (Partida y Total)
Cuando una operación contable (asiento de voucher, factura con detalle de ítems, o preliquidación tributaria) contiene múltiples líneas expresadas en USD y se convierte a Soles (PEN):

1. **Conversión del Total General**:
   $$\text{Total}_{\text{PEN}} = \text{redondear2}(\text{Total}_{\text{USD}} \times \text{TC})$$

2. **Conversión Individual de Líneas**:
   Para cada línea $i$:
   $$\text{Línea}_{i,\text{PEN}} = \text{redondear2}(\text{Línea}_{i,\text{USD}} \times \text{TC})$$

3. **Discrepancia por Redondeo Distribuido**:
   $$\Delta = \text{Total}_{\text{PEN}} - \sum_{i=1}^n \text{Línea}_{i,\text{PEN}}$$

4. **Ajuste de Neutralidad**:
   Si $|\Delta| > 0$ (típicamente $\pm 0.01$ por efecto de centavos distribuidos), la diferencia $\Delta$ se asigna automáticamente a la línea con mayor importe absoluto. Esto garantiza:
   $$\sum_{i=1}^n \text{Línea}_{i,\text{PEN}} \equiv \text{Total}_{\text{PEN}}$$

## 3. Servicios y Pruebas
- Servidor: `server/services/redondeoUsdService.ts`
- Cliente: `src/utils/redondeoUsd.ts`
- Suite de pruebas automatizadas: `server/tests/test_bloque_f_hallazgos.ts`
