import React, { useState } from 'react';
import { Calculator, X, RefreshCw, Copy, Check } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface CalculadoraContableModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CalculadoraContableModal: React.FC<CalculadoraContableModalProps> = ({
  isOpen,
  onClose
}) => {
  const { success } = useToast();
  const [tab, setTab] = useState<'IGV' | 'DETRACCION' | 'CUARTA' | 'TIM'>('IGV');

  // IGV
  const [montoTotal, setMontoTotal] = useState<number>(1180);
  const baseImponible = Number((montoTotal / 1.18).toFixed(2));
  const igvCalculado = Number((montoTotal - baseImponible).toFixed(2));

  // Detracción
  const [importeFactura, setImporteFactura] = useState<number>(5000);
  const [tasaDetraccion, setTasaDetraccion] = useState<number>(12); // 4, 10, 12, 15
  const montoDetraccion = Math.round(importeFactura * (tasaDetraccion / 100));
  const netoAPagar = importeFactura - montoDetraccion;

  // Cuarta Categoría (8%)
  const [honorarioBruto, setHonorarioBruto] = useState<number>(3500);
  const retencionCuarta = honorarioBruto > 1500 ? Number((honorarioBruto * 0.08).toFixed(2)) : 0;
  const netoCobrar = honorarioBruto - retencionCuarta;

  // TIM (Tasa de Interés Moratorio SUNAT: 0.03% diario)
  const [deudaTributaria, setDeudaTributaria] = useState<number>(2500);
  const [diasMora, setDiasMora] = useState<number>(45);
  const interesMoratorio = Number((deudaTributaria * (0.0003 * diasMora)).toFixed(2));
  const totalConInteres = deudaTributaria + interesMoratorio;

  const copiarPortapapeles = (valor: number, texto: string) => {
    navigator.clipboard.writeText(valor.toFixed(2));
    success(`${texto}: S/ ${valor.toFixed(2)} copiado al portapapeles.`, 'Copiado');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 shadow-2xl max-w-lg w-full overflow-hidden text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-100 dark:bg-slate-700/60 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center space-x-2">
            <span className="p-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
              <Calculator className="w-4 h-4" />
            </span>
            <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
              Calculadora Contable & Tributaria SUNAT
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs de tipo de cálculo */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 font-medium bg-slate-50 dark:bg-slate-800 text-[11.5px]">
          <button
            onClick={() => setTab('IGV')}
            className={`flex-1 py-2 text-center border-b-2 transition-colors ${
              tab === 'IGV'
                ? 'border-blue-600 text-blue-600 font-bold bg-white dark:bg-slate-800'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Desglose IGV 18%
          </button>
          <button
            onClick={() => setTab('DETRACCION')}
            className={`flex-1 py-2 text-center border-b-2 transition-colors ${
              tab === 'DETRACCION'
                ? 'border-blue-600 text-blue-600 font-bold bg-white dark:bg-slate-800'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Detracciones (SPOT)
          </button>
          <button
            onClick={() => setTab('CUARTA')}
            className={`flex-1 py-2 text-center border-b-2 transition-colors ${
              tab === 'CUARTA'
                ? 'border-blue-600 text-blue-600 font-bold bg-white dark:bg-slate-800'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            4ta Categoría (8%)
          </button>
          <button
            onClick={() => setTab('TIM')}
            className={`flex-1 py-2 text-center border-b-2 transition-colors ${
              tab === 'TIM'
                ? 'border-blue-600 text-blue-600 font-bold bg-white dark:bg-slate-800'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Intereses SUNAT (TIM)
          </button>
        </div>

        {/* CONTENIDOS */}
        <div className="p-5 space-y-4">
          {tab === 'IGV' && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                  Importe Total del Comprobante (S/)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={montoTotal}
                  onChange={(e) => setMontoTotal(Number(e.target.value))}
                  className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-600 font-mono text-base font-bold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded border border-slate-200 dark:border-slate-600">
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Base Imponible</span>
                    <button
                      onClick={() => copiarPortapapeles(baseImponible, 'Base')}
                      title="Copiar"
                      className="hover:text-blue-600"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="text-base font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
                    S/ {baseImponible.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded border border-slate-200 dark:border-slate-600">
                  <div className="flex justify-between items-center text-slate-500">
                    <span>I.G.V. 18%</span>
                    <button
                      onClick={() => copiarPortapapeles(igvCalculado, 'IGV')}
                      title="Copiar"
                      className="hover:text-blue-600"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="text-base font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
                    S/ {igvCalculado.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'DETRACCION' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                    Importe Factura (S/)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={importeFactura}
                    onChange={(e) => setImporteFactura(Number(e.target.value))}
                    className="w-full p-2 rounded border border-slate-300 dark:border-slate-600 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                    Tasa SPOT SUNAT
                  </label>
                  <select
                    value={tasaDetraccion}
                    onChange={(e) => setTasaDetraccion(Number(e.target.value))}
                    className="w-full p-2 rounded border border-slate-300 dark:border-slate-600 font-semibold"
                  >
                    <option value={4}>4% - Transporte de Carga / Pasajeros</option>
                    <option value={10}>10% - Demás servicios gravados con IGV</option>
                    <option value={12}>12% - Contratos de construcción / Intermediación</option>
                    <option value={15}>15% - Arrendamiento de bienes muebles</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-amber-50 dark:bg-amber-950/40 p-3 rounded border border-amber-200 dark:border-amber-800">
                  <span className="text-amber-800 dark:text-amber-300 font-medium">
                    Depósito en Banco de la Nación (SPOT)
                  </span>
                  <div className="text-base font-bold font-mono text-amber-700 dark:text-amber-400 mt-1">
                    S/ {montoDetraccion.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded border border-emerald-200 dark:border-emerald-800">
                  <span className="text-emerald-800 dark:text-emerald-300 font-medium">
                    Neto a Transferir al Proveedor
                  </span>
                  <div className="text-base font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-1">
                    S/ {netoAPagar.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'CUARTA' && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                  Honorario Bruto del Recibo (S/)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={honorarioBruto}
                  onChange={(e) => setHonorarioBruto(Number(e.target.value))}
                  className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-600 font-mono text-base font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded border border-slate-200 dark:border-slate-600">
                  <span className="text-slate-500 font-medium">Retención 8% (SUNAT)</span>
                  <div className="text-base font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
                    S/ {retencionCuarta.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-slate-400">Aplica para recibos &gt; S/ 1,500</span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded border border-slate-200 dark:border-slate-600">
                  <span className="text-slate-500 font-medium">Neto a Pagar al Profesional</span>
                  <div className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                    S/ {netoCobrar.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'TIM' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                    Tributo Insoluto (S/)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={deudaTributaria}
                    onChange={(e) => setDeudaTributaria(Number(e.target.value))}
                    className="w-full p-2 rounded border border-slate-300 dark:border-slate-600 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                    Días Calendario de Mora
                  </label>
                  <input
                    type="number"
                    value={diasMora}
                    onChange={(e) => setDiasMora(Number(e.target.value))}
                    className="w-full p-2 rounded border border-slate-300 dark:border-slate-600 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded border border-slate-200 dark:border-slate-600">
                  <span className="text-slate-500 font-medium">Interés Moratorio (0.03% diario)</span>
                  <div className="text-base font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
                    S/ {interesMoratorio.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950/40 p-3 rounded border border-blue-200 dark:border-blue-800">
                  <span className="text-blue-800 dark:text-blue-300 font-medium">
                    Deuda Total Actualizada
                  </span>
                  <div className="text-base font-bold font-mono text-blue-700 dark:text-blue-400 mt-1">
                    S/ {totalConInteres.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-700/40 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-blue-600 text-white font-medium text-xs hover:bg-blue-700"
          >
            Cerrar Calculadora
          </button>
        </div>
      </div>
    </div>
  );
};
