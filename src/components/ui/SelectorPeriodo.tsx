import React from 'react';
import { Calendar, Lock, Unlock } from 'lucide-react';

export interface SelectorPeriodoProps {
  periodo: string;
  onChangePeriodo?: (nuevoPeriodo: string) => void;
  onChange?: (nuevoPeriodo: string) => void;
  cerrado?: boolean;
  empresaRuc?: string;
  empresaRazonSocial?: string;
}

const MESES_NOMBRES: Record<string, string> = {
  '01': 'ENERO',
  '02': 'FEBRERO',
  '03': 'MARZO',
  '04': 'ABRIL',
  '05': 'MAYO',
  '06': 'JUNIO',
  '07': 'JULIO',
  '08': 'AGOSTO',
  '09': 'SETIEMBRE',
  '10': 'OCTUBRE',
  '11': 'NOVIEMBRE',
  '12': 'DICIEMBRE',
};

export function formatearPeriodoTexto(periodo: string): string {
  const [anio, mes] = (periodo || '2026-09').split('-');
  return `${MESES_NOMBRES[mes] || 'MES'} ${anio}`;
}

export const SelectorPeriodo: React.FC<SelectorPeriodoProps> = ({
  periodo,
  onChangePeriodo,
  onChange,
  cerrado = false,
  empresaRuc,
  empresaRazonSocial,
}) => {
  const handleCambio = onChangePeriodo || onChange;

  return (
    <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-[#F5F7FA] border border-[#D1D5DB] text-[12px] text-[#111827] rounded-none">
      {empresaRuc && (
        <span className="tabular-nums font-bold text-[#1E3A5F]">RUC {empresaRuc}</span>
      )}
      {empresaRazonSocial && (
        <span className="truncate max-w-[200px] text-[#4B5563]">{empresaRazonSocial}</span>
      )}
      <div className="flex items-center gap-1">
        <Calendar className="w-3.5 h-3.5 text-[#1E3A5F]" strokeWidth={1.5} />
        {handleCambio ? (
          <input
            type="month"
            value={periodo}
            onChange={(e) => handleCambio(e.target.value)}
            className="bg-[#FFFFFF] border border-[#D1D5DB] px-1.5 py-0.2 text-[12px] tabular-nums focus:outline-none focus:border-[#1E3A5F] rounded-none"
          />
        ) : (
          <span className="font-bold">{formatearPeriodoTexto(periodo)}</span>
        )}
      </div>
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.2 text-[11px] border ${
          cerrado
            ? 'bg-[#FEF2F2] text-[#B91C1C] border-[#B91C1C]'
            : 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]'
        }`}
      >
        {cerrado ? <Lock className="w-3 h-3" strokeWidth={1.5} /> : <Unlock className="w-3 h-3" strokeWidth={1.5} />}
        {cerrado ? 'CERRADO' : 'ABIERTO'}
      </span>
    </div>
  );
};
