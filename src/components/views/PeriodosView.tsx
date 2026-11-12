import React, { useState } from 'react';
import { 
  Calendar, 
  Lock, 
  Unlock, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert, 
  RefreshCw,
  Clock,
  ArrowRightCircle,
  Sparkles,
  Check
} from 'lucide-react';
import { usePeriodosList, useCerrarPeriodo, useReabrirPeriodo } from '../../hooks/useAsientos';
import { useToast } from '../../context/ToastContext';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';

const NOMBRES_PERIODOS: Record<number, { etiqueta: string; detalle: string; esEspecial?: boolean }> = {
  0: { etiqueta: '00 · Apertura', detalle: 'Asiento Inicial y Saldos de Apertura', esEspecial: true },
  1: { etiqueta: '01 · Enero', detalle: 'Operaciones de Enero' },
  2: { etiqueta: '02 · Febrero', detalle: 'Operaciones de Febrero' },
  3: { etiqueta: '03 · Marzo', detalle: 'Operaciones de Marzo' },
  4: { etiqueta: '04 · Abril', detalle: 'Operaciones de Abril' },
  5: { etiqueta: '05 · Mayo', detalle: 'Operaciones de Mayo' },
  6: { etiqueta: '06 · Junio', detalle: 'Operaciones de Junio' },
  7: { etiqueta: '07 · Julio', detalle: 'Operaciones de Julio' },
  8: { etiqueta: '08 · Agosto', detalle: 'Operaciones de Agosto' },
  9: { etiqueta: '09 · Setiembre', detalle: 'Operaciones de Setiembre' },
  10: { etiqueta: '10 · Octubre', detalle: 'Operaciones de Octubre' },
  11: { etiqueta: '11 · Noviembre', detalle: 'Operaciones de Noviembre' },
  12: { etiqueta: '12 · Diciembre', detalle: 'Operaciones de Diciembre' },
  13: { etiqueta: '13 · Cierre Anual', detalle: 'Regularización, Cuentas 8 y Cierre PCGE', esEspecial: true }
};

interface PeriodosViewProps {
  empresaId: string;
}

