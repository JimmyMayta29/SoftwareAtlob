const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, protocol, safeStorage, session, utilityProcess } = require('electron');
const { createHash } = require('node:crypto');
const { existsSync, readFileSync, statSync } = require('node:fs');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const http = require('node:http');
const https = require('node:https');
const { dirname, extname, join, resolve, sep } = require('node:path');
const tls = require('node:tls');
const { fileURLToPath } = require('node:url');
const { setTimeout: esperar } = require('node:timers/promises');
const {
  construirUrl,
  guardarConfiguracion,
  leerConfiguracion,
  nuevosSecretos,
  validarCertificadoCaPem,
  validarConexion,
  validarServidorRemoto,
} = require('./desktop-config.cjs');

if (process.platform === 'win32') {
  app.setAppUserModelId('pe.atlob.erp');
}

if (process.env.ATLOB_USER_DATA_DIR) {
  app.setPath('userData', process.env.ATLOB_USER_DATA_DIR);
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'atlob',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const APP_ORIGIN = 'atlob://app';
const DIST_ROOT = resolve(join(__dirname, 'generated', 'dist'));
const CSP_APLICACION = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

const diagnosticos = new Map(Object.entries({
  PROTOCOLO_HTTPS_REQUERIDO: {
    titulo: 'Se requiere conexión segura HTTPS',
    causa: 'La dirección ingresada utiliza HTTP sin cifrado o un protocolo distinto a HTTPS.',
    accion: 'Escriba una dirección que comience con https://, por ejemplo https://192.168.1.34:3443.',
  },
  SERVIDOR_URL_INVALIDA: {
    titulo: 'Dirección del servidor principal no válida',
    causa: 'El formato de la dirección HTTPS es incorrecto o incluye rutas o credenciales en la URL.',
    accion: 'Ingrese únicamente el protocolo, IP o nombre LAN y puerto, por ejemplo https://192.168.1.34:3443.',
  },
  HOST_NO_PRIVADO: {
    titulo: 'Solo se permiten direcciones de red privada LAN',
    causa: 'Por seguridad contable, ATLOB ERP Escritorio no se conecta por red pública desde el cliente LAN.',
    accion: 'Utilice la IP privada de la PC principal (por ejemplo 192.168.1.34) o su nombre local.',
  },
  CERTIFICADO_CA_INVALIDO: {
    titulo: 'Certificado CA inválido o inadecuado',
    causa: 'El archivo seleccionado no es un certificado X.509 PEM público válido o contiene una clave privada.',
    accion: 'Seleccione únicamente el archivo público atlob-lan-ca.crt generado en la carpeta cliente-lan del servidor.',
  },
  CERT_TLS_ERROR: {
    titulo: 'Certificado TLS del servidor no verificado',
    causa: 'La validación HTTPS estricta rechazó el certificado porque falta el certificado CA atlob-lan-ca.crt o la IP actual no coincide con el certificado.',
    accion: 'Elija el archivo atlob-lan-ca.crt entregado por la PC principal y compruebe que la IP coincida.',
  },
  BACKEND_ECONNREFUSED: {
    titulo: 'Servidor principal ATLOB ERP no disponible',
    causa: 'El servicio backend en la PC principal está detenido o el Firewall de Windows bloquea el puerto TCP 3443.',
    accion: 'Inicie el servidor central en la PC principal y confirme la regla de Firewall Privado en el puerto 3443.',
  },
  BACKEND_TIMEOUT: {
    titulo: 'El servidor principal tardó demasiado en responder',
    causa: 'No se recibió respuesta HTTPS dentro del tiempo esperado desde la red local.',
    accion: 'Verifique que ambas PC estén en la misma red privada y que el servidor central esté encendido.',
  },
  BACKEND_POSTGRES_CAIDO: {
    titulo: 'Servidor alcanzado, pero PostgreSQL central no está conectado',
    causa: 'El backend HTTPS respondió, pero reportó que la base de datos PostgreSQL central está desconectada.',
    accion: 'Compruebe en la PC principal que el servicio PostgreSQL 18 esté iniciado.',
  },
  '28P01': {
    titulo: 'Usuario o contraseña rechazados por PostgreSQL',
    causa: 'La contraseña ingresada no coincide con la clave del usuario en PostgreSQL o el usuario escrito es distinto.',
    accion: 'Verifique el usuario (por defecto contabilidad_app), vuelva a escribir su contraseña sin espacios adicionales y pulse Conectar y continuar.',
  },
  '28000': {
    titulo: 'Autenticación local rechazada por PostgreSQL',
    causa: 'El usuario existe, pero PostgreSQL no autorizó su acceso desde este equipo.',
    accion: 'Verifique que el usuario tenga permiso LOGIN y que pg_hba.conf permita conexiones locales con contraseña en localhost / 127.0.0.1.',
  },
  '3D000': {
    titulo: 'La base de datos indicada no existe',
    causa: 'El motor PostgreSQL respondió correctamente, pero no encontró una base con ese nombre.',
    accion: 'Revise la ortografía del nombre de la base de datos o créela primero en PostgreSQL asignándola al usuario de la aplicación.',
  },
  '42501': {
    titulo: 'Permisos insuficientes en la base de datos',
    causa: 'El usuario de PostgreSQL no cuenta con privilegios para usar o preparar las tablas de esta base.',
    accion: 'Otorgue permisos CONNECT y CREATE sobre la base y el esquema public al rol contabilidad_app e inténtelo nuevamente.',
  },
  '57P03': {
    titulo: 'PostgreSQL todavía se está iniciando',
    causa: 'El servicio de base de datos acaba de arrancar y aún está recuperando su estado interno.',
    accion: 'Espere entre 5 y 10 segundos y pulse el botón Reintentar.',
  },
  PG_ROLE_UNSAFE: {
    titulo: 'El usuario ingresado tiene privilegios de superusuario',
    causa: 'Por seguridad contable, ATLOB ERP no opera con el superusuario postgres ni con roles que omitan el aislamiento de datos (BYPASSRLS).',
    accion: 'Conéctese utilizando un rol de aplicación estándar (por ejemplo, contabilidad_app) sin permisos de superusuario.',
  },
  ECONNREFUSED: {
    titulo: 'No se pudo conectar con el servicio PostgreSQL',
    causa: 'El servicio de PostgreSQL está detenido en Windows o está configurado en un puerto distinto a 5432.',
    accion: 'Abra Servicios de Windows (services.msc), inicie el servicio "postgresql-x64-18" (o la versión instalada), confirme el puerto 5432 y vuelva a intentar.',
  },
  ETIMEDOUT: {
    titulo: 'PostgreSQL tardó demasiado en responder',
    causa: 'El puerto indicado no responde o un cortafuegos local está bloqueando la comunicación.',
    accion: 'Confirme que el servidor sea localhost y el puerto sea 5432, y revise que el servicio PostgreSQL esté en ejecución.',
  },
  ENOTFOUND: {
    titulo: 'No se encontró el nombre del servidor',
    causa: 'El nombre escrito no pudo resolverse en la red.',
    accion: 'Verifique la dirección IP privada o nombre del servidor e inténtelo nuevamente.',
  },
  EAI_AGAIN: {
    titulo: 'Fallo temporal al resolver el servidor',
    causa: 'Windows no pudo resolver momentáneamente el nombre indicado.',
    accion: 'Utilice directamente la IP LAN privada (por ejemplo 192.168.1.34) y vuelva a intentar.',
  },
  MIGRATIONS_PENDING: {
    titulo: 'La base de datos requiere preparar su estructura',
    causa: 'La base seleccionada está vacía o le faltan tablas de esta versión de ATLOB ERP.',
    accion: 'Marque la casilla "Autorizo preparar automáticamente las tablas e índices en esta base de datos" y pulse Conectar y continuar.',
  },
  MIGRATIONS_INVALID: {
    titulo: 'Versión de base de datos incompatible',
    causa: 'El historial de migraciones de esta base no coincide con los archivos de esta versión del programa.',
    accion: 'Utilice una base de datos limpia para esta versión o actualice el instalador de ATLOB ERP.',
  },
  HOST_NO_LOCAL: {
    titulo: 'Solo se permiten conexiones locales en modo PostgreSQL independiente',
    causa: 'Para conectarse a la PC principal por red utilice la pestaña "Servidor principal (HTTPS LAN)".',
    accion: 'Cambie a "Servidor principal (HTTPS LAN)" o use localhost en el campo Servidor local.',
  },
  PUERTO_INVALIDO: {
    titulo: 'Número de puerto no válido',
    causa: 'El puerto debe ser un número entero entre 1 y 65535.',
    accion: 'Ingrese el puerto HTTPS (por defecto 3443) o el puerto PostgreSQL local (5432).',
  },
  CONEXION_INVALIDA: {
    titulo: 'Datos de base o usuario incompletos',
    causa: 'Falta el nombre de la base de datos o el nombre del usuario de PostgreSQL, o contienen caracteres no válidos.',
    accion: 'Complete los campos Base de datos y Usuario de la aplicación antes de continuar.',
  },
  CONTRASENA_REQUERIDA: {
    titulo: 'Falta la contraseña de PostgreSQL',
    causa: 'No se ingresó la contraseña del usuario de la base de datos.',
    accion: 'Escriba la contraseña correspondiente al usuario indicado y pulse Conectar y continuar.',
  },
  DPAPI_NO_DISPONIBLE: {
    titulo: 'Cifrado de credenciales de Windows no disponible',
    causa: 'El subsistema de protección de datos del perfil de Windows (DPAPI) no está activo en esta sesión.',
    accion: 'Cierre y vuelva a abrir ATLOB ERP desde su sesión normal de usuario en Windows.',
  },
  CONFIGURACION_NO_LEGIBLE: {
    titulo: 'No se pudo abrir la configuración guardada anteriormente',
    causa: 'El archivo cifrado fue creado desde otro perfil de Windows o está dañado.',
    accion: 'Inicie sesión con el usuario de Windows original o vuelva a configurar la conexión desde el asistente.',
  },
  CONFIGURACION_NO_GUARDADA: {
    titulo: 'No se pudo guardar la configuración local',
    causa: 'Windows impidió escribir el archivo cifrado en la carpeta de datos de su usuario.',
    accion: 'Verifique que su cuenta tenga permiso de escritura en %APPDATA% y que haya espacio libre en disco.',
  },
  SERVIDOR_TIMEOUT: {
    titulo: 'El servidor interno demoró demasiado en iniciar',
    causa: 'PostgreSQL o el equipo tardaron más de lo esperado durante la preparación inicial.',
    accion: 'Compruebe que PostgreSQL esté activo y pulse Conectar y continuar nuevamente.',
  },
  SERVIDOR_CERRADO: {
    titulo: 'El servicio interno se detuvo inesperadamente',
    causa: 'Se interrumpió la comunicación con PostgreSQL mientras iniciaba la aplicación.',
    accion: 'Verifique que el servicio PostgreSQL siga en ejecución y vuelva a intentar.',
  },
}));

const configHtml = join(__dirname, 'config.html');
const configRuta = process.platform === 'win32' ? configHtml.toLowerCase() : configHtml;

function esUrlConfiguracion(url) {
  try {
    const destino = new URL(url);
    if (destino.protocol !== 'file:' || destino.search || destino.hash) return false;
    const ruta = fileURLToPath(destino);
    return (process.platform === 'win32' ? ruta.toLowerCase() : ruta) === configRuta;
  } catch {
    return false;
  }
}

function esUrlAplicacion(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'atlob:' && parsed.hostname === 'app' && !parsed.port && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

let ventanaConfig;
let ventanaPrincipal;
let servidor;
let origenLocal = '';
let destinoCliente = null;
let activoModo = 'cliente';
let guardada;
let bloqueo;
let mensaje;
let diagnostico;
let iniciando = false;
let cerrando = false;
let listoParaCerrar = false;
let protocoloRegistrado = false;
let monitorTimer = null;

let estadoConexion = {
  modo: 'cliente',
  online: false,
  servidorUrl: '',
  host: '',
  puerto: '',
  huellaCa: null,
  ultimoChequeo: null,
  ultimoError: null,
  baseDatos: null,
};

const diagnosticoGenerico = {
  titulo: 'No se pudo establecer comunicación con ATLOB ERP',
  causa: 'El servidor central HTTPS o PostgreSQL no respondió según lo esperado.',
  accion: 'Verifique que el servidor principal esté activo, revise la dirección HTTPS y la red local e inténtelo nuevamente.',
};

function clasificarErrorRedOTls(err) {
  const code = String(err?.code || err?.message || '');
  if (/CERT|TLS|SSL|ALTNAME|SELF_SIGNED|LEAF_SIGNATURE/i.test(code)) return 'CERT_TLS_ERROR';
  if (code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return 'BACKEND_ECONNREFUSED';
  if (code === 'ETIMEDOUT' || code === 'ABORT_ERR' || code === 'TimeoutError' || code === 'BACKEND_TIMEOUT') return 'BACKEND_TIMEOUT';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'BACKEND_POSTGRES_CAIDO') return code;
  if (diagnosticos.has(code)) return code;
  return 'BACKEND_ECONNREFUSED';
}

function estadoPublicoConexion() {
  return { ...estadoConexion };
}

function emitirCambioEstadoConexion() {
  if (ventanaPrincipal && !ventanaPrincipal.isDestroyed()) {
    ventanaPrincipal.webContents.send('desktop:cambio-estado-conexion', estadoPublicoConexion());
  }
}

function actualizarEstadoConexion(parcial) {
  const siguiente = { ...estadoConexion, ...parcial };
  const cambio =
    siguiente.online !== estadoConexion.online ||
    siguiente.modo !== estadoConexion.modo ||
    siguiente.servidorUrl !== estadoConexion.servidorUrl ||
    siguiente.ultimoError !== estadoConexion.ultimoError;
  estadoConexion = siguiente;
  if (cambio) emitirCambioEstadoConexion();
}

function detectarCertificadoCaLocal() {
  const raices = [process.env.PORTABLE_EXECUTABLE_DIR, dirname(process.execPath), process.cwd()].filter(Boolean);
  const candidatos = [];
  for (const r of raices) {
    candidatos.push(join(r, 'atlob-lan-ca.crt'));
    candidatos.push(join(r, 'storage', 'certs', 'cliente-lan', 'atlob-lan-ca.crt'));
    candidatos.push(join(r, 'storage', 'certs', 'atlob-lan-ca.crt'));
  }
  for (const ruta of candidatos) {
    try {
      if (!existsSync(ruta) || !statSync(ruta).isFile()) continue;
      const pem = readFileSync(ruta, 'utf8');
      const info = validarCertificadoCaPem(pem);
      if (info.caPem) {
        return {
          servidorUrl: 'https://192.168.1.34:3443',
          caPem: info.caPem,
          huellaSha256: info.huellaSha256,
          origen: ruta,
        };
      }
    } catch { /* Ignora candidatos inválidos */ }
  }
  return null;
}

function datosPublicos() {
  const { host, puerto, base, usuario } = guardada?.conexion ?? {};
  const remoto = guardada?.remoto
    ? { servidorUrl: guardada.remoto.servidorUrl, caPem: guardada.remoto.caPem, huellaSha256: guardada.remoto.huellaSha256 }
    : undefined;
  return {
    mensaje,
    diagnostico,
    esError: Boolean(mensaje || diagnostico),
    bloqueada: Boolean(bloqueo),
    guardada: Boolean(guardada),
    modo: guardada?.modo || (guardada?.conexion ? 'local' : undefined),
    remoto,
    conexion: guardada?.conexion ? { host, puerto, base, usuario } : undefined,
    detectado: guardada ? undefined : detectarCertificadoCaLocal(),
  };
}

function registrarErrorConexion(error) {
  const item = diagnosticos.get(error?.message) ?? diagnosticoGenerico;
  diagnostico = item;
  mensaje = `${item.titulo}. Detalle: ${item.causa} Acción sugerida: ${item.accion}`;
}

function limpiarErrorConexion() {
  diagnostico = undefined;
  mensaje = undefined;
}

function archivoConfiguracion() {
  return join(app.getPath('userData'), 'instalacion.bin');
}

function resolverIconoVentana() {
  const baseDesempaquetada = __dirname.replace(/app\.asar([\\/])/i, 'app.asar.unpacked$1');
  const candidatos = process.platform === 'win32'
    ? [
        join(baseDesempaquetada, 'build', 'icon.ico'),
        join(baseDesempaquetada, 'build', 'icon.png'),
        join(__dirname, 'build', 'icon.ico'),
        join(__dirname, 'build', 'icon.png'),
        join(__dirname, 'assets', 'atlob_isotipo.png'),
      ]
    : [
        join(baseDesempaquetada, 'build', 'icon.png'),
        join(__dirname, 'build', 'icon.png'),
        join(__dirname, 'assets', 'atlob_isotipo.png'),
      ];
  for (const ruta of candidatos) {
    if (existsSync(ruta)) {
      const img = nativeImage.createFromPath(ruta);
      if (!img.isEmpty()) return img;
      return ruta;
    }
  }
  return join(__dirname, 'build', 'icon.ico');
}

function nuevaVentana(opciones, permiteNavegacion) {
  const iconoVentana = resolverIconoVentana();
  const ventana = new BrowserWindow({
    ...opciones,
    title: 'ATLOB ERP',
    icon: iconoVentana,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      ...opciones.webPreferences,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: false,
    },
  });
  if (typeof ventana.setIcon === 'function' && iconoVentana) {
    try {
      ventana.setIcon(iconoVentana);
    } catch {
      // Algunos entornos sin escritorio gráfico no soportan setIcon dinámico.
    }
  }
  ventana.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  function verificarNavegacion(evento, url) {
    if (!permiteNavegacion(evento.url ?? url)) evento.preventDefault();
  }
  ventana.webContents.on('will-navigate', verificarNavegacion);
  ventana.webContents.on('will-redirect', verificarNavegacion);
  ventana.webContents.on('will-attach-webview', evento => evento.preventDefault());
  return ventana;
}

function solicitarBackend(metodo, pathAndQuery, headersIn = {}, bodyBuffer = null, destinoExplicito = null, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const usaCliente = destinoExplicito ? true : activoModo === 'cliente';
    const targetRemoto = destinoExplicito || destinoCliente;

    let options;
    let transport;
    if (usaCliente) {
      if (!targetRemoto) return reject(new Error('BACKEND_ECONNREFUSED'));
      const caList = targetRemoto.caPem ? [...tls.rootCertificates, targetRemoto.caPem] : undefined;
      options = {
        protocol: 'https:',
        hostname: targetRemoto.host.replace(/^\[|\]$/g, ''),
        port: Number(targetRemoto.puerto),
        path: pathAndQuery,
        method: metodo,
        ca: caList,
        rejectUnauthorized: true,
        timeout: timeoutMs,
        headers: {
          ...headersIn,
          host: `${targetRemoto.host}:${targetRemoto.puerto}`,
          'accept-encoding': 'identity',
        },
      };
      transport = https;
    } else {
      if (!origenLocal) return reject(new Error('SERVIDOR_CERRADO'));
      const localUrl = new URL(origenLocal);
      options = {
        protocol: 'http:',
        hostname: localUrl.hostname.replace(/^\[|\]$/g, ''),
        port: Number(localUrl.port),
        path: pathAndQuery,
        method: metodo,
        timeout: timeoutMs,
        headers: {
          ...headersIn,
          host: localUrl.host,
          origin: origenLocal,
          'accept-encoding': 'identity',
        },
      };
      transport = http;
    }

    const req = transport.request(options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode || 500,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('BACKEND_TIMEOUT'));
    });
    req.on('error', err => reject(err));
    if (bodyBuffer && bodyBuffer.length > 0 && !['GET', 'HEAD'].includes(metodo)) {
      req.write(bodyBuffer);
    }
    req.end();
  });
}

