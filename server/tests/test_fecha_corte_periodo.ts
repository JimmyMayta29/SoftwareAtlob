import assert from 'node:assert/strict';
import { obtenerRangoMesPeriodo } from '../../src/utils/periodoFecha';

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

ejecutarPruebasPeriodoFecha();
