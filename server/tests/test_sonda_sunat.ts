import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import type { Request, Response } from 'express';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';

const { setPostgresPool } = await import('../config/database');
const { empresaController } = await import('../controllers/empresaController');
const { sireController } = await import('../controllers/sireController');
const { asientoController } = await import('../controllers/asientoController');
const { auditoriaRepository } = await import('../repositories/auditoriaRepository');
const { AUDITORIA_LOG_CHAIN_MEMORIA, auditoriaChainService } = await import('../services/auditoriaChainService');
const { backupEmpresaService } = await import('../services/backupEmpresaService');
const { sanitizarMensaje } = await import('../utils/seguridadDatos');

function respuestaCapturada() {
  const resultado = { codigo: 0, cuerpo: undefined as unknown };
  const res = {
    status(codigo: number) {
      resultado.codigo = codigo;
      return this;
    },
    json(cuerpo: unknown) {
      resultado.cuerpo = cuerpo;
      return this;
    }
  } as Response;
  return { res, resultado };
}

const empresaId = randomUUID();
const usuarioId = randomUUID();
const marcadores = {
  usuarioSol: randomUUID(),
  claveSol: randomUUID(),
  clientIdSire: randomUUID(),
  clientSecretSire: randomUUID()
};
const request = (body: unknown = {}) => ({
  params: { id: empresaId }, body, query: {}, user: { id: usuarioId }, ip: '127.0.0.1'
}) as unknown as Request;

function sinCredenciales(contenido: unknown, superficie: string) {
  const serializado = typeof contenido === 'string' ? contenido : JSON.stringify(contenido);
  assert.ok(serializado, 'Falta contenido en ' + superficie);
  assert.ok(Object.values(marcadores).every(valor => !serializado.includes(valor)), 'Exposición en ' + superficie);
}

const { res, resultado } = respuestaCapturada();
await empresaController.actualizarCredencialesSunat(request(marcadores), res);
assert.equal(resultado.codigo, 200);
sinCredenciales(resultado.cuerpo, 'respuesta al guardar SOL');

const respuestaSire = respuestaCapturada();
await sireController.guardarConexion(request({
  ruc: '20000000001', usuarioSol: marcadores.usuarioSol, claveSol: marcadores.claveSol,
  clientId: marcadores.clientIdSire, clientSecret: marcadores.clientSecretSire, modoSimulado: true
}), respuestaSire.res);
assert.equal(respuestaSire.resultado.codigo, 200);
sinCredenciales(respuestaSire.resultado.cuerpo, 'respuesta al guardar SIRE');

const respuestaEstado = respuestaCapturada();
await sireController.obtenerEstadoConexion(request(), respuestaEstado.res);
assert.equal(respuestaEstado.resultado.codigo, 200);
assert.ok(JSON.stringify(respuestaEstado.resultado.cuerpo).includes('"configurado":true'));
sinCredenciales(respuestaEstado.resultado.cuerpo, 'estado de conexión');

const eventoHistorico = {
  id: 'auditoria-historica',
  empresaId, usuarioId, registroId: empresaId, accion: 'UPDATE',
  tablaAfectada: 'credenciales_sunat',
  datosAnteriores: { usuario_sol: marcadores.usuarioSol, nested: { client_secret: marcadores.clientSecretSire } },
  datosNuevos: { ...marcadores, cambioUsuarioSol: true, valorArbitrario: marcadores.claveSol },
  hashPrevio: '0'.repeat(64), hashActual: '1'.repeat(64), createdAt: '2026-09-01T00:00:00.000Z'
};

let parametrosPersistidos: unknown;
setPostgresPool({
  async query(sql: string, params?: unknown[]) {
    if (sql.includes('INSERT INTO auditoria')) parametrosPersistidos = params;
    return { rows: [eventoHistorico] };
  }
});
try {
  await auditoriaRepository.registrar(eventoHistorico);
  sinCredenciales(parametrosPersistidos, 'parámetros SQL de auditoría');
  const lecturaHistorica = respuestaCapturada();
  await asientoController.listarAuditoria(request(), lecturaHistorica.res);
  assert.equal(lecturaHistorica.resultado.codigo, 200);
  sinCredenciales(lecturaHistorica.resultado.cuerpo, 'auditoría histórica devuelta');
  assert.ok(JSON.stringify(lecturaHistorica.resultado.cuerpo).includes('"cambioUsuarioSol":true'));
} finally {
  setPostgresPool(null, false);
}

assert.ok((await auditoriaChainService.verificarIntegridad(empresaId)).valido, 'La escritura depurada conserva la cadena');
AUDITORIA_LOG_CHAIN_MEMORIA.push(eventoHistorico);
const backup = await backupEmpresaService.generarBackupZip(empresaId, 'MANUAL', usuarioId);
assert.ok(backup.archivoZipBuffer);
const zip = new AdmZip(backupEmpresaService.descifrarBufferAesGcm(backup.archivoZipBuffer, backupEmpresaService.derivarClave()));
const auditoria = zip.readAsText('auditoria.ndjson');
assert.ok(auditoria.includes(eventoHistorico.id), 'El respaldo conserva el evento depurado');
assert.ok(auditoria.includes('"cambioUsuarioSol":true'), 'El respaldo conserva el indicador');
for (const entrada of zip.getEntries()) {
  sinCredenciales(entrada.getData().toString('utf8') || '(vacío)', 'respaldo');
}
assert.equal(eventoHistorico.datosNuevos.usuarioSol === marcadores.usuarioSol, true, 'Se conserva intacto el evento histórico');

sinCredenciales(sanitizarMensaje(new Error(
  'Solicitud fallida: usuario_sol=' + marcadores.usuarioSol + '&client_secret=' + marcadores.clientSecretSire +
  ' {"claveSol":"' + marcadores.claveSol + '","clientIdSire":"' + marcadores.clientIdSire + '"}'
)), 'mensaje de error');

console.log('SONDA_SUNAT EXIT=0 | Respuestas, parámetros SQL, auditoría histórica y respaldo depurados.');
