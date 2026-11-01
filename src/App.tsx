/**
 * Atlob Consultores ERP - Sistema de Gestión Contable y Tributaria
 * Desarrollado por Jimmy Mayta
 */

import React, { useState, useMemo, useCallback } from 'react';
import { X, ArrowLeft, RefreshCw, FolderTree, FileText } from 'lucide-react';
import { EmpresaCliente, AsientoContable, Comprobante } from './types';
import { EMPRESAS_CLIENTES_DEMO, crearDatosInicialesEmpresa } from './data/empresasClientes';
import { calcularLiquidacionPDT621 } from './services/accountingEngine';

// TopBar & Desktop Navigation
import { TopBar } from './components/desktop/TopBar';

// Contexts
import { EmpresaPeriodoProvider, useEmpresaPeriodo } from './context/EmpresaPeriodoContext';
import { useToast } from './context/ToastContext';
import { useReportStyle } from './context/ReportStyleContext';

// Existing Views
import { VouchersView } from './components/views/VouchersView';
import { RegistroComprasView } from './components/views/RegistroComprasView';
import { RegistroVentasView } from './components/views/RegistroVentasView';
import { LibroDiarioView } from './components/views/LibroDiarioView';
import { LibroMayorView } from './components/views/LibroMayorView';
import { CajaBancosView } from './components/views/CajaBancosView';
import { HojaTrabajo10ColumnasView } from './components/views/HojaTrabajo10ColumnasView';
import { ReportesFinancierosView } from './components/views/ReportesFinancierosView';
import { SireConciliadorView } from './components/views/SireConciliadorView';
import { LiquidacionTributariaView } from './components/views/LiquidacionTributariaView';
import { PlanillaPlameView } from './components/views/PlanillaPlameView';
import { ProcesosCierreView } from './components/views/ProcesosCierreView';
import { CarteraSaldosView } from './components/views/CarteraSaldosView';
import { MaestrosView } from './components/views/MaestrosView';
import { MisEmpresasNivel1View } from './components/views/MisEmpresasNivel1View';
import { DashboardView } from './components/views/DashboardView';
import { PeriodosView } from './components/views/PeriodosView';
import { UsuariosPermisosView } from './components/views/UsuariosPermisosView';
import { MapaAuditoriaSistemaView } from './components/views/MapaAuditoriaSistemaView';

// New Views
import { FacturacionElectronicaView } from './components/views/FacturacionElectronicaView';
import { CajaChicaView } from './components/views/CajaChicaView';
import { TesoreriaAvanzadaView } from './components/views/TesoreriaAvanzadaView';
import { GestionNegocioView } from './components/views/GestionNegocioView';
import { ReportesSunatEspecialesView } from './components/views/ReportesSunatEspecialesView';

// Modals
import { CalculadoraContableModal } from './components/modals/CalculadoraContableModal';
import { AcercaDeModal } from './components/modals/AcercaDeModal';
import { SearchEmpresasModal } from './components/modals/SearchEmpresasModal';
import { ConfigEmpresaModal } from './components/modals/ConfigEmpresaModal';
import { ModalImportacionCsv } from './components/modals/ModalImportacionCsv';
import { ModalBackupEmpresa } from './components/modals/ModalBackupEmpresa';
import { ModalNuevaEmpresaBlanco } from './components/modals/ModalNuevaEmpresaBlanco';
import { PdfExportModal } from './components/modals/PdfExportModal';

