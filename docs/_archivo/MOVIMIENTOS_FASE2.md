# Registro de Movimientos — Fase 2 de Limpieza Segura (`C0`–`C6`)

- **Rama de trabajo:** `chore/limpieza-y-mejoras` (sin push a remoto ni merge a `main`)
- **Tag base:** `pre-limpieza` (`e402bef`)
- **Fecha de ejecución:** 2026-11-11
- **Inventario origen:** [INVENTARIO_LIMPIEZA.md](./INVENTARIO_LIMPIEZA.md)

---

## 1. Bitácora Completa de Movimientos y Cambios (`C0`–`C6`)

| Bloque | Archivo / Elemento | Origen → Destino / Cambio | Commit | Motivo | Reversión |
| :---: | :--- | :--- | :---: | :--- | :--- |
| **C0** | `server/services/planillaService.ts` | Modificación preexistente preservada en las líneas 935, 1737, 1937 y 2115 (indentación de ternarios) | `bca32e4` | Aislar el cambio previo del árbol de trabajo en un commit independiente antes de iniciar la limpieza. | `git revert bca32e4` |
| **C1** | `.gitignore` | Línea 2: `build/` → `/build/` | `f696de8` | Evitar que la regla ignore `desktop/build/` mientras se mantiene ignorado el directorio `/build/` de raíz. | `git revert f696de8` |
| **C1** | `desktop/build/icon.ico` | No rastreado en Git → versionado (`86,658 B`, SHA-256 `2BF1239C0E6DA0426CD215F79653B6B6F35A14A615B2E446B11FBC669E97F263`) | `f696de8` | Recurso obligatorio validado contra `docs/engineering/MARCA.md` y Suite 28 para empaquetado Electron en clones limpios/CI. | `git revert f696de8` |
| **C1** | `desktop/build/icon.png` | No rastreado en Git → versionado (`187,983 B`, SHA-256 `B74C2FEDA34C79EBF9B9384B04796009370039DB110FB2EA30B00E24C9403165`) | `f696de8` | Coincidencia 100% con `MARCA.md`; necesario para compilación/verificación portátil en CI. | `git revert f696de8` |
| **C1** | `desktop/build/installerHeader.bmp` | No rastreado en Git → versionado (`25,818 B`, SHA-256 `B7F3D147F43D682E64F741EB2C7048589E2C21B984448648075774A8650B742D`) | `f696de8` | Coincidencia 100% con `MARCA.md`; requerido por `desktop/electron-builder.yml`. | `git revert f696de8` |
| **C1** | `desktop/build/installerSidebar.bmp` | No rastreado en Git → versionado (`154,542 B`, SHA-256 `FE4304FD2BF5B188FFD7C182DE087F36264445C546C43CD96052982A0E7D2639`) | `f696de8` | Coincidencia 100% con `MARCA.md`; requerido por `desktop/electron-builder.yml`. | `git revert f696de8` |
| **C2** | `Atlob_Consultores_ERP___Barra_superior_b5c47105.html` | `public/assets/aistudio/...` → `_cuarentena/referencias/Atlob_Consultores_ERP___Barra_superior_b5c47105.html` | `9510a5a` | Mockup HTML huérfano en `public/` sin referencias en runtime que se copiaba innecesariamente a `dist/` y al `.asar` de escritorio. | `git revert 9510a5a` |
| **C2** | `_cuarentena/README.md` y `_cuarentena/referencias/README.md` | Creados en `_cuarentena/` | `9510a5a` | Documentar alcance, origen, fecha y reversibilidad de cuarentena según Regla 4. | `git revert 9510a5a` |
| **C3** | `MEMORIA_TECNICA_V2.md` | `docs/MEMORIA_TECNICA_V2.md` → `docs/_archivo/MEMORIA_TECNICA_V2.md` (con nota de cabecera de 1 línea y ajuste de ruta relativa a `../engineering/PLAN_IMPLEMENTACION.md`) | `b9744af` | Documento histórico de octubre 2026 previo a bloques A–F, PCGE 2026 y Desktop Electron; reemplazado por `SISTEMA_ATLOB_ERP.md`. | `git revert b9744af` |
| **C3** | `docs/_archivo/README.md` | Creado en `docs/_archivo/` | `b9744af` | Índice del archivo histórico de documentación. | `git revert b9744af` |
| **C3** | `docs/MATRIZ_TRAZABILIDAD.csv` | Línea 86 actualizada a `docs/_archivo/MEMORIA_TECNICA_V2.md` | `b9744af` | Evitar enlace roto hacia la ubicación previa de `MEMORIA_TECNICA_V2.md`. | `git revert b9744af` |
| **C3** | `SISTEMA_ATLOB_ERP.md` | Líneas 344 y 381 actualizadas a `docs/_archivo/MEMORIA_TECNICA_V2.md` | `b9744af` | Mantener válidas las referencias cruzadas al documento histórico archivado. | `git revert b9744af` |
| **C4** | `tsconfig.json` | Añadido `"_cuarentena"` al arreglo `"exclude"` | `cccd58b` | Evitar que `tsc --noEmit` compile código trasladado a `_cuarentena/`. | `git revert cccd58b` |
| **C4** | `vite.config.ts` | Añadido `{ ignored: ['**/_cuarentena/**'] }` en `server.watch` (cuando `DISABLE_HMR !== 'true'`) | `cccd58b` | Excluir `_cuarentena/` de vigilancia HMR en desarrollo. | `git revert cccd58b` |
| **C4** | `AccesoDenegadoView.tsx` | `src/components/views/AccesoDenegadoView.tsx` → `_cuarentena/vistas/AccesoDenegadoView.tsx` | `cccd58b` | Vista sin ruta en `src/App.tsx`, sin ítem en `MENU_DATA` y sin importadores. | `git revert cccd58b` |
| **C4** | `CarteraSaldosView.tsx` | `src/components/views/CarteraSaldosView.tsx` → `_cuarentena/vistas/CarteraSaldosView.tsx` | `cccd58b` | Vista monolítica sin ruta, reemplazada por vistas específicas de cartera. | `git revert cccd58b` |
| **C4** | `EmpresasClientesView.tsx` | `src/components/views/EmpresasClientesView.tsx` → `_cuarentena/vistas/EmpresasClientesView.tsx` | `cccd58b` | Vista sin ruta reemplazada por `MisEmpresasNivel1View`. | `git revert cccd58b` |
| **C4** | `GestionNegocioView.tsx` | `src/components/views/GestionNegocioView.tsx` → `_cuarentena/vistas/GestionNegocioView.tsx` | `cccd58b` | Vista sin ruta ni importadores. | `git revert cccd58b` |
| **C4** | `MaestrosView.tsx` | `src/components/views/MaestrosView.tsx` → `_cuarentena/vistas/MaestrosView.tsx` | `cccd58b` | Vista monolítica sin ruta; reemplazada por vistas de maestros específicas (`PlanCuentasView`, `TipoCambioView`, `ClientesProveedoresView`). | `git revert cccd58b` |
| **C4** | `SqlDatabaseView.tsx` | `src/components/views/SqlDatabaseView.tsx` → `_cuarentena/vistas/SqlDatabaseView.tsx` | `cccd58b` | Vista consola SQL cliente sin ruta ni importadores. | `git revert cccd58b` |
| **C4** | `sqlDatabaseService.ts` | `src/services/sqlDatabaseService.ts` → `_cuarentena/servicios/sqlDatabaseService.ts` | `cccd58b` | Dependencia exclusiva cuyo único importador en todo el repositorio era `SqlDatabaseView.tsx`. | `git revert cccd58b` |
| **C4** | `_cuarentena/vistas/README.md` y `_cuarentena/servicios/README.md` | Creados en `_cuarentena/` | `cccd58b` | Registro de vistas y servicios trasladados en C4. | `git revert cccd58b` |
| **C5** | `reglasContabilizacionCatalogo.ts` | `server/data/catalogos/reglasContabilizacionCatalogo.ts` → `_cuarentena/server/reglasContabilizacionCatalogo.ts` | `3451edc` | Catálogo huérfano sin importadores ni lecturas dinámicas en código, scripts, SQL, pruebas o CI. | `git revert 3451edc` |
| **C5** | `subdiariosCatalogo.ts` | `server/data/catalogos/subdiariosCatalogo.ts` → `_cuarentena/server/subdiariosCatalogo.ts` | `3451edc` | Catálogo huérfano con mapa obsoleto (`'07'` Caja Chica) desalineado con BD y `subdiarioService.ts`. | `git revert 3451edc` |
| **C5** | `sunatCatalogos.ts` | `server/data/catalogos/sunatCatalogos.ts` → `_cuarentena/server/sunatCatalogos.ts` | `3451edc` | Subconjunto duplicado sin uso de `src/data/sunatCatalogos.ts`. | `git revert 3451edc` |
| **C5** | `_cuarentena/server/README.md` | Creado en `_cuarentena/server/` | `3451edc` | Registro de catálogos de servidor trasladados en C5. | `git revert 3451edc` |
| **C6** | `package.json` y `package-lock.json` | Desinstalados `@google/genai`, `motion`, `autoprefixer` (`-45` paquetes en árbol); movidos 5 `@types/*` (`adm-zip`, `bcryptjs`, `cors`, `jsonwebtoken`, `pg`) a `devDependencies`; eliminado script `test:all`; conservados `name: "contabilidad-estudio"`, `version: "0.0.0"` y `test:fase2..9`. | `d691878` | Retiro de dependencias sin importadores, separación correcta de tipos en compilación y eliminación del alias `test:all` idéntico a `test`. | `git revert d691878` *(y `npm install`)* |

