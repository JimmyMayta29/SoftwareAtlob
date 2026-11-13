# Catálogo de Hallazgos y Plan Priorizado de Mejoras — ATLOB ERP

**Fecha de auditoría:** 12 de noviembre de 2026 (`HEAD f0aa29d`)  
**Secuencia obligatoria de ejecución (según `AGENTS.md` y [`PLAN_IMPLEMENTACION.md`](../engineering/PLAN_IMPLEMENTACION.md)):** **`A → B → B2 → C → D → E`**  
*(Ninguna fase posterior debe darse por certificada sin cerrar las compuertas previas sobre PostgreSQL 18 real.)*

---

## 1. Hallazgos Bloqueantes (`P0`)

### `H-01` | `P0` | Fase `C` — Regresión de compilación TypeScript (`npm run lint` exit `1`)
- **Evidencia:** `npm run lint` (`tsc --noEmit`) falla con `2` errores `TS2322` en `src/components/views/HonorariosView.tsx:426` y `src/components/views/SireConciliadorView.tsx:853`; `src/components/common/SelectorCuentaContable.tsx:6-18` no define `label?: string`.
- **Impacto:** Bloquea integración continua y empaquetado estricto; `release/*.exe` actuales fueron compilados antes de `f0aa29d`.
- **Remediación:** Incorporar `label?: string` opcional (y renderizado accesible `<label>`) en `SelectorCuentaContableProps` o trasladar la etiqueta al contenedor externo de ambas vistas.
- **Verificación:** `npm run lint` con salida `0` y recompilación completa de `dist/` y paquete desktop.

### `H-02` | `P0` | Fase `B` — Creación de empresa rota en PostgreSQL real (`SQLSTATE 23514`)
- **Evidencia:** `npx tsx server/tests/real/test_pg_compra_escritorio.ts` falla en `:56` con `23514 subdiarios_tipo_check`; `server/db/schema.sql:189-191` permite `('APERTURA','COMPRAS','VENTAS','COBRANZAS','PAGOS','BANCOS','HONORARIOS','PLANILLA','DESTINO','CIERRE')`, mientras `server/services/subdiarioService.ts:10-14` inserta `'CAJA'`, `'BANCO'`, `'DIARIO'`, `'PROVISIONES'`, `'AJUSTES'`.
- **Impacto:** Imposibilidad real de registrar empresas nuevas o inicializar catálogos contables sobre PostgreSQL 18 limpio.
- **Remediación:** Nueva migración SQL aditiva (manteniendo intactos hashes históricos CRLF/LF en `migration-files.ts`) que actualice el `CHECK` de `subdiarios.tipo` alineado 1:1 con `TipoOperacionSubdiario` y normalice filas existentes si las hubiera.
- **Verificación:** `test_pg_compra_escritorio.ts` con exit `0` creando empresa, subdiarios `00..11`, compra y asiento en `atlob_test`.

### `H-03` | `P0` | Fase `A / B` — `41` tablas sin RLS y `75` FK compuestas no aplicadas al migrar
- **Evidencia:** Consulta `pg_class` en `atlob_test` (`23` tablas con `RLS+FORCE` permanentes; `58` con `relrowsecurity=false`, de las cuales `41` pertenecen a `ETAPAS_RLS` `5.1..5.3` en `server/db/seguridadRls.ts:50`). `test:pg` ejecuta `ETAPAS_RLS` y `fk_empresa_01..07.sql` solo bajo `ROLLBACK`. Además genera deriva documental en `SEGURIDAD.md:40` (`64 tablas`).
- **Impacto:** Aislamiento multiempresa a nivel de motor PostgreSQL desactivado en `41` tablas operativas (`periodos`, `plan_cuentas`, `subdiarios`, `planilla_lineas`, `recibos_honorarios`, `credenciales_sunat`, `sire_*`, `ple_exportaciones`, etc.), dejando la contención multi-tenant dependiendo solo del middleware Express.
- **Remediación:** Promover `ETAPAS_RLS` y `fk_empresa_01..07.sql` a migraciones idempotentes reales invocadas por `runMigrations()`, verificando compatibilidad con arquitectura B o pool sin bypass.
- **Verificación:** Inspección `pg_class` con las `64` tablas (`23 + 41`) activas con `relrowsecurity=true` y `relforcerowsecurity=true`, más actualización exacta de `SEGURIDAD.md`.

