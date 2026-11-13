# Plan de Implementación de Correcciones — ATLOB ERP

**Versión:** 1.1.0  
**Fecha de inicio:** 13 de noviembre de 2026  
**Última actualización:** 13 de noviembre de 2026  
**Repositorio:** `c:\PROYECTOS SUNAT\Sistema Contable`  
**Base de partida:** Commit `f0aa29d` (Auditoría Integral 12/11/2026)  
**Entorno de ejecución:** Windows 10/11 x64, Node.js v26.13.0, PostgreSQL 18.6 real (puerto 5432, base `atlob_test` / `sistema_contable`).

---

## 1. Objetivo y Alcance

Corregir integralmente los hallazgos identificados en la auditoría del 12/11/2026 y preparar **ATLOB ERP** para un piloto interno con **1–2 usuarios**, garantizando:
- 100% de la información persistente en PostgreSQL 18 real (cero arrays en memoria como sustitución en producción).
- Aislamiento multiempresa irrompible mediante RLS + FORCE en 64 tablas y 75 claves foráneas compuestas.
- Cero vulnerabilidades IDOR abiertas y 100% de endpoints protegidos por autenticación y RBAC.
- Respaldos y restauración atómica en formato ZIP cifrado con comprobación de integridad SHA-256.
- Despliegue de costo mensual US$0 en entorno local centralizado LAN / P2P con sincronización continua y p95 ≤ 2 segundos.
- Cumplimiento normativo contable-tributario peruano 2026 (PCGE 2019/2026, UIT S/ 5,500, Leyes 31556/32219, SIRE RS 000143-2025/SUNAT, DAOT 75 UIT).

---

## 2. Secuencia Estricta de Fases y Criterios de Transición

La ejecución se realiza **estrictamente** en el orden establecido:

$$\mathbf{A} \longrightarrow \mathbf{B} \longrightarrow \mathbf{B2} \longrightarrow \mathbf{C} \longrightarrow \mathbf{D} \longrightarrow \mathbf{E}$$

> [!IMPORTANT]
> **Regla de oro de certificación:** Queda estrictamente prohibido avanzar a la siguiente fase sin verificar y cumplir al 100% los criterios de aceptación medibles de la fase previa con evidencias reproducibles (`EXIT_CODE=0`).

---

## 3. Estado General de Avance

| Fase | Descripción Principal | Total Criterios | Aprobados | Fallidos | Pendientes | % Avance | Estado General |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **A** | Arranque, Seguridad, RLS 64 tablas, 75 FKs, IDOR | 7 | 7 | 0 | 0 | 100.0% | **COMPLETADA** |
| **B** | Persistencia PostgreSQL, 18 Servicios, Matriz 69/69 | 8 | 0 | 0 | 8 | 0.0% | **EN EJECUCIÓN** |
| **B2** | Respaldos, Restauración ZIP Cifrado, 4 Pruebas | 7 | 0 | 0 | 7 | 0.0% | PENDIENTE |
| **C** | Interfaz, Endpoints Faltantes, Conciliación EEFF S/ 0.00 | 9 | 0 | 0 | 9 | 0.0% | PENDIENTE |
| **D** | Operación Multiusuario (2 simultáneos, 60 min, ≤ 5s) | 9 | 0 | 0 | 9 | 0.0% | PENDIENTE |
| **E** | `npm run verify`, Cero Marcas, Certificación Piloto | 9 | 0 | 0 | 9 | 0.0% | PENDIENTE |
| **Total** | **Plan Maestro de Correcciones** | **49** | **7** | **0** | **42** | **14.3%** | **FASE A CERTIFICADA** |

---

## 4. Detalle y Evidencias por Fase

### FASE A: Arranque y Seguridad (ESTADO: COMPLETADA ✅)

| Criterio Medible | Meta | Resultado Obtenido | Comando de Verificación | Código Salida | Estado |
| :--- | :---: | :---: | :--- | :---: | :---: |
| 1. Errores TypeScript (`npm run lint`) | 0 errores | **0 errores** | `npm run lint` (`tsc --noEmit`) | `0` | **APROBADO** |
| 2. Vulnerabilidades IDOR abiertas | 0 conocidas | **0 abiertas** | `npx tsx server/tests/real/test_pg_idor_negativo.ts` | `0` | **APROBADO** |
| 3. Tablas objetivo con RLS activo | 64 tablas | **64 tablas** (ENABLE + FORCE + política `aislamiento_atlob`) | `npm run test:pg` (`test_pg_rls_planillas.ts`) | `0` | **APROBADO** |
| 4. Claves foráneas compuestas | 75 relaciones | **75 validadas** con pruebas negativas CASCADE/RESTRICT | `npm run test:pg` (`test_pg_seguridad.ts`) | `0` | **APROBADO** |
| 5. Endpoints con auth y autorización | 100% | **100% protegidos** (`requireAuth`, `requireEmpresaMembership`, `requireRol`) | `server/routes/index.ts` y routers validados | `0` | **APROBADO** |
| 6. Accesos cruzados entre empresas | 0 permitidos | **0 permitidos** (todos rechazados con 401/403/404) | `npx tsx server/tests/real/test_pg_idor_negativo.ts` | `0` | **APROBADO** |
| 7. Arranque reproducible con PostgreSQL | Sin fallos | **100% reproducible** (cold boot, migración vacía, UUID legado, shutdown) | `npm run test:infra` (`test_infra.ts`) | `0` | **APROBADO** |

