# Guía Operativa de Despliegue Multiusuario en Red Local (Costo US$ 0.00)

## 1. Evaluación y Decisión de Arquitectura de Despliegue (Presupuesto US$ 0.00)

Para habilitar la operación simultánea de al menos **2 usuarios concurrentes** (por ejemplo, Contador Principal y Asistente Contable) compartiendo la misma base de datos PostgreSQL con visibilidad inmediata y **costo operativo mensual de US$ 0.00**, se evaluaron tres alternativas técnicas:

| Criterio Técnico / Operativo | Opción 1: Servidor Local Centralizado en LAN (Elegida) | Opción 2: Base de Datos en Nube Gratuita (Free Tier) | Opción 3: Túneles Públicos Temporales sobre Host Local |
| :--- | :--- | :--- | :--- |
| **Costo mensual recurrente** | **US$ 0.00** (infraestructura física ya existente en el estudio) | US$ 0.00 sujeto a recortes de cuota o suspensión por inactividad | US$ 0.00 con URLs efímeras o límites de ancho de banda |
| **Latencia de red (p95)** | **< 5 ms en red local** (p95 transaccional medido: ~1.11 s bajo ráfaga de 44 operaciones simultáneas) | 80 ms – 350 ms por consulta SQL (degrada cierres y libros mayores) | 60 ms – 250 ms adicionales por salto de retransmisión |
| **Límites de almacenamiento y conexiones** | **Sin límites artificiales** (capacidad total del disco local y pool configurable) | Límite estricto (0.5 GB – 1 GB y 10–20 conexiones máximas) | Límite de conexiones HTTP por minuto en planes gratuitos |
| **Soberanía y seguridad de datos** | **100% local en la red privada del estudio**; los datos tributarios nunca salen a terceros | Datos contables alojados en jurisdicciones externas | Exposición de puertos o tráfico a través de intermediarios externos |
| **Disponibilidad sin Internet** | **100% operativo** incluso ante cortes del proveedor de Internet (ISP) | Inoperativo si falla la conexión a Internet del estudio | Inoperativo si falla la conexión a Internet del estudio |

### Justificación de la arquitectura seleccionada
Se elige la **Opción 1: Servidor Local Centralizado en Red de Área Local (LAN) con PostgreSQL 18 Local**. En este esquema:
1. El **Equipo Host (Servidor Principal del Estudio)** ejecuta el motor **PostgreSQL 18** (`127.0.0.1:5432`) y el servidor de aplicación Node.js/Express (`0.0.0.0:3000`).
2. El **Usuario 1** opera desde el propio Equipo Host o desde su estación de trabajo (`http://<IP_LAN_HOST>:3000`).
3. El **Usuario 2** accede desde su estación de trabajo conectada a la misma red LAN/Wi-Fi corporativa mediante el navegador web apuntando a `http://<IP_LAN_HOST>:3000`.
4. Todas las transacciones pasan por el único pool central de conexiones hacia PostgreSQL, garantizando aislamiento por empresa (Row-Level Security), numeración correlativa atómica sin colisiones, bloqueo optimista por versión (`version`) y visibilidad inmediata (< 150 ms) entre usuarios.

---

## 2. Guía Paso a Paso de Configuración y Puesta en Marcha

### Paso 1: Asignar IP local fija al Equipo Host en la LAN
1. En el equipo principal del estudio (Windows), verificar la dirección IPv4 local:
   ```powershell
   ipconfig
   ```
   *(Ejemplo de IP local del Host: `192.168.1.50`)*.
2. Se recomienda reservar dicha IP (`192.168.1.50`) en el router del estudio mediante **DHCP Reservation** (por dirección MAC) o configurarla como IP estática en las propiedades del adaptador de red para que nunca cambie al reiniciar.

### Paso 2: Configuración de PostgreSQL 18 en el Equipo Host
PostgreSQL debe permanecer escuchando en `localhost` (`127.0.0.1:5432`) porque el servidor Node.js se ejecuta en el mismo Equipo Host y actúa como única puerta de enlace autenticada para los usuarios de la LAN.

1. Verificar que el servicio `postgresql-x64-18` se encuentre activo y con inicio automático:
   ```powershell
   Get-Service -Name "postgresql*"
   Set-Service -Name "postgresql-x64-18" -StartupType Automatic
   ```