---

## 2. Verificación Por Commit y Comparativa Antes / Después

### 2.1 Evolución `lint` + `build` + `test` (`C0`–`C6`)

| Punto | Commit | `npm run lint` (`tsc`) | `vite build` (módulos y chunk principal) | `npm test` (suites / aserciones) | Verificaciones adicionales |
| :--- | :---: | :---: | :--- | :---: | :--- |
| **Línea base** | `e402bef` | 0 errores | `2,101` módulos · `index-C_F132wg.js` (`2,434.40 kB`, gzip `528.10 kB`) | `36/36` · `3,390` | Baseline desktop medido previo a C6 (`app.asar` `507,918 B`) |
| **C0** | `bca32e4` | 0 errores | `2,101` módulos · `index-C_F132wg.js` (`2,434.40 kB`, gzip `528.10 kB`) | `36/36` · `3,390` | — |
| **C1** | `f696de8` | 0 errores | `2,101` módulos · `index-C_F132wg.js` (`2,434.40 kB`, gzip `528.10 kB`) | `36/36` · `3,390` | Suite 28 (`59` aserciones); `desktop:verify` (`archivos=50 \| textos=36 \| hallazgos=0`); `git status --ignored` confirma `/build/` ignorado |
| **C2** | `9510a5a` | 0 errores | `2,101` módulos · `index-C_F132wg.js` (`2,434.40 kB`, gzip `528.10 kB`) | `36/36` · `3,390` | `dist/` bajó de `17` a `16` archivos (sin `dist/assets/aistudio/`); `0` menciones a terceros en `src/`, `public/`, `dist/` (`194` archivos) |
| **C3** | `b9744af` | 0 errores | `2,101` módulos · `index-C_F132wg.js` (`2,434.40 kB`, gzip `528.10 kB`) | `36/36` · `3,390` | Comprobación previa: `0` lecturas en código, scripts, tests o CI sobre `MEMORIA_TECNICA_V2.md` o `MATRIZ_TRAZABILIDAD.csv` |
| **C4** | `cccd58b` | 0 errores | `2,101` módulos · `index-C_F132wg.js` (`2,434.40 kB`, gzip `528.10 kB`) | `36/36` · `3,390` | Suite 22 (`374` aserciones, `89` hojas menú) y Suite 36 (`69` escenarios, `32` archivos, `4` controles negativos) OK |
| **C5** | `3451edc` | 0 errores | `2,101` módulos · `index-C_F132wg.js` (`2,434.40 kB`, gzip `528.10 kB`) | `36/36` · `3,390` | `0` imports ni lecturas dinámicas de los 3 catálogos en todo el repositorio |
| **C6** | `d691878` | 0 errores | `2,101` módulos · `index-C_F132wg.js` (`2,434.40 kB`, gzip `528.10 kB`) | `36/36` · `3,390` | `test:secretos-frontend` (`archivos=166 \| EXIT=0`), `dist:win` OK, `desktop:verify` (`archivos=49 \| textos=35 \| hallazgos=0`) |

