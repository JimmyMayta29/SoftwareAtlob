import React, { useState } from 'react';
import { Coins, X, Check, AlertCircle } from 'lucide-react';
import { tipoCambioApi, TipoCambioDTO } from '../../api/tipoCambioApi';
import { useToast } from '../../context/ToastContext';

interface ModalTipoCambioManualProps {
  isOpen: boolean;
  onClose: () => void;
  fechaInicial?: string;
  onGuardado?: (tc: TipoCambioDTO) => void;
}

export const ModalTipoCambioManual: React.FC<ModalTipoCambioManualProps> = ({
  isOpen,
  onClose,
  fechaInicial,
  onGuardado
}) => {
  const { success, error } = useToast();
  const hoyStr = fechaInicial || new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(hoyStr);
  const [compra, setCompra] = useState('3.750');
  const [venta, setVenta] = useState('3.758');
  const [guardando, setGuardando] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorLocal(null);
    const valCompra = parseFloat(compra);
    const valVenta = parseFloat(venta);

    if (isNaN(valCompra) || valCompra <= 0) {
      setErrorLocal('El tipo de cambio compra debe ser un número positivo.');
      return;
    }
    if (isNaN(valVenta) || valVenta <= 0) {
      setErrorLocal('El tipo de cambio venta debe ser un número positivo.');
      return;
    }

    try {
      setGuardando(true);
      const res = await tipoCambioApi.guardar({
        fecha,
        compra: valCompra,
        venta: valVenta,
        fuente: 'MANUAL'
      });
      success(`Tipo de cambio para ${fecha} guardado en la base de datos (Compra: ${valCompra.toFixed(3)}, Venta: ${valVenta.toFixed(3)}).`);
      if (onGuardado) onGuardado(res);
      onClose();
    } catch (err: any) {
      setErrorLocal(err?.response?.data?.message || err.message || 'Error guardando tipo de cambio');
      error('No se pudo registrar el tipo de cambio');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 select-none">
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-sm w-full overflow-hidden text-xs">
        <div className="flex items-center justify-between px-4 py-3 bg-[#01172C] text-white">
          <div className="flex items-center gap-2 font-bold text-sm">
            <Coins className="w-4 h-4 text-amber-400" />
            <span>Ingreso Manual de Tipo de Cambio</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
          <p className="text-slate-600 text-[11px]">
            Registre la cotización oficial para la fecha contable seleccionada. Se almacenará en la tabla unificada <strong className="font-mono text-slate-800">tipos_cambio</strong>.
          </p>

          {errorLocal && (
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2 text-[11px]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorLocal}</span>
            </div>
          )}

          <div>
            <label className="block text-slate-700 font-bold mb-1">Fecha Contable:</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full h-8 px-2.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs focus:bg-white focus:border-[#1E3A5F] focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-bold mb-1">TC Compra (S/):</label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                value={compra}
                onChange={(e) => setCompra(e.target.value)}
                className="w-full h-8 px-2.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs focus:bg-white focus:border-[#1E3A5F] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">TC Venta (S/):</label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                value={venta}
                onChange={(e) => setVenta(e.target.value)}
                className="w-full h-8 px-2.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs focus:bg-white focus:border-[#1E3A5F] focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="px-3 py-1.5 rounded bg-[#01172C] hover:bg-[#1E3A5F] text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{guardando ? 'Guardando...' : 'Guardar Tipo de Cambio'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

