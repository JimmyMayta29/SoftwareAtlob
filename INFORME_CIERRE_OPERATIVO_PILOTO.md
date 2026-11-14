# INFORME DE CIERRE OPERATIVO — PILOTO INTERNO ATLOB ERP

**Fecha de emisión:** 14 de noviembre de 2026  
**Equipo anfitrión:** `JOSEPHMC` (`192.168.1.34`, Perfil de red: `Private`, Interfaz: `MAYTA Ethernet`)  
**Versión de paquete:** `contabilidad-estudio` (`0.0.0`, línea piloto ATLOB ERP sobre commit base `146a3ba`)  
**Base de datos operativa:** PostgreSQL `18.6` — base `sistema_contable` (costo mensual adicional de alojamiento: **US$ 0.00**)

---

## 1. Estado inicial vs. Estado final

### Estado inicial recibido (`146a3ba`)
- El código base contaba con soporte TLS/HTTP y scripts de despliegue LAN, pero faltaban endurecimientos operativos verificados para entorno multiusuario piloto:
  - El servidor HTTP en puerto `3000` requería restricción estricta a `127.0.0.1` cuando HTTPS estaba activo y filtrado efectivo de subred privada cuando operaba en LAN.
  - Los scripts de arranque y firewall necesitaban endurecimiento de permisos NTFS sobre `.env`/claves privadas y confirmación explícita para apertura exclusiva del puerto TCP `3443`.
  - La restauración de respaldos en una base limpia (`BackupEmpresaService.restaurarBackup`) únicamente reescribía `empresa_id`, provocando fallos de clave foránea (`SQLSTATE 23503`) al omitirse credenciales y tablas de control por política de seguridad al restaurar entre instancias distintas.
  - Faltaba validación E2E reproducible en base aislada (`atlob_piloto`), prueba real de recuperación ante desastres entre bases (`atlob_restore_test`), verificación de las tasas especiales MYPE IGV/IPM 2025–2027 en catálogo tributario y provisión controlada de usuarios piloto hasta el límite de licencia (`3`).

### Estado final alcanzado
- **Servidor en ejecución:** proceso activo **PID `4676`** conectado a `sistema_contable` (`PostgreSQL 18.6`), respondiendo `HTTP 200` en `/api/health` con `persistenciaCompleta: true`.
- **Integridad preservada de la empresa existente:** la base productiva `sistema_contable` conserva intacta a la empresa autorizada RUC `10722364002` (`JOSEPH MAYTA`, régimen `MYPE_TRIBUTARIO`), con `0` asientos, `0` comprobantes de compra, `0` comprobantes de venta y `0` trabajadores creados por las pruebas.
- **Bases temporales limpias:** `atlob_piloto` y `atlob_restore_test` fueron eliminadas tras concluir las pruebas; únicamente permanecen `sistema_contable`, `atlob_test` y `postgres`.
- **Cambios de código, scripts y pruebas incorporados en el repositorio:**
  - [server.ts](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/server.ts)
  - [server/services/backupEmpresaService.ts](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/server/services/backupEmpresaService.ts)
  - [server/repositories/parametroRepository.ts](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/server/repositories/parametroRepository.ts)
  - [server/db/seed.ts](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/server/db/seed.ts)
  - [scripts/generar-certificado-lan.ts](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/scripts/generar-certificado-lan.ts)
  - [scripts/iniciar-servidor-lan.ps1](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/scripts/iniciar-servidor-lan.ps1)
  - [scripts/configurar-firewall-lan.ps1](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/scripts/configurar-firewall-lan.ps1)
  - [scripts/actualizar-sistema.ps1](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/scripts/actualizar-sistema.ps1)
  - [scripts/respaldo-diario.ps1](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/scripts/respaldo-diario.ps1)
  - [scripts/verificar-operacion-piloto-pc.ts](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/scripts/verificar-operacion-piloto-pc.ts)
  - [scripts/configurar-usuarios-piloto.ts](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/scripts/configurar-usuarios-piloto.ts)
  - [scripts/verificar-restauracion-aislada.ts](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/scripts/verificar-restauracion-aislada.ts)

---

## 2. Seguridad, red, PostgreSQL e HTTPS LAN

