import { spawnSync } from 'node:child_process';
import { cp, copyFile, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { MIGRATION_FILES } from '../server/db/migration-files';
import { desktopFiles } from './package-files.mjs';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const generated = join(root, 'desktop', 'generated');
const appDir = join(root, 'build', 'desktop', 'app');
const arg = process.argv[2];
if (arg !== '--dev' && arg !== '--win') throw new Error('Indica --dev o --win.');

function node(args: string[], env = process.env) {
  const child = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);
}

async function limpiarGenerado(directorio: string) {
  const destino = await realpath(directorio).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return directorio;
    throw error;
  });
  const ruta = relative(root, destino);
  if (!ruta || ruta === '..' || ruta.startsWith('..' + sep) || isAbsolute(ruta)) {
    throw new Error('Directorio de compilación fuera del repositorio.');
  }
  await rm(directorio, { recursive: true, force: true });
}

await limpiarGenerado(generated);
await mkdir(generated, { recursive: true });

// La aplicación de escritorio usa su propio servidor, incluso si el shell configura otra API web.
const frontendEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^VITE_/i.test(key)));
node([join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', join(generated, 'dist'), '--emptyOutDir'], {
  ...frontendEnv, NODE_ENV: 'production',
});

const bundled = await build({
  absWorkingDir: root,
  entryPoints: ['server.ts'],
  outfile: join(generated, 'server.mjs'),
  platform: 'node',
  target: 'node22',
  format: 'esm',
  bundle: true,
  metafile: true,
  minifySyntax: true,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  external: ['vite', 'pg-native'],
  banner: { js: [
    "import { createRequire as desktopCreateRequire } from 'node:module';",
    "import { fileURLToPath as desktopFileURLToPath } from 'node:url';",
    "import { dirname as desktopDirname } from 'node:path';",
    'const require = desktopCreateRequire(import.meta.url);',
    'const __filename = desktopFileURLToPath(import.meta.url);',
    'const __dirname = desktopDirname(__filename);',
  ].join('\n') },
});
for (const output of Object.values(bundled.metafile.outputs)) {
  const unexpected = output.imports.filter(item => item.external && !isBuiltin(item.path) && item.path !== 'pg-native');
  if (unexpected.length) throw new Error('El servidor empaquetado tiene dependencias externas: ' + unexpected.map(item => item.path).join(', '));
}
await Promise.all(MIGRATION_FILES.map(name => copyFile(join(root, 'server', 'db', name), join(generated, name))));
node(['--check', join(generated, 'server.mjs')]);

if (arg === '--dev') {
  const { ELECTRON_RUN_AS_NODE: _runAsNode, ...devEnv } = process.env;
  node([join(root, 'node_modules/electron/cli.js'), root], devEnv);
} else {
  await limpiarGenerado(appDir);
  await mkdir(join(appDir, 'desktop'), { recursive: true });
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  await writeFile(join(appDir, 'package.json'), JSON.stringify({
    name: pkg.name,
    version: pkg.version,
    description: 'Sistema contable ATLOB ERP',
    author: 'ATLOB',
    main: pkg.main,
    type: 'module',
  }, null, 2) + '\n');
  await Promise.all(desktopFiles.map(name => copyFile(join(root, 'desktop', name), join(appDir, 'desktop', name))));
  await cp(generated, join(appDir, 'desktop', 'generated'), { recursive: true });
  node([join(root, 'node_modules/electron-builder/cli.js'), '--config', 'desktop/electron-builder.yml', '--win', '--x64', '--publish', 'never']);
}
