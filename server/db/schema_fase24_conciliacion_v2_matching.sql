-- ============================================================================
-- FASE 24 — Conciliación Bancaria V2: Motor de Matching, Reglas Aprendidas
--           y Trazabilidad de Desconciliación
-- ============================================================================
-- Versión mínima de PostgreSQL requerida: 15
--   (por la sintaxis de lista de columnas `ON DELETE SET NULL (columna)`
--    en las FKs compuestas por empresa_id).
--
-- Notas de diseño:
-- 1. Migración 100% aditiva e idempotente. No realiza DROP, RENAME ni alteración
--    de tipos en tablas o columnas existentes.
-- 2. Regla d: antes de crear FKs compuestas (empresa_id, id) hacia tablas
--    existentes, se crean restricciones UNIQUE (empresa_id, id) condicionales
--    con nombre propio sin asumir scripts externos fk_empresa_*.sql.
-- 3. public.conciliacion_historial_desconciliacion es append-only / inmutable
--    en operación normal (trigger BEFORE UPDATE OR DELETE). Solo permite
--    limpieza transaccional cuando app.restaurando_backup = 'true' (B2).
-- 4. Todas las tablas nuevas habilitan RLS (ENABLE + FORCE) con política
--    aislamiento_atlob y GRANT explícito idempotente a contabilidad_app.
-- ============================================================================

-- 1. Regla d: UNIQUE (empresa_id, id) condicionales con nombre propio antes de FKs compuestas.
DO $uq_regla_d_fase24$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.movimientos_tesoreria'::regclass
           AND conname = 'uq_movimientos_tesoreria_empresa_id_id'
    ) THEN
        ALTER TABLE public.movimientos_tesoreria
            ADD CONSTRAINT uq_movimientos_tesoreria_empresa_id_id UNIQUE (empresa_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.extracto_lineas'::regclass
           AND conname = 'uq_extracto_lineas_empresa_id_id'
    ) THEN
        ALTER TABLE public.extracto_lineas
            ADD CONSTRAINT uq_extracto_lineas_empresa_id_id UNIQUE (empresa_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.asientos'::regclass
           AND conname = 'uq_asientos_empresa_id_id'
    ) THEN
        ALTER TABLE public.asientos
            ADD CONSTRAINT uq_asientos_empresa_id_id UNIQUE (empresa_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.asiento_detalle'::regclass
           AND conname = 'uq_asiento_detalle_empresa_id_id'
    ) THEN
        ALTER TABLE public.asiento_detalle
            ADD CONSTRAINT uq_asiento_detalle_empresa_id_id UNIQUE (empresa_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.anexos'::regclass
           AND conname = 'uq_anexos_empresa_id_id'
    ) THEN
        ALTER TABLE public.anexos
            ADD CONSTRAINT uq_anexos_empresa_id_id UNIQUE (empresa_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.plan_cuentas'::regclass
           AND conname = 'uq_plan_cuentas_empresa_id_id'
    ) THEN
        ALTER TABLE public.plan_cuentas
            ADD CONSTRAINT uq_plan_cuentas_empresa_id_id UNIQUE (empresa_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.cuentas_financieras'::regclass
           AND conname = 'uq_cuentas_financieras_empresa_id_id'
    ) THEN
        ALTER TABLE public.cuentas_financieras
            ADD CONSTRAINT uq_cuentas_financieras_empresa_id_id UNIQUE (empresa_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.periodos'::regclass
           AND conname = 'uq_periodos_empresa_id_id'
    ) THEN
        ALTER TABLE public.periodos
            ADD CONSTRAINT uq_periodos_empresa_id_id UNIQUE (empresa_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.conciliaciones_bancarias'::regclass
           AND conname = 'uq_conciliaciones_bancarias_empresa_id_id'
    ) THEN
        ALTER TABLE public.conciliaciones_bancarias
            ADD CONSTRAINT uq_conciliaciones_bancarias_empresa_id_id UNIQUE (empresa_id, id);
    END IF;
END;
$uq_regla_d_fase24$;

-- 2. Columnas aditivas en tablas existentes + sincronización idempotente bajo RLS.
ALTER TABLE public.movimientos_tesoreria
    ADD COLUMN IF NOT EXISTS estado_conciliacion_libro VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_BANCO';

