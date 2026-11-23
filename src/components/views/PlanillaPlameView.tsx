import React, { useState, useEffect, useMemo } from 'react';
import {
  Calculator,
  CheckCircle2,
  FileText,
  Printer,
  Sliders,
  Eye,
  BookOpen,
  Edit3,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { TrabajadorPlanilla } from '../../types';
import {
  useTrabajadores,
  usePlanillas,
  useCalcularPlanilla,
  useActualizarPlanillaLineas,
  useContabilizarPlanilla,
  useAnularPlanilla
} from '../../hooks/useTesoreriaPlanilla';
import { tesoreriaPlanillaApi } from '../../api/tesoreriaPlanillaApi';
import { useToast } from '../../context/ToastContext';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { VentanaModal } from '../ui/VentanaModal';
import { SelectorCuentaContable } from '../common/SelectorCuentaContable';
import { buscarCuentaPCGE } from '../../data/pcgeAccounts';
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

interface LineaAsientoEditable {
  id: string;
  codigoCuenta: string;
  denominacionCuenta: string;
  centroCostoId?: string;
  glosa: string;
  debe: number;
  haber: number;
}

const redondear2 = (n: number) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

export const PlanillaPlameView: React.FC<PlanillaPlameViewProps> = ({
  empresaId: propEmpresaId,
  periodo: propPeriodo
}) => {
  const { empresaActiva, periodo: ctxPeriodo } = useEmpresaPeriodo();
  const empresaId = propEmpresaId || empresaActiva?.id || '00000000-0000-0000-0000-000000000001';
  const [mesSeleccionado, setMesSeleccionado] = useState(propPeriodo || ctxPeriodo || '2026-09');
  const { success, error, warning } = useToast();

  useEffect(() => {
    const nuevoMes = propPeriodo || ctxPeriodo;
    if (nuevoMes) setMesSeleccionado(nuevoMes);
  }, [propPeriodo, ctxPeriodo]);

  const { data: trabajadores = [] } = useTrabajadores(empresaId);
  const { data: planillasDelMes = [], refetch: refetchPlanillas } = usePlanillas(empresaId, mesSeleccionado);
  const calcularPlanillaMutation = useCalcularPlanilla(empresaId);
  const actualizarLineasMutation = useActualizarPlanillaLineas(empresaId);
  const contabilizarPlanillaMutation = useContabilizarPlanilla(empresaId);
  const anularPlanillaMutation = useAnularPlanilla(empresaId);

  const [planillaActual, setPlanillaActual] = useState<any>(null);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [lineasBorrador, setLineasBorrador] = useState<any[]>([]);
  const [modalNovedadesAbierto, setModalNovedadesAbierto] = useState(false);
  const [modalQuintaLinea, setModalQuintaLinea] = useState<any | null>(null);
  const [modalAsientoAbierto, setModalAsientoAbierto] = useState(false);
  const [modalReabrirAbierto, setModalReabrirAbierto] = useState(false);
  const [motivoReapertura, setMotivoReapertura] = useState('Ajuste de montos o cuentas contables de planilla');

  // Estado del editor del asiento contable
  const [asientoFecha, setAsientoFecha] = useState(`${mesSeleccionado}-28`);
  const [asientoSubdiario, setAsientoSubdiario] = useState('07');
  const [asientoGlosa, setAsientoGlosa] = useState(`Planilla de sueldos y aportes patronales por centro de costos - ${mesSeleccionado}`);
  const [asientoLineas, setAsientoLineas] = useState<LineaAsientoEditable[]>([]);
  const [cargandoPropuesta, setCargandoPropuesta] = useState(false);

  // Estado de novedades del mes por trabajador
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
    setModoEdicion(false);
    setLineasBorrador([]);
    if (planillasDelMes && planillasDelMes.length > 0 && planillasDelMes[0]) {
      setPlanillaActual(planillasDelMes[0]);
    } else {
      setPlanillaActual(null);
    }
  }, [planillasDelMes, mesSeleccionado, empresaId]);

  const recalcularLinea = (l: any) => {
    const basico = redondear2(Math.max(0, Number(l.sueldoBasico || 0)));
    const asig = redondear2(Math.max(0, Number(l.asignacionFamiliar || 0)));
    const he = redondear2(Math.max(0, Number(l.horasExtras ?? (Number(l.montoHorasExtras25 || 0) + Number(l.montoHorasExtras35 || 0)))));
    const bonosGrav = redondear2(Math.max(0, Number(l.bonificacionesGravadas ?? l.otrosIngresos ?? 0)));
    const noGrav = redondear2(Math.max(0, Number(l.conceptosNoGravados || 0)));
    const faltas = redondear2(Math.max(0, Number(l.descuentoFaltasTardanzas || 0)));
    const totalRemun = redondear2(Math.max(0, basico + asig + he + bonosGrav - faltas) + noGrav);

    const pension = redondear2(Math.max(0, Number(l.aporteObligatorioPension || 0)));
    const comision = redondear2(Math.max(0, Number(l.comisionAfp || 0)));
    const seguro = redondear2(Math.max(0, Number(l.primaSeguroAfp || 0)));
    const quinta = redondear2(Math.max(0, Number(l.retencionQuinta ?? l.retencionQuintaCategoria ?? 0)));
    const adel = redondear2(Math.max(0, Number(l.adelantosPrestamos || 0)));
    const otrosDescExtra = redondear2(Math.max(0, Number(l._extraOtrosDesc || 0)));
    const otrosDescTotal = redondear2(adel + otrosDescExtra);

    const totalDesc = redondear2(pension + comision + seguro + quinta + otrosDescTotal);
    const essalud = redondear2(Math.max(0, Number(l.aporteEssalud || 0)));
    const neto = redondear2(totalRemun - totalDesc);

    return {
      ...l,
      horasExtras: he,
      montoHorasExtras25: he,
      montoHorasExtras35: 0,
      bonificacionesGravadas: bonosGrav,
      otrosIngresos: bonosGrav,
      conceptosNoGravados: noGrav,
      descuentoFaltasTardanzas: faltas,
      totalRemuneracion: totalRemun,
      retencionQuinta: quinta,
      retencionQuintaCategoria: quinta,
      adelantosPrestamos: adel,
      otrosDescuentos: otrosDescTotal,
      totalDescuentos: totalDesc,
      aporteEssalud: essalud,
      netoPagar: neto
    };
  };

  const iniciarEdicion = () => {
    if (!planillaActual?.lineas?.length) return;
    if (planillaActual.estado === 'CONTABILIZADA' || planillaActual.estado === 'PAGADA') {
      warning('Debe anular/reabrir la planilla antes de modificar los montos.', 'Planilla Contabilizada');
      return;
    }
    const clon = planillaActual.lineas.map((l: any) => {
      const adel = Number(l.adelantosPrestamos || 0);
      const totOtros = Number(l.otrosDescuentos || 0);
      return recalcularLinea({
        ...l,
        diasLaborados: Number(l.diasLaborados ?? l.diasTrabajados ?? 30),
        horasExtras: Number(l.horasExtras ?? (Number(l.montoHorasExtras25 || 0) + Number(l.montoHorasExtras35 || 0))),
        bonificacionesGravadas: Number(l.bonificacionesGravadas ?? l.otrosIngresos ?? 0),
        retencionQuinta: Number(l.retencionQuinta ?? l.retencionQuintaCategoria ?? 0),
        _extraOtrosDesc: Math.max(0, redondear2(totOtros - adel))
      });
    });
    setLineasBorrador(clon);
    setModoEdicion(true);
  };

  const actualizarCampoBorrador = (lineaId: string, campo: string, valor: any) => {
    setLineasBorrador((prev) =>
      prev.map((l) => {
        if (l.id !== lineaId) return l;
        const actualizado = { ...l, [campo]: valor };
        if (campo === 'diasLaborados') {
          const d = Math.max(0, Math.min(30, Math.round(Number(valor) || 0)));
          actualizado.diasLaborados = d;
          actualizado.diasTrabajados = d;
        }
        return recalcularLinea(actualizado);
      })
    );
  };

  const handleGuardarEdicion = async () => {
    if (!planillaActual?.id || lineasBorrador.length === 0) return;
    const invalida = lineasBorrador.find((l) => l.netoPagar < 0);
    if (invalida) {
      error(`El neto a pagar de ${invalida.trabajadorNombre} no puede ser negativo.`, 'Validación');
      return;
    }
    try {
      const payload = lineasBorrador.map((l) => ({
        id: l.id,
        trabajadorId: l.trabajadorId,
        diasLaborados: Number(l.diasLaborados ?? 30),
        sueldoBasico: Number(l.sueldoBasico || 0),
        asignacionFamiliar: Number(l.asignacionFamiliar || 0),
        horasExtras: Number(l.horasExtras || 0),
        bonificacionesGravadas: Number(l.bonificacionesGravadas || 0),
        conceptosNoGravados: Number(l.conceptosNoGravados || 0),
        descuentoFaltasTardanzas: Number(l.descuentoFaltasTardanzas || 0),
        aporteObligatorioPension: Number(l.aporteObligatorioPension || 0),
        comisionAfp: Number(l.comisionAfp || 0),
        primaSeguroAfp: Number(l.primaSeguroAfp || 0),
        retencionQuinta: Number(l.retencionQuinta || 0),
        adelantosPrestamos: Number(l.adelantosPrestamos || 0),
        otrosDescuentos: Number(l.otrosDescuentos || 0),
        aporteEssalud: Number(l.aporteEssalud || 0),
        centroCosto: String(l.centroCosto || 'ADMINISTRACION').toUpperCase()
      }));
      const actualizada = await actualizarLineasMutation.mutateAsync({
        planillaId: planillaActual.id,
        lineas: payload
      });
      setPlanillaActual(actualizada);
      setModoEdicion(false);
      setLineasBorrador([]);
      success('Montos de planilla actualizados y guardados en PostgreSQL.', 'Planilla Actualizada');
    } catch (err: any) {
      error('Error al guardar cambios: ' + (err?.response?.data?.error || err.message), 'Error');
    }
  };

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
      setModoEdicion(false);
      setModalNovedadesAbierto(false);
      success(
        `Planilla mensual ${mesSeleccionado} procesada con proyección de 5ta categoría y aportes ONP/AFP/EsSalud.`,
        'Planilla Calculada'
      );
    } catch (err: any) {
      error('Error al calcular planilla: ' + (err?.response?.data?.error || err.message), 'Error');
    }
  };

  const construirPropuestaLocalFallback = (lineasSrc: any[]): LineaAsientoEditable[] => {
    const porCc = new Map<string, any[]>();
    for (const l of lineasSrc) {
      const trab = trabajadores.find((t: any) => t.id === l.trabajadorId);
      const cc = String(l.centroCosto || trab?.centroCosto || 'ADMINISTRACION').toUpperCase();
      if (!porCc.has(cc)) porCc.set(cc, []);
      porCc.get(cc)!.push(l);
    }
    const resultado: LineaAsientoEditable[] = [];
    let idx = 1;
    let totalDest = 0;
    const dests: Array<{ cc: string; cuenta: string; monto: number }> = [];
    for (const [cc, items] of porCc.entries()) {
      const rem = redondear2(items.reduce((s, x) => s + Number(x.totalRemuneracion || 0), 0));
      const ess = redondear2(items.reduce((s, x) => s + Number(x.aporteEssalud || 0), 0));
      if (rem > 0) {
        resultado.push({
          id: `prop-${idx++}`,
          codigoCuenta: '6211',
          denominacionCuenta: buscarCuentaPCGE('6211')?.nombre || 'Sueldos y salarios',
          centroCostoId: cc,
          glosa: `Remuneraciones del personal - CC: ${cc} (${mesSeleccionado})`,
          debe: rem,
          haber: 0
        });
      }
      if (ess > 0) {
        resultado.push({
          id: `prop-${idx++}`,
          codigoCuenta: '6271',
          denominacionCuenta: buscarCuentaPCGE('6271')?.nombre || 'Régimen de prestaciones de salud',
          centroCostoId: cc,
          glosa: `Aporte patronal EsSalud 9% - CC: ${cc} (${mesSeleccionado})`,
          debe: ess,
          haber: 0
        });
      }
      const sub = redondear2(rem + ess);
      totalDest = redondear2(totalDest + sub);
      const cta9 = cc.includes('VENTA') || cc.includes('COMERC') ? '951' : cc.includes('PROD') || cc.includes('OPER') || cc.includes('PLANTA') ? '921' : '941';
      dests.push({ cc, cuenta: cta9, monto: sub });
    }
    const totEss = redondear2(lineasSrc.reduce((s, x) => s + Number(x.aporteEssalud || 0), 0));
    const totOnp = redondear2(lineasSrc.filter((x) => (x.sistemaPensiones || 'ONP') === 'ONP').reduce((s, x) => s + Number(x.aporteObligatorioPension || 0), 0));
    const totAfp = redondear2(lineasSrc.filter((x) => x.sistemaPensiones === 'AFP').reduce((s, x) => s + Number(x.aporteObligatorioPension || 0) + Number(x.comisionAfp || 0) + Number(x.primaSeguroAfp || 0), 0));
    const tot5ta = redondear2(lineasSrc.reduce((s, x) => s + Number(x.retencionQuinta ?? x.retencionQuintaCategoria ?? 0), 0));
    const totOtros = redondear2(lineasSrc.reduce((s, x) => s + Number(x.otrosDescuentos || 0), 0));
    const totNeto = redondear2(lineasSrc.reduce((s, x) => s + Number(x.netoPagar || 0), 0));
    if (totEss > 0) resultado.push({ id: `prop-${idx++}`, codigoCuenta: '4031', denominacionCuenta: buscarCuentaPCGE('4031')?.nombre || 'EsSalud', glosa: `EsSalud 9% por pagar - ${mesSeleccionado}`, debe: 0, haber: totEss });
    if (totOnp > 0) resultado.push({ id: `prop-${idx++}`, codigoCuenta: '4032', denominacionCuenta: buscarCuentaPCGE('4032')?.nombre || 'ONP', glosa: `ONP 13% por pagar - ${mesSeleccionado}`, debe: 0, haber: totOnp });
    if (totAfp > 0) resultado.push({ id: `prop-${idx++}`, codigoCuenta: '407', denominacionCuenta: buscarCuentaPCGE('407')?.nombre || 'Administradoras de fondos de pensiones', glosa: `AFP por pagar - ${mesSeleccionado}`, debe: 0, haber: totAfp });
    if (tot5ta > 0) resultado.push({ id: `prop-${idx++}`, codigoCuenta: '40173', denominacionCuenta: buscarCuentaPCGE('40173')?.nombre || 'Renta de quinta categoría', glosa: `Retención 5ta categoría - ${mesSeleccionado}`, debe: 0, haber: tot5ta });
    if (totOtros > 0) resultado.push({ id: `prop-${idx++}`, codigoCuenta: '1411', denominacionCuenta: buscarCuentaPCGE('1411')?.nombre || 'Préstamos al personal', glosa: `Adelantos y descuentos al personal - ${mesSeleccionado}`, debe: 0, haber: totOtros });
    if (totNeto > 0) resultado.push({ id: `prop-${idx++}`, codigoCuenta: '4111', denominacionCuenta: buscarCuentaPCGE('4111')?.nombre || 'Sueldos y salarios por pagar', glosa: `Remuneraciones netas por pagar - ${mesSeleccionado}`, debe: 0, haber: totNeto });
    for (const d of dests) {
      if (d.monto > 0) resultado.push({ id: `prop-${idx++}`, codigoCuenta: d.cuenta, denominacionCuenta: buscarCuentaPCGE(d.cuenta)?.nombre || 'Gastos por función', centroCostoId: d.cc, glosa: `Destino de planilla CC ${d.cc}`, debe: d.monto, haber: 0 });
    }
    if (totalDest > 0) resultado.push({ id: `prop-${idx++}`, codigoCuenta: '791', denominacionCuenta: buscarCuentaPCGE('791')?.nombre || 'Cargas imputables a cuentas de costos y gastos', glosa: `Cargas imputables - Planilla ${mesSeleccionado}`, debe: 0, haber: totalDest });
    return resultado;
  };

  const abrirEditorAsiento = async () => {
    if (!planillaActual?.id) return;
    if (modoEdicion) {
      warning('Guarde o descarte los cambios de montos en la grilla antes de abrir el editor de asiento.', 'Edición Activa');
      return;
    }
    setModalAsientoAbierto(true);
    setCargandoPropuesta(true);
    try {
      const prop = await tesoreriaPlanillaApi.obtenerPropuestaAsientoPlanilla(empresaId, planillaActual.id);
      setAsientoFecha(prop.fecha || `${mesSeleccionado}-28`);
      setAsientoSubdiario(prop.subdiario || '07');
      setAsientoGlosa(prop.glosa || `Planilla de sueldos y aportes patronales por centro de costos - ${mesSeleccionado}`);
      setAsientoLineas(
        (prop.lineas || []).map((l: any, idx: number) => ({
          id: `lin-${idx}-${Date.now()}`,
          codigoCuenta: String(l.codigoCuenta || ''),
          denominacionCuenta: l.denominacionCuenta || buscarCuentaPCGE(String(l.codigoCuenta || ''))?.nombre || '',
          centroCostoId: l.centroCostoId || '',
          glosa: l.glosa || '',
          debe: Number(l.debe || 0),
          haber: Number(l.haber || 0)
        }))
      );
    } catch {
      setAsientoFecha(`${mesSeleccionado}-28`);
      setAsientoSubdiario('07');
      setAsientoGlosa(`Planilla de sueldos y aportes patronales por centro de costos - ${mesSeleccionado}`);
      setAsientoLineas(construirPropuestaLocalFallback(planillaActual.lineas || []));
    } finally {
      setCargandoPropuesta(false);
    }
  };

  const totalesAsientoEditor = useMemo(() => {
    const totalDebe = redondear2(asientoLineas.reduce((s, l) => s + Number(l.debe || 0), 0));
    const totalHaber = redondear2(asientoLineas.reduce((s, l) => s + Number(l.haber || 0), 0));
    const diferencia = redondear2(Math.abs(totalDebe - totalHaber));
    const lineasValidas = asientoLineas.length >= 2 && asientoLineas.every(
      (l) => l.codigoCuenta.trim().length > 0 && ((l.debe > 0 && l.haber === 0) || (l.haber > 0 && l.debe === 0))
    );
    return {
      totalDebe,
      totalHaber,
      diferencia,
      cuadrado: diferencia < 0.01 && totalDebe > 0 && lineasValidas
    };
  }, [asientoLineas]);

  const handleContabilizar = async (conAsientoEditor = false) => {
    if (!planillaActual?.id) return;
    if (modoEdicion) {
      warning('Guarde o descarte los cambios de montos antes de contabilizar.', 'Edición Activa');
      return;
    }
    try {
      const payload = conAsientoEditor
        ? {
            fecha: asientoFecha,
            subdiario: asientoSubdiario,
            glosa: asientoGlosa,
            lineas: asientoLineas.map((l) => ({
              codigoCuenta: l.codigoCuenta.trim(),
              debe: redondear2(l.debe),
              haber: redondear2(l.haber),
              glosa: l.glosa.trim() || asientoGlosa,
              centroCostoId: l.centroCostoId?.trim() || undefined
            }))
          }
        : undefined;

      const res: any = await contabilizarPlanillaMutation.mutateAsync(
        payload ? { planillaId: planillaActual.id, payload } : planillaActual.id
      );
      setPlanillaActual((prev: any) => ({
        ...prev,
        estado: 'CONTABILIZADA',
        asientoId: res.asientoId,
        asientoNumero: res.asientoNumero
      }));
      setModalAsientoAbierto(false);
      success(
        `Asiento de planilla por centro de costos generado en Subdiario ${asientoSubdiario} (Voucher ${res.asientoNumero || res.asientoId}).`,
        'Asiento Contabilizado'
      );
    } catch (err: any) {
      error('Error al contabilizar planilla: ' + (err?.response?.data?.error || err.message), 'Error');
    }
  };

  const handleAnularYReabrir = async () => {
    if (!planillaActual?.id) return;
    try {
      await anularPlanillaMutation.mutateAsync({
        planillaId: planillaActual.id,
        motivo: motivoReapertura.trim() || 'Ajuste de planilla mensual'
      });
      setModalReabrirAbierto(false);
      await refetchPlanillas();
      success('Asiento extornado y planilla reabierta. Ya puede editar los montos y volver a contabilizar.', 'Planilla Reabierta');
    } catch (err: any) {
      error('Error al anular/reabrir planilla: ' + (err?.response?.data?.error || err.message), 'Error');
    }
  };

  const construirBoletaItem = (l: any): BoletaPagoPdfItem => {
    const trab = trabajadores.find((t: any) => t.id === l.trabajadorId);
    return {
      trabajadorNombre: l.trabajadorNombre,
      trabajadorDocumento: l.trabajadorDocumento,
      cargo: trab?.cargo || l.trabajadorCargo || 'COLABORADOR',
      regimenLaboral: trab?.regimenLaboral || l.regimenLaboral || 'GENERAL',
      fechaIngreso: trab?.fechaIngreso || '2024-01-01',
      cuspp: trab?.cuspp || l.cuspp,
      sistemaPensiones: l.sistemaPensiones,
      afpAdministradora: trab?.afpAdministradora || l.afpAdministradora,
      afpTipoComision: trab?.afpTipoComision,
      centroCosto: l.centroCosto || trab?.centroCosto || 'ADMINISTRACION',
      bancoSueldo: trab?.bancoSueldo,
      cuentaBancoSueldo: trab?.cuentaBancoSueldo,
      diasTrabajados: l.diasTrabajados ?? l.diasLaborados ?? 30,
      diasFaltas: l.diasFaltas || 0,
      horasOrdinarias: l.horasOrdinarias || 240,
      horasExtras25: l.horasExtras25 || 0,
      horasExtras35: l.horasExtras35 || 0,
      sueldoBasico: l.sueldoBasico || 0,
      asignacionFamiliar: l.asignacionFamiliar || 0,
      montoHorasExtras25: l.montoHorasExtras25 || l.horasExtras || 0,
      montoHorasExtras35: l.montoHorasExtras35 || 0,
      bonificacionesGravadas: l.bonificacionesGravadas || 0,
      conceptosNoGravados: l.conceptosNoGravados || 0,
      totalRemuneracion: l.totalRemuneracion || 0,
      aporteObligatorioPension: l.aporteObligatorioPension || 0,
      comisionAfp: l.comisionAfp || 0,
      primaSeguroAfp: l.primaSeguroAfp || 0,
      retencionQuintaCategoria: l.retencionQuintaCategoria ?? l.retencionQuinta ?? 0,
      descuentoFaltasTardanzas: l.descuentoFaltasTardanzas || 0,
      adelantosPrestamos: l.adelantosPrestamos || 0,
      totalDescuentos: l.totalDescuentos || 0,
      aporteEssalud: l.aporteEssalud || 0,
      netoPagar: l.netoPagar || 0
    };
  };

  const lineasPlanilla = modoEdicion ? lineasBorrador : (planillaActual?.lineas || []);

  const resumenKpis = useMemo(() => {
    if (!modoEdicion && planillaActual) {
      return {
        totalIngresos: Number(planillaActual.totalIngresos || 0),
        totalDescuentos: Number(planillaActual.totalDescuentos || 0),
        totalAportesEmpleador: Number(planillaActual.totalAportesEmpleador || 0),
        totalNeto: Number(planillaActual.totalNeto || 0)
      };
    }
    return {
      totalIngresos: redondear2(lineasBorrador.reduce((s, l) => s + Number(l.totalRemuneracion || 0), 0)),
      totalDescuentos: redondear2(lineasBorrador.reduce((s, l) => s + Number(l.totalDescuentos || 0), 0)),
      totalAportesEmpleador: redondear2(lineasBorrador.reduce((s, l) => s + Number(l.aporteEssalud || 0), 0)),
      totalNeto: redondear2(lineasBorrador.reduce((s, l) => s + Number(l.netoPagar || 0), 0))
    };
  }, [modoEdicion, planillaActual, lineasBorrador]);

  const estaContabilizada = planillaActual?.estado === 'CONTABILIZADA' || planillaActual?.estado === 'PAGADA';

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
        subtitulo="Remuneración proporcional por días, horas extras (25% / 35%), edición directa, ONP/AFP, EsSalud 9%, 5ta categoría y asiento editable por centro de costos"
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
            primario: !modoEdicion,
            onClick: handleCalcularPlanilla
          },
          ...(planillaActual && !estaContabilizada && !modoEdicion && lineasPlanilla.length > 0
            ? [
                {
                  id: 'editar-montos',
                  label: 'Editar Montos',
                  icono: Edit3,
                  onClick: iniciarEdicion
                }
              ]
            : []),
          ...(modoEdicion
            ? [
                {
                  id: 'guardar-montos',
                  label: actualizarLineasMutation.isPending ? 'Guardando...' : 'Guardar Cambios',
                  icono: Save,
                  primario: true,
                  onClick: handleGuardarEdicion
                },
                {
                  id: 'descartar-montos',
                  label: 'Descartar',
                  icono: RotateCcw,
                  onClick: () => {
                    setModoEdicion(false);
                    setLineasBorrador([]);
                  }
                }
              ]
            : []),
          ...(lineasPlanilla.length > 0 && !modoEdicion
            ? [
                {
                  id: 'ver-asiento',
                  label: estaContabilizada ? 'Ver Asiento (62/40/41)' : 'Editar / Contabilizar Asiento (62/40/41)',
                  icono: BookOpen,
                  onClick: abrirEditorAsiento
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
                S/ {resumenKpis.totalIngresos.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[#4B5563] text-[11px]">Descuentos ONP/AFP/5ta (4032/407/40173): </span>
              <span className="font-mono font-bold text-[#B91C1C]">
                - S/ {resumenKpis.totalDescuentos.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[#4B5563] text-[11px]">EsSalud Empleador 9% (6271 / 4031): </span>
              <span className="font-mono font-bold text-[#B45309]">
                S/ {resumenKpis.totalAportesEmpleador.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[#4B5563] text-[11px]">Neto por Pagar (Cta. 4111): </span>
              <span className="font-mono font-bold text-[#1E6F42]">
                S/ {resumenKpis.totalNeto.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {modoEdicion && (
              <span className="px-2 py-0.5 text-[10px] font-bold border bg-[#DBEAFE] text-[#1D4ED8] border-[#93C5FD]">
                MODO EDICIÓN ACTIVO
              </span>
            )}
            <span
              className={`px-2 py-0.5 text-[10px] font-bold border ${
                estaContabilizada
                  ? 'bg-[#DCFCE7] text-[#166534] border-[#86EFAC]'
                  : 'bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]'
              }`}
            >
              {planillaActual.estado}
            </span>
            {!estaContabilizada ? (
              <button
                type="button"
                onClick={abrirEditorAsiento}
                disabled={contabilizarPlanillaMutation.isPending || modoEdicion}
                className="h-6 px-3 bg-[#1E6F42] hover:bg-[#165331] disabled:bg-[#9CA3AF] text-[#FFFFFF] text-[11px] font-bold inline-flex items-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Contabilizar Asiento (Subdiario 07)
              </button>
            ) : (
              <>
                <span className="font-mono text-[11px] font-bold text-[#1E6F42]">
                  Voucher Subdiario 07 Registrado
                </span>
                <button
                  type="button"
                  onClick={() => setModalReabrirAbierto(true)}
                  className="h-6 px-2.5 border border-[#B91C1C] bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#991B1B] text-[11px] font-bold inline-flex items-center gap-1"
                  title="Extorna el asiento contable actual y reabre la planilla para ajustar montos o cuentas"
                >
                  <RotateCcw className="w-3 h-3" />
                  Anular / Reabrir
                </button>
              </>
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
                const totalHe = Number(l.horasExtras ?? (Number(l.montoHorasExtras25 || 0) + Number(l.montoHorasExtras35 || 0)));
                const totalBonos = Number(l.bonificacionesGravadas || 0) + Number(l.conceptosNoGravados || 0);
                const totalPension =
                  Number(l.aporteObligatorioPension || 0) +
                  Number(l.comisionAfp || 0) +
                  Number(l.primaSeguroAfp || 0);
                const otrosDesc = Number(l.descuentoFaltasTardanzas || 0) + Number(l.otrosDescuentos || l.adelantosPrestamos || 0);
                const retQuinta = Number(l.retencionQuinta ?? l.retencionQuintaCategoria ?? 0);
                const ccLinea = l.centroCosto || trab?.centroCosto || 'ADMINISTRACION';
                const esAfp = l.sistemaPensiones === 'AFP';

                return (
                  <tr key={l.id} className={modoEdicion ? 'bg-[#F8FAFC]' : 'hover:bg-[#F9FAFB]'}>
                    <td className="py-1 px-2 font-mono font-bold text-[#1E3A5F] border-r border-[#E5E7EB]">
                      {l.trabajadorDocumento}
                    </td>
                    <td className="py-1 px-2 border-r border-[#E5E7EB]">
                      <div className="font-bold text-[#111827]">{l.trabajadorNombre}</div>
                      {modoEdicion ? (
                        <div className="flex items-center gap-1 mt-0.5 text-[10px]">
                          <span className="text-[#4B5563]">{l.sistemaPensiones} | C.C.:</span>
                          <select
                            value={ccLinea}
                            onChange={(e) => actualizarCampoBorrador(l.id, 'centroCosto', e.target.value)}
                            className="h-5 px-1 text-[10px] font-mono border border-[#D1D5DB] bg-white"
                          >
                            <option value="ADMINISTRACION">ADMINISTRACION</option>
                            <option value="VENTAS">VENTAS</option>
                            <option value="PRODUCCION">PRODUCCION</option>
                            <option value="OPERACIONES">OPERACIONES</option>
                          </select>
                        </div>
                      ) : (
                        <div className="text-[10px] text-[#4B5563]">
                          {l.sistemaPensiones} | C.C.: {ccLinea}
                        </div>
                      )}
                    </td>
                    <td className="py-1 px-1.5 text-center font-mono border-r border-[#E5E7EB]">
                      {modoEdicion ? (
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={l.diasLaborados ?? l.diasTrabajados ?? 30}
                          onChange={(e) => actualizarCampoBorrador(l.id, 'diasLaborados', parseInt(e.target.value, 10) || 0)}
                          className="w-12 h-5 px-1 font-mono text-center border border-[#93C5FD] bg-white"
                        />
                      ) : (
                        `${l.diasTrabajados ?? l.diasLaborados ?? 30}d`
                      )}
                    </td>
                    <td className="py-1 px-2 text-right font-mono border-r border-[#E5E7EB]">
                      {modoEdicion ? (
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.sueldoBasico}
                          onChange={(e) => actualizarCampoBorrador(l.id, 'sueldoBasico', parseFloat(e.target.value) || 0)}
                          className="w-20 h-5 px-1 font-mono text-right border border-[#93C5FD] bg-white"
                        />
                      ) : (
                        Number(l.sueldoBasico || 0).toFixed(2)
                      )}
                    </td>
                    <td className="py-1 px-2 text-right font-mono border-r border-[#E5E7EB]">
                      {modoEdicion ? (
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.asignacionFamiliar}
                          onChange={(e) => actualizarCampoBorrador(l.id, 'asignacionFamiliar', parseFloat(e.target.value) || 0)}
                          className="w-16 h-5 px-1 font-mono text-right border border-[#93C5FD] bg-white"
                        />
                      ) : (
                        Number(l.asignacionFamiliar || 0) > 0 ? Number(l.asignacionFamiliar).toFixed(2) : '-'
                      )}
                    </td>
                    <td className="py-1 px-2 text-right font-mono border-r border-[#E5E7EB]">
                      {modoEdicion ? (
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.horasExtras}
                          onChange={(e) => actualizarCampoBorrador(l.id, 'horasExtras', parseFloat(e.target.value) || 0)}
                          className="w-16 h-5 px-1 font-mono text-right border border-[#93C5FD] bg-white"
                        />
                      ) : (
                        totalHe > 0 ? totalHe.toFixed(2) : '-'
                      )}
                    </td>
                    <td className="py-1 px-2 text-right font-mono border-r border-[#E5E7EB]">
                      {modoEdicion ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={l.bonificacionesGravadas || 0}
                            onChange={(e) => actualizarCampoBorrador(l.id, 'bonificacionesGravadas', parseFloat(e.target.value) || 0)}
                            title="Bonificaciones gravadas"
                            className="w-16 h-5 px-1 font-mono text-right border border-[#93C5FD] bg-white"
                          />
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={l.conceptosNoGravados || 0}
                            onChange={(e) => actualizarCampoBorrador(l.id, 'conceptosNoGravados', parseFloat(e.target.value) || 0)}
                            title="Conceptos no gravados (movilidad, refrigerio, etc.)"
                            className="w-16 h-4 px-1 font-mono text-[10px] text-right border border-[#D1D5DB] bg-white"
                          />
                        </div>
                      ) : (
                        totalBonos > 0 ? totalBonos.toFixed(2) : '-'
                      )}
                    </td>
                    <td className="py-1 px-2 text-right font-mono font-bold text-[#1D4ED8] bg-[#EFF6FF]/50 border-r border-[#E5E7EB]">
                      {Number(l.totalRemuneracion || 0).toFixed(2)}
                    </td>
                    <td className="py-1 px-2 text-right font-mono text-[#B91C1C] border-r border-[#E5E7EB]">
                      {modoEdicion ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={l.aporteObligatorioPension}
                            onChange={(e) => actualizarCampoBorrador(l.id, 'aporteObligatorioPension', parseFloat(e.target.value) || 0)}
                            title={esAfp ? 'Fondo AFP obligatorio' : 'Aporte ONP 13%'}
                            className="w-16 h-5 px-1 font-mono text-right border border-[#FCA5A5] bg-white"
                          />
                          {esAfp && (
                            <div className="flex gap-0.5">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={l.comisionAfp || 0}
                                onChange={(e) => actualizarCampoBorrador(l.id, 'comisionAfp', parseFloat(e.target.value) || 0)}
                                title="Comisión AFP"
                                className="w-12 h-4 px-0.5 font-mono text-[10px] text-right border border-[#D1D5DB] bg-white"
                              />
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={l.primaSeguroAfp || 0}
                                onChange={(e) => actualizarCampoBorrador(l.id, 'primaSeguroAfp', parseFloat(e.target.value) || 0)}
                                title="Prima Seguro AFP"
                                className="w-12 h-4 px-0.5 font-mono text-[10px] text-right border border-[#D1D5DB] bg-white"
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        totalPension.toFixed(2)
                      )}
                    </td>
                    <td className="py-1 px-2 text-right font-mono text-[#B91C1C] font-bold border-r border-[#E5E7EB]">
                      {modoEdicion ? (
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={retQuinta}
                          onChange={(e) => actualizarCampoBorrador(l.id, 'retencionQuinta', parseFloat(e.target.value) || 0)}
                          className="w-16 h-5 px-1 font-mono text-right border border-[#FCA5A5] bg-white"
                        />
                      ) : (
                        retQuinta > 0 ? retQuinta.toFixed(2) : '0.00'
                      )}
                    </td>
                    <td className="py-1 px-2 text-right font-mono text-[#B91C1C] border-r border-[#E5E7EB]">
                      {modoEdicion ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={l.descuentoFaltasTardanzas || 0}
                            onChange={(e) => actualizarCampoBorrador(l.id, 'descuentoFaltasTardanzas', parseFloat(e.target.value) || 0)}
                            title="Descuento faltas y tardanzas"
                            className="w-16 h-5 px-1 font-mono text-right border border-[#FCA5A5] bg-white"
                          />
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={l.adelantosPrestamos || 0}
                            onChange={(e) => actualizarCampoBorrador(l.id, 'adelantosPrestamos', parseFloat(e.target.value) || 0)}
                            title="Adelantos y préstamos"
                            className="w-16 h-4 px-1 font-mono text-[10px] text-right border border-[#D1D5DB] bg-white"
                          />
                        </div>
                      ) : (
                        otrosDesc > 0 ? otrosDesc.toFixed(2) : '-'
                      )}
                    </td>
                    <td className="py-1 px-2 text-right font-mono text-[#B45309] border-r border-[#E5E7EB]">
                      {modoEdicion ? (
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.aporteEssalud}
                          onChange={(e) => actualizarCampoBorrador(l.id, 'aporteEssalud', parseFloat(e.target.value) || 0)}
                          className="w-16 h-5 px-1 font-mono text-right border border-[#FCD34D] bg-white"
                        />
                      ) : (
                        Number(l.aporteEssalud || 0).toFixed(2)
                      )}
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

      {/* MODAL EDITOR DE ASIENTO CONTABLE DE PLANILLA POR CENTRO DE COSTOS */}
      <VentanaModal
        abierto={modalAsientoAbierto}
        onCerrar={() => setModalAsientoAbierto(false)}
        titulo={`Asiento Contable de Planilla por Centro de Costos — Subdiario ${asientoSubdiario} (${mesSeleccionado})`}
        ancho="xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModalAsientoAbierto(false)}
              className="h-6 px-3 text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]"
            >
              Cerrar
            </button>
            {!estaContabilizada && (
              <button
                type="button"
                disabled={!totalesAsientoEditor.cuadrado || contabilizarPlanillaMutation.isPending}
                onClick={() => handleContabilizar(true)}
                className="h-6 px-3 text-[12px] border border-[#1E6F42] bg-[#1E6F42] disabled:bg-[#9CA3AF] disabled:border-[#9CA3AF] text-[#FFFFFF] font-bold"
              >
                {contabilizarPlanillaMutation.isPending ? 'Contabilizando...' : 'Contabilizar Asiento en Libro Diario'}
              </button>
            )}
          </>
        }
      >
        <div className="space-y-3 text-[11px]">
          <div className="p-2 bg-[#F8FAFC] border border-[#D1D5DB] flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>PCGE 2019 Modificado:</strong> Edite cuentas, glosas, centros de costo o montos Debe/Haber antes de registrar en Libro Diario. La partida doble debe cuadrar al céntimo.
            </span>
            {!estaContabilizada && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAsientoLineas(construirPropuestaLocalFallback(planillaActual?.lineas || []))}
                  className="h-6 px-2 border border-[#D1D5DB] bg-white hover:bg-[#F3F4F6] text-[11px] inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Restablecer Automático
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setAsientoLineas((prev) => [
                      ...prev,
                      {
                        id: `manual-${Date.now()}`,
                        codigoCuenta: '',
                        denominacionCuenta: '',
                        centroCostoId: '',
                        glosa: asientoGlosa,
                        debe: 0,
                        haber: 0
                      }
                    ])
                  }
                  className="h-6 px-2 border border-[#1E3A5F] bg-[#1E3A5F] text-white text-[11px] font-bold inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Agregar Línea
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 bg-[#F9FAFB] p-2 border border-[#D1D5DB]">
            <div>
              <label className="block text-[10px] font-bold text-[#374151]">Fecha Contable</label>
              <input
                type="date"
                value={asientoFecha}
                disabled={estaContabilizada}
                onChange={(e) => setAsientoFecha(e.target.value)}
                className="w-full h-6 px-1.5 font-mono text-[11px] border border-[#D1D5DB] bg-white disabled:bg-[#F3F4F6]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#374151]">Subdiario</label>
              <input
                type="text"
                value={asientoSubdiario}
                disabled={estaContabilizada}
                onChange={(e) => setAsientoSubdiario(e.target.value)}
                className="w-full h-6 px-1.5 font-mono text-[11px] border border-[#D1D5DB] bg-white disabled:bg-[#F3F4F6]"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-[10px] font-bold text-[#374151]">Glosa General del Voucher</label>
              <input
                type="text"
                value={asientoGlosa}
                disabled={estaContabilizada}
                onChange={(e) => setAsientoGlosa(e.target.value)}
                className="w-full h-6 px-2 text-[11px] border border-[#D1D5DB] bg-white disabled:bg-[#F3F4F6]"
              />
            </div>
          </div>

          {cargandoPropuesta ? (
            <div className="p-4 text-center text-[#6B7280]">Cargando propuesta contable...</div>
          ) : (
            <div className="max-h-80 overflow-auto border border-[#D1D5DB]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#E8ECF1] font-bold border-b border-[#D1D5DB] sticky top-0 z-10">
                  <tr>
                    <th className="py-1 px-2 border-r border-[#D1D5DB] w-44">Cuenta PCGE</th>
                    <th className="py-1 px-2 border-r border-[#D1D5DB]">Denominación</th>
                    <th className="py-1 px-2 border-r border-[#D1D5DB] w-28">C. Costo</th>
                    <th className="py-1 px-2 border-r border-[#D1D5DB]">Glosa de Línea</th>
                    <th className="py-1 px-2 border-r border-[#D1D5DB] text-right w-28">Debe (S/)</th>
                    <th className="py-1 px-2 border-r border-[#D1D5DB] text-right w-28">Haber (S/)</th>
                    {!estaContabilizada && <th className="py-1 px-1.5 text-center w-10"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {asientoLineas.map((lin) => (
                    <tr key={lin.id} className="hover:bg-[#F9FAFB]">
                      <td className="py-1 px-1.5 border-r border-[#E5E7EB]">
                        {estaContabilizada ? (
                          <span className="font-mono font-bold text-[#1E3A5F]">{lin.codigoCuenta}</span>
                        ) : (
                          <SelectorCuentaContable
                            value={lin.codigoCuenta}
                            tamano="compacto"
                            mostrarDenominacion={false}
                            onChange={(codigo, denom) =>
                              setAsientoLineas((prev) =>
                                prev.map((x) =>
                                  x.id === lin.id
                                    ? {
                                        ...x,
                                        codigoCuenta: codigo,
                                        denominacionCuenta: denom || buscarCuentaPCGE(codigo)?.nombre || ''
                                      }
                                    : x
                                )
                              )
                            }
                          />
                        )}
                      </td>
                      <td className="py-1 px-2 border-r border-[#E5E7EB] text-[#374151] truncate max-w-[180px]" title={lin.denominacionCuenta}>
                        {lin.denominacionCuenta || buscarCuentaPCGE(lin.codigoCuenta)?.nombre || '—'}
                      </td>
                      <td className="py-1 px-1.5 border-r border-[#E5E7EB]">
                        <input
                          type="text"
                          value={lin.centroCostoId || ''}
                          disabled={estaContabilizada}
                          onChange={(e) =>
                            setAsientoLineas((prev) =>
                              prev.map((x) => (x.id === lin.id ? { ...x, centroCostoId: e.target.value } : x))
                            )
                          }
                          placeholder="-"
                          className="w-full h-5 px-1 font-mono text-[10px] border border-[#D1D5DB] bg-white disabled:bg-[#F3F4F6]"
                        />
                      </td>
                      <td className="py-1 px-1.5 border-r border-[#E5E7EB]">
                        <input
                          type="text"
                          value={lin.glosa}
                          disabled={estaContabilizada}
                          onChange={(e) =>
                            setAsientoLineas((prev) =>
                              prev.map((x) => (x.id === lin.id ? { ...x, glosa: e.target.value } : x))
                            )
                          }
                          className="w-full h-5 px-1 text-[11px] border border-[#D1D5DB] bg-white disabled:bg-[#F3F4F6]"
                        />
                      </td>
                      <td className="py-1 px-1.5 border-r border-[#E5E7EB]">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={lin.debe}
                          disabled={estaContabilizada}
                          onChange={(e) => {
                            const val = Math.max(0, parseFloat(e.target.value) || 0);
                            setAsientoLineas((prev) =>
                              prev.map((x) => (x.id === lin.id ? { ...x, debe: val, haber: val > 0 ? 0 : x.haber } : x))
                            );
                          }}
                          className="w-full h-5 px-1 font-mono text-right border border-[#D1D5DB] bg-white disabled:bg-[#F3F4F6]"
                        />
                      </td>
                      <td className="py-1 px-1.5 border-r border-[#E5E7EB]">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={lin.haber}
                          disabled={estaContabilizada}
                          onChange={(e) => {
                            const val = Math.max(0, parseFloat(e.target.value) || 0);
                            setAsientoLineas((prev) =>
                              prev.map((x) => (x.id === lin.id ? { ...x, haber: val, debe: val > 0 ? 0 : x.debe } : x))
                            );
                          }}
                          className="w-full h-5 px-1 font-mono text-right border border-[#D1D5DB] bg-white disabled:bg-[#F3F4F6]"
                        />
                      </td>
                      {!estaContabilizada && (
                        <td className="py-1 px-1 text-center">
                          <button
                            type="button"
                            onClick={() => setAsientoLineas((prev) => prev.filter((x) => x.id !== lin.id))}
                            className="p-0.5 text-[#B91C1C] hover:bg-[#FEF2F2]"
                            title="Eliminar línea"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div
            className={`p-2 border flex flex-wrap items-center justify-between font-mono text-[11px] ${
              totalesAsientoEditor.cuadrado
                ? 'bg-[#F0FDF4] border-[#86EFAC] text-[#166534]'
                : 'bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]'
            }`}
          >
            <div className="flex items-center gap-4 font-bold">
              <span>TOTAL DEBE: S/ {totalesAsientoEditor.totalDebe.toFixed(2)}</span>
              <span>TOTAL HABER: S/ {totalesAsientoEditor.totalHaber.toFixed(2)}</span>
              <span>DIFERENCIA: S/ {totalesAsientoEditor.diferencia.toFixed(2)}</span>
            </div>
            <span className="font-bold flex items-center gap-1">
              {totalesAsientoEditor.cuadrado ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> PARTIDA DOBLE CUADRADA
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" /> ASIENTO DESCUADRADO O INCOMPLETO
                </>
              )}
            </span>
          </div>
        </div>
      </VentanaModal>

      {/* MODAL ANULAR Y REABRIR PLANILLA CONTABILIZADA */}
      <VentanaModal
        abierto={modalReabrirAbierto}
        onCerrar={() => setModalReabrirAbierto(false)}
        titulo={`Anular Asiento y Reabrir Planilla — ${mesSeleccionado}`}
        ancho="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModalReabrirAbierto(false)}
              className="h-6 px-3 text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={anularPlanillaMutation.isPending}
              onClick={handleAnularYReabrir}
              className="h-6 px-3 text-[12px] border border-[#B91C1C] bg-[#B91C1C] text-[#FFFFFF] font-bold"
            >
              {anularPlanillaMutation.isPending ? 'Procesando...' : 'Extornar Asiento y Reabrir'}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-[12px]">
          <p className="text-[#374151]">
            Al reabrir una planilla contabilizada se generará un <strong>contra-asiento de extorno</strong> en el Libro Diario y la planilla regresará a estado editable (<strong>BORRADOR</strong>) para que pueda corregir los montos o volver a contabilizarla.
          </p>
          <div>
            <label className="block text-[11px] font-bold text-[#374151] mb-1">Motivo de reapertura / ajuste:</label>
            <input
              type="text"
              value={motivoReapertura}
              onChange={(e) => setMotivoReapertura(e.target.value)}
              className="w-full h-7 px-2 border border-[#D1D5DB] text-[12px]"
            />
          </div>
        </div>
      </VentanaModal>
    </div>
  );
};
