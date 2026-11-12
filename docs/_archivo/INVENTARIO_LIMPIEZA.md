# Inventario de Limpieza con Evidencia — ATLOB ERP

- **Rama de trabajo:** `chore/limpieza-y-mejoras`
- **Tag de respaldo previo:** `pre-limpieza` (sobre commit `e402bef` en `main`)
- **Fecha de relevamiento:** 2026-11-11
- **Estado de cambios:** Fase 1 de solo lectura / inventario (no se han movido, editado ni eliminado archivos del sistema). Único cambio previo existente en working tree antes de este inventario: `server/services/planillaService.ts` (4 líneas de indentación, conservado intacto).

---

## 1. Línea Base Obligatoria (`pre-limpieza`)

Comandos ejecutados sobre `chore/limpieza-y-mejoras` (`e402bef`) sin modificaciones:

| Verificación | Comando | Resultado | Detalle observado |
| :--- | :--- | :---: | :--- |
| Tipado TypeScript | `npm run lint` (`tsc --noEmit`) | **OK (`0` errores)** | Código de salida `0`. |
| Empaquetado Vite | `npm run build` (`vite build`) | **OK (`0` errores)** | `vite v8.3.5`, `2,101` módulos transformados en `2.85s`; chunk principal `dist/assets/index-C_F132wg.js` (`2,434.40 kB`, gzip `528.10 kB`). |
| Batería completa | `npm test` (`tsx server/tests/run_all_tests.ts`) | **OK (`36 / 36` suites)** | **`3,390` aserciones totales**, `0` fallos en `126.72s` (`NODE_ENV=test`, `DATABASE_URL=''`). |

---

## 2. Metodología y Herramientas Utilizadas (Sección a)

