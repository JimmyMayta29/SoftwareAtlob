# Comparativo de Auditorías y Evaluación de Cambios (`9cc42f0` vs `f0aa29d`) — ATLOB ERP

**Línea base anterior:** `9cc42f0` (`SISTEMA_ATLOB_ERP.md`, 11 de noviembre de 2026) y plan vigente [`docs/engineering/PLAN_IMPLEMENTACION.md`](../engineering/PLAN_IMPLEMENTACION.md)  
**Corte actual auditado:** `f0aa29d` (12 de noviembre de 2026, rama `main`)  
**Alcance del delta:** `11` commits, `34` archivos tocados, `+2,658` inserciones / `-333` eliminaciones.

---

## 1. Comparativa Cuantitativa Directa (`11/11/2026` vs `12/11/2026`)

| Dimensión / Indicador | Auditoría Anterior (`9cc42f0`, 11/11/2026) | Auditoría Actual (`f0aa29d`, 12/11/2026) | Variación y Veredicto |
| :--- | :--- | :--- | :--- |
| **`npm run lint` (`tsc --noEmit`)** | **Aprobado (`0` errores)** | **REPROBADO (`EXIT=1`, `2` errores `TS2322`)** | **Regresión P0** introducida en `f0aa29d` (`HonorariosView.tsx:426`, `SireConciliadorView.tsx:853`) |
| **`npm run build` (`vite build`)** | `2,101` módulos (`5.76s`), bundle `index-C_F132wg.js` (`2,434.40 kB` / `528.10 kB` gzip) | `2,104` módulos (`3.14s`), bundle `index-CxirrKtH.js` (`2,458.51 kB` / `533.87 kB` gzip) | `+3` módulos nuevos (`sistemaApi`, `BannerPersistenciaTemporal`, `SelectorCuentaContable`); alerta > 500 kB persiste |
| **`npm test` (memoria / `pg-mem` / estático)** | `36 / 36` suites (`3,390` aserciones, `125.43s`) | `37 / 37` suites (`3,552` aserciones, `138.97s`) | `+1` suite (`test_transparencia_persistencia.ts`: `147` aserciones) y `+15` aserciones en Suite 33 (`29 -> 44`) |
| **Pruebas PostgreSQL 18.6 reales** | No ejecutadas durante el corte del 11/11 | **Ejecutadas directamente:** `test:pg` PASS (`0`), `run_tests_registro_empresa.ts` PASS (`0`), **`test_pg_compra_escritorio.ts` FAIL (`1`, `23514`)**, **`test:infra` FAIL (`1`, `42501`)**, `test:pg:docker` SKIP (`0`) | Descubiertos **2 fallos reales en PG 18.6** y RLS parcial no aplicado al arrancar |
| **RLS verificado en catálogo PG real (`pg_class`)** | Documentado como *"64 tablas con RLS"* / *"10 con FORCE"* | **`23 / 81` tablas con RLS+FORCE activo**; `41` tablas de `ETAPAS_RLS` están en **`false`** en `atlob_test` (`58` sin RLS en total) | **Deriva documental activa**: `ETAPAS_RLS` solo corre en pruebas con `ROLLBACK` |
| **Servicios solo en memoria (`server/services/`)** | `18` de `53` declarados en memoria (`PG:False`) | Siguen **`18`** declarados en `MODULOS_SOLO_MEMORIA` **+ brecha descubierta** en `liquidacionIGVService` (PDT 621 / Ret.-Perc. solo en RAM sin registro) | **Sin avance SQL**: ningún servicio `*_MEMORIA` migró a PostgreSQL |
| **Conteo de archivos (`src/` / `server/`)** | `169` / `191` archivos | **`172`** / **`193`** archivos (`+3` frontend / `+2` backend) | Crecimiento acotado de transparencia M1/M2 y selector PCGE |
| **Instaladores Windows en `release/`** | Generados previamente | Fechados `12/11/2026 13:16`–`13:20` (Setup `123.4 MB`, Portable `112.2 MB`) | **Desfasados respecto a `f0aa29d` (`13:24:26`)** |
| **Script `npm run verify` (Fase E)** | Ausente en `package.json` | Sigue **ausente en `package.json`** | Incumplida la puerta E del plan |

---

## 2. Auditoría Detallada de los Cambios Recientes (`9cc42f0..f0aa29d`)

