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
| API de IA | `.env.example` histórico | Ejemplo mantenido vacío |

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

Todas las 78 tablas del esquema `public` son **tablas ordinarias (`relkind = 'r'`)**, no tablas particionadas declarativas (`relkind = 'p'`). El aislamiento multiempresa se implementa mediante `empresa_id` + `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` bajo el rol `contabilidad_app` (`LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOBYPASSRLS`):

- **`runMigrations()` (`server/db/migrate.ts`):** ejecuta exactamente 15 archivos `.sql` registrados en `schema_migrations` (que activan RLS base en 22 tablas) más las semillas de catálogos globales (`roles`, `parametros_tributarios`, `cronograma_vencimientos`, `plantilla_pcge`, `catalogos_sunat`). No ejecuta automáticamente `seguridadRls.ts` ni `fk_empresa_01..07.sql`.
- **Entorno de pruebas (`atlob_test`):** tiene aplicadas y verificadas las etapas `5.1` (críticas: empresa, identidad por `usuario_id` y auditoría), `5.2` (`5.2a`, `5.2b`, `5.2c` altas, incluyendo `planilla_lineas` derivada de `planillas`) y `5.3` (bajas), alcanzando **63 tablas con RLS + FORCE RLS** (las 15 restantes corresponden a 6 catálogos globales compartidos y 9 tablas de control/estudio sin datos operativos de empresa). Los módulos de kardex y activos fijos operan aún en memoria y se incorporarán al catálogo PostgreSQL cuando se agreguen sus tablas persistentes.
- **Diagnóstico de FKs compuestas (`server/db/diagnosticoFkEmpresa.ts`):** evalúa en modo `READ ONLY` las **75 relaciones** cubiertas por `server/db/fk_empresa_01_contabilidad.sql` .. `07_sire.sql` para detectar filas huérfanas o referencias cruzadas entre empresas antes de aplicar el cambio. El relleno histórico de `empresa_id` afecta únicamente a las tablas hijas `reglas_contabilizacion_detalle` (`01_contabilidad`) y `planilla_lineas` (`05_planillas`), sin modificar `asientos` ni `asiento_detalle`.
- **Pruebas opcionales con Docker (`server/tests/real/test_pg_docker.ts`):** script opcional (`npm run test:pg:docker`, fuera de `npm test`) que comprueba previamente la disponibilidad de Docker y `docker compose` y emite un mensaje explícito si Docker no está instalado.
- **Base `sistema_contable`:** permanece con sus 15 migraciones base (22 tablas con RLS y 0 claves foráneas compuestas aplicadas) hasta contar con autorización expresa del operador.
