import React from 'react';
import { Plus, Edit3, Ban, Printer, Download, RefreshCw } from 'lucide-react';

export interface AccionBarraLocal {
  id: string;
  label: string;
  icono?: React.ComponentType<any>;
  primario?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export interface BarraHerramientasLocalProps {
  tituloModulo?: string;
  titulo?: string;
  subtitulo?: string;
  onNuevo?: () => void;
  labelNuevo?: string;
  onEditar?: () => void;
  onAnular?: () => void;
  onImprimir?: () => void;
  onExportar?: () => void;
  labelExportar?: string;
  onRefrescar?: () => void;
  deshabilitarEscritura?: boolean;
  motivoDeshabilitado?: string;
  accionesExtra?: React.ReactNode;
  derecha?: React.ReactNode;
  acciones?: AccionBarraLocal[];
}

export const BarraHerramientasLocal: React.FC<BarraHerramientasLocalProps> = ({
  tituloModulo,
  titulo,
  subtitulo,
  onNuevo,
  labelNuevo = 'Nuevo [Ins]',
  onEditar,
  onAnular,
  onImprimir,
  onExportar,
  labelExportar = 'Exportar TXT/CSV',
  onRefrescar,
  deshabilitarEscritura = false,
  motivoDeshabilitado = 'No disponible para el rol o estado del período actual',
  accionesExtra,
  derecha,
  acciones = [],
}) => {
  const tituloMostrar = tituloModulo || titulo || '';

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-[#FFFFFF] border border-[#D1D5DB] rounded-none mb-2">
      <div className="flex items-center gap-2 min-w-0">
        <h2 className="text-[13px] font-bold text-[#111827] truncate">{tituloMostrar}</h2>
        {subtitulo && (
          <span className="text-[11px] text-[#4B5563] font-light truncate">
            · {subtitulo}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {acciones.map((acc) => {
          const Icono = acc.icono;
          return (
            <button
              key={acc.id}
              type="button"
              disabled={acc.disabled || (acc.primario && deshabilitarEscritura)}
              onClick={acc.onClick}
              className={`h-6 px-2.5 text-[12px] inline-flex items-center gap-1 border rounded-none cursor-pointer disabled:cursor-not-allowed ${
                acc.primario
                  ? 'bg-[#1E3A5F] hover:bg-[#162C49] text-[#FFFFFF] border-[#1E3A5F] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] disabled:border-[#D1D5DB]'
                  : 'bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border-[#D1D5DB] disabled:bg-[#F5F7FA] disabled:text-[#9CA3AF]'
              }`}
            >
              {Icono && <Icono className="w-3.5 h-3.5" strokeWidth={1.5} />}
              <span>{acc.label}</span>
            </button>
          );
        })}

        {onNuevo && (
          <button
            type="button"
            onClick={onNuevo}
            disabled={deshabilitarEscritura}
            title={deshabilitarEscritura ? motivoDeshabilitado : labelNuevo}
            className="h-6 px-2.5 bg-[#1E3A5F] hover:bg-[#162C49] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-[#FFFFFF] text-[12px] flex items-center gap-1 border border-[#1E3A5F] disabled:border-[#D1D5DB] cursor-pointer disabled:cursor-not-allowed rounded-none"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>{labelNuevo}</span>
          </button>
        )}

        {onEditar && (
          <button
            type="button"
            onClick={onEditar}
            disabled={deshabilitarEscritura}
            title={deshabilitarEscritura ? motivoDeshabilitado : 'Editar registro seleccionado'}
            className="h-6 px-2 bg-[#FFFFFF] hover:bg-[#E8ECF1] disabled:bg-[#F5F7FA] disabled:text-[#9CA3AF] text-[#111827] text-[12px] flex items-center gap-1 border border-[#D1D5DB] cursor-pointer disabled:cursor-not-allowed rounded-none"
          >
            <Edit3 className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>Editar</span>
          </button>
        )}

        {onAnular && (
          <button
            type="button"
            onClick={onAnular}
            disabled={deshabilitarEscritura}
            title={deshabilitarEscritura ? motivoDeshabilitado : 'Anular registro'}
            className="h-6 px-2 bg-[#FFFFFF] hover:bg-[#FEF2F2] disabled:bg-[#F5F7FA] disabled:text-[#9CA3AF] text-[#B91C1C] text-[12px] flex items-center gap-1 border border-[#D1D5DB] cursor-pointer disabled:cursor-not-allowed rounded-none"
          >
            <Ban className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>Anular</span>
          </button>
        )}

        {onImprimir && (
          <button
            type="button"
            onClick={onImprimir}
            title="Imprimir / Vista previa PDF"
            className="h-6 px-2 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] text-[12px] flex items-center gap-1 border border-[#D1D5DB] cursor-pointer rounded-none"
          >
            <Printer className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>Imprimir</span>
          </button>
        )}

        {onExportar && (
          <button
            type="button"
            onClick={onExportar}
            title={labelExportar}
            className="h-6 px-2 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#1E6F42] text-[12px] flex items-center gap-1 border border-[#D1D5DB] cursor-pointer rounded-none"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>{labelExportar}</span>
          </button>
        )}

        {onRefrescar && (
          <button
            type="button"
            onClick={onRefrescar}
            title="Actualizar vista"
            className="h-6 px-2 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] text-[12px] flex items-center gap-1 border border-[#D1D5DB] cursor-pointer rounded-none"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        )}

        {accionesExtra}
        {derecha}
      </div>
    </div>
  );
};
