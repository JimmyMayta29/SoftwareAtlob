const { app, BrowserWindow, ipcMain, Menu, safeStorage, session, utilityProcess } = require('electron');
const { join } = require('node:path');
const { fileURLToPath } = require('node:url');
const { setTimeout: esperar } = require('node:timers/promises');
const { construirUrl, guardarConfiguracion, leerConfiguracion, nuevosSecretos, validarConexion } = require('./desktop-config.cjs');

const mensajes = new Map(Object.entries({
  '28P01': 'PostgreSQL rechazó el usuario o la contraseña. Comprueba los datos e inténtalo de nuevo.',
  '28000': 'PostgreSQL rechazó la autenticación. Comprueba el usuario y los permisos de conexión.',
  '3D000': 'La base de datos indicada no existe. Comprueba el nombre e inténtalo de nuevo.',
  '42501': 'El usuario no tiene permisos suficientes en esa base de datos.',
  '57P03': 'PostgreSQL todavía no acepta conexiones. Espera a que termine de iniciar y reintenta.',
  PG_ROLE_UNSAFE: 'Conéctate con el rol de la aplicación, sin privilegios de superusuario ni BYPASSRLS.',
  ECONNREFUSED: 'PostgreSQL no está disponible. Inicia el servicio local y comprueba el puerto.',
  ETIMEDOUT: 'PostgreSQL tardó demasiado en responder. Comprueba el servidor y el puerto.',
  ENOTFOUND: 'No se encontró el servidor local. Prueba con 127.0.0.1.',
  EAI_AGAIN: 'No se pudo resolver el servidor local. Prueba con 127.0.0.1.',
  MIGRATIONS_PENDING: 'La base necesita que se autorice o complete la preparación de su esquema.',
  MIGRATIONS_INVALID: 'Las migraciones registradas en la base no coinciden con esta versión de la aplicación.',
  HOST_NO_LOCAL: 'Introduce un servidor local: localhost, 127.0.0.1 o ::1.',
  PUERTO_INVALIDO: 'Introduce un puerto entre 1 y 65535.',
  CONEXION_INVALIDA: 'Comprueba el nombre de la base y el usuario de PostgreSQL.',
  CONTRASENA_REQUERIDA: 'Introduce la contraseña de PostgreSQL.',
  DPAPI_NO_DISPONIBLE: 'Windows no puede cifrar la configuración en este perfil. Vuelve a abrir la aplicación desde tu sesión.',
  CONFIGURACION_NO_LEGIBLE: 'Windows no pudo descifrar la configuración guardada. Abre la aplicación con el usuario que la configuró.',
  CONFIGURACION_NO_GUARDADA: 'No se pudo guardar la configuración cifrada. Comprueba el acceso a la carpeta de datos de tu usuario.',
  SERVIDOR_TIMEOUT: 'El servidor no estuvo listo a tiempo. Comprueba PostgreSQL e inténtalo de nuevo.',
  SERVIDOR_CERRADO: 'El servidor de la aplicación se cerró. Comprueba PostgreSQL y reintenta.',
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
let ventanaConfig;
let ventanaPrincipal;
let servidor;
let guardada;
let bloqueo;
let mensaje;
let iniciando = false;
let cerrando = false;
let listoParaCerrar = false;

function datosPublicos() {
  const { host, puerto, base, usuario } = guardada?.conexion ?? {};
  return {
    mensaje,
    bloqueada: Boolean(bloqueo),
    guardada: Boolean(guardada),
    conexion: guardada ? { host, puerto, base, usuario } : undefined,
  };
}

function mensajeSeguro(error) {
  return mensajes.get(error?.message) ?? 'No se pudo iniciar la aplicación. Comprueba la conexión a PostgreSQL y reintenta.';
}

function archivoConfiguracion() {
  return join(app.getPath('userData'), 'instalacion.bin');
}

function nuevaVentana(opciones, permiteNavegacion) {
  const ventana = new BrowserWindow({
    ...opciones,
    title: 'ATLOB ERP',
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
  ventana.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  function verificarNavegacion(evento, url) {
    if (!permiteNavegacion(evento.url ?? url)) evento.preventDefault();
  }
  ventana.webContents.on('will-navigate', verificarNavegacion);
  ventana.webContents.on('will-redirect', verificarNavegacion);
  ventana.webContents.on('will-attach-webview', evento => evento.preventDefault());
  return ventana;
}

async function abrirConfiguracion() {
  if (ventanaConfig || cerrando) return;
  const ventana = nuevaVentana({
    width: 670,
    height: 730,
    minWidth: 410,
    minHeight: 510,
    webPreferences: { preload: join(__dirname, 'config-preload.cjs') },
  }, esUrlConfiguracion);
  ventanaConfig = ventana;
  ventana.once('closed', () => { ventanaConfig = undefined; });
  await ventana.loadFile(configHtml);
  if (!ventana.isDestroyed()) ventana.show();
}

async function abrirPrincipal(origen) {
  const ventana = nuevaVentana({
    width: 1390,
    height: 920,
    minWidth: 800,
    minHeight: 570,
    webPreferences: { partition: 'atlob-interfaz' },
  }, url => {
    try { return new URL(url).origin === origen; } catch { return false; }
  });
  ventanaPrincipal = ventana;
  ventana.once('closed', () => { ventanaPrincipal = undefined; });
  try {
    await ventana.loadURL(origen);
    if (ventana.isDestroyed()) throw new Error('SERVIDOR_CERRADO');
    ventana.show();
    ventanaConfig?.destroy();
  } catch (error) {
    mensaje = mensajeSeguro(error);
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

async function iniciarServidor(configuracion, migrar) {
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
    if (cerrando || !ventanaPrincipal) return;
    mensaje = mensajes.get('SERVIDOR_CERRADO');
    void abrirConfiguracion().then(() => ventanaPrincipal?.destroy()).catch(() => app.quit());
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
        if (datos.status === 'UP' && datos.database === 'POSTGRESQL_CONNECTED') return origen;
      }
    } catch { /* El servicio puede estar terminando de iniciar. */ }
    await esperar(200);
  }
  throw new Error('SERVIDOR_TIMEOUT');
}

async function conectar(configuracion, migrar = false, persistir = false) {
  if (iniciando || cerrando || bloqueo) return datosPublicos();
  iniciando = true;
  try {
    const origen = await iniciarServidor(configuracion, migrar);
    if (cerrando) return datosPublicos();
    if (persistir) await guardarConfiguracion(archivoConfiguracion(), configuracion, safeStorage);
    guardada = configuracion;
    await abrirPrincipal(origen);
    return { ok: true };
  } catch (error) {
    await detenerServidor();
    mensaje = mensajeSeguro(error);
    return datosPublicos();
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

async function iniciarAplicacion() {
  Menu.setApplicationMenu(null);
  for (const sesion of [session.defaultSession, session.fromPartition('atlob-interfaz')]) {
    sesion.setPermissionCheckHandler(() => false);
    sesion.setPermissionRequestHandler((_contenido, _permiso, responder) => responder(false));
  }

  ipcMain.handle('desktop:estado', desdeConfiguracion(datosPublicos));
  ipcMain.handle('desktop:reintentar', desdeConfiguracion(() => guardada ? conectar(guardada) : datosPublicos()));
  ipcMain.handle('desktop:conectar', desdeConfiguracion(async datos => {
    try {
      const conexion = validarConexion(datos);
      const secretos = guardada?.secretos ?? nuevosSecretos();
      return await conectar({ version: 1, conexion, secretos }, datos.migrar === 'on', true);
    } catch (error) {
      mensaje = mensajeSeguro(error);
      return datosPublicos();
    }
  }));

  try {
    if (process.platform !== 'win32') throw new Error('DPAPI_NO_DISPONIBLE');
    guardada = await leerConfiguracion(archivoConfiguracion(), safeStorage);
  } catch (error) {
    bloqueo = error;
    mensaje = mensajeSeguro(error);
  }
  if (guardada && (await conectar(guardada)).ok) return;
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
