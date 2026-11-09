-- =========================================================================
-- FASE 16: Columnas Normativas de Plan Contable y Cuentas Pendientes (Punto 1.1)
-- =========================================================================

-- 1. Ampliación de columnas en pcge_base
ALTER TABLE public.pcge_base
    ADD COLUMN IF NOT EXISTS estado_financiero VARCHAR(50),
    ADD COLUMN IF NOT EXISTS grupo_estado VARCHAR(50),
    ADD COLUMN IF NOT EXISTS funcion_resultado VARCHAR(30),
    ADD COLUMN IF NOT EXISTS exige_anexo BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS exige_documento BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS exige_centro_costo BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS exige_fecha_vencimiento BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cuenta_destino_debe VARCHAR(10),
    ADD COLUMN IF NOT EXISTS cuenta_destino_haber VARCHAR(10),
    ADD COLUMN IF NOT EXISTS estado_clasificacion VARCHAR(30) NOT NULL DEFAULT 'VALIDADO',
    ADD COLUMN IF NOT EXISTS origen VARCHAR(20) NOT NULL DEFAULT 'CATALOGO';

-- 2. Ampliación de columnas en plan_cuentas
ALTER TABLE public.plan_cuentas
    ADD COLUMN IF NOT EXISTS estado_financiero VARCHAR(50),
    ADD COLUMN IF NOT EXISTS grupo_estado VARCHAR(50),
    ADD COLUMN IF NOT EXISTS columna_hoja_trabajo VARCHAR(30) DEFAULT 'NO_APLICA',
    ADD COLUMN IF NOT EXISTS funcion_resultado VARCHAR(30),
    ADD COLUMN IF NOT EXISTS exige_anexo BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS exige_documento BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS exige_centro_costo BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS exige_fecha_vencimiento BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cuenta_destino_debe VARCHAR(10),
    ADD COLUMN IF NOT EXISTS cuenta_destino_haber VARCHAR(10),
    ADD COLUMN IF NOT EXISTS estado_clasificacion VARCHAR(30) NOT NULL DEFAULT 'VALIDADO',
    ADD COLUMN IF NOT EXISTS origen VARCHAR(20) NOT NULL DEFAULT 'CATALOGO';

-- 3. Mapeo inicial de estado_financiero = clasificacion_eeff
UPDATE public.pcge_base
SET estado_financiero = clasificacion_eeff
WHERE estado_financiero IS NULL;

UPDATE public.plan_cuentas
SET estado_financiero = clasificacion_eeff
WHERE estado_financiero IS NULL;

-- 4. Actualizar denominación oficial de la cuenta 19 según Resolución CNC (PCGE 2019 modificado 2020)
UPDATE public.pcge_base
SET denominacion = 'DETERIORO POR PÉRDIDA CREDITICIA ESPERADA O INCURRIDA'
WHERE codigo = '19';

UPDATE public.plan_cuentas
SET nombre = 'DETERIORO POR PÉRDIDA CREDITICIA ESPERADA O INCURRIDA'
WHERE codigo = '19';

-- 5. Restauración oficial de la subcuenta 196 (Activos del contrato) conforme a páginas 22 y 73 del PCGE
INSERT INTO public.pcge_base (
    codigo, denominacion, elemento, nivel, codigo_padre, tipo_cuenta,
    es_registro, clasificacion_eeff, estado_financiero, naturaleza_saldo,
    signo_eeff, es_correctora, columna_hoja_trabajo, estado_clasificacion, origen
)
VALUES (
    '196', 'Activos del contrato', '1', 3, '19', 'ACTIVO',
    FALSE, 'ACTIVO_CORRIENTE', 'ACTIVO_CORRIENTE', 'ACREEDORA',
    -1, TRUE, 'BALANCE', 'VALIDADO', 'CATALOGO'
)
ON CONFLICT (codigo) DO UPDATE
SET denominacion = EXCLUDED.denominacion,
    clasificacion_eeff = 'ACTIVO_CORRIENTE',
    estado_financiero = 'ACTIVO_CORRIENTE',
    naturaleza_saldo = 'ACREEDORA',
    signo_eeff = -1,
    es_correctora = TRUE,
    estado_clasificacion = 'VALIDADO';

-- 6. Clasificación específica de 1957 (Préstamos a largo plazo) en ACTIVO_NO_CORRIENTE
UPDATE public.pcge_base
SET clasificacion_eeff = 'ACTIVO_NO_CORRIENTE',
    estado_financiero = 'ACTIVO_NO_CORRIENTE'
WHERE codigo = '1957';

UPDATE public.plan_cuentas
SET clasificacion_eeff = 'ACTIVO_NO_CORRIENTE',
    estado_financiero = 'ACTIVO_NO_CORRIENTE'
WHERE codigo = '1957';

-- 7. Cuentas problemáticas: 70992, los 12 códigos de seis dígitos, 85, 86, 91, 92, 93
-- Quedan inactivas y bloqueadas para asientos hasta validación por el contador
UPDATE public.pcge_base
SET estado_clasificacion = 'PENDIENTE',
    es_registro = FALSE
WHERE codigo IN (
    '70992', '85', '86', '91', '92', '93',
    '655111', '655112', '655121', '655122', '655131', '655132',
    '655141', '655142', '655151', '655152', '655161', '655162'
);

UPDATE public.plan_cuentas
SET estado_clasificacion = 'PENDIENTE',
    permite_movimiento = FALSE,
    is_active = FALSE,
    es_inactiva = TRUE
WHERE codigo IN (
    '70992', '85', '86', '91', '92', '93',
    '655111', '655112', '655121', '655122', '655131', '655132',
    '655141', '655142', '655151', '655152', '655161', '655162'
);
