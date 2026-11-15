import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CA_PATH = path.join(PROJECT_ROOT, 'storage', 'certs', 'cliente-lan', 'atlob-lan-ca.crt');
const LAN_CONFIG_PATH = path.join(PROJECT_ROOT, 'storage', 'certs', 'lan-config.json');
const STATE_PATH = path.join(PROJECT_ROOT, 'storage', 'instancia', 'estado-piloto-e2e.json');

interface HttpResult<T = any> {
  status: number;
  headers: http.IncomingHttpHeaders;
  rawBody: string;
  json: T | null;
}

interface CredencialPilotoTemporal {
  usuario: string;
  password: string;
  rol: 'ADMINISTRADOR' | 'CONTADOR_SENIOR' | 'ASISTENTE_CONTABLE' | 'AUDITOR_REVISOR';
}

interface EstadoPilotoE2E {
  baseDatosEsperada: string;
  httpsUrl: string;
  httpUrl: string;
  empresaId: string;
  ruc: string;
  razonSocial: string;
  periodoCodigo: string;
  periodoId: string;
  compraId: string;
  ventaId: string;
  asientoManualId: string;
  credenciales: Record<'admin' | 'contador' | 'asistente' | 'auditor', CredencialPilotoTemporal>;
  resumenReportes: {
    comprasTotalGeneral: number;
    comprasIgv: number;
    ventasTotalGeneral: number;
    ventasIgv: number;
    diarioTotalAsientos: number;
    diarioTotalDebe: number;
    diarioTotalHaber: number;
    mayorTotalSumasDebe: number;
    mayorTotalSumasHaber: number;
    balanceResultadoEjercicio: number;
    esfTotalActivo: number;
    esfTotalPasivoYPatrimonio: number;
    esfDiferenciaCuadre: number;
  };
  generadoEn: string;
}

function getArgValue(flag: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return fallback;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function resolverIpLanPrimaria(): string {
  try {
    if (fs.existsSync(LAN_CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(LAN_CONFIG_PATH, 'utf8'));
      if (typeof cfg?.ipPrincipal === 'string' && cfg.ipPrincipal.trim()) {
        return cfg.ipPrincipal.trim();
      }
      if (Array.isArray(cfg?.ips) && cfg.ips.length > 0) {
        return String(cfg.ips[0]);
      }
    }
  } catch {
    // Fallback abajo
  }
  return '192.168.1.34';
}

function derivarPilotoDbUrl(explicitDbUrl?: string): string {
  const raw = explicitDbUrl || process.env.PILOTO_DATABASE_URL || process.env.DATABASE_URL;
  if (!raw) {
    throw new Error('PILOTO_DB_URL_NO_CONFIGURADA: Defina DATABASE_URL en .env o pase --db-url.');
  }
  if (explicitDbUrl || process.env.PILOTO_DATABASE_URL) {
    return raw;
  }
  const url = new URL(raw);
  url.pathname = '/atlob_piloto';
  return url.toString();
}

function restringirPermisosNtfs(filePath: string): void {
  if (process.platform !== 'win32') return;
  const usuarioActual = process.env.USERNAME || 'jimmy';
  execFileSync(
    'icacls.exe',
    [filePath, '/inheritance:r', '/grant:r', '*S-1-5-18:(F)', '*S-1-5-32-544:(F)', `${usuarioActual}:(F)`],
    { stdio: 'ignore' }
  );
}

function generarPasswordTemporal(sufijoRol: string): string {
  const hex = crypto.randomBytes(6).toString('hex');
  return `Clave${sufijoRol}#2026!${hex}`;
}

async function httpRequest<T = any>(
  targetUrl: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    caPem?: Buffer;
    rejectUnauthorized?: boolean;
    timeoutMs?: number;
  } = {}
): Promise<HttpResult<T>> {
  const parsed = new URL(targetUrl);
  const isHttps = parsed.protocol === 'https:';
  const payload = options.body !== undefined ? JSON.stringify(options.body) : undefined;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };
  if (payload !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload, 'utf8').toString();
  }

  return new Promise((resolve, reject) => {
    const reqOptions: https.RequestOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : isHttps ? 443 : 80,
      path: `${parsed.pathname}${parsed.search}`,
      method: options.method || 'GET',
      headers,
      timeout: options.timeoutMs ?? 10000,
    };
    if (isHttps) {
      if (options.caPem) {
        reqOptions.ca = options.caPem;
      }
      reqOptions.rejectUnauthorized = options.rejectUnauthorized ?? true;
    }

    const transport = isHttps ? https : http;
    const req = transport.request(reqOptions, (res) => {
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
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          rawBody,
          json,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`TIMEOUT_HTTP_${options.timeoutMs ?? 10000}MS`));
    });
    req.on('error', reject);
    if (payload !== undefined) {
      req.write(payload);
    }
    req.end();
  });
}

