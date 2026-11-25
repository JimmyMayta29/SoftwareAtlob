import React, { useEffect, useMemo, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  CreditCard,
  History,
  Link2,
  Lock,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Unlock,
  Upload,
  Wand2,
} from 'lucide-react';
import type {
  ConciliarManualGrupoInput,
  PartidaExtractoV2,
  SemaforoConciliacion,
} from '../../api/conciliacionV2Api';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { useToast } from '../../context/ToastContext';
import {
  extraerMensajeErrorConciliacion,
  useAceptarSugerencias,
  useAlertasControlV2,
  useCerrarConciliacionV2,
  useConciliacionV2Config,
  useConciliarManualGrupo,
  useCuentasBancariasV2,
  useCuentasContablesDisponiblesV2,
  useDesconciliarGrupo,
  useDesconciliarPartidaV2,
  useEjecutarMatching,
  useGruposMatching,
  useReabrirConciliacionV2,
  useRechazarSugerencia,
  useResumenConciliacionV2,
  useVincularCuentaContableV2,
} from '../../hooks/useConciliacionV2';
import { AplicarCarteraModal } from '../conciliacion/AplicarCarteraModal';
import { AsientoBancarioPreviewModal } from '../conciliacion/AsientoBancarioPreviewModal';
import { AsistenteImportacionModal } from '../conciliacion/AsistenteImportacionModal';
import { ChequesYAlertasPanel } from '../conciliacion/ChequesYAlertasPanel';
import { ConfigConciliacionV2Modal } from '../conciliacion/ConfigConciliacionV2Modal';
import { formatearMonedaExacta } from '../conciliacion/conciliacionUtils';
import { HistorialImportacionesModal } from '../conciliacion/HistorialImportacionesModal';
import {
  HistorialYReglasModal,
  type TabHistorialReglas,
} from '../conciliacion/HistorialYReglasModal';
import { PanelDualConciliacion } from '../conciliacion/PanelDualConciliacion';
import { PerfilesYReglasModal } from '../conciliacion/PerfilesYReglasModal';
import { SugerenciasMatchingBanner } from '../conciliacion/SugerenciasMatchingBanner';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';
import { VentanaModal } from '../ui/VentanaModal';

