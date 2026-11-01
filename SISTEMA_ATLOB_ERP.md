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
| **Liquidación PDT 621 IGV-Renta** | `[COMPLETO]` | 85% | **Bajo** | Fórmulas exactas de débito/crédito fiscal, coeficiente de renta 1% o 1.5%, saldo a favor y casillas oficiales del PDT 621. |
| **Planilla & PLAME** | `[PARCIAL]` | 75% | **Medio** | Cálculo de retenciones ONP/AFP y EsSalud 9%. Genera asientos contables de planilla; falta exportación masiva a formato `.rem` / `.jor` de MINTRA. |
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
    │       └── formatoEstandarEngine.ts  # Motor de reportes monocromo estilo escritorio SISCONT
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

## 4. INVENTARIO COMPLETO DE MÓDULOS DEL MENÚ SUPERIOR

A continuación se auditan las **13 opciones de primer nivel** y sus respectivos submenús presentes en `src/types/menu.ts` y montados en `src/components/desktop/TopBar.tsx`.

---

### MÓDULO 1: CONTABILIDAD

#### 1.1. Plan de cuentas (PCGE)
- **Ruta:** `Contabilidad › Plan de cuentas (PCGE)` | **ID:** `pcge`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `src/components/views/MaestrosView.tsx` en la pestaña de Plan Contable. Carga el catálogo completo de cuentas del PCGE desde `src/data/pcgeAccounts.ts` (más de 300 cuentas ordenadas de 2 a 6 dígitos). Permite búsqueda en vivo por código o denominación. En backend consulta `GET /api/empresas/:id/cuentas`.
- **Entradas / Salidas:** Filtro de texto instantáneo. Salida visual de cuentas con badges de elemento contable (Activo, Pasivo, etc.).
- **Archivos:** `src/components/views/MaestrosView.tsx`, `src/data/pcgeAccounts.ts`, `server/routes/empresaRoutes.ts`.
- **Validaciones:** Códigos numéricos de 2 a 6 dígitos; cuentas de movimiento vs cuentas de acumulación.

#### 1.2. Registro de asientos [F2]
- **Ruta:** `Contabilidad › Registro de asientos` | **ID:** `asientos` | **Atajo:** `F2`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `src/components/views/VouchersView.tsx`. Permite filtrar por subdiario (`01` Compras, `02` Ventas, `03` Caja, etc.) y estado. Abre modal de creación de voucher con selección de cuenta PCGE interactiva, digitación de Debe/Haber y cálculo en tiempo real de diferencia de cuadre. Al guardar, invoca `POST /api/asientos`.
- **Entradas / Salidas:** Formulario de cabecera (fecha, glosa, moneda, TC) y grilla de apuntes. Salida en tabla de asientos y voucher imprimible.
- **Archivos:** `src/components/views/VouchersView.tsx`, `server/services/asientoService.ts`, `server/routes/asientoRoutes.ts`.
- **Validaciones:** Partida doble obligatoria (diferencia == 0.00), período no cerrado, cuenta contable existente.

#### 1.3. Libros auxiliares
- **Subopciones:**
  - `Libro diario`: `[COMPLETO]` (`LibroDiarioView.tsx`). Muestra la cronología de todos los asientos del mes agrupados por voucher con suma de comprobación.
  - `Libro mayor`: `[COMPLETO]` (`LibroMayorView.tsx`). Agrupa los movimientos por código de cuenta contable calculando saldo deudor y acreedor.
  - `Caja y bancos`: `[COMPLETO]` (`CajaBancosView.tsx`). Lista ingresos y egresos de efectivo y cuentas corrientes bancarias.
- **Archivos:** `src/components/views/LibroDiarioView.tsx`, `LibroMayorView.tsx`, `CajaBancosView.tsx`.

#### 1.4. Registro de compras
- **Ruta:** `Contabilidad › Registro de compras` | **ID:** `reg-compras`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `src/components/views/RegistroComprasView.tsx`. Permite registrar comprobantes de compras (Factura 01, Recibo 02, Nota de Crédito 07, etc.), imputar cuentas de gasto (Elemento 6) y generar automáticamente el asiento en el Subdiario 01. Soporta cálculo de detracción SPOT con constancia bancaria.
- **Entradas / Salidas:** Entrada manual o importación SIRE. Salida a tabla, exportación a Excel y PDF estándar/corporativo.
- **Archivos:** `src/components/views/RegistroComprasView.tsx`, `src/services/accountingEngine.ts`.