### `H-04` | `P0` | Fase `A` — Brechas IDOR y validación de membresía/roles en APIs
- **Evidencia:**
  1. `server/routes/index.ts:89` monta `router.use('/analisis-cuentas', analisisCuentaRoutes)` sin `requireEmpresaMembership()`; `analisisCuentaRoutes.ts:17,47,69,90,110,130,149-155` acepta `req.query.empresaId`/`req.body.empresaId` arbitrario sin pertenencia y mezcla roles inexistentes (`'ADMIN_ESTUDIO'`, `'CONTADOR'`, `'AUDITOR'`).
  2. `server/routes/pleRoutes.ts:20` + `server/controllers/pleController.ts:115-124` (`GET /ple-exportaciones/:id`) comprueba `req.empresaId` del JWT pero nunca valida `exportacion.empresaId === req.empresaId`.
  3. `server/routes/empresaRoutes.ts:30-34` (`PUT /:id/metodo-inventario`) omite `requireEmpresaMembership()` local (dependiendo del orden del prefijo en `index.ts:85`).
  4. `server/routes/activosKardexRoutes.ts:46-47` confía en `req.body.userId`; `cronogramaVencimientosRoutes.ts:36,44-45` recurre al UUID fallback `'00000000-0000-0000-0000-000000000001'` / `'usr-admin-01'` y roles mezclados (`'ADMIN_ESTUDIO'`, `'ADMIN'`).
- **Impacto:** Un usuario autenticado en Empresa A puede leer/alterar análisis de cuentas o marcas de auditoría de Empresa B (`IDOR`), consultar exportaciones PLE ajenas o suplantar actor/empresa en cronograma y activos.
- **Remediación:** Retirar el montaje paralelo `/analisis-cuentas` sin membresía (exigir `/empresas/:empresaId/analisis-cuentas`), verificar `exportacion.empresaId === req.empresaId` en `pleController` y `sunat-jobs`, aplicar `requireEmpresaMembership` explícito en todas las rutas de empresa, unificar enum `RolEstudio` y tomar siempre `req.user.id` del token verificado.
- **Verificación:** Pruebas HTTP negativas multiempresa (`usuario A -> empresa B -> HTTP 403`) sobre todos esos endpoints contra PG real.

### `H-05` | `P0` | Fase `B` — `18` servicios solo en `*_MEMORIA` + brecha oculta PDT 621 en RAM
- **Evidencia:** `server/config/persistencia.ts` declara `18` servicios exclusivamente en memoria (`planillaService`, `honorariosService`, `cajaChicaService`, `conciliacionService`, `conciliadorSireService`, `pleExportService`, `cierreAnualService`, `prorrataIgvService`, `daotService`, `djRentaAnualService`, `auditoriaTributariaService`, `kardexService`, `activosFijosService`, `importacionService`, `backupEmpresaService`, `empresaDemoService`, `xmlImportService`, `historialGeneracionesService`). Además, **`liquidacionIGVService.ts:144-145, 260-318, 410, 595-618`** guarda/lee `DECLARACIONES_PDT621_MEMORIA` y `RETENCIONES_PERCEPCIONES_IGV_MEMORIA` en RAM **sin figurar en `MODULOS_SOLO_MEMORIA`**, por lo que `ATLOB_BLOQUEAR_MEMORIA=1` no bloquea `/api/tributos/pdt621`.
- **Impacto:** Pérdida total de datos laborales, honorarios, caja chica, conciliaciones, PLE, cierre anual, impuestos y PDT 621 al reiniciar el proceso Node/Electron.
- **Remediación:** Migrar los 18 servicios + `liquidacionIGVService` a SQL sobre PostgreSQL siguiendo Fase B (`PLAN_IMPLEMENTACION.md`), comenzando por `planillaService`, `honorariosService`, `liquidacionIGVService`, `cajaChicaService`, `conciliacionService`, `pleExportService` y `cierreAnualService`, sin fallback silencioso a arrays `*_MEMORIA` en `production`. Entretanto, incorporar PDT 621 a `MODULOS_SOLO_MEMORIA`.
- **Verificación:** Ciclo crear → guardar → reiniciar servidor → consultar desde PostgreSQL real (`atlob_test`).

