# CATÁLOGO DE CUENTAS PCGE UTILIZADAS EN LOS GENERADORES DE ASIENTOS

**Sistema Contable - ATLOB ERP**  
**Fecha de Revisión:** 09/11/2026  
**Rama:** `fix/asiento-completo-revision`  
**Referencia Oficial:** Resolución CNC N° 002-2019-EF/30 (Plan Contable General Empresarial Modificado 2019, de aplicación obligatoria nacional).

---

## 1. Declaración de Integridad y Principio Rector de Fuente Oficial

> [!IMPORTANT]
> El archivo `src/data/pcgeAccounts.ts` es un catálogo de configuración interno del sistema y **NO constituye fuente normativa oficial**. Ninguna cuenta puede darse por validada argumentando únicamente que existe en dicho archivo.  
> Toda cuenta o subdivisionaria que no figure de manera expresa en el catálogo del PCGE Modificado 2019 aprobado por la Resolución CNC N° 002-2019-EF/30 se clasifica como **`SUPUESTO A VALIDAR`**, y corresponde a una subdivisionaria analítica o sugerida de uso potestativo de la empresa.

---

## 2. Inventario Completo de Cuentas por Módulo y Escenario

| Código PCGE | Denominación en `pcgeAccounts.ts` | Escenarios que la Utilizan | Fuente Oficial Verificada (Resolución CNC N° 002-2019-EF/30) | Estado Normativo |
| :--- | :--- | :--- | :--- | :--- |
| **1011** | Caja central | `ESC-COB-3.02` (Cobros en efectivo) | Cuadro de Cuentas, Elemento 1, Subcuenta 101 Caja, divisionaria 1011 (Pág. 52) | `PROBADO CON MOTOR EN MEMORIA` |
| **1021** | Fondos fijos | `ESC-COB-3.06`, `ESC-PAG-4.03`, `ESC-PAG-4.07` (Caja chica) | Cuadro de Cuentas, Elemento 1, Subcuenta 102 Fondos fijos, divisionaria 1021 (Pág. 52) | `PROBADO CON MOTOR EN MEMORIA` |
| **1031** | Cheques por cobrar | `ESC-COB-3.04` (Cheques en cartera) | Cuadro de Cuentas, Elemento 1, Subcuenta 103 Efectivo en tránsito, divisionaria 1031 (Pág. 52) | `SUPUESTO A VALIDAR` |
| **1041** / **10411** | Cuentas corrientes operativas | `ESC-COB-3.01`, `ESC-PAG-4.01`, `ESC-PAG-4.05`, `ESC-PAG-4.06`, `ESC-SPOT-5.01`, `ESC-HON-6.03` | Cuadro de Cuentas, Elemento 1, Subcuenta 104 Cuentas corrientes en instituciones financieras, divisionaria 1041 (Pág. 52) | `PROBADO CON MOTOR EN MEMORIA` |
| **10412** | Cuentas corrientes en moneda extranjera | `ESC-COB-3.03`, `ESC-PAG-4.04`, `ESC-VAR-8.02` (Bancos USD) | Subdivisionaria sugerida bajo divisionaria oficial 1041 Cuentas corrientes operativas (Pág. 52) | `SUPUESTO A VALIDAR` |
| **1071** | Fondos sujetos a restricción (SPOT) | `ESC-SPOT-5.02`, `ESC-SPOT-5.03`, `ESC-SPOT-5.04` (Banco Nación) | Cuadro de Cuentas, Elemento 1, Subcuenta 107 Fondos sujetos a restricción, divisionaria 1071 (Pág. 52) | `PROBADO CON MOTOR EN MEMORIA` |
| **1212** | Emitidas en cartera | `ESC-V-2.01`, `ESC-V-2.02`, `ESC-V-2.10`, `ESC-COB-3.01`, `ESC-COB-3.02` | Cuadro de Cuentas, Elemento 1, Subcuenta 121 Facturas, boletas y otros comprobantes por cobrar, divisionaria 1212 (Pág. 58) | `PROBADO CON MOTOR EN MEMORIA` |
| **12122** | Facturas emitidas - SPOT por cobrar | `ESC-V-2.07` (SPOT clientes retenido en ventas) | **No existe a 5 dígitos en el PCGE 2019 oficial**. Subdivisionaria analítica interna creada para control de detracciones de clientes. | `SUPUESTO A VALIDAR` |
| **1214** | En cobranza / comprobantes modificados | `ESC-V-2.11` (Notas de crédito ventas) | Cuadro de Cuentas, Elemento 1, Subcuenta 121, divisionaria 1214 (Pág. 58) | `PROBADO CON MOTOR EN MEMORIA` |
| **122** | Anticipos de clientes | `ESC-COB-3.05` (Anticipos cobrados) | Cuadro de Cuentas, Elemento 1, Subcuenta 122 Anticipos de clientes (Pág. 58) | `PROBADO CON MOTOR EN MEMORIA` |
| **20111** | Costo de mercaderías manufacturadas | `ESC-C-1.01`, `ESC-C-1.14`, `ESC-C-1.19`, `ESC-C-1.21`, `ESC-V-2.03` | Cuadro de Cuentas, Elemento 2, Cuenta 20 Mercaderías, subcuenta 2011 Mercaderías manufacturadas, divisionaria 20111 Costo (Pág. 72) | `PROBADO CON MOTOR EN MEMORIA` |
| **33411** | Vehículos motorizados - Costo | `ESC-VAR-8.01` (Activos fijos transporte) | Cuadro de Cuentas, Elemento 3, Subcuenta 334 Unidades de transporte, divisionaria 33411 (Pág. 98) | `PROBADO CON MOTOR EN MEMORIA` |
| **33611** | Equipos de cómputo - Costo | `ESC-VAR-8.01` (Activos fijos cómputo) | Cuadro de Cuentas, Elemento 3, Subcuenta 336 Equipos diversos, divisionaria 33611 (Pág. 98) | `PROBADO CON MOTOR EN MEMORIA` |
| **39131** / **3952** | Depreciación acumulada PPE | `ESC-VAR-8.01` (Provisión depreciación) | Cuadro de Cuentas, Elemento 3, Subcuenta 395 Depreciación acumulada de propiedad, planta y equipo (Pág. 116) | `PROBADO CON MOTOR EN MEMORIA` |
| **40111** | IGV – Cuenta propia | `ESC-C-1.01`, `ESC-C-1.19`, `ESC-V-2.01`, `ESC-PAG-4.05` | Cuadro de Cuentas, Elemento 4, Subcuenta 401 Gobierno central, divisionaria 40111 IGV - Cuenta propia (Pág. 120) | `PROBADO CON MOTOR EN MEMORIA` |
| **40112** | IGV – Servicios prestados por no domiciliados | `ESC-C-1.10` (Utilización servicios exterior) | Cuadro de Cuentas, Elemento 4, Subcuenta 4011, divisionaria 40112 (Pág. 120). *Nota: En versiones anteriores se usó erróneamente 40115*. | `PROBADO CON MOTOR EN MEMORIA` |
| **40113** | IGV – Régimen de percepciones | `ESC-C-1.25`, `ESC-V-2.08` | Cuadro de Cuentas, Elemento 4, Subcuenta 4011, divisionaria 40113 (Pág. 120) | `PROBADO CON MOTOR EN MEMORIA` |
| **40114** | IGV – Régimen de retenciones | `ESC-C-1.24`, `ESC-PAG-4.02` | Cuadro de Cuentas, Elemento 4, Subcuenta 4011, divisionaria 40114 (Pág. 120) | `PROBADO CON MOTOR EN MEMORIA` |
| **40115** | IGV – Importaciones | `ESC-C-1.09` (DUA Aduanas) | Cuadro de Cuentas, Elemento 4, Subcuenta 4011, divisionaria 40115 IGV - Importaciones (Pág. 120). | `PROBADO CON MOTOR EN MEMORIA` |
| **4012** | Impuesto selectivo al consumo | `ESC-V-2.09` (ISC ventas por pagar) | Cuadro de Cuentas, Elemento 4, Subcuenta 4012 Impuesto selectivo al consumo (Pág. 120) | `PROBADO CON MOTOR EN MEMORIA` |
| **40171** | Renta de tercera categoría | `ESC-VAR-8.04` (DJ anual y pagos a cuenta) | Cuadro de Cuentas, Elemento 4, Subcuenta 4017 Impuesto a la renta, divisionaria 40171 Renta de tercera categoría (Pág. 120) | `PROBADO CON MOTOR EN MEMORIA` |
| **40172** | Renta de cuarta categoría | `ESC-HON-6.01` (Retención honorarios 8%) | Cuadro de Cuentas, Elemento 4, Subcuenta 4017, divisionaria 40172 Renta de cuarta categoría (Pág. 120) | `PROBADO CON MOTOR EN MEMORIA` |
| **40173** | Renta de quinta categoría | `ESC-PLA-7.01` (Retención sueldos dependientes) | Cuadro de Cuentas, Elemento 4, Subcuenta 4017, divisionaria 40173 Renta de quinta categoría (Pág. 120). *Nota: No domiciliados es 40174 o 40175*. | `PROBADO CON MOTOR EN MEMORIA` |
| **40174** / **40175** | Renta de no domiciliados | `ESC-C-1.10` (Retención servicios exterior) | Cuadro de Cuentas, Elemento 4, Subcuenta 4017, divisionarias 40174/40175 Renta de no domiciliados (Pág. 120) | `PROBADO CON MOTOR EN MEMORIA` |
| **401891** | ICBPER por pagar | `ESC-V-2.09` (Impuesto a las bolsas plásticas) | **No existe a 6 dígitos en el PCGE 2019 oficial**. Subdivisionaria analítica interna sugerida bajo 40189 Otros tributos (Pág. 120) | `SUPUESTO A VALIDAR` |
| **4031** | EsSalud por pagar | `ESC-PLA-7.01`, `ESC-PLA-7.04`, `ESC-PAG-4.05` | Cuadro de Cuentas, Elemento 4, Subcuenta 403 Instituciones públicas, divisionaria 4031 EsSalud (Pág. 121) | `PROBADO CON MOTOR EN MEMORIA` |
| **4032** | ONP por pagar | `ESC-PLA-7.01`, `ESC-PAG-4.05` | Cuadro de Cuentas, Elemento 4, Subcuenta 403, divisionaria 4032 ONP (Pág. 121) | `PROBADO CON MOTOR EN MEMORIA` |
| **407** | Administradoras de fondos de pensiones (AFP) | `ESC-PLA-7.01` | Cuadro de Cuentas, Elemento 4, Subcuenta 407 Administradoras de fondos de pensiones (Pág. 121) | `PROBADO CON MOTOR EN MEMORIA` |
| **4111** | Remuneraciones por pagar | `ESC-PLA-7.01`, `ESC-PLA-7.05` | Cuadro de Cuentas, Elemento 4, Subcuenta 411 Remuneraciones por pagar, divisionaria 4111 Sueldos y salarios (Pág. 124) | `PROBADO CON MOTOR EN MEMORIA` |
| **4114** | Gratificaciones por pagar | `ESC-PLA-7.02`, `ESC-PLA-7.05` | Cuadro de Cuentas, Elemento 4, Subcuenta 411, divisionaria 4114 Gratificaciones por pagar (Pág. 124) | `PROBADO CON MOTOR EN MEMORIA` |
| **4115** | Vacaciones por pagar | `ESC-PLA-7.04`, `ESC-PLA-7.05` | Cuadro de Cuentas, Elemento 4, Subcuenta 411, divisionaria 4115 Vacaciones por pagar (Pág. 124) | `PROBADO CON MOTOR EN MEMORIA` |
| **4151** | CTS por pagar | `ESC-PLA-7.03`, `ESC-PLA-7.05` | Cuadro de Cuentas, Elemento 4, Subcuenta 415 Compensación por tiempo de servicios, divisionaria 4151 (Pág. 124) | `PROBADO CON MOTOR EN MEMORIA` |
| **4212** | Facturas emitidas por pagar | `ESC-C-1.01`, `ESC-C-1.02`, `ESC-PAG-4.01`, `ESC-PAG-4.04` | Cuadro de Cuentas, Elemento 4, Subcuenta 421 Facturas, boletas y otros comprobantes por pagar, divisionaria 4212 (Pág. 126) | `PROBADO CON MOTOR EN MEMORIA` |
| **4213** | Detracciones SPOT Banco de la Nación | `ESC-C-1.23`, `ESC-SPOT-5.01` | **No existe en el PCGE 2019 oficial como código de 4 dígitos**. Subdivisionaria analítica interna sugerida de uso generalizado en el Perú. | `SUPUESTO A VALIDAR` |
| **422** | Anticipos a proveedores | `ESC-C-1.12` | Cuadro de Cuentas, Elemento 4, Subcuenta 422 Anticipos a proveedores (Pág. 126) | `PROBADO CON MOTOR EN MEMORIA` |
| **424** | Honorarios por pagar | `ESC-HON-6.01`, `ESC-HON-6.02`, `ESC-HON-6.03` | Cuadro de Cuentas, Elemento 4, Subcuenta 424 Honorarios por pagar (Pág. 126) | `PROBADO CON MOTOR EN MEMORIA` |
| **60111** | Mercaderías manufacturadas - Costo | `ESC-C-1.01`, `ESC-C-1.14`, `ESC-C-1.19`, `ESC-C-1.21`, `ESC-C-1.22` | Cuadro de Cuentas, Elemento 6, Subcuenta 601 Mercaderías, divisionaria 6011 Mercaderías manufacturadas, subdivisionaria 60111 Costo (Pág. 162) | `PROBADO CON MOTOR EN MEMORIA` |
| **60112** | Mercaderías manufacturadas - Valor razonable | Uso específico para adquisiciones medidas a valor razonable (NIIF 13) | Cuadro de Cuentas, Elemento 6, Subcuenta 6011, subdivisionaria 60112 Valor razonable (Pág. 162). *No debe confundirse con 'Destino 2'*. | `SUPUESTO A VALIDAR` |
| **6111** | Mercaderías manufacturadas | `ESC-C-1.01`, `ESC-C-1.19`, `ESC-VAR-8.03`, `ESC-VAR-8.04` | Cuadro de Cuentas, Elemento 6, Subcuenta 611 Mercaderías, divisionaria 6111 Mercaderías manufacturadas (Pág. 166) | `PROBADO CON MOTOR EN MEMORIA` |
| **6211** | Sueldos y salarios | `ESC-PLA-7.01` | Cuadro de Cuentas, Elemento 6, Subcuenta 621 Remuneraciones, divisionaria 6211 Sueldos y salarios (Pág. 168) | `PROBADO CON MOTOR EN MEMORIA` |
| **6214** | Gratificaciones | `ESC-PLA-7.02`, `ESC-PLA-7.05` | Cuadro de Cuentas, Elemento 6, Subcuenta 621, divisionaria 6214 Gratificaciones (Pág. 168) | `PROBADO CON MOTOR EN MEMORIA` |
| **6215** | Vacaciones | `ESC-PLA-7.04`, `ESC-PLA-7.05` | Cuadro de Cuentas, Elemento 6, Subcuenta 621, divisionaria 6215 Vacaciones (Pág. 168) | `PROBADO CON MOTOR EN MEMORIA` |
| **622** / **6221** | Bonificación extraordinaria Ley 30334 | `ESC-PLA-7.02`, `ESC-PLA-7.05` | Cuadro de Cuentas, Elemento 6, Subcuenta 622 Otras remuneraciones (Pág. 168) | `PROBADO CON MOTOR EN MEMORIA` |
| **6271** | Régimen de prestaciones de salud (EsSalud) | `ESC-PLA-7.01`, `ESC-PLA-7.04`, `ESC-PLA-7.05` | Cuadro de Cuentas, Elemento 6, Subcuenta 627 Seguridad, previsión social y otras contribuciones, divisionaria 6271 (Pág. 168) | `PROBADO CON MOTOR EN MEMORIA` |
| **6291** | Compensación por tiempo de servicios | `ESC-PLA-7.03`, `ESC-PLA-7.05` | Cuadro de Cuentas, Elemento 6, Subcuenta 629 Beneficios sociales de los trabajadores, divisionaria 6291 (Pág. 168) | `PROBADO CON MOTOR EN MEMORIA` |
| **63211** | Asesoría y consultoría profesional | `ESC-HON-6.01`, `ESC-HON-6.02`, `ESC-C-1.10` | Cuadro de Cuentas, Elemento 6, Subcuenta 632 Asesoría y consultoría, divisionaria 6321 (Pág. 172) | `PROBADO CON MOTOR EN MEMORIA` |
| **64111** | IGV - Gasto / Costo no admitido por prorrata | `ESC-C-1.20` (Prorrata crédito fiscal Art. 23 LIGV) | Cuadro de Cuentas, Elemento 6, Subcuenta 641 Gobierno nacional, divisionaria 6411 Impuesto general a las ventas (Pág. 176) | `PROBADO CON MOTOR EN MEMORIA` |
| **6412** | Impuesto selectivo al consumo (Gasto) | `ESC-C-1.14` (Tratamiento GASTO) | Subdivisionaria sugerida bajo subcuenta 641 Gobierno nacional. En PCGE oficial corresponde a 64112 ISC. | `SUPUESTO A VALIDAR` |
| **6413** | ICBPER (Gasto) | `ESC-C-1.15` (Tratamiento GASTO) | Subdivisionaria analítica interna no oficial para gasto de bolsas plásticas. | `SUPUESTO A VALIDAR` |
| **6491** | Otros tributos (Gasto) | `ESC-C-1.16` (Tratamiento GASTO) | Subdivisionaria analítica interna bajo subcuenta oficial 649 Otros tributos (Pág. 176) | `SUPUESTO A VALIDAR` |
| **676** | Pérdida por diferencia de cambio | `ESC-COB-3.03`, `ESC-PAG-4.04`, `ESC-VAR-8.02` | Cuadro de Cuentas, Elemento 6, Subcuenta 676 Diferencia de cambio negativa (Pág. 184) | `PROBADO CON MOTOR EN MEMORIA` |
| **6814** / **68141** | Depreciación de PPE - Costo | `ESC-VAR-8.01` (Depreciación mensual) | Cuadro de Cuentas, Elemento 6, Subcuenta 681 Depreciación de propiedad, planta y equipo, divisionaria 6814 (Pág. 188) | `PROBADO CON MOTOR EN MEMORIA` |
| **69111** | Mercaderías - Exportación - Terceros (Costo ventas) | Exportaciones en Kardex permanente | Cuadro de Cuentas, Elemento 6, Subcuenta 691 Mercaderías, divisionaria 6911 Exportación, subdivisionaria 69111 Terceros (Pág. 192) | `PROBADO CON MOTOR EN MEMORIA` |
| **69121** | Mercaderías - Venta local - Terceros (Costo ventas) | `ESC-V-2.03`, `ESC-VAR-8.03` (Costo de ventas local) | Cuadro de Cuentas, Elemento 6, Subcuenta 691 Mercaderías, divisionaria 6912 Venta local, subdivisionaria 69121 Terceros (Pág. 192) | `PROBADO CON MOTOR EN MEMORIA` |
| **70111** | Mercaderías - Exportación - Terceros (Venta) | `ESC-V-2.06` (Facturación de exportación) | Cuadro de Cuentas, Elemento 7, Subcuenta 701 Mercaderías, divisionaria 7011 Exportación, subdivisionaria 70111 Terceros (Pág. 196) | `PROBADO CON MOTOR EN MEMORIA` |
| **70121** | Mercaderías - Venta local - Terceros (Venta) | `ESC-V-2.01`, `ESC-V-2.02`, `ESC-V-2.10`, `ESC-V-2.11` | Cuadro de Cuentas, Elemento 7, Subcuenta 701 Mercaderías, divisionaria 7012 Venta local, subdivisionaria 70121 Terceros (Pág. 196) | `PROBADO CON MOTOR EN MEMORIA` |
| **776** | Ganancia por diferencia de cambio | `ESC-COB-3.03`, `ESC-PAG-4.04`, `ESC-VAR-8.02` | Cuadro de Cuentas, Elemento 7, Subcuenta 776 Diferencia de cambio positiva (Pág. 210) | `PROBADO CON MOTOR EN MEMORIA` |
| **791** | Cargas imputables a cuentas de costos y gastos | `ESC-C-1.27`, `ESC-HON-6.01`, `ESC-PLA-7.01`, `ESC-VAR-8.01` | Cuadro de Cuentas, Elemento 7, Cuenta 79 Cargas imputables a cuentas de costos y gastos, subcuenta 791 (Pág. 214) | `PROBADO CON MOTOR EN MEMORIA` |
| **801** a **891** | Cuentas de Saldos Intermediarios de Gestión | `ESC-VAR-8.04` (Cierre contable anual) | Cuadro de Cuentas, Elemento 8 Saldos intermediarios de gestión y determinación del resultado del ejercicio (Págs. 218-228) | `PROBADO CON MOTOR EN MEMORIA` |
| **941** | Gastos de administración | `ESC-C-1.27`, `ESC-HON-6.01`, `ESC-PLA-7.01`, `ESC-VAR-8.01` | Elemento 9 Cuentas de orden y de gestión interna (Pág. 230). Asignación por función potestativa de la empresa. | `PROBADO CON MOTOR EN MEMORIA` |
| **951** | Gastos de ventas | `ESC-C-1.27`, `ESC-PLA-7.01`, `ESC-VAR-8.01` | Elemento 9 Cuentas de gestión interna (Pág. 230). Asignación por función potestativa de la empresa. | `PROBADO CON MOTOR EN MEMORIA` |

