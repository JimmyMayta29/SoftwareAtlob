# Matriz de Validación Funcional — ATLOB ERP

**Versión:** 2.0.0 (Certificación Final sobre PostgreSQL 18.6 Real)  
**Fecha:** 14 de noviembre de 2026  
**Finalidad:** Certificación del comportamiento funcional, conciliación contable (diferencia S/ 0.00) y persistencia 100% en PostgreSQL real de todos los módulos operativos para el piloto interno de 1–2 usuarios en LAN.

---

## 1. Clasificación de Estado Funcional

- **APROBADO_PG:** Funcionalidad 100% conectada a PostgreSQL 18.6 real (`atlob_test` / `sistema_contable`), verificada con pruebas automatizadas (`EXIT=0`), conciliada al céntimo (S/ 0.00) y persistente tras reinicio en frío.
- **NO_ALCANCE_PILOTO:** Funcionalidad explícitamente deshabilitada y señalizada en interfaz/API por encontrarse fuera del alcance del piloto interno de 1–2 usuarios (sin costo de terceros).

---

## 2. Matriz de Módulos Operativos (100% Conectados a PostgreSQL Real)

| # | Módulo / Opción | Menú | Backend Principal | Persistencia | Diferencia Conciliación | Estado | Prueba Real Aprobada (`EXIT=0`) |
| :-: | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| 01 | Inicio de Sesión, JWT y MFA | Acceso | `authJwtService.ts` | PostgreSQL Real | N/A | **APROBADO_PG** | `test_pg_idor_negativo.ts` (Auth, RBAC, MFA, 0 fugas) |
| 02 | Gestión de Empresas y RLS | Archivo | `empresaRepository.ts` | PostgreSQL Real | N/A | **APROBADO_PG** | `test_pg_rls_planillas.ts` (64 tablas RLS + FORCE, 0 error 23514) |
| 03 | Períodos Contables | Archivo | `periodoService.ts` | PostgreSQL Real | N/A | **APROBADO_PG** | `test_pg_matriz_contable.ts` (Apertura, bloqueo e inmutabilidad) |
| 04 | Plan de Cuentas (PCGE 2019 Modificado) | Contabilidad | `pcgeService.ts` | PostgreSQL Real | S/ 0.00 | **APROBADO_PG** | `test_pg_fase_e_normativa_2026.ts` (Jerarquía 2..5 dígitos y destinos) |
| 05 | Subdiarios Oficiales (`00..11`) | Contabilidad | `subdiarioService.ts` | PostgreSQL Real | S/ 0.00 | **APROBADO_PG** | `test_pg_matriz_contable.ts` (12 subdiarios, 15 tipos contables) |
| 06 | Asientos, Vouchers y Destinos Automáticos | Contabilidad | `asientoService.ts`, `contabilizacionService.ts` | PostgreSQL Real | S/ 0.00 (`Debe == Haber`) | **APROBADO_PG** | `test_pg_matriz_contable.ts` y `test_pg_fase_e_normativa_2026.ts` |
| 07 | Registro de Compras (8.1 y 8.2) | Compras | `compraService.ts` | PostgreSQL Real | S/ 0.00 | **APROBADO_PG** | `test_pg_compra_escritorio.ts` y `test_pg_matriz_contable.ts` (28/28 escenarios) |
| 08 | Registro de Ventas e Ingresos (14.1) | Ventas | `ventaService.ts` | PostgreSQL Real | S/ 0.00 | **APROBADO_PG** | `test_pg_matriz_contable.ts` (11/11 escenarios, IGV 16%+IPM 2%=18%, NC/ND) |
| 09 | Cartera CxC / CxP | Tesorería | `tesoreriaService.ts` (`cuentas_por_cobrar` / `cuentas_por_pagar`) | PostgreSQL Real | S/ 0.00 | **APROBADO_PG** | `test_pg_fase_c_conciliacion.ts` (Provisión y amortización parcial/total en PG) |
| 10 | Caja, Bancos y Fondos Fijos | Tesorería | `tesoreriaService.ts`, `cajaChicaService.ts` | PostgreSQL Real | S/ 0.00 | **APROBADO_PG** | `test_pg_matriz_contable.ts` (6/6 cobranzas, 7/7 pagos, ITF 0.005%, caja chica) |
| 11 | Planillas de Remuneraciones | Planillas | `planillaService.ts` | PostgreSQL Real | S/ 0.00 | **APROBADO_PG** | `test_pg_matriz_contable.ts` (RMV S/ 1,130, EsSalud 9%, ONP 13%, AFP, 5ta) |
| 12 | Recibos por Honorarios (4ta Categoría) | Planillas | `honorariosService.ts` | PostgreSQL Real | S/ 0.00 | **APROBADO_PG** | `test_pg_fase_e_normativa_2026.ts` (Retención 8% > S/ 1,500 y suspensión) |
| 13 | Activos Fijos y Depreciación (7.1) | Activos | `activosFijosService.ts` | PostgreSQL Real | S/ 0.00 | **APROBADO_PG** | `test_pg_matriz_contable.ts` (Tasas SUNAT LIR y asientos 68 -> 39) |
| 14 | Kardex Valorizado Permanente (13.1) | Kardex | `kardexService.ts` | PostgreSQL Real | S/ 0.00 | **APROBADO_PG** | `test_pg_matriz_contable.ts` (Promedio Ponderado y PEPS en `movimientos_kardex`) |
| 15 | SIRE (RVIE y RCE con CAR 27 dígitos) | SIRE | `sireLayoutService.ts`, `conciliadorSireService.ts` | PostgreSQL Real | S/ 0.00 | **APROBADO_PG** | `test_pg_fase_e_normativa_2026.ts` (CAR 27 caracteres, RVIE 34/35 y RCE 42 campos) |
| 16 | Libros Electrónicos PLE (5.1, 5.2, 6.1, 8.1, 8.2, 14.1) | PLE | `pleExportService.ts`, `archivoValidadorService.ts` | PostgreSQL Real | S/ 0.00 | **APROBADO_PG** | `test_pg_fase_e_normativa_2026.ts` (`LE<RUC><AAAAMM00><LIBRO>001111.txt` y CRLF) |
| 17 | Liquidación Mensual PDT 621 y DJ Renta Anual | Tributos | `liquidacionIGVService.ts`, `djRentaAnualService.ts`, `detraccionService.ts` | PostgreSQL Real | S/ 0.00 | **APROBADO_PG** | `test_pg_fase_e_normativa_2026.ts` (IGV, arrastre crédito, MYPE 1%/1.5% y 10%/29.5%, RG 29.5%, SPOT) |
| 18 | Cierres Contables y Diferencia de Cambio | Cierres | `cierreAnualService.ts`, `diferenciaCambioService.ts` | PostgreSQL Real | S/ 0.00 | **APROBADO_PG** | `test_pg_fase_e_normativa_2026.ts` (Cierre Elemento 8: cuentas 80..89 -> 5911 y FASB 52) |
| 19 | Libro Diario, Mayor, Balance 10 Col. y EEFF | EE.FF. | `librosEEFFService.ts` | PostgreSQL Real | **S/ 0.00** | **APROBADO_PG** | `test_pg_fase_c_conciliacion.ts` (Cuadre exacto Diario = Mayor = Balance = ESF/ER) |
| 20 | Respaldos y Restauración Atómica por Empresa | Respaldos | `backupEmpresaService.ts`, `archivosEmpresa.ts` | PostgreSQL Real + ZIP AES-256-GCM | S/ 0.00 | **APROBADO_PG** | `test_pg_backup_b2.ts` (84 tablas, 60 exportables, SHA-256, 4/4 pruebas reales) |
| 21 | Operación Multiusuario y Sincronización LAN | Sistema | `sincronizacionService.ts` | PostgreSQL Real | S/ 0.00 | **APROBADO_PG** | `test_pg_fase_d_multiusuario.ts` (2 usuarios simultáneos, 0 colisiones, p95 < 100ms) |
| 22 | Auditoría Inmutable (Hash Chain) | Sistema | `auditoriaChainService.ts` | PostgreSQL Real | N/A | **APROBADO_PG** | `test_pg_rls_planillas.ts` (Trigger append-only bloquea UPDATE/DELETE) |

---

## 3. Funciones Fuera de Alcance del Piloto Interno (Deshabilitadas Expresamente)

| # | Función Fuera de Alcance | Estado en el Sistema | Alternativa Operativa Activa en el Piloto |
| :-: | :--- | :---: | :--- |
| F-01 | **Envío directo en vivo de CPE a OSE / SUNAT** (Facturación electrónica con certificado digital PFX en tiempo real) | **NO_ALCANCE_PILOTO** (Deshabilitado) | Registro de comprobantes emitidos, importación de XML/CDR y generación de libros SIRE/PLE listos para declaración. |
| F-02 | **Descarga automática directa desde servidores API REST SIRE SUNAT en producción** | **NO_ALCANCE_PILOTO** (Deshabilitado / Modo Manual y Simulado Controlado) | Carga e importación manual de propuestas TXT/ZIP descargadas de Clave SOL (`importarPropuestaManual`), conciliación automática y exportación de archivos de Reemplazo y Ajustes Posteriores con CAR de 27 caracteres. |
