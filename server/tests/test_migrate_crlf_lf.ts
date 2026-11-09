import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export function calcularHashesMigracion(rawContent: string) {
  const normalizedLF = rawContent.replaceAll('\r', '');
  const normalizedCRLF = normalizedLF.replaceAll('\n', '\r\n');
  const hashLF = createHash('sha256').update(normalizedLF).digest('hex');
  const hashCRLF = createHash('sha256').update(normalizedCRLF).digest('hex');
  const hashRaw = createHash('sha256').update(rawContent).digest('hex');

  return { hashLF, hashCRLF, hashRaw };
}

export function validarHashRegistrado(registrado: string, rawContentEnDisco: string): boolean {
  const { hashLF, hashCRLF, hashRaw } = calcularHashesMigracion(rawContentEnDisco);
  return registrado === hashLF || registrado === hashCRLF || registrado === hashRaw;
}

export async function testMigrateCrlfLf() {
  console.log('--- TEST MIGRACIONES: NORMALIZACION CRLF / LF Y HASHES HISTORICOS ---');

  const sqlOriginal = 'CREATE TABLE prueba (\n  id TEXT PRIMARY KEY,\n  valor NUMERIC(12,2)\n);\n';
  const sqlCRLF = 'CREATE TABLE prueba (\r\n  id TEXT PRIMARY KEY,\r\n  valor NUMERIC(12,2)\r\n);\r\n';

  const hashDeLF = createHash('sha256').update(sqlOriginal).digest('hex');
  const hashDeCRLF = createHash('sha256').update(sqlCRLF).digest('hex');

  assert.notEqual(hashDeLF, hashDeCRLF, 'Los hashes directos sin normalizar deben diferir debido a los bytes \\r');

  // 1. Base de datos tiene hashLF registrado, pero el checkout local en Windows tiene CRLF
  const coincideLFEnDiscoCRLF = validarHashRegistrado(hashDeLF, sqlCRLF);
  assert.equal(coincideLFEnDiscoCRLF, true, 'Debe aceptar hash LF histórico aunque el archivo en disco tenga CRLF');

  // 2. Base de datos tiene hashCRLF registrado, pero el checkout local tiene LF
  const coincideCRLFEnDiscoLF = validarHashRegistrado(hashDeCRLF, sqlOriginal);
  assert.equal(coincideCRLFEnDiscoLF, true, 'Debe aceptar hash CRLF histórico aunque el archivo en disco tenga LF');

  // 3. Contenido realmente alterado (modificación sustancial de SQL)
  const sqlModificado = 'CREATE TABLE prueba (\n  id TEXT PRIMARY KEY,\n  valor NUMERIC(18,4)\n);\n';
  const coincideAlterado = validarHashRegistrado(hashDeLF, sqlModificado);
  assert.equal(coincideAlterado, false, 'Debe rechazar cuando el contenido de la migración fue alterado');

  console.log('✔ Prueba de invariancia CRLF / LF completada con éxito.');
}

testMigrateCrlfLf().catch((err) => {
  console.error(err);
  process.exit(1);
});
