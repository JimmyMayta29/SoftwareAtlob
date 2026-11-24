-- ============================================================================
-- FASE 22 — Conciliación Bancaria V2: Base Aditiva Segura, Snapshot y Configuración
-- ============================================================================
-- Notas de diseño y compatibilidad:
-- 1. Migración 100% aditiva e idempotente. No realiza DROP, RENAME ni alteración
--    de tipos en tablas o columnas existentes.
-- 2. En Fase 1, los estados del lado libro ('PENDIENTE_BANCO', 'CHEQUE_NO_COBRADO')
--    se calculan dinámicamente al consultar conciliación y NO se persisten en
--    movimientos_tesoreria hasta la Fase 3.
-- 3. Las columnas derivadas añadidas a conciliaciones_bancarias constituyen un
--    "snapshot al cierre" para auditoría histórica; no reemplazan ni son fuente
--    de verdad operativa frente al extracto y movimientos_tesoreria.
-- 4. usuarios_estudio es una tabla de control global sin columna empresa_id
--    (RLS deshabilitado); por ello reabierta_por y updated_by usan FK simple a
--    public.usuarios_estudio(id). En cambio, cuentas_financieras.cuenta_contable_id
--    usa FK compuesta (empresa_id, cuenta_contable_id) -> plan_cuentas(empresa_id, id)
--    siguiendo el patrón de fk_empresa_04_tesoreria.sql.
-- 5. Los códigos PCGE por defecto de conciliacion_config_empresa ('6412', '6391',
--    '67311', '7793') fueron verificados contra public.pcge_base; el servicio V2
--    validará además su existencia en el plan_cuentas de la empresa antes de
--    generar asientos.
-- ============================================================================

-- 1. Restricción UNIQUE compuesta aditiva en plan_cuentas (nombre propio para evitar
--    colisión con plan_cuentas_empresa_id_id_key usado por fk_empresa_01_contabilidad.sql).
DO $uq_plan_cuentas$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.plan_cuentas'::regclass
           AND conname = 'uq_plan_cuentas_empresa_id_id'
    ) THEN
        ALTER TABLE public.plan_cuentas
            ADD CONSTRAINT uq_plan_cuentas_empresa_id_id UNIQUE (empresa_id, id);
    END IF;
END;
$uq_plan_cuentas$;

-- 2. Columnas aditivas en cuentas_financieras + FK compuesta por empresa hacia plan_cuentas.
ALTER TABLE public.cuentas_financieras
    ADD COLUMN IF NOT EXISTS cci VARCHAR(30),
    ADD COLUMN IF NOT EXISTS alias VARCHAR(120),
    ADD COLUMN IF NOT EXISTS cuenta_contable_id UUID;

DO $fk_cta_contable$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.cuentas_financieras'::regclass
           AND conname = 'cuentas_financieras_cuenta_contable_id_fkey'
    ) THEN
        ALTER TABLE public.cuentas_financieras
            ADD CONSTRAINT cuentas_financieras_cuenta_contable_id_fkey
            FOREIGN KEY (empresa_id, cuenta_contable_id)
            REFERENCES public.plan_cuentas (empresa_id, id)
            ON DELETE SET NULL (cuenta_contable_id);
    END IF;
END;
$fk_cta_contable$;

COMMENT ON COLUMN public.cuentas_financieras.cci IS 'Código de Cuenta Interbancaria (20 dígitos en Perú).';
COMMENT ON COLUMN public.cuentas_financieras.alias IS 'Nombre corto o etiqueta operativa de la cuenta bancaria.';
COMMENT ON COLUMN public.cuentas_financieras.cuenta_contable_id IS 'Referencia compuesta (empresa_id, cuenta_contable_id) al plan_cuentas de la empresa.';

-- 3. Columnas aditivas en extracto_lineas (sin columna periodo; se filtra por extractos y fecha DATE).
ALTER TABLE public.extracto_lineas
    ADD COLUMN IF NOT EXISTS estado_conciliacion VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_LIBROS',
    ADD COLUMN IF NOT EXISTS diferencia_importe NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS observacion_conciliacion TEXT,
    ADD COLUMN IF NOT EXISTS conciliado_en TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS hash_linea VARCHAR(64);

