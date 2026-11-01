import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';

interface GastoCajaChica {
  id: string;
  fecha: string;
  comprobante: string;
  rucProveedor: string;
  razonSocial: string;
  concepto: string;
  cuentaGasto: string;
  centroCosto: string;
  basePen: number;
  igvPen: number;
  totalPen: number;
}

export const CajaChicaGastosView: React.FC = () => {
  const { notify } = useAppContext();
  const [gastos] = useState<GastoCajaChica[]>([
    {
      id: 'gc-1',
      fecha: '2026-03-06',
      comprobante: 'F001-004120',
      rucProveedor: '20100123459',
      razonSocial: 'LIBRERIA Y PAPELERIA EL ESCRITORIO S.A.C.',
      concepto: 'Útiles de oficina y papel bond A4',
      cuentaGasto: '656101',
      centroCosto: 'CC-100',
      basePen: 120.0,
      igvPen: 21.6,
      totalPen: 141.6,
    },
    {
      id: 'gc-2',
      fecha: '2026-03-11',
      comprobante: 'B002-009812',
      rucProveedor: '20554433221',
      razonSocial: 'ESTACION DE SERVICIOS LIMA CENTRO S.A.C.',
      concepto: 'Movilidad local para trámites notariales',
      cuentaGasto: '631102',
      centroCosto: 'CC-100',
      basePen: 65.0,
      igvPen: 0.0,
      totalPen: 65.0,
    },
  ]);

  const columnas: ColumnaTablaDensa<GastoCajaChica>[] = [
    { key: 'fecha', header: 'Fecha', width: '85px', render: (r) => <span className="font-mono">{r.fecha}</span> },
    { key: 'comprobante', header: 'Comprobante', width: '105px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.comprobante}</span> },
    { key: 'rucProveedor', header: 'RUC Emisor', width: '95px', render: (r) => <span className="font-mono">{r.rucProveedor}</span> },
    { key: 'razonSocial', header: 'Proveedor', width: '230px', render: (r) => r.razonSocial },
    { key: 'concepto', header: 'Concepto del Gasto Menor', render: (r) => r.concepto },
    { key: 'cuentaGasto', header: 'Cta. 6', width: '70px', align: 'center', render: (r) => <span className="font-mono font-bold">{r.cuentaGasto}</span> },
    { key: 'centroCosto', header: 'C. Costo', width: '75px', align: 'center', render: (r) => <span className="font-mono">{r.centroCosto}</span> },
    { key: 'basePen', header: 'Base S/', width: '85px', align: 'right', render: (r) => r.basePen.toFixed(2) },
    { key: 'igvPen', header: 'IGV S/', width: '75px', align: 'right', render: (r) => r.igvPen.toFixed(2) },
    { key: 'totalPen', header: 'Total S/', width: '90px', align: 'right', render: (r) => <span className="font-bold">{r.totalPen.toFixed(2)}</span> },
  ];

  const totalRendido = gastos.reduce((s, g) => s + g.totalPen, 0);

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Rendición de Gastos de Caja Chica"
        subtitulo="Sustento documentario de gastos menores con imputación al Elemento 6 y Centro de Costo"
        acciones={[
          {
            id: 'registrar',
            label: 'Registrar Comprobante de Caja Chica',
            icono: Plus,
            primario: true,
            onClick: () => notify('Liquidación de gastos lista para reposición de fondo fijo', 'info'),
          },
        ]}
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={gastos}
          rowKey={(r) => r.id}
          totales={{
            concepto: <span className="font-bold">TOTAL RENDIDO DEL FONDO FIJO</span>,
            totalPen: totalRendido.toFixed(2),
          }}
        />
      </div>
    </div>
  );
};
