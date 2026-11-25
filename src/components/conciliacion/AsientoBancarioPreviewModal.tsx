import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  Settings,
  ShieldAlert,
} from 'lucide-react';
import {
  TIPOS_OPERACION_PLANTILLA_V2,
  type ConfigConciliacionV2,
  type CuentaBancariaV2,
  type PartidaExtractoV2,
  type PlantillaAsientoV2,
  type PreviewAsientoConciliacionV2,
  type PrevisualizarAsientoLineaInput,
  type TipoOperacionPlantillaV2,
} from '../../api/conciliacionV2Api';
import {
  extraerMensajeErrorConciliacion,
  useCuentasContablesDisponiblesV2,
  useGenerarAsientoLineaV2,
  usePlantillasAsientoV2,
  usePrevisualizarAsientoLineaV2,
} from '../../hooks/useConciliacionV2';
import { VentanaModal } from '../ui/VentanaModal';
import { aCentavos, formatearMonedaExacta } from './conciliacionUtils';

export interface AsientoBancarioPreviewModalProps {
  abierto: boolean;
  onCerrar: () => void;
  empresaId: string;
  cuenta: CuentaBancariaV2 | null;
  periodo: string;
  linea: PartidaExtractoV2 | null;
  config?: ConfigConciliacionV2;
  puedeOperar: boolean;
  esAdministrador: boolean;
  onAbrirConfiguracion: () => void;
}

const ETIQUETAS_TIPO_OPERACION: Record<TipoOperacionPlantillaV2, string> = {
  ITF: 'ITF (Imp. Transacciones Financieras)',
  COMISION: 'Comisión / Portes Bancarios',
  MANTENIMIENTO: 'Mantenimiento de Cuenta',
  INTERES_GASTO: 'Intereses Financieros (Gasto)',
  INTERES_INGRESO: 'Intereses Ganados (Ingreso)',
  DIFERENCIA_CAMBIO_GANANCIA: 'Diferencia de Cambio (Ganancia)',
  DIFERENCIA_CAMBIO_PERDIDA: 'Diferencia de Cambio (Pérdida)',
  OTRO: 'Otro Ajuste / Gasto / Ingreso',
};

function tipoOperacionInicialDesdeLinea(linea: PartidaExtractoV2): TipoOperacionPlantillaV2 {
  const esAbono = aCentavos(linea.monto) > 0;
  switch (linea.tipoClasificacion) {
    case 'ITF':
      return 'ITF';
    case 'COMISION_BANCARIA':
      return 'COMISION';
    case 'MANTENIMIENTO':
      return 'MANTENIMIENTO';
    case 'INTERES_GASTO':
      return 'INTERES_GASTO';
    case 'INTERES_INGRESO':
      return 'INTERES_INGRESO';
    default:
      return esAbono ? 'INTERES_INGRESO' : 'COMISION';
  }
}

function esTipoCompatibleConSentido(
  tipo: TipoOperacionPlantillaV2,
  esAbono: boolean
): boolean {
  if (tipo === 'INTERES_INGRESO' || tipo === 'DIFERENCIA_CAMBIO_GANANCIA') {
    return esAbono;
  }
  if (
    tipo === 'ITF' ||
    tipo === 'COMISION' ||
    tipo === 'MANTENIMIENTO' ||
    tipo === 'INTERES_GASTO' ||
    tipo === 'DIFERENCIA_CAMBIO_PERDIDA'
  ) {
    return !esAbono;
  }
  return true;
}

function esErrorFaltaCuentaInteresIngreso(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as {
    message?: string;
    response?: { data?: { code?: string; error?: string; details?: { code?: string } } };
  };
  const code = anyErr.response?.data?.code ?? anyErr.response?.data?.details?.code;
  if (code === 'CUENTA_INTERES_INGRESO_NO_CONFIGURADA') return true;
  const msg = `${anyErr.message ?? ''} ${anyErr.response?.data?.error ?? ''}`;
  return /cuentaInteresIngresoCodigo|CUENTA_INTERES_INGRESO_NO_CONFIGURADA/i.test(msg);
}

