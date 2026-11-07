DO $migracion$
DECLARE
    politica RECORD;
    contexto CONSTANT TEXT := $expr$COALESCE(
        NULLIF(current_setting('app.empresa_id', true), ''),
        NULLIF(current_setting('app.current_empresa_id', true), '')
    )::uuid$expr$;
BEGIN
    FOR politica IN SELECT * FROM (VALUES
        ('asientos', 'rls_asientos'),
        ('asiento_detalle', 'rls_asiento_detalle'),
        ('correlativos', 'rls_correlativos'),
        ('reglas_contabilizacion', 'rls_reglas_contabilizacion'),
        ('centros_costo', 'rls_centros_costo'),
        ('asientos_recurrentes', 'rls_asientos_recurrentes'),
        ('comprobantes_compra', 'rls_compras'),
        ('comprobantes_venta', 'rls_ventas'),
        ('cuentas_por_pagar', 'rls_cxp'),
        ('cuentas_por_cobrar', 'rls_cxc'),
        ('aplicaciones_pago', 'rls_app_pago'),
        ('aplicaciones_cobranza', 'rls_app_cobranza'),
        ('detracciones', 'rls_detracciones'),
        ('retenciones_percepciones_igv', 'rls_ret_per'),
        ('trabajadores', 'rls_trabajadores_empresa'),
        ('planillas', 'rls_planillas_empresa'),
        ('planilla_gratificaciones', 'rls_planilla_gratificaciones_empresa'),
        ('planilla_cts', 'rls_planilla_cts_empresa'),
        ('liquidaciones_beneficios', 'rls_liquidaciones_beneficios_empresa'),
        ('tregistro_movimientos', 'rls_tregistro_movimientos_empresa'),
        ('auditoria_log', 'rls_auditoria_log_empresa')
    ) AS existentes(tabla, nombre)
    LOOP
        EXECUTE format('ALTER POLICY %I ON public.%I USING (empresa_id = %s) WITH CHECK (empresa_id = %s)',
            politica.nombre, politica.tabla, contexto, contexto);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', politica.tabla);
    END LOOP;

    EXECUTE format($politica$
        CREATE POLICY rls_reglas_contabilizacion_detalle_empresa ON public.reglas_contabilizacion_detalle
        USING (EXISTS (
            SELECT 1 FROM public.reglas_contabilizacion AS regla
            WHERE regla.id = reglas_contabilizacion_detalle.regla_id AND regla.empresa_id = %s
        ))
    $politica$, contexto);
    ALTER TABLE public.reglas_contabilizacion_detalle ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
END;
$migracion$;
