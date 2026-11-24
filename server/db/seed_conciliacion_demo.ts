import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { parse } from 'dotenv';
import { Pool, type PoolClient } from 'pg';

// ============================================================================
// UUIDs DETERMINÍSTICOS (formato UUID v4 válido para validadores Zod/regex)
// ============================================================================

const DEMO_TENANT_ID = 'd0000000-0000-4000-8000-000000000001';
const DEMO_USER_ID = 'd0000000-0000-4000-8000-000000000002';
const DEMO_EMPRESA_ID = 'd0000000-0000-4000-8000-000000000003';
const DEMO_USUARIO_EMPRESA_ID = 'd0000000-0000-4000-8000-000000000004';

const DEMO_EJERCICIO_2026_ID = 'd0000000-0000-4000-8000-000000000010';
const DEMO_PERIODO_2026_09_ID = 'd0000000-0000-4000-8000-000000000011';
const DEMO_SUBDIARIO_04_ID = 'd0000000-0000-4000-8000-000000000012';

const CTA_1011_ID = 'd0000000-0000-4000-8000-000000000101';
const CTA_10411_ID = 'd0000000-0000-4000-8000-000000000102';
const CTA_10412_ID = 'd0000000-0000-4000-8000-000000000103';
const CTA_10413_ID = 'd0000000-0000-4000-8000-000000000104';
const CTA_1212_ID = 'd0000000-0000-4000-8000-000000000105';
const CTA_4212_ID = 'd0000000-0000-4000-8000-000000000106';
const CTA_6391_ID = 'd0000000-0000-4000-8000-000000000107';
const CTA_6412_ID = 'd0000000-0000-4000-8000-000000000108';
const CTA_67311_ID = 'd0000000-0000-4000-8000-000000000109';
const CTA_70111_ID = 'd0000000-0000-4000-8000-000000000110';
const CTA_7793_ID = 'd0000000-0000-4000-8000-000000000111';

const CF_BCP_ID = 'd0000000-0000-4000-8000-000000000201';
const CF_BBVA_ID = 'd0000000-0000-4000-8000-000000000202';
const CF_INTERBANK_ID = 'd0000000-0000-4000-8000-000000000203';

const MOV_BCP_ING_CONC_ID = 'd0000000-0000-4000-8000-000000000301';
const MOV_BCP_EGR_CONC_ID = 'd0000000-0000-4000-8000-000000000302';
const MOV_BCP_CHQ_TRANS_ID = 'd0000000-0000-4000-8000-000000000303';
const MOV_BCP_DEP_TRANS_ID = 'd0000000-0000-4000-8000-000000000304';
const MOV_BBVA_ING_CONC_ID = 'd0000000-0000-4000-8000-000000000305';

const EXT_BCP_ID = 'd0000000-0000-4000-8000-000000000401';
const EXT_BBVA_ID = 'd0000000-0000-4000-8000-000000000402';
const EXT_INTERBANK_ID = 'd0000000-0000-4000-8000-000000000403';

const LIN_BCP_ABONO_ID = 'd0000000-0000-4000-8000-000000000501';
const LIN_BCP_CARGO_ID = 'd0000000-0000-4000-8000-000000000502';
const LIN_BCP_ITF_ID = 'd0000000-0000-4000-8000-000000000503';
const LIN_BBVA_ABONO_ID = 'd0000000-0000-4000-8000-000000000504';
const LIN_IBK_PEND_ID = 'd0000000-0000-4000-8000-000000000505';

const ASIENTO_BCP_APERTURA_ID = 'd0000000-0000-4000-8000-000000000601';
const ASIENTO_BCP_ING_CONC_ID = 'd0000000-0000-4000-8000-000000000602';
const ASIENTO_BCP_EGR_CONC_ID = 'd0000000-0000-4000-8000-000000000603';
const ASIENTO_BCP_CHQ_TRANS_ID = 'd0000000-0000-4000-8000-000000000604';
const ASIENTO_BCP_DEP_TRANS_ID = 'd0000000-0000-4000-8000-000000000605';
const ASIENTO_BBVA_APERTURA_ID = 'd0000000-0000-4000-8000-000000000606';
const ASIENTO_BBVA_ING_CONC_ID = 'd0000000-0000-4000-8000-000000000607';
const ASIENTO_BBVA_EXTRA_MAYOR_ID = 'd0000000-0000-4000-8000-000000000608';