function DesktopWorkspaceContent() {
  const { 
    empresaActiva, 
    periodo, 
    entrarAEmpresa, 
    isPeriodoCerrado, 
    setIsSearchModalOpen,
    isSearchModalOpen
  } = useEmpresaPeriodo();

  const { success, info } = useToast();
  const { setReportStyle } = useReportStyle();

  const [empresasLista, setEmpresasLista] = useState<EmpresaCliente[]>(EMPRESAS_CLIENTES_DEMO);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [activeModuleTitle, setActiveModuleTitle] = useState<string>('');
  const [ultimaAccion, setUltimaAccion] = useState<string>('—');
  const [perfil, setPerfil] = useState<string>('Jimmy Mayta (Administrador principal)');

  // Modales
  const [isCalculadoraOpen, setIsCalculadoraOpen] = useState(false);
  const [isAcercaDeOpen, setIsAcercaDeOpen] = useState(false);
  const [isConfigEmpresaOpen, setIsConfigEmpresaOpen] = useState(false);
  const [isImportarCsvOpen, setIsImportarCsvOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isNuevaEmpresaOpen, setIsNuevaEmpresaOpen] = useState(false);
  const [isPdfExportOpen, setIsPdfExportOpen] = useState(false);

  // Datos contables de la empresa activa
  const empresaActual = empresaActiva || EMPRESAS_CLIENTES_DEMO[0];
  const empresaId = empresaActual.id;
  const dataState = useMemo(
    () => crearDatosInicialesEmpresa(empresaId, empresaActual.ruc, empresaActual.razonSocial),
    [empresaId, empresaActual.ruc, empresaActual.razonSocial]
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

  // Manejador central de acciones de la barra superior
  const handleTopBarAction = useCallback((ruta: string, itemId?: string) => {
    setUltimaAccion(ruta);

    if (!itemId) {
      return;
    }

    // 1. Modales y utilidades directas
    if (itemId === 'calculadora') {
      setIsCalculadoraOpen(true);
      return;
    }
    if (itemId === 'imprimir') {
      setIsPdfExportOpen(true);
      return;
    }
    if (itemId === 'buscar-empresa' || itemId === 'cambiar-empresa') {
      setIsSearchModalOpen(true);
      return;
    }
    if (itemId === 'configurar-empresa') {
      setIsConfigEmpresaOpen(true);
      return;
    }
    if (itemId === 'importar-csv') {
      setIsImportarCsvOpen(true);
      return;
    }
    if (itemId === 'respaldos') {
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
    if (itemId === 'formato-estandar') {
      setReportStyle('estandar');
      success('Formato de reporte establecido en Estándar (monocromo SISCONT).', 'Formato de Reportes');
      return;
    }
    if (itemId === 'formato-corporativo') {
      setReportStyle('actual');
      success('Formato de reporte establecido en Corporativo a color.', 'Formato de Reportes');
      return;
    }
    if (itemId === 'restaurar-demo') {
      setCompras(dataState.compras);
      setVentas(dataState.ventas);
      setAsientos(dataState.asientos);
      success('Datos de prueba y saldos restablecidos al estado inicial.', 'Restauración Demo');
      return;
    }

    // 2. Módulos que se abren en el área de trabajo
    setActiveModuleId(itemId);
    setActiveModuleTitle(ruta);
  }, [dataState, setIsSearchModalOpen, setReportStyle, success]);

  const handleCerrarModulo = () => {
    setActiveModuleId(null);
    setUltimaAccion('Área de trabajo (módulo cerrado)');
  };

  const handleAddEmpresa = (nueva: EmpresaCliente) => {
    setEmpresasLista([nueva, ...empresasLista]);
    entrarAEmpresa(nueva);
    setIsNuevaEmpresaOpen(false);
    success(`Empresa ${nueva.razonSocial} registrada y seleccionada como activa.`, 'Empresa Registrada');
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white dark:bg-[#0B1220] font-['Segoe_UI',system-ui,Arial,sans-serif]">
      {/* 1. BARRA SUPERIOR COMPLETA (Título, Menú en Cascada y Barra de Herramientas) */}
      <TopBar
        onAction={handleTopBarAction}
        empresaNombre={empresaActual.codigoEmpresa || 'CA 2020'}
        periodoNombre={periodo === '2026-09' ? 'SETIEMBRE 2026' : 'ENERO 2026'}
        perfilSeleccionado={perfil}
        onCambiarPerfil={(nuevo) => {
          setPerfil(nuevo);
          setUltimaAccion(`Perfil cambiado a: ${nuevo}`);
        }}
      />

      {/* 2. ÁREA DE TRABAJO PRINCIPAL */}
      <main className="flex-1 flex flex-col bg-[#0F172A] overflow-hidden relative">
        {activeModuleId ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-[#0F172A]">
            {/* Cabecera del Módulo en el Área de Trabajo */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-white dark:bg-[#1E293B] border-b border-[#CBD5E1] dark:border-[#334155] text-xs">
              <div className="flex items-center space-x-2 text-[#0F172A] dark:text-[#E2E8F0]">
                <span className="font-semibold">{activeModuleTitle}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500 font-mono">
                  {empresaActual.razonSocial}
                </span>
              </div>

              <button
                type="button"
                onClick={handleCerrarModulo}
                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition-colors font-medium text-[11.5px]"
                title="Cerrar módulo y volver al área de trabajo"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cerrar módulo</span>
              </button>
            </div>

            {/* Contenedor del Módulo con Scroll Independiente */}
            <div className="flex-1 overflow-auto p-4">
              {/* Contabilidad */}
              {activeModuleId === 'asientos' && (
                <VouchersView
                  empresaId={empresaId}
                  periodo={periodo}
                  isPeriodoCerrado={isPeriodoCerrado}
                />
              )}

              {activeModuleId === 'reg-compras' && (
                <RegistroComprasView
                  compras={compras}
                  empresa={empresaActual}
                  periodo={periodo}
                  onGenerarAsientos={() => success('Asientos de compras centralizados en el Libro Diario.')}
                />
              )}

              {activeModuleId === 'reg-ventas' && (
                <RegistroVentasView
                  ventas={ventas}
                  empresa={empresaActual}
                  periodo={periodo}
                />
              )}

              {activeModuleId === 'libro-diario' && (
                <LibroDiarioView
                  asientos={asientos}
                  empresa={empresaActual}
                  periodo={periodo}
                  onGenerarAsientosMasivos={() => success('Asientos contables masivos actualizados.')}
                />
              )}

              {(activeModuleId === 'libro-mayor' || activeModuleId === 'analisis-cuenta') && (
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

              {(activeModuleId === 'pcge' || 
                activeModuleId === 'centro-costos' || 
                activeModuleId === 'tbl-clientes-prov' || 
                activeModuleId === 'tbl-tipos-cp' || 
                activeModuleId === 'tbl-tipo-cambio' || 
                activeModuleId === 'tbl-bancos' || 
                activeModuleId === 'tbl-unidades-medida') && (
                <MaestrosView />
              )}

              {(activeModuleId === 'dif-cambio' || 
                activeModuleId === 'depreciacion' || 
                activeModuleId === 'cierre-mensual' || 
                activeModuleId === 'cierre-anual' || 
                activeModuleId === 'ajustes-cierre') && (
                <ProcesosCierreView
                  asientos={asientos}
                  compras={compras}
                  empresa={empresaActual}
                  periodo={periodo}
                  onGenerarDestinos={() => success('Asientos de destino Elemento 9 generados')}
                  onGenerarAjusteTc={() => success('Ajuste por diferencia de cambio generado')}
                />
              )}

              {/* Informes Contables */}
              {activeModuleId === 'bal-comprobacion' && (
                <HojaTrabajo10ColumnasView
                  asientos={asientos}
                  empresa={empresaActual}
                  periodo={periodo}
                />
              )}

              {(activeModuleId === 'bal-general' || 
                activeModuleId === 'est-resultados' || 
                activeModuleId === 'flujo-efectivo') && (
                <ReportesFinancierosView
                  asientos={asientos}
                  empresa={empresaActual}
                  periodo={periodo}
                />
              )}

              {/* Reportes SUNAT */}
              {(activeModuleId === 'pdb-renta-anual' || 
                activeModuleId === 'pdb-igv-renta' || 
                activeModuleId === 'daot-generar' || 
                activeModuleId === 'daot-validar' || 
                activeModuleId === 'libros-electronicos' || 
                activeModuleId === 'txt-valida-compras' || 
                activeModuleId === 'rep-diario' || 
                activeModuleId === 'rep-mayor' || 
                activeModuleId === 'rep-compras' || 
                activeModuleId === 'rep-ventas' || 
                activeModuleId === 'rep-caja-bancos' || 
                activeModuleId === 'rep-inv-balances') && (
                <ReportesSunatEspecialesView />
              )}

              {(activeModuleId === 'pdt-621' || activeModuleId === 'pdt-617') && (
                <LiquidacionTributariaView
                  liquidacion={liquidacion}
                  empresa={empresaActual}
                  compras={compras}
                  ventas={ventas}
                  onUpdateSaldoAnterior={(nuevo) => setSaldoAnteriorIgv(nuevo)}
                />
              )}

              {activeModuleId === 'pdt-601' && (
                <PlanillaPlameView
                  empresaId={empresaId}
                  periodo={periodo}
                  trabajadores={dataState.trabajadoresPlanilla}
                />
              )}

              {/* SIRE SUNAT + */}
              {(activeModuleId === 'sire-prop-compras' || 
                activeModuleId === 'sire-prop-ventas' || 
                activeModuleId === 'sire-conciliador' || 
                activeModuleId === 'sire-txt-ajustes') && (
                <SireConciliadorView
                  compras={compras}
                  empresa={empresaActual}
                  periodo={periodo}
                />
              )}

              {/* Facturación */}
              {(activeModuleId === 'emitir-cp' || 
                activeModuleId === 'notas-cd' || 
                activeModuleId === 'guias-remision' || 
                activeModuleId === 'comunicacion-baja' || 
                activeModuleId === 'lector-xml-cdr' || 
                activeModuleId === 'consulta-cp') && (
                <FacturacionElectronicaView />
              )}

              {/* Créditos y Cobranza */}
              {(activeModuleId === 'cxc' || 
                activeModuleId === 'cxp' || 
                activeModuleId === 'letras-pagares' || 
                activeModuleId === 'vencimientos-sunat') && (
                <CarteraSaldosView empresaId={empresaId} />
              )}

              {/* Tesorería */}
              {(activeModuleId === 'conciliacion-bancaria' || 
                activeModuleId === 'mov-bancarios' || 
                activeModuleId === 'flujo-caja-proyectado') && (
                <TesoreriaAvanzadaView />
              )}

              {/* Caja Chica */}
              {(activeModuleId === 'caja-apertura-cierre' || 
                activeModuleId === 'caja-gastos' || 
                activeModuleId === 'caja-reposicion') && (
                <CajaChicaView />
              )}

              {/* Gestión de Negocio */}
              {activeModuleId === 'cartera-empresas' && (
                <MisEmpresasNivel1View
                  empresas={empresasLista}
                  onAddEmpresa={handleAddEmpresa}
                />
              )}

              {activeModuleId === 'dashboard-gerencial' && (
                <DashboardView
                  compras={compras}
                  ventas={ventas}
                  asientos={asientos}
                  liquidacion={liquidacion}
                  empresa={empresaActual}
                  onNavigate={(mod) => handleTopBarAction(`Navegación › ${mod}`, mod)}
                  onTriggerSync={() => success('Sincronización SIRE ejecutada')}
                  onDownloadSireTxt={() => success('Descargando archivo SIRE TXT')}
                  onDownloadSqlDump={() => success('Generando respaldo SQL')}
                />
              )}

              {(activeModuleId === 'control-calidad' || activeModuleId === 'biblioteca-docs') && (
                <GestionNegocioView />
              )}

              {/* Empresa */}
              {activeModuleId === 'cambiar-periodo' && (
                <PeriodosView empresaId={empresaId} />
              )}

              {/* Utilitarios */}
              {activeModuleId === 'usuarios-roles' && (
                <UsuariosPermisosView />
              )}

              {activeModuleId === 'auditoria-sistema' && (
                <MapaAuditoriaSistemaView empresa={empresaActual} />
              )}
            </div>
          </div>
        ) : (
          /* Pantalla Clásica de Área de Trabajo Vacía */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none overflow-auto">
            <div className="max-w-xl">
              <div className="w-12 h-12 rounded bg-blue-600/20 text-blue-400 mx-auto flex items-center justify-center mb-3">
                <FolderTree className="w-6 h-6" />
              </div>
              <h1 className="text-xl md:text-2xl font-semibold text-[#E2E8F0] tracking-tight">
                Área de trabajo
              </h1>
              <p className="mt-2 text-sm text-[#94A3B8] leading-relaxed">
                Elige una opción del menú superior. Los módulos se abren aquí, sin barra lateral.
              </p>

              {/* Accesos rápidos de cortesía para flujo operativo */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => handleTopBarAction('Contabilidad › Registro de asientos', 'asientos')}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-colors"
                >
                  Asientos [F2]
                </button>
                <button
                  onClick={() => handleTopBarAction('Facturación › Emitir factura / boleta', 'emitir-cp')}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-colors"
                >
                  Facturación [F3]
                </button>
                <button
                  onClick={() => handleTopBarAction('Contabilidad › Registro de compras', 'reg-compras')}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-colors"
                >
                  Compras
                </button>
                <button
                  onClick={() => handleTopBarAction('Contabilidad › Registro de ventas', 'reg-ventas')}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-colors"
                >
                  Ventas
                </button>
                <button
                  onClick={() => handleTopBarAction('SIRE SUNAT + › Conciliador SIRE vs registro', 'sire-conciliador')}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-colors"
                >
                  Conciliador SIRE
                </button>
                <button
                  onClick={() => handleTopBarAction('Caja Chica › Registro de gastos', 'caja-gastos')}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-colors"
                >
                  Caja Chica
                </button>
                <button
                  onClick={() => handleTopBarAction('Tesorería › Conciliación bancaria', 'conciliacion-bancaria')}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-colors"
                >
                  Bancos
                </button>
                <button
                  onClick={() => handleTopBarAction('Informes Contables › Balance de comprobación', 'bal-comprobacion')}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-colors"
                >
                  Hoja de Trabajo
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 3. BARRA DE ESTADO INFERIOR (12px) */}
      <footer className="w-full flex-shrink-0 flex items-center justify-between px-3 py-1 text-[12px] bg-white dark:bg-[#1E293B] border-t border-[#CBD5E1] dark:border-[#334155] select-none text-[#0F172A] dark:text-[#E2E8F0]">
        <div className="truncate flex items-center space-x-2">
          <span className="text-[#64748B] dark:text-[#94A3B8]">Última acción:</span>
          <span className="font-medium text-[#0F172A] dark:text-[#E2E8F0]">
            {ultimaAccion}
          </span>
        </div>

        <div className="flex-shrink-0 text-[#64748B] dark:text-[#94A3B8] ml-4 text-[12px]">
          Atlob Consultores · Desarrollado por Jimmy Mayta
        </div>
      </footer>

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
            setEmpresasLista(empresasLista.map(e => e.id === empresaActual.id ? { ...e, ...empActualizada } : e));
            setIsConfigEmpresaOpen(false);
            success('Configuración de empresa actualizada con éxito.');
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
              id: nueva.id || `emp-${Date.now()}`,
              codigoEmpresa: nueva.codigoEmpresa || 'EMP',
              ruc: nueva.ruc,
              razonSocial: nueva.razonSocial,
              nombreComercial: nueva.nombreComercial || nueva.razonSocial,
              direccionFiscal: nueva.domicilioFiscal || 'LIMA, PERÚ',
              contactoNombre: nueva.contactoNombre || 'Gerencia',
              contactoTelefono: nueva.contactoTelefono || '',
              contactoEmail: nueva.contactoEmail || '',
              regimenTributario: nueva.regimenTributario || 'MYPE_TRIBUTARIO',
              tasaRentaMensual: 0.01,
              usuarioSol: nueva.usuarioSol || '',
              claveSol: nueva.claveSol || '',
              clientIdSire: '',
              clientSecretSire: '',
              ambienteSunat: 'PRODUCCION',
              ultimoDigitoRuc: String(nueva.ruc).slice(-1),
              vencimientoPdt621: '2026-10-23',
              vencimientoSire: '2026-10-23',
              vencimientoPlame: '2026-10-23',
              estadoDeclaracion: 'POR_VENCER',
              preliquidacionNotificada: false,
              montoPreliquidacionIgv: 0,
              montoPreliquidacionRenta: 0,
              trabajadoresPlanilla: 1
            };
            handleAddEmpresa(emp);
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

export default function App() {
  const usuarioInicial = {
    id: 'usr-admin-01',
    email: 'jimmymayta29@gmail.com',
    nombre: 'Jimmy Mayta',
    rolGlobal: 'ADMIN_ESTUDIO',
    estudioNombre: 'Atlob Consultores'
  };

  return (
    <EmpresaPeriodoProvider
      initialEmpresas={EMPRESAS_CLIENTES_DEMO}
      usuario={usuarioInicial}
      onCerrarSesion={async () => {}}
    >
      <DesktopWorkspaceContent />
    </EmpresaPeriodoProvider>
  );
}
