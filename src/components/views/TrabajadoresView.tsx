import React, { useState } from 'react';
import { Plus, UserCheck } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';
import { CampoNumerico } from '../ui/CampoNumerico';

interface TrabajadorMaestro {
  id: string;
  dni: string;
  apellidosNombres: string;
  cargo: string;
  regimenPensionario: 'ONP' | 'AFP_INTEGRA' | 'AFP_PRIMA' | 'AFP_PROFUTURO' | 'AFP_HABITAT';
  cuspp: string;
  sueldoBasico: number;
  asignacionFamiliar: boolean;
  fechaIngreso: string;
  estado: 'ACTIVO' | 'CESADO';
}

const TRABAJADORES_INICIALES: TrabajadorMaestro[] = [
  {
    id: 'tr-1',
    dni: '44556677',
    apellidosNombres: 'QUISPE MENDOZA CARLOS ALBERTO',
    cargo: 'CONTADOR GENERAL',
    regimenPensionario: 'AFP_INTEGRA',
    cuspp: '598411CQMEN0',
    sueldoBasico: 4500.0,
    asignacionFamiliar: true,
    fechaIngreso: '2023-02-01',
    estado: 'ACTIVO',
  },
  {
    id: 'tr-2',
    dni: '71829304',
    apellidosNombres: 'ROJAS VARGAS LUCIA FERNANDA',
    cargo: 'ANALISTA TRIBUTARIO',
    regimenPensionario: 'ONP',
    cuspp: '-',
    sueldoBasico: 2800.0,
    asignacionFamiliar: false,
    fechaIngreso: '2024-06-01',
    estado: 'ACTIVO',
  },
];