**Evidencias técnicas de Fase A:**
1. `npm run lint`: Ejecución limpia de `tsc --noEmit` sin errores de compilación tras incorporar `label?: string` en `src/components/common/SelectorCuentaContable.tsx`.
2. `server/db/schema_fase18_seguridad_rls_etapas.sql`: Migración aditiva aplicada exitosamente en `atlob_test`. Se actualizaron las restricciones `subdiarios_tipo_check` y `chk_subdiarios_tipo_operacion` aceptando los 15 tipos contables oficiales. Se activó RLS con `FORCE ROW LEVEL SECURITY` y política `aislamiento_atlob` en las 41 tablas restantes de `ETAPAS_RLS`, alcanzando exactamente 64 tablas protegidas.
3. `npm run test:pg`:
   - `test_pg_rls_planillas.ts`: Comprobó 64 tablas con política, ENABLE y FORCE RLS. Aislamiento estricto de `contabilidad_app`, rechazo de escrituras cruzadas con SQLSTATE 42501, inmutabilidad de asientos y auditoría append-only.
   - `test_pg_seguridad.ts`: Validó las etapas 5.1 a 5.3 de RLS y las 75 claves foráneas compuestas en los 7 módulos contables (`01_contabilidad` a `07_sire`).
4. `server/tests/real/test_pg_compra_escritorio.ts`: Aprobado al 100% (`EMPRESA_EJERCICIO_12_PERIODOS=OK`, `COMPRA_PG_Y_ASIENTO=OK`, `LIBRO_DIARIO_PG_118_118=OK`, `BORRADOR_PG_REGISTRADO=OK`). Creación de empresa sin error `23514`.
5. `server/tests/real/test_pg_idor_negativo.ts`: Nueva suite automatizada que verifica el bloqueo 401 sin autenticación, 403 `ACCESO_DENEGADO_EMPRESA` en endpoints de análisis de cuentas (`/movimientos`, `/antiguedad`, `/cuentas-control`, `/alertas`, `/comparativo-anual`, `/marcas`), 403/404 en descargas PLE cruzadas, y 403 en endpoints restringidos a `ADMINISTRADOR` (`/metodo-inventario` y `/tributos/cronograma`).
6. `npm run test:infra`: 5/5 pruebas aprobadas (`PASS: esquema completo vacío`, `PASS: servidor HTTP inicia y reinicia`, `PASS: migración fallida revierte`, `PASS: identidad anterior conserva clave y relaciones al migrar a UUID`, `PASS: arranque cerrado ante conexión fallida o secreto ausente`).
7. `npm test`: Batería completa de 37 suites y 3,552 aserciones superada en 120.40s con 0 fallos.

---

### FASE B: Persistencia y Motor Contable (ESTADO: EN EJECUCIÓN 🟡)

**Objetivo:** Migrar los 18 servicios actualmente dependientes de memoria a PostgreSQL 18 real. Eliminar el uso de `*_MEMORIA` en modo productivo y validar los 69 escenarios de la matriz contable contra la base real.

| Criterio Medible | Meta | Estado Actual | Verificación Requerida |
| :--- | :---: | :---: | :--- |
| 1. Servicios operativos dependientes de `*_MEMORIA` | 0 servicios | En migración (18 identificados) | Inspección de código y pruebas sin mock |
| 2. Escrituras confirmadas en PostgreSQL | 100% | En verificación | Assert de filas en tablas PostgreSQL |
| 3. Datos conservados tras reinicio de servidor | 100% | Pendiente | Prueba de parada, arranque y lectura |
| 4. Errores `SQLSTATE 23514` en creación de empresas | 0 errores | **0 errores** (Resuelto en Fase A) | `test_pg_compra_escritorio.ts` |
| 5. Duplicaciones de correlativos concurrentes | 0 duplicados | Pendiente | Prueba de concurrencia 50 hilos |
| 6. Asientos generados con Debe = Haber | 100% | Pendiente | Comprobación de suma y trigger |
| 7. Subdiarios consistentes (catálogo vs asientos) | 100% | En revisión | Verificación de 15 tipos en catálogo |
| 8. Escenarios contables validados en PostgreSQL | 69/69 | 60/69 en memoria, 0/69 en PG real | `MATRIZ_COMPLETITUD_ASIENTOS.md` en PG |
