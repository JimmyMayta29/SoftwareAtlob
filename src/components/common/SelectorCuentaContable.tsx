import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, BookOpen, X, Check, AlertCircle } from 'lucide-react';
import { PLAN_CONTABLE_PCGE, CuentaPCGE, buscarCuentaPCGE } from '../../data/pcgeAccounts';
import { CatalogoCuentasDialog } from '../voucher/CatalogoCuentasDialog';
import { useAppContext } from '../../context/AppContext';
import { pcgeApi } from '../../api/pcgeApi';

export interface SelectorCuentaContableProps {
  label?: string;
  value: string;
  onChange: (codigo: string, denominacion: string, cuenta?: CuentaPCGE) => void;
  placeholder?: string;
  filtroPrefijo?: string;
  soloImputables?: boolean;
  permitirMayor?: boolean;
  mostrarDenominacion?: boolean;
  tamano?: 'compacto' | 'normal';
  disabled?: boolean;
  className?: string;
  id?: string;
}

export const SelectorCuentaContable: React.FC<SelectorCuentaContableProps> = ({
  label,
  value,
  onChange,
  placeholder = 'Código o nombre de cuenta...',
  filtroPrefijo = '',
  soloImputables = true,
  permitirMayor = false,
  mostrarDenominacion = true,
  tamano = 'normal',
  disabled = false,
  className = '',
  id,
}) => {
  const [textoBusqueda, setTextoBusqueda] = useState(value || '');
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [desplegableAbierto, setDesplegableAbierto] = useState(false);
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(0);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { state } = useAppContext();
  const empresaId = typeof state.activeEmpresa === 'string' ? state.activeEmpresa : (state.activeEmpresa as any)?.id;
  const [cuentasEmpresa, setCuentasEmpresa] = useState<CuentaPCGE[]>([]);

  useEffect(() => {
    if (!empresaId) return;
    let activo = true;
    pcgeApi.obtenerPlanCuentas(empresaId)
      .then(res => {
        if (!activo || !res?.cuentas) return;
        const transformadas: CuentaPCGE[] = res.cuentas.map(c => ({
          codigo: c.codigo,
          nombre: c.nombre,
          denominacion: c.nombre,
          elemento: c.elemento,
          nivel: c.nivel,
          naturaleza: c.naturalezaSaldo === 'ACREEDORA' ? 'ACREEDORA' : 'DEUDORA',
          tipo: c.esRegistro ? 'DETALLE' : 'TITULO',
          tipoNormativo: 'ACTIVO',
          permiteMovimiento: c.permiteMovimiento,
          esRegistro: c.esRegistro,
          requiereAnexo: false,
          requiereDocumento: false,
          requiereCentroCosto: false,
          requiereVencimiento: false,
          monedaCuenta: 'PEN',
          clasificacionEeff: c.clasificacionEeff as any,
          naturalezaSaldo: c.naturalezaSaldo,
          signoEeff: c.signoEeff,
          esCorrectora: c.esCorrectora,
          esInactiva: c.esInactiva
        } as unknown as CuentaPCGE));
        setCuentasEmpresa(transformadas);
      })
      .catch(() => {});
    return () => { activo = false; };
  }, [empresaId]);

  const catalogoCompleto = useMemo(() => {
    if (cuentasEmpresa.length === 0) return PLAN_CONTABLE_PCGE;
    const mapa = new Map<string, CuentaPCGE>();
    for (const c of PLAN_CONTABLE_PCGE) mapa.set(c.codigo, c);
    for (const c of cuentasEmpresa) mapa.set(c.codigo, c);
    return Array.from(mapa.values());
  }, [cuentasEmpresa]);

  // Sincronizar texto cuando cambia `value` externamente
  useEffect(() => {
    setTextoBusqueda(value || '');
  }, [value]);

  // Buscar información de la cuenta actual
  const cuentaActual = useMemo(() => {
    if (!value) return null;
    return catalogoCompleto.find(c => c.codigo === value) || buscarCuentaPCGE(value) || null;
  }, [value, catalogoCompleto]);

  // Cuentas sugeridas según texto escrito
  const sugerencias = useMemo(() => {
    if (!desplegableAbierto || !textoBusqueda.trim()) return [];
    const q = textoBusqueda.toLowerCase().trim();
    return catalogoCompleto.filter((c) => {
      if (filtroPrefijo && !c.codigo.startsWith(filtroPrefijo)) return false;
      if (soloImputables && !permitirMayor && !c.permiteMovimiento) return false;
      return (
        c.codigo.toLowerCase().includes(q) ||
        (c.denominacion || c.nombre || '').toLowerCase().includes(q)
      );
    }).slice(0, 10);
  }, [textoBusqueda, desplegableAbierto, filtroPrefijo, soloImputables, permitirMayor, catalogoCompleto]);

  // Cerrar desplegable si se hace clic fuera
  useEffect(() => {
    const handleClickFuera = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setDesplegableAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, []);

  const seleccionarCuenta = (cuenta: CuentaPCGE) => {
    setTextoBusqueda(cuenta.codigo);
    setDesplegableAbierto(false);
    onChange(cuenta.codigo, cuenta.denominacion || cuenta.nombre, cuenta);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTextoBusqueda(val);
    setDesplegableAbierto(true);
    setIndiceSeleccionado(0);

    // Detección automática instantánea si es un código exacto
    const exacta = PLAN_CONTABLE_PCGE.find((c) => c.codigo === val.trim());
    if (exacta && (permitirMayor || !soloImputables || exacta.permiteMovimiento)) {
      onChange(exacta.codigo, exacta.denominacion || exacta.nombre, exacta);
    } else {
      onChange(val, '', undefined);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'F2') {
      e.preventDefault();
      setDialogoAbierto(true);
      return;
    }

    if (!desplegableAbierto || sugerencias.length === 0) {
      if (e.key === 'ArrowDown') {
        setDesplegableAbierto(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceSeleccionado((prev) => Math.min(prev + 1, sugerencias.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceSeleccionado((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (sugerencias[indiceSeleccionado]) {
        seleccionarCuenta(sugerencias[indiceSeleccionado]);
      }
    } else if (e.key === 'Escape') {
      setDesplegableAbierto(false);
    }
  };

  const limpiarSeleccion = () => {
    setTextoBusqueda('');
    onChange('', '');
    setDesplegableAbierto(false);
    inputRef.current?.focus();
  };

  const esCompacto = tamano === 'compacto';

  return (
    <div ref={contenedorRef} className={`relative flex flex-col ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold text-slate-700 mb-1">
          {label}
        </label>
      )}
      <div className="flex items-center gap-1.5 w-full">
        <div className="relative flex-1 flex items-center">
          <input
            ref={inputRef}
            id={id}
            type="text"
            value={textoBusqueda}
            onChange={handleInputChange}
            onFocus={() => {
              if (textoBusqueda.trim()) setDesplegableAbierto(true);
            }}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            className={`w-full font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
              esCompacto ? 'p-1.5 text-xs' : 'p-2 text-xs'
            } ${value ? 'pr-6' : ''} ${disabled ? 'bg-slate-100 cursor-not-allowed' : ''}`}
            title="Escriba código o nombre de cuenta, o presione [F2] para abrir el catálogo"
          />

          {value && !disabled && (
            <button
              type="button"
              onClick={limpiarSeleccion}
              tabIndex={-1}
              className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer"
              title="Borrar cuenta seleccionada"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Botón para abrir el diálogo del catálogo */}
        <button
          type="button"
          onClick={() => setDialogoAbierto(true)}
          disabled={disabled}
          tabIndex={-1}
          className={`flex items-center justify-center bg-slate-100 hover:bg-blue-50 border border-slate-300 hover:border-blue-400 text-slate-700 hover:text-blue-700 rounded-lg transition-colors cursor-pointer shrink-0 ${
            esCompacto ? 'w-7 h-7' : 'w-8 h-8'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          title="Abrir Catálogo PCGE [F2]"
        >
          <BookOpen className="w-4 h-4" />
        </button>
      </div>

      {/* Denominación de la cuenta seleccionada */}
      {mostrarDenominacion && cuentaActual && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-600 truncate font-sans">
          <span className="font-semibold text-slate-800 truncate">
            {cuentaActual.denominacion || cuentaActual.nombre}
          </span>
          {cuentaActual.permiteMovimiento ? (
            <span className="text-[9.5px] px-1 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded shrink-0">
              Imputable
            </span>
          ) : (
            <span className="text-[9.5px] px-1 py-0.2 bg-amber-50 text-amber-700 border border-amber-200 rounded shrink-0">
              Mayor
            </span>
          )}
        </div>
      )}

      {/* Menú flotante de autocompletado en vivo */}
      {desplegableAbierto && sugerencias.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-slate-300 rounded-lg shadow-xl overflow-hidden max-h-56 overflow-y-auto divide-y divide-slate-100 font-mono text-xs">
          {sugerencias.map((c, idx) => {
            const isSelected = idx === indiceSeleccionado;
            return (
              <div
                key={c.codigo}
                onMouseDown={(e) => {
                  e.preventDefault();
                  seleccionarCuenta(c);
                }}
                onMouseEnter={() => setIndiceSeleccionado(idx)}
                className={`p-2 cursor-pointer flex items-center justify-between transition-colors ${
                  isSelected ? 'bg-blue-600 text-white' : 'hover:bg-blue-50 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="font-bold tracking-wider shrink-0">{c.codigo}</span>
                  <span className="truncate font-sans text-[11px]">
                    {c.denominacion || c.nombre}
                  </span>
                </div>
                <div className="shrink-0 text-[10px] pl-2">
                  {c.permiteMovimiento ? (
                    <span className={`px-1 py-0.2 border rounded ${isSelected ? 'border-emerald-200 text-emerald-100' : 'border-emerald-300 text-emerald-700'}`}>
                      Imputable
                    </span>
                  ) : (
                    <span className={`px-1 py-0.2 border rounded ${isSelected ? 'border-amber-200 text-amber-100' : 'border-amber-300 text-amber-700'}`}>
                      Nivel {c.nivel}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Diálogo emergente completo con buscador y teclado */}
      {dialogoAbierto && (
        <CatalogoCuentasDialog
          isOpen={dialogoAbierto}
          onClose={() => setDialogoAbierto(false)}
          onSelectCuenta={seleccionarCuenta}
          initialQuery={textoBusqueda}
          filtroPrefijo={filtroPrefijo}
          permitirMayor={permitirMayor || !soloImputables}
        />
      )}
    </div>
  );
};

