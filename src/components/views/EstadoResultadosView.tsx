import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';

interface LineaEstadoResultados {
  id: string;
  codigo: string;
  concepto: string;
  esSubtotal?: boolean;
  importeFuncion: number;
  importeNaturaleza: number;
}

export const EstadoResultadosView: React.FC = () => {
  const { state } = useAppContext();
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-03');
  const [lineas, setLineas] = useState<LineaEstadoResultados[]>([]);
  const [cargando, setCargando] = useState(false);

  const empresaId = typeof state.activeEmpresa === 'string' ? state.activeEmpresa : (state.activeEmpresa as any)?.id;

  const cargarResultados = async () => {
    if (!empresaId) return;
    setCargando(true);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/estado-resultados?periodo=${periodo}`, {
        headers: {
          ...(state.token ? { Authorization: `Bearer ${state.token}` } : {})
        }
      });
      const json = await res.json().catch(() => null);
      const data = json?.data;
      if (data && (data.porNaturaleza || data.porFuncion)) {
        const nat = data.porNaturaleza || {};
        const func = data.porFuncion || {};
        const rows: LineaEstadoResultados[] = [
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
            importeNaturaleza: -Math.abs(Number(nat.comprasNetas) || 0)
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
            codigo: '95 / 65-68',
            concepto: '(-) Gastos de Ventas / Otros Gastos y Provisiones',
            importeFuncion: -Math.abs(Number(func.gastosVentas) || 0),
            importeNaturaleza: -Math.abs(Number(nat.otrosIngresosGastos) || 0)
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
        setLineas(rows);
      } else {
        setLineas([]);
      }
    } catch {
      setLineas([]);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarResultados();
  }, [empresaId, periodo]);

  const columnas: ColumnaTablaDensa<LineaEstadoResultados>[] = [
    { key: 'codigo', header: 'PCGE', width: '90px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.codigo}</span> },
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

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Estado de Resultados Integrales — Por Función y Por Naturaleza (Formato 3.20 SUNAT)"
        subtitulo="Conciliación simultánea del resultado del período según Elemento 9 (Función) y Elemento 6/7 (Naturaleza)"
        derecha={<SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={lineas}
          rowKey={(r) => r.id}
        />
      </div>
    </div>
  );
};
