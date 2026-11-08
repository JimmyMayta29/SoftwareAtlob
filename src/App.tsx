/**
 * Atlob Consultores ERP - Sistema de Gestión Contable y Tributaria
 * Desarrollado por Jimmy Mayta
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, FolderTree, Search } from 'lucide-react';
import { EmpresaCliente, AsientoContable, Comprobante } from './types';
import { EMPRESAS_CLIENTES_DEMO, crearDatosInicialesEmpresa } from './data/empresasClientes';
import { calcularLiquidacionPDT621 } from './services/accountingEngine';
import { MENU_DATA, obtenerItemsHojaMenu, tienePermisoMenu } from './types/menu';

// TopBar & Desktop Navigation
import { TopBar, obtenerCodigoRolDesdePerfil } from './components/desktop/TopBar';
import { VentanaModal } from './components/ui/VentanaModal';

// Contexts
import { EmpresaPeriodoProvider, useEmpresaPeriodo, type UsuarioEstudio } from './context/EmpresaPeriodoContext';
import { authApi, type Sesion } from './api/authApi';
import { empresasApi } from './api/empresasApi';
import { guardarSesion, limpiarSesion, obtenerAccessToken } from './api/session';
import { AsistenteSetupInicial } from './components/setup/AsistenteSetupInicial';
import { LoginView } from './components/views/LoginView';
import atlobLogo from './assets/brand/atlob_logo_horizontal.webp';
import { useToast } from './context/ToastContext';
import { useReportStyle } from './context/ReportStyleContext';
import { tipoCambioApi, TipoCambioDTO } from './api/tipoCambioApi';
import { ModalTipoCambioManual } from './components/modals/ModalTipoCambioManual';
import { calcularAlertaVencimientoUI } from './utils/cronogramaSunat';

// Separated Views — 1 option = 1 exclusive view
import { VouchersView } from './components/views/VouchersView';
import { SubdiariosView } from './components/views/SubdiariosView';
import { AdministrarSubdiariosView } from './components/views/AdministrarSubdiariosView';
import { PlanCuentasView } from './components/views/PlanCuentasView';
import { CentrosCostoView } from './components/views/CentrosCostoView';
import { LibroDiarioView } from './components/views/LibroDiarioView';
import { LibroMayorView } from './components/views/LibroMayorView';
import { CajaBancosView } from './components/views/CajaBancosView';
import { DiferenciaCambioView } from './components/views/DiferenciaCambioView';
import { CierreMensualView } from './components/views/CierreMensualView';
import { CierreAnualView } from './components/views/CierreAnualView';
import { ConsolidarMesView } from './components/views/ConsolidarMesView';
import { RegistroComprasView } from './components/views/RegistroComprasView';
import { RegistroVentasView } from './components/views/RegistroVentasView';
import { DetraccionesRetencionesView } from './components/views/DetraccionesRetencionesView';
import { EmitirComprobanteView } from './components/views/EmitirComprobanteView';
import { NotasCreditoDebitoView } from './components/views/NotasCreditoDebitoView';
import { ConsultaComprobantesView } from './components/views/ConsultaComprobantesView';
import { LectorXmlCdrView } from './components/views/LectorXmlCdrView';
import { LiquidacionTributariaView } from './components/views/LiquidacionTributariaView';
import { ProrrataIgvView } from './components/views/ProrrataIgvView';
import { DaotView } from './components/views/DaotView';
import { DeclaracionRentaAnualView } from './components/views/DeclaracionRentaAnualView';
import { CronogramaVencimientosView } from './components/views/CronogramaVencimientosView';
import { ParametrosTributariosView } from './components/views/ParametrosTributariosView';
import { SimuladorFiscalizacionView } from './components/views/SimuladorFiscalizacionView';
import { TrabajadoresView } from './components/views/TrabajadoresView';
import { PlanillaPlameView } from './components/views/PlanillaPlameView';
import { HonorariosView } from './components/views/HonorariosView';
import { BoletasPagoView } from './components/views/BoletasPagoView';
import { GratificacionesCtsView } from './components/views/GratificacionesCtsView';
import { ExportarPlameView } from './components/views/ExportarPlameView';
import { TRegistroView } from './components/views/TRegistroView';
import { SirePropuestaComprasView } from './components/views/SirePropuestaComprasView';
import { SirePropuestaVentasView } from './components/views/SirePropuestaVentasView';
import { SireConciliadorView } from './components/views/SireConciliadorView';
import { SireAjustesReemplazoView } from './components/views/SireAjustesReemplazoView';
import { LibrosElectronicosView } from './components/views/LibrosElectronicosView';
import { ValidarLibrosElectronicosView } from './components/views/ValidarLibrosElectronicosView';
import { CuentasBancariasView } from './components/views/CuentasBancariasView';
import { ConciliacionBancariaView } from './components/views/ConciliacionBancariaView';
import { MovimientosBancariosView } from './components/views/MovimientosBancariosView';
import { FlujoCajaProyectadoView } from './components/views/FlujoCajaProyectadoView';
import { CuentasPorCobrarView } from './components/views/CuentasPorCobrarView';
import { CuentasPorPagarView } from './components/views/CuentasPorPagarView';
import { AntiguedadSaldosView } from './components/views/AntiguedadSaldosView';
import { CajaChicaAperturaView } from './components/views/CajaChicaAperturaView';
import { CajaChicaGastosView } from './components/views/CajaChicaGastosView';
import { CajaChicaReposicionView } from './components/views/CajaChicaReposicionView';
import { HojaTrabajo10ColumnasView } from './components/views/HojaTrabajo10ColumnasView';
import { BalanceGeneralView } from './components/views/BalanceGeneralView';
import { EstadoResultadosView } from './components/views/EstadoResultadosView';
import { FlujoEfectivoView } from './components/views/FlujoEfectivoView';
import { AnalisisCuentasView } from './components/views/AnalisisCuentasView';
import { MisEmpresasNivel1View } from './components/views/MisEmpresasNivel1View';
import { DashboardView } from './components/views/DashboardView';
import { ControlCalidadEstudioView } from './components/views/ControlCalidadEstudioView';
import { BibliotecaPlantillasView } from './components/views/BibliotecaPlantillasView';
import { ClientesProveedoresView } from './components/views/ClientesProveedoresView';
import { TiposComprobanteView } from './components/views/TiposComprobanteView';
import { TipoCambioView } from './components/views/TipoCambioView';
import { BancosView } from './components/views/BancosView';
import { UnidadesMedidaView } from './components/views/UnidadesMedidaView';
import { PeriodosView } from './components/views/PeriodosView';
import { UsuariosPermisosView } from './components/views/UsuariosPermisosView';
import { MapaAuditoriaSistemaView } from './components/views/MapaAuditoriaSistemaView';
import { SunatSyncView } from './components/views/SunatSyncView';
import { GuiaRapidaAtajosView } from './components/views/GuiaRapidaAtajosView';

// Modals
import { CalculadoraContableModal } from './components/modals/CalculadoraContableModal';
import { AcercaDeModal } from './components/modals/AcercaDeModal';
import { SearchEmpresasModal } from './components/modals/SearchEmpresasModal';
import { ConfigEmpresaModal } from './components/modals/ConfigEmpresaModal';
import { ModalImportacionCsv } from './components/modals/ModalImportacionCsv';
import { ModalBackupEmpresa } from './components/modals/ModalBackupEmpresa';
import { ModalNuevaEmpresaBlanco } from './components/modals/ModalNuevaEmpresaBlanco';
import { PdfExportModal } from './components/modals/PdfExportModal';

const EMPRESA_SIN_SELECCION: EmpresaCliente = {
  id: '', ruc: '', razonSocial: 'Sin empresa seleccionada', nombreComercial: '', direccionFiscal: '',
  contactoNombre: '', contactoTelefono: '', contactoEmail: '', regimenTributario: 'REGIMEN_GENERAL',
  tasaRentaMensual: 0, ambienteSunat: 'BETA_TEST', ultimoDigitoRuc: '', vencimientoPdt621: '',
  vencimientoSire: '', vencimientoPlame: '', estadoDeclaracion: 'POR_VENCER', preliquidacionNotificada: false,
};

function DesktopWorkspaceContent({ empresasIniciales, conectado = false }: { empresasIniciales: EmpresaCliente[]; conectado?: boolean }) {
  const {
    empresaActiva,
    periodo,
    entrarAEmpresa,
    isPeriodoCerrado,
    setIsSearchModalOpen,
    isSearchModalOpen,
    usuario,
    rolEnEmpresa,
    cerrarSesion,
  } = useEmpresaPeriodo();

  const { success, info } = useToast();
  const { setReportStyle } = useReportStyle();

  const [empresasLista, setEmpresasLista] = useState<EmpresaCliente[]>(empresasIniciales);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [activeModuleTitle, setActiveModuleTitle] = useState<string>('');
  const [ultimaAccion, setUltimaAccion] = useState<string>('Listo');
  const [perfil, setPerfil] = useState<string>(conectado && usuario?.nombre ? usuario.nombre : 'Administrador');
  const [tipoCambioGlobal, setTipoCambioGlobal] = useState<TipoCambioDTO | null>(null);
  const [isModalTcGlobalOpen, setIsModalTcGlobalOpen] = useState(false);

  useEffect(() => {
    let activo = true;
    tipoCambioApi.obtenerVigente().then((tc) => {
      if (activo) setTipoCambioGlobal(tc);
    }).catch(() => {});
    return () => { activo = false; };
  }, []);

  // Modales
  const [isCalculadoraOpen, setIsCalculadoraOpen] = useState(false);
  const [isAcercaDeOpen, setIsAcercaDeOpen] = useState(false);
  const [isConfigEmpresaOpen, setIsConfigEmpresaOpen] = useState(false);
  const [isImportarCsvOpen, setIsImportarCsvOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isNuevaEmpresaOpen, setIsNuevaEmpresaOpen] = useState(false);
  const [isPdfExportOpen, setIsPdfExportOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');

  // Datos contables de la empresa activa
  const empresaActual = empresaActiva || (conectado ? EMPRESA_SIN_SELECCION : EMPRESAS_CLIENTES_DEMO[0]);
  const empresaId = empresaActual.id;
  const dataState = useMemo(
    () => conectado
      ? { asientos: [], compras: [], ventas: [], movimientosBancarios: [], trabajadoresPlanilla: [], honorarios: [], saldoAnteriorIgv: 0 }
      : crearDatosInicialesEmpresa(empresaId, empresaActual.ruc, empresaActual.razonSocial),
    [conectado, empresaId, empresaActual.ruc, empresaActual.razonSocial]
  );

  const [asientos, setAsientos] = useState<AsientoContable[]>(dataState.asientos);
  const [compras, setCompras] = useState<Comprobante[]>(dataState.compras);
  const [ventas, setVentas] = useState<Comprobante[]>(dataState.ventas);
  const [saldoAnteriorIgv, setSaldoAnteriorIgv] = useState<number>(dataState.saldoAnteriorIgv);

  const liquidacion = useMemo(() => {
    return calcularLiquidacionPDT621(
      compras,
      ventas,
      periodo,
      empresaActual.tasaRentaMensual || 0.01,
      saldoAnteriorIgv
    );
  }, [compras, ventas, periodo, empresaActual.tasaRentaMensual, saldoAnteriorIgv]);

  const rolActual = conectado ? (empresaActiva ? rolEnEmpresa : usuario.rolGlobal) : obtenerCodigoRolDesdePerfil(perfil);
  const esAdmin = rolActual === 'ADMIN_ESTUDIO' || rolActual === 'ADMINISTRADOR' || perfil === 'ADMINISTRADOR';
  const usuarioNombreVisible = conectado ? (usuario?.nombre || usuario?.email || 'Administrador') : perfil;
  const alertaVencimiento = useMemo(() => {
    return calcularAlertaVencimientoUI(empresaActual.ruc, periodo);
  }, [empresaActual.ruc, periodo]);

  const todosItemsHoja = useMemo(() => obtenerItemsHojaMenu(MENU_DATA), []);
  const comandosFiltrados = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    return todosItemsHoja.filter((entry) => {
      if (!q) return true;
      return (
        entry.rutaCompleta.toLowerCase().includes(q) ||
        entry.id.toLowerCase().includes(q) ||
        (entry.shortcut || '').toLowerCase().includes(q)
      );
    });
  }, [todosItemsHoja, commandQuery]);

  // Manejador central de acciones de la barra superior (1 opción = 1 vista o modal exclusivo)
  const handleTopBarAction = useCallback(
    (ruta: string, itemId?: string) => {
      setUltimaAccion(ruta);

      if (!itemId) return;

      if (itemId === 'paleta-comandos') {
        setIsCommandPaletteOpen(true);
        return;
      }
      if (itemId === 'calculadora-tributaria' || itemId === 'calculadora') {
        setIsCalculadoraOpen(true);
        return;
      }
      if (itemId === 'imprimir') {
        setIsPdfExportOpen(true);
        return;
      }
      if (itemId === 'abrir-empresa' || itemId === 'buscar-empresa' || itemId === 'cambiar-empresa') {
        setIsSearchModalOpen(true);
        return;
      }
      if (itemId === 'datos-empresa' || itemId === 'configurar-empresa') {
        if (conectado && !empresaActiva) return;
        setIsConfigEmpresaOpen(true);
        return;
      }
      if (itemId === 'importar-datos-csv' || itemId === 'importar-csv') {
        setIsImportarCsvOpen(true);
        return;
      }
      if (itemId === 'respaldo-restauracion' || itemId === 'respaldos') {
        setIsBackupOpen(true);
        return;
      }
      if (itemId === 'nueva-empresa') {
        setIsNuevaEmpresaOpen(true);
        return;
      }
      if (itemId === 'acerca-de' || itemId === 'autor') {
        setIsAcercaDeOpen(true);
        return;
      }
      if (itemId === 'cerrar-sesion') {
        if (conectado) { void cerrarSesion(); return; }
        setActiveModuleId(null);
        info('Sesión cerrada y contexto reiniciado.', 'Sesión');
        return;
      }
      if (itemId === 'salir-aplicacion' || itemId === 'salir-app') {
        setActiveModuleId(null);
        info('Área de trabajo cerrada.', 'Salir');
        return;
      }
      if (itemId === 'formato-estandar') {
        setReportStyle('estandar');
        success('Formato de reporte establecido en Formato estándar Atlob (monocromo).', 'Formato de Reportes');
        return;
      }
      if (itemId === 'formato-corporativo') {
        setReportStyle('actual');
        success('Formato de reporte establecido en Formato corporativo Atlob.', 'Formato de Reportes');
        return;
      }
      if (itemId === 'restaurar-demo') {
        if (conectado) return;
        setCompras(dataState.compras);
        setVentas(dataState.ventas);
        setAsientos(dataState.asientos);
        success('Datos de prueba y saldos restablecidos al estado inicial.', 'Restauración Demo');
        return;
      }

      // Abrir vista dedicada en el área de trabajo
      const modulosEstudioSinEmpresa = new Set([
        'cartera-empresas',
        'usuarios-permisos',
        'usuarios-roles',
        'guia-rapida',
        'guia-rapida-atajos'
      ]);
      if (conectado && !empresaActiva && !modulosEstudioSinEmpresa.has(itemId)) {
        info('Selecciona una empresa para abrir este módulo.');
        return;
      }
      setActiveModuleId(itemId);
      setActiveModuleTitle(ruta);
    },
    [cerrarSesion, conectado, dataState, empresaActiva, info, setIsSearchModalOpen, setReportStyle, success]
  );

  const handleCerrarModulo = () => {
    setActiveModuleId(null);
    setUltimaAccion('Área de trabajo (módulo cerrado)');
  };

  const handleAddEmpresa = async (nueva: EmpresaCliente) => {
    if (conectado) {
      const empresas = await empresasApi.listar();
      setEmpresasLista(empresas);
      if (await entrarAEmpresa(empresas.find(empresa => empresa.id === nueva.id) ?? nueva)) setActiveModuleId(null);
    } else {
      setEmpresasLista(prev => [nueva, ...prev]);
      await entrarAEmpresa(nueva);
    }
    setIsNuevaEmpresaOpen(false);
    success(`Empresa ${nueva.razonSocial} registrada y seleccionada como activa.`, 'Empresa Registrada');
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#F5F7FA] text-[#111827]">
      {/* 1. BARRA SUPERIOR COMPLETA (Título, Menubar y Barra de Herramientas en una fila) */}
      <TopBar
        onAction={handleTopBarAction}
        empresaNombre={empresaActual.razonSocial}
        empresaRuc={empresaActual.ruc}
        periodoNombre={periodo}
        ambienteSunat={empresaActual.ambienteSunat || 'BETA'}
        perfilSeleccionado={conectado ? usuario.nombre : perfil}
        rolAutenticado={conectado ? rolActual : undefined}
        onCambiarPerfil={(nuevo) => {
          setPerfil(nuevo);
          setUltimaAccion(`Rol cambiado a: ${nuevo}`);
        }}
        onAbrirPaletaComandos={() => {
          setCommandQuery('');
          setIsCommandPaletteOpen(true);
        }}
      />

      {/* 2. ÁREA DE TRABAJO PRINCIPAL */}
      <main className="flex-1 flex flex-col bg-[#F5F7FA] overflow-hidden relative">
        {conectado && !empresaActiva && (!activeModuleId || activeModuleId === 'cartera-empresas') ? (
          <MisEmpresasNivel1View
            empresas={empresasLista}
            onAddEmpresa={handleAddEmpresa}
            onCrearEmpresa={() => setIsNuevaEmpresaOpen(true)}
            onAbrirUsuarios={() => handleTopBarAction('Herramientas › Usuarios y permisos', 'usuarios-permisos')}
          />
        ) : activeModuleId ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#FFFFFF]">
            {/* Barra de título interna de la vista activa */}
            <div className="flex-shrink-0 flex items-center justify-between px-3 py-1 bg-[#E8ECF1] border-b border-[#D1D5DB] text-[12px]">
              <div className="flex items-center gap-2 text-[#111827]">
                <span className="font-bold text-[#1E3A5F]">{activeModuleTitle}</span>
                <span className="text-[#9CA3AF]">|</span>
                <span className="font-mono text-[#4B5563]">
                  {empresaActiva
                    ? `${empresaActual.ruc} — ${empresaActual.razonSocial}`
                    : `${usuario.estudioNombre || 'Estudio Contable'} — Administración general`}
                </span>
              </div>

              <button
                type="button"
                onClick={handleCerrarModulo}
                className="flex items-center justify-center w-5 h-5 bg-[#FFFFFF] border border-[#D1D5DB] hover:bg-[#FEE2E2] hover:border-[#B91C1C] hover:text-[#B91C1C] text-[#111827]"
                title="Cerrar ventana de trabajo"
                aria-label="Cerrar ventana de trabajo"
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>

            {/* Contenido del módulo (separación estricta 1 a 1) */}
            <div className="flex-1 overflow-auto p-3">
              {/* Archivo */}
              {activeModuleId === 'periodo-trabajo' && <PeriodosView empresaId={empresaId} />}

              {/* Contabilidad */}
              {activeModuleId === 'asientos' && (
                <VouchersView
                  empresaId={empresaId}
                  periodo={periodo}
                  isPeriodoCerrado={isPeriodoCerrado}
                  empresa={empresaActual}
                  usuarioNombre={usuarioNombreVisible}
                  usuarioRol={rolActual}
                />
              )}
              {activeModuleId === 'subdiarios-registro' && (
                <SubdiariosView
                  empresaId={empresaId}
                  periodo={periodo}
                  empresa={empresaActual}
                  usuarioRol={rolActual}
                  usuarioNombre={usuarioNombreVisible}
                  isPeriodoCerrado={isPeriodoCerrado}
                />
              )}
              {activeModuleId === 'administrar-subdiarios' && (
                <AdministrarSubdiariosView
                  empresaId={empresaId}
                  usuarioRol={rolActual}
                />
              )}
              {activeModuleId === 'plan-cuentas' && <PlanCuentasView rolUsuario={rolActual} esAdmin={esAdmin} />}
              {activeModuleId === 'centros-costo' && <CentrosCostoView />}
              {activeModuleId === 'libro-diario' && (
                <LibroDiarioView
                  asientos={asientos}
                  empresa={empresaActual}
                  periodo={periodo}
                  persistente={conectado}
                  onGenerarAsientosMasivos={() => success('Asientos contables centralizados en el Libro Diario.')}
                />
              )}
              {activeModuleId === 'libro-mayor' && (
                <LibroMayorView
                  asientos={asientos}
                  empresa={empresaActual}
                  periodo={periodo}
                />
              )}
              {activeModuleId === 'caja-bancos' && (
                <CajaBancosView
                  empresaId={empresaId}
                  periodo={periodo}
                  movimientos={dataState.movimientosBancarios}
                />
              )}
              {(activeModuleId === 'dif-cambio' || activeModuleId === 'diferencia-cambio') && <DiferenciaCambioView />}
              {activeModuleId === 'consolidar-mes' && (
                <ConsolidarMesView
                  empresaId={empresaId}
                  periodo={periodo}
                  isPeriodoCerrado={isPeriodoCerrado}
                  empresa={empresaActual}
                />
              )}
              {activeModuleId === 'cierre-mensual' && <CierreMensualView />}
              {activeModuleId === 'cierre-anual' && <CierreAnualView />}

              {/* Compras y Ventas */}
              {(activeModuleId === 'reg-compras' || activeModuleId === 'registro-compras') && (
                <RegistroComprasView
                  compras={compras}
                  empresa={empresaActual}
                  periodo={periodo}
                  onGenerarAsientos={() => success('Asientos de compras centralizados en el Libro Diario.')}
                />
              )}
              {(activeModuleId === 'reg-ventas' || activeModuleId === 'registro-ventas') && (
                <RegistroVentasView
                  ventas={ventas}
                  empresa={empresaActual}
                  periodo={periodo}
                />
              )}
              {activeModuleId === 'detracciones-retenciones' && <DetraccionesRetencionesView />}

              {/* Facturación */}
              {activeModuleId === 'emitir-cp' && <EmitirComprobanteView />}
              {(activeModuleId === 'notas-cd' || activeModuleId === 'notas-credito-debito') && <NotasCreditoDebitoView />}
              {(activeModuleId === 'consulta-cp' || activeModuleId === 'consulta-comprobantes') && <ConsultaComprobantesView />}
              {activeModuleId === 'lector-xml-cdr' && <LectorXmlCdrView />}

              {/* Tributos */}
              {(activeModuleId === 'declaracion-igv-renta' || activeModuleId === 'declaracion-mensual-igv-renta') && (
                <LiquidacionTributariaView
                  liquidacion={liquidacion}
                  empresa={empresaActual}
                  compras={compras}
                  ventas={ventas}
                  onUpdateSaldoAnterior={(nuevo) => setSaldoAnteriorIgv(nuevo)}
                  periodo={periodo}
                  rolUsuario={rolActual}
                />
              )}
              {activeModuleId === 'prorrata-igv' && <ProrrataIgvView />}
              {(activeModuleId === 'daot' || activeModuleId === 'daot-operaciones-terceros') && <DaotView />}
              {(activeModuleId === 'declaracion-renta-anual' || activeModuleId === 'declaracion-anual-renta') && <DeclaracionRentaAnualView />}
              {activeModuleId === 'cronograma-vencimientos' && <CronogramaVencimientosView />}
              {activeModuleId === 'parametros-tributarios' && <ParametrosTributariosView />}
              {activeModuleId === 'simulador-fiscalizacion' && <SimuladorFiscalizacionView />}

              {/* Planillas */}
              {activeModuleId === 'trabajadores' && <TrabajadoresView />}
              {activeModuleId === 'planilla-mensual' && (
                <PlanillaPlameView
                  empresaId={empresaId}
                  periodo={periodo}
                  trabajadores={dataState.trabajadoresPlanilla}
                />
              )}
              {activeModuleId === 'recibos-honorarios' && (
                <HonorariosView
                  empresa={empresaActual}
                  periodo={periodo}
                  honorarios={dataState.honorarios}
                />
              )}
              {activeModuleId === 'boletas-pago' && <BoletasPagoView />}
              {activeModuleId === 'gratificaciones-cts' && <GratificacionesCtsView />}
              {activeModuleId === 'exportar-plame' && <ExportarPlameView />}
              {activeModuleId === 't-registro' && <TRegistroView />}

              {/* Registros Electrónicos */}
              {(activeModuleId === 'sire-prop-compras' || activeModuleId === 'sire-propuesta-compras') && <SirePropuestaComprasView />}
              {(activeModuleId === 'sire-prop-ventas' || activeModuleId === 'sire-propuesta-ventas') && <SirePropuestaVentasView />}
              {activeModuleId === 'sire-conciliador' && (
                <SireConciliadorView
                  compras={compras}
                  empresa={empresaActual}
                  periodo={periodo}
                />
              )}
              {(activeModuleId === 'sire-txt-ajustes' || activeModuleId === 'sire-ajustes-reemplazo') && <SireAjustesReemplazoView />}
              {(activeModuleId === 'libros-electronicos' || activeModuleId === 'generar-libros-electronicos') && <LibrosElectronicosView />}
              {activeModuleId === 'validar-libros-electronicos' && <ValidarLibrosElectronicosView />}

              {/* Tesorería */}
              {activeModuleId === 'cuentas-bancarias' && <CuentasBancariasView />}
              {activeModuleId === 'conciliacion-bancaria' && <ConciliacionBancariaView />}
              {(activeModuleId === 'mov-bancarios' || activeModuleId === 'movimientos-bancarios') && <MovimientosBancariosView />}
              {activeModuleId === 'flujo-caja-proyectado' && <FlujoCajaProyectadoView />}
              {(activeModuleId === 'cxc' || activeModuleId === 'cuentas-por-cobrar') && <CuentasPorCobrarView />}
              {(activeModuleId === 'cxp' || activeModuleId === 'cuentas-por-pagar') && <CuentasPorPagarView />}
              {activeModuleId === 'antiguedad-saldos' && <AntiguedadSaldosView />}
              {(activeModuleId === 'caja-apertura-cierre' || activeModuleId === 'caja-chica-apertura') && <CajaChicaAperturaView />}
              {(activeModuleId === 'caja-gastos' || activeModuleId === 'caja-chica-gastos') && <CajaChicaGastosView />}
              {(activeModuleId === 'caja-reposicion' || activeModuleId === 'caja-chica-reposicion') && <CajaChicaReposicionView />}

              {/* Estados Financieros */}
              {(activeModuleId === 'hoja-trabajo' || activeModuleId === 'hoja-trabajo-10-col') && (
                <HojaTrabajo10ColumnasView
                  asientos={asientos}
                  empresa={empresaActual}
                  periodo={periodo}
                />
              )}
              {(activeModuleId === 'estado-situacion' || activeModuleId === 'balance-general') && <BalanceGeneralView />}
              {activeModuleId === 'estado-resultados' && <EstadoResultadosView />}
              {(activeModuleId === 'flujo-efectivo' || activeModuleId === 'estado-flujo-efectivo') && <FlujoEfectivoView />}
              {activeModuleId === 'analisis-cuentas' && <AnalisisCuentasView />}

              {/* Estudio */}
              {activeModuleId === 'cartera-empresas' && (
                <MisEmpresasNivel1View
                  empresas={empresasLista}
                  onAddEmpresa={handleAddEmpresa}
                  onCrearEmpresa={conectado ? () => setIsNuevaEmpresaOpen(true) : undefined}
                />
              )}
              {(activeModuleId === 'indicadores-estudio' || activeModuleId === 'tablero-vencimientos-estudio') && (
                <DashboardView
                  compras={compras}
                  ventas={ventas}
                  asientos={asientos}
                  liquidacion={liquidacion}
                  empresa={empresaActual}
                  onNavigate={(mod) => handleTopBarAction(`Estudio › ${mod}`, mod)}
                  onTriggerSync={() => success('Sincronización SIRE ejecutada')}
                  onDownloadSireTxt={() => success('Descargando archivo SIRE TXT')}
                  onDownloadSqlDump={() => success('Generando respaldo SQL')}
                />
              )}
              {(activeModuleId === 'control-calidad' || activeModuleId === 'control-calidad-estudio') && <ControlCalidadEstudioView />}
              {activeModuleId === 'biblioteca-plantillas' && <BibliotecaPlantillasView />}

              {/* Herramientas — Tablas maestras separadas */}
              {(activeModuleId === 'tbl-clientes-prov' || activeModuleId === 'maestro-clientes-proveedores') && <ClientesProveedoresView />}
              {(activeModuleId === 'tbl-tipos-cp' || activeModuleId === 'maestro-tipos-comprobante') && <TiposComprobanteView />}
              {(activeModuleId === 'tbl-tipo-cambio' || activeModuleId === 'maestro-tipo-cambio') && <TipoCambioView />}
              {(activeModuleId === 'tbl-bancos' || activeModuleId === 'maestro-bancos') && <BancosView />}
              {(activeModuleId === 'tbl-unidades-medida' || activeModuleId === 'maestro-unidades-medida') && <UnidadesMedidaView />}
              {(activeModuleId === 'usuarios-permisos' || activeModuleId === 'usuarios-roles') && <UsuariosPermisosView />}
              {(activeModuleId === 'estado-conexion-sunat' || activeModuleId === 'conexion-sunat') && <SunatSyncView empresa={empresaActual} />}
              {activeModuleId === 'auditoria-sistema' && (
                <MapaAuditoriaSistemaView empresa={empresaActual} />
              )}

              {/* Ayuda */}
              {(activeModuleId === 'guia-rapida' || activeModuleId === 'guia-rapida-atajos') && <GuiaRapidaAtajosView />}
            </div>
          </div>
        ) : (
          /* Área de Trabajo de Escritorio sin barra lateral */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none overflow-auto">
            <div className="max-w-2xl bg-[#FFFFFF] border border-[#D1D5DB] p-6">
              <div className="w-9 h-9 bg-[#E8ECF1] border border-[#D1D5DB] text-[#1E3A5F] mx-auto flex items-center justify-center mb-2.5">
                <FolderTree className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <h1 className="text-[14px] font-bold text-[#111827]">
                Atlob Consultores ERP — Área de Trabajo Contable y Tributaria
              </h1>
              <p className="mt-1 text-[12px] text-[#4B5563]">
                Seleccione un módulo desde la barra de menú superior o presione{' '}
                <kbd className="px-1 py-0.5 font-mono text-[11px] bg-[#E8ECF1] border border-[#D1D5DB]">
                  Ctrl+Shift+P
                </kbd>{' '}
                para buscar cualquier opción.
              </p>

              <div className="mt-4 grid grid-cols-4 gap-2 text-left">
                <button
                  type="button"
                  onClick={() => handleTopBarAction('Contabilidad › Asientos', 'asientos')}
                  className="p-2 bg-[#F5F7FA] hover:bg-[#E8ECF1] border border-[#D1D5DB] text-[12px]"
                >
                  <div className="font-bold text-[#1E3A5F]">Asientos [F2]</div>
                  <div className="text-[11px] text-[#4B5563]">Partida doble PCGE</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleTopBarAction('Compras y Ventas › Registro de compras', 'reg-compras')}
                  className="p-2 bg-[#F5F7FA] hover:bg-[#E8ECF1] border border-[#D1D5DB] text-[12px]"
                >
                  <div className="font-bold text-[#1E3A5F]">Reg. Compras</div>
                  <div className="text-[11px] text-[#4B5563]">Formato 8.1 / RCE</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleTopBarAction('Compras y Ventas › Registro de ventas', 'reg-ventas')}
                  className="p-2 bg-[#F5F7FA] hover:bg-[#E8ECF1] border border-[#D1D5DB] text-[12px]"
                >
                  <div className="font-bold text-[#1E3A5F]">Reg. Ventas</div>
                  <div className="text-[11px] text-[#4B5563]">Formato 14.1 / RVIE</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleTopBarAction('Facturación › Emitir factura o boleta', 'emitir-cp')}
                  className="p-2 bg-[#F5F7FA] hover:bg-[#E8ECF1] border border-[#D1D5DB] text-[12px]"
                >
                  <div className="font-bold text-[#1E3A5F]">Facturación [F3]</div>
                  <div className="text-[11px] text-[#4B5563]">Emisor UBL 2.1</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleTopBarAction('Tributos › Declaración mensual IGV-Renta', 'declaracion-igv-renta')}
                  className="p-2 bg-[#F5F7FA] hover:bg-[#E8ECF1] border border-[#D1D5DB] text-[12px]"
                >
                  <div className="font-bold text-[#1E3A5F]">IGV - Renta (621)</div>
                  <div className="text-[11px] text-[#4B5563]">Determinación mensual</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleTopBarAction('Registros Electrónicos › SIRE › Conciliador SIRE vs registro', 'sire-conciliador')}
                  className="p-2 bg-[#F5F7FA] hover:bg-[#E8ECF1] border border-[#D1D5DB] text-[12px]"
                >
                  <div className="font-bold text-[#1E3A5F]">Conciliador SIRE [F4]</div>
                  <div className="text-[11px] text-[#4B5563]">Cruce CAR y clave</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleTopBarAction('Estados Financieros › Hoja de trabajo (10 columnas)', 'hoja-trabajo')}
                  className="p-2 bg-[#F5F7FA] hover:bg-[#E8ECF1] border border-[#D1D5DB] text-[12px]"
                >
                  <div className="font-bold text-[#1E3A5F]">Hoja de Trabajo</div>
                  <div className="text-[11px] text-[#4B5563]">Balance 10 columnas</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleTopBarAction('Contabilidad › Plan de cuentas', 'plan-cuentas')}
                  className="p-2 bg-[#F5F7FA] hover:bg-[#E8ECF1] border border-[#D1D5DB] text-[12px]"
                >
                  <div className="font-bold text-[#1E3A5F]">Plan Contable</div>
                  <div className="text-[11px] text-[#4B5563]">PCGE 2019 Modificado</div>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 3. BARRA DE ESTADO INFERIOR RESPONSIVE */}
      <footer className="w-full flex-shrink-0 flex items-center justify-between px-2.5 h-6 text-[11px] bg-[#E8ECF1] border-t border-[#D1D5DB] select-none text-[#111827] overflow-hidden whitespace-nowrap">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <span className="font-mono shrink-0">
            <strong>RUC:</strong> {empresaActual.ruc}
          </span>
          <span className="text-[#9CA3AF] shrink-0">|</span>
          <button
            type="button"
            onClick={() => handleTopBarAction('Tributos › Cronograma de vencimientos', 'cronograma-vencimientos')}
            className={`font-mono font-bold hover:underline shrink-0 ${
              alertaVencimiento.esVencido
                ? 'text-[#DC2626] bg-[#FEF2F2] border border-[#FCA5A5] px-1.5 py-0.2 rounded'
                : 'text-[#B45309]'
            }`}
            title={`Vencimiento tributario PDT 621 para RUC terminado en dígito ${alertaVencimiento.digito} (Período ${periodo})`}
          >
            Venc. PDT 621 [Díg. {alertaVencimiento.digito}]: {alertaVencimiento.fechaVencimiento} ({alertaVencimiento.etiquetaDias})
          </button>
          <span className="text-[#9CA3AF] shrink-0">|</span>
          <button
            type="button"
            onClick={() => setIsModalTcGlobalOpen(true)}
            className="font-mono hover:underline cursor-pointer shrink-0"
            title={
              tipoCambioGlobal
                ? `Tipo de cambio fecha ${tipoCambioGlobal.fecha} (Fuente: ${tipoCambioGlobal.fuente}). Clic para actualizar.`
                : 'Sin tipo de cambio cargado para la fecha. Clic para ingresar.'
            }
          >
            {tipoCambioGlobal ? (
              <span>
                <strong>TC ({tipoCambioGlobal.fecha.slice(5)}):</strong> C: {tipoCambioGlobal.compra.toFixed(3)} / V: {tipoCambioGlobal.venta.toFixed(3)}
              </span>
            ) : (
              <span className="text-[#D97706] font-bold bg-[#FEF3C7] border border-[#FCD34D] px-1 py-0.2 rounded">
                TC: Sin tipo de cambio
              </span>
            )}
          </button>
          <span className="text-[#9CA3AF] shrink-0">|</span>
          <span className="shrink-0 truncate max-w-[220px]" title={`Usuario en sesión: ${usuarioNombreVisible} (${rolActual})`}>
            <strong>Usuario:</strong> {usuarioNombreVisible} <span className="text-[#4B5563]">({rolActual})</span>
          </span>
          <span className="text-[#9CA3AF] shrink-0 hidden md:inline">|</span>
          <span className="text-[#1E6F42] font-bold shrink-0 hidden md:inline">
            ● En línea · Base aislada
          </span>
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span className="text-[#4B5563] truncate max-w-[150px] lg:max-w-[260px]" title={`Acción: ${ultimaAccion}`}>
            Acción: <strong className="text-[#111827]">{ultimaAccion}</strong>
          </span>
          <span className="text-[#9CA3AF] hidden xl:inline">|</span>
          <span className="text-[#4B5563] hidden xl:inline">
            ATLOB ERP · Desarrollado por Jimmy Mayta
          </span>
        </div>
      </footer>

      <ModalTipoCambioManual
        isOpen={isModalTcGlobalOpen}
        onClose={() => setIsModalTcGlobalOpen(false)}
        onGuardado={(tc) => setTipoCambioGlobal(tc)}
      />

      {/* PALETA DE COMANDOS [Ctrl+Shift+P] */}
      <VentanaModal
        abierto={isCommandPaletteOpen}
        onCerrar={() => setIsCommandPaletteOpen(false)}
        titulo="Paleta de Comandos — Atlob Consultores ERP [Ctrl+Shift+P]"
        ancho="lg"
      >
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#4B5563] absolute left-2.5 top-2" strokeWidth={1.5} />
            <input
              type="text"
              autoFocus
              value={commandQuery}
              onChange={(e) => setCommandQuery(e.target.value)}
              placeholder="Escriba el nombre del módulo, libro, reporte o atajo (ej. SIRE, Compras, DAOT, F2)..."
              className="w-full h-7 pl-8 pr-2 text-[12px] bg-[#FFFFFF] border border-[#1E3A5F] focus:outline-none"
            />
          </div>

          <div className="max-h-72 overflow-y-auto border border-[#D1D5DB] divide-y divide-[#E5E7EB]">
            {comandosFiltrados.map((entry) => {
              const esProx = entry.estado === 'proximamente';
              const permitido = tienePermisoMenu(entry, rolActual);
              const deshabilitado = esProx || !permitido;
              return (
                <button
                  key={entry.id}
                  type="button"
                  disabled={deshabilitado}
                  onClick={() => {
                    if (!deshabilitado) {
                      setIsCommandPaletteOpen(false);
                      handleTopBarAction(entry.rutaCompleta, entry.id);
                    }
                  }}
                  className={`w-full px-3 py-1.5 text-left text-[12px] flex items-center justify-between ${
                    deshabilitado
                      ? 'bg-[#F5F7FA] text-[#9CA3AF] cursor-not-allowed'
                      : 'bg-[#FFFFFF] text-[#111827] hover:bg-[#E8ECF1]'
                  }`}
                >
                  <div>
                    <span className="text-[11px] text-[#4B5563] mr-1.5">[{entry.grupoLabel}]</span>
                    <span className={deshabilitado ? '' : 'font-bold text-[#1E3A5F]'}>{entry.rutaCompleta}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {esProx && (
                      <span className="text-[10px] px-1.5 py-0.2 bg-[#FFFFFF] border border-[#D1D5DB] text-[#9CA3AF]">
                        próximamente
                      </span>
                    )}
                    {entry.shortcut && (
                      <kbd className="font-mono text-[11px] px-1.5 py-0.2 bg-[#F5F7FA] border border-[#D1D5DB]">
                        {entry.shortcut}
                      </kbd>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </VentanaModal>

      {/* MODALES DISPARADOS DESDE LA BARRA SUPERIOR */}
      <CalculadoraContableModal
        isOpen={isCalculadoraOpen}
        onClose={() => setIsCalculadoraOpen(false)}
      />

      <AcercaDeModal
        isOpen={isAcercaDeOpen}
        onClose={() => setIsAcercaDeOpen(false)}
      />

      {isSearchModalOpen && (
        <SearchEmpresasModal
          isOpen={isSearchModalOpen}
          empresas={empresasLista}
          onClose={() => setIsSearchModalOpen(false)}
        />
      )}

      {isConfigEmpresaOpen && empresaActual && (
        <ConfigEmpresaModal
          isOpen={isConfigEmpresaOpen}
          empresa={empresaActual}
          onClose={() => setIsConfigEmpresaOpen(false)}
          onSave={(empActualizada: Partial<EmpresaCliente>) => {
            setEmpresasLista(
              empresasLista.map((e) => (e.id === empresaActual.id ? { ...e, ...empActualizada } : e))
            );
            setIsConfigEmpresaOpen(false);
            success('Datos de la empresa actualizados con éxito.');
          }}
        />
      )}

      {isImportarCsvOpen && (
        <ModalImportacionCsv
          isOpen={isImportarCsvOpen}
          onClose={() => setIsImportarCsvOpen(false)}
          onImportExitoso={() => {
            setIsImportarCsvOpen(false);
            success('Importación CSV procesada con éxito.');
          }}
        />
      )}

      {isBackupOpen && (
        <ModalBackupEmpresa
          isOpen={isBackupOpen}
          onClose={() => setIsBackupOpen(false)}
        />
      )}

      {isNuevaEmpresaOpen && (
        <ModalNuevaEmpresaBlanco
          isOpen={isNuevaEmpresaOpen}
          onClose={() => setIsNuevaEmpresaOpen(false)}
          onEmpresaCreada={(nueva: any) => {
            const emp: EmpresaCliente = {
              id: nueva.id,
              codigoEmpresa: nueva.codigoEmpresa || 'EMP',
              ruc: nueva.ruc,
              razonSocial: nueva.razonSocial,
              nombreComercial: nueva.nombreComercial || nueva.razonSocial,
              direccionFiscal: nueva.domicilioFiscal || 'LIMA, PERÚ',
              contactoNombre: nueva.contactoNombre || 'Gerencia',
              contactoTelefono: nueva.contactoTelefono || '',
              contactoEmail: nueva.contactoEmail || '',
              regimenTributario: nueva.regimenTributario || 'MYPE_TRIBUTARIO',
              metodoInventario: nueva.metodoInventario,
              tasaRentaMensual: 0.01,
              ambienteSunat: 'PRODUCCION',
              ultimoDigitoRuc: String(nueva.ruc).slice(-1),
              vencimientoPdt621: '2026-10-23',
              vencimientoSire: '2026-10-23',
              vencimientoPlame: '2026-10-23',
              estadoDeclaracion: 'POR_VENCER',
              preliquidacionNotificada: false,
              montoPreliquidacionIgv: 0,
              montoPreliquidacionRenta: 0,
              trabajadoresPlanilla: 1,
            };
            void handleAddEmpresa(emp).catch(() => info('Empresa guardada. Vuelve a abrir la cartera para actualizarla.'));
          }}
        />
      )}

      {isPdfExportOpen && (
        <PdfExportModal
          isOpen={isPdfExportOpen}
          onClose={() => setIsPdfExportOpen(false)}
          empresa={empresaActual}
          periodo={periodo}
          tipoReporteInicial="COMPRAS"
          compras={compras}
          ventas={ventas}
          asientos={asientos}
          honorarios={dataState.honorarios}
        />
      )}
    </div>
  );
}

function AplicacionConSesion() {
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState<'cargando' | 'setup' | 'login' | 'error'>('cargando');
  const [intento, setIntento] = useState(0);
  const [estudio, setEstudio] = useState('ATLOB ERP');
  const [sesion, setSesion] = useState<{ usuario: UsuarioEstudio; empresas: EmpresaCliente[] } | null>(null);

  useEffect(() => {
    let vigente = true;
    const expirar = () => { queryClient.clear(); setSesion(null); setEstado('login'); };
    window.addEventListener('atlob_session_expired', expirar);
    void (async () => {
      try {
        const setup = await authApi.estadoSetup();
        if (!vigente) return;
        const nombre = setup.estudio?.nombreEstudio || 'ATLOB ERP';
        setEstudio(nombre);
        if (!setup.configurado) { setEstado('setup'); return; }
        if (obtenerAccessToken()) {
          const perfil = await authApi.perfil();
          const empresas = await empresasApi.listar();
          if (vigente) setSesion({ usuario: { ...perfil.usuario, estudioNombre: nombre }, empresas });
        }
        if (vigente) setEstado('login');
      } catch (error: any) {
        if (vigente) setEstado(error.response?.status === 401 ? 'login' : 'error');
      }
    })();
    return () => { vigente = false; window.removeEventListener('atlob_session_expired', expirar); };
  }, [intento, queryClient]);

  // Cierre de sesión automático tras 30 minutos de inactividad (Fase 4.3)
  useEffect(() => {
    if (!sesion) return;
    const INACTIVIDAD_MAX_MS = 30 * 60 * 1000;
    let timer: any;

    const reiniciarTemporizador = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('atlob_session_expired', { detail: { razon: 'INACTIVIDAD' } }));
      }, INACTIVIDAD_MAX_MS);
    };

    const eventos = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    eventos.forEach((ev) => window.addEventListener(ev, reiniciarTemporizador, { passive: true }));
    reiniciarTemporizador();

    return () => {
      clearTimeout(timer);
      eventos.forEach((ev) => window.removeEventListener(ev, reiniciarTemporizador));
    };
  }, [sesion]);

  const abrirSesion = async (resultado: Sesion) => {
    guardarSesion(resultado);
    try {
      const empresas = await empresasApi.listar();
      setSesion({ usuario: { ...resultado.usuario, estudioNombre: resultado.estudio?.nombreEstudio || estudio }, empresas });
    } catch (error) {
      limpiarSesion();
      throw error;
    }
  };

  if (sesion) return (
    <EmpresaPeriodoProvider initialEmpresas={sesion.empresas} usuario={sesion.usuario} onCerrarSesion={async () => {
      try { await authApi.logout(); } finally { limpiarSesion(); }
    }}>
      <DesktopWorkspaceContent empresasIniciales={sesion.empresas} conectado />
    </EmpresaPeriodoProvider>
  );
  if (estado === 'setup') return <AsistenteSetupInicial onSetupCompletado={abrirSesion} />;
  if (estado === 'login') return <LoginView onAutenticado={abrirSesion} nombreEstudio={estudio} version="2026.1" />;
  return (
    <main className="min-h-screen bg-[#F0F4F8] flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="bg-white rounded-2xl p-8 border border-[#CBD5E1] shadow-lg max-w-sm w-full flex flex-col items-center">
        <img src={atlobLogo} alt="ATLOB ERP" className="h-10 w-auto object-contain mb-4" width={180} height={67} />
        {estado === 'cargando' ? (
          <>
            <div className="w-6 h-6 border-2 border-[#01172C] border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-xs font-semibold text-[#475569]" role="status">Iniciando servicios del estudio…</p>
          </>
        ) : (
          <>
            <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-3" role="alert">
              No se pudo conectar con el servidor local de ATLOB ERP. Verifique que PostgreSQL esté activo.
            </p>
            <button
              type="button"
              onClick={() => { setEstado('cargando'); setIntento(i => i + 1); }}
              className="px-4 py-2 bg-[#01172C] text-white font-bold text-xs rounded-xl hover:bg-[#082845] transition cursor-pointer"
            >
              Reintentar conexión
            </button>
          </>
        )}
      </div>
    </main>
  );
}

export default function App() {
  if (import.meta.env.PROD) return <AplicacionConSesion />;
  const usuarioInicial = {
    id: 'usr-admin-01',
    email: 'jimmymayta29@gmail.com',
    nombre: 'Jimmy Mayta',
    rolGlobal: 'ADMIN_ESTUDIO',
    estudioNombre: 'Atlob Consultores',
  };

  return (
    <EmpresaPeriodoProvider
      initialEmpresas={EMPRESAS_CLIENTES_DEMO}
      usuario={usuarioInicial}
      onCerrarSesion={async () => {}}
    >
      <DesktopWorkspaceContent empresasIniciales={EMPRESAS_CLIENTES_DEMO} />
    </EmpresaPeriodoProvider>
  );
}
