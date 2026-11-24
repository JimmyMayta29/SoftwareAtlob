import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download, FileText, RefreshCw } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { EmpresaCliente } from '../../types';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';
import { construirDefinicionEstadoSituacionFinancieraEstandar } from '../../services/reports/formato_estandar/formatoEstandarEngine';
import {
  agruparEstadoSituacionFinanciera,
  formatearCortePeriodoFinanciero,
  formatearMontoFinanciero,
  obtenerAniosComparativos,
  RubroEsf
} from '../../services/reports/formato_estandar/estadosFinancierosHelper';
import { VisorReporteModal } from '../modals/VisorReporteModal';
import { reportesApi } from '../../api/reportesApi';

interface BalanceGeneralViewProps {
  empresa?: EmpresaCliente;
  periodo?: string;
  persistente?: boolean;
}

export const BalanceGeneralView: React.FC<BalanceGeneralViewProps> = ({
  empresa: propEmpresa,
  periodo: propPeriodo
}) => {
  const { state } = useAppContext();
  const { empresaActiva, periodo: ctxPeriodo } = useEmpresaPeriodo();
  const [periodo, setPeriodo] = useState(propPeriodo || ctxPeriodo || state.activePeriodo || '2026-09');
  const [acumuladoAlMes, setAcumuladoAlMes] = useState<boolean>(true);
  const [mostrarDesglosePcge, setMostrarDesglosePcge] = useState<boolean>(false);
  const [rubrosExpandidos, setRubrosExpandidos] = useState<Record<string, boolean>>({});
  const [modalEstandarOpen, setModalEstandarOpen] = useState(false);

  useEffect(() => {
    const p = propPeriodo || ctxPeriodo;
    if (p) setPeriodo(p);
  }, [propPeriodo, ctxPeriodo]);

  const empresa = (propEmpresa || empresaActiva || {
    id: typeof state.activeEmpresa === 'string' ? state.activeEmpresa : '',
    ruc: state.activeEmpresaRuc || '',
    razonSocial: state.activeEmpresaNombre || '',
    direccionFiscal: ''
  }) as EmpresaCliente;
  const empresaId = empresa?.id || '';
  const { anioAnterior } = obtenerAniosComparativos(periodo);
  const periodoAnterior = `${anioAnterior}-12`;

  const balanceQuery = useQuery({
    queryKey: ['reportes', empresaId, 'estado-situacion-financiera', periodo, acumuladoAlMes],
    queryFn: () => reportesApi.getEstadoSituacionFinanciera(empresaId, periodo, acumuladoAlMes),
    enabled: Boolean(empresaId),
    staleTime: 0
  });

  const balanceAnteriorQuery = useQuery({
    queryKey: ['reportes', empresaId, 'estado-situacion-financiera', periodoAnterior, true],
    queryFn: () => reportesApi.getEstadoSituacionFinanciera(empresaId, periodoAnterior, true),
    enabled: Boolean(empresaId),
    retry: false,
    staleTime: 60_000
  });

  const esf = useMemo(
    () => agruparEstadoSituacionFinanciera(balanceQuery.data, balanceAnteriorQuery.data, periodo),
    [balanceQuery.data, balanceAnteriorQuery.data, periodo]
  );

  const diferenciaCuadre = Math.abs(esf.totalActivoActual - esf.totalPasivoYPatrimonioActual);
  const subtituloCorte = formatearCortePeriodoFinanciero(periodo, acumuladoAlMes);

  const toggleRubro = (id: string) => {
    setRubrosExpandidos((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderBloqueRubros = (rubros: RubroEsf[]) =>
    rubros.map((r) => {
      const tieneCuentas = r.cuentas.length > 0;
      const expandido = mostrarDesglosePcge || Boolean(rubrosExpandidos[r.id]);
      return (
        <React.Fragment key={r.id}>
          <tr
            onClick={() => tieneCuentas && toggleRubro(r.id)}
            className={tieneCuentas ? 'cursor-pointer hover:bg-[#F8FAFC]' : ''}
          >
            <td className="py-[3px] pr-3 text-[#111827]">
              <span className="inline-flex items-center gap-1">
                {tieneCuentas && (
                  expandido
                    ? <ChevronDown className="w-3 h-3 text-[#64748B] shrink-0" />
                    : <ChevronRight className="w-3 h-3 text-[#64748B] shrink-0" />
                )}
                <span>{r.nombre}</span>
              </span>
            </td>
            <td className="py-[3px] text-right tabular-nums text-[#111827] w-28">
              {formatearMontoFinanciero(r.actual)}
            </td>
            <td className="py-[3px] text-right tabular-nums text-[#475569] w-28">
              {formatearMontoFinanciero(r.anterior)}
            </td>
          </tr>
          {expandido && r.cuentas.map((c) => (
            <tr key={`${r.id}-${c.codigo}`} className="bg-[#F8FAFC] text-[11px] text-[#475569]">
              <td className="py-[2px] pr-3 pl-5">
                <span className="font-mono text-[#1E3A5F] mr-1.5">{c.codigo}</span>
                {c.nombre}
              </td>
              <td className="py-[2px] text-right tabular-nums w-28">
                {formatearMontoFinanciero(c.actual, { esTotal: true })}
              </td>
              <td className="py-[2px] text-right tabular-nums w-28">
                {formatearMontoFinanciero(c.anterior)}
              </td>
            </tr>
          ))}
        </React.Fragment>
      );
    });

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Estado de Situación Financiera (NIC 1 / Formato 3.1 SUNAT)"
        subtitulo="Presentación financiera comparativa de Activo, Pasivo y Patrimonio Neto desde PostgreSQL"
        acciones={[
          {
            id: 'actualizar',
            label: balanceQuery.isFetching ? 'Actualizando...' : 'Actualizar',
            icono: RefreshCw,
            onClick: () => {
              void balanceQuery.refetch();
              void balanceAnteriorQuery.refetch();
            },
          },
          {
            id: 'estandar',
            label: 'Reporte estándar',
            icono: FileText,
            primario: true,
            onClick: () => setModalEstandarOpen(true),
          },
          {
            id: 'exportar',
            label: 'Exportar Formato 3.1',
            icono: Download,
            onClick: () => setModalEstandarOpen(true),
          },
        ]}
        derecha={
          <div className="flex items-center gap-2">
            <div className="inline-flex border border-[#D1D5DB] bg-[#F5F7FA] text-[11px]">
              <button
                type="button"
                onClick={() => setAcumuladoAlMes(true)}
                className={`px-2 py-0.5 font-bold cursor-pointer ${acumuladoAlMes ? 'bg-[#1E3A5F] text-white' : 'text-[#4B5563]'}`}
              >
                Acumulado Ene–Mes
              </button>
              <button
                type="button"
                onClick={() => setAcumuladoAlMes(false)}
                className={`px-2 py-0.5 font-bold cursor-pointer ${!acumuladoAlMes ? 'bg-[#1E3A5F] text-white' : 'text-[#4B5563]'}`}
              >
                Solo el mes
              </button>
            </div>
            <SelectorPeriodo periodo={periodo} onChange={setPeriodo} />
          </div>
        }
      />

      <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] flex flex-wrap items-center justify-between text-[12px] gap-2">
        <div className="flex flex-wrap items-center gap-6">
          <span><strong>TOTAL ACTIVO:</strong> <span className="font-mono font-bold text-[#1E3A5F]">S/ {formatearMontoFinanciero(esf.totalActivoActual, { esTotal: true })}</span></span>
          <span><strong>TOTAL PASIVO Y PATRIMONIO:</strong> <span className="font-mono font-bold text-[#1E3A5F]">S/ {formatearMontoFinanciero(esf.totalPasivoYPatrimonioActual, { esTotal: true })}</span></span>
          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#334155] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mostrarDesglosePcge}
              onChange={(e) => setMostrarDesglosePcge(e.target.checked)}
              className="accent-[#1E3A5F]"
            />
            <span>Mostrar desglose PCGE</span>
          </label>
        </div>
        <span className={`font-bold text-[11px] ${esf.estaCuadrado ? 'text-[#1E6F42]' : 'text-[#B91C1C]'}`}>
          {esf.estaCuadrado ? 'ECUACIÓN CONTABLE CUADRADA' : 'DESCUADRE EN BALANCE'} (Diferencia: S/ {diferenciaCuadre.toFixed(2)})
        </span>
      </div>

      {balanceQuery.isError && (
        <div role="alert" className="mx-3 mt-2 p-2.5 bg-[#FEF2F2] border border-[#FCA5A5] text-[#991B1B] text-[11px] flex items-center justify-between">
          <span>Error cargando Estado de Situación Financiera: {(balanceQuery.error as any)?.message || 'Error de conexión'}</span>
          <button type="button" onClick={() => void balanceQuery.refetch()} className="underline font-bold cursor-pointer">
            Reintentar
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-[#F4F6F9] p-4 sm:p-6">
        <div className="bg-white max-w-[1160px] mx-auto px-7 py-6 sm:px-10 sm:py-8 border border-[#E2E8F0] shadow-xs text-[#0F172A]">
          {/* Encabezado Financiero Limpio */}
          <div className="mb-5">
            <div className="text-[11px] text-[#64748B] uppercase tracking-wide">
              {empresa.razonSocial || 'EMPRESA CONTABLE'} · R.U.C.: <span className="font-mono">{empresa.ruc || '—'}</span>
            </div>
            <h2 className="text-[15px] font-bold tracking-tight text-[#0F172A] mt-1">
              ESTADO DE SITUACIÓN FINANCIERA
            </h2>
            <p className="text-[12.5px] text-[#1E293B]">{subtituloCorte}</p>
            <p className="text-[12.5px] font-bold text-[#0F172A]">(En Soles)</p>
          </div>

          {balanceQuery.isLoading ? (
            <div className="py-12 text-center text-xs text-[#64748B]">Calculando Estado de Situación Financiera desde PostgreSQL…</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-stretch">
              {/* Lado Izquierdo: Activo */}
              <div className="flex flex-col justify-between">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr>
                      <th className="text-left font-bold py-1.5 text-[#0F172A]">Activo</th>
                      <th className="text-right font-bold py-1.5 w-28 text-[#0F172A]">{esf.anioActual}</th>
                      <th className="text-right font-bold py-1.5 w-28 text-[#475569]">{esf.anioAnterior}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={3} className="font-bold pt-1 pb-1 text-[#0F172A]">Activo Corriente</td>
                    </tr>
                    {renderBloqueRubros(esf.activoCorriente)}
                    <tr className="font-bold">
                      <td className="py-1.5 pr-3">Total activos corrientes</td>
                      <td className="py-1.5 text-right tabular-nums w-28 border-t border-b border-[#0F172A]">
                        {formatearMontoFinanciero(esf.totalActivoCorrienteActual, { esTotal: true })}
                      </td>
                      <td className="py-1.5 text-right tabular-nums w-28 border-t border-b border-[#0F172A] text-[#475569]">
                        {formatearMontoFinanciero(esf.totalActivoCorrienteAnterior, { guionEnCero: true })}
                      </td>
                    </tr>

                    <tr><td colSpan={3} className="h-6" /></tr>

                    <tr>
                      <td colSpan={3} className="font-bold pt-1 pb-1 text-[#0F172A]">Activo no corriente</td>
                    </tr>
                    {renderBloqueRubros(esf.activoNoCorriente)}
                    <tr className="font-bold">
                      <td className="py-1.5 pr-3">Total activo no corriente</td>
                      <td className="py-1.5 text-right tabular-nums w-28 border-t border-b border-[#0F172A]">
                        {formatearMontoFinanciero(esf.totalActivoNoCorrienteActual, { esTotal: true })}
                      </td>
                      <td className="py-1.5 text-right tabular-nums w-28 border-t border-b border-[#0F172A] text-[#475569]">
                        {formatearMontoFinanciero(esf.totalActivoNoCorrienteAnterior, { guionEnCero: true })}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <table className="w-full border-collapse text-[12px] mt-4">
                  <tbody>
                    <tr className="font-bold">
                      <td className="py-1.5 pr-3">Total activo</td>
                      <td className="py-1.5 text-right tabular-nums w-28 border-t border-b-[3px] border-double border-[#0F172A]">
                        {formatearMontoFinanciero(esf.totalActivoActual, { esTotal: true })}
                      </td>
                      <td className="py-1.5 text-right tabular-nums w-28 border-t border-b-[3px] border-double border-[#0F172A] text-[#475569]">
                        {formatearMontoFinanciero(esf.totalActivoAnterior, { guionEnCero: true })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Lado Derecho: Pasivo y Patrimonio */}
              <div className="flex flex-col justify-between">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr>
                      <th className="text-left font-bold py-1.5 text-[#0F172A]">Pasivo y Patrimonio</th>
                      <th className="text-right font-bold py-1.5 w-28 text-[#0F172A]">{esf.anioActual}</th>
                      <th className="text-right font-bold py-1.5 w-28 text-[#475569]">{esf.anioAnterior}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={3} className="font-bold pt-1 pb-1 text-[#0F172A]">Pasivo Corriente</td>
                    </tr>
                    {renderBloqueRubros(esf.pasivoCorriente)}
                    <tr className="font-bold">
                      <td className="py-1.5 pr-3">Total pasivo corriente</td>
                      <td className="py-1.5 text-right tabular-nums w-28 border-t border-b border-[#0F172A]">
                        {formatearMontoFinanciero(esf.totalPasivoCorrienteActual, { esTotal: true })}
                      </td>
                      <td className="py-1.5 text-right tabular-nums w-28 border-t border-b border-[#0F172A] text-[#475569]">
                        {formatearMontoFinanciero(esf.totalPasivoCorrienteAnterior, { guionEnCero: true })}
                      </td>
                    </tr>

                    <tr><td colSpan={3} className="h-4" /></tr>

                    <tr>
                      <td colSpan={3} className="font-bold pt-1 pb-1 text-[#0F172A]">Pasivo no corriente</td>
                    </tr>
                    {renderBloqueRubros(esf.pasivoNoCorriente)}
                    <tr className="font-bold">
                      <td className="py-1.5 pr-3">Total pasivo no corriente</td>
                      <td className="py-1.5 text-right tabular-nums w-28 border-t border-b border-[#0F172A]">
                        {formatearMontoFinanciero(esf.totalPasivoNoCorrienteActual, { esTotal: true })}
                      </td>
                      <td className="py-1.5 text-right tabular-nums w-28 border-t border-b border-[#0F172A] text-[#475569]">
                        {formatearMontoFinanciero(esf.totalPasivoNoCorrienteAnterior, { guionEnCero: true })}
                      </td>
                    </tr>
                    <tr className="font-bold">
                      <td className="py-1.5 pr-3">Total pasivo</td>
                      <td className="py-1.5 text-right tabular-nums w-28 border-b border-[#0F172A]">
                        {formatearMontoFinanciero(esf.totalPasivoActual, { esTotal: true })}
                      </td>
                      <td className="py-1.5 text-right tabular-nums w-28 border-b border-[#0F172A] text-[#475569]">
                        {formatearMontoFinanciero(esf.totalPasivoAnterior, { guionEnCero: true })}
                      </td>
                    </tr>

                    <tr><td colSpan={3} className="h-4" /></tr>

                    <tr>
                      <td colSpan={3} className="font-bold pt-1 pb-1 text-[#0F172A]">Patrimonio</td>
                    </tr>
                    {renderBloqueRubros(esf.patrimonio)}
                    <tr className="font-bold">
                      <td className="py-1.5 pr-3">Total Patrimonio</td>
                      <td className="py-1.5 text-right tabular-nums w-28 border-t border-b border-[#0F172A]">
                        {formatearMontoFinanciero(esf.totalPatrimonioActual, { esTotal: true })}
                      </td>
                      <td className="py-1.5 text-right tabular-nums w-28 border-t border-b border-[#0F172A] text-[#475569]">
                        {formatearMontoFinanciero(esf.totalPatrimonioAnterior, { guionEnCero: true })}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <table className="w-full border-collapse text-[12px] mt-4">
                  <tbody>
                    <tr className="font-bold">
                      <td className="py-1.5 pr-3">Total pasivo y patrimonio</td>
                      <td className="py-1.5 text-right tabular-nums w-28 border-t border-b-[3px] border-double border-[#0F172A]">
                        {formatearMontoFinanciero(esf.totalPasivoYPatrimonioActual, { esTotal: true })}
                      </td>
                      <td className="py-1.5 text-right tabular-nums w-28 border-t border-b-[3px] border-double border-[#0F172A] text-[#475569]">
                        {formatearMontoFinanciero(esf.totalPasivoYPatrimonioAnterior, { guionEnCero: true })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Vista Previa Formato Estándar */}
      {modalEstandarOpen && (
        <VisorReporteModal
          isOpen={modalEstandarOpen}
          onClose={() => setModalEstandarOpen(false)}
          definicion={construirDefinicionEstadoSituacionFinancieraEstandar(empresa, balanceQuery.data || {}, periodo, {
            dataComparativa: balanceAnteriorQuery.data,
            acumulado: acumuladoAlMes
          })}
        />
      )}
    </div>
  );
};
