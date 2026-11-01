import React from 'react';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa } from '../ui/TablaDensa';

interface EntidadFinancieraSunat {
  codigoSunat: string;
  nombre: string;
  sigla: string;
  codigoSwift: string;
  tipoEntidad: string;
}

const TABLA_03_BANCOS: EntidadFinancieraSunat[] = [
  { codigoSunat: '02', nombre: 'Banco de Crédito del Perú', sigla: 'BCP', codigoSwift: 'BCPLPEPL', tipoEntidad: 'Banca Múltiple' },
  { codigoSunat: '03', nombre: 'Banco Internacional del Perú', sigla: 'INTERBANK', codigoSwift: 'BINPPEPL', tipoEntidad: 'Banca Múltiple' },
  { codigoSunat: '09', nombre: 'Scotiabank Perú S.A.A.', sigla: 'SCOTIABANK', codigoSwift: 'BSUDPEPL', tipoEntidad: 'Banca Múltiple' },
  { codigoSunat: '11', nombre: 'BBVA Perú', sigla: 'BBVA', codigoSwift: 'BCONPEPL', tipoEntidad: 'Banca Múltiple' },
  { codigoSunat: '18', nombre: 'Banco de la Nación (Cuentas de Detracciones SPOT)', sigla: 'BN', codigoSwift: 'BANCPEPL', tipoEntidad: 'Entidad Estatal' },
  { codigoSunat: '38', nombre: 'Banco Interamericano de Finanzas', sigla: 'BANBIF', codigoSwift: 'BIFSPEPL', tipoEntidad: 'Banca Múltiple' },
  { codigoSunat: '35', nombre: 'Banco Pichincha', sigla: 'PICHINCHA', codigoSwift: 'FINAPEPL', tipoEntidad: 'Banca Múltiple' }
];

export const BancosView: React.FC = () => {
  return (
    <div className="space-y-2">
      <BarraHerramientasLocal
        tituloModulo="Tabla 03 SUNAT — Entidades Financieras y Bancarias"
        subtitulo="Catálogo oficial para Libro Caja y Bancos (PLE 1.2) y bancarización (Ley N° 28194)"
      />

      <TablaDensa
        datos={TABLA_03_BANCOS}
        rowKey={(b) => b.codigoSunat}
        columnas={[
          {
            key: 'codigoSunat',
            header: 'Cód. Tabla 03',
            width: '110px',
            align: 'center',
            render: (b) => <span className="font-mono font-bold text-[#1D4ED8]">{b.codigoSunat}</span>
          },
          {
            key: 'sigla',
            header: 'Sigla',
            width: '120px',
            render: (b) => <span className="font-bold">{b.sigla}</span>
          },
          { key: 'nombre', header: 'Razón Social de la Entidad Financiera' },
          {
            key: 'codigoSwift',
            header: 'BIC / SWIFT',
            width: '130px',
            align: 'center',
            render: (b) => <span className="font-mono">{b.codigoSwift}</span>
          },
          { key: 'tipoEntidad', header: 'Clasificación SBS', width: '160px' }
        ]}
      />
    </div>
  );
};