### 2.2 Invariante de Bundle Web (`dist/`)

- **Antes (línea base `e402bef`)**: `2,101` módulos transformados; `dist/assets/index-C_F132wg.js` = `2,434.40 kB` (`528.10 kB` gzip); `17` archivos en `dist/` (incluía `dist/assets/aistudio/Atlob_Consultores_ERP___Barra_superior_b5c47105.html`).
- **Después (`d691878`)**: **`2,101` módulos exactos**; hash y tamaño del bundle idénticos (`dist/assets/index-C_F132wg.js` = `2,434.40 kB`, `528.10 kB` gzip); **`16` archivos** en `dist/` tras retirar en C2 el HTML huérfano de `public/`. Ninguno de los commits C3–C5 tocó código vivo alcanzable.

### 2.3 Tamaño de Instaladores y Paquete Electron (`release/`)

| Artefacto | En C1 (`f696de8`, antes de C2 y C6) | Después de C6 (`d691878`) | Variación | Observación |
| :--- | :---: | :---: | :---: | :--- |
| `release/win-unpacked/resources/app.asar` | `507,918 B` | `507,602 B` | `-316 B` | `desktop:verify` bajó de `archivos=50 \| textos=36` a `archivos=49 \| textos=35` (`hallazgos=0`) al retirar en C2 la entrada del HTML huérfano (`desktop/generated/**` va en `asarUnpack`). |
| `release/ATLOB-ERP-0.0.0-Setup-x64.exe` | `123,410,653 B` | `123,406,440 B` | `-4,213 B` | Compilación NSIS exitosa |
| `release/ATLOB-ERP-0.0.0-Portable-x64.exe` | `112,190,081 B` | `112,185,069 B` | `-5,012 B` | Compilación Portable exitosa |

