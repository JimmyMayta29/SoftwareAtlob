-- ============================================================================
-- Migración Fase 20: Habilitación de Restauración Transaccional de Respaldo (Fase B2)
-- Permite que operaciones autorizadas con el flag de sesión app.restaurando_backup = 'true'
-- ejecuten la limpieza e inserción atómica de respaldos respetando la inmutabilidad
-- en operaciones contables ordinarias.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_check_periodo_abierto()
RETURNS TRIGGER AS $$
DECLARE
    v_estado_periodo VARCHAR(20);
BEGIN
    IF current_setting('app.restaurando_backup', true) = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT estado INTO v_estado_periodo
    FROM periodos
    WHERE id = COALESCE(NEW.periodo_id, OLD.periodo_id);

    IF v_estado_periodo = 'CERRADO' THEN
        RAISE EXCEPTION 'PERIODO_CERRADO: No se pueden realizar operaciones en un período contable cerrado.';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_inmutabilidad_asiento()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.restaurando_backup', true) = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.estado IN ('CONTABILIZADO', 'ANULADO') THEN
            RAISE EXCEPTION 'ASIENTO_INMUTABLE: Un asiento contabilizado o anulado no puede ser eliminado físicamente. Use anulación/extorno.';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.estado = 'ANULADO' THEN
            RAISE EXCEPTION 'ASIENTO_INMUTABLE: Un asiento anulado no puede ser modificado.';
        END IF;

        IF OLD.estado = 'CONTABILIZADO' THEN
            -- Solo se permite transición a ANULADO con sus campos respectivos
            IF NOT (NEW.estado = 'ANULADO' AND NEW.asiento_extorno_id IS NOT NULL) THEN
                RAISE EXCEPTION 'ASIENTO_INMUTABLE: Un asiento contabilizado es inmutable y solo puede ser anulado mediante extorno.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_inmutabilidad_asiento_detalle()
RETURNS TRIGGER AS $$
DECLARE
    v_estado_asiento VARCHAR(20);
BEGIN
    IF current_setting('app.restaurando_backup', true) = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT estado INTO v_estado_asiento
    FROM asientos
    WHERE id = COALESCE(NEW.asiento_id, OLD.asiento_id);

    IF v_estado_asiento IN ('CONTABILIZADO', 'ANULADO') THEN
        RAISE EXCEPTION 'DETALLE_INMUTABLE: No se puede modificar el detalle de un asiento contabilizado o anulado.';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
