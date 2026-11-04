-- ============================================================================
-- Atlob Consultores ERP — Migración Fase 10: Datos Normativos SUNAT, PLE 5.x y PCGE
-- ============================================================================

-- 1. Ampliación normativa del Plan de Cuentas (PCGE)
ALTER TABLE plan_cuentas ADD COLUMN IF NOT EXISTS naturaleza VARCHAR(10) DEFAULT 'DEUDORA' CHECK (naturaleza IN ('DEUDORA', 'ACREEDORA'));
ALTER TABLE plan_cuentas ADD COLUMN IF NOT EXISTS moneda_cuenta VARCHAR(10) DEFAULT 'PEN' CHECK (moneda_cuenta IN ('PEN', 'USD', 'MULTI'));
ALTER TABLE plan_cuentas ADD COLUMN IF NOT EXISTS requiere_vencimiento BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Campos normativos en Cabecera de Asientos Contables
ALTER TABLE asientos ADD COLUMN IF NOT EXISTS cuo VARCHAR(40);
ALTER TABLE asientos ADD COLUMN IF NOT EXISTS fecha_documento DATE;
ALTER TABLE asientos ADD COLUMN IF NOT EXISTS codigo_libro VARCHAR(10) DEFAULT '050100';
ALTER TABLE asientos ADD COLUMN IF NOT EXISTS estado_operacion CHAR(1) DEFAULT '1' CHECK (estado_operacion IN ('1', '8', '9'));

-- Restricción de unicidad de CUO por empresa y período (cuando no es nulo)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_asiento_empresa_periodo_cuo'
    ) THEN
        ALTER TABLE asientos ADD CONSTRAINT uq_asiento_empresa_periodo_cuo UNIQUE (empresa_id, periodo_id, cuo);
    END IF;
END $$;

-- 3. Campos normativos en Detalle de Asientos Contables
ALTER TABLE asiento_detalle ADD COLUMN IF NOT EXISTS unidad_operacion VARCHAR(20);
ALTER TABLE asiento_detalle ADD COLUMN IF NOT EXISTS anexo_tipo_doc CHAR(1);
ALTER TABLE asiento_detalle ADD COLUMN IF NOT EXISTS anexo_num_doc VARCHAR(20);
ALTER TABLE asiento_detalle ADD COLUMN IF NOT EXISTS anexo_nombre VARCHAR(200);
ALTER TABLE asiento_detalle ADD COLUMN IF NOT EXISTS fecha_emision DATE;
ALTER TABLE asiento_detalle ADD COLUMN IF NOT EXISTS correlativo_ple VARCHAR(10);

-- 4. Actualización del trigger de inmutabilidad de asiento:
-- Un asiento CONTABILIZADO no puede cambiar su correlativo 'numero' ni su 'cuo'
CREATE OR REPLACE FUNCTION fn_inmutabilidad_asiento()
RETURNS TRIGGER AS $$
BEGIN
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
            -- Inmutabilidad de correlativo y CUO
            IF (OLD.numero IS NOT NULL AND NEW.numero <> OLD.numero) THEN
                RAISE EXCEPTION 'ASIENTO_INMUTABLE: Un asiento contabilizado nunca puede cambiar su correlativo oficial (% != %).', OLD.numero, NEW.numero;
            END IF;
            IF (OLD.cuo IS NOT NULL AND NEW.cuo <> OLD.cuo) THEN
                RAISE EXCEPTION 'ASIENTO_INMUTABLE: Un asiento contabilizado nunca puede cambiar su CUO oficial (% != %).', OLD.cuo, NEW.cuo;
            END IF;

            -- Solo se permite transición a ANULADO con su extorno vinculado
            IF NOT (NEW.estado = 'ANULADO' AND NEW.asiento_extorno_id IS NOT NULL) THEN
                RAISE EXCEPTION 'ASIENTO_INMUTABLE: Un asiento contabilizado es inmutable y solo puede ser anulado mediante extorno.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Actualización del trigger de validación de cuenta y requisitos en detalle de asiento
CREATE OR REPLACE FUNCTION fn_validar_cuenta_detalle()
RETURNS TRIGGER AS $$
DECLARE
    v_permite_movimiento BOOLEAN;
    v_requiere_anexo BOOLEAN;
    v_requiere_doc_ref BOOLEAN;
    v_requiere_centro_costo BOOLEAN;
    v_requiere_vencimiento BOOLEAN;
    v_is_active BOOLEAN;
    v_cuenta_empresa_id UUID;
BEGIN
    SELECT permite_movimiento, requiere_anexo, requiere_doc_ref, requiere_centro_costo, COALESCE(requiere_vencimiento, false), is_active, empresa_id
    INTO v_permite_movimiento, v_requiere_anexo, v_requiere_doc_ref, v_requiere_centro_costo, v_requiere_vencimiento, v_is_active, v_cuenta_empresa_id
    FROM plan_cuentas
    WHERE id = NEW.cuenta_id;

    -- Si la cuenta se encuentra en el plan de cuentas registrado:
    IF v_cuenta_empresa_id IS NOT NULL THEN
        IF v_cuenta_empresa_id <> NEW.empresa_id THEN
            RAISE EXCEPTION 'CUENTA_NO_PERTENECE: La cuenta contable no pertenece a la misma empresa.';
        END IF;

        IF NOT v_is_active THEN
            RAISE EXCEPTION 'CUENTA_INACTIVA: La cuenta contable especificada se encuentra inactiva.';
        END IF;

        IF NOT v_permite_movimiento THEN
            RAISE EXCEPTION 'CUENTA_NO_IMPUTABLE: La cuenta no permite movimientos (es cuenta de nivel título/mayor).';
        END IF;

        IF v_requiere_anexo AND NEW.anexo_id IS NULL AND (NEW.anexo_num_doc IS NULL OR NEW.anexo_num_doc = '') THEN
            RAISE EXCEPTION 'ANEXO_REQUERIDO: La cuenta contable exige indicar anexo (RUC/DNI del cliente, proveedor o trabajador).';
        END IF;

        IF v_requiere_doc_ref AND (NEW.doc_tipo IS NULL OR NEW.doc_numero IS NULL OR NEW.doc_numero = '') THEN
            RAISE EXCEPTION 'DOCUMENTO_REQUERIDO: La cuenta contable exige comprobante de pago de referencia (tipo y número).';
        END IF;

        IF v_requiere_centro_costo AND NEW.centro_costo_id IS NULL THEN
            RAISE EXCEPTION 'CENTRO_COSTO_REQUERIDO: La cuenta contable exige especificar centro de costo.';
        END IF;

        IF v_requiere_vencimiento AND NEW.fecha_vencimiento IS NULL THEN
            RAISE EXCEPTION 'VENCIMIENTO_REQUERIDO: La cuenta contable exige indicar fecha de vencimiento.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