function esCeroExacto(valor: string | null | undefined): boolean {
  if (valor === null || valor === undefined || valor === '') return false;
  try {
    return new Decimal(valor).eq(0);
  } catch {
    return false;
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
  const puedeEditarPerfilesYRevertir = verificarPermiso(['ADMINISTRADOR', 'CONTADOR']);
  const puedeCerrar = verificarPermiso(['ADMINISTRADOR', 'CONTADOR']);
  const puedeReabrir = verificarPermiso(['ADMINISTRADOR']);

  const [cuentaSeleccionadaId, setCuentaSeleccionadaId] = useState<string>('');

  // Estado para vinculación contable obligatoria
  const [cuentaContableSelectId, setCuentaContableSelectId] = useState<string>('');
  const [cciInput, setCciInput] = useState<string>('');

  // Modales locales
  const [modalConfigAbierto, setModalConfigAbierto] = useState(false);
  const [modalImportarAbierto, setModalImportarAbierto] = useState(false);
  const [modalPerfilesAbierto, setModalPerfilesAbierto] = useState(false);
  const [modalHistorialAbierto, setModalHistorialAbierto] = useState(false);
  const [modalHistorialReglasAbierto, setModalHistorialReglasAbierto] = useState(false);
  const [tabHistorialReglas, setTabHistorialReglas] = useState<TabHistorialReglas>('HISTORIAL');
  const [modalReabrirAbierto, setModalReabrirAbierto] = useState(false);
  const [motivoReapertura, setMotivoReapertura] = useState<string>('');

  // Modales Fase 4
  const [lineaCarteraModal, setLineaCarteraModal] = useState<PartidaExtractoV2 | null>(null);
  const [lineaAsientoModal, setLineaAsientoModal] = useState<PartidaExtractoV2 | null>(null);
  const [modalChequesAlertasAbierto, setModalChequesAlertasAbierto] = useState(false);

  // Bandeja de sugerencias
  const [sugerenciasAbierto, setSugerenciasAbierto] = useState(true);
  const [rechazandoGrupoId, setRechazandoGrupoId] = useState<string | null>(null);

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

  const gruposQuery = useGruposMatching(empresaId, cuentaSeleccionadaId || null, periodo);
  const grupos = gruposQuery.data ?? [];

  const alertasControlQuery = useAlertasControlV2(
    empresaId,
    cuentaSeleccionadaId || null,
    periodo,
    Boolean(empresaId && cuentaSeleccionadaId)
  );
  const alertasControl = alertasControlQuery.data;
  const totalAlertas = alertasControl?.totalAlertas ?? 0;
  const tieneAlertasCriticas = Boolean(
    alertasControl &&
      (alertasControl.alertasBancarizacion.some((a) => a.severidad === 'CRITICA') ||
        alertasControl.chequesAntiguedad.some((c) => c.vencidoPlazoLegal))
  );

  const gruposSugeridos = useMemo(
    () => grupos.filter((g) => g.estado === 'SUGERIDO'),
    [grupos]
  );

  // Abrir automáticamente bandeja cuando aparecen sugerencias nuevas
  const cantidadSugerenciasPrevRef = useRef(0);
  useEffect(() => {
    if (gruposSugeridos.length > 0 && cantidadSugerenciasPrevRef.current === 0) {
      setSugerenciasAbierto(true);
    }
    cantidadSugerenciasPrevRef.current = gruposSugeridos.length;
  }, [gruposSugeridos.length]);

  // Sincronizar campos de vinculación al cambiar de cuenta
  useEffect(() => {
    setCuentaContableSelectId('');
    setCciInput(cuentaSeleccionada?.cci ?? '');
  }, [cuentaSeleccionada?.id, cuentaSeleccionada?.cci]);

  // Notificar errores reales de queries sin duplicar por el mismo mensaje
  const ultimoErrorReportadoRef = useRef<string | null>(null);
  useEffect(() => {
    const err =
      cuentasQuery.error ||
      resumenQuery.error ||
      cuentasContablesQuery.error ||
      gruposQuery.error;
    if (!err) {
      ultimoErrorReportadoRef.current = null;
      return;
    }
    const msg = extraerMensajeErrorConciliacion(err, 'Error cargando datos de Conciliación V2.');
    if (ultimoErrorReportadoRef.current !== msg) {
      ultimoErrorReportadoRef.current = msg;
      toast.error(msg, 'Conciliación Bancaria V2');
    }
  }, [
    cuentasQuery.error,
    resumenQuery.error,
    cuentasContablesQuery.error,
    gruposQuery.error,
    toast,
  ]);

  // Mutaciones
  const vincularMutation = useVincularCuentaContableV2(empresaId);
  const desconciliarLegacyMutation = useDesconciliarPartidaV2(empresaId);
  const cerrarMutation = useCerrarConciliacionV2(empresaId);
  const reabrirMutation = useReabrirConciliacionV2(empresaId);

  // Mutaciones Fase 3
  const ejecutarMatchingMutation = useEjecutarMatching(empresaId);
  const aceptarSugerenciasMutation = useAceptarSugerencias(empresaId);
  const rechazarSugerenciaMutation = useRechazarSugerencia(empresaId);
  const conciliarManualGrupoMutation = useConciliarManualGrupo(empresaId);
  const desconciliarGrupoMutation = useDesconciliarGrupo(empresaId);

  const periodoEstado = resumen?.conciliacionPeriodo.estado ?? 'ABIERTA';
  const conciliacionCerrada = periodoEstado === 'CERRADA';
  const monedaCuenta = resumen?.cuenta.moneda ?? cuentaSeleccionada?.moneda ?? 'PEN';

  const operacionesBloqueadas =
    requiereVinculacion || conciliacionCerrada || !puedeOperarPartidas;

  const motivoBloqueoOperaciones = requiereVinculacion
    ? 'Bloqueado: la cuenta bancaria debe vincularse primero a una cuenta del Plan Contable (PCGE)'
    : conciliacionCerrada
    ? 'Bloqueado: la conciliación del período está CERRADA'
    : !puedeOperarPartidas
    ? 'Solo lectura para su rol actual'
    : undefined;

  const puedeEjecutarMatching = Boolean(
    cuentaSeleccionada &&
      !requiereVinculacion &&
      !conciliacionCerrada &&
      puedeOperarPartidas &&
      resumen?.tieneExtracto
  );

  const tooltipEjecutarMatching = !cuentaSeleccionada
    ? 'Seleccione una cuenta bancaria primero'
    : requiereVinculacion
    ? 'Bloqueado: vincule una cuenta contable del Plan de Cuentas (cuentaContableId requerida)'
    : conciliacionCerrada
    ? 'Bloqueado: el período se encuentra CERRADO'
    : !puedeOperarPartidas
    ? 'Solo lectura para rol AUDITOR'
    : !resumen?.tieneExtracto
    ? 'Importe un extracto bancario en este período antes de ejecutar matching'
    : 'Ejecutar motor de matching automático (Capas 1 a 4)';

  const handleRefrescar = () => {
    void configQuery.refetch();
    void cuentasQuery.refetch();
    if (cuentaSeleccionadaId) {
      void resumenQuery.refetch();
      void gruposQuery.refetch();
      void alertasControlQuery.refetch();
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

  const handleEjecutarMatching = async () => {
    if (!cuentaSeleccionada || !puedeEjecutarMatching || ejecutarMatchingMutation.isPending) return;
    try {
      const resultado = await ejecutarMatchingMutation.mutateAsync({
        cuentaFinancieraId: cuentaSeleccionada.id,
        periodo,
        umbralAutoMatch: configQuery.data?.umbralAutoMatch,
        toleranciaDias: configQuery.data?.toleranciaDias,
        toleranciaMonto: configQuery.data?.toleranciaMonto,
      });
      if (resultado.sugeridos > 0) {
        setSugerenciasAbierto(true);
      }
    } catch {
      // Notificado por toast en el hook
    }
  };

  const handleAceptarSugerencias = async (grupoIds: string[]) => {
    if (grupoIds.length === 0 || operacionesBloqueadas) return;
    try {
      await aceptarSugerenciasMutation.mutateAsync({ grupoIds });
    } catch {
      // Notificado por toast en el hook
    }
  };

  const handleRechazarSugerencia = async (grupoId: string, motivo?: string | null) => {
    if (operacionesBloqueadas) return;
    setRechazandoGrupoId(grupoId);
    try {
      await rechazarSugerenciaMutation.mutateAsync({
        grupoId,
        payload: { motivo: motivo ?? null },
      });
    } catch {
      // Notificado por toast en el hook
    } finally {
      setRechazandoGrupoId(null);
    }
  };

  const handleConciliarManualGrupo = async (
    payload: Omit<ConciliarManualGrupoInput, 'cuentaFinancieraId' | 'periodo'>
  ) => {
    if (!cuentaSeleccionada || operacionesBloqueadas) return;
    try {
      await conciliarManualGrupoMutation.mutateAsync({
        ...payload,
        cuentaFinancieraId: cuentaSeleccionada.id,
        periodo,
      });
    } catch {
      // Notificado por toast en el hook
    }
  };

  const handleDesconciliarGrupo = async (grupoId: string, motivo: string) => {
    if (operacionesBloqueadas) return;
    try {
      await desconciliarGrupoMutation.mutateAsync({
        grupoId,
        payload: { motivo },
      });
    } catch {
      // Notificado por toast en el hook
    }
  };

  const handleDesconciliarPartidaLegacy = async (extractoLineaId: string, motivo: string) => {
    if (operacionesBloqueadas) return;
    try {
      await desconciliarLegacyMutation.mutateAsync({
        extractoLineaId,
        motivo,
      });
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

  const hayModalAbierto =
    modalConfigAbierto ||
    modalImportarAbierto ||
    modalPerfilesAbierto ||
    modalHistorialAbierto ||
    modalHistorialReglasAbierto ||
    modalReabrirAbierto ||
    Boolean(lineaCarteraModal) ||
    Boolean(lineaAsientoModal) ||
    modalChequesAlertasAbierto;

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF] text-[#111827]">
      <BarraHerramientasLocal
        titulo="Conciliación Bancaria V2"
        subtitulo="Panel Dual Extracto vs. Libros, Motor de Matching y Trazabilidad Mayor 104x"
        onRefrescar={handleRefrescar}
        acciones={[
          {
            id: 'importar-extracto-v2',
            label: 'Importar extracto',
            icono: Upload,
            disabled: !cuentaSeleccionada || !puedeOperarPartidas || conciliacionCerrada,
            onClick: () => setModalImportarAbierto(true),
          },
          {
            id: 'perfiles-reglas-v2',
            label: 'Perfiles y reglas',
            icono: SlidersHorizontal,
            onClick: () => setModalPerfilesAbierto(true),
          },
          {
            id: 'historial-importaciones-v2',
            label: 'Historial importaciones',
            icono: History,
            disabled: !cuentaSeleccionada,
            onClick: () => setModalHistorialAbierto(true),
          },
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
        accionesExtra={
          <button
            type="button"
            disabled={!cuentaSeleccionada}
            onClick={() => setModalChequesAlertasAbierto(true)}
            title="Gestión de cheques bancarios, alertas tributarias (ITF / Ley 28194) y plantillas de asiento"
            className={`h-6 px-2.5 text-[12px] inline-flex items-center gap-1.5 border rounded-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
              totalAlertas > 0
                ? tieneAlertasCriticas
                  ? 'bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#B91C1C] border-[#B91C1C] font-bold'
                  : 'bg-[#FEF3C7] hover:bg-[#FDE68A] text-[#B45309] border-[#B45309] font-bold'
                : 'bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border-[#D1D5DB]'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>Cheques y Alertas</span>
            <span
              className={`px-1.5 py-0 text-[10px] font-mono font-bold ${
                totalAlertas > 0
                  ? tieneAlertasCriticas
                    ? 'bg-[#B91C1C] text-[#FFFFFF]'
                    : 'bg-[#B45309] text-[#FFFFFF]'
                  : 'bg-[#E5E7EB] text-[#4B5563]'
              }`}
            >
              {totalAlertas}
            </span>
          </button>
        }
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

      {/* Barra selectora de cuenta bancaria + acciones Fase 3 + estado del periodo */}
      <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] flex flex-wrap items-center justify-between gap-2.5 text-[12px]">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <label htmlFor="select-cuenta-v2" className="font-bold text-[#1E3A5F] shrink-0">
            Cuenta Bancaria:
          </label>
          <select
            id="select-cuenta-v2"
            value={cuentaSeleccionadaId}
            onChange={(e) => setCuentaSeleccionadaId(e.target.value)}
            disabled={cuentasQuery.isLoading || cuentas.length === 0}
            className="h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] min-w-[300px] max-w-full focus:outline-none focus:border-[#1E3A5F] rounded-none"
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
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold border ${
                  conciliacionCerrada
                    ? 'bg-[#FEF2F2] text-[#B91C1C] border-[#B91C1C]'
                    : 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]'
                }`}
              >
                {conciliacionCerrada ? (
                  <Lock className="w-3 h-3" />
                ) : (
                  <CheckCircle2 className="w-3 h-3" />
                )}
                {periodoEstado}
              </span>
            </div>
          )}
        </div>

        {/* Acciones principales Fase 3 */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <span title={tooltipEjecutarMatching} className="inline-flex">
            <button
              type="button"
              disabled={!puedeEjecutarMatching || ejecutarMatchingMutation.isPending}
              onClick={() => void handleEjecutarMatching()}
              title={tooltipEjecutarMatching}
              className="h-7 px-3 bg-[#1E3A5F] hover:bg-[#162C49] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-[#FFFFFF] border border-[#1E3A5F] disabled:border-[#D1D5DB] text-[12px] font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed rounded-none"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>
                {ejecutarMatchingMutation.isPending
                  ? 'Ejecutando Matching...'
                  : 'Ejecutar Matching Automático'}
              </span>
            </button>
          </span>

          <button
            type="button"
            onClick={() => setSugerenciasAbierto((prev) => !prev)}
            className={`h-7 px-2.5 text-[12px] border inline-flex items-center gap-1.5 cursor-pointer rounded-none ${
              gruposSugeridos.length > 0
                ? 'bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1E3A5F] border-[#1E3A5F] font-bold'
                : 'bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border-[#D1D5DB]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Sugerencias</span>
            <span
              className={`px-1.5 py-0 text-[10px] font-mono font-bold ${
                gruposSugeridos.length > 0
                  ? 'bg-[#1E3A5F] text-[#FFFFFF]'
                  : 'bg-[#E5E7EB] text-[#4B5563]'
              }`}
            >
              {gruposSugeridos.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTabHistorialReglas('HISTORIAL');
              setModalHistorialReglasAbierto(true);
            }}
            className="h-7 px-2.5 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border border-[#D1D5DB] text-[12px] inline-flex items-center gap-1.5 cursor-pointer rounded-none"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#1E3A5F]" />
            <span>Historial y Reglas Aprendidas</span>
          </button>
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
                desconciliar, matching automático y cerrar permanecerán deshabilitadas hasta
                completar la vinculación.
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
                disabled={
                  !puedeVincularContable ||
                  cuentasContablesQuery.isLoading ||
                  vincularMutation.isPending
                }
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
                  ? formatearMonedaExacta(resumen.saldoInicialExtracto, monedaCuenta)
                  : 'Sin extracto'}
              </div>
            </div>

            <div className="p-2 bg-[#FFFFFF] border border-[#D1D5DB]">
              <div className="text-[11px] text-[#4B5563]">Saldo Final Extracto</div>
              <div className="font-mono font-bold text-[#111827] mt-0.5">
                {resumen.saldoFinalExtracto !== null
                  ? formatearMonedaExacta(resumen.saldoFinalExtracto, monedaCuenta)
                  : 'Sin extracto'}
              </div>
            </div>

            <div className="p-2 bg-[#FFFFFF] border border-[#D1D5DB]">
              <div className="text-[11px] text-[#4B5563]">Saldo Libros (Tesorería)</div>
              <div className="font-mono font-bold text-[#1E3A5F] mt-0.5">
                {formatearMonedaExacta(resumen.saldoLibros, monedaCuenta)}
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
                  ? formatearMonedaExacta(resumen.integridadMayor.saldoMayor104x, monedaCuenta)
                  : 'Sin vincular'}
              </div>
              {resumen.integridadMayor.alertaIntegridad && (
                <div className="mt-1 text-[10px] text-[#B91C1C] font-bold flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>
                    Alerta integridad (Dif:{' '}
                    {formatearMonedaExacta(
                      resumen.integridadMayor.diferenciaIntegridadMayor,
                      monedaCuenta
                    )}
                    )
                    {resumen.integridadMayor.motivoAlerta
                      ? ` — ${resumen.integridadMayor.motivoAlerta}`
                      : ''}
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
                  ? formatearMonedaExacta(resumen.diferencia, monedaCuenta)
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
                (+ Depósitos en tránsito:{' '}
                {formatearMonedaExacta(resumen.depositosEnTransito, monedaCuenta)})
              </span>
              <span className="text-[#B91C1C] font-mono">
                (− Cheques no cobrados:{' '}
                {formatearMonedaExacta(resumen.chequesNoCobrados, monedaCuenta)})
              </span>
              <span className="font-bold text-[#111827]">
                ={' '}
                {resumen.saldoAjustadoBanco !== null
                  ? formatearMonedaExacta(resumen.saldoAjustadoBanco, monedaCuenta)
                  : '—'}
              </span>
              <span className="px-1 font-bold text-[#1E3A5F]">vs</span>
              <span className="font-mono">
                Libros ({formatearMonedaExacta(resumen.saldoLibros, monedaCuenta)})
              </span>
              <span className="text-[#1E6F42] font-mono">
                (+ Abonos no registrados:{' '}
                {formatearMonedaExacta(resumen.abonosNoRegistrados, monedaCuenta)})
              </span>
              <span className="text-[#B91C1C] font-mono">
                (− Cargos no registrados:{' '}
                {formatearMonedaExacta(resumen.cargosNoRegistrados, monedaCuenta)})
              </span>
              <span className="font-bold text-[#111827]">
                = {formatearMonedaExacta(resumen.saldoAjustadoLibros, monedaCuenta)}
              </span>
            </div>

            <div className="text-[10px] text-[#4B5563] font-mono">
              Extracto: {resumen.conteos.conciliadasExtracto}/{resumen.conteos.totalExtracto} conc. ·
              Libros: {resumen.conteos.conciliadosLibros}/{resumen.conteos.totalLibros} conc.
            </div>
          </div>
        </div>
      )}

      {/* Bandeja de Sugerencias de Matching (Fase 3) */}
      <SugerenciasMatchingBanner
        sugerencias={gruposSugeridos}
        moneda={monedaCuenta}
        abierto={sugerenciasAbierto}
        onToggleAbierto={() => setSugerenciasAbierto((prev) => !prev)}
        operacionesBloqueadas={operacionesBloqueadas}
        motivoBloqueo={motivoBloqueoOperaciones}
        aceptando={aceptarSugerenciasMutation.isPending}
        rechazandoId={rechazandoGrupoId}
        onAceptarGrupos={handleAceptarSugerencias}
        onRechazarGrupo={handleRechazarSugerencia}
      />

      {/* Panel Dual de Conciliación (Extracto Bancario | Libros Contables) */}
      <div className="flex-1 min-h-0 pt-2 flex flex-col overflow-hidden">
        <PanelDualConciliacion
          resumen={resumen}
          grupos={grupos}
          cargando={resumenQuery.isLoading || gruposQuery.isLoading}
          mensajeError={
            resumenQuery.error
              ? extraerMensajeErrorConciliacion(
                  resumenQuery.error,
                  'No se pudo cargar el resumen de conciliación.'
                )
              : null
          }
          operacionesBloqueadas={operacionesBloqueadas}
          motivoBloqueo={motivoBloqueoOperaciones}
          puedeAprenderRegla={puedeEditarPerfilesYRevertir}
          hayModalAbierto={hayModalAbierto}
          conciliandoManual={conciliarManualGrupoMutation.isPending}
          desconciliando={
            desconciliarGrupoMutation.isPending || desconciliarLegacyMutation.isPending
          }
          onConciliarManualGrupo={handleConciliarManualGrupo}
          onDesconciliarGrupo={handleDesconciliarGrupo}
          onDesconciliarPartidaLegacy={handleDesconciliarPartidaLegacy}
          onAbrirAplicarCartera={(linea) => setLineaCarteraModal(linea)}
          onAbrirGenerarAsiento={(linea) => setLineaAsientoModal(linea)}
        />
      </div>

      {/* Modal Configuración V2 (solo ADMINISTRADOR) */}
      <ConfigConciliacionV2Modal
        abierto={modalConfigAbierto}
        onCerrar={() => setModalConfigAbierto(false)}
        empresaId={empresaId}
        config={configQuery.data}
        esAdministrador={esAdministrador}
      />

      {/* Asistente de Importación de Extracto V2 */}
      <AsistenteImportacionModal
        abierto={modalImportarAbierto}
        onCerrar={() => setModalImportarAbierto(false)}
        empresaId={empresaId}
        cuenta={cuentaSeleccionada}
        periodo={periodo}
        puedeImportar={puedeOperarPartidas}
      />

      {/* Editor de Perfiles Bancarios y Reglas de Clasificación */}
      <PerfilesYReglasModal
        abierto={modalPerfilesAbierto}
        onCerrar={() => setModalPerfilesAbierto(false)}
        empresaId={empresaId}
        puedeEditar={puedeEditarPerfilesYRevertir}
      />

      {/* Historial de Importaciones con Reversión */}
      <HistorialImportacionesModal
        abierto={modalHistorialAbierto}
        onCerrar={() => setModalHistorialAbierto(false)}
        empresaId={empresaId}
        cuenta={cuentaSeleccionada}
        puedeRevertir={puedeEditarPerfilesYRevertir}
      />

      {/* Modal Historial de Desconciliaciones y Reglas Aprendidas (Fase 3) */}
      <HistorialYReglasModal
        abierto={modalHistorialReglasAbierto}
        onCerrar={() => setModalHistorialReglasAbierto(false)}
        empresaId={empresaId}
        cuenta={cuentaSeleccionada}
        periodo={periodo}
        puedeEditarReglas={puedeEditarPerfilesYRevertir}
        tabInicial={tabHistorialReglas}
      />

      {/* Modal Aplicación a Cartera CxC/CxP y Casos Peruanos (Fase 4) */}
      <AplicarCarteraModal
        abierto={Boolean(lineaCarteraModal)}
        onCerrar={() => setLineaCarteraModal(null)}
        empresaId={empresaId}
        cuenta={cuentaSeleccionada}
        periodo={periodo}
        linea={lineaCarteraModal}
        puedeOperar={!operacionesBloqueadas}
      />

      {/* Modal Vista Previa y Generación de Asiento Bancario (Fase 4) */}
      <AsientoBancarioPreviewModal
        abierto={Boolean(lineaAsientoModal)}
        onCerrar={() => setLineaAsientoModal(null)}
        empresaId={empresaId}
        cuenta={cuentaSeleccionada}
        periodo={periodo}
        linea={lineaAsientoModal}
        config={configQuery.data}
        puedeOperar={!operacionesBloqueadas}
        esAdministrador={esAdministrador}
        onAbrirConfiguracion={() => setModalConfigAbierto(true)}
      />

      {/* Panel de Cheques, Control Tributario y Plantillas de Asiento (Fase 4) */}
      <ChequesYAlertasPanel
        abierto={modalChequesAlertasAbierto}
        onCerrar={() => setModalChequesAlertasAbierto(false)}
        empresaId={empresaId}
        cuenta={cuentaSeleccionada}
        periodo={periodo}
        resumen={resumen}
        alertasControl={alertasControl}
        cargandoAlertas={alertasControlQuery.isLoading}
        errorAlertas={alertasControlQuery.error}
        puedeOperarCheques={puedeOperarPartidas}
        puedeEditarPlantillas={puedeEditarPerfilesYRevertir}
        conciliacionCerrada={conciliacionCerrada}
        requiereVinculacion={requiereVinculacion}
        onAbrirAsientoLinea={(linea) => setLineaAsientoModal(linea)}
      />

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
