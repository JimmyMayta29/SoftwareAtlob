const { createHash, randomBytes, randomUUID, X509Certificate } = require('node:crypto');
const { isIP } = require('node:net');
const { readFile, rename, rm, writeFile } = require('node:fs/promises');

const nombresSecretos = [
  'JWT_SECRET', 'JWT_REFRESH_SECRET', 'SUNAT_ENCRYPTION_KEY', 'MFA_SEED_SECRET', 'BACKUP_ENCRYPTION_KEY',
];

const hostsLocales = new Map([
  ['localhost', 'localhost'], ['127.0.0.1', '127.0.0.1'], ['::1', '[::1]'], ['[::1]', '[::1]'],
]);

function esIpv4PrivadaOLoopback(ip) {
  const partes = ip.split('.').map(Number);
  if (partes.length !== 4 || partes.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = partes;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function esHostLanValido(hostSinCorchetes) {
  const host = String(hostSinCorchetes || '').trim().toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host === '::1') return true;
  const tipoIp = isIP(host);
  if (tipoIp === 4) return esIpv4PrivadaOLoopback(host);
  if (tipoIp === 6) return host === '::1';
  if (!/^[a-z0-9][a-z0-9.-]{0,62}$/.test(host) || host.includes('..') || host.endsWith('.')) return false;
  if (host.includes('.')) {
    return /\.(?:local|lan|home\.arpa)$/i.test(host);
  }
  return true;
}

function normalizarUrlServidorHttps(entrada) {
  if (typeof entrada !== 'string') throw new Error('SERVIDOR_URL_INVALIDA');
  const texto = entrada.trim();
  if (!texto) throw new Error('SERVIDOR_URL_INVALIDA');
  if (/^http:\/\//i.test(texto)) throw new Error('PROTOCOLO_HTTPS_REQUERIDO');

  const tieneEsquema = /^[a-z][a-z0-9+.-]*:\/\//i.test(texto);
  const candidato = tieneEsquema ? texto : `https://${texto}`;
  let url;
  try {
    url = new URL(candidato);
  } catch {
    throw new Error('SERVIDOR_URL_INVALIDA');
  }

  if (url.protocol !== 'https:') throw new Error('PROTOCOLO_HTTPS_REQUERIDO');
  if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/')) {
    throw new Error('SERVIDOR_URL_INVALIDA');
  }

  const autorityRaw = candidato.replace(/^https:\/\//i, '').replace(/\/+$/, '');
  const puertoExplicitoMatch = autorityRaw.match(/(?:\]|[^:])\:(\d+)$/);

  const puertoExplicitado = url.port || (puertoExplicitoMatch ? puertoExplicitoMatch[1] : '3443');

  if (!/^\d{1,5}$/.test(puertoExplicitado) || Number(puertoExplicitado) < 1 || Number(puertoExplicitado) > 65535) {
    throw new Error('PUERTO_INVALIDO');
  }

  const hostnameUrl = url.hostname.toLowerCase();
  const hostSinCorchetes = hostnameUrl.startsWith('[') && hostnameUrl.endsWith(']')
    ? hostnameUrl.slice(1, -1)
    : hostnameUrl;

  if (!esHostLanValido(hostSinCorchetes)) {
    throw new Error('HOST_NO_PRIVADO');
  }

  const hostFormateado = isIP(hostSinCorchetes) === 6 ? `[${hostSinCorchetes}]` : hostSinCorchetes;
  return {
    servidorUrl: `https://${hostFormateado}:${Number(puertoExplicitado)}`,
    host: hostFormateado,
    puerto: String(Number(puertoExplicitado)),
  };
}

function validarCertificadoCaPem(pemOpcional) {
  if (pemOpcional === undefined || pemOpcional === null || String(pemOpcional).trim() === '') {
    return { caPem: '', huellaSha256: null, sujeto: null, validoHasta: null };
  }
  if (typeof pemOpcional !== 'string') throw new Error('CERTIFICADO_CA_INVALIDO');
  const limpio = pemOpcional.replaceAll('\r\n', '\n').trim();
  if (
    !limpio.includes('-----BEGIN CERTIFICATE-----') ||
    !limpio.includes('-----END CERTIFICATE-----') ||
    /PRIVATE KEY/i.test(limpio)
  ) {
    throw new Error('CERTIFICADO_CA_INVALIDO');
  }
  try {
    const cert = new X509Certificate(limpio);
    const huellaSha256 = cert.fingerprint256 || createHash('sha256').update(cert.raw).digest('hex');
    return {
      caPem: limpio + '\n',
      huellaSha256,
      sujeto: cert.subject || null,
      validoHasta: cert.validTo || null,
    };
  } catch {
    throw new Error('CERTIFICADO_CA_INVALIDO');
  }
}

function validarServidorRemoto(datos) {
  if (!datos || typeof datos !== 'object') throw new Error('SERVIDOR_URL_INVALIDA');
  const { servidorUrl, host, puerto } = normalizarUrlServidorHttps(datos.servidorUrl);
  const { caPem, huellaSha256 } = validarCertificadoCaPem(datos.caPem);
  return { servidorUrl, host, puerto, caPem, huellaSha256 };
}

function validarConexion(datos) {
  if (!datos || typeof datos !== 'object') throw new Error('CONEXION_INVALIDA');
  const hostCandidato = datos.host === undefined || datos.host === '' ? 'localhost' : datos.host;
  const puertoCandidato = datos.puerto === undefined || datos.puerto === '' ? '5432' : String(datos.puerto).trim();
  const { base, usuario, contrasena } = datos;
  if (typeof hostCandidato !== 'string' || !hostsLocales.has(hostCandidato.trim().toLowerCase())) throw new Error('HOST_NO_LOCAL');
  if (typeof puertoCandidato !== 'string' || !/^\d{1,5}$/.test(puertoCandidato) || Number(puertoCandidato) < 1 || Number(puertoCandidato) > 65535) {
    throw new Error('PUERTO_INVALIDO');
  }
  if ([base, usuario].some(valor => typeof valor !== 'string' || !valor.trim() || Buffer.byteLength(valor.trim(), 'utf8') > 63 || /[\u0000-\u001f\u007f]/.test(valor)) ||
      ['.', '..'].includes(base.trim())) {
    throw new Error('CONEXION_INVALIDA');
  }
  if (typeof contrasena !== 'string' || !contrasena || contrasena.length > 4096 || contrasena.includes('\0')) {
    throw new Error('CONTRASENA_REQUERIDA');
  }
  return { host: hostCandidato.trim().toLowerCase(), puerto: puertoCandidato, base: base.trim(), usuario: usuario.trim(), contrasena };
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

    if (guardada.modo === 'cliente') {
      return {
        version: 1,
        modo: 'cliente',
        remoto: validarServidorRemoto(guardada.remoto),
      };
    }

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

module.exports = {
  construirUrl,
  guardarConfiguracion,
  leerConfiguracion,
  normalizarUrlServidorHttps,
  nuevosSecretos,
  validarCertificadoCaPem,
  validarConexion,
  validarServidorRemoto,
};
