# Informe de Verificación Final — ATLOB ERP v2.0.0

**Fecha de verificación:** 14 de noviembre de 2026  
**Equipo anfitrión inspeccionado:** `JOSEPHMC` (Windows 11 Pro `10.0.26200`, AMD Ryzen 5 3450U, `13.89 GB` RAM, PostgreSQL `postgresql-x64-18` activo en puerto `5432`, Node.js `v26.13.0`, npm `11.20.0`, OpenSSL `3.5.5`, LAN IPv4 `192.168.1.34`).  
**Alcance objetivo:** Piloto interno centralizado de hasta **3 usuarios simultáneos** en red local (LAN) con transporte cifrado HTTPS y **costo mensual adicional de alojamiento US$ 0.00**.

---

## 1. Resolución de Discrepancias Documentales Detectadas en Fase 1

Al contrastar la documentación previa (`PLAN_IMPLEMENTACION_CORRECCIONES.md`, `REGISTRO_CORRECCIONES_ATLOB.md`, `MATRIZ_VALIDACION_FUNCIONAL.md`, `INFORME_CERTIFICACION_PILOTO.md`, `PLAN_DESPLIEGUE_INTERNO_USD0.md`, `docs/operaciones/GUIA_DESPLIEGUE_LAN_COSTO_CERO.md` y `AGENTS.md`) directamente contra el código fuente y PostgreSQL real, se resolvieron tres discrepancias exactas:

1. **64 vs 84 tablas protegidas con RLS:**
   - El esquema `public` de PostgreSQL contiene **84 tablas registradas** en [`server/storage/registroDatosEmpresa.ts`](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/server/storage/registroDatosEmpresa.ts), clasificadas en:
     - `64` tablas operativas de ámbito `'empresa'`
     - `13` tablas de ámbito `'control'`
     - `7` tablas de ámbito `'compartido'`
   - Las **84 tablas** tienen `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY` activas; el número `64` corresponde únicamente al subconjunto `'empresa'`.

2. **41 vs 60 vs 68 tablas en política de respaldos:**
   - El valor `41` provenía de un conteo anterior a las fases 14–19 del esquema.
   - En `REGISTRO_DATOS_EMPRESA`, **68 tablas** tienen `exportar: true` (`60` de `'empresa'`, `1` de `'control'` que es `empresas`, y `7` de `'compartido'`) y **16 tablas** quedan excluidas (`4` tablas de credenciales SUNAT + `12` de control, identidad y migraciones).
   - Al generar un respaldo por empresa (`.atlob.bak`), [`server/services/backupEmpresaService.ts`](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/server/services/backupEmpresaService.ts) exporta `empresa.json` (fila de `empresas`), las **60 tablas exportables de ámbito `empresa`** (`61` archivos verificados con SHA-256 en `manifest.json`) y las **5 carpetas físicas exportables** (`adjuntos`, `xml`, `cdr`, `pdf`, `txt`).

3. **Alcance de 1–2 usuarios vs 3 usuarios simultáneos y comandos heredados incompatibles:**
   - Se amplió [`server/tests/real/test_pg_fase_d_multiusuario.ts`](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/server/tests/real/test_pg_fase_d_multiusuario.ts) y toda la documentación operativa a **3 sesiones operativas simultáneas** (`ADMINISTRADOR`, `CONTADOR_SENIOR`, `ASISTENTE_CONTABLE` = 66 operaciones concurrentes) más `AUDITOR_REVISOR` y prueba en vivo por HTTPS LAN.
   - Se corrigieron discrepancias heredadas en scripts y guías: longitud real de secretos de **64 dígitos hexadecimales (32 bytes)** en [`scripts/inicializar-escritorio.ps1`](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/scripts/inicializar-escritorio.ps1) alineada con [`server/config/env.ts`](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/server/config/env.ts), eliminación de instrucciones peligrosas (`Stop-Process -Name node -Force`) por control estricto mediante PID propio (`storage/instancia/atlob-lan.pid`), y extensión oficial `.atlob.bak` / `backupEmpresaService.restaurarBackup`.

---

## 2. Evidencia de Pruebas y Comprobaciones Ejecutadas Directamente

Todas las verificaciones siguientes se ejecutaron tras aplicar las modificaciones finales de código y terminaron con código de salida `0`:

