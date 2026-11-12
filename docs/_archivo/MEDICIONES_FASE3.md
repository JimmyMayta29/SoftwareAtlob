# Medición Base — Fase 3 de Documentación (`D0`)

- **Rama de trabajo:** `chore/limpieza-y-mejoras` (sobre commit `379a6ec`, sin push ni merge)
- **Fecha de medición:** 2026-11-11
- **Propósito:** Capturar directamente desde código fuente, configuraciones y ejecución real las métricas vigentes antes de actualizar la documentación en `D1`–`D9`.

---

## 1. Migraciones y Registro Declarativo de Datos

**Comando ejecutado (`npx tsx -`):**
```ts
import { MIGRATION_FILES } from './server/db/migration-files.ts';
import { REGISTRO_DATOS_EMPRESA, REGISTRO_ARCHIVOS_EMPRESA } from './server/storage/registroDatosEmpresa.ts';
console.log(MIGRATION_FILES.length, REGISTRO_DATOS_EMPRESA.length, REGISTRO_ARCHIVOS_EMPRESA.length);
```

- **Migraciones registradas en `MIGRATION_FILES` (`server/db/migration-files.ts`):** **21**
- **Entradas en `REGISTRO_DATOS_EMPRESA` (`server/storage/registroDatosEmpresa.ts`):** **81**
- **Entradas en `REGISTRO_ARCHIVOS_EMPRESA` (`server/storage/registroDatosEmpresa.ts`):** **7**

---

## 2. Conteo de Archivos por Capa (tras cuarentena de Fase 2)

**Comando ejecutado (`npx tsx -` recorriendo recursivamente cada directorio):**
```ts
fs.readdirSync(dir, { withFileTypes: true }) // filtrado por extensión cuando aplica
```

| Capa / Directorio | Conteo total | Desglose por tipo / observación |
| :--- | :---: | :--- |
| **`src/`** | **169** | **159** archivos `.ts` / `.tsx` + `9` imágenes en `src/assets/brand/` + `1` `src/index.css` |
| `src/components/views/` | **78** | Archivos `.tsx` (antes `84`; `6` trasladadas a `_cuarentena/vistas/` en `cccd58b`) |
| `src/components/modals/` | **12** | Archivos `.tsx` |
| `src/hooks/` | **9** | Archivos `.ts` |
| `src/api/` | **20** | **19** clientes API `.ts` + `1` prueba (`src/api/session.test.ts`) |
| **`server/`** | **191** | **161** archivos `.ts` + `28` `.sql` en `server/db/` + `1` `server/data/pcge_base_v2.json` + `1` `server/tests/real/postgres_test_init.sh` |
| `server/services/` | **53** | Archivos `.ts` |
| `server/routes/` | **27** | Archivos `.ts` (`server/routes/index.ts` + `26` módulos importados; `29` llamadas `router.use(` incluyendo middlewares y doble montaje de `analisisCuentaRoutes`) |
| `server/controllers/` | **12** | Archivos `.ts` |
| `server/repositories/` | **3** | Archivos `.ts` |
| `server/middlewares/` | **3** | Archivos `.ts` |
| `server/db/` | **35** | `7` `.ts` + `28` `.sql` (`21` migraciones + `7` `fk_empresa_01..07.sql`) |
| `server/tests/` | **47** | `46` `.ts` (`40` en raíz de `server/tests/` + `6` en `server/tests/real/`) + `1` `.sh` (`postgres_test_init.sh`), más `1` prueba frontend (`src/api/session.test.ts`) |
| **`desktop/`** | **18** | `12` archivos en raíz + `2` en `desktop/assets/` + `4` en `desktop/build/` *(excluye `desktop/generated/`)* |
| **`scripts/`** | **3** | `descargar-normas.ts`, `inicializar-escritorio.ps1`, `verificar-matriz.ts` |
| **`_cuarentena/`** | **16** | `11` archivos movidos en Fase 2 + `5` archivos `README.md` de registro |

