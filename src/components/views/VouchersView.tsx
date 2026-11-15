import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calculator, 
  ListFilter, 
  Search, 
  Plus, 
  Lock, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  RotateCcw, 
  Ban,
  Eye,
  Printer,
  Edit3
} from 'lucide-react';
import { EmpresaCliente, CodigoSubdiario } from '../../types';
import { EMPRESAS_CLIENTES_DEMO } from '../../data/empresasClientes';
import { 
  useAsientosList, 
  useCrearAsiento, 
  useContabilizarAsiento, 
  useAnularAsiento, 
  useDuplicarAsiento 
} from '../../hooks/useAsientos';
import { useToast } from '../../context/ToastContext';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { 
  VoucherHeader, 
  VoucherGrid, 
  VoucherTotals, 
  VoucherStatusBar, 
  CatalogoCuentasDialog,
  FilaVoucherGrid,
  PlantillaAsiento,
  PLANTILLAS_ASIENTOS
} from '../voucher';
import { CuentaPCGE, buscarCuentaPCGE } from '../../data/pcgeAccounts';
import { VisorReporteModal } from '../modals/VisorReporteModal';
import { ModalTipoCambioManual } from '../modals/ModalTipoCambioManual';
import { tipoCambioApi, TipoCambioDTO } from '../../api/tipoCambioApi';
import { construirDefinicionVoucherContableEstandar } from '../../services/reports/formato_estandar/formatoEstandarEngine';

interface VouchersViewProps {
  empresaId: string;
  periodo: string;
  isPeriodoCerrado?: boolean;
  empresa?: EmpresaCliente;
  usuarioNombre?: string;
  usuarioRol?: string;
  subdiarioFijo?: string;
}

