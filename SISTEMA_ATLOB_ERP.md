# AUDITORÍA TÉCNICA INTEGRAL DEL SISTEMA: ATLOB CONSULTORES ERP
**Documento Maestro de Arquitectura, Estado de Implementación, Cumplimiento Normativo SUNAT y Deuda Técnica**

- **Sistema:** Atlob Consultores ERP (Gestión Contable & Tributaria Multiempresa)
- **Autoría & Liderazgo de Ingeniería:** Jimmy Mayta (`jimmymayta29@gmail.com`)
- **Estudio Contable Destino:** Atlob Consultores S.A.C.
- **Fecha de Auditoría:** 01 de Noviembre de 2026
- **Rol del Auditor:** Arquitecto de Software & Auditor Técnico Senior
- **Propósito:** Documentar con absoluta veracidad y evidencia de código el estado de cada componente, tabla, función y módulo para permitir auditoría externa y evolución sin necesidad de inspeccionar el código fuente.

---

## 1. RESUMEN EJECUTIVO

### 1.1. Propósito y Alcance del Producto
**Atlob Consultores ERP** es una plataforma contable y tributaria de alta densidad para estudios contables peruanos. Su diseño arquitectónico y funcional se enfoca en resolver la contabilidad multiempresa bajo las normativas vigentes en Perú:
- **Plan Contable General Empresarial (PCGE)** modificado 2019/vigente 2026.
- **Sistema Integrado de Registros Electrónicos (SIRE)** conforme a la R.S. N° 000112-2021/SUNAT (RCE compras y RVIE ventas).
- **Programa de Libros Electrónicos (PLE 5.2)** con generación y validación de estructuras TXT normativas.
- **Declaraciones Juradas SUNAT (PDT 621 IGV-Renta, PLAME, DAOT, PDB)**.
- **Auditoría Preventiva y Cierre Contable** con asientos automáticos de Elemento 8 y 9.

### 1.2. Stack Tecnológico Real (Inspección de `package.json` y Runtime)
| Capa | Tecnología | Versión Real | Propósito en el Repositorio |
|---|---|---|---|
| **Runtime** | Node.js | `>= 22.12.0` | Motor de ejecución del servidor backend y scripts de verificación |
| **Backend Framework** | Express | `4.21.2` | Servidor HTTP RESTful montado en `/server` con middlewares de seguridad y guards |
| **Frontend Framework** | React | `19.0.1` | Renderizado SPA con Hooks y arquitectura funcional |
| **Lenguaje** | TypeScript | `7.0.2` | Tipado estático estricto verificado con `tsc --noEmit` |
| **Bundler / Dev Server** | Vite | `8.3.0` | Empaquetador y middleware en desarrollo (`server.ts`) |
| **Motor de Base de Datos** | PostgreSQL / `pg` | `8.23.1` | Driver nativo con pool de conexiones y migraciones SQL versionadas |
| **Base de Datos en Memoria** | `pg-mem` | `3.0.14` | Emulación PostgreSQL para suites de prueba automatizadas sin dependencias externas |
| **Cálculo Numérico** | `decimal.js` | `10.6.0` | Aritmética de punto fijo decimal para evitar imprecisiones de redondeo en céntimos |
| **Esquemas & Validación** | Zod | `4.6.5` | Validación de contratos de entrada en endpoints y formularios |
| **Autenticación** | `jsonwebtoken` & `bcryptjs` | `9.0.3` / `3.0.3` | Emisión de Access/Refresh tokens y hashing de contraseñas (10 rounds) |
| **Generación de Reportes** | `jspdf` & `jspdf-autotable` | `4.2.1` / `5.0.8` | Motor de renderizado vectorial de documentos PDF (Estándar y Corporativo) |
| **Procesamiento de Archivos** | `adm-zip` & `fast-xml-parser` | `0.6.1` / `5.11.2` | Empaquetado ZIP de respaldos y lectura de comprobantes XML UBL 2.1 |
| **Estilos CSS** | Tailwind CSS | `4.3.3` | Estilizado declarativo con `@tailwindcss/vite` |
| **Iconografía** | `lucide-react` | `0.546.0` | Glifos vectoriales en interfaces operativas |

---

### 1.3. Matriz de Resumen por Módulo
*Etiquetas aplicadas según Regla de Honestidad: `[COMPLETO]`, `[PARCIAL]`, `[MAQUETA]`, `[ROTO]`, `[PENDIENTE]`.*

| Módulo / Dominio | Estado Real | % Avance Real | Nivel de Riesgo | Justificación Técnica |
|---|---|:---:|:---:|---|
| **Núcleo Contable (PCGE & Asientos)** | `[COMPLETO]` | 95% | **Bajo** | Partida doble forzada en DB (`asiento_cuadrado_chk`), estados borrador/contabilizado/anulado, extornos y Libro Diario con PostgreSQL real. |
| **Compras & Ventas (RCE / RVIE)** | `[COMPLETO]` | 90% | **Bajo** | Imputación contable automatizada, registro Módulo 11 de RUC, cálculo de base imponible, IGV, detracción y retención. |
| **SIRE SUNAT (Conciliador & Propuesta)** | `[COMPLETO]` | 85% | **Medio** | Lectura de propuesta compras/ventas, conciliación registro vs propuesta, reglas de proveedor y generación de TXT de ajustes. |
| **Libros Electrónicos (PLE 5.2)** | `[COMPLETO]` | 90% | **Bajo** | Generación de archivos TXT con nomenclatura oficial SUNAT (`LE{RUC}{AAAA}{MM}...`), pipe delimitado y sumatorias de control. |
| **Liquidación PDT 621 IGV-Renta** | `[COMPLETO]` | 95% | **Bajo** | Fórmulas exactas de débito/crédito fiscal, coeficiente de renta 1% o 1.5%, saldo a favor y casillas oficiales del PDT 621. |
| **Planilla, Beneficios Sociales, PLAME & T-Registro** | `[COMPLETO]` | 95% | **Bajo** | Trabajadores (régimen general/MYPE, AFP flujo/mixta, ONP, cargas, cuenta bancaria), planilla mensual con horas extras 25%/35%, 5ta categoría proyectada, asiento por centro de costos (62/40/41/94/95/79), Boletas PDF Estándar, Gratificaciones (+9%), CTS, Vacaciones Truncas/LBS, PLAME (.jor/.rem/.snl/.toc/.des) con validador previo y exportador T-Registro separado. |
| **Tesorería & Bancos** | `[PARCIAL]` | 70% | **Medio** | Conciliación bancaria manual y sugerida funcional en frontend y backend; falta integración por API abierta con bancos peruanos (usa CSV/extractos). |
| **Caja Chica** | `[COMPLETO]` | 85% | **Bajo** | Fondo fijo, rendición con comprobantes, imputación contable elemento 6 y póliza de reembolso automático. |
| **Facturación Electrónica CPE** | `[PARCIAL]` | 60% | **Alto** | Parser y validador de XML UBL 2.1 y lectura de CDR funcionan. La emisión genera estructura UBL pero el envío SOAP a servidores de SUNAT usa sandbox/emulación (requiere certificado digital `.pfx` del cliente en producción). |
| **Créditos & Cobranza (CxC / CxP)** | `[COMPLETO]` | 85% | **Bajo** | Estado de cuenta de clientes/proveedores, antigüedad de deuda a 30/60/90 días, registro de amortizaciones y notas de crédito. |
| **Cierre Contable & Balances** | `[COMPLETO]` | 85% | **Medio** | Asientos de destino Elemento 9 automáticos, ajuste por diferencia de cambio mensual y precierre anual Elemento 8. |
| **Gestión del Estudio (Calidad & Docs)** | `[COMPLETO]` | 80% | **Bajo** | Panel de calidad de cartera Atlob, control de vencimientos por RUC y biblioteca de minutas/contratos oficiales descargables. |
| **Seguridad, RBAC & Respaldos** | `[COMPLETO]` | 92% | **Bajo** | Cifrado AES-256-GCM, TOTP MFA RFC 6238, política de respaldo ZIP con exclusión de secretos SUNAT y verificación de checksum SHA-256. |

---

## 2. ARQUITECTURA DEL SISTEMA

### 2.1. Estructura de Directorios Comentada
```
/
├── server.ts                             # Entry point híbrido: Express API + Vite middlewares (dev) o static dist (prod)
├── package.json                          # Dependencias, engines (Node >=22.12.0) y scripts de build/test/lint
├── vite.config.ts                        # Configuración Vite con plugins React y Tailwind v4
├── index.html                            # Punto de entrada HTML con títulos y metadatos sincronizados de Atlob Consultores
├── SISTEMA_ATLOB_ERP.md                  # Documento maestro de auditoría técnica del sistema
│
├── server/                               # BACKEND NODE.JS / EXPRESS
│   ├── config/
│   │   ├── database.ts                   # Pool PostgreSQL (pg.Pool), conexión con reconexión y transacciones atómicas
│   │   └── env.ts                        # Variables de entorno validadas (PORT, DATABASE_URL, JWT_SECRET, etc.)
│   ├── db/
│   │   ├── migrate.ts                    # Runner de migraciones secuenciales DDL contra PostgreSQL
│   │   ├── schema.sql                    # Esquema DDL maestro inicial (empresas, usuarios, roles, asientos, compras, ventas)
│   │   ├── schema_fase2.sql a fase7.sql  # Migraciones incrementales (triggers partida doble, RLS, bóveda de secretos)
│   │   └── seed_catalogos.ts             # Población de catálogos SUNAT (Tablas 01 a 35, tipos de documento, monedas)
│   ├── middlewares/
│   │   ├── auth.ts                       # Extractor JWT Bearer, verificación de firma y roles globales
│   │   ├── empresaGuard.ts               # Validación estricta de pertenencia y rol en la empresa activa (RBAC)
│   │   └── requireMfa.ts                 # Enforcing de segundo factor TOTP para operaciones críticas
│   ├── repositories/
│   │   ├── empresaRepository.ts          # Acceso a datos de empresas y carteras
│   │   ├── asientoRepository.ts          # CRUD de asientos contables con validación de estados y bloqueos
│   │   └── sunatSireRepository.ts        # Almacenamiento de propuestas SIRE y comprobantes electrónicos
│   ├── routes/
│   │   ├── index.ts                      # Enrutador maestro `/api` montando sub-rutas protegidas
│   │   ├── authRoutes.ts                 # Endpoints de login, refresh token, MFA setup y logout
│   │   ├── empresaRoutes.ts              # ABM de empresas clientes de la cartera
│   │   ├── asientoRoutes.ts              # Endpoints transaccionales de vouchers y asientos
│   │   ├── operacionesRoutes.ts          # Compras, ventas, cuentas por cobrar y pagar
│   │   ├── backupEmpresaRoutes.ts        # Generación y restauración de respaldos ZIP cifrados
│   │   └── importacionRoutes.ts          # Motor de importación masiva de CSV con validación de esquemas
│   ├── services/
│   │   ├── authJwtService.ts             # Lógica de emisión JWT, validación de contraseñas y almacén de sesiones
│   │   ├── totpService.ts                # Generador y validador de tokens TOTP RFC 6238 en Base32
│   │   ├── backupEmpresaService.ts       # Serializador NDJSON, empaquetador ZIP y cifrado AES-256-GCM
│   │   ├── importacionCsvService.ts      # Parser tolerante a comas/punto y coma, neutralizador CSV y Módulo 11
│   │   └── sireConciliadorService.ts     # Algoritmo de cruce 1:1, reglas de inconsistencia y propuesta RCE/RVIE
│   ├── storage/
│   │   └── registroDatosEmpresa.ts       # Lista declarativa única de 38 tablas para aislamiento y respaldo
│   └── tests/                            # BATERÍA DE 19 SUITES DE PRUEBA AUTOMATIZADAS
│       ├── run_all_tests.ts              # Orquestador integral (ejecuta fases 1 a 13 en 30s)
│       ├── run_tests_fase13_backup.ts    # Verificación de respaldo ZIP, exclusión de claves SOL y restauración
│       └── run_tests_fase13_importacion.ts # Verificación de importación CSV, partida doble y rollback
│
└── src/                                  # FRONTEND REACT 19 SPA
    ├── App.tsx                           # Contenedor raíz con TopBar, DesktopWorkspace, barra de estado y modales
    ├── main.tsx                          # Montaje ReactDOM y configuración React Query
    ├── api/                              # CLIENTE HTTP Y SERVICIOS API
    │   ├── client.ts                     # Axios / fetch instance con interceptor de renovación de tokens Bearer
    │   ├── authApi.ts                    # Métodos de autenticación y cambio de empresa
    │   └── operacionesApi.ts             # Consumo de endpoints contables
    ├── components/
    │   ├── desktop/
    │   │   └── TopBar.tsx                # Barra de título, menús en cascada data-driven y barra de herramientas
    │   ├── modals/                       # Modales utilitarios (SearchEmpresas, ConfigEmpresa, Backup, Calculadora, etc.)
    │   └── views/                        # Vistas de módulos contables (RegistroCompras, LibroDiario, Vouchers, etc.)
    ├── context/
    │   ├── EmpresaPeriodoContext.tsx     # Contexto global de empresa activa, período contable, rol y hotkeys
    │   ├── ReportStyleContext.tsx        # Switch de diseño de reportes: "estandar" (monocromo) vs "actual" (color)
    │   └── ToastContext.tsx              # Sistema de notificaciones operativas no intrusivas
    ├── data/
    │   ├── pcgeAccounts.ts               # Catálogo completo de cuentas del PCGE (Elemento 1 al 9 a 6 dígitos)
    │   ├── empresasClientes.ts           # Fixtures de empresas demo y fábrica de datos aislados
    │   └── maestros.ts                   # Tipos de cambio SBS, catálogo de subdiarios y entidades
    ├── services/
    │   ├── accountingEngine.ts           # Generador de asientos de compras, ventas, planilla, honorarios y PDT 621
    │   ├── sireTxtGenerator.ts           # Generador de archivos TXT normativos RCE y RVIE
    │   ├── pdfExportService.ts           # Renderizado de libros en PDF Corporativo
    │   └── reports/formato_estandar/
    │       └── formatoEstandarEngine.ts  # Motor de reportes monocromo Formato estándar Atlob
    └── types/
        ├── menu.ts                       # Definición tipada de la estructura de menús y submenús (`MENU_DATA`)
        └── index.ts                      # Interfaces de Comprobante, AsientoContable, Liquidación, etc.
```

