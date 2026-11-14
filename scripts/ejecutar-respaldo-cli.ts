import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { parse } from 'dotenv';

const envFile = fs.existsSync('.env') ? parse(fs.readFileSync('.env', 'utf8')) : {};
const args = process.argv.slice(2);

function obtenerArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
}

const usarTestDb = args.includes('--test-db') || obtenerArg('--db-env') === 'TEST_DATABASE_URL';
const dbUrl = usarTestDb
  ? process.env.TEST_DATABASE_URL || envFile.TEST_DATABASE_URL || process.env.DATABASE_URL || envFile.DATABASE_URL
  : process.env.DATABASE_URL || envFile.DATABASE_URL || process.env.TEST_DATABASE_URL || envFile.TEST_DATABASE_URL;

async function main() {
  if (!dbUrl) {
    throw new Error('DATABASE_URL_NO_CONFIGURADA: Defina DATABASE_URL o TEST_DATABASE_URL en .env antes de respaldar.');
  }

  // Asegurar que server/config/env.ts inicialice apuntando a la base seleccionada
  process.env.DATABASE_URL = dbUrl;
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = usarTestDb ? 'test' : 'production';
  }
  for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'SUNAT_ENCRYPTION_KEY', 'MFA_SEED_SECRET', 'BACKUP_ENCRYPTION_KEY']) {
    if (!process.env[key] && envFile[key]) {
      process.env[key] = envFile[key];
    }
  }

  const verificarArchivo = obtenerArg('--verificar');
  const { db, initializeDatabase, closeDatabase } = await import('../server/config/database');
  await initializeDatabase();
  if (!db.isPostgresConnected()) {
    throw new Error('POSTGRESQL_NO_CONECTADO: No fue posible conectar con PostgreSQL para ejecutar el respaldo.');
  }

  const { backupEmpresaService } = await import('../server/services/backupEmpresaService');

  try {
    if (verificarArchivo) {
      const rutaAbs = path.resolve(verificarArchivo);
      if (!fs.existsSync(rutaAbs)) {
        throw new Error(`RESPALDO_NO_ENCONTRADO: ${rutaAbs}`);
      }
      const buffer = fs.readFileSync(rutaAbs);
      const res = backupEmpresaService.verificarIntegridadBackup(buffer);
      if (!res.valida) {
        throw new Error(`INTEGRIDAD_INVALIDA: ${res.detalle}`);
      }
      const shaArchivo = crypto.createHash('sha256').update(buffer).digest('hex');
      console.log(
        JSON.stringify(
          {
            valida: true,
            archivo: rutaAbs,
            sha256: shaArchivo,
            ruc: res.manifest.ruc,
            razonSocial: res.manifest.razonSocial,
            archivosVerificados: Object.keys(res.manifest.archivos).length,
            detalle: res.detalle,
          },
          null,
          2
        )
      );
      return;
    }

    const empresaFiltro = obtenerArg('--empresa-id');
    const fechaCarpeta = new Date().toISOString().slice(0, 10);
    const outDir = path.resolve(obtenerArg('--out-dir') || path.join('storage', 'respaldos', fechaCarpeta));
    fs.mkdirSync(outDir, { recursive: true });

    const empRes = empresaFiltro
      ? await db.query<{ id: string; ruc: string; razon_social: string }>(
          `SELECT id, ruc, razon_social FROM empresas WHERE id = $1`,
          [empresaFiltro]
        )
      : await db.query<{ id: string; ruc: string; razon_social: string }>(
          `SELECT id, ruc, razon_social FROM empresas WHERE is_active = true ORDER BY created_at ASC`
        );
    const empresas = empRes.rows;

    let adminId = '00000000-0000-0000-0000-000000000001';
    const admRes = await db.query<{ id: string }>(
      `SELECT id FROM usuarios_estudio WHERE is_active = true AND rol_global = 'ADMINISTRADOR' ORDER BY created_at ASC LIMIT 1`
    );
    if (admRes.rows[0]?.id) {
      adminId = admRes.rows[0].id;
    }

    if (empresas.length === 0) {
      console.log('ℹ️ No existen empresas activas registradas para respaldar.');
      return;
    }

    const bitacoraPath = path.resolve('storage', 'respaldos', 'bitacora-respaldos.json');
    const existentes: any[] = fs.existsSync(bitacoraPath) ? JSON.parse(fs.readFileSync(bitacoraPath, 'utf8')) : [];
    const resultados: any[] = [];

    for (const emp of empresas) {
      const inicio = performance.now();
      const backup = await backupEmpresaService.generarBackupZip(emp.id, 'MANUAL', adminId);
      const buf = backup.archivoZipBuffer;
      if (!buf || buf.length === 0) {
        throw new Error(`BACKUP_VACIO para empresa ${emp.ruc}`);
      }

      const verificacion = backupEmpresaService.verificarIntegridadBackup(buf);
      if (!verificacion.valida) {
        throw new Error(`VERIFICACION_POST_RESPALDO_FALLIDA (${emp.ruc}): ${verificacion.detalle}`);
      }

      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const nombreArchivo = `${emp.ruc}_${stamp}.atlob.bak`;
      const rutaArchivo = path.join(outDir, nombreArchivo);
      fs.writeFileSync(rutaArchivo, buf);
      fs.writeFileSync(`${rutaArchivo}.sha256`, `${backup.hashSha256}  ${nombreArchivo}\n`, 'utf8');

      const duracionMs = Number((performance.now() - inicio).toFixed(2));
      resultados.push({
        fechaUtc: new Date().toISOString(),
        empresaId: emp.id,
        ruc: emp.ruc,
        razonSocial: emp.razon_social,
        archivo: rutaArchivo,
        tamanoBytes: backup.tamanoBytes,
        hashSha256: backup.hashSha256,
        archivosVerificados: Object.keys(verificacion.manifest.archivos).length,
        duracionMs,
        verificado: true,
      });
    }

    const actualizada = [...resultados, ...existentes].slice(0, 200);
    fs.writeFileSync(bitacoraPath, JSON.stringify(actualizada, null, 2), 'utf8');

    console.log(`✅ Respaldo completado y verificado para ${resultados.length} empresa(s):`);
    console.log(JSON.stringify(resultados, null, 2));
  } finally {
    await closeDatabase();
  }
}

main().catch(err => {
  console.error('❌ ERROR EN RESPALDO CLI:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