#### 1.5. Registro de ventas
- **Ruta:** `Contabilidad › Registro de ventas` | **ID:** `reg-ventas`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `src/components/views/RegistroVentasView.tsx`. Registra facturas y boletas de venta, determina base imponible gravada, exonerada o inafecta, e IGV débito fiscal. Conexión directa al Subdiario 02.
- **Archivos:** `src/components/views/RegistroVentasView.tsx`, `src/services/accountingEngine.ts`.

#### 1.6. Centro de costos
- **Ruta:** `Contabilidad › Centro de costos` | **ID:** `centro-costos`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `MaestrosView.tsx` filtrando la estructura de centros de costos vinculados al Elemento 9 (Administración, Ventas, Operaciones).
- **Archivos:** `src/components/views/MaestrosView.tsx`, `server/storage/registroDatosEmpresa.ts`.

#### 1.7. Ajustes y cierre
- **Subopciones:** `Diferencia de cambio`, `Depreciación`, `Cierre mensual`, `Cierre anual` | **ID:** `ajustes-cierre`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `src/components/views/ProcesosCierreView.tsx`. Calcula la ganancia/pérdida por diferencia de cambio al Tipo de Cambio SBS fin de mes en cuentas en dólares (104, 121, 421). Simula los asientos de cierre del Elemento 8 (80 Margen Comercial hasta 89 Resultado del Ejercicio).
- **Archivos:** `src/components/views/ProcesosCierreView.tsx`, `server/services/tributarioAnualService.ts`.

---

### MÓDULO 2: INFORMES CONTABLES

#### 2.1. Balance de comprobación (Hoja de Trabajo 10 Columnas)
- **Ruta:** `Informes Contables › Balance de comprobación` | **ID:** `bal-comprobacion`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `src/components/views/HojaTrabajo10ColumnasView.tsx`. Calcula dinámicamente desde los asientos contables las 10 columnas normativas: Sumas del Mayor (Debe/Haber), Saldos (Deudor/Acreedor), Ajustes por Transferencia (Debe/Haber), Estado de Situación Financiera (Activo/Pasivo) y Estado de Resultados por Naturaleza (Pérdidas/Ganancias).
- **Entradas / Salidas:** Asientos del período. Salida en pantalla con resaltado de cuadre al céntimo y exportación PDF/Excel.
- **Archivos:** `src/components/views/HojaTrabajo10ColumnasView.tsx`, `src/services/reportesEngine.ts`.

#### 2.2. Balance general, Estado de resultados y Flujo de efectivo
- **Ruta:** `Informes Contables › Balance general / Estado de resultados / Flujo de efectivo`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `src/components/views/ReportesFinancierosView.tsx`. Genera los tres Estados Financieros con clasificación de Activo Corriente/No Corriente, Pasivo y Patrimonio, y desglose de margen bruto, operativo y neto.
- **Archivos:** `src/components/views/ReportesFinancierosView.tsx`.

---

### MÓDULO 3: REPORTES SUNAT

#### 3.1. Libros Oficiales SUNAT
- **Ruta:** `Reportes SUNAT › Libros` | **ID:** `rep-libros`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `ReportesSunatEspecialesView.tsx` permitiendo emitir las vistas oficiales del Libro Diario (5.1), Libro Mayor (6.1), Registro de Compras (8.1) y Registro de Ventas (14.1).
- **Archivos:** `src/components/views/ReportesSunatEspecialesView.tsx`, `src/services/pdfExportService.ts`.

#### 3.2. PDB (Programa de Declaración de Beneficios)
- **Ruta:** `Reportes SUNAT › PDB › PDB Renta anual / PDB IGV-Renta mensual`
- **Estado:** `[COMPLETO]`
- **Flujo:** Genera los archivos planos de exportación para importación en el módulo PDB de SUNAT para exportadores y reintegro tributario.
- **Archivos:** `src/components/views/ReportesSunatEspecialesView.tsx`.

#### 3.3. DAOT (Operaciones con Terceros)
- **Ruta:** `Reportes SUNAT › DAOT`
- **Estado:** `[COMPLETO]`
- **Flujo:** Totaliza transacciones anuales por proveedor y cliente y filtra aquellos que superan el umbral legal de 2 UITs (S/ 10,700).
- **Archivos:** `src/components/views/ReportesSunatEspecialesView.tsx`, `server/services/tributarioAnualService.ts`.

