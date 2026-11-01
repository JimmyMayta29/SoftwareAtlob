-- ============================================================================
-- FASE 5: MÓDULO PLANILLAS (TRABAJADORES, 5TA CATEGORÍA, GRATIFICACIONES,
-- CTS, LIQUIDACIÓN DE BENEFICIOS SOCIALES, PLAME Y T-REGISTRO)
-- Aislado estrictamente de las tablas y vistas de IGV-Renta (Tributos).
-- ============================================================================

-- 1. Extensión de columnas en trabajadores (Contratos, Cargas Familiares, Cese, EPS, CCI, Cifrado AES-256-GCM Ley 29733)
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS tipo_contrato VARCHAR(30) NOT NULL DEFAULT 'INDETERMINADO';
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS fecha_inicio_contrato DATE;
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS fecha_fin_contrato DATE;
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS cargas_familiares INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS motivo_cese VARCHAR(50);
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS cci_sueldo VARCHAR(30);
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS cuenta_banco_sueldo_cifrada TEXT;
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS cci_sueldo_cifrado TEXT;
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS afiliado_eps BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS remuneraciones_previas_anio NUMERIC(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS retenciones_previas_5ta_anio NUMERIC(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS deduccion_adicional_3uit NUMERIC(14,2) NOT NULL DEFAULT 0.00;

-- 2. Extensión de columnas en planilla_lineas (Horas extras 25%/35%, faltas, tardanzas, 5ta proyectada)
ALTER TABLE planilla_lineas ADD COLUMN IF NOT EXISTS horas_extras_25 NUMERIC(8,2) NOT NULL DEFAULT 0.00;
ALTER TABLE planilla_lineas ADD COLUMN IF NOT EXISTS horas_extras_35 NUMERIC(8,2) NOT NULL DEFAULT 0.00;
ALTER TABLE planilla_lineas ADD COLUMN IF NOT EXISTS monto_horas_extras_25 NUMERIC(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE planilla_lineas ADD COLUMN IF NOT EXISTS monto_horas_extras_35 NUMERIC(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE planilla_lineas ADD COLUMN IF NOT EXISTS dias_faltas INTEGER NOT NULL DEFAULT 0;
ALTER TABLE planilla_lineas ADD COLUMN IF NOT EXISTS minutos_tardanza INTEGER NOT NULL DEFAULT 0;
ALTER TABLE planilla_lineas ADD COLUMN IF NOT EXISTS descuento_faltas_tardanzas NUMERIC(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE planilla_lineas ADD COLUMN IF NOT EXISTS adelantos_prestamos NUMERIC(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE planilla_lineas ADD COLUMN IF NOT EXISTS bonificaciones_gravadas NUMERIC(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE planilla_lineas ADD COLUMN IF NOT EXISTS conceptos_no_gravados NUMERIC(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE planilla_lineas ADD COLUMN IF NOT EXISTS proyeccion_quinta_json JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3. Planilla de Gratificaciones Legales (Julio y Diciembre - Ley N° 27735 y Ley N° 30334)
CREATE TABLE IF NOT EXISTS planilla_gratificaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    periodo CHAR(7) NOT NULL,
    semestre VARCHAR(20) NOT NULL CHECK (semestre IN ('JULIO', 'DICIEMBRE')),
    trabajador_id UUID NOT NULL REFERENCES trabajadores(id) ON DELETE CASCADE,
    regimen_laboral VARCHAR(20) NOT NULL DEFAULT 'GENERAL',
    meses_computables INTEGER NOT NULL DEFAULT 6,
    dias_computables INTEGER NOT NULL DEFAULT 0,
    sueldo_computable NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    asignacion_familiar NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    promedio_variables NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    remuneracion_computable NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    gratificacion_ordinaria NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    tasa_bonif_extraordinaria NUMERIC(8,4) NOT NULL DEFAULT 0.0900,
    bonificacion_extraordinaria NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    retencion_quinta NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    descuento_adelantos NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    neto_pagar NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    centro_costo VARCHAR(50) NOT NULL DEFAULT 'ADMINISTRACION',
    asiento_id UUID REFERENCES asientos(id) ON DELETE SET NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'CALCULADA' CHECK (estado IN ('BORRADOR', 'CALCULADA', 'CONTABILIZADA', 'PAGADA')),
    usuario_id UUID REFERENCES usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_gratif_emp_per_trab UNIQUE (empresa_id, periodo, trabajador_id)
);

CREATE INDEX IF NOT EXISTS idx_planilla_gratificaciones_emp_per
    ON planilla_gratificaciones (empresa_id, periodo);

-- 4. Planilla y Depósito Semestral de CTS (Mayo y Noviembre - D.S. N° 001-97-TR)
CREATE TABLE IF NOT EXISTS planilla_cts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    periodo CHAR(7) NOT NULL,
    semestre VARCHAR(20) NOT NULL CHECK (semestre IN ('MAYO', 'NOVIEMBRE')),
    trabajador_id UUID NOT NULL REFERENCES trabajadores(id) ON DELETE CASCADE,
    regimen_laboral VARCHAR(20) NOT NULL DEFAULT 'GENERAL',
    meses_computables INTEGER NOT NULL DEFAULT 6,
    dias_computables INTEGER NOT NULL DEFAULT 0,
    sueldo_computable NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    asignacion_familiar NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    sexto_gratificacion NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    promedio_variables NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    remuneracion_computable NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    cts_depositada NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    banco_cts VARCHAR(50),
    cuenta_cts VARCHAR(50),
    centro_costo VARCHAR(50) NOT NULL DEFAULT 'ADMINISTRACION',
    asiento_id UUID REFERENCES asientos(id) ON DELETE SET NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'CALCULADA' CHECK (estado IN ('BORRADOR', 'CALCULADA', 'CONTABILIZADA', 'DEPOSITADA')),
    usuario_id UUID REFERENCES usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_cts_emp_per_trab UNIQUE (empresa_id, periodo, trabajador_id)
);

CREATE INDEX IF NOT EXISTS idx_planilla_cts_emp_per
    ON planilla_cts (empresa_id, periodo);

-- 5. Liquidaciones de Beneficios Sociales por Cese / Baja (CTS Trunca, Vacaciones Truncas, Gratificación Trunca)
CREATE TABLE IF NOT EXISTS liquidaciones_beneficios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    trabajador_id UUID NOT NULL REFERENCES trabajadores(id) ON DELETE CASCADE,
    periodo_cese CHAR(7) NOT NULL,
    fecha_ingreso DATE NOT NULL,
    fecha_cese DATE NOT NULL,
    motivo_cese VARCHAR(50) NOT NULL,
    regimen_laboral VARCHAR(20) NOT NULL DEFAULT 'GENERAL',
    remuneracion_computable NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    dias_trabajados_mes_cese INTEGER NOT NULL DEFAULT 0,
    remuneracion_proporcional_mes NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    cts_trunca_meses INTEGER NOT NULL DEFAULT 0,
    cts_trunca_dias INTEGER NOT NULL DEFAULT 0,
    cts_trunca_monto NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    vacaciones_truncas_meses INTEGER NOT NULL DEFAULT 0,
    vacaciones_truncas_dias INTEGER NOT NULL DEFAULT 0,
    vacaciones_truncas_monto NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    gratificacion_trunca_meses INTEGER NOT NULL DEFAULT 0,
    gratificacion_trunca_monto NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    bonif_extra_trunca_monto NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_bruto_beneficios NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    descuento_pension NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    retencion_quinta NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    otros_descuentos NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    aporte_essalud NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    neto_liquidacion NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    asiento_id UUID REFERENCES asientos(id) ON DELETE SET NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'EMITIDA' CHECK (estado IN ('BORRADOR', 'EMITIDA', 'CONTABILIZADA', 'PAGADA', 'ANULADA')),
    usuario_id UUID REFERENCES usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_liquidaciones_beneficios_emp_trab
    ON liquidaciones_beneficios (empresa_id, trabajador_id, periodo_cese);

-- 6. Bitácora de Movimientos T-Registro (Altas, Bajas y Modificaciones)
CREATE TABLE IF NOT EXISTS tregistro_movimientos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    trabajador_id UUID NOT NULL REFERENCES trabajadores(id) ON DELETE CASCADE,
    tipo_movimiento VARCHAR(20) NOT NULL CHECK (tipo_movimiento IN ('ALTA', 'BAJA', 'MODIFICACION')),
    fecha_efectiva DATE NOT NULL,
    motivo_baja VARCHAR(10),
    detalle_cambio TEXT,
    linea_estructura_txt TEXT NOT NULL,
    usuario_id UUID REFERENCES usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tregistro_movimientos_emp_fecha
    ON tregistro_movimientos (empresa_id, fecha_efectiva DESC);

-- 7. Row Level Security (RLS FORZADO) para Aislamiento Multiempresa en Planillas
ALTER TABLE trabajadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE trabajadores FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_trabajadores_empresa ON trabajadores;
CREATE POLICY rls_trabajadores_empresa ON trabajadores
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid)
    WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);

ALTER TABLE planillas ENABLE ROW LEVEL SECURITY;
ALTER TABLE planillas FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_planillas_empresa ON planillas;
CREATE POLICY rls_planillas_empresa ON planillas
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid)
    WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);

ALTER TABLE planilla_gratificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE planilla_gratificaciones FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_planilla_gratificaciones_empresa ON planilla_gratificaciones;
CREATE POLICY rls_planilla_gratificaciones_empresa ON planilla_gratificaciones
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid)
    WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);

