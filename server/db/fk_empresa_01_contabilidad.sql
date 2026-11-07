-- Ámbito de empresa en asientos, correlativos, ejercicios, reglas y saldos.

ALTER TABLE public.reglas_contabilizacion_detalle ADD COLUMN empresa_id UUID;

-- Las filas bajo FORCE RLS solo se pueden completar con el contexto de su empresa.
DO $empresa_hija$
DECLARE
    empresa UUID;
    contexto_anterior TEXT := current_setting('app.empresa_id', true);
BEGIN
    FOR empresa IN SELECT id FROM public.empresas LOOP
        PERFORM set_config('app.empresa_id', empresa::text, true);
        UPDATE public.reglas_contabilizacion_detalle AS hija
           SET empresa_id = padre.empresa_id
          FROM public.reglas_contabilizacion AS padre
         WHERE hija.regla_id = padre.id AND padre.empresa_id = empresa;
    END LOOP;
    PERFORM set_config('app.empresa_id', coalesce(contexto_anterior, ''), true);
END;
$empresa_hija$;

ALTER TABLE public.reglas_contabilizacion_detalle ALTER COLUMN empresa_id SET NOT NULL;

CREATE FUNCTION public.fijar_empresa_detalle_regla() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $empresa_hija$
BEGIN
    SELECT empresa_id INTO NEW.empresa_id
      FROM public.reglas_contabilizacion
     WHERE id = NEW.regla_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El padre no está disponible en el contexto de empresa'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$empresa_hija$;

CREATE TRIGGER fijar_empresa_detalle_regla
BEFORE INSERT OR UPDATE OF regla_id ON public.reglas_contabilizacion_detalle
FOR EACH ROW EXECUTE FUNCTION public.fijar_empresa_detalle_regla();


