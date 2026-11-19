import React, { useState, useMemo } from 'react';
import {
  Calculator,
  Printer,
  CheckCircle2,
  FileCheck,
  RefreshCw,
  ShieldAlert,
  History,
  Sliders,
  FileText,
  ChevronDown,
  ChevronUp,
  Layers,
  Info,
  Building2,
  Receipt,
  Coins,
  FileSpreadsheet
} from 'lucide-react';
import Decimal from 'decimal.js';
import { LiquidacionPDT621, EmpresaCliente, Comprobante } from '../../types';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { VentanaModal } from '../ui/VentanaModal';
import { useToast } from '../../context/ToastContext';
import {
  exportarResumenPdt621EstandarPdf,
  descargarPdt621Excel,
  Pdt621ResumenPdfParams
} from '../../services/reports/formato_estandar/formatoEstandarEngine';

interface LiquidacionTributariaViewProps {
  liquidacion: LiquidacionPDT621;
  empresa: EmpresaCliente;
  compras: Comprobante[];
  ventas: Comprobante[];
  onUpdateSaldoAnterior: (nuevoSaldo: number) => void;
  periodo?: string;
  rolUsuario?: string;
}

type EstadoDeclaracionPdt621 = 'BORRADOR' | 'PRELIQUIDADO' | 'PRESENTADO' | 'SUSTITUIDA';
type PaginaVista = 'PAGINA_1' | 'PAGINA_2' | 'COMPLETO';

interface VersionHistoricaPdt621 {
  version: number;
  tipoDeclaracion: 'ORIGINAL' | 'RECTIFICATORIA';
  estado: EstadoDeclaracionPdt621;
  numeroOrden?: string;
  fechaPresentacion?: string;
  asientoNumero?: string;
  igvPorPagar: number;
  pagoCuentaRenta: number;
  totalDeudaTributaria: number;
}