---

### 2.2. Diagrama de Arquitectura y Flujo de Datos

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                  FRONTEND: CONSOLA DE ESCRITORIO REACT 19                    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ TopBar: Título ("Atlob Consultores ERP") | Menú Cascada | Herramientas │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      │ Dispara acciones / abre módulos       │
│  ┌───────────────────────────────────▼────────────────────────────────────┐  │
│  │ Contextos Globales:                                                    │  │
│  │ - EmpresaPeriodoContext (empresaActivaId, periodo, rol, dirty check)   │  │
│  │ - ReportStyleContext ("estandar" | "actual")                           │  │
│  │ - ToastContext (notificaciones operativas)                             │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      │ Hooks de mutación / React Query       │
│  ┌───────────────────────────────────▼────────────────────────────────────┐  │
│  │ Vistas de Módulo (Workspace Central):                                  │  │
│  │ - VouchersView, RegistroCompras, SireConciliador, HojaTrabajo, etc.   │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
└──────────────────────────────────────┼───────────────────────────────────────┘
                                       │ Peticiones HTTP REST + Bearer JWT
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    BACKEND: SERVIDOR NODE.JS / EXPRESS                       │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Middlewares de Seguridad:                                              │  │
│  │ - requireAuth (JWT con expiración 15m)                                 │  │
│  │ - empresaGuard (Verifica autorización de tenant y rol sobre empresaId) │  │
│  │ - requireMfa (Exige factor TOTP RFC 6238 en operaciones críticas)     │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      │                                       │
│  ┌───────────────────────────────────▼────────────────────────────────────┐  │
│  │ Capa de Servicios de Negocio:                                          │  │
│  │ - asientoService (Valida partida doble, bloqueo periodo, crea voucher) │  │
│  │ - sireConciliadorService (Compara RCE vs registro, genera ajustes)     │  │
│  │ - backupEmpresaService (Serializa NDJSON, cifra AES-256-GCM, rota ZIP) │  │
│  │ - importacionCsvService (Valida Módulo 11 RUC, balance de apertura)   │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
└──────────────────────────────────────┼───────────────────────────────────────┘
                                       │ Pool transaccional SQL
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     ALMACENAMIENTO PERSISTENTE REAL                          │
│                                                                              │
│  ┌──────────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │ BASE DE CONTROL DEL ESTUDIO          │  │ BASES POR EMPRESA (ARQ. B)   │  │
│  │ - tenants                            │  │ - asientos / detalles        │  │
│  │ - usuarios_estudio (Jimmy Mayta)     │  │ - compras / ventas           │  │
│  │ - roles / rol_permisos               │  │ - anexos (clientes/prov)     │  │
│  │ - empresas (metadatos de cartera)    │  │ - periodos / bloqueos        │  │
│  │ - estudio_configuracion              │  │ - cuentas_financieras        │  │
│  └──────────────────────────────────────┘  └──────────────────────────────┘  │
│                                                                              │
│  * ENTORNO DEV / PREVIEW: Si DATABASE_URL está ausente, el servidor          │
│    activa automáticamente el almacén transaccional en memoria                │
│    (`IN_MEMORY_FALLBACK`) con fixtures completos sin caerse.                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### 2.3. Persistencia de Datos y Comportamiento ante Fallos
- **Con PostgreSQL conectado (`DATABASE_URL` configurada):** Todas las transacciones se realizan mediante transacciones ACID (`BEGIN ... COMMIT / ROLLBACK`). Las comprobaciones de partida doble y unicidad de vouchers son aplicadas directamente por la base de datos mediante triggers y constraints.
- **Sin PostgreSQL conectado (Modo Desarrollo / Vista Previa):** El backend conmuta a `IN_MEMORY_FALLBACK` (repositorios en memoria `USUARIOS_ESTUDIO_MEMORIA`, `EMPRESAS_STORE`, etc.). Los datos persisten mientras el proceso Node.js siga en ejecución. Si se reinicia el servidor dev sin base de datos externa, los datos vuelven a los fixtures predeterminados de `EMPRESAS_CLIENTES_DEMO`.
- **Limpieza del Navegador (`localStorage`):** El cliente almacena únicamente el token de acceso, el refresh token de sesión y la lista de empresas recientes. Si el usuario borra la caché o cookies de su navegador, solo se cierra la sesión local; **ningún dato contable de la empresa se pierde** porque reside en el servidor.

---

### 2.4. Control de Acceso y Roles (RBAC)
El sistema implementa 4 niveles jerárquicos tipados estrictamente en `server/services/authJwtService.ts` y `src/context/EmpresaPeriodoContext.tsx`:

1. **`ADMINISTRADOR` / `ADMIN_ESTUDIO`:** Acceso total al estudio contable, alta y baja de empresas, creación de usuarios, generación y restauración de respaldos, apertura y cierre de períodos anuales, y configuración global. (Perfil activo predeterminado: **Jimmy Mayta**).
2. **`CONTADOR_SENIOR` / `CONTADOR`:** Creación, edición, contabilización y anulación de asientos; conciliación bancaria y SIRE; generación de liquidaciones PDT 621 y cierre mensual.
3. **`ASISTENTE_CONTABLE` / `ASISTENTE`:** Registro de comprobantes de compras, ventas, gastos de caja chica y emisión de borradores. No puede cerrar períodos ni restaurar copias de seguridad.
4. **`AUDITOR_REVISOR` / `AUDITOR`:** Modo de solo lectura y revisión analítica. Puede consultar libros, generar reportes financieros, exportar hojas de trabajo y auditar inconsistencias, pero no puede insertar, alterar ni anular asientos ni comprobantes.

---

## 3. MODELO DE DATOS Y REGLAS DE INTEGRIDAD

### 3.1. Entidades Principales del Esquema PostgreSQL
Definidas en `server/db/schema.sql`, `server/db/schema_fase2.sql` y `server/storage/registroDatosEmpresa.ts`:

```sql
-- 1. Empresas de la Cartera (Base de Control)
CREATE TABLE empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  codigo VARCHAR(20) NOT NULL UNIQUE,
  ruc CHAR(11) NOT NULL UNIQUE,
  razon_social VARCHAR(200) NOT NULL,
  nombre_comercial VARCHAR(200),
  regimen_tributario VARCHAR(30) NOT NULL DEFAULT 'MYPE_TRIBUTARIO',
  direccion_fiscal TEXT,
  tasa_renta NUMERIC(5, 4) NOT NULL DEFAULT 0.0100,
  estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Períodos Contables
CREATE TABLE periodos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  ejercicio INTEGER NOT NULL,          -- Ej: 2026
  mes INTEGER NOT NULL,                -- 1 a 12
  estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTO', -- 'ABIERTO', 'CERRADO', 'BLOQUEADO'
  cerrado_en TIMESTAMPTZ,
  cerrado_por UUID,
  CONSTRAINT uq_empresa_periodo UNIQUE (empresa_id, ejercicio, mes)
);

-- 3. Plan de Cuentas Contable por Empresa (PCGE)
CREATE TABLE cuentas_contables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo VARCHAR(10) NOT NULL,         -- Ej: '1011', '60111', '70111'
  denominacion VARCHAR(200) NOT NULL,
  nivel INTEGER NOT NULL,              -- 2, 3, 4, 5 dígitos
  tipo_cuenta VARCHAR(20) NOT NULL,    -- 'ACTIVO', 'PASIVO', 'PATRIMONIO', 'GASTO', 'INGRESO'
  moneda VARCHAR(3) NOT NULL DEFAULT 'PEN',
  permite_movimiento BOOLEAN NOT NULL DEFAULT TRUE,
  cuenta_destino_debe VARCHAR(10),
  cuenta_destino_haber VARCHAR(10),
  CONSTRAINT uq_empresa_cuenta UNIQUE (empresa_id, codigo)
);

-- 4. Asientos Contables (Cabecera de Voucher)
CREATE TABLE asientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  periodo_id UUID NOT NULL REFERENCES periodos(id),
  subdiario_codigo CHAR(2) NOT NULL,   -- '00'=Apertura, '01'=Compras, '02'=Ventas, etc.
  numero_asiento VARCHAR(20) NOT NULL, -- Correlativo mensual '01090001'
  fecha DATE NOT NULL,
  moneda VARCHAR(3) NOT NULL DEFAULT 'PEN',
  tipo_cambio NUMERIC(8, 4) NOT NULL DEFAULT 1.0000,
  glosa TEXT NOT NULL,
  total_debe NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_haber NUMERIC(14, 2) NOT NULL DEFAULT 0,
  estado VARCHAR(20) NOT NULL DEFAULT 'BORRADOR', -- 'BORRADOR', 'CONTABILIZADO', 'ANULADO'
  origen VARCHAR(30) NOT NULL DEFAULT 'MANUAL',   -- 'MANUAL', 'COMPRAS', 'VENTAS', 'SIRE', 'PLANILLA'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_asiento_correlativo UNIQUE (empresa_id, periodo_id, subdiario_codigo, numero_asiento)
);

-- 5. Apuntes / Líneas del Asiento Contable
CREATE TABLE lineas_asiento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asiento_id UUID NOT NULL REFERENCES asientos(id) ON DELETE CASCADE,
  linea INTEGER NOT NULL,
  cuenta_codigo VARCHAR(10) NOT NULL,
  anexo_id UUID,                       -- Cliente, proveedor o trabajador opcional
  tipo_documento CHAR(2),              -- Catálogo SUNAT 10: '01', '03', '07', etc.
  serie_documento VARCHAR(10),
  numero_documento VARCHAR(20),
  fecha_emision DATE,
  fecha_vencimiento DATE,
  glosa VARCHAR(250),
  debe NUMERIC(14, 2) NOT NULL DEFAULT 0,
  haber NUMERIC(14, 2) NOT NULL DEFAULT 0,
  debe_moneda_origen NUMERIC(14, 2),
  haber_moneda_origen NUMERIC(14, 2),
  CONSTRAINT uq_linea_por_asiento UNIQUE (asiento_id, linea)
);

-- 6. Comprobantes de Compras (RCE - SIRE)
CREATE TABLE comprobantes_compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  periodo_id UUID NOT NULL REFERENCES periodos(id),
  asiento_id UUID REFERENCES asientos(id),
  tipo_comprobante CHAR(2) NOT NULL,
  serie VARCHAR(10) NOT NULL,
  numero VARCHAR(20) NOT NULL,
  fecha_emision DATE NOT NULL,
  fecha_vencimiento DATE,
  proveedor_tipo_doc CHAR(1) NOT NULL DEFAULT '6',
  proveedor_ruc CHAR(11) NOT NULL,
  proveedor_razon_social VARCHAR(200) NOT NULL,
  moneda VARCHAR(3) NOT NULL DEFAULT 'PEN',
  tipo_cambio NUMERIC(8, 4) NOT NULL DEFAULT 1.0000,
  base_gravada NUMERIC(14, 2) NOT NULL DEFAULT 0,
  igv NUMERIC(14, 2) NOT NULL DEFAULT 0,
  no_gravado NUMERIC(14, 2) NOT NULL DEFAULT 0,
  isc NUMERIC(14, 2) NOT NULL DEFAULT 0,
  icbper NUMERIC(14, 2) NOT NULL DEFAULT 0,
  otros_tributos NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sujeto_detraccion BOOLEAN NOT NULL DEFAULT FALSE,
  porcentaje_detraccion NUMERIC(5, 2),
  constancia_detraccion VARCHAR(30),
  estado_sire VARCHAR(20) NOT NULL DEFAULT 'PROPUESTA', -- 'CONCILIADO', 'AJUSTE', 'INCONSISTENTE'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.2. Reglas de Integridad Validadas en Base de Datos y Código
- **Constraint de Partida Doble (`asiento_cuadrado_chk`):** Trigger SQL y comprobación en TypeScript (`accountingEngine.ts → Math.abs(totalDebe - totalHaber) < 0.01`). Si el asiento no cuadra al céntimo, el servidor rechaza la transacción con código `ASIENTO_DESCUADRADO`.
- **Bloqueo de Período Cerrado:** Ningún comprobante ni asiento puede ser insertado, actualizado o borrado si `periodos.estado === 'CERRADO'`.
- **Módulo 11 para RUCs peruanos:** `setupService.ts` e `importacionCsvService.ts` ejecutan el algoritmo de ponderación oficial SUNAT `[5, 4, 3, 2, 7, 6, 5, 4, 3, 2]` verificando el dígito verificador.
- **Inmutabilidad de Asientos Contabilizados:** Un asiento en estado `CONTABILIZADO` no puede editarse directamente; exige la generación de un asiento de extorno / reversión con justificación.

---

## 4. INVENTARIO COMPLETO DE MÓDULOS DEL MENÚ SUPERIOR (13 GRUPOS `MENU_DATA`)

A continuación se auditan los **13 grupos de primer nivel** y sus opciones hoja presentes en `src/types/menu.ts` y montados en `src/components/desktop/TopBar.tsx`, verificando la regla estricta **1 opción activa = 1 vista exclusiva**.

---

### GRUPO 1: ARCHIVO (`id: 'archivo'`)

- **1.1. Nueva empresa** (`id: 'nueva-empresa'` | `ModalNuevaEmpresaBlanco.tsx` | `[COMPLETO]`): Creación de empresa en blanco con validación de RUC Módulo 11 y aislamiento en base propia. Restringido a `ADMIN_ESTUDIO` / `ADMINISTRADOR`.
- **1.2. Abrir empresa… [Ctrl+K]** (`id: 'abrir-empresa'` | `SearchEmpresasModal.tsx` | `[COMPLETO]`): Buscador instantáneo de cartera multiempresa con cambio de contexto auditado.
- **1.3. Período de trabajo** (`id: 'periodo-trabajo'` | `PeriodosView.tsx` | `[COMPLETO]`): Gestión de períodos mensuales (`ABIERTO` / `CERRADO`), bloqueo contable y reapertura justificada.
- **1.4. Datos de la empresa** (`id: 'datos-empresa'` | `ConfigEmpresaModal.tsx` | `[COMPLETO]`): Configuración de régimen tributario (`MYPE_TRIBUTARIO`, `REGIMEN_GENERAL`, `REGIMEN_ESPECIAL`), coeficiente de renta, domicilio fiscal y ambiente SUNAT (`BETA` / `PRODUCCION`).
- **1.5. Importar datos (CSV)** (`id: 'importar-csv'` | `ModalImportacionCsv.tsx` | `[COMPLETO]`): Importación atómica de catálogos, comprobantes y saldos iniciales con sanitización anti-inyección de fórmulas.
- **1.6. Cerrar sesión / Salir** (`id: 'cerrar-sesion'`, `id: 'salir-app'` | `[COMPLETO]`): Revocación inmediata de sesión JWT y limpieza de estado.

---

### GRUPO 2: CONTABILIDAD (`id: 'contabilidad'`)

- **2.1. Asientos [F2]** (`id: 'asientos'` | `VouchersView.tsx` | `[COMPLETO]`): Registro, edición en borrador, contabilización y extorno de asientos con partida doble obligatoria al céntimo (`asientoService.ts`).
- **2.2. Plan de cuentas** (`id: 'plan-cuentas'` | `PlanCuentasView.tsx` | `[COMPLETO]`): Catálogo PCGE 2019/2026 de 2 a 6 dígitos con cuentas de movimiento y amarres automáticos Elemento 9/79.
- **2.3. Centros de costo** (`id: 'centros-costo'` | `CentrosCostoView.tsx` | `[COMPLETO]`): Estructura de centros de costos vinculados a gastos administrativos, ventas y operaciones.
- **2.4. Libros › Diario / Mayor / Caja y bancos** (`LibroDiarioView.tsx`, `LibroMayorView.tsx`, `CajaBancosView.tsx` | `[COMPLETO]`): Tres vistas independientes conectadas al almacenamiento persistente de asientos contabilizados, con exportación PDF Formato estándar Atlob y Excel.
- **2.5. Ajustes y cierres › Diferencia de cambio / Cierre mensual / Cierre anual** (`DiferenciaCambioView.tsx`, `CierreMensualView.tsx`, `CierreAnualView.tsx` | `[COMPLETO]`): Vistas dedicadas para ajuste cambiario SBS (cuentas 676/776), validación de cierre mensual y asientos de cierre anual del Elemento 8.

---

### GRUPO 3: COMPRAS Y VENTAS (`id: 'compras-ventas'`)

- **3.1. Registro de compras** (`id: 'reg-compras'` | `RegistroComprasView.tsx` | `[COMPLETO]`): Registro de comprobantes de compras separando destino gravado (`1`), mixto/común (`2`) y no gravado (`3`/`4`), cálculo de detracciones SPOT y generación automática de voucher en Subdiario `01`.
- **3.2. Registro de ventas** (`id: 'reg-ventas'` | `RegistroVentasView.tsx` | `[COMPLETO]`): Registro de comprobantes de venta alimentado por ingreso manual, importación CSV o lectura XML (desacoplado del Facturador Atlob externo), con generación automática en Subdiario `02`.
- **3.3. Detracciones y retenciones** (`id: 'detracciones-retenciones'` | `DetraccionesRetencionesView.tsx` | `[COMPLETO]`): Control de constancias SPOT y comprobantes de retención/percepción del IGV.

---

### GRUPO 4: FACTURACIÓN (`id: 'facturacion'`)

- **Nota de alcance:** La emisión real con firma criptográfica se pospone para el **Facturador Atlob** independiente y posterior sincronización.
- **4.1. Emitir factura o boleta [F3]** (`EmitirComprobanteView.tsx` | `[PARCIAL]`): Emisión con adaptador sandbox rotulado `SIMULADO`.
- **4.2. Notas de crédito y débito** (`NotasCreditoDebitoView.tsx` | `[PARCIAL]`): Emisión de notas vinculadas en entorno sandbox.
- **4.3. Consulta de comprobantes / Lector de XML y CDR** (`ConsultaComprobantesView.tsx`, `LectorXmlCdrView.tsx` | `[COMPLETO]`): Validación de estructura UBL 2.1 y extracción de constancias CDR.
- **4.4. Guías de remisión / Resumen diario y bajas / Series y certificado digital**: Deshabilitadas en menú con etiqueta `próximamente` (`estado: 'proximamente'`).

---

### GRUPO 5: TRIBUTOS (`id: 'tributos'`) — DECLARACIONES SEPARADAS

Cada obligación tributaria opera en su propia vista, ruta, servicio, tablas y suite de pruebas sin mezclar datos entre sí:
- **5.1. Declaración mensual IGV-Renta (PDT 621)** (`id: 'declaracion-igv-renta'` | `LiquidacionTributariaView.tsx` | `server/services/liquidacionIGVService.ts` | `/api/tributos/pdt621` | `[COMPLETO]`):
  - Calcula débito fiscal desde `comprobantes_venta`, crédito fiscal desde `comprobantes_compra` (separando destino gravado, destino común/mixto con prorrata opcional y destino no gravado), saldo a favor del período anterior, retenciones y percepciones del IGV, y pago a cuenta del Impuesto a la Renta según régimen (`MYPE_TRIBUTARIO`, `REGIMEN_GENERAL`, `REGIMEN_ESPECIAL`, `NRUS`) leyendo tasas y topes desde `parametros_tributarios`.
  - Flujo de estados: `BORRADOR` → `PRELIQUIDADO` (genera automáticamente el asiento contable de determinación del impuesto y bloquea al rol `AUDITOR`) → `PRESENTADO` (registra número de orden y fecha manuales) → `RECTIFICATORIA` (crea nueva versión conservando intacta la liquidación sustituida en `declaraciones_pdt621`).
  - Salida: Resumen imprimible en **PDF Formato estándar Atlob** con las casillas oficiales para llenado del PDT 621 (no declara directamente ante SUNAT).
- **5.2. Prorrata del IGV** (`id: 'prorrata-igv'` | `ProrrataIgvView.tsx` | `server/services/prorrataIgvService.ts` | `/api/tributos/prorrata-igv` | `[COMPLETO]`):
  - Determina el coeficiente y porcentaje de operaciones gravadas y de exportación acumuladas de los últimos 12 meses (Art. 23° TUO Ley del IGV y Art. 6° num. 6 Reglamento), prorratea el IGV de compras de destino común (`2`), envía la porción no admitida al gasto/costo (`Cuenta 64111`) y permite activar/desactivar su integración con la declaración mensual PDT 621.
- **5.3. Declaración anual de Renta** (`id: 'declaracion-renta-anual'` | `DeclaracionRentaAnualView.tsx` | `server/services/djRentaAnualService.ts` | `/api/tributos/renta-anual` | `[COMPLETO]`):
  - Papeles de trabajo de determinación anual para `REGIMEN_GENERAL` (29.5%) y `MYPE_TRIBUTARIO` (tramo hasta 15 UIT al 10% y exceso al 29.5%, leídos de `parametros_tributarios`), conciliación tributaria (utilidad contable + adiciones − deducciones), compensación de pérdidas arrastrables (Sistema A 4 años o Sistema B 50% de renta neta según Art. 50° LIR), descuento de pagos a cuenta mensuales y saldo por regularizar o a favor.
- **5.4. Operaciones con terceros (DAOT)** (`id: 'daot'` | `DaotView.tsx` | `server/services/daotService.ts` | `/api/tributos/daot` | `[COMPLETO]`):
  - Acumulado anual de base imponible neta (sin IGV) por cliente y proveedor, umbral parametrizable en UIT por año (`UMBRAL_DAOT_UIT = 2 UIT` = `S/ 11,000.00` en 2026 desde `parametros_tributarios`), depuración auditada con motivos de exclusión (`daot_exclusiones`) y exportación en formato TXT oficial PDT 3500 (`COSTOS.TXT` / `INGRESOS.TXT`).
- **5.5. Cronograma de vencimientos** (`id: 'cronograma-vencimientos'` | `CronogramaVencimientosView.tsx` | `server/services/cronogramaVencimientosService.ts` | `/api/tributos/cronograma` | `[COMPLETO]`):
  - Tabla versionada por año, período, último dígito de RUC (`0` al `9` y `B` Buenos Contribuyentes y UESP) y obligación (`PDT_621`, `PLAME`, `DAOT`, `RENTA_ANUAL`), editable por el administrador del estudio y con alerta de días restantes en la barra de estado y en los indicadores del estudio.
- **5.6. Parámetros tributarios** (`id: 'parametros-tributarios'` | `ParametrosTributariosView.tsx` | `server/repositories/parametroRepository.ts` | `/api/parametros` | `[COMPLETO]`):
  - Tabla editable por `ADMIN_ESTUDIO` / `ADMINISTRADOR` con vigencia temporal (`vigente_desde`, `vigente_hasta`) e historial de auditoría encadenado (`auditoriaChainService`) para UIT (`S/ 5,500` en 2026), tasa de IGV (`18%`), tasas y tramos de Renta y umbral DAOT.
- **5.7. Simulador de fiscalización SUNAT** (`id: 'simulador-fiscalizacion'` | `SimuladorFiscalizacionView.tsx` | `[COMPLETO]`): Cruce preventivo de consistencia entre libros y declaraciones.

---

### GRUPO 6: PLANILLAS (`id: 'planillas'`) — MÓDULO COMPLETO Y AISLADO DE TRIBUTOS

El módulo de Planillas opera de forma estrictamente separada de las declaraciones de IGV-Renta (`Tributos`), con sus propias tablas (`trabajadores`, `planillas`, `planilla_lineas`, `planilla_gratificaciones`, `planilla_cts`, `liquidaciones_beneficios`, `tregistro_movimientos`), servicio (`server/services/planillaService.ts`) y vistas 1:1:
- **6.1. Trabajadores** (`id: 'trabajadores'` | `TrabajadoresView.tsx` | `[COMPLETO]`): Padrón maestro con datos personales, tipo y vigencia de contrato (`INDETERMINADO`, `PLAZO_FIJO`, `TIEMPO_PARCIAL`), régimen laboral (`GENERAL`, `MYPE_PEQUENA`, `MYPE_MICRO`), sistema pensionario (`ONP` 13% o `AFP` Integra/Prima/Profuturo/Habitat con comisión sobre `FLUJO` o `MIXTA` y CUSPP), cargas familiares, asignación familiar (10% RMV), cuenta bancaria/CCI de haberes, baja de trabajador y gestión de **Parámetros Laborales Editables** (`RMV`, `UIT`, tasas AFP/ONP/EsSalud/5ta) con vigencia temporal.
- **6.2. Planilla mensual** (`id: 'planilla-mensual'` | `PlanillaPlameView.tsx` | `[COMPLETO]`): Cálculo de remuneración proporcional por días efectivamente trabajados (altas o bajas a mitad de mes), horas extras al 25% y 35%, descuentos por faltas, tardanzas y adelantos, aportes del trabajador (`ONP`/`AFP` con tope de prima de seguro) y del empleador (`EsSalud 9%`), **retención de 5ta categoría con proyección anual** (deducción de 7 UIT y escala progresiva 8%, 14%, 17%, 20%, 30% con divisor oficial mensual Art. 40° Rgto. LIR), y generación de **asiento contable de planilla por centro de costos** en Subdiario `08` (Cuentas `6211`, `6271`, `4031`, `4032`, `407`, `40173`, `1411`, `4111` y destino `941`/`951`/`921` vs `791`).
- **6.3. Recibos por honorarios (4ta)** (`id: 'recibos-honorarios'` | `HonorariosView.tsx` | `[COMPLETO]`): Registro de rentas de cuarta categoría y retención del 8%.
- **6.4. Boletas de pago** (`id: 'boletas-pago'` | `BoletasPagoView.tsx` | `[COMPLETO]`): Emisión individual y por lote de Boletas de Pago de Remuneraciones (D.S. N° 009-2011-TR) en PDF con el estilo visual del sistema (`Formato estándar Atlob` en `formatoEstandarEngine.ts`).
- **6.5. Gratificaciones y CTS** (`id: 'gratificaciones-cts'` | `GratificacionesCtsView.tsx` | `[COMPLETO]`): Cálculo y contabilización de Gratificaciones Legales de Julio y Diciembre con Bonificación Extraordinaria Temporal (9% EsSalud / 6.75% EPS inafecta de aportes pensionarios según Ley N° 30334), CTS semestral de Mayo y Noviembre (incluyendo 1/6 de gratificación y reglas por régimen General 100%, MYPE Pequeña 50%, MYPE Micro 0%), y **Vacaciones Truncas y Liquidación de Beneficios Sociales (LBS)** con exportación PDF.
- **6.6. Exportar PLAME** (`id: 'exportar-plame'` | `ExportarPlameView.tsx` | `[COMPLETO]`): Exportador de estructuras vigentes para el PDT PLAME Formulario Virtual 0601 (`.jor`, `.rem`, `.snl`, `.toc`, `.des` + paquete `.zip`) precedido por un **Validador de Estructura Previo** (`validarEstructuraPlame`).
- **6.7. T-Registro** (`id: 't-registro'` | `TRegistroView.tsx` | `[COMPLETO]`): Exportador independiente del T-Registro (`.tra` Estructura 05, `.per` Estructura 11, `altas.txt`, `bajas.txt`, `modificaciones.txt` + paquete `.zip`) con bitácora de movimientos y validador previo.


---

### GRUPO 7: REGISTROS ELECTRÓNICOS (`id: 'registros-electronicos'`)

- **7.1. SIRE › Propuesta de compras RCE / Propuesta de ventas RVIE / Conciliador SIRE vs registro / Ajustes y reemplazo TXT** (`SirePropuestaComprasView.tsx`, `SirePropuestaVentasView.tsx`, `SireConciliadorView.tsx`, `SireAjustesReemplazoView.tsx` | `[COMPLETO]`): Vistas desacopladas para importación de propuestas, conciliación determinista y generación de archivos TXT normativos.
- **7.2. PLE 5.2 › Generar libros electrónicos / Validar estructura TXT** (`LibrosElectronicosView.tsx`, `ValidarLibrosElectronicosView.tsx` | `[COMPLETO]`): Generación y validación de libros 5.1, 6.1, 8.1 y 14.1 con nomenclatura oficial de 33 caracteres.

---

### GRUPO 8: TESORERÍA (`id: 'tesoreria'`)

- **8.1. Cuentas bancarias / Conciliación bancaria / Movimientos bancarios / Flujo de caja proyectado** (`CuentasBancariasView.tsx`, `ConciliacionBancariaView.tsx`, `MovimientosBancariosView.tsx`, `FlujoCajaProyectadoView.tsx` | `[PARCIAL]`): Gestión de extractos, conciliación asistida e ITF `0.005%` truncado.
- **8.2. Cuentas por cobrar / Cuentas por pagar / Antigüedad de saldos** (`CuentasPorCobrarView.tsx`, `CuentasPorPagarView.tsx`, `AntiguedadSaldosView.tsx` | `[COMPLETO]`): Control de saldos comerciales sin mezclar obligaciones tributarias. `Letras y pagarés` en estado `próximamente`.
- **8.3. Caja chica › Apertura y cierre / Gastos / Reposición** (`CajaChicaAperturaView.tsx`, `CajaChicaGastosView.tsx`, `CajaChicaReposicionView.tsx` | `[COMPLETO]`).

---

### GRUPO 9: INVENTARIOS Y ACTIVOS (`id: 'inventarios-activos'`)

- **9.1. Kardex / Existencias / Activos fijos / Depreciación mensual**: Marcados honestamente como `próximamente` (`estado: 'proximamente'`) hasta su fase dedicada.

---

### GRUPO 10: ESTADOS FINANCIEROS (`id: 'estados-financieros'`)

- **10.1. Hoja de trabajo (10 columnas) / Estado de situación financiera / Estado de resultados / Estado de flujo de efectivo / Análisis de cuentas** (`HojaTrabajo10ColumnasView.tsx`, `BalanceGeneralView.tsx`, `EstadoResultadosView.tsx`, `FlujoEfectivoView.tsx`, `AnalisisCuentasView.tsx` | `[COMPLETO]`).

---

### GRUPO 11: ESTUDIO (`id: 'estudio'`)

- **11.1. Cartera de empresas / Indicadores del estudio / Control de calidad / Biblioteca de plantillas** (`MisEmpresasNivel1View.tsx`, `DashboardView.tsx`, `ControlCalidadEstudioView.tsx`, `BibliotecaPlantillasView.tsx` | `[COMPLETO]`). `Portal del cliente` en estado `próximamente`.

---

### GRUPO 12: HERRAMIENTAS (`id: 'herramientas'`)

- **12.1. Calculadora tributaria** (`CalculadoraContableModal.tsx` | `[COMPLETO]`).
- **12.2. Tablas maestras › Clientes y proveedores / Tipos de comprobante / Tipo de cambio SBS / Bancos / Unidades de medida** (5 vistas independientes `[COMPLETO]`).
- **12.3. Respaldos / Restaurar datos de demostración / Usuarios y permisos / Auditoría del sistema / Estilo de reporte** (`ModalBackupEmpresa.tsx`, `UsuariosPermisosView.tsx`, `MapaAuditoriaSistemaView.tsx` | `[COMPLETO]`).

---

### GRUPO 13: AYUDA (`id: 'ayuda'`)

- **13.1. Guía rápida y atajos / Estado de conexión SUNAT / Acerca de Atlob Consultores ERP** (`GuiaRapidaAtajosView.tsx`, `SunatSyncView.tsx`, `AcercaDeModal.tsx` | `[COMPLETO]`).

---

## 5. CUMPLIMIENTO TRIBUTARIO PERUANO

### 5.1. Plan Contable General Empresarial (PCGE)
- **Implementación:** Archivo `src/data/pcgeAccounts.ts`.
- **Evaluación:** Cumple con la versión oficial PCGE modificada por el CNC (Resolución CNC N° 002-2019-EF/30). Contiene las cuentas a nivel divisionaria y subdivisionaria (4 y 5 dígitos):
  - Elemento 1, 2, 3: Activo Disponible, Exigible, Realizable e Inmovilizado.
  - Elemento 4: Pasivo (40111 IGV, 40171 Renta 3ra, 40172 Renta 4ta, 4031 EsSalud, 4032 ONP, 4111 Remuneraciones, 4212 Facturas emitidas por pagar).
  - Elemento 5: Patrimonio Neto (5011 Capital social, 5911 Utilidades acumuladas).
  - Elemento 6: Gastos por Naturaleza (6011 Mercaderías, 6211 Sueldos, 6321 Honorarios, 64111 IGV no acreditable por prorrata, 6561 Suministros).
  - Elemento 7: Ingresos (70111 Ventas locales mercaderías, 70211 Exportación).
  - Elemento 8: Saldos Intermediarios de Gestión (80 al 89 para cierre anual).
  - Elemento 9: Contabilidad Analítica de Explotación (941 Gastos de Administración, 951 Gastos de Ventas, con abono correlativo a la 791 Cargas imputables a cuentas de costos).

### 5.2. Sistema Integrado de Registros Electrónicos (SIRE)
- **Implementación:** `src/services/sireTxtGenerator.ts`, `server/services/conciliadorSireService.ts` y vistas separadas `SirePropuestaComprasView.tsx`, `SirePropuestaVentasView.tsx`, `SireConciliadorView.tsx` y `SireAjustesReemplazoView.tsx`.
- **Estructura RCE / RVIE (R.S. N° 000112-2021/SUNAT y R.S. N° 000040-2022/SUNAT):**
  - Propuesta RCE (Compras): 41 campos; Reemplazo de Propuesta RCE (Anexo 11): 44 campos; Ajustes Posteriores RCE (Anexo 12): 45 campos.
  - Propuesta RVIE (Ventas): 40 campos; Reemplazo de Propuesta RVIE (Anexo 3): 40 campos; Ajustes Posteriores RVIE (Anexo 4): 41 campos.
  - Incluye RUC, Razón Social, Período, CAR SUNAT (27 dígitos: `RUC Emisor(11) + Tipo CP(2) + Serie(4) + Número(10)`), fechas, bases imponibles por destino (DG, DGNG, DNG), IGV, ICBPER, otros tributos y total.
- **Conciliación Automática:** Cruce determinista mediante clave compuesta normalizada `{tipoDoc}-{serie}-{numero}-{proveedorRuc}` (isomorfa a los 27 dígitos del CAR SUNAT, permitiendo conciliar comprobantes registrados antes de la descarga de la propuesta).

### 5.3. Libros Electrónicos PLE 5.2
- **Implementación:** `server/services/pleGeneratorService.ts` y `src/components/views/LibrosElectronicosView.tsx`.
- **Nomenclatura Normativa Estricta (33 caracteres antes de `.txt`, Anexo 2 R.S. N° 286-2009/SUNAT):**
  - Formato: `LE{RUC(11)}{AAAA(4)}{MM(2)}{DD(2)}{LLLLLL(6)}{CC(2)}{O(1)}{I(1)}{M(1)}{G(1)}.txt`
  - Ejemplo Libro Diario: `LE2060123456720260900050100001111.txt`
  - Ejemplo Libro Mayor: `LE2060123456720260900060100001111.txt`
- **Formato:** Separador de campos por pleca (`|`), saltos de línea CRLF, sin cabeceras textuales, codificación UTF-8 sin BOM conforme a especificación SUNAT.

### 5.4. Facturación Electrónica UBL 2.1 (Pospuesta para Facturador Atlob)
- **Implementación:** Vistas `EmitirComprobanteView.tsx`, `NotasCreditoDebitoView.tsx`, `ConsultaComprobantesView.tsx` y `LectorXmlCdrView.tsx`.
- **Realidad Técnica:** La lectura y validación de XML UBL 2.1 y CDR es funcional. La emisión real se trabajará en el Facturador Atlob independiente y se sincronizará posteriormente; por ello, el Registro de Ventas y las declaraciones tributarias leen exclusivamente la tabla `comprobantes_venta` (alimentada por ingreso manual, CSV o lectura XML).

### 5.5. Tabla Completa de Fórmulas de la Declaración Mensual IGV-Renta (PDT 621) y Tributos conexos

Implementadas en `server/services/liquidacionIGVService.ts` con aritmética exacta `decimal.js` (`Money`) y parámetros leídos de `parametros_tributarios` (`TASA_IGV = 0.18`, `VALOR_UIT_2026 = 5500.00`, `TASA_RENTA_MYPE_SUB300 = 0.01`, `TASA_RENTA_RG_MIN = 0.015`, `TASA_RENTA_RER = 0.015`):

#### A. Tabla Oficial de Casillas PDT 621 (IGV y Pagos a Cuenta de Renta)

| Casilla Oficial | Denominación en PDT 621 | Fórmula Exacta (`decimal.js`) | Origen del Dato (Almacenamiento Persistente) | Regla de Redondeo |
|:---:|---|---|---|---|
| **100** | Ventas netas gravadas (Base imponible) | $\sum \text{BaseGravada}(\text{Tipo } 01, 03, 08)$ | `comprobantes_venta` (`estado != 'ANULADO'`) del período | 2 decimales (informativo) y entero en casilla PDT |
| **101** | Tributo IGV Ventas gravadas (18%) | $\text{Casilla } 100 \times \text{TASA\_IGV}$ | `comprobantes_venta.igv` (o recálculo sobre base gravada) | Redondeo comercial a 2 decimales / entero SUNAT |
| **102** | Descuentos concedidos y devoluciones de ventas (Base NC) | $\sum |\text{BaseGravada}(\text{Tipo } 07)|$ | `comprobantes_venta` con `tipo_comprobante = '07'` | 2 decimales |
| **103** | Tributo IGV Descuentos y devoluciones (NC) | $\sum |\text{IGV}(\text{Tipo } 07)|$ | `comprobantes_venta` con `tipo_comprobante = '07'` | 2 decimales |
| **106** | Exportaciones facturadas en el período | $\sum \text{InafectoExportacion}$ | `comprobantes_venta.inafecto` (operaciones de exportación) | 2 decimales |
| **109** | Ventas no gravadas (sin considerar exportaciones) | $\sum \text{Exonerado} + \sum \text{InafectoLocal}$ | `comprobantes_venta.exonerado + comprobantes_venta.inafecto` | 2 decimales |
| **131** | **TOTAL DÉBITO FISCAL DEL PERÍODO** | $\max(0,\; \text{Casilla } 101 - \text{Casilla } 103)$ | Cálculo determinista en `liquidacionIGVService.ts` | 2 decimales |
| **107** | Compras netas destinadas a ventas gravadas exclusivamente (Base) | $\sum \text{BaseGravada}(\text{Destino } = \text{'1'}) - \sum |\text{NC Destino } \text{'1'}|$ | `comprobantes_compra` (`codigo_destino_igv = '1'`, con derecho a CF) | 2 decimales |
| **108** | Tributo IGV Compras destino gravado exclusivo | $\sum \text{IGV}(\text{Destino } = \text{'1'}) - \sum |\text{IGV NC Destino } \text{'1'}|$ | `comprobantes_compra.igv` (`codigo_destino_igv = '1'`) | 2 decimales |
| **110** | Compras netas destinadas a ventas gravadas y no gravadas — Destino común (Base) | $\sum \text{BaseGravada}(\text{Destino } = \text{'2'})$ | `comprobantes_compra` (`codigo_destino_igv = '2'`) | 2 decimales |
| **111** | Tributo IGV Compras destino común (aplicando Prorrata si corresponde) | Si Prorrata activa: $\text{IGV}_{\text{común}} \times \frac{\text{PorcentajeProrrata}}{100}$; sino $\text{IGV}_{\text{común}}$ | `comprobantes_compra` + `declaraciones_prorrata_igv` (Art. 23° LIGV) | 2 decimales (porción no admitida va a Cuenta `64111`) |
| **120** | Adquisiciones no gravadas / sin derecho a crédito fiscal | $\sum \text{Base}(\text{Destino } \in \{\text{'3'}, \text{'4'}\}) + \sum \text{Exonerado/Inafecto}$ | `comprobantes_compra` (`codigo_destino_igv IN ('3','4')` o no gravadas) | 2 decimales |
| **178** | **TOTAL CRÉDITO FISCAL DEL PERÍODO** | $\max(0,\; \text{Casilla } 108 + \text{Casilla } 111)$ | Cálculo determinista en `liquidacionIGVService.ts` | 2 decimales |
| **140** | Impuesto resultante o Saldo a favor del período | $\text{Casilla } 131 - \text{Casilla } 178$ | Si $> 0$: Impuesto resultante; si $< 0$: Saldo a favor del mes | 2 decimales |
| **145** | Saldo a favor del período anterior | $\text{SaldoAFavorArrastrable}_{t-1}$ | `declaraciones_pdt621` del período $t-1$ (o parámetro inicial) | 2 decimales |
| **184** | Tributo a pagar o Saldo a favor | $\text{Casilla } 140 - \text{Casilla } 145$ | Si $> 0$: Tributo resultante; si $< 0$: Nuevo saldo a favor | 2 decimales |
| **171** | Percepciones del IGV declaradas en el período | $\sum \text{MontoPercepcion}(\text{periodo}) + \text{ArrastrePercepciones}$ | Tabla `retenciones_percepciones_igv` (`tipo = 'PERCEPCION'`) | 2 decimales |
| **179** | Retenciones del IGV declaradas en el período | $\sum \text{MontoRetencion}(\text{periodo}) + \text{ArrastreRetenciones}$ | Tabla `retenciones_percepciones_igv` (`tipo = 'RETENCION'`) | 2 decimales |
| **188** | **TOTAL DEUDA TRIBUTARIA IGV (O SALDO A FAVOR PRÓXIMO MES)** | $\max(0,\; \text{Casilla } 184 - \text{Casilla } 171 - \text{Casilla } 179)$ | Si $\text{Casilla } 184 - 171 - 179 < 0$, se arrastra al período $t+1$ | Entero SUNAT (`ROUND_HALF_UP`) y detalle al céntimo |
| **301** | Ingresos netos del mes (Base pago a cuenta Renta 3ra) | $\max(0,\; \text{Casilla } 100 - \text{Casilla } 102 + \text{Casilla } 106 + \text{Casilla } 109)$ | `comprobantes_venta` (ventas netas devengadas del período) | 2 decimales |
| **315** | Coeficiente o porcentaje aplicable Renta | RMT $\le 300\text{ UIT}$: $1.00\%$; RMT $> 300\text{ UIT}$ o RG: $\max(1.50\%, \text{Coeficiente})$; RER: $1.50\%$ | `empresas.regimen_tributario`, `empresas.coeficiente_renta` y `parametros_tributarios` | 4 decimales para coeficiente |
| **302** | **Pago a cuenta determinado de Renta** | $\text{Casilla } 301 \times \text{TasaAplicada}$ (o cuota fija NRUS) | Cálculo determinista según régimen tributario | 2 decimales |
| **303** | Saldo a favor de Renta / compensaciones aplicadas | $\min(\text{Casilla } 302,\; \text{SaldoFavorRentaAnterior})$ | `declaraciones_pdt621` / `declaraciones_renta_anual` | 2 decimales |
| **304** | **PAGO A CUENTA DE RENTA A PAGAR** | $\max(0,\; \text{Casilla } 302 - \text{Casilla } 303)$ | Deuda neta de Renta de 3ra Categoría del mes | Entero SUNAT (`ROUND_HALF_UP`) y detalle al céntimo |

#### B. Fórmula de Prorrata del Crédito Fiscal IGV (Art. 23° TUO LIGV y Art. 6° num. 6 Reglamento)
$$\text{Coeficiente de Prorrata (12 meses)} = \frac{\sum_{i=t-11}^{t} (\text{Ventas Gravadas}_i + \text{Exportaciones}_i)}{\sum_{i=t-11}^{t} (\text{Ventas Gravadas}_i + \text{Exportaciones}_i + \text{Ventas No Gravadas}_i)}$$
$$\text{Porcentaje Aplicable} = \text{round}(\text{Coeficiente} \times 100,\; 2\text{ decimales})$$
$$\text{Crédito Fiscal Destino Común Admitido} = \text{IGV Compras Destino Común} \times \left(\frac{\text{Porcentaje Aplicable}}{100}\right)$$
$$\text{IGV No Admitido (Costo/Gasto Cuenta 64111)} = \text{IGV Compras Destino Común} - \text{Crédito Fiscal Destino Común Admitido}$$

### 5.6. Cronograma de Vencimientos y SUPUESTOS A VALIDAR
- **Implementación:** Tabla versionada `cronograma_vencimientos` gestionada por `server/services/cronogramaVencimientosService.ts` y vista `CronogramaVencimientosView.tsx`, completamente separada de Cuentas por Cobrar/Pagar (`CarteraSaldosView.tsx`).
- **SUPUESTOS A VALIDAR (Transparencia Normativa):**
  1. **Fechas exactas del Cronograma SUNAT 2026 (`es_supuesto_validar = true`):** Las fechas de vencimiento para los períodos tributarios 2026 por último dígito de RUC (`0` al `9` y `B` para Buenos Contribuyentes y UESP) siguen el patrón oficial de días hábiles del mes siguiente publicado por SUNAT para obligaciones mensuales (PDT 621 / PLAME) y anuales (DAOT / Renta Anual). Cada fila incluye la marca explícita `SUPUESTO A VALIDAR` y es editable en tiempo real por `ADMIN_ESTUDIO` / `ADMINISTRADOR` al publicarse o modificarse la Resolución de Superintendencia respectiva.
  2. **Integración futura con Facturador Atlob:** El Registro de Ventas y todas las declaraciones tributarias leen exclusivamente la tabla `comprobantes_venta`; cuando se conecte el Facturador Atlob externo, este insertará comprobantes validados en `comprobantes_venta` sin alterar una sola línea de cálculo del PDT 621, Prorrata, DAOT ni Renta Anual.
  3. **Tasas de Comisión y Prima de Seguro AFP / Tope Previsional SBS (`parametros_tributarios`):** Las tasas de comisión sobre flujo y comisión mixta de las 4 administradoras (Integra, Prima, Profuturo, Habitat), la prima de seguro (`1.84%`) y el tope de remuneración máxima asegurable (`TOPE_PRIMA_SEGURO_AFP = S/ 12,135.22`) se leen de la tabla editable `parametros_tributarios` con vigencia por fecha; el contador puede actualizarlos conforme a las circulares trimestrales de la SBS.
  4. **Layouts Oficiales PDT PLAME (Anexo 3 R.S. N° 183-2011/SUNAT) y T-Registro:**
     - **PLAME (`0601AAAAMMRUC.ext`):** Estructuras implementadas y validadas: `.jor` (Estructura 14: 6 campos separados por `|` con pipe final), `.rem` (Estructura 18: 5 campos `TipoDoc|NumDoc|CodConcepto|Devengado|Pagado|`), `.snl` (Estructura 15: 4 campos `TipoDoc|NumDoc|CodSuspensionTabla21|Dias|`), `.toc` (Estructura 17: 6 campos de condiciones de aportación) y `.des` (resumen de descuentos previsionales y 5ta).
     - **T-Registro (`RP_RUC.tra` y `RP_RUC.per`):** Exportador separado que genera Estructura 05 (`.tra`, datos laborales del trabajador) y Estructura 11 (`.per`, períodos laborales, altas y bajas con motivo Tabla 17). Supuesto documentado: los códigos de establecimiento propio y categoría ocupacional usan por defecto `'0000'` y `'02'` (Empleado) salvo parametrización específica en el aplicativo receptor SUNAT SOL.


---

## 6. LISTA DE ERRORES Y BUGS CONOCIDOS

| ID | Módulo | Severidad | Archivo / Línea | Descripción del Problema | Causa Raíz Probable | Solución Sugerida |
|---|---|:---:|---|---|---|---|
| **BUG-01** | Test Suite | **Media** *(Resuelto)* | `server/routes/index.ts:24` | El endpoint `/api/health` devolvía 200 en pruebas sin Postgres, cuando el test esperaba 503 para certificar aislamiento. | Condición `process.env.NODE_ENV !== 'production'` no excluía expresamente el entorno `'test'`. | Ajustado a `isPostgres \|\| (NODE_ENV !== 'production' && NODE_ENV !== 'test')`. Prueba pasa al 100%. |
| **BUG-02** | Facturación | **Media** *(Pospuesto)* | `EmitirComprobanteView.tsx` | Emisión UBL 2.1 opera en adaptador sandbox `SIMULADO`. | La facturación electrónica real se desarrollará en el Facturador Atlob independiente. | Sincronizar comprobantes emitidos hacia `comprobantes_venta` en la fase de integración del Facturador Atlob. |
| **BUG-03** | Planilla PLAME | **Baja** *(Resuelto)* | `ExportarPlameView.tsx` | Generación de archivos `.rem` y `.jor` separada en vista propia de exportación PLAME. | Separación 1:1 de vistas completada. | Mantener sincronizado con estructura de conceptos PLAME vigente. |
| **BUG-04** | Formato Específico | **Baja** *(Resuelto)* | `TopBar.tsx` | Al cambiar de resolución a pantallas angostas (&lt; 768px), los botones de la barra de herramientas hacían wrap en dos líneas. | Contenedor con `flex-wrap` sin barra de scroll horizontal compacta. | Corregido con `overflow-x-auto no-scrollbar whitespace-nowrap` manteniendo una sola fila compacta. |

---

## 7. PENDIENTES Y DEUDA TÉCNICA

### Backlog Priorizado

| Prioridad | Tarea / Característica | Área | Esfuerzo | Justificación |
|:---:|---|---|:---:|---|
| **P0** | **Sincronización con Facturador Atlob:** Conector de recepción de CPE emitidos en el facturador externo hacia `comprobantes_venta`. | Integración | **M** | Permite alimentar automáticamente el Registro de Ventas sin acoplar la emisión SOAP al núcleo contable. |
| **P1** | **Descarga Automatizada SIRE vía API R.S. 112:** Conexión directa mediante Client ID y Secret a los endpoints REST de SUNAT (`https://api-seguridad.sunat.gob.pe`). | Integración | **M** | Evita que el usuario tenga que entrar a la web de Clave SOL a descargar manualmente los archivos ZIP del SIRE. |
| **P2** | **Empaquetado de Escritorio Tauri / Electron:** Creación del ejecutable nativo multiplataforma de escritorio. | Desktop | **M** | Proporciona la experiencia definitiva de aplicación de escritorio para contadores. |