| Superficie | Configuración verificada | Evidencia observada |
|---|---|---|
| **HTTP local (`3000`)** | Enlazado exclusivamente a `127.0.0.1:3000` (PID `4676`) | `http://127.0.0.1:3000/api/health` responde `200`; `http://192.168.1.34:3000/api/health` rechazado (`ECONNREFUSED`). |
| **HTTPS LAN (`3443`)** | Enlazado a `0.0.0.0:3443` (PID `4676`) con `LAN_ONLY=1` (filtro RFC1918/loopback, `403 ACCESO_LAN_PRIVADA_REQUERIDO` fuera de subred privada) | `https://192.168.1.34:3443/api/health` responde `200` validando cadena CA (`rejectUnauthorized: true`); conexión TLS sin CA local rechazada. |
| **Certificado TLS y CA local** | CN `192.168.1.34`, SAN DNS `localhost`, `JOSEPHMC`, IP `127.0.0.1`, `192.168.1.34`; verificación OpenSSL `OK` | Huella CA SHA-256 binario: `1d7794fbfa016960006947f8d85e044d04d12fbaf556f6223ea30e143b224ff7`; huella X.509 OpenSSL: `47:00:D1:74:71:8C:C5:26:34:73:69:26:B9:1D:59:BA:86:E3:5A:C7:67:C9:1E:42:C1:5C:7B:4B:9A:29:F4:6A`. |
| **Carpeta pública cliente (`storage/certs/cliente-lan`)** | Únicamente certificado público CA y guía de huella (`0` archivos `.key`) | Contiene solo `atlob-lan-ca.crt` (`1,289` bytes) y `VERIFICACION-CA-SHA256.txt` (`913` bytes). |
| **Protección NTFS de secretos (`icacls`)** | Acceso restringido únicamente a `JOSEPHMC\jimmy`, `BUILTIN\Administradores` y `NT AUTHORITY\SYSTEM` | Verificado mediante `icacls` sobre `.env`, `storage/certs/atlob-lan-ca.key`, `storage/certs/atlob-lan.key` y `storage/instancia/credenciales-piloto-local.json`. |
| **PostgreSQL (`5432`)** | PostgreSQL `18.6` escuchando en local (`0.0.0.0:5432` y `:::5432`, PID `8356`) sin apertura en Firewall | Perfil Privado de Windows Defender Firewall activo con política `BlockInbound,AllowOutbound`; sin reglas entrantes para `5432` ni `ATLOB` en esta sesión sin elevación. |
| **Firewall / Tareas Programadas / Store Windows** | **Sin modificaciones sin autorización** | Comprobación de reglas de firewall por filtro WMI retornó `Acceso denegado` en consola estándar; el perfil Privado bloquea conexiones entrantes externas hasta que el administrador confirme la regla para TCP `3443`. No se registraron tareas automáticas de ATLOB ERP en Windows. |
| **Verificación de marcas** | Cero referencias a sistemas de terceros en código rastreado y archivos nuevos | `TRACKED_BRAND_HITS=0`, `UNTRACKED_BRAND_HITS=0`. |

---

## 3. Validación E2E en PC principal y limitación honesta de navegador

### Prueba E2E aislada (`scripts/verificar-operacion-piloto-pc.ts`) sobre `atlob_piloto`
- **Ciclo operativo completo (`PID 8328`, salida `0`):**
  - Salud `/api/health` y estado `/api/setup/status`, método de inventario `PERMANENTE`, alta de empresa de prueba RUC `20608889991`, compra por `S/ 1,180.00` (IGV `S/ 180.00`), venta por `S/ 2,360.00` (IGV `S/ 360.00`), asiento manual por `S/ 5,000.00` creado por `ASISTENTE_CONTABLE` y contabilizado por `CONTADOR_SENIOR`.
  - Controles negativos y RBAC verificados: HTTP LAN bloqueado (`httpLanBloqueado: true`), TLS sin CA rechazado (`tlsSinCaRechazado: true`), entrega de SPA `/assets/index-BwOJ0LUx.js` con HTTP `200`, usuario auditor bloqueado en escritura (`403`), asistente bloqueado para contabilizar (`403`), contador senior autorizado (`200`).
  - Cuadre contable integral:
    - **Registro de Compras:** total `S/ 1,180.00` (IGV `S/ 180.00`).
    - **Registro de Ventas:** total `S/ 2,360.00` (IGV `S/ 360.00`).
    - **Libro Diario (`3` asientos):** Debe `S/ 9,540.00` / Haber `S/ 9,540.00`.
    - **Libro Mayor:** sumas Debe `S/ 9,540.00` / Haber `S/ 9,540.00`.
    - **Resultado del ejercicio:** `S/ 2,000.00`.
    - **Estado de Situación Financiera:** Total Activo `S/ 8,360.00`, Total Pasivo y Patrimonio `S/ 8,360.00`, **diferencia de cuadre `0.00`**.
