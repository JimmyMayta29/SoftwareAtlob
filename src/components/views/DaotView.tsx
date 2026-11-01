import React, { useState } from 'react';
import { Download, Filter } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';

interface TerceroDaot {
  id: string;
  tipoOperacion: 'COSTO_GASTO' | 'INGRESO';
  tipoDoc: string;
  numeroDoc: string;
  razonSocial: string;
  cantidadComprobantes: number;
  baseImponibleAcumulada: number;
  igvExcluido: number;
  excluidoManualmente: boolean;
  motivoExclusion?: string;
}

const UIT_POR_ANIO: Record<string, number> = {
  '2026': 5500, // D.S. N° 301-2025-EF
  '2025': 5350, // D.S. N° 260-2024-EF
  '2024': 5150, // D.S. N° 309-2023-EF
};

const TERCEROS_INICIALES: TerceroDaot[] = [
  {
    id: 'd-1',
    tipoOperacion: 'COSTO_GASTO',
    tipoDoc: '6 - RUC',
    numeroDoc: '20512345678',
    razonSocial: 'SERVICIOS LOGISTICOS DEL SUR S.A.C.',
    cantidadComprobantes: 8,
    baseImponibleAcumulada: 18450.0,
    igvExcluido: 3321.0,
    excluidoManualmente: false,
  },
  {
    id: 'd-2',
    tipoOperacion: 'COSTO_GASTO',
    tipoDoc: '6 - RUC',
    numeroDoc: '20601122334',
    razonSocial: 'ASESORIA EMPRESARIAL INTEGRAL S.A.C.',
    cantidadComprobantes: 5,
    baseImponibleAcumulada: 11001.0,
    igvExcluido: 1980.18,
    excluidoManualmente: false,
  },
  {
    id: 'd-3',
    tipoOperacion: 'COSTO_GASTO',
    tipoDoc: '6 - RUC',
    numeroDoc: '20554433221',
    razonSocial: 'PROVEEDOR SUMINISTROS MENORES E.I.R.L.',
    cantidadComprobantes: 4,
    baseImponibleAcumulada: 10999.0,
    igvExcluido: 1979.82,
    excluidoManualmente: false,
  },
  {
    id: 'd-4',
    tipoOperacion: 'INGRESO',
    tipoDoc: '6 - RUC',
    numeroDoc: '20100047218',
    razonSocial: 'CORPORACION COMERCIAL PERUANA S.A.C.',
    cantidadComprobantes: 12,
    baseImponibleAcumulada: 42800.0,
    igvExcluido: 7704.0,
    excluidoManualmente: false,
  },
  {
    id: 'd-5',
    tipoOperacion: 'INGRESO',
    tipoDoc: '6 - RUC',
    numeroDoc: '20498877665',
    razonSocial: 'DISTRIBUIDORA NACIONAL DEL CENTRO S.R.L.',
    cantidadComprobantes: 6,
    baseImponibleAcumulada: 15200.0,
    igvExcluido: 2736.0,
    excluidoManualmente: false,
  },
];

