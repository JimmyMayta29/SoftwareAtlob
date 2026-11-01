import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MENU_DATA, MenuGroup, MenuItem } from '../../types/menu';

interface TopBarProps {
  onAction: (ruta: string, itemId?: string) => void;
  empresaNombre?: string;
  periodoNombre?: string;
  perfilSeleccionado: string;
  onCambiarPerfil: (nuevoPerfil: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onAction,
  empresaNombre = 'CA 2020',
  periodoNombre = 'ENERO 2026',
  perfilSeleccionado,
  onCambiarPerfil
}) => {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const closeAllMenus = useCallback(() => {
    setActiveMenuId(null);
    setActiveSubmenuId(null);
  }, []);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeAllMenus();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAllMenus();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        closeAllMenus();
        onAction('Empresa › Buscar empresa (Ctrl+K)', 'buscar-empresa');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeAllMenus, onAction]);

  const handleMenuClick = (menuId: string) => {
    if (activeMenuId === menuId) {
      closeAllMenus();
    } else {
      setActiveMenuId(menuId);
      setActiveSubmenuId(null);
    }
  };

  const handleMenuMouseEnter = (menuId: string) => {
    if (activeMenuId !== null && activeMenuId !== menuId) {
      setActiveMenuId(menuId);
      setActiveSubmenuId(null);
    }
  };

  const handleLeafClick = (path: string, itemId?: string) => {
    onAction(path, itemId);
    closeAllMenus();
  };

  const handleToolbarClick = (nombre: string, itemId?: string) => {
    closeAllMenus();
    onAction(`Barra › ${nombre}`, itemId);
  };

  return (
    <header
      ref={containerRef}
      className="w-full flex-shrink-0 font-['Segoe_UI',system-ui,Arial,sans-serif] select-none z-40 bg-white dark:bg-[#1E293B] border-b border-[#CBD5E1] dark:border-[#334155]"
    >
      {/* 1. BARRA DE TÍTULO */}
      <div className="flex items-center justify-between px-[12px] py-[5px] text-[12.5px] border-b border-[#CBD5E1] dark:border-[#334155] leading-none">
        <div className="flex items-center space-x-2">
          {/* Logo cuadrado 'A' (20x20, radio 4, fondo azul #1D4ED8, texto blanco negrita) */}
          <div className="w-[20px] h-[20px] rounded-[4px] bg-[#1D4ED8] flex items-center justify-center text-white font-bold text-[12px] shadow-sm flex-shrink-0">
            A
          </div>
          <span className="font-semibold text-[#0F172A] dark:text-[#E2E8F0]">
            Atlob Consultores ERP
          </span>
          <span className="text-[#64748B] dark:text-[#94A3B8]">
            - Gestión Contable
          </span>

          <span className="text-[#CBD5E1] dark:text-[#475569] mx-1">|</span>

          <span className="text-[#64748B] dark:text-[#94A3B8]">Empresa:</span>
          <span className="font-semibold text-[#0F172A] dark:text-[#E2E8F0]">
            {empresaNombre}
          </span>

          <span className="text-[#CBD5E1] dark:text-[#475569] mx-1">|</span>

          <span className="text-[#64748B] dark:text-[#94A3B8]">Período:</span>
          <span className="font-semibold text-[#0F172A] dark:text-[#E2E8F0]">
            {periodoNombre}
          </span>
        </div>

        <div className="text-[#64748B] dark:text-[#94A3B8] text-[12px]">
          Desarrollado por Jimmy Mayta
        </div>
      </div>

      {/* 2. BARRA DE MENÚ (MENUBAR) */}
      <nav
        role="menubar"
        aria-label="Menú principal de opciones"
        className="relative flex flex-wrap items-center border-b border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] px-1"
      >
        {MENU_DATA.map((group: MenuGroup) => {
          const isOpen = activeMenuId === group.id;
          return (
            <div key={group.id} className="relative">
              <button
                type="button"
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={isOpen}
                onClick={() => handleMenuClick(group.id)}
                onMouseEnter={() => handleMenuMouseEnter(group.id)}
                className={`text-[13px] px-[10px] py-[6px] transition-colors leading-none focus:outline-none ${
                  isOpen
                    ? 'bg-[#DBEAFE] dark:bg-[#1E3A8A] text-[#1D4ED8] dark:text-[#93C5FD] font-medium'
                    : 'text-[#0F172A] dark:text-[#E2E8F0] hover:bg-[#DBEAFE] dark:hover:bg-[#1E3A8A]'
                }`}
              >
                {group.label}
              </button>

              {/* Panel Desplegable de 1er Nivel */}
              {isOpen && (
                <div
                  role="menu"
                  className="absolute top-full left-0 min-w-[230px] bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] shadow-[0_6px_16px_rgba(0,0,0,0.25)] py-[2px] z-50 rounded-none"
                >
                  {group.items.map((item: MenuItem) => {
                    if (item.separator) {
                      return (
                        <div
                          key={item.id}
                          className="my-[3px] border-b border-[#CBD5E1] dark:border-[#334155]"
                        />
                      );
                    }

                    const hasChildren = item.children && item.children.length > 0;
                    const isSubmenuOpen = activeSubmenuId === item.id;

                    return (
                      <div
                        key={item.id}
                        className="relative"
                        onMouseEnter={() => {
                          if (hasChildren) {
                            setActiveSubmenuId(item.id);
                          } else {
                            setActiveSubmenuId(null);
                          }
                        }}
                      >
                        <div
                          role="menuitem"
                          aria-haspopup={hasChildren ? 'true' : undefined}
                          aria-expanded={hasChildren ? isSubmenuOpen : undefined}
                          onClick={() => {
                            if (!hasChildren) {
                              handleLeafClick(`${group.label} › ${item.label}`, item.id);
                            }
                          }}
                          className={`flex items-center justify-between text-[13px] px-[12px] pl-[22px] py-[5px] cursor-pointer select-none leading-normal transition-colors ${
                            isSubmenuOpen
                              ? 'bg-[#DBEAFE] dark:bg-[#1E3A8A] text-[#1D4ED8] dark:text-[#93C5FD]'
                              : 'text-[#0F172A] dark:text-[#E2E8F0] hover:bg-[#DBEAFE] dark:hover:bg-[#1E3A8A]'
                          }`}
                        >
                          <span className="truncate pr-4">{item.label}</span>

                          <div className="flex items-center space-x-2 flex-shrink-0">
                            {item.shortcut && (
                              <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                                {item.shortcut}
                              </span>
                            )}
                            {hasChildren && (
                              <span className="text-[#64748B] dark:text-[#94A3B8] font-bold text-[13px]">
                                ›
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Submenú en Cascada hacia la DERECHA (top -3px, left 100%) */}
                        {hasChildren && isSubmenuOpen && (
                          <div
                            role="menu"
                            className="absolute top-[-3px] left-full min-w-[230px] bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] shadow-[0_6px_16px_rgba(0,0,0,0.25)] py-[2px] z-50 rounded-none"
                          >
                            {item.children!.map((subItem: MenuItem) => {
                              if (subItem.separator) {
                                return (
                                  <div
                                    key={subItem.id}
                                    className="my-[3px] border-b border-[#CBD5E1] dark:border-[#334155]"
                                  />
                                );
                              }
                              return (
                                <div
                                  key={subItem.id}
                                  role="menuitem"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleLeafClick(
                                      `${group.label} › ${item.label} › ${subItem.label}`,
                                      subItem.id
                                    );
                                  }}
                                  className="flex items-center justify-between text-[13px] px-[12px] pl-[22px] py-[5px] text-[#0F172A] dark:text-[#E2E8F0] hover:bg-[#DBEAFE] dark:hover:bg-[#1E3A8A] cursor-pointer select-none leading-normal transition-colors"
                                >
                                  <span className="truncate pr-4">{subItem.label}</span>
                                  {subItem.shortcut && (
                                    <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8] flex-shrink-0">
                                      {subItem.shortcut}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* 3. BARRA DE HERRAMIENTAS (TOOLBAR) */}
      <div className="flex flex-wrap items-center justify-between px-2 py-1 bg-white dark:bg-[#1E293B]">
        {/* Botones de acción rápida con íconos SVG inline 20x20 stroke 1.7 */}
        <div className="flex items-center">
          {/* 1. Registro de asientos (libro con renglones) */}
          <button
            type="button"
            aria-label="Registro de asientos"
            title="Registro de asientos (F2)"
            onClick={() => handleToolbarClick('Registro de asientos', 'asientos')}
            className="w-[34px] h-[30px] rounded-[3px] border border-transparent hover:border-[#CBD5E1] dark:hover:border-[#334155] hover:bg-[#DBEAFE] dark:hover:bg-[#1E3A8A] text-[#0F172A] dark:text-[#E2E8F0] flex items-center justify-center transition-colors focus:outline-none"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <line x1="8" y1="7" x2="16" y2="7" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>

          {/* 2. Calculadora */}
          <button
            type="button"
            aria-label="Calculadora"
            title="Calculadora"
            onClick={() => handleToolbarClick('Calculadora', 'calculadora')}
            className="w-[34px] h-[30px] rounded-[3px] border border-transparent hover:border-[#CBD5E1] dark:hover:border-[#334155] hover:bg-[#DBEAFE] dark:hover:bg-[#1E3A8A] text-[#0F172A] dark:text-[#E2E8F0] flex items-center justify-center transition-colors focus:outline-none"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="2" width="16" height="20" rx="2" />
              <line x1="8" y1="6" x2="16" y2="6" />
              <line x1="8" y1="10" x2="9" y2="10" />
              <line x1="12" y1="10" x2="13" y2="10" />
              <line x1="16" y1="10" x2="16.01" y2="10" />
              <line x1="8" y1="14" x2="9" y2="14" />
              <line x1="12" y1="14" x2="13" y2="14" />
              <line x1="16" y1="14" x2="16.01" y2="14" />
              <line x1="8" y1="18" x2="9" y2="18" />
              <line x1="12" y1="18" x2="16" y2="18" />
            </svg>
          </button>

          {/* 3. Imprimir */}
          <button
            type="button"
            aria-label="Imprimir"
            title="Imprimir"
            onClick={() => handleToolbarClick('Imprimir', 'imprimir')}
            className="w-[34px] h-[30px] rounded-[3px] border border-transparent hover:border-[#CBD5E1] dark:hover:border-[#334155] hover:bg-[#DBEAFE] dark:hover:bg-[#1E3A8A] text-[#0F172A] dark:text-[#E2E8F0] flex items-center justify-center transition-colors focus:outline-none"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
          </button>

          {/* Separador vertical 1px (22px de alto, margen 0 6px) */}
          <div className="w-[1px] h-[22px] mx-[6px] bg-[#CBD5E1] dark:bg-[#334155]" />

          {/* 4. Buscar empresa (Ctrl+K) (lupa) */}
          <button
            type="button"
            aria-label="Buscar empresa (Ctrl+K)"
            title="Buscar empresa (Ctrl+K)"
            onClick={() => handleToolbarClick('Buscar empresa (Ctrl+K)', 'buscar-empresa')}
            className="w-[34px] h-[30px] rounded-[3px] border border-transparent hover:border-[#CBD5E1] dark:hover:border-[#334155] hover:bg-[#DBEAFE] dark:hover:bg-[#1E3A8A] text-[#0F172A] dark:text-[#E2E8F0] flex items-center justify-center transition-colors focus:outline-none"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>

          {/* 5. Importar CSV (flecha hacia abajo sobre línea) */}
          <button
            type="button"
            aria-label="Importar CSV"
            title="Importar CSV"
            onClick={() => handleToolbarClick('Importar CSV', 'importar-csv')}
            className="w-[34px] h-[30px] rounded-[3px] border border-transparent hover:border-[#CBD5E1] dark:hover:border-[#334155] hover:bg-[#DBEAFE] dark:hover:bg-[#1E3A8A] text-[#0F172A] dark:text-[#E2E8F0] flex items-center justify-center transition-colors focus:outline-none"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3v13m0 0l-4-4m4 4l4-4" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
          </button>

          {/* 6. Respaldos (nube con flecha) */}
          <button
            type="button"
            aria-label="Respaldos"
            title="Respaldos"
            onClick={() => handleToolbarClick('Respaldos', 'respaldos')}
            className="w-[34px] h-[30px] rounded-[3px] border border-transparent hover:border-[#CBD5E1] dark:hover:border-[#334155] hover:bg-[#DBEAFE] dark:hover:bg-[#1E3A8A] text-[#0F172A] dark:text-[#E2E8F0] flex items-center justify-center transition-colors focus:outline-none"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" />
              <path d="M12 11v6m0-6l-2.5 2.5M12 11l2.5 2.5" />
            </svg>
          </button>

          {/* Separador vertical 1px (22px de alto, margen 0 6px) */}
          <div className="w-[1px] h-[22px] mx-[6px] bg-[#CBD5E1] dark:bg-[#334155]" />

          {/* 7. Configurar empresa (edificio) */}
          <button
            type="button"
            aria-label="Configurar empresa"
            title="Configurar empresa"
            onClick={() => handleToolbarClick('Configurar empresa', 'configurar-empresa')}
            className="w-[34px] h-[30px] rounded-[3px] border border-transparent hover:border-[#CBD5E1] dark:hover:border-[#334155] hover:bg-[#DBEAFE] dark:hover:bg-[#1E3A8A] text-[#0F172A] dark:text-[#E2E8F0] flex items-center justify-center transition-colors focus:outline-none"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="2" width="16" height="20" rx="1" />
              <line x1="8" y1="6" x2="10" y2="6" />
              <line x1="14" y1="6" x2="16" y2="6" />
              <line x1="8" y1="10" x2="10" y2="10" />
              <line x1="14" y1="10" x2="16" y2="10" />
              <line x1="8" y1="14" x2="10" y2="14" />
              <line x1="14" y1="14" x2="16" y2="14" />
              <path d="M10 22v-4h4v4" />
            </svg>
          </button>

          {/* 8. Conciliador SIRE (líneas con flecha a la derecha) */}
          <button
            type="button"
            aria-label="Conciliador SIRE"
            title="Conciliador SIRE"
            onClick={() => handleToolbarClick('Conciliador SIRE', 'sire-conciliador')}
            className="w-[34px] h-[30px] rounded-[3px] border border-transparent hover:border-[#CBD5E1] dark:hover:border-[#334155] hover:bg-[#DBEAFE] dark:hover:bg-[#1E3A8A] text-[#0F172A] dark:text-[#E2E8F0] flex items-center justify-center transition-colors focus:outline-none"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="6" x2="15" y2="6" />
              <line x1="3" y1="12" x2="12" y2="12" />
              <line x1="3" y1="18" x2="15" y2="18" />
              <polyline points="16 9 20 12 16 15" />
            </svg>
          </button>
        </div>

        {/* Lado derecho: pastilla azul "ADMIN_ESTUDIO" y select "Perfil de prueba" */}
        <div className="flex items-center space-x-3 text-[12px]">
          {/* Pastilla redondeada azul con "ADMIN_ESTUDIO" (11px, texto blanco) */}
          <span className="px-2 py-[2px] rounded-full bg-[#1D4ED8] text-white text-[11px] font-semibold tracking-wide">
            ADMIN_ESTUDIO
          </span>

          <div className="flex items-center space-x-1">
            <label
              htmlFor="select-perfil"
              className="text-[#64748B] dark:text-[#94A3B8] text-[11.5px]"
            >
              Perfil de prueba:
            </label>
            <select
              id="select-perfil"
              value={perfilSeleccionado}
              onChange={(e) => onCambiarPerfil(e.target.value)}
              className="bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-[3px] text-[#0F172A] dark:text-[#E2E8F0] text-[11.5px] px-2 py-[3px] focus:outline-none focus:border-[#1D4ED8] cursor-pointer"
            >
              <option value="Jimmy Mayta (Administrador principal)">
                Jimmy Mayta (Administrador principal)
              </option>
              <option value="Contador">Contador</option>
              <option value="Auditor">Auditor</option>
            </select>
          </div>
        </div>
      </div>
    </header>
  );
};
