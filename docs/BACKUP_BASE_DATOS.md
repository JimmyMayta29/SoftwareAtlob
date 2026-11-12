# ESTRATEGIA DE RESPALDO Y RESTAURACIÓN — ATLOB ERP

Este documento especifica la política operativa de copias de seguridad de nivel de infraestructura (sysadmin/DevOps) para la base de datos PostgreSQL y documenta con precisión el alcance real vigente del respaldo por empresa implementado en la plataforma.

---

## 1. Niveles de Respaldo

| Nivel | Mecanismo | Formato | Frecuencia | Destino | Responsable |
|---|---|---|---|---|---|
| **Nivel 1: Por Empresa (estado actual en código)** | `backupEmpresaService` | ZIP cifrado AES-256-GCM (`{ruc}_2026_{ts}.zip`) con `manifest.json`, `empresa.json`, `auditoria.ndjson` y 20 `.ndjson` de arreglos `*_MEMORIA` | Manual, automático al entrar (`AUTO_ENTRADA`, debounce 60 min) y previo a cierre/importación | `BACKUPS_MEMORIA` (máx. 10 en RAM por empresa) / descarga manual HTTP | `ADMINISTRADOR` (generar, auto-check, verificar, restaurar); miembro autorizado (listar, descargar) |
| **Nivel 2: Base de Datos Completa** | `pg_dump` binario | `.dump` comprimido custom (`-Fc`) | Diario (02:00 UTC recomendado) | Almacenamiento externo cifrado | Sysadmin / DevOps |
| **Nivel 3: WAL Archiving (PITR)** | Continuous Archiving | Segmentos WAL de 16MB | Continuo | Almacenamiento remoto seguro | Infraestructura PostgreSQL |

---

## Alcance de cada tipo de respaldo

### (a) Respaldo físico con `pg_dump` y WAL (infraestructura PostgreSQL)

- **Qué incluye:** Respalda íntegramente el contenido almacenado en PostgreSQL dentro de la base de datos seleccionada (`81` entradas de tablas en `REGISTRO_DATOS_EMPRESA` de `server/storage/registroDatosEmpresa.ts` — incluyendo las `61` tablas de negocio de ámbito `empresa`, las `13` de `control` como `usuarios_estudio`, `roles`, `membresias`, `licencia` y `estudio_configuracion`, y las `7` compartidas — además de las credenciales cifradas guardadas en columnas de base y el esquema `staging`). Con archivado WAL continuo permite recuperación puntual (PITR).
- **Qué no incluye:** No respalda directorios ni archivos binarios externos ubicados fuera de PostgreSQL ni la configuración local de usuario Windows (`instalacion.bin` cifrado con DPAPI ni el archivo `.env` local). Si se restauran datos que contienen secretos cifrados, se requiere continuidad de las claves de instalación correspondientes ([ESCRITORIO_WINDOWS.md](engineering/ESCRITORIO_WINDOWS.md)).
- **Nota sobre los ejemplos operativos de este documento:** Los ejemplos de la sección siguiente muestran una plantilla externa para administración de sistemas (`scripts/backup_postgres.sh`, `atlob_erp_db`, `atlob_admin`); **dicho archivo `scripts/backup_postgres.sh` no forma parte del repositorio** (en instalaciones locales el nombre sugerido de base es `sistema_contable` y el rol operativo es `contabilidad_app`).

### (b) Respaldo lógico por empresa desde la aplicación (`backupEmpresaService.ts` y `backupEmpresaController.ts`)

Conforme al diseño vigente previo a la implementación completa de la Fase **B2** ([PLAN_IMPLEMENTACION.md](engineering/PLAN_IMPLEMENTACION.md)):

