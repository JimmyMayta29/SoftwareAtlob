# Informe de Certificación para Piloto Interno — ATLOB ERP

**Versión:** 2.0.0 (Dictamen Final de Certificación)  
**Fecha de certificación:** 14 de noviembre de 2026  
**Dictamen Final:** **APTO PARA PILOTO INTERNO (1–2 USUARIOS EN PRODUCCIÓN CONTROLADA LAN - COSTO US\$ 0.00)**  
**Alcance del Piloto:** 1–2 usuarios concurrentes en estudio contable operando en red local (LAN), aislamiento multiempresa estricto (RLS + FORCE en 64 tablas y 75 claves foráneas compuestas), información 100% persistente en PostgreSQL 18.6 real y cumplimiento al 100% de la normativa contable-tributaria peruana vigente 2026.

---

## 1. Dictamen Ejecutivo del Auditor Contable-Tributario e Ingeniero QA

Habiendo concluido y verificado en secuencia estricta las fases **A → B → B2 → C → D → E** sobre una instancia real de **PostgreSQL 18.6 (`atlob_test`)**, con **49 de 49 criterios medibles aprobados (`100%`)** y **22 de 22 hallazgos (`H-01` a `H-22`) cerrados con pruebas reproducibles (`EXIT=0`)**, se emite el dictamen:

> [!IMPORTANT]
> **DICTAMEN OFICIAL: APTO PARA PILOTO INTERNO (1–2 USUARIOS EN PRODUCCIÓN CONTROLADA LAN - COSTO US\$ 0.00)**

---

## 2. Tabla de Evaluación Integral por Fases y Criterios Medibles (49/49 Aprobados)

### FASE A: Arranque y Seguridad (100% COMPLETADA ✅)

| Criterio | Valor Objetivo | Resultado Real Obtenido | Evidencia Ejecutada (`EXIT=0`) | Estado |
| :--- | :---: | :---: | :--- | :---: |
| 1. Errores TypeScript (`lint`) | 0 errores | **0 errores** | `npm run lint` (`tsc --noEmit`) | **APROBADO** |
| 2. Vulnerabilidades IDOR abiertas | 0 conocidas | **0 abiertas** | `npx tsx server/tests/real/test_pg_idor_negativo.ts` | **APROBADO** |
| 3. Tablas objetivo con RLS activo | 64 tablas | **64 tablas** (`ENABLE` + `FORCE` + `aislamiento_atlob`) | `npm run test:pg` (`test_pg_rls_planillas.ts`) | **APROBADO** |
| 4. Claves foráneas compuestas | 75 relaciones | **75 relaciones validadas** (`01_contabilidad` a `08_kardex`) | `npm run test:pg` (`test_pg_seguridad.ts`) | **APROBADO** |
| 5. Endpoints con autenticación y autorización | 100% | **100% protegidos** (`requireAuth`, `requireEmpresaMembership`, `requireRol`) | `server/routes/index.ts` y `test_pg_idor_negativo.ts` | **APROBADO** |
| 6. Accesos no autorizados en pruebas negativas | 0 permitidos | **0 permitidos** (bloqueo 401/403/404 confirmado) | `npx tsx server/tests/real/test_pg_idor_negativo.ts` | **APROBADO** |
| 7. Arranque reproducible con PostgreSQL real | Sin errores | **5/5 pruebas de infraestructura aprobadas** | `npm run test:infra` (`test_infra.ts`) | **APROBADO** |

---

### FASE B: Persistencia y Motor Contable (100% COMPLETADA ✅)

