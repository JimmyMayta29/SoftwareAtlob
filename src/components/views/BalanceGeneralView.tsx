import React, { useState, useEffect } from 'react';
import { Download, FileText, RefreshCw } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';
import { EMPRESAS_CLIENTES_DEMO } from '../../data/empresasClientes';
import { construirDefinicionEstadoSituacionFinancieraEstandar } from '../../services/reports/formato_estandar/formatoEstandarEngine';
import { VisorReporteModal } from '../modals/VisorReporteModal';

interface PartidaBalanceGeneral {
  id: string;
  bloque: 'ACTIVO CORRIENTE' | 'ACTIVO NO CORRIENTE' | 'PASIVO CORRIENTE' | 'PASIVO NO CORRIENTE' | 'PATRIMONIO NETO';
  codigoRubro: string;
  rubroSmv: string;
  importePen: number;
}

export const BalanceGeneralView: React.FC = () => {
  const { state, notify } = useAppContext();
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-03');
  const [modalEstandarOpen, setModalEstandarOpen] = useState(false);
  const [partidas, setPartidas] = useState<PartidaBalanceGeneral[]>([]);
  const [cargando, setCargando] = useState(false);
  const [totalActivo, setTotalActivo] = useState(0);
  const [totalPasivoPatrimonio, setTotalPasivoPatrimonio] = useState(0);
  const [cuadre, setCuadre] = useState(true);

  const empresa = (state.activeEmpresa as any) || EMPRESAS_CLIENTES_DEMO[0];
  const empresaId = empresa?.id;

  const cargarBalance = async () => {
    if (!empresaId) return;
    setCargando(true);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/estado-situacion-financiera?periodo=${periodo}`, {
        headers: {
          ...(state.token ? { Authorization: `Bearer ${state.token}` } : {})
        }
      });
      const json = await res.json().catch(() => null);
      const data = json?.data;
      if (data) {
        const rows: PartidaBalanceGeneral[] = [];
        (data.activoCorriente || []).forEach((a: any, i: number) => {
          rows.push({
            id: `ac-${i}`,
            bloque: 'ACTIVO CORRIENTE',
            codigoRubro: a.codigo,
            rubroSmv: a.nombre,
            importePen: Number(a.monto) || 0
          });
        });
        (data.activoNoCorriente || []).forEach((a: any, i: number) => {
          rows.push({
            id: `anc-${i}`,
            bloque: 'ACTIVO NO CORRIENTE',
            codigoRubro: a.codigo,
            rubroSmv: a.nombre,
            importePen: Number(a.monto) || 0
          });
        });
        (data.pasivoCorriente || []).forEach((p: any, i: number) => {
          rows.push({
            id: `pc-${i}`,
            bloque: 'PASIVO CORRIENTE',
            codigoRubro: p.codigo,
            rubroSmv: p.nombre,
            importePen: Number(p.monto) || 0
          });
        });
        (data.pasivoNoCorriente || []).forEach((p: any, i: number) => {
          rows.push({
            id: `pnc-${i}`,
            bloque: 'PASIVO NO CORRIENTE',
            codigoRubro: p.codigo,
            rubroSmv: p.nombre,
            importePen: Number(p.monto) || 0
          });
        });
        (data.patrimonioNeto || []).forEach((p: any, i: number) => {
          rows.push({
            id: `pat-${i}`,
            bloque: 'PATRIMONIO NETO',
            codigoRubro: p.codigo,
            rubroSmv: p.nombre,
            importePen: Number(p.monto) || 0
          });
        });
        if (data.resultadoDelEjercicio) {
          rows.push({
            id: 'pat-res',
            bloque: 'PATRIMONIO NETO',
            codigoRubro: '59',
            rubroSmv: 'Resultado del Ejercicio',
            importePen: Number(data.resultadoDelEjercicio) || 0
          });
        }
        setPartidas(rows);
        setTotalActivo(Number(data.totalActivo) || 0);
        setTotalPasivoPatrimonio(Number(data.totalPasivoYPatrimonio) || 0);
        setCuadre(Boolean(data.estaCuadrado));
      } else {
        setPartidas([]);
      }
    } catch {
      setPartidas([]);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarBalance();
  }, [empresaId, periodo]);

  const columnas: ColumnaTablaDensa<PartidaBalanceGeneral>[] = [
    { key: 'bloque', header: 'Masa Patrimonial', width: '165px', render: (r) => <span className="font-bold text-[#1E3A5F] text-[11px]">{r.bloque}</span> },
    { key: 'codigoRubro', header: 'Cód. SMV/SUNAT', width: '110px', render: (r) => <span className="font-mono">{r.codigoRubro}</span> },
    { key: 'rubroSmv', header: 'Rubro del Estado de Situación Financiera (NIC 1 / Formato 3.1)', render: (r) => <span className="font-bold text-[#111827]">{r.rubroSmv}</span> },
    { key: 'importePen', header: 'Saldo al Cierre S/', width: '135px', align: 'right', render: (r) => <span className="font-bold">{r.importePen.toFixed(2)}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Balance General — Estado de Situación Financiera (NIC 1 / Formato 3.1 SUNAT)"
        subtitulo="Presentación clasificada de Activo Corriente, Activo No Corriente, Pasivo y Patrimonio Neto"
        acciones={[
          {
            id: 'estandar',
            label: 'Reporte estándar',
            icono: FileText,
            primario: true,
            onClick: () => setModalEstandarOpen(true),
          },
          {
            id: 'exportar',
            label: 'Exportar Formato 3.1',
            icono: Download,
            onClick: () => notify(`Estado de Situación Financiera (${periodo}) exportado`, 'success'),
          },
        ]}
        derecha={<SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] flex items-center justify-between text-[12px]">
        <div className="flex items-center gap-6">
          <span><strong>TOTAL ACTIVO:</strong> <span className="font-mono font-bold text-[#1E3A5F]">S/ {totalActivo.toFixed(2)}</span></span>
          <span><strong>TOTAL PASIVO Y PATRIMONIO:</strong> <span className="font-mono font-bold text-[#1E3A5F]">S/ {totalPasivoPatrimonio.toFixed(2)}</span></span>
        </div>
        <span className={`font-bold text-[11px] ${cuadre ? 'text-[#1E6F42]' : 'text-[#B91C1C]'}`}>
          {cuadre ? 'ECUACIÓN CONTABLE CUADRADA' : 'DESCUADRE EN BALANCE'} (Diferencia: S/ {Math.abs(totalActivo - totalPasivoPatrimonio).toFixed(2)})
        </span>
      </div>

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={partidas}
          rowKey={(r) => r.id}
          totales={{
            rubroSmv: <span className="font-bold">TOTAL GENERAL</span>,
            importePen: totalActivo.toFixed(2),
          }}
        />
      </div>

      {/* Modal de Vista Previa Formato Estándar */}
      {modalEstandarOpen && (
        <VisorReporteModal
          isOpen={modalEstandarOpen}
          onClose={() => setModalEstandarOpen(false)}
          definicion={construirDefinicionEstadoSituacionFinancieraEstandar(empresa, {}, periodo)}
        />
      )}
    </div>
  );
};