DO $chk_mov_tes_estado_libro$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.movimientos_tesoreria'::regclass
           AND conname = 'chk_movimientos_tesoreria_estado_conc_libro'
    ) THEN
        ALTER TABLE public.movimientos_tesoreria
            ADD CONSTRAINT chk_movimientos_tesoreria_estado_conc_libro
            CHECK (estado_conciliacion_libro IN ('CONCILIADO', 'PENDIENTE_BANCO', 'CHEQUE_NO_COBRADO'));
    END IF;
END;
$chk_mov_tes_estado_libro$;

COMMENT ON COLUMN public.movimientos_tesoreria.estado_conciliacion_libro IS 'Estado de conciliación del movimiento en libros para Conciliación V2 (Fase 3+).';

CREATE INDEX IF NOT EXISTS idx_mov_tesoreria_emp_cta_est_libro
    ON public.movimientos_tesoreria (empresa_id, cuenta_financiera_id, estado_conciliacion_libro, fecha);

DO $sync_mov_tes_estado_libro$
DECLARE
    v_empresa UUID;
    v_ctx_empresa TEXT := current_setting('app.empresa_id', true);
    v_ctx_current TEXT := current_setting('app.current_empresa_id', true);
BEGIN
    FOR v_empresa IN SELECT id FROM public.empresas ORDER BY id LOOP
        PERFORM set_config('app.empresa_id', v_empresa::text, true);
        PERFORM set_config('app.current_empresa_id', v_empresa::text, true);

        UPDATE public.movimientos_tesoreria
           SET estado_conciliacion_libro = CASE
                   WHEN conciliado IS TRUE THEN 'CONCILIADO'
                   WHEN conciliado IS FALSE AND tipo = 'EGRESO' AND medio_pago = '007' THEN 'CHEQUE_NO_COBRADO'
                   ELSE estado_conciliacion_libro
               END
         WHERE empresa_id = v_empresa
           AND estado_conciliacion_libro = 'PENDIENTE_BANCO'
           AND (
               conciliado IS TRUE
               OR (conciliado IS FALSE AND tipo = 'EGRESO' AND medio_pago = '007')
           );
    END LOOP;

    PERFORM set_config('app.empresa_id', COALESCE(v_ctx_empresa, ''), true);
    PERFORM set_config('app.current_empresa_id', COALESCE(v_ctx_current, ''), true);
END;
$sync_mov_tes_estado_libro$;

ALTER TABLE public.conciliacion_config_empresa
    ADD COLUMN IF NOT EXISTS umbral_auto_match NUMERIC(5, 4) NOT NULL DEFAULT 0.9000;

DO $chk_conc_config_umbral$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.conciliacion_config_empresa'::regclass
           AND conname = 'chk_conc_config_umbral_auto_match'
    ) THEN
        ALTER TABLE public.conciliacion_config_empresa
            ADD CONSTRAINT chk_conc_config_umbral_auto_match
            CHECK (umbral_auto_match BETWEEN 0.6000 AND 1.0000);
    END IF;
END;
$chk_conc_config_umbral$;

COMMENT ON COLUMN public.conciliacion_config_empresa.umbral_auto_match IS 'Umbral mínimo de score (0.6000 a 1.0000) para confirmación automática de coincidencias.';

-- 3. Tabla public.conciliacion_grupo.
CREATE TABLE IF NOT EXISTS public.conciliacion_grupo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    cuenta_financiera_id UUID NOT NULL,
    periodo_id UUID NOT NULL,
    tipo_match VARCHAR(10) NOT NULL CHECK (tipo_match IN ('1:1', '1:N', 'N:1', 'N:M')),
    regla_aplicada VARCHAR(60) NOT NULL,
    capa_matching SMALLINT NOT NULL CHECK (capa_matching BETWEEN 0 AND 4),
    score NUMERIC(5, 4) NOT NULL DEFAULT 1.0000 CHECK (score BETWEEN 0.0000 AND 1.0000),
    estado VARCHAR(30) NOT NULL DEFAULT 'SUGERIDO' CHECK (
        estado IN ('SUGERIDO', 'CONCILIADO', 'CONCILIADO_MANUAL', 'RECHAZADO', 'DESCONCILIADO')
    ),
    diferencia_monto NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    observacion TEXT,
    usuario_id UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    confirmado_por UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    confirmado_en TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_conciliacion_grupo_empresa_id_id UNIQUE (empresa_id, id)
);

