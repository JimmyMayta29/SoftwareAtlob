# Procedimiento de Actualización, Respaldo y Recuperación — ATLOB ERP

**Objetivos operativos piloto:** `RPO ≤ 24 horas` · `RTO ≤ 60 minutos`  
**Métricas medidas en el equipo servidor (14/11/2026):**
- Generación + verificación SHA-256 real sobre PostgreSQL (`sistema_contable`, RUC `10722364002`): **`666.41 ms`** (`86,637` bytes, `61` archivos verificados).
- Restauración completa verificada en PostgreSQL real (`test_pg_backup_b2.ts`, `RTO`): **< 1 segundo** (meta ≤ 60 minutos).

---

## 1. Política de Respaldos (Alcance y Exclusiones)

De las **84 tablas reales** del esquema `public` en PostgreSQL (`server/storage/registroDatosEmpresa.ts`):
- Se respaldan en cada paquete cifrado `.atlob.bak` por empresa **las 60 tablas exportables de ámbito `empresa`** + fila de `empresas` (`61` archivos verificados en manifest) y las **5 carpetas de documentos exportables** (`adjuntos`, `xml`, `cdr`, `pdf`, `txt`).
- Se excluyen por seguridad **4 tablas de credenciales SUNAT** (`credenciales_sunat`, `sunat_conexiones`, `sunat_empresa_keys`, `sunat_tokens`), **12 tablas de control/identidad/migraciones** (`usuarios_estudio`, `roles`, `permisos`, `membresias`, `refresh_tokens`, etc.) y carpetas temporales.
- Cada archivo `.atlob.bak` se cifra con **AES-256-GCM** (etiqueta de autenticación de 16 bytes) y verifica hash **SHA-256** de cada archivo en `manifest.json` y del paquete completo (`.sha256`).
- **Únicamente el rol `ADMINISTRADOR`** puede generar o restaurar respaldos desde la interfaz o en el equipo servidor.

---

## 2. Respaldo Diario Automático y Verificación Manual

### Generar y verificar respaldo diario desde PowerShell:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\respaldo-diario.ps1
```
Ubicación de salida: `storage\respaldos\YYYY-MM-DD\<RUC>_<YYYYMMDDHHmmss>.atlob.bak` + archivo `.sha256` + entrada en `storage\respaldos\bitacora-respaldos.json`.

### Verificar un respaldo existente sin restaurarlo:
```powershell
npx tsx scripts/ejecutar-respaldo-cli.ts --verificar "storage\respaldos\2026-11-14\<ARCHIVO>.atlob.bak"
```
Cualquier alteración de 1 bit en el paquete cifrado o en un NDJSON interno es rechazada determinísticamente.

### Respaldo físico complementario de PostgreSQL completo (incluye usuarios/roles del estudio):
Se recomienda copiar semanalmente el directorio `storage\respaldos\` a un disco externo/USB cifrado y realizar un respaldo de la base completa con `pg_dump.exe --format=custom`.

---

## 3. Procedimiento de Actualización Segura (Sin Pérdida de Datos)

Para actualizar ATLOB ERP a una nueva versión en el servidor:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\actualizar-sistema.ps1
```
El script ejecuta estrictamente en orden:
1. **Respaldo previo obligatorio** (`respaldo-diario.ps1`); si falla, **aborta** sin tocar nada.
2. Registra el commit estable previo en `storage\instancia\ultimo-commit-estable.txt`.
3. Descarga cambios con `git pull --ff-only` (y ejecuta `npm ci` solo si cambió `package-lock.json`).
4. Detiene **únicamente el PID registrado** en `atlob-lan.pid` (`detener-servidor-lan.ps1`).
5. Ejecuta migraciones idempotentes (`server/db/migrate.ts`), verificación TypeScript (`npm run lint`) y compilación (`npm run build`).
6. Inicia el servidor LAN (`iniciar-servidor-lan.ps1`) y confirma `/api/health`.

---

## 4. Reversión Segura ante Fallos (Rollback sin Destruir Datos Posteriores)

- **Nunca ejecutar `Stop-Process -Name node -Force`** (detendría procesos ajenos al sistema).
- Si una actualización presenta un problema de código o interfaz **y la base de datos no sufrió pérdida**, ejecute:
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\actualizar-sistema.ps1 -Rollback
  ```
  Este comando respalda primero el estado actual, detiene solo el PID de ATLOB ERP, revierte **solo los archivos de código** al último commit estable registrado en `ultimo-commit-estable.txt` **sin borrar ni sobrescribir asientos/comprobantes registrados en PostgreSQL**, recompila y reinicia el servicio.
- Si además se produjera corrupción o eliminación accidental en una empresa específica, utilice **Restauración Aislada por Empresa** (`backupEmpresaService.restaurarBackup` desde la UI de Administrador confirmando el RUC exacto de la empresa destino): restaura únicamente esa empresa dentro de una transacción atómica PostgreSQL sin afectar a las demás empresas del estudio.

---

## 5. Recuperación ante Reinicio o Apagado del Equipo Servidor

1. Al encender Windows, el servicio **`postgresql-x64-18`** arranca automáticamente (`StartType: Automatic`).
2. Para iniciar ATLOB ERP en red local ejecute:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\iniciar-servidor-lan.ps1
   ```
3. Toda información confirmada antes del apagado permanece intacta gracias a las transacciones ACID y WAL de PostgreSQL 18.