export const DaotView: React.FC = () => {
  const { state, notify } = useAppContext();
  const [anio, setAnio] = useState('2026');
  const [filtroTipo, setFiltroTipo] = useState<'DECLARABLES' | 'TODOS' | 'COSTO_GASTO' | 'INGRESO'>('DECLARABLES');
  const [terceros, setTerceros] = useState<TerceroDaot[]>(TERCEROS_INICIALES);
  const [modalExclusionesItem, setModalExclusionesItem] = useState<TerceroDaot | null>(null);
  const [motivoInput, setMotivoInput] = useState('Servicios públicos / operación no obligada según Art. 6° R.S. 024-2002/SUNAT');

  const uit = UIT_POR_ANIO[anio] || 5500;
  const umbralDosUit = uit * 2;

  const evaluarEstado = (t: TerceroDaot) => {
    if (t.excluidoManualmente) return 'EXCLUIDO';
    return t.baseImponibleAcumulada > umbralDosUit ? 'DECLARABLE' : 'NO SUPERA';
  };

  const filasMostradas = terceros.filter((t) => {
    const estado = evaluarEstado(t);
    if (filtroTipo === 'DECLARABLES') return estado === 'DECLARABLE';
    if (filtroTipo === 'COSTO_GASTO') return t.tipoOperacion === 'COSTO_GASTO';
    if (filtroTipo === 'INGRESO') return t.tipoOperacion === 'INGRESO';
    return true;
  });

  const confirmarExclusion = () => {
    if (!modalExclusionesItem) return;
    if (!motivoInput.trim() || motivoInput.trim().length < 5) {
      notify('Ingrese un motivo de depuración válido', 'error');
      return;
    }
    setTerceros((prev) =>
      prev.map((t) =>
        t.id === modalExclusionesItem.id
          ? { ...t, excluidoManualmente: true, motivoExclusion: motivoInput.trim() }
          : t
      )
    );
    notify(`Tercero ${modalExclusionesItem.numeroDoc} depurado con motivo registrado`, 'info');
    setModalExclusionesItem(null);
  };

  const restaurarTercero = (id: string) => {
    setTerceros((prev) =>
      prev.map((t) => (t.id === id ? { ...t, excluidoManualmente: false, motivoExclusion: undefined } : t))
    );
    notify('Tercero reincorporado al padrón DAOT', 'success');
  };

  const exportarTxtPdt3500 = (tipo: 'COSTO_GASTO' | 'INGRESO') => {
    const rucDeclarante = state.activeEmpresaRuc || '20601234567';
    const filas = terceros
      .filter((t) => t.tipoOperacion === tipo && evaluarEstado(t) === 'DECLARABLE')
      .map((t, idx) => `${idx + 1}|6|${rucDeclarante}|${anio}|1|6|${t.numeroDoc}|${Math.round(t.baseImponibleAcumulada)}|${t.razonSocial}|`)
      .join('\n');
    const blob = new Blob([filas], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tipo === 'COSTO_GASTO' ? `COSTOS_${rucDeclarante}_${anio}.txt` : `INGRESOS_${rucDeclarante}_${anio}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    notify(`Archivo plano PDT 3500 (${tipo === 'COSTO_GASTO' ? 'Costos/Gastos' : 'Ingresos'}) exportado`, 'success');
  };

  const columnas: ColumnaTablaDensa<TerceroDaot>[] = [
    {
      key: 'tipoOperacion',
      header: 'Tipo Operación',
      width: '120px',
      render: (r) => (
        <span className="font-mono font-bold text-[11px] text-[#1E3A5F]">
          {r.tipoOperacion === 'COSTO_GASTO' ? 'COSTO / GASTO' : 'INGRESO / VENTA'}
        </span>
      ),
    },
    { key: 'numeroDoc', header: 'RUC Tercero', width: '100px', render: (r) => <span className="font-mono font-bold">{r.numeroDoc}</span> },
    {
      key: 'razonSocial',
      header: 'Denominación o Razón Social del Proveedor / Cliente',
      render: (r) => (
        <div>
          <div>{r.razonSocial}</div>
          {r.excluidoManualmente && r.motivoExclusion && (
            <div className="text-[10px] text-[#B45309] font-mono">Motivo depuración: {r.motivoExclusion}</div>
          )}
        </div>
      ),
    },
    { key: 'cantidadComprobantes', header: 'N° Comp.', width: '70px', align: 'right', render: (r) => r.cantidadComprobantes },
    {
      key: 'baseImponibleAcumulada',
      header: 'Base Neta (Sin IGV) S/',
      width: '145px',
      align: 'right',
      render: (r) => <span className="font-mono font-bold text-[#111827]">{r.baseImponibleAcumulada.toFixed(2)}</span>,
    },
    { key: 'igvExcluido', header: 'IGV Excluido S/', width: '110px', align: 'right', render: (r) => <span className="font-mono text-[#4B5563]">{r.igvExcluido.toFixed(2)}</span> },
    {
      key: 'estado',
      header: `Umbral > S/ ${umbralDosUit.toLocaleString('es-PE')}`,
      width: '125px',
      align: 'center',
      render: (r) => {
        const est = evaluarEstado(r);
        return (
          <span
            className={`font-mono font-bold text-[11px] ${
              est === 'DECLARABLE'
                ? 'text-[#1E6F42]'
                : est === 'EXCLUIDO'
                ? 'text-[#B45309]'
                : 'text-[#4B5563]'
            }`}
          >
            {est}
          </span>
        );
      },
    },
    {
      key: 'depuracion',
      header: 'Depuración',
      width: '105px',
      align: 'center',
      render: (r) =>
        r.excluidoManualmente ? (
          <button
            type="button"
            onClick={() => restaurarTercero(r.id)}
            className="h-5 px-2 bg-[#ECFDF5] border border-[#1E6F42] text-[#1E6F42] text-[10px] font-bold"
          >
            Reincorporar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setModalExclusionesItem(r)}
            className="h-5 px-2 bg-[#FFFFFF] border border-[#D1D5DB] hover:bg-[#FEF3C7] text-[#111827] text-[10px]"
          >
            Depurar
          </button>
        ),
    },
  ];

  const totalBase = filasMostradas.reduce((s, r) => s + r.baseImponibleAcumulada, 0);

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="DAOT — Declaración Anual de Operaciones con Terceros (PDT 3500)"
        subtitulo="R.S. N° 024-2002/SUNAT: Acumulado anual por cliente/proveedor (Base neta sin IGV), umbral parametrizado en UIT y depuración auditada"
        acciones={[
          {
            id: 'txt-costos',
            label: 'Exportar COSTOS.TXT (PDT 3500)',
            icono: Download,
            primario: true,
            onClick: () => exportarTxtPdt3500('COSTO_GASTO'),
          },
          {
            id: 'txt-ingresos',
            label: 'Exportar INGRESOS.TXT (PDT 3500)',
            icono: Download,
            onClick: () => exportarTxtPdt3500('INGRESO'),
          },
        ]}
        derecha={
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-[#4B5563]">Ejercicio:</label>
            <select
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
              className="h-6 px-2 text-[12px] font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
            >
              <option value="2026">2026 (UIT S/ 5,500 — 2 UIT = S/ 11,000)</option>
              <option value="2025">2025 (UIT S/ 5,350 — 2 UIT = S/ 10,700)</option>
              <option value="2024">2024 (UIT S/ 5,150 — 2 UIT = S/ 10,300)</option>
            </select>
          </div>
        }
      />

      <div className="px-3 py-1.5 bg-[#F5F7FA] border-b border-[#D1D5DB] flex items-center justify-between text-[12px]">
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-[#4B5563]" />
          <span className="text-[11px] text-[#4B5563]">Vista:</span>
          {(['DECLARABLES', 'TODOS', 'COSTO_GASTO', 'INGRESO'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFiltroTipo(t)}
              className={`h-6 px-2.5 text-[11px] border ${
                filtroTipo === t
                  ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F] font-bold'
                  : 'bg-[#FFFFFF] text-[#111827] border-[#D1D5DB]'
              }`}
            >
              {t === 'DECLARABLES'
                ? `Declarables (> S/ ${umbralDosUit.toLocaleString('es-PE')})`
                : t === 'TODOS'
                ? 'Todos los Terceros (Incluye bajo umbral y depurados)'
                : t === 'COSTO_GASTO'
                ? 'Proveedores (Costos/Gastos)'
                : 'Clientes (Ingresos)'}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-[#4B5563] font-mono">
          <strong>UIT {anio}:</strong> S/ {uit.toFixed(2)} | <strong>Umbral (2 UIT):</strong> S/ {umbralDosUit.toFixed(2)}
        </div>
      </div>

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={filasMostradas}
          rowKey={(r) => r.id}
          totales={{
            razonSocial: <span className="font-bold">TOTAL EN VISTA ({filasMostradas.length} terceros)</span>,
            baseImponibleAcumulada: totalBase.toFixed(2),
          }}
        />
      </div>

      <VentanaModal
        abierto={Boolean(modalExclusionesItem)}
        onCerrar={() => setModalExclusionesItem(null)}
        titulo={`Depurar Operación con Tercero — RUC ${modalExclusionesItem?.numeroDoc || ''}`}
        ancho="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalExclusionesItem(null)}
              className="h-6 px-3 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarExclusion}
              className="h-6 px-3 bg-[#1E3A5F] text-[#FFFFFF] text-[12px] font-bold"
            >
              Confirmar Depuración
            </button>
          </div>
        }
      >
        {modalExclusionesItem && (
          <div className="space-y-2 text-[12px]">
            <div className="p-2 bg-[#F5F7FA] border border-[#D1D5DB]">
              <div className="font-bold text-[#1E3A5F]">{modalExclusionesItem.razonSocial}</div>
              <div className="font-mono text-[11px] text-[#4B5563]">
                RUC: {modalExclusionesItem.numeroDoc} · Base acumulada: S/ {modalExclusionesItem.baseImponibleAcumulada.toFixed(2)}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#111827] mb-0.5">
                Motivo Técnico / Legal de Exclusión (R.S. N° 024-2002/SUNAT)
              </label>
              <input
                type="text"
                value={motivoInput}
                onChange={(e) => setMotivoInput(e.target.value)}
                className="w-full h-6 px-2 text-[12px] border border-[#1E3A5F] bg-[#FFFFFF]"
              />
            </div>
          </div>
        )}
      </VentanaModal>
    </div>
  );
};
