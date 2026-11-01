import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';

interface ControlCalidadCartera {
  id: string;
  rucEmpresa: string;
  razonSocial: string;
  responsableContable: string;
  sireConciliado: 'OK' | 'PENDIENTE';
  bancosConciliado: 'OK' | 'PENDIENTE';
  pdt621Revisado: 'OK' | 'PENDIENTE';
  eeffCuadrados: 'OK' | 'PENDIENTE';
}

const CARTERA_ESTUDIO: ControlCalidadCartera[] = [
  {
    id: 'cc-e1',
    rucEmpresa: '20601234567',
    razonSocial: 'COMERCIALIZADORA ANDINA S.A.C.',
    responsableContable: 'Jimmy Mayta',
    sireConciliado: 'OK',
    bancosConciliado: 'OK',
    pdt621Revisado: 'OK',
    eeffCuadrados: 'OK',
  },
  {
    id: 'cc-e2',
    rucEmpresa: '20559876543',
    razonSocial: 'INDUSTRIAS METALMECANICAS DEL PERU S.A.C.',
    responsableContable: 'Carlos Quispe',
    sireConciliado: 'OK',
    bancosConciliado: 'OK',
    pdt621Revisado: 'PENDIENTE',
    eeffCuadrados: 'OK',
  },
];

export const ControlCalidadEstudioView: React.FC = () => {
  const renderEstado = (val: 'OK' | 'PENDIENTE') => (
    <span className={`font-bold text-[11px] ${val === 'OK' ? 'text-[#1E6F42]' : 'text-[#B45309]'}`}>
      {val}
    </span>
  );

  const columnas: ColumnaTablaDensa<ControlCalidadCartera>[] = [
    { key: 'rucEmpresa', header: 'RUC Cliente', width: '100px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.rucEmpresa}</span> },
    { key: 'razonSocial', header: 'Empresa de la Cartera del Estudio', render: (r) => <span className="font-bold text-[#111827]">{r.razonSocial}</span> },
    { key: 'responsableContable', header: 'Contador Asignado', width: '145px', render: (r) => r.responsableContable },
    { key: 'sireConciliado', header: 'Cruce SIRE', width: '105px', align: 'center', render: (r) => renderEstado(r.sireConciliado) },
    { key: 'bancosConciliado', header: 'Concil. Bancos', width: '110px', align: 'center', render: (r) => renderEstado(r.bancosConciliado) },
    { key: 'pdt621Revisado', header: 'Revisión PDT 621', width: '115px', align: 'center', render: (r) => renderEstado(r.pdt621Revisado) },
    { key: 'eeffCuadrados', header: 'Balance Cuadrado', width: '120px', align: 'center', render: (r) => renderEstado(r.eeffCuadrados) },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Matriz de Control de Calidad Contable y Tributario del Estudio"
        subtitulo="Supervisión del avance mensual de cierre contable, conciliación SIRE y revisión de declaraciones por empresa"
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={CARTERA_ESTUDIO}
          rowKey={(r) => r.id}
        />
      </div>
    </div>
  );
};
