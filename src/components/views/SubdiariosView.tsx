import React, { useState, useEffect, useMemo } from 'react';
import { 
  BookOpen, 
  FolderTree, 
  Plus, 
  FileText, 
  ListFilter, 
  Search, 
  Printer, 
  Eye, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  Coins,
  Building2,
  Calendar
} from 'lucide-react';
import { subdiariosApi, SubdiarioItem } from '../../api/subdiariosApi';
import { useAsientosList, useAnularAsiento } from '../../hooks/useAsientos';
import { EmpresaCliente, AsientoContable } from '../../types';
import { useToast } from '../../context/ToastContext';
import { VisorReporteModal } from '../modals/VisorReporteModal';
import { construirDefinicionVoucherContableEstandar } from '../../services/reports/formato_estandar/formatoEstandarEngine';

// Vistas operativas integradas según tipo de subdiario
import { RegistroComprasView } from './RegistroComprasView';
import { RegistroVentasView } from './RegistroVentasView';
import { HonorariosView } from './HonorariosView';
import { PlanillaPlameView } from './PlanillaPlameView';
import { CajaBancosView } from './CajaBancosView';
import { VouchersView } from './VouchersView';

interface SubdiariosViewProps {
  empresaId: string;
  periodo: string;
  empresa?: EmpresaCliente;
  usuarioRol?: string;
  usuarioNombre?: string;
  isPeriodoCerrado?: boolean;
}