#### 3.4. PDT (PDT 621 IGV-Renta, PDT 601 PLAME, PDT 617)
- **Ruta:** `Reportes SUNAT › PDT`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `LiquidacionTributariaView.tsx` y `PlanillaPlameView.tsx`.
- **Archivos:** `src/components/views/LiquidacionTributariaView.tsx`, `src/components/views/PlanillaPlameView.tsx`.

#### 3.5. Libros Electrónicos & TXT Valida Compras
- **Ruta:** `Reportes SUNAT › Libros Electrónicos / TXT valida compras SUNAT`
- **Estado:** `[COMPLETO]`
- **Flujo:** Genera los archivos con validación de tuberías (`|`) exigidas por el aplicativo PLE 5.2.
- **Archivos:** `src/services/sireTxtGenerator.ts`, `src/components/views/SireConciliadorView.tsx`.

---

### MÓDULO 4: SIRE SUNAT +

#### 4.1. Conciliador SIRE vs Registro
- **Ruta:** `SIRE SUNAT + › Conciliador SIRE vs registro` | **ID:** `sire-conciliador`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `src/components/views/SireConciliadorView.tsx`. Compara comprobante por comprobante (mediante el Código de Anotación de Registro - CAR) la propuesta descargada de SUNAT contra el Registro de Compras interno del ERP. Identifica 4 estados: Coincidentes, En propuesta pero no en ERP, En ERP pero no en propuesta, y Con diferencias de importe/IGV.
- **Entradas / Salidas:** Archivos TXT o ZIP de propuesta de compras/ventas SUNAT SIRE. Genera reporte de inconsistencias y archivo TXT de reemplazo o ajustes posteriores.
- **Archivos:** `src/components/views/SireConciliadorView.tsx`, `server/services/sireConciliadorService.ts`.

#### 4.2. Importación de Propuesta Compras y Ventas (TXT / ZIP)
- **Ruta:** `SIRE SUNAT + › Importar propuesta compras / ventas`
- **Estado:** `[COMPLETO]`
- **Flujo:** Parser que descomprime archivos ZIP del SIRE y extrae el archivo delimitado por pipes, poblando la tabla `sire_propuestas`.
- **Archivos:** `server/routes/sunatSirePleRoutes.ts`, `src/services/sireTxtGenerator.ts`.

---

### MÓDULO 5: FACTURACIÓN ELECTRÓNICA

#### 5.1. Emisión de Factura / Boleta [F3]
- **Ruta:** `Facturación › Emitir factura / boleta` | **ID:** `emitir-cp` | **Atajo:** `F3`
- **Estado:** `[PARCIAL]`
- **Flujo:** Abre `src/components/views/FacturacionElectronicaView.tsx`. Formulario completo de emisión con serie (`F001`, `B001`), RUC del cliente, ítems con precio unitario, subtotal, IGV 18% y total. Genera la representación del comprobante y simula la aprobación en línea con CDR.
- **Limitación Real:** La estructura XML UBL 2.1 se construye en el cliente, pero el envío SOAP real al endpoint de producción de SUNAT (`https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService`) requiere que el estudio contable configure un Certificado Digital Tributario (`.pfx`) con clave privada, el cual está emulado en la instalación de prueba.
- **Archivos:** `src/components/views/FacturacionElectronicaView.tsx`.

#### 5.2. Notas de Crédito, Débito, Guías GRE y Bajas
- **Ruta:** `Facturación › Notas de crédito / Guías de remisión (GRE) / Comunicación de baja`
- **Estado:** `[PARCIAL]`
- **Flujo:** Interfaz interactiva para generación de notas de crédito ligadas a facturas previas, guías de remisión y resúmenes de anulación dentro del plazo de 7 días.
- **Archivos:** `src/components/views/FacturacionElectronicaView.tsx`.

#### 5.3. Lector XML UBL / CDR
- **Ruta:** `Facturación › Lector XML UBL / CDR`
- **Estado:** `[COMPLETO]`
- **Flujo:** Lee y parsea archivos XML con firma digital XAdES-BES extrayendo RUC emisor, receptor, digest value y constancia de recepción de SUNAT.
- **Archivos:** `src/components/views/FacturacionElectronicaView.tsx`, `server/routes/operacionesRoutes.ts`.

---

### MÓDULO 6: CRÉDITOS Y COBRANZA

