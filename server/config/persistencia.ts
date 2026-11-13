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
 * 
 * En FASE B: Todos los 18 servicios han migrado a PostgreSQL real (persistencia completa).
 */
export const MODULOS_SOLO_MEMORIA: ModuloSoloMemoria[] = [];

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

