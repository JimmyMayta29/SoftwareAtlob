import React, { useState } from 'react';
import { RefreshCw, Play, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { CampoNumerico } from '../ui/CampoNumerico';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';

interface PartidaMonedaExtranjera {
  id: string;
  cuenta: string;
  denominacion: string;
  naturaleza: 'ACTIVO' | 'PASIVO';
  saldoUsd: number;
  tcOrigen: number;
  saldoPenLibros: number;
  tcCierre: number;
  saldoPenAjustado: number;
  diferenciaPen: number;
  cuentaAjuste: '676' | '776';
}

export const DiferenciaCambioView: React.FC = () => {
  const { state, notify } = useAppContext();
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-03');
  const [tcCompraCierre, setTcCompraCierre] = useState('3.748');
  const [tcVentaCierre, setTcVentaCierre] = useState('3.758');
  const [procesando, setProcesando] = useState(false);
  const [resultadoAsiento, setResultadoAsiento] = useState<{ numero?: string; mensaje?: string } | null>(null);

  const tcCompra = Number(tcCompraCierre) || 3.748;
  const tcVenta = Number(tcVentaCierre) || 3.758;

  const partidas: PartidaMonedaExtranjera[] = [
    {
      id: 'dc-1',
      cuenta: '104102',
      denominacion: 'Cuentas corrientes operativas ME (USD)',
      naturaleza: 'ACTIVO',
      saldoUsd: 12500,
      tcOrigen: 3.720,
      saldoPenLibros: 46500,
      tcCierre: tcCompra,
      saldoPenAjustado: Number((12500 * tcCompra).toFixed(2)),
      diferenciaPen: Number((12500 * tcCompra - 46500).toFixed(2)),
      cuentaAjuste: 12500 * tcCompra - 46500 >= 0 ? '776' : '676',
    },
    {
      id: 'dc-2',
      cuenta: '121202',
      denominacion: 'Facturas por cobrar emitidas en cartera ME (USD)',
      naturaleza: 'ACTIVO',
      saldoUsd: 8400,
      tcOrigen: 3.760,
      saldoPenLibros: 31584,
      tcCierre: tcCompra,
      saldoPenAjustado: Number((8400 * tcCompra).toFixed(2)),
      diferenciaPen: Number((8400 * tcCompra - 31584).toFixed(2)),
      cuentaAjuste: 8400 * tcCompra - 31584 >= 0 ? '776' : '676',
    },
    {
      id: 'dc-3',
      cuenta: '421202',
      denominacion: 'Facturas por pagar emitidas ME (USD)',
      naturaleza: 'PASIVO',
      saldoUsd: 15200,
      tcOrigen: 3.730,
      saldoPenLibros: 56696,
      tcCierre: tcVenta,
      saldoPenAjustado: Number((15200 * tcVenta).toFixed(2)),
      diferenciaPen: Number((56696 - 15200 * tcVenta).toFixed(2)),
      cuentaAjuste: 56696 - 15200 * tcVenta >= 0 ? '776' : '676',
    },
  ];

  const ejecutarAjusteDiferenciaCambio = async () => {
    setProcesando(true);
    try {
      const res = await fetch('/api/operaciones/cierre/diferencia-cambio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        },
        body: JSON.stringify({
          periodo,
          tcCompraCierre: tcCompra,
          tcVentaCierre: tcVenta,
        }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setResultadoAsiento({
          numero: json.data?.asiento?.correlativo || '06-0001',
          mensaje: json.message || 'Asiento de diferencia de cambio NIC 21 generado.',
        });
        notify('Ajuste por diferencia de cambio NIC 21 contabilizado', 'success');
      } else {
        notify(json.message || 'No se pudo generar el asiento de diferencia de cambio', 'error');
      }
    } catch {
      notify('Error de conexión al ejecutar el ajuste de diferencia de cambio', 'error');
    } finally {
      setProcesando(false);
    }
  };

  const columnas: ColumnaTablaDensa<PartidaMonedaExtranjera>[] = [
    { key: 'cuenta', header: 'Cuenta PCGE', width: '95px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.cuenta}</span> },
    { key: 'denominacion', header: 'Denominación de Partida Monetaria', render: (r) => r.denominacion },
    { key: 'naturaleza', header: 'Rubro', width: '80px', align: 'center', render: (r) => <span className="text-[11px] font-bold">{r.naturaleza}</span> },
    { key: 'saldoUsd', header: 'Saldo USD', width: '105px', align: 'right', render: (r) => r.saldoUsd.toFixed(2) },
    { key: 'tcOrigen', header: 'TC Libros', width: '85px', align: 'right', render: (r) => r.tcOrigen.toFixed(3) },
    { key: 'saldoPenLibros', header: 'Saldo Libros S/', width: '115px', align: 'right', render: (r) => r.saldoPenLibros.toFixed(2) },
    { key: 'tcCierre', header: 'TC Cierre SBS', width: '95px', align: 'right', render: (r) => r.tcCierre.toFixed(3) },
    { key: 'saldoPenAjustado', header: 'Saldo Cierre S/', width: '115px', align: 'right', render: (r) => r.saldoPenAjustado.toFixed(2) },
    {
      key: 'diferenciaPen',
      header: 'Ajuste S/',
      width: '105px',
      align: 'right',
      render: (r) => (
        <span className={`font-bold ${r.diferenciaPen >= 0 ? 'text-[#1E6F42]' : 'text-[#B91C1C]'}`}>
          {r.diferenciaPen >= 0 ? '+' : ''}{r.diferenciaPen.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'cuentaAjuste',
      header: 'Cta. Destino',
      width: '90px',
      align: 'center',
      render: (r) => (
        <span className="font-mono text-[11px] font-bold">
          {r.cuentaAjuste === '776' ? '776 Ganancia' : '676 Pérdida'}
        </span>
      ),
    },
  ];

  const totalGanancia = partidas.filter((p) => p.diferenciaPen > 0).reduce((s, p) => s + p.diferenciaPen, 0);
  const totalPerdida = partidas.filter((p) => p.diferenciaPen < 0).reduce((s, p) => s + Math.abs(p.diferenciaPen), 0);

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Ajuste Mensual por Diferencia de Cambio (NIC 21 / Art. 61° LIR)"
        subtitulo="Valuación de saldos de activos (TC Compra SBS) y pasivos (TC Venta SBS) en moneda extranjera"
        acciones={[
          {
            id: 'ejecutar',
            label: procesando ? 'Procesando...' : 'Generar asiento NIC 21',
            icono: Play,
            primario: true,
            disabled: procesando,
            onClick: ejecutarAjusteDiferenciaCambio,
          },
        ]}
        derecha={<SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-36">
            <CampoNumerico
              label="TC Compra Cierre SBS (Activo)"
              value={tcCompraCierre}
              onChange={setTcCompraCierre}
              decimales={3}
            />
          </div>
          <div className="w-36">
            <CampoNumerico
              label="TC Venta Cierre SBS (Pasivo)"
              value={tcVentaCierre}
              onChange={setTcVentaCierre}
              decimales={3}
            />
          </div>
          <div className="text-[11px] text-[#4B5563]">
            <div><strong>Criterio tributario:</strong> Art. 61° inc. d) TUO Ley del Impuesto a la Renta</div>
            <div>Activos monetarios al TC Compra vigente al cierre · Pasivos monetarios al TC Venta vigente al cierre</div>
          </div>
        </div>

        {resultadoAsiento && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#ECFDF5] border border-[#1E6F42] text-[#1E6F42] text-[12px]">
            <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            <span><strong>Voucher {resultadoAsiento.numero}:</strong> {resultadoAsiento.mensaje}</span>
          </div>
        )}
      </div>

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={partidas}
          rowKey={(r) => r.id}
          totales={{
            denominacion: <span className="font-bold">RESUMEN DE AJUSTE DEL PERÍODO ({periodo})</span>,
            saldoPenLibros: <span className="text-[#1E6F42]">776: S/ {totalGanancia.toFixed(2)}</span>,
            saldoPenAjustado: <span className="text-[#B91C1C]">676: S/ {totalPerdida.toFixed(2)}</span>,
            diferenciaPen: (totalGanancia - totalPerdida).toFixed(2),
          }}
        />
      </div>
    </div>
  );
};