### `H-06` | `P0` | Fase `B2` — Arquitectura B (`base por empresa`) y respaldo real sin implementar (Hallazgo 9)
- **Evidencia:** `backupEmpresaService.ts` usa `BACKUPS_MEMORIA`, genera/restaura ZIP en `Buffer` únicamente con colecciones `*_MEMORIA`. No existe base PostgreSQL separada por empresa ni `server/storage/archivosEmpresa.ts` (`docs/engineering/PLAN_IMPLEMENTACION.md:37`).
- **Impacto:** Incumplimiento total de portabilidad, aislamiento físico y recuperación ante desastres exigidos en B2.1–B2.5.
- **Remediación:** Implementar gestor de base por empresa + capa `archivosEmpresa.ts`, respaldo ZIP cifrado en flujo continuo (streaming) desde cursores SQL de todas las tablas de `REGISTRO_DATOS_EMPRESA` + carpetas `REGISTRO_ARCHIVOS_EMPRESA` (excluyendo credenciales SUNAT y usuarios/roles), vista previa no destructiva y restauración transaccional.
- **Verificación:** Cuatro pruebas obligatorias en PostgreSQL real (`AGENTS.md`): ida y vuelta completa, rechazo de ZIP alterado, aislamiento respecto a otra empresa y persistencia tras reinicio.

### `H-07` | `P0` | Fase `B` — Colisiones activas de subdiarios (`04`, `05`, `07`, `08`)
- **Evidencia:** `subdiarioService.ts:34-45` asigna `'04'` a Pagos a Proveedores, `'05'` a Ctas. Ctes./SPOT, `'07'` a Planilla y `'08'` a Ajustes. En paralelo, `empresaDemoService.ts:468` usa `'04'` para Planillas; `cajaChicaService.ts:136` y `tesoreriaService.ts:498` usan `'05'`; `kardexService.ts:262`, `consolidacionMensualService.ts` y `planillaService.ts:1584` emiten en `'07'`; `activosFijosService.ts:263` usa `'08'`; y `librosEEFFService.ts:8-20` conserva el mapa legado `NOMBRES_SUBDIARIOS`.
- **Impacto:** Mezcla de asientos de planilla con costo de ventas/kardex y rotulado incorrecto en Libro Diario y reportes oficiales.
- **Remediación:** Eliminar `NOMBRES_SUBDIARIOS`, resolver subdiarios por `tipoOperacion` vía `subdiarioService` y asignar subdiarios diferenciados (`11` o códigos específicos de Kardex/Caja Chica/Depreciación).
- **Verificación:** Suite de integración comparando asientos emitidos por cada módulo vs etiqueta mostrada en `LibroDiarioView` / reportes estándar.

### `H-08` | `P0` | Fase `E` — Falta `npm run verify`, falla `test:infra` y `release/` obsoleto
- **Evidencia:** `package.json` carece de `"verify"`; `npm run test:infra` falla (`42501` en `test_infra.ts:55` y discrepancia con log de `server.ts:89`); `release/*.exe` datan de `13:16–13:20`, previos al commit `f0aa29d` (`13:24:26`).
- **Remediación:** Crear script `"verify"` en `package.json` ejecutando `lint`, `build`, pruebas en memoria, suite completa `server/tests/real/*` sobre PostgreSQL real (fallando si falta DB), y `desktop:verify` cuando exista paquete actualizado; reparar `test_infra.ts` / permisos de base de prueba.
- **Verificación:** `npm run verify` con código `0` tras reconstruir paquete Windows.