export const SubdiariosView: React.FC<SubdiariosViewProps> = ({
  empresaId,
  periodo,
  empresa,
  usuarioRol = 'ADMIN_ESTUDIO',
  usuarioNombre = 'ADMINISTRADOR',
  isPeriodoCerrado = false
}) => {
  const { success, error, warning } = useToast();
  const [subdiarios, setSubdiarios] = useState<SubdiarioItem[]>([]);
  const [subdiarioSeleccionadoId, setSubdiarioSeleccionadoId] = useState<string>('01');
  const [pestañaActiva, setPestañaActiva] = useState<'REGISTRAR' | 'ASIENTOS'>('ASIENTOS');
  const [loading, setLoading] = useState(true);

  // Filtros de pestaña "Asientos del subdiario"
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'BORRADOR' | 'CONTABILIZADO' | 'ANULADO'>('TODOS');
  const [busqueda, setBusqueda] = useState('');

  // Modal Visor de Voucher
  const [voucherParaVer, setVoucherParaVer] = useState<any | null>(null);
  const [visorModalOpen, setVisorModalOpen] = useState(false);

  // Queries del backend
  const { data: asientosResponse, refetch: refetchAsientos, isLoading: loadingAsientos } = useAsientosList(empresaId, {});
  const anularMutation = useAnularAsiento(empresaId);

  const cargarSubdiarios = async () => {
    try {
      setLoading(true);
      const data = await subdiariosApi.listar(empresaId, { soloActivos: true });
      setSubdiarios(data);
      if (data.length > 0 && !data.some(s => s.codigo === subdiarioSeleccionadoId)) {
        setSubdiarioSeleccionadoId(data[0].codigo);
      }
    } catch (err: any) {
      error(err.message || 'Error al cargar subdiarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarSubdiarios();
  }, [empresaId]);

  const subdiarioActual = useMemo(() => {
    return subdiarios.find(s => s.codigo === subdiarioSeleccionadoId) || subdiarios[0] || null;
  }, [subdiarios, subdiarioSeleccionadoId]);

  // Asientos pertenecientes a este subdiario y periodo
  const todosAsientos = asientosResponse?.data || [];
  const asientosDelSubdiario = useMemo(() => {
    if (!subdiarioActual) return [];
    const cod = subdiarioActual.codigo;

    return todosAsientos.filter((a: any) => {
      const aSub = (a.subdiario || a.subdiarioId || '').replace(/^sub-/, '').padStart(2, '0');
      if (aSub !== cod) return false;

      // Filtro de estado
      if (filtroEstado !== 'TODOS' && a.estado !== filtroEstado) return false;

      // Búsqueda
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase();
        const coincide =
          (a.glosa || a.glosaGeneral || '').toLowerCase().includes(q) ||
          (a.numero || a.numeroAsiento || '').toLowerCase().includes(q) ||
          (a.cuo || '').toLowerCase().includes(q);
        if (!coincide) return false;
      }

      return true;
    });
  }, [todosAsientos, subdiarioActual, filtroEstado, busqueda]);

  const handleVerVoucher = (asiento: any) => {
    setVoucherParaVer(asiento);
    setVisorModalOpen(true);
  };

  const handleExtornar = async (asiento: any) => {
    if (isPeriodoCerrado) {
      warning('No se puede extornar asientos en un período contable cerrado.');
      return;
    }
    const motivo = window.prompt(`Ingrese el motivo de extorno para el voucher ${asiento.numero || asiento.id}:`);
    if (!motivo || motivo.trim().length < 5) {
      warning('Debe ingresar un motivo de extorno válido (mínimo 5 caracteres).');
      return;
    }

    try {
      await anularMutation.mutateAsync({ asientoId: asiento.id, motivo: motivo.trim() });
      success(`Asiento ${asiento.numero || asiento.id} extornado exitosamente.`);
      refetchAsientos();
    } catch (err: any) {
      error(err.message || 'Error al extornar el asiento contable.');
    }
  };

  const renderComponenteRegistro = () => {
    if (!subdiarioActual) return null;

    switch (subdiarioActual.tipoOperacion) {
      case 'COMPRAS':
        return <RegistroComprasView compras={[]} empresa={empresa as any} periodo={periodo} />;
      case 'VENTAS':
        return <RegistroVentasView ventas={[]} empresa={empresa as any} periodo={periodo} />;
      case 'HONORARIOS':
        return <HonorariosView />;
      case 'PLANILLA':
        return <PlanillaPlameView />;
      case 'CAJA':
      case 'BANCO':
        return <CajaBancosView />;
      case 'APERTURA':
      case 'DIARIO':
      case 'PROVISIONES':
      case 'AJUSTES':
      case 'CIERRE':
      default:
        return (
          <VouchersView
            empresaId={empresaId}
            periodo={periodo}
            isPeriodoCerrado={isPeriodoCerrado}
            empresa={empresa}
            usuarioNombre={usuarioNombre}
            usuarioRol={usuarioRol}
            subdiarioFijo={subdiarioActual.codigo}
          />
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-100 font-sans text-xs">
      {/* 1. Barra Superior de Selección Rápida de Subdiarios */}
      <div className="bg-slate-900 text-white px-3 py-2 flex items-center justify-between border-b border-slate-700 shadow-2xs">
        <div className="flex items-center gap-2 overflow-x-auto py-0.5 scrollbar-thin">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5 text-blue-400" /> Subdiarios:
          </span>
          {subdiarios.map((sub) => {
            const isSelected = sub.codigo === subdiarioSeleccionadoId;
            return (
              <button
                key={sub.id}
                onClick={() => setSubdiarioSeleccionadoId(sub.codigo)}
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <span className="text-[10px] opacity-75">{sub.codigo}</span>
                <span className="font-sans font-medium text-[11px] truncate max-w-[140px]">{sub.nombre}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={cargarSubdiarios}
          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer shrink-0 ml-2"
          title="Actualizar catálogo de subdiarios"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. Pestañas Principales del Subdiario Activo */}
      {subdiarioActual && (
        <div className="bg-white border-b border-slate-300 px-4 pt-2.5 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-800 text-white">
                {subdiarioActual.codigo}
              </span>
              <div>
                <h2 className="font-bold text-slate-900 text-sm">{subdiarioActual.nombre}</h2>
                <span className="text-[10.5px] text-slate-500 font-medium">
                  Tipo: <strong className="text-slate-700">{subdiarioActual.tipoOperacion}</strong> | Registro Manual:{' '}
                  <strong className={subdiarioActual.permiteAsientoManual ? 'text-emerald-700' : 'text-slate-500'}>
                    {subdiarioActual.permiteAsientoManual ? 'Permitido' : 'Automático'}
                  </strong>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 ml-6 border-b-2 border-transparent">
              <button
                onClick={() => setPestañaActiva('REGISTRAR')}
                className={`px-3 py-1.5 font-bold text-xs rounded-t border-t border-l border-r transition-colors cursor-pointer flex items-center gap-1.5 ${
                  pestañaActiva === 'REGISTRAR'
                    ? 'bg-blue-50/60 border-blue-600 text-blue-800 border-b-2 border-b-blue-600'
                    : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Registrar en Subdiario</span>
              </button>

              <button
                onClick={() => setPestañaActiva('ASIENTOS')}
                className={`px-3 py-1.5 font-bold text-xs rounded-t border-t border-l border-r transition-colors cursor-pointer flex items-center gap-1.5 ${
                  pestañaActiva === 'ASIENTOS'
                    ? 'bg-blue-50/60 border-blue-600 text-blue-800 border-b-2 border-b-blue-600'
                    : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Asientos del Subdiario ({asientosDelSubdiario.length})</span>
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-500">
            Período: <strong className="font-mono text-slate-800">{periodo}</strong>
          </div>
        </div>
      )}

      {/* 3. Contenido de la Pestaña Activa */}
      <div className="flex-1 overflow-auto">
        {pestañaActiva === 'REGISTRAR' ? (
          <div className="h-full">
            {renderComponenteRegistro()}
          </div>
        ) : (
          <div className="p-4 flex flex-col h-full gap-3">
            {/* Barra de Filtros de Asientos del Subdiario */}
            <div className="bg-white border border-slate-300 rounded p-2.5 flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] font-bold text-slate-700">Estado:</label>
                  <select
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value as any)}
                    className="border border-slate-300 rounded px-2 py-1 text-xs bg-white text-slate-800 focus:outline-none focus:border-blue-600"
                  >
                    <option value="TODOS">Todos los Estados</option>
                    <option value="CONTABILIZADO">Contabilizados</option>
                    <option value="BORRADOR">Borradores</option>
                    <option value="ANULADO">Anulados / Extornados</option>
                  </select>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por glosa, voucher, CUO..."
                    className="pl-8 pr-3 py-1 border border-slate-300 rounded text-xs w-64 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => refetchAsientos()}
                  className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Refrescar</span>
                </button>
              </div>
            </div>

            {/* Listado de Asientos del Subdiario */}
            <div className="flex-1 bg-white border border-slate-300 rounded shadow-2xs overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white uppercase text-[10px] font-bold tracking-wider sticky top-0 z-10">
                    <th className="p-2 border-r border-slate-700 w-24 text-center">Nº Voucher</th>
                    <th className="p-2 border-r border-slate-700 w-36 font-mono">CUO SUNAT</th>
                    <th className="p-2 border-r border-slate-700 w-24 text-center">Fecha</th>
                    <th className="p-2 border-r border-slate-700">Glosa de Operación</th>
                    <th className="p-2 border-r border-slate-700 w-28 text-right font-mono">Debe (S/)</th>
                    <th className="p-2 border-r border-slate-700 w-28 text-right font-mono">Haber (S/)</th>
                    <th className="p-2 border-r border-slate-700 w-28 text-center">Estado</th>
                    <th className="p-2 w-28 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {loadingAsientos ? (
                    <tr>
                      <td colSpan={8} className="text-center p-8 text-slate-500">
                        Cargando asientos del subdiario {subdiarioActual?.codigo}...
                      </td>
                    </tr>
                  ) : asientosDelSubdiario.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center p-8 text-slate-500">
                        No se registran asientos en el subdiario {subdiarioActual?.codigo} - {subdiarioActual?.nombre} para este período.
                      </td>
                    </tr>
                  ) : (
                    asientosDelSubdiario.map((a: any) => {
                      const esContab = a.estado === 'CONTABILIZADO';
                      const esAnulado = a.estado === 'ANULADO';

                      return (
                        <tr key={a.id} className="hover:bg-blue-50/50">
                          <td className="p-2 font-mono font-bold text-center text-slate-900 border-r border-slate-200">
                            {a.numero || a.numeroAsiento || '—'}
                          </td>
                          <td className="p-2 font-mono text-[11px] text-slate-700 border-r border-slate-200">
                            {a.cuo || '—'}
                          </td>
                          <td className="p-2 text-center text-slate-700 border-r border-slate-200">
                            {a.fecha || a.fechaContable || '—'}
                          </td>
                          <td className="p-2 text-slate-800 font-medium border-r border-slate-200 truncate max-w-xs">
                            {a.glosa || a.glosaGeneral || '—'}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-900 border-r border-slate-200">
                            {Number(a.totalDebe || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-900 border-r border-slate-200">
                            {Number(a.totalHaber || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-2 text-center border-r border-slate-200">
                            {esContab ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                CONTABILIZADO
                              </span>
                            ) : esAnulado ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                                ANULADO
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                BORRADOR
                              </span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleVerVoucher(a)}
                                className="p-1 hover:bg-slate-100 border border-slate-300 rounded text-slate-700 cursor-pointer"
                                title="Ver voucher contable / reporte estándar"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {esContab && !isPeriodoCerrado && (
                                <button
                                  onClick={() => handleExtornar(a)}
                                  className="p-1 hover:bg-indigo-50 border border-indigo-300 rounded text-indigo-700 cursor-pointer"
                                  title="Extornar asiento contable"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
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
      </div>

      {/* Modal Visor de Reporte Estándar de Voucher */}
      {visorModalOpen && voucherParaVer && (
        <VisorReporteModal
          isOpen={visorModalOpen}
          onClose={() => setVisorModalOpen(false)}
          definicion={construirDefinicionVoucherContableEstandar(
            voucherParaVer,
            empresa?.razonSocial || 'EMPRESA DEMO S.A.C.',
            empresa?.ruc || '20100035392',
            periodo,
            usuarioNombre
          )}
        />
      )}
    </div>
  );
};