---

## 3. Resolución Formal de Contradicciones Detectadas

### 3.1 Cuenta 40115: ¿IGV No Domiciliados o IGV Importaciones?
* **Texto Oficial PCGE 2019 (Pág. 120):** La divisionaria oficial es **`40115 IGV – Importaciones`**. Acumula el IGV liquidado en aduanas mediante DUA/DAM.
* **Corrección Aplicada:** En la utilización de servicios prestados por no domiciliados no se debe utilizar la 40115. El PCGE 2019 establece para tal fin la divisionaria **`40112 IGV – Servicios prestados por no domiciliados`**. La nomenclatura del sistema queda unificada bajo el estándar oficial del MEF.

### 3.2 Cuenta 40173: ¿Renta de 5ta Categoría o Retenciones a No Domiciliados?
* **Texto Oficial PCGE 2019 (Pág. 120):** La divisionaria oficial es **`40173 Renta de quinta categoría`** (retenciones a trabajadores en planilla dependiente).
* **Corrección Aplicada:** Las retenciones del Impuesto a la Renta a sujetos no domiciliados (servicios técnicos, regalías, etc.) corresponden en el PCGE 2019 a las divisionarias **`40174 Renta de no domiciliados`** o **`40175 Otras retenciones`**. Se elimina cualquier uso de la 40173 para proveedores del exterior.

