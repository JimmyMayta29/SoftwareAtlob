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
  BarChart3,
  TrendingUp,
  X,
  BookOpen,
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
} from 'lucide-react';
import {
  analisisCuentasApi,
  MovimientoAnalisisCuenta,
  ResultadoMovimientosCuenta,
  FilaAntiguedadSaldo,
  ResultadoAntiguedadSaldos,
  FilaCuentaControl,
  AlertaAuditoria,
  ResultadoComparativoAnual,
} from '../../api/analisisCuentasApi';
import { asientosApi, AsientoDto } from '../../api/asientosApi';
import { EmpresaCliente } from '../../types';
import { VisorReporteModal } from '../modals/VisorReporteModal';
import {
  construirDefinicionAnalisisCuentasEstandar,
  formatearImporteEstandar,
  construirDefinicionVoucherContableEstandar,
} from '../../services/reports/formato_estandar/formatoEstandarEngine';
import { EMPRESAS_CLIENTES_DEMO } from '../../data/empresasClientes';

interface AnalisisCuentasViewProps {
  empresaId?: string;
  periodo?: string;
  empresa?: EmpresaCliente;
  usuarioRol?: string;
}

const CUENTAS_RAPIDAS = [
  { codigo: '1212', label: '1212 Facturas x Cobrar' },
  { codigo: '4212', label: '4212 Facturas x Pagar' },
  { codigo: '1041', label: '1041 Cuentas Corrientes' },
  { codigo: '141', label: '141 Personal y Accionistas' },
  { codigo: '161', label: '161 Cuentas x Cobrar Div.' },
  { codigo: '461', label: '461 Cuentas x Pagar Div.' },
  { codigo: '40111', label: '40111 IGV Cuenta Propia' },
];

