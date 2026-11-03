import React, { useState, useEffect } from 'react';
import {
  Calculator,
  CheckCircle2,
  FileText,
  Printer,
  Sliders,
  Eye,
  BookOpen
} from 'lucide-react';
import { TrabajadorPlanilla } from '../../types';
import {
  useTrabajadores,
  usePlanillas,
  useCalcularPlanilla,
  useContabilizarPlanilla
} from '../../hooks/useTesoreriaPlanilla';
import { useToast } from '../../context/ToastContext';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { VentanaModal } from '../ui/VentanaModal';
import {
  exportarBoletaPagoEstandarPdf,
  exportarLoteBoletasPagoEstandarPdf,
  BoletaPagoPdfItem
} from '../../services/reports/formato_estandar/formatoEstandarEngine';

interface PlanillaPlameViewProps {
  empresaId?: string;
  periodo?: string;
  trabajadores?: TrabajadorPlanilla[];
}

export const PlanillaPlameView: React.FC<PlanillaPlameViewProps> = ({
  empresaId: propEmpresaId,
  periodo: propPeriodo
}) => {
  const { empresaActiva, periodo: ctxPeriodo } = useEmpresaPeriodo();
  const empresaId = propEmpresaId || empresaActiva?.id || '00000000-0000-0000-0000-000000000001';
  const [mesSeleccionado, setMesSeleccionado] = useState(propPeriodo || ctxPeriodo || '2026-09');
  const { success, error } = useToast();

  const { data: trabajadores = [] } = useTrabajadores(empresaId);
  const { data: planillasDelMes = [] } = usePlanillas(empresaId, mesSeleccionado);
  const calcularPlanillaMutation = useCalcularPlanilla(empresaId);
  const contabilizarPlanillaMutation = useContabilizarPlanilla(empresaId);

  const [planillaActual, setPlanillaActual] = useState<any>(null);
  const [modalNovedadesAbierto, setModalNovedadesAbierto] = useState(false);
  const [modalQuintaLinea, setModalQuintaLinea] = useState<any | null>(null);
  const [modalAsientoAbierto, setModalAsientoAbierto] = useState(false);

  // Estado de novedades del mes por trabajador (horas extras 25%/35%, faltas, tardanzas, bonos, adelantos)
  const [novedadesMap, setNovedadesMap] = useState<
    Record<
      string,
      {
        horasExtras25: number;
        horasExtras35: number;
        diasFaltas: number;
        minutosTardanza: number;
        bonificacionesGravadas: number;
        conceptosNoGravados: number;
        adelantosPrestamos: number;
      }
    >
  >({});

  useEffect(() => {
    if (planillasDelMes && planillasDelMes.length > 0 && planillasDelMes[0]) {
      setPlanillaActual(planillasDelMes[0]);
    }
  }, [planillasDelMes]);

  const obtenerNovedad = (trabId: string) => {
    return (
      novedadesMap[trabId] || {
        horasExtras25: 0,
        horasExtras35: 0,
        diasFaltas: 0,
        minutosTardanza: 0,
        bonificacionesGravadas: 0,
        conceptosNoGravados: 0,
        adelantosPrestamos: 0
      }
    );
  };

  const actualizarNovedad = (trabId: string, campo: string, valor: number) => {
    setNovedadesMap((prev) => ({
      ...prev,
      [trabId]: {
        ...obtenerNovedad(trabId),
        [campo]: Math.max(0, valor)
      }
    }));
  };

  const handleCalcularPlanilla = async () => {
    try {
      const listaNovedades = Object.entries(novedadesMap).map(([trabajadorId, nov]) => ({
        trabajadorId,
        ...nov
      }));
      const res = await calcularPlanillaMutation.mutateAsync({
        periodoId: `per-${mesSeleccionado}`,
        mes: mesSeleccionado,
        novedades: listaNovedades
      });
      setPlanillaActual(res);
      setModalNovedadesAbierto(false);
      success(
        `Planilla mensual ${mesSeleccionado} procesada con proyección de 5ta categoría y aportes ONP/AFP/EsSalud.`,
        'Planilla Calculada'
      );
    } catch (err: any) {
      error('Error al calcular planilla: ' + (err?.response?.data?.error || err.message), 'Error');
    }
  };

  const handleContabilizar = async () => {
    if (!planillaActual?.id) return;
    try {
      const res: any = await contabilizarPlanillaMutation.mutateAsync(planillaActual.id);
      setPlanillaActual((prev: any) => ({
        ...prev,
        estado: 'CONTABILIZADA',
        asientoId: res.asientoId,
        asientoNumero: res.asientoNumero
      }));
      success(
        `Asiento de planilla por centro de costos generado en Subdiario 08 (Voucher ${res.asientoNumero || res.asientoId}).`,
        'Asiento Contabilizado'
      );
    } catch (err: any) {
      error('Error al contabilizar planilla: ' + (err?.response?.data?.error || err.message), 'Error');
    }
  };

  const construirBoletaItem = (l: any): BoletaPagoPdfItem => {
    const trab = trabajadores.find((t: any) => t.id === l.trabajadorId);
    return {
      trabajadorNombre: l.trabajadorNombre,
      trabajadorDocumento: l.trabajadorDocumento,
      cargo: trab?.cargo || 'COLABORADOR',
      regimenLaboral: trab?.regimenLaboral || 'GENERAL',
      fechaIngreso: trab?.fechaIngreso || '2024-01-01',
      cuspp: trab?.cuspp,
      sistemaPensiones: l.sistemaPensiones,
      afpAdministradora: trab?.afpAdministradora,
      afpTipoComision: trab?.afpTipoComision,
      centroCosto: trab?.centroCosto || 'ADMINISTRACION',
      bancoSueldo: trab?.bancoSueldo,
      cuentaBancoSueldo: trab?.cuentaBancoSueldo,
      diasTrabajados: l.diasTrabajados || 30,
      diasFaltas: l.diasFaltas || 0,
      horasOrdinarias: l.horasOrdinarias || 240,
      horasExtras25: l.horasExtras25 || 0,
      horasExtras35: l.horasExtras35 || 0,
      sueldoBasico: l.sueldoBasico || 0,
      asignacionFamiliar: l.asignacionFamiliar || 0,
      montoHorasExtras25: l.montoHorasExtras25 || 0,
      montoHorasExtras35: l.montoHorasExtras35 || 0,
      bonificacionesGravadas: l.bonificacionesGravadas || 0,
      conceptosNoGravados: l.conceptosNoGravados || 0,
      totalRemuneracion: l.totalRemuneracion || 0,
      aporteObligatorioPension: l.aporteObligatorioPension || 0,
      comisionAfp: l.comisionAfp || 0,
      primaSeguroAfp: l.primaSeguroAfp || 0,
      retencionQuintaCategoria: l.retencionQuintaCategoria || 0,
      descuentoFaltasTardanzas: l.descuentoFaltasTardanzas || 0,
      adelantosPrestamos: l.adelantosPrestamos || 0,
      totalDescuentos: l.totalDescuentos || 0,
      aporteEssalud: l.aporteEssalud || 0,
      netoPagar: l.netoPagar || 0
    };
  };

  const lineasPlanilla = planillaActual?.lineas || [];

  // Resumen por Centro de Costos para el asiento contable (cuentas 62, 40, 41, 14 y destino 94/95/92 vs 79)
  const resumenCentroCostos = React.useMemo(() => {
    const mapa: Record<string, { cuentaDestino: string; remun: number; essalud: number; totalCosto: number }> = {};
    for (const l of lineasPlanilla) {
      const trab = trabajadores.find((t: any) => t.id === l.trabajadorId);
      const cc = (trab?.centroCosto || 'ADMINISTRACION').toUpperCase();
      const cuentaDestino = cc.includes('VENTA') || cc.includes('COMERC') ? '951' : cc.includes('PROD') || cc.includes('OPER') ? '921' : '941';
      if (!mapa[cc]) {
        mapa[cc] = { cuentaDestino, remun: 0, essalud: 0, totalCosto: 0 };
      }
      mapa[cc].remun += Number(l.totalRemuneracion || 0);
      mapa[cc].essalud += Number(l.aporteEssalud || 0);
      mapa[cc].totalCosto += Number(l.totalRemuneracion || 0) + Number(l.aporteEssalud || 0);
    }
    return Object.entries(mapa);
  }, [lineasPlanilla, trabajadores]);

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      {/* Aviso Normativo RMV */}
      <div className="bg-[#FEF3C7] border-b border-[#FCD34D] px-3 py-1.5 flex items-center justify-between text-[11px] text-[#92400E]">
        <div className="flex items-center gap-2">
          <span className="font-bold uppercase tracking-wider bg-[#F59E0B] text-white px-1.5 py-0.5 text-[10px]">Aviso Laboral</span>
          <span><strong>RMV segundo tramo pendiente de decreto:</strong> La RMV vigente desde 01/10/2026 es S/ 1,230.00 (D.S. 015-2026-TR). El segundo tramo (+70, hasta S/ 1,300.00) no tiene fecha de vigencia y permanece sin vigencia en el sistema.</span>
        </div>
      </div>

      <BarraHerramientasLocal
        titulo="Planilla Mensual de Remuneraciones"
        subtitulo="Remuneración proporcional por días, horas extras (25% / 35%), descuentos, ONP/AFP, EsSalud 9%, 5ta categoría proyectada y asiento por centro de costos"
        derecha={
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-[#374151]">Período:</label>
            <input
              type="month"
              value={mesSeleccionado}
              onChange={(e) => setMesSeleccionado(e.target.value)}
              className="h-6 px-2 font-mono text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]"
            />
          </div>
        }
        acciones={[
          {
            id: 'novedades-mes',
            label: 'Horas Extras / Faltas / Bonos',
            icono: Sliders,
            onClick: () => setModalNovedadesAbierto(true)
          },
          {
            id: 'calcular-planilla',
            label: calcularPlanillaMutation.isPending ? 'Calculando...' : 'Calcular Planilla Mensual',
            icono: Calculator,
            primario: true,
            onClick: handleCalcularPlanilla
          },
          ...(lineasPlanilla.length > 0
            ? [
                {
                  id: 'ver-asiento',
                  label: 'Asiento por C. Costos (62/40/41)',
                  icono: BookOpen,
                  onClick: () => setModalAsientoAbierto(true)
                },
                {
                  id: 'boletas-lote',
                  label: 'Imprimir Boletas PDF (Lote)',
                  icono: Printer,
                  onClick: () => {
                    exportarLoteBoletasPagoEstandarPdf({
                      empresa: {
                        ruc: empresaActiva?.ruc || '20601234567',
                        razonSocial: empresaActiva?.razonSocial || 'ATLOB CONSULTORES S.A.C.'
                      },
                      periodo: mesSeleccionado,
                      boletas: lineasPlanilla.map(construirBoletaItem)
                    });
                    success('Lote de Boletas de Pago exportado en Formato estándar Atlob.', 'Boletas PDF');
                  }
                }
              ]
            : [])
        ]}
      />

      {/* Resumen de totales de la planilla */}
      {planillaActual && (
        <div className="px-3 py-2 bg-[#F8FAFC] border-b border-[#D1D5DB] flex flex-wrap items-center justify-between gap-3 text-[12px]">
          <div className="flex flex-wrap items-center gap-5">
            <div>
              <span className="text-[#4B5563] text-[11px]">Total Ingresos (Cta. 6211): </span>
              <span className="font-mono font-bold text-[#111827]">
                S/ {Number(planillaActual.totalIngresos || 0).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[#4B5563] text-[11px]">Descuentos ONP/AFP/5ta (4032/407/40173): </span>
              <span className="font-mono font-bold text-[#B91C1C]">
                - S/ {Number(planillaActual.totalDescuentos || 0).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[#4B5563] text-[11px]">EsSalud Empleador 9% (6271 / 4031): </span>
              <span className="font-mono font-bold text-[#B45309]">
                S/ {Number(planillaActual.totalAportesEmpleador || 0).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[#4B5563] text-[11px]">Neto por Pagar (Cta. 4111): </span>
              <span className="font-mono font-bold text-[#1E6F42]">
                S/ {Number(planillaActual.totalNeto || 0).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 text-[10px] font-bold border ${
                planillaActual.estado === 'CONTABILIZADA'
                  ? 'bg-[#DCFCE7] text-[#166534] border-[#86EFAC]'
                  : 'bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]'
              }`}
            >
              {planillaActual.estado}
            </span>
            {planillaActual.estado !== 'CONTABILIZADA' ? (
              <button
                type="button"
                onClick={handleContabilizar}
                disabled={contabilizarPlanillaMutation.isPending}
                className="h-6 px-3 bg-[#1E6F42] hover:bg-[#165331] text-[#FFFFFF] text-[11px] font-bold inline-flex items-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Contabilizar Asiento (Subdiario 08)
              </button>
            ) : (
              <span className="font-mono text-[11px] font-bold text-[#1E6F42]">
                Voucher Subdiario 08 Registrado
              </span>
            )}
          </div>
        </div>
      )}

      {/* Grilla Densa de Planilla Mensual */}
      <div className="flex-1 p-3 overflow-auto">
        <table className="w-full text-left text-[11px] border border-[#D1D5DB] border-collapse">
          <thead className="bg-[#E8ECF1] text-[#111827] font-bold border-b border-[#D1D5DB]">
            <tr>
              <th className="py-1.5 px-2 border-r border-[#D1D5DB]">Doc.</th>
              <th className="py-1.5 px-2 border-r border-[#D1D5DB]">Trabajador / C. Costo</th>
              <th className="py-1.5 px-1.5 border-r border-[#D1D5DB] text-center">Días</th>
              <th className="py-1.5 px-2 border-r border-[#D1D5DB] text-right">Básico</th>
              <th className="py-1.5 px-2 border-r border-[#D1D5DB] text-right">Asig. Fam.</th>
              <th className="py-1.5 px-2 border-r border-[#D1D5DB] text-right">H. Extras</th>
              <th className="py-1.5 px-2 border-r border-[#D1D5DB] text-right">Bonos / Otros</th>
              <th className="py-1.5 px-2 border-r border-[#D1D5DB] text-right bg-[#EFF6FF]">Total Remun.</th>
              <th className="py-1.5 px-2 border-r border-[#D1D5DB] text-right">ONP / AFP</th>
              <th className="py-1.5 px-2 border-r border-[#D1D5DB] text-right">5ta Cat.</th>
              <th className="py-1.5 px-2 border-r border-[#D1D5DB] text-right">Faltas/Adel.</th>
              <th className="py-1.5 px-2 border-r border-[#D1D5DB] text-right">EsSalud 9%</th>
              <th className="py-1.5 px-2 border-r border-[#D1D5DB] text-right bg-[#F0FDF4]">Neto Pagar</th>
              <th className="py-1.5 px-2 text-center">Boleta / 5ta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {lineasPlanilla.length === 0 ? (
              <tr>
                <td colSpan={14} className="p-6 text-center text-[#6B7280] text-[12px]">
                  Pulse <strong>"Calcular Planilla Mensual"</strong> para procesar las remuneraciones, horas extras, retenciones ONP/AFP/5ta y EsSalud del período {mesSeleccionado}.
                </td>
              </tr>
            ) : (
              lineasPlanilla.map((l: any) => {
                const trab = trabajadores.find((t: any) => t.id === l.trabajadorId);
                const totalHe = Number(l.montoHorasExtras25 || 0) + Number(l.montoHorasExtras35 || 0);
                const totalBonos = Number(l.bonificacionesGravadas || 0) + Number(l.conceptosNoGravados || 0);
                const totalPension =
                  Number(l.aporteObligatorioPension || 0) +
                  Number(l.comisionAfp || 0) +
                  Number(l.primaSeguroAfp || 0);
                const otrosDesc = Number(l.descuentoFaltasTardanzas || 0) + Number(l.adelantosPrestamos || 0);

                return (
                  <tr key={l.id} className="hover:bg-[#F9FAFB]">
                    <td className="py-1 px-2 font-mono font-bold text-[#1E3A5F] border-r border-[#E5E7EB]">
                      {l.trabajadorDocumento}
                    </td>
                    <td className="py-1 px-2 border-r border-[#E5E7EB]">
                      <div className="font-bold text-[#111827]">{l.trabajadorNombre}</div>
                      <div className="text-[10px] text-[#4B5563]">
                        {l.sistemaPensiones} | C.C.: {trab?.centroCosto || 'ADMINISTRACION'}
                      </div>
                    </td>
                    <td className="py-1 px-1.5 text-center font-mono border-r border-[#E5E7EB]">
                      {l.diasTrabajados}d
                    </td>
                    <td className="py-1 px-2 text-right font-mono border-r border-[#E5E7EB]">
                      {Number(l.sueldoBasico || 0).toFixed(2)}
                    </td>
                    <td className="py-1 px-2 text-right font-mono border-r border-[#E5E7EB]">
                      {Number(l.asignacionFamiliar || 0) > 0 ? Number(l.asignacionFamiliar).toFixed(2) : '-'}
                    </td>
                    <td className="py-1 px-2 text-right font-mono border-r border-[#E5E7EB]">
                      {totalHe > 0 ? totalHe.toFixed(2) : '-'}
                    </td>
                    <td className="py-1 px-2 text-right font-mono border-r border-[#E5E7EB]">
                      {totalBonos > 0 ? totalBonos.toFixed(2) : '-'}
                    </td>
                    <td className="py-1 px-2 text-right font-mono font-bold text-[#1D4ED8] bg-[#EFF6FF]/50 border-r border-[#E5E7EB]">
                      {Number(l.totalRemuneracion || 0).toFixed(2)}
                    </td>
                    <td className="py-1 px-2 text-right font-mono text-[#B91C1C] border-r border-[#E5E7EB]">
                      {totalPension.toFixed(2)}
                    </td>
                    <td className="py-1 px-2 text-right font-mono text-[#B91C1C] font-bold border-r border-[#E5E7EB]">
                      {Number(l.retencionQuintaCategoria || 0) > 0
                        ? Number(l.retencionQuintaCategoria).toFixed(2)
                        : '0.00'}
                    </td>
                    <td className="py-1 px-2 text-right font-mono text-[#B91C1C] border-r border-[#E5E7EB]">
                      {otrosDesc > 0 ? otrosDesc.toFixed(2) : '-'}
                    </td>
                    <td className="py-1 px-2 text-right font-mono text-[#B45309] border-r border-[#E5E7EB]">
                      {Number(l.aporteEssalud || 0).toFixed(2)}
                    </td>
                    <td className="py-1 px-2 text-right font-mono font-bold text-[#1E6F42] bg-[#F0FDF4]/60 border-r border-[#E5E7EB]">
                      {Number(l.netoPagar || 0).toFixed(2)}
                    </td>
                    <td className="py-1 px-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setModalQuintaLinea(l)}
                          className="h-5 px-1.5 text-[10px] border border-[#D1D5DB] bg-[#FFFFFF] hover:bg-[#F3F4F6] inline-flex items-center gap-0.5"
                          title="Ver hoja de proyección anual de Renta de 5ta Categoría"
                        >
                          <Eye className="w-3 h-3 text-[#1D4ED8]" />
                          5ta
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            exportarBoletaPagoEstandarPdf({
                              empresa: {
                                ruc: empresaActiva?.ruc || '20601234567',
                                razonSocial: empresaActiva?.razonSocial || 'ATLOB CONSULTORES S.A.C.'
                              },
                              periodo: mesSeleccionado,
                              boleta: construirBoletaItem(l)
                            });
                          }}
                          className="h-5 px-1.5 text-[10px] border border-[#1E3A5F] bg-[#1E3A5F] text-[#FFFFFF] hover:bg-[#162C49] inline-flex items-center gap-0.5"
                          title="Descargar Boleta de Pago PDF en Formato estándar Atlob"
                        >
                          <FileText className="w-3 h-3" />
                          PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL DE NOVEDADES MENSUALES (HORAS EXTRAS 25% Y 35%, FALTAS, TARDANZAS, BONOS, ADELANTOS) */}
      <VentanaModal
        abierto={modalNovedadesAbierto}
        onCerrar={() => setModalNovedadesAbierto(false)}
        titulo={`Ingreso de Novedades Variables del Período ${mesSeleccionado} (Sobretiempo, Inasistencias, Bonificaciones y Adelantos)`}
        ancho="xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModalNovedadesAbierto(false)}
              className="h-6 px-3 text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleCalcularPlanilla}
              className="h-6 px-3 text-[12px] border border-[#1D4ED8] bg-[#1D4ED8] text-[#FFFFFF] font-bold"
            >
              Aplicar y Recalcular Planilla
            </button>
          </>
        }
      >
        <div className="space-y-2 text-[11px]">
          <p className="text-[#4B5563]">
            Registre las horas extras (25% primeras 2 horas, 35% adicionales según D.S. 007-2002-TR), días de falta injustificada, minutos de tardanza, bonificaciones gravadas (recalculan la proyección de 5ta categoría en el mes) y adelantos de sueldo.
          </p>
          <div className="max-h-80 overflow-auto border border-[#D1D5DB]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#E8ECF1] text-[#111827] border-b border-[#D1D5DB]">
                <tr>
                  <th className="py-1 px-2 border-r border-[#D1D5DB]">Trabajador</th>
                  <th className="py-1 px-2 border-r border-[#D1D5DB] text-right">Básico S/</th>
                  <th className="py-1 px-2 border-r border-[#D1D5DB] text-center">H. Extras 25%</th>
                  <th className="py-1 px-2 border-r border-[#D1D5DB] text-center">H. Extras 35%</th>
                  <th className="py-1 px-2 border-r border-[#D1D5DB] text-center">Días Falta</th>
                  <th className="py-1 px-2 border-r border-[#D1D5DB] text-center">Min. Tardanza</th>
                  <th className="py-1 px-2 border-r border-[#D1D5DB] text-center">Bonif. Gravada S/</th>
                  <th className="py-1 px-2 text-center">Adelantos S/</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {trabajadores.map((t: any) => {
                  const nov = obtenerNovedad(t.id);
                  return (
                    <tr key={t.id}>
                      <td className="py-1 px-2 font-bold border-r border-[#E5E7EB]">
                        {t.apellidos}, {t.nombres} ({t.numeroDocumento})
                      </td>
                      <td className="py-1 px-2 text-right font-mono border-r border-[#E5E7EB]">
                        {Number(t.sueldoBase || 0).toFixed(2)}
                      </td>
                      <td className="py-1 px-2 border-r border-[#E5E7EB]">
                        <input
                          type="number"
                          min={0}
                          step="0.5"
                          value={nov.horasExtras25}
                          onChange={(e) => actualizarNovedad(t.id, 'horasExtras25', parseFloat(e.target.value) || 0)}
                          className="w-16 h-5 px-1 font-mono text-right border border-[#D1D5DB]"
                        />
                      </td>
                      <td className="py-1 px-2 border-r border-[#E5E7EB]">
                        <input
                          type="number"
                          min={0}
                          step="0.5"
                          value={nov.horasExtras35}
                          onChange={(e) => actualizarNovedad(t.id, 'horasExtras35', parseFloat(e.target.value) || 0)}
                          className="w-16 h-5 px-1 font-mono text-right border border-[#D1D5DB]"
                        />
                      </td>
                      <td className="py-1 px-2 border-r border-[#E5E7EB]">
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={nov.diasFaltas}
                          onChange={(e) => actualizarNovedad(t.id, 'diasFaltas', parseInt(e.target.value, 10) || 0)}
                          className="w-14 h-5 px-1 font-mono text-right border border-[#D1D5DB]"
                        />
                      </td>
                      <td className="py-1 px-2 border-r border-[#E5E7EB]">
                        <input
                          type="number"
                          min={0}
                          value={nov.minutosTardanza}
                          onChange={(e) => actualizarNovedad(t.id, 'minutosTardanza', parseInt(e.target.value, 10) || 0)}
                          className="w-16 h-5 px-1 font-mono text-right border border-[#D1D5DB]"
                        />
                      </td>
                      <td className="py-1 px-2 border-r border-[#E5E7EB]">
                        <input
                          type="number"
                          min={0}
                          step="10"
                          value={nov.bonificacionesGravadas}
                          onChange={(e) => actualizarNovedad(t.id, 'bonificacionesGravadas', parseFloat(e.target.value) || 0)}
                          className="w-20 h-5 px-1 font-mono text-right border border-[#D1D5DB]"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          min={0}
                          step="10"
                          value={nov.adelantosPrestamos}
                          onChange={(e) => actualizarNovedad(t.id, 'adelantosPrestamos', parseFloat(e.target.value) || 0)}
                          className="w-20 h-5 px-1 font-mono text-right border border-[#D1D5DB]"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </VentanaModal>

      {/* MODAL DETALLE PROYECCIÓN ANUAL DE 5TA CATEGORÍA (ART. 40° RGTO. LIR) */}
      <VentanaModal
        abierto={Boolean(modalQuintaLinea)}
        onCerrar={() => setModalQuintaLinea(null)}
        titulo="Hoja de Trabajo — Retención de Renta de 5ta Categoría con Proyección Anual (Art. 40° Rgto. LIR)"
        ancho="md"
        footer={
          <button
            type="button"
            onClick={() => setModalQuintaLinea(null)}
            className="h-6 px-3 text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]"
          >
            Cerrar
          </button>
        }
      >
        {modalQuintaLinea && (
          <div className="space-y-2 text-[12px]">
            <div className="p-2 bg-[#F8FAFC] border border-[#D1D5DB]">
              <strong>Trabajador:</strong> {modalQuintaLinea.trabajadorNombre} (DNI: {modalQuintaLinea.trabajadorDocumento})
              <span className="block text-[11px] text-[#4B5563]">
                Período: {mesSeleccionado} | Escala progresiva acumulativa: 8% (hasta 5 UIT), 14% (5–20 UIT), 17% (20–35 UIT), 20% (35–45 UIT), 30% (&gt;45 UIT) tras deducir 7 UIT.
              </span>
            </div>
            {modalQuintaLinea.proyeccionQuinta ? (
              <table className="w-full text-[11px] border border-[#D1D5DB] border-collapse">
                <tbody>
                  <tr className="border-b border-[#E5E7EB]">
                    <td className="py-1 px-2">1. Remuneración Bruta Anual Proyectada (Inc. Gratificaciones Jul/Dic + Variables)</td>
                    <td className="py-1 px-2 text-right font-mono font-bold">
                      S/ {Number(modalQuintaLinea.proyeccionQuinta.remuneracionBrutaAnualProyectada || 0).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="border-b border-[#E5E7EB]">
                    <td className="py-1 px-2">2. (-) Deducción Legal de 7 UIT (Inafecto Art. 46° LIR)</td>
                    <td className="py-1 px-2 text-right font-mono text-[#1E6F42]">
                      - S/ {Number(modalQuintaLinea.proyeccionQuinta.deduccion7Uit || 0).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="border-b border-[#E5E7EB] bg-[#EFF6FF]">
                    <td className="py-1 px-2 font-bold">3. Renta Neta Anual de Quinta Categoría Afecta</td>
                    <td className="py-1 px-2 text-right font-mono font-bold text-[#1D4ED8]">
                      S/ {Number(modalQuintaLinea.proyeccionQuinta.rentaNetaAnualQuinta || 0).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="border-b border-[#E5E7EB]">
                    <td className="py-1 px-2">4. Impuesto Anual Proyectado según Escala Progresiva (8% al 30%)</td>
                    <td className="py-1 px-2 text-right font-mono font-bold">
                      S/ {Number(modalQuintaLinea.proyeccionQuinta.impuestoAnualProyectado || 0).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="border-b border-[#E5E7EB]">
                    <td className="py-1 px-2">5. Divisor Oficial del Mes (Art. 40° Rgto. LIR)</td>
                    <td className="py-1 px-2 text-right font-mono">
                      ÷ {modalQuintaLinea.proyeccionQuinta.divisorMes}
                    </td>
                  </tr>
                  <tr className="bg-[#FEF2F2]">
                    <td className="py-1.5 px-2 font-bold text-[#991B1B]">
                      6. RETENCIÓN MENSUAL DE 5TA CATEGORÍA (CÓD. PLAME 0605)
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono font-bold text-[#991B1B]">
                      S/ {Number(modalQuintaLinea.retencionQuintaCategoria || 0).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="p-3 text-center text-[#6B7280]">
                Retención del período: S/ {Number(modalQuintaLinea.retencionQuintaCategoria || 0).toFixed(2)}
              </div>
            )}
          </div>
        )}
      </VentanaModal>

      {/* MODAL PREVISUALIZACIÓN DEL ASIENTO DE PLANILLA POR CENTRO DE COSTOS */}
      <VentanaModal
        abierto={modalAsientoAbierto}
        onCerrar={() => setModalAsientoAbierto(false)}
        titulo={`Asiento Contable de Planilla por Centro de Costos — Subdiario 08 (${mesSeleccionado})`}
        ancho="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModalAsientoAbierto(false)}
              className="h-6 px-3 text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]"
            >
              Cerrar
            </button>
            {planillaActual?.estado !== 'CONTABILIZADA' && (
              <button
                type="button"
                onClick={() => {
                  setModalAsientoAbierto(false);
                  handleContabilizar();
                }}
                className="h-6 px-3 text-[12px] border border-[#1E6F42] bg-[#1E6F42] text-[#FFFFFF] font-bold"
              >
                Contabilizar en Libro Diario
              </button>
            )}
          </>
        }
      >
        <div className="space-y-3 text-[11px]">
          <div className="p-2 bg-[#F8FAFC] border border-[#D1D5DB]">
            <strong>Distribución por Centro de Costos (PCGE 2019 Modificado):</strong> Cuenta 62 (Gastos de Personal), Cuenta 40 (Tributos y Aportes ONP/EsSalud/5ta), Cuenta 407/45 (AFP por Pagar), Cuenta 14 (Adelantos) y Cuenta 41 (Remuneraciones por Pagar) con asiento automático de destino (941 / 951 / 921 vs 791).
          </div>
          <table className="w-full text-left border border-[#D1D5DB] border-collapse">
            <thead className="bg-[#E8ECF1] font-bold border-b border-[#D1D5DB]">
              <tr>
                <th className="py-1 px-2 border-r border-[#D1D5DB]">Centro de Costo</th>
                <th className="py-1 px-2 border-r border-[#D1D5DB]">Cuenta Destino</th>
                <th className="py-1 px-2 border-r border-[#D1D5DB] text-right">6211 Remuneraciones</th>
                <th className="py-1 px-2 border-r border-[#D1D5DB] text-right">6271 EsSalud 9%</th>
                <th className="py-1 px-2 text-right">Total Cargo a C. Costo (Debe)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {resumenCentroCostos.map(([cc, datos]) => (
                <tr key={cc}>
                  <td className="py-1 px-2 font-mono font-bold border-r border-[#E5E7EB]">{cc}</td>
                  <td className="py-1 px-2 font-mono border-r border-[#E5E7EB]">
                    {datos.cuentaDestino} vs 791
                  </td>
                  <td className="py-1 px-2 text-right font-mono border-r border-[#E5E7EB]">
                    S/ {datos.remun.toFixed(2)}
                  </td>
                  <td className="py-1 px-2 text-right font-mono border-r border-[#E5E7EB]">
                    S/ {datos.essalud.toFixed(2)}
                  </td>
                  <td className="py-1 px-2 text-right font-mono font-bold text-[#1D4ED8]">
                    S/ {datos.totalCosto.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </VentanaModal>
    </div>
  );
};
