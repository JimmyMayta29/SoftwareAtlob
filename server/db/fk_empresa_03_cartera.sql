-- Ámbito de empresa en cuentas por cobrar y pagar.

ALTER TABLE public.cuentas_por_cobrar ADD CONSTRAINT cuentas_por_cobrar_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.cuentas_por_pagar ADD CONSTRAINT cuentas_por_pagar_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.aplicaciones_cobranza
    ADD CONSTRAINT aplicaciones_cobranza_asiento_id_fkey_empresa FOREIGN KEY (empresa_id, asiento_id)
        REFERENCES public.asientos (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT aplicaciones_cobranza_cuenta_por_cobrar_id_fkey_empresa FOREIGN KEY (empresa_id, cuenta_por_cobrar_id)
        REFERENCES public.cuentas_por_cobrar (empresa_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.aplicaciones_pago
    ADD CONSTRAINT aplicaciones_pago_asiento_id_fkey_empresa FOREIGN KEY (empresa_id, asiento_id)
        REFERENCES public.asientos (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT aplicaciones_pago_cuenta_por_pagar_id_fkey_empresa FOREIGN KEY (empresa_id, cuenta_por_pagar_id)
        REFERENCES public.cuentas_por_pagar (empresa_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.cuentas_por_cobrar
    ADD CONSTRAINT cuentas_por_cobrar_cliente_id_fkey_empresa FOREIGN KEY (empresa_id, cliente_id)
        REFERENCES public.anexos (empresa_id, id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT cuentas_por_cobrar_comprobante_id_fkey_empresa FOREIGN KEY (empresa_id, comprobante_id)
        REFERENCES public.comprobantes_venta (empresa_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.cuentas_por_pagar
    ADD CONSTRAINT cuentas_por_pagar_comprobante_id_fkey_empresa FOREIGN KEY (empresa_id, comprobante_id)
        REFERENCES public.comprobantes_compra (empresa_id, id) ON DELETE CASCADE NOT VALID,
    ADD CONSTRAINT cuentas_por_pagar_proveedor_id_fkey_empresa FOREIGN KEY (empresa_id, proveedor_id)
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
             'anexos', 'aplicaciones_cobranza', 'aplicaciones_pago', 'asientos',
             'comprobantes_compra', 'comprobantes_venta', 'cuentas_por_cobrar', 'cuentas_por_pagar'
           )
         ORDER BY relname
    ) INTO forzadas;
    FOREACH tabla IN ARRAY forzadas LOOP
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', tabla);
    END LOOP;

    ALTER TABLE public.aplicaciones_cobranza
        VALIDATE CONSTRAINT aplicaciones_cobranza_asiento_id_fkey_empresa,
        VALIDATE CONSTRAINT aplicaciones_cobranza_cuenta_por_cobrar_id_fkey_empresa;
    ALTER TABLE public.aplicaciones_pago
        VALIDATE CONSTRAINT aplicaciones_pago_asiento_id_fkey_empresa,
        VALIDATE CONSTRAINT aplicaciones_pago_cuenta_por_pagar_id_fkey_empresa;
    ALTER TABLE public.cuentas_por_cobrar
        VALIDATE CONSTRAINT cuentas_por_cobrar_cliente_id_fkey_empresa,
        VALIDATE CONSTRAINT cuentas_por_cobrar_comprobante_id_fkey_empresa;
    ALTER TABLE public.cuentas_por_pagar
        VALIDATE CONSTRAINT cuentas_por_pagar_comprobante_id_fkey_empresa,
        VALIDATE CONSTRAINT cuentas_por_pagar_proveedor_id_fkey_empresa;

    FOREACH tabla IN ARRAY forzadas LOOP
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabla);
    END LOOP;
END;
$validar_fks$;

ALTER TABLE public.aplicaciones_cobranza
    DROP CONSTRAINT aplicaciones_cobranza_asiento_id_fkey,
    DROP CONSTRAINT aplicaciones_cobranza_cuenta_por_cobrar_id_fkey;
ALTER TABLE public.aplicaciones_cobranza RENAME CONSTRAINT aplicaciones_cobranza_asiento_id_fkey_empresa TO aplicaciones_cobranza_asiento_id_fkey;
ALTER TABLE public.aplicaciones_cobranza RENAME CONSTRAINT aplicaciones_cobranza_cuenta_por_cobrar_id_fkey_empresa TO aplicaciones_cobranza_cuenta_por_cobrar_id_fkey;

ALTER TABLE public.aplicaciones_pago
    DROP CONSTRAINT aplicaciones_pago_asiento_id_fkey,
    DROP CONSTRAINT aplicaciones_pago_cuenta_por_pagar_id_fkey;
ALTER TABLE public.aplicaciones_pago RENAME CONSTRAINT aplicaciones_pago_asiento_id_fkey_empresa TO aplicaciones_pago_asiento_id_fkey;
ALTER TABLE public.aplicaciones_pago RENAME CONSTRAINT aplicaciones_pago_cuenta_por_pagar_id_fkey_empresa TO aplicaciones_pago_cuenta_por_pagar_id_fkey;

ALTER TABLE public.cuentas_por_cobrar
    DROP CONSTRAINT cuentas_por_cobrar_cliente_id_fkey,
    DROP CONSTRAINT cuentas_por_cobrar_comprobante_id_fkey;
ALTER TABLE public.cuentas_por_cobrar RENAME CONSTRAINT cuentas_por_cobrar_cliente_id_fkey_empresa TO cuentas_por_cobrar_cliente_id_fkey;
ALTER TABLE public.cuentas_por_cobrar RENAME CONSTRAINT cuentas_por_cobrar_comprobante_id_fkey_empresa TO cuentas_por_cobrar_comprobante_id_fkey;

ALTER TABLE public.cuentas_por_pagar
    DROP CONSTRAINT cuentas_por_pagar_comprobante_id_fkey,
    DROP CONSTRAINT cuentas_por_pagar_proveedor_id_fkey;
ALTER TABLE public.cuentas_por_pagar RENAME CONSTRAINT cuentas_por_pagar_comprobante_id_fkey_empresa TO cuentas_por_pagar_comprobante_id_fkey;
ALTER TABLE public.cuentas_por_pagar RENAME CONSTRAINT cuentas_por_pagar_proveedor_id_fkey_empresa TO cuentas_por_pagar_proveedor_id_fkey;