DO $fk_conciliacion_grupo$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.conciliacion_grupo'::regclass
           AND conname = 'conciliacion_grupo_cuenta_financiera_fkey'
    ) THEN
        ALTER TABLE public.conciliacion_grupo
            ADD CONSTRAINT conciliacion_grupo_cuenta_financiera_fkey
            FOREIGN KEY (empresa_id, cuenta_financiera_id)
            REFERENCES public.cuentas_financieras (empresa_id, id)
            ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.conciliacion_grupo'::regclass
           AND conname = 'conciliacion_grupo_periodo_fkey'
    ) THEN
        ALTER TABLE public.conciliacion_grupo
            ADD CONSTRAINT conciliacion_grupo_periodo_fkey
            FOREIGN KEY (empresa_id, periodo_id)
            REFERENCES public.periodos (empresa_id, id)
            ON DELETE RESTRICT;
    END IF;
END;
$fk_conciliacion_grupo$;

CREATE INDEX IF NOT EXISTS idx_concil_grupo_emp_cta_per_est
    ON public.conciliacion_grupo (empresa_id, cuenta_financiera_id, periodo_id, estado);

COMMENT ON TABLE public.conciliacion_grupo IS 'Grupos de conciliación bancaria 1:1, 1:N, N:1 o N:M con trazabilidad de capa, regla y score.';

-- 4. Tabla public.conciliacion_item.
CREATE TABLE IF NOT EXISTS public.conciliacion_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    grupo_id UUID NOT NULL,
    lado VARCHAR(10) NOT NULL CHECK (lado IN ('BANCO', 'LIBRO')),
    origen_libro VARCHAR(30) CHECK (origen_libro IN ('MOVIMIENTO_TESORERIA', 'ASIENTO_MANUAL')),
    extracto_linea_id UUID,
    movimiento_tesoreria_id UUID,
    asiento_id UUID,
    asiento_detalle_id UUID,
    monto_imputado NUMERIC(14, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_conciliacion_item_empresa_id_id UNIQUE (empresa_id, id),
    CONSTRAINT chk_conciliacion_item_referencias CHECK (
        (
            lado = 'BANCO'
            AND extracto_linea_id IS NOT NULL
            AND origen_libro IS NULL
            AND movimiento_tesoreria_id IS NULL
            AND asiento_id IS NULL
            AND asiento_detalle_id IS NULL
        )
        OR (
            lado = 'LIBRO'
            AND origen_libro = 'MOVIMIENTO_TESORERIA'
            AND movimiento_tesoreria_id IS NOT NULL
            AND extracto_linea_id IS NULL
            AND asiento_detalle_id IS NULL
        )
        OR (
            lado = 'LIBRO'
            AND origen_libro = 'ASIENTO_MANUAL'
            AND asiento_id IS NOT NULL
            AND asiento_detalle_id IS NOT NULL
            AND movimiento_tesoreria_id IS NULL
            AND extracto_linea_id IS NULL
        )
    )
);

DO $fk_conciliacion_item$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.conciliacion_item'::regclass
           AND conname = 'conciliacion_item_grupo_fkey'
    ) THEN
        ALTER TABLE public.conciliacion_item
            ADD CONSTRAINT conciliacion_item_grupo_fkey
            FOREIGN KEY (empresa_id, grupo_id)
            REFERENCES public.conciliacion_grupo (empresa_id, id)
            ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.conciliacion_item'::regclass
           AND conname = 'conciliacion_item_extracto_linea_fkey'
    ) THEN
        ALTER TABLE public.conciliacion_item
            ADD CONSTRAINT conciliacion_item_extracto_linea_fkey
            FOREIGN KEY (empresa_id, extracto_linea_id)
            REFERENCES public.extracto_lineas (empresa_id, id)
            ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.conciliacion_item'::regclass
           AND conname = 'conciliacion_item_movimiento_tesoreria_fkey'
    ) THEN
        ALTER TABLE public.conciliacion_item
            ADD CONSTRAINT conciliacion_item_movimiento_tesoreria_fkey
            FOREIGN KEY (empresa_id, movimiento_tesoreria_id)
            REFERENCES public.movimientos_tesoreria (empresa_id, id)
            ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.conciliacion_item'::regclass
           AND conname = 'conciliacion_item_asiento_fkey'
    ) THEN
        ALTER TABLE public.conciliacion_item
            ADD CONSTRAINT conciliacion_item_asiento_fkey
            FOREIGN KEY (empresa_id, asiento_id)
            REFERENCES public.asientos (empresa_id, id)
            ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.conciliacion_item'::regclass
           AND conname = 'conciliacion_item_asiento_detalle_fkey'
    ) THEN
        ALTER TABLE public.conciliacion_item
            ADD CONSTRAINT conciliacion_item_asiento_detalle_fkey
            FOREIGN KEY (empresa_id, asiento_detalle_id)
            REFERENCES public.asiento_detalle (empresa_id, id)
            ON DELETE RESTRICT;
    END IF;
