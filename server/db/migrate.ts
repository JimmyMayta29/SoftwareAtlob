import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { db } from '../config/database';
import { runSeeds } from './seed';
import { runCatalogosSeeds } from './seed_catalogos';
import { MIGRATION_FILES } from './migration-files';

export { MIGRATION_FILES };

export async function runMigrations({ verifyOnly = false } = {}) {
  if (!db.isPostgresConnected()) {
    return;
  }
  const client = await db.getClient();
  try {
    await client.query(verifyOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    if (verifyOnly) {
      const { rows: [estado] } = await client.query("SELECT to_regclass('public.schema_migrations') AS registro");
      if (!estado.registro) throw Object.assign(new Error('Falta el registro de migraciones.'), { code: 'MIGRATIONS_PENDING' });
    } else {
      await client.query('SELECT pg_advisory_xact_lock(738291004)');
      await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (nombre TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    }
    const existing = await client.query<{ nombre: string; sha256: string }>('SELECT nombre, sha256 FROM schema_migrations');
    const applied = new Map(existing.rows.map(row => [row.nombre, row.sha256]));
    const resultados: { file: string; ms: number | null }[] = [];
    for (const file of MIGRATION_FILES) {
      const sql = fs.readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
      const hash = createHash('sha256').update(sql).digest('hex');
      const registrado = applied.get(file);
      if (registrado !== undefined) {
        // Las versiones anteriores firmaban los saltos de línea del checkout local.
        if (registrado !== hash && registrado !== createHash('sha256').update(sql.replaceAll('\n', '\r\n')).digest('hex')) {
          throw Object.assign(new Error(`MIGRACION_MODIFICADA: ${file}. Agregue una migración nueva.`), { code: 'MIGRATIONS_INVALID' });
        }
        resultados.push({ file, ms: null });
        continue;
      }
      if (verifyOnly) throw Object.assign(new Error('Faltan migraciones de la aplicación.'), { code: 'MIGRATIONS_PENDING' });
      const started = performance.now();
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (nombre, sha256) VALUES ($1, $2)', [file, hash]);
      resultados.push({ file, ms: performance.now() - started });
    }
    if (!verifyOnly) {
      await runSeeds(client);
      await runCatalogosSeeds(client);
    }
    await client.query('COMMIT');
    for (const { file, ms } of resultados) {
      console.log(`[Migración] ${file}: ${ms === null ? 'ya aplicada, huella verificada.' : `aplicada en ${ms.toFixed(1)} ms.`}`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