### 2.1 Bloque M1 — Transparencia de Persistencia en Memoria (`3e9c99b`..`08325e8`)

| Aspecto Evaluado | Evidencia Directa |
| :--- | :--- |
| **Problema que buscaba resolver** | Ocultamiento operacional de los `18` módulos en RAM ante usuarios/administradores, riesgo de operar en producción creyendo que planillas, PLE, SIRE o backups persistían en PostgreSQL. |
| **Archivos modificados / creados** | `server/config/persistencia.ts` (`+419` líneas), `server/config/env.ts`, `server/routes/index.ts`, `.env.example`, `src/api/sistemaApi.ts`, `src/components/common/BannerPersistenciaTemporal.tsx`, `src/components/desktop/TopBar.tsx`, `src/components/modals/ModalImportacionCsv.tsx`, `server/tests/test_transparencia_persistencia.ts`. |
| **Cómo funciona actualmente** | Define `MODULOS_SOLO_MEMORIA` (`18` entradas) y `HELPERS_SIN_PERSISTENCIA` (`11`), expone `GET /api/sistema/persistencia` y el flag booleano `persistenciaCompleta` en `/api/health`, habilita bloqueo HTTP `503` (`MODULO_SIN_PERSISTENCIA`) si `ATLOB_BLOQUEAR_MEMORIA=1` y renderiza un banner de advertencia en vistas afectadas. |
| **Evaluación, límites y regresiones** | <ul><li>**Positivo:** Fuente única declarativa bien estructurada y probada (`147` aserciones en Suite 37).</li><li>**Brecha 1 (`BannerPersistenciaTemporal.tsx:13-16`):** El banner **se oculta en `development` y en pruebas** (`modo === 'production' \|\| esEscritorio === true`), reduciendo su visibilidad durante pruebas funcionales manuales.</li><li>**Brecha 2 (omisión de `liquidacionIGVService.ts`):** `DECLARACIONES_PDT621_MEMORIA` y `RETENCIONES_PERCEPCIONES_IGV_MEMORIA` operan solo en RAM y `/api/tributos/pdt621` figura en `rutasCompartidasNoBloqueadas` de `prorrata-igv`, eludiendo tanto el aviso en UI como `ATLOB_BLOQUEAR_MEMORIA=1`.</li><li>**Brecha 3 (`migrationService.ts`):** Figura como helper inofensivo pese a exponer `/api/migration` sin persistir entidades contables.</li></ul> |

### 2.2 Bloque M2 — Manifiesto Parcial y Avisos en Respaldos (`798a042`..`ac2806b`)

| Aspecto Evaluado | Evidencia Directa |
| :--- | :--- |
| **Problema que buscaba resolver** | Evitar que el usuario descargue un respaldo pensando que contiene todas las tablas PostgreSQL cuando `backupEmpresaService.ts` solo exporta `*_MEMORIA`. |
| **Archivos modificados / creados** | `server/services/backupEmpresaService.ts`, `server/controllers/backupEmpresaController.ts`, `src/components/modals/ModalBackupEmpresa.tsx`, `server/tests/test_transparencia_persistencia.ts`. |
| **Cómo funciona actualmente** | Añade campos de alcance/advertencia retrocompatibles en `manifest.json`, exige confirmación previa en UI y nombra el archivo generado como `ATLOB_respaldo_PARCIAL...`. |
| **Evaluación y límite frente a Fase B2** | Mejora valiosa de **honestidad operativa**, pero **no cierra la Fase B2 ni el Hallazgo 9**. Como establece expresamente `PLAN_IMPLEMENTACION.md:37`, cambiar el manifiesto/nombre del ZIP no reemplaza el respaldo/restauración real en streaming sobre tablas PostgreSQL y carpetas registradas. |

### 2.3 Commit `f0aa29d` — Selector PCGE, 14 Períodos y Análisis por Rangos (`2026-11-12 13:24:26`)

