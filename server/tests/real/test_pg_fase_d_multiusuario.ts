import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import { createServer } from 'node:net';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import bcrypt from 'bcryptjs';
import { parse } from 'dotenv';
import { Pool } from 'pg';
import { detectarIpsLan, generarCertificadosLan } from '../../../scripts/generar-certificado-lan';

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

async function obtenerPuertoLibre(): Promise<number> {
  const srv = createServer();
  await new Promise<void>(resolve => srv.listen(0, '127.0.0.1', resolve));
  const port = (srv.address() as { port: number }).port;
  await new Promise<void>(resolve => srv.close(() => resolve()));
  return port;
}

function peticionHttps(options: {
  hostname: string;
  port: number;
  path: string;
  method?: string;
  ca: Buffer;
  token?: string;
  body?: unknown;
}): Promise<{ status: number; body: any; certSubject?: string; certSans?: string }> {
  return new Promise((resolve, reject) => {
    const payload = options.body !== undefined ? JSON.stringify(options.body) : undefined;
    const req = https.request(
      {
        hostname: options.hostname,
        port: options.port,
        path: options.path,
        method: options.method || 'GET',
        ca: options.ca,
        rejectUnauthorized: true,
        headers: {
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      res => {
        const socket = res.socket as unknown as { getPeerCertificate?: () => { subject?: { CN?: string }; subjectaltname?: string } };
        const peerCert = socket.getPeerCertificate ? socket.getPeerCertificate() : undefined;
        let raw = '';
        res.on('data', chunk => {
          raw += String(chunk);
        });
        res.on('end', () => {
          let parsed: any = raw;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            // Conservar texto plano si no es JSON
          }
          resolve({
            status: res.statusCode || 0,
            body: parsed,
            certSubject: peerCert?.subject?.CN,
            certSans: peerCert?.subjectaltname,
          });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function ejecutar() {
  console.log('========================================================================');
  console.log('🏛️ VALIDACIÓN EN POSTGRESQL REAL: PILOTO MULTIUSUARIO (3 SESIONES) Y LAN HTTPS');
  console.log('========================================================================\n');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = connectionString;

  const pool = new Pool({
    connectionString,
    max: 25,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  const { setPostgresPool, conContextoEmpresa } = await import('../../config/database');
  const { NOMBRES_SECRETOS_SERVIDOR } = await import('../../config/env');
  setPostgresPool(pool, true);

  const { asientoService } = await import('../../services/asientoService');
  const { compraService } = await import('../../services/compraService');
  const { ventaService } = await import('../../services/ventaService');
  const { librosEEFFService } = await import('../../services/librosEEFFService');

  const client = await pool.connect();

  const tenantId = crypto.randomUUID();
  const sufijoRun = `${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
  let usuario1Id = crypto.randomUUID();
  let usuario2Id = crypto.randomUUID();
  let usuario3Id = crypto.randomUUID();
  let usuarioAuditorId = crypto.randomUUID();
  const empresaId = crypto.randomUUID();
  const empresaBId = crypto.randomUUID();
  const ruc = `20998${String(Date.now()).slice(-6)}`;
  const rucB = `20997${String(Date.now()).slice(-6)}`;
  const clavePrueba = `Piloto3Seg_${crypto.randomBytes(6).toString('hex')}`;
  const passwordHash = await bcrypt.hash(clavePrueba, 4);
  const periodo = '2026-03';
  const ejercicioId = crypto.randomUUID();
  const periodoId = crypto.randomUUID();
  const proveedorId = crypto.randomUUID();
  const clienteId = crypto.randomUUID();

  const emailU1 = `u1.admin.${sufijoRun}@atlob.pe`;
  const emailU2 = `u2.contador.${sufijoRun}@atlob.pe`;
  const emailU3 = `u3.asistente.${sufijoRun}@atlob.pe`;
  const emailU4 = `u4.auditor.${sufijoRun}@atlob.pe`;

  try {
    console.log('--- 1. SEMBRADO DE EMPRESA A, EMPRESA B AISLADA Y 3 USUARIOS OPERATIVOS + AUDITOR ---');
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO tenants (id, nombre) VALUES ($1, 'Estudio Contable Piloto 3 Usuarios') ON CONFLICT (id) DO NOTHING`,
      [tenantId]
    );

    const u1Res = await client.query(
      `INSERT INTO usuarios_estudio (id, email, password_hash, nombre, rol_global, is_active)
       VALUES ($1, $2, $3, 'Usuario 1 Administrador', 'ADMINISTRADOR', true)
       RETURNING id`,
      [usuario1Id, emailU1, passwordHash]
    );
    usuario1Id = u1Res.rows[0].id;

    const u2Res = await client.query(
      `INSERT INTO usuarios_estudio (id, email, password_hash, nombre, rol_global, is_active)
       VALUES ($1, $2, $3, 'Usuario 2 Contador Senior', 'CONTADOR_SENIOR', true)
       RETURNING id`,
      [usuario2Id, emailU2, passwordHash]
    );
    usuario2Id = u2Res.rows[0].id;

    const u3Res = await client.query(
      `INSERT INTO usuarios_estudio (id, email, password_hash, nombre, rol_global, is_active)
       VALUES ($1, $2, $3, 'Usuario 3 Asistente Contable', 'ASISTENTE_CONTABLE', true)
       RETURNING id`,
      [usuario3Id, emailU3, passwordHash]
    );
    usuario3Id = u3Res.rows[0].id;

    const u4Res = await client.query(
      `INSERT INTO usuarios_estudio (id, email, password_hash, nombre, rol_global, is_active)
       VALUES ($1, $2, $3, 'Usuario 4 Auditor Revisor', 'AUDITOR_REVISOR', true)
       RETURNING id`,
      [usuarioAuditorId, emailU4, passwordHash]
    );
    usuarioAuditorId = u4Res.rows[0].id;

    await client.query(
      `INSERT INTO empresas (
         id, tenant_id, codigo_empresa, ruc, razon_social, nombre_comercial,
         regimen_tributario, domicilio_fiscal, moneda_principal, metodo_inventario, is_active
       ) VALUES
       ($1, $2, $3, $4, 'CORPORACION PILOTO 3 USUARIOS S.A.C.', 'PILOTO 3U SAC',
        'REGIMEN_GENERAL', 'AV. JAVIER PRADO ESTE 2450, LIMA', 'PEN', 'PERIODICO', true),
       ($5, $2, $6, $7, 'EMPRESA AISLADA B S.A.C.', 'EMPRESA B',
        'MYPE_TRIBUTARIO', 'JR. UCAYALI 100, LIMA', 'PEN', 'PERIODICO', true)`,
      [
        empresaId,
        tenantId,
        `P3-${Date.now().toString().slice(-5)}`,
        ruc,
        empresaBId,
        `EB-${Date.now().toString().slice(-5)}`,
        rucB,
      ]
    );

    const { rows: rolesDb } = await client.query<{ id: string; codigo: string }>(`SELECT id, codigo FROM roles`);
    const rolMap = new Map(rolesDb.map(r => [r.codigo, r.id]));
    const rolAdminId = rolMap.get('ADMINISTRADOR') || crypto.randomUUID();
    const rolContadorId = rolMap.get('CONTADOR') || rolAdminId;
    const rolAsistenteId = rolMap.get('ASISTENTE') || rolAdminId;
    const rolAuditorId = rolMap.get('AUDITOR') || rolAdminId;

    const membresiasConfig = [
      { uid: usuario1Id, rolId: rolAdminId, rolEmpresa: 'ADMINISTRADOR' },
      { uid: usuario2Id, rolId: rolContadorId, rolEmpresa: 'CONTADOR_SENIOR' },
      { uid: usuario3Id, rolId: rolAsistenteId, rolEmpresa: 'ASISTENTE_CONTABLE' },
      { uid: usuarioAuditorId, rolId: rolAuditorId, rolEmpresa: 'AUDITOR_REVISOR' },
    ];

    for (const m of membresiasConfig) {
      await client.query(
        `SELECT set_config('app.usuario_id', $1, false),
                set_config('app.user_id', $1, false),
                set_config('app.current_user_id', $1, false),
                set_config('app.empresa_id', $2, false),
                set_config('app.current_empresa_id', $2, false)`,
        [m.uid, empresaId]
      );
      await client.query(
        `INSERT INTO membresias (id, usuario_id, empresa_id, rol_id, is_active)
         VALUES ($1, $2, $3, $4, true)`,
        [crypto.randomUUID(), m.uid, empresaId, m.rolId]
      );
      await client.query(
        `INSERT INTO usuario_empresa (id, usuario_id, empresa_id, rol_en_empresa, estado)
         VALUES ($1, $2, $3, $4, 'ACTIVO')`,
        [crypto.randomUUID(), m.uid, empresaId, m.rolEmpresa]
      );
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
       ($1, $2, 'PROVEEDOR', '6', '20555111222', 'PROVEEDOR CONCURRENTE 3U S.A.C.', 'ACTIVO', 'HABIDO'),
       ($3, $2, 'CLIENTE', '6', '20666333444', 'CLIENTE CONCURRENTE 3U S.A.C.', 'ACTIVO', 'HABIDO')`,
      [proveedorId, empresaId, clienteId]
    );

    await client.query('COMMIT');
    console.log(`✅ Empresa A (${ruc}), Empresa B aislada (${rucB}) y 3 usuarios simultáneos + 1 auditor configurados.\n`);

    // =========================================================================
    // 2. EJECUCIÓN CONCURRENTE: 3 SESIONES SIMULTÁNEAS (66 OPERACIONES = 22 x 3)
    // =========================================================================
    console.log('--- 2. EJECUCIÓN DE 66 OPERACIONES CONCURRENTES EN 3 SESIONES SIMULTÁNEAS (22 x 3) ---');
    const latenciasMs: number[] = [];

    const medirOperacion = async <T>(_etiqueta: string, fn: () => Promise<T>): Promise<T> => {
      const inicio = performance.now();
      const resultado = await fn();
      const duracion = performance.now() - inicio;
      latenciasMs.push(duracion);
      return resultado;
    };

    const ejecutarSesionUsuario = async (cfg: {
      uid: string;
      prefix: string;
      montoBase: number;
      serieCompra: string;
      numCompraBase: string;
      baseCompra: number;
      igvCompra: number;
      totalCompra: number;
      diaCompra: string;
      serieVenta: string;
      numVentaBase: string;
      baseVenta: number;
      igvVenta: number;
      totalVenta: number;
      diaVenta: string;
      reporteTipo: 'U1' | 'U2' | 'U3';
    }) => {
      let completadas = 0;

      // 10 Asientos manuales (compitiendo los 3 usuarios simultáneamente en subdiarios 05 y 10)
      for (let i = 1; i <= 10; i++) {
        const subCodigo = i % 2 === 0 ? '05' : '10';
        const fecha = `2026-03-${String((i % 25) + 1).padStart(2, '0')}`;
        const monto = cfg.montoBase + i * 10;
        await medirOperacion(`${cfg.prefix}-Asiento-${i}`, () =>
          conContextoEmpresa(empresaId, cfg.uid, () =>
            asientoService.crearAsiento(
              empresaId,
              {
                periodoId,
                subdiarioId: subCodigo,
                fecha,
                glosa: `${cfg.prefix} Asiento Concurrente #${i}`,
                moneda: 'PEN',
                tipoCambio: 3.75,
                origen: 'MANUAL',
                detalles: [
                  { linea: 1, cuentaId: ctaMap.get('1041')!, debe: monto, haber: 0, glosaLinea: `Banco ${cfg.prefix} #${i}` },
                  { linea: 2, cuentaId: ctaMap.get('5011')!, debe: 0, haber: monto, glosaLinea: `Capital ${cfg.prefix} #${i}` },
                ],
              },
              cfg.uid
            )
          )
        );
        completadas++;
      }

      // 5 Compras (compitiendo los 3 usuarios simultáneamente en subdiario 01)
      for (let i = 1; i <= 5; i++) {
        const numero = `${cfg.numCompraBase}${i}`;
        await medirOperacion(`${cfg.prefix}-Compra-${i}`, () =>
          conContextoEmpresa(empresaId, cfg.uid, () =>
            compraService.registrar(
              empresaId,
              {
                periodoId: periodo,
                fechaEmision: `2026-03-${cfg.diaCompra}`,
                fechaContable: `2026-03-${cfg.diaCompra}`,
                tipoComprobante: '01',
                serie: cfg.serieCompra,
                numero,
                proveedorId,
                moneda: 'PEN',
                tipoCambio: 3.75,
                baseGravada: cfg.baseCompra,
                igv: cfg.igvCompra,
                total: cfg.totalCompra,
                formaPago: 'CREDITO',
                diasCredito: 30,
                glosa: `${cfg.prefix} Compra Mercadería ${cfg.serieCompra}-${numero}`,
              },
              cfg.uid
            )
          )
        );
        completadas++;
      }

      // 5 Ventas (compitiendo los 3 usuarios simultáneamente en subdiario 02)
      for (let i = 1; i <= 5; i++) {
        const numero = `${cfg.numVentaBase}${i}`;
        await medirOperacion(`${cfg.prefix}-Venta-${i}`, () =>
          conContextoEmpresa(empresaId, cfg.uid, () =>
            ventaService.registrar(
              empresaId,
              {
                periodoId: periodo,
                fechaEmision: `2026-03-${cfg.diaVenta}`,
                fechaContable: `2026-03-${cfg.diaVenta}`,
                tipoComprobante: '01',
                serie: cfg.serieVenta,
                numero,
                clienteId,
                moneda: 'PEN',
                tipoCambio: 3.75,
                baseGravada: cfg.baseVenta,
                igv: cfg.igvVenta,
                total: cfg.totalVenta,
                formaPago: 'CREDITO',
                diasCredito: 30,
                glosa: `${cfg.prefix} Venta Mercadería ${cfg.serieVenta}-${numero}`,
              },
              cfg.uid
            )
          )
        );
        completadas++;
      }

      // 2 Reportes / Consultas simultáneas mientras las otras sesiones concluyen escrituras
      if (cfg.reporteTipo === 'U1') {
        await medirOperacion('U1-LibroDiario', () =>
          conContextoEmpresa(empresaId, cfg.uid, () => librosEEFFService.generarLibroDiario(empresaId, periodo))
        );
        await medirOperacion('U1-BalanceComprobacion', () =>
          conContextoEmpresa(empresaId, cfg.uid, () => librosEEFFService.generarBalanceComprobacion(empresaId, periodo))
        );
      } else if (cfg.reporteTipo === 'U2') {
        await medirOperacion('U2-LibroMayor', () =>
          conContextoEmpresa(empresaId, cfg.uid, () => librosEEFFService.generarLibroMayor(empresaId, periodo))
        );
        await medirOperacion('U2-EstadoSituacionFinanciera', () =>
          conContextoEmpresa(empresaId, cfg.uid, () => librosEEFFService.generarEstadoSituacionFinanciera(empresaId, periodo))
        );
      } else {
        await medirOperacion('U3-RegistroCompras', () =>
          conContextoEmpresa(empresaId, cfg.uid, () => compraService.obtenerRegistroCompras(empresaId, periodo))
        );
        await medirOperacion('U3-RegistroVentas', () =>
          conContextoEmpresa(empresaId, cfg.uid, () => ventaService.obtenerRegistroVentas(empresaId, periodo))
        );
      }
      completadas += 2;
      return completadas;
    };

    const inicioLote = performance.now();
    const conteos = await Promise.all([
      ejecutarSesionUsuario({
        uid: usuario1Id, prefix: 'U1', montoBase: 1000,
        serieCompra: 'F001', numCompraBase: '000100', baseCompra: 500, igvCompra: 90, totalCompra: 590, diaCompra: '10',
        serieVenta: 'F001', numVentaBase: '000500', baseVenta: 1000, igvVenta: 180, totalVenta: 1180, diaVenta: '15',
        reporteTipo: 'U1',
      }),
      ejecutarSesionUsuario({
        uid: usuario2Id, prefix: 'U2', montoBase: 2000,
        serieCompra: 'F002', numCompraBase: '000200', baseCompra: 800, igvCompra: 144, totalCompra: 944, diaCompra: '11',
        serieVenta: 'F002', numVentaBase: '000600', baseVenta: 2000, igvVenta: 360, totalVenta: 2360, diaVenta: '16',
        reporteTipo: 'U2',
      }),
      ejecutarSesionUsuario({
        uid: usuario3Id, prefix: 'U3', montoBase: 3000,
        serieCompra: 'F003', numCompraBase: '000300', baseCompra: 600, igvCompra: 108, totalCompra: 708, diaCompra: '12',
        serieVenta: 'F003', numVentaBase: '000700', baseVenta: 1500, igvVenta: 270, totalVenta: 1770, diaVenta: '17',
        reporteTipo: 'U3',
      }),
    ]);
    const duracionTotalLoteMs = performance.now() - inicioLote;
    const totalOperacionesLote = conteos.reduce((acc, v) => acc + v, 0);

    assert.deepEqual(conteos, [22, 22, 22], 'Cada uno de los 3 usuarios debe ejecutar 22 operaciones');
    assert.equal(totalOperacionesLote, 66, 'Las 66 operaciones de las 3 sesiones simultáneas deben completarse sin rechazos');
    console.log(`✅ 66 operaciones en 3 sesiones simultáneas (22 x 3) completadas en ${duracionTotalLoteMs.toFixed(2)} ms.\n`);

    // =========================================================================
    // 3. VERIFICACIÓN DE INTEGRIDAD: 0 DUPLICADOS, 0 PERDIDOS, 0 COLISIONES
    // =========================================================================
    console.log('--- 3. VERIFICACIÓN DE INTEGRIDAD TRANSACCIONAL Y CORRELATIVOS ÚNICOS ---');

    const { rows: asientosDb } = await client.query(
      `SELECT id, subdiario_id, numero, cuo, glosa, estado, created_by
       FROM asientos
       WHERE empresa_id = $1
       ORDER BY created_at ASC`,
      [empresaId]
    );

    const asientosU1 = asientosDb.filter(a => a.created_by === usuario1Id && a.estado === 'CONTABILIZADO');
    const asientosU2 = asientosDb.filter(a => a.created_by === usuario2Id && a.estado === 'CONTABILIZADO');
    const asientosU3 = asientosDb.filter(a => a.created_by === usuario3Id && a.estado === 'CONTABILIZADO');

    console.log(`- Asientos contabilizados: Total=${asientosDb.length} (U1=${asientosU1.length}, U2=${asientosU2.length}, U3=${asientosU3.length})`);
    assert.equal(asientosDb.length, 60, 'Deben existir exactamente 60 asientos contables (30 manuales + 15 compras + 15 ventas)');
    assert.equal(asientosU1.length, 20, 'Los 20 asientos de U1 deben existir íntegros');
    assert.equal(asientosU2.length, 20, 'Los 20 asientos de U2 deben existir íntegros');
    assert.equal(asientosU3.length, 20, 'Los 20 asientos de U3 deben existir íntegros');

    const numerosSet = new Set(asientosDb.map(a => `${a.subdiario_id}:${a.numero}`));
    const cuosSet = new Set(asientosDb.map(a => a.cuo));
    assert.equal(numerosSet.size, 60, 'Cada asiento debe tener correlativo único (subdiario_id + numero)');
    assert.equal(cuosSet.size, 60, 'Cada asiento debe tener CUO único sin colisión');

    const { rows: comprasDb } = await client.query(
      `SELECT id FROM comprobantes_compra WHERE empresa_id = $1`,
      [empresaId]
    );
    const { rows: ventasDb } = await client.query(
      `SELECT id FROM comprobantes_venta WHERE empresa_id = $1`,
      [empresaId]
    );
    const { rows: cxpDb } = await client.query(`SELECT id FROM cuentas_por_pagar WHERE empresa_id = $1`, [empresaId]);
    const { rows: cxcDb } = await client.query(`SELECT id FROM cuentas_por_cobrar WHERE empresa_id = $1`, [empresaId]);

    assert.equal(comprasDb.length, 15, 'Deben existir las 15 compras concurrentes (5 x 3 usuarios)');
    assert.equal(ventasDb.length, 15, 'Deben existir las 15 ventas concurrentes (5 x 3 usuarios)');
    assert.equal(cxpDb.length, 15, 'Deben generarse 15 cuentas por pagar sin colisión');
    assert.equal(cxcDb.length, 15, 'Deben generarse 15 cuentas por cobrar sin colisión');
    console.log(`- Comprobantes y auxiliares: 15 compras, 15 ventas, 15 CxP, 15 CxC (0 colisiones).\n`);

    // =========================================================================
    // 4. VISIBILIDAD CRUZADA ENTRE LOS 3 USUARIOS (< 5,000 ms) Y CUADRE S/ 0.00
    // =========================================================================
    console.log('--- 4. VERIFICACIÓN DE VISIBILIDAD ENTRE LOS 3 USUARIOS (< 5 SEGUNDOS) ---');

    const asientoVisibilidad = await conContextoEmpresa(empresaId, usuario1Id, () =>
      asientoService.crearAsiento(
        empresaId,
        {
          periodoId,
          subdiarioId: '10',
          fecha: '2026-03-28',
          glosa: 'Asiento Confirmado U1 para Visibilidad Simultánea U2 y U3',
          moneda: 'PEN',
          tipoCambio: 3.75,
          origen: 'MANUAL',
          detalles: [
            { linea: 1, cuentaId: ctaMap.get('1041')!, debe: 7500, haber: 0, glosaLinea: 'Cobro U1' },
            { linea: 2, cuentaId: ctaMap.get('1212')!, debe: 0, haber: 7500, glosaLinea: 'Factura U1' },
          ],
        },
        usuario1Id
      )
    );
    const instanteCommitU1 = performance.now();

    const [lecturaU2, lecturaU3] = await Promise.all([
      medirOperacion('U2-Visibilidad', () =>
        conContextoEmpresa(empresaId, usuario2Id, async () => ({
          asiento: await asientoService.obtenerPorId(asientoVisibilidad.id),
          diario: await librosEEFFService.generarLibroDiario(empresaId, periodo),
          mayor: await librosEEFFService.generarLibroMayor(empresaId, periodo),
        }))
      ),
      medirOperacion('U3-Visibilidad', () =>
        conContextoEmpresa(empresaId, usuario3Id, async () => ({
          asiento: await asientoService.obtenerPorId(asientoVisibilidad.id),
          balance: await librosEEFFService.generarBalanceComprobacion(empresaId, periodo),
          esf: await librosEEFFService.generarEstadoSituacionFinanciera(empresaId, periodo),
        }))
      ),
    ]);
    const latenciaVisibilidadMs = performance.now() - instanteCommitU1;

    assert.equal(lecturaU2.asiento?.glosa, 'Asiento Confirmado U1 para Visibilidad Simultánea U2 y U3');
    assert.equal(lecturaU3.asiento?.glosa, 'Asiento Confirmado U1 para Visibilidad Simultánea U2 y U3');
    assert.equal(lecturaU2.diario.totalAsientos, 61, 'Usuario 2 debe ver los 61 asientos confirmados');
    assert.equal(lecturaU2.diario.estaBalanceado, true);
    assert.equal(lecturaU2.diario.totalDebe, lecturaU2.mayor.totalSumasDebe, 'Diario == Mayor (S/ 0.00)');
    assert.equal(lecturaU3.balance.totales.sumasDebe, lecturaU2.diario.totalDebe, 'Balance == Diario (S/ 0.00)');
    assert.equal(lecturaU3.esf.estaCuadrado, true, 'Estado de Situación Financiera debe cuadrar (Activo = Pasivo + Patrimonio)');
    assert.equal(lecturaU3.esf.diferenciaCuadre, 0, 'La diferencia del ESF debe ser S/ 0.00');
    assert.ok(latenciaVisibilidadMs < 5000, `Visibilidad debe ser < 5000 ms (medido: ${latenciaVisibilidadMs.toFixed(2)} ms)`);
    console.log(`✅ Cambios visibles simultáneamente para U2 y U3 en ${latenciaVisibilidadMs.toFixed(2)} ms (Diferencia S/ 0.00).\n`);

    // =========================================================================
    // 5. BLOQUEO OPTIMISTA ANTE EDICIÓN CONCURRENTE (3 USUARIOS)
    // =========================================================================
    console.log('--- 5. VERIFICACIÓN DE BLOQUEO OPTIMISTA EN ASIENTOS Y COMPROBANTES ---');

    const borradorCompartido = await conContextoEmpresa(empresaId, usuario1Id, () =>
      asientoService.crearBorrador(
        empresaId,
        {
          periodoId,
          subdiarioId: subMap.get('10')!,
          fecha: '2026-03-29',
          glosa: 'Borrador compartido 3U v1',
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

    const u1Update = await medirOperacion('U1-OptimisticLock', () =>
      conContextoEmpresa(empresaId, usuario1Id, () =>
        asientoService.actualizarBorrador(
          borradorCompartido.id,
          {
            periodoId,
            subdiarioId: subMap.get('10')!,
            fecha: '2026-03-29',
            glosa: 'Glosa legítima v2 (Usuario 1)',
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
    assert.equal(u1Update.version, 2);

    for (const uConflict of [usuario2Id, usuario3Id]) {
      await assert.rejects(
        () =>
          conContextoEmpresa(empresaId, uConflict, () =>
            asientoService.actualizarBorrador(
              borradorCompartido.id,
              {
                periodoId,
                subdiarioId: subMap.get('10')!,
                fecha: '2026-03-29',
                glosa: 'Sobrescritura con versión obsoleta',
                moneda: 'PEN',
                tipoCambio: 3.75,
                detalles: [
                  { linea: 1, cuentaId: ctaMap.get('6311')!, debe: 999, haber: 0, glosaLinea: 'Bad' },
                  { linea: 2, cuentaId: ctaMap.get('1041')!, debe: 0, haber: 999, glosaLinea: 'Bad' },
                ],
              },
              uConflict,
              1,
              empresaId
            )
          ),
        /VERSION_DESACTUALIZADA/
      );
    }

    await conContextoEmpresa(empresaId, usuario2Id, () =>
      asientoService.contabilizar(borradorCompartido.id, empresaId, usuario2Id)
    );

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
        conContextoEmpresa(empresaId, usuario3Id, () =>
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
            usuario3Id,
            1
          )
        ),
      /VERSION_DESACTUALIZADA/
    );
    console.log('✅ Bloqueo optimista validado en Asientos y Comprobantes para los 3 usuarios.\n');

    // =========================================================================
    // 6. TRANSPORTE HTTPS LAN, LOGIN REAL, RBAC, SEGREGACIÓN Y AISLAMIENTO
    // =========================================================================
    console.log('--- 6. PRUEBA EN VIVO DE SERVIDOR HTTPS LAN (TLS, RBAC Y AISLAMIENTO MULTIEMPRESA) ---');
    const caPath = path.resolve('storage', 'certs', 'atlob-lan-ca.crt');
    const certPath = path.resolve('storage', 'certs', 'atlob-lan.crt');
    const keyPath = path.resolve('storage', 'certs', 'atlob-lan.key');
    if (!fs.existsSync(caPath) || !fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      generarCertificadosLan();
    }
    const caBuffer = fs.readFileSync(caPath);

    const httpPort = await obtenerPuertoLibre();
    const httpsPort = await obtenerPuertoLibre();
    const secrets = Object.fromEntries(NOMBRES_SECRETOS_SERVIDOR.map(n => [n, crypto.randomBytes(32).toString('hex')]));

    const srvChild = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...secrets,
        NODE_ENV: 'production',
        DATABASE_URL: connectionString,
        HOST: '0.0.0.0',
        PORT: String(httpPort),
        HTTPS_ENABLED: '1',
        HTTPS_PORT: String(httpsPort),
        SSL_KEY_PATH: keyPath,
        SSL_CERT_PATH: certPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let srvOut = '';
    srvChild.stdout.on('data', d => { srvOut += String(d); });
    srvChild.stderr.on('data', d => { srvOut += String(d); });

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timeout esperando HTTPS server: ${srvOut.slice(-1500)}`)), 30000);
        srvChild.once('exit', () => {
          clearTimeout(timeout);
          reject(new Error(`Servidor terminó inesperadamente: ${srvOut.slice(-1500)}`));
        });
        const check = () => {
          if (srvOut.includes('Sistema disponible en') && srvOut.includes('Transporte HTTPS LAN disponible en')) {
            clearTimeout(timeout);
            resolve();
          }
        };
        srvChild.stdout.on('data', check);
      });

      const healthHttps = await peticionHttps({ hostname: '127.0.0.1', port: httpsPort, path: '/api/health', ca: caBuffer });
      assert.equal(healthHttps.status, 200);
      assert.equal(healthHttps.body.database, 'POSTGRESQL_CONNECTED');

      const lanIps = detectarIpsLan();
      if (lanIps.length > 0 && healthHttps.certSans?.includes(lanIps[0])) {
        const healthLan = await peticionHttps({ hostname: lanIps[0], port: httpsPort, path: '/api/health', ca: caBuffer });
        assert.equal(healthLan.status, 200);
        assert.equal(healthLan.body.database, 'POSTGRESQL_CONNECTED');
        console.log(`✅ HTTPS LAN verificado en https://${lanIps[0]}:${httpsPort}/api/health (CA local confiable, SAN: ${healthLan.certSans}).`);
      }

      const [loginU1, loginU2, loginU3, loginU4] = await Promise.all([
        peticionHttps({ hostname: '127.0.0.1', port: httpsPort, path: '/api/auth/login', method: 'POST', ca: caBuffer, body: { email: emailU1, password: clavePrueba, empresaPreferencia: empresaId } }),
        peticionHttps({ hostname: '127.0.0.1', port: httpsPort, path: '/api/auth/login', method: 'POST', ca: caBuffer, body: { email: emailU2, password: clavePrueba, empresaPreferencia: empresaId } }),
        peticionHttps({ hostname: '127.0.0.1', port: httpsPort, path: '/api/auth/login', method: 'POST', ca: caBuffer, body: { email: emailU3, password: clavePrueba, empresaPreferencia: empresaId } }),
        peticionHttps({ hostname: '127.0.0.1', port: httpsPort, path: '/api/auth/login', method: 'POST', ca: caBuffer, body: { email: emailU4, password: clavePrueba, empresaPreferencia: empresaId } }),
      ]);

      for (const l of [loginU1, loginU2, loginU3, loginU4]) {
        assert.equal(l.status, 200, `Login HTTPS debe responder 200: ${JSON.stringify(l.body)}`);
        assert.ok(l.body?.data?.accessToken, 'Login HTTPS debe devolver accessToken en data');
      }
      const tok1 = loginU1.body.data.accessToken as string;
      const tok2 = loginU2.body.data.accessToken as string;
      const tok3 = loginU3.body.data.accessToken as string;
      const tok4 = loginU4.body.data.accessToken as string;

      // RBAC: Auditor puede leer pero NO escribir
      const auditorLectura = await peticionHttps({
        hostname: '127.0.0.1', port: httpsPort, ca: caBuffer, token: tok4,
        path: `/api/empresas/${empresaId}/registro-compras?periodo=${periodo}`,
      });
      assert.equal(auditorLectura.status, 200, 'AUDITOR_REVISOR debe poder consultar reportes');

      const auditorEscritura = await peticionHttps({
        hostname: '127.0.0.1', port: httpsPort, ca: caBuffer, token: tok4, method: 'POST',
        path: `/api/empresas/${empresaId}/compras`,
        body: {
          periodoId: periodo, fechaEmision: '2026-03-10', fechaContable: '2026-03-10',
          tipoComprobante: '01', serie: 'F099', numero: '0000001', proveedorId,
          moneda: 'PEN', tipoCambio: 3.75, baseGravada: 100, igv: 18, total: 118,
          tipoAdquisicion: '1', formaPago: 'CONTADO',
        },
      });
      assert.equal(auditorEscritura.status, 403, 'AUDITOR_REVISOR debe ser rechazado con 403 en escrituras');

      // Aislamiento multiempresa: U2 y U3 no pueden acceder a Empresa B
      const [cruceU2, cruceU3] = await Promise.all([
        peticionHttps({ hostname: '127.0.0.1', port: httpsPort, ca: caBuffer, token: tok2, path: `/api/empresas/${empresaBId}/compras` }),
        peticionHttps({ hostname: '127.0.0.1', port: httpsPort, ca: caBuffer, token: tok3, path: `/api/empresas/${empresaBId}/ventas` }),
      ]);
      assert.equal(cruceU2.status, 403, 'Acceso cruzado de U2 a Empresa B debe rechazarse con 403');
      assert.equal(cruceU3.status, 403, 'Acceso cruzado de U3 a Empresa B debe rechazarse con 403');

      // Concurrencia HTTPS de los 3 usuarios + Segregación de funciones (U1 crea, U1 no puede contabilizar, U3 no puede contabilizar, U2 contabiliza)
      const [r1, r2, r3, crearBorradorHttp] = await Promise.all([
        medirOperacion('HTTPS-U1-LibroDiario', () =>
          peticionHttps({ hostname: '127.0.0.1', port: httpsPort, ca: caBuffer, token: tok1, path: `/api/empresas/${empresaId}/libro-diario?periodo=${periodo}` })
        ),
        medirOperacion('HTTPS-U2-Balance', () =>
          peticionHttps({ hostname: '127.0.0.1', port: httpsPort, ca: caBuffer, token: tok2, path: `/api/empresas/${empresaId}/balance-comprobacion?periodo=${periodo}` })
        ),
        medirOperacion('HTTPS-U3-RegistroVentas', () =>
          peticionHttps({ hostname: '127.0.0.1', port: httpsPort, ca: caBuffer, token: tok3, path: `/api/empresas/${empresaId}/registro-ventas?periodo=${periodo}` })
        ),
        medirOperacion('HTTPS-U1-CrearBorrador', () =>
          peticionHttps({
            hostname: '127.0.0.1', port: httpsPort, ca: caBuffer, token: tok1, method: 'POST',
            path: `/api/empresas/${empresaId}/asientos`,
            body: {
              periodoId, subdiarioId: subMap.get('10')!, fecha: '2026-03-30',
              glosa: 'Asiento HTTP TLS con segregación de funciones', moneda: 'PEN', tipoCambio: 3.75,
              detalles: [
                { linea: 1, cuentaId: ctaMap.get('1041')!, debe: 500, haber: 0, glosaLinea: 'Ingreso TLS' },
                { linea: 2, cuentaId: ctaMap.get('5011')!, debe: 0, haber: 500, glosaLinea: 'Capital TLS' },
              ],
            },
          })
        ),
      ]);
      assert.equal(r1.status, 200);
      assert.equal(r2.status, 200);
      assert.equal(r3.status, 200);
      assert.equal(crearBorradorHttp.status, 201);
      const idBorradorHttp = crearBorradorHttp.body.data.id as string;

      // U3 no puede contabilizar por RBAC (403); U1 no puede contabilizar por segregación (400); U2 sí puede (200)
      const contabU3 = await peticionHttps({ hostname: '127.0.0.1', port: httpsPort, ca: caBuffer, token: tok3, method: 'POST', path: `/api/asientos/${idBorradorHttp}/contabilizar` });
      assert.equal(contabU3.status, 403, 'ASISTENTE_CONTABLE no tiene permiso para contabilizar');

      const contabU1 = await peticionHttps({ hostname: '127.0.0.1', port: httpsPort, ca: caBuffer, token: tok1, method: 'POST', path: `/api/asientos/${idBorradorHttp}/contabilizar` });
      assert.equal(contabU1.status, 400, 'El creador no puede contabilizar su propio borrador (Segregación de funciones)');

      const contabU2 = await medirOperacion('HTTPS-U2-Contabilizar', () =>
        peticionHttps({ hostname: '127.0.0.1', port: httpsPort, ca: caBuffer, token: tok2, method: 'POST', path: `/api/asientos/${idBorradorHttp}/contabilizar` })
      );
      assert.equal(contabU2.status, 200, `CONTADOR_SENIOR debe poder contabilizar: ${JSON.stringify(contabU2.body)}`);
      console.log('✅ RBAC, aislamiento multiempresa, segregación de funciones y consultas concurrentes HTTPS verificados.\n');
    } finally {
      if (srvChild.exitCode === null && srvChild.signalCode === null) {
        const exited = new Promise<void>(resolve => srvChild.once('exit', () => resolve()));
        srvChild.kill();
        await exited;
      }
    }

    // =========================================================================
    // 7. MÉTRICAS DE RENDIMIENTO Y LATENCIA (p50, p95 <= 2,000 ms)
    // =========================================================================
    console.log('--- 7. EVALUACIÓN DE RENDIMIENTO Y LATENCIA BAJO CARGA DE 3 USUARIOS ---');
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

    assert.ok(p95 <= 2000, `p95 debe ser <= 2000 ms (obtenido: ${p95.toFixed(2)} ms)`);
    console.log('✅ Criterio de rendimiento p95 <= 2,000 ms cumplido.\n');

    const diarioPreReinicio = await conContextoEmpresa(empresaId, usuario1Id, () =>
      librosEEFFService.generarLibroDiario(empresaId, periodo)
    );
    assert.equal(diarioPreReinicio.totalAsientos, 63, 'Deben existir 63 asientos contabilizados antes del reinicio');

    // =========================================================================
    // 8. PERSISTENCIA 100% TRAS REINICIO EN FRÍO (POOL.END + NUEVO POOL)
    // =========================================================================
    console.log('--- 8. PERSISTENCIA TRAS REINICIO EN FRÍO (DISCONNECT & RECONNECT) ---');
    client.release();
    await pool.end();

    const freshPool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 10000,
    });
    setPostgresPool(freshPool, true);

    await conContextoEmpresa(empresaId, usuario3Id, async () => {
      const diarioPost = await librosEEFFService.generarLibroDiario(empresaId, periodo);
      const mayorPost = await librosEEFFService.generarLibroMayor(empresaId, periodo);
      const balancePost = await librosEEFFService.generarBalanceComprobacion(empresaId, periodo);
      const esfPost = await librosEEFFService.generarEstadoSituacionFinanciera(empresaId, periodo);

      assert.equal(diarioPost.totalAsientos, 63, 'Los 63 asientos deben persistir íntegros tras reinicio');
      assert.equal(diarioPost.totalDebe, diarioPreReinicio.totalDebe);
      assert.equal(diarioPost.totalHaber, diarioPreReinicio.totalHaber);
      assert.equal(mayorPost.totalSumasDebe, diarioPost.totalDebe);
      assert.equal(balancePost.totales.sumasDebe, diarioPost.totalDebe);
      assert.equal(esfPost.estaCuadrado, true);
      assert.equal(esfPost.diferenciaCuadre, 0);
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

      for (const uid of [usuario1Id, usuario2Id, usuario3Id, usuarioAuditorId]) {
        await cleanClient.query("SELECT set_config('app.usuario_id', $1, false), set_config('app.user_id', $1, false)", [uid]);
        await cleanClient.query('DELETE FROM refresh_tokens WHERE usuario_id = $1', [uid]);
        await cleanClient.query('DELETE FROM usuario_empresa WHERE usuario_id = $1', [uid]);
        await cleanClient.query('DELETE FROM membresias WHERE usuario_id = $1', [uid]);
      }

      await cleanClient.query('DELETE FROM empresas WHERE id IN ($1, $2)', [empresaId, empresaBId]);
      await cleanClient.query('DELETE FROM usuarios_estudio WHERE id IN ($1, $2, $3, $4)', [usuario1Id, usuario2Id, usuario3Id, usuarioAuditorId]);
      await cleanClient.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
      await cleanClient.query("SELECT set_config('app.restaurando_backup', 'false', false)");
    } catch {
      // Ignorar fallos no críticos de limpieza
    } finally {
      cleanClient.release();
      await freshPool.end();
    }

    console.log('========================================================================');
    console.log('🎉 PILOTO MULTIUSUARIO (3 SESIONES) + HTTPS LAN APROBADO AL 100% (EXIT 0)');
    console.log('========================================================================');
  } catch (err) {
    console.error('❌ ERROR CRÍTICO EN PRUEBAS MULTIUSUARIO / HTTPS LAN:', err);
    try { client.release(); } catch {}
    try { await pool.end(); } catch {}
    process.exit(1);
  }
}

ejecutar();
