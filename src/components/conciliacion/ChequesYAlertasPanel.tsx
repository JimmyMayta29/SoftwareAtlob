import React, { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  CreditCard,
  Edit3,
  FileSpreadsheet,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import {
  ESTADOS_CHEQUE_BANCARIO_V2,
  TIPOS_OPERACION_PLANTILLA_V2,
  type ChequeBancarioV2,
  type CuentaBancariaV2,
  type EstadoChequeBancarioV2,
  type PartidaExtractoV2,
  type PlantillaAsientoV2,
  type ResumenAlertasControlV2,
  type ResumenConciliacionV2,
  type TipoOperacionPlantillaV2,
} from '../../api/conciliacionV2Api';
import {
  extraerMensajeErrorConciliacion,
  useActualizarEstadoChequeV2,
  useActualizarPlantillaAsientoV2,
  useChequesV2,
  useCrearPlantillaAsientoV2,
  useCuentasContablesDisponiblesV2,
  useEliminarPlantillaAsientoV2,
  usePlantillasAsientoV2,
  useRegistrarChequeV2,
} from '../../hooks/useConciliacionV2';
import { ColumnaTablaDensa, TablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';
import { aCentavos, formatearMonedaExacta } from './conciliacionUtils';

export type TabChequesAlertas = 'ALERTAS' | 'CHEQUES' | 'PLANTILLAS';

export interface ChequesYAlertasPanelProps {
  abierto: boolean;
  onCerrar: () => void;
  empresaId: string;
  cuenta: CuentaBancariaV2 | null;
  periodo: string;
  resumen: ResumenConciliacionV2 | null;
  alertasControl?: ResumenAlertasControlV2;
  cargandoAlertas?: boolean;
  errorAlertas?: unknown;
  puedeOperarCheques: boolean;
  puedeEditarPlantillas: boolean;
  conciliacionCerrada: boolean;
  requiereVinculacion: boolean;
  tabInicial?: TabChequesAlertas;
  onAbrirAsientoLinea?: (linea: PartidaExtractoV2) => void;
}

const TASA_ITF_DEC = new Decimal('0.00005');
const UNIDAD_REDONDEO_ITF_DEC = new Decimal('0.05');

function badgeEstadoChequeClase(estado: EstadoChequeBancarioV2): string {
  switch (estado) {
    case 'COBRADO':
      return 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]';
    case 'ENTREGADO':
      return 'bg-[#EFF6FF] text-[#1E3A5F] border-[#1E3A5F]';
    case 'VENCIDO':
      return 'bg-[#FEF2F2] text-[#B91C1C] border-[#B91C1C]';
    case 'ANULADO':
      return 'bg-[#F3F4F6] text-[#4B5563] border-[#9CA3AF]';
    case 'GIRADO':
    default:
      return 'bg-[#FEF3C7] text-[#B45309] border-[#B45309]';
  }
}

function esLineaItfExtracto(l: PartidaExtractoV2): boolean {
  return (
    l.tipoClasificacion === 'ITF' ||
    l.estadoConciliacion === 'CARGO_BANCARIO_ITF' ||
    /\bITF\b|IMPUESTO\s+TRANSACCIONES\s+FINANCIERAS/i.test(l.descripcion)
  );
}

export const ChequesYAlertasPanel: React.FC<ChequesYAlertasPanelProps> = ({
  abierto,
  onCerrar,
  empresaId,
  cuenta,
  periodo,
  resumen,
  alertasControl,
  cargandoAlertas = false,
  errorAlertas = null,
  puedeOperarCheques,
  puedeEditarPlantillas,
  conciliacionCerrada,
  requiereVinculacion,
  tabInicial = 'ALERTAS',
  onAbrirAsientoLinea,
}) => {
  const moneda = cuenta?.moneda === 'USD' ? 'USD' : 'PEN';
  const escrituraChequesBloqueada =
    !puedeOperarCheques || conciliacionCerrada || requiereVinculacion || !cuenta;

  const [tab, setTab] = useState<TabChequesAlertas>(tabInicial);
  const [filtroEstadoCheque, setFiltroEstadoCheque] = useState<EstadoChequeBancarioV2 | ''>('');

  // Form nuevo cheque
  const [mostrarFormCheque, setMostrarFormCheque] = useState(false);
  const [numeroCheque, setNumeroCheque] = useState('');
  const [beneficiario, setBeneficiario] = useState('');
  const [montoCheque, setMontoCheque] = useState('');
  const [fechaGiro, setFechaGiro] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [esNoNegociable, setEsNoNegociable] = useState(true);
  const [observacionCheque, setObservacionCheque] = useState('');
  const [errorFormCheque, setErrorFormCheque] = useState<string | null>(null);

  // Transición de estado de cheque
  const [transicionObjetivo, setTransicionObjetivo] = useState<{
    cheque: ChequeBancarioV2;
    estadoDestino: EstadoChequeBancarioV2;
  } | null>(null);
  const [fechaTransicion, setFechaTransicion] = useState('');
  const [extractoLineaCobroId, setExtractoLineaCobroId] = useState('');
  const [observacionTransicion, setObservacionTransicion] = useState('');

  // Form plantilla de asiento
  const [mostrarFormPlantilla, setMostrarFormPlantilla] = useState(false);
  const [plantillaEditandoId, setPlantillaEditandoId] = useState<string | null>(null);
  const [codigoPlantilla, setCodigoPlantilla] = useState('');
  const [nombrePlantilla, setNombrePlantilla] = useState('');
  const [tipoOpPlantilla, setTipoOpPlantilla] = useState<TipoOperacionPlantillaV2>('COMISION');
  const [cuentaContraPlantilla, setCuentaContraPlantilla] = useState('');
  const [subdiarioPlantilla, setSubdiarioPlantilla] = useState('05');
  const [glosaPlantilla, setGlosaPlantilla] = useState('');
  const [activoPlantilla, setActivoPlantilla] = useState(true);
  const [errorFormPlantilla, setErrorFormPlantilla] = useState<string | null>(null);
  const [confirmEliminarPlantillaId, setConfirmEliminarPlantillaId] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setTab(tabInicial);
    setMostrarFormCheque(false);
    setTransicionObjetivo(null);
    setMostrarFormPlantilla(false);
    setPlantillaEditandoId(null);
    setErrorFormCheque(null);
    setErrorFormPlantilla(null);
    setConfirmEliminarPlantillaId(null);
  }, [abierto, tabInicial]);

  const chequesQuery = useChequesV2(
    empresaId,
    cuenta?.id ?? null,
    filtroEstadoCheque,
    abierto && Boolean(cuenta)
  );
  const plantillasQuery = usePlantillasAsientoV2(empresaId, abierto && tab === 'PLANTILLAS');
  const cuentasContablesQuery = useCuentasContablesDisponiblesV2(
    empresaId,
    abierto && tab === 'PLANTILLAS' && mostrarFormPlantilla
  );

  const registrarChequeMutation = useRegistrarChequeV2(empresaId);
  const actualizarEstadoChequeMutation = useActualizarEstadoChequeV2(empresaId);
  const crearPlantillaMutation = useCrearPlantillaAsientoV2(empresaId);
  const actualizarPlantillaMutation = useActualizarPlantillaAsientoV2(empresaId);
  const eliminarPlantillaMutation = useEliminarPlantillaAsientoV2(empresaId);

  // Líneas de extracto pendientes para vincular al cobrar un cheque
  const lineasExtractoPendientesCargo = useMemo(
    () =>
      (resumen?.extractoLineas ?? []).filter(
        (l) => !l.conciliada && l.estadoConciliacion !== 'DUPLICADO' && aCentavos(l.monto) < 0
      ),
    [resumen?.extractoLineas]
  );

  const lineaPorId = useMemo(() => {
    const map = new Map<string, PartidaExtractoV2>();
    for (const l of resumen?.extractoLineas ?? []) {
      map.set(l.id, l);
    }
    return map;
  }, [resumen?.extractoLineas]);

  // Resumen ITF esperado (0.005%) vs cobrado en extracto usando Decimal exacto
  const resumenItf = useMemo(() => {
    let esperadoDec = new Decimal(0);
    let cobradoDec = new Decimal(0);

    for (const l of resumen?.extractoLineas ?? []) {
      if (l.estadoConciliacion === 'DUPLICADO') continue;
      const absDec = new Decimal(l.monto).abs().toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      if (esLineaItfExtracto(l)) {
        cobradoDec = cobradoDec.plus(absDec);
      } else if (absDec.gt(0)) {
        const bruto = absDec.times(TASA_ITF_DEC);
        const redondeado = bruto
          .dividedBy(UNIDAD_REDONDEO_ITF_DEC)
          .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
          .times(UNIDAD_REDONDEO_ITF_DEC)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        esperadoDec = esperadoDec.plus(redondeado);
      }
    }

    const diferenciaDec = esperadoDec.minus(cobradoDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return {
      esperado: esperadoDec.toFixed(2),
      cobrado: cobradoDec.toFixed(2),
      diferencia: diferenciaDec.toFixed(2),
      hayDesviacion: esperadoDec.gte('0.05') && diferenciaDec.abs().gt('0.05'),
    };
  }, [resumen?.extractoLineas]);

  const abrirNuevoCheque = () => {
    setNumeroCheque('');
    setBeneficiario('');
    setMontoCheque('');
    setFechaGiro(resumen?.fechaFin || `${periodo}-01`);
    setFechaEntrega('');
    setFechaVencimiento('');
    setEsNoNegociable(true);
    setObservacionCheque('');
    setErrorFormCheque(null);
    setMostrarFormCheque(true);
  };

  const handleRegistrarCheque = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cuenta || escrituraChequesBloqueada || registrarChequeMutation.isPending) return;

    const num = numeroCheque.trim();
    const benef = beneficiario.trim();
    if (!num) {
      setErrorFormCheque('El número de cheque es obligatorio.');
      return;
    }
    if (benef.length < 2) {
      setErrorFormCheque('El beneficiario debe tener al menos 2 caracteres.');
      return;
    }
    const montoText = montoCheque.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(montoText) || new Decimal(montoText).lte(0)) {
      setErrorFormCheque('El monto debe ser un decimal mayor a 0.00.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaGiro)) {
      setErrorFormCheque('Indique una fecha de giro válida (YYYY-MM-DD).');
      return;
    }
    if (fechaEntrega && fechaEntrega < fechaGiro) {
      setErrorFormCheque('La fecha de entrega no puede ser anterior a la fecha de giro.');
      return;
    }
    if (fechaVencimiento && fechaVencimiento < fechaGiro) {
      setErrorFormCheque('La fecha de vencimiento no puede ser anterior a la fecha de giro.');
      return;
    }

    setErrorFormCheque(null);
    try {
      await registrarChequeMutation.mutateAsync({
        cuentaFinancieraId: cuenta.id,
        numeroCheque: num,
        beneficiario: benef,
        moneda,
        monto: new Decimal(montoText).toFixed(2),
        fechaGiro,
        fechaEntrega: fechaEntrega || null,
        fechaVencimiento: fechaVencimiento || null,
        esNoNegociable,
        observacion: observacionCheque.trim() || null,
      });
      setMostrarFormCheque(false);
    } catch {
      // Notificado por toast en hook
    }
  };

  const abrirTransicionCheque = (
    cheque: ChequeBancarioV2,
    estadoDestino: EstadoChequeBancarioV2
  ) => {
    setTransicionObjetivo({ cheque, estadoDestino });
    const fechaBase = resumen?.fechaFin || new Date().toISOString().slice(0, 10);
    setFechaTransicion(fechaBase);
    setExtractoLineaCobroId('');
    setObservacionTransicion('');
  };

  const handleConfirmarTransicionCheque = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transicionObjetivo || actualizarEstadoChequeMutation.isPending) return;
    const { cheque, estadoDestino } = transicionObjetivo;
    try {
      await actualizarEstadoChequeMutation.mutateAsync({
        chequeId: cheque.id,
        payload: {
          estado: estadoDestino,
          ...(estadoDestino === 'ENTREGADO' && fechaTransicion
            ? { fechaEntrega: fechaTransicion }
            : {}),
          ...(estadoDestino === 'COBRADO'
            ? {
                ...(fechaTransicion ? { fechaCobro: fechaTransicion } : {}),
                ...(extractoLineaCobroId ? { extractoLineaId: extractoLineaCobroId } : {}),
              }
            : {}),
          ...(observacionTransicion.trim() ? { observacion: observacionTransicion.trim() } : {}),
        },
      });
      setTransicionObjetivo(null);
    } catch {
      // Notificado por toast en hook
    }
  };

  const resetFormPlantilla = () => {
    setPlantillaEditandoId(null);
    setCodigoPlantilla('');
    setNombrePlantilla('');
    setTipoOpPlantilla('COMISION');
    setCuentaContraPlantilla('');
    setSubdiarioPlantilla('05');
    setGlosaPlantilla('');
    setActivoPlantilla(true);
    setErrorFormPlantilla(null);
  };

  const abrirNuevaPlantilla = () => {
    resetFormPlantilla();
    setMostrarFormPlantilla(true);
  };

  const abrirEditarPlantilla = (pl: PlantillaAsientoV2) => {
    setPlantillaEditandoId(pl.id);
    setCodigoPlantilla(pl.codigo);
    setNombrePlantilla(pl.nombre);
    setTipoOpPlantilla(pl.tipoOperacion);
    setCuentaContraPlantilla(pl.cuentaContrapartidaCodigo ?? '');
    setSubdiarioPlantilla(pl.subdiarioCodigo || '05');
    setGlosaPlantilla(pl.glosaPlantilla);
    setActivoPlantilla(pl.activo);
    setErrorFormPlantilla(null);
    setMostrarFormPlantilla(true);
  };

  const handleGuardarPlantilla = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeEditarPlantillas) return;

    if (!plantillaEditandoId && !/^[A-Za-z0-9_-]{2,50}$/.test(codigoPlantilla.trim())) {
      setErrorFormPlantilla(
        'El código debe tener entre 2 y 50 caracteres (solo letras, números, "_" y "-").'
      );
      return;
    }
    if (nombrePlantilla.trim().length < 2) {
      setErrorFormPlantilla('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    if (glosaPlantilla.trim().length < 3) {
      setErrorFormPlantilla('La glosa de plantilla debe tener al menos 3 caracteres.');
      return;
    }

    setErrorFormPlantilla(null);
    try {
      if (plantillaEditandoId) {
        await actualizarPlantillaMutation.mutateAsync({
          plantillaId: plantillaEditandoId,
          payload: {
            nombre: nombrePlantilla.trim(),
            tipoOperacion: tipoOpPlantilla,
            cuentaContrapartidaCodigo: cuentaContraPlantilla.trim() || null,
            subdiarioCodigo: subdiarioPlantilla.trim() || '05',
            glosaPlantilla: glosaPlantilla.trim(),
            activo: activoPlantilla,
          },
        });
      } else {
        await crearPlantillaMutation.mutateAsync({
          codigo: codigoPlantilla.trim(),
          nombre: nombrePlantilla.trim(),
          tipoOperacion: tipoOpPlantilla,
          cuentaContrapartidaCodigo: cuentaContraPlantilla.trim() || null,
          subdiarioCodigo: subdiarioPlantilla.trim() || '05',
          glosaPlantilla: glosaPlantilla.trim(),
          activo: activoPlantilla,
        });
      }
      setMostrarFormPlantilla(false);
      resetFormPlantilla();
    } catch {
      // Notificado por toast en hook
    }
  };

  const columnasCheques: ColumnaTablaDensa<ChequeBancarioV2>[] = useMemo(
    () => [
      {
        key: 'numeroCheque',
        header: 'N° Cheque',
        width: '105px',
        render: (c) => (
          <div>
            <div className="font-mono font-bold text-[#1E3A5F]">{c.numeroCheque}</div>
            {c.esNoNegociable && (
              <span className="inline-block px-1 py-0 text-[9px] bg-[#ECFDF5] text-[#1E6F42] border border-[#1E6F42]">
                NO NEGOC.
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'beneficiario',
        header: 'Beneficiario / Obs.',
        render: (c) => (
          <div>
            <div className="font-medium text-[#111827]">{c.beneficiario}</div>
            {c.observacion && <div className="text-[10px] text-[#4B5563]">{c.observacion}</div>}
          </div>
        ),
      },
      {
        key: 'fechas',
        header: 'Giro / Vencimiento',
        width: '130px',
        render: (c) => (
          <div className="font-mono text-[10px] space-y-0.5">
            <div>Giro: {c.fechaGiro}</div>
            {c.fechaVencimiento && (
              <div className="text-[#4B5563]">Venc: {c.fechaVencimiento}</div>
            )}
            {c.fechaCobro && <div className="text-[#1E6F42]">Cobr: {c.fechaCobro}</div>}
          </div>
        ),
      },
      {
        key: 'monto',
        header: 'Monto',
        width: '110px',
        align: 'right',
        numeric: true,
        render: (c) => (
          <span className="font-mono font-bold text-[#111827]">
            {formatearMonedaExacta(c.monto, c.moneda)}
          </span>
        ),
      },
      {
        key: 'estado',
        header: 'Estado',
        width: '100px',
        render: (c) => (
          <span
            className={`inline-block px-1.5 py-0.5 text-[10px] font-bold border ${badgeEstadoChequeClase(
              c.estado
            )}`}
          >
            {c.estado}
          </span>
        ),
      },
      {
        key: 'acciones',
        header: 'Transiciones',
        width: '250px',
        align: 'center',
        render: (c) => {
          if (c.estado === 'COBRADO' || c.estado === 'ANULADO') {
            return (
              <span className="text-[10px] text-[#6B7280] font-mono">
                {c.extractoLineaId ? 'Vinculado a extracto' : 'Estado final'}
              </span>
            );
          }
          return (
            <div className="flex flex-wrap items-center justify-center gap-1">
              {c.estado === 'GIRADO' && (
                <button
                  type="button"
                  disabled={escrituraChequesBloqueada}
                  onClick={() => abrirTransicionCheque(c, 'ENTREGADO')}
                  className="h-5 px-1.5 bg-[#FFFFFF] hover:bg-[#EFF6FF] disabled:opacity-50 text-[#1E3A5F] border border-[#1E3A5F] text-[10px] cursor-pointer disabled:cursor-not-allowed rounded-none"
                >
                  Entregar
                </button>
              )}
              {(c.estado === 'GIRADO' || c.estado === 'ENTREGADO' || c.estado === 'VENCIDO') && (
                <button
                  type="button"
                  disabled={escrituraChequesBloqueada}
                  onClick={() => abrirTransicionCheque(c, 'COBRADO')}
                  className="h-5 px-1.5 bg-[#ECFDF5] hover:bg-[#D1FAE5] disabled:opacity-50 text-[#1E6F42] border border-[#1E6F42] text-[10px] font-bold cursor-pointer disabled:cursor-not-allowed rounded-none"
                >
                  Cobrar
                </button>
              )}
              {(c.estado === 'GIRADO' || c.estado === 'ENTREGADO') && (
                <button
                  type="button"
                  disabled={escrituraChequesBloqueada}
                  onClick={() => abrirTransicionCheque(c, 'VENCIDO')}
                  className="h-5 px-1.5 bg-[#FEF3C7] hover:bg-[#FDE68A] disabled:opacity-50 text-[#B45309] border border-[#B45309] text-[10px] cursor-pointer disabled:cursor-not-allowed rounded-none"
                >
                  Marcar vencido
                </button>
              )}
              <button
                type="button"
                disabled={escrituraChequesBloqueada}
                onClick={() => abrirTransicionCheque(c, 'ANULADO')}
                className="h-5 px-1.5 bg-[#FFFFFF] hover:bg-[#FEF2F2] disabled:opacity-50 text-[#B91C1C] border border-[#D1D5DB] text-[10px] cursor-pointer disabled:cursor-not-allowed rounded-none"
              >
                Anular
              </button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [escrituraChequesBloqueada, resumen?.fechaFin]
  );

  const columnasPlantillas: ColumnaTablaDensa<PlantillaAsientoV2>[] = useMemo(
    () => [
      {
        key: 'codigo',
        header: 'Código',
        width: '150px',
        render: (p) => (
          <div>
            <div className="font-mono font-bold text-[#1E3A5F] text-[11px]">{p.codigo}</div>
            <span
              className={`inline-block px-1 py-0 text-[9px] border ${
                p.esSistema
                  ? 'bg-[#EFF6FF] text-[#1E3A5F] border-[#1E3A5F]'
                  : 'bg-[#F5F7FA] text-[#374151] border-[#D1D5DB]'
              }`}
            >
              {p.esSistema ? 'Sistema' : 'Empresa'}
            </span>
          </div>
        ),
      },
      {
        key: 'nombre',
        header: 'Nombre / Glosa Plantilla',
        render: (p) => (
          <div>
            <div className="font-medium text-[#111827]">{p.nombre}</div>
            <div className="text-[10px] text-[#4B5563] font-mono">{p.glosaPlantilla}</div>
          </div>
        ),
      },
      {
        key: 'tipoOperacion',
        header: 'Tipo Operación',
        width: '150px',
        render: (p) => <span className="font-mono text-[10px]">{p.tipoOperacion}</span>,
      },
      {
        key: 'cuentaContrapartidaCodigo',
        header: 'PCGE / Subd.',
        width: '105px',
        render: (p) => (
          <div className="font-mono text-[11px]">
            <div>{p.cuentaContrapartidaCodigo || 'Config'}</div>
            <div className="text-[10px] text-[#4B5563]">Subd. {p.subdiarioCodigo}</div>
          </div>
        ),
      },
      {
        key: 'activo',
        header: 'Estado',
        width: '80px',
        align: 'center',
        render: (p) => (
          <span
            className={`px-1.5 py-0.5 text-[10px] font-bold border ${
              p.activo
                ? 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]'
                : 'bg-[#F3F4F6] text-[#4B5563] border-[#9CA3AF]'
            }`}
          >
            {p.activo ? 'ACTIVA' : 'INACTIVA'}
          </span>
        ),
      },
      {
        key: 'acciones',
        header: 'Acciones',
        width: '130px',
        align: 'center',
        render: (p) =>
          p.esSistema || !puedeEditarPlantillas ? (
            <span className="text-[10px] text-[#9CA3AF]">
              {p.esSistema ? 'Predefinida' : 'Solo lectura'}
            </span>
          ) : confirmEliminarPlantillaId === p.id ? (
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                disabled={eliminarPlantillaMutation.isPending}
                onClick={async () => {
                  try {
                    await eliminarPlantillaMutation.mutateAsync(p.id);
                    setConfirmEliminarPlantillaId(null);
                  } catch {
                    // Notificado por toast
                  }
                }}
                className="h-6 px-2 bg-[#B91C1C] text-[#FFFFFF] text-[10px] font-bold cursor-pointer rounded-none"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setConfirmEliminarPlantillaId(null)}
                className="h-6 px-1.5 bg-[#FFFFFF] border border-[#D1D5DB] text-[10px] cursor-pointer rounded-none"
              >
                No
              </button>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => abrirEditarPlantilla(p)}
                className="h-6 px-2 bg-[#FFFFFF] hover:bg-[#E8ECF1] border border-[#D1D5DB] text-[10px] inline-flex items-center gap-1 cursor-pointer rounded-none"
              >
                <Edit3 className="w-3 h-3" />
                <span>Editar</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmEliminarPlantillaId(p.id)}
                className="h-6 px-1.5 bg-[#FFFFFF] hover:bg-[#FEF2F2] text-[#B91C1C] border border-[#D1D5DB] cursor-pointer rounded-none"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [puedeEditarPlantillas, confirmEliminarPlantillaId, eliminarPlantillaMutation.isPending]
  );

  const totalAlertas = alertasControl?.totalAlertas ?? 0;

  return (
    <VentanaModal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Cheques, Control Tributario y Plantillas de Asiento"
      subtitulo={
        cuenta ? `${cuenta.banco} (${cuenta.moneda}) · Periodo ${periodo}` : `Periodo ${periodo}`
      }
      ancho="2xl"
      footer={
        <button
          type="button"
          onClick={onCerrar}
          className="h-7 px-3 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border border-[#D1D5DB] text-[12px] cursor-pointer rounded-none"
        >
          Cerrar
        </button>
      }
    >
      <div className="space-y-3">
        {/* Pestañas superiores */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D1D5DB] pb-2">
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setTab('ALERTAS')}
              className={`h-7 px-3 text-[12px] border inline-flex items-center gap-1.5 cursor-pointer rounded-none ${
                tab === 'ALERTAS'
                  ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F] font-bold'
                  : 'bg-[#F5F7FA] text-[#111827] border-[#D1D5DB] hover:bg-[#E8ECF1]'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Alertas Tributarias y Control</span>
              <span
                className={`px-1.5 py-0 text-[10px] font-mono font-bold ${
                  totalAlertas > 0
                    ? 'bg-[#B91C1C] text-[#FFFFFF]'
                    : 'bg-[#E5E7EB] text-[#4B5563]'
                }`}
              >
                {totalAlertas}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTab('CHEQUES')}
              className={`h-7 px-3 text-[12px] border inline-flex items-center gap-1.5 cursor-pointer rounded-none ${
                tab === 'CHEQUES'
                  ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F] font-bold'
                  : 'bg-[#F5F7FA] text-[#111827] border-[#D1D5DB] hover:bg-[#E8ECF1]'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Cheques Bancarios ({chequesQuery.data?.length ?? 0})</span>
            </button>

            <button
              type="button"
              onClick={() => setTab('PLANTILLAS')}
              className={`h-7 px-3 text-[12px] border inline-flex items-center gap-1.5 cursor-pointer rounded-none ${
                tab === 'PLANTILLAS'
                  ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F] font-bold'
                  : 'bg-[#F5F7FA] text-[#111827] border-[#D1D5DB] hover:bg-[#E8ECF1]'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Plantillas de Asiento</span>
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* TAB 1: ALERTAS TRIBUTARIAS Y CONTROL                              */}
        {/* ================================================================= */}
        {tab === 'ALERTAS' && (
          <div className="space-y-3">
            {errorAlertas ? (
              <div className="p-2.5 bg-[#FEF2F2] border border-[#B91C1C] text-[#991B1B] text-[12px]">
                {extraerMensajeErrorConciliacion(
                  errorAlertas,
                  'No se pudieron cargar las alertas de control.'
                )}
              </div>
            ) : null}

            {/* Badges resumen: ITF esperado vs cobrado, Bancarización, Cheques antiguos */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[12px]">
              <div
                className={`p-2.5 border ${
                  resumenItf.hayDesviacion || (alertasControl?.itfPendientes.length ?? 0) > 0
                    ? 'bg-[#FEF3C7] border-[#B45309]'
                    : 'bg-[#ECFDF5] border-[#1E6F42]'
                }`}
              >
                <div className="text-[11px] font-bold text-[#111827] flex items-center justify-between">
                  <span>ITF Esperado (0.005%) vs Cobrado</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#FFFFFF] border border-[#D1D5DB]">
                    {alertasControl?.itfPendientes.length ?? 0} alerta(s)
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1 text-[11px] font-mono">
                  <div>
                    <div className="text-[10px] text-[#4B5563]">Esperado</div>
                    <div className="font-bold text-[#111827]">
                      {formatearMonedaExacta(resumenItf.esperado, moneda)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#4B5563]">Cobrado</div>
                    <div className="font-bold text-[#1E3A5F]">
                      {formatearMonedaExacta(resumenItf.cobrado, moneda)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#4B5563]">Pend. Contab.</div>
                    <div className="font-bold text-[#B45309]">
                      {formatearMonedaExacta(
                        alertasControl?.totalItfPendiente ?? '0.00',
                        moneda
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div
                className={`p-2.5 border ${
                  (alertasControl?.alertasBancarizacion.length ?? 0) > 0
                    ? 'bg-[#FEF2F2] border-[#B91C1C]'
                    : 'bg-[#ECFDF5] border-[#1E6F42]'
                }`}
              >
                <div className="text-[11px] font-bold text-[#111827] flex items-center justify-between">
                  <span>Bancarización Ley 28194</span>
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.5 border font-bold ${
                      (alertasControl?.alertasBancarizacion.length ?? 0) > 0
                        ? 'bg-[#B91C1C] text-[#FFFFFF] border-[#B91C1C]'
                        : 'bg-[#FFFFFF] text-[#1E6F42] border-[#1E6F42]'
                    }`}
                  >
                    {alertasControl?.alertasBancarizacion.length ?? 0} alerta(s)
                  </span>
                </div>
                <div className="mt-1.5 text-[11px] text-[#374151]">
                  Umbral legal vigente: <strong>S/ 2,000.00</strong> o{' '}
                  <strong>US$ 500.00</strong> (medios bancarios / cheques No Negociables).
                </div>
              </div>

              <div
                className={`p-2.5 border ${
                  (alertasControl?.chequesAntiguedad.length ?? 0) > 0
                    ? 'bg-[#FEF3C7] border-[#B45309]'
                    : 'bg-[#ECFDF5] border-[#1E6F42]'
                }`}
              >
                <div className="text-[11px] font-bold text-[#111827] flex items-center justify-between">
                  <span>Cheques Antiguos / Vencidos</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#FFFFFF] border border-[#D1D5DB] font-bold">
                    {alertasControl?.chequesAntiguedad.length ?? 0} alerta(s)
                  </span>
                </div>
                <div className="mt-1.5 font-mono text-[12px] font-bold text-[#B45309]">
                  Total en alerta:{' '}
                  {formatearMonedaExacta(
                    alertasControl?.totalChequesNoCobradosAlerta ?? '0.00',
                    moneda
                  )}
                </div>
                <div className="text-[10px] text-[#4B5563]">
                  Plazo de presentación legal: 30 días desde fecha de giro.
                </div>
              </div>
            </div>

            {cargandoAlertas ? (
              <div className="p-4 text-center text-[12px] text-[#4B5563] border border-[#D1D5DB]">
                Evaluando controles tributarios y de antigüedad...
              </div>
            ) : (
              <div className="space-y-3">
                {/* Detalle ITF pendiente */}
                <div className="border border-[#D1D5DB]">
                  <div className="px-2.5 py-1.5 bg-[#F5F7FA] border-b border-[#D1D5DB] font-bold text-[12px] text-[#1E3A5F] flex items-center justify-between">
                    <span>1. Control ITF (0.005%) — Líneas Pendientes y Desviaciones</span>
                    <span className="font-mono text-[11px]">
                      {alertasControl?.itfPendientes.length ?? 0} registro(s)
                    </span>
                  </div>
                  {(alertasControl?.itfPendientes.length ?? 0) === 0 ? (
                    <div className="p-2.5 text-[11px] text-[#1E6F42] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>No hay cargos ITF pendientes ni desviaciones significativas.</span>
                    </div>
                  ) : (
                    <table className="tabla-densa">
                      <thead>
                        <tr>
                          <th className="w-24 text-left">Fecha</th>
                          <th className="text-left">Descripción</th>
                          <th className="w-24 text-left">Cuenta PCGE</th>
                          <th className="w-28 text-right tabular-nums">Monto</th>
                          <th className="w-32 text-center">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alertasControl?.itfPendientes.map((itf, i) => {
                          const lineaExtracto = lineaPorId.get(itf.extractoLineaId);
                          const puedeContabilizar =
                            Boolean(lineaExtracto && !lineaExtracto.conciliada && onAbrirAsientoLinea) &&
                            !escrituraChequesBloqueada;
                          return (
                            <tr
                              key={`${itf.extractoLineaId}-${i}`}
                              className={i % 2 === 0 ? 'bg-[#FFFFFF]' : 'bg-[#F5F7FA]'}
                            >
                              <td className="font-mono text-[11px]">{itf.fecha}</td>
                              <td className="text-[11px]">{itf.descripcion}</td>
                              <td className="font-mono text-[11px]">{itf.cuentaItfCodigo}</td>
                              <td className="text-right font-mono font-bold text-[#B45309] tabular-nums">
                                {formatearMonedaExacta(itf.monto, moneda)}
                              </td>
                              <td className="text-center">
                                {puedeContabilizar && lineaExtracto ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onCerrar();
                                      onAbrirAsientoLinea?.(lineaExtracto);
                                    }}
                                    className="h-5 px-2 bg-[#1E3A5F] hover:bg-[#162C49] text-[#FFFFFF] text-[10px] font-bold cursor-pointer rounded-none"
                                  >
                                    Generar Asiento
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-[#6B7280]">Revisar</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Detalle Bancarización Ley 28194 */}
                <div className="border border-[#D1D5DB]">
                  <div className="px-2.5 py-1.5 bg-[#F5F7FA] border-b border-[#D1D5DB] font-bold text-[12px] text-[#1E3A5F] flex items-center justify-between">
                    <span>2. Control de Bancarización Ley 28194 (S/ 2,000 / US$ 500)</span>
                    <span className="font-mono text-[11px]">
                      {alertasControl?.alertasBancarizacion.length ?? 0} alerta(s)
                    </span>
                  </div>
                  {(alertasControl?.alertasBancarizacion.length ?? 0) === 0 ? (
                    <div className="p-2.5 text-[11px] text-[#1E6F42] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        Todas las operaciones por encima del umbral cuentan con medio bancario
                        conforme a la Ley 28194.
                      </span>
                    </div>
                  ) : (
                    <table className="tabla-densa">
                      <thead>
                        <tr>
                          <th className="w-24 text-left">Fecha</th>
                          <th className="w-24 text-left">Severidad</th>
                          <th className="text-left">Operación y Motivo Tributario</th>
                          <th className="w-28 text-right tabular-nums">Monto / Umbral</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alertasControl?.alertasBancarizacion.map((b, i) => (
                          <tr
                            key={`${b.referenciaId}-${i}`}
                            className={i % 2 === 0 ? 'bg-[#FFFFFF]' : 'bg-[#F5F7FA]'}
                          >
                            <td className="font-mono text-[11px]">{b.fecha}</td>
                            <td>
                              <span
                                className={`px-1.5 py-0.5 text-[10px] font-bold border ${
                                  b.severidad === 'CRITICA'
                                    ? 'bg-[#FEF2F2] text-[#B91C1C] border-[#B91C1C]'
                                    : 'bg-[#FEF3C7] text-[#B45309] border-[#B45309]'
                                }`}
                              >
                                {b.severidad}
                              </span>
                            </td>
                            <td>
                              <div className="font-medium text-[11px] text-[#111827]">
                                {b.descripcion}{' '}
                                {b.medioPago ? (
                                  <span className="font-mono text-[10px] text-[#4B5563]">
                                    [MP: {b.medioPago}]
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-[11px] text-[#B91C1C]">{b.motivo}</div>
                            </td>
                            <td className="text-right font-mono text-[11px] tabular-nums">
                              <div className="font-bold text-[#111827]">
                                {formatearMonedaExacta(b.monto, b.moneda)}
                              </div>
                              <div className="text-[10px] text-[#4B5563]">
                                Umbral: {formatearMonedaExacta(b.umbralLegal, b.moneda)}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Detalle Cheques antiguos / vencidos */}
                <div className="border border-[#D1D5DB]">
                  <div className="px-2.5 py-1.5 bg-[#F5F7FA] border-b border-[#D1D5DB] font-bold text-[12px] text-[#1E3A5F] flex items-center justify-between">
                    <span>3. Cheques Girados por Vencer (≥ 20d) o Vencidos (&gt; 30d)</span>
                    <span className="font-mono text-[11px]">
                      {alertasControl?.chequesAntiguedad.length ?? 0} alerta(s)
                    </span>
                  </div>
                  {(alertasControl?.chequesAntiguedad.length ?? 0) === 0 ? (
                    <div className="p-2.5 text-[11px] text-[#1E6F42] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>No existen cheques pendientes con antigüedad crítica.</span>
                    </div>
                  ) : (
                    <table className="tabla-densa">
                      <thead>
                        <tr>
                          <th className="w-24 text-left">N° Cheque</th>
                          <th className="text-left">Beneficiario / Motivo</th>
                          <th className="w-24 text-left">Fecha Giro</th>
                          <th className="w-20 text-right">Días</th>
                          <th className="w-24 text-left">Estado</th>
                          <th className="w-28 text-right tabular-nums">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alertasControl?.chequesAntiguedad.map((ch, i) => (
                          <tr
                            key={`${ch.chequeId ?? ch.movimientoTesoreriaId ?? i}`}
                            className={i % 2 === 0 ? 'bg-[#FFFFFF]' : 'bg-[#F5F7FA]'}
                          >
                            <td className="font-mono font-bold text-[11px] text-[#1E3A5F]">
                              {ch.numeroCheque || 'Sin N°'}
                            </td>
                            <td>
                              <div className="text-[11px] font-medium text-[#111827]">
                                {ch.beneficiario || 'Sin beneficiario'}
                              </div>
                              <div className="text-[10px] text-[#B45309]">{ch.motivo}</div>
                            </td>
                            <td className="font-mono text-[11px]">{ch.fechaGiro}</td>
                            <td className="text-right font-mono font-bold text-[11px]">
                              <span
                                className={
                                  ch.vencidoPlazoLegal ? 'text-[#B91C1C]' : 'text-[#B45309]'
                                }
                              >
                                {ch.diasTranscurridos} d
                              </span>
                            </td>
                            <td>
                              <span
                                className={`px-1 py-0.5 text-[9px] font-bold border ${
                                  ch.vencidoPlazoLegal
                                    ? 'bg-[#FEF2F2] text-[#B91C1C] border-[#B91C1C]'
                                    : 'bg-[#FEF3C7] text-[#B45309] border-[#B45309]'
                                }`}
                              >
                                {ch.estadoCheque}
                              </span>
                            </td>
                            <td className="text-right font-mono font-bold text-[11px] tabular-nums">
                              {formatearMonedaExacta(ch.monto, ch.moneda)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: GESTIÓN DE CHEQUES BANCARIOS                               */}
        {/* ================================================================= */}
        {tab === 'CHEQUES' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[12px]">
                <label className="font-bold text-[#374151]">Estado:</label>
                <select
                  value={filtroEstadoCheque}
                  onChange={(e) =>
                    setFiltroEstadoCheque(e.target.value as EstadoChequeBancarioV2 | '')
                  }
                  className="h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                >
                  <option value="">Todos los estados</option>
                  {ESTADOS_CHEQUE_BANCARIO_V2.map((est) => (
                    <option key={est} value={est}>
                      {est}
                    </option>
                  ))}
                </select>
              </div>

              {!escrituraChequesBloqueada && !mostrarFormCheque && (
                <button
                  type="button"
                  onClick={abrirNuevoCheque}
                  className="h-7 px-2.5 bg-[#1E3A5F] hover:bg-[#162C49] text-[#FFFFFF] border border-[#1E3A5F] text-[12px] font-bold inline-flex items-center gap-1 cursor-pointer rounded-none"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Registrar Cheque Girado</span>
                </button>
              )}
            </div>

            {/* Formulario nuevo cheque girado */}
            {mostrarFormCheque && (
              <form
                onSubmit={handleRegistrarCheque}
                className="p-3 bg-[#F5F7FA] border border-[#1E3A5F] space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[12px] text-[#1E3A5F]">
                    Nuevo Cheque Bancario Girado ({moneda})
                  </span>
                  <button
                    type="button"
                    onClick={() => setMostrarFormCheque(false)}
                    className="text-[#4B5563] hover:text-[#111827] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {errorFormCheque && (
                  <div className="p-2 bg-[#FEF2F2] border border-[#B91C1C] text-[#B91C1C] text-[11px]">
                    {errorFormCheque}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-[#374151] mb-1">
                      N° Cheque *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={40}
                      value={numeroCheque}
                      onChange={(e) => setNumeroCheque(e.target.value)}
                      placeholder="Ej. 0004512"
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-[12px] rounded-none"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-[#374151] mb-1">
                      Beneficiario *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={200}
                      value={beneficiario}
                      onChange={(e) => setBeneficiario(e.target.value)}
                      placeholder="Razón social o nombre del beneficiario"
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#374151] mb-1">
                      Monto ({moneda}) *
                    </label>
                    <input
                      type="text"
                      required
                      inputMode="decimal"
                      value={montoCheque}
                      onChange={(e) => setMontoCheque(e.target.value)}
                      placeholder="0.00"
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-right text-[12px] rounded-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 items-end">
                  <div>
                    <label className="block text-[11px] font-bold text-[#374151] mb-1">
                      Fecha de Giro *
                    </label>
                    <input
                      type="date"
                      required
                      value={fechaGiro}
                      onChange={(e) => setFechaGiro(e.target.value)}
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-[12px] rounded-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#374151] mb-1">
                      Fecha Entrega (Opc.)
                    </label>
                    <input
                      type="date"
                      value={fechaEntrega}
                      onChange={(e) => setFechaEntrega(e.target.value)}
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-[12px] rounded-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#374151] mb-1">
                      Vencimiento (Opc. +30d)
                    </label>
                    <input
                      type="date"
                      value={fechaVencimiento}
                      onChange={(e) => setFechaVencimiento(e.target.value)}
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-[12px] rounded-none"
                    />
                  </div>

                  <div className="pb-1">
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#1E3A5F] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={esNoNegociable}
                        onChange={(e) => setEsNoNegociable(e.target.checked)}
                        className="w-3.5 h-3.5 accent-[#1E3A5F]"
                      />
                      <span>Cláusula NO NEGOCIABLE</span>
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <input
                    type="text"
                    maxLength={500}
                    value={observacionCheque}
                    onChange={(e) => setObservacionCheque(e.target.value)}
                    placeholder="Observación opcional..."
                    className="flex-1 min-w-[220px] h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                  />
                  <button
                    type="submit"
                    disabled={registrarChequeMutation.isPending}
                    className="h-7 px-3 bg-[#1E3A5F] hover:bg-[#162C49] text-[#FFFFFF] border border-[#1E3A5F] text-[12px] font-bold inline-flex items-center gap-1 cursor-pointer rounded-none"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>
                      {registrarChequeMutation.isPending ? 'Registrando...' : 'Guardar Cheque'}
                    </span>
                  </button>
                </div>
              </form>
            )}

            {/* Subpanel de transición de estado */}
            {transicionObjetivo && (
              <form
                onSubmit={handleConfirmarTransicionCheque}
                className="p-3 bg-[#EFF6FF] border-2 border-[#1E3A5F] space-y-2 text-[12px]"
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold text-[#1E3A5F] flex items-center gap-1.5">
                    {transicionObjetivo.estadoDestino === 'ANULADO' ? (
                      <Ban className="w-4 h-4 text-[#B91C1C]" />
                    ) : (
                      <Clock className="w-4 h-4" />
                    )}
                    <span>
                      Cambiar Cheque N° {transicionObjetivo.cheque.numeroCheque} (
                      {transicionObjetivo.cheque.estado} → {transicionObjetivo.estadoDestino})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTransicionObjetivo(null)}
                    className="text-[#4B5563] hover:text-[#111827] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {(transicionObjetivo.estadoDestino === 'ENTREGADO' ||
                    transicionObjetivo.estadoDestino === 'COBRADO') && (
                    <div>
                      <label className="block text-[11px] font-bold text-[#374151] mb-1">
                        {transicionObjetivo.estadoDestino === 'ENTREGADO'
                          ? 'Fecha de Entrega'
                          : 'Fecha de Cobro'}
                      </label>
                      <input
                        type="date"
                        value={fechaTransicion}
                        onChange={(e) => setFechaTransicion(e.target.value)}
                        className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-[12px] rounded-none"
                      />
                    </div>
                  )}

                  {transicionObjetivo.estadoDestino === 'COBRADO' && (
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-bold text-[#1E3A5F] mb-1">
                        Vincular Línea de Extracto Bancario (Opcional)
                      </label>
                      <select
                        value={extractoLineaCobroId}
                        onChange={(e) => setExtractoLineaCobroId(e.target.value)}
                        className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[11px] rounded-none"
                      >
                        <option value="">-- Sin vincular línea de extracto --</option>
                        {lineasExtractoPendientesCargo.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.fecha} · {formatearMonedaExacta(l.monto, moneda)} ·{' '}
                            {l.descripcion.slice(0, 60)}
                            {l.referencia ? ` (${l.referencia})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div
                    className={
                      transicionObjetivo.estadoDestino === 'COBRADO' ? 'md:col-span-3' : 'md:col-span-2'
                    }
                  >
                    <label className="block text-[11px] font-bold text-[#374151] mb-1">
                      Observación / Motivo (Opcional)
                    </label>
                    <input
                      type="text"
                      maxLength={500}
                      value={observacionTransicion}
                      onChange={(e) => setObservacionTransicion(e.target.value)}
                      placeholder="Detalle opcional de la transición..."
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setTransicionObjetivo(null)}
                    className="h-7 px-3 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] cursor-pointer rounded-none"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={actualizarEstadoChequeMutation.isPending}
                    className={`h-7 px-3 text-[#FFFFFF] border text-[12px] font-bold cursor-pointer rounded-none ${
                      transicionObjetivo.estadoDestino === 'ANULADO'
                        ? 'bg-[#B91C1C] border-[#B91C1C]'
                        : 'bg-[#1E3A5F] border-[#1E3A5F]'
                    }`}
                  >
                    {actualizarEstadoChequeMutation.isPending
                      ? 'Actualizando...'
                      : `Confirmar ${transicionObjetivo.estadoDestino}`}
                  </button>
                </div>
              </form>
            )}

            <TablaDensa
              columnas={columnasCheques}
              datos={chequesQuery.data ?? []}
              rowKey={(c) => c.id}
              cargando={chequesQuery.isLoading}
              mensajeError={
                chequesQuery.error
                  ? extraerMensajeErrorConciliacion(
                      chequesQuery.error,
                      'No se pudieron cargar los cheques bancarios.'
                    )
                  : null
              }
              mensajeVacio="No hay cheques bancarios registrados para el filtro seleccionado."
            />
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: GESTOR COMPACTO DE PLANTILLAS DE ASIENTO                   */}
        {/* ================================================================= */}
        {tab === 'PLANTILLAS' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
              <div className="text-[#4B5563]">
                Las plantillas predefinidas del sistema utilizan las cuentas configuradas en{' '}
                <strong>Configuración V2</strong>. Puede agregar plantillas personalizadas por
                empresa.
              </div>
              {puedeEditarPlantillas && !mostrarFormPlantilla && (
                <button
                  type="button"
                  onClick={abrirNuevaPlantilla}
                  className="h-7 px-2.5 bg-[#1E3A5F] hover:bg-[#162C49] text-[#FFFFFF] border border-[#1E3A5F] text-[12px] font-bold inline-flex items-center gap-1 cursor-pointer rounded-none"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nueva Plantilla</span>
                </button>
              )}
            </div>

            {!puedeEditarPlantillas && (
              <div className="p-2 bg-[#FEF3C7] border border-[#B45309] text-[#7C2D12] text-[11px] flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Solo usuarios con rol ADMINISTRADOR o CONTADOR pueden crear, modificar o eliminar
                  plantillas de asiento.
                </span>
              </div>
            )}

            {mostrarFormPlantilla && puedeEditarPlantillas && (
              <form
                onSubmit={handleGuardarPlantilla}
                className="p-3 bg-[#F5F7FA] border border-[#1E3A5F] space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[12px] text-[#1E3A5F]">
                    {plantillaEditandoId
                      ? 'Editar Plantilla de Asiento'
                      : 'Nueva Plantilla de Asiento'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMostrarFormPlantilla(false);
                      resetFormPlantilla();
                    }}
                    className="text-[#4B5563] hover:text-[#111827] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {errorFormPlantilla && (
                  <div className="p-2 bg-[#FEF2F2] border border-[#B91C1C] text-[#B91C1C] text-[11px]">
                    {errorFormPlantilla}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-[#374151] mb-1">
                      Código *
                    </label>
                    <input
                      type="text"
                      required
                      disabled={Boolean(plantillaEditandoId)}
                      maxLength={50}
                      value={codigoPlantilla}
                      onChange={(e) => setCodigoPlantilla(e.target.value)}
                      placeholder="Ej. COM_SWIFT"
                      className="w-full h-7 px-2 bg-[#FFFFFF] disabled:bg-[#F3F4F6] border border-[#D1D5DB] font-mono text-[12px] rounded-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#374151] mb-1">
                      Nombre *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={nombrePlantilla}
                      onChange={(e) => setNombrePlantilla(e.target.value)}
                      placeholder="Ej. Comisión Transferencia SWIFT"
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#374151] mb-1">
                      Tipo Operación *
                    </label>
                    <select
                      value={tipoOpPlantilla}
                      onChange={(e) =>
                        setTipoOpPlantilla(e.target.value as TipoOperacionPlantillaV2)
                      }
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                    >
                      {TIPOS_OPERACION_PLANTILLA_V2.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-[#374151] mb-1">
                      Cuenta Contrapartida PCGE (Opcional)
                    </label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        maxLength={20}
                        value={cuentaContraPlantilla}
                        onChange={(e) => setCuentaContraPlantilla(e.target.value)}
                        placeholder="Ej. 6391"
                        className="w-28 h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-[12px] rounded-none"
                      />
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) setCuentaContraPlantilla(e.target.value);
                        }}
                        className="flex-1 h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[11px] rounded-none"
                      >
                        <option value="">
                          {cuentasContablesQuery.isLoading
                            ? 'Cargando...'
                            : '-- Elegir cuenta PCGE --'}
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
                      value={subdiarioPlantilla}
                      onChange={(e) => setSubdiarioPlantilla(e.target.value)}
                      placeholder="05"
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-[12px] rounded-none"
                    />
                  </div>

                  <div className="pb-1">
                    <label className="inline-flex items-center gap-1.5 text-[12px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activoPlantilla}
                        onChange={(e) => setActivoPlantilla(e.target.checked)}
                        className="w-3.5 h-3.5 accent-[#1E3A5F]"
                      />
                      <span>Plantilla activa</span>
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <input
                    type="text"
                    required
                    maxLength={250}
                    value={glosaPlantilla}
                    onChange={(e) => setGlosaPlantilla(e.target.value)}
                    placeholder="Glosa de plantilla (admite {descripcion}) *"
                    className="flex-1 min-w-[240px] h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                  />
                  <button
                    type="submit"
                    disabled={
                      crearPlantillaMutation.isPending || actualizarPlantillaMutation.isPending
                    }
                    className="h-7 px-3 bg-[#1E3A5F] hover:bg-[#162C49] text-[#FFFFFF] border border-[#1E3A5F] text-[12px] font-bold inline-flex items-center gap-1 cursor-pointer rounded-none"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>
                      {crearPlantillaMutation.isPending || actualizarPlantillaMutation.isPending
                        ? 'Guardando...'
                        : 'Guardar Plantilla'}
                    </span>
                  </button>
                </div>
              </form>
            )}

            <TablaDensa
              columnas={columnasPlantillas}
              datos={plantillasQuery.data ?? []}
              rowKey={(p) => p.id}
              cargando={plantillasQuery.isLoading}
              mensajeError={
                plantillasQuery.error
                  ? extraerMensajeErrorConciliacion(
                      plantillasQuery.error,
                      'No se pudieron cargar las plantillas de asiento.'
                    )
                  : null
              }
              mensajeVacio="No hay plantillas de asiento registradas."
            />
          </div>
        )}
      </div>
    </VentanaModal>
  );
};
