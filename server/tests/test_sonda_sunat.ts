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
const {
  AUDITORIA_LOG_CHAIN_MEMORIA,
  GENESIS_HASH,
  auditoriaChainService,
} = await import('../services/auditoriaChainService');
const { backupEmpresaService } = await import('../services/backupEmpresaService');
const {
  esCampoPermitidoAuditoria,
  filtrarDetalleAuditoria,
  sanitizarDatos,
  sanitizarMensaje,
} = await import('../utils/seguridadDatos');

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
    },
  } as Response;
  return { res, resultado };
}

const empresaId = randomUUID();
const usuarioId = randomUUID();
const jwtSimulado = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3ItMDEifQ.firmaSimuladaPrueba01';
const marcadores = {
  usuarioSol: `MODDATOS_${randomUUID()}`,
  claveSol: `CLAVE_SOL_${randomUUID()}`,
  clientIdSire: `SIRE_ID_${randomUUID()}`,
  clientSecretSire: `SIRE_SEC_${randomUUID()}`,
  dbPassword: `PG_PASS_${randomUUID()}`,
  bearerToken: `TOK_SUNAT_${randomUUID()}`,
  campoNoListado: `NO_LISTADO_${randomUUID()}`,
};

const request = (body: unknown = {}) =>
  ({
    params: { id: empresaId },
    body,
    query: {},
    user: { id: usuarioId, email: 'auditor@estudio.pe', rolGlobal: 'ADMINISTRADOR' },
    ip: '127.0.0.1',
  }) as unknown as Request;

function sinSecretosNiCamposAjenos(contenido: unknown, superficie: string) {
  const serializado = typeof contenido === 'string' ? contenido : JSON.stringify(contenido);
  assert.ok(serializado !== undefined, `Falta contenido en ${superficie}`);
  for (const [nombre, valor] of Object.entries(marcadores)) {
    assert.ok(!serializado.includes(valor), `Exposición de ${nombre} en ${superficie}`);
  }
  assert.ok(!serializado.includes(jwtSimulado), `Exposición de JWT en ${superficie}`);
}

// 1. Controladores SUNAT / SIRE nunca devuelven credenciales
const { res, resultado } = respuestaCapturada();
await empresaController.actualizarCredencialesSunat(
  request({
    usuarioSol: marcadores.usuarioSol,
    claveSol: marcadores.claveSol,
    clientIdSire: marcadores.clientIdSire,
    clientSecretSire: marcadores.clientSecretSire,
  }),
  res
);
assert.equal(resultado.codigo, 200);
sinSecretosNiCamposAjenos(resultado.cuerpo, 'respuesta al guardar SOL');

const respuestaSire = respuestaCapturada();
await sireController.guardarConexion(
  request({
    ruc: '20000000001',
    usuarioSol: marcadores.usuarioSol,
    claveSol: marcadores.claveSol,
    clientId: marcadores.clientIdSire,
    clientSecret: marcadores.clientSecretSire,
    modoSimulado: true,
  }),
  respuestaSire.res
);
assert.equal(respuestaSire.resultado.codigo, 200);
sinSecretosNiCamposAjenos(respuestaSire.resultado.cuerpo, 'respuesta al guardar SIRE');

const respuestaEstado = respuestaCapturada();
await sireController.obtenerEstadoConexion(request(), respuestaEstado.res);
assert.equal(respuestaEstado.resultado.codigo, 200);
assert.ok(JSON.stringify(respuestaEstado.resultado.cuerpo).includes('"configurado":true'));
sinSecretosNiCamposAjenos(respuestaEstado.resultado.cuerpo, 'estado de conexión');

// 2. Verificación de lista blanca estricta (1ra barrera) + regex (2da barrera)
assert.equal(esCampoPermitidoAuditoria('empresas', 'razonSocial'), true);
assert.equal(esCampoPermitidoAuditoria('empresas', 'metodoInventario'), true);
assert.equal(esCampoPermitidoAuditoria('empresas', 'notasInternasNoAutorizadas'), false);
assert.equal(esCampoPermitidoAuditoria('empresas', 'claveSol'), false);
assert.equal(esCampoPermitidoAuditoria('asientos', 'campoArbitrarioInyectado'), false);
assert.equal(esCampoPermitidoAuditoria('credenciales_sunat', 'cambioUsuarioSol'), true);
assert.equal(esCampoPermitidoAuditoria('credenciales_sunat', 'usuarioSol'), false);

