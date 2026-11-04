# AUDITORÍA TÉCNICA INTEGRAL DEL SISTEMA: ATLOB CONSULTORES ERP

**Documento Maestro de Arquitectura, Estado de Implementación, Cumplimiento Normativo SUNAT y Deuda Técnica**

- **Sistema:** Atlob Consultores ERP (Gestión Contable & Tributaria Multiempresa)
- **Autoría & Liderazgo de Ingeniería:** Jimmy Mayta (`jimmymayta29@gmail.com`)
- **Estudio Contable Destino:** Atlob Consultores S.A.C.
- **Fecha de Auditoría:** 04 de Noviembre de 2026
- **Rol del Auditor:** Arquitecto de Software & Auditor Técnico Senior
- **Propósito:** Documentar con trazabilidad directa al código real el estado verificado de cada componente, tabla, función, prueba automatizada y supuesto normativo pendiente del sistema, sin marcar fases como cerradas mientras existan validaciones externas o de persistencia pendientes.

---

## 1. RESUMEN EJECUTIVO

### 1.1. Propósito y Alcance del Producto

**Atlob Consultores ERP** es una plataforma contable, laboral y tributaria de escritorio web para estudios contables peruanos, diseñada bajo aislamiento multiempresa para operar conforme al marco normativo vigente en el Perú:

- **Plan Contable General Empresarial (PCGE)** modificado 2019 (Resolución CNC N° 002-2019-EF/30).
- **Sistema Integrado de Registros Electrónicos (SIRE)** conforme a la R.S. N° 000112-2021/SUNAT y modificatorias (RCE compras y RVIE ventas) en submódulo independiente.
- **Programa de Libros Electrónicos (PLE 5.2)** conforme a la R.S. N° 286-2009/SUNAT y modificatorias en submódulo independiente.
- **Declaraciones Juradas y Obligaciones Tributarias (Formulario Virtual / PDT 621 IGV-Renta, Prorrata IGV, Renta Anual, DAOT, Cronograma)**.
- **Gestión de Planillas, Beneficios Sociales, Exportador PDT PLAME 0601 y T-Registro**.
- **Auditoría Preventiva, Estados Financieros y Cierre Contable** con asientos automáticos de Elemento 8 y Elemento 9.

### 1.2. Stack Tecnológico Real (Inspección de `package.json` y Runtime)

| Capa | Tecnología | Versión Real | Propósito en el Repositorio |
| --- | --- | --- | --- |
| **Runtime** | Node.js | `>= 22.12.0` | Motor de ejecución del servidor backend y scripts de verificación |
| **Backend Framework** | Express | `^4.21.2` | Servidor HTTP RESTful montado en `server/` con middlewares de autenticación y RBAC |
| **Frontend Framework** | React | `^19.0.1` | Renderizado SPA con Hooks, contextos operativos y vistas 1:1 |
| **Lenguaje** | TypeScript | `^7.0.2` | Tipado estático estricto verificado con `tsc --noEmit` (`npm run lint`) |
| **Bundler / Dev Server** | Vite | `^8.3.0` | Empaquetador de producción y servidor de desarrollo integrado en `server.ts` |
| **Motor de Base de Datos** | PostgreSQL / `pg` | `^8.23.1` | Driver nativo con pool de conexiones, transacciones ACID, RLS y migraciones SQL |
| **Emulador SQL de Pruebas** | `pg-mem` | `^3.0.14` | Emulación parcial de PostgreSQL en memoria usada puntualmente en `postgresTestHarness.ts` |
| **Cálculo Numérico** | `decimal.js` | `^10.6.0` | Aritmética decimal exacta (`Money`) para eliminar errores de coma flotante binaria |
| **Esquemas & Validación** | Zod | `^4.6.5` | Validación estructural de contratos de entrada en endpoints y formularios |
| **Autenticación** | `jsonwebtoken` & `bcryptjs` | `^9.0.3` / `^3.0.3` | Emisión de Access/Refresh tokens y hash de contraseñas |
| **Generación de Reportes** | `jspdf` & `jspdf-autotable` | `^4.2.1` / `^5.0.8` | Motor vectorial de documentos PDF en formato estándar (`estandar`) y corporativo (`actual`) |
| **Procesamiento de Archivos** | `adm-zip` & `fast-xml-parser` | `^0.6.1` / `^5.11.2` | Empaquetado ZIP de respaldos/declaraciones y lectura segura de XML UBL 2.1 |
| **Estilos e Iconografía** | Tailwind CSS & `lucide-react` | `^4.3.3` / `^0.546.0` | Estilizado declarativo de alta densidad e iconografía vectorial |

---

### 1.3. Matriz de Resumen por Módulo (Deduplicada y Verificada contra Código)

*Etiquetas aplicadas: `[COMPLETO]`, `[EN VERIFICACIÓN]`, `[PARCIAL]`, `[PENDIENTE]`.*

| Módulo / Dominio | Estado Real | % Avance Real | Nivel de Riesgo | Justificación Técnica Verificada |
| --- | :---: | :---: | :---: | --- |
| **Núcleo Contable (PCGE & Asientos)** | `[COMPLETO]` | 95% | **Bajo** | Partida doble validada en servicio (`Money`) y en PostgreSQL mediante el trigger diferido `trg_asiento_partida_doble` (`fn_validar_partida_doble()`), correlativos atómicos, extornos e inmutabilidad de contabilizados. |
| **Compras & Ventas (RCE / RVIE)** | `[COMPLETO]` | 92% | **Bajo** | Imputación contable automatizada, validación Módulo 11 de RUC, destinos de compra (`1`, `2`, `3`, `4`), notas de crédito, detracciones SPOT y retenciones/percepciones. |
| **SIRE SUNAT (Conciliador & Propuesta)** | `[EN VERIFICACIÓN]` | 90% | **Medio** | Submódulo independiente (`/api/sire`): cliente OAuth2 y flujo de tickets (`01`, `02`, `03`), bloqueo estricto de propuestas `[SIMULADO]`, cruce por CAR de 27 dígitos con `Money` (`decimal.js`), asientos de ajuste (`6591`/`7591` vs `4212`/`1212`) y layouts RCE/RVIE (Anexos 8, 11, 2/3, 4/5). **Pendiente para cierre de Fase 6:** migrar lecturas/escrituras de `*_MEMORIA` a tablas SQL persistentes y homologar contra API real de SUNAT. |
| **Libros Electrónicos (PLE 5.2)** | `[EN VERIFICACIÓN]` | 90% | **Medio** | Submódulo independiente (`/api/ple`): generación de libros `050100` (21 campos), `060100` (16), `080100` (42), `080200` (36), `140100` (35), `010100` (15) y `010200` (15) con `Money`, nomenclatura de 33 caracteres (`PEN`, `USD`, sin movimiento `I=0` en pos. 31), CRLF, UTF-8 sin BOM, validador TXT e historial SHA-256. **Pendiente para cierre de Fase 6:** lectura directa de tablas SQL PostgreSQL en lugar de `*_MEMORIA` y validación en aplicativo PLE 5.2 de escritorio. |
| **Liquidación PDT 621 & Tributos** | `[COMPLETO]` | 95% | **Bajo** | Fórmulas con `decimal.js` en `liquidacionIGVService.ts` y `LiquidacionTributariaView.tsx`, casillas verificadas (`100`, `102`, `131`, `107`, `108`, `110`, `111`, `178`, `140`, `145`, `184`, `171`, `179`, `188`, `301`, `315`, `302`, `303`, `304`), Prorrata IGV, Renta Anual, DAOT y Cronograma. |
| **Planilla, Beneficios, PLAME & T-Registro** | `[EN VERIFICACIÓN]` | 92% | **Medio** | 6 Casos Dorados verificados con `assert.strictEqual`, RMV por vigencia (`1,130` / `1,230`), AFP `1.37%` con topes RMA 2026 Q1-Q4, Boletas PDF estándar, PLAME oficial (`.jor` 14, `.snl` 15, `.rem` 18, `.4ta` 20, `.toc` 26; `.des` eliminado) y T-Registro (`RP_{RUC}.zip`: `.ide` 04, `.tra` 05, `.per` 11, `.est` 17). Pendiente persistencia SQL directa en `planillaService.ts` y prueba en PDT PLAME / PVS real. |
| **Tesorería, Bancos & Caja Chica** | `[PARCIAL]` | 75% | **Medio** | Movimientos multimoneda, conciliación bancaria asistida con extractos CSV, transferencia entre cuentas y fondo fijo de caja chica funcionales; sin conexión API bancaria directa. |
| **Créditos & Cobranza (CxC / CxP)** | `[COMPLETO]` | 88% | **Bajo** | Estados de cuenta por anexo, amortizaciones parciales/múltiples, anticipos, aplicación de notas de crédito y antigüedad de saldos por tramos. |
| **Facturación Electrónica CPE** | `[PARCIAL]` | 60% | **Medio** | Parser y validador XML UBL 2.1 con defensa anti-XXE (`xmlImportService.ts`) y lectura de CDR operativos. Emisión real diferida por diseño al Facturador Atlob externo independiente. |
| **Inventarios & Activos Fijos** | `[PARCIAL]` | 50% | **Medio** | Servicios base `kardexService.ts` y `activosFijosService.ts` creados; vistas del menú principal marcadas como `próximamente` hasta iniciar formalmente la Fase 7. |
| **Estados Financieros & Cierres** | `[COMPLETO]` | 88% | **Bajo** | Hoja de Trabajo de 10 columnas, Estado de Situación Financiera, Estado de Resultados (Naturaleza y Función), Flujo de Efectivo, diferencia de cambio y cierre anual Elemento 8. |
| **Gestión del Estudio** | `[COMPLETO]` | 85% | **Bajo** | Cartera multiempresa, indicadores de control de calidad, alertas de vencimientos y biblioteca de plantillas. |
| **Seguridad, RBAC & Respaldos** | `[COMPLETO]` | 95% | **Bajo** | AES-256-GCM con KEK en entorno (`SUNAT_ENCRYPTION_KEY`), MFA TOTP RFC 6238, respaldo ZIP por empresa excluyendo secretos SUNAT y usuarios (`78` entradas en `REGISTRO_DATOS_EMPRESA`) y bloqueo de arranque sin BD en `NODE_ENV=production`. |

---

## 2. ARQUITECTURA DEL SISTEMA

### 2.1. Estructura de Directorios Verificada contra el Repositorio

