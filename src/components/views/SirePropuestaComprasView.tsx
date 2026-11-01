import React, { useState } from 'react';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';

interface FilaPropuestaRce {
  carSunat: string;
  fechaEmision: string;
  tipoComp: string;
  serie: string;
  numero: string;
  rucProveedor: string;
  razonSocial: string;
  biGravadaDg: number;
  igvDg: number;
  totalCp: number;
  moneda: string;
}

const PROPUESTA_RCE_INICIAL: FilaPropuestaRce[] = [
  {
    carSunat: '2051234567801F0010000001842',
    fechaEmision: '2026-03-10',
    tipoComp: '01',
    serie: 'F001',
    numero: '0001842',
    rucProveedor: '20512345678',
    razonSocial: 'SERVICIOS LOGISTICOS DEL SUR S.A.C.',
    biGravadaDg: 3813.56,
    igvDg: 686.44,
    totalCp: 4500.0,
    moneda: 'PEN',
  },
  {
    carSunat: '2060112233401E0010000000419',
    fechaEmision: '2026-03-14',
    tipoComp: '01',
    serie: 'E001',
    numero: '0000419',
    rucProveedor: '20601122334',
    razonSocial: 'ASESORIA EMPRESARIAL INTEGRAL S.A.C.',
    biGravadaDg: 3000.0,
    igvDg: 540.0,
    totalCp: 3540.0,
    moneda: 'PEN',
  },
];

export const SirePropuestaComprasView: React.FC = () => {
  const { state, notify } = useAppContext();
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-03');
  const [filas] = useState<FilaPropuestaRce[]>(PROPUESTA_RCE_INICIAL);

  const columnas: ColumnaTablaDensa<FilaPropuestaRce>[] = [
    { key: 'carSunat', header: 'CAR SUNAT (27 dígitos)', width: '210px', render: (r) => <span className="font-mono text-[11px] font-bold text-[#1E3A5F]">{r.carSunat}</span> },
    { key: 'fechaEmision', header: 'F. Emisión', width: '85px', render: (r) => <span className="font-mono">{r.fechaEmision}</span> },
    { key: 'tipoComp', header: 'Tipo', width: '50px', align: 'center', render: (r) => <span className="font-mono">{r.tipoComp}</span> },
    { key: 'serie', header: 'Serie', width: '60px', render: (r) => <span className="font-mono">{r.serie}</span> },
    { key: 'numero', header: 'Número', width: '80px', render: (r) => <span className="font-mono">{r.numero}</span> },
    { key: 'rucProveedor', header: 'RUC Emisor', width: '95px', render: (r) => <span className="font-mono">{r.rucProveedor}</span> },
    { key: 'razonSocial', header: 'Razón Social Proveedor', render: (r) => r.razonSocial },
    { key: 'biGravadaDg', header: 'BI Grav. DG', width: '95px', align: 'right', render: (r) => r.biGravadaDg.toFixed(2) },
    { key: 'igvDg', header: 'IGV DG', width: '85px', align: 'right', render: (r) => r.igvDg.toFixed(2) },
    { key: 'totalCp', header: 'Total CP', width: '95px', align: 'right', render: (r) => <span className="font-bold">{r.totalCp.toFixed(2)}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="SIRE — Propuesta del Registro de Compras Electrónico (RCE - Anexo 11 R.S. 000112-2021/SUNAT)"
        subtitulo="Consulta de comprobantes propuestos por SUNAT con Código de Anotación de Registro (CAR de 27 dígitos)"
        acciones={[
          {
            id: 'sincronizar',
            label: 'Sincronizar Propuesta RCE',
            icono: RefreshCw,
            primario: true,
            onClick: () => notify(`Propuesta RCE ${periodo} sincronizada (Modo Sandbox)`, 'success'),
          },
        ]}
        derecha={<SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={filas}
          rowKey={(r) => r.carSunat}
        />
      </div>
    </div>
  );
};
