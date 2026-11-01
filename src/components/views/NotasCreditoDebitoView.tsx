import React, { useState } from 'react';
import { Send, CheckCircle2 } from 'lucide-react';
import Decimal from 'decimal.js';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { CampoNumerico } from '../ui/CampoNumerico';

interface NotaEmitida {
  id: string;
  fecha: string;
  tipoNota: '07' | '08';
  serieNumero: string;
  docModificado: string;
  codigoMotivo: string;
  glosaMotivo: string;
  baseImponible: number;
  igv: number;
  total: number;
  estadoCdr: 'ACEPTADO';
}

const NOTAS_INICIALES: NotaEmitida[] = [
  {
    id: 'nc-1',
    fecha: '2026-03-15',
    tipoNota: '07',
    serieNumero: 'FC01-000018',
    docModificado: 'F001-0001420',
    codigoMotivo: '01 - Anulación de la operación',
    glosaMotivo: 'Anulación total de operación por servicio no ejecutado',
    baseImponible: 1500.0,
    igv: 270.0,
    total: 1770.0,
    estadoCdr: 'ACEPTADO',
  },
  {
    id: 'nd-1',
    fecha: '2026-03-19',
    tipoNota: '08',
    serieNumero: 'FD01-000004',
    docModificado: 'F001-0001502',
    codigoMotivo: '01 - Intereses por mora',
    glosaMotivo: 'Cargo de intereses moratorios pactados contractualmente',
    baseImponible: 300.0,
    igv: 54.0,
    total: 354.0,
    estadoCdr: 'ACEPTADO',
  },
];

export const NotasCreditoDebitoView: React.FC = () => {
  const { notify } = useAppContext();
  const [notas, setNotas] = useState<NotaEmitida[]>(NOTAS_INICIALES);
  const [tipoNota, setTipoNota] = useState<'07' | '08'>('07');
  const [serieNumero, setSerieNumero] = useState('FC01-000019');
  const [docModificado, setDocModificado] = useState('F001-0001510');
  const [codigoMotivo, setCodigoMotivo] = useState('01 - Anulación de la operación');
  const [glosaMotivo, setGlosaMotivo] = useState('Descuento global posterior a la emisión');
  const [baseImponible, setBaseImponible] = useState('500.00');

  const registrarNota = () => {
    const base = new Decimal(baseImponible || '0').toDecimalPlaces(2);
    const igv = base.mul('0.18').toDecimalPlaces(2);
    const total = base.plus(igv);
    const nueva: NotaEmitida = {
      id: `n-${Date.now()}`,
      fecha: '2026-03-20',
      tipoNota,
      serieNumero,
      docModificado,
      codigoMotivo,
      glosaMotivo,
      baseImponible: base.toNumber(),
      igv: igv.toNumber(),
      total: total.toNumber(),
      estadoCdr: 'ACEPTADO',
    };
    setNotas((prev) => [nueva, ...prev]);
    notify(`${tipoNota === '07' ? 'Nota de Crédito' : 'Nota de Débito'} ${serieNumero} emitida con referencia a ${docModificado}`, 'success');
  };

  const columnas: ColumnaTablaDensa<NotaEmitida>[] = [
    { key: 'fecha', header: 'Fecha', width: '90px', render: (r) => <span className="font-mono">{r.fecha}</span> },
    {
      key: 'tipoNota',
      header: 'Tipo (Cat. 01)',
      width: '115px',
      render: (r) => (
        <span className="font-mono font-bold text-[#1E3A5F]">
          {r.tipoNota === '07' ? '07 Nota Crédito' : '08 Nota Débito'}
        </span>
      ),
    },
    { key: 'serieNumero', header: 'Serie-Número', width: '110px', render: (r) => <span className="font-mono font-bold">{r.serieNumero}</span> },
    { key: 'docModificado', header: 'Doc. Modificado', width: '115px', render: (r) => <span className="font-mono">{r.docModificado}</span> },
    { key: 'codigoMotivo', header: 'Catálogo 09 / 10 SUNAT', width: '190px', render: (r) => <span className="text-[11px]">{r.codigoMotivo}</span> },
    { key: 'glosaMotivo', header: 'Sustento o Motivo', render: (r) => r.glosaMotivo },
    { key: 'baseImponible', header: 'Base S/', width: '95px', align: 'right', render: (r) => r.baseImponible.toFixed(2) },
    { key: 'igv', header: 'IGV S/', width: '85px', align: 'right', render: (r) => r.igv.toFixed(2) },
    { key: 'total', header: 'Total S/', width: '100px', align: 'right', render: (r) => <span className="font-bold">{r.total.toFixed(2)}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Notas de Crédito (07) y Notas de Débito (08) Electrónicas"
        subtitulo="Emisión vinculada a comprobante de pago origen según Catálogos 09 y 10 de SUNAT"
        acciones={[
          {
            id: 'emitir-nota',
            label: 'Emitir Nota Electrónica',
            icono: Send,
            primario: true,
            onClick: registrarNota,
          },
        ]}
      />

      <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] grid grid-cols-6 gap-2 text-[12px]">
        <div>
          <label className="block text-[11px] text-[#4B5563] mb-0.5">Tipo de Nota</label>
          <select
            value={tipoNota}
            onChange={(e) => {
              const v = e.target.value as '07' | '08';
              setTipoNota(v);
              setSerieNumero(v === '07' ? 'FC01-000019' : 'FD01-000005');
              setCodigoMotivo(v === '07' ? '01 - Anulación de la operación' : '01 - Intereses por mora');
            }}
            className="w-full h-6 px-1.5 bg-[#FFFFFF] border border-[#D1D5DB]"
          >
            <option value="07">07 - Nota de Crédito</option>
            <option value="08">08 - Nota de Débito</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-[#4B5563] mb-0.5">Serie-Correlativo</label>
          <input
            type="text"
            value={serieNumero}
            onChange={(e) => setSerieNumero(e.target.value.toUpperCase())}
            className="w-full h-6 px-1.5 font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
          />
        </div>
        <div>
          <label className="block text-[11px] text-[#4B5563] mb-0.5">Comprobante Modificado</label>
          <input
            type="text"
            value={docModificado}
            onChange={(e) => setDocModificado(e.target.value.toUpperCase())}
            className="w-full h-6 px-1.5 font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-[11px] text-[#4B5563] mb-0.5">
            {tipoNota === '07' ? 'Motivo Nota de Crédito (Catálogo 09)' : 'Motivo Nota de Débito (Catálogo 10)'}
          </label>
          <select
            value={codigoMotivo}
            onChange={(e) => setCodigoMotivo(e.target.value)}
            className="w-full h-6 px-1.5 bg-[#FFFFFF] border border-[#D1D5DB]"
          >
            {tipoNota === '07' ? (
              <>
                <option value="01 - Anulación de la operación">01 - Anulación de la operación</option>
                <option value="02 - Anulación por error en el RUC">02 - Anulación por error en el RUC</option>
                <option value="04 - Descuento global">04 - Descuento global</option>
                <option value="06 - Devolución total">06 - Devolución total</option>
              </>
            ) : (
              <>
                <option value="01 - Intereses por mora">01 - Intereses por mora</option>
                <option value="02 - Aumento en el valor">02 - Aumento en el valor</option>
                <option value="03 - Penalidades / otros conceptos">03 - Penalidades / otros conceptos</option>
              </>
            )}
          </select>
        </div>
        <div>
          <CampoNumerico label="Base Imponible S/" value={baseImponible} onChange={setBaseImponible} />
        </div>
      </div>

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={notas}
          rowKey={(r) => r.id}
        />
      </div>
    </div>
  );
};
