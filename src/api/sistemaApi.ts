import { apiClient } from './client';

export interface ModuloTemporalInfo {
  id: string;
  nombreVisible: string;
  servicios: readonly string[];
  prefijosRuta: readonly string[];
  vistasMenuIds: readonly string[];
}

export interface EstadoPersistenciaSistema {
  modo: 'development' | 'production' | 'test';
  esEscritorio: boolean;
  persistenciaCompleta: boolean;
  bloqueo: {
    banderaSolicitada: boolean;
    activo: boolean;
    variable: 'ATLOB_BLOQUEAR_MEMORIA';
  };
  modulosTemporales: ModuloTemporalInfo[];
}

let cacheEstadoPersistencia: EstadoPersistenciaSistema | null = null;
let promesaEnCurso: Promise<EstadoPersistenciaSistema | null> | null = null;

export function limpiarCachePersistenciaSistema(): void {
  cacheEstadoPersistencia = null;
  promesaEnCurso = null;
}

export function obtenerEstadoPersistenciaEnCache(): EstadoPersistenciaSistema | null {
  return cacheEstadoPersistencia;
}

/**
 * Consulta una única vez por sesión autenticada el estado de persistencia del backend.
 */
export async function obtenerEstadoPersistenciaSistema(): Promise<EstadoPersistenciaSistema | null> {
  if (cacheEstadoPersistencia) {
    return cacheEstadoPersistencia;
  }
  if (!promesaEnCurso) {
    promesaEnCurso = (apiClient.get('/sistema/persistencia') as Promise<EstadoPersistenciaSistema>)
      .then((data) => {
        if (data && Array.isArray(data.modulosTemporales)) {
          cacheEstadoPersistencia = data;
          return data;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => {
        promesaEnCurso = null;
      });
  }
  return promesaEnCurso;
}
