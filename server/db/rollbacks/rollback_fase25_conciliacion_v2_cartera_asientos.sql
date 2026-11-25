-- ============================================================================
-- ROLLBACK MANUAL: Fase 25 — Conciliación Bancaria V2 Cartera, Cheques y Plantillas
-- ============================================================================
-- UBICACIÓN: server/db/rollbacks/ (FUERA de MIGRATION_FILES; NO se ejecuta solo)
--
-- PRERREQUISITOS OBLIGATORIOS ANTES DE EJECUTAR:
-- 1. Apagar el feature flag CONCILIACION_V2 en toda empresa / entorno (false).
-- 2. Tomar y verificar un respaldo lógico previo con pg_dump.
-- 3. Tener presente que este rollback elimina la vista unificada de cartera,
--    índices, las 2 tablas nuevas (cheques_bancarios y
--    conciliacion_plantillas_asiento), las columnas movimiento_tesoreria_id
--    en aplicaciones_cobranza y aplicaciones_pago, y las restricciones
--    uq_*_empresa_id_id agregadas por primera vez en Fase 25.
--
-- PASOS OBLIGATORIOS EN EL CÓDIGO INMEDIATAMENTE DESPUÉS DEL ROLLBACK SQL:
-- 1. Retirar 'schema_fase25_conciliacion_v2_cartera_asientos.sql' de MIGRATION_FILES
--    en server/db/migration-files.ts.
-- 2. Revertir las entradas correspondientes en REGISTRO_DATOS_EMPRESA
--    (server/storage/registroDatosEmpresa.ts), LISTA_BLANCA_POR_TABLA
--    (server/utils/seguridadDatos.ts) y diagnósticos/pruebas FK/B2.
-- ============================================================================

BEGIN;

-- 1. Eliminar vista de solo lectura creada en Fase 25.
DROP VIEW IF EXISTS public.v_conciliacion_aplicaciones_cartera;

-- 2. Eliminar índices de apoyo creados en Fase 25.
DROP INDEX IF EXISTS public.idx_concil_plantillas_asiento_emp_tipo_act;
DROP INDEX IF EXISTS public.idx_cheques_bancarios_emp_fecha_giro;
DROP INDEX IF EXISTS public.idx_cheques_bancarios_emp_cta_est;
DROP INDEX IF EXISTS public.idx_aplicaciones_pago_emp_mov_tes;
DROP INDEX IF EXISTS public.idx_aplicaciones_cobranza_emp_mov_tes;

-- 3. Eliminar tablas nuevas creadas en Fase 25.
DROP TABLE IF EXISTS public.conciliacion_plantillas_asiento;
DROP TABLE IF EXISTS public.cheques_bancarios;

-- 4. Eliminar FKs compuestas y columnas movimiento_tesoreria_id en aplicaciones_pago y aplicaciones_cobranza.
ALTER TABLE public.aplicaciones_pago
    DROP CONSTRAINT IF EXISTS aplicaciones_pago_mov_tes_fkey;

ALTER TABLE public.aplicaciones_pago
    DROP COLUMN IF EXISTS movimiento_tesoreria_id;

ALTER TABLE public.aplicaciones_cobranza
    DROP CONSTRAINT IF EXISTS aplicaciones_cobranza_mov_tes_fkey;

ALTER TABLE public.aplicaciones_cobranza
    DROP COLUMN IF EXISTS movimiento_tesoreria_id;

-- 5. Eliminar restricciones UNIQUE (empresa_id, id) propias agregadas por primera vez en Fase 25
--    (NO elimina uq_cuentas_financieras_empresa_id_id de Fase 23, ni uq_movimientos_tesoreria_empresa_id_id,
--     uq_extracto_lineas_empresa_id_id o uq_anexos_empresa_id_id de Fase 24, ni *_empresa_id_id_key de fk_empresa_*).
ALTER TABLE public.detracciones
    DROP CONSTRAINT IF EXISTS uq_detracciones_empresa_id_id;

ALTER TABLE public.cuentas_por_pagar
    DROP CONSTRAINT IF EXISTS uq_cuentas_por_pagar_empresa_id_id;

ALTER TABLE public.cuentas_por_cobrar
    DROP CONSTRAINT IF EXISTS uq_cuentas_por_cobrar_empresa_id_id;

ALTER TABLE public.aplicaciones_pago
    DROP CONSTRAINT IF EXISTS uq_aplicaciones_pago_empresa_id_id;

ALTER TABLE public.aplicaciones_cobranza
    DROP CONSTRAINT IF EXISTS uq_aplicaciones_cobranza_empresa_id_id;

-- 6. Retirar registro de la migración en schema_migrations.
DELETE FROM public.schema_migrations
 WHERE nombre = 'schema_fase25_conciliacion_v2_cartera_asientos.sql';

COMMIT;
