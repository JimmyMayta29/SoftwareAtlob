import React, { useState } from 'react';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';
import { useToast } from '../../context/ToastContext';

interface CentroCostoItem {
  codigo: string;
  nombre: string;
  cuentaDestinoDebe: string;
  cuentaDestinoHaber: string;
  porcentajeDistribucion: number;
  responsable: string;
  estado: 'ACTIVO' | 'INACTIVO';
}

const CENTROS_COSTO_INICIALES: CentroCostoItem[] = [
  {
    codigo: 'CC-100',
    nombre: 'Administración General y Finanzas',
    cuentaDestinoDebe: '941100',
    cuentaDestinoHaber: '791100',
    porcentajeDistribucion: 100,
    responsable: 'Gerencia Administrativa',
    estado: 'ACTIVO'
  },
  {
    codigo: 'CC-200',
    nombre: 'Comercialización, Ventas y Distribución',
    cuentaDestinoDebe: '951100',
    cuentaDestinoHaber: '791100',
    porcentajeDistribucion: 100,
    responsable: 'Jefatura Comercial',
    estado: 'ACTIVO'
  },
  {
    codigo: 'CC-300',
    nombre: 'Operaciones y Costos de Servicios',
    cuentaDestinoDebe: '921100',
    cuentaDestinoHaber: '791100',
    porcentajeDistribucion: 100,
    responsable: 'Dirección de Operaciones',
    estado: 'ACTIVO'
  },
  {
    codigo: 'CC-400',
    nombre: 'Gastos Financieros y Bancarios',
    cuentaDestinoDebe: '971100',
    cuentaDestinoHaber: '791100',
    porcentajeDistribucion: 100,
    responsable: 'Tesorería',
    estado: 'ACTIVO'
  }
];

export const CentrosCostoView: React.FC = () => {
  const { success } = useToast();
  const [centros, setCentros] = useState<CentroCostoItem[]>(CENTROS_COSTO_INICIALES);
  const [modalOpen, setModalOpen] = useState(false);

  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [ctaDebe, setCtaDebe] = useState('941100');
  const [ctaHaber, setCtaHaber] = useState('791100');
  const [responsable, setResponsable] = useState('');

  const handleCrear = (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigo.trim() || !nombre.trim()) return;
    const nuevo: CentroCostoItem = {
      codigo: codigo.trim().toUpperCase(),
      nombre: nombre.trim(),
      cuentaDestinoDebe: ctaDebe,
      cuentaDestinoHaber: ctaHaber,
      porcentajeDistribucion: 100,
      responsable: responsable || 'Contabilidad Analítica',
      estado: 'ACTIVO'
    };
    setCentros([...centros, nuevo]);
    setModalOpen(false);
    setCodigo('');
    setNombre('');
    setResponsable('');
    success(`Centro de costo ${nuevo.codigo} vinculado a destino ${nuevo.cuentaDestinoDebe}/${nuevo.cuentaDestinoHaber}.`, 'Centro de Costo');
  };

  return (
    <div className="space-y-2">
      <BarraHerramientasLocal
        tituloModulo="Centros de Costo y Destinos Analíticos (Elemento 9)"
        subtitulo="Transferencia automática desde gastos por naturaleza (Elemento 6) hacia cuentas analíticas (92/94/95/97 vs 79)"
        onNuevo={() => setModalOpen(true)}
        labelNuevo="Nuevo Centro de Costo"
      />

      <TablaDensa
        datos={centros}
        rowKey={(c) => c.codigo}
        columnas={[
          {
            key: 'codigo',
            header: 'Código CC',
            width: '100px',
            render: (c) => <span className="font-mono font-bold text-[#1D4ED8]">{c.codigo}</span>
          },
          { key: 'nombre', header: 'Descripción del Centro de Costo' },
          {
            key: 'cuentaDestinoDebe',
            header: 'Cta. Destino Cargo (Debe)',
            width: '160px',
            align: 'center',
            render: (c) => <span className="font-mono font-bold">{c.cuentaDestinoDebe}</span>
          },
          {
            key: 'cuentaDestinoHaber',
            header: 'Cta. Transferencia (Haber)',
            width: '160px',
            align: 'center',
            render: (c) => <span className="font-mono">{c.cuentaDestinoHaber}</span>
          },
          {
            key: 'porcentajeDistribucion',
            header: '% Imputación',
            width: '100px',
            align: 'right',
            numeric: true,
            render: (c) => <span>{c.porcentajeDistribucion.toFixed(2)}%</span>
          },
          { key: 'responsable', header: 'Área Responsable', width: '180px' },
          {
            key: 'estado',
            header: 'Estado',
            width: '90px',
            align: 'center',
            render: (c) => (
              <span className="px-1.5 py-0.5 text-[11px] bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]">
                {c.estado}
              </span>
            )
          }
        ]}
      />

      <VentanaModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        titulo="Nuevo Centro de Costo Analítico"
        ancho="md"
      >
        <form onSubmit={handleCrear} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#475569] mb-0.5">Código</label>
              <input
                type="text"
                required
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="CC-500"
                className="w-full px-2 py-1 border border-[#CBD5E1] font-mono text-[12px]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#475569] mb-0.5">Área / Responsable</label>
              <input
                type="text"
                value={responsable}
                onChange={(e) => setResponsable(e.target.value)}
                placeholder="Logística / Planta"
                className="w-full px-2 py-1 border border-[#CBD5E1] text-[12px]"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-[#475569] mb-0.5">Nombre del Centro de Costo</label>
            <input
              type="text"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Sucursal Arequipa - Operaciones"
              className="w-full px-2 py-1 border border-[#CBD5E1] text-[12px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#475569] mb-0.5">Cuenta Destino Debe (El. 9)</label>
              <input
                type="text"
                required
                value={ctaDebe}
                onChange={(e) => setCtaDebe(e.target.value)}
                className="w-full px-2 py-1 border border-[#CBD5E1] font-mono text-[12px]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#475569] mb-0.5">Cuenta Cargas Imputables (79)</label>
              <input
                type="text"
                required
                value={ctaHaber}
                onChange={(e) => setCtaHaber(e.target.value)}
                className="w-full px-2 py-1 border border-[#CBD5E1] font-mono text-[12px]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[#CBD5E1]">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-3 py-1 border border-[#CBD5E1] text-[12px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-3 py-1 bg-[#1D4ED8] text-white text-[12px] font-bold"
            >
              Guardar Centro
            </button>
          </div>
        </form>
      </VentanaModal>
    </div>
  );
};
