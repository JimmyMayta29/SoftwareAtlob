/**
 * Atlob Consultores ERP — Plantillas de Asientos Preconfiguradas
 * Regla: Cada plantilla declara su método de inventario y la nota obligatoria:
 * "requiere revisión del contador antes de marcarse como estándar"
 */

export interface LineaPlantillaAsiento {
  codigoCuenta: string;
  denominacion: string;
  naturaleza: 'DEBE' | 'HABER';
  esDestino?: boolean;
  centroCostoSugerido?: string;
  glosaSugerida: string;
  requiereDocumento?: boolean;
  requiereAnexo?: boolean;
}

export interface PlantillaAsiento {
  id: string;
  nombre: string;
  subdiario: '00' | '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09';
  metodoInventario: 'permanente' | 'periodico' | 'no_aplica';
  glosaGeneralSugerida: string;
  avisoNormativo: string;
  lineas: LineaPlantillaAsiento[];
}

export const AVISO_REVISION_CONTADOR = 'requiere revisión del contador antes de marcarse como estándar';

export const PLANTILLAS_ASIENTOS: PlantillaAsiento[] = [
  {
    id: 'plantilla-compra-mercaderia',
    nombre: 'Compra de mercaderías (con crédito fiscal)',
    subdiario: '01',
    metodoInventario: 'permanente',
    glosaGeneralSugerida: 'Por la compra de mercaderías según factura del proveedor',
    avisoNormativo: AVISO_REVISION_CONTADOR,
    lineas: [
      {
        codigoCuenta: '6011',
        denominacion: 'Mercaderías manufacturadas',
        naturaleza: 'DEBE',
        glosaSugerida: 'Base imponible compra mercadería',
        requiereDocumento: true,
        requiereAnexo: true,
      },
      {
        codigoCuenta: '40111',
        denominacion: 'IGV - Cuenta propia 18%',
        naturaleza: 'DEBE',
        glosaSugerida: 'IGV crédito fiscal 18%',
        requiereDocumento: true,
        requiereAnexo: true,
      },
      {
        codigoCuenta: '4212',
        denominacion: 'Facturas, boletas y otros comprobantes por pagar - Emitidas',
        naturaleza: 'HABER',
        glosaSugerida: 'Total comprobante de pago proveedor',
        requiereDocumento: true,
        requiereAnexo: true,
      },
      {
        codigoCuenta: '20111',
        denominacion: 'Mercaderías manufacturadas - Costo',
        naturaleza: 'DEBE',
        esDestino: true,
        glosaSugerida: 'Destino al almacén mercaderías',
      },
      {
        codigoCuenta: '6111',
        denominacion: 'Mercaderías manufacturadas',
        naturaleza: 'HABER',
        esDestino: true,
        glosaSugerida: 'Variación de inventarios mercaderías',
      },
    ],
  },
  {
    id: 'plantilla-compra-servicio',
    nombre: 'Compra de servicios prestados por terceros',
    subdiario: '01',
    metodoInventario: 'no_aplica',
    glosaGeneralSugerida: 'Por la contratación y recepción de servicios de terceros',
    avisoNormativo: AVISO_REVISION_CONTADOR,
    lineas: [
      {
        codigoCuenta: '6321',
        denominacion: 'Servicios de asesoría y consultoría administrativa',
        naturaleza: 'DEBE',
        centroCostoSugerido: 'ADMIN',
        glosaSugerida: 'Gasto por servicio administrativo',
        requiereDocumento: true,
        requiereAnexo: true,
      },
      {
        codigoCuenta: '40111',
        denominacion: 'IGV - Cuenta propia 18%',
        naturaleza: 'DEBE',
        glosaSugerida: 'IGV crédito fiscal de servicios',
        requiereDocumento: true,
        requiereAnexo: true,
      },
      {
        codigoCuenta: '4212',
        denominacion: 'Facturas, boletas y otros comprobantes por pagar - Emitidas',
        naturaleza: 'HABER',
        glosaSugerida: 'Obligación con proveedor de servicios',
        requiereDocumento: true,
        requiereAnexo: true,
      },
      {
        codigoCuenta: '9411',
        denominacion: 'Gastos de administración',
        naturaleza: 'DEBE',
        esDestino: true,
        centroCostoSugerido: 'ADMIN',
        glosaSugerida: 'Destino de gastos administrativos',
      },
      {
        codigoCuenta: '7911',
        denominacion: 'Cargas imputables a cuentas de costos y gastos',
        naturaleza: 'HABER',
        esDestino: true,
        glosaSugerida: 'Cargas imputables a cuentas de gestión',
      },
    ],
  },
  {
    id: 'plantilla-venta-mercaderia',
    nombre: 'Venta de mercaderías (con costo de ventas)',
    subdiario: '02',
    metodoInventario: 'permanente',
    glosaGeneralSugerida: 'Por las ventas de mercaderías del período según comprobante',
    avisoNormativo: AVISO_REVISION_CONTADOR,
    lineas: [
      {
        codigoCuenta: '1212',
        denominacion: 'Facturas, boletas y otros comprobantes por cobrar - Emitidas en cartera',
        naturaleza: 'DEBE',
        glosaSugerida: 'Cobro a clientes por venta',
        requiereDocumento: true,
        requiereAnexo: true,
      },
      {
        codigoCuenta: '40111',
        denominacion: 'IGV - Cuenta propia 18%',
        naturaleza: 'HABER',
        glosaSugerida: 'IGV débito fiscal de ventas',
        requiereDocumento: true,
        requiereAnexo: true,
      },
      {
        codigoCuenta: '70111',
        denominacion: 'Mercaderías manufacturadas - Terceros',
        naturaleza: 'HABER',
        glosaSugerida: 'Ingreso por venta de mercaderías',
        requiereDocumento: true,
      },
      {
        codigoCuenta: '69111',
        denominacion: 'Mercaderías manufacturadas - Terceros',
        naturaleza: 'DEBE',
        glosaSugerida: 'Costo de ventas del período',
      },
      {
        codigoCuenta: '20111',
        denominacion: 'Mercaderías manufacturadas - Costo',
        naturaleza: 'HABER',
        glosaSugerida: 'Salida de existencias al costo',
      },
    ],
  },
  {
    id: 'plantilla-recibo-honorarios',
    nombre: 'Recibo por honorarios profesionales (4ta categoría)',
    subdiario: '06',
    metodoInventario: 'no_aplica',
    glosaGeneralSugerida: 'Por servicios profesionales independientes del período',
    avisoNormativo: AVISO_REVISION_CONTADOR,
    lineas: [
      {
        codigoCuenta: '6322',
        denominacion: 'Asesoría legal y tributaria',
        naturaleza: 'DEBE',
        centroCostoSugerido: 'ADMIN',
        glosaSugerida: 'Honorarios profesionales brutos',
        requiereDocumento: true,
        requiereAnexo: true,
      },
      {
        codigoCuenta: '40172',
        denominacion: 'Impuesto a la renta de cuarta categoría (8%)',
        naturaleza: 'HABER',
        glosaSugerida: 'Retención de cuarta categoría 8%',
        requiereDocumento: true,
        requiereAnexo: true,
      },
      {
        codigoCuenta: '4241',
        denominacion: 'Honorarios por pagar',
        naturaleza: 'HABER',
        glosaSugerida: 'Neto a pagar por honorarios',
        requiereDocumento: true,
        requiereAnexo: true,
      },
      {
        codigoCuenta: '9411',
        denominacion: 'Gastos de administración',
        naturaleza: 'DEBE',
        esDestino: true,
        centroCostoSugerido: 'ADMIN',
        glosaSugerida: 'Destino a gastos de administración',
      },
      {
        codigoCuenta: '7911',
        denominacion: 'Cargas imputables a cuentas de costos y gastos',
        naturaleza: 'HABER',
        esDestino: true,
        glosaSugerida: 'Cargas imputables a cuentas de costos',
      },
    ],
  },
  {
    id: 'plantilla-planilla-remuneraciones',
    nombre: 'Planilla de remuneraciones y cargas sociales del mes',
    subdiario: '03',
    metodoInventario: 'no_aplica',
    glosaGeneralSugerida: 'Por la provisión mensual de la planilla de sueldos y aportes',
    avisoNormativo: AVISO_REVISION_CONTADOR,
    lineas: [
      {
        codigoCuenta: '6211',
        denominacion: 'Sueldos y salarios',
        naturaleza: 'DEBE',
        centroCostoSugerido: 'ADMIN',
        glosaSugerida: 'Remuneraciones básicas del personal',
      },
      {
        codigoCuenta: '6221',
        denominacion: 'Asignación familiar (Ley 25129)',
        naturaleza: 'DEBE',
        centroCostoSugerido: 'ADMIN',
        glosaSugerida: 'Asignación familiar legal 10% RMV',
      },
      {
        codigoCuenta: '6271',
        denominacion: 'Régimen de prestaciones de salud (EsSalud 9%)',
        naturaleza: 'DEBE',
        centroCostoSugerido: 'ADMIN',
        glosaSugerida: 'Aporte patronal EsSalud 9%',
      },
      {
        codigoCuenta: '4031',
        denominacion: 'EsSalud por pagar',
        naturaleza: 'HABER',
        glosaSugerida: 'Tributo EsSalud 9% empleador',
      },
      {
        codigoCuenta: '4032',
        denominacion: 'ONP / Sistema de pensiones por pagar',
        naturaleza: 'HABER',
        glosaSugerida: 'Retenciones previsionales ONP / AFP',
      },
      {
        codigoCuenta: '40173',
        denominacion: 'Renta de quinta categoría retenciones',
        naturaleza: 'HABER',
        glosaSugerida: 'Retenciones impuesto renta 5ta categoría',
      },
      {
        codigoCuenta: '4111',
        denominacion: 'Sueldos y salarios por pagar',
        naturaleza: 'HABER',
        glosaSugerida: 'Neto a pagar remuneraciones',
        requiereAnexo: true,
      },
      {
        codigoCuenta: '9411',
        denominacion: 'Gastos de administración - Personal',
        naturaleza: 'DEBE',
        esDestino: true,
        centroCostoSugerido: 'ADMIN',
        glosaSugerida: 'Destino a gastos de administración',
      },
      {
        codigoCuenta: '7911',
        denominacion: 'Cargas imputables a cuentas de costos y gastos',
        naturaleza: 'HABER',
        esDestino: true,
        glosaSugerida: 'Cargas imputables por gastos de personal',
      },
    ],
  },
  {
    id: 'plantilla-depreciacion',
    nombre: 'Depreciación del ejercicio de propiedad, planta y equipo',
    subdiario: '07',
    metodoInventario: 'no_aplica',
    glosaGeneralSugerida: 'Por la depreciación periódica del activo fijo según tablas SUNAT',
    avisoNormativo: AVISO_REVISION_CONTADOR,
    lineas: [
      {
        codigoCuenta: '6814',
        denominacion: 'Depreciación de equipos de transporte y cómputo',
        naturaleza: 'DEBE',
        centroCostoSugerido: 'ADMIN',
        glosaSugerida: 'Gasto por depreciación del ejercicio',
      },
      {
        codigoCuenta: '3913',
        denominacion: 'Depreciación acumulada de propiedad, planta y equipo',
        naturaleza: 'HABER',
        glosaSugerida: 'Depreciación acumulada activo fijo',
      },
      {
        codigoCuenta: '9411',
        denominacion: 'Gastos de administración',
        naturaleza: 'DEBE',
        esDestino: true,
        centroCostoSugerido: 'ADMIN',
        glosaSugerida: 'Destino a gastos administrativos',
      },
      {
        codigoCuenta: '7911',
        denominacion: 'Cargas imputables a cuentas de costos y gastos',
        naturaleza: 'HABER',
        esDestino: true,
        glosaSugerida: 'Cargas imputables por depreciación',
      },
    ],
  },
  {
    id: 'plantilla-amortizacion',
    nombre: 'Amortización del ejercicio de activos intangibles',
    subdiario: '07',
    metodoInventario: 'no_aplica',
    glosaGeneralSugerida: 'Por la amortización periódica de software y licencias intangibles',
    avisoNormativo: AVISO_REVISION_CONTADOR,
    lineas: [
      {
        codigoCuenta: '6821',
        denominacion: 'Amortización de intangibles - Programas de cómputo',
        naturaleza: 'DEBE',
        centroCostoSugerido: 'ADMIN',
        glosaSugerida: 'Gasto por amortización intangible',
      },
      {
        codigoCuenta: '3921',
        denominacion: 'Amortización acumulada de intangibles',
        naturaleza: 'HABER',
        glosaSugerida: 'Amortización acumulada software',
      },
      {
        codigoCuenta: '9411',
        denominacion: 'Gastos de administración',
        naturaleza: 'DEBE',
        esDestino: true,
        centroCostoSugerido: 'ADMIN',
        glosaSugerida: 'Destino a gastos administrativos',
      },
      {
        codigoCuenta: '7911',
        denominacion: 'Cargas imputables a cuentas de costos y gastos',
        naturaleza: 'HABER',
        esDestino: true,
        glosaSugerida: 'Cargas imputables por amortización',
      },
    ],
  },
];

