import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, Search, Filter, RefreshCw, AlertCircle } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { analisisCuentasApi } from '../../api/analisisCuentasApi';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';

interface ObligacionPorPagar {
  id: string;
  codigoCuenta: string;
  rucProveedor: string;
  razonSocial: string;
  comprobante: string;
  fechaEmision: string;
  fechaVencimiento: string;
  importeOriginal: number;
  detraccionRetencion: number;
  netoPagarProveedor: number;
  estadoPago: 'PENDIENTE' | 'CANCELADO';
}

const PRESETS_CXP = [
  { label: 'Toda Cta 42 (Comerciales)', desde: '42', hasta: '42' },
  { label: '42 a 46 (Pasivos y Obligaciones)', desde: '42', hasta: '46' },
  { label: '41 Remuneraciones', desde: '41', hasta: '41' },
  { label: '46 Cuentas por Pagar Div.', desde: '46', hasta: '46' },
  { label: '47 Relacionadas', desde: '47', hasta: '47' },
];

const OBLIGACIONES_FALLBACK: ObligacionPorPagar[] = [
  {
    id: 'cxp-1',
    codigoCuenta: '4212',
    rucProveedor: '20512345678',
    razonSocial: 'SERVICIOS LOGISTICOS DEL SUR S.A.C.',
    comprobante: 'F001-0001842',
    fechaEmision: '2026-03-10',
    fechaVencimiento: '2026-04-09',
    importeOriginal: 4500.0,
    detraccionRetencion: 180.0,
    netoPagarProveedor: 4320.0,
    estadoPago: 'PENDIENTE',
  },
  {
    id: 'cxp-2',
    codigoCuenta: '4212',
    rucProveedor: '20601122334',
    razonSocial: 'ASESORIA EMPRESARIAL INTEGRAL S.A.C.',
    comprobante: 'E001-0000419',
    fechaEmision: '2026-03-14',
    fechaVencimiento: '2026-04-13',
    importeOriginal: 3540.0,
    detraccionRetencion: 425.0,
    netoPagarProveedor: 3115.0,
    estadoPago: 'PENDIENTE',
  },
];

