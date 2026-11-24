import React, { useEffect, useMemo, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Lock,
  Settings,
  ShieldAlert,
  Unlock,
  Unlink,
} from 'lucide-react';
import {
  ESTADOS_CONCILIACION_V2,
  type EstadoConciliacionV2,
  type EstadoLibroV2,
  type PartidaExtractoV2,
  type PartidaLibroV2,
  type SemaforoConciliacion,
} from '../../api/conciliacionV2Api';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { useToast } from '../../context/ToastContext';
import {
  extraerMensajeErrorConciliacion,
  useCerrarConciliacionV2,
  useConciliacionV2Config,
  useConciliarPartidaV2,
  useCuentasBancariasV2,
  useCuentasContablesDisponiblesV2,
  useDesconciliarPartidaV2,
  useReabrirConciliacionV2,
  useResumenConciliacionV2,
  useVincularCuentaContableV2,
} from '../../hooks/useConciliacionV2';
import { ConfigConciliacionV2Modal } from '../conciliacion/ConfigConciliacionV2Modal';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';
import { ColumnaTablaDensa, TablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';

type TabPartidas = 'EXTRACTO' | 'LIBROS';

const ETIQUETAS_ESTADO_V2: Record<EstadoConciliacionV2, string> = {
  CONCILIADO: 'CONCILIADO',
  CONCILIADO_MANUAL: 'CONCILIADO_MANUAL',
  SUGERIDO: 'SUGERIDO',
  PENDIENTE_LIBROS: 'PENDIENTE_LIBROS',
  PENDIENTE_BANCO: 'PENDIENTE_BANCO',
  CHEQUE_NO_COBRADO: 'CHEQUE_NO_COBRADO',
  CARGO_BANCARIO_ITF: 'CARGO_BANCARIO_ITF',
  DIFERENCIA_IMPORTE: 'DIFERENCIA_IMPORTE',
  DUPLICADO: 'DUPLICADO',
};

function formatearMoneda(valor: string | null | undefined, moneda = 'PEN'): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  const dec = new Decimal(valor);
  const fijo = dec.toFixed(2);
  const negativo = fijo.startsWith('-');
  const absoluto = negativo ? fijo.slice(1) : fijo;
  const [entero, decimales] = absoluto.split('.');
  const enteroFormateado = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const simbolo = moneda === 'USD' ? 'US$' : 'S/';
  return `${negativo ? '-' : ''}${simbolo} ${enteroFormateado}.${decimales}`;
}

function esCeroExacto(valor: string | null | undefined): boolean {
  if (valor === null || valor === undefined || valor === '') return false;
  try {
    return new Decimal(valor).eq(0);
  } catch {
    return false;
  }
}

function claseBadgeEstadoExtracto(estado: EstadoConciliacionV2): string {
  switch (estado) {
    case 'CONCILIADO':
    case 'CONCILIADO_MANUAL':
      return 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]';
    case 'SUGERIDO':
      return 'bg-[#EFF6FF] text-[#1E3A5F] border-[#1E3A5F]';
    case 'DIFERENCIA_IMPORTE':
    case 'DUPLICADO':
      return 'bg-[#FEF2F2] text-[#B91C1C] border-[#B91C1C]';
    case 'CARGO_BANCARIO_ITF':
    case 'CHEQUE_NO_COBRADO':
    case 'PENDIENTE_LIBROS':
    case 'PENDIENTE_BANCO':
    default:
      return 'bg-[#FEF3C7] text-[#B45309] border-[#B45309]';
  }
}

function claseBadgeEstadoLibro(estado: EstadoLibroV2): string {
  switch (estado) {
    case 'CONCILIADO':
      return 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]';
    case 'CHEQUE_NO_COBRADO':
    case 'PENDIENTE_BANCO':
    default:
      return 'bg-[#FEF3C7] text-[#B45309] border-[#B45309]';
  }
}

function infoSemaforo(semaforo: SemaforoConciliacion, toleranciaMonto: string): {
  etiqueta: string;
  clase: string;
} {
  switch (semaforo) {
    case 'VERDE':
      return {
        etiqueta: 'VERDE · Cuadrado (0.00)',
        clase: 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]',
      };
    case 'AMARILLO':
      return {
        etiqueta: `AMARILLO · Dentro de tolerancia (${toleranciaMonto})`,
        clase: 'bg-[#FEF3C7] text-[#B45309] border-[#B45309]',
      };
    case 'ROJO':
      return {
        etiqueta: 'ROJO · Descuadrado',
        clase: 'bg-[#FEF2F2] text-[#B91C1C] border-[#B91C1C]',
      };
    case 'SIN_EXTRACTO':
    default:
      return {
        etiqueta: 'SIN_EXTRACTO · Falta extracto en el periodo',
        clase: 'bg-[#F3F4F6] text-[#4B5563] border-[#9CA3AF]',
      };
  }
}