ALTER TABLE public.anexos ADD CONSTRAINT anexos_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.asientos ADD CONSTRAINT asientos_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.centros_costo ADD CONSTRAINT centros_costo_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.ejercicios ADD CONSTRAINT ejercicios_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.periodos ADD CONSTRAINT periodos_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.plan_cuentas ADD CONSTRAINT plan_cuentas_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.reglas_contabilizacion ADD CONSTRAINT reglas_contabilizacion_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.subdiarios ADD CONSTRAINT subdiarios_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.asientos
    ADD CONSTRAINT asientos_asiento_extorno_id_fkey_empresa FOREIGN KEY (empresa_id, asiento_extorno_id)
        REFERENCES public.asientos (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT asientos_periodo_id_fkey_empresa FOREIGN KEY (empresa_id, periodo_id)
        REFERENCES public.periodos (empresa_id, id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT asientos_subdiario_id_fkey_empresa FOREIGN KEY (empresa_id, subdiario_id)
        REFERENCES public.subdiarios (empresa_id, id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.asiento_detalle
    ADD CONSTRAINT asiento_detalle_anexo_id_fkey_empresa FOREIGN KEY (empresa_id, anexo_id)
        REFERENCES public.anexos (empresa_id, id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT asiento_detalle_asiento_id_fkey_empresa FOREIGN KEY (empresa_id, asiento_id)
        REFERENCES public.asientos (empresa_id, id) ON DELETE CASCADE NOT VALID,
    ADD CONSTRAINT asiento_detalle_centro_costo_id_fkey_empresa FOREIGN KEY (empresa_id, centro_costo_id)
        REFERENCES public.centros_costo (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT asiento_detalle_cuenta_id_fkey_empresa FOREIGN KEY (empresa_id, cuenta_id)
        REFERENCES public.plan_cuentas (empresa_id, id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.correlativos
    ADD CONSTRAINT correlativos_periodo_id_fkey_empresa FOREIGN KEY (empresa_id, periodo_id)
        REFERENCES public.periodos (empresa_id, id) ON DELETE CASCADE NOT VALID,
    ADD CONSTRAINT correlativos_subdiario_id_fkey_empresa FOREIGN KEY (empresa_id, subdiario_id)
        REFERENCES public.subdiarios (empresa_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.periodos
    ADD CONSTRAINT periodos_ejercicio_id_fkey_empresa FOREIGN KEY (empresa_id, ejercicio_id)
        REFERENCES public.ejercicios (empresa_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.reglas_contabilizacion_detalle
    ADD CONSTRAINT reglas_contabilizacion_detalle_regla_id_fkey_empresa FOREIGN KEY (empresa_id, regla_id)
        REFERENCES public.reglas_contabilizacion (empresa_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.saldos_mensuales
    ADD CONSTRAINT saldos_mensuales_anexo_id_fkey_empresa FOREIGN KEY (empresa_id, anexo_id)
        REFERENCES public.anexos (empresa_id, id) ON DELETE SET NULL (anexo_id) NOT VALID;

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
             'anexos', 'asiento_detalle', 'asientos', 'centros_costo',
             'correlativos', 'ejercicios', 'periodos', 'plan_cuentas',
             'reglas_contabilizacion', 'reglas_contabilizacion_detalle', 'saldos_mensuales', 'subdiarios'
           )
         ORDER BY relname
    ) INTO forzadas;
    FOREACH tabla IN ARRAY forzadas LOOP
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', tabla);
    END LOOP;

    ALTER TABLE public.asientos
        VALIDATE CONSTRAINT asientos_asiento_extorno_id_fkey_empresa,
        VALIDATE CONSTRAINT asientos_periodo_id_fkey_empresa,
        VALIDATE CONSTRAINT asientos_subdiario_id_fkey_empresa;
    ALTER TABLE public.asiento_detalle
        VALIDATE CONSTRAINT asiento_detalle_anexo_id_fkey_empresa,
        VALIDATE CONSTRAINT asiento_detalle_asiento_id_fkey_empresa,
        VALIDATE CONSTRAINT asiento_detalle_centro_costo_id_fkey_empresa,
        VALIDATE CONSTRAINT asiento_detalle_cuenta_id_fkey_empresa;
    ALTER TABLE public.correlativos
        VALIDATE CONSTRAINT correlativos_periodo_id_fkey_empresa,
        VALIDATE CONSTRAINT correlativos_subdiario_id_fkey_empresa;
    ALTER TABLE public.periodos
        VALIDATE CONSTRAINT periodos_ejercicio_id_fkey_empresa;
    ALTER TABLE public.reglas_contabilizacion_detalle
        VALIDATE CONSTRAINT reglas_contabilizacion_detalle_regla_id_fkey_empresa;
    ALTER TABLE public.saldos_mensuales
        VALIDATE CONSTRAINT saldos_mensuales_anexo_id_fkey_empresa;

    FOREACH tabla IN ARRAY forzadas LOOP
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabla);
    END LOOP;
END;
$validar_fks$;

ALTER TABLE public.asientos
    DROP CONSTRAINT asientos_asiento_extorno_id_fkey,
    DROP CONSTRAINT asientos_periodo_id_fkey,
    DROP CONSTRAINT asientos_subdiario_id_fkey;
ALTER TABLE public.asientos RENAME CONSTRAINT asientos_asiento_extorno_id_fkey_empresa TO asientos_asiento_extorno_id_fkey;
ALTER TABLE public.asientos RENAME CONSTRAINT asientos_periodo_id_fkey_empresa TO asientos_periodo_id_fkey;
ALTER TABLE public.asientos RENAME CONSTRAINT asientos_subdiario_id_fkey_empresa TO asientos_subdiario_id_fkey;

ALTER TABLE public.asiento_detalle
    DROP CONSTRAINT asiento_detalle_anexo_id_fkey,
    DROP CONSTRAINT asiento_detalle_asiento_id_fkey,
    DROP CONSTRAINT asiento_detalle_centro_costo_id_fkey,
    DROP CONSTRAINT asiento_detalle_cuenta_id_fkey;
ALTER TABLE public.asiento_detalle RENAME CONSTRAINT asiento_detalle_anexo_id_fkey_empresa TO asiento_detalle_anexo_id_fkey;
ALTER TABLE public.asiento_detalle RENAME CONSTRAINT asiento_detalle_asiento_id_fkey_empresa TO asiento_detalle_asiento_id_fkey;
ALTER TABLE public.asiento_detalle RENAME CONSTRAINT asiento_detalle_centro_costo_id_fkey_empresa TO asiento_detalle_centro_costo_id_fkey;
ALTER TABLE public.asiento_detalle RENAME CONSTRAINT asiento_detalle_cuenta_id_fkey_empresa TO asiento_detalle_cuenta_id_fkey;

ALTER TABLE public.correlativos
    DROP CONSTRAINT correlativos_periodo_id_fkey,
    DROP CONSTRAINT correlativos_subdiario_id_fkey;
ALTER TABLE public.correlativos RENAME CONSTRAINT correlativos_periodo_id_fkey_empresa TO correlativos_periodo_id_fkey;
ALTER TABLE public.correlativos RENAME CONSTRAINT correlativos_subdiario_id_fkey_empresa TO correlativos_subdiario_id_fkey;

ALTER TABLE public.periodos
    DROP CONSTRAINT periodos_ejercicio_id_fkey;
ALTER TABLE public.periodos RENAME CONSTRAINT periodos_ejercicio_id_fkey_empresa TO periodos_ejercicio_id_fkey;

ALTER TABLE public.reglas_contabilizacion_detalle
    DROP CONSTRAINT reglas_contabilizacion_detalle_regla_id_fkey;
ALTER TABLE public.reglas_contabilizacion_detalle RENAME CONSTRAINT reglas_contabilizacion_detalle_regla_id_fkey_empresa TO reglas_contabilizacion_detalle_regla_id_fkey;

ALTER TABLE public.saldos_mensuales
    DROP CONSTRAINT saldos_mensuales_anexo_id_fkey;
ALTER TABLE public.saldos_mensuales RENAME CONSTRAINT saldos_mensuales_anexo_id_fkey_empresa TO saldos_mensuales_anexo_id_fkey;
