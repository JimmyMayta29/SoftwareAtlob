-- Ámbito de empresa en movimientos y cuentas financieras.

ALTER TABLE public.cajas_chicas ADD CONSTRAINT cajas_chicas_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.cuentas_financieras ADD CONSTRAINT cuentas_financieras_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.extractos_bancarios ADD CONSTRAINT extractos_bancarios_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.movimientos_tesoreria ADD CONSTRAINT movimientos_tesoreria_empresa_id_id_key UNIQUE (empresa_id, id);

ALTER TABLE public.cajas_chicas
    ADD CONSTRAINT cajas_chicas_cuenta_financiera_id_fkey_empresa FOREIGN KEY (empresa_id, cuenta_financiera_id)
        REFERENCES public.cuentas_financieras (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT cajas_chicas_responsable_anexo_id_fkey_empresa FOREIGN KEY (empresa_id, responsable_anexo_id)
        REFERENCES public.anexos (empresa_id, id) ON DELETE NO ACTION NOT VALID;

ALTER TABLE public.conciliaciones_bancarias
    ADD CONSTRAINT conciliaciones_bancarias_cuenta_financiera_id_fkey_empresa FOREIGN KEY (empresa_id, cuenta_financiera_id)
        REFERENCES public.cuentas_financieras (empresa_id, id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT conciliaciones_bancarias_periodo_id_fkey_empresa FOREIGN KEY (empresa_id, periodo_id)
        REFERENCES public.periodos (empresa_id, id) ON DELETE NO ACTION NOT VALID;

ALTER TABLE public.extracto_lineas
    ADD CONSTRAINT extracto_lineas_extracto_id_fkey_empresa FOREIGN KEY (empresa_id, extracto_id)
        REFERENCES public.extractos_bancarios (empresa_id, id) ON DELETE CASCADE NOT VALID,
    ADD CONSTRAINT extracto_lineas_movimiento_tesoreria_id_fkey_empresa FOREIGN KEY (empresa_id, movimiento_tesoreria_id)
        REFERENCES public.movimientos_tesoreria (empresa_id, id) ON DELETE SET NULL (movimiento_tesoreria_id) NOT VALID;

ALTER TABLE public.extractos_bancarios
    ADD CONSTRAINT extractos_bancarios_cuenta_financiera_id_fkey_empresa FOREIGN KEY (empresa_id, cuenta_financiera_id)
        REFERENCES public.cuentas_financieras (empresa_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.movimientos_tesoreria
    ADD CONSTRAINT movimientos_tesoreria_anexo_id_fkey_empresa FOREIGN KEY (empresa_id, anexo_id)
        REFERENCES public.anexos (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT movimientos_tesoreria_asiento_id_fkey_empresa FOREIGN KEY (empresa_id, asiento_id)
        REFERENCES public.asientos (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT movimientos_tesoreria_cuenta_financiera_id_fkey_empresa FOREIGN KEY (empresa_id, cuenta_financiera_id)
        REFERENCES public.cuentas_financieras (empresa_id, id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT movimientos_tesoreria_periodo_id_fkey_empresa FOREIGN KEY (empresa_id, periodo_id)
        REFERENCES public.periodos (empresa_id, id) ON DELETE NO ACTION NOT VALID;

ALTER TABLE public.rendiciones_caja_chica
    ADD CONSTRAINT rendiciones_caja_chica_asiento_reposicion_id_fkey_empresa FOREIGN KEY (empresa_id, asiento_reposicion_id)
        REFERENCES public.asientos (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT rendiciones_caja_chica_caja_chica_id_fkey_empresa FOREIGN KEY (empresa_id, caja_chica_id)
        REFERENCES public.cajas_chicas (empresa_id, id) ON DELETE CASCADE NOT VALID,
    ADD CONSTRAINT rendiciones_caja_chica_movimiento_reposicion_id_fkey_empresa FOREIGN KEY (empresa_id, movimiento_reposicion_id)
        REFERENCES public.movimientos_tesoreria (empresa_id, id) ON DELETE NO ACTION NOT VALID;

ALTER TABLE public.transferencias_cuentas
    ADD CONSTRAINT transferencias_cuentas_asiento_id_fkey_empresa FOREIGN KEY (empresa_id, asiento_id)
        REFERENCES public.asientos (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT transferencias_cuentas_cuenta_destino_id_fkey_empresa FOREIGN KEY (empresa_id, cuenta_destino_id)
        REFERENCES public.cuentas_financieras (empresa_id, id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT transferencias_cuentas_cuenta_origen_id_fkey_empresa FOREIGN KEY (empresa_id, cuenta_origen_id)
        REFERENCES public.cuentas_financieras (empresa_id, id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT transferencias_cuentas_movimiento_destino_id_fkey_empresa FOREIGN KEY (empresa_id, movimiento_destino_id)
        REFERENCES public.movimientos_tesoreria (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT transferencias_cuentas_movimiento_origen_id_fkey_empresa FOREIGN KEY (empresa_id, movimiento_origen_id)
        REFERENCES public.movimientos_tesoreria (empresa_id, id) ON DELETE NO ACTION NOT VALID,
    ADD CONSTRAINT transferencias_cuentas_periodo_id_fkey_empresa FOREIGN KEY (empresa_id, periodo_id)
        REFERENCES public.periodos (empresa_id, id) ON DELETE NO ACTION NOT VALID;

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
             'anexos', 'asientos', 'cajas_chicas', 'conciliaciones_bancarias',
             'cuentas_financieras', 'extracto_lineas', 'extractos_bancarios', 'movimientos_tesoreria',
             'periodos', 'rendiciones_caja_chica', 'transferencias_cuentas'
           )
         ORDER BY relname
    ) INTO forzadas;
    FOREACH tabla IN ARRAY forzadas LOOP
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', tabla);
    END LOOP;

    ALTER TABLE public.cajas_chicas
        VALIDATE CONSTRAINT cajas_chicas_cuenta_financiera_id_fkey_empresa,
        VALIDATE CONSTRAINT cajas_chicas_responsable_anexo_id_fkey_empresa;
    ALTER TABLE public.conciliaciones_bancarias
        VALIDATE CONSTRAINT conciliaciones_bancarias_cuenta_financiera_id_fkey_empresa,
        VALIDATE CONSTRAINT conciliaciones_bancarias_periodo_id_fkey_empresa;
    ALTER TABLE public.extracto_lineas
        VALIDATE CONSTRAINT extracto_lineas_extracto_id_fkey_empresa,
        VALIDATE CONSTRAINT extracto_lineas_movimiento_tesoreria_id_fkey_empresa;
    ALTER TABLE public.extractos_bancarios
        VALIDATE CONSTRAINT extractos_bancarios_cuenta_financiera_id_fkey_empresa;
    ALTER TABLE public.movimientos_tesoreria
        VALIDATE CONSTRAINT movimientos_tesoreria_anexo_id_fkey_empresa,
        VALIDATE CONSTRAINT movimientos_tesoreria_asiento_id_fkey_empresa,
        VALIDATE CONSTRAINT movimientos_tesoreria_cuenta_financiera_id_fkey_empresa,
        VALIDATE CONSTRAINT movimientos_tesoreria_periodo_id_fkey_empresa;
    ALTER TABLE public.rendiciones_caja_chica
        VALIDATE CONSTRAINT rendiciones_caja_chica_asiento_reposicion_id_fkey_empresa,
        VALIDATE CONSTRAINT rendiciones_caja_chica_caja_chica_id_fkey_empresa,
        VALIDATE CONSTRAINT rendiciones_caja_chica_movimiento_reposicion_id_fkey_empresa;
    ALTER TABLE public.transferencias_cuentas
        VALIDATE CONSTRAINT transferencias_cuentas_asiento_id_fkey_empresa,
        VALIDATE CONSTRAINT transferencias_cuentas_cuenta_destino_id_fkey_empresa,
        VALIDATE CONSTRAINT transferencias_cuentas_cuenta_origen_id_fkey_empresa,
        VALIDATE CONSTRAINT transferencias_cuentas_movimiento_destino_id_fkey_empresa,
        VALIDATE CONSTRAINT transferencias_cuentas_movimiento_origen_id_fkey_empresa,
        VALIDATE CONSTRAINT transferencias_cuentas_periodo_id_fkey_empresa;

    FOREACH tabla IN ARRAY forzadas LOOP
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabla);
    END LOOP;
END;
$validar_fks$;

ALTER TABLE public.cajas_chicas
    DROP CONSTRAINT cajas_chicas_cuenta_financiera_id_fkey,
    DROP CONSTRAINT cajas_chicas_responsable_anexo_id_fkey;
ALTER TABLE public.cajas_chicas RENAME CONSTRAINT cajas_chicas_cuenta_financiera_id_fkey_empresa TO cajas_chicas_cuenta_financiera_id_fkey;
ALTER TABLE public.cajas_chicas RENAME CONSTRAINT cajas_chicas_responsable_anexo_id_fkey_empresa TO cajas_chicas_responsable_anexo_id_fkey;

ALTER TABLE public.conciliaciones_bancarias
    DROP CONSTRAINT conciliaciones_bancarias_cuenta_financiera_id_fkey,
    DROP CONSTRAINT conciliaciones_bancarias_periodo_id_fkey;
ALTER TABLE public.conciliaciones_bancarias RENAME CONSTRAINT conciliaciones_bancarias_cuenta_financiera_id_fkey_empresa TO conciliaciones_bancarias_cuenta_financiera_id_fkey;
ALTER TABLE public.conciliaciones_bancarias RENAME CONSTRAINT conciliaciones_bancarias_periodo_id_fkey_empresa TO conciliaciones_bancarias_periodo_id_fkey;

ALTER TABLE public.extracto_lineas
    DROP CONSTRAINT extracto_lineas_extracto_id_fkey,
    DROP CONSTRAINT extracto_lineas_movimiento_tesoreria_id_fkey;
ALTER TABLE public.extracto_lineas RENAME CONSTRAINT extracto_lineas_extracto_id_fkey_empresa TO extracto_lineas_extracto_id_fkey;
ALTER TABLE public.extracto_lineas RENAME CONSTRAINT extracto_lineas_movimiento_tesoreria_id_fkey_empresa TO extracto_lineas_movimiento_tesoreria_id_fkey;

ALTER TABLE public.extractos_bancarios
    DROP CONSTRAINT extractos_bancarios_cuenta_financiera_id_fkey;
ALTER TABLE public.extractos_bancarios RENAME CONSTRAINT extractos_bancarios_cuenta_financiera_id_fkey_empresa TO extractos_bancarios_cuenta_financiera_id_fkey;

ALTER TABLE public.movimientos_tesoreria
    DROP CONSTRAINT movimientos_tesoreria_anexo_id_fkey,
    DROP CONSTRAINT movimientos_tesoreria_asiento_id_fkey,
    DROP CONSTRAINT movimientos_tesoreria_cuenta_financiera_id_fkey,
    DROP CONSTRAINT movimientos_tesoreria_periodo_id_fkey;
ALTER TABLE public.movimientos_tesoreria RENAME CONSTRAINT movimientos_tesoreria_anexo_id_fkey_empresa TO movimientos_tesoreria_anexo_id_fkey;
ALTER TABLE public.movimientos_tesoreria RENAME CONSTRAINT movimientos_tesoreria_asiento_id_fkey_empresa TO movimientos_tesoreria_asiento_id_fkey;
ALTER TABLE public.movimientos_tesoreria RENAME CONSTRAINT movimientos_tesoreria_cuenta_financiera_id_fkey_empresa TO movimientos_tesoreria_cuenta_financiera_id_fkey;
ALTER TABLE public.movimientos_tesoreria RENAME CONSTRAINT movimientos_tesoreria_periodo_id_fkey_empresa TO movimientos_tesoreria_periodo_id_fkey;

ALTER TABLE public.rendiciones_caja_chica
    DROP CONSTRAINT rendiciones_caja_chica_asiento_reposicion_id_fkey,
    DROP CONSTRAINT rendiciones_caja_chica_caja_chica_id_fkey,
    DROP CONSTRAINT rendiciones_caja_chica_movimiento_reposicion_id_fkey;
ALTER TABLE public.rendiciones_caja_chica RENAME CONSTRAINT rendiciones_caja_chica_asiento_reposicion_id_fkey_empresa TO rendiciones_caja_chica_asiento_reposicion_id_fkey;
ALTER TABLE public.rendiciones_caja_chica RENAME CONSTRAINT rendiciones_caja_chica_caja_chica_id_fkey_empresa TO rendiciones_caja_chica_caja_chica_id_fkey;
ALTER TABLE public.rendiciones_caja_chica RENAME CONSTRAINT rendiciones_caja_chica_movimiento_reposicion_id_fkey_empresa TO rendiciones_caja_chica_movimiento_reposicion_id_fkey;

ALTER TABLE public.transferencias_cuentas
    DROP CONSTRAINT transferencias_cuentas_asiento_id_fkey,
    DROP CONSTRAINT transferencias_cuentas_cuenta_destino_id_fkey,
    DROP CONSTRAINT transferencias_cuentas_cuenta_origen_id_fkey,
    DROP CONSTRAINT transferencias_cuentas_movimiento_destino_id_fkey,
    DROP CONSTRAINT transferencias_cuentas_movimiento_origen_id_fkey,
    DROP CONSTRAINT transferencias_cuentas_periodo_id_fkey;
ALTER TABLE public.transferencias_cuentas RENAME CONSTRAINT transferencias_cuentas_asiento_id_fkey_empresa TO transferencias_cuentas_asiento_id_fkey;
ALTER TABLE public.transferencias_cuentas RENAME CONSTRAINT transferencias_cuentas_cuenta_destino_id_fkey_empresa TO transferencias_cuentas_cuenta_destino_id_fkey;
ALTER TABLE public.transferencias_cuentas RENAME CONSTRAINT transferencias_cuentas_cuenta_origen_id_fkey_empresa TO transferencias_cuentas_cuenta_origen_id_fkey;
ALTER TABLE public.transferencias_cuentas RENAME CONSTRAINT transferencias_cuentas_movimiento_destino_id_fkey_empresa TO transferencias_cuentas_movimiento_destino_id_fkey;
ALTER TABLE public.transferencias_cuentas RENAME CONSTRAINT transferencias_cuentas_movimiento_origen_id_fkey_empresa TO transferencias_cuentas_movimiento_origen_id_fkey;
ALTER TABLE public.transferencias_cuentas RENAME CONSTRAINT transferencias_cuentas_periodo_id_fkey_empresa TO transferencias_cuentas_periodo_id_fkey;
