# Informe de Adaptación Electron Multiusuario — ATLOB ERP v2.0.0

## 1. Resumen ejecutivo

ATLOB ERP v2.0.0 (`pe.atlob.erp`) ha sido adaptado para operar **exclusivamente como aplicación de escritorio Windows** mediante el mismo instalador (`ATLOB-ERP-2.0.0-Setup-x64.exe`) y ejecutable portable (`ATLOB-ERP-2.0.0-Portable-x64.exe`) tanto en la PC principal (`JOSEPHMC`, IPv4 LAN `192.168.1.34`) como en 1 o 2 equipos clientes adicionales (máximo 3 usuarios simultáneos), sobre una única base de datos PostgreSQL 18.6 centralizada en la PC principal y con **costo adicional mensual de alojamiento US$ 0.00**.

El repositorio base corresponde al commit `dcbb140585f99e0cdf82490d69cfa46faf299cab` previo a esta actualización documental, con versión elevada a `2.0.0` en `package.json`.

---

## 2. Arquitectura implementada (PC Servidor Central + Clientes Desktop)

### 2.1 Topología obligatoria

| Componente | PC Principal (`JOSEPHMC`, `192.168.1.34`) | PC Cliente 2 y PC Cliente 3 |
| --- | --- | --- |
| Base de datos central | PostgreSQL 18.6 (`sistema_contable`) | **No requiere PostgreSQL ni Node.js** |
| Servicio API central | `server.ts` (`PORT=3000` en `127.0.0.1`, `HTTPS_PORT=3443` en `0.0.0.0`, `LAN_ONLY=1`) | **No ejecuta servidor backend ni `server.mjs`** |
| Aplicación cliente | `ATLOB ERP.exe` en modo `cliente` conectado por HTTPS LAN (`https://192.168.1.34:3443`) | `ATLOB ERP.exe` (Setup o Portable) en modo `cliente` conectado por HTTPS LAN |
| Interfaz de usuario | Cargada localmente desde `app.asar` vía esquema seguro `atlob://app/` | Cargada localmente desde `app.asar` vía esquema seguro `atlob://app/` |
| Navegador web | **Bloqueado (`403 MODO_ESCRITORIO_EXCLUSIVO`)** | **Bloqueado (`403 MODO_ESCRITORIO_EXCLUSIVO`)** |

### 2.2 Separación estricta de modo `cliente` vs `local`

En `desktop/main.cjs`, la configuración cifrada determina el modo operativo de cada instancia de `ATLOB ERP.exe`:

- **Modo `cliente` (predeterminado en el asistente):**
  - El proceso principal **no inicia** `server.mjs` (`servidorLocalIniciado: false`) y **no establece** conexiones directas a PostgreSQL.
  - Toda petición de interfaz `/api/*` se canaliza desde el renderer hacia el backend central autorizado vía `solicitarBackend()` usando TLS estricto en el proceso principal de Electron.
- **Modo `local`:** reservado para despliegues autónomos con PostgreSQL instalado localmente en el equipo.

### 2.3 Protocolo local seguro, CSP y puente desktop

- **Protocolo personalizado `atlob://app/`:** registrado con `protocol.registerSchemesAsPrivileged` (estándar, seguro, soporte Fetch API). La validación `esUrlAplicacion` controla la navegación permitida del `BrowserWindow`.
- **Aislamiento del renderer:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- **Puente IPC (`desktop/app-preload.cjs`):** expone `window.atlobDesktop` con `esEscritorio`, `obtenerEstadoConexion`, `verificarConexionAhora`, `reconfigurarServidor` y `suscribirEstadoConexion`, respaldado por los canales `atlob-desktop:*` en `desktop/main.cjs`.
- **Fuentes tipográficas locales:** eliminados los enlaces externos a fuentes remotas en `index.html`; se utiliza `@fontsource/roboto-condensed` empaquetado localmente.

### 2.4 Bloqueo de interfaz web directa en `server.ts`

`server.ts` restringe la entrega de la SPA compilada (`dist/`) únicamente cuando el cliente es desktop o se activa explícitamente `ALLOW_WEB_UI=1`. Cualquier solicitud web directa a rutas de navegador responde HTTP `403` con carga JSON:

```json
{
  "success": false,
  "error": "MODO_ESCRITORIO_EXCLUSIVO",
  "message": "ATLOB ERP opera exclusivamente mediante la aplicación de escritorio Windows (ATLOB ERP.exe)."
}
```

Asimismo, `scripts/iniciar-servidor-lan.ps1` ya no abre automáticamente el navegador web al iniciar el servidor (mantiene el parámetro `-NoAbrirNavegador` por compatibilidad).

---

## 3. Seguridad TLS, DPAPI, Resiliencia LAN y Multi-empresa

