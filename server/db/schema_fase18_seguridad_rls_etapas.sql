-- FASE 18: Corrección de subdiarios_tipo_check y activación de RLS en etapas restantes

-- 1. Permitir todos los tipos operativos en subdiarios (evita SQLSTATE 23514)
ALTER TABLE public.subdiarios DROP CONSTRAINT IF EXISTS subdiarios_tipo_check;
ALTER TABLE public.subdiarios ADD CONSTRAINT subdiarios_tipo_check
  CHECK (tipo IN (
    'APERTURA', 'COMPRAS', 'VENTAS', 'COBRANZAS', 'PAGOS', 'BANCOS', 'BANCO',
    'CAJA', 'PLANILLA', 'HONORARIOS', 'DIARIO', 'PROVISIONES', 'AJUSTES', 'DESTINO', 'CIERRE'
  ));

ALTER TABLE public.subdiarios DROP CONSTRAINT IF EXISTS chk_subdiarios_tipo_operacion;
ALTER TABLE public.subdiarios ADD CONSTRAINT chk_subdiarios_tipo_operacion
  CHECK (tipo_operacion IN (
    'APERTURA', 'COMPRAS', 'VENTAS', 'COBRANZAS', 'PAGOS', 'BANCOS', 'BANCO',
    'CAJA', 'PLANILLA', 'HONORARIOS', 'DIARIO', 'PROVISIONES', 'AJUSTES', 'DESTINO', 'CIERRE'
  ));

-- 2. Activar RLS con política de aislamiento en las 41 tablas operativas de ETAPAS_RLS (completando las 64 tablas con RLS)

-- 5.1 CRITICA
DROP POLICY IF EXISTS aislamiento_atlob ON public.credenciales_sunat;
CREATE POLICY aislamiento_atlob ON public.credenciales_sunat
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.credenciales_sunat ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.sunat_empresa_keys;
CREATE POLICY aislamiento_atlob ON public.sunat_empresa_keys
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.sunat_empresa_keys ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.sunat_tokens;
CREATE POLICY aislamiento_atlob ON public.sunat_tokens
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.sunat_tokens ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.sunat_conexiones;
CREATE POLICY aislamiento_atlob ON public.sunat_conexiones
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.sunat_conexiones ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.sunat_jobs;
CREATE POLICY aislamiento_atlob ON public.sunat_jobs
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.sunat_jobs ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.refresh_tokens;
CREATE POLICY aislamiento_atlob ON public.refresh_tokens
  USING (usuario_id = NULLIF(current_setting('app.usuario_id', true), '')::uuid)
  WITH CHECK (usuario_id = NULLIF(current_setting('app.usuario_id', true), '')::uuid);
ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.membresias;
CREATE POLICY aislamiento_atlob ON public.membresias
  USING (usuario_id = NULLIF(current_setting('app.usuario_id', true), '')::uuid)
  WITH CHECK (usuario_id = NULLIF(current_setting('app.usuario_id', true), '')::uuid);
ALTER TABLE public.membresias ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.usuario_empresa;
CREATE POLICY aislamiento_atlob ON public.usuario_empresa
  USING (usuario_id = NULLIF(current_setting('app.usuario_id', true), '')::uuid)
  WITH CHECK (usuario_id = NULLIF(current_setting('app.usuario_id', true), '')::uuid);
ALTER TABLE public.usuario_empresa ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.auditoria;
CREATE POLICY aislamiento_atlob ON public.auditoria
  USING (
    (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid) OR
    (empresa_id IS NULL AND EXISTS (
      SELECT 1 FROM public.estudio_configuracion AS estudio
      JOIN public.usuarios_estudio AS actor ON actor.id = NULLIF(current_setting('app.usuario_id', true), '')::uuid
      WHERE estudio.id AND estudio.tenant_id = auditoria.tenant_id
        AND actor.is_active AND actor.rol_global = 'ADMINISTRADOR'
    ))
  )
  WITH CHECK (
    (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid) OR
    (empresa_id IS NULL AND EXISTS (
      SELECT 1 FROM public.estudio_configuracion AS estudio
      JOIN public.usuarios_estudio AS actor ON actor.id = NULLIF(current_setting('app.usuario_id', true), '')::uuid
      WHERE estudio.id AND estudio.tenant_id = auditoria.tenant_id
        AND actor.is_active AND actor.rol_global = 'ADMINISTRADOR'
    ))
  );
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

