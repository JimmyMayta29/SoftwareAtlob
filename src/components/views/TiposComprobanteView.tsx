import React from 'react';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa } from '../ui/TablaDensa';

interface TipoComprobanteSunat {
  codigo: string;
  descripcion: string;
  prefijoSerie: string;
  afectaCompras: boolean;
  afectaVentas: boolean;
  sustentaCostoGasto: boolean;
}

const TABLA_10_COMPROBANTES: TipoComprobanteSunat[] = [
  { codigo: '01', descripcion: 'Factura Electrónica / Física', prefijoSerie: 'F / E001', afectaCompras: true, afectaVentas: true, sustentaCostoGasto: true },
  { codigo: '02', descripcion: 'Recibo por Honorarios Electrónico', prefijoSerie: 'E001', afectaCompras: false, afectaVentas: false, sustentaCostoGasto: true },
  { codigo: '03', descripcion: 'Boleta de Venta', prefijoSerie: 'B / EB01', afectaCompras: true, afectaVentas: true, sustentaCostoGasto: true },
  { codigo: '04', descripcion: 'Liquidación de Compra', prefijoSerie: 'E001', afectaCompras: true, afectaVentas: false, sustentaCostoGasto: true },
  { codigo: '07', descripcion: 'Nota de Crédito', prefijoSerie: 'FC / BC', afectaCompras: true, afectaVentas: true, sustentaCostoGasto: true },
  { codigo: '08', descripcion: 'Nota de Débito', prefijoSerie: 'FD / BD', afectaCompras: true, afectaVentas: true, sustentaCostoGasto: true },
  { codigo: '09', descripcion: 'Guía de Remisión - Remitente', prefijoSerie: 'T001', afectaCompras: false, afectaVentas: false, sustentaCostoGasto: false },
  { codigo: '12', descripcion: 'Ticket o Cinta emitido por Máquina Registradora', prefijoSerie: 'TICK', afectaCompras: true, afectaVentas: true, sustentaCostoGasto: true },
  { codigo: '14', descripcion: 'Recibo por Servicios Públicos (Luz, Agua, Telecomunicaciones)', prefijoSerie: 'S/N', afectaCompras: true, afectaVentas: false, sustentaCostoGasto: true },
  { codigo: '50', descripcion: 'Declaración Aduanera de Mercancías (DAM - Importación)', prefijoSerie: '118 / 235', afectaCompras: true, afectaVentas: false, sustentaCostoGasto: true },
  { codigo: '91', descripcion: 'Comprobante de No Domiciliado (Invoice Exterior)', prefijoSerie: 'INV', afectaCompras: true, afectaVentas: false, sustentaCostoGasto: true }
];

export const TiposComprobanteView: React.FC = () => {
  return (
    <div className="space-y-2">
      <BarraHerramientasLocal
        tituloModulo="Tabla 10 SUNAT — Tipos de Comprobante de Pago o Documento"
        subtitulo="Catálogo oficial de documentos autorizados por el Reglamento de Comprobantes de Pago (R.S. N° 007-99/SUNAT)"
      />

      <TablaDensa
        datos={TABLA_10_COMPROBANTES}
        rowKey={(t) => t.codigo}
        columnas={[
          {
            key: 'codigo',
            header: 'Código SUNAT',
            width: '110px',
            align: 'center',
            render: (t) => <span className="font-mono font-bold text-[#1D4ED8]">{t.codigo}</span>
          },
          { key: 'descripcion', header: 'Denominación Oficial del Comprobante' },
          {
            key: 'prefijoSerie',
            header: 'Serie Estándar',
            width: '130px',
            align: 'center',
            render: (t) => <span className="font-mono">{t.prefijoSerie}</span>
          },
          {
            key: 'afectaCompras',
            header: 'RCE Compras (8.1/8.4)',
            width: '145px',
            align: 'center',
            render: (t) => (
              <span className={t.afectaCompras ? 'text-[#16A34A] font-bold' : 'text-[#94A3B8]'}>
                {t.afectaCompras ? 'SÍ' : 'NO'}
              </span>
            )
          },
          {
            key: 'afectaVentas',
            header: 'RVIE Ventas (14.1/14.4)',
            width: '150px',
            align: 'center',
            render: (t) => (
              <span className={t.afectaVentas ? 'text-[#16A34A] font-bold' : 'text-[#94A3B8]'}>
                {t.afectaVentas ? 'SÍ' : 'NO'}
              </span>
            )
          },
          {
            key: 'sustentaCostoGasto',
            header: 'Sustenta Costo/Gasto LIR',
            width: '160px',
            align: 'center',
            render: (t) => (
              <span className={t.sustentaCostoGasto ? 'text-[#1D4ED8] font-bold' : 'text-[#94A3B8]'}>
                {t.sustentaCostoGasto ? 'HABILITADO' : 'SOLO TRASLADO'}
              </span>
            )
          }
        ]}
      />
    </div>
  );
};
