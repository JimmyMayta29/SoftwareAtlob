-- ============================================================================
-- FASE 26 — Conciliación Bancaria V2: Historial Inmutable de Cierres y
--           Reaperturas + Índices Aditivos de Rendimiento e Integridad
-- ============================================================================
-- Notas de diseño:
-- 1. Migración 100% aditiva e idempotente. No realiza DROP, RENAME ni alteración
--    de tipos en tablas o columnas existentes.
-- 2. Regla d: antes de crear FKs compuestas (empresa_id, id) hacia tablas
--    existentes, se verifican y crean condicionalmente restricciones UNIQUE
--    (empresa_id, id) con nombre propio sin asumir scripts fk_empresa_*.sql.
-- 3. public.conciliacion_cierres_historial es append-only / inmutable en
--    operación normal (trigger BEFORE UPDATE OR DELETE). Solo permite limpieza
--    transaccional cuando app.restaurando_backup = 'true' (B2).
-- 4. Habilita RLS (ENABLE + FORCE) con política aislamiento_atlob y GRANT
--    explícito idempotente a contabilidad_app.
-- 5. Incluye índices aditivos Fase 5 (EXPLAIN) e índices únicos parciales
--    [B-03] Fase 4 para integridad activa de cheques bancarios.
-- ============================================================================

-- 1. Regla d: UNIQUE (empresa_id, id) condicionales con nombre propio antes de FKs compuestas.
DO $uq_regla_d_fase26$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.conciliaciones_bancarias'::regclass
           AND conname = 'uq_conciliaciones_bancarias_empresa_id_id'
    ) THEN
        ALTER TABLE public.conciliaciones_bancarias
            ADD CONSTRAINT uq_conciliaciones_bancarias_empresa_id_id UNIQUE (empresa_id, id);
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
END;
$uq_regla_d_fase26$;

-- 2. Tabla inmutable public.conciliacion_cierres_historial (append-only).
CREATE TABLE IF NOT EXISTS public.conciliacion_cierres_historial (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    conciliacion_id UUID NOT NULL,
    cuenta_financiera_id UUID NOT NULL,
    periodo_id UUID NOT NULL,
    codigo_periodo VARCHAR(7) NOT NULL CHECK (codigo_periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    tipo_evento VARCHAR(20) NOT NULL CHECK (tipo_evento IN ('CIERRE', 'REAPERTURA')),
    numero_secuencia INTEGER NOT NULL CHECK (numero_secuencia >= 1),
    fecha_corte DATE NOT NULL,
    saldo_inicial_banco NUMERIC(15, 2),
    saldo_final_banco NUMERIC(15, 2),
    saldo_libros NUMERIC(15, 2) NOT NULL,
    depositos_en_transito NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    cheques_no_cobrados NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    abonos_no_registrados NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    cargos_no_registrados NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    saldo_mayor_104x NUMERIC(15, 2),
    diferencia_integridad_mayor NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    diferencia NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    motivo TEXT,
    snapshot_json JSONB NOT NULL,
    hash_snapshot_sha256 VARCHAR(64) NOT NULL CHECK (char_length(hash_snapshot_sha256) = 64),
    usuario_id UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_concil_cierres_hist_empresa_id_id UNIQUE (empresa_id, id),
    CONSTRAINT uq_concil_cierres_hist_emp_cta_per_seq UNIQUE (empresa_id, cuenta_financiera_id, periodo_id, numero_secuencia)
);

DO $fk_concil_cierres_hist$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.conciliacion_cierres_historial'::regclass
           AND conname = 'concil_cierres_hist_conciliacion_fkey'
    ) THEN
        ALTER TABLE public.conciliacion_cierres_historial
            ADD CONSTRAINT concil_cierres_hist_conciliacion_fkey
            FOREIGN KEY (empresa_id, conciliacion_id)
            REFERENCES public.conciliaciones_bancarias (empresa_id, id)
            ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.conciliacion_cierres_historial'::regclass
           AND conname = 'concil_cierres_hist_cuenta_fin_fkey'
    ) THEN
        ALTER TABLE public.conciliacion_cierres_historial
            ADD CONSTRAINT concil_cierres_hist_cuenta_fin_fkey
            FOREIGN KEY (empresa_id, cuenta_financiera_id)
            REFERENCES public.cuentas_financieras (empresa_id, id)
            ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.conciliacion_cierres_historial'::regclass
           AND conname = 'concil_cierres_hist_periodo_fkey'
    ) THEN
        ALTER TABLE public.conciliacion_cierres_historial
            ADD CONSTRAINT concil_cierres_hist_periodo_fkey
            FOREIGN KEY (empresa_id, periodo_id)
            REFERENCES public.periodos (empresa_id, id)
            ON DELETE RESTRICT;
    END IF;
END;
$fk_concil_cierres_hist$;

COMMENT ON TABLE public.conciliacion_cierres_historial IS 'Bitácora inmutable (append-only) de cierres y reaperturas de conciliación bancaria con snapshot SHA-256.';

-- 3. Trigger inmutable (permite solo vaciado/restauración B2 bajo app.restaurando_backup = 'true').
CREATE OR REPLACE FUNCTION public.fn_conciliacion_cierres_hist_inmutable()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.restaurando_backup', true) = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    RAISE EXCEPTION 'CONCILIACION_CIERRE_HISTORIAL_INMUTABLE: El historial de cierres y reaperturas bancarias es inmutable.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conciliacion_cierres_hist_inmutable ON public.conciliacion_cierres_historial;
CREATE TRIGGER trg_conciliacion_cierres_hist_inmutable
BEFORE UPDATE OR DELETE ON public.conciliacion_cierres_historial
FOR EACH ROW EXECUTE FUNCTION public.fn_conciliacion_cierres_hist_inmutable();

-- 4. RLS (ENABLE + FORCE) + política aislamiento_atlob + GRANT explícito.
DROP POLICY IF EXISTS aislamiento_atlob ON public.conciliacion_cierres_historial;
CREATE POLICY aislamiento_atlob ON public.conciliacion_cierres_historial
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
ALTER TABLE public.conciliacion_cierres_historial ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DO $grants_concil_v2_cierres$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'contabilidad_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.conciliacion_cierres_historial TO contabilidad_app;
    END IF;
END;
$grants_concil_v2_cierres$;

-- 5. Índices de consulta de cierres + índices aditivos Fase 5 (EXPLAIN) y [B-03] Fase 4.
CREATE INDEX IF NOT EXISTS idx_concil_cierres_hist_emp_cta_per_seq
    ON public.conciliacion_cierres_historial (empresa_id, cuenta_financiera_id, periodo_id, numero_secuencia DESC);

CREATE INDEX IF NOT EXISTS idx_concil_item_emp_grupo
    ON public.conciliacion_item (empresa_id, grupo_id);

CREATE INDEX IF NOT EXISTS idx_concil_grupo_emp_cta_est_created
    ON public.conciliacion_grupo (empresa_id, cuenta_financiera_id, estado, created_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cheques_bancarios_emp_mov_activo
    ON public.cheques_bancarios (empresa_id, movimiento_tesoreria_id)
    WHERE movimiento_tesoreria_id IS NOT NULL AND estado <> 'ANULADO';

CREATE UNIQUE INDEX IF NOT EXISTS uq_cheques_bancarios_emp_ext_activo
    ON public.cheques_bancarios (empresa_id, extracto_linea_id)
    WHERE extracto_linea_id IS NOT NULL AND estado <> 'ANULADO';
