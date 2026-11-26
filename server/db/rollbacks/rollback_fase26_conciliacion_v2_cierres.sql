-- ============================================================================
-- ROLLBACK MANUAL: Fase 26 — Conciliación Bancaria V2 Cierres e Índices
-- ============================================================================
-- UBICACIÓN: server/db/rollbacks/ (FUERA de MIGRATION_FILES; NO se ejecuta solo)
--
-- PRERREQUISITOS OBLIGATORIOS ANTES DE EJECUTAR:
-- 1. Apagar el feature flag CONCILIACION_V2 en toda empresa / entorno (false).
-- 2. Tomar y verificar un respaldo lógico previo con pg_dump.
-- 3. Tener presente que este rollback elimina los índices aditivos de Fase 4/5,
--    el trigger/función de inmutabilidad y la tabla conciliacion_cierres_historial
--    con todo su historial de cierres y reaperturas.
--
-- PASOS OBLIGATORIOS EN EL CÓDIGO INMEDIATAMENTE DESPUÉS DEL ROLLBACK SQL:
-- 1. Retirar 'schema_fase26_conciliacion_v2_cierres.sql' de MIGRATION_FILES
--    en server/db/migration-files.ts.
-- 2. Revertir las entradas correspondientes en REGISTRO_DATOS_EMPRESA
--    (server/storage/registroDatosEmpresa.ts), LISTA_BLANCA_POR_TABLA
--    (server/utils/seguridadDatos.ts) y diagnósticos/pruebas FK/B2.
-- ============================================================================

BEGIN;

-- 1. Eliminar índices aditivos creados en Fase 26.
DROP INDEX IF EXISTS public.uq_cheques_bancarios_emp_ext_activo;
DROP INDEX IF EXISTS public.uq_cheques_bancarios_emp_mov_activo;
DROP INDEX IF EXISTS public.idx_concil_grupo_emp_cta_est_created;
DROP INDEX IF EXISTS public.idx_concil_item_emp_grupo;
DROP INDEX IF EXISTS public.idx_concil_cierres_hist_emp_cta_per_seq;

-- 2. Eliminar trigger inmutable, tabla de historial y función asociada.
DROP TRIGGER IF EXISTS trg_conciliacion_cierres_hist_inmutable ON public.conciliacion_cierres_historial;
DROP TABLE IF EXISTS public.conciliacion_cierres_historial;
DROP FUNCTION IF EXISTS public.fn_conciliacion_cierres_hist_inmutable();

-- Nota: NO se eliminan uq_cuentas_financieras_empresa_id_id (Fase 23),
-- uq_conciliaciones_bancarias_empresa_id_id (Fase 24) ni uq_periodos_empresa_id_id (Fase 24).

-- 3. Retirar registro de la migración en schema_migrations.
DELETE FROM public.schema_migrations
 WHERE nombre = 'schema_fase26_conciliacion_v2_cierres.sql';

COMMIT;
