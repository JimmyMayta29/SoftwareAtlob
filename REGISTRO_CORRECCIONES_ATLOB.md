# Registro de Correcciones — ATLOB ERP

**Versión:** 1.1.0  
**Fecha de inicio:** 13 de noviembre de 2026  
**Última actualización:** 13 de noviembre de 2026  
**Repositorio:** `c:\PROYECTOS SUNAT\Sistema Contable`  
**Base auditada:** `f0aa29d` (Auditoría Integral 12/11/2026)  
**Trazabilidad:** Cada cambio se vincula a su hallazgo (`H-01..H-22`), fase (`A → B → B2 → C → D → E`), archivos afectados y pruebas de verificación.

---

## 1. Bitácora de Modificaciones Implementadas

| ID | Hallazgo | Fase | Archivo(s) Modificado(s) | Descripción Técnica de la Corrección | Estado | Verificación |
| :---: | :---: | :---: | :--- | :--- | :---: | :--- |
| `CORR-01` | `H-01` | A | `src/components/common/SelectorCuentaContable.tsx` | Incorporación de prop opcional `label?: string` en `SelectorCuentaContableProps` y renderizado de `<label>` accesible. | **APROBADO** | `npm run lint` = 0 errores TypeScript (`tsc --noEmit`). |
| `CORR-02` | `H-04` | A | `server/routes/index.ts` | Retiro de montaje desprotegido `/analisis-cuentas` que omitía `requireEmpresaMembership`. | **APROBADO** | `test_pg_idor_negativo.ts` = 401 sin auth, 403 entre empresas. |
| `CORR-03` | `H-04` | A | `server/routes/analisisCuentaRoutes.ts` | Implementación de `resolverEmpresaId(req)` que rechaza discrepancias entre `req.params.empresaId` y `body/query.empresaId` con 403 `ACCESO_DENEGADO_EMPRESA`. Restricción de `POST /marcas` a roles `RolEstudio` autenticados. | **APROBADO** | `test_pg_idor_negativo.ts` rechaza inyecciones con 403. |
| `CORR-04` | `H-04` | A | `server/controllers/pleController.ts` | Validación obligatoria de aislamiento `exportacion.empresaId !== req.empresaId` retornando 403 `ACCESO_DENEGADO_EMPRESA` en descargas PLE. | **APROBADO** | `test_pg_idor_negativo.ts` bloquea descargas de otra empresa (403/404). |
| `CORR-05` | `H-04` | A | `server/routes/empresaRoutes.ts` | Inclusión de `requireEmpresaMembership(['ADMINISTRADOR'])` en `PUT /:id/metodo-inventario`. | **APROBADO** | `test_pg_idor_negativo.ts` rechaza cambios por CONTADOR_SENIOR con 403. |
| `CORR-06` | `H-04` | A | `server/routes/activosKardexRoutes.ts` | Extracción y validación obligatoria de `req.user?.id` autenticado en `POST /activos-fijos/depreciacion/asiento`. | **APROBADO** | Endpoint protegido y verificado con token. |
| `CORR-07` | `H-04` | A | `server/routes/cronogramaVencimientosRoutes.ts` | Restricción de `PUT /` a `requireRol(['ADMINISTRADOR'])` con `requireAuth()` estricto y eliminación de fallback hardcoded. | **APROBADO** | `test_pg_idor_negativo.ts` rechaza peticiones sin auth (401) y no-admin (403). |
| `CORR-08` | `H-16` | A | `scripts/inicializar-escritorio.ps1` | Generación e inclusión de los 5 secretos criptográficos (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `SUNAT_ENCRYPTION_KEY`, `MFA_SEED_SECRET`, `BACKUP_ENCRYPTION_KEY`) de 32 bytes hex al crear `.env` de producción. | **APROBADO** | `npm run test:infra` y `test_produccion_sin_db.ts`. |
| `CORR-09` | `H-16` | A | `server.ts` | Restricción estricta de CORS en producción web/LAN mediante `ALLOWED_ORIGIN`. | **APROBADO** | `npm run test:infra` (cold boot y health check 200). |
| `CORR-10` | `H-03` | A | `server/db/schema_fase18_seguridad_rls_etapas.sql`, `server/db/migration-files.ts` | Migración aditiva idempotente que aplica permanentemente RLS + FORCE en las 41 tablas pendientes (64 en total) y amplía `subdiarios_tipo_check` y `chk_subdiarios_tipo_operacion` con los 15 tipos contables. | **APROBADO** | `npm run test:pg` verifica 64 tablas con política `aislamiento_atlob`. |
| `CORR-11` | `H-05` | A | `server/services/compraService.ts` | Corrección de comparación de tipos `id::text = $2` en búsqueda de subdiario y resolución inteligente de cuentas divisionarias (60111/20111/61111 a 6011/2011/6111) evitando `CUENTA_NO_ENCONTRADA`. | **APROBADO** | `test_pg_compra_escritorio.ts` aprueba creación y registro contable en PostgreSQL. |
| `CORR-12` | `H-16` | A | `server/tests/real/test_infra.ts` | Configuración de conexión de administración con `TEST_ADMIN_DATABASE_URL` y asignación de `OWNER contabilidad_app` en bases descartables. | **APROBADO** | `npm run test:infra` aprueba con EXIT 0. |
| `CORR-13` | `H-04` | A | `server/tests/real/test_pg_idor_negativo.ts` | Creación de suite automatizada de pruebas negativas contra PostgreSQL real verificando 401 en accesos sin token y 403 en ataques IDOR y manipulación de parámetros. | **APROBADO** | `npx tsx server/tests/real/test_pg_idor_negativo.ts` aprueba con EXIT 0. |

