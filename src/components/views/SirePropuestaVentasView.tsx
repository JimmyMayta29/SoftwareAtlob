import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';

interface FilaPropuestaRvie {
  carSunat: string;
  fechaEmision: string;
  tipoComp: string;
  serie: string;
  numero: string;
  docCliente: string;
  razonSocialCliente: string;
  biGravada: number;
  igv: number;
  totalCp: number;
}

const PROPUESTA_RVIE_INICIAL: FilaPropuestaRvie[] = [
  {
    carSunat: '2060123456701F0010000001510',
    fechaEmision: '2026-03-08',
    tipoComp: '01',
    serie: 'F001',
    numero: '0001510',
    docCliente: '20100047218',
    razonSocialCliente: 'CORPORACION COMERCIAL PERUANA S.A.C.',
    biGravada: 8500.0,
    igv: 1530.0,
    totalCp: 10030.0,
  },
  {
    carSunat: '2060123456701F0010000001511',
    fechaEmision: '2026-03-16',
    tipoComp: '01',
    serie: 'F001',
    numero: '0001511',
    docCliente: '20498877665',
    razonSocialCliente: 'DISTRIBUIDORA NACIONAL DEL CENTRO S.R.L.',
    biGravada: 4200.0,
    igv: 756.0,
    totalCp: 4956.0,
  },
];

export const SirePropuestaVentasView: React.FC = () => {
  const { state, notify } = useAppContext();
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-03');
  const [filas] = useState<FilaPropuestaRvie[]>(PROPUESTA_RVIE_INICIAL);

  const columnas: ColumnaTablaDensa<FilaPropuestaRvie>[] = [
    { key: 'carSunat', header: 'CAR SUNAT (27 dígitos)', width: '210px', render: (r) => <span className="font-mono text-[11px] font-bold text-[#1E3A5F]">{r.carSunat}</span> },
    { key: 'fechaEmision', header: 'F. Emisión', width: '85px', render: (r) => <span className="font-mono">{r.fechaEmision}</span> },
    { key: 'tipoComp', header: 'Tipo', width: '50px', align: 'center', render: (r) => <span className="font-mono">{r.tipoComp}</span> },
    { key: 'serie', header: 'Serie', width: '60px', render: (r) => <span className="font-mono">{r.serie}</span> },
    { key: 'numero', header: 'Número', width: '80px', render: (r) => <span className="font-mono">{r.numero}</span> },
    { key: 'docCliente', header: 'RUC/DNI Cliente', width: '105px', render: (r) => <span className="font-mono">{r.docCliente}</span> },
    { key: 'razonSocialCliente', header: 'Denominación del Adquirente o Usuario', render: (r) => r.razonSocialCliente },
    { key: 'biGravada', header: 'BI Gravada', width: '95px', align: 'right', render: (r) => r.biGravada.toFixed(2) },
    { key: 'igv', header: 'IGV / IPM', width: '85px', align: 'right', render: (r) => r.igv.toFixed(2) },
    { key: 'totalCp', header: 'Total CP', width: '95px', align: 'right', render: (r) => <span className="font-bold">{r.totalCp.toFixed(2)}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="SIRE — Propuesta del Registro de Ventas e Ingresos Electrónico (RVIE - Anexo 3 R.S. 000112-2021/SUNAT)"
        subtitulo="Consulta de comprobantes emitidos en la propuesta RVIE de SUNAT"
        acciones={[
          {
            id: 'sincronizar',
            label: 'Sincronizar Propuesta RVIE',
            icono: RefreshCw,
            primario: true,
            onClick: () => notify(`Propuesta RVIE ${periodo} sincronizada (Modo Sandbox)`, 'success'),
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
