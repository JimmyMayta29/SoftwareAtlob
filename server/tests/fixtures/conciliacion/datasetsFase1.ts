import type { ConfigConciliacionV2 } from '../../../types/conciliacionV2';

export interface CasoCalculoNumericoFixture {
  nombre: string;
  input: {
    tieneExtracto: boolean;
    saldoFinalExtracto: string | number | null;
    saldoLibros: string | number;
    depositosEnTransito: string | number;
    chequesNoCobrados: string | number;
    abonosNoRegistrados: string | number;
    cargosNoRegistrados: string | number;
    toleranciaMonto?: string | number;
  };
  esperado: {
    saldoFinalExtracto: string | null;
    saldoAjustadoBanco: string | null;
    saldoAjustadoLibros: string;
    diferencia: string | null;
    semaforo: 'VERDE' | 'AMARILLO' | 'ROJO' | 'SIN_EXTRACTO';
  };
}

export const CASOS_CALCULO_NUMERICO_V2: CasoCalculoNumericoFixture[] = [
  {
    nombre: 'Fórmula completa cuadrada con todos los componentes no nulos -> VERDE',
    input: {
      tieneExtracto: true,
      saldoFinalExtracto: '1500.00',
      depositosEnTransito: '300.00',
      chequesNoCobrados: '100.00',
      saldoLibros: '1650.00',
      abonosNoRegistrados: '80.00',
      cargosNoRegistrados: '30.00',
      toleranciaMonto: '0.00',
    },
    esperado: {
      saldoFinalExtracto: '1500.00',
      saldoAjustadoBanco: '1700.00',
      saldoAjustadoLibros: '1700.00',
      diferencia: '0.00',
      semaforo: 'VERDE',
    },
  },
  {
    nombre: 'Asimetría de signos verificada (depósitos vs cheques vs abonos vs cargos) -> VERDE',
    input: {
      tieneExtracto: true,
      saldoFinalExtracto: '2450.25',
      depositosEnTransito: '410.50',
      chequesNoCobrados: '160.75',
      saldoLibros: '2615.00',
      abonosNoRegistrados: '125.40',
      cargosNoRegistrados: '40.40',
      toleranciaMonto: '1.00',
    },
    esperado: {
      saldoFinalExtracto: '2450.25',
      saldoAjustadoBanco: '2700.00',
      saldoAjustadoLibros: '2700.00',
      diferencia: '0.00',
      semaforo: 'VERDE',
    },
  },
  {
    nombre: 'IEEE-754 clásico 0.1 + 0.2 = 0.30 exacto sin residuo binario -> VERDE',
    input: {
      tieneExtracto: true,
      saldoFinalExtracto: 0.1,
      depositosEnTransito: 0.2,
      chequesNoCobrados: 0,
      saldoLibros: 0.3,
      abonosNoRegistrados: 0,
      cargosNoRegistrados: 0,
      toleranciaMonto: '0.00',
    },
    esperado: {
      saldoFinalExtracto: '0.10',
      saldoAjustadoBanco: '0.30',
      saldoAjustadoLibros: '0.30',
      diferencia: '0.00',
      semaforo: 'VERDE',
    },
  },
  {
    nombre: 'IEEE-754 centavos difíciles 1000.35 - 400.12 - 600.23 = 0.00 exacto -> VERDE',
    input: {
      tieneExtracto: true,
      saldoFinalExtracto: 1000.35,
      depositosEnTransito: 0,
      chequesNoCobrados: 400.12,
      saldoLibros: 600.23,
      abonosNoRegistrados: 0,
      cargosNoRegistrados: 0,
      toleranciaMonto: '0.00',
    },
    esperado: {
      saldoFinalExtracto: '1000.35',
      saldoAjustadoBanco: '600.23',
      saldoAjustadoLibros: '600.23',
      diferencia: '0.00',
      semaforo: 'VERDE',
    },
  },
  {
    nombre: 'IEEE-754 residuo binario 1000.1 - 400.2 - 599.9 = 0.00 exacto con Money -> VERDE',
    input: {
      tieneExtracto: true,
      saldoFinalExtracto: 1000.1,
      depositosEnTransito: 0,
      chequesNoCobrados: 400.2,
      saldoLibros: 599.9,
      abonosNoRegistrados: 0,
      cargosNoRegistrados: 0,
      toleranciaMonto: '0.00',
    },
    esperado: {
      saldoFinalExtracto: '1000.10',
      saldoAjustadoBanco: '599.90',
      saldoAjustadoLibros: '599.90',
      diferencia: '0.00',
      semaforo: 'VERDE',
    },
  },
  {
    nombre: 'IEEE-754 resta en ambos lados 1000.35 - 400.12 vs 600.23 con abonos/cargos -> VERDE',
    input: {
      tieneExtracto: true,
      saldoFinalExtracto: '1000.35',
      depositosEnTransito: '0.10',
      chequesNoCobrados: '400.12',
      saldoLibros: '600.23',
      abonosNoRegistrados: '0.20',
      cargosNoRegistrados: '0.10',
      toleranciaMonto: '0.00',
    },
    esperado: {
      saldoFinalExtracto: '1000.35',
      saldoAjustadoBanco: '600.33',
      saldoAjustadoLibros: '600.33',
      diferencia: '0.00',
      semaforo: 'VERDE',
    },
  },
  {
    nombre: 'Diferencia positiva dentro del límite exacto de tolerancia -> AMARILLO',
    input: {
      tieneExtracto: true,
      saldoFinalExtracto: '1000.50',
      depositosEnTransito: '0.00',
      chequesNoCobrados: '0.00',
      saldoLibros: '1000.00',
      abonosNoRegistrados: '0.00',
      cargosNoRegistrados: '0.00',
      toleranciaMonto: '0.50',
    },
    esperado: {
      saldoFinalExtracto: '1000.50',
      saldoAjustadoBanco: '1000.50',
      saldoAjustadoLibros: '1000.00',
      diferencia: '0.50',
      semaforo: 'AMARILLO',
    },
  },
  {
    nombre: 'Diferencia negativa dentro de tolerancia -> AMARILLO',
    input: {
      tieneExtracto: true,
      saldoFinalExtracto: '999.55',
      depositosEnTransito: '0.00',
      chequesNoCobrados: '0.00',
      saldoLibros: '1000.00',
      abonosNoRegistrados: '0.00',
      cargosNoRegistrados: '0.00',
      toleranciaMonto: '0.50',
    },
    esperado: {
      saldoFinalExtracto: '999.55',
      saldoAjustadoBanco: '999.55',
      saldoAjustadoLibros: '1000.00',
      diferencia: '-0.45',
      semaforo: 'AMARILLO',
    },
  },
  {
    nombre: 'Diferencia por encima de tolerancia -> ROJO',
    input: {
      tieneExtracto: true,
      saldoFinalExtracto: '1000.51',
      depositosEnTransito: '0.00',
      chequesNoCobrados: '0.00',
      saldoLibros: '1000.00',
      abonosNoRegistrados: '0.00',
      cargosNoRegistrados: '0.00',
      toleranciaMonto: '0.50',
    },
    esperado: {
      saldoFinalExtracto: '1000.51',
      saldoAjustadoBanco: '1000.51',
      saldoAjustadoLibros: '1000.00',
      diferencia: '0.51',
      semaforo: 'ROJO',
    },
  },
  {
    nombre: 'Diferencia mínima 0.01 con tolerancia 0.00 -> ROJO',
    input: {
      tieneExtracto: true,
      saldoFinalExtracto: '500.00',
      depositosEnTransito: '0.00',
      chequesNoCobrados: '0.00',
      saldoLibros: '500.01',
      abonosNoRegistrados: '0.00',
      cargosNoRegistrados: '0.00',
      toleranciaMonto: '0.00',
    },
    esperado: {
      saldoFinalExtracto: '500.00',
      saldoAjustadoBanco: '500.00',
      saldoAjustadoLibros: '500.01',
      diferencia: '-0.01',
      semaforo: 'ROJO',
    },
  },
  {
    nombre: 'Sin extracto importado -> diferencia null y semáforo SIN_EXTRACTO',
    input: {
      tieneExtracto: false,
      saldoFinalExtracto: null,
      depositosEnTransito: '250.00',
      chequesNoCobrados: '50.00',
      saldoLibros: '1200.00',
      abonosNoRegistrados: '10.00',
      cargosNoRegistrados: '5.00',
      toleranciaMonto: '1.00',
    },
    esperado: {
      saldoFinalExtracto: null,
      saldoAjustadoBanco: null,
      saldoAjustadoLibros: '1205.00',
      diferencia: null,
      semaforo: 'SIN_EXTRACTO',
    },
  },
];

export function crearConfigConciliacionFixture(
  overrides: Partial<ConfigConciliacionV2> = {}
): ConfigConciliacionV2 {
  return {
    empresaId: '00000000-0000-4000-8000-000000000001',
    conciliacionV2Habilitada: true,
    toleranciaDias: 3,
    toleranciaMonto: '0.00',
    cuentaItfCodigo: '6412',
    cuentaComisionCodigo: '6391',
    cuentaInteresGastoCodigo: '67311',
    cuentaInteresIngresoCodigo: null,
    sugerenciaCuentaInteresIngreso: '7793',
    configuradaEnBd: true,
    updatedBy: null,
    updatedAt: null,
    ...overrides,
  };
}