```text
/
├── server.ts                                 # Entry point híbrido: API Express + Vite (dev) o estáticos dist/ (prod)
├── package.json                              # Scripts de verificación (lint, test, test:fase6, test:pg, test:infra, build)
├── vite.config.ts                            # Configuración Vite 8 con React 19 y Tailwind CSS v4
├── index.html                                # Punto de entrada HTML de Atlob Consultores ERP
├── AGENTS.md                                 # Reglas obligatorias de arquitectura, neutralidad de nombres y persistencia
├── SISTEMA_ATLOB_ERP.md                      # Documento maestro de auditoría técnica del sistema
│
├── server/                                   # BACKEND NODE.JS / EXPRESS
│   ├── config/
│   │   ├── database.ts                       # Pool PostgreSQL (pg.Pool), transacciones y bloqueo de fallback en prod
│   │   └── env.ts                            # Validación de entorno (PORT, DATABASE_URL, JWT_SECRET, SUNAT_ENCRYPTION_KEY)
│   ├── db/                                   # 15 archivos de esquema, triggers y semillas SQL
│   │   ├── migrate.ts                        # Ejecutor secuencial de migraciones DDL contra PostgreSQL
│   │   ├── schema.sql                        # Esquema base de control y tablas iniciales
│   │   ├── schema_a_preflight.sql / compat   # Preflight y compatibilidad de migración multiempresa
│   │   ├── schema_fase2.sql a fase7.sql      # Motor contable, operaciones, tesorería, EEFF, SIRE/PLE y seguridad
│   │   ├── schema_fase8_tributos.sql         # Tablas de PDT 621, Prorrata IGV, Renta Anual, DAOT y Cronograma
│   │   ├── schema_fase9_planillas.sql        # Tablas de trabajadores, planillas, beneficios y T-Registro con RLS
│   │   ├── triggers_fase2.sql                # Trigger diferido trg_asiento_partida_doble e inmutabilidad contable
│   │   └── seed.ts / seed_catalogos.ts       # Semillas y catálogos normativos SUNAT
│   ├── middlewares/                          # 3 middlewares HTTP
│   │   ├── auth.ts                           # Verificación de JWT Bearer y sesión activa
│   │   ├── empresaGuard.ts                   # Control de pertenencia a la empresa activa y matriz RBAC
│   │   └── validate.ts                       # Validación de esquemas de entrada con Zod
│   ├── repositories/                         # 3 repositorios centrales
│   │   ├── empresaRepository.ts              # Acceso persistente a empresas y validación de aislamiento
│   │   ├── parametroRepository.ts            # Parámetros laborales/tributarios con vigencias desde-hasta
│   │   └── auditoriaRepository.ts            # Bitácora inmutable de eventos de auditoría
│   ├── controllers/                          # 11 controladores REST (pleController, sireController, asientoController, etc.)
│   ├── routes/                               # 21 archivos de rutas montados bajo /api en routes/index.ts
│   │   ├── index.ts                          # Enrutador raíz /api y endpoint /api/health
│   │   ├── authRoutes.ts                     # Login, refresh, logout y enrolamiento/verificación MFA TOTP
│   │   ├── empresaRoutes.ts                  # Gestión de empresas de la cartera
│   │   ├── asientoRoutes.ts                  # Vouchers, contabilización y extornos
│   │   ├── operacionesRoutes.ts              # Compras, ventas, CxC y CxP
│   │   ├── sireRoutes.ts                     # Submódulo independiente SIRE (/api/sire)
│   │   ├── pleRoutes.ts                      # Submódulo independiente PLE 5.2 (/api/ple)
│   │   ├── liquidacionIgvRoutes.ts           # Declaración mensual PDT 621 (/api/tributos/pdt621)
│   │   ├── prorrataIgvRoutes.ts              # Prorrata de crédito fiscal IGV
│   │   ├── djRentaAnualRoutes.ts             # Papeles de trabajo Renta Anual 3ra Categoría
│   │   ├── daotRoutes.ts                     # Operaciones con terceros DAOT
│   │   ├── cronogramaVencimientosRoutes.ts   # Cronograma SUNAT por último dígito de RUC
│   │   ├── parametroRoutes.ts                # Administración de parámetros normativos
│   │   ├── tesoreriaPlanillaRoutes.ts        # Tesorería, honorarios 4ta, planillas, PLAME y T-Registro
│   │   ├── backupEmpresaRoutes.ts            # Exportación y restauración de respaldos ZIP cifrados
│   │   └── importacionRoutes.ts              # Importación masiva CSV con neutralización de fórmulas y rollback
│   ├── services/                             # 45 servicios de dominio (sin duplicados en subcarpetas)
│   │   ├── asientoService.ts                 # Ciclo de vida de asientos, correlativos y partida doble con Money
│   │   ├── compraService.ts / ventaService.ts# Registros de compras y ventas y generación automática de asientos
│   │   ├── sunatGateway.ts                   # Adaptadores OAuth2 REST (real y MockSunatGateway rotulado SIMULADO)
│   │   ├── sireService.ts                    # Conexiones cifradas SUNAT, tickets asíncronos y propuestas SIRE
│   │   ├── conciliadorSireService.ts         # Cruce por CAR de 27 dígitos con Money y asientos de ajuste guiados
│   │   ├── sireLayoutService.ts              # Layouts oficiales TXT/ZIP de reemplazo y ajustes RCE/RVIE
│   │   ├── pleExportService.ts               # Generador oficial PLE 5.2 con Money y nomenclatura de 33 caracteres
│   │   ├── archivoValidadorService.ts        # Lector y validador sintáctico TXT PLE/SIRE por línea y columna
│   │   ├── historialGeneracionesService.ts   # Registro por período con hash SHA-256 de 64 caracteres
│   │   ├── xmlImportService.ts               # Parser XML UBL 2.1 con bloqueo anti-XXE (DOCTYPE / ENTITY)
│   │   ├── sunatJobsService.ts               # Cola asíncrona de trabajos con reintentos y backoff exponencial
│   │   ├── liquidacionIGVService.ts          # Motor de casillas PDT 621, arrastres y rectificatorias
│   │   ├── planillaService.ts                # Nómina mensual, 5ta categoría, gratificaciones, CTS, LBS, PLAME y T-Registro
│   │   ├── cryptoService.ts                  # AES-256-GCM (v1 directo y v2 Envelope Encryption por empresa)
│   │   ├── totpService.ts                    # Generación y verificación TOTP RFC 6238
│   │   ├── backupEmpresaService.ts           # Empaquetado NDJSON + ZIP cifrado AES-256-GCM y restauración atómica
│   │   └── importacionService.ts             # Parser CSV coma/punto y coma, Módulo 11, apertura y rollback
│   ├── storage/
│   │   └── registroDatosEmpresa.ts           # Lista declarativa de 78 entradas de tablas y política de exportación
│   └── tests/                                # 26 archivos en server/tests/ + 2 en server/tests/real/ (+ session.test.ts)
│       ├── run_all_tests.ts                  # Orquestador de las 23 suites automatizadas (91.66s en Node.js)
│       ├── run_tests_fase6.ts                # Suite Fase 6: 80 aserciones de SIRE y PLE 5.2
│       ├── run_tests_fase5_planillas.ts      # Suite Planillas: 6 Casos Dorados, PLAME, T-Registro y Boletas PDF
│       ├── run_tests_fase4_tributos.ts       # Suite Tributos: PDT 621 (casillas 102/171/179/188/303), Prorrata y DAOT
│       ├── postgresTestHarness.ts            # Harness pg-mem para pruebas SQL unitarias de esquema
│       └── real/
│           ├── test_pg_rls_planillas.ts      # Prueba PostgreSQL 15+ real: RLS NOBYPASSRLS + trigger partida doble
│           └── test_infra.ts                 # Prueba de infraestructura PostgreSQL real y migraciones
│
└── src/                                      # FRONTEND REACT 19 SPA
    ├── App.tsx                               # Contenedor raíz con TopBar, área de trabajo 1:1 y barra de estado
    ├── main.tsx                              # Punto de montaje React y proveedor React Query
    ├── api/                                  # 15 módulos cliente HTTP (client.ts, sireApi.ts, pleApi.ts, session.test.ts)
    ├── hooks/                                # 9 hooks de datos (useSire.ts, usePle.ts, useAsientos.ts, etc.)
    ├── components/
    │   ├── desktop/TopBar.tsx                # Barra superior data-driven (13 grupos MENU_DATA) y barra de herramientas
    │   ├── modals/                           # Ventanas modales operativas (NuevaEmpresa, Backup, Importación CSV, etc.)
    │   └── views/                            # Vistas exclusivas 1:1 (Vouchers, SireConciliador, ExportarPlame, etc.)
    ├── context/                              # AppContext, EmpresaPeriodoContext, ReportStyleContext y ToastContext
    ├── data/                                 # pcgeAccounts.ts (incluye 6591 y 7591), empresasClientes.ts y maestros.ts
    ├── services/
    │   ├── accountingEngine.ts               # Motor auxiliar de previsualización contable en cliente
    │   ├── pdfExportService.ts               # Exportador PDF de estilo actual
    │   └── reports/formato_estandar/
    │       └── formatoEstandarEngine.ts      # Motor monocromo de reportes en formato estándar
    └── types/                                # menu.ts (MENU_DATA) e index.ts (modelos de dominio)
```

---