---

## 3. Verificaciones Específicas y Notas para Fase 3

### 3.1 Revisión de `vite.config.ts` y `.env.example` tras desinstalar `@google/genai`

- **`vite.config.ts`**: limpio (`envDir: false as const`); no contiene bloque `define` ni referencias a `GEMINI_API_KEY` o `@google/genai`.
- **`.env.example`**: conserva la línea `GEMINI_API_KEY=` en la línea 12 (sin referencia activa en código ni en Vite). Se reporta sin modificar archivos fuera del alcance acordado para decidir su retiro o limpieza en Fase 3 si procede.

### 3.2 Exclusividad de `src/data/maestros.ts` en C4

- **Conservado en `src/data/maestros.ts` (no movido en C4)**: el análisis de importadores confirmó que **no era exclusivo** de `MaestrosView.tsx`, pues sigue siendo importado por vistas enrutadas activas (`src/components/views/ClientesProveedoresView.tsx` y `src/components/views/TipoCambioView.tsx`).

### 3.3 Referencia residual a `test:all`

- Ningún archivo de código fuente, script npm, prueba o flujo CI (`.github/workflows/test-pg.yml`) invoca `test:all`.
- Única mención descriptiva restante: `SISTEMA_ATLOB_ERP.md` línea 55 (listado de scripts existentes, para actualizar en Fase 3 al regenerar la documentación).

