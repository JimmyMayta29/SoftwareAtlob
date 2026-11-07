-- Ámbito de empresa en declaraciones, honorarios y retenciones.

ALTER TABLE public.declaraciones_pdt621 ADD CONSTRAINT declaraciones_pdt621_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.declaraciones_pdt621
    ADD CONSTRAINT declaraciones_pdt621_asiento_determinacion_id_fkey_empresa FOREIGN KEY (empresa_id, asiento_determinacion_id)
        REFERENCES public.asientos (empresa_id, id) ON DELETE SET NULL (asiento_determinacion_id) NOT VALID,
    ADD CONSTRAINT declaraciones_pdt621_declaracion_anterior_id_fkey_empresa FOREIGN KEY (empresa_id, declaracion_anterior_id)
        REFERENCES public.declaraciones_pdt621 (empresa_id, id) ON DELETE SET NULL (declaracion_anterior_id) NOT VALID;

ALTER TABLE public.declaraciones_prorrata_igv
    ADD CONSTRAINT declaraciones_prorrata_igv_asiento_ajuste_id_fkey_empresa FOREIGN KEY (empresa_id, asiento_ajuste_id)
        REFERENCES public.asientos (empresa_id, id) ON DELETE SET NULL (asiento_ajuste_id) NOT VALID;

ALTER TABLE public.recibos_honorarios
    ADD CONSTRAINT recibos_honorarios_asiento_id_fkey_empresa FOREIGN KEY (empresa_id, asiento_id)
        REFERENCES public.asientos (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT recibos_honorarios_cuenta_por_pagar_id_fkey_empresa FOREIGN KEY (empresa_id, cuenta_por_pagar_id)
        REFERENCES public.cuentas_por_pagar (empresa_id, id) ON DELETE SET NULL (cuenta_por_pagar_id) NOT VALID,
    ADD CONSTRAINT recibos_honorarios_periodo_id_fkey_empresa FOREIGN KEY (empresa_id, periodo_id)
        REFERENCES public.periodos (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT recibos_honorarios_proveedor_id_fkey_empresa FOREIGN KEY (empresa_id, proveedor_id)
        REFERENCES public.anexos (empresa_id, id) ON DELETE NO ACTION NOT VALID;

ALTER TABLE public.retenciones_percepciones_igv
    ADD CONSTRAINT retenciones_percepciones_igv_anexo_id_fkey_empresa FOREIGN KEY (empresa_id, anexo_id)
        REFERENCES public.anexos (empresa_id, id) ON DELETE RESTRICT NOT VALID;

-- VALIDATE debe alcanzar filas de todas las empresas. El propietario recupera FORCE dentro del mismo bloque y bajo bloqueo DDL.
DO $validar_fks$
DECLARE
    tabla TEXT;
    forzadas TEXT[];
BEGIN
    SELECT ARRAY(
        SELECT relname::text FROM pg_class
         WHERE relnamespace = 'public'::regnamespace AND relforcerowsecurity
           AND relname IN (
             'anexos', 'asientos', 'cuentas_por_pagar', 'declaraciones_pdt621',
             'declaraciones_prorrata_igv', 'periodos', 'recibos_honorarios', 'retenciones_percepciones_igv'
           )
         ORDER BY relname
    ) INTO forzadas;
    FOREACH tabla IN ARRAY forzadas LOOP
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', tabla);
    END LOOP;

    ALTER TABLE public.declaraciones_pdt621
        VALIDATE CONSTRAINT declaraciones_pdt621_asiento_determinacion_id_fkey_empresa,
        VALIDATE CONSTRAINT declaraciones_pdt621_declaracion_anterior_id_fkey_empresa;
    ALTER TABLE public.declaraciones_prorrata_igv
        VALIDATE CONSTRAINT declaraciones_prorrata_igv_asiento_ajuste_id_fkey_empresa;
    ALTER TABLE public.recibos_honorarios
        VALIDATE CONSTRAINT recibos_honorarios_asiento_id_fkey_empresa,
        VALIDATE CONSTRAINT recibos_honorarios_cuenta_por_pagar_id_fkey_empresa,
        VALIDATE CONSTRAINT recibos_honorarios_periodo_id_fkey_empresa,
        VALIDATE CONSTRAINT recibos_honorarios_proveedor_id_fkey_empresa;
    ALTER TABLE public.retenciones_percepciones_igv
        VALIDATE CONSTRAINT retenciones_percepciones_igv_anexo_id_fkey_empresa;

    FOREACH tabla IN ARRAY forzadas LOOP
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabla);
    END LOOP;
END;
$validar_fks$;

ALTER TABLE public.declaraciones_pdt621
    DROP CONSTRAINT declaraciones_pdt621_asiento_determinacion_id_fkey,
    DROP CONSTRAINT declaraciones_pdt621_declaracion_anterior_id_fkey;
ALTER TABLE public.declaraciones_pdt621 RENAME CONSTRAINT declaraciones_pdt621_asiento_determinacion_id_fkey_empresa TO declaraciones_pdt621_asiento_determinacion_id_fkey;
ALTER TABLE public.declaraciones_pdt621 RENAME CONSTRAINT declaraciones_pdt621_declaracion_anterior_id_fkey_empresa TO declaraciones_pdt621_declaracion_anterior_id_fkey;

ALTER TABLE public.declaraciones_prorrata_igv
    DROP CONSTRAINT declaraciones_prorrata_igv_asiento_ajuste_id_fkey;
ALTER TABLE public.declaraciones_prorrata_igv RENAME CONSTRAINT declaraciones_prorrata_igv_asiento_ajuste_id_fkey_empresa TO declaraciones_prorrata_igv_asiento_ajuste_id_fkey;

ALTER TABLE public.recibos_honorarios
    DROP CONSTRAINT recibos_honorarios_asiento_id_fkey,
    DROP CONSTRAINT recibos_honorarios_cuenta_por_pagar_id_fkey,
    DROP CONSTRAINT recibos_honorarios_periodo_id_fkey,
    DROP CONSTRAINT recibos_honorarios_proveedor_id_fkey;
ALTER TABLE public.recibos_honorarios RENAME CONSTRAINT recibos_honorarios_asiento_id_fkey_empresa TO recibos_honorarios_asiento_id_fkey;
ALTER TABLE public.recibos_honorarios RENAME CONSTRAINT recibos_honorarios_cuenta_por_pagar_id_fkey_empresa TO recibos_honorarios_cuenta_por_pagar_id_fkey;
ALTER TABLE public.recibos_honorarios RENAME CONSTRAINT recibos_honorarios_periodo_id_fkey_empresa TO recibos_honorarios_periodo_id_fkey;
ALTER TABLE public.recibos_honorarios RENAME CONSTRAINT recibos_honorarios_proveedor_id_fkey_empresa TO recibos_honorarios_proveedor_id_fkey;

ALTER TABLE public.retenciones_percepciones_igv
    DROP CONSTRAINT retenciones_percepciones_igv_anexo_id_fkey;
ALTER TABLE public.retenciones_percepciones_igv RENAME CONSTRAINT retenciones_percepciones_igv_anexo_id_fkey_empresa TO retenciones_percepciones_igv_anexo_id_fkey;
