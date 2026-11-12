export interface ModuloSoloMemoria {
  id: string;
  nombreVisible: string;
  servicios: readonly string[];
  /** Prefijos o patrones de ruta relativos a /api */
  prefijosRuta: readonly string[];
  /** Identificadores de vistas/opciones de menú afectadas en el frontend */
  vistasMenuIds: readonly string[];
  /** Rutas compartidas con servicios persistentes en PostgreSQL que no se bloquean */
  rutasCompartidasNoBloqueadas?: readonly string[];
}

export interface HelperServicioCatalogado {
  servicio: string;
  categoria: 'cifrado' | 'validacion' | 'contabilizacion' | 'consulta_externa' | 'migrador' | 'utilitario';
  descripcion: string;
}

/**
 * Registro declarativo único de módulos que aún operan solo con estado en memoria (*_MEMORIA).
 * Regla de sincronía: cuando un servicio migre a PostgreSQL (usando db.query/db.getClient/etc.),
 * debe retirarse de este listado en el mismo cambio.
 */
export const MODULOS_SOLO_MEMORIA: readonly ModuloSoloMemoria[] = [
  {
    id: 'planillas-plame',
    nombreVisible: 'Planillas, PLAME, Beneficios Sociales y T-Registro',
    servicios: ['planillaService.ts'],
    prefijosRuta: [
      '/empresas/:empresaId/trabajadores',
      '/empresas/:empresaId/planillas'
    ],
    vistasMenuIds: [
      'trabajadores',
      'planilla-mensual',
      'boletas-pago',
      'gratificaciones-cts',
      'exportar-plame',
      't-registro'
    ],
    rutasCompartidasNoBloqueadas: [
      '/api/asientos',
      '/api/empresas/:empresaId/asientos'
    ]
  },
  {
    id: 'recibos-honorarios',
    nombreVisible: 'Recibos por Honorarios (4ta Categoría)',
    servicios: ['honorariosService.ts'],
    prefijosRuta: ['/empresas/:empresaId/honorarios'],
    vistasMenuIds: ['recibos-honorarios']
  },
  {
    id: 'caja-chica',
    nombreVisible: 'Caja Chica (Apertura, Gastos y Reposición)',
    servicios: ['cajaChicaService.ts'],
    prefijosRuta: ['/empresas/:empresaId/caja-chica'],
    vistasMenuIds: [
      'caja-apertura-cierre',
      'caja-chica-apertura',
      'caja-gastos',
      'caja-chica-gastos',
      'caja-reposicion',
      'caja-chica-reposicion'
    ]
  },
  {
    id: 'conciliacion-bancaria',
    nombreVisible: 'Extractos y Conciliación Bancaria',
    servicios: ['conciliacionService.ts'],
    prefijosRuta: [
      '/empresas/:empresaId/extractos',
      '/empresas/:empresaId/conciliaciones'
    ],
    vistasMenuIds: ['conciliacion-bancaria'],
    rutasCompartidasNoBloqueadas: [
      '/api/empresas/:empresaId/cuentas-financieras',
      '/api/empresas/:empresaId/movimientos-tesoreria',
      '/api/empresas/:empresaId/transferencias'
    ]
  },
  {
    id: 'sire-conciliacion',
    nombreVisible: 'Conciliador SIRE, Reglas por Proveedor y Cierre Oficial',
    servicios: ['conciliadorSireService.ts'],
    prefijosRuta: [
      '/empresas/:empresaId/sire/conciliacion',
      '/empresas/:empresaId/sire/lineas',
      '/empresas/:empresaId/sire/reglas-proveedor',
      '/empresas/:empresaId/sire/aceptar-oficial',
      '/empresas/:empresaId/sire/reemplazar-oficial',
      '/empresas/:empresaId/sire/ajustes-posteriores'
    ],
    vistasMenuIds: [
      'sire-conciliador',
      'sire-txt-ajustes',
      'sire-ajustes-reemplazo'
    ],
    rutasCompartidasNoBloqueadas: [
      '/api/empresas/:empresaId/sire/conexion',
      '/api/empresas/:empresaId/sire/tickets',
      '/api/empresas/:empresaId/sire/descargar',
      '/api/empresas/:empresaId/sire/propuestas/importar-manual',
      '/api/sire/validar-txt'
    ]
  },
  {
    id: 'ple-exportacion',
    nombreVisible: 'Exportación de Libros Electrónicos PLE 5.2',
    servicios: ['pleExportService.ts'],
    prefijosRuta: [
      '/empresas/:empresaId/ple/libros',
      '/empresas/:empresaId/ple/prevalidar',
      '/empresas/:empresaId/ple/exportar',
      '/empresas/:empresaId/ple/exportaciones',
      '/ple-exportaciones'
    ],
    vistasMenuIds: [
      'libros-electronicos',
      'generar-libros-electronicos'
    ],
    rutasCompartidasNoBloqueadas: [
      '/api/empresas/:empresaId/ple/exportar-job',
      '/api/ple/validar-txt'
    ]
  },
  {
    id: 'historial-generaciones-sunat',
    nombreVisible: 'Historial en Memoria de Generaciones SIRE y PLE',
    servicios: ['historialGeneracionesService.ts'],
    prefijosRuta: [
      '/empresas/:empresaId/sire/historial',
      '/empresas/:empresaId/ple/historial'
    ],
    vistasMenuIds: [],
    rutasCompartidasNoBloqueadas: [
      '/api/empresas/:empresaId/sire/descargar',
      '/api/empresas/:empresaId/sire/propuestas/importar-manual'
    ]
  },
  {
    id: 'cierre-anual',
    nombreVisible: 'Cierre Anual Contable (Elemento 8)',
    servicios: ['cierreAnualService.ts'],
    prefijosRuta: ['/empresas/:empresaId/cierre-anual'],
    vistasMenuIds: ['cierre-anual']
  },
  {
    id: 'prorrata-igv',
    nombreVisible: 'Prorrata del Crédito Fiscal IGV',
    servicios: ['prorrataIgvService.ts'],
    prefijosRuta: [
      '/empresas/:empresaId/prorrata-igv',
      '/tributos/prorrata-igv'
    ],
    vistasMenuIds: ['prorrata-igv'],
    rutasCompartidasNoBloqueadas: ['/api/tributos/pdt621']
  },
  {
    id: 'daot',
    nombreVisible: 'Declaración Anual de Operaciones con Terceros (DAOT)',
    servicios: ['daotService.ts'],
    prefijosRuta: [
      '/empresas/:empresaId/daot',
      '/tributos/daot'
    ],
    vistasMenuIds: ['daot', 'daot-operaciones-terceros']
  },
  {
    id: 'dj-renta-anual',
    nombreVisible: 'Declaración Jurada Anual de Renta (FV 710)',
    servicios: ['djRentaAnualService.ts'],
    prefijosRuta: [
      '/empresas/:empresaId/dj-anual',
      '/tributos/renta-anual'
    ],
    vistasMenuIds: ['declaracion-renta-anual', 'declaracion-anual-renta']
  },
  {
    id: 'auditoria-preventiva',
    nombreVisible: 'Simulador de Fiscalización y Auditoría Preventiva',
    servicios: ['auditoriaTributariaService.ts'],
    prefijosRuta: ['/empresas/:empresaId/auditoria/preventiva'],
    vistasMenuIds: ['simulador-fiscalizacion']
  },
  {
    id: 'kardex-existencias',
    nombreVisible: 'Kardex Valorizado y Existencias',
    servicios: ['kardexService.ts'],
    prefijosRuta: ['/empresas/:empresaId/kardex'],
    vistasMenuIds: ['kardex', 'existencias'],
    rutasCompartidasNoBloqueadas: ['/api/consolidacion']
  },
  {
    id: 'activos-fijos',
    nombreVisible: 'Activos Fijos y Depreciación Mensual',
    servicios: ['activosFijosService.ts'],
    prefijosRuta: ['/empresas/:empresaId/activos-fijos'],
    vistasMenuIds: ['activos-fijos', 'depreciacion-mensual']
  },
  {
    id: 'importacion-csv',
    nombreVisible: 'Importación Masiva desde CSV',
    servicios: ['importacionService.ts'],
    prefijosRuta: ['/importacion'],
    vistasMenuIds: ['importar-csv']
  },
  {
    id: 'respaldos-empresa',
    nombreVisible: 'Respaldos Lógicos por Empresa',
    servicios: ['backupEmpresaService.ts'],
    prefijosRuta: ['/empresas/:empresaId/backups'],
    vistasMenuIds: ['respaldos']
  },
  {
    id: 'empresa-demo',
    nombreVisible: 'Restauración de Empresa Demo',
    servicios: ['empresaDemoService.ts'],
    prefijosRuta: ['/empresas/demo/restablecer'],
    vistasMenuIds: ['restaurar-demo'],
    rutasCompartidasNoBloqueadas: [
      '/api/empresas',
      '/api/empresas/:empresaId',
      '/api/empresas/:empresaId/credenciales-sunat',
      '/api/empresas/:empresaId/metodo-inventario'
    ]
  },
  {
    id: 'importacion-xml',
    nombreVisible: 'Importación de Comprobantes XML UBL 2.1 (Cola Interna)',
    servicios: ['xmlImportService.ts'],
    prefijosRuta: [],
    vistasMenuIds: [],
    rutasCompartidasNoBloqueadas: [
      '/api/empresas/:empresaId/sire/descargar',
      '/api/empresas/:empresaId/ple/exportar-job'
    ]
  }
];

