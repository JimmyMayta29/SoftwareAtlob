# Evidencias Técnicas y Registros de Verificación — ATLOB ERP

**Fecha de auditoría:** 12 de noviembre de 2026  
**Repositorio:** `c:\PROYECTOS SUNAT\Sistema Contable`  
**Rama / Commit auditado (`HEAD`):** `main` (`f0aa29d`, `2026-11-12 13:24:26 -0500`)  
**Línea base comparativa:** `9cc42f0` (`SISTEMA_ATLOB_ERP.md`, 11 de noviembre de 2026)  
**Alcance:** Registro auditado, reproducible y sanitizado de comandos, salidas, metadatos de base de datos, artefactos de compilación, cambios Git y limitaciones de verificación observadas directamente.

---

## 1. Entorno Técnico y Estado del Repositorio al Corte

| Componente / Métrica | Valor Observado Directamente | Fuente / Verificación |
| :--- | :--- | :--- |
| **Sistema Operativo** | Windows x64 | Entorno host de ejecución |
| **Node.js / npm** | `v26.13.0` / `11.20.0` | Verificación en consola (`node -v`, `npm -v`) |
| **Base de Datos Real** | PostgreSQL `18.6` (`atlob_test`, rol `contabilidad_app`, host local) | `npm run test:pg`, `pg_class` en `atlob_test` |
| **Frontend Stack** | React `^19.0.1`, Vite `v8.3.5` (`^8.3.0`), Tailwind CSS `@tailwindcss/vite` `^4.3.3`, `@tanstack/react-query` `^5.104.0`, TypeScript `7.0.2` | `package.json` y salida de `npm run build` |
| **Backend Stack** | Express `^4.21.2`, `pg` `^8.23.1`, `pg-mem` `^3.0.14`, `decimal.js` `^10.6.0`, `zod` `^4.6.5`, `jsonwebtoken` `^9.0.3`, `bcryptjs` `^3.0.3`, `tsx` `^4.21.0` | `package.json` |
| **Escritorio Windows** | Electron `45.2.3`, `electron-builder` `26.18.0`, `@electron/asar` `4.3.1` (`appId: pe.atlob.erp`) | `package.json`, `desktop/electron-builder.yml` |
| **Estado Git al Inicio** | Árbol de trabajo limpio (`git status -s` vacío) antes de crear `docs/auditoria/` | `git status -s` |
| **Conteo de Archivos Fuente** | `src/`: `172` archivos; `server/`: `193` archivos; `server/tests/`: `41` `.ts` + `7` archivos en `server/tests/real/`; `docs/auditoria/` no existía previamente | Inventario en disco del `2026-11-12` |
| **Migraciones / Servicios / Vistas** | `21` migraciones SQL en `server/db/migration-files.ts`, `81` tablas en PG real (`atlob_test`), `53` servicios en `server/services/`, `78` vistas en `src/components/views/`, `13` menús / `89` ítems hoja en `MENU_DATA` (`9` en `'proximamente'`) | Inspección de `migration-files.ts`, `atlob_test`, `src/types/menu.ts` |

---

## 2. Desfase de Artefactos Compilados en `release/`

Se verificaron los binarios presentes en `release/` respecto al commit `HEAD` (`f0aa29d`):

| Artefacto | Tamaño (bytes) | Marca Temporal Local | Estado frente a `f0aa29d` (`2026-11-12 13:24:26 -0500`) |
| :--- | :---: | :---: | :--- |
| `release/ATLOB-ERP-0.0.0-Setup-x64.exe` | `123,413,599` | `12/11/2026 13:16:27` | **Obsoleto** (`7 min 59 s` antes del commit `f0aa29d`) |
| `release/ATLOB-ERP-0.0.0-Setup-x64.exe.blockmap` | `129,675` | `12/11/2026 13:16:46` | **Obsoleto** |
| `release/ATLOB-ERP-0.0.0-Portable-x64.exe` | `112,192,628` | `12/11/2026 13:20:58` | **Obsoleto** (`3 min 28 s` antes del commit `f0aa29d`) |
| `release/builder-debug.yml` | `6,051` | `12/11/2026 13:20:58` | **Obsoleto** |
| `release/latest.yml` | `355` | `12/11/2026 13:20:58` | **Obsoleto** |