function assert(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) {
    throw new Error(`VERIFICACION_FALLIDA: ${mensaje}`);
  }
}

async function loginUsuario(
  httpsUrl: string,
  caPem: Buffer,
  usuario: string,
  password: string
): Promise<{ accessToken: string; userId: string }> {
  const res = await httpRequest<any>(`${httpsUrl}/api/auth/login`, {
    method: 'POST',
    caPem,
    body: { usuario, password },
  });
  assert(
    res.status === 200 && res.json?.success && res.json?.data?.accessToken,
    `Login falló para ${usuario}: HTTP ${res.status} - ${res.rawBody}`
  );
  return {
    accessToken: res.json.data.accessToken,
    userId: res.json.data.usuario?.id,
  };
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
  throw new Error(`CUENTA_PCGE_NO_ENCONTRADA: Ninguna cuenta de registro para [${prefijos.join(', ')}]`);
}

async function validarReportesYCuadre(
  httpsUrl: string,
  caPem: Buffer,
  token: string,
  empresaId: string,
  periodoCodigo: string
) {
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'x-empresa-id': empresaId,
  };

  const rc = await httpRequest<any>(
    `${httpsUrl}/api/empresas/${empresaId}/registro-compras?periodo=${encodeURIComponent(periodoCodigo)}`,
    { headers: authHeaders, caPem }
  );
  assert(rc.status === 200 && rc.json?.success, `Registro de Compras falló: HTTP ${rc.status}`);
  const rcData = rc.json.data;
  assert(
    rcData?.cuadreLibroDiario?.estaCuadrado === true && Number(rcData?.cuadreLibroDiario?.diferencia ?? 99) === 0,
    `Registro de Compras descuadrado: ${JSON.stringify(rcData?.cuadreLibroDiario)}`
  );

  const rv = await httpRequest<any>(
    `${httpsUrl}/api/empresas/${empresaId}/registro-ventas?periodo=${encodeURIComponent(periodoCodigo)}`,
    { headers: authHeaders, caPem }
  );
  assert(rv.status === 200 && rv.json?.success, `Registro de Ventas falló: HTTP ${rv.status}`);
  const rvData = rv.json.data;
  assert(
    rvData?.cuadreLibroDiario?.estaCuadrado === true &&
      Number(rvData?.cuadreLibroDiario?.diferenciaBase ?? 99) === 0 &&
      Number(rvData?.cuadreLibroDiario?.diferenciaIgv ?? 99) === 0,
    `Registro de Ventas descuadrado: ${JSON.stringify(rvData?.cuadreLibroDiario)}`
  );

  const ld = await httpRequest<any>(
    `${httpsUrl}/api/empresas/${empresaId}/libro-diario?periodo=${encodeURIComponent(periodoCodigo)}`,
    { headers: authHeaders, caPem }
  );
  assert(ld.status === 200 && ld.json?.success, `Libro Diario falló: HTTP ${ld.status}`);
  const ldData = ld.json.data;
  assert(
    ldData?.estaBalanceado === true &&
      Number(ldData?.totalAsientos ?? 0) >= 3 &&
      Math.abs(Number(ldData?.totalDebe ?? 0) - Number(ldData?.totalHaber ?? 1)) === 0,
    `Libro Diario descuadrado: totalAsientos=${ldData?.totalAsientos}, debe=${ldData?.totalDebe}, haber=${ldData?.totalHaber}`
  );

  const lm = await httpRequest<any>(
    `${httpsUrl}/api/empresas/${empresaId}/libro-mayor?periodo=${encodeURIComponent(periodoCodigo)}`,
    { headers: authHeaders, caPem }
  );
  assert(lm.status === 200 && lm.json?.success, `Libro Mayor falló: HTTP ${lm.status}`);
  const lmData = lm.json.data;
  assert(
    lmData?.estaCuadrado === true &&
      Math.abs(Number(lmData?.totalSumasDebe ?? 0) - Number(lmData?.totalSumasHaber ?? 1)) === 0 &&
      Math.abs(Number(lmData?.totalSaldoDeudor ?? 0) - Number(lmData?.totalSaldoAcreedor ?? 1)) === 0,
    `Libro Mayor descuadrado: sumas ${lmData?.totalSumasDebe}/${lmData?.totalSumasHaber}`
  );

  const bc = await httpRequest<any>(
    `${httpsUrl}/api/empresas/${empresaId}/balance-comprobacion?periodo=${encodeURIComponent(periodoCodigo)}`,
    { headers: authHeaders, caPem }
  );
  assert(bc.status === 200 && bc.json?.success, `Balance de Comprobación falló: HTTP ${bc.status}`);
  const bcData = bc.json.data;
  assert(
    bcData?.cuadre?.todoCuadrado === true && bcData?.cuadre?.sumasCuadradas === true && bcData?.cuadre?.saldosCuadrados === true,
    `Balance de Comprobación descuadrado: ${JSON.stringify(bcData?.cuadre)}`
  );

  const esf = await httpRequest<any>(
    `${httpsUrl}/api/empresas/${empresaId}/estado-situacion-financiera?periodo=${encodeURIComponent(periodoCodigo)}`,
    { headers: authHeaders, caPem }
  );
  assert(esf.status === 200 && esf.json?.success, `ESF falló: HTTP ${esf.status}`);
  const esfData = esf.json.data;
  assert(
    esfData?.estaCuadrado === true && Number(esfData?.diferenciaCuadre ?? 99) === 0,
    `ESF descuadrado: dif=${esfData?.diferenciaCuadre}`
  );

  return {
    comprasTotalGeneral: Number(rcData.totales.totalGeneral),
    comprasIgv: Number(rcData.totales.totalIgv),
    ventasTotalGeneral: Number(rvData.totales.totalGeneral),
    ventasIgv: Number(rvData.totales.totalIgv),
    diarioTotalAsientos: Number(ldData.totalAsientos),
    diarioTotalDebe: Number(ldData.totalDebe),
    diarioTotalHaber: Number(ldData.totalHaber),
    mayorTotalSumasDebe: Number(lmData.totalSumasDebe),
    mayorTotalSumasHaber: Number(lmData.totalSumasHaber),
    balanceResultadoEjercicio: Number(bcData.cuadre.resultadoEjercicioBalance),
    esfTotalActivo: Number(esfData.totalActivo),
    esfTotalPasivoYPatrimonio: Number(esfData.totalPasivoYPatrimonio),
    esfDiferenciaCuadre: Number(esfData.diferenciaCuadre),
  };
}

