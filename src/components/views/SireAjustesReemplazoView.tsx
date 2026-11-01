import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';

interface PaqueteSire {
  id: string;
  anexo: string;
  registro: 'RCE 080400' | 'RVIE 140400';
  operacion: string;
  nomenclaturaTxt: string;
  camposPipe: number;
}

export const SireAjustesReemplazoView: React.FC = () => {
  const { state, notify } = useAppContext();
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-03');
  const ruc = state.activeEmpresaRuc || '20601234567';
  const per = periodo.replace('-', '');

  const paquetes: PaqueteSire[] = [
    {
      id: 'sire-1',
      anexo: 'Anexo 3',
      registro: 'RVIE 140400',
      operacion: 'Reemplazo de Propuesta del RVIE',
      nomenclaturaTxt: `LE${ruc}${per}00140400021112.txt`,
      camposPipe: 40,
    },
    {
      id: 'sire-2',
      anexo: 'Anexo 4',
      registro: 'RVIE 140400',
      operacion: 'Ajustes Posteriores del RVIE',
      nomenclaturaTxt: `LE${ruc}${per}00140400031112.txt`,
      camposPipe: 41,
    },
    {
      id: 'sire-3',
      anexo: 'Anexo 11',
      registro: 'RCE 080400',
      operacion: 'Reemplazo de Propuesta del RCE',
      nomenclaturaTxt: `LE${ruc}${per}00080400021112.txt`,
      camposPipe: 44,
    },
    {
      id: 'sire-4',
      anexo: 'Anexo 12',
      registro: 'RCE 080400',
      operacion: 'Ajustes Posteriores del RCE',
      nomenclaturaTxt: `LE${ruc}${per}00080400031112.txt`,
      camposPipe: 45,
    },
  ];

  const descargarArchivoSire = (paq: PaqueteSire) => {
    const campos = Array.from({ length: paq.camposPipe }, (_, i) => (i === 0 ? ruc : i === 2 ? per : '')).join('|') + '|';
    const blob = new Blob([campos + '\r\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = paq.nomenclaturaTxt;
    a.click();
    URL.revokeObjectURL(url);
    notify(`Archivo ${paq.nomenclaturaTxt} (${paq.anexo}) generado`, 'success');
  };

  const columnas: ColumnaTablaDensa<PaqueteSire>[] = [
    { key: 'anexo', header: 'Anexo R.S. 112-2021', width: '125px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.anexo}</span> },
    { key: 'registro', header: 'Registro SIRE', width: '105px', render: (r) => <span className="font-mono font-bold">{r.registro}</span> },
    { key: 'operacion', header: 'Tipo de Envío / Operación', render: (r) => <span className="font-bold text-[#111827]">{r.operacion}</span> },
    { key: 'nomenclaturaTxt', header: 'Nombre de Archivo Oficial', width: '285px', render: (r) => <span className="font-mono text-[11px] text-[#1E6F42] font-bold">{r.nomenclaturaTxt}</span> },
    { key: 'camposPipe', header: 'N° Columnas', width: '95px', align: 'right', render: (r) => r.camposPipe },
    {
      key: 'accion',
      header: 'Generar',
      width: '120px',
      align: 'center',
      render: (r) => (
        <button
          type="button"
          onClick={() => descargarArchivoSire(r)}
          className="h-5 px-2 bg-[#1E3A5F] text-[#FFFFFF] text-[11px] inline-flex items-center gap-1 hover:bg-[#162C49]"
        >
          <Download className="w-3 h-3" strokeWidth={1.5} />
          Exportar .TXT
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="SIRE — Generación de Archivos de Reemplazo de Propuesta y Ajustes Posteriores"
        subtitulo="R.S. N° 000112-2021/SUNAT y R.S. N° 000040-2022/SUNAT (Anexos 3, 4, 11 y 12)"
        derecha={<SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={paquetes}
          rowKey={(r) => r.id}
        />
      </div>
    </div>
  );
};