---

## 2. Hallazgos Altos (`P1`)

### `H-09` | `P1` | Fase `C` — `7` vistas enrutadas invocan endpoints inexistentes (`404`) con falsa apariencia de éxito
- **Evidencia:** `CierreAnualView.tsx:66-76` (`/api/operaciones/cierre/anual-elemento8`), `CierreMensualView.tsx:33-51` (`/api/operaciones/periodos/cerrar|reabrir`), `DiferenciaCambioView.tsx:79` (`/api/operaciones/cierre/diferencia-cambio`), `EmitirComprobanteView.tsx:88` (`/api/sunat/cpe/emitir`), `ConsultaComprobantesView.tsx:46-75` (`/api/sunat/cpe/validar`), `LibrosElectronicosView.tsx:47-61` (`/api/sunat/ple/generar`) y `SimuladorFiscalizacionView.tsx:59-64` (`/api/tributario/auditoria-preventiva`).
- **Remediación:** Conectar cada vista a su cliente/hook oficial (`useTributarioAnual`, `usePle`, `periodos` en `/empresas/:id/periodos`) o implementar los endpoints reales faltantes (Emisión CPE / Diferencia de cambio), prohibiendo toasts de éxito o fallbacks cuando la API falla.
- **Verificación:** Pruebas de contrato UI→API verificando código HTTP `200`/`201` y reflejo en DB real.

### `H-10` | `P1` | Fase `C` — Regresión funcional en `CuentasPorCobrarView` y `CuentasPorPagarView` (`f0aa29d`)
- **Evidencia:** `CuentasPorCobrarView.tsx:69-130` y `CuentasPorPagarView.tsx:69-125` invocan `analisisCuentasApi.obtenerMovimientos` de un solo mes en vez de consultar cartera histórica (`saldosService` / `cuentas_por_cobrar` / `cuentas_por_pagar`), caen en `CARTERA_FALLBACK`/`OBLIGACIONES_FALLBACK` ante error, y registrar cobro/pago muta únicamente el estado local React.
- **Remediación:** Crear endpoints dedicados `/empresas/:empresaId/cartera/cxc` y `/cxp` respaldados por `cuentas_por_cobrar`/`cuentas_por_pagar` y `aplicaciones_*`, eliminando arrays `*_FALLBACK` y conectando el cobro/pago con `tesoreriaService` + `asientoService`.
- **Verificación:** Registrar compra/venta al crédito en PG real, verla en CxC/CxP de períodos siguientes, cobrar/pagar y verificar cancelación de saldo y asiento de tesorería.

### `H-11` | `P1` | Fase `C` — Vistas vacías en modo conectado y `ConfigEmpresaModal` no persistente
- **Evidencia:** `src/App.tsx:168-173` inicializa `asientos: [], compras: [], ventas: []` en producción, dejando vacías `LibroMayorView`, `HojaTrabajo10ColumnasView`, `LiquidacionTributariaView` y `ConsolidarMesView`. `App.tsx:837-850` guarda `ConfigEmpresaModal` solo en `setEmpresasLista`. `DashboardView.tsx:54,89` hardcodea período `'2026-09'` y botones toast-only.
- **Remediación:** Hacer que libros, consolidación, hoja de trabajo y liquidación consuman sus hooks/API (`/empresas/:id/reportes/*`, `/liquidacion`, `/consolidacion`), implementar `PUT /api/empresas/:id` para `ConfigEmpresaModal` y vincular `DashboardView` al período activo real.
- **Verificación:** Ingresar asiento/compra, recargar navegador y comprobar datos en Mayor, Hoja de Trabajo, PDT 621 y Dashboard.

