const { randomBytes, randomUUID } = require('node:crypto');
const { readFile, rename, rm, writeFile } = require('node:fs/promises');

const nombresSecretos = [
  'JWT_SECRET', 'JWT_REFRESH_SECRET', 'SUNAT_ENCRYPTION_KEY', 'MFA_SEED_SECRET', 'BACKUP_ENCRYPTION_KEY',
];

const hostsLocales = new Map([
  ['localhost', 'localhost'], ['127.0.0.1', '127.0.0.1'], ['::1', '[::1]'], ['[::1]', '[::1]'],
]);

function validarConexion(datos) {
  if (!datos || typeof datos !== 'object') throw new Error('CONEXION_INVALIDA');
  const { host, puerto, base, usuario, contrasena } = datos;
  if (typeof host !== 'string' || !hostsLocales.has(host.trim().toLowerCase())) throw new Error('HOST_NO_LOCAL');
  if (typeof puerto !== 'string' || !/^\d{1,5}$/.test(puerto) || Number(puerto) < 1 || Number(puerto) > 65535) {
    throw new Error('PUERTO_INVALIDO');
  }
  if ([base, usuario].some(valor => typeof valor !== 'string' || !valor.trim() || Buffer.byteLength(valor.trim(), 'utf8') > 63 || /[\u0000-\u001f\u007f]/.test(valor)) ||
      ['.', '..'].includes(base.trim())) {
    throw new Error('CONEXION_INVALIDA');
  }
  if (typeof contrasena !== 'string' || !contrasena || contrasena.length > 4096 || contrasena.includes('\0')) {
    throw new Error('CONTRASENA_REQUERIDA');
  }
  return { host: host.trim().toLowerCase(), puerto, base: base.trim(), usuario: usuario.trim(), contrasena };
}

function construirUrl(datos) {
  const conexion = validarConexion(datos);
  const credenciales = [conexion.usuario, conexion.contrasena].map(encodeURIComponent).join(':');
  const destino = `${hostsLocales.get(conexion.host)}:${conexion.puerto}/${encodeURIComponent(conexion.base)}`;
  return ['postgresql://', credenciales, '@', destino].join('');
}

function nuevosSecretos() {
  return Object.fromEntries(nombresSecretos.map(nombre => [nombre, randomBytes(32).toString('hex')]));
}

async function verificarCifrado(proveedor) {
  if (!await proveedor.isAsyncEncryptionAvailable()) throw new Error('DPAPI_NO_DISPONIBLE');
}

async function leerConfiguracion(archivo, proveedor) {
  await verificarCifrado(proveedor);
  let cifrado;
  try {
    cifrado = await readFile(archivo);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error('CONFIGURACION_NO_LEGIBLE');
  }

  try {
    const { result } = await proveedor.decryptStringAsync(cifrado);
    const guardada = JSON.parse(result);
    if (guardada.version !== 1) throw new Error('VERSION_CONFIGURACION');
    const secretos = Object.fromEntries(nombresSecretos.map(nombre => [nombre, guardada.secretos[nombre]]));
    if (Object.values(secretos).some(valor => typeof valor !== 'string' || !/^[a-f0-9]{64}$/.test(valor)) ||
        new Set(Object.values(secretos)).size !== nombresSecretos.length) {
      throw new Error('SECRETOS_INVALIDOS');
    }
    return { version: 1, conexion: validarConexion(guardada.conexion), secretos };
  } catch {
    throw new Error('CONFIGURACION_NO_LEGIBLE');
  }
}

async function guardarConfiguracion(archivo, datos, proveedor) {
  await verificarCifrado(proveedor);
  const temporal = `${archivo}.${randomUUID()}.tmp`;
  try {
    const cifrado = await proveedor.encryptStringAsync(JSON.stringify(datos));
    await writeFile(temporal, cifrado, { flag: 'wx', mode: 0o600 });
    await rename(temporal, archivo);
  } catch {
    throw new Error('CONFIGURACION_NO_GUARDADA');
  } finally {
    await rm(temporal, { force: true }).catch(() => {});
  }
}

module.exports = { construirUrl, guardarConfiguracion, leerConfiguracion, nuevosSecretos, validarConexion };
