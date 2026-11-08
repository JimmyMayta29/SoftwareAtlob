const { app, BrowserWindow, ipcMain, Menu, safeStorage, session, utilityProcess } = require('electron');
const { join } = require('node:path');
const { fileURLToPath } = require('node:url');
const { setTimeout: esperar } = require('node:timers/promises');
const { construirUrl, guardarConfiguracion, leerConfiguracion, nuevosSecretos, validarConexion } = require('./desktop-config.cjs');

const diagnosticos = new Map(Object.entries({
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
    titulo: 'No se encontró el nombre del servidor local',
    causa: 'El nombre escrito en Servidor local no pudo resolverse en este equipo.',
    accion: 'Pulse "Restaurar localhost:5432" o escriba 127.0.0.1 como servidor.',
  },
  EAI_AGAIN: {
    titulo: 'Fallo temporal al resolver el servidor local',
    causa: 'Windows no pudo resolver momentáneamente el nombre localhost.',
    accion: 'Escriba 127.0.0.1 en el campo Servidor local y vuelva a conectar.',
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
    titulo: 'Solo se permiten conexiones en este equipo',
    causa: 'Esta edición de escritorio solo admite servidores PostgreSQL instalados localmente.',
    accion: 'Use localhost o 127.0.0.1 en el campo Servidor local.',
  },
  PUERTO_INVALIDO: {
    titulo: 'Número de puerto no válido',
    causa: 'El puerto debe ser un número entero entre 1 y 65535.',
    accion: 'Ingrese el puerto estándar 5432 o el puerto local donde instaló PostgreSQL.',
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
    accion: 'Inicie sesión con el usuario de Windows original o elimine instalacion.bin en %APPDATA% para volver a configurar la conexión.',
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
let ventanaConfig;
let ventanaPrincipal;
let servidor;
let guardada;
let bloqueo;
let mensaje;
let diagnostico;
let iniciando = false;
let cerrando = false;
let listoParaCerrar = false;

const diagnosticoGenerico = {
  titulo: 'No se pudo iniciar la aplicación con PostgreSQL',
  causa: 'PostgreSQL no respondió según lo esperado o rechazó la conexión inicial.',
  accion: 'Verifique que el servicio PostgreSQL esté activo en localhost:5432, compruebe usuario y contraseña, e inténtelo nuevamente.',
};

function datosPublicos() {
  const { host, puerto, base, usuario } = guardada?.conexion ?? {};
  return {
    mensaje,
    diagnostico,
    esError: Boolean(mensaje || diagnostico),
    bloqueada: Boolean(bloqueo),
    guardada: Boolean(guardada),
    conexion: guardada ? { host, puerto, base, usuario } : undefined,
  };
}

function registrarErrorConexion(error) {
  const item = diagnosticos.get(error?.message) ?? diagnosticoGenerico;
  diagnostico = item;
  mensaje = `${item.titulo}. Causa probable: ${item.causa} Acción sugerida: ${item.accion}`;
}

function limpiarErrorConexion() {
  diagnostico = undefined;
  mensaje = undefined;
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
    registrarErrorConexion(new Error('SERVIDOR_CERRADO'));
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
    limpiarErrorConexion();
    await abrirPrincipal(origen);
    return { ok: true };
  } catch (error) {
    await detenerServidor();
    registrarErrorConexion(error);
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
      registrarErrorConexion(error);
      return datosPublicos();
    }
  }));

  try {
    if (process.platform !== 'win32') throw new Error('DPAPI_NO_DISPONIBLE');
    guardada = await leerConfiguracion(archivoConfiguracion(), safeStorage);
  } catch (error) {
    bloqueo = error;
    registrarErrorConexion(error);
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
