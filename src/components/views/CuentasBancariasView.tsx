import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';

interface CuentaBancariaEmpresa {
  id: string;
  codigoBanco: string;
  nombreBanco: string;
  numeroCuenta: string;
  cci: string;
  moneda: 'PEN' | 'USD';
  cuentaContablePcge: string;
  tipoCuenta: 'CORRIENTE' | 'DETRACCIONES_BN' | 'AHORROS';
  saldoContable: number;
}

const CUENTAS_INICIALES: CuentaBancariaEmpresa[] = [
  {
    id: 'cb-1',
    codigoBanco: '02',
    nombreBanco: 'BANCO DE CRÉDITO DEL PERÚ (BCP)',
    numeroCuenta: '191-2458963-0-45',
    cci: '00219100245896304552',
    moneda: 'PEN',
    cuentaContablePcge: '104101',
    tipoCuenta: 'CORRIENTE',
    saldoContable: 84520.5,
  },
  {
    id: 'cb-2',
    codigoBanco: '02',
    nombreBanco: 'BANCO DE CRÉDITO DEL PERÚ (BCP)',
    numeroCuenta: '191-9874120-1-12',
    cci: '00219100987412011258',
    moneda: 'USD',
    cuentaContablePcge: '104102',
    tipoCuenta: 'CORRIENTE',
    saldoContable: 12500.0,
  },
  {
    id: 'cb-3',
    codigoBanco: '18',
    nombreBanco: 'BANCO DE LA NACIÓN (SPOT DETRACCIONES)',
    numeroCuenta: '00-068-145289',
    cci: '01806800006814528931',
    moneda: 'PEN',
    cuentaContablePcge: '107101',
    tipoCuenta: 'DETRACCIONES_BN',
    saldoContable: 6420.0,
  },
];

export const CuentasBancariasView: React.FC = () => {
  const [cuentas] = useState<CuentaBancariaEmpresa[]>(CUENTAS_INICIALES);

  const columnas: ColumnaTablaDensa<CuentaBancariaEmpresa>[] = [
    { key: 'codigoBanco', header: 'Cód. T03', width: '65px', align: 'center', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.codigoBanco}</span> },
    { key: 'nombreBanco', header: 'Entidad Financiera', render: (r) => <span className="font-bold text-[#111827]">{r.nombreBanco}</span> },
    { key: 'numeroCuenta', header: 'N° de Cuenta', width: '145px', render: (r) => <span className="font-mono">{r.numeroCuenta}</span> },
    { key: 'cci', header: 'Código Cuenta Interbancario (CCI)', width: '175px', render: (r) => <span className="font-mono text-[11px]">{r.cci}</span> },
    { key: 'moneda', header: 'Moneda', width: '65px', align: 'center', render: (r) => <span className="font-mono font-bold">{r.moneda}</span> },
    { key: 'cuentaContablePcge', header: 'Subcuenta PCGE', width: '105px', align: 'center', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.cuentaContablePcge}</span> },
    { key: 'tipoCuenta', header: 'Modalidad', width: '125px', render: (r) => <span className="text-[11px]">{r.tipoCuenta}</span> },
    { key: 'saldoContable', header: 'Saldo Contable', width: '120px', align: 'right', render: (r) => <span className="font-bold">{r.saldoContable.toFixed(2)}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Cuentas Bancarias Operativas y de Detracciones de la Empresa"
        subtitulo="Vinculación de cuentas corrientes y CCI con subcuentas divisionarias 1041 / 1071 para Libro Caja y Bancos 1.2"
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={cuentas}
          rowKey={(r) => r.id}
        />
      </div>
    </div>
  );
};
