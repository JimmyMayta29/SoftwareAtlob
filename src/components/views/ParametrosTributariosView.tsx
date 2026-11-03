import React, { useState } from 'react';
import { ShieldAlert, Save, Plus, History } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';

interface ParametroTributarioItem {
  id: string;
  codigoParametro: string;
  descripcion: string;
  valorNumerico: number;
  tipoDato: string;
  vigenteDesde: string;
  vigenteHasta: string | null;
}

interface RegistroAuditoriaParametro {
  id: string;
  fechaHora: string;
  usuarioEmail: string;
  rol: string;
  codigoParametro: string;
  valorAnterior: number | null;
  valorNuevo: number;
  vigenteDesde: string;
}

const PARAMETROS_INICIALES: ParametroTributarioItem[] = [
  { id: 'p-1', codigoParametro: 'VALOR_UIT_2026', descripcion: 'Valor de la UIT Ejercicio 2026 (D.S. N° 301-2025-EF)', valorNumerico: 5500.0, tipoDato: 'MONEDA', vigenteDesde: '2026-01-01', vigenteHasta: '2026-12-31' },
  { id: 'p-2', codigoParametro: 'VALOR_UIT_2025', descripcion: 'Valor de la UIT Ejercicio 2025 (D.S. N° 260-2024-EF)', valorNumerico: 5350.0, tipoDato: 'MONEDA', vigenteDesde: '2025-01-01', vigenteHasta: '2025-12-31' },
  { id: 'p-3', codigoParametro: 'VALOR_UIT_2024', descripcion: 'Valor de la UIT Ejercicio 2024 (D.S. N° 309-2023-EF)', valorNumerico: 5150.0, tipoDato: 'MONEDA', vigenteDesde: '2024-01-01', vigenteHasta: '2024-12-31' },
  { id: 'p-rmv-1', codigoParametro: 'RMV_2025_2026_T1', descripcion: 'Remuneración Mínima Vital hasta Sep-2026 (D.S. N° 006-2024-TR)', valorNumerico: 1130.0, tipoDato: 'MONEDA', vigenteDesde: '2025-01-01', vigenteHasta: '2026-09-30' },
  { id: 'p-rmv-2', codigoParametro: 'RMV_2026_OCT', descripcion: 'Remuneración Mínima Vital desde Oct-2026 (D.S. N° 015-2026-TR Tramo 1)', valorNumerico: 1230.0, tipoDato: 'MONEDA', vigenteDesde: '2026-10-01', vigenteHasta: '2026-12-31' },
  { id: 'p-rmv-3', codigoParametro: 'RMV_SEGUNDO_TRAMO_PENDIENTE', descripcion: 'RMV segundo tramo (+70, hasta 1,300) pendiente de decreto con fecha de vigencia', valorNumerico: 1300.0, tipoDato: 'MONEDA', vigenteDesde: '9999-12-31', vigenteHasta: null },
  { id: 'p-4', codigoParametro: 'TASA_IGV', descripcion: 'Tasa Total IGV + IPM (16% + 2%)', valorNumerico: 0.18, tipoDato: 'PORCENTAJE', vigenteDesde: '2011-03-01', vigenteHasta: null },
  { id: 'p-5', codigoParametro: 'TASA_RENTA_MYPE_T1', descripcion: 'Pago a Cuenta Mensual RMT (Ingresos <= 300 UIT)', valorNumerico: 0.01, tipoDato: 'PORCENTAJE', vigenteDesde: '2017-01-01', vigenteHasta: null },
  { id: 'p-6', codigoParametro: 'TASA_RENTA_RG_MIN', descripcion: 'Pago a Cuenta Mínimo Régimen General / RMT > 300 UIT (Art. 85° LIR)', valorNumerico: 0.015, tipoDato: 'PORCENTAJE', vigenteDesde: '2015-01-01', vigenteHasta: null },
  { id: 'p-7', codigoParametro: 'TASA_RENTA_RER', descripcion: 'Cuota Mensual Definitiva Régimen Especial de Renta (RER)', valorNumerico: 0.015, tipoDato: 'PORCENTAJE', vigenteDesde: '2007-01-01', vigenteHasta: null },
  { id: 'p-8', codigoParametro: 'TASA_RENTA_ANUAL_MYPE_T1', descripcion: 'Tasa Anual RMT Tramo 1 (Hasta 15 UIT)', valorNumerico: 0.1, tipoDato: 'PORCENTAJE', vigenteDesde: '2017-01-01', vigenteHasta: null },
  { id: 'p-9', codigoParametro: 'TRAMO_RENTA_ANUAL_MYPE_UIT', descripcion: 'Límite del Tramo 1 Anual RMT en UIT', valorNumerico: 15.0, tipoDato: 'ENTERO', vigenteDesde: '2017-01-01', vigenteHasta: null },
  { id: 'p-10', codigoParametro: 'TASA_RENTA_ANUAL_GENERAL', descripcion: 'Tasa Anual Impuesto a la Renta 3ra Categoría (RG y Exceso RMT)', valorNumerico: 0.295, tipoDato: 'PORCENTAJE', vigenteDesde: '2017-01-01', vigenteHasta: null },
  { id: 'p-11', codigoParametro: 'UMBRAL_DAOT_UIT', descripcion: 'Umbral Anual por Tercero para DAOT en UIT (R.S. 024-2002/SUNAT)', valorNumerico: 2.0, tipoDato: 'ENTERO', vigenteDesde: '2002-01-01', vigenteHasta: null },
];

