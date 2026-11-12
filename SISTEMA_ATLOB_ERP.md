# Informe Técnico Integral para Revisión Externa — ATLOB ERP

**Sistema Contable, Tributario y de Planillas (Perú — PCGE 2026 / SUNAT / SIRE / PLE / PLAME)**  
**Fecha de auditoría técnica:** 11 de Noviembre de 2026  
**Versión de paquete (`package.json`):** `0.0.0` (`contabilidad-estudio`)  
**Rama y commit base evaluado:** `main` (`a0f7da4`, 09 de Noviembre de 2026)  
**Propósito del documento:** Entregar a revisores técnicos y contadores externos una radiografía exacta, verificada en el código fuente y con métricas reproducibles, separando estrictamente lo implementado y probado en memoria/estático de lo pendiente de certificación sobre PostgreSQL real.

---

## 1. Resumen Ejecutivo y Dictamen de Madurez

**ATLOB ERP** es una plataforma contable multiempresa diseñada para estudios contables peruanos con arquitectura cliente-servidor (React + Express + PostgreSQL) empaquetada también como aplicación de escritorio local para Windows mediante Electron (`pe.atlob.erp`). Desde la revisión documental previa del 04 de Noviembre de 2026 se han incorporado **34 commits** hasta `a0f7da4`, destacando la aplicación de escritorio Windows con asistente de conexión local y cifrado DPAPI, el aislamiento por fila (RLS) y claves foráneas compuestas en catálogo, el Plan Contable General Empresarial (PCGE 2026) completo, el módulo de Análisis de Cuentas con marcas de auditoría, el catálogo dinámico de Subdiarios (`00`–`11`), la digitalización integral de comprobantes (Compras RCE, Ventas RVIE, Tesorería, Honorarios y Planillas), las tasas IGV por vigencia según Ley 32219, la corrección de hashes CRLF/LF en migraciones y la verificación automática de matriz de trazabilidad.

### Estado verificable al 11 de Noviembre de 2026

| Dimensión | Resultado Verificado | Alcance y Salvedades Exactas |
| :--- | :--- | :--- |
| **Compilación de tipos (`npm run lint`)** | **Aprobado (`0` errores)** | Ejecutado `tsc --noEmit` sobre el repositorio actual el 11/11/2026. |
| **Empaquetado Frontend (`npm run build`)** | **Aprobado (`15.95s`)** | `vite v8.3.5`, `2,101` módulos transformados; bundle principal `dist/assets/index-C_F132wg.js` (`2,434.40 kB` / `528.10 kB` gzip). |
| **Batería automatizada (`npm test`)** | **36 / 36 suites OK (`3,390` aserciones en `194.94s`)** | Ejecutado con `NODE_ENV=test` y `DATABASE_URL=''` (motor en memoria, `pg-mem`, análisis estático y subprocesos Node). Incluye verificación de matriz de asientos y CRLF/LF. |
| **Pruebas en PostgreSQL 18 real (`server/tests/real/*`)** | **No ejecutado en esta sesión** | Existen `6` suites TypeScript + inicializador Docker/bash y workflow CI (`.github/workflows/test-pg.yml`), pero requieren instancia PostgreSQL real (`atlob_test` / `contabilidad_app`) no conectada durante este reporte. |
| **Persistencia SQL en servicios (`server/services/`)** | **Parcial (`24 / 53` con SQL; `18 / 53` solo en memoria)** | 24 servicios operan sobre PostgreSQL (muchos conservan respaldo `*_MEMORIA` en dev/test); **18 servicios siguen exclusivamente en memoria** y **11** son adaptadores/helpers sin estado propio. |
| **Empaquetado Escritorio Windows (`desktop/`)** | **Implementado** | Electron `45.2.3` + `electron-builder` `26.18.0` (NSIS Setup + Portable x64), cifrado DPAPI `instalacion.bin`, puerto `127.0.0.1` efímero y verificador ASAR (`desktop:verify`). |
| **Cobertura de Asientos (`MATRIZ_COMPLETITUD_ASIENTOS.md`)** | **69 escenarios validados por script** | **60** `PROBADO CON MOTOR EN MEMORIA`, **4** `PARCIAL`, **5** `NO IMPLEMENTADO`, **0** `IMPLEMENTADO Y PROBADO EN POSTGRESQL REAL`. |

> **Veredicto honesto para revisión externa:** El sistema presenta una base funcional amplia, reglas contables/tributarias documentadas con trazabilidad normativa y controles de seguridad sólidos en arranque y empaquetado de escritorio; sin embargo, **no debe certificarse aún como sistema finalizado para producción multiusuario** conforme al plan vigente ([`docs/engineering/PLAN_IMPLEMENTACION.md`](docs/engineering/PLAN_IMPLEMENTACION.md)), mientras permanezcan `18` servicios sin persistencia SQL en PostgreSQL (incluyendo Planillas, Honorarios, Kardex, Activos Fijos, Conciliación Bancaria, Cierre Anual, PLE y Backup real de base de datos), el script `npm run verify` siga ausente en `package.json` y las pruebas reales sobre PostgreSQL 18 (Fases B, B2, C, D y E) no completen certificación integral.

---

## 2. Inventario Técnico y Arquitectura del Repositorio

### 2.1 Stack Tecnológico Verificado (`package.json`)

- **Frontend:** `react` `^19.0.1`, `vite` `^8.3.0` (`v8.3.5` en ejecución), `typescript` `^7.0.2`, Tailwind CSS vía `@tailwindcss/vite`, `@fontsource/roboto-condensed` `^5.3.0`, iconografía `lucide-react`.
- **Backend:** `express`, `pg` `^8.23.1`, `pg-mem` `^3.0.14` (pruebas), `decimal.js` `^10.6.0` (aritmética exacta), `zod` `^4.6.5` (validación de esquemas), `bcryptjs`, `adm-zip`, `tsx`.
- **Escritorio Windows:** `electron` `45.2.3`, `electron-builder` `26.18.0`, `@electron/asar` `4.3.1`, `esbuild` `^0.28.2`.

### 2.2 Estructura y Conteo Real de Archivos (11 de Noviembre de 2026)

