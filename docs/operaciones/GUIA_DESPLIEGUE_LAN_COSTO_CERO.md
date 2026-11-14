# Guía Operativa de Despliegue Multiusuario en Red Local (Costo US$ 0.00)

## 1. Evaluación y Decisión de Arquitectura de Despliegue (Presupuesto US$ 0.00)

Para habilitar la operación simultánea de **1 a 3 usuarios concurrentes** (Administrador / Contador Principal, Contador Senior y Asistente Contable) compartiendo la misma base de datos PostgreSQL 18 con sincronización automática y **costo operativo mensual adicional de US$ 0.00**, se seleccionó la arquitectura de **Servidor Local Centralizado en LAN con Transporte Cifrado HTTPS**.

| Criterio Técnico / Operativo | Opción 1: Servidor Local Centralizado en LAN + HTTPS (Elegida) | Opción 2: Base de Datos en Nube Gratuita | Opción 3: Túneles Públicos Temporales |
| :--- | :--- | :--- | :--- |
| **Costo mensual recurrente** | **US$ 0.00** (infraestructura Windows ya instalada) | Cuotas estrictas / suspensión | Límites de ancho de banda y URLs efímeras |
| **Latencia transaccional p95** | **282.93 ms medidos** (`npm run verify`, meta ≤ 2,000 ms) | 80–350 ms adicionales por SQL | 60–250 ms por salto externo |
| **Visibilidad entre usuarios** | **164.95 ms medidos en BD** / polling UI cada 4 s | Dependiente de Internet | Dependiente de túnel externo |
| **Cifrado de transporte LAN** | **HTTPS TLS con CA interna (`atlob-lan-ca.crt`)** | TLS administrado externo | Terminación en tercero |
| **Disponibilidad sin Internet** | **100% operativo** en la red privada del estudio | Inoperativo sin Internet | Inoperativo sin Internet |

### Topología Real en el Equipo Anfitrión
1. **Equipo Servidor Windows (`JOSEPHMC`, IPv4 LAN `192.168.1.34`):** Ejecuta PostgreSQL 18 (`127.0.0.1:5432`) y el servidor Node.js/Express (`0.0.0.0`) con HTTP local (`3000`) y HTTPS LAN (`3443`).
2. **Usuario 1 (Equipo Servidor):** Accede mediante navegador web a `https://127.0.0.1:3443` (o `https://localhost:3443` / aplicación Electron de escritorio).
3. **Usuarios 2 y 3 (Estaciones en la misma red privada LAN/Wi-Fi):** Instalan una única vez el certificado raíz local `storage/certs/atlob-lan-ca.crt` en Windows y acceden por navegador a **`https://192.168.1.34:3443`**.

---

## 2. Configuración y Puesta en Marcha

### Paso 1: Verificar PostgreSQL 18 y Dirección IP LAN
En PowerShell:
```powershell
Get-Service -Name "postgresql-x64-18"
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }
```
*(Se recomienda reservar la IPv4 `192.168.1.34` en el router del estudio mediante reserva DHCP por MAC).*

### Paso 2: Variables de Entorno en `.env`
En la raíz del proyecto, `.env` debe incluir en `production`:
- `DATABASE_URL=postgresql://contabilidad_app:<PASSWORD>@localhost:5432/sistema_contable`
- Los 5 secretos hexadecimales independientes de 64 caracteres (32 bytes) validados por `server/config/env.ts`:
  - `JWT_SECRET`
  - `JWT_REFRESH_SECRET`
  - `SUNAT_ENCRYPTION_KEY`
  - `MFA_SEED_SECRET`
  - `BACKUP_ENCRYPTION_KEY`
- Variables LAN opcionales: `HOST=0.0.0.0`, `PORT=3000`, `HTTPS_ENABLED=1`, `HTTPS_PORT=3443`, `SSL_KEY_PATH=storage/certs/atlob-lan.key`, `SSL_CERT_PATH=storage/certs/atlob-lan.crt`.

### Paso 3: Generar Certificados TLS para LAN
```powershell
npm run cert:lan
```
Genera en `storage/certs/` (ignorado por Git): `atlob-lan-ca.crt`, `atlob-lan-ca.key`, `atlob-lan.crt` y `atlob-lan.key` con SAN para `localhost`, `JOSEPHMC`, `127.0.0.1` y `192.168.1.34`.

### Paso 4: Regla de Firewall de Windows (Requiere Autorización Previa del Administrador)
Para inspeccionar qué reglas se crearían (sin modificar nada):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\configurar-firewall-lan.ps1
```
Cuando el administrador autorice la apertura en red Privada, ejecutar en PowerShell como Administrador:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\configurar-firewall-lan.ps1 -ConfirmarFirewall
```

### Paso 5: Inicio y Parada Seguros por PID
- **Iniciar servidor centralizado HTTP + HTTPS LAN:**
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\iniciar-servidor-lan.ps1
  ```
- **Detener únicamente el proceso registrado de ATLOB ERP (sin afectar otros procesos Node.js):**
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\detener-servidor-lan.ps1
  ```

---

## 3. Respaldo Diario Verificado y Política de Exclusiones
El sistema declara **84 tablas en PostgreSQL** (`server/storage/registroDatosEmpresa.ts`):
- **64 tablas** de ámbito `empresa` con RLS + FORCE RLS activo (**60 tablas exportables** en los paquetes `.atlob.bak` de empresa + **4 tablas SUNAT excluidas**: `credenciales_sunat`, `sunat_conexiones`, `sunat_empresa_keys`, `sunat_tokens`).
- **13 tablas** de ámbito `control` (`empresas` se exporta en metadatos de compañía; usuarios, roles, membresías, tokens y configuración quedan excluidos del respaldo por empresa).
- **7 tablas** de ámbito `compartido` (PCGE base, parámetros y cronogramas).

Ejecutar respaldo cifrado (`AES-256-GCM` + verificación `SHA-256` por archivo y paquete):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\respaldo-diario.ps1
```
*(Guarda `.atlob.bak` + `.sha256` en `storage/respaldos/YYYY-MM-DD/` y registra en `bitacora-respaldos.json`).*

---

## 4. Actualización y Reversión Segura (Sin Matar Procesos Globales)
Nunca ejecutar `Stop-Process -Name "node" -Force`. Utilizar siempre los scripts controlados por PID:
```powershell
# Actualizar con respaldo previo obligatorio, migraciones idempotentes y build
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\actualizar-sistema.ps1

# Revertir únicamente el código si falló una actualización, conservando el 100% de operaciones en PostgreSQL
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\actualizar-sistema.ps1 -Rollback
```
