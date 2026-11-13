# Auditoría Integral Actualizada — ATLOB ERP

**Fecha de evaluación:** 12 de noviembre de 2026  
**Repositorio y rama:** `c:\PROYECTOS SUNAT\Sistema Contable` (`main`, `HEAD f0aa29d`, corte de código posterior a `9cc42f0`)  
**Documentos complementarios de esta auditoría:**
- [Comparativo de Auditorías (`9cc42f0` vs `f0aa29d`)](./COMPARATIVO_AUDITORIAS_ATLOB.md)
- [Matriz Funcional, de Persistencia y de Pruebas](./MATRIZ_FUNCIONAL_Y_PRUEBAS_ATLOB.md)
- [Catálogo de Hallazgos y Plan de Mejoras (`A → E`)](./HALLAZGOS_Y_PLAN_DE_MEJORAS_ATLOB.md)
- [Evidencias Técnicas y Registros de Verificación](./EVIDENCIAS_AUDITORIA_ATLOB.md)

---

## 1. Dictamen Ejecutivo General

### Veredicto: **NO APTO PARA PRODUCCIÓN**

ATLOB ERP cuenta con una base técnica y normativa ambiciosa —reglas contables/tributarias peruanas parametrizadas con `decimal.js`, empaquetado Electron Windows sólido en aislamiento IPC y cifrado DPAPI, bloqueos optimistas y triggers de inmutabilidad en PostgreSQL, y una mejora reciente de transparencia (`M1`/`M2`) que expone explícitamente las limitaciones de persistencia en memoria y backups parciales—. **Sin embargo, el sistema NO está listo para operar con contabilidad real de clientes en producción ni en estudios multiusuario** por causas bloqueantes verificadas directamente:

1. **Regresión de compilación TypeScript activa:** `npm run lint` (`tsc --noEmit`) falla con **`EXIT=1`** (`2` errores `TS2322` en `HonorariosView.tsx:426` y `SireConciliadorView.tsx:853`) introducidos en `f0aa29d`; además, los instaladores `release/*.exe` datan de minutos **antes** de `f0aa29d`.
2. **Fallo bloqueante en PostgreSQL 18 real al crear empresas:** `test_pg_compra_escritorio.ts` aborta con **`SQLSTATE 23514` (`subdiarios_tipo_check`)** porque `schema.sql:189-191` rechaza los tipos `'CAJA'`, `'BANCO'`, `'DIARIO'`, `'PROVISIONES'` y `'AJUSTES'` insertados por `subdiarioService.ts:10-14`.
3. **Aislamiento RLS y FKs compuestas incompletos en la base real (`atlob_test`):** El catálogo `pg_class` confirma únicamente **`23` de `81` tablas con RLS+FORCE activo**; las **`41` tablas de `ETAPAS_RLS` (`seguridadRls.ts`) y `75` FKs compuestas (`fk_empresa_01..07.sql`) nunca se ejecutan en `runMigrations()`** (solo corren dentro de `ROLLBACK` en `test:pg`), generando además deriva documental frente a `SEGURIDAD.md:40`.
4. **Brechas IDOR activas en rutas Express:** El montaje paralelo `/api/analisis-cuentas` (`server/routes/index.ts:89`, `analisisCuentaRoutes.ts`) omite `requireEmpresaMembership()` y RLS por empresa; `GET /ple-exportaciones/:id` (`pleRoutes.ts:20`, `pleController.ts:115-124`) no valida pertenencia del registro consultado respecto a `req.empresaId`.
5. **`18` módulos críticos y PDT 621 siguen sin persistencia SQL:** Planillas, Honorarios, Caja Chica, Conciliación Bancaria, Conciliador SIRE, PLE, Cierre Anual, Prorrata, DAOT, DJ Renta Anual, Kardex, Activos Fijos y Backups operan exclusivamente sobre arrays `*_MEMORIA`; a ello se suma que **`liquidacionIGVService.ts` almacena `DECLARACIONES_PDT621_MEMORIA` y `RETENCIONES_PERCEPCIONES_IGV_MEMORIA` en RAM sin figurar en `MODULOS_SOLO_MEMORIA`**.
6. **Frontend parcialmente desconectado y regresiones en `f0aa29d`:** `7` vistas llaman rutas inexistentes (`404`) simulando éxito, `20+` vistas muestran datos estáticos/hardcoded (`BalanceGeneralView`, `DaotView`, `ParametrosTributariosView`, etc.), `App.tsx:168-173` deja vacías vistas basadas en props en modo conectado, `CuentasPorCobrarView` y `CuentasPorPagarView` introdujeron regresiones en `f0aa29d` y existen `9` vistas huérfanas sin ruta.
7. **Arquitectura B y compuerta `npm run verify` incumplidas:** No existe base PostgreSQL por empresa, no existe `server/storage/archivosEmpresa.ts`, `backupEmpresaService` solo exporta `*_MEMORIA` en `Buffer` (Hallazgo 9 abierto), y `package.json` carece de `npm run verify` mientras `test:infra` falla (`42501`).