2. Verificar en `postgresql.conf` los parámetros recomendados para operación multiusuario local:
   ```ini
   listen_addresses = 'localhost'
   port = 5432
   max_connections = 100
   shared_buffers = 512MB
   synchronous_commit = on
   fsync = on
   ```
3. *(Opcional)* Si se requiere que una estación secundaria se conecte directamente al puerto `5432` por herramientas administrativas, agregar en `pg_hba.conf` únicamente la subred local con autenticación `scram-sha-256`:
   ```text
   host    all    contabilidad_app    192.168.1.0/24    scram-sha-256
   ```

### Paso 3: Configuración de variables de entorno (`.env`)
En la raíz del proyecto (`c:\PROYECTOS SUNAT\Sistema Contable\.env`), configurar las variables de producción local:

```dotenv
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Conexión al motor PostgreSQL 18 local
DATABASE_URL=postgresql://contabilidad_app:<PASSWORD_SEGURO>@localhost:5432/atlob_produccion

# Secretos criptográficos del estudio (mínimo 32 caracteres aleatorios)
JWT_SECRET=<CADENA_HEX_ALEATORIA_64_CARACTERES>
BACKUP_ENCRYPTION_KEY=<CADENA_HEX_ALEATORIA_64_CARACTERES>
SUNAT_CREDENTIALS_SECRET=<CADENA_HEX_ALEATORIA_64_CARACTERES>

# Estilo de reporte por defecto
REPORT_STYLE=estandar
```

> **Regla de seguridad:** Nunca incluir el archivo `.env` en el control de versiones ni compartir las claves en texto plano.

### Paso 4: Regla de Firewall en Windows para acceso LAN del Segundo Usuario
Ejecutar en PowerShell como **Administrador** en el Equipo Host para permitir el acceso de los equipos de la red local (`LocalSubnet`) únicamente al puerto `3000` de la aplicación:

```powershell
New-NetFirewallRule `
  -DisplayName "Sistema Contable - Acceso LAN Multiusuario (TCP 3000)" `
  -Direction Inbound `
  -LocalPort 3000 `
  -Protocol TCP `
  -Action Allow `
  -Profile Private `
  -RemoteAddress LocalSubnet
```

### Paso 5: Compilación, Migración y Arranque del Servidor
1. Aplicar migraciones y verificar el esquema en PostgreSQL:
   ```powershell
   npm run db:migrate
   ```
2. Compilar el frontend optimizado y verificar integridad del sistema:
   ```powershell
   npm run build
   ```
3. Iniciar el servidor centralizado:
   ```powershell
   npm start
   ```
4. **Acceso de los usuarios:**
   - **Usuario 1 (Equipo Host):** `http://localhost:3000`
   - **Usuario 2 (Segunda estación en LAN):** `http://192.168.1.50:3000`

---

## 3. Rutina de Respaldo Diario Firmado (SHA-256 + AES-256-GCM)

El sistema cuenta con dos niveles complementarios de respaldo sin costo adicional:

### 3.1 Respaldo Cifrado por Empresa (Desde la Aplicación o API)
- **Responsable:** Usuario con rol `ADMINISTRADOR`.
- **Alcance:** Exporta exclusivamente las 41 tablas declaradas y archivos exportables de la empresa seleccionada en formato `.zip.enc` (cifrado con **AES-256-GCM** y manifiesto `manifest.json` firmado con **SHA-256** por cada archivo NDJSON).
- **Exclusiones de seguridad:** Excluye credenciales tributarias (`empresas_credenciales_sunat`) y usuarios/roles globales del estudio.
- **Procedimiento:**
  1. Ingresar al módulo **Configuración / Respaldo y Restauración**.
  2. Seleccionar la empresa activa y hacer clic en **Generar Respaldo Cifrado**.
  3. Almacenar el archivo generado en una carpeta sincronizada fuera del disco principal o unidad externa segura.

### 3.2 Respaldo Completo Automatizado de Base de Datos PostgreSQL (Tarea Programada Diaria)
Crear el script `scripts/respaldo_diario_lan.ps1` o ejecutar la siguiente rutina diaria mediante el **Programador de tareas de Windows** a las 19:00 hrs:

