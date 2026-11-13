-- ============================================================================
-- FASE 19: TABLAS PERSISTENTES DE KARDEX Y ACTIVOS FIJOS CON RLS
-- ============================================================================

-- 1. Catálogo de Artículos / Productos de Kardex
CREATE TABLE IF NOT EXISTS articulos_kardex (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    codigo_producto VARCHAR(50) NOT NULL,
    descripcion VARCHAR(255) NOT NULL,
    unidad_medida_sunat VARCHAR(10) NOT NULL DEFAULT 'NIU',
    tipo_existencia_sunat VARCHAR(10) NOT NULL DEFAULT '01',
    metodo_valuacion VARCHAR(30) NOT NULL DEFAULT 'PROMEDIO_PONDERADO' CHECK (metodo_valuacion IN ('PROMEDIO_PONDERADO', 'PEPS')),
    cuenta_existencias_pcge VARCHAR(20) NOT NULL DEFAULT '20111',
    cuenta_costo_ventas_pcge VARCHAR(20) NOT NULL DEFAULT '69111',
    cuenta_variacion_pcge VARCHAR(20) NOT NULL DEFAULT '6111',
    stock_actual NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    costo_unitario_actual NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    costo_total_valorado NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_articulos_kardex_empresa_codigo UNIQUE (empresa_id, codigo_producto)
);

CREATE INDEX IF NOT EXISTS idx_articulos_kardex_empresa ON articulos_kardex (empresa_id, codigo_producto);

-- 2. Movimientos Valorizados de Kardex
CREATE TABLE IF NOT EXISTS movimientos_kardex (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES articulos_kardex(id) ON DELETE CASCADE,
    periodo CHAR(7) NOT NULL,
    fecha DATE NOT NULL,
    tipo_comprobante_sunat VARCHAR(10),
    serie_comprobante VARCHAR(10),
    numero_comprobante VARCHAR(20),
    tipo_operacion_sunat VARCHAR(10) NOT NULL DEFAULT '01',
    cantidad_entrada NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    costo_unitario_entrada NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    costo_total_entrada NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    cantidad_salida NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    costo_unitario_salida NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    costo_total_salida NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    saldo_cantidad NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    saldo_costo_unitario NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    saldo_costo_total NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    glosa TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_movimientos_kardex_empresa_prod ON movimientos_kardex (empresa_id, producto_id, fecha);

-- 3. Activos Fijos y Depreciación
CREATE TABLE IF NOT EXISTS activos_fijos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    codigo_activo VARCHAR(50) NOT NULL,
    descripcion VARCHAR(255) NOT NULL,
    categoria VARCHAR(30) NOT NULL CHECK (categoria IN ('EDIFICIOS', 'VEHICULOS', 'MAQUINARIA', 'EQUIPOS_COMPUTO', 'MUEBLES_ENSERES', 'OTROS')),
    fecha_adquisicion DATE NOT NULL,
    fecha_inicio_uso DATE NOT NULL,
    moneda VARCHAR(3) NOT NULL DEFAULT 'PEN' CHECK (moneda IN ('PEN', 'USD')),
    valor_adquisicion NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    tipo_cambio NUMERIC(8, 4) NOT NULL DEFAULT 1.0000,
    valor_adquisicion_soles NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    vida_util_meses_financiera INTEGER NOT NULL DEFAULT 120,
    tasa_depreciacion_tributaria_anual NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
    cuenta_activo_pcge VARCHAR(20) NOT NULL DEFAULT '33611',
    cuenta_depreciacion_pcge VARCHAR(20) NOT NULL DEFAULT '39136',
    centro_costo VARCHAR(50) NOT NULL DEFAULT 'CC-OPERACIONES',
    depreciacion_acumulada_financiera NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    depreciacion_acumulada_tributaria NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    valor_neto_en_libros_financiero NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    valor_neto_en_libros_tributario NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'DEPRECIADO_TOTAL', 'BAJA')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_activos_fijos_empresa_codigo UNIQUE (empresa_id, codigo_activo)
);

CREATE INDEX IF NOT EXISTS idx_activos_fijos_empresa ON activos_fijos (empresa_id, codigo_activo);

-- 4. Aislamiento Multiempresa con Row Level Security (RLS)
DROP POLICY IF EXISTS aislamiento_atlob ON public.articulos_kardex;
DROP POLICY IF EXISTS rls_articulos_kardex ON public.articulos_kardex;
CREATE POLICY aislamiento_atlob ON public.articulos_kardex
  USING (empresa_id = NULLIF(COALESCE(current_setting('app.empresa_id', true), current_setting('app.current_empresa_id', true)), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(COALESCE(current_setting('app.empresa_id', true), current_setting('app.current_empresa_id', true)), '')::uuid);
ALTER TABLE public.articulos_kardex ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.movimientos_kardex;
DROP POLICY IF EXISTS rls_movimientos_kardex ON public.movimientos_kardex;
CREATE POLICY aislamiento_atlob ON public.movimientos_kardex
  USING (empresa_id = NULLIF(COALESCE(current_setting('app.empresa_id', true), current_setting('app.current_empresa_id', true)), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(COALESCE(current_setting('app.empresa_id', true), current_setting('app.current_empresa_id', true)), '')::uuid);
ALTER TABLE public.movimientos_kardex ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.activos_fijos;
DROP POLICY IF EXISTS rls_activos_fijos ON public.activos_fijos;
CREATE POLICY aislamiento_atlob ON public.activos_fijos
  USING (empresa_id = NULLIF(COALESCE(current_setting('app.empresa_id', true), current_setting('app.current_empresa_id', true)), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(COALESCE(current_setting('app.empresa_id', true), current_setting('app.current_empresa_id', true)), '')::uuid);
ALTER TABLE public.activos_fijos ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

-- 5. Actualización permanente de restricción de tipos de subdiario
ALTER TABLE public.subdiarios DROP CONSTRAINT IF EXISTS subdiarios_tipo_check;
ALTER TABLE public.subdiarios ADD CONSTRAINT subdiarios_tipo_check
  CHECK (tipo IN (
    'APERTURA', 'COMPRAS', 'VENTAS', 'COBRANZAS', 'PAGOS', 'BANCOS', 'BANCO',
    'CAJA', 'PLANILLA', 'HONORARIOS', 'DIARIO', 'PROVISIONES', 'AJUSTES', 'DESTINO', 'CIERRE'
  ));