END;
$fk_conciliacion_item$;

CREATE INDEX IF NOT EXISTS idx_concil_item_grupo
    ON public.conciliacion_item (grupo_id);

CREATE INDEX IF NOT EXISTS idx_concil_item_emp_ext_linea
    ON public.conciliacion_item (empresa_id, extracto_linea_id);

CREATE INDEX IF NOT EXISTS idx_concil_item_emp_mov_tes
    ON public.conciliacion_item (empresa_id, movimiento_tesoreria_id);

CREATE INDEX IF NOT EXISTS idx_concil_item_emp_asiento_det
    ON public.conciliacion_item (empresa_id, asiento_detalle_id);

COMMENT ON TABLE public.conciliacion_item IS 'Ítems individuales del lado BANCO o LIBRO vinculados a un grupo de conciliación.';

-- 5. Tabla public.conciliacion_reglas_aprendidas.
CREATE TABLE IF NOT EXISTS public.conciliacion_reglas_aprendidas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    patron_contraparte VARCHAR(200) NOT NULL,
    ruc_contraparte VARCHAR(15),
    anexo_id UUID,
    cuenta_contable_id UUID,
    tipo_clasificacion VARCHAR(40),
    usos_confirmados INTEGER NOT NULL DEFAULT 1 CHECK (usos_confirmados >= 1),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_concil_regla_aprendida_emp_patron UNIQUE (empresa_id, patron_contraparte),
    CONSTRAINT uq_concil_regla_aprendida_empresa_id_id UNIQUE (empresa_id, id)
);

DO $fk_concil_reglas_aprendidas$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.conciliacion_reglas_aprendidas'::regclass
           AND conname = 'conciliacion_reglas_aprendidas_anexo_fkey'
    ) THEN
        -- Requiere PostgreSQL >= 15 por ON DELETE SET NULL (anexo_id).
        ALTER TABLE public.conciliacion_reglas_aprendidas
            ADD CONSTRAINT conciliacion_reglas_aprendidas_anexo_fkey
            FOREIGN KEY (empresa_id, anexo_id)
            REFERENCES public.anexos (empresa_id, id)
            ON DELETE SET NULL (anexo_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.conciliacion_reglas_aprendidas'::regclass
           AND conname = 'conciliacion_reglas_aprendidas_cuenta_contable_fkey'
    ) THEN
        -- Requiere PostgreSQL >= 15 por ON DELETE SET NULL (cuenta_contable_id).
        ALTER TABLE public.conciliacion_reglas_aprendidas
            ADD CONSTRAINT conciliacion_reglas_aprendidas_cuenta_contable_fkey
            FOREIGN KEY (empresa_id, cuenta_contable_id)
            REFERENCES public.plan_cuentas (empresa_id, id)
            ON DELETE SET NULL (cuenta_contable_id);
    END IF;
END;
$fk_concil_reglas_aprendidas$;

CREATE INDEX IF NOT EXISTS idx_concil_reglas_apr_emp_activo
    ON public.conciliacion_reglas_aprendidas (empresa_id, activo);

COMMENT ON TABLE public.conciliacion_reglas_aprendidas IS 'Patrones de contraparte aprendidos a partir de confirmaciones manuales por empresa.';

-- 6. Tabla public.conciliacion_historial_desconciliacion (INMUTABLE en operación normal).
CREATE TABLE IF NOT EXISTS public.conciliacion_historial_desconciliacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    grupo_id UUID,
    extracto_linea_id UUID,
    movimiento_tesoreria_id UUID,
    estado_anterior_banco VARCHAR(30),
    estado_anterior_libro VARCHAR(30),
    motivo TEXT NOT NULL,
    snapshot_grupo_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    usuario_id UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_concil_hist_desconcil_empresa_id_id UNIQUE (empresa_id, id)
);