ALTER TABLE planilla_cts ENABLE ROW LEVEL SECURITY;
ALTER TABLE planilla_cts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_planilla_cts_empresa ON planilla_cts;
CREATE POLICY rls_planilla_cts_empresa ON planilla_cts
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid)
    WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);

ALTER TABLE liquidaciones_beneficios ENABLE ROW LEVEL SECURITY;
ALTER TABLE liquidaciones_beneficios FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_liquidaciones_beneficios_empresa ON liquidaciones_beneficios;
CREATE POLICY rls_liquidaciones_beneficios_empresa ON liquidaciones_beneficios
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid)
    WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);

ALTER TABLE tregistro_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tregistro_movimientos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tregistro_movimientos_empresa ON tregistro_movimientos;
CREATE POLICY rls_tregistro_movimientos_empresa ON tregistro_movimientos
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid)
    WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);

-- 8. Bitácora de Auditoría por Empresa (Append-Only) y FORCE RLS en Asientos
CREATE TABLE IF NOT EXISTS auditoria_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES usuarios_estudio(id) ON DELETE SET NULL,
    tabla VARCHAR(60) NOT NULL,
    registro_id VARCHAR(64) NOT NULL,
    accion VARCHAR(20) NOT NULL CHECK (accion IN ('INSERT', 'UPDATE', 'DELETE', 'ANULAR', 'CIERRE_PERIODO', 'LOGIN', 'CONSULTA')),
    valores_anteriores JSONB,
    valores_nuevos JSONB,
    direccion_ip VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE auditoria_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_auditoria_log_empresa ON auditoria_log;
CREATE POLICY rls_auditoria_log_empresa ON auditoria_log
    USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid)
    WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);

ALTER TABLE asientos FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION fn_auditoria_log_inmutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'AUDITORIA_INMUTABLE: La bitácora de auditoría es estrictamente append-only. Se prohíbe UPDATE, DELETE o TRUNCATE.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auditoria_log_inmutable_row ON auditoria_log;
CREATE TRIGGER trg_auditoria_log_inmutable_row
BEFORE UPDATE OR DELETE ON auditoria_log
FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log_inmutable();

DROP TRIGGER IF EXISTS trg_auditoria_log_inmutable_stmt ON auditoria_log;
CREATE TRIGGER trg_auditoria_log_inmutable_stmt
BEFORE TRUNCATE ON auditoria_log
FOR EACH STATEMENT EXECUTE FUNCTION fn_auditoria_log_inmutable();


