import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { obtenerRangoMesPeriodo } from '../../src/utils/periodoFecha';

function obtenerFechaFinSegura(periodo: string): string {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo) ? obtenerRangoMesPeriodo(periodo).fechaFin : '';
}

function ejecutarPruebasPeriodoFecha() {
  console.log('=== TEST: Cálculo real de rango mensual (obtenerRangoMesPeriodo) ===');

  assert.deepEqual(obtenerRangoMesPeriodo('2026-01'), {
    fechaInicio: '2026-01-01',
    fechaFin: '2026-01-31',
    diasMes: 31,
  });

  assert.deepEqual(obtenerRangoMesPeriodo('2026-02'), {
    fechaInicio: '2026-02-01',
    fechaFin: '2026-02-28',
    diasMes: 28,
  });

  assert.deepEqual(obtenerRangoMesPeriodo('2024-02'), {
    fechaInicio: '2024-02-01',
    fechaFin: '2024-02-29',
    diasMes: 29,
  });

  assert.deepEqual(obtenerRangoMesPeriodo('2028-02'), {
    fechaInicio: '2028-02-01',
    fechaFin: '2028-02-29',
    diasMes: 29,
  });

  assert.deepEqual(obtenerRangoMesPeriodo('2026-04'), {
    fechaInicio: '2026-04-01',
    fechaFin: '2026-04-30',
    diasMes: 30,
  });

  assert.deepEqual(obtenerRangoMesPeriodo('2026-09'), {
    fechaInicio: '2026-09-01',
    fechaFin: '2026-09-30',
    diasMes: 30,
  });

  assert.deepEqual(obtenerRangoMesPeriodo('2026-12'), {
    fechaInicio: '2026-12-01',
    fechaFin: '2026-12-31',
    diasMes: 31,
  });

  for (const invalido of ['2026-13', '2026-00', '2026', '', '2026-9', 'abcd-01']) {
    assert.throws(() => obtenerRangoMesPeriodo(invalido), /Periodo inválido/);
  }

  console.log('✔ Todas las validaciones de obtenerRangoMesPeriodo pasaron (28, 29, 30, 31 y rechazos).');
}

function ejecutarPruebasGuardCajaBancos() {
  console.log('=== TEST: Guarda B3 de 1 línea para periodo en CajaBancosView ===');

  assert.equal(obtenerFechaFinSegura('2026-02'), '2026-02-28');
  assert.equal(obtenerFechaFinSegura('2024-02'), '2024-02-29');
  assert.equal(obtenerFechaFinSegura('2026-09'), '2026-09-30');

  for (const transitorio of ['', '2026-', '2026-13', '2026-00']) {
    assert.doesNotThrow(() => {
      assert.equal(obtenerFechaFinSegura(transitorio), '');
    });
  }

  const cajaBancosPath = path.resolve(process.cwd(), 'src/components/views/CajaBancosView.tsx');
  const contenido = fs.readFileSync(cajaBancosPath, 'utf8');
  assert.ok(
    contenido.includes("/^\\d{4}-(0[1-9]|1[0-2])$/.test(periodo) ? obtenerRangoMesPeriodo(periodo).fechaFin : ''"),
    'CajaBancosView.tsx debe usar la guarda B3 segura sobre periodo'
  );

  console.log('✔ Guarda B3 verificada para válidos, transitorios y presencia en CajaBancosView.tsx.');
}

ejecutarPruebasPeriodoFecha();
ejecutarPruebasGuardCajaBancos();
