import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { apiRoutes } from '../routes';
import {
  HELPERS_SIN_PERSISTENCIA,
  MODULOS_SOLO_MEMORIA,
  esPeticionEscrituraBloqueableMemoria,
  obtenerEstadoPersistencia,
  tieneConsultasPostgreSQL
} from '../config/persistencia';
import { authJwtService, sembrarUsuariosPrueba } from '../services/authJwtService';
import { DATOS_EMPRESA_DEMO, EMPRESAS_STORE } from '../repositories/empresaRepository';
import {
  MENSAJE_DATOS_TEMPORALES,
  esEntornoAvisoPersistencia,
  moduloTemporalParaVista
} from '../../src/components/common/BannerPersistenciaTemporal';
import type { EstadoPersistenciaSistema } from '../../src/api/sistemaApi';

function validarSincroniaServiciosSimulados(
  servicios: Array<{ archivo: string; codigoFuente: string }>
): string[] {
  const errores: string[] = [];
  const soloMemoriaSet = new Set(MODULOS_SOLO_MEMORIA.flatMap((m) => [...m.servicios]));
  const helpersSet = new Set(HELPERS_SIN_PERSISTENCIA.map((h) => h.servicio));

  for (const { archivo, codigoFuente } of servicios) {
    const usaPg = tieneConsultasPostgreSQL(codigoFuente);
    if (soloMemoriaSet.has(archivo) && usaPg) {
      errores.push(`SERVICIO_EN_MEMORIA_YA_USA_PG:${archivo}`);
    }
    if (!usaPg && !soloMemoriaSet.has(archivo) && !helpersSet.has(archivo)) {
      errores.push(`SERVICIO_SIN_PG_NO_REGISTRADO:${archivo}`);
    }
    if (soloMemoriaSet.has(archivo) && helpersSet.has(archivo)) {
      errores.push(`SERVICIO_DUPLICADO_MEMORIA_HELPER:${archivo}`);
    }
  }
  return errores;
}