### 3.4 Pendientes Conservados Sin Tocar (para "Segunda Pasada" y Fase 3)

#### A. Elementos huérfanos de "segunda pasada" (conservados sin mover en Fase 2)

1. `src/components/modals/ConfirmarCambioEmpresaModal.tsx`
2. `src/components/desktop/TitleBar.tsx`
3. `src/components/desktop/BackgroundJobsPanel.tsx`
4. `src/components/layout/EmpresaSidebarNivel2.tsx`
5. `src/hooks/useEmpresas.ts`
6. `src/api/empresaNavegacionApi.ts`
7. `src/api/reportesApi.ts`
8. `src/assets/brand/atlob_app_icon_512.png`

#### B. Otros elementos conservados por decisión explícita en Fase 2

- **9 vistas sin ítem de menú conservadas sin cambios:** `ActivosKardexView.tsx`, `ProcesosCierreView.tsx`, `TesoreriaAvanzadaView.tsx` (citadas en la protegida `docs/MATRIZ_COMPLETITUD_ASIENTOS.md` y validadas en disco por Suite 36), `FacturacionElectronicaView.tsx` (protegida por Regla 7), `CajaChicaView.tsx`, `AuditoriaView.tsx`, `ReportesFinancierosView.tsx`, `ReportesSunatEspecialesView.tsx` y `ReglasContabilizacionView.tsx`.
- **Documentación actualizada en Fase 3 (ver Sección 4):** `docs/INICIO_ESCRITORIO.md`, `docs/BACKUP_BASE_DATOS.md`, `docs/engineering/SEGURIDAD.md`, `docs/engineering/ESCRITORIO_WINDOWS.md`, `.env.example`, `docs/README.md` y `SISTEMA_ATLOB_ERP.md`.
- **Históricos / artefactos conservados sin mover en Fase 2:** `docs/MATRIZ_TRAZABILIDAD.csv`, `docs/evidencia/*`, `docs/evidencia/normas/ley_29173.pdf`, `docs/evidencia/normas/reglamento_igv_cap5.htm`, `metadata.json`, `bun.lock`, `.aistudio/artifacts/...`. (`docs/RESULTADOS_VERIFICACION.txt` fue archivado en `docs/_archivo/` durante D4.)

---

## 4. Cierre de Fase 3 — Sincronización Documental (D0–D9)

En Fase 3 se mantuvo sin alteraciones el código fuente (`.ts`/`.tsx`/`.cjs`/`.ps1`) y se conservaron íntegros todos los archivos protegidos; las notas pendientes de los apartados **3.1** (`GEMINI_API_KEY` en `.env.example`) y **3.3** (`test:all` en `SISTEMA_ATLOB_ERP.md`) quedaron cerradas en D5 y D7.

### 4.1 Commits e Invariantes de Fase 3 (`0868bee..HEAD`)