/**
 * Servicios sin estado persistente propio (calculadoras, validadores, pasarelas o adaptadores).
 * No almacenan tablas transaccionales de negocio en arreglos *_MEMORIA.
 */
export const HELPERS_SIN_PERSISTENCIA: readonly HelperServicioCatalogado[] = [
  {
    servicio: 'aperturaCierreService.ts',
    categoria: 'contabilizacion',
    descripcion: 'Generador lógico de propuestas de asientos de apertura y cierre contable.'
  },
  {
    servicio: 'archivoValidadorService.ts',
    categoria: 'validacion',
    descripcion: 'Validador sintáctico y estructural de archivos TXT PLE.'
  },
  {
    servicio: 'consultaValidezCpeService.ts',
    categoria: 'consulta_externa',
    descripcion: 'Cliente/adaptador de consulta de validez de CPE.'
  },
  {
    servicio: 'contabilizacionService.ts',
    categoria: 'contabilizacion',
    descripcion: 'Motor puro de reglas y plantillas de asientos contables (lee empresaRepository).'
  },
  {
    servicio: 'cryptoService.ts',
    categoria: 'cifrado',
    descripcion: 'Funciones criptográficas AES-256-GCM y sanitización de credenciales.'
  },
  {
    servicio: 'migrationService.ts',
    categoria: 'migrador',
    descripcion: 'Orquestador de importación técnica de saldos iniciales hacia servicios contables.'
  },
  {
    servicio: 'redondeoUsdService.ts',
    categoria: 'utilitario',
    descripcion: 'Utilidad aritmética para redondeo y diferencia de cambio en USD.'
  },
  {
    servicio: 'sireLayoutService.ts',
    categoria: 'validacion',
    descripcion: 'Validador de layouts de reemplazo y ajustes TXT SIRE.'
  },
  {
    servicio: 'sunatConsultaRucService.ts',
    categoria: 'consulta_externa',
    descripcion: 'Consulta externa/adaptador de padrón RUC.'
  },
  {
    servicio: 'sunatGateway.ts',
    categoria: 'consulta_externa',
    descripcion: 'Pasarela externa hacia APIs SUNAT OAuth2 / SIRE.'
  },
  {
    servicio: 'totpService.ts',
    categoria: 'cifrado',
    descripcion: 'Generación y verificación RFC 6238 de códigos TOTP y códigos de respaldo.'
  }
];

