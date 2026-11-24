-- ============================================================================
-- ROLLBACK MANUAL: Fase 22 — Conciliación Bancaria V2 Base
-- ============================================================================
-- UBICACIÓN: server/db/rollbacks/ (FUERA de MIGRATION_FILES; NO se ejecuta solo)
--
-- PRERREQUISITOS OBLIGATORIOS ANTES DE EJECUTAR:
-- 1. Apagar el feature flag CONCILIACION_V2 en toda empresa / entorno (false).
-- 2. Tomar y verificar un respaldo lógico previo con pg_dump.
-- 3. Tener presente que este rollback elimina columnas aditivas y la tabla
--    conciliacion_config_empresa (los datos V2 exclusivos de esas columnas
--    se perderán; los datos legacy permanecen intactos).
--
-- PASOS OBLIGATORIOS EN EL CÓDIGO INMEDIATAMENTE DESPUÉS DEL ROLLBACK SQL:
-- 1. Retirar 'schema_fase22_conciliacion_v2_base.sql' de MIGRATION_FILES en
--    server/db/migration-files.ts (si no se retira, el próximo arranque volverá
--    a aplicar automáticamente la migración).
-- 2. Revertir las entradas correspondientes en REGISTRO_DATOS_EMPRESA
--    (server/storage/registroDatosEmpresa.ts) y LISTA_BLANCA_POR_TABLA
--    (server/utils/seguridadDatos.ts).
-- ============================================================================

BEGIN;

-- 1. Eliminar índices creados en Fase 22.
DROP INDEX IF EXISTS public.idx_cuentas_financieras_emp_cta_cont;
DROP INDEX IF EXISTS public.idx_extractos_bancarios_emp_cta_corte;
DROP INDEX IF EXISTS public.idx_mov_tesoreria_emp_cta_op_imp;
DROP INDEX IF EXISTS public.idx_mov_tesoreria_emp_cta_fecha_est;
DROP INDEX IF EXISTS public.idx_extracto_lineas_emp_estado_fecha;
DROP INDEX IF EXISTS public.idx_extracto_lineas_emp_ext_fecha;

-- 2. Eliminar tabla nueva de configuración V2 (y su política RLS asociada).
DROP TABLE IF EXISTS public.conciliacion_config_empresa;

-- 3. Eliminar columnas aditivas de conciliaciones_bancarias.
ALTER TABLE public.conciliaciones_bancarias
    DROP COLUMN IF EXISTS fecha_reapertura,
    DROP COLUMN IF EXISTS reabierta_por,
    DROP COLUMN IF EXISTS motivo_reapertura,
    DROP COLUMN IF EXISTS snapshot_json,
    DROP COLUMN IF EXISTS diferencia_integridad_mayor,
    DROP COLUMN IF EXISTS saldo_mayor_104x,
    DROP COLUMN IF EXISTS cargos_no_registrados,
    DROP COLUMN IF EXISTS abonos_no_registrados,
    DROP COLUMN IF EXISTS cheques_no_cobrados,
    DROP COLUMN IF EXISTS depositos_en_transito,
    DROP COLUMN IF EXISTS saldo_final_banco,
    DROP COLUMN IF EXISTS saldo_inicial_banco;

-- 4. Eliminar constraint y columnas aditivas de extracto_lineas.
ALTER TABLE public.extracto_lineas
    DROP CONSTRAINT IF EXISTS chk_extracto_lineas_estado_conciliacion;

ALTER TABLE public.extracto_lineas
    DROP COLUMN IF EXISTS hash_linea,
    DROP COLUMN IF EXISTS conciliado_en,
    DROP COLUMN IF EXISTS observacion_conciliacion,
    DROP COLUMN IF EXISTS diferencia_importe,
    DROP COLUMN IF EXISTS estado_conciliacion;

-- 5. Eliminar FK compuesta y columnas aditivas de cuentas_financieras.
ALTER TABLE public.cuentas_financieras
    DROP CONSTRAINT IF EXISTS cuentas_financieras_cuenta_contable_id_fkey;

ALTER TABLE public.cuentas_financieras
    DROP COLUMN IF EXISTS cuenta_contable_id,
    DROP COLUMN IF EXISTS alias,
    DROP COLUMN IF EXISTS cci;

-- 6. Eliminar restricción UNIQUE propia agregada en plan_cuentas
--    (no afecta plan_cuentas_empresa_id_id_key de fk_empresa_01_contabilidad.sql).
ALTER TABLE public.plan_cuentas
    DROP CONSTRAINT IF EXISTS uq_plan_cuentas_empresa_id_id;

-- 7. Retirar registro de la migración en schema_migrations (columna: nombre).
DELETE FROM public.schema_migrations
 WHERE nombre = 'schema_fase22_conciliacion_v2_base.sql';

COMMIT;
