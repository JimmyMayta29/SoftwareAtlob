import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parse } from 'dotenv';
import { Pool } from 'pg';

const envConfig = fs.existsSync('.env') ? parse(fs.readFileSync('.env', 'utf8')) : {};
const connectionString =
  process.env.TEST_DATABASE_URL ||
  envConfig.TEST_DATABASE_URL ||
  'postgresql://contabilidad_app:Craxker29@localhost:5432/atlob_test';

function calcularPercentil(valores: number[], percentil: number): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const idx = Math.ceil((percentil / 100) * ordenados.length) - 1;
  return ordenados[Math.max(0, Math.min(idx, ordenados.length - 1))];
}

async function ejecutar() {
  console.log('========================================================================');
  console.log('🏛️ VALIDACIÓN EN POSTGRESQL REAL: FASE D (OPERACIÓN MULTIUSUARIO Y LAN)');
  console.log('========================================================================\n');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = connectionString;

  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  const { setPostgresPool, conContextoEmpresa } = await import('../../config/database');
  setPostgresPool(pool, true);

  const { asientoService } = await import('../../services/asientoService');
  const { compraService } = await import('../../services/compraService');
  const { ventaService } = await import('../../services/ventaService');
  const { librosEEFFService } = await import('../../services/librosEEFFService');

  const client = await pool.connect();

  const tenantId = crypto.randomUUID();
  let usuario1Id = crypto.randomUUID();
  let usuario2Id = crypto.randomUUID();
  const empresaId = crypto.randomUUID();
  const ruc = `20999${String(Date.now()).slice(-6)}`;
  const periodo = '2026-03';
  const ejercicioId = crypto.randomUUID();
  const periodoId = crypto.randomUUID();
  const proveedorId = crypto.randomUUID();
  const clienteId = crypto.randomUUID();

  try {
    console.log('--- 1. SEMBRADO DE EMPRESA Y 2 USUARIOS SIMULTÁNEOS EN POSTGRESQL ---');
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO tenants (id, nombre) VALUES ($1, 'Estudio Contable Fase D Multiusuario') ON CONFLICT (id) DO NOTHING`,
      [tenantId]
    );

    const u1Res = await client.query(
      `INSERT INTO usuarios_estudio (id, email, password_hash, nombre, rol_global, is_active)
       VALUES ($1, $2, '$2b$10$abcdefghijklmnopqrstuv', 'Contador Usuario 1', 'ADMINISTRADOR', true)
       ON CONFLICT (email) DO UPDATE SET is_active = true
       RETURNING id`,
      [usuario1Id, `u1.fased.${Date.now()}@atlob.pe`]
    );
    usuario1Id = u1Res.rows[0].id;

    const u2Res = await client.query(
      `INSERT INTO usuarios_estudio (id, email, password_hash, nombre, rol_global, is_active)
       VALUES ($1, $2, '$2b$10$abcdefghijklmnopqrstuv', 'Contador Usuario 2', 'ADMINISTRADOR', true)
       ON CONFLICT (email) DO UPDATE SET is_active = true
       RETURNING id`,
      [usuario2Id, `u2.fased.${Date.now()}@atlob.pe`]
    );
    usuario2Id = u2Res.rows[0].id;

    await client.query(
      `INSERT INTO empresas (
         id, tenant_id, codigo_empresa, ruc, razon_social, nombre_comercial,
         regimen_tributario, domicilio_fiscal, moneda_principal, metodo_inventario, is_active
       ) VALUES (
         $1, $2, $3, $4, 'CORPORACION MULTIUSUARIO FASE D S.A.C.', 'FASE D CORP',
         'REGIMEN_GENERAL', 'AV. JAVIER PRADO ESTE 2450, LIMA', 'PEN', 'PERIODICO', true
       )`,
      [empresaId, tenantId, `FD-${Date.now().toString().slice(-5)}`, ruc]
    );

    const { rows: rolRows } = await client.query(`SELECT id FROM roles WHERE codigo = 'ADMINISTRADOR' LIMIT 1`);
    const rolAdminId = rolRows.length > 0 ? rolRows[0].id : crypto.randomUUID();
    if (rolRows.length === 0) {
      await client.query(`INSERT INTO roles (id, codigo, nombre) VALUES ($1, 'ADMINISTRADOR', 'Administrador General')`, [rolAdminId]);
    }

    await client.query(
      `SELECT set_config('app.usuario_id', $1, false),
              set_config('app.user_id', $1, false),
              set_config('app.current_user_id', $1, false),
              set_config('app.empresa_id', $2, false),
              set_config('app.current_empresa_id', $2, false)`,
      [usuario1Id, empresaId]
    );

    await client.query(
      `INSERT INTO membresias (id, usuario_id, empresa_id, rol_id, is_active)
       VALUES ($1, $2, $3, $4, true)`,
      [crypto.randomUUID(), usuario1Id, empresaId, rolAdminId]
    );

    await client.query(
      `SELECT set_config('app.usuario_id', $1, false),
              set_config('app.user_id', $1, false),
              set_config('app.current_user_id', $1, false)`,
      [usuario2Id]
    );

    await client.query(
      `INSERT INTO membresias (id, usuario_id, empresa_id, rol_id, is_active)
       VALUES ($1, $2, $3, $4, true)`,
      [crypto.randomUUID(), usuario2Id, empresaId, rolAdminId]
    );

    await client.query(
      `SELECT set_config('app.usuario_id', $1, false),
              set_config('app.user_id', $1, false),
              set_config('app.current_user_id', $1, false)`,
      [usuario1Id]
    );

    await client.query(
      `INSERT INTO ejercicios (id, empresa_id, anio, estado) VALUES ($1, $2, 2026, 'ABIERTO')`,
      [ejercicioId, empresaId]
    );

    await client.query(
      `INSERT INTO periodos (id, empresa_id, ejercicio_id, mes, anio, codigo_periodo, estado)
       VALUES ($1, $2, $3, 3, 2026, $4, 'ABIERTO')`,
      [periodoId, empresaId, ejercicioId, periodo]
    );

    const subdiariosConfig = [
      { codigo: '00', descripcion: 'APERTURA', tipo: 'APERTURA', manual: true },
      { codigo: '01', descripcion: 'REGISTRO DE COMPRAS', tipo: 'COMPRAS', manual: false },
      { codigo: '02', descripcion: 'REGISTRO DE VENTAS', tipo: 'VENTAS', manual: false },
      { codigo: '03', descripcion: 'COBRANZAS Y CAJA', tipo: 'CAJA', manual: false },
      { codigo: '04', descripcion: 'PAGOS A PROVEEDORES', tipo: 'BANCO', manual: false },
      { codigo: '05', descripcion: 'BANCOS Y CUENTAS CORRIENTES', tipo: 'BANCO', manual: true },
      { codigo: '06', descripcion: 'RECIBOS POR HONORARIOS', tipo: 'HONORARIOS', manual: false },
      { codigo: '07', descripcion: 'PLANILLA DE REMUNERACIONES', tipo: 'PLANILLA', manual: false },
      { codigo: '08', descripcion: 'AJUSTES CONTABLES', tipo: 'AJUSTES', manual: true },
      { codigo: '09', descripcion: 'CIERRE CONTABLE ANUAL', tipo: 'CIERRE', manual: true },
      { codigo: '10', descripcion: 'DIARIO GENERAL', tipo: 'DIARIO', manual: true },
      { codigo: '11', descripcion: 'PROVISIONES Y DESTINO', tipo: 'PROVISIONES', manual: true },
    ];

    const subMap = new Map<string, string>();
    for (const sub of subdiariosConfig) {
      const sId = crypto.randomUUID();
      await client.query(
        `INSERT INTO subdiarios (
           id, empresa_id, codigo, descripcion, nombre, tipo, tipo_operacion,
           permite_asiento_manual, es_sistema, is_active, activo
         ) VALUES ($1, $2, $3, $4, $4, $5, $5, $6, true, true, true)`,
        [sId, empresaId, sub.codigo, sub.descripcion, sub.tipo, sub.manual]
      );
      subMap.set(sub.codigo, sId);

      await client.query(
        `INSERT INTO correlativos (empresa_id, periodo_id, subdiario_id, ultimo_numero)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (empresa_id, periodo_id, subdiario_id) DO NOTHING`,
        [empresaId, periodoId, sId]
      );
    }

    const planCuentas = [
      { c: '1041', n: 'Cuentas corrientes operativas', tipo: 'ACTIVO', cl: 'ACTIVO_CORRIENTE' },
      { c: '1212', n: 'Emitidas en cartera', tipo: 'ACTIVO', cl: 'ACTIVO_CORRIENTE' },
      { c: '2011', n: 'Mercaderías manufacturadas', tipo: 'ACTIVO', cl: 'ACTIVO_CORRIENTE' },
      { c: '20111', n: 'Mercaderías manufacturadas - Costo', tipo: 'ACTIVO', cl: 'ACTIVO_CORRIENTE' },
      { c: '40111', n: 'IGV - Cuenta propia', tipo: 'PASIVO', cl: 'PASIVO_CORRIENTE' },
      { c: '4212', n: 'Facturas por pagar emitidas', tipo: 'PASIVO', cl: 'PASIVO_CORRIENTE' },
      { c: '5011', n: 'Capital social pagado', tipo: 'PATRIMONIO', cl: 'PATRIMONIO' },
      { c: '6011', n: 'Mercaderías manufacturadas', tipo: 'GASTO', cl: 'NO_APLICA' },
      { c: '60111', n: 'Mercaderías manufacturadas - Compra', tipo: 'GASTO', cl: 'NO_APLICA' },
      { c: '6111', n: 'Variación de mercaderías', tipo: 'GASTO', cl: 'NO_APLICA' },
      { c: '61111', n: 'Variación de mercaderías manufacturadas', tipo: 'GASTO', cl: 'NO_APLICA' },
      { c: '6311', n: 'Transporte y carga', tipo: 'GASTO', cl: 'NO_APLICA' },
      { c: '69121', n: 'Mercaderías - Costo de ventas', tipo: 'GASTO', cl: 'NO_APLICA' },
      { c: '70121', n: 'Mercaderías venta local', tipo: 'INGRESO', cl: 'NO_APLICA' },
      { c: '791', n: 'Cargas imputables a cuentas de costos y gastos', tipo: 'INGRESO', cl: 'NO_APLICA' },
      { c: '941', n: 'Gastos de administración', tipo: 'GASTO', cl: 'NO_APLICA' },
    ];

    const ctaMap = new Map<string, string>();
    for (const p of planCuentas) {
      const cId = crypto.randomUUID();
      await client.query(
        `INSERT INTO plan_cuentas (
           id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento, clasificacion_eeff, is_active
         ) VALUES ($1, $2, $3, $4, 4, $5, true, $6, true)`,
        [cId, empresaId, p.c, p.n, p.tipo, p.cl]
      );
      ctaMap.set(p.c, cId);
    }

    await client.query(
      `INSERT INTO anexos (id, empresa_id, tipo_entidad, tipo_documento, numero_documento, razon_social, estado_sunat, condicion_sunat)
       VALUES
       ($1, $2, 'PROVEEDOR', '6', '20555111222', 'PROVEEDOR CONCURRENTE S.A.C.', 'ACTIVO', 'HABIDO'),
       ($3, $2, 'CLIENTE', '6', '20666333444', 'CLIENTE CONCURRENTE S.A.C.', 'ACTIVO', 'HABIDO')`,
      [proveedorId, empresaId, clienteId]
    );

    await client.query('COMMIT');
    console.log(`✅ Empresa ${ruc} y 2 usuarios simultáneos configurados en PostgreSQL.\n`);

    // =========================================================================
    // 2. EJECUCIÓN CONCURRENTE (44 OPERACIONES EN PARALELO: 22 U1 + 22 U2)
    // =========================================================================
    console.log('--- 2. EJECUCIÓN DE 44 OPERACIONES CONCURRENTES (22 USUARIO 1 + 22 USUARIO 2) ---');
    const latenciasMs: number[] = [];

    const medirOperacion = async <T>(etiqueta: string, fn: () => Promise<T>): Promise<T> => {
      const inicio = performance.now();
      const resultado = await fn();
      const duracion = performance.now() - inicio;
      latenciasMs.push(duracion);
      return resultado;
    };

    const operacionesUsuario1: Promise<any>[] = [];
    const operacionesUsuario2: Promise<any>[] = [];

    // 2.1: 10 Asientos directos por cada usuario (Subdiarios 10 y 05)
    for (let i = 1; i <= 10; i++) {
      const subCodigo = i % 2 === 0 ? '05' : '10';
      const montoU1 = 1000 + i * 10;
      const montoU2 = 2000 + i * 10;

      operacionesUsuario1.push(
        medirOperacion(`U1-Asiento-${i}`, () =>
          conContextoEmpresa(empresaId, usuario1Id, () =>
            asientoService.crearAsiento(
              empresaId,
              {
                periodoId,
                subdiarioId: subCodigo,
                fecha: `2026-03-${String((i % 25) + 1).padStart(2, '0')}`,
                glosa: `U1 Asiento Concurrente #${i}`,
                moneda: 'PEN',
                tipoCambio: 3.75,
                origen: 'MANUAL',
                detalles: [
                  { linea: 1, cuentaId: ctaMap.get('1041')!, debe: montoU1, haber: 0, glosaLinea: `Ingreso banco U1 #${i}` },
                  { linea: 2, cuentaId: ctaMap.get('5011')!, debe: 0, haber: montoU1, glosaLinea: `Aporte capital U1 #${i}` },
                ],
              },
              usuario1Id
            )
          )
        )
      );

      operacionesUsuario2.push(
        medirOperacion(`U2-Asiento-${i}`, () =>
          conContextoEmpresa(empresaId, usuario2Id, () =>
            asientoService.crearAsiento(
              empresaId,
              {
                periodoId,
                subdiarioId: subCodigo,
                fecha: `2026-03-${String((i % 25) + 1).padStart(2, '0')}`,
                glosa: `U2 Asiento Concurrente #${i}`,
                moneda: 'PEN',
                tipoCambio: 3.75,
                origen: 'MANUAL',
                detalles: [
                  { linea: 1, cuentaId: ctaMap.get('1041')!, debe: montoU2, haber: 0, glosaLinea: `Ingreso banco U2 #${i}` },
                  { linea: 2, cuentaId: ctaMap.get('5011')!, debe: 0, haber: montoU2, glosaLinea: `Aporte capital U2 #${i}` },
                ],
              },
              usuario2Id
            )
          )
        )
      );
    }

    // 2.2: 5 Compras registradas por cada usuario (Subdiario 01)
    for (let i = 1; i <= 5; i++) {
      operacionesUsuario1.push(
        medirOperacion(`U1-Compra-${i}`, () =>
          conContextoEmpresa(empresaId, usuario1Id, () =>
            compraService.registrar(
              empresaId,
              {
                periodoId: periodo,
                fechaEmision: '2026-03-10',
                fechaContable: '2026-03-10',
                tipoComprobante: '01',
                serie: 'F001',
                numero: `000100${i}`,
                proveedorId,
                moneda: 'PEN',
                tipoCambio: 3.75,
                baseGravada: 500,
                igv: 90,
                total: 590,
                formaPago: 'CREDITO',
                diasCredito: 30,
                glosa: `U1 Compra Mercadería F001-000100${i}`,
              },
              usuario1Id
            )
          )
        )
      );

      operacionesUsuario2.push(
        medirOperacion(`U2-Compra-${i}`, () =>
          conContextoEmpresa(empresaId, usuario2Id, () =>
            compraService.registrar(
              empresaId,
              {
                periodoId: periodo,
                fechaEmision: '2026-03-11',
                fechaContable: '2026-03-11',
                tipoComprobante: '01',
                serie: 'F002',
                numero: `000200${i}`,
                proveedorId,
                moneda: 'PEN',
                tipoCambio: 3.75,
                baseGravada: 800,
                igv: 144,
                total: 944,
                formaPago: 'CREDITO',
                diasCredito: 30,
                glosa: `U2 Compra Mercadería F002-000200${i}`,
              },
              usuario2Id
            )
          )
        )
      );
    }

    // 2.3: 3 Ventas registradas por cada usuario (Subdiario 02)
    for (let i = 1; i <= 3; i++) {
      operacionesUsuario1.push(
        medirOperacion(`U1-Venta-${i}`, () =>
          conContextoEmpresa(empresaId, usuario1Id, () =>
            ventaService.registrar(
              empresaId,
              {
                periodoId: periodo,
                fechaEmision: '2026-03-15',
                fechaContable: '2026-03-15',
                tipoComprobante: '01',
                serie: 'F001',
                numero: `000500${i}`,
                clienteId,
                moneda: 'PEN',
                tipoCambio: 3.75,
                baseGravada: 1000,
                igv: 180,
                total: 1180,
                formaPago: 'CREDITO',
                diasCredito: 30,
                glosa: `U1 Venta Mercadería F001-000500${i}`,
              },
              usuario1Id
            )
          )
        )
      );

      operacionesUsuario2.push(
        medirOperacion(`U2-Venta-${i}`, () =>
          conContextoEmpresa(empresaId, usuario2Id, () =>
            ventaService.registrar(
              empresaId,
              {
                periodoId: periodo,
                fechaEmision: '2026-03-16',
                fechaContable: '2026-03-16',
                tipoComprobante: '01',
                serie: 'F002',
                numero: `000600${i}`,
                clienteId,
                moneda: 'PEN',
                tipoCambio: 3.75,
                baseGravada: 2000,
                igv: 360,
                total: 2360,
                formaPago: 'CREDITO',
                diasCredito: 30,
                glosa: `U2 Venta Mercadería F002-000600${i}`,
              },
              usuario2Id
            )
          )
        )
      );
    }

    // 2.4: 2 Flujos de Borrador -> Modificación de Glosa -> Contabilización por cada usuario (Subdiario 08)
    for (let i = 1; i <= 2; i++) {
      operacionesUsuario1.push(
        medirOperacion(`U1-BorradorUpdateContabilizar-${i}`, () =>
          conContextoEmpresa(empresaId, usuario1Id, async () => {
            const borrador = await asientoService.crearBorrador(
              empresaId,
              {
                periodoId,
                subdiarioId: subMap.get('08')!,
                fecha: '2026-03-20',
                glosa: `U1 Borrador Inicial #${i}`,
                moneda: 'PEN',
                tipoCambio: 3.75,
                origen: 'AJUSTE',
                detalles: [
                  { linea: 1, cuentaId: ctaMap.get('6311')!, debe: 300, haber: 0, glosaLinea: 'Gasto inicial U1' },
                  { linea: 2, cuentaId: ctaMap.get('1041')!, debe: 0, haber: 300, glosaLinea: 'Pago banco U1' },
                ],
              },
              usuario1Id
            );
            await asientoService.actualizarBorrador(
              borrador.id,
              {
                periodoId,
                subdiarioId: subMap.get('08')!,
                fecha: '2026-03-20',
                glosa: `U1 Glosa Modificada y Confirmada #${i}`,
                moneda: 'PEN',
                tipoCambio: 3.75,
                detalles: [
                  { linea: 1, cuentaId: ctaMap.get('6311')!, debe: 350, haber: 0, glosaLinea: 'Gasto ajustado U1' },
                  { linea: 2, cuentaId: ctaMap.get('1041')!, debe: 0, haber: 350, glosaLinea: 'Pago ajustado U1' },
                ],
              },
              usuario1Id,
              1,
              empresaId
            );
            return await asientoService.contabilizar(borrador.id, empresaId, usuario1Id);
          })
        )
      );

      operacionesUsuario2.push(
        medirOperacion(`U2-BorradorUpdateContabilizar-${i}`, () =>
          conContextoEmpresa(empresaId, usuario2Id, async () => {
            const borrador = await asientoService.crearBorrador(
              empresaId,
              {
                periodoId,
                subdiarioId: subMap.get('08')!,
                fecha: '2026-03-21',
                glosa: `U2 Borrador Inicial #${i}`,
                moneda: 'PEN',
                tipoCambio: 3.75,
                origen: 'AJUSTE',
                detalles: [
                  { linea: 1, cuentaId: ctaMap.get('6311')!, debe: 400, haber: 0, glosaLinea: 'Gasto inicial U2' },
                  { linea: 2, cuentaId: ctaMap.get('1041')!, debe: 0, haber: 400, glosaLinea: 'Pago banco U2' },
                ],
              },
              usuario2Id
            );
            await asientoService.actualizarBorrador(
              borrador.id,
              {
                periodoId,
                subdiarioId: subMap.get('08')!,
                fecha: '2026-03-21',
                glosa: `U2 Glosa Modificada y Confirmada #${i}`,
                moneda: 'PEN',
                tipoCambio: 3.75,
                detalles: [
                  { linea: 1, cuentaId: ctaMap.get('6311')!, debe: 450, haber: 0, glosaLinea: 'Gasto ajustado U2' },
                  { linea: 2, cuentaId: ctaMap.get('1041')!, debe: 0, haber: 450, glosaLinea: 'Pago ajustado U2' },
                ],
              },
              usuario2Id,
              1,
              empresaId
            );
            return await asientoService.contabilizar(borrador.id, empresaId, usuario2Id);
          })
        )
      );
    }

    // 2.5: 2 Consultas concurrentes de Libros y Balance por cada usuario durante la carga
    operacionesUsuario1.push(
      medirOperacion('U1-Consulta-LibroDiario', () =>
        conContextoEmpresa(empresaId, usuario1Id, () => librosEEFFService.generarLibroDiario(empresaId, periodo))
      ),
      medirOperacion('U1-Consulta-LibroMayor', () =>
        conContextoEmpresa(empresaId, usuario1Id, () => librosEEFFService.generarLibroMayor(empresaId, periodo))
      )
    );

    operacionesUsuario2.push(
      medirOperacion('U2-Consulta-BalanceComprobacion', () =>
        conContextoEmpresa(empresaId, usuario2Id, () => librosEEFFService.generarBalanceComprobacion(empresaId, periodo))
      ),
      medirOperacion('U2-Consulta-LibroDiario', () =>
        conContextoEmpresa(empresaId, usuario2Id, () => librosEEFFService.generarLibroDiario(empresaId, periodo))
      )
    );

    assert.equal(operacionesUsuario1.length, 22, 'Usuario 1 debe ejecutar al menos 22 operaciones concurrentes');
    assert.equal(operacionesUsuario2.length, 22, 'Usuario 2 debe ejecutar al menos 22 operaciones concurrentes');

    const inicioLote = performance.now();
    const resultadosConcurrentes = await Promise.all([...operacionesUsuario1, ...operacionesUsuario2]);
    const duracionTotalLoteMs = performance.now() - inicioLote;

    assert.equal(resultadosConcurrentes.length, 44, 'Las 44 operaciones concurrentes deben completarse sin rechazos');
    console.log(`✅ 44 operaciones simultáneas completadas en ${duracionTotalLoteMs.toFixed(2)} ms.\n`);

    // =========================================================================
    // 3. VERIFICACIÓN DE INTEGRIDAD: 0 DUPLICADOS, 0 PERDIDOS, 0 COLISIONES
    // =========================================================================
    console.log('--- 3. VERIFICACIÓN DE INTEGRIDAD TRANSACCIONAL Y CORRELATIVOS ÚNICOS ---');

    const { rows: asientosDb } = await client.query(
      `SELECT id, subdiario_id, numero, cuo, glosa, estado, created_by, updated_by, version
       FROM asientos
       WHERE empresa_id = $1
       ORDER BY created_at ASC`,
      [empresaId]
    );

    const asientosU1 = asientosDb.filter(a => a.created_by === usuario1Id && a.estado === 'CONTABILIZADO');
    const asientosU2 = asientosDb.filter(a => a.created_by === usuario2Id && a.estado === 'CONTABILIZADO');

    console.log(`- Asientos contabilizados en PostgreSQL: Total = ${asientosDb.length} (Usuario 1 = ${asientosU1.length}, Usuario 2 = ${asientosU2.length})`);
    assert.equal(asientosDb.length, 40, 'Deben existir exactamente los 40 asientos contables generados (0 perdidos, 0 duplicados)');
    assert.equal(asientosU1.length, 20, 'Los 20 asientos del Usuario 1 deben existir íntegros');
    assert.equal(asientosU2.length, 20, 'Los 20 asientos del Usuario 2 deben existir íntegros');

    // Verificar unicidad estricta de correlativo (subdiario_id + numero) y CUO
    const numerosSet = new Set(asientosDb.map(a => `${a.subdiario_id}:${a.numero}`));
    const cuosSet = new Set(asientosDb.map(a => a.cuo));
    assert.equal(numerosSet.size, 40, 'Cada asiento debe tener un número correlativo único sin colisión');
    assert.equal(cuosSet.size, 40, 'Cada asiento debe tener un CUO único sin colisión');

    // Verificar que las glosas modificadas en el flujo de borrador se conservaron sin sobrescritura cruzada
    const glosasModificadasU1 = asientosU1.filter(a => String(a.glosa).startsWith('U1 Glosa Modificada y Confirmada #'));
    const glosasModificadasU2 = asientosU2.filter(a => String(a.glosa).startsWith('U2 Glosa Modificada y Confirmada #'));
    assert.equal(glosasModificadasU1.length, 2, 'Las 2 modificaciones de glosa de Usuario 1 deben persistir intactas');
    assert.equal(glosasModificadasU2.length, 2, 'Las 2 modificaciones de glosa de Usuario 2 deben persistir intactas');

    // Verificar compras y ventas en PostgreSQL
    const { rows: comprasDb } = await client.query(
      `SELECT id, serie, numero, created_by, estado, total::float8 as total FROM comprobantes_compra WHERE empresa_id = $1`,
      [empresaId]
    );
    const { rows: ventasDb } = await client.query(
      `SELECT id, serie, numero, created_by, estado, total::float8 as total FROM comprobantes_venta WHERE empresa_id = $1`,
      [empresaId]
    );
    assert.equal(comprasDb.length, 10, 'Deben existir las 10 compras concurrentes (5 de U1 y 5 de U2)');
    assert.equal(ventasDb.length, 6, 'Deben existir las 6 ventas concurrentes (3 de U1 y 3 de U2)');
    console.log(`- Comprobantes persistidos: ${comprasDb.length} compras y ${ventasDb.length} ventas (0 colisiones).\n`);

    // =========================================================================
    // 4. VISIBILIDAD CRUZADA ENTRE USUARIOS (< 5,000 ms)
    // =========================================================================
    console.log('--- 4. VERIFICACIÓN DE VISIBILIDAD INMEDIATA ENTRE USUARIOS (< 5 SEGUNDOS) ---');

    // Usuario 1 confirma un nuevo asiento y actualiza el estado contable
    const asientoVisibilidad = await conContextoEmpresa(empresaId, usuario1Id, () =>
      asientoService.crearAsiento(
        empresaId,
        {
          periodoId,
          subdiarioId: '10',
          fecha: '2026-03-28',
          glosa: 'Asiento Confirmado por Usuario 1 para Lectura Inmediata de Usuario 2',
          moneda: 'PEN',
          tipoCambio: 3.75,
          origen: 'MANUAL',
          detalles: [
            { linea: 1, cuentaId: ctaMap.get('1041')!, debe: 7500, haber: 0, glosaLinea: 'Cobro confirmado U1' },
            { linea: 2, cuentaId: ctaMap.get('1212')!, debe: 0, haber: 7500, glosaLinea: 'Cancelación factura U1' },
          ],
        },
        usuario1Id
      )
    );
    const instanteCommitU1 = performance.now();

    // Usuario 2 consulta inmediatamente desde su propio contexto de sesión
    const lecturaU2 = await medirOperacion('U2-LecturaVisibilidadCruzada', () =>
      conContextoEmpresa(empresaId, usuario2Id, async () => {
        const asientoLeido = await asientoService.obtenerPorId(asientoVisibilidad.id);
        const diarioLeido = await librosEEFFService.generarLibroDiario(empresaId, periodo);
        const mayorLeido = await librosEEFFService.generarLibroMayor(empresaId, periodo);
        const balanceLeido = await librosEEFFService.generarBalanceComprobacion(empresaId, periodo);
        return { asientoLeido, diarioLeido, mayorLeido, balanceLeido };
      })
    );
    const latenciaVisibilidadMs = performance.now() - instanteCommitU1;

    assert.ok(lecturaU2.asientoLeido, 'Usuario 2 debe ver inmediatamente el asiento confirmado por Usuario 1');
    assert.equal(
      lecturaU2.asientoLeido.glosa,
      'Asiento Confirmado por Usuario 1 para Lectura Inmediata de Usuario 2',
      'La glosa leída por Usuario 2 debe coincidir al 100% con lo confirmado por Usuario 1'
    );
    assert.equal(lecturaU2.diarioLeido.totalAsientos, 41, 'Usuario 2 debe ver los 41 asientos confirmados en el Libro Diario');
    assert.equal(lecturaU2.diarioLeido.estaBalanceado, true, 'El Libro Diario visto por Usuario 2 debe estar cuadrado');
    assert.equal(
      lecturaU2.diarioLeido.totalDebe,
      lecturaU2.mayorLeido.totalSumasDebe,
      'Libro Diario y Libro Mayor vistos por Usuario 2 deben conciliar con diferencia S/ 0.00'
    );
    assert.equal(
      lecturaU2.balanceLeido.totales.sumasDebe,
      lecturaU2.diarioLeido.totalDebe,
      'Balance de Comprobación visto por Usuario 2 debe conciliar con el Libro Diario'
    );
    assert.ok(
      latenciaVisibilidadMs < 5000,
      `La visibilidad para el segundo usuario debe ser < 5000 ms (medido: ${latenciaVisibilidadMs.toFixed(2)} ms)`
    );
    console.log(`✅ 100% de cambios confirmados visibles para Usuario 2 en ${latenciaVisibilidadMs.toFixed(2)} ms (Meta: < 5,000 ms).\n`);

    // =========================================================================
    // 5. CONTROL DE CONCURRENCIA / BLOQUEO OPTIMISTA (PREVENCIÓN DE LOST UPDATES)
    // =========================================================================
    console.log('--- 5. VERIFICACIÓN DE BLOQUEO OPTIMISTA ANTE EDICIÓN CONCURRENTE ---');

    // 5.1 Bloqueo optimista en Asiento Borrador
    const borradorCompartido = await conContextoEmpresa(empresaId, usuario1Id, () =>
      asientoService.crearBorrador(
        empresaId,
        {
          periodoId,
          subdiarioId: subMap.get('10')!,
          fecha: '2026-03-29',
          glosa: 'Borrador compartido versión 1',
          moneda: 'PEN',
          tipoCambio: 3.75,
          origen: 'MANUAL',
          detalles: [
            { linea: 1, cuentaId: ctaMap.get('6311')!, debe: 200, haber: 0, glosaLinea: 'Gasto v1' },
            { linea: 2, cuentaId: ctaMap.get('1041')!, debe: 0, haber: 200, glosaLinea: 'Banco v1' },
          ],
        },
        usuario1Id
      )
    );
    assert.equal(borradorCompartido.version, 1, 'Versión inicial del borrador debe ser 1');

    // Usuario 1 actualiza primero con expectedVersion = 1 -> pasa a version = 2
    const u1Update = await medirOperacion('U1-OptimisticLock-Success', () =>
      conContextoEmpresa(empresaId, usuario1Id, () =>
        asientoService.actualizarBorrador(
          borradorCompartido.id,
          {
            periodoId,
            subdiarioId: subMap.get('10')!,
            fecha: '2026-03-29',
            glosa: 'Glosa actualizada legítimamente por Usuario 1 (v2)',
            moneda: 'PEN',
            tipoCambio: 3.75,
            detalles: [
              { linea: 1, cuentaId: ctaMap.get('6311')!, debe: 250, haber: 0, glosaLinea: 'Gasto v2' },
              { linea: 2, cuentaId: ctaMap.get('1041')!, debe: 0, haber: 250, glosaLinea: 'Banco v2' },
            ],
          },
          usuario1Id,
          1,
          empresaId
        )
      )
    );
    assert.equal(u1Update.version, 2, 'La actualización de Usuario 1 debe incrementar la versión a 2');

    // Usuario 2 intenta sobrescribir usando su lectura obsoleta expectedVersion = 1 -> debe ser rechazado
    await assert.rejects(
      () =>
        conContextoEmpresa(empresaId, usuario2Id, () =>
          asientoService.actualizarBorrador(
            borradorCompartido.id,
            {
              periodoId,
              subdiarioId: subMap.get('10')!,
              fecha: '2026-03-29',
              glosa: 'Intento de sobrescritura silenciosa por Usuario 2 con versión obsoleta',
              moneda: 'PEN',
              tipoCambio: 3.75,
              detalles: [
                { linea: 1, cuentaId: ctaMap.get('6311')!, debe: 999, haber: 0, glosaLinea: 'Sobrescritura' },
                { linea: 2, cuentaId: ctaMap.get('1041')!, debe: 0, haber: 999, glosaLinea: 'Sobrescritura' },
              ],
            },
            usuario2Id,
            1,
            empresaId
          )
        ),
      /VERSION_DESACTUALIZADA/,
      'PostgreSQL debe rechazar con VERSION_DESACTUALIZADA la edición con versión obsoleta'
    );

    // Verificar que los datos de Usuario 1 no fueron sobrescritos y luego contabilizar con versión vigente
    const verificadoPostConflicto = await conContextoEmpresa(empresaId, usuario2Id, () =>
      asientoService.obtenerPorId(borradorCompartido.id)
    );
    assert.equal(
      verificadoPostConflicto?.glosa,
      'Glosa actualizada legítimamente por Usuario 1 (v2)',
      'El bloqueo optimista debe preservar intacta la modificación de Usuario 1'
    );
    await conContextoEmpresa(empresaId, usuario2Id, () =>
      asientoService.contabilizar(borradorCompartido.id, empresaId, usuario2Id)
    );

    // 5.2 Bloqueo optimista en Comprobante de Compra Borrador
    const compraBorrador = await conContextoEmpresa(empresaId, usuario1Id, () =>
      compraService.crearBorrador(
        empresaId,
        {
          periodoId: periodo,
          fechaEmision: '2026-03-29',
          fechaContable: '2026-03-29',
          tipoComprobante: '01',
          serie: 'F009',
          numero: '0009991',
          proveedorId,
          moneda: 'PEN',
          tipoCambio: 3.75,
          baseGravada: 100,
          igv: 18,
          total: 118,
          formaPago: 'CONTADO',
        },
        usuario1Id
      )
    );

    await conContextoEmpresa(empresaId, usuario1Id, () =>
      compraService.actualizarBorrador(
        empresaId,
        compraBorrador.id,
        {
          periodoId: periodo,
          fechaEmision: '2026-03-29',
          fechaContable: '2026-03-29',
          tipoComprobante: '01',
          serie: 'F009',
          numero: '0009991',
          proveedorId,
          moneda: 'PEN',
          tipoCambio: 3.75,
          baseGravada: 200,
          igv: 36,
          total: 236,
          formaPago: 'CONTADO',
        },
        usuario1Id,
        1
      )
    );

    await assert.rejects(
      () =>
        conContextoEmpresa(empresaId, usuario2Id, () =>
          compraService.actualizarBorrador(
            empresaId,
            compraBorrador.id,
            {
              periodoId: periodo,
              fechaEmision: '2026-03-29',
              fechaContable: '2026-03-29',
              tipoComprobante: '01',
              serie: 'F009',
              numero: '0009991',
              proveedorId,
              moneda: 'PEN',
              tipoCambio: 3.75,
              baseGravada: 900,
              igv: 162,
              total: 1062,
              formaPago: 'CONTADO',
            },
            usuario2Id,
            1
          )
        ),
      /VERSION_DESACTUALIZADA/,
      'El comprobante de compra debe rechazar actualizaciones con versión obsoleta'
    );
    console.log('✅ Bloqueo optimista verificado en Asientos y Comprobantes (0 sobrescrituras silenciosas).\n');

    // =========================================================================
    // 6. MÉTRICAS DE TIEMPO DE RESPUESTA (p50, p95, p99 <= 2,000 ms)
    // =========================================================================
    console.log('--- 6. EVALUACIÓN DE RENDIMIENTO Y LATENCIA BAJO CARGA CONCURRENTE ---');
    const p50 = calcularPercentil(latenciasMs, 50);
    const p95 = calcularPercentil(latenciasMs, 95);
    const p99 = calcularPercentil(latenciasMs, 99);
    const maxLat = Math.max(...latenciasMs);
    const promedio = latenciasMs.reduce((acc, v) => acc + v, 0) / latenciasMs.length;

    console.log(`- Operaciones medidas : ${latenciasMs.length}`);
    console.log(`- Latencia Promedio   : ${promedio.toFixed(2)} ms`);
    console.log(`- Latencia p50        : ${p50.toFixed(2)} ms`);
    console.log(`- Latencia p95        : ${p95.toFixed(2)} ms (Umbral máximo: <= 2,000.00 ms)`);
    console.log(`- Latencia p99        : ${p99.toFixed(2)} ms`);
    console.log(`- Latencia Máxima     : ${maxLat.toFixed(2)} ms`);

    assert.ok(
      p95 <= 2000,
      `El tiempo de respuesta p95 debe ser <= 2000 ms (obtenido: ${p95.toFixed(2)} ms)`
    );
    console.log('✅ Criterio de rendimiento p95 <= 2,000 ms cumplido holgadamente.\n');

    // Capturar totales antes del reinicio en frío
    const diarioPreReinicio = await conContextoEmpresa(empresaId, usuario1Id, () =>
      librosEEFFService.generarLibroDiario(empresaId, periodo)
    );
    assert.equal(diarioPreReinicio.totalAsientos, 42, 'Deben existir 42 asientos contabilizados antes del reinicio');

    // =========================================================================
    // 7. PERSISTENCIA 100% TRAS REINICIO EN FRÍO (POOL.END + NUEVO POOL)
    // =========================================================================
    console.log('--- 7. PERSISTENCIA TRAS REINICIO EN FRÍO (DISCONNECT & RECONNECT) ---');
    client.release();
    await pool.end();

    const freshPool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 10000,
    });
    setPostgresPool(freshPool, true);

    await conContextoEmpresa(empresaId, usuario2Id, async () => {
      const diarioPost = await librosEEFFService.generarLibroDiario(empresaId, periodo);
      const mayorPost = await librosEEFFService.generarLibroMayor(empresaId, periodo);
      const balancePost = await librosEEFFService.generarBalanceComprobacion(empresaId, periodo);

      assert.equal(diarioPost.totalAsientos, diarioPreReinicio.totalAsientos, 'Total de asientos debe persistir al 100% tras reinicio');
      assert.equal(diarioPost.totalDebe, diarioPreReinicio.totalDebe, 'Total Debe debe persistir idéntico tras reinicio');
      assert.equal(diarioPost.totalHaber, diarioPreReinicio.totalHaber, 'Total Haber debe persistir idéntico tras reinicio');
      assert.equal(mayorPost.totalSumasDebe, diarioPost.totalDebe, 'Libro Mayor debe cuadrar exactamente con Libro Diario tras reinicio');
      assert.equal(balancePost.totales.sumasDebe, diarioPost.totalDebe, 'Balance de Comprobación debe cuadrar tras reinicio');
    });
    console.log('✅ Persistencia 100% tras reinicio en frío verificada exitosamente.\n');

    // Limpieza de datos de prueba (respetando tablas append-only auditoria y auditoria_log)
    const cleanClient = await freshPool.connect();
    try {
      await cleanClient.query(
        "SELECT set_config('app.empresa_id', $1, false), set_config('app.current_empresa_id', $1, false), set_config('app.restaurando_backup', 'true', false)",
        [empresaId]
      );
      await cleanClient.query('DELETE FROM aplicaciones_cobranza WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM aplicaciones_pago WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM cuentas_por_cobrar WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM cuentas_por_pagar WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM detracciones WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM comprobantes_venta WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM comprobantes_compra WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM asiento_detalle WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM asientos WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM correlativos WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM anexos WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM plan_cuentas WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM subdiarios WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM periodos WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM ejercicios WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM membresias WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM empresas WHERE id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM usuarios_estudio WHERE id IN ($1, $2)', [usuario1Id, usuario2Id]);
      await cleanClient.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
      await cleanClient.query("SELECT set_config('app.restaurando_backup', 'false', false)");
    } catch {
      // Ignorar fallos no críticos de limpieza
    } finally {
      cleanClient.release();
      await freshPool.end();
    }

    console.log('========================================================================');
    console.log('🎉 FASE D (MULTIUSUARIO Y CONCURRENCIA) APROBADA AL 100% EN POSTGRESQL REAL (EXIT 0)');
    console.log('========================================================================');
  } catch (err) {
    console.error('❌ ERROR CRÍTICO EN PRUEBAS DE FASE D:', err);
    try { client.release(); } catch {}
    try { await pool.end(); } catch {}
    process.exit(1);
  }
}

ejecutar();
