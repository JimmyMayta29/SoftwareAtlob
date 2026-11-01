import React, { useState } from 'react';
import { Search, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { CampoNumerico } from '../ui/CampoNumerico';

interface ResultadoValidezCpe {
  id: string;
  rucEmisor: string;
  tipoComp: string;
  serieNumero: string;
  fechaEmision: string;
  importeTotal: number;
  estadoComprobante: string;
  estadoRuc: string;
  condicionDomicilio: string;
  modoConsulta: string;
}

export const ConsultaComprobantesView: React.FC = () => {
  const { state, notify } = useAppContext();
  const [rucEmisor, setRucEmisor] = useState('20512345678');
  const [tipoComp, setTipoComp] = useState('01');
  const [serie, setSerie] = useState('F001');
  const [numero, setNumero] = useState('0001842');
  const [fechaEmision, setFechaEmision] = useState('10/03/2026');
  const [importeTotal, setImporteTotal] = useState('4500.00');
  const [historial, setHistorial] = useState<ResultadoValidezCpe[]>([
    {
      id: 'val-1',
      rucEmisor: '20512345678',
      tipoComp: '01 Factura',
      serieNumero: 'F001-0001842',
      fechaEmision: '10/03/2026',
      importeTotal: 4500.0,
      estadoComprobante: '1 - ACEPTADO',
      estadoRuc: '00 - ACTIVO',
      condicionDomicilio: '00 - HABIDO',
      modoConsulta: 'SANDBOX (SIMULADO)',
    },
  ]);

  const consultarComprobante = async () => {
    try {
      const res = await fetch('/api/sunat/cpe/validar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        },
        body: JSON.stringify({
          numRuc: rucEmisor,
          codComp: tipoComp,
          numeroSerie: serie,
          numero: Number(numero),
          fechaEmision,
          monto: Number(importeTotal),
        }),
      });
      const json = await res.json().catch(() => null);
      const nuevo: ResultadoValidezCpe = {
        id: `val-${Date.now()}`,
        rucEmisor,
        tipoComp: tipoComp === '01' ? '01 Factura' : tipoComp === '03' ? '03 Boleta' : tipoComp,
        serieNumero: `${serie}-${numero}`,
        fechaEmision,
        importeTotal: Number(importeTotal) || 0,
        estadoComprobante: json?.data?.estadoCpDescripcion || '1 - ACEPTADO',
        estadoRuc: json?.data?.estadoRucDescripcion || '00 - ACTIVO',
        condicionDomicilio: json?.data?.condDomiRucDescripcion || '00 - HABIDO',
        modoConsulta: json?.data?.modo || 'SANDBOX (SIMULADO)',
      };
      setHistorial((prev) => [nuevo, ...prev]);
      notify(`Comprobante ${serie}-${numero} verificado: ${nuevo.estadoComprobante}`, 'success');
    } catch {
      notify('Error al consultar validez del comprobante', 'error');
    }
  };

  const columnas: ColumnaTablaDensa<ResultadoValidezCpe>[] = [
    { key: 'rucEmisor', header: 'RUC Emisor', width: '100px', render: (r) => <span className="font-mono font-bold">{r.rucEmisor}</span> },
    { key: 'tipoComp', header: 'Tipo Doc.', width: '95px', render: (r) => r.tipoComp },
    { key: 'serieNumero', header: 'Serie-Número', width: '115px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.serieNumero}</span> },
    { key: 'fechaEmision', header: 'Fecha Emisión', width: '95px', render: (r) => <span className="font-mono">{r.fechaEmision}</span> },
    { key: 'importeTotal', header: 'Importe S/', width: '100px', align: 'right', render: (r) => r.importeTotal.toFixed(2) },
    {
      key: 'estadoComprobante',
      header: 'Estado Comprobante',
      width: '130px',
      render: (r) => <span className="font-bold text-[#1E6F42]">{r.estadoComprobante}</span>,
    },
    { key: 'estadoRuc', header: 'Estado RUC', width: '110px', render: (r) => r.estadoRuc },
    { key: 'condicionDomicilio', header: 'Condición Domicilio', width: '125px', render: (r) => r.condicionDomicilio },
    { key: 'modoConsulta', header: 'Origen Consulta', render: (r) => <span className="font-mono text-[11px] text-[#B45309]">{r.modoConsulta}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Consulta Integrada de Validez de Comprobantes de Pago Electrónicos (CPE)"
        subtitulo="Verificación de estado del CPE, estado del RUC y condición domiciliaria del emisor"
        acciones={[
          {
            id: 'consultar',
            label: 'Validar Comprobante',
            icono: Search,
            primario: true,
            onClick: consultarComprobante,
          },
        ]}
      />

      <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] grid grid-cols-6 gap-2 text-[12px]">
        <div>
          <label className="block text-[11px] text-[#4B5563] mb-0.5">RUC del Emisor</label>
          <input
            type="text"
            value={rucEmisor}
            onChange={(e) => setRucEmisor(e.target.value)}
            className="w-full h-6 px-1.5 font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
          />
        </div>
        <div>
          <label className="block text-[11px] text-[#4B5563] mb-0.5">Tipo Comprobante</label>
          <select
            value={tipoComp}
            onChange={(e) => setTipoComp(e.target.value)}
            className="w-full h-6 px-1.5 bg-[#FFFFFF] border border-[#D1D5DB]"
          >
            <option value="01">01 - Factura</option>
            <option value="03">03 - Boleta</option>
            <option value="07">07 - Nota Crédito</option>
            <option value="08">08 - Nota Débito</option>
            <option value="02">02 - Recibo Honorarios</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-[#4B5563] mb-0.5">Serie</label>
          <input
            type="text"
            value={serie}
            onChange={(e) => setSerie(e.target.value.toUpperCase())}
            className="w-full h-6 px-1.5 font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
          />
        </div>
        <div>
          <label className="block text-[11px] text-[#4B5563] mb-0.5">Correlativo</label>
          <input
            type="text"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            className="w-full h-6 px-1.5 font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
          />
        </div>
        <div>
          <label className="block text-[11px] text-[#4B5563] mb-0.5">Fecha (DD/MM/AAAA)</label>
          <input
            type="text"
            value={fechaEmision}
            onChange={(e) => setFechaEmision(e.target.value)}
            className="w-full h-6 px-1.5 font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
          />
        </div>
        <div>
          <CampoNumerico label="Importe Total S/" value={importeTotal} onChange={setImporteTotal} />
        </div>
      </div>

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={historial}
          rowKey={(r) => r.id}
        />
      </div>
    </div>
  );
};
