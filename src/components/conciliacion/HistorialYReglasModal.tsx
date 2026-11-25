import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Edit3,
  History,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  TIPOS_CLASIFICACION_EXTRACTO,
  type CuentaBancariaV2,
  type HistorialDesconciliacionV2,
  type ReglaAprendidaV2,
  type TipoClasificacionExtracto,
} from '../../api/conciliacionV2Api';
import {
  extraerMensajeErrorConciliacion,
  useActualizarReglaAprendida,
  useCrearReglaAprendida,
  useCuentasContablesDisponiblesV2,
  useEliminarReglaAprendida,
  useHistorialDesconciliacion,
  useReglasAprendidas,
} from '../../hooks/useConciliacionV2';
import { ColumnaTablaDensa, TablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';
import { formatearMonedaExacta } from './conciliacionUtils';

export type TabHistorialReglas = 'HISTORIAL' | 'REGLAS';

export interface HistorialYReglasModalProps {
  abierto: boolean;
  onCerrar: () => void;
  empresaId: string;
  cuenta: CuentaBancariaV2 | null;
  periodo: string;
  puedeEditarReglas: boolean;
  tabInicial?: TabHistorialReglas;
}

interface SnapshotParseado {
  tipoMatch: string | null;
  diferenciaMonto: string | null;
  totalBanco: string | null;
  totalLibro: string | null;
  itemsBancoCount: number;
  itemsLibroCount: number;
}

function parsearSnapshot(raw: Record<string, unknown> | null | undefined): SnapshotParseado {
  if (!raw || typeof raw !== 'object') {
    return {
      tipoMatch: null,
      diferenciaMonto: null,
      totalBanco: null,
      totalLibro: null,
      itemsBancoCount: 0,
      itemsLibroCount: 0,
    };
  }

  const tipoMatch = typeof raw.tipoMatch === 'string' ? raw.tipoMatch : null;
  const diferenciaMonto =
    raw.diferenciaMonto !== undefined && raw.diferenciaMonto !== null
      ? String(raw.diferenciaMonto)
      : null;

  const itemsBanco = Array.isArray(raw.itemsBanco) ? raw.itemsBanco : [];
  const itemsLibro = Array.isArray(raw.itemsLibro) ? raw.itemsLibro : [];

  const sumarItems = (items: unknown[]): string | null => {
    if (items.length === 0) return null;
    let totalCentavos = 0;
    let tuvoMonto = false;
    for (const item of items) {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        const montoRaw = rec.montoImputado ?? rec.monto ?? rec.importeConSigno;
        if (montoRaw !== undefined && montoRaw !== null && !Number.isNaN(Number(montoRaw))) {
          totalCentavos += Math.round(Number(montoRaw) * 100);
          tuvoMonto = true;
        }
      }
    }
    return tuvoMonto ? (totalCentavos / 100).toFixed(2) : null;
  };

  return {
    tipoMatch,
    diferenciaMonto,
    totalBanco:
      typeof raw.totalBanco === 'string' || typeof raw.totalBanco === 'number'
        ? String(raw.totalBanco)
        : sumarItems(itemsBanco),
    totalLibro:
      typeof raw.totalLibro === 'string' || typeof raw.totalLibro === 'number'
        ? String(raw.totalLibro)
        : sumarItems(itemsLibro),
    itemsBancoCount: itemsBanco.length,
    itemsLibroCount: itemsLibro.length,
  };
}