export const PeriodosView: React.FC<PeriodosViewProps> = ({ empresaId }) => {
  const { success, error, info } = useToast();
  const { periodo: periodoActivo, setPeriodo } = useEmpresaPeriodo();
  const [anio, setAnio] = useState<number>(2026);
  const [isReabrirModalOpen, setIsReabrirModalOpen] = useState(false);
  const [periodoAReabrirId, setPeriodoAReabrirId] = useState<string | null>(null);
  const [motivoReapertura, setMotivoReapertura] = useState('');

  const [modalCerrar, setModalCerrar] = useState<{ open: boolean; periodoId: string }>({
    open: false,
    periodoId: ''
  });

  const { data: periodos = [], isLoading, refetch } = usePeriodosList(empresaId, anio);
  const cerrarMutation = useCerrarPeriodo(empresaId);
  const reabrirMutation = useReabrirPeriodo(empresaId);

  const handleSeleccionarPeriodo = (codigoPeriodo: string, etiqueta: string) => {
    setPeriodo(codigoPeriodo);
    success(`Período de trabajo establecido en ${codigoPeriodo} (${etiqueta}). Todas las vistas consultarán este período.`, 'Período de Trabajo Activo');
  };

  const handleSolicitarCerrar = (periodoId: string) => {
    setModalCerrar({ open: true, periodoId });
  };

  const handleConfirmarCerrar = async () => {
    if (!modalCerrar.periodoId) return;
    try {
      await cerrarMutation.mutateAsync(modalCerrar.periodoId);
      setModalCerrar({ open: false, periodoId: '' });
      refetch();
      success('Período contable cerrado y sellado con éxito. Libros y asientos bloqueados.', 'Período Cerrado');
    } catch (err: any) {
      error(`Error al cerrar período: ${err.message}`, 'Fallo al Cerrar');
    }
  };

  const handleConfirmarReabrir = async () => {
    if (!periodoAReabrirId) return;
    try {
      await reabrirMutation.mutateAsync({
        periodoId: periodoAReabrirId,
        motivo: motivoReapertura
      });
      setIsReabrirModalOpen(false);
      setPeriodoAReabrirId(null);
      setMotivoReapertura('');
      refetch();
      success('Período contable reabierto bajo auditoría estricta.', 'Reapertura Autorizada');
    } catch (err: any) {
      error(`Error al reabrir período: ${err.message}`, 'Fallo de Reapertura');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            Control de Períodos Contables & Cierres Mensuales
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestión inmutable del estado contable (ABIERTO / CERRADO). Los períodos cerrados bloquean cualquier adición o modificación de asientos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value={2025}>Ejercicio 2025</option>
            <option value={2026}>Ejercicio 2026</option>
            <option value={2027}>Ejercicio 2027</option>
          </select>

          <button
            onClick={() => refetch()}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            title="Refrescar períodos"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid de Meses */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {isLoading ? (
          <div className="col-span-full py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <Clock className="w-4 h-4 animate-spin" />
            Cargando estado de períodos...
          </div>
        ) : (
          periodos.map((p: any) => {
            const isCerrado = p.estado === 'CERRADO';
            const esActivo = p.codigoPeriodo === periodoActivo;
            const infoPeriodo = NOMBRES_PERIODOS[p.mes] || { etiqueta: `Mes ${p.mes}`, detalle: 'Operaciones del mes' };

            return (
              <div
                key={p.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                  esActivo
                    ? 'bg-blue-50/60 border-blue-500 shadow-sm ring-1 ring-blue-500/30'
                    : isCerrado
                    ? 'bg-slate-50 border-slate-200 opacity-90'
                    : 'bg-white border-slate-200 shadow-xs hover:border-blue-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-sm">{infoPeriodo.etiqueta}</span>
                        {esActivo && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-600 text-white shadow-xs">
                            <Check className="w-2.5 h-2.5" /> EN USO
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1" title={infoPeriodo.detalle}>
                        {infoPeriodo.detalle}
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                        isCerrado
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {isCerrado ? (
                        <>
                          <Lock className="w-3 h-3" />
                          CERRADO
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3 h-3" />
                          ABIERTO
                        </>
                      )}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-500 my-3">
                    <div className="flex justify-between">
                      <span>Código:</span>
                      <span className="font-mono font-bold text-slate-800">{p.codigoPeriodo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Asientos Contables:</span>
                      <span className="font-bold text-slate-800">{p.totalAsientos ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Borradores pendientes:</span>
                      <span className={`font-bold ${(p.asientosBorrador ?? 0) > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                        {p.asientosBorrador ?? 0}
                      </span>
                    </div>
                    {isCerrado && p.cerradoAt && (
                      <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-200">
                        Cerrado el: {new Date(p.cerradoAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2.5 border-t border-slate-200/80 flex items-center justify-between gap-2">
                  {esActivo ? (
                    <span className="text-[11px] font-bold text-blue-700 flex items-center gap-1 py-1">
                      <Check className="w-3.5 h-3.5 text-blue-600" /> Período activo
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSeleccionarPeriodo(p.codigoPeriodo, infoPeriodo.etiqueta)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                      title="Activar como período contable de trabajo"
                    >
                      <ArrowRightCircle className="w-3.5 h-3.5" />
                      Ingresar
                    </button>
                  )}

                  {isCerrado ? (
                    <button
                      onClick={() => {
                        setPeriodoAReabrirId(p.id);
                        setIsReabrirModalOpen(true);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                      Reabrir
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSolicitarCerrar(p.id)}
                      disabled={cerrarMutation.isPending}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer shadow-xs"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Cerrar
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Confirmar Cierre */}
      {modalCerrar.open && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Lock className="w-4 h-4 text-blue-600" />
              Confirmar Cierre de Período Contable
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              ¿Está seguro de cerrar este período contable? Se validará que no existan borradores pendientes y que el balance cuadre antes del sellado definitivo.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalCerrar({ open: false, periodoId: '' })}
                className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarCerrar}
                disabled={cerrarMutation.isPending}
                className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer"
              >
                {cerrarMutation.isPending ? 'Cerrando...' : 'Confirmar Cierre'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reapertura con Auditoría */}
      {isReabrirModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center gap-2.5 text-amber-700">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900">Solicitud de Reapertura de Período</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              La reapertura de un período cerrado es un evento excepcional que queda registrado en la cadena criptográfica de auditoría para trazabilidad ante la SUNAT.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Motivo justificado de reapertura (mínimo 10 caracteres):
              </label>
              <textarea
                value={motivoReapertura}
                onChange={(e) => setMotivoReapertura(e.target.value)}
                placeholder="Indique detalladamente por qué se reabre el período..."
                rows={3}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsReabrirModalOpen(false);
                  setPeriodoAReabrirId(null);
                }}
                className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarReabrir}
                disabled={motivoReapertura.trim().length < 10}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white text-xs font-bold transition"
              >
                Autorizar Reapertura
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