async function verificarSaludRemota(remoto) {
  let respuesta;
  try {
    respuesta = await solicitarBackend('GET', '/api/health', { accept: 'application/json' }, null, remoto, 4500);
  } catch (err) {
    throw new Error(clasificarErrorRedOTls(err));
  }
  if (respuesta.status < 200 || respuesta.status >= 300) {
    throw new Error('BACKEND_ECONNREFUSED');
  }
  let json;
  try {
    json = JSON.parse(respuesta.body.toString('utf8'));
  } catch {
    throw new Error('BACKEND_ECONNREFUSED');
  }
  if (json?.status !== 'UP' || json?.database !== 'POSTGRESQL_CONNECTED') {
    throw new Error('BACKEND_POSTGRES_CAIDO');
  }
  return json;
}

async function comprobarSaludActiva() {
  const ahora = new Date().toISOString();
  try {
    const res = await solicitarBackend('GET', '/api/health', { accept: 'application/json' }, null, null, 3000);
    if (res.status >= 200 && res.status < 300) {
      const json = JSON.parse(res.body.toString('utf8'));
      if (json?.status === 'UP' && json?.database === 'POSTGRESQL_CONNECTED') {
        actualizarEstadoConexion({
          online: true,
          ultimoChequeo: ahora,
          ultimoError: null,
          baseDatos: json.database,
        });
        return estadoPublicoConexion();
      }
      actualizarEstadoConexion({
        online: false,
        ultimoChequeo: ahora,
        ultimoError: 'BACKEND_POSTGRES_CAIDO',
        baseDatos: json?.database || null,
      });
      return estadoPublicoConexion();
    }
    actualizarEstadoConexion({
      online: false,
      ultimoChequeo: ahora,
      ultimoError: 'BACKEND_ECONNREFUSED',
    });
  } catch (err) {
    actualizarEstadoConexion({
      online: false,
      ultimoChequeo: ahora,
      ultimoError: clasificarErrorRedOTls(err),
    });
  }
  return estadoPublicoConexion();
}