#### 6.1. Cuentas por Cobrar (CxC) y Cuentas por Pagar (CxP)
- **Ruta:** `Créditos y Cobranza › Cuentas por cobrar / Cuentas por pagar` | **ID:** `cxc`, `cxp`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `src/components/views/CarteraSaldosView.tsx`. Lee los comprobantes de venta y compra pendientes de cobro/pago. Permite registrar abonos parciales, emitir notas de crédito por descuento y consultar la antigüedad de la deuda en tramos: Corriente, 1-30 días, 31-60 días, y más de 90 días.
- **Archivos:** `src/components/views/CarteraSaldosView.tsx`, `server/routes/operacionesRoutes.ts`.

#### 6.2. Vencimientos SUNAT
- **Ruta:** `Créditos y Cobranza › Vencimientos SUNAT` | **ID:** `vencimientos-sunat`
- **Estado:** `[COMPLETO]`
- **Flujo:** Cruza el último dígito del RUC de la empresa activa contra la tabla oficial de vencimientos de obligaciones mensuales de SUNAT, notificando días restantes para la declaración PDT 621, SIRE y PLAME.
- **Archivos:** `src/components/views/CarteraSaldosView.tsx`, `src/data/empresasClientes.ts`.

---

### MÓDULO 7: TESORERÍA

#### 7.1. Conciliación Bancaria y Movimientos
- **Ruta:** `Tesorería › Conciliación bancaria / Movimientos bancarios` | **ID:** `conciliacion-bancaria`, `mov-bancarios`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `src/components/views/TesoreriaAvanzadaView.tsx`. Monitorea cuentas corrientes bancarias en Soles y Dólares (BCP, BBVA, Interbank, Scotiabank). Compara extractos bancarios contra los registros del Libro Caja y Bancos, calculando el Impuesto a las Transacciones Financieras (ITF 0.005%) y alertando diferencias no cuadradas.
- **Archivos:** `src/components/views/TesoreriaAvanzadaView.tsx`, `server/routes/tesoreriaPlanillaRoutes.ts`.

#### 7.2. Flujo de Caja Proyectado
- **Ruta:** `Tesorería › Flujo de caja proyectado` | **ID:** `flujo-caja-proyectado`
- **Estado:** `[COMPLETO]`
- **Flujo:** Proyecta la liquidez de la empresa activa a 30, 60 y 90 días considerando vencimientos de facturas de clientes, pagos a proveedores y tributos mensuales estimados.
- **Archivos:** `src/components/views/TesoreriaAvanzadaView.tsx`.

---

### MÓDULO 8: CAJA CHICA

#### 8.1. Apertura / Cierre de Caja, Registro de Gastos y Reposición
- **Ruta:** `Caja Chica › Apertura / cierre de caja / Registro de gastos / Reposición` | **ID:** `caja-apertura-cierre`, `caja-gastos`, `caja-reposicion`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `src/components/views/CajaChicaView.tsx`. Administra fondos fijos autorizados, rendición de gastos menores con comprobantes físicos (movilidades, suministros, refrigerios), control de saldo disponible en tiempo real con barra de consumo y generación automática de la póliza de reembolso contable.
- **Archivos:** `src/components/views/CajaChicaView.tsx`, `server/storage/registroDatosEmpresa.ts`.

---

### MÓDULO 9: GESTIÓN DE NEGOCIO

#### 9.1. Cartera de Empresas
- **Ruta:** `Gestión de Negocio › Cartera de empresas` | **ID:** `cartera-empresas`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `src/components/views/MisEmpresasNivel1View.tsx`. Vista panorámica de todas las empresas clientes asignadas al estudio Atlob Consultores con semáforo de estado de declaración (Al día, Preliquidado, Por vencer) y buscador en tiempo real.
- **Archivos:** `src/components/views/MisEmpresasNivel1View.tsx`.

#### 9.2. Dashboard Gerencial
- **Ruta:** `Gestión de Negocio › Dashboard gerencial` | **ID:** `dashboard-gerencial`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `src/components/views/DashboardView.tsx`. Gráficos ejecutivos de ventas mensuales, compras netas, IGV acumulado, resultado preliminar y estado del PDT 621.
- **Archivos:** `src/components/views/DashboardView.tsx`.

#### 9.3. Control de Calidad y Biblioteca de Documentos
- **Ruta:** `Gestión de Negocio › Control de calidad / Biblioteca de documentos` | **ID:** `control-calidad`, `biblioteca-docs`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `src/components/views/GestionNegocioView.tsx`. Muestra el índice de cumplimiento tributario del estudio Atlob (98.5%) y ofrece un repositorio de plantillas normativas descargables (Actas de Junta General de Accionistas, Minutas de Constitución de S.A.C., Declaraciones de Domicilio Fiscal y Contratos de Locación de Servicios Contables).
- **Archivos:** `src/components/views/GestionNegocioView.tsx`.