- **TLS estricto en cliente LAN (`rejectUnauthorized: true`):** en ningún flujo se desactiva la verificación TLS (`ignore-certificate-errors` prohibido). El proceso principal de Electron confía exclusivamente en `[...tls.rootCertificates, caPem]` cuando el usuario selecciona el certificado público `storage/certs/cliente-lan/atlob-lan-ca.crt` en el asistente.
- **Restricción de origen LAN (`desktop/desktop-config.cjs`):** `normalizarUrlServidorHttps` impone protocolo `https://`, puerto por defecto `3443` y direcciones privadas o locales LAN, rechazando HTTP e IPs públicas. `validarCertificadoCaPem` verifica el PEM mediante `crypto.X509Certificate`.
- **Persistencia cifrada DPAPI (`safeStorage`):** la configuración (`servidorUrl` y `caPem` en modo cliente, o cadena codificada en modo local) se cifra mediante `safeStorage` de Electron/Windows DPAPI y se escribe en `instalacion.bin` dentro de `userData` (vinculado a la clave de máquina/usuario en `Local State` de Chromium).
- **Bloqueo seguro ante caída del servidor central:** si el servidor central (`https://192.168.1.34:3443`) no responde o está detenido, el monitor de salud y `solicitarBackend()` marcan `online: false` y devuelven estado `503 SERVIDOR_NO_DISPONIBLE`. La UI de Electron bloquea operaciones de escritura mostrando el aviso con botones `Reintentar conexión` y `Configurar servidor`, y revalida consultas automáticamente al reconectarse (`src/App.tsx`).
- **Aislamiento multiempresa y sincronización:** todas las empresas y operaciones residen en PostgreSQL 18.6 con RLS activo (`NOBYPASSRLS`) y claves foráneas compuestas. Durante la normalización en `src/App.tsx`, `cargarDatosEmpresa` utiliza `extraerLista` y `mapearComprobanteDesdeApi` para consumir uniformemente respuestas paginadas `.data.items` (Compras/Ventas) y `.data.data` (Asientos).

---

## 4. Archivos modificados y agregados en esta fase

| Archivo | Propósito principal |
| --- | --- |
| `package.json` | Versión `2.0.0` y scripts `desktop:dev`, `dist:win`, `desktop:verify`, `verify`, `cert:lan` |
| `server.ts` | Bloqueo web `403 MODO_ESCRITORIO_EXCLUSIVO` manteniendo operación exclusiva cliente Electron |
| `index.html` | Eliminación de enlaces externos de fuentes web |
| `desktop/desktop-config.cjs` | Validación de URL HTTPS LAN privada y certificado X.509 CA PEM |
| `desktop/desktop-config.test.cjs` | Pruebas unitarias de normalización LAN, DPAPI y validación CA (3/3 aprobadas) |
| `desktop/package-files.mjs` | Inclusión de `app-preload.cjs` en la lista blanca de empaquetado |
| `desktop/app-preload.cjs` | Puente IPC aislado `window.atlobDesktop` |
| `desktop/config-preload.cjs`, `config.html`, `config.css`, `config-renderer.js` | Asistente de primera ejecución (selector Servidor principal HTTPS LAN / PostgreSQL local, carga de `.crt`, huella SHA-256 y prueba TLS+BD) |
| `desktop/main.cjs` | Modo `cliente` vs `local`, protocolo `atlob://app/`, TLS estricto, bloqueo `503 SERVIDOR_NO_DISPONIBLE`, arnés E2E y captura compositor |
| `src/types/desktop.d.ts` | Declaraciones TypeScript para `window.atlobDesktop` |
| `src/components/views/LoginView.tsx` | Indicador `Servidor LAN`, acciones `Verificar` y `Cambiar servidor`, guía de errores LAN y versión `2.0.0` |
| `src/App.tsx` | Estado de conexión en pie, alerta de desconexión, invalidación de caché al reconectar, versión `2.0.0` y mapeo paginado `extraerLista` |
| `scripts/iniciar-servidor-lan.ps1` | Eliminación de apertura automática de navegador manteniendo compatibilidad `-NoAbrirNavegador` |
| `scripts/verificar-operacion-piloto-pc.ts` | Verificación adaptada al bloqueo web `403 MODO_ESCRITORIO_EXCLUSIVO` |
| `scripts/verificar-electron-multiusuario.ts` | Prueba E2E real sobre `ATLOB ERP.exe` y `Portable` (8 etapas sobre base temporal aislada) |

---

## 5. Estado de verificación y alcance físico pendiente

- **Verificado en este equipo (`JOSEPHMC`, `192.168.1.34`) tras los últimos cambios:**
  - `npm run verify`: `npm run lint` (`tsc --noEmit` sin errores), `npm test` (`37/37` suites, `3554` aserciones en `64.38s`) y `npm run test:pg` (7 suites reales en PostgreSQL 18.6 aprobadas).
  - `npm run desktop:verify`: `archivos=53 | textos=39 | hallazgos=0 | EXIT_CODE=0`.
  - `node --test desktop/desktop-config.test.cjs`: `3/3 pass`.
  - `npm run test:secretos-frontend`: `archivos=170 | EXIT=0`.
  - `npx tsx scripts/verificar-electron-multiusuario.ts`: `EXIT 0`, las 8 etapas reales aprobadas (`syncMs: 300.6 ms`, `reportesPostReinicio` con `esfDiferenciaCuadre: 0`), evidencias visuales capturadas e inspeccionadas y base temporal `atlob_electron_e2e` eliminada.
- **Pendiente de ejecución física con hardware adicional:**
  - La instalación material de `ATLOB-ERP-2.0.0-Setup-x64.exe` o `ATLOB-ERP-2.0.0-Portable-x64.exe` en las **PC Cliente 2 y PC Cliente 3 reales**, así como la **prueba continua de operación física LAN de 60 minutos** entre equipos separados, quedan pendientes hasta contar con los equipos clientes físicos conectados a la misma red LAN privada.