| Cambio Incluido | Estado y Regresiones Detectadas |
| :--- | :--- |
| **Nuevo componente `SelectorCuentaContable.tsx` (`258` líneas)** + integración en `HonorariosView.tsx`, `RegistroComprasView.tsx`, `SireConciliadorView.tsx` y `CatalogoCuentasDialog.tsx` | <ul><li>**Regresión crítica (`P0`):** `HonorariosView.tsx:426` y `SireConciliadorView.tsx:853` pasan la prop `label=...` que no existe en `SelectorCuentaContableProps` (`SelectorCuentaContable.tsx:6-18`), rompiendo `npm run lint` (`EXIT=1`).</li><li>**Deuda arquitectónica (`P1`):** `SelectorCuentaContable.tsx:3` importa `PLAN_CONTABLE_PCGE` estático desde `src/data/pcgeAccounts.ts`, ignorando el plan personalizado en PostgreSQL (`pcgeApi` / `plan_cuentas`).</li></ul> |
| **Gestión de `14` períodos (`00` Apertura .. `13` Cierre) en `periodoService.ts` y `PeriodosView.tsx`** | Incorpora semántica contable peruana (`00` a `13`). Sin embargo, `periodoService.ts:39-100` inyecta los períodos faltantes como fallback al listar, compensando que la creación de empresa siembra `1..12` en `empresaRepository`. |
| **Análisis de cuentas por rangos (`analisisCuentaService.ts`, `analisisCuentaRoutes.ts`, `AnalisisCuentasView.tsx`, `test_bloque_e_analisis_cuentas.ts` +`15` aserciones)** | Amplía consultas por rangos configurables. Sin embargo, **`server/routes/index.ts:89` mantuvo montado `/analisis-cuentas` sin `requireEmpresaMembership()`**, dejando expuesto un **IDOR multiempresa** sobre `req.query.empresaId` y `req.body.empresaId`. |
| **Modificación adicional en `CuentasPorCobrarView.tsx` (`+196`/-) y `CuentasPorPagarView.tsx` (`+211`/-)** | **Regresión funcional grave (`P1`):** Ambas vistas pasaron a invocar `analisisCuentasApi.obtenerMovimientos` para un solo mes en lugar de consultar saldos acumulados de cartera (`saldosService` / documentos pendientes); ante fallo o ausencia caen silenciosamente en `CARTERA_FALLBACK` / `OBLIGACIONES_FALLBACK`, y sus acciones de Cobro/Pago mutan únicamente el estado local en React. |

---

## 3. Verificación de Brechas de Auditorías Previas y Fases del Plan (`PLAN_IMPLEMENTACION.md`)

> **Nota metodológica obligatoria:** El archivo [`PLAN_IMPLEMENTACION.md`](../engineering/PLAN_IMPLEMENTACION.md) referencia los hallazgos `#1..#20` de la auditoría del `25/10/2026` agrupados por fase (`A: 19,4,2,3,1,14,15`, `B: 5,6,7,12,8,10`, `B2: 9`, `C: 11,13,18`, `D: 16,17`, `E: 20`), pero su redacción textual individual anterior no se conserva completa en el repositorio salvo para las 5 brechas consolidadas en `SISTEMA_ATLOB_ERP.md` Secciones 6–11 y los bloques A–F. Esta evaluación contrasta únicamente las evidencias verificables en el repositorio actual.

### 3.1 Evaluación de Fases del Plan Vigente (`A → B → B2 → C → D → E`)