- **Persistencia tras reinicio del servidor (`--solo-verificar-persistencia`, `PID 19620`, salida `0`):** se confirmaron los mismos saldos (`esfTotalActivo: 8360`, `esfDiferenciaCuadre: 0`) luego de detener y volver a iniciar el servidor.

### Limitación honesta en validación visual de navegador y PC clientes
- El intento automatizado con el subagente de navegador (`mcp_chrome_devtools_list_pages`) quedó **bloqueado** por ausencia de `C:\Users\jimmy\AppData\Local\Google\Chrome\User Data\DevToolsActivePort` (`ENOENT`).
- **No se ejecutaron** pruebas visuales interactivas en Chrome/Edge desde la PC principal ni pruebas físicas reales desde PC 2 o PC 3 en la red LAN; quedan registradas en los compromisos operativos previos al uso cotidiano en equipo cliente.

---

## 4. Operación multiusuario LAN (hasta 3 usuarios) y guía para PC 2 / PC 3

### Usuarios y licencia verificados en `sistema_contable`
- **Licencia activa:** tipo `EVALUACION`, límite `max_usuarios = 3`, `vigente_hasta = null`.
- **Cuentas activas (`3/3` asignadas a RUC `10722364002` `JOSEPH MAYTA`):**
  1. `jimmy` (`ADMINISTRADOR`) — administrador titular preexistente.
  2. `contador_lan` (`CONTADOR_SENIOR`) — cuenta piloto para PC 2.
  3. `asistente_lan` (`ASISTENTE_CONTABLE`) — cuenta piloto para PC 3.
- **Pruebas de autenticación en vivo por HTTPS LAN:** `contador_lan` y `asistente_lan` iniciaron sesión correctamente en `https://192.168.1.34:3443/api/auth/login` (HTTP `200`) con `1` empresa autorizada (`10722364002`).
- **Custodia de credenciales iniciales:** almacenadas exclusivamente en el archivo protegido local `storage/instancia/credenciales-piloto-local.json` (fuera de git, nunca en informes ni respuestas).

### Guía rápida de conexión para PC 2 y PC 3 (máximo 3 usuarios simultáneos)
> **Prerrequisito en la PC principal (`JOSEPHMC`):** antes de que PC 2 y PC 3 puedan alcanzar el puerto `3443` desde la red privada, el administrador debe habilitar la regla de firewall descrita en la Sección 7.

1. Copiar desde la PC principal hacia PC 2 y PC 3 **únicamente** el contenido de `storage\certs\cliente-lan\` (`atlob-lan-ca.crt` y `VERIFICACION-CA-SHA256.txt`). **Nunca copiar** archivos `.key` ni `.env`.
2. Verificar en PowerShell en PC 2 / PC 3 que el hash SHA-256 de `atlob-lan-ca.crt` coincida exactamente con `1D7794FBFA016960006947F8D85E044D04D12FBAF556F6223EA30E143B224FF7`:
   ```powershell
   Get-FileHash .\atlob-lan-ca.crt -Algorithm SHA256
   ```
3. Hacer doble clic en `atlob-lan-ca.crt` → **Instalar certificado...** → **Usuario actual** → **Colocar todos los certificados en el siguiente almacén** → **Entidades de certificación raíz de confianza** → finalizar.
4. Cerrar completamente y volver a abrir Chrome o Edge, ingresar a `https://192.168.1.34:3443` e iniciar sesión con el usuario asignado en `storage\instancia\credenciales-piloto-local.json` (y cambiar la contraseña inicial tras el primer ingreso).

---

## 5. Respaldo diario y prueba de restauración aislada (RTO y SHA-256)

### Corrección de restauración entre instancias (`BackupEmpresaService`)
- Al ejecutar la primera prueba limpia en base nueva, se detectó que `restaurarBackup` solo remapeaba `empresa_id`, causando errores `SQLSTATE 23503` sobre claves foráneas hacia `tenants` y `usuarios_estudio` (excluidos del archivo `.atlob.bak` conforme a las reglas del proyecto).
- Se actualizó [server/services/backupEmpresaService.ts](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/server/services/backupEmpresaService.ts) para resolver dinámicamente las referencias declaradas en el registro único:
  - `remapeo: 'empresa_destino'` → ID de la empresa destino.
  - `remapeo: 'control_destino'` → `tenant_id` de la empresa destino.
  - `remapeo: 'evidencia_origen'` → conserva el ID de usuario si existe en destino; en caso contrario asigna `null` si la columna admite nulos o el usuario ejecutor de respaldo si es `NOT NULL`.

