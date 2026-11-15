# Guía de Instalación y Operación — ATLOB ERP v2.0.0 Escritorio

## 1. Requisitos previos y topología

- **Costo adicional de alojamiento:** US$ 0.00/mes (red LAN local privada).
- **PC Principal (`JOSEPHMC`, ejemplo IPv4 `192.168.1.34`):**
  - Windows 10/11 x64.
  - PostgreSQL 18.6 en ejecución (base productiva `sistema_contable`).
  - Node.js `>= 22.12.0` y repositorio de ATLOB ERP únicamente en la PC Principal que ejecuta el servidor central.
- **PC Cliente 2 y PC Cliente 3 (máximo 3 usuarios simultáneos en piloto):**
  - Windows 10/11 x64 conectado a la misma red LAN privada.
  - **No requieren** PostgreSQL, Node.js ni repositorio de código fuente.
  - Únicamente requieren el instalador `ATLOB-ERP-2.0.0-Setup-x64.exe` (o `ATLOB-ERP-2.0.0-Portable-x64.exe`) y el certificado público CA `atlob-lan-ca.crt`.

---

## 2. Artefactos de distribución disponibles (`release\`)

| Artefacto | Tamaño (bytes) | Uso recomendado |
|---|---|---|
| `release\ATLOB-ERP-2.0.0-Setup-x64.exe` | `123451206` | Instalación estándar Windows por usuario (`perMachine: false`, crea acceso directo) en PC Principal y PCs Clientes |
| `release\ATLOB-ERP-2.0.0-Portable-x64.exe` | `112219858` | Ejecutable portable sin instalador (guardar en carpeta propia con permisos de escritura para conservar su perfil `userData`) |

Los instaladores históricos `0.0.0` fueron archivados fuera de `release\` en `storage\archivo-releases\v0.0.0-20261112\`.

---

## 3. Preparación y arranque del Servidor Central (PC Principal)

### 3.1 Certificados TLS y archivo `.env`

1. En la primera preparación, verifique `.env` en la raíz del proyecto (variables: `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SUNAT_ENCRYPTION_KEY`, `MFA_SEED_SECRET`, `BACKUP_ENCRYPTION_KEY`) o utilice `.\scripts\inicializar-escritorio.ps1 -Preparar`.
2. Para regenerar certificados TLS LAN con Subject Alternative Names actualizados (incluyendo `localhost`, nombre de host e IPs IPv4 LAN activas), ejecute en la raíz del repositorio:

```powershell
npm run cert:lan
```

3. Distribuya únicamente el archivo **público** hacia las PCs Clientes:
   - `storage\certs\cliente-lan\atlob-lan-ca.crt`
   - **Nunca** copie `.key`, `.env` ni archivos de respaldo en las PCs Clientes.

### 3.2 Regla de Windows Firewall (opcional / una sola vez)

Para permitir conexiones HTTPS entrantes desde la subred LAN local hacia el puerto TCP `3443`:

1. Inspeccionar sin aplicar cambios:

```powershell
.\scripts\configurar-firewall-lan.ps1
```

2. Aplicar en PowerShell **como Administrador**:

```powershell
.\scripts\configurar-firewall-lan.ps1 -ConfirmarFirewall
```

La regla `'ATLOB ERP HTTPS LAN'` habilita únicamente el puerto TCP `3443` entrante en el perfil `Private` restringido a `LocalSubnet`. El puerto HTTP `3000` permanece ligado únicamente a `127.0.0.1`.

### 3.3 Iniciar y detener el servidor central

- **Iniciar servidor central:**

```powershell
.\scripts\iniciar-servidor-lan.ps1 -NoAbrirNavegador
```

Parámetros admitidos: `-Port` (`3000`), `-HttpsPort` (`3443`), `-DatabaseUrl`, `-Recompilar`, `-NoAbrirNavegador`. El proceso registra su PID en `storage\instancia\atlob-lan.pid` y sus logs en `storage\instancia\servidor.stdout.log` y `servidor.stderr.log`.

- **Detener servidor central con seguridad:**

```powershell
.\scripts\detener-servidor-lan.ps1
```

---

## 4. Instalación del cliente de escritorio en PC Principal y PCs Clientes

1. Copie `ATLOB-ERP-2.0.0-Setup-x64.exe` (o `ATLOB-ERP-2.0.0-Portable-x64.exe`) junto con `atlob-lan-ca.crt` al equipo destino.
2. En instalaciones estándar, ejecute `ATLOB-ERP-2.0.0-Setup-x64.exe` (instalación por usuario Windows, sin requerir permisos de administrador del sistema si la política local permite instaladores de usuario).
3. Inicie **ATLOB ERP** desde el acceso directo del menú Inicio / escritorio (o ejecute `ATLOB-ERP-2.0.0-Portable-x64.exe`).
4. Complete el asistente inicial siguiendo la guía [GUIA_CONFIGURACION_CLIENTES_DESKTOP.md](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/GUIA_CONFIGURACION_CLIENTES_DESKTOP.md).

> [!IMPORTANT]
> No intente abrir ATLOB ERP desde Chrome/Edge u otro navegador web: el servidor bloquea la entrega de interfaz web directa con código HTTP `403 MODO_ESCRITORIO_EXCLUSIVO`. Todo acceso operativo debe realizarse desde `ATLOB ERP.exe`.

---

## 5. Respaldos, actualización y rollback

- **Respaldo cifrado manual (AES-256-GCM + SHA-256) y verificación:**

```powershell
.\scripts\respaldo-diario.ps1
```

Parámetros: `-RetencionDias` (`30`), `-DbEnv` (`DATABASE_URL`), `-EmpresaId`, `-RutaCopiaExterna` (`$env:USERPROFILE\Documents\Respaldos_ATLOB_ERP`), `-OmitirCopiaExterna`, `-RegistrarTareaProgramada`, `-DesregistrarTareaProgramada`, `-HoraDiaria` (`22:00`).

- **Actualización segura con respaldo previo y registro de commit:**

```powershell
.\scripts\actualizar-sistema.ps1
```

Para revertir código preservando los datos en PostgreSQL (previa validación automática de `schema_migrations`):

```powershell
.\scripts\actualizar-sistema.ps1 -Rollback
```

---

## 6. Estado de despliegue físico pendiente

La verificación E2E de `ATLOB ERP.exe` y `Portable` contra la API HTTPS LAN y PostgreSQL 18.6 quedó aprobada localmente en `JOSEPHMC` (`192.168.1.34`). La ejecución material del instalador en las PCs Clientes 2 y 3 y la prueba sostenida de 60 minutos en red LAN física quedan pendientes hasta disponer de dichos equipos en sitio.