export const LiquidacionTributariaView: React.FC<LiquidacionTributariaViewProps> = ({
  liquidacion,
  empresa,
  compras,
  ventas,
  onUpdateSaldoAnterior,
  periodo = '2026-09',
  rolUsuario = 'ADMIN_ESTUDIO',
}) => {
  const { success, error, info } = useToast();
  const esRolAuditor = rolUsuario === 'AUDITOR_REVISOR' || rolUsuario === 'AUDITOR';

  // Navegación de páginas oficiales (Pág 1, Pág 2, o Continuo)
  const [paginaActiva, setPaginaActiva] = useState<PaginaVista>('COMPLETO');
  const [panelParametrosAbierto, setPanelParametrosAbierto] = useState(false);

  // Estado del flujo de declaración PDT 621
  const [versionActual, setVersionActual] = useState<number>(1);
  const [tipoDeclaracion, setTipoDeclaracion] = useState<'ORIGINAL' | 'RECTIFICATORIA'>('ORIGINAL');
  const [estadoDeclaracion, setEstadoDeclaracion] = useState<EstadoDeclaracionPdt621>('BORRADOR');
  const [asientoDeterminacion, setAsientoDeterminacion] = useState<string | null>(null);
  const [numeroOrdenPresentado, setNumeroOrdenPresentado] = useState<string>('1212488542');
  const [fechaPresentacionManual, setFechaPresentacionManual] = useState<string>('21/10/2026');
  const [historialVersiones, setHistorialVersiones] = useState<VersionHistoricaPdt621[]>([]);

  // Modal de presentación manual
  const [modalPresentarOpen, setModalPresentarOpen] = useState(false);
  const [inputNumeroOrden, setInputNumeroOrden] = useState('1212488542');
  const [inputFechaPresentacion, setInputFechaPresentacion] = useState('21/10/2026');

  // Parámetros y tributos aplicables del mes
  const [regimenSeleccionado, setRegimenSeleccionado] = useState<string>(
    empresa.regimenTributario || 'MYPE_TRIBUTARIO'
  );

  // Parámetros numéricos editables con valores base
  const [saldoAnteriorInput, setSaldoAnteriorInput] = useState<string>(
    String(liquidacion.saldoFavorPeriodoAnterior || 0)
  );
  const [percepcionesPeriodoInput, setPercepcionesPeriodoInput] = useState<string>('0.00');
  const [percepcionesAnterioresInput, setPercepcionesAnterioresInput] = useState<string>('0.00');
  const [retencionesPeriodoInput, setRetencionesPeriodoInput] = useState<string>('0.00');
  const [retencionesAnterioresInput, setRetencionesAnterioresInput] = useState<string>('0.00');
  const [retencionesTerceraInput, setRetencionesTerceraInput] = useState<string>('0.00');
  const [retencionesTerceraAnterioresInput, setRetencionesTerceraAnterioresInput] = useState<string>('0.00');
  const [compensacionExportadorInput, setCompensacionExportadorInput] = useState<string>('0.00');
  const [itanInput, setItanInput] = useState<string>('0.00');
  const [pagosPreviosIgvInput, setPagosPreviosIgvInput] = useState<string>('0.00');
  const [pagosPreviosRentaInput, setPagosPreviosRentaInput] = useState<string>('0.00');
  const [interesMoratorioIgvInput, setInteresMoratorioIgvInput] = useState<string>('0.00');
  const [interesMoratorioRentaInput, setInteresMoratorioRentaInput] = useState<string>('0.00');

  // Compras y Ventas especiales
  const [ventasLey31556Input, setVentasLey31556Input] = useState<string>('0.00');
  const [ventasExportacionFactInput, setVentasExportacionFactInput] = useState<string>('0.00');
  const [ventasExportacionEmbInput, setVentasExportacionEmbInput] = useState<string>('0.00');
  const [ventasNoGravadasInput, setVentasNoGravadasInput] = useState<string>('0.00');
  const [comprasLey31556Input, setComprasLey31556Input] = useState<string>('0.00');
  const [comprasUsoComunBaseInput, setComprasUsoComunBaseInput] = useState<string>('0.00');
  const [comprasNoGravadasInput, setComprasNoGravadasInput] = useState<string>('0.00');
  const [comprasInternasNoGravadasInput, setComprasInternasNoGravadasInput] = useState<string>('0.00');
  const [proporcionProrrataPct, setProporcionProrrataPct] = useState<string>('100.00');
  const [coeficienteRentaInput, setCoeficienteRentaInput] = useState<string>(
    empresa.regimenTributario === 'REGIMEN_GENERAL' ? '0.0150' : '0.0000'
  );
  const [saldoFavorRentaAnteriorInput, setSaldoFavorRentaAnteriorInput] = useState<string>('0.00');

  // Cálculos de Casillas SUNAT Oficiales (Pág. 1 y Pág. 2)
  const calculo = useMemo(() => {
    const tasaIgvGeneral = new Decimal('0.18');
    const tasaIgvEspecial = new Decimal('0.10'); // Ley 31556

    // Notas de crédito emitidas (ventas)
    const ncVentas = ventas.filter((v) => v.tipoDoc === '07' && v.estadoSunat !== 'ANULADO');
    const cas102 = ncVentas
      .reduce((acc, v) => acc.plus(new Decimal(Math.abs(Number(v.baseImponibleGravada || 0)))), new Decimal(0))
      .toDecimalPlaces(2);
    const cas103 = ncVentas
      .reduce((acc, v) => acc.plus(new Decimal(Math.abs(Number(v.igv || 0)))), new Decimal(0))
      .toDecimalPlaces(2);

    // =========================================================================
    // 1. IGV VENTAS (Pág. 1)
    // =========================================================================
    const cas100 = new Decimal(liquidacion.ventasNetasGravadas || 0).plus(cas102).toDecimalPlaces(2);
    const cas101 = new Decimal(liquidacion.debitoFiscalIgv || 0).plus(cas103).toDecimalPlaces(2);

    const cas154 = new Decimal(ventasLey31556Input || '0').toDecimalPlaces(2);
    const cas155 = cas154.mul(tasaIgvEspecial).toDecimalPlaces(2);

    const cas160 = new Decimal(0);
    const cas161 = new Decimal(0);
    const cas162 = new Decimal(0);
    const cas163 = new Decimal(0);

    const cas106 = new Decimal(ventasExportacionFactInput || '0').toDecimalPlaces(2);
    const cas127 = new Decimal(ventasExportacionEmbInput || '0').toDecimalPlaces(2);
    const cas105 = new Decimal(ventasNoGravadasInput || '0').toDecimalPlaces(2);
    const cas109 = new Decimal(0);
    const cas112 = new Decimal(0);

    // Casilla 131: Total Débito Fiscal
    const cas131 = Decimal.max(0, cas101.plus(cas155).minus(cas103)).toDecimalPlaces(2);

    // =========================================================================
    // 2. IGV COMPRAS (Pág. 1)
    // =========================================================================
    const cas107 = new Decimal(liquidacion.comprasNetasGravadas || 0).toDecimalPlaces(2);
    const cas108 = new Decimal(liquidacion.creditoFiscalIgv || 0).toDecimalPlaces(2);

    const cas156 = new Decimal(comprasLey31556Input || '0').toDecimalPlaces(2);
    const cas157 = cas156.mul(tasaIgvEspecial).toDecimalPlaces(2);

    const cas110 = new Decimal(comprasUsoComunBaseInput || '0').toDecimalPlaces(2);
    const pctProrrata = Decimal.min(100, Decimal.max(0, new Decimal(proporcionProrrataPct || '100')));
    const cas173 = pctProrrata.div(100).toDecimalPlaces(4);
    const cas111 = cas110.mul(tasaIgvGeneral).mul(cas173).toDecimalPlaces(2);

    const cas113 = new Decimal(comprasNoGravadasInput || '0').toDecimalPlaces(2);
    const cas114 = new Decimal(0);
    const cas115 = new Decimal(0);
    const cas116 = new Decimal(0);
    const cas117 = new Decimal(0);
    const cas119 = new Decimal(0);
    const cas120 = new Decimal(comprasInternasNoGravadasInput || '0').toDecimalPlaces(2);
    const cas122 = new Decimal(0);

    // Casilla 178: Total Crédito Fiscal
    const cas178 = cas108.plus(cas157).plus(cas111).plus(cas115).plus(cas117).toDecimalPlaces(2);
    const cas172 = new Decimal(0); // Crédito Fiscal Especial

    // =========================================================================
    // 3. IVAP (Pág. 1)
    // =========================================================================
    const cas340 = new Decimal(0);
    const cas341 = new Decimal(0);
    const cas182 = new Decimal(0);

    // =========================================================================
    // 4. RENTA (Pág. 1)
    // =========================================================================
    const cas301 = Decimal.max(0, cas100.plus(cas154).minus(cas102)).toDecimalPlaces(2);
    const coefInput = Decimal.max(0, new Decimal(coeficienteRentaInput || '0'));
    let tasaRentaFraccion = new Decimal('0.01');
    let pctRentaAplicado = new Decimal('1.00');

    if (regimenSeleccionado === 'REGIMEN_GENERAL') {
      const tasaMinRg = new Decimal('0.015');
      tasaRentaFraccion = Decimal.max(tasaMinRg, coefInput);
      pctRentaAplicado = tasaRentaFraccion.mul(100);
    } else if (regimenSeleccionado === 'REGIMEN_ESPECIAL') {
      tasaRentaFraccion = new Decimal('0.015');
      pctRentaAplicado = new Decimal('1.50');
    } else if (regimenSeleccionado === 'NRUS') {
      tasaRentaFraccion = new Decimal(0);
      pctRentaAplicado = new Decimal(0);
    } else {
      tasaRentaFraccion = new Decimal('0.01');
      pctRentaAplicado = new Decimal('1.00');
    }

    const cas380 = coefInput.toDecimalPlaces(4);
    const cas315 = pctRentaAplicado.toDecimalPlaces(2);
    const cas894 = tasaRentaFraccion.toDecimalPlaces(4);

    const cas312 =
      regimenSeleccionado === 'NRUS'
        ? cas301.lte(5000)
          ? new Decimal(20)
          : new Decimal(50)
        : cas301.mul(tasaRentaFraccion).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const cas336 = new Decimal(0);

    // =========================================================================
    // 5. DETERMINACIÓN DE LA DEUDA (Pág. 2)
    // =========================================================================
    // Fila 1: Impuesto Resultante o Saldo a Favor
    const cas140 = cas131.minus(cas178).toDecimalPlaces(2); // IGV (>0 impuesto, <0 saldo a favor)
    const cas353 = cas341.minus(cas182).toDecimalPlaces(2); // IVAP
    const cas302 = cas312; // RENTA

    // Fila 2: Saldo a Favor del Período anterior
    const cas145 = Decimal.max(0, new Decimal(saldoAnteriorInput || '0')).toDecimalPlaces(2);
    const cas351 = new Decimal(0);
    const cas303 = Decimal.max(0, new Decimal(saldoFavorRentaAnteriorInput || '0')).toDecimalPlaces(2);

    // Fila 3: Tributo a Pagar o Saldo a Favor
    let cas184 = new Decimal(0);
    if (cas140.gte(0)) {
      cas184 = cas140.minus(cas145).toDecimalPlaces(2);
    } else {
      cas184 = cas140.minus(cas145).toDecimalPlaces(2); // Saldo a favor negativo acumulado
    }
    const cas352 = cas353.minus(cas351).toDecimalPlaces(2);
    const cas304 = Decimal.max(0, cas302.minus(cas303)).toDecimalPlaces(2);

    // Fila 4 a 6: Percepciones
    const cas171 = Decimal.max(0, new Decimal(percepcionesPeriodoInput || '0')).toDecimalPlaces(2);
    const cas168 = Decimal.max(0, new Decimal(percepcionesAnterioresInput || '0')).toDecimalPlaces(2);
    const totalPercepciones = cas171.plus(cas168);

    // Fila 7 a 9: Retenciones
    const cas179 = Decimal.max(0, new Decimal(retencionesPeriodoInput || '0')).toDecimalPlaces(2);
    const cas176 = Decimal.max(0, new Decimal(retencionesAnterioresInput || '0')).toDecimalPlaces(2);
    const totalRetenciones = cas179.plus(cas176);

    // Aplicación de percepciones y retenciones sobre IGV por pagar (si cas184 > 0)
    let remanentePorPagar = Decimal.max(0, cas184);
    const percepcionesAplicadas = Decimal.min(remanentePorPagar, totalPercepciones);
    remanentePorPagar = remanentePorPagar.minus(percepcionesAplicadas);
    const retencionesAplicadas = Decimal.min(remanentePorPagar, totalRetenciones);
    remanentePorPagar = remanentePorPagar.minus(retencionesAplicadas);

    const cas164 = totalPercepciones.minus(percepcionesAplicadas).toDecimalPlaces(2); // Percepciones no aplicadas
    const cas165 = totalRetenciones.minus(retencionesAplicadas).toDecimalPlaces(2);   // Retenciones no aplicadas

    // Renta Retenciones de Tercera e ITAN
    const cas326 = Decimal.max(0, new Decimal(retencionesTerceraInput || '0')).toDecimalPlaces(2);
    const cas327 = Decimal.max(0, new Decimal(retencionesTerceraAnterioresInput || '0')).toDecimalPlaces(2);
    const cas347 = new Decimal(0);
    const cas305 = Decimal.max(0, new Decimal(compensacionExportadorInput || '0')).toDecimalPlaces(2);
    const cas328 = Decimal.max(0, new Decimal(itanInput || '0')).toDecimalPlaces(2);

    // Sub Total (Fila 14)
    const cas681 = remanentePorPagar.toDecimalPlaces(2);
    const cas683 = Decimal.max(0, cas352).toDecimalPlaces(2);
    const deduccionesRenta = cas326.plus(cas327).plus(cas305).plus(cas328);
    const cas682 = Decimal.max(0, cas304.minus(deduccionesRenta)).toDecimalPlaces(2);

    // Pagos previos e intereses (Filas 15 y 16)
    const cas185 = Decimal.max(0, new Decimal(pagosPreviosIgvInput || '0')).toDecimalPlaces(2);
    const cas342 = new Decimal(0);
    const cas317 = Decimal.max(0, new Decimal(pagosPreviosRentaInput || '0')).toDecimalPlaces(2);

    const cas187 = Decimal.max(0, new Decimal(interesMoratorioIgvInput || '0')).toDecimalPlaces(2);
    const cas343 = new Decimal(0);
    const cas319 = Decimal.max(0, new Decimal(interesMoratorioRentaInput || '0')).toDecimalPlaces(2);

    // Total Deuda Tributaria (Fila 17)
    const cas188 = Decimal.max(0, cas681.minus(cas185)).plus(cas187).toDecimalPlaces(2);
    const cas344 = Decimal.max(0, cas683.minus(cas342)).plus(cas343).toDecimalPlaces(2);
    const cas324 = Decimal.max(0, cas682.minus(cas317)).plus(cas319).toDecimalPlaces(2);

    // Saldo a favor arrastrable al mes siguiente (si cas184 es negativo)
    const saldoFavorArrastrable = cas184.lt(0) ? cas184.abs().toDecimalPlaces(2) : new Decimal(0);

    const totalDeudaGeneral = cas188.plus(cas324).plus(cas344).toDecimalPlaces(2);

    // Lista estructurada para PDF oficial
    const listaPdf = [
      { seccion: 'IGV VENTAS', casillaBase: '100', montoBase: cas100.toNumber(), casillaTributo: '101', concepto: 'Ventas Netas Gravadas', montoTributo: cas101.toNumber(), enteroSunat: Math.round(cas101.toNumber()) },
      { seccion: 'IGV VENTAS', casillaBase: '154', montoBase: cas154.toNumber(), casillaTributo: '155', concepto: 'Ventas Netas Gravadas Ley N° 31556 y modif.', montoTributo: cas155.toNumber(), enteroSunat: Math.round(cas155.toNumber()) },
      { seccion: 'IGV VENTAS', casillaBase: '102', montoBase: cas102.toNumber(), casillaTributo: '103', concepto: '(-) Descuentos concedidos y/o devoluciones de ventas', montoTributo: cas103.toNumber(), enteroSunat: Math.round(cas103.toNumber()) },
      { seccion: 'IGV VENTAS', casillaBase: '—', montoBase: null, casillaTributo: '131', concepto: 'TOTAL DÉBITO FISCAL DEL PERÍODO', montoTributo: cas131.toNumber(), enteroSunat: Math.round(cas131.toNumber()) },
      { seccion: 'IGV COMPRAS', casillaBase: '107', montoBase: cas107.toNumber(), casillaTributo: '108', concepto: 'Compras netas destinada a vtas gravadas exclusivas', montoTributo: cas108.toNumber(), enteroSunat: Math.round(cas108.toNumber()) },
      { seccion: 'IGV COMPRAS', casillaBase: '156', montoBase: cas156.toNumber(), casillaTributo: '157', concepto: 'Compras Netas destinadas a vtas gravadas Ley N° 31556', montoTributo: cas157.toNumber(), enteroSunat: Math.round(cas157.toNumber()) },
      { seccion: 'IGV COMPRAS', casillaBase: '110', montoBase: cas110.toNumber(), casillaTributo: '111', concepto: 'Compras netas destinada a vtas gravadas y no gravadas', montoTributo: cas111.toNumber(), enteroSunat: Math.round(cas111.toNumber()) },
      { seccion: 'IGV COMPRAS', casillaBase: '120', montoBase: cas120.toNumber(), casillaTributo: '—', concepto: 'Compras internas no gravadas', montoTributo: 0, enteroSunat: 0 },
      { seccion: 'IGV COMPRAS', casillaBase: '—', montoBase: null, casillaTributo: '178', concepto: 'TOTAL CRÉDITO FISCAL DEL PERÍODO', montoTributo: cas178.toNumber(), enteroSunat: Math.round(cas178.toNumber()) },
      { seccion: 'DETERMINACIÓN', casillaBase: '—', montoBase: null, casillaTributo: '140', concepto: 'Impuesto Resultante o Saldo a Favor', montoTributo: cas140.toNumber(), enteroSunat: Math.round(cas140.toNumber()) },
      { seccion: 'DETERMINACIÓN', casillaBase: '—', montoBase: null, casillaTributo: '145', concepto: 'Saldo a Favor del Período anterior', montoTributo: cas145.toNumber(), enteroSunat: Math.round(cas145.toNumber()) },
      { seccion: 'DETERMINACIÓN', casillaBase: '—', montoBase: null, casillaTributo: '184', concepto: 'Tributo a Pagar o Saldo a Favor', montoTributo: cas184.toNumber(), enteroSunat: Math.round(cas184.toNumber()) },
      { seccion: 'DETERMINACIÓN', casillaBase: '—', montoBase: null, casillaTributo: '171', concepto: 'Percepciones declaradas en el período', montoTributo: cas171.toNumber(), enteroSunat: Math.round(cas171.toNumber()) },
      { seccion: 'DETERMINACIÓN', casillaBase: '—', montoBase: null, casillaTributo: '168', concepto: 'Saldo de percepciones de períodos anteriores', montoTributo: cas168.toNumber(), enteroSunat: Math.round(cas168.toNumber()) },
      { seccion: 'DETERMINACIÓN', casillaBase: '—', montoBase: null, casillaTributo: '164', concepto: 'Saldo de percepciones no aplicadas', montoTributo: cas164.toNumber(), enteroSunat: Math.round(cas164.toNumber()) },
      { seccion: 'DETERMINACIÓN', casillaBase: '—', montoBase: null, casillaTributo: '188', concepto: 'TOTAL DEUDA TRIBUTARIA IGV POR PAGAR', montoTributo: cas188.toNumber(), enteroSunat: Math.round(cas188.toNumber()) },
      { seccion: 'RENTA', casillaBase: '301', montoBase: cas301.toNumber(), casillaTributo: '312', concepto: 'Ingresos Netos Mensuales — Renta 3ra', montoTributo: cas312.toNumber(), enteroSunat: Math.round(cas312.toNumber()) },
      { seccion: 'RENTA', casillaBase: '—', montoBase: null, casillaTributo: '304', concepto: 'TOTAL DEUDA PAGO A CUENTA RENTA', montoTributo: cas324.toNumber(), enteroSunat: Math.round(cas324.toNumber()) }
    ];

    return {
      cas100, cas101, cas154, cas155, cas102, cas103, cas160, cas161, cas162, cas163,
      cas106, cas127, cas105, cas109, cas112, cas131,
      cas107, cas108, cas156, cas157, cas110, cas111, cas113, cas114, cas115, cas116, cas117, cas119,
      cas120, cas122, cas178, cas172, cas173,
      cas340, cas341, cas182, cas353, cas351, cas352, cas347, cas683, cas342, cas343, cas344,
      cas301, cas380, cas315, cas894, cas312, cas336, cas302, cas303, cas304, cas326, cas327, cas305, cas328, cas682, cas317, cas319, cas324,
      cas140, cas145, cas184, cas171, cas168, cas164, cas179, cas176, cas165, cas681, cas185, cas187, cas188,
      saldoFavorArrastrable,
      totalDeudaGeneral,
      listaPdf
    };
  }, [
    liquidacion,
    ventas,
    compras,
    ventasLey31556Input,
    ventasExportacionFactInput,
    ventasExportacionEmbInput,
    ventasNoGravadasInput,
    comprasLey31556Input,
    comprasUsoComunBaseInput,
    comprasNoGravadasInput,
    comprasInternasNoGravadasInput,
    proporcionProrrataPct,
    coeficienteRentaInput,
    regimenSeleccionado,
    saldoAnteriorInput,
    saldoFavorRentaAnteriorInput,
    percepcionesPeriodoInput,
    percepcionesAnterioresInput,
    retencionesPeriodoInput,
    retencionesAnterioresInput,
    retencionesTerceraInput,
    retencionesTerceraAnterioresInput,
    compensacionExportadorInput,
    itanInput,
    pagosPreviosIgvInput,
    pagosPreviosRentaInput,
    interesMoratorioIgvInput,
    interesMoratorioRentaInput,
  ]);

  // Formateador estándar de montos
  const fmt = (num: Decimal | number | undefined, mostrarCero = true): string => {
    if (num === undefined || num === null) return '';
    const val = typeof num === 'number' ? new Decimal(num) : num;
    if (val.isZero() && !mostrarCero) return '';
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val.toNumber());
  };

  const fmtRatio = (num: Decimal | number | undefined): string => {
    if (num === undefined || num === null) return '';
    const val = typeof num === 'number' ? new Decimal(num) : num;
    return val.toFixed(4);
  };

  const handleApplySaldoAnterior = () => {
    const val = parseFloat(saldoAnteriorInput) || 0;
    onUpdateSaldoAnterior(val);
  };

  const handlePreliquidar = () => {
    if (esRolAuditor) {
      error('PERMISO_DENEGADO: El rol AUDITOR solo tiene permisos de lectura.', 'Acceso Restringido');
      return;
    }
    const numeroVoucher = `06-000${versionActual}`;
    setEstadoDeclaracion('PRELIQUIDADO');
    setAsientoDeterminacion(numeroVoucher);
    success(
      `Declaración PDT 621 (${periodo} v${versionActual}) preliquidada con éxito. Asiento ${numeroVoucher} generado en Subdiario 06.`,
      'Preliquidación Contabilizada'
    );
  };

  const handleConfirmarPresentacion = () => {
    if (!inputNumeroOrden.trim() || !inputFechaPresentacion.trim()) {
      error('Ingrese el Número de Orden SUNAT y la Fecha de Presentación.', 'Datos Requeridos');
      return;
    }
    setEstadoDeclaracion('PRESENTADO');
    setNumeroOrdenPresentado(inputNumeroOrden.trim());
    setFechaPresentacionManual(inputFechaPresentacion.trim());
    setModalPresentarOpen(false);
    success(
      `Declaración PDT 621 registrada como PRESENTADA (N° Orden ${inputNumeroOrden.trim()}).`,
      'Declaración Presentada'
    );
  };

  const handleGenerarRectificatoria = () => {
    if (esRolAuditor) {
      error('PERMISO_DENEGADO: El rol AUDITOR no puede generar rectificatorias.', 'Acceso Restringido');
      return;
    }
    setHistorialVersiones((prev) => [
      {
        version: versionActual,
        tipoDeclaracion,
        estado: 'SUSTITUIDA',
        numeroOrden: numeroOrdenPresentado || undefined,
        fechaPresentacion: fechaPresentacionManual || undefined,
        asientoNumero: asientoDeterminacion || undefined,
        igvPorPagar: calculo.cas188.toNumber(),
        pagoCuentaRenta: calculo.cas324.toNumber(),
        totalDeudaTributaria: calculo.totalDeudaGeneral.toNumber(),
      },
      ...prev,
    ]);
    const nuevaVer = versionActual + 1;
    setVersionActual(nuevaVer);
    setTipoDeclaracion('RECTIFICATORIA');
    setEstadoDeclaracion('BORRADOR');
    setAsientoDeterminacion(null);
    setNumeroOrdenPresentado('');
    setFechaPresentacionManual('');
    info(`Iniciada Declaración Rectificatoria v${nuevaVer} en estado BORRADOR.`, 'Rectificatoria');
  };

  const construirParamsPdt621 = (): Pdt621ResumenPdfParams => ({
    empresa: {
      razonSocial: empresa.razonSocial,
      ruc: empresa.ruc,
      direccion: empresa.direccionFiscal,
      regimenTributario: regimenSeleccionado,
    },
    periodo,
    version: versionActual,
    esRectificatoria: tipoDeclaracion === 'RECTIFICATORIA',
    estado: estadoDeclaracion,
    numeroOrden: numeroOrdenPresentado || null,
    fechaPresentacion: fechaPresentacionManual || null,
    asientoNumero: asientoDeterminacion || null,
    totalDeudaIgv: calculo.cas188.toNumber(),
    nuevoSaldoFavorIgv: calculo.saldoFavorArrastrable.toNumber(),
    pagoCuentaRenta: calculo.cas324.toNumber(),
    totalPagarSunat: calculo.totalDeudaGeneral.toNumber(),
    filasCasillas: calculo.listaPdf,
    casillasOficiales: {
      cas100: calculo.cas100.toNumber(), cas101: calculo.cas101.toNumber(),
      cas154: calculo.cas154.toNumber(), cas155: calculo.cas155.toNumber(),
      cas102: calculo.cas102.toNumber(), cas103: calculo.cas103.toNumber(),
      cas160: calculo.cas160.toNumber(), cas161: calculo.cas161.toNumber(),
      cas162: calculo.cas162.toNumber(), cas163: calculo.cas163.toNumber(),
      cas106: calculo.cas106.toNumber(), cas127: calculo.cas127.toNumber(),
      cas105: calculo.cas105.toNumber(), cas109: calculo.cas109.toNumber(), cas112: calculo.cas112.toNumber(),
      cas131: calculo.cas131.toNumber(),
      cas107: calculo.cas107.toNumber(), cas108: calculo.cas108.toNumber(),
      cas156: calculo.cas156.toNumber(), cas157: calculo.cas157.toNumber(),
      cas110: calculo.cas110.toNumber(), cas111: calculo.cas111.toNumber(), cas113: calculo.cas113.toNumber(),
      cas114: calculo.cas114.toNumber(), cas115: calculo.cas115.toNumber(),
      cas116: calculo.cas116.toNumber(), cas117: calculo.cas117.toNumber(), cas119: calculo.cas119.toNumber(),
      cas120: calculo.cas120.toNumber(), cas122: calculo.cas122.toNumber(),
      cas178: calculo.cas178.toNumber(), cas172: calculo.cas172.toNumber(), cas173: calculo.cas173.toNumber(),
      cas340: calculo.cas340.toNumber(), cas341: calculo.cas341.toNumber(), cas182: calculo.cas182.toNumber(),
      cas301: calculo.cas301.toNumber(), cas312: calculo.cas312.toNumber(),
      cas380: calculo.cas380.toNumber(), cas315: calculo.cas315.toNumber(), cas894: calculo.cas894.toNumber(), cas336: calculo.cas336.toNumber(),
      cas140: calculo.cas140.toNumber(), cas353: calculo.cas353.toNumber(), cas302: calculo.cas302.toNumber(),
      cas145: calculo.cas145.toNumber(), cas351: calculo.cas351.toNumber(), cas303: calculo.cas303.toNumber(),
      cas184: calculo.cas184.toNumber(), cas352: calculo.cas352.toNumber(), cas304: calculo.cas304.toNumber(),
      cas171: calculo.cas171.toNumber(), cas168: calculo.cas168.toNumber(), cas164: calculo.cas164.toNumber(),
      cas179: calculo.cas179.toNumber(), cas176: calculo.cas176.toNumber(), cas165: calculo.cas165.toNumber(),
      cas326: calculo.cas326.toNumber(), cas327: calculo.cas327.toNumber(),
      cas347: calculo.cas347.toNumber(), cas305: calculo.cas305.toNumber(),
      cas328: calculo.cas328.toNumber(),
      cas681: calculo.cas681.toNumber(), cas683: calculo.cas683.toNumber(), cas682: calculo.cas682.toNumber(),
      cas185: calculo.cas185.toNumber(), cas342: calculo.cas342.toNumber(), cas317: calculo.cas317.toNumber(),
      cas187: calculo.cas187.toNumber(), cas343: calculo.cas343.toNumber(), cas319: calculo.cas319.toNumber(),
      cas188: calculo.cas188.toNumber(), cas344: calculo.cas344.toNumber(), cas324: calculo.cas324.toNumber(),
      saldoFavorArrastrable: calculo.saldoFavorArrastrable.toNumber(),
      totalDeudaGeneral: calculo.totalDeudaGeneral.toNumber(),
    },
  });

  const handleImprimirResumenPdf = () => {
    exportarResumenPdt621EstandarPdf(construirParamsPdt621());
    success('Declaración PDT 621 exportada en PDF A4 Oficial (2 páginas idénticas al sistema).', 'PDF Generado');
  };

  const handleExportarExcelPdt621 = async () => {
    try {
      await descargarPdt621Excel(construirParamsPdt621());
      success('Declaración PDT 621 exportada a Excel (.xlsx) con formato oficial de 2 páginas.', 'Excel Generado');
    } catch (err: any) {
      error(`No se pudo generar el archivo Excel: ${err?.message || 'error interno'}`, 'Error de Exportación');
    }
  };

  // Componente de Casilla con Borde Fino
  const CeldaCasilla: React.FC<{
    casilla?: string;
    monto?: Decimal | number;
    ratio?: Decimal | number;
    esNegativo?: boolean;
    destacado?: boolean;
    editable?: boolean;
    valueInput?: string;
    onChangeInput?: (val: string) => void;
  }> = ({ casilla, monto, ratio, esNegativo, destacado, editable, valueInput, onChangeInput }) => {
    return (
      <div className="flex items-center w-full h-[23px] border border-slate-300 bg-white">
        {casilla ? (
          <div className="w-9 h-full flex items-center justify-center font-mono text-[10px] font-bold text-slate-700 bg-slate-100 border-r border-slate-300 shrink-0 select-none">
            {casilla}
          </div>
        ) : (
          <div className="w-9 h-full bg-slate-50 border-r border-slate-200 shrink-0" />
        )}

        <div className="flex-1 h-full flex items-center justify-end px-1.5 font-mono text-[11px]">
          {editable ? (
            <input
              type="number"
              step="0.01"
              value={valueInput || ''}
              onChange={(e) => onChangeInput?.(e.target.value)}
              disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
              className="w-full h-full text-right font-mono text-[11px] font-semibold text-slate-900 bg-transparent focus:outline-hidden focus:bg-blue-50/30"
              placeholder="0.00"
            />
          ) : (
            <span
              className={`truncate font-semibold ${
                destacado
                  ? 'text-slate-950 font-bold'
                  : esNegativo
                  ? 'text-rose-700 font-bold'
                  : 'text-slate-900'
              }`}
            >
              {ratio !== undefined ? fmtRatio(ratio) : fmt(monto, false)}
            </span>
          )}
        </div>
      </div>
    );
  };

  // Componente de Encabezado Oficial SUNAT PDT 621 (Idéntico a PDF)
  const EncabezadoOficialSunat: React.FC<{ paginaNum: number }> = ({ paginaNum }) => (
    <div className="border border-slate-400 bg-white mb-3 text-slate-900">
      <div className="grid grid-cols-12 divide-x divide-slate-400">
        {/* Columna Izquierda: Logo SUNAT y 0621 */}
        <div className="col-span-3 p-2.5 flex flex-col justify-between items-center text-center">
          <div>
            <span className="text-base font-black tracking-tight block">SUNAT</span>
            <span className="text-[10px] font-bold tracking-tight text-slate-700 block">
              DECLARACIÓN PAGO
            </span>
          </div>
          <div className="text-2xl font-black font-mono tracking-widest text-slate-900 my-1">
            0621
          </div>
        </div>

        {/* Columna Centro: Metadatos de la Declaración */}
        <div className="col-span-7 flex flex-col">
          <div className="py-1 px-3 text-center border-b border-slate-400 bg-slate-50/80 font-bold text-xs tracking-wide">
            PDT IGV - RENTA MENSUAL
          </div>
          <div className="p-2 grid grid-cols-12 gap-y-1 gap-x-2 text-[11px]">
            <div className="col-span-2 font-bold text-slate-600">RUC</div>
            <div className="col-span-10 font-mono font-bold text-slate-950">{empresa.ruc}</div>

            <div className="col-span-2 font-bold text-slate-600">Razón Social</div>
            <div className="col-span-10 font-bold text-slate-900 truncate" title={empresa.razonSocial}>
              {empresa.razonSocial}
            </div>

            <div className="col-span-2 font-bold text-slate-600">N° de Orden</div>
            <div className="col-span-4 font-mono font-bold text-slate-900">
              {numeroOrdenPresentado || '1212488542'}
            </div>
            <div className="col-span-3 font-bold text-slate-600">Período</div>
            <div className="col-span-3 font-mono font-bold text-slate-950">{periodo.replace('-', '')}</div>

            <div className="col-span-2 font-bold text-slate-600">Declaración</div>
            <div className="col-span-4 font-semibold text-slate-800">
              {tipoDeclaracion === 'ORIGINAL' ? 'Original' : 'Rectificatoria'}
            </div>
            <div className="col-span-3 font-bold text-slate-600">F. Presentación</div>
            <div className="col-span-3 font-mono font-semibold text-slate-800">
              {fechaPresentacionManual || '21/10/2026'}
            </div>

            <div className="col-span-2 font-bold text-slate-600">Moneda</div>
            <div className="col-span-10 font-semibold text-slate-800">Soles</div>
          </div>
        </div>

        {/* Columna Derecha: Copia para contribuyente */}
        <div className="col-span-2 p-2 flex flex-col justify-between items-center text-center">
          <div className="text-[10px] font-bold text-slate-600">Copia para el contribuyente</div>
          <div className="text-[11px] font-mono font-bold text-slate-800 mt-2">
            (Pag. {paginaNum})
          </div>
          <div className="text-[9px] font-mono text-slate-400 mt-2">
            ATLOB ERP v2.0
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-100/90 text-slate-900">
      {/* ========================================================================= */}
      {/* 1. BARRA SUPERIOR DE HERRAMIENTAS Y ACCIONES                              */}
      {/* ========================================================================= */}
      <BarraHerramientasLocal
        titulo={`Declaración Mensual IGV - Renta (PDT 621) — Período ${periodo}`}
        subtitulo="Estructura formal SUNAT 0621 con casillas oficiales y liquidación automática"
        acciones={[
          {
            id: 'btn-preliquidar',
            label: 'Preliquidar y Generar Asiento',
            icono: Calculator,
            primario: estadoDeclaracion === 'BORRADOR',
            disabled: estadoDeclaracion !== 'BORRADOR' || esRolAuditor,
            onClick: handlePreliquidar,
          },
          {
            id: 'btn-presentar',
            label: 'Registrar Presentación',
            icono: FileCheck,
            primario: estadoDeclaracion === 'PRELIQUIDADO',
            disabled: (estadoDeclaracion !== 'PRELIQUIDADO' && estadoDeclaracion !== 'BORRADOR') || esRolAuditor,
            onClick: () => setModalPresentarOpen(true),
          },
          {
            id: 'btn-rectificatoria',
            label: 'Generar Rectificatoria',
            icono: RefreshCw,
            disabled: (estadoDeclaracion !== 'PRESENTADO' && estadoDeclaracion !== 'PRELIQUIDADO') || esRolAuditor,
            onClick: handleGenerarRectificatoria,
          },
          {
            id: 'btn-imprimir-pdf',
            label: 'Imprimir PDF Oficial',
            icono: Printer,
            onClick: handleImprimirResumenPdf,
          },
          {
            id: 'btn-exportar-excel',
            label: 'Exportar Excel (.xlsx)',
            icono: FileSpreadsheet,
            onClick: handleExportarExcelPdt621,
          },
        ]}
        derecha={
          <div className="flex items-center gap-2 text-[11px]">
            {/* Selector de Páginas del Documento */}
            <div className="flex p-0.5 bg-slate-200/80 rounded-lg border border-slate-300">
              <button
                type="button"
                onClick={() => setPaginaActiva('PAGINA_1')}
                className={`px-2 py-1 rounded text-xs font-bold transition cursor-pointer ${
                  paginaActiva === 'PAGINA_1' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Pág. 1 (Bases)
              </button>
              <button
                type="button"
                onClick={() => setPaginaActiva('PAGINA_2')}
                className={`px-2 py-1 rounded text-xs font-bold transition cursor-pointer ${
                  paginaActiva === 'PAGINA_2' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Pág. 2 (Deuda)
              </button>
              <button
                type="button"
                onClick={() => setPaginaActiva('COMPLETO')}
                className={`px-2 py-1 rounded text-xs font-bold transition cursor-pointer ${
                  paginaActiva === 'COMPLETO' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ver Todo
              </button>
            </div>

            <button
              type="button"
              onClick={() => setPanelParametrosAbierto(!panelParametrosAbierto)}
              className="px-2.5 py-1 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition flex items-center gap-1 cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-slate-600" />
              <span>Parámetros</span>
              {panelParametrosAbierto ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            <span className="font-mono font-bold px-2 py-1 bg-slate-200 border border-slate-400 text-slate-800 rounded">
              v{versionActual} · {tipoDeclaracion}
            </span>
            <span
              className={`font-mono font-bold px-2 py-1 border rounded ${
                estadoDeclaracion === 'PRESENTADO'
                  ? 'bg-emerald-50 border-emerald-600 text-emerald-800'
                  : estadoDeclaracion === 'PRELIQUIDADO'
                  ? 'bg-blue-50 border-blue-600 text-blue-800'
                  : 'bg-amber-50 border-amber-600 text-amber-800'
              }`}
            >
              {estadoDeclaracion}
            </span>
            {asientoDeterminacion && (
              <span className="font-mono px-2 py-1 bg-emerald-50 border border-emerald-400 text-emerald-800 font-bold rounded">
                Voucher: {asientoDeterminacion}
              </span>
            )}
          </div>
        }
      />

      {esRolAuditor && (
        <div className="px-4 py-1.5 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
          <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
          <span>Modo Solo Lectura (Rol AUDITOR): Acceso de consulta sin permisos de preliquidación o presentación.</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. PANEL DESPLEGABLE DE PARÁMETROS TRIBUTARIOS DEL MES                     */}
      {/* ========================================================================= */}
      {panelParametrosAbierto && (
        <div className="bg-white border-b border-slate-300 px-6 py-3 shadow-inner">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-blue-700" />
                Parámetros Tributarios y Coeficientes del Mes ({periodo})
              </span>
              <span className="text-[11px] text-slate-500">
                Los cambios recalculan las casillas del PDT 621 en tiempo real
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Régimen Tributario:</label>
                <select
                  value={regimenSeleccionado}
                  onChange={(e) => setRegimenSeleccionado(e.target.value)}
                  disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded font-semibold text-slate-800"
                >
                  <option value="MYPE_TRIBUTARIO">MYPE Tributario (1.0% / 1.5%)</option>
                  <option value="REGIMEN_GENERAL">Régimen General (Coef. / 1.5%)</option>
                  <option value="REGIMEN_ESPECIAL">Régimen Especial RER (1.5%)</option>
                  <option value="NRUS">Nuevo RUS (Cuota S/ 20 / 50)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Saldo Favor Ant. [145]:</label>
                <input
                  type="number"
                  step="0.01"
                  value={saldoAnteriorInput}
                  onChange={(e) => setSaldoAnteriorInput(e.target.value)}
                  onBlur={handleApplySaldoAnterior}
                  disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-right font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Percep. Mes [171]:</label>
                <input
                  type="number"
                  step="0.01"
                  value={percepcionesPeriodoInput}
                  onChange={(e) => setPercepcionesPeriodoInput(e.target.value)}
                  disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-right font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Saldo Percep. Ant. [168]:</label>
                <input
                  type="number"
                  step="0.01"
                  value={percepcionesAnterioresInput}
                  onChange={(e) => setPercepcionesAnterioresInput(e.target.value)}
                  disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-right font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Retenc. Mes [179]:</label>
                <input
                  type="number"
                  step="0.01"
                  value={retencionesPeriodoInput}
                  onChange={(e) => setRetencionesPeriodoInput(e.target.value)}
                  disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-right font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Saldo Retenc. Ant. [176]:</label>
                <input
                  type="number"
                  step="0.01"
                  value={retencionesAnterioresInput}
                  onChange={(e) => setRetencionesAnterioresInput(e.target.value)}
                  disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-right font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Compras Comunes [110]:</label>
                <input
                  type="number"
                  step="0.01"
                  value={comprasUsoComunBaseInput}
                  onChange={(e) => setComprasUsoComunBaseInput(e.target.value)}
                  disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-right font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">% Prorrata IGV [173]:</label>
                <input
                  type="number"
                  step="0.01"
                  value={proporcionProrrataPct}
                  onChange={(e) => setProporcionProrrataPct(e.target.value)}
                  disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-right font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Compras No Grav. [120]:</label>
                <input
                  type="number"
                  step="0.01"
                  value={comprasInternasNoGravadasInput}
                  onChange={(e) => setComprasInternasNoGravadasInput(e.target.value)}
                  disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-right font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Coef. Renta [380]:</label>
                <input
                  type="number"
                  step="0.0001"
                  value={coeficienteRentaInput}
                  onChange={(e) => setCoeficienteRentaInput(e.target.value)}
                  disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-right font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Saldo Renta Ant. [303]:</label>
                <input
                  type="number"
                  step="0.01"
                  value={saldoFavorRentaAnteriorInput}
                  onChange={(e) => setSaldoFavorRentaAnteriorInput(e.target.value)}
                  disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-right font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Pagos Previos Renta [317]:</label>
                <input
                  type="number"
                  step="0.01"
                  value={pagosPreviosRentaInput}
                  onChange={(e) => setPagosPreviosRentaInput(e.target.value)}
                  disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-right font-mono font-semibold"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. LIENZO DEL FORMULARIO SUNAT PDT 621 (ESTRUCTURA EXACTA A PDF)          */}
      {/* ========================================================================= */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-8">

          {/* --------------------------------------------------------------------- */}
          {/* SECCIÓN PÁGINA 1: BASES IMPONIBLES Y TRIBUTOS                         */}
          {/* --------------------------------------------------------------------- */}
          {(paginaActiva === 'PAGINA_1' || paginaActiva === 'COMPLETO') && (
            <div className="bg-white p-5 border border-slate-300 shadow-xs">
              <EncabezadoOficialSunat paginaNum={1} />

              {/* TABLA 1: IGV VENTAS */}
              <div className="border border-slate-400 mb-4">
                <div className="flex items-center justify-between px-2 py-1 bg-slate-100 border-b border-slate-400 text-xs font-bold text-slate-900">
                  <span>IGV VENTAS</span>
                  <span className="text-[11px] text-slate-700 tracking-wider">IGV CUENTA PROPIA</span>
                </div>

                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-50 text-slate-800">
                      <th className="py-1 px-2 text-left font-bold" colSpan={2}>
                        CONCEPTO
                      </th>
                      <th className="py-1 px-1 text-center font-bold w-48 border-l border-slate-300" colSpan={2}>
                        BASE
                      </th>
                      <th className="py-1 px-1 text-center font-bold w-48 border-l border-slate-300" colSpan={2}>
                        TRIBUTO
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {/* Gravadas: Span de 5 filas */}
                    <tr>
                      <td
                        rowSpan={5}
                        className="w-6 text-center border-r border-slate-300 bg-slate-50/70 text-[10px] font-bold text-slate-700 select-none p-1"
                        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                      >
                        Gravadas
                      </td>
                      <td className="py-1 px-2 text-slate-900">Ventas Netas</td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="100" monto={calculo.cas100} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="101" monto={calculo.cas101} />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Ventas Netas Gravadas Ley N° 31556 y modificatorias
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="154" monto={calculo.cas154} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="155" monto={calculo.cas155} />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Descuentos Concedidos y/o devoluciones de Ventas
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="102" monto={calculo.cas102} esNegativo={calculo.cas102.gt(0)} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="103" monto={calculo.cas103} esNegativo={calculo.cas103.gt(0)} />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Ventas de bienes (ley 27037 inc. 11.1, 12.1, 12.3 y 12.4)
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="160" monto={calculo.cas160} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="161" monto={calculo.cas161} />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Descuentos y devoluciones (ley 27037)
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="162" monto={calculo.cas162} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="163" monto={calculo.cas163} />
                      </td>
                    </tr>

                    {/* Exportaciones */}
                    <tr>
                      <td
                        rowSpan={2}
                        className="w-6 text-center border-r border-slate-300 bg-slate-50/70 text-[9px] font-bold text-slate-700 select-none p-1"
                        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                      >
                        Exportación
                      </td>
                      <td className="py-1 px-2 text-slate-900">Facturadas en el período</td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="106" monto={calculo.cas106} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2} />
                    </tr>
                    <tr>
                      <td className="py-1 px-2 text-slate-900">Embarcadas en el período</td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="127" monto={calculo.cas127} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2} />
                    </tr>

                    {/* Ventas no gravadas */}
                    <tr>
                      <td colSpan={2} className="py-1 px-2 text-slate-900">
                        Ventas no Gravadas (Sin Considerar exportaciones)
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="105" monto={calculo.cas105} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2} />
                    </tr>
                    <tr>
                      <td colSpan={2} className="py-1 px-2 text-slate-900">
                        Ventas no Gravadas (Sin efecto en ratio)
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="109" monto={calculo.cas109} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2} />
                    </tr>
                    <tr>
                      <td colSpan={2} className="py-1 px-2 text-slate-900">
                        Otras ventas (inciso ii), numeral 6.2 - art. 6 del Reglamento
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="112" monto={calculo.cas112} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2} />
                    </tr>

                    {/* Fila Total Débito Fiscal */}
                    <tr className="bg-slate-50 font-bold border-t border-slate-400">
                      <td colSpan={2} className="py-1.5 px-2 text-slate-900 uppercase">
                        Total
                      </td>
                      <td className="w-48 py-1 px-1 border-l border-slate-300" colSpan={2} />
                      <td className="w-48 py-1 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="131" monto={calculo.cas131} destacado={true} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* TABLA 2: IGV COMPRAS */}
              <div className="border border-slate-400 mb-4">
                <div className="flex items-center justify-between px-2 py-1 bg-slate-100 border-b border-slate-400 text-xs font-bold text-slate-900">
                  <span>IGV COMPRAS</span>
                  <span className="text-[11px] text-slate-700 tracking-wider">IGV CUENTA PROPIA</span>
                </div>

                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-50 text-slate-800">
                      <th className="py-1 px-2 text-left font-bold" colSpan={2}>
                        CONCEPTO
                      </th>
                      <th className="py-1 px-1 text-center font-bold w-48 border-l border-slate-300" colSpan={2}>
                        BASE
                      </th>
                      <th className="py-1 px-1 text-center font-bold w-48 border-l border-slate-300" colSpan={2}>
                        TRIBUTO
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {/* Nacionales: Span de 4 filas */}
                    <tr>
                      <td
                        rowSpan={4}
                        className="w-6 text-center border-r border-slate-300 bg-slate-50/70 text-[10px] font-bold text-slate-700 select-none p-1"
                        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                      >
                        Nacionales
                      </td>
                      <td className="py-1 px-2 text-slate-900">
                        Compras netas destinada a ventas gravadas exclusivamente
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="107" monto={calculo.cas107} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="108" monto={calculo.cas108} />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Compras Netas destinadas a Vtas Gravadas Ley N° 31556 y modificatorias
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="156" monto={calculo.cas156} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="157" monto={calculo.cas157} />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Compras netas destinada a ventas gravadas y no gravadas
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="110" monto={calculo.cas110} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="111" monto={calculo.cas111} />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Compras netas destinada a ventas no gravadas exclusivamente
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="113" monto={calculo.cas113} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2} />
                    </tr>

                    {/* Importadas: Span de 3 filas */}
                    <tr>
                      <td
                        rowSpan={3}
                        className="w-6 text-center border-r border-slate-300 bg-slate-50/70 text-[10px] font-bold text-slate-700 select-none p-1"
                        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                      >
                        Importadas
                      </td>
                      <td className="py-1 px-2 text-slate-900">
                        Compras netas destinada a ventas gravadas exclusivamente
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="114" monto={calculo.cas114} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="115" monto={calculo.cas115} />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Compras netas destinada a ventas gravadas y no gravadas
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="116" monto={calculo.cas116} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="117" monto={calculo.cas117} />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Compras netas destinada a ventas no gravadas exclusivamente
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="119" monto={calculo.cas119} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2} />
                    </tr>

                    {/* Compras no gravadas */}
                    <tr>
                      <td colSpan={2} className="py-1 px-2 text-slate-900">
                        Compras internas no gravadas
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="120" monto={calculo.cas120} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2} />
                    </tr>
                    <tr>
                      <td colSpan={2} className="py-1 px-2 text-slate-900">
                        Compras importadas no gravadas
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="122" monto={calculo.cas122} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2} />
                    </tr>

                    {/* Totales y Coeficiente de Compras */}
                    <tr className="bg-slate-50 font-bold border-t border-slate-400">
                      <td colSpan={2} className="py-1.5 px-2 text-slate-900 uppercase">
                        TOTAL
                      </td>
                      <td className="w-48 py-1 px-1 border-l border-slate-300" colSpan={2} />
                      <td className="w-48 py-1 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="178" monto={calculo.cas178} destacado={true} />
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="py-1 px-2 font-bold text-slate-800 uppercase">
                        CRÉDITO FISCAL ESPECIAL
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2} />
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="172" monto={calculo.cas172} />
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="py-1 px-2 font-bold text-slate-800 uppercase">
                        COEFICIENTE
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="173" ratio={calculo.cas173} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2} />
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* TABLA 3: IVAP */}
              <div className="border border-slate-400 mb-4">
                <div className="flex items-center justify-between px-2 py-1 bg-slate-100 border-b border-slate-400 text-xs font-bold text-slate-900">
                  <span>IVAP</span>
                  <span className="text-[11px] text-slate-700 tracking-wider">IVAP</span>
                </div>

                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-50 text-slate-800">
                      <th className="py-1 px-2 text-left font-bold">CONCEPTO</th>
                      <th className="py-1 px-1 text-center font-bold w-48 border-l border-slate-300" colSpan={2}>
                        BASE
                      </th>
                      <th className="py-1 px-1 text-center font-bold w-48 border-l border-slate-300" colSpan={2}>
                        TRIBUTO
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="py-1 px-2 text-slate-900">Ventas Gravadas</td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="340" monto={calculo.cas340} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="341" monto={calculo.cas341} />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2 text-slate-900">Otros Créditos IVAP</td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2} />
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="182" monto={calculo.cas182} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* TABLA 4: RENTA */}
              <div className="border border-slate-400">
                <div className="flex items-center justify-between px-2 py-1 bg-slate-100 border-b border-slate-400 text-xs font-bold text-slate-900">
                  <span>RENTA</span>
                  <span className="text-[11px] text-slate-700 tracking-wider">RENTA</span>
                </div>

                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-50 text-slate-800">
                      <th className="py-1 px-2 text-left font-bold">CONCEPTO</th>
                      <th className="py-1 px-1 text-center font-bold w-48 border-l border-slate-300" colSpan={2}>
                        BASE
                      </th>
                      <th className="py-1 px-1 text-center font-bold w-48 border-l border-slate-300" colSpan={2}>
                        TRIBUTO
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="py-1 px-2 text-slate-900">Ingresos Netos</td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="301" monto={calculo.cas301} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="312" monto={calculo.cas312} destacado={true} />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2 text-slate-900">Coeficiente</td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="380" ratio={calculo.cas380} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2} />
                    </tr>
                    <tr>
                      <td className="py-1 px-2 text-slate-900">Porcentaje</td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="315" monto={calculo.cas315} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2} />
                    </tr>
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Coeficiente Calculado (aplicado para el Cálculo de la Cas312)
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="894" ratio={calculo.cas894} />
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2} />
                    </tr>
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Pagos a Cuenta en Exceso del Presente Ejercicio
                      </td>
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2} />
                      <td className="w-48 py-0.5 px-1 border-l border-slate-300" colSpan={2}>
                        <CeldaCasilla casilla="336" monto={calculo.cas336} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------------- */}
          {/* SECCIÓN PÁGINA 2: DETERMINACIÓN DE LA DEUDA                           */}
          {/* --------------------------------------------------------------------- */}
          {(paginaActiva === 'PAGINA_2' || paginaActiva === 'COMPLETO') && (
            <div className="bg-white p-5 border border-slate-300 shadow-xs">
              <EncabezadoOficialSunat paginaNum={2} />

              <div className="border border-slate-400 mb-4">
                <div className="flex items-center justify-between px-2 py-1 bg-slate-100 border-b border-slate-400 text-xs font-bold text-slate-900">
                  <span>DETERMINACIÓN DE LA DEUDA</span>
                  <span className="text-[11px] text-slate-700 tracking-wider">DETERMINACIÓN DE LA DEUDA</span>
                </div>

                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-50 text-slate-800">
                      <th className="py-1 px-2 text-left font-bold">CONCEPTO</th>
                      <th className="py-1 px-1 text-center font-bold w-40 border-l border-slate-300">
                        IGV
                      </th>
                      <th className="py-1 px-1 text-center font-bold w-36 border-l border-slate-300">
                        IVAP
                      </th>
                      <th className="py-1 px-1 text-center font-bold w-40 border-l border-slate-300">
                        RENTA
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {/* Fila 1: Impuesto Resultante o Saldo a Favor */}
                    <tr>
                      <td className="py-1 px-2 text-slate-900 font-medium">
                        Impuesto Resultante o Saldo a Favor
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="140" monto={calculo.cas140} esNegativo={calculo.cas140.lt(0)} />
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="353" monto={calculo.cas353} />
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="302" monto={calculo.cas302} />
                      </td>
                    </tr>

                    {/* Fila 2: Saldo a Favor del Período anterior */}
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Saldo a Favor del Período anterior
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="145" monto={calculo.cas145} />
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="351" monto={calculo.cas351} />
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="303" monto={calculo.cas303} />
                      </td>
                    </tr>

                    {/* Fila 3: Tributo a Pagar o Saldo a Favor */}
                    <tr className="bg-slate-50/60 font-medium">
                      <td className="py-1 px-2 text-slate-900 font-semibold">
                        Tributo a Pagar o Saldo a Favor
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="184" monto={calculo.cas184} esNegativo={calculo.cas184.lt(0)} destacado={true} />
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="352" monto={calculo.cas352} />
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="304" monto={calculo.cas304} destacado={true} />
                      </td>
                    </tr>

                    {/* Fila 4: Percepciones declaradas en el período */}
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Percepciones declaradas en el período
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="171" monto={calculo.cas171} />
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                    </tr>

                    {/* Fila 5: Saldo de percepciones de períodos anteriores */}
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Saldo de percepciones de períodos anteriores
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="168" monto={calculo.cas168} />
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                    </tr>

                    {/* Fila 6: Saldo de percepciones no aplicadas */}
                    <tr className="bg-slate-50/40">
                      <td className="py-1 px-2 text-slate-800">
                        Saldo de percepciones no aplicadas
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="164" monto={calculo.cas164} />
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                    </tr>

                    {/* Fila 7: Retenciones declaradas en el período */}
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Retenciones declaradas en el período
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="179" monto={calculo.cas179} />
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                    </tr>

                    {/* Fila 8: Saldo de retenciones de períodos anteriores */}
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Saldo de retenciones de períodos anteriores
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="176" monto={calculo.cas176} />
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                    </tr>

                    {/* Fila 9: Saldo de Retenciones no aplicadas */}
                    <tr className="bg-slate-50/40">
                      <td className="py-1 px-2 text-slate-800">
                        Saldo de Retenciones no aplicadas
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="165" monto={calculo.cas165} />
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                    </tr>

                    {/* Fila 10: Retenciones de tercera declaradas en período */}
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Retenciones de tercera declaradas en período
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="326" monto={calculo.cas326} />
                      </td>
                    </tr>

                    {/* Fila 11: Retenciones de tercera declaradas en periodos anteriores */}
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Retenciones de tercera declaradas en periodos anteriores
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="327" monto={calculo.cas327} />
                      </td>
                    </tr>

                    {/* Fila 12: Compensación Saldo a Favor del Exportador */}
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Compensación Saldo a Favor del Exportador
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="347" monto={calculo.cas347} />
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="305" monto={calculo.cas305} />
                      </td>
                    </tr>

                    {/* Fila 13: Impuesto Temporal a los Activos Netos */}
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Impuesto Temporal a los Activos Netos
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                      <td className="py-0.5 px-1 border-l border-slate-300" />
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="328" monto={calculo.cas328} />
                      </td>
                    </tr>

                    {/* Fila 14: Sub Total */}
                    <tr className="bg-slate-50 font-bold border-t border-slate-400">
                      <td className="py-1.5 px-2 text-slate-950 uppercase">
                        Sub Total
                      </td>
                      <td className="py-1 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="681" monto={calculo.cas681} destacado={true} />
                      </td>
                      <td className="py-1 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="683" monto={calculo.cas683} />
                      </td>
                      <td className="py-1 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="682" monto={calculo.cas682} destacado={true} />
                      </td>
                    </tr>

                    {/* Fila 15: Pagos previos */}
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Pagos previos
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="185" monto={calculo.cas185} />
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="342" monto={calculo.cas342} />
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="317" monto={calculo.cas317} />
                      </td>
                    </tr>

                    {/* Fila 16: Interés moratorio */}
                    <tr>
                      <td className="py-1 px-2 text-slate-900">
                        Interés moratorio
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="187" monto={calculo.cas187} />
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="343" monto={calculo.cas343} />
                      </td>
                      <td className="py-0.5 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="319" monto={calculo.cas319} />
                      </td>
                    </tr>

                    {/* Fila 17: Total Deuda Tributaria */}
                    <tr className="bg-slate-100 font-black border-t-2 border-slate-400 text-slate-950">
                      <td className="py-2 px-2 uppercase text-xs">
                        Total deuda tributaria
                      </td>
                      <td className="py-1 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="188" monto={calculo.cas188} destacado={true} />
                      </td>
                      <td className="py-1 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="344" monto={calculo.cas344} />
                      </td>
                      <td className="py-1 px-1 border-l border-slate-300">
                        <CeldaCasilla casilla="324" monto={calculo.cas324} destacado={true} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* ========================================================================= */}
              {/* RESUMEN EJECUTIVO — ESTILO ATLOB CONSULTORES                              */}
              {/* ========================================================================= */}
              <div className="border border-slate-400 bg-slate-900 text-white p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold block">
                      Atlob Consultores · Resumen Ejecutivo de Obligación Mensual
                    </span>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                      <div>
                        <span className="text-slate-400">IGV Propio (1011): </span>
                        <strong className="font-mono text-white">S/ {fmt(calculo.cas188)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Renta 3ra Cat (3031): </span>
                        <strong className="font-mono text-white">S/ {fmt(calculo.cas324)}</strong>
                      </div>
                      {calculo.cas344.gt(0) && (
                        <div>
                          <span className="text-slate-400">IVAP (1021): </span>
                          <strong className="font-mono text-white">S/ {fmt(calculo.cas344)}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                      Total a Pagar SUNAT (Guía 1662 / NPS)
                    </span>
                    <span className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
                      S/ {fmt(calculo.totalDeudaGeneral)}
                    </span>
                  </div>
                </div>

                {/* Sub-tarjetas de créditos y saldos no aplicados */}
                <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-300">
                  <div className="bg-slate-800/80 p-2 border border-slate-700">
                    <span className="text-slate-400 text-[10px] block">Saldo a Favor IGV Próximo Mes:</span>
                    <strong className="font-mono text-emerald-300">
                      {calculo.saldoFavorArrastrable.gt(0) ? `S/ ${fmt(calculo.saldoFavorArrastrable)}` : 'S/ 0.00'}
                    </strong>
                  </div>
                  <div className="bg-slate-800/80 p-2 border border-slate-700">
                    <span className="text-slate-400 text-[10px] block">Saldo Percepciones no aplicadas [164]:</span>
                    <strong className="font-mono text-blue-300">S/ {fmt(calculo.cas164)}</strong>
                  </div>
                  <div className="bg-slate-800/80 p-2 border border-slate-700">
                    <span className="text-slate-400 text-[10px] block">Saldo Retenciones no aplicadas [165]:</span>
                    <strong className="font-mono text-amber-300">S/ {fmt(calculo.cas165)}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* HISTORIAL DE VERSIONES CONSERVADAS ANTE RECTIFICATORIAS               */}
          {/* ===================================================================== */}
          {historialVersiones.length > 0 && (
            <div className="bg-white p-4 border border-slate-300 shadow-xs">
              <div className="flex items-center gap-2 mb-2 pb-1 border-b border-slate-200">
                <History className="w-4 h-4 text-slate-600" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Historial de Versiones Anteriores (Conservadas como Sustituidas)
                </h4>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-300 text-slate-600 text-[11px]">
                      <th className="p-2">Versión</th>
                      <th className="p-2">Tipo</th>
                      <th className="p-2">Estado</th>
                      <th className="p-2">N° Orden</th>
                      <th className="p-2">Fecha</th>
                      <th className="p-2 text-right">IGV S/</th>
                      <th className="p-2 text-right">Renta S/</th>
                      <th className="p-2 text-right">Total Deuda S/</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {historialVersiones.map((h) => (
                      <tr key={h.version} className="hover:bg-slate-50">
                        <td className="p-2 font-bold">v{h.version}</td>
                        <td className="p-2">{h.tipoDeclaracion}</td>
                        <td className="p-2">
                          <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 text-slate-600 rounded text-[10px]">
                            {h.estado}
                          </span>
                        </td>
                        <td className="p-2">{h.numeroOrden || '—'}</td>
                        <td className="p-2">{h.fechaPresentacion || '—'}</td>
                        <td className="p-2 text-right">{fmt(h.igvPorPagar)}</td>
                        <td className="p-2 text-right">{fmt(h.pagoCuentaRenta)}</td>
                        <td className="p-2 text-right font-bold text-slate-900">{fmt(h.totalDeudaTributaria)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL PARA REGISTRAR CONSTANCIA DE PRESENTACIÓN SUNAT                     */}
      {/* ========================================================================= */}
      <VentanaModal
        abierto={modalPresentarOpen}
        onCerrar={() => setModalPresentarOpen(false)}
        titulo={`Registrar Presentación Oficial PDT 621 — Período ${periodo} (v${versionActual})`}
        ancho="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalPresentarOpen(false)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmarPresentacion}
              className="px-4 py-1.5 bg-slate-900 text-white rounded text-xs font-bold hover:bg-slate-800 transition cursor-pointer shadow-xs"
            >
              Confirmar Presentación
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          <p className="text-slate-600">
            Ingrese los datos de la constancia de presentación emitida por SUNAT Operaciones en Línea (Formulario Virtual 621):
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Número de Orden SUNAT
              </label>
              <input
                type="text"
                value={inputNumeroOrden}
                onChange={(e) => setInputNumeroOrden(e.target.value)}
                placeholder="Ej. 1212488542"
                className="w-full px-2.5 py-1.5 font-mono font-bold text-slate-900 border border-slate-300 rounded bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Fecha de Presentación
              </label>
              <input
                type="text"
                value={inputFechaPresentacion}
                onChange={(e) => setInputFechaPresentacion(e.target.value)}
                placeholder="DD/MM/YYYY"
                className="w-full px-2.5 py-1.5 font-mono text-slate-900 border border-slate-300 rounded bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>
        </div>
      </VentanaModal>
    </div>
  );
};