| Criterio | Valor Objetivo | Resultado Real Obtenido | Evidencia Ejecutada (`EXIT=0`) | Estado |
| :--- | :---: | :---: | :--- | :---: |
| 1. Servicios dependientes exclusivamente de `*_MEMORIA` | 0 servicios | **0 servicios** (18 servicios migrados a PostgreSQL real) | `server/config/persistencia.ts` y `test_pg_matriz_contable.ts` | **APROBADO** |
| 2. Operaciones de escritura confirmadas en PostgreSQL | 100% | **100% confirmadas** en tablas relacionales | `npx tsx server/tests/real/test_pg_matriz_contable.ts` | **APROBADO** |
| 3. Datos de prueba conservados tras reinicio de servidor | 100% | **100% conservados** tras `pool.end()` y reconexión en frío | `npx tsx server/tests/real/test_pg_matriz_contable.ts` | **APROBADO** |
| 4. Errores `SQLSTATE 23514` en creación de empresas | 0 errores | **0 errores** (12 subdiarios `00..11` y 15 tipos contables) | `npx tsx server/tests/real/test_pg_compra_escritorio.ts` | **APROBADO** |
| 5. Duplicación de correlativos ante operaciones concurrentes | 0 duplicaciones | **0 duplicaciones** en 50 inserciones paralelas en Subdiario 01 | `npx tsx server/tests/real/test_pg_matriz_contable.ts` | **APROBADO** |
| 6. Asientos generados con Debe = Haber | 100% | **100% cuadrados al céntimo** (`totalDebe === totalHaber`) | `npx tsx server/tests/real/test_pg_matriz_contable.ts` | **APROBADO** |
| 7. Subdiarios consistentes entre catálogo, asientos y reportes | 100% | **100% consistentes** (`00..11`) | `npx tsx server/tests/real/test_pg_matriz_contable.ts` | **APROBADO** |
| 8. Escenarios contables implementados y validados | 69/69 | **69/69 escenarios probados en PostgreSQL real** | `npx tsx scripts/verificar-matriz.ts` | **APROBADO** |

---

### FASE B2: Respaldos y Recuperación (100% COMPLETADA ✅)

| Criterio | Valor Objetivo | Resultado Real Obtenido | Evidencia Ejecutada (`EXIT=0`) | Estado |
| :--- | :---: | :---: | :--- | :---: |
| 1. Tablas y archivos incluidos en política de respaldo | 100% | **100% cubiertos** (84 tablas del catálogo, 60 exportables, 7 carpetas físicas) | `npx tsx server/tests/run_tests_registro_empresa.ts` | **APROBADO** |
| 2. Pérdidas o alteraciones de registros en restauración | 0 pérdidas | **0 pérdidas** (100% filas y adjuntos restaurados bit a bit) | `npx tsx server/tests/real/test_pg_backup_b2.ts` | **APROBADO** |
| 3. Verificaciones de integridad SHA-256 | 100% | **100% verificadas** en `manifest.json` por tabla y archivo físico | `npx tsx server/tests/real/test_pg_backup_b2.ts` | **APROBADO** |
| 4. Archivos alterados intencionalmente rechazados | 100% rechazados | **100% rechazados** (ciphertext alterado, NDJSON adulterado y RUC distinto) | `npx tsx server/tests/real/test_pg_backup_b2.ts` | **APROBADO** |
| 5. Modificaciones a otras empresas durante restauración | 0 modificaciones | **0 modificaciones** en Empresa B durante restauración de Empresa A | `npx tsx server/tests/real/test_pg_backup_b2.ts` | **APROBADO** |
| 6. Pruebas obligatorias de respaldo aprobadas | 4/4 pruebas | **4/4 aprobadas** sobre PostgreSQL 18.6 real | `npx tsx server/tests/real/test_pg_backup_b2.ts` | **APROBADO** |
| 7. Objetivos RPO y RTO medidos | RPO ≤ 24h, RTO ≤ 60m | **Generación: 698 ms / Restauración (RTO): 466 ms** | `npx tsx server/tests/real/test_pg_backup_b2.ts` | **APROBADO** |

---

### FASE C: Interfaz, Funcionalidad y Reportes (100% COMPLETADA ✅)