---

## 2. Clasificación Epistémica de Hallazgos de Auditoría

| Categoría de Evidencia | Qué Cubre en Esta Auditoría |
| :--- | :--- |
| **Verificado directamente** | Salidas reales de `npm run lint`, `npm run build`, `npm test` (`37/37` suites, `3,552` aserciones en memoria/`pg-mem`), `desktop:verify`, `test:secretos-frontend`, escaneo de `470` archivos sin marcas externas (incluidos `docs/auditoria/`), ejecuciones contra **PostgreSQL 18.6 real** (`test:pg`, `run_tests_registro_empresa.ts`, `test_pg_compra_escritorio.ts`, `test:infra`, inspección directa `pg_class`), `git log`/`diff` `9cc42f0..f0aa29d`, marcas temporales de `release/`, e inspección de código en `src/`, `server/`, `desktop/` y `scripts/`. |
| **Documentado** | Especificación de arquitectura B, fases `N → A → B → B2 → C → D → E` y exclusiones en `PLAN_IMPLEMENTACION.md`, `MATRIZ_COMPLETITUD_ASIENTOS.md` (`69` escenarios), `NORMAS_VERIFICADAS.md`, `SEGURIDAD.md`, `BACKUP_BASE_DATOS.md`, `ESCRITORIO_WINDOWS.md` y `SISTEMA_ATLOB_ERP.md`. *(Se contrastó cada documento contra código real, detectando deriva en RLS y cumplimiento de fases.)* |
| **Inferido** | Riesgo operacional concreto ante uso real en estudio contable (p. ej. pérdida de planillas/PDT 621 al reiniciar o confusión de subdiarios en fiscalización) derivado de la arquitectura observada; señalado explícitamente cuando aplica. |
| **No verificable en este entorno** | **Inspección visual ejecutada en Chrome en vivo** (subagente bloqueado por `DevToolsActivePort file doesn't exist`) y **suite Docker** (`test:pg:docker` omitida por no haber Docker instalado en host Windows). Toda evaluación UX/UI proviene de lectura directa de componentes React, CSS y mapa de navegación. |

---

## 3. Auditoría por Dimensiones

### A. Arquitectura, Dependencias y Acoplamientos
- **Stack verificado (`package.json`):** React `^19.0.1`, Vite `v8.3.5`, Tailwind CSS `^4.3.3` vía `@tailwindcss/vite`, `@tanstack/react-query` `^5.104.0`, TypeScript `7.0.2`, Express `^4.21.2`, `pg` `^8.23.1`, `pg-mem` `^3.0.14`, `decimal.js` `^10.6.0`, `zod` `^4.6.5`, Electron `45.2.3`, `electron-builder` `26.18.0`.
- **Volumen estructural:** `src/` (`172` archivos: `78` vistas, `12` modales, `20` módulos en `src/api/`, `9` hooks), `server/` (`193` archivos: `53` servicios, `26` routers montados en `server/routes/index.ts`, `12` controladores, `3` middlewares, `3` repositorios), `server/db/` (`21` migraciones en `migration-files.ts`, `7` scripts `fk_empresa_01..07.sql`), `desktop/` (`18` archivos fuera de `generated/`).
- **Puntos de acoplamiento y deuda:**
  - Persistencia dual acoplada mediante arreglos globales `*_MEMORIA` dentro de servicios que también importan repositorios (`24` híbridos vs `18` solo memoria vs `11` helpers), impidiendo una frontera limpia en producción.
  - Estado global mezclado en `src/App.tsx` (`1,050` líneas): coexisten `useQuery`/hooks por vista con `dataState` por props (vacío en modo conectado `App.tsx:168-173`).
  - Duplicación de catálogos (`pcgeAccounts.ts` en `SelectorCuentaContable` vs `pcgeService` en PG; `ParametrosTributariosView` vs `parametroRepository`) y artefactos sin uso (`reportesApi.ts`, `useEmpresas.ts`, `9` vistas huérfanas en `src/components/views/`).
  - Bundle frontend monolítico (`2,458.51 kB` / `533.87 kB` gzip) sin división de carga por ruta/vista (`React.lazy`).

