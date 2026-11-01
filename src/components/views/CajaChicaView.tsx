import React, { useState } from 'react';
import { 
  Wallet, 
  Receipt, 
  Plus, 
  CheckCircle2, 
  ArrowDownRight, 
  ArrowUpRight, 
  RefreshCw, 
  FileText,
  AlertCircle
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface GastoCajaChica {
  id: string;
  fecha: string;
  tipoDoc: string;
  serieNumero: string;
  proveedor: string;
  concepto: string;
  cuentaPcge: string;
  monto: number;
}

const GASTOS_INICIALES: GastoCajaChica[] = [
  {
    id: 'g-01',
    fecha: '2026-01-12',
    tipoDoc: '01 FACTURA',
    serieNumero: 'F002-0001429',
    proveedor: 'LIBRERIA & UTILES TAY HENG S.A.C.',
    concepto: 'Útiles de oficina, archivadores de palanca y tóner',
    cuentaPcge: '656100 - Suministros diversos',
    monto: 320.00
  },
  {
    id: 'g-02',
    fecha: '2026-01-16',
    tipoDoc: 'RECIBO GASTO',
    serieNumero: 'MOV-0001',
    proveedor: 'MOVILIDAD LOCAL MENSAJERIA',
    concepto: 'Trámites notariales y entrega de libros contables',
    cuentaPcge: '631100 - Transporte y movilidad',
    monto: 85.00
  },
  {
    id: 'g-03',
    fecha: '2026-01-20',
    tipoDoc: '03 BOLETA',
    serieNumero: 'B005-004312',
    proveedor: 'CAFETERIA & SERVICIOS GOURMET E.I.R.L.',
    concepto: 'Refrigerio de equipo en cierre contable mensual',
    cuentaPcge: '639100 - Gastos de representación y refrigerio',
    monto: 145.00
  },
  {
    id: 'g-04',
    fecha: '2026-01-24',
    tipoDoc: '01 FACTURA',
    serieNumero: 'F101-000918',
    proveedor: 'SERVICIOS DE LIMPIEZA EXPRESS S.A.',
    concepto: 'Materiales desinfectantes y útiles de limpieza',
    cuentaPcge: '656200 - Materiales de limpieza',
    monto: 190.00
  }
];

export const CajaChicaView: React.FC = () => {
  const { success, info } = useToast();
  const [fondoAsignado, setFondoAsignado] = useState<number>(2000.00);
  const [gastos, setGastos] = useState<GastoCajaChica[]>(GASTOS_INICIALES);
  const [mostrarModalNuevo, setMostrarModalNuevo] = useState(false);

  // Form states
  const [fechaNuevo, setFechaNuevo] = useState(new Date().toISOString().split('T')[0]);
  const [tipoDocNuevo, setTipoDocNuevo] = useState('01 FACTURA');
  const [docNuevo, setDocNuevo] = useState('');
  const [proveedorNuevo, setProveedorNuevo] = useState('');
  const [conceptoNuevo, setConceptoNuevo] = useState('');
  const [cuentaNuevo, setCuentaNuevo] = useState('656100 - Suministros diversos');
  const [montoNuevo, setMontoNuevo] = useState<number>(150);

  const totalGastado = gastos.reduce((acc, g) => acc + g.monto, 0);
  const saldoDisponible = fondoAsignado - totalGastado;
  const porcentajeUtilizado = Math.min(100, (totalGastado / fondoAsignado) * 100);

  const handleAgregarGasto = (e: React.FormEvent) => {
    e.preventDefault();
    if (montoNuevo > saldoDisponible) {
      info('El monto solicitado excede el saldo remanente de la caja chica.');
      return;
    }

    const nuevoGasto: GastoCajaChica = {
      id: `g-${Date.now()}`,
      fecha: fechaNuevo,
      tipoDoc: tipoDocNuevo,
      serieNumero: docNuevo || `VOU-${Date.now().toString().slice(-4)}`,
      proveedor: proveedorNuevo || 'PROVEEDOR MENOR',
      concepto: conceptoNuevo || 'Gasto operativo menor',
      cuentaPcge: cuentaNuevo,
      monto: Number(montoNuevo)
    };

    setGastos([nuevoGasto, ...gastos]);
    setMostrarModalNuevo(false);
    success('Gasto registrado con imputación contable al PCGE.', 'Caja Chica');
  };

  const handleSolicitarReposicion = () => {
    success(
      `Póliza de reembolso por S/ ${totalGastado.toFixed(2)} enviada al Libro Caja y Bancos. Fondo restablecido a S/ ${fondoAsignado.toFixed(2)}.`,
      'Reposición Ejecutada'
    );
    setGastos([]);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
              <Wallet className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Caja Chica & Fondo Fijo
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Control de gastos menores, comprobantes físicos, imputación a cuentas del PCGE (Elemento 6) y pólizas de reposición.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setMostrarModalNuevo(true)}
            className="flex items-center space-x-1 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Gasto</span>
          </button>
          <button
            onClick={handleSolicitarReposicion}
            disabled={totalGastado === 0}
            className="flex items-center space-x-1 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Solicitar Reposición</span>
          </button>
        </div>
      </div>

      {/* Tarjetas de Arqueo y Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded border border-slate-200 dark:border-slate-700">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Fondo Fijo Autorizado
          </span>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
            S/ {fondoAsignado.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-slate-400">Responsable: Asistente Contable</span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded border border-slate-200 dark:border-slate-700">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Total Gastado Acumulado
          </span>
          <div className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
            S/ {totalGastado.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full ${porcentajeUtilizado > 80 ? 'bg-rose-500' : 'bg-blue-600'}`}
              style={{ width: `${porcentajeUtilizado}%` }}
            />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded border border-slate-200 dark:border-slate-700">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Saldo Disponible en Efectivo
          </span>
          <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            S/ {saldoDisponible.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-slate-400">Disponible para desembolso inmediato</span>
        </div>
      </div>

      {/* Tabla de Rendición de Gastos */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center text-xs">
          <span className="font-bold text-slate-800 dark:text-slate-200">
            Rendición de Gastos de Caja Chica ({gastos.length} registros)
          </span>
          <span className="text-slate-500 font-mono text-[11px]">
            Cuenta PCGE Centralizadora: 102100 (Fondos Fijos)
          </span>
        </div>

        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-700/60 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
              <th className="py-2 px-3 font-semibold">Fecha</th>
              <th className="py-2 px-3 font-semibold">Tipo / N° Doc</th>
              <th className="py-2 px-3 font-semibold">Proveedor / Beneficiario</th>
              <th className="py-2 px-3 font-semibold">Concepto / Glosa</th>
              <th className="py-2 px-3 font-semibold">Imputación Contable</th>
              <th className="py-2 px-3 font-semibold text-right">Importe (S/)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {gastos.map((g) => (
              <tr key={g.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">{g.fecha}</td>
                <td className="py-2 px-3">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 mr-1">
                    {g.tipoDoc}
                  </span>
                  <span className="font-mono text-blue-600 dark:text-blue-400">{g.serieNumero}</span>
                </td>
                <td className="py-2 px-3 text-slate-800 dark:text-slate-200 font-medium truncate max-w-xs">
                  {g.proveedor}
                </td>
                <td className="py-2 px-3 text-slate-600 dark:text-slate-400 truncate max-w-xs">
                  {g.concepto}
                </td>
                <td className="py-2 px-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  {g.cuentaPcge}
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                  {g.monto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 dark:bg-slate-700/70 border-t-2 border-slate-300 dark:border-slate-600 font-bold text-xs">
              <td colSpan={5} className="py-2 px-3 text-right text-slate-700 dark:text-slate-200">
                TOTAL RENDIDO PARA REPOSICIÓN:
              </td>
              <td className="py-2 px-3 text-right font-mono text-rose-600 dark:text-rose-400">
                S/ {totalGastado.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Modal Nuevo Gasto */}
      {mostrarModalNuevo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 shadow-xl max-w-md w-full p-5 text-xs">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3 border-b pb-2">
              Registrar Nuevo Gasto de Caja Chica
            </h3>

            <form onSubmit={handleAgregarGasto} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-500 mb-1">Fecha de Operación</label>
                  <input
                    type="date"
                    value={fechaNuevo}
                    onChange={(e) => setFechaNuevo(e.target.value)}
                    className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Tipo de Documento</label>
                  <select
                    value={tipoDocNuevo}
                    onChange={(e) => setTipoDocNuevo(e.target.value)}
                    className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600"
                  >
                    <option value="01 FACTURA">01 FACTURA</option>
                    <option value="03 BOLETA">03 BOLETA</option>
                    <option value="RECIBO GASTO">RECIBO DE GASTO INTERNO</option>
                    <option value="TICKET MAQUINA">TICKET POS / PEAJE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Serie y Número</label>
                <input
                  type="text"
                  placeholder="Ej: F001-0001290"
                  value={docNuevo}
                  onChange={(e) => setDocNuevo(e.target.value)}
                  className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Proveedor / Beneficiario</label>
                <input
                  type="text"
                  placeholder="Nombre o razón social"
                  value={proveedorNuevo}
                  onChange={(e) => setProveedorNuevo(e.target.value)}
                  className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Concepto / Glosa</label>
                <input
                  type="text"
                  placeholder="Motivo del desembolso"
                  value={conceptoNuevo}
                  onChange={(e) => setConceptoNuevo(e.target.value)}
                  className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Cuenta Contable PCGE (Elemento 6)</label>
                <select
                  value={cuentaNuevo}
                  onChange={(e) => setCuentaNuevo(e.target.value)}
                  className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 font-mono"
                >
                  <option value="656100 - Suministros diversos">656100 - Suministros diversos</option>
                  <option value="631100 - Transporte y movilidad">631100 - Transporte y movilidad</option>
                  <option value="639100 - Gastos de representación y refrigerio">639100 - Gastos de representación</option>
                  <option value="656200 - Materiales de limpieza">656200 - Materiales de limpieza</option>
                  <option value="632100 - Correos y mensajería">632100 - Correos y mensajería</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Monto Desembolsado (S/)</label>
                <input
                  type="number"
                  step="0.01"
                  value={montoNuevo}
                  onChange={(e) => setMontoNuevo(Number(e.target.value))}
                  className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 font-mono text-right font-bold"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setMostrarModalNuevo(false)}
                  className="px-3 py-1.5 border rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold"
                >
                  Guardar Gasto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