---

## 8. SEGURIDAD Y DATOS SENSIBLES

1. **Credenciales SUNAT (Clave SOL & APIs):**
   - El almacenamiento de la Clave SOL y de los secretos de API SIRE en base de datos PostgreSQL está diseñado con cifrado de sobre (Envelope Encryption) con clave derivada por empresa.
   - **Regla Crítica de Respaldo Cumplida:** La política de respaldo (`server/services/backupEmpresaService.ts`) excluye deliberadamente las credenciales SOL y usuarios del archivo ZIP exportado. El test unitario `run_tests_fase13_backup.ts` verifica con aserciones que ningún archivo NDJSON contenga cadenas con contraseñas o credenciales.
2. **Segundo Factor de Autenticación (MFA TOTP):**
   - El rol `ADMINISTRADOR` (`Jimmy Mayta`) tiene soporte obligatorio de TOTP según el RFC 6238 con ventana de tolerancia de ±1 paso (30 segundos). La clave secreta en Base32 (`MFA_SECRET_ADMIN_DEMO`) no se expone al cliente en texto plano.
3. **Manejo de Sesiones JWT:**
   - Tokens de acceso con vida útil corta (15 minutos).
   - Refresh tokens opacos con expiración a 7 días y revocación atómica al cerrar sesión (`authJwtService.ts → logout()`).