### B. Cambios Recientes (`9cc42f0..f0aa29d`)
- **`11` commits (`34` archivos, `+2,658/-333`):**
  - `M1` (`3e9c99b..08325e8`): registro único `server/config/persistencia.ts`, `/api/sistema/persistencia`, `persistenciaCompleta` en `/health`, `ATLOB_BLOQUEAR_MEMORIA`, `BannerPersistenciaTemporal` y Suite 37 (`147` aserciones). **Vacíos:** omite `liquidacionIGVService.ts` (PDT 621 / Ret.-Perc. en RAM) y oculta banner en `development`.
  - `M2` (`798a042..ac2806b`): etiqueta `PARCIAL` en `manifest.json`, nombre `ATLOB_respaldo_PARCIAL` y modal de confirmación. Mejora transparencia, pero no cierra Fase B2 / Hallazgo 9.
  - `f0aa29d` (`2026-11-12 13:24`): integra `SelectorCuentaContable`, gestión de `14` períodos (`00..13`) y análisis de cuentas por rangos (`+15` aserciones), pero introduce **dos regresiones críticas**: rotura de `npm run lint` (`TS2322` en `HonorariosView` y `SireConciliadorView`) y regresión funcional en `CuentasPorCobrarView` / `CuentasPorPagarView` (consultan 1 mes de movimientos con fallbacks estáticos). Ver [Comparativo completo](./COMPARATIVO_AUDITORIAS_ATLOB.md).

### C. Auditoría Visual, UX/UI y Navegación *(Análisis Estático por Ausencia de Chrome DevTools)*
- **Estructura de navegación (`src/types/menu.ts`, `TopBar.tsx`, `App.tsx`):** Menú superior tipo escritorio (`13` menús, `89` ítems hoja, `9` `'proximamente'`, paleta de comandos `Ctrl+Shift+P` y atajos `F2`/`F3`).
- **Hallazgos verificables en código:**
  - **Desconexión masiva en UI:** `7` vistas ejecutan `fetch()` a rutas inexistentes (`404`) fingiendo éxito o cayendo en mock (`H-09`), y `20+` vistas operan con tablas hardcoded/mock sin API (`H-12`).
  - **Estados vacíos silenciosos en producción:** `App.tsx:168-173` deja vacías las vistas basadas en props (`LibroMayorView`, `HojaTrabajo10ColumnasView`, `LiquidacionTributariaView`, `ConsolidarMesView`).
  - **Falsa persistencia al editar empresa:** `ConfigEmpresaModal` (`App.tsx:837-850`) actualiza únicamente `empresasLista` en React sin llamar API.
  - **Inconsistencia visual y fricción para asistentes contables:** Mezcla de estilos con colores hex inline `#...` (p. ej. `BalanceGeneralView.tsx`) y utilidades Tailwind `slate-*` (p. ej. `HonorariosView.tsx:356+`), `9` vistas huérfanas paralelas (`CajaChicaView` vs `3` vistas sueltas, `ActivosKardexView` vs `4` ítems `'proximamente'`, `ProcesosCierreView`), ausencia de atributos `aria-*` sistemáticos en grillas y falta de flujo directo XML UBL → Registro de Compras sin redigitación.

### D. Auditoría Funcional de Todos los Módulos
Resumen de los `89` ítems del menú + `LoginView` + `9` vistas huérfanas (detalle fila por fila en la [Matriz Funcional](./MATRIZ_FUNCIONAL_Y_PRUEBAS_ATLOB.md)):
- **Implementado y parcialmente probado en PG real (con errores abiertos):** Contabilidad base (`asientoService` concurrencia/inmutabilidad en `test:pg`), Compras/Ventas (bloqueadas en creación de empresa PG por `23514`), `analisisCuentaService` (con brecha IDOR en montaje `/analisis-cuentas`) y `periodoService` (`14` períodos, semilla asimétrica `00/13`).
- **Implementado solo en memoria (`NO_PG`):** Planillas (`7` vistas), Honorarios, Caja Chica (`3` vistas), Conciliación Bancaria, Conciliador SIRE, PLE `5.2`, Cierre Anual, Prorrata IGV, DAOT, DJ Renta Anual, Auditoría Preventiva, Kardex, Activos Fijos, Importación CSV/XML y Respaldos (**`18` servicios registrados + PDT 621 / Ret.-Perc. en `liquidacionIGVService.ts`**).
- **Roto (`404` UI→API) / Estático / Demo / `'proximamente'`:** `7` vistas `404`, `20+` vistas estáticas (`BalanceGeneral`, `EstadoResultados`, `FlujoEfectivo`, `Parametros`, `Cronograma`, `ClientesProveedores`, `CentrosCosto`, etc.), `9` `'proximamente'` y `9` vistas huérfanas.

