# Matriz de Pruebas Multiusuario — ATLOB ERP v2.0.0

**Fecha de ejecución verificada:** 14 de noviembre de 2026  
**Entorno probado:** Windows 11 Pro (`10.0.26200`), PostgreSQL 18.6 local (`atlob_test`), Node.js `v26.13.0`  
**Script de prueba:** [`server/tests/real/test_pg_fase_d_multiusuario.ts`](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/server/tests/real/test_pg_fase_d_multiusuario.ts) (`EXIT=0`)

---

## 1. Alcance y Distinción de Pruebas Ejecutadas

- **Lo ejecutado y medido directamente en el equipo principal:** Prueba real de **3 sesiones simultáneas activas** (`ADMINISTRADOR`, `CONTADOR_SENIOR`, `ASISTENTE_CONTABLE`) + **1 sesión de auditoría** (`AUDITOR_REVISOR`) compitiendo concurrentemente sobre la misma empresa (`Empresa A`), más verificación de servidor vivo por **HTTPS LAN (`https://192.168.1.34:<puerto>`)** con certificado firmado por la CA local (`atlob-lan-ca.crt`), segregación de funciones, bloqueo optimista, aislamiento frente a `Empresa B` y reconexión tras cierre en frío.
- **Lo que corresponde a validación física en múltiples PCs de la oficina:** La conectividad desde una segunda y tercera computadora física cliente a través del router/switch del estudio depende de que el administrador autorice la regla de Windows Firewall (`configurar-firewall-lan.ps1 -ConfirmarFirewall`) e instale `atlob-lan-ca.crt` en dichos equipos según la [`GUIA_ACCESO_USUARIOS_LAN.md`](file:///c:/PROYECTOS%20SUNAT/Sistema%20Contable/GUIA_ACCESO_USUARIOS_LAN.md).

---

## 2. Matriz de Escenarios Concurrentes (3 Usuarios + Auditor)

| # | Escenario Evaluado | Actores Simultáneos | Resultado Medido Real | Umbral | Estado |
| :-: | :--- | :--- | :--- | :---: | :---: |
| 1 | **Carga concurrente de 3 sesiones en misma empresa** | U1 (`ADMINISTRADOR`), U2 (`CONTADOR_SENIOR`), U3 (`ASISTENTE_CONTABLE`) | **66 operaciones** (`22` c/u: 10 asientos + 5 compras + 5 ventas + 2 reportes/registros) completadas en **`1340.21 ms`** durante `npm run verify` (`967.66 ms` en corrida aislada) | ≥ 60 ops (`20 x 3`) | **APROBADO** |
| 2 | **Unicidad de correlativos y CUOs** | U1, U2, U3 en subdiarios `01`, `02`, `05`, `10` | **60/60 asientos** con `(subdiario_id, numero)` y `cuo` únicos (**0 colisiones**); 15 compras, 15 ventas, 15 CxP, 15 CxC íntegros | 0 duplicados / 0 perdidos | **APROBADO** |
| 3 | **Visibilidad cruzada inmediata entre sesiones** | U1 confirma asiento → U2 y U3 leen Diario, Mayor, Balance y ESF | Visibilidad simultánea medida en **`164.95 ms`** (`115.15 ms` aislada); diferencia contable **`S/ 0.00`** (`Diario == Mayor == Balance`) y ESF cuadrado | ≤ 5,000 ms / S/ 0.00 | **APROBADO** |
| 4 | **Prevención de pérdida de actualizaciones (Bloqueo optimista)** | U1 actualiza v1→v2; U2 y U3 intentan guardar v1 en Asiento y Compra borrador | Rechazo determinista con `VERSION_DESACTUALIZADA` en ambos casos; datos de U1 intactos | 0 sobrescrituras silenciosas | **APROBADO** |
| 5 | **Transporte cifrado HTTPS LAN y confianza TLS** | Servidor vivo `server.ts` (`HOST=0.0.0.0`, `HTTPS_ENABLED=1`) | Handshake TLS exitoso en `https://192.168.1.34:<puerto>/api/health` validando CA local `atlob-lan-ca.crt` y SAN (`127.0.0.1`, `192.168.1.34`, `localhost`, `JOSEPHMC`) → HTTP `200` | TLS válido sin bypass | **APROBADO** |
| 6 | **Control de acceso por roles (RBAC HTTPS)** | U4 (`AUDITOR_REVISOR`) vs U1/U2/U3 vía `POST /api/auth/login` + endpoints REST | U4 lee Registro de Compras (`200`) y es bloqueado al crear compra (`403`); U3 es bloqueado al intentar contabilizar (`403`) | 0 accesos indebidos | **APROBADO** |
| 7 | **Segregación de funciones contable (HTTPS)** | U1 crea borrador vía `POST /asientos` (`201`) → U1 intenta contabilizar → U2 contabiliza | U1 recibe `400` (`SEGREGACION_FUNCIONES`) al intentar aprobar su propio borrador; U2 (`CONTADOR_SENIOR`) contabiliza (`200`) | Separación obligatoria | **APROBADO** |
| 8 | **Aislamiento estricto multiempresa (IDOR + RLS)** | U2 (`CONTADOR_SENIOR`) y U3 (`ASISTENTE_CONTABLE`) solicitan `Empresa B` vía HTTPS | Bloqueo HTTP `403 PERMISO_INSUFICIENTE` para ambos usuarios en `Empresa B` | 0 fugas entre empresas | **APROBADO** |
| 9 | **Latencia extremo a extremo bajo carga de 3 sesiones** | 74 operaciones medidas (concurrentes DB + HTTPS API) | **Promedio:** `71.04 ms` · **p50:** `40.85 ms` · **p95:** `282.93 ms` · **p99:** `346.81 ms` · **Máx:** `346.81 ms` (en `npm run verify`) | p95 ≤ 2,000 ms | **APROBADO** |
| 10 | **Persistencia tras cierre y reinicio en frío** | Cierre completo del pool (`pool.end()`) y reconexión con pool limpio | **63/63 asientos**, Diario, Mayor, Balance y ESF recuperados al 100% con cuadre **`S/ 0.00`** | 100% conservado | **APROBADO** |

---

## 3. Protocolo de Verificación Física en la Red LAN del Estudio (2 a 3 PCs Reales)

Una vez habilitada la regla de Firewall privada en el servidor y copiado `storage/certs/atlob-lan-ca.crt` en la PC 2 y PC 3:
1. Abrir `https://192.168.1.34:3443` en el navegador de la PC 2 (`CONTADOR_SENIOR`) y de la PC 3 (`ASISTENTE_CONTABLE`).
2. Confirmar candado HTTPS sin advertencias de certificado.
3. Registrar una compra desde PC 3, confirmar en PC 1 (`ADMINISTRADOR`) y observar la aparición automática en PC 2 en `≤ 4 segundos` sin recargar manualmente la página.