-- 5.2a ALTA
DROP POLICY IF EXISTS aislamiento_atlob ON public.ejercicios;
CREATE POLICY aislamiento_atlob ON public.ejercicios
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.ejercicios ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.periodos;
CREATE POLICY aislamiento_atlob ON public.periodos
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.periodos ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.plan_cuentas;
CREATE POLICY aislamiento_atlob ON public.plan_cuentas
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.plan_cuentas ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.saldos_mensuales;
CREATE POLICY aislamiento_atlob ON public.saldos_mensuales
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.saldos_mensuales ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.anexos;
CREATE POLICY aislamiento_atlob ON public.anexos
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.anexos ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.consolidaciones_mensuales;
CREATE POLICY aislamiento_atlob ON public.consolidaciones_mensuales
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.consolidaciones_mensuales ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.planilla_lineas;
CREATE POLICY aislamiento_atlob ON public.planilla_lineas
  USING (EXISTS (SELECT 1 FROM public.planillas AS padre WHERE padre.id = planilla_lineas.planilla_id AND padre.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM public.planillas AS padre WHERE padre.id = planilla_lineas.planilla_id AND padre.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid));
ALTER TABLE public.planilla_lineas ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

-- 5.2b ALTA
DROP POLICY IF EXISTS aislamiento_atlob ON public.cuentas_financieras;
CREATE POLICY aislamiento_atlob ON public.cuentas_financieras
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.cuentas_financieras ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.movimientos_tesoreria;
CREATE POLICY aislamiento_atlob ON public.movimientos_tesoreria
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.movimientos_tesoreria ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.transferencias_cuentas;
CREATE POLICY aislamiento_atlob ON public.transferencias_cuentas
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.transferencias_cuentas ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.extractos_bancarios;
CREATE POLICY aislamiento_atlob ON public.extractos_bancarios
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.extractos_bancarios ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.extracto_lineas;
CREATE POLICY aislamiento_atlob ON public.extracto_lineas
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.extracto_lineas ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.conciliaciones_bancarias;
CREATE POLICY aislamiento_atlob ON public.conciliaciones_bancarias
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.conciliaciones_bancarias ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.cajas_chicas;
CREATE POLICY aislamiento_atlob ON public.cajas_chicas
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.cajas_chicas ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.rendiciones_caja_chica;
CREATE POLICY aislamiento_atlob ON public.rendiciones_caja_chica
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.rendiciones_caja_chica ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.recibos_honorarios;
CREATE POLICY aislamiento_atlob ON public.recibos_honorarios
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.recibos_honorarios ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.provisiones_sociales;
CREATE POLICY aislamiento_atlob ON public.provisiones_sociales
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.provisiones_sociales ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

-- 5.2c ALTA
DROP POLICY IF EXISTS aislamiento_atlob ON public.comprobantes_xml;
CREATE POLICY aislamiento_atlob ON public.comprobantes_xml
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.comprobantes_xml ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.declaraciones_pdt621;
CREATE POLICY aislamiento_atlob ON public.declaraciones_pdt621
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.declaraciones_pdt621 ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.declaraciones_prorrata_igv;
CREATE POLICY aislamiento_atlob ON public.declaraciones_prorrata_igv
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.declaraciones_prorrata_igv ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.declaraciones_renta_anual;
CREATE POLICY aislamiento_atlob ON public.declaraciones_renta_anual
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.declaraciones_renta_anual ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.daot_exclusiones;
CREATE POLICY aislamiento_atlob ON public.daot_exclusiones
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.daot_exclusiones ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.sire_propuestas;
CREATE POLICY aislamiento_atlob ON public.sire_propuestas
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.sire_propuestas ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.sire_propuesta_lineas;
CREATE POLICY aislamiento_atlob ON public.sire_propuesta_lineas
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.sire_propuesta_lineas ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.sire_conciliaciones;
CREATE POLICY aislamiento_atlob ON public.sire_conciliaciones
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.sire_conciliaciones ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.sire_conciliacion_lineas;
CREATE POLICY aislamiento_atlob ON public.sire_conciliacion_lineas
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.sire_conciliacion_lineas ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.ple_exportaciones;
CREATE POLICY aislamiento_atlob ON public.ple_exportaciones
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.ple_exportaciones ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.reportes_generados;
CREATE POLICY aislamiento_atlob ON public.reportes_generados
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.reportes_generados ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

-- 5.3 BAJA
DROP POLICY IF EXISTS aislamiento_atlob ON public.conceptos_planilla;
CREATE POLICY aislamiento_atlob ON public.conceptos_planilla
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.conceptos_planilla ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.config_estados_financieros;
CREATE POLICY aislamiento_atlob ON public.config_estados_financieros
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.config_estados_financieros ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.configuracion_reportes;
CREATE POLICY aislamiento_atlob ON public.configuracion_reportes
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.configuracion_reportes ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_atlob ON public.subdiarios;
CREATE POLICY aislamiento_atlob ON public.subdiarios
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
ALTER TABLE public.subdiarios ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
