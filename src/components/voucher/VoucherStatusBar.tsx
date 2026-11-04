import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface VoucherStatusBarProps {
  empresaRuc: string;
  empresaRazonSocial: string;
  periodo: string;
  usuarioNombre: string;
  usuarioRol: string;
  tipoCambioVenta: number;
  mensajeEstado?: string;
  primerErrorValidacion?: string | null;
  teclaFoco?: string;
}

export const VoucherStatusBar: React.FC<VoucherStatusBarProps> = ({
  empresaRuc,
  empresaRazonSocial,
  periodo,
  usuarioNombre,
  usuarioRol,
  tipoCambioVenta,
  mensajeEstado,
  primerErrorValidacion,
}) => {
  return (
    <div className="bg-slate-800 text-slate-300 px-2.5 py-1 text-[10px] font-mono flex flex-wrap items-center justify-between border-t border-slate-700 select-none gap-2">
      {/* Sección Izquierda: Empresa, Periodo y Usuario */}
      <div className="flex items-center gap-3">
        <span className="text-white font-bold">
          {empresaRuc} — {empresaRazonSocial.slice(0, 32)}
        </span>
        <span className="text-slate-500">|</span>
        <span className="text-amber-400 font-bold">
          PERIODO: {periodo}
        </span>
        <span className="text-slate-500">|</span>
        <span>
          USER: <strong>{usuarioNombre}</strong> ({usuarioRol})
        </span>
        <span className="text-slate-500">|</span>
        <span>
          TC SBS: <strong>{tipoCambioVenta.toFixed(3)}</strong>
        </span>
      </div>

      {/* Sección Central: Mensaje de error o estado en tiempo real */}
      <div className="flex-1 px-3 text-center truncate">
        {primerErrorValidacion ? (
          <span className="text-rose-300 font-bold flex items-center justify-center gap-1.5 animate-pulse">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 inline" />
            {primerErrorValidacion}
          </span>
        ) : mensajeEstado ? (
          <span className="text-emerald-400 font-bold flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 inline" />
            {mensajeEstado}
          </span>
        ) : (
          <span className="text-slate-400">
            Listo para captura contable. Enter o Tab avanza celdas; F2 abre catálogo PCGE.
          </span>
        )}
      </div>

      {/* Sección Derecha: Atajos de Función Visibles */}
      <div className="flex items-center gap-2 text-slate-400">
        <span className="bg-slate-700 px-1 py-0.2 text-white font-bold">[F2] Catálogo</span>
        <span className="bg-slate-700 px-1 py-0.2 text-white font-bold">[F8] Contabilizar</span>
        <span className="bg-slate-700 px-1 py-0.2 text-white font-bold">[F10] Nuevo</span>
        <span className="bg-slate-700 px-1 py-0.2 text-white font-bold">[Ctrl+S] Guardar</span>
        <span className="bg-slate-700 px-1 py-0.2 text-slate-300">[Esc] Salir</span>
      </div>
    </div>
  );
};