---

## 3. `package.json`: Scripts y Versiones

**Comando ejecutado (lectura directa de `package.json` y `package-lock.json`):**

- **Total de scripts en `package.json`:** **25** (retirado `test:all` en `d691878`):
  `dev`, `start`, `desktop:dev`, `dist:win`, `desktop:verify`, `build`, `preview`, `clean`, `lint`, `test`, `test:fase2`, `test:fase3`, `test:fase4`, `test:fase5`, `test:fase6`, `test:secretos-frontend`, `test:sonda-sunat`, `test:fase7`, `test:fase8`, `test:fase9`, `test:pg`, `test:pg:docker`, `cargar:pcge`, `test:coverage`, `test:infra`.
- **Dependencias en `package.json`:** `22` en `dependencies`, `17` en `devDependencies`.

| Paquete | Rango declarado (`package.json`) | Versión instalada (`package-lock.json`) |
| :--- | :---: | :---: |
| `electron` | `45.2.3` | `45.2.3` |
| `electron-builder` | `26.18.0` | `26.18.0` |
| `vite` | `^8.3.0` | `8.3.5` |
| `typescript` | `^7.0.2` | `7.0.2` |
| `react` | `^19.0.1` | `19.3.1` |

---

## 4. Estructura del Menú (`MENU_DATA`)

**Comando ejecutado (`npx tsx -` usando `obtenerItemsHojaMenu(MENU_DATA)` de `src/types/menu.ts`):**

- **Grupos totales:** **13**
- **Hojas totales:** **89** (`80` con `estado: 'activo'`, `9` con `estado: 'proximamente'`)
  - De las `80` hojas activas, `4` abren modales (`SearchEmpresasModal`, `ConfigEmpresaModal`, `CalculadoraContableModal`, `AcercaDeModal`) y `76` apuntan a vistas/acciones de la interfaz.

| Grupo | `id` | Activas | Próximamente | Hojas en `proximamente` |
| :--- | :--- | :---: | :---: | :--- |
| Archivo | `archivo` | 7 | 0 | — |
| Contabilidad | `contabilidad` | 12 | 0 | — |
| Compras y Ventas | `compras-ventas` | 3 | 0 | — |
| Facturación | `facturacion` | 4 | 3 | `guias-remision`, `resumen-bajas`, `series-certificado` |
| Tributos | `tributos` | 7 | 0 | — |
| Planillas | `planillas` | 7 | 0 | — |
| Registros Electrónicos | `registros-electronicos` | 6 | 0 | — |
| Tesorería | `tesoreria` | 10 | 1 | `letras-pagares` |
| Inventarios y Activos | `inventarios-activos` | 0 | 4 | `kardex`, `existencias`, `activos-fijos`, `depreciacion-mensual` |
| Estados Financieros | `estados-financieros` | 5 | 0 | — |
| Estudio | `estudio` | 4 | 1 | `portal-cliente` |
| Herramientas | `herramientas` | 12 | 0 | — |
| Ayuda | `ayuda` | 3 | 0 | — |
| **Total** | **13 grupos** | **80** | **9** | **89 hojas totales** |

---

## 5. Servicios con y sin Rama PostgreSQL (`server/services/`)

**Comando ejecutado (inspección de imports, llamadas `db.query`/`db.getClient`/`db.withEmpresaTransaction`/`pool.query`, SQL literal y declaraciones `*_MEMORIA` / `new Map<` en los `53` `.ts` de `server/services/`):**

