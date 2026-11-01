import React, { useState } from 'react';
import { Calculator, CheckCircle2, FileText, Gift, Landmark, UserX } from 'lucide-react';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { useToast } from '../../context/ToastContext';
import {
  useTrabajadores,
  useGratificaciones,
  useCalcularGratificaciones,
  useContabilizarGratificaciones,
  useCts,
  useCalcularCts,
  useContabilizarCts,
  useLiquidacionesBeneficios,
  useCalcularLiquidacionBeneficios
} from '../../hooks/useTesoreriaPlanilla';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';
import { exportarLiquidacionBeneficiosEstandarPdf } from '../../services/reports/formato_estandar/formatoEstandarEngine';

export const GratificacionesCtsView: React.FC = () => {
  const { empresaActiva } = useEmpresaPeriodo();
  const empresaId = empresaActiva?.id || '00000000-0000-0000-0000-000000000001';
  const { success, error } = useToast();

  const [tabActiva, setTabActiva] = useState<'gratificaciones' | 'cts' | 'liquidaciones'>('gratificaciones');
  const [periodoGrati, setPeriodoGrati] = useState('2026-07');
  const [periodoCts, setPeriodoCts] = useState('2026-05');

  const { data: trabajadores = [] } = useTrabajadores(empresaId);
  const { data: gratificaciones = [] } = useGratificaciones(empresaId, periodoGrati);
  const calcularGratiMutation = useCalcularGratificaciones(empresaId);
  const contabilizarGratiMutation = useContabilizarGratificaciones(empresaId);

  const { data: listaCts = [] } = useCts(empresaId, periodoCts);
  const calcularCtsMutation = useCalcularCts(empresaId);
  const contabilizarCtsMutation = useContabilizarCts(empresaId);

  const { data: liquidaciones = [] } = useLiquidacionesBeneficios(empresaId);
  const calcularLiqMutation = useCalcularLiquidacionBeneficios(empresaId);

  // Modal Liquidación de Beneficios Sociales (Vacaciones truncas, CTS trunca, Gratificación trunca)
  const [modalLiqAbierto, setModalLiqAbierto] = useState(false);
  const [trabajadorIdLiq, setTrabajadorIdLiq] = useState('');
  const [fechaCeseLiq, setFechaCeseLiq] = useState('2026-09-15');
  const [motivoCeseLiq, setMotivoCeseLiq] = useState('RENUNCIA VOLUNTARIA');
  const [diasVacacionesPendientes, setDiasVacacionesPendientes] = useState('15');
  const [mesesCtsTruncos, setMesesCtsTruncos] = useState('4');
  const [diasCtsTruncos, setDiasCtsTruncos] = useState('15');
  const [mesesGratiTruncos, setMesesGratiTruncos] = useState('2');

  const handleCalcularGratificaciones = async () => {
    try {
      await calcularGratiMutation.mutateAsync(periodoGrati);
      success(
        `Gratificaciones legales (${periodoGrati}) y Bonificación Extraordinaria (9% EsSalud / 6.75% EPS) calculadas.`,
        'Gratificaciones Calculadas'
      );
    } catch (err: any) {
      error(err?.response?.data?.error || err.message || 'Error calculando gratificaciones', 'Error');
    }
  };

  const handleContabilizarGratificaciones = async () => {
    try {
      const res: any = await contabilizarGratiMutation.mutateAsync(periodoGrati);
      success(
        `Asiento de Gratificaciones (${periodoGrati}) generado en Subdiario 08 (Cuentas 6214, 6215 vs 4114). Voucher: ${res.asientoId || 'OK'}.`,
        'Gratificaciones Contabilizadas'
      );
    } catch (err: any) {
      error(err?.response?.data?.error || err.message || 'Error contabilizando gratificaciones', 'Error');
    }
  };

  const handleCalcularCts = async () => {
    try {
      await calcularCtsMutation.mutateAsync(periodoCts);
      success(
        `Depósito semestral de CTS (${periodoCts}) calculado con 1/6 de gratificación según régimen laboral.`,
        'CTS Calculada'
      );
    } catch (err: any) {
      error(err?.response?.data?.error || err.message || 'Error calculando CTS', 'Error');
    }
  };

  const handleContabilizarCts = async () => {
    try {
      const res: any = await contabilizarCtsMutation.mutateAsync(periodoCts);
      success(
        `Asiento de CTS (${periodoCts}) generado en Subdiario 08 (Cuenta 6291 vs 4151). Voucher: ${res.asientoId || 'OK'}.`,
        'CTS Contabilizada'
      );
    } catch (err: any) {
      error(err?.response?.data?.error || err.message || 'Error contabilizando CTS', 'Error');
    }
  };

  const handleEmitirLiquidacion = async () => {
    const targetTrabId = trabajadorIdLiq || (trabajadores[0] ? trabajadores[0].id : '');
    if (!targetTrabId) {
      error('Seleccione un trabajador para emitir su Liquidación de Beneficios Sociales', 'Atención');
      return;
    }
    try {
      await calcularLiqMutation.mutateAsync({
        trabajadorId: targetTrabId,
        fechaCese: fechaCeseLiq,
        motivoCese: motivoCeseLiq,
        diasVacacionesPendientes: parseInt(diasVacacionesPendientes, 10) || 0,
        mesesCtsTruncos: parseInt(mesesCtsTruncos, 10) || 0,
        diasCtsTruncos: parseInt(diasCtsTruncos, 10) || 0,
        mesesGratiTruncos: parseInt(mesesGratiTruncos, 10) || 0
      });
      setModalLiqAbierto(false);
      success(
        'Liquidación de Beneficios Sociales (Sueldo proporcional por cese, Vacaciones truncas, CTS trunca y Gratificación trunca) emitida.',
        'LBS Emitida'
      );
    } catch (err: any) {
      error(err?.response?.data?.error || err.message || 'Error emitiendo liquidación', 'Error');
    }
  };

  const columnasGrati: ColumnaTablaDensa<any>[] = [
    { key: 'doc', header: 'Doc. Identidad', width: '90px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.trabajadorDocumento}</span> },
    { key: 'nombre', header: 'Trabajador', render: (r) => <span className="font-bold">{r.trabajadorNombre}</span> },
    { key: 'regimen', header: 'Régimen', width: '115px', render: (r) => <span className="font-mono text-[11px]">{r.regimenLaboral}</span> },
    { key: 'meses', header: 'Meses Comp.', width: '85px', align: 'center', render: (r) => <span className="font-mono">{r.mesesComputables} / 6</span> },
    { key: 'remComp', header: 'Rem. Computable S/', width: '125px', align: 'right', render: (r) => <span className="font-mono">{Number(r.remuneracionComputable || 0).toFixed(2)}</span> },
    { key: 'grati', header: 'Gratificación Legal S/', width: '135px', align: 'right', render: (r) => <span className="font-mono font-bold text-[#1D4ED8]">{Number(r.montoGratificacion || 0).toFixed(2)}</span> },
    {
      key: 'bonif',
      header: 'Bonif. Extra (9% / 6.75%)',
      width: '150px',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-[#1E6F42] font-bold">
          {Number(r.bonificacionExtraordinaria || 0).toFixed(2)} ({(Number(r.tasaBonificacion || 0.09) * 100).toFixed(2)}%)
        </span>
      )
    },
    { key: 'neto', header: 'Total a Pagar S/', width: '125px', align: 'right', render: (r) => <span className="font-mono font-bold text-[#111827]">{Number(r.netoGratificacion || 0).toFixed(2)}</span> },
    { key: 'estado', header: 'Estado', width: '105px', align: 'center', render: (r) => <span className="font-mono text-[10px] font-bold">{r.estado}</span> }
  ];

  const columnasCts: ColumnaTablaDensa<any>[] = [
    { key: 'doc', header: 'Doc. Identidad', width: '90px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.trabajadorDocumento}</span> },
    { key: 'nombre', header: 'Trabajador', render: (r) => <span className="font-bold">{r.trabajadorNombre}</span> },
    { key: 'regimen', header: 'Régimen', width: '115px', render: (r) => <span className="font-mono text-[11px]">{r.regimenLaboral}</span> },
    { key: 'tiempo', header: 'Tiempo Comp.', width: '105px', align: 'center', render: (r) => <span className="font-mono">{r.mesesComputables}m {r.diasComputables}d</span> },
    { key: 'basico', header: 'Básico + Asig. Fam.', width: '125px', align: 'right', render: (r) => <span className="font-mono">{(Number(r.sueldoBasico || 0) + Number(r.asignacionFamiliar || 0)).toFixed(2)}</span> },
    { key: 'sexto', header: '1/6 Gratificación S/', width: '125px', align: 'right', render: (r) => <span className="font-mono">{Number(r.sextoGratificacion || 0).toFixed(2)}</span> },
    { key: 'remComp', header: 'Rem. Computable CTS S/', width: '140px', align: 'right', render: (r) => <span className="font-mono font-bold">{Number(r.remuneracionComputable || 0).toFixed(2)}</span> },
    { key: 'montoCts', header: 'Depósito CTS S/', width: '125px', align: 'right', render: (r) => <span className="font-mono font-bold text-[#1E6F42]">{Number(r.montoCts || 0).toFixed(2)}</span> },
    { key: 'estado', header: 'Estado', width: '105px', align: 'center', render: (r) => <span className="font-mono text-[10px] font-bold">{r.estado}</span> }
  ];

  const columnasLiq: ColumnaTablaDensa<any>[] = [
    { key: 'doc', header: 'Doc.', width: '80px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.trabajadorDocumento}</span> },
    { key: 'nombre', header: 'Trabajador Cesado', render: (r) => <span className="font-bold">{r.trabajadorNombre}</span> },
    { key: 'cese', header: 'F. Cese', width: '85px', render: (r) => <span className="font-mono">{r.fechaCese}</span> },
    { key: 'remMes', header: 'Sueldo Prop. Mes S/', width: '120px', align: 'right', render: (r) => <span className="font-mono">{Number(r.remuneracionMensualPendiente || 0).toFixed(2)}</span> },
    { key: 'vacTruncas', header: 'Vacac. Truncas S/', width: '115px', align: 'right', render: (r) => <span className="font-mono">{Number(r.vacacionesTruncas || 0).toFixed(2)}</span> },
    { key: 'ctsTrunca', header: 'CTS Trunca S/', width: '105px', align: 'right', render: (r) => <span className="font-mono">{Number(r.ctsTrunca || 0).toFixed(2)}</span> },
    {
      key: 'gratiTrunca',
      header: 'Grati. + Bonif. Trunca S/',
      width: '140px',
      align: 'right',
      render: (r) => <span className="font-mono">{(Number(r.gratificacionTrunca || 0) + Number(r.bonificacionExtraTrunca || 0)).toFixed(2)}</span>
    },
    { key: 'desc', header: 'Desc. Pensión S/', width: '110px', align: 'right', render: (r) => <span className="font-mono text-[#B91C1C]">- {Number(r.descuentoPensiones || 0).toFixed(2)}</span> },
    { key: 'neto', header: 'Neto Liquidación S/', width: '125px', align: 'right', render: (r) => <span className="font-mono font-bold text-[#1E6F42]">{Number(r.netoLiquidacion || 0).toFixed(2)}</span> },
    {
      key: 'pdf',
      header: 'Constancia PDF',
      width: '105px',
      align: 'center',
      render: (r) => (
        <button
          type="button"
          onClick={() =>
            exportarLiquidacionBeneficiosEstandarPdf({
              empresa: {
                ruc: empresaActiva?.ruc || '20601234567',
                razonSocial: empresaActiva?.razonSocial || 'ATLOB CONSULTORES S.A.C.'
              },
              liquidacion: r
            })
          }
          className="h-5 px-2 text-[10px] bg-[#1E3A5F] text-[#FFFFFF] font-bold inline-flex items-center gap-1"
        >
          <FileText className="w-3 h-3" />
          PDF LBS
        </button>
      )
    }
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Beneficios Sociales: Gratificaciones Legales, CTS y Liquidación de Beneficios (Vacaciones Truncas)"
        subtitulo="Ley N° 27735 / Ley N° 30334 (Gratificaciones Jul/Dic + Bonif. 9%), D.S. N° 001-97-TR (CTS May/Nov) y D. Leg. N° 713 (Vacaciones Truncas)"
        acciones={
          tabActiva === 'gratificaciones'
            ? [
                {
                  id: 'calc-grati',
                  label: 'Calcular Gratificaciones Semestre',
                  icono: Calculator,
                  primario: true,
                  onClick: handleCalcularGratificaciones
                },
                {
                  id: 'cont-grati',
                  label: 'Contabilizar Gratificaciones (6214/6215)',
                  icono: CheckCircle2,
                  disabled: gratificaciones.length === 0,
                  onClick: handleContabilizarGratificaciones
                }
              ]
            : tabActiva === 'cts'
            ? [
                {
                  id: 'calc-cts',
                  label: 'Calcular Depósito CTS Semestral',
                  icono: Calculator,
                  primario: true,
                  onClick: handleCalcularCts
                },
                {
                  id: 'cont-cts',
                  label: 'Contabilizar CTS (6291 vs 4151)',
                  icono: CheckCircle2,
                  disabled: listaCts.length === 0,
                  onClick: handleContabilizarCts
                }
              ]
            : [
                {
                  id: 'nueva-liq',
                  label: 'Calcular Liquidación por Cese (Vacaciones / CTS / Grati Truncas)',
                  icono: UserX,
                  primario: true,
                  onClick: () => {
                    if (trabajadores.length > 0 && !trabajadorIdLiq) {
                      setTrabajadorIdLiq(trabajadores[0].id);
                    }
                    setModalLiqAbierto(true);
                  }
                }
              ]
        }
      />

      {/* Sub-pestañas de Beneficios Sociales */}
      <div className="px-3 py-1.5 bg-[#E8ECF1] border-b border-[#D1D5DB] flex items-center justify-between text-[12px]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTabActiva('gratificaciones')}
            className={`h-6 px-3 font-bold inline-flex items-center gap-1 border ${
              tabActiva === 'gratificaciones'
                ? 'bg-[#FFFFFF] text-[#1D4ED8] border-[#1D4ED8]'
                : 'bg-[#F3F4F6] text-[#374151] border-[#D1D5DB]'
            }`}
          >
            <Gift className="w-3.5 h-3.5" />
            1. Gratificaciones (Julio y Diciembre + Bonif. 9%)
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('cts')}
            className={`h-6 px-3 font-bold inline-flex items-center gap-1 border ${
              tabActiva === 'cts'
                ? 'bg-[#FFFFFF] text-[#1D4ED8] border-[#1D4ED8]'
                : 'bg-[#F3F4F6] text-[#374151] border-[#D1D5DB]'
            }`}
          >
            <Landmark className="w-3.5 h-3.5" />
            2. CTS Semestral (Mayo y Noviembre)
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('liquidaciones')}
            className={`h-6 px-3 font-bold inline-flex items-center gap-1 border ${
              tabActiva === 'liquidaciones'
                ? 'bg-[#FFFFFF] text-[#1D4ED8] border-[#1D4ED8]'
                : 'bg-[#F3F4F6] text-[#374151] border-[#D1D5DB]'
            }`}
          >
            <UserX className="w-3.5 h-3.5" />
            3. Vacaciones Truncas y Liquidación de Beneficios (LBS)
          </button>
        </div>

        {tabActiva === 'gratificaciones' && (
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold">Semestre Gratificación:</label>
            <select
              value={periodoGrati}
              onChange={(e) => setPeriodoGrati(e.target.value)}
              className="h-6 px-2 font-mono text-[11px] border border-[#D1D5DB] bg-[#FFFFFF]"
            >
              <option value="2026-07">2026-07 — Fiestas Patrias (Julio)</option>
              <option value="2026-12">2026-12 — Navidad (Diciembre)</option>
            </select>
          </div>
        )}

        {tabActiva === 'cts' && (
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold">Semestre Depósito CTS:</label>
            <select
              value={periodoCts}
              onChange={(e) => setPeriodoCts(e.target.value)}
              className="h-6 px-2 font-mono text-[11px] border border-[#D1D5DB] bg-[#FFFFFF]"
            >
              <option value="2026-05">2026-05 — Semestre Nov–Abr (Depósito Mayo)</option>
              <option value="2026-11">2026-11 — Semestre May–Oct (Depósito Noviembre)</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        {tabActiva === 'gratificaciones' && (
          <TablaDensa columnas={columnasGrati} datos={gratificaciones} rowKey={(r) => r.id} />
        )}
        {tabActiva === 'cts' && (
          <TablaDensa columnas={columnasCts} datos={listaCts} rowKey={(r) => r.id} />
        )}
        {tabActiva === 'liquidaciones' && (
          <TablaDensa columnas={columnasLiq} datos={liquidaciones} rowKey={(r) => r.id} />
        )}
      </div>

      {/* MODAL CALCULAR LIQUIDACIÓN DE BENEFICIOS SOCIALES Y VACACIONES TRUNCAS */}
      <VentanaModal
        abierto={modalLiqAbierto}
        onCerrar={() => setModalLiqAbierto(false)}
        titulo="Emisión de Liquidación de Beneficios Sociales (Vacaciones Truncas, CTS Trunca y Gratificación Trunca)"
        ancho="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModalLiqAbierto(false)}
              className="h-6 px-3 text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleEmitirLiquidacion}
              disabled={calcularLiqMutation.isPending}
              className="h-6 px-3 text-[12px] bg-[#1D4ED8] text-[#FFFFFF] font-bold"
            >
              Calcular y Emitir LBS
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 text-[12px]">
          <div className="col-span-2">
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Seleccionar Trabajador</label>
            <select
              value={trabajadorIdLiq}
              onChange={(e) => setTrabajadorIdLiq(e.target.value)}
              className="w-full h-6 px-2 border border-[#D1D5DB] bg-[#FFFFFF]"
            >
              {trabajadores.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.numeroDocumento} — {t.apellidos}, {t.nombres} ({t.regimenLaboral} | S/ {Number(t.sueldoBase || 0).toFixed(2)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Fecha de Cese (Baja)</label>
            <input
              type="date"
              value={fechaCeseLiq}
              onChange={(e) => setFechaCeseLiq(e.target.value)}
              className="w-full h-6 px-2 font-mono border border-[#D1D5DB]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Motivo de Cese</label>
            <select
              value={motivoCeseLiq}
              onChange={(e) => setMotivoCeseLiq(e.target.value)}
              className="w-full h-6 px-2 border border-[#D1D5DB] bg-[#FFFFFF]"
            >
              <option value="RENUNCIA VOLUNTARIA">Renuncia Voluntaria</option>
              <option value="TERMINO DE CONTRATO">Término de Contrato</option>
              <option value="MUTUO DISENSO">Mutuo Disenso</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Días Vacaciones Pendientes</label>
            <input
              type="number"
              min={0}
              max={60}
              value={diasVacacionesPendientes}
              onChange={(e) => setDiasVacacionesPendientes(e.target.value)}
              className="w-full h-6 px-2 font-mono border border-[#D1D5DB]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Meses Gratificación Trunca</label>
            <input
              type="number"
              min={0}
              max={6}
              value={mesesGratiTruncos}
              onChange={(e) => setMesesGratiTruncos(e.target.value)}
              className="w-full h-6 px-2 font-mono border border-[#D1D5DB]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Meses CTS Trunca</label>
            <input
              type="number"
              min={0}
              max={6}
              value={mesesCtsTruncos}
              onChange={(e) => setMesesCtsTruncos(e.target.value)}
              className="w-full h-6 px-2 font-mono border border-[#D1D5DB]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] mb-0.5">Días CTS Trunca</label>
            <input
              type="number"
              min={0}
              max={30}
              value={diasCtsTruncos}
              onChange={(e) => setDiasCtsTruncos(e.target.value)}
              className="w-full h-6 px-2 font-mono border border-[#D1D5DB]"
            />
          </div>
        </div>
      </VentanaModal>
    </div>
  );
};
