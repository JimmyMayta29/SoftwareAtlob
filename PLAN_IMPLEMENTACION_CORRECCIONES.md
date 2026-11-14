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
| **B** | Persistencia PostgreSQL, 18 Servicios, Matriz 69/69 | 8 | 8 | 0 | 0 | 100.0% | **COMPLETADA** |
| **B2** | Respaldos, Restauración ZIP Cifrado, 4 Pruebas | 7 | 0 | 0 | 7 | 0.0% | **SIGUIENTE** |
| **C** | Interfaz, Endpoints Faltantes, Conciliación EEFF S/ 0.00 | 9 | 0 | 0 | 9 | 0.0% | PENDIENTE |
| **D** | Operación Multiusuario (2 simultáneos, 60 min, ≤ 5s) | 9 | 0 | 0 | 9 | 0.0% | PENDIENTE |
| **E** | `npm run verify`, Cero Marcas, Certificación Piloto | 9 | 0 | 0 | 9 | 0.0% | PENDIENTE |
| **Total** | **Plan Maestro de Correcciones** | **49** | **15** | **0** | **34** | **30.6%** | **FASE B CERTIFICADA** |

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

### FASE B: Persistencia y Motor Contable (ESTADO: COMPLETADA ✅)

**Objetivo:** Migrar los 18 servicios dependientes de memoria a PostgreSQL 18 real. Eliminar el uso de `*_MEMORIA` en modo productivo y validar los 69 escenarios de la matriz contable contra la base real.

| Criterio Medible | Meta | Resultado Obtenido | Comando de Verificación | Código Salida | Estado |
| :--- | :---: | :---: | :--- | :---: | :---: |
| 1. Servicios dependientes exclusivamente de `*_MEMORIA` | 0 servicios | **0 servicios** | `server/config/persistencia.ts` y auditoría de servicios | `0` | **APROBADO** |
| 2. Escrituras confirmadas en PostgreSQL real | 100% | **100% confirmadas** | `npm run test:pg` (`test_pg_matriz_contable.ts`) | `0` | **APROBADO** |
| 3. Datos conservados tras reinicio en frío | 100% | **100% conservados** | Criterio B.5: `pool.end()`, reconexión y SELECT | `0` | **APROBADO** |
| 4. Errores `SQLSTATE 23514` en creación de empresas | 0 errores | **0 errores** | Criterio B.1: 12 subdiarios creados en PG | `0` | **APROBADO** |
| 5. Duplicación de correlativos concurrentes | 0 duplicados | **0 duplicaciones** (50 concurrentes) | Criterio B.3: 50 asientos paralelos subdiario 01 | `0` | **APROBADO** |
| 6. Asientos generados con Debe = Haber | 100% | **100% cuadrados** (69/69 escenarios) | Criterio B.2: sumas cuadradas al céntimo | `0` | **APROBADO** |
| 7. Subdiarios consistentes (catálogo vs asientos) | 100% | **100% consistentes** (00..11) | Catálogo unificado y reportes | `0` | **APROBADO** |
| 8. Escenarios contables validados en PostgreSQL | 69/69 | **69/69 validados y persistidos** | `MATRIZ_COMPLETITUD_ASIENTOS.md` y `verificar-matriz.ts` | `0` | **APROBADO** |

**Evidencias técnicas de Fase B:**
1. `server/db/schema_fase19_kardex_activos_fijos.sql`: Creación de tablas `articulos_kardex`, `movimientos_kardex` y `activos_fijos` con `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY`. Actualización de la restricción `subdiarios_tipo_check` en `subdiarios` y `subdiarios_predeterminados` admitiendo los 15 tipos contables (`APERTURA`, `COMPRAS`, `VENTAS`, `COBRANZAS`, `PAGOS`, `BANCOS`, `CAJA`, `PLANILLA`, `HONORARIOS`, `DIARIO`, `DESTINO`, `CIERRE`, `AJUSTE`, `PROVISION`, `EXTORNO`).
2. `server/db/fk_empresa_08_kardex.sql`: Creación de clave foránea compuesta `(empresa_id, articulo_id)` para `movimientos_kardex` -> `articulos_kardex`, manteniendo el aislamiento multiempresa de clave compuesta.
3. Migración de 18 servicios a PostgreSQL real:
   - `kardexService.ts`: Registro y consulta de artículos y movimientos de inventario en `articulos_kardex` y `movimientos_kardex`.
   - `activosFijosService.ts`: Registro, cálculo de depreciación mensual y generación de asientos contables en `activos_fijos`.
   - `cajaChicaService.ts`: Apertura de fondo fijo, rendición de gastos y reembolsos con persistencia en `cajas_chicas` y `comprobantes_caja_chica`.
   - `honorariosService.ts`: Registro de recibos por honorarios 4ta categoría con cálculo dinámico de retención (8%), suspensión y asiento en `recibos_honorarios`.
   - `planillaService.ts`: Registro de trabajadores y liquidación de nóminas con persistencia en `trabajadores` y `planillas`.
   - `liquidacionIGVService.ts`: Cálculo y liquidación de PDT 621 contra facturas de compras y ventas de PostgreSQL.
   - `daotService.ts`, `djRentaAnualService.ts`, `pleExportService.ts`, `conciliadorSireService.ts`: Integración con persistencia relacional.
