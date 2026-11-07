-- Ámbito de empresa en compras y ventas.

ALTER TABLE public.comprobantes_compra ADD CONSTRAINT comprobantes_compra_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.comprobantes_venta ADD CONSTRAINT comprobantes_venta_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.comprobantes_compra
    ADD CONSTRAINT comprobantes_compra_asiento_id_fkey_empresa FOREIGN KEY (empresa_id, asiento_id)
        REFERENCES public.asientos (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT comprobantes_compra_documento_modificado_id_fkey_empresa FOREIGN KEY (empresa_id, documento_modificado_id)
        REFERENCES public.comprobantes_compra (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT comprobantes_compra_periodo_id_fkey_empresa FOREIGN KEY (empresa_id, periodo_id)
        REFERENCES public.periodos (empresa_id, id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT comprobantes_compra_proveedor_id_fkey_empresa FOREIGN KEY (empresa_id, proveedor_id)
        REFERENCES public.anexos (empresa_id, id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.comprobantes_venta
    ADD CONSTRAINT comprobantes_venta_asiento_id_fkey_empresa FOREIGN KEY (empresa_id, asiento_id)
        REFERENCES public.asientos (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT comprobantes_venta_cliente_id_fkey_empresa FOREIGN KEY (empresa_id, cliente_id)
        REFERENCES public.anexos (empresa_id, id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT comprobantes_venta_documento_modificado_id_fkey_empresa FOREIGN KEY (empresa_id, documento_modificado_id)
        REFERENCES public.comprobantes_venta (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT comprobantes_venta_periodo_id_fkey_empresa FOREIGN KEY (empresa_id, periodo_id)
        REFERENCES public.periodos (empresa_id, id) ON DELETE RESTRICT NOT VALID;

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
             'anexos', 'asientos', 'comprobantes_compra', 'comprobantes_venta',
             'periodos'
           )
         ORDER BY relname
    ) INTO forzadas;
    FOREACH tabla IN ARRAY forzadas LOOP
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', tabla);
    END LOOP;

    ALTER TABLE public.comprobantes_compra
        VALIDATE CONSTRAINT comprobantes_compra_asiento_id_fkey_empresa,
        VALIDATE CONSTRAINT comprobantes_compra_documento_modificado_id_fkey_empresa,
        VALIDATE CONSTRAINT comprobantes_compra_periodo_id_fkey_empresa,
        VALIDATE CONSTRAINT comprobantes_compra_proveedor_id_fkey_empresa;
    ALTER TABLE public.comprobantes_venta
        VALIDATE CONSTRAINT comprobantes_venta_asiento_id_fkey_empresa,
        VALIDATE CONSTRAINT comprobantes_venta_cliente_id_fkey_empresa,
        VALIDATE CONSTRAINT comprobantes_venta_documento_modificado_id_fkey_empresa,
        VALIDATE CONSTRAINT comprobantes_venta_periodo_id_fkey_empresa;

    FOREACH tabla IN ARRAY forzadas LOOP
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabla);
    END LOOP;
END;
$validar_fks$;

ALTER TABLE public.comprobantes_compra
    DROP CONSTRAINT comprobantes_compra_asiento_id_fkey,
    DROP CONSTRAINT comprobantes_compra_documento_modificado_id_fkey,
    DROP CONSTRAINT comprobantes_compra_periodo_id_fkey,
    DROP CONSTRAINT comprobantes_compra_proveedor_id_fkey;
ALTER TABLE public.comprobantes_compra RENAME CONSTRAINT comprobantes_compra_asiento_id_fkey_empresa TO comprobantes_compra_asiento_id_fkey;
ALTER TABLE public.comprobantes_compra RENAME CONSTRAINT comprobantes_compra_documento_modificado_id_fkey_empresa TO comprobantes_compra_documento_modificado_id_fkey;
ALTER TABLE public.comprobantes_compra RENAME CONSTRAINT comprobantes_compra_periodo_id_fkey_empresa TO comprobantes_compra_periodo_id_fkey;
ALTER TABLE public.comprobantes_compra RENAME CONSTRAINT comprobantes_compra_proveedor_id_fkey_empresa TO comprobantes_compra_proveedor_id_fkey;

ALTER TABLE public.comprobantes_venta
    DROP CONSTRAINT comprobantes_venta_asiento_id_fkey,
    DROP CONSTRAINT comprobantes_venta_cliente_id_fkey,
    DROP CONSTRAINT comprobantes_venta_documento_modificado_id_fkey,
    DROP CONSTRAINT comprobantes_venta_periodo_id_fkey;
ALTER TABLE public.comprobantes_venta RENAME CONSTRAINT comprobantes_venta_asiento_id_fkey_empresa TO comprobantes_venta_asiento_id_fkey;
ALTER TABLE public.comprobantes_venta RENAME CONSTRAINT comprobantes_venta_cliente_id_fkey_empresa TO comprobantes_venta_cliente_id_fkey;
ALTER TABLE public.comprobantes_venta RENAME CONSTRAINT comprobantes_venta_documento_modificado_id_fkey_empresa TO comprobantes_venta_documento_modificado_id_fkey;
ALTER TABLE public.comprobantes_venta RENAME CONSTRAINT comprobantes_venta_periodo_id_fkey_empresa TO comprobantes_venta_periodo_id_fkey;