const METODOS_ESCRITURA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function normalizarSegmentosRuta(ruta: string): string[] {
  const sinQuery = ruta.split('?')[0];
  return sinQuery.split('/').filter(Boolean);
}

/**
 * Compara una ruta relativa a /api contra un patrón de prefijo por segmentos completos.
 * Evita colisiones entre prefijos parecidos (p. ej. `/ple/exportar` no coincide con `/ple/exportar-job`).
 */
export function coincidePrefijoRuta(rutaSinApi: string, patronPrefijo: string): boolean {
  const segmentosRuta = normalizarSegmentosRuta(rutaSinApi);
  const segmentosPatron = normalizarSegmentosRuta(patronPrefijo);
  if (segmentosPatron.length === 0 || segmentosRuta.length < segmentosPatron.length) {
    return false;
  }

  for (let i = 0; i < segmentosPatron.length; i++) {
    const segPatron = segmentosPatron[i];
    const segRuta = segmentosRuta[i];
    if (segPatron.startsWith(':')) {
      if (!segRuta) return false;
      continue;
    }
    if (segPatron !== segRuta) {
      return false;
    }
  }
  return true;
}

export function buscarModuloSoloMemoriaPorRuta(rutaSinApi: string): ModuloSoloMemoria | null {
  for (const modulo of MODULOS_SOLO_MEMORIA) {
    if (modulo.prefijosRuta.some((prefijo) => coincidePrefijoRuta(rutaSinApi, prefijo))) {
      return modulo;
    }
  }
  return null;
}