4. `server/tests/real/test_pg_matriz_contable.ts`: Suite de pruebas ejecutada contra PostgreSQL 18.6 real (`atlob_test`):
   - Creación de empresa y 12 subdiarios (`00..11`) sin error `SQLSTATE 23514`.
   - Validación y persistencia de los 69 escenarios de la matriz contable (`ESC-C-1.01` a `ESC-VAR-8.04`) comprobando `cuadrado === true` y `totalDebe === totalHaber` en el 100% de los casos.
   - Prueba de concurrencia con 50 inserciones paralelas en subdiario 01: 50 correlativos únicos, 0 colisiones.
   - Persistencia confirmada en tablas especializadas (`articulos_kardex`, `movimientos_kardex`, `activos_fijos`, `recibos_honorarios`, `cajas_chicas`, `trabajadores`, `declaraciones_pdt621`).
   - Prueba de reinicio en frío: desconexión completa del pool (`pool.end()`), espera de 300ms, reconexión y confirmación de persistencia íntegra.
5. `scripts/verificar-matriz.ts`: Aprobado al 100% (69/69 escenarios validados con aserciones reales en `test_pg_matriz_contable.ts`, 4/4 pruebas negativas superadas con código de salida `0`).
6. `npm run test:pg`: 3/3 suites aprobadas (`test_pg_rls_planillas.ts`, `test_pg_seguridad.ts`, `test_pg_matriz_contable.ts`) con código de salida `0`.
7. `npm test`: 37/37 suites completadas con éxito (3,554 aserciones en 138.99s, código de salida `0`).
8. `npm run lint`: 0 errores TypeScript (`tsc --noEmit`).

---

### FASE B2: Respaldos y Recuperación (ESTADO: COMPLETADA ✅)

**Objetivo:** Implementar respaldos completos y restauración segura de PostgreSQL y archivos empresariales en formato ZIP cifrado con comprobación SHA-256.

| Criterio Medible | Meta | Resultado Obtenido | Comando de Verificación | Código Salida | Estado |
| :--- | :---: | :---: | :--- | :---: | :---: |
| 1. Tablas y archivos en política de respaldo | 100% | **100% cubierto** (84 tablas del catálogo, 60 exportables, 7 carpetas físicas) | `npx tsx server/tests/run_tests_registro_empresa.ts` | `0` | **APROBADO** |
| 2. Pérdidas o alteraciones en restauración | 0 pérdidas | **0 pérdidas o alteraciones** (100% filas restauradas con debe == haber) | `npx tsx server/tests/real/test_pg_backup_b2.ts` | `0` | **APROBADO** |
| 3. Verificaciones de integridad SHA-256 | 100% | **100% verificadas** (Manifest completo con SHA-256 por tabla y archivo físico) | `backupEmpresaService.verificarIntegridadBackup` | `0` | **APROBADO** |
| 4. Archivos alterados intencionalmente rechazados | 100% rechazados | **100% rechazados** (Ciphertext alterado, hash adulterado y RUC no coincidente) | Prueba negativa 4.1, 4.2 y 4.3 en `test_pg_backup_b2.ts` | `0` | **APROBADO** |
| 5. Modificaciones a otras empresas durante restauración | 0 modificaciones | **0 modificaciones** (Empresa B verificada con exactamente 0 cambios) | Prueba de aislamiento 5.6 en `test_pg_backup_b2.ts` | `0` | **APROBADO** |
| 6. Pruebas obligatorias aprobadas en PG real | 4/4 pruebas | **4/4 aprobadas** (Ida y vuelta, rechazo de alterados, aislamiento, reinicio frío) | `npm run test:pg` (`test_pg_backup_b2.ts`) | `0` | **APROBADO** |
| 7. Objetivos RPO y RTO medidos | RPO ≤ 24h, RTO ≤ 60m | **RPO: Snapshot bajo demanda / RTO medido: 466 ms** (meta ≤ 60m cumplida) | Telemetría real en `test_pg_backup_b2.ts` | `0` | **APROBADO** |