export const VouchersView: React.FC<VouchersViewProps> = ({
  empresaId,
  periodo,
  isPeriodoCerrado = false,
  empresa,
  usuarioNombre,
  usuarioRol,
  subdiarioFijo
}) => {
  const { success, error, warning, info } = useToast();
  const { usuario, rolEnEmpresa } = useEmpresaPeriodo();
  const nombreOperador = usuarioNombre || usuario?.nombre || usuario?.email || 'Administrador';
  const rolOperador = usuarioRol || rolEnEmpresa || usuario?.rolGlobal || 'ADMINISTRADOR';
  const empresaActual = empresa || EMPRESAS_CLIENTES_DEMO.find((e) => e.id === empresaId) || EMPRESAS_CLIENTES_DEMO[0];

  // Modo de vista: 'CAPTURA' (ventana de escritorio de alta densidad) o 'HISTORIAL' (lista de asientos)
  const [vistaModo, setVistaModo] = useState<'CAPTURA' | 'HISTORIAL'>(subdiarioFijo ? 'CAPTURA' : 'HISTORIAL');

  // Queries del Backend
  const { data: asientosResponse, isLoading: loadingAsientos, refetch } = useAsientosList(empresaId, {});
  const crearMutation = useCrearAsiento(empresaId);
  const contabilizarMutation = useContabilizarAsiento(empresaId);
  const anularMutation = useAnularAsiento(empresaId);
  const duplicarMutation = useDuplicarAsiento(empresaId);

  const listaAsientos = asientosResponse?.data || [];

  // Filtros del Historial de Asientos
  const [filtroSubdiario, setFiltroSubdiario] = useState<string>('TODOS');
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'BORRADOR' | 'CONTABILIZADO' | 'ANULADO'>('TODOS');
  const [busquedaTexto, setBusquedaTexto] = useState<string>('');

  const listaAsientosFiltrados = useMemo(() => {
    return listaAsientos.filter((a: any) => {
      const aSub = (a.subdiario || a.subdiarioCodigo || a.subdiarioId || '').replace(/^sub-/, '').padStart(2, '0');
      if (filtroSubdiario !== 'TODOS' && aSub !== filtroSubdiario) return false;
      if (filtroEstado !== 'TODOS' && a.estado !== filtroEstado) return false;
      if (busquedaTexto.trim()) {
        const q = busquedaTexto.toLowerCase().trim();
        const num = (a.numero || '').toLowerCase();
        const glo = (a.glosa || a.glosaGeneral || '').toLowerCase();
        const cuo = (a.cuo || '').toLowerCase();
        if (!num.includes(q) && !glo.includes(q) && !cuo.includes(q)) return false;
      }
      return true;
    });
  }, [listaAsientos, filtroSubdiario, filtroEstado, busquedaTexto]);

  // Estado del Voucher en Edición (Escritorio)
  const [asientoId, setAsientoId] = useState<string | null>(null);
  const [subdiario, setSubdiario] = useState<string>(subdiarioFijo || '10');
  const [numeroVoucher, setNumeroVoucher] = useState<string>('10090001');
  const [fechaContable, setFechaContable] = useState<string>(`${periodo ? periodo.split('-')[0] : '2026'}-${periodo && periodo.includes('-') ? periodo.split('-')[1] : '09'}-15`);
  const [fechaEmisionDocRef, setFechaEmisionDocRef] = useState<string>(`${periodo ? periodo.split('-')[0] : '2026'}-${periodo && periodo.includes('-') ? periodo.split('-')[1] : '09'}-15`);
  const [moneda, setMoneda] = useState<'PEN' | 'USD'>('PEN');
  const [tipoCambioCompra, setTipoCambioCompra] = useState<number>(0);
  const [tipoCambioVenta, setTipoCambioVenta] = useState<number>(0);
  const [isModalTcOpen, setIsModalTcOpen] = useState(false);

  useEffect(() => {
    let activo = true;
    tipoCambioApi.obtenerPorFecha(fechaContable).then((tc) => {
      if (!activo) return;
      if (tc) {
        setTipoCambioCompra(tc.compra);
        setTipoCambioVenta(tc.venta);
      } else {
        tipoCambioApi.obtenerVigente(fechaContable).then((vig) => {
          if (!activo) return;
          if (vig) {
            setTipoCambioCompra(vig.compra);
            setTipoCambioVenta(vig.venta);
          } else {
            setTipoCambioCompra(0);
            setTipoCambioVenta(0);
          }
        });
      }
    }).catch(() => {
      if (activo) {
        setTipoCambioCompra(0);
        setTipoCambioVenta(0);
      }
    });
    return () => { activo = false; };
  }, [fechaContable]);
  const [glosaGeneral, setGlosaGeneral] = useState<string>('');
  const [estadoVoucher, setEstadoVoucher] = useState<'BORRADOR' | 'CONTABILIZADO' | 'ANULADO'>('BORRADOR');
  const [cuoVoucher, setCuoVoucher] = useState<string | undefined>(undefined);

  // Filas del Voucher nuevo: vacío por defecto sin líneas de ejemplo
  const [filas, setFilas] = useState<FilaVoucherGrid[]>([]);

  // Celda activa y navegación
  const [activeCell, setActiveCell] = useState<{ rowIndex: number; colKey: string } | null>(null);

  // Diálogo de Catálogo PCGE (F2)
  const [isCatalogoOpen, setIsCatalogoOpen] = useState(false);
  const [catalogoRowIndex, setCatalogoRowIndex] = useState(0);

  // Modal de Impresión Estándar
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Cálculo de Totales y Cuadre de Partida Doble
  const totalDebePen = useMemo(() => Math.round(filas.reduce((acc, f) => acc + (Number(f.debe) || 0), 0) * 100) / 100, [filas]);
  const totalHaberPen = useMemo(() => Math.round(filas.reduce((acc, f) => acc + (Number(f.haber) || 0), 0) * 100) / 100, [filas]);
  const diferenciaPen = useMemo(() => Math.round((totalDebePen - totalHaberPen) * 100) / 100, [totalDebePen, totalHaberPen]);

  const totalDebeUsd = useMemo(() => Math.round(filas.reduce((acc, f) => acc + (Number(f.debeUsd) || 0), 0) * 100) / 100, [filas]);
  const totalHaberUsd = useMemo(() => Math.round(filas.reduce((acc, f) => acc + (Number(f.haberUsd) || 0), 0) * 100) / 100, [filas]);
  const diferenciaUsd = useMemo(() => Math.round((totalDebeUsd - totalHaberUsd) * 100) / 100, [totalDebeUsd, totalHaberUsd]);

  const estaCuadrado = Math.abs(diferenciaPen) < 0.001 && totalDebePen > 0;

  // Validación de Reglas SUNAT en Tiempo Real por Fila
  const { erroresPorFila, primerError } = useMemo(() => {
    const errs: Record<number, Record<string, string>> = {};
    let first: string | null = null;

    filas.forEach((f, idx) => {
      const rowErrs: Record<string, string> = {};
      const cod = (f.codigoCuenta || '').trim();

      if (!cod) {
        rowErrs.codigoCuenta = `Línea ${idx + 1}: Ingrese cuenta contable PCGE.`;
      } else if (cod.length <= 2) {
        rowErrs.codigoCuenta = `Línea ${idx + 1}: CUENTA_NO_IMPUTABLE — La cuenta ${cod} es cuenta mayor. Elija una subcuenta analítica.`;
      } else {
        const cta = buscarCuentaPCGE(cod);
        if (cta && !cta.permiteMovimiento) {
          rowErrs.codigoCuenta = `Línea ${idx + 1}: CUENTA_NO_IMPUTABLE — La cuenta ${cod} no permite movimiento.`;
        }
      }

      if (f.requiereAnexo && !f.anexoNumDoc) {
        rowErrs.anexoNumDoc = `Línea ${idx + 1}: La cuenta ${f.codigoCuenta} exige anexo RUC/DNI.`;
      }

      if (f.requiereDocumento && (!f.tipoComprobante || !f.numeroComprobante)) {
        rowErrs.numeroComprobante = `Línea ${idx + 1}: La cuenta ${f.codigoCuenta} exige tipo y número de comprobante.`;
      }

      if (f.requiereCentroCosto && !f.centroCosto) {
        rowErrs.centroCosto = `Línea ${idx + 1}: La cuenta ${f.codigoCuenta} exige centro de costo.`;
      }

      if (Object.keys(rowErrs).length > 0) {
        errs[idx] = rowErrs;
        if (!first) {
          first = Object.values(rowErrs)[0];
        }
      }
    });

    return { erroresPorFila: errs, primerError: first };
  }, [filas]);

  const puedeContabilizar = estaCuadrado && !primerError && estadoVoucher !== 'CONTABILIZADO' && !isPeriodoCerrado;

  // Atajos de Teclado Globales del Voucher
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Si hay un modal abierto, no interceptar
      if (isCatalogoOpen || isPrintModalOpen) return;

      if (e.key === 'F10') {
        e.preventDefault();
        handleNuevoVoucher();
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (puedeContabilizar) handleContabilizar();
        else if (!estaCuadrado) warning(`No se puede contabilizar: Asiento descuadrado (Diferencia: S/ ${diferenciaPen.toFixed(2)})`);
        else if (primerError) warning(`No se puede contabilizar: ${primerError}`);
      } else if (e.key === 'F3') {
        e.preventDefault();
        setVistaModo((prev) => (prev === 'CAPTURA' ? 'HISTORIAL' : 'CAPTURA'));
      } else if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleGuardarBorrador();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCatalogoOpen, isPrintModalOpen, puedeContabilizar, estaCuadrado, primerError, diferenciaPen]);

  // Handlers de la Cuadrícula
  const handleFilaChange = (rowIndex: number, campo: keyof FilaVoucherGrid, valor: any) => {
    setFilas((prev) => {
      const copy = [...prev];
      copy[rowIndex] = { ...copy[rowIndex], [campo]: valor };
      return copy;
    });
  };

  const handleAgregarFila = () => {
    setFilas((prev) => [
      ...prev,
      {
        linea: prev.length + 1,
        codigoCuenta: '',
        denominacion: '',
        centroCosto: '',
        anexoTipoDoc: '',
        anexoNumDoc: '',
        anexoNombre: '',
        tipoComprobante: '',
        serieComprobante: '',
        numeroComprobante: '',
        fechaEmisionDoc: fechaContable,
        fechaVencimientoDoc: '',
        glosaLinea: glosaGeneral || '',
        debe: 0,
        haber: 0,
        debeUsd: 0,
        haberUsd: 0,
      },
    ]);
  };

  const handleEliminarFila = (rowIndex: number) => {
    setFilas((prev) => {
      const filtered = prev.filter((_, idx) => idx !== rowIndex);
      return filtered.map((f, idx) => ({ ...f, linea: idx + 1 }));
    });
  };

  const handleOpenF2Catalogo = (rowIndex: number) => {
    setCatalogoRowIndex(rowIndex);
    setIsCatalogoOpen(true);
  };

  const handleSelectCuenta = (cuenta: CuentaPCGE) => {
    handleFilaChange(catalogoRowIndex, 'codigoCuenta', cuenta.codigo);
    handleFilaChange(catalogoRowIndex, 'denominacion', cuenta.denominacion);
    handleFilaChange(catalogoRowIndex, 'permiteMovimiento', cuenta.permiteMovimiento);
    handleFilaChange(catalogoRowIndex, 'requiereAnexo', cuenta.requiereAnexo);
    handleFilaChange(catalogoRowIndex, 'requiereDocumento', cuenta.requiereDocumento);
    handleFilaChange(catalogoRowIndex, 'requiereCentroCosto', cuenta.requiereCentroCosto);
    handleFilaChange(catalogoRowIndex, 'requiereVencimiento', cuenta.requiereVencimiento);
  };

  const handleSeleccionarPlantilla = (p: PlantillaAsiento) => {
    setSubdiario(p.subdiario);
    setGlosaGeneral(p.glosaGeneralSugerida);
    setFilas(
      p.lineas.map((l, idx) => ({
        linea: idx + 1,
        codigoCuenta: l.codigoCuenta,
        denominacion: l.denominacion,
        permiteMovimiento: true,
        requiereAnexo: !!l.requiereAnexo,
        requiereDocumento: !!l.requiereDocumento,
        requiereCentroCosto: !!l.centroCostoSugerido,
        requiereVencimiento: false,
        centroCosto: l.centroCostoSugerido || '',
        anexoTipoDoc: '6',
        anexoNumDoc: '',
        anexoNombre: '',
        tipoComprobante: '01',
        serieComprobante: '',
        numeroComprobante: '',
        fechaEmisionDoc: fechaContable,
        fechaVencimientoDoc: '',
        glosaLinea: l.glosaSugerida || p.glosaGeneralSugerida,
        debe: 0,
        haber: 0,
        debeUsd: 0,
        haberUsd: 0,
      }))
    );
    info(`Plantilla cargada: ${p.nombre}. * Nota: ${p.avisoNormativo}`);
  };

  const handleNuevoVoucher = () => {
    setAsientoId(null);
    setEstadoVoucher('BORRADOR');
    setCuoVoucher(undefined);
    setNumeroVoucher(`0109${String(Math.floor(Math.random() * 9000) + 1000)}`);
    setGlosaGeneral('');
    setFilas([]);
    success('Nuevo voucher contable iniciado en blanco.');
  };

  const handleGuardarBorrador = async () => {
    try {
      const payload = {
        subdiario,
        periodo,
        origen: 'VOUCHER_LIBRE',
        validarSubdiarioManual: true,
        fechaContable,
        fechaDocumento: fechaEmisionDocRef,
        moneda,
        tipoCambio: tipoCambioVenta,
        glosaGeneral,
        detalles: filas.map((f) => ({
          cuentaCodigo: f.codigoCuenta,
          cuentaDenominacion: f.denominacion,
          centroCosto: f.centroCosto || undefined,
          anexoTipoDoc: f.anexoTipoDoc || undefined,
          anexoNumDoc: f.anexoNumDoc || undefined,
          anexoNombre: f.anexoNombre || undefined,
          tipoComprobante: f.tipoComprobante || undefined,
          serieComprobante: f.serieComprobante || undefined,
          numeroComprobante: f.numeroComprobante || undefined,
          fechaEmisionDoc: f.fechaEmisionDoc || undefined,
          fechaVencimientoDoc: f.fechaVencimientoDoc || undefined,
          debe: Number(f.debe) || 0,
          haber: Number(f.haber) || 0,
          glosaLinea: f.glosaLinea,
        })),
      };

      await crearMutation.mutateAsync(payload);
      refetch();
      success(`Borrador de voucher guardado en base de datos.`);
    } catch (err: any) {
      error(`Error guardando borrador: ${err.message}`);
    }
  };

  const handleContabilizar = async () => {
    if (!puedeContabilizar) {
      warning('El asiento debe cuadrar a cero y tener todas las cuentas imputables completas.');
      return;
    }
    try {
      let idTarget = asientoId;
      if (!idTarget) {
        const payload = {
          subdiario,
          periodo,
          origen: 'VOUCHER_LIBRE',
          validarSubdiarioManual: true,
          contabilizarDirecto: true,
          fechaContable,
          fechaDocumento: fechaEmisionDocRef,
          moneda,
          tipoCambio: tipoCambioVenta,
          glosaGeneral,
          detalles: filas.map((f) => ({
            cuentaCodigo: f.codigoCuenta,
            cuentaDenominacion: f.denominacion,
            centroCosto: f.centroCosto || undefined,
            anexoTipoDoc: f.anexoTipoDoc || undefined,
            anexoNumDoc: f.anexoNumDoc || undefined,
            anexoNombre: f.anexoNombre || undefined,
            tipoComprobante: f.tipoComprobante || undefined,
            serieComprobante: f.serieComprobante || undefined,
            numeroComprobante: f.numeroComprobante || undefined,
            fechaEmisionDoc: f.fechaEmisionDoc || undefined,
            fechaVencimientoDoc: f.fechaVencimientoDoc || undefined,
            debe: Number(f.debe) || 0,
            haber: Number(f.haber) || 0,
            glosaLinea: f.glosaLinea,
          })),
        };
        const res = await crearMutation.mutateAsync(payload);
        setAsientoId(res.id);
        setNumeroVoucher(res.numero || numeroVoucher);
        setEstadoVoucher('CONTABILIZADO');
        setCuoVoucher(res.cuo || `CUO-${res.numero || numeroVoucher}`);
        setFilas((prev) => prev.map((f) => ({ ...f, cuo: res.cuo || `CUO-${res.numero || numeroVoucher}` })));
        refetch();
        success(`Voucher contabilizado formalmente con N° ${res.numero} y CUO ${res.cuo || res.numero}.`);
        return;
      }

      const resCont = await contabilizarMutation.mutateAsync(idTarget);
      setEstadoVoucher('CONTABILIZADO');
      setNumeroVoucher(resCont.numero || numeroVoucher);
      setCuoVoucher(resCont.cuo || `CUO-${resCont.numero || numeroVoucher}`);
      setFilas((prev) => prev.map((f) => ({ ...f, cuo: resCont.cuo || `CUO-${resCont.numero || numeroVoucher}` })));
      refetch();
      success(`Voucher contabilizado formalmente con N° ${resCont.numero} y CUO ${resCont.cuo || resCont.numero}. Correlativo inmutable.`);
    } catch (err: any) {
      error(`Error contabilizando asiento: ${err.message}`);
    }
  };

  const handleContabilizarAsientoId = async (id: string) => {
    try {
      const res = await contabilizarMutation.mutateAsync(id);
      success(`Asiento contabilizado exitosamente con N° ${res.numero}`);
      refetch();
    } catch (err: any) {
      error(`Error al contabilizar asiento: ${err.message}`);
    }
  };

  const handleAnularAsiento = async (id: string, numero?: string) => {
    if (isPeriodoCerrado) {
      warning('No se pueden extornar asientos en un período contable cerrado.');
      return;
    }
    const motivo = window.prompt(`Ingrese el motivo de anulación / extorno para el voucher ${numero || id}:`);
    if (!motivo || motivo.trim().length < 5) {
      warning('Debe ingresar un motivo válido de al menos 5 caracteres.');
      return;
    }
    try {
      await anularMutation.mutateAsync({ id, motivo: motivo.trim() });
      success(`Asiento ${numero || id} extornado formalmente.`);
      refetch();
    } catch (err: any) {
      error(`Error al extornar asiento: ${err.message}`);
    }
  };

  const handleDuplicarAsiento = async (id: string) => {
    try {
      await duplicarMutation.mutateAsync(id);
      success(`Asiento duplicado como borrador.`);
      refetch();
    } catch (err: any) {
      error(`Error al duplicar asiento: ${err.message}`);
    }
  };

  // Asiento para el Visor de Reporte Estándar
  const definicionVoucherReporte = useMemo(() => {
    return construirDefinicionVoucherContableEstandar(empresaActual, {
      numeroAsiento: numeroVoucher,
      subdiario,
      fechaContable,
      periodo,
      glosaGeneral,
      lineas: filas.map((f) => ({
        linea: f.linea,
        cuentaCodigo: f.codigoCuenta,
        cuentaDenominacion: f.denominacion,
        centroCosto: f.centroCosto,
        docSerie: f.serieComprobante,
        docNumero: f.numeroComprobante,
        anexoNumDoc: f.anexoNumDoc,
        glosa: f.glosaLinea,
        debe: f.debe,
        haber: f.haber,
      })),
    });
  }, [empresaActual, numeroVoucher, subdiario, fechaContable, periodo, glosaGeneral, filas]);

  return (
    <div className="flex flex-col h-[calc(100vh-125px)] min-h-[600px] bg-slate-200 border border-slate-300 rounded-none shadow-xs overflow-hidden">
      {/* Selector de Modo: Captura de Escritorio vs Historial de Vouchers */}
      <div className="bg-slate-800 text-white px-3 py-1 flex items-center justify-between border-b border-slate-700 text-xs font-mono">
        <div className="flex items-center gap-3">
          <span className="font-bold text-amber-400">ATLOB ERP CONTABLE</span>
          <span className="text-slate-400">|</span>
          <span className="text-white font-semibold">MÓDULO DE ASIENTOS Y VOUCHERS CONTABLES</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVistaModo('CAPTURA')}
            className={`px-2.5 py-0.5 text-xs font-bold cursor-pointer transition ${
              vistaModo === 'CAPTURA' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            [F2/F10] Captura de Voucher
          </button>
          <button
            onClick={() => setVistaModo('HISTORIAL')}
            className={`px-2.5 py-0.5 text-xs font-bold cursor-pointer transition ${
              vistaModo === 'HISTORIAL' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            [F3] Lista de Asientos ({listaAsientos.length})
          </button>
        </div>
      </div>

      {/* Vista de Captura de Voucher (Ventana de Escritorio de Alta Densidad) */}
      {vistaModo === 'CAPTURA' ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* 1. Header con Toolbar */}
          <VoucherHeader
            empresaRazonSocial={empresaActual.razonSocial}
            empresaRuc={empresaActual.ruc}
            periodo={periodo}
            usuarioNombre={nombreOperador}
            subdiario={subdiario}
            subdiarioFijo={subdiarioFijo}
            numeroVoucher={numeroVoucher}
            fechaContable={fechaContable}
            fechaEmisionDocRef={fechaEmisionDocRef}
            moneda={moneda}
            tipoCambioCompra={tipoCambioCompra}
            tipoCambioVenta={tipoCambioVenta}
            glosaGeneral={glosaGeneral}
            estado={estadoVoucher}
            cuo={cuoVoucher}
            isPeriodoCerrado={isPeriodoCerrado}
            onSubdiarioChange={setSubdiario}
            onNumeroVoucherChange={setNumeroVoucher}
            onFechaContableChange={setFechaContable}
            onFechaEmisionDocRefChange={setFechaEmisionDocRef}
            onMonedaChange={setMoneda}
            onActualizarTipoCambio={() => setIsModalTcOpen(true)}
            onGlosaGeneralChange={setGlosaGeneral}
            onNuevo={handleNuevoVoucher}
            onGuardarBorrador={handleGuardarBorrador}
            onContabilizar={handleContabilizar}
            onImprimirVoucher={() => setIsPrintModalOpen(true)}
            onBuscar={() => setVistaModo('HISTORIAL')}
            onSeleccionarPlantilla={handleSeleccionarPlantilla}
            puedeContabilizar={puedeContabilizar}
          />

          {/* 2. Cuadrícula de 16 Columnas (Alta Densidad: 22-24px) */}
          <VoucherGrid
            filas={filas}
            moneda={moneda}
            tipoCambioVenta={tipoCambioVenta}
            readOnly={estadoVoucher === 'CONTABILIZADO'}
            activeCell={activeCell}
            onActiveCellChange={setActiveCell}
            onFilaChange={handleFilaChange}
            onEliminarFila={handleEliminarFila}
            onAgregarFila={handleAgregarFila}
            onOpenF2Catalogo={handleOpenF2Catalogo}
            erroresValidacionPorFila={erroresPorFila}
          />

          {/* 3. Totales de Partida Doble */}
          <VoucherTotals
            totalDebePen={totalDebePen}
            totalHaberPen={totalHaberPen}
            diferenciaPen={diferenciaPen}
            totalDebeUsd={totalDebeUsd}
            totalHaberUsd={totalHaberUsd}
            diferenciaUsd={diferenciaUsd}
            moneda={moneda}
            estaCuadrado={estaCuadrado}
            cantidadLineas={filas.length}
          />

          {/* 4. Barra de Estado de Escritorio */}
          <VoucherStatusBar
            empresaRuc={empresaActual.ruc}
            empresaRazonSocial={empresaActual.razonSocial}
            periodo={periodo}
            usuarioNombre={nombreOperador}
            usuarioRol={rolOperador}
            tipoCambioVenta={tipoCambioVenta}
            primerErrorValidacion={primerError}
            mensajeEstado={
              estadoVoucher === 'CONTABILIZADO'
                ? `Voucher contabilizado con CUO ${cuoVoucher || numeroVoucher}. Correlativo inmutable.`
                : undefined
            }
          />

          <ModalTipoCambioManual
            isOpen={isModalTcOpen}
            onClose={() => setIsModalTcOpen(false)}
            fechaInicial={fechaContable}
            onGuardado={(tc) => {
              setTipoCambioCompra(tc.compra);
              setTipoCambioVenta(tc.venta);
            }}
          />
        </div>
      ) : (
        /* Vista de Historial de Asientos */
        <div className="flex-1 p-4 bg-white overflow-y-auto">
          {/* Cabecera y Barra de Filtros */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-3 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-blue-600" />
              <div>
                <h2 className="font-bold text-slate-800 text-sm">
                  Lista de Asientos Registrados — Período {periodo}
                </h2>
                <p className="text-[11px] text-slate-500">
                  Mostrando {listaAsientosFiltrados.length} de {listaAsientos.length} asientos registrados en PostgreSQL
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  handleNuevoVoucher();
                  setVistaModo('CAPTURA');
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs rounded"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo Asiento [F10]</span>
              </button>
            </div>
          </div>

          {/* Filtros de subdiario, estado y búsqueda */}
          <div className="bg-slate-50 border border-slate-200 rounded p-2.5 mb-3 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-700">Subdiario:</span>
                <select
                  value={filtroSubdiario}
                  onChange={(e) => setFiltroSubdiario(e.target.value)}
                  className="bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  <option value="TODOS">Todos los subdiarios</option>
                  <option value="00">00 - Apertura</option>
                  <option value="01">01 - Compras</option>
                  <option value="02">02 - Ventas</option>
                  <option value="03">03 - Cobranzas y Caja</option>
                  <option value="04">04 - Pagos a Proveedores</option>
                  <option value="05">05 - Cuentas Corrientes</option>
                  <option value="06">06 - Honorarios</option>
                  <option value="07">07 - Planilla</option>
                  <option value="08">08 - Ajustes</option>
                  <option value="09">09 - Cierre</option>
                  <option value="10">10 - Diario General</option>
                  <option value="11">11 - Provisiones Varias</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-700">Estado:</span>
                <select
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value as any)}
                  className="bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  <option value="TODOS">Todos los estados</option>
                  <option value="CONTABILIZADO">Contabilizados</option>
                  <option value="BORRADOR">Borradores</option>
                  <option value="ANULADO">Anulados / Extornados</option>
                </select>
              </div>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={busquedaTexto}
                onChange={(e) => setBusquedaTexto(e.target.value)}
                placeholder="Buscar por glosa, voucher, CUO..."
                className="pl-8 pr-3 py-1 bg-white border border-slate-300 rounded text-xs w-64 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <table className="w-full border-collapse font-mono text-xs">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold">
                <th className="p-2 text-center w-24">Nº Voucher</th>
                <th className="p-2 text-center w-14">Subd</th>
                <th className="p-2 text-center w-24">Fecha</th>
                <th className="p-2 text-left">Glosa General</th>
                <th className="p-2 text-right w-28">Debe (S/)</th>
                <th className="p-2 text-right w-28">Haber (S/)</th>
                <th className="p-2 text-center w-28">Estado</th>
                <th className="p-2 text-center w-36">CUO</th>
                <th className="p-2 text-center w-36">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {listaAsientosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 font-sans">
                    No se encontraron asientos con los filtros seleccionados. Haga clic en &quot;Nuevo Asiento [F10]&quot; para registrar operaciones.
                  </td>
                </tr>
              ) : (
                listaAsientosFiltrados.map((a: any) => {
                  const subCod = (a.subdiario || a.subdiarioCodigo || a.subdiarioId || '').replace(/^sub-/, '').padStart(2, '0');
                  const fechaStr = a.fechaContable || a.fecha || '';
                  const glosaStr = a.glosaGeneral || a.glosa || '';
                  const esBorrador = a.estado === 'BORRADOR';
                  const esContabilizado = a.estado === 'CONTABILIZADO';

                  return (
                    <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td className="p-2 text-center font-bold text-slate-900">{a.numero || 'PROVISIONAL'}</td>
                      <td className="p-2 text-center">
                        <span className="px-1.5 py-0.5 bg-slate-200 text-slate-800 font-bold rounded text-[10px]">
                          {subCod}
                        </span>
                      </td>
                      <td className="p-2 text-center text-slate-700">{fechaStr}</td>
                      <td className="p-2 font-sans text-slate-800 truncate max-w-xs">{glosaStr}</td>
                      <td className="p-2 text-right font-bold text-slate-900">{Number(a.totalDebe || 0).toFixed(2)}</td>
                      <td className="p-2 text-right font-bold text-slate-900">{Number(a.totalHaber || 0).toFixed(2)}</td>
                      <td className="p-2 text-center">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                          esContabilizado
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : a.estado === 'ANULADO'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}>
                          {a.estado}
                        </span>
                      </td>
                      <td className="p-2 text-center text-slate-600 text-[11px]">{a.cuo || '—'}</td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {/* Ver Reporte */}
                          <button
                            onClick={() => {
                              setNumeroVoucher(a.numero || 'PROVISIONAL');
                              setSubdiario(subCod);
                              setFechaContable(fechaStr);
                              setGlosaGeneral(glosaStr);
                              if (a.detalles && a.detalles.length > 0) {
                                setFilas(
                                  a.detalles.map((d: any, idx: number) => ({
                                    linea: idx + 1,
                                    codigoCuenta: d.cuentaCodigo || d.cuentaId,
                                    denominacion: d.cuentaDenominacion || d.cuentaNombre || '',
                                    centroCosto: d.centroCosto || '',
                                    anexoTipoDoc: d.anexoTipoDoc || '6',
                                    anexoNumDoc: d.anexoNumDoc || '',
                                    anexoNombre: d.anexoNombre || '',
                                    tipoComprobante: d.tipoComprobante || '01',
                                    serieComprobante: d.serieComprobante || '',
                                    numeroComprobante: d.numeroComprobante || '',
                                    fechaEmisionDoc: d.fechaEmisionDoc || fechaStr,
                                    fechaVencimientoDoc: d.fechaVencimientoDoc || '',
                                    glosaLinea: d.glosaLinea || glosaStr,
                                    debe: Number(d.debe) || 0,
                                    haber: Number(d.haber) || 0,
                                    debeUsd: 0,
                                    haberUsd: 0,
                                    cuo: a.cuo,
                                  }))
                                );
                              }
                              setIsPrintModalOpen(true);
                            }}
                            className="p-1 hover:bg-slate-200 border border-slate-300 rounded text-slate-700 cursor-pointer"
                            title="Ver voucher contable / imprimir"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Editar Borrador */}
                          {esBorrador && !isPeriodoCerrado && (
                            <button
                              onClick={() => {
                                setAsientoId(a.id);
                                setSubdiario(subCod);
                                setNumeroVoucher(a.numero || 'PROVISIONAL');
                                setFechaContable(fechaStr);
                                setGlosaGeneral(glosaStr);
                                setEstadoVoucher(a.estado);
                                setCuoVoucher(a.cuo);
                                if (a.detalles && a.detalles.length > 0) {
                                  setFilas(
                                    a.detalles.map((d: any, idx: number) => ({
                                      linea: idx + 1,
                                      codigoCuenta: d.cuentaCodigo || d.cuentaId,
                                      denominacion: d.cuentaDenominacion || d.cuentaNombre || '',
                                      centroCosto: d.centroCosto || '',
                                      anexoTipoDoc: d.anexoTipoDoc || '6',
                                      anexoNumDoc: d.anexoNumDoc || '',
                                      anexoNombre: d.anexoNombre || '',
                                      tipoComprobante: d.tipoComprobante || '01',
                                      serieComprobante: d.serieComprobante || '',
                                      numeroComprobante: d.numeroComprobante || '',
                                      fechaEmisionDoc: d.fechaEmisionDoc || fechaStr,
                                      fechaVencimientoDoc: d.fechaVencimientoDoc || '',
                                      glosaLinea: d.glosaLinea || glosaStr,
                                      debe: Number(d.debe) || 0,
                                      haber: Number(d.haber) || 0,
                                      debeUsd: 0,
                                      haberUsd: 0,
                                      cuo: a.cuo,
                                    }))
                                  );
                                }
                                setVistaModo('CAPTURA');
                              }}
                              className="p-1 hover:bg-blue-100 border border-blue-300 rounded text-blue-700 cursor-pointer"
                              title="Editar borrador en captura de voucher"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Contabilizar Borrador */}
                          {esBorrador && !isPeriodoCerrado && (
                            <button
                              onClick={() => handleContabilizarAsientoId(a.id)}
                              className="p-1 hover:bg-emerald-100 border border-emerald-400 rounded text-emerald-700 cursor-pointer"
                              title="Contabilizar directamente este borrador"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Anular con extorno */}
                          {esContabilizado && !isPeriodoCerrado && (
                            <button
                              onClick={() => handleAnularAsiento(a.id, a.numero)}
                              className="p-1 hover:bg-rose-100 border border-rose-300 rounded text-rose-700 cursor-pointer"
                              title="Anular asiento con extorno inmutable"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Duplicar */}
                          <button
                            onClick={() => handleDuplicarAsiento(a.id)}
                            className="p-1 hover:bg-slate-200 border border-slate-300 rounded text-slate-700 cursor-pointer"
                            title="Duplicar como nuevo borrador"
                          >
                            <Copy className="w-3.5 h-3.5" />
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
      )}

      {/* Diálogo F2 de Catálogo PCGE */}
      <CatalogoCuentasDialog
        isOpen={isCatalogoOpen}
        onClose={() => setIsCatalogoOpen(false)}
        onSelectCuenta={handleSelectCuenta}
      />

      {/* Modal de Impresión Oficial en Formato Estándar */}
      {isPrintModalOpen && (
        <VisorReporteModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          definicion={definicionVoucherReporte}
        />
      )}
    </div>
  );
};
