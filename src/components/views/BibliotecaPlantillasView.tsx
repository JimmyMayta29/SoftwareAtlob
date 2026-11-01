import React from 'react';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';

interface PlantillaContable {
  codigo: string;
  subdiario: string;
  nombrePlantilla: string;
  dinamicaDebe: string;
  dinamicaHaber: string;
  destinoAutomatico: string;
}

const PLANTILLAS: PlantillaContable[] = [
  {
    codigo: 'PLT-COMP-01',
    subdiario: '11 - Compras',
    nombrePlantilla: 'Compra local de mercaderías gravada con IGV (18%)',
    dinamicaDebe: '601101 Mercaderías (Base) + 401111 IGV Cuenta Propia (18%)',
    dinamicaHaber: '421201 Facturas por Pagar Emitidas MN',
    destinoAutomatico: '201101 Mercaderías (Debe) / 611101 Variación de Existencias (Haber)',
  },
  {
    codigo: 'PLT-SERV-02',
    subdiario: '11 - Compras',
    nombrePlantilla: 'Servicio de asesoría empresarial afecto a Detracción SPOT (12%)',
    dinamicaDebe: '632301 Auditoría y Contable (Base) + 401111 IGV (18%)',
    dinamicaHaber: '421201 Facturas por Pagar (88%) + 421209 Detracción por Pagar (12%)',
    destinoAutomatico: '941101 Gastos de Administración (Debe) / 791101 Cargas Imputables (Haber)',
  },
  {
    codigo: 'PLT-VENT-01',
    subdiario: '12 - Ventas',
    nombrePlantilla: 'Venta local de mercaderías o servicios gravados con IGV (18%)',
    dinamicaDebe: '121201 Facturas por Cobrar Emitidas en Cartera MN (Total)',
    dinamicaHaber: '701211 Ventas Terceros (Base) + 401111 IGV Cuenta Propia (18%)',
    destinoAutomatico: 'Sin asiento de destino (ingreso directo Elemento 7)',
  },
  {
    codigo: 'PLT-HON-01',
    subdiario: '15 - Honorarios',
    nombrePlantilla: 'Recibo por Honorarios Electrónico con Retención de 4ta Categoría (8%)',
    dinamicaDebe: '632901 Otros Honorarios Profesionales (100%)',
    dinamicaHaber: '424101 Honorarios por Pagar (92%) + 401721 Renta 4ta Categoría (8%)',
    destinoAutomatico: '941101 Gastos de Administración (Debe) / 791101 Cargas Imputables (Haber)',
  },
];

export const BibliotecaPlantillasView: React.FC = () => {
  const columnas: ColumnaTablaDensa<PlantillaContable>[] = [
    { key: 'codigo', header: 'Código', width: '100px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.codigo}</span> },
    { key: 'subdiario', header: 'Subdiario', width: '105px', render: (r) => <span className="font-mono">{r.subdiario}</span> },
    { key: 'nombrePlantilla', header: 'Plantilla de Asiento Tipo', width: '250px', render: (r) => <span className="font-bold text-[#111827]">{r.nombrePlantilla}</span> },
    { key: 'dinamicaDebe', header: 'Cargo (Debe)', render: (r) => <span className="font-mono text-[11px]">{r.dinamicaDebe}</span> },
    { key: 'dinamicaHaber', header: 'Abono (Haber)', render: (r) => <span className="font-mono text-[11px]">{r.dinamicaHaber}</span> },
    { key: 'destinoAutomatico', header: 'Transferencia Automática Elemento 9/20', render: (r) => <span className="font-mono text-[11px] text-[#1E6F42]">{r.destinoAutomatico}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Biblioteca de Plantillas de Contabilización Automática del Estudio"
        subtitulo="Reglas preconfiguradas de partida doble y cuentas de destino conforme al PCGE 2019 Modificado"
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={PLANTILLAS}
          rowKey={(r) => r.codigo}
        />
      </div>
    </div>
  );
};
