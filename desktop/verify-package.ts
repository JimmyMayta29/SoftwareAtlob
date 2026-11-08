import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, extname, relative, resolve, sep } from 'node:path';
import { extractFile, listPackage, statFile } from '@electron/asar';
import { parse } from 'dotenv';
import { HUELLAS_HISTORICAS_SERVIDOR } from '../server/config/huellas-secretos';
import { MIGRATION_FILES } from '../server/db/migration-files';
import { detectar, extensionesEscaneables, huellasHistoricas } from '../server/tests/test_secretos_frontend';
import { desktopFiles } from './package-files.mjs';

const input = process.argv[2];
if (!input) throw new Error('Indica la ruta de app.asar.');
const archive = resolve(input);
const normalized = (name: string) => name.replaceAll('\\', '/').replace(/^\/+/, '');
const generated = 'desktop/generated/';
const required = new Set([
  'package.json',
  ...desktopFiles.map(name => 'desktop/' + name),
  ...MIGRATION_FILES.map(name => generated + name),
  generated + 'server.mjs',
  generated + 'dist/index.html',
]);
const assets = new Set([...extensionesEscaneables, '.woff', '.woff2', '.png', '.jpg', '.jpeg', '.webp', '.ico']);
const forbidden = /^(?:\.env(?:\..*)?|pgpass\.conf|\.pgpass|node_modules|tests?|backups?|respaldos?|.*\.(?:pfx|p12|key|pem|backup|bak|zip|7z))$/i;
const huellas = new Set([...huellasHistoricas, ...HUELLAS_HISTORICAS_SERVIDOR]);
const locales = new Set<string>();
const dotenv = new URL('../.env', import.meta.url);
if (existsSync(dotenv)) {
  const variables = parse(readFileSync(dotenv));
  for (const [key, value] of Object.entries(variables)) {
    if (!value || !/SECRET|TOKEN|PASSWORD|KEY|DATABASE_URL/i.test(key)) continue;
    locales.add(value);
    if (key.endsWith('DATABASE_URL')) {
      let password: string;
      try { password = decodeURIComponent(new URL(value).password); }
      catch { throw new Error('No se pudo verificar la configuración PostgreSQL local.'); }
      if (password) locales.add(password);
    }
  }
}
for (const value of locales) huellas.add(createHash('sha256').update(value).digest('hex'));

const files = new Set<string>();
let scanned = 0;
let problems = 0;
function fail(name: string, reason: string) {
  problems++;
  // Un nombre inesperado puede contener una credencial. No se muestra.
  console.error(reason + (required.has(name) ? ': ' + name : ''));
}
for (const name of listPackage(archive, { isPack: false })) {
  const path = normalized(name);
  const info = statFile(archive, path.replaceAll('/', sep), false);
  if (path.split('/').some(part => part === '..' || forbidden.test(part))) {
    fail(path, 'Ruta prohibida en el paquete');
    continue;
  }
  if ('files' in info) continue;
  if ('link' in info) { fail(path, 'Enlace no permitido'); continue; }
  const extension = extname(path).toLowerCase();
  if (!required.has(path) && !(path.startsWith(generated + 'dist/') && assets.has(extension) && extension !== '.sql' && extension !== '.map')) {
    fail(path, 'Archivo fuera de la lista permitida');
    continue;
  }
  files.add(path);
  const buffer = extractFile(archive, path.replaceAll('/', sep), false);
  if ([...locales].some(value => value.length >= 12 && buffer.includes(Buffer.from(value)))) {
    fail(path, 'Coincidencia con una variable privada local');
  }
  if (!extensionesEscaneables.has(extension)) continue;
  scanned++;
  const content = buffer.toString('utf8');
  const findings = detectar(path, content, huellas);
  if (/\bpostgres(?:ql)?:\/\/[^\s/'"]+:[^\s/'"]+@/i.test(content)) findings.push('URL PostgreSQL con credenciales');
  if (/-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/.test(content)) findings.push('Clave privada');
  if (findings.length) fail(path, findings.join(', '));
}
for (const name of required) if (!files.has(name)) fail(name, 'Archivo requerido ausente');

const unpacked = archive + '.unpacked';
if (existsSync(unpacked)) {
  for (const entry of readdirSync(unpacked, { recursive: true, withFileTypes: true })) {
    const path = normalized(relative(unpacked, resolve(entry.parentPath, entry.name)));
    if (entry.isSymbolicLink() || (entry.isFile() && !files.has(path))) fail(path, 'Archivo suelto no declarado en app.asar');
  }
}
if (basename(archive) !== 'app.asar') fail('', 'Nombre de archivo inesperado');
process.exitCode = problems ? 1 : 0;
console.log(`ESCANEO_PAQUETE app.asar | archivos=${files.size} | textos=${scanned} | hallazgos=${problems} | EXIT_CODE=${process.exitCode}`);