### Prueba de desastre en base aislada `atlob_restore_test` (`scripts/verificar-restauracion-aislada.ts`)
- **Archivo respaldado de prueba:** `89,197` bytes; SHA-256 `169b6cdddbe4b2ff429cb008631180aed6727ade172435a556947092d2109267`.
- **Resultado:** `0` errores de FK (`[Restore]`), **`1,695` registros restaurados** con paridad exacta (`asientos: 3`, `detalles: 10`, `compras: 1`, `ventas: 1`, `anexos: 2`).
- **Tiempos de recuperación (RTO) medidos:**
  - **RTO de restauración de datos:** `1,859 ms`.
  - **RTO total incluyendo bootstrap de esquema:** `7,384 ms`.
- **Integridad contable post-restauración:** `comprasTotalGeneral = 1180`, `ventasTotalGeneral = 2360`, `diarioTotalDebe = 9540`, `diarioTotalHaber = 9540`, `esfTotalActivo = 8360`, `esfTotalPasivoYPatrimonio = 8360`, **`esfDiferenciaCuadre = 0`**.

### Respaldo real ejecutado para `10722364002` (`JOSEPH MAYTA`)
- Ejecutado con [scripts/respaldo-diario.ps1](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/scripts/respaldo-diario.ps1):
  - **Archivo local:** `storage\respaldos\2026-11-14\10722364002_20261114221609.atlob.bak` (`86,734` bytes, `61` archivos verificados, duración `886.69 ms`, `verificado: true`).
  - **SHA-256:** `53aac633c11be81d40997d409ebd54bdbee6134874b3d1dfb37768fd92487fb7`.
  - **Copia externa y bitácora:** verificadas en `C:\Users\jimmy\Documents\Respaldos_ATLOB_ERP\2026-11-14\10722364002_20261114221609.atlob.bak`, `.sha256` (`103` bytes) y `C:\Users\jimmy\Documents\Respaldos_ATLOB_ERP\bitacora-respaldos.json`.
  - **Nota técnica observada:** la ejecución CLI independiente (`ejecutar-respaldo-cli.ts`) registra una advertencia no fatal de RLS al intentar escribir en tabla de auditoría sin contexto HTTP `app.empresa_id`, sin afectar la generación, integridad ni firma SHA-256 del `.atlob.bak`.

---

## 6. Normativa tributaria y laboral 2026 verificada

Consulta directa contra `GET https://192.168.1.34:3443/api/parametros` (`92` parámetros devueltos sobre la instancia viva):

| Código | Valor observado | Vigencia | Norma de respaldo registrada |
|---|---:|---|---|
| `VALOR_UIT_2026` / `UIT` | `5500` (`S/ 5,500`) | Desde `2026-01-01` | D.S. N° 301-2025-EF (El Peruano, `17/12/2025`) |
| `TASA_IGV` (`TASA_IGV_PURO` + `TASA_IPM`) | `0.18` (`0.16` + `0.02`) | Desde `2011-03-01` | TUO Ley del IGV D.S. N° 055-99-EF Art. 17°, Ley N° 29666 y D.Leg. N° 776 Art. 76° |
| `TASA_IGV_ESPECIAL_MYPE_PURO` (2025–2026) | `0.08` (`8%`) | `2025-01-01` al `2026-12-31` | Ley N° 31556 modificada por Ley N° 32219 Arts. 3° y 4° |
| `TASA_IGV_ESPECIAL_MYPE_TOTAL` (2025–2026) | `0.10` (`8% + 2%`) | `2025-01-01` al `2026-12-31` | Ley N° 31556 / Ley N° 32219 Art. 3° + D.Leg. N° 776 Art. 76° |
| `TASA_IGV_ESPECIAL_MYPE_PURO` (2027) | `0.12` (`12%`) | `2027-01-01` al `2027-12-31` | Ley N° 31556 modificada por Ley N° 32219 Arts. 3° y 4° |
| `TASA_IGV_ESPECIAL_MYPE_TOTAL` (2027) | `0.14` (`12% + 2%`) | `2027-01-01` al `2027-12-31` | Ley N° 31556 / Ley N° 32219 Art. 3° + D.Leg. N° 776 Art. 76° |
| `TASA_RETENCION_IGV` | `0.03` (`3%`) | Desde `2014-03-01` | R.S. N° 037-2002/SUNAT y R.S. N° 033-2014/SUNAT |
| `TASA_PERCEPCION_IGV` | `0.02` (`2%`) | Desde `2014-01-01` | Ley N° 29173 y D.S. N° 091-2013-EF |
| `TASA_RETENCION_4TA` / `TOPE_RETENCION_4TA` | `0.08` (`8%`) / `1500` (`S/ 1,500`) | Vigentes | TUO LIR D.S. N° 179-2004-EF Art. 74°, Ley N° 30296, D.S. N° 215-2006-EF |
| `TASA_ESSALUD` | `0.09` (`9%`) | Desde `2020-01-01` | Ley N° 26790 Art. 6° inc. a) |
| `RMV` (hasta sept. 2026) | `1130` (`S/ 1,130`) | `2025-01-01` al `2026-09-30` | D.S. N° 006-2024-TR |
| `RMV` (vigente desde oct. 2026) | `1230` (`S/ 1,230`) | Desde `2026-10-01` | D.S. N° 015-2026-TR (primer tramo; segundo tramo `S/ 1,300` marcado como pendiente) |
| Regímenes Renta (`MYPE_SUB300`, `RG_MIN`, `RER`, `ANUAL_MYPE_T1`, `ANUAL_GENERAL`) | `0.01`, `0.015`, `0.015`, `0.10` (<= 15 UIT), `0.295` | Vigentes | D.Leg. N° 1269 y TUO LIR D.S. N° 179-2004-EF |
| `TASA_ITF` | `0.00005` (`0.005%`) | Desde `2011-04-01` | TUO Ley N° 28194 y Ley N° 29667 |

