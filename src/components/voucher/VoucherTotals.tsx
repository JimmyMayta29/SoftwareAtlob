import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

interface VoucherTotalsProps {
  totalDebePen: number;
  totalHaberPen: number;
  diferenciaPen: number;
  totalDebeUsd: number;
  totalHaberUsd: number;
  diferenciaUsd: number;
  moneda: 'PEN' | 'USD';
  estaCuadrado: boolean;
  cantidadLineas: number;
}

export const VoucherTotals: React.FC<VoucherTotalsProps> = ({
  totalDebePen,
  totalHaberPen,
  diferenciaPen,
  totalDebeUsd,
  totalHaberUsd,
  diferenciaUsd,
  estaCuadrado,
  cantidadLineas,
}) => {
  return (
    <div className="bg-slate-200 border-t border-b border-slate-400 px-3 py-1.5 flex flex-wrap items-center justify-between font-mono text-xs select-none">
      {/* Indicador de Cuadre de Partida Doble */}
      <div className="flex items-center gap-2">
        {estaCuadrado ? (
          <div className="flex items-center gap-1.5 bg-emerald-100 border border-emerald-500 text-emerald-900 px-2 py-0.5 font-bold text-[11px]">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
            <span>PARTIDA DOBLE EXACTA (DIF: S/ 0.00)</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-rose-100 border border-rose-500 text-rose-900 px-2 py-0.5 font-bold text-[11px]">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />
            <span>DESCUADRE DE ASIENTO: S/ {Math.abs(diferenciaPen).toFixed(2)}</span>
          </div>
        )}
        <span className="text-slate-600 font-sans text-[11px]">
          ({cantidadLineas} líneas)
        </span>
      </div>

      {/* Totales Numéricos PEN y USD */}
      <div className="flex items-center gap-5">
        {/* Soles */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-600 font-sans font-bold uppercase">Soles (S/):</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-500">Debe:</span>
            <span className="font-bold text-slate-900 bg-white px-1.5 py-0.5 border border-slate-300 min-w-[70px] text-right">
              {totalDebePen.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-500">Haber:</span>
            <span className="font-bold text-slate-900 bg-white px-1.5 py-0.5 border border-slate-300 min-w-[70px] text-right">
              {totalHaberPen.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-500">Dif:</span>
            <span
              className={`font-bold px-1.5 py-0.5 border min-w-[60px] text-right ${
                estaCuadrado
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-rose-50 border-rose-400 text-rose-800'
              }`}
            >
              {diferenciaPen.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Dólares */}
        <div className="hidden lg:flex items-center gap-3 border-l border-slate-300 pl-4">
          <span className="text-[10px] text-slate-600 font-sans font-bold uppercase">USD ($):</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-500">Debe:</span>
            <span className="text-slate-700 bg-slate-100 px-1 py-0.5 border border-slate-300 min-w-[60px] text-right">
              {totalDebeUsd.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-500">Haber:</span>
            <span className="text-slate-700 bg-slate-100 px-1 py-0.5 border border-slate-300 min-w-[60px] text-right">
              {totalHaberUsd.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-500">Dif:</span>
            <span
              className={`px-1 py-0.5 border min-w-[50px] text-right ${
                Math.abs(diferenciaUsd) < 0.01
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-rose-50 border-rose-400 text-rose-800'
              }`}
            >
              {diferenciaUsd.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

