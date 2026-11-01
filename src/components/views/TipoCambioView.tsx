import React, { useState } from 'react';
import { TIPOS_CAMBIO_SBS_DEMO } from '../../data/maestros';
import { TipoCambioSbs } from '../../types';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';
import { CampoNumerico } from '../ui/CampoNumerico';
import { useToast } from '../../context/ToastContext';

export const TipoCambioView: React.FC = () => {
  const { success } = useToast();
  const [tiposCambio, setTiposCambio] = useState<TipoCambioSbs[]>(TIPOS_CAMBIO_SBS_DEMO);
  const [modalOpen, setModalOpen] = useState(false);

  const [fecha, setFecha] = useState('2026-09-26');
  const [compra, setCompra] = useState(3.748);
  const [venta, setVenta] = useState(3.758);

  const handleGuardar = (e: React.FormEvent) => {
    e.preventDefault();
    const nuevo: TipoCambioSbs = {
      fecha,
      compra,
      venta,
      fuente: 'SBS'
    };
    setTiposCambio([nuevo, ...tiposCambio.filter((t) => t.fecha !== fecha)]);
    setModalOpen(false);
    success(`Tipo de cambio del ${fecha} registrado (Compra: ${compra.toFixed(3)} / Venta: ${venta.toFixed(3)}).`, 'Tipo de Cambio SBS');
  };

  return (
    <div className="space-y-2">
      <BarraHerramientasLocal
        tituloModulo="Tipo de Cambio Diario SBS / SUNAT (USD - PEN)"
        subtitulo="Tipo de cambio promedio ponderado publicado por la Superintendencia de Banca, Seguros y AFP"
        onNuevo={() => setModalOpen(true)}
        labelNuevo="Registrar TC del Día"
        onRefrescar={() =>
          success('Tipos de cambio sincronizados con el catálogo SBS del período.', 'SBS Actualizado')
        }
      />

      <TablaDensa
        datos={tiposCambio}
        rowKey={(tc) => tc.fecha}
        columnas={[
          {
            key: 'fecha',
            header: 'Fecha Publicación',
            width: '140px',
            render: (tc) => <span className="font-mono font-bold">{tc.fecha}</span>
          },
          {
            key: 'compra',
            header: 'TC Compra (Activo)',
            width: '150px',
            align: 'right',
            numeric: true,
            render: (tc) => <span className="font-mono font-bold text-[#1D4ED8]">{tc.compra.toFixed(3)}</span>
          },
          {
            key: 'venta',
            header: 'TC Venta (Pasivo / IGV)',
            width: '150px',
            align: 'right',
            numeric: true,
            render: (tc) => <span className="font-mono font-bold text-[#16A34A]">{tc.venta.toFixed(3)}</span>
          },
          {
            key: 'fuente',
            header: 'Fuente Normativa',
            render: (tc) => <span>{tc.fuente} — Publicación Oficial</span>
          }
        ]}
      />

      <VentanaModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        titulo="Registrar Tipo de Cambio SBS"
        ancho="sm"
      >
        <form onSubmit={handleGuardar} className="space-y-3">
          <div>
            <label className="block text-[11px] text-[#475569] mb-0.5">Fecha</label>
            <input
              type="date"
              required
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full px-2 py-1 border border-[#CBD5E1] font-mono text-[12px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <CampoNumerico
              label="TC Compra (3 decimales)"
              valor={compra}
              decimales={3}
              monedaPrefijo="S/"
              onChange={(v) => setCompra(v)}
            />
            <CampoNumerico
              label="TC Venta (3 decimales)"
              valor={venta}
              decimales={3}
              monedaPrefijo="S/"
              onChange={(v) => setVenta(v)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[#CBD5E1]">
            <button type="button" onClick={() => setModalOpen(false)} className="px-3 py-1 border border-[#CBD5E1]">
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 bg-[#1D4ED8] text-white font-bold">
              Guardar TC
            </button>
          </div>
        </form>
      </VentanaModal>
    </div>
  );
};