**Conclusión de evidencia:** Ningún instalador ni paquete `release/win-unpacked/resources/app.asar` contiene los cambios del commit `f0aa29d` ni refleja la regresión de compilación TypeScript introducida por ese commit.

---

## 3. Historial Verificable desde `9cc42f0` hasta `f0aa29d`

Total del rango `git diff --stat 9cc42f0..f0aa29d`: **`11` commits**, **`34 files changed, 2658 insertions(+), 333 deletions(-)`**.

| Hash | Fecha / Hora (`-0500`) | Mensaje | Clasificación Auditoría |
| :--- | :---: | :--- | :--- |
| `16ac3cd` | `2026-11-11 21:06:00` | `docs(fase3): D7 regenerar SISTEMA_ATLOB_ERP.md con mediciones reales y estado de limpieza` | Documentación |
| `dca3b7e` | `2026-11-11 21:10:21` | `docs(fase3): D9 consolidar mediciones, movimientos de Fase 3 y cierre documental` | Documentación |
| `3e9c99b` | `2026-11-12 10:53:51` | `feat(persistencia): M1.1 registro unico de modulos solo en memoria` | Transparencia / Config |
| `0416223` | `2026-11-12 10:54:26` | `feat(persistencia): M1.2 endpoint /api/sistema/persistencia y flag persistenciaCompleta en /health` | API / Observabilidad |
| `144bd03` | `2026-11-12 10:56:08` | `feat(persistencia): M1.3 banner reutilizable de datos temporales en vistas afectadas` | UI / Transparencia |
| `cd726c9` | `2026-11-12 10:56:58` | `feat(persistencia): M1.4 middleware opcional ATLOB_BLOQUEAR_MEMORIA para escrituras solo-memoria` | Seguridad / Persistencia |
| `08325e8` | `2026-11-12 10:58:28` | `test(persistencia): M1.5 pruebas de registro unico, endpoint, banner y middleware de bloqueo` | QA Automatizado |
| `798a042` | `2026-11-12 10:59:35` | `feat(backup): M2.1 campo alcance y advertencia retrocompatible en manifest.json` | Backup / Transparencia |
| `949bdb2` | `2026-11-12 11:00:28` | `feat(backup): M2.2 confirmacion previa y nombre ATLOB_respaldo_PARCIAL en UI de respaldos` | UI / Backup |
| `ac2806b` | `2026-11-12 11:02:11` | `test(backup): M2.3 pruebas de manifest parcial, retrocompatibilidad y avisos UI` | QA Automatizado |
| `f0aa29d` | `2026-11-12 13:24:26` | `feat: integracion de selector contable pcge, gestion de 14 periodos con apertura y cierre, y analisis de cuentas por rangos configurables` | Funcional / UI / API (con regresiones TS y CxC/CxP) |

### Detalle de Archivos Modificados (`git diff --stat 9cc42f0..f0aa29d`)