| Bloque | Commit | Alcance y Archivos Editados | Lint / Build (`vite`) | `npm test` |
| :---: | :---: | :--- | :---: | :---: |
| **D0** | *(incluido en D9)* | Creación de `docs/_archivo/MEDICIONES_FASE3.md` con conteos y comandos reproducibles sobre `379a6ec`. | — | — |
| **D1** | `0868bee` | `docs/engineering/SEGURIDAD.md` y `docs/engineering/ESCRITORIO_WINDOWS.md`: actualizados a `21` migraciones, `81` tablas (`64` RLS, `75` FKs compuestas), `18` servicios solo en memoria, `config.html`, `verifyOnly` en `sistema_contable`, HTTP `403`, `asarUnpack` y `after-pack.cjs`. | `0` err · `2,101` mód · `index-C_F132wg.js` (`2,434.40 kB` / `528.10 kB` gzip) | `36/36` · `3,390` (`154.44s`) |
| **D2** | `0b71f96` | `docs/INICIO_ESCRITORIO.md`: eliminada afirmación obsoleta sobre ausencia de Electron; documentados los dos caminos reales (Electron `45.2.3` Setup/Portable x64 y `Iniciar-Escritorio.bat` + `scripts/inicializar-escritorio.ps1`). | `0` err · `2,101` mód · `index-C_F132wg.js` (`2,434.40 kB` / `528.10 kB` gzip) | `36/36` · `3,390` (`182.62s`) |
| **D3** | `02cf216` | `docs/BACKUP_BASE_DATOS.md`: añadida sección *Alcance de cada tipo de respaldo* diferenciando `pg_dump`/WAL del respaldo lógico por empresa en `backupEmpresaService.ts` (excluye credenciales/roles y actualmente lee/restaura solo `*_MEMORIA` en sus `20` colecciones operativas). | `0` err · `2,101` mód · `index-C_F132wg.js` (`2,434.40 kB` / `528.10 kB` gzip) | `36/36` · `3,390` (`153.32s`) |
| **D4** | `145c5f3` | Archivó `docs/RESULTADOS_VERIFICACION.txt` en `docs/_archivo/` (actualizó `docs/_archivo/README.md`), mantuvo `docs/MATRIZ_TRAZABILIDAD.csv`, y añadió `docs/evidencia/lint.txt`, `build.txt` y `npm_test.txt` a `.gitignore` (`git rm --cached`). | `0` err · `2,101` mód · `index-C_F132wg.js` (`2,434.40 kB` / `528.10 kB` gzip) | `36/36` · `3,390` (`135.05s`) |
| **D5** | `a185f23` | `.env.example` y `docs/engineering/SEGURIDAD.md`: retirada `GEMINI_API_KEY` sin referencias en el repo y alineado `.env.example` con `server/config/env.ts`. | `0` err · `2,101` mód · `index-C_F132wg.js` (`2,434.40 kB` / `528.10 kB` gzip) | `36/36` · `3,390` (`164.04s`) |
| **D6** | `9cc42f0` | Creado índice maestro [`docs/README.md`](../README.md) (activos, ingeniería, archivo histórico y política de cuarentena). | `0` err · `2,101` mód · `index-C_F132wg.js` (`2,434.40 kB` / `528.10 kB` gzip) | `36/36` · `3,390` (`125.43s`) |
| **D7** | `16ac3cd` | Regenerado [`SISTEMA_ATLOB_ERP.md`](../../SISTEMA_ATLOB_ERP.md) con mediciones reales de D0, `25` scripts (sin `test:all`), Ley 32219 conforme a `NORMAS_VERIFICADAS.md`, Sección 10 con deriva resuelta en Fase 3, índice Sección 12 y Sección 13 *Limpieza*. | `0` err · `2,101` mód · `index-C_F132wg.js` (`2,434.40 kB` / `528.10 kB` gzip) | `36/36` · `3,390` (`127.27s`) |
| **D8** | *(sin cambios requeridos)* | Escaneo temporal en memoria (`node --input-type=module -`) sobre `28` archivos `.md` y `75` enlaces relativos (`77` tras añadir D9): **`0` enlaces rotos** (`BROKEN=0`). | — | — |
| **D9** | *(este commit)* | Consolidación de `MEDICIONES_FASE3.md`, `MOVIMIENTOS_FASE2.md` y `docs/_archivo/README.md`, verificación final completa y tag `post-limpieza`. | `0` err · `2,101` mód · `index-C_F132wg.js` (`2,434.40 kB` / `528.10 kB` gzip) | `36/36` · `3,390` |
