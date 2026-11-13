import assert from 'node:assert/strict';
import crypto, { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import express from 'express';
import { apiRoutes } from '../routes';
import {
  HELPERS_SIN_PERSISTENCIA,
  MODULOS_SOLO_MEMORIA,
  ModuloSoloMemoria,
  esPeticionEscrituraBloqueableMemoria,
  obtenerEstadoPersistencia,
  tieneConsultasPostgreSQL
} from '../config/persistencia';
import { authJwtService, sembrarUsuariosPrueba } from '../services/authJwtService';
import { env } from '../config/env';
import { totpService } from '../services/totpService';
import { DATOS_EMPRESA_DEMO, EMPRESAS_STORE } from '../repositories/empresaRepository';
import {
  ADVERTENCIA_BACKUP_PARCIAL,
  backupEmpresaService,
  generarNombreArchivoDescargaBackup
} from '../services/backupEmpresaService';
import {
  MENSAJE_DATOS_TEMPORALES,
  esEntornoAvisoPersistencia,
  moduloTemporalParaVista
} from '../../src/components/common/BannerPersistenciaTemporal';
import type { EstadoPersistenciaSistema } from '../../src/api/sistemaApi';
import { TEXTOS_RESPALDO_PARCIAL } from '../../src/components/modals/ModalBackupEmpresa';

function validarSincroniaServiciosSimulados(
  servicios: Array<{ archivo: string; codigoFuente: string }>,
  soloMemoriaPersonalizado?: readonly ModuloSoloMemoria[]
): string[] {
  const errores: string[] = [];
  const soloMemoriaSet = new Set((soloMemoriaPersonalizado ?? MODULOS_SOLO_MEMORIA).flatMap((m) => [...m.servicios]));
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
  const envNodeEnvOriginal = env.NODE_ENV;
  const dbUrlOriginal = process.env.DATABASE_URL;
  const envDbUrlOriginal = env.DATABASE_URL;
  const bloqueoOriginal = process.env.ATLOB_BLOQUEAR_MEMORIA;
  const desktopOriginal = process.env.ATLOB_DESKTOP;

  (env as any).NODE_ENV = 'test';
  process.env.NODE_ENV = 'test';
  (env as any).DATABASE_URL = '';
  process.env.DATABASE_URL = '';

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
  const moduloSimulado = [
    {
      id: 'simulado-memoria',
      nombreVisible: 'Servicio Simulado en Memoria',
      servicios: ['servicioSimuladoMemoriaService.ts'],
      prefijosRuta: ['/simulado'],
      vistasMenuIds: ['simulado']
    }
  ];
  const errorSiUsaPg = validarSincroniaServiciosSimulados([
    {
      archivo: 'servicioSimuladoMemoriaService.ts',
      codigoFuente: `import { db } from '../config/database'; export async function x() { return db.query('SELECT 1'); }`
    }
  ], moduloSimulado);
  assert.equal(errorSiUsaPg.length, 1);
  assert.match(errorSiUsaPg[0], /SERVICIO_EN_MEMORIA_YA_USA_PG:servicioSimuladoMemoriaService\.ts/);

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
    // /health reporta persistenciaCompleta=true en FASE B (100% servicios en PostgreSQL)
    const resHealth = await callApi('/health');
    const jsonHealth = (await resHealth.json()) as Record<string, unknown>;
    assert.equal(typeof jsonHealth.persistenciaCompleta, 'boolean');
    assert.equal(jsonHealth.persistenciaCompleta, true);
    assert.ok('status' in jsonHealth && 'database' in jsonHealth);

    // /sistema/persistencia requiere autenticación
    const resUnauth = await callApi('/sistema/persistencia');
    assert.equal(resUnauth.status, 401);

    // /sistema/persistencia autenticado devuelve estado completo
    const resPersist = await callApi('/sistema/persistencia', { token: contador.accessToken });
    assert.equal(resPersist.status, 200);
    const jsonPersist = (await resPersist.json()) as EstadoPersistenciaSistema;
    assert.equal(jsonPersist.modo, 'test');
    assert.equal(jsonPersist.persistenciaCompleta, true);
    assert.equal(jsonPersist.bloqueo.activo, false);
    assert.equal(jsonPersist.modulosTemporales.length, 0);

    // Registrar temporalmente un módulo en memoria para probar el middleware de bloqueo 503
    const moduloSimuladoBloqueo: ModuloSoloMemoria = {
      id: 'modulo-simulado-bloqueo',
      nombreVisible: 'Módulo Simulado para Prueba Bloqueo',
      servicios: ['moduloSimuladoBloqueoService.ts'],
      prefijosRuta: ['/empresas/:empresaId/modulo-simulado-bloqueo'],
      vistasMenuIds: ['modulo-simulado-bloqueo']
    };
    MODULOS_SOLO_MEMORIA.push(moduloSimuladoBloqueo);

    // En NODE_ENV=test o development, ATLOB_BLOQUEAR_MEMORIA=1 NO bloquea escrituras
    process.env.ATLOB_BLOQUEAR_MEMORIA = '1';
    for (const modoSinBloqueo of ['test', 'development'] as const) {
      process.env.NODE_ENV = modoSinBloqueo;
      const resNoBloq = await callApi('/empresas/emp-01/modulo-simulado-bloqueo', {
        method: 'POST',
        token: contador.accessToken,
        body: {}
      });
      assert.notEqual(resNoBloq.status, 503, `En ${modoSinBloqueo} no debe devolver 503 MODULO_SIN_PERSISTENCIA`);
    }

    // En NODE_ENV=production sin bandera (default 0), tampoco bloquea
    process.env.NODE_ENV = 'production';
    process.env.ATLOB_BLOQUEAR_MEMORIA = '0';
    const resProdSinFlag = await callApi('/empresas/emp-01/modulo-simulado-bloqueo', {
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

    const respBloq = await callApi('/empresas/emp-01/modulo-simulado-bloqueo', {
      method: 'POST',
      token: contador.accessToken,
      body: {}
    });
    assert.equal(respBloq.status, 503, `POST /empresas/emp-01/modulo-simulado-bloqueo debe bloquearse con 503`);
    const bodyBloq = (await respBloq.json()) as { success: boolean; codigo: string; modulo: string };
    assert.equal(bodyBloq.success, false);
    assert.equal(bodyBloq.codigo, 'MODULO_SIN_PERSISTENCIA');
    assert.equal(bodyBloq.modulo, 'modulo-simulado-bloqueo');

    // Limpiar módulo simulado para volver a persistencia completa 100%
    MODULOS_SOLO_MEMORIA.length = 0;

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

    const estadoConModulos: EstadoPersistenciaSistema = {
      ...estadoProd,
      persistenciaCompleta: false,
      modulosTemporales: [
        { id: 'planillas-plame', nombreVisible: 'Planillas', servicios: ['planillaService.ts'], prefijosRuta: [], vistasMenuIds: ['trabajadores'] },
        { id: 'kardex-existencias', nombreVisible: 'Kardex', servicios: ['kardexService.ts'], prefijosRuta: [], vistasMenuIds: ['kardex'] },
        { id: 'respaldos-empresa', nombreVisible: 'Respaldos', servicios: ['backupEmpresaService.ts'], prefijosRuta: [], vistasMenuIds: ['respaldos'] },
        { id: 'importacion-csv', nombreVisible: 'Importación', servicios: ['importacionService.ts'], prefijosRuta: [], vistasMenuIds: ['importar-csv'] }
      ]
    };
    const estadoDesktopConModulos: EstadoPersistenciaSistema = { ...estadoConModulos, esEscritorio: true };

    assert.equal(moduloTemporalParaVista('trabajadores', estadoDev), null);
    assert.equal(moduloTemporalParaVista('trabajadores', estadoTest), null);
    assert.equal(moduloTemporalParaVista('trabajadores', estadoConModulos)?.id, 'planillas-plame');
    assert.equal(moduloTemporalParaVista('kardex', estadoDesktopConModulos)?.id, 'kardex-existencias');
    assert.equal(moduloTemporalParaVista('respaldos', estadoConModulos)?.id, 'respaldos-empresa');
    assert.equal(moduloTemporalParaVista('importar-csv', estadoConModulos)?.id, 'importacion-csv');

    // Con estadoProd real (persistenciaCompleta = true, 0 módulos temporales), ninguna vista muestra banner
    for (const vista of ['trabajadores', 'kardex', 'respaldos', 'importar-csv', 'asientos', 'compras', 'ventas', 'plan-cuentas']) {
      assert.equal(moduloTemporalParaVista(vista, estadoProd), null);
      assert.equal(moduloTemporalParaVista(vista, estadoDesktop), null);
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

    // 4) M2: Alcance parcial y advertencia en manifest.json, retrocompatibilidad, descarga y confirmaciones UI
    process.env.NODE_ENV = 'test';
    process.env.ATLOB_BLOQUEAR_MEMORIA = '0';

    const mfaSecretAdmin = totpService.encodeBase32(Buffer.from(env.MFA_SEED_SECRET, 'hex'));
    const codigoTotpAdmin = totpService.generarTokenParaContador(mfaSecretAdmin, Math.floor(Date.now() / 30000));
    const admin = await authJwtService.login('admin@atlob.pe', passwordFixture, codigoTotpAdmin);
    const resGen = await callApi('/empresas/emp-01/backups/generar', {
      method: 'POST',
      token: admin.accessToken,
      body: { origen: 'MANUAL' }
    });
    assert.equal(resGen.status, 201, 'ADMINISTRADOR debe poder generar respaldo en modo test');
    const jsonGen = (await resGen.json()) as {
      success: boolean;
      data: {
        id: string;
        nombreArchivo: string;
        nombreArchivoDescarga: string;
        esParcial: boolean;
        alcance: { modo: string; incluye: string[]; no_incluye: string[] };
        advertencia: string;
      };
    };
    assert.equal(jsonGen.success, true);
    assert.equal(jsonGen.data.esParcial, true);
    assert.match(jsonGen.data.nombreArchivoDescarga, /^ATLOB_respaldo_PARCIAL_.*\.zip$/);
    assert.equal(jsonGen.data.alcance.modo, 'PARCIAL_MEMORIA');
    assert.ok(jsonGen.data.alcance.incluye.includes('asientos.ndjson'));
    assert.ok(jsonGen.data.alcance.no_incluye.length >= 4);
    assert.equal(jsonGen.data.advertencia, ADVERTENCIA_BACKUP_PARCIAL);

    // Verifica Content-Disposition en descarga
    const resDown = await callApi(`/empresas/emp-01/backups/${jsonGen.data.id}/descargar`, {
      token: admin.accessToken
    });
    assert.equal(resDown.status, 200);
    const disp = resDown.headers.get('content-disposition') || '';
    assert.match(disp, /filename="ATLOB_respaldo_PARCIAL_.*\.zip"/);

    // Nombre normal solo si cubre todo (alcance completo sin exclusiones)
    const nombreCompleto = generarNombreArchivoDescargaBackup({
      ruc: '20000000001',
      razonSocial: 'Empresa Demo S.A.C.',
      alcance: { modo: 'COMPLETO', incluye: ['todo'], no_incluye: [] },
      nombreArchivoFallback: '20000000001_2026_COMPLETO.zip'
    });
    assert.equal(nombreCompleto, '20000000001_2026_COMPLETO.zip');

    // Verificar manifest.json interno descifrado
    const itemDescarga = backupEmpresaService.obtenerBackupParaDescarga('emp-01', jsonGen.data.id);
    assert.ok(itemDescarga?.archivoZipBuffer);
    const verifNuevo = backupEmpresaService.verificarIntegridadBackup(itemDescarga.archivoZipBuffer);
    assert.equal(verifNuevo.valida, true);
    assert.equal(verifNuevo.manifest.alcance?.modo, 'PARCIAL_MEMORIA');
    assert.ok(verifNuevo.manifest.alcance?.incluye.includes('empresa.json'));
    assert.ok((verifNuevo.manifest.alcance?.no_incluye.length || 0) >= 4);
    assert.equal(verifNuevo.manifest.advertencia, ADVERTENCIA_BACKUP_PARCIAL);

    // Retrocompatibilidad: restaurar un ZIP antiguo SIN alcance ni advertencia en manifest.json
    const zipAntiguo = new AdmZip();
    const empresaJsonBuf = Buffer.from(JSON.stringify({ id: 'emp-01', ruc: DATOS_EMPRESA_DEMO.ruc }), 'utf8');
    const manifestAntiguo = {
      ruc: DATOS_EMPRESA_DEMO.ruc,
      razonSocial: DATOS_EMPRESA_DEMO.razonSocial,
      ejercicio: 2026,
      esquemaVersion: '2.0.0-fase13',
      fechaUtc: new Date().toISOString(),
      usuarioId: 'usr-admin-01',
      origen: 'MANUAL',
      archivos: {
        'empresa.json': {
          lineas: 1,
          sha256: crypto.createHash('sha256').update(empresaJsonBuf).digest('hex')
        }
      }
    };
    zipAntiguo.addFile('empresa.json', empresaJsonBuf);
    zipAntiguo.addFile('manifest.json', Buffer.from(JSON.stringify(manifestAntiguo, null, 2), 'utf8'));
    const zipAntiguoCifrado = backupEmpresaService.cifrarBufferAesGcm(
      zipAntiguo.toBuffer(),
      backupEmpresaService.derivarClave()
    );
    const verifAntiguo = backupEmpresaService.verificarIntegridadBackup(zipAntiguoCifrado);
    assert.equal(verifAntiguo.valida, true, 'ZIP antiguo sin alcance ni advertencia debe validar');
    assert.equal(verifAntiguo.manifest.alcance, undefined);
    const restauracionAntigua = await backupEmpresaService.restaurarBackup(
      'emp-01',
      zipAntiguoCifrado,
      DATOS_EMPRESA_DEMO.ruc,
      admin.usuario.id
    );
    assert.equal(restauracionAntigua.exito, true, 'ZIP antiguo debe restaurar de forma retrocompatible');

    // M2.2: Confirmación explícita previa en UI antes de exportar y restaurar + referencia a docs/BACKUP_BASE_DATOS.md
    assert.equal(TEXTOS_RESPALDO_PARCIAL.referenciaDocs, 'docs/BACKUP_BASE_DATOS.md');
    assert.ok(TEXTOS_RESPALDO_PARCIAL.noIncluye.length >= 4);
    assert.match(modalBackupSource, /Confirmar exportación de respaldo parcial/);
    assert.match(modalBackupSource, /¿Confirmar Restauración de Copia de Seguridad Parcial\?/);
    assert.match(modalBackupSource, /aceptoAlcanceExportar/);
    assert.match(modalBackupSource, /aceptoAlcanceRestaurar/);
    assert.match(modalBackupSource, /confirmacionRuc:\s*rucConfirmacion\.trim\(\)/);
    assert.match(modalBackupSource, /TEXTOS_RESPALDO_PARCIAL\.referenciaDocs/);
  } finally {
    process.env.NODE_ENV = nodeEnvOriginal;
    (env as any).NODE_ENV = envNodeEnvOriginal;
    (env as any).DATABASE_URL = envDbUrlOriginal;
    if (dbUrlOriginal !== undefined) process.env.DATABASE_URL = dbUrlOriginal;
    else delete process.env.DATABASE_URL;
    if (bloqueoOriginal === undefined) delete process.env.ATLOB_BLOQUEAR_MEMORIA;
    else process.env.ATLOB_BLOQUEAR_MEMORIA = bloqueoOriginal;
    if (desktopOriginal === undefined) delete process.env.ATLOB_DESKTOP;
    else process.env.ATLOB_DESKTOP = desktopOriginal;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('✅ Suite 37 (M1 + M2) completada con éxito.');
}

main().catch((err) => {
  console.error('❌ Error en Suite 37:', err);
  process.exit(1);
});