```text
 .env.example                                       |   6 +
 SISTEMA_ATLOB_ERP.md                               | 156 ++++----
 docs/_archivo/MEDICIONES_FASE3.md                  | 138 +++++++
 docs/_archivo/MOVIMIENTOS_FASE2.md                  |  25 +-
 docs/_archivo/README.md                            |   7 +-
 docs/engineering/ESCRITORIO_WINDOWS.md             |   2 +-
 docs/engineering/SEGURIDAD.md                      |   2 +-
 server/config/env.ts                               |   1 +
 server/config/persistencia.ts                      | 419 +++++++++++++++++++++
 server/controllers/backupEmpresaController.ts      |   3 +-
 server/routes/analisisCuentaRoutes.ts              |  11 +-
 server/routes/index.ts                             |  25 ++
 server/services/analisisCuentaService.ts           |  33 +-
 server/services/backupEmpresaService.ts            |  72 +++-
 server/services/periodoService.ts                  |  93 ++++-
 server/tests/run_all_tests.ts                      |   3 +-
 server/tests/test_bloque_e_analisis_cuentas.ts     |  44 ++-
 server/tests/test_transparencia_persistencia.ts    | 399 ++++++++++++++++++++
 src/App.tsx                                        |  17 +-
 src/api/analisisCuentasApi.ts                      |  11 +-
 src/api/sistemaApi.ts                              |  57 +++
 .../common/BannerPersistenciaTemporal.tsx          |  76 ++++
 src/components/common/SelectorCuentaContable.tsx   | 258 +++++++++++++
 src/components/desktop/TopBar.tsx                  |  93 ++++-
 src/components/modals/ModalBackupEmpresa.tsx       | 302 +++++++++++----
 src/components/modals/ModalImportacionCsv.tsx      |   5 +
 src/components/views/AnalisisCuentasView.tsx       |  86 +++--
 src/components/views/CuentasPorCobrarView.tsx      | 196 +++++++++-
 src/components/views/CuentasPorPagarView.tsx       | 211 ++++++++++-
 src/components/views/HonorariosView.tsx            |  20 +-
 src/components/views/PeriodosView.tsx              | 157 +++++---
 src/components/views/RegistroComprasView.tsx       |  39 +-
 src/components/views/SireConciliadorView.tsx       |  11 +-
 src/components/voucher/CatalogoCuentasDialog.tsx   |  13 +-
 34 files changed, 2658 insertions(+), 333 deletions(-)
```

---

## 4. Comprobaciones Ejecutadas y Códigos de Salida Reales

### 4.1 Resumen de Ejecuciones (Fecha: `2026-11-12`)

| # | Comando Ejecutado | Entorno / Alcance | Exit Code | Resultado Real Observado |
| :-: | :--- | :--- | :---: | :--- |
| 1 | `npm run lint` (`tsc --noEmit`) | TypeScript `7.0.2` sobre todo el proyecto | **`1`** | **FALLÓ**: `2` errores `TS2322` en `HonorariosView.tsx(426,17)` y `SireConciliadorView.tsx(853,23)` |
| 2 | `npm run build` (`vite build`) | Empaquetado frontend Vite `v8.3.5` | `0` | **PASÓ** en `3.14s`, `2104` módulos transformados, bundle `dist/assets/index-CxirrKtH.js` (`2,458.51 kB` / `gzip: 533.87 kB`, alerta chunk > 500 kB) |
| 3 | `npm test` (`tsx server/tests/run_all_tests.ts`) | `NODE_ENV=test`, `DATABASE_URL=''` (`pg-mem`, memoria, estático y subprocesos Node) | `0` | **PASÓ**: `37 / 37` suites, `3,552` aserciones en `138.97s` *(sin PostgreSQL real)* |
| 4 | `npm run desktop:verify` | Escaneo ASAR sobre `release/win-unpacked/resources/app.asar` | `0` | **PASÓ**: `archivos=49 \| textos=35 \| hallazgos=0` *(paquete anterior a `f0aa29d`)* |
| 5 | `npm run test:secretos-frontend` | Escaneo sobre `src + dist` | `0` | **PASÓ**: `archivos=169 \| EXIT=0` |
| 6 | Búsqueda de referencias de marca externa (`470` archivos texto/código, incl. `docs/auditoria/`) | Repositorio excluyendo `node_modules` / binarios | `0` | **PASÓ**: `BRAND_SCANNED=470 \| HITS=0` |
| 7 | `npx tsx --env-file=.env server/tests/run_tests_registro_empresa.ts` | PostgreSQL `18.6` real (`atlob_test`, rol `contabilidad_app`) | `0` | **PASÓ**: `81` tablas, `169` FK; valida omisiones, dependencias y exclusiones *(sin `--env-file=.env` falla con exit `1` pidiendo `REGISTRO_TEST_DATABASE_URL` o `TEST_DATABASE_URL`)* |
| 8 | `npm run test:pg` (`test_pg_rls_planillas.ts && test_pg_seguridad.ts`) | PostgreSQL `18.6` real (`atlob_test`, rol `contabilidad_app`) | `0` | **PASÓ**: `21` migraciones, `1,629` cuentas PCGE, RLS en `23` tablas, concurrencia e inmutabilidad; aplica `ETAPAS_RLS` (`41` tablas) y `fk_empresa_01..07.sql` (`75` FK) **solo bajo rollback transaccional** |
| 9 | `npx tsx server/tests/real/test_pg_compra_escritorio.ts` | PostgreSQL `18.6` real (`atlob_test`) | **`1`** | **FALLÓ**: error al crear empresa por `SQLSTATE 23514` (`subdiarios_tipo_check`) |
| 10 | `npm run test:infra` (`tsx server/tests/real/test_infra.ts`) | PostgreSQL `18.6` real (`atlob_test`, `contabilidad_app`) | **`1`** | **FALLÓ**: `SQLSTATE 42501` (`se ha denegado el permiso para crear la base de datos` en `test_infra.ts:55`) |
| 11 | `npm run test:pg:docker` (`tsx server/tests/real/test_pg_docker.ts`) | Docker Desktop | `0` | **OMITIDO (SKIP)**: salida `0` porque Docker no está instalado/en `PATH` |
| 12 | Inspección directa `pg_class` en `atlob_test` | PostgreSQL `18.6` real | `0` | `TOTAL=81` tablas: `23` con `RLS+FORCE` permanentes y `58` sin RLS (`41` de `ETAPAS_RLS` no aplicadas + `17` de control/compartidas) |
| 13 | Verificación visual en navegador real (Chrome DevTools) | Servidor local + Chrome | — | **NO VERIFICABLE**: error de infraestructura `DevToolsActivePort file doesn't exist` al lanzar el subagente de navegador |

