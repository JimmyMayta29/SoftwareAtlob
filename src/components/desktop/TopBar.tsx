import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShoppingBag,
  TrendingUp,
  FilePlus,
  Layers,
  ArrowLeftRight,
  Building2,
  Search,
  ChevronDown,
  ChevronRight,
  LogOut,
  ShieldCheck,
  Check
} from 'lucide-react';
import { MENU_DATA, MenuGroup, MenuItem, tienePermisoMenu } from '../../types/menu';
import atlobIsotipo from '../../assets/brand/atlob_isotipo.webp';

export interface TopBarProps {
  onAction: (ruta: string, itemId?: string) => void;
  empresaNombre?: string;
  empresaRuc?: string;
  periodoNombre?: string;
  ambienteSunat?: 'BETA' | 'BETA_TEST' | 'PRODUCCION';
  perfilSeleccionado: string;
  rolAutenticado?: string;
  onCambiarPerfil: (nuevoPerfil: string) => void;
  onAbrirPaletaComandos?: () => void;
  activeModuleId?: string | null;
}

export function obtenerCodigoRolDesdePerfil(perfil: string): string {
  const upper = (perfil || '').toUpperCase();
  if (upper.includes('ADMIN')) return 'ADMIN';
  if (upper.includes('CONTADOR')) return 'CONTADOR';
  if (upper.includes('AUDITOR')) return 'AUDITOR';
  if (upper.includes('ASISTENTE') || upper.includes('OPERADOR')) return 'ASISTENTE';
  return 'ADMIN';
}

