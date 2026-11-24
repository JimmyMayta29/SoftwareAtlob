-- ============================================================================
-- ROLLBACK MANUAL: Fase 23 — Conciliación Bancaria V2 Importación de Extractos
-- ============================================================================
-- UBICACIÓN: server/db/rollbacks/ (FUERA de MIGRATION_FILES; NO se ejecuta solo)
--
-- PRERREQUISITOS OBLIGATORIOS ANTES DE EJECUTAR:
-- 1. Apagar el feature flag CONCILIACION_V2 en toda empresa / entorno (false).
-- 2. Tomar y verificar un respaldo lógico previo con pg_dump.
-- 3. Tener presente que este rollback elimina índices, columnas aditivas de
--    extracto_lineas y las 4 tablas nuevas de importación/clasificación/perfiles
--    (los datos exclusivos de Fase 23 se perderán; los datos legacy permanecen).
--
-- PASOS OBLIGATORIOS EN EL CÓDIGO INMEDIATAMENTE DESPUÉS DEL ROLLBACK SQL:
-- 1. Retirar 'schema_fase23_conciliacion_v2_importacion.sql' de MIGRATION_FILES
--    en server/db/migration-files.ts.
-- 2. Revertir las entradas correspondientes en REGISTRO_DATOS_EMPRESA
--    (server/storage/registroDatosEmpresa.ts) y LISTA_BLANCA_POR_TABLA
--    (server/utils/seguridadDatos.ts).
-- ============================================================================

BEGIN;

-- 1. Eliminar índice único parcial e índices de apoyo creados en Fase 23.
DROP INDEX IF EXISTS public.idx_concil_reglas_clasif_emp_prio;
DROP INDEX IF EXISTS public.idx_concil_perfiles_emp_activo;
DROP INDEX IF EXISTS public.idx_extracto_linea_raw_emp_imp_fila;
DROP INDEX IF EXISTS public.idx_extracto_lineas_emp_import;
DROP INDEX IF EXISTS public.idx_extracto_import_emp_cta_est_fecha;
DROP INDEX IF EXISTS public.uq_extracto_lineas_emp_hash_activo;

-- 2. Eliminar FKs compuestas, CHECK y columnas aditivas de extracto_lineas.
ALTER TABLE public.extracto_lineas
    DROP CONSTRAINT IF EXISTS extracto_lineas_linea_raw_id_fkey,
    DROP CONSTRAINT IF EXISTS extracto_lineas_import_id_fkey,
    DROP CONSTRAINT IF EXISTS chk_extracto_lineas_tipo_clasificacion;

ALTER TABLE public.extracto_lineas
    DROP COLUMN IF EXISTS doc_extraido,
    DROP COLUMN IF EXISTS contraparte_extraida,
    DROP COLUMN IF EXISTS ruc_extraido,
    DROP COLUMN IF EXISTS tipo_clasificacion,
    DROP COLUMN IF EXISTS linea_raw_id,
    DROP COLUMN IF EXISTS import_id;

-- 3. Eliminar trigger, tabla inmutable y función asociada.
DROP TRIGGER IF EXISTS trg_extracto_linea_raw_inmutable ON public.extracto_linea_raw;
DROP TABLE IF EXISTS public.extracto_linea_raw;
DROP FUNCTION IF EXISTS public.fn_extracto_linea_raw_inmutable();

-- 4. Eliminar tablas restantes en orden inverso de dependencias.
DROP TABLE IF EXISTS public.extracto_import;
DROP TABLE IF EXISTS public.conciliacion_reglas_clasificacion;
DROP TABLE IF EXISTS public.conciliacion_perfiles_banco;

-- 5. Eliminar restricciones UNIQUE (empresa_id, id) propias agregadas en Fase 23
--    (no afecta *_empresa_id_id_key de fk_empresa_04_tesoreria.sql).
ALTER TABLE public.extractos_bancarios
    DROP CONSTRAINT IF EXISTS uq_extractos_bancarios_empresa_id_id;

ALTER TABLE public.cuentas_financieras
    DROP CONSTRAINT IF EXISTS uq_cuentas_financieras_empresa_id_id;

-- 6. Retirar registro de la migración en schema_migrations.
DELETE FROM public.schema_migrations
 WHERE nombre = 'schema_fase23_conciliacion_v2_importacion.sql';

COMMIT;
