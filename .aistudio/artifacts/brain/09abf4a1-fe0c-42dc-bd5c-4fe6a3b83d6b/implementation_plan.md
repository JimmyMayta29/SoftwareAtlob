# Plan de Auditoría Técnica Integral: SISTEMA_ATLOB_ERP.md

Auditoría técnica y funcional profunda del sistema **Atlob Consultores ERP** desde la perspectiva de Arquitecto de Software y Auditor Técnico Senior, generando el documento maestro definitivo `SISTEMA_ATLOB_ERP.md` sin sesgos, documentando estrictamente la realidad del código fuente con evidencias comprobadas de archivos, funciones, tablas de PostgreSQL y contratos de API.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Criterios de Evaluación y Reglas de Honestidad:**
> - **Clasificación Estricta:** Todo módulo, submódulo, endpoint o reporte será clasificado con una única etiqueta rigurosa:
>   - `[COMPLETO]`: Funciona de punta a punta con datos reales y persistencia.
>   - `[PARCIAL]`: Funciona con limitaciones técnicas o de integración (se detallan expresamente).
>   - `[MAQUETA]`: Solo interfaz gráfica o mockups sin lógica conectada / datos en memoria efímeros.
>   - `[ROTO]`: Existe código pero falla en runtime, lanza excepciones no manejadas o produce resultados contables inexactos.
>   - `[PENDIENTE]`: Figuran en menús o interfaces pero no tienen implementación de fondo.
> - **Cero Suposiciones:** Si un componente o cálculo no puede ser verificado contra el código, se rotulará explícitamente como `NO VERIFICADO`.
> - **Trazabilidad Completa:** Toda afirmación incluirá la ruta del archivo (`src/...`, `server/...`), componente o función responsable (ej. `src/services/accountingEngine.ts → calcularLiquidacionPDT621`).

---

## 1. Estructura del Documento `SISTEMA_ATLOB_ERP.md`

El documento se generará en la raíz del repositorio (`/SISTEMA_ATLOB_ERP.md`) cubriendo con máximo rigor los 12 capítulos exigidos:

1. **Resumen Ejecutivo:** Propósito, stack tecnológico real (Node.js 22, Express 4, Vite 8, React 19, TypeScript 7, Tailwind CSS 4, PostgreSQL / `pg`, jsPDF), y matriz consolidada de módulos (Estado, % Avance real, Nivel de Riesgo).
2. **Arquitectura:** Árbol de directorios anotado, diagrama de flujo UI ↔ State ↔ Backend API ↔ PostgreSQL, persistencia por empresa vs fallback en memoria (`IN_MEMORY_FALLBACK`), RBAC (`ADMINISTRADOR`, `CONTADOR`, `ASISTENTE`, `AUDITOR`) y arquitectura de respaldos (ZIP / JSON / SQL).
3. **Modelo de Datos:** Tablas PostgreSQL en `server/db/schema*.sql`, claves primarias, foráneas, índices, restricciones contables (`asiento_cuadrado_chk`), validaciones que sí aplican vs las que NO se validan.
4. **Inventario Completo de Módulos (13 Módulos del Menú):**
   - Contabilidad (PCGE, Asientos F2, Libros Auxiliares, Compras, Ventas, Centro de Costos, Ajustes y Cierre).
   - Informes Contables (Balance de Comprobación, Balance General, Estado de Resultados, Análisis de Cuenta, Flujo de Efectivo).
   - Reportes SUNAT (Libros, PDB, DAOT, PDT 621/601/617, PLE 5.2, TXT Valida Compras).
   - SIRE SUNAT + (Propuestas Compras/Ventas, Conciliador SIRE vs Registro, TXT Ajustes).
   - Facturación (Emisión CPE F3, Notas C/D, GRE, Bajas, XML UBL 2.1, CDR).
   - Créditos y Cobranza (CxC, CxP, Letras y Pagarés, Vencimientos SUNAT).
   - Tesorería (Conciliación Bancaria, Movimientos, Flujo de Caja Proyectado).
   - Caja Chica (Apertura/Cierre, Gastos Menores, Reposición).
   - Gestión de Negocio (Cartera de Clientes, Dashboard Gerencial, Control de Calidad, Biblioteca de Documentos).
   - Empresa (Nueva Empresa, Buscar Empresa Ctrl+K, Configuración, Importación CSV, Períodos).
   - Tablas (Clientes/Proveedores, Tipos de Comprobante, Tipo de Cambio SBS, Bancos, Unidades).
   - Utilitarios (Respaldos SQL/ZIP, Restaurar Demo, Usuarios y Roles, Auditoría, Formato de Reporte).
   - Ayuda (Acerca de Atlob Consultores ERP, Créditos Jimmy Mayta).
5. **Cumplimiento Tributario Peruano:** Cobertura real del PCGE 2019/2026, validación SIRE R.S. 112-2021/SUNAT, estructura técnica PLE 5.2, Facturación electrónica UBL 2.1 / SOAP vs emulada, fórmulas de liquidación PDT 621 y cronograma oficial de vencimientos por último dígito de RUC.
6. **Lista de Errores y Bugs Conocidos:** Matriz completa con ID, Severidad, Archivo/Línea, Causa Raíz y Solución Técnica Propuesta.
7. **Pendientes y Deuda Técnica:** Matriz de backlog priorizado P0 / P1 / P2 con estimación de esfuerzo en tallas S / M / L.
8. **Seguridad y Datos Sensibles:** Almacenamiento de Clave SOL, tokens JWT, hashing bcrypt, secretos MFA TOTP (RFC 6238), exclusión de contraseñas en respaldos.
9. **Pruebas y Verificación:** Estado de la suite de pruebas (`server/tests/`), cobertura real `c8`, casos de prueba indispensables y guía de ejecución desde cero.
10. **UI/UX de Escritorio:** Análisis de la barra superior clásica propia de Atlob Consultores, eventos de teclado (`Ctrl+K`, `F2`, `F3`, `Esc`), modales y viabilidad de empaquetado para Electron o Tauri.
11. **Fragmentos de Código Clave:** Extracción literal de fragmentos fundamentales del repositorio (datos de menú, tipos de asiento contable, validación de partida doble, generador de PLE TXT y motor de conciliación SIRE).
12. **Recomendaciones Finales:** Los 10 cambios arquitectónicos de mayor impacto ordenados por prioridad y dictamen de qué módulos conservar vs cuáles reescribir.

---

## 2. Metodología de Auditoría

1. **Inspección de Esquema y Backend:** Auditoría directa de `server/db/schema*.sql`, `server/services/`, `server/routes/` y `server/storage/registroDatosEmpresa.ts`.
2. **Inspección de Servicios Contables:** Análisis de `accountingEngine.ts`, `sireTxtGenerator.ts`, `pdfExportService.ts` y `formatoEstandarEngine.ts`.
3. **Inspección de Interfaz y Vistas:** Comparación del catálogo `src/types/menu.ts` contra los componentes en `src/components/views/` y `src/components/modals/`.
4. **Pruebas Automatizadas:** Ejecución y análisis de los scripts en `server/tests/` para constatar qué pruebas pasan y cuáles fallan o simulan entornos.
5. **Generación del Archivo:** Escritura de `SISTEMA_ATLOB_ERP.md` en un único archivo markdown completo y exhaustivo.
