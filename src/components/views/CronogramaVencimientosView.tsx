import React, { useState } from 'react';
import { Calendar, Edit3, AlertTriangle } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';

interface FilaCronograma {
  periodoTributario: string;
  obligacion: 'PDT_621' | 'PLAME' | 'DAOT' | 'RENTA_ANUAL';
  mesVencimiento: string;
  digito0: string;
  digito1: string;
  digito2y3: string;
  digito4y5: string;
  digito6y7: string;
  digito8y9: string;
  buenosContribuyentes: string;
  esSupuestoValidar: boolean;
}

const CRONOGRAMA_INICIAL: FilaCronograma[] = [
  { periodoTributario: '2026-01 (Ene)', obligacion: 'PDT_621', mesVencimiento: 'Febrero 2026', digito0: '2026-02-16', digito1: '2026-02-17', digito2y3: '2026-02-18', digito4y5: '2026-02-19', digito6y7: '2026-02-20', digito8y9: '2026-02-23', buenosContribuyentes: '2026-02-24', esSupuestoValidar: true },
  { periodoTributario: '2026-02 (Feb)', obligacion: 'PDT_621', mesVencimiento: 'Marzo 2026', digito0: '2026-03-16', digito1: '2026-03-17', digito2y3: '2026-03-18', digito4y5: '2026-03-19', digito6y7: '2026-03-20', digito8y9: '2026-03-23', buenosContribuyentes: '2026-03-24', esSupuestoValidar: true },
  { periodoTributario: '2026-03 (Mar)', obligacion: 'PDT_621', mesVencimiento: 'Abril 2026', digito0: '2026-04-15', digito1: '2026-04-16', digito2y3: '2026-04-17', digito4y5: '2026-04-20', digito6y7: '2026-04-21', digito8y9: '2026-04-22', buenosContribuyentes: '2026-04-23', esSupuestoValidar: true },
  { periodoTributario: '2026-04 (Abr)', obligacion: 'PDT_621', mesVencimiento: 'Mayo 2026', digito0: '2026-05-15', digito1: '2026-05-18', digito2y3: '2026-05-19', digito4y5: '2026-05-20', digito6y7: '2026-05-21', digito8y9: '2026-05-22', buenosContribuyentes: '2026-05-25', esSupuestoValidar: true },
  { periodoTributario: '2026-05 (May)', obligacion: 'PDT_621', mesVencimiento: 'Junio 2026', digito0: '2026-06-15', digito1: '2026-06-16', digito2y3: '2026-06-17', digito4y5: '2026-06-18', digito6y7: '2026-06-19', digito8y9: '2026-06-22', buenosContribuyentes: '2026-06-23', esSupuestoValidar: true },
  { periodoTributario: '2026-06 (Jun)', obligacion: 'PDT_621', mesVencimiento: 'Julio 2026', digito0: '2026-07-15', digito1: '2026-07-16', digito2y3: '2026-07-17', digito4y5: '2026-07-20', digito6y7: '2026-07-21', digito8y9: '2026-07-22', buenosContribuyentes: '2026-07-24', esSupuestoValidar: true },
  { periodoTributario: '2026-09 (Set)', obligacion: 'PDT_621', mesVencimiento: 'Octubre 2026', digito0: '2026-10-15', digito1: '2026-10-16', digito2y3: '2026-10-19', digito4y5: '2026-10-20', digito6y7: '2026-10-21', digito8y9: '2026-10-22', buenosContribuyentes: '2026-10-23', esSupuestoValidar: true },
];

