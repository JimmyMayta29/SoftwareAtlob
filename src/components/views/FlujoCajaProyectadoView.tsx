import React from 'react';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';

interface LineaFlujoProyectado {
  id: string;
  concepto: string;
  tipo: 'SALDO_INICIAL' | 'INGRESO' | 'EGRESO' | 'SALDO_FINAL';
  semana1: number;
  semana2: number;
  semana3: number;
  semana4: number;
}

const LINEAS_FLUJO: LineaFlujoProyectado[] = [
  { id: 'f-0', concepto: 'SALDO INICIAL DISPONIBLE EN CAJA Y BANCOS (10)', tipo: 'SALDO_INICIAL', semana1: 84520, semana2: 92400, semana3: 88150, semana4: 96300 },
  { id: 'f-1', concepto: '(+) Cobranzas proyectadas de cartera de clientes (12)', tipo: 'INGRESO', semana1: 24500, semana2: 18200, semana3: 31400, semana4: 26800 },
  { id: 'f-2', concepto: '(-) Pago a proveedores de bienes y servicios (42)', tipo: 'EGRESO', semana1: -12420, semana2: -14850, semana3: -11250, semana4: -15400 },
  { id: 'f-3', concepto: '(-) Liquidación de tributos PDT 621, PLAME y AFP (40)', tipo: 'EGRESO', semana1: -4200, semana2: -7600, semana3: 0, semana4: 0 },
  { id: 'f-4', concepto: '(-) Pago de remuneraciones netas de planilla (41)', tipo: 'EGRESO', semana1: 0, semana2: 0, semana3: -12000, semana4: 0 },
  { id: 'f-5', concepto: 'SALDO FINAL PROYECTADO DE TESORERÍA S/', tipo: 'SALDO_FINAL', semana1: 92400, semana2: 88150, semana3: 96300, semana4: 107700 },
];

export const FlujoCajaProyectadoView: React.FC = () => {
  const columnas: ColumnaTablaDensa<LineaFlujoProyectado>[] = [
    {
      key: 'concepto',
      header: 'Concepto de Tesorería / Flujo Operativo',
      render: (r) => (
        <span className={r.tipo === 'SALDO_INICIAL' || r.tipo === 'SALDO_FINAL' ? 'font-bold text-[#1E3A5F]' : ''}>
          {r.concepto}
        </span>
      ),
    },
    { key: 'semana1', header: 'Semana 1 (S/)', width: '130px', align: 'right', render: (r) => <span className={r.tipo === 'SALDO_FINAL' ? 'font-bold' : ''}>{r.semana1.toFixed(2)}</span> },
    { key: 'semana2', header: 'Semana 2 (S/)', width: '130px', align: 'right', render: (r) => <span className={r.tipo === 'SALDO_FINAL' ? 'font-bold' : ''}>{r.semana2.toFixed(2)}</span> },
    { key: 'semana3', header: 'Semana 3 (S/)', width: '130px', align: 'right', render: (r) => <span className={r.tipo === 'SALDO_FINAL' ? 'font-bold' : ''}>{r.semana3.toFixed(2)}</span> },
    { key: 'semana4', header: 'Semana 4 (S/)', width: '130px', align: 'right', render: (r) => <span className={r.tipo === 'SALDO_FINAL' ? 'font-bold' : ''}>{r.semana4.toFixed(2)}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Flujo de Caja Proyectado de Tesorería (Horizonte de 4 Semanas)"
        subtitulo="Proyección de liquidez a partir de vencimientos de cuentas por cobrar (12), por pagar (42), planillas (41) y tributos (40)"
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={LINEAS_FLUJO}
          rowKey={(r) => r.id}
        />
      </div>
    </div>
  );
};