// Payload realista 1: Actualización de empresa con campos de negocio + credenciales + campo no listado + glosa con token
const payloadActualizacionEmpresa = {
  id: empresaId,
  ruc: '20601234567',
  razonSocial: 'COMERCIAL ANDINA S.A.C.',
  regimenTributario: 'REGIMEN_GENERAL',
  metodoInventario: 'PERMANENTE',
  usuarioSol: marcadores.usuarioSol,
  claveSol: marcadores.claveSol,
  clientSecretSire: marcadores.clientSecretSire,
  notasInternasNoAutorizadas: marcadores.campoNoListado,
  glosa: `Actualización con Authorization: Bearer ${marcadores.bearerToken} y token ${jwtSimulado}`,
};
const empresaDepurada = filtrarDetalleAuditoria('empresas', payloadActualizacionEmpresa) as Record<string, unknown>;
assert.equal(empresaDepurada.razonSocial, 'COMERCIAL ANDINA S.A.C.');
assert.equal(empresaDepurada.metodoInventario, 'PERMANENTE');
assert.equal('notasInternasNoAutorizadas' in empresaDepurada, false);
assert.equal('usuarioSol' in empresaDepurada, false);
sinSecretosNiCamposAjenos(empresaDepurada, 'payload actualización de empresa');
console.log(
  `PAYLOAD_1_EMPRESA | campos_conservados=${Object.keys(empresaDepurada).join(',')} | lista_blanca=OK | regex_segunda_barrera=OK`
);

// Payload realista 2: Error de gateway SUNAT / SIRE
const errorGatewaySunat = new Error(
  `HTTP 401 SUNAT SIRE OAuth2: Authorization: Bearer ${marcadores.bearerToken} jwt=${jwtSimulado} ` +
    `body={"usuario_sol":"${marcadores.usuarioSol}","clave_sol":"${marcadores.claveSol}","client_secret":"${marcadores.clientSecretSire}"}`
);
const gatewaySanitizado = sanitizarMensaje(errorGatewaySunat);
sinSecretosNiCamposAjenos(gatewaySanitizado, 'payload error de gateway SUNAT');
assert.ok(gatewaySanitizado.includes('[REDACTADO]'));
console.log(`PAYLOAD_2_GATEWAY_SUNAT | salida="${gatewaySanitizado}"`);

// Payload realista 3: Error de base de datos PostgreSQL con URL de conexión y PGPASSWORD
const errorBaseDatos = new Error(
  `fallo de conexión a postgresql://contabilidad_app:${marcadores.dbPassword}@127.0.0.1:5432/sistema_contable?sslmode=disable ` +
    `con PGPASSWORD=${marcadores.dbPassword} y DATABASE_URL=postgres://contabilidad_app:${marcadores.dbPassword}@localhost:5432/atlob_test`
);
const dbSanitizado = sanitizarMensaje(errorBaseDatos);
sinSecretosNiCamposAjenos(dbSanitizado, 'payload error de base de datos');
assert.ok(dbSanitizado.includes('postgresql://[REDACTADO]@127.0.0.1:5432/sistema_contable'));
console.log(`PAYLOAD_3_ERROR_BD | salida="${dbSanitizado}"`);