### E. Contabilidad y Normativa Tributaria Peruana 2026
- **Alineado normativamente en motor en memoria/repositorios:**
  - Aritmética decimal `decimal.js` (`Half-Up`) y ajuste de redondeo multimoneda USD→PEN (`redondeoUsdService.ts`).
  - **UIT 2026** `S/ 5,500.00` (`D.S. 301-2025-EF`), **RMV 2026** `S/ 1,130.00` hasta `30/09/2026` y `S/ 1,230.00` desde `01/10/2026` (`D.S. 015-2026-TR` tramo 1; segundo tramo a `S/ 1,300` inactivo `9999-12-31`), reglas de AFP/ONP/5ta/Gratificaciones/CTS y bloqueo simultáneo Retención + Percepción (`R.S. 037-2002`, `Ley 29173`).
  - Catálogo PCGE `2026` (`Resolución CNC N° 002-2026-EF/30`, obligatoria desde `01/01/2028`) cargado con `1,629` cuentas en PG y herramienta de staging `cargarPcgeStaging.ts`.
- **Inconsistencias y riesgos contables activos (`H-02`, `H-07`, `H-13`, `H-17`):**
  - **Colisiones de subdiarios (`04`, `05`, `07`, `08`):** Planillas vs Kardex comparten `'07'`; `empresaDemoService:468` usa `'04'` para Planillas; `cajaChicaService:136` y `tesoreriaService:498` usan `'05'`; `librosEEFFService.ts` mantiene el mapa legado `NOMBRES_SUBDIARIOS`.
  - **Ruptura PCGE dinámico:** `SelectorCuentaContable.tsx:3` usa catálogo estático cliente en vez de `plan_cuentas` de la empresa.
  - **DAOT incompleto:** `daotService.ts` lee solo arrays en memoria y omite validar obligatoriedad (`> 75 UIT`).
  - **Matriz de asientos y supuestos tributarios:** `0 / 69` escenarios probados en PostgreSQL real (`4` `PARCIAL`, `5` `NO IMPLEMENTADO` en Compras); **Ley 32219 (`8%` IGV / `10%` total 2025-2026; `12%` / `14%` 2027)** carece de parámetro parametrizado en `PARAMETROS_IN_MEMORY` (`TASA_IGV = 0.18`); y continúan abiertos los `SUPUESTO A VALIDAR` en Prorrata de diciembre e inventario periódico (`6111`/`20111`).

### F. Base de Datos PostgreSQL 18, Seguridad, Autorización y Auditoría
- **Fortalezas reales confirmadas en `atlob_test`:** Validación estricta de los `5` secretos en `production` (`env.ts`), MFA TOTP configurable, cadena hash + trigger append-only en `auditoria_log`, trigger `trg_asiento_partida_doble`, bloqueo optimista y concurrencia probados en `test:pg`.
- **Vulnerabilidades y fallos críticos (`H-02`, `H-03`, `H-04`, `H-16`, `H-18`):**
  - `58` de `81` tablas carecen de RLS en `atlob_test` (`41` políticas de `ETAPAS_RLS` y `75` FKs compuestas solo existen en scripts no aplicados por `migrate.ts`).
  - IDOR multiempresa activo en `/api/analisis-cuentas` (`server/routes/index.ts:89`), IDOR en `GET /ple-exportaciones/:id` (`pleController.ts:115-124`), rol/actor fallback en `cronogramaVencimientosRoutes.ts` (`0000...0001` / `usr-admin-01`) y `activosKardexRoutes.ts` (`req.body.userId`).
  - `scripts/inicializar-escritorio.ps1:75-82` genera `.env` de producción incompleto (sin `MFA_SEED_SECRET` ni `BACKUP_ENCRYPTION_KEY`); `server.ts:46` aplica `cors()` abierto en modo no escritorio; tokens JWT residen en `localStorage` (`src/api/session.ts`).
  - `sunatGateway.ts:539,567` degrada silenciosamente errores de `RealSunatGateway` hacia comprobantes ficticios `[SIMULADO]`.

### G. Respaldos y Arquitectura B (`PLAN_IMPLEMENTACION.md`)
- **Estado real:** Aunque `server/storage/registroDatosEmpresa.ts` cuadra las `81` tablas y `169` FKs en PostgreSQL (`run_tests_registro_empresa.ts` PASS) y M2 rotula honestamente el archivo como `ATLOB_respaldo_PARCIAL`, **la Arquitectura B (base por empresa) y el respaldo/restauración reales (Fase B2 / Hallazgo 9) NO están implementados**: se usa base única compartida, falta `archivosEmpresa.ts`, y `backupEmpresaService.ts` opera únicamente sobre `*_MEMORIA` en `Buffer`.