function obtenerIniciales(nombre: string): string {
  if (!nombre) return 'US';
  const partes = nombre.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function obtenerGrupoActivoId(activeModuleId?: string | null): string | null {
  if (!activeModuleId) return null;
  for (const group of MENU_DATA) {
    for (const item of group.items) {
      if (item.id === activeModuleId) return group.id;
      if (item.children) {
        for (const sub of item.children) {
          if (sub.id === activeModuleId) return group.id;
        }
      }
    }
  }
  // Mapeos rápidos para IDs comunes
  if (['asientos', 'plan-cuentas', 'libro-diario', 'libro-mayor', 'caja-bancos', 'dif-cambio', 'consolidar-mes', 'cierre-mensual', 'cierre-anual', 'subdiarios-registro', 'administrar-subdiarios', 'centros-costo'].includes(activeModuleId)) return 'contabilidad';
  if (['reg-compras', 'reg-ventas', 'registro-compras', 'registro-ventas', 'detracciones-retenciones'].includes(activeModuleId)) return 'compras-ventas';
  if (['emitir-cp', 'notas-cd', 'consulta-cp', 'lector-xml-cdr'].includes(activeModuleId)) return 'facturacion';
  if (['declaracion-igv-renta', 'prorrata-igv', 'daot', 'declaracion-renta-anual', 'cronograma-vencimientos', 'parametros-tributarios', 'simulador-fiscalizacion'].includes(activeModuleId)) return 'tributos';
  if (['trabajadores', 'planilla-mensual', 'recibos-honorarios', 'boletas-pago', 'gratificaciones-cts', 'exportar-plame', 't-registro'].includes(activeModuleId)) return 'planillas';
  if (['sire-prop-compras', 'sire-prop-ventas', 'sire-conciliador', 'sire-txt-ajustes', 'libros-electronicos', 'validar-libros-electronicos'].includes(activeModuleId)) return 'registros-electronicos';
  if (['cuentas-bancarias', 'conciliacion-bancaria', 'mov-bancarios', 'flujo-caja-proyectado', 'cxc', 'cxp', 'antiguedad-saldos', 'caja-apertura-cierre', 'caja-gastos', 'caja-reposicion'].includes(activeModuleId)) return 'tesoreria';
  if (['hoja-trabajo', 'estado-situacion', 'estado-resultados', 'flujo-efectivo', 'analisis-cuentas'].includes(activeModuleId)) return 'estados-financieros';
  if (['cartera-empresas', 'indicadores-estudio', 'control-calidad', 'biblioteca-plantillas'].includes(activeModuleId)) return 'estudio';
  if (['tbl-clientes-prov', 'tbl-tipos-cp', 'tbl-tipo-cambio', 'tbl-bancos', 'tbl-unidades-medida', 'usuarios-permisos', 'estado-conexion-sunat', 'auditoria-sistema'].includes(activeModuleId)) return 'herramientas';
  if (['guia-rapida', 'acerca-de'].includes(activeModuleId)) return 'ayuda';
  return null;
}

export const TopBar: React.FC<TopBarProps> = ({
  onAction,
  empresaNombre = 'COMERCIALIZADORA ANDINA S.A.C.',
  empresaRuc = '20601234567',
  periodoNombre = '2026-03',
  ambienteSunat = 'BETA',
  perfilSeleccionado,
  rolAutenticado,
  onCambiarPerfil,
  onAbrirPaletaComandos,
  activeModuleId
}) => {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null);
  const [focusedItemIndex, setFocusedItemIndex] = useState<number>(-1);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const menuButtonsRef = useRef<Record<string, HTMLButtonElement | null>>({});

  const rolActual = obtenerCodigoRolDesdePerfil(rolAutenticado ?? perfilSeleccionado);
  const esAuditor = rolActual === 'AUDITOR';
  const esAdmin = rolActual === 'ADMIN' || rolActual === 'ADMINISTRADOR' || rolActual === 'ADMIN_ESTUDIO';

  const grupoActivoId = obtenerGrupoActivoId(activeModuleId) || 'contabilidad';

  const closeAllMenus = useCallback(() => {
    setActiveMenuId(null);
    setActiveSubmenuId(null);
    setFocusedItemIndex(-1);
    setIsUserMenuOpen(false);
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
      setIsUserMenuOpen(false);
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

  const nombreUsuario = perfilSeleccionado?.replace(/\s*\([^)]*\)/, '') || 'Usuario';
  const iniciales = obtenerIniciales(nombreUsuario);

  let sunatTexto = 'Producción';
  let sunatColorPunto = '#1FA463';
  let sunatColorTexto = '#1B7F4B';
  if (ambienteSunat === 'BETA' || ambienteSunat === 'BETA_TEST') {
    sunatTexto = ambienteSunat === 'BETA' ? 'Beta' : 'Pruebas';
    sunatColorPunto = '#D97706';
    sunatColorTexto = '#B45309';
  } else if (!ambienteSunat) {
    sunatTexto = 'Sin conexión';
    sunatColorPunto = '#9CA3AF';
    sunatColorTexto = '#5B6675';
  }

  const opcionesRoles = [
    { label: 'Administrador', value: 'Jimmy Mayta (Administrador principal)', rol: 'ADMIN' },
    { label: 'Contador', value: 'Contador', rol: 'CONTADOR' },
    { label: 'Asistente Contable', value: 'Asistente Contable', rol: 'ASISTENTE' },
    { label: 'Auditor (Solo lectura)', value: 'Auditor', rol: 'AUDITOR' }
  ];

  return (
    <header
      ref={containerRef}
      className="w-full flex-shrink-0 select-none z-40 bg-white font-['Segoe_UI',system-ui,sans-serif]"
    >
      {/* =========================================================================
          FRANJA 1: CABECERA SUPERIOR (56px)
          Logo Atlob ERP | Separador | Contexto Empresa | Estado SUNAT | Buscador | Usuario
      ========================================================================= */}
      <div className="h-[56px] px-6 flex items-center justify-between border-b border-[#E3E8EF] bg-white gap-5">
        {/* Izquierda: Logo + Contexto de Empresa */}
        <div className="flex items-center gap-5 min-w-0">
          {/* Logo Atlob ERP con Isotipo Oficial */}
          <div className="flex items-center gap-2.5 shrink-0">
            <img
              src={atlobIsotipo}
              alt="Atlob ERP"
              className="w-7 h-7 object-contain drop-shadow-sm shrink-0"
              width={28}
              height={28}
            />
            <div className="flex items-baseline gap-1">
              <span className="text-[15px] font-semibold text-[#1B2430] tracking-tight">Atlob</span>
              <span className="text-[15px] font-normal text-[#5B6675]">ERP</span>
            </div>
          </div>

          {/* Separador vertical 1x28 */}
          <div className="w-[1px] h-7 bg-[#E3E8EF] shrink-0" aria-hidden="true" />

          {/* Contexto de empresa en dos líneas sin recuadro */}
          <div className="flex flex-col justify-center min-w-0">
            <h1
              className="text-[13px] font-semibold text-[#1B2430] tracking-[0.2px] truncate max-w-[260px] md:max-w-[340px] 2xl:max-w-[460px] leading-tight"
              title={empresaNombre}
            >
              {empresaNombre}
            </h1>
            <span className="text-[12px] font-normal text-[#5B6675] leading-tight mt-0.5 truncate">
              RUC {empresaRuc} · Período {periodoNombre}
            </span>
          </div>
        </div>

        {/* Derecha: Estado SUNAT + Buscador Paleta + Perfil Usuario */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Estado SUNAT */}
          <div
            className="flex items-center gap-1.5 text-[12px] font-semibold shrink-0 cursor-default"
            title={`Ambiente de conexión SUNAT: ${sunatTexto}`}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: sunatColorPunto }}
              aria-hidden="true"
            />
            <span style={{ color: sunatColorTexto }}>SUNAT · {sunatTexto}</span>
          </div>

          {/* Buscador / Paleta de comandos (300x34px) */}
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
            className="w-[200px] sm:w-[240px] md:w-[270px] lg:w-[300px] h-[34px] rounded-lg bg-[#F1F4F9] hover:bg-[#E8EDF6] transition-colors flex items-center px-3 gap-2 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#2457D6]/20 border-0"
            title="Buscar o ejecutar un comando [Ctrl+Shift+P]"
            aria-label="Buscar o ejecutar un comando"
          >
            <Search className="w-4 h-4 text-[#5B6675] shrink-0" strokeWidth={1.7} />
            <span className="text-[12.5px] text-[#5B6675] flex-1 truncate">
              Buscar o ejecutar un comando
            </span>
            <span className="text-[10.5px] text-[#5B6675] font-sans shrink-0 hidden sm:inline-flex items-center bg-white border border-[#E3E8EF] rounded px-1.5 py-0.5 leading-none">
              Ctrl+Shift+P
            </span>
          </button>

          {/* Perfil de Usuario con Menú Desplegable */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-lg hover:bg-[#F5F7FB] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#2457D6]/20 border-0"
              aria-haspopup="true"
              aria-expanded={isUserMenuOpen}
              title={`Usuario actual: ${nombreUsuario} (${rolActual})`}
            >
              {/* Avatar circular 32px */}
              <div className="w-8 h-8 rounded-full bg-[#E6EDFE] text-[#2457D6] text-[12px] font-bold flex items-center justify-center shrink-0">
                {iniciales}
              </div>

              {/* Nombre y Rol */}
              <div className="flex flex-col text-left leading-tight hidden sm:flex">
                <span className="text-[13px] font-semibold text-[#1B2430] truncate max-w-[130px]">
                  {nombreUsuario}
                </span>
                <span className="text-[11.5px] font-normal text-[#5B6675] truncate max-w-[130px]">
                  {rolActual === 'ADMIN' ? 'Administrador' : rolActual === 'CONTADOR' ? 'Contador' : rolActual === 'AUDITOR' ? 'Auditor' : 'Asistente'}
                </span>
              </div>

              <ChevronDown className="w-3.5 h-3.5 text-[#5B6675] shrink-0" strokeWidth={1.7} />
            </button>

            {/* Dropdown del Usuario: Selector de Rol y Cerrar Sesión */}
            {isUserMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1.5 w-[230px] bg-white border border-[#E3E8EF] rounded-[10px] shadow-lg py-1.5 z-50 animate-in fade-in-50 duration-100"
              >
                <div className="px-3 py-1.5 border-b border-[#E3E8EF] mb-1">
                  <p className="text-[11px] font-medium text-[#5B6675] uppercase tracking-wider">
                    Usuario activo
                  </p>
                  <p className="text-[13px] font-semibold text-[#1B2430] truncate">
                    {nombreUsuario}
                  </p>
                </div>

                <div className="px-3 py-1">
                  <p className="text-[11px] font-medium text-[#5B6675] mb-1">
                    Cambiar rol de trabajo:
                  </p>
                  {opcionesRoles.map((r) => {
                    const isSelected = rolActual === r.rol;
                    return (
                      <button
                        key={r.rol}
                        type="button"
                        onClick={() => {
                          onCambiarPerfil(r.value);
                          setIsUserMenuOpen(false);
                        }}
                        className={`w-full text-left text-[12px] px-2 py-1.5 rounded-md flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-[#E6EDFE] text-[#2457D6] font-semibold'
                            : 'text-[#1B2430] hover:bg-[#F5F7FB]'
                        }`}
                      >
                        <span>{r.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#2457D6]" />}
                      </button>
                    );
                  })}
                </div>

                <div className="my-1 border-t border-[#E3E8EF]" />

                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onAction('Cerrar sesión', 'cerrar-sesion');
                  }}
                  className="w-full text-left text-[12.5px] px-3 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors cursor-pointer font-medium"
                >
                  <LogOut className="w-4 h-4 text-red-600 shrink-0" strokeWidth={1.7} />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          FRANJA 2: MENÚ PRINCIPAL (40px)
          13 Menús en orden exacto, texto 13.5px, hover #F5F7FB, activo con barra 2px
      ========================================================================= */}
      <nav
        role="menubar"
        aria-label="Menú principal de Atlob Consultores ERP"
        className="h-[40px] px-4 flex items-center border-b border-[#E3E8EF] bg-white gap-[2px] relative z-30 overflow-visible"
      >
        {MENU_DATA.map((group: MenuGroup) => {
          const isOpen = activeMenuId === group.id;
          const isActiveGroup = grupoActivoId === group.id;
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
                className={`h-[40px] px-3 text-[13.5px] transition-colors relative flex items-center justify-center select-none focus:outline-none cursor-pointer ${
                  isOpen
                    ? 'bg-[#F5F7FB] text-[#1B2430] font-semibold'
                    : isActiveGroup
                    ? 'text-[#2457D6] font-semibold hover:bg-[#F5F7FB]'
                    : 'text-[#3B4656] hover:bg-[#F5F7FB] hover:text-[#1B2430]'
                }`}
              >
                {group.label}

                {/* Línea inferior indicadora de 2px cuando el módulo está activo */}
                {isActiveGroup && (
                  <span
                    className="absolute bottom-0 left-3 right-3 h-[2px] bg-[#2457D6] rounded-full"
                    aria-hidden="true"
                  />
                )}
              </button>

              {/* Panel Desplegable de Menú de Primer Nivel */}
              {isOpen && (
                <div
                  role="menu"
                  aria-label={group.label}
                  className={`absolute top-full ${
                    group.id === 'ayuda' || group.id === 'herramientas' ? 'right-0' : 'left-0'
                  } min-w-[260px] bg-white border border-[#E3E8EF] rounded-[10px] py-1 shadow-xl z-50 animate-in fade-in-50 duration-100`}
                >
                  {group.items.map((item: MenuItem) => {
                    if (item.separator) {
                      return (
                        <div
                          key={item.id}
                          role="separator"
                          className="my-1 border-t border-[#E3E8EF]"
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
                          className={`flex items-center justify-between text-[13px] px-3 py-1.5 mx-1 rounded-md select-none leading-tight transition-colors ${
                            deshabilitado
                              ? 'text-[#9CA3AF] cursor-not-allowed bg-transparent'
                              : isSubmenuOpen || isKeyboardFocused
                              ? 'bg-[#F5F7FB] text-[#2457D6] cursor-pointer font-medium'
                              : 'text-[#1B2430] hover:bg-[#F5F7FB] cursor-pointer'
                          }`}
                        >
                          <span className="truncate pr-3">{item.label}</span>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {isProximamente && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-[#F5F7FA] border border-[#E3E8EF] text-[#9CA3AF] rounded">
                                próximamente
                              </span>
                            )}
                            {!isProximamente && !permitidoPorRol && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] rounded">
                                solo admin
                              </span>
                            )}
                            {item.shortcut && (
                              <span className="text-[11px] font-sans text-[#5B6675]">
                                {item.shortcut}
                              </span>
                            )}
                            {hasChildren && (
                              <ChevronRight className="w-3.5 h-3.5 text-[#5B6675]" strokeWidth={1.5} />
                            )}
                          </div>
                        </div>

                        {/* Submenú de Segundo Nivel */}
                        {hasChildren && isSubmenuOpen && (
                          <div
                            role="menu"
                            aria-label={item.label}
                            className={`absolute top-0 ${
                              group.id === 'ayuda' || group.id === 'herramientas'
                                ? 'right-full mr-0.5'
                                : 'left-full ml-0.5'
                            } min-w-[250px] bg-white border border-[#E3E8EF] rounded-[10px] py-1 shadow-xl z-50 animate-in fade-in-50 duration-100`}
                          >
                            {item.children!.map((subItem: MenuItem) => {
                              if (subItem.separator) {
                                return (
                                  <div
                                    key={subItem.id}
                                    role="separator"
                                    className="my-1 border-t border-[#E3E8EF]"
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
                                  className={`flex items-center justify-between text-[13px] px-3 py-1.5 mx-1 rounded-md select-none leading-tight transition-colors ${
                                    subDeshabilitado
                                      ? 'text-[#9CA3AF] cursor-not-allowed bg-transparent'
                                      : 'text-[#1B2430] hover:bg-[#F5F7FB] hover:text-[#2457D6] cursor-pointer'
                                  }`}
                                >
                                  <span className="truncate pr-3">{subItem.label}</span>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {subProximamente && (
                                      <span className="text-[10px] px-1.5 py-0.5 bg-[#F5F7FA] border border-[#E3E8EF] text-[#9CA3AF] rounded">
                                        próximamente
                                      </span>
                                    )}
                                    {subItem.shortcut && (
                                      <span className="text-[11px] font-sans text-[#5B6675]">
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

      {/* =========================================================================
          FRANJA 3: ACCIONES RÁPIDAS (48px, fondo #F7F9FC)
          Botones sin borde: alto 32px, radio 8px, texto 13px #1B2430, icono 16px #2457D6 (stroke 1.7)
          Hover: #EAF0FF
      ========================================================================= */}
      <div
        role="toolbar"
        aria-label="Barra de herramientas de acceso rápido"
        className="h-[48px] px-6 bg-[#F7F9FC] border-b border-[#E3E8EF] flex items-center gap-1 overflow-x-auto no-scrollbar whitespace-nowrap"
      >
        {/* 1. Registrar compra */}
        <button
          type="button"
          disabled={esAuditor}
          title={esAuditor ? 'Rol Auditor: solo lectura' : 'Registrar compra'}
          onClick={() => {
            closeAllMenus();
            onAction('Compras y Ventas › Registro de compras', 'reg-compras');
          }}
          className={`h-8 px-3 rounded-lg text-[13px] font-medium inline-flex items-center gap-2 transition-colors border-0 ${
            esAuditor
              ? 'opacity-50 cursor-not-allowed bg-transparent text-[#5B6675]'
              : 'text-[#1B2430] hover:bg-[#EAF0FF] cursor-pointer'
          }`}
        >
          <ShoppingBag className="w-4 h-4 text-[#2457D6] shrink-0" strokeWidth={1.7} />
          <span>Registrar compra</span>
        </button>

        {/* 2. Registrar venta */}
        <button
          type="button"
          disabled={esAuditor}
          title={esAuditor ? 'Rol Auditor: solo lectura' : 'Registrar venta'}
          onClick={() => {
            closeAllMenus();
            onAction('Compras y Ventas › Registro de ventas', 'reg-ventas');
          }}
          className={`h-8 px-3 rounded-lg text-[13px] font-medium inline-flex items-center gap-2 transition-colors border-0 ${
            esAuditor
              ? 'opacity-50 cursor-not-allowed bg-transparent text-[#5B6675]'
              : 'text-[#1B2430] hover:bg-[#EAF0FF] cursor-pointer'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-[#2457D6] shrink-0" strokeWidth={1.7} />
          <span>Registrar venta</span>
        </button>

        {/* 3. Asiento nuevo (F2) */}
        <button
          type="button"
          disabled={esAuditor}
          title={esAuditor ? 'Rol Auditor: solo lectura' : 'Asiento contable nuevo [F2]'}
          onClick={() => {
            closeAllMenus();
            onAction('Contabilidad › Asientos', 'asientos');
          }}
          className={`h-8 px-3 rounded-lg text-[13px] font-medium inline-flex items-center gap-2 transition-colors border-0 ${
            esAuditor
              ? 'opacity-50 cursor-not-allowed bg-transparent text-[#5B6675]'
              : 'text-[#1B2430] hover:bg-[#EAF0FF] cursor-pointer'
          }`}
        >
          <FilePlus className="w-4 h-4 text-[#2457D6] shrink-0" strokeWidth={1.7} />
          <span>Asiento nuevo</span>
          <span className="text-[10.5px] text-[#5B6675] font-sans bg-white border border-[#E3E8EF] rounded px-1.5 py-0.5 leading-none">
            F2
          </span>
        </button>

        {/* 4. Consolidar mes */}
        <button
          type="button"
          disabled={esAuditor}
          title={esAuditor ? 'Rol Auditor: solo lectura' : 'Consolidación mensual de inventarios y asientos'}
          onClick={() => {
            closeAllMenus();
            onAction('Contabilidad › Consolidar mes', 'consolidar-mes');
          }}
          className={`h-8 px-3 rounded-lg text-[13px] font-medium inline-flex items-center gap-2 transition-colors border-0 ${
            esAuditor
              ? 'opacity-50 cursor-not-allowed bg-transparent text-[#5B6675]'
              : 'text-[#1B2430] hover:bg-[#EAF0FF] cursor-pointer'
          }`}
        >
          <Layers className="w-4 h-4 text-[#2457D6] shrink-0" strokeWidth={1.7} />
          <span>Consolidar mes</span>
        </button>

        {/* 5. Conciliar SIRE (F4) */}
        <button
          type="button"
          title="Conciliador SIRE RCE / RVIE [F4]"
          onClick={() => {
            closeAllMenus();
            onAction('Registros Electrónicos › SIRE › Conciliador de compras y ventas', 'sire-conciliador');
          }}
          className="h-8 px-3 rounded-lg text-[13px] font-medium text-[#1B2430] inline-flex items-center gap-2 hover:bg-[#EAF0FF] transition-colors cursor-pointer border-0"
        >
          <ArrowLeftRight className="w-4 h-4 text-[#2457D6] shrink-0" strokeWidth={1.7} />
          <span>Conciliar SIRE</span>
          <span className="text-[10.5px] text-[#5B6675] font-sans bg-white border border-[#E3E8EF] rounded px-1.5 py-0.5 leading-none">
            F4
          </span>
        </button>

        {/* Espacio flexible para empujar Cambiar empresa a la derecha */}
        <div className="flex-1" aria-hidden="true" />

        {/* 6. Cambiar empresa (Ctrl+K) */}
        <button
          type="button"
          title="Abrir o cambiar empresa activa [Ctrl+K]"
          onClick={() => {
            closeAllMenus();
            onAction('Archivo › Abrir empresa…', 'abrir-empresa');
          }}
          className="h-8 px-3 rounded-lg text-[13px] font-medium text-[#1B2430] inline-flex items-center gap-2 hover:bg-[#EAF0FF] transition-colors cursor-pointer border-0"
        >
          <Building2 className="w-4 h-4 text-[#2457D6] shrink-0" strokeWidth={1.7} />
          <span>Cambiar empresa</span>
          <span className="text-[10.5px] text-[#5B6675] font-sans bg-white border border-[#E3E8EF] rounded px-1.5 py-0.5 leading-none">
            Ctrl+K
          </span>
        </button>
      </div>
    </header>
  );
};
