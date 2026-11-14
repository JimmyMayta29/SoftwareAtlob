# Guía de Instalación y Operación en la PC Servidor — ATLOB ERP v2.0.0

## 1. Inventario Real Verificado de esta Computadora Servidor

| Recurso | Especificación Detectada en el Equipo Anfitrión | Verificación |
| :--- | :--- | :--- |
| **Equipo / Sistema Operativo** | `JOSEPHMC` — Microsoft Windows 11 Pro (`10.0.26200`) | Verificado |
| **Procesador** | AMD Ryzen 5 3450U with Radeon Vega Mobile Gfx (`4` núcleos / `8` lógicos) | Verificado |
| **Memoria RAM** | `13.89 GB` físicos totales | Verificado |
| **Almacenamiento en `C:`** | `21.50 GB` disponibles en disco | Verificado |
| **Runtime Node.js / npm** | Node.js `v26.13.0` · npm `11.20.0` | Verificado |
| **Base de Datos** | Servicio `postgresql-x64-18` (PostgreSQL 18.6, inicio automático, puerto `5432`) | Activo (`Running`) |
| **Red Local (LAN)** | Interfaz `Ethernet` — IPv4 actual **`192.168.1.34`** | Activa |
| **OpenSSL** | `OpenSSL 3.5.5` (`C:\Program Files\Git\usr\bin\openssl.exe`) | Verificado |
| **Costo mensual adicional** | **US$ 0.00** | Cero servicios pagos |

---

## 2. Estado de Configuración Local Ya Preparada

1. **Archivo `.env`:** Configurado con `DATABASE_URL` apuntando a PostgreSQL local (`sistema_contable`), `TEST_DATABASE_URL` apuntando a `atlob_test`, y los 5 secretos independientes de 64 dígitos hexadecimales (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `SUNAT_ENCRYPTION_KEY`, `MFA_SEED_SECRET`, `BACKUP_ENCRYPTION_KEY`).
2. **Certificados TLS LAN (`storage/certs/`):** Generados y verificados (`atlob-lan-ca.crt`, `atlob-lan.crt`, `atlob-lan.key`) con SAN para `192.168.1.34`, `127.0.0.1`, `localhost` y `JOSEPHMC`. Para regenerarlos ante cambio de IP:
   ```powershell
   npm run cert:lan
   ```
3. **Compilación de producción (`dist/`):** Compilada mediante `npm run build`.

---

## 3. Paso Pendiente Bajo Autorización Explícita: Windows Firewall para LAN

Por seguridad del sistema operativo, **no se modificaron reglas de Windows Firewall automáticamente**.
Para permitir que las otras 1–2 computadoras de la oficina se conecten a esta PC (`192.168.1.34`), el administrador debe abrir PowerShell **como Administrador** en la carpeta `c:\PROYECTOS SUNAT\Sistema Contable` y ejecutar:

```powershell
# Primero revisar exactamente qué regla se va a crear (opcional):
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\configurar-firewall-lan.ps1

# Aplicar las reglas únicamente para red Privada (puertos TCP 3443 HTTPS y 3000 HTTP):
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\configurar-firewall-lan.ps1 -ConfirmarFirewall
```

> **Recomendación de red:** Reservar la IP `192.168.1.34` en el router de la oficina para este equipo (Reserva DHCP por dirección MAC) y asegurarse de que la red Windows esté marcada como **Perfil Privado** (no Público).

---

## 4. Comandos Diarios de Operación en el Servidor

Todos los scripts de servidor controlan únicamente el PID registrado en `storage/instancia/atlob-lan.pid` (nunca terminan otros procesos Node.js del equipo):

- **Iniciar ATLOB ERP (HTTP local + HTTPS LAN):**
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\iniciar-servidor-lan.ps1
  ```
  URLs habilitadas al iniciar:
  - En esta PC servidor: `https://127.0.0.1:3443` (o `http://127.0.0.1:3000`)
  - En las demás PCs de la LAN: `https://192.168.1.34:3443`

- **Detener ATLOB ERP de forma segura:**
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\detener-servidor-lan.ps1
  ```

- **Ejecutar respaldo cifrado manual inmediato:**
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\respaldo-diario.ps1
  ```

- **Programar respaldo diario automático (ej. 22:00 h):**
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\respaldo-diario.ps1 -RegistrarTareaProgramada -HoraDiaria "22:00"
  ```

- **Mantener modo escritorio individual Electron (`ATLOB_DESKTOP=1`):**
  Para trabajar únicamente de forma local monousuario sigue disponible `Iniciar-Escritorio.bat` (`scripts/inicializar-escritorio.ps1`) y `npm run desktop:dev`. **No ejecute ambos modos al mismo tiempo sobre el mismo puerto `3000`.**
