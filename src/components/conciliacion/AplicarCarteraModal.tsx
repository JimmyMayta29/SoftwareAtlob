import React, { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  FileCheck2,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  TIPOS_OPERACION_CARTERA_ESPECIAL_V2,
  type AplicarLineaCarteraInput,
  type CuentaBancariaV2,
  type PartidaExtractoV2,
  type SugerenciaDocumentoCarteraV2,
  type TipoOperacionCarteraEspecialV2,
} from '../../api/conciliacionV2Api';
import {
  extraerMensajeErrorConciliacion,
  useAplicarLineaCarteraV2,
  useCuentasContablesDisponiblesV2,
  useSugerenciasCarteraV2,
} from '../../hooks/useConciliacionV2';
import { VentanaModal } from '../ui/VentanaModal';
import {
  aCentavos,
  formatearCentavos,
  formatearMonedaExacta,
} from './conciliacionUtils';

export interface AplicarCarteraModalProps {
  abierto: boolean;
  onCerrar: () => void;
  empresaId: string;
  cuenta: CuentaBancariaV2 | null;
  periodo: string;
  linea: PartidaExtractoV2 | null;
  puedeOperar: boolean;
}

const ETIQUETAS_OPERACION_ESPECIAL: Record<TipoOperacionCarteraEspecialV2, string> = {
  ESTANDAR: 'Estándar (CxC / CxP)',
  RETENCION_IGV: 'Retención IGV (CRE 3%)',
  DETRACCION_SPOT: 'Detracción SPOT (BN)',
  COMISION_POS: 'Comisión POS / Tarjeta',
  TRIBUTO_SUNAT: 'Tributo SUNAT (OTRO)',
  AFP_ONP_ESSALUD: 'AFP / ONP / EsSalud (OTRO)',
  LOTE_PLANILLA: 'Lote Planilla (OTRO)',
};

const CUENTA_DEFAULT_ESPECIAL: Partial<Record<TipoOperacionCarteraEspecialV2, string>> = {
  TRIBUTO_SUNAT: '40111',
  AFP_ONP_ESSALUD: '4031',
  LOTE_PLANILLA: '4111',
  DETRACCION_SPOT: '4213',
};

function esOperacionSinDocumentosDefault(op: TipoOperacionCarteraEspecialV2): boolean {
  return op === 'TRIBUTO_SUNAT' || op === 'AFP_ONP_ESSALUD' || op === 'LOTE_PLANILLA';
}

function centavosATextoDecimal(centavos: number): string {
  return new Decimal(centavos).dividedBy(100).toFixed(2);
}

function parsearDecimalPositivoTexto(texto: string): Decimal | null {
  const limpio = texto.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  try {
    const dec = new Decimal(limpio);
    if (dec.lte(0)) return null;
    return dec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } catch {
    return null;
  }
}

function parsearDecimalNoNegativoTexto(texto: string): Decimal | null {
  const limpio = texto.trim();
  if (!limpio) return new Decimal(0);
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  try {
    const dec = new Decimal(limpio);
    if (dec.lt(0)) return null;
    return dec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } catch {
    return null;
  }
}

function badgeScoreClase(score: number): string {
  if (score >= 0.75) return 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]';
  if (score >= 0.45) return 'bg-[#EFF6FF] text-[#1E3A5F] border-[#1E3A5F]';
  return 'bg-[#F3F4F6] text-[#4B5563] border-[#9CA3AF]';
}

