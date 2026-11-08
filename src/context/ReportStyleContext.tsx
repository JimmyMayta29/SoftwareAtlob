import React, { createContext, useContext, useState, useEffect } from 'react';

export type ReportStyle = 'estandar' | 'actual';
export const REPORT_STYLE: ReportStyle = 'estandar';

interface ReportStyleContextType {
  reportStyle: ReportStyle;
  setReportStyle: (style: ReportStyle) => void;
  toggleReportStyle: () => void;
  mostrarFechaHoraImpresion: boolean;
  setMostrarFechaHoraImpresion: (mostrar: boolean) => void;
}

const ReportStyleContext = createContext<ReportStyleContextType | undefined>(undefined);

const STORAGE_KEY = 'atlob_report_style';
const FECHA_HORA_STORAGE_KEY = 'atlob_report_show_datetime';

function resolverClaveUsuario(base: string, usuarioId?: string): string {
  if (usuarioId && usuarioId.trim()) {
    return `${base}_${usuarioId.trim().toLowerCase()}`;
  }
  const guardado = typeof localStorage !== 'undefined' ? (localStorage.getItem('atlob_usuario_recordado') || 'comun') : 'comun';
  return `${base}_${guardado.toLowerCase()}`;
}

export const ReportStyleProvider: React.FC<{ children: React.ReactNode; usuarioId?: string }> = ({ children, usuarioId }) => {
  const [reportStyle, setReportStyleState] = useState<ReportStyle>(() => {
    if (typeof localStorage === 'undefined') return REPORT_STYLE;
    const claveUser = resolverClaveUsuario(STORAGE_KEY, usuarioId);
    const saved = localStorage.getItem(claveUser) || localStorage.getItem(STORAGE_KEY);
    return (saved === 'actual' || saved === 'estandar') ? saved : REPORT_STYLE;
  });

  const [mostrarFechaHoraImpresion, setMostrarFechaHoraImpresionState] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    const claveUser = resolverClaveUsuario(FECHA_HORA_STORAGE_KEY, usuarioId);
    const saved = localStorage.getItem(claveUser) ?? localStorage.getItem(FECHA_HORA_STORAGE_KEY);
    return saved === 'true'; // Oculto por defecto
  });

  const setReportStyle = (style: ReportStyle) => {
    setReportStyleState(style);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(resolverClaveUsuario(STORAGE_KEY, usuarioId), style);
      localStorage.setItem(STORAGE_KEY, style);
    }
  };

  const toggleReportStyle = () => {
    const nextStyle: ReportStyle = reportStyle === 'estandar' ? 'actual' : 'estandar';
    setReportStyle(nextStyle);
  };

  const setMostrarFechaHoraImpresion = (mostrar: boolean) => {
    setMostrarFechaHoraImpresionState(mostrar);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(resolverClaveUsuario(FECHA_HORA_STORAGE_KEY, usuarioId), String(mostrar));
      localStorage.setItem(FECHA_HORA_STORAGE_KEY, String(mostrar));
    }
  };

  return (
    <ReportStyleContext.Provider value={{
      reportStyle,
      setReportStyle,
      toggleReportStyle,
      mostrarFechaHoraImpresion,
      setMostrarFechaHoraImpresion
    }}>
      {children}
    </ReportStyleContext.Provider>
  );
};

export const useReportStyle = (): ReportStyleContextType => {
  const context = useContext(ReportStyleContext);
  if (!context) {
    throw new Error('useReportStyle debe usarse dentro de un ReportStyleProvider');
  }
  return context;
};