### 3.3 Cuentas 60111 vs 60112: Costo vs Valor Razonable
* **Texto Oficial PCGE 2019 (Pág. 162):**
  * `60111`: Mercaderías manufacturadas - **Costo**.
  * `60112`: Mercaderías manufacturadas - **Valor razonable** (aplicación de la NIIF 13 o NIIF 9 cuando la medición posterior se efectúa a valor razonable con cambios en resultados).
* **Corrección Aplicada:** Se aclara de forma terminante que la diferencia entre `60111` y `60112` **no responde a Destino 1 vs Destino 2 del IGV**. Tanto las compras destinadas a operaciones gravadas (Destino 1) como las destinadas a operaciones comunes (Destino 2) adquiridas a costo histórico ingresan por la cuenta **`60111`**. La distinción tributaria de destino se gestiona a nivel de las casillas del RCE/SIRE y la columna `tipoAdquisicion`, no alterando la cuenta contable de compras de existencias al costo.

### 3.4 Cuentas 70111 vs 70121: Exportación vs Venta Local
* **Texto Oficial PCGE 2019 (Pág. 196):**
  * `7011`: Mercaderías - **Exportación** (`70111 Terceros`, `70112 Relacionadas`).
  * `7012`: Mercaderías - **Venta local** (`70121 Terceros`, `70122 Relacionadas`).
