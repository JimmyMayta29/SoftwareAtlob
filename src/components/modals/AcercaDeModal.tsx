import React from 'react';
import { X, ShieldCheck, CheckCircle2, Code2, Building2 } from 'lucide-react';

interface AcercaDeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AcercaDeModal: React.FC<AcercaDeModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 font-['Segoe_UI',system-ui,Arial,sans-serif]">
      <div className="bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 shadow-2xl max-w-lg w-full overflow-hidden text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white">
          <div className="flex items-center space-x-2.5">
            <div className="w-[22px] h-[22px] rounded-[4px] bg-[#1D4ED8] flex items-center justify-center text-white font-bold text-[13px] shadow">
              A
            </div>
            <span className="font-bold text-sm tracking-wide">
              Atlob Consultores ERP
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6 space-y-4">
          <div className="text-center pb-3 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Sistema Contable & Tributario SUNAT / PCGE
            </h2>
            <div className="text-blue-600 dark:text-blue-400 font-semibold text-xs mt-0.5">
              Versión 2026.1 Profesional Multicliente
            </div>
            <div className="inline-block mt-2 px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-full font-medium text-slate-700 dark:text-slate-300 text-[11.5px]">
              Desarrollado por <span className="font-bold text-slate-900 dark:text-white">Jimmy Mayta</span>
            </div>
          </div>

          <div className="space-y-2.5 text-slate-600 dark:text-slate-300 leading-relaxed text-[11.5px]">
            <p>
              <strong>Atlob Consultores ERP</strong> es una solución integral diseñada para la gestión contable, tributaria y financiera en el Perú, estructurada bajo los estándares normativos de SUNAT y la profesión contable:
            </p>

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-medium">
              <li className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span>Plan Contable General Empresarial (PCGE)</span>
              </li>
              <li className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span>SIRE SUNAT (RCE Compras & RVIE Ventas)</span>
              </li>
              <li className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span>Libros Electrónicos PLE 5.2 (TXT Oficial)</span>
              </li>
              <li className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span>Liquidación PDT 621 IGV-Renta</span>
              </li>
              <li className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span>Facturación Electrónica UBL 2.1 & CDR</span>
              </li>
              <li className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span>Caja Chica & Conciliación Bancaria</span>
              </li>
            </ul>
          </div>

          <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded border border-slate-200 dark:border-slate-600 text-[11px] text-slate-500 dark:text-slate-400">
            <div><strong>Firma Contable:</strong> Atlob Consultores S.A.C.</div>
            <div><strong>Ingeniería & Arquitectura de Software:</strong> Jimmy Mayta</div>
            <div><strong>Entorno Operativo:</strong> Consola de escritorio / Navegador web</div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-700/40 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-[11px] text-slate-500">
          <span>© 2026 Atlob Consultores · Jimmy Mayta</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
};
