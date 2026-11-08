-- =========================================================================
-- FASE 13: Catálogo Base Oficial PCGE y Ampliación Normativa de plan_cuentas
-- =========================================================================

-- 1. Catálogo Base Compartido (Global, sin empresa_id)
CREATE TABLE IF NOT EXISTS pcge_base (
    codigo VARCHAR(10) PRIMARY KEY,
    denominacion VARCHAR(250) NOT NULL,
    elemento CHAR(1) NOT NULL,
    nivel SMALLINT NOT NULL CHECK (nivel BETWEEN 1 AND 8),
    codigo_padre VARCHAR(10),
    tipo_cuenta VARCHAR(20) NOT NULL,
    es_registro BOOLEAN NOT NULL DEFAULT FALSE,
    clasificacion_eeff VARCHAR(50) NOT NULL DEFAULT 'NO_APLICA',
    naturaleza_saldo VARCHAR(20) NOT NULL CHECK (naturaleza_saldo IN ('DEUDORA', 'ACREEDORA', 'MIXTA')),
    signo_eeff SMALLINT NOT NULL DEFAULT 1 CHECK (signo_eeff IN (1, -1)),
    es_correctora BOOLEAN NOT NULL DEFAULT FALSE,
    columna_hoja_trabajo VARCHAR(50) DEFAULT 'NO_APLICA',
    cuenta_cierre_relacionada VARCHAR(10),
    version_normativa VARCHAR(50) NOT NULL DEFAULT 'PCGE_2019_MOD_2020',
    creada_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pcge_base_padre ON pcge_base (codigo_padre);
CREATE INDEX IF NOT EXISTS idx_pcge_base_elemento ON pcge_base (elemento);
CREATE INDEX IF NOT EXISTS idx_pcge_base_registro ON pcge_base (es_registro);

-- 2. Ampliación de columnas normativas en la tabla plan_cuentas por empresa
ALTER TABLE plan_cuentas
    ADD COLUMN IF NOT EXISTS es_registro BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS clasificacion_eeff VARCHAR(50) NOT NULL DEFAULT 'NO_APLICA',
    ADD COLUMN IF NOT EXISTS naturaleza_saldo VARCHAR(20) NOT NULL DEFAULT 'DEUDORA',
    ADD COLUMN IF NOT EXISTS signo_eeff SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS cuenta_cierre_relacionada VARCHAR(10),
    ADD COLUMN IF NOT EXISTS es_correctora BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS es_inactiva BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Sincronización de datos existentes en plan_cuentas
UPDATE plan_cuentas
SET es_registro = permite_movimiento,
    es_inactiva = NOT is_active
WHERE es_registro IS DISTINCT FROM permite_movimiento OR es_inactiva IS DISTINCT FROM (NOT is_active);

-- Asignar naturaleza y correctoras según reglas contables del PCGE
UPDATE plan_cuentas
SET es_correctora = TRUE,
    signo_eeff = -1,
    naturaleza_saldo = 'ACREEDORA',
    clasificacion_eeff = 'ACTIVO_CORRIENTE'
WHERE (codigo LIKE '19%' OR codigo LIKE '29%');

UPDATE plan_cuentas
SET es_correctora = TRUE,
    signo_eeff = -1,
    naturaleza_saldo = 'ACREEDORA',
    clasificacion_eeff = 'ACTIVO_NO_CORRIENTE'
WHERE (codigo LIKE '36%' OR codigo LIKE '39%');
