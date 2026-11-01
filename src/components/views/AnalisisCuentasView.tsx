import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';

interface PartidaPendienteCuenta {
  id: string;
  cuenta: string;
  rucAnexo: string;
  razonSocial: string;
  documentoReferencia: string;
  fechaEmision: string;
  cargoPen: number;
  abonoPen: number;
  saldoPendientePen: number;
}

const PARTIDAS_ANALISIS: PartidaPendienteCuenta[] = [
  {
    id: 'an-1',
    cuenta: '121201',
    rucAnexo: '20100047218',
    razonSocial: 'CORPORACION COMERCIAL PERUANA S.A.C.',
    documentoReferencia: '01-F001-0001510',
    fechaEmision: '2026-03-08',
    cargoPen: 10030.0,
    abonoPen: 4000.0,
    saldoPendientePen: 6030.0,
  },
  {
    id: 'an-2',
    cuenta: '421201',
    rucAnexo: '20512345678',
    razonSocial: 'SERVICIOS LOGISTICOS DEL SUR S.A.C.',
    documentoReferencia: '01-F001-0001842',
    fechaEmision: '2026-03-10',
    cargoPen: 180.0,
    abonoPen: 4500.0,
    saldoPendientePen: -4320.0,
  },
  {
    id: 'an-3',
    cuenta: '401111',
    rucAnexo: '20131312955',
    razonSocial: 'SUNAT — IGV CUENTA PROPIA',
    documentoReferencia: 'LIQ-2026-03',
    fechaEmision: '2026-03-31',
    cargoPen: 1226.44,
    abonoPen: 2286.0,
    saldoPendientePen: -1059.56,
  },
];

export const AnalisisCuentasView: React.FC = () => {
  const [filtroCuenta, setFiltroCuenta] = useState('');

  const filtrados = PARTIDAS_ANALISIS.filter(
    (p) =>
      p.cuenta.includes(filtroCuenta) ||
      p.rucAnexo.includes(filtroCuenta) ||
      p.razonSocial.toLowerCase().includes(filtroCuenta.toLowerCase()) ||
      p.documentoReferencia.toLowerCase().includes(filtroCuenta.toLowerCase())
  );

  const columnas: ColumnaTablaDensa<PartidaPendienteCuenta>[] = [
    { key: 'cuenta', header: 'Subcuenta PCGE', width: '105px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.cuenta}</span> },
    { key: 'rucAnexo', header: 'RUC Anexo', width: '95px', render: (r) => <span className="font-mono">{r.rucAnexo}</span> },
    { key: 'razonSocial', header: 'Denominación del Anexo', render: (r) => <span className="font-bold text-[#111827]">{r.razonSocial}</span> },
    { key: 'documentoReferencia', header: 'Doc. Referencia', width: '130px', render: (r) => <span className="font-mono">{r.documentoReferencia}</span> },
    { key: 'fechaEmision', header: 'F. Origen', width: '85px', render: (r) => <span className="font-mono">{r.fechaEmision}</span> },
    { key: 'cargoPen', header: 'Cargos S/', width: '105px', align: 'right', render: (r) => r.cargoPen.toFixed(2) },
    { key: 'abonoPen', header: 'Abonos S/', width: '105px', align: 'right', render: (r) => r.abonoPen.toFixed(2) },
    {
      key: 'saldoPendientePen',
      header: 'Saldo Pendiente S/',
      width: '125px',
      align: 'right',
      render: (r) => (
        <span className={`font-bold ${r.saldoPendientePen >= 0 ? 'text-[#1E3A5F]' : 'text-[#B91C1C]'}`}>
          {r.saldoPendientePen.toFixed(2)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Análisis de Cuentas por Anexo y Documento de Referencia"
        subtitulo="Desagregación de saldos de balance por RUC/DNI y comprobante origen (Formatos 3.3 al 3.14 Libro Inventarios y Balances)"
        derecha={
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#4B5563] absolute left-2 top-1.5" strokeWidth={1.5} />
            <input
              type="text"
              value={filtroCuenta}
              onChange={(e) => setFiltroCuenta(e.target.value)}
              placeholder="Filtrar cuenta, RUC o doc..."
              className="h-6 pl-7 pr-2 text-[12px] bg-[#FFFFFF] border border-[#D1D5DB] w-56"
            />
          </div>
        }
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={filtrados}
          rowKey={(r) => r.id}
        />
      </div>
    </div>
  );
};
