import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { NOMBRES_SECRETOS_SERVIDOR } from '../server/config/env';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const EXE_UNPACKED = path.join(PROJECT_ROOT, 'release', 'win-unpacked', 'ATLOB ERP.exe');
const EXE_SETUP = path.join(PROJECT_ROOT, 'release', 'ATLOB-ERP-2.0.0-Setup-x64.exe');
const EXE_PORTABLE = path.join(PROJECT_ROOT, 'release', 'ATLOB-ERP-2.0.0-Portable-x64.exe');
const CERT_PATH = path.join(PROJECT_ROOT, 'storage', 'certs', 'atlob-lan.crt');
const KEY_PATH = path.join(PROJECT_ROOT, 'storage', 'certs', 'atlob-lan.key');
const CA_PATH = path.join(PROJECT_ROOT, 'storage', 'certs', 'cliente-lan', 'atlob-lan-ca.crt');
const EVIDENCIAS_DIR = path.join(PROJECT_ROOT, 'storage', 'evidencias-electron-e2e');
const TEMP_DB = 'atlob_electron_e2e';

interface HttpResult<T = any> {
  status: number;
  headers: http.IncomingHttpHeaders;
  rawBody: string;
  json: T | null;
}

function derivarDbUrl(baseUrl: string, dbName: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}

async function obtenerPuertoLibre(host: string): Promise<number> {
  const srv = createServer();
  await new Promise<void>((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(0, host, resolve);
  });
  const addr = srv.address();
  assert(addr && typeof addr !== 'string', `No se pudo asignar puerto en ${host}`);
  const port = addr.port;
  await new Promise<void>((resolve) => srv.close(() => resolve()));
  return port;
}

function httpRequest<T = any>(
  urlStr: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    caPem?: Buffer;
    rejectUnauthorized?: boolean;
    timeoutMs?: number;
  } = {}
): Promise<HttpResult<T>> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const isHttps = parsed.protocol === 'https:';
    const payload = options.body === undefined
      ? undefined
      : typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body);

    const headers: Record<string, string> = { ...(options.headers || {}) };
    if (payload !== undefined) {
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(payload));
    }

    const req = (isHttps ? https : http).request(
      {
        hostname: parsed.hostname,
        port: Number(parsed.port || (isHttps ? 443 : 80)),
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method || 'GET',
        headers,
        timeout: options.timeoutMs ?? 15000,
        ...(isHttps
          ? {
              ca: options.caPem,
              rejectUnauthorized: options.rejectUnauthorized ?? true,
            }
          : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8');
          let json: T | null = null;
          try {
            json = rawBody ? (JSON.parse(rawBody) as T) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode || 0, headers: res.headers, rawBody, json });
        });
      }
    );

    req.on('timeout', () => req.destroy(new Error(`TIMEOUT_HTTP_${options.timeoutMs ?? 15000}MS`)));
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

async function iniciarServidorBackend(params: {
  dbUrl: string;
  lanIp: string;
  httpPort: number;
  httpsPort: number;
  secrets: Record<string, string>;
}): Promise<{ child: ChildProcess; httpUrl: string; httpsUrl: string }> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      ...params.secrets,
      NODE_ENV: 'production',
      DATABASE_URL: params.dbUrl,
      HOST: params.lanIp,
      HTTP_HOST: '127.0.0.1',
      PORT: String(params.httpPort),
      HTTPS_ENABLED: '1',
      HTTPS_PORT: String(params.httpsPort),
      SSL_CERT_PATH: CERT_PATH,
      SSL_KEY_PATH: KEY_PATH,
      LAN_ONLY: '1',
      ALLOW_WEB_UI: '0',
    },
  });

  let logs = '';
  child.stdout?.on('data', (c) => { logs += String(c); });
  child.stderr?.on('data', (c) => { logs += String(c); });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`TIMEOUT_SERVIDOR_E2E: ${logs.slice(-1500)}`));
    }, 30000);
    child.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`SERVIDOR_E2E_CERRO_${code}: ${logs.slice(-1500)}`));
    });
    const revisar = () => {
      if (logs.includes('Sistema disponible en') && logs.includes('Transporte HTTPS LAN disponible')) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout?.on('data', revisar);
    child.stderr?.on('data', revisar);
  });

  return {
    child,
    httpUrl: `http://127.0.0.1:${params.httpPort}`,
    httpsUrl: `https://${params.lanIp}:${params.httpsPort}`,
  };
}

async function detenerServidorBackend(child: ChildProcess | null) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill();
  await Promise.race([
    exited,
    new Promise<void>((resolve) => setTimeout(resolve, 4000)),
  ]);
}

