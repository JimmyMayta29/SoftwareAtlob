const assert = require('node:assert/strict');
const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');
const { mkdtemp, readFile, readdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { construirUrl, guardarConfiguracion, leerConfiguracion, nuevosSecretos } = require('./desktop-config.cjs');

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
