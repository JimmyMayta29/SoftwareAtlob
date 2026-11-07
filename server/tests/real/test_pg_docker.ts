import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'dotenv';

const clavesLocales = new Set<string>();
if (existsSync('.env')) {
  const valores = parse(readFileSync('.env'));
  for (const valor of Object.values(valores)) clavesLocales.add(valor);
  for (const nombre of ['DATABASE_URL', 'TEST_DATABASE_URL']) {
    if (!valores[nombre]) continue;
    try {
      clavesLocales.add(decodeURIComponent(new URL(valores[nombre]).password));
    } catch {
      throw new Error(`No se pudo comprobar la contraseña local de ${nombre}`);
    }
  }
}

const claveAdministracion = randomBytes(32).toString('hex');
const claveAplicacion = randomBytes(32).toString('hex');
if (claveAdministracion === claveAplicacion || clavesLocales.has(claveAdministracion) || clavesLocales.has(claveAplicacion)) {
  throw new Error('Las contraseñas de pruebas deben ser distintas entre sí y de la configuración local.');
}
console.log('Contraseñas PostgreSQL de pruebas generadas y verificadas como distintas de la configuración local.');

const entorno = {
  ...process.env,
  ATLOB_TEST_ADMIN_PASSWORD: claveAdministracion,
  ATLOB_TEST_APP_PASSWORD: claveAplicacion,
};
const proyecto = 'atlob_pg_test_' + randomBytes(6).toString('hex');
const compose = (args: string[], capturar = false) => spawnSync(
  'docker', ['compose', '-f', 'docker-compose.test.yml', '-p', proyecto, ...args],
  { env: entorno, encoding: 'utf8', stdio: capturar ? 'pipe' : 'inherit', windowsHide: true }
);

try {
  if (compose(['up', '-d', '--wait', '--wait-timeout', '60']).status !== 0) {
    throw new Error('No se pudo iniciar el PostgreSQL de pruebas.');
  }
  const consultaPuerto = compose(['port', 'postgres-test', '5432'], true);
  const puerto = consultaPuerto.stdout?.trim().match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  if (consultaPuerto.status !== 0 || !puerto) throw new Error('No se encontró el puerto del PostgreSQL de pruebas.');

  const resultado = spawnSync(process.execPath, ['--import', 'tsx', 'server/tests/real/test_pg_rls_planillas.ts'], {
    env: { ...process.env, TEST_DATABASE_URL: `postgresql://contabilidad_app:${claveAplicacion}@127.0.0.1:${puerto}/atlob_test` },
    stdio: 'inherit',
    windowsHide: true,
  });
  process.exitCode = resultado.status ?? 1;
} finally {
  const limpieza = compose(['down', '--volumes']);
  if (limpieza.status !== 0 && !process.exitCode) process.exitCode = 1;
}
