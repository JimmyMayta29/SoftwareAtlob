# Matriz de Validación Funcional — ATLOB ERP

**Fecha:** 13 de noviembre de 2026  
**Finalidad:** Seguimiento del comportamiento funcional y de persistencia de todos los módulos del sistema durante el proceso de corrección para el piloto interno.

---

## 1. Clasificación de Estado Funcional

- **APROBADO_PG:** Funcionalidad completa conectada a PostgreSQL real, verificada con pruebas automatizadas y persistente tras reinicio.
- **EN_PROCESO:** En implementación de persistencia SQL o corrección de interfaz.
- **PENDIENTE:** Pendiente de migración desde `*_MEMORIA` o conexión UI.
- **NO_ALCANCE_PILOTO:** Funcionalidad claramente deshabilitada y fuera del alcance del piloto inicial de 1–2 usuarios.

---

## 2. Matriz de Módulos Operativos

| # | Módulo / Opción | Menú | Backend | Persistencia | Estado | Validación Piloto |
| :-: | :--- | :--- | :--- | :---: | :---: | :--- |
| 01 | Inicio de Sesión y Setup | Acceso | `authJwtService.ts` | PG Real | EN PROCESO | Autenticación, JWT, MFA |
| 02 | Gestión de Empresas | Archivo | `empresaRepository.ts` | PG Real | EN PROCESO | Creación, configuración, selección |
| 03 | Períodos Contables | Archivo | `periodoService.ts` | PG Real | EN PROCESO | 14 períodos (00..13), apertura y cierre |
| 04 | Plan de Cuentas PCGE | Contabilidad | `pcgeService.ts` | PG Real | EN PROCESO | 1,629 cuentas oficiales, dinámico en selector |
| 05 | Subdiarios | Contabilidad | `subdiarioService.ts` | PG Real | EN PROCESO | Catálogo unificado 00..11 sin colisiones |
| 06 | Asientos y Vouchers | Contabilidad | `asientoService.ts` | PG Real | EN PROCESO | Partida doble, correlativos concurrentes |
| 07 | Registro de Compras | Compras/Ventas | `compraService.ts` | PG Real | EN PROCESO | Asiento, destinos 1/2/3/4, SPOT, retención |
| 08 | Registro de Ventas | Compras/Ventas | `ventaService.ts` | PG Real | EN PROCESO | Asiento, IGV 18%, exonerado, inafecto, notas |
| 09 | Cartera CxC / CxP | Tesorería | `cuentas_por_cobrar/pagar` | PG Real | EN PROCESO | Cartera histórica real, cobros/pagos en PG |
| 10 | Caja y Bancos | Tesorería | `tesoreriaService.ts` | PG Real | EN PROCESO | Movimientos bancarios y efectivo en PG |
| 11 | Planillas de Remuneraciones | Planillas | `planillaService.ts` | MIGRANDO PG | PENDIENTE (FASE B) | RMV 2026, AFP/ONP, 5ta categoría, boletas |
| 12 | Recibos por Honorarios | Planillas | `honorariosService.ts` | MIGRANDO PG | PENDIENTE (FASE B) | Retención 4ta 8%, asientos en PG |
| 13 | Liquidación IGV-Renta (PDT 621) | Tributos | `liquidacionIGVService.ts` | MIGRANDO PG | PENDIENTE (FASE B) | Débito/crédito fiscal, ret./perc. en PG |
| 14 | SIRE Conciliador | Reg. Electrónicos | `conciliadorSireService.ts` | MIGRANDO PG | PENDIENTE (FASE B) | Conciliación RCE/RVIE con registro PG |
| 15 | Libros Electrónicos (PLE 5.2) | Reg. Electrónicos | `pleExportService.ts` | MIGRANDO PG | PENDIENTE (FASE B) | Generación 8.1, 8.2, 14.1, 5.1, 6.1 |
| 16 | Libro Diario | Contabilidad | `librosEEFFService.ts` | PG Real | EN PROCESO | Formato estándar B/N, subdiarios oficiales |
| 17 | Libro Mayor | Contabilidad | `librosEEFFService.ts` | PG Real | EN PROCESO | Cuadre con Diario y Hoja de Trabajo |
| 18 | Balance de Comprobación (10 Col) | EE.FF. | `librosEEFFService.ts` | PG Real | EN PROCESO | Cuadre exacto S/ 0.00 con saldos PCGE |
| 19 | Respaldos por Empresa | Herramientas | `backupEmpresaService.ts` | Streaming PG | PENDIENTE (FASE B2) | Base por empresa, ZIP cifrado streaming |
| 20 | Auditoría del Sistema | Herramientas | `auditoriaChainService.ts` | PG Real | EN PROCESO | Hash chain, trigger append-only |
