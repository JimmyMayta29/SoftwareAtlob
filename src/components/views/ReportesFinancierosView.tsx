import React, { useState } from 'react';
import { 
  Table, 
  Building, 
  TrendingUp 
} from 'lucide-react';
import { AsientoContable, EmpresaCliente } from '../../types';
import { HojaTrabajo10ColumnasView } from './HojaTrabajo10ColumnasView';
import { BalanceGeneralView } from './BalanceGeneralView';
import { EstadoResultadosView } from './EstadoResultadosView';

interface ReportesFinancierosViewProps {
  asientos: AsientoContable[];
  empresa: EmpresaCliente;
  periodo: string;
  persistente?: boolean;
  onAbrirMayor?: (codigoCuenta: string) => void;
}

export const ReportesFinancierosView: React.FC<ReportesFinancierosViewProps> = ({
  asientos,
  empresa,
  periodo,
  persistente,
  onAbrirMayor
}) => {
  const [activeReportTab, setActiveReportTab] = useState<'HOJA_TRABAJO' | 'BALANCE_GENERAL' | 'ESTADO_RESULTADOS'>('HOJA_TRABAJO');

  return (
    <div className="space-y-4">
      {/* Selector de Pestañas de Reportes */}
      <div className="flex border-b border-slate-200 gap-2 text-xs">
        <button
          onClick={() => setActiveReportTab('HOJA_TRABAJO')}
          className={`px-4 py-2.5 font-bold rounded-t-xl transition flex items-center gap-2 cursor-pointer ${
            activeReportTab === 'HOJA_TRABAJO'
              ? 'bg-white text-blue-700 border-t-2 border-blue-600 shadow-xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Table className="w-4 h-4" />
          Hoja de Trabajo 10 Columnas
        </button>
        <button
          onClick={() => setActiveReportTab('BALANCE_GENERAL')}
          className={`px-4 py-2.5 font-bold rounded-t-xl transition flex items-center gap-2 cursor-pointer ${
            activeReportTab === 'BALANCE_GENERAL'
              ? 'bg-white text-blue-700 border-t-2 border-blue-600 shadow-xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building className="w-4 h-4" />
          Estado de Situación Financiera
        </button>
        <button
          onClick={() => setActiveReportTab('ESTADO_RESULTADOS')}
          className={`px-4 py-2.5 font-bold rounded-t-xl transition flex items-center gap-2 cursor-pointer ${
            activeReportTab === 'ESTADO_RESULTADOS'
              ? 'bg-white text-blue-700 border-t-2 border-blue-600 shadow-xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Estado de Resultados Integrales
        </button>
      </div>

      {/* Contenido según pestaña */}
      {activeReportTab === 'HOJA_TRABAJO' && (
        <HojaTrabajo10ColumnasView
          asientos={asientos}
          empresa={empresa}
          periodo={periodo}
          persistente={persistente}
          onAbrirMayor={onAbrirMayor}
        />
      )}

      {activeReportTab === 'BALANCE_GENERAL' && (
        <BalanceGeneralView
          empresa={empresa}
          periodo={periodo}
          persistente={persistente}
        />
      )}

      {activeReportTab === 'ESTADO_RESULTADOS' && (
        <EstadoResultadosView
          empresa={empresa}
          periodo={periodo}
          persistente={persistente}
        />
      )}
    </div>
  );
};