```powershell
$Fecha = Get-Date -Format "yyyyMMdd_HHmmss"
$DestinoDir = "C:\Respaldos_Contabilidad\Diarios"
New-Item -ItemType Directory -Force -Path $DestinoDir | Out-Null

$ArchivoDump = "$DestinoDir\atlob_produccion_$Fecha.backup"
$ArchivoHash = "$DestinoDir\atlob_produccion_$Fecha.sha256"

# 1. Generar volcado binario comprimido (formato custom de pg_dump)
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" `
  --host=localhost `
  --port=5432 `
  --username=contabilidad_app `
  --format=custom `
  --compress=9 `
  --file="$ArchivoDump" `
  atlob_produccion

if ($LASTEXITCODE -ne 0) {
  Write-Error "FALLO_RESPALDO_PG_DUMP: Código de salida $LASTEXITCODE"
  exit 1
}

# 2. Generar huella criptográfica SHA-256 de verificación
$Hash = (Get-FileHash -Path $ArchivoDump -Algorithm SHA256).Hash
"$Hash  atlob_produccion_$Fecha.backup" | Set-Content -Path $ArchivoHash -Encoding UTF8

# 3. Retención local: conservar últimos 30 días
Get-ChildItem -Path $DestinoDir -Filter "*.backup" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
  Remove-Item -Force
```

---

## 4. Procedimiento de Restauración Verificada

### 4.1 Restauración de una Empresa Individual (Aislada)
1. Verificar primero la integridad criptográfica del paquete `.zip.enc` (el sistema comprueba automáticamente la etiqueta de autenticación AES-GCM y el hash SHA-256 de cada tabla en `manifest.json`; si 1 solo bit fue alterado, rechaza la operación con `BACKUP_RECHAZADO`).
2. Confirmar el RUC exacto de la empresa de destino.
3. Ejecutar la restauración desde el panel de Administración. La operación se ejecuta dentro de una única transacción atómica en PostgreSQL sin afectar a ninguna otra empresa del estudio.

### 4.2 Restauración Completa de PostgreSQL ante Desastre de Hardware
1. Verificar el hash SHA-256 del archivo `.backup` antes de restaurar:
   ```powershell
   $Esperado = (Get-Content .\atlob_produccion_YYYYMMDD_HHMMSS.sha256).Split(" ")[0]
   $Actual = (Get-FileHash .\atlob_produccion_YYYYMMDD_HHMMSS.backup -Algorithm SHA256).Hash
   if ($Esperado -ne $Actual) { throw "ARCHIVO_CORRUPTO: El hash SHA-256 no coincide." }
   ```
2. Restaurar en una base limpia con `pg_restore`:
   ```powershell
   & "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" `
     --host=localhost `
     --port=5432 `
     --username=contabilidad_app `
     --dbname=atlob_produccion `
     --clean `
     --if-exists `
     --single-transaction `
     .\atlob_produccion_YYYYMMDD_HHMMSS.backup
   ```

---

## 5. Plan de Reversión (Rollback) ante Fallos Operativos

Si tras una actualización del sistema se detecta cualquier anomalía operativa:

1. **Detener inmediatamente el servicio Node.js** para impedir nuevas escrituras:
   ```powershell
   Stop-Process -Name "node" -Force
   ```
2. **Revertir el código de la aplicación** al último commit certificado en Git:
   ```powershell
   git log --oneline -n 5
   git checkout <COMMIT_ESTABLE_ANTERIOR>
   npm ci
   npm run build
   ```
3. **Evaluar estado de la base de datos:**
   - Si no hubo cambios destructivos de esquema, reiniciar el servidor con `npm start`.
   - Si una migración falló parcialmente, restaurar el último respaldo verificado con `pg_restore --single-transaction` (Sección 4.2).
4. **Verificación post-reversión obligatoria:**
   - Ejecutar la prueba real de concurrencia y persistencia:
     ```powershell
     npx tsx server/tests/real/test_pg_fase_d_multiusuario.ts
     ```
   - Confirmar código de salida `EXIT=0` antes de reabrir el acceso LAN a los usuarios.