export const CronogramaVencimientosView: React.FC = () => {
  const { state, notify } = useAppContext();
  const rucActual = state.activeEmpresaRuc || '20601234567';
  const ultimoDigito = rucActual.slice(-1);

  const [filas, setFilas] = useState<FilaCronograma[]>(CRONOGRAMA_INICIAL);
  const [obligacionFiltro, setObligacionFiltro] = useState<'PDT_621' | 'PLAME' | 'DAOT' | 'RENTA_ANUAL'>('PDT_621');
  const [esBuenContribuyente, setEsBuenContribuyente] = useState(false);
  const [editFila, setEditFila] = useState<FilaCronograma | null>(null);
  const [editFechaBc, setEditFechaBc] = useState('');

  const abrirEdicion = (fila: FilaCronograma) => {
    setEditFila(fila);
    setEditFechaBc(fila.buenosContribuyentes);
  };

  const guardarEdicion = () => {
    if (!editFila) return;
    setFilas((prev) =>
      prev.map((f) =>
        f.periodoTributario === editFila.periodoTributario
          ? { ...f, buenosContribuyentes: editFechaBc, esSupuestoValidar: false }
          : f
      )
    );
    notify(`Cronograma del período ${editFila.periodoTributario} actualizado y validado por el Administrador`, 'success');
    setEditFila(null);
  };

  const columnas: ColumnaTablaDensa<FilaCronograma>[] = [
    {
      key: 'periodoTributario',
      header: 'Período',
      width: '105px',
      render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.periodoTributario}</span>,
    },
    {
      key: 'obligacion',
      header: 'Obligación',
      width: '90px',
      align: 'center',
      render: () => <span className="font-mono text-[11px] font-bold">{obligacionFiltro}</span>,
    },
    {
      key: 'digito0',
      header: 'Dígito 0',
      align: 'center',
      render: (r) => (
        <span className={`font-mono ${!esBuenContribuyente && ultimoDigito === '0' ? 'font-bold text-[#1E6F42] bg-[#ECFDF5] px-1' : ''}`}>
          {r.digito0}
        </span>
      ),
    },
    {
      key: 'digito1',
      header: 'Dígito 1',
      align: 'center',
      render: (r) => (
        <span className={`font-mono ${!esBuenContribuyente && ultimoDigito === '1' ? 'font-bold text-[#1E6F42] bg-[#ECFDF5] px-1' : ''}`}>
          {r.digito1}
        </span>
      ),
    },
    {
      key: 'digito2y3',
      header: 'Dígitos 2 y 3',
      align: 'center',
      render: (r) => (
        <span className={`font-mono ${!esBuenContribuyente && ['2', '3'].includes(ultimoDigito) ? 'font-bold text-[#1E6F42] bg-[#ECFDF5] px-1' : ''}`}>
          {r.digito2y3}
        </span>
      ),
    },
    {
      key: 'digito4y5',
      header: 'Dígitos 4 y 5',
      align: 'center',
      render: (r) => (
        <span className={`font-mono ${!esBuenContribuyente && ['4', '5'].includes(ultimoDigito) ? 'font-bold text-[#1E6F42] bg-[#ECFDF5] px-1' : ''}`}>
          {r.digito4y5}
        </span>
      ),
    },
    {
      key: 'digito6y7',
      header: 'Dígitos 6 y 7',
      align: 'center',
      render: (r) => (
        <span className={`font-mono ${!esBuenContribuyente && ['6', '7'].includes(ultimoDigito) ? 'font-bold text-[#1E6F42] bg-[#ECFDF5] px-1' : ''}`}>
          {r.digito6y7}
        </span>
      ),
    },
    {
      key: 'digito8y9',
      header: 'Dígitos 8 y 9',
      align: 'center',
      render: (r) => (
        <span className={`font-mono ${!esBuenContribuyente && ['8', '9'].includes(ultimoDigito) ? 'font-bold text-[#1E6F42] bg-[#ECFDF5] px-1' : ''}`}>
          {r.digito8y9}
        </span>
      ),
    },
    {
      key: 'buenosContribuyentes',
      header: 'Buenos Contrib. (B)',
      align: 'center',
      render: (r) => (
        <span className={`font-mono ${esBuenContribuyente ? 'font-bold text-[#1D4ED8] bg-[#EFF6FF] px-1' : 'text-[#4B5563]'}`}>
          {r.buenosContribuyentes}
        </span>
      ),
    },
    {
      key: 'estadoVerificacion',
      header: 'Estado Norma',
      width: '140px',
      align: 'center',
      render: (r) =>
        r.esSupuestoValidar ? (
          <span className="font-mono text-[10px] font-bold text-[#B45309] bg-[#FEF3C7] border border-[#B45309] px-1.5 py-0.5">
            SUPUESTO A VALIDAR
          </span>
        ) : (
          <span className="font-mono text-[10px] font-bold text-[#1E6F42] bg-[#ECFDF5] border border-[#1E6F42] px-1.5 py-0.5">
            VERIFICADO R.S.
          </span>
        ),
    },
    {
      key: 'editar',
      header: 'Admin',
      width: '75px',
      align: 'center',
      render: (r) => (
        <button
          type="button"
          onClick={() => abrirEdicion(r)}
          className="h-5 px-2 bg-[#1E3A5F] text-[#FFFFFF] text-[10px] font-bold inline-flex items-center gap-1"
        >
          <Edit3 className="w-3 h-3" /> Editar
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Cronograma de Vencimientos SUNAT Según Último Dígito del RUC y Buenos Contribuyentes"
        subtitulo="Tabla versionada por año, período, dígito (0-9 y B) y obligación (PDT 621, PLAME, DAOT, Renta Anual); editable por el Administrador"
        derecha={
          <div className="flex items-center gap-2 text-[12px]">
            <label className="flex items-center gap-1 text-[11px] font-bold text-[#1E3A5F] cursor-pointer">
              <input
                type="checkbox"
                checked={esBuenContribuyente}
                onChange={(e) => setEsBuenContribuyente(e.target.checked)}
              />
              Régimen Buen Contribuyente (Dígito B)
            </label>
            <select
              value={obligacionFiltro}
              onChange={(e) => setObligacionFiltro(e.target.value as any)}
              className="h-6 px-2 text-[11px] font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
            >
              <option value="PDT_621">PDT 621 (IGV - Renta Mensual)</option>
              <option value="PLAME">PDT 601 — PLAME</option>
              <option value="DAOT">DAOT (PDT 3500)</option>
              <option value="RENTA_ANUAL">DJ Renta Anual (FV 710)</option>
            </select>
            <span className="font-mono font-bold text-[#111827]">{rucActual}</span>
            <span className="px-2 py-0.5 bg-[#ECFDF5] border border-[#1E6F42] text-[#1E6F42] font-bold text-[11px]">
              Dígito activo: {esBuenContribuyente ? 'B (Buen Contribuyente)' : ultimoDigito}
            </span>
          </div>
        }
      />

      <div className="px-3 py-1.5 bg-[#FEF3C7] border-b border-[#D1D5DB] text-[11px] text-[#92400E] flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>
          <strong>SUPUESTO A VALIDAR:</strong> Las fechas pre-cargadas del ejercicio 2026 están marcadas como referencia operativa hasta que el Administrador verifique o actualice la Resolución de Superintendencia oficial de SUNAT.
        </span>
      </div>

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={filas}
          rowKey={(r) => r.periodoTributario}
        />
      </div>

      <VentanaModal
        abierto={Boolean(editFila)}
        onCerrar={() => setEditFila(null)}
        titulo={`Editar Fechas de Vencimiento — ${editFila?.periodoTributario || ''}`}
        ancho="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditFila(null)}
              className="h-6 px-3 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardarEdicion}
              className="h-6 px-3 bg-[#1E3A5F] text-[#FFFFFF] text-[12px] font-bold"
            >
              Guardar y Marcar Verificado
            </button>
          </div>
        }
      >
        {editFila && (
          <div className="space-y-2 text-[12px]">
            <p className="text-[#4B5563]">
              Actualice la fecha límite oficial para el período <strong>{editFila.periodoTributario}</strong> y confirme contra la Resolución de Superintendencia vigente:
            </p>
            <div>
              <label className="block text-[11px] font-bold text-[#111827] mb-0.5">
                Vencimiento Buenos Contribuyentes y UESP (YYYY-MM-DD)
              </label>
              <input
                type="text"
                value={editFechaBc}
                onChange={(e) => setEditFechaBc(e.target.value)}
                className="w-full h-6 px-2 font-mono border border-[#1E3A5F] bg-[#FFFFFF]"
              />
            </div>
          </div>
        )}
      </VentanaModal>
    </div>
  );
};