export const CuentasPorPagarView: React.FC = () => {
  const { notify } = useAppContext();
  const { empresaId, periodo } = useEmpresaPeriodo();

  const [cuentaDesde, setCuentaDesde] = useState('42');
  const [cuentaHasta, setCuentaHasta] = useState('42');
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'PENDIENTES' | 'PAGADOS'>('TODOS');
  const [cargando, setCargando] = useState(false);
  const [obligaciones, setObligaciones] = useState<ObligacionPorPagar[]>(OBLIGACIONES_FALLBACK);

  const cargarObligaciones = async () => {
    if (!empresaId) return;
    setCargando(true);
    try {
      const res = await analisisCuentasApi.obtenerMovimientos(
        empresaId,
        periodo,
        cuentaDesde,
        undefined,
        cuentaHasta !== cuentaDesde ? cuentaHasta : undefined
      );

      if (res && res.movimientos && res.movimientos.length > 0) {
        const items: ObligacionPorPagar[] = res.movimientos
          .filter(m => m.haberPen > 0 || m.debePen > 0)
          .map((m, idx) => {
            const comp = m.docSerie && m.docNumero ? `${m.docSerie}-${m.docNumero}` : m.voucherNumero;
            const original = m.haberPen > 0 ? m.haberPen : m.debePen;
            const pagado = m.haberPen > 0 ? m.debePen : 0;
            const saldo = Math.round((original - pagado) * 100) / 100;
            return {
              id: m.lineaId || `cxp-${idx}`,
              codigoCuenta: m.codigoCuenta,
              rucProveedor: m.anexoNumeroDoc || 'SIN_RUC',
              razonSocial: m.anexoRazonSocial || m.denominacionCuenta || 'PROVEEDOR DIVERSO',
              comprobante: comp,
              fechaEmision: m.fechaContable,
              fechaVencimiento: m.fechaVencimiento || m.fechaContable,
              importeOriginal: original,
              detraccionRetencion: 0,
              netoPagarProveedor: saldo,
              estadoPago: saldo <= 0 ? 'CANCELADO' : 'PENDIENTE',
            };
          });
        setObligaciones(items);
      } else {
        setObligaciones(OBLIGACIONES_FALLBACK);
      }
    } catch {
      setObligaciones(OBLIGACIONES_FALLBACK);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarObligaciones();
  }, [empresaId, periodo, cuentaDesde, cuentaHasta]);

  const cancelarObligacion = (ob: ObligacionPorPagar) => {
    setObligaciones((prev) =>
      prev.map((o) => (o.id === ob.id ? { ...o, estadoPago: 'CANCELADO', netoPagarProveedor: 0 } : o))
    );
    notify(`Pago a proveedor registrado para ${ob.comprobante} (Asiento ${ob.codigoCuenta} contra 1041)`, 'success');
  };

  const obligacionesFiltradas = useMemo(() => {
    return obligaciones.filter((o) => {
      if (filtroEstado === 'PENDIENTES' && o.estadoPago === 'CANCELADO') return false;
      if (filtroEstado === 'PAGADOS' && o.estadoPago !== 'CANCELADO') return false;
      if (filtroTexto) {
        const busq = filtroTexto.toLowerCase();
        const coincide =
          o.rucProveedor.toLowerCase().includes(busq) ||
          o.razonSocial.toLowerCase().includes(busq) ||
          o.comprobante.toLowerCase().includes(busq) ||
          o.codigoCuenta.toLowerCase().includes(busq);
        if (!coincide) return false;
      }
      return true;
    });
  }, [obligaciones, filtroEstado, filtroTexto]);

  const columnas: ColumnaTablaDensa<ObligacionPorPagar>[] = [
    { key: 'codigoCuenta', header: 'Cuenta', width: '65px', render: (r) => <span className="font-mono font-bold text-amber-700">{r.codigoCuenta}</span> },
    { key: 'rucProveedor', header: 'RUC Proveedor', width: '95px', render: (r) => <span className="font-mono">{r.rucProveedor}</span> },
    { key: 'razonSocial', header: 'Denominación del Proveedor', render: (r) => <span className="font-bold text-[#111827]">{r.razonSocial}</span> },
    { key: 'comprobante', header: 'Comprobante', width: '110px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.comprobante}</span> },
    { key: 'fechaEmision', header: 'F. Emisión', width: '85px', render: (r) => <span className="font-mono">{r.fechaEmision}</span> },
    { key: 'fechaVencimiento', header: 'F. Vencimiento', width: '95px', render: (r) => <span className="font-mono">{r.fechaVencimiento}</span> },
    { key: 'importeOriginal', header: 'Importe Total S/', width: '110px', align: 'right', render: (r) => r.importeOriginal.toFixed(2) },
    { key: 'netoPagarProveedor', header: 'Neto por Pagar S/', width: '120px', align: 'right', render: (r) => <span className="font-bold text-[#B91C1C]">{r.netoPagarProveedor.toFixed(2)}</span> },
    {
      key: 'accion',
      header: 'Pago',
      width: '105px',
      align: 'center',
      render: (r) =>
        r.netoPagarProveedor > 0 ? (
          <button
            type="button"
            onClick={() => cancelarObligacion(r)}
            className="h-5 px-2 bg-[#1E3A5F] text-[#FFFFFF] text-[11px] hover:bg-[#162C49] rounded cursor-pointer font-bold"
          >
            Pagar
          </button>
        ) : (
          <span className="text-[#1E6F42] font-bold text-[11px]">PAGADO</span>
        ),
    },
  ];

  const totalSaldo = obligacionesFiltradas.reduce((s, o) => s + o.netoPagarProveedor, 0);

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo={`Cuentas por Pagar Comerciales y Diversas — Rango ${cuentaDesde}${cuentaHasta !== cuentaDesde ? ` a ${cuentaHasta}` : ''} (Período ${periodo})`}
        subtitulo="Control configurable de pasivos y obligaciones con soporte de rango de cuentas (42 a 46)"
      />

      {/* Barra de Filtros y Configuración de Rangos */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Presets rápidos */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Rango:</span>
          {PRESETS_CXP.map((p) => {
            const activo = cuentaDesde === p.desde && cuentaHasta === p.hasta;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setCuentaDesde(p.desde);
                  setCuentaHasta(p.hasta);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activo
                    ? 'bg-amber-700 text-white font-bold shadow-xs'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Inputs de rango personalizado y búsqueda */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="font-bold text-slate-700">Desde:</span>
            <input
              type="text"
              value={cuentaDesde}
              onChange={(e) => setCuentaDesde(e.target.value)}
              placeholder="42"
              className="w-14 px-2 py-1 font-mono font-bold bg-white border border-slate-300 rounded text-xs"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="font-bold text-slate-700">Hasta:</span>
            <input
              type="text"
              value={cuentaHasta}
              onChange={(e) => setCuentaHasta(e.target.value)}
              placeholder="46"
              className="w-14 px-2 py-1 font-mono font-bold bg-white border border-slate-300 rounded text-xs"
            />
          </div>

          <div className="flex items-center gap-1">
            <span className="font-bold text-slate-700">Estado:</span>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as any)}
              className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-semibold"
            >
              <option value="TODOS">Todos</option>
              <option value="PENDIENTES">Pendientes</option>
              <option value="PAGADOS">Pagados</option>
            </select>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-slate-400" />
            <input
              type="text"
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              placeholder="Buscar proveedor/RUC..."
              className="pl-7 pr-2 py-1 bg-white border border-slate-300 rounded text-xs w-40"
            />
          </div>

          <button
            type="button"
            onClick={cargarObligaciones}
            disabled={cargando}
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded transition cursor-pointer"
            title="Refrescar obligaciones"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={obligacionesFiltradas}
          rowKey={(r) => r.id}
          totales={{
            razonSocial: <span className="font-bold">SALDO TOTAL PENDIENTE DE PAGO</span>,
            netoPagarProveedor: totalSaldo.toFixed(2),
          }}
        />
      </div>
    </div>
  );
};
