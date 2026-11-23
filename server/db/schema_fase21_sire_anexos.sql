-- ============================================================================
-- Fase 21: Anexos Oficiales SUNAT SIRE (No Domiciliados 080500 y Ajustes/Complementos)
-- R.S. N° 000112-2021/SUNAT y modificatorias R.S. N° 000040-2022/SUNAT
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sire_no_domiciliados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    periodo VARCHAR(7) NOT NULL,
    car_sunat VARCHAR(50) DEFAULT '',
    fecha_emision DATE NOT NULL,
    tipo_comprobante VARCHAR(4) NOT NULL DEFAULT '91',
    serie VARCHAR(20) NOT NULL DEFAULT '',
    numero VARCHAR(30) NOT NULL,
    valor_adquisiciones NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    otros_conceptos NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    importe_total NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    tipo_doc_sustenta_credito VARCHAR(4) DEFAULT '',
    serie_doc_sustenta_credito VARCHAR(20) DEFAULT '',
    anio_dua VARCHAR(4) DEFAULT '',
    numero_doc_sustenta_credito VARCHAR(30) DEFAULT '',
    retencion_igv NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    moneda CHAR(3) NOT NULL DEFAULT 'USD',
    tipo_cambio NUMERIC(10,4) NOT NULL DEFAULT 1.0000,
    pais_residencia VARCHAR(6) NOT NULL DEFAULT '9249',
    razon_social_no_domiciliado VARCHAR(200) NOT NULL,
    domicilio_extranjero VARCHAR(250) DEFAULT '',
    num_id_fiscal VARCHAR(40) NOT NULL DEFAULT '',
    num_id_beneficiario VARCHAR(40) DEFAULT '',
    razon_social_beneficiario VARCHAR(200) DEFAULT '',
    pais_beneficiario VARCHAR(6) DEFAULT '',
    vinculo_contribuyente VARCHAR(4) NOT NULL DEFAULT '00',
    renta_bruta NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    deduccion_costo NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    renta_neta NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    tasa_retencion NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    impuesto_retenido NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    convenio_doble_imposicion VARCHAR(4) NOT NULL DEFAULT '00',
    exoneracion_aplicada VARCHAR(4) DEFAULT '',
    tipo_renta VARCHAR(4) NOT NULL DEFAULT '00',
    modalidad_servicio VARCHAR(4) DEFAULT '',
    aplica_art76 BOOLEAN NOT NULL DEFAULT FALSE,
    car_cp_modificar VARCHAR(50) DEFAULT '',
    estado VARCHAR(20) NOT NULL DEFAULT 'REGISTRADO' CHECK (estado IN ('BORRADOR', 'REGISTRADO', 'ANULADO')),
    usuario_id UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sire_no_domiciliados_emp_per
    ON public.sire_no_domiciliados (empresa_id, periodo);

CREATE TABLE IF NOT EXISTS public.sire_ajustes_posteriores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    periodo_presentacion VARCHAR(7) NOT NULL,
    periodo_ajustado VARCHAR(7) NOT NULL,
    registro VARCHAR(25) NOT NULL CHECK (registro IN ('RVIE', 'RCE', 'RCE_NO_DOMICILIADO')),
    codigo_anexo VARCHAR(25) NOT NULL CHECK (
        codigo_anexo IN (
            'RVIE_ANEXO_2', 'RVIE_ANEXO_4', 'RVIE_ANEXO_5',
            'RCE_ANEXO_8_CP', 'RCE_ANEXO_8_INEX', 'RCE_ANEXO_10',
            'RCE_ANEXO_12_1', 'RCE_ANEXO_12_2', 'RCE_ANEXO_13_1', 'RCE_ANEXO_13_2'
        )
    ),
    tipo_operacion VARCHAR(20) NOT NULL DEFAULT 'MODIFICACION' CHECK (
        tipo_operacion IN ('INCLUSION', 'EXCLUSION', 'MODIFICACION', 'TIPO_CAMBIO')
    ),
    oportunidad VARCHAR(2) NOT NULL DEFAULT '03' CHECK (oportunidad IN ('01', '02', '03', '04', '05')),
    correlativo VARCHAR(2) NOT NULL DEFAULT '01',
    car_original VARCHAR(50) DEFAULT '',
    datos_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    estado VARCHAR(20) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR', 'GENERADO', 'ENVIADO')),
    usuario_id UUID REFERENCES public.usuarios_estudio(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sire_ajustes_emp_per
    ON public.sire_ajustes_posteriores (empresa_id, periodo_presentacion, codigo_anexo);

DROP POLICY IF EXISTS aislamiento_atlob ON public.sire_no_domiciliados;
CREATE POLICY aislamiento_atlob ON public.sire_no_domiciliados
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.sire_no_domiciliados ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.sire_ajustes_posteriores;
CREATE POLICY aislamiento_atlob ON public.sire_ajustes_posteriores
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.sire_ajustes_posteriores ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