DO $fk_concil_hist_desconcil$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.conciliacion_historial_desconciliacion'::regclass
           AND conname = 'conciliacion_hist_desconcil_grupo_fkey'
    ) THEN
        -- Requiere PostgreSQL >= 15 por ON DELETE SET NULL (grupo_id).
        ALTER TABLE public.conciliacion_historial_desconciliacion
            ADD CONSTRAINT conciliacion_hist_desconcil_grupo_fkey
            FOREIGN KEY (empresa_id, grupo_id)
            REFERENCES public.conciliacion_grupo (empresa_id, id)
            ON DELETE SET NULL (grupo_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.conciliacion_historial_desconciliacion'::regclass
           AND conname = 'conciliacion_hist_desconcil_ext_linea_fkey'
    ) THEN
        -- Requiere PostgreSQL >= 15 por ON DELETE SET NULL (extracto_linea_id).
        ALTER TABLE public.conciliacion_historial_desconciliacion
            ADD CONSTRAINT conciliacion_hist_desconcil_ext_linea_fkey
            FOREIGN KEY (empresa_id, extracto_linea_id)
            REFERENCES public.extracto_lineas (empresa_id, id)
            ON DELETE SET NULL (extracto_linea_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.conciliacion_historial_desconciliacion'::regclass
           AND conname = 'conciliacion_hist_desconcil_mov_tes_fkey'
    ) THEN
        -- Requiere PostgreSQL >= 15 por ON DELETE SET NULL (movimiento_tesoreria_id).
        ALTER TABLE public.conciliacion_historial_desconciliacion
            ADD CONSTRAINT conciliacion_hist_desconcil_mov_tes_fkey
            FOREIGN KEY (empresa_id, movimiento_tesoreria_id)
            REFERENCES public.movimientos_tesoreria (empresa_id, id)
            ON DELETE SET NULL (movimiento_tesoreria_id);
    END IF;
END;
$fk_concil_hist_desconcil$;

CREATE OR REPLACE FUNCTION public.fn_conciliacion_hist_desconcil_inmutable()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.restaurando_backup', true) = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    RAISE EXCEPTION 'CONCILIACION_HISTORIAL_INMUTABLE: El historial de desconciliación es inmutable.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conciliacion_hist_desconcil_inmutable ON public.conciliacion_historial_desconciliacion;
CREATE TRIGGER trg_conciliacion_hist_desconcil_inmutable
BEFORE UPDATE OR DELETE ON public.conciliacion_historial_desconciliacion
FOR EACH ROW EXECUTE FUNCTION public.fn_conciliacion_hist_desconcil_inmutable();

CREATE INDEX IF NOT EXISTS idx_concil_hist_desconcil_emp_fecha
    ON public.conciliacion_historial_desconciliacion (empresa_id, created_at DESC);

COMMENT ON TABLE public.conciliacion_historial_desconciliacion IS 'Bitácora inmutable (append-only) de reversiones/desconciliaciones de grupos o partidas.';

-- 7. RLS (ENABLE + FORCE) + política aislamiento_atlob + GRANTs en las 4 tablas nuevas.
DROP POLICY IF EXISTS aislamiento_atlob ON public.conciliacion_grupo;
CREATE POLICY aislamiento_atlob ON public.conciliacion_grupo
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
ALTER TABLE public.conciliacion_grupo ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.conciliacion_item;
CREATE POLICY aislamiento_atlob ON public.conciliacion_item
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
ALTER TABLE public.conciliacion_item ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.conciliacion_reglas_aprendidas;
CREATE POLICY aislamiento_atlob ON public.conciliacion_reglas_aprendidas
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
ALTER TABLE public.conciliacion_reglas_aprendidas ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.conciliacion_historial_desconciliacion;
CREATE POLICY aislamiento_atlob ON public.conciliacion_historial_desconciliacion
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
ALTER TABLE public.conciliacion_historial_desconciliacion ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DO $grants_concil_v2_matching$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'contabilidad_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.conciliacion_grupo TO contabilidad_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.conciliacion_item TO contabilidad_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.conciliacion_reglas_aprendidas TO contabilidad_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.conciliacion_historial_desconciliacion TO contabilidad_app;
    END IF;
END;
$grants_concil_v2_matching$;
