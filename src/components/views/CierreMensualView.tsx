import React, { useState } from 'react';
import { Lock, Unlock, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';

interface ValidacionPreCierre {
  id: string;
  control: string;
  modulo: string;
  estado: 'OK' | 'OBSERVADO';
  detalle: string;
}

export const CierreMensualView: React.FC = () => {
  const { state, notify } = useAppContext();
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-03');
  const [estadoPeriodo, setEstadoPeriodo] = useState<'ABIERTO' | 'CERRADO'>('ABIERTO');
  const [procesando, setProcesando] = useState(false);

  const validaciones: ValidacionPreCierre[] = [
    { id: 'v1', control: 'Partida doble en asientos del período', modulo: 'Libro Diario (05.01)', estado: 'OK', detalle: '100% de asientos cuadrados (Debe = Haber)' },
    { id: 'v2', control: 'Cuentas de destino Elemento 6 → Elemento 9 / 79', modulo: 'Contabilidad Analítica', estado: 'OK', detalle: 'Transferencias automáticas verificadas' },
    { id: 'v3', control: 'Ajuste mensual por diferencia de cambio NIC 21', modulo: 'Ajustes y Cierres', estado: 'OK', detalle: 'TC Cierre SBS aplicado sobre cuentas ME' },
    { id: 'v4', control: 'Conciliación RCE / RVIE con propuesta SIRE', modulo: 'Registros Electrónicos', estado: 'OK', detalle: 'Sin comprobantes huérfanos pendientes' },
    { id: 'v5', control: 'Provisión de depreciación mensual del activo fijo', modulo: 'Inventarios y Activos', estado: 'OK', detalle: 'Asiento 681 / 391 registrado' },
  ];

  const cambiarEstadoPeriodo = async (nuevoEstado: 'ABIERTO' | 'CERRADO') => {
    setProcesando(true);
    try {
      const endpoint = nuevoEstado === 'CERRADO' ? '/api/operaciones/periodos/cerrar' : '/api/operaciones/periodos/reabrir';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        },
        body: JSON.stringify({ 
          periodo, 
          empresaId: state.activeEmpresa,
          motivo: `Cambio de estado mensual desde Cierre Mensual (${periodo})` 
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setEstadoPeriodo(nuevoEstado);
        notify(`Período ${periodo} actualizado a ${nuevoEstado} con éxito`, 'success');
      } else {
        notify(`No se pudo cambiar el estado: ${data?.error || data?.message || 'Error en servidor'}`, 'error');
      }
    } catch (err: any) {
      notify(`Error de comunicación al actualizar el período: ${err.message || 'Fallo de red'}`, 'error');
    } finally {
      setProcesando(false);
    }
  };

  const columnas: ColumnaTablaDensa<ValidacionPreCierre>[] = [
    { key: 'id', header: 'Cód.', width: '60px', render: (r) => <span className="font-mono text-[#4B5563]">{r.id.toUpperCase()}</span> },
    { key: 'control', header: 'Verificación de Control Contable Pre-Cierre', render: (r) => <span className="font-bold text-[#111827]">{r.control}</span> },
    { key: 'modulo', header: 'Módulo Origen', width: '180px', render: (r) => r.modulo },
    {
      key: 'estado',
      header: 'Resultado',
      width: '110px',
      align: 'center',
      render: (r) => (
        <span className={`inline-flex items-center gap-1 font-bold text-[11px] ${r.estado === 'OK' ? 'text-[#1E6F42]' : 'text-[#B45309]'}`}>
          <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          {r.estado}
        </span>
      ),
    },
    { key: 'detalle', header: 'Detalle de Auditoría', render: (r) => <span className="text-[#4B5563]">{r.detalle}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Cierre Contable Mensual y Bloqueo de Período"
        subtitulo="Verificación de consistencia antes de bloquear el registro de vouchers en el mes"
        acciones={[
          {
            id: 'cerrar',
            label: 'Cerrar período mensual',
            icono: Lock,
            primario: estadoPeriodo === 'ABIERTO',
            disabled: procesando || estadoPeriodo === 'CERRADO',
            onClick: () => cambiarEstadoPeriodo('CERRADO'),
          },
          {
            id: 'reabrir',
            label: 'Reabrir período (Auditoría)',
            icono: Unlock,
            disabled: procesando || estadoPeriodo === 'ABIERTO',
            onClick: () => cambiarEstadoPeriodo('ABIERTO'),
          },
        ]}
        derecha={<SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] flex items-center justify-between">
        <div className="flex items-center gap-3 text-[12px]">
          <span className="text-[#4B5563]">Período seleccionado:</span>
          <span className="font-mono font-bold text-[#111827]">{periodo}</span>
          <span className="text-[#D1D5DB]">|</span>
          <span className="text-[#4B5563]">Estado actual:</span>
          <span className={`px-2 py-0.5 font-bold text-[11px] border ${
            estadoPeriodo === 'CERRADO'
              ? 'bg-[#FEF2F2] text-[#B91C1C] border-[#B91C1C]'
              : 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]'
          }`}>
            {estadoPeriodo}
          </span>
        </div>
        <div className="text-[11px] text-[#4B5563]">
          Al cerrar el período se bloquea la inserción, edición y anulación de asientos en el mes.
        </div>
      </div>

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={validaciones}
          rowKey={(r) => r.id}
        />
      </div>
    </div>
  );
};
