export type EstadoMenuItem = 'activo' | 'proximamente';

export type RolSistema = 'ADMIN_ESTUDIO' | 'ADMINISTRADOR' | 'CONTADOR' | 'ASISTENTE' | 'AUDITOR';

export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  separator?: boolean;
  estado?: EstadoMenuItem;
  vista?: string;
  rolesPermitidos?: RolSistema[];
  children?: MenuItem[];
}

export interface MenuGroup {
  id: string;
  label: string;
  items: MenuItem[];
}

export interface MenuLeafResolved {
  id: string;
  label: string;
  rutaCompleta: string;
  grupoId: string;
  grupoLabel: string;
  shortcut?: string;
  estado: EstadoMenuItem;
  vista: string;
  rolesPermitidos?: RolSistema[];
}

export const MENU_DATA: MenuGroup[] = [
  {
    id: 'archivo',
    label: 'Archivo',
    items: [
      {
        id: 'nueva-empresa',
        label: 'Nueva empresa',
        estado: 'activo',
        vista: 'ModalNuevaEmpresaBlanco',
        rolesPermitidos: ['ADMIN_ESTUDIO', 'ADMINISTRADOR']
      },
      {
        id: 'abrir-empresa',
        label: 'Abrir empresa…',
        shortcut: 'Ctrl+K',
        estado: 'activo',
        vista: 'SearchEmpresasModal'
      },
      {
        id: 'periodo-trabajo',
        label: 'Período de trabajo',
        estado: 'activo',
        vista: 'PeriodosView'
      },
      {
        id: 'datos-empresa',
        label: 'Datos de la empresa',
        estado: 'activo',
        vista: 'ConfigEmpresaModal',
        rolesPermitidos: ['ADMIN_ESTUDIO', 'ADMINISTRADOR', 'CONTADOR']
      },
      { id: 'sep-archivo-1', label: '—', separator: true },
      {
        id: 'importar-csv',
        label: 'Importar datos (CSV)',
        estado: 'activo',
        vista: 'ModalImportacionCsv',
        rolesPermitidos: ['ADMIN_ESTUDIO', 'ADMINISTRADOR', 'CONTADOR', 'ASISTENTE']
      },
      { id: 'sep-archivo-2', label: '—', separator: true },
      {
        id: 'cerrar-sesion',
        label: 'Cerrar sesión',
        estado: 'activo',
        vista: 'AccionCerrarSesion'
      },
      {
        id: 'salir-app',
        label: 'Salir',
        estado: 'activo',
        vista: 'AccionSalirSistema'
      }
    ]
  },
  {
    id: 'contabilidad',
    label: 'Contabilidad',
    items: [
      {
        id: 'asientos',
        label: 'Consulta de asientos',
        shortcut: 'F2',
        estado: 'activo',
        vista: 'VouchersView'
      },
      {
        id: 'subdiarios-registro',
        label: 'Registro por subdiario',
        estado: 'activo',
        vista: 'SubdiariosView'
      },
      {
        id: 'administrar-subdiarios',
        label: 'Administrar subdiarios',
        estado: 'activo',
        vista: 'AdministrarSubdiariosView',
        rolesPermitidos: ['ADMIN_ESTUDIO', 'ADMINISTRADOR']
      },
      {
        id: 'plan-cuentas',
        label: 'Plan de cuentas',
        estado: 'activo',
        vista: 'PlanCuentasView'
      },
      {
        id: 'centros-costo',
        label: 'Centros de costo',
        estado: 'activo',
        vista: 'CentrosCostoView'
      },
      { id: 'sep-contab-1', label: '—', separator: true },
      {
        id: 'libros-contables',
        label: 'Libros',
        children: [
          {
            id: 'libro-diario',
            label: 'Diario',
            estado: 'activo',
            vista: 'LibroDiarioView'
          },
          {
            id: 'libro-mayor',
            label: 'Mayor',
            estado: 'activo',
            vista: 'LibroMayorView'
          },
          {
            id: 'caja-bancos',
            label: 'Caja y bancos',
            estado: 'activo',
            vista: 'CajaBancosView'
          }
        ]
      },
      { id: 'sep-contab-2', label: '—', separator: true },
      {
        id: 'ajustes-cierres',
        label: 'Ajustes y cierres',
        children: [
          {
            id: 'consolidar-mes',
            label: 'Consolidar mes',
            estado: 'activo',
            vista: 'ConsolidarMesView',
            rolesPermitidos: ['ADMIN_ESTUDIO', 'ADMINISTRADOR', 'CONTADOR']
          },
          {
            id: 'dif-cambio',
            label: 'Diferencia de cambio',
            estado: 'activo',
            vista: 'DiferenciaCambioView',
            rolesPermitidos: ['ADMIN_ESTUDIO', 'ADMINISTRADOR', 'CONTADOR']
          },
          {
            id: 'cierre-mensual',
            label: 'Cierre mensual',
            estado: 'activo',
            vista: 'CierreMensualView',
            rolesPermitidos: ['ADMIN_ESTUDIO', 'ADMINISTRADOR', 'CONTADOR']
          },
          {
            id: 'cierre-anual',
            label: 'Cierre anual',
            estado: 'activo',
            vista: 'CierreAnualView',
            rolesPermitidos: ['ADMIN_ESTUDIO', 'ADMINISTRADOR', 'CONTADOR']
          }
        ]
      }
    ]
  },
  {
    id: 'compras-ventas',
    label: 'Compras y Ventas',
    items: [
      {
        id: 'reg-compras',
        label: 'Registro de compras',
        estado: 'activo',
        vista: 'RegistroComprasView'
      },
      {
        id: 'reg-ventas',
        label: 'Registro de ventas',
        estado: 'activo',
        vista: 'RegistroVentasView'
      },
      { id: 'sep-cv-1', label: '—', separator: true },
      {
        id: 'detracciones-retenciones',
        label: 'Detracciones y retenciones',
        estado: 'activo',
        vista: 'DetraccionesRetencionesView'
      }
    ]
  },
  {
    id: 'facturacion',
    label: 'Facturación',
    items: [
      {
        id: 'emitir-cp',
        label: 'Emitir factura o boleta',
        shortcut: 'F3',
        estado: 'activo',
        vista: 'EmitirComprobanteView',
        rolesPermitidos: ['ADMIN_ESTUDIO', 'ADMINISTRADOR', 'CONTADOR', 'ASISTENTE']
      },
      {
        id: 'notas-cd',
        label: 'Notas de crédito y débito',
        estado: 'activo',
        vista: 'NotasCreditoDebitoView',
        rolesPermitidos: ['ADMIN_ESTUDIO', 'ADMINISTRADOR', 'CONTADOR', 'ASISTENTE']
      },
      {
        id: 'guias-remision',
        label: 'Guías de remisión',
        estado: 'proximamente',
        vista: 'GuiasRemisionView'
      },
      { id: 'sep-fact-1', label: '—', separator: true },
      {
        id: 'resumen-bajas',
        label: 'Resumen diario y bajas',
        estado: 'proximamente',
        vista: 'ResumenBajasView'
      },
      {
        id: 'consulta-cp',
        label: 'Consulta de comprobantes',
        estado: 'activo',
        vista: 'ConsultaComprobantesView'
      },
      {
        id: 'lector-xml-cdr',
        label: 'Lector de XML y CDR',
        estado: 'activo',
        vista: 'LectorXmlCdrView'
      },
      { id: 'sep-fact-2', label: '—', separator: true },
      {
        id: 'series-certificado',
        label: 'Series y certificado digital',
        estado: 'proximamente',
        vista: 'SeriesCertificadoView'
      }
    ]
  },
  {
    id: 'tributos',
    label: 'Tributos',
    items: [
      {
        id: 'declaracion-igv-renta',
        label: 'Declaración mensual IGV-Renta',
        estado: 'activo',
        vista: 'LiquidacionTributariaView'
      },
      {
        id: 'prorrata-igv',
        label: 'Prorrata del IGV',
        estado: 'activo',
        vista: 'ProrrataIgvView'
      },
      { id: 'sep-trib-1', label: '—', separator: true },
      {
        id: 'declaracion-renta-anual',
        label: 'Declaración anual de Renta',
        estado: 'activo',
        vista: 'DeclaracionRentaAnualView'
      },
      {
        id: 'daot',
        label: 'Operaciones con terceros (DAOT)',
        estado: 'activo',
        vista: 'DaotView'
      },
      { id: 'sep-trib-2', label: '—', separator: true },
      {
        id: 'cronograma-vencimientos',
        label: 'Cronograma de vencimientos',
        estado: 'activo',
        vista: 'CronogramaVencimientosView'
      },
      {
        id: 'parametros-tributarios',
        label: 'Parámetros tributarios',
        estado: 'activo',
        vista: 'ParametrosTributariosView',
        rolesPermitidos: ['ADMIN_ESTUDIO', 'ADMINISTRADOR']
      },
      {
        id: 'simulador-fiscalizacion',
        label: 'Simulador de fiscalización SUNAT',
        estado: 'activo',
        vista: 'SimuladorFiscalizacionView'
      }
    ]
  },
  {
    id: 'planillas',
    label: 'Planillas',
    items: [
      {
        id: 'trabajadores',
        label: 'Trabajadores',
        estado: 'activo',
        vista: 'TrabajadoresView'
      },
      {
        id: 'planilla-mensual',
        label: 'Planilla mensual',
        estado: 'activo',
        vista: 'PlanillaPlameView'
      },
      {
        id: 'recibos-honorarios',
        label: 'Recibos por honorarios (4ta)',
        estado: 'activo',
        vista: 'HonorariosView'
      },
      { id: 'sep-plan-1', label: '—', separator: true },
      {
        id: 'boletas-pago',
        label: 'Boletas de pago',
        estado: 'activo',
        vista: 'BoletasPagoView'
      },
      {
        id: 'gratificaciones-cts',
        label: 'Gratificaciones y CTS',
        estado: 'activo',
        vista: 'GratificacionesCtsView'
      },
      { id: 'sep-plan-2', label: '—', separator: true },
      {
        id: 'exportar-plame',
        label: 'Exportar PLAME',
        estado: 'activo',
        vista: 'ExportarPlameView'
      },
      {
        id: 't-registro',
        label: 'T-Registro',
        estado: 'activo',
        vista: 'TRegistroView'
      }
    ]
  },
  {
    id: 'registros-electronicos',
    label: 'Registros Electrónicos',
    items: [
      {
        id: 'sire-menu',
        label: 'SIRE',
        children: [
          {
            id: 'sire-prop-compras',
            label: 'Propuesta de compras RCE',
            estado: 'activo',
            vista: 'SirePropuestaComprasView'
          },
          {
            id: 'sire-prop-ventas',
            label: 'Propuesta de ventas RVIE',
            estado: 'activo',
            vista: 'SirePropuestaVentasView'
          },
          {
            id: 'sire-conciliador',
            label: 'Conciliador SIRE vs registro',
            estado: 'activo',
            vista: 'SireConciliadorView'
          },
          {
            id: 'sire-txt-ajustes',
            label: 'Ajustes y reemplazo TXT',
            estado: 'activo',
            vista: 'SireAjustesReemplazoView'
          }
        ]
      },
      {
        id: 'ple-menu',
        label: 'PLE 5.2',
        children: [
          {
            id: 'libros-electronicos',
            label: 'Generar libros electrónicos',
            estado: 'activo',
            vista: 'LibrosElectronicosView'
          },
          {
            id: 'validar-libros-electronicos',
            label: 'Validar estructura TXT',
            estado: 'activo',
            vista: 'ValidarLibrosElectronicosView'
          }
        ]
      }
    ]
  },
  {
    id: 'tesoreria',
    label: 'Tesorería',
    items: [
      {
        id: 'cuentas-bancarias',
        label: 'Cuentas bancarias',
        estado: 'activo',
        vista: 'CuentasBancariasView'
      },
      {
        id: 'conciliacion-bancaria',
        label: 'Conciliación bancaria',
        estado: 'activo',
        vista: 'ConciliacionBancariaView'
      },
      {
        id: 'mov-bancarios',
        label: 'Movimientos bancarios',
        estado: 'activo',
        vista: 'MovimientosBancariosView'
      },
      {
        id: 'flujo-caja-proyectado',
        label: 'Flujo de caja proyectado',
        estado: 'activo',
        vista: 'FlujoCajaProyectadoView'
      },
      { id: 'sep-tes-1', label: '—', separator: true },
      {
        id: 'cxc',
        label: 'Cuentas por cobrar',
        estado: 'activo',
        vista: 'CuentasPorCobrarView'
      },
      {
        id: 'cxp',
        label: 'Cuentas por pagar',
        estado: 'activo',
        vista: 'CuentasPorPagarView'
      },
      {
        id: 'antiguedad-saldos',
        label: 'Antigüedad de saldos',
        estado: 'activo',
        vista: 'AntiguedadSaldosView'
      },
      {
        id: 'letras-pagares',
        label: 'Letras y pagarés',
        estado: 'proximamente',
        vista: 'LetrasPagaresView'
      },
      { id: 'sep-tes-2', label: '—', separator: true },
      {
        id: 'caja-chica-menu',
        label: 'Caja chica',
        children: [
          {
            id: 'caja-apertura-cierre',
            label: 'Apertura y cierre',
            estado: 'activo',
            vista: 'CajaChicaAperturaView'
          },
          {
            id: 'caja-gastos',
            label: 'Gastos',
            estado: 'activo',
            vista: 'CajaChicaGastosView'
          },
          {
            id: 'caja-reposicion',
            label: 'Reposición',
            estado: 'activo',
            vista: 'CajaChicaReposicionView'
          }
        ]
      }
    ]
  },
  {
    id: 'inventarios-activos',
    label: 'Inventarios y Activos',
    items: [
      {
        id: 'kardex',
        label: 'Kardex',
        estado: 'proximamente',
        vista: 'KardexView'
      },
      {
        id: 'existencias',
        label: 'Existencias',
        estado: 'proximamente',
        vista: 'ExistenciasView'
      },
      { id: 'sep-inv-1', label: '—', separator: true },
      {
        id: 'activos-fijos',
        label: 'Activos fijos',
        estado: 'proximamente',
        vista: 'ActivosFijosView'
      },
      {
        id: 'depreciacion-mensual',
        label: 'Depreciación mensual',
        estado: 'proximamente',
        vista: 'DepreciacionMensualView'
      }
    ]
  },
  {
    id: 'estados-financieros',
    label: 'Estados Financieros',
    items: [
      {
        id: 'hoja-trabajo',
        label: 'Hoja de trabajo (10 columnas)',
        estado: 'activo',
        vista: 'HojaTrabajo10ColumnasView'
      },
      {
        id: 'estado-situacion',
        label: 'Estado de situación financiera',
        estado: 'activo',
        vista: 'BalanceGeneralView'
      },
      {
        id: 'estado-resultados',
        label: 'Estado de resultados',
        estado: 'activo',
        vista: 'EstadoResultadosView'
      },
      {
        id: 'flujo-efectivo',
        label: 'Estado de flujo de efectivo',
        estado: 'activo',
        vista: 'FlujoEfectivoView'
      },
      {
        id: 'analisis-cuentas',
        label: 'Análisis de cuentas',
        estado: 'activo',
        vista: 'AnalisisCuentasView'
      }
    ]
  },
  {
    id: 'estudio',
    label: 'Estudio',
    items: [
      {
        id: 'cartera-empresas',
        label: 'Cartera de empresas',
        estado: 'activo',
        vista: 'MisEmpresasNivel1View'
      },
      {
        id: 'indicadores-estudio',
        label: 'Indicadores del estudio',
        estado: 'activo',
        vista: 'DashboardView'
      },
      {
        id: 'control-calidad',
        label: 'Control de calidad',
        estado: 'activo',
        vista: 'ControlCalidadEstudioView'
      },
      {
        id: 'biblioteca-plantillas',
        label: 'Biblioteca de plantillas',
        estado: 'activo',
        vista: 'BibliotecaPlantillasView'
      },
      {
        id: 'portal-cliente',
        label: 'Portal del cliente',
        estado: 'proximamente',
        vista: 'PortalClienteView'
      }
    ]
  },
  {
    id: 'herramientas',
    label: 'Herramientas',
    items: [
      {
        id: 'calculadora',
        label: 'Calculadora tributaria',
        estado: 'activo',
        vista: 'CalculadoraContableModal'
      },
      {
        id: 'tablas-maestras',
        label: 'Tablas maestras',
        children: [
          {
            id: 'tbl-clientes-prov',
            label: 'Clientes y proveedores',
            estado: 'activo',
            vista: 'ClientesProveedoresView'
          },
          {
            id: 'tbl-tipos-cp',
            label: 'Tipos de comprobante',
            estado: 'activo',
            vista: 'TiposComprobanteView'
          },
          {
            id: 'tbl-tipo-cambio',
            label: 'Tipo de cambio SBS',
            estado: 'activo',
            vista: 'TipoCambioView'
          },
          {
            id: 'tbl-bancos',
            label: 'Bancos',
            estado: 'activo',
            vista: 'BancosView'
          },
          {
            id: 'tbl-unidades-medida',
            label: 'Unidades de medida',
            estado: 'activo',
            vista: 'UnidadesMedidaView'
          }
        ]
      },
      { id: 'sep-herr-1', label: '—', separator: true },
      {
        id: 'respaldos',
        label: 'Respaldos',
        estado: 'activo',
        vista: 'ModalBackupEmpresa',
        rolesPermitidos: ['ADMIN_ESTUDIO', 'ADMINISTRADOR']
      },
      {
        id: 'restaurar-demo',
        label: 'Restaurar datos de demostración',
        estado: 'activo',
        vista: 'AccionRestaurarDemo',
        rolesPermitidos: ['ADMIN_ESTUDIO', 'ADMINISTRADOR']
      },
      { id: 'sep-herr-2', label: '—', separator: true },
      {
        id: 'usuarios-permisos',
        label: 'Usuarios y permisos',
        estado: 'activo',
        vista: 'UsuariosPermisosView',
        rolesPermitidos: ['ADMIN_ESTUDIO', 'ADMINISTRADOR']
      },
      {
        id: 'auditoria-sistema',
        label: 'Auditoría del sistema',
        estado: 'activo',
        vista: 'MapaAuditoriaSistemaView'
      },
      {
        id: 'estilo-reporte',
        label: 'Estilo de reporte',
        children: [
          {
            id: 'formato-estandar',
            label: 'Formato estándar Atlob',
            estado: 'activo',
            vista: 'AccionFormatoEstandar'
          },
          {
            id: 'formato-corporativo',
            label: 'Formato corporativo',
            estado: 'activo',
            vista: 'AccionFormatoCorporativo'
          }
        ]
      }
    ]
  },
  {
    id: 'ayuda',
    label: 'Ayuda',
    items: [
      {
        id: 'guia-rapida',
        label: 'Guía rápida y atajos',
        estado: 'activo',
        vista: 'GuiaRapidaAtajosView'
      },
      {
        id: 'estado-conexion-sunat',
        label: 'Estado de conexión SUNAT',
        estado: 'activo',
        vista: 'SunatSyncView'
      },
      { id: 'sep-ayuda-1', label: '—', separator: true },
      {
        id: 'acerca-de',
        label: 'Acerca de Atlob Consultores ERP',
        estado: 'activo',
        vista: 'AcercaDeModal'
      }
    ]
  }
];

