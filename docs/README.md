# Índice Maestro de Documentación — ATLOB ERP

Este índice centraliza la documentación viva, los lineamientos de ingeniería, el archivo histórico y el inventario en cuarentena del repositorio **ATLOB ERP**.

> **Nota sobre evidencia normativa:** Las copias textuales de dispositivos legales consultados para [`NORMAS_VERIFICADAS.md`](NORMAS_VERIFICADAS.md) residen en `docs/evidencia/normas/` (14 archivos: 12 respaldos verificados y 2 descargados con error de origen documentado en [`NORMAS_VERIFICADAS.md`](NORMAS_VERIFICADAS.md)).

---

## 1. Documentación Activa del Sistema y Operación

| Documento | Propósito | Vigencia | Última verificación |
| :--- | :--- | :--- | :--- |
| [`SISTEMA_ATLOB_ERP.md`](../SISTEMA_ATLOB_ERP.md) | Informe integral del sistema: arquitectura, métricas reales, módulos, matriz de persistencia, normativa y brechas abiertas. | Vigente | 2026-11-11 |
| [`AGENTS.md`](../AGENTS.md) | Reglas operativas del proyecto, arquitectura B elegida, orden de fases, política de marca neutral y respaldo. | Vigente | 2026-11-04 |
| [`MATRIZ_COMPLETITUD_ASIENTOS.md`](MATRIZ_COMPLETITUD_ASIENTOS.md) | Matriz de escenarios contables, estados (`PROBADO` / `PARCIAL` / `NO IMPLEMENTADO`) y anclas validadas por la Suite 36. | Vigente | 2026-11-09 |
| [`NORMAS_VERIFICADAS.md`](NORMAS_VERIFICADAS.md) | Registro literal de normas tributarias y laborales contrastadas contra fuentes oficiales y respaldos en `docs/evidencia/normas/`. | Vigente | 2026-11-09 |
| [`CATALOGO_CUENTAS_ASIENTOS.md`](CATALOGO_CUENTAS_ASIENTOS.md) | Catálogo técnico de cuentas PCGE 2026 aplicadas a subdiarios y asientos automáticos. | Vigente | 2026-11-09 |
| [`CATALOGO_CUENTAS_PARA_CONTADOR.md`](CATALOGO_CUENTAS_PARA_CONTADOR.md) | Guía funcional de cuentas y criterios contables orientada a revisión de contador. | Vigente | 2026-11-09 |
| [`MATRIZ_TRAZABILIDAD.csv`](MATRIZ_TRAZABILIDAD.csv) | Trazabilidad tabular entre requisitos, módulos, pruebas y referencias documentales. | Vigente | 2026-11-11 |
| [`INICIO_ESCRITORIO.md`](INICIO_ESCRITORIO.md) | Guía de los dos caminos reales de ejecución en Windows: instalador Electron Setup/Portable x64 y lanzador desde código fuente (`Iniciar-Escritorio.bat`). | Vigente | 2026-11-11 |
| [`BACKUP_BASE_DATOS.md`](BACKUP_BASE_DATOS.md) | Manual operativo y alcance técnico del respaldo físico (`pg_dump`/WAL) y del respaldo lógico por empresa de la aplicación. | Vigente | 2026-11-11 |
| [`.env.example`](../.env.example) | Plantilla de variables de entorno alineada con `server/config/env.ts` (secretos vacíos para completar por entorno). | Vigente | 2026-11-11 |

---

## 2. Ingeniería y Arquitectura (`docs/engineering/`)

| Documento | Propósito | Vigencia | Última verificación |
| :--- | :--- | :--- | :--- |
| [`engineering/INDEX.md`](engineering/INDEX.md) | Índice y orden de lectura obligatorio de los documentos de arquitectura e ingeniería. | Vigente | 2026-11-07 |
| [`engineering/PLAN_IMPLEMENTACION.md`](engineering/PLAN_IMPLEMENTACION.md) | Plan maestro por fases (`A → B → B2 → C → D → E`) y criterios de aceptación en PostgreSQL real. | Vigente | 2026-10-25 |
| [`engineering/SEGURIDAD.md`](engineering/SEGURIDAD.md) | Controles de autenticación, secretos, cifrado, aislamiento por empresa (RLS y FKs compuestas) y brechas abiertas. | Vigente | 2026-11-11 |
| [`engineering/ESCRITORIO_WINDOWS.md`](engineering/ESCRITORIO_WINDOWS.md) | Especificación técnica del empaquetado Electron en Windows, DPAPI, puertos, `asarUnpack` y firma de compilación. | Vigente | 2026-11-11 |
| [`engineering/CARGA_PCGE_STAGING.md`](engineering/CARGA_PCGE_STAGING.md) | Procedimiento de carga del Plan Contable General Empresarial (PCGE) en entornos de staging/pruebas. | Vigente | 2026-11-07 |
| [`engineering/LICENCIAS.md`](engineering/LICENCIAS.md) | Modelo y control de licenciamiento del estudio contable en la plataforma. | Vigente | 2026-11-07 |
| [`engineering/MARCA.md`](engineering/MARCA.md) | Lineamientos de identidad ATLOB ERP y hashes SHA-256 verificables de los activos gráficos e instalador. | Vigente | 2026-11-08 |
| [`engineering/REDONDEO_USD.md`](engineering/REDONDEO_USD.md) | Criterios de redondeo y precisión numérica en operaciones expresadas en dólares (USD). | Vigente | 2026-11-08 |