| Capa / Directorio | Cantidad Medida | Composición Principal |
| :--- | :---: | :--- |
| **`src/` (`.ts` / `.tsx`)** | **166** | `84` vistas (`src/components/views/*.tsx`), `12` modales (`src/components/modals/*.tsx`), `20` clientes API (`src/api/`), `9` hooks (`src/hooks/`), motor estándar de reportes (`src/services/reports/formato_estandar/formatoEstandarEngine.ts`), utilitario de redondeo USD (`src/utils/redondeoUsd.ts`) y catálogo visual de menú (`src/types/menu.ts`). |
| **`server/` (`.ts`)** | **164** | `53` servicios (`server/services/`), `27` archivos de rutas (`server/routes/`, 26 módulos montados bajo `/api`), `12` controladores (`server/controllers/`), `3` middlewares (`server/middlewares/`), `3` repositorios (`server/repositories/`), `40` suites/utilidades en `server/tests/` y `6` suites PostgreSQL real en `server/tests/real/`. |
| **`server/db/`** | **35** | `21` migraciones SQL registradas en `MIGRATION_FILES`, `7` scripts SQL `fk_empresa_01..07.sql` y `7` módulos `.ts` (`migrate.ts`, `migration-files.ts`, `seguridadRls.ts`, etc.). |
| **`server/storage/`** | Declarativo | `registroDatosEmpresa.ts` con **81 entradas** de tablas en `REGISTRO_DATOS_EMPRESA` y **7 carpetas** en `REGISTRO_ARCHIVOS_EMPRESA`. |
| **`desktop/`** | **12** (+ subdirs) | `main.cjs`, `desktop-config.cjs`, `desktop-config.test.cjs`, `config-preload.cjs`, `config-renderer.js`, `config.html`, `config.css`, `electron-builder.yml`, `after-pack.cjs`, `package-files.mjs`, `prepare.ts`, `verify-package.ts` (además de `assets/`, `build/` y `generated/`). |
| **`scripts/`** | **3** | `descargar-normas.ts`, `inicializar-escritorio.ps1`, `verificar-matriz.ts`. |
| **Raíz y CI** | — | `server.ts`, `Iniciar-Escritorio.bat`, `docker-compose.test.yml`, `.github/workflows/test-pg.yml`, `AGENTS.md`, `SISTEMA_ATLOB_ERP.md`. |

### 2.3 Scripts Disponibles en `package.json` (`26` scripts)

- **Ejecución y desarrollo:** `dev`, `start`, `build`, `preview`, `clean`, `lint`.
- **Escritorio Windows:** `desktop:dev`, `dist:win`, `desktop:verify`.
- **Pruebas:** `test` (`tsx server/tests/run_all_tests.ts`), `test:all`, `test:fase2`..`test:fase9`, `test:secretos-frontend`, `test:sonda-sunat`, `test:pg`, `test:pg:docker`, `test:coverage`, `test:infra`.
- **Datos PCGE:** `cargar:pcge`.
- **Brecha frente al plan (`PLAN_IMPLEMENTACION.md`):** El plan maestro y `AGENTS.md` exigen ejecutar la certificación real desde `npm run verify`, script que **todavía no existe** en `package.json`.

---

## 3. Aplicación de Escritorio para Windows (Electron)

> **Actualización clave frente al informe anterior:** La nota previa de roadmap sobre evaluar Tauri 2.0 queda obsoleta. El empaquetado nativo para Windows está implementado sobre **Electron 45.2.3** y **`electron-builder` 26.18.0** en `desktop/` (`appId: pe.atlob.erp`).

### 3.1 Arranque, Configuración Local y Cifrado DPAPI (`desktop/main.cjs`, `desktop/desktop-config.cjs`)