DO $chk_estado_extracto$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.extracto_lineas'::regclass
           AND conname = 'chk_extracto_lineas_estado_conciliacion'
    ) THEN
        ALTER TABLE public.extracto_lineas
            ADD CONSTRAINT chk_extracto_lineas_estado_conciliacion
            CHECK (estado_conciliacion IN (
                'CONCILIADO',
                'CONCILIADO_MANUAL',
                'SUGERIDO',
                'PENDIENTE_LIBROS',
                'PENDIENTE_BANCO',
                'CHEQUE_NO_COBRADO',
                'CARGO_BANCARIO_ITF',
                'DIFERENCIA_IMPORTE',
                'DUPLICADO'
            ));
    END IF;
END;
$chk_estado_extracto$;

COMMENT ON COLUMN public.extracto_lineas.estado_conciliacion IS 'Estado de conciliación V2 de la línea bancaria. Nota Fase 1: los estados del lado libro (PENDIENTE_BANCO, CHEQUE_NO_COBRADO) se calculan dinámicamente al leer y no se persisten en movimientos_tesoreria hasta Fase 3.';

-- 4. Columnas aditivas en conciliaciones_bancarias (snapshot al cierre y reapertura auditada).
ALTER TABLE public.conciliaciones_bancarias
    ADD COLUMN IF NOT EXISTS saldo_inicial_banco NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS saldo_final_banco NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS depositos_en_transito NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS cheques_no_cobrados NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS abonos_no_registrados NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS cargos_no_registrados NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS saldo_mayor_104x NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS diferencia_integridad_mayor NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS snapshot_json JSONB,
    ADD COLUMN IF NOT EXISTS motivo_reapertura TEXT,
    ADD COLUMN IF NOT EXISTS reabierta_por UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS fecha_reapertura TIMESTAMPTZ;

COMMENT ON COLUMN public.conciliaciones_bancarias.saldo_inicial_banco IS 'Snapshot al cierre; no es fuente de verdad operativa.';
COMMENT ON COLUMN public.conciliaciones_bancarias.saldo_final_banco IS 'Snapshot al cierre; no es fuente de verdad operativa.';
COMMENT ON COLUMN public.conciliaciones_bancarias.depositos_en_transito IS 'Snapshot al cierre; no es fuente de verdad operativa.';
COMMENT ON COLUMN public.conciliaciones_bancarias.cheques_no_cobrados IS 'Snapshot al cierre; no es fuente de verdad operativa.';
COMMENT ON COLUMN public.conciliaciones_bancarias.abonos_no_registrados IS 'Snapshot al cierre; no es fuente de verdad operativa.';
COMMENT ON COLUMN public.conciliaciones_bancarias.cargos_no_registrados IS 'Snapshot al cierre; no es fuente de verdad operativa.';
COMMENT ON COLUMN public.conciliaciones_bancarias.saldo_mayor_104x IS 'Snapshot al cierre del saldo contable en cuenta 104x (asiento_detalle); no es fuente de verdad operativa.';
COMMENT ON COLUMN public.conciliaciones_bancarias.diferencia_integridad_mayor IS 'Snapshot al cierre de la diferencia Tesorería vs Mayor 104x; no es fuente de verdad operativa.';
COMMENT ON COLUMN public.conciliaciones_bancarias.snapshot_json IS 'Snapshot al cierre con el detalle resumido al momento de cerrar; no es fuente de verdad operativa.';

