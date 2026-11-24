-- ============================================================================
-- FASE 23 — Conciliación Bancaria V2: Importación de Extractos, Capa Raw Inmutable,
--           Perfiles Bancarios y Reglas de Clasificación
-- ============================================================================
-- Versión mínima de PostgreSQL requerida: 15
--   (por la sintaxis de lista de columnas en `ON DELETE SET NULL (columna)`
--    en las FKs compuestas por empresa_id).
--
-- Notas de diseño:
-- 1. Migración 100% aditiva e idempotente. No realiza DROP, RENAME ni alteración
--    de tipos en tablas o columnas existentes.
-- 2. Regla d: antes de crear FKs compuestas (empresa_id, id) hacia tablas
--    existentes, se crean restricciones UNIQUE (empresa_id, id) condicionales
--    con nombre propio sin asumir scripts externos fk_empresa_*.sql.
-- 3. public.extracto_linea_raw es append-only / inmutable en operación normal
--    (trigger BEFORE UPDATE OR DELETE). Solo permite limpieza transaccional
--    cuando app.restaurando_backup = 'true' (restauración autorizada B2).
-- 4. Todas las tablas nuevas habilitan RLS (ENABLE + FORCE) con política
--    aislamiento_atlob y GRANT explícito idempotente a contabilidad_app.
-- ============================================================================

-- 1. Regla d: UNIQUE (empresa_id, id) condicionales con nombre propio antes de FKs compuestas.
DO $uq_cuentas_financieras$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.cuentas_financieras'::regclass
           AND conname = 'uq_cuentas_financieras_empresa_id_id'
    ) THEN
        ALTER TABLE public.cuentas_financieras
            ADD CONSTRAINT uq_cuentas_financieras_empresa_id_id UNIQUE (empresa_id, id);
    END IF;
END;
$uq_cuentas_financieras$;

DO $uq_extractos_bancarios$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.extractos_bancarios'::regclass
           AND conname = 'uq_extractos_bancarios_empresa_id_id'
    ) THEN
        ALTER TABLE public.extractos_bancarios
            ADD CONSTRAINT uq_extractos_bancarios_empresa_id_id UNIQUE (empresa_id, id);
    END IF;
END;
$uq_extractos_bancarios$;

-- 2. Tabla public.conciliacion_perfiles_banco.
CREATE TABLE IF NOT EXISTS public.conciliacion_perfiles_banco (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    codigo VARCHAR(50) NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    banco VARCHAR(80) NOT NULL,
    formato VARCHAR(20) NOT NULL CHECK (formato IN ('XLSX', 'CSV', 'TXT', 'PDF')),
    delimitador VARCHAR(5),
    codificacion VARCHAR(20) NOT NULL DEFAULT 'UTF-8',
    fila_encabezado INTEGER NOT NULL DEFAULT 1 CHECK (fila_encabezado BETWEEN 1 AND 200),
    formato_fecha VARCHAR(30) NOT NULL DEFAULT 'DD/MM/YYYY',
    separador_decimal VARCHAR(1) NOT NULL DEFAULT '.' CHECK (separador_decimal IN ('.', ',')),
    mapeo_columnas_json JSONB NOT NULL,
    es_sistema BOOLEAN NOT NULL DEFAULT FALSE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_concil_perfil_emp_codigo UNIQUE (empresa_id, codigo),
    CONSTRAINT uq_concil_perfil_empresa_id_id UNIQUE (empresa_id, id)
);

COMMENT ON TABLE public.conciliacion_perfiles_banco IS 'Perfiles declarativos de parseo de extractos bancarios por empresa y banco.';

-- 3. Tabla public.conciliacion_reglas_clasificacion.
CREATE TABLE IF NOT EXISTS public.conciliacion_reglas_clasificacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nombre VARCHAR(120) NOT NULL,
    banco VARCHAR(80),
    tipo_clasificacion VARCHAR(40) NOT NULL CHECK (
        tipo_clasificacion IN (
            'ITF',
            'COMISION_BANCARIA',
            'MANTENIMIENTO',
            'INTERES_GASTO',
            'INTERES_INGRESO',
            'DETRACCION',
            'TRIBUTO_SUNAT',
            'AFP_ONP_ESSALUD',
            'PLANILLA',
            'CHEQUE',
            'TRANSFERENCIA',
            'OTRO'
        )
    ),
    patron_texto VARCHAR(200) NOT NULL,
    tipo_coincidencia VARCHAR(20) NOT NULL DEFAULT 'CONTIENE' CHECK (
        tipo_coincidencia IN ('CONTIENE', 'PREFIJO', 'PALABRAS_CLAVE')
    ),
    sentido_monto VARCHAR(10) NOT NULL DEFAULT 'AMBOS' CHECK (
        sentido_monto IN ('CARGO', 'ABONO', 'AMBOS')
    ),
    prioridad INTEGER NOT NULL DEFAULT 100 CHECK (prioridad BETWEEN 1 AND 1000),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_concil_regla_clasif_emp_nombre UNIQUE (empresa_id, nombre)
);

