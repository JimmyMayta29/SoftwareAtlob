import { execSync } from 'child_process';

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
  { name: 'Automatización de Asientos, Consolidación Mensual y Cinta de 7 Accesos', path: 'server/tests/run_tests_automatizacion_asientos_y_cinta.ts' }
];

console.log('========================================================================');
console.log('🚀 EJECUTANDO BATERÍA COMPLETA DE PRUEBAS DE CALIDAD (FASES 1 - 13)');
console.log('========================================================================\n');

let totalPassed = 0;
let totalSuites = suites.length;
const startTotal = Date.now();

for (const suite of suites) {
  const start = Date.now();
  console.log(`▶ Ejecutando ${suite.name} (${suite.path})...`);
  try {
    execSync(`npx tsx ${suite.path}`, {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: '' }
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`✅ [${suite.name}] completado en ${elapsed}s\n`);
    totalPassed++;
  } catch (err) {
    console.error(`❌ [${suite.name}] falló.`);
    process.exit(1);
  }
}

const totalTime = ((Date.now() - startTotal) / 1000).toFixed(2);
console.log('========================================================================');
console.log(`🎉 RESUMEN FINAL: ${totalPassed}/${totalSuites} suites completadas con éxito en ${totalTime}s.`);
console.log('========================================================================');
