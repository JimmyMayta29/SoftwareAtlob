import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, RefreshCw } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { EmpresaCliente } from '../../types';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';
import { construirDefinicionEstadoResultadosEstandar } from '../../services/reports/formato_estandar/formatoEstandarEngine';
import { VisorReporteModal } from '../modals/VisorReporteModal';
import { reportesApi } from '../../api/reportesApi';

interface LineaEstadoResultados {
  id: string;
  codigo: string;
  concepto: string;
  esSubtotal?: boolean;
  importeFuncion: number;
  importeNaturaleza: number;
}

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

  const erQuery = useQuery({
    queryKey: ['reportes', empresaId, 'estado-resultados', periodo, acumuladoAlMes],
    queryFn: () => reportesApi.getEstadoResultados(empresaId, periodo, acumuladoAlMes),
    enabled: Boolean(empresaId),
    staleTime: 0
  });

  const lineas = useMemo<LineaEstadoResultados[]>(() => {
    const data = erQuery.data;
    if (!data || (!data.porNaturaleza && !data.porFuncion)) return [];
    const nat = data.porNaturaleza || {};
    const func = data.porFuncion || {};
    return [
      {
        id: 'er-1',
        codigo: '70',
        concepto: 'Ventas Netas de Bienes y Servicios',
        importeFuncion: Number(func.ventasNetas) || 0,
        importeNaturaleza: Number(nat.ventasNetas) || 0
      },
      {
        id: 'er-2',
        codigo: '69 / 60-61',
        concepto: '(-) Costo de Ventas / Compras y Variación de Inventarios',
        importeFuncion: -Math.abs(Number(func.costoVentas) || 0),
        importeNaturaleza: (Number(nat.variacionInventarios) || 0) - (Number(nat.comprasNetas) || 0)
      },
      {
        id: 'er-3',
        codigo: '80',
        concepto: 'UTILIDAD BRUTA / MARGEN COMERCIAL',
        esSubtotal: true,
        importeFuncion: Number(func.utilidadBruta) || 0,
        importeNaturaleza: Number(nat.margenComercial) || 0
      },
      {
        id: 'er-4',
        codigo: '94 / 62-63',
        concepto: '(-) Gastos de Administración / Cargas de Personal y Servicios',
        importeFuncion: -Math.abs(Number(func.gastosAdministracion) || 0),
        importeNaturaleza: -Math.abs((Number(nat.cargasPersonal) || 0) + (Number(nat.serviciosTerceros) || 0))
      },
      {
        id: 'er-5',
        codigo: '95 / 64-68',
        concepto: '(-) Gastos de Ventas / Otros Ingresos y Gastos Operativos',
        importeFuncion: -Math.abs(Number(func.gastosVentas) || 0),
        importeNaturaleza: Number(nat.otrosIngresosGastos) || 0
      },
      {
        id: 'er-6',
        codigo: '84',
        concepto: 'UTILIDAD OPERATIVA (RESULTADO DE EXPLOTACIÓN)',
        esSubtotal: true,
        importeFuncion: Number(func.utilidadOperativa) || 0,
        importeNaturaleza: Number(nat.resultadoExplotacion) || 0
      },
      {
        id: 'er-7',
        codigo: '77 - 67',
        concepto: '(+/-) Ingresos y Gastos Financieros Netos (Diferencia de Cambio)',
        importeFuncion: (Number(func.ingresosFinancieros) || 0) - (Number(func.gastosFinancieros) || 0),
        importeNaturaleza: (Number(nat.ingresosFinancieros) || 0) - (Number(nat.gastosFinancieros) || 0)
      },
      {
        id: 'er-8',
        codigo: '85',
        concepto: 'RESULTADO ANTES DEL IMPUESTO A LA RENTA',
        esSubtotal: true,
        importeFuncion: Number(func.resultadoAntesImpuestos) || 0,
        importeNaturaleza: Number(nat.resultadoAntesImpuestos) || 0
      },
      {
        id: 'er-9',
        codigo: '88',
        concepto: '(-) Impuesto a la Renta Corriente (TUO LIR)',
        importeFuncion: -Math.abs(Number(func.impuestoRenta) || 0),
        importeNaturaleza: -Math.abs(Number(nat.impuestoRenta) || 0)
      },
      {
        id: 'er-10',
        codigo: '89',
        concepto: 'UTILIDAD / PÉRDIDA NETA DEL EJERCICIO',
        esSubtotal: true,
        importeFuncion: Number(func.utilidadNeta) || 0,
        importeNaturaleza: Number(nat.utilidadNeta) || 0
      }
    ];
  }, [erQuery.data]);

  const columnas: ColumnaTablaDensa<LineaEstadoResultados>[] = [
    { key: 'codigo', header: 'PCGE', width: '95px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.codigo}</span> },
    {
      key: 'concepto',
      header: 'Rubro del Estado de Resultados (Formato 3.20 SUNAT)',
      render: (r) => <span className={r.esSubtotal ? 'font-bold text-[#111827]' : ''}>{r.concepto}</span>,
    },
    {
      key: 'importeFuncion',
      header: 'Por Función (Elem. 9) S/',
      width: '165px',
      align: 'right',
      render: (r) => <span className={r.esSubtotal ? 'font-bold text-[#1E3A5F]' : ''}>{r.importeFuncion.toFixed(2)}</span>,
    },
    {
      key: 'importeNaturaleza',
      header: 'Por Naturaleza (Elem. 6) S/',
      width: '165px',
      align: 'right',
      render: (r) => <span className={r.esSubtotal ? 'font-bold text-[#1E3A5F]' : ''}>{r.importeNaturaleza.toFixed(2)}</span>,
    },
  ];

  const natResumen = erQuery.data?.porNaturaleza || {};
  const funcResumen = erQuery.data?.porFuncion || {};

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Estado de Resultados Integrales — Por Función y Por Naturaleza (Formato 3.20 SUNAT)"
        subtitulo="Conciliación simultánea del resultado del período según Elemento 9 (Función) y Elemento 6/7 (Naturaleza) desde PostgreSQL"
        acciones={[
          {
            id: 'actualizar',
            label: erQuery.isFetching ? 'Actualizando...' : 'Actualizar',
            icono: RefreshCw,
            onClick: () => void erQuery.refetch(),
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

      <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] flex flex-wrap items-center justify-between text-[12px] gap-2">
        <div className="flex flex-wrap items-center gap-5">
          <span><strong>VENTAS NETAS:</strong> <span className="font-mono font-bold text-[#1E3A5F]">S/ {Number(funcResumen.ventasNetas || 0).toFixed(2)}</span></span>
          <span><strong>UTILIDAD OPERATIVA:</strong> <span className="font-mono font-bold text-[#1E3A5F]">S/ {Number(funcResumen.utilidadOperativa || 0).toFixed(2)}</span></span>
          <span><strong>RESULTADO NETO (FUNCIÓN / NAT.):</strong> <span className="font-mono font-bold text-[#1E6F42]">S/ {Number(funcResumen.utilidadNeta ?? natResumen.utilidadNeta ?? 0).toFixed(2)}</span></span>
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
          definicion={construirDefinicionEstadoResultadosEstandar(empresa, erQuery.data || {}, periodo)}
        />
      )}
    </div>
  );
};