---

## 2. Estado de los 22 Hallazgos de Auditoría

| ID | Hallazgo | Severidad | Fase Asignada | Estado | Cierre Técnico |
| :---: | :--- | :---: | :---: | :---: | :--- |
| `H-01` | TypeScript `npm run lint` fallido (prop `label` faltante) | CRÍTICA | A | **RESUELTO** | `SelectorCuentaContable.tsx` actualizado con `label?: string` y `<label>`. `lint` = 0 errores. |
| `H-02` | Dependencia de arrays en memoria en 18 servicios operativos | CRÍTICA | B | EN PROCESO | Identificados 18 servicios; migración a PostgreSQL en ejecución. |
| `H-03` | RLS inactivo en 41 tablas y 75 claves foráneas | CRÍTICA | A | **RESUELTO** | Migración 18 aplicó RLS + FORCE en las 41 tablas (64 totales). 75 FKs validadas en `test:pg`. |
| `H-04` | Múltiples vulnerabilidades IDOR y rutas desprotegidas | CRÍTICA | A | **RESUELTO** | Retiro de `/analisis-cuentas` raíz, validación `resolverEmpresaId`, protección PLE, activos y cronograma. |
| `H-05` | Error SQLSTATE 23514 al crear empresas por subdiarios | CRÍTICA | A / B | **RESUELTO** | Restricciones `subdiarios_tipo_check` y `chk_subdiarios_tipo_operacion` ampliadas. |
| `H-06` | Incompatibilidad normativa tributaria 2026 (UIT, SIRE, DAOT) | ALTA | B | PENDIENTE | Se actualizarán parámetros y umbrales en base real. |
| `H-07` | Respaldos no integrales (exclusión de 36 tablas y archivos) | ALTA | B2 | PENDIENTE | Módulo `archivosEmpresa.ts` y backup ZIP cifrado integral. |
| `H-08` | Desconexión en Cuentas por Cobrar y Cuentas por Pagar | ALTA | C | PENDIENTE | Conexión directa a saldos de comprobantes en PostgreSQL. |
| `H-09` | Vistas huérfanas con endpoints inexistentes (404) | ALTA | C | PENDIENTE | Conexión de 7 vistas a endpoints reales. |
| `H-10` | Discrepancia entre orígenes de reportes contables | ALTA | C | PENDIENTE | Conciliación de saldos con S/ 0.00 de diferencia. |
| `H-11` | PCGE desconectado en selectores de interfaz | MEDIA | C | PENDIENTE | Conexión de selectores a API dinámica del PCGE. |
| `H-12` | Falta de soporte multiusuario y sincronización en tiempo real | MEDIA | D | PENDIENTE | Implementación de sync p95 ≤ 2s y polling/SSE ≤ 5s. |
| `H-13` | Certificación sin evidencias en PostgreSQL real | MEDIA | E | PENDIENTE | Inclusión en `npm run verify` con fallo ante mock. |
| `H-14` | Correlativos concurrentes propensos a colisión | MEDIA | B | PENDIENTE | Bloqueo pesimista o secuencias atómicas por subdiario/periodo. |
| `H-15` | Inconsistencias entre catálogo de subdiarios y asientos | MEDIA | B | PENDIENTE | Validación de los 15 subdiarios oficiales. |
| `H-16` | Secretos de producción omitidos en script de inicialización | MEDIA | A | **RESUELTO** | `inicializar-escritorio.ps1` genera los 5 secretos hex de 32 bytes. |
| `H-17` | Ausencia de validación de integridad SHA-256 en respaldos | MEDIA | B2 | PENDIENTE | Manifest con SHA-256 y firma criptográfica. |
| `H-18` | Desconexión de módulos de cierre contable y diferencia de cambio | BAJA | C | PENDIENTE | Implementación de endpoints de cierre mensual/anual y ajuste TC. |
| `H-19` | Inconsistencia en filtros de Libro Diario y Mayor | BAJA | C | PENDIENTE | Uniformización de filtros por subdiario, cuenta y moneda. |
| `H-20` | Falta de script unificado de verificación integral | BAJA | E | PENDIENTE | Creación de comando `npm run verify`. |
| `H-21` | Documentación desactualizada respecto al estado real | BAJA | E | PENDIENTE | Actualización de README y manual de despliegue. |
| `H-22` | Posibles referencias residuales de marcas comerciales | BAJA | E | PENDIENTE | Auditoría automatizada de cero menciones de marcas. |