export const AplicarCarteraModal: React.FC<AplicarCarteraModalProps> = ({
  abierto,
  onCerrar,
  empresaId,
  cuenta,
  periodo,
  linea,
  puedeOperar,
}) => {
  const moneda = cuenta?.moneda === 'USD' ? 'USD' : 'PEN';
  const montoLineaCentavos = linea ? aCentavos(linea.monto) : 0;
  const esAbono = montoLineaCentavos > 0;
  const bancoAbsCentavos = Math.abs(montoLineaCentavos);

  const [tipoOperacionEspecial, setTipoOperacionEspecial] =
    useState<TipoOperacionCarteraEspecialV2>('ESTANDAR');
  const [modoOtroPeruano, setModoOtroPeruano] = useState(false);
  const [busquedaDoc, setBusquedaDoc] = useState('');

  // Documentos seleccionados: documentoId -> string decimal editable
  const [montosPorDoc, setMontosPorDoc] = useState<Record<string, string>>({});

  // Campos peruanos y opciones de tesorería
  const [esAnticipo, setEsAnticipo] = useState(false);
  const [porcentajeRetencion, setPorcentajeRetencion] = useState('3');
  const [montoRetencionInput, setMontoRetencionInput] = useState('0.00');
  const [comisionPosInput, setComisionPosInput] = useState('0.00');
  const [cuentaComisionPosCodigo, setCuentaComisionPosCodigo] = useState('');
  const [generarAsientoComisionPos, setGenerarAsientoComisionPos] = useState(true);
  const [cuentaContrapartidaCodigo, setCuentaContrapartidaCodigo] = useState('');
  const [detraccionId, setDetraccionId] = useState('');
  const [medioPago, setMedioPago] = useState('003');
  const [esCheque, setEsCheque] = useState(false);
  const [esDepositoCheque, setEsDepositoCheque] = useState(false);
  const [numeroCheque, setNumeroCheque] = useState('');
  const [tipoCambio, setTipoCambio] = useState('');
  const [tipoDiferencia, setTipoDiferencia] = useState<'NINGUNA' | 'GANANCIA' | 'PERDIDA'>('NINGUNA');
  const [diferenciaCambio, setDiferenciaCambio] = useState('');
  const [glosa, setGlosa] = useState('');
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  const sugerenciasQuery = useSugerenciasCarteraV2(
    empresaId,
    linea?.id,
    abierto && Boolean(linea)
  );
  const cuentasContablesQuery = useCuentasContablesDisponiblesV2(
    empresaId,
    abierto && (modoOtroPeruano || tipoOperacionEspecial === 'DETRACCION_SPOT')
  );
  const aplicarMutation = useAplicarLineaCarteraV2(empresaId);

  // Inicializar estado al abrir con una línea nueva
  useEffect(() => {
    if (!abierto || !linea) return;

    let opInicial: TipoOperacionCarteraEspecialV2 = 'ESTANDAR';
    if (linea.tipoClasificacion === 'DETRACCION') opInicial = 'DETRACCION_SPOT';
    else if (linea.tipoClasificacion === 'TRIBUTO_SUNAT') opInicial = 'TRIBUTO_SUNAT';
    else if (linea.tipoClasificacion === 'AFP_ONP_ESSALUD') opInicial = 'AFP_ONP_ESSALUD';
    else if (linea.tipoClasificacion === 'PLANILLA') opInicial = 'LOTE_PLANILLA';

    const sinDocs = esOperacionSinDocumentosDefault(opInicial);
    setTipoOperacionEspecial(opInicial);
    setModoOtroPeruano(sinDocs);
    setBusquedaDoc('');
    setMontosPorDoc({});
    setEsAnticipo(false);
    setPorcentajeRetencion('3');
    setMontoRetencionInput('0.00');
    setComisionPosInput('0.00');
    setCuentaComisionPosCodigo('');
    setGenerarAsientoComisionPos(true);
    setCuentaContrapartidaCodigo(CUENTA_DEFAULT_ESPECIAL[opInicial] ?? '');
    setDetraccionId('');
    setMedioPago(linea.tipoClasificacion === 'CHEQUE' ? '007' : '003');
    setEsCheque(linea.tipoClasificacion === 'CHEQUE' && aCentavos(linea.monto) < 0);
    setEsDepositoCheque(linea.tipoClasificacion === 'CHEQUE' && aCentavos(linea.monto) > 0);
    setNumeroCheque('');
    setTipoCambio('');
    setTipoDiferencia('NINGUNA');
    setDiferenciaCambio('');
    setGlosa('');
    setErrorValidacion(null);
  }, [abierto, linea]);

  const handleCambiarTipoOperacion = (nuevaOp: TipoOperacionCarteraEspecialV2) => {
    setTipoOperacionEspecial(nuevaOp);
    const sinDocs = esOperacionSinDocumentosDefault(nuevaOp);
    setModoOtroPeruano(sinDocs);
    if (sinDocs || nuevaOp === 'DETRACCION_SPOT') {
      const def = CUENTA_DEFAULT_ESPECIAL[nuevaOp];
      if (def) setCuentaContrapartidaCodigo(def);
    }
    if (nuevaOp !== 'RETENCION_IGV') {
      setMontoRetencionInput('0.00');
    }
    if (nuevaOp !== 'COMISION_POS') {
      setComisionPosInput('0.00');
    }
    setErrorValidacion(null);
  };

  const sugerencias = sugerenciasQuery.data ?? [];
  const sugerenciasFiltradas = useMemo(() => {
    const q = busquedaDoc.trim().toLowerCase();
    if (!q) return sugerencias;
    return sugerencias.filter((doc) => {
      const comp = `${doc.serie}-${doc.numero}`.toLowerCase();
      return (
        comp.includes(q) ||
        (doc.anexoNombre ?? '').toLowerCase().includes(q) ||
        (doc.anexoRuc ?? '').toLowerCase().includes(q) ||
        doc.tipoComprobante.toLowerCase().includes(q)
      );
    });
  }, [sugerencias, busquedaDoc]);

  const docsSeleccionados = useMemo(
    () => sugerencias.filter((d) => Object.prototype.hasOwnProperty.call(montosPorDoc, d.documentoId)),
    [sugerencias, montosPorDoc]
  );

  // Sumatoria exacta en centavos (cero flotantes)
  const totalAplicadoCentavos = useMemo(() => {
    if (modoOtroPeruano) return 0;
    return docsSeleccionados.reduce((acc, d) => {
      const raw = montosPorDoc[d.documentoId] ?? '0';
      const dec = parsearDecimalNoNegativoTexto(raw);
      return acc + (dec ? aCentavos(dec.toFixed(2)) : 0);
    }, 0);
  }, [modoOtroPeruano, docsSeleccionados, montosPorDoc]);

  const retencionCentavos = useMemo(() => {
    if (tipoOperacionEspecial !== 'RETENCION_IGV') return 0;
    const dec = parsearDecimalNoNegativoTexto(montoRetencionInput);
    return dec ? aCentavos(dec.toFixed(2)) : 0;
  }, [tipoOperacionEspecial, montoRetencionInput]);

  const comisionPosCentavos = useMemo(() => {
    if (tipoOperacionEspecial !== 'COMISION_POS') return 0;
    const dec = parsearDecimalNoNegativoTexto(comisionPosInput);
    return dec ? aCentavos(dec.toFixed(2)) : 0;
  }, [tipoOperacionEspecial, comisionPosInput]);

  const totalOperacionCentavos = useMemo(() => {
    if (tipoOperacionEspecial === 'RETENCION_IGV') {
      return bancoAbsCentavos + retencionCentavos;
    }
    if (tipoOperacionEspecial === 'COMISION_POS' && generarAsientoComisionPos) {
      return bancoAbsCentavos + comisionPosCentavos;
    }
    return bancoAbsCentavos;
  }, [
    tipoOperacionEspecial,
    bancoAbsCentavos,
    retencionCentavos,
    comisionPosCentavos,
    generarAsientoComisionPos,
  ]);

  const saldoSinAplicarCentavos = totalOperacionCentavos - totalAplicadoCentavos;

  const toggleDocumento = (doc: SugerenciaDocumentoCarteraV2) => {
    setMontosPorDoc((prev) => {
      const next = { ...prev };
      if (Object.prototype.hasOwnProperty.call(next, doc.documentoId)) {
        delete next[doc.documentoId];
        return next;
      }
      const saldoDocCentavos = aCentavos(doc.saldoPendiente);
      const restanteCentavos = Math.max(0, totalOperacionCentavos - totalAplicadoCentavos);
      const sugeridoCentavos =
        restanteCentavos > 0 ? Math.min(saldoDocCentavos, restanteCentavos) : saldoDocCentavos;
      next[doc.documentoId] = centavosATextoDecimal(sugeridoCentavos);
      return next;
    });
    setErrorValidacion(null);
  };

  const asignarSaldoCompleto = (doc: SugerenciaDocumentoCarteraV2) => {
    setMontosPorDoc((prev) => ({
      ...prev,
      [doc.documentoId]: new Decimal(doc.saldoPendiente).toFixed(2),
    }));
    setErrorValidacion(null);
  };

  const handleCalcularRetencionAuto = () => {
    const pctNum = Number(porcentajeRetencion.trim() || '3');
    if (!Number.isFinite(pctNum) || pctNum <= 0 || pctNum >= 100) {
      setErrorValidacion('Ingrese un porcentaje de retención válido (ej. 3).');
      return;
    }
    const pctDec = new Decimal(pctNum);
    let retDec: Decimal;
    if (totalAplicadoCentavos > bancoAbsCentavos) {
      retDec = new Decimal(totalAplicadoCentavos)
        .dividedBy(100)
        .times(pctDec)
        .dividedBy(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    } else {
      const bancoDec = new Decimal(bancoAbsCentavos).dividedBy(100);
      const factorNeto = new Decimal(1).minus(pctDec.dividedBy(100));
      const bruto = bancoDec.dividedBy(factorNeto).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      retDec = bruto.minus(bancoDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }
    setMontoRetencionInput(retDec.toFixed(2));
    setErrorValidacion(null);
  };

  const handleCalcularComisionPosDesdeDocs = () => {
    const difCentavos = totalAplicadoCentavos - bancoAbsCentavos;
    if (difCentavos > 0) {
      setComisionPosInput(centavosATextoDecimal(difCentavos));
      setErrorValidacion(null);
    }
  };

  const tipoCarteraEfectivo: AplicarLineaCarteraInput['tipoCartera'] = modoOtroPeruano
    ? 'OTRO_PERUANO'
    : esAbono
    ? 'CXC'
    : 'CXP';

  const handleConfirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linea || !cuenta || !puedeOperar || aplicarMutation.isPending) return;

    const aplicacionesPayload: Array<{ documentoId: string; importeAplicado: string }> = [];
    if (!modoOtroPeruano) {
      for (const doc of docsSeleccionados) {
        const raw = montosPorDoc[doc.documentoId] ?? '';
        const dec = parsearDecimalPositivoTexto(raw);
        if (!dec) {
          setErrorValidacion(
            `El monto aplicado del comprobante ${doc.serie}-${doc.numero} debe ser mayor a 0.00.`
          );
          return;
        }
        const docSaldoCentavos = aCentavos(doc.saldoPendiente);
        const appCentavos = aCentavos(dec.toFixed(2));
        if (appCentavos > docSaldoCentavos) {
          setErrorValidacion(
            `El monto aplicado (${formatearCentavos(appCentavos, doc.moneda)}) excede el saldo pendiente (${formatearMonedaExacta(doc.saldoPendiente, doc.moneda)}) de ${doc.serie}-${doc.numero}.`
          );
          return;
        }
        aplicacionesPayload.push({
          documentoId: doc.documentoId,
          importeAplicado: dec.toFixed(2),
        });
      }

      if (!esAnticipo && aplicacionesPayload.length === 0) {
        setErrorValidacion(
          'Seleccione al menos un documento de cartera o marque "Registrar como Anticipo".'
        );
        return;
      }

      if (saldoSinAplicarCentavos < 0) {
        setErrorValidacion(
          `El total aplicado (${formatearCentavos(totalAplicadoCentavos, moneda)}) supera el importe de la operación (${formatearCentavos(totalOperacionCentavos, moneda)}).`
        );
        return;
      }

      if (totalAplicadoCentavos > 0 && saldoSinAplicarCentavos > 0 && !esAnticipo) {
        setErrorValidacion(
          `Existe un saldo sin aplicar de ${formatearCentavos(saldoSinAplicarCentavos, moneda)}. Marque "Registrar saldo sin aplicar como Anticipo" para continuar.`
        );
        return;
      }
    } else if (!cuentaContrapartidaCodigo.trim() && !CUENTA_DEFAULT_ESPECIAL[tipoOperacionEspecial]) {
      setErrorValidacion('Indique la cuenta contable PCGE de contrapartida para esta operación.');
      return;
    }

    if (detraccionId.trim() && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(detraccionId.trim())) {
      setErrorValidacion('El ID de detracción SPOT debe tener formato UUID válido o quedar vacío.');
      return;
    }

    let tcNumber: number | undefined;
    if (tipoCambio.trim()) {
      const tcParsed = Number(tipoCambio.trim());
      if (!Number.isFinite(tcParsed) || tcParsed <= 0) {
        setErrorValidacion('El tipo de cambio debe ser mayor a cero.');
        return;
      }
      tcNumber = tcParsed;
    }

    let difCambioStr: string | undefined;
    if (tipoDiferencia !== 'NINGUNA' && diferenciaCambio.trim()) {
      const difDec = parsearDecimalNoNegativoTexto(diferenciaCambio);
      if (!difDec) {
        setErrorValidacion('El monto de diferencia de cambio debe ser un decimal válido >= 0.');
        return;
      }
      difCambioStr = difDec.toFixed(2);
    }

    setErrorValidacion(null);

    const payload: AplicarLineaCarteraInput = {
      cuentaFinancieraId: cuenta.id,
      periodo,
      extractoLineaId: linea.id,
      tipoCartera: tipoCarteraEfectivo,
      tipoOperacionEspecial,
      ...(aplicacionesPayload.length > 0 ? { aplicaciones: aplicacionesPayload } : {}),
      medioPago,
      ...(tcNumber !== undefined ? { tipoCambio: tcNumber } : {}),
      ...(cuentaContrapartidaCodigo.trim()
        ? { cuentaContrapartidaCodigo: cuentaContrapartidaCodigo.trim() }
        : {}),
      ...(detraccionId.trim() ? { detraccionId: detraccionId.trim() } : {}),
      esAnticipo,
      ...(tipoOperacionEspecial === 'RETENCION_IGV'
        ? {
            tieneRetencion: true,
            montoRetencion: centavosATextoDecimal(retencionCentavos),
            porcentajeRetencion: Number(porcentajeRetencion) || 3,
          }
        : {}),
      ...(tipoOperacionEspecial === 'COMISION_POS'
        ? {
            comisionPosMonto: centavosATextoDecimal(comisionPosCentavos),
            ...(cuentaComisionPosCodigo.trim()
              ? { cuentaComisionPosCodigo: cuentaComisionPosCodigo.trim() }
              : {}),
            generarAsientoComisionPos,
          }
        : {}),
      ...(esCheque ? { esCheque: true } : {}),
      ...(esDepositoCheque ? { esDepositoCheque: true } : {}),
      ...(numeroCheque.trim() ? { numeroCheque: numeroCheque.trim() } : {}),
      ...(tipoDiferencia !== 'NINGUNA'
        ? {
            tipoDiferencia,
            ...(difCambioStr ? { diferenciaCambio: difCambioStr } : {}),
          }
        : {}),
      ...(glosa.trim() ? { glosa: glosa.trim() } : {}),
    };

    try {
      await aplicarMutation.mutateAsync(payload);
      onCerrar();
    } catch {
      // El toast de error ya es mostrado por useAplicarLineaCarteraV2
    }
  };

  const observacionPrevia = linea?.observacionConciliacion?.trim() || '';

  const puedeConfirmar =
    Boolean(linea && cuenta && puedeOperar) &&
    !aplicarMutation.isPending &&
    saldoSinAplicarCentavos >= 0 &&
    (modoOtroPeruano ||
      esAnticipo ||
      (docsSeleccionados.length > 0 &&
        (saldoSinAplicarCentavos === 0 || esAnticipo)));

  return (
    <VentanaModal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Aplicar Línea Bancaria a Cartera (CxC / CxP)"
      subtitulo={
        linea
          ? `${linea.fecha} · ${esAbono ? 'ABONO (CxC)' : 'CARGO (CxP)'} · ${formatearMonedaExacta(linea.monto, moneda)}`
          : undefined
      }
      ancho="2xl"
      footer={
        <>
          <button
            type="button"
            onClick={onCerrar}
            disabled={aplicarMutation.isPending}
            className="h-7 px-3 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border border-[#D1D5DB] text-[12px] cursor-pointer rounded-none"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="form-aplicar-cartera-v2"
            disabled={!puedeConfirmar}
            className="h-7 px-3 bg-[#1E3A5F] hover:bg-[#162C49] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-[#FFFFFF] border border-[#1E3A5F] disabled:border-[#D1D5DB] text-[12px] font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed rounded-none"
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>
              {aplicarMutation.isPending
                ? 'Aplicando y Conciliando...'
                : 'Confirmar y Conciliar'}
            </span>
          </button>
        </>
      }
    >
      {linea && (
        <form id="form-aplicar-cartera-v2" onSubmit={handleConfirmar} className="space-y-3">
          {/* Resumen de la partida del extracto */}
          <div className="p-2.5 bg-[#F5F7FA] border border-[#D1D5DB] flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-bold border ${
                    esAbono
                      ? 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]'
                      : 'bg-[#FEF2F2] text-[#B91C1C] border-[#B91C1C]'
                  }`}
                >
                  {esAbono ? 'ABONO · COBRANZA CxC' : 'CARGO · PAGO CxP'}
                </span>
                <span className="font-mono text-[11px] text-[#4B5563]">{linea.fecha}</span>
                {linea.referencia && (
                  <span className="font-mono text-[11px] text-[#1E3A5F]">
                    Ref: {linea.referencia}
                  </span>
                )}
                {linea.rucExtraido && (
                  <span className="font-mono text-[11px] text-[#374151]">
                    RUC: {linea.rucExtraido}
                  </span>
                )}
                {linea.docExtraido && (
                  <span className="font-mono text-[11px] text-[#1E3A5F] font-bold">
                    Doc: {linea.docExtraido}
                  </span>
                )}
              </div>
              <div className="mt-1 font-medium text-[#111827]">{linea.descripcion}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-[#4B5563] uppercase">Importe Extracto</div>
              <div
                className={`font-mono font-bold text-[15px] ${
                  esAbono ? 'text-[#1E6F42]' : 'text-[#B91C1C]'
                }`}
              >
                {formatearMonedaExacta(linea.monto, moneda)}
              </div>
            </div>
          </div>

          {observacionPrevia && (
            <div className="p-2.5 bg-[#FEF3C7] border border-[#B45309] text-[#7C2D12] text-[12px] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
              <span>
                Esta partida tiene observación de conciliación previa ({observacionPrevia}).
                Verifique en Libros si ya existe un movimiento o asiento registrado antes de crear
                uno nuevo para evitar duplicados.
              </span>
            </div>
          )}

          {errorValidacion && (
            <div className="p-2 bg-[#FEF2F2] border border-[#B91C1C] text-[#991B1B] text-[12px] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorValidacion}</span>
            </div>
          )}

          {/* Selector de Caso Peruano */}
          <div className="p-2.5 bg-[#FFFFFF] border border-[#D1D5DB] space-y-2.5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 items-end">
              <div>
                <label className="block text-[11px] font-bold text-[#1E3A5F] mb-1">
                  Tipo de Operación / Caso Peruano
                </label>
                <select
                  value={tipoOperacionEspecial}
                  onChange={(e) =>
                    handleCambiarTipoOperacion(e.target.value as TipoOperacionCarteraEspecialV2)
                  }
                  className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] focus:outline-none focus:border-[#1E3A5F] rounded-none"
                >
                  {TIPOS_OPERACION_CARTERA_ESPECIAL_V2.map((op) => {
                    const disabled = op === 'COMISION_POS' && !esAbono;
                    return (
                      <option key={op} value={op} disabled={disabled}>
                        {ETIQUETAS_OPERACION_ESPECIAL[op]}
                        {disabled ? ' (Solo abonos)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#374151] mb-1">
                  Medio de Pago SUNAT
                </label>
                <select
                  value={medioPago}
                  onChange={(e) => {
                    setMedioPago(e.target.value);
                    if (e.target.value === '007') {
                      setEsCheque(!esAbono);
                      setEsDepositoCheque(esAbono);
                    }
                  }}
                  className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] focus:outline-none focus:border-[#1E3A5F] rounded-none"
                >
                  <option value="003">003 - Transferencia de fondos</option>
                  <option value="001">001 - Depósito en cuenta</option>
                  <option value="005">005 - Tarjeta de débito</option>
                  <option value="006">006 - Tarjeta de crédito</option>
                  <option value="007">007 - Cheque</option>
                  <option value="002">002 - Giro</option>
                  <option value="009">009 - Efectivo</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-3 pb-1">
                {tipoOperacionEspecial === 'DETRACCION_SPOT' && (
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-[#111827] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modoOtroPeruano}
                      onChange={(e) => setModoOtroPeruano(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#1E3A5F]"
                    />
                    <span>Operación SPOT sin documento</span>
                  </label>
                )}

                {!modoOtroPeruano && (
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-[#111827] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={esAnticipo}
                      onChange={(e) => setEsAnticipo(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#1E3A5F]"
                    />
                    <span>Registrar saldo sin aplicar como Anticipo</span>
                  </label>
                )}
              </div>
            </div>

            {/* Campos condicionales: RETENCION_IGV */}
            {tipoOperacionEspecial === 'RETENCION_IGV' && (
              <div className="p-2 bg-[#EFF6FF] border border-[#1E3A5F] grid grid-cols-1 sm:grid-cols-4 gap-2 items-end text-[11px]">
                <div>
                  <label className="block font-bold text-[#1E3A5F] mb-1">% Retención IGV</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={porcentajeRetencion}
                    onChange={(e) => setPorcentajeRetencion(e.target.value)}
                    className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-right rounded-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#1E3A5F] mb-1">
                    Monto Retención ({moneda})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={montoRetencionInput}
                    onChange={(e) => setMontoRetencionInput(e.target.value)}
                    className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-right rounded-none"
                  />
                </div>
                <div>
                  <button
                    type="button"
                    onClick={handleCalcularRetencionAuto}
                    className="h-7 px-2.5 bg-[#FFFFFF] hover:bg-[#DBEAFE] text-[#1E3A5F] border border-[#1E3A5F] font-bold inline-flex items-center gap-1 cursor-pointer rounded-none"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    <span>Calcular {porcentajeRetencion || 3}%</span>
                  </button>
                </div>
                <div className="text-[11px] text-[#1E3A5F]">
                  Total operación (Banco + Ret.):{' '}
                  <strong className="font-mono">
                    {formatearCentavos(totalOperacionCentavos, moneda)}
                  </strong>
                </div>
              </div>
            )}

            {/* Campos condicionales: COMISION_POS */}
            {tipoOperacionEspecial === 'COMISION_POS' && (
              <div className="p-2 bg-[#EFF6FF] border border-[#1E3A5F] grid grid-cols-1 sm:grid-cols-4 gap-2 items-end text-[11px]">
                <div>
                  <label className="block font-bold text-[#1E3A5F] mb-1">
                    Comisión POS ({moneda})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={comisionPosInput}
                    onChange={(e) => setComisionPosInput(e.target.value)}
                    className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-right rounded-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#374151] mb-1">
                    Cuenta Comisión POS (Opcional)
                  </label>
                  <input
                    type="text"
                    maxLength={20}
                    value={cuentaComisionPosCodigo}
                    onChange={(e) => setCuentaComisionPosCodigo(e.target.value)}
                    placeholder="Default Config (6391)"
                    className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] font-mono rounded-none"
                  />
                </div>
                <div className="flex items-center gap-2 pb-1">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={generarAsientoComisionPos}
                      onChange={(e) => setGenerarAsientoComisionPos(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#1E3A5F]"
                    />
                    <span>Generar asiento comisión</span>
                  </label>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={handleCalcularComisionPosDesdeDocs}
                    disabled={totalAplicadoCentavos <= bancoAbsCentavos}
                    className="h-7 px-2.5 bg-[#FFFFFF] hover:bg-[#DBEAFE] disabled:opacity-50 text-[#1E3A5F] border border-[#1E3A5F] font-bold inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed rounded-none"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    <span>Calcular dif. Docs</span>
                  </button>
                </div>
              </div>
            )}

            {/* Campos condicionales: DETRACCION_SPOT o OTRO_PERUANO */}
            {(tipoOperacionEspecial === 'DETRACCION_SPOT' || modoOtroPeruano) && (
              <div className="p-2 bg-[#F5F7FA] border border-[#D1D5DB] grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                <div>
                  <label className="block font-bold text-[#1E3A5F] mb-1">
                    Cuenta Contrapartida PCGE {modoOtroPeruano ? '*' : '(Opcional)'}
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      maxLength={20}
                      value={cuentaContrapartidaCodigo}
                      onChange={(e) => setCuentaContrapartidaCodigo(e.target.value)}
                      placeholder={
                        CUENTA_DEFAULT_ESPECIAL[tipoOperacionEspecial]
                          ? `Ej. ${CUENTA_DEFAULT_ESPECIAL[tipoOperacionEspecial]}`
                          : 'Ej. 40111 / 4031 / 4111'
                      }
                      className="w-36 h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] font-mono rounded-none"
                    />
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setCuentaContrapartidaCodigo(e.target.value);
                      }}
                      className="flex-1 h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] rounded-none"
                    >
                      <option value="">
                        {cuentasContablesQuery.isLoading
                          ? 'Cargando cuentas PCGE...'
                          : '-- Elegir del Plan de Cuentas --'}
                      </option>
                      {(cuentasContablesQuery.data ?? []).map((pc) => (
                        <option key={pc.id} value={pc.codigo}>
                          {pc.codigo} - {pc.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {tipoOperacionEspecial === 'DETRACCION_SPOT' && (
                  <div>
                    <label className="block font-bold text-[#374151] mb-1">
                      ID Detracción SPOT (UUID opcional)
                    </label>
                    <input
                      type="text"
                      value={detraccionId}
                      onChange={(e) => setDetraccionId(e.target.value)}
                      placeholder="UUID de registro SPOT (opcional)"
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] font-mono rounded-none"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Lista de Sugerencias CxC/CxP */}
          {!modoOtroPeruano && (
            <div className="border border-[#D1D5DB] bg-[#FFFFFF]">
              <div className="px-2.5 py-1.5 bg-[#1E3A5F] text-[#FFFFFF] flex flex-wrap items-center justify-between gap-2 text-[12px]">
                <div className="flex items-center gap-1.5 font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    Documentos Pendientes Sugeridos ({esAbono ? 'CxC' : 'CxP'}) —{' '}
                    {sugerenciasFiltradas.length}
                  </span>
                </div>
                <div className="relative flex items-center">
                  <Search className="w-3 h-3 text-[#6B7280] absolute left-2 pointer-events-none" />
                  <input
                    type="text"
                    value={busquedaDoc}
                    onChange={(e) => setBusquedaDoc(e.target.value)}
                    placeholder="Filtrar RUC, razón social o serie-N°..."
                    className="h-6 pl-6 pr-2 w-60 bg-[#FFFFFF] text-[#111827] border border-[#D1D5DB] text-[11px] focus:outline-none rounded-none"
                  />
                </div>
              </div>

              <div className="max-h-60 overflow-auto">
                <table className="tabla-densa">
                  <thead>
                    <tr>
                      <th className="w-8 text-center">Sel</th>
                      <th className="w-28 text-left">Comprobante</th>
                      <th className="text-left">Anexo / RUC / Motivos</th>
                      <th className="w-20 text-left">Vencim.</th>
                      <th className="w-16 text-center">Score</th>
                      <th className="w-28 text-right tabular-nums">Saldo Pend.</th>
                      <th className="w-36 text-right">Monto a Aplicar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sugerenciasQuery.isLoading ? (
                      <tr>
                        <td colSpan={7} className="text-center py-4 text-[#4B5563]">
                          Buscando comprobantes pendientes en cartera...
                        </td>
                      </tr>
                    ) : sugerenciasQuery.error ? (
                      <tr>
                        <td colSpan={7} className="text-center py-4 text-[#B91C1C] font-bold">
                          {extraerMensajeErrorConciliacion(
                            sugerenciasQuery.error,
                            'No se pudieron cargar las sugerencias de cartera.'
                          )}
                        </td>
                      </tr>
                    ) : sugerenciasFiltradas.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-4 text-[#4B5563]">
                          No hay documentos pendientes compatibles. Puede marcar "Registrar como
                          Anticipo" o usar un caso especial.
                        </td>
                      </tr>
                    ) : (
                      sugerenciasFiltradas.map((doc, idx) => {
                        const seleccionado = Object.prototype.hasOwnProperty.call(
                          montosPorDoc,
                          doc.documentoId
                        );
                        const montoInput = montosPorDoc[doc.documentoId] ?? '';
                        const pctScore = Math.round(doc.score * 100);

                        return (
                          <tr
                            key={doc.documentoId}
                            className={
                              seleccionado
                                ? 'bg-[#DBEAFE]'
                                : idx % 2 === 0
                                ? 'bg-[#FFFFFF] hover:bg-[#E8ECF1]'
                                : 'bg-[#F5F7FA] hover:bg-[#E8ECF1]'
                            }
                          >
                            <td className="text-center">
                              <input
                                type="checkbox"
                                checked={seleccionado}
                                onChange={() => toggleDocumento(doc)}
                                aria-label={`Seleccionar ${doc.serie}-${doc.numero}`}
                                className="w-3.5 h-3.5 accent-[#1E3A5F] cursor-pointer"
                              />
                            </td>
                            <td className="font-mono text-[11px] font-bold text-[#1E3A5F] whitespace-nowrap">
                              {doc.tipoComprobante} {doc.serie}-{doc.numero}
                            </td>
                            <td>
                              <div className="text-[11px] font-medium text-[#111827] leading-tight">
                                {doc.anexoNombre || 'Sin nombre'}
                                {doc.anexoRuc ? (
                                  <span className="ml-1.5 font-mono text-[#4B5563]">
                                    ({doc.anexoRuc})
                                  </span>
                                ) : null}
                              </div>
                              {doc.motivos.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {doc.motivos.map((mot, i) => (
                                    <span
                                      key={i}
                                      className="px-1 py-0 text-[9px] bg-[#F3F4F6] text-[#374151] border border-[#D1D5DB]"
                                    >
                                      {mot}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="font-mono text-[11px] whitespace-nowrap">
                              {doc.fechaVencimiento}
                            </td>
                            <td className="text-center">
                              <span
                                className={`inline-block px-1.5 py-0.5 text-[10px] font-mono font-bold border ${badgeScoreClase(
                                  doc.score
                                )}`}
                              >
                                {pctScore}%
                              </span>
                            </td>
                            <td className="text-right font-mono font-bold text-[11px] tabular-nums whitespace-nowrap">
                              {formatearMonedaExacta(doc.saldoPendiente, doc.moneda)}
                            </td>
                            <td className="text-right">
                              {seleccionado ? (
                                <div className="inline-flex items-center gap-1">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={montoInput}
                                    onChange={(e) =>
                                      setMontosPorDoc((prev) => ({
                                        ...prev,
                                        [doc.documentoId]: e.target.value,
                                      }))
                                    }
                                    className="w-24 h-6 px-1.5 bg-[#FFFFFF] border border-[#1E3A5F] font-mono text-[11px] text-right focus:outline-none rounded-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => asignarSaldoCompleto(doc)}
                                    title="Aplicar saldo completo"
                                    className="h-6 px-1.5 bg-[#F5F7FA] hover:bg-[#E8ECF1] border border-[#D1D5DB] text-[10px] text-[#1E3A5F] cursor-pointer rounded-none"
                                  >
                                    Total
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] text-[#9CA3AF]">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Opciones adicionales: Cheque, TC / Dif Cambio, Glosa */}
          <div className="p-2.5 bg-[#F5F7FA] border border-[#D1D5DB] grid grid-cols-1 md:grid-cols-4 gap-2 text-[11px]">
            <div className="flex flex-col justify-end gap-1">
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={esCheque}
                    disabled={esAbono}
                    onChange={(e) => setEsCheque(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#1E3A5F]"
                  />
                  <span>Cheque girado</span>
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={esDepositoCheque}
                    disabled={!esAbono}
                    onChange={(e) => setEsDepositoCheque(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#1E3A5F]"
                  />
                  <span>Depósito cheque</span>
                </label>
              </div>
              <input
                type="text"
                maxLength={40}
                value={numeroCheque}
                onChange={(e) => setNumeroCheque(e.target.value)}
                placeholder="N° Cheque / Operación (opc.)"
                className="h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] font-mono rounded-none"
              />
            </div>

            <div>
              <label className="block font-bold text-[#374151] mb-1">
                Tipo de Cambio (Opcional)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={tipoCambio}
                onChange={(e) => setTipoCambio(e.target.value)}
                placeholder={moneda === 'USD' ? 'TC SUNAT automático' : '1.000'}
                className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-right rounded-none"
              />
            </div>

            <div>
              <label className="block font-bold text-[#374151] mb-1">
                Diferencia de Cambio (Opcional)
              </label>
              <div className="flex gap-1">
                <select
                  value={tipoDiferencia}
                  onChange={(e) =>
                    setTipoDiferencia(e.target.value as 'NINGUNA' | 'GANANCIA' | 'PERDIDA')
                  }
                  className="h-7 px-1.5 bg-[#FFFFFF] border border-[#D1D5DB] rounded-none"
                >
                  <option value="NINGUNA">Ninguna</option>
                  <option value="GANANCIA">Ganancia</option>
                  <option value="PERDIDA">Pérdida</option>
                </select>
                <input
                  type="text"
                  inputMode="decimal"
                  disabled={tipoDiferencia === 'NINGUNA'}
                  value={diferenciaCambio}
                  onChange={(e) => setDiferenciaCambio(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 min-w-0 h-7 px-2 bg-[#FFFFFF] disabled:bg-[#F3F4F6] border border-[#D1D5DB] font-mono text-right rounded-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-[#374151] mb-1">Glosa (Opcional)</label>
              <input
                type="text"
                maxLength={250}
                value={glosa}
                onChange={(e) => setGlosa(e.target.value)}
                placeholder="Glosa automática si queda vacía"
                className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] rounded-none"
              />
            </div>
          </div>

          {/* Resumen exacto en centavos / Decimal */}
          <div
            className={`p-2.5 border flex flex-wrap items-center justify-between gap-2 text-[12px] ${
              saldoSinAplicarCentavos < 0
                ? 'bg-[#FEF2F2] border-[#B91C1C]'
                : saldoSinAplicarCentavos === 0 && totalAplicadoCentavos > 0
                ? 'bg-[#ECFDF5] border-[#1E6F42]'
                : 'bg-[#FFFFFF] border-[#D1D5DB]'
            }`}
          >
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <span className="text-[11px] text-[#4B5563]">Total Operación: </span>
                <strong className="font-mono text-[#111827]">
                  {formatearCentavos(totalOperacionCentavos, moneda)}
                </strong>
              </div>
              <div>
                <span className="text-[11px] text-[#4B5563]">Total Aplicado: </span>
                <strong className="font-mono text-[#1E3A5F]">
                  {formatearCentavos(totalAplicadoCentavos, moneda)}
                </strong>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-[#4B5563]">Anticipo / Saldo sin aplicar: </span>
                <strong
                  className={`font-mono ${
                    saldoSinAplicarCentavos < 0
                      ? 'text-[#B91C1C]'
                      : saldoSinAplicarCentavos === 0
                      ? 'text-[#1E6F42]'
                      : 'text-[#B45309]'
                  }`}
                >
                  {formatearCentavos(saldoSinAplicarCentavos, moneda)}
                </strong>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              {saldoSinAplicarCentavos === 0 && totalAplicadoCentavos > 0 && (
                <span className="inline-flex items-center gap-1 font-bold text-[#1E6F42]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Aplicación cuadrada</span>
                </span>
              )}
              {totalAplicadoCentavos > 0 && saldoSinAplicarCentavos > 0 && !esAnticipo && (
                <button
                  type="button"
                  onClick={() => setEsAnticipo(true)}
                  className="h-6 px-2 bg-[#FEF3C7] hover:bg-[#FDE68A] text-[#B45309] border border-[#B45309] font-bold cursor-pointer rounded-none"
                >
                  Marcar saldo como Anticipo
                </button>
              )}
            </div>
          </div>
        </form>
      )}
    </VentanaModal>
  );
};