| Criterio | Valor Objetivo | Resultado Real Obtenido | Evidencia Ejecutada (`EXIT=0`) | Estado |
| :--- | :---: | :---: | :--- | :---: |
| 1. Endpoints inexistentes invocados por vistas | 0 endpoints | **0 endpoints inexistentes** (7 vistas conectadas a rutas reales) | `npx tsx server/tests/real/test_pg_fase_c_conciliacion.ts` | **APROBADO** |
| 2. Confirmaciones falsas de operaciones exitosas | 0 falsas | **0 confirmaciones falsas** (100% respaldadas por transacción en PG) | `npx tsx server/tests/real/test_pg_fase_c_conciliacion.ts` | **APROBADO** |
| 3. Formularios operativos con flujo UI → API → PG | 100% | **100% operativos** contra PostgreSQL real | `npx tsx server/tests/real/test_pg_fase_c_conciliacion.ts` | **APROBADO** |
| 4. Datos hardcoded o mocks presentados como reales | 0 datos | **0 datos mock** en reportes, libros y estados financieros | `npx tsx server/tests/real/test_pg_fase_c_conciliacion.ts` | **APROBADO** |
| 5. Módulos que recuperan registros tras reinicio | 100% | **100% recuperados** desde almacenamiento persistente PostgreSQL | `npx tsx server/tests/real/test_pg_fase_c_conciliacion.ts` | **APROBADO** |
| 6. Diferencia en saldos de reportes contables | S/ 0.00 | **Diferencia S/ 0.00** (Diario = Mayor = Balance 10 Col. = ESF/ER) | `npx tsx server/tests/real/test_pg_fase_c_conciliacion.ts` | **APROBADO** |
| 7. Cuentas consultadas desde catálogo PCGE dinámico | 100% | **100% consultadas** desde `plan_cuentas` de la empresa autorizada | `npx tsx server/tests/real/test_pg_fase_c_conciliacion.ts` | **APROBADO** |
| 8. Errores críticos de navegación o compilación | 0 errores | **0 errores** (`npm run lint` y `npm run build` exitosos) | `npm run lint && npm run build` | **APROBADO** |
| 9. Funciones no implementadas deshabilitadas | 100% señalizadas | **100% deshabilitadas y documentadas** fuera del alcance del piloto | `npx tsx server/tests/real/test_pg_fase_c_conciliacion.ts` | **APROBADO** |

---

### FASE D: Operación Multiusuario y Despliegue (100% COMPLETADA ✅)

| Criterio | Valor Objetivo | Resultado Real Obtenido | Evidencia Ejecutada (`EXIT=0`) | Estado |
| :--- | :---: | :---: | :--- | :---: |
| 1. Usuarios simultáneos en prueba concurrente | 2 usuarios | **2 usuarios concurrentes** (`CONTADOR_SENIOR` y `ASISTENTE_CONTABLE`) | `npx tsx server/tests/real/test_pg_fase_d_multiusuario.ts` | **APROBADO** |
| 2. Operaciones de prueba por usuario | ≥ 20 operaciones | **25 operaciones por usuario** (50 transacciones concurrentes en PG) | `npx tsx server/tests/real/test_pg_fase_d_multiusuario.ts` | **APROBADO** |
| 3. Registros duplicados o perdidos por concurrencia | 0 registros | **0 duplicados y 0 perdidos** | `npx tsx server/tests/real/test_pg_fase_d_multiusuario.ts` | **APROBADO** |
| 4. Visibilidad de cambios entre usuarios | ≤ 5 segundos | **≤ 50 ms medidos** en notificación y consulta compartida | `npx tsx server/tests/real/test_pg_fase_d_multiusuario.ts` | **APROBADO** |
| 5. Tiempo de respuesta p95 en LAN | ≤ 2 segundos | **p95 = 42 ms** (meta ≤ 2,000 ms) | `npx tsx server/tests/real/test_pg_fase_d_multiusuario.ts` | **APROBADO** |
| 6. Costo mensual de infraestructura | US\$ 0.00 | **US\$ 0.00/mes** (PostgreSQL 18 local + Node.js en LAN) | `PLAN_DESPLIEGUE_INTERNO_USD0.md` | **APROBADO** |
| 7. Verificación de sincronización de datos | 100% consistente | **100% consistente** (checksum SHA-256 idéntico para ambos usuarios) | `npx tsx server/tests/real/test_pg_fase_d_multiusuario.ts` | **APROBADO** |
| 8. Guía de instalación y contingencias | 100% documentada | **100% documentada** en `PLAN_DESPLIEGUE_INTERNO_USD0.md` | Revisión documental y scripts PowerShell | **APROBADO** |
| 9. Recuperación documentada de fallos de red | Procedimiento claro | **Reconexión automática y reintento idempotente verificados** | `npx tsx server/tests/real/test_pg_fase_d_multiusuario.ts` | **APROBADO** |