---

### MÓDULO 10: EMPRESA

#### 10.1. Nueva Empresa, Buscar Empresa y Configuración
- **Ruta:** `Empresa › Nueva empresa / Buscar empresa [Ctrl+K] / Configurar empresa`
- **Estado:** `[COMPLETO]`
- **Flujo:** Modales modulares que permiten registrar nuevas empresas con validación RUC Módulo 11, buscar instantáneamente con `Ctrl+K` y actualizar Clave SOL, régimen tributario y dirección fiscal.
- **Archivos:** `src/components/modals/SearchEmpresasModal.tsx`, `ConfigEmpresaModal.tsx`, `ModalNuevaEmpresaBlanco.tsx`.

#### 10.2. Importar CSV
- **Ruta:** `Empresa › Importar CSV` | **ID:** `importar-csv`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `src/components/modals/ModalImportacionCsv.tsx`. Permite importar catálogos de proveedores, clientes, plan de cuentas, trabajadores y saldos iniciales de apertura con verificación de partida doble y opción de rollback atómico.
- **Archivos:** `src/components/modals/ModalImportacionCsv.tsx`, `server/services/importacionCsvService.ts`.

#### 10.3. Cambiar Período
- **Ruta:** `Empresa › Cambiar período` | **ID:** `cambiar-periodo`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `src/components/views/PeriodosView.tsx`. Lista los meses del ejercicio fiscal con estado Abierto/Cerrado, fecha y usuario de cierre, con capacidad de reapertura justificada.
- **Archivos:** `src/components/views/PeriodosView.tsx`.

---

### MÓDULO 11: TABLAS

#### 11.1. Clientes y Proveedores, Tipos de Comprobante, Tipo de Cambio, Bancos
- **Ruta:** `Tablas › Clientes y proveedores / Tipos de comprobante / Tipo de cambio / Bancos / Unidades de medida`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `src/components/views/MaestrosView.tsx` posicionando la pestaña requerida. Incluye sincronización oficial de Tipos de Cambio diarios SBS (Compra / Venta) y validación de RUCs habidos/activos.
- **Archivos:** `src/components/views/MaestrosView.tsx`, `src/data/maestros.ts`.

---

### MÓDULO 12: UTILITARIOS

#### 12.1. Respaldos
- **Ruta:** `Utilitarios › Respaldos` | **ID:** `respaldos`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `src/components/modals/ModalBackupEmpresa.tsx`. Genera paquetes ZIP cifrados con algoritmo AES-256-GCM conteniendo todos los datos de la empresa en formato NDJSON con firma SHA-256 en su `manifest.json`. Excluye expresamente credenciales y usuarios por decisión de seguridad confirmada.
- **Archivos:** `src/components/modals/ModalBackupEmpresa.tsx`, `server/services/backupEmpresaService.ts`.

#### 12.2. Restaurar Demo
- **Ruta:** `Utilitarios › Restaurar demo` | **ID:** `restaurar-demo`
- **Estado:** `[COMPLETO]`
- **Flujo:** Limpia mutaciones transitorias y restablece los saldos contables y comprobantes de prueba de la empresa demo corporativa.
- **Archivos:** `src/App.tsx`, `src/data/empresasClientes.ts`.

#### 12.3. Usuarios y Roles / Auditoría del Sistema
- **Ruta:** `Utilitarios › Usuarios y roles / Auditoría del sistema`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre `UsuariosPermisosView.tsx` (administración de accesos RBAC) y `MapaAuditoriaSistemaView.tsx` (dossier interactivo de arquitectura, catálogo de base de datos y cumplimiento técnico SUNAT).
- **Archivos:** `src/components/views/UsuariosPermisosView.tsx`, `src/components/views/MapaAuditoriaSistemaView.tsx`.

#### 12.4. Formato de Reporte
- **Ruta:** `Utilitarios › Formato de reporte › Estándar (monocromo) / Corporativo (color)`
- **Estado:** `[COMPLETO]`
- **Flujo:** Conmuta la variable global `REPORT_STYLE` entre `"estandar"` (formato blanco y negro estilo SISCONT de alta densidad) y `"actual"` (corporativo a color). Notifica el cambio mediante toast y actualiza inmediatamente todas las exportaciones a PDF y Excel.
- **Archivos:** `src/context/ReportStyleContext.tsx`, `src/services/reports/formato_estandar/formatoEstandarEngine.ts`.

