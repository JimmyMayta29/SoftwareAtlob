import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';

interface LineaNic7 {
  id: string;
  actividad: 'OPERACIÓN' | 'INVERSIÓN' | 'FINANCIAMIENTO' | 'CONCILIACIÓN';
  concepto: string;
  importePen: number;
}

const LINEAS_NIC7: LineaNic7[] = [
  { id: 'ef-1', actividad: 'OPERACIÓN', concepto: 'Cobranzas a clientes por venta de bienes y prestación de servicios', importePen: 168400.0 },
  { id: 'ef-2', actividad: 'OPERACIÓN', concepto: '(-) Pagos a proveedores de bienes y servicios', importePen: -94200.0 },
  { id: 'ef-3', actividad: 'OPERACIÓN', concepto: '(-) Pagos a trabajadores y tributos (IGV, Renta, EsSalud, ONP)', importePen: -38500.0 },
  { id: 'ef-4', actividad: 'INVERSIÓN', concepto: '(-) Adquisición de propiedades, planta y equipo (Equipos de cómputo)', importePen: -8400.0 },
  { id: 'ef-5', actividad: 'FINANCIAMIENTO', concepto: '(-) Amortización de obligaciones financieras de corto plazo', importePen: -4500.0 },
  { id: 'ef-6', actividad: 'CONCILIACIÓN', concepto: 'AUMENTO NETO DE EFECTIVO Y EQUIVALENTES DE EFECTIVO DEL PERÍODO', importePen: 22800.0 },
  { id: 'ef-7', actividad: 'CONCILIACIÓN', concepto: '(+) Saldo de Efectivo y Equivalentes al Inicio del Ejercicio', importePen: 117040.5 },
  { id: 'ef-8', actividad: 'CONCILIACIÓN', concepto: 'SALDO DE EFECTIVO Y EQUIVALENTES AL FINALIZAR EL PERÍODO (Cta. 10)', importePen: 139840.5 },
];

export const FlujoEfectivoView: React.FC = () => {
  const { state } = useAppContext();
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-03');

  const columnas: ColumnaTablaDensa<LineaNic7>[] = [
    { key: 'actividad', header: 'Actividad NIC 7', width: '145px', render: (r) => <span className="font-bold text-[#1E3A5F] text-[11px]">{r.actividad}</span> },
    { key: 'concepto', header: 'Flujos de Efectivo (Formato 3.18 SUNAT — Método Directo)', render: (r) => <span className={r.actividad === 'CONCILIACIÓN' ? 'font-bold text-[#111827]' : ''}>{r.concepto}</span> },
    { key: 'importePen', header: 'Flujo S/', width: '135px', align: 'right', render: (r) => <span className={r.actividad === 'CONCILIACIÓN' ? 'font-bold text-[#1E3A5F]' : ''}>{r.importePen.toFixed(2)}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Estado de Flujos de Efectivo (NIC 7 / Formato 3.18 SUNAT)"
        subtitulo="Clasificación de movimientos de efectivo en Actividades de Operación, Inversión y Financiamiento"
        derecha={<SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={LINEAS_NIC7}
          rowKey={(r) => r.id}
        />
      </div>
    </div>
  );
};
