import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, X } from 'lucide-react';
import { obtenerAccessToken } from '../../api/session';
import { ResumenLicenciaDTO, usuariosLicenciaApi } from '../../api/usuariosLicenciaApi';
import atlobIsotipo from '../../assets/brand/atlob_isotipo.webp';
import atlobLogo from '../../assets/brand/atlob_logo_horizontal.webp';

interface AcercaDeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AcercaDeModal: React.FC<AcercaDeModalProps> = ({ isOpen, onClose }) => {
  const [licencia, setLicencia] = useState<ResumenLicenciaDTO | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (!obtenerAccessToken()) {
      setLicencia({
        id: 'local',
        tipo: 'EVALUACION',
        maxUsuarios: 3,
        usuariosActivos: 1,
        vigenteHasta: null,
        creadaEn: new Date().toISOString(),
        puedeCrearUsuario: true
      });
      return;
    }
    let activo = true;
    usuariosLicenciaApi
      .obtenerResumenLicencia()
      .then(datos => {
        if (activo) setLicencia(datos);
      })
      .catch(() => {
        if (activo) setLicencia(null);
      });
    return () => {
      activo = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 font-['Segoe_UI',system-ui,Arial,sans-serif]">
      <div className="bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 shadow-2xl max-w-lg w-full overflow-hidden text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white">
          <div className="flex items-center space-x-2.5">
            <img
              src={atlobIsotipo}
              alt="ATLOB ERP"
              className="w-[22px] h-[22px] object-contain"
              width={22}
              height={22}
            />
            <span className="font-bold text-sm tracking-wide">
              ATLOB ERP
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded transition-colors"
            aria-label="Cerrar Acerca de"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6 space-y-4">
          <div className="text-center pb-3 border-b border-slate-200 dark:border-slate-700 flex flex-col items-center">
            <img
              src={atlobLogo}
              alt="ATLOB ERP"
              className="h-9 w-auto object-contain mb-2"
              width={160}
              height={60}
            />
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

          {/* Información de Licencia Local */}
          <div
            id="acerca-de-licencia"
            className="bg-indigo-50/80 border border-indigo-200 rounded-lg p-3.5 space-y-1.5 text-[11.5px]"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-indigo-600" />
                Licencia de esta instalación
              </span>
              <span className="px-2 py-0.5 rounded bg-white border border-indigo-200 font-bold text-indigo-700">
                {licencia ? (licencia.tipo === 'COMERCIAL' ? 'COMERCIAL' : 'EVALUACIÓN') : 'EVALUACIÓN'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 text-slate-700">
              <div>
                <span className="text-slate-500">Usuarios usados:</span>{' '}
                <strong id="acerca-de-usuarios-usados">{licencia ? licencia.usuariosActivos : '—'}</strong>
              </div>
              <div>
                <span className="text-slate-500">Máximo permitido:</span>{' '}
                <strong id="acerca-de-usuarios-max">{licencia ? `${licencia.maxUsuarios} usuarios` : '3 usuarios'}</strong>
              </div>
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
            <div><strong>Entorno Operativo:</strong> Aplicación de escritorio / Navegador web</div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-700/40 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-[11px] text-slate-500">
          <span>© 2026 Atlob Consultores · Jimmy Mayta</span>
          <button
            id="acerca-de-cerrar"
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors cursor-pointer"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
};
