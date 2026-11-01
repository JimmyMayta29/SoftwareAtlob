import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';

interface ObligacionPorPagar {
  id: string;
  rucProveedor: string;
  razonSocial: string;
  comprobante: string;
  fechaEmision: string;
  fechaVencimiento: string;
  importeOriginal: number;
  detraccionRetencion: number;
  netoPagarProveedor: number;
  estadoPago: 'PENDIENTE' | 'CANCELADO';
}

const OBLIGACIONES_INICIALES: ObligacionPorPagar[] = [
  {
    id: 'cxp-1',
    rucProveedor: '20512345678',
    razonSocial: 'SERVICIOS LOGISTICOS DEL SUR S.A.C.',
    comprobante: 'F001-0001842',
    fechaEmision: '2026-03-10',
    fechaVencimiento: '2026-04-09',
    importeOriginal: 4500.0,
    detraccionRetencion: 180.0, // SPOT 4%
    netoPagarProveedor: 4320.0,
    estadoPago: 'PENDIENTE',
  },
  {
    id: 'cxp-2',
    rucProveedor: '20601122334',
    razonSocial: 'ASESORIA EMPRESARIAL INTEGRAL S.A.C.',
    comprobante: 'E001-0000419',
    fechaEmision: '2026-03-14',
    fechaVencimiento: '2026-04-13',
    importeOriginal: 3540.0,
    detraccionRetencion: 425.0, // SPOT 12%
    netoPagarProveedor: 3115.0,
    estadoPago: 'PENDIENTE',
  },
];

export const CuentasPorPagarView: React.FC = () => {
  const { notify } = useAppContext();
  const [obligaciones, setObligaciones] = useState<ObligacionPorPagar[]>(OBLIGACIONES_INICIALES);

  const cancelarObligacion = (ob: ObligacionPorPagar) => {
    setObligaciones((prev) =>
      prev.map((o) => (o.id === ob.id ? { ...o, estadoPago: 'CANCELADO', netoPagarProveedor: 0 } : o))
    );
    notify(`Pago a proveedor registrado para ${ob.comprobante} (Asiento 4212 contra 1041)`, 'success');
  };

  const columnas: ColumnaTablaDensa<ObligacionPorPagar>[] = [
    { key: 'rucProveedor', header: 'RUC Proveedor', width: '95px', render: (r) => <span className="font-mono">{r.rucProveedor}</span> },
    { key: 'razonSocial', header: 'Denominación del Proveedor (Cuenta 42)', render: (r) => <span className="font-bold text-[#111827]">{r.razonSocial}</span> },
    { key: 'comprobante', header: 'Comprobante', width: '110px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.comprobante}</span> },
    { key: 'fechaEmision', header: 'F. Emisión', width: '85px', render: (r) => <span className="font-mono">{r.fechaEmision}</span> },
    { key: 'fechaVencimiento', header: 'F. Vencimiento', width: '95px', render: (r) => <span className="font-mono">{r.fechaVencimiento}</span> },
    { key: 'importeOriginal', header: 'Importe CP S/', width: '105px', align: 'right', render: (r) => r.importeOriginal.toFixed(2) },
    { key: 'detraccionRetencion', header: 'SPOT / Ret. S/', width: '100px', align: 'right', render: (r) => r.detraccionRetencion.toFixed(2) },
    { key: 'netoPagarProveedor', header: 'Saldo por Pagar S/', width: '125px', align: 'right', render: (r) => <span className="font-bold text-[#B91C1C]">{r.netoPagarProveedor.toFixed(2)}</span> },
    {
      key: 'accion',
      header: 'Desembolso',
      width: '105px',
      align: 'center',
      render: (r) =>
        r.estadoPago === 'PENDIENTE' ? (
          <button
            type="button"
            onClick={() => cancelarObligacion(r)}
            className="h-5 px-2 bg-[#1E3A5F] text-[#FFFFFF] text-[11px] hover:bg-[#162C49]"
          >
            Pagar
          </button>
        ) : (
          <span className="text-[#1E6F42] font-bold text-[11px]">PAGADO</span>
        ),
    },
  ];

  const totalPagar = obligaciones.reduce((s, o) => s + o.netoPagarProveedor, 0);

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Programación de Cuentas por Pagar Comerciales — Terceros (Cuenta 42 PCGE)"
        subtitulo="Control de obligaciones con proveedores deduciendo detracciones SPOT y retenciones de IGV"
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={obligaciones}
          rowKey={(r) => r.id}
          totales={{
            razonSocial: <span className="font-bold">SALDO NETO PENDIENTE DE PAGO A PROVEEDORES</span>,
            netoPagarProveedor: totalPagar.toFixed(2),
          }}
        />
      </div>
    </div>
  );
};