-- 5. Tabla de configuración por empresa para Conciliación V2 y feature flag CONCILIACION_V2.
CREATE TABLE IF NOT EXISTS public.conciliacion_config_empresa (
    empresa_id UUID PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
    conciliacion_v2_habilitada BOOLEAN NOT NULL DEFAULT FALSE,
    tolerancia_dias INTEGER NOT NULL DEFAULT 3 CHECK (tolerancia_dias BETWEEN 0 AND 30),
    tolerancia_monto NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (tolerancia_monto >= 0),
    cuenta_itf_codigo VARCHAR(20) NOT NULL DEFAULT '6412',
    cuenta_comision_codigo VARCHAR(20) NOT NULL DEFAULT '6391',
    cuenta_interes_gasto_codigo VARCHAR(20) NOT NULL DEFAULT '67311',
    cuenta_interes_ingreso_codigo VARCHAR(20) NOT NULL DEFAULT '7793',
    updated_by UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.conciliacion_config_empresa IS 'Parámetros por empresa y flag operativo CONCILIACION_V2.';

-- RLS obligatoria (ENABLE + FORCE) consistente con schema_fase21_sire_anexos.sql y schema_aislamiento_empresa.sql.
DROP POLICY IF EXISTS aislamiento_atlob ON public.conciliacion_config_empresa;
CREATE POLICY aislamiento_atlob ON public.conciliacion_config_empresa
  USING (
      empresa_id = COALESCE(
          NULLIF(current_setting('app.empresa_id', true), ''),
          NULLIF(current_setting('app.current_empresa_id', true), '')
      )::uuid
  )
  WITH CHECK (
      empresa_id = COALESCE(
          NULLIF(current_setting('app.empresa_id', true), ''),
          NULLIF(current_setting('app.current_empresa_id', true), '')
      )::uuid
  );
ALTER TABLE public.conciliacion_config_empresa ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

-- Nota de permisos: schema_fase4.sql no declara GRANT explícitos ni ALTER DEFAULT PRIVILEGES porque
-- contabilidad_app es propietario de la base y sus objetos. Se añade este GRANT idempotente de respaldo
-- por si una migración se ejecuta bajo un rol administrador distinto (p. ej. postgres).
DO $grants_concil$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'contabilidad_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.conciliacion_config_empresa TO contabilidad_app;
    END IF;
END;
$grants_concil$;

-- 6. Índices sobre columnas verificadas de schema_fase4.sql y nuevas columnas.
CREATE INDEX IF NOT EXISTS idx_extracto_lineas_emp_ext_fecha
    ON public.extracto_lineas (empresa_id, extracto_id, fecha);

CREATE INDEX IF NOT EXISTS idx_extracto_lineas_emp_estado_fecha
    ON public.extracto_lineas (empresa_id, estado_conciliacion, fecha);

CREATE INDEX IF NOT EXISTS idx_mov_tesoreria_emp_cta_fecha_est
    ON public.movimientos_tesoreria (empresa_id, cuenta_financiera_id, fecha, estado);

CREATE INDEX IF NOT EXISTS idx_mov_tesoreria_emp_cta_op_imp
    ON public.movimientos_tesoreria (empresa_id, cuenta_financiera_id, numero_operacion, importe);

CREATE INDEX IF NOT EXISTS idx_extractos_bancarios_emp_cta_corte
    ON public.extractos_bancarios (empresa_id, cuenta_financiera_id, fecha_corte_desde, fecha_corte_hasta);

CREATE INDEX IF NOT EXISTS idx_cuentas_financieras_emp_cta_cont
    ON public.cuentas_financieras (empresa_id, cuenta_contable_id);

-- 7. Backfill idempotente bajo RLS normal iterando empresas (sin deshabilitar FORCE ROW LEVEL SECURITY).
DO $backfill_concil_v2$
DECLARE
    v_empresa UUID;
    v_ctx_empresa TEXT := current_setting('app.empresa_id', true);
    v_ctx_current TEXT := current_setting('app.current_empresa_id', true);
BEGIN
    FOR v_empresa IN SELECT id FROM public.empresas ORDER BY id LOOP
        PERFORM set_config('app.empresa_id', v_empresa::text, true);
        PERFORM set_config('app.current_empresa_id', v_empresa::text, true);

        UPDATE public.extracto_lineas
           SET estado_conciliacion = 'CONCILIADO'
         WHERE empresa_id = v_empresa
           AND conciliada IS TRUE
           AND estado_conciliacion = 'PENDIENTE_LIBROS';

        UPDATE public.cuentas_financieras AS cf
           SET cuenta_contable_id = pc.id
          FROM public.plan_cuentas AS pc
         WHERE cf.empresa_id = v_empresa
           AND cf.cuenta_contable_id IS NULL
           AND pc.empresa_id = cf.empresa_id
           AND pc.codigo = cf.cuenta_contable_codigo;
    END LOOP;

    PERFORM set_config('app.empresa_id', COALESCE(v_ctx_empresa, ''), true);
    PERFORM set_config('app.current_empresa_id', COALESCE(v_ctx_current, ''), true);
END;
$backfill_concil_v2$;
