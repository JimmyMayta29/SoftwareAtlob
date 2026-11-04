/**
 * Atlob Consultores ERP — Plan Contable General Empresarial (PCGE 2019 Modificado)
 * Conforme a Resolución CNC N° 002-2019-EF/30 y especificación PLE 5.x
 */

export type TipoNormativoPCGE = 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'GESTION' | 'CIERRE';
export type TipoLegacyPCGE = 'BALANCE' | 'RESULTADOS' | 'COSTOS';
export type NaturalezaPCGE = 'DEUDORA' | 'ACREEDORA';
export type MonedaCuentaPCGE = 'PEN' | 'USD' | 'MULTI';

export interface CuentaPCGE {
  codigo: string;
  nombre: string;
  denominacion?: string;
  elemento: number;
  nivel: number; // 2 a 6 dígitos
  naturaleza: NaturalezaPCGE;
  tipo: TipoLegacyPCGE;
  tipoNormativo: TipoNormativoPCGE;
  permiteMovimiento: boolean; // false para cuentas de mayor (2 dígitos); true para subcuentas imputables
  monedaCuenta: MonedaCuentaPCGE;
  requiereAnexo: boolean;
  requiereDocumento: boolean;
  requiereCentroCosto: boolean;
  requiereVencimiento: boolean;
  cuentaDestinoDebe?: string;
  cuentaDestinoHaber?: string;
}