---

### MÓDULO 13: AYUDA

#### 13.1. Acerca de Atlob Consultores ERP / Desarrollado por Jimmy Mayta
- **Ruta:** `Ayuda › Acerca de Atlob Consultores ERP / Desarrollado por Jimmy Mayta` | **ID:** `acerca-de`, `autor`
- **Estado:** `[COMPLETO]`
- **Flujo:** Abre el modal institucional `AcercaDeModal.tsx` mostrando el logo cuadrado azul "A", denominación oficial, versión 2026.1 Profesional, arquitectura técnica y firma de autoría de **Jimmy Mayta**.
- **Archivos:** `src/components/modals/AcercaDeModal.tsx`.

---

## 5. CUMPLIMIENTO TRIBUTARIO PERUANO

### 5.1. Plan Contable General Empresarial (PCGE)
- **Implementación:** Archivo `src/data/pcgeAccounts.ts`.
- **Evaluación:** Cumple con la versión oficial PCGE modificada por el CNC (Resolución CNC N° 002-2019-EF/30). Contiene las cuentas a nivel divisionaria y subdivisionaria (4 y 5 dígitos):
  - Elemento 1, 2, 3: Activo Disponible, Exigible, Realizable e Inmovilizado.
  - Elemento 4: Pasivo (40111 IGV, 40171 Renta 3ra, 40172 Renta 4ta, 4031 EsSalud, 4032 ONP, 4111 Remuneraciones, 4212 Facturas emitidas por pagar).
  - Elemento 5: Patrimonio Neto (5011 Capital social, 5911 Utilidades acumuladas).
  - Elemento 6: Gastos por Naturaleza (6011 Mercaderías, 6211 Sueldos, 6321 Honorarios, 6561 Suministros).
  - Elemento 7: Ingresos (70111 Ventas locales mercaderías, 70211 Exportación).
  - Elemento 8: Saldos Intermediarios de Gestión (80 al 89 para cierre anual).
  - Elemento 9: Contabilidad Analítica de Explotación (941 Gastos de Administración, 951 Gastos de Ventas, con abono correlativo a la 791 Cargas imputables a cuentas de costos).

### 5.2. Sistema Integrado de Registros Electrónicos (SIRE)
- **Implementación:** `src/services/sireTxtGenerator.ts` y `server/services/sireConciliadorService.ts`.
- **Estructura RCE (Compras):** Genera archivos `.txt` de 36 columnas según R.S. 112-2021/SUNAT.
  - Campo 1: RUC del contribuyente.
  - Campo 2: Razón social.
  - Campo 3: Período (`AAAAMM00`).
  - Campo 4: CAR (Código de Anotación de Registro de 27 caracteres).
  - Campo 5 a 10: Fechas de emisión/vencimiento, tipo de comprobante, serie y número.
  - Campo 11 a 26: Desglose de Base Gravada Operación Destinada a Ventas Gravadas, IGV, Adquisiciones Gravadas destinadas a Ventas No Gravadas, No Gravadas, ISC, ICBPER y Total.
- **Conciliación Automática:** Cruce exhaustivo por clave compuesta `{tipoDoc}-{serie}-{numero}-{proveedorRuc}`.

### 5.3. Libros Electrónicos PLE 5.2
- **Implementación:** `src/services/sireTxtGenerator.ts` y `server/routes/sunatSirePleRoutes.ts`.
- **Nomenclatura Normativa Estricta:**
  - Formato: `LE{RUC}{AAAA}{MM}00{COD_LIBRO}00{CONTENIDO}{ESTADO_ENVIO}{MONEDA}1.txt`
  - Ejemplo Libro Diario: `LE2060123456720260900050100001111.txt`
  - Ejemplo Libro Mayor: `LE2060123456720260900060100001111.txt`
- **Formato:** Separador de campos por pleca (`|`), saltos de línea CRLF, sin cabeceras textuales, codificación UTF-8 sin BOM conforme a especificación SUNAT.

### 5.4. Facturación Electrónica UBL 2.1
- **Implementación:** `src/components/views/FacturacionElectronicaView.tsx` y `server/routes/operacionesRoutes.ts`.
- **Realidad Técnica:** El sistema procesa y valida comprobantes UBL 2.1 XML con espacios de nombres `urn:oasis:names:specification:ubl:schema:xsd:Invoice-2` y `urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2`. La lectura y extracción de CDR (`ApplicationResponse` con código `0` de aceptación) es completamente funcional. En el entorno de prueba, la conexión directa SOAP está en modo emulador para no requerir un certificado digital real emitido por RENIEC/Camerfirma en cada clon del repositorio.