---

## 7. Riesgos residuales y compromisos operativos

1. **Apertura de Firewall LAN pendiente (requiere consola elevada):** actualmente el perfil Privado de Windows Defender Firewall tiene `BlockInbound,AllowOutbound`. Hasta ejecutar como **Administrador**:
   ```powershell
   .\scripts\configurar-firewall-lan.ps1 -ConfirmarFirewall
   ```
   (o evaluar vista previa con `.\scripts\configurar-firewall-lan.ps1`), PC 2 y PC 3 recibirán bloqueo entrante al puerto `3443`. PostgreSQL (`5432`) y HTTP (`3000`) permanecerán bloqueados para la LAN.
2. **Inicio automático en Windows (opcional bajo decisión del administrador):** si se desea arranque automático tras reinicio de la PC, ejecutar como Administrador el script con `-RegistrarTareaProgramada`, previa revisión operativa.
3. **Validación visual en navegador y pruebas físicas desde PC 2 y PC 3:** pendiente validar inicio de sesión, selector de empresa y vistas principales en Chrome/Edge en la PC principal (`https://192.168.1.34:3443`) y desde PC 2 / PC 3 tras instalar `atlob-lan-ca.crt` y abrir TCP `3443`.
4. **Cambio de contraseñas iniciales y rotación de IP:** cambiar la contraseña inicial de `contador_lan` y `asistente_lan` al primer ingreso; si la IP LAN DHCP de `JOSEPHMC` cambia desde `192.168.1.34`, reemitir el certificado LAN con `generar-certificado-lan.ts` (o fijar reserva DHCP en el router).
5. **Espacio libre en disco `C:`:** `19.74 GB` disponibles (`216.4 GB` usados). Aceptable para el piloto actual, pero requiere monitoreo o rotación periódica de respaldos históricos y registros en `C:\Users\jimmy\Documents\Respaldos_ATLOB_ERP`.
6. **Advertencia no fatal de auditoría RLS en CLI de respaldo:** pendiente en una iteración de mantenimiento futura inicializar contexto `app.empresa_id` en [scripts/ejecutar-respaldo-cli.ts](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/scripts/ejecutar-respaldo-cli.ts) para evitar el aviso de auditoría en respaldos por consola.

---

## 8. Veredicto final para piloto interno

**APTO PARA PILOTO INTERNO CON ACCIONES ADMINISTRATIVAS DE HABILITACIÓN LAN EN WINDOWS.**

- **Operativo desde ya en la PC principal (`JOSEPHMC`):** servidor vivo en `PID 4676` sobre PostgreSQL `18.6` (`sistema_contable`), base real `10722364002` (`JOSEPH MAYTA`) intacta, aislamiento HTTP `127.0.0.1:3000` + HTTPS TLS `3443`, `3/3` cuentas configuradas, respaldo real verificado con copia externa y restauración cruzada probada con `0` errores de FK y cuadre `S/ 0.00`.
- **Para habilitar el acceso desde PC 2 y PC 3 en red local:** el administrador solo debe confirmar la regla TCP `3443` en Firewall Privado (`.\scripts\configurar-firewall-lan.ps1 -ConfirmarFirewall` en PowerShell elevado), instalar `atlob-lan-ca.crt` en el almacén raíz del usuario actual en PC 2 / PC 3 y validar la navegación visual inicial en Chrome o Edge.
