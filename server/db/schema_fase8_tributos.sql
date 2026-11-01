-- ============================================================================
-- FASE 4: MÓDULO TRIBUTOS (DECLARACIONES SEPARADAS Y CRONOGRAMA VERSIONADO)
-- ============================================================================

-- 1. Extensión de columnas en cronograma_vencimientos (versionado y obligaciones anuales)
ALTER TABLE cronograma_vencimientos ADD COLUMN IF NOT EXISTS anio INTEGER DEFAULT 2026;
ALTER TABLE cronograma_vencimientos ADD COLUMN IF NOT EXISTS fecha_vencimiento_daot DATE;
ALTER TABLE cronograma_vencimientos ADD COLUMN IF NOT EXISTS fecha_vencimiento_renta_anual DATE;
ALTER TABLE cronograma_vencimientos ADD COLUMN IF NOT EXISTS fuente_resolucion VARCHAR(120) DEFAULT 'R.S. SUNAT — Cronograma de Obligaciones';
ALTER TABLE cronograma_vencimientos ADD COLUMN IF NOT EXISTS es_supuesto_validar BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE cronograma_vencimientos ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cronograma_vencimientos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2. Declaración Mensual IGV-Renta (PDT 621) con estados y rectificatorias versionadas
CREATE TABLE IF NOT EXISTS declaraciones_pdt621 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    periodo CHAR(7) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    es_rectificatoria BOOLEAN NOT NULL DEFAULT FALSE,
    declaracion_anterior_id UUID REFERENCES declaraciones_pdt621(id) ON DELETE SET NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR', 'PRELIQUIDADO', 'PRESENTADO', 'SUSTITUIDA')),
    numero_orden VARCHAR(40),
    fecha_presentacion DATE,
    asiento_determinacion_id UUID REFERENCES asientos(id) ON DELETE SET NULL,
    regimen_aplicado VARCHAR(30) NOT NULL,
    tasa_igv NUMERIC(8,4) NOT NULL DEFAULT 0.1800,
    tasa_renta_aplicada NUMERIC(8,4) NOT NULL DEFAULT 0.0100,
    usa_prorrata BOOLEAN NOT NULL DEFAULT FALSE,
    porcentaje_prorrata NUMERIC(8,4) NOT NULL DEFAULT 100.0000,
    debito_fiscal NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    credito_fiscal_gravado NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    credito_fiscal_mixto_bruto NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    credito_fiscal_mixto_admitido NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    igv_no_admitido_gasto NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    credito_fiscal_total NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    saldo_favor_anterior NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    retenciones_igv NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    percepciones_igv NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    igv_a_pagar NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    saldo_favor_proximo_mes NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    base_imponible_renta NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    pago_a_cuenta_renta NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    casillas_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    detalle_calculo_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    usuario_id UUID REFERENCES usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pdt621_empresa_periodo_version UNIQUE (empresa_id, periodo, version)
);

CREATE INDEX IF NOT EXISTS idx_declaraciones_pdt621_empresa_periodo
    ON declaraciones_pdt621 (empresa_id, periodo, version DESC);

-- 3. Declaración y Cálculo de Prorrata del Crédito Fiscal IGV (Art. 23 LIGV / Art. 6 num. 6 Regl.)
CREATE TABLE IF NOT EXISTS declaraciones_prorrata_igv (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    periodo CHAR(7) NOT NULL,
    ventas_gravadas_mes NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    exportaciones_mes NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    ventas_no_gravadas_mes NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    ventas_gravadas_12m NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    exportaciones_12m NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    ventas_no_gravadas_12m NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    coeficiente_prorrata NUMERIC(8,4) NOT NULL DEFAULT 1.0000,
    porcentaje_prorrata NUMERIC(8,2) NOT NULL DEFAULT 100.00,
    igv_destino_comun NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    credito_fiscal_admitido NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    igv_costo_gasto_64111 NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    integrar_en_pdt621 BOOLEAN NOT NULL DEFAULT TRUE,
    es_regularizacion_anual BOOLEAN NOT NULL DEFAULT FALSE,
    asiento_ajuste_id UUID REFERENCES asientos(id) ON DELETE SET NULL,
    usuario_id UUID REFERENCES usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_prorrata_empresa_periodo UNIQUE (empresa_id, periodo)
);

-- 4. Declaración Jurada Anual del Impuesto a la Renta 3ra Categoría (Papeles de Trabajo)
CREATE TABLE IF NOT EXISTS declaraciones_renta_anual (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    anio INTEGER NOT NULL,
    regimen VARCHAR(30) NOT NULL,
    uit_aplicada NUMERIC(12,2) NOT NULL DEFAULT 5500.00,
    utilidad_contable NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    total_adiciones NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    total_deducciones NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    renta_neta_antes_perdidas NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    sistema_compensacion_perdidas VARCHAR(15) NOT NULL DEFAULT 'SISTEMA_A' CHECK (sistema_compensacion_perdidas IN ('SISTEMA_A', 'SISTEMA_B')),
    perdida_arrastrable_declarada NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    perdida_compensada_ejercicio NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    renta_neta_imponible NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    impuesto_renta_calculado NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    pagos_a_cuenta_mensuales NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    saldo_favor_anterior NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    itan_pagado NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    saldo_por_regularizar NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    saldo_a_favor_contribuyente NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    reparos_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    estado VARCHAR(20) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR', 'CERRADO')),
    usuario_id UUID REFERENCES usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_renta_anual_empresa_anio UNIQUE (empresa_id, anio)
);

-- 5. Depuración y Motivos de Exclusión de Operaciones con Terceros (DAOT - PDT 3500)
CREATE TABLE IF NOT EXISTS daot_exclusiones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    anio INTEGER NOT NULL,
    tipo_operacion VARCHAR(15) NOT NULL CHECK (tipo_operacion IN ('COMPRA', 'VENTA')),
    ruc_tercero VARCHAR(15) NOT NULL,
    comprobante_id VARCHAR(80),
    motivo_exclusion TEXT NOT NULL,
    usuario_id UUID REFERENCES usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daot_exclusiones_empresa_anio
    ON daot_exclusiones (empresa_id, anio, tipo_operacion, ruc_tercero);