async function ejecutarElectronCaso(params: {
  exePath: string;
  userDataDir: string;
  outJson: string;
  configE2e?: { servidorUrl: string; caPem: string };
  credentialsE2e?: { email: string; password: string };
  configShot?: string;
  screenShot?: string;
  authShot?: string;
  timeoutMs?: number;
}): Promise<any> {
  if (fs.existsSync(params.outJson)) fs.unlinkSync(params.outJson);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ATLOB_USER_DATA_DIR: params.userDataDir,
    ATLOB_DESKTOP_E2E_OUT: params.outJson,
  };
  for (const key of Object.keys(env)) {
    if (
      key === 'ELECTRON_RUN_AS_NODE' ||
      key === 'ELECTRON_NO_ATTACH_CONSOLE' ||
      key === 'CHROME_CRASHPAD_PIPE_NAME' ||
      key.startsWith('VSCODE_')
    ) {
      delete env[key];
    }
  }
  delete env.ATLOB_DESKTOP_E2E_CONFIG;
  delete env.ATLOB_DESKTOP_E2E_CREDENTIALS;
  delete env.ATLOB_DESKTOP_E2E_CONFIG_SHOT;
  delete env.ATLOB_DESKTOP_E2E_SHOT;
  delete env.ATLOB_DESKTOP_E2E_AUTH_SHOT;

  if (params.configE2e) env.ATLOB_DESKTOP_E2E_CONFIG = JSON.stringify(params.configE2e);
  if (params.credentialsE2e) env.ATLOB_DESKTOP_E2E_CREDENTIALS = JSON.stringify(params.credentialsE2e);
  if (params.configShot) env.ATLOB_DESKTOP_E2E_CONFIG_SHOT = params.configShot;
  if (params.screenShot) env.ATLOB_DESKTOP_E2E_SHOT = params.screenShot;
  if (params.authShot) env.ATLOB_DESKTOP_E2E_AUTH_SHOT = params.authShot;

  const child = spawn(params.exePath, [], {
    cwd: PROJECT_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (c) => { stdout += String(c); });
  child.stderr?.on('data', (c) => { stderr += String(c); });

  const timeoutMs = params.timeoutMs ?? 60000;
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      reject(new Error(`TIMEOUT_ELECTRON_${timeoutMs}MS (${path.basename(params.exePath)})\nstdout=${stdout.slice(-600)}\nstderr=${stderr.slice(-600)}`));
    }, timeoutMs);
    child.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });

  assert.equal(exitCode, 0, `Electron terminó con código ${exitCode}.\nstdout=${stdout.slice(-600)}\nstderr=${stderr.slice(-600)}`);
  assert(fs.existsSync(params.outJson), `No se generó salida E2E en ${params.outJson}`);
  return JSON.parse(fs.readFileSync(params.outJson, 'utf8'));
}

function seleccionarCuentaRegistro(
  cuentas: Array<{ id: string; codigo: string; nombre: string; esRegistro?: boolean }>,
  prefijos: string[]
) {
  for (const prefijo of prefijos) {
    const exacta = cuentas.find((c) => c.codigo === prefijo && c.esRegistro !== false);
    if (exacta) return exacta;
  }
  for (const prefijo of prefijos) {
    const hija = cuentas.find((c) => c.codigo.startsWith(prefijo) && c.esRegistro !== false);
    if (hija) return hija;
  }
  throw new Error(`CUENTA_PCGE_NO_ENCONTRADA: [${prefijos.join(', ')}]`);
}

