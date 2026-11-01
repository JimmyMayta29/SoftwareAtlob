import React from 'react';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';

interface FilaAntiguedad {
  id: string;
  ruc: string;
  razonSocial: string;
  cuentaPcge: '1212' | '4212';
  porVencer: number;
  vencido1a30: number;
  vencido31a60: number;
  vencido61a90: number;
  vencidoMas90: number;
  totalSaldo: number;
}

const DATOS_ANTIGUEDAD: FilaAntiguedad[] = [
  {
    id: 'ag-1',
    ruc: '20100047218',
    razonSocial: 'CORPORACION COMERCIAL PERUANA S.A.C.',
    cuentaPcge: '1212',
    porVencer: 6030.0,
    vencido1a30: 1850.0,
    vencido31a60: 0,
    vencido61a90: 0,
    vencidoMas90: 0,
    totalSaldo: 7880.0,
  },
  {
    id: 'ag-2',
    ruc: '20498877665',
    razonSocial: 'DISTRIBUIDORA NACIONAL DEL CENTRO S.R.L.',
    cuentaPcge: '1212',
    porVencer: 4956.0,
    vencido1a30: 0,
    vencido31a60: 1200.0,
    vencido61a90: 0,
    vencidoMas90: 450.0,
    totalSaldo: 6606.0,
  },
  {
    id: 'ag-3',
    ruc: '20512345678',
    razonSocial: 'SERVICIOS LOGISTICOS DEL SUR S.A.C.',
    cuentaPcge: '4212',
    porVencer: 4320.0,
    vencido1a30: 0,
    vencido31a60: 0,
    vencido61a90: 0,
    vencidoMas90: 0,
    totalSaldo: 4320.0,
  },
];

export const AntiguedadSaldosView: React.FC = () => {
  const columnas: ColumnaTablaDensa<FilaAntiguedad>[] = [
    { key: 'cuentaPcge', header: 'Cta.', width: '55px', align: 'center', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.cuentaPcge}</span> },
    { key: 'ruc', header: 'RUC', width: '95px', render: (r) => <span className="font-mono">{r.ruc}</span> },
    { key: 'razonSocial', header: 'Cliente / Proveedor', render: (r) => <span className="font-bold text-[#111827]">{r.razonSocial}</span> },
    { key: 'porVencer', header: 'Vigentes (S/)', width: '105px', align: 'right', render: (r) => r.porVencer.toFixed(2) },
    { key: 'vencido1a30', header: '1 a 30 días', width: '95px', align: 'right', render: (r) => r.vencido1a30.toFixed(2) },
    { key: 'vencido31a60', header: '31 a 60 días', width: '95px', align: 'right', render: (r) => r.vencido31a60.toFixed(2) },
    { key: 'vencido61a90', header: '61 a 90 días', width: '95px', align: 'right', render: (r) => r.vencido61a90.toFixed(2) },
    { key: 'vencidoMas90', header: '> 90 días (NIIF 9)', width: '115px', align: 'right', render: (r) => <span className={r.vencidoMas90 > 0 ? 'text-[#B91C1C] font-bold' : ''}>{r.vencidoMas90.toFixed(2)}</span> },
    { key: 'totalSaldo', header: 'Saldo Total S/', width: '110px', align: 'right', render: (r) => <span className="font-bold">{r.totalSaldo.toFixed(2)}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Análisis de Antigüedad de Saldos por Tramos de Vencimiento (1–30, 31–60, 61–90, >90 días)"
        subtitulo="Estratificación de cartera comercial para estimación de cobranza dudosa (Cuenta 19 PCGE / Art. 37° inc. i LIR)"
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={DATOS_ANTIGUEDAD}
          rowKey={(r) => r.id}
        />
      </div>
    </div>
  );
};