function uuidDeterministico(semilla: string): string {
  const hex = createHash('sha256').update(semilla).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

// ============================================================================
// 1. GUARDIA OBLIGATORIA DE ENTORNO (SOLO atlob_test LOCAL / contabilidad_app)
// ============================================================================

export function resolverUrlAtlobTest(): string {
  const localEnv = existsSync('.env') ? parse(readFileSync('.env', 'utf8')) : {};
  const rawUrl =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    localEnv.TEST_DATABASE_URL ||
    localEnv.DATABASE_URL;

  if (!rawUrl) {
    throw new Error(
      'ENTORNO_NO_CONFIGURADO: Se requiere TEST_DATABASE_URL (o DATABASE_URL) apuntando a /atlob_test local como contabilidad_app.'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL_BASE_INVALIDA: La cadena de conexión no tiene un formato de URL válido.');
  }

  if (parsed.pathname === '/sistema_contable') {
    throw new Error(
      'BASE_PROHIBIDA: Ejecución rechazada explícitamente sobre sistema_contable. Este seed solo puede ejecutarse contra /atlob_test.'
    );
  }

  const protocoloOk = ['postgres:', 'postgresql:'].includes(parsed.protocol);
  const hostOk = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  const userOk = parsed.username === 'contabilidad_app';
  const dbOk = parsed.pathname === '/atlob_test';
  const paramsOk = [...parsed.searchParams.keys()].every((k) => k === 'sslmode');

  if (!protocoloOk || !hostOk || !userOk || !dbOk || !paramsOk) {
    throw new Error(
      `GUARDIA_ENTORNO_RECHAZADA: Solo se permite /atlob_test en host local como usuario contabilidad_app (recibido: ${parsed.username || '(sin-usuario)'}@${parsed.hostname}${parsed.pathname}).`
    );
  }

  return rawUrl;
}

async function fijarContextoRls(client: PoolClient, empresaId: string, usuarioId: string): Promise<void> {
  await client.query(
    `SELECT set_config('app.empresa_id', $1, true),
            set_config('app.current_empresa_id', $1, true),
            set_config('app.usuario_id', $2, true),
            set_config('app.current_user_id', $2, true)`,
    [empresaId, usuarioId]
  );
}

interface AsientoSeedDef {
  id: string;
  numero: string;
  cuo: string;
  fecha: string;
  glosa: string;
  moneda: 'PEN' | 'USD';
  origen: 'APERTURA' | 'COBRANZA' | 'PAGO' | 'MANUAL';
  debeCuentaId: string;
  haberCuentaId: string;
  monto: string;
  glosaLineaDebe: string;
  glosaLineaHaber: string;
}

async function asegurarAsientoContabilizado(client: PoolClient, def: AsientoSeedDef): Promise<boolean> {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO asientos (
       id, empresa_id, periodo_id, subdiario_id, numero, cuo, fecha, glosa, moneda, tipo_cambio, estado, origen, created_by
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, 1.0000, 'BORRADOR', $10, $11
     )
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [
      def.id,
      DEMO_EMPRESA_ID,
      DEMO_PERIODO_2026_09_ID,
      DEMO_SUBDIARIO_04_ID,
      def.numero,
      def.cuo,
      def.fecha,
      def.glosa,
      def.moneda,
      def.origen,
      DEMO_USER_ID,
    ]
  );

  // Si ya existía, no tocar ni detalle ni cabecera para respetar triggers de inmutabilidad.
  if (inserted.rowCount === 0) {
    return false;
  }

  const detDebeId = uuidDeterministico(`seed-concil-det-debe-${def.id}`);
  const detHaberId = uuidDeterministico(`seed-concil-det-haber-${def.id}`);

  await client.query(
    `INSERT INTO asiento_detalle (
       id, asiento_id, empresa_id, linea, cuenta_id, debe, haber, glosa_linea
     ) VALUES
       ($1, $3, $4, 1, $5, $7, 0.00, $8),
       ($2, $3, $4, 2, $6, 0.00, $7, $9)
     ON CONFLICT (id) DO NOTHING`,
    [
      detDebeId,
      detHaberId,
      def.id,
      DEMO_EMPRESA_ID,
      def.debeCuentaId,
      def.haberCuentaId,
      def.monto,
      def.glosaLineaDebe,
      def.glosaLineaHaber,
    ]
  );

  await client.query(
    `UPDATE asientos
        SET estado = 'CONTABILIZADO',
            updated_by = $2,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND empresa_id = $3`,
    [def.id, DEMO_USER_ID, DEMO_EMPRESA_ID]
  );

  return true;
}

export async function ejecutarSeedConciliacionDemo(): Promise<{
  empresaId: string;
  usuarioDemoId: string;
  asientosCreadosAhora: number;
  cuentasFinancierasIds: { bcp: string; bbva: string; interbank: string };
}> {
  const passwordDemo = process.env.SEED_DEMO_PASSWORD?.trim();
  if (!passwordDemo || passwordDemo.length < 8) {
    process.exitCode = 1;
    throw new Error(
      'SEED_DEMO_PASSWORD_REQUERIDA: Defina la variable de entorno SEED_DEMO_PASSWORD (mínimo 8 caracteres) antes de ejecutar npm run seed:conciliacion-demo.'
    );
  }

  const connectionString = resolverUrlAtlobTest();
  const passwordHash = await bcrypt.hash(passwordDemo, 10);
  const pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 5000 });

  const client = await pool.connect();
  try {
    // Verificación explícita de sesión en PostgreSQL real
    const {
      rows: [identidad],
    } = await client.query<{ db_name: string; db_user: string }>(
      'SELECT current_database() AS db_name, current_user AS db_user'
    );

    if (identidad?.db_name !== 'atlob_test' || identidad?.db_user !== 'contabilidad_app') {
      throw new Error(
        `SESION_BD_INVALIDA: Se esperaba atlob_test/contabilidad_app y se obtuvo ${identidad?.db_name}/${identidad?.db_user}.`
      );
    }

    await client.query('BEGIN');
    await fijarContextoRls(client, '', '');

    // ----------------------------------------------------------------------
    // A. Tablas globales/inmutables de control y maestros (ON CONFLICT DO NOTHING)
    // ----------------------------------------------------------------------
    await client.query(
      `INSERT INTO tenants (id, nombre, subdominio, estado)
       VALUES ($1, 'Tenant Demo Conciliación V2', 'demo-conciliacion-v2', 'ACTIVO')
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_TENANT_ID]
    );

    await client.query(
      `INSERT INTO estudio_configuracion (
         id, tenant_id, nombre_estudio, ruc_estudio, email_contacto, telefono_contacto, direccion_fiscal, mfa_requerido
       ) VALUES (
         TRUE, $1, 'Estudio Contable Atlob Demo', '20990001234', 'admin.demo@atlob.pe', '01-555-0100',
         'Av. Javier Prado Este 1234, San Isidro, Lima', FALSE
       )
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_TENANT_ID]
    );

    await client.query(
      `INSERT INTO usuarios_estudio (
         id, email, password_hash, nombre, rol_global, mfa_activado, is_active
       ) VALUES (
         $1, 'admin.demo@atlob.pe', $2, 'Administrador Demo Conciliación', 'ADMINISTRADOR', FALSE, TRUE
       )
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_USER_ID, passwordHash]
    );

    await client.query(
      `INSERT INTO empresas (
         id, tenant_id, codigo_empresa, ruc, razon_social, nombre_comercial,
         regimen_tributario, domicilio_fiscal, moneda_principal, is_active
       ) VALUES (
         $1, $2, 'DEMO-CV2', '20990001234', 'ATLOB DEMO CONCILIACION V2 SAC', 'ATLOB DEMO CONCILIACION V2',
         'REGIMEN_GENERAL', 'Av. Javier Prado Este 1234, San Isidro, Lima', 'PEN', TRUE
       )
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_EMPRESA_ID, DEMO_TENANT_ID]
    );

    // Membresía para admin.demo@atlob.pe (RLS por app.usuario_id)
    await fijarContextoRls(client, DEMO_EMPRESA_ID, DEMO_USER_ID);
    await client.query(
      `INSERT INTO usuario_empresa (id, usuario_id, empresa_id, rol_en_empresa, estado)
       VALUES ($1, $2, $3, 'ADMINISTRADOR', 'ACTIVO')
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_USUARIO_EMPRESA_ID, DEMO_USER_ID, DEMO_EMPRESA_ID]
    );

    // Otorgar membresía ADMINISTRADOR en la empresa demo a cualquier otro ADMINISTRADOR activo existente
    const adminsRes = await client.query<{ id: string }>(
      `SELECT id::text AS id
         FROM usuarios_estudio
        WHERE rol_global = 'ADMINISTRADOR'
          AND is_active = TRUE
          AND id <> $1`,
      [DEMO_USER_ID]
    );

    for (const admin of adminsRes.rows) {
      await fijarContextoRls(client, DEMO_EMPRESA_ID, admin.id);
      const ueId = uuidDeterministico(`seed-concil-ue-${admin.id}-${DEMO_EMPRESA_ID}`);
      await client.query(
        `INSERT INTO usuario_empresa (id, usuario_id, empresa_id, rol_en_empresa, estado)
         VALUES ($1, $2, $3, 'ADMINISTRADOR', 'ACTIVO')
         ON CONFLICT DO NOTHING`,
        [ueId, admin.id, DEMO_EMPRESA_ID]
      );
    }

    // Contexto RLS de empresa demo para estructura contable y tesorería
    await fijarContextoRls(client, DEMO_EMPRESA_ID, DEMO_USER_ID);

    await client.query(
      `INSERT INTO ejercicios (id, empresa_id, anio, estado)
       VALUES ($1, $2, 2026, 'ABIERTO')
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_EJERCICIO_2026_ID, DEMO_EMPRESA_ID]
    );

    await client.query(
      `INSERT INTO periodos (id, empresa_id, ejercicio_id, anio, mes, codigo_periodo, estado)
       VALUES ($1, $2, $3, 2026, 9, '2026-09', 'ABIERTO')
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_PERIODO_2026_09_ID, DEMO_EMPRESA_ID, DEMO_EJERCICIO_2026_ID]
    );

    await client.query(
      `INSERT INTO subdiarios (
         id, empresa_id, codigo, descripcion, tipo, is_active, nombre, tipo_operacion, permite_asiento_manual, es_sistema, activo, orden
       ) VALUES (
         $1, $2, '04', 'Bancos y Tesorería', 'BANCOS', TRUE, 'Bancos y Tesorería', 'BANCO', TRUE, TRUE, TRUE, 4
       )
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_SUBDIARIO_04_ID, DEMO_EMPRESA_ID]
    );

    // Plan de cuentas mínimo completo (todas imputables, activas y sin requisitos extras de anexo/doc)
    const cuentasPlan: Array<{
      id: string;
      codigo: string;
      nombre: string;
      nivel: number;
      tipo: 'ACTIVO' | 'PASIVO' | 'GASTO' | 'INGRESO';
      naturaleza: 'DEUDORA' | 'ACREEDORA';
      moneda: 'PEN' | 'USD';
    }> = [
      { id: CTA_1011_ID, codigo: '1011', nombre: 'Caja MN', nivel: 4, tipo: 'ACTIVO', naturaleza: 'DEUDORA', moneda: 'PEN' },
      { id: CTA_10411_ID, codigo: '10411', nombre: 'BCP Cta Cte MN', nivel: 5, tipo: 'ACTIVO', naturaleza: 'DEUDORA', moneda: 'PEN' },
      { id: CTA_10412_ID, codigo: '10412', nombre: 'BBVA Cta Cte ME', nivel: 5, tipo: 'ACTIVO', naturaleza: 'DEUDORA', moneda: 'USD' },
      { id: CTA_10413_ID, codigo: '10413', nombre: 'Interbank Cta Cte MN', nivel: 5, tipo: 'ACTIVO', naturaleza: 'DEUDORA', moneda: 'PEN' },
      { id: CTA_1212_ID, codigo: '1212', nombre: 'Emitidas en cartera', nivel: 4, tipo: 'ACTIVO', naturaleza: 'DEUDORA', moneda: 'PEN' },
      { id: CTA_4212_ID, codigo: '4212', nombre: 'Emitidas', nivel: 4, tipo: 'PASIVO', naturaleza: 'ACREEDORA', moneda: 'PEN' },
      { id: CTA_6391_ID, codigo: '6391', nombre: 'Gastos bancarios', nivel: 4, tipo: 'GASTO', naturaleza: 'DEUDORA', moneda: 'PEN' },
      { id: CTA_6412_ID, codigo: '6412', nombre: 'Impuesto a las transacciones financieras', nivel: 4, tipo: 'GASTO', naturaleza: 'DEUDORA', moneda: 'PEN' },
      { id: CTA_67311_ID, codigo: '67311', nombre: 'Préstamos de instituciones financieras', nivel: 5, tipo: 'GASTO', naturaleza: 'DEUDORA', moneda: 'PEN' },
      { id: CTA_70111_ID, codigo: '70111', nombre: 'Mercaderías manufacturadas - Terceros', nivel: 5, tipo: 'INGRESO', naturaleza: 'ACREEDORA', moneda: 'PEN' },
      { id: CTA_7793_ID, codigo: '7793', nombre: 'Otros ingresos financieros', nivel: 4, tipo: 'INGRESO', naturaleza: 'ACREEDORA', moneda: 'PEN' },
    ];

    for (const cta of cuentasPlan) {
      await client.query(
        `INSERT INTO plan_cuentas (
           id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento,
           requiere_anexo, requiere_doc_ref, requiere_centro_costo, requiere_vencimiento,
           is_active, es_registro, es_inactiva, naturaleza, naturaleza_saldo, moneda_cuenta
         ) VALUES (
           $1, $2, $3, $4, $5, $6, TRUE,
           FALSE, FALSE, FALSE, FALSE,
           TRUE, TRUE, FALSE, $7, $7, $8
         )
         ON CONFLICT (id) DO NOTHING`,
        [cta.id, DEMO_EMPRESA_ID, cta.codigo, cta.nombre, cta.nivel, cta.tipo, cta.naturaleza, cta.moneda]
      );
    }

    // Asientos contables inmutables (idempotente: solo crea detalle/contabiliza si se insertó recién)
    const asientosDef: AsientoSeedDef[] = [
      // BCP 10411: Saldo previo 10,000 + 5,000 - 1,200 - 2,450 + 1,500 = 12,850.00 (cuadra exacto con Tesorería)
      {
        id: ASIENTO_BCP_APERTURA_ID,
        numero: '04090001',
        cuo: 'DEMO-CV2-04090001',
        fecha: '2026-09-01',
        glosa: 'Saldo inicial cuenta BCP Cta Cte MN',
        moneda: 'PEN',
        origen: 'APERTURA',
        debeCuentaId: CTA_10411_ID,
        haberCuentaId: CTA_1212_ID,
        monto: '10000.00',
        glosaLineaDebe: 'Saldo inicial BCP MN',
        glosaLineaHaber: 'Contrapartida saldo inicial BCP MN',
      },
      {
        id: ASIENTO_BCP_ING_CONC_ID,
        numero: '04090002',
        cuo: 'DEMO-CV2-04090002',
        fecha: '2026-09-05',
        glosa: 'Cobranza Factura F001-00410 Cliente Andina (OP-9001)',
        moneda: 'PEN',
        origen: 'COBRANZA',
        debeCuentaId: CTA_10411_ID,
        haberCuentaId: CTA_1212_ID,
        monto: '5000.00',
        glosaLineaDebe: 'Ingreso BCP OP-9001',
        glosaLineaHaber: 'Cancelación factura cliente Andina',
      },
      {
        id: ASIENTO_BCP_EGR_CONC_ID,
        numero: '04090003',
        cuo: 'DEMO-CV2-04090003',
        fecha: '2026-09-12',
        glosa: 'Pago Proveedor Servicios Cloud SAC (OP-9002)',
        moneda: 'PEN',
        origen: 'PAGO',
        debeCuentaId: CTA_4212_ID,
        haberCuentaId: CTA_10411_ID,
        monto: '1200.00',
        glosaLineaDebe: 'Cancelación proveedor Servicios Cloud',
        glosaLineaHaber: 'Egreso BCP OP-9002',
      },
      {
        id: ASIENTO_BCP_CHQ_TRANS_ID,
        numero: '04090004',
        cuo: 'DEMO-CV2-04090004',
        fecha: '2026-09-25',
        glosa: 'Emisión Cheque N° 004182 Proveedor Logística Sur (CHQ-004182)',
        moneda: 'PEN',
        origen: 'PAGO',
        debeCuentaId: CTA_4212_ID,
        haberCuentaId: CTA_10411_ID,
        monto: '2450.00',
        glosaLineaDebe: 'Cancelación proveedor Logística Sur',
        glosaLineaHaber: 'Giro cheque CHQ-004182 BCP',
      },
      {
        id: ASIENTO_BCP_DEP_TRANS_ID,
        numero: '04090005',
        cuo: 'DEMO-CV2-04090005',
        fecha: '2026-09-29',
        glosa: 'Depósito cierre de mes Cliente Norte (DEP-7720)',
        moneda: 'PEN',
        origen: 'COBRANZA',
        debeCuentaId: CTA_10411_ID,
        haberCuentaId: CTA_1212_ID,
        monto: '1500.00',
        glosaLineaDebe: 'Depósito en tránsito DEP-7720',
        glosaLineaHaber: 'Cobranza Cliente Norte',
      },
      // BBVA 10412: Saldo previo 2,000 + 800 + 150 (asiento manual extra no reflejado en Tesorería) = 2,950.00
      {
        id: ASIENTO_BBVA_APERTURA_ID,
        numero: '04090006',
        cuo: 'DEMO-CV2-04090006',
        fecha: '2026-09-01',
        glosa: 'Saldo inicial cuenta BBVA Cta Cte ME',
        moneda: 'USD',
        origen: 'APERTURA',
        debeCuentaId: CTA_10412_ID,
        haberCuentaId: CTA_1212_ID,
        monto: '2000.00',
        glosaLineaDebe: 'Saldo inicial BBVA USD',
        glosaLineaHaber: 'Contrapartida saldo inicial BBVA USD',
      },
      {
        id: ASIENTO_BBVA_ING_CONC_ID,
        numero: '04090007',
        cuo: 'DEMO-CV2-04090007',
        fecha: '2026-09-10',
        glosa: 'Cobranza exportación USD Cliente Global (BBVA-8810)',
        moneda: 'USD',
        origen: 'COBRANZA',
        debeCuentaId: CTA_10412_ID,
        haberCuentaId: CTA_1212_ID,
        monto: '800.00',
        glosaLineaDebe: 'Ingreso BBVA USD BBVA-8810',
        glosaLineaHaber: 'Cancelación factura Cliente Global',
      },
      {
        id: ASIENTO_BBVA_EXTRA_MAYOR_ID,
        numero: '04090008',
        cuo: 'DEMO-CV2-04090008',
        fecha: '2026-09-22',
        glosa: 'Ajuste contable directo en 10412 sin reflejo en Tesorería',
        moneda: 'USD',
        origen: 'MANUAL',
        debeCuentaId: CTA_10412_ID,
        haberCuentaId: CTA_7793_ID,
        monto: '150.00',
        glosaLineaDebe: 'Cargo directo Mayor 10412 (genera alerta de integridad)',
        glosaLineaHaber: 'Otros ingresos financieros',
      },
    ];

    let asientosCreadosAhora = 0;
    for (const def of asientosDef) {
      const creado = await asegurarAsientoContabilizado(client, def);
      if (creado) asientosCreadosAhora += 1;
    }

    // ----------------------------------------------------------------------
    // B. Tablas mutables de Tesorería / Conciliación V2: limpiar y resembrar
    // ----------------------------------------------------------------------
    await client.query(`DELETE FROM conciliaciones_bancarias WHERE empresa_id = $1`, [DEMO_EMPRESA_ID]);
    await client.query(`DELETE FROM extracto_lineas WHERE empresa_id = $1`, [DEMO_EMPRESA_ID]);
    await client.query(`DELETE FROM extractos_bancarios WHERE empresa_id = $1`, [DEMO_EMPRESA_ID]);
    await client.query(`DELETE FROM movimientos_tesoreria WHERE empresa_id = $1`, [DEMO_EMPRESA_ID]);
    await client.query(`DELETE FROM conciliacion_config_empresa WHERE empresa_id = $1`, [DEMO_EMPRESA_ID]);
    await client.query(`DELETE FROM cuentas_financieras WHERE empresa_id = $1`, [DEMO_EMPRESA_ID]);

    // 1. Configuración Conciliación V2 de la empresa demo
    await client.query(
      `INSERT INTO conciliacion_config_empresa (
         empresa_id, conciliacion_v2_habilitada, tolerancia_dias, tolerancia_monto,
         cuenta_itf_codigo, cuenta_comision_codigo, cuenta_interes_gasto_codigo, cuenta_interes_ingreso_codigo,
         updated_by
       ) VALUES (
         $1, TRUE, 3, 0.00,
         '6412', '6391', '67311', NULL,
         $2
       )`,
      [DEMO_EMPRESA_ID, DEMO_USER_ID]
    );

    // 2. Tres cuentas financieras demo
    await client.query(
      `INSERT INTO cuentas_financieras (
         id, empresa_id, tipo, banco, numero, cci, alias, moneda,
         cuenta_contable_codigo, cuenta_contable_id, saldo_inicial, saldo_actual, activa
       ) VALUES
         ($1, $4, 'BANCO', 'BCP',       '191-99887766-0-11',     '00219100998877660112', 'BCP Cta Cte MN Principal',          'PEN', '10411', $5,   10000.00, 12850.00, TRUE),
         ($2, $4, 'BANCO', 'BBVA',      '0011-0123-0100045678',  '01112300010004567890', 'BBVA Cta Cte ME USD',               'USD', '10412', $6,    2000.00,  2800.00, TRUE),
         ($3, $4, 'BANCO', 'INTERBANK', '200-3004005001',        '00320000300400500133', 'Interbank Cta Cte MN (Por Vincular)', 'PEN', '1041', NULL,     0.00,     0.00, TRUE)`,
      [CF_BCP_ID, CF_BBVA_ID, CF_INTERBANK_ID, DEMO_EMPRESA_ID, CTA_10411_ID, CTA_10412_ID]
    );

    // 3. Movimientos de tesorería en 2026-09 (estado = 'REGISTRADO')
    await client.query(
      `INSERT INTO movimientos_tesoreria (
         id, empresa_id, periodo_id, cuenta_financiera_id, fecha, tipo, medio_pago,
         numero_operacion, moneda, tipo_cambio, importe, glosa, estado, conciliado, asiento_id, created_by
       ) VALUES
         ($1,  $6, $7, $8,  '2026-09-05', 'INGRESO', '003', 'OP-9001',    'PEN', 1.0000, 5000.00, 'Cobranza Factura F001-00410 Cliente Andina',       'REGISTRADO', TRUE,  $10, $15),
         ($2,  $6, $7, $8,  '2026-09-12', 'EGRESO',  '003', 'OP-9002',    'PEN', 1.0000, 1200.00, 'Pago Proveedor Servicios Cloud SAC',               'REGISTRADO', TRUE,  $11, $15),
         ($3,  $6, $7, $8,  '2026-09-25', 'EGRESO',  '007', 'CHQ-004182', 'PEN', 1.0000, 2450.00, 'Cheque N° 004182 Proveedor Logística Sur',         'REGISTRADO', FALSE, $12, $15),
         ($4,  $6, $7, $8,  '2026-09-29', 'INGRESO', '001', 'DEP-7720',   'PEN', 1.0000, 1500.00, 'Depósito en tránsito cierre de mes Cliente Norte', 'REGISTRADO', FALSE, $13, $15),
         ($5,  $6, $7, $9,  '2026-09-10', 'INGRESO', '003', 'BBVA-8810',  'USD', 1.0000,  800.00, 'Cobranza exportación USD Cliente Global',          'REGISTRADO', TRUE,  $14, $15)`,
      [
        MOV_BCP_ING_CONC_ID,
        MOV_BCP_EGR_CONC_ID,
        MOV_BCP_CHQ_TRANS_ID,
        MOV_BCP_DEP_TRANS_ID,
        MOV_BBVA_ING_CONC_ID,
        DEMO_EMPRESA_ID,
        DEMO_PERIODO_2026_09_ID,
        CF_BCP_ID,
        CF_BBVA_ID,
        ASIENTO_BCP_ING_CONC_ID,
        ASIENTO_BCP_EGR_CONC_ID,
        ASIENTO_BCP_CHQ_TRANS_ID,
        ASIENTO_BCP_DEP_TRANS_ID,
        ASIENTO_BBVA_ING_CONC_ID,
        DEMO_USER_ID,
      ]
    );

    // 4. Extractos bancarios 2026-09 para las 3 cuentas
    await client.query(
      `INSERT INTO extractos_bancarios (
         id, empresa_id, cuenta_financiera_id, nombre_archivo,
         fecha_corte_desde, fecha_corte_hasta, saldo_inicial, saldo_final, hash_archivo, estado
       ) VALUES
         ($1, $4, $5, 'extracto_bcp_2026_09.csv',       '2026-09-01', '2026-09-30', 10000.00, 13794.50, 'demo-hash-bcp-2026-09', 'CARGADO'),
         ($2, $4, $6, 'extracto_bbva_2026_09.csv',      '2026-09-01', '2026-09-30',  2000.00,  2800.00, 'demo-hash-bbva-2026-09', 'CONCILIADO'),
         ($3, $4, $7, 'extracto_interbank_2026_09.csv', '2026-09-01', '2026-09-30',     0.00,   950.00, 'demo-hash-ibk-2026-09', 'CARGADO')`,
      [EXT_BCP_ID, EXT_BBVA_ID, EXT_INTERBANK_ID, DEMO_EMPRESA_ID, CF_BCP_ID, CF_BBVA_ID, CF_INTERBANK_ID]
    );

    // 5. Líneas de extracto bancario 2026-09
    await client.query(
      `INSERT INTO extracto_lineas (
         id, extracto_id, empresa_id, fecha, descripcion, referencia, monto, saldo,
         conciliada, estado_conciliacion, movimiento_tesoreria_id
       ) VALUES
         ($1, $6, $9, '2026-09-05', 'TRANSF. RECIBIDA CLIENTE ANDINA',          'OP-9001',    5000.00, 15000.00, TRUE,  'CONCILIADO',         $10),
         ($2, $6, $9, '2026-09-12', 'TRANSF. A PROV. SERVICIOS CLOUD',          'OP-9002',   -1200.00, 13800.00, TRUE,  'CONCILIADO',         $11),
         ($3, $6, $9, '2026-09-30', 'IMPUESTO TRANSACCIONES FINANCIERAS ITF',   'ITF-092026',    -5.50, 13794.50, FALSE, 'CARGO_BANCARIO_ITF', NULL),
         ($4, $7, $9, '2026-09-10', 'ABONO TRANSF. INTERNACIONAL',              'BBVA-8810',   800.00,  2800.00, TRUE,  'CONCILIADO',         $12),
         ($5, $8, $9, '2026-09-18', 'ABONO DEPOSITO VENTANILLA SIN REGISTRAR',  'IBK-5501',    950.00,   950.00, FALSE, 'PENDIENTE_LIBROS',   NULL)`,
      [
        LIN_BCP_ABONO_ID,
        LIN_BCP_CARGO_ID,
        LIN_BCP_ITF_ID,
        LIN_BBVA_ABONO_ID,
        LIN_IBK_PEND_ID,
        EXT_BCP_ID,
        EXT_BBVA_ID,
        EXT_INTERBANK_ID,
        DEMO_EMPRESA_ID,
        MOV_BCP_ING_CONC_ID,
        MOV_BCP_EGR_CONC_ID,
        MOV_BBVA_ING_CONC_ID,
      ]
    );

    await client.query('COMMIT');

    return {
      empresaId: DEMO_EMPRESA_ID,
      usuarioDemoId: DEMO_USER_ID,
      asientosCreadosAhora,
      cuentasFinancierasIds: {
        bcp: CF_BCP_ID,
        bbva: CF_BBVA_ID,
        interbank: CF_INTERBANK_ID,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const resultado = await ejecutarSeedConciliacionDemo();
  console.log('✅ [Seed Conciliación V2] Dataset demo sembrado idempotente en atlob_test.');
  console.log(`   - Empresa demo: ATLOB DEMO CONCILIACION V2 SAC (RUC 20990001234, ID ${resultado.empresaId})`);
  console.log(`   - Usuario admin demo: admin.demo@atlob.pe (ID ${resultado.usuarioDemoId}; clave definida en SEED_DEMO_PASSWORD)`);
  console.log(`   - Asientos contables nuevos creados en esta ejecución: ${resultado.asientosCreadosAhora}`);
  console.log(`   - Cuentas financieras: BCP=${resultado.cuentasFinancierasIds.bcp} | BBVA=${resultado.cuentasFinancierasIds.bbva} | INTERBANK=${resultado.cuentasFinancierasIds.interbank}`);
}

const esEjecucionDirecta =
  typeof process.argv[1] === 'string' && process.argv[1].replace(/\\/g, '/').endsWith('seed_conciliacion_demo.ts');

if (esEjecucionDirecta) {
  main().catch((err) => {
    console.error('❌ [Seed Conciliación V2] Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