| Fase del Plan | Criterio Exigido | Estado Real al `12/11/2026` | Brechas Abiertas Verificadas |
| :--- | :--- | :---: | :--- |
| **N (Nomenclatura)** | Cero marcas externas en producto/archivos/docs; `formato_estandar` | **COMPLETADO** | `0` hits de marcas externas en `470` archivos (incl. `docs/auditoria/`); reportes estándar integrados. |
| **A (Arranque, acceso y preparación)** | Arranque reproducible, RLS/autorización por empresa real, rol coherente, secretos completos | **PARCIAL (`NO APTO`)** | `inicializar-escritorio.ps1:75-82` omite `MFA_SEED_SECRET` y `BACKUP_ENCRYPTION_KEY` en `.env` de producción; IDOR en `/api/analisis-cuentas` y `GET /ple-exportaciones/:id`; fallback `0000...0001` y roles inexistentes en `cronogramaVencimientosRoutes`. |
| **B (Integridad y persistencia contable)** | SQL sin errores, partida doble, extornos, cuentas reales, sin fallback en memoria | **REPROBADA en PG real** | Falla creación de empresa en PG real (`23514 subdiarios_tipo_check`); `41` tablas sin `ETAPAS_RLS` y `75` FKs compuestas fuera de `migrate.ts`; `18` servicios + PDT 621 en RAM; colisiones de subdiarios `04/05/07/08` activas. |
| **B2 (Almacenamiento y respaldo por empresa — Hallazgo 9)** | Base por empresa + `registroDatosEmpresa.ts` + `archivosEmpresa.ts` + ZIP streaming + 4 pruebas PG reales | **PENDIENTE / INCOMPLETA** | Solo se construyó el registro declarativo `registroDatosEmpresa.ts` + su prueba (`81` tablas, `169` FKs). Sigue base compartida `empresa_id`, no existe `archivosEmpresa.ts`, y `backupEmpresaService` solo respalda `*_MEMORIA` en `Buffer`. |
| **C (Interfaz e informes conectados)** | Libros, estados, liquidación y exportaciones conectados al almacenamiento real | **REPROBADA / REGRESIÓN** | `7` vistas llaman rutas inexistentes (`404`); `20+` vistas usan datos estáticos; props vacíos en `conectado` (`App.tsx:168-173`); regresiones `TS2322` y CxC/CxP en `f0aa29d`; `9` vistas huérfanas. |
| **D (Integración tributaria)** | Descarga real SIRE/SUNAT sin documentos simulados | **PENDIENTE** | `sunatGateway.ts` opera con `MockSunatGateway` y fallback silencioso en `RealSunatGateway:539,567`. |
| **E (Verificación integral — `npm run verify`)** | `npm run verify` fallando si falta PostgreSQL real o falla cualquier prueba | **NO IMPLEMENTADA** | `npm run verify` no existe en `package.json`; `test:infra` y `test_pg_compra_escritorio.ts` fallan en PG real. |

### 3.2 Seguimiento de las 5 Brechas Documentadas en `SISTEMA_ATLOB_ERP.md` (`11/11/2026`)

| Brecha del `11/11/2026` | Evolución al `12/11/2026` | Estado Actual |
| :--- | :--- | :--- |
| **1. `18` servicios en `*_MEMORIA` y ausencia de `npm run verify`** | Se transparentó mediante `persistencia.ts`, banner M1 y nombre `PARCIAL` M2, pero no se migró ninguno a SQL ni se creó `npm run verify`; además se detectó PDT 621 / Ret.-Perc. en `liquidacionIGVService.ts` fuera del registro. | **ABIERTO (Mitigado solo en transparencia, no en SQL)** |
| **2. Colisión de subdiarios (`04`, `05`, `07`, `08`) y `NOMBRES_SUBDIARIOS`** | Sin corrección en el código (`empresaDemoService.ts:468`, `kardexService.ts:262`, `activosFijosService.ts:263`, `cajaChicaService.ts:136` vs `tesoreriaService.ts:498`, `librosEEFFService.ts`). Agravado por el fallo `23514` en PG real al insertar tipos de `subdiarioService.ts:10-14`. | **ABIERTO Y AGRAVADO EN PG REAL** |
| **3. Deriva documental (`Doc-Drift`)** | Reapareció una **nueva deriva crítica** tras verificar PG real: `SEGURIDAD.md:40` y `SISTEMA_ATLOB_ERP.md:344` afirman `64 tablas con RLS` y `10 con FORCE`, mientras el catálogo real `pg_class` de `atlob_test` tiene únicamente **`23` activas (todas con `FORCE`)** y **`41` sin aplicar**. | **REABIERTA (Deriva PG vs Docs)** |
| **4. `ETAPAS_RLS` fuera de `runMigrations()` y ejecución local de `test:pg`** | Ya se ejecutó `test:pg` localmente (`EXIT=0`), confirmando que `ETAPAS_RLS` (`41` tablas) y `fk_empresa_01..07.sql` (`75` FKs) solo se prueban con `ROLLBACK` y siguen sin aplicarse permanentemente. | **ABIERTO (Confirmado en PG 18.6 real)** |
| **5. `9` escenarios pendientes en `MATRIZ_COMPLETITUD_ASIENTOS.md` y supuestos tributarios** | `MATRIZ_COMPLETITUD_ASIENTOS.md` continúa idéntica: **`0 / 69` en PG real**, `60` en memoria, `4` `PARCIAL` (`ESC-C-1.03/1.07/1.08/1.11`), `5` `NO IMPLEMENTADO` (`ESC-C-1.05/1.09/1.10/1.12/1.17`) y `9` opciones `'proximamente'`. | **ABIERTO SIN AVANCES** |