COMMENT ON TABLE public.conciliacion_reglas_clasificacion IS 'Reglas configurables por empresa para clasificar líneas bancarias importadas.';

-- 4. Tabla public.extracto_import.
CREATE TABLE IF NOT EXISTS public.extracto_import (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    cuenta_financiera_id UUID NOT NULL,
    extracto_bancario_id UUID,
    perfil_banco_id UUID,
    banco_perfil_codigo VARCHAR(50),
    nombre_archivo VARCHAR(255) NOT NULL,
    formato_archivo VARCHAR(10) NOT NULL CHECK (formato_archivo IN ('XLSX', 'CSV', 'TXT', 'PDF')),
    content_type_declarado VARCHAR(120),
    tamano_bytes INTEGER NOT NULL CHECK (tamano_bytes > 0),
    hash_archivo VARCHAR(64) NOT NULL,
    periodo VARCHAR(7),
    fecha_desde DATE NOT NULL,
    fecha_hasta DATE NOT NULL,
    saldo_inicial NUMERIC(14, 2) NOT NULL,
    total_abonos NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_cargos NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    saldo_final NUMERIC(14, 2) NOT NULL,
    total_filas_archivo INTEGER NOT NULL DEFAULT 0,
    filas_nuevas INTEGER NOT NULL DEFAULT 0,
    filas_duplicadas INTEGER NOT NULL DEFAULT 0,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'REVERTIDO')),
    motivo_reversion TEXT,
    revertido_por UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    revertido_en TIMESTAMPTZ,
    usuario_id UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_extracto_import_empresa_id_id UNIQUE (empresa_id, id)
);

DO $fk_extracto_import$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.extracto_import'::regclass
           AND conname = 'extracto_import_cuenta_financiera_fkey'
    ) THEN
        ALTER TABLE public.extracto_import
            ADD CONSTRAINT extracto_import_cuenta_financiera_fkey
            FOREIGN KEY (empresa_id, cuenta_financiera_id)
            REFERENCES public.cuentas_financieras (empresa_id, id)
            ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.extracto_import'::regclass
           AND conname = 'extracto_import_extracto_bancario_fkey'
    ) THEN
        -- Requiere PostgreSQL >= 15 por ON DELETE SET NULL (extracto_bancario_id).
        ALTER TABLE public.extracto_import
            ADD CONSTRAINT extracto_import_extracto_bancario_fkey
            FOREIGN KEY (empresa_id, extracto_bancario_id)
            REFERENCES public.extractos_bancarios (empresa_id, id)
            ON DELETE SET NULL (extracto_bancario_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.extracto_import'::regclass
           AND conname = 'extracto_import_perfil_banco_fkey'
    ) THEN
        -- Requiere PostgreSQL >= 15 por ON DELETE SET NULL (perfil_banco_id).
        ALTER TABLE public.extracto_import
            ADD CONSTRAINT extracto_import_perfil_banco_fkey
            FOREIGN KEY (empresa_id, perfil_banco_id)
            REFERENCES public.conciliacion_perfiles_banco (empresa_id, id)
            ON DELETE SET NULL (perfil_banco_id);
    END IF;
END;
$fk_extracto_import$;

COMMENT ON TABLE public.extracto_import IS 'Cabecera auditable de cada importación de extracto bancario V2 y trazabilidad de reversión.';

-- 5. Tabla public.extracto_linea_raw (INMUTABLE).
CREATE TABLE IF NOT EXISTS public.extracto_linea_raw (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    import_id UUID NOT NULL,
    num_fila INTEGER NOT NULL CHECK (num_fila >= 1),
    raw_json JSONB NOT NULL,
    hash_linea VARCHAR(64) NOT NULL,
    fue_duplicada BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_extracto_linea_raw_empresa_id_id UNIQUE (empresa_id, id),
    CONSTRAINT uq_extracto_linea_raw_imp_fila UNIQUE (empresa_id, import_id, num_fila)
);

DO $fk_extracto_linea_raw$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.extracto_linea_raw'::regclass
           AND conname = 'extracto_linea_raw_import_fkey'
    ) THEN
        ALTER TABLE public.extracto_linea_raw
            ADD CONSTRAINT extracto_linea_raw_import_fkey
            FOREIGN KEY (empresa_id, import_id)
            REFERENCES public.extracto_import (empresa_id, id)
            ON DELETE RESTRICT;
    END IF;
END;
$fk_extracto_linea_raw$;

CREATE OR REPLACE FUNCTION public.fn_extracto_linea_raw_inmutable()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.restaurando_backup', true) = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    RAISE EXCEPTION 'EXTRACTO_LINEA_RAW_INMUTABLE: La capa raw del extracto es inmutable.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_extracto_linea_raw_inmutable ON public.extracto_linea_raw;
CREATE TRIGGER trg_extracto_linea_raw_inmutable
BEFORE UPDATE OR DELETE ON public.extracto_linea_raw
FOR EACH ROW EXECUTE FUNCTION public.fn_extracto_linea_raw_inmutable();