---

### 4.2 Salida Exacta de Errores en `npm run lint` (`EXIT_LINT=1`)

```text
src/components/views/HonorariosView.tsx(426,17): error TS2322: Type '{ value: string; onChange: (c: string) => void; filtroPrefijo: string; label: string; placeholder: string; }' is not assignable to type 'IntrinsicAttributes & SelectorCuentaContableProps'.
  Property 'label' does not exist on type 'IntrinsicAttributes & SelectorCuentaContableProps'.
src/components/views/SireConciliadorView.tsx(853,23): error TS2322: Type '{ label: string; value: string; onChange: (c: string) => void; placeholder: string; }' is not assignable to type 'IntrinsicAttributes & SelectorCuentaContableProps'.
  Property 'label' does not exist on type 'IntrinsicAttributes & SelectorCuentaContableProps'.
```

**Evidencia complementaria (`src/components/common/SelectorCuentaContable.tsx:3, 6-18`):**  
`SelectorCuentaContableProps` no declara `label?: string`, provocando la falla `TS2322` al recibir `label=...` en ambos formularios. Adicionalmente, en la línea 3 importa `PLAN_CONTABLE_PCGE` y `buscarCuentaPCGE` desde `../../data/pcgeAccounts` (catálogo estático local, sin consultar `pcgeApi`).

---

### 4.3 Detalle Completo de las `37` Suites de `npm test` (`3,552` aserciones en `138.97s`)

Todas ejecutadas con `NODE_ENV=test` y `DATABASE_URL=''` (sin PostgreSQL real):

