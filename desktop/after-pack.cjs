const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

function afterPack({ appOutDir }) {
  const result = spawnSync(process.execPath, [
    '--import', 'tsx', join(__dirname, 'verify-package.ts'), join(appOutDir, 'resources', 'app.asar'),
  ], { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('El contenido del paquete no pasó la verificación.');
}

function beforeBuild() {
  return false;
}

module.exports = afterPack;
module.exports.afterPack = afterPack;
module.exports.beforeBuild = beforeBuild;
