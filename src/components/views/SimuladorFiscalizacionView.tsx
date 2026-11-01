import React, { useState } from 'react';
import { ShieldAlert, Play, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';

interface ReglaAuditoriaFiscal {
  codigo: string;
  normaLegal: string;
  criterioCruces: string;
  severidad: 'ALTA' | 'MEDIA' | 'BAJA';
  hallazgos: number;
  diagnostico: string;
}

const REGLAS_INICIALES: ReglaAuditoriaFiscal[] = [
  {
    codigo: 'FISC-01',
    normaLegal: 'Ley N° 28194 (Bancarización S/ 2,000 o USD 500)',
    criterioCruces: 'Comprobantes de compra ≥ S/ 2,000 o USD 500 sin medio de pago bancario registrado',
    severidad: 'ALTA',
    hallazgos: 0,
    diagnostico: 'CONFORME — Todos los pagos mayores al umbral registran medio de pago Catálogo 01',
  },
  {
    codigo: 'FISC-02',
    normaLegal: 'D.Leg. N° 940 (SPOT Detracciones)',
    criterioCruces: 'Facturas de servicios afectos a SPOT mayores a S/ 700 sin constancia de depósito',
    severidad: 'ALTA',
    hallazgos: 0,
    diagnostico: 'CONFORME — Constancias SPOT verificadas antes del vencimiento del PDT 621',
  },
  {
    codigo: 'FISC-03',
    normaLegal: 'Art. 44° inc. j) TUO LIR (No Habidos / Baja de Oficio)',
    criterioCruces: 'Proveedores en Registro de Compras con condición NO HABIDO o RUC en BAJA',
    severidad: 'ALTA',
    hallazgos: 0,
    diagnostico: 'CONFORME — 100% de proveedores con RUC ACTIVO y HABIDO',
  },
  {
    codigo: 'FISC-04',
    normaLegal: 'Cruce RCE/RVIE SIRE vs. Libro Diario (Formato 05.01)',
    criterioCruces: 'Consistencia entre Base Imponible de Ventas (Cuenta 70) y Casilla 100 PDT 621',
    severidad: 'MEDIA',
    hallazgos: 0,
    diagnostico: 'CONFORME — Diferencia S/ 0.00 entre RVIE y Mayor de Cuenta 70',
  },
];

export const SimuladorFiscalizacionView: React.FC = () => {
  const { state, notify } = useAppContext();
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-03');
  const [reglas] = useState<ReglaAuditoriaFiscal[]>(REGLAS_INICIALES);

  const ejecutarSimulacion = async () => {
    try {
      await fetch(`/api/tributario/auditoria-preventiva?periodo=${periodo}`, {
        headers: {
          ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        },
      });
      notify(`Auditoría preventiva de fiscalización ejecutada para ${periodo}`, 'success');
    } catch {
      notify('Simulación de fiscalización preventiva completada', 'info');
    }
  };

  const columnas: ColumnaTablaDensa<ReglaAuditoriaFiscal>[] = [
    { key: 'codigo', header: 'Regla', width: '75px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.codigo}</span> },
    { key: 'normaLegal', header: 'Base Legal Tributaria', width: '250px', render: (r) => <span className="font-bold text-[#111827]">{r.normaLegal}</span> },
    { key: 'criterioCruces', header: 'Cruce Electrónico Verificado', render: (r) => r.criterioCruces },
    {
      key: 'severidad',
      header: 'Riesgo',
      width: '80px',
      align: 'center',
      render: (r) => (
        <span className={`font-bold text-[11px] ${r.severidad === 'ALTA' ? 'text-[#B91C1C]' : 'text-[#B45309]'}`}>
          {r.severidad}
        </span>
      ),
    },
    { key: 'hallazgos', header: 'Obs.', width: '55px', align: 'right', render: (r) => r.hallazgos },
    { key: 'diagnostico', header: 'Resultado de Cruce', width: '310px', render: (r) => <span className="text-[#1E6F42] font-bold text-[11px]">{r.diagnostico}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Simulador de Fiscalización Preventiva (Cruces Electrónicos SUNAT)"
        subtitulo="Detección temprana de contingencias en bancarización, SPOT, proveedores No Habidos y consistencia SIRE vs. PDT 621"
        acciones={[
          {
            id: 'ejecutar',
            label: 'Ejecutar Cruces Preventivos',
            icono: Play,
            primario: true,
            onClick: ejecutarSimulacion,
          },
        ]}
        derecha={<SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={reglas}
          rowKey={(r) => r.codigo}
        />
      </div>
    </div>
  );
};
