import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BookOpen,
  FilePlus2,
  GitCompare,
  Search,
  Archive,
  Calculator,
  Printer,
  Terminal,
  ChevronRight,
} from 'lucide-react';
import { MENU_DATA, MenuGroup, MenuItem, tienePermisoMenu } from '../../types/menu';

interface TopBarProps {
  onAction: (ruta: string, itemId?: string) => void;
  empresaNombre?: string;
  empresaRuc?: string;
  periodoNombre?: string;
  ambienteSunat?: 'BETA' | 'BETA_TEST' | 'PRODUCCION';
  perfilSeleccionado: string;
  onCambiarPerfil: (nuevoPerfil: string) => void;
  onAbrirPaletaComandos?: () => void;
}

export function obtenerCodigoRolDesdePerfil(perfil: string): string {
  const upper = (perfil || '').toUpperCase();
  if (upper.includes('ADMIN')) return 'ADMIN';
  if (upper.includes('CONTADOR')) return 'CONTADOR';
  if (upper.includes('AUDITOR')) return 'AUDITOR';
  if (upper.includes('ASISTENTE') || upper.includes('OPERADOR')) return 'ASISTENTE';
  return 'ADMIN';
}

export const TopBar: React.FC<TopBarProps> = ({
  onAction,
  empresaNombre = 'COMERCIALIZADORA ANDINA S.A.C.',
  empresaRuc = '20601234567',
  periodoNombre = '2026-03',
  ambienteSunat = 'BETA',
  perfilSeleccionado,
  onCambiarPerfil,
  onAbrirPaletaComandos,
}) => {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null);
  const [focusedItemIndex, setFocusedItemIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuButtonsRef = useRef<Record<string, HTMLButtonElement | null>>({});

  const rolActual = obtenerCodigoRolDesdePerfil(perfilSeleccionado);
  const esAuditor = rolActual === 'AUDITOR';
  const esAdmin = rolActual === 'ADMIN' || rolActual === 'ADMINISTRADOR' || rolActual === 'ADMIN_ESTUDIO';

  const closeAllMenus = useCallback(() => {
    setActiveMenuId(null);
    setActiveSubmenuId(null);
    setFocusedItemIndex(-1);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeAllMenus();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingInput =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') &&
        !containerRef.current?.contains(target);

      if (e.key === 'Escape') {
        closeAllMenus();
        return;
      }

      // Atajo Alt solo para enfocar la barra de menú
      if (e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
        e.preventDefault();
        const primerGrupo = MENU_DATA[0];
        if (primerGrupo) {
          setActiveMenuId((prev) => (prev ? null : primerGrupo.id));
          setActiveSubmenuId(null);
          setFocusedItemIndex(0);
          menuButtonsRef.current[primerGrupo.id]?.focus();
        }
        return;
      }

      // Atajos globales de función y combinaciones
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        closeAllMenus();
        if (onAbrirPaletaComandos) {
          onAbrirPaletaComandos();
        } else {
          onAction('Paleta de comandos [Ctrl+Shift+P]', 'paleta-comandos');
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        closeAllMenus();
        onAction('Herramientas › Calculadora tributaria', 'calculadora-tributaria');
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        closeAllMenus();
        onAction('Archivo › Abrir empresa…', 'abrir-empresa');
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        closeAllMenus();
        if (esAdmin) {
          onAction('Herramientas › Respaldo y restauración', 'respaldo-restauracion');
        }
        return;
      }

      if (!isEditingInput && e.key === 'F2') {
        e.preventDefault();
        closeAllMenus();
        if (!esAuditor) {
          onAction('Contabilidad › Asientos', 'asientos');
        }
        return;
      }

      if (!isEditingInput && e.key === 'F3') {
        e.preventDefault();
        closeAllMenus();
        if (!esAuditor) {
          onAction('Facturación › Emitir factura o boleta', 'emitir-cp');
        }
        return;
      }

      if (!isEditingInput && e.key === 'F4') {
        e.preventDefault();
        closeAllMenus();
        onAction('Registros Electrónicos › SIRE › Conciliador de compras y ventas', 'sire-conciliador');
        return;
      }

      // Navegación por flechas cuando el menú está abierto
      if (activeMenuId) {
        const currentGroupIndex = MENU_DATA.findIndex((g) => g.id === activeMenuId);
        if (currentGroupIndex === -1) return;
        const currentGroup = MENU_DATA[currentGroupIndex];
        const navigableItems = currentGroup.items.filter((i) => !i.separator);

        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const nextGroup = MENU_DATA[(currentGroupIndex + 1) % MENU_DATA.length];
          setActiveMenuId(nextGroup.id);
          setActiveSubmenuId(null);
          setFocusedItemIndex(0);
          menuButtonsRef.current[nextGroup.id]?.focus();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const prevGroup = MENU_DATA[(currentGroupIndex - 1 + MENU_DATA.length) % MENU_DATA.length];
          setActiveMenuId(prevGroup.id);
          setActiveSubmenuId(null);
          setFocusedItemIndex(0);
          menuButtonsRef.current[prevGroup.id]?.focus();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedItemIndex((prev) => (prev + 1) % navigableItems.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedItemIndex((prev) => (prev - 1 + navigableItems.length) % navigableItems.length);
        } else if (e.key === 'Enter' && focusedItemIndex >= 0 && focusedItemIndex < navigableItems.length) {
          e.preventDefault();
          const item = navigableItems[focusedItemIndex];
          if (item.children && item.children.length > 0) {
            setActiveSubmenuId(item.id);
          } else if (item.estado === 'activo' && tienePermisoMenu(item, rolActual)) {
            onAction(`${currentGroup.label} › ${item.label}`, item.id);
            closeAllMenus();
          }
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMenuId, focusedItemIndex, closeAllMenus, onAction, onAbrirPaletaComandos, rolActual, esAdmin, esAuditor]);

  const handleMenuClick = (menuId: string) => {
    if (activeMenuId === menuId) {
      closeAllMenus();
    } else {
      setActiveMenuId(menuId);
      setActiveSubmenuId(null);
      setFocusedItemIndex(0);
    }
  };

  const handleMenuMouseEnter = (menuId: string) => {
    if (activeMenuId !== null && activeMenuId !== menuId) {
      setActiveMenuId(menuId);
      setActiveSubmenuId(null);
      setFocusedItemIndex(0);
    }
  };

  const handleItemActivate = (item: MenuItem, rutaCompleta: string) => {
    if (item.estado === 'proximamente') return;
    if (!tienePermisoMenu(item, rolActual)) return;
    onAction(rutaCompleta, item.id);
    closeAllMenus();
  };

  return (
    <header
      ref={containerRef}
      className="w-full flex-shrink-0 select-none z-40 bg-[#F5F7FA] border-b border-[#D1D5DB] text-[#111827]"
    >
      {/* 1. BARRA DE TÍTULO */}
      <div className="flex items-center justify-between px-2.5 py-1 text-[13px] bg-[#E8ECF1] border-b border-[#D1D5DB] leading-none">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-[18px] h-[18px] bg-[#1D4ED8] flex items-center justify-center text-[#FFFFFF] font-bold text-[11px] flex-shrink-0">
            A
          </div>
          <span className="font-bold text-[#111827] whitespace-nowrap">
            Atlob Consultores ERP
          </span>

          <span className="text-[#9CA3AF]">|</span>

          {/* Chips de contexto multiempresa */}
          <div className="flex items-center gap-1.5 text-[11px] overflow-hidden">
            <span className="px-1.5 py-0.5 bg-[#FFFFFF] border border-[#D1D5DB] text-[#111827] truncate max-w-[230px]">
              <strong>Empresa:</strong> {empresaNombre}
            </span>
            <span className="px-1.5 py-0.5 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-[#111827]">
              <strong>RUC:</strong> {empresaRuc}
            </span>
            <span className="px-1.5 py-0.5 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-[#1E3A5F] font-bold">
              <strong>Período:</strong> {periodoNombre}
            </span>
            <span
              className={`px-1.5 py-0.5 border font-bold font-mono ${
                ambienteSunat === 'PRODUCCION'
                  ? 'bg-[#ECFDF5] border-[#1E6F42] text-[#1E6F42]'
                  : 'bg-[#FFFBEB] border-[#B45309] text-[#B45309]'
              }`}
              title="Ambiente de conexión SUNAT configurado para la empresa activa"
            >
              SUNAT: {ambienteSunat === 'PRODUCCION' ? 'PRODUCCIÓN' : 'BETA'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 text-[11px]">
          <div className="flex items-center gap-1">
            <label htmlFor="select-perfil" className="text-[#4B5563]">
              Rol activo:
            </label>
            <select
              id="select-perfil"
              value={perfilSeleccionado}
              onChange={(e) => onCambiarPerfil(e.target.value)}
              className="h-5 bg-[#FFFFFF] border border-[#D1D5DB] text-[#111827] text-[11px] px-1.5 focus:outline-none focus:border-[#1E3A5F]"
            >
              <option value="Jimmy Mayta (Administrador principal)">
                Jimmy Mayta (ADMINISTRADOR)
              </option>
              <option value="Contador">Contador (CONTADOR)</option>
              <option value="Asistente Contable">Asistente (ASISTENTE)</option>
              <option value="Auditor">Auditor (AUDITOR - Solo lectura)</option>
            </select>
          </div>
          <span className="text-[#4B5563] hidden sm:inline">
            Desarrollado por Jimmy Mayta
          </span>
        </div>
      </div>

      {/* 2. BARRA DE MENÚ (MENUBAR) */}
      <nav
        role="menubar"
        aria-label="Menú principal de Atlob Consultores ERP"
        className="relative flex flex-wrap items-center border-b border-[#D1D5DB] bg-[#F5F7FA] px-1"
      >
        {MENU_DATA.map((group: MenuGroup) => {
          const isOpen = activeMenuId === group.id;
          let navigableIdx = -1;

          return (
            <div key={group.id} className="relative">
              <button
                ref={(el) => {
                  menuButtonsRef.current[group.id] = el;
                }}
                type="button"
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={isOpen}
                onClick={() => handleMenuClick(group.id)}
                onMouseEnter={() => handleMenuMouseEnter(group.id)}
                className={`text-[13px] px-2.5 py-1 transition-colors leading-none focus:outline-none ${
                  isOpen
                    ? 'bg-[#1E3A5F] text-[#FFFFFF] font-bold'
                    : 'text-[#111827] hover:bg-[#E8ECF1]'
                }`}
              >
                {group.label}
              </button>

              {isOpen && (
                <div
                  role="menu"
                  aria-label={group.label}
                  className="absolute top-full left-0 min-w-[260px] bg-[#FFFFFF] border border-[#D1D5DB] py-0.5 z-50"
                >
                  {group.items.map((item: MenuItem) => {
                    if (item.separator) {
                      return (
                        <div
                          key={item.id}
                          role="separator"
                          className="my-0.5 border-b border-[#E5E7EB]"
                        />
                      );
                    }

                    navigableIdx += 1;
                    const isKeyboardFocused = focusedItemIndex === navigableIdx;
                    const hasChildren = Boolean(item.children && item.children.length > 0);
                    const isSubmenuOpen = activeSubmenuId === item.id;
                    const isProximamente = item.estado === 'proximamente';
                    const permitidoPorRol = tienePermisoMenu(item, rolActual);
                    const deshabilitado = isProximamente || (!hasChildren && !permitidoPorRol);

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
                          aria-disabled={deshabilitado}
                          aria-haspopup={hasChildren ? 'true' : undefined}
                          aria-expanded={hasChildren ? isSubmenuOpen : undefined}
                          onClick={() => {
                            if (!hasChildren && !deshabilitado) {
                              handleItemActivate(item, `${group.label} › ${item.label}`);
                            }
                          }}
                          className={`flex items-center justify-between text-[13px] px-3 py-1 select-none leading-tight ${
                            deshabilitado
                              ? 'text-[#9CA3AF] cursor-not-allowed bg-[#FFFFFF]'
                              : isSubmenuOpen || isKeyboardFocused
                              ? 'bg-[#E8ECF1] text-[#1E3A5F] cursor-pointer'
                              : 'text-[#111827] hover:bg-[#E8ECF1] cursor-pointer'
                          }`}
                        >
                          <span className="truncate pr-3">{item.label}</span>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {isProximamente && (
                              <span className="text-[10px] px-1 py-0.2 bg-[#F5F7FA] border border-[#D1D5DB] text-[#9CA3AF]">
                                próximamente
                              </span>
                            )}
                            {!isProximamente && !permitidoPorRol && (
                              <span className="text-[10px] px-1 py-0.2 bg-[#FEF2F2] border border-[#B91C1C] text-[#B91C1C]">
                                solo admin
                              </span>
                            )}
                            {item.shortcut && (
                              <span className="text-[11px] font-mono text-[#4B5563]">
                                {item.shortcut}
                              </span>
                            )}
                            {hasChildren && (
                              <ChevronRight className="w-3.5 h-3.5 text-[#4B5563]" strokeWidth={1.5} />
                            )}
                          </div>
                        </div>

                        {hasChildren && isSubmenuOpen && (
                          <div
                            role="menu"
                            aria-label={item.label}
                            className="absolute top-[-1px] left-full min-w-[255px] bg-[#FFFFFF] border border-[#D1D5DB] py-0.5 z-50"
                          >
                            {item.children!.map((subItem: MenuItem) => {
                              if (subItem.separator) {
                                return (
                                  <div
                                    key={subItem.id}
                                    role="separator"
                                    className="my-0.5 border-b border-[#E5E7EB]"
                                  />
                                );
                              }

                              const subProximamente = subItem.estado === 'proximamente';
                              const subPermitido = tienePermisoMenu(subItem, rolActual);
                              const subDeshabilitado = subProximamente || !subPermitido;

                              return (
                                <div
                                  key={subItem.id}
                                  role="menuitem"
                                  aria-disabled={subDeshabilitado}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!subDeshabilitado) {
                                      handleItemActivate(
                                        subItem,
                                        `${group.label} › ${item.label} › ${subItem.label}`
                                      );
                                    }
                                  }}
                                  className={`flex items-center justify-between text-[13px] px-3 py-1 select-none leading-tight ${
                                    subDeshabilitado
                                      ? 'text-[#9CA3AF] cursor-not-allowed bg-[#FFFFFF]'
                                      : 'text-[#111827] hover:bg-[#E8ECF1] hover:text-[#1E3A5F] cursor-pointer'
                                  }`}
                                >
                                  <span className="truncate pr-3">{subItem.label}</span>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {subProximamente && (
                                      <span className="text-[10px] px-1 py-0.2 bg-[#F5F7FA] border border-[#D1D5DB] text-[#9CA3AF]">
                                        próximamente
                                      </span>
                                    )}
                                    {subItem.shortcut && (
                                      <span className="text-[11px] font-mono text-[#4B5563]">
                                        {subItem.shortcut}
                                      </span>
                                    )}
                                  </div>
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

      {/* 3. BARRA DE HERRAMIENTAS EN UNA SOLA FILA (BUG-04 CORREGIDO: overflow-x-auto no-scrollbar sin flex-wrap) */}
      <div
        role="toolbar"
        aria-label="Barra de herramientas de acceso rápido"
        className="flex items-center justify-between px-2 py-1 bg-[#F5F7FA] overflow-x-auto no-scrollbar whitespace-nowrap gap-2"
      >
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            disabled={esAuditor}
            title={esAuditor ? 'Rol Auditor: solo lectura' : 'Asiento contable nuevo [F2]'}
            onClick={() => {
              closeAllMenus();
              onAction('Contabilidad › Asientos', 'asientos');
            }}
            className={`h-6 px-2 text-[12px] inline-flex items-center gap-1.5 border ${
              esAuditor
                ? 'bg-[#F5F7FA] text-[#9CA3AF] border-[#D1D5DB] cursor-not-allowed'
                : 'bg-[#FFFFFF] text-[#111827] border-[#D1D5DB] hover:bg-[#E8ECF1] hover:border-[#1E3A5F]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-[#1E3A5F]" strokeWidth={1.5} />
            <span>Asiento nuevo</span>
            <span className="text-[10px] font-mono text-[#4B5563]">[F2]</span>
          </button>

          <button
            type="button"
            disabled={esAuditor}
            title={esAuditor ? 'Rol Auditor: solo lectura' : 'Emitir factura o boleta electrónica [F3]'}
            onClick={() => {
              closeAllMenus();
              onAction('Facturación › Emitir factura o boleta', 'emitir-cp');
            }}
            className={`h-6 px-2 text-[12px] inline-flex items-center gap-1.5 border ${
              esAuditor
                ? 'bg-[#F5F7FA] text-[#9CA3AF] border-[#D1D5DB] cursor-not-allowed'
                : 'bg-[#FFFFFF] text-[#111827] border-[#D1D5DB] hover:bg-[#E8ECF1] hover:border-[#1E3A5F]'
            }`}
          >
            <FilePlus2 className="w-3.5 h-3.5 text-[#1E3A5F]" strokeWidth={1.5} />
            <span>Emitir comprobante</span>
            <span className="text-[10px] font-mono text-[#4B5563]">[F3]</span>
          </button>

          <button
            type="button"
            title="Conciliador SIRE RCE / RVIE [F4]"
            onClick={() => {
              closeAllMenus();
              onAction('Registros Electrónicos › SIRE › Conciliador de compras y ventas', 'sire-conciliador');
            }}
            className="h-6 px-2 text-[12px] inline-flex items-center gap-1.5 bg-[#FFFFFF] text-[#111827] border border-[#D1D5DB] hover:bg-[#E8ECF1] hover:border-[#1E3A5F]"
          >
            <GitCompare className="w-3.5 h-3.5 text-[#1E3A5F]" strokeWidth={1.5} />
            <span>Conciliar SIRE</span>
            <span className="text-[10px] font-mono text-[#4B5563]">[F4]</span>
          </button>

          <div className="w-[1px] h-4 bg-[#D1D5DB] mx-0.5" />

          <button
            type="button"
            title="Abrir o cambiar empresa activa [Ctrl+K]"
            onClick={() => {
              closeAllMenus();
              onAction('Archivo › Abrir empresa…', 'abrir-empresa');
            }}
            className="h-6 px-2 text-[12px] inline-flex items-center gap-1.5 bg-[#FFFFFF] text-[#111827] border border-[#D1D5DB] hover:bg-[#E8ECF1] hover:border-[#1E3A5F]"
          >
            <Search className="w-3.5 h-3.5 text-[#1E3A5F]" strokeWidth={1.5} />
            <span>Buscar empresa</span>
            <span className="text-[10px] font-mono text-[#4B5563]">[Ctrl+K]</span>
          </button>

          <button
            type="button"
            disabled={!esAdmin}
            title={!esAdmin ? 'Exclusivo para rol ADMINISTRADOR' : 'Respaldo y restauración de empresa [Ctrl+B]'}
            onClick={() => {
              closeAllMenus();
              onAction('Herramientas › Respaldo y restauración', 'respaldo-restauracion');
            }}
            className={`h-6 px-2 text-[12px] inline-flex items-center gap-1.5 border ${
              !esAdmin
                ? 'bg-[#F5F7FA] text-[#9CA3AF] border-[#D1D5DB] cursor-not-allowed'
                : 'bg-[#FFFFFF] text-[#111827] border-[#D1D5DB] hover:bg-[#E8ECF1] hover:border-[#1E3A5F]'
            }`}
          >
            <Archive className="w-3.5 h-3.5 text-[#1E3A5F]" strokeWidth={1.5} />
            <span>Respaldar</span>
            <span className="text-[10px] font-mono text-[#4B5563]">[Ctrl+B]</span>
          </button>

          <div className="w-[1px] h-4 bg-[#D1D5DB] mx-0.5" />

          <button
            type="button"
            title="Calculadora contable y tributaria [Ctrl+Shift+C]"
            onClick={() => {
              closeAllMenus();
              onAction('Herramientas › Calculadora tributaria', 'calculadora-tributaria');
            }}
            className="h-6 px-2 text-[12px] inline-flex items-center gap-1.5 bg-[#FFFFFF] text-[#111827] border border-[#D1D5DB] hover:bg-[#E8ECF1] hover:border-[#1E3A5F]"
          >
            <Calculator className="w-3.5 h-3.5 text-[#1E3A5F]" strokeWidth={1.5} />
            <span>Calculadora</span>
          </button>

          <button
            type="button"
            title="Exportar e imprimir reportes oficiales [Ctrl+P]"
            onClick={() => {
              closeAllMenus();
              onAction('Barra › Imprimir', 'imprimir');
            }}
            className="h-6 px-2 text-[12px] inline-flex items-center gap-1.5 bg-[#FFFFFF] text-[#111827] border border-[#D1D5DB] hover:bg-[#E8ECF1] hover:border-[#1E3A5F]"
          >
            <Printer className="w-3.5 h-3.5 text-[#1E3A5F]" strokeWidth={1.5} />
            <span>Imprimir</span>
          </button>
        </div>

        {/* Botón de Paleta de Comandos [Ctrl+Shift+P] */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              closeAllMenus();
              if (onAbrirPaletaComandos) {
                onAbrirPaletaComandos();
              } else {
                onAction('Paleta de comandos [Ctrl+Shift+P]', 'paleta-comandos');
              }
            }}
            className="h-6 px-2.5 text-[11px] inline-flex items-center gap-1.5 bg-[#FFFFFF] text-[#1E3A5F] border border-[#D1D5DB] hover:border-[#1E3A5F]"
            title="Buscar cualquier comando o módulo del sistema [Ctrl+Shift+P]"
          >
            <Terminal className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>Ir a comando o vista…</span>
            <kbd className="font-mono text-[10px] text-[#4B5563]">Ctrl+Shift+P</kbd>
          </button>
        </div>
      </div>
    </header>
  );
};
