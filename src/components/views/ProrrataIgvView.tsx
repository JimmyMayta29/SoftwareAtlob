import React, { useState, useMemo } from 'react';
import { Calculator, CheckCircle2, RefreshCw } from 'lucide-react';
import Decimal from 'decimal.js';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';

interface MesProrrata {
  periodo: string;
  ventasGravadas: number;
  exportaciones: number;
  ventasNoGravadas: number;
}

const MESES_REGULARIZACION_INICIAL: MesProrrata[] = [
  { periodo: '2025-10', ventasGravadas: 48500.0, exportaciones: 0.0, ventasNoGravadas: 12000.0 },
  { periodo: '2025-11', ventasGravadas: 52000.0, exportaciones: 0.0, ventasNoGravadas: 15000.0 },
  { periodo: '2025-12', ventasGravadas: 61000.0, exportaciones: 8000.0, ventasNoGravadas: 18000.0 },
  { periodo: '2026-01', ventasGravadas: 44000.0, exportaciones: 0.0, ventasNoGravadas: 11000.0 },
  { periodo: '2026-02', ventasGravadas: 46500.0, exportaciones: 0.0, ventasNoGravadas: 13500.0 },
  { periodo: '2026-03', ventasGravadas: 50000.0, exportaciones: 5000.0, ventasNoGravadas: 14000.0 },
  { periodo: '2026-04', ventasGravadas: 53000.0, exportaciones: 0.0, ventasNoGravadas: 16000.0 },
  { periodo: '2026-05', ventasGravadas: 49000.0, exportaciones: 0.0, ventasNoGravadas: 12500.0 },
  { periodo: '2026-06', ventasGravadas: 55000.0, exportaciones: 4000.0, ventasNoGravadas: 15000.0 },
  { periodo: '2026-07', ventasGravadas: 58000.0, exportaciones: 0.0, ventasNoGravadas: 17000.0 },
  { periodo: '2026-08', ventasGravadas: 51500.0, exportaciones: 0.0, ventasNoGravadas: 14500.0 },
  { periodo: '2026-09', ventasGravadas: 60000.0, exportaciones: 0.0, ventasNoGravadas: 40000.0 },
];