function detenerMonitorSalud() {
  if (monitorTimer) {
    clearTimeout(monitorTimer);
    monitorTimer = null;
  }
}

function iniciarMonitorSalud() {
  detenerMonitorSalud();
  const ciclo = async () => {
    if (cerrando || !ventanaPrincipal || ventanaPrincipal.isDestroyed()) return;
    await comprobarSaludActiva();
    if (cerrando || !ventanaPrincipal || ventanaPrincipal.isDestroyed()) return;
    const intervalo = estadoConexion.online ? 5000 : 3000;
    monitorTimer = setTimeout(() => { void ciclo(); }, intervalo);
  };
  monitorTimer = setTimeout(() => { void ciclo(); }, 3000);
}

function respuestaJson(status, objeto) {
  return new Response(JSON.stringify(objeto), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function manejarProtocoloAtlob(request) {
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return new Response('Solicitud inválida', { status: 400 });
  }
  if (url.protocol !== 'atlob:' || url.hostname !== 'app') {
    return new Response('Acceso denegado', { status: 403 });
  }

  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    const metodo = (request.method || 'GET').toUpperCase();
    const esEscritura = !['GET', 'HEAD', 'OPTIONS'].includes(metodo);
    const esAuthPermitida = /^\/api\/auth\/(?:login|refresh)$/.test(url.pathname);

    if (!estadoConexion.online && esEscritura && !esAuthPermitida) {
      return respuestaJson(503, {
        success: false,
        error: 'SERVIDOR_NO_DISPONIBLE: Conexión interrumpida con el servidor central. Operación detenida para evitar duplicaciones.',
      });
    }

    const headersReq = {};
    for (const [k, v] of request.headers.entries()) {
      const lower = k.toLowerCase();
      if (['host', 'origin', 'referer', 'connection', 'content-length', 'accept-encoding'].includes(lower)) continue;
      headersReq[lower] = v;
    }

    const bodyBuffer = !['GET', 'HEAD'].includes(metodo)
      ? Buffer.from(await request.arrayBuffer())
      : null;

    try {
      const res = await solicitarBackend(metodo, url.pathname + url.search, headersReq, bodyBuffer, null, 20000);
      if (url.pathname === '/api/health' && res.status >= 200 && res.status < 300) {
        try {
          const parsed = JSON.parse(res.body.toString('utf8'));
          if (parsed?.status === 'UP' && parsed?.database === 'POSTGRESQL_CONNECTED') {
            actualizarEstadoConexion({
              online: true,
              ultimoChequeo: new Date().toISOString(),
              ultimoError: null,
              baseDatos: parsed.database,
            });
          }
        } catch { /* Ignora */ }
      } else if (!estadoConexion.online && res.status < 500) {
        actualizarEstadoConexion({
          online: true,
          ultimoChequeo: new Date().toISOString(),
          ultimoError: null,
        });
      }

      const headersOut = new Headers();
      for (const [k, v] of Object.entries(res.headers)) {
        const lower = k.toLowerCase();
        if (['transfer-encoding', 'connection', 'keep-alive', 'content-encoding', 'content-length'].includes(lower)) continue;
        if (Array.isArray(v)) {
          for (const item of v) headersOut.append(k, item);
        } else if (typeof v === 'string') {
          headersOut.set(k, v);
        }
      }

      const sinCuerpo = metodo === 'HEAD' || [204, 205, 304].includes(res.status);
      return new Response(sinCuerpo ? null : res.body, { status: res.status, headers: headersOut });
    } catch (err) {
      const codigo = clasificarErrorRedOTls(err);
      actualizarEstadoConexion({
        online: false,
        ultimoChequeo: new Date().toISOString(),
        ultimoError: codigo,
      });
      if (codigo === 'CERT_TLS_ERROR') {
        return respuestaJson(503, {
          success: false,
          error: 'TLS_CERTIFICADO_NO_CONFIABLE: No se pudo validar el certificado HTTPS del servidor central.',
        });
      }
      return respuestaJson(503, {
        success: false,
        error: 'SERVIDOR_NO_DISPONIBLE: No se pudo comunicar con el servidor principal ATLOB ERP.',
      });
    }
  }

  let relPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!relPath) relPath = 'index.html';
  let archivoDestino = resolve(DIST_ROOT, relPath);
  if (archivoDestino !== DIST_ROOT && !archivoDestino.startsWith(DIST_ROOT + sep)) {
    return new Response('Ruta prohibida', { status: 403 });
  }

  let esIndex = false;
  if (!existsSync(archivoDestino) || !statSync(archivoDestino).isFile()) {
    const ext = extname(relPath);
    if (ext && ext !== '.html') {
      return new Response('Archivo no encontrado', { status: 404 });
    }
    archivoDestino = join(DIST_ROOT, 'index.html');
    esIndex = true;
  } else if (extname(archivoDestino).toLowerCase() === '.html') {
    esIndex = true;
  }

  try {
    const contenido = await readFile(archivoDestino);
    const mime = MIME_TYPES.get(extname(archivoDestino).toLowerCase()) || 'application/octet-stream';
    const headers = new Headers({ 'content-type': mime });
    if (esIndex) headers.set('content-security-policy', CSP_APLICACION);
    return new Response(contenido, { status: 200, headers });
  } catch {
    return new Response('Error interno leyendo recurso local', { status: 500 });
  }
}