export const AsientoBancarioPreviewModal: React.FC<AsientoBancarioPreviewModalProps> = ({
  abierto,
  onCerrar,
  empresaId,
  cuenta,
  periodo,
  linea,
  config,
  puedeOperar,
  esAdministrador,
  onAbrirConfiguracion,
}) => {
  const moneda = cuenta?.moneda === 'USD' ? 'USD' : 'PEN';
  const montoCentavos = linea ? aCentavos(linea.monto) : 0;
  const esAbono = montoCentavos > 0;

  const [plantillaId, setPlantillaId] = useState<string>('');
  const [tipoOperacion, setTipoOperacion] = useState<TipoOperacionPlantillaV2>('COMISION');
  const [cuentaContrapartidaCodigo, setCuentaContrapartidaCodigo] = useState<string>('');
  const [subdiarioCodigo, setSubdiarioCodigo] = useState<string>('05');
  const [glosa, setGlosa] = useState<string>('');
  const [tipoCambio, setTipoCambio] = useState<string>('');
  const [preview, setPreview] = useState<PreviewAsientoConciliacionV2 | null>(null);
  const [errorPreview, setErrorPreview] = useState<string | null>(null);
  const [faltaCuentaInteresIngreso, setFaltaCuentaInteresIngreso] = useState(false);

  const plantillasQuery = usePlantillasAsientoV2(empresaId, abierto);
  const cuentasContablesQuery = useCuentasContablesDisponiblesV2(empresaId, abierto);
  const previewMutation = usePrevisualizarAsientoLineaV2(empresaId);
  const generarMutation = useGenerarAsientoLineaV2(empresaId);

  const plantillasActivas = useMemo(
    () =>
      (plantillasQuery.data ?? []).filter(
        (p) => p.activo && esTipoCompatibleConSentido(p.tipoOperacion, esAbono)
      ),
    [plantillasQuery.data, esAbono]
  );

  // Reinicializar al abrir para una línea
  useEffect(() => {
    if (!abierto || !linea) return;
    const tipoInicial = tipoOperacionInicialDesdeLinea(linea);
    setPlantillaId('');
    setTipoOperacion(tipoInicial);
    setCuentaContrapartidaCodigo('');
    setSubdiarioCodigo('05');
    setGlosa('');
    setTipoCambio('');
    setPreview(null);
    setErrorPreview(null);
    setFaltaCuentaInteresIngreso(false);
    previewMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, linea]);

  // Seleccionar automáticamente plantilla del sistema acorde cuando cargan plantillas
  useEffect(() => {
    if (!abierto || !linea || plantillaId || plantillasActivas.length === 0) return;
    const match = plantillasActivas.find((p) => p.tipoOperacion === tipoOperacion);
    if (match) {
      setPlantillaId(match.id);
      setSubdiarioCodigo(match.subdiarioCodigo || '05');
    }
  }, [abierto, linea, plantillaId, plantillasActivas, tipoOperacion]);

  const plantillaSeleccionada: PlantillaAsientoV2 | null = useMemo(
    () => plantillasActivas.find((p) => p.id === plantillaId) ?? null,
    [plantillasActivas, plantillaId]
  );

  const cuentaConfigSugerida = useMemo(() => {
    switch (tipoOperacion) {
      case 'ITF':
        return config?.cuentaItfCodigo ?? '6412';
      case 'COMISION':
      case 'MANTENIMIENTO':
        return config?.cuentaComisionCodigo ?? '6391';
      case 'INTERES_GASTO':
        return config?.cuentaInteresGastoCodigo ?? '67311';
      case 'INTERES_INGRESO':
        return config?.cuentaInteresIngresoCodigo ?? null;
      case 'DIFERENCIA_CAMBIO_GANANCIA':
        return '776';
      case 'DIFERENCIA_CAMBIO_PERDIDA':
        return '676';
      default:
        return null;
    }
  }, [tipoOperacion, config]);

  const alertaFaltaInteresProactiva =
    tipoOperacion === 'INTERES_INGRESO' &&
    !config?.cuentaInteresIngresoCodigo &&
    !plantillaSeleccionada?.cuentaContrapartidaCodigo &&
    !cuentaContrapartidaCodigo.trim();

  const invalidarPreview = () => {
    setPreview(null);
    setErrorPreview(null);
    setFaltaCuentaInteresIngreso(false);
  };

  const handleSeleccionarPlantilla = (id: string) => {
    setPlantillaId(id);
    const pl = plantillasActivas.find((p) => p.id === id);
    if (pl) {
      setTipoOperacion(pl.tipoOperacion);
      setSubdiarioCodigo(pl.subdiarioCodigo || '05');
      setCuentaContrapartidaCodigo(pl.cuentaContrapartidaCodigo ?? '');
    }
    invalidarPreview();
  };

  const construirPayloadPreview = (): PrevisualizarAsientoLineaInput | null => {
    if (!linea || !cuenta) return null;
    let tcNum: number | undefined;
    if (tipoCambio.trim()) {
      const parsed = Number(tipoCambio.trim());
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setErrorPreview('El tipo de cambio debe ser mayor a cero.');
        return null;
      }
      tcNum = parsed;
    }
    return {
      cuentaFinancieraId: cuenta.id,
      periodo,
      extractoLineaId: linea.id,
      ...(plantillaId ? { plantillaId } : {}),
      tipoOperacion,
      ...(cuentaContrapartidaCodigo.trim()
        ? { cuentaContrapartidaCodigo: cuentaContrapartidaCodigo.trim() }
        : {}),
      ...(subdiarioCodigo.trim() ? { subdiarioCodigo: subdiarioCodigo.trim() } : {}),
      ...(glosa.trim() ? { glosa: glosa.trim() } : {}),
      ...(tcNum !== undefined ? { tipoCambio: tcNum } : {}),
    };
  };

  const handlePrevisualizar = async () => {
    const payload = construirPayloadPreview();
    if (!payload || previewMutation.isPending) return;
    setErrorPreview(null);
    setFaltaCuentaInteresIngreso(false);

    try {
      const res = await previewMutation.mutateAsync(payload);
      setPreview(res);
    } catch (err) {
      setPreview(null);
      setFaltaCuentaInteresIngreso(esErrorFaltaCuentaInteresIngreso(err));
      setErrorPreview(
        extraerMensajeErrorConciliacion(
          err,
          'No se pudo generar la vista previa del asiento contable.'
        )
      );
    }
  };

  const handleContabilizarYConciliar = async () => {
    if (!preview || !preview.cuadrado || !puedeOperar || generarMutation.isPending) return;
    const basePayload = construirPayloadPreview();
    if (!basePayload) return;

    try {
      await generarMutation.mutateAsync({
        ...basePayload,
        confirmadoVistaPrevia: true,
        hashVistaPrevia: preview.hashVistaPrevia,
      });
      onCerrar();
    } catch {
      // Notificado por toast en useGenerarAsientoLineaV2
    }
  };

  const mostrarBannerInteresIngreso =
    alertaFaltaInteresProactiva || faltaCuentaInteresIngreso;

  const puedeGenerar = Boolean(
    puedeOperar &&
      preview &&
      preview.cuadrado &&
      !previewMutation.isPending &&
      !generarMutation.isPending
  );

  return (
    <VentanaModal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Vista Previa y Generación de Asiento Bancario"
      subtitulo={
        linea
          ? `${linea.fecha} · ${formatearMonedaExacta(linea.monto, moneda)}`
          : undefined
      }
      ancho="xl"
      footer={
        <>
          <button
            type="button"
            onClick={onCerrar}
            disabled={generarMutation.isPending}
            className="h-7 px-3 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border border-[#D1D5DB] text-[12px] cursor-pointer rounded-none"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handlePrevisualizar()}
            disabled={!linea || !cuenta || previewMutation.isPending || generarMutation.isPending}
            className="h-7 px-3 bg-[#FFFFFF] hover:bg-[#EFF6FF] text-[#1E3A5F] border border-[#1E3A5F] text-[12px] font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 rounded-none"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>
              {previewMutation.isPending ? 'Generando Vista Previa...' : 'Previsualizar Asiento'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => void handleContabilizarYConciliar()}
            disabled={!puedeGenerar}
            title={
              !preview
                ? 'Debe ejecutar Vista Previa obligatoria antes de contabilizar'
                : !preview.cuadrado
                ? 'El asiento previsualizado no está cuadrado'
                : 'Contabilizar asiento y conciliar partida'
            }
            className="h-7 px-3 bg-[#1E3A5F] hover:bg-[#162C49] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-[#FFFFFF] border border-[#1E3A5F] disabled:border-[#D1D5DB] text-[12px] font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed rounded-none"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>
              {generarMutation.isPending ? 'Contabilizando...' : 'Contabilizar y Conciliar'}
            </span>
          </button>
        </>
      }
    >
      {linea && (
        <div className="space-y-3">
          {/* Resumen de línea bancaria */}
          <div className="p-2.5 bg-[#F5F7FA] border border-[#D1D5DB] flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-bold border ${
                    esAbono
                      ? 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]'
                      : 'bg-[#FEF2F2] text-[#B91C1C] border-[#B91C1C]'
                  }`}
                >
                  {esAbono ? 'ABONO BANCARIO' : 'CARGO BANCARIO'}
                </span>
                <span className="font-mono text-[#4B5563]">{linea.fecha}</span>
                {linea.tipoClasificacion && (
                  <span className="px-1.5 py-0 bg-[#FFFFFF] border border-[#D1D5DB] font-bold text-[#1E3A5F]">
                    {linea.tipoClasificacion}
                  </span>
                )}
                {linea.referencia && (
                  <span className="font-mono text-[#1E3A5F]">Ref: {linea.referencia}</span>
                )}
              </div>
              <div className="mt-1 font-medium text-[#111827]">{linea.descripcion}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-[#4B5563] uppercase">Monto Extracto</div>
              <div
                className={`font-mono font-bold text-[15px] ${
                  esAbono ? 'text-[#1E6F42]' : 'text-[#B91C1C]'
                }`}
              >
                {formatearMonedaExacta(linea.monto, moneda)}
              </div>
            </div>
          </div>

          {/* Alerta obligatoria si falta cuentaInteresIngresoCodigo */}
          {mostrarBannerInteresIngreso && (
            <div className="p-2.5 bg-[#FEF3C7] border-2 border-[#B45309] text-[#7C2D12] text-[12px] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-start gap-2 flex-1 min-w-[260px]">
                <ShieldAlert className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-[#92400E]">
                    Falta configurar la Cuenta de Interés Ganado (cuentaInteresIngresoCodigo)
                  </div>
                  <div className="text-[11px]">
                    La empresa aún no tiene configurada la cuenta contable para intereses
                    bancarios ganados (sugerencia PCGE:{' '}
                    <code className="font-mono font-bold">
                      {config?.sugerenciaCuentaInteresIngreso || '7793'}
                    </code>
                    ). Configure la cuenta en Configuración V2 o ingrese una cuenta contrapartida
                    explícita abajo.
                  </div>
                </div>
              </div>
              {esAdministrador && (
                <button
                  type="button"
                  onClick={() => {
                    onCerrar();
                    onAbrirConfiguracion();
                  }}
                  className="h-7 px-2.5 bg-[#FFFFFF] hover:bg-[#FEF2F2] text-[#1E3A5F] border border-[#1E3A5F] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer shrink-0 rounded-none"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Abrir Configuración V2</span>
                </button>
              )}
            </div>
          )}

          {/* Parámetros de asiento */}
          <div className="p-2.5 bg-[#FFFFFF] border border-[#D1D5DB] space-y-2.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-[#1E3A5F] mb-1">
                  Plantilla de Asiento (Opcional)
                </label>
                <select
                  value={plantillaId}
                  onChange={(e) => handleSeleccionarPlantilla(e.target.value)}
                  className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] focus:outline-none focus:border-[#1E3A5F] rounded-none"
                >
                  <option value="">-- Configuración manual / Por tipo operación --</option>
                  {plantillasActivas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.tipoOperacion}
                      {p.cuentaContrapartidaCodigo ? ` · PCGE ${p.cuentaContrapartidaCodigo}` : ''})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#1E3A5F] mb-1">
                  Tipo de Operación Contable *
                </label>
                <select
                  value={tipoOperacion}
                  onChange={(e) => {
                    setTipoOperacion(e.target.value as TipoOperacionPlantillaV2);
                    setPlantillaId('');
                    invalidarPreview();
                  }}
                  className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] focus:outline-none focus:border-[#1E3A5F] rounded-none"
                >
                  {TIPOS_OPERACION_PLANTILLA_V2.map((op) => {
                    const compatible = esTipoCompatibleConSentido(op, esAbono);
                    return (
                      <option key={op} value={op} disabled={!compatible}>
                        {ETIQUETAS_TIPO_OPERACION[op]}
                        {!compatible ? (esAbono ? ' (Solo cargos)' : ' (Solo abonos)') : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-[#374151] mb-1">
                  Cuenta Contrapartida PCGE{' '}
                  {cuentaConfigSugerida ? (
                    <span className="font-normal text-[#4B5563]">
                      (Default: <code className="font-mono">{cuentaConfigSugerida}</code>)
                    </span>
                  ) : (
                    <span className="text-[#B91C1C]">*</span>
                  )}
                </label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    maxLength={20}
                    value={cuentaContrapartidaCodigo}
                    onChange={(e) => {
                      setCuentaContrapartidaCodigo(e.target.value);
                      invalidarPreview();
                    }}
                    placeholder={
                      cuentaConfigSugerida
                        ? `Auto: ${cuentaConfigSugerida}`
                        : 'Ingrese código PCGE (ej. 6391)'
                    }
                    className="w-32 h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] font-mono focus:outline-none focus:border-[#1E3A5F] rounded-none"
                  />
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        setCuentaContrapartidaCodigo(e.target.value);
                        invalidarPreview();
                      }
                    }}
                    className="flex-1 h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[11px] focus:outline-none focus:border-[#1E3A5F] rounded-none"
                  >
                    <option value="">
                      {cuentasContablesQuery.isLoading
                        ? 'Cargando Plan de Cuentas...'
                        : '-- Seleccionar del Plan de Cuentas --'}
                    </option>
                    {(cuentasContablesQuery.data ?? []).map((pc) => (
                      <option key={pc.id} value={pc.codigo}>
                        {pc.codigo} - {pc.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#374151] mb-1">
                  Subdiario
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={subdiarioCodigo}
                  onChange={(e) => {
                    setSubdiarioCodigo(e.target.value);
                    invalidarPreview();
                  }}
                  placeholder="05"
                  className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] font-mono focus:outline-none focus:border-[#1E3A5F] rounded-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#374151] mb-1">
                  Tipo de Cambio (Opc.)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={tipoCambio}
                  onChange={(e) => {
                    setTipoCambio(e.target.value);
                    invalidarPreview();
                  }}
                  placeholder={moneda === 'USD' ? 'TC SUNAT auto' : '1.000'}
                  className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] font-mono text-right focus:outline-none focus:border-[#1E3A5F] rounded-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#374151] mb-1">
                Glosa del Asiento (Opcional — si se omite usa la plantilla)
              </label>
              <input
                type="text"
                maxLength={250}
                value={glosa}
                onChange={(e) => {
                  setGlosa(e.target.value);
                  invalidarPreview();
                }}
                placeholder={
                  plantillaSeleccionada?.glosaPlantilla ||
                  'Ej. Comisión / ITF bancario según extracto'
                }
                className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] focus:outline-none focus:border-[#1E3A5F] rounded-none"
              />
            </div>
          </div>

          {errorPreview && (
            <div className="p-2.5 bg-[#FEF2F2] border border-[#B91C1C] text-[#991B1B] text-[12px] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorPreview}</span>
            </div>
          )}

          {/* Vista previa obligatoria del asiento */}
          {!preview ? (
            <div className="p-4 bg-[#F5F7FA] border border-dashed border-[#9CA3AF] text-center text-[12px] text-[#4B5563]">
              Presione <strong>"Previsualizar Asiento"</strong> para validar las cuentas PCGE,
              calcular el Debe / Haber y obtener el hash de verificación antes de contabilizar.
            </div>
          ) : (
            <div className="border border-[#1E3A5F] bg-[#FFFFFF]">
              <div className="px-2.5 py-1.5 bg-[#1E3A5F] text-[#FFFFFF] flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[12px]">Vista Previa del Asiento</span>
                  <span className="font-mono">Fecha: {preview.fecha}</span>
                  <span className="font-mono">Subdiario: {preview.subdiarioCodigo}</span>
                  <span className="font-mono">Moneda: {preview.moneda}</span>
                  <span className="font-mono">TC: {preview.tipoCambio}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-bold border inline-flex items-center gap-1 ${
                      preview.cuadrado
                        ? 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]'
                        : 'bg-[#FEF2F2] text-[#B91C1C] border-[#B91C1C]'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{preview.cuadrado ? 'ASIENTO CUADRADO' : 'DESCUADRADO'}</span>
                  </span>
                  <span
                    title={`Hash verificación: ${preview.hashVistaPrevia}`}
                    className="px-1.5 py-0.5 bg-[#162C49] font-mono text-[10px] text-[#E8ECF1]"
                  >
                    Hash: {preview.hashVistaPrevia.slice(0, 12)}…
                  </span>
                </div>
              </div>

              <div className="px-2.5 py-1.5 bg-[#F5F7FA] border-b border-[#D1D5DB] text-[11px] text-[#111827]">
                <strong>Glosa:</strong> {preview.glosa}
              </div>

              <table className="tabla-densa">
                <thead>
                  <tr>
                    <th className="w-10 text-center">#</th>
                    <th className="w-24 text-left">Cuenta PCGE</th>
                    <th className="text-left">Nombre de Cuenta</th>
                    <th className="text-left">Glosa Línea</th>
                    <th className="w-28 text-right tabular-nums">Debe ({preview.moneda})</th>
                    <th className="w-28 text-right tabular-nums">Haber ({preview.moneda})</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lineas.map((lin, idx) => (
                    <tr
                      key={lin.linea}
                      className={idx % 2 === 0 ? 'bg-[#FFFFFF]' : 'bg-[#F5F7FA]'}
                    >
                      <td className="text-center font-mono text-[11px]">{lin.linea}</td>
                      <td className="font-mono font-bold text-[#1E3A5F] text-[11px]">
                        {lin.cuentaCodigo}
                      </td>
                      <td className="text-[11px] text-[#111827]">{lin.cuentaNombre}</td>
                      <td className="text-[11px] text-[#4B5563]">{lin.glosaLinea}</td>
                      <td className="text-right font-mono font-bold text-[11px] tabular-nums">
                        {aCentavos(lin.debe) > 0
                          ? formatearMonedaExacta(lin.debe, preview.moneda)
                          : '—'}
                      </td>
                      <td className="text-right font-mono font-bold text-[11px] tabular-nums">
                        {aCentavos(lin.haber) > 0
                          ? formatearMonedaExacta(lin.haber, preview.moneda)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#E8ECF1] font-bold border-t border-[#1E3A5F]">
                    <td colSpan={4} className="text-right text-[11px] text-[#1E3A5F] px-2 py-1.5">
                      TOTALES DEL ASIENTO
                    </td>
                    <td className="text-right font-mono text-[12px] text-[#111827] tabular-nums">
                      {formatearMonedaExacta(preview.totalDebe, preview.moneda)}
                    </td>
                    <td className="text-right font-mono text-[12px] text-[#111827] tabular-nums">
                      {formatearMonedaExacta(preview.totalHaber, preview.moneda)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </VentanaModal>
  );
};
