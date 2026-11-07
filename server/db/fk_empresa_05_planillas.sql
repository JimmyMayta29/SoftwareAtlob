-- Ámbito de empresa en planillas y trabajadores.

ALTER TABLE public.planilla_lineas ADD COLUMN empresa_id UUID;

-- Las filas bajo FORCE RLS solo se pueden completar con el contexto de su empresa.
DO $empresa_hija$
DECLARE
    empresa UUID;
    contexto_anterior TEXT := current_setting('app.empresa_id', true);
BEGIN
    FOR empresa IN SELECT id FROM public.empresas LOOP
        PERFORM set_config('app.empresa_id', empresa::text, true);
        UPDATE public.planilla_lineas AS hija
           SET empresa_id = padre.empresa_id
          FROM public.planillas AS padre
         WHERE hija.planilla_id = padre.id AND padre.empresa_id = empresa;
    END LOOP;
    PERFORM set_config('app.empresa_id', coalesce(contexto_anterior, ''), true);
END;
$empresa_hija$;

ALTER TABLE public.planilla_lineas ALTER COLUMN empresa_id SET NOT NULL;

CREATE FUNCTION public.fijar_empresa_linea_planilla() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $empresa_hija$
BEGIN
    SELECT empresa_id INTO NEW.empresa_id
      FROM public.planillas
     WHERE id = NEW.planilla_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El padre no está disponible en el contexto de empresa'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$empresa_hija$;

CREATE TRIGGER fijar_empresa_linea_planilla
BEFORE INSERT OR UPDATE OF planilla_id ON public.planilla_lineas
FOR EACH ROW EXECUTE FUNCTION public.fijar_empresa_linea_planilla();