export const ProrrataIgvView: React.FC = () => {
  const { notify } = useAppContext();
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState('2026-09');
  const [modoCalculo, setModoCalculo] = useState<'ACUMULADO_12M' | 'MENSUAL'>('MENSUAL');
  const [meses, setMeses] = useState<MesProrrata[]>(MESES_REGULARIZACION_INICIAL);
  const [comprasUsoComunBase, setComprasUsoComunBase] = useState('10000.00');
  const [comprasUsoComunIgv, setComprasUsoComunIgv] = useState('1800.00');
  const [integrarConPdt621, setIntegrarConPdt621] = useState<boolean>(true);

  const calculo = useMemo(() => {
    const lista =
      modoCalculo === 'MENSUAL'
        ? meses.filter((m) => m.periodo === periodoSeleccionado)
        : meses;

    const totalGravadas = lista.reduce(
      (acc, m) => acc.plus(new Decimal(m.ventasGravadas)),
      new Decimal(0)
    );
    const totalExportaciones = lista.reduce(
      (acc, m) => acc.plus(new Decimal(m.exportaciones)),
      new Decimal(0)
    );
    const totalNoGravadas = lista.reduce(
      (acc, m) => acc.plus(new Decimal(m.ventasNoGravadas)),
      new Decimal(0)
    );

    const numerador = totalGravadas.plus(totalExportaciones);
    const denominador = numerador.plus(totalNoGravadas);

    const porcentajeProrrata = denominador.gt(0)
      ? numerador.div(denominador).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      : new Decimal(100);
    const coeficiente = porcentajeProrrata.div(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

    const igvComun = new Decimal(comprasUsoComunIgv || '0');
    const creditoFiscalAdmitido = igvComun
      .mul(coeficiente)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const igvCostoGasto64111 = Decimal.max(0, igvComun.minus(creditoFiscalAdmitido));

    return {
      totalGravadas,
      totalExportaciones,
      totalNoGravadas,
      numerador,
      denominador,
      porcentajeProrrata,
      coeficiente,
      igvComun,
      creditoFiscalAdmitido,
      igvCostoGasto64111,
    };
  }, [meses, modoCalculo, periodoSeleccionado, comprasUsoComunIgv]);

  const handleActualizarMesActual = (campo: 'ventasGravadas' | 'exportaciones' | 'ventasNoGravadas', valor: string) => {
    const num = parseFloat(valor) || 0;
    setMeses((prev) =>
      prev.map((m) => (m.periodo === periodoSeleccionado ? { ...m, [campo]: num } : m))
    );
  };

  const mesActualObj = meses.find((m) => m.periodo === periodoSeleccionado) || meses[meses.length - 1];

  const columnas: ColumnaTablaDensa<MesProrrata>[] = [
    {
      key: 'periodo',
      header: 'Período Tributario',
      width: '120px',
      render: (r) => (
        <span className={`font-mono font-bold ${r.periodo === periodoSeleccionado ? 'text-[#1D4ED8]' : 'text-[#1E3A5F]'}`}>
          {r.periodo}
        </span>
      ),
    },
    {
      key: 'ventasGravadas',
      header: 'Operaciones Gravadas S/',
      align: 'right',
      render: (r) => <span className="font-mono">{r.ventasGravadas.toFixed(2)}</span>,
    },
    {
      key: 'exportaciones',
      header: 'Exportaciones S/',
      align: 'right',
      render: (r) => <span className="font-mono">{r.exportaciones.toFixed(2)}</span>,
    },
    {
      key: 'ventasNoGravadas',
      header: 'Operaciones No Gravadas S/',
      align: 'right',
      render: (r) => <span className="font-mono text-[#B45309]">{r.ventasNoGravadas.toFixed(2)}</span>,
    },
    {
      key: 'subtotal',
      header: 'Total Operaciones Mes S/',
      align: 'right',
      render: (r) => {
        const sub = r.ventasGravadas + r.exportaciones + r.ventasNoGravadas;
        return <span className="font-mono font-bold">{sub.toFixed(2)}</span>;
      },
    },
    {
      key: 'pctMes',
      header: '% Gravado Mes',
      width: '110px',
      align: 'right',
      render: (r) => {
        const num = r.ventasGravadas + r.exportaciones;
        const den = num + r.ventasNoGravadas;
        const pct = den > 0 ? ((num / den) * 100).toFixed(2) : '100.00';
        return <span className="font-mono font-bold text-[#1E6F42]">{pct}%</span>;
      },
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Prorrata del Crédito Fiscal del IGV (Art. 23° TUO LIGV y Art. 6° num. 6 Reglamento)"
        subtitulo="Determinación del porcentaje de operaciones gravadas y distribución del crédito fiscal de utilización común (Destino 2)"
        acciones={[
          {
            id: 'guardar-prorrata',
            label: 'Aplicar y Guardar Prorrata',
            icono: Calculator,
            primario: true,
            onClick: () =>
              notify(
                `Prorrata ${periodoSeleccionado} calculada: ${calculo.porcentajeProrrata.toFixed(2)}% (Crédito admitido: S/ ${calculo.creditoFiscalAdmitido.toFixed(2)} | Cta. 64111: S/ ${calculo.igvCostoGasto64111.toFixed(2)})`,
                'success'
              ),
          },
          {
            id: 'recalcular-12m',
            label: 'Recalcular 12 Meses',
            icono: RefreshCw,
            onClick: () => notify('Ventana móvil de 12 meses actualizada desde Registro de Ventas', 'info'),
          },
        ]}
        derecha={
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-[#4B5563]">Base cálculo:</label>
            <select
              value={modoCalculo}
              onChange={(e) => setModoCalculo(e.target.value as 'ACUMULADO_12M' | 'MENSUAL')}
              className="h-6 px-2 text-[12px] bg-[#FFFFFF] border border-[#D1D5DB]"
            >
              <option value="MENSUAL">Proporción del Mes Seleccionado</option>
              <option value="ACUMULADO_12M">Regularización Acumulada 12 Meses (Art. 6° Rgto.)</option>
            </select>
            <select
              value={periodoSeleccionado}
              onChange={(e) => setPeriodoSeleccionado(e.target.value)}
              className="h-6 px-2 text-[12px] font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
            >
              <option value="2026-09">2026-09</option>
              <option value="2026-08">2026-08</option>
              <option value="2026-07">2026-07</option>
            </select>
          </div>
        }
      />

      <div className="p-3 grid grid-cols-12 gap-3 border-b border-[#D1D5DB] bg-[#F5F7FA] text-[12px]">
        {/* Columna izquierda: Parámetros del mes y Compras de uso común */}
        <div className="col-span-5 border border-[#D1D5DB] bg-[#FFFFFF] p-2.5 space-y-2">
          <div className="font-bold text-[#1E3A5F] border-b border-[#D1D5DB] pb-1 flex items-center justify-between">
            <span>1. Operaciones del Período ({periodoSeleccionado}) y Compras Comunes</span>
            <span className="font-mono text-[11px] text-[#4B5563]">Destino Mixto (Tipo 2)</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] text-[#4B5563]">Ventas Gravadas S/</label>
              <input
                type="number"
                step="0.01"
                value={mesActualObj.ventasGravadas}
                onChange={(e) => handleActualizarMesActual('ventasGravadas', e.target.value)}
                className="w-full h-6 px-1.5 text-right font-mono text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#4B5563]">Exportaciones S/</label>
              <input
                type="number"
                step="0.01"
                value={mesActualObj.exportaciones}
                onChange={(e) => handleActualizarMesActual('exportaciones', e.target.value)}
                className="w-full h-6 px-1.5 text-right font-mono text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#4B5563]">Ventas No Gravadas S/</label>
              <input
                type="number"
                step="0.01"
                value={mesActualObj.ventasNoGravadas}
                onChange={(e) => handleActualizarMesActual('ventasNoGravadas', e.target.value)}
                className="w-full h-6 px-1.5 text-right font-mono text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#E5E7EB]">
            <div>
              <label className="block text-[11px] text-[#4B5563]">Compras Comunes Base (Cas. 110) S/</label>
              <input
                type="number"
                step="0.01"
                value={comprasUsoComunBase}
                onChange={(e) => {
                  setComprasUsoComunBase(e.target.value);
                  const base = parseFloat(e.target.value) || 0;
                  setComprasUsoComunIgv((base * 0.18).toFixed(2));
                }}
                className="w-full h-6 px-1.5 text-right font-mono text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#4B5563]">IGV Compras Comunes (18%) S/</label>
              <input
                type="number"
                step="0.01"
                value={comprasUsoComunIgv}
                onChange={(e) => setComprasUsoComunIgv(e.target.value)}
                className="w-full h-6 px-1.5 text-right font-mono text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]"
              />
            </div>
          </div>

          <div className="pt-1 border-t border-[#E5E7EB] flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-[#111827] cursor-pointer">
              <input
                type="checkbox"
                checked={integrarConPdt621}
                onChange={(e) => setIntegrarConPdt621(e.target.checked)}
              />
              Integrar automáticamente con Declaración Mensual PDT 621 (Casilla 111 / 173)
            </label>
            {integrarConPdt621 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#1E6F42] bg-[#ECFDF5] border border-[#1E6F42] px-1.5 py-0.5">
                <CheckCircle2 className="w-3 h-3" /> ACTIVO
              </span>
            )}
          </div>
        </div>

        {/* Columna derecha: Resultado de la Prorrata y Asiento de Costo/Gasto */}
        <div className="col-span-7 border border-[#D1D5DB] bg-[#FFFFFF] p-2.5 flex flex-col justify-between">
          <div className="font-bold text-[#1E3A5F] border-b border-[#D1D5DB] pb-1 flex items-center justify-between">
            <span>2. Liquidación del Coeficiente de Prorrata y Distribución del IGV Común</span>
            <span className="font-mono text-[11px] text-[#1D4ED8] font-bold">
              Coeficiente [Cas. 173]: {calculo.coeficiente.toFixed(4)} ({calculo.porcentajeProrrata.toFixed(2)}%)
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 my-1.5">
            <div className="p-2 bg-[#F5F7FA] border border-[#D1D5DB]">
              <div className="text-[10px] text-[#4B5563] uppercase">Numerador (Grav. + Exp.)</div>
              <div className="font-mono font-bold text-[13px] text-[#111827]">
                S/ {calculo.numerador.toFixed(2)}
              </div>
            </div>
            <div className="p-2 bg-[#F5F7FA] border border-[#D1D5DB]">
              <div className="text-[10px] text-[#4B5563] uppercase">Denominador (Total Op.)</div>
              <div className="font-mono font-bold text-[13px] text-[#111827]">
                S/ {calculo.denominador.toFixed(2)}
              </div>
            </div>
            <div className="p-2 bg-[#E8ECF1] border border-[#1E3A5F]">
              <div className="text-[10px] text-[#1E3A5F] font-bold uppercase">Porcentaje Aplicable</div>
              <div className="font-mono font-bold text-[14px] text-[#1D4ED8]">
                {calculo.porcentajeProrrata.toFixed(2)}%
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="p-2 bg-[#ECFDF5] border border-[#1E6F42] flex items-center justify-between">
              <div>
                <div className="font-bold text-[#1E6F42]">Crédito Fiscal Admitido [Cas. 111]</div>
                <div className="text-[10px] text-[#4B5563]">Cta. 40111 — IGV Cuenta Propia</div>
              </div>
              <div className="font-mono font-bold text-[14px] text-[#1E6F42]">
                S/ {calculo.creditoFiscalAdmitido.toFixed(2)}
              </div>
            </div>

            <div className="p-2 bg-[#FEF3C7] border border-[#B45309] flex items-center justify-between">
              <div>
                <div className="font-bold text-[#B45309]">IGV No Admitido (Costo / Gasto)</div>
                <div className="text-[10px] text-[#4B5563]">Cta. 64111 — IGV por Prorrata (Art. 69° LIGV)</div>
              </div>
              <div className="font-mono font-bold text-[14px] text-[#B45309]">
                S/ {calculo.igvCostoGasto64111.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla densa de los 12 meses */}
      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <div className="text-[11px] font-bold text-[#1E3A5F] mb-1">
          Detalle de Operaciones de los Últimos 12 Meses (Base de Regularización Anual / Mensual)
        </div>
        <TablaDensa
          columnas={columnas}
          datos={meses}
          rowKey={(r) => r.periodo}
          totales={{
            periodo: <span className="font-bold">TOTAL 12M</span>,
            ventasGravadas: meses.reduce((s, m) => s + m.ventasGravadas, 0).toFixed(2),
            exportaciones: meses.reduce((s, m) => s + m.exportaciones, 0).toFixed(2),
            ventasNoGravadas: meses.reduce((s, m) => s + m.ventasNoGravadas, 0).toFixed(2),
            subtotal: meses
              .reduce((s, m) => s + m.ventasGravadas + m.exportaciones + m.ventasNoGravadas, 0)
              .toFixed(2),
            pctMes: `${calculo.porcentajeProrrata.toFixed(2)}%`,
          }}
        />
      </div>
    </div>
  );
};
