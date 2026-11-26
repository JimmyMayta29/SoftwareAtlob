import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileCheck2,
  FileSpreadsheet,
  Link2,
  Search,
  Sparkles,
  Unlink,
  X,
} from 'lucide-react';
import {
  TIPOS_CLASIFICACION_EXTRACTO,
  type ConciliarManualGrupoInput,
  type EstadoConciliacionV2,
  type EstadoLibroV2,
  type GrupoConciliacionV2,
  type OrigenPartidaLibroV2,
  type PartidaExtractoV2,
  type PartidaLibroV2,
  type ResumenConciliacionV2,
  type TipoClasificacionExtracto,
} from '../../api/conciliacionV2Api';
import { VentanaModal } from '../ui/VentanaModal';
import {
  aCentavos,
  formatearCentavos,
  formatearMonedaExacta,
} from './conciliacionUtils';
import { useListaVirtualizada } from './useListaVirtualizada';

const UMBRAL_VIRTUALIZACION = 120;
const ALTURA_FILA_VIRTUALIZADA_PX = 46;
const FILAS_ESQUELETO = 6;

export type FiltroEstadoDual = 'TODOS' | 'PENDIENTES' | 'SUGERIDOS' | 'CONCILIADOS';

interface LibroItemUnificado extends PartidaLibroV2 {
  origenEfectivo: OrigenPartidaLibroV2;
  claveCompuesta: string;
}

export interface PanelDualConciliacionProps {
  resumen: ResumenConciliacionV2 | null;
  grupos: GrupoConciliacionV2[];
  cargando: boolean;
  mensajeError: string | null;
  operacionesBloqueadas: boolean;
  motivoBloqueo?: string;
  puedeAprenderRegla?: boolean;
  hayModalAbierto: boolean;
  conciliandoManual: boolean;
  desconciliando: boolean;
  onConciliarManualGrupo: (
    payload: Omit<ConciliarManualGrupoInput, 'cuentaFinancieraId' | 'periodo'>
  ) => Promise<void>;
  onDesconciliarGrupo: (grupoId: string, motivo: string) => Promise<void>;
  onDesconciliarPartidaLegacy: (extractoLineaId: string, motivo: string) => Promise<void>;
  onAbrirAplicarCartera?: (linea: PartidaExtractoV2) => void;
  onAbrirGenerarAsiento?: (linea: PartidaExtractoV2) => void;
  onEjecutarMatching?: () => void | Promise<void>;
  puedeEjecutarMatching?: boolean;
  onReintentar?: () => void;
}

function claseBadgeEstadoExtracto(estado: EstadoConciliacionV2): string {
  switch (estado) {
    case 'CONCILIADO':
    case 'CONCILIADO_MANUAL':
      return 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]';
    case 'SUGERIDO':
      return 'bg-[#EFF6FF] text-[#1E3A5F] border-[#1E3A5F]';
    case 'DIFERENCIA_IMPORTE':
    case 'DUPLICADO':
      return 'bg-[#FEF2F2] text-[#B91C1C] border-[#B91C1C]';
    default:
      return 'bg-[#FEF3C7] text-[#B45309] border-[#B45309]';
  }
}

function claseBadgeEstadoLibro(estado: EstadoLibroV2, esSugerido: boolean): string {
  if (esSugerido && estado !== 'CONCILIADO') {
    return 'bg-[#EFF6FF] text-[#1E3A5F] border-[#1E3A5F]';
  }
  switch (estado) {
    case 'CONCILIADO':
      return 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]';
    case 'CHEQUE_NO_COBRADO':
    case 'PENDIENTE_BANCO':
    default:
      return 'bg-[#FEF3C7] text-[#B45309] border-[#B45309]';
  }
}

function tipoMatchTexto(cantBanco: number, cantLibros: number): string {
  if (cantBanco === 0 || cantLibros === 0) return '—';
  if (cantBanco === 1 && cantLibros === 1) return '1:1';
  if (cantBanco === 1 && cantLibros > 1) return `1:${cantLibros}`;
  if (cantBanco > 1 && cantLibros === 1) return `${cantBanco}:1`;
  return `${cantBanco}:${cantLibros} (N:M)`;
}

const FilasEsqueletoTabla: React.FC = () => (
  <>
    {Array.from({ length: FILAS_ESQUELETO }, (_, idx) => (
      <tr key={`skeleton-${idx}`} className={idx % 2 === 0 ? 'bg-[#FFFFFF]' : 'bg-[#F5F7FA]'}>
        <td className="text-center">
          <div className="w-3.5 h-3.5 mx-auto bg-[#E5E7EB] animate-pulse" />
        </td>
        <td>
          <div className="h-3 w-16 bg-[#E5E7EB] animate-pulse" />
        </td>
        <td>
          <div className="space-y-1 py-0.5">
            <div className="h-3 w-3/4 bg-[#E5E7EB] animate-pulse" />
            <div className="h-2.5 w-1/2 bg-[#F3F4F6] animate-pulse" />
          </div>
        </td>
        <td>
          <div className="h-4 w-20 bg-[#E5E7EB] animate-pulse" />
        </td>
        <td className="text-right">
          <div className="h-3 w-16 ml-auto bg-[#E5E7EB] animate-pulse" />
        </td>
        <td className="text-center">
          <div className="h-5 w-16 mx-auto bg-[#F3F4F6] animate-pulse" />
        </td>
      </tr>
    ))}
  </>
);

interface EstadoErrorTablaProps {
  mensaje: string;
  onReintentar?: () => void;
}

const EstadoErrorTabla: React.FC<EstadoErrorTablaProps> = ({ mensaje, onReintentar }) => (
  <tr>
    <td colSpan={6} className="text-center py-4 px-3">
      <div
        role="alert"
        className="inline-flex flex-wrap items-center justify-center gap-2.5 text-[#B91C1C] font-bold text-[12px]"
      >
        <span>{mensaje}</span>
        {onReintentar && (
          <button
            type="button"
            onClick={onReintentar}
            aria-label="Reintentar carga de conciliación"
            className="h-6 px-2.5 bg-[#FFFFFF] hover:bg-[#FEF2F2] text-[#B91C1C] border border-[#B91C1C] text-[11px] font-bold cursor-pointer rounded-none focus-visible:outline-2 focus-visible:outline-[#1E3A5F]"
          >
            Reintentar
          </button>
        )}
      </div>
    </td>
  </tr>
);

