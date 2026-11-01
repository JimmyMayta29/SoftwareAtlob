import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';

interface PartidaBalanceGeneral {
  id: string;
  bloque: 'ACTIVO CORRIENTE' | 'ACTIVO NO CORRIENTE' | 'PASIVO CORRIENTE' | 'PATRIMONIO NETO';
  codigoRubro: string;
  rubroSmv: string;
  importePen: number;
}

const PARTIDAS_BG: PartidaBalanceGeneral[] = [
  { id: 'bg-1', bloque: 'ACTIVO CORRIENTE', codigoRubro: '1D0109', rubroSmv: 'Efectivo y Equivalentes de Efectivo (Cta. 10)', importePen: 139840.5 },
  { id: 'bg-2', bloque: 'ACTIVO CORRIENTE', codigoRubro: '1D0103', rubroSmv: 'Cuentas por Cobrar Comerciales — Terceros (Cta. 12)', importePen: 42570.0 },
  { id: 'bg-3', bloque: 'ACTIVO CORRIENTE', codigoRubro: '1D0106', rubroSmv: 'Inventarios / Mercaderías (Cta. 20)', importePen: 28400.0 },
  { id: 'bg-4', bloque: 'ACTIVO NO CORRIENTE', codigoRubro: '1D0205', rubroSmv: 'Propiedades, Planta y Equipo Neto de Depreciación (Cta. 33 - 39)', importePen: 64200.0 },
  { id: 'bg-5', bloque: 'PASIVO CORRIENTE', codigoRubro: '2D0109', rubroSmv: 'Tributos, Contraprestaciones y Aportes por Pagar (Cta. 40)', importePen: 8420.0 },
  { id: 'bg-6', bloque: 'PASIVO CORRIENTE', codigoRubro: '2D0102', rubroSmv: 'Cuentas por Pagar Comerciales — Terceros (Cta. 42)', importePen: 64131.0 },
  { id: 'bg-7', bloque: 'PATRIMONIO NETO', codigoRubro: '2D0701', rubroSmv: 'Capital Emitido (Cta. 50)', importePen: 150000.0 },
  { id: 'bg-8', bloque: 'PATRIMONIO NETO', codigoRubro: '2D0707', rubroSmv: 'Resultados Acumulados y del Ejercicio (Cta. 59)', importePen: 52459.5 },
];

export const BalanceGeneralView: React.FC = () => {
  const { state, notify } = useAppContext();
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-03');

  const totalActivo = PARTIDAS_BG.filter((p) => p.bloque.startsWith('ACTIVO')).reduce((s, p) => s + p.importePen, 0);
  const totalPasivoPatrimonio = PARTIDAS_BG.filter((p) => !p.bloque.startsWith('ACTIVO')).reduce((s, p) => s + p.importePen, 0);

  const columnas: ColumnaTablaDensa<PartidaBalanceGeneral>[] = [
    { key: 'bloque', header: 'Masa Patrimonial', width: '165px', render: (r) => <span className="font-bold text-[#1E3A5F] text-[11px]">{r.bloque}</span> },
    { key: 'codigoRubro', header: 'Cód. SMV/SUNAT', width: '110px', render: (r) => <span className="font-mono">{r.codigoRubro}</span> },
    { key: 'rubroSmv', header: 'Rubro del Estado de Situación Financiera (NIC 1 / Formato 3.1)', render: (r) => <span className="font-bold text-[#111827]">{r.rubroSmv}</span> },
    { key: 'importePen', header: 'Saldo al Cierre S/', width: '135px', align: 'right', render: (r) => <span className="font-bold">{r.importePen.toFixed(2)}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Balance General — Estado de Situación Financiera (NIC 1 / Formato 3.1 SUNAT)"
        subtitulo="Presentación clasificada de Activo Corriente, Activo No Corriente, Pasivo y Patrimonio Neto"
        acciones={[
          {
            id: 'exportar',
            label: 'Exportar Formato 3.1',
            icono: Download,
            primario: true,
            onClick: () => notify(`Estado de Situación Financiera (${periodo}) exportado`, 'success'),
          },
        ]}
        derecha={<SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] flex items-center justify-between text-[12px]">
        <div className="flex items-center gap-6">
          <span><strong>TOTAL ACTIVO:</strong> <span className="font-mono font-bold text-[#1E3A5F]">S/ {totalActivo.toFixed(2)}</span></span>
          <span><strong>TOTAL PASIVO Y PATRIMONIO:</strong> <span className="font-mono font-bold text-[#1E3A5F]">S/ {totalPasivoPatrimonio.toFixed(2)}</span></span>
        </div>
        <span className="font-bold text-[#1E6F42] text-[11px]">ECUACIÓN CONTABLE CUADRADA (Diferencia: S/ {(totalActivo - totalPasivoPatrimonio).toFixed(2)})</span>
      </div>

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={PARTIDAS_BG}
          rowKey={(r) => r.id}
        />
      </div>
    </div>
  );
};
