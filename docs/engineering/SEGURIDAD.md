# Seguridad del servidor y aislamiento de datos

El arranque en producción requiere `DATABASE_URL` y los cinco secretos `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SUNAT_ENCRYPTION_KEY`, `MFA_SEED_SECRET` y `BACKUP_ENCRYPTION_KEY`. Cada secreto exige 32 bytes aleatorios codificados como 64 caracteres hexadecimales, diversidad suficiente de bytes, ausencia de reutilización entre variables y ausencia de coincidencia con huellas SHA-256 históricas conocidas. Si cualquier variable falta, es corta o coincide con un valor histórico, `server/config/env.ts` aborta el arranque con código de salida `1` sin imprimir el valor secreto. En desarrollo y pruebas se generan valores efímeros por proceso. Si `DOTENV_CONFIG_PATH` se define vacío (`""`), el cargador omite `.env` en disco para evaluar únicamente el entorno inyectado al proceso.

## Valores históricos y plan de recifrado

Los siguientes tipos de valores estuvieron disponibles en el historial anterior. El verificador de arranque conserva únicamente huellas SHA-256 para rechazar su reutilización.

| Tipo | Ubicación histórica | Tratamiento |
|---|---|---|
| Firma de acceso y renovación JWT | `server/config/env.ts`, documentación antigua | Cambiar ambas claves e invalidar sesiones emitidas con ellas |
| Cifrado de credenciales y claves de empresa | `server/config/env.ts`, `server/services/cryptoService.ts`, `server/utils/crypto.ts` | Inventariar registros v1 y v2 y ejecutar recifrado autorizado fuera de línea o por lote transaccional |
| MFA y contraseñas de demostración | `server/services/authJwtService.ts`, documentación antigua | Credenciales fijas eliminadas; MFA individual al configurar el estudio |
| Clave de respaldo | `server/services/backupEmpresaService.ts` | Tratar respaldos históricos cifrados con clave fija como expuestos |
| Contraseñas de bases descartables | `.github/workflows/test-pg.yml`, `docker-compose.test.yml` | Generación aleatoria de 32 bytes en cada ejecución |
| Claves SOL y secretos SIRE de demostración | `src/data/empresasClientes.ts` y vistas antiguas | Eliminados del código y verificados con `test_secretos_frontend.ts` |
| API de IA | `.env.example` histórico y `@google/genai` | Variable `GEMINI_API_KEY` eliminada de `.env.example` y dependencia retirada (`0` referencias en código) |

Una migración de cifrado v1 a v2 requiere autorización explícita y respaldo previo verificado:
1. Inventariar en solo lectura las filas cifradas en `credenciales_sunat`, `sunat_conexiones`, `sunat_tokens`, `sunat_empresa_keys` y `trabajadores` (`cuenta_banco_sueldo_cifrada`, `cci_sueldo_cifrado`).
2. Por empresa y dentro de una transacción con contexto RLS activo, descifrar en memoria con la clave anterior, recifrar con `SUNAT_ENCRYPTION_KEY` vigente (o reenvolver la DEK en `sunat_empresa_keys` con nueva `key_version`), verificar la etiqueta GCM antes de confirmar y retirar la clave antigua tras auditar todas las filas.

## Auditoría inmutable y sanitización por lista blanca

- **Sin reescritura histórica:** `auditoria_log` está protegida por el trigger append-only `trg_inmutabilidad_auditoria` (`AUDITORIA_INMUTABLE` ante `UPDATE`, `DELETE` o `TRUNCATE`) y por la cadena criptográfica SHA-256 (`auditoriaChainService.verificarIntegridad`). Las filas históricas nunca se reescriben en almacenamiento.
- **Doble barrera en `seguridadDatos.ts`:**
  1. **Primera barrera (lista blanca):** `filtrarDetalleAuditoria(tabla, datos)` proyecta exclusivamente los campos permitidos por tabla (`LISTA_BLANCA_POR_TABLA` y `CAMPOS_COMUNES_AUDITORIA`), descartando cualquier propiedad no listada; para tablas de credenciales (`credenciales_sunat`, `sunat_conexiones`, `sunat_empresa_keys`, `sunat_tokens`) admite únicamente indicadores booleanos y estados enumerados.
  2. **Segunda barrera (expresiones regulares):** `campoSensible` y `sanitizarMensaje` redactan tokens `Bearer`, JWTs (`eyJ...`), URLs con credenciales (`postgresql://[REDACTADO]@...`) y pares clave-valor sensibles tanto en escrituras nuevas como al proyectar/enmascarar lecturas (`auditoriaRepository.listarPorEmpresa`) y exportaciones/respaldos (`auditoriaChainService.exportarPorEmpresa`, `backupEmpresaService.generarBackupZip`).

