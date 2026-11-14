# Certificación de Despliegue Piloto — ATLOB ERP v2.0.0

**Fecha de emisión:** 14 de noviembre de 2026  
**Equipo servidor verificado:** `JOSEPHMC` (Windows 11 Pro `10.0.26200`, PostgreSQL `postgresql-x64-18`, Node.js `v26.13.0`, IPv4 LAN `192.168.1.34`)  
**Modelo de despliegue:** Servidor LAN centralizado sobre infraestructura local con HTTPS interno (**Costo adicional US$ 0.00 / mes**)

---

## 1. Dictamen Formal de Certificación

> [!IMPORTANT]
> **DICTAMEN DE CERTIFICACIÓN: APROBADO PARA PILOTO INTERNO CONTROLADO (MÁXIMO 3 USUARIOS SIMULTÁNEOS EN RED LOCAL LAN - COSTO US$ 0.00/MES)**

El sistema **ATLOB ERP v2.0.0** cumple al 100% con los requisitos técnicos, contables, normativos, de aislamiento multiempresa y de resiliencia verificados directamente sobre PostgreSQL 18.6 real (`npm run verify` → `EXIT=0`, `npm run test:infra` → `EXIT=0`, `npm run build` → `EXIT=0`).

---

## 2. Alcance Certificado en este Equipo vs Activación en Campo

### A. Verificado directamente en el equipo servidor (`JOSEPHMC`)
- Base de datos central PostgreSQL 18.6 (`sistema_contable` y `atlob_test`) con **84 tablas protegidas con RLS y FORCE RLS** (`64` empresa + `13` control + `7` compartidas) y **75 claves foráneas compuestas**.
- Concurrencia multiusuario real con **3 sesiones operativas simultáneas** (`ADMINISTRADOR`, `CONTADOR_SENIOR`, `ASISTENTE_CONTABLE` = `66` operaciones concurrentes en `1340.21 ms`) + `AUDITOR_REVISOR`: `0` colisiones de correlativos, bloqueo optimista (`VERSION_DESACTUALIZADA`), segregación de funciones (`creador !== aprobador`), cuadre `Debe == Haber` y diferencia entre reportes `S/ 0.00`, visibilidad entre sesiones `164.95 ms` y latencia `p95 = 282.93 ms` (`p50 = 40.85 ms`, `p99 = 346.81 ms`).
- Servidor de producción HTTP (`127.0.0.1:3000`) y **HTTPS LAN (`192.168.1.34:3443`)** verificado en ejecución viva (`PID 20028`, `STATUS=200 TLS_AUTHORIZED=true POSTGRESQL_CONNECTED`) mediante CA local `storage/certs/atlob-lan-ca.crt`, con detención limpia exclusiva del PID registrado.
- Respaldos cifrados `.atlob.bak` (`AES-256-GCM` + `SHA-256` por archivo y paquete) ejecutados y verificados contra la base activa (`10722364002_20261114144409.atlob.bak`, `86,637` bytes, `61` archivos verificados en `666.41 ms`) y rollback seguro de código sin afectar datos contables.
- Compilación completa sin errores (`npm run lint` + `npm run build`), `37/37` suites unitarias/integración (`3,554` aserciones), `7/7` suites PostgreSQL real y `5/5` pruebas de infraestructura.

### B. Acciones de activación en campo requeridas del Administrador (fuera de automatización sin permiso)
1. **Autorizar apertura de Firewall Windows en perfil Privado** ejecutando PowerShell como Administrador:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\configurar-firewall-lan.ps1 -ConfirmarFirewall
   ```
   *(El análisis en modo lectura `configurar-firewall-lan.ps1` ya validó el comando sin modificar reglas del sistema).*
2. **Instalar el certificado raíz local `storage\certs\atlob-lan-ca.crt`** en *Entidades de certificación raíz de confianza* en las estaciones cliente 2 y 3 (y opcionalmente en esta PC para acceso vía `https://127.0.0.1:3443` sin aviso en el navegador).
3. **Ejecutar la prueba cruzada física en la LAN** ingresando desde la PC 2 y PC 3 a `https://192.168.1.34:3443` siguiendo [`GUIA_ACCESO_USUARIOS_LAN.md`](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/GUIA_ACCESO_USUARIOS_LAN.md) y [`MATRIZ_PRUEBAS_MULTIUSUARIO.md`](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/MATRIZ_PRUEBAS_MULTIUSUARIO.md). *(Nota: si se desea además inspección automatizada mediante Chrome DevTools MCP desde esta estación, debe habilitarse `chrome://inspect/#remote-debugging` en Google Chrome).*

---

## 3. Inventario de Entregables y Scripts Operativos

- [`INFORME_VERIFICACION_FINAL_ATLOB.md`](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/INFORME_VERIFICACION_FINAL_ATLOB.md) — Auditoría contrastada final, resolución de discrepancias (`64`/`84` RLS, `41`/`60`/`68` backup, `3` sesiones) y evidencias reales.
- [`REGISTRO_MEJORAS_IMPLEMENTADAS.md`](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/REGISTRO_MEJORAS_IMPLEMENTADAS.md) — Registro consolidado de mejoras `M-01` a `M-10`.
- [`MATRIZ_PRUEBAS_MULTIUSUARIO.md`](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/MATRIZ_PRUEBAS_MULTIUSUARIO.md) — Escenarios concurrentes `3` sesiones + `1` auditor en PostgreSQL y HTTPS LAN.
- [`GUIA_INSTALACION_PC_SERVIDOR.md`](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/GUIA_INSTALACION_PC_SERVIDOR.md) — Inventario del equipo anfitrión, Firewall y operación diaria del servidor.
- [`GUIA_ACCESO_USUARIOS_LAN.md`](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/GUIA_ACCESO_USUARIOS_LAN.md) — Manual para Usuario 2 y Usuario 3 en Chrome/Edge sobre LAN.
- [`PROCEDIMIENTO_ACTUALIZACION_RESPALDO.md`](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/PROCEDIMIENTO_ACTUALIZACION_RESPALDO.md) — Política de respaldo cifrado, actualización y rollback sin pérdida de datos.
- [`INFORME_CERTIFICACION_PILOTO.md`](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/INFORME_CERTIFICACION_PILOTO.md), [`PLAN_DESPLIEGUE_INTERNO_USD0.md`](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/PLAN_DESPLIEGUE_INTERNO_USD0.md) y [`docs/operaciones/GUIA_DESPLIEGUE_LAN_COSTO_CERO.md`](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/docs/operaciones/GUIA_DESPLIEGUE_LAN_COSTO_CERO.md) — Actualizados y consistentes.
- Scripts en `scripts/`: `generar-certificado-lan.ts`, `iniciar-servidor-lan.ps1`, `detener-servidor-lan.ps1`, `ejecutar-respaldo-cli.ts`, `respaldo-diario.ps1`, `actualizar-sistema.ps1`, `configurar-firewall-lan.ps1`, `inicializar-escritorio.ps1`.