async function verificarConectividadBasica(httpUrl: string, httpsUrl: string, lanIp: string, caPem: Buffer) {
  const httpLocal = await httpRequest<any>(`${httpUrl}/api/health`);
  assert(
    httpLocal.status === 200 &&
      httpLocal.json?.status === 'UP' &&
      httpLocal.json?.database === 'POSTGRESQL_CONNECTED',
    `Health HTTP local inválido: HTTP ${httpLocal.status} - ${httpLocal.rawBody}`
  );

  // Confirmar que puerto 3000 NO escucha en la IP LAN
  const parsedHttp = new URL(httpUrl);
  const httpPort = parsedHttp.port || '3000';
  let httpLanBloqueado = false;
  try {
    await httpRequest(`http://${lanIp}:${httpPort}/api/health`, { timeoutMs: 2500 });
  } catch (err: any) {
    if (err?.code === 'ECONNREFUSED' || err?.code === 'ETIMEDOUT' || String(err?.message).includes('TIMEOUT')) {
      httpLanBloqueado = true;
    } else {
      throw err;
    }
  }
  assert(httpLanBloqueado, `Peligro: http://${lanIp}:${httpPort} aceptó conexión en LAN cuando debía limitarse a 127.0.0.1`);

  // Confirmar que HTTPS LAN falla sin CA confiable (TLS real, sin bypass)
  let tlsSinCaRechazado = false;
  try {
    await httpRequest(`${httpsUrl}/api/health`, { rejectUnauthorized: true, timeoutMs: 3000 });
  } catch {
    tlsSinCaRechazado = true;
  }
  assert(tlsSinCaRechazado, 'HTTPS LAN debería requerir la CA local privada para validarse');

  const httpsLan = await httpRequest<any>(`${httpsUrl}/api/health`, { caPem, rejectUnauthorized: true });
  assert(
    httpsLan.status === 200 &&
      httpsLan.json?.status === 'UP' &&
      httpsLan.json?.database === 'POSTGRESQL_CONNECTED',
    `Health HTTPS LAN falló: HTTP ${httpsLan.status} - ${httpsLan.rawBody}`
  );

  const spaHtml = await httpRequest<any>(`${httpsUrl}/`, {
    caPem,
    rejectUnauthorized: true,
    headers: { Accept: 'text/html' },
  });
  let assetPrincipal = 'desktop-bundled';
  if (spaHtml.status === 403 && spaHtml.json?.error === 'MODO_ESCRITORIO_EXCLUSIVO') {
    // Modo servidor exclusivo de escritorio: no expone interfaz web en navegadores.
  } else {
    assert(spaHtml.status === 200 && /<!doctype html>/i.test(spaHtml.rawBody), `SPA HTML inválido en ${httpsUrl}/`);
    const scriptMatch = spaHtml.rawBody.match(/src=["'](\/assets\/[^"']+\.js)["']/i);
    assert(scriptMatch && scriptMatch[1], 'No se encontró bundle JS de frontend en dist/index.html');
    const assetRes = await httpRequest<any>(`${httpsUrl}${scriptMatch[1]}`, {
      caPem,
      rejectUnauthorized: true,
      headers: { Accept: '*/*' },
    });
    assert(assetRes.status === 200 && assetRes.rawBody.length > 100, `Asset frontend ${scriptMatch[1]} devolvió HTTP ${assetRes.status}`);
    assetPrincipal = scriptMatch[1];
  }

  return {
    httpLocal: httpLocal.status,
    httpLanBloqueado,
    tlsSinCaRechazado,
    httpsLan: httpsLan.status,
    assetPrincipal,
  };
}

