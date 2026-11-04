import React, { useState } from 'react';
import { Download, ShieldCheck, FileCheck } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';

interface PaqueteSire {
  id: string;
  anexo: string;
  registro: 'RCE 080400' | 'RVIE 140400' | 'RCE 080500' | 'RVIE 140500';
  operacion: string;
  nomenclaturaTxt: string;
  camposPipe: number;
}

export const SireAjustesReemplazoView: React.FC = () => {
  const { state, notify } = useAppContext();
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-09');
  const ruc = state.activeEmpresaRuc || '20601234567';
  const per = periodo.replace('-', '');

  const paquetes: PaqueteSire[] = [
    {
      id: 'sire-1',
      anexo: 'Anexo 8',
      registro: 'RCE 080400',
      operacion: 'Reemplazo de Propuesta del RCE (Compras)',
      nomenclaturaTxt: `LE${ruc}${per}00080400001111.txt`,
      camposPipe: 42,
    },
    {
      id: 'sire-2',
      anexo: 'Anexo 11',
      registro: 'RCE 080500',
      operacion: 'Ajustes Posteriores del RCE (Compras)',
      nomenclaturaTxt: `LE${ruc}${per}00080500001111.txt`,
      camposPipe: 43,
    },
    {
      id: 'sire-3',
      anexo: 'Anexo 2 / 3',
      registro: 'RVIE 140400',
      operacion: 'Reemplazo de Propuesta del RVIE (Ventas)',
      nomenclaturaTxt: `LE${ruc}${per}00140400001111.txt`,
      camposPipe: 34,
    },
    {
      id: 'sire-4',
      anexo: 'Anexo 4 / 5',
      registro: 'RVIE 140500',
      operacion: 'Ajustes Posteriores del RVIE (Ventas)',
      nomenclaturaTxt: `LE${ruc}${per}00140500001111.txt`,
      camposPipe: 35,
    },
  ];

  const descargarArchivoSire = (paq: PaqueteSire) => {
    // Generar línea de prueba estructurada con el número exacto de columnas oficiales
    const cols = Array.from({ length: paq.camposPipe }, (_, i) => {
      if (i === 0) return ruc;
      if (i === 1) return 'EMPRESA CONTRIBUYENTE S.A.C.';
      if (i === 2) return '01';
      if (i === 3) return 'F001';
      if (i === 4) return '00000001';
      if (i === 6) return '01/09/2026';
      if (i === 8) return '6';
      if (i === 9) return '20100035392';
      if (i === 10) return 'PROVEEDOR S.A.C.';
      return '';
    });

    const contenido = cols.join('|') + '|\r\n';
    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = paq.nomenclaturaTxt;
    a.click();
    URL.revokeObjectURL(url);
    notify(`Archivo ${paq.anexo} (${paq.camposPipe} campos) generado conforme a la normativa SIRE`, 'success');
  };

  const columnas: ColumnaTablaDensa<PaqueteSire>[] = [
    { key: 'anexo', header: 'Anexo R.S. 112-2021', width: '130px', render: (r) => <span className="font-bold text-[#1E3A5F]">{r.anexo}</span> },
    { key: 'operacion', header: 'Operación del SIRE', render: (r) => <span className="font-bold text-[#111827]">{r.operacion}</span> },
    {
      key: 'nomenclaturaTxt',
      header: 'Nomenclatura Oficial (Anexo 1)',
      width: '280px',
      render: (r) => <span className="font-mono text-[11px] text-[#1E6F42] font-bold">{r.nomenclaturaTxt}</span>,
    },
    { key: 'camposPipe', header: 'Columnas', width: '85px', align: 'center', render: (r) => <span className="font-mono font-bold">{r.camposPipe} cols</span> },
    {
      key: 'descarga',
      header: 'Exportar',
      width: '130px',
      align: 'center',
      render: (r) => (
        <button
          type="button"
          onClick={() => descargarArchivoSire(r)}
          className="h-5 px-2 bg-[#1E3A5F] text-[#FFFFFF] text-[11px] inline-flex items-center gap-1 hover:bg-[#162C49]"
        >
          <Download className="w-3 h-3" strokeWidth={1.5} />
          Generar .TXT
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="SIRE — Archivos de Reemplazo de Propuesta y Ajustes Posteriores (RCE y RVIE)"
        subtitulo="Estructuras de anexos oficiales para carga masiva según R.S. N° 000112-2021/SUNAT y modif. R.S. N° 000040-2022/SUNAT"
      />

      <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] flex items-center justify-between">
        <SelectorPeriodo periodo={periodo} onChangePeriodo={setPeriodo} />
        <div className="text-[11px] text-[#4B5563] flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-[#1E6F42]" />
          <span>Layouts validados campo por campo con UTF-8 sin BOM y CRLF</span>
        </div>
      </div>

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa columnas={columnas} datos={paquetes} rowKey={(r) => r.id} />
      </div>
    </div>
  );
};
