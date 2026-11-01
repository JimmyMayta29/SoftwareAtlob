import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';

interface ArchivoPlameExport {
  extension: string;
  estructura: string;
  descripcionAnexo3: string;
  nomenclatura: string;
  contenidoMuestra: string;
}

export const ExportarPlameView: React.FC = () => {
  const { state, notify } = useAppContext();
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-03');
  const ruc = state.activeEmpresaRuc || '20601234567';
  const per = periodo.replace('-', '');

  const archivos: ArchivoPlameExport[] = [
    {
      extension: '.rem',
      estructura: 'Estructura 18 — Remuneraciones e Ingresos, Descuentos y Aportes',
      descripcionAnexo3: 'Conceptos remunerativos (0121 Básico, 0201 Asig. Fam., 0601/0606/0608 AFP, 0607 ONP, 0605 Renta 5ta, 0804 EsSalud)',
      nomenclatura: `0601${per}${ruc}.rem`,
      contenidoMuestra: `01|44556677|0121|4500.00|4500.00|\r\n01|44556677|0201|102.50|102.50|\r\n01|44556677|0804|414.23|414.23|\r\n`,
    },
    {
      extension: '.jor',
      estructura: 'Estructura 14 — Datos de la Jornada Laboral por Trabajador',
      descripcionAnexo3: 'Horas ordinarias trabajadas, minutos ordinarios y horas de sobretiempo del período mensual',
      nomenclatura: `0601${per}${ruc}.jor`,
      contenidoMuestra: `01|44556677|240|0|0|0|\r\n01|71829304|240|0|0|0|\r\n`,
    },
    {
      extension: '.snl',
      estructura: 'Estructura 15 — Subsidios y Otros Días No Laborados y No Subsidiados',
      descripcionAnexo3: 'Tipo de suspensión de relación laboral (Tabla 21: S.I. subsidios, S.P. licencias sin goce, faltas)',
      nomenclatura: `0601${per}${ruc}.snl`,
      contenidoMuestra: ``,
    },
    {
      extension: '.ps4',
      estructura: 'Estructura 07 — Prestadores de Servicios de Cuarta Categoría (Datos)',
      descripcionAnexo3: 'Identificación de emisores de Recibos por Honorarios del período (Tipo Doc, N° Doc, Apellidos y Nombres, Domiciliado)',
      nomenclatura: `0601${per}${ruc}.ps4`,
      contenidoMuestra: `06|10415263741|GOMEZ|PEREZ|JUAN CARLOS|1|0|\r\n`,
    },
    {
      extension: '.4ta',
      estructura: 'Estructura 19 — Comprobantes de Prestadores de Cuarta Categoría',
      descripcionAnexo3: 'Serie, número, fecha de emisión, fecha de pago, monto bruto y retención 8% de Recibos por Honorarios',
      nomenclatura: `0601${per}${ruc}.4ta`,
      contenidoMuestra: `06|10415263741|R|E001|0000125|2500.00|10/03/2026|12/03/2026|1||\r\n`,
    },
  ];

  const descargarPlame = (item: ArchivoPlameExport) => {
    const blob = new Blob([item.contenidoMuestra], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.nomenclatura;
    a.click();
    URL.revokeObjectURL(url);
    notify(`Archivo PDT PLAME ${item.nomenclatura} descargado`, 'success');
  };

  const columnas: ColumnaTablaDensa<ArchivoPlameExport>[] = [
    { key: 'extension', header: 'Extensión', width: '75px', align: 'center', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.extension}</span> },
    { key: 'estructura', header: 'Estructura Oficial Anexo 3 PLAME', width: '320px', render: (r) => <span className="font-bold text-[#111827]">{r.estructura}</span> },
    { key: 'descripcionAnexo3', header: 'Detalle de Campos Pipe (|)', render: (r) => r.descripcionAnexo3 },
    { key: 'nomenclatura', header: 'Archivo a Importar en PDT 601', width: '215px', render: (r) => <span className="font-mono text-[#1E6F42] font-bold">{r.nomenclatura}</span> },
    {
      key: 'accion',
      header: 'Exportar',
      width: '115px',
      align: 'center',
      render: (r) => (
        <button
          type="button"
          onClick={() => descargarPlame(r)}
          className="h-5 px-2 bg-[#1E3A5F] text-[#FFFFFF] text-[11px] inline-flex items-center gap-1 hover:bg-[#162C49]"
        >
          <Download className="w-3 h-3" strokeWidth={1.5} />
          Descargar
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Exportación de Archivos Planos para PDT PLAME — Formulario Virtual 0601"
        subtitulo="Generación de estructuras .rem, .jor, .snl, .ps4 y .4ta conforme al Anexo 3 de la R.S. N° 183-2011/SUNAT"
        derecha={<SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={archivos}
          rowKey={(r) => r.extension}
        />
      </div>
    </div>
  );
};
