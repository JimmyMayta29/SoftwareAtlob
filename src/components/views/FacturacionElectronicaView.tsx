import React, { useState } from 'react';
import { 
  FileText, 
  Send, 
  FileCheck, 
  Truck, 
  XCircle, 
  Search, 
  Download, 
  Upload, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Eye,
  FileSpreadsheet
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface ComprobanteEmitido {
  id: string;
  tipo: '01' | '03' | '07' | '08' | '09';
  tipoNombre: string;
  serie: string;
  numero: string;
  fechaEmision: string;
  clienteRuc: string;
  clienteRazonSocial: string;
  moneda: 'PEN' | 'USD';
  gravado: number;
  igv: number;
  total: number;
  estadoSunat: 'ACEPTADO' | 'PENDIENTE' | 'RECHAZADO' | 'ANULADO';
  cdrSunat?: string;
}

const FACTURAS_DEMO: ComprobanteEmitido[] = [
  {
    id: 'cpe-001',
    tipo: '01',
    tipoNombre: 'Factura Electrónica',
    serie: 'F001',
    numero: '00001420',
    fechaEmision: '2026-01-28',
    clienteRuc: '20100035392',
    clienteRazonSocial: 'DISTRIBUIDORA INDUSTRIAL FERRETERA S.A.C.',
    moneda: 'PEN',
    gravado: 12500.00,
    igv: 2250.00,
    total: 14750.00,
    estadoSunat: 'ACEPTADO',
    cdrSunat: 'La Factura F001-00001420 ha sido aceptada con éxito por SUNAT.'
  },
  {
    id: 'cpe-002',
    tipo: '01',
    tipoNombre: 'Factura Electrónica',
    serie: 'F001',
    numero: '00001421',
    fechaEmision: '2026-01-29',
    clienteRuc: '20556789123',
    clienteRazonSocial: 'TRANSPORTES & CARGA PESADA DEL SUR S.A.C.',
    moneda: 'PEN',
    gravado: 8400.00,
    igv: 1512.00,
    total: 9912.00,
    estadoSunat: 'ACEPTADO',
    cdrSunat: 'La Factura F001-00001421 ha sido aceptada.'
  },
  {
    id: 'cpe-003',
    tipo: '03',
    tipoNombre: 'Boleta de Venta Electrónica',
    serie: 'B001',
    numero: '00000854',
    fechaEmision: '2026-01-29',
    clienteRuc: '10458921345',
    clienteRazonSocial: 'MENDOZA ALVAREZ CARLOS ALBERTO',
    moneda: 'PEN',
    gravado: 450.00,
    igv: 81.00,
    total: 531.00,
    estadoSunat: 'ACEPTADO'
  },
  {
    id: 'cpe-004',
    tipo: '07',
    tipoNombre: 'Nota de Crédito Electrónica',
    serie: 'FC01',
    numero: '00000112',
    fechaEmision: '2026-01-30',
    clienteRuc: '20100035392',
    clienteRazonSocial: 'DISTRIBUIDORA INDUSTRIAL FERRETERA S.A.C.',
    moneda: 'PEN',
    gravado: -1200.00,
    igv: -216.00,
    total: -1416.00,
    estadoSunat: 'ACEPTADO',
    cdrSunat: 'Nota de crédito aplicada a Factura F001-00001420.'
  },
  {
    id: 'cpe-005',
    tipo: '09',
    tipoNombre: 'Guía de Remisión Remitente (GRE)',
    serie: 'T001',
    numero: '00000318',
    fechaEmision: '2026-01-30',
    clienteRuc: '20556789123',
    clienteRazonSocial: 'TRANSPORTES & CARGA PESADA DEL SUR S.A.C.',
    moneda: 'PEN',
    gravado: 0,
    igv: 0,
    total: 0,
    estadoSunat: 'ACEPTADO'
  }
];

export const FacturacionElectronicaView: React.FC = () => {
  const { success, info } = useToast();
  const [subTab, setSubTab] = useState<'EMISION' | 'COMPROBANTES' | 'GRE' | 'BAJAS' | 'XML_UBL'>('COMPROBANTES');
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [listaComprobantes, setListaComprobantes] = useState<ComprobanteEmitido[]>(FACTURAS_DEMO);

  // Formulario de emisión rápida
  const [tipoNuevo, setTipoNuevo] = useState<'01' | '03'>('01');
  const [serieNuevo, setSerieNuevo] = useState('F001');
  const [clienteRuc, setClienteRuc] = useState('20601234567');
  const [clienteRazon, setClienteRazon] = useState('INVERSIONES & SERVICIOS GRAFICOS S.A.C.');
  const [descripcionItem, setDescripcionItem] = useState('Servicio de asesoría contable y tributaria mensual');
  const [montoBase, setMontoBase] = useState<number>(3500);

  const igvCalculado = Number((montoBase * 0.18).toFixed(2));
  const totalCalculado = Number((montoBase + igvCalculado).toFixed(2));

  const handleEmitirComprobante = (e: React.FormEvent) => {
    e.preventDefault();
    const nuevoNumero = (listaComprobantes.length + 1422).toString().padStart(8, '0');
    const nuevo: ComprobanteEmitido = {
      id: `cpe-${Date.now()}`,
      tipo: tipoNuevo,
      tipoNombre: tipoNuevo === '01' ? 'Factura Electrónica' : 'Boleta de Venta Electrónica',
      serie: serieNuevo,
      numero: nuevoNumero,
      fechaEmision: new Date().toISOString().split('T')[0],
      clienteRuc,
      clienteRazonSocial: clienteRazon,
      moneda: 'PEN',
      gravado: montoBase,
      igv: igvCalculado,
      total: totalCalculado,
      estadoSunat: 'ACEPTADO',
      cdrSunat: `Comprobante ${serieNuevo}-${nuevoNumero} aceptado en línea por SUNAT.`
    };

    setListaComprobantes([nuevo, ...listaComprobantes]);
    success(`Comprobante ${serieNuevo}-${nuevoNumero} emitido y enviado a SUNAT con éxito.`, 'Emisión Exitosa');
    setSubTab('COMPROBANTES');
  };

  const comprobantesFiltrados = listaComprobantes.filter((c) => {
    const matchTipo = filtroTipo === 'TODOS' || c.tipo === filtroTipo;
    const matchTexto =
      c.serie.toLowerCase().includes(filtroTexto.toLowerCase()) ||
      c.numero.includes(filtroTexto) ||
      c.clienteRazonSocial.toLowerCase().includes(filtroTexto.toLowerCase()) ||
      c.clienteRuc.includes(filtroTexto);
    return matchTipo && matchTexto;
  });

  return (
    <div className="space-y-4 max-w-7xl mx-auto p-4">
      {/* Cabecera del Módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
              <FileText className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Facturación Electrónica SUNAT (UBL 2.1)
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Emisión y consulta de Facturas, Boletas, Notas de Crédito, Guías de Remisión y Comunicaciones de Baja con firma digital.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setSubTab('EMISION')}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Emitir Comprobante [F3]</span>
          </button>
        </div>
      </div>

      {/* Pestañas secundarias de navegación del módulo */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 text-xs font-medium space-x-2">
        <button
          onClick={() => setSubTab('COMPROBANTES')}
          className={`px-3 py-2 border-b-2 transition-colors ${
            subTab === 'COMPROBANTES'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Consulta de Comprobantes ({listaComprobantes.length})
        </button>
        <button
          onClick={() => setSubTab('EMISION')}
          className={`px-3 py-2 border-b-2 transition-colors ${
            subTab === 'EMISION'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Nueva Emisión (Factura / Boleta)
        </button>
        <button
          onClick={() => setSubTab('GRE')}
          className={`px-3 py-2 border-b-2 transition-colors ${
            subTab === 'GRE'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Guías de Remisión (GRE)
        </button>
        <button
          onClick={() => setSubTab('BAJAS')}
          className={`px-3 py-2 border-b-2 transition-colors ${
            subTab === 'BAJAS'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Comunicaciones de Baja
        </button>
        <button
          onClick={() => setSubTab('XML_UBL')}
          className={`px-3 py-2 border-b-2 transition-colors ${
            subTab === 'XML_UBL'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Lector XML UBL / CDR
        </button>
      </div>

      {/* CONTENIDO 1: Consulta de Comprobantes */}
      {subTab === 'COMPROBANTES' && (
        <div className="space-y-3">
          {/* Barra de Filtros */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded border border-slate-200 dark:border-slate-700 text-xs">
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar serie, número, cliente..."
                  value={filtroTexto}
                  onChange={(e) => setFiltroTexto(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="py-1.5 px-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs"
              >
                <option value="TODOS">Todos los tipos</option>
                <option value="01">01 - Factura</option>
                <option value="03">03 - Boleta</option>
                <option value="07">07 - Nota de Crédito</option>
                <option value="09">09 - Guía Remisión</option>
              </select>
            </div>

            <div className="text-slate-500 dark:text-slate-400 text-xs">
              Mostrando {comprobantesFiltrados.length} comprobante(s)
            </div>
          </div>

          {/* Tabla de Comprobantes */}
          <div className="border border-slate-200 dark:border-slate-700 rounded overflow-x-auto bg-white dark:bg-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-700/60 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                  <th className="py-2 px-3 font-semibold">Tipo</th>
                  <th className="py-2 px-3 font-semibold">Serie / Número</th>
                  <th className="py-2 px-3 font-semibold">F. Emisión</th>
                  <th className="py-2 px-3 font-semibold">Cliente (RUC / Razón Social)</th>
                  <th className="py-2 px-3 font-semibold text-right">Gravado</th>
                  <th className="py-2 px-3 font-semibold text-right">IGV</th>
                  <th className="py-2 px-3 font-semibold text-right">Total</th>
                  <th className="py-2 px-3 font-semibold text-center">Estado SUNAT</th>
                  <th className="py-2 px-3 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {comprobantesFiltrados.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                    <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                      <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-[11px] mr-1.5">
                        {item.tipo}
                      </span>
                      {item.tipoNombre}
                    </td>
                    <td className="py-2 px-3 font-mono font-semibold text-blue-600 dark:text-blue-400">
                      {item.serie}-{item.numero}
                    </td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                      {item.fechaEmision}
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                        {item.clienteRuc}
                      </div>
                      <div className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-xs">
                        {item.clienteRazonSocial}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                      {item.gravado.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                      {item.igv.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      {item.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {item.estadoSunat}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          onClick={() => info(`Descargando XML firmado de ${item.serie}-${item.numero}`)}
                          title="Descargar XML UBL 2.1"
                          className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => info(`Visualizando CDR de ${item.serie}-${item.numero}: ${item.cdrSunat || 'Aceptado'}`)}
                          title="Ver CDR de SUNAT"
                          className="p-1 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                        >
                          <FileCheck className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONTENIDO 2: Formulario de Emisión */}
      {subTab === 'EMISION' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-5 max-w-3xl">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 border-b pb-2">
            Emisión de Comprobante de Pago Electrónico (CPE)
          </h2>

          <form onSubmit={handleEmitirComprobante} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                  Tipo de Comprobante
                </label>
                <select
                  value={tipoNuevo}
                  onChange={(e) => {
                    const t = e.target.value as '01' | '03';
                    setTipoNuevo(t);
                    setSerieNuevo(t === '01' ? 'F001' : 'B001');
                  }}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                >
                  <option value="01">01 - Factura Electrónica</option>
                  <option value="03">03 - Boleta de Venta Electrónica</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                  Serie
                </label>
                <input
                  type="text"
                  value={serieNuevo}
                  onChange={(e) => setSerieNuevo(e.target.value.toUpperCase())}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                  Moneda
                </label>
                <input
                  type="text"
                  disabled
                  value="PEN - SOLES"
                  className="w-full p-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                  RUC / DNI del Cliente
                </label>
                <input
                  type="text"
                  value={clienteRuc}
                  onChange={(e) => setClienteRuc(e.target.value)}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 font-mono"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                  Razón Social / Nombre Completo
                </label>
                <input
                  type="text"
                  value={clienteRazon}
                  onChange={(e) => setClienteRazon(e.target.value)}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 font-medium"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                Descripción del Bien o Servicio
              </label>
              <textarea
                rows={2}
                value={descripcionItem}
                onChange={(e) => setDescripcionItem(e.target.value)}
                className="w-full p-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                  Base Imponible (S/)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={montoBase}
                  onChange={(e) => setMontoBase(Number(e.target.value))}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 font-mono text-right"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                  IGV 18% (S/)
                </label>
                <input
                  type="text"
                  disabled
                  value={igvCalculado.toFixed(2)}
                  className="w-full p-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 font-mono text-right font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                  Total Comprobante (S/)
                </label>
                <input
                  type="text"
                  disabled
                  value={totalCalculado.toFixed(2)}
                  className="w-full p-2 rounded border border-slate-200 dark:border-slate-700 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-mono text-right font-bold text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3">
              <button
                type="button"
                onClick={() => setSubTab('COMPROBANTES')}
                className="px-4 py-2 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center space-x-1.5 px-5 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm"
              >
                <Send className="w-4 h-4" />
                <span>Emitir y Firmar Electrónicamente</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CONTENIDO 3: Guías de Remisión Electrónica */}
      {subTab === 'GRE' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-6 text-center text-xs">
          <Truck className="w-10 h-10 text-blue-600 mx-auto mb-2 opacity-80" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Guías de Remisión Electrónica (GRE Remitente y Transportista)
          </h3>
          <p className="text-slate-500 max-w-md mx-auto mt-1">
            Módulo habilitado para la emisión de GRE conforme a la R.S. 123-2022/SUNAT con código QR y validación de placa de vehículo y licencia de conducir.
          </p>
          <div className="mt-4">
            <button
              onClick={() => info('Abriendo asistente de Guía de Remisión Electrónica (GRE Remitente).')}
              className="px-4 py-2 rounded bg-blue-600 text-white font-medium text-xs hover:bg-blue-700"
            >
              + Nueva Guía de Remisión (GRE)
            </button>
          </div>
        </div>
      )}

      {/* CONTENIDO 4: Comunicación de Baja */}
      {subTab === 'BAJAS' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-6 text-center text-xs">
          <XCircle className="w-10 h-10 text-rose-500 mx-auto mb-2 opacity-80" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Comunicaciones de Baja y Anulación de Comprobantes
          </h3>
          <p className="text-slate-500 max-w-md mx-auto mt-1">
            Envío de resúmenes de anulación dentro del plazo máximo de 7 días calendario posteriores a la emisión del comprobante.
          </p>
        </div>
      )}

      {/* CONTENIDO 5: Lector XML UBL / CDR */}
      {subTab === 'XML_UBL' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-6 text-xs">
          <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded p-8 text-center">
            <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <h4 className="font-semibold text-slate-800 dark:text-slate-200">
              Arrastra aquí archivos XML o paquetes ZIP de Comprobantes o CDR
            </h4>
            <p className="text-slate-500 text-[11px] mt-1">
              Validación criptográfica de firma digital XAdES-BES y estructura estándar UBL 2.1
            </p>
            <button
              onClick={() => info('Explorador de archivos abierto para cargar XML UBL 2.1')}
              className="mt-3 px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 font-medium text-slate-700 dark:text-slate-300"
            >
              Seleccionar XML / CDR desde el equipo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