export const TrabajadoresView: React.FC = () => {
  const { notify } = useAppContext();
  const [trabajadores, setTrabajadores] = useState<TrabajadorMaestro[]>(TRABAJADORES_INICIALES);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [dni, setDni] = useState('');
  const [apellidosNombres, setApellidosNombres] = useState('');
  const [cargo, setCargo] = useState('');
  const [regimenPensionario, setRegimenPensionario] = useState<TrabajadorMaestro['regimenPensionario']>('ONP');
  const [sueldoBasico, setSueldoBasico] = useState('1025.00');
  const [asignacionFamiliar, setAsignacionFamiliar] = useState(false);

  const guardarTrabajador = () => {
    if (!dni.trim() || !apellidosNombres.trim()) {
      notify('Complete DNI y Apellidos y Nombres', 'warning');
      return;
    }
    const nuevo: TrabajadorMaestro = {
      id: `tr-${Date.now()}`,
      dni: dni.trim(),
      apellidosNombres: apellidosNombres.trim().toUpperCase(),
      cargo: cargo.trim().toUpperCase() || 'ASISTENTE',
      regimenPensionario,
      cuspp: regimenPensionario === 'ONP' ? '-' : '600123ABCDE0',
      sueldoBasico: Number(sueldoBasico) || 1025,
      asignacionFamiliar,
      fechaIngreso: '2026-03-01',
      estado: 'ACTIVO',
    };
    setTrabajadores((prev) => [...prev, nuevo]);
    setModalAbierto(false);
    setDni('');
    setApellidosNombres('');
    setCargo('');
    notify(`Trabajador ${nuevo.apellidosNombres} registrado en T-Registro`, 'success');
  };

  const columnas: ColumnaTablaDensa<TrabajadorMaestro>[] = [
    { key: 'dni', header: 'DNI / C.E.', width: '85px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.dni}</span> },
    { key: 'apellidosNombres', header: 'Apellidos y Nombres', render: (r) => <span className="font-bold text-[#111827]">{r.apellidosNombres}</span> },
    { key: 'cargo', header: 'Cargo / Puesto', width: '165px', render: (r) => r.cargo },
    { key: 'regimenPensionario', header: 'Régimen Pensión', width: '125px', render: (r) => <span className="font-mono text-[11px]">{r.regimenPensionario}</span> },
    { key: 'cuspp', header: 'CUSPP', width: '115px', render: (r) => <span className="font-mono text-[11px]">{r.cuspp}</span> },
    { key: 'sueldoBasico', header: 'Rem. Básica S/', width: '110px', align: 'right', render: (r) => r.sueldoBasico.toFixed(2) },
    { key: 'asignacionFamiliar', header: 'Asig. Fam.', width: '80px', align: 'center', render: (r) => (r.asignacionFamiliar ? 'S/ 102.50' : 'NO') },
    { key: 'fechaIngreso', header: 'F. Ingreso', width: '90px', render: (r) => <span className="font-mono">{r.fechaIngreso}</span> },
    { key: 'estado', header: 'Estado', width: '75px', align: 'center', render: (r) => <span className="font-bold text-[#1E6F42] text-[11px]">{r.estado}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Padrón Maestro de Trabajadores (T-Registro SUNAT)"
        subtitulo="Datos laborales, régimen pensionario (ONP / AFP), CUSPP y remuneración básica computable"
        acciones={[
          {
            id: 'nuevo-trab',
            label: 'Registrar Trabajador',
            icono: Plus,
            primario: true,
            onClick: () => setModalAbierto(true),
          },
        ]}
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={trabajadores}
          rowKey={(r) => r.id}
        />
      </div>

      <VentanaModal
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        titulo="Alta de Trabajador en Padrón T-Registro"
        ancho="md"
        footer={
          <>
            <button type="button" onClick={() => setModalAbierto(false)} className="h-6 px-3 text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]">
              Cancelar
            </button>
            <button type="button" onClick={guardarTrabajador} className="h-6 px-3 text-[12px] border border-[#1E3A5F] bg-[#1E3A5F] text-[#FFFFFF]">
              Guardar Trabajador
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 text-[12px]">
          <div>
            <label className="block text-[11px] text-[#4B5563] mb-0.5">DNI (Catálogo 03 T-Registro)</label>
            <input type="text" value={dni} onChange={(e) => setDni(e.target.value)} className="w-full h-6 px-2 font-mono border border-[#D1D5DB]" />
          </div>
          <div>
            <label className="block text-[11px] text-[#4B5563] mb-0.5">Régimen Pensionario</label>
            <select
              value={regimenPensionario}
              onChange={(e) => setRegimenPensionario(e.target.value as TrabajadorMaestro['regimenPensionario'])}
              className="w-full h-6 px-2 border border-[#D1D5DB]"
            >
              <option value="ONP">ONP - D.L. 19990 (13%)</option>
              <option value="AFP_INTEGRA">AFP Integra</option>
              <option value="AFP_PRIMA">AFP Prima</option>
              <option value="AFP_PROFUTURO">AFP Profuturo</option>
              <option value="AFP_HABITAT">AFP Habitat</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-[11px] text-[#4B5563] mb-0.5">Apellidos y Nombres Completos</label>
            <input type="text" value={apellidosNombres} onChange={(e) => setApellidosNombres(e.target.value)} className="w-full h-6 px-2 border border-[#D1D5DB]" />
          </div>
          <div>
            <label className="block text-[11px] text-[#4B5563] mb-0.5">Cargo / Ocupación</label>
            <input type="text" value={cargo} onChange={(e) => setCargo(e.target.value)} className="w-full h-6 px-2 border border-[#D1D5DB]" />
          </div>
          <div>
            <CampoNumerico label="Remuneración Básica Mensual S/" value={sueldoBasico} onChange={setSueldoBasico} />
          </div>
          <div className="col-span-2 flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="chk-af"
              checked={asignacionFamiliar}
              onChange={(e) => setAsignacionFamiliar(e.target.checked)}
            />
            <label htmlFor="chk-af" className="text-[12px]">Percibe Asignación Familiar (Ley N° 25129 — 10% RMV)</label>
          </div>
        </div>
      </VentanaModal>
    </div>
  );
};