## Escáner estático de secretos en frontend

`server/tests/test_secretos_frontend.ts` aplica un enfoque **híbrido**:
- **Análisis sintáctico AST (ESTree)** mediante `parseSync` de `rolldown/utils` sobre archivos `.ts`, `.tsx`, `.js` y `.mjs` en `src/` y `dist/`, inspeccionando literales, plantillas, propiedades de objetos y variables con nombres de credenciales.
- **Expresiones regulares y huellas SHA-256** sobre todos los artefactos de texto y compilación (incluidos `.html`, `.css`, `.json`, `.svg`) para detectar JWTs embebidos, claves de API y huellas conocidas.

## Aislamiento RLS e integridad referencial compuesta

Las **81 tablas** del esquema `public` registradas en `REGISTRO_DATOS_EMPRESA` (`server/storage/registroDatosEmpresa.ts`: `61` de ámbito `empresa`, `13` de `control` y `7` de `compartido`, correspondiendo `80` tablas a las migraciones SQL y `schema_migrations` creada por `migrate.ts`) son **tablas ordinarias (`relkind = 'r'`)**, no tablas particionadas declarativas (`relkind = 'p'`). El aislamiento multiempresa se implementa mediante `empresa_id` + `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` bajo el rol `contabilidad_app` (`LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOBYPASSRLS`):

- **`runMigrations()` (`server/db/migrate.ts`):** ejecuta las **21 migraciones `.sql`** registradas en `MIGRATION_FILES` (`server/db/migration-files.ts`, tolerando variantes de fin de línea LF y CRLF en las huellas SHA-256 registradas en `schema_migrations`), activando RLS base (`ENABLE ROW LEVEL SECURITY`) en **23 tablas** (`10` con `FORCE ROW LEVEL SECURITY` explícito en SQL) más las semillas de catálogos globales (`runSeeds` y `runCatalogosSeeds`: `roles`, `parametros_tributarios`, `cronograma_vencimientos`, `plantilla_pcge`, `catalogos_sunat`, `pcge_base`). No ejecuta automáticamente `seguridadRls.ts` ni `fk_empresa_01..07.sql`.
- **Entorno de pruebas (`atlob_test`) y `ETAPAS_RLS` (`server/db/seguridadRls.ts`):** cubre adicionalmente **41 tablas** en las etapas `5.1` (`9` críticas: empresa/secretos SUNAT, identidad por `usuario_id` y `auditoria`), `5.2a` (`7`), `5.2b` (`10`), `5.2c` (`11`) y `5.3` (`4`), alcanzando **64 tablas distintas con RLS** entre migraciones y `ETAPAS_RLS` (las **17 restantes** de las 81 registradas corresponden a los `7` catálogos globales de ámbito `compartido` y `10` tablas de `control`/estudio sin datos operativos de empresa). *(Nota: `18` servicios backend, incluidos kardex, activos fijos, planillas, honorarios, caja chica, conciliación bancaria, cierre anual, PLE y respaldo por empresa, continúan operando en memoria `*_MEMORIA` aunque las tablas del esquema de 21 migraciones ya existan.)*
- **Diagnóstico de FKs compuestas (`server/db/diagnosticoFkEmpresa.ts`):** evalúa en modo `READ ONLY` las **75 relaciones** cubiertas por `server/db/fk_empresa_01_contabilidad.sql` .. `07_sire.sql` (`12 + 8 + 8 + 20 + 15 + 8 + 4`) para detectar filas huérfanas o referencias cruzadas entre empresas antes de aplicar el cambio. El relleno histórico de `empresa_id` afecta únicamente a las tablas hijas `reglas_contabilizacion_detalle` (`01_contabilidad`) y `planilla_lineas` (`05_planillas`), sin modificar `asientos` ni `asiento_detalle`.
- **Pruebas opcionales con Docker (`server/tests/real/test_pg_docker.ts`):** script opcional (`npm run test:pg:docker`, fuera de `npm test`) que comprueba previamente la disponibilidad de Docker y `docker compose` y emite un mensaje explícito si Docker no está instalado.
- **Base `sistema_contable` (escritorio):** en `server.ts` (`ATLOB_DESKTOP=1`), la conexión a `sistema_contable` fuerza `runMigrations({ verifyOnly: true })` verificando en solo lectura las **21 migraciones** de `MIGRATION_FILES` (con sus 23 tablas de RLS base en migraciones y 0 claves foráneas compuestas automáticas); la aplicación de `ETAPAS_RLS` y `fk_empresa_01..07.sql` queda fuera del migrador de arranque hasta aprobación operativa.
