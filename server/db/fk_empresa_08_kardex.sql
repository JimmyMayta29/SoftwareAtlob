-- Ámbito de empresa en kardex.

ALTER TABLE public.articulos_kardex ADD CONSTRAINT articulos_kardex_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.movimientos_kardex
    ADD CONSTRAINT movimientos_kardex_producto_id_fkey_empresa FOREIGN KEY (empresa_id, producto_id)
        REFERENCES public.articulos_kardex (empresa_id, id) ON DELETE CASCADE NOT VALID;

DO $validar_fks$
DECLARE
    tabla TEXT;
    forzadas TEXT[];
BEGIN
    SELECT ARRAY(
        SELECT relname::text FROM pg_class
         WHERE relnamespace = 'public'::regnamespace AND relforcerowsecurity
           AND relname IN ('articulos_kardex', 'movimientos_kardex')
         ORDER BY relname
    ) INTO forzadas;
    FOREACH tabla IN ARRAY forzadas LOOP
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', tabla);
    END LOOP;

    ALTER TABLE public.movimientos_kardex
        VALIDATE CONSTRAINT movimientos_kardex_producto_id_fkey_empresa;

    FOREACH tabla IN ARRAY forzadas LOOP
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabla);
    END LOOP;
END;
$validar_fks$;

ALTER TABLE public.movimientos_kardex
    DROP CONSTRAINT movimientos_kardex_producto_id_fkey;
ALTER TABLE public.movimientos_kardex RENAME CONSTRAINT movimientos_kardex_producto_id_fkey_empresa TO movimientos_kardex_producto_id_fkey;