ALTER TABLE public.planillas ADD CONSTRAINT planillas_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.trabajadores ADD CONSTRAINT trabajadores_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.liquidaciones_beneficios
    ADD CONSTRAINT liquidaciones_beneficios_asiento_id_fkey_empresa FOREIGN KEY (empresa_id, asiento_id)
        REFERENCES public.asientos (empresa_id, id) ON DELETE SET NULL (asiento_id) NOT VALID,
    ADD CONSTRAINT liquidaciones_beneficios_trabajador_id_fkey_empresa FOREIGN KEY (empresa_id, trabajador_id)
        REFERENCES public.trabajadores (empresa_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.planilla_cts
    ADD CONSTRAINT planilla_cts_asiento_id_fkey_empresa FOREIGN KEY (empresa_id, asiento_id)
        REFERENCES public.asientos (empresa_id, id) ON DELETE SET NULL (asiento_id) NOT VALID,
    ADD CONSTRAINT planilla_cts_trabajador_id_fkey_empresa FOREIGN KEY (empresa_id, trabajador_id)
        REFERENCES public.trabajadores (empresa_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.planilla_gratificaciones
    ADD CONSTRAINT planilla_gratificaciones_asiento_id_fkey_empresa FOREIGN KEY (empresa_id, asiento_id)
        REFERENCES public.asientos (empresa_id, id) ON DELETE SET NULL (asiento_id) NOT VALID,
    ADD CONSTRAINT planilla_gratificaciones_trabajador_id_fkey_empresa FOREIGN KEY (empresa_id, trabajador_id)
        REFERENCES public.trabajadores (empresa_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.planilla_lineas
    ADD CONSTRAINT planilla_lineas_planilla_id_fkey_empresa FOREIGN KEY (empresa_id, planilla_id)
        REFERENCES public.planillas (empresa_id, id) ON DELETE CASCADE NOT VALID,
    ADD CONSTRAINT planilla_lineas_trabajador_id_fkey_empresa FOREIGN KEY (empresa_id, trabajador_id)
        REFERENCES public.trabajadores (empresa_id, id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.planillas
    ADD CONSTRAINT planillas_asiento_id_fkey_empresa FOREIGN KEY (empresa_id, asiento_id)
        REFERENCES public.asientos (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT planillas_asiento_pago_id_fkey_empresa FOREIGN KEY (empresa_id, asiento_pago_id)
        REFERENCES public.asientos (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT planillas_periodo_id_fkey_empresa FOREIGN KEY (empresa_id, periodo_id)
        REFERENCES public.periodos (empresa_id, id) ON DELETE NO ACTION NOT VALID;

ALTER TABLE public.provisiones_sociales
    ADD CONSTRAINT provisiones_sociales_asiento_id_fkey_empresa FOREIGN KEY (empresa_id, asiento_id)
        REFERENCES public.asientos (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT provisiones_sociales_periodo_id_fkey_empresa FOREIGN KEY (empresa_id, periodo_id)
        REFERENCES public.periodos (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT provisiones_sociales_trabajador_id_fkey_empresa FOREIGN KEY (empresa_id, trabajador_id)
        REFERENCES public.trabajadores (empresa_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.tregistro_movimientos
    ADD CONSTRAINT tregistro_movimientos_trabajador_id_fkey_empresa FOREIGN KEY (empresa_id, trabajador_id)
        REFERENCES public.trabajadores (empresa_id, id) ON DELETE CASCADE NOT VALID;

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
             'asientos', 'liquidaciones_beneficios', 'periodos', 'planilla_cts',
             'planilla_gratificaciones', 'planilla_lineas', 'planillas', 'provisiones_sociales',
             'trabajadores', 'tregistro_movimientos'
           )
         ORDER BY relname
    ) INTO forzadas;
    FOREACH tabla IN ARRAY forzadas LOOP
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', tabla);
    END LOOP;

    ALTER TABLE public.liquidaciones_beneficios
        VALIDATE CONSTRAINT liquidaciones_beneficios_asiento_id_fkey_empresa,
        VALIDATE CONSTRAINT liquidaciones_beneficios_trabajador_id_fkey_empresa;
    ALTER TABLE public.planilla_cts
        VALIDATE CONSTRAINT planilla_cts_asiento_id_fkey_empresa,
        VALIDATE CONSTRAINT planilla_cts_trabajador_id_fkey_empresa;
    ALTER TABLE public.planilla_gratificaciones
        VALIDATE CONSTRAINT planilla_gratificaciones_asiento_id_fkey_empresa,
        VALIDATE CONSTRAINT planilla_gratificaciones_trabajador_id_fkey_empresa;
    ALTER TABLE public.planilla_lineas
        VALIDATE CONSTRAINT planilla_lineas_planilla_id_fkey_empresa,
        VALIDATE CONSTRAINT planilla_lineas_trabajador_id_fkey_empresa;
    ALTER TABLE public.planillas
        VALIDATE CONSTRAINT planillas_asiento_id_fkey_empresa,
        VALIDATE CONSTRAINT planillas_asiento_pago_id_fkey_empresa,
        VALIDATE CONSTRAINT planillas_periodo_id_fkey_empresa;
    ALTER TABLE public.provisiones_sociales
        VALIDATE CONSTRAINT provisiones_sociales_asiento_id_fkey_empresa,
        VALIDATE CONSTRAINT provisiones_sociales_periodo_id_fkey_empresa,
        VALIDATE CONSTRAINT provisiones_sociales_trabajador_id_fkey_empresa;
    ALTER TABLE public.tregistro_movimientos
        VALIDATE CONSTRAINT tregistro_movimientos_trabajador_id_fkey_empresa;

    FOREACH tabla IN ARRAY forzadas LOOP
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabla);
    END LOOP;
END;
$validar_fks$;

ALTER TABLE public.liquidaciones_beneficios
    DROP CONSTRAINT liquidaciones_beneficios_asiento_id_fkey,
    DROP CONSTRAINT liquidaciones_beneficios_trabajador_id_fkey;
ALTER TABLE public.liquidaciones_beneficios RENAME CONSTRAINT liquidaciones_beneficios_asiento_id_fkey_empresa TO liquidaciones_beneficios_asiento_id_fkey;
ALTER TABLE public.liquidaciones_beneficios RENAME CONSTRAINT liquidaciones_beneficios_trabajador_id_fkey_empresa TO liquidaciones_beneficios_trabajador_id_fkey;

ALTER TABLE public.planilla_cts
    DROP CONSTRAINT planilla_cts_asiento_id_fkey,
    DROP CONSTRAINT planilla_cts_trabajador_id_fkey;
ALTER TABLE public.planilla_cts RENAME CONSTRAINT planilla_cts_asiento_id_fkey_empresa TO planilla_cts_asiento_id_fkey;
ALTER TABLE public.planilla_cts RENAME CONSTRAINT planilla_cts_trabajador_id_fkey_empresa TO planilla_cts_trabajador_id_fkey;

ALTER TABLE public.planilla_gratificaciones
    DROP CONSTRAINT planilla_gratificaciones_asiento_id_fkey,
    DROP CONSTRAINT planilla_gratificaciones_trabajador_id_fkey;
ALTER TABLE public.planilla_gratificaciones RENAME CONSTRAINT planilla_gratificaciones_asiento_id_fkey_empresa TO planilla_gratificaciones_asiento_id_fkey;
ALTER TABLE public.planilla_gratificaciones RENAME CONSTRAINT planilla_gratificaciones_trabajador_id_fkey_empresa TO planilla_gratificaciones_trabajador_id_fkey;

ALTER TABLE public.planilla_lineas
    DROP CONSTRAINT planilla_lineas_planilla_id_fkey,
    DROP CONSTRAINT planilla_lineas_trabajador_id_fkey;
ALTER TABLE public.planilla_lineas RENAME CONSTRAINT planilla_lineas_planilla_id_fkey_empresa TO planilla_lineas_planilla_id_fkey;
ALTER TABLE public.planilla_lineas RENAME CONSTRAINT planilla_lineas_trabajador_id_fkey_empresa TO planilla_lineas_trabajador_id_fkey;

ALTER TABLE public.planillas
    DROP CONSTRAINT planillas_asiento_id_fkey,
    DROP CONSTRAINT planillas_asiento_pago_id_fkey,
    DROP CONSTRAINT planillas_periodo_id_fkey;
ALTER TABLE public.planillas RENAME CONSTRAINT planillas_asiento_id_fkey_empresa TO planillas_asiento_id_fkey;
ALTER TABLE public.planillas RENAME CONSTRAINT planillas_asiento_pago_id_fkey_empresa TO planillas_asiento_pago_id_fkey;
ALTER TABLE public.planillas RENAME CONSTRAINT planillas_periodo_id_fkey_empresa TO planillas_periodo_id_fkey;

ALTER TABLE public.provisiones_sociales
    DROP CONSTRAINT provisiones_sociales_asiento_id_fkey,
    DROP CONSTRAINT provisiones_sociales_periodo_id_fkey,
    DROP CONSTRAINT provisiones_sociales_trabajador_id_fkey;
ALTER TABLE public.provisiones_sociales RENAME CONSTRAINT provisiones_sociales_asiento_id_fkey_empresa TO provisiones_sociales_asiento_id_fkey;
ALTER TABLE public.provisiones_sociales RENAME CONSTRAINT provisiones_sociales_periodo_id_fkey_empresa TO provisiones_sociales_periodo_id_fkey;
ALTER TABLE public.provisiones_sociales RENAME CONSTRAINT provisiones_sociales_trabajador_id_fkey_empresa TO provisiones_sociales_trabajador_id_fkey;

ALTER TABLE public.tregistro_movimientos
    DROP CONSTRAINT tregistro_movimientos_trabajador_id_fkey;
ALTER TABLE public.tregistro_movimientos RENAME CONSTRAINT tregistro_movimientos_trabajador_id_fkey_empresa TO tregistro_movimientos_trabajador_id_fkey;