### `H-12` | `P1` | Fase `C` — `20+` vistas estáticas/hardcoded y fallback silencioso en `tributarioAnualApi.ts`
- **Evidencia:** `BalanceGeneralView.tsx:19-28` (`PARTIDAS_BG` hardcoded `S/ 275,010.50`), `EstadoResultadosView`, `FlujoEfectivoView`, `DaotView`, `DeclaracionRentaAnualView`, `ProrrataIgvView`, `ParametrosTributariosView`, `CronogramaVencimientosView`, `ClientesProveedoresView`, `CentrosCostoView`, `NotasCreditoDebitoView`, `DetraccionesRetencionesView`, `ConciliacionBancariaView`, `CajaChica*`, etc. (`impApi=False | fetch=False`). Además `src/api/tributarioAnualApi.ts:124-245` devuelve objetos mock ante error de red.
- **Remediación:** Conectar progresivamente las vistas operativas a sus APIs (`anexos`, `parametros`, `cronograma`, `librosEEFFService`, `notas-credito-debito`, `conciliaciones`, `caja-chica`, `daot`, `renta-anual`, `prorrata`) y eliminar todos los `fallback` en `tributarioAnualApi.ts` para mostrar estado de error real en UI.
- **Verificación:** Cero datos ficticios en compilado de producción; estados financieros calculados desde saldos PCGE reales.

### `H-13` | `P1` | Fase `C / B` — `SelectorCuentaContable` desvinculado del PCGE en PostgreSQL
- **Evidencia:** `src/components/common/SelectorCuentaContable.tsx:3` importa `PLAN_CONTABLE_PCGE` desde `src/data/pcgeAccounts.ts`, sin consultar `pcgeApi` / `plan_cuentas`.
- **Remediación:** Cargar el plan de cuentas de la empresa vía `useQuery` (`pcgeApi`) cacheado con React Query, permitiendo buscar tanto subcuentas estándar como cuentas creadas por la empresa.
- **Verificación:** Crear cuenta `63991` en `PlanCuentasView` y seleccionarla inmediatamente en `RegistroComprasView` y `HonorariosView`.

### `H-14` | `P1` | Fase `B` — `migrationService.ts` es un stub de auditoría sin persistencia
- **Evidencia:** `server/services/migrationService.ts:18-121` valida payload CSV pero solo inserta registro en `auditoriaRepository` sin crear empresas, comprobantes ni asientos en SQL.
- **Remediación:** Implementar carga transaccional real contra repositorios SQL / `asientoService` con reporte de rollback ante falla o retirar ruta `/api/migration` hasta su implementación real.

### `H-15` | `P1` | Fase `D` — `sunatGateway.ts` simulado y degradación silenciosa a mock en `RealSunatGateway`
- **Evidencia:** `server/services/sunatGateway.ts:68-349, 538-541, 566-569` devuelve `[SIMULADO]` por defecto y ante excepciones dentro de `RealSunatGateway.descargarPropuestaCompras/Ventas` captura el error y devuelve facturas ficticias de `MockSunatGateway`.
- **Remediación:** Eliminar todo fallback a `MockSunatGateway` dentro de `RealSunatGateway` (propagar error SUNAT real al job/UI) y restringir `MockSunatGateway` únicamente a `NODE_ENV=test` o ambiente explícitamente etiquetado en UI.

### `H-16` | `P1` | Fase `A` — Desfase en `inicializar-escritorio.ps1`, CORS y siembra de 14 períodos
- **Evidencia:**
  1. `scripts/inicializar-escritorio.ps1:75-82` escribe `.env` con `NODE_ENV=production` omitiendo `MFA_SEED_SECRET` y `BACKUP_ENCRYPTION_KEY`, fallando contra `server/config/env.ts`.
  2. `server.ts:46` aplica `app.use(cors())` sin lista de orígenes en despliegue web/servidor.
  3. `periodoService.ts:39-100` compensa al vuelo períodos `00` y `13` no creados al sembrar empresa (`01..12` en `empresaRepository`).
