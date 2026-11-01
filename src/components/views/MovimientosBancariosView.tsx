import React, { useState } from 'react';
import Decimal from 'decimal.js';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';
import { useAppContext } from '../../context/AppContext';

interface MovimientoBancarioFila {
  id: string;
  fecha: string;
  medioPagoSunat: string;
  numOperacion: string;
  tercero: string;
  concepto: string;
  ingresoPen: number;
  egresoPen: number;
  itfTruncadoPen: number;
}

// Ley N° 28194 Art. 10°: alícuota ITF 0.005% truncada a dos decimales
const calcularItfTruncado = (monto: number): number => {
  return new Decimal(monto).mul('0.00005').toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
};

export const MovimientosBancariosView: React.FC = () => {
  const { state } = useAppContext();
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-03');

  const movimientos: MovimientoBancarioFila[] = [
    {
      id: 'mb-1',
      fecha: '2026-03-05',
      medioPagoSunat: '003 - Transferencia de fondos',
      numOperacion: 'OP-884120',
      tercero: 'CORPORACION COMERCIAL PERUANA S.A.C.',
      concepto: 'Cobranza Factura F001-0001510',
      ingresoPen: 10030.0,
      egresoPen: 0,
      itfTruncadoPen: calcularItfTruncado(10030.0),
    },
    {
      id: 'mb-2',
      fecha: '2026-03-10',
      medioPagoSunat: '001 - Depósito en cuenta',
      numOperacion: 'OP-889401',
      tercero: 'SERVICIOS LOGISTICOS DEL SUR S.A.C.',
      concepto: 'Cancelación Factura F001-0001842 (Neto de detracción SPOT)',
      ingresoPen: 0,
      egresoPen: 4320.0,
      itfTruncadoPen: calcularItfTruncado(4320.0),
    },
  ];

  const columnas: ColumnaTablaDensa<MovimientoBancarioFila>[] = [
    { key: 'fecha', header: 'Fecha', width: '90px', render: (r) => <span className="font-mono">{r.fecha}</span> },
    { key: 'medioPagoSunat', header: 'Medio Pago (Tabla 01)', width: '175px', render: (r) => <span className="text-[11px]">{r.medioPagoSunat}</span> },
    { key: 'numOperacion', header: 'N° Operación', width: '105px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.numOperacion}</span> },
    { key: 'tercero', header: 'Girador / Beneficiario', width: '240px', render: (r) => r.tercero },
    { key: 'concepto', header: 'Glosa de Operación Bancaria', render: (r) => r.concepto },
    { key: 'ingresoPen', header: 'Ingresos S/', width: '105px', align: 'right', render: (r) => (r.ingresoPen > 0 ? r.ingresoPen.toFixed(2) : '-') },
    { key: 'egresoPen', header: 'Egresos S/', width: '105px', align: 'right', render: (r) => (r.egresoPen > 0 ? r.egresoPen.toFixed(2) : '-') },
    { key: 'itfTruncadoPen', header: 'ITF (0.005%) S/', width: '105px', align: 'right', render: (r) => <span className="font-mono text-[#4B5563]">{r.itfTruncadoPen.toFixed(2)}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Movimientos de Ingresos y Egresos Bancarios (Bancarización e ITF Ley N° 28194)"
        subtitulo="Registro de operaciones en cuentas corrientes con cálculo de ITF al 0.005% truncado a 2 decimales"
        derecha={<SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={movimientos}
          rowKey={(r) => r.id}
        />
      </div>
    </div>
  );
};
