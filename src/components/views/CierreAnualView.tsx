import React, { useState } from 'react';
import { Play, CheckCircle2, FileText } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';

interface PasoCierreAnual {
  paso: number;
  subdiario: string;
  glosa: string;
  cuentasIntervinientes: string;
  norma: string;
  estado: 'PENDIENTE' | 'GENERADO';
}

export const CierreAnualView: React.FC = () => {
  const { state, notify } = useAppContext();
  const [ejercicio, setEjercicio] = useState((state.activePeriodo || '2026-03').slice(0, 4));
  const [ejecutando, setEjecutando] = useState(false);
  const [pasos, setPasos] = useState<PasoCierreAnual[]>([
    {
      paso: 1,
      subdiario: '09 - Cierre',
      glosa: 'Cancelación de cuentas de costos y gastos analíticos (Elemento 9 contra 79)',
      cuentasIntervinientes: '791 Cargas Imputables → 941 / 951 / 971',
      norma: 'Dinámica PCGE 2019 Modificado - Elemento 9',
      estado: 'PENDIENTE',
    },
    {
      paso: 2,
      subdiario: '09 - Cierre',
      glosa: 'Determinación de saldos intermediarios de gestión (Elemento 8: 80, 81, 82, 83, 84, 85)',
      cuentasIntervinientes: 'Elementos 6 y 7 → Cuentas 80 a 85',
      norma: 'Dinámica PCGE 2019 Modificado - Elemento 8',
      estado: 'PENDIENTE',
    },
    {
      paso: 3,
      subdiario: '09 - Cierre',
      glosa: 'Determinación del Impuesto a la Renta Anual (88) y traslado a Resultados Acumulados (59)',
      cuentasIntervinientes: '851 → 881 / 40171 → 891 → 5911',
      norma: 'NIC 12 / TUO Ley del Impuesto a la Renta',
      estado: 'PENDIENTE',
    },
    {
      paso: 4,
      subdiario: '09 - Cierre',
      glosa: 'Asiento de reversión de cuentas de Activo, Pasivo y Patrimonio al 31 de diciembre',
      cuentasIntervinientes: 'Elemento 4 y 5 (Debe) → Elemento 1, 2 y 3 (Haber)',
      norma: 'Cierre de Libros de Inventarios y Balances',
      estado: 'PENDIENTE',
    },
    {
      paso: 5,
      subdiario: '00 - Apertura',
      glosa: `Asiento de reapertura del ejercicio ${Number(ejercicio) + 1} (01 de enero)`,
      cuentasIntervinientes: 'Elemento 1, 2 y 3 (Debe) → Elemento 4 y 5 (Haber)',
      norma: 'Reapertura automática de saldos de balance',
      estado: 'PENDIENTE',
    },
  ]);

  const ejecutarCierreAnual = async () => {
    setEjecutando(true);
    try {
      const res = await fetch('/api/operaciones/cierre/anual-elemento8', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-empresa-id': state.activeEmpresa,
          ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        },
        body: JSON.stringify({ anio: Number(ejercicio) }),
      });
      await res.json().catch(() => null);
      setPasos((prev) => prev.map((p) => ({ ...p, estado: 'GENERADO' })));
      notify(`Asientos de cierre anual ${ejercicio} (Elemento 8) y apertura ${Number(ejercicio) + 1} generados`, 'success');
    } catch {
      notify('Error al ejecutar la secuencia de cierre anual', 'error');
    } finally {
      setEjecutando(false);
    }
  };

  const columnas: ColumnaTablaDensa<PasoCierreAnual>[] = [
    { key: 'paso', header: 'Sec.', width: '50px', align: 'center', render: (r) => <span className="font-mono font-bold">{r.paso}</span> },
    { key: 'subdiario', header: 'Subdiario', width: '105px', render: (r) => <span className="font-mono text-[#1E3A5F] font-bold">{r.subdiario}</span> },
    { key: 'glosa', header: 'Descripción del Asiento de Cierre', render: (r) => <span className="font-bold text-[#111827]">{r.glosa}</span> },
    { key: 'cuentasIntervinientes', header: 'Dinámica Contable PCGE', width: '250px', render: (r) => <span className="font-mono text-[11px]">{r.cuentasIntervinientes}</span> },
    { key: 'norma', header: 'Base Normativa', width: '230px', render: (r) => <span className="text-[#4B5563]">{r.norma}</span> },
    {
      key: 'estado',
      header: 'Estado',
      width: '105px',
      align: 'center',
      render: (r) => (
        <span className={`font-bold text-[11px] ${r.estado === 'GENERADO' ? 'text-[#1E6F42]' : 'text-[#4B5563]'}`}>
          {r.estado}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Cierre Contable Anual (Dinámica PCGE Elemento 8) y Asiento de Apertura"
        subtitulo="Secuencia ordenada de cancelación de cuentas de gestión, traslado a resultados acumulados y reapertura"
        acciones={[
          {
            id: 'ejecutar-cierre',
            label: ejecutando ? 'Generando secuencia...' : `Ejecutar cierre anual ${ejercicio}`,
            icono: Play,
            primario: true,
            disabled: ejecutando,
            onClick: ejecutarCierreAnual,
          },
        ]}
        derecha={
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-[#4B5563]">Ejercicio Gravable:</label>
            <select
              value={ejercicio}
              onChange={(e) => setEjercicio(e.target.value)}
              className="h-6 px-2 text-[12px] font-mono bg-[#FFFFFF] border border-[#D1D5DB] text-[#111827]"
            >
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
          </div>
        }
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={pasos}
          rowKey={(r) => r.paso}
        />
      </div>
    </div>
  );
};
