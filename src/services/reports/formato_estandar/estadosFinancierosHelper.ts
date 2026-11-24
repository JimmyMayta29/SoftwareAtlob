export interface CuentaDesgloseEsf {
  codigo: string;
  nombre: string;
  actual: number;
  anterior: number;
}

export interface RubroEsf {
  id: string;
  nombre: string;
  actual: number;
  anterior: number;
  cuentas: CuentaDesgloseEsf[];
}

export interface EstructuraEsfFinanciera {
  anioActual: string;
  anioAnterior: string;
  activoCorriente: RubroEsf[];
  activoNoCorriente: RubroEsf[];
  pasivoCorriente: RubroEsf[];
  pasivoNoCorriente: RubroEsf[];
  patrimonio: RubroEsf[];
  totalActivoCorrienteActual: number;
  totalActivoCorrienteAnterior: number;
  totalActivoNoCorrienteActual: number;
  totalActivoNoCorrienteAnterior: number;
  totalActivoActual: number;
  totalActivoAnterior: number;
  totalPasivoCorrienteActual: number;
  totalPasivoCorrienteAnterior: number;
  totalPasivoNoCorrienteActual: number;
  totalPasivoNoCorrienteAnterior: number;
  totalPasivoActual: number;
  totalPasivoAnterior: number;
  totalPatrimonioActual: number;
  totalPatrimonioAnterior: number;
  totalPasivoYPatrimonioActual: number;
  totalPasivoYPatrimonioAnterior: number;
  estaCuadrado: boolean;
}

export interface LineaEstadoFinanciero {
  id: string;
  concepto: string;
  actual: number;
  anterior: number;
  tipo: 'seccion' | 'detalle' | 'subtotal' | 'total';
  lineaSuperior?: boolean;
  lineaInferior?: boolean;
}

export interface EstructuraErFinanciera {
  anioActual: string;
  anioAnterior: string;
  modo: 'funcion' | 'naturaleza';
  lineas: LineaEstadoFinanciero[];
  utilidadNetaActual: number;
  utilidadNetaAnterior: number;
}

export interface EstructuraFeFinanciera {
  anioActual: string;
  anioAnterior: string;
  lineas: LineaEstadoFinanciero[];
  saldoFinalActual: number;
  saldoFinalAnterior: number;
}

const MESES_LARGO = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'
];

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function obtenerAniosComparativos(periodo?: string): { anioActual: string; anioAnterior: string } {
  const anioParsed = periodo && /^\d{4}/.test(periodo) ? parseInt(periodo.slice(0, 4), 10) : 2026;
  const anioNum = Number.isFinite(anioParsed) && anioParsed > 1900 ? anioParsed : 2026;
  return {
    anioActual: String(anioNum),
    anioAnterior: String(anioNum - 1)
  };
}

export function formatearCortePeriodoFinanciero(periodo: string, acumulado = true): string {
  const { anioActual } = obtenerAniosComparativos(periodo);
  const anioNum = parseInt(anioActual, 10);
  const mesRaw = periodo && periodo.includes('-') ? parseInt(periodo.split('-')[1], 10) : 12;
  const mesNum = Number.isFinite(mesRaw) && mesRaw >= 1 && mesRaw <= 12 ? mesRaw : 12;
  const mesNombre = MESES_LARGO[mesNum - 1];
  if (!acumulado) {
    return `Por el mes de ${mesNombre} de ${anioNum}`;
  }
  const ultimoDia = new Date(anioNum, mesNum, 0).getDate();
  return `Al ${ultimoDia} de ${mesNombre} de ${anioNum}`;
}