export const PanelDualConciliacion: React.FC<PanelDualConciliacionProps> = ({
  resumen,
  grupos,
  cargando,
  mensajeError,
  operacionesBloqueadas,
  motivoBloqueo,
  puedeAprenderRegla = false,
  hayModalAbierto,
  conciliandoManual,
  desconciliando,
  onConciliarManualGrupo,
  onDesconciliarGrupo,
  onDesconciliarPartidaLegacy,
  onAbrirAplicarCartera,
  onAbrirGenerarAsiento,
  onEjecutarMatching,
  puedeEjecutarMatching = false,
  onReintentar,
}) => {
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstadoDual>('TODOS');
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [textoBusquedaDebounced, setTextoBusquedaDebounced] = useState('');
  const busquedaInputRef = useRef<HTMLInputElement | null>(null);
  const extractoContainerRef = useRef<HTMLDivElement | null>(null);
  const librosContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (textoBusqueda === '') {
      setTextoBusquedaDebounced('');
      return;
    }
    const timer = window.setTimeout(() => {
      setTextoBusquedaDebounced(textoBusqueda);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [textoBusqueda]);

  // Selección múltiple
  const [extractoSeleccionadoIds, setExtractoSeleccionadoIds] = useState<string[]>([]);
  const [librosSeleccionadosKeys, setLibrosSeleccionadosKeys] = useState<string[]>([]);
  const [observacionManual, setObservacionManual] = useState('');

  // Opción "Recordar regla para esta contraparte"
  const [recordarRegla, setRecordarRegla] = useState(false);
  const [patronRegla, setPatronRegla] = useState('');
  const [rucRegla, setRucRegla] = useState('');
  const [tipoClasifRegla, setTipoClasifRegla] = useState<TipoClasificacionExtracto | ''>('');
  const patronAutollenadoRef = useRef<boolean>(false);
  const extractoInicialRef = useRef<string>('');
  const libroInicialRef = useRef<string>('');

  // Modal desconciliar (motivo >= 5 chars)
  const [desconciliarObjetivo, setDesconciliarObjetivo] = useState<{
    grupoId: string | null;
    extractoLineaId: string | null;
    descripcion: string;
  } | null>(null);
  const [motivoDesconciliar, setMotivoDesconciliar] = useState('');

  const moneda = resumen?.cuenta.moneda ?? 'PEN';
  const toleranciaCentavos = aCentavos(resumen?.toleranciaMonto ?? '0.00');

  // Unificar movimientos de tesorería + asientos manuales 104x
  const librosUnificados: LibroItemUnificado[] = useMemo(() => {
    if (!resumen) return [];
    const movs: LibroItemUnificado[] = (resumen.movimientosLibros ?? []).map((m) => {
      const origen: OrigenPartidaLibroV2 = m.origen ?? 'MOVIMIENTO_TESORERIA';
      return {
        ...m,
        origenEfectivo: origen,
        claveCompuesta: `${origen}:${m.id}`,
      };
    });
    const asientos: LibroItemUnificado[] = (resumen.asientosManualesLibros ?? []).map((a) => {
      const origen: OrigenPartidaLibroV2 = a.origen ?? 'ASIENTO_MANUAL';
      return {
        ...a,
        origenEfectivo: origen,
        claveCompuesta: `${origen}:${a.id}`,
      };
    });
    // Evitar duplicados por claveCompuesta si backend incluyera ambos
    const vistos = new Set<string>();
    const combinado: LibroItemUnificado[] = [];
    for (const item of [...movs, ...asientos]) {
      if (!vistos.has(item.claveCompuesta)) {
        vistos.add(item.claveCompuesta);
        combinado.push(item);
      }
    }
    return combinado;
  }, [resumen]);

  // Mapas auxiliares de grupos (para saber si un libro está SUGERIDO y resolver grupoId)
  const { grupoPorId, grupoPorExtractoId, grupoPorLibroKey, librosSugeridosKeys } = useMemo(() => {
    const porId = new Map<string, GrupoConciliacionV2>();
    const porExtracto = new Map<string, GrupoConciliacionV2>();
    const porLibro = new Map<string, GrupoConciliacionV2>();
    const sugeridosLib = new Set<string>();

    for (const g of grupos) {
      porId.set(g.id, g);
      if (g.estado === 'RECHAZADO' || g.estado === 'DESCONCILIADO') continue;

      for (const ib of g.itemsBanco) {
        if (ib.extractoLineaId && !porExtracto.has(ib.extractoLineaId)) {
          porExtracto.set(ib.extractoLineaId, g);
        }
      }
      for (const il of g.itemsLibro) {
        const origen: OrigenPartidaLibroV2 = il.origenLibro ?? 'MOVIMIENTO_TESORERIA';
        const refId =
          origen === 'ASIENTO_MANUAL'
            ? il.asientoDetalleId || il.asientoId
            : il.movimientoTesoreriaId || il.asientoDetalleId;
        if (refId) {
          const clave = `${origen}:${refId}`;
          if (!porLibro.has(clave)) {
            porLibro.set(clave, g);
          }
          if (g.estado === 'SUGERIDO') {
            sugeridosLib.add(clave);
          }
        }
      }
    }
    return {
      grupoPorId: porId,
      grupoPorExtractoId: porExtracto,
      grupoPorLibroKey: porLibro,
      librosSugeridosKeys: sugeridosLib,
    };
  }, [grupos]);

  // Limpiar selecciones huérfanas cuando cambia el resumen
  useEffect(() => {
    const extractoDisp = new Set(
      (resumen?.extractoLineas ?? [])
        .filter((l) => !l.conciliada && l.estadoConciliacion !== 'DUPLICADO')
        .map((l) => l.id)
    );
    setExtractoSeleccionadoIds((prev) => prev.filter((id) => extractoDisp.has(id)));

    const librosDisp = new Set(
      librosUnificados
        .filter((m) => !m.conciliado && m.estado !== 'ANULADO')
        .map((m) => m.claveCompuesta)
    );
    setLibrosSeleccionadosKeys((prev) => prev.filter((k) => librosDisp.has(k)));
  }, [resumen?.extractoLineas, librosUnificados]);

  // Si pierde permiso para aprender reglas, desactivar checkbox
  useEffect(() => {
    if (!puedeAprenderRegla && recordarRegla) {
      setRecordarRegla(false);
    }
  }, [puedeAprenderRegla, recordarRegla]);

  // Pre-rellenar regla sugerida al marcar "Recordar regla" sin sobreescribir edición manual
  useEffect(() => {
    if (!recordarRegla || !puedeAprenderRegla) {
      patronAutollenadoRef.current = false;
      extractoInicialRef.current = '';
      libroInicialRef.current = '';
      return;
    }

    const extractoInicial = extractoSeleccionadoIds[0] ?? '';
    const libroInicial = librosSeleccionadosKeys[0] ?? '';

    if (extractoInicialRef.current !== extractoInicial) {
      patronAutollenadoRef.current = false;
      extractoInicialRef.current = extractoInicial;
    }

    if (!patronAutollenadoRef.current && extractoInicial) {
      const primera = (resumen?.extractoLineas ?? []).find((l) => l.id === extractoInicial);
      if (primera) {
        const patronSugerido = (primera.contraparteExtraida || primera.descripcion || '')
          .slice(0, 120)
          .trim();
        if (patronSugerido) {
          setPatronRegla((prev) => (prev.trim() ? prev : patronSugerido));
        }
        if (primera.rucExtraido) {
          const rucExtraido = primera.rucExtraido;
          setRucRegla((prev) => prev || rucExtraido);
        }
        if (primera.tipoClasificacion) {
          const tipoExtraido = primera.tipoClasificacion;
          setTipoClasifRegla((prev) => prev || tipoExtraido);
        }
        patronAutollenadoRef.current = true;
      }
    }

    if (!libroInicial) {
      libroInicialRef.current = '';
    } else if (libroInicialRef.current !== libroInicial) {
      libroInicialRef.current = libroInicial;
      const primerLibro = librosUnificados.find((m) => m.claveCompuesta === libroInicial);
      if (primerLibro?.anexoRuc) {
        const anexoRuc = primerLibro.anexoRuc;
        setRucRegla((prev) => prev || anexoRuc);
      }
    }
  }, [
    recordarRegla,
    puedeAprenderRegla,
    extractoSeleccionadoIds,
    librosSeleccionadosKeys,
    resumen?.extractoLineas,
    librosUnificados,
  ]);

  // Conteos y progreso
  const totalExtracto = resumen?.conteos.totalExtracto ?? 0;
  const conciliadasExtracto = resumen?.conteos.conciliadasExtracto ?? 0;
  const porcentajeProgreso =
    totalExtracto > 0 ? Math.min(100, Math.round((conciliadasExtracto / totalExtracto) * 100)) : 0;

  // Filtrado de ambos paneles (usando término debounced)
  const extractoFiltrado = useMemo(() => {
    const lineas = resumen?.extractoLineas ?? [];
    const q = textoBusquedaDebounced.trim().toLowerCase();
    return lineas.filter((l) => {
      if (filtroEstado === 'CONCILIADOS' && !l.conciliada) return false;
      if (filtroEstado === 'SUGERIDOS' && l.estadoConciliacion !== 'SUGERIDO') return false;
      if (
        filtroEstado === 'PENDIENTES' &&
        (l.conciliada || l.estadoConciliacion === 'SUGERIDO')
      ) {
        return false;
      }
      if (!q) return true;
      return (
        l.descripcion.toLowerCase().includes(q) ||
        (l.referencia ?? '').toLowerCase().includes(q) ||
        (l.rucExtraido ?? '').toLowerCase().includes(q) ||
        (l.docExtraido ?? '').toLowerCase().includes(q) ||
        (l.contraparteExtraida ?? '').toLowerCase().includes(q) ||
        l.fecha.includes(q) ||
        l.monto.includes(q)
      );
    });
  }, [resumen?.extractoLineas, filtroEstado, textoBusquedaDebounced]);

  const librosFiltrado = useMemo(() => {
    const q = textoBusquedaDebounced.trim().toLowerCase();
    return librosUnificados.filter((m) => {
      const esSugerido = !m.conciliado && librosSugeridosKeys.has(m.claveCompuesta);
      if (filtroEstado === 'CONCILIADOS' && !m.conciliado) return false;
      if (filtroEstado === 'SUGERIDOS' && !esSugerido) return false;
      if (filtroEstado === 'PENDIENTES' && (m.conciliado || esSugerido)) return false;
      if (!q) return true;
      return (
        m.glosa.toLowerCase().includes(q) ||
        (m.numeroOperacion ?? '').toLowerCase().includes(q) ||
        (m.docRef ?? '').toLowerCase().includes(q) ||
        (m.anexoNombre ?? '').toLowerCase().includes(q) ||
        (m.anexoRuc ?? '').toLowerCase().includes(q) ||
        m.fecha.includes(q) ||
        m.importeConSigno.includes(q) ||
        m.importe.includes(q)
      );
    });
  }, [librosUnificados, librosSugeridosKeys, filtroEstado, textoBusquedaDebounced]);

  // Virtualización ligera para listas grandes (> 120 filas)
  const extractoVirt = useListaVirtualizada({
    items: extractoFiltrado,
    rowHeightPx: ALTURA_FILA_VIRTUALIZADA_PX,
    containerRef: extractoContainerRef,
    overscan: 10,
    enabled: extractoFiltrado.length > UMBRAL_VIRTUALIZACION,
  });

  const librosVirt = useListaVirtualizada({
    items: librosFiltrado,
    rowHeightPx: ALTURA_FILA_VIRTUALIZADA_PX,
    containerRef: librosContainerRef,
    overscan: 10,
    enabled: librosFiltrado.length > UMBRAL_VIRTUALIZACION,
  });

  const resetScrollExtracto = extractoVirt.resetScroll;
  const resetScrollLibros = librosVirt.resetScroll;

  useEffect(() => {
    resetScrollExtracto();
    resetScrollLibros();
  }, [filtroEstado, textoBusquedaDebounced, resetScrollExtracto, resetScrollLibros]);

  // Conjuntos O(1) para verificar selección por fila
  const extractoSeleccionadoSet = useMemo(
    () => new Set(extractoSeleccionadoIds),
    [extractoSeleccionadoIds]
  );

  const librosSeleccionadosSet = useMemo(
    () => new Set(librosSeleccionadosKeys),
    [librosSeleccionadosKeys]
  );

  // Cálculos exactos en centavos enteros para la barra de cuadre en vivo
  const extractoSeleccionados = useMemo(
    () =>
      (resumen?.extractoLineas ?? []).filter((l) =>
        extractoSeleccionadoSet.has(l.id)
      ),
    [resumen?.extractoLineas, extractoSeleccionadoSet]
  );

  const librosSeleccionados = useMemo(
    () =>
      librosUnificados.filter((m) =>
        librosSeleccionadosSet.has(m.claveCompuesta)
      ),
    [librosUnificados, librosSeleccionadosSet]
  );

  const totalBancoCentavos = useMemo(
    () => extractoSeleccionados.reduce((acc, item) => acc + aCentavos(item.monto), 0),
    [extractoSeleccionados]
  );

  const totalLibrosCentavos = useMemo(
    () =>
      librosSeleccionados.reduce(
        (acc, item) => acc + aCentavos(item.importeConSigno),
        0
      ),
    [librosSeleccionados]
  );

  const diferenciaCentavos = totalBancoCentavos - totalLibrosCentavos;
  const tieneSeleccionAmbosLados =
    extractoSeleccionados.length > 0 && librosSeleccionados.length > 0;
  const dentroTolerancia =
    tieneSeleccionAmbosLados && Math.abs(diferenciaCentavos) <= toleranciaCentavos;

  const puedeConfirmarSeleccion =
    !operacionesBloqueadas &&
    !conciliandoManual &&
    !desconciliando &&
    tieneSeleccionAmbosLados &&
    (!puedeAprenderRegla || !recordarRegla || patronRegla.trim().length >= 2);

  const toggleExtracto = (id: string) => {
    setExtractoSeleccionadoIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleLibro = (claveCompuesta: string) => {
    setLibrosSeleccionadosKeys((prev) =>
      prev.includes(claveCompuesta)
        ? prev.filter((item) => item !== claveCompuesta)
        : [...prev, claveCompuesta]
    );
  };

  const limpiarSeleccion = useCallback(() => {
    setExtractoSeleccionadoIds([]);
    setLibrosSeleccionadosKeys([]);
    setObservacionManual('');
    setRecordarRegla(false);
    setPatronRegla('');
    setRucRegla('');
    setTipoClasifRegla('');
  }, []);

  const handleConciliarSeleccion = useCallback(async () => {
    if (!puedeConfirmarSeleccion) return;

    const payload: Omit<ConciliarManualGrupoInput, 'cuentaFinancieraId' | 'periodo'> = {
      extractoLineaIds: extractoSeleccionados.map((l) => l.id),
      libroItems: librosSeleccionados.map((m) => ({
        origenLibro: m.origenEfectivo,
        id: m.id,
      })),
      observacion: observacionManual.trim() ? observacionManual.trim() : null,
      aprenderRegla:
        puedeAprenderRegla && recordarRegla
          ? {
              patronContraparte: patronRegla.trim(),
              rucContraparte: rucRegla.trim() ? rucRegla.trim() : null,
              tipoClasificacion: tipoClasifRegla || null,
            }
          : null,
    };

    await onConciliarManualGrupo(payload);
    limpiarSeleccion();
  }, [
    puedeConfirmarSeleccion,
    puedeAprenderRegla,
    extractoSeleccionados,
    librosSeleccionados,
    observacionManual,
    recordarRegla,
    patronRegla,
    rucRegla,
    tipoClasifRegla,
    onConciliarManualGrupo,
    limpiarSeleccion,
  ]);

  // Atajos de teclado: / Buscar, Esc Limpiar, Alt+M Matching, Enter Conciliar
  useEffect(() => {
    if (hayModalAbierto || Boolean(desconciliarObjetivo)) {
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const activo = document.activeElement as HTMLElement | null;
      const tag = activo?.tagName?.toUpperCase() ?? '';
      const esCampoEdicion =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        Boolean(activo?.isContentEditable);

      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (esCampoEdicion) return;
        e.preventDefault();
        busquedaInputRef.current?.focus();
        busquedaInputRef.current?.select();
        return;
      }

      if (e.key === 'Escape') {
        if (activo === busquedaInputRef.current && textoBusqueda !== '') {
          e.preventDefault();
          setTextoBusqueda('');
          return;
        }
        if (extractoSeleccionadoIds.length > 0 || librosSeleccionadosKeys.length > 0) {
          e.preventDefault();
          limpiarSeleccion();
        }
        return;
      }

      if (e.altKey && (e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey) {
        if (puedeEjecutarMatching && onEjecutarMatching) {
          e.preventDefault();
          void onEjecutarMatching();
        }
        return;
      }

      if (e.key === 'Enter' && puedeConfirmarSeleccion) {
        if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') {
          return;
        }
        if (tag === 'INPUT') {
          const inputType = (activo as HTMLInputElement).type?.toLowerCase();
          if (inputType !== 'checkbox') return;
        }
        e.preventDefault();
        void handleConciliarSeleccion();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    hayModalAbierto,
    desconciliarObjetivo,
    textoBusqueda,
    extractoSeleccionadoIds.length,
    librosSeleccionadosKeys.length,
    limpiarSeleccion,
    puedeEjecutarMatching,
    onEjecutarMatching,
    puedeConfirmarSeleccion,
    handleConciliarSeleccion,
  ]);

  const abrirModalDesconciliarExtracto = (linea: PartidaExtractoV2) => {
    const grupoId =
      linea.grupoConciliacionId ?? grupoPorExtractoId.get(linea.id)?.id ?? null;
    setDesconciliarObjetivo({
      grupoId,
      extractoLineaId: linea.id,
      descripcion: `${linea.fecha} · ${linea.descripcion} (${formatearMonedaExacta(
        linea.monto,
        moneda
      )})`,
    });
    setMotivoDesconciliar('');
  };

  const abrirModalDesconciliarLibro = (libro: LibroItemUnificado) => {
    const grupoId =
      libro.grupoConciliacionId ?? grupoPorLibroKey.get(libro.claveCompuesta)?.id ?? null;
    if (!grupoId) return;
    setDesconciliarObjetivo({
      grupoId,
      extractoLineaId: null,
      descripcion: `${libro.fecha} · ${libro.glosa} (${formatearMonedaExacta(
        libro.importeConSigno,
        moneda
      )})`,
    });
    setMotivoDesconciliar('');
  };

  const handleConfirmarDesconciliar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desconciliarObjetivo || motivoDesconciliar.trim().length < 5) return;
    const motivo = motivoDesconciliar.trim();
    if (desconciliarObjetivo.grupoId) {
      await onDesconciliarGrupo(desconciliarObjetivo.grupoId, motivo);
    } else if (desconciliarObjetivo.extractoLineaId) {
      await onDesconciliarPartidaLegacy(desconciliarObjetivo.extractoLineaId, motivo);
    }
    setDesconciliarObjetivo(null);
    setMotivoDesconciliar('');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 px-3 pb-3 gap-2">
      {/* Barra superior: Progreso visual + Filtros por estado + Búsqueda */}
      <div className="p-2 bg-[#F5F7FA] border border-[#D1D5DB] flex flex-wrap items-center justify-between gap-2.5 text-[12px]">
        {/* Progreso visual */}
        <div
          role="status"
          aria-live="polite"
          aria-label={`Progreso de conciliación: ${conciliadasExtracto} de ${totalExtracto} partidas (${porcentajeProgreso}%)`}
          className="flex items-center gap-2.5 min-w-[240px]"
        >
          <div className="text-[11px] font-bold text-[#1E3A5F] whitespace-nowrap">
            Progreso conciliación:
          </div>
          <div
            role="progressbar"
            aria-valuenow={porcentajeProgreso}
            aria-valuemin={0}
            aria-valuemax={100}
            className="w-36 h-2.5 bg-[#E5E7EB] border border-[#D1D5DB] overflow-hidden"
          >
            <div
              className={`h-full transition-all ${
                porcentajeProgreso === 100 ? 'bg-[#1E6F42]' : 'bg-[#1E3A5F]'
              }`}
              style={{ width: `${porcentajeProgreso}%` }}
            />
          </div>
          <span className="font-mono text-[11px] font-bold text-[#111827] whitespace-nowrap">
            {conciliadasExtracto}/{totalExtracto} ({porcentajeProgreso}%)
          </span>
        </div>

        {/* Filtros de estado */}
        <div
          role="group"
          aria-label="Filtrar partidas por estado"
          className="flex flex-wrap items-center gap-1"
        >
          {(['TODOS', 'PENDIENTES', 'SUGERIDOS', 'CONCILIADOS'] as FiltroEstadoDual[]).map(
            (est) => (
              <button
                key={est}
                type="button"
                aria-pressed={filtroEstado === est}
                aria-label={`Filtrar por ${est.toLowerCase()}`}
                onClick={() => setFiltroEstado(est)}
                className={`h-6 px-2.5 text-[11px] border cursor-pointer rounded-none focus-visible:outline-2 focus-visible:outline-[#1E3A5F] ${
                  filtroEstado === est
                    ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F] font-bold'
                    : 'bg-[#FFFFFF] text-[#111827] border-[#D1D5DB] hover:bg-[#E8ECF1]'
                }`}
              >
                {est}
              </button>
            )
          )}
        </div>

        {/* Búsqueda por texto / referencia / monto */}
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-2 pointer-events-none" />
          <input
            ref={busquedaInputRef}
            type="text"
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
            aria-label="Buscar partidas por glosa, referencia, RUC o monto"
            placeholder="Buscar glosa, referencia, RUC o monto... (/)"
            className="h-7 pl-7 pr-6 w-72 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] focus:outline-none focus:border-[#1E3A5F] focus-visible:outline-2 focus-visible:outline-[#1E3A5F] rounded-none"
          />
          {textoBusqueda && (
            <button
              type="button"
              onClick={() => setTextoBusqueda('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-1.5 text-[#6B7280] hover:text-[#111827] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1E3A5F]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Barra de cuadre en vivo (Sticky/Cabecera de selección múltiple) */}
      <div
        role="status"
        aria-live="polite"
        aria-label="Resumen de selección y cuadre en vivo"
        className={`p-2 border transition-colors ${
          tieneSeleccionAmbosLados
            ? dentroTolerancia
              ? 'bg-[#ECFDF5] border-[#1E6F42]'
              : 'bg-[#FEF3C7] border-[#B45309]'
            : 'bg-[#FFFFFF] border-[#D1D5DB]'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <span className="text-[11px] text-[#4B5563]">Total Banco selec.: </span>
              <span className="font-mono font-bold text-[#111827]">
                {formatearCentavos(totalBancoCentavos, moneda)}
              </span>{' '}
              <span className="text-[10px] text-[#4B5563] font-mono">
                ({extractoSeleccionados.length})
              </span>
            </div>

            <div>
              <span className="text-[11px] text-[#4B5563]">Total Libros selec.: </span>
              <span className="font-mono font-bold text-[#1E3A5F]">
                {formatearCentavos(totalLibrosCentavos, moneda)}
              </span>{' '}
              <span className="text-[10px] text-[#4B5563] font-mono">
                ({librosSeleccionados.length})
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[#4B5563]">Diferencia en vivo:</span>
              <span
                className={`px-1.5 py-0.5 font-mono font-bold border text-[11px] ${
                  !tieneSeleccionAmbosLados
                    ? 'bg-[#F5F7FA] text-[#4B5563] border-[#D1D5DB]'
                    : dentroTolerancia
                    ? 'bg-[#FFFFFF] text-[#1E6F42] border-[#1E6F42]'
                    : 'bg-[#FEF2F2] text-[#B91C1C] border-[#B91C1C]'
                }`}
              >
                {formatearCentavos(diferenciaCentavos, moneda)}
              </span>
              {tieneSeleccionAmbosLados && (
                <span className="px-1.5 py-0.5 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-[10px] font-bold text-[#1E3A5F]">
                  {tipoMatchTexto(extractoSeleccionados.length, librosSeleccionados.length)}
                </span>
              )}
              {tieneSeleccionAmbosLados && dentroTolerancia && (
                <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-[#1E6F42]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Cuadrado</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(extractoSeleccionados.length > 0 || librosSeleccionados.length > 0) && (
              <>
                {puedeAprenderRegla && (
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-[#111827] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recordarRegla}
                      disabled={operacionesBloqueadas || conciliandoManual}
                      onChange={(e) => setRecordarRegla(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#1E3A5F] focus-visible:outline-2 focus-visible:outline-[#1E3A5F]"
                    />
                    <Sparkles className="w-3 h-3 text-[#1E3A5F]" />
                    <span>Recordar regla para esta contraparte</span>
                  </label>
                )}

                <button
                  type="button"
                  onClick={limpiarSeleccion}
                  disabled={conciliandoManual}
                  aria-label="Limpiar selección actual"
                  className="h-7 px-2 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#374151] border border-[#D1D5DB] text-[11px] cursor-pointer rounded-none focus-visible:outline-2 focus-visible:outline-[#1E3A5F]"
                >
                  Limpiar
                </button>
              </>
            )}

            <button
              type="button"
              disabled={!puedeConfirmarSeleccion}
              onClick={() => void handleConciliarSeleccion()}
              aria-label="Conciliar partidas seleccionadas"
              title={
                operacionesBloqueadas
                  ? motivoBloqueo
                  : !tieneSeleccionAmbosLados
                  ? 'Seleccione al menos 1 partida de Extracto y 1 de Libros'
                  : 'Conciliar selección [Enter]'
              }
              className="h-7 px-3 bg-[#1E3A5F] hover:bg-[#162C49] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-[#FFFFFF] border border-[#1E3A5F] disabled:border-[#D1D5DB] text-[12px] font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed rounded-none focus-visible:outline-2 focus-visible:outline-[#1E3A5F]"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>
                {conciliandoManual ? 'Conciliando...' : 'Conciliar Selección [Enter]'}
              </span>
            </button>
          </div>
        </div>

        {/* Inputs opcionales cuando hay selección en ambos lados */}
        {tieneSeleccionAmbosLados && (
          <div className="mt-2 pt-2 border-t border-[#D1D5DB]/70 flex flex-wrap items-center gap-2 text-[11px]">
            <input
              type="text"
              maxLength={300}
              value={observacionManual}
              onChange={(e) => setObservacionManual(e.target.value)}
              aria-label="Observación opcional de conciliación manual"
              placeholder="Observación opcional de conciliación manual..."
              className="h-6 px-2 flex-1 min-w-[200px] bg-[#FFFFFF] border border-[#D1D5DB] text-[11px] focus:outline-none focus:border-[#1E3A5F] focus-visible:outline-2 focus-visible:outline-[#1E3A5F] rounded-none"
            />
            {puedeAprenderRegla && recordarRegla && (
              <>
                <input
                  type="text"
                  maxLength={150}
                  value={patronRegla}
                  onChange={(e) => setPatronRegla(e.target.value)}
                  aria-label="Patrón de contraparte para regla automática"
                  placeholder="Patrón contraparte * (mín. 2 car.)"
                  className="h-6 px-2 w-56 bg-[#FFFFFF] border border-[#1E3A5F] text-[11px] focus:outline-none focus-visible:outline-2 focus-visible:outline-[#1E3A5F] rounded-none"
                />
                <input
                  type="text"
                  maxLength={11}
                  value={rucRegla}
                  onChange={(e) => setRucRegla(e.target.value)}
                  aria-label="RUC opcional de contraparte"
                  placeholder="RUC (opcional)"
                  className="h-6 px-2 w-28 bg-[#FFFFFF] border border-[#D1D5DB] text-[11px] font-mono focus:outline-none focus:border-[#1E3A5F] focus-visible:outline-2 focus-visible:outline-[#1E3A5F] rounded-none"
                />
                <select
                  value={tipoClasifRegla}
                  aria-label="Tipo de clasificación opcional"
                  onChange={(e) =>
                    setTipoClasifRegla(e.target.value as TipoClasificacionExtracto | '')
                  }
                  className="h-6 px-1.5 bg-[#FFFFFF] border border-[#D1D5DB] text-[11px] focus:outline-none focus:border-[#1E3A5F] focus-visible:outline-2 focus-visible:outline-[#1E3A5F] rounded-none"
                >
                  <option value="">Clasificación (opc.)</option>
                  {TIPOS_CLASIFICACION_EXTRACTO.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        )}
      </div>

      {/* Tira informativa discreta de atajos de teclado */}
      <div
        aria-label="Atajos de teclado disponibles"
        className="px-2 py-1 bg-[#F5F7FA] border border-[#D1D5DB] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#4B5563]"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-[#1E3A5F]">Atajos:</span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1 py-0 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-[10px] font-bold text-[#1E3A5F] rounded-none">
              /
            </kbd>
            <span>Buscar</span>
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1 py-0 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-[10px] font-bold text-[#1E3A5F] rounded-none">
              Esc
            </kbd>
            <span>Limpiar</span>
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1 py-0 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-[10px] font-bold text-[#1E3A5F] rounded-none">
              Enter
            </kbd>
            <span>Conciliar</span>
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1 py-0 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-[10px] font-bold text-[#1E3A5F] rounded-none">
              Alt+M
            </kbd>
            <span>Matching</span>
          </span>
        </div>
        {(extractoVirt.isVirtualized || librosVirt.isVirtualized) && (
          <span className="font-mono text-[10px] text-[#4B5563]">
            Modo alto rendimiento activo
          </span>
        )}
      </div>

      {/* Panel dividido lado a lado */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-2 gap-2.5">
        {/* IZQUIERDA: EXTRACTO BANCARIO */}
        <div
          role="region"
          aria-label="Extracto Bancario"
          className="flex flex-col min-h-[280px] border border-[#D1D5DB] bg-[#FFFFFF]"
        >
          <div className="px-2.5 py-1.5 bg-[#1E3A5F] text-[#FFFFFF] flex items-center justify-between text-[12px]">
            <span className="font-bold">Extracto Bancario</span>
            <span className="font-mono text-[11px] text-[#E8ECF1]">
              {extractoFiltrado.length} de {resumen?.extractoLineas.length ?? 0} partidas
            </span>
          </div>

          <div ref={extractoContainerRef} className="flex-1 overflow-auto">
            <table
              aria-label="Tabla de partidas del extracto bancario"
              className={`tabla-densa ${
                extractoVirt.isVirtualized ? 'table-fixed min-w-[640px]' : ''
              }`}
            >
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="w-7 text-center">Sel</th>
                  <th className="w-20 text-left">Fecha</th>
                  <th className="text-left">Descripción / Referencia</th>
                  <th className="w-28 text-left">Estado</th>
                  <th className="w-24 text-right tabular-nums">Monto ({moneda})</th>
                  <th className="w-40 text-center">Acción</th>
                </tr>
              </thead>
              <tbody aria-busy={cargando ? 'true' : undefined}>
                {cargando ? (
                  <FilasEsqueletoTabla />
                ) : mensajeError ? (
                  <EstadoErrorTabla mensaje={mensajeError} onReintentar={onReintentar} />
                ) : extractoFiltrado.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 px-3 text-[#4B5563]">
                      <div className="flex flex-col items-center gap-1.5">
                        <span>
                          {resumen && !resumen.tieneExtracto
                            ? 'No existe extracto bancario importado en este período.'
                            : 'Sin partidas de extracto para el filtro o búsqueda actual.'}
                        </span>
                        {(filtroEstado !== 'TODOS' || textoBusquedaDebounced.trim().length > 0) && (
                          <button
                            type="button"
                            onClick={() => {
                              setFiltroEstado('TODOS');
                              setTextoBusqueda('');
                            }}
                            className="h-6 px-2.5 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#1E3A5F] border border-[#D1D5DB] text-[11px] cursor-pointer rounded-none focus-visible:outline-2 focus-visible:outline-[#1E3A5F]"
                          >
                            Restablecer filtros
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  <>
                    {extractoVirt.paddingTopPx > 0 && (
                      <tr aria-hidden="true">
                        <td
                          colSpan={6}
                          style={{
                            height: `${extractoVirt.paddingTopPx}px`,
                            padding: 0,
                            border: 0,
                          }}
                        />
                      </tr>
                    )}
                    {extractoVirt.visibleItems.map((l, localIdx) => {
                      const idx = extractoVirt.startIndex + localIdx;
                      const seleccionada = extractoSeleccionadoSet.has(l.id);
                      const seleccionable =
                        !operacionesBloqueadas &&
                        !l.conciliada &&
                        l.estadoConciliacion !== 'DUPLICADO';
                      const montoNeg = aCentavos(l.monto) < 0;
                      const grupo = l.grupoConciliacionId
                        ? grupoPorId.get(l.grupoConciliacionId)
                        : grupoPorExtractoId.get(l.id);

                      return (
                        <tr
                          key={l.id}
                          style={
                            extractoVirt.isVirtualized
                              ? { height: `${ALTURA_FILA_VIRTUALIZADA_PX}px` }
                              : undefined
                          }
                          onClick={() => {
                            if (seleccionable) toggleExtracto(l.id);
                          }}
                          className={`${
                            seleccionada
                              ? 'bg-[#DBEAFE] text-[#111827]'
                              : idx % 2 === 0
                              ? 'bg-[#FFFFFF] hover:bg-[#E8ECF1]'
                              : 'bg-[#F5F7FA] hover:bg-[#E8ECF1]'
                          } ${seleccionable ? 'cursor-pointer' : ''}`}
                        >
                          <td
                            className="text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              aria-label={`Seleccionar extracto ${l.descripcion}`}
                              checked={seleccionada}
                              disabled={!seleccionable}
                              onChange={() => toggleExtracto(l.id)}
                              className="w-3.5 h-3.5 accent-[#1E3A5F] cursor-pointer disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#1E3A5F]"
                            />
                          </td>
                          <td className="font-mono text-[11px] whitespace-nowrap">{l.fecha}</td>
                          <td>
                            <div
                              className={
                                extractoVirt.isVirtualized
                                  ? 'max-h-[40px] overflow-hidden'
                                  : undefined
                              }
                            >
                              <div
                                title={l.descripcion}
                                className={`text-[11px] text-[#111827] leading-tight ${
                                  extractoVirt.isVirtualized ? 'truncate' : ''
                                }`}
                              >
                                {l.descripcion}
                              </div>
                              <div
                                className={`flex items-center gap-1.5 mt-0.5 text-[10px] ${
                                  extractoVirt.isVirtualized
                                    ? 'overflow-hidden whitespace-nowrap'
                                    : 'flex-wrap'
                                }`}
                              >
                                {l.referencia && (
                                  <span className="font-mono text-[#1E3A5F]">
                                    Ref: {l.referencia}
                                  </span>
                                )}
                                {l.tipoClasificacion && (
                                  <span className="px-1 py-0 bg-[#F3F4F6] text-[#374151] border border-[#D1D5DB] font-bold">
                                    {l.tipoClasificacion}
                                  </span>
                                )}
                                {l.rucExtraido && (
                                  <span className="font-mono text-[#4B5563]">
                                    RUC {l.rucExtraido}
                                  </span>
                                )}
                                {grupo && (
                                  <span className="px-1 py-0 bg-[#EFF6FF] text-[#1E3A5F] border border-[#1E3A5F] font-mono font-bold">
                                    {grupo.tipoMatch}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`inline-block px-1 py-0.5 text-[9px] font-bold border ${claseBadgeEstadoExtracto(
                                l.estadoConciliacion
                              )}`}
                            >
                              {l.estadoConciliacion}
                            </span>
                          </td>
                          <td className="text-right tabular-nums">
                            <span
                              className={`font-mono font-bold text-[11px] ${
                                montoNeg ? 'text-[#B91C1C]' : 'text-[#1E6F42]'
                              }`}
                            >
                              {formatearMonedaExacta(l.monto, moneda)}
                            </span>
                          </td>
                          <td
                            className="text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {l.conciliada ? (
                              <button
                                type="button"
                                disabled={operacionesBloqueadas || desconciliando}
                                onClick={() => abrirModalDesconciliarExtracto(l)}
                                aria-label={`Desconciliar extracto ${l.descripcion}`}
                                title={
                                  operacionesBloqueadas
                                    ? motivoBloqueo
                                    : 'Desconciliar partida/grupo'
                                }
                                className="h-6 px-1.5 bg-[#FFFFFF] hover:bg-[#FEF2F2] text-[#B91C1C] border border-[#D1D5DB] text-[10px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed rounded-none focus-visible:outline-2 focus-visible:outline-[#1E3A5F]"
                              >
                                <Unlink className="w-3 h-3" />
                                <span>Desconciliar</span>
                              </button>
                            ) : !operacionesBloqueadas &&
                              l.estadoConciliacion !== 'DUPLICADO' &&
                              (onAbrirAplicarCartera || onAbrirGenerarAsiento) ? (
                              <div
                                className={`flex flex-wrap items-center justify-center ${
                                  extractoVirt.isVirtualized
                                    ? 'gap-0.5 max-h-[40px] overflow-hidden'
                                    : 'gap-1'
                                }`}
                              >
                                {onAbrirAplicarCartera && (
                                  <button
                                    type="button"
                                    onClick={() => onAbrirAplicarCartera(l)}
                                    aria-label={`Aplicar cartera a ${l.descripcion}`}
                                    title="Aplicar línea bancaria a Cartera CxC/CxP o caso especial"
                                    className={`${
                                      extractoVirt.isVirtualized ? 'h-[18px]' : 'h-5'
                                    } px-1.5 bg-[#FFFFFF] hover:bg-[#EFF6FF] text-[#1E3A5F] border border-[#1E3A5F] text-[10px] font-medium inline-flex items-center gap-0.5 cursor-pointer rounded-none focus-visible:outline-2 focus-visible:outline-[#1E3A5F]`}
                                  >
                                    <FileCheck2 className="w-2.5 h-2.5" />
                                    <span>Aplicar CxC/CxP</span>
                                  </button>
                                )}
                                {onAbrirGenerarAsiento && (
                                  <button
                                    type="button"
                                    onClick={() => onAbrirGenerarAsiento(l)}
                                    aria-label={`Generar asiento para ${l.descripcion}`}
                                    title="Previsualizar y generar asiento contable bancario"
                                    className={`${
                                      extractoVirt.isVirtualized ? 'h-[18px]' : 'h-5'
                                    } px-1.5 bg-[#F5F7FA] hover:bg-[#ECFDF5] text-[#1E6F42] border border-[#1E6F42] text-[10px] font-medium inline-flex items-center gap-0.5 cursor-pointer rounded-none focus-visible:outline-2 focus-visible:outline-[#1E3A5F]`}
                                  >
                                    <FileSpreadsheet className="w-2.5 h-2.5" />
                                    <span>Generar Asiento</span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span
                                title={operacionesBloqueadas ? motivoBloqueo : undefined}
                                className="text-[10px] text-[#9CA3AF]"
                              >
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {extractoVirt.paddingBottomPx > 0 && (
                      <tr aria-hidden="true">
                        <td
                          colSpan={6}
                          style={{
                            height: `${extractoVirt.paddingBottomPx}px`,
                            padding: 0,
                            border: 0,
                          }}
                        />
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* DERECHA: LIBROS CONTABLES (TESORERÍA + ASIENTOS MANUALES 104x) */}
        <div
          role="region"
          aria-label="Libros Contables (Tesorería + Mayor 104x)"
          className="flex flex-col min-h-[280px] border border-[#D1D5DB] bg-[#FFFFFF]"
        >
          <div className="px-2.5 py-1.5 bg-[#1E3A5F] text-[#FFFFFF] flex items-center justify-between text-[12px]">
            <span className="font-bold">Libros Contables (Tesorería + Mayor 104x)</span>
            <span className="font-mono text-[11px] text-[#E8ECF1]">
              {librosFiltrado.length} de {librosUnificados.length} partidas
            </span>
          </div>

          <div ref={librosContainerRef} className="flex-1 overflow-auto">
            <table
              aria-label="Tabla de movimientos en libros contables"
              className={`tabla-densa ${
                librosVirt.isVirtualized ? 'table-fixed min-w-[600px]' : ''
              }`}
            >
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="w-7 text-center">Sel</th>
                  <th className="w-20 text-left">Fecha</th>
                  <th className="text-left">Glosa / Origen / Doc.</th>
                  <th className="w-28 text-left">Estado</th>
                  <th className="w-24 text-right tabular-nums">Importe ({moneda})</th>
                  <th className="w-24 text-center">Acción</th>
                </tr>
              </thead>
              <tbody aria-busy={cargando ? 'true' : undefined}>
                {cargando ? (
                  <FilasEsqueletoTabla />
                ) : mensajeError ? (
                  <EstadoErrorTabla mensaje={mensajeError} onReintentar={onReintentar} />
                ) : librosFiltrado.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 px-3 text-[#4B5563]">
                      <div className="flex flex-col items-center gap-1.5">
                        <span>
                          {librosUnificados.length === 0
                            ? 'No existen movimientos en libros contables para este período.'
                            : 'Sin partidas en libros contables para el filtro o búsqueda actual.'}
                        </span>
                        {(filtroEstado !== 'TODOS' || textoBusquedaDebounced.trim().length > 0) && (
                          <button
                            type="button"
                            onClick={() => {
                              setFiltroEstado('TODOS');
                              setTextoBusqueda('');
                            }}
                            className="h-6 px-2.5 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#1E3A5F] border border-[#D1D5DB] text-[11px] cursor-pointer rounded-none focus-visible:outline-2 focus-visible:outline-[#1E3A5F]"
                          >
                            Restablecer filtros
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  <>
                    {librosVirt.paddingTopPx > 0 && (
                      <tr aria-hidden="true">
                        <td
                          colSpan={6}
                          style={{
                            height: `${librosVirt.paddingTopPx}px`,
                            padding: 0,
                            border: 0,
                          }}
                        />
                      </tr>
                    )}
                    {librosVirt.visibleItems.map((m, localIdx) => {
                      const idx = librosVirt.startIndex + localIdx;
                      const seleccionada = librosSeleccionadosSet.has(m.claveCompuesta);
                      const seleccionable =
                        !operacionesBloqueadas && !m.conciliado && m.estado !== 'ANULADO';
                      const importeNeg = aCentavos(m.importeConSigno) < 0;
                      const esAsientoManual = m.origenEfectivo === 'ASIENTO_MANUAL';
                      const esSugerido =
                        !m.conciliado && librosSugeridosKeys.has(m.claveCompuesta);
                      const grupo = m.grupoConciliacionId
                        ? grupoPorId.get(m.grupoConciliacionId)
                        : grupoPorLibroKey.get(m.claveCompuesta);

                      return (
                        <tr
                          key={m.claveCompuesta}
                          style={
                            librosVirt.isVirtualized
                              ? { height: `${ALTURA_FILA_VIRTUALIZADA_PX}px` }
                              : undefined
                          }
                          onClick={() => {
                            if (seleccionable) toggleLibro(m.claveCompuesta);
                          }}
                          className={`${
                            seleccionada
                              ? 'bg-[#DBEAFE] text-[#111827]'
                              : idx % 2 === 0
                              ? 'bg-[#FFFFFF] hover:bg-[#E8ECF1]'
                              : 'bg-[#F5F7FA] hover:bg-[#E8ECF1]'
                          } ${seleccionable ? 'cursor-pointer' : ''}`}
                        >
                          <td
                            className="text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              aria-label={`Seleccionar libro ${m.glosa}`}
                              checked={seleccionada}
                              disabled={!seleccionable}
                              onChange={() => toggleLibro(m.claveCompuesta)}
                              className="w-3.5 h-3.5 accent-[#1E3A5F] cursor-pointer disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#1E3A5F]"
                            />
                          </td>
                          <td className="font-mono text-[11px] whitespace-nowrap">{m.fecha}</td>
                          <td>
                            <div
                              className={
                                librosVirt.isVirtualized
                                  ? 'max-h-[40px] overflow-hidden'
                                  : undefined
                              }
                            >
                              <div
                                title={m.glosa}
                                className={`text-[11px] text-[#111827] leading-tight ${
                                  librosVirt.isVirtualized ? 'truncate' : ''
                                }`}
                              >
                                {esAsientoManual && (
                                  <span className="inline-block px-1 py-0 text-[9px] font-bold bg-[#EFF6FF] text-[#1E3A5F] border border-[#1E3A5F] mr-1">
                                    Asiento Manual 104x
                                  </span>
                                )}
                                {m.glosa}
                              </div>
                              <div
                                className={`flex items-center gap-1.5 mt-0.5 text-[10px] ${
                                  librosVirt.isVirtualized
                                    ? 'overflow-hidden whitespace-nowrap'
                                    : 'flex-wrap'
                                }`}
                              >
                                <span className="font-mono text-[#4B5563]">
                                  {m.tipo} · {m.medioPago}
                                </span>
                                {(m.numeroOperacion || m.docRef) && (
                                  <span className="font-mono text-[#1E3A5F]">
                                    Op: {m.numeroOperacion || m.docRef}
                                  </span>
                                )}
                                {m.anexoNombre && (
                                  <span
                                    title={`${m.anexoNombre}${m.anexoRuc ? ` (${m.anexoRuc})` : ''}`}
                                    className="text-[#4B5563] truncate max-w-[160px]"
                                  >
                                    · {m.anexoNombre}
                                    {m.anexoRuc ? ` (${m.anexoRuc})` : ''}
                                  </span>
                                )}
                                {grupo && (
                                  <span className="px-1 py-0 bg-[#EFF6FF] text-[#1E3A5F] border border-[#1E3A5F] font-mono font-bold">
                                    {grupo.tipoMatch}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`inline-block px-1 py-0.5 text-[9px] font-bold border ${claseBadgeEstadoLibro(
                                m.estadoLibroV2,
                                esSugerido
                              )}`}
                            >
                              {esSugerido ? 'SUGERIDO' : m.estadoLibroV2}
                            </span>
                          </td>
                          <td className="text-right tabular-nums">
                            <span
                              className={`font-mono font-bold text-[11px] ${
                                importeNeg ? 'text-[#B91C1C]' : 'text-[#1E6F42]'
                              }`}
                            >
                              {formatearMonedaExacta(m.importeConSigno, moneda)}
                            </span>
                          </td>
                          <td
                            className="text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {m.conciliado && grupo ? (
                              <button
                                type="button"
                                disabled={operacionesBloqueadas || desconciliando}
                                onClick={() => abrirModalDesconciliarLibro(m)}
                                aria-label={`Desconciliar libro ${m.glosa}`}
                                title={
                                  operacionesBloqueadas
                                    ? motivoBloqueo
                                    : 'Desconciliar grupo'
                                }
                                className="h-6 px-1.5 bg-[#FFFFFF] hover:bg-[#FEF2F2] text-[#B91C1C] border border-[#D1D5DB] text-[10px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed rounded-none focus-visible:outline-2 focus-visible:outline-[#1E3A5F]"
                              >
                                <Unlink className="w-3 h-3" />
                                <span>Desconciliar</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-[#9CA3AF]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {librosVirt.paddingBottomPx > 0 && (
                      <tr aria-hidden="true">
                        <td
                          colSpan={6}
                          style={{
                            height: `${librosVirt.paddingBottomPx}px`,
                            padding: 0,
                            border: 0,
                          }}
                        />
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal de confirmación para Desconciliar (exige motivo >= 5 chars) */}
      <VentanaModal
        abierto={Boolean(desconciliarObjetivo)}
        onCerrar={() => setDesconciliarObjetivo(null)}
        titulo="Desconciliar Partida / Grupo"
        ancho="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDesconciliarObjetivo(null)}
              className="h-7 px-3 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border border-[#D1D5DB] text-[12px] cursor-pointer rounded-none"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="form-desconciliar-dual-v2"
              disabled={
                desconciliando ||
                operacionesBloqueadas ||
                motivoDesconciliar.trim().length < 5
              }
              className="h-7 px-3 bg-[#B91C1C] hover:bg-[#991B1B] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-[#FFFFFF] border border-[#B91C1C] disabled:border-[#D1D5DB] text-[12px] cursor-pointer disabled:cursor-not-allowed rounded-none"
            >
              {desconciliando ? 'Procesando...' : 'Confirmar Desconciliación'}
            </button>
          </>
        }
      >
        {desconciliarObjetivo && (
          <form
            id="form-desconciliar-dual-v2"
            onSubmit={handleConfirmarDesconciliar}
            className="space-y-2.5"
          >
            <div className="p-2 bg-[#F5F7FA] border border-[#D1D5DB] text-[11px] text-[#111827]">
              {desconciliarObjetivo.descripcion}
            </div>
            <p className="text-[12px] text-[#374151]">
              Las partidas involucradas volverán a estado pendiente y este evento quedará
              registrado en el historial de desconciliaciones.
            </p>
            <div>
              <label className="block text-[11px] font-bold text-[#374151] mb-1">
                Motivo de desconciliación * (mínimo 5 caracteres)
              </label>
              <textarea
                required
                minLength={5}
                maxLength={500}
                rows={2}
                value={motivoDesconciliar}
                onChange={(e) => setMotivoDesconciliar(e.target.value)}
                placeholder="Ej. Cruce equivocado por diferencia de fecha / comprobante..."
                className="w-full p-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] focus:outline-none focus:border-[#1E3A5F] rounded-none"
              />
            </div>
          </form>
        )}
      </VentanaModal>
    </div>
  );
};