function asegurarProtocoloAtlob() {
  if (protocoloRegistrado) return;
  const sesionApp = session.fromPartition('atlob-interfaz');
  sesionApp.protocol.handle('atlob', manejarProtocoloAtlob);
  protocoloRegistrado = true;
}

async function capturarPngE2e(ventana, destino) {
  if (!destino || !ventana || ventana.isDestroyed()) return;
  await mkdir(dirname(destino), { recursive: true });
  let ultimoError = null;
  for (let intento = 0; intento < 5; intento += 1) {
    try {
      await ventana.webContents.executeJavaScript(
        'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 150))))'
      );
      const img = await ventana.webContents.capturePage();
      const png = img.toPNG();
      if (png.length > 0) {
        await writeFile(destino, png);
        return;
      }
    } catch (err) {
      ultimoError = err;
      await esperar(300);
    }
  }
  throw ultimoError || new Error('CAPTURA_E2E_VACIA');
}

async function ejecutarE2eConfiguracion(ventana) {
  const configJson = process.env.ATLOB_DESKTOP_E2E_CONFIG;
  if (!process.env.ATLOB_DESKTOP_E2E_OUT || !configJson) return;
  try {
    const cfg = JSON.parse(configJson);
    await ventana.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const limite = Date.now() + 10000;
        const tick = () => {
          const inp = document.querySelector('input[name="servidorUrl"]');
          if (inp && window.configuracionAtlob) return resolve(true);
          if (Date.now() > limite) return reject(new Error('TIMEOUT_CONFIG_UI'));
          setTimeout(tick, 100);
        };
        tick();
      })
    `);

    if (process.env.ATLOB_DESKTOP_E2E_CONFIG_SHOT) {
      await capturarPngE2e(ventana, process.env.ATLOB_DESKTOP_E2E_CONFIG_SHOT);
    }

    const verifWizard = await ventana.webContents.executeJavaScript(`
      (async () => {
        const radioCliente = document.querySelector('input[name="modoSelector"][value="cliente"]');
        if (radioCliente && !radioCliente.checked) {
          radioCliente.click();
        }
        document.querySelector('input[name="servidorUrl"]').value = ${JSON.stringify(cfg.servidorUrl)};
        document.querySelector('input[name="caPem"]').value = ${JSON.stringify(cfg.caPem || '')};
        const res = await window.configuracionAtlob.verificarServidor({
          servidorUrl: ${JSON.stringify(cfg.servidorUrl)},
          caPem: ${JSON.stringify(cfg.caPem || '')},
        });
        document.querySelector('#verificar-servidor').click();
        await new Promise(r => setTimeout(r, 350));
        return {
          verificarOk: Boolean(res && res.ok),
          estadoPanel: (document.querySelector('#estado')?.textContent || '').trim(),
        };
      })()
    `);

    if (!verifWizard?.verificarOk) {
      throw new Error('WIZARD_VERIFICAR_FALLO: ' + JSON.stringify(verifWizard));
    }

    await ventana.webContents.executeJavaScript(`
      document.querySelector('#conectar').click();
    `);
  } catch (err) {
    const outPath = process.env.ATLOB_DESKTOP_E2E_OUT;
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify({ ok: false, etapa: 'config', error: String(err?.message || err) }, null, 2));
    process.exitCode = 1;
    setTimeout(() => app.quit(), 200);
  }
}

async function abrirConfiguracion() {
  if (cerrando) return;
  if (ventanaConfig && !ventanaConfig.isDestroyed()) {
    if (ventanaConfig.isMinimized()) ventanaConfig.restore();
    ventanaConfig.focus();
    return;
  }
  const ventana = nuevaVentana({
    width: 680,
    height: 760,
    minWidth: 440,
    minHeight: 540,
    webPreferences: { preload: join(__dirname, 'config-preload.cjs') },
  }, esUrlConfiguracion);
  ventanaConfig = ventana;
  ventana.once('closed', () => { ventanaConfig = undefined; });
  await ventana.loadFile(configHtml);
  if (!ventana.isDestroyed()) {
    ventana.show();
    void ejecutarE2eConfiguracion(ventana);
  }
}

async function ejecutarE2eControlado(ventana) {
  const outPath = process.env.ATLOB_DESKTOP_E2E_OUT;
  if (!outPath) return;

  try {
    await ventana.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const limite = Date.now() + 15000;
        const tick = () => {
          const root = document.querySelector('#root');
          const txt = (root && root.textContent || '').trim();
          if (txt.length > 20) return resolve(txt);
          if (Date.now() > limite) return reject(new Error('TIMEOUT_RENDER_ROOT'));
          setTimeout(tick, 100);
        };
        tick();
      })
    `);

    const verificacionInicial = await ventana.webContents.executeJavaScript(`
      (async () => {
        const healthResp = await fetch('/api/health').then(async r => ({ status: r.status, body: await r.json() }));
        const setupResp = await fetch('/api/setup/status').then(async r => ({ status: r.status, body: await r.json() }));
        const estadoDesktop = window.atlobDesktop ? await window.atlobDesktop.obtenerEstadoConexion() : null;
        return {
          origin: window.location.origin,
          title: document.title,
          tieneBridgeDesktop: Boolean(window.atlobDesktop && window.atlobDesktop.esEscritorio),
          estadoDesktop,
          healthResp,
          setupResp,
          textoVisibleSample: (document.body.innerText || '').slice(0, 500),
          tieneFormularioLogin: Boolean(document.querySelector('#login-identificador') && document.querySelector('#login-password')),
        };
      })()
    `);

    if (process.env.ATLOB_DESKTOP_E2E_SHOT) {
      await capturarPngE2e(ventana, process.env.ATLOB_DESKTOP_E2E_SHOT);
    }

    let resultadoLogin = null;
    if (process.env.ATLOB_DESKTOP_E2E_CREDENTIALS) {
      const creds = JSON.parse(process.env.ATLOB_DESKTOP_E2E_CREDENTIALS);
      resultadoLogin = await ventana.webContents.executeJavaScript(`
        (async () => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          const userEl = document.querySelector('#login-identificador');
          const passEl = document.querySelector('#login-password');
          const submitEl = document.querySelector('#login-submit');
          setter.call(userEl, ${JSON.stringify(creds.email)});
          userEl.dispatchEvent(new Event('input', { bubbles: true }));
          setter.call(passEl, ${JSON.stringify(creds.password)});
          passEl.dispatchEvent(new Event('input', { bubbles: true }));
          submitEl.click();

          const limite = Date.now() + 15000;
          while (Date.now() < limite) {
            const texto = document.body.innerText || '';
            if (!document.querySelector('#login-submit') && texto.length > 50) break;
            await new Promise(r => setTimeout(r, 150));
          }
          const sigueEnLogin = Boolean(document.querySelector('#login-submit'));
          const textoCompleto = document.body.innerText || '';
          return {
            autenticadoUi: !sigueEnLogin,
            tieneFooterConexion: textoCompleto.includes('En línea') || textoCompleto.includes('Cambiar servidor'),
            textoPostLogin: textoCompleto.slice(0, 800),
          };
        })()
      `);

      if (process.env.ATLOB_DESKTOP_E2E_AUTH_SHOT) {
        await esperar(400);
        await capturarPngE2e(ventana, process.env.ATLOB_DESKTOP_E2E_AUTH_SHOT);
      }
    }

    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify({
      ok: true,
      modo: activoModo,
      servidorLocalIniciado: Boolean(servidor),
      estadoConexion: estadoPublicoConexion(),
      verificacionInicial,
      resultadoLogin,
    }, null, 2));
  } catch (err) {
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify({
      ok: false,
      error: String(err?.message || err),
      modo: activoModo,
      servidorLocalIniciado: Boolean(servidor),
    }, null, 2));
    process.exitCode = 1;
  } finally {
    setTimeout(() => app.quit(), 250);
  }
}