- **Remediación:** Generar los `5` secretos hex de 64 caracteres en `inicializar-escritorio.ps1`, restringir `CORS` vía `ALLOWED_ORIGIN` en `server.ts` y sembrar `00..13` desde la creación de empresa (`empresaRepository`).

### `H-17` | `P1` | Fase `B / C` — Brechas tributarias/normativas abiertas (`DAOT 75 UIT`, `MATRIZ`, `Ley 32219`)
- **Evidencia:** `daotService.ts:168-175` no verifica obligatoriedad anual de `> 75 UIT`; `MATRIZ_COMPLETITUD_ASIENTOS.md` mantiene `4` escenarios `PARCIAL` y `5` `NO IMPLEMENTADO` en Compras (`0/69` en PG real); `prorrataIgvService` (dic.) y `consolidacionMensualService:198` siguen con `SUPUESTO A VALIDAR`; `PARAMETROS_IN_MEMORY` no incluye vigencia parametrizada de tasa IGV reducida Ley 32219 (`8%`/`12%`).
- **Remediación:** Añadir umbral `75 UIT` configurable en `daotService`, tasa `TASA_IGV_REDUCIDA_LEY32219` en `parametros_tributarios`, obtener validación contable formal de los dos supuestos y completar los 9 escenarios en PostgreSQL real.

---

## 3. Hallazgos Medios y Bajos (`P2` / `P3`)

| ID | Prioridad | Fase | Evidencia y Detalle | Acción Recomendada |
| :-: | :-: | :-: | :--- | :--- |
| `H-18` | `P2` | `A` | `src/api/session.ts:1-26` guarda `accessToken` y `refreshToken` en `localStorage` (expuesto ante XSS). `BannerPersistenciaTemporal.tsx:13-16` se oculta en desarrollo. | Migrar tokens de sesión web a cookies `HttpOnly; SameSite=Strict` (manteniendo protección CSRF) o cifrado en memoria; mostrar banner de estado temporal también en `development` con badge distinguible. |
| `H-19` | `P2` | `C` | **`9` vistas huérfanas** en `src/components/views/` no importadas por `App.tsx`, incluidas `ActivosKardexView` (`880` líneas) y `ProcesosCierreView` (`934` líneas) que sí consumen APIs mientras sus pares en menú están rotas (`404`) o `'proximamente'`. | Consolidar y re-enrutar `ActivosKardexView`, `ProcesosCierreView` y `ReglasContabilizacionView`, y mover duplicados muertos a `_cuarentena/` o eliminarlos previa aprobación. |
| `H-20` | `P2` | `C` | Catálogos duplicados (`ParametrosTributariosView.tsx:30-45`, `pcgeAccounts.ts`), `reportesApi.ts` y `useEmpresas.ts` sin uso real en `src/`, bundle único `index-CxirrKtH.js` de `2,458.51 kB`. | Centralizar catálogos en backend vía React Query y aplicar `React.lazy` / `manualChunks` por módulo en `vite.config.ts`. |
| `H-21` | `P2` | `D` | `licenciaService.ts` usa tabla local editable por DBA; `9` ítems de menú continúan en `'proximamente'` (`guias-remision`, `resumen-bajas`, `series-certificado`, `letras-pagares`, `kardex`, `existencias`, `activos-fijos`, `depreciacion-mensual`, `portal-cliente`). | Incorporar verificación offline `Ed25519` cuando corresponda la fase comercial y habilitar o retirar del menú activo los módulos aún no listos. |
| `H-22` | `P3` | `UX` | Fragmentación UX para asistentes contables (3 vistas estáticas de Caja Chica existiendo `CajaChicaView`, doble digitación XML/Compras, uso heterogéneo de hex `#...` vs clases Tailwind `slate-*` en vistas como `HonorariosView.tsx:356` vs `BalanceGeneralView.tsx:41`, falta de atributos `aria-*` sistemáticos en grillas). | Unificar design tokens, integrar importación XML→Registro Compras directa, habilitar navegación por teclado celda-a-celda tipo hoja contable en `TablaDensa` y consolidar vistas redundantes. |

