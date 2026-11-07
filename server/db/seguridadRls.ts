import type { PoolClient } from 'pg';

const empresaActiva = "NULLIF(current_setting('app.empresa_id', true), '')::uuid";
const usuarioActivo = "NULLIF(current_setting('app.usuario_id', true), '')::uuid";
const porEmpresa = `empresa_id = ${empresaActiva}`;
const porUsuario = `usuario_id = ${usuarioActivo}`;
const porEstudio = `empresa_id IS NULL AND EXISTS (
  SELECT 1 FROM public.estudio_configuracion AS estudio
  JOIN public.usuarios_estudio AS actor ON actor.id = ${usuarioActivo}
  WHERE estudio.id AND estudio.tenant_id = auditoria.tenant_id
    AND actor.is_active AND actor.rol_global = 'ADMINISTRADOR'
)`;

function politicas(tablas: string[], expresion = porEmpresa): [string, string][] {
  return tablas.map(tabla => [tabla, expresion]);
}

export const ETAPAS_RLS = [
  { id: '5.1', tablas: [
    ...politicas(['credenciales_sunat', 'sunat_empresa_keys', 'sunat_tokens', 'sunat_conexiones', 'sunat_jobs']),
    ...politicas(['refresh_tokens', 'membresias', 'usuario_empresa'], porUsuario),
    ...politicas(['auditoria'], `(${porEmpresa}) OR (${porEstudio})`),
  ] },
  { id: '5.2a', tablas: [
    ...politicas(['ejercicios', 'periodos', 'plan_cuentas', 'saldos_mensuales', 'anexos', 'consolidaciones_mensuales']),
    ...politicas(['planilla_lineas'], `EXISTS (SELECT 1 FROM public.planillas AS padre
      WHERE padre.id = planilla_lineas.planilla_id AND padre.empresa_id = ${empresaActiva})`),
  ] },
  { id: '5.2b', tablas: politicas([
    'cuentas_financieras', 'movimientos_tesoreria', 'transferencias_cuentas', 'extractos_bancarios',
    'extracto_lineas', 'conciliaciones_bancarias', 'cajas_chicas', 'rendiciones_caja_chica',
    'recibos_honorarios', 'provisiones_sociales',
  ]) },
  { id: '5.2c', tablas: politicas([
    'comprobantes_xml', 'declaraciones_pdt621', 'declaraciones_prorrata_igv', 'declaraciones_renta_anual',
    'daot_exclusiones', 'sire_propuestas', 'sire_propuesta_lineas', 'sire_conciliaciones',
    'sire_conciliacion_lineas', 'ple_exportaciones', 'reportes_generados',
  ]) },
  { id: '5.3', tablas: politicas(['conceptos_planilla', 'config_estados_financieros', 'configuracion_reportes', 'subdiarios']) },
];

// Se ejecuta fuera del migrador de arranque. Cada etapa es atómica en la transacción del operador.
export async function aplicarEtapaRls(client: PoolClient, etapa: (typeof ETAPAS_RLS)[number]) {
  for (const [tabla, expresion] of etapa.tablas) {
    await client.query(`CREATE POLICY aislamiento_atlob ON public.${tabla} USING (${expresion}) WITH CHECK (${expresion})`);
    await client.query(`ALTER TABLE public.${tabla} ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY`);
  }
}

export async function revertirEtapaRls(client: PoolClient, etapa: (typeof ETAPAS_RLS)[number]) {
  for (const [tabla] of [...etapa.tablas].reverse()) {
    await client.query(`DROP POLICY aislamiento_atlob ON public.${tabla}`);
    await client.query(`ALTER TABLE public.${tabla} NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY`);
  }
}