export const ParametrosTributariosView: React.FC = () => {
  const { notify } = useAppContext();
  const [parametros, setParametros] = useState<ParametroTributarioItem[]>(PARAMETROS_INICIALES);
  const [auditoria, setAuditoria] = useState<RegistroAuditoriaParametro[]>([
    {
      id: 'aud-1',
      fechaHora: '2026-01-02 08:30:00',
      usuarioEmail: 'jimmymayta29@gmail.com',
      rol: 'ADMIN_ESTUDIO',
      codigoParametro: 'VALOR_UIT_2026',
      valorAnterior: 5350.0,
      valorNuevo: 5500.0,
      vigenteDesde: '2026-01-01',
    },
  ]);

  const [editItem, setEditItem] = useState<ParametroTributarioItem | null>(null);
  const [nuevoValor, setNuevoValor] = useState('');
  const [nuevaVigenciaDesde, setNuevaVigenciaDesde] = useState('');
  const [nuevaVigenciaHasta, setNuevaVigenciaHasta] = useState('');
  const [mostrarAuditoria, setMostrarAuditoria] = useState(false);

  const abrirEdicion = (item: ParametroTributarioItem) => {
    setEditItem(item);
    setNuevoValor(String(item.valorNumerico));
    setNuevaVigenciaDesde(item.vigenteDesde);
    setNuevaVigenciaHasta(item.vigenteHasta || '');
  };

  const guardarCambio = () => {
    if (!editItem) return;
    const valNum = parseFloat(nuevoValor);
    if (isNaN(valNum) || valNum < 0) {
      notify('El valor numérico debe ser válido y mayor o igual a cero', 'error');
      return;
    }

    const valorPrevio = editItem.valorNumerico;
    setParametros((prev) =>
      prev.map((p) =>
        p.id === editItem.id
          ? {
              ...p,
              valorNumerico: valNum,
              vigenteDesde: nuevaVigenciaDesde || p.vigenteDesde,
              vigenteHasta: nuevaVigenciaHasta.trim() ? nuevaVigenciaHasta.trim() : null,
            }
          : p
      )
    );

    setAuditoria((prev) => [
      {
        id: `aud-${Date.now()}`,
        fechaHora: new Date().toISOString().replace('T', ' ').slice(0, 19),
        usuarioEmail: 'jimmymayta29@gmail.com',
        rol: 'ADMIN_ESTUDIO',
        codigoParametro: editItem.codigoParametro,
        valorAnterior: valorPrevio,
        valorNuevo: valNum,
        vigenteDesde: nuevaVigenciaDesde || editItem.vigenteDesde,
      },
      ...prev,
    ]);

    notify(
      `Parámetro ${editItem.codigoParametro} actualizado a ${valNum} y registrado en auditoría inmutable`,
      'success'
    );
    setEditItem(null);
  };

  const columnas: ColumnaTablaDensa<ParametroTributarioItem>[] = [
    {
      key: 'codigoParametro',
      header: 'Código Parámetro',
      width: '215px',
      render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.codigoParametro}</span>,
    },
    {
      key: 'descripcion',
      header: 'Descripción Normativa / Base Legal',
      render: (r) => r.descripcion,
    },
    {
      key: 'tipoDato',
      header: 'Tipo',
      width: '95px',
      align: 'center',
      render: (r) => <span className="font-mono text-[11px] text-[#4B5563]">{r.tipoDato}</span>,
    },
    {
      key: 'valorNumerico',
      header: 'Valor Vigente',
      width: '125px',
      align: 'right',
      render: (r) => (
        <span className="font-mono font-bold text-[#111827]">
          {r.tipoDato === 'PORCENTAJE'
            ? `${(r.valorNumerico * 100).toFixed(2)}% (${r.valorNumerico})`
            : r.valorNumerico.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'vigenteDesde',
      header: 'Vigente Desde',
      width: '105px',
      align: 'center',
      render: (r) => <span className="font-mono">{r.vigenteDesde}</span>,
    },
    {
      key: 'vigenteHasta',
      header: 'Vigente Hasta',
      width: '105px',
      align: 'center',
      render: (r) => <span className="font-mono text-[#4B5563]">{r.vigenteHasta || 'INDEFINIDO'}</span>,
    },
    {
      key: 'acciones',
      header: 'Edición (Admin)',
      width: '110px',
      align: 'center',
      render: (r) => (
        <button
          type="button"
          onClick={() => abrirEdicion(r)}
          className="h-5 px-2 bg-[#1E3A5F] text-[#FFFFFF] text-[11px] font-bold hover:bg-[#1D4ED8]"
        >
          Modificar
        </button>
      ),
    },
  ];

  const columnasAuditoria: ColumnaTablaDensa<RegistroAuditoriaParametro>[] = [
    { key: 'fechaHora', header: 'Fecha y Hora', width: '145px', render: (r) => <span className="font-mono">{r.fechaHora}</span> },
    { key: 'usuarioEmail', header: 'Administrador', width: '180px', render: (r) => r.usuarioEmail },
    { key: 'codigoParametro', header: 'Parámetro Modificado', width: '200px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.codigoParametro}</span> },
    { key: 'valorAnterior', header: 'Valor Anterior', width: '110px', align: 'right', render: (r) => <span className="font-mono text-[#4B5563]">{r.valorAnterior ?? '-'}</span> },
    { key: 'valorNuevo', header: 'Valor Nuevo', width: '110px', align: 'right', render: (r) => <span className="font-mono font-bold text-[#1E6F42]">{r.valorNuevo}</span> },
    { key: 'vigenteDesde', header: 'Vigencia Desde', width: '110px', align: 'center', render: (r) => <span className="font-mono">{r.vigenteDesde}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Parámetros Tributarios Editables (UIT, Tasas IGV, Renta, DAOT y Tramos Legales)"
        subtitulo="Tabla maestra de parámetros con vigencia temporal; consumida por PDT 621, Prorrata, Renta Anual y DAOT"
        acciones={[
          {
            id: 'ver-auditoria',
            label: mostrarAuditoria ? 'Ver Tabla de Parámetros' : `Bitácora de Cambios (${auditoria.length})`,
            icono: History,
            primario: mostrarAuditoria,
            onClick: () => setMostrarAuditoria(!mostrarAuditoria),
          },
        ]}
        derecha={
          <div className="flex items-center gap-1.5 text-[11px] text-[#1E3A5F] font-bold bg-[#E8ECF1] border border-[#D1D5DB] px-2 py-0.5">
            <ShieldAlert className="w-3.5 h-3.5 text-[#1D4ED8]" />
            <span>Edición exclusiva: ADMINISTRADOR (con registro en cadena de auditoría)</span>
          </div>
        }
      />

      <div className="bg-[#FEF3C7] border-b border-[#FCD34D] px-3 py-1.5 flex items-center justify-between text-[11px] text-[#92400E]">
        <div className="flex items-center gap-2">
          <span className="font-bold uppercase tracking-wider bg-[#F59E0B] text-white px-1.5 py-0.5 text-[10px]">Aviso Normativo</span>
          <span><strong>RMV segundo tramo pendiente de decreto:</strong> El incremento a S/ 1,300.00 no tiene fecha de vigencia publicada y se mantiene inactivo. La RMV vigente es S/ 1,230.00 (desde 01/10/2026, D.S. 015-2026-TR).</span>
        </div>
      </div>

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        {!mostrarAuditoria ? (
          <TablaDensa
            columnas={columnas}
            datos={parametros}
            rowKey={(r) => r.id}
          />
        ) : (
          <div className="flex flex-col h-full">
            <div className="text-[11px] font-bold text-[#1E3A5F] mb-1.5">
              Historial de Cambios de Parámetros Tributarios (Auditoría Inmutable)
            </div>
            <TablaDensa
              columnas={columnasAuditoria}
              datos={auditoria}
              rowKey={(r) => r.id}
            />
          </div>
        )}
      </div>

      <VentanaModal
        abierto={Boolean(editItem)}
        onCerrar={() => setEditItem(null)}
        titulo={`Modificar Parámetro Tributario — ${editItem?.codigoParametro || ''}`}
        ancho="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditItem(null)}
              className="h-6 px-3 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardarCambio}
              className="h-6 px-3 bg-[#1E3A5F] text-[#FFFFFF] text-[12px] font-bold flex items-center gap-1"
            >
              <Save className="w-3.5 h-3.5" />
              Guardar y Auditar
            </button>
          </div>
        }
      >
        {editItem && (
          <div className="space-y-2.5 text-[12px]">
            <div className="p-2 bg-[#F5F7FA] border border-[#D1D5DB]">
              <div className="font-mono font-bold text-[#1E3A5F]">{editItem.codigoParametro}</div>
              <div className="text-[11px] text-[#4B5563]">{editItem.descripcion}</div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-[#111827] mb-0.5">Nuevo Valor Numérico</label>
                <input
                  type="number"
                  step="0.0001"
                  value={nuevoValor}
                  onChange={(e) => setNuevoValor(e.target.value)}
                  className="w-full h-6 px-2 font-mono text-right border border-[#1E3A5F] bg-[#FFFFFF]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#111827] mb-0.5">Vigente Desde</label>
                <input
                  type="text"
                  value={nuevaVigenciaDesde}
                  onChange={(e) => setNuevaVigenciaDesde(e.target.value)}
                  placeholder="YYYY-MM-DD"
                  className="w-full h-6 px-2 font-mono border border-[#D1D5DB] bg-[#FFFFFF]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#111827] mb-0.5">Vigente Hasta (Opcional)</label>
                <input
                  type="text"
                  value={nuevaVigenciaHasta}
                  onChange={(e) => setNuevaVigenciaHasta(e.target.value)}
                  placeholder="YYYY-MM-DD"
                  className="w-full h-6 px-2 font-mono border border-[#D1D5DB] bg-[#FFFFFF]"
                />
              </div>
            </div>
          </div>
        )}
      </VentanaModal>
    </div>
  );
};
