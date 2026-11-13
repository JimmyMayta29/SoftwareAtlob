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
| 01 | Inicio de Sesión y Setup | Acceso | `authJwtService.ts` | PG Real | APROBADO_PG | Autenticación, JWT, MFA, sin fuga de contraseñas |
| 02 | Gestión de Empresas | Archivo | `empresaRepository.ts` | PG Real | APROBADO_PG | Creación, configuración, RLS, 0 errores 23514 |
| 03 | Períodos Contables | Archivo | `periodoService.ts` | PG Real | APROBADO_PG | 14 períodos (00..13), apertura y cierre en PG |
| 04 | Plan de Cuentas PCGE | Contabilidad | `pcgeService.ts` | PG Real | APROBADO_PG | 1,629 cuentas oficiales, dinámico en selector |
| 05 | Subdiarios | Contabilidad | `subdiarioService.ts` | PG Real | APROBADO_PG | Catálogo unificado 00..11, 15 tipos contables |
| 06 | Asientos y Vouchers | Contabilidad | `asientoService.ts` | PG Real | APROBADO_PG | Partida doble, 0 colisiones en 50 concurrentes |
| 07 | Registro de Compras | Compras/Ventas | `compraService.ts` | PG Real | APROBADO_PG | 28/28 escenarios, destinos 1/2/3/4, SPOT, retención |
| 08 | Registro de Ventas | Compras/Ventas | `ventaService.ts` | PG Real | APROBADO_PG | 11/11 escenarios, IGV 18%, exonerado, inafecto, notas |
| 09 | Cartera CxC / CxP | Tesorería | `cuentas_por_cobrar/pagar` | PG Real | EN PROCESO | Cartera histórica real, cobros/pagos en PG |
| 10 | Caja y Bancos | Tesorería | `tesoreriaService.ts` | PG Real | APROBADO_PG | 6/6 cobranzas y 7/7 pagos validados en PG real |
| 11 | Planillas de Remuneraciones | Planillas | `planillaService.ts` | PG Real | APROBADO_PG | 5/5 escenarios, trabajadores en PG, boletas PDF |
| 12 | Recibos por Honorarios | Planillas | `honorariosService.ts` | PG Real | APROBADO_PG | 4/4 escenarios, retención 4ta 8%, suspensión |
| 13 | Liquidación IGV-Renta (PDT 621) | Tributos | `liquidacionIGVService.ts` | PG Real | APROBADO_PG | Débito/crédito fiscal, ret./perc. en PG real |
| 14 | SIRE Conciliador | Reg. Electrónicos | `conciliadorSireService.ts` | PG Real | APROBADO_PG | Conciliación RCE/RVIE con registro PG real |
| 15 | Libros Electrónicos (PLE 5.2) | Reg. Electrónicos | `pleExportService.ts` | PG Real | APROBADO_PG | Generación 8.1, 8.2, 14.1, 5.1, 6.1 desde PG |
| 16 | Libro Diario | Contabilidad | `librosEEFFService.ts` | PG Real | APROBADO_PG | Formato estándar B/N, subdiarios oficiales 00..11 |
| 17 | Libro Mayor | Contabilidad | `librosEEFFService.ts` | PG Real | APROBADO_PG | Cuadre con Diario y Hoja de Trabajo |
| 18 | Balance de Comprobación (10 Col) | EE.FF. | `librosEEFFService.ts` | PG Real | APROBADO_PG | Cuadre exacto S/ 0.00 con saldos PCGE en PG |
| 19 | Respaldos por Empresa | Herramientas | `backupEmpresaService.ts` | Streaming PG | PENDIENTE (FASE B2) | Base por empresa, ZIP cifrado streaming |
| 20 | Auditoría del Sistema | Herramientas | `auditoriaChainService.ts` | PG Real | APROBADO_PG | Hash chain, trigger append-only, RLS |
| 21 | Kardex e Inventarios | Kardex | `kardexService.ts` | PG Real | APROBADO_PG | Artículos y movimientos en `articulos_kardex` / `movimientos_kardex` |
| 22 | Activos Fijos | Activos Fijos | `activosFijosService.ts` | PG Real | APROBADO_PG | Depreciación mensual y registro en `activos_fijos` |

