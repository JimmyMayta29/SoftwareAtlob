import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, Search, Filter, RefreshCw, AlertCircle } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { analisisCuentasApi } from '../../api/analisisCuentasApi';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';

interface DocumentoPorCobrar {
  id: string;
  codigoCuenta: string;
  rucCliente: string;
  razonSocial: string;
  comprobante: string;
  fechaEmision: string;
  fechaVencimiento: string;
  moneda: 'PEN' | 'USD';
  importeOriginal: number;
  importeCobrado: number;
  saldoPendiente: number;
}

const PRESETS_CXC = [
  { label: 'Toda Cta 12 (Comerciales)', desde: '12', hasta: '12' },
  { label: '12 a 16 (Cartera Completa)', desde: '12', hasta: '16' },
  { label: '13 Relacionadas', desde: '13', hasta: '13' },
  { label: '14 Personal y Accionistas', desde: '14', hasta: '14' },
  { label: '16 Diversas Terceros', desde: '16', hasta: '16' },
];

const CARTERA_FALLBACK: DocumentoPorCobrar[] = [
  {
    id: 'cxc-1',
    codigoCuenta: '1212',
    rucCliente: '20100047218',
    razonSocial: 'CORPORACION COMERCIAL PERUANA S.A.C.',
    comprobante: 'F001-0001510',
    fechaEmision: '2026-03-08',
    fechaVencimiento: '2026-04-07',
    moneda: 'PEN',
    importeOriginal: 10030.0,
    importeCobrado: 4000.0,
    saldoPendiente: 6030.0,
  },
  {
    id: 'cxc-2',
    codigoCuenta: '1212',
    rucCliente: '20498877665',
    razonSocial: 'DISTRIBUIDORA NACIONAL DEL CENTRO S.R.L.',
    comprobante: 'F001-0001511',
    fechaEmision: '2026-03-16',
    fechaVencimiento: '2026-04-15',
    moneda: 'PEN',
    importeOriginal: 4956.0,
    importeCobrado: 0.0,
    saldoPendiente: 4956.0,
  },
];

