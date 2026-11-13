# Informe de Certificación para Piloto Interno — ATLOB ERP

**Versión:** 1.1.0  
**Fecha de evaluación:** 13 de noviembre de 2026  
**Dictamen actual:** FASE A Y B APROBADAS AL 100% (FASE B2 SIGUIENTE)  
**Alcance del Piloto:** 1–2 usuarios en estudio contable, empresas seleccionadas, información 100% persistente en PostgreSQL 18 real.

---

## 1. Tabla de Evaluación por Fases y Criterios Medibles

### FASE A: Arranque y Seguridad

| Criterio | Valor Objetivo | Resultado Obtenido | Evidencia | Estado |
| :--- | :---: | :---: | :--- | :---: |
| 1. Errores TypeScript (`lint`) | 0 errores | **0 errores** | `npm run lint` (`tsc --noEmit`) con código de salida `0` | **APROBADO** |
| 2. Vulnerabilidades IDOR abiertas | 0 conocidas | **0 abiertas** | `npx tsx server/tests/real/test_pg_idor_negativo.ts` código `0` | **APROBADO** |
| 3. Tablas objetivo con RLS activo | 64 tablas | **64 tablas** | 64 tablas verificadas con `ENABLE`, `FORCE` y política en `test_pg_rls_planillas.ts` | **APROBADO** |
| 4. Claves foráneas compuestas | 75 relaciones | **75 relaciones** | Verificadas con pruebas negativas CASCADE/RESTRICT en `test_pg_seguridad.ts` | **APROBADO** |
| 5. Endpoints con autenticación y autorización | 100% | **100%** | Todos los routers protegidos con `requireAuth`, `requireEmpresaMembership` y `requireRol` | **APROBADO** |
| 6. Accesos no autorizados en pruebas negativas | 0 permitidos | **0 permitidos** | Intentos de acceso cruzado entre empresas rechazados con 401/403/404 | **APROBADO** |
| 7. Arranque reproducible con PostgreSQL real | Sin errores | **Sin errores** | `npm run test:infra` (cold boot, migración limpia, migraciones UUID, parada segura) | **APROBADO** |

**Dictamen Fase A: APROBADA AL 100% CON CÓDIGO DE SALIDA 0.**

---

### FASE B: Persistencia y Motor Contable

| Criterio | Valor Objetivo | Resultado Obtenido | Evidencia | Estado |
| :--- | :---: | :---: | :--- | :---: |
| 1. Servicios dependientes exclusivamente de `*_MEMORIA` | 0 servicios | **0 servicios** | 18 servicios migrados a persistencia relacional con guardas en `persistencia.ts` | **APROBADO** |
| 2. Operaciones de escritura confirmadas en PostgreSQL | 100% | **100%** | Inserciones y actualizaciones relacionales verificadas con asserts en `test_pg_matriz_contable.ts` | **APROBADO** |
| 3. Datos de prueba conservados tras reinicio de servidor | 100% | **100%** | Verificación de persistencia tras desconexión completa (`pool.end()`) y reconexión en frío | **APROBADO** |
| 4. Errores `SQLSTATE 23514` en creación de empresas | 0 errores | **0 errores** | Catálogo completo de subdiarios 00..11 creado sin fallos en PostgreSQL real | **APROBADO** |
| 5. Duplicación de correlativos ante operaciones concurrentes | 0 duplicaciones | **0 duplicaciones** | 50 inserciones concurrentes en Subdiario 01 con 50 correlativos únicos | **APROBADO** |
| 6. Asientos generados con Debe = Haber | 100% | **100%** | Cuadre exacto al céntimo en 69/69 escenarios evaluados | **APROBADO** |
| 7. Subdiarios consistentes entre catálogo, asientos y reportes | 100% | **100%** | Catálogo oficial 00..11 y 15 tipos contables validados en esquemas 18 y 19 | **APROBADO** |
| 8. Escenarios contables implementados y validados | 69/69 | **69/69** | 69/69 escenarios de `MATRIZ_COMPLETITUD_ASIENTOS.md` validados en PostgreSQL real | **APROBADO** |

**Dictamen Fase B: APROBADA AL 100% CON CÓDIGO DE SALIDA 0.**

---

### FASE B2: Respaldos y Recuperación

| Criterio | Valor Objetivo | Resultado Obtenido | Evidencia | Estado |
| :--- | :---: | :---: | :--- | :---: |
| 1. Tablas y archivos incluidos en política de respaldo | 100% | Pendiente | Registro declarativo único `REGISTRO_DATOS_EMPRESA` y `archivosEmpresa.ts` | **PENDIENTE** |
| 2. Pérdidas o alteraciones de registros en restauración | 0 pérdidas | Pendiente | Prueba de ida y vuelta completa en PostgreSQL real | **PENDIENTE** |
| 3. Verificaciones de integridad SHA-256 | 100% | Pendiente | Validación de hash por tabla y archivo en manifest | **PENDIENTE** |
| 4. Archivos alterados intencionalmente rechazados | 100% rechazados | Pendiente | Prueba de inyección de corrupción en ZIP de respaldo | **PENDIENTE** |
| 5. Modificaciones a otras empresas durante restauración | 0 modificaciones | Pendiente | Aislamiento estricto de empresa destino en restauración | **PENDIENTE** |
| 6. Pruebas obligatorias de respaldo aprobadas | 4/4 pruebas | Pendiente | Completa, alterada, aislamiento y persistencia tras reinicio | **PENDIENTE** |
| 7. Objetivos RPO y RTO medidos | RPO ≤ 24h, RTO ≤ 60m | Pendiente | Medición en prueba de carga sobre PostgreSQL real | **PENDIENTE** |

