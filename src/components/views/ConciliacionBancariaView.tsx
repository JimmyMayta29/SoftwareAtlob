import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import Decimal from 'decimal.js';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';

interface PartidaConciliacion {
  id: string;
  fecha: string;
  operacionBanco: string;
  glosa: string;
  tipoPartida: 'CONCILIADO' | 'CHEQUE_NO_COBRADO' | 'CARGO_BANCARIO_ITF';
  importeLibros: number;
  importeExtracto: number;
}

export const ConciliacionBancariaView: React.FC = () => {
  const { state, notify } = useAppContext();
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-03');
  const [partidas] = useState<PartidaConciliacion[]>([
    {
      id: 'cb-1',
      fecha: '2026-03-05',
      operacionBanco: 'OP-884120',
      glosa: 'Cobranza Factura F001-0001510 Transferencia CCI',
      tipoPartida: 'CONCILIADO',
      importeLibros: 10030.0,
      importeExtracto: 10030.0,
    },
    {
      id: 'cb-2',
      fecha: '2026-03-12',
      operacionBanco: 'CHQ-004182',
      glosa: 'Cheque girado a proveedor en tránsito (pendiente de cobro)',
      tipoPartida: 'CHEQUE_NO_COBRADO',
      importeLibros: -2450.0,
      importeExtracto: 0.0,
    },
    {
      id: 'cb-3',
      fecha: '2026-03-31',
      operacionBanco: 'ITF-032026',
      glosa: 'Retención ITF 0.005% Ley N° 28194 y portes bancarios del mes',
      tipoPartida: 'CARGO_BANCARIO_ITF',
      importeLibros: 0.0,
      importeExtracto: -35.5,
    },
  ]);

  const saldoSegunLibros = new Decimal('84520.50');
  const masChequesEnTransito = new Decimal('2450.00');
  const menosCargosNoRegistrados = new Decimal('35.50');
  const saldoSegunExtracto = saldoSegunLibros.plus(masChequesEnTransito).minus(menosCargosNoRegistrados);

  const columnas: ColumnaTablaDensa<PartidaConciliacion>[] = [
    { key: 'fecha', header: 'Fecha', width: '90px', render: (r) => <span className="font-mono">{r.fecha}</span> },
    { key: 'operacionBanco', header: 'N° Operación', width: '110px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.operacionBanco}</span> },
    { key: 'glosa', header: 'Concepto / Movimiento', render: (r) => r.glosa },
    {
      key: 'tipoPartida',
      header: 'Estado Conciliación',
      width: '175px',
      render: (r) => (
        <span className={`font-bold text-[11px] ${r.tipoPartida === 'CONCILIADO' ? 'text-[#1E6F42]' : 'text-[#B45309]'}`}>
          {r.tipoPartida}
        </span>
      ),
    },
    { key: 'importeLibros', header: 'Mayor 1041 S/', width: '115px', align: 'right', render: (r) => r.importeLibros.toFixed(2) },
    { key: 'importeExtracto', header: 'Extracto Banco S/', width: '120px', align: 'right', render: (r) => r.importeExtracto.toFixed(2) },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Conciliación Bancaria Mensual (Libro Caja y Bancos 1.2 vs. Extracto Bancario)"
        subtitulo="Cruce de movimientos, cheques girados y no cobrados y cargos bancarios / ITF (0.005% Ley N° 28194)"
        acciones={[
          {
            id: 'generar-ajuste',
            label: 'Generar Asiento de Gastos Bancarios e ITF',
            icono: CheckCircle2,
            primario: true,
            onClick: () => notify('Asiento de regularización de portes e ITF (6391 / 6412 contra 1041) generado', 'success'),
          },
        ]}
        derecha={<SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] grid grid-cols-4 gap-3 text-[12px]">
        <div className="p-2 bg-[#FFFFFF] border border-[#D1D5DB] flex justify-between">
          <span className="text-[#4B5563]">Saldo según Libro Mayor (104101):</span>
          <span className="font-mono font-bold">S/ {saldoSegunLibros.toFixed(2)}</span>
        </div>
        <div className="p-2 bg-[#FFFFFF] border border-[#D1D5DB] flex justify-between">
          <span className="text-[#4B5563]">(+) Cheques girados no cobrados:</span>
          <span className="font-mono text-[#1E6F42]">+ S/ {masChequesEnTransito.toFixed(2)}</span>
        </div>
        <div className="p-2 bg-[#FFFFFF] border border-[#D1D5DB] flex justify-between">
          <span className="text-[#4B5563]">(-) Cargos bancarios / ITF mes:</span>
          <span className="font-mono text-[#B91C1C]">- S/ {menosCargosNoRegistrados.toFixed(2)}</span>
        </div>
        <div className="p-2 bg-[#E8ECF1] border border-[#D1D5DB] flex justify-between">
          <span className="font-bold text-[#111827]">Saldo Conciliado Extracto:</span>
          <span className="font-mono font-bold text-[#1E3A5F]">S/ {saldoSegunExtracto.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={partidas}
          rowKey={(r) => r.id}
        />
      </div>
    </div>
  );
};