- **Disponibilidad de analizadores CLI (`npx --no-install`)**: se comprobó localmente que `knip`, `ts-prune`, `madge` y `depcheck` no están instalados en `node_modules`. Para no alterar `package.json` ni `package-lock.json` en Fase 1 ni depender de descargas externas, se ejecutó análisis estático equivalente sobre el grafo completo de módulos TypeScript/JavaScript (`import`, `export ... from`, `import()`, `require()`, `@import` CSS), análisis AST directo sobre `MENU_DATA` (`src/types/menu.ts`), mapeo de rutas en `src/App.tsx` y `server/routes/index.ts`, configuración Vite/Electron/CI y búsqueda textual cruzada en todos los `443` archivos del repositorio.
- **Puntos de entrada analizados**:
  - Web/API: `server.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `vite.config.ts`.
  - Escritorio Electron: `desktop/main.cjs`, `desktop/prepare.ts`, `desktop/verify-package.ts`, `desktop/electron-builder.yml`, `desktop/package-files.mjs`.
  - Pruebas y scripts: `server/tests/run_all_tests.ts` (36 suites), `server/tests/real/*` (6 suites), `scripts/verificar-matriz.ts`, `scripts/descargar-normas.ts`, `scripts/inicializar-escritorio.ps1`, `Iniciar-Escritorio.bat`, `.github/workflows/test-pg.yml` y los `26` scripts de `package.json`.
- **Resumen del grafo de código**:
  - `343` archivos de código analizados entre `src/`, `server/`, `desktop/`, `scripts/`, `server.ts` y `vite.config.ts`.
  - `261` alcanzables desde los puntos de entrada de producción (`server.ts`, `src/main.tsx`, `desktop/main.cjs`).
  - `312` alcanzables sumando suites de prueba, scripts y CI.
  - `35` archivos sin importadores entrantes desde esos puntos de entrada de runtime (varios corresponden a suites/fixtures de prueba protegidos en `server/tests/**` y a vistas/utilidades citadas en documentos protegidos, detallados abajo).

---

## 3. Archivos Protegidos Confirmados (`ACTIVO` — No tocar)

Los siguientes archivos están protegidos explícitamente por reglas del repositorio o por pruebas/CI activos, aunque algunos aparezcan sin `import` estático directo:

| Ruta | Tipo | Evidencia (quién lo importa o referencia) | Clasificación | Acción propuesta |
| :--- | :--- | :--- | :---: | :--- |
| `AGENTS.md`, `docs/engineering/PLAN_IMPLEMENTACION.md`, `docs/MATRIZ_COMPLETITUD_ASIENTOS.md`, `docs/NORMAS_VERIFICADAS.md`, `docs/engineering/MARCA.md`, `docs/engineering/LICENCIAS.md`, `docs/engineering/REDONDEO_USD.md`, `docs/engineering/CARGA_PCGE_STAGING.md` | Documentos normativos/ingeniería | Protegidos explícitamente; `MATRIZ_COMPLETITUD_ASIENTOS.md` validada por Suite 36; `MARCA.md` por Suite 28 | `ACTIVO` | Mantener intactos |
| `server/db/migrate.ts`, `server/db/migration-files.ts`, 21 migraciones `server/db/schema*.sql` / `triggers_fase2.sql`, `server/db/fk_empresa_01..07.sql` | Migraciones y restricciones BD | Protegidos explícitamente; usados por `server.ts`, `desktop/prepare.ts`, `desktop/verify-package.ts`, `test_migrate_crlf_lf.ts`, `test_pg_fk_empresa.ts` | `ACTIVO` | Mantener intactos |
| `server/storage/registroDatosEmpresa.ts`, `server/db/seguridadRls.ts`, `server/db/seed.ts`, `server/db/seed_catalogos.ts`, `server/db/cargarPcgeStaging.ts` | Seguridad RLS / Catálogo / Seeds | `registroDatosEmpresa.ts` y `seguridadRls.ts` protegidos explícitamente; `seed*` llamados en `migrate.ts`; `cargarPcgeStaging.ts` en `npm run cargar:pcge` | `ACTIVO` | Mantener intactos |
| Todo `server/tests/**` (incluidas `server/tests/contador_aserciones.ts`, `fixture_test_sin_aserciones.ts`, `verificar_reportes_estandar.ts`, `run_tests_registro_empresa.ts` y `server/tests/real/*`) | Pruebas y harness | Protegido explícitamente todo `server/tests/**`. `contador_aserciones.ts` se inyecta con `--import` en `run_all_tests.ts`; `fixture_test_sin_aserciones.ts` en Suite 36 (`verificar-matriz.ts`); `verificar_reportes_estandar.ts` es CLI manual sin script npm | `ACTIVO` | Mantener intactos (`verificar_reportes_estandar.ts` protegido por ruta `server/tests/**`) |
| `src/api/session.test.ts` | Prueba frontend | Protegida explícitamente; Suite 1 de `run_all_tests.ts` | `ACTIVO` | Mantener intacto |
| `desktop/*`, `desktop/assets/*`, `desktop/build/*`, `scripts/*`, `.github/workflows/test-pg.yml`, `docker-compose.test.yml` | Escritorio, scripts y CI | Protegidos explícitamente (`desktopFiles`, `electron-builder.yml`, `desktop/**`, `scripts/**`, `.github/workflows/**`). **Ver alerta crítica en Sección 6 sobre `desktop/build/` en `.gitignore`** | `ACTIVO` | Mantener intactos (corregir `.gitignore` para no ocultar `desktop/build/`) |
| `public/favicon.ico`, `public/favicon-32x32.png`, 8 archivos `src/assets/brand/*` listados en `MARCA.md` | Recursos de marca | Validados en disco/SHA-256/peso por `MARCA.md` y Suite 28 (`test_marca_y_login_seguridad.ts`) | `ACTIVO` | Mantener intactos |

---

## 4. Auditoría de Vistas, Menú, Modales, Hooks y APIs Frontend (Sección b)

### 4.1 Reconciliación matemática: `MENU_DATA` vs `src/App.tsx` vs `src/components/views/`

- **`src/types/menu.ts` (`MENU_DATA`)**: contiene **89** ítems hoja (sin contar divisores):
  - **80** con `estado: 'activo'`:
    - **68** abren **68 vistas únicas** en `src/App.tsx` (mapeo 1:1 sin vistas duplicadas entre ítems activos). Además `App.tsx` mantiene **31** alias de `itemId` históricos apuntando a las mismas 68 vistas.
    - **7** abren modales en `handleTopBarAction`: `nueva-empresa` (`ModalNuevaEmpresaBlanco`), `abrir-empresa` (`SearchEmpresasModal`), `datos-empresa` (`ConfigEmpresaModal`), `importar-csv` (`ModalImportacionCsv`), `calculadora` (`CalculadoraContableModal`), `respaldos` (`ModalBackupEmpresa`), `acerca-de` (`AcercaDeModal`).
    - **5** ejecutan acciones inmediatas: `cerrar-sesion`, `salir-app`, `restaurar-demo`, `formato-estandar`, `formato-corporativo`.
  - **9** con `estado: 'proximamente'` (`guias-remision`, `resumen-bajas`, `series-certificado`, `letras-pagares`, `kardex`, `existencias`, `activos-fijos`, `depreciacion-mensual`, `portal-cliente`): apuntan a nombres de vista declarativos aún sin archivo `.tsx` en disco.
- **`src/components/views/` (`84` archivos `.tsx` en total)**:
  - **68** vistas enrutadas 1:1 desde los 68 ítems activos de `MENU_DATA` (`ACTIVO`). *(Nota: `SubdiariosView.tsx` también re-incrusta 6 de estas vistas activas: `VouchersView`, `RegistroComprasView`, `RegistroVentasView`, `CajaBancosView`, `PlanillaPlameView`, `HonorariosView`.)*
  - **1** vista pre-sesión renderizada en `src/App.tsx` (`LoginView.tsx`, fuera de `MENU_DATA`) (`ACTIVO`).
  - **`= 69` vistas activas** usadas por la aplicación actual.
  - **`84 - 69 = 15` vistas sin ítem de menú ni ruta en `src/App.tsx`**.

### 4.2 Tabla de las 15 Vistas No Enrutadas + Candidatos de Modales, Hooks, APIs y Otros en `src/`

> [!IMPORTANT]
> **Dependencia crítica con Suite 36 (`MATRIZ_COMPLETITUD_ASIENTOS.md`)**: `scripts/verificar-matriz.ts` escanea con regex todas las rutas `src/...` citadas en `docs/MATRIZ_COMPLETITUD_ASIENTOS.md` y falla `npm test` si cualquiera no existe en disco. Tres vistas no enrutadas (`ActivosKardexView.tsx`, `ProcesosCierreView.tsx`, `TesoreriaAvanzadaView.tsx`) están citadas allí. No pueden moverse a `_cuarentena/` sin actualizar `MATRIZ_COMPLETITUD_ASIENTOS.md` (archivo protegido), y mover sus hooks/APIs sin mover las vistas rompería `npm run lint` (`tsc --noEmit`).

| Ruta | Tipo | Evidencia (quién lo importa o referencia) | Clasificación | Acción propuesta |
| :--- | :--- | :--- | :---: | :--- |
| `src/components/views/ActivosKardexView.tsx` | Vista (`881 L`) | Imp: nadie en runtime. **Ref:** citada en `MATRIZ_COMPLETITUD_ASIENTOS.md` (`ESC-VAR-8.01`, `ESC-VAR-8.03`), verificada en disco por Suite 36. Importa `useActivosKardex.ts` | `DUDOSO` | **Conservar en Fase 2** mientras `MATRIZ_COMPLETITUD_ASIENTOS.md` la cite (además relacionada con M8) |
| `src/components/views/ProcesosCierreView.tsx` | Vista (`935 L`) | Imp: nadie en runtime. **Ref:** citada en `MATRIZ_COMPLETITUD_ASIENTOS.md` (`ESC-VAR-8.02`, `ESC-VAR-8.04`), verificada en disco por Suite 36 (y en histórico `MEMORIA_TECNICA_V2.md`). Importa `useTributarioAnual.ts` | `DUDOSO` | **Conservar en Fase 2** mientras `MATRIZ_COMPLETITUD_ASIENTOS.md` la cite (relacionada con M9) |
| `src/components/views/TesoreriaAvanzadaView.tsx` | Vista (`327 L`) | Imp: nadie en runtime. **Ref:** citada en `MATRIZ_COMPLETITUD_ASIENTOS.md` (`ESC-COB-3.01..3.02`, `ESC-PAG-4.01..4.06`, `ESC-SPOT-5.01`, `ESC-HON-6.03`), verificada en disco por Suite 36 | `DUDOSO` | **Conservar en Fase 2** mientras `MATRIZ_COMPLETITUD_ASIENTOS.md` la cite |
| `src/components/views/FacturacionElectronicaView.tsx` | Vista (`579 L`) | Imp: nadie. Ref: ninguna en tests/docs. Antigua vista monolítica reemplazada por `EmitirComprobanteView`, `NotasCreditoDebitoView`, `ConsultaComprobantesView`, `LectorXmlCdrView` | `DUDOSO` | **Consultar (Regla 7)**: no pertenece al flujo enrutado actual, pero confirmar antes de mover por Regla 7 ("no modificar Facturación") |
| `src/components/views/ReglasContabilizacionView.tsx` | Vista (`227 L`) | Imp: nadie. Ref: citada solo en `docs/CATALOGO_CUENTAS_ASIENTOS.md` (no verificada por Suite 36) | `DUDOSO` | Mover a `_cuarentena/` o conservar si se planea exponer UI de reglas automáticas |
| `src/components/views/AccesoDenegadoView.tsx` | Vista (`53 L`) | Imp: nadie. Ref: ninguna | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/components/views/` |
| `src/components/views/AuditoriaView.tsx` | Vista (`184 L`) | Imp: nadie. Ref: ninguna (reemplazada por `SimuladorFiscalizacionView` y `MapaAuditoriaSistemaView`) | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/components/views/` |
| `src/components/views/CajaChicaView.tsx` | Vista (`374 L`) | Imp: nadie. Ref: ninguna (monolítica reemplazada por `CajaChicaAperturaView`, `CajaChicaGastosView`, `CajaChicaReposicionView`) | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/components/views/` |
| `src/components/views/CarteraSaldosView.tsx` | Vista (`628 L`) | Imp: nadie. Ref: ninguna (monolítica reemplazada por `CuentasPorCobrarView`, `CuentasPorPagarView`, `AntiguedadSaldosView`) | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/components/views/` |
| `src/components/views/EmpresasClientesView.tsx` | Vista (`481 L`) | Imp: nadie en runtime. Ref: solo en históricos `MEMORIA_TECNICA_V2.md` y `MATRIZ_TRAZABILIDAD.csv` (reemplazada por `MisEmpresasNivel1View`) | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/components/views/` |
| `src/components/views/GestionNegocioView.tsx` | Vista (`224 L`) | Imp: nadie. Ref: ninguna (reemplazada por `ControlCalidadEstudioView` / `DashboardView`) | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/components/views/` |
| `src/components/views/MaestrosView.tsx` | Vista (`306 L`) | Imp: nadie. Ref: ninguna (monolítica reemplazada por 5 vistas de tablas maestras) | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/components/views/` |
| `src/components/views/ReportesFinancierosView.tsx` | Vista (`199 L`) | Imp: nadie en runtime. Ref: solo en histórico `MEMORIA_TECNICA_V2.md` (reemplazada por `HojaTrabajo10Columnas`, `BalanceGeneral`, `EstadoResultados`, `FlujoEfectivo`) | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/components/views/` |
| `src/components/views/ReportesSunatEspecialesView.tsx` | Vista (`225 L`) | Imp: nadie. Ref: ninguna (monolítica reemplazada por `LiquidacionTributariaView`, `ProrrataIgvView`, `DaotView`, `DeclaracionRentaAnualView`) | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/components/views/` |
| `src/components/views/SqlDatabaseView.tsx` | Vista (`320 L`) | Imp: nadie. Ref: ninguna (importa `src/services/sqlDatabaseService.ts`) | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/components/views/` junto con `sqlDatabaseService.ts` |
| `src/components/modals/ConfirmarCambioEmpresaModal.tsx` | Modal (`1` de `12`) | Imp: nadie. Ref: ninguna (los otros `11` modales son `ACTIVO` importados por `App.tsx` o vistas activas) | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/components/modals/` |
| `src/hooks/useEmpresas.ts` | Hook (`1` de `9`) | Imp: nadie. Ref: ninguna | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/hooks/` |
| `src/hooks/useActivosKardex.ts` | Hook (`1` de `9`) | Imp: **solo** por la no enrutada `ActivosKardexView.tsx` (y usa `activosKardexApi.ts`). Los otros `6` hooks son `ACTIVO` | `DUDOSO` | **Conservar junto con `ActivosKardexView.tsx`** para no romper `tsc --noEmit` |
| `src/hooks/useTributarioAnual.ts` | Hook (`1` de `9`) | Imp: **solo** por la no enrutada `ProcesosCierreView.tsx` (y usa `tributarioAnualApi.ts`) | `DUDOSO` | **Conservar junto con `ProcesosCierreView.tsx`** para no romper `tsc --noEmit` |
| `src/api/empresaNavegacionApi.ts` | Cliente API (`1` de `20`) | Imp: nadie. Ref: ninguna (`15` APIs activas + `session.test.ts` protegido) | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/api/` |
| `src/api/reportesApi.ts` | Cliente API (`1` de `20`) | Imp: nadie. Ref: ninguna | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/api/` |
| `src/api/activosKardexApi.ts` | Cliente API (`1` de `20`) | Imp: **solo** por `useActivosKardex.ts` <- `ActivosKardexView.tsx` | `DUDOSO` | **Conservar junto con `useActivosKardex.ts`** |
| `src/api/tributarioAnualApi.ts` | Cliente API (`1` de `20`) | Imp: **solo** por `useTributarioAnual.ts` <- `ProcesosCierreView.tsx` | `DUDOSO` | **Conservar junto con `useTributarioAnual.ts`** |
| `src/components/desktop/TitleBar.tsx` | Componente UI | Imp: nadie. Ref: ninguna (reemplazada por `TopBar.tsx`). Importa `BackgroundJobsPanel.tsx` | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/components/desktop/` |
| `src/components/desktop/BackgroundJobsPanel.tsx` | Componente UI | Imp: **solo** por la huérfana `TitleBar.tsx`. Ref: ninguna | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/components/desktop/` junto con `TitleBar.tsx` |
| `src/components/layout/EmpresaSidebarNivel2.tsx` | Componente Layout | Imp: nadie. Ref: ninguna (sidebar antiguo eliminado por arquitectura sin barra lateral) | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/components/layout/` |
| `src/services/sqlDatabaseService.ts` | Servicio cliente | Imp: **solo** por la huérfana `SqlDatabaseView.tsx` | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/services/` junto con `SqlDatabaseView.tsx` |
| `src/utils/redondeoUsd.ts` | Utilidad cliente | Imp: nadie en código. **Ref:** citada en `docs/engineering/REDONDEO_USD.md` (protegido) y `SISTEMA_ATLOB_ERP.md`. Usa `Math.round`, mientras backend usa `Decimal` | `DUDOSO` | **Conservar** por estar citada en doc protegido `REDONDEO_USD.md` (o unificar en Fase 4) |
| `src/assets/brand/atlob_app_icon_512.png` | Imagen (`187,983 B`) | Imp/Ref: nadie. Copia exacta de `desktop/build/icon.png`; NO incluida en `MARCA.md` ni en Suite 28 (que limita recursos web a `< 150 KB`) | `HUERFANO-CODIGO` | Mover a `_cuarentena/src/assets/brand/` (duplicado de `desktop/build/icon.png`) |

*(Nota: Todas las demás vistas [69], modales [11], hooks [6], clientes API [16], `ui/`, `common/`, `voucher/`, `setup/`, `context/`, `data/`, y `src/services/` restantes tienen importadores activos confirmados = `ACTIVO`.)*

---

## 5. Auditoría del Servidor y Revisión de Duplicados (Sección c)

- **Controladores (`12/12`), Rutas (`27/27`, 26 montadas en `server/routes/index.ts`), Repositorios (`3/3`), Middlewares (`3/3`), Config/Utils (`7/7`)**: todos alcanzables desde `server.ts` (`ACTIVO`).
- **Servicios (`53` en `server/services/`)**: `51` alcanzables desde `server.ts`, más `aperturaCierreService.ts` (alcanzable desde `run_tests.ts`) y `redondeoUsdService.ts` (alcanzable desde `test_bloque_f_hallazgos.ts`).

### Hallazgos de código huérfano o duplicado/solapado en `server/`

| Ruta | Tipo | Evidencia y relación con posible duplicado | Clasificación | Acción propuesta |
| :--- | :--- | :--- | :---: | :--- |
| `server/data/catalogos/reglasContabilizacionCatalogo.ts` | Catálogo backend | Imp: nadie. Ref: ninguna. Reglas reales viven en `contabilizacionService.ts` y BD | `HUERFANO-CODIGO` | Mover a `_cuarentena/server/data/catalogos/` |
| `server/data/catalogos/subdiariosCatalogo.ts` | Catálogo backend | Imp: nadie. Ref: ninguna. Además asigna `'07'` a Caja Chica (desfasado vs BD/`subdiarioService`) | `HUERFANO-CODIGO` | Mover a `_cuarentena/server/data/catalogos/` |
| `server/data/catalogos/sunatCatalogos.ts` | Catálogo backend | Imp: nadie. Ref: ninguna. Subconjunto duplicado de `src/data/sunatCatalogos.ts` (que sí usan `VoucherGrid.tsx` y `VoucherHeader.tsx`) | `HUERFANO-CODIGO` | Mover a `_cuarentena/server/data/catalogos/` |
| `server/data/catalogos/detraccionesCatalogo.ts` | Catálogo backend | Imp: `compraService.ts` y `ventaService.ts`. Contenido duplicado exacto (205 L) de `src/data/detraccionesCatalogo.ts` | `ACTIVO` | Mantener en Fase 2 (unificación opcional posterior) |
| `server/data/catalogos/pcgeCatalogo.ts` | Catálogo backend | Imp: `empresaDemoService.ts`, `importacionService.ts`. Convive con `pcge_base_v2.json` y `src/data/pcgeAccounts.ts` | `ACTIVO` | Mantener en Fase 2 |
| `server/services/migrationService.ts`, `server/controllers/migrationController.ts`, `server/routes/migrationRoutes.ts` | Servicio / Ctrl / Ruta (`POST /api/migrations/localstorage`) | **NO duplica a `server/db/migrate.ts`**: `migrate.ts` ejecuta las 21 migraciones DDL PostgreSQL; `migrationService.ts` migra datos legacy desde `localStorage` del navegador. Montado en `routes/index.ts`, pero **0 llamadas en `src/`** y **0 tests** | `DUDOSO` | **Conservar montado o decidir en Fase 2** si aún se soporta importación desde `localStorage` anterior |
| `server/services/aperturaCierreService.ts` | Servicio (`160 L`) | Imp: `server/tests/run_tests.ts`. Solapado parcialmente en concepto con `cierreAnualService.ts` (`612 L`, usado en ruta HTTP), sin ruta HTTP propia | `ACTIVO` | **Mantener intacto** (requerido por `run_tests.ts`; candidata a revisión funcional en M9) |
| `server/services/cryptoService.ts` vs `server/utils/crypto.ts` | Criptografía | Ambos `ACTIVO`: `cryptoService.ts` implementa Envelope Encryption v2; `utils/crypto.ts` provee `encryptSensitive` v1 usado aún en `empresaRepository.ts` (documentado en `SEGURIDAD.md`) | `ACTIVO` | Mantener ambos |
| `server/db/diagnosticoFkEmpresa.ts` | CLI BD (`265 L`) | Imp: nadie en TS; sin script en `package.json`. Citado en `docs/engineering/SEGURIDAD.md` para inspeccionar FKs `01..07` en modo `READ ONLY` | `DUDOSO` | **Conservar** en `server/db/` (herramienta operativa previa a B2) |

---

## 6. Documentos, Archivos Sueltos y Basura/Generados + `.gitignore` (Secciones d y e)

### 6.1 Documentos (`docs/`) y archivos sueltos en raíz / `.aistudio/` / `public/`

*(Excluye los 8 documentos explícitamente protegidos ya listados en la Sección 3).*

| Ruta | Tipo | Evidencia (referencias cruzadas / tests / vigencia) | Clasificación | Acción propuesta |
| :--- | :--- | :--- | :---: | :--- |
| `docs/MEMORIA_TECNICA_V2.md` | Doc histórico (`38 KB`) | Fechado **4 de Octubre de 2026** (`12 suites`); marcado *"Documento histórico"*. Citado solo por `SISTEMA_ATLOB_ERP.md` y `MATRIZ_TRAZABILIDAD.csv` | `OBSOLETO-DOC` | Mover a `docs/_archivo/historicos/` |
| `docs/MATRIZ_TRAZABILIDAD.csv` | Matriz histórica (`31 KB`) | Trazabilidad de octubre 2026 (Fases 1–11), enlazada únicamente desde `MEMORIA_TECNICA_V2.md` | `OBSOLETO-DOC` | Mover a `docs/_archivo/historicos/` |
| `docs/RESULTADOS_VERIFICACION.txt` | Evidencia histórica (`26 KB`) | Salida capturada el `2026-10-04T10:33:45Z` (`12 suites`), enlazada únicamente desde `MEMORIA_TECNICA_V2.md` | `OBSOLETO-DOC` | Mover a `docs/_archivo/historicos/` |
| `docs/evidencia/lint.txt`, `docs/evidencia/build.txt`, `docs/evidencia/npm_test.txt` | Salidas puntuales (`09/11/2026`) | `0` referencias en todo el repositorio (evidencias de ejecución previa en Bloque 1; nota: las auditorías del `04/11/2026` no existen aparte porque `SISTEMA_ATLOB_ERP.md` fue actualizado in-place el `11/11/2026`) | `OBSOLETO-DOC` | Mover a `docs/_archivo/evidencia/` |
| `docs/evidencia/normas/ley_29173.pdf` | Archivo roto (`212 B`) | **No es un PDF**: contiene HTML WAF `_Incapsula_Resource`. `0` referencias en `NORMAS_VERIFICADAS.md` ni en `scripts/descargar-normas.ts` (el texto real guardado es `ley_29173_congreso.pdf`) | `OBSOLETO-DOC` | Mover a `docs/_archivo/normas/` |
| `docs/evidencia/normas/reglamento_igv_cap5.htm` | Frameset vacío (`2,015 B`) | Solo etiqueta `<frameset>` sin texto legal. `0` referencias en `NORMAS_VERIFICADAS.md` ni en `scripts/descargar-normas.ts` | `OBSOLETO-DOC` | Mover a `docs/_archivo/normas/` |
| `docs/evidencia/normas/` (otros `12` archivos) | Evidencia normativa | Citados en `NORMAS_VERIFICADAS.md` (`capitul6.pdf`, `ley_29173_congreso.pdf`, `ley_32219_elperuano.html`, `rs_037_2002_sunat.html`) o descargados por `scripts/descargar-normas.ts` (`256.htm`, `cap1.htm`, `cap6.htm`, `capitul5.pdf`, `fdetalle.htm`, `findice.html`, `titulo1.htm`, `ley-que-regula-el-regimen...`) | `ACTIVO` | Mantener en `docs/evidencia/normas/` |
| `docs/INICIO_ESCRITORIO.md` | Doc obsoleta parcial (`3.3 KB`) | Ref: `SISTEMA_ATLOB_ERP.md`. Afirma *"No crea un ejecutable nativo"* y *"no se ha agregado Electron"* (ya existe Electron `45.2.3`), y documenta `Iniciar-Escritorio.bat` + `scripts/inicializar-escritorio.ps1` | `OBSOLETO-DOC` / `DUDOSO` | **Consultar**: archivar en `docs/_archivo/` (reemplazado por `ESCRITORIO_WINDOWS.md`) o corregir en Fase 3 si `Iniciar-Escritorio.bat` sigue soportado |
| `Iniciar-Escritorio.bat` | Lanzador Windows raíz (`180 B`) | Invoca directamente al script protegido `scripts/inicializar-escritorio.ps1`; citado en `SISTEMA_ATLOB_ERP.md` e `INICIO_ESCRITORIO.md` | `ACTIVO` / `DUDOSO` | **Consultar** junto con `INICIO_ESCRITORIO.md`: conservar como wrapper del script protegido o archivar si todo uso migró a Electron |
| `docs/BACKUP_BASE_DATOS.md` | Doc desfasada (`4 KB`) | Citada en `SISTEMA_ATLOB_ERP.md`. Describe `scripts/backup_postgres.sh` (**inexistente**) y GCS/S3/Cloud SQL no presentes en el proyecto | `DUDOSO` | Consultar si se archiva en `docs/_archivo/` o se reescribe con el plan M2/B2 |
| `docs/CATALOGO_CUENTAS_ASIENTOS.md` | Doc técnica (`22 KB`) | Fechada `09/11/2026`, citada en `SISTEMA_ATLOB_ERP.md`. Inventario PCGE de generadores | `ACTIVO` | Mantener (o enlazar desde `docs/README.md` en Fase 3) |
| `docs/CATALOGO_CUENTAS_PARA_CONTADOR.md` | Doc funcional (`19 KB`) | Citada en `SISTEMA_ATLOB_ERP.md`. Matriz de preguntas `SUPUESTO A VALIDAR` para contador | `DUDOSO` | Mantener mientras falten respuestas del contador (enlazar en `docs/README.md`) |
| `docs/engineering/SEGURIDAD.md`, `docs/engineering/ESCRITORIO_WINDOWS.md`, `docs/engineering/INDEX.md` | Docs ingeniería | Vigentes (`SEGURIDAD` dice 15 migraciones / 78 tablas; `ESCRITORIO_WINDOWS` dice 15 migraciones) | `ACTIVO` | Actualizar números reales en **Fase 3** (`21` migraciones, `81` tablas, Electron `45.2.3`) + crear `docs/README.md` |
| `SISTEMA_ATLOB_ERP.md` | Informe integral (`44 KB`) | Actualizado al `11/11/2026` | `ACTIVO` | Regenerar al final de **Fase 3** |
| `metadata.json` | Config AI Studio (`427 B`) | Trackeado en raíz; `0` referencias en todo el repositorio (`MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`) | `OBSOLETO-DOC` | Mover a `_cuarentena/` o `docs/_archivo/` |
| `bun.lock` | Lockfile secundario (`96.5 KB`) | Trackeado en raíz junto a `package-lock.json`; `0` referencias; todo el repo/CI usa `npm`/`npx` | `HUERFANO-CODIGO` | Mover a `_cuarentena/` |
| `.aistudio/artifacts/brain/09abf4a1-fe0c-42dc-bd5c-4fe6a3b83d6b/implementation_plan.md` y `.metadata.json` | Artefactos AI Studio (`2` files) | Trackeados por error en Git (`0` referencias desde app/tests/CI) | `OBSOLETO-DOC` | Mover a `docs/_archivo/aistudio/` (y evaluar añadir `.aistudio/` a `.gitignore`) |
| `public/assets/aistudio/Atlob_Consultores_ERP___Barra_superior_b5c47105.html` | Mockup HTML (`10.7 KB`) | `0` referencias en código; sin embargo **`vite build` lo copia a `dist/` y al `.asar` de escritorio** | `OBSOLETO-DOC` | Mover a `docs/_archivo/assets/` (evita distribuirlo en `dist/` y `desktop/`) |

### 6.2 Generados, Temporales y Revisión de `.gitignore` (Sección e)

> [!CAUTION]
> **Fallo crítico detectado en `.gitignore` (línea 2)**: la regla `build/` (sin barra inicial `/`) coincide también con `desktop/build/`. Como consecuencia, **`git ls-files desktop/build/` devuelve `0` archivos**, aunque `desktop/build/` (`icon.ico`, `icon.png`, `installerSidebar.bmp`, `installerHeader.bmp`) es exigido por `electron-builder.yml`, `desktop/package-files.mjs`, `MARCA.md` y la Suite 28 (`npm test`). En un clon limpio o en CI, `npm test` fallaría si no se corrige `build/` por `/build/`.

| Ruta / Directorio | Conteo observado | ¿En `.gitignore`? | Clasificación | Acción propuesta |
| :--- | :---: | :---: | :---: | :--- |
| `dist/` | `17` archivos (compilación Vite) | Sí (`dist/`) | `GENERADO` | Mantener ignorado (limpio vía `npm run clean`; corregir `public/assets/aistudio/` para no copiar el HTML ahí) |
| `build/` (raíz) | `80` archivos (staging Electron) | Sí (`build/` — **bug: afecta `desktop/build/`**) | `GENERADO` | Cambiar `build/` por **`/build/`** en `.gitignore` y añadir/rastrear los 4 binarios de `desktop/build/` |
| `release/` | `118` archivos (`.exe` Setup/Portable, `.blockmap`, `win-unpacked`) | Sí (`/release/`) | `GENERADO` | Mantener ignorado fuera de Git |
| `desktop/generated/` | `39` archivos (`server.mjs`, `dist/`, copia de migraciones) | Sí (`/desktop/generated/`) | `GENERADO` | Mantener ignorado fuera de Git |
| `.env` | `1` archivo local (`622 B`) | Sí (`.env*` con `!.env.example`) | `ACTIVO` | **No tocar, no leer ni versionar** (mantener `.env.example` limpio) |
| `backup_sistema_contable_pre_migracion.dump` | `1` archivo local (`394 KB`, no trackeado) | Sí (`*.dump`) | `DUDOSO` | No está en Git; consultar al usuario si conserva este dump fuera del workspace o si se elimina de disco |
| `ATLOB_ERP_PCGE_2026_CLASIFICADO_v2.xlsx` | `1` archivo local (`250 KB`, no trackeado) | Sí (nombre exacto en raíz `.gitignore`) | `DUDOSO` | Fuente Excel local requerida para `npm run cargar:pcge` (citada en `CARGA_PCGE_STAGING.md`); mantener local e ignorada |
| `coverage/`, `capturas/`, `scratch/`, `test-results/`, `*.log`, `*.bak`, `*.orig`, `.DS_Store` | No presentes actualmente en raíz | Sí (ya configurados en `.gitignore`; salvo `*.orig`) | `GENERADO` | `.gitignore` ya los excluye (agregar `*.orig` si se desea precaución) |

---

## 7. Scripts de `package.json` y Redundancias (Sección f)

`package.json` define **26 scripts**:

| Script(s) | Comando actual | Comparación / Redundancia | Clasificación | Propuesta |
| :--- | :--- | :--- | :---: | :--- |
| `test:all` vs `test` | Ambos ejecutan exactamente `tsx server/tests/run_all_tests.ts` | **100% duplicado** (`test:all` no ejecuta nada distinto a `test`) | `HUERFANO-CODIGO` | Candidato a retirar alias `test:all` o dejarlo como alias explícito tras confirmación |
| `dev` vs `start` | Ambos ejecutan exactamente `tsx server.ts` | **Idénticos en comando** (aunque semánticamente `dev` y `start` suelen diferenciarse; hoy hacen lo mismo) | `DUDOSO` | Conservar ambos o diferenciar `start` (`NODE_ENV=production`) con aprobación |
| `test:fase2` .. `test:fase9`, `test:sonda-sunat` (9 scripts) | `tsx server/tests/run_tests*.ts` / `test_sonda_sunat.ts` | **Subconjuntos ya ejecutados dentro de `npm test` (`run_all_tests.ts`)**; útiles únicamente para depuración focalizada rápida (faltan alias para fases 10, 11, 13 y bloques A–F) | `ACTIVO` / Redundante | Consultar si se mantienen como atajos individuales o se simplifican |
| `test:coverage` | `c8 ... tsx server/tests/run_all_tests.ts` | Ejecuta las mismas 36 suites que `test`, pero añade reporte `c8` de cobertura | `ACTIVO` | Mantener (aporta cobertura) |
| `test:secretos-frontend` | `tsx server/tests/test_secretos_frontend.ts --dist` | **Aporta diferencia real**: pasa `--dist`, escaneando también `dist/` compilado (mientras `run_all_tests.ts` escanea solo `src/`) | `ACTIVO` | Mantener (y asegurar que corra tras `build`) |
| `test:pg`, `test:pg:docker`, `test:infra` | Suites PostgreSQL real (`server/tests/real/*`) | **No corren en `npm test`** | `ACTIVO` | Mantener (alimentarán `npm run verify` en M6) |
| `build`, `preview`, `clean`, `lint`, `desktop:dev`, `dist:win`, `desktop:verify`, `cargar:pcge` | Cada uno ejecuta una operación distinta | Sin redundancias | `ACTIVO` | Mantener |

*(Nota: sigue faltando `npm run verify` exigido por `AGENTS.md` / `PLAN_IMPLEMENTACION.md` / Fase 4 M6).*

---

## 8. Dependencias y Metadatos de `package.json` (Sección g)

### 8.1 Nombre y versión (candidatos a renombrar)

| Campo actual | Observación e impacto | Clasificación | Propuesta |
| :--- | :--- | :---: | :--- |
| `"name": "contabilidad-estudio"` | Nombre genérico inicial. Usado por `desktop/prepare.ts` al generar el `package.json` interno de `build/desktop/app` | `DUDOSO` | Renombrar a `"atlob-erp"` (confirmando que `desktop:verify` / artefactos pasan) |
| `"version": "0.0.0"` | Placeholder inicial. Expuesto en `GET /api/health` (`server/routes/index.ts:41` vía `npm_package_version`) y en nombre del instalador (`release/ATLOB-ERP-0.0.0-Setup-x64.exe` según `desktop/electron-builder.yml`); mientras `App.tsx:989` muestra `"2026.1"` en login | `DUDOSO` | Actualizar a versión SemVer coherente (p. ej. `"1.0.0"` o `"2026.1.0"`) previa aprobación |

### 8.2 Dependencias sin uso o mal ubicadas (`dependencies`: 29, `devDependencies`: 13)

| Paquete | Sección actual | Evidencia en código (`src/`, `server/`, `desktop/`, configs, scripts) | Clasificación | Acción propuesta |
| :--- | :--- | :--- | :---: | :--- |
| `@google/genai` (`^2.4.0`) | `dependencies` | `0` imports, `0` menciones en todo el código (`GEMINI_API_KEY=` está vacío en `.env.example`) | `HUERFANO-CODIGO` | Proponer desinstalación en Fase 2 / limpieza `package.json` (con aprobación y verificación) |
| `motion` (`^12.23.24`) | `dependencies` | `0` imports en todo el código | `HUERFANO-CODIGO` | Proponer desinstalación |
| `autoprefixer` (`^10.4.21`) | `devDependencies` | `0` imports/configs; Tailwind v4 usa `@tailwindcss/vite` sin PostCSS separado | `HUERFANO-CODIGO` | Proponer desinstalación |
| `@types/adm-zip`, `@types/bcryptjs`, `@types/cors`, `@types/jsonwebtoken`, `@types/pg` | `dependencies` | Usados solo en compilación por `tsc --noEmit` (`npm run lint`); las libs runtime sí están activas | `DUDOSO` (ubicación) | Mover de `dependencies` a `devDependencies` tras validar `npm run lint` + `build` + `dist:win` |
| Resto de `22` `dependencies` y `12` `devDependencies` | `dependencies` / `devDependencies` | Todas con imports reales o invocación en `scripts`/CSS (`@fontsource/roboto-condensed` en `src/index.css`; `pg-mem` en harness de test; `@electron/asar`, `esbuild`, `electron-builder`, `electron`, `tsx`, `c8`, `typescript`, `@types/*` activos) | `ACTIVO` | Mantener (`pg-mem` opcionalmente movible a `devDependencies` solo si no afecta `run_all_tests` en entornos) |

---

## 9. Resumen Cuantitativo y Decisiones Solicitadas Antes de Fase 2

- **`ACTIVO` / Protegido (sin cambios en Fase 2):** Base productiva (`69` vistas activas, `11` modales, `6` hooks, `16` APIs, `53` servicios, `27` rutas, `12` controladores, `3` repositorios, `3` middlewares, `21` migraciones, `7` FKs, `46` archivos bajo `server/tests/**`, `desktop/**`, `scripts/**`, docs protegidos y `34` dependencias activas más `5` `@types/*` de compilación).
- **`HUERFANO-CODIGO` (listos para mover a `_cuarentena/` o retirar si apruebas):**
  - **10 vistas**: `AccesoDenegadoView.tsx`, `AuditoriaView.tsx`, `CajaChicaView.tsx`, `CarteraSaldosView.tsx`, `EmpresasClientesView.tsx`, `GestionNegocioView.tsx`, `MaestrosView.tsx`, `ReportesFinancierosView.tsx`, `ReportesSunatEspecialesView.tsx`, `SqlDatabaseView.tsx` (+ su servicio `src/services/sqlDatabaseService.ts`).
  - **1 modal, 1 hook, 2 APIs, 3 componentes layout/desktop, 1 imagen duplicada**: `ConfirmarCambioEmpresaModal.tsx`, `useEmpresas.ts`, `empresaNavegacionApi.ts`, `reportesApi.ts`, `TitleBar.tsx` + `BackgroundJobsPanel.tsx`, `EmpresaSidebarNivel2.tsx`, `src/assets/brand/atlob_app_icon_512.png`.
  - **3 catálogos servidor huérfanos**: `server/data/catalogos/reglasContabilizacionCatalogo.ts`, `subdiariosCatalogo.ts`, `sunatCatalogos.ts`.
  - **1 lockfile ajeno**: `bun.lock`.
  - **1 alias npm duplicado**: `test:all` (`package.json`, junto con retiro de `@google/genai`, `motion`, `autoprefixer` si se aprueba).
- **`OBSOLETO-DOC` (listos para mover a `docs/_archivo/` si apruebas):**
  - Históricos oct/nov 2026: `docs/MEMORIA_TECNICA_V2.md`, `docs/MATRIZ_TRAZABILIDAD.csv`, `docs/RESULTADOS_VERIFICACION.txt`, `docs/evidencia/lint.txt`, `docs/evidencia/build.txt`, `docs/evidencia/npm_test.txt`.
  - Normas rotas/vacías: `docs/evidencia/normas/ley_29173.pdf` (`212 B` Incapsula), `docs/evidencia/normas/reglamento_igv_cap5.htm`.
  - Residuos AI Studio / raíz: `.aistudio/artifacts/...` (`2` archivos), `public/assets/aistudio/Atlob_Consultores_ERP___Barra_superior_b5c47105.html`, `metadata.json`.
- **`DUDOSO` (requieren tu confirmación expresa antes de tocar nada):**
  1. **Vistas citadas en `MATRIZ_COMPLETITUD_ASIENTOS.md` (+ sus hooks/APIs)**: `ActivosKardexView.tsx` (`+ useActivosKardex.ts`, `activosKardexApi.ts`), `ProcesosCierreView.tsx` (`+ useTributarioAnual.ts`, `tributarioAnualApi.ts`) y `TesoreriaAvanzadaView.tsx`. **Recomendación:** mantenerlas en Fase 2 para no violar la protección de `MATRIZ_COMPLETITUD_ASIENTOS.md` ni romper Suite 36 (`npm test`) ni `tsc --noEmit`.
  2. **`FacturacionElectronicaView.tsx`** y **`ReglasContabilizacionView.tsx`**: confirmar si pasan a `_cuarentena/` (respetando Regla 7 en Facturación).
  3. **`docs/INICIO_ESCRITORIO.md` + `Iniciar-Escritorio.bat`**: confirmar si el lanzador web `Iniciar-Escritorio.bat` sigue vigente junto al instalador Electron o si `docs/INICIO_ESCRITORIO.md` se archiva (hoy afirma falsamente que no existe Electron).
  4. **`docs/BACKUP_BASE_DATOS.md`**: ¿se archiva por referenciar `scripts/backup_postgres.sh` (inexistente) y GCS/S3, o se reescribe?
  5. **`migrationService.ts` + `migrationController.ts` + `migrationRoutes.ts` (`POST /api/migrations/localstorage`)**: ¿se conservan por compatibilidad o pasan a `_cuarentena/`?
  6. **`.gitignore` (`build/` -> `/build/`)**: ¿autorizas corregir `.gitignore` y versionar los 4 binarios de `desktop/build/` para que la Suite 28 (`npm test`) y `dist:win` funcionen en cualquier clon/CI?
  7. **`package.json` (`name`, `version`, `@types/*`, `test:fase2..9`, `dev`/`start`)**: ¿qué nombre y versión oficial fijamos, movemos `@google/genai`/`motion`/`autoprefixer` y `@types/*`, y mantenemos `test:fase2..9` como atajos?
  8. **Archivos locales fuera de Git (`backup_sistema_contable_pre_migracion.dump`, `ATLOB_ERP_PCGE_2026_CLASIFICADO_v2.xlsx`)**: confirmar que se conservan sin mover ni tocar.
