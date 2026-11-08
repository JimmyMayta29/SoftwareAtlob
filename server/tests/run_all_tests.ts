import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Las suites de fixtures nunca deben conectarse a una base configurada por el usuario.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';

const suites = [
  { name: 'Sesión del cliente y renovación concurrente', path: 'src/api/session.test.ts' },
  { name: 'Autorización HTTP por empresa y rol', path: 'server/tests/run_tests_acceso.ts' },
  { name: 'Configuración inicial y sesión administrativa', path: 'server/tests/verificar_auth_setup.ts' },
  { name: 'Fases 1 y 2: Motor Contable & Partida Doble', path: 'server/tests/run_tests.ts' },
  { name: 'Fase 3: Compras, Ventas, CXC/CXP & Tributos', path: 'server/tests/run_tests_fase3.ts' },
  { name: 'Fase 4: Tesorería, Conciliación Bancaria, 4ta & Planilla', path: 'server/tests/run_tests_fase4.ts' },
  { name: 'Fase 5: Libros Oficiales, Balance Comprobación & EEFF', path: 'server/tests/run_tests_fase5.ts' },
  { name: 'Fase 6: Integración SUNAT/SIRE, XML UBL/CDR & PLE', path: 'server/tests/run_tests_fase6.ts' },
  { name: 'Escaneo de secretos en el frontend', path: 'server/tests/test_secretos_frontend.ts' },
  { name: 'Sonda SUNAT de auditoría y respaldo', path: 'server/tests/test_sonda_sunat.ts' },
  { name: 'Fase 7: Seguridad, RBAC, RLS, Envelope Encryption & Auditoría', path: 'server/tests/run_tests_fase7.ts' },
  { name: 'Fase 7B: Navegación por Empresa, Entorno Aislado & Selector Multi-Nivel', path: 'server/tests/run_tests_fase7b.ts' },
  { name: 'Fase 7C-2: Reportes ESTANDAR (Hoja de Trabajo 10 Columnas & Libro Diario)', path: 'server/tests/run_tests_fase7c2.ts' },
  { name: 'Fase 8: Calidad, PostgreSQL, Concurrencia & Property Testing', path: 'server/tests/run_tests_fase8.ts' },
  { name: 'Fase 9: Automatización Tributaria Avanzada, PLAME & SIRE Cierre', path: 'server/tests/run_tests_fase9.ts' },
  { name: 'Fase 10: Auditoría Preventiva, DAOT 3500 & Cierre Anual PCGE', path: 'server/tests/run_tests_fase10.ts' },
  { name: 'Fase 11: Activos Fijos (Libro 7.1), Kardex (Libro 13.1) & Prorrata IGV', path: 'server/tests/run_tests_fase11.ts' },
  { name: 'Fase 13: Comportamiento & Cobertura de Servicios Críticos', path: 'server/tests/run_tests_fase13_cobertura.ts' },
  { name: 'Fase 13: Empresa Demo S.A.C. & Idempotencia', path: 'server/tests/run_tests_fase13_demo.ts' },
  { name: 'Fase 13: Backup y Restauración por Empresa ESTANDAR', path: 'server/tests/run_tests_fase13_backup.ts' },
  { name: 'Fase 13: Motor de Importación CSV/hoja de cálculo & Rollback', path: 'server/tests/run_tests_fase13_importacion.ts' },
  { name: 'Fase 1: Taxonomía de Menú Propio y Separación 1:1 de Vistas', path: 'server/tests/run_tests_menu_fase1.ts' },
  { name: 'Fase 4 (Tributos): PDT 621, Prorrata IGV, Renta Anual, DAOT, Cronograma y Parámetros', path: 'server/tests/run_tests_fase4_tributos.ts' },
  { name: 'Fase 5 (Planillas): RMV, AFP vs ONP, 5ta Proyectada, Gratificaciones/CTS, Baja Mitad de Mes y PLAME/T-Registro', path: 'server/tests/run_tests_fase5_planillas.ts' },
  { name: 'A3: Fallo estricto NODE_ENV=production sin DATABASE_URL y bloqueo en memoria', path: 'server/tests/test_produccion_sin_db.ts' },
  { name: 'Optimización Visual Normativa: Reportes Uniformes y Vouchers de Escritorio', path: 'server/tests/run_tests_reportes_y_vouchers_normativos.ts' },
  { name: 'Automatización de Asientos, Consolidación Mensual y Cinta de 7 Accesos', path: 'server/tests/run_tests_automatizacion_asientos_y_cinta.ts' },
  { name: 'Identidad de Marca, Login Ágil & Seguridad', path: 'server/tests/test_marca_y_login_seguridad.ts' },
  { name: 'Bloque C: Reportes Unificados, Sin Asteriscos y Paginación Real', path: 'server/tests/test_bloque_c_reportes.ts' },
  { name: 'Bloque B: Plan Contable General Empresarial Completo, Correctoras y Jerarquía', path: 'server/tests/test_bloque_b_plan_contable.ts' },
  { name: 'Bloque A: Subdiarios Personalizables y Registro por Subdiario', path: 'server/tests/test_bloque_a_subdiarios.ts' },
  { name: 'Bloque F: Hallazgos Puntuales de Operatividad y Resiliencia', path: 'server/tests/test_bloque_f_hallazgos.ts' }
];

