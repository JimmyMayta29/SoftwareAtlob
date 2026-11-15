# Matriz de Pruebas — ATLOB ERP v2.0.0 Electron Multiusuario

Todas las pruebas listadas a continuación fueron ejecutadas directamente en esta máquina Windows x64 (`JOSEPHMC`, PostgreSQL `18.6`) sobre el código final empaquetado de **ATLOB ERP v2.0.0**, con **código de salida `0`** y **0 casos fallidos u omitidos**.

---

## 1. Matriz de pruebas E2E reales de Electron (`scripts/verificar-electron-multiusuario.ts`)

| Etapa | Escenario verificado | Resultado observado |
|---|---|---|
| 1 | Creación de base temporal aislada `atlob_electron_e2e`, migraciones y semillas administrativas | **APROBADO** (`atlob_electron_e2e` eliminada al finalizar) |
| 2 | Bloqueo de navegador web en servidor LAN y conectividad TLS estricta | **APROBADO** (`403 MODO_ESCRITORIO_EXCLUSIVO` en `/`, `200` en `/api/health` HTTPS con `caPem`) |
| 3 | Ejecución 1 real de `release\win-unpacked\ATLOB ERP.exe` (asistente cliente -> DPAPI `instalacion.bin` -> login UI -> 0 conexiones directas a PG desde Electron) | **APROBADO** (`modo: "cliente"`, `servidorLocalIniciado: false`, `origin: "atlob://app"`, `tieneBridgeDesktop: true`, `autenticadoUi: true`) |
| 4 | Ejecución 2 real de `ATLOB ERP.exe` (persistencia DPAPI tras reapertura sin asistente) | **APROBADO** (`ok: true`, `origin: "atlob://app"`, `healthStatus: 200`) |
| 5 | Ejecución real de `release\ATLOB-ERP-2.0.0-Portable-x64.exe` en perfil aislado nuevo | **APROBADO** (`ok: true`, `modo: "cliente"`, `servidorLocalIniciado: false`, `autenticadoUi: true`) |
| 6 | Operación multiusuario concurrente (3 sesiones activas + rol Auditor + sincronización + cuadre) | **APROBADO** (`syncMs: 266.2` ms, `comprasTotal: 1180`, `ventasTotal: 2360`, `diarioAsientos: 3`, `diarioTotalDebe: 9540`, `esfDiferenciaCuadre: 0`) |
| 7 | Simulación de apagado del servidor central y bloqueo offline en `ATLOB ERP.exe` | **APROBADO** (`online: false`, `healthStatus: 503`, `SERVIDOR_NO_DISPONIBLE`, botón `Configurar servidor` visible) |
| 8 | Reconexión del servidor central, preservación DPAPI (`Local State` + `instalacion.bin`), re-login UI y reportes idénticos posreinicio | **APROBADO** (`online: true`, `autenticadoUi: true`, `reportesPostReinicio` idénticos sin diferencia de cuadre) |

### Evidencias visuales generadas en `storage/evidencias-electron-e2e/`

- `01-wizard-cliente.png` (asistente `Servidor principal (HTTPS LAN)` con huella CA cargada)
- `02-login-desktop.png` (pantalla de inicio de sesión con barra de estado `Servidor LAN`)
- `03-sesion-autenticada.png` (sesión autenticada en `atlob://app/` con pie de conexión y `Cambiar servidor`)
- `04-offline-bloqueado.png` (tarjeta de bloqueo seguro ante desconexión con `Reintentar conexión` y `Configurar servidor`)
- `05-reconectado-login.png` (pantalla `LoginView` v2.0.0 reconectada mostrando `Servidor LAN: 192.168.1.34 · En línea`)

---

## 2. Compuertas de empaquetado, configuración desktop, seguridad y código

| Verificación / Comando | Alcance | Resultado observado |
|---|---|---|
| `npm run desktop:verify` (`desktop/verify-package.ts`) | Auditoría de contenido de `release\win-unpacked\resources\app.asar` | `archivos=53 \| textos=39 \| hallazgos=0 \| EXIT_CODE=0` |
| `node --test desktop/desktop-config.test.cjs` | Normalización HTTPS LAN privada, rechazo HTTP/IP pública, X.509 CA PEM, preservación de fallo DPAPI | `tests 3 \| pass 3 \| fail 0 \| skipped 0` (`152.1726ms`) |
| `npm run test:secretos-frontend` | Escaneo de secretos en `src` + `dist` compilado | `ESCANEO_SECRETOS src + dist \| archivos=170 \| EXIT=0` |
| `npm run lint` (`tsc --noEmit`) | Verificación estática TypeScript completo (frontend, backend y scripts) | Salida `0` (0 errores) |

---

## 3. Batería completa de aplicación (`npm run verify`)

| Fase de `npm run verify` | Suites / Alcance | Resultado observado |
|---|---|---|
| `npm test` (`server/tests/run_all_tests.ts`) | 37 suites automatizadas (sesión, RBAC HTTP, motor contable, tributación, planillas, reportes ESTANDAR, SIRE/PLE, respaldos, importación, transparencia M1+M2) | **37/37 suites completadas con éxito \| 3554 aserciones totales en 64.38s** |
| `npm run test:pg` — `test_pg_rls_planillas.ts` | RLS y `NOBYPASSRLS` en PostgreSQL 18.6 (`atlob_test`) | **APROBADO (EXIT 0)** |
| `npm run test:pg` — `test_pg_seguridad.ts` | Seguridad PostgreSQL, secretos de producción y aislamiento | **APROBADO (EXIT 0)** |
| `npm run test:pg` — `test_pg_matriz_contable.ts` | Matriz contable integral Fase B (`69/69`) | **APROBADO (EXIT 0)** |
| `npm run test:pg` — `test_pg_backup_b2.ts` | Respaldos cifrados y recuperación Fase B2 (`4/4`, `registrosRestaurados=21`) | **APROBADO (EXIT 0)** |
| `npm run test:pg` — `test_pg_fase_c_reportes.ts` | Reportes, conciliación, cierre mensual/anual, PLE y persistencia en frío | **APROBADO (EXIT 0)** |
| `npm run test:pg` — `test_pg_fase_d_multiusuario.ts` | 66 operaciones concurrentes en 3 sesiones (`1104.29 ms`), visibilidad `141.93 ms`, 74 ops HTTP LAN (`p50=35.61 ms`, `p95=244.80 ms`, `p99=341.63 ms`, `max=341.63 ms`) | **APROBADO (EXIT 0)** |
| `npm run test:pg` — `test_pg_fase_e_normativa_2026.ts` | Parámetros 2026 (UIT 5500, RMV 1130, IGV 16%+2%, EsSalud 9%, ONP 13%), PCGE 2019, PDT 621, SPOT, SIRE y PLE | **APROBADO (EXIT 0)** |

---

## 4. Pendientes físicos fuera de alcance en esta estación

- Despliegue físico de `ATLOB-ERP-2.0.0-Setup-x64.exe` / `Portable` en **PC Cliente 2 y PC Cliente 3** sobre la red LAN física real del estudio.
- Ejecución continua de **60 minutos** en campo con los 2–3 equipos físicos clientes conectados simultáneamente.