// Payload realista 4: Log del servidor ante fallo de persistencia y objeto anidado de diagnóstico
const erroresCapturadosLog: string[] = [];
const consoleErrorOriginal = console.error;
console.error = (...args: unknown[]) => {
  erroresCapturadosLog.push(args.map(a => String(a)).join(' '));
};
let parametrosPersistidos: unknown;
const datosHistoricosCrudos = {
  usuarioSol: marcadores.usuarioSol,
  claveSol: marcadores.claveSol,
  clientIdSire: marcadores.clientIdSire,
  clientSecretSire: marcadores.clientSecretSire,
  cambioUsuarioSol: true,
  valorArbitrario: marcadores.campoNoListado,
};
const idBloqueHistorico = `aud-legado-${empresaId.slice(0, 8)}`;
const hashBloqueHistorico = auditoriaChainService.calcularHash(
  idBloqueHistorico,
  empresaId,
  usuarioId,
  'credenciales_sunat',
  empresaId,
  'UPDATE',
  datosHistoricosCrudos,
  GENESIS_HASH
);
const eventoHistoricoSellado = {
  id: idBloqueHistorico,
  empresaId,
  usuarioId,
  registroId: empresaId,
  accion: 'UPDATE',
  tablaAfectada: 'credenciales_sunat',
  datosAnteriores: { usuario_sol: marcadores.usuarioSol, nested: { client_secret: marcadores.clientSecretSire } },
  datosNuevos: datosHistoricosCrudos,
  hashPrevio: GENESIS_HASH,
  hashActual: hashBloqueHistorico,
  createdAt: '2026-09-01T00:00:00.000Z',
};

try {
  // Simular primero un fallo de BD con credenciales en el error para verificar el log del servidor
  setPostgresPool({
    async query() {
      throw new Error(
        `FATAL 28P01 postgresql://contabilidad_app:${marcadores.dbPassword}@127.0.0.1:5432/sistema_contable clave_sol=${marcadores.claveSol}`
      );
    },
  });
  // Limpiar cualquier entrada previa de empresaId e insertar el bloque histórico sellado original
  for (let i = AUDITORIA_LOG_CHAIN_MEMORIA.length - 1; i >= 0; i--) {
    if (AUDITORIA_LOG_CHAIN_MEMORIA[i].empresaId === empresaId) AUDITORIA_LOG_CHAIN_MEMORIA.splice(i, 1);
  }
  AUDITORIA_LOG_CHAIN_MEMORIA.push(eventoHistoricoSellado);

  await auditoriaRepository.registrar({
    empresaId,
    usuarioId,
    tablaAfectada: 'empresas',
    registroId: empresaId,
    accion: 'UPDATE',
    datosNuevos: payloadActualizacionEmpresa,
  });
} finally {
  console.error = consoleErrorOriginal;
  setPostgresPool(null, false);
}

assert.ok(erroresCapturadosLog.length >= 1, 'Debe haberse emitido log de error del servidor');
for (const lineaLog of erroresCapturadosLog) {
  sinSecretosNiCamposAjenos(lineaLog, 'log del servidor');
}
const logObjetoSanitizado = sanitizarDatos({
  nivel: 'ERROR',
  authorization: `Bearer ${marcadores.bearerToken}`,
  database_url: `postgresql://contabilidad_app:${marcadores.dbPassword}@127.0.0.1:5432/sistema_contable`,
  mensaje: `Fallo con token ${jwtSimulado}`,
});
sinSecretosNiCamposAjenos(logObjetoSanitizado, 'objeto estructurado de log del servidor');
console.log(`PAYLOAD_4_LOG_SERVIDOR | lineas_capturadas=${erroresCapturadosLog.length} | salida="${erroresCapturadosLog[0]}"`);

// 3. Verificación de la cadena de hash ANTES de leer y exportar auditoría histórica
const integridadAntes = await auditoriaChainService.verificarIntegridad(empresaId);
assert.equal(integridadAntes.valido, true, 'La cadena histórica + nueva debe ser válida antes de leer/exportar');
assert.equal(integridadAntes.totalRegistros, 2, 'Deben existir exactamente 2 bloques en la cadena');
console.log(
  `CADENA_HASH_ANTES | valido=${integridadAntes.valido} | totalRegistros=${integridadAntes.totalRegistros} | ultimoHash=${integridadAntes.ultimoHash}`
);