async function ejecutarSoloVerificarPersistencia(caPem: Buffer) {
  assert(fs.existsSync(STATE_PATH), `No existe archivo de estado previo: ${STATE_PATH}`);
  const estado = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as EstadoPilotoE2E;

  const conectividad = await verificarConectividadBasica(
    estado.httpUrl,
    estado.httpsUrl,
    new URL(estado.httpsUrl).hostname,
    caPem
  );

  const sesionContador = await loginUsuario(
    estado.httpsUrl,
    caPem,
    estado.credenciales.contador.usuario,
    estado.credenciales.contador.password
  );

  const empresasRes = await httpRequest<any>(`${estado.httpsUrl}/api/empresas`, {
    caPem,
    headers: { Authorization: `Bearer ${sesionContador.accessToken}` },
  });
  assert(empresasRes.status === 200 && empresasRes.json?.success, 'Fallo listando empresas tras reinicio');
  const empEncontrada = (empresasRes.json.data || []).find((e: any) => e.id === estado.empresaId && e.ruc === estado.ruc);
  assert(empEncontrada, `Empresa piloto ${estado.ruc} (${estado.empresaId}) no persistió tras reinicio`);

  const reportesTrasReinicio = await validarReportesYCuadre(
    estado.httpsUrl,
    caPem,
    sesionContador.accessToken,
    estado.empresaId,
    estado.periodoCodigo
  );

  assert(
    reportesTrasReinicio.diarioTotalAsientos === estado.resumenReportes.diarioTotalAsientos &&
      reportesTrasReinicio.diarioTotalDebe === estado.resumenReportes.diarioTotalDebe &&
      reportesTrasReinicio.esfTotalActivo === estado.resumenReportes.esfTotalActivo &&
      reportesTrasReinicio.esfDiferenciaCuadre === 0,
    'Los totales contables tras reinicio difieren respecto al estado previo al reinicio'
  );

  console.log(
    JSON.stringify(
      {
        modo: 'solo-verificar-persistencia',
        ok: true,
        conectividad,
        empresaId: estado.empresaId,
        ruc: estado.ruc,
        reportesTrasReinicio,
      },
      null,
      2
    )
  );
}

