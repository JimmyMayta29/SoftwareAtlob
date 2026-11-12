# Ejecución en escritorio Windows — ATLOB ERP

Existen **dos caminos reales** en el repositorio para ejecutar la aplicación en Windows, ambos conectados a una instancia PostgreSQL externa (ninguno instala PostgreSQL automáticamente):

1. **Aplicación nativa de escritorio con Electron (Setup / Portable x64)** — camino principal empaquetado.
2. **Lanzador local desde código fuente (`Iniciar-Escritorio.bat` + `scripts/inicializar-escritorio.ps1`)** — camino desde repositorio que sirve la aplicación en el navegador local.

El sistema mantiene fases funcionales y pruebas de persistencia real pendientes conforme a [docs/engineering/PLAN_IMPLEMENTACION.md](engineering/PLAN_IMPLEMENTACION.md). Utilícese con una base PostgreSQL controlada y respaldos verificados.

---

## Camino 1: Ejecutable nativo Electron (Setup / Portable)

La variante nativa empaqueta la aplicación con **Electron (`45.2.3`)** y **`electron-builder` (`26.18.0`)** para Windows x64 (`desktop/main.cjs` y `desktop/electron-builder.yml`, `appId: pe.atlob.erp`).

- **Generación de paquetes desde el repositorio:** `npm run dist:win` compila frontend y servidor y produce los ejecutables en `release/` (instalador NSIS `Setup-x64.exe` y versión portable `Portable-x64.exe`). Para pruebas locales desde código fuente sin empaquetar existe `npm run desktop:dev`.
- **Asistente y almacenamiento seguro:** Al iniciar sin configuración previa, muestra la pantalla de conexión PostgreSQL (`desktop/config.html`, valores sugeridos `localhost`, puerto `5432`, base `sistema_contable`, usuario `contabilidad_app`). Genera cinco secretos propios de 32 bytes (64 dígitos hexadecimales) y cifra conexión y secretos mediante Windows DPAPI (`safeStorage`) en `instalacion.bin` dentro de `%APPDATA%`.
- **Arranque y ciclo de vida:** Inicia `desktop/generated/server.mjs` como `utilityProcess` en `127.0.0.1` sobre un puerto efímero, valida `/api/health` (`status: 'UP'` y `database: 'POSTGRESQL_CONNECTED'`), abre la ventana endurecida de Electron (`BrowserWindow` con `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`) y coordina un apagado ordenado al cerrar.
- **Migraciones y reglas por base:** Sobre `sistema_contable` arranca en verificación de solo lectura (`verifyOnly`, **21 migraciones**); en otra base de datos permite autorizar la preparación automática de tablas.

El detalle técnico completo de permisos PostgreSQL, DPAPI, seguridad HTTP local e integración de migraciones figura en [docs/engineering/ESCRITORIO_WINDOWS.md](engineering/ESCRITORIO_WINDOWS.md).

---

## Camino 2: Lanzador local desde código fuente (`Iniciar-Escritorio.bat`)

Pensado para iniciar el servidor Express y el frontend compilado directamente desde una copia completa del repositorio, abriendo la interfaz en el navegador predeterminado.

### Requisitos

- Windows 10 u 11.
- Node.js `>= 22.12.0`, `npm` y `package-lock.json` presente en la raíz del proyecto.
- Instancia PostgreSQL accesible y base preparada.
- Permisos de escritura en la carpeta del proyecto y en `%LOCALAPPDATA%`.

### Qué ejecuta realmente

1. [Iniciar-Escritorio.bat](../Iniciar-Escritorio.bat) invoca `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\inicializar-escritorio.ps1"`.
2. En la primera ejecución (sin `.env`), `scripts/inicializar-escritorio.ps1` solicita `DATABASE_URL` de forma oculta y genera `.env` restringido al usuario actual mediante `icacls`.
3. Si falta `tsx`, ejecuta `npm ci` desde `package-lock.json`. Luego compila el cliente (`npm run build`).
4. Fija `NODE_ENV=production` y `HOST=127.0.0.1` (puerto `3000` por defecto o el `PORT` configurado en `.env`), lanza `node --import tsx server.ts` oculto en segundo plano y guarda PID y salidas (`servidor.pid`, `servidor.stdout.log`, `servidor.stderr.log`) en `%LOCALAPPDATA%\SistemaContable\instances\<hash>-<puerto>`.
5. Espera confirmación de `http://127.0.0.1:<puerto>/api/health` (`status: 'UP'` y `database: 'POSTGRESQL_CONNECTED'`), crea el acceso directo `Sistema Contable.lnk` en el Escritorio y abre el navegador. En un fallo de conexión nunca cae a modo en memoria.
6. Parámetros aceptados por el script PowerShell: `-Preparar` (prepara sin iniciar), `-Detener` (detiene la instancia registrada) y `-NoAbrirNavegador`.

### Nota técnica de compatibilidad con `.env` en producción

Cuando `scripts/inicializar-escritorio.ps1` crea un `.env` desde cero, solo escribe tres variables secretas (`JWT_SECRET` y `JWT_REFRESH_SECRET` de 48 bytes / 96 hex y `SUNAT_ENCRYPTION_KEY` de 32 bytes / 64 hex) y omite `MFA_SEED_SECRET` y `BACKUP_ENCRYPTION_KEY`. Sin embargo, al fijar `NODE_ENV=production`, `server/config/env.ts` exige los **cinco** secretos (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `SUNAT_ENCRYPTION_KEY`, `MFA_SEED_SECRET`, `BACKUP_ENCRYPTION_KEY`), todos exactamente de **64 dígitos hexadecimales** independientes (32 bytes); si falta alguno o su formato difiere, `server.ts` aborta el arranque con `SECRETO_CONFIGURACION_INVALIDO`.

Si se utiliza este lanzador desde código fuente, debe completarse o ajustarse `.env` previamente con los cinco secretos válidos de 64 dígitos hexadecimales siguiendo [.env.example](../.env.example). Para operación regular en Windows se recomienda usar el paquete Electron (Camino 1).
