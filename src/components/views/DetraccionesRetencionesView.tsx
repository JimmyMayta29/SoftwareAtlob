import React, { useState } from 'react';
import { Plus, Download, CheckCircle2 } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';

interface OperacionSujetaTributo {
  id: string;
  regimen: 'DETRACCION_SPOT' | 'RETENCION_IGV' | 'PERCEPCION_IGV';
  fechaPago: string;
  rucProveedor: string;
  razonSocial: string;
  comprobante: string;
  codigoBienServicio: string;
  tasaPorcentaje: number;
  importeOperacionPen: number;
  importeTributoPen: number;
  constanciaNumero: string;
}

const REGISTROS_INICIALES: OperacionSujetaTributo[] = [
  {
    id: 'sp-1',
    regimen: 'DETRACCION_SPOT',
    fechaPago: '2026-03-10',
    rucProveedor: '20512345678',
    razonSocial: 'SERVICIOS LOGISTICOS DEL SUR S.A.C.',
    comprobante: 'F001-0001842',
    codigoBienServicio: '027 - Transporte de carga',
    tasaPorcentaje: 4.0,
    importeOperacionPen: 4500.0,
    importeTributoPen: 180.0,
    constanciaNumero: '98451203',
  },
  {
    id: 'sp-2',
    regimen: 'DETRACCION_SPOT',
    fechaPago: '2026-03-14',
    rucProveedor: '20601122334',
    razonSocial: 'ASESORIA EMPRESARIAL INTEGRAL S.A.C.',
    comprobante: 'E001-0000419',
    codigoBienServicio: '022 - Otros servicios empresariales',
    tasaPorcentaje: 12.0,
    importeOperacionPen: 3540.0,
    importeTributoPen: 425.0,
    constanciaNumero: '98459910',
  },
  {
    id: 'sp-3',
    regimen: 'RETENCION_IGV',
    fechaPago: '2026-03-18',
    rucProveedor: '20100055237',
    razonSocial: 'CORPORACION INDUSTRIAL LIMA S.A.',
    comprobante: '20-0001-000812',
    codigoBienServicio: 'Régimen de Retenciones IGV (3%)',
    tasaPorcentaje: 3.0,
    importeOperacionPen: 8260.0,
    importeTributoPen: 247.8,
    constanciaNumero: 'E001-00812',
  },
];

export const DetraccionesRetencionesView: React.FC = () => {
  const { state, notify } = useAppContext();
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-03');
  const [filtroRegimen, setFiltroRegimen] = useState<string>('TODOS');
  const [registros] = useState<OperacionSujetaTributo[]>(REGISTROS_INICIALES);

  const filtrados = registros.filter((r) => filtroRegimen === 'TODOS' || r.regimen === filtroRegimen);

  const exportarLoteSpot = () => {
    const lineas = filtrados
      .filter((r) => r.regimen === 'DETRACCION_SPOT')
      .map((r) => `${r.rucProveedor}|${r.codigoBienServicio.slice(0, 3)}|${r.importeTributoPen.toFixed(2)}|${periodo.replace('-', '')}|01|${r.comprobante}`)
      .join('\n');
    const blob = new Blob([lineas], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `D${state.activeEmpresaRuc || '20601234567'}${periodo.slice(2, 4)}0001.txt`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Archivo plano de lote masivo SPOT (Banco de la Nación) descargado', 'success');
  };

  const columnas: ColumnaTablaDensa<OperacionSujetaTributo>[] = [
    { key: 'fechaPago', header: 'Fecha Depósito', width: '95px', render: (r) => <span className="font-mono">{r.fechaPago}</span> },
    {
      key: 'regimen',
      header: 'Régimen',
      width: '125px',
      render: (r) => (
        <span className="font-mono font-bold text-[11px] text-[#1E3A5F]">
          {r.regimen === 'DETRACCION_SPOT' ? 'SPOT Detracción' : r.regimen === 'RETENCION_IGV' ? 'Retención 3%' : 'Percepción'}
        </span>
      ),
    },
    { key: 'rucProveedor', header: 'RUC', width: '95px', render: (r) => <span className="font-mono">{r.rucProveedor}</span> },
    { key: 'razonSocial', header: 'Proveedor / Agente', render: (r) => r.razonSocial },
    { key: 'comprobante', header: 'Comprobante', width: '115px', render: (r) => <span className="font-mono">{r.comprobante}</span> },
    { key: 'codigoBienServicio', header: 'Anexo SPOT / Concepto', width: '210px', render: (r) => <span className="text-[11px]">{r.codigoBienServicio}</span> },
    { key: 'tasaPorcentaje', header: 'Tasa %', width: '65px', align: 'right', render: (r) => `${r.tasaPorcentaje.toFixed(2)}%` },
    { key: 'importeOperacionPen', header: 'Importe Op. S/', width: '105px', align: 'right', render: (r) => r.importeOperacionPen.toFixed(2) },
    { key: 'importeTributoPen', header: 'Depósito/Ret. S/', width: '110px', align: 'right', render: (r) => <span className="font-bold text-[#111827]">{r.importeTributoPen.toFixed(2)}</span> },
    { key: 'constanciaNumero', header: 'N° Constancia', width: '105px', render: (r) => <span className="font-mono text-[#1E6F42] font-bold">{r.constanciaNumero}</span> },
  ];

  const totalOperacion = filtrados.reduce((s, r) => s + r.importeOperacionPen, 0);
  const totalTributo = filtrados.reduce((s, r) => s + r.importeTributoPen, 0);

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Control de Detracciones (SPOT - D.Leg. N° 940), Retenciones y Percepciones de IGV"
        subtitulo="Verificación de constancias de depósito Banco de la Nación para ejercicio del crédito fiscal"
        acciones={[
          {
            id: 'exportar-spot',
            label: 'Exportar TXT Lote SPOT',
            icono: Download,
            primario: true,
            onClick: exportarLoteSpot,
          },
        ]}
        derecha={<SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="px-3 py-1.5 bg-[#F5F7FA] border-b border-[#D1D5DB] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#4B5563]">Filtrar por régimen:</span>
          {(['TODOS', 'DETRACCION_SPOT', 'RETENCION_IGV', 'PERCEPCION_IGV'] as const).map((reg) => (
            <button
              key={reg}
              type="button"
              onClick={() => setFiltroRegimen(reg)}
              className={`h-6 px-2.5 text-[11px] border ${
                filtroRegimen === reg
                  ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F]'
                  : 'bg-[#FFFFFF] text-[#111827] border-[#D1D5DB] hover:bg-[#E5E7EB]'
              }`}
            >
              {reg === 'TODOS' ? 'Todos' : reg === 'DETRACCION_SPOT' ? 'Detracciones SPOT (Redondeo S/ entero)' : reg === 'RETENCION_IGV' ? 'Retenciones IGV (3%)' : 'Percepciones IGV'}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-[#4B5563]">
          R.S. N° 183-2004/SUNAT: el depósito SPOT se redondea a enteros (≥ 0.50 al entero superior).
        </span>
      </div>

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={filtrados}
          rowKey={(r) => r.id}
          totales={{
            codigoBienServicio: <span className="font-bold">TOTAL DEL PERÍODO ({filtrados.length} constancias)</span>,
            importeOperacionPen: totalOperacion.toFixed(2),
            importeTributoPen: totalTributo.toFixed(2),
          }}
        />
      </div>
    </div>
  );
};