export const HistorialYReglasModal: React.FC<HistorialYReglasModalProps> = ({
  abierto,
  onCerrar,
  empresaId,
  cuenta,
  periodo,
  puedeEditarReglas,
  tabInicial = 'HISTORIAL',
}) => {
  const [tab, setTab] = useState<TabHistorialReglas>(tabInicial);
  const [soloCuentaPeriodoActual, setSoloCuentaPeriodoActual] = useState(true);

  // Estado formulario Regla Aprendida
  const [reglaEditandoId, setReglaEditandoId] = useState<string | null>(null);
  const [mostrarFormRegla, setMostrarFormRegla] = useState(false);
  const [patronContraparte, setPatronContraparte] = useState('');
  const [rucContraparte, setRucContraparte] = useState('');
  const [cuentaContableId, setCuentaContableId] = useState('');
  const [tipoClasificacion, setTipoClasificacion] = useState<TipoClasificacionExtracto | ''>('');
  const [activoRegla, setActivoRegla] = useState(true);
  const [errorFormRegla, setErrorFormRegla] = useState<string | null>(null);
  const [confirmEliminarId, setConfirmEliminarId] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) {
      setTab(tabInicial);
      setMostrarFormRegla(false);
      setReglaEditandoId(null);
      setErrorFormRegla(null);
      setConfirmEliminarId(null);
    }
  }, [abierto, tabInicial]);

  const historialQuery = useHistorialDesconciliacion(
    empresaId,
    soloCuentaPeriodoActual ? cuenta?.id ?? undefined : undefined,
    soloCuentaPeriodoActual ? periodo : undefined,
    abierto && tab === 'HISTORIAL'
  );

  const reglasQuery = useReglasAprendidas(empresaId, abierto && tab === 'REGLAS');
  const cuentasContablesQuery = useCuentasContablesDisponiblesV2(
    empresaId,
    abierto && tab === 'REGLAS' && mostrarFormRegla
  );

  const crearReglaMutation = useCrearReglaAprendida(empresaId);
  const actualizarReglaMutation = useActualizarReglaAprendida(empresaId);
  const eliminarReglaMutation = useEliminarReglaAprendida(empresaId);

  const moneda = cuenta?.moneda ?? 'PEN';

  const resetFormRegla = () => {
    setReglaEditandoId(null);
    setPatronContraparte('');
    setRucContraparte('');
    setCuentaContableId('');
    setTipoClasificacion('');
    setActivoRegla(true);
    setErrorFormRegla(null);
  };

  const abrirNuevaRegla = () => {
    resetFormRegla();
    setMostrarFormRegla(true);
  };

  const abrirEditarRegla = (regla: ReglaAprendidaV2) => {
    setReglaEditandoId(regla.id);
    setPatronContraparte(regla.patronContraparte);
    setRucContraparte(regla.rucContraparte ?? '');
    setCuentaContableId(regla.cuentaContableId ?? '');
    setTipoClasificacion(regla.tipoClasificacion ?? '');
    setActivoRegla(regla.activo);
    setErrorFormRegla(null);
    setMostrarFormRegla(true);
  };

  const handleGuardarRegla = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeEditarReglas) return;

    const patron = patronContraparte.trim();
    if (patron.length < 2) {
      setErrorFormRegla('El patrón de contraparte debe tener al menos 2 caracteres.');
      return;
    }

    const ruc = rucContraparte.trim();
    if (ruc.length > 0 && !/^\d{8,11}$/.test(ruc)) {
      setErrorFormRegla('Si ingresa RUC/Documento, debe tener entre 8 y 11 dígitos.');
      return;
    }

    setErrorFormRegla(null);
    try {
      const payload = {
        patronContraparte: patron,
        rucContraparte: ruc.length > 0 ? ruc : null,
        cuentaContableId: cuentaContableId || null,
        tipoClasificacion: tipoClasificacion || null,
        activo: activoRegla,
      };
      if (reglaEditandoId) {
        await actualizarReglaMutation.mutateAsync({
          reglaId: reglaEditandoId,
          payload,
        });
      } else {
        await crearReglaMutation.mutateAsync(payload);
      }
      setMostrarFormRegla(false);
      resetFormRegla();
    } catch {
      // Notificado vía toast
    }
  };

  const handleToggleActiva = async (regla: ReglaAprendidaV2) => {
    if (!puedeEditarReglas || actualizarReglaMutation.isPending) return;
    try {
      await actualizarReglaMutation.mutateAsync({
        reglaId: regla.id,
        payload: { activo: !regla.activo },
      });
    } catch {
      // Notificado vía toast
    }
  };

  const handleConfirmarEliminar = async (reglaId: string) => {
    if (!puedeEditarReglas || eliminarReglaMutation.isPending) return;
    try {
      await eliminarReglaMutation.mutateAsync(reglaId);
      setConfirmEliminarId(null);
    } catch {
      // Notificado vía toast
    }
  };

  const columnasHistorial: ColumnaTablaDensa<HistorialDesconciliacionV2>[] = useMemo(
    () => [
      {
        key: 'createdAt',
        header: 'Fecha',
        width: '135px',
        render: (r) => (
          <span className="font-mono text-[11px]">
            {r.createdAt.slice(0, 16).replace('T', ' ')}
          </span>
        ),
      },
      {
        key: 'usuario',
        header: 'Usuario',
        width: '165px',
        render: (r) => (
          <span className="text-[11px] text-[#1E3A5F] font-medium truncate block max-w-[155px]">
            {r.usuarioEmail || r.usuarioId || 'Sistema'}
          </span>
        ),
      },
      {
        key: 'motivo',
        header: 'Motivo de Desconciliación',
        render: (r) => <span className="text-[11px] text-[#111827]">{r.motivo}</span>,
      },
      {
        key: 'estadosPrevios',
        header: 'Estados Previos',
        width: '190px',
        render: (r) => (
          <div className="text-[10px] space-y-0.5 font-mono">
            <div>
              <span className="text-[#4B5563]">Banco:</span>{' '}
              <span className="font-bold text-[#111827]">
                {r.estadoAnteriorBanco ?? '—'}
              </span>
            </div>
            <div>
              <span className="text-[#4B5563]">Libro:</span>{' '}
              <span className="font-bold text-[#111827]">
                {r.estadoAnteriorLibro ?? '—'}
              </span>
            </div>
          </div>
        ),
      },
      {
        key: 'snapshot',
        header: 'Montos del Snapshot',
        width: '230px',
        render: (r) => {
          const snap = parsearSnapshot(r.snapshotGrupoJson);
          return (
            <div className="text-[10px] font-mono space-y-0.5">
              <div className="flex items-center gap-1.5">
                {snap.tipoMatch && (
                  <span className="px-1 py-0 bg-[#F5F7FA] border border-[#D1D5DB] font-bold text-[#1E3A5F]">
                    {snap.tipoMatch}
                  </span>
                )}
                <span className="text-[#4B5563]">
                  B:{snap.itemsBancoCount} / L:{snap.itemsLibroCount}
                </span>
              </div>
              <div>
                Banco: <strong>{formatearMonedaExacta(snap.totalBanco, moneda)}</strong> · Lib:{' '}
                <strong>{formatearMonedaExacta(snap.totalLibro, moneda)}</strong>
              </div>
              {snap.diferenciaMonto !== null && (
                <div className="text-[#4B5563]">
                  Dif.: {formatearMonedaExacta(snap.diferenciaMonto, moneda)}
                </div>
              )}
            </div>
          );
        },
      },
    ],
    [moneda]
  );

  const columnasReglas: ColumnaTablaDensa<ReglaAprendidaV2>[] = useMemo(
    () => [
      {
        key: 'patronContraparte',
        header: 'Patrón Contraparte',
        render: (r) => (
          <div>
            <div className="font-bold text-[#111827]">{r.patronContraparte}</div>
            {(r.anexoNombre || r.cuentaContableCodigo) && (
              <div className="text-[10px] text-[#4B5563] font-mono">
                {r.anexoNombre ? `Anexo: ${r.anexoNombre}` : ''}
                {r.anexoNombre && r.cuentaContableCodigo ? ' · ' : ''}
                {r.cuentaContableCodigo ? `PCGE: ${r.cuentaContableCodigo}` : ''}
              </div>
            )}
          </div>
        ),
      },
      {
        key: 'rucContraparte',
        header: 'RUC / Anexo',
        width: '130px',
        render: (r) => (
          <div className="font-mono text-[11px]">
            <div>{r.rucContraparte || '—'}</div>
            {!r.rucContraparte && r.anexoId && (
              <div className="text-[10px] text-[#4B5563] truncate max-w-[115px]">
                ID: {r.anexoId}
              </div>
            )}
          </div>
        ),
      },
      {
        key: 'tipoClasificacion',
        header: 'Tipo Clasificación',
        width: '150px',
        render: (r) =>
          r.tipoClasificacion ? (
            <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold bg-[#EFF6FF] text-[#1E3A5F] border border-[#1E3A5F]">
              {r.tipoClasificacion}
            </span>
          ) : (
            <span className="text-[#9CA3AF] text-[11px]">Sin definir</span>
          ),
      },
      {
        key: 'usosConfirmados',
        header: 'Usos',
        width: '70px',
        align: 'right',
        numeric: true,
        render: (r) => <span className="font-mono font-bold">{r.usosConfirmados}</span>,
      },
      {
        key: 'activo',
        header: 'Estado',
        width: '90px',
        align: 'center',
        render: (r) => (
          <button
            type="button"
            disabled={!puedeEditarReglas || actualizarReglaMutation.isPending}
            onClick={() => void handleToggleActiva(reglaOrFallback(r))}
            className={`px-1.5 py-0.5 text-[10px] font-bold border cursor-pointer disabled:cursor-not-allowed rounded-none ${
              r.activo
                ? 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]'
                : 'bg-[#F3F4F6] text-[#4B5563] border-[#9CA3AF]'
            }`}
          >
            {r.activo ? 'ACTIVA' : 'INACTIVA'}
          </button>
        ),
      },
      {
        key: 'acciones',
        header: 'Acciones',
        width: '140px',
        align: 'center',
        render: (r) =>
          confirmEliminarId === r.id ? (
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                disabled={eliminarReglaMutation.isPending}
                onClick={() => void handleConfirmarEliminar(r.id)}
                className="h-6 px-2 bg-[#B91C1C] hover:bg-[#991B1B] text-[#FFFFFF] text-[10px] font-bold cursor-pointer rounded-none"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setConfirmEliminarId(null)}
                className="h-6 px-1.5 bg-[#FFFFFF] border border-[#D1D5DB] text-[#111827] text-[10px] cursor-pointer rounded-none"
              >
                No
              </button>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                disabled={!puedeEditarReglas}
                onClick={() => abrirEditarRegla(r)}
                title="Editar regla"
                className="h-6 px-2 bg-[#FFFFFF] hover:bg-[#E8ECF1] disabled:opacity-50 text-[#111827] border border-[#D1D5DB] text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed rounded-none"
              >
                <Edit3 className="w-3 h-3" />
                <span>Editar</span>
              </button>
              <button
                type="button"
                disabled={!puedeEditarReglas}
                onClick={() => setConfirmEliminarId(r.id)}
                title="Eliminar regla"
                className="h-6 px-1.5 bg-[#FFFFFF] hover:bg-[#FEF2F2] disabled:opacity-50 text-[#B91C1C] border border-[#D1D5DB] text-[11px] inline-flex items-center cursor-pointer disabled:cursor-not-allowed rounded-none"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ),
      },
    ],
    [
      puedeEditarReglas,
      actualizarReglaMutation.isPending,
      eliminarReglaMutation.isPending,
      confirmEliminarId,
    ]
  );

  return (
    <VentanaModal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Historial de Desconciliaciones y Reglas Aprendidas"
      subtitulo={cuenta ? `${cuenta.banco} (${cuenta.moneda}) · Periodo ${periodo}` : `Periodo ${periodo}`}
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
        {/* Pestañas */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D1D5DB] pb-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTab('HISTORIAL')}
              className={`h-7 px-3 text-[12px] border inline-flex items-center gap-1.5 cursor-pointer rounded-none ${
                tab === 'HISTORIAL'
                  ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F] font-bold'
                  : 'bg-[#F5F7FA] text-[#111827] border-[#D1D5DB] hover:bg-[#E8ECF1]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Historial de Desconciliaciones</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('REGLAS')}
              className={`h-7 px-3 text-[12px] border inline-flex items-center gap-1.5 cursor-pointer rounded-none ${
                tab === 'REGLAS'
                  ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F] font-bold'
                  : 'bg-[#F5F7FA] text-[#111827] border-[#D1D5DB] hover:bg-[#E8ECF1]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Reglas Aprendidas ({reglasQuery.data?.length ?? 0})</span>
            </button>
          </div>

          {tab === 'HISTORIAL' ? (
            <label className="inline-flex items-center gap-1.5 text-[11px] text-[#374151] cursor-pointer">
              <input
                type="checkbox"
                checked={soloCuentaPeriodoActual}
                onChange={(e) => setSoloCuentaPeriodoActual(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#1E3A5F]"
              />
              <span>Filtrar por cuenta y periodo actual ({periodo})</span>
            </label>
          ) : (
            puedeEditarReglas &&
            !mostrarFormRegla && (
              <button
                type="button"
                onClick={abrirNuevaRegla}
                className="h-7 px-2.5 bg-[#1E3A5F] hover:bg-[#162C49] text-[#FFFFFF] border border-[#1E3A5F] text-[12px] inline-flex items-center gap-1 cursor-pointer rounded-none"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nueva Regla Aprendida</span>
              </button>
            )
          )}
        </div>

        {/* Contenido Tab 1: Historial */}
        {tab === 'HISTORIAL' && (
          <TablaDensa
            columnas={columnasHistorial}
            datos={historialQuery.data ?? []}
            rowKey={(r) => r.id}
            cargando={historialQuery.isLoading}
            mensajeError={
              historialQuery.error
                ? extraerMensajeErrorConciliacion(
                    historialQuery.error,
                    'No se pudo cargar el historial de desconciliaciones.'
                  )
                : null
            }
            mensajeVacio="No existen eventos de desconciliación registrados para el filtro seleccionado."
          />
        )}

        {/* Contenido Tab 2: Reglas Aprendidas */}
        {tab === 'REGLAS' && (
          <div className="space-y-3">
            {mostrarFormRegla && (
              <form
                onSubmit={handleGuardarRegla}
                className="p-3 bg-[#F5F7FA] border border-[#1E3A5F] space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[12px] text-[#1E3A5F]">
                    {reglaEditandoId ? 'Editar Regla Aprendida' : 'Nueva Regla Aprendida'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMostrarFormRegla(false);
                      resetFormRegla();
                    }}
                    className="text-[#4B5563] hover:text-[#111827] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {errorFormRegla && (
                  <div className="p-2 bg-[#FEF2F2] border border-[#B91C1C] text-[#B91C1C] text-[11px]">
                    {errorFormRegla}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-[#374151] mb-1">
                      Patrón Contraparte *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={200}
                      value={patronContraparte}
                      onChange={(e) => setPatronContraparte(e.target.value)}
                      placeholder="Ej. TELEFONICA DEL PERU / SUNAT / PROVEEDOR"
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] focus:outline-none focus:border-[#1E3A5F] rounded-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#374151] mb-1">
                      RUC / Documento (Opcional)
                    </label>
                    <input
                      type="text"
                      maxLength={11}
                      value={rucContraparte}
                      onChange={(e) => setRucContraparte(e.target.value)}
                      placeholder="20100017491"
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] font-mono focus:outline-none focus:border-[#1E3A5F] rounded-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#374151] mb-1">
                      Tipo Clasificación
                    </label>
                    <select
                      value={tipoClasificacion}
                      onChange={(e) =>
                        setTipoClasificacion(e.target.value as TipoClasificacionExtracto | '')
                      }
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] focus:outline-none focus:border-[#1E3A5F] rounded-none"
                    >
                      <option value="">-- Sin definir --</option>
                      {TIPOS_CLASIFICACION_EXTRACTO.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-[#374151] mb-1">
                      Cuenta Contable Sugerida (Opcional)
                    </label>
                    <select
                      value={cuentaContableId}
                      onChange={(e) => setCuentaContableId(e.target.value)}
                      disabled={cuentasContablesQuery.isLoading}
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] focus:outline-none focus:border-[#1E3A5F] rounded-none"
                    >
                      <option value="">-- Sin cuenta contable fija --</option>
                      {(cuentasContablesQuery.data ?? []).map((pc) => (
                        <option key={pc.id} value={pc.id}>
                          {pc.codigo} - {pc.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-1.5 text-[12px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activoRegla}
                        onChange={(e) => setActivoRegla(e.target.checked)}
                        className="w-3.5 h-3.5 accent-[#1E3A5F]"
                      />
                      <span>Regla activa</span>
                    </label>

                    <button
                      type="submit"
                      disabled={
                        crearReglaMutation.isPending || actualizarReglaMutation.isPending
                      }
                      className="h-7 px-3 bg-[#1E3A5F] hover:bg-[#162C49] disabled:bg-[#E5E7EB] text-[#FFFFFF] border border-[#1E3A5F] text-[12px] inline-flex items-center gap-1 cursor-pointer rounded-none"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>
                        {crearReglaMutation.isPending || actualizarReglaMutation.isPending
                          ? 'Guardando...'
                          : 'Guardar'}
                      </span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            <TablaDensa
              columnas={columnasReglas}
              datos={reglasQuery.data ?? []}
              rowKey={(r) => r.id}
              cargando={reglasQuery.isLoading}
              mensajeError={
                reglasQuery.error
                  ? extraerMensajeErrorConciliacion(
                      reglasQuery.error,
                      'No se pudieron cargar las reglas aprendidas.'
                    )
                  : null
              }
              mensajeVacio="No hay reglas aprendidas registradas todavía. Puede crearlas aquí o al conciliar manualmente."
            />
          </div>
        )}
      </div>
    </VentanaModal>
  );
};

function reglaOrFallback(r: ReglaAprendidaV2): ReglaAprendidaV2 {
  return r;
}