export const ConciliacionBancariaV2View: React.FC = () => {
  const {
    empresaId,
    empresaActiva,
    periodo,
    setPeriodo,
    usuario,
    verificarPermiso,
  } = useEmpresaPeriodo();
  const toast = useToast();

  const esAdministrador =
    usuario.rolGlobal === 'ADMINISTRADOR' && verificarPermiso(['ADMINISTRADOR']);
  const puedeVincularContable = verificarPermiso(['ADMINISTRADOR', 'CONTADOR']);
  const puedeOperarPartidas = verificarPermiso(['ADMINISTRADOR', 'CONTADOR', 'ASISTENTE']);
  const puedeCerrar = verificarPermiso(['ADMINISTRADOR', 'CONTADOR']);
  const puedeReabrir = verificarPermiso(['ADMINISTRADOR']);

  const [cuentaSeleccionadaId, setCuentaSeleccionadaId] = useState<string>('');
  const [tabActiva, setTabActiva] = useState<TabPartidas>('EXTRACTO');
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');
  const [textoBusqueda, setTextoBusqueda] = useState<string>('');

  // Estado para vinculación contable obligatoria
  const [cuentaContableSelectId, setCuentaContableSelectId] = useState<string>('');
  const [cciInput, setCciInput] = useState<string>('');

  // Modales locales
  const [modalConfigAbierto, setModalConfigAbierto] = useState(false);
  const [partidaParaConciliar, setPartidaParaConciliar] = useState<PartidaExtractoV2 | null>(null);
  const [movimientoVinculoId, setMovimientoVinculoId] = useState<string>('');
  const [observacionConciliacion, setObservacionConciliacion] = useState<string>('');
  const [partidaParaDesconciliar, setPartidaParaDesconciliar] = useState<PartidaExtractoV2 | null>(
    null
  );
  const [motivoDesconciliar, setMotivoDesconciliar] = useState<string>('');
  const [modalReabrirAbierto, setModalReabrirAbierto] = useState(false);
  const [motivoReapertura, setMotivoReapertura] = useState<string>('');

  // Queries
  const configQuery = useConciliacionV2Config(empresaId);
  const cuentasQuery = useCuentasBancariasV2(empresaId);
  const cuentas = cuentasQuery.data ?? [];

  useEffect(() => {
    if (cuentas.length === 0) {
      setCuentaSeleccionadaId('');
      return;
    }
    const existeActual = cuentas.some((c) => c.id === cuentaSeleccionadaId);
    if (!existeActual) {
      const primeraActiva = cuentas.find((c) => c.activa) ?? cuentas[0];
      setCuentaSeleccionadaId(primeraActiva.id);
    }
  }, [cuentas, cuentaSeleccionadaId]);

  const cuentaSeleccionada = useMemo(
    () => cuentas.find((c) => c.id === cuentaSeleccionadaId) ?? null,
    [cuentas, cuentaSeleccionadaId]
  );

  const requiereVinculacion = Boolean(
    cuentaSeleccionada &&
      (cuentaSeleccionada.requiereVinculacionContable || cuentaSeleccionada.cuentaContableId === null)
  );

  const cuentasContablesQuery = useCuentasContablesDisponiblesV2(
    empresaId,
    Boolean(empresaId && requiereVinculacion)
  );

  const resumenQuery = useResumenConciliacionV2(empresaId, cuentaSeleccionadaId || null, periodo);
  const resumen = resumenQuery.data ?? null;

  // Sincronizar campos de vinculación al cambiar de cuenta
  useEffect(() => {
    setCuentaContableSelectId('');
    setCciInput(cuentaSeleccionada?.cci ?? '');
  }, [cuentaSeleccionada?.id, cuentaSeleccionada?.cci]);

  // Notificar errores reales de queries sin duplicar por el mismo mensaje
  const ultimoErrorReportadoRef = useRef<string | null>(null);
  useEffect(() => {
    const err = cuentasQuery.error || resumenQuery.error || cuentasContablesQuery.error;
    if (!err) {
      ultimoErrorReportadoRef.current = null;
      return;
    }
    const msg = extraerMensajeErrorConciliacion(err, 'Error cargando datos de Conciliación V2.');
    if (ultimoErrorReportadoRef.current !== msg) {
      ultimoErrorReportadoRef.current = msg;
      toast.error(msg, 'Conciliación Bancaria V2');
    }
  }, [cuentasQuery.error, resumenQuery.error, cuentasContablesQuery.error, toast]);

  // Mutaciones
  const vincularMutation = useVincularCuentaContableV2(empresaId);
  const conciliarMutation = useConciliarPartidaV2(empresaId);
  const desconciliarMutation = useDesconciliarPartidaV2(empresaId);
  const cerrarMutation = useCerrarConciliacionV2(empresaId);
  const reabrirMutation = useReabrirConciliacionV2(empresaId);

  const periodoEstado = resumen?.conciliacionPeriodo.estado ?? 'ABIERTA';
  const conciliacionCerrada = periodoEstado === 'CERRADA';
  const monedaCuenta = resumen?.cuenta.moneda ?? cuentaSeleccionada?.moneda ?? 'PEN';

  const operacionesBloqueadas =
    requiereVinculacion || conciliacionCerrada || !puedeOperarPartidas;

  // Movimientos de libros disponibles para vincular manualmente
  const movimientosLibrosDisponibles = useMemo(() => {
    if (!resumen) return [];
    return resumen.movimientosLibros.filter((m) => !m.conciliado && m.estado !== 'ANULADO');
  }, [resumen]);

  // Filtrado por los 9 estados + búsqueda
  const extractoFiltrado = useMemo(() => {
    const lineas = resumen?.extractoLineas ?? [];
    const q = textoBusqueda.trim().toLowerCase();
    return lineas.filter((l) => {
      if (filtroEstado !== 'TODOS' && l.estadoConciliacion !== filtroEstado) return false;
      if (!q) return true;
      return (
        l.descripcion.toLowerCase().includes(q) ||
        (l.referencia ?? '').toLowerCase().includes(q) ||
        l.fecha.includes(q) ||
        l.monto.includes(q)
      );
    });
  }, [resumen?.extractoLineas, filtroEstado, textoBusqueda]);

  const librosFiltrado = useMemo(() => {
    const movs = resumen?.movimientosLibros ?? [];
    const q = textoBusqueda.trim().toLowerCase();
    return movs.filter((m) => {
      if (filtroEstado !== 'TODOS' && m.estadoLibroV2 !== filtroEstado) return false;
      if (!q) return true;
      return (
        m.glosa.toLowerCase().includes(q) ||
        (m.numeroOperacion ?? '').toLowerCase().includes(q) ||
        m.fecha.includes(q) ||
        m.importe.includes(q)
      );
    });
  }, [resumen?.movimientosLibros, filtroEstado, textoBusqueda]);

  const handleRefrescar = () => {
    void configQuery.refetch();
    void cuentasQuery.refetch();
    if (cuentaSeleccionadaId) {
      void resumenQuery.refetch();
    }
  };

  const handleVincularCuenta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cuentaSeleccionada || !cuentaContableSelectId || !puedeVincularContable) return;
    try {
      await vincularMutation.mutateAsync({
        cuentaId: cuentaSeleccionada.id,
        payload: {
          cuentaContableId: cuentaContableSelectId,
          cci: cciInput.trim() ? cciInput.trim() : null,
        },
      });
    } catch {
      // Notificado por toast en el hook
    }
  };

  const abrirModalConciliar = (partida: PartidaExtractoV2) => {
    setPartidaParaConciliar(partida);
    setMovimientoVinculoId(partida.movimientoTesoreriaId ?? '');
    setObservacionConciliacion(partida.observacionConciliacion ?? '');
  };

  const handleConfirmarConciliar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partidaParaConciliar) return;
    try {
      await conciliarMutation.mutateAsync({
        extractoLineaId: partidaParaConciliar.id,
        movimientoTesoreriaId: movimientoVinculoId || null,
        estadoConciliacion: 'CONCILIADO_MANUAL',
        observacion: observacionConciliacion.trim() ? observacionConciliacion.trim() : null,
      });
      setPartidaParaConciliar(null);
    } catch {
      // Notificado por toast en el hook
    }
  };

  const handleConfirmarDesconciliar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partidaParaDesconciliar) return;
    try {
      await desconciliarMutation.mutateAsync({
        extractoLineaId: partidaParaDesconciliar.id,
        motivo: motivoDesconciliar.trim() ? motivoDesconciliar.trim() : null,
      });
      setPartidaParaDesconciliar(null);
      setMotivoDesconciliar('');
    } catch {
      // Notificado por toast en el hook
    }
  };

  const puedeEjecutarCierre = Boolean(
    resumen &&
      !requiereVinculacion &&
      resumen.tieneExtracto &&
      !conciliacionCerrada &&
      esCeroExacto(resumen.diferencia) &&
      puedeCerrar
  );

  const handleCerrarConciliacion = async () => {
    if (!resumen || !puedeEjecutarCierre) return;
    try {
      await cerrarMutation.mutateAsync({
        cuentaFinancieraId: resumen.cuenta.id,
        periodo: resumen.periodo,
        fechaCorte: resumen.fechaFin,
      });
    } catch {
      // Notificado por toast en el hook
    }
  };

  const handleConfirmarReapertura = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resumen || !puedeReabrir) return;
    if (motivoReapertura.trim().length < 5) {
      toast.warning('El motivo de reapertura debe tener al menos 5 caracteres.', 'Reapertura');
      return;
    }
    try {
      await reabrirMutation.mutateAsync({
        cuentaFinancieraId: resumen.cuenta.id,
        periodo: resumen.periodo,
        motivo: motivoReapertura.trim(),
      });
      setModalReabrirAbierto(false);
      setMotivoReapertura('');
    } catch {
      // Notificado por toast en el hook
    }
  };

  const columnasExtracto: ColumnaTablaDensa<PartidaExtractoV2>[] = [
    {
      key: 'fecha',
      header: 'Fecha',
      width: '90px',
      render: (r) => <span className="font-mono">{r.fecha}</span>,
    },
    {
      key: 'referencia',
      header: 'Referencia',
      width: '120px',
      render: (r) => <span className="font-mono text-[#1E3A5F]">{r.referencia || '—'}</span>,
    },
    {
      key: 'descripcion',
      header: 'Descripción Extracto Bancario',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate">{r.descripcion}</div>
          {r.observacionConciliacion && (
            <div className="text-[10px] text-[#4B5563] truncate">Obs: {r.observacionConciliacion}</div>
          )}
        </div>
      ),
    },
    {
      key: 'estadoConciliacion',
      header: 'Estado V2',
      width: '165px',
      render: (r) => (
        <span
          className={`inline-block px-1.5 py-0.5 text-[10px] font-bold border ${claseBadgeEstadoExtracto(
            r.estadoConciliacion
          )}`}
        >
          {ETIQUETAS_ESTADO_V2[r.estadoConciliacion]}
        </span>
      ),
    },
    {
      key: 'monto',
      header: `Monto (${monedaCuenta})`,
      width: '120px',
      align: 'right',
      numeric: true,
      render: (r) => {
        const neg = new Decimal(r.monto).lt(0);
        return (
          <span className={`font-mono font-bold ${neg ? 'text-[#B91C1C]' : 'text-[#1E6F42]'}`}>
            {formatearMoneda(r.monto, monedaCuenta)}
          </span>
        );
      },
    },
    {
      key: 'diferenciaImporte',
      header: 'Dif. Importe',
      width: '100px',
      align: 'right',
      numeric: true,
      render: (r) => (
        <span className="font-mono text-[#4B5563]">
          {formatearMoneda(r.diferenciaImporte, monedaCuenta)}
        </span>
      ),
    },
    {
      key: 'acciones',
      header: 'Acción',
      width: '130px',
      align: 'center',
      render: (r) =>
        r.conciliada ? (
          <button
            type="button"
            disabled={operacionesBloqueadas || desconciliarMutation.isPending}
            onClick={(e) => {
              e.stopPropagation();
              setPartidaParaDesconciliar(r);
              setMotivoDesconciliar('');
            }}
            title={
              requiereVinculacion
                ? 'Vincule una cuenta contable del Plan de Cuentas primero'
                : conciliacionCerrada
                ? 'Conciliación cerrada'
                : !puedeOperarPartidas
                ? 'Solo lectura para rol AUDITOR'
                : 'Desconciliar partida'
            }
            className="h-6 px-2 bg-[#FFFFFF] hover:bg-[#FEF2F2] text-[#B91C1C] border border-[#D1D5DB] text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed rounded-none"
          >
            <Unlink className="w-3 h-3" />
            <span>Desconciliar</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={operacionesBloqueadas || conciliarMutation.isPending}
            onClick={(e) => {
              e.stopPropagation();
              abrirModalConciliar(r);
            }}
            title={
              requiereVinculacion
                ? 'Vincule una cuenta contable del Plan de Cuentas primero'
                : conciliacionCerrada
                ? 'Conciliación cerrada'
                : !puedeOperarPartidas
                ? 'Solo lectura para rol AUDITOR'
                : 'Conciliar manualmente'
            }
            className="h-6 px-2 bg-[#1E3A5F] hover:bg-[#162C49] text-[#FFFFFF] border border-[#1E3A5F] text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] disabled:border-[#D1D5DB] disabled:cursor-not-allowed rounded-none"
          >
            <Link2 className="w-3 h-3" />
            <span>Conciliar manual</span>
          </button>
        ),
    },
  ];

  const columnasLibros: ColumnaTablaDensa<PartidaLibroV2>[] = [
    {
      key: 'fecha',
      header: 'Fecha',
      width: '90px',
      render: (r) => <span className="font-mono">{r.fecha}</span>,
    },
    {
      key: 'tipo',
      header: 'Tipo / Medio',
      width: '140px',
      render: (r) => (
        <span className="font-mono text-[11px]">
          {r.tipo} · {r.medioPago}
        </span>
      ),
    },
    {
      key: 'numeroOperacion',
      header: 'N° Operación',
      width: '120px',
      render: (r) => <span className="font-mono text-[#1E3A5F]">{r.numeroOperacion || '—'}</span>,
    },
    {
      key: 'glosa',
      header: 'Glosa / Movimiento Tesorería',
      render: (r) => r.glosa,
    },
    {
      key: 'estadoLibroV2',
      header: 'Estado Libro V2',
      width: '165px',
      render: (r) => (
        <span
          className={`inline-block px-1.5 py-0.5 text-[10px] font-bold border ${claseBadgeEstadoLibro(
            r.estadoLibroV2
          )}`}
        >
          {r.estadoLibroV2}
        </span>
      ),
    },
    {
      key: 'importeConSigno',
      header: `Importe (${monedaCuenta})`,
      width: '125px',
      align: 'right',
      numeric: true,
      render: (r) => {
        const neg = new Decimal(r.importeConSigno).lt(0);
        return (
          <span className={`font-mono font-bold ${neg ? 'text-[#B91C1C]' : 'text-[#1E6F42]'}`}>
            {formatearMoneda(r.importeConSigno, monedaCuenta)}
          </span>
        );
      },
    },
  ];

  if (!empresaId) {
    return (
      <div className="p-4 bg-[#FFFFFF] border border-[#D1D5DB] text-[#4B5563] text-[12px]">
        Seleccione una empresa activa para acceder a la Conciliación Bancaria V2.
      </div>
    );
  }

  const semaforoInfo = resumen
    ? infoSemaforo(resumen.semaforo, resumen.toleranciaMonto)
    : null;

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF] text-[#111827]">
      <BarraHerramientasLocal
        titulo="Conciliación Bancaria V2"
        subtitulo="Cruce de Extracto Bancario, Tesorería y Control de Integridad Mayor 104x"
        onRefrescar={handleRefrescar}
        acciones={[
          ...(esAdministrador
            ? [
                {
                  id: 'config-v2',
                  label: 'Configuración V2',
                  icono: Settings,
                  onClick: () => setModalConfigAbierto(true),
                },
              ]
            : []),
          ...(!conciliacionCerrada
            ? [
                {
                  id: 'cerrar-conciliacion',
                  label: cerrarMutation.isPending ? 'Cerrando...' : 'Cerrar Conciliación',
                  icono: Lock,
                  primario: true,
                  disabled: !puedeEjecutarCierre || cerrarMutation.isPending,
                  onClick: handleCerrarConciliacion,
                },
              ]
            : []),
          ...(conciliacionCerrada && puedeReabrir
            ? [
                {
                  id: 'reabrir-conciliacion',
                  label: 'Reabrir Conciliación',
                  icono: Unlock,
                  onClick: () => setModalReabrirAbierto(true),
                },
              ]
            : []),
        ]}
        derecha={
          <SelectorPeriodo
            periodo={periodo}
            onChange={setPeriodo}
            cerrado={conciliacionCerrada}
            empresaRuc={empresaActiva?.ruc}
            empresaRazonSocial={empresaActiva?.razonSocial}
          />
        }
      />

      {/* Barra selectora de cuenta bancaria + estado del periodo */}
      <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] flex flex-wrap items-center justify-between gap-3 text-[12px]">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <label htmlFor="select-cuenta-v2" className="font-bold text-[#1E3A5F] shrink-0">
            Cuenta Bancaria:
          </label>
          <select
            id="select-cuenta-v2"
            value={cuentaSeleccionadaId}
            onChange={(e) => setCuentaSeleccionadaId(e.target.value)}
            disabled={cuentasQuery.isLoading || cuentas.length === 0}
            className="h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] min-w-[320px] max-w-full focus:outline-none focus:border-[#1E3A5F] rounded-none"
          >
            {cuentas.length === 0 ? (
              <option value="">
                {cuentasQuery.isLoading ? 'Cargando cuentas...' : 'Sin cuentas financieras registradas'}
              </option>
            ) : (
              cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.banco} ({c.moneda}) · N° {c.numero}
                  {c.cci ? ` · CCI ${c.cci}` : ''}
                  {c.requiereVinculacionContable
                    ? ' [FALTA VINCULAR PCGE]'
                    : ` [PCGE ${c.cuentaContableCodigo}]`}
                </option>
              ))
            )}
          </select>

          {cuentaSeleccionada && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="px-1.5 py-0.5 bg-[#FFFFFF] border border-[#D1D5DB] font-mono">
                {cuentaSeleccionada.moneda} · N° {cuentaSeleccionada.numero}
              </span>
              {cuentaSeleccionada.cci && (
                <span className="px-1.5 py-0.5 bg-[#FFFFFF] border border-[#D1D5DB] font-mono">
                  CCI: {cuentaSeleccionada.cci}
                </span>
              )}
              {requiereVinculacion ? (
                <span className="px-1.5 py-0.5 bg-[#FEF2F2] text-[#B91C1C] border border-[#B91C1C] font-bold">
                  Falta vinculación contable
                </span>
              ) : (
                <span className="px-1.5 py-0.5 bg-[#ECFDF5] text-[#1E6F42] border border-[#1E6F42] font-mono">
                  PCGE: {cuentaSeleccionada.cuentaContableCodigo}
                  {cuentaSeleccionada.cuentaContableNombre
                    ? ` - ${cuentaSeleccionada.cuentaContableNombre}`
                    : ''}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-[#4B5563]">Estado Conciliación:</span>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold border ${
              conciliacionCerrada
                ? 'bg-[#FEF2F2] text-[#B91C1C] border-[#B91C1C]'
                : 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]'
            }`}
          >
            {conciliacionCerrada ? <Lock className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
            {periodoEstado}
          </span>
        </div>
      </div>

      {/* Errores explícitos de servidor */}
      {(cuentasQuery.error || resumenQuery.error) && (
        <div className="mx-3 mt-2 p-2.5 bg-[#FEF2F2] border border-[#B91C1C] text-[#991B1B] text-[12px] flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <strong>Error del servidor:</strong>{' '}
            {extraerMensajeErrorConciliacion(
              cuentasQuery.error || resumenQuery.error,
              'Error consultando Conciliación Bancaria V2.'
            )}
          </div>
        </div>
      )}

      {/* Alerta bloqueante de vinculación obligatoria a cuenta real del plan_cuentas */}
      {cuentaSeleccionada && requiereVinculacion && (
        <div className="mx-3 mt-2 p-3 bg-[#FEF3C7] border-2 border-[#B91C1C] text-[#7C2D12] text-[12px]">
          <div className="flex items-start gap-2 mb-2">
            <ShieldAlert className="w-4 h-4 text-[#B91C1C] shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-[#B91C1C]">
                Vinculación Contable Obligatoria Requerida ({cuentaSeleccionada.banco} ·{' '}
                {cuentaSeleccionada.numero})
              </div>
              <div className="text-[11px] text-[#7C2D12]">
                Esta cuenta bancaria aún no está vinculada a una cuenta real del Plan de Cuentas (
                <code className="font-mono">plan_cuentas</code>). Las acciones de conciliar,
                desconciliar, cerrar y generar asientos permanecerán deshabilitadas hasta completar la
                vinculación.
              </div>
            </div>
          </div>

          {cuentasContablesQuery.error && (
            <div className="mb-2 p-1.5 bg-[#FEF2F2] border border-[#B91C1C] text-[#B91C1C] text-[11px]">
              {extraerMensajeErrorConciliacion(
                cuentasContablesQuery.error,
                'No se pudieron cargar las cuentas contables disponibles.'
              )}
            </div>
          )}

          <form onSubmit={handleVincularCuenta} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[260px]">
              <label className="block text-[11px] font-bold text-[#111827] mb-1">
                Cuenta Contable Real (PCGE 104x / 10x) *
              </label>
              <select
                required
                value={cuentaContableSelectId}
                onChange={(e) => setCuentaContableSelectId(e.target.value)}
                disabled={!puedeVincularContable || cuentasContablesQuery.isLoading || vincularMutation.isPending}
                className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] text-[#111827] focus:outline-none focus:border-[#1E3A5F] disabled:bg-[#F3F4F6] rounded-none"
              >
                <option value="">
                  {cuentasContablesQuery.isLoading
                    ? 'Cargando plan de cuentas...'
                    : '-- Seleccione cuenta contable del Plan de Cuentas --'}
                </option>
                {(cuentasContablesQuery.data ?? []).map((pc) => (
                  <option key={pc.id} value={pc.id}>
                    {pc.codigo} - {pc.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-56">
              <label className="block text-[11px] font-bold text-[#111827] mb-1">
                CCI (Opcional, máx. 30 car.)
              </label>
              <input
                type="text"
                maxLength={30}
                value={cciInput}
                onChange={(e) => setCciInput(e.target.value)}
                disabled={!puedeVincularContable || vincularMutation.isPending}
                placeholder="002-191-000000000000-00"
                className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] font-mono text-[#111827] focus:outline-none focus:border-[#1E3A5F] disabled:bg-[#F3F4F6] rounded-none"
              />
            </div>

            <button
              type="submit"
              disabled={
                !puedeVincularContable ||
                !cuentaContableSelectId ||
                vincularMutation.isPending
              }
              title={
                puedeVincularContable
                  ? 'Vincular cuenta bancaria al Plan Contable'
                  : 'Requiere rol ADMINISTRADOR o CONTADOR'
              }
              className="h-7 px-3 bg-[#1E3A5F] hover:bg-[#162C49] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-[#FFFFFF] border border-[#1E3A5F] disabled:border-[#D1D5DB] text-[12px] font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed rounded-none"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>{vincularMutation.isPending ? 'Vinculando...' : 'Vincular cuenta contable'}</span>
            </button>
          </form>
        </div>
      )}

      {/* Tarjetas resumen + Desglose de fórmula */}
      {resumen && (
        <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-[12px]">
            <div className="p-2 bg-[#FFFFFF] border border-[#D1D5DB]">
              <div className="text-[11px] text-[#4B5563]">Saldo Inicial Extracto</div>
              <div className="font-mono font-bold text-[#111827] mt-0.5">
                {resumen.saldoInicialExtracto !== null
                  ? formatearMoneda(resumen.saldoInicialExtracto, monedaCuenta)
                  : 'Sin extracto'}
              </div>
            </div>

            <div className="p-2 bg-[#FFFFFF] border border-[#D1D5DB]">
              <div className="text-[11px] text-[#4B5563]">Saldo Final Extracto</div>
              <div className="font-mono font-bold text-[#111827] mt-0.5">
                {resumen.saldoFinalExtracto !== null
                  ? formatearMoneda(resumen.saldoFinalExtracto, monedaCuenta)
                  : 'Sin extracto'}
              </div>
            </div>

            <div className="p-2 bg-[#FFFFFF] border border-[#D1D5DB]">
              <div className="text-[11px] text-[#4B5563]">Saldo Libros (Tesorería)</div>
              <div className="font-mono font-bold text-[#1E3A5F] mt-0.5">
                {formatearMoneda(resumen.saldoLibros, monedaCuenta)}
              </div>
            </div>

            <div
              className={`p-2 border ${
                resumen.integridadMayor.alertaIntegridad
                  ? 'bg-[#FEF2F2] border-[#B91C1C]'
                  : 'bg-[#FFFFFF] border-[#D1D5DB]'
              }`}
            >
              <div className="text-[11px] text-[#4B5563] flex items-center justify-between gap-1">
                <span>Saldo Mayor 104x</span>
                {resumen.integridadMayor.cuentaContableCodigo && (
                  <span className="font-mono text-[10px] text-[#1E3A5F]">
                    ({resumen.integridadMayor.cuentaContableCodigo})
                  </span>
                )}
              </div>
              <div className="font-mono font-bold text-[#111827] mt-0.5">
                {resumen.integridadMayor.saldoMayor104x !== null
                  ? formatearMoneda(resumen.integridadMayor.saldoMayor104x, monedaCuenta)
                  : 'Sin vincular'}
              </div>
              {resumen.integridadMayor.alertaIntegridad && (
                <div className="mt-1 text-[10px] text-[#B91C1C] font-bold flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>
                    Alerta integridad (Dif:{' '}
                    {formatearMoneda(
                      resumen.integridadMayor.diferenciaIntegridadMayor,
                      monedaCuenta
                    )}
                    ){resumen.integridadMayor.motivoAlerta ? ` — ${resumen.integridadMayor.motivoAlerta}` : ''}
                  </span>
                </div>
              )}
            </div>

            <div className="p-2 bg-[#E8ECF1] border border-[#D1D5DB]">
              <div className="text-[11px] font-bold text-[#111827] flex items-center justify-between gap-1">
                <span>Diferencia y Semáforo</span>
              </div>
              <div className="font-mono font-bold text-[#1E3A5F] mt-0.5">
                {resumen.diferencia !== null
                  ? formatearMoneda(resumen.diferencia, monedaCuenta)
                  : 'Sin extracto'}
              </div>
              {semaforoInfo && (
                <span
                  className={`mt-1 inline-block px-1.5 py-0.5 text-[10px] font-bold border ${semaforoInfo.clase}`}
                >
                  {semaforoInfo.etiqueta}
                </span>
              )}
            </div>
          </div>

          {/* Fórmula acordada explícita */}
          <div className="p-2 bg-[#FFFFFF] border border-[#D1D5DB] flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-[#1E3A5F]">Fórmula:</span>
              <span className="font-mono">
                Extracto ({resumen.saldoFinalExtracto ?? 'Sin extracto'})
              </span>
              <span className="text-[#1E6F42] font-mono">
                (+ Depósitos en tránsito: {formatearMoneda(resumen.depositosEnTransito, monedaCuenta)})
              </span>
              <span className="text-[#B91C1C] font-mono">
                (− Cheques no cobrados: {formatearMoneda(resumen.chequesNoCobrados, monedaCuenta)})
              </span>
              <span className="font-bold text-[#111827]">
                = {resumen.saldoAjustadoBanco !== null ? formatearMoneda(resumen.saldoAjustadoBanco, monedaCuenta) : '—'}
              </span>
              <span className="px-1 font-bold text-[#1E3A5F]">vs</span>
              <span className="font-mono">
                Libros ({formatearMoneda(resumen.saldoLibros, monedaCuenta)})
              </span>
              <span className="text-[#1E6F42] font-mono">
                (+ Abonos no registrados: {formatearMoneda(resumen.abonosNoRegistrados, monedaCuenta)})
              </span>
              <span className="text-[#B91C1C] font-mono">
                (− Cargos no registrados: {formatearMoneda(resumen.cargosNoRegistrados, monedaCuenta)})
              </span>
              <span className="font-bold text-[#111827]">
                = {formatearMoneda(resumen.saldoAjustadoLibros, monedaCuenta)}
              </span>
            </div>

            <div className="text-[10px] text-[#4B5563] font-mono">
              Extracto: {resumen.conteos.conciliadasExtracto}/{resumen.conteos.totalExtracto} conc. · Libros:{' '}
              {resumen.conteos.conciliadosLibros}/{resumen.conteos.totalLibros} conc.
            </div>
          </div>
        </div>
      )}

      {/* Barra de tabs y filtro por los 9 estados ampliados */}
      <div className="px-3 pt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTabActiva('EXTRACTO')}
            className={`h-7 px-3 text-[12px] border cursor-pointer rounded-none ${
              tabActiva === 'EXTRACTO'
                ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F] font-bold'
                : 'bg-[#F5F7FA] text-[#111827] border-[#D1D5DB] hover:bg-[#E8ECF1]'
            }`}
          >
            Partidas del Extracto ({resumen?.conteos.totalExtracto ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('LIBROS')}
            className={`h-7 px-3 text-[12px] border cursor-pointer rounded-none ${
              tabActiva === 'LIBROS'
                ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F] font-bold'
                : 'bg-[#F5F7FA] text-[#111827] border-[#D1D5DB] hover:bg-[#E8ECF1]'
            }`}
          >
            Partidas del Libro ({resumen?.conteos.totalLibros ?? 0})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <label htmlFor="filtro-estado-v2" className="text-[11px] font-bold text-[#4B5563]">
            Estado:
          </label>
          <select
            id="filtro-estado-v2"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] focus:outline-none focus:border-[#1E3A5F] rounded-none"
          >
            <option value="TODOS">Todos los estados (9)</option>
            {ESTADOS_CONCILIACION_V2.map((est) => (
              <option key={est} value={est}>
                {ETIQUETAS_ESTADO_V2[est]}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
            placeholder="Buscar glosa, referencia o monto..."
            className="h-7 px-2 w-56 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] focus:outline-none focus:border-[#1E3A5F] rounded-none"
          />
        </div>
      </div>

      {/* Tabla principal */}
      <div className="flex-1 p-3 overflow-auto flex flex-col">
        {tabActiva === 'EXTRACTO' ? (
          <TablaDensa
            columnas={columnasExtracto}
            datos={extractoFiltrado}
            rowKey={(r) => r.id}
            cargando={resumenQuery.isLoading}
            mensajeError={
              resumenQuery.error
                ? extraerMensajeErrorConciliacion(
                    resumenQuery.error,
                    'No se pudo cargar el extracto.'
                  )
                : null
            }
            mensajeVacio={
              resumen && !resumen.tieneExtracto
                ? 'No existe extracto bancario importado para esta cuenta en el periodo seleccionado.'
                : 'Sin partidas del extracto para el filtro seleccionado.'
            }
          />
        ) : (
          <TablaDensa
            columnas={columnasLibros}
            datos={librosFiltrado}
            rowKey={(r) => r.id}
            cargando={resumenQuery.isLoading}
            mensajeError={
              resumenQuery.error
                ? extraerMensajeErrorConciliacion(
                    resumenQuery.error,
                    'No se pudieron cargar los movimientos de libros.'
                  )
                : null
            }
            mensajeVacio="Sin movimientos en libros de tesorería para el filtro seleccionado."
          />
        )}
      </div>

      {/* Modal Configuración V2 (solo ADMINISTRADOR) */}
      <ConfigConciliacionV2Modal
        abierto={modalConfigAbierto}
        onCerrar={() => setModalConfigAbierto(false)}
        empresaId={empresaId}
        config={configQuery.data}
        esAdministrador={esAdministrador}
      />

      {/* Modal Conciliar Manual */}
      <VentanaModal
        abierto={Boolean(partidaParaConciliar)}
        onCerrar={() => setPartidaParaConciliar(null)}
        titulo="Conciliar Partida del Extracto (Manual)"
        subtitulo={partidaParaConciliar?.referencia || partidaParaConciliar?.fecha}
        ancho="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setPartidaParaConciliar(null)}
              className="h-7 px-3 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border border-[#D1D5DB] text-[12px] cursor-pointer rounded-none"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="form-conciliar-manual-v2"
              disabled={conciliarMutation.isPending || operacionesBloqueadas}
              className="h-7 px-3 bg-[#1E3A5F] hover:bg-[#162C49] disabled:bg-[#E5E7EB] text-[#FFFFFF] border border-[#1E3A5F] text-[12px] cursor-pointer rounded-none"
            >
              {conciliarMutation.isPending ? 'Conciliando...' : 'Confirmar Conciliación'}
            </button>
          </>
        }
      >
        {partidaParaConciliar && (
          <form id="form-conciliar-manual-v2" onSubmit={handleConfirmarConciliar} className="space-y-3">
            <div className="p-2 bg-[#F5F7FA] border border-[#D1D5DB] text-[11px] space-y-1">
              <div>
                <strong>Fecha:</strong> <span className="font-mono">{partidaParaConciliar.fecha}</span> ·{' '}
                <strong>Monto:</strong>{' '}
                <span className="font-mono font-bold">
                  {formatearMoneda(partidaParaConciliar.monto, monedaCuenta)}
                </span>
              </div>
              <div>
                <strong>Descripción:</strong> {partidaParaConciliar.descripcion}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#374151] mb-1">
                Vincular con Movimiento de Tesorería (Opcional)
              </label>
              <select
                value={movimientoVinculoId}
                onChange={(e) => setMovimientoVinculoId(e.target.value)}
                className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] focus:outline-none focus:border-[#1E3A5F] rounded-none"
              >
                <option value="">-- Conciliar manualmente sin asociar movimiento específico --</option>
                {movimientosLibrosDisponibles.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fecha} · {m.tipo} · {formatearMoneda(m.importeConSigno, monedaCuenta)} ·{' '}
                    {m.glosa}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#374151] mb-1">
                Observación (Opcional)
              </label>
              <textarea
                rows={2}
                maxLength={500}
                value={observacionConciliacion}
                onChange={(e) => setObservacionConciliacion(e.target.value)}
                placeholder="Detalle o sustento de la conciliación manual..."
                className="w-full p-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] focus:outline-none focus:border-[#1E3A5F] rounded-none"
              />
            </div>
          </form>
        )}
      </VentanaModal>

      {/* Modal Desconciliar */}
      <VentanaModal
        abierto={Boolean(partidaParaDesconciliar)}
        onCerrar={() => setPartidaParaDesconciliar(null)}
        titulo="Desconciliar Partida"
        subtitulo={partidaParaDesconciliar?.fecha}
        ancho="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setPartidaParaDesconciliar(null)}
              className="h-7 px-3 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border border-[#D1D5DB] text-[12px] cursor-pointer rounded-none"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="form-desconciliar-v2"
              disabled={desconciliarMutation.isPending || operacionesBloqueadas}
              className="h-7 px-3 bg-[#B91C1C] hover:bg-[#991B1B] text-[#FFFFFF] border border-[#B91C1C] text-[12px] cursor-pointer rounded-none"
            >
              {desconciliarMutation.isPending ? 'Procesando...' : 'Confirmar Desconciliación'}
            </button>
          </>
        }
      >
        {partidaParaDesconciliar && (
          <form id="form-desconciliar-v2" onSubmit={handleConfirmarDesconciliar} className="space-y-2.5">
            <p className="text-[12px] text-[#374151]">
              La partida volverá a estado <strong>PENDIENTE_LIBROS</strong> y se liberará el
              movimiento de tesorería asociado, si existiera.
            </p>
            <div>
              <label className="block text-[11px] font-bold text-[#374151] mb-1">
                Motivo (Opcional)
              </label>
              <input
                type="text"
                maxLength={500}
                value={motivoDesconciliar}
                onChange={(e) => setMotivoDesconciliar(e.target.value)}
                placeholder="Motivo de desconciliación..."
                className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] focus:outline-none focus:border-[#1E3A5F] rounded-none"
              />
            </div>
          </form>
        )}
      </VentanaModal>

      {/* Modal Reabrir Conciliación (solo ADMINISTRADOR) */}
      <VentanaModal
        abierto={modalReabrirAbierto}
        onCerrar={() => setModalReabrirAbierto(false)}
        titulo="Reabrir Conciliación Bancaria"
        subtitulo={`Periodo ${periodo}`}
        ancho="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModalReabrirAbierto(false)}
              className="h-7 px-3 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border border-[#D1D5DB] text-[12px] cursor-pointer rounded-none"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="form-reabrir-conciliacion-v2"
              disabled={reabrirMutation.isPending || motivoReapertura.trim().length < 5}
              className="h-7 px-3 bg-[#1E3A5F] hover:bg-[#162C49] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-[#FFFFFF] border border-[#1E3A5F] text-[12px] cursor-pointer rounded-none"
            >
              {reabrirMutation.isPending ? 'Reabriendo...' : 'Reabrir Conciliación'}
            </button>
          </>
        }
      >
        <form id="form-reabrir-conciliacion-v2" onSubmit={handleConfirmarReapertura} className="space-y-2.5">
          <p className="text-[12px] text-[#374151]">
            Indique el motivo de reapertura (mínimo 5 caracteres). Esta acción quedará registrada en
            la cadena de auditoría.
          </p>
          <div>
            <label className="block text-[11px] font-bold text-[#374151] mb-1">
              Motivo de Reapertura *
            </label>
            <textarea
              required
              minLength={5}
              maxLength={500}
              rows={3}
              value={motivoReapertura}
              onChange={(e) => setMotivoReapertura(e.target.value)}
              placeholder="Ej. Corrección de partida bancaria registrada en fecha posterior..."
              className="w-full p-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] focus:outline-none focus:border-[#1E3A5F] rounded-none"
            />
          </div>
        </form>
      </VentanaModal>
    </div>
  );
};
