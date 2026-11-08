-- ============================================================================
-- FASE 15: ANÁLISIS DE CUENTAS Y AUDITORÍA CONTABLE (BLOQUE E)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.marcas_analisis_cuenta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    asiento_id UUID NOT NULL,
    linea_id UUID,
    estado_revision VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_revision IN ('REVISADO', 'OBSERVADO', 'PENDIENTE')),
    comentario TEXT,
    usuario_id UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    usuario_nombre VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT marcas_analisis_cuenta_empresa_id_id_key UNIQUE (empresa_id, id)
);

-- Índices de consulta eficiente
CREATE INDEX IF NOT EXISTS idx_marcas_analisis_empresa_asiento ON public.marcas_analisis_cuenta(empresa_id, asiento_id);
CREATE INDEX IF NOT EXISTS idx_marcas_analisis_estado ON public.marcas_analisis_cuenta(empresa_id, estado_revision);

-- Habilitar y forzar Row Level Security (RLS)
ALTER TABLE public.marcas_analisis_cuenta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marcas_analisis_cuenta FORCE ROW LEVEL SECURITY;

-- Política de aislamiento multi-tenant por empresa
DROP POLICY IF EXISTS rls_marcas_analisis_cuenta_empresa ON public.marcas_analisis_cuenta;
CREATE POLICY rls_marcas_analisis_cuenta_empresa ON public.marcas_analisis_cuenta
    FOR ALL
    USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::UUID)
    WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::UUID);
