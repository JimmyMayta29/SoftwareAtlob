import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';

interface FondoFijoCajaChica {
  id: string;
  codigoFondo: string;
  denominacion: string;
  responsableDni: string;
  responsableNombre: string;
  cuentaContable: string;
  montoAutorizadoPen: number;
  topeMaximoComprobantePen: number;
  estado: 'ACTIVO' | 'CERRADO';
}

export const CajaChicaAperturaView: React.FC = () => {
  const { notify } = useAppContext();
  const [fondos] = useState<FondoFijoCajaChica[]>([
    {
      id: 'cc-1',
      codigoFondo: 'FF-SEDE-01',
      denominacion: 'FONDO FIJO ADMINISTRACIÓN CENTRAL LIMA',
      responsableDni: '71829304',
      responsableNombre: 'ROJAS VARGAS LUCIA FERNANDA',
      cuentaContable: '102101',
      montoAutorizadoPen: 2000.0,
      topeMaximoComprobantePen: 350.0,
      estado: 'ACTIVO',
    },
  ]);

  const columnas: ColumnaTablaDensa<FondoFijoCajaChica>[] = [
    { key: 'codigoFondo', header: 'Cód. Fondo', width: '95px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.codigoFondo}</span> },
    { key: 'denominacion', header: 'Denominación del Fondo Fijo (Subcuenta 102)', render: (r) => <span className="font-bold text-[#111827]">{r.denominacion}</span> },
    { key: 'responsableDni', header: 'DNI Custodio', width: '90px', render: (r) => <span className="font-mono">{r.responsableDni}</span> },
    { key: 'responsableNombre', header: 'Custodio Responsable', width: '230px', render: (r) => r.responsableNombre },
    { key: 'cuentaContable', header: 'Cta. PCGE', width: '85px', align: 'center', render: (r) => <span className="font-mono font-bold">{r.cuentaContable}</span> },
    { key: 'montoAutorizadoPen', header: 'Fondo Asignado S/', width: '125px', align: 'right', render: (r) => <span className="font-bold">{r.montoAutorizadoPen.toFixed(2)}</span> },
    { key: 'topeMaximoComprobantePen', header: 'Tope por Comp. S/', width: '120px', align: 'right', render: (r) => r.topeMaximoComprobantePen.toFixed(2) },
    { key: 'estado', header: 'Estado', width: '80px', align: 'center', render: (r) => <span className="font-bold text-[#1E6F42] text-[11px]">{r.estado}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Apertura y Asignación de Fondos Fijos de Caja Chica (Cuenta 102 PCGE)"
        subtitulo="Designación de custodio responsable, importe autorizado y límite máximo por gasto menor"
        acciones={[
          {
            id: 'aperturar',
            label: 'Generar Asiento de Apertura (102 contra 104)',
            icono: Plus,
            primario: true,
            onClick: () => notify('Asiento de apertura de fondo fijo 102101 contra 104101 verificado', 'success'),
          },
        ]}
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={fondos}
          rowKey={(r) => r.id}
        />
      </div>
    </div>
  );
};