- **Permisos HTTP (`server/routes/backupEmpresaRoutes.ts`):** Todos los endpoints requieren sesión autenticada (`requireAuth`). Generar manual (`POST /empresas/:empresaId/backups/generar`), chequeo automático (`POST .../auto-check`), verificar (`POST .../verificar`) y restaurar (`POST .../restaurar`) están restringidos al rol **`ADMINISTRADOR`** de la empresa; listar (`GET .../backups`) y descargar (`GET .../backups/:backupId/descargar`) exigen membresía activa sobre la empresa.
- **Formato y cifrado (`server/services/backupEmpresaService.ts`):** Empaqueta un archivo ZIP (`{ruc}_2026_{timestamp}.zip`) y cifra el contenedor completo con **AES-256-GCM** (`IV` de 12 bytes + `AuthTag` de 16 bytes + contenido cifrado), derivando clave simétrica de 32 bytes con PBKDF2-SHA256 (`10,000` iteraciones, sal `'atlob_estudio_salt_2026'`) desde `passwordCifrado` opcional o `env.BACKUP_ENCRYPTION_KEY`. El controlador acepta subida de archivo en base64 (`archivoBase64`) o referencia por `backupId` y sirve descargas con `Content-Type: application/zip`.
- **Qué SÍ incluye hoy al generar:**
  - `manifest.json`: `ruc`, `razonSocial`, `ejercicio` (`2026`), `esquemaVersion` (`2.0.0-fase13`), `fechaUtc`, `usuarioId`, `origen` y mapa de `archivos` con conteo de líneas y SHA-256 de cada entrada.
  - `empresa.json`: obtenido vía `empresaRepository.obtenerPorId(empresaId)` (**sí consulta PostgreSQL `empresas` si hay conexión activa**), proyectando únicamente `{ id, ruc, razonSocial, nombreComercial, regimenTributario, domicilioFiscal, monedaPrincipal, createdAt }`.
  - `auditoria.ndjson`: exportado vía `auditoriaChainService.exportarPorEmpresa(empresaId)` (**sí consulta `auditoria_log` en PostgreSQL si hay conexión activa**), filtrando detalles sensibles mediante `filtrarDetalleAuditoria`.
  - **20 archivos `.ndjson` leídos exclusivamente desde arreglos en memoria (`*_MEMORIA`):** `periodos`, `asientos`, `compras`, `cxp`, `ventas`, `cxc`, `anexos`, `cuentas_financieras`, `movimientos_tesoreria`, `trabajadores`, `planillas`, `planilla_gratificaciones`, `planilla_cts`, `liquidaciones_beneficios`, `tregistro_movimientos`, `articulos_kardex`, `declaraciones_pdt621`, `declaraciones_prorrata_igv`, `declaraciones_renta_anual` y `daot_exclusiones`.
- **Qué NO incluye ni realiza actualmente:**
  - **Tablas transaccionales PostgreSQL:** Más allá de leer `empresas` para `empresa.json`, `auditoria_log` para `auditoria.ndjson` y registrar el evento de respaldo/restauración mediante `auditoriaRepository.registrar`, el servicio **NO exporta ni restaura las tablas persistentes de PostgreSQL** (`61` tablas de ámbito `empresa` declaradas en `REGISTRO_DATOS_EMPRESA`). Al invocar `restaurarBackup` (previa validación `confirmacionRuc.trim() === empresa.ruc.trim()`), la restauración **solo reemplaza en memoria RAM** los `20` arreglos `*_MEMORIA` de esa empresa (no escribe en PostgreSQL ni sobrescribe `empresas` ni `auditoria_log`).
  - **Carpetas de archivos en disco (`REGISTRO_ARCHIVOS_EMPRESA`):** **NO incluye ni restaura** archivos físicos en disco de ninguna de las `7` entradas registradas en `server/storage/registroDatosEmpresa.ts` (`5` exportables declaradas: `adjuntos`, `xml`, `cdr`, `pdf`, `txt`; y `2` excluidas por política: `temporales`, `respaldos`), pues el almacenamiento de archivos `archivosEmpresa.ts` aún corresponde a Fase **B2**.
  - **Credenciales SUNAT y control de usuarios/roles:** Excluidos explícitamente. No exporta credenciales SOL/SUNAT ni entidades de control (`usuarios_estudio`, `roles`, `usuario_empresa`, `membresias`, `refresh_tokens`, `licencia`).
  - **Almacenamiento actual de los backups generados:** Tanto la lista como los buffers binarios de respaldo (`archivoZipBuffer`) se conservan únicamente en el arreglo en memoria **`BACKUPS_MEMORIA`** (con retención máxima de **`RETENCION_MAXIMA_BACKUPS = 10`** copias por empresa y control de tiempo de ingreso automático en `MARCAS_AGUA_EMPRESA` con intervalo de 60 minutos). Al reiniciar el proceso del servidor, el historial mantenido en memoria se pierde salvo que el administrador haya descargado manualmente el `.zip`.

