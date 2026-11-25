-- ============================================================================
-- FASE 25 — Conciliación Bancaria V2: Vínculo Cartera-Tesorería, Cheques
--           Bancarios y Plantillas de Asientos de Conciliación
-- ============================================================================
-- Versión mínima de PostgreSQL requerida: 15
--   (por la sintaxis de lista de columnas `ON DELETE SET NULL (columna)`
--    en las FKs compuestas por empresa_id).
--
-- Notas de diseño:
-- 1. Migración 100% aditiva e idempotente. No realiza DROP, RENAME ni alteración
--    de tipos en tablas o columnas existentes.
-- 2. Regla d: antes de crear FKs compuestas (empresa_id, id) hacia tablas
--    existentes, se verifican y crean condicionalmente restricciones UNIQUE
--    (empresa_id, id) con nombre propio sin asumir scripts fk_empresa_*.sql.
-- 3. Decisión 1: no se crea tabla paralela de aplicaciones de cartera. Se
--    añade `movimiento_tesoreria_id` en `aplicaciones_cobranza` y
--    `aplicaciones_pago` y se expone una vista de solo lectura
--    `v_conciliacion_aplicaciones_cartera` con `security_invoker = true`.
-- 4. Todas las tablas nuevas habilitan RLS (ENABLE + FORCE) con política
--    aislamiento_atlob y GRANT explícito idempotente a contabilidad_app.
-- ============================================================================

-- 1. Regla d: UNIQUE (empresa_id, id) condicionales con nombre propio.
DO $uq_regla_d_fase25$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.aplicaciones_cobranza'::regclass
           AND conname = 'uq_aplicaciones_cobranza_empresa_id_id'
    ) THEN
        ALTER TABLE public.aplicaciones_cobranza
            ADD CONSTRAINT uq_aplicaciones_cobranza_empresa_id_id UNIQUE (empresa_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.aplicaciones_pago'::regclass
           AND conname = 'uq_aplicaciones_pago_empresa_id_id'
    ) THEN
        ALTER TABLE public.aplicaciones_pago
            ADD CONSTRAINT uq_aplicaciones_pago_empresa_id_id UNIQUE (empresa_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.cuentas_por_cobrar'::regclass
           AND conname = 'uq_cuentas_por_cobrar_empresa_id_id'
    ) THEN
        ALTER TABLE public.cuentas_por_cobrar
            ADD CONSTRAINT uq_cuentas_por_cobrar_empresa_id_id UNIQUE (empresa_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.cuentas_por_pagar'::regclass
           AND conname = 'uq_cuentas_por_pagar_empresa_id_id'
    ) THEN
        ALTER TABLE public.cuentas_por_pagar
            ADD CONSTRAINT uq_cuentas_por_pagar_empresa_id_id UNIQUE (empresa_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.detracciones'::regclass
           AND conname = 'uq_detracciones_empresa_id_id'
    ) THEN
        ALTER TABLE public.detracciones
            ADD CONSTRAINT uq_detracciones_empresa_id_id UNIQUE (empresa_id, id);
    END IF;

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
         WHERE conrelid = 'public.cuentas_financieras'::regclass
           AND conname = 'uq_cuentas_financieras_empresa_id_id'
    ) THEN
        ALTER TABLE public.cuentas_financieras
            ADD CONSTRAINT uq_cuentas_financieras_empresa_id_id UNIQUE (empresa_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.anexos'::regclass
           AND conname = 'uq_anexos_empresa_id_id'
    ) THEN
        ALTER TABLE public.anexos
            ADD CONSTRAINT uq_anexos_empresa_id_id UNIQUE (empresa_id, id);
    END IF;
END;
$uq_regla_d_fase25$;

-- 2. Decisión 1: vínculo directo con movimientos_tesoreria en aplicaciones de cartera + vista unificada.
ALTER TABLE public.aplicaciones_cobranza
    ADD COLUMN IF NOT EXISTS movimiento_tesoreria_id UUID;

DO $fk_app_cobranza_mov_tes$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.aplicaciones_cobranza'::regclass
           AND conname = 'aplicaciones_cobranza_mov_tes_fkey'
    ) THEN
        -- Requiere PostgreSQL >= 15 por ON DELETE SET NULL (movimiento_tesoreria_id).
        ALTER TABLE public.aplicaciones_cobranza
            ADD CONSTRAINT aplicaciones_cobranza_mov_tes_fkey
            FOREIGN KEY (empresa_id, movimiento_tesoreria_id)
            REFERENCES public.movimientos_tesoreria (empresa_id, id)
            ON DELETE SET NULL (movimiento_tesoreria_id);
    END IF;
END;
$fk_app_cobranza_mov_tes$;

