export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  separator?: boolean;
  children?: MenuItem[];
  action?: string;
}

export interface MenuGroup {
  id: string;
  label: string;
  items: MenuItem[];
}

export const MENU_DATA: MenuGroup[] = [
  {
    id: 'contabilidad',
    label: 'Contabilidad',
    items: [
      { id: 'pcge', label: 'Plan de cuentas (PCGE)' },
      { id: 'asientos', label: 'Registro de asientos', shortcut: 'F2' },
      {
        id: 'libros-auxiliares',
        label: 'Libros auxiliares',
        children: [
          { id: 'libro-diario', label: 'Libro diario' },
          { id: 'libro-mayor', label: 'Libro mayor' },
          { id: 'caja-bancos', label: 'Caja y bancos' }
        ]
      },
      { id: 'sep-1', label: '-', separator: true },
      { id: 'reg-compras', label: 'Registro de compras' },
      { id: 'reg-ventas', label: 'Registro de ventas' },
      { id: 'centro-costos', label: 'Centro de costos' },
      { id: 'sep-2', label: '-', separator: true },
      {
        id: 'ajustes-cierre',
        label: 'Ajustes y cierre',
        children: [
          { id: 'dif-cambio', label: 'Diferencia de cambio' },
          { id: 'depreciacion', label: 'Depreciación' },
          { id: 'cierre-mensual', label: 'Cierre mensual' },
          { id: 'cierre-anual', label: 'Cierre anual' }
        ]
      }
    ]
  },
  {
    id: 'informes-contables',
    label: 'Informes Contables',
    items: [
      { id: 'bal-comprobacion', label: 'Balance de comprobación' },
      { id: 'bal-general', label: 'Balance general' },
      { id: 'est-resultados', label: 'Estado de resultados' },
      { id: 'analisis-cuenta', label: 'Análisis de cuenta' },
      { id: 'flujo-efectivo', label: 'Flujo de efectivo' }
    ]
  },
  {
    id: 'reportes-sunat',
    label: 'Reportes SUNAT',
    items: [
      {
        id: 'rep-libros',
        label: 'Libros',
        children: [
          { id: 'rep-diario', label: 'Diario' },
          { id: 'rep-mayor', label: 'Mayor' },
          { id: 'rep-compras', label: 'Compras' },
          { id: 'rep-ventas', label: 'Ventas' },
          { id: 'rep-caja-bancos', label: 'Caja y bancos' },
          { id: 'rep-inv-balances', label: 'Inventarios y balances' }
        ]
      },
      {
        id: 'rep-pdb',
        label: 'PDB',
        children: [
          { id: 'pdb-renta-anual', label: 'PDB Renta anual' },
          { id: 'pdb-igv-renta', label: 'PDB IGV-Renta mensual' }
        ]
      },
      {
        id: 'rep-daot',
        label: 'DAOT',
        children: [
          { id: 'daot-generar', label: 'Generar DAOT' },
          { id: 'daot-validar', label: 'Validar DAOT' }
        ]
      },
      {
        id: 'rep-pdt',
        label: 'PDT',
        children: [
          { id: 'pdt-621', label: 'PDT 621 IGV-Renta' },
          { id: 'pdt-601', label: 'PDT 601 PLAME' },
          { id: 'pdt-617', label: 'PDT 617 Exportadores' }
        ]
      },
      { id: 'libros-electronicos', label: 'Libros Electrónicos' },
      { id: 'txt-valida-compras', label: 'TXT valida compras SUNAT' }
    ]
  },
  {
    id: 'sire-sunat',
    label: 'SIRE SUNAT +',
    items: [
      { id: 'sire-prop-compras', label: 'Importar propuesta compras (TXT/ZIP)' },
      { id: 'sire-prop-ventas', label: 'Importar propuesta ventas' },
      { id: 'sire-conciliador', label: 'Conciliador SIRE vs registro' },
      { id: 'sire-txt-ajustes', label: 'Exportar TXT de ajustes' }
    ]
  },
  {
    id: 'facturacion',
    label: 'Facturación',
    items: [
      { id: 'emitir-cp', label: 'Emitir factura / boleta', shortcut: 'F3' },
      { id: 'notas-cd', label: 'Notas de crédito y débito' },
      { id: 'guias-remision', label: 'Guías de remisión (GRE)' },
      { id: 'comunicacion-baja', label: 'Comunicación de baja' },
      { id: 'sep-fact-1', label: '-', separator: true },
      { id: 'lector-xml-cdr', label: 'Lector XML UBL / CDR' },
      { id: 'consulta-cp', label: 'Consulta de comprobantes' }
    ]
  },
  {
    id: 'creditos-cobranza',
    label: 'Créditos y Cobranza',
    items: [
      { id: 'cxc', label: 'Cuentas por cobrar' },
      { id: 'cxp', label: 'Cuentas por pagar' },
      { id: 'letras-pagares', label: 'Letras y pagarés' },
      { id: 'vencimientos-sunat', label: 'Vencimientos SUNAT' }
    ]
  },
  {
    id: 'tesoreria',
    label: 'Tesorería',
    items: [
      { id: 'conciliacion-bancaria', label: 'Conciliación bancaria' },
      { id: 'mov-bancarios', label: 'Movimientos bancarios' },
      { id: 'flujo-caja-proyectado', label: 'Flujo de caja proyectado' }
    ]
  },
  {
    id: 'caja-chica',
    label: 'Caja Chica',
    items: [
      { id: 'caja-apertura-cierre', label: 'Apertura / cierre de caja' },
      { id: 'caja-gastos', label: 'Registro de gastos' },
      { id: 'caja-reposicion', label: 'Reposición' }
    ]
  },
  {
    id: 'gestion-negocio',
    label: 'Gestión de Negocio',
    items: [
      { id: 'cartera-empresas', label: 'Cartera de empresas' },
      { id: 'dashboard-gerencial', label: 'Dashboard gerencial' },
      { id: 'control-calidad', label: 'Control de calidad / satisfacción' },
      { id: 'biblioteca-docs', label: 'Biblioteca de documentos' }
    ]
  },
  {
    id: 'empresa',
    label: 'Empresa',
    items: [
      { id: 'nueva-empresa', label: 'Nueva empresa' },
      { id: 'buscar-empresa', label: 'Buscar empresa', shortcut: 'Ctrl+K' },
      { id: 'configurar-empresa', label: 'Configurar empresa' },
      { id: 'sep-emp-1', label: '-', separator: true },
      { id: 'importar-csv', label: 'Importar CSV' },
      { id: 'cambiar-empresa', label: 'Cambiar empresa activa' },
      { id: 'cambiar-periodo', label: 'Cambiar período' }
    ]
  },
  {
    id: 'tablas',
    label: 'Tablas',
    items: [
      { id: 'tbl-clientes-prov', label: 'Clientes y proveedores' },
      { id: 'tbl-tipos-cp', label: 'Tipos de comprobante' },
      { id: 'tbl-tipo-cambio', label: 'Tipo de cambio' },
      { id: 'tbl-bancos', label: 'Bancos' },
      { id: 'tbl-unidades-medida', label: 'Unidades de medida' }
    ]
  },
  {
    id: 'utilitarios',
    label: 'Utilitarios',
    items: [
      { id: 'respaldos', label: 'Respaldos' },
      { id: 'restaurar-demo', label: 'Restaurar demo' },
      { id: 'sep-util-1', label: '-', separator: true },
      { id: 'usuarios-roles', label: 'Usuarios y roles' },
      { id: 'auditoria-sistema', label: 'Auditoria del sistema' },
      {
        id: 'formato-reporte',
        label: 'Formato de reporte',
        children: [
          { id: 'formato-estandar', label: 'Estándar (monocromo)' },
          { id: 'formato-corporativo', label: 'Corporativo (color)' }
        ]
      }
    ]
  },
  {
    id: 'ayuda',
    label: 'Ayuda',
    items: [
      { id: 'acerca-de', label: 'Acerca de Atlob Consultores ERP' },
      { id: 'autor', label: 'Desarrollado por Jimmy Mayta' }
    ]
  }
];
