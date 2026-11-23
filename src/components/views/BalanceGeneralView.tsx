import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, RefreshCw } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { EmpresaCliente } from '../../types';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';
import { construirDefinicionEstadoSituacionFinancieraEstandar } from '../../services/reports/formato_estandar/formatoEstandarEngine';
import { VisorReporteModal } from '../modals/VisorReporteModal';
import { reportesApi } from '../../api/reportesApi';

interface PartidaBalanceGeneral {
  id: string;
  bloque: 'ACTIVO CORRIENTE' | 'ACTIVO NO CORRIENTE' | 'PASIVO CORRIENTE' | 'PASIVO NO CORRIENTE' | 'PATRIMONIO NETO';
  codigoRubro: string;
  rubroSmv: string;
  importePen: number;
}

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

  const balanceQuery = useQuery({
    queryKey: ['reportes', empresaId, 'estado-situacion-financiera', periodo, acumuladoAlMes],
    queryFn: () => reportesApi.getEstadoSituacionFinanciera(empresaId, periodo, acumuladoAlMes),
    enabled: Boolean(empresaId),
    staleTime: 0
  });

  const { partidas, totalActivo, totalPasivoPatrimonio, cuadre } = useMemo(() => {
    const data = balanceQuery.data;
    if (!data) {
      return { partidas: [] as PartidaBalanceGeneral[], totalActivo: 0, totalPasivoPatrimonio: 0, cuadre: true };
    }
    const rows: PartidaBalanceGeneral[] = [];
    (data.activoCorriente || []).forEach((a: any, i: number) => {
      rows.push({
        id: `ac-${i}`,
        bloque: 'ACTIVO CORRIENTE',
        codigoRubro: a.codigo,
        rubroSmv: a.nombre,
        importePen: Number(a.monto) || 0
      });
    });
    (data.activoNoCorriente || []).forEach((a: any, i: number) => {
      rows.push({
        id: `anc-${i}`,
        bloque: 'ACTIVO NO CORRIENTE',
        codigoRubro: a.codigo,
        rubroSmv: a.nombre,
        importePen: Number(a.monto) || 0
      });
    });
    (data.pasivoCorriente || []).forEach((p: any, i: number) => {
      rows.push({
        id: `pc-${i}`,
        bloque: 'PASIVO CORRIENTE',
        codigoRubro: p.codigo,
        rubroSmv: p.nombre,
        importePen: Number(p.monto) || 0
      });
    });
    (data.pasivoNoCorriente || []).forEach((p: any, i: number) => {
      rows.push({
        id: `pnc-${i}`,
        bloque: 'PASIVO NO CORRIENTE',
        codigoRubro: p.codigo,
        rubroSmv: p.nombre,
        importePen: Number(p.monto) || 0
      });
    });
    (data.patrimonioNeto || []).forEach((p: any, i: number) => {
      rows.push({
        id: `pat-${i}`,
        bloque: 'PATRIMONIO NETO',
        codigoRubro: p.codigo,
        rubroSmv: p.nombre,
        importePen: Number(p.monto) || 0
      });
    });
    if (Number(data.resultadoDelEjercicio || 0) !== 0) {
      rows.push({
        id: 'pat-res',
        bloque: 'PATRIMONIO NETO',
        codigoRubro: '59 / 89',
        rubroSmv: 'Resultado del Ejercicio',
        importePen: Number(data.resultadoDelEjercicio) || 0
      });
    }
    return {
      partidas: rows,
      totalActivo: Number(data.totalActivo) || 0,
      totalPasivoPatrimonio: Number(data.totalPasivoYPatrimonio) || 0,
      cuadre: Boolean(data.estaCuadrado)
    };
  }, [balanceQuery.data]);

  const columnas: ColumnaTablaDensa<PartidaBalanceGeneral>[] = [
    { key: 'bloque', header: 'Masa Patrimonial', width: '165px', render: (r) => <span className="font-bold text-[#1E3A5F] text-[11px]">{r.bloque}</span> },
    { key: 'codigoRubro', header: 'Cód. PCGE/SUNAT', width: '115px', render: (r) => <span className="font-mono">{r.codigoRubro}</span> },
    { key: 'rubroSmv', header: 'Rubro del Estado de Situación Financiera (NIC 1 / Formato 3.1)', render: (r) => <span className="font-bold text-[#111827]">{r.rubroSmv}</span> },
    { key: 'importePen', header: 'Saldo al Cierre S/', width: '135px', align: 'right', render: (r) => <span className="font-bold">{r.importePen.toFixed(2)}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Balance General — Estado de Situación Financiera (NIC 1 / Formato 3.1 SUNAT)"
        subtitulo="Presentación clasificada de Activo Corriente, Activo No Corriente, Pasivo y Patrimonio Neto desde PostgreSQL"
        acciones={[
          {
            id: 'actualizar',
            label: balanceQuery.isFetching ? 'Actualizando...' : 'Actualizar',
            icono: RefreshCw,
            onClick: () => void balanceQuery.refetch(),
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

      <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] flex items-center justify-between text-[12px]">
        <div className="flex items-center gap-6">
          <span><strong>TOTAL ACTIVO:</strong> <span className="font-mono font-bold text-[#1E3A5F]">S/ {totalActivo.toFixed(2)}</span></span>
          <span><strong>TOTAL PASIVO Y PATRIMONIO:</strong> <span className="font-mono font-bold text-[#1E3A5F]">S/ {totalPasivoPatrimonio.toFixed(2)}</span></span>
        </div>
        <span className={`font-bold text-[11px] ${cuadre ? 'text-[#1E6F42]' : 'text-[#B91C1C]'}`}>
          {cuadre ? 'ECUACIÓN CONTABLE CUADRADA' : 'DESCUADRE EN BALANCE'} (Diferencia: S/ {Math.abs(totalActivo - totalPasivoPatrimonio).toFixed(2)})
        </span>
      </div>

      {balanceQuery.isError && (
        <div role="alert" className="mx-3 mt-2 p-2.5 bg-[#FEF2F2] border border-[#FCA5A5] text-[#991B1B] text-[11px] flex items-center justify-between">
          <span>Error cargando Balance General: {(balanceQuery.error as any)?.message || 'Error de conexión'}</span>
          <button type="button" onClick={() => void balanceQuery.refetch()} className="underline font-bold cursor-pointer">
            Reintentar
          </button>
        </div>
      )}

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={partidas}
          rowKey={(r) => r.id}
          totales={{
            rubroSmv: <span className="font-bold">TOTAL GENERAL ACTIVO</span>,
            importePen: totalActivo.toFixed(2),
          }}
        />
      </div>

      {/* Modal de Vista Previa Formato Estándar */}
      {modalEstandarOpen && (
        <VisorReporteModal
          isOpen={modalEstandarOpen}
          onClose={() => setModalEstandarOpen(false)}
          definicion={construirDefinicionEstadoSituacionFinancieraEstandar(empresa, balanceQuery.data || {}, periodo)}
        />
      )}
    </div>
  );
};
