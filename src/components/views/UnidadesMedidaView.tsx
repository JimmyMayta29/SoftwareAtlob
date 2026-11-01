import React from 'react';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa } from '../ui/TablaDensa';

interface UnidadMedidaSunat {
  codigoTabla06: string;
  codigoUnece: string;
  descripcion: string;
  usoPrincipal: string;
}

const TABLA_06_UNIDADES: UnidadMedidaSunat[] = [
  { codigoTabla06: '07', codigoUnece: 'NIU', descripcion: 'Unidades (Bienes individuales)', usoPrincipal: 'Mercaderías / Activos' },
  { codigoTabla06: '99', codigoUnece: 'ZZ', descripcion: 'Servicio (Unidad intangible)', usoPrincipal: 'Facturación de servicios' },
  { codigoTabla06: '01', codigoUnece: 'KGM', descripcion: 'Kilogramos', usoPrincipal: 'Insumos / Materias primas' },
  { codigoTabla06: '02', codigoUnece: 'LBR', descripcion: 'Libras', usoPrincipal: 'Comercio exterior' },
  { codigoTabla06: '06', codigoUnece: 'LTR', descripcion: 'Litros', usoPrincipal: 'Combustibles y líquidos' },
  { codigoTabla06: '08', codigoUnece: 'MTR', descripcion: 'Metros lineales', usoPrincipal: 'Textiles y construcción' },
  { codigoTabla06: '09', codigoUnece: 'MTK', descripcion: 'Metros cuadrados', usoPrincipal: 'Inmuebles y acabados' },
  { codigoTabla06: '12', codigoUnece: 'BX', descripcion: 'Cajas', usoPrincipal: 'Distribución mayorista' },
  { codigoTabla06: '14', codigoUnece: 'GLL', descripcion: 'Galones', usoPrincipal: 'Lubricantes y combustibles' }
];

export const UnidadesMedidaView: React.FC = () => {
  return (
    <div className="space-y-2">
      <BarraHerramientasLocal
        tituloModulo="Tabla 06 SUNAT / UNECE Rec 20 — Unidades de Medida"
        subtitulo="Códigos normativos para Comprobantes Electrónicos UBL 2.1 y Libro de Inventarios (PLE 13.1)"
      />

      <TablaDensa
        datos={TABLA_06_UNIDADES}
        rowKey={(u) => u.codigoTabla06}
        columnas={[
          {
            key: 'codigoTabla06',
            header: 'Cód. Tabla 06 (PLE)',
            width: '130px',
            align: 'center',
            render: (u) => <span className="font-mono font-bold text-[#1D4ED8]">{u.codigoTabla06}</span>
          },
          {
            key: 'codigoUnece',
            header: 'Cód. UNECE (UBL 2.1)',
            width: '150px',
            align: 'center',
            render: (u) => <span className="font-mono font-bold">{u.codigoUnece}</span>
          },
          { key: 'descripcion', header: 'Descripción Oficial de la Unidad' },
          { key: 'usoPrincipal', header: 'Aplicación Contable / Tributaria', width: '220px' }
        ]}
      />
    </div>
  );
};