| # | Archivo de Suite | Aserciones | Duración |
| :-: | :--- | :---: | :---: |
| 01 | `src/api/session.test.ts` | 13 | 0.88s |
| 02 | `server/tests/run_tests_acceso.ts` | 29 | 2.91s |
| 03 | `server/tests/verificar_auth_setup.ts` | 54 | 5.89s |
| 04 | `server/tests/run_tests.ts` | 28 | 1.79s |
| 05 | `server/tests/run_tests_fase3.ts` | 27 | 1.68s |
| 06 | `server/tests/run_tests_fase4.ts` | 46 | 1.68s |
| 07 | `server/tests/run_tests_fase5.ts` | 42 | 1.44s |
| 08 | `server/tests/run_tests_fase6.ts` | 80 | 3.02s |
| 09 | `server/tests/test_secretos_frontend.ts` | 4 | 2.34s |
| 10 | `server/tests/test_sonda_sunat.ts` | 346 | 3.55s |
| 11 | `server/tests/run_tests_fase7.ts` | 67 | 3.37s |
| 12 | `server/tests/run_tests_fase7b.ts` | 34 | 1.67s |
| 13 | `server/tests/run_tests_fase7c2.ts` | 40 | 1.72s |
| 14 | `server/tests/run_tests_fase8.ts` | 31 | 3.10s |
| 15 | `server/tests/run_tests_fase9.ts` | 43 | 1.91s |
| 16 | `server/tests/run_tests_fase10.ts` | 115 | 1.35s |
| 17 | `server/tests/run_tests_fase11.ts` | 85 | 1.48s |
| 18 | `server/tests/run_tests_fase13_cobertura.ts` | 74 | 1.49s |
| 19 | `server/tests/run_tests_fase13_demo.ts` | 20 | 1.63s |
| 20 | `server/tests/run_tests_fase13_backup.ts` | 47 | 1.88s |
| 21 | `server/tests/run_tests_fase13_importacion.ts` | 43 | 1.35s |
| 22 | `server/tests/run_tests_menu_fase1.ts` | 374 | 0.41s |
| 23 | `server/tests/run_tests_fase4_tributos.ts` | 66 | 1.49s |
| 24 | `server/tests/run_tests_fase5_planillas.ts` | 199 | 2.50s |
| 25 | `server/tests/test_produccion_sin_db.ts` | 82 | 67.25s |
| 26 | `server/tests/run_tests_reportes_y_vouchers_normativos.ts` | 174 | 3.67s |
| 27 | `server/tests/run_tests_automatizacion_asientos_y_cinta.ts` | 58 | 1.64s |
| 28 | `server/tests/test_marca_y_login_seguridad.ts` | 59 | 2.84s |
| 29 | `server/tests/test_bloque_c_reportes.ts` | 47 | 2.27s |
| 30 | `server/tests/test_bloque_b_plan_contable.ts` | 796 | 0.95s |
| 31 | `server/tests/test_bloque_a_subdiarios.ts` | 30 | 1.28s |
| 32 | `server/tests/test_bloque_f_hallazgos.ts` | 20 | 1.12s |
| 33 | `server/tests/test_bloque_e_analisis_cuentas.ts` | 44 | 0.94s |
| 34 | `server/tests/test_asiento_completo_subdiarios.ts` | 184 | 1.28s |
| 35 | `server/tests/test_migrate_crlf_lf.ts` | 4 | 0.26s |
| 36 | `scripts/verificar-matriz.ts` | 0 *(validador)* | 0.47s |
| 37 | `server/tests/test_transparencia_persistencia.ts` | 147 | 4.46s |
| **Total** | **37 suites (`EXIT=0`)** | **3,552** | **138.97s** |

---

## 5. Evidencia Directa sobre PostgreSQL 18.6 Real (`atlob_test`)

### 5.1 Estado Real de RLS en Catálogo `pg_class` (`81` Tablas)

Consulta directa de solo lectura sobre `atlob_test` (`contabilidad_app`):

- **Total de tablas en `public`:** `81`
- **Tablas con `relrowsecurity = true` y `relforcerowsecurity = true` activos permanentemente (`23`):**  
  `aplicaciones_cobranza`, `aplicaciones_pago`, `asiento_detalle`, `asientos`, `asientos_recurrentes`, `auditoria_log`, `centros_costo`, `comprobantes_compra`, `comprobantes_venta`, `correlativos`, `cuentas_por_cobrar`, `cuentas_por_pagar`, `detracciones`, `liquidaciones_beneficios`, `marcas_analisis_cuenta`, `planilla_cts`, `planilla_gratificaciones`, `planillas`, `reglas_contabilizacion`, `reglas_contabilizacion_detalle`, `retenciones_percepciones_igv`, `trabajadores`, `tregistro_movimientos`.