async function validarReportes(httpsUrl: string, caPem: Buffer, token: string, empresaId: string, periodoCodigo: string) {
  const headers = { Authorization: `Bearer ${token}`, 'x-empresa-id': empresaId };
  const [rc, rv, ld, lm, bc, esf] = await Promise.all([
    httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/registro-compras?periodo=${periodoCodigo}`, { headers, caPem }),
    httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/registro-ventas?periodo=${periodoCodigo}`, { headers, caPem }),
    httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/libro-diario?periodo=${periodoCodigo}`, { headers, caPem }),
    httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/libro-mayor?periodo=${periodoCodigo}`, { headers, caPem }),
    httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/balance-comprobacion?periodo=${periodoCodigo}`, { headers, caPem }),
    httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/estado-situacion-financiera?periodo=${periodoCodigo}`, { headers, caPem }),
  ]);

  assert.equal(rc.status, 200);
  assert.equal(rv.status, 200);
  assert.equal(ld.status, 200);
  assert.equal(lm.status, 200);
  assert.equal(bc.status, 200);
  assert.equal(esf.status, 200);

  assert.equal(rc.json.data.cuadreLibroDiario.estaCuadrado, true);
  assert.equal(Number(rc.json.data.cuadreLibroDiario.diferencia), 0);
  assert.equal(Number(rc.json.data.totales.totalGeneral), 1180);
  assert.equal(rv.json.data.cuadreLibroDiario.estaCuadrado, true);
  assert.equal(Number(rv.json.data.cuadreLibroDiario.diferenciaBase ?? 0), 0);
  assert.equal(Number(rv.json.data.cuadreLibroDiario.diferenciaIgv ?? 0), 0);
  assert.equal(Number(rv.json.data.totales.totalGeneral), 2360);
  assert.equal(ld.json.data.estaBalanceado, true);
  assert(Number(ld.json.data.totalAsientos) >= 3, `Asientos en Diario insuficientes: ${ld.json.data.totalAsientos}`);
  const diarioDebe = Number(ld.json.data.totalDebe);
  const diarioHaber = Number(ld.json.data.totalHaber);
  assert(diarioDebe > 0 && Math.abs(diarioDebe - diarioHaber) === 0, `Diario descuadrado: ${diarioDebe}/${diarioHaber}`);
  assert.equal(lm.json.data.estaCuadrado, true);
  assert.equal(Number(lm.json.data.totalSumasDebe), diarioDebe);
  assert.equal(Number(lm.json.data.totalSumasHaber), diarioHaber);
  assert.equal(bc.json.data.cuadre.todoCuadrado, true);
  assert.equal(bc.json.data.cuadre.sumasCuadradas, true);
  assert.equal(bc.json.data.cuadre.saldosCuadrados, true);
  assert.equal(esf.json.data.estaCuadrado, true);
  assert(Number(esf.json.data.totalActivo) > 0);
  assert.equal(Number(esf.json.data.totalActivo), Number(esf.json.data.totalPasivoYPatrimonio));
  assert.equal(Number(esf.json.data.diferenciaCuadre), 0);

  return {
    comprasTotal: Number(rc.json.data.totales.totalGeneral),
    ventasTotal: Number(rv.json.data.totales.totalGeneral),
    diarioAsientos: Number(ld.json.data.totalAsientos),
    diarioTotalDebe: Number(ld.json.data.totalDebe),
    mayorSumasDebe: Number(lm.json.data.totalSumasDebe),
    esfTotalActivo: Number(esf.json.data.totalActivo),
    esfDiferenciaCuadre: Number(esf.json.data.diferenciaCuadre),
  };
}