---

## 2. Plantilla Operativa de Respaldo Físico (`pg_dump` — ejemplo externo, no existe en el repo)

```bash
#!/usr/bin/env bash
# ==============================================================================
# Script de Backup Diario PostgreSQL — Atlob Consultores ERP
# Modo de uso: ./scripts/backup_postgres.sh
# ==============================================================================
set -euo pipefail

# Configuración
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%SZ")
BACKUP_DIR="${BACKUP_DIR:-/var/backups/atlob_erp}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-atlob_erp_db}"
DB_USER="${DB_USER:-atlob_admin}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

FILENAME="atlob_erp_db_${TIMESTAMP}.dump"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -u)] Iniciando pg_dump para ${DB_NAME} en ${DB_HOST}:${DB_PORT}..."

# Exportar dump comprimido con formato personalizado (-Fc) para soporte de pg_restore multi-hilo
PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -F c \
  -b \
  -v \
  -f "${FILEPATH}"

# Generar checksum SHA-256 para verificación de integridad
sha256sum "${FILEPATH}" > "${FILEPATH}.sha256"

echo "[$(date -u)] Backup generado exitosamente: ${FILEPATH} ($(du -h "${FILEPATH}" | cut -f1))"

# Rotación de copias locales (retención de 30 días)
find "${BACKUP_DIR}" -name "atlob_erp_db_*.dump*" -mtime "+${RETENTION_DAYS}" -exec rm -f {} \;

echo "[$(date -u)] Rotación completada. Backups anteriores a ${RETENTION_DAYS} días eliminados."
```

---

## 3. Configuración del Cron Job (Sysadmin)

Editar la tabla de tareas de cron del usuario `postgres` o de servicio:
```bash
crontab -e
```

Agregar la siguiente entrada para ejecución diaria a las 02:00 AM UTC:
```cron
# Respaldo completo de la base de datos PostgreSQL de Atlob Consultores ERP
0 2 * * * /opt/atlob_erp/scripts/backup_postgres.sh >> /var/log/atlob_erp_backup.log 2>&1
```

---

## 4. Procedimiento de Restauración (`pg_restore`)

### 4.1 Verificación de Integridad Previa
```bash
sha256sum -c atlob_erp_db_20261004_020000Z.dump.sha256
```

### 4.2 Restauración en Entorno de Pruebas o Recuperación ante Desastres
```bash
# 1. Crear base de datos limpia de destino
createdb -h localhost -U atlob_admin -p 5432 atlob_erp_db_recovery

# 2. Ejecutar restauración en paralelo (-j 4)
pg_restore \
  -h localhost \
  -p 5432 \
  -U atlob_admin \
  -d atlob_erp_db_recovery \
  -v \
  --clean \
  --if-exists \
  -j 4 \
  atlob_erp_db_20261004_020000Z.dump
```

---

## 5. Pruebas Periódicas de Restauración (Simulacro)

De acuerdo con las directrices de seguridad de la información y la Ley N° 29733:
1. Se debe realizar un simulacro de restauración en base de datos aislada el primer domingo de cada mes.
2. Comprobar que las sumas de saldos contables en la tabla `asientos` coincidan exactamente antes y después del restore.
3. Registrar la fecha, duración y resultado en el cuaderno de bitácora de auditoría.