- **Tablas con `relrowsecurity = false` en el esquema real (`58`):**
  - **Grupo A — `41` tablas definidas en `ETAPAS_RLS` (`5.1..5.3`) de `server/db/seguridadRls.ts` pero NO aplicadas por `runMigrations()` (`seguridadRls.ts:50`):**  
    `anexos`, `auditoria`, `cajas_chicas`, `comprobantes_xml`, `conceptos_planilla`, `conciliaciones_bancarias`, `config_estados_financieros`, `configuracion_reportes`, `consolidaciones_mensuales`, `credenciales_sunat`, `cuentas_financieras`, `daot_exclusiones`, `declaraciones_pdt621`, `declaraciones_prorrata_igv`, `declaraciones_renta_anual`, `ejercicios`, `extracto_lineas`, `extractos_bancarios`, `membresias`, `movimientos_tesoreria`, `periodos`, `plan_cuentas`, `planilla_lineas`, `ple_exportaciones`, `provisiones_sociales`, `recibos_honorarios`, `refresh_tokens`, `rendiciones_caja_chica`, `reportes_generados`, `saldos_mensuales`, `sire_conciliacion_lineas`, `sire_conciliaciones`, `sire_propuesta_lineas`, `sire_propuestas`, `subdiarios`, `sunat_conexiones`, `sunat_empresa_keys`, `sunat_jobs`, `sunat_tokens`, `transferencias_cuentas`, `usuario_empresa`.
  - **Grupo B — `17` tablas de control o catálogos compartidos sin RLS (`relrowsecurity = false`):**  
    `catalogos_sunat`, `cronograma_vencimientos`, `empresas`, `estudio_configuracion`, `licencia`, `parametros_tributarios`, `pcge_base`, `permisos`, `plantilla_pcge`, `ple_libros_config`, `rol_permisos`, `roles`, `schema_migrations`, `tenants`, `tipos_cambio`, `usuarios`, `usuarios_estudio`.

**Contraste documental observado:** `docs/engineering/SEGURIDAD.md:40` y `SISTEMA_ATLOB_ERP.md:344` reportan `64 tablas con RLS` y `10 con FORCE ROW LEVEL SECURITY`; la base PostgreSQL 18.6 real demuestra solo **`23` activas permanentemente (todas con `FORCE`)** y **`41` desactivadas por falta de ejecución en `migrate.ts`**.

### 5.2 Pruebas Positivas y Fallos Reales en `atlob_test`

- `npm run test:pg` (`EXIT=0`):
  - Verificó `21` migraciones, `1,629` cuentas PCGE, `FORCE RLS`, trigger append-only en `auditoria_log`, `fn_inmutabilidad_asiento`, contención concurrente (`WORKER_1_GANO` vs `ASIENTO_YA_CONTABILIZADO`), `trg_asiento_partida_doble` (`SQLSTATE P0001`), aplicación transaccional con rollback de `ETAPAS_RLS` (`ROLLBACK_RLS_COMPLETO=OK`) y `fk_empresa_01..07.sql` (`75` FK compuestas, `ROLLBACK_FK_COMPLETO=OK`).
- `run_tests_registro_empresa.ts --env-file=.env` (`EXIT=0`):
  - `Registro verificado contra PostgreSQL real: 81 tablas, 169 FK; omisiones de empresa/hija, dependencias y exclusiones comprobadas.`
- `test_pg_compra_escritorio.ts` (**`EXIT=1`**):
  - Falla al crear empresa en PostgreSQL real con **`SQLSTATE 23514` (`subdiarios_tipo_check`)** en `test_pg_compra_escritorio.ts:56`.
  - **Causa verificada:** `server/db/schema.sql:189-191` restringe `CHECK (tipo IN ('APERTURA','COMPRAS','VENTAS','COBRANZAS','PAGOS','BANCOS','HONORARIOS','PLANILLA','DESTINO','CIERRE'))`, mientras `server/services/subdiarioService.ts:10-14` inserta `'CAJA'`, `'BANCO'`, `'DIARIO'`, `'PROVISIONES'` y `'AJUSTES'`.
- `npm run test:infra` (**`EXIT=1`**):
  - Falla en `test_infra.ts:55` con **`SQLSTATE 42501`: se ha denegado el permiso para crear la base de datos** bajo `contabilidad_app`. Asimismo, `server.ts:89` emite el log `'🚀 [Server] Sistema disponible en ...'`, distinto al patrón esperado por `test_infra.ts:38`.

---

## 6. Evidencia de Normativa Peruana 2026 Contrastada