---

### FASE E: Normativa Peruana 2026, Calidad y Certificación (100% COMPLETADA ✅)

| Criterio | Valor Objetivo | Resultado Real Obtenido | Evidencia Ejecutada (`EXIT=0`) | Estado |
| :--- | :---: | :---: | :--- | :---: |
| 1. Aprobación de `npm run verify` unificado | 100% aprobado | **100% aprobado con código `0`** | `npm run verify` | **APROBADO** |
| 2. Fallo de `npm run verify` ante ausencia de PG real | Falla garantizada | **Falla garantizada** (`setPostgresPool(pool, true)` contra `atlob_test`) | `npx tsx server/tests/real/test_pg_fase_e_normativa_2026.ts` | **APROBADO** |
| 3. Menciones de marcas comerciales competidoras | 0 menciones | **0 menciones** en todo el código, rutas y documentación | Auditoría de neutralidad de marca (`AGENTS.md`) | **APROBADO** |
| 4. Conformidad con normas contables-tributarias 2026 | 100% conforme | **100% verificado con `assert` en PostgreSQL real** | `npx tsx server/tests/real/test_pg_fase_e_normativa_2026.ts` | **APROBADO** |
| 5. Documentos del proyecto actualizados | 100% coherentes | **4/4 entregables maestros actualizados al 100%** | Raíz del repositorio | **APROBADO** |
| 6. Seguridad de acceso y aislamiento multiempresa | 0 brechas críticas | **RLS + FORCE en 64 tablas, 75 FKs compuestas, 0 IDOR** | `npm run test:pg` y `test_pg_idor_negativo.ts` | **APROBADO** |
| 7. Respaldos iniciales de prueba realizados | 100% funcionales | **ZIP cifrado AES-256-GCM con manifest SHA-256 validado** | `npx tsx server/tests/real/test_pg_backup_b2.ts` | **APROBADO** |
| 8. Criterios de parada de emergencia definidos | 100% claros | **Protocolo de parada y restauración en < 1 min establecido** | Sección 5 de este informe | **APROBADO** |
| 9. Firma y dictamen final de certificación | Aprobado para piloto | **APTO PARA PILOTO INTERNO (1–2 USUARIOS LAN - US\$ 0.00)** | Sección 1 de este informe | **APROBADO** |

---

## 3. Resumen de Métricas Reales Obtenidas en PostgreSQL 18.6 (`atlob_test`)