export function esPeticionEscrituraBloqueableMemoria(method: string, rutaSinApi: string): ModuloSoloMemoria | null {
  if (!METODOS_ESCRITURA.has(method.toUpperCase())) {
    return null;
  }
  return buscarModuloSoloMemoriaPorRuta(rutaSinApi);
}

export function obtenerModoEjecucion(): 'development' | 'production' | 'test' {
  const modo = process.env.NODE_ENV;
  if (modo === 'production' || modo === 'test') return modo;
  return 'development';
}

export function estaBloqueoMemoriaSolicitado(): boolean {
  const raw = (process.env.ATLOB_BLOQUEAR_MEMORIA || '').trim().toLowerCase();
  return raw === '1' || raw === 'true';
}

export function estaBloqueoMemoriaActivo(): boolean {
  return obtenerModoEjecucion() === 'production' && estaBloqueoMemoriaSolicitado();
}

export function esEntornoEscritorio(): boolean {
  return process.env.ATLOB_DESKTOP === '1';
}

export interface EstadoPersistenciaDTO {
  modo: 'development' | 'production' | 'test';
  esEscritorio: boolean;
  persistenciaCompleta: boolean;
  bloqueo: {
    banderaSolicitada: boolean;
    activo: boolean;
    variable: 'ATLOB_BLOQUEAR_MEMORIA';
  };
  modulosTemporales: Array<{
    id: string;
    nombreVisible: string;
    servicios: readonly string[];
    prefijosRuta: readonly string[];
    vistasMenuIds: readonly string[];
  }>;
}

export function obtenerEstadoPersistencia(): EstadoPersistenciaDTO {
  return {
    modo: obtenerModoEjecucion(),
    esEscritorio: esEntornoEscritorio(),
    persistenciaCompleta: MODULOS_SOLO_MEMORIA.length === 0,
    bloqueo: {
      banderaSolicitada: estaBloqueoMemoriaSolicitado(),
      activo: estaBloqueoMemoriaActivo(),
      variable: 'ATLOB_BLOQUEAR_MEMORIA'
    },
    modulosTemporales: MODULOS_SOLO_MEMORIA.map((m) => ({
      id: m.id,
      nombreVisible: m.nombreVisible,
      servicios: m.servicios,
      prefijosRuta: m.prefijosRuta,
      vistasMenuIds: m.vistasMenuIds
    }))
  };
}

/**
 * Detecta si un archivo de servicio utiliza consultas/transacciones PostgreSQL reales
 * (descartando comentarios de línea y bloque).
 */
export function tieneConsultasPostgreSQL(codigoFuente: string): boolean {
  const sinBloques = codigoFuente.replace(/\/\*[\s\S]*?\*\//g, '');
  const sinComentarios = sinBloques.replace(/\/\/.*$/gm, '');
  return /\bdb\s*\.\s*(?:query|getClient|withEmpresaTransaction|withTenantAndEmpresa|withUsuarioTransaction)\s*\(|\bpool\s*\.\s*query\s*\(|from\s+['"]pg['"]|\bnew\s+Pool\b/.test(
    sinComentarios
  );
}

