# Plan de Despliegue Interno de Costo US$ 0.00 — ATLOB ERP

**Fecha de actualización:** 14 de noviembre de 2026  
**Finalidad:** Definir la topología, instalación, transporte cifrado HTTPS LAN, sincronización y operación para el piloto interno con **1 a 3 usuarios simultáneos** en red local (LAN) y Windows sin costos mensuales recurrentes.

---

## 1. Arquitectura Seleccionada: Servidor LAN Centralizado en Equipo Principal

- **Costo mensual adicional de alojamiento:** **US$ 0.00 / mes** (hardware local del estudio con PostgreSQL 18 + Node.js/Express).
- **Equipo Servidor (`JOSEPHMC`, Windows 11 Pro, IPv4 LAN `192.168.1.34`):**
  - Base de datos central **PostgreSQL 18** (`127.0.0.1:5432`, servicio `postgresql-x64-18`).
  - Servidor backend + frontend compilado (`dist/`), escuchando en HTTP local (`3000`) y **HTTPS LAN (`3443`)** con certificado local `storage/certs/atlob-lan.crt` firmado por la CA interna `storage/certs/atlob-lan-ca.crt`.
- **Usuarios Concurrentes (Máximo 3 simultáneos en piloto):**
  - **Usuario 1 (`ADMINISTRADOR` / Contador Principal):** Desde el equipo servidor (`https://127.0.0.1:3443`, `http://localhost:3000` o aplicación de escritorio Electron).
  - **Usuarios 2 y 3 (`CONTADOR_SENIOR` / `ASISTENTE_CONTABLE`):** Desde sus computadoras en la red privada LAN ingresando a **`https://192.168.1.34:3443`** tras instalar una sola vez `atlob-lan-ca.crt`.

---

## 2. Requisitos Verificados de Seguridad, Concurrencia y Rendimiento

- **Cifrado de transporte:** HTTPS TLS 1.2/1.3 en LAN con SAN que cubre `192.168.1.34`, `127.0.0.1`, `localhost` y `JOSEPHMC`, más tokens JWT HS256 y CORS restringido por origen LAN.
- **Aislamiento multiempresa:** **84 de 84 tablas** del esquema `public` con `ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY` (`64` tablas operativas de empresa + `13` de control + `7` compartidas) y **75 claves foráneas compuestas** `(empresa_id, id)`.
- **Rendimiento medido (3 sesiones simultáneas, 66 operaciones concurrentes en `npm run verify` sobre PostgreSQL real):**
  - Latencia `promedio = 71.04 ms`, `p50 = 40.85 ms`, `p95 = 282.93 ms` (umbral `≤ 2,000 ms`), `p99 = 346.81 ms`.
  - Visibilidad cruzada entre las 3 sesiones confirmada en `164.95 ms` en BD (meta `≤ 5,000 ms`; UI sincroniza automáticamente cada `4,000 ms`).
  - Bloqueo optimista (`VERSION_DESACTUALIZADA`) evitando pérdida o sobrescritura silenciosa de asientos y comprobantes.
- **Operación segura:** Arranque y detención controlados únicamente mediante PID propio (`storage/instancia/atlob-lan.pid`), respaldos diarios cifrados con AES-256-GCM y verificados con SHA-256 (`scripts/respaldo-diario.ps1`), y actualización con rollback seguro (`scripts/actualizar-sistema.ps1`).