async function abrirPrincipal() {
  asegurarProtocoloAtlob();
  const ventanaAnterior = ventanaPrincipal;
  const ventana = nuevaVentana({
    width: 1390,
    height: 920,
    minWidth: 800,
    minHeight: 570,
    webPreferences: {
      partition: 'atlob-interfaz',
      preload: join(__dirname, 'app-preload.cjs'),
    },
  }, esUrlAplicacion);

  ventanaPrincipal = ventana;
  ventana.once('closed', () => {
    if (ventanaPrincipal === ventana) {
      ventanaPrincipal = undefined;
      detenerMonitorSalud();
    }
  });

  try {
    await ventana.loadURL(`${APP_ORIGIN}/`);
    if (ventana.isDestroyed()) throw new Error('SERVIDOR_CERRADO');
    ventana.show();
    emitirCambioEstadoConexion();
    iniciarMonitorSalud();
    if (ventanaAnterior && !ventanaAnterior.isDestroyed() && ventanaAnterior !== ventana) {
      ventanaAnterior.destroy();
    }
    ventanaConfig?.destroy();
    if (process.env.ATLOB_DESKTOP_E2E_OUT) {
      void ejecutarE2eControlado(ventana);
    }
  } catch (error) {
    registrarErrorConexion(error);
    await abrirConfiguracion();
    if (!ventana.isDestroyed()) ventana.destroy();
    throw error;
  }
}