Verificado contra fuentes oficiales y comparado contra `server/repositories/parametroRepository.ts` y `docs/NORMAS_VERIFICADAS.md`:

| Norma / Concepto | Vigencia Oficial Verificada 2026 | Estado en ATLOB ERP (`parametroRepository.ts` / Código) |
| :--- | :--- | :--- |
| **UIT 2026** | **S/ 5,500.00** (`D.S. N° 301-2025-EF`, publicado 17/12/2025) | Parametrizada correctamente en `VALOR_UIT_2026` y `UIT` (`parametroRepository.ts:43, 66`). |
| **RMV 2026** | **S/ 1,130.00** (`01/01/2025`–`30/09/2026`, `D.S. N° 006-2024-TR`); **S/ 1,230.00** desde `01/10/2026` (`D.S. N° 015-2026-TR` tramo 1; tramo 2 a `S/ 1,300` sujeto a decreto posterior) | Parametrizada correctamente por vigencia en `parametroRepository.ts:63-65`; además se replican constantes estáticas en `ParametrosTributariosView.tsx:33-35`. |
| **IGV MYPE Restaurantes / Hoteles** | **Ley 32219**: IGV `8%` + IPM `2%` = **`10%`** (`2025`–`2026`); `12%` + `2%` = **`14%`** (`2027`); no incluye catering | Documentado en `docs/NORMAS_VERIFICADAS.md`; sin tabla ni parámetro específico para `TASA_IGV` histórica/reducida en `PARAMETROS_IN_MEMORY` (`TASA_IGV = 0.18`). En vistas admite ingreso con alerta. |
| **Detracciones / Retenciones / Percepciones** | R.S. `037-2002/SUNAT` (umbral `S/ 700`, Art. 5 inc. b/f/h), Ley `29173` Art. 11 | Bloqueo simultáneo Retención + Percepción verificado en motor tributario; PDT 621 en `liquidacionIGVService.ts` usa memoria para `RETENCIONES_PERCEPCIONES_IGV_MEMORIA`. |
| **DAOT Operaciones con Terceros** | Umbral por tercero **`2 UIT`** (`S/ 11,000` en 2026) + obligación por ingresos/adquisiciones **`> 75 UIT`** (`S/ 412,500` en 2026) | `daotService.ts` solo opera sobre `COMPRAS_MEMORIA`/`VENTAS_MEMORIA` (`NO_PG`) y **omite el filtro legal de obligatoriedad de 75 UIT**. |
| **PCGE 2026** | `Resolución CNC N° 002-2026-EF/30`: adopción anticipada opcional; obligatoria desde **`01/01/2028`** | Migraciones `schema_fase13/16/17` (`1,629` cuentas) y `cargarPcgeStaging.ts`; sin embargo, `SelectorCuentaContable.tsx` usa el arreglo estático `PLAN_CONTABLE_PCGE`. |
| **Prorrata de IGV (diciembre)** | TUO LIGV Art. 23; Reglamento LIGV Art. 6 num. 6 pendiente de contraste directo | `prorrataIgvService.ts` permanece solo en memoria (`NO_PG`) y bajo `SUPUESTO A VALIDAR`. |

---

## 7. Limitaciones de Esta Auditoría

1. **Inspección visual ejecutada vía navegador en vivo:** Bloqueada a nivel de host porque el subagente de navegador no pudo conectarse a Chrome DevTools (`DevToolsActivePort file doesn't exist`). Todo hallazgo visual/UX se sustenta exclusivamente en lectura e inspección directa de los `78` archivos de vistas, `src/App.tsx`, `src/types/menu.ts`, `src/index.css` y modales, sin inferir comportamientos no observados en código.
2. **Docker (`test:pg:docker`):** Omitido (`EXIT=0` por ausencia de Docker en el equipo), compensado parcialmente mediante ejecución directa contra PostgreSQL `18.6` local (`atlob_test`).
3. **Empaquetado Electron posterior a `f0aa29d`:** Al ser una auditoría estrictamente de solo lectura sobre el código fuente existente, no se recompilaron los binarios de `release/` (permanecen con fecha previa al commit `f0aa29d`).
