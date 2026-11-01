import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';

interface DocumentoPorCobrar {
  id: string;
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

const CARTERA_INICIAL: DocumentoPorCobrar[] = [
  {
    id: 'cxc-1',
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
  const [documentos, setDocumentos] = useState<DocumentoPorCobrar[]>(CARTERA_INICIAL);

  const amortizarCobranza = (doc: DocumentoPorCobrar) => {
    setDocumentos((prev) =>
      prev.map((d) =>
        d.id === doc.id
          ? { ...d, importeCobrado: d.importeOriginal, saldoPendiente: 0 }
          : d
      )
    );
    notify(`Cobranza total registrada para ${doc.comprobante} (Asiento 1041 contra 1212)`, 'success');
  };

  const columnas: ColumnaTablaDensa<DocumentoPorCobrar>[] = [
    { key: 'rucCliente', header: 'RUC Cliente', width: '95px', render: (r) => <span className="font-mono">{r.rucCliente}</span> },
    { key: 'razonSocial', header: 'Denominación del Cliente (Cuenta 12)', render: (r) => <span className="font-bold text-[#111827]">{r.razonSocial}</span> },
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
            className="h-5 px-2 bg-[#1E3A5F] text-[#FFFFFF] text-[11px] hover:bg-[#162C49]"
          >
            Cobrar
          </button>
        ) : (
          <span className="text-[#1E6F42] font-bold text-[11px]">CANCELADO</span>
        ),
    },
  ];

  const totalSaldo = documentos.reduce((s, d) => s + d.saldoPendiente, 0);

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Cartera de Cuentas por Cobrar Comerciales — Terceros (Cuenta 12 PCGE)"
        subtitulo="Control de saldos pendientes por comprobante de venta y aplicación de cobranzas en bancos"
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={documentos}
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
