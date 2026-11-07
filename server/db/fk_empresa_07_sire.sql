-- Ámbito de empresa en propuestas y conciliaciones SIRE.

ALTER TABLE public.sire_conciliaciones ADD CONSTRAINT sire_conciliaciones_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.sire_propuesta_lineas ADD CONSTRAINT sire_propuesta_lineas_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.sire_propuestas ADD CONSTRAINT sire_propuestas_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.sire_conciliacion_lineas
    ADD CONSTRAINT sire_conciliacion_lineas_conciliacion_id_fkey_empresa FOREIGN KEY (empresa_id, conciliacion_id)
        REFERENCES public.sire_conciliaciones (empresa_id, id) ON DELETE CASCADE NOT VALID,
    ADD CONSTRAINT sire_conciliacion_lineas_linea_propuesta_id_fkey_empresa FOREIGN KEY (empresa_id, linea_propuesta_id)
        REFERENCES public.sire_propuesta_lineas (empresa_id, id) ON DELETE NO ACTION NOT VALID;

ALTER TABLE public.sire_conciliaciones
    ADD CONSTRAINT sire_conciliaciones_propuesta_id_fkey_empresa FOREIGN KEY (empresa_id, propuesta_id)
        REFERENCES public.sire_propuestas (empresa_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.sire_propuesta_lineas
    ADD CONSTRAINT sire_propuesta_lineas_propuesta_id_fkey_empresa FOREIGN KEY (empresa_id, propuesta_id)
        REFERENCES public.sire_propuestas (empresa_id, id) ON DELETE CASCADE NOT VALID;

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
             'sire_conciliacion_lineas', 'sire_conciliaciones', 'sire_propuesta_lineas', 'sire_propuestas'
           )
         ORDER BY relname
    ) INTO forzadas;
    FOREACH tabla IN ARRAY forzadas LOOP
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', tabla);
    END LOOP;

    ALTER TABLE public.sire_conciliacion_lineas
        VALIDATE CONSTRAINT sire_conciliacion_lineas_conciliacion_id_fkey_empresa,
        VALIDATE CONSTRAINT sire_conciliacion_lineas_linea_propuesta_id_fkey_empresa;
    ALTER TABLE public.sire_conciliaciones
        VALIDATE CONSTRAINT sire_conciliaciones_propuesta_id_fkey_empresa;
    ALTER TABLE public.sire_propuesta_lineas
        VALIDATE CONSTRAINT sire_propuesta_lineas_propuesta_id_fkey_empresa;

    FOREACH tabla IN ARRAY forzadas LOOP
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabla);
    END LOOP;
END;
$validar_fks$;

ALTER TABLE public.sire_conciliacion_lineas
    DROP CONSTRAINT sire_conciliacion_lineas_conciliacion_id_fkey,
    DROP CONSTRAINT sire_conciliacion_lineas_linea_propuesta_id_fkey;
ALTER TABLE public.sire_conciliacion_lineas RENAME CONSTRAINT sire_conciliacion_lineas_conciliacion_id_fkey_empresa TO sire_conciliacion_lineas_conciliacion_id_fkey;
ALTER TABLE public.sire_conciliacion_lineas RENAME CONSTRAINT sire_conciliacion_lineas_linea_propuesta_id_fkey_empresa TO sire_conciliacion_lineas_linea_propuesta_id_fkey;

ALTER TABLE public.sire_conciliaciones
    DROP CONSTRAINT sire_conciliaciones_propuesta_id_fkey;
ALTER TABLE public.sire_conciliaciones RENAME CONSTRAINT sire_conciliaciones_propuesta_id_fkey_empresa TO sire_conciliaciones_propuesta_id_fkey;

ALTER TABLE public.sire_propuesta_lineas
    DROP CONSTRAINT sire_propuesta_lineas_propuesta_id_fkey;
ALTER TABLE public.sire_propuesta_lineas RENAME CONSTRAINT sire_propuesta_lineas_propuesta_id_fkey_empresa TO sire_propuesta_lineas_propuesta_id_fkey;