* **Corrección Aplicada:** En la propuesta del módulo de Ventas, la facturación comercial ordinaria a clientes nacionales debe acreditar la cuenta **`70121 Mercaderías - Venta local - Terceros`**. La cuenta **`70111`** queda reservada con exclusividad para operaciones de exportación definitiva con comprobante Tipo 01 serie E001 y DUA de exportación.

### 3.5 Naturaleza de las Cuentas 4213, 12122, 401891, 6412, 6413, 6491
* **Diagnóstico Técnico:**
  1. `4213` (Detracciones SPOT por pagar): En el PCGE oficial la divisionaria es `4212 Emitidas`. El código `4213` es una subdivisión de control financiero adoptada ampliamente por la práctica profesional en el Perú para segregar la deuda tributaria ante el Banco de la Nación.
  2. `12122` (SPOT por cobrar a clientes): En el PCGE oficial la divisionaria es `1212 Emitidas en cartera`. El código `12122` es una subdivisionaria interna a 5 dígitos para reflejar el depósito que el cliente debe efectuar en la cuenta corriente del BN de la empresa.
  3. `401891` (ICBPER ventas por pagar): En el PCGE oficial la cuenta es `4018 Otros impuestos y tasas`, divisionaria `40189 Otros`. `401891` es una subdivisionaria libre para el impuesto de la Ley 30884.
  4. `6412` (ISC gasto), `6413` (ICBPER gasto), `6491` (Otros tributos gasto): En el PCGE oficial, el ISC tributo nacional se ubica en `64112`, mientras que `6413` y `6491` son aperturas analíticas internas cuando se opta por el tratamiento contable de gasto frente al de costo.