### H. Aplicación de Escritorio Windows (Electron)
- **Aspectos sólidos:** `desktop/main.cjs` y `desktop-config.cjs` implementan `BrowserWindow` con `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `devTools: false`, bloqueo de permisos y navegación externa, almacenamiento DPAPI (`safeStorage` → `instalacion.bin`), validación localhost estricta, rechazo de roles `PG` con `rolsuper`/`rolbypassrls` (`server.ts` / `verificarBaseEscritorio`) y escaneo post-empaquetado ASAR (`desktop:verify` con `0` hallazgos).
- **Pendientes críticos:** Los instaladores en `release/` (`13:16–13:20`) están **desfasados** respecto a `HEAD f0aa29d` (`13:24:26`); `test_pg_compra_escritorio.ts` falla en PG real (`23514`); e `inicializar-escritorio.ps1` (arranque alternativo por script) genera `.env` inválido para `NODE_ENV=production`.

### I. Calidad, QA, CI/CD y Mantenibilidad
- **`npm test` (`37/37` suites, `3,552` aserciones en `138.97s`):** Excelente velocidad para reglas de negocio en memoria/`pg-mem`, pero crea **falsa sensación de cobertura**, ocultando `npm run lint` roto (`EXIT=1`), `test_pg_compra_escritorio.ts` roto en PG real (`23514`), `test:infra` roto (`42501`), `18` servicios sin SQL y `7` vistas llamando endpoints `404`.
- **`npm run verify` (Fase E):** Ausente en `package.json`; `.github/workflows/test-pg.yml` existe pero no sustituye una compuerta local única obligatoria antes de entrega.

---

## 4. Ruta Crítica Recomendada para Llegar a Producción

Siguiendo estrictamente la secuencia **`A → B → B2 → C → D → E`** definida en `AGENTS.md`:

| Orden | Fase | Meta de Compuerta Obligatoria | Hallazgos Clave |
| :-: | :---: | :--- | :--- |
| **1** | **Urgente + A** | Corregir `TS2322` (`npm run lint` = `0`); cerrar IDORs (`/analisis-cuentas`, `GET /ple-exportaciones/:id`, `cronograma`, `activosKardex`), completar `inicializar-escritorio.ps1`, restringir `cors()` y aplicar permanentemente `ETAPAS_RLS` (`41` tablas) + `fk_empresa_01..07.sql` (`75` FK) en `migrate.ts` (o transición Arquitectura B). | `H-01`, `H-03`, `H-04`, `H-16` |
| **2** | **B** | Corregir `subdiarios_tipo_check` (`23514`) logrando crear empresa en PG real; unificar subdiarios `00..11` sin colisiones; migrar `18` servicios `*_MEMORIA` + `liquidacionIGVService` (PDT 621/Ret.-Perc.) a PostgreSQL real sin fallback silencioso; resolver `migrationService` y `daotService` (75 UIT). | `H-02`, `H-05`, `H-07`, `H-14`, `H-17` |
| **3** | **B2** | Implementar base por empresa + `server/storage/archivosEmpresa.ts` + backup/restauración streaming cifrada sobre PostgreSQL real (excluyendo credenciales SUNAT y usuarios/roles) y aprobar las 4 pruebas B2 reales sobre PG 18.6. | `H-06` *(Hallazgo 9)* |
| **4** | **C** | Reparar `CuentasPorCobrar`/`CuentasPorPagar`, conectar `SelectorCuentaContable` a `pcgeApi`, eliminar `7` llamadas `404`, erradicar mock fallbacks (`tributarioAnualApi`, vistas props vacías, `BalanceGeneral`, `ConfigEmpresaModal`) y consolidar las `9` vistas huérfanas. | `H-09`, `H-10`, `H-11`, `H-12`, `H-13`, `H-19`, `H-20` |
| **5** | **D** | Eliminar fallback silencioso a `MockSunatGateway` dentro de `RealSunatGateway` y validar flujos reales SUNAT/SIRE y supuestos tributarios pendientes. | `H-15`, `H-17`, `H-21` |
| **6** | **E** | Implementar `npm run verify` (ejecutando `lint`, `build`, `npm test`, suites PG reales + B2 + `desktop:verify` y fallando sin PG real), corregir `test:infra` y regenerar los instaladores Windows firmados/actualizados en `release/`. | `H-08` |