function esperarPuerto(proceso) {
  return new Promise((resolve, reject) => {
    function terminar(error, puerto) {
      clearTimeout(timer);
      proceso.removeListener('message', alRecibir);
      proceso.removeListener('exit', alSalir);
      if (error) reject(error); else resolve(puerto);
    }
    function alRecibir(datos) {
      if (datos?.type === 'startup-error') terminar(new Error(datos.code));
      if (datos?.type === 'listening' && Number.isInteger(datos.port) && datos.port >= 1 && datos.port <= 65535) {
        terminar(null, datos.port);
      }
    }
    function alSalir() { terminar(new Error('SERVIDOR_CERRADO')); }
    const timer = setTimeout(() => terminar(new Error('SERVIDOR_TIMEOUT')), 45000);
    proceso.on('message', alRecibir);
    proceso.once('exit', alSalir);
  });
}

async function detenerServidor() {
  const proceso = servidor;
  if (!proceso) return;
  servidor = undefined;
  origenLocal = '';
  await new Promise(resolve => {
    function terminado() {
      clearTimeout(timer);
      proceso.removeListener('exit', terminado);
      resolve();
    }
    const timer = setTimeout(() => {
      proceso.kill();
      terminado();
    }, 2000);
    proceso.once('exit', terminado);
    try { proceso.postMessage({ type: 'shutdown' }); } catch { proceso.kill(); terminado(); }
  });
}