async function main() {
  for (const archivo of [EXE_UNPACKED, EXE_SETUP, EXE_PORTABLE, CERT_PATH, KEY_PATH, CA_PATH]) {
    assert(fs.existsSync(archivo), `Falta archivo requerido para verificación Electron: ${archivo}`);
  }

  const baseAppUrl = process.env.DATABASE_URL;
  assert(baseAppUrl, 'DATABASE_URL requerida en .env');
  const e2eDbUrl = derivarDbUrl(baseAppUrl, TEMP_DB);
  const adminUrl = process.env.TEST_ADMIN_DATABASE_URL || 'postgresql://postgres:@localhost:5432/postgres';
  const adminPool = new Pool({ connectionString: adminUrl });
  const caPemBuf = fs.readFileSync(CA_PATH);
  const caPemStr = caPemBuf.toString('utf8');
  const lanIp = '192.168.1.34';
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlob-electron-e2e-'));
  const portableUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlob-electron-port-'));
  fs.mkdirSync(EVIDENCIAS_DIR, { recursive: true });

  const secrets = Object.fromEntries(
    NOMBRES_SECRETOS_SERVIDOR.map((n) => [n, crypto.randomBytes(32).toString('hex')])
  );

  let srvChild: ChildProcess | null = null;
  let dbPool: Pool | null = null;

  try {
    console.log('=== 1. PREPARACIÓN DE BASE TEMPORAL AISLADA ===');
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEMP_DB} WITH (FORCE)`);
    await adminPool.query(`CREATE DATABASE ${TEMP_DB} OWNER contabilidad_app`);

    const migrateRes = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', `const d=await import('./server/config/database.ts');try{await d.initializeDatabase();await(await import('./server/db/migrate.ts')).runMigrations()}finally{await d.closeDatabase()}`],
      {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        timeout: 45000,
        env: { ...process.env, ...secrets, NODE_ENV: 'test', DATABASE_URL: e2eDbUrl },
      }
    );
    assert.equal(migrateRes.status, 0, `Migración de ${TEMP_DB} falló: ${migrateRes.stderr}`);

    dbPool = new Pool({ connectionString: e2eDbUrl });
    const dbNameRow = await dbPool.query<{ db: string }>('SELECT current_database() AS db');
    assert.equal(dbNameRow.rows[0]?.db, TEMP_DB);

    const httpPort = await obtenerPuertoLibre('127.0.0.1');
    const httpsPort = await obtenerPuertoLibre(lanIp);
    const srv1 = await iniciarServidorBackend({ dbUrl: e2eDbUrl, lanIp, httpPort, httpsPort, secrets });
    srvChild = srv1.child;
    const httpsUrl = srv1.httpsUrl;

    console.log('=== 2. BLOQUEO WEB LAN Y CONECTIVIDAD TLS ESTRICTA ===');
    const webRoot = await httpRequest<any>(`${httpsUrl}/`, { caPem: caPemBuf });
    assert.equal(webRoot.status, 403, `GET / debía devolver 403, devolvió ${webRoot.status}`);
    assert.equal(webRoot.json?.error, 'MODO_ESCRITORIO_EXCLUSIVO');

    const health = await httpRequest<any>(`${httpsUrl}/api/health`, { caPem: caPemBuf });
    assert.equal(health.status, 200);
    assert.equal(health.json?.status, 'UP');
    assert.equal(health.json?.database, 'POSTGRESQL_CONNECTED');

    await assert.rejects(
      () => httpRequest(`${httpsUrl}/api/health`, { rejectUnauthorized: true }),
      /certificate|self-signed|unable to verify|CERT/i,
      'TLS sin certificado CA debe fallar estrictamente'
    );

    const suf = crypto.randomBytes(3).toString('hex');
    const passAdmin = `Adm!${suf}2026#Aa`;
    const passContador = `Cnt!${suf}2026#Bb`;
    const passAsistente = `Ast!${suf}2026#Cc`;
    const passAuditor = `Aud!${suf}2026#Dd`;

    const adminUser = `admin_e2e_${suf}`;
    const contadorUser = `contador_e2e_${suf}`;
    const asistenteUser = `asistente_e2e_${suf}`;
    const auditorUser = `auditor_e2e_${suf}`;

    const setupInit = await httpRequest<any>(`${httpsUrl}/api/setup/inicializar`, {
      method: 'POST',
      caPem: caPemBuf,
      body: {
        nombreEstudio: 'ESTUDIO ELECTRON E2E S.A.C.',
        adminNombre: 'Admin Electron E2E',
        usuario: adminUser,
        adminPassword: passAdmin,
        adminPasswordConfirm: passAdmin,
        mfaRequerido: false,
      },
    });
    assert.equal(setupInit.status, 201, `setup/inicializar falló: ${setupInit.rawBody}`);

    const loginAdminRes = await httpRequest<any>(`${httpsUrl}/api/auth/login`, {
      method: 'POST',
      caPem: caPemBuf,
      body: { usuario: adminUser, password: passAdmin },
    });
    assert.equal(loginAdminRes.status, 200);
    const tokenAdmin = String(loginAdminRes.json.data.accessToken);

    const empRes = await httpRequest<any>(`${httpsUrl}/api/empresas`, {
      method: 'POST',
      caPem: caPemBuf,
      headers: { Authorization: `Bearer ${tokenAdmin}` },
      body: {
        codigoEmpresa: `EL${suf.toUpperCase()}`,
        ruc: '20608889991',
        razonSocial: 'COMERCIAL ELECTRON E2E S.A.C.',
        regimenTributario: 'REGIMEN_GENERAL',
        domicilioFiscal: 'AV. CENTRAL 100, LIMA',
        ejercicio: 2026,
        metodoInventario: 'PERMANENTE',
        monedaPrincipal: 'PEN',
      },
    });
    assert.equal(empRes.status, 201, `POST /empresas falló: ${empRes.rawBody}`);
    const empresaId = String(empRes.json.data.id);

    await dbPool.query("UPDATE licencia SET max_usuarios = GREATEST(max_usuarios, 4) WHERE current_database() = $1", [TEMP_DB]);
    for (const u of [
      { usuario: contadorUser, password: passContador, rolGlobal: 'CONTADOR_SENIOR', nombre: 'Contador E2E' },
      { usuario: asistenteUser, password: passAsistente, rolGlobal: 'ASISTENTE_CONTABLE', nombre: 'Asistente E2E' },
      { usuario: auditorUser, password: passAuditor, rolGlobal: 'AUDITOR_REVISOR', nombre: 'Auditor E2E' },
    ]) {
      const uRes = await httpRequest<any>(`${httpsUrl}/api/usuarios`, {
        method: 'POST',
        caPem: caPemBuf,
        headers: { Authorization: `Bearer ${tokenAdmin}` },
        body: { ...u, empresaIds: [empresaId] },
      });
      assert.equal(uRes.status, 201, `POST /usuarios ${u.rolGlobal} falló: ${uRes.rawBody}`);
    }

    console.log('=== 3. EJECUCIÓN 1 REAL DE ATLOB ERP.exe (WIZARD -> DPAPI -> LOGIN UI) ===');
    const out1 = path.join(userDataDir, 'e2e-run1.json');
    const shotWizard = path.join(EVIDENCIAS_DIR, '01-wizard-cliente.png');
    const shotLogin = path.join(EVIDENCIAS_DIR, '02-login-desktop.png');
    const shotAuth = path.join(EVIDENCIAS_DIR, '03-sesion-autenticada.png');

    const resRun1 = await ejecutarElectronCaso({
      exePath: EXE_UNPACKED,
      userDataDir,
      outJson: out1,
      configE2e: { servidorUrl: httpsUrl, caPem: caPemStr },
      credentialsE2e: { email: adminUser, password: passAdmin },
      configShot: shotWizard,
      screenShot: shotLogin,
      authShot: shotAuth,
      timeoutMs: 65000,
    });

    assert.equal(resRun1.ok, true, `Run 1 falló: ${JSON.stringify(resRun1)}`);
    assert.equal(resRun1.modo, 'cliente');
    assert.equal(resRun1.servidorLocalIniciado, false);
    assert.equal(resRun1.estadoConexion?.online, true);
    assert.equal(resRun1.estadoConexion?.servidorUrl, httpsUrl);
    assert(resRun1.estadoConexion?.huellaCa, 'Debe existir huella CA registrada');
    assert.equal(resRun1.verificacionInicial?.origin, 'atlob://app');
    assert.equal(resRun1.verificacionInicial?.tieneBridgeDesktop, true);
    assert.equal(resRun1.verificacionInicial?.tieneFormularioLogin, true);
    assert.equal(resRun1.verificacionInicial?.healthResp?.status, 200);
    assert.equal(resRun1.resultadoLogin?.autenticadoUi, true);
    assert.equal(resRun1.resultadoLogin?.tieneFooterConexion, true);
    assert(fs.existsSync(path.join(userDataDir, 'instalacion.bin')), 'Debe haberse persistido instalacion.bin DPAPI');
    for (const imgPath of [shotWizard, shotLogin, shotAuth]) {
      assert(fs.existsSync(imgPath) && fs.statSync(imgPath).size > 2000, `Captura inválida: ${imgPath}`);
    }

    const pgConnsRun1 = await dbPool.query<{ application_name: string }>(
      'SELECT application_name FROM pg_stat_activity WHERE datname = $1',
      [TEMP_DB]
    );
    assert(
      pgConnsRun1.rows.every((r) => !String(r.application_name || '').toLowerCase().includes('electron')),
      'Electron no debe conectarse directamente a PostgreSQL'
    );

    console.log('=== 4. EJECUCIÓN 2 REAL DE ATLOB ERP.exe (PERSISTENCIA DPAPI TRAS REAPERTURA) ===');
    const out2 = path.join(userDataDir, 'e2e-run2.json');
    const resRun2 = await ejecutarElectronCaso({
      exePath: EXE_UNPACKED,
      userDataDir,
      outJson: out2,
      timeoutMs: 55000,
    });
    assert.equal(resRun2.ok, true, `Run 2 falló: ${JSON.stringify(resRun2)}`);
    assert.equal(resRun2.modo, 'cliente');
    assert.equal(resRun2.servidorLocalIniciado, false);
    assert.equal(resRun2.estadoConexion?.online, true);
    assert.equal(resRun2.verificacionInicial?.origin, 'atlob://app');
    assert.equal(resRun2.verificacionInicial?.tieneBridgeDesktop, true);
    assert.equal(resRun2.verificacionInicial?.healthResp?.status, 200);

    console.log('=== 5. EJECUCIÓN DEL EJECUTABLE PORTABLE v2.0.0 ===');
    const outPortable = path.join(portableUserDataDir, 'e2e-portable.json');
    const resPortable = await ejecutarElectronCaso({
      exePath: EXE_PORTABLE,
      userDataDir: portableUserDataDir,
      outJson: outPortable,
      configE2e: { servidorUrl: httpsUrl, caPem: caPemStr },
      credentialsE2e: { email: asistenteUser, password: passAsistente },
      timeoutMs: 90000,
    });
    assert.equal(resPortable.ok, true, `Portable falló: ${JSON.stringify(resPortable)}`);
    assert.equal(resPortable.modo, 'cliente');
    assert.equal(resPortable.servidorLocalIniciado, false);
    assert.equal(resPortable.verificacionInicial?.origin, 'atlob://app');
    assert.equal(resPortable.resultadoLogin?.autenticadoUi, true);
    assert.equal(resPortable.resultadoLogin?.tieneFooterConexion, true);

    // Servidor central sigue vivo tras cerrar clientes Electron
    const healthTrasCierreClientes = await httpRequest<any>(`${httpsUrl}/api/health`, { caPem: caPemBuf });
    assert.equal(healthTrasCierreClientes.status, 200);

    console.log('=== 6. OPERACIÓN MULTIUSUARIO CONCURRENTE (3 SESIONES ACTIVAS + AUDITOR + CUADRE) ===');
    const [loginCont, loginAsis, loginAud] = await Promise.all([
      httpRequest<any>(`${httpsUrl}/api/auth/login`, { method: 'POST', caPem: caPemBuf, body: { usuario: contadorUser, password: passContador } }),
      httpRequest<any>(`${httpsUrl}/api/auth/login`, { method: 'POST', caPem: caPemBuf, body: { usuario: asistenteUser, password: passAsistente } }),
      httpRequest<any>(`${httpsUrl}/api/auth/login`, { method: 'POST', caPem: caPemBuf, body: { usuario: auditorUser, password: passAuditor } }),
    ]);
    assert.equal(loginCont.status, 200);
    assert.equal(loginAsis.status, 200);
    assert.equal(loginAud.status, 200);

    const authAdmin = { Authorization: `Bearer ${tokenAdmin}`, 'x-empresa-id': empresaId };
    const authCont = { Authorization: `Bearer ${loginCont.json.data.accessToken}`, 'x-empresa-id': empresaId };
    const authAsis = { Authorization: `Bearer ${loginAsis.json.data.accessToken}`, 'x-empresa-id': empresaId };
    const authAud = { Authorization: `Bearer ${loginAud.json.data.accessToken}`, 'x-empresa-id': empresaId };

    const [perRes, subRes, pcgeRes] = await Promise.all([
      httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/periodos?anio=2026`, { caPem: caPemBuf, headers: authAsis }),
      httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/subdiarios`, { caPem: caPemBuf, headers: authAsis }),
      httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/plan-cuentas`, { caPem: caPemBuf, headers: authAsis }),
    ]);
    const periodoCodigo = '2026-09';
    const periodoObj = (perRes.json?.data || []).find((p: any) => p.codigoPeriodo === periodoCodigo || p.codigo === periodoCodigo);
    assert(periodoObj?.id, 'No se encontró período 2026-09');
    const periodoId = String(periodoObj.id);
    const subDiario = (subRes.json?.data || []).find((s: any) => s.codigo === '05') || (subRes.json?.data || []).find((s: any) => s.permiteAsientoManual !== false);
    assert(subDiario?.id, 'No se encontró subdiario manual');
    const cuentaBanco = seleccionarCuentaRegistro(pcgeRes.json.cuentas, ['10411', '1041', '1011', '101']);
    const cuentaCapital = seleccionarCuentaRegistro(pcgeRes.json.cuentas, ['50111', '5011', '501']);

    const [provRes, cliRes] = await Promise.all([
      httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/anexos`, {
        method: 'POST', caPem: caPemBuf, headers: authAsis,
        body: { tipoDocumento: '6', numeroDocumento: '20100070970', razonSocial: 'PROVEEDOR ELECTRON S.A.', direccion: 'JR. LIMA 10', tipoEntidad: 'PROVEEDOR' },
      }),
      httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/anexos`, {
        method: 'POST', caPem: caPemBuf, headers: authCont,
        body: { tipoDocumento: '6', numeroDocumento: '20504914434', razonSocial: 'CLIENTE ELECTRON S.A.C.', direccion: 'AV. CENTRAL 20', tipoEntidad: 'CLIENTE' },
      }),
    ]);
    assert.equal(provRes.status, 201);
    assert.equal(cliRes.status, 201);

    const tEscritura = performance.now();
    const [compraRes, ventaRes, asientoRes, empListAdmin] = await Promise.all([
      httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/compras`, {
        method: 'POST', caPem: caPemBuf, headers: authAsis,
        body: {
          periodoId, fechaEmision: '2026-09-10', fechaContable: '2026-09-10',
          tipoComprobante: '01', serie: 'F001', numero: '0000101',
          proveedorId: String(provRes.json.data.id), moneda: 'PEN', tipoCambio: 1,
          baseGravada: 1000, igv: 180, total: 1180, tipoAdquisicion: '1', formaPago: 'CONTADO', estado: 'REGISTRADO',
        },
      }),
      httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/ventas`, {
        method: 'POST', caPem: caPemBuf, headers: authCont,
        body: {
          periodoId, fechaEmision: '2026-09-12', fechaContable: '2026-09-12',
          tipoComprobante: '01', serie: 'F001', numero: '0000201',
          clienteId: String(cliRes.json.data.id), moneda: 'PEN', tipoCambio: 1,
          baseGravada: 2000, igv: 360, total: 2360, tipoOperacion: 'VENTA_INTERNA', formaPago: 'CONTADO', estado: 'REGISTRADO',
        },
      }),
      httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/asientos`, {
        method: 'POST', caPem: caPemBuf, headers: authAsis,
        body: {
          periodoId, subdiarioId: subDiario.id, fecha: '2026-09-05',
          glosa: 'Aporte capital cliente escritorio E2E', moneda: 'PEN', tipoCambio: 1, origen: 'MANUAL',
          detalles: [
            { linea: 1, cuentaId: cuentaBanco.id, debe: 5000, haber: 0 },
            { linea: 2, cuentaId: cuentaCapital.id, debe: 0, haber: 5000 },
          ],
        },
      }),
      httpRequest<any>(`${httpsUrl}/api/empresas`, { caPem: caPemBuf, headers: authAdmin }),
    ]);

    assert.equal(compraRes.status, 201, `Compra falló: ${compraRes.rawBody}`);
    assert.equal(ventaRes.status, 201, `Venta falló: ${ventaRes.rawBody}`);
    assert.equal(asientoRes.status, 201, `Asiento falló: ${asientoRes.rawBody}`);
    assert.equal(empListAdmin.status, 200);
    const asientoId = String(asientoRes.json.data.id);

    // RBAC negativo + segregación
    const [audWrite, asisContab, contabOk] = await Promise.all([
      httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/asientos`, {
        method: 'POST', caPem: caPemBuf, headers: authAud,
        body: {
          periodoId, subdiarioId: subDiario.id, fecha: '2026-09-05', glosa: 'Bloqueado auditor', moneda: 'PEN', tipoCambio: 1, origen: 'MANUAL',
          detalles: [{ linea: 1, cuentaId: cuentaBanco.id, debe: 100, haber: 0 }, { linea: 2, cuentaId: cuentaCapital.id, debe: 0, haber: 100 }],
        },
      }),
      httpRequest<any>(`${httpsUrl}/api/asientos/${asientoId}/contabilizar`, { method: 'POST', caPem: caPemBuf, headers: authAsis, body: {} }),
      httpRequest<any>(`${httpsUrl}/api/asientos/${asientoId}/contabilizar`, { method: 'POST', caPem: caPemBuf, headers: authCont, body: {} }),
    ]);
    assert.equal(audWrite.status, 403);
    assert.equal(asisContab.status, 403);
    assert.equal(contabOk.status, 200);

    // Sincronización multiusuario visible desde sesión Administrador
    const [syncCompras, syncVentas, syncAsientos] = await Promise.all([
      httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/compras`, { caPem: caPemBuf, headers: authAdmin }),
      httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/ventas`, { caPem: caPemBuf, headers: authAdmin }),
      httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/asientos?periodo=${periodoCodigo}`, { caPem: caPemBuf, headers: authAdmin }),
    ]);
    const syncMs = performance.now() - tEscritura;
    const extraerLista = (res: HttpResult<any>): any[] => {
      const payload = res.json?.data;
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload?.items)) return payload.items;
      if (Array.isArray(payload?.data)) return payload.data;
      return [];
    };
    const listaComprasSync = extraerLista(syncCompras);
    const listaVentasSync = extraerLista(syncVentas);
    const listaAsientosSync = extraerLista(syncAsientos);
    assert.equal(listaComprasSync.length, 1);
    assert.equal(listaVentasSync.length, 1);
    assert(listaAsientosSync.length >= 3, `Se esperaban >= 3 asientos sincronizados, obtenidos ${listaAsientosSync.length}`);
    assert(syncMs <= 5000, `Latencia de sincronización superó 5000 ms: ${syncMs.toFixed(1)} ms`);

    const reportesPreCaida = await validarReportes(httpsUrl, caPemBuf, loginAud.json.data.accessToken, empresaId, periodoCodigo);

    console.log('=== 7. SIMULACIÓN DE DESCONEXIÓN Y BLOQUEO OFFLINE EN ATLOB ERP.exe ===');
    await detenerServidorBackend(srvChild);
    srvChild = null;

    await assert.rejects(
      () => httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/compras`, { caPem: caPemBuf, headers: authAsis, timeoutMs: 2500 }),
      /ECONNREFUSED|ETIMEDOUT|TIMEOUT/,
      'Con el servidor apagado, la solicitud HTTPS debe rechazarse'
    );

    const outOffline = path.join(userDataDir, 'e2e-offline.json');
    const shotOffline = path.join(EVIDENCIAS_DIR, '04-offline-bloqueado.png');
    const resOffline = await ejecutarElectronCaso({
      exePath: EXE_UNPACKED,
      userDataDir,
      outJson: outOffline,
      screenShot: shotOffline,
      timeoutMs: 55000,
    });
    assert.equal(resOffline.ok, true);
    assert.equal(resOffline.modo, 'cliente');
    assert.equal(resOffline.servidorLocalIniciado, false);
    assert.equal(resOffline.estadoConexion?.online, false);
    assert.equal(resOffline.verificacionInicial?.healthResp?.status, 503);
    assert(String(resOffline.verificacionInicial?.healthResp?.body?.error || '').includes('SERVIDOR_NO_DISPONIBLE'));
    assert(String(resOffline.verificacionInicial?.textoVisibleSample || '').includes('Configurar servidor'));
    assert(fs.existsSync(shotOffline) && fs.statSync(shotOffline).size > 2000);

    console.log('=== 8. RECONEXIÓN DEL SERVIDOR Y PERSISTENCIA TRAS REINICIO ===');
    const srv2 = await iniciarServidorBackend({ dbUrl: e2eDbUrl, lanIp, httpPort, httpsPort, secrets });
    srvChild = srv2.child;

    // Preserva Local State + instalacion.bin (DPAPI) y limpia Partitions para validar Login UI limpio tras reconectar
    fs.rmSync(path.join(userDataDir, 'Partitions'), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    const outReconex = path.join(userDataDir, 'e2e-reconectado.json');
    const shotReconex = path.join(EVIDENCIAS_DIR, '05-reconectado-login.png');
    const resReconex = await ejecutarElectronCaso({
      exePath: EXE_UNPACKED,
      userDataDir,
      outJson: outReconex,
      credentialsE2e: { email: adminUser, password: passAdmin },
      screenShot: shotReconex,
      timeoutMs: 55000,
    });
    assert.equal(resReconex.ok, true, `Reconexión falló: ${JSON.stringify(resReconex)}`);
    assert.equal(resReconex.estadoConexion?.online, true);
    assert.equal(resReconex.resultadoLogin?.autenticadoUi, true);
    assert.equal(resReconex.resultadoLogin?.tieneFooterConexion, true);
    assert(fs.existsSync(shotReconex) && fs.statSync(shotReconex).size > 2000);

    const loginAdminPost = await httpRequest<any>(`${httpsUrl}/api/auth/login`, {
      method: 'POST', caPem: caPemBuf, body: { usuario: adminUser, password: passAdmin },
    });
    assert.equal(loginAdminPost.status, 200);
    const reportesPostReinicio = await validarReportes(httpsUrl, caPemBuf, loginAdminPost.json.data.accessToken, empresaId, periodoCodigo);
    assert.deepEqual(reportesPostReinicio, reportesPreCaida);

    console.log(JSON.stringify({
      ok: true,
      baseTemporal: TEMP_DB,
      httpsUrl,
      syncMs: Number(syncMs.toFixed(1)),
      run1: {
        modo: resRun1.modo,
        servidorLocalIniciado: resRun1.servidorLocalIniciado,
        origin: resRun1.verificacionInicial.origin,
        tieneBridgeDesktop: resRun1.verificacionInicial.tieneBridgeDesktop,
        autenticadoUi: resRun1.resultadoLogin.autenticadoUi,
        huellaCa: resRun1.estadoConexion.huellaCa,
      },
      run2PersistidoDpapi: {
        ok: resRun2.ok,
        origin: resRun2.verificacionInicial.origin,
        healthStatus: resRun2.verificacionInicial.healthResp.status,
      },
      portableV2: {
        ok: resPortable.ok,
        modo: resPortable.modo,
        servidorLocalIniciado: resPortable.servidorLocalIniciado,
        autenticadoUi: resPortable.resultadoLogin.autenticadoUi,
      },
      offlineBloqueado: {
        online: resOffline.estadoConexion.online,
        healthStatus: resOffline.verificacionInicial.healthResp.status,
        error: resOffline.verificacionInicial.healthResp.body.error,
      },
      reconectado: {
        online: resReconex.estadoConexion.online,
        autenticadoUi: resReconex.resultadoLogin.autenticadoUi,
      },
      reportesPostReinicio,
      evidenciasPng: [
        'storage/evidencias-electron-e2e/01-wizard-cliente.png',
        'storage/evidencias-electron-e2e/02-login-desktop.png',
        'storage/evidencias-electron-e2e/03-sesion-autenticada.png',
        'storage/evidencias-electron-e2e/04-offline-bloqueado.png',
        'storage/evidencias-electron-e2e/05-reconectado-login.png',
      ],
    }, null, 2));
  } finally {
    await detenerServidorBackend(srvChild);
    if (dbPool) await dbPool.end().catch(() => {});
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEMP_DB} WITH (FORCE)`).catch(() => {});
    await adminPool.end().catch(() => {});
    for (const dirTmp of [userDataDir, portableUserDataDir]) {
      try {
        fs.rmSync(dirTmp, { recursive: true, force: true, maxRetries: 6, retryDelay: 300 });
      } catch {}
    }
  }
}

main().catch((err) => {
  console.error('ERROR_VERIFICACION_ELECTRON_MULTIUSUARIO:', err);
  process.exit(1);
});