---

### FASE C: Interfaz, Funcionalidad y Reportes

| Criterio | Valor Objetivo | Resultado Obtenido | Evidencia | Estado |
| :--- | :---: | :---: | :--- | :---: |
| 1. Endpoints inexistentes invocados por vistas | 0 endpoints | Pendiente | Auditoría de las 7 vistas huérfanas conectadas | **PENDIENTE** |
| 2. Confirmaciones falsas de operaciones exitosas | 0 falsas | Pendiente | Eliminación de `toast.success` sin respuesta 200 de API | **PENDIENTE** |
| 3. Formularios operativos con flujo UI → API → PG | 100% | Pendiente | Pruebas de integración frontend-backend | **PENDIENTE** |
| 4. Datos hardcoded o mocks presentados como reales | 0 datos | Pendiente | Inspección de vistas y reemplazo por datos de API | **PENDIENTE** |
| 5. Módulos que recuperan registros tras reinicio | 100% | Pendiente | Prueba de persistencia extremo a extremo | **PENDIENTE** |
| 6. Diferencia en saldos de reportes contables | S/ 0.00 | Pendiente | Conciliación entre Diario, Mayor, Balance y EEFF | **PENDIENTE** |
| 7. Cuentas consultadas desde catálogo PCGE dinámico | 100% | Pendiente | Conexión de selectores a API de plan de cuentas | **PENDIENTE** |
| 8. Errores críticos de navegación en flujos de aceptación | 0 errores | Pendiente | Recorrido de los 25 módulos operativos | **PENDIENTE** |
| 9. Funciones no implementadas deshabilitadas | 100% señalizadas | Pendiente | Badges claros de "En desarrollo" o retiro del menú | **PENDIENTE** |

---

### FASE D: Operación Multiusuario y Despliegue

| Criterio | Valor Objetivo | Resultado Obtenido | Evidencia | Estado |
| :--- | :---: | :---: | :--- | :---: |
| 1. Usuarios simultáneos en prueba continua | 2 usuarios / 60 min | Pendiente | Prueba de carga concurrente | **PENDIENTE** |
| 2. Operaciones de prueba por usuario | ≥ 20 operaciones | Pendiente | Transacciones mixtas (compras, ventas, asientos, cobros) | **PENDIENTE** |
| 3. Registros duplicados o perdidos por concurrencia | 0 registros | Pendiente | Auditoría de integridad post-prueba | **PENDIENTE** |
| 4. Visibilidad de cambios entre usuarios | ≤ 5 segundos | Pendiente | Medición de sincronización / refresco automático | **PENDIENTE** |
| 5. Tiempo de respuesta p95 en LAN | ≤ 2 segundos | Pendiente | Telemetría de tiempos de respuesta | **PENDIENTE** |
| 6. Costo mensual de infraestructura | US$ 0.00 | Cumplido | Arquitectura local centralizada LAN / P2P con PostgreSQL local | **APROBADO** |
| 7. Verificación de sincronización de datos | 100% consistente | Pendiente | Checksums idénticos entre estaciones | **PENDIENTE** |
| 8. Guía de instalación y contingencias | 100% documentada | Pendiente | Documento `PLAN_DESPLIEGUE_INTERNO_USD0.md` | **PENDIENTE** |
| 9. Recuperación documentada de fallos de red | Procedimiento claro | Pendiente | Pruebas de desconexión y reconexión LAN | **PENDIENTE** |

---

### FASE E: Cierre, Calidad y Certificación

| Criterio | Valor Objetivo | Resultado Obtenido | Evidencia | Estado |
| :--- | :---: | :---: | :--- | :---: |
| 1. Aprobación de `npm run verify` unificado | 100% aprobado | Pendiente | Ejecución de todo el pipeline con código `0` | **PENDIENTE** |
| 2. Fallo de `npm run verify` ante ausencia de PG real | Falla garantizada | Pendiente | Verificación de parada ante mock o falta de PostgreSQL | **PENDIENTE** |
| 3. Menciones de marcas comerciales competidoras | 0 menciones | Pendiente | Auditoría regex sobre todo el repositorio | **PENDIENTE** |
| 4. Conformidad con normas contables-tributarias 2026 | 100% conforme | Pendiente | Validación contra checklist normativo | **PENDIENTE** |
| 5. Documentos del proyecto actualizados | 100% coherentes | En proceso | Plan, Registro, Matriz, Despliegue y Certificación | **EN PROCESO** |
| 6. Auditoría de dependencias y vulnerabilidades | 0 críticas / altas | Pendiente | `npm audit` | **PENDIENTE** |
| 7. Respaldos iniciales de prueba realizados | 100% funcionales | Pendiente | Backup de arranque del piloto | **PENDIENTE** |
| 8. Criterios de parada de emergencia definidos | 100% claros | Pendiente | Umbrales de descarte del piloto | **PENDIENTE** |
| 9. Firma y dictamen final de certificación | Aprobado para piloto | Pendiente | Dictamen final en este informe | **PENDIENTE** |
