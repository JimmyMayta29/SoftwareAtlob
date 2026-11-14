import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { initializeDatabase, closeDatabase, conContextoEmpresa, db } from '../server/config/database';
import { runMigrations } from '../server/db/migrate';
import { runSeeds } from '../server/db/seed';
import { runCatalogosSeeds } from '../server/db/seed_catalogos';
import { backupEmpresaService } from '../server/services/backupEmpresaService';
import { setupService } from '../server/services/setupService';
import { empresaRepository } from '../server/repositories/empresaRepository';
import { librosEEFFService } from '../server/services/librosEEFFService';
import { compraService } from '../server/services/compraService';
import { ventaService } from '../server/services/ventaService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const STATE_PATH = path.join(PROJECT_ROOT, 'storage', 'instancia', 'estado-piloto-e2e.json');

function assert(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) {
    throw new Error(`RESTAURACION_FALLIDA: ${mensaje}`);
  }
}

function derivarDbUrl(baseUrl: string, nombreDb: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${nombreDb}`;
  return url.toString();
}

async function main() {
  assert(fs.existsSync(STATE_PATH), `No existe estado piloto previo: ${STATE_PATH}`);
  const estadoPrevio = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  const rucObjetivo = String(estadoPrevio.ruc);
  const empresaOrigenId = String(estadoPrevio.empresaId);
  const periodoCodigo = String(estadoPrevio.periodoCodigo || '2026-09');

  const baseAppUrl = process.env.DATABASE_URL;
  assert(baseAppUrl, 'DATABASE_URL requerida en .env');
  const pilotoUrl = derivarDbUrl(baseAppUrl, 'atlob_piloto');
  const restoreTestUrl = derivarDbUrl(baseAppUrl, 'atlob_restore_test');
  const adminUrl = process.env.TEST_ADMIN_DATABASE_URL || 'postgresql://postgres:@localhost:5432/postgres';

  const adminPool = new Pool({ connectionString: adminUrl });
  let pilotoPool: Pool | null = null;
  let restoreOk = false;

  try {
    // 1. Generar respaldo desde atlob_piloto
    process.env.DATABASE_URL = pilotoUrl;
    await initializeDatabase();

    pilotoPool = new Pool({ connectionString: pilotoUrl });
    const checkPiloto = await pilotoPool.query<{ db: string }>('SELECT current_database() AS db');
    assert(checkPiloto.rows[0]?.db === 'atlob_piloto', 'La base origen debe ser exactamente atlob_piloto');

    const adminOrigenRes = await pilotoPool.query<{ id: string }>(
      `SELECT id FROM usuarios_estudio WHERE rol_global = 'ADMINISTRADOR' AND is_active = TRUE ORDER BY created_at ASC LIMIT 1`
    );
    const adminOrigenId = adminOrigenRes.rows[0]?.id;
    assert(adminOrigenId, 'No se encontró administrador origen en atlob_piloto');

    const conteosOrigen = await conContextoEmpresa(empresaOrigenId, adminOrigenId, async () => {
      const res = await db.query<{
        asientos: number;
        detalles: number;
        compras: number;
        ventas: number;
        anexos: number;
      }>(
        `SELECT
          (SELECT COUNT(*)::int FROM asientos WHERE empresa_id = $1) AS asientos,
          (SELECT COUNT(*)::int FROM asiento_detalle WHERE empresa_id = $1) AS detalles,
          (SELECT COUNT(*)::int FROM comprobantes_compra WHERE empresa_id = $1) AS compras,
          (SELECT COUNT(*)::int FROM comprobantes_venta WHERE empresa_id = $1) AS ventas,
          (SELECT COUNT(*)::int FROM anexos WHERE empresa_id = $1) AS anexos`,
        [empresaOrigenId]
      );
      return res.rows[0];
    });

    const respaldo = await conContextoEmpresa(empresaOrigenId, adminOrigenId, () =>
      backupEmpresaService.generarBackupZip(empresaOrigenId, 'MANUAL', adminOrigenId)
    );
    assert(respaldo.esParcial === false && respaldo.alcance?.modo === 'COMPLETO', 'El respaldo debe ser COMPLETO');
    assert(respaldo.archivoZipBuffer && respaldo.archivoZipBuffer.length > 0, 'El buffer cifrado del respaldo está vacío');

    const integracion = backupEmpresaService.verificarIntegridadBackup(respaldo.archivoZipBuffer);
    assert(integracion.valida, `Fallo integridad criptográfica del respaldo: ${integracion.detalle}`);

    await pilotoPool.end();
    pilotoPool = null;
    await closeDatabase();

    // 2. Crear base limpia aislada atlob_restore_test y aplicar esquema completo
    const tTotalInicio = performance.now();
    await adminPool.query('DROP DATABASE IF EXISTS atlob_restore_test WITH (FORCE)');
    await adminPool.query('CREATE DATABASE atlob_restore_test OWNER contabilidad_app');

    process.env.DATABASE_URL = restoreTestUrl;
    await initializeDatabase();
    await runMigrations();
    await runSeeds();
    await runCatalogosSeeds();

    const restorePool = new Pool({ connectionString: restoreTestUrl });
    try {
      const checkRestore = await restorePool.query<{ db: string }>('SELECT current_database() AS db');
      assert(checkRestore.rows[0]?.db === 'atlob_restore_test', 'La base destino debe ser atlob_restore_test');
    } finally {
      await restorePool.end();
    }

    // Inicializar estudio limpio en destino (simula máquina o base reconstruida sin datos operativos previos)
    const claveTemporalDestino = `RstAdm#2026!${crypto.randomBytes(6).toString('hex')}`;
    const initDestino = await setupService.inicializarEstudio({
      nombreEstudio: 'ESTUDIO RECUPERACION AISLADA S.A.C.',
      adminNombre: 'Administrador Recuperacion',
      usuario: 'admin_restore_test',
      adminPassword: claveTemporalDestino,
      adminPasswordConfirm: claveTemporalDestino,
      mfaRequerido: false,
    });
    const adminDestinoId = initDestino.usuario.id;
    const tenantDestinoId = initDestino.estudio.tenantId;

    const empresaShell = await empresaRepository.crear({
      tenantId: tenantDestinoId,
      usuarioId: adminDestinoId,
      codigoEmpresa: 'RST2026',
      ruc: rucObjetivo,
      razonSocial: estadoPrevio.razonSocial || 'COMERCIAL PILOTO CENTRALIZADO S.A.C.',
      regimenTributario: 'MYPE_TRIBUTARIO',
      domicilioFiscal: 'AV. CENTRAL 450, LIMA',
      monedaPrincipal: 'PEN',
      metodoInventario: 'PERMANENTE',
      ejercicio: 2026,
    });

    // 3. Ejecutar restauración transaccional y medir RTO
    const tRestoreInicio = performance.now();
    const resRestore = await conContextoEmpresa(empresaShell.id, adminDestinoId, () =>
      backupEmpresaService.restaurarBackup(
        empresaShell.id,
        respaldo.archivoZipBuffer!,
        rucObjetivo,
        adminDestinoId
      )
    );
    const rtoRestauracionDatosMs = Math.round(performance.now() - tRestoreInicio);
    const rtoTotalIncluyendoEsquemaMs = Math.round(performance.now() - tTotalInicio);

    assert(resRestore.exito, `La restauración retornó fallo: ${resRestore.mensaje}`);
    assert(rtoTotalIncluyendoEsquemaMs <= 3600000, `RTO excedió 60 min: ${rtoTotalIncluyendoEsquemaMs} ms`);

    // 4. Comprobar paridad de filas y cuadre S/ 0.00 en la base restaurada
    const conteosDestino = await conContextoEmpresa(empresaShell.id, adminDestinoId, async () => {
      const res = await db.query<{
        asientos: number;
        detalles: number;
        compras: number;
        ventas: number;
        anexos: number;
      }>(
        `SELECT
          (SELECT COUNT(*)::int FROM asientos WHERE empresa_id = $1) AS asientos,
          (SELECT COUNT(*)::int FROM asiento_detalle WHERE empresa_id = $1) AS detalles,
          (SELECT COUNT(*)::int FROM comprobantes_compra WHERE empresa_id = $1) AS compras,
          (SELECT COUNT(*)::int FROM comprobantes_venta WHERE empresa_id = $1) AS ventas,
          (SELECT COUNT(*)::int FROM anexos WHERE empresa_id = $1) AS anexos`,
        [empresaShell.id]
      );
      return res.rows[0];
    });

    assert(
      conteosDestino.asientos === conteosOrigen.asientos &&
        conteosDestino.detalles === conteosOrigen.detalles &&
        conteosDestino.compras === conteosOrigen.compras &&
        conteosDestino.ventas === conteosOrigen.ventas &&
        conteosDestino.anexos === conteosOrigen.anexos,
      `Desfase en conteo tras restaurar: origen=${JSON.stringify(conteosOrigen)} vs destino=${JSON.stringify(conteosDestino)}`
    );

    const reportesRestaurados = await conContextoEmpresa(empresaShell.id, adminDestinoId, async () => {
      const rc = await compraService.obtenerRegistroCompras(empresaShell.id, periodoCodigo);
      const rv = await ventaService.obtenerRegistroVentas(empresaShell.id, periodoCodigo);
      const ld = await librosEEFFService.generarLibroDiario(empresaShell.id, periodoCodigo);
      const lm = await librosEEFFService.generarLibroMayor(empresaShell.id, periodoCodigo);
      const bc = await librosEEFFService.generarBalanceComprobacion(empresaShell.id, periodoCodigo);
      const esf = await librosEEFFService.generarEstadoSituacionFinanciera(empresaShell.id, periodoCodigo);
      return { rc, rv, ld, lm, bc, esf };
    });

    assert(reportesRestaurados.rc.cuadreLibroDiario.estaCuadrado === true && reportesRestaurados.rc.cuadreLibroDiario.diferencia === 0, 'RC descuadrado post-restore');
    assert(reportesRestaurados.rv.cuadreLibroDiario.estaCuadrado === true, 'RV descuadrado post-restore');
    assert(reportesRestaurados.ld.estaBalanceado === true && reportesRestaurados.ld.totalAsientos === estadoPrevio.resumenReportes.diarioTotalAsientos, 'Diario difiere post-restore');
    assert(reportesRestaurados.lm.estaCuadrado === true, 'Mayor descuadrado post-restore');
    assert(reportesRestaurados.bc.cuadre.todoCuadrado === true, 'Balance Comprobación descuadrado post-restore');
    assert(
      reportesRestaurados.esf.estaCuadrado === true &&
        reportesRestaurados.esf.diferenciaCuadre === 0 &&
        reportesRestaurados.esf.totalActivo === estadoPrevio.resumenReportes.esfTotalActivo &&
        reportesRestaurados.esf.totalPasivoYPatrimonio === estadoPrevio.resumenReportes.esfTotalPasivoYPatrimonio,
      `ESF descuadrado o alterado post-restore: activo=${reportesRestaurados.esf.totalActivo}, dif=${reportesRestaurados.esf.diferenciaCuadre}`
    );

    restoreOk = true;
    console.log(
      JSON.stringify(
        {
          ok: true,
          ruc: rucObjetivo,
          empresaOrigenId,
          empresaDestinoId: empresaShell.id,
          tamanoBytesRespaldo: respaldo.tamanoBytes,
          hashSha256: respaldo.hashSha256,
          registrosRestaurados: resRestore.registrosRestaurados,
          conteosOrigen,
          conteosDestino,
          rtoRestauracionDatosMs,
          rtoTotalIncluyendoEsquemaMs,
          cuadrePostRestauracion: {
            comprasTotalGeneral: reportesRestaurados.rc.totales.totalGeneral,
            ventasTotalGeneral: reportesRestaurados.rv.totales.totalGeneral,
            diarioTotalDebe: reportesRestaurados.ld.totalDebe,
            diarioTotalHaber: reportesRestaurados.ld.totalHaber,
            esfTotalActivo: reportesRestaurados.esf.totalActivo,
            esfTotalPasivoYPatrimonio: reportesRestaurados.esf.totalPasivoYPatrimonio,
            esfDiferenciaCuadre: reportesRestaurados.esf.diferenciaCuadre,
          },
        },
        null,
        2
      )
    );
  } finally {
    if (pilotoPool) {
      await pilotoPool.end().catch(() => {});
    }
    await closeDatabase().catch(() => {});
    await adminPool.query('DROP DATABASE IF EXISTS atlob_restore_test WITH (FORCE)').catch(() => {});
    if (restoreOk) {
      await adminPool.query('DROP DATABASE IF EXISTS atlob_piloto WITH (FORCE)').catch(() => {});
    }
    await adminPool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error('[verificar-restauracion-aislada] ERROR:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