### 2.2. Diagrama de Arquitectura y Flujo de Datos

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                  FRONTEND: CONSOLA DE ESCRITORIO REACT 19                    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ TopBar: "Atlob Consultores ERP" | Menú 13 Grupos | Barra Herramientas  │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      │ 1 opción activa = 1 vista exclusiva   │
│  ┌───────────────────────────────────▼────────────────────────────────────┐  │
│  │ Contextos: EmpresaPeriodoContext | ReportStyleContext | ToastContext   │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      │ Cliente HTTP + Renovación Bearer JWT  │
│  ┌───────────────────────────────────▼────────────────────────────────────┐  │
│  │ Vistas: VouchersView, SireConciliadorView, LiquidacionTributariaView…  │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
└──────────────────────────────────────┼───────────────────────────────────────┘
                                       │ REST /api/*
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    BACKEND: SERVIDOR NODE.JS / EXPRESS                       │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Middlewares (server/middlewares/ + authRoutes):                        │  │
│  │ - auth.ts (JWT Access 15m) | empresaGuard.ts (RBAC por empresa)        │  │
│  │ - validate.ts (Zod)        | totpService.ts (MFA TOTP RFC 6238)        │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      │                                       │
│  ┌───────────────────────────────────▼────────────────────────────────────┐  │
│  │ Servicios de Dominio (45 servicios con aritmética Money decimal.js):   │  │
│  │ - asientoService, compraService, ventaService, liquidacionIGVService   │  │
│  │ - sireService, conciliadorSireService, pleExportService                │  │
│  │ - planillaService, backupEmpresaService, importacionService            │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
└──────────────────────────────────────┼───────────────────────────────────────┘
                                       │ Pool transaccional pg.Pool
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     CAPA DE ALMACENAMIENTO Y AISLAMIENTO                     │
│                                                                              │
│  ┌──────────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │ TABLAS DE CONTROL DEL ESTUDIO        │  │ DATOS POR EMPRESA (RLS / B)  │  │
│  │ - tenants, usuarios_estudio, roles   │  │ - asientos, asiento_detalle  │  │
│  │ - permisos, membresias               │  │ - comprobantes_compra/venta  │  │
│  │ - empresas (metadatos de cartera)    │  │ - declaraciones_pdt621       │  │
│  │   [Excluidos de respaldos .zip]      │  │ - trabajadores, planillas    │  │
│  └──────────────────────────────────────┘  │ - sunat_conexiones [Cifrado  │  │
│                                            │   AES-256-GCM; NO respaldado]│  │
│                                            └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### 2.3. Persistencia de Datos, Fallback en Memoria y Comportamiento en Producción

1. **Bloqueo Estricto en Producción (`NODE_ENV=production`):**
   - Verificado en `server/config/env.ts`, `server/config/database.ts` y probado automáticamente en `server/tests/test_produccion_sin_db.ts` (Suite 23): cuando `NODE_ENV === 'production'`, `IN_MEMORY_FALLBACK` está **deshabilitado**. Si `DATABASE_URL` falta o PostgreSQL no responde, `initializeDatabase()` y `server.ts` abortan inmediatamente con código de salida `1` (`DATABASE_URL_REQUERIDA` / `DATABASE_NO_DISPONIBLE`).
2. **Modo Desarrollo y Suites Rápidas (`NODE_ENV=development` o `NODE_ENV=test` sin `DATABASE_URL`):**
   - El proceso activa arreglos transaccionales en memoria (`ASIENTOS_MEMORIA`, `COMPRAS_MEMORIA`, `VENTAS_MEMORIA`, etc.) para desarrollo local y pruebas unitarias deterministas.
3. **Limitación Actual Detectada en Auditoría (Brecha de Persistencia SQL):**
   - Mientras `empresaRepository.ts`, `asientoService.ts`, `compraService.ts` y `ventaService.ts` cuentan con ramas SQL `db.isPostgresConnected()`, los servicios de Fase 5/6 (`pleExportService.ts`, `conciliadorSireService.ts`, `sireService.ts`, `historialGeneracionesService.ts` y `planillaService.ts`) aún operan directamente contra las estructuras `*_MEMORIA`. Conforme a las reglas de `AGENTS.md`, esta brecha impide declarar cerrada la Fase 6 hasta completar las consultas SQL persistentes sobre PostgreSQL real.
4. **Almacenamiento en el Navegador (`localStorage`):**
   - El cliente web solo guarda tokens de sesión y preferencias visuales; limpiar el navegador cierra la sesión local sin afectar los datos del servidor.

---

### 2.4. Control de Acceso y Roles (RBAC)

Definido en `server/services/authJwtService.ts`, `server/middlewares/empresaGuard.ts` y `src/context/EmpresaPeriodoContext.tsx`:

1. **`ADMINISTRADOR` / `ADMIN_ESTUDIO`:** Control total del estudio, alta/baja de empresas, gestión de parámetros normativos, apertura/reapertura de períodos y generación/restauración de respaldos ZIP.
2. **`CONTADOR_SENIOR` / `CONTADOR`:** Contabilización y extorno de asientos, conciliación bancaria y SIRE, preliquidación de declaraciones tributarias, cálculo de planillas y cierres mensuales.
3. **`ASISTENTE_CONTABLE` / `ASISTENTE`:** Registro de borradores de asientos, comprobantes de compra/venta y rendiciones de caja chica; sin permisos de cierre de período ni restauración de respaldos.
4. **`AUDITOR_REVISOR` / `AUDITOR`:** Acceso exclusivo de solo lectura para consulta de libros, estados financieros, papeles de trabajo y auditoría; bloqueado con `403` / `PERMISO_DENEGADO` ante cualquier mutación o preliquidación.

---

## 3. MODELO DE DATOS Y REGLAS DE INTEGRIDAD

### 3.1. Entidades Principales del Esquema PostgreSQL

Definidas en `server/db/schema.sql`, `server/db/schema_fase2.sql` a `schema_fase9_planillas.sql` y registradas en `server/storage/registroDatosEmpresa.ts` (`78` entradas declarativas):

```sql
-- Cabecera de Asiento Contable (server/db/schema_fase2.sql)
CREATE TABLE IF NOT EXISTS asientos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  periodo_id UUID NOT NULL REFERENCES periodos(id),
  subdiario_id UUID NOT NULL REFERENCES subdiarios(id),
  numero VARCHAR(20), -- NULL mientras estado = 'BORRADOR'; asignado atómicamente al contabilizar
  fecha DATE NOT NULL,
  glosa VARCHAR(500) NOT NULL,
  moneda CHAR(3) NOT NULL DEFAULT 'PEN',
  tipo_cambio NUMERIC(10,6) NOT NULL DEFAULT 1.000000,
  estado VARCHAR(20) NOT NULL DEFAULT 'BORRADOR'
    CHECK (estado IN ('BORRADOR', 'CONTABILIZADO', 'ANULADO')),
  origen VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
  origen_id UUID,
  asiento_extorno_id UUID REFERENCES asientos(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES usuarios_estudio(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(empresa_id, periodo_id, subdiario_id, numero)
);

-- Detalle de Líneas del Asiento (server/db/schema_fase2.sql)
CREATE TABLE IF NOT EXISTS asiento_detalle (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asiento_id UUID NOT NULL REFERENCES asientos(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  linea INTEGER NOT NULL,
  cuenta_id UUID NOT NULL REFERENCES plan_cuentas(id),
  anexo_id UUID REFERENCES anexos(id),
  centro_costo_id UUID REFERENCES centros_costo(id),
  debe NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (debe >= 0),
  haber NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (haber >= 0),
  debe_me NUMERIC(15,2) DEFAULT 0.00,
  haber_me NUMERIC(15,2) DEFAULT 0.00,
  glosa_linea VARCHAR(300),
  CONSTRAINT chk_debe_haber_excluyente CHECK (
    (debe > 0 AND haber = 0) OR (haber > 0 AND debe = 0)
  )
);
```

### 3.2. Reglas de Integridad en Base de Datos y Servicio

- **Trigger Diferido de Partida Doble (`trg_asiento_partida_doble`):** Definido en `server/db/triggers_fase2.sql:85-122` como `CREATE CONSTRAINT TRIGGER trg_asiento_partida_doble AFTER INSERT OR UPDATE ON asientos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_validar_partida_doble()`. Al ejecutarse `COMMIT`, verifica que todo asiento en estado `CONTABILIZADO` tenga al menos 2 líneas y cumpla `SUM(debe) = SUM(haber) > 0`; de lo contrario aborta la transacción con `RAISE EXCEPTION 'ASIENTO_DESCUADRADO: ...'`. En la capa de servicio (`asientoService.ts`), la validación idéntica se ejecuta con `Money` (`decimal.js`). *(Nota de auditoría: se corrigió el nombre inexistente `asiento_cuadrado_chk` que figuraba en versiones previas del documento).*
- **Exclusión Debe/Haber por Línea (`chk_debe_haber_excluyente`):** Impide que una misma línea de asiento tenga simultáneamente importes en `debe` y `haber` o ambos en cero.
- **Inmutabilidad de Asientos Contabilizados (`trg_inmutabilidad_asiento` / `trg_inmutabilidad_detalle`):** Impide `DELETE` o alteración directa de importes sobre asientos `CONTABILIZADO` o `ANULADO`; cualquier corrección exige generar un asiento de extorno vinculado (`asiento_extorno_id`).
- **Bloqueo de Período Cerrado:** `periodoService.ts` y `triggers_fase2.sql` rechazan altas o modificaciones contables cuando `periodos.estado = 'CERRADO'`.
- **Validación Módulo 11 de RUC:** `setupService.ts` e `importacionService.ts` aplican los factores oficiales `[5, 4, 3, 2, 7, 6, 5, 4, 3, 2]` para validar el dígito verificador de RUCs de 11 dígitos.

---

## 4. INVENTARIO DE MÓDULOS DEL MENÚ SUPERIOR (13 GRUPOS `MENU_DATA`)

Verificado automáticamente por `server/tests/run_tests_menu_fase1.ts` (`86` opciones hoja, `77` activas con vistas 1:1 exclusivas y `9` marcadas honestamente como `proximamente`):

### GRUPO 1: ARCHIVO (`id: 'archivo'`)
- **1.1. Nueva empresa** (`ModalNuevaEmpresaBlanco.tsx` | `[COMPLETO]`): Alta con validación Módulo 11 restringida a `ADMINISTRADOR`.
- **1.2. Abrir empresa… `[Ctrl+K]`** (`SearchEmpresasModal.tsx` | `[COMPLETO]`): Selector multiempresa con cambio de contexto auditado.
- **1.3. Período de trabajo** (`PeriodosView.tsx` | `[COMPLETO]`): Cierre mensual y reapertura autorizada.
- **1.4. Datos de la empresa** (`ConfigEmpresaModal.tsx` | `[COMPLETO]`): Régimen tributario, coeficiente de renta y entorno SUNAT.
- **1.5. Importar datos (CSV)** (`ModalImportacionCsv.tsx` | `server/services/importacionService.ts` | `[COMPLETO]`): Plantillas CSV, neutralización anti-fórmulas (`=`, `+`, `-`, `@`), cuadre de apertura y rollback por lote.
- **1.6. Cerrar sesión / Salir** (`[COMPLETO]`): Revocación de refresh token y limpieza de sesión.

### GRUPO 2: CONTABILIDAD (`id: 'contabilidad'`)
- **2.1. Asientos `[F2]`** (`VouchersView.tsx` | `asientoService.ts` | `[COMPLETO]`): Borradores, contabilización con correlativo atómico y extornos.
- **2.2. Plan de cuentas** (`PlanCuentasView.tsx` | `pcgeAccounts.ts` | `[COMPLETO]`): Catálogo PCGE con amarres automáticos Elemento 9 / 79 y cuentas de ajuste `6591` y `7591`.
- **2.3. Centros de costo** (`CentrosCostoView.tsx` | `[COMPLETO]`): Distribución analítica hacia cuentas `921`, `941` y `951`.
- **2.4. Libros › Diario / Mayor / Caja y bancos** (`LibroDiarioView.tsx`, `LibroMayorView.tsx`, `CajaBancosView.tsx` | `[COMPLETO]`): Vistas independientes con exportación PDF en formato estándar y hoja de cálculo.
- **2.5. Ajustes y cierres › Diferencia de cambio / Cierre mensual / Cierre anual** (`DiferenciaCambioView.tsx`, `CierreMensualView.tsx`, `CierreAnualView.tsx` | `[COMPLETO]`).

### GRUPO 3: COMPRAS Y VENTAS (`id: 'compras-ventas'`)
- **3.1. Registro de compras** (`RegistroComprasView.tsx` | `compraService.ts` | `[COMPLETO]`): Clasificación por destino IGV (`1` gravado exclusivo, `2` común/prorrata, `3`/`4` sin derecho a crédito), detracciones SPOT y asiento en Subdiario `01`.
- **3.2. Registro de ventas** (`RegistroVentasView.tsx` | `ventaService.ts` | `[COMPLETO]`): Registro manual, CSV o XML UBL desacoplado del facturador externo, con asiento en Subdiario `02`.
- **3.3. Detracciones y retenciones** (`DetraccionesRetencionesView.tsx` | `detraccionService.ts` | `[COMPLETO]`).

### GRUPO 4: FACTURACIÓN (`id: 'facturacion'`)
- **4.1. Emitir factura o boleta `[F3]` / Notas de crédito y débito** (`EmitirComprobanteView.tsx`, `NotasCreditoDebitoView.tsx` | `[PARCIAL]`): Operan en adaptador sandbox rotulado `SIMULADO`; la emisión firmada XAdES se delega al Facturador Atlob externo.
- **4.2. Consulta de comprobantes / Lector de XML y CDR** (`ConsultaComprobantesView.tsx`, `LectorXmlCdrView.tsx` | `[COMPLETO]`).
- **4.3. Guías de remisión / Resumen diario y bajas / Series y certificado digital**: Deshabilitadas como `próximamente`.

### GRUPO 5: TRIBUTOS (`id: 'tributos'`)
- **5.1. Declaración mensual IGV-Renta (PDT 621)** (`LiquidacionTributariaView.tsx` | `liquidacionIGVService.ts` | `[COMPLETO]`): Determinación mensual de IGV y pago a cuenta de Renta, flujo `BORRADOR` → `PRELIQUIDADO` → `PRESENTADO` → `RECTIFICATORIA` y resumen PDF en formato estándar.
- **5.2. Prorrata del IGV** (`ProrrataIgvView.tsx` | `prorrataIgvService.ts` | `[COMPLETO]`): Coeficiente móvil de 12 meses (Art. 23° TUO LIGV) y envío del IGV común no acreditable a la cuenta `64111`.
- **5.3. Declaración anual de Renta** (`DeclaracionRentaAnualView.tsx` | `djRentaAnualService.ts` | `[COMPLETO]`): Determinación anual RMT (10% / 29.5%) y Régimen General (29.5%), adiciones, deducciones y arrastre de pérdidas Art. 50° LIR.
- **5.4. Operaciones con terceros (DAOT)** (`DaotView.tsx` | `daotService.ts` | `[COMPLETO]`): Cruce anual sobre umbral `2 UIT` (`S/ 11,000.00` en 2026) y exportación `COSTOS.TXT` / `INGRESOS.TXT`.
- **5.5. Cronograma de vencimientos** (`CronogramaVencimientosView.tsx` | `cronogramaVencimientosService.ts` | `[COMPLETO]`).
- **5.6. Parámetros tributarios** (`ParametrosTributariosView.tsx` | `parametroRepository.ts` | `[COMPLETO]`).
- **5.7. Simulador de fiscalización SUNAT** (`SimuladorFiscalizacionView.tsx` | `[COMPLETO]`).

### GRUPO 6: PLANILLAS (`id: 'planillas'`)
- **6.1. Trabajadores** (`TrabajadoresView.tsx` | `[COMPLETO]`): Padrón laboral con cuentas bancarias cifradas AES-256-GCM y validación contra RMV vigente.
- **6.2. Planilla mensual** (`PlanillaPlameView.tsx` | `[COMPLETO]`): Días laborados, horas extras 25%/35%, ONP 13%, AFP (flujo/mixta + prima `1.37%` con tope RMA trimestral), EsSalud 9%, 5ta categoría proyectada y asiento en Subdiario `08`.
- **6.3. Recibos por honorarios (4ta)** (`HonorariosView.tsx` | `honorariosService.ts` | `[COMPLETO]`): Retención 8% sobre recibos mayores a S/ 1,500 salvo suspensión vigente.
- **6.4. Boletas de pago** (`BoletasPagoView.tsx` | `formatoEstandarEngine.ts` | `[COMPLETO]`): Emisión individual y masiva en PDF (D.S. N° 009-2011-TR).
- **6.5. Gratificaciones y CTS** (`GratificacionesCtsView.tsx` | `[COMPLETO]`): Gratificaciones Jul/Dic (+9% Ley N° 30334), CTS May/Nov y Liquidación de Beneficios Sociales (LBS).
- **6.6. Exportar PLAME** (`ExportarPlameView.tsx` | `[COMPLETO]`): Paquete oficial `0601{AAAA}{MM}{RUC}.zip` con estructuras Anexo 3: `.jor` (`14`), `.snl` (`15`), `.rem` (`18`), `.4ta` (`20`) y `.toc` (`26`), más `.or5` (`22`) cuando aplique. (La extensión inexistente `.des` fue eliminada).
- **6.7. T-Registro** (`TRegistroView.tsx` | `[COMPLETO]`): Paquete oficial `RP_{RUC}.zip` con las 4 estructuras Anexo 3: `.ide` (`04`), `.tra` (`05`), `.per` (`11`) y `.est` (`17`), además de vistas JSON internas de auditoría de altas, bajas y modificaciones.

### GRUPO 7: REGISTROS ELECTRÓNICOS (`id: 'registros-electronicos'`)
- **7.1. SIRE (`sireRoutes.ts`, `sireController.ts`, `sireService.ts`, `conciliadorSireService.ts`, `sireLayoutService.ts` | `[EN VERIFICACIÓN]`):** Descarga OAuth2 con tickets (`01`, `02`, `03`) o carga manual TXT/ZIP, bloqueo estricto de propuestas `[SIMULADO]`, conciliación por CAR de 27 dígitos con `Money`, asientos de ajuste guiados y layouts RCE/RVIE.
- **7.2. Libros Electrónicos PLE 5.2 (`pleRoutes.ts`, `pleController.ts`, `pleExportService.ts` | `[EN VERIFICACIÓN]`):** Libros `050100`, `060100`, `080100`, `080200`, `140100`, `010100` y `010200` con `Money`, CRLF y UTF-8 sin BOM.
- **7.3. Validador TXT e Historial SHA-256 (`archivoValidadorService.ts`, `historialGeneracionesService.ts` | `[COMPLETO]`):** Reporte de errores por línea y columna e historial aislado por empresa con hash SHA-256.

### GRUPOS 8 A 13: TESORERÍA, INVENTARIOS, EEFF, ESTUDIO, HERRAMIENTAS Y AYUDA
- **Grupo 8 (Tesorería):** Bancos/conciliación `[PARCIAL]`, CxC/CxP/Antigüedad `[COMPLETO]`, Caja Chica `[COMPLETO]`, `Letras y pagarés` en `próximamente`.
- **Grupo 9 (Inventarios y Activos):** Opciones en estado `próximamente` hasta iniciar la Fase 7.
- **Grupo 10 (Estados Financieros):** Hoja de Trabajo 10 Columnas, Situación Financiera, Resultados, Flujo de Efectivo y Análisis de Cuentas `[COMPLETO]`.
- **Grupo 11 (Estudio):** Cartera, Indicadores, Control de Calidad y Plantillas `[COMPLETO]`; `Portal del cliente` en `próximamente`.
- **Grupo 12 (Herramientas):** Calculadora, 5 Tablas Maestras, Respaldos ZIP, Demo idempotente, Usuarios/Permisos, Auditoría y Estilo de Reporte `[COMPLETO]`.
- **Grupo 13 (Ayuda):** Guía rápida, Estado de conexión SUNAT y Acerca de `[COMPLETO]`.

---

## 5. CUMPLIMIENTO TRIBUTARIO PERUANO

### 5.1. Plan Contable General Empresarial (PCGE)

Implementado en `src/data/pcgeAccounts.ts` conforme a la Resolución CNC N° 002-2019-EF/30, incluyendo cuentas operativas a 4–6 dígitos desde el Elemento 1 hasta el Elemento 9, cuentas tributarias (`40111` IGV, `40171` Renta 3ra, `40172` Renta 4ta, `40173` Renta 5ta, `64111` IGV no acreditable por prorrata), cuentas de ajuste SIRE (`6591` y `7591`) y amarres analíticos (`921`, `941`, `951` contra `791`).

### 5.2. Sistema Integrado de Registros Electrónicos (SIRE)

- **Estructuras implementadas (R.S. N° 000112-2021/SUNAT y modificatorias):** Reemplazo RCE Anexo 8 (`42` campos), Reemplazo RVIE Anexo 2/3 (`34` campos), Ajustes Posteriores RCE Anexo 11 (`43` campos, código `080500`) y Ajustes Posteriores RVIE Anexo 4/5 (`35` campos, código `140500`).
- **Bloqueo de Propuestas `[SIMULADO]`:** Toda propuesta generada sin credenciales reales lleva `esSimulado = true`. `conciliadorSireService` y `sireRoutes` bloquean aceptación, reemplazo o exportación oficial arrojando `OPERACION_SIMULADA_BLOQUEADA`.
- **Asiento de Ajuste Contable:** Parametrizado en `parametroRepository` (`6591`, `7591`, `4212`, `1212`) con advertencia obligatoria: *"Requiere revisión del contador - No constituye tratamiento tributario definitivo"*.

### 5.3. Libros Electrónicos PLE 5.2

- **Nomenclatura oficial de 33 caracteres antes de `.txt` (Anexo N° 1 R.S. N° 286-2009/SUNAT):**
  `LE{RUC(11)}{AAAA(4)}{MM(2)}{DD(2)}{LLLLLL(6)}{CC(2)}{O(1)}{I(1)}{M(1)}{G(1)}.txt`
  - Posición `30` (`{O}`): `'1'` empresa operativa, `'0'` cierre de operaciones, `'2'` cierre de libro.
  - Posición `31` (`{I}`): `'1'` con información, `'0'` **sin información (mes sin movimiento)**.
  - Posición `32` (`{M}`): `'1'` Soles (`PEN`), `'2'` Dólares (`USD`).
  - Posición `33` (`{G}`): `'1'` generado por el contribuyente.
- **Codificación y formato:** Pleca (`|`) con delimitador final, salto `CRLF` (`\r\n`), UTF-8 sin BOM y sanitización de plecas internas en glosas (`|` → `-`).

### 5.4. Facturación Electrónica UBL 2.1

La validación de comprobantes XML UBL 2.1 con bloqueo anti-XXE (`xmlImportService.ts`) y lectura de CDR es funcional. La emisión electrónica firmada se mantiene fuera del alcance actual para integrarse desde el Facturador Atlob externo hacia `comprobantes_venta`.

### 5.5. Tabla Verificada de Casillas del Formulario Virtual / PDT 621 (IGV - Renta Mensual)

Verificada contra el Formulario Virtual N.° 621 de SUNAT, `server/services/liquidacionIGVService.ts`, `src/components/views/LiquidacionTributariaView.tsx` y `server/tests/run_tests_fase4_tributos.ts`:

#### A. Casillas Oficiales de IGV y Pago a Cuenta de Renta de 3ra Categoría

| Casilla | Denominación Oficial en FV / PDT 621 | Fórmula Exacta (`Money` / `decimal.js`) | Origen del Dato | Regla de Redondeo |
| :---: | --- | --- | --- | --- |
| **100** | Ventas netas gravadas (Base imponible) | $\sum \text{BaseGravada}(\text{Tipo } 01, 03, 08)$ | `comprobantes_venta` (`estado <> 'ANULADO'`) | 2 decimales / entero PDT |
| **101** | Tributo IGV Ventas gravadas (18%) | $\text{Casilla } 100 \times \text{TASA\_IGV}$ | `comprobantes_venta.igv` | 2 decimales / entero PDT |
| **102** | Descuentos concedidos y/o devoluciones de ventas (Base NC) | $\sum \lvert \text{BaseGravada}(\text{Tipo } 07) \rvert$ | `comprobantes_venta` (`tipo_comprobante = '07'`) | 2 decimales |
| **103** | Tributo IGV Descuentos y devoluciones (NC) | $\sum \lvert \text{IGV}(\text{Tipo } 07) \rvert$ | `comprobantes_venta` (`tipo_comprobante = '07'`) | 2 decimales |
| **106** | Exportaciones facturadas en el período | $\sum \text{ExportacionFacturada}$ | `comprobantes_venta` (`tipo_operacion = '0200'`) | 2 decimales |
| **109** | Ventas no gravadas (sin considerar exportaciones) | $\sum (\text{Exonerado} + \text{InafectoLocal})$ | `comprobantes_venta` | 2 decimales |
| **131** | **TOTAL DÉBITO FISCAL DEL PERÍODO** | $\max(0,\; \text{Casilla } 101 - \text{Casilla } 103)$ | `liquidacionIGVService.ts` | 2 decimales |
| **107** | Compras netas destinadas a ventas gravadas exclusivamente (Base) | $\sum \text{Base}(\text{Destino } 1) - \sum \lvert \text{Base NC}(\text{Destino } 1) \rvert$ | `comprobantes_compra` (`tipo_adquisicion = '1'`) | 2 decimales |
| **108** | Tributo IGV Compras destino gravado exclusivo | $\sum \text{IGV}(\text{Destino } 1) - \sum \lvert \text{IGV NC}(\text{Destino } 1) \rvert$ | `comprobantes_compra` (`tipo_adquisicion = '1'`) | 2 decimales |
| **110** | Compras netas destinadas a ventas gravadas y no gravadas — Destino común | $\sum \text{Base}(\text{Destino } 2)$ | `comprobantes_compra` (`tipo_adquisicion = '2'`) | 2 decimales |
| **111** | Tributo IGV Compras destino común (aplicando Prorrata si corresponde) | $\text{IGV}_{\text{común}} \times (\text{PorcentajeProrrata} / 100)$ | `comprobantes_compra` + `declaraciones_prorrata_igv` | 2 decimales (no admitido a `64111`) |
| **120** | Adquisiciones no gravadas / sin derecho a crédito fiscal | $\sum \text{Base}(\text{Destino } 3, 4) + \sum \text{NoGravado}$ | `comprobantes_compra` | 2 decimales |
| **178** | **TOTAL CRÉDITO FISCAL DEL PERÍODO** | $\max(0,\; \text{Casilla } 108 + \text{Casilla } 111)$ | `liquidacionIGVService.ts` | 2 decimales |
| **140** | Impuesto resultante o Saldo a favor del período | $\text{Casilla } 131 - \text{Casilla } 178$ | Si $> 0$: impuesto resultante; si $< 0$: saldo del mes | 2 decimales |
| **145** | Saldo a favor del período anterior | $\text{SaldoAFavorArrastrable}_{t-1}$ | `declaraciones_pdt621` período $t-1$ | 2 decimales |
| **184** | Tributo a pagar o Saldo a favor | $\text{Casilla } 140 - \text{Casilla } 145$ | Antes de percepciones y retenciones | 2 decimales |
| **171** | **Percepciones del IGV declaradas en el período** | $\sum \text{MontoPercepcion}(\text{período})$ | `retenciones_percepciones_igv` (`tipo = 'PERCEPCION'`) | 2 decimales *(Cas. 168 es períodos ant.)* |
| **179** | **Retenciones del IGV declaradas en el período** | $\sum \text{MontoRetencion}(\text{período})$ | `retenciones_percepciones_igv` (`tipo = 'RETENCION'`) | 2 decimales |
| **188** | **TOTAL DEUDA TRIBUTARIA DE IGV** | $\max(0,\; \text{Casilla } 184 - \text{Casilla } 171 - \text{Casilla } 179)$ | Si el neto es $< 0$, genera saldo arrastrable a $t+1$ | 2 decimales y entero SUNAT |
| **301** | Ingresos netos del mes (Base pago a cuenta Renta 3ra) | $\max(0,\; \text{Casilla } 100 - \text{Casilla } 102 + \text{Casilla } 106 + \text{Casilla } 109)$ | `comprobantes_venta` | 2 decimales |
| **315** | Coeficiente o porcentaje aplicable Renta | RMT $\le 300\text{ UIT}$: $1.00\%$; RG o RMT $> 300\text{ UIT}$: $\max(1.50\%, \text{Coef.})$; RER: $1.50\%$ | `parametros_tributarios` + `empresas` | 2 a 4 decimales |
| **302** | Pago a cuenta determinado de Renta | $\text{Casilla } 301 \times \text{TasaAplicada}$ | `liquidacionIGVService.ts` | 2 decimales / entero SUNAT |
| **303** | **Saldo a favor del período anterior (Impuesto a la Renta)** | $\min(\text{Casilla } 302,\; \text{SaldoFavorRentaAnterior})$ | `declaraciones_pdt621` / `declaraciones_renta_anual` | 2 decimales |
| **304** | **PAGO A CUENTA DE RENTA POR PAGAR** | $\max(0,\; \text{Casilla } 302 - \text{Casilla } 303)$ | Deuda neta mensual de Renta 3ra Categoría | 2 decimales y entero SUNAT |

#### B. Fórmula de Prorrata del Crédito Fiscal IGV (Art. 23° TUO LIGV y Art. 6° num. 6 Reglamento)

$$\text{Coeficiente de Prorrata (12 meses)} = \frac{\sum_{i=t-11}^{t} (\text{Ventas Gravadas}_i + \text{Exportaciones}_i)}{\sum_{i=t-11}^{t} (\text{Ventas Gravadas}_i + \text{Exportaciones}_i + \text{Ventas No Gravadas}_i)}$$

$$\text{Porcentaje Aplicable} = \text{round}(\text{Coeficiente} \times 100,\; 2\text{ decimales})$$

$$\text{Crédito Fiscal Destino Común Admitido} = \text{IGV Compras Destino Común} \times \left(\frac{\text{Porcentaje Aplicable}}{100}\right)$$

$$\text{IGV No Admitido (Cuenta 64111)} = \text{IGV Compras Destino Común} - \text{Crédito Fiscal Destino Común Admitido}$$

### 5.6. Cronograma de Vencimientos, Parámetros Unificados y Supuestos a Validar

1. **Cronograma SUNAT 2026 (`cronograma_vencimientos`, `es_supuesto_validar = true`):** Las fechas exactas por último dígito de RUC (`0`–`9` y `B` Buenos Contribuyentes) están marcadas como **`Pendiente de validar`** contra la Resolución de Superintendencia anual correspondiente y son editables por `ADMINISTRADOR`.
2. **Parámetros Previsionales AFP / SBS Unificados (`parametroRepository.ts`):** Se unifican en todo el documento los valores vigentes cargados en código: prima de seguro AFP **`1.37%`** (`TASA_PRIMA_SEGURO_AFP`, que reemplazó al histórico `1.84%`) y topes trimestrales RMA SBS 2026 (`TOPE_PRIMA_SEGURO_AFP`: Q1 `S/ 12,209.11`, Q2 `S/ 12,598.91`, Q3 `S/ 12,672.65`, Q4 `S/ 12,732.70`; eliminado el valor obsoleto `S/ 12,135.22`). Si se solicita un período sin parámetro vigente, el servicio lanza `CALCULO_BLOQUEADO_PARAMETRO_FALTANTE`.
3. **Lista Única Oficial de Estructuras PLAME y T-Registro (Anexo 3 R.M. N° 121-2011-TR y modif. R.S. N° 016-2022/SUNAT):**
   - **T-Registro (`RP_{RUC}.zip`):** `.ide` (Estructura `04`), `.tra` (Estructura `05`), `.per` (Estructura `11`), `.est` (Estructura `17`).
   - **PDT PLAME 0601 (`0601{AAAA}{MM}{RUC}.zip`):** `.jor` (Estructura `14`), `.snl` (Estructura `15`), `.rem` (Estructura `18`, incluye descuentos `06xx`/`07xx`), `.4ta` (Estructura `20`), `.toc` (Estructura `26`), y `.or5` (Estructura `22`, cuando existan retenciones de 5ta de otros empleadores). La extensión `.des` no existe en el Anexo 3 y fue eliminada.

---

## 6. REGISTRO DE DEFECTOS CORREGIDOS Y PENDIENTES

| ID | Módulo | Severidad / Estado | Archivo / Ubicación | Descripción del Problema | Causa Raíz | Solución Aplicada / Acción |
| --- | --- | :---: | --- | --- | --- | --- |
| **BUG-01** | Test Suite | Media *(Resuelto)* | `server/routes/index.ts` | `/api/health` devolvía `200` en pruebas sin PostgreSQL cuando el test esperaba `503`. | Condición `NODE_ENV !== 'production'` no excluía `'test'`. | Ajustado a `isPostgres \|\| (NODE_ENV !== 'production' && NODE_ENV !== 'test')`. |
| **BUG-02** | Facturación | Media *(Diferido)* | `EmitirComprobanteView.tsx` | Emisión UBL 2.1 opera sobre adaptador sandbox `SIMULADO`. | La firma criptográfica XAdES se delegó al Facturador Atlob independiente. | Sincronizar CPE emitidos hacia `comprobantes_venta` en la integración con el Facturador Atlob. |
| **BUG-03** | UI TopBar | Baja *(Resuelto)* | `src/components/desktop/TopBar.tsx` | En resoluciones menores a `768px`, la barra de herramientas hacía salto en dos filas. | Uso de `flex-wrap` sin desplazamiento horizontal compacto. | Aplicado `overflow-x-auto no-scrollbar whitespace-nowrap`. |
| **BUG-04** | TypeScript | Alta *(Resuelto)* | `asientoService.ts`, `conciliadorSireService.ts` | `npm run lint` fallaba con código `1` por desalineación de tipos en `DetalleInput` y retorno de ajuste SIRE. | Propiedades opcionales faltantes en interfaces de producción. | Corregidos contratos TypeScript; `npm run lint` finaliza con código `0`. |
| **BUG-05** | Arquitectura | Media *(Resuelto)* | `server/services/planilla/*` y legacy SIRE/PLE | Existían archivos muertos duplicados (`server/services/planilla/*` con `.des`, y controladores mixtos SIRE+PLE). | Refactorizaciones previas sin limpieza física de archivos antiguos. | Eliminados físicamente los archivos duplicados; `planillaService.ts`, `sire*` y `ple*` son fuentes únicas. |
| **BUG-06** | PLE 5.2 | Media *(Resuelto)* | `server/services/pleExportService.ts` | Nomenclatura de mes sin movimiento documentada en posición 30, falta de moneda USD y sumas con `Number`. | Discrepancia con Anexo 1 R.S. 286-2009/SUNAT y uso de coma flotante nativa. | Posición 31 = `{I}`, posición 32 = `{M}` (`1` PEN, `2` USD) y sumatorias migradas a `Money` (`decimal.js`). |
| **BUG-07** | PDT 621 UI | Media *(Resuelto)* | `src/components/views/LiquidacionTributariaView.tsx` | La vista etiquetaba Retenciones como Casilla `171`, Percepciones como `168` y Saldo a favor como `179`. | Inversión de etiquetas respecto a `liquidacionIGVService.ts` y al FV 621 oficial. | Alineado con SUNAT FV 621: Cas. `102/103` NC ventas, Cas. `171` Percepciones, Cas. `179` Retenciones, Cas. `188` Deuda IGV y Cas. `303` Saldo Renta. |
| **BUG-08** | Planillas 5ta/LBS | Alta *(Resuelto)* | `server/services/planillaService.ts` | Proyección de 5ta en Oct-2026 usaba RMV de octubre para Ene–Sep y divisor 4; LBS aplicaba `1.84%` sin tope RMA. | Falta de consulta histórica mensual de RMV y constante desactualizada en LBS. | `planillaService` consulta RMV histórica por mes (`9 × 5,113`), aplica divisor `3` en octubre sobre Ene–Sep y usa `1.37%` con tope RMA en LBS. |
| **BUG-09** | Persistencia SQL | **Alta *(Pendiente)*** | `pleExportService.ts`, `conciliadorSireService.ts`, `sireService.ts`, `planillaService.ts` | Estos servicios leen y escriben arreglos `*_MEMORIA` incluso si hay conexión activa a PostgreSQL. | Implementación inicial orientada a suites en memoria antes de cablear consultas SQL. | **Bloqueante antes de cerrar Fase 6:** reemplazar accesos directos a `*_MEMORIA` por repositorios SQL transaccionales sobre PostgreSQL. |

---

## 7. PENDIENTES Y DEUDA TÉCNICA (BACKLOG UNIFICADO)

| Prioridad | Tarea / Característica | Área | Esfuerzo | Estado Actual y Justificación |
| :---: | --- | --- | :---: | --- |
| **P0** | **Persistencia SQL Completa en SIRE, PLE y Planillas + Ejecución de `test:pg` en PostgreSQL 15+ Real** | Backend / BD | **M** | **Requisito bloqueante para cierre de Fase 6 (`AGENTS.md`):** migrar lecturas/escrituras de `*_MEMORIA` a consultas SQL sobre PostgreSQL y ejecutar `npm run test:pg` (RLS + `trg_asiento_partida_doble`) y `npm run test:infra` contra una instancia PostgreSQL 15+ real. |
| **P0** | **Validación Externa en Aplicativos Oficiales SUNAT (SIRE API Real, PLE 5.2 Desktop, PDT PLAME v4.0 y PVS T-Registro)** | Compliance SUNAT | **M** | El cliente OAuth2 SIRE (`sunatGateway.ts`) y los exportadores TXT/ZIP ya están implementados y probados en emulación local; falta homologarlos con credenciales `client_id` / `client_secret` reales y validadores oficiales de escritorio de SUNAT. |
| **P1** | **Fase 7: Inventarios & Kardex Físico/Valorado (Libros PLE 12.1 y 13.1) y Activos Fijos (Libro 7.1)** | Inventarios | **L** | Iniciar únicamente tras el cierre formal de la Fase 6; completa valuación Promedio Ponderado / PEPS, costo de ventas (`69` vs `20`) y depreciación mensual. |
| **P1** | **Sincronización con Facturador Atlob Externo** | Integración CPE | **M** | Conector de recepción de comprobantes emitidos y firmados en el Facturador Atlob independiente hacia `comprobantes_venta`, sin acoplar SOAP/XAdES al núcleo contable. |
| **P2** | **Importación Nativa de Extractos Bancarios (OFX / Formatos Bancos Locales)** | Tesorería | **S** | Amplía la conciliación bancaria actual basada en CSV estándar. |
| **P3** | **Empaquetado Nativo de Escritorio (Tauri 2.0) y Portal de Consulta para Clientes** | Desktop / Estudio | **M** | Distribución instalable de escritorio y acceso de solo lectura para clientes del estudio. |

---

## 8. SEGURIDAD Y PROTECCIÓN DE DATOS SENSIBLES

1. **Declaración Única Verificada sobre Credenciales SUNAT (`Clave SOL`, `client_id`, `client_secret`) y `SUNAT_ENCRYPTION_KEY`:**
   - **Dónde y cómo se almacenan:** Las credenciales SUNAT por empresa (`usuario_sol_encrypted`, `clave_sol_encrypted`, `client_id_encrypted`, `client_secret_encrypted`) se almacenan cifradas en la tabla `sunat_conexiones` (`server/db/schema_fase6.sql`) mediante **AES-256-GCM** en `server/services/cryptoService.ts` (IV aleatorio de 12 bytes + Auth Tag de 16 bytes, formato `v1:iv:tag:ciphertext`, con soporte `v2` de Envelope Encryption por DEK empresarial envuelta en `sunat_empresa_keys`).
   - **Ubicación de la clave maestra (KEK):** La llave maestra reside exclusivamente en la variable de entorno `SUNAT_ENCRYPTION_KEY`. En `NODE_ENV=production`, `server/config/env.ts` exige que esté definida, tenga al menos 32 caracteres (64 hex para 256 bits) y no coincida con el valor de desarrollo; nunca se persiste en base de datos ni en el repositorio Git.
   - **Exclusión estricta de respaldos:** En `server/storage/registroDatosEmpresa.ts` las tablas `credenciales_sunat`, `sunat_conexiones`, `sunat_empresa_keys`, `sunat_tokens`, `usuarios`, `usuarios_estudio`, `roles`, `permisos`, `rol_permisos`, `membresias`, `usuario_empresa` y `refresh_tokens` tienen `exportar: false`. Adicionalmente, `backupEmpresaService.ts` aplica una lista blanca cerrada y `run_tests_fase13_backup.ts` verifica archivo por archivo (`.ndjson` y `manifest.json`) cero fugas de secretos.
   - **No exposición en respuestas ni logs:** Las rutas devuelven únicamente banderas booleanas de configuración (`write-only`), y `sanitizarErrorLog` expurga tokens Bearer, claves SOL y secretos antes de registrar errores.
2. **Secreto MFA de Demostración (`MFA_SECRET_ADMIN_DEMO`):**
   - En `server/services/authJwtService.ts:76`, la constante `MFA_SECRET_ADMIN_DEMO = 'JBSWY3DPEHPK3PXP'` **no es un secreto real de producción**: es el vector público estándar de prueba del RFC 6238 / Google Authenticator, inyectado exclusivamente por `sembrarUsuariosPrueba()` cuando `NODE_ENV !== 'production' && !DATABASE_URL`. En enrolamiento real (`totpService.generarSecreto()`), cada usuario recibe un secreto aleatorio de 20 bytes generado con `crypto.randomBytes(20)`.
3. **Desactivación de `IN_MEMORY_FALLBACK` en Producción:**
   - Verificada en `server/config/env.ts:27`, `server/config/database.ts:39-41` y certificada por `server/tests/test_produccion_sin_db.ts`: en `NODE_ENV=production` el respaldo en memoria está prohibido en el arranque del servidor y en `empresaRepository`. (Véase `BUG-09` sobre los servicios pendientes de migrar de `*_MEMORIA` a SQL).
4. **Sesiones JWT y Defensa Anti-XXE:**
   - Access tokens JWT con expiración de 15 minutos, refresh tokens revocables al cerrar sesión, cifrado de cuentas bancarias de trabajadores (Ley N° 29733) y bloqueo estricto de `<!DOCTYPE` y `<!ENTITY` en `xmlImportService.ts` (`ATAQUE_XXE_DETECTADO`).

---

## 9. PRUEBAS Y VERIFICACIÓN

### 9.1. Inventario Real de Suites y Motores de Persistencia

El repositorio contiene **30 archivos de prueba/soporte** (`27` en `server/tests/`, `2` en `server/tests/real/` y `1` en `src/api/session.test.ts`). El orquestador `npm test` (`server/tests/run_all_tests.ts`) ejecuta **24 suites automatizadas** en `102.43s` forzando `NODE_ENV='test'` y `DATABASE_URL=''`:

1. **Suites sobre estructuras en memoria (`*_MEMORIA`, sin motor SQL — 22 de las 24 suites de `npm test`):**
   - `src/api/session.test.ts`, `run_tests_acceso.ts`, `verificar_auth_setup.ts` (modo memoria por defecto), `run_tests.ts` (Fase 2: 28 pruebas), `run_tests_fase3.ts` (27 pruebas), `run_tests_fase4.ts` (46 pruebas), `run_tests_fase5.ts` (42 pruebas), `run_tests_fase6.ts` (**80 pruebas**), `run_tests_fase7.ts`, `run_tests_fase7b.ts`, `run_tests_fase7c2.ts`, `run_tests_fase9.ts`, `run_tests_fase10.ts`, `run_tests_fase11.ts` (27 pruebas), `run_tests_fase13_cobertura.ts` (74 pruebas), `run_tests_fase13_demo.ts` (20 pruebas), `run_tests_fase13_backup.ts` (47 pruebas), `run_tests_fase13_importacion.ts` (43 pruebas), `run_tests_menu_fase1.ts` (86 opciones hoja), `run_tests_fase4_tributos.ts`, `run_tests_fase5_planillas.ts` (incluye los 6 Casos Dorados), `test_produccion_sin_db.ts` (lanza subproceso con `NODE_ENV=production`) y `run_tests_reportes_y_vouchers_normativos.ts` (7 pruebas: formato de fechas estricto, cuadre de compras S/ 21,300.54, 11 reportes uniformes, PLE 5.1/6.1, validaciones PCGE y 7 plantillas de asientos).
2. **Pruebas con `pg-mem` (`server/tests/postgresTestHarness.ts`):**
   - Usado únicamente en el **Test 1 (`L39-68`) de `server/tests/run_tests_fase8.ts`** (la 22.ª suite del listado anterior; sus Tests 2 y 3 usan `*_MEMORIA`). `postgresTestHarness.ts` carga `schema_fase1..6.sql` y `migration_fase8.sql`, pero **no** carga `triggers_fase2.sql` porque `pg-mem` no soporta `CREATE CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` en PL/pgSQL.
3. **Pruebas diseñadas para PostgreSQL 15+ Real (`pg.Pool`, fuera de `npm test` sin BD):**
   - `server/tests/real/test_pg_rls_planillas.ts` (`npm run test:pg`): exige `TEST_DATABASE_URL` terminada en `_test`; aplica todas las migraciones SQL, configura rol `app_user` con `NOBYPASSRLS`, verifica aislamiento RLS multiempresa y en el **Paso 10** prueba explícitamente el trigger diferido `trg_asiento_partida_doble` (`fn_validar_partida_doble()`), comprobando que PostgreSQL rechaza el `COMMIT` de un asiento `CONTABILIZADO` descuadrado (`1500.00` vs `1499.99`) con `ASIENTO_DESCUADRADO`.
   - `server/tests/real/test_infra.ts` (`npm run test:infra`), `server/tests/run_tests_registro_empresa.ts` y `server/tests/verificar_auth_setup.ts --postgres`.
   - **Limitación actual del entorno:** En la estación donde se corrió esta auditoría no hay una instancia PostgreSQL 15+ activa en `TEST_DATABASE_URL`, por lo que `npm run test:pg` detiene su ejecución de forma controlada con código `1` solicitando dicha variable.

#### Explicación de la Diferencia `75/75` vs `80/80` en `server/tests/run_tests_fase6.ts`

El informe inicial de Fase 6 registraba `75/75` aserciones. Durante la corrección normativa y de seguridad de Fase 6 se incorporaron **5 nuevas aserciones** en `server/tests/run_tests_fase6.ts`, elevando el conteo verificable en ejecución real a **`80/80`**:
- **Test 1 (`L106` y `L114`, +2 aserciones):** Verifican que `conciliadorSireService.aceptarPropuestaSireOficial` y `reemplazarPropuestaSireOficial` lancen `OPERACION_SIMULADA_BLOQUEADA` cuando la propuesta tiene `esSimulado === true`.
- **Test 5 (`L450`, `L454` y `L455`, +3 aserciones):** Verifican la nomenclatura PLE 5.2 de 33 caracteres en dólares con movimiento (`...001121.txt`, pos. 31 = `'1'`, pos. 32 = `'2'`), en dólares sin movimiento (`...001021.txt`, pos. 31 = `'0'`, pos. 32 = `'2'`) y que el archivo sin movimiento en `USD` contenga `0` filas de datos (`totalFilas === 0`).

### 9.2. Comandos Oficiales de Compilación y Verificación

```bash
# 1. Instalar dependencias
npm install

# 2. Validar tipado estático TypeScript en todo el repositorio
npm run lint

# 3. Ejecutar suite especializada de Fase 6 (SIRE y PLE 5.2 — 80 aserciones)
npm run test:fase6

# 4. Ejecutar batería integral automatizada (24 suites en memoria / pg-mem)
npm test

# 5. Ejecutar pruebas sobre PostgreSQL 15+ real (requiere TEST_DATABASE_URL terminada en _test)
npm run test:pg

# 6. Compilar bundle de producción del cliente React/Vite
npm run build

# 7. Iniciar servidor de desarrollo en puerto 3000
npm run dev
```

---

## 10. UI/UX DE ESCRITORIO PROPIA DE ATLOB CONSULTORES

- **Disposición Vertical de Alta Densidad (Sin Barra Lateral):**
  - **Barra de Título (`13px`):** Identidad `Atlob Consultores ERP`, chips activos de Empresa, RUC, Período, Ambiente SUNAT (`BETA` / `PRODUCCIÓN`), Rol actual y autoría `Desarrollado por Jimmy Mayta`.
  - **Barra de Menús (`13px`):** Generada desde `MENU_DATA` (`src/types/menu.ts`) con 13 grupos y navegación por teclado (`Alt`, cursores, `Enter`, `Esc`).
  - **Barra de Herramientas:** Fila única compacta (`overflow-x-auto no-scrollbar whitespace-nowrap`) y paleta de comandos `[Ctrl+Shift+P]`.
  - **Tipografía Local:** Familia condensada (`Roboto Condensed` empaquetada localmente en `woff2` + pilas del sistema) con `tabular-nums` para alineación vertical de importes contables.
  - **Barra de Estado:** RUC activo, próximo vencimiento tributario, Tipo de Cambio SBS, usuario/rol y estado de conexión.

---

## 11. FRAGMENTOS DE CÓDIGO REAL DE PRODUCCIÓN

### 11.1. Estructura Tipada del Menú Data-Driven (`src/types/menu.ts`)

```typescript
export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  separator?: boolean;
  children?: MenuItem[];
  action?: string;
}

export interface MenuGroup {
  id: string;
  label: string;
  items: MenuItem[];
}
```

### 11.2. Modelo de Asiento Contable en Cliente (`src/types/index.ts`)

```typescript
export interface AsientoContable {
  id: string;
  subdiario: CodigoSubdiario;
  numeroAsiento: string;
  fecha: string;
  periodo: string;
  glosaGeneral: string;
  moneda: 'PEN' | 'USD';
  tipoCambio: number;
  items: ApunteContableItem[];
  totalDebe: number;
  totalHaber: number;
  cuadrado: boolean;
  estado: 'BORRADOR' | 'CONTABILIZADO' | 'ANULADO';
  origenAutomatico?: boolean;
}
```

### 11.3. Contabilización Atómica y Correlativo en PostgreSQL (`server/services/asientoService.ts`)

```typescript
async contabilizar(asientoId: string, empresaId: string, userId: string, options?: { enforceSegregacion?: boolean }) {
  if (db.isPostgresConnected()) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_user_id = $1`, [userId]);
      await client.query(`SET LOCAL app.current_empresa_id = $2`, [empresaId]);

      const aRes = await client.query(`
        SELECT a.*, p.codigo_periodo, s.codigo as subdiario_codigo
        FROM asientos a
        JOIN periodos p ON p.id = a.periodo_id
        JOIN subdiarios s ON s.id = a.subdiario_id
        WHERE a.id = $1 FOR UPDATE
      `, [asientoId]);

      if (aRes.rows.length === 0) throw new Error('ASIENTO_NO_ENCONTRADO');
      const asiento = aRes.rows[0];

      if (options?.enforceSegregacion && asiento.created_by && asiento.created_by === userId) {
        throw new Error('SEGREGACION_FUNCIONES: El usuario que registró el borrador no puede contabilizarlo (Separación obligatoria de funciones).');
      }
      if (asiento.estado === 'CONTABILIZADO') {
        throw new Error('ASIENTO_YA_CONTABILIZADO: El asiento ya se encuentra contabilizado.');
      }

      await client.query(`
        INSERT INTO correlativos (empresa_id, periodo_id, subdiario_id, ultimo_numero)
        VALUES ($1, $2, $3, 0)
        ON CONFLICT (empresa_id, periodo_id, subdiario_id) DO NOTHING
      `, [empresaId, asiento.periodo_id, asiento.subdiario_id]);

      const corrRes = await client.query(`
        UPDATE correlativos
        SET ultimo_numero = ultimo_numero + 1, updated_at = CURRENT_TIMESTAMP
        WHERE empresa_id = $1 AND periodo_id = $2 AND subdiario_id = $3
        RETURNING ultimo_numero
      `, [empresaId, asiento.periodo_id, asiento.subdiario_id]);

      const correlativoNum = corrRes.rows[0].ultimo_numero;
      const mesStr = asiento.codigo_periodo.split('-')[1] || '09';
      const numeroCorrelativo = `${asiento.subdiario_codigo}${mesStr}${String(correlativoNum).padStart(4, '0')}`;

      const updateRes = await client.query(`
        UPDATE asientos SET
          numero = $1, estado = 'CONTABILIZADO', version = version + 1,
          updated_by = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `, [numeroCorrelativo, userId, asientoId]);

      // Al ejecutar COMMIT se dispara trg_asiento_partida_doble -> fn_validar_partida_doble()
      await client.query('COMMIT');
      return updateRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  // ...
}
```

### 11.4. Prevalidación con `Money` y Nomenclatura Oficial PLE 5.2 (`server/services/pleExportService.ts`)

```typescript
// Prevalidación de cuadre contable exacto con decimal.js (Money)
let cuadreContableOk = true;
for (const a of asientosPeriodo) {
  if (a.estado === 'CONTABILIZADO') {
    const totalD = (a.detalles || []).reduce((acc: any, d: any) => Money.add(acc, d.debe || 0), Money.create(0));
    const totalH = (a.detalles || []).reduce((acc: any, d: any) => Money.add(acc, d.haber || 0), Money.create(0));
    if (!Money.isEqual(totalD, totalH)) {
      cuadreContableOk = false;
      break;
    }
  }
}

// Nomenclatura oficial de 33 caracteres antes de .txt y hash SHA-256
const tieneContenido = (lineas.length > 0 && !opciones.sinMovimiento) ? '1' : '0';
const nombreArchivoOficial = `LE${ruc}${anio}${mes}00${codigoLibro}00${indOperacionStr}${tieneContenido}${indMonedaNum}1.txt`;
const nombreArchivoFinal = !esModoOficial ? `VISTA_PREVIA_${nombreArchivoOficial}` : nombreArchivoOficial;

const contenidoTxt = lineas.length > 0 ? lineas.join('\r\n') : '';
const hashSha256 = crypto.createHash('sha256').update(contenidoTxt, 'utf8').digest('hex');
```

### 11.5. Cruce Multimoneda y Tolerancias con `Money` en Conciliador SIRE (`server/services/conciliadorSireService.ts`)

```typescript
// Manejo de Multimoneda (USD / PEN) con precisión exacta decimal.js (Money)
let totalSunatPen = Money.round(p.total);
let baseSunatPen = Money.round(p.baseGravada);
let igvSunatPen = Money.round(p.igv);

let totalSistemaPen = Money.round(match.total || 0);
let baseSistemaPen = Money.round(match.baseGravada || 0);
let igvSistemaPen = Money.round(match.igv || 0);

if (p.moneda === 'USD' && match.moneda === 'PEN') {
  const tc = Money.create(p.tipoCambio || match.tipoCambio || 1.0);
  totalSunatPen = Money.mul(p.total, tc);
  baseSunatPen = Money.mul(p.baseGravada, tc);
  igvSunatPen = Money.mul(p.igv, tc);
} else if (p.moneda === 'PEN' && match.moneda === 'USD') {
  const tc = Money.create(match.tipoCambio || p.tipoCambio || 1.0);
  totalSistemaPen = Money.mul(totalSistemaPen, tc);
  baseSistemaPen = Money.mul(baseSistemaPen, tc);
  igvSistemaPen = Money.mul(igvSistemaPen, tc);
}

if (esNotaCredito) {
  if (totalSistemaPen.isNegative() && totalSunatPen.isPositive()) totalSunatPen = totalSunatPen.negated();
  if (baseSistemaPen.isNegative() && baseSunatPen.isPositive()) baseSunatPen = baseSunatPen.negated();
  if (igvSistemaPen.isNegative() && igvSunatPen.isPositive()) igvSunatPen = igvSunatPen.negated();
}

const difTotal = Money.sub(totalSistemaPen, totalSunatPen).abs();
const difBase = Money.sub(baseSistemaPen, baseSunatPen).abs();
const difIgv = Money.sub(igvSistemaPen, igvSunatPen).abs();

const cuadraImporte =
  difTotal.lessThanOrEqualTo(Money.create(tolTotal)) &&
  difBase.lessThanOrEqualTo(Money.create(tolBase)) &&
  difIgv.lessThanOrEqualTo(Money.create(tolIgv));
```

---

## 12. RECOMENDACIONES ARQUITECTÓNICAS (ALINEADAS CON EL BACKLOG SECCIÓN 7)

### 12.1. Próximas Acciones de Mayor Impacto (Sin Ítems Ya Implementados)

1. **[P0] Completar Persistencia SQL en SIRE, PLE y Planillas:** Sustituir las lecturas/escrituras sobre `*_MEMORIA` en `pleExportService.ts`, `conciliadorSireService.ts`, `sireService.ts`, `historialGeneracionesService.ts` y `planillaService.ts` por consultas parametrizadas a PostgreSQL, garantizando persistencia tras reinicio conforme a `AGENTS.md`.
2. **[P0] Certificación de Integración en PostgreSQL 15+ Real (`npm run test:pg` y `npm run test:infra`):** Provisionar la base `atlob_test` en CI/local para ejecutar de forma obligatoria RLS (`NOBYPASSRLS`), `trg_asiento_partida_doble` e ida y vuelta de respaldos sobre PostgreSQL real.
3. **[P0] Homologación Operativa con Credenciales y Validadores Reales de SUNAT:** Probar el adaptador OAuth2 REST de `sunatGateway.ts` contra `https://api-seguridad.sunat.gob.pe` con credenciales reales y validar archivos generados en PLE 5.2 Desktop, PDT PLAME v4.0 y PVS T-Registro.
4. **[P1] Fase 7 — Inventarios, Kardex Valorado (Libros PLE 12.1 y 13.1) y Activos Fijos (Libro 7.1):** Habilitar vistas operativas y asientos automáticos de costo de ventas y depreciación una vez cerrada la Fase 6.
5. **[P1] Conector de Recepción desde el Facturador Atlob:** Integrar la ingesta automática de CPE emitidos hacia `comprobantes_venta`.
6. **[P2] Importador Bancario OFX / Extractos Locales y Caché Local de Padrón RUC:** Acelerar conciliación bancaria y autocompletado de anexos.
7. **[P3] Empaquetado de Escritorio con Tauri 2.0 y Portal de Cliente Solo Lectura:** Distribución nativa para estaciones contables y consulta externa controlada.

### 12.2. Dictamen Arquitectónico: Qué Conservar y Qué Mejorar

- **Conservar íntegramente:** El motor de partida doble (`trg_asiento_partida_doble` + `Money`), la lista declarativa única `REGISTRO_DATOS_EMPRESA` con exclusión criptográfica de secretos en respaldos, el motor de reportes `formatoEstandarEngine.ts`, la separación 1:1 de vistas en `MENU_DATA` y el desacoplamiento entre SIRE (`/api/sire`), PLE (`/api/ple`), Tributos y Planillas.
- **Mejorar antes de avanzar a Fase 7:** Eliminar toda dependencia remanente de arreglos `*_MEMORIA` cuando PostgreSQL está conectado y exigir la ejecución de `npm run test:pg` en un entorno PostgreSQL 15+ real.

---

## 13. VERIFICACIÓN NORMATIVA Y CÁLCULOS EXACTOS DE PLANILLAS (FASE 5B)

### 13.1. Parámetros Laborales y Tributarios 2026 (`server/repositories/parametroRepository.ts`)

Si falta un parámetro vigente para el período consultado, el motor bloquea el cálculo lanzando `CALCULO_BLOQUEADO_PARAMETRO_FALTANTE`. Todas las URLs apuntan a portales institucionales verificables y los datos sin número de circular/decreto abierto se marcan explícitamente como **`Pendiente de validar`**:

| Parámetro | Código en Repositorio | Valor | Vigencia | Fuente Oficial / Estado de Validación |
| --- | --- | --- | --- | --- |
| **RMV (Tramo hasta Sep-2026)** | `RMV` | `S/ 1,130.00` | `2025-01-01` a `2026-09-30` | D.S. N° 006-2024-TR — [ Diario Oficial El Peruano ](https://busquedas.elperuano.pe) |
| **RMV (Vigente desde Oct-2026)** | `RMV` | `S/ 1,230.00` | `2026-10-01` en adelante | D.S. N° 015-2026-TR — [ Diario Oficial El Peruano ](https://busquedas.elperuano.pe) |
| **RMV Segundo Tramo (Sin fecha)** | `RMV_SEGUNDO_TRAMO_PENDIENTE` | `S/ 1,300.00` | **Inactivo (`9999-12-31`)** | **`Pendiente de validar`** (sin decreto de entrada en vigencia; bloqueado para cálculo) |
| **Asignación Familiar** | `TASA_ASIGNACION_FAMILIAR` | `10%` de RMV del mes de pago | Permanente | Ley N° 25129 Arts. 1° y 2° (`S/ 113.00` hasta sep-2026; `S/ 123.00` desde oct-2026) |
| **UIT Ejercicio 2026** | `UIT` / `UIT_2026` | `S/ 5,500.00` | `2026-01-01` a `2026-12-31` | D.S. N° 301-2025-EF — [ Tabla UIT SUNAT ](https://www.sunat.gob.pe/indicestasas/uit.html) |
| **Prima de Seguro AFP** | `TASA_PRIMA_SEGURO_AFP` | **`1.37%`** *(reemplaza `1.84%`)* | `2025-01-01` en adelante | [ Portal SBS Comisiones y Primas SPP ](https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx) *(N° exacto de circular SISCO: **`Pendiente de validar`**)* |
| **Tope RMA SBS 2026 Q1** | `TOPE_PRIMA_SEGURO_AFP` | `S/ 12,209.11` | `2026-01-01` a `2026-03-31` | [ Portal SBS SPP ](https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx) *(N° exacto de circular trimestral: **`Pendiente de validar`**)* |
| **Tope RMA SBS 2026 Q2** | `TOPE_PRIMA_SEGURO_AFP` | `S/ 12,598.91` | `2026-04-01` a `2026-06-30` | [ Portal SBS SPP ](https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx) *(N° exacto de circular trimestral: **`Pendiente de validar`**)* |
| **Tope RMA SBS 2026 Q3** | `TOPE_PRIMA_SEGURO_AFP` | `S/ 12,672.65` | `2026-07-01` a `2026-09-30` | [ Portal SBS SPP ](https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx) *(N° exacto de circular trimestral: **`Pendiente de validar`**)* |
| **Tope RMA SBS 2026 Q4** | `TOPE_PRIMA_SEGURO_AFP` | `S/ 12,732.70` | `2026-10-01` a `2026-12-31` | [ Portal SBS SPP ](https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx) *(N° exacto de circular trimestral: **`Pendiente de validar`**)* |
| **Comisión Flujo AFP (4 AFPs)** | `AFP_*_COMISION_FLUJO` | Habitat `1.47%`, Integra `1.55%`, Prima `1.60%`, Profuturo `1.69%` | Vigente Oct-2026 | [ Portal SBS Comisiones SPP ](https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx) |
| **Comisión Mixta Flujo AFP** | `AFP_*_COMISION_MIXTA_FLUJO` | Habitat `0.23%`, Integra `0.00%`, Prima `0.18%`, Profuturo `0.20%` | Parametrizable | **`Pendiente de validar`** contra boletín mensual SBS vigente (componente sobre flujo en esquema mixto) |
| **Aporte Fondo AFP / ONP / EsSalud** | `TASA_FONDO_AFP` / `ONP` / `ESSALUD` | Fondo AFP `10.00%`, ONP `13.00%`, EsSalud `9.00%` | Permanente | D.S. N° 054-97-EF / D.L. N° 19990 / Ley N° 26790 |
| **Escala Renta 5ta Categoría** | `QUINTA_DEDUCCION_UIT` y tramos | Deducción `7 UIT`; tasas `8%` ($\le 5$), `14%` ($5$–$20$), `17%` ($20$–$35$), `20%` ($35$–$45$), `30%` ($>45\text{ UIT}$) | Permanente | Arts. 46° y 53° TUO Ley del Impuesto a la Renta (D.S. N° 179-2004-EF) — [ SUNAT ](https://orientacion.sunat.gob.pe) |
| **Tasas PDT 621 (IGV y Renta)** | `TASA_IGV`, `TASA_RENTA_*` | IGV `18%` (16% + 2% IPM); RMT `1.0%` ($\le 300\text{ UIT}$); RG mín. `1.5%`; RER `1.5%` | Permanente | Art. 17° TUO LIGV (D.S. N° 055-99-EF), D.Leg. N° 1269 y Art. 85° TUO LIR |

---

### 13.2. Los 6 Casos Dorados Recalculados Exactamente (Verificados en `run_tests_fase5_planillas.ts` Paso 9)

Cada cifra siguiente se compara mediante `assert.strictEqual` contra el resultado calculado en tiempo de ejecución por `planillaService.ts` en `server/tests/run_tests_fase5_planillas.ts`:

#### Caso Dorado 1: Transición de RMV y Retención de 5ta Categoría (Sep-2026 vs Oct-2026)

- **Datos comunes:** Régimen General, ingreso `01/01/2026`, sueldo básico `S/ 5,000.00`, asignación familiar activa (`1` carga), UIT 2026 = `S/ 5,500.00`.
- **1A — Período Setiembre 2026 (`RMV = S/ 1,130.00`, `AF = S/ 113.00`):**
  - `Remuneración mensual Sep = 5,000.00 + 113.00 = S/ 5,113.00`
  - `Remuneraciones anteriores Ene-Ago (8 meses × 5,113.00) = S/ 40,904.00`
  - `Proyección ordinaria Oct-Dic (3 meses × 5,113.00) = S/ 15,339.00` (Total ordinario = `S/ 61,356.00`)
  - `Gratificaciones Jul (5,113.00) + Dic proyectada (5,113.00) = S/ 10,226.00`
  - `Bonificación Extraordinaria 9% (Ley 30334) = 10,226.00 × 0.09 = S/ 920.34`
  - `Renta Bruta Anual Proyectada = 61,356.00 + 10,226.00 + 920.34 = S/ 72,502.34`
  - `Deducción 7 UIT (7 × 5,500.00) = S/ 38,500.00` → `Renta Neta = 72,502.34 - 38,500.00 = S/ 34,002.34`
  - `Impuesto Anual = (27,500.00 × 0.08 = 2,200.00) + (6,502.34 × 0.14 = 910.33) = S/ 3,110.33`
  - `Retenciones acumuladas Ene-Ago = S/ 2,073.55` → `Saldo = 3,110.33 - 2,073.55 = S/ 1,036.78`
  - **`Retención Setiembre (Divisor 4) = 1,036.78 / 4 = S/ 259.20`**
- **1B — Período Octubre 2026 (`RMV = S/ 1,230.00`, `AF = S/ 123.00`):**
  - `Remuneración mensual Oct = 5,000.00 + 123.00 = S/ 5,123.00`
  - `Remuneraciones históricas Ene-Sep (9 meses con RMV 1,130 -> 9 × 5,113.00) = S/ 46,017.00`
  - `Proyección ordinaria Nov-Dic (2 meses × 5,123.00) = S/ 10,246.00` (Total ordinario = `46,017.00 + 5,123.00 + 10,246.00 = S/ 61,386.00`)
  - `Gratificaciones: Julio histórica (5,113.00) + Diciembre vigente (5,123.00) = S/ 10,236.00`
  - `Bonificación Extraordinaria 9%: Jul (460.17) + Dic (461.07) = S/ 921.24`
  - `Renta Bruta Anual Proyectada = 61,386.00 + 10,236.00 + 921.24 = S/ 72,543.24`
  - `Deducción 7 UIT = S/ 38,500.00` → `Renta Neta = 72,543.24 - 38,500.00 = S/ 34,043.24`
  - `Impuesto Anual = 2,200.00 + ((34,043.24 - 27,500.00 = 6,543.24) × 0.14 = 916.05) = S/ 3,116.05`
  - `Retenciones acumuladas Ene-Sep (Ene-Ago 2,073.55 + Setiembre 259.20) = S/ 2,332.75`
  - `Saldo por retener Q4 = 3,116.05 - 2,332.75 = S/ 783.30`
  - **`Retención Octubre (Divisor 3) = 783.30 / 3 = S/ 261.10`**
  - *(Nota técnica: Mientras el texto literal del Art. 40° inc. e) del Rgto. de la LIR agrupa setiembre-noviembre con divisor 4 sobre retenciones a agosto, `planillaService.obtenerDivisorQuintaCategoria` aplica liquidación progresiva en el último trimestre [`Sep=4` sobre Ene-Ago, `Oct=3` sobre Ene-Sep, `Nov=2` sobre Ene-Oct, `Dic=1` sobre Ene-Nov] para distribuir uniformemente aumentos salariales de octubre y cerrar diciembre sin salto de redondeo: `2,332.75 + 261.10 + 261.10 + 261.10 = 3,116.05`).*

#### Caso Dorado 2: Sueldo Alto (`S/ 15,000.00`) en AFP Integra Flujo (Q4 2026) vs ONP

- **AFP Integra Comisión sobre Flujo (Oct-Dic 2026):**
  - `Aporte obligatorio al fondo (10.00%) = 15,000.00 × 0.10 = S/ 1,500.00`
  - `Comisión sobre flujo Integra (1.55%) = 15,000.00 × 0.0155 = S/ 232.50`
  - `Prima de seguro AFP (1.37% sobre tope RMA Q4 S/ 12,732.70) = 12,732.70 × 0.0137 = S/ 174.44`
  - **`Total descuento AFP = 1,500.00 + 232.50 + 174.44 = S/ 1,906.94`**
- **ONP (13.00% sin tope):**
  - **`Aporte ONP = 15,000.00 × 0.13 = S/ 1,950.00`** *(diferencia a favor del neto en AFP: `S/ 43.06`)*.

#### Caso Dorado 3: Ingreso a Mitad de Año (`01/08/2026`) con Certificado Previo y Deducción 3 UIT en Diciembre

- **Datos:** Sueldo `S/ 6,000.00` (sin AF), certificado de empleador anterior Ene–Jul con remuneraciones `S/ 35,000.00` y retenciones `S/ 2,100.00`, deducción adicional sustentada de gastos personales Art. 46° LIR = `S/ 5,000.00` ($\le 3\text{ UIT} = \text{S/ } 16,500.00$).
- **Cálculo numérico paso a paso (Regularización Diciembre 2026, Divisor `1`):**
  - `Remuneraciones nuevo empleador Ago-Dic (5 meses × 6,000.00) = S/ 30,000.00`
  - `Remuneraciones acreditadas empleador anterior (Ene-Jul) = S/ 35,000.00`
  - `Gratificación Diciembre proporcional (5 meses completos Ago-Dic: 5/6 × 6,000.00) = S/ 5,000.00`
  - `Bonificación Extraordinaria 9% (5,000.00 × 0.09) = S/ 450.00`
  - `Renta Bruta Anual Total = 30,000.00 + 35,000.00 + 5,000.00 + 450.00 = S/ 70,450.00`
  - `Deducciones legales = 38,500.00 (7 UIT) + 5,000.00 (gastos personales Art. 46° LIR) = S/ 43,500.00`
  - `Renta Neta Anual Imponible = 70,450.00 - 43,500.00 = S/ 26,950.00` (íntegramente en Tramo 1 $\le 27,500.00$)
  - `Impuesto Anual Determinado (8%) = 26,950.00 × 0.08 = S/ 2,156.00`
  - `Retenciones aplicadas Ene-Nov = 2,100.00 (empleador previo) + 44.80 (4 cuotas Ago-Nov × S/ 11.20) = S/ 2,144.80`
  - **`Retención de Regularización Diciembre (Divisor 1) = 2,156.00 - 2,144.80 = S/ 11.20`**

#### Caso Dorado 4: Gratificación Legal Diciembre 2026 (`RMV = S/ 1,230.00`, `AF = S/ 123.00`)

- **Régimen General (Sueldo `S/ 3,500.00` + AF `S/ 123.00` = `S/ 3,623.00`, 6 meses Jul–Dic):**
  - `Gratificación ordinaria = S/ 3,623.00` | `Bonif. 9% = S/ 326.07` | **`Total Neto = S/ 3,949.07`** (inafecto de ONP/AFP).
- **MYPE Pequeña Empresa (Sueldo `S/ 2,400.00`, 50% de ley):**
  - `Gratificación = S/ 1,200.00` | `Bonif. 9% = S/ 108.00` | **`Total Neto = S/ 1,308.00`**.
- **MYPE Microempresa (Sueldo `S/ 2,000.00`):** **`S/ 0.00`** (excluido por TUO Ley MYPE D.S. N° 013-2013-PRODUCE).

#### Caso Dorado 5: CTS Noviembre 2026 (Semestre Mayo–Octubre 2026)

- **Datos al 31/10/2026 (D.S. N° 001-97-TR Arts. 9°, 10° y 16°):** Sueldo `S/ 3,500.00` + `AF = S/ 123.00` = `S/ 3,623.00`; gratificación percibida de `S/ 3,623.00`.
- `Sexto de gratificación = round(3,623.00 / 6, 2) = S/ 603.83`
- `Remuneración Computable CTS = 3,623.00 + 603.83 = S/ 4,226.83`
- **`Depósito Semestral CTS (6 meses completos: 4,226.83 × 6 / 12) = S/ 2,113.42`**

#### Caso Dorado 6: Liquidación de Beneficios Sociales (LBS) al `15/10/2026`

- **Datos:** Ingreso `01/01/2026`, cese `15/10/2026` (`9` meses y `15` días de récord en el año), sueldo `S/ 3,000.00`, `AF = S/ 123.00` (`Base = S/ 3,123.00`), afiliado a `ONP (13%)`.
- **Regla normativa sobre la fracción de 15 días de octubre y afectación previsional:**
  1. **Remuneración del mes de cese:** 15 días de sueldo (`3,000.00 × 15 / 30 = 1,500.00`) + asignación familiar íntegra (`123.00`) = **`S/ 1,623.00`** *(**afecta** a ONP/AFP)*.
  2. **Vacaciones truncas (D.Leg. N° 713 Art. 22° y D.S. N° 012-92-TR Art. 23° — sí computa meses y días):** `9` meses y `15` días = `285` días → `3,123.00 × (285 / 360)` = **`S/ 2,472.38`** *(**afecta** a ONP/AFP por constituir remuneración vacacional)*.
  3. **Gratificación trunca (Ley N° 27735 Art. 7° y D.S. N° 005-2002-TR Art. 5° num. 5.2 — solo meses calendario completos):** los 15 días de octubre **no** se computan; solo entran Julio, Agosto y Setiembre (`3` meses completos) → `3,123.00 × (3 / 6)` = **`S/ 1,561.50`**, más **Bonificación Extraordinaria 9% (Ley N° 30334)** = `1,561.50 × 0.09` = **`S/ 140.54`**. **Regla de afectación:** tanto la gratificación trunca como la bonificación extraordinaria 9% están **INAFECTAS de aportes a ONP, AFP y EsSalud** de forma permanente según los Arts. 1° y 3° de la Ley N° 30334 y el D.S. N° 012-2016-TR.
  4. **CTS trunca (D.S. N° 001-97-TR Art. 21° — sí computa meses y días del semestre May–Oct):** `5` meses y `15` días = `165` días sobre base CTS (`3,123.00 + 3,123.00 / 6 = 3,643.50`) → `3,643.50 × (165 / 360)` = **`S/ 1,669.94`** *(**inafecta** de ONP/AFP)*.
- **Totales y Retención ONP:**
  - `Total Beneficios Brutos = 1,623.00 + 2,472.38 + 1,561.50 + 140.54 + 1,669.94 = S/ 7,467.36`
  - `Base Afecta Previsional (Remuneración mes cese + Vacaciones truncas) = 1,623.00 + 2,472.38 = S/ 4,095.38`
  - `Descuento ONP (13%) = 4,095.38 × 0.13 = S/ 532.40`
  - **`Neto Total a Pagar LBS = 7,467.36 - 532.40 = S/ 6,934.96`**

---

### 13.3. Tabla Única Oficial de Estructuras PDT PLAME 0601 y T-Registro

Base legal unificada en todas las secciones del documento y en el código (`planillaService.ts`, `ExportarPlameView.tsx`, `TRegistroView.tsx`): **Anexo 3 de la R.M. N° 121-2011-TR y modificatorias (incluida R.S. N° 016-2022/SUNAT — PDT PLAME v4.0+)**:

| Aplicativo / Paquete | Extensión | N° Estructura Anexo 3 | Nomenclatura de Archivo | Contenido Oficial |
| --- | :---: | :---: | --- | --- |
| **T-Registro** (`RP_{RUC}.zip`) | `.ide` | **Estructura 04** | `RP_{RUC}.ide` | Datos de identificación de personas naturales registradas |
| **T-Registro** (`RP_{RUC}.zip`) | `.tra` | **Estructura 05** | `RP_{RUC}.tra` | Datos laborales, régimen, categoría ocupacional y sistema pensionario |
| **T-Registro** (`RP_{RUC}.zip`) | `.per` | **Estructura 11** | `RP_{RUC}.per` | Períodos laborales (fechas de inicio, fin y motivo de baja) |
| **T-Registro** (`RP_{RUC}.zip`) | `.est` | **Estructura 17** | `RP_{RUC}.est` | Establecimientos propios o de terceros donde labora el trabajador |
| **PLAME 0601** (`0601{AAAA}{MM}{RUC}.zip`) | `.jor` | **Estructura 14** | `0601{AAAA}{MM}{RUC}.jor` | Jornada laboral (horas ordinarias y sobretiempo) |
| **PLAME 0601** (`0601{AAAA}{MM}{RUC}.zip`) | `.snl` | **Estructura 15** | `0601{AAAA}{MM}{RUC}.snl` | Días subsidiados y otros no laborados y no subsidiados (Tabla 21) |
| **PLAME 0601** (`0601{AAAA}{MM}{RUC}.zip`) | `.rem` | **Estructura 18** | `0601{AAAA}{MM}{RUC}.rem` | Ingresos, remuneraciones y **descuentos del trabajador** (`01xx` a `07xx`) |
| **PLAME 0601** (`0601{AAAA}{MM}{RUC}.zip`) | `.4ta` | **Estructura 20** | `0601{AAAA}{MM}{RUC}.4ta` | Prestadores de servicios con rentas de cuarta categoría |
| **PLAME 0601** (`0601{AAAA}{MM}{RUC}.zip`) | `.or5` | **Estructura 22** | `0601{AAAA}{MM}{RUC}.or5` | Rentas y retenciones de 5ta categoría de otros empleadores *(cuando aplique)* |
| **PLAME 0601** (`0601{AAAA}{MM}{RUC}.zip`) | `.toc` | **Estructura 26** | `0601{AAAA}{MM}{RUC}.toc` | Tasas y otras condiciones de asegurados especiales / SCTR |

- **Aclaración de auditoría:** La extensión `.des` **no existe** en el Anexo 3 de SUNAT y fue retirada definitivamente; los descuentos del trabajador viajan dentro de `.rem` (Estructura `18`). Asimismo, los listados `altas`, `bajas` y `modificaciones` en `TRegistroView.tsx` son vistas internas JSON de control del estudio y no reemplazan a `.ide`/`.tra`/`.per`/`.est` dentro de `RP_{RUC}.zip`.

---

### 13.4. Estado Real de Componentes de Planillas (`server/services/planillaService.ts`)

| Componente | Estado Real | Evidencia Real de Código y Pruebas |
| --- | :---: | --- |
| **Padrón de Trabajadores y Ley N° 29733** | `[COMPLETO]` | `planillaService.crearTrabajador`: cuentas bancarias cifradas con AES-256-GCM, enmascaramiento según rol y validación contra RMV vigente. |
| **Planilla Mensual, Gratificaciones, CTS y LBS** | `[COMPLETO]` | Consolidados íntegramente en `server/services/planillaService.ts` (eliminada subcarpeta muerta `server/services/planilla/`). Cubiertos por los 6 Casos Dorados en `run_tests_fase5_planillas.ts`. |
| **Boletas de Pago PDF** | `[COMPLETO]` | `formatoEstandarEngine.ts`: generación individual y por lote verificada con cabecera `%PDF` en `run_tests_fase5_planillas.ts` (Paso 12). |
| **Asiento Contable por Centro de Costos** | `[COMPLETO]` | `planillaService` + `asientoService`: cuentas `6211`, `6271`, `4031`, `4032`, `407`, `40173`, `4111` y destino `921`/`941`/`951` vs `791`. |
| **Transmisión Directa Automatizada de Planillas a SOL** | `[NO INCLUIDA]` | SUNAT no ofrece API REST pública para presentar el PDT PLAME 0601; la presentación oficial se realiza cargando los paquetes `0601{AAAA}{MM}{RUC}.zip` y `RP_{RUC}.zip` generados por el sistema. *(Para APIs SIRE, las credenciales sí se guardan cifradas en `sunat_conexiones` según la Sección 8).* |

---

## 14. AUDITORÍA DE REGISTROS ELECTRÓNICOS (FASE 6: SIRE Y PLE 5.2) Y CRITERIOS DE CIERRE

### 14.1. Desacoplamiento de Submódulos SIRE y PLE

1. **Submódulo SIRE (`/api/sire`):** `sireRoutes.ts`, `sireController.ts`, `sireService.ts`, `conciliadorSireService.ts`, `sireLayoutService.ts`, `sireApi.ts`, `useSire.ts`, `SireConciliadorView.tsx` y `SireAjustesReemplazoView.tsx`.
2. **Submódulo PLE 5.2 (`/api/ple`):** `pleRoutes.ts`, `pleController.ts`, `pleExportService.ts`, `archivoValidadorService.ts`, `historialGeneracionesService.ts`, `pleApi.ts`, `usePle.ts` y `LibrosElectronicosView.tsx`.
3. **Cero lógica tributaria en vistas y precisión decimal:** Los cálculos de conversión cambiaria, diferencias, tolerancias y sumas de control se ejecutan en los servicios backend utilizando `Money` (`decimal.js`).

### 14.2. Seguridad Criptográfica y Bloqueo de Modo `[SIMULADO]`

- **Cifrado y Exclusión de Respaldo:** Conforme a la declaración unificada de la Sección 8, `sunat_conexiones` cifra `Clave SOL`, `client_id` y `client_secret` con AES-256-GCM bajo `SUNAT_ENCRYPTION_KEY` (fuera de Git y fuera de todo respaldo `.zip`).
- **Bloqueo `[SIMULADO]`:** Verificado en servicio (`conciliadorSireService`), rutas (`sireRoutes`) y pruebas (`run_tests_fase6.ts` líneas `106` y `114`): ninguna propuesta con `esSimulado = true` puede aceptarse ni exportarse como reemplazo oficial para SUNAT SOL (`OPERACION_SIMULADA_BLOQUEADA`).

### 14.3. Seguridad XML UBL 2.1 Anti-XXE y Cola Asíncrona

- **`xmlImportService.ts`:** Rechaza con `ATAQUE_XXE_DETECTADO` cualquier documento XML que contenga declaraciones `<!DOCTYPE` o `<!ENTITY`, limita la profundidad de nodos y previene expansión exponencial.
- **`sunatJobsService.ts`:** Procesa descargas y generaciones asíncronas con retroceso exponencial (`2000 * Math.pow(2, intento)`) y registro de hash SHA-256 final.

### 14.4. Delimitación entre Verificación Local y Pendientes Externos / de Persistencia

| Componente | Estado Actual | Verificación Ejecutada | Requisito Pendiente Antes de Cierre |
| --- | :---: | --- | --- |
| **PLE 5.2 (`050100`, `060100`, `080100`, `080200`, `140100`, `010100`, `010200`)** | `[VERIFICADO EN MEMORIA]` | `80/80` en `test:fase6` (PEN, USD, sin movimiento pos. 31, acentos, pipes, NC negativas) | Migrar lecturas/escrituras de `*_MEMORIA` a SQL PostgreSQL y validar TXT en aplicativo PLE 5.2 de escritorio. |
| **Conciliador SIRE y Layouts RCE/RVIE (Anexos 8, 11, 2/3, 4/5)** | `[VERIFICADO EN MEMORIA]` | `80/80` en `test:fase6` (CAR 27 dígitos, `Money`, NC, USD, duplicados, ajuste `6591`/`7591`) | Migrar `sire_propuestas` y `sire_conciliaciones` a consultas SQL reales y validar ZIP en portal SUNAT SOL. |
| **Cliente OAuth2 REST SIRE (`sunatGateway.ts`)** | `[VERIFICADO EN SIMULACIÓN]` | Tickets `01`, `02`, `03` y bloqueo `[SIMULADO]` | Homologar en vivo contra `https://api-seguridad.sunat.gob.pe` con credenciales reales de contribuyente. |
| **Trigger `trg_asiento_partida_doble` y RLS Multiempresa** | `[CÓDIGO Y TEST LISTOS]` | Prueba escrita en `test_pg_rls_planillas.ts` (Pasos 1–10) | Ejecutar `npm run test:pg` contra una instancia PostgreSQL 15+ activa (`TEST_DATABASE_URL` con sufijo `_test`). |

### 14.5. Cumplimiento de Neutralidad Terminológica (`AGENTS.md`)

Se auditó el código fuente, nombres de archivos, rutas, comentarios y documentación verificando el uso exclusivo de denominaciones contables neutrales peruanas (*Registro de Compras*, *Registro de Ventas*, *Libro Diario*, *Libro Mayor*, *formato estándar*) y **cero menciones a marcas de software contable de terceros**.

### 14.6. Dictamen Técnico y Estado de Cierre

- **`npm run lint` (`tsc --noEmit`):** Código de salida `0` (0 errores de tipado).
- **`npm run test:fase6`:** `80/80` pruebas exitosas — Código de salida `0`.
- **`npm test` (`run_all_tests.ts`):** `23/23` suites exitosas en `91.66s` — Código de salida `0`.
- **`npm run build` (`vite build`):** Compilación de producción exitosa — Código de salida `0`.
- **`npm run test:pg`:** Código de salida `1` en este entorno por ausencia de instancia PostgreSQL 15+ configurada en `TEST_DATABASE_URL`.
- **Veredicto sobre Fase 6:** **FASE 6 EN VERIFICACIÓN — NO CERRADA AÚN.** No se marca la Fase 6 como cerrada ni se avanza a la Fase 7 hasta completar: (1) la migración de `pleExportService`, `conciliadorSireService` y `sireService` desde arreglos `*_MEMORIA` hacia tablas SQL persistentes de PostgreSQL conforme a `AGENTS.md`, (2) la ejecución con código `0` de `npm run test:pg` y `npm run test:infra` sobre PostgreSQL 15+ real, y (3) la validación externa de layouts y endpoints con herramientas/credenciales oficiales de SUNAT.
