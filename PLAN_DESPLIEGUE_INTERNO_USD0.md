# Plan de Despliegue Interno de Costo US$0 — ATLOB ERP

**Fecha:** 13 de noviembre de 2026  
**Finalidad:** Definir la arquitectura, topología, instalación, sincronización y operación para el piloto interno con 1–2 usuarios en red local (LAN) o escritorio Windows sin incurrir en costos mensuales de hosting o licencias de terceros.

---

## 1. Arquitectura Seleccionada: Servidor LAN Centralizado en Equipo Principal

### 1.1 Justificación Técnica y Económica
- **Costo de licencias e infraestructura:** US$ 0.00 / mes.
- **Topología:**
  - **Equipo Servidor (Estudio Contable):** Computadora con Windows 10/11 o Linux que ejecuta la instancia PostgreSQL 18 local (`atlob_db`) y el backend Node.js / Express en el puerto 3000 (o empaquetado Electron con backend activo).
  - **Equipo Cliente 1 (Usuario Principal):** Conexión vía navegador local (`http://localhost:3000`) o aplicación de escritorio Electron conectada a la instancia local.
  - **Equipo Cliente 2 (Asistente Contable / Segundo Usuario):** Acceso por red local (LAN) vía navegador web (`http://<IP_SERVIDOR_LAN>:3000`) autenticado con JWT y RBAC.
- **Seguridad en LAN:**
  - Tráfico protegido por tokens JWT de corta duración y revocación inmediata.
  - RLS obligatorio en motor PostgreSQL para aislar empresas.
  - Cero exposición de puertos a Internet abierta sin VPN/túnel seguro.
  - Validación de CORS estricta (`ALLOWED_ORIGIN=http://localhost:3000,http://<IP_LAN>:3000`).

---

## 2. Requisitos de Rendimiento y Sincronización para 2 Usuarios

- **Tiempo de respuesta:** p95 ≤ 2.0 segundos para operaciones contables en LAN.
- **Sincronización:** Máximo 5 segundos de desfase para visibilidad de cambios entre usuarios (vía revalidación React Query / polling suave de 3–5s o SSE).
- **Concurrencia:** Bloqueo optimista por versión (`version` en tablas críticas) para evitar sobreescritura ciega de vouchers o comprobantes.
- **Persistencia garantizada:** Datos confirmados en PostgreSQL 18 con WAL y copias de seguridad automáticas programadas sin costo.