CREATE INDEX IF NOT EXISTS idx_aplicaciones_cobranza_emp_mov_tes
    ON public.aplicaciones_cobranza (empresa_id, movimiento_tesoreria_id);

COMMENT ON COLUMN public.aplicaciones_cobranza.movimiento_tesoreria_id IS 'Referencia compuesta opcional al movimiento de tesorería asociado a la cobranza (requiere PostgreSQL >= 15 por ON DELETE SET NULL por columna).';

ALTER TABLE public.aplicaciones_pago
    ADD COLUMN IF NOT EXISTS movimiento_tesoreria_id UUID;

DO $fk_app_pago_mov_tes$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.aplicaciones_pago'::regclass
           AND conname = 'aplicaciones_pago_mov_tes_fkey'
    ) THEN
        -- Requiere PostgreSQL >= 15 por ON DELETE SET NULL (movimiento_tesoreria_id).
        ALTER TABLE public.aplicaciones_pago
            ADD CONSTRAINT aplicaciones_pago_mov_tes_fkey
            FOREIGN KEY (empresa_id, movimiento_tesoreria_id)
            REFERENCES public.movimientos_tesoreria (empresa_id, id)
            ON DELETE SET NULL (movimiento_tesoreria_id);
    END IF;
END;
$fk_app_pago_mov_tes$;

CREATE INDEX IF NOT EXISTS idx_aplicaciones_pago_emp_mov_tes
    ON public.aplicaciones_pago (empresa_id, movimiento_tesoreria_id);

COMMENT ON COLUMN public.aplicaciones_pago.movimiento_tesoreria_id IS 'Referencia compuesta opcional al movimiento de tesorería asociado al pago (requiere PostgreSQL >= 15 por ON DELETE SET NULL por columna).';

CREATE OR REPLACE VIEW public.v_conciliacion_aplicaciones_cartera
WITH (security_invoker = true) AS
SELECT
    'COBRANZA'::varchar(10) AS tipo_aplicacion,
    ac.id AS aplicacion_id,
    ac.empresa_id,
    ac.cuenta_por_cobrar_id AS cuenta_cartera_id,
    ac.movimiento_tesoreria_id,
    ac.asiento_id,
    ac.fecha_cobranza AS fecha_aplicacion,
    ac.importe_aplicado,
    ac.moneda,
    ac.tipo_cambio,
    ac.referencia_banco,
    ac.created_at
FROM public.aplicaciones_cobranza ac
UNION ALL
SELECT
    'PAGO'::varchar(10) AS tipo_aplicacion,
    ap.id AS aplicacion_id,
    ap.empresa_id,
    ap.cuenta_por_pagar_id AS cuenta_cartera_id,
    ap.movimiento_tesoreria_id,
    ap.asiento_id,
    ap.fecha_pago AS fecha_aplicacion,
    ap.importe_aplicado,
    ap.moneda,
    ap.tipo_cambio,
    ap.referencia_banco,
    ap.created_at
FROM public.aplicaciones_pago ap;

COMMENT ON VIEW public.v_conciliacion_aplicaciones_cartera IS 'Vista unificada de solo lectura sobre aplicaciones_cobranza y aplicaciones_pago con vínculo a movimiento_tesoreria_id.';

-- 3. Tabla public.cheques_bancarios.
CREATE TABLE IF NOT EXISTS public.cheques_bancarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    cuenta_financiera_id UUID NOT NULL,
    movimiento_tesoreria_id UUID,
    extracto_linea_id UUID,
    anexo_id UUID,
    numero_cheque VARCHAR(40) NOT NULL,
    beneficiario VARCHAR(200) NOT NULL,
    moneda VARCHAR(3) NOT NULL DEFAULT 'PEN' CHECK (moneda IN ('PEN', 'USD')),
    monto NUMERIC(14, 2) NOT NULL CHECK (monto > 0),
    fecha_giro DATE NOT NULL,
    fecha_entrega DATE,
    fecha_cobro DATE,
    fecha_vencimiento DATE,
    estado VARCHAR(20) NOT NULL DEFAULT 'GIRADO' CHECK (estado IN ('GIRADO', 'ENTREGADO', 'COBRADO', 'VENCIDO', 'ANULADO')),
    es_no_negociable BOOLEAN NOT NULL DEFAULT FALSE,
    observacion TEXT,
    created_by UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_cheques_bancarios_emp_cta_num UNIQUE (empresa_id, cuenta_financiera_id, numero_cheque),
    CONSTRAINT uq_cheques_bancarios_empresa_id_id UNIQUE (empresa_id, id)
);

