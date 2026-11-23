import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, RefreshCw } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { EmpresaCliente } from '../../types';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';
import { construirDefinicionFlujoEfectivoEstandar } from '../../services/reports/formato_estandar/formatoEstandarEngine';
import { VisorReporteModal } from '../modals/VisorReporteModal';
import { reportesApi } from '../../api/reportesApi';

interface LineaNic7 {
  id: string;
  actividad: 'OPERACIÓN' | 'INVERSIÓN' | 'FINANCIAMIENTO' | 'CONCILIACIÓN';
  concepto: string;
  importePen: number;
}

interface FlujoEfectivoViewProps {
  empresa?: EmpresaCliente;
  periodo?: string;
  persistente?: boolean;
}

export const FlujoEfectivoView: React.FC<FlujoEfectivoViewProps> = ({
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

  const flujoQuery = useQuery({
    queryKey: ['reportes', empresaId, 'flujo-efectivo', periodo, acumuladoAlMes],
    queryFn: () => reportesApi.getFlujoEfectivo(empresaId, periodo, acumuladoAlMes),
    enabled: Boolean(empresaId),
    staleTime: 0
  });

  const lineas = useMemo<LineaNic7[]>(() => {
    const data = flujoQuery.data;
    if (!data) return [];
    const op = data.actividadesOperacion || {};
    const inv = data.actividadesInversion || {};
    const fin = data.actividadesFinanciamiento || {};
    return [
      { id: 'op-1', actividad: 'OPERACIÓN', concepto: 'Cobranzas de venta de bienes y prestación de servicios (Cta. 12)', importePen: Number(op.cobranzasClientes) || 0 },
      { id: 'op-2', actividad: 'OPERACIÓN', concepto: '(-) Pagos a proveedores de bienes y servicios (Cta. 42)', importePen: -Math.abs(Number(op.pagosProveedores) || 0) },
      { id: 'op-3', actividad: 'OPERACIÓN', concepto: '(-) Pagos de remuneraciones y beneficios sociales (Cta. 41)', importePen: -Math.abs(Number(op.pagosRemuneraciones) || 0) },
      { id: 'op-4', actividad: 'OPERACIÓN', concepto: '(-) Pagos de tributos y aportes por pagar (Cta. 40)', importePen: -Math.abs(Number(op.pagosTributos) || 0) },
      { id: 'op-tot', actividad: 'CONCILIACIÓN', concepto: 'FLUJO NETO DE EFECTIVO PROVENIENTE DE ACTIVIDADES DE OPERACIÓN', importePen: Number(op.netoOperacion) || 0 },
      { id: 'inv-1', actividad: 'INVERSIÓN', concepto: '(-) Compra de propiedad, planta y equipo (Cta. 33)', importePen: -Math.abs(Number(inv.compraActivoFijo) || 0) },
      { id: 'inv-tot', actividad: 'CONCILIACIÓN', concepto: 'FLUJO NETO DE EFECTIVO EN ACTIVIDADES DE INVERSIÓN', importePen: Number(inv.netoInversion) || 0 },
      { id: 'fin-1', actividad: 'FINANCIAMIENTO', concepto: 'Aportes de capital en efectivo (Cta. 50)', importePen: Number(fin.aportesCapital) || 0 },
      { id: 'fin-2', actividad: 'FINANCIAMIENTO', concepto: 'Préstamos recibidos / (-) amortización de deuda financiera (Cta. 45)', importePen: Number(fin.prestamosPagosFinancieros) || 0 },
      { id: 'fin-tot', actividad: 'CONCILIACIÓN', concepto: 'FLUJO NETO DE EFECTIVO EN ACTIVIDADES DE FINANCIAMIENTO', importePen: Number(fin.netoFinanciamiento) || 0 },
      { id: 'con-1', actividad: 'CONCILIACIÓN', concepto: 'AUMENTO (DISMINUCIÓN) NETO DE EFECTIVO Y EQUIVALENTES', importePen: Number(data.variacionNetaEfectivo) || 0 },
      { id: 'con-2', actividad: 'CONCILIACIÓN', concepto: 'Saldo inicial de efectivo y equivalentes de efectivo', importePen: Number(data.saldoInicialEfectivo) || 0 },
      { id: 'con-3', actividad: 'CONCILIACIÓN', concepto: 'SALDO FINAL DE EFECTIVO Y EQUIVALENTES AL CIERRE (CUENTA 10)', importePen: Number(data.saldoFinalEfectivo) || 0 },
    ];
  }, [flujoQuery.data]);

  const columnas: ColumnaTablaDensa<LineaNic7>[] = [
    { key: 'actividad', header: 'Actividad NIC 7', width: '145px', render: (r) => <span className="font-bold text-[#1E3A5F] text-[11px]">{r.actividad}</span> },
    { key: 'concepto', header: 'Flujos de Efectivo (Formato 3.18 SUNAT — Método Directo)', render: (r) => <span className={r.actividad === 'CONCILIACIÓN' ? 'font-bold text-[#111827]' : ''}>{r.concepto}</span> },
    { key: 'importePen', header: 'Flujo S/', width: '135px', align: 'right', render: (r) => <span className={r.actividad === 'CONCILIACIÓN' ? 'font-bold text-[#1E3A5F]' : ''}>{r.importePen.toFixed(2)}</span> },
  ];

  const flujoResumen = flujoQuery.data;

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Estado de Flujos de Efectivo (NIC 7 / Formato 3.18 SUNAT)"
        subtitulo="Clasificación de movimientos de efectivo en Actividades de Operación, Inversión y Financiamiento desde PostgreSQL"
        acciones={[
          {
            id: 'actualizar',
            label: flujoQuery.isFetching ? 'Actualizando...' : 'Actualizar',
            icono: RefreshCw,
            onClick: () => void flujoQuery.refetch(),
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

      {flujoResumen && (
        <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] flex flex-wrap items-center justify-between text-[12px] gap-2">
          <div className="flex flex-wrap items-center gap-5">
            <span><strong>VARIACIÓN NETA:</strong> <span className="font-mono font-bold text-[#1E3A5F]">S/ {Number(flujoResumen.variacionNetaEfectivo || 0).toFixed(2)}</span></span>
            <span><strong>SALDO FINAL EFECTIVO:</strong> <span className="font-mono font-bold text-[#1E3A5F]">S/ {Number(flujoResumen.saldoFinalEfectivo || 0).toFixed(2)}</span></span>
            <span><strong>SALDO CUENTA 10 MAYOR:</strong> <span className="font-mono font-bold text-[#1E3A5F]">S/ {Number(flujoResumen.saldoCuenta10Mayor || 0).toFixed(2)}</span></span>
          </div>
          <span className={`font-bold text-[11px] ${flujoResumen.estaConciliado ? 'text-[#1E6F42]' : 'text-[#B91C1C]'}`}>
            {flujoResumen.estaConciliado ? 'CONCILIADO CON CUENTA 10' : 'DESCUADRE CON CUENTA 10'}
          </span>
        </div>
      )}

      {flujoQuery.isError && (
        <div role="alert" className="mx-3 mt-2 p-2.5 bg-[#FEF2F2] border border-[#FCA5A5] text-[#991B1B] text-[11px] flex items-center justify-between">
          <span>Error cargando Flujo de Efectivo: {(flujoQuery.error as any)?.message || 'Error de conexión'}</span>
          <button type="button" onClick={() => void flujoQuery.refetch()} className="underline font-bold cursor-pointer">
            Reintentar
          </button>
        </div>
      )}

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={lineas}
          rowKey={(r) => r.id}
        />
      </div>

      {modalEstandarOpen && (
        <VisorReporteModal
          isOpen={modalEstandarOpen}
          onClose={() => setModalEstandarOpen(false)}
          definicion={construirDefinicionFlujoEfectivoEstandar(empresa, flujoQuery.data || {}, periodo)}
        />
      )}
    </div>
  );
};