* **Conclusión y Calificación:** Todas estas cuentas se clasifican y mantienen formalmente bajo la etiqueta **`SUPUESTO A VALIDAR`**. El software debe tratarlas como sugerencias preconfiguradas y permitir su modificación mediante reglas contables por empresa.

---

## 4. Propuesta de Arquitectura: Tabla de Mapeo Contable Configurable por Empresa (`reglas_contabilizacion`)

Para garantizar que el sistema cumpla con las Normas Internacionales de Información Financiera (NIIF) y permita al contador responsable adaptar las cuentas a la política contable específica de su estudio o empresa sin requerir cambios en el código fuente, se define la siguiente arquitectura:

### 4.1 Modelo de Datos en Base de Datos por Empresa

```sql
-- Tabla existente en esquema de empresa: reglas_contabilizacion
CREATE TABLE IF NOT EXISTS reglas_contabilizacion (
    id VARCHAR(36) PRIMARY KEY,
    empresa_id VARCHAR(36) NOT NULL,
    modulo VARCHAR(32) NOT NULL, -- 'COMPRAS', 'VENTAS', 'TESORERIA', 'PLANILLAS', 'HONORARIOS', 'AJUSTES'
    clave_operacion VARCHAR(64) NOT NULL, -- ej. 'COMPRA_EXISTENCIA_COSTO', 'SPOT_PROVEEDOR_BN', 'VENTA_LOCAL_MERCADERIA'
    cuenta_debe_default VARCHAR(10) NOT NULL,
    cuenta_haber_default VARCHAR(10) NOT NULL,
    cuenta_destino_debe VARCHAR(10),
    cuenta_destino_haber VARCHAR(10),
    descripcion VARCHAR(255) NOT NULL,
    es_oficial_pcge BOOLEAN NOT NULL DEFAULT TRUE,
    estado_clasificacion VARCHAR(32) NOT NULL DEFAULT 'SUPUESTO_A_VALIDAR', -- 'PROBADO', 'SUPUESTO_A_VALIDAR'
    modificado_por VARCHAR(64),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_regla_empresa_clave UNIQUE (empresa_id, clave_operacion)
);
```

### 4.2 Comportamiento del Motor y de la Interfaz de Usuario
1. **Carga Inicial Asistida:** Al crear una nueva empresa o migrar un ejercicio, el sistema siembra las reglas predeterminadas documentadas en este catálogo. Aquellas que corresponden a subdivisionarias no normadas (como `4213`, `12122`, `401891`, `6412`) se marcan en la interfaz con una insignia visible de **"Supuesto a Validar - Sugerido"**.
2. **Edición Segura en UI:** Desde la vista de `ReglasContabilizacionView.tsx`, el contador puede abrir el catálogo de cuentas de la empresa y seleccionar la cuenta de su preferencia (ej. cambiar `4213` por `4212-SPOT` o su cuenta analítica específica) con validación inmediata de existencia en el plan contable de la empresa.
3. **Persistencia de Auditoría:** Toda modificación registra el usuario que autorizó el cambio contable y la fecha en la cadena de auditoría inmutable del sistema.