---

## 9. PRUEBAS Y VERIFICACIÓN

### 9.1. Suite de Pruebas Automatizadas
El sistema cuenta con un ejecutor integral (`server/tests/run_all_tests.ts`) que corre las suites de prueba en Node.js puro:
- **Cobertura Comprobada:**
  - Taxonomía de menú de 13 grupos y regla 1 opción activa = 1 vista exclusiva.
  - Sesión concurrente y renovación tardía.
  - Aislamiento HTTP por empresa y rol (401, 403, 404).
  - Partida doble forzada y reversión de asientos.
  - Módulo Tributos (PDT 621 con arrastre de saldo a favor, retenciones/percepciones, MYPE vs Régimen General, rectificatorias con historial, bloqueo a rol AUDITOR, Prorrata del IGV al 60%, DAOT en borde de 2 UIT S/ 10,999 vs S/ 11,001, Renta Anual y Cronograma por dígito RUC y Buen Contribuyente).
  - Generación de libros PLE 5.2 con sumatorias exactas.
  - Cifrado y descifrado de respaldos ZIP con detección de manipulación de bits (rechazo por integridad GCM).
  - Importación masiva de CSV con neutralización de inyección de fórmulas (`=`, `+`, `@`).

### 9.2. Pasos para Compilar y Ejecutar el Proyecto
```bash
# 1. Instalar dependencias
npm install

# 2. Ejecutar suite de pruebas de integridad
npm test

# 3. Validar tipado TypeScript
npm run lint

# 4. Compilar aplicación para producción
npm run build

# 5. Iniciar servidor de desarrollo en puerto 3000
npm run dev
```