console.log('========================================================================');
console.log('🚀 EJECUTANDO BATERÍA COMPLETA DE PRUEBAS DE CALIDAD (FASES 1 - 13)');
console.log('========================================================================\n');

let totalPassed = 0;
const totalSuites = suites.length;
let totalAssertionsAll = 0;
const resumenSuites: { indice: number; name: string; path: string; aserciones: number; elapsed: string }[] = [];
const startTotal = Date.now();

for (const [idx, suite] of suites.entries()) {
  const start = Date.now();
  const archivoConteo = join(tmpdir(), `atlob_aserciones_${process.pid}_${idx}.txt`);
  rmSync(archivoConteo, { force: true });
  console.log(`▶ [${idx + 1}/${totalSuites}] Ejecutando ${suite.name} (${suite.path})...`);

  const res = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--import', './server/tests/contador_aserciones.ts', suite.path],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: '',
        ATLOB_ARCHIVO_ASERCIONES: archivoConteo,
      },
      windowsHide: true,
    }
  );

  if (res.status !== 0) {
    rmSync(archivoConteo, { force: true });
    console.error(`❌ [${suite.name}] falló con código ${res.status ?? 1}.`);
    process.exit(1);
  }

  let aserciones = 0;
  if (existsSync(archivoConteo)) {
    aserciones = Number.parseInt(readFileSync(archivoConteo, 'utf8').trim(), 10) || 0;
    rmSync(archivoConteo, { force: true });
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`✅ [${suite.name}] (${suite.path}) completado en ${elapsed}s | aserciones=${aserciones}\n`);
  totalPassed++;
  totalAssertionsAll += aserciones;
  resumenSuites.push({ indice: idx + 1, name: suite.name, path: suite.path, aserciones, elapsed });
}

const totalTime = ((Date.now() - startTotal) / 1000).toFixed(2);
console.log('========================================================================');
console.log('📋 INVENTARIO DE LAS 27 SUITES EJECUTADAS (NOMBRE | ARCHIVO | ASERCIONES)');
console.log('========================================================================');
for (const item of resumenSuites) {
  console.log(
    `${String(item.indice).padStart(2, '0')}. ${item.name} | ${item.path} | aserciones=${item.aserciones} | tiempo=${item.elapsed}s`
  );
}
console.log('========================================================================');
console.log(`🎉 RESUMEN FINAL: ${totalPassed}/${totalSuites} suites completadas con éxito | ${totalAssertionsAll} aserciones totales en ${totalTime}s.`);
console.log('========================================================================');