COMMENT ON TABLE public.extracto_linea_raw IS 'Capa raw inmutable (append-only) con las filas originales importadas del extracto bancario.';

-- 6. Columnas aditivas, FKs compuestas e índices en public.extracto_lineas e índices de apoyo.
ALTER TABLE public.extracto_lineas
    ADD COLUMN IF NOT EXISTS import_id UUID,
    ADD COLUMN IF NOT EXISTS linea_raw_id UUID,
    ADD COLUMN IF NOT EXISTS tipo_clasificacion VARCHAR(40),
    ADD COLUMN IF NOT EXISTS ruc_extraido VARCHAR(11),
    ADD COLUMN IF NOT EXISTS contraparte_extraida VARCHAR(160),
    ADD COLUMN IF NOT EXISTS doc_extraido VARCHAR(40);

DO $chk_fk_extracto_lineas$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.extracto_lineas'::regclass
           AND conname = 'chk_extracto_lineas_tipo_clasificacion'
    ) THEN
        ALTER TABLE public.extracto_lineas
            ADD CONSTRAINT chk_extracto_lineas_tipo_clasificacion
            CHECK (
                tipo_clasificacion IS NULL OR tipo_clasificacion IN (
                    'ITF',
                    'COMISION_BANCARIA',
                    'MANTENIMIENTO',
                    'INTERES_GASTO',
                    'INTERES_INGRESO',
                    'DETRACCION',
                    'TRIBUTO_SUNAT',
                    'AFP_ONP_ESSALUD',
                    'PLANILLA',
                    'CHEQUE',
                    'TRANSFERENCIA',
                    'OTRO'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.extracto_lineas'::regclass
           AND conname = 'extracto_lineas_import_id_fkey'
    ) THEN
        -- Requiere PostgreSQL >= 15 por ON DELETE SET NULL (import_id).
        ALTER TABLE public.extracto_lineas
            ADD CONSTRAINT extracto_lineas_import_id_fkey
            FOREIGN KEY (empresa_id, import_id)
            REFERENCES public.extracto_import (empresa_id, id)
            ON DELETE SET NULL (import_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.extracto_lineas'::regclass
           AND conname = 'extracto_lineas_linea_raw_id_fkey'
    ) THEN
        -- Requiere PostgreSQL >= 15 por ON DELETE SET NULL (linea_raw_id).
        ALTER TABLE public.extracto_lineas
            ADD CONSTRAINT extracto_lineas_linea_raw_id_fkey
            FOREIGN KEY (empresa_id, linea_raw_id)
            REFERENCES public.extracto_linea_raw (empresa_id, id)
            ON DELETE SET NULL (linea_raw_id);
    END IF;
END;
$chk_fk_extracto_lineas$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_extracto_lineas_emp_hash_activo
    ON public.extracto_lineas (empresa_id, hash_linea)
    WHERE hash_linea IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_extracto_import_emp_cta_est_fecha
    ON public.extracto_import (empresa_id, cuenta_financiera_id, estado, fecha_hasta DESC);

CREATE INDEX IF NOT EXISTS idx_extracto_lineas_emp_import
    ON public.extracto_lineas (empresa_id, import_id);

CREATE INDEX IF NOT EXISTS idx_extracto_linea_raw_emp_imp_fila
    ON public.extracto_linea_raw (empresa_id, import_id, num_fila);

CREATE INDEX IF NOT EXISTS idx_concil_perfiles_emp_activo
    ON public.conciliacion_perfiles_banco (empresa_id, activo);

CREATE INDEX IF NOT EXISTS idx_concil_reglas_clasif_emp_prio
    ON public.conciliacion_reglas_clasificacion (empresa_id, activo, prioridad);

-- 7. RLS (ENABLE + FORCE) + política aislamiento_atlob + GRANTs en las 4 tablas nuevas.
DROP POLICY IF EXISTS aislamiento_atlob ON public.conciliacion_perfiles_banco;
CREATE POLICY aislamiento_atlob ON public.conciliacion_perfiles_banco
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
ALTER TABLE public.conciliacion_perfiles_banco ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.conciliacion_reglas_clasificacion;
CREATE POLICY aislamiento_atlob ON public.conciliacion_reglas_clasificacion
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
ALTER TABLE public.conciliacion_reglas_clasificacion ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.extracto_import;
CREATE POLICY aislamiento_atlob ON public.extracto_import
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
ALTER TABLE public.extracto_import ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.extracto_linea_raw;
CREATE POLICY aislamiento_atlob ON public.extracto_linea_raw
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
ALTER TABLE public.extracto_linea_raw ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DO $grants_concil_v2_import$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'contabilidad_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.conciliacion_perfiles_banco TO contabilidad_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.conciliacion_reglas_clasificacion TO contabilidad_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.extracto_import TO contabilidad_app;
        GRANT SELECT, INSERT ON public.extracto_linea_raw TO contabilidad_app;
    END IF;
END;
$grants_concil_v2_import$;