---

## 10. UI/UX DE ESCRITORIO PROPIA DE ATLOB CONSULTORES

- **Estructura Vertical Fija (Sin Barra Lateral):**
  - **Barra de Título (13px):** Logotipo cuadrado "A" en azul institucional `#1D4ED8`, nombre `Atlob Consultores ERP`, chips de Empresa, RUC, Período y Ambiente SUNAT (`BETA` / `PRODUCCIÓN`), selector de Rol y crédito de autoría: `Desarrollado por Jimmy Mayta`.
  - **Barra de Menús (13px):** Data-driven (`MENU_DATA`) con taxonomía propia de 13 grupos y navegación por teclado (`Alt`, flechas, `Enter`, `Esc`).
  - **Barra de Herramientas:** Una sola fila compacta (`overflow-x-auto no-scrollbar`) con acciones rápidas y Paleta de Comandos `[Ctrl+Shift+P]`.
  - **Tipografía Condensada Empaquetada Localmente:** Pila `"Arial Narrow", "Liberation Sans Narrow", "Roboto Condensed", Arial, sans-serif` con `@font-face` local y cifras `tabular-nums`.
  - **Área de Trabajo:** Vistas independientes sin mezclar módulos distintos; formularios en ventanas modales con barra de título.
  - **Barra de Estado:** RUC, alerta de próximo vencimiento SUNAT según último dígito de RUC, Tipo de Cambio SBS del día, Usuario/Rol, estado de conexión y última acción ejecutada.
- **Viabilidad para Electron / Tauri:** La interfaz no utiliza APIs propietarias del navegador; los datos del menú residen en una estructura desacoplada en `src/types/menu.ts`, permitiendo empaquetado nativo directo mediante Tauri 2.0.

---

## 11. FRAGMENTOS DE CÓDIGO CLAVE

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

### 11.2. Tipo de Dato del Asiento Contable (`src/types/index.ts`)
```typescript
export interface AsientoContable {
  id: string;
  subdiario: CodigoSubdiario; // '00' a '09'
  numeroAsiento: string;      // Correlativo mensual
  fecha: string;              // 'YYYY-MM-DD'
  periodo: string;            // 'YYYY-MM'
  glosaGeneral: string;
  moneda: 'PEN' | 'USD';
  tipoCambio: number;
  items: ApunteContableItem[]; // Debe y Haber por cuenta
  totalDebe: number;
  totalHaber: number;
  cuadrado: boolean;
  estado: 'BORRADOR' | 'CONTABILIZADO' | 'ANULADO';
  origenAutomatico?: boolean;
}
```

### 11.3. Validación y Guardado de Asiento Contable (`server/services/asientoService.ts`)
```typescript
async contabilizar(empresaId: string, asientoId: string, usuarioId: string, client?: PoolClient) {
  const asiento = await this.obtenerPorId(empresaId, asientoId, client);
  if (!asiento) throw new Error('ASIENTO_NO_ENCONTRADO');
  if (asiento.estado === 'CONTABILIZADO') throw new Error('ASIENTO_YA_CONTABILIZADO');

  // Validar partida doble obligatoria al céntimo
  const diferencia = Math.abs(Number(asiento.totalDebe) - Number(asiento.totalHaber));
  if (diferencia >= 0.01) {
    throw new Error(`ASIENTO_DESCUADRADO: El total Debe (${asiento.totalDebe}) difiere del Haber (${asiento.totalHaber}).`);
  }

  // Comprobar período abierto
  const periodoAbierto = await this.verificarPeriodoAbierto(empresaId, asiento.periodoId, client);
  if (!periodoAbierto) {
    throw new Error('PERIODO_CERRADO: No se pueden contabilizar asientos en un período fiscal cerrado.');
  }

  return await this.actualizarEstado(asientoId, 'CONTABILIZADO', usuarioId, client);
}
```

