import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Check, AlertCircle, BookOpen } from 'lucide-react';
import { PLAN_CONTABLE_PCGE, CuentaPCGE } from '../../data/pcgeAccounts';

interface CatalogoCuentasDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCuenta: (cuenta: CuentaPCGE) => void;
  initialQuery?: string;
  filtroPrefijo?: string;
  permitirMayor?: boolean;
}

export const CatalogoCuentasDialog: React.FC<CatalogoCuentasDialogProps> = ({
  isOpen,
  onClose,
  onSelectCuenta,
  initialQuery = '',
  filtroPrefijo = '',
  permitirMayor = false,
}) => {
  const [searchTerm, setSearchTerm] = useState(initialQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm(initialQuery);
      setSelectedIndex(0);
      setErrorValidacion(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialQuery]);

  const cuentasFiltradas = PLAN_CONTABLE_PCGE.filter((c) => {
    if (filtroPrefijo && !c.codigo.startsWith(filtroPrefijo) && !searchTerm.trim()) {
      return false;
    }
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    return c.codigo.toLowerCase().includes(q) || (c.denominacion || c.nombre || '').toLowerCase().includes(q);
  }).slice(0, 100);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  if (!isOpen) return null;

  const handleSelect = (cuenta: CuentaPCGE) => {
    if (!permitirMayor && !cuenta.permiteMovimiento) {
      setErrorValidacion(`La cuenta ${cuenta.codigo} (${cuenta.denominacion || cuenta.nombre}) es cuenta de mayor no imputable. Debe seleccionar una subcuenta analítica de último nivel.`);
      return;
    }
    setErrorValidacion(null);
    onSelectCuenta(cuenta);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, cuentasFiltradas.length - 1));
      scrollActiveIntoView(selectedIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
      scrollActiveIntoView(selectedIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (cuentasFiltradas[selectedIndex]) {
        handleSelect(cuentasFiltradas[selectedIndex]);
      }
    }
  };

  const scrollActiveIntoView = (idx: number) => {
    if (!listRef.current) return;
    const items = listRef.current.children;
    if (items[idx]) {
      (items[idx] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
      <div 
        className="bg-white rounded-none border-2 border-slate-700 shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh] font-mono text-xs select-none"
        onKeyDown={handleKeyDown}
      >
        {/* Barra de Título Desktop Clásica */}
        <div className="bg-slate-800 text-white px-3 py-1.5 flex items-center justify-between font-bold text-xs">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-400" />
            <span>CATÁLOGO DE CUENTAS DEL PLAN CONTABLE GENERAL EMPRESARIAL (PCGE)</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white px-1.5 py-0.5 hover:bg-slate-700 rounded-none cursor-pointer"
            title="Cerrar [Esc]"
          >
            ✕
          </button>
        </div>

        {/* Input de Búsqueda Rápida */}
        <div className="p-2.5 bg-slate-100 border-b border-slate-300 flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Escriba código o nombre de la cuenta para filtrar... (ej: 1212, facturas, compras)"
            className="flex-1 bg-white border border-slate-400 px-2 py-1 text-slate-900 focus:outline-none focus:border-blue-600 font-mono text-xs"
          />
          <span className="text-[10px] text-slate-500 font-sans">
            {cuentasFiltradas.length} cuentas
          </span>
        </div>

        {/* Aviso de Validación / Restricción */}
        {errorValidacion && (
          <div className="bg-rose-100 border-b border-rose-300 text-rose-800 px-3 py-1.5 flex items-center gap-2 text-[11px] font-sans">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-semibold">{errorValidacion}</span>
          </div>
        )}

        {/* Lista Tabular de Cuentas */}
        <div className="bg-slate-200 border-b border-slate-400 grid grid-cols-12 px-2 py-1 font-bold text-[10px] text-slate-700 uppercase">
          <div className="col-span-2">Código</div>
          <div className="col-span-6">Denominación PCGE</div>
          <div className="col-span-2 text-center">Nivel / Estado</div>
          <div className="col-span-2 text-right">Requisitos</div>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto divide-y divide-slate-200 bg-white min-h-[280px]">
          {cuentasFiltradas.length === 0 ? (
            <div className="p-6 text-center text-slate-400 font-sans">
              No se encontraron cuentas contables que coincidan con &quot;{searchTerm}&quot;
            </div>
          ) : (
            cuentasFiltradas.map((c, idx) => {
              const isSelected = idx === selectedIndex;
              const esImputable = c.permiteMovimiento;
              return (
                <div
                  key={c.codigo}
                  onClick={() => handleSelect(c)}
                  className={`grid grid-cols-12 px-2 py-1 items-center cursor-pointer text-[11px] transition-colors ${
                    isSelected
                      ? 'bg-blue-800 text-white font-semibold'
                      : esImputable
                      ? 'hover:bg-blue-50 text-slate-800'
                      : 'bg-slate-50 text-slate-500 italic'
                  }`}
                >
                  <div className="col-span-2 font-bold tracking-wider">
                    {c.codigo}
                  </div>
                  <div className="col-span-6 truncate font-sans text-xs">
                    {c.denominacion}
                  </div>
                  <div className="col-span-2 text-center text-[10px]">
                    {esImputable ? (
                      <span className={`px-1.5 py-0.2 border ${isSelected ? 'border-emerald-300 text-emerald-200' : 'border-emerald-600 text-emerald-700'} font-bold`}>
                        IMPUTABLE
                      </span>
                    ) : (
                      <span className={`px-1.5 py-0.2 border ${isSelected ? 'border-amber-300 text-amber-200' : 'border-amber-600 text-amber-700'}`}>
                        MAYOR (NIVEL {c.nivel})
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 text-right text-[10px] font-sans truncate">
                    {c.requiereAnexo && <span className="mr-1">Anexo</span>}
                    {c.requiereDocumento && <span className="mr-1">Doc</span>}
                    {c.requiereCentroCosto && <span>C.Costo</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Barra de Estado Inferior con Teclas Rápidas */}
        <div className="bg-slate-100 border-t border-slate-300 px-3 py-1.5 flex items-center justify-between text-[11px] text-slate-600">
          <div className="flex items-center gap-3">
            <span>[▲/▼] Navegar</span>
            <span>[Enter] Seleccionar</span>
            <span>[Esc] Cerrar</span>
          </div>
          <div>
            <span className="font-semibold text-slate-700">
              * Solo cuentas de último nivel (Imputables) pueden registrar movimientos
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
