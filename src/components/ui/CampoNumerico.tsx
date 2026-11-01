import React from 'react';
import Decimal from 'decimal.js';

export interface CampoNumericoProps {
  label?: string;
  valor?: number | string;
  value?: number | string;
  onChange: ((nuevoValor: any, decimalStr?: string) => void);
  decimales?: number;
  monedaPrefijo?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
}

export const CampoNumerico: React.FC<CampoNumericoProps> = ({
  label,
  valor,
  value,
  onChange,
  decimales = 2,
  monedaPrefijo = 'S/',
  min,
  max,
  disabled = false,
  className = '',
}) => {
  const esModoString = value !== undefined && valor === undefined;
  const valorActual = valor !== undefined ? valor : value ?? '';

  const emitirCambio = (num: number, str: string) => {
    if (esModoString) {
      onChange(str, str);
    } else {
      onChange(num, str);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    try {
      const limpio = e.target.value.replace(/[^0-9.-]/g, '') || '0';
      let d = new Decimal(limpio);
      if (min !== undefined && d.lessThan(min)) d = new Decimal(min);
      if (max !== undefined && d.greaterThan(max)) d = new Decimal(max);
      const redondeado = d.toDecimalPlaces(decimales, Decimal.ROUND_HALF_UP);
      emitirCambio(redondeado.toNumber(), redondeado.toFixed(decimales));
    } catch {
      emitirCambio(0, new Decimal(0).toFixed(decimales));
    }
  };

  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      {label && <label className="text-[11px] text-[#4B5563]">{label}</label>}
      <div className="relative flex items-center">
        {monedaPrefijo && (
          <span className="px-2 py-0.5 bg-[#F5F7FA] border border-r-0 border-[#D1D5DB] text-[11px] text-[#4B5563] select-none">
            {monedaPrefijo}
          </span>
        )}
        <input
          type="number"
          step={decimales === 3 ? '0.001' : '0.01'}
          min={min}
          max={max}
          disabled={disabled}
          value={valorActual}
          onChange={(e) => {
            const raw = e.target.value;
            const parsed = Number(raw);
            if (!Number.isNaN(parsed)) {
              emitirCambio(parsed, raw);
            } else if (esModoString) {
              onChange(raw, raw);
            }
          }}
          onBlur={handleBlur}
          className="w-full h-6 px-2 bg-[#FFFFFF] border border-[#D1D5DB] focus:border-[#1E3A5F] focus:outline-none text-right tabular-nums text-[12px] text-[#111827] rounded-none disabled:bg-[#F5F7FA]"
        />
      </div>
    </div>
  );
};