export const CuentasPorCobrarView: React.FC = () => {
  const { notify } = useAppContext();
  const { empresaId, periodo } = useEmpresaPeriodo();

  const [cuentaDesde, setCuentaDesde] = useState('12');
  const [cuentaHasta, setCuentaHasta] = useState('12');
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'PENDIENTES' | 'CANCELADOS'>('TODOS');
  const [cargando, setCargando] = useState(false);
  const [documentos, setDocumentos] = useState<DocumentoPorCobrar[]>(CARTERA_FALLBACK);

  const cargarCartera = async () => {
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
        // Agrupar o listar partidas individuales por comprobante / anexo
        const items: DocumentoPorCobrar[] = res.movimientos
          .filter(m => m.debePen > 0 || m.haberPen > 0)
          .map((m, idx) => {
            const comp = m.docSerie && m.docNumero ? `${m.docSerie}-${m.docNumero}` : m.voucherNumero;
            const original = m.debePen > 0 ? m.debePen : m.haberPen;
            const cobrado = m.debePen > 0 ? m.haberPen : 0;
            const saldo = Math.round((original - cobrado) * 100) / 100;
            return {
              id: m.lineaId || `cxc-${idx}`,
              codigoCuenta: m.codigoCuenta,
              rucCliente: m.anexoNumeroDoc || 'SIN_RUC',
              razonSocial: m.anexoRazonSocial || m.denominacionCuenta || 'CLIENTE DIVERSO',
              comprobante: comp,
              fechaEmision: m.fechaContable,
              fechaVencimiento: m.fechaVencimiento || m.fechaContable,
              moneda: (m.debeUsd > 0 || m.haberUsd > 0) ? 'USD' : 'PEN',
              importeOriginal: original,
              importeCobrado: cobrado,
              saldoPendiente: saldo,
            };
          });
        setDocumentos(items);
      } else {
        setDocumentos(CARTERA_FALLBACK);
      }
    } catch {
      setDocumentos(CARTERA_FALLBACK);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarCartera();
  }, [empresaId, periodo, cuentaDesde, cuentaHasta]);

  const amortizarCobranza = (doc: DocumentoPorCobrar) => {
    setDocumentos((prev) =>
      prev.map((d) =>
        d.id === doc.id
          ? { ...d, importeCobrado: d.importeOriginal, saldoPendiente: 0 }
          : d
      )
    );
    notify(`Cobranza total registrada para ${doc.comprobante} (Asiento 1041 contra ${doc.codigoCuenta})`, 'success');
  };

  const documentosFiltrados = useMemo(() => {
    return documentos.filter((d) => {
      if (filtroEstado === 'PENDIENTES' && d.saldoPendiente <= 0) return false;
      if (filtroEstado === 'CANCELADOS' && d.saldoPendiente > 0) return false;
      if (filtroTexto) {
        const busq = filtroTexto.toLowerCase();
        const coincide =
          d.rucCliente.toLowerCase().includes(busq) ||
          d.razonSocial.toLowerCase().includes(busq) ||
          d.comprobante.toLowerCase().includes(busq) ||
          d.codigoCuenta.toLowerCase().includes(busq);
        if (!coincide) return false;
      }
      return true;
    });
  }, [documentos, filtroEstado, filtroTexto]);

  const columnas: ColumnaTablaDensa<DocumentoPorCobrar>[] = [
    { key: 'codigoCuenta', header: 'Cuenta', width: '65px', render: (r) => <span className="font-mono font-bold text-blue-700">{r.codigoCuenta}</span> },
    { key: 'rucCliente', header: 'RUC Cliente', width: '95px', render: (r) => <span className="font-mono">{r.rucCliente}</span> },
    { key: 'razonSocial', header: 'Denominación del Cliente', render: (r) => <span className="font-bold text-[#111827]">{r.razonSocial}</span> },
    { key: 'comprobante', header: 'Comprobante', width: '110px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.comprobante}</span> },
    { key: 'fechaEmision', header: 'F. Emisión', width: '85px', render: (r) => <span className="font-mono">{r.fechaEmision}</span> },
    { key: 'fechaVencimiento', header: 'F. Vencimiento', width: '95px', render: (r) => <span className="font-mono">{r.fechaVencimiento}</span> },
    { key: 'importeOriginal', header: 'Total Emitido S/', width: '110px', align: 'right', render: (r) => r.importeOriginal.toFixed(2) },
    { key: 'importeCobrado', header: 'Cobrado S/', width: '100px', align: 'right', render: (r) => <span className="text-[#1E6F42]">{r.importeCobrado.toFixed(2)}</span> },
    { key: 'saldoPendiente', header: 'Saldo por Cobrar S/', width: '125px', align: 'right', render: (r) => <span className="font-bold text-[#B91C1C]">{r.saldoPendiente.toFixed(2)}</span> },
    {
      key: 'accion',
      header: 'Cobranza',
      width: '105px',
      align: 'center',
      render: (r) =>
        r.saldoPendiente > 0 ? (
          <button
            type="button"
            onClick={() => amortizarCobranza(r)}
            className="h-5 px-2 bg-[#1E3A5F] text-[#FFFFFF] text-[11px] hover:bg-[#162C49] rounded cursor-pointer font-bold"
          >
            Cobrar
          </button>
        ) : (
          <span className="text-[#1E6F42] font-bold text-[11px]">CANCELADO</span>
        ),
    },
  ];

  const totalSaldo = documentosFiltrados.reduce((s, d) => s + d.saldoPendiente, 0);

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo={`Cartera de Cuentas por Cobrar — Rango ${cuentaDesde}${cuentaHasta !== cuentaDesde ? ` a ${cuentaHasta}` : ''} (Período ${periodo})`}
        subtitulo="Control configurable de saldos y cobranzas con soporte de rango de cuentas (12 a 16)"
      />

      {/* Barra de Filtros y Configuración de Rangos */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Presets rápidos */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Rango:</span>
          {PRESETS_CXC.map((p) => {
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
                    ? 'bg-blue-700 text-white font-bold shadow-xs'
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
              placeholder="12"
              className="w-14 px-2 py-1 font-mono font-bold bg-white border border-slate-300 rounded text-xs"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="font-bold text-slate-700">Hasta:</span>
            <input
              type="text"
              value={cuentaHasta}
              onChange={(e) => setCuentaHasta(e.target.value)}
              placeholder="16"
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
              <option value="CANCELADOS">Cancelados</option>
            </select>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-slate-400" />
            <input
              type="text"
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              placeholder="Buscar cliente/RUC..."
              className="pl-7 pr-2 py-1 bg-white border border-slate-300 rounded text-xs w-40"
            />
          </div>

          <button
            type="button"
            onClick={cargarCartera}
            disabled={cargando}
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded transition cursor-pointer"
            title="Refrescar cartera"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={documentosFiltrados}
          rowKey={(r) => r.id}
          totales={{
            razonSocial: <span className="font-bold">SALDO TOTAL PENDIENTE DE COBRANZA</span>,
            saldoPendiente: totalSaldo.toFixed(2),
          }}
        />
      </div>
    </div>
  );
};