/**
 * Devuelve todos los ítems hoja del menú con su ruta jerárquica y metadatos.
 */
export function obtenerItemsHojaMenu(grupos: MenuGroup[] = MENU_DATA): MenuLeafResolved[] {
  const resultado: MenuLeafResolved[] = [];

  for (const grupo of grupos) {
    for (const item of grupo.items) {
      if (item.separator) continue;
      if (item.children && item.children.length > 0) {
        for (const sub of item.children) {
          if (sub.separator) continue;
          resultado.push({
            id: sub.id,
            label: sub.label,
            rutaCompleta: `${grupo.label} › ${item.label} › ${sub.label}`,
            grupoId: grupo.id,
            grupoLabel: grupo.label,
            shortcut: sub.shortcut,
            estado: sub.estado || 'activo',
            vista: sub.vista || '',
            rolesPermitidos: sub.rolesPermitidos
          });
        }
      } else {
        resultado.push({
          id: item.id,
          label: item.label,
          rutaCompleta: `${grupo.label} › ${item.label}`,
          grupoId: grupo.id,
          grupoLabel: grupo.label,
          shortcut: item.shortcut,
          estado: item.estado || 'activo',
          vista: item.vista || '',
          rolesPermitidos: item.rolesPermitidos
        });
      }
    }
  }

  return resultado;
}

/**
 * Evalúa si el rol actual tiene permiso sobre un ítem del menú.
 */
export function tienePermisoMenu(item: { rolesPermitidos?: RolSistema[] }, rolActual: string): boolean {
  if (!item.rolesPermitidos || item.rolesPermitidos.length === 0) return true;
  const upper = (rolActual || '').toUpperCase();
  const normalizado: RolSistema =
    upper.includes('ADMIN')
      ? 'ADMIN_ESTUDIO'
      : upper.includes('CONTADOR')
      ? 'CONTADOR'
      : upper.includes('ASISTENTE')
      ? 'ASISTENTE'
      : 'AUDITOR';
  return item.rolesPermitidos.includes(normalizado);
}
