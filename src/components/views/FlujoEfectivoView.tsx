import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';

interface LineaNic7 {
  id: string;
  actividad: 'OPERACIÓN' | 'INVERSIÓN' | 'FINANCIAMIENTO' | 'CONCILIACIÓN';
  concepto: string;
  importePen: number;
}

export const FlujoEfectivoView: React.FC = () => {
  const { state } = useAppContext();
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-03');
  const [lineas, setLineas] = useState<LineaNic7[]>([]);
  const [cargando, setCargando] = useState(false);

  const empresaId = typeof state.activeEmpresa === 'string' ? state.activeEmpresa : (state.activeEmpresa as any)?.id;

  const cargarFlujo = async () => {
    if (!empresaId) return;
    setCargando(true);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/flujo-efectivo?periodo=${periodo}`, {
        headers: {
          ...(state.token ? { Authorization: `Bearer ${state.token}` } : {})
        }
      });
      const json = await res.json().catch(() => null);
      const data = json?.data;
      if (data && Array.isArray(data.actividades)) {
        const rows: LineaNic7[] = data.actividades.map((a: any, i: number) => ({
          id: `fe-${i}`,
          actividad: a.tipo || 'OPERACIÓN',
          concepto: a.concepto || 'Actividad operativa',
          importePen: Number(a.monto) || 0
        }));
        setLineas(rows);
      } else {
        setLineas([]);
      }
    } catch {
      setLineas([]);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarFlujo();
  }, [empresaId, periodo]);

  const columnas: ColumnaTablaDensa<LineaNic7>[] = [
    { key: 'actividad', header: 'Actividad NIC 7', width: '145px', render: (r) => <span className="font-bold text-[#1E3A5F] text-[11px]">{r.actividad}</span> },
    { key: 'concepto', header: 'Flujos de Efectivo (Formato 3.18 SUNAT — Método Directo)', render: (r) => <span className={r.actividad === 'CONCILIACIÓN' ? 'font-bold text-[#111827]' : ''}>{r.concepto}</span> },
    { key: 'importePen', header: 'Flujo S/', width: '135px', align: 'right', render: (r) => <span className={r.actividad === 'CONCILIACIÓN' ? 'font-bold text-[#1E3A5F]' : ''}>{r.importePen.toFixed(2)}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Estado de Flujos de Efectivo (NIC 7 / Formato 3.18 SUNAT)"
        subtitulo="Clasificación de movimientos de efectivo en Actividades de Operación, Inversión y Financiamiento"
        derecha={<SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={lineas}
          rowKey={(r) => r.id}
        />
      </div>
    </div>
  );
};
