import React, { useState, useEffect, useMemo } from 'react';
import { 
  BookOpen, 
  FolderTree, 
  Plus, 
  FileText, 
  Search, 
  Eye, 
  RotateCcw, 
  RefreshCw,
  Coins,
  Building2,
  Calendar,
  Layers,
  Sparkles,
  Table,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { subdiariosApi, SubdiarioItem } from '../../api/subdiariosApi';
import { useAsientosList, useAnularAsiento } from '../../hooks/useAsientos';
import { EmpresaCliente } from '../../types';
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

type CategoriaSubdiario = 'TODOS' | 'OPERATIVOS' | 'TESORERIA' | 'PERSONAL' | 'DIARIO_CIERRE';

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
  const [pestañaActiva, setPestañaActiva] = useState<'REGISTRAR' | 'ASIENTOS' | 'GRILLA_DIRECTA'>('REGISTRAR');
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<CategoriaSubdiario>('TODOS');
  const [busquedaSubdiario, setBusquedaSubdiario] = useState('');
  const [loading, setLoading] = useState(true);

  // Filtros de pestaña "Asientos del subdiario"
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'BORRADOR' | 'CONTABILIZADO' | 'ANULADO'>('TODOS');
  const [busquedaAsiento, setBusquedaAsiento] = useState('');

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

  // Conteo de vouchers por subdiario en el periodo actual
  const todosAsientos = asientosResponse?.data || [];
  const conteoPorSubdiario = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const a of todosAsientos) {
      const cod = ((a as any).subdiario || a.subdiarioId || '').replace(/^sub-/, '').padStart(2, '0');
      mapa[cod] = (mapa[cod] || 0) + 1;
    }
    return mapa;
  }, [todosAsientos]);

  // Helper de categorías y estilos
  const getCategoriaInfo = (sub: SubdiarioItem) => {
    switch (sub.tipoOperacion) {
      case 'COMPRAS':
      case 'VENTAS':
        return {
          cat: 'OPERATIVOS' as CategoriaSubdiario,
          badgeBg: 'bg-blue-100 text-blue-800 border-blue-200',
          accentColor: '#2457D6',
          icon: Building2
        };
      case 'CAJA':
      case 'BANCO':
        return {
          cat: 'TESORERIA' as CategoriaSubdiario,
          badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          accentColor: '#10B981',
          icon: Coins
        };
      case 'HONORARIOS':
      case 'PLANILLA':
        return {
          cat: 'PERSONAL' as CategoriaSubdiario,
          badgeBg: 'bg-purple-100 text-purple-800 border-purple-200',
          accentColor: '#8B5CF6',
          icon: FileText
        };
      case 'APERTURA':
      case 'AJUSTES':
      case 'CIERRE':
      case 'DIARIO':
      case 'PROVISIONES':
      default:
        return {
          cat: 'DIARIO_CIERRE' as CategoriaSubdiario,
          badgeBg: 'bg-slate-100 text-slate-800 border-slate-300',
          accentColor: '#475569',
          icon: FolderTree
        };
    }
  };

  // Filtrado de subdiarios por categoría y texto
  const subdiariosFiltrados = useMemo(() => {
    return subdiarios.filter((s) => {
      const info = getCategoriaInfo(s);
      if (categoriaSeleccionada !== 'TODOS' && info.cat !== categoriaSeleccionada) {
        return false;
      }
      if (busquedaSubdiario.trim()) {
        const q = busquedaSubdiario.toLowerCase().trim();
        const coincide =
          s.codigo.toLowerCase().includes(q) ||
          s.nombre.toLowerCase().includes(q) ||
          s.tipoOperacion.toLowerCase().includes(q);
        if (!coincide) return false;
      }
      return true;
    });
  }, [subdiarios, categoriaSeleccionada, busquedaSubdiario]);

  // Asientos pertenecientes a este subdiario y periodo
  const asientosDelSubdiario = useMemo(() => {
    if (!subdiarioActual) return [];
    const cod = subdiarioActual.codigo;

    return todosAsientos.filter((a: any) => {
      const aSub = (a.subdiario || a.subdiarioId || '').replace(/^sub-/, '').padStart(2, '0');
      if (aSub !== cod) return false;

      // Filtro de estado
      if (filtroEstado !== 'TODOS' && a.estado !== filtroEstado) return false;

      // Búsqueda
      if (busquedaAsiento.trim()) {
        const q = busquedaAsiento.toLowerCase();
        const coincide =
          (a.glosa || a.glosaGeneral || '').toLowerCase().includes(q) ||
          (a.numero || a.numeroAsiento || '').toLowerCase().includes(q) ||
          (a.cuo || '').toLowerCase().includes(q);
        if (!coincide) return false;
      }

      return true;
    });
  }, [todosAsientos, subdiarioActual, filtroEstado, busquedaAsiento]);

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
      await anularMutation.mutateAsync({ id: asiento.id, motivo: motivo.trim() });
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
    <div className="flex flex-col h-full bg-[#F4F6F9] font-sans text-xs">
      {/* 1. Panel Dinámico y Responsivo de Subdiarios */}
      <div className="bg-white border-b border-[#E3E8EF] px-4 py-3 shadow-2xs">
        {/* Fila 1: Filtro por categorías y buscador */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-2.5">
          {/* Pills de categorías */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {[
              { id: 'TODOS', label: 'Todos', icon: BookOpen, count: subdiarios.length },
              { id: 'OPERATIVOS', label: 'Compras y Ventas', icon: Building2 },
              { id: 'TESORERIA', label: 'Tesorería y Caja', icon: Coins },
              { id: 'PERSONAL', label: 'Personal y Honorarios', icon: FileText },
              { id: 'DIARIO_CIERRE', label: 'Diario y Cierres', icon: FolderTree }
            ].map((cat) => {
              const activa = categoriaSeleccionada === cat.id;
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => setCategoriaSeleccionada(cat.id as CategoriaSubdiario)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                    activa
                      ? 'bg-[#2457D6] text-white shadow-xs'
                      : 'bg-[#F1F4F9] text-slate-600 hover:bg-[#E8EDF6] hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Buscador de subdiarios y botón de recarga */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={busquedaSubdiario}
                onChange={(e) => setBusquedaSubdiario(e.target.value)}
                placeholder="Filtrar por código o nombre..."
                className="pl-8 pr-3 py-1.5 border border-[#E3E8EF] rounded-lg text-xs bg-[#F7F9FC] focus:bg-white focus:border-[#2457D6] focus:outline-none w-56 transition"
              />
            </div>
            <button
              onClick={cargarSubdiarios}
              className="p-1.5 hover:bg-[#F1F4F9] border border-[#E3E8EF] rounded-lg text-slate-500 hover:text-slate-800 cursor-pointer transition"
              title="Actualizar catálogo de subdiarios"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Fila 2: Carrusel / Grid Dinámico de Subdiarios */}
        <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-thin">
          {subdiariosFiltrados.map((sub) => {
            const isSelected = sub.codigo === subdiarioSeleccionadoId;
            const info = getCategoriaInfo(sub);
            const numVouchers = conteoPorSubdiario[sub.codigo] || 0;

            return (
              <button
                key={sub.id}
                onClick={() => setSubdiarioSeleccionadoId(sub.codigo)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all cursor-pointer shrink-0 border ${
                  isSelected
                    ? 'bg-[#E6EDFE] border-[#2457D6] shadow-xs ring-1 ring-[#2457D6]'
                    : 'bg-white border-[#E3E8EF] hover:border-slate-300 hover:bg-[#F8FAFC]'
                }`}
              >
                {/* Badge Código */}
                <span className={`px-2 py-0.5 rounded-md font-mono font-bold text-xs border ${info.badgeBg}`}>
                  {sub.codigo}
                </span>

                {/* Nombre y metadatos */}
                <div className="flex flex-col min-w-[130px] max-w-[190px]">
                  <span className={`font-semibold text-xs truncate ${isSelected ? 'text-[#2457D6]' : 'text-slate-800'}`}>
                    {sub.nombre}
                  </span>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                    <span>{sub.tipoOperacion}</span>
                    <span>•</span>
                    <span className={numVouchers > 0 ? 'font-bold text-[#1B7F4B]' : 'text-slate-400'}>
                      {numVouchers} {numVouchers === 1 ? 'asiento' : 'asientos'}
                    </span>
                  </div>
                </div>

                {isSelected && (
                  <CheckCircle2 className="w-4 h-4 text-[#2457D6] shrink-0 ml-1" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Cabecera y Navegación del Subdiario Activo */}
      {subdiarioActual && (
        <div className="bg-white border-b border-[#E3E8EF] px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          {/* Datos del Subdiario Activo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#2457D6] text-white flex items-center justify-center font-mono font-black text-sm shadow-xs">
              {subdiarioActual.codigo}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-900 text-sm">{subdiarioActual.nombre}</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                  {subdiarioActual.tipoOperacion}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Registro Contable: <strong className={subdiarioActual.permiteAsientoManual ? 'text-emerald-700' : 'text-slate-700'}>
                  {subdiarioActual.permiteAsientoManual ? 'Permite Asiento Manual y Asistido' : 'Automático por Módulo'}
                </strong>
              </p>
            </div>
          </div>

          {/* Selector de Modos de Trabajo (Pestañas) */}
          <div className="flex items-center gap-1.5 bg-[#F1F4F9] p-1 rounded-xl border border-[#E3E8EF]">
            <button
              onClick={() => setPestañaActiva('REGISTRAR')}
              className={`px-3 py-1.5 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                pestañaActiva === 'REGISTRAR'
                  ? 'bg-white text-[#2457D6] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Asistente de Registro</span>
            </button>

            <button
              onClick={() => setPestañaActiva('ASIENTOS')}
              className={`px-3 py-1.5 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                pestañaActiva === 'ASIENTOS'
                  ? 'bg-white text-[#2457D6] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Vouchers Contabilizados ({asientosDelSubdiario.length})</span>
            </button>

            <button
              onClick={() => setPestañaActiva('GRILLA_DIRECTA')}
              className={`px-3 py-1.5 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                pestañaActiva === 'GRILLA_DIRECTA'
                  ? 'bg-white text-[#2457D6] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Captura en Grilla PCGE</span>
            </button>
          </div>

          {/* Contexto de Período */}
          <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Período: <strong className="text-slate-900 font-bold">{periodo}</strong></span>
          </div>
        </div>
      )}

      {/* 3. Contenido Principal según el Modo de Trabajo */}
      <div className="flex-1 overflow-auto">
        {pestañaActiva === 'REGISTRAR' ? (
          <div className="h-full">
            {renderComponenteRegistro()}
          </div>
        ) : pestañaActiva === 'GRILLA_DIRECTA' ? (
          <div className="h-full">
            <VouchersView
              empresaId={empresaId}
              periodo={periodo}
              isPeriodoCerrado={isPeriodoCerrado}
              empresa={empresa}
              usuarioNombre={usuarioNombre}
              usuarioRol={usuarioRol}
              subdiarioFijo={subdiarioActual?.codigo}
            />
          </div>
        ) : (
          <div className="p-4 flex flex-col h-full gap-3">
            {/* Barra de Filtros de Asientos del Subdiario */}
            <div className="bg-white border border-[#E3E8EF] rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-bold text-slate-700">Estado:</label>
                  <select
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value as any)}
                    className="border border-[#E3E8EF] rounded-lg px-2.5 py-1 text-xs bg-white text-slate-800 focus:outline-none focus:border-[#2457D6]"
                  >
                    <option value="TODOS">Todos los Estados</option>
                    <option value="CONTABILIZADO">Contabilizados</option>
                    <option value="BORRADOR">Borradores</option>
                    <option value="ANULADO">Anulados / Extornados</option>
                  </select>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={busquedaAsiento}
                    onChange={(e) => setBusquedaAsiento(e.target.value)}
                    placeholder="Buscar por glosa, voucher, CUO..."
                    className="pl-8 pr-3 py-1 border border-[#E3E8EF] rounded-lg text-xs w-64 focus:outline-none focus:border-[#2457D6]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => refetchAsientos()}
                  className="px-3 py-1 bg-white border border-[#E3E8EF] hover:bg-[#F7F9FC] text-slate-700 font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer transition"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Refrescar</span>
                </button>
              </div>
            </div>

            {/* Listado de Asientos del Subdiario */}
            <div className="flex-1 bg-white border border-[#E3E8EF] rounded-xl shadow-2xs overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#1B2430] text-white uppercase text-[10px] font-bold tracking-wider sticky top-0 z-10">
                    <th className="p-2.5 border-r border-slate-700 w-24 text-center">Nº Voucher</th>
                    <th className="p-2.5 border-r border-slate-700 w-36 font-mono">CUO SUNAT</th>
                    <th className="p-2.5 border-r border-slate-700 w-24 text-center">Fecha</th>
                    <th className="p-2.5 border-r border-slate-700">Glosa de Operación</th>
                    <th className="p-2.5 border-r border-slate-700 w-28 text-right font-mono">Debe (S/)</th>
                    <th className="p-2.5 border-r border-slate-700 w-28 text-right font-mono">Haber (S/)</th>
                    <th className="p-2.5 border-r border-slate-700 w-28 text-center">Estado</th>
                    <th className="p-2.5 w-28 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {loadingAsientos ? (
                    <tr>
                      <td colSpan={8} className="text-center p-8 text-slate-500">
                        Cargando asientos del subdiario {subdiarioActual?.codigo}...
                      </td>
                    </tr>
                  ) : asientosDelSubdiario.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center p-12 text-slate-500">
                        <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="font-semibold text-slate-700">No se registran asientos en el subdiario {subdiarioActual?.codigo} - {subdiarioActual?.nombre} para este período.</p>
                        <p className="text-[11px] text-slate-400 mt-1">Use la pestaña "Asistente de Registro" o "Captura en Grilla PCGE" para generar el primer voucher.</p>
                      </td>
                    </tr>
                  ) : (
                    asientosDelSubdiario.map((a: any) => {
                      const esContab = a.estado === 'CONTABILIZADO';
                      const esAnulado = a.estado === 'ANULADO';

                      return (
                        <tr key={a.id} className="hover:bg-blue-50/40 transition">
                          <td className="p-2.5 font-mono font-bold text-center text-slate-900 border-r border-slate-100">
                            {a.numero || a.numeroAsiento || '—'}
                          </td>
                          <td className="p-2.5 font-mono text-[11px] text-slate-700 border-r border-slate-100">
                            {a.cuo || '—'}
                          </td>
                          <td className="p-2.5 text-center text-slate-700 border-r border-slate-100">
                            {a.fecha || a.fechaContable || '—'}
                          </td>
                          <td className="p-2.5 text-slate-800 font-medium border-r border-slate-100 truncate max-w-xs">
                            {a.glosa || a.glosaGeneral || '—'}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-900 border-r border-slate-100">
                            {Number(a.totalDebe || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-900 border-r border-slate-100">
                            {Number(a.totalHaber || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-2.5 text-center border-r border-slate-100">
                            {esContab ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                CONTABILIZADO
                              </span>
                            ) : esAnulado ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                ANULADO
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                BORRADOR
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleVerVoucher(a)}
                                className="p-1 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 cursor-pointer transition"
                                title="Ver voucher contable / reporte estándar"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {esContab && !isPeriodoCerrado && (
                                <button
                                  onClick={() => handleExtornar(a)}
                                  className="p-1 hover:bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-700 cursor-pointer transition"
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
            empresa || ({ razonSocial: 'EMPRESA DEMO S.A.C.', ruc: '20100035392' } as EmpresaCliente),
            voucherParaVer
          )}
        />
      )}
    </div>
  );
};
