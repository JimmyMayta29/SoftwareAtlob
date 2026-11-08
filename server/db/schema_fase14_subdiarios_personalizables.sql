-- ============================================================================
-- FASE 14: SUBDIARIOS PERSONALIZABLES Y REGISTRO POR SUBDIARIO (BLOQUE A)
-- ============================================================================

-- 1. Ampliar columnas en la tabla subdiarios
ALTER TABLE public.subdiarios
  ADD COLUMN IF NOT EXISTS nombre VARCHAR(100),
  ADD COLUMN IF NOT EXISTS tipo_operacion VARCHAR(30),
  ADD COLUMN IF NOT EXISTS permite_asiento_manual BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cuenta_financiera_id UUID,
  ADD COLUMN IF NOT EXISTS es_sistema BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS orden INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS creado_por UUID,
  ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2. Poblar/Actualizar columnas para subdiarios preexistentes
UPDATE public.subdiarios
SET nombre = COALESCE(nombre, descripcion),
    activo = COALESCE(activo, is_active, true)
WHERE nombre IS NULL;

-- 4. Actualizar tipo_operacion, permite_asiento_manual, es_sistema y nombres normativos limpios
-- Subdiario 00: Apertura
UPDATE public.subdiarios
SET nombre = 'Apertura',
    tipo_operacion = 'APERTURA',
    permite_asiento_manual = true,
    es_sistema = true,
    orden = 0
WHERE codigo = '00';

-- Subdiario 01: Compras
UPDATE public.subdiarios
SET nombre = 'Registro de Compras (RCE)',
    tipo_operacion = 'COMPRAS',
    permite_asiento_manual = false,
    es_sistema = true,
    orden = 1
WHERE codigo = '01';

-- Subdiario 02: Ventas
UPDATE public.subdiarios
SET nombre = 'Registro de Ventas (RVIE)',
    tipo_operacion = 'VENTAS',
    permite_asiento_manual = false,
    es_sistema = true,
    orden = 2
WHERE codigo = '02';

-- Subdiario 03: Cobranzas y Caja
UPDATE public.subdiarios
SET nombre = 'Cobranzas y Caja',
    tipo_operacion = 'CAJA',
    permite_asiento_manual = false,
    es_sistema = true,
    orden = 3
WHERE codigo = '03';

-- Subdiario 04: Pagos a Proveedores
UPDATE public.subdiarios
SET nombre = 'Pagos a Proveedores',
    tipo_operacion = 'BANCO',
    permite_asiento_manual = false,
    es_sistema = true,
    orden = 4
WHERE codigo = '04';

-- Subdiario 05: Cuentas Corrientes y SPOT
UPDATE public.subdiarios
SET nombre = 'Cuentas Corrientes y SPOT',
    tipo_operacion = 'BANCO',
    permite_asiento_manual = false,
    es_sistema = true,
    orden = 5
WHERE codigo = '05';

-- Subdiario 06: Recibos por Honorarios
UPDATE public.subdiarios
SET nombre = 'Recibos por Honorarios',
    tipo_operacion = 'HONORARIOS',
    permite_asiento_manual = false,
    es_sistema = true,
    orden = 6
WHERE codigo = '06';

-- Subdiario 07: Planilla de Remuneraciones
UPDATE public.subdiarios
SET nombre = 'Planilla de Remuneraciones',
    tipo_operacion = 'PLANILLA',
    permite_asiento_manual = false,
    es_sistema = true,
    orden = 7
WHERE codigo = '07';

-- Subdiario 08: Ajustes (sin duplicar código en etiqueta)
UPDATE public.subdiarios
SET nombre = 'Ajustes',
    tipo_operacion = 'AJUSTES',
    permite_asiento_manual = true,
    es_sistema = true,
    orden = 8
WHERE codigo = '08';

-- Subdiario 09: Cierre del ejercicio (sin duplicar código en etiqueta)
UPDATE public.subdiarios
SET nombre = 'Cierre del ejercicio',
    tipo_operacion = 'CIERRE',
    permite_asiento_manual = true,
    es_sistema = true,
    orden = 9
WHERE codigo = '09';

-- Si aún no existe subdiario 10 Diario General para alguna empresa, se creará al inicializar empresa.
-- Si existe algún subdiario sin tipo_operacion asignado:
UPDATE public.subdiarios
SET tipo_operacion = 'DIARIO',
    permite_asiento_manual = true,
    es_sistema = false,
    orden = 10
WHERE tipo_operacion IS NULL;

-- 5. Restricción CHECK de tipo_operacion
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_subdiarios_tipo_operacion'
  ) THEN
    ALTER TABLE public.subdiarios
      ADD CONSTRAINT chk_subdiarios_tipo_operacion
      CHECK (tipo_operacion IN (
        'APERTURA', 'COMPRAS', 'VENTAS', 'PLANILLA', 'HONORARIOS',
        'CAJA', 'BANCO', 'DIARIO', 'PROVISIONES', 'AJUSTES', 'CIERRE'
      ));
  END IF;
END $$;

-- 6. Índice de búsqueda rápida por empresa y tipo_operacion
CREATE INDEX IF NOT EXISTS idx_subdiarios_empresa_tipo_operacion
  ON public.subdiarios(empresa_id, tipo_operacion)
  WHERE activo = true;
