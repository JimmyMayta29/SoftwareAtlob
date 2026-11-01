import React, { useState } from 'react';
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

const LINEAS_ER: LineaEstadoResultados[] = [
  { id: 'er-1', codigo: '70', concepto: 'Ventas Netas de Bienes y Servicios', importeFuncion: 185400.0, importeNaturaleza: 185400.0 },
  { id: 'er-2', codigo: '69 / 60', concepto: '(-) Costo de Ventas / Compras y Variación de Existencias', importeFuncion: -92100.0, importeNaturaleza: -92100.0 },
  { id: 'er-3', codigo: '80', concepto: 'UTILIDAD BRUTA / MARGEN COMERCIAL', esSubtotal: true, importeFuncion: 93300.0, importeNaturaleza: 93300.0 },
  { id: 'er-4', codigo: '94 / 62-68', concepto: '(-) Gastos de Administración / Cargas de Personal y Servicios', importeFuncion: -26400.0, importeNaturaleza: -26400.0 },
  { id: 'er-5', codigo: '95 / 63-65', concepto: '(-) Gastos de Ventas y Distribución / Tributos y Diversos', importeFuncion: -14200.0, importeNaturaleza: -14200.0 },
  { id: 'er-6', codigo: '84', concepto: 'UTILIDAD OPERATIVA (RESULTADO DE EXPLOTACIÓN)', esSubtotal: true, importeFuncion: 52700.0, importeNaturaleza: 52700.0 },
  { id: 'er-7', codigo: '77 - 67', concepto: '(+/-) Ingresos y Gastos Financieros Netos (Diferencia de Cambio)', importeFuncion: -240.5, importeNaturaleza: -240.5 },
  { id: 'er-8', codigo: '85', concepto: 'RESULTADO ANTES DEL IMPUESTO A LA RENTA', esSubtotal: true, importeFuncion: 52459.5, importeNaturaleza: 52459.5 },
];

export const EstadoResultadosView: React.FC = () => {
  const { state } = useAppContext();
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-03');

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
          datos={LINEAS_ER}
          rowKey={(r) => r.id}
        />
      </div>
    </div>
  );
};
