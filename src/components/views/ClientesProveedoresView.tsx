import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { CATALOGO_ENTIDADES_DEMO } from '../../data/maestros';
import { EntidadCatalogo } from '../../types';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';
import { useToast } from '../../context/ToastContext';

export const ClientesProveedoresView: React.FC = () => {
  const { success, error } = useToast();
  const [entidades, setEntidades] = useState<EntidadCatalogo[]>(CATALOGO_ENTIDADES_DEMO);
  const [busqueda, setBusqueda] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<'TODOS' | 'CLIENTE' | 'PROVEEDOR'>('TODOS');
  const [modalOpen, setModalOpen] = useState(false);

  const [ruc, setRuc] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [tipoEntidad, setTipoEntidad] = useState<'CLIENTE' | 'PROVEEDOR'>('PROVEEDOR');
  const [direccion, setDireccion] = useState('');

  const filtradas = entidades.filter((e) => {
    const matchTipo = tipoFiltro === 'TODOS' || e.tipoEntidad === tipoFiltro;
    const matchTexto =
      e.numeroDocumento.includes(busqueda.trim()) ||
      e.razonSocial.toLowerCase().includes(busqueda.trim().toLowerCase());
    return matchTipo && matchTexto;
  });

  const handleGuardar = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (ruc.trim().length !== 11 && ruc.trim().length !== 8) {
      error('El RUC debe tener 11 dígitos o el DNI 8 dígitos.', 'Validación SUNAT');
      return;
    }
    const nueva: EntidadCatalogo = {
      id: `ent-${Date.now()}`,
      tipoDocumento: ruc.trim().length === 11 ? '6' : '1',
      numeroDocumento: ruc.trim(),
      razonSocial: razonSocial.trim().toUpperCase(),
      tipoEntidad,
      condicionSunat: 'HABIDO',
      estadoSunat: 'ACTIVO',
      direccion: direccion.trim() || 'LIMA - PERÚ'
    };
    setEntidades([nueva, ...entidades]);
    setModalOpen(false);
    setRuc('');
    setRazonSocial('');
    setDireccion('');
    success(`Anexo ${nueva.numeroDocumento} - ${nueva.razonSocial} registrado.`, 'Padrón de Anexos');
  };

  return (
    <div className="space-y-2">
      <BarraHerramientasLocal
        tituloModulo="Padrón Maestro de Clientes y Proveedores (Anexos)"
        subtitulo={`${filtradas.length} terceros con condición SUNAT verificada`}
        onNuevo={() => setModalOpen(true)}
        labelNuevo="Nuevo Anexo (RUC/DNI)"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-[#CBD5E1] px-3 py-1.5">
        <div className="relative w-full max-w-md">
          <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-2" strokeWidth={1.5} />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por RUC, DNI o Razón Social..."
            className="w-full pl-8 pr-2 py-1 border border-[#CBD5E1] text-[12px] focus:outline-none focus:border-[#1D4ED8]"
          />
        </div>
        <div className="flex items-center gap-1 text-[11px]">
          {(['TODOS', 'CLIENTE', 'PROVEEDOR'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipoFiltro(t)}
              className={`px-2.5 py-0.5 border cursor-pointer ${
                tipoFiltro === t
                  ? 'bg-[#1D4ED8] text-white border-[#1D4ED8] font-bold'
                  : 'bg-white text-[#0F172A] border-[#CBD5E1]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <TablaDensa
        datos={filtradas}
        rowKey={(e) => e.id}
        columnas={[
          {
            key: 'tipoDocumento',
            header: 'Cat. 06',
            width: '70px',
            align: 'center',
            render: (e) => <span className="font-mono">{e.tipoDocumento === '6' ? '6-RUC' : '1-DNI'}</span>
          },
          {
            key: 'numeroDocumento',
            header: 'N° Documento',
            width: '120px',
            render: (e) => <span className="font-mono font-bold text-[#1D4ED8]">{e.numeroDocumento}</span>
          },
          { key: 'razonSocial', header: 'Razón Social / Apellidos y Nombres' },
          {
            key: 'tipoEntidad',
            header: 'Relación Comercial',
            width: '130px',
            align: 'center',
            render: (e) => (
              <span className="px-1.5 py-0.5 text-[11px] border bg-[#F8FAFC] border-[#CBD5E1]">
                {e.tipoEntidad}
              </span>
            )
          },
          { key: 'direccion', header: 'Domicilio Fiscal' },
          {
            key: 'condicionSunat',
            header: 'Condición SUNAT',
            width: '120px',
            align: 'center',
            render: (e) => (
              <span className="px-1.5 py-0.5 text-[11px] bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]">
                {e.estadoSunat} · {e.condicionSunat}
              </span>
            )
          }
        ]}
      />

      <VentanaModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        titulo="Alta de Cliente / Proveedor en Padrón de Anexos"
        ancho="md"
      >
        <form onSubmit={handleGuardar} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#475569] mb-0.5">RUC (11 dígitos) o DNI (8 dígitos)</label>
              <input
                type="text"
                required
                maxLength={11}
                value={ruc}
                onChange={(e) => setRuc(e.target.value)}
                placeholder="20601234567"
                className="w-full px-2 py-1 border border-[#CBD5E1] font-mono text-[12px]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#475569] mb-0.5">Tipo de Tercero</label>
              <select
                value={tipoEntidad}
                onChange={(e) => setTipoEntidad(e.target.value as any)}
                className="w-full px-2 py-1 border border-[#CBD5E1] text-[12px] bg-white"
              >
                <option value="PROVEEDOR">PROVEEDOR</option>
                <option value="CLIENTE">CLIENTE</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-[#475569] mb-0.5">Razón Social o Nombre Completo</label>
            <input
              type="text"
              required
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder="CORPORACIÓN PERUANA DE SUMINISTROS S.A.C."
              className="w-full px-2 py-1 border border-[#CBD5E1] text-[12px]"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#475569] mb-0.5">Domicilio Fiscal</label>
            <input
              type="text"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="Av. República de Panamá 3420, San Isidro"
              className="w-full px-2 py-1 border border-[#CBD5E1] text-[12px]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[#CBD5E1]">
            <button type="button" onClick={() => setModalOpen(false)} className="px-3 py-1 border border-[#CBD5E1]">
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 bg-[#1D4ED8] text-white font-bold">
              Guardar Anexo
            </button>
          </div>
        </form>
      </VentanaModal>
    </div>
  );
};
