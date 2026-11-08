import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Printer,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Check,
  Eye,
  Filter,
  FileText,
  Calendar,
  Layers,
  ArrowRight,
  Info,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import {
  analisisCuentasApi,
  MovimientoAnalisisCuenta,
  ResultadoMovimientosCuenta,
  FilaAntiguedadSaldo,
  ResultadoAntiguedadSaldos,
  FilaCuentaControl,
  AlertaAuditoria,
} from '../../api/analisisCuentasApi';
import { EmpresaCliente } from '../../types';
import { VisorReporteModal } from '../modals/VisorReporteModal';
import {
  construirDefinicionAnalisisCuentasEstandar,
  formatearImporteEstandar,
} from '../../services/reports/formato_estandar/formatoEstandarEngine';
import { EMPRESAS_CLIENTES_DEMO } from '../../data/empresasClientes';

interface AnalisisCuentasViewProps {
  empresaId?: string;
  periodo?: string;
  empresa?: EmpresaCliente;
  usuarioRol?: string;
}

export const AnalisisCuentasView: React.FC<AnalisisCuentasViewProps> = ({
  empresaId = '',
  periodo = '2026-09',
  empresa,
  usuarioRol = 'ADMIN_ESTUDIO',
}) => {
  // Pestaña activa
  const [tabActiva, setTabActiva] = useState<'movimientos' | 'antiguedad' | 'control' | 'alertas'>('movimientos');

  // Filtros
  const [periodoActual, setPeriodoActual] = useState(periodo);
  const [cuentaFiltro, setCuentaFiltro] = useState('1212');
  const [anexoFiltro, setAnexoFiltro] = useState('');
  const [filtroTexto, setFiltroTexto] = useState('');

  // Estados de datos
  const [cargando, setCargando] = useState(false);
  const [movimientosData, setMovimientosData] = useState<ResultadoMovimientosCuenta | null>(null);
  const [antiguedadData, setAntiguedadData] = useState<ResultadoAntiguedadSaldos | null>(null);
  const [cuentasControl, setCuentasControl] = useState<FilaCuentaControl[]>([]);
  const [alertas, setAlertas] = useState<AlertaAuditoria[]>([]);

  // Modal de auditoría de marca
  const [modalMarcaOpen, setModalMarcaOpen] = useState(false);
  const [movimientoParaMarca, setMovimientoParaMarca] = useState<MovimientoAnalisisCuenta | null>(null);
  const [estadoMarca, setEstadoMarca] = useState<'REVISADO' | 'OBSERVADO' | 'PENDIENTE'>('REVISADO');
  const [comentarioMarca, setComentarioMarca] = useState('');
  const [guardandoMarca, setGuardandoMarca] = useState(false);

  // Visor de reporte estándar
  const [visorModalOpen, setVisorModalOpen] = useState(false);

  const empresaActiva = empresa || EMPRESAS_CLIENTES_DEMO[0];

  useEffect(() => {
    setPeriodoActual(periodo);
  }, [periodo]);

  // Carga de datos según la pestaña activa
  const cargarDatos = async () => {
    if (!empresaId) return;
    setCargando(true);
    try {
      if (tabActiva === 'movimientos') {
        const res = await analisisCuentasApi.obtenerMovimientos(
          empresaId,
          periodoActual,
          cuentaFiltro,
          anexoFiltro
        );
        setMovimientosData(res);
      } else if (tabActiva === 'antiguedad') {
        const res = await analisisCuentasApi.obtenerAntiguedad(
          empresaId,
          periodoActual,
          cuentaFiltro || '1212'
        );
        setAntiguedadData(res);
      } else if (tabActiva === 'control') {
        const res = await analisisCuentasApi.obtenerCuentasControl(empresaId, periodoActual);
        setCuentasControl(res);
      } else if (tabActiva === 'alertas') {
        const res = await analisisCuentasApi.obtenerAlertas(empresaId, periodoActual);
        setAlertas(res);
      }
    } catch (err) {
      console.error('Error al cargar datos de análisis de cuentas:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, [empresaId, periodoActual, tabActiva]);

  // Manejador para aplicar filtros de cuenta / anexo en movimientos
  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault();
    cargarDatos();
  };

  // Abrir modal de marca
  const handleAbrirMarca = (m: MovimientoAnalisisCuenta) => {
    setMovimientoParaMarca(m);
    setEstadoMarca(m.marcaRevision?.estadoRevision || 'REVISADO');
    setComentarioMarca(m.marcaRevision?.comentario || '');
    setModalMarcaOpen(true);
  };

  // Guardar marca de auditoría
  const handleGuardarMarca = async () => {
    if (!movimientoParaMarca || !empresaId) return;
    setGuardandoMarca(true);
    try {
      await analisisCuentasApi.guardarMarca(empresaId, {
        asientoId: movimientoParaMarca.asientoId,
        lineaId: movimientoParaMarca.lineaId,
        estadoRevision: estadoMarca,
        comentario: comentarioMarca.trim() || undefined,
      });
      setModalMarcaOpen(false);
      cargarDatos();
    } catch (err) {
      console.error('Error al guardar marca de auditoría:', err);
    } finally {
      setGuardandoMarca(false);
    }
  };

  // Filtrado local por texto para movimientos
  const movimientosFiltrados = useMemo(() => {
    if (!movimientosData?.movimientos) return [];
    if (!filtroTexto.trim()) return movimientosData.movimientos;
    const txt = filtroTexto.toLowerCase();
    return movimientosData.movimientos.filter(
      (m) =>
        m.codigoCuenta.toLowerCase().includes(txt) ||
        m.denominacionCuenta.toLowerCase().includes(txt) ||
        (m.anexoNumeroDoc && m.anexoNumeroDoc.includes(txt)) ||
        (m.anexoRazonSocial && m.anexoRazonSocial.toLowerCase().includes(txt)) ||
        (m.docNumero && m.docNumero.toLowerCase().includes(txt)) ||
        (m.glosaLinea && m.glosaLinea.toLowerCase().includes(txt)) ||
        m.voucherNumero.toLowerCase().includes(txt)
    );
  }, [movimientosData, filtroTexto]);

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 font-sans">
      {/* 1. Encabezado de Navegación y Filtros de Auditoría */}
      <div className="bg-white border-b border-slate-200 px-5 py-3 shadow-xs shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-700" />
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                Análisis de Cuentas y Auditoría Contable
              </h1>
              <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                Formatos 3.3 al 3.14
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Inspección analítica por anexo y comprobante, antigüedad de saldos, cuentas de control y alertas preventivas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Selector de Período */}
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-2.5 py-1.5 border border-slate-200 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-semibold text-slate-700">Período:</span>
              <input
                type="month"
                value={periodoActual}
                onChange={(e) => setPeriodoActual(e.target.value)}
                className="bg-transparent font-mono text-xs font-bold text-slate-900 outline-none"
              />
            </div>

            {/* Botón Reporte Estándar */}
            <button
              onClick={() => setVisorModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-900 hover:bg-indigo-950 text-white shadow-xs transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Reporte</span>
            </button>
          </div>
        </div>

        {/* 2. Pestañas de Navegación */}
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
          <button
            onClick={() => setTabActiva('movimientos')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
              tabActiva === 'movimientos'
                ? 'bg-indigo-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Movimientos por Cuenta</span>
          </button>

          <button
            onClick={() => setTabActiva('antiguedad')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
              tabActiva === 'antiguedad'
                ? 'bg-indigo-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Antigüedad de Saldos</span>
          </button>

          <button
            onClick={() => setTabActiva('control')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
              tabActiva === 'control'
                ? 'bg-indigo-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Cuentas de Control</span>
          </button>

          <button
            onClick={() => setTabActiva('alertas')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
              tabActiva === 'alertas'
                ? 'bg-indigo-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Alertas de Auditoría</span>
            {alertas.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-rose-500 text-white text-[10px] font-bold rounded-full">
                {alertas.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 3. Contenido Principal */}
      <div className="flex-1 overflow-auto p-4">
        {/* PESTAÑA 1: MOVIMIENTOS POR CUENTA */}
        {tabActiva === 'movimientos' && (
          <div className="flex flex-col gap-3 h-full">
            {/* Barra de Filtro de Cuenta y Búsqueda */}
            <form onSubmit={handleBuscar} className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Cuenta / Prefijo:</span>
                <input
                  type="text"
                  value={cuentaFiltro}
                  onChange={(e) => setCuentaFiltro(e.target.value)}
                  placeholder="Ej. 12, 1212, 4212, 104"
                  className="px-2.5 py-1 text-xs font-mono font-bold border border-slate-300 rounded-lg w-32 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">RUC / Anexo:</span>
                <input
                  type="text"
                  value={anexoFiltro}
                  onChange={(e) => setAnexoFiltro(e.target.value)}
                  placeholder="RUC o Razón Social..."
                  className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg w-44 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Consultar</span>
              </button>

              <div className="ml-auto relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={filtroTexto}
                  onChange={(e) => setFiltroTexto(e.target.value)}
                  placeholder="Buscador en tabla..."
                  className="pl-8 pr-3 py-1 text-xs border border-slate-300 rounded-lg w-52 focus:border-indigo-600 focus:outline-none"
                />
              </div>
            </form>

            {/* Resumen de Saldos (Inicial, Movimientos y Final) */}
            {movimientosData && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Saldo Inicial</span>
                  <span className={`text-base font-mono font-bold ${movimientosData.saldoInicialPen >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                    S/ {formatearImporteEstandar(movimientosData.saldoInicialPen)}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">USD {formatearImporteEstandar(movimientosData.saldoInicialUsd)}</span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Total Cargos (Debe)</span>
                  <span className="text-base font-mono font-bold text-emerald-700">
                    S/ {formatearImporteEstandar(movimientosData.totalDebePen)}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">USD {formatearImporteEstandar(movimientosData.totalDebeUsd)}</span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Total Abonos (Haber)</span>
                  <span className="text-base font-mono font-bold text-indigo-700">
                    S/ {formatearImporteEstandar(movimientosData.totalHaberPen)}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">USD {formatearImporteEstandar(movimientosData.totalHaberUsd)}</span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Saldo Final Acumulado</span>
                  <span className={`text-base font-mono font-bold ${movimientosData.saldoFinalPen >= 0 ? 'text-indigo-900' : 'text-rose-600'}`}>
                    S/ {formatearImporteEstandar(movimientosData.saldoFinalPen)}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">USD {formatearImporteEstandar(movimientosData.saldoFinalUsd)}</span>
                </div>
              </div>
            )}

            {/* Tabla de Movimientos */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex-1 flex flex-col">
              <div className="overflow-auto flex-1">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2.5 text-center w-20">Fecha</th>
                      <th className="py-2 px-2 text-center w-24">Voucher</th>
                      <th className="py-2 px-2 text-center w-20">Cuenta</th>
                      <th className="py-2 px-2.5">Anexo (RUC/Razón Social)</th>
                      <th className="py-2 px-2 text-center w-28">Doc. Ref.</th>
                      <th className="py-2 px-3">Glosa</th>
                      <th className="py-2 px-2.5 text-right w-24">Cargos S/</th>
                      <th className="py-2 px-2.5 text-right w-24">Abonos S/</th>
                      <th className="py-2 px-2.5 text-right w-24">Saldo S/</th>
                      <th className="py-2 px-2 text-center w-20">Auditoría</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cargando ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-400 font-medium">
                          Cargando movimientos contables...
                        </td>
                      </tr>
                    ) : movimientosFiltrados.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-400 font-medium">
                          Sin movimientos en este período para la cuenta seleccionada.
                        </td>
                      </tr>
                    ) : (
                      movimientosFiltrados.map((m) => (
                        <tr
                          key={m.lineaId}
                          className="hover:bg-indigo-50/50 transition-colors cursor-pointer group"
                          onDoubleClick={() => handleAbrirMarca(m)}
                        >
                          <td className="py-1.5 px-2.5 text-center font-mono text-[11px] text-slate-600">
                            {m.fechaContable}
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-700">
                            {m.voucherNumero}
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono font-bold text-indigo-900">
                            {m.codigoCuenta}
                          </td>
                          <td className="py-1.5 px-2.5">
                            <span className="font-semibold text-slate-900 block truncate max-w-xs">
                              {m.anexoRazonSocial || 'Sin Anexo'}
                            </span>
                            {m.anexoNumeroDoc && (
                              <span className="text-[10px] font-mono text-slate-500">
                                {m.anexoNumeroDoc}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono text-[11px] text-slate-600">
                            {m.docNumero ? `${m.docTipo || '01'}-${m.docSerie || ''}-${m.docNumero}` : '-'}
                          </td>
                          <td className="py-1.5 px-3 text-slate-700 truncate max-w-xs" title={m.glosaLinea}>
                            {m.glosaLinea}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono text-slate-800">
                            {m.debePen > 0 ? formatearImporteEstandar(m.debePen) : '-'}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono text-slate-800">
                            {m.haberPen > 0 ? formatearImporteEstandar(m.haberPen) : '-'}
                          </td>
                          <td className={`py-1.5 px-2.5 text-right font-mono font-bold ${m.saldoPen >= 0 ? 'text-indigo-950' : 'text-rose-600'}`}>
                            {formatearImporteEstandar(m.saldoPen)}
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAbrirMarca(m);
                              }}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                                m.marcaRevision?.estadoRevision === 'REVISADO'
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : m.marcaRevision?.estadoRevision === 'OBSERVADO'
                                  ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                              title={m.marcaRevision?.comentario || 'Marcar revisión'}
                            >
                              {m.marcaRevision?.estadoRevision || 'AUDITAR'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA 2: ANTIGÜEDAD DE SALDOS */}
        {tabActiva === 'antiguedad' && (
          <div className="flex flex-col gap-3 h-full">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Cuenta de Cartera:</span>
                <select
                  value={cuentaFiltro}
                  onChange={(e) => {
                    setCuentaFiltro(e.target.value);
                    cargarDatos();
                  }}
                  className="px-2.5 py-1 text-xs font-mono font-bold border border-slate-300 rounded-lg focus:border-indigo-600 focus:outline-none"
                >
                  <option value="1212">1212 — Facturas por Cobrar Comerciales</option>
                  <option value="4212">4212 — Facturas por Pagar Comerciales</option>
                  <option value="14">14 — Cuentas por Cobrar al Personal</option>
                  <option value="16">16 — Cuentas por Cobrar Diversas</option>
                  <option value="46">46 — Cuentas por Pagar Diversas</option>
                </select>
              </div>

              {antiguedadData && (
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span>
                    Total Cartera: <strong className="text-slate-900">S/ {formatearImporteEstandar(antiguedadData.totalSaldo)}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Cuadrícula de Tramos de Antigüedad */}
            {antiguedadData && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">Corriente (0 a 30 días)</span>
                  <span className="text-base font-mono font-bold text-emerald-800">
                    S/ {formatearImporteEstandar(antiguedadData.totalTramo0_30)}
                  </span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider block">Vencido (31 a 60 días)</span>
                  <span className="text-base font-mono font-bold text-blue-800">
                    S/ {formatearImporteEstandar(antiguedadData.totalTramo31_60)}
                  </span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider block">Vencido (61 a 90 días)</span>
                  <span className="text-base font-mono font-bold text-amber-800">
                    S/ {formatearImporteEstandar(antiguedadData.totalTramo61_90)}
                  </span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider block">Moroso (&gt; 90 días)</span>
                  <span className="text-base font-mono font-bold text-rose-800">
                    S/ {formatearImporteEstandar(antiguedadData.totalTramoMas90)}
                  </span>
                </div>
              </div>
            )}

            {/* Tabla Detallada por Anexo */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex-1 flex flex-col">
              <div className="overflow-auto flex-1">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Anexo (RUC / Razón Social)</th>
                      <th className="py-2 px-2 text-center w-28">Doc. Ref.</th>
                      <th className="py-2 px-2 text-center w-24">Emisión</th>
                      <th className="py-2 px-2 text-center w-16">Días</th>
                      <th className="py-2 px-2.5 text-right w-24">Saldo S/</th>
                      <th className="py-2 px-2.5 text-right w-24 bg-emerald-50/50">0 - 30 d</th>
                      <th className="py-2 px-2.5 text-right w-24 bg-blue-50/50">31 - 60 d</th>
                      <th className="py-2 px-2.5 text-right w-24 bg-amber-50/50">61 - 90 d</th>
                      <th className="py-2 px-2.5 text-right w-24 bg-rose-50/50">&gt; 90 d</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {cargando ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                          Calculando antigüedad de saldos...
                        </td>
                      </tr>
                    ) : !antiguedadData || antiguedadData.partidas.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                          Sin partidas pendientes de cobranza/pago en esta cuenta.
                        </td>
                      </tr>
                    ) : (
                      antiguedadData.partidas.map((p, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-1.5 px-3 font-sans">
                            <span className="font-bold text-slate-900 block truncate max-w-sm">
                              {p.anexoRazonSocial}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">{p.anexoNumeroDoc}</span>
                          </td>
                          <td className="py-1.5 px-2 text-center text-[11px] text-slate-700">
                            {p.docTipo}-{p.docSerie}-{p.docNumero}
                          </td>
                          <td className="py-1.5 px-2 text-center text-[11px] text-slate-600">{p.fechaEmision}</td>
                          <td className="py-1.5 px-2 text-center font-bold text-slate-700">{p.diasAntiguedad}</td>
                          <td className="py-1.5 px-2.5 text-right font-bold text-slate-900">
                            {formatearImporteEstandar(p.saldoTotal)}
                          </td>
                          <td className="py-1.5 px-2.5 text-right text-emerald-700 bg-emerald-50/30">
                            {p.tramo0_30 > 0 ? formatearImporteEstandar(p.tramo0_30) : '-'}
                          </td>
                          <td className="py-1.5 px-2.5 text-right text-blue-700 bg-blue-50/30">
                            {p.tramo31_60 > 0 ? formatearImporteEstandar(p.tramo31_60) : '-'}
                          </td>
                          <td className="py-1.5 px-2.5 text-right text-amber-700 bg-amber-50/30">
                            {p.tramo61_90 > 0 ? formatearImporteEstandar(p.tramo61_90) : '-'}
                          </td>
                          <td className="py-1.5 px-2.5 text-right text-rose-700 bg-rose-50/30 font-bold">
                            {p.tramoMas90 > 0 ? formatearImporteEstandar(p.tramoMas90) : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA 3: CUENTAS DE CONTROL */}
        {tabActiva === 'control' && (
          <div className="flex flex-col gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <h2 className="text-sm font-bold text-slate-900 mb-1">
                Conciliación Automática entre Cuentas de Balance y Módulos Auxiliares
              </h2>
              <p className="text-xs text-slate-500">
                Verificación cruzada instantánea entre saldos del Libro Mayor y registros tributarios u operativos.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {cuentasControl.map((c, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border transition-all ${
                    c.estado === 'CUADRADO'
                      ? 'bg-white border-emerald-200'
                      : 'bg-white border-rose-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-indigo-900">{c.codigoCuenta}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            c.estado === 'CUADRADO'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {c.estado}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-slate-900 block mt-1">{c.nombreCuenta}</span>
                      <span className="text-[11px] text-slate-500 block">{c.moduloAuxiliar}</span>
                    </div>

                    {c.estado === 'CUADRADO' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-center font-mono">
                    <div className="bg-slate-50 p-2 rounded-lg">
                      <span className="text-[10px] font-sans text-slate-500 block">Saldo Contable</span>
                      <span className="text-xs font-bold text-slate-900">
                        S/ {formatearImporteEstandar(c.saldoContable)}
                      </span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-lg">
                      <span className="text-[10px] font-sans text-slate-500 block">Saldo Auxiliar</span>
                      <span className="text-xs font-bold text-slate-900">
                        S/ {formatearImporteEstandar(c.saldoAuxiliar)}
                      </span>
                    </div>
                    <div className={`p-2 rounded-lg ${c.diferencia === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                      <span className="text-[10px] font-sans block">Diferencia</span>
                      <span className="text-xs font-bold">
                        S/ {formatearImporteEstandar(c.diferencia)}
                      </span>
                    </div>
                  </div>

                  <span className="text-[11px] text-slate-500 mt-2 block italic">{c.observacion}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PESTAÑA 4: ALERTAS DE AUDITORÍA */}
        {tabActiva === 'alertas' && (
          <div className="flex flex-col gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 mb-1">
                  Alertas Preventivas de Auditoría y Consistencia Contable
                </h2>
                <p className="text-xs text-slate-500">
                  Detección de cuentas con saldo contra su naturaleza, sobregiros en cuentas 104, falta de sustento y duplicados.
                </p>
              </div>
              <button
                onClick={cargarDatos}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reanalizar</span>
              </button>
            </div>

            {alertas.length === 0 ? (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-6 rounded-xl text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <h3 className="text-sm font-bold">¡Sin inconsistencias detectadas!</h3>
                <p className="text-xs text-emerald-700 mt-1">
                  Todas las cuentas y asientos del período seleccionado cumplen con la consistencia contable y normativa.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {alertas.map((a) => (
                  <div
                    key={a.id}
                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-start gap-3 hover:border-slate-300 transition-all"
                  >
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        a.severidad === 'ALTA'
                          ? 'bg-rose-100 text-rose-700'
                          : a.severidad === 'MEDIA'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4" />
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">{a.titulo}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            a.severidad === 'ALTA'
                              ? 'bg-rose-100 text-rose-800'
                              : a.severidad === 'MEDIA'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {a.severidad}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{a.descripcion}</p>
                    </div>

                    {a.monto && (
                      <div className="text-right font-mono shrink-0">
                        <span className="text-[10px] text-slate-400 block font-sans">Monto Involucrado</span>
                        <span className="text-xs font-bold text-rose-600">
                          S/ {formatearImporteEstandar(a.monto)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de Auditoría / Marca de Asiento */}
      {modalMarcaOpen && movimientoParaMarca && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-700" />
                <h3 className="font-bold text-sm text-slate-900">
                  Auditoría del Asiento {movimientoParaMarca.voucherNumero}
                </h3>
              </div>
              <button
                onClick={() => setModalMarcaOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div>
                    <span className="text-slate-400 block font-sans text-[10px]">Cuenta</span>
                    <strong className="text-slate-800">{movimientoParaMarca.codigoCuenta}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-sans text-[10px]">Importe</span>
                    <strong className="text-slate-800">
                      S/ {formatearImporteEstandar(movimientoParaMarca.debePen || movimientoParaMarca.haberPen)}
                    </strong>
                  </div>
                </div>
                <div className="mt-1.5 text-slate-600">
                  <span className="text-slate-400 block font-sans text-[10px]">Glosa</span>
                  <span>{movimientoParaMarca.glosaLinea}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Estado de Revisión:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEstadoMarca('REVISADO')}
                    className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                      estadoMarca === 'REVISADO'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    ✓ Revisado
                  </button>
                  <button
                    type="button"
                    onClick={() => setEstadoMarca('OBSERVADO')}
                    className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                      estadoMarca === 'OBSERVADO'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    ⚠ Observado
                  </button>
                  <button
                    type="button"
                    onClick={() => setEstadoMarca('PENDIENTE')}
                    className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                      estadoMarca === 'PENDIENTE'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    ⏳ Pendiente
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nota / Comentario de Auditoría:
                </label>
                <textarea
                  value={comentarioMarca}
                  onChange={(e) => setComentarioMarca(e.target.value)}
                  placeholder="Ingrese el sustento o hallazgo detectado..."
                  rows={3}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:border-indigo-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalMarcaOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarMarca}
                disabled={guardandoMarca}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-700 hover:bg-indigo-800 text-white shadow-xs"
              >
                {guardandoMarca ? 'Guardando...' : 'Guardar Marca'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Visor de Reporte Estándar */}
      {visorModalOpen && movimientosData && (
        <VisorReporteModal
          isOpen={visorModalOpen}
          onClose={() => setVisorModalOpen(false)}
          definicion={construirDefinicionAnalisisCuentasEstandar(
            empresaActiva,
            periodoActual,
            cuentaFiltro,
            movimientosData.movimientos,
            {
              saldoInicialPen: movimientosData.saldoInicialPen,
              totalDebePen: movimientosData.totalDebePen,
              totalHaberPen: movimientosData.totalHaberPen,
              saldoFinalPen: movimientosData.saldoFinalPen,
            }
          )}
        />
      )}
    </div>
  );
};
