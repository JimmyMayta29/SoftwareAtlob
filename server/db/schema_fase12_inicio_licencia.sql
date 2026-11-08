-- Inicio simplificado, política de segundo factor del estudio y licencia local de evaluación.
ALTER TABLE estudio_configuracion
    ADD COLUMN IF NOT EXISTS mfa_requerido BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE estudio_configuracion
    ALTER COLUMN ruc_estudio DROP NOT NULL,
    ALTER COLUMN email_contacto DROP NOT NULL,
    ALTER COLUMN telefono_contacto DROP NOT NULL;

UPDATE estudio_configuracion
SET mfa_requerido = EXISTS (
    SELECT 1
    FROM usuarios_estudio
    WHERE rol_global = 'ADMINISTRADOR'
      AND is_active = TRUE
      AND mfa_activado = TRUE
);

ALTER TABLE auditoria DROP CONSTRAINT IF EXISTS auditoria_accion_check;
ALTER TABLE auditoria ADD CONSTRAINT auditoria_accion_check
    CHECK (accion IN ('INSERT', 'UPDATE', 'DELETE', 'ANULAR', 'CIERRE_PERIODO', 'LOGIN', 'MFA_ACTIVADO', 'MFA_DESACTIVADO'));

CREATE TABLE IF NOT EXISTS licencia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('EVALUACION', 'COMERCIAL')),
    max_usuarios INTEGER NOT NULL CHECK (max_usuarios >= 1),
    vigente_hasta TIMESTAMPTZ,
    creada_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_licencia_instalacion ON licencia ((TRUE));

INSERT INTO licencia (tipo, max_usuarios)
SELECT 'EVALUACION', 3
WHERE EXISTS (SELECT 1 FROM estudio_configuracion WHERE id = TRUE)
ON CONFLICT DO NOTHING;

