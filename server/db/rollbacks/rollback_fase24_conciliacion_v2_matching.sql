-- ============================================================================
-- ROLLBACK MANUAL: Fase 24 — Conciliación Bancaria V2 Motor de Matching
-- ============================================================================
-- UBICACIÓN: server/db/rollbacks/ (FUERA de MIGRATION_FILES; NO se ejecuta solo)
--
-- PRERREQUISITOS OBLIGATORIOS ANTES DE EJECUTAR:
-- 1. Apagar el feature flag CONCILIACION_V2 en toda empresa / entorno (false).
-- 2. Tomar y verificar un respaldo lógico previo con pg_dump.
-- 3. Tener presente que este rollback elimina índices, columnas aditivas de
--    movimientos_tesoreria y conciliacion_config_empresa, y las 4 tablas nuevas
--    de matching, reglas aprendidas e historial de desconciliación.
--
-- PASOS OBLIGATORIOS EN EL CÓDIGO INMEDIATAMENTE DESPUÉS DEL ROLLBACK SQL:
-- 1. Retirar 'schema_fase24_conciliacion_v2_matching.sql' de MIGRATION_FILES
--    en server/db/migration-files.ts.
-- 2. Revertir las entradas correspondientes en REGISTRO_DATOS_EMPRESA
--    (server/storage/registroDatosEmpresa.ts), LISTA_BLANCA_POR_TABLA
--    (server/utils/seguridadDatos.ts) y diagnósticos/pruebas FK/B2.
-- ============================================================================

BEGIN;

-- 1. Eliminar índices de apoyo creados en Fase 24.
DROP INDEX IF EXISTS public.idx_concil_hist_desconcil_emp_fecha;
DROP INDEX IF EXISTS public.idx_concil_reglas_apr_emp_activo;
DROP INDEX IF EXISTS public.idx_concil_item_emp_asiento_det;
DROP INDEX IF EXISTS public.idx_concil_item_emp_mov_tes;
DROP INDEX IF EXISTS public.idx_concil_item_emp_ext_linea;
DROP INDEX IF EXISTS public.idx_concil_item_grupo;
DROP INDEX IF EXISTS public.idx_concil_grupo_emp_cta_per_est;
DROP INDEX IF EXISTS public.idx_mov_tesoreria_emp_cta_est_libro;

-- 2. Eliminar trigger inmutable, tabla historial y función asociada.
DROP TRIGGER IF EXISTS trg_conciliacion_hist_desconcil_inmutable ON public.conciliacion_historial_desconciliacion;
DROP TABLE IF EXISTS public.conciliacion_historial_desconciliacion;
DROP FUNCTION IF EXISTS public.fn_conciliacion_hist_desconcil_inmutable();

-- 3. Eliminar tablas restantes en orden inverso de dependencias.
DROP TABLE IF EXISTS public.conciliacion_item;
DROP TABLE IF EXISTS public.conciliacion_grupo;
DROP TABLE IF EXISTS public.conciliacion_reglas_aprendidas;

-- 4. Eliminar CHECK y columnas aditivas de conciliacion_config_empresa y movimientos_tesoreria.
ALTER TABLE public.conciliacion_config_empresa
    DROP CONSTRAINT IF EXISTS chk_conc_config_umbral_auto_match;

ALTER TABLE public.conciliacion_config_empresa
    DROP COLUMN IF EXISTS umbral_auto_match;

ALTER TABLE public.movimientos_tesoreria
    DROP CONSTRAINT IF EXISTS chk_movimientos_tesoreria_estado_conc_libro;

ALTER TABLE public.movimientos_tesoreria
    DROP COLUMN IF EXISTS estado_conciliacion_libro;

-- 5. Eliminar restricciones UNIQUE (empresa_id, id) propias agregadas por primera vez en Fase 24
--    (NO elimina uq_plan_cuentas_empresa_id_id de Fase 22 ni uq_cuentas_financieras_empresa_id_id de Fase 23,
--     ni *_empresa_id_id_key de fk_empresa_*).
ALTER TABLE public.conciliaciones_bancarias
    DROP CONSTRAINT IF EXISTS uq_conciliaciones_bancarias_empresa_id_id;

ALTER TABLE public.periodos
    DROP CONSTRAINT IF EXISTS uq_periodos_empresa_id_id;

ALTER TABLE public.anexos
    DROP CONSTRAINT IF EXISTS uq_anexos_empresa_id_id;

ALTER TABLE public.asiento_detalle
    DROP CONSTRAINT IF EXISTS uq_asiento_detalle_empresa_id_id;

ALTER TABLE public.asientos
    DROP CONSTRAINT IF EXISTS uq_asientos_empresa_id_id;

ALTER TABLE public.extracto_lineas
    DROP CONSTRAINT IF EXISTS uq_extracto_lineas_empresa_id_id;

ALTER TABLE public.movimientos_tesoreria
    DROP CONSTRAINT IF EXISTS uq_movimientos_tesoreria_empresa_id_id;

-- 6. Retirar registro de la migración en schema_migrations.
DELETE FROM public.schema_migrations
 WHERE nombre = 'schema_fase24_conciliacion_v2_matching.sql';

COMMIT;
