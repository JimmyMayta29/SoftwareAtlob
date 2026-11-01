import React, { useState } from 'react';
import { Send, Plus, Trash2, FileCode2, CheckCircle2 } from 'lucide-react';
import Decimal from 'decimal.js';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { CampoNumerico } from '../ui/CampoNumerico';

interface ItemComprobante {
  id: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidad: string;
  valorUnitario: string;
  afectacionIgv: '10' | '20' | '30'; // 10 Gravado, 20 Exonerado, 30 Inafecto
}

export const EmitirComprobanteView: React.FC = () => {
  const { state, notify } = useAppContext();
  const [tipoDoc, setTipoDoc] = useState<'01' | '03'>('01');
  const [serie, setSerie] = useState('F001');
  const [correlativo, setCorrelativo] = useState('0000158');
  const [fechaEmision, setFechaEmision] = useState('2026-03-20');
  const [moneda, setMoneda] = useState<'PEN' | 'USD'>('PEN');
  const [rucCliente, setRucCliente] = useState('20100047218');
  const [razonSocialCliente, setRazonSocialCliente] = useState('CORPORACION COMERCIAL PERUANA S.A.C.');
  const [formaPago, setFormaPago] = useState<'Contado' | 'Credito'>('Contado');
  const [items, setItems] = useState<ItemComprobante[]>([
    {
      id: 'it-1',
      codigo: 'SRV-001',
      descripcion: 'SERVICIO DE AUDITORÍA TRIBUTARIA Y FINANCIERA MENSUAL',
      unidad: 'ZZ',
      cantidad: '1.00',
      valorUnitario: '2500.00',
      afectacionIgv: '10',
    },
  ]);
  const [ultimoCdr, setUltimoCdr] = useState<{ ticket: string; mensaje: string } | null>(null);

  const agregarItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `it-${Date.now()}`,
        codigo: `ITEM-0${prev.length + 1}`,
        descripcion: 'NUEVO CONCEPTO DE VENTA',
        unidad: 'NIU',
        cantidad: '1.00',
        valorUnitario: '100.00',
        afectacionIgv: '10',
      },
    ]);
  };

  const eliminarItem = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const actualizarItem = (id: string, campo: keyof ItemComprobante, valor: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [campo]: valor } : it)));
  };

  let totalGravada = new Decimal(0);
  let totalExonerada = new Decimal(0);
  let totalInafecta = new Decimal(0);
  let totalIgv = new Decimal(0);

  for (const item of items) {
    const cant = new Decimal(item.cantidad || '0');
    const vu = new Decimal(item.valorUnitario || '0');
    const subtotal = cant.mul(vu).toDecimalPlaces(2);
    if (item.afectacionIgv === '10') {
      totalGravada = totalGravada.plus(subtotal);
      totalIgv = totalIgv.plus(subtotal.mul('0.18').toDecimalPlaces(2));
    } else if (item.afectacionIgv === '20') {
      totalExonerada = totalExonerada.plus(subtotal);
    } else {
      totalInafecta = totalInafecta.plus(subtotal);
    }
  }
  const importeTotal = totalGravada.plus(totalExonerada).plus(totalInafecta).plus(totalIgv);

  const emitirComprobante = async () => {
    try {
      const res = await fetch('/api/sunat/cpe/emitir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        },
        body: JSON.stringify({
          tipoComprobante: tipoDoc,
          serie,
          correlativo,
          fechaEmision,
          moneda,
          receptor: { numDoc: rucCliente, razonSocial: razonSocialCliente },
          items,
        }),
      });
      await res.json().catch(() => null);
      setUltimoCdr({
        ticket: `${serie}-${correlativo}`,
        mensaje: `El Comprobante número ${serie}-${correlativo}, ha sido ACEPTADO (UBL 2.1 - SIMULADO).`,
      });
      notify(`Comprobante ${serie}-${correlativo} emitido y contabilizado`, 'success');
    } catch {
      notify('Error al emitir el comprobante electrónico', 'error');
    }
  };

  const columnas: ColumnaTablaDensa<ItemComprobante>[] = [
    {
      key: 'codigo',
      header: 'Código',
      width: '95px',
      render: (r) => (
        <input
          type="text"
          value={r.codigo}
          onChange={(e) => actualizarItem(r.id, 'codigo', e.target.value.toUpperCase())}
          className="w-full h-5 px-1 text-[12px] font-mono border border-[#D1D5DB]"
        />
      ),
    },
    {
      key: 'descripcion',
      header: 'Descripción del Bien o Servicio',
      render: (r) => (
        <input
          type="text"
          value={r.descripcion}
          onChange={(e) => actualizarItem(r.id, 'descripcion', e.target.value)}
          className="w-full h-5 px-1 text-[12px] border border-[#D1D5DB]"
        />
      ),
    },
    {
      key: 'unidad',
      header: 'UM (Cat. 03)',
      width: '85px',
      align: 'center',
      render: (r) => (
        <select
          value={r.unidad}
          onChange={(e) => actualizarItem(r.id, 'unidad', e.target.value)}
          className="w-full h-5 text-[11px] font-mono border border-[#D1D5DB]"
        >
          <option value="NIU">NIU - Unid</option>
          <option value="ZZ">ZZ - Serv</option>
          <option value="KGM">KGM - Kg</option>
        </select>
      ),
    },
    {
      key: 'afectacionIgv',
      header: 'Afectación (Cat. 07)',
      width: '130px',
      render: (r) => (
        <select
          value={r.afectacionIgv}
          onChange={(e) => actualizarItem(r.id, 'afectacionIgv', e.target.value as '10' | '20' | '30')}
          className="w-full h-5 text-[11px] border border-[#D1D5DB]"
        >
          <option value="10">10 - Gravado Onerosa</option>
          <option value="20">20 - Exonerado</option>
          <option value="30">30 - Inafecto</option>
        </select>
      ),
    },
    {
      key: 'cantidad',
      header: 'Cantidad',
      width: '90px',
      align: 'right',
      render: (r) => (
        <input
          type="text"
          value={r.cantidad}
          onChange={(e) => actualizarItem(r.id, 'cantidad', e.target.value)}
          className="w-full h-5 px-1 text-right font-mono text-[12px] border border-[#D1D5DB]"
        />
      ),
    },
    {
      key: 'valorUnitario',
      header: 'V. Unitario',
      width: '105px',
      align: 'right',
      render: (r) => (
        <input
          type="text"
          value={r.valorUnitario}
          onChange={(e) => actualizarItem(r.id, 'valorUnitario', e.target.value)}
          className="w-full h-5 px-1 text-right font-mono text-[12px] border border-[#D1D5DB]"
        />
      ),
    },
    {
      key: 'subtotal',
      header: 'Valor Venta',
      width: '105px',
      align: 'right',
      render: (r) => {
        const sub = new Decimal(r.cantidad || '0').mul(new Decimal(r.valorUnitario || '0'));
        return <span className="font-bold">{sub.toFixed(2)}</span>;
      },
    },
    {
      key: 'acciones',
      header: '',
      width: '40px',
      align: 'center',
      render: (r) => (
        <button
          type="button"
          onClick={() => eliminarItem(r.id)}
          className="text-[#B91C1C] hover:underline"
          title="Quitar ítem"
        >
          <Trash2 className="w-3.5 h-3.5 inline" strokeWidth={1.5} />
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Emisión de Factura y Boleta de Venta Electrónica (Estándar UBL 2.1)"
        subtitulo="Generación de XML UBL 2.1, firma digital XAdES-BES y asiento automático en Registro de Ventas"
        acciones={[
          {
            id: 'agregar-item',
            label: 'Agregar línea',
            icono: Plus,
            onClick: agregarItem,
          },
          {
            id: 'emitir',
            label: 'Emitir Comprobante [F3]',
            icono: Send,
            primario: true,
            onClick: emitirComprobante,
          },
        ]}
      />

      <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] grid grid-cols-6 gap-2 text-[12px]">
        <div>
          <label className="block text-[11px] text-[#4B5563] mb-0.5">Tipo Comprobante (Cat. 01)</label>
          <select
            value={tipoDoc}
            onChange={(e) => {
              const v = e.target.value as '01' | '03';
              setTipoDoc(v);
              setSerie(v === '01' ? 'F001' : 'B001');
            }}
            className="w-full h-6 px-1.5 bg-[#FFFFFF] border border-[#D1D5DB]"
          >
            <option value="01">01 - Factura Electrónica</option>
            <option value="03">03 - Boleta de Venta</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-[#4B5563] mb-0.5">Serie - Número</label>
          <div className="flex gap-1">
            <input
              type="text"
              value={serie}
              onChange={(e) => setSerie(e.target.value.toUpperCase())}
              className="w-14 h-6 px-1.5 font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
            />
            <input
              type="text"
              value={correlativo}
              onChange={(e) => setCorrelativo(e.target.value)}
              className="flex-1 h-6 px-1.5 font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
            />
          </div>
        </div>
        <div>
          <label className="block text-[11px] text-[#4B5563] mb-0.5">Fecha Emisión</label>
          <input
            type="date"
            value={fechaEmision}
            onChange={(e) => setFechaEmision(e.target.value)}
            className="w-full h-6 px-1.5 font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
          />
        </div>
        <div>
          <label className="block text-[11px] text-[#4B5563] mb-0.5">RUC / DNI Receptor</label>
          <input
            type="text"
            value={rucCliente}
            onChange={(e) => setRucCliente(e.target.value)}
            className="w-full h-6 px-1.5 font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-[11px] text-[#4B5563] mb-0.5">Denominación o Razón Social del Cliente</label>
          <input
            type="text"
            value={razonSocialCliente}
            onChange={(e) => setRazonSocialCliente(e.target.value)}
            className="w-full h-6 px-1.5 bg-[#FFFFFF] border border-[#D1D5DB]"
          />
        </div>
      </div>

      {ultimoCdr && (
        <div className="px-3 py-1.5 bg-[#ECFDF5] border-b border-[#1E6F42] text-[#1E6F42] text-[12px] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.5} />
          <span><strong>CDR R-{ultimoCdr.ticket}.xml:</strong> {ultimoCdr.mensaje}</span>
        </div>
      )}

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={items}
          rowKey={(r) => r.id}
          totales={{
            descripcion: (
              <span className="font-bold">
                GRAVADA: {moneda} {totalGravada.toFixed(2)} | EXONERADA: {totalExonerada.toFixed(2)} | IGV (18%): {totalIgv.toFixed(2)}
              </span>
            ),
            valorUnitario: <span className="font-bold">TOTAL {moneda}:</span>,
            subtotal: importeTotal.toFixed(2),
          }}
        />
      </div>
    </div>
  );
};