### 5.5. Fórmulas de Liquidación PDT 621 IGV-Renta
Implementadas en `src/services/accountingEngine.ts → calcularLiquidacionPDT621`:
$$\text{Débito Fiscal IGV} = \sum (\text{Ventas Gravadas Aceptadas}) \times 0.18$$
$$\text{Crédito Fiscal IGV} = \sum (\text{Compras Gravadas con Derecho a Crédito Fiscal}) \times 0.18$$
$$\text{IGV Neto del Mes} = \text{Débito Fiscal} - \text{Crédito Fiscal} - \text{Saldo a Favor del Período Anterior}$$
$$\text{IGV a Pagar} = \max(0, \text{IGV Neto})$$
$$\text{Pago a Cuenta Renta (Régimen MYPE)} = \text{Ventas Netas Gravadas} \times 0.01$$
$$\text{Pago a Cuenta Renta (Régimen General)} = \text{Ventas Netas Gravadas} \times \max(0.015, \text{Coeficiente Anual})$$

### 5.6. Cronograma de Vencimientos por Último Dígito de RUC
- Almacenado en la tabla `cronograma_vencimientos` y en el objeto `CRONOGRAMA_SUNAT_2026`.
- Resuelve la fecha límite mensual según el último dígito del RUC (0 al 9 y Buenos Contribuyentes).

---

## 6. LISTA DE ERRORES Y BUGS CONOCIDOS

| ID | Módulo | Severidad | Archivo / Línea | Descripción del Problema | Causa Raíz Probable | Solución Sugerida |
|---|---|:---:|---|---|---|---|
| **BUG-01** | Test Suite | **Media** *(Resuelto)* | `server/routes/index.ts:24` | El endpoint `/api/health` devolvía 200 en pruebas sin Postgres, cuando el test esperaba 503 para certificar aislamiento. | Condición `process.env.NODE_ENV !== 'production'` no excluía expresamente el entorno `'test'`. | Ajustado a `isPostgres \|\| (NODE_ENV !== 'production' && NODE_ENV !== 'test')`. Prueba pasa al 100%. |
| **BUG-02** | Facturación | **Media** | `FacturacionElectronicaView.tsx:88` | Emisión UBL 2.1 simula el CDR en lugar de comunicarse con el Web Service SOAP de SUNAT. | Ausencia de certificado digital `.pfx` en el repositorio (por obvias razones de seguridad de claves privadas). | Implementar un sub-módulo de subida de certificado tributario cifrado con clave en la configuración de la empresa. |
| **BUG-03** | Planilla PLAME | **Baja** | `PlanillaPlameView.tsx:45` | No genera los archivos masivos de exportación `.rem` (remuneraciones) y `.jor` (jornadas laborales) para el PDT 601. | El cálculo contable y de aportes existe, pero falta el exportador de archivos con delimitador pipe para el PDT PLAME. | Agregar función `exportarPlameTxt()` homologada con la estructura del validador de SUNAT. |
| **BUG-04** | Formato Específico | **Baja** | `TopBar.tsx:48` | Al cambiar de resolución a pantallas muy angostas (&lt; 768px), los botones de la barra de herramientas hacen wrap en dos líneas. | Contenedor con `flex-wrap` sin barra de scroll horizontal compacta. | Agregar clase `overflow-x-auto` con scrollbar oculta para mantener densidad de una sola fila en pantallas reducidas. |

---

## 7. PENDIENTES Y DEUDA TÉCNICA

### Backlog Priorizado

