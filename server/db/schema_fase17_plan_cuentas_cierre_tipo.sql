-- =========================================================================
-- FASE 17: Ajuste de restricciones de tipo_cuenta y nivel en plan_cuentas
-- =========================================================================

-- 1. Permitir 'CIERRE' y 'GESTION' en tipo_cuenta de plan_cuentas
ALTER TABLE public.plan_cuentas DROP CONSTRAINT IF EXISTS plan_cuentas_tipo_cuenta_check;
ALTER TABLE public.plan_cuentas ADD CONSTRAINT plan_cuentas_tipo_cuenta_check
    CHECK (tipo_cuenta IN ('ACTIVO', 'PASIVO', 'PATRIMONIO', 'GASTO', 'INGRESO', 'GESTION', 'FUNCION', 'ORDEN', 'CIERRE'));

-- 2. Permitir niveles hasta 8 en plan_cuentas (alineado con pcge_base)
ALTER TABLE public.plan_cuentas DROP CONSTRAINT IF EXISTS plan_cuentas_nivel_check;
ALTER TABLE public.plan_cuentas ADD CONSTRAINT plan_cuentas_nivel_check
    CHECK (nivel BETWEEN 1 AND 8);