- **Total de servicios:** **53**
  - **Con rama SQL PostgreSQL directa (`24 / 53`):**
    `analisisCuentaService.ts`, `anexoService.ts`, `asientoService.ts`, `auditoriaChainService.ts`, `authJwtService.ts`, `compraService.ts`, `consolidacionMensualService.ts`, `cronogramaVencimientosService.ts`, `detraccionService.ts`, `librosEEFFService.ts`, `licenciaService.ts`, `liquidacionIGVService.ts`, `notaCreditoDebitoService.ts`, `pcgeService.ts`, `periodoService.ts`, `saldosService.ts`, `setupService.ts`, `sireService.ts`, `subdiarioService.ts`, `sunatJobsService.ts`, `tesoreriaService.ts`, `tipoCambioService.ts`, `usuarioEstudioService.ts`, `ventaService.ts`.
  - **Sin rama SQL PostgreSQL propia — con estado en memoria (`18 / 53`):**
    `activosFijosService.ts`, `auditoriaTributariaService.ts`, `backupEmpresaService.ts`, `cajaChicaService.ts`, `cierreAnualService.ts`, `conciliacionService.ts`, `conciliadorSireService.ts`, `daotService.ts`, `djRentaAnualService.ts`, `empresaDemoService.ts`, `historialGeneracionesService.ts`, `honorariosService.ts`, `importacionService.ts`, `kardexService.ts`, `planillaService.ts`, `pleExportService.ts`, `prorrataIgvService.ts`, `xmlImportService.ts`.
    *(Nota técnica: `8` de estos leen o registran parámetros/empresas/auditoría mediante `empresaRepository`, `parametroRepository` o `auditoriaRepository`, pero sus datos operativos de negocio viven en arreglos `*_MEMORIA`.)*
  - **Sin rama SQL PostgreSQL ni almacén de estado propio (`11 / 53`):**
    `aperturaCierreService.ts`, `archivoValidadorService.ts`, `consultaValidezCpeService.ts`, `contabilizacionService.ts`, `cryptoService.ts`, `migrationService.ts`, `redondeoUsdService.ts`, `sireLayoutService.ts`, `sunatConsultaRucService.ts`, `sunatGateway.ts`, `totpService.ts`.

---

## 6. Resultado de `npm test`, `lint` y `build` sobre `379a6ec`

- **`npm run lint` (`tsc --noEmit`):** **0 errores** (`exit 0`).
- **`npm run build` (`vite build`):** **`2,101` módulos transformados** en `4.60s`; chunk principal `dist/assets/index-C_F132wg.js` (`2,434.40 kB` | `528.10 kB` gzip).
- **`npm test` (`tsx server/tests/run_all_tests.ts`, `NODE_ENV=test`, `DATABASE_URL=''`):** **`36/36` suites completadas con éxito | `3,390` aserciones totales** en `93.33s`.

---

## 7. Comparativa Git `a0f7da4..e402bef`

**Comando ejecutado:**
```powershell
git log --oneline a0f7da4..e402bef --stat
```

**Salida literal observada:**
```text
e402bef docs: actualizar informe tecnico integral para revision externa
 SISTEMA_ATLOB_ERP.md | 1133 +++++++++++++-------------------------------------
 1 file changed, 289 insertions(+), 844 deletions(-)
```

**Explicación de la diferencia:**
- `a0f7da4` (`feat(subdiarios): digitalizacion de honorarios, planilla y plantillas de vouchers en asientos contables`) fue el último commit con cambios de código/producto que evaluó `SISTEMA_ATLOB_ERP.md`.
- Entre `a0f7da4` y el tag base `pre-limpieza` (`e402bef`) existe **un único commit (`e402bef`)**, el cual **solo modificó `SISTEMA_ATLOB_ERP.md`** (`289+ / 844-`), sin alterar código fuente, migraciones ni pruebas.
- Posteriormente, en la rama `chore/limpieza-y-mejoras` (`e402bef..379a6ec`), los bloques de Fase 2 trasladaron `6` vistas + `1` servicio frontend (`166 → 159` archivos `.ts`/`.tsx` en `src/`), `3` catálogos de servidor (`164 → 161` `.ts` en `server/`), `1` HTML estático (`public/`) y `1` doc histórico (`docs/_archivo/`), depurando también `package.json` (`26 → 25` scripts).