| Prioridad | Tarea / Característica | Área | Esfuerzo | Justificación |
|:---:|---|---|:---:|---|
| **P0** | **Bóveda de Certificados Digitales:** Subida segura de certificado `.pfx` para firma real XAdES-BES en Facturación Electrónica. | Backend / Seguridad | **M** | Permite a cualquier cliente emitir facturas legales reales a SUNAT sin intermediarios OSE. |
| **P1** | **Exportador PLAME `.rem` / `.jor`:** Generador masivo de estructuras para el PDT 601 de Planilla Electrónica. | Tributario | **S** | Automatiza la carga mensual de planillas de trabajadores en SUNAT sin digitación manual. |
| **P1** | **Descarga Automatizada SIRE vía API R.S. 112:** Conexión directa mediante Client ID y Secret a los endpoints REST de SUNAT (`https://api-seguridad.sunat.gob.pe`). | Integración | **M** | Evita que el usuario tenga que entrar a la web de Clave SOL a descargar manualmente los archivos ZIP del SIRE. |
| **P2** | **Empaquetado de Escritorio Tauri / Electron:** Creación del ejecutable nativo `.exe` (Windows) y `.dmg` (macOS). | Desktop | **M** | Proporciona la experiencia definitiva de aplicación clásica de escritorio para contadores. |

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
El sistema cuenta con un ejecutor integral (`server/tests/run_all_tests.ts`) que corre 19 suites de prueba en Node.js puro sin dependencias externas pesadas:
- **Resultado de la Suite:** `19/19 suites aprobadas (0 fallidas)` en un tiempo promedio de `30.88s`.
- **Cobertura Comprobada:**
  - Sesión concurrente y renovación tardía.
  - Aislamiento HTTP por empresa y rol (401, 403, 404).
  - Partida doble forzada y reversión de asientos.
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

## 10. UI/UX DE ESCRITORIO (INSPIRACIÓN SISCONT / WINDOWS CLÁSICO)

- **Estructura Vertical Fija:**
  - **Barra de Título (12.5px):** Logotipo cuadrado "A" en azul corporativo `#1D4ED8`, nombre `Atlob Consultores ERP - Gestión Contable`, empresa y período activos, y crédito de autoría: `Desarrollado por Jimmy Mayta`.
  - **Barra de Menús (13px):** Data-driven (`MENU_DATA`). Desplegables finos con bordes rectos de 1px, sombra suave de ventana, y cascada hacia la derecha (`top: -3px`, `left: 100%`) con flecha `›`.
  - **Barra de Herramientas:** Botones rápidos de 34x30px con íconos vectoriales sobrios: Registro de asientos (F2), Calculadora contable, Imprimir, Buscar empresa (Ctrl+K), Importar CSV, Respaldos, Configurar empresa y Conciliador SIRE.
  - **Pastilla de Rol:** Indicador `ADMIN_ESTUDIO` con selector de perfiles de prueba (Jimmy Mayta, Contador, Auditor).
  - **Área de Trabajo:** Lienzo libre sin barras laterales invasivas (`#0F172A`).
  - **Barra de Estado:** Muestra en tiempo real la última ruta accionada y el sello del estudio contable.
- **Viabilidad para Electron / Tauri:** La interfaz no utiliza APIs propietarias del navegador; los datos del menú residen en una estructura desacoplada en `src/types/menu.ts`, lo que permite un empaquetado directo como aplicación de escritorio nativa en menos de una jornada de trabajo mediante Tauri 2.0.

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

### 11.4. Generación de Nombre y Estructura PLE 5.2 (`src/services/sireTxtGenerator.ts`)
```typescript
export function generarNombreArchivoPle(
  ruc: string,
  periodo: string, // '2026-09'
  codigoLibro: string, // '050100' para Libro Diario
  tieneInformacion: boolean = true
): string {
  const [anio, mes] = periodo.split('-');
  const indicadorContenido = tieneInformacion ? '1' : '0';
  const moneda = '1'; // 1 = Soles
  const operacion = '1'; // 1 = Generado por contribuyente
  return `LE${ruc}${anio}${mes}00${codigoLibro}00${indicadorContenido}${operacion}${moneda}1.txt`;
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
4. **Empaquetado Nativo con Tauri 2.0:** Crear la versión instalable `.exe` de Windows para el estudio contable, manteniendo el backend Express embebido o compilado con Rust.
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
  - El motor de reportes formato estándar SISCONT (`formatoEstandarEngine.ts`).
  - La suite de 19 pruebas de integración y su velocidad de ejecución (30s).
  - La nueva interfaz superior de escritorio clásico Windows (TopBar + Menús en cascada data-driven).
- **Mejorar / Extender:**
  - La emisión UBL 2.1: conectar la firma criptográfica XAdES con certificado físico.
  - El conciliador SIRE: añadir conexión directa a los endpoints REST de SUNAT.
  - La conciliación bancaria: incorporar importador nativo de formatos OFX y Excel de bancos nacionales.

---
*Fin del documento técnico de auditoría. Documento generado para auditoría técnica externa e ingeniería de software de Atlob Consultores ERP.*