export const AnalisisCuentasView: React.FC<AnalisisCuentasViewProps> = ({
  empresaId = '',
  periodo = '2026-09',
  empresa,
  usuarioRol = 'ADMIN_ESTUDIO',
}) => {
  // Pestaña activa
  const [tabActiva, setTabActiva] = useState<
    'movimientos' | 'antiguedad' | 'evolucion' | 'control' | 'alertas'
  >('movimientos');

  // Filtros
  const [periodoActual, setPeriodoActual] = useState(periodo);
  const [cuentaFiltro, setCuentaFiltro] = useState('1212');
  const [anexoFiltro, setAnexoFiltro] = useState('');
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroCancelacion, setFiltroCancelacion] = useState<'TODOS' | 'PENDIENTES' | 'SALDADOS'>('TODOS');
  const [filtroTipoDoc, setFiltroTipoDoc] = useState<string>('TODOS');

  // Estados de datos
  const [cargando, setCargando] = useState(false);
  const [movimientosData, setMovimientosData] = useState<ResultadoMovimientosCuenta | null>(null);
  const [antiguedadData, setAntiguedadData] = useState<ResultadoAntiguedadSaldos | null>(null);
  const [cuentasControl, setCuentasControl] = useState<FilaCuentaControl[]>([]);
  const [alertas, setAlertas] = useState<AlertaAuditoria[]>([]);
  const [comparativoData, setComparativoData] = useState<ResultadoComparativoAnual | null>(null);

  // Modal de auditoría de marca
  const [modalMarcaOpen, setModalMarcaOpen] = useState(false);
  const [movimientoParaMarca, setMovimientoParaMarca] = useState<MovimientoAnalisisCuenta | null>(null);
  const [estadoMarca, setEstadoMarca] = useState<'REVISADO' | 'OBSERVADO' | 'PENDIENTE'>('REVISADO');
  const [comentarioMarca, setComentarioMarca] = useState('');
  const [guardandoMarca, setGuardandoMarca] = useState(false);

  // Modal de Voucher Contable Completo (Doble clic)
  const [modalVoucherOpen, setModalVoucherOpen] = useState(false);
  const [asientoVoucher, setAsientoVoucher] = useState<AsientoDto | null>(null);
  const [cargandoVoucher, setCargandoVoucher] = useState(false);

  // Visor de reporte estándar
  const [visorModalOpen, setVisorModalOpen] = useState(false);

  const empresaActiva = empresa || EMPRESAS_CLIENTES_DEMO[0];
  const anioActual = parseInt(periodoActual.split('-')[0], 10) || 2026;

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
      } else if (tabActiva === 'evolucion') {
        const res = await analisisCuentasApi.obtenerComparativoAnual(
          empresaId,
          anioActual,
          cuentaFiltro || '12'
        );
        setComparativoData(res);
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
  }, [empresaId, periodoActual, tabActiva, cuentaFiltro]);

  // Manejador para aplicar filtros de cuenta / anexo en movimientos
  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault();
    cargarDatos();
  };

  // Abrir modal de marca de auditoría
  const handleAbrirMarca = (m: MovimientoAnalisisCuenta) => {
    setMovimientoParaMarca(m);
    setEstadoMarca(m.marcaRevision?.estadoRevision || 'REVISADO');
    setComentarioMarca(m.marcaRevision?.comentario || '');
    setModalMarcaOpen(true);
  };

  // Abrir modal de Voucher Contable Completo (Doble clic)
  const handleVerVoucher = async (asientoId: string) => {
    if (!asientoId) return;
    setCargandoVoucher(true);
    try {
      const data = await asientosApi.obtener(asientoId);
      setAsientoVoucher(data);
      setModalVoucherOpen(true);
    } catch (err) {
      console.error('Error al cargar detalle del voucher:', err);
    } finally {
      setCargandoVoucher(false);
    }
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

  // Filtrado de movimientos con cancelaciones, tipo de documento y texto libre
  const movimientosFiltrados = useMemo(() => {
    if (!movimientosData?.movimientos) return [];
    let list = movimientosData.movimientos;

    // Filtro por estado de cancelación (saldos abiertos)
    if (filtroCancelacion === 'PENDIENTES') {
      list = list.filter((m) => Math.abs(m.saldoPen) > 0.001);
    } else if (filtroCancelacion === 'SALDADOS') {
      list = list.filter((m) => Math.abs(m.saldoPen) <= 0.001);
    }

    // Filtro por tipo de documento SUNAT
    if (filtroTipoDoc !== 'TODOS') {
      list = list.filter((m) => m.docTipo === filtroTipoDoc);
    }

    // Filtro por texto libre
    if (filtroTexto.trim()) {
      const txt = filtroTexto.toLowerCase();
      list = list.filter(
        (m) =>
          m.codigoCuenta.toLowerCase().includes(txt) ||
          m.denominacionCuenta.toLowerCase().includes(txt) ||
          (m.anexoNumeroDoc && m.anexoNumeroDoc.includes(txt)) ||
          (m.anexoRazonSocial && m.anexoRazonSocial.toLowerCase().includes(txt)) ||
          (m.docNumero && m.docNumero.toLowerCase().includes(txt)) ||
          (m.glosaLinea && m.glosaLinea.toLowerCase().includes(txt)) ||
          m.voucherNumero.toLowerCase().includes(txt)
      );
    }

    return list;
  }, [movimientosData, filtroTexto, filtroCancelacion, filtroTipoDoc]);

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
              <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full border border-indigo-200">
                Mayor Analítico y Cartera
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Inspección analítica por anexo y comprobante, antigüedad de saldos, evolución de 12 meses, cuentas de control y auditoría.
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
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100 overflow-x-auto">
          <button
            onClick={() => setTabActiva('movimientos')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all shrink-0 ${
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
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all shrink-0 ${
              tabActiva === 'antiguedad'
                ? 'bg-indigo-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Antigüedad de Saldos</span>
          </button>

          <button
            onClick={() => setTabActiva('evolucion')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all shrink-0 ${
              tabActiva === 'evolucion'
                ? 'bg-indigo-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Evolución Anual (12 Meses)</span>
          </button>

          <button
            onClick={() => setTabActiva('control')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all shrink-0 ${
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
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all shrink-0 ${
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
            {/* Chips de Selección Rápida de Cuentas */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-1">
                Accesos directos:
              </span>
              {CUENTAS_RAPIDAS.map((c) => (
                <button
                  key={c.codigo}
                  type="button"
                  onClick={() => {
                    setCuentaFiltro(c.codigo);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-all ${
                    cuentaFiltro === c.codigo
                      ? 'bg-indigo-900 text-white shadow-xs font-bold'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Barra de Filtro de Cuenta, Cancelación y Búsqueda */}
            <form
              onSubmit={handleBuscar}
              className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-2.5"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-700">Cuenta:</span>
                <input
                  type="text"
                  value={cuentaFiltro}
                  onChange={(e) => setCuentaFiltro(e.target.value)}
                  placeholder="Ej. 12, 1212, 4212"
                  className="px-2.5 py-1 text-xs font-mono font-bold border border-slate-300 rounded-lg w-28 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-700">RUC/Anexo:</span>
                <input
                  type="text"
                  value={anexoFiltro}
                  onChange={(e) => setAnexoFiltro(e.target.value)}
                  placeholder="RUC o Razón..."
                  className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg w-36 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-700">Partidas:</span>
                <select
                  value={filtroCancelacion}
                  onChange={(e) => setFiltroCancelacion(e.target.value as any)}
                  className="px-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg focus:border-indigo-600 focus:outline-none bg-white"
                >
                  <option value="TODOS">Todas las partidas</option>
                  <option value="PENDIENTES">Solo pendientes (con saldo)</option>
                  <option value="SALDADOS">Saldadas / compensadas</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-700">Doc:</span>
                <select
                  value={filtroTipoDoc}
                  onChange={(e) => setFiltroTipoDoc(e.target.value)}
                  className="px-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg focus:border-indigo-600 focus:outline-none bg-white"
                >
                  <option value="TODOS">Todos</option>
                  <option value="01">01 Facturas</option>
                  <option value="03">03 Boletas</option>
                  <option value="07">07 Notas Crédito</option>
                  <option value="08">08 Notas Débito</option>
                  <option value="R1">R1 Honorarios</option>
                </select>
              </div>

              <button
                type="submit"
                className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Filtrar</span>
              </button>

              <div className="ml-auto relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={filtroTexto}
                  onChange={(e) => setFiltroTexto(e.target.value)}
                  placeholder="Buscar en tabla..."
                  className="pl-8 pr-3 py-1 text-xs border border-slate-300 rounded-lg w-44 focus:border-indigo-600 focus:outline-none"
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
                  <span className={`text-base font-mono font-bold ${movimientosData.saldoFinalPen >= 0 ? 'text-indigo-950' : 'text-rose-600'}`}>
                    S/ {formatearImporteEstandar(movimientosData.saldoFinalPen)}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">USD {formatearImporteEstandar(movimientosData.saldoFinalUsd)}</span>
                </div>
              </div>
            )}

            {/* Aviso informativo de doble clic */}
            <div className="text-[11px] text-slate-500 bg-slate-100/70 px-3 py-1.5 rounded-lg border border-slate-200 flex items-center justify-between">
              <span>
                💡 <strong>Doble clic</strong> en cualquier fila para inspeccionar el <strong>Voucher Contable Completo</strong> con partida doble y documento origen.
              </span>
              <span className="font-mono text-slate-400">{movimientosFiltrados.length} registros</span>
            </div>

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
                          Sin movimientos en este período para los filtros seleccionados.
                        </td>
                      </tr>
                    ) : (
                      movimientosFiltrados.map((m) => (
                        <tr
                          key={m.lineaId}
                          className="hover:bg-indigo-50/60 transition-colors cursor-pointer select-none group"
                          onDoubleClick={() => handleVerVoucher(m.asientoId)}
                          title="Doble clic para ver el Voucher Contable Completo"
                        >
                          <td className="py-1.5 px-2.5 text-center font-mono text-[11px] text-slate-600">
                            {m.fechaContable}
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono font-bold text-indigo-900 group-hover:underline">
                            {m.voucherNumero}
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-700">
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
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAbrirMarca(m);
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all shadow-2xs ${
                                m.marcaRevision?.estadoRevision === 'REVISADO'
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : m.marcaRevision?.estadoRevision === 'OBSERVADO'
                                  ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                              title={m.marcaRevision?.comentario || 'Marcar nota de auditoría'}
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

        {/* PESTAÑA 3: EVOLUCIÓN ANUAL (12 MESES) */}
        {tabActiva === 'evolucion' && (
          <div className="flex flex-col gap-3 h-full">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Evolución Mensual y Comparativo Anual de Cuenta ({anioActual})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Comportamiento mes a mes de cargos, abonos y variación porcentual respecto al mes anterior.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Prefijo Cuenta:</span>
                <input
                  type="text"
                  value={cuentaFiltro}
                  onChange={(e) => setCuentaFiltro(e.target.value)}
                  className="px-2.5 py-1 text-xs font-mono font-bold border border-slate-300 rounded-lg w-24 focus:border-indigo-600 focus:outline-none"
                  placeholder="12"
                />
                <button
                  type="button"
                  onClick={cargarDatos}
                  className="px-3 py-1 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded-lg transition-colors shadow-2xs"
                >
                  Actualizar
                </button>
              </div>
            </div>

            {/* Tarjetas de Resumen Anual */}
            {comparativoData && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Total Cargos Anuales (Debe)</span>
                  <span className="text-lg font-mono font-bold text-emerald-700 mt-0.5 block">
                    S/ {formatearImporteEstandar(comparativoData.totalDebePen)}
                  </span>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Total Abonos Anuales (Haber)</span>
                  <span className="text-lg font-mono font-bold text-indigo-700 mt-0.5 block">
                    S/ {formatearImporteEstandar(comparativoData.totalHaberPen)}
                  </span>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Saldo Acumulado al Cierre</span>
                  <span className={`text-lg font-mono font-bold mt-0.5 block ${comparativoData.saldoFinalPen >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                    S/ {formatearImporteEstandar(comparativoData.saldoFinalPen)}
                  </span>
                </div>
              </div>
            )}

            {/* Gráfico Visual de Barras (Debe vs Haber Mes a Mes) */}
            {comparativoData && (
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                  Comparativo Gráfico Mensual (Cargos Verde vs Abonos Azul)
                </h3>
                <div className="grid grid-cols-12 gap-2 h-40 items-end pt-2 border-b border-slate-200 pb-2">
                  {comparativoData.meses.map((m) => {
                    const maxVal = Math.max(
                      ...comparativoData.meses.map((item) => Math.max(item.debePen, item.haberPen)),
                      1
                    );
                    const hDebe = Math.round((m.debePen / maxVal) * 100);
                    const hHaber = Math.round((m.haberPen / maxVal) * 100);

                    return (
                      <div key={m.mes} className="flex flex-col items-center h-full justify-end group relative">
                        <div className="flex items-end gap-1 w-full justify-center h-full">
                          {/* Barra Debe */}
                          <div
                            style={{ height: `${Math.max(hDebe, 2)}%` }}
                            className="w-3 bg-emerald-500 rounded-t-xs hover:bg-emerald-600 transition-all cursor-pointer"
                            title={`Debe S/ ${formatearImporteEstandar(m.debePen)}`}
                          />
                          {/* Barra Haber */}
                          <div
                            style={{ height: `${Math.max(hHaber, 2)}%` }}
                            className="w-3 bg-indigo-500 rounded-t-xs hover:bg-indigo-600 transition-all cursor-pointer"
                            title={`Haber S/ ${formatearImporteEstandar(m.haberPen)}`}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 mt-2">
                          {m.nombreMes.slice(0, 3)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tabla Mensual Detallada con Variación MoM */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex-1">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 font-sans">
                  <tr>
                    <th className="py-2.5 px-3 w-16 text-center">Mes</th>
                    <th className="py-2.5 px-3">Período</th>
                    <th className="py-2.5 px-3 text-right">Cargos Debe S/</th>
                    <th className="py-2.5 px-3 text-right">Abonos Haber S/</th>
                    <th className="py-2.5 px-3 text-right">Saldo Neto Mes S/</th>
                    <th className="py-2.5 px-3 text-right">Variación MoM %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!comparativoData ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                        Cargando histórico anual...
                      </td>
                    </tr>
                  ) : (
                    comparativoData.meses.map((m) => (
                      <tr key={m.mes} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 text-center text-slate-400">{String(m.mes).padStart(2, '0')}</td>
                        <td className="py-2 px-3 font-sans font-bold text-slate-900">{m.nombreMes} {anioActual}</td>
                        <td className="py-2 px-3 text-right text-emerald-700">
                          {formatearImporteEstandar(m.debePen)}
                        </td>
                        <td className="py-2 px-3 text-right text-indigo-700">
                          {formatearImporteEstandar(m.haberPen)}
                        </td>
                        <td className={`py-2 px-3 text-right font-bold ${m.saldoNetoPen >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                          {formatearImporteEstandar(m.saldoNetoPen)}
                        </td>
                        <td className="py-2 px-3 text-right font-sans">
                          {m.mes === 1 ? (
                            <span className="text-slate-400">-</span>
                          ) : m.variacionPct > 0 ? (
                            <span className="text-emerald-700 font-bold flex items-center justify-end gap-1">
                              <TrendingUp className="w-3 h-3" /> +{m.variacionPct.toFixed(1)}%
                            </span>
                          ) : m.variacionPct < 0 ? (
                            <span className="text-rose-700 font-bold flex items-center justify-end gap-1">
                              <TrendingUp className="w-3 h-3 rotate-180" /> {m.variacionPct.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-400">0.0%</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PESTAÑA 4: CUENTAS DE CONTROL */}
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

        {/* PESTAÑA 5: ALERTAS DE AUDITORÍA */}
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

      {/* Modal Voucher Contable Completo (Doble Clic) */}
      {modalVoucherOpen && asientoVoucher && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <div className="flex items-start justify-between pb-4 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-indigo-700" />
                  <h3 className="font-bold text-base text-slate-900">
                    Voucher Contable Nº {asientoVoucher.numero || 'BORRADOR'}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      asientoVoucher.estado === 'CONTABILIZADO'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : asientoVoucher.estado === 'ANULADO'
                        ? 'bg-rose-100 text-rose-800 border border-rose-200'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {asientoVoucher.estado}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Subdiario: <strong className="text-slate-800">{asientoVoucher.subdiarioCodigo || asientoVoucher.subdiarioNombre || asientoVoucher.subdiarioId}</strong> · Fecha: <strong className="text-slate-800">{asientoVoucher.fecha}</strong> · Moneda: <strong className="text-slate-800">{asientoVoucher.moneda || 'PEN'}</strong> (T.C. {asientoVoucher.tipoCambio || '3.750'})
                </p>
              </div>

              <button
                onClick={() => setModalVoucherOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Glosa principal */}
            <div className="my-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Glosa Principal</span>
              <p className="text-slate-800 font-medium mt-0.5">{asientoVoucher.glosa || 'Sin glosa general'}</p>
            </div>

            {/* Tabla de Líneas de la Partida Doble */}
            <div className="overflow-auto flex-1 border border-slate-200 rounded-xl mb-4">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2 px-2 text-center w-12">#</th>
                    <th className="py-2 px-2.5 w-24">Cuenta</th>
                    <th className="py-2 px-3">Denominación</th>
                    <th className="py-2 px-3">Glosa Detalle</th>
                    <th className="py-2 px-2.5 text-right w-24">Debe S/</th>
                    <th className="py-2 px-2.5 text-right w-24">Haber S/</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {asientoVoucher.detalles?.map((l: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-1.5 px-2 text-center text-slate-400 text-[11px]">{i + 1}</td>
                      <td className="py-1.5 px-2.5 font-bold text-indigo-950">{l.cuentaCodigo || l.cuentaId}</td>
                      <td className="py-1.5 px-3 font-sans font-medium text-slate-800 truncate max-w-xs">{l.cuentaNombre || '-'}</td>
                      <td className="py-1.5 px-3 font-sans text-slate-600 truncate max-w-xs">{l.glosaLinea || '-'}</td>
                      <td className="py-1.5 px-2.5 text-right text-slate-900">
                        {l.debe > 0 ? formatearImporteEstandar(l.debe) : '-'}
                      </td>
                      <td className="py-1.5 px-2.5 text-right text-slate-900">
                        {l.haber > 0 ? formatearImporteEstandar(l.haber) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totales y Cuadre */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-xs font-mono">
              <div className="flex items-center gap-2 text-emerald-700 font-sans font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Partida Doble Cuadrada (Debe === Haber)</span>
              </div>

              <div className="flex items-center gap-4 text-xs font-mono font-bold">
                <span>Debe: <strong className="text-slate-900">S/ {formatearImporteEstandar(asientoVoucher.totalDebe || 0)}</strong></span>
                <span>Haber: <strong className="text-slate-900">S/ {formatearImporteEstandar(asientoVoucher.totalHaber || 0)}</strong></span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalVoucherOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cerrar
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