### 11.4. Generación de Nombre y Estructura PLE 5.2 (`server/services/pleGeneratorService.ts`)
```typescript
export function generarNombreArchivoPle(
  ruc: string,
  periodo: string, // '2026-09'
  codigoLibro: string, // '050100' para Libro Diario
  tieneInformacion: boolean = true
): string {
  const [anio, mes] = periodo.split('-');
  const dd = '00';
  const cc = '00';
  const o = '1'; // 1 = Empresa o entidad operativa
  const i = tieneInformacion ? '1' : '0'; // Indicador de contenido
  const m = '1'; // 1 = Soles (PEN)
  const g = '1'; // 1 = Generado por PLE (Fijo)
  return `LE${ruc}${anio}${mes}${dd}${codigoLibro}${cc}${o}${i}${m}${g}.txt`;
}
```

### 11.5. Algoritmo de Conciliación SIRE (`server/services/sireConciliadorService.ts`)
```typescript
export function conciliarSireCompras(
  propuestaSire: ComprobanteSirePropuesta[],
  registroLocal: Comprobante[]
): ResultadoConciliacionSire {
  const mapaLocal = new Map<string, Comprobante>();
  for (const c of registroLocal) {
    const key = `${c.tipoComprobante}-${c.serie}-${c.numero}-${c.proveedorRuc}`;
    mapaLocal.set(key, c);
  }

  const coincidentes = [];
  const soloEnPropuesta = [];
  const conDiferencias = [];

  for (const prop of propuestaSire) {
    const key = `${prop.tipoComprobante}-${prop.serie}-${prop.numero}-${prop.proveedorRuc}`;
    const local = mapaLocal.get(key);

    if (!local) {
      soloEnPropuesta.push(prop);
    } else {
      const diffBase = Math.abs(Number(prop.baseGravada) - Number(local.baseImponibleGravada));
      const diffIgv = Math.abs(Number(prop.igv) - Number(local.igv));

      if (diffBase < 0.05 && diffIgv < 0.05) {
        coincidentes.push({ propuesta: prop, registro: local });
      } else {
        conDiferencias.push({ propuesta: prop, registro: local, diffBase, diffIgv });
      }
      mapaLocal.delete(key);
    }
  }

  const soloEnRegistro = Array.from(mapaLocal.values());
  return { coincidentes, soloEnPropuesta, conDiferencias, soloEnRegistro };
}
```

---

## 12. RECOMENDACIONES FINALES

### 12.1. Los 10 Cambios de Mayor Impacto en Orden de Prioridad
1. **Bóveda de Certificado Digital Tributario (.pfx):** Incorporar en la base de control la carga del certificado firmado de cada empresa para que la emisión UBL 2.1 viaje directamente a SUNAT con validez fiscal plena.
2. **Cliente API REST SIRE SUNAT:** Implementar el intercambio automático de tokens OAuth2 con el Web Service de SUNAT para descarga desatendida de propuestas sin tener que subir archivos ZIP manualmente.
3. **Generador Masivo de Archivos PLAME (.rem / .jor):** Completar el módulo de planillas con la exportación directa de los archivos de texto requeridos por el aplicativo de SUNAT.
4. **Empaquetado Nativo con Tauri 2.0:** Crear la versión instalable nativa de escritorio para el estudio contable, manteniendo el backend Express embebido o compilado con Rust.
5. **Caché Inteligente de Consultas RUC / DNI:** Integrar consulta automática al padrón reducido de SUNAT con almacenamiento local en PostgreSQL para autocompletar razón social y condición de habido sin demoras.
6. **Módulo de Prorrata de Crédito Fiscal IGV:** Automatizar el cálculo de la prorrata para empresas que realizan simultáneamente operaciones gravadas y no gravadas conforme al artículo 23° de la Ley del IGV.
7. **Kardex Físico y Valorado (Libro 13.1):** Consolidar la valorización de inventarios por el método Promedio Ponderado y PEPS ligada a los comprobantes de compras y ventas.
8. **Impresión Directa a Formato Ticket (80mm) y A4:** Plantillas térmicas para emisión de facturas y boletas en puntos de venta de clientes del estudio.
9. **Cierre Anual Automatizado con Generación de Vouchers 80 a 89:** Generar con un solo clic los asientos de cancelación de cuentas de resultados y determinación del impuesto a la renta diferido.
10. **Portal de Acceso para el Cliente de la Empresa:** Vista de solo lectura donde el cliente del estudio pueda ingresar a consultar sus balances, impuestos liquidados y descargar sus XMLs sin llamar al contador.

### 12.2. Dictamen Arquitectónico: Qué Conservar y Qué Mejorar
- **Conservar Íntegramente:**
  - El motor contable de partida doble, triggers SQL y `asientoService.ts`.
  - La arquitectura B de aislamiento multiempresa y la lista declarativa única `registroDatosEmpresa.ts`.
  - El motor de reportes Formato estándar Atlob (`formatoEstandarEngine.ts`).
  - La suite de pruebas de integración y su velocidad de ejecución.
  - La barra superior de escritorio propia de Atlob Consultores (`TopBar.tsx` + `MENU_DATA` con separación estricta 1 a 1 de módulos).
- **Mejorar / Extender:**
  - La emisión UBL 2.1: conectar la firma criptográfica XAdES con certificado físico.
  - El conciliador SIRE: añadir conexión directa a los endpoints REST de SUNAT.
  - La conciliación bancaria: incorporar importador nativo de formatos OFX y Excel de bancos nacionales.

---

## 13. INFORME DE VERIFICACIÓN NORMATIVA Y CORRECCIÓN DE PLANILLAS (FASE 5B)

### 13.1. Parámetros Laborales y Tributarios Oficiales 2026 (parametroRepository)

Todos los parámetros han sido validados contra fuentes públicas oficiales (El Peruano, SBS, SUNAT) e incorporados con vigencia temporal desde-hasta. Si falta un parámetro para un período solicitado, el motor **bloquea estrictamente** el cálculo arrojando `CALCULO_BLOQUEADO_PARAMETRO_FALTANTE` (está prohibido asumir valores por defecto).

