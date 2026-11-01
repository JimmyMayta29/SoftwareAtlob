import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface VentanaModalProps {
  isOpen?: boolean;
  abierto?: boolean;
  onClose?: () => void;
  onCerrar?: () => void;
  titulo: string;
  subtitulo?: string;
  ancho?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const ANCHO_CLASES: Record<NonNullable<VentanaModalProps['ancho']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-6xl',
};

export const VentanaModal: React.FC<VentanaModalProps> = ({
  isOpen,
  abierto,
  onClose,
  onCerrar,
  titulo,
  subtitulo,
  ancho = 'lg',
  children,
  footer,
}) => {
  const visible = Boolean(isOpen ?? abierto);
  const handleClose = onClose || onCerrar || (() => {});

  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, handleClose]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      className="fixed inset-0 z-50 bg-[#111827]/50 flex items-center justify-center p-3 select-none"
    >
      <div
        className={`w-full ${ANCHO_CLASES[ancho]} bg-[#FFFFFF] border border-[#D1D5DB] flex flex-col max-h-[90vh] rounded-none`}
      >
        {/* Barra de título de ventana (13px negrita) */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#1E3A5F] text-[#FFFFFF] border-b border-[#D1D5DB]">
          <div className="flex items-center gap-2 truncate">
            <div className="w-4 h-4 bg-[#FFFFFF] text-[#1E3A5F] font-bold text-[10px] flex items-center justify-center shrink-0">
              A
            </div>
            <h2 className="text-[13px] font-bold tracking-tight truncate">{titulo}</h2>
            {subtitulo && (
              <span className="text-[11px] text-[#E8ECF1] font-light truncate">
                — {subtitulo}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar ventana"
            title="Cerrar [Esc]"
            className="w-5 h-5 flex items-center justify-center text-[#FFFFFF] hover:bg-[#B91C1C] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Cuerpo de la ventana (12px) */}
        <div className="p-3 overflow-y-auto flex-1 text-[12px] text-[#111827] select-text">
          {children}
        </div>

        {/* Pie de ventana opcional */}
        {footer && (
          <div className="px-3 py-2 bg-[#F5F7FA] border-t border-[#D1D5DB] flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
