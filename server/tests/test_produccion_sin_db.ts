import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { initializeDatabase } from '../config/database';
import { NOMBRES_SECRETOS_SERVIDOR } from '../config/env';
import { empresaRepository } from '../repositories/empresaRepository';

const fuentesHistoricas = {
  JWT_SECRET: ['server/config/env.ts', /JWT_SECRET:.*?\.default\(['"]([^'"]+)/],
  JWT_REFRESH_SECRET: ['server/config/env.ts', /JWT_REFRESH_SECRET:.*?\.default\(['"]([^'"]+)/],
  SUNAT_ENCRYPTION_KEY: ['server/config/env.ts', /SUNAT_ENCRYPTION_KEY:.*?\.default\(['"]([^'"]+)/],
  MFA_SEED_SECRET: ['server/services/authJwtService.ts', /const MFA_SECRET_ADMIN_DEMO = ['"]([^'"]+)/],
  BACKUP_ENCRYPTION_KEY: ['server/services/backupEmpresaService.ts', /const CLAVE_DERIVACION_DEFAULT = ['"]([^'"]+)/],
} as const;

export async function runTestProduccionSinDb() {
  const envOriginalNode = process.env.NODE_ENV;
  const envOriginalDb = process.env.DATABASE_URL;

  try {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = '';
    await assert.rejects(initializeDatabase, /DATABASE_URL_REQUERIDA/);
    await assert.rejects(() => empresaRepository.obtenerPorId('emp-demo-sac'), /DATABASE_NO_DISPONIBLE/);
    console.log('A3: PostgreSQL obligatorio y sin fallback en producción.');

    const secretosValidos = Object.fromEntries(
      NOMBRES_SECRETOS_SERVIDOR.map(nombre => [nombre, randomBytes(32).toString('hex')])
    );
    const entornoProduccion: NodeJS.ProcessEnv = {
      ...process.env,
      ...secretosValidos,
      DOTENV_CONFIG_PATH: '',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://127.0.0.1/atlob_test',
    };

    const ejecutar = (args: string[], variables: Record<string, string | undefined>) => {
      const envHijo: NodeJS.ProcessEnv = { ...entornoProduccion };
      for (const [k, v] of Object.entries(variables)) {
        if (v === undefined) delete envHijo[k];
        else envHijo[k] = v;
      }
      return spawnSync(
        process.execPath,
        ['--import', 'tsx', ...args],
        { env: envHijo, encoding: 'utf8', timeout: 20000, windowsHide: true }
      );
    };

    const serverSinDb = ejecutar(['server.ts'], { DATABASE_URL: '' });
    assert.equal(serverSinDb.status, 1, 'El servidor debe terminar si falta DATABASE_URL');
    assert(/DATABASE_URL_REQUERIDA/.test(serverSinDb.stderr), 'Debe indicar el problema de configuración');
    const validarConfiguracion = ['--input-type=module', '-e', "await import('./server/config/env.ts');"];
    assert.equal(ejecutar(validarConfiguracion, {}).status, 0, 'La configuración válida debe cargar');

    for (const nombre of NOMBRES_SECRETOS_SERVIDOR) {
      const [ruta, patron] = fuentesHistoricas[nombre];
      const historico = execFileSync('git', ['show', `392737c:${ruta}`], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
      }).match(patron)?.[1];
      assert(historico, `El fixture histórico de ${nombre} debe existir`);

      const casos: [string, string, string | undefined][] = [
        ['AUSENTE (variable no definida)', 'AUSENTE', undefined],
        ['CORTO (menos de 32 bytes)', 'FORMATO_32_BYTES', randomBytes(16).toString('hex')],
        ['BAJA_DIVERSIDAD', 'BAJA_DIVERSIDAD', 'ab'.repeat(32)],
        ['HISTORICO (huella conocida)', 'HISTORICO', historico],
      ];

      for (const [etiqueta, motivoEsperado, valor] of casos) {
        const resultado = ejecutar(['server.ts'], { [nombre]: valor });
        assert.equal(resultado.status, 1, `El arranque de server.ts debe abortar para ${nombre} (${etiqueta})`);
        assert(resultado.stderr.includes(`SECRETO_CONFIGURACION_INVALIDO: ${nombre} (${motivoEsperado})`), 'Debe indicar el motivo exacto del rechazo');
        assert(!valor || !(resultado.stdout + resultado.stderr).includes(valor), 'El diagnóstico debe omitir el valor del secreto');
        const lineaError = resultado.stderr.split(/\r?\n/).find(l => l.trim().startsWith('Error: SECRETO_CONFIGURACION_INVALIDO'))?.trim() ?? '';
        console.log(`A3: server.ts [NODE_ENV=production] ${nombre} | caso=${etiqueta} -> ${lineaError} | EXIT_CODE=${resultado.status}`);
      }
    }

    for (const modo of ['development', 'test']) {
      const script = [
        "const {createHash}=await import('node:crypto');",
        "const {env,NOMBRES_SECRETOS_SERVIDOR}=await import('./server/config/env.ts');",
        "const secretos=NOMBRES_SECRETOS_SERVIDOR.map(n=>env[n]);",
        "if (!secretos.every(s=>/^[0-9a-f]{64}$/.test(s))) process.exit(1);",
        "console.log(JSON.stringify(secretos.map(s=>createHash('sha256').update(s).digest('hex'))));",
      ].join('');
      const variables = { NODE_ENV: modo, ...Object.fromEntries(NOMBRES_SECRETOS_SERVIDOR.map(nombre => [nombre, ''])) };
      const primero = ejecutar(['--input-type=module', '-e', script], variables);
      const segundo = ejecutar(['--input-type=module', '-e', script], variables);
      assert.equal(primero.status, 0);
      assert.equal(segundo.status, 0);
      const huellas = JSON.parse(primero.stdout) as string[];
      const otras = JSON.parse(segundo.stdout) as string[];
      assert.equal(huellas.length, NOMBRES_SECRETOS_SERVIDOR.length);
      assert(huellas.every((huella, indice) => huella !== otras[indice]), 'Los secretos deben ser efímeros por proceso');
      assert(/Secretos efímeros/.test(primero.stderr), 'El proceso debe advertir de las claves efímeras');
      assert(!/[0-9a-f]{64}/i.test(primero.stderr), 'El aviso debe omitir los valores');
      console.log(`A3: ${modo} con secretos efímeros distintos por proceso -> EXIT_CODE=0`);
    }
  } finally {
    if (envOriginalNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = envOriginalNode;
    if (envOriginalDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = envOriginalDb;
  }
  console.log('PRUEBA A3 COMPLETADA');
}

if (process.argv[1]?.endsWith('test_produccion_sin_db.ts')) {
  runTestProduccionSinDb().catch(err => {
    console.error('Error en test_produccion_sin_db:', err.message);
    process.exitCode = 1;
  });
}