async function ejecutarFlujoCompleto(
  httpUrl: string,
  httpsUrl: string,
  lanIp: string,
  caPem: Buffer,
  pilotoDbUrl: string
) {
  const pool = new Pool({ connectionString: pilotoDbUrl });
  try {
    const dbCheck = await pool.query<{ db: string }>('SELECT current_database() AS db');
    const currentDb = dbCheck.rows[0]?.db;
    assert(
      currentDb === 'atlob_piloto',
      `SEGURIDAD_DB: Se esperaba atlob_piloto pero se conectó a "${currentDb}". Abortado para proteger producción.`
    );

    const conectividad = await verificarConectividadBasica(httpUrl, httpsUrl, lanIp, caPem);

    const estadoSetup = await httpRequest<any>(`${httpsUrl}/api/setup/status`, { caPem });
    assert(estadoSetup.status === 200, `GET /api/setup/status devolvió HTTP ${estadoSetup.status}`);
    const yaConfiguradoEnServidor = Boolean(
      estadoSetup.json?.data?.configurado ?? estadoSetup.json?.configurado
    );

    const usuariosPrevios = await pool.query<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM usuarios_estudio');
    const existeUsuarioEnPiloto = (usuariosPrevios.rows[0]?.cnt ?? 0) > 0;
    const servidorApuntaAPiloto = yaConfiguradoEnServidor === existeUsuarioEnPiloto;
    assert(
      servidorApuntaAPiloto,
      `El servidor vivo NO coincide con el estado de atlob_piloto (configurado=${yaConfiguradoEnServidor}, usuariosEnPiloto=${usuariosPrevios.rows[0]?.cnt}). Detenga y relance contra atlob_piloto.`
    );

    const sufijo = crypto.randomBytes(2).toString('hex');
    const creds: Record<'admin' | 'contador' | 'asistente' | 'auditor', CredencialPilotoTemporal> = {
      admin: {
        usuario: `admin_piloto_${sufijo}`,
        password: generarPasswordTemporal('A1x'),
        rol: 'ADMINISTRADOR',
      },
      contador: {
        usuario: `contador_piloto_${sufijo}`,
        password: generarPasswordTemporal('C2y'),
        rol: 'CONTADOR_SENIOR',
      },
      asistente: {
        usuario: `asistente_piloto_${sufijo}`,
        password: generarPasswordTemporal('S3z'),
        rol: 'ASISTENTE_CONTABLE',
      },
      auditor: {
        usuario: `auditor_piloto_${sufijo}`,
        password: generarPasswordTemporal('D4w'),
        rol: 'AUDITOR_REVISOR',
      },
    };

    if (!yaConfiguradoEnServidor) {
      const initRes = await httpRequest<any>(`${httpsUrl}/api/setup/inicializar`, {
        method: 'POST',
        caPem,
        body: {
          nombreEstudio: 'ESTUDIO PILOTO VERIFICACION LAN S.A.C.',
          adminNombre: 'Administrador Piloto E2E',
          usuario: creds.admin.usuario,
          adminPassword: creds.admin.password,
          adminPasswordConfirm: creds.admin.password,
          mfaRequerido: false,
        },
      });
      assert(initRes.status === 201 && initRes.json?.success, `setup/inicializar falló: HTTP ${initRes.status} - ${initRes.rawBody}`);
    } else {
      throw new Error(
        'ATOB_PILOTO_NO_VIRGEN: atlob_piloto ya estaba inicializada. Reinicie atlob_piloto limpia o use --solo-verificar-persistencia.'
      );
    }

    // Probar que el admin creado quedó exactamente en atlob_piloto (confirmación física de aislamiento DB)
    const adminEnPiloto = await pool.query<{ id: string }>(
      'SELECT id FROM usuarios_estudio WHERE LOWER(email) = LOWER($1)',
      [creds.admin.usuario]
    );
    assert(
      adminEnPiloto.rows.length === 1,
      'SEGURIDAD_AISLAMIENTO: El administrador creado vía API no apareció en atlob_piloto.'
    );

    const sesionAdmin = await loginUsuario(httpsUrl, caPem, creds.admin.usuario, creds.admin.password);

    const rucFicticio = '20608889991';
    const empRes = await httpRequest<any>(`${httpsUrl}/api/empresas`, {
      method: 'POST',
      caPem,
      headers: { Authorization: `Bearer ${sesionAdmin.accessToken}` },
      body: {
        codigoEmpresa: `PIL${sufijo.toUpperCase()}`,
        ruc: rucFicticio,
        razonSocial: 'COMERCIAL PILOTO CENTRALIZADO S.A.C.',
        regimenTributario: 'MYPE_TRIBUTARIO',
        domicilioFiscal: 'AV. CENTRAL 450, LIMA',
        ejercicio: 2026,
        metodoInventario: 'PERMANENTE',
        monedaPrincipal: 'PEN',
      },
    });
    assert(empRes.status === 201 && empRes.json?.data?.id, `POST /api/empresas falló: HTTP ${empRes.status} - ${empRes.rawBody}`);
    const empresaId = String(empRes.json.data.id);

    // Ampliar cupo SOLO en atlob_piloto para validar los 4 roles definidos en el RBAC
    await pool.query("UPDATE licencia SET max_usuarios = GREATEST(max_usuarios, 4) WHERE current_database() = 'atlob_piloto'");

    for (const key of ['contador', 'asistente', 'auditor'] as const) {
      const c = creds[key];
      const uRes = await httpRequest<any>(`${httpsUrl}/api/usuarios`, {
        method: 'POST',
        caPem,
        headers: { Authorization: `Bearer ${sesionAdmin.accessToken}` },
        body: {
          nombre: `Usuario ${c.rol}`,
          usuario: c.usuario,
          password: c.password,
          rolGlobal: c.rol,
          empresaIds: [empresaId],
        },
      });
      assert(uRes.status === 201 && uRes.json?.success, `Creación de ${c.rol} falló: HTTP ${uRes.status} - ${uRes.rawBody}`);
    }

    const sesionContador = await loginUsuario(httpsUrl, caPem, creds.contador.usuario, creds.contador.password);
    const sesionAsistente = await loginUsuario(httpsUrl, caPem, creds.asistente.usuario, creds.asistente.password);
    const sesionAuditor = await loginUsuario(httpsUrl, caPem, creds.auditor.usuario, creds.auditor.password);

    const authAsistente = { Authorization: `Bearer ${sesionAsistente.accessToken}`, 'x-empresa-id': empresaId };
    const authContador = { Authorization: `Bearer ${sesionContador.accessToken}`, 'x-empresa-id': empresaId };
    const authAuditor = { Authorization: `Bearer ${sesionAuditor.accessToken}`, 'x-empresa-id': empresaId };

    const periodosRes = await httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/periodos?anio=2026`, {
      caPem,
      headers: authAsistente,
    });
    assert(periodosRes.status === 200 && Array.isArray(periodosRes.json?.data), `GET /periodos falló: HTTP ${periodosRes.status}`);
    const periodoCodigo = '2026-09';
    const periodoObj = periodosRes.json.data.find((p: any) => p.codigoPeriodo === periodoCodigo || p.codigo === periodoCodigo);
    assert(periodoObj?.id, `No se encontró período ${periodoCodigo}`);
    const periodoId = String(periodoObj.id);

    const subRes = await httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/subdiarios`, {
      caPem,
      headers: authAsistente,
    });
    assert(subRes.status === 200 && Array.isArray(subRes.json?.data), `GET /subdiarios falló: HTTP ${subRes.status}`);
    const subDiario =
      subRes.json.data.find((s: any) => s.codigo === '05') ||
      subRes.json.data.find((s: any) => s.codigo === '06') ||
      subRes.json.data.find((s: any) => s.permiteAsientoManual !== false);
    assert(subDiario?.id, 'No se encontró subdiario disponible para asiento manual');

    const pcgeRes = await httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/plan-cuentas`, {
      caPem,
      headers: authAsistente,
    });
    assert(pcgeRes.status === 200 && Array.isArray(pcgeRes.json?.cuentas), `GET /plan-cuentas falló: HTTP ${pcgeRes.status}`);
    const cuentaBanco = seleccionarCuentaRegistro(pcgeRes.json.cuentas, ['10411', '1041', '1011', '101']);
    const cuentaCapital = seleccionarCuentaRegistro(pcgeRes.json.cuentas, ['50111', '5011', '501']);

    // Anexos proveedor y cliente
    const provRes = await httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/anexos`, {
      method: 'POST',
      caPem,
      headers: authAsistente,
      body: {
        tipoDocumento: '6',
        numeroDocumento: '20100070970',
        razonSocial: 'PROVEEDOR PRUEBA PILOTO S.A.',
        direccion: 'JR. PROVEEDORES 123, LIMA',
        tipoEntidad: 'PROVEEDOR',
      },
    });
    assert(provRes.status === 201 && provRes.json?.data?.id, `POST /anexos proveedor falló: HTTP ${provRes.status} - ${provRes.rawBody}`);
    const proveedorId = String(provRes.json.data.id);

    const cliRes = await httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/anexos`, {
      method: 'POST',
      caPem,
      headers: authAsistente,
      body: {
        tipoDocumento: '6',
        numeroDocumento: '20504914434',
        razonSocial: 'CLIENTE PRUEBA PILOTO S.A.C.',
        direccion: 'AV. CLIENTES 456, LIMA',
        tipoEntidad: 'CLIENTE',
      },
    });
    assert(cliRes.status === 201 && cliRes.json?.data?.id, `POST /anexos cliente falló: HTTP ${cliRes.status} - ${cliRes.rawBody}`);
    const clienteId = String(cliRes.json.data.id);

    // 1. Compra con ASISTENTE_CONTABLE
    const compraRes = await httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/compras`, {
      method: 'POST',
      caPem,
      headers: authAsistente,
      body: {
        periodoId,
        fechaEmision: '2026-09-10',
        fechaContable: '2026-09-10',
        tipoComprobante: '01',
        serie: 'F001',
        numero: '0000101',
        proveedorId,
        moneda: 'PEN',
        tipoCambio: 1,
        baseGravada: 1000,
        igv: 180,
        total: 1180,
        tipoAdquisicion: '1',
        formaPago: 'CONTADO',
        estado: 'REGISTRADO',
      },
    });
    assert(compraRes.status === 201 && compraRes.json?.data?.id, `POST /compras falló: HTTP ${compraRes.status} - ${compraRes.rawBody}`);
    const compraId = String(compraRes.json.data.id);

    // 2. Venta con CONTADOR_SENIOR
    const ventaRes = await httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/ventas`, {
      method: 'POST',
      caPem,
      headers: authContador,
      body: {
        periodoId,
        fechaEmision: '2026-09-12',
        fechaContable: '2026-09-12',
        tipoComprobante: '01',
        serie: 'F001',
        numero: '0000201',
        clienteId,
        moneda: 'PEN',
        tipoCambio: 1,
        baseGravada: 2000,
        igv: 360,
        total: 2360,
        tipoOperacion: 'VENTA_INTERNA',
        formaPago: 'CONTADO',
        estado: 'REGISTRADO',
      },
    });
    assert(ventaRes.status === 201 && ventaRes.json?.data?.id, `POST /ventas falló: HTTP ${ventaRes.status} - ${ventaRes.rawBody}`);
    const ventaId = String(ventaRes.json.data.id);

    // 3. Asiento manual creado por ASISTENTE_CONTABLE y contabilizado por CONTADOR_SENIOR (segregación real)
    const asientoRes = await httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/asientos`, {
      method: 'POST',
      caPem,
      headers: authAsistente,
      body: {
        periodoId,
        subdiarioId: subDiario.id,
        fecha: '2026-09-05',
        glosa: 'Aporte de capital piloto LAN en cuenta corriente',
        moneda: 'PEN',
        tipoCambio: 1,
        origen: 'MANUAL',
        detalles: [
          { linea: 1, cuentaId: cuentaBanco.id, debe: 5000, haber: 0 },
          { linea: 2, cuentaId: cuentaCapital.id, debe: 0, haber: 5000 },
        ],
      },
    });
    assert(asientoRes.status === 201 && asientoRes.json?.data?.id, `POST /asientos falló: HTTP ${asientoRes.status} - ${asientoRes.rawBody}`);
    const asientoManualId = String(asientoRes.json.data.id);

    // RBAC negativo: AUDITOR_REVISOR no puede crear asientos (403)
    const auditorWriteRes = await httpRequest<any>(`${httpsUrl}/api/empresas/${empresaId}/asientos`, {
      method: 'POST',
      caPem,
      headers: authAuditor,
      body: {
        periodoId,
        subdiarioId: subDiario.id,
        fecha: '2026-09-05',
        glosa: 'Intento bloqueado para auditor revisor',
        moneda: 'PEN',
        tipoCambio: 1,
        origen: 'MANUAL',
        detalles: [
          { linea: 1, cuentaId: cuentaBanco.id, debe: 100, haber: 0 },
          { linea: 2, cuentaId: cuentaCapital.id, debe: 0, haber: 100 },
        ],
      },
    });
    assert(
      auditorWriteRes.status === 403,
      `AUDITOR_REVISOR debió recibir 403 al intentar crear asiento, recibió HTTP ${auditorWriteRes.status}`
    );

    // RBAC / Segregación: ASISTENTE_CONTABLE no puede contabilizar
    const asistenteContabRes = await httpRequest<any>(`${httpsUrl}/api/asientos/${asientoManualId}/contabilizar`, {
      method: 'POST',
      caPem,
      headers: authAsistente,
      body: {},
    });
    assert(
      asistenteContabRes.status === 403,
      `ASISTENTE_CONTABLE debió recibir 403 al contabilizar, recibió HTTP ${asistenteContabRes.status}`
    );

    // Contabilización aprobada por CONTADOR_SENIOR distinto del creador
    const contabRes = await httpRequest<any>(`${httpsUrl}/api/asientos/${asientoManualId}/contabilizar`, {
      method: 'POST',
      caPem,
      headers: authContador,
      body: {},
    });
    assert(
      contabRes.status === 200 && contabRes.json?.success,
      `Contabilización por CONTADOR_SENIOR falló: HTTP ${contabRes.status} - ${contabRes.rawBody}`
    );

    // Auditor puede consultar reportes de solo lectura
    const resumenReportes = await validarReportesYCuadre(
      httpsUrl,
      caPem,
      sesionAuditor.accessToken,
      empresaId,
      periodoCodigo
    );

    const estadoGuardar: EstadoPilotoE2E = {
      baseDatosEsperada: currentDb,
      httpsUrl,
      httpUrl,
      empresaId,
      ruc: rucFicticio,
      razonSocial: 'COMERCIAL PILOTO CENTRALIZADO S.A.C.',
      periodoCodigo,
      periodoId,
      compraId,
      ventaId,
      asientoManualId,
      credenciales: creds,
      resumenReportes,
      generadoEn: new Date().toISOString(),
    };

    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(estadoGuardar, null, 2), 'utf8');
    restringirPermisosNtfs(STATE_PATH);

    console.log(
      JSON.stringify(
        {
          modo: 'completo',
          ok: true,
          baseDatos: currentDb,
          conectividad,
          empresa: { id: empresaId, ruc: rucFicticio },
          segregacionYRoles: {
            auditorBloqueadoEscritura403: auditorWriteRes.status,
            asistenteBloqueadoContabilizar403: asistenteContabRes.status,
            contadorContabilizo200: contabRes.status,
          },
          resumenReportes,
          estadoGuardadoEn: path.relative(PROJECT_ROOT, STATE_PATH),
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

async function main() {
  const lanIp = resolverIpLanPrimaria();
  const httpsUrl = getArgValue('--https-url', `https://${lanIp}:3443`)!;
  const httpUrl = getArgValue('--http-url', 'http://127.0.0.1:3000')!;
  const caPath = path.resolve(PROJECT_ROOT, getArgValue('--ca', DEFAULT_CA_PATH)!);
  assert(fs.existsSync(caPath), `No existe certificado CA público en ${caPath}`);
  const caPem = fs.readFileSync(caPath);

  if (hasFlag('--solo-verificar-persistencia')) {
    await verificarConectividadBasica(httpUrl, httpsUrl, new URL(httpsUrl).hostname, caPem);
    await ejecutarSoloVerificarPersistencia(caPem);
    return;
  }

  const pilotoDbUrl = derivarPilotoDbUrl(getArgValue('--db-url'));
  await ejecutarFlujoCompleto(httpUrl, httpsUrl, lanIp, caPem, pilotoDbUrl);
}

main().catch((err) => {
  console.error('[verificar-operacion-piloto-pc] ERROR:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
