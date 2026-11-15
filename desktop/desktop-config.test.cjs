const assert = require('node:assert/strict');
const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');
const { existsSync, readFileSync } = require('node:fs');
const { mkdtemp, readFile, readdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const {
  construirUrl,
  guardarConfiguracion,
  leerConfiguracion,
  normalizarUrlServidorHttps,
  nuevosSecretos,
  validarCertificadoCaPem,
  validarServidorRemoto,
} = require('./desktop-config.cjs');

const conexion = { host: '::1', puerto: '5432', base: 'prueba', usuario: 'rol@local', contrasena: 'prueba:/@%#' };

test('restringe el destino a PostgreSQL local y codifica la cadena de conexión', () => {
  const url = new URL(construirUrl(conexion));
  assert.equal(url.hostname, '[::1]');
  assert.equal(decodeURIComponent(url.username), conexion.usuario);
  assert.equal(decodeURIComponent(url.password), conexion.contrasena);
  assert.throws(() => construirUrl({ ...conexion, host: 'example.invalid' }), /HOST_NO_LOCAL/);
  assert.throws(() => construirUrl({ ...conexion, puerto: '65536' }), /PUERTO_INVALIDO/);
  assert.throws(() => construirUrl({ ...conexion, base: '..' }), /CONEXION_INVALIDA/);
  assert.throws(() => construirUrl({ ...conexion, contrasena: '' }), /CONTRASENA_REQUERIDA/);
  const porDefecto = new URL(construirUrl({ base: 'sistema_contable', usuario: 'contabilidad_app', contrasena: 'prueba:/@%#' }));
  assert.equal(porDefecto.hostname, 'localhost');
  assert.equal(porDefecto.port, '5432');
});

test('guarda solo bytes cifrados y conserva la configuración si falla el cifrado', async () => {
  const claveDePrueba = randomBytes(32);
  const proveedor = {
    isAsyncEncryptionAvailable: async () => true,
    async encryptStringAsync(plano) {
      const iv = randomBytes(12);
      const cifrador = createCipheriv('aes-256-gcm', claveDePrueba, iv);
      const datos = Buffer.concat([cifrador.update(plano), cifrador.final()]);
      return Buffer.concat([iv, cifrador.getAuthTag(), datos]);
    },
    async decryptStringAsync(cifrado) {
      const descifrador = createDecipheriv('aes-256-gcm', claveDePrueba, cifrado.subarray(0, 12));
      descifrador.setAuthTag(cifrado.subarray(12, 28));
      return { result: Buffer.concat([descifrador.update(cifrado.subarray(28)), descifrador.final()]).toString() };
    },
  };
  const directorio = await mkdtemp(join(tmpdir(), 'atlob-config-'));
  const archivo = join(directorio, 'instalacion.bin');
  try {
    assert.equal(await leerConfiguracion(archivo, proveedor), null);
    const secretos = nuevosSecretos();
    assert.equal(new Set(Object.values(secretos)).size, 5);
    assert(Object.values(secretos).every(valor => /^[a-f0-9]{64}$/.test(valor)));
    const datos = { version: 1, conexion, secretos };
    await guardarConfiguracion(archivo, datos, proveedor);
    const bytes = await readFile(archivo);
    for (const valor of [conexion.contrasena, ...Object.values(secretos)]) assert(!bytes.includes(valor));
    assert.deepEqual(await leerConfiguracion(archivo, proveedor), datos);
    await assert.rejects(guardarConfiguracion(archivo, datos, {
      ...proveedor, encryptStringAsync: async () => { throw new Error('simulación'); },
    }), /CONFIGURACION_NO_GUARDADA/);
    assert.deepEqual(await readFile(archivo), bytes);
    assert.deepEqual(await readdir(directorio), ['instalacion.bin']);
    await assert.rejects(leerConfiguracion(archivo, { isAsyncEncryptionAvailable: async () => false }), /DPAPI_NO_DISPONIBLE/);
  } finally {
    await rm(directorio, { recursive: true, force: true });
  }
});

test('normaliza URL HTTPS LAN privada, rechaza HTTP o IP pública y valida certificado CA', async () => {
  assert.deepEqual(normalizarUrlServidorHttps('192.168.1.34'), {
    servidorUrl: 'https://192.168.1.34:3443',
    host: '192.168.1.34',
    puerto: '3443',
  });
  assert.deepEqual(normalizarUrlServidorHttps('https://10.0.0.15:8443/'), {
    servidorUrl: 'https://10.0.0.15:8443',
    host: '10.0.0.15',
    puerto: '8443',
  });
  assert.deepEqual(normalizarUrlServidorHttps('https://josephmc.local:443'), {
    servidorUrl: 'https://josephmc.local:443',
    host: 'josephmc.local',
    puerto: '443',
  });

  assert.throws(() => normalizarUrlServidorHttps('http://192.168.1.34:3000'), /PROTOCOLO_HTTPS_REQUERIDO/);
  assert.throws(() => normalizarUrlServidorHttps('https://8.8.8.8:3443'), /HOST_NO_PRIVADO/);
  assert.throws(() => normalizarUrlServidorHttps('https://ejemplo.com:3443'), /HOST_NO_PRIVADO/);
  assert.throws(() => normalizarUrlServidorHttps('https://user:pass@192.168.1.34:3443'), /SERVIDOR_URL_INVALIDA/);
  assert.throws(() => validarCertificadoCaPem('-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----'), /CERTIFICADO_CA_INVALIDO/);
  assert.throws(() => validarCertificadoCaPem('texto-no-x509'), /CERTIFICADO_CA_INVALIDO/);

  const caRuta = join(process.cwd(), 'storage', 'certs', 'cliente-lan', 'atlob-lan-ca.crt');
  const caPem = existsSync(caRuta) ? readFileSync(caRuta, 'utf8') : '';
  const remoto = validarServidorRemoto({ servidorUrl: '192.168.1.34:3443', caPem });
  assert.equal(remoto.servidorUrl, 'https://192.168.1.34:3443');
  if (caPem) {
    assert(remoto.huellaSha256 && remoto.huellaSha256.length > 20);
  }

  const claveDePrueba = randomBytes(32);
  const proveedor = {
    isAsyncEncryptionAvailable: async () => true,
    async encryptStringAsync(plano) {
      const iv = randomBytes(12);
      const cifrador = createCipheriv('aes-256-gcm', claveDePrueba, iv);
      const datos = Buffer.concat([cifrador.update(plano), cifrador.final()]);
      return Buffer.concat([iv, cifrador.getAuthTag(), datos]);
    },
    async decryptStringAsync(cifrado) {
      const descifrador = createDecipheriv('aes-256-gcm', claveDePrueba, cifrado.subarray(0, 12));
      descifrador.setAuthTag(cifrado.subarray(12, 28));
      return { result: Buffer.concat([descifrador.update(cifrado.subarray(28)), descifrador.final()]).toString() };
    },
  };
  const directorio = await mkdtemp(join(tmpdir(), 'atlob-cliente-'));
  const archivo = join(directorio, 'instalacion.bin');
  try {
    const configCliente = { version: 1, modo: 'cliente', remoto };
    await guardarConfiguracion(archivo, configCliente, proveedor);
    const leida = await leerConfiguracion(archivo, proveedor);
    assert.deepEqual(leida, configCliente);
  } finally {
    await rm(directorio, { recursive: true, force: true });
  }
});