| Comprobación | Comando / Mecanismo | Resultado Observado Real |
| :--- | :--- | :--- |
| **Compilación TypeScript** | `npm run lint` (`tsc --noEmit`) | **`EXIT=0`**, `0` errores TypeScript. |
| **Compilación Frontend Producción** | `npm run build` (`vite build`) | **`EXIT=0`**, `2104` módulos transformados en `3.44s` generando `dist/`. |
| **Suite Unitaria e Integración** | `npm test` (`tsx server/tests/run_all_tests.ts`) | **`EXIT=0`**, **`37/37` suites**, **`3,554` aserciones** completadas en `123.01s`. |
| **Suites en PostgreSQL Real (`7/7`)** | `npm run test:pg` (`test_pg_rls_planillas.ts`, `test_pg_seguridad.ts`, `test_pg_matriz_contable.ts`, `test_pg_backup_b2.ts`, `test_pg_fase_c_reportes.ts`, `test_pg_fase_d_multiusuario.ts`, `test_pg_fase_e_normativa_2026.ts`) | **`EXIT=0`**, **`7/7` aprobadas**: 69/69 escenarios contables cuadrados, cuadre cuádruple `S/ 0.00`, backup + alteración rechazada + aislamiento Empresa B + reconexión en frío, 66 ops en 3 sesiones (`1340.21 ms`), visibilidad compartida `164.95 ms`, `p50=40.85 ms`, `p95=282.93 ms`, `p99=346.81 ms`, normativa 2026 (`UIT=5500`, `RMV=1130`, IGV/SPOT/SIRE/PLE). |
| **Verificación Unificada** | `npm run verify` (`lint && test && test:pg`) | **`EXIT=0`** integral. |
| **Infraestructura y Migraciones PG** | `npm run test:infra` (`server/tests/real/test_infra.ts`) | **`EXIT=0`**, `5/5` escenarios aprobados (esquema vacío, reconexión, reinicio HTTP `server.ts`, reversión ante migración fallida, conservación de identidad legado, arranque cerrado ante secreto ausente). |
| **Certificados TLS LAN** | `npm run cert:lan` + verificación OpenSSL `3.5.5` | **`EXIT=0`**, CA `atlob-lan-ca.crt` y certificado servidor `atlob-lan.crt` verificados (`atlob-lan.crt: OK`) con SAN `192.168.1.34`, `127.0.0.1`, `localhost`, `JOSEPHMC`. |
| **Respaldo Cifrado Real CLI** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\respaldo-diario.ps1` y `--verificar` | **`EXIT=0`**, archivo `10722364002_20261114144409.atlob.bak` (`86,637` bytes, `61` archivos SHA-256 verificados en `666.41 ms`), verificación puntual `"valida": true`. |
| **Ciclo de Vida Real LAN HTTP + HTTPS** | `scripts/iniciar-servidor-lan.ps1 -NoAbrirNavegador` + verificación de endpoints + `scripts/detener-servidor-lan.ps1` | Servidor iniciado (`PID 20028`), HTTP `http://127.0.0.1:3000/api/health` → `200 POSTGRESQL_CONNECTED`, HTTPS LAN `https://192.168.1.34:3443/api/health` con CA local → `STATUS=200 TLS_AUTHORIZED=true POSTGRESQL_CONNECTED`, y detención limpia confirmando solo `PID 20028` terminado y `atlob-lan.pid` eliminado (`EXIT=0`). |
| **Sintaxis PowerShell (`6/6` scripts)** | `System.Management.Automation.Language.Parser::ParseFile` | `6/6` scripts (`actualizar-sistema.ps1`, `configurar-firewall-lan.ps1`, `detener-servidor-lan.ps1`, `inicializar-escritorio.ps1`, `iniciar-servidor-lan.ps1`, `respaldo-diario.ps1`) con **`SYNTAX_OK`**. |

---

## 3. Estado Real y Limitaciones Explícitas al Cierre

Con transparencia técnica total para el piloto:

1. **Inspección automatizada de navegador (`chrome_devtools` MCP):** Al solicitar al subagente `browser` abrir `http://127.0.0.1:3000` con el servidor activo, Chrome no tenía habilitada la depuración remota (`C:\Users\jimmy\AppData\Local\Google\Chrome\User Data\DevToolsActivePort` inexistente), por lo que la verificación visual interactiva en vivo mediante DevTools quedó bloqueada por configuración local de Chrome. La validez de rutas de frontend, ausencia de secretos/marcas competidoras en `dist/` y formato de reportes está cubierta por compilación `npm run build` y las suites automatizadas de `npm test` (`37/37`).
2. **Conectividad física desde una segunda y tercera PC de la oficina:** No se ejecutaron reglas de Windows Firewall automáticamente ni se instaló el certificado CA en almacenamiento raíz del sistema por respeto a los controles del equipo anfitrión. Se comprobó en este equipo `https://192.168.1.34:3443/api/health` (`TLS_AUTHORIZED=true`), quedando únicamente pendiente que el administrador ejecute `configurar-firewall-lan.ps1 -ConfirmarFirewall` en el servidor e instale `storage/certs/atlob-lan-ca.crt` en las estaciones cliente 2 y 3.
3. **Alcance funcional excluido del piloto:** El envío directo en vivo a OSE/SUNAT y la descarga automática API REST directa de SIRE permanecen deshabilitados deliberadamente en el piloto (operan mediante XML/CDR e importación manual de propuestas TXT/ZIP descargadas desde Clave SOL).