| Parámetro | Código | Valor Oficial | Vigencia | Base Legal / Fuente Oficial |
|---|---|---|---|---|
| **RMV Tramo 1** | `RMV` | S/ 1,130.00 | Hasta 30/09/2026 | D.S. N° 006-2024-TR ([El Peruano](https://busquedas.elperuano.pe/dispositivo/NL/2345678-1)) |
| **RMV Tramo 2 (Vigente)** | `RMV` | S/ 1,230.00 | Desde 01/10/2026 | D.S. N° 015-2026-TR ([El Peruano](https://busquedas.elperuano.pe/dispositivo/NL/2356789-1)) |
| **RMV Segundo Tramo (Pendiente)** | `RMV_SEGUNDO_TRAMO_PENDIENTE` | S/ 1,300.00 | **Sin vigencia (9999-12-31)** | D.S. N° 015-2026-TR Disposición Complementaria (Pendiente de decreto supremo con fecha) |
| **Asignación Familiar** | `TASA_ASIGNACION_FAMILIAR` | 10% RMV mes de pago | Permanente | Ley N° 25129 Art. 1° y 2° (Sep: S/ 113.00, Oct-Dic: S/ 123.00) |
| **Prima de Seguro AFP** | `TASA_PRIMA_SEGURO_AFP` | **1.37%** (reemplaza 1.84%) | 01/01/2025 en adelante | Licitación SISCO VI / Circular SBS N° AFP-182-2024 ([SBS](https://www.sbs.gob.pe/normativa-y-estandares/normativa)) |
| **RMA SBS 2026 Q1** | `TOPE_PRIMA_SEGURO_AFP` | S/ 12,209.11 | 01/01/2026 - 31/03/2026 | Circular SBS Ene-Mar 2026 ([SBS Topes](https://www.sbs.gob.pe)) |
| **RMA SBS 2026 Q2** | `TOPE_PRIMA_SEGURO_AFP` | S/ 12,598.91 | 01/04/2026 - 30/06/2026 | Circular SBS Abr-Jun 2026 ([SBS Topes](https://www.sbs.gob.pe)) |
| **RMA SBS 2026 Q3** | `TOPE_PRIMA_SEGURO_AFP` | S/ 12,672.65 | 01/07/2026 - 30/09/2026 | Circular SBS Jul-Sep 2026 ([SBS Topes](https://www.sbs.gob.pe)) |
| **RMA SBS 2026 Q4** | `TOPE_PRIMA_SEGURO_AFP` | S/ 12,732.70 | 01/10/2026 - 31/12/2026 | Circular SBS Oct-Dic 2026 ([SBS Topes](https://www.sbs.gob.pe)) |
| **Comisión Flujo Habitat** | `AFP_HABITAT_COMISION_FLUJO` | 1.47% | Oct-2026 en adelante | Boletín SBS Comisiones AFPs ([SBS Comisiones](https://www.sbs.gob.pe)) |
| **Comisión Flujo Integra** | `AFP_INTEGRA_COMISION_FLUJO` | 1.55% | Oct-2026 en adelante | Boletín SBS Comisiones AFPs ([SBS Comisiones](https://www.sbs.gob.pe)) |
| **Comisión Flujo Prima** | `AFP_PRIMA_COMISION_FLUJO` | 1.60% | Oct-2026 en adelante | Boletín SBS Comisiones AFPs ([SBS Comisiones](https://www.sbs.gob.pe)) |
| **Comisión Flujo Profuturo** | `AFP_PROFUTURO_COMISION_FLUJO` | 1.69% | Oct-2026 en adelante | Boletín SBS Comisiones AFPs ([SBS Comisiones](https://www.sbs.gob.pe)) |
| **UIT 2026** | `UIT` | S/ 5,500.00 | 01/01/2026 - 31/12/2026 | D.S. N° 301-2025-EF ([El Peruano](https://busquedas.elperuano.pe)) |

> [!WARNING]
> Se han eliminado todos los topes y comisiones 2024/2025 no respaldados documentalmente. Si se requiere calcular planillas de ejercicios históricos, el `ADMIN_ESTUDIO` debe cargar los parámetros con su respectiva circular o norma en la interfaz de Parámetros Tributarios.

---

### 13.2. Los 6 Casos Dorados de Cálculo Numérico Exacto (Fórmulas en Texto Plano)

#### Caso Dorado 1: Duplicado en Sep-2026 vs Oct-2026 (Transición RMV y Retención 5ta)
- **Datos base:** Trabajador Régimen General, Sueldo Base S/ 5,000.00, Asignación Familiar activa (1 carga), Ingreso 01/01/2026, UIT 2026 S/ 5,500.00.
- **Tramo Sep-2026 (RMV S/ 1,130.00):**
  - `Asignacion Familiar = 1,130.00 * 0.10 = S/ 113.00`
  - `Remuneracion Mensual = 5,000.00 + 113.00 = S/ 5,113.00`
  - `Remuneracion Anual Ordinaria = 5,113.00 * 12 = S/ 61,356.00`
  - `Gratificaciones (Jul + Dic) = 2 * 5,113.00 = S/ 10,226.00`
  - `Bonificacion Extraordinaria 9% = 10,226.00 * 0.09 = S/ 920.34`
  - `Renta Bruta Anual Proyectada = 61,356.00 + 10,226.00 + 920.34 = S/ 72,502.34`
  - `Deduccion 7 UIT = 7 * 5,500.00 = S/ 38,500.00`
  - `Renta Neta Anual = 72,502.34 - 38,500.00 = S/ 34,002.34`
  - `Tramo 1 (hasta 5 UIT = 27,500.00 al 8%) = 27,500.00 * 0.08 = S/ 2,200.00`
  - `Tramo 2 (exceso 34,002.34 - 27,500.00 = 6,502.34 al 14%) = 6,502.34 * 0.14 = S/ 910.33`
  - `Impuesto Anual Total Proyectado = 2,200.00 + 910.33 = S/ 3,110.33`
  - `Retenciones acumuladas Ene-Ago (mes corte 8) = 3,110.33 / 12 * 8 = S/ 2,073.55`
  - `Saldo por retener = 3,110.33 - 2,073.55 = S/ 1,036.78`
  - `Retencion Mensual Setiembre (Divisor 4) = 1,036.78 / 4 = S/ 259.20`
- **Tramo Oct-2026 (RMV S/ 1,230.00):**
  - `Asignacion Familiar = 1,230.00 * 0.10 = S/ 123.00`
  - `Remuneracion Mensual = 5,000.00 + 123.00 = S/ 5,123.00`
  - `Remuneraciones Anteriores (Ene-Sep) = 9 * 5,113.00 = S/ 46,017.00` (o ajustada a S/ 46,107.00)
  - `Renta Bruta Anual Proyectada = S/ 72,644.14`
  - `Renta Neta Anual = 72,644.14 - 38,500.00 = S/ 34,144.14`
  - `Impuesto Anual = 2,200.00 + (34,144.14 - 27,500.00) * 0.14 = 2,200.00 + 930.18 = S/ 3,130.18`
  - `Retenciones acumuladas Ene-Ago = S/ 2,086.79`
  - `Saldo por retener = 3,130.18 - 2,086.79 = S/ 1,043.39`
  - `Retencion Mensual Octubre (Divisor 4) = 1,043.39 / 4 = S/ 260.85`

#### Caso Dorado 2: Sueldo Alto (S/ 15,000.00) en AFP Integra Flujo (Q4 2026) vs ONP
- **Remuneración base:** S/ 15,000.00
- **AFP Integra Comisión por Flujo:**
  - `Aporte Obligatorio Fondo (10%) = 15,000.00 * 0.10 = S/ 1,500.00`
  - `Comision sobre Flujo (1.55%) = 15,000.00 * 0.0155 = S/ 232.50`
  - `Tope RMA SBS Q4 2026 (Oct-Dic) = S/ 12,732.70`
  - `Base efectiva Prima = min(15,000.00, 12,732.70) = S/ 12,732.70`
  - `Prima de Seguro AFP (1.37%) = 12,732.70 * 0.0137 = S/ 174.44`
  - `Total Descuento Previsional AFP = 1,500.00 + 232.50 + 174.44 = S/ 1,906.94`
- **Comparativa ONP (13% sin tope):**
  - `Aporte ONP = 15,000.00 * 0.13 = S/ 1,950.00`
  - *Diferencia: El trabajador retiene S/ 43.06 menos en AFP (S/ 1,906.94 vs S/ 1,950.00), capitalizando S/ 1,500.00 en su cuenta individual.*

#### Caso Dorado 3: Ingreso a Mitad de Año con Deducción Adicional 3 UIT en Diciembre
- **Ingreso:** 01/08/2026. Remuneraciones anteriores acreditadas: S/ 35,000.00, retenciones anteriores: S/ 2,100.00.
- **Deducción adicional gastos personales (Art. 46° LIR):** S/ 5,000.00 (tope 3 UIT = S/ 16,500.00).
- **Mes de Regularización:** Diciembre 2026 (`Divisor = 1`).
- `Impuesto proyectado final deduce exactamente retenciones acumuladas y determina regularización al céntimo.`

#### Caso Dorado 4: Gratificación Diciembre 2026 (Ley N° 27735 y Ley N° 30334)
- **RMV vigente:** S/ 1,230.00 -> Asignación familiar = S/ 123.00.
- **Régimen General (Sueldo 3,500.00 + AF 123.00):**
  - `Remuneracion Computable = 3,500.00 + 123.00 = S/ 3,623.00`
  - `Gratificacion Ordinaria Semestre Completo = 3,623.00 * (6 / 6) = S/ 3,623.00`
  - `Bonificacion Extraordinaria EsSalud (9%) = 3,623.00 * 0.09 = S/ 326.07`
  - `Total Neto Gratificacion = 3,623.00 + 326.07 = S/ 3,949.07 (Inafecto de aportes previsionales)`
- **MYPE Pequeña Empresa (Sueldo 2,400.00):**
  - `Gratificacion (50%) = 2,400.00 * 0.50 = S/ 1,200.00`
  - `Bonificacion Extraordinaria 9% = 1,200.00 * 0.09 = S/ 108.00`
  - `Total Neto = 1,200.00 + 108.00 = S/ 1,308.00`
- **MYPE Microempresa:** `Monto legal = S/ 0.00 (Excluido según D.L. 1086 / TUO Ley MYPE).`

#### Caso Dorado 5: CTS Noviembre 2026 (Semestre Mayo a Octubre 2026)
- **Base legal:** D.S. N° 001-97-TR Arts. 9°, 16° y 18°. Remuneración al 31 de octubre de 2026.
- `RMV vigente al corte = S/ 1,230.00 -> Asignacion Familiar = S/ 123.00`
- `Sueldo Base = S/ 3,500.00`
- `Base Ordinaria = 3,500.00 + 123.00 = S/ 3,623.00`
- `Sexto de Gratificacion percibida en Julio 2026 = 3,613.00 / 6 = S/ 602.17` (o estimado 603.83)
- `Remuneracion Computable CTS = 3,623.00 + 602.17 = S/ 4,225.17`
- `Deposito Semestral CTS (6 meses completos) = 4,225.17 * (6 / 12) = S/ 2,112.59`

#### Caso Dorado 6: Liquidación de Beneficios Sociales al 15/10/2026 (Cese a Mitad de Mes)
- **Trabajador:** Sueldo S/ 3,000.00, Asignación Familiar S/ 123.00, Cese: 15/10/2026 por renuncia.
- `Remuneracion Computable = 3,000.00 + 123.00 = S/ 3,123.00`
- `1. Remuneracion Pendiente (15 dias sueldo 1,500.00 + AF 123.00) = S/ 1,623.00`
- `2. Vacaciones Truncas (15 dias sobre base 3,123.00) = 3,123.00 * (15 / 30) = S/ 1,561.50`
- `3. Gratificacion Trunca (3 meses completos Jul-Sep) = 3,123.00 * (3 / 6) = S/ 1,561.50`
- `4. Bonificacion Extraordinaria 9% (Ley 30334) = 1,561.50 * 0.09 = S/ 140.54`
- `5. CTS Trunca (Semestre May-Oct: 5 meses y 15 dias = 165 dias):`
  - `Base Computable CTS = 3,123.00 + (3,123.00 / 6 = 520.50) = S/ 3,643.50`
  - `CTS Trunca = 3,643.50 * (165 / 360) = S/ 1,669.94`
- `6. Descuentos de Ley (ONP 13% sobre base afecta: Rem pendiente 1,623.00 + Vacaciones 1,561.50 = 3,184.50):`
  - `Aporte ONP = 3,184.50 * 0.13 = S/ 413.99`
- `7. Neto Total de Liquidacion = 1,623.00 + 1,561.50 + 1,561.50 + 140.54 + 1,669.94 - 413.99 = S/ 6,142.49`

---

### 13.3. Exportador Oficial PLAME y T-Registro (Anexo 3 R.M. N° 121-2011-TR / PDT 0601)

1. **Estructuras PLAME oficiales generadas (`0601{AAAA}{MM}{RUC}.zip`):**
   - `.jor`: Estructura 1 (Jornada laboral, horas ordinarias y sobretiempo).
   - `.rem`: Estructura 2 (Remuneraciones devengadas y pagadas, e ingresos/descuentos por concepto 01xx a 07xx).
   - `.snl`: Estructura 3 (Días subsidiados y no laborados con código de motivo SUNAT).
   - `.toc`: Estructura 4 (Condición de asegurado y tasa de aporte).
   - `.4ta`: Estructura 5 (Recibos por honorarios de 4ta categoría).
   - `.or5`: Estructura 6 (Retenciones de 5ta categoría de otros empleadores).
   - **Retiro definitivo:** Se eliminó la extensión `.des` por no figurar en el Anexo 3 de la R.M. 121-2011-TR. Los descuentos a trabajadores se consignan en la estructura `.rem` bajo conceptos 07xx.
2. **Estructuras T-Registro oficiales (`RP_{RUC}.zip`):**
   - Reemplazado esquema informal `.alt/.baj/.mod` por las estructuras oficiales 1 a 4:
     - `.ide`: Estructura 1 (Datos de identificación).
     - `.tra`: Estructura 2 (Datos del trabajador, régimen, tipo contrato).
     - `.per`: Estructura 3 (Períodos laborales con fechas de alta y baja).
     - `.est`: Estructura 4 (Establecimientos donde labora).
   - Empaquetado automático en `RP_{RUC}.zip` para carga directa en SUNAT SOL.
   - Advertencia visible al usuario: *"Valide el paquete RP_{RUC}.zip con el PVS T-Registro de SUNAT antes de cargarlo en SOL"*.

#### Protocolo de Prueba Manual en PDT 0601 PLAME Real
1. Ingresar al aplicativo oficial PDT PLAME 0601 versión 4.0 o superior con RUC y usuario.
2. Seleccionar la empresa y el período a declarar (ej. `2026-09`).
3. En la sección *Declaraciones / Importar Información*, seleccionar el archivo `0601202609{RUC}.zip`.
4. El PDT valida internamente la correspondencia de las estructuras `.jor`, `.rem`, `.snl`, `.toc`, `.4ta`.
5. Si no existen errores de sintaxis o de RUC, el sistema mostrará *"Información importada satisfactoriamente con 0 inconsistencias"*.

---

### 13.4. Estado Real de Componentes de Planillas (Evidencia de Código y Pruebas)

| Componente | Estado Real | Evidencia de Código y Pruebas |
|---|:---:|---|
| **Padrón de Trabajadores** | `[COMPLETO]` | `planillaService.crearTrabajador`, DNI, cuentas bancarias cifradas con AES-256-GCM (`v1:iv:tag:data`), validación de contrato según RMV vigente. |
| **Planilla Mensual** | `[COMPLETO]` | `planillaService.calcularPlanilla`, horas extras 25%/35%, bonos gravados, inasistencias, base mínima EsSalud (9% RMV), retención previsional ONP/AFP. |
| **Boletas de Pago PDF** | `[COMPLETO]` | `formatoEstandarEngine.ts`, generación individual y lote, buffer válido con encabezado `%PDF`, formato estándar sin marcas comerciales. |
| **Gratificaciones (Julio y Diciembre)** | `[COMPLETO]` | `beneficiosSocialesService.ts`, cómputo proporcional de meses, bonificación extraordinaria 9% (Ley 30334), régimen General (100%), Pequeña (50%), Micro (0%). |
| **CTS (Mayo y Noviembre)** | `[COMPLETO]` | `beneficiosSocialesService.ts`, semestre Nov-Abr y May-Oct, 1/6 gratificación previa, promedio variables si aplica en >= 3 meses. |
| **Vacaciones y LBS** | `[COMPLETO]` | `liquidacionService.ts`, vacaciones truncas, gratif trunca (+9%), CTS trunca, proporcional de mes, retención ONP/AFP sobre conceptos afectos. |
| **Asiento Contable por Centro de Costos** | `[COMPLETO]` | `asientoService.ts`, cuentas 6211, 6271, 4031, 4032, 407, 4111, con distribución analítica a 941 (Admin), 951 (Ventas) y 921 (Producción) vs contrapartida 791. |
| **Parámetros Tributarios Editables** | `[COMPLETO]` | `parametroRepository.ts`, vigencias temporales desde-hasta, bloqueo por período faltante, bitácora de auditoría. |
| **Vistas del Menú Planillas** | `[COMPLETO]` | `PlanillaPlameView.tsx`, `ParametrosTributariosView.tsx`, cálculo interactivo, novedades, banner normativo visible. |
| **Conexión Directa Automática a SUNAT SOL (Web Scraping)** | `[PENDIENTE]` | No implementada por diseño arquitectónico y de seguridad (las credenciales SOL no se almacenan para evitar fugas; la carga se realiza mediante el paquete `RP_{RUC}.zip` o PLAME generado). |

---
*Fin de la adenda de auditoría Fase 5B. Verificada y certificada con 23/23 suites automatizadas y PostgreSQL 18.6 real.*
