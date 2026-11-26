import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';

const ALTURA_CONTENEDOR_FALLBACK_PX = 420;

export interface OpcionesListaVirtualizada<T> {
  items: readonly T[];
  rowHeightPx: number;
  containerRef: RefObject<HTMLElement | null>;
  overscan?: number;
  enabled: boolean;
}

export interface ResultadoListaVirtualizada<T> {
  startIndex: number;
  endIndex: number;
  paddingTopPx: number;
  paddingBottomPx: number;
  visibleItems: T[];
  isVirtualized: boolean;
  resetScroll: () => void;
}

/**
 * Hook liviano de windowing / virtualización de listas sobre un contenedor con scroll.
 * Utiliza ResizeObserver (con fallback a 420 px) y listener pasivo de scroll
 * sincronizado con requestAnimationFrame para renderizar únicamente la ventana visible.
 */
export function useListaVirtualizada<T>({
  items,
  rowHeightPx,
  containerRef,
  overscan = 10,
  enabled,
}: OpcionesListaVirtualizada<T>): ResultadoListaVirtualizada<T> {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(ALTURA_CONTENEDOR_FALLBACK_PX);

  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;

    const alturaInicial =
      el.clientHeight > 0 ? el.clientHeight : ALTURA_CONTENEDOR_FALLBACK_PX;
    setContainerHeight(alturaInicial);
    setScrollTop(el.scrollTop);

    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setScrollTop(el.scrollTop);
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        const alturaMedida = entry?.contentRect?.height ?? el.clientHeight;
        if (alturaMedida > 0) {
          setContainerHeight((prev) =>
            Math.abs(prev - alturaMedida) >= 1 ? alturaMedida : prev
          );
        }
      });
      ro.observe(el);
    }

    return () => {
      el.removeEventListener('scroll', onScroll);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      ro?.disconnect();
    };
  }, [enabled, containerRef]);

  const resetScroll = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
    setScrollTop(0);
  }, [containerRef]);

  return useMemo(() => {
    const total = items.length;
    if (!enabled || total === 0 || rowHeightPx <= 0) {
      return {
        startIndex: 0,
        endIndex: total,
        paddingTopPx: 0,
        paddingBottomPx: 0,
        visibleItems: items as T[],
        isVirtualized: false,
        resetScroll,
      };
    }

    const alturaEfectiva =
      containerHeight > 0 ? containerHeight : ALTURA_CONTENEDOR_FALLBACK_PX;
    const maxScrollTop = Math.max(0, total * rowHeightPx - alturaEfectiva);
    const scrollEfectivo = Math.min(Math.max(0, scrollTop), maxScrollTop);

    const rawStart = Math.floor(scrollEfectivo / rowHeightPx);
    const visibleCount = Math.ceil(alturaEfectiva / rowHeightPx);

    const startIndex = Math.max(0, rawStart - overscan);
    const endIndex = Math.min(total, rawStart + visibleCount + overscan);

    const paddingTopPx = startIndex * rowHeightPx;
    const paddingBottomPx = Math.max(0, (total - endIndex) * rowHeightPx);
    const visibleItems = items.slice(startIndex, endIndex);

    return {
      startIndex,
      endIndex,
      paddingTopPx,
      paddingBottomPx,
      visibleItems,
      isVirtualized: true,
      resetScroll,
    };
  }, [items, enabled, rowHeightPx, containerHeight, scrollTop, overscan, resetScroll]);
}
