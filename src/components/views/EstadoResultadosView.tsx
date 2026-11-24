import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, RefreshCw } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { EmpresaCliente } from '../../types';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';
import { construirDefinicionEstadoResultadosEstandar } from '../../services/reports/formato_estandar/formatoEstandarEngine';
import {
  construirEstructuraEstadoResultados,
  formatearCortePeriodoFinanciero,
  formatearMontoFinanciero,
  obtenerAniosComparativos
} from '../../services/reports/formato_estandar/estadosFinancierosHelper';
import { VisorReporteModal } from '../modals/VisorReporteModal';
import { reportesApi } from '../../api/reportesApi';

interface EstadoResultadosViewProps {
  empresa?: EmpresaCliente;
  periodo?: string;
  persistente?: boolean;
}

export const EstadoResultadosView: React.FC<EstadoResultadosViewProps> = ({
  empresa: propEmpresa,
  periodo: propPeriodo
}) => {
  const { state } = useAppContext();
  const { empresaActiva, periodo: ctxPeriodo } = useEmpresaPeriodo();
  const [periodo, setPeriodo] = useState(propPeriodo || ctxPeriodo || state.activePeriodo || '2026-09');
  const [acumuladoAlMes, setAcumuladoAlMes] = useState<boolean>(true);
  const [modoPresentacion, setModoPresentacion] = useState<'funcion' | 'naturaleza'>('funcion');
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

  const erQuery = useQuery({
    queryKey: ['reportes', empresaId, 'estado-resultados', periodo, acumuladoAlMes],
    queryFn: () => reportesApi.getEstadoResultados(empresaId, periodo, acumuladoAlMes),
    enabled: Boolean(empresaId),
    staleTime: 0
  });

  const erAnteriorQuery = useQuery({
    queryKey: ['reportes', empresaId, 'estado-resultados', periodoAnterior, true],
    queryFn: () => reportesApi.getEstadoResultados(empresaId, periodoAnterior, true),
    enabled: Boolean(empresaId),
    retry: false,
    staleTime: 60_000
  });

  const er = useMemo(
    () => construirEstructuraEstadoResultados(erQuery.data, erAnteriorQuery.data, periodo, modoPresentacion),
    [erQuery.data, erAnteriorQuery.data, periodo, modoPresentacion]
  );

  const natResumen = erQuery.data?.porNaturaleza || {};
  const funcResumen = erQuery.data?.porFuncion || {};
  const subtituloCorte = formatearCortePeriodoFinanciero(periodo, acumuladoAlMes);

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Estado de Resultados Integrales (NIC 1 / Formato 3.20 SUNAT)"
        subtitulo="Presentación financiera por Función y por Naturaleza desde PostgreSQL"
        acciones={[
          {
            id: 'actualizar',
            label: erQuery.isFetching ? 'Actualizando...' : 'Actualizar',
            icono: RefreshCw,
            onClick: () => {
              void erQuery.refetch();
              void erAnteriorQuery.refetch();
            },
          },
          {
            id: 'estandar',
            label: 'Reporte estándar',
            icono: FileText,
            primario: true,
            onClick: () => setModalEstandarOpen(true),
          },
        ]}
        derecha={
          <div className="flex items-center gap-2">
            <div className="inline-flex border border-[#D1D5DB] bg-[#F5F7FA] text-[11px]">
              <button
                type="button"
                onClick={() => setModoPresentacion('funcion')}
                className={`px-2 py-0.5 font-bold cursor-pointer ${modoPresentacion === 'funcion' ? 'bg-[#1E3A5F] text-white' : 'text-[#4B5563]'}`}
              >
                Por Función (NIC 1)
              </button>
              <button
                type="button"
                onClick={() => setModoPresentacion('naturaleza')}
                className={`px-2 py-0.5 font-bold cursor-pointer ${modoPresentacion === 'naturaleza' ? 'bg-[#1E3A5F] text-white' : 'text-[#4B5563]'}`}
              >
                Por Naturaleza
              </button>
            </div>
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
        <div className="flex flex-wrap items-center gap-5">
          <span><strong>VENTAS NETAS:</strong> <span className="font-mono font-bold text-[#1E3A5F]">S/ {formatearMontoFinanciero(Number(funcResumen.ventasNetas || 0), { esTotal: true })}</span></span>
          <span><strong>UTILIDAD OPERATIVA:</strong> <span className="font-mono font-bold text-[#1E3A5F]">S/ {formatearMontoFinanciero(Number(funcResumen.utilidadOperativa || 0), { esTotal: true })}</span></span>
          <span><strong>RESULTADO NETO (FUNCIÓN / NAT.):</strong> <span className="font-mono font-bold text-[#1E6F42]">S/ {formatearMontoFinanciero(Number(funcResumen.utilidadNeta ?? natResumen.utilidadNeta ?? 0), { esTotal: true })}</span></span>
        </div>
        {erQuery.data && (
          <span className={`font-bold text-[11px] ${erQuery.data.coincidenciaExacta ? 'text-[#1E6F42]' : 'text-[#B45309]'}`}>
            {erQuery.data.coincidenciaExacta ? 'NATURALEZA = FUNCIÓN CUADRADOS' : 'REVISAR DESTINOS / NATURALEZA VS FUNCIÓN'}
          </span>
        )}
      </div>

      {erQuery.isError && (
        <div role="alert" className="mx-3 mt-2 p-2.5 bg-[#FEF2F2] border border-[#FCA5A5] text-[#991B1B] text-[11px] flex items-center justify-between">
          <span>Error cargando Estado de Resultados: {(erQuery.error as any)?.message || 'Error de conexión'}</span>
          <button type="button" onClick={() => void erQuery.refetch()} className="underline font-bold cursor-pointer">
            Reintentar
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-[#F4F6F9] p-4 sm:p-6">
        <div className="bg-white max-w-[920px] mx-auto px-7 py-6 sm:px-10 sm:py-8 border border-[#E2E8F0] shadow-xs text-[#0F172A]">
          <div className="mb-5">
            <div className="text-[11px] text-[#64748B] uppercase tracking-wide">
              {empresa.razonSocial || 'EMPRESA CONTABLE'} · R.U.C.: <span className="font-mono">{empresa.ruc || '—'}</span>
            </div>
            <h2 className="text-[15px] font-bold tracking-tight text-[#0F172A] mt-1">
              ESTADO DE RESULTADOS INTEGRALES
            </h2>
            <p className="text-[12.5px] text-[#1E293B]">{subtituloCorte}</p>
            <p className="text-[12.5px] font-bold text-[#0F172A]">(En Soles)</p>
          </div>

          {erQuery.isLoading ? (
            <div className="py-12 text-center text-xs text-[#64748B]">Calculando Estado de Resultados desde PostgreSQL…</div>
          ) : (
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className="text-left font-normal py-1.5" />
                  <th className="text-right font-bold py-1.5 w-36 border-t border-b border-[#0F172A] text-[#0F172A]">
                    {er.anioActual}
                  </th>
                  <th className="text-right font-bold py-1.5 w-36 border-t border-b border-[#0F172A] text-[#475569]">
                    {er.anioAnterior}
                  </th>
                </tr>
              </thead>
              <tbody>
                {er.lineas.map((l) => {
                  const esBold = l.tipo === 'seccion' || l.tipo === 'subtotal' || l.tipo === 'total';
                  const esTotalOStd = l.tipo === 'subtotal' || l.tipo === 'total';
                  const borderCell = l.tipo === 'total'
                    ? 'border-t border-b-[3px] border-double border-[#0F172A]'
                    : l.tipo === 'subtotal' && l.lineaSuperior && l.lineaInferior
                    ? 'border-t border-b border-[#0F172A]'
                    : l.tipo === 'subtotal' && l.lineaSuperior
                    ? 'border-t border-[#0F172A]'
                    : l.lineaInferior
                    ? 'border-b border-[#0F172A]'
                    : '';

                  return (
                    <tr key={l.id} className={esBold ? 'font-bold text-[#0F172A]' : 'text-[#1E293B]'}>
                      <td className={`py-1 pr-6 ${l.tipo === 'seccion' ? 'pt-4 pb-1' : ''}`}>
                        {l.concepto}
                      </td>
                      <td className={`py-1 text-right tabular-nums w-36 ${borderCell}`}>
                        {l.tipo === 'seccion' ? '' : formatearMontoFinanciero(l.actual, { esTotal: esTotalOStd })}
                      </td>
                      <td className={`py-1 text-right tabular-nums w-36 text-[#475569] ${borderCell}`}>
                        {l.tipo === 'seccion' ? '' : formatearMontoFinanciero(l.anterior, { esTotal: esTotalOStd })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalEstandarOpen && (
        <VisorReporteModal
          isOpen={modalEstandarOpen}
          onClose={() => setModalEstandarOpen(false)}
          definicion={construirDefinicionEstadoResultadosEstandar(empresa, erQuery.data || {}, periodo, {
            dataComparativa: erAnteriorQuery.data,
            acumulado: acumuladoAlMes,
            modo: modoPresentacion
          })}
        />
      )}
    </div>
  );
};