async function main() {
  console.log('🧪 Ejecutando Suite 37: Transparencia de persistencia y respaldo parcial (M1 + M2)...');

  const nodeEnvOriginal = process.env.NODE_ENV;
  const bloqueoOriginal = process.env.ATLOB_BLOQUEAR_MEMORIA;
  const desktopOriginal = process.env.ATLOB_DESKTOP;

  // 1) M1.1: Registro único y regla de sincronía contra server/services/
  const dirServicios = path.join(process.cwd(), 'server', 'services');
  const archivosServicios = fs
    .readdirSync(dirServicios)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .sort();
  const catalogoReal = archivosServicios.map((archivo) => ({
    archivo,
    codigoFuente: fs.readFileSync(path.join(dirServicios, archivo), 'utf8')
  }));

  const erroresReales = validarSincroniaServiciosSimulados(catalogoReal);
  assert.deepEqual(
    erroresReales,
    [],
    `La lista declarativa server/config/persistencia.ts debe estar sincronizada: ${erroresReales.join(', ')}`
  );

  const soloMemoriaSet = new Set(MODULOS_SOLO_MEMORIA.flatMap((m) => [...m.servicios]));
  const helpersSet = new Set(HELPERS_SIN_PERSISTENCIA.map((h) => h.servicio));
  for (const srv of [...soloMemoriaSet, ...helpersSet]) {
    assert.ok(archivosServicios.includes(srv), `El servicio registrado ${srv} debe existir en server/services/`);
  }

  // Simular fallos exigidos por M1.1
  const errorSiUsaPg = validarSincroniaServiciosSimulados([
    {
      archivo: 'planillaService.ts',
      codigoFuente: `import { db } from '../config/database'; export async function x() { return db.query('SELECT 1'); }`
    }
  ]);
  assert.equal(errorSiUsaPg.length, 1);
  assert.match(errorSiUsaPg[0], /SERVICIO_EN_MEMORIA_YA_USA_PG:planillaService\.ts/);

  const errorSiFaltaRegistrar = validarSincroniaServiciosSimulados([
    {
      archivo: 'nuevoServicioMemoriaService.ts',
      codigoFuente: `export const DATA_MEMORIA: any[] = []; // db.query('en comentario no cuenta');`
    }
  ]);
  assert.equal(errorSiFaltaRegistrar.length, 1);
  assert.match(errorSiFaltaRegistrar[0], /SERVICIO_SIN_PG_NO_REGISTRADO:nuevoServicioMemoriaService\.ts/);

  // 2) M1.2 + M1.4: Endpoints /health, /sistema/persistencia y middleware ATLOB_BLOQUEAR_MEMORIA
  const passwordFixture = randomBytes(24).toString('hex');
  sembrarUsuariosPrueba(passwordFixture);
  if (!EMPRESAS_STORE.some((e) => e.id === 'emp-01')) {
    EMPRESAS_STORE.push({ ...DATOS_EMPRESA_DEMO, id: 'emp-01', esDemo: false });
  }
  const contador = await authJwtService.login('contador@atlob.pe', passwordFixture);

  const app = express();
  app.use(express.json());
  app.use('/api', apiRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;

  const callApi = (ruta: string, opts?: { method?: string; token?: string; body?: unknown }) =>
    fetch(`http://127.0.0.1:${port}/api${ruta}`, {
      method: opts?.method || 'GET',
      headers: {
        ...(opts?.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        'Content-Type': 'application/json'
      },
      ...(opts?.body !== undefined ? { body: JSON.stringify(opts.body) } : {})
    });

  try {
    // /health agrega persistenciaCompleta=false y mantiene contrato base
    const resHealth = await callApi('/health');
    const jsonHealth = (await resHealth.json()) as Record<string, unknown>;
    assert.equal(typeof jsonHealth.persistenciaCompleta, 'boolean');
    assert.equal(jsonHealth.persistenciaCompleta, false);
    assert.ok('status' in jsonHealth && 'database' in jsonHealth);

    // /sistema/persistencia requiere autenticación
    const resUnauth = await callApi('/sistema/persistencia');
    assert.equal(resUnauth.status, 401);

    // /sistema/persistencia autenticado devuelve estado completo
    const resPersist = await callApi('/sistema/persistencia', { token: contador.accessToken });
    assert.equal(resPersist.status, 200);
    const jsonPersist = (await resPersist.json()) as EstadoPersistenciaSistema;
    assert.equal(jsonPersist.modo, 'test');
    assert.equal(jsonPersist.persistenciaCompleta, false);
    assert.equal(jsonPersist.bloqueo.activo, false);
    assert.equal(jsonPersist.modulosTemporales.length, MODULOS_SOLO_MEMORIA.length);

    // En NODE_ENV=test o development, ATLOB_BLOQUEAR_MEMORIA=1 NO bloquea escrituras
    process.env.ATLOB_BLOQUEAR_MEMORIA = '1';
    for (const modoSinBloqueo of ['test', 'development'] as const) {
      process.env.NODE_ENV = modoSinBloqueo;
      const resNoBloq = await callApi('/empresas/emp-01/honorarios', {
        method: 'POST',
        token: contador.accessToken,
        body: {}
      });
      assert.notEqual(resNoBloq.status, 503, `En ${modoSinBloqueo} no debe devolver 503 MODULO_SIN_PERSISTENCIA`);
    }

    // En NODE_ENV=production sin bandera (default 0), tampoco bloquea
    process.env.NODE_ENV = 'production';
    process.env.ATLOB_BLOQUEAR_MEMORIA = '0';
    const resProdSinFlag = await callApi('/empresas/emp-01/honorarios', {
      method: 'POST',
      token: contador.accessToken,
      body: {}
    });
    assert.notEqual(resProdSinFlag.status, 503, 'En production sin ATLOB_BLOQUEAR_MEMORIA=1 no debe bloquear');

    // En NODE_ENV=production CON ATLOB_BLOQUEAR_MEMORIA=1:
    process.env.ATLOB_BLOQUEAR_MEMORIA = '1';
    const estadoBloqueado = obtenerEstadoPersistencia();
    assert.equal(estadoBloqueado.modo, 'production');
    assert.equal(estadoBloqueado.bloqueo.banderaSolicitada, true);
    assert.equal(estadoBloqueado.bloqueo.activo, true);

    const rutasExclusivasBloqueadas: Array<{ method: string; path: string; moduloId: string }> = [
      { method: 'POST', path: '/empresas/emp-01/trabajadores', moduloId: 'planillas-plame' },
      { method: 'PUT', path: '/empresas/emp-01/honorarios/rxh-1', moduloId: 'recibos-honorarios' },
      { method: 'POST', path: '/empresas/emp-01/caja-chica/gastos', moduloId: 'caja-chica' },
      { method: 'POST', path: '/empresas/emp-01/backups', moduloId: 'respaldos-empresa' },
      { method: 'POST', path: '/empresas/demo/restablecer', moduloId: 'empresa-demo' },
      { method: 'PATCH', path: '/tributos/daot', moduloId: 'daot' },
      { method: 'POST', path: '/empresas/emp-01/ple/exportar', moduloId: 'ple-exportacion' },
      { method: 'DELETE', path: '/empresas/emp-01/activos-fijos/af-1', moduloId: 'activos-fijos' },
      { method: 'POST', path: '/importacion/analizar', moduloId: 'importacion-csv' }
    ];

    for (const caso of rutasExclusivasBloqueadas) {
      const resp = await callApi(caso.path, {
        method: caso.method,
        token: contador.accessToken,
        body: {}
      });
      assert.equal(resp.status, 503, `${caso.method} ${caso.path} debe bloquearse con 503`);
      const body = (await resp.json()) as { success: boolean; codigo: string; modulo: string };
      assert.equal(body.success, false);
      assert.equal(body.codigo, 'MODULO_SIN_PERSISTENCIA');
      assert.equal(body.modulo, caso.moduloId);
    }

    // GET en módulos solo-memoria NO se bloquea
    const resGetPermitido = await callApi('/empresas/emp-01/honorarios', {
      method: 'GET',
      token: contador.accessToken
    });
    assert.notEqual(resGetPermitido.status, 503, 'GET sobre módulos solo-memoria debe seguir habilitado');

    // Rutas compartidas con PostgreSQL NO deben bloquearse
    const rutasCompartidasPg: Array<{ method: string; path: string }> = [
      { method: 'POST', path: '/consolidacion/calcular' },
      { method: 'POST', path: '/tributos/pdt621/liquidar' },
      { method: 'POST', path: '/empresas/emp-01/asientos' },
      { method: 'POST', path: '/empresas/emp-01/ple/exportar-job' },
      { method: 'POST', path: '/empresas/emp-01/sire/conexion' },
      { method: 'POST', path: '/empresas/emp-01/cuentas-financieras' },
      { method: 'POST', path: '/empresas' }
    ];
    for (const compartida of rutasCompartidasPg) {
      assert.equal(
        esPeticionEscrituraBloqueableMemoria(compartida.method, compartida.path),
        null,
        `La ruta compartida PG ${compartida.path} no debe coincidir con prefijos solo-memoria`
      );
      const resp = await callApi(compartida.path, {
        method: compartida.method,
        token: contador.accessToken,
        body: {}
      });
      if (resp.status === 503) {
        const body = (await resp.json()) as { codigo?: string };
        assert.notEqual(body.codigo, 'MODULO_SIN_PERSISTENCIA', `${compartida.path} no debe bloquearse por M1.4`);
      }
    }

    // 3) M1.3: Visibilidad del banner reutilizable por entorno y vista
    assert.equal(
      MENSAJE_DATOS_TEMPORALES,
      'Datos temporales: este módulo aún no guarda en la base de datos. La información se pierde al cerrar la aplicación.'
    );
    const estadoBase = obtenerEstadoPersistencia();
    const estadoDev: EstadoPersistenciaSistema = { ...estadoBase, modo: 'development', esEscritorio: false };
    const estadoTest: EstadoPersistenciaSistema = { ...estadoBase, modo: 'test', esEscritorio: false };
    const estadoProd: EstadoPersistenciaSistema = { ...estadoBase, modo: 'production', esEscritorio: false };
    const estadoDesktop: EstadoPersistenciaSistema = { ...estadoBase, modo: 'development', esEscritorio: true };

    assert.equal(esEntornoAvisoPersistencia(estadoDev), false);
    assert.equal(esEntornoAvisoPersistencia(estadoTest), false);
    assert.equal(esEntornoAvisoPersistencia(estadoProd), true);
    assert.equal(esEntornoAvisoPersistencia(estadoDesktop), true);

    assert.equal(moduloTemporalParaVista('trabajadores', estadoDev), null);
    assert.equal(moduloTemporalParaVista('trabajadores', estadoTest), null);
    assert.equal(moduloTemporalParaVista('trabajadores', estadoProd)?.id, 'planillas-plame');
    assert.equal(moduloTemporalParaVista('kardex', estadoDesktop)?.id, 'kardex-existencias');
    assert.equal(moduloTemporalParaVista('respaldos', estadoProd)?.id, 'respaldos-empresa');
    assert.equal(moduloTemporalParaVista('importar-csv', estadoProd)?.id, 'importacion-csv');

    // Vistas persistentes en PostgreSQL NO muestran banner ni en producción ni en escritorio
    for (const vistaPersistente of ['asientos', 'compras', 'ventas', 'emitir-comprobante', 'plan-cuentas', 'liquidacion-igv']) {
      assert.equal(moduloTemporalParaVista(vistaPersistente, estadoProd), null);
      assert.equal(moduloTemporalParaVista(vistaPersistente, estadoDesktop), null);
    }

    // Verificar montaje en App.tsx y modales sin bloqueo de UI
    const appSource = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    const modalCsvSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'modals', 'ModalImportacionCsv.tsx'),
      'utf8'
    );
    const modalBackupSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'modals', 'ModalBackupEmpresa.tsx'),
      'utf8'
    );
    assert.match(appSource, /<BannerPersistenciaTemporal\s+vistaMenuId=\{activeModuleId\}/);
    assert.match(modalCsvSource, /<BannerPersistenciaTemporal\s+vistaMenuId="importar-csv"/);
    assert.match(modalBackupSource, /<BannerPersistenciaTemporal\s+vistaMenuId="respaldos"/);
  } finally {
    process.env.NODE_ENV = nodeEnvOriginal;
    if (bloqueoOriginal === undefined) delete process.env.ATLOB_BLOQUEAR_MEMORIA;
    else process.env.ATLOB_BLOQUEAR_MEMORIA = bloqueoOriginal;
    if (desktopOriginal === undefined) delete process.env.ATLOB_DESKTOP;
    else process.env.ATLOB_DESKTOP = desktopOriginal;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('✅ Suite 37 (M1) completada con éxito.');
}

main().catch((err) => {
  console.error('❌ Error en Suite 37:', err);
  process.exit(1);
});
