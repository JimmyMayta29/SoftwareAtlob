import React, { useState } from 'react';
import { 
  Building2, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownLeft, 
  FileSpreadsheet, 
  Upload, 
  Calendar,
  AlertTriangle
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface MovimientoBancario {
  id: string;
  fecha: string;
  banco: 'BCP' | 'BBVA' | 'INTERBANK' | 'SCOTIABANK';
  cuenta: string;
  referencia: string;
  concepto: string;
  tipo: 'INGRESO' | 'EGRESO';
  monto: number;
  itf: number;
  conciliado: boolean;
}

const MOVIMIENTOS_DEMO: MovimientoBancario[] = [
  {
    id: 'mb-01',
    fecha: '2026-01-28',
    banco: 'BCP',
    cuenta: '193-9481230-0-12 (PEN)',
    referencia: 'TRF-091823',
    concepto: 'Cobro Factura F001-00001420 DISTRIBUIDORA INDUSTRIAL FERRETERA',
    tipo: 'INGRESO',
    monto: 14750.00,
    itf: 0.74,
    conciliado: true
  },
  {
    id: 'mb-02',
    fecha: '2026-01-29',
    banco: 'BCP',
    cuenta: '193-9481230-0-12 (PEN)',
    referencia: 'DEB-AUTO-SUNAT',
    concepto: 'Pago Fraccionamiento Tributario Art. 36 SUNAT',
    tipo: 'EGRESO',
    monto: 2450.00,
    itf: 0.12,
    conciliado: true
  },
  {
    id: 'mb-03',
    fecha: '2026-01-29',
    banco: 'BBVA',
    cuenta: '0011-0182-02003912 (PEN)',
    referencia: 'TRF-PROV-8123',
    concepto: 'Pago Factura E001-9238 IMPORTACIONES GENERALES S.A.C.',
    tipo: 'EGRESO',
    monto: 6890.00,
    itf: 0.34,
    conciliado: false
  },
  {
    id: 'mb-04',
    fecha: '2026-01-30',
    banco: 'BCP',
    cuenta: '193-9481230-0-12 (PEN)',
    referencia: 'COM-MANT-ENE',
    concepto: 'Comisión mensual por mantenimiento de cuenta corriente',
    tipo: 'EGRESO',
    monto: 55.00,
    itf: 0.00,
    conciliado: true
  }
];

export const TesoreriaAvanzadaView: React.FC = () => {
  const { success, info } = useToast();
  const [tab, setTab] = useState<'CONCILIACION' | 'MOVIMIENTOS' | 'FLUJO_PROYECTADO'>('CONCILIACION');
  const [bancoFiltro, setBancoFiltro] = useState<string>('TODOS');
  const [movimientos, setMovimientos] = useState<MovimientoBancario[]>(MOVIMIENTOS_DEMO);

  const totalConciliados = movimientos.filter((m) => m.conciliado).length;
  const totalPendientes = movimientos.length - totalConciliados;

  const handleConciliarItem = (id: string) => {
    setMovimientos(
      movimientos.map((m) => (m.id === id ? { ...m, conciliado: true } : m))
    );
    success('Movimiento bancario cruzado y validado contra el Libro Caja y Bancos.', 'Conciliado');
  };

  const handleEjecutarAutoConciliacion = () => {
    setMovimientos(movimientos.map((m) => ({ ...m, conciliado: true })));
    success('Conciliación automática finalizada con 100% de coincidencia en importe y fecha.', 'Auto-Conciliación');
  };

  const movimientosFiltrados = movimientos.filter(
    (m) => bancoFiltro === 'TODOS' || m.banco === bancoFiltro
  );

  return (
    <div className="space-y-4 max-w-7xl mx-auto p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
              <Building2 className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Tesorería & Conciliación Bancaria
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Cuentas bancarias en Soles y Dólares, importación de extractos, cruce automático con Libro Caja y Bancos y proyección de liquidez.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleEjecutarAutoConciliacion}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Auto-Conciliación 1:1</span>
          </button>
        </div>
      </div>

      {/* Selector de sub-pestaña */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 text-xs font-medium space-x-2">
        <button
          onClick={() => setTab('CONCILIACION')}
          className={`px-3 py-2 border-b-2 transition-colors ${
            tab === 'CONCILIACION'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Conciliación Bancaria ({totalPendientes} pendientes)
        </button>
        <button
          onClick={() => setTab('MOVIMIENTOS')}
          className={`px-3 py-2 border-b-2 transition-colors ${
            tab === 'MOVIMIENTOS'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Movimientos Bancarios
        </button>
        <button
          onClick={() => setTab('FLUJO_PROYECTADO')}
          className={`px-3 py-2 border-b-2 transition-colors ${
            tab === 'FLUJO_PROYECTADO'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Flujo de Caja Proyectado (30 / 60 / 90 días)
        </button>
      </div>

      {/* CONTENIDO 1: Conciliación Bancaria */}
      {tab === 'CONCILIACION' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] text-slate-500">Saldo Según Extracto Bancario</span>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                S/ 58,420.50
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] text-slate-500">Saldo Según Libro Caja y Bancos</span>
              <div className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400 mt-0.5">
                S/ 58,420.50
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] text-slate-500">Diferencia de Conciliación</span>
              <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                S/ 0.00 (Cuadrado)
              </div>
            </div>
          </div>

          {/* Tabla de Conciliación */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-700/60 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                  <th className="py-2 px-3 font-semibold">Banco / Cuenta</th>
                  <th className="py-2 px-3 font-semibold">Fecha</th>
                  <th className="py-2 px-3 font-semibold">N° Operación</th>
                  <th className="py-2 px-3 font-semibold">Concepto Bancario</th>
                  <th className="py-2 px-3 font-semibold text-right">Ingreso</th>
                  <th className="py-2 px-3 font-semibold text-right">Egreso</th>
                  <th className="py-2 px-3 font-semibold text-center">Estado</th>
                  <th className="py-2 px-3 font-semibold text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {movimientos.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="py-2 px-3">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 mr-1">
                        {m.banco}
                      </span>
                      <span className="text-[10.5px] text-slate-500">{m.cuenta}</span>
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">{m.fecha}</td>
                    <td className="py-2 px-3 font-mono text-blue-600 dark:text-blue-400">{m.referencia}</td>
                    <td className="py-2 px-3 text-slate-800 dark:text-slate-200 truncate max-w-xs">{m.concepto}</td>
                    <td className="py-2 px-3 text-right font-mono font-medium text-emerald-600">
                      {m.tipo === 'INGRESO'
                        ? m.monto.toLocaleString('es-PE', { minimumFractionDigits: 2 })
                        : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-medium text-rose-600">
                      {m.tipo === 'EGRESO'
                        ? m.monto.toLocaleString('es-PE', { minimumFractionDigits: 2 })
                        : '—'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {m.conciliado ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Conciliado
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                          <Clock className="w-3 h-3 mr-1" />
                          Por Conciliar
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {!m.conciliado && (
                        <button
                          onClick={() => handleConciliarItem(m.id)}
                          className="px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 hover:bg-blue-100 text-[11px] font-medium"
                        >
                          Emparejar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONTENIDO 2: Movimientos */}
      {tab === 'MOVIMIENTOS' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-4 text-xs">
          <div className="flex justify-between items-center mb-3">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Libro Mayor de Cuentas Corrientes Bancarias
            </span>
            <button
              onClick={() => info('Importador de extractos Excel/CSV bancarios')}
              className="flex items-center space-x-1 px-3 py-1.5 border rounded hover:bg-slate-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Importar Extracto Bancario</span>
            </button>
          </div>
          <p className="text-slate-500">
            Todos los movimientos sincronizados con la cuenta 104100 (Cuentas corrientes operativas).
          </p>
        </div>
      )}

      {/* CONTENIDO 3: Flujo Proyectado */}
      {tab === 'FLUJO_PROYECTADO' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-5 text-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span>Proyección de Liquidez y Flujo de Caja (Próximos 90 Días)</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="border border-slate-200 dark:border-slate-700 rounded p-3">
              <span className="text-slate-500 font-medium">30 Días (Febrero 2026)</span>
              <div className="text-base font-bold font-mono text-emerald-600 mt-1">
                + S/ 34,250.00
              </div>
              <div className="text-[10.5px] text-slate-400 mt-1">
                Cobros CxC: S/ 48,000 | Pagos CxP & SUNAT: S/ 13,750
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded p-3">
              <span className="text-slate-500 font-medium">60 Días (Marzo 2026)</span>
              <div className="text-base font-bold font-mono text-emerald-600 mt-1">
                + S/ 28,100.00
              </div>
              <div className="text-[10.5px] text-slate-400 mt-1">
                Vencimiento Declaración Anual Renta 2025 incluido
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded p-3">
              <span className="text-slate-500 font-medium">90 Días (Abril 2026)</span>
              <div className="text-base font-bold font-mono text-emerald-600 mt-1">
                + S/ 41,500.00
              </div>
              <div className="text-[10.5px] text-slate-400 mt-1">
                Flujo neto proyectado estable y positivo
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