export function formatearMontoFinanciero(
  valor: number | null | undefined,
  opts?: { esTotal?: boolean; guionEnCero?: boolean }
): string {
  const num = typeof valor === 'number' && !Number.isNaN(valor) ? valor : Number(valor || 0);
  if (Number.isNaN(num) || Math.abs(num) < 0.005) {
    if (opts?.guionEnCero) return '-';
    if (opts?.esTotal) return '0.00';
    return '';
  }
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

interface DefinicionRubroEsf {
  id: string;
  nombre: string;
  opcional?: boolean;
  match: (codigo: string) => boolean;
}

const RUBROS_ACTIVO_CORRIENTE: DefinicionRubroEsf[] = [
  { id: 'ac-efectivo', nombre: 'Efectivo y equivalentes de efectivo', match: (c) => c.startsWith('10') },
  {
    id: 'ac-cxc-com',
    nombre: 'Cuentas por cobrar comerciales, neto',
    match: (c) => c.startsWith('12') || c.startsWith('191') || c.startsWith('192')
  },
  {
    id: 'ac-cxc-pers',
    nombre: 'Cuentas por cobrar al personal, accionistas y directores',
    match: (c) => c.startsWith('14') || c.startsWith('194')
  },
  {
    id: 'ac-cxc-rel',
    nombre: 'Cuentas por cobrar diversas, relacionadas',
    match: (c) => c.startsWith('13') || c.startsWith('17') || c.startsWith('193')
  },
  {
    id: 'ac-cxc-terc',
    nombre: 'Cuentas por cobrar diversas, terceros',
    match: (c) => c.startsWith('16') || c.startsWith('195') || c.startsWith('196') || c.startsWith('197') || c.startsWith('19')
  },
  {
    id: 'ac-serv-ant',
    nombre: 'Servicios y otros contratados por anticipado',
    match: (c) => c.startsWith('18')
  },
  {
    id: 'ac-merc',
    nombre: 'Mercaderías',
    match: (c) => c.startsWith('20') || c.startsWith('291')
  },
  {
    id: 'ac-prod',
    nombre: 'Productos terminados y en proceso',
    opcional: true,
    match: (c) => c.startsWith('21') || c.startsWith('22') || c.startsWith('23') || c.startsWith('292') || c.startsWith('293') || c.startsWith('294')
  },
  {
    id: 'ac-mat-primas',
    nombre: 'Materias primas',
    match: (c) => c.startsWith('24') || c.startsWith('295')
  },
  {
    id: 'ac-mat-aux',
    nombre: 'Materiales auxiliares, suministros y repuestos',
    match: (c) => c.startsWith('25') || c.startsWith('296')
  },
  {
    id: 'ac-envases',
    nombre: 'Envases y embalajes',
    match: (c) => c.startsWith('26') || c.startsWith('297')
  },
  {
    id: 'ac-otros',
    nombre: 'Otros activos corrientes',
    opcional: true,
    match: () => true
  }
];

const RUBROS_ACTIVO_NO_CORRIENTE: DefinicionRubroEsf[] = [
  {
    id: 'anc-ppe',
    nombre: 'Propiedad, planta y equipo, neto',
    match: (c) => c.startsWith('33') || c.startsWith('363') || c.startsWith('364') || c.startsWith('391') || c.startsWith('393') || c.startsWith('395')
  },
  {
    id: 'anc-uso',
    nombre: 'Activos por derecho de uso, neto',
    match: (c) => c.startsWith('32') || c.startsWith('392')
  },
  {
    id: 'anc-intang',
    nombre: 'Activos intangibles, neto',
    opcional: true,
    match: (c) => c.startsWith('34') || c.startsWith('365') || c.startsWith('394') || c.startsWith('396')
  },
  {
    id: 'anc-inv',
    nombre: 'Inversiones financieras y propiedades de inversión',
    opcional: true,
    match: (c) => c.startsWith('30') || c.startsWith('31') || c.startsWith('361') || c.startsWith('362')
  },
  {
    id: 'anc-dif',
    nombre: 'Activo diferido',
    match: (c) => c.startsWith('37')
  },
  {
    id: 'anc-otros',
    nombre: 'Otros activos no corrientes',
    opcional: true,
    match: () => true
  }
];

const RUBROS_PASIVO_CORRIENTE: DefinicionRubroEsf[] = [
  { id: 'pc-trib', nombre: 'Tributos, contraprestaciones y aportes', match: (c) => c.startsWith('40') },
  { id: 'pc-rem', nombre: 'Remuneraciones y participaciones por pagar', match: (c) => c.startsWith('41') },
  { id: 'pc-cxp-com', nombre: 'Cuentas por pagar comerciales', match: (c) => c.startsWith('42') || c.startsWith('43') },
  { id: 'pc-cxp-acc', nombre: 'Cuentas por pagar a accionistas', match: (c) => c.startsWith('44') },
  { id: 'pc-cxp-terc', nombre: 'Cuentas por pagar diversas, terceros', match: (c) => c.startsWith('46') },
  { id: 'pc-cxp-rel', nombre: 'Cuentas por pagar diversas, relacionadas', match: (c) => c.startsWith('47') },
  { id: 'pc-otros', nombre: 'Otros pasivos corrientes', opcional: true, match: () => true }
];

const RUBROS_PASIVO_NO_CORRIENTE: DefinicionRubroEsf[] = [
  { id: 'pnc-obl', nombre: 'Obligaciones financieras', match: (c) => c.startsWith('45') },
  { id: 'pnc-prov', nombre: 'Provisiones', match: (c) => c.startsWith('48') },
  { id: 'pnc-otros', nombre: 'Pasivo diferido y otros pasivos no corrientes', opcional: true, match: () => true }
];

const RUBROS_PATRIMONIO: DefinicionRubroEsf[] = [
  { id: 'pat-cap', nombre: 'Capital emitido', match: (c) => c.startsWith('50') },
  { id: 'pat-adic', nombre: 'Capital adicional', match: (c) => c.startsWith('51') || c.startsWith('52') },
  { id: 'pat-res', nombre: 'Reservas', opcional: true, match: (c) => c.startsWith('58') },
  { id: 'pat-no-real', nombre: 'Resultados no realizados', opcional: true, match: (c) => c.startsWith('56') || c.startsWith('57') },
  { id: 'pat-acum', nombre: 'Resultados acumulados', match: (c) => c.startsWith('59') }
];

function agruparBloqueEsf(
  definiciones: DefinicionRubroEsf[],
  itemsActual: any[] | undefined,
  itemsAnterior: any[] | undefined
): RubroEsf[] {
  const buckets = new Map<string, { nombre: string; opcional: boolean; cuentas: Map<string, CuentaDesgloseEsf> }>();
  for (const d of definiciones) {
    buckets.set(d.id, { nombre: d.nombre, opcional: Boolean(d.opcional), cuentas: new Map() });
  }

  const registrarItem = (item: any, campo: 'actual' | 'anterior') => {
    const codigo = String(item?.codigo || '').trim();
    const nombre = String(item?.nombre || item?.rubro || 'Cuenta').trim();
    const monto = Number(item?.monto ?? item?.importe ?? 0) || 0;
    if (!codigo && monto === 0) return;
    const def = definiciones.find((d) => d.match(codigo)) || definiciones[definiciones.length - 1];
    const bucket = buckets.get(def.id)!;
    const key = codigo || nombre;
    const prev = bucket.cuentas.get(key) || { codigo, nombre, actual: 0, anterior: 0 };
    prev[campo] = round2(prev[campo] + monto);
    if (!prev.nombre && nombre) prev.nombre = nombre;
    bucket.cuentas.set(key, prev);
  };

  (Array.isArray(itemsActual) ? itemsActual : []).forEach((it) => registrarItem(it, 'actual'));
  (Array.isArray(itemsAnterior) ? itemsAnterior : []).forEach((it) => registrarItem(it, 'anterior'));

  const rubros: RubroEsf[] = [];
  for (const d of definiciones) {
    const bucket = buckets.get(d.id)!;
    const cuentas = Array.from(bucket.cuentas.values())
      .filter((c) => Math.abs(c.actual) >= 0.005 || Math.abs(c.anterior) >= 0.005)
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
    const actual = round2(cuentas.reduce((acc, c) => acc + c.actual, 0));
    const anterior = round2(cuentas.reduce((acc, c) => acc + c.anterior, 0));
    if (bucket.opcional && Math.abs(actual) < 0.005 && Math.abs(anterior) < 0.005) {
      continue;
    }
    rubros.push({
      id: d.id,
      nombre: bucket.nombre,
      actual,
      anterior,
      cuentas
    });
  }
  return rubros;
}

export function agruparEstadoSituacionFinanciera(
  dataActual: any,
  dataAnterior?: any,
  periodo?: string
): EstructuraEsfFinanciera {
  const { anioActual, anioAnterior } = obtenerAniosComparativos(periodo || dataActual?.periodo);

  const activoCorriente = agruparBloqueEsf(
    RUBROS_ACTIVO_CORRIENTE,
    dataActual?.activoCorriente,
    dataAnterior?.activoCorriente
  );
  const activoNoCorriente = agruparBloqueEsf(
    RUBROS_ACTIVO_NO_CORRIENTE,
    dataActual?.activoNoCorriente,
    dataAnterior?.activoNoCorriente
  );
  const pasivoCorriente = agruparBloqueEsf(
    RUBROS_PASIVO_CORRIENTE,
    dataActual?.pasivoCorriente,
    dataAnterior?.pasivoCorriente
  );
  const pasivoNoCorriente = agruparBloqueEsf(
    RUBROS_PASIVO_NO_CORRIENTE,
    dataActual?.pasivoNoCorriente,
    dataAnterior?.pasivoNoCorriente
  );
  const patrimonio = agruparBloqueEsf(
    RUBROS_PATRIMONIO,
    dataActual?.patrimonioNeto,
    dataAnterior?.patrimonioNeto
  );

  const resEjActual = round2(Number(dataActual?.resultadoDelEjercicio || 0));
  const resEjAnterior = round2(Number(dataAnterior?.resultadoDelEjercicio || 0));
  patrimonio.push({
    id: 'pat-utilidad',
    nombre: resEjActual < 0 ? 'Resultado del ejercicio (Pérdida)' : 'Resultado del ejercicio',
    actual: resEjActual,
    anterior: resEjAnterior,
    cuentas: (Math.abs(resEjActual) >= 0.005 || Math.abs(resEjAnterior) >= 0.005)
      ? [{ codigo: '59 / 89', nombre: 'Resultado del Ejercicio', actual: resEjActual, anterior: resEjAnterior }]
      : []
  });

  const sumRubros = (r: RubroEsf[], k: 'actual' | 'anterior') => round2(r.reduce((acc, it) => acc + it[k], 0));

  const totalActivoCorrienteActual = dataActual?.totalActivoCorriente !== undefined
    ? round2(Number(dataActual.totalActivoCorriente))
    : sumRubros(activoCorriente, 'actual');
  const totalActivoCorrienteAnterior = dataAnterior?.totalActivoCorriente !== undefined
    ? round2(Number(dataAnterior.totalActivoCorriente))
    : sumRubros(activoCorriente, 'anterior');

  const totalActivoNoCorrienteActual = dataActual?.totalActivoNoCorriente !== undefined
    ? round2(Number(dataActual.totalActivoNoCorriente))
    : sumRubros(activoNoCorriente, 'actual');
  const totalActivoNoCorrienteAnterior = dataAnterior?.totalActivoNoCorriente !== undefined
    ? round2(Number(dataAnterior.totalActivoNoCorriente))
    : sumRubros(activoNoCorriente, 'anterior');

  const totalActivoActual = dataActual?.totalActivo !== undefined
    ? round2(Number(dataActual.totalActivo))
    : round2(totalActivoCorrienteActual + totalActivoNoCorrienteActual);
  const totalActivoAnterior = dataAnterior?.totalActivo !== undefined
    ? round2(Number(dataAnterior.totalActivo))
    : round2(totalActivoCorrienteAnterior + totalActivoNoCorrienteAnterior);

  const totalPasivoCorrienteActual = dataActual?.totalPasivoCorriente !== undefined
    ? round2(Number(dataActual.totalPasivoCorriente))
    : sumRubros(pasivoCorriente, 'actual');
  const totalPasivoCorrienteAnterior = dataAnterior?.totalPasivoCorriente !== undefined
    ? round2(Number(dataAnterior.totalPasivoCorriente))
    : sumRubros(pasivoCorriente, 'anterior');

  const totalPasivoNoCorrienteActual = dataActual?.totalPasivoNoCorriente !== undefined
    ? round2(Number(dataActual.totalPasivoNoCorriente))
    : sumRubros(pasivoNoCorriente, 'actual');
  const totalPasivoNoCorrienteAnterior = dataAnterior?.totalPasivoNoCorriente !== undefined
    ? round2(Number(dataAnterior.totalPasivoNoCorriente))
    : sumRubros(pasivoNoCorriente, 'anterior');

  const totalPasivoActual = dataActual?.totalPasivo !== undefined
    ? round2(Number(dataActual.totalPasivo))
    : round2(totalPasivoCorrienteActual + totalPasivoNoCorrienteActual);
  const totalPasivoAnterior = dataAnterior?.totalPasivo !== undefined
    ? round2(Number(dataAnterior.totalPasivo))
    : round2(totalPasivoCorrienteAnterior + totalPasivoNoCorrienteAnterior);

  const totalPatrimonioActual = dataActual?.totalPatrimonio !== undefined
    ? round2(Number(dataActual.totalPatrimonio))
    : sumRubros(patrimonio, 'actual');
  const totalPatrimonioAnterior = dataAnterior?.totalPatrimonio !== undefined
    ? round2(Number(dataAnterior.totalPatrimonio))
    : sumRubros(patrimonio, 'anterior');

  const totalPasivoYPatrimonioActual = dataActual?.totalPasivoYPatrimonio !== undefined
    ? round2(Number(dataActual.totalPasivoYPatrimonio))
    : round2(totalPasivoActual + totalPatrimonioActual);
  const totalPasivoYPatrimonioAnterior = dataAnterior?.totalPasivoYPatrimonio !== undefined
    ? round2(Number(dataAnterior.totalPasivoYPatrimonio))
    : round2(totalPasivoAnterior + totalPatrimonioAnterior);

  const estaCuadrado = dataActual?.estaCuadrado !== undefined
    ? Boolean(dataActual.estaCuadrado)
    : Math.abs(totalActivoActual - totalPasivoYPatrimonioActual) < 0.05;

  return {
    anioActual,
    anioAnterior,
    activoCorriente,
    activoNoCorriente,
    pasivoCorriente,
    pasivoNoCorriente,
    patrimonio,
    totalActivoCorrienteActual,
    totalActivoCorrienteAnterior,
    totalActivoNoCorrienteActual,
    totalActivoNoCorrienteAnterior,
    totalActivoActual,
    totalActivoAnterior,
    totalPasivoCorrienteActual,
    totalPasivoCorrienteAnterior,
    totalPasivoNoCorrienteActual,
    totalPasivoNoCorrienteAnterior,
    totalPasivoActual,
    totalPasivoAnterior,
    totalPatrimonioActual,
    totalPatrimonioAnterior,
    totalPasivoYPatrimonioActual,
    totalPasivoYPatrimonioAnterior,
    estaCuadrado
  };
}

export function construirEstructuraEstadoResultados(
  dataActual: any,
  dataAnterior?: any,
  periodo?: string,
  modo: 'funcion' | 'naturaleza' = 'funcion'
): EstructuraErFinanciera {
  const { anioActual, anioAnterior } = obtenerAniosComparativos(periodo || dataActual?.periodo);

  if (modo === 'naturaleza') {
    const nAct = dataActual?.porNaturaleza || {};
    const nAnt = dataAnterior?.porNaturaleza || {};
    const varInvAct = round2((Number(nAct.variacionInventarios) || 0) - (Number(nAct.comprasNetas) || 0));
    const varInvAnt = round2((Number(nAnt.variacionInventarios) || 0) - (Number(nAnt.comprasNetas) || 0));
    const cargaPersServAct = -Math.abs((Number(nAct.cargasPersonal) || 0) + (Number(nAct.serviciosTerceros) || 0));
    const cargaPersServAnt = -Math.abs((Number(nAnt.cargasPersonal) || 0) + (Number(nAnt.serviciosTerceros) || 0));

    const lineas: LineaEstadoFinanciero[] = [
      { id: 'er-nat-sec1', concepto: 'Margen Comercial y Producción:', actual: 0, anterior: 0, tipo: 'seccion' },
      { id: 'er-nat-ventas', concepto: 'Ventas netas de bienes y servicios', actual: round2(Number(nAct.ventasNetas || 0)), anterior: round2(Number(nAnt.ventasNetas || 0)), tipo: 'detalle' },
      { id: 'er-nat-compras', concepto: 'Compras netas y variación de existencias', actual: varInvAct, anterior: varInvAnt, tipo: 'detalle', lineaInferior: true },
      { id: 'er-nat-margen', concepto: 'Margen comercial', actual: round2(Number(nAct.margenComercial || 0)), anterior: round2(Number(nAnt.margenComercial || 0)), tipo: 'subtotal' },
      { id: 'er-nat-sec2', concepto: 'Gastos por Naturaleza', actual: 0, anterior: 0, tipo: 'seccion' },
      { id: 'er-nat-pers-serv', concepto: 'Cargas de personal y servicios prestados por terceros', actual: round2(cargaPersServAct), anterior: round2(cargaPersServAnt), tipo: 'detalle' },
      { id: 'er-nat-otros-op', concepto: 'Otros ingresos y gastos operativos', actual: round2(Number(nAct.otrosIngresosGastos || 0)), anterior: round2(Number(nAnt.otrosIngresosGastos || 0)), tipo: 'detalle', lineaInferior: true },
      { id: 'er-nat-res-exp', concepto: 'Resultado de explotación', actual: round2(Number(nAct.resultadoExplotacion || 0)), anterior: round2(Number(nAnt.resultadoExplotacion || 0)), tipo: 'subtotal' },
      { id: 'er-nat-ing-fin', concepto: 'Ingresos financieros', actual: round2(Number(nAct.ingresosFinancieros || 0)), anterior: round2(Number(nAnt.ingresosFinancieros || 0)), tipo: 'detalle' },
      { id: 'er-nat-gas-fin', concepto: 'Gastos financieros', actual: -Math.abs(round2(Number(nAct.gastosFinancieros || 0))), anterior: -Math.abs(round2(Number(nAnt.gastosFinancieros || 0))), tipo: 'detalle', lineaInferior: true },
      { id: 'er-nat-antes-imp', concepto: 'Utilidad antes del impuesto a las ganancias', actual: round2(Number(nAct.resultadoAntesImpuestos || 0)), anterior: round2(Number(nAnt.resultadoAntesImpuestos || 0)), tipo: 'subtotal', lineaSuperior: true },
      { id: 'er-nat-imp', concepto: 'Impuesto a las ganancias', actual: -Math.abs(round2(Number(nAct.impuestoRenta || 0))), anterior: -Math.abs(round2(Number(nAnt.impuestoRenta || 0))), tipo: 'detalle' },
      { id: 'er-nat-neto', concepto: 'Resultado del Ejercicio', actual: round2(Number(nAct.utilidadNeta || 0)), anterior: round2(Number(nAnt.utilidadNeta || 0)), tipo: 'total' }
    ];

    return {
      anioActual,
      anioAnterior,
      modo,
      lineas,
      utilidadNetaActual: round2(Number(nAct.utilidadNeta || 0)),
      utilidadNetaAnterior: round2(Number(nAnt.utilidadNeta || 0))
    };
  }

  const fAct = dataActual?.porFuncion || {};
  const fAnt = dataAnterior?.porFuncion || {};

  const costoAct = round2(Number(fAct.costoVentas || 0));
  const costoAnt = round2(Number(fAnt.costoVentas || 0));
  const gAdminAct = round2(Number(fAct.gastosAdministracion || 0));
  const gAdminAnt = round2(Number(fAnt.gastosAdministracion || 0));
  const gVentasAct = round2(Number(fAct.gastosVentas || 0));
  const gVentasAnt = round2(Number(fAnt.gastosVentas || 0));
  const gFinAct = round2(Number(fAct.gastosFinancieros || 0));
  const gFinAnt = round2(Number(fAnt.gastosFinancieros || 0));
  const impAct = round2(Number(fAct.impuestoRenta || 0));
  const impAnt = round2(Number(fAnt.impuestoRenta || 0));

  const lineas: LineaEstadoFinanciero[] = [
    { id: 'er-sec-cont', concepto: 'Operaciones continuas:', actual: 0, anterior: 0, tipo: 'seccion' },
    { id: 'er-ventas', concepto: 'Ventas a terceros', actual: round2(Number(fAct.ventasNetas || 0)), anterior: round2(Number(fAnt.ventasNetas || 0)), tipo: 'detalle' },
    { id: 'er-costo', concepto: 'Costo de ventas', actual: costoAct ? -Math.abs(costoAct) : 0, anterior: costoAnt ? -Math.abs(costoAnt) : 0, tipo: 'detalle', lineaInferior: true },
    { id: 'er-ubruta', concepto: 'Utilidad bruta', actual: round2(Number(fAct.utilidadBruta || 0)), anterior: round2(Number(fAnt.utilidadBruta || 0)), tipo: 'subtotal' },
    { id: 'er-sec-gop', concepto: 'Gastos Operacionales', actual: 0, anterior: 0, tipo: 'seccion' },
    { id: 'er-gventas', concepto: 'Gastos de ventas y distribución', actual: gVentasAct ? -Math.abs(gVentasAct) : 0, anterior: gVentasAnt ? -Math.abs(gVentasAnt) : 0, tipo: 'detalle' },
    { id: 'er-gadmin', concepto: 'Gastos administrativos', actual: gAdminAct ? -Math.abs(gAdminAct) : 0, anterior: gAdminAnt ? -Math.abs(gAdminAnt) : 0, tipo: 'detalle' },
    { id: 'er-oing', concepto: 'Otros ingresos', actual: 0, anterior: 0, tipo: 'detalle' },
    { id: 'er-ogas', concepto: 'Otros gastos', actual: 0, anterior: 0, tipo: 'detalle', lineaInferior: true },
    { id: 'er-uop', concepto: 'Utilidad de operación', actual: round2(Number(fAct.utilidadOperativa || 0)), anterior: round2(Number(fAnt.utilidadOperativa || 0)), tipo: 'subtotal' },
    { id: 'er-ifin', concepto: 'Ingresos financieros', actual: round2(Number(fAct.ingresosFinancieros || 0)), anterior: round2(Number(fAnt.ingresosFinancieros || 0)), tipo: 'detalle' },
    { id: 'er-gfin', concepto: 'Gastos financieros', actual: gFinAct ? -Math.abs(gFinAct) : 0, anterior: gFinAnt ? -Math.abs(gFinAnt) : 0, tipo: 'detalle', lineaInferior: true },
    { id: 'er-res-part', concepto: 'Resultados antes de part.', actual: round2(Number(fAct.resultadoAntesImpuestos || 0)), anterior: round2(Number(fAnt.resultadoAntesImpuestos || 0)), tipo: 'subtotal' },
    { id: 'er-dist-legal', concepto: 'Distribución legal de la renta', actual: 0, anterior: 0, tipo: 'detalle' },
    { id: 'er-u-antes-imp', concepto: 'Utilidad antes del impuesto a las ganancias por operaciones continuas', actual: round2(Number(fAct.resultadoAntesImpuestos || 0)), anterior: round2(Number(fAnt.resultadoAntesImpuestos || 0)), tipo: 'subtotal', lineaSuperior: true },
    { id: 'er-imp', concepto: 'Impuesto a las ganancias', actual: impAct ? -Math.abs(impAct) : 0, anterior: impAnt ? -Math.abs(impAnt) : 0, tipo: 'detalle' },
    { id: 'er-neto', concepto: 'Resultado del Ejercicio', actual: round2(Number(fAct.utilidadNeta || 0)), anterior: round2(Number(fAnt.utilidadNeta || 0)), tipo: 'total' }
  ];

  return {
    anioActual,
    anioAnterior,
    modo,
    lineas,
    utilidadNetaActual: round2(Number(fAct.utilidadNeta || 0)),
    utilidadNetaAnterior: round2(Number(fAnt.utilidadNeta || 0))
  };
}

export function construirEstructuraFlujoEfectivo(
  dataActual: any,
  dataAnterior?: any,
  periodo?: string
): EstructuraFeFinanciera {
  const { anioActual, anioAnterior } = obtenerAniosComparativos(periodo || dataActual?.periodo);
  const opAct = dataActual?.actividadesOperacion || {};
  const invAct = dataActual?.actividadesInversion || {};
  const finAct = dataActual?.actividadesFinanciamiento || {};

  const opAnt = dataAnterior?.actividadesOperacion || {};
  const invAnt = dataAnterior?.actividadesInversion || {};
  const finAnt = dataAnterior?.actividadesFinanciamiento || {};

  const neg = (v: any) => {
    const n = round2(Number(v || 0));
    return n ? -Math.abs(n) : 0;
  };

  const lineas: LineaEstadoFinanciero[] = [
    { id: 'fe-sec-op', concepto: 'Actividades de Operación', actual: 0, anterior: 0, tipo: 'seccion' },
    { id: 'fe-op-cob', concepto: 'Cobranzas de venta de bienes y prestación de servicios', actual: round2(Number(opAct.cobranzasClientes || 0)), anterior: round2(Number(opAnt.cobranzasClientes || 0)), tipo: 'detalle' },
    { id: 'fe-op-prov', concepto: 'Pagos a proveedores por suministro de bienes y servicios', actual: neg(opAct.pagosProveedores), anterior: neg(opAnt.pagosProveedores), tipo: 'detalle' },
    { id: 'fe-op-rem', concepto: 'Pagos de remuneraciones y beneficios sociales', actual: neg(opAct.pagosRemuneraciones), anterior: neg(opAnt.pagosRemuneraciones), tipo: 'detalle' },
    { id: 'fe-op-trib', concepto: 'Pagos de tributos y aportes al Estado', actual: neg(opAct.pagosTributos), anterior: neg(opAnt.pagosTributos), tipo: 'detalle', lineaInferior: true },
    { id: 'fe-op-neto', concepto: 'Flujo neto de efectivo proveniente de actividades de operación', actual: round2(Number(opAct.netoOperacion || 0)), anterior: round2(Number(opAnt.netoOperacion || 0)), tipo: 'subtotal' },

    { id: 'fe-sec-inv', concepto: 'Actividades de Inversión', actual: 0, anterior: 0, tipo: 'seccion' },
    { id: 'fe-inv-act', concepto: 'Pagos por compra de propiedad, planta y equipo', actual: neg(invAct.compraActivoFijo), anterior: neg(invAnt.compraActivoFijo), tipo: 'detalle', lineaInferior: true },
    { id: 'fe-inv-neto', concepto: 'Flujo neto de efectivo usado en actividades de inversión', actual: round2(Number(invAct.netoInversion || 0)), anterior: round2(Number(invAnt.netoInversion || 0)), tipo: 'subtotal' },

    { id: 'fe-sec-fin', concepto: 'Actividades de Financiamiento', actual: 0, anterior: 0, tipo: 'seccion' },
    { id: 'fe-fin-cap', concepto: 'Aportes de capital en efectivo', actual: round2(Number(finAct.aportesCapital || 0)), anterior: round2(Number(finAnt.aportesCapital || 0)), tipo: 'detalle' },
    { id: 'fe-fin-prest', concepto: 'Préstamos recibidos y amortización de pasivos financieros', actual: round2(Number(finAct.prestamosPagosFinancieros || 0)), anterior: round2(Number(finAnt.prestamosPagosFinancieros || 0)), tipo: 'detalle', lineaInferior: true },
    { id: 'fe-fin-neto', concepto: 'Flujo neto de efectivo en actividades de financiamiento', actual: round2(Number(finAct.netoFinanciamiento || 0)), anterior: round2(Number(finAnt.netoFinanciamiento || 0)), tipo: 'subtotal' },

    { id: 'fe-sec-con', concepto: 'Conciliación de Efectivo y Equivalentes de Efectivo', actual: 0, anterior: 0, tipo: 'seccion' },
    { id: 'fe-var', concepto: 'Aumento (disminución) neto de efectivo y equivalentes', actual: round2(Number(dataActual?.variacionNetaEfectivo || 0)), anterior: round2(Number(dataAnterior?.variacionNetaEfectivo || 0)), tipo: 'subtotal', lineaSuperior: true },
    { id: 'fe-ini', concepto: 'Saldo de efectivo y equivalentes al inicio del período', actual: round2(Number(dataActual?.saldoInicialEfectivo || 0)), anterior: round2(Number(dataAnterior?.saldoInicialEfectivo || 0)), tipo: 'detalle' },
    { id: 'fe-fin', concepto: 'Saldo de efectivo y equivalentes al cierre del período', actual: round2(Number(dataActual?.saldoFinalEfectivo || 0)), anterior: round2(Number(dataAnterior?.saldoFinalEfectivo || 0)), tipo: 'total' }
  ];

  return {
    anioActual,
    anioAnterior,
    lineas,
    saldoFinalActual: round2(Number(dataActual?.saldoFinalEfectivo || 0)),
    saldoFinalAnterior: round2(Number(dataAnterior?.saldoFinalEfectivo || 0))
  };
}