DO $fk_cheques_bancarios$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.cheques_bancarios'::regclass
           AND conname = 'cheques_bancarios_cuenta_financiera_fkey'
    ) THEN
        ALTER TABLE public.cheques_bancarios
            ADD CONSTRAINT cheques_bancarios_cuenta_financiera_fkey
            FOREIGN KEY (empresa_id, cuenta_financiera_id)
            REFERENCES public.cuentas_financieras (empresa_id, id)
            ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.cheques_bancarios'::regclass
           AND conname = 'cheques_bancarios_movimiento_tesoreria_fkey'
    ) THEN
        -- Requiere PostgreSQL >= 15 por ON DELETE SET NULL (movimiento_tesoreria_id).
        ALTER TABLE public.cheques_bancarios
            ADD CONSTRAINT cheques_bancarios_movimiento_tesoreria_fkey
            FOREIGN KEY (empresa_id, movimiento_tesoreria_id)
            REFERENCES public.movimientos_tesoreria (empresa_id, id)
            ON DELETE SET NULL (movimiento_tesoreria_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.cheques_bancarios'::regclass
           AND conname = 'cheques_bancarios_extracto_linea_fkey'
    ) THEN
        -- Requiere PostgreSQL >= 15 por ON DELETE SET NULL (extracto_linea_id).
        ALTER TABLE public.cheques_bancarios
            ADD CONSTRAINT cheques_bancarios_extracto_linea_fkey
            FOREIGN KEY (empresa_id, extracto_linea_id)
            REFERENCES public.extracto_lineas (empresa_id, id)
            ON DELETE SET NULL (extracto_linea_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.cheques_bancarios'::regclass
           AND conname = 'cheques_bancarios_anexo_fkey'
    ) THEN
        -- Requiere PostgreSQL >= 15 por ON DELETE SET NULL (anexo_id).
        ALTER TABLE public.cheques_bancarios
            ADD CONSTRAINT cheques_bancarios_anexo_fkey
            FOREIGN KEY (empresa_id, anexo_id)
            REFERENCES public.anexos (empresa_id, id)
            ON DELETE SET NULL (anexo_id);
    END IF;
END;
$fk_cheques_bancarios$;

CREATE INDEX IF NOT EXISTS idx_cheques_bancarios_emp_cta_est
    ON public.cheques_bancarios (empresa_id, cuenta_financiera_id, estado);

CREATE INDEX IF NOT EXISTS idx_cheques_bancarios_emp_fecha_giro
    ON public.cheques_bancarios (empresa_id, fecha_giro);

COMMENT ON TABLE public.cheques_bancarios IS 'Control de cheques girados, entregados, cobrados, vencidos o anulados vinculados a tesorería y extractos.';

-- 4. Tabla public.conciliacion_plantillas_asiento.
CREATE TABLE IF NOT EXISTS public.conciliacion_plantillas_asiento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    codigo VARCHAR(50) NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    tipo_operacion VARCHAR(40) NOT NULL CHECK (
        tipo_operacion IN (
            'ITF',
            'COMISION',
            'MANTENIMIENTO',
            'INTERES_GASTO',
            'INTERES_INGRESO',
            'DIFERENCIA_CAMBIO_GANANCIA',
            'DIFERENCIA_CAMBIO_PERDIDA',
            'OTRO'
        )
    ),
    cuenta_contrapartida_codigo VARCHAR(20),
    subdiario_codigo VARCHAR(10) NOT NULL DEFAULT '05',
    glosa_plantilla VARCHAR(250) NOT NULL,
    es_sistema BOOLEAN NOT NULL DEFAULT FALSE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_concil_plantillas_asiento_emp_cod UNIQUE (empresa_id, codigo),
    CONSTRAINT uq_concil_plantillas_asiento_empresa_id_id UNIQUE (empresa_id, id)
);

CREATE INDEX IF NOT EXISTS idx_concil_plantillas_asiento_emp_tipo_act
    ON public.conciliacion_plantillas_asiento (empresa_id, tipo_operacion, activo);

COMMENT ON TABLE public.conciliacion_plantillas_asiento IS 'Plantillas por empresa para contabilización rápida de cargos/abonos bancarios y diferencias de cambio.';

-- 5. RLS (ENABLE + FORCE) + política aislamiento_atlob + GRANTs en tablas nuevas y vista.
DROP POLICY IF EXISTS aislamiento_atlob ON public.cheques_bancarios;
CREATE POLICY aislamiento_atlob ON public.cheques_bancarios
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
ALTER TABLE public.cheques_bancarios ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.conciliacion_plantillas_asiento;
CREATE POLICY aislamiento_atlob ON public.conciliacion_plantillas_asiento
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
ALTER TABLE public.conciliacion_plantillas_asiento ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DO $grants_concil_v2_fase25$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'contabilidad_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.cheques_bancarios TO contabilidad_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.conciliacion_plantillas_asiento TO contabilidad_app;
        GRANT SELECT ON public.v_conciliacion_aplicaciones_cartera TO contabilidad_app;
    END IF;
END;
$grants_concil_v2_fase25$;
