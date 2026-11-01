import React, { useState, useMemo } from 'react';
import {
  Calculator,
  Printer,
  CheckCircle2,
  FileCheck,
  RefreshCw,
  ShieldAlert,
  History,
} from 'lucide-react';
import Decimal from 'decimal.js';
import { LiquidacionPDT621, EmpresaCliente, Comprobante } from '../../types';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { VentanaModal } from '../ui/VentanaModal';
import { useToast } from '../../context/ToastContext';
import {
  exportarResumenPdt621EstandarPdf,
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

  // Estado del flujo de declaración PDT 621
  const [versionActual, setVersionActual] = useState<number>(1);
  const [tipoDeclaracion, setTipoDeclaracion] = useState<'ORIGINAL' | 'RECTIFICATORIA'>('ORIGINAL');
  const [estadoDeclaracion, setEstadoDeclaracion] = useState<EstadoDeclaracionPdt621>('BORRADOR');
  const [asientoDeterminacion, setAsientoDeterminacion] = useState<string | null>(null);
  const [numeroOrdenPresentado, setNumeroOrdenPresentado] = useState<string>('');
  const [fechaPresentacionManual, setFechaPresentacionManual] = useState<string>('');
  const [historialVersiones, setHistorialVersiones] = useState<VersionHistoricaPdt621[]>([]);

  // Modal de presentación manual
  const [modalPresentarOpen, setModalPresentarOpen] = useState(false);
  const [inputNumeroOrden, setInputNumeroOrden] = useState('98541203');
  const [inputFechaPresentacion, setInputFechaPresentacion] = useState('2026-10-16');

  // Parámetros y tributos aplicables del mes
  const [regimenSeleccionado, setRegimenSeleccionado] = useState<string>(
    empresa.regimenTributario || 'MYPE_TRIBUTARIO'
  );
  const [saldoAnteriorInput, setSaldoAnteriorInput] = useState<string>(
    String(liquidacion.saldoFavorPeriodoAnterior || 0)
  );
  const [retencionesIgvInput, setRetencionesIgvInput] = useState<string>('0.00');
  const [percepcionesIgvInput, setPercepcionesIgvInput] = useState<string>('0.00');
  const [coeficienteRentaInput, setCoeficienteRentaInput] = useState<string>(
    empresa.regimenTributario === 'REGIMEN_GENERAL' ? '0.0180' : '0.0000'
  );
  const [proporcionProrrataPct, setProporcionProrrataPct] = useState<string>('100.00');
  const [comprasUsoComunBaseInput, setComprasUsoComunBaseInput] = useState<string>('0.00');
  const [comprasNoGravadasInput, setComprasNoGravadasInput] = useState<string>('0.00');
  const [saldoFavorRentaAnteriorInput, setSaldoFavorRentaAnteriorInput] = useState<string>('0.00');

  const calculoCasillas = useMemo(() => {
    const tasaIgv = new Decimal('0.18');
    const cas100 = new Decimal(liquidacion.ventasNetasGravadas || 0).toDecimalPlaces(2);
    const cas101 = new Decimal(liquidacion.debitoFiscalIgv || 0).toDecimalPlaces(2);
    const cas106 = new Decimal(0);
    const cas131 = cas101;

    const cas107 = new Decimal(liquidacion.comprasNetasGravadas || 0).toDecimalPlaces(2);
    const cas108 = new Decimal(liquidacion.creditoFiscalIgv || 0).toDecimalPlaces(2);

    const cas110 = new Decimal(comprasUsoComunBaseInput || '0').toDecimalPlaces(2);
    const igvComunBruto = cas110.mul(tasaIgv).toDecimalPlaces(2);
    const pctProrrata = Decimal.min(100, Decimal.max(0, new Decimal(proporcionProrrataPct || '100')));
    const coefProrrata = pctProrrata.div(100).toDecimalPlaces(4);
    const cas111 = igvComunBruto.mul(coefProrrata).toDecimalPlaces(2);
    const igvCostoGastoProrrata = Decimal.max(0, igvComunBruto.minus(cas111));

    const cas113 = new Decimal(comprasNoGravadasInput || '0').toDecimalPlaces(2);
    const cas178 = cas108.plus(cas111).toDecimalPlaces(2);

    // Casilla 140: Impuesto resultante (>0) o Saldo a favor del mes (<0)
    const cas140 = cas131.minus(cas178).toDecimalPlaces(2);
    const cas145 = Decimal.max(0, new Decimal(saldoAnteriorInput || '0')).toDecimalPlaces(2);

    // Tributo a pagar o saldo a favor tras aplicar saldo anterior
    const netoDespuesSaldoAnterior = cas140.minus(cas145);
    const cas184 = Decimal.max(0, netoDespuesSaldoAnterior).toDecimalPlaces(2);
    const saldoFavorDespues145 = netoDespuesSaldoAnterior.lt(0)
      ? netoDespuesSaldoAnterior.abs()
      : new Decimal(0);

    const cas171 = Decimal.max(0, new Decimal(retencionesIgvInput || '0')).toDecimalPlaces(2);
    const cas168 = Decimal.max(0, new Decimal(percepcionesIgvInput || '0')).toDecimalPlaces(2);

    const netoFinalIgv = cas184.minus(cas171).minus(cas168);
    const cas188 = Decimal.max(0, netoFinalIgv).toDecimalPlaces(2);
    const excedenteRetPer = netoFinalIgv.lt(0) ? netoFinalIgv.abs() : new Decimal(0);
    const cas179 = saldoFavorDespues145.plus(excedenteRetPer).toDecimalPlaces(2);

    // Renta 3ra Categoría (Parámetros editables UIT 2026 = S/ 5,500)
    const cas301 = cas100;
    const coefInput = Decimal.max(0, new Decimal(coeficienteRentaInput || '0'));
    let tasaRentaFraccion = new Decimal('0.01');
    let etiquetaRegimen = 'RMT Tramo 1 (<= 300 UIT — 1.00%)';

    if (regimenSeleccionado === 'REGIMEN_GENERAL') {
      const tasaMinRg = new Decimal('0.015');
      tasaRentaFraccion = Decimal.max(tasaMinRg, coefInput);
      etiquetaRegimen = coefInput.gt(tasaMinRg)
        ? `Régimen General — Coeficiente (${tasaRentaFraccion.mul(100).toFixed(2)}%)`
        : 'Régimen General — Porcentaje mínimo (1.50%)';
    } else if (regimenSeleccionado === 'REGIMEN_ESPECIAL') {
      tasaRentaFraccion = new Decimal('0.015');
      etiquetaRegimen = 'Régimen Especial de Renta — RER (1.50%)';
    } else if (regimenSeleccionado === 'NRUS') {
      tasaRentaFraccion = new Decimal(0);
      etiquetaRegimen = 'Nuevo RUS — Cuota Fija';
    } else {
      tasaRentaFraccion = new Decimal('0.01');
      etiquetaRegimen = 'Régimen MYPE Tributario — Hasta 300 UIT (1.00%)';
    }

    const cas315 = tasaRentaFraccion.mul(100).toDecimalPlaces(2);
    const cas302 =
      regimenSeleccionado === 'NRUS'
        ? cas301.lte(5000)
          ? new Decimal(20)
          : new Decimal(50)
        : cas301.mul(tasaRentaFraccion).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

    const cas303 = Decimal.max(0, new Decimal(saldoFavorRentaAnteriorInput || '0')).toDecimalPlaces(2);
    const cas304 = Decimal.max(0, cas302.minus(cas303)).toDecimalPlaces(2);

    const totalDeudaMes = cas188.plus(cas304).toDecimalPlaces(2);

    const listaPdf = [
      { seccion: 'IGV VENTAS', casillaBase: '100', montoBase: cas100.toNumber(), casillaTributo: '101', concepto: 'Ventas netas gravadas (Base imponible RVIE)', montoTributo: cas101.toNumber(), enteroSunat: Math.round(cas101.toNumber()) },
      { seccion: 'IGV VENTAS', casillaBase: '106', montoBase: cas106.toNumber(), casillaTributo: '—', concepto: 'Exportaciones facturadas en el período', montoTributo: 0, enteroSunat: 0 },
      { seccion: 'IGV VENTAS', casillaBase: '—', montoBase: cas100.toNumber(), casillaTributo: '131', concepto: 'TOTAL DÉBITO FISCAL DEL PERÍODO', montoTributo: cas131.toNumber(), enteroSunat: Math.round(cas131.toNumber()) },
      { seccion: 'IGV COMPRAS', casillaBase: '107', montoBase: cas107.toNumber(), casillaTributo: '108', concepto: 'Compras netas destinadas a ventas gravadas exclusivas (Destino 1)', montoTributo: cas108.toNumber(), enteroSunat: Math.round(cas108.toNumber()) },
      { seccion: 'IGV COMPRAS', casillaBase: '110', montoBase: cas110.toNumber(), casillaTributo: '111', concepto: `Compras destinadas a ventas gravadas y no gravadas — Prorrata ${pctProrrata.toFixed(2)}% (Destino 2)`, montoTributo: cas111.toNumber(), enteroSunat: Math.round(cas111.toNumber()) },
      { seccion: 'IGV COMPRAS', casillaBase: '113', montoBase: cas113.toNumber(), casillaTributo: '—', concepto: 'Compras netas destinadas a operaciones no gravadas (Destino 3) / Adq. no gravadas', montoTributo: 0, enteroSunat: 0 },
      { seccion: 'IGV COMPRAS', casillaBase: '—', montoBase: cas107.plus(cas110).toNumber(), casillaTributo: '178', concepto: 'TOTAL CRÉDITO FISCAL DEL PERÍODO (Cas. 108 + Cas. 111)', montoTributo: cas178.toNumber(), enteroSunat: Math.round(cas178.toNumber()) },
      { seccion: 'DETERM. IGV', casillaBase: '—', montoBase: null, casillaTributo: '140', concepto: 'Impuesto resultante o Saldo a favor del período (Cas. 131 - Cas. 178)', montoTributo: cas140.toNumber(), enteroSunat: Math.round(cas140.toNumber()) },
      { seccion: 'DETERM. IGV', casillaBase: '—', montoBase: null, casillaTributo: '145', concepto: 'Saldo a favor del período anterior', montoTributo: cas145.toNumber(), enteroSunat: Math.round(cas145.toNumber()) },
      { seccion: 'DETERM. IGV', casillaBase: '—', montoBase: null, casillaTributo: '184', concepto: 'Tributo a pagar IGV o Saldo a favor antes de retenciones/percepciones', montoTributo: cas184.toNumber(), enteroSunat: Math.round(cas184.toNumber()) },
      { seccion: 'DETERM. IGV', casillaBase: '—', montoBase: null, casillaTributo: '171', concepto: 'Retenciones del IGV declaradas en el período', montoTributo: cas171.toNumber(), enteroSunat: Math.round(cas171.toNumber()) },
      { seccion: 'DETERM. IGV', casillaBase: '—', montoBase: null, casillaTributo: '168', concepto: 'Percepciones del IGV declaradas en el período', montoTributo: cas168.toNumber(), enteroSunat: Math.round(cas168.toNumber()) },
      { seccion: 'DETERM. IGV', casillaBase: '—', montoBase: null, casillaTributo: '179', concepto: 'Nuevo Saldo a Favor del IGV para el siguiente período', montoTributo: cas179.toNumber(), enteroSunat: Math.round(cas179.toNumber()) },
      { seccion: 'DETERM. IGV', casillaBase: '—', montoBase: null, casillaTributo: '188', concepto: 'TOTAL DEUDA TRIBUTARIA IGV POR PAGAR', montoTributo: cas188.toNumber(), enteroSunat: Math.round(cas188.toNumber()) },
      { seccion: 'RENTA 3RA', casillaBase: '301', montoBase: cas301.toNumber(), casillaTributo: '302', concepto: `Ingresos netos del mes — ${etiquetaRegimen}`, montoTributo: cas302.toNumber(), enteroSunat: Math.round(cas302.toNumber()) },
      { seccion: 'RENTA 3RA', casillaBase: '—', montoBase: null, casillaTributo: '303', concepto: 'Saldo a favor del Impuesto a la Renta de ejercicios anteriores', montoTributo: cas303.toNumber(), enteroSunat: Math.round(cas303.toNumber()) },
      { seccion: 'RENTA 3RA', casillaBase: '—', montoBase: null, casillaTributo: '304', concepto: 'TOTAL DEUDA TRIBUTARIA PAGO A CUENTA RENTA 3RA CATEGORÍA', montoTributo: cas304.toNumber(), enteroSunat: Math.round(cas304.toNumber()) },
    ];

    return {
      cas100,
      cas101,
      cas106,
      cas131,
      cas107,
      cas108,
      cas110,
      cas111,
      cas113,
      cas178,
      cas140,
      cas145,
      cas184,
      cas171,
      cas168,
      cas179,
      cas188,
      cas301,
      cas315,
      cas302,
      cas303,
      cas304,
      coefProrrata,
      igvCostoGastoProrrata,
      etiquetaRegimen,
      totalDeudaMes,
      listaPdf,
    };
  }, [
    liquidacion,
    comprasUsoComunBaseInput,
    proporcionProrrataPct,
    comprasNoGravadasInput,
    saldoAnteriorInput,
    retencionesIgvInput,
    percepcionesIgvInput,
    coeficienteRentaInput,
    regimenSeleccionado,
    saldoFavorRentaAnteriorInput,
  ]);

  const handleApplySaldoAnterior = () => {
    const val = parseFloat(saldoAnteriorInput) || 0;
    onUpdateSaldoAnterior(val);
  };

  const handlePreliquidar = () => {
    if (esRolAuditor) {
      error('PERMISO_DENEGADO: El rol AUDITOR solo tiene permisos de lectura y no puede preliquidar declaraciones.', 'Acceso Restringido');
      return;
    }
    const numeroVoucher = `06-000${versionActual}`;
    setEstadoDeclaracion('PRELIQUIDADO');
    setAsientoDeterminacion(numeroVoucher);
    success(
      `Declaración PDT 621 (${periodo} v${versionActual}) preliquidada. Asiento de determinación ${numeroVoucher} generado en Subdiario 06.`,
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
      `Declaración PDT 621 registrada como PRESENTADA (N° Orden ${inputNumeroOrden.trim()} — Fecha ${inputFechaPresentacion.trim()}).`,
      'Declaración Presentada'
    );
  };

  const handleGenerarRectificatoria = () => {
    if (esRolAuditor) {
      error('PERMISO_DENEGADO: El rol AUDITOR no puede generar declaraciones rectificatorias.', 'Acceso Restringido');
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
        igvPorPagar: calculoCasillas.cas188.toNumber(),
        pagoCuentaRenta: calculoCasillas.cas304.toNumber(),
        totalDeudaTributaria: calculoCasillas.totalDeudaMes.toNumber(),
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
    info(
      `Versión anterior v${versionActual} conservada como SUSTITUIDA. Editando Declaración Rectificatoria v${nuevaVer} en estado BORRADOR.`,
      'Rectificatoria Iniciada'
    );
  };

  const handleImprimirResumenPdf = () => {
    exportarResumenPdt621EstandarPdf({
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
      totalDeudaIgv: calculoCasillas.cas188.toNumber(),
      nuevoSaldoFavorIgv: calculoCasillas.cas179.toNumber(),
      pagoCuentaRenta: calculoCasillas.cas304.toNumber(),
      totalPagarSunat: calculoCasillas.totalDeudaMes.toNumber(),
      filasCasillas: calculoCasillas.listaPdf,
    });
    success('Resumen imprimible PDT 621 exportado en PDF (Formato estándar Atlob).', 'PDF Generado');
  };

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo={`Declaración Mensual IGV - Renta (PDT 621) — Período ${periodo}`}
        subtitulo="Determinación mensual desde Registro de Ventas y Compras; no realiza envío telemático directo a SUNAT"
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
            label: 'Registrar Presentación (N° Orden)',
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
            label: 'Imprimir Resumen PDF (Formato estándar Atlob)',
            icono: Printer,
            onClick: handleImprimirResumenPdf,
          },
        ]}
        derecha={
          <div className="flex items-center gap-2 text-[11px]">
            <span className="font-mono font-bold px-2 py-0.5 bg-[#E8ECF1] border border-[#1E3A5F] text-[#1E3A5F]">
              v{versionActual} · {tipoDeclaracion}
            </span>
            <span
              className={`font-mono font-bold px-2 py-0.5 border ${
                estadoDeclaracion === 'PRESENTADO'
                  ? 'bg-[#ECFDF5] border-[#1E6F42] text-[#1E6F42]'
                  : estadoDeclaracion === 'PRELIQUIDADO'
                  ? 'bg-[#EFF6FF] border-[#1D4ED8] text-[#1D4ED8]'
                  : 'bg-[#FEF3C7] border-[#B45309] text-[#B45309]'
              }`}
            >
              Estado: {estadoDeclaracion}
            </span>
            {asientoDeterminacion && (
              <span className="font-mono px-2 py-0.5 bg-[#ECFDF5] border border-[#1E6F42] text-[#1E6F42] font-bold">
                Voucher: {asientoDeterminacion}
              </span>
            )}
            {numeroOrdenPresentado && (
              <span className="font-mono px-2 py-0.5 bg-[#F5F7FA] border border-[#D1D5DB] text-[#111827] font-bold">
                Orden SUNAT: {numeroOrdenPresentado} ({fechaPresentacionManual})
              </span>
            )}
          </div>
        }
      />

      {esRolAuditor && (
        <div className="px-3 py-1.5 bg-[#FEF2F2] border-b border-[#B91C1C] text-[#B91C1C] text-[11px] flex items-center gap-1.5 font-bold">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>
            Modo Solo Lectura (Rol AUDITOR): La preliquidación, generación de asientos y presentación están restringidas por control de acceso RBAC.
          </span>
        </div>
      )}

      {/* Barra de parámetros editables de la liquidación */}
      <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] grid grid-cols-7 gap-2 text-[11px]">
        <div>
          <label className="block font-bold text-[#1E3A5F] mb-0.5">Régimen Tributario</label>
          <select
            value={regimenSeleccionado}
            onChange={(e) => setRegimenSeleccionado(e.target.value)}
            disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
            className="w-full h-6 px-1.5 text-[11px] bg-[#FFFFFF] border border-[#D1D5DB]"
          >
            <option value="MYPE_TRIBUTARIO">MYPE Tributario (1.0% / 1.5%)</option>
            <option value="REGIMEN_GENERAL">Régimen General (Coef. / 1.5%)</option>
            <option value="REGIMEN_ESPECIAL">Régimen Especial RER (1.5%)</option>
            <option value="NRUS">Nuevo RUS (Cuota S/ 20 / S/ 50)</option>
          </select>
        </div>

        <div>
          <label className="block font-bold text-[#1E3A5F] mb-0.5">Saldo Favor Ant. [Cas. 145]</label>
          <input
            type="number"
            step="0.01"
            value={saldoAnteriorInput}
            onChange={(e) => setSaldoAnteriorInput(e.target.value)}
            onBlur={handleApplySaldoAnterior}
            disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
            className="w-full h-6 px-1.5 text-right font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
          />
        </div>

        <div>
          <label className="block font-bold text-[#1E3A5F] mb-0.5">Retenciones IGV [Cas. 171]</label>
          <input
            type="number"
            step="0.01"
            value={retencionesIgvInput}
            onChange={(e) => setRetencionesIgvInput(e.target.value)}
            disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
            className="w-full h-6 px-1.5 text-right font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
          />
        </div>

        <div>
          <label className="block font-bold text-[#1E3A5F] mb-0.5">Percepciones IGV [Cas. 168]</label>
          <input
            type="number"
            step="0.01"
            value={percepcionesIgvInput}
            onChange={(e) => setPercepcionesIgvInput(e.target.value)}
            disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
            className="w-full h-6 px-1.5 text-right font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
          />
        </div>

        <div>
          <label className="block font-bold text-[#1E3A5F] mb-0.5">Compras Comunes [Cas. 110]</label>
          <input
            type="number"
            step="0.01"
            value={comprasUsoComunBaseInput}
            onChange={(e) => setComprasUsoComunBaseInput(e.target.value)}
            disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
            className="w-full h-6 px-1.5 text-right font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
          />
        </div>

        <div>
          <label className="block font-bold text-[#1E3A5F] mb-0.5">% Prorrata IGV [Cas. 173]</label>
          <input
            type="number"
            step="0.01"
            value={proporcionProrrataPct}
            onChange={(e) => setProporcionProrrataPct(e.target.value)}
            disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
            className="w-full h-6 px-1.5 text-right font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
          />
        </div>

        <div>
          <label className="block font-bold text-[#1E3A5F] mb-0.5">Coeficiente Renta [Cas. 380]</label>
          <input
            type="number"
            step="0.0001"
            value={coeficienteRentaInput}
            onChange={(e) => setCoeficienteRentaInput(e.target.value)}
            disabled={estadoDeclaracion === 'PRESENTADO' || esRolAuditor}
            className="w-full h-6 px-1.5 text-right font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
          />
        </div>
      </div>

      {/* Cuerpo principal: Casillas Oficiales PDT 621 */}
      <div className="flex-1 p-3 grid grid-cols-12 gap-3 overflow-auto text-[12px]">
        {/* Columna Izquierda: Determinación del IGV (7 columnas) */}
        <div className="col-span-7 border border-[#D1D5DB] bg-[#FFFFFF] flex flex-col">
          <div className="px-2.5 py-1.5 bg-[#E8ECF1] border-b border-[#D1D5DB] font-bold text-[#1E3A5F] flex justify-between items-center">
            <span>I. DETERMINACIÓN DEL IMPUESTO GENERAL A LAS VENTAS (IGV — TASA 18%)</span>
            <span className="font-mono text-[11px]">Ventas ({ventas.length}) · Compras ({compras.length})</span>
          </div>

          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="bg-[#F5F7FA] border-b border-[#D1D5DB] text-[#1E3A5F] text-[11px]">
                <th className="py-1 px-2 text-left w-16">Casilla</th>
                <th className="py-1 px-2 text-left">Concepto / Origen Tributario</th>
                <th className="py-1 px-2 text-right w-28">Base Imponible S/</th>
                <th className="py-1 px-2 text-right w-28">Tributo / IGV S/</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              <tr className="h-[26px]">
                <td className="px-2 font-mono font-bold text-[#1D4ED8]">[100/101]</td>
                <td className="px-2">Ventas Netas Gravadas (Desde Registro de Ventas RVIE)</td>
                <td className="px-2 text-right font-mono">{calculoCasillas.cas100.toFixed(2)}</td>
                <td className="px-2 text-right font-mono font-bold">{calculoCasillas.cas101.toFixed(2)}</td>
              </tr>
              <tr className="h-[26px] bg-[#F5F7FA] font-bold">
                <td className="px-2 font-mono text-[#1E3A5F]">[131]</td>
                <td className="px-2 text-[#1E3A5F]">TOTAL DÉBITO FISCAL DEL PERÍODO</td>
                <td className="px-2 text-right font-mono">{calculoCasillas.cas100.toFixed(2)}</td>
                <td className="px-2 text-right font-mono text-[#1E3A5F]">{calculoCasillas.cas131.toFixed(2)}</td>
              </tr>
              <tr className="h-[26px]">
                <td className="px-2 font-mono font-bold text-[#1E6F42]">[107/108]</td>
                <td className="px-2">Compras Gravadas Destinadas a Operaciones Gravadas Exclusivas (Destino 1)</td>
                <td className="px-2 text-right font-mono">{calculoCasillas.cas107.toFixed(2)}</td>
                <td className="px-2 text-right font-mono font-bold text-[#1E6F42]">{calculoCasillas.cas108.toFixed(2)}</td>
              </tr>
              <tr className="h-[26px]">
                <td className="px-2 font-mono font-bold text-[#1E6F42]">[110/111]</td>
                <td className="px-2">
                  Compras Destinadas a Operaciones Mixtas / Comunes (Destino 2 — Coef. {calculoCasillas.coefProrrata.toFixed(4)})
                </td>
                <td className="px-2 text-right font-mono">{calculoCasillas.cas110.toFixed(2)}</td>
                <td className="px-2 text-right font-mono font-bold text-[#1E6F42]">{calculoCasillas.cas111.toFixed(2)}</td>
              </tr>
              <tr className="h-[26px]">
                <td className="px-2 font-mono text-[#4B5563]">[113]</td>
                <td className="px-2 text-[#4B5563]">Compras Destinadas a Operaciones No Gravadas (Destino 3) / Adq. No Gravadas</td>
                <td className="px-2 text-right font-mono">{calculoCasillas.cas113.toFixed(2)}</td>
                <td className="px-2 text-right font-mono text-[#4B5563]">0.00</td>
              </tr>
              <tr className="h-[26px] bg-[#F5F7FA] font-bold">
                <td className="px-2 font-mono text-[#1E6F42]">[178]</td>
                <td className="px-2 text-[#1E6F42]">TOTAL CRÉDITO FISCAL DEDUCIBLE (Cas. 108 + Cas. 111)</td>
                <td className="px-2 text-right font-mono">
                  {calculoCasillas.cas107.plus(calculoCasillas.cas110).toFixed(2)}
                </td>
                <td className="px-2 text-right font-mono text-[#1E6F42]">{calculoCasillas.cas178.toFixed(2)}</td>
              </tr>
              <tr className="h-[26px]">
                <td className="px-2 font-mono font-bold">[140]</td>
                <td className="px-2">Impuesto Resultante o Saldo a Favor del Mes (Cas. 131 - Cas. 178)</td>
                <td className="px-2 text-right font-mono text-[#9CA3AF]">—</td>
                <td className="px-2 text-right font-mono font-bold">{calculoCasillas.cas140.toFixed(2)}</td>
              </tr>
              <tr className="h-[26px]">
                <td className="px-2 font-mono font-bold">[145]</td>
                <td className="px-2">(-) Saldo a Favor del Período Anterior</td>
                <td className="px-2 text-right font-mono text-[#9CA3AF]">—</td>
                <td className="px-2 text-right font-mono text-[#1E6F42]">-{calculoCasillas.cas145.toFixed(2)}</td>
              </tr>
              <tr className="h-[26px]">
                <td className="px-2 font-mono font-bold">[184]</td>
                <td className="px-2">Tributo a Pagar IGV antes de Retenciones / Percepciones</td>
                <td className="px-2 text-right font-mono text-[#9CA3AF]">—</td>
                <td className="px-2 text-right font-mono font-bold">{calculoCasillas.cas184.toFixed(2)}</td>
              </tr>
              <tr className="h-[26px]">
                <td className="px-2 font-mono font-bold">[171]</td>
                <td className="px-2">(-) Retenciones del IGV del Período</td>
                <td className="px-2 text-right font-mono text-[#9CA3AF]">—</td>
                <td className="px-2 text-right font-mono text-[#1E6F42]">-{calculoCasillas.cas171.toFixed(2)}</td>
              </tr>
              <tr className="h-[26px]">
                <td className="px-2 font-mono font-bold">[168]</td>
                <td className="px-2">(-) Percepciones del IGV del Período</td>
                <td className="px-2 text-right font-mono text-[#9CA3AF]">—</td>
                <td className="px-2 text-right font-mono text-[#1E6F42]">-{calculoCasillas.cas168.toFixed(2)}</td>
              </tr>
              <tr className="h-[26px] bg-[#ECFDF5]">
                <td className="px-2 font-mono font-bold text-[#1E6F42]">[179]</td>
                <td className="px-2 font-bold text-[#1E6F42]">Saldo a Favor del IGV para el Siguiente Período</td>
                <td className="px-2 text-right font-mono text-[#9CA3AF]">—</td>
                <td className="px-2 text-right font-mono font-bold text-[#1E6F42]">{calculoCasillas.cas179.toFixed(2)}</td>
              </tr>
              <tr className="h-[28px] bg-[#E8ECF1] font-bold">
                <td className="px-2 font-mono text-[#1E3A5F]">[188]</td>
                <td className="px-2 text-[#1E3A5F]">DEUDA TRIBUTARIA IGV POR PAGAR A SUNAT</td>
                <td className="px-2 text-right font-mono text-[#9CA3AF]">—</td>
                <td className="px-2 text-right font-mono text-[13px] text-[#111827]">{calculoCasillas.cas188.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Columna Derecha: Pago a Cuenta Renta, Total Deuda e Historial de Versiones (5 columnas) */}
        <div className="col-span-5 flex flex-col gap-3">
          <div className="border border-[#D1D5DB] bg-[#FFFFFF]">
            <div className="px-2.5 py-1.5 bg-[#E8ECF1] border-b border-[#D1D5DB] font-bold text-[#1E3A5F] flex justify-between items-center">
              <span>II. PAGO A CUENTA IMPUESTO A LA RENTA (3RA CATEGORÍA)</span>
              <span className="font-mono text-[11px] text-[#1D4ED8]">UIT 2026: S/ 5,500</span>
            </div>

            <table className="w-full text-[12px] border-collapse">
              <tbody className="divide-y divide-[#E5E7EB]">
                <tr className="h-[26px]">
                  <td className="px-2 font-mono font-bold text-[#1D4ED8] w-16">[301]</td>
                  <td className="px-2">Ingresos Netos Mensuales Gravados</td>
                  <td className="px-2 text-right font-mono font-bold w-28">
                    {calculoCasillas.cas301.toFixed(2)}
                  </td>
                </tr>
                <tr className="h-[26px]">
                  <td className="px-2 font-mono font-bold text-[#4B5563]">[315]</td>
                  <td className="px-2">{calculoCasillas.etiquetaRegimen}</td>
                  <td className="px-2 text-right font-mono font-bold text-[#1D4ED8]">
                    {calculoCasillas.cas315.toFixed(2)}%
                  </td>
                </tr>
                <tr className="h-[26px]">
                  <td className="px-2 font-mono font-bold">[302]</td>
                  <td className="px-2">Pago a Cuenta Determinado del Mes</td>
                  <td className="px-2 text-right font-mono font-bold">{calculoCasillas.cas302.toFixed(2)}</td>
                </tr>
                <tr className="h-[26px]">
                  <td className="px-2 font-mono font-bold">[303]</td>
                  <td className="px-2">(-) Saldo a Favor de Renta Ejercicios Anteriores</td>
                  <td className="px-2 text-right font-mono text-[#1E6F42]">-{calculoCasillas.cas303.toFixed(2)}</td>
                </tr>
                <tr className="h-[28px] bg-[#E8ECF1] font-bold">
                  <td className="px-2 font-mono text-[#1E3A5F]">[304]</td>
                  <td className="px-2 text-[#1E3A5F]">PAGO A CUENTA RENTA POR PAGAR</td>
                  <td className="px-2 text-right font-mono text-[13px] text-[#111827]">
                    {calculoCasillas.cas304.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Resumen Ejecutivo Total a Pagar */}
          <div className="border border-[#1E3A5F] bg-[#F5F7FA] p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-[#D1D5DB] pb-1.5">
              <span className="font-bold text-[#1E3A5F] text-[12px]">
                III. TOTAL DEUDA TRIBUTARIA MENSUAL (CAS. 188 + CAS. 304)
              </span>
              <span className="font-mono text-[11px] px-1.5 py-0.5 bg-[#FFFFFF] border border-[#D1D5DB] font-bold">
                Guía Pagos Varios 1662 / NPS
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <div className="text-[11px] text-[#4B5563]">
                <div>IGV Cuenta Propia (Tributo 1011): <strong>S/ {calculoCasillas.cas188.toFixed(2)}</strong></div>
                <div>Renta 3ra Categoría (Tributo 3031): <strong>S/ {calculoCasillas.cas304.toFixed(2)}</strong></div>
              </div>
              <div className="font-mono font-bold text-[20px] text-[#111827]">
                S/ {calculoCasillas.totalDeudaMes.toFixed(2)}
              </div>
            </div>

            <div className="pt-1.5 border-t border-[#D1D5DB] text-[11px] text-[#1E6F42] flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                Los montos provienen de las tablas de Compras y Ventas de la empresa activa y parámetros tributarios vigentes.
              </span>
            </div>
          </div>

          {/* Historial de versiones (Original y Rectificatorias) */}
          <div className="border border-[#D1D5DB] bg-[#FFFFFF] flex-1 flex flex-col">
            <div className="px-2.5 py-1.5 bg-[#E8ECF1] border-b border-[#D1D5DB] font-bold text-[#1E3A5F] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                Historial de Versiones del Período ({historialVersiones.length + 1})
              </span>
              <span className="text-[10px] text-[#4B5563]">Conserva originales ante rectificatoria</span>
            </div>

            <div className="p-2 overflow-auto text-[11px]">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#D1D5DB] text-[#4B5563]">
                    <th className="py-1 text-left">Ver.</th>
                    <th className="py-1 text-left">Tipo</th>
                    <th className="py-1 text-left">Estado</th>
                    <th className="py-1 text-left">N° Orden</th>
                    <th className="py-1 text-right">Total S/</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB] font-mono">
                  <tr className="bg-[#EFF6FF] font-bold">
                    <td className="py-1">v{versionActual}</td>
                    <td className="py-1">{tipoDeclaracion}</td>
                    <td className="py-1 text-[#1D4ED8]">{estadoDeclaracion}</td>
                    <td className="py-1">{numeroOrdenPresentado || '—'}</td>
                    <td className="py-1 text-right">{calculoCasillas.totalDeudaMes.toFixed(2)}</td>
                  </tr>
                  {historialVersiones.map((h) => (
                    <tr key={h.version} className="text-[#4B5563]">
                      <td className="py-1">v{h.version}</td>
                      <td className="py-1">{h.tipoDeclaracion}</td>
                      <td className="py-1">{h.estado}</td>
                      <td className="py-1">{h.numeroOrden || '—'}</td>
                      <td className="py-1 text-right">{h.totalDeudaTributaria.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Modal para registrar presentación manual ante SUNAT */}
      <VentanaModal
        abierto={modalPresentarOpen}
        onCerrar={() => setModalPresentarOpen(false)}
        titulo={`Registrar Presentación Manual PDT 621 — Período ${periodo} (v${versionActual})`}
        ancho="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalPresentarOpen(false)}
              className="h-6 px-3 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmarPresentacion}
              className="h-6 px-3 bg-[#1E3A5F] text-[#FFFFFF] text-[12px] font-bold"
            >
              Confirmar Presentación
            </button>
          </div>
        }
      >
        <div className="space-y-2.5 text-[12px]">
          <p className="text-[#4B5563]">
            Registre los datos de la constancia de presentación emitida por SUNAT Operaciones en Línea (Formulario Virtual 621):
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-[#111827] mb-0.5">Número de Orden SUNAT</label>
              <input
                type="text"
                value={inputNumeroOrden}
                onChange={(e) => setInputNumeroOrden(e.target.value)}
                className="w-full h-6 px-2 font-mono border border-[#1E3A5F] bg-[#FFFFFF]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#111827] mb-0.5">Fecha de Presentación</label>
              <input
                type="text"
                value={inputFechaPresentacion}
                onChange={(e) => setInputFechaPresentacion(e.target.value)}
                placeholder="YYYY-MM-DD"
                className="w-full h-6 px-2 font-mono border border-[#D1D5DB] bg-[#FFFFFF]"
              />
            </div>
          </div>
        </div>
      </VentanaModal>
    </div>
  );
};
