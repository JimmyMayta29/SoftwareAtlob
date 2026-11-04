-- ============================================================================
-- Atlob Consultores ERP — Automatización de Asientos y Consolidación Mensual (Fase 11)
-- ============================================================================

-- 1. Agregar campo metodo_inventario en empresas (sin default para exigir asignación)
ALTER TABLE empresas 
ADD COLUMN IF NOT EXISTS metodo_inventario VARCHAR(20) 
CHECK (metodo_inventario IN ('PERIODICO', 'PERMANENTE'));

-- 2. Tabla para registro y control de Consolidaciones Mensuales
CREATE TABLE IF NOT EXISTS consolidaciones_mensuales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    periodo_id VARCHAR(20) NOT NULL,
    metodo_inventario VARCHAR(20) NOT NULL CHECK (metodo_inventario IN ('PERIODICO', 'PERMANENTE')),
    estado VARCHAR(20) NOT NULL DEFAULT 'CONTABILIZADO' CHECK (estado IN ('CONTABILIZADO', 'EXTORNADO')),
    total_asientos INTEGER NOT NULL DEFAULT 0,
    resumen JSONB NOT NULL DEFAULT '{}',
    clave_consolidacion VARCHAR(100) NOT NULL,
    usuario_id UUID NOT NULL REFERENCES usuarios_estudio(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_consolidacion_empresa_periodo UNIQUE (empresa_id, periodo_id, clave_consolidacion)
);

-- 3. Trigger para validar que los asientos automáticos o de consolidación requieran método de inventario
CREATE OR REPLACE FUNCTION fn_check_metodo_inventario_asiento_automatico()
RETURNS TRIGGER AS $$
DECLARE
    v_metodo VARCHAR(20);
BEGIN
    IF NEW.origen IN ('AUTOMATICO', 'CONSOLIDACION') THEN
        SELECT metodo_inventario INTO v_metodo
        FROM empresas
        WHERE id = NEW.empresa_id;

        IF v_metodo IS NULL THEN
            RAISE EXCEPTION 'METODO_INVENTARIO_REQUERIDO: La empresa no tiene definido un método de inventario (PERIODICO o PERMANENTE). Debe ser configurado por un Administrador del estudio antes de generar asientos automáticos.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asiento_check_metodo_inventario ON asientos;
CREATE TRIGGER trg_asiento_check_metodo_inventario
BEFORE INSERT OR UPDATE ON asientos
FOR EACH ROW EXECUTE FUNCTION fn_check_metodo_inventario_asiento_automatico();