export const PLAN_CONTABLE_PCGE: CuentaPCGE[] = [
  // ==========================================================================
  // ELEMENTO 1: ACTIVO DISPONIBLE Y EXIGIBLE
  // ==========================================================================
  // Cuentas de Mayor (No imputables)
  {
    codigo: '10',
    nombre: 'Efectivo y equivalentes de efectivo',
    elemento: 1,
    nivel: 2,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: false,
    monedaCuenta: 'MULTI',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '12',
    nombre: 'Cuentas por cobrar comerciales - Terceros',
    elemento: 1,
    nivel: 2,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: false,
    monedaCuenta: 'MULTI',
    requiereAnexo: true,
    requiereDocumento: true,
    requiereCentroCosto: false,
    requiereVencimiento: true
  },
  {
    codigo: '14',
    nombre: 'Cuentas por cobrar al personal, a los accionistas y directores',
    elemento: 1,
    nivel: 2,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: false,
    monedaCuenta: 'PEN',
    requiereAnexo: true,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '16',
    nombre: 'Cuentas por cobrar diversas - Terceros',
    elemento: 1,
    nivel: 2,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: false,
    monedaCuenta: 'MULTI',
    requiereAnexo: true,
    requiereDocumento: true,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },

  // Cuentas de Movimiento (Imputables)
  {
    codigo: '101',
    nombre: 'Caja',
    elemento: 1,
    nivel: 3,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '1011',
    nombre: 'Caja moneda nacional',
    elemento: 1,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '1041',
    nombre: 'Cuentas corrientes operativas',
    elemento: 1,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '1042',
    nombre: 'Cuentas corrientes para fines específicos (Detracciones Banco de la Nación)',
    elemento: 1,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '1212',
    nombre: 'Facturas, boletas y otros comprobantes por cobrar - Emitidas en cartera',
    elemento: 1,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: true,
    monedaCuenta: 'MULTI',
    requiereAnexo: true,
    requiereDocumento: true,
    requiereCentroCosto: false,
    requiereVencimiento: true
  },
  {
    codigo: '1213',
    nombre: 'Facturas, boletas y otros comprobantes por cobrar - En cobranza',
    elemento: 1,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: true,
    monedaCuenta: 'MULTI',
    requiereAnexo: true,
    requiereDocumento: true,
    requiereCentroCosto: false,
    requiereVencimiento: true
  },
  {
    codigo: '141',
    nombre: 'Cuentas por cobrar al personal - Préstamos',
    elemento: 1,
    nivel: 3,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: true,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '1673',
    nombre: 'IGV por acreditar en compras',
    elemento: 1,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: true,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },

  // ==========================================================================
  // ELEMENTO 2: ACTIVO REALIZABLE (EXISTENCIAS)
  // ==========================================================================
  {
    codigo: '20',
    nombre: 'Mercaderías',
    elemento: 2,
    nivel: 2,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: false,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '20111',
    nombre: 'Mercaderías manufacturadas - Costo',
    elemento: 2,
    nivel: 5,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '2524',
    nombre: 'Suministros diversos',
    elemento: 2,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },

  // ==========================================================================
  // ELEMENTO 3: ACTIVO INMOVILIZADO
  // ==========================================================================
  {
    codigo: '33',
    nombre: 'Propiedad, planta y equipo',
    elemento: 3,
    nivel: 2,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: false,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '33311',
    nombre: 'Maquinarias y equipos de explotación - Costo',
    elemento: 3,
    nivel: 5,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '33511',
    nombre: 'Muebles y enseres - Costo',
    elemento: 3,
    nivel: 5,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '33611',
    nombre: 'Equipos para procesamiento de información (Cómputo)',
    elemento: 3,
    nivel: 5,
    naturaleza: 'DEUDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '3913',
    nombre: 'Depreciación acumulada de propiedad, planta y equipo',
    elemento: 3,
    nivel: 4,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '392',
    nombre: 'Amortización acumulada',
    elemento: 3,
    nivel: 3,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: false,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '3921',
    nombre: 'Amortización acumulada de intangibles',
    elemento: 3,
    nivel: 4,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'ACTIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },

  // ==========================================================================
  // ELEMENTO 4: PASIVO
  // ==========================================================================
  {
    codigo: '40',
    nombre: 'Tributos, contraprestaciones y aportes al sistema público de pensiones y de salud por pagar',
    elemento: 4,
    nivel: 2,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'PASIVO',
    permiteMovimiento: false,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '40111',
    nombre: 'Gobierno nacional - IGV - Cuenta propia',
    elemento: 4,
    nivel: 5,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'PASIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '40171',
    nombre: 'Renta de tercera categoría - Pagos a cuenta',
    elemento: 4,
    nivel: 5,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'PASIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '40172',
    nombre: 'Renta de cuarta categoría (Retención Honorarios)',
    elemento: 4,
    nivel: 5,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'PASIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '4031',
    nombre: 'EsSalud',
    elemento: 4,
    nivel: 4,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'PASIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '4032',
    nombre: 'ONP',
    elemento: 4,
    nivel: 4,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'PASIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '41',
    nombre: 'Remuneraciones y participaciones por pagar',
    elemento: 4,
    nivel: 2,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'PASIVO',
    permiteMovimiento: false,
    monedaCuenta: 'PEN',
    requiereAnexo: true,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: true
  },
  {
    codigo: '411',
    nombre: 'Remuneraciones por pagar',
    elemento: 4,
    nivel: 3,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'PASIVO',
    permiteMovimiento: false,
    monedaCuenta: 'PEN',
    requiereAnexo: true,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: true
  },
  {
    codigo: '4111',
    nombre: 'Sueldos y salarios por pagar',
    elemento: 4,
    nivel: 4,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'PASIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: true,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: true
  },
  {
    codigo: '42',
    nombre: 'Cuentas por pagar comerciales - Terceros',
    elemento: 4,
    nivel: 2,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'PASIVO',
    permiteMovimiento: false,
    monedaCuenta: 'MULTI',
    requiereAnexo: true,
    requiereDocumento: true,
    requiereCentroCosto: false,
    requiereVencimiento: true
  },
  {
    codigo: '4212',
    nombre: 'Cuentas por pagar comerciales - Emitidas en cartera',
    elemento: 4,
    nivel: 4,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'PASIVO',
    permiteMovimiento: true,
    monedaCuenta: 'MULTI',
    requiereAnexo: true,
    requiereDocumento: true,
    requiereCentroCosto: false,
    requiereVencimiento: true
  },
  {
    codigo: '4213',
    nombre: 'Cuentas por pagar comerciales - Detracciones por pagar',
    elemento: 4,
    nivel: 4,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'PASIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: true,
    requiereDocumento: true,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '424',
    nombre: 'Honorarios por pagar',
    elemento: 4,
    nivel: 3,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'PASIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: true,
    requiereDocumento: true,
    requiereCentroCosto: false,
    requiereVencimiento: true
  },
  {
    codigo: '4241',
    nombre: 'Honorarios por pagar',
    elemento: 4,
    nivel: 4,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'PASIVO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: true,
    requiereDocumento: true,
    requiereCentroCosto: false,
    requiereVencimiento: true
  },

  // ==========================================================================
  // ELEMENTO 5: PATRIMONIO NETO
  // ==========================================================================
  {
    codigo: '50',
    nombre: 'Capital',
    elemento: 5,
    nivel: 2,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'PATRIMONIO',
    permiteMovimiento: false,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '5011',
    nombre: 'Capital social - Acciones comunes',
    elemento: 5,
    nivel: 4,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'PATRIMONIO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '582',
    nombre: 'Reserva legal',
    elemento: 5,
    nivel: 3,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'PATRIMONIO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '5911',
    nombre: 'Utilidades acumuladas',
    elemento: 5,
    nivel: 4,
    naturaleza: 'ACREEDORA',
    tipo: 'BALANCE',
    tipoNormativo: 'PATRIMONIO',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },

  // ==========================================================================
  // ELEMENTO 6: GASTOS POR NATURALEZA
  // ==========================================================================
  {
    codigo: '60',
    nombre: 'Compras',
    elemento: 6,
    nivel: 2,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: false,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '6011',
    nombre: 'Mercaderías manufacturadas',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false,
    cuentaDestinoDebe: '20111',
    cuentaDestinoHaber: '6111'
  },
  {
    codigo: '6032',
    nombre: 'Suministros para oficina',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false,
    cuentaDestinoDebe: '2524',
    cuentaDestinoHaber: '612'
  },
  {
    codigo: '6111',
    nombre: 'Variación de inventarios - Mercaderías',
    elemento: 6,
    nivel: 4,
    naturaleza: 'ACREEDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '6211',
    nombre: 'Sueldos y salarios',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: true,
    requiereDocumento: false,
    requiereCentroCosto: true,
    requiereVencimiento: false,
    cuentaDestinoDebe: '941',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '6221',
    nombre: 'Otras remuneraciones - Asignación familiar (Ley 25129)',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: true,
    requiereDocumento: false,
    requiereCentroCosto: true,
    requiereVencimiento: false,
    cuentaDestinoDebe: '941',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '6271',
    nombre: 'Régimen de prestaciones de salud (EsSalud)',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: true,
    requiereVencimiento: false,
    cuentaDestinoDebe: '941',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '6311',
    nombre: 'Transporte de carga y encomiendas',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: true,
    requiereVencimiento: false,
    cuentaDestinoDebe: '941',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '6321',
    nombre: 'Asesoría contable, jurídica y auditoría',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: true,
    requiereDocumento: true,
    requiereCentroCosto: true,
    requiereVencimiento: false,
    cuentaDestinoDebe: '941',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '6322',
    nombre: 'Asesoría legal y tributaria',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: true,
    requiereDocumento: true,
    requiereCentroCosto: true,
    requiereVencimiento: false,
    cuentaDestinoDebe: '941',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '6341',
    nombre: 'Mantenimiento y reparaciones',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: true,
    requiereVencimiento: false,
    cuentaDestinoDebe: '941',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '6351',
    nombre: 'Alquiler de locales comerciales u oficinas',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: true,
    requiereVencimiento: false,
    cuentaDestinoDebe: '941',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '6361',
    nombre: 'Servicios básicos - Energía eléctrica (Luz)',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: true,
    requiereCentroCosto: true,
    requiereVencimiento: false,
    cuentaDestinoDebe: '941',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '6362',
    nombre: 'Servicios básicos - Gas',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: true,
    requiereCentroCosto: true,
    requiereVencimiento: false,
    cuentaDestinoDebe: '941',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '6363',
    nombre: 'Servicios básicos - Agua potable',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: true,
    requiereCentroCosto: true,
    requiereVencimiento: false,
    cuentaDestinoDebe: '941',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '6364',
    nombre: 'Servicios básicos - Telefonía, Internet y Telecomunicaciones',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: true,
    requiereCentroCosto: true,
    requiereVencimiento: false,
    cuentaDestinoDebe: '941',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '6371',
    nombre: 'Publicidad y marketing digital',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: true,
    requiereVencimiento: false,
    cuentaDestinoDebe: '951',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '6391',
    nombre: 'Otros servicios prestados por terceros',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: true,
    requiereVencimiento: false,
    cuentaDestinoDebe: '941',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '651',
    nombre: 'Seguros contra siniestros',
    elemento: 6,
    nivel: 3,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: true,
    requiereVencimiento: false,
    cuentaDestinoDebe: '941',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '659',
    nombre: 'Otros gastos de gestión diversos',
    elemento: 6,
    nivel: 3,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: true,
    requiereVencimiento: false,
    cuentaDestinoDebe: '941',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '6591',
    nombre: 'Otros gastos de gestión - Ajustes diversos y diferencias de redondeo',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false,
    cuentaDestinoDebe: '941',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '68',
    nombre: 'Valuación y deterioro de activos y provisiones',
    elemento: 6,
    nivel: 2,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: false,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '6814',
    nombre: 'Depreciación de equipos de transporte y cómputo',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: true,
    requiereVencimiento: false,
    cuentaDestinoDebe: '941',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '6821',
    nombre: 'Amortización de intangibles - Programas de cómputo',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: true,
    requiereVencimiento: false,
    cuentaDestinoDebe: '941',
    cuentaDestinoHaber: '791'
  },
  {
    codigo: '6911',
    nombre: 'Costo de ventas - Mercaderías manufacturadas',
    elemento: 6,
    nivel: 4,
    naturaleza: 'DEUDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },

  // ==========================================================================
  // ELEMENTO 7: INGRESOS
  // ==========================================================================
  {
    codigo: '70',
    nombre: 'Ventas',
    elemento: 7,
    nivel: 2,
    naturaleza: 'ACREEDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: false,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '70111',
    nombre: 'Ventas de mercaderías - Mercado local terceros',
    elemento: 7,
    nivel: 5,
    naturaleza: 'ACREEDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '70411',
    nombre: 'Prestación de servicios - Mercado local',
    elemento: 7,
    nivel: 5,
    naturaleza: 'ACREEDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '759',
    nombre: 'Otros ingresos de gestión diversos',
    elemento: 7,
    nivel: 3,
    naturaleza: 'ACREEDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '7591',
    nombre: 'Otros ingresos de gestión - Ajustes diversos y diferencias de redondeo',
    elemento: 7,
    nivel: 4,
    naturaleza: 'ACREEDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },
  {
    codigo: '772',
    nombre: 'Rendimientos ganados / Intereses financieros',
    elemento: 7,
    nivel: 3,
    naturaleza: 'ACREEDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },

  // ==========================================================================
  // ELEMENTO 8: SALDOS INTERMEDIARIOS DE GESTIÓN Y CIERRE
  // ==========================================================================
  {
    codigo: '891',
    nombre: 'Utilidad del ejercicio',
    elemento: 8,
    nivel: 3,
    naturaleza: 'ACREEDORA',
    tipo: 'RESULTADOS',
    tipoNormativo: 'CIERRE',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  },

  // ==========================================================================
  // ELEMENTO 9: CUENTAS DE DESTINO (COSTOS Y GASTOS POR FUNCIÓN)
  // ==========================================================================
  {
    codigo: '941',
    nombre: 'Gastos de Administración',
    elemento: 9,
    nivel: 3,
    naturaleza: 'DEUDORA',
    tipo: 'COSTOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: true,
    requiereVencimiento: false
  },
  {
    codigo: '951',
    nombre: 'Gastos de Ventas',
    elemento: 9,
    nivel: 3,
    naturaleza: 'DEUDORA',
    tipo: 'COSTOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: true,
    requiereVencimiento: false
  },
  {
    codigo: '791',
    nombre: 'Cargas imputables a cuentas de costos y gastos',
    elemento: 7,
    nivel: 3,
    naturaleza: 'ACREEDORA',
    tipo: 'COSTOS',
    tipoNormativo: 'GESTION',
    permiteMovimiento: true,
    monedaCuenta: 'PEN',
    requiereAnexo: false,
    requiereDocumento: false,
    requiereCentroCosto: false,
    requiereVencimiento: false
  }
];

export function buscarCuentaPCGE(codigo: string): CuentaPCGE | undefined {
  if (!codigo) return undefined;
  // 1. Coincidencia exacta
  const exacta = PLAN_CONTABLE_PCGE.find(c => c.codigo === codigo);
  if (exacta) return exacta;
  // 2. Coincidencia por prefijo más específico (de mayor a menor longitud)
  const candidatas = PLAN_CONTABLE_PCGE
    .filter(c => codigo.startsWith(c.codigo) || c.codigo.startsWith(codigo))
    .sort((a, b) => b.codigo.length - a.codigo.length);
  return candidatas[0];
}

export function validarRequisitosCuentaPCGE(
  cuenta: CuentaPCGE,
  datos: {
    anexo?: string | null;
    docTipo?: string | null;
    docNumero?: string | null;
    centroCosto?: string | null;
    fechaVencimiento?: string | null;
  }
): { valido: boolean; motivo?: string } {
  if (!cuenta.permiteMovimiento) {
    return { valido: false, motivo: `CUENTA_NO_IMPUTABLE: La cuenta ${cuenta.codigo} es de mayor/título y no permite apuntes directos.` };
  }
  if (cuenta.requiereAnexo && !datos.anexo) {
    return { valido: false, motivo: `ANEXO_REQUERIDO: La cuenta ${cuenta.codigo} exige especificar Anexo (RUC/DNI).` };
  }
  if (cuenta.requiereDocumento && (!datos.docTipo || !datos.docNumero)) {
    return { valido: false, motivo: `DOCUMENTO_REQUERIDO: La cuenta ${cuenta.codigo} exige tipo y número de comprobante de referencia.` };
  }
  if (cuenta.requiereCentroCosto && !datos.centroCosto) {
    return { valido: false, motivo: `CENTRO_COSTO_REQUERIDO: La cuenta ${cuenta.codigo} exige indicar Centro de Costo.` };
  }
  if (cuenta.requiereVencimiento && !datos.fechaVencimiento) {
    return { valido: false, motivo: `VENCIMIENTO_REQUERIDO: La cuenta ${cuenta.codigo} exige indicar Fecha de Vencimiento.` };
  }
  return { valido: true };
}