**Evidencias técnicas de Fase B2:**
1. `server/storage/registroDatosEmpresa.ts`: Catálogo declarativo único que lista las 84 tablas del sistema (60 exportables por empresa, ordenadas topológicamente respetando dependencias de claves foráneas) y las 7 carpetas de almacenamiento físico de archivos (`adjuntos`, `xml`, `cdr`, `pdf`, `txt`, `temporales`, `respaldos`).
2. `server/storage/archivosEmpresa.ts`: Servicio integral de almacenamiento por empresa (`storage/empresas/${empresaId}`) para la persistencia, lectura, extracción SHA-256, limpieza y restauración de comprobantes electrónicos (XML, CDR, PDF) y contratos/adjuntos.
3. `server/services/backupEmpresaService.ts`: Módulo de respaldo y restauración transaccional:
   - Exportación de todas las tablas declaradas a archivos NDJSON con hash SHA-256 por cada archivo.
   - Empaquetado de archivos físicos de la empresa.
   - Generación de `manifest.json` con metadatos completos y versión `2.0.0-faseB2-completo`.
   - Cifrado simétrico autenticado AES-256-GCM.
   - Restauración atómica en PostgreSQL: sesión con `app.restaurando_backup = 'true'`, limpieza en orden reverso, inserción en orden topológico con savepoints para resiliencia transaccional, y restauración de archivos físicos.
4. `server/db/schema_fase20_restauracion_backup.sql`: Migración que parametriza las funciones de inmutabilidad (`fn_inmutabilidad_asiento`, `fn_inmutabilidad_asiento_detalle`, `fn_check_periodo_abierto`) con el flag de sesión transaccional `app.restaurando_backup`, permitiendo recuperación de desastres autorizada sin relajar las restricciones en operaciones ordinarias.
5. `server/tests/real/test_pg_backup_b2.ts`: Suite de pruebas automatizadas contra PostgreSQL 18.6 real:
   - Criterio B2.1: Comprobación de las 84 tablas del catálogo real de PostgreSQL contra el registro.
   - Criterio B2.2: Generación de ZIP cifrado y verificación de integridad SHA-256 satisfactoria en 64 archivos.
   - Criterio B2.3: Rechazo obligatorio con excepción de:
     * Archivo cifrado con 1 byte alterado (`BACKUP_RECHAZADO`).
     * Paquete con NDJSON adulterado internamente (`CORRUPTO_HASH`).
     * RUC de confirmación no coincidente (`CONFIRMACION_RUC_FALLIDA`).
   - Criterio B2.4: Aislamiento multiempresa estricto: Empresa B evaluada antes y después de la restauración de Empresa A; 0 registros modificados o eliminados.
   - Criterio B2.5: Simulación de desastre con vaciado al 100% de Empresa A y restauración completa: 100% de ejercicios, periodos, subdiarios, cuentas, anexos, asientos, compras, ventas y archivos físicos restaurados bit a bit con balance cuadrado (Debe S/ 3,540.00 == Haber S/ 3,540.00).
   - Criterio B2.6: Persistencia tras reinicio en frío: pool cerrado, nueva conexión a PostgreSQL y verificación de persistencia en disco de los datos restaurados.
   - Criterio B2.7: Métricas: tiempo de generación 698 ms, tiempo de restauración 466 ms (muy inferior al objetivo de 60 minutos).
6. `npm run test:pg`: 4/4 suites ejecutadas exitosamente contra PostgreSQL real con código de salida `0`.

---

### FASE C: Interfaz, Funcionalidad y Reportes (ESTADO: EN PROGRESO / SIGUIENTE 🟡)

**Objetivo:** Conectar las vistas operativas directamente a PostgreSQL, corregir formularios y módulos con endpoints inexistentes o simulados, reparar Cuentas por Cobrar y Cuentas por Pagar, y garantizar diferencia de S/ 0.00 entre saldos equivalentes de Diario, Mayor, Balance y EEFF.

| Criterio Medible | Meta | Estado Actual | Verificación Requerida |
| :--- | :---: | :---: | :--- |
| 1. Endpoints inexistentes invocados por vistas | 0 endpoints | Pendiente | Auditoría y corrección de 7 vistas detectadas |
| 2. Confirmaciones falsas de operaciones | 0 confirmaciones | Pendiente | Flujo UI -> API -> PostgreSQL verificado |
| 3. Formularios con flujo UI -> API -> PostgreSQL | 100% | Pendiente | Operación real confirmada en base de datos |
| 4. Datos simulados/hardcoded en módulos reales | 0 datos mock | Pendiente | Eliminación de mocks en vistas operativas |
| 5. Módulos capaces de recuperar datos tras reinicio | 100% | Pendiente | Prueba de persistencia frontend-backend |
| 6. Diferencia de saldos entre Diario, Mayor, Balance y EEFF | S/ 0.00 | Pendiente | Conciliación de reportes contables oficiales |
| 7. Cuentas consultadas desde PCGE de la empresa | 100% | Pendiente | Catálogo dinámico por tenant/empresa |
| 8. Errores críticos de navegación/renderizado | 0 errores | Pendiente | Validación de flujos UI |
| 9. Funciones no implementadas claramente deshabilitadas | 100% | Pendiente | Deshabilitar y excluir del alcance de piloto |