---

## 3. Archivo Histórico (`docs/_archivo/`)

Los documentos de esta carpeta se conservan solo como referencia cronológica de auditorías y etapas previas; no describen necesariamente el estado actual del código ni reemplazan a la documentación vigente.

| Documento | Propósito | Vigencia | Última verificación |
| :--- | :--- | :--- | :--- |
| [`_archivo/README.md`](_archivo/README.md) | Índice y criterio de conservación del archivo histórico de documentación. | Histórico / Referencia | 2026-11-11 |
| [`_archivo/MEMORIA_TECNICA_V2.md`](_archivo/MEMORIA_TECNICA_V2.md) | Memoria técnica anterior a los bloques A–F, PCGE 2026 y Desktop Electron. | Histórico (obsoleto) | 2026-11-11 |
| [`_archivo/RESULTADOS_VERIFICACION.txt`](_archivo/RESULTADOS_VERIFICACION.txt) | Captura histórica de verificación automatizada (`2026-10-04`, 12 suites previas). | Histórico (obsoleto) | 2026-11-11 |
| [`_archivo/INVENTARIO_LIMPIEZA.md`](_archivo/INVENTARIO_LIMPIEZA.md) | Inventario técnico levantado en Fase 1 para clasificación de archivos huérfanos y deriva documental. | Registro de auditoría | 2026-11-11 |
| [`_archivo/MOVIMIENTOS_FASE2.md`](_archivo/MOVIMIENTOS_FASE2.md) | Bitácora reversible de movimientos realizados durante la limpieza (Fase 2 y cierre de Fase 3). | Registro de auditoría | 2026-11-11 |
| [`_archivo/MEDICIONES_FASE3.md`](_archivo/MEDICIONES_FASE3.md) | Mediciones directas reproducibles (comandos y conteos) que alimentan la documentación de Fase 3. | Registro de auditoría | 2026-11-11 |

---

## 4. Cuarentena (`_cuarentena/`)

> **Política de retención:** **Nada se elimina sin aprobación del dueño del proyecto.** Todo artefacto aislado en `_cuarentena/` permanece fuera de `tsconfig.json`, fuera del bundle de Vite (`vite.config.ts`) y fuera de los globs de pruebas automatizadas, documentado con su origen, fecha y motivo para facilitar revisión o reversión.

| Elemento | Propósito | Vigencia | Última verificación |
| :--- | :--- | :--- | :--- |
| [`_cuarentena/README.md`](../_cuarentena/README.md) | Índice general de cuarentena y reglas de aislamiento aplicadas en el repositorio. | En cuarentena (no enlazado) | 2026-11-11 |
| [`_cuarentena/referencias/README.md`](../_cuarentena/referencias/README.md) | Archivo HTML de referencia visual retirado de `public/assets/` para no incluirlo en `dist/`. | En cuarentena | 2026-11-11 |
| [`_cuarentena/vistas/README.md`](../_cuarentena/vistas/README.md) | Vistas React no enrutadas en `App.tsx` aisladas junto con sus dependencias exclusivas de cliente. | En cuarentena | 2026-11-11 |
| [`_cuarentena/servicios/README.md`](../_cuarentena/servicios/README.md) | Servicio de cliente huérfano (`sqlDatabaseService.ts`) retirado sin consumo activo. | En cuarentena | 2026-11-11 |
| [`_cuarentena/server/README.md`](../_cuarentena/server/README.md) | Artefacto de servidor huérfano (`server/middleware/auth.ts`) sin importadores activos ni montaje en rutas. | En cuarentena | 2026-11-11 |