async function iniciarServidorLocal(configuracion, migrar) {
  const { conexion, secretos } = configuracion;
  const entorno = Object.fromEntries(Object.entries(process.env).filter(([clave]) =>
    ['systemroot', 'windir', 'path', 'temp', 'tmp'].includes(clave.toLowerCase())));
  const raiz = app.isPackaged ? join(process.resourcesPath, 'app.asar.unpacked') : app.getAppPath();
  const proceso = utilityProcess.fork(join(raiz, 'desktop', 'generated', 'server.mjs'), [], {
    cwd: app.getPath('userData'),
    serviceName: 'Servidor local ATLOB ERP',
    stdio: 'ignore',
    env: {
      ...entorno,
      ...secretos,
      NODE_ENV: 'production',
      DOTENV_CONFIG_PATH: '',
      HOST: '127.0.0.1',
      PORT: '0',
      ATLOB_DESKTOP: '1',
      ATLOB_DESKTOP_MIGRATE: migrar && conexion.base.toLowerCase() !== 'sistema_contable' ? '1' : '0',
      DATABASE_URL: construirUrl(conexion),
      npm_package_version: app.getVersion(),
    },
  });
  servidor = proceso;
  proceso.once('exit', () => {
    if (servidor !== proceso) return;
    servidor = undefined;
    origenLocal = '';
    if (cerrando || !ventanaPrincipal) return;
    actualizarEstadoConexion({ online: false, ultimoError: 'SERVIDOR_CERRADO' });
  });

  const puerto = await esperarPuerto(proceso);
  const origen = `http://127.0.0.1:${puerto}`;
  const limite = Date.now() + 6000;
  while (Date.now() < limite) {
    if (servidor !== proceso) throw new Error('SERVIDOR_CERRADO');
    try {
      const response = await fetch(`${origen}/api/health`, { signal: AbortSignal.timeout(800), redirect: 'error' });
      if (response.ok) {
        const datos = await response.json();
        if (datos.status === 'UP' && datos.database === 'POSTGRESQL_CONNECTED') {
          origenLocal = origen;
          return { origen, puerto: String(puerto), baseDatos: datos.database };
        }
      }
    } catch { /* El servicio puede estar terminando de iniciar. */ }
    await esperar(200);
  }
  throw new Error('SERVIDOR_TIMEOUT');
}

async function conectar(configuracion, { migrar = false, persistir = false, permitirOfflineInicial = false } = {}) {
  if (iniciando || cerrando || (bloqueo && !persistir)) return datosPublicos();
  iniciando = true;
  try {
    if (configuracion.modo === 'cliente') {
      await detenerServidor();
      const remoto = validarServidorRemoto(configuracion.remoto);
      activoModo = 'cliente';
      destinoCliente = remoto;

      let salud = null;
      let online = false;
      let errorInicial = null;
      try {
        salud = await verificarSaludRemota(remoto);
        online = true;
      } catch (err) {
        const code = String(err?.message || 'BACKEND_ECONNREFUSED');
        if (!permitirOfflineInicial || code === 'CERT_TLS_ERROR') {
          throw err;
        }
        errorInicial = code;
      }

      const configNormalizada = { version: 1, modo: 'cliente', remoto };
      if (persistir) {
        await guardarConfiguracion(archivoConfiguracion(), configNormalizada, safeStorage);
        bloqueo = undefined;
      }
      guardada = configNormalizada;
      limpiarErrorConexion();
      actualizarEstadoConexion({
        modo: 'cliente',
        online,
        servidorUrl: remoto.servidorUrl,
        host: remoto.host,
        puerto: remoto.puerto,
        huellaCa: remoto.huellaSha256,
        ultimoChequeo: new Date().toISOString(),
        ultimoError: errorInicial,
        baseDatos: salud?.database || null,
      });
      await abrirPrincipal();
      return { ok: true };
    }

    // Modo local independiente (PostgreSQL local en este equipo)
    destinoCliente = null;
    await detenerServidor();
    activoModo = 'local';
    const localInfo = await iniciarServidorLocal(configuracion, migrar);
    if (cerrando) return datosPublicos();
    const configLocal = { version: 1, conexion: configuracion.conexion, secretos: configuracion.secretos };
    if (persistir) {
      await guardarConfiguracion(archivoConfiguracion(), configLocal, safeStorage);
      bloqueo = undefined;
    }
    guardada = configLocal;
    limpiarErrorConexion();
    actualizarEstadoConexion({
      modo: 'local',
      online: true,
      servidorUrl: localInfo.origen,
      host: configuracion.conexion.host,
      puerto: localInfo.puerto,
      huellaCa: null,
      ultimoChequeo: new Date().toISOString(),
      ultimoError: null,
      baseDatos: localInfo.baseDatos,
    });
    await abrirPrincipal();
    return { ok: true };
  } catch (error) {
    await detenerServidor();
    registrarErrorConexion(error);
    return { ...datosPublicos(), modo: configuracion.modo || 'local' };
  } finally {
    iniciando = false;
  }
}

