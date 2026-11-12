import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  EstadoPersistenciaSistema,
  ModuloTemporalInfo,
  obtenerEstadoPersistenciaEnCache,
  obtenerEstadoPersistenciaSistema
} from '../../api/sistemaApi';

export const MENSAJE_DATOS_TEMPORALES =
  'Datos temporales: este módulo aún no guarda en la base de datos. La información se pierde al cerrar la aplicación.';

export function esEntornoAvisoPersistencia(estado: EstadoPersistenciaSistema | null): boolean {
  if (!estado) return false;
  return estado.modo === 'production' || estado.esEscritorio === true;
}

export function moduloTemporalParaVista(
  vistaMenuId: string | null | undefined,
  estado: EstadoPersistenciaSistema | null
): ModuloTemporalInfo | null {
  if (!vistaMenuId || !esEntornoAvisoPersistencia(estado) || !estado) {
    return null;
  }
  return estado.modulosTemporales.find((m) => m.vistasMenuIds.includes(vistaMenuId)) || null;
}

export function useEstadoPersistencia(): EstadoPersistenciaSistema | null {
  const [estado, setEstado] = useState<EstadoPersistenciaSistema | null>(() =>
    obtenerEstadoPersistenciaEnCache()
  );

  useEffect(() => {
    if (estado) return;
    let activo = true;
    obtenerEstadoPersistenciaSistema().then((data) => {
      if (activo && data) {
        setEstado(data);
      }
    });
    return () => {
      activo = false;
    };
  }, [estado]);

  return estado;
}

interface BannerPersistenciaTemporalProps {
  vistaMenuId: string | null | undefined;
  className?: string;
}

export const BannerPersistenciaTemporal: React.FC<BannerPersistenciaTemporalProps> = ({
  vistaMenuId,
  className = ''
}) => {
  const estado = useEstadoPersistencia();
  const moduloTemporal = moduloTemporalParaVista(vistaMenuId, estado);

  if (!moduloTemporal) {
    return null;
  }

  return (
    <div
      role="status"
      data-testid="banner-persistencia-temporal"
      data-modulo-temporal={moduloTemporal.id}
      className={`mb-2.5 px-3 py-2 bg-[#FEF3C7] border border-[#FCD34D] text-[#111827] text-xs flex items-center gap-2 ${className}`.trim()}
    >
      <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] shrink-0" strokeWidth={1.75} />
      <span>{MENSAJE_DATOS_TEMPORALES}</span>
    </div>
  );
};