1. **Asistente de conexión local (`config.html` / `config-preload.cjs`):**
   - `validarConexion()` restringe el servidor estrictamente a direcciones locales (`localhost`, `127.0.0.1`, `::1`, `[::1]`), puertos numéricos `1..65535`, identificadores de base/usuario $\le 63$ bytes sin caracteres de control ni `.`/`..`, y contraseña obligatoria.
   - Diagnósticos diferenciados ante fallos PostgreSQL (`28P01`, `28000`, `3D000`, `42501`, `57P03`, `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, `PG_ROLE_UNSAFE`, `MIGRATIONS_PENDING`).
2. **Persistencia cifrada en disco (`instalacion.bin`):**
   - Almacena la configuración en `join(app.getPath('userData'), 'instalacion.bin')` utilizando Windows DPAPI vía `electron.safeStorage.encryptStringAsync` / `decryptStringAsync`.
   - `nuevosSecretos()` genera 5 llaves criptográficas aleatorias independientes de 32 bytes (64 hex cada una): `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SUNAT_ENCRYPTION_KEY`, `MFA_SEED_SECRET`, `BACKUP_ENCRYPTION_KEY`.
3. **Subproceso backend (`utilityProcess.fork`) y endurecimiento (`server.ts`):**
   - Ejecuta `desktop/generated/server.mjs` en modo `NODE_ENV=production`, `DOTENV_CONFIG_PATH=''`, `HOST=127.0.0.1`, `PORT=0` (puerto efímero local) y `ATLOB_DESKTOP=1`.
   - En `server.ts`, cuando `ATLOB_DESKTOP === '1'`:
     - Rechaza con HTTP `403` cualquier petición cuyo `Host` o `Origin` difiera de `http://127.0.0.1:<puerto>`.
     - Ejecuta `verificarBaseEscritorio()`, consultando `pg_roles` para abortar con `PG_ROLE_UNSAFE` si el usuario de base es superusuario (`rolsuper`), evade RLS (`rolbypassrls`), crea roles (`rolcreaterole`) o no coincide con `session_user`.
     - Por seguridad operativa, invoca `runMigrations({ verifyOnly: ... })` por defecto (nunca auto-migra `sistema_contable` y solo migra otras bases si `ATLOB_DESKTOP_MIGRATE === '1'`).
   - El proceso principal espera confirmación vía `/api/health` exigiendo `status === 'UP'` y `database === 'POSTGRESQL_CONNECTED'`.
4. **Aislamiento de ventana (`BrowserWindow`):**
   - `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `devTools: false`, bloqueo de `setWindowOpenHandler`, denegación de permisos en sesiones y filtro de `will-navigate`, `will-redirect` y `will-attach-webview`.

### 3.2 Distribución y Verificador de Integridad (`desktop/electron-builder.yml`, `desktop/verify-package.ts`)

- **Objetivos Windows (`x64`):** Instalador NSIS (`ATLOB-ERP-${version}-Setup-${arch}.exe`, por usuario `perMachine: false`) y ejecutable portable (`ATLOB-ERP-${version}-Portable-${arch}.exe`), empaquetando `app.asar` con `desktop/generated/**` desempaquetado (`asarUnpack`).
- **Verificador `desktop:verify` (`verify-package.ts`):** Analiza el archivo `app.asar` resultante comprobando presencia de `package.json`, archivos declarados en `desktopFiles`, todas las migraciones `MIGRATION_FILES`, `server.mjs` y `dist/index.html`; prohíbe rutas con `..`, `.env*`, `.pgpass`, `node_modules`, `tests`, backups, certificados/llaves (`.pfx`, `.p12`, `.key`, `.pem`), y escanea los activos contra `huellasHistoricas`, `HUELLAS_HISTORICAS_SERVIDOR` y los secretos de `.env` local (mediante hash SHA-256).

---

## 4. Base de Datos, Migraciones, Aislamiento y Estado Real de Persistencia

### 4.1 Arquitectura B y Catálogo de Migraciones (`server/db/`)

El sistema adopta la **Arquitectura B** definida en `docs/engineering/PLAN_IMPLEMENTACION.md`: base de control del estudio + aislamiento estricto por empresa sin dependencias cruzadas entre empresas. El archivo `server/db/migration-files.ts` registra **21 archivos SQL secuenciales**:

1. `schema_a_preflight.sql`
2. `schema.sql`
3. `schema_fase2.sql`
4. `schema_fase3.sql`
5. `schema_fase4.sql`
6. `schema_fase5.sql`
7. `schema_fase6.sql`
8. `schema_fase7.sql`
9. `schema_a_compat.sql`
10. `triggers_fase2.sql`
11. `schema_fase8_tributos.sql`
12. `schema_fase9_planillas.sql`
13. `schema_fase10_normativa_asientos.sql`
14. `schema_fase11_automatizacion_inventarios.sql`
15. `schema_aislamiento_empresa.sql`
16. `schema_fase12_inicio_licencia.sql`
17. `schema_fase13_pcge_completo.sql`
18. `schema_fase14_subdiarios_personalizables.sql`
19. `schema_fase15_analisis_cuentas.sql`
20. `schema_fase16_plan_cuentas_columnas.sql`
21. `schema_fase17_plan_cuentas_cierre_tipo.sql`

- **Resiliencia de hashes (`server/db/migrate.ts`):** Para evitar falsos bloqueos `MIGRATIONS_INVALID` por diferencias de fin de línea en Windows (`CRLF` vs `LF`), el migrador normaliza `\r\n` a `\n` y valida hashes históricos registrados tanto en LF como en CRLF antes de rechazar cambios no autorizados. Validado por la Suite 35 (`test_migrate_crlf_lf.ts`, 4 aserciones).

### 4.2 Aislamiento RLS, Contexto Transaccional y Claves Foráneas Compuestas

- **Contexto por transacción (`server/config/database.ts`):** Utiliza `AsyncLocalStorage` (`conContextoUsuario`, `conContextoEmpresa`) y fija variables locales de transacción mediante `SELECT set_config('app.current_empresa_id', $1, true), set_config('app.empresa_id', $1, true)` y `app.current_user_id` / `app.usuario_id`, bloqueando cambios incompatibles dentro de una misma ejecución (`CONTEXTO_EMPRESA_INCOMPATIBLE`). En `NODE_ENV=production`, `initializeDatabase()` y `db.query()` abortan si `DATABASE_URL` o el pool no están disponibles (`DATABASE_URL_REQUERIDA`, `DATABASE_NO_DISPONIBLE`).
- **Políticas Row-Level Security (`server/db/seguridadRls.ts`):** Define `ETAPAS_RLS` (`5.1` Crítica, `5.2a`, `5.2b`, `5.2c` Alta y `5.3` Baja) aplicando `CREATE POLICY aislamiento_atlob ... USING (...) WITH CHECK (...)` más `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY` (incluso para tablas hijas como `planilla_lineas` vía `EXISTS` hacia `planillas`).  
  > **Dato operativo importante:** `seguridadRls.ts:50` documenta explícitamente que las etapas RLS **se ejecutan fuera del migrador automático de arranque** mediante transacciones explícitas del operador y pruebas dedicadas (`test_pg_seguridad.ts`, `test_pg_rls_planillas.ts`).
- **Claves foráneas compuestas (`fk_empresa_01..07.sql`):** Refuerzan integridad referencial compuesta por `(empresa_id, id)` en relaciones padre-hija dentro de la base, evaluadas en `server/tests/real/test_pg_fk_empresa.ts` sobre 75 relaciones del catálogo (según commit `c61de07`).

### 4.3 Lista Declarativa Única (`server/storage/registroDatosEmpresa.ts`)

- Registra **81 entradas de tablas** clasificadas por ámbito (`compartido`, `control`, `empresa`) y política de exportación/respaldo (`exportar: true/false`), incorporando las tablas más recientes (`marcas_analisis_cuenta`, `consolidaciones_mensuales`, `planilla_*`, `subdiarios`, `licencia`, `estudio_configuracion`), además de **7 carpetas** en `REGISTRO_ARCHIVOS_EMPRESA`.

### 4.4 Matriz Real de Persistencia de los 53 Servicios (`server/services/`)

La siguiente clasificación proviene de la inspección directa del código fuente el 11/11/2026:

| Categoría de Persistencia | Cantidad | Archivos Exactos (`server/services/`) | Observación Técnica Real |
| :--- | :---: | :--- | :--- |
| **Con rama PostgreSQL (`isPostgresConnected` / `db.query` / `db.getClient`)** | **24** | `analisisCuentaService.ts`, `anexoService.ts`, `asientoService.ts`, `auditoriaChainService.ts`, `authJwtService.ts`, `compraService.ts`, `consolidacionMensualService.ts`, `cronogramaVencimientosService.ts`, `detraccionService.ts`, `librosEEFFService.ts`, `licenciaService.ts`, `liquidacionIGVService.ts`, `notaCreditoDebitoService.ts`, `pcgeService.ts`, `periodoService.ts`, `saldosService.ts`, `setupService.ts`, `sireService.ts`, `subdiarioService.ts`, `sunatJobsService.ts`, `tesoreriaService.ts`, `tipoCambioService.ts`, `usuarioEstudioService.ts`, `ventaService.ts` | Varios mantienen arreglos `*_MEMORIA` como respaldo en `development`/`test` cuando no existe PostgreSQL; en producción el servidor exige PostgreSQL, pero la coexistencia de rutas en memoria requiere auditoría continua para evitar caídas o lecturas parciales. |
| **Exclusivamente en memoria (`*_MEMORIA` / `Map` sin consultas PG)** | **18** | `activosFijosService.ts`, `auditoriaTributariaService.ts`, `backupEmpresaService.ts`, `cajaChicaService.ts`, `cierreAnualService.ts`, `conciliacionService.ts`, `conciliadorSireService.ts`, `daotService.ts`, `djRentaAnualService.ts`, `empresaDemoService.ts`, `historialGeneracionesService.ts`, `honorariosService.ts`, `importacionService.ts`, `kardexService.ts`, `planillaService.ts`, `pleExportService.ts`, `prorrataIgvService.ts`, `xmlImportService.ts` | **Brecha principal de Fase B:** ante un reinicio del servidor o en despliegue PostgreSQL puro, sus datos se pierden o no persisten en tablas reales (pese a existir tablas homónimas en las migraciones). `backupEmpresaService.ts` solo respalda/restaura arreglos en memoria actualmente. |
| **Adaptadores, validadores o helpers sin almacén de estado** | **11** | `aperturaCierreService.ts`, `archivoValidadorService.ts`, `consultaValidezCpeService.ts`, `contabilizacionService.ts`, `cryptoService.ts`, `migrationService.ts`, `redondeoUsdService.ts`, `sireLayoutService.ts`, `sunatConsultaRucService.ts`, `sunatGateway.ts`, `totpService.ts` | Lógica pura, wrappers criptográficos o conectores HTTP/SUNAT sin estado persistente propio. |

---

## 5. Interfaz, Menús y Superficie API

### 5.1 Taxonomía de Menú y Barra Superior (`src/types/menu.ts`)

La barra superior fue rediseñada en tres franjas con logotipo e isotipo oficiales embebidos (`fd9c67d`, `a2efdd7`, `docs/engineering/MARCA.md`). `MENU_DATA` organiza **13 grupos** y **89 opciones hoja** (`80` con `estado: 'activo'` y `9` con `estado: 'proximamente'`):

| Grupo (`MENU_DATA`) | Activas | Próximamente | Detalle de Opciones No Activas (`proximamente`) |
| :--- | :---: | :---: | :--- |
| `archivo` | 7 | 0 | — |
| `contabilidad` | 12 | 0 | — |
| `compras-ventas` | 3 | 0 | — |
| `facturacion` | 4 | 3 | 3 ítems de facturación electrónica en estado próximo |
| `tributos` | 7 | 0 | — |
| `planillas` | 7 | 0 | — |
| `registros-electronicos` | 6 | 0 | — |
| `tesoreria` | 10 | 1 | `Letras y pagarés` |
| `inventarios-activos` | 0 | 4 | `Kardex`, `Existencias`, `Activos fijos`, `Depreciación mensual` (en UI; servicios aún en memoria) |
| `estados-financieros` | 5 | 0 | — |
| `estudio` | 4 | 1 | `Portal del cliente` |
| `herramientas` | 12 | 0 | — |
| `ayuda` | 3 | 0 | — |
| **Total** | **80** | **9** | **89 opciones totales verificadas por `run_tests_menu_fase1.ts`** |

### 5.2 Superficie API (`server/routes/index.ts` y `server/controllers/`)

`server/routes/index.ts` monta **26 módulos de rutas** bajo `/api` respaldados por **12 controladores** (`asientoController.ts`, `backupEmpresaController.ts`, `consolidacionController.ts`, `empresaController.ts`, `importacionController.ts`, `migrationController.ts`, `operacionesController.ts`, `parametroController.ts`, `pleController.ts`, `setupController.ts`, `sireController.ts`, `tesoreriaPlanillaController.ts`). Incluye rutas dedicadas para salud (`/api/health`), configuración inicial (`/setup`), autenticación/MFA, empresas, PCGE (`/pcge`), análisis de cuentas (`/analisis-cuentas`), subdiarios (`/subdiarios`), tipos de cambio, consolidación mensual, usuarios/licencia (`/usuarios`) y respaldos por empresa (`/backups`).

---

## 6. Motor Contable, PCGE 2026 y Subdiarios Dinámicos

### 6.1 Invariantes del Motor Contable

- **Partida doble estricta:** Todo asiento validado por `asientoService` exige $\sum \text{Debe} = \sum \text{Haber}$ sin tolerancias implícitas.
- **Precisión financiera y redondeo USD (`docs/engineering/REDONDEO_USD.md`):** Aritmética decimal basada en `decimal.js` (`Half-Up`, prohibido truncamiento). Cuando una conversión multimoneda USD $\rightarrow$ PEN genera diferencia de centavos ($\Delta$) entre el total convertido y la suma de líneas individuales, `redondeoUsdService.ts` / `src/utils/redondeoUsd.ts` absorbe $\Delta$ en la línea de mayor importe absoluto para preservar el cuadre exacto.
- **Trazabilidad y control de concurrencia:** Nomenclatura de voucher `{subdiario}{mes}{correlativo}`, inmutabilidad tras contabilización con anulación mediante asiento de extorno vinculado y bloqueo optimista por número de versión (`VERSION_DESACTUALIZADA`).

### 6.2 Plan Contable General Empresarial (PCGE 2026) y Análisis de Cuentas

- Incorporado en migraciones `schema_fase13`, `schema_fase16` y `schema_fase17` junto a `pcgeService.ts`: jerarquía completa, cuentas correctoras, configuración de columnas y reglas de cierre. Verificado por `test_bloque_b_plan_contable.ts` (796 aserciones).
- **Carga de referencia (`docs/engineering/CARGA_PCGE_STAGING.md`):** Comando `npm run cargar:pcge` ingesta `Plan_Cuentas`, `Pendientes` y `Pendientes_Clasificacion` en `staging.pcge_importacion` en PostgreSQL preservando SHA-256 y valores textuales en JSONB, de forma idempotente, sin alterar automáticamente `public.plantilla_pcge` hasta aprobación contable explícita.
- **Análisis de Cuentas (`analisisCuentaService.ts`, `schema_fase15_analisis_cuentas.sql`):** Consulta movimientos por cuenta en PEN/USD, evolución mensual de 12 meses, cuentas de control, antigüedad de saldos y persistencia de marcas de revisión (`REVISADO`, `OBSERVADO`, `PENDIENTE` en `marcas_analisis_cuenta`). Verificado por `test_bloque_e_analisis_cuentas.ts` (29 aserciones).

### 6.3 Hallazgo Crítico de Auditoría: Colisión de Códigos de Subdiario (`00`–`11`)

La migración `schema_fase14_subdiarios_personalizables.sql` y `SUBDIARIOS_BASE_SISTEMA` (`server/services/subdiarioService.ts:33-46`) introdujeron el catálogo dinámico canónico de subdiarios. Sin embargo, al auditar todos los servicios y reportes se detectó una **inconsistencia activa entre el catálogo nuevo y mapas heredados**:

| Código | Catálogo Canónico (`subdiarioService.ts` / `schema_fase14`) | Mapa Heredado (`NOMBRES_SUBDIARIOS` en `reportesEngine.ts:6-18` y `librosEEFFService.ts:8-20`) | Servicios que Emiten Asientos con Ese Código (Observado) |
| :---: | :--- | :--- | :--- |
| **`00`** | Apertura | Apertura / Reapertura | `empresaDemoService.ts:148` (`00`) |
| **`01`** | Registro de Compras (RCE) | Registro de Compras | `compraService.ts:662` (`01`), `empresaDemoService.ts:250` (`01`) |
| **`02`** | Registro de Ventas (RVIE) | Registro de Ventas | `ventaService.ts:503` resuelve vía `subdiarioService`, pero sus queries en `:900, :910` filtran literal `'02'` |
| **`03`** | Cobranzas y Caja | Caja y Bancos - Ingresos y Cobranzas | `tesoreriaService.ts:334` (`INGRESO -> '03'`) |
| **`04`** | **Pagos a Proveedores** | **Planillas y Cargas Sociales (PLAME)** *(conflicto)* | `tesoreriaService.ts:334` usa `'04'` para pagos; **`empresaDemoService.ts:468` usa `'04'` para Planillas demo** |
| **`05`** | **Cuentas Corrientes y SPOT** | **Caja y Bancos - Egresos y Pagos** *(conflicto)* | `tesoreriaService.ts:334, 498` usa `'05'` para SPOT y transferencias |
| **`06`** | Recibos por Honorarios | Recibos por Honorarios (4ta Categoría) | `honorariosService.ts:151` (`06`) |
| **`07`** | **Planilla de Remuneraciones** | **Kardex y Costo de Ventas** *(conflicto)* | `planillaService.ts:1584, 1812, 2015` usa `'07'`; **PERO `kardexService.ts:261-262` y `consolidacionMensualService.ts:136-203` también emiten Costo de Ventas/Almacén en `'07'`** |
| **`08`** | **Ajustes** | **Destinos Automáticos y Diferencia de Cambio** *(conflicto)* | `activosFijosService.ts:262-263` usa `'08'` (`AJUSTE`) |
| **`09`** | Cierre del ejercicio | Asientos de Cierre Anual y Ajustes PCGE | `cierreAnualService.ts:101, 566-567` (`09`) |
| **`10`** | Diario General | Operaciones Varias y Ajustes Manuales | Operación manual |
| **`11`** | Provisiones Varias | *(ausente en `NOMBRES_SUBDIARIOS`)* | Catalogado solo en `subdiarioService.ts` |

> **Impacto para el revisor:** En reportes oficiales y vistas del Libro Diario que leen `NOMBRES_SUBDIARIOS`, un pago a proveedores (`04`) puede mostrarse rotulado como Planillas, y una planilla real (`07`) comparte el código `'07'` con los asientos generados por `kardexService.ts` y `consolidacionMensualService.ts`. Debe unificarse todo consumidor sobre `subdiarioService` y corregir los códigos heredados antes de producción.

---

## 7. Cobertura Normativa, Matriz de Asientos y Reportes

### 7.1 Matriz de Completitud de Asientos (`docs/MATRIZ_COMPLETITUD_ASIENTOS.md`)

Verificada automáticamente en cada corrida de `npm test` mediante `scripts/verificar-matriz.ts` (Suite 36), validando existencia de archivos, líneas de aserciones, pruebas negativas y cuadre matemático de resúmenes sobre **69 escenarios**:

| Módulo / Subdiario | Total Escenarios | `IMPLEMENTADO Y PROBADO EN POSTGRESQL REAL` | `PROBADO CON MOTOR EN MEMORIA` | `PARCIAL` | `NO IMPLEMENTADO` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Compras (01) | 28 | 0 | 19 | 4 | 5 |
| Ventas (02) | 11 | 0 | 11 | 0 | 0 |
| Cobranzas (03) | 6 | 0 | 6 | 0 | 0 |
| Pagos (04) | 7 | 0 | 7 | 0 | 0 |
| SPOT / Ctas. Ctes. (05) | 4 | 0 | 4 | 0 | 0 |
| Honorarios (06) | 4 | 0 | 4 | 0 | 0 |
| Planillas (07) | 5 | 0 | 5 | 0 | 0 |
| Varias / Cierre / TC | 4 | 0 | 4 | 0 | 0 |
| **Totales** | **69** | **0** | **60** | **4** | **5** |

- **Escenarios `PARCIAL`:** `ESC-C-1.03`, `ESC-C-1.07`, `ESC-C-1.08`, `ESC-C-1.11`.
- **Escenarios `NO IMPLEMENTADO`:** `ESC-C-1.05`, `ESC-C-1.09`, `ESC-C-1.10`, `ESC-C-1.12`, `ESC-C-1.17`.

### 7.2 Normativa Tributaria Verificada y Supuestos Abiertos (`docs/NORMAS_VERIFICADAS.md`)

- **Tasas de IGV con vigencia (`Ley 32219`, modificatoria de Arts. 1, 3 y 4 de la Ley 31556):** IGV reducido de **8%** para 2025 y 2026 (+ **2%** IPM = **10%** total) y de **12%** para 2027 (+ **2%** IPM = **14%** total; servicios de catering excluidos). Configurado como tabla editable de parámetros; si la fecha no coincide con la vigencia se muestra advertencia visible pero **se permite registrar**, dejando la calificación tributaria bajo criterio del operador/proveedor.
- **Compatibilidad Detracción SPOT, Retención y Percepción:** Contrastada contra R.S. 037-2002/SUNAT (Art. 3 umbral S/ 700; Art. 5 inc. b/f/h) y Ley 29173 Art. 11 (inc. a.ii / e). El sistema **bloquea en interfaz y backend la combinación simultánea Retención + Percepción**, valida detracción contra el catálogo oficial SUNAT por código de bien/servicio y muestra advertencia en combinaciones sensibles.
- **Puntos explícitos `SUPUESTO A VALIDAR` con contador:**
  1. **Prorrata del IGV (regularización en diciembre):** El Art. 23 del TUO LIGV está verificado, pero el Art. 6 num. 6 del Reglamento figura como `NO CONTRASTADA DIRECTAMENTE` en `docs/NORMAS_VERIFICADAS.md`, manteniéndose la liquidación/regularización anual de diciembre bajo etiqueta `SUPUESTO A VALIDAR`.
  2. **Método de inventario periódico:** Anotado en `server/services/consolidacionMensualService.ts:198` (`// Pendiente de validar con contador: la regla exacta del método periódico (asiento con 6111 y 20111)`).
  3. **Criterios combinados especiales** en escenarios `PARCIAL` y `NO IMPLEMENTADO` de Compras.

### 7.3 Reportes Contables y Libros Electrónicos

- El motor visual de impresión y vista previa vive en `src/services/reports/formato_estandar/formatoEstandarEngine.ts` bajo nombres contables estándar (`Registro de Compras`, `Registro de Ventas`, `Libro Diario`, `Hoja de Trabajo de 10 Columnas`, EEFF), validado sin caracteres de reemplazo (`*`) y con paginación real (`test_bloque_c_reportes.ts`, `run_tests_reportes_y_vouchers_normativos.ts`).
- `sireService.ts` ya incorpora consultas PostgreSQL; sin embargo, `pleExportService.ts` y `conciliadorSireService.ts` permanecen actualmente en memoria (`PG:False | MEM:True`).

---

## 8. Seguridad, Control de Acceso, Respaldos y Licenciamiento

### 8.1 Validación de Entorno y Secretos (`server/config/env.ts`)

- En `production`, aborta el arranque si falta `DATABASE_URL` o si cualquiera de los 5 secretos obligatorios (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `SUNAT_ENCRYPTION_KEY`, `MFA_SEED_SECRET`, `BACKUP_ENCRYPTION_KEY`) no tiene exactamente 64 caracteres hexadecimales únicos, presenta baja diversidad (< 16 bytes distintos) o coincide con `HUELLAS_HISTORICAS_SERVIDOR`. Validado por subprocesos reales en la Suite 25 (`test_produccion_sin_db.ts`, 82 aserciones).
- En `development`/`test` genera secretos efímeros de proceso y emite advertencia en consola.

### 8.2 RBAC, Auditoría y MFA

- Control de acceso por empresa activa (`empresaGuard.ts`) y rol (`auth.ts`), segregación verificada por suite HTTP (`run_tests_acceso.ts`).
- Granularidad dedicada para planillas mediante `MATRIZ_RBAC_PLANILLAS` (`server/services/planillaService.ts:510-550`: `verDatosPersonales`, `verSueldos`, `verCuentasDesencriptadas`, etc.).
- Autenticación MFA TOTP configurable (`setupService` / `authJwtService` / `totpService`) y lista blanca de campos permitidos en logs de auditoría con sanitización (`sanitizarMensaje`, `auditoriaRepository.ts`, `test_sonda_sunat.ts`).

### 8.3 Respaldo y Restauración por Empresa (`backupEmpresaService.ts`)

- Cifra archivos ZIP en memoria con **AES-256-GCM** (`IV` de 12 bytes + `AuthTag` de 16 bytes) y clave derivada vía PBKDF2 desde `BACKUP_ENCRYPTION_KEY`, adjuntando `manifest.json` con conteo de líneas y SHA-256 por archivo. Excluye explícitamente credenciales SUNAT y usuarios/roles conforme a `AGENTS.md`, restringido al rol `ADMINISTRADOR`.
- **Limitación actual crítica:** A fecha 11/11/2026, `backupEmpresaService.ts` **sigue leyendo e inyectando exclusivamente los arreglos `*_MEMORIA` (`PG:False | MEM:True`)**; la exportación/restauración real contra PostgreSQL y archivos de disco, junto a la prueba destructiva de alteración, aislamiento y persistencia tras reinicio sobre PostgreSQL real, forman parte de la Fase **B2** aún pendiente de certificación.

### 8.4 Licencias Locales (`docs/engineering/LICENCIAS.md`, `licenciaService.ts`)

- En el primer arranque crea un registro único en la tabla `licencia` (ámbito `control`, `exportar: false`) como `'EVALUACION'` con `max_usuarios = 3`, controlado bajo bloqueo transaccional (`pg_advisory_xact_lock` + `SELECT ... FOR UPDATE`).
- **Limitación explícita asumida:** El control actual es operativo/local sin firma criptográfica offline (`Ed25519`); un operador con acceso administrativo directo al motor PostgreSQL local podría modificar esa tabla hasta que se implementen las etapas comerciales futuras descritas en `LICENCIAS.md`.

---

## 9. Evidencia de Verificación Ejecutada el 11 de Noviembre de 2026

### 9.1 Compilación y Linter

- `npm run lint` (`tsc --noEmit`): **Código de salida `0`**, sin errores de tipos.
- `npm run build` (`vite build` v8.3.5): **Código de salida `0` en `15.95s`**, `2,101` módulos transformados; salida principal en `dist/index.html` (`1.52 kB`), `dist/assets/index-CeWeZGBl.css` (`105.47 kB`), `dist/assets/index-C_F132wg.js` (`2,434.40 kB`).

### 9.2 Inventario Literal de las 36 Suites Ejecutadas en `npm test`

> **Condiciones de ejecución:** `tsx server/tests/run_all_tests.ts` ejecutado el 11/11/2026 con `NODE_ENV='test'` y `DATABASE_URL=''` (motor en memoria / `pg-mem` / análisis estático / subprocesos). Total: **36 / 36 suites exitosas | 3,390 aserciones en 194.94s**.

| # | Suite | Archivo | Aserciones | Tiempo |
| :---: | :--- | :--- | :---: | :---: |
| 01 | Sesión del cliente y renovación concurrente | `src/api/session.test.ts` | 13 | 1.86s |
| 02 | Autorización HTTP por empresa y rol | `server/tests/run_tests_acceso.ts` | 29 | 17.09s |
| 03 | Configuración inicial y sesión administrativa | `server/tests/verificar_auth_setup.ts` | 54 | 13.49s |
| 04 | Fases 1 y 2: Motor Contable & Partida Doble | `server/tests/run_tests.ts` | 28 | 3.20s |
| 05 | Fase 3: Compras, Ventas, CXC/CXP & Tributos | `server/tests/run_tests_fase3.ts` | 27 | 2.19s |
| 06 | Fase 4: Tesorería, Conciliación Bancaria, 4ta & Planilla | `server/tests/run_tests_fase4.ts` | 46 | 3.19s |
| 07 | Fase 5: Libros Oficiales, Balance Comprobación & EEFF | `server/tests/run_tests_fase5.ts` | 42 | 3.78s |
| 08 | Fase 6: Integración SUNAT/SIRE, XML UBL/CDR & PLE | `server/tests/run_tests_fase6.ts` | 80 | 4.07s |
| 09 | Escaneo de secretos en el frontend | `server/tests/test_secretos_frontend.ts` | 4 | 3.54s |
| 10 | Sonda SUNAT de auditoría y respaldo | `server/tests/test_sonda_sunat.ts` | 346 | 3.88s |
| 11 | Fase 7: Seguridad, RBAC, RLS, Envelope Encryption & Auditoría | `server/tests/run_tests_fase7.ts` | 67 | 5.10s |
| 12 | Fase 7B: Navegación por Empresa, Entorno Aislado & Selector Multi-Nivel | `server/tests/run_tests_fase7b.ts` | 34 | 3.26s |
| 13 | Fase 7C-2: Reportes ESTANDAR (Hoja de Trabajo 10 Columnas & Libro Diario) | `server/tests/run_tests_fase7c2.ts` | 40 | 2.91s |
| 14 | Fase 8: Calidad, PostgreSQL, Concurrencia & Property Testing | `server/tests/run_tests_fase8.ts` | 31 | 6.62s |
| 15 | Fase 9: Automatización Tributaria Avanzada, PLAME & SIRE Cierre | `server/tests/run_tests_fase9.ts` | 43 | 2.53s |
| 16 | Fase 10: Auditoría Preventiva, DAOT 3500 & Cierre Anual PCGE | `server/tests/run_tests_fase10.ts` | 115 | 2.99s |
| 17 | Fase 11: Activos Fijos (Libro 7.1), Kardex (Libro 13.1) & Prorrata IGV | `server/tests/run_tests_fase11.ts` | 85 | 2.96s |
| 18 | Fase 13: Comportamiento & Cobertura de Servicios Críticos | `server/tests/run_tests_fase13_cobertura.ts` | 74 | 1.94s |
| 19 | Fase 13: Empresa Demo S.A.C. & Idempotencia | `server/tests/run_tests_fase13_demo.ts` | 20 | 2.85s |
| 20 | Fase 13: Backup y Restauración por Empresa ESTANDAR | `server/tests/run_tests_fase13_backup.ts` | 47 | 2.82s |
| 21 | Fase 13: Motor de Importación CSV/hoja de cálculo & Rollback | `server/tests/run_tests_fase13_importacion.ts` | 43 | 1.81s |
| 22 | Fase 1: Taxonomía de Menú Propio y Separación 1:1 de Vistas | `server/tests/run_tests_menu_fase1.ts` | 374 | 0.45s |
| 23 | Fase 4 (Tributos): PDT 621, Prorrata IGV, Renta Anual, DAOT, Cronograma y Parámetros | `server/tests/run_tests_fase4_tributos.ts` | 66 | 1.82s |
| 24 | Fase 5 (Planillas): RMV, AFP vs ONP, 5ta Proyectada, Gratificaciones/CTS, Baja Mitad de Mes y PLAME/T-Registro | `server/tests/run_tests_fase5_planillas.ts` | 199 | 3.20s |
| 25 | A3: Fallo estricto NODE_ENV=production sin DATABASE_URL y bloqueo en memoria | `server/tests/test_produccion_sin_db.ts` | 82 | 79.75s |
| 26 | Optimización Visual Normativa: Reportes Uniformes y Vouchers de Escritorio | `server/tests/run_tests_reportes_y_vouchers_normativos.ts` | 174 | 2.27s |
| 27 | Automatización de Asientos, Consolidación Mensual y Cinta de 7 Accesos | `server/tests/run_tests_automatizacion_asientos_y_cinta.ts` | 58 | 1.55s |
| 28 | Identidad de Marca, Login Ágil & Seguridad | `server/tests/test_marca_y_login_seguridad.ts` | 59 | 2.93s |
| 29 | Bloque C: Reportes Unificados, Sin Asteriscos y Paginación Real | `server/tests/test_bloque_c_reportes.ts` | 47 | 2.65s |
| 30 | Bloque B: Plan Contable General Empresarial Completo, Correctoras y Jerarquía | `server/tests/test_bloque_b_plan_contable.ts` | 796 | 1.18s |
| 31 | Bloque A: Subdiarios Personalizables y Registro por Subdiario | `server/tests/test_bloque_a_subdiarios.ts` | 30 | 1.39s |
| 32 | Bloque F: Hallazgos Puntuales de Operatividad y Resiliencia | `server/tests/test_bloque_f_hallazgos.ts` | 20 | 1.13s |
| 33 | Bloque E: Análisis de Cuentas, Auditoría, Cuentas de Control y Antigüedad de Saldos | `server/tests/test_bloque_e_analisis_cuentas.ts` | 29 | 1.14s |
| 34 | Asiento Completo, Reglas Tributarias y Subdiarios Dinámicos | `server/tests/test_asiento_completo_subdiarios.ts` | 184 | 1.92s |
| 35 | Invariancia CRLF / LF y Hashes Históricos en Migraciones | `server/tests/test_migrate_crlf_lf.ts` | 4 | 0.59s |
| 36 | Verificación de Integridad y Trazabilidad de la Matriz de Asientos | `scripts/verificar-matriz.ts` | 0 *(validador)* | 0.89s |

### 9.3 Suites Preparadas para PostgreSQL 18 Real (`server/tests/real/`)

No ejecutadas durante este corte; diseñadas para correr contra PostgreSQL 18.x local (`atlob_test`, rol no superusuario `contabilidad_app` con `NOBYPASSRLS`) o vía Docker (`docker-compose.test.yml` + `postgres:18-alpine`) y automatizadas en GitHub Actions (`.github/workflows/test-pg.yml`):

- `server/tests/real/test_infra.ts`
- `server/tests/real/test_pg_docker.ts`
- `server/tests/real/test_pg_rls_planillas.ts`
- `server/tests/real/test_pg_seguridad.ts`
- `server/tests/real/test_pg_fk_empresa.ts`
- `server/tests/real/test_pg_compra_escritorio.ts`
- `server/tests/real/postgres_test_init.sh`

---

## 10. Hallazgos Abiertos y Deriva Documental Detectada

Para que la revisión externa cuente con visibilidad completa sin puntos ciegos, se consolidan las **5 brechas reales observadas**:

1. **Persistencia pendiente en 18 servicios (`PG:False | MEM:True`) y ausencia de `npm run verify`:** Planillas, Honorarios, Kardex, Activos Fijos, Caja Chica, Conciliación Bancaria, Cierre Anual, PLE, Conciliador SIRE, DAOT, Renta Anual, Prorrata IGV, Auditoría Tributaria, Importación XML/CSV, Historial de Generaciones, Empresa Demo y Respaldos por Empresa continúan respaldados por arreglos en memoria (`*_MEMORIA`), mientras `package.json` carece aún del script `npm run verify` exigido por la Fase E del plan.
2. **Inconsistencia activa de códigos de subdiario en reportes, Kardex y demo (ver Sección 6.3):** Desalineación entre `SUBDIARIOS_BASE_SISTEMA` (`00`–`11`), `NOMBRES_SUBDIARIOS` (`reportesEngine.ts`, `librosEEFFService.ts`), `consolidacionMensualService.ts` / `kardexService.ts` (`'07'`) y `empresaDemoService.ts:468` (`'04'`).
3. **Deriva documental entre manuales internos del repositorio (`Doc-Drift`):**
   - `docs/INICIO_ESCRITORIO.md` (línea 36) indica erróneamente que *"no se ha agregado Electron, Tauri ni un instalador MSI"*, describiendo un flujo previo por navegador pese a que `desktop/` ya empaqueta Electron 45.2.3 y `electron-builder`.
   - `docs/engineering/SEGURIDAD.md` y `docs/engineering/ESCRITORIO_WINDOWS.md` citan una línea base histórica de **15 migraciones** y **78 tablas**, cuando el código actual posee **21 migraciones** y **81 entradas** en `REGISTRO_DATOS_EMPRESA`.
   - `docs/_archivo/MEMORIA_TECNICA_V2.md` refleja un corte histórico anterior a los bloques A–F, PCGE 2026 y Desktop Electron.
4. **Aplicación externa de RLS (`ETAPAS_RLS`) y falta de ejecución local de `test:pg`:** Las políticas `5.1`–`5.3` viven en `server/db/seguridadRls.ts` fuera de `runMigrations()`; el esquema de pruebas reales exige verificación explícita contra PostgreSQL 18 real y limpieza/regresión de backups en Fase B2.
5. **Escenarios pendientes y supuestos tributarios a validar:** 9 escenarios en `MATRIZ_COMPLETITUD_ASIENTOS.md` están en estado `PARCIAL` (4) o `NO IMPLEMENTADO` (5); la regularización anual de diciembre en prorrata IGV (`Art. 6 num. 6 Reglamento LIGV`) y el asiento de método periódico (`consolidacionMensualService.ts:198`) requieren validación contable formal.

---

## 11. Plan de Acción Prioritario para Certificación Externa y Producción

Seguimiento alineado con la secuencia obligatoria **A → B → B2 → C → D → E** de `PLAN_IMPLEMENTACION.md`:

| Prioridad | Acción Requerida | Entregable Verificable |
| :---: | :--- | :--- |
| **P0 (Bloqueante)** | Migrar los 18 servicios `*_MEMORIA` a PostgreSQL real (empezando por `planillaService`, `honorariosService`, `cajaChicaService`, `conciliacionService`, `cierreAnualService`, `pleExportService` y `backupEmpresaService`), eliminando lecturas silenciosas en memoria en producción. | `0` servicios operativos críticos con `PG:False` y pruebas sobre PostgreSQL real. |
| **P0 (Bloqueante)** | Implementar respaldo/restauración real por empresa sobre tablas PostgreSQL y carpetas registradas (`REGISTRO_DATOS_EMPRESA` + `REGISTRO_ARCHIVOS_EMPRESA`), cumpliendo ida y vuelta, rechazo de ZIP alterado, aislamiento entre empresas y persistencia tras reinicio (**Fase B2**). | Prueba real reproducible pasando en `atlob_test`. |
| **P0 (Bloqueante)** | Unificar numeración de subdiarios (`00`–`11`) eliminando el mapa heredado `NOMBRES_SUBDIARIOS` (`reportesEngine.ts`, `librosEEFFService.ts`) y reasignando `'04'`/`'07'` en `empresaDemoService.ts`, `kardexService.ts` y `consolidacionMensualService.ts` vía `subdiarioService`. | Consistencia 100% entre UI, asientos y Libro Diario. |
| **P1 (Alto)** | Crear e incorporar `npm run verify` en `package.json` unificando `lint`, `build`, `test`, `desktop:verify` (cuando aplique paquete) y pruebas `server/tests/real/*` contra PostgreSQL 18 real (**Fase E**). | Exit code `0` en entorno PostgreSQL limpio, fallando si falta DB real. |
| **P1 (Alto)** | Completar validación contable de los `SUPUESTO A VALIDAR` (prorrata diciembre, método periódico `6111/20111`) y cerrar los 9 escenarios `PARCIAL`/`NO IMPLEMENTADO` en `MATRIZ_COMPLETITUD_ASIENTOS.md`. | Matriz `69 / 69` cubiertos y validados en PostgreSQL real. |
| **P2 (Mantenimiento)** | Sincronizar documentos internos desactualizados (`docs/INICIO_ESCRITORIO.md`, `SEGURIDAD.md`, `ESCRITORIO_WINDOWS.md` hacia 21 migraciones / 81 tablas / Electron actual) y habilitar vistas hoy marcadas `'proximamente'` (`Kardex`, `Existencias`, `Activos fijos`, `Depreciación mensual`, `Letras y pagarés`). | Cero deriva documental y `9/9` ítems restantes completados. |

---

## 12. Índice de Documentación del Repositorio

| Documento | Propósito | Vigencia al 11/11/2026 |
| :--- | :--- | :--- |
| [`SISTEMA_ATLOB_ERP.md`](SISTEMA_ATLOB_ERP.md) | Informe técnico integral vigente para revisión externa (este documento). | **Vigente (11/11/2026)** |
| [`docs/engineering/PLAN_IMPLEMENTACION.md`](docs/engineering/PLAN_IMPLEMENTACION.md) | Plan maestro Arquitectura B y fases A → E. | Vigente (falta `npm run verify` en `package.json`) |
| [`docs/MATRIZ_COMPLETITUD_ASIENTOS.md`](docs/MATRIZ_COMPLETITUD_ASIENTOS.md) | Matriz de 69 escenarios contables y pruebas ligadas. | Vigente (validada por Suite 36) |
| [`docs/NORMAS_VERIFICADAS.md`](docs/NORMAS_VERIFICADAS.md) | Fuentes oficiales Ley 32219, R.S. 037-2002, Ley 29173 y TUO LIGV. | Vigente |
| [`docs/CATALOGO_CUENTAS_ASIENTOS.md`](docs/CATALOGO_CUENTAS_ASIENTOS.md) / [`CATALOGO_CUENTAS_PARA_CONTADOR.md`](docs/CATALOGO_CUENTAS_PARA_CONTADOR.md) | Catálogo de cuentas usadas en asientos y guía para revisión contable. | Vigente |
| [`docs/engineering/MARCA.md`](docs/engineering/MARCA.md) | Identidad visual oficial ATLOB ERP y hashes SHA-256 de recursos. | Vigente |
| [`docs/engineering/LICENCIAS.md`](docs/engineering/LICENCIAS.md) | Modelo de licencia local (`EVALUACION` max 3 usuarios) y evolución Ed25519. | Vigente |
| [`docs/engineering/CARGA_PCGE_STAGING.md`](docs/engineering/CARGA_PCGE_STAGING.md) | Carga verificable del PCGE 2026 en `staging.pcge_importacion`. | Vigente |
| [`docs/engineering/REDONDEO_USD.md`](docs/engineering/REDONDEO_USD.md) | Política oficial de conversión y ajuste de centavos multimoneda. | Vigente |
| [`docs/BACKUP_BASE_DATOS.md`](docs/BACKUP_BASE_DATOS.md) | Política de respaldo físico PostgreSQL (`pg_dump` / WAL). | Vigente (infraestructura) |
| [`docs/engineering/SEGURIDAD.md`](docs/engineering/SEGURIDAD.md) y [`ESCRITORIO_WINDOWS.md`](docs/engineering/ESCRITORIO_WINDOWS.md) | Arquitectura de seguridad y escritorio Windows. | **Parcialmente desactualizados** (citan 15 migraciones / 78 tablas frente a 21 / 81 actuales) |
| [`docs/INICIO_ESCRITORIO.md`](docs/INICIO_ESCRITORIO.md) | Guía histórica del lanzador `Iniciar-Escritorio.bat`. | **Obsoleto respecto a Electron** (niega existencia de Electron ya implementado) |
| [`docs/_archivo/MEMORIA_TECNICA_V2.md`](docs/_archivo/MEMORIA_TECNICA_V2.md) | Memoria técnica anterior de arquitectura. | **Histórico / desactualizado** |