function desdeConfiguracion(handler) {
  return (evento, ...argumentos) => {
    if (!ventanaConfig || evento.sender.id !== ventanaConfig.webContents.id || !esUrlConfiguracion(evento.senderFrame?.url) || evento.senderFrame.parent) {
      throw new Error('SOLICITUD_NO_AUTORIZADA');
    }
    return handler(...argumentos);
  };
}

function desdePrincipal(handler) {
  return (evento, ...argumentos) => {
    if (!ventanaPrincipal || evento.sender.id !== ventanaPrincipal.webContents.id || !esUrlAplicacion(evento.senderFrame?.url) || evento.senderFrame.parent) {
      throw new Error('SOLICITUD_NO_AUTORIZADA');
    }
    return handler(...argumentos);
  };
}

async function iniciarAplicacion() {
  Menu.setApplicationMenu(null);
  for (const sesion of [session.defaultSession, session.fromPartition('atlob-interfaz')]) {
    sesion.setPermissionCheckHandler(() => false);
    sesion.setPermissionRequestHandler((_contenido, _permiso, responder) => responder(false));
  }

  ipcMain.handle('desktop:estado', desdeConfiguracion(datosPublicos));
  ipcMain.handle('desktop:reintentar', desdeConfiguracion(() => guardada ? conectar(guardada) : datosPublicos()));
  ipcMain.handle('desktop:seleccionar-ca', desdeConfiguracion(async () => {
    const res = await dialog.showOpenDialog(ventanaConfig, {
      title: 'Seleccionar certificado público CA del servidor ATLOB ERP',
      properties: ['openFile'],
      filters: [{ name: 'Certificados X.509 (*.crt, *.pem)', extensions: ['crt', 'pem', 'cer'] }],
    });
    if (res.canceled || !res.filePaths?.[0]) return { cancelado: true };
    try {
      const ruta = res.filePaths[0];
      const pem = await readFile(ruta, 'utf8');
      const info = validarCertificadoCaPem(pem);
      const huellaHexArchivo = createHash('sha256').update(await readFile(ruta)).digest('hex');
      return {
        ok: true,
        caPem: info.caPem,
        huellaSha256: info.huellaSha256,
        huellaArchivoSha256: huellaHexArchivo,
        archivo: ruta.split(/[\\/]/).pop(),
      };
    } catch (error) {
      registrarErrorConexion(error);
      return datosPublicos();
    }
  }));

  ipcMain.handle('desktop:verificar-servidor', desdeConfiguracion(async datos => {
    try {
      const remoto = validarServidorRemoto(datos);
      const salud = await verificarSaludRemota(remoto);
      return {
        ok: true,
        remoto,
        mensaje: 'Conexión HTTPS TLS y PostgreSQL central verificados.',
        diagnostico: {
          titulo: `Conexión verificada en ${remoto.servidorUrl}`,
          causa: `PostgreSQL central activo (${salud.database}). ${remoto.huellaSha256 ? `Certificado CA validado (${remoto.huellaSha256}).` : 'Validación TLS estricta activa.'}`,
          accion: 'Pulse "Guardar y abrir ATLOB ERP" para iniciar sesión.',
        },
      };
    } catch (error) {
      registrarErrorConexion(error);
      return { ...datosPublicos(), modo: 'cliente' };
    }
  }));

  ipcMain.handle('desktop:conectar', desdeConfiguracion(async datos => {
    try {
      if (datos?.modo === 'cliente') {
        const remoto = validarServidorRemoto(datos);
        return await conectar({ version: 1, modo: 'cliente', remoto }, { persistir: true });
      }
      const conexion = validarConexion(datos);
      const secretos = guardada?.secretos ?? nuevosSecretos();
      return await conectar({ version: 1, conexion, secretos }, { migrar: datos.migrar === 'on', persistir: true });
    } catch (error) {
      registrarErrorConexion(error);
      return { ...datosPublicos(), modo: datos?.modo === 'cliente' ? 'cliente' : 'local' };
    }
  }));

  ipcMain.handle('desktop:estado-conexion', desdePrincipal(estadoPublicoConexion));
  ipcMain.handle('desktop:verificar-ahora', desdePrincipal(comprobarSaludActiva));
  ipcMain.handle('desktop:reconfigurar-servidor', desdePrincipal(async () => {
    await abrirConfiguracion();
    return { ok: true };
  }));

  try {
    if (process.platform !== 'win32') throw new Error('DPAPI_NO_DISPONIBLE');
    guardada = await leerConfiguracion(archivoConfiguracion(), safeStorage);
  } catch (error) {
    bloqueo = error;
    registrarErrorConexion(error);
  }
  if (guardada && (await conectar(guardada, { permitirOfflineInicial: guardada.modo === 'cliente' })).ok) return;
  await abrirConfiguracion();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const ventana = ventanaPrincipal ?? ventanaConfig;
    if (ventana?.isMinimized()) ventana.restore();
    ventana?.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', evento => {
    detenerMonitorSalud();
    if (listoParaCerrar) return;
    evento.preventDefault();
    if (cerrando) return;
    cerrando = true;
    void detenerServidor().finally(() => {
      listoParaCerrar = true;
      app.quit();
    });
  });
  void app.whenReady().then(iniciarAplicacion).catch(() => app.quit());
}