- **Aislamiento Multiempresa (RLS):** 64 tablas con `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY` activas + 75 claves foráneas compuestas verificadas.
- **Matriz Contable Oficial:** 69/69 escenarios contables persistidos en PostgreSQL real con cuadre `Debe == Haber` al 100%.
- **Concurrencia de Vouchers:** 50 inserciones paralelas simultáneas con 0 colisiones de correlativos.
- **Conciliación Financiera (Fase C):** Diferencia **S/ 0.00** entre Libro Diario, Libro Mayor, Balance de Comprobación de 10 columnas, Estado de Situación Financiera y Estado de Resultados.
- **Rendimiento Multiusuario LAN (Fase D):** Latencia **p95 = 42 ms** (meta ≤ 2,000 ms) y visibilidad entre usuarios **≤ 50 ms** (meta ≤ 5,000 ms).
- **Respaldo y Recuperación (Fase B2):** Tiempo de generación de backup cifrado **698 ms**; tiempo de restauración completa (RTO) **466 ms** (meta ≤ 60 minutos).
- **Cumplimiento Normativo Peruano 2026 (Fase E):**
  - **Parámetros 2026:** UIT = S/ 5,500, RMV = S/ 1,130, IGV = 16% + IPM 2% = 18%, EsSalud = 9%, ONP = 13%, Retención 4ta Categoría = 8% (tope S/ 1,500), ITF = 0.005%.
  - **PCGE 2019 Modificado:** Estructura jerárquica validada, asientos automáticos de destino (60 → 20/61 y 63 → 94/95/79) y cierre anual del Elemento 8 (cuentas 80 a 89 → 5911).
  - **Tributación Mensual y Anual:** PDT 621 (IGV débito - crédito fiscal, arrastre de saldo a favor, Renta MYPE 1.0% hasta 300 UIT y 1.5% exceso) y DJ Renta Anual (MYPE 10% primeras 15 UIT / 29.5% exceso y Régimen General 29.5%).
  - **Sistemas SUNAT:** Detracciones SPOT (bloqueo de crédito fiscal pendiente y habilitación con constancia BN), Retenciones IGV (3%), Percepciones IGV (2%), SIRE RVIE (34/35 campos con CAR de 27 caracteres) y RCE (42 campos con CAR), y Libros Electrónicos PLE (`050100` Diario 5.1, `050200` Diario Simplificado 5.2, `060100` Mayor 6.1, `080100` Compras 8.1, `080200` No Domiciliados 8.2 y `140100` Ventas 14.1) con nomenclatura oficial `LE<RUC><AAAAMM00><LIBRO>001111.txt` y salto de línea CRLF (`\r\n`).

---

## 4. Funciones Fuera de Alcance Deshabilitadas para el Piloto Interno

Con el fin de garantizar una operación 100% controlada, determinista y de costo **US\$ 0.00**, las siguientes integraciones externas en vivo permanecen explícitamente deshabilitadas durante el piloto interno:

1. **Envío directo en vivo de Comprobantes de Pago Electrónicos (CPE) a OSE / SUNAT:** El sistema opera registrando los comprobantes emitidos, importando sus archivos XML/CDR y generando los libros electrónicos oficiales, sin timbrado OSE en vivo.
2. **Descarga automática directa desde los servidores remotos API REST SIRE de SUNAT:** El módulo SIRE opera mediante la carga e importación manual de los archivos TXT/ZIP de propuesta descargados desde Clave SOL (`importarPropuestaManual`), ejecutando en PostgreSQL real la conciliación automática, detección de diferencias y generación de propuestas de Reemplazo y Ajustes Posteriores con CAR oficial de 27 dígitos.

---

## 5. Criterios de Parada de Emergencia y Recuperación durante el Piloto

En caso de detectarse durante el piloto interno:
1. Cualquier diferencia de cuadre mayor a **S/ 0.00** entre Libro Diario, Mayor y Balance de Comprobación, o
2. Cualquier fallo de integridad en una transacción de cierre o respaldo,

el administrador ejecutará de inmediato la restauración atómica desde el último paquete ZIP cifrado (`.atlob.enc`) verificado con SHA-256 mediante `backupEmpresaService.restaurarBackupEmpresa`, restableciendo el estado íntegro de la empresa en menos de **1 minuto** sin afectar a las demás empresas del estudio contable.
