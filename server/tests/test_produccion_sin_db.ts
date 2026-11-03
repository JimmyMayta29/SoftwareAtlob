import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { initializeDatabase, db } from '../config/database';
import { empresaRepository } from '../repositories/empresaRepository';

export async function runTestProduccionSinDb() {
  console.log('========================================================================');
  console.log('🧪 PRUEBA AUTOMATIZADA A3: NODE_ENV=production SIN DATABASE_URL');
  console.log('   (Verificación de fallo estricto y bloqueo de motor en memoria)');
  console.log('========================================================================\n');

  // 1. Probar que initializeDatabase() en producción sin DATABASE_URL lanza error
  const envOriginalNode = process.env.NODE_ENV;
  const envOriginalDb = process.env.DATABASE_URL;

  try {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = '';

    // A) Verificación directa en el inicializador de base de datos
    let lanzoErrorInit = false;
    try {
      await initializeDatabase();
    } catch (err: any) {
      lanzoErrorInit = true;
      assert.match(
        err.message,
        /DATABASE_URL_REQUERIDA/,
        'El mensaje de error debe exigir DATABASE_URL_REQUERIDA en producción'
      );
    }
    assert.equal(lanzoErrorInit, true, 'initializeDatabase() debe abortar con excepción en producción sin DATABASE_URL');
    console.log('  ✔ initializeDatabase() aborta inmediatamente con DATABASE_URL_REQUERIDA.');

    // B) Probar que empresaRepository en producción no permite fallback a memoria
    let lanzoErrorRepo = false;
    try {
      await empresaRepository.obtenerPorId('emp-demo-sac');
    } catch (err: any) {
      lanzoErrorRepo = true;
      assert.match(
        err.message,
        /DATABASE_NO_DISPONIBLE/,
        'El repositorio debe rechazar fallback en memoria en producción'
      );
    }
    assert.equal(lanzoErrorRepo, true, 'empresaRepository debe fallar en producción si no hay PostgreSQL');
    console.log('  ✔ empresaRepository rechaza fallback silencioso en memoria (DATABASE_NO_DISPONIBLE).');

    // C) Probar ejecución real de server.ts en subproceso con NODE_ENV=production
    console.log('  Ejecutando proceso server.ts con NODE_ENV=production...');
    const childExitCode = await new Promise<number>((resolve) => {
      const child = spawn('npx', ['tsx', 'server.ts'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'production',
          DATABASE_URL: '',
          PORT: '3999'
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', d => { stdout += d.toString(); });
      child.stderr.on('data', d => { stderr += d.toString(); });

      child.on('close', (code) => {
        const fullOutput = stdout + stderr;
        assert.match(
          fullOutput,
          /DATABASE_URL/,
          'La salida del servidor debe reportar error por falta de DATABASE_URL'
        );
        resolve(code ?? 1);
      });
    });

    assert.equal(childExitCode, 1, 'El servidor debe finalizar con código 1 en producción sin DATABASE_URL');
    console.log('  ✔ Proceso server.ts finalizó con código 1 y mensaje DATABASE_URL_REQUERIDA.');

  } finally {
    process.env.NODE_ENV = envOriginalNode;
    if (envOriginalDb !== undefined) {
      process.env.DATABASE_URL = envOriginalDb;
    } else {
      delete process.env.DATABASE_URL;
    }
  }

  console.log('\n✅ PRUEBA A3 COMPLETADA: Servidor y repositorios protegidos contra fallos silenciosos en producción.\n');
}

if (process.argv[1]?.endsWith('test_produccion_sin_db.ts')) {
  runTestProduccionSinDb().catch(err => {
    console.error('❌ Error en test_produccion_sin_db:', err);
    process.exit(1);
  });
}
