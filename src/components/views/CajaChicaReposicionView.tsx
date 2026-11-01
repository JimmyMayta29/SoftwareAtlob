import React, { useState } from 'react';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';

interface LiquidacionReposicion {
  id: string;
  numeroLiquidacion: string;
  fechaCorte: string;
  codigoFondo: string;
  fondoAutorizadoPen: number;
  gastosRendidosPen: number;
  saldoEfectivoArqueoPen: number;
  importeReembolsarPen: number;
  estado: 'APROBADO' | 'REPUESTO';
}

export const CajaChicaReposicionView: React.FC = () => {
  const { notify } = useAppContext();
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionReposicion[]>([
    {
      id: 'rep-1',
      numeroLiquidacion: 'LIQ-2026-003',
      fechaCorte: '2026-03-20',
      codigoFondo: 'FF-SEDE-01',
      fondoAutorizadoPen: 2000.0,
      gastosRendidosPen: 206.6,
      saldoEfectivoArqueoPen: 1793.4,
      importeReembolsarPen: 206.6,
      estado: 'APROBADO',
    },
  ]);

  const contabilizarReposicion = () => {
    setLiquidaciones((prev) => prev.map((l) => ({ ...l, estado: 'REPUESTO' })));
    notify('Asiento de reposición de fondo fijo (102101 contra 104101) contabilizado', 'success');
  };

  const columnas: ColumnaTablaDensa<LiquidacionReposicion>[] = [
    { key: 'numeroLiquidacion', header: 'N° Liquidación', width: '115px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.numeroLiquidacion}</span> },
    { key: 'fechaCorte', header: 'Fecha Arqueo', width: '95px', render: (r) => <span className="font-mono">{r.fechaCorte}</span> },
    { key: 'codigoFondo', header: 'Fondo Fijo', width: '100px', render: (r) => <span className="font-mono">{r.codigoFondo}</span> },
    { key: 'fondoAutorizadoPen', header: 'Fondo Fijo S/', width: '115px', align: 'right', render: (r) => r.fondoAutorizadoPen.toFixed(2) },
    { key: 'gastosRendidosPen', header: 'Gastos Rendidos S/', width: '130px', align: 'right', render: (r) => r.gastosRendidosPen.toFixed(2) },
    { key: 'saldoEfectivoArqueoPen', header: 'Efectivo en Caja S/', width: '130px', align: 'right', render: (r) => r.saldoEfectivoArqueoPen.toFixed(2) },
    { key: 'importeReembolsarPen', header: 'Importe a Reponer S/', width: '135px', align: 'right', render: (r) => <span className="font-bold text-[#1E3A5F]">{r.importeReembolsarPen.toFixed(2)}</span> },
    { key: 'estado', header: 'Estado', width: '100px', align: 'center', render: (r) => <span className="font-bold text-[#1E6F42] text-[11px]">{r.estado}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Arqueo y Reposición de Fondo Fijo de Caja Chica"
        subtitulo="Reembolso bancario del importe gastado para restituir el saldo autorizado de la cuenta 102"
        acciones={[
          {
            id: 'reponer',
            label: 'Emitir Reembolso y Contabilizar',
            icono: CheckCircle2,
            primario: true,
            onClick: contabilizarReposicion,
          },
        ]}
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={liquidaciones}
          rowKey={(r) => r.id}
        />
      </div>
    </div>
  );
};