// Payload realista 5 y 6: Lectura HTTP / Exportación de auditoría y Respaldo ZIP cifrado
setPostgresPool({
  async query(sql: string, params?: unknown[]) {
    if (sql.includes('INSERT INTO auditoria')) parametrosPersistidos = params;
    return { rows: [eventoHistoricoSellado] };
  },
});
let lecturaHttpCuerpo: unknown;
try {
  await auditoriaRepository.registrar(eventoHistoricoSellado);
  sinSecretosNiCamposAjenos(parametrosPersistidos, 'parámetros SQL de auditoría');
  const lecturaHistorica = respuestaCapturada();
  await asientoController.listarAuditoria(request(), lecturaHistorica.res);
  assert.equal(lecturaHistorica.resultado.codigo, 200);
  lecturaHttpCuerpo = lecturaHistorica.resultado.cuerpo;
  sinSecretosNiCamposAjenos(lecturaHttpCuerpo, 'auditoría histórica devuelta por HTTP');
  assert.ok(JSON.stringify(lecturaHttpCuerpo).includes('"cambioUsuarioSol":true'));
} finally {
  setPostgresPool(null, false);
}

const exportacionAuditoria = await auditoriaChainService.exportarPorEmpresa(empresaId);
assert.equal(exportacionAuditoria.length, 2);
sinSecretosNiCamposAjenos(exportacionAuditoria, 'exportación directa de auditoría');
assert.deepEqual(exportacionAuditoria[0].datosNuevos, { cambioUsuarioSol: true });
console.log(
  `PAYLOAD_6_EXPORTACION_AUDITORIA | registros=${exportacionAuditoria.length} | bloque_historico_proyectado=${JSON.stringify(exportacionAuditoria[0].datosNuevos)}`
);

const backup = await backupEmpresaService.generarBackupZip(empresaId, 'MANUAL', usuarioId);
assert.ok(backup.archivoZipBuffer);
const zip = new AdmZip(
  backupEmpresaService.descifrarBufferAesGcm(backup.archivoZipBuffer, backupEmpresaService.derivarClave())
);
const auditoriaNdjson = zip.readAsText('auditoria.ndjson');
assert.ok(auditoriaNdjson.includes(idBloqueHistorico), 'El respaldo conserva el bloque histórico proyectado');
assert.ok(auditoriaNdjson.includes('"cambioUsuarioSol":true'), 'El respaldo conserva el indicador permitido');
for (const entrada of zip.getEntries()) {
  sinSecretosNiCamposAjenos(entrada.getData().toString('utf8') || '(vacío)', `respaldo:${entrada.entryName}`);
}
console.log(
  `PAYLOAD_5_RESPALDO | entradas_zip=${zip.getEntries().length} | secretos_filtrados=0 | auditoria_lineas=${auditoriaNdjson.trim().split('\n').length}`
);

// 4. Verificación de la cadena de hash DESPUÉS de leer, respaldar y exportar (sin reescritura de filas)
assert.equal(
  eventoHistoricoSellado.datosNuevos.usuarioSol === marcadores.usuarioSol,
  true,
  'La fila histórica almacenada no fue reescrita'
);
const integridadDespues = await auditoriaChainService.verificarIntegridad(empresaId);
// Nota: generarBackupZip registró 1 evento adicional ('backups_empresa') al final de la cadena
assert.equal(integridadDespues.valido, true, 'La cadena de hash permanece 100% íntegra después de leer y exportar');
assert.equal(integridadDespues.totalRegistros, 3, 'El respaldo agregó su propio bloque sin alterar los 2 bloques previos');
assert.equal(AUDITORIA_LOG_CHAIN_MEMORIA.find(x => x.id === idBloqueHistorico)?.hashActual, hashBloqueHistorico);
console.log(
  `CADENA_HASH_DESPUES | valido=${integridadDespues.valido} | totalRegistros=${integridadDespues.totalRegistros} | hash_bloque_0_intacto=${AUDITORIA_LOG_CHAIN_MEMORIA.find(x => x.id === idBloqueHistorico)?.hashActual === hashBloqueHistorico} | ultimoHash=${integridadDespues.ultimoHash}`
);

console.log('SONDA_SUNAT EXIT=0 | Lista blanca, segunda barrera regex, 6 payloads realistas y cadena de hash verificados.');
