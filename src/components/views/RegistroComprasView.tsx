import React, { useState, useEffect, useRef } from 'react';
import { 
  FileSpreadsheet, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle,
  Download,
  Calendar,
  Sparkles,
  FileText,
  Plus,
  Copy,
  Trash2,
  Ban,
  Keyboard,
  ArrowRight,
  Eye,
  RefreshCw,
  Coins,
  Building2,
  ShieldCheck,
  ShieldAlert,
  Info,
  Loader2,
  Receipt,
  Split,
  Layers
} from 'lucide-react';
import { Comprobante, EmpresaCliente } from '../../types';
import { 
  useComprasList, 
  useRegistroComprasLibro, 
  useCrearCompra, 
  useAnularCompra, 
  useDuplicarCompra, 
  useAnexosList, 
  useCrearAnexo,
  useConsultarRuc 
} from '../../hooks/useOperaciones';
import { operacionesApi } from '../../api/operacionesApi';
import { generarSireRceTxt, exportarComprobantesCsv } from '../../services/sireTxtGenerator';
import { VisorDocumentoSunatModal } from '../modals/VisorDocumentoSunatModal';
import { useReportStyle } from '../../context/ReportStyleContext';
import { construirDefinicionRegistroComprasEstandar } from '../../services/reports/formato_estandar/formatoEstandarEngine';
import { CATALOGO_OFICIAL_DETRACCIONES_SUNAT, buscarDetraccionPorCodigo } from '../../data/detraccionesCatalogo';
import { VisorReporteModal } from '../modals/VisorReporteModal';
import { useToast } from '../../context/ToastContext';
import { EmptyStateInstructivo } from '../common/EmptyStateInstructivo';

interface RegistroComprasViewProps {
  compras: Comprobante[];
  empresa: EmpresaCliente;
  periodo: string;
  onGenerarAsientos?: () => void;
  onUpdateCuentaContable?: (id: string, cuenta: string) => void;
}

export const RegistroComprasView: React.FC<RegistroComprasViewProps> = ({
  compras: legacyCompras,
  empresa,
  periodo,
  onGenerarAsientos
}) => {
  const { success, error } = useToast();
  const { reportStyle } = useReportStyle();
  const [modalEstandarOpen, setModalEstandarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'LIBRO' | 'DIGITACION'>('LIBRO');
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');
  const [comprobanteVisor, setComprobanteVisor] = useState<any | null>(null);

  // Modal confirmación anular
  const [modalAnular, setModalAnular] = useState<{ isOpen: boolean; id: string; serieNumero: string; motivo: string }>({
    isOpen: false,
    id: '',
    serieNumero: '',
    motivo: 'Error en digitación de importes'
  });

  // Modal Alta Rápida de Proveedor
  const [modalAltaProveedor, setModalAltaProveedor] = useState(false);
  const [nuevoProvRuc, setNuevoProvRuc] = useState('');
  const [nuevoProvRazon, setNuevoProvRazon] = useState('');
  const [nuevoProvDireccion, setNuevoProvDireccion] = useState('');
  const [nuevoProvCondicion, setNuevoProvCondicion] = useState<'HABIDO' | 'NO_HABIDO'>('HABIDO');

  // Hooks API
  const { data: comprasApiData, isLoading: loadingList, refetch: refetchCompras } = useComprasList(empresa.id, {
    periodoId: periodo
  });
  const { data: libroReporte, refetch: refetchLibro } = useRegistroComprasLibro(empresa.id, periodo);
  const { data: anexosList = [] } = useAnexosList(empresa.id, undefined, 'PROVEEDOR');
  
  const crearCompraMutation = useCrearCompra(empresa.id);
  const anularCompraMutation = useAnularCompra(empresa.id);
  const duplicarCompraMutation = useDuplicarCompra(empresa.id);
  const crearAnexoMutation = useCrearAnexo(empresa.id);
  const consultarRucMutation = useConsultarRuc(empresa.id);

  // Estados de Consulta RUC en Tiempo Real (SUNAT + Caché PostgreSQL)
  const [rucBusquedaDirecta, setRucBusquedaDirecta] = useState('');
  const [resultadoConsultaRuc, setResultadoConsultaRuc] = useState<any | null>(null);
  const [errorConsultaRuc, setErrorConsultaRuc] = useState<string | null>(null);
  const [consultandoModalRuc, setConsultandoModalRuc] = useState(false);

  // Formulario Digitación y Asistente Completo (Teclado Primero)
  const [formTipo, setFormTipo] = useState<'01' | '03' | '07' | '08' | '14'>('01');
  const [formSerie, setFormSerie] = useState('F001');
  const [formNumero, setFormNumero] = useState('');
  const [formFechaEmision, setFormFechaEmision] = useState(() => new Date().toISOString().substring(0, 10));
  const [formFechaVencimiento, setFormFechaVencimiento] = useState(() => new Date().toISOString().substring(0, 10));
  const [formFechaContable, setFormFechaContable] = useState(() => new Date().toISOString().substring(0, 10));
  const [formProveedorId, setFormProveedorId] = useState('');
  const [busquedaProveedor, setBusquedaProveedor] = useState('');
  const [formGlosa, setFormGlosa] = useState('');

  // Bases imponibles y tributos
  const [formBase, setFormBase] = useState<number>(0); // Destino 1 (Gravada 100% crédito fiscal)
  const [formBaseDestino2, setFormBaseDestino2] = useState<number>(0); // Destino 2 (Prorrata)
  const [formBaseDestino3, setFormBaseDestino3] = useState<number>(0); // Destino 3 (Sin crédito / Costo)
  const [formBaseNoGravada, setFormBaseNoGravada] = useState<number>(0); // No gravada / Exonerada
  const [formExonerado, setFormExonerado] = useState<number>(0);
  const [formIsc, setFormIsc] = useState<number>(0);
  const [formIcbper, setFormIcbper] = useState<number>(0);
  const [formOtrosTributos, setFormOtrosTributos] = useState<number>(0);
  const [formTasaIgv, setFormTasaIgv] = useState<number>(0.18);
  const [formIgv, setFormIgv] = useState<number>(0);
  const [formTotal, setFormTotal] = useState<number>(0);

  const [formTipoAdquisicion, setFormTipoAdquisicion] = useState<'1' | '2' | '3' | '4'>('1');
  const [formCuentaCompra, setFormCuentaCompra] = useState<string>('60111');
  const [formMoneda, setFormMoneda] = useState<'PEN' | 'USD'>('PEN');
  const [formTipoCambio, setFormTipoCambio] = useState<number>(1.0);
  const [formFormaPago, setFormFormaPago] = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  const [formDiasCredito, setFormDiasCredito] = useState<number>(30);
  const [formEsServicio, setFormEsServicio] = useState(false);

  // Regímenes de Recaudación: Detracción SPOT
  const [formTieneDetraccion, setFormTieneDetraccion] = useState(false);
  const [formCodigoBienDetraccion, setFormCodigoBienDetraccion] = useState<string>('022');
  const [formPctDetraccion, setFormPctDetraccion] = useState<number>(12);
  const [formMontoDetraccion, setFormMontoDetraccion] = useState<number>(0);
  const [formJustificacionTasaDetraccion, setFormJustificacionTasaDetraccion] = useState('');
  const [formNroConstanciaDetraccion, setFormNroConstanciaDetraccion] = useState('');
  const [formFechaDetraccion, setFormFechaDetraccion] = useState('');

  // Regímenes de Recaudación: Percepción de IGV
  const [formTienePercepcion, setFormTienePercepcion] = useState(false);
  const [formPctPercepcion, setFormPctPercepcion] = useState<number>(2.0);
  const [formMontoPercepcion, setFormMontoPercepcion] = useState<number>(0);
  const [formSeriePercepcion, setFormSeriePercepcion] = useState('');
  const [formNumeroPercepcion, setFormNumeroPercepcion] = useState('');

  // Regímenes de Recaudación: Retención de IGV
  const [formTieneRetencion, setFormTieneRetencion] = useState(false);
  const [formPctRetencion, setFormPctRetencion] = useState<number>(3.0);
  const [formMontoRetencion, setFormMontoRetencion] = useState<number>(0);
  const [formSerieRetencion, setFormSerieRetencion] = useState('');
  const [formNumeroRetencion, setFormNumeroRetencion] = useState('');

  // Desglose Contable Multilínea (Cuentas y Centros de Costo)
  const [modoDesglose, setModoDesglose] = useState(false);
  const [lineasDesglose, setLineasDesglose] = useState<Array<{
    id: string;
    cuentaCodigo: string;
    denominacion: string;
    monto: number;
    centroCostoId: string;
    glosa: string;
  }>>([
    { id: '1', cuentaCodigo: '60111', denominacion: 'Mercaderías manufacturadas - Costo', monto: 0, centroCostoId: 'CC-ADM', glosa: 'Compra mercaderías' }
  ]);

  // Previsualización de Asiento
  const [previewAsiento, setPreviewAsiento] = useState<any | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  // Proveedor seleccionado y advertencias
  const proveedorSeleccionado = anexosList.find((a: any) => a.id === formProveedorId);

  // Cálculo automático de Base / IGV / Total con sincronización
  const recalcularTotales = (
    base1: number,
    base2: number,
    base3: number,
    noGrav: number,
    exon: number,
    isc: number,
    icb: number,
    otros: number,
    tasa: number
  ) => {
    const calcIgv = Number(((base1 + base2) * tasa).toFixed(2));
    const calcTotal = Number((base1 + base2 + base3 + noGrav + exon + isc + icb + otros + calcIgv).toFixed(2));
    setFormIgv(calcIgv);
    setFormTotal(calcTotal);

    if (formTieneDetraccion) {
      setFormMontoDetraccion(Number((calcTotal * (formPctDetraccion / 100)).toFixed(2)));
    }
    if (formTienePercepcion) {
      setFormMontoPercepcion(Number((calcTotal * (formPctPercepcion / 100)).toFixed(2)));
    }
    if (formTieneRetencion) {
      setFormMontoRetencion(Number((calcTotal * (formPctRetencion / 100)).toFixed(2)));
    }
  };

  const handleBaseChange = (valor: number) => {
    setFormBase(valor);
    recalcularTotales(valor, formBaseDestino2, formBaseDestino3, formBaseNoGravada, formExonerado, formIsc, formIcbper, formOtrosTributos, formTasaIgv);
  };

  const handleTotalChange = (valor: number) => {
    setFormTotal(valor);
    // En ingreso directo por total, asumimos destino 1 simple salvo que haya conceptos adicionales
    const otrosComponentes = formBaseDestino2 + formBaseDestino3 + formBaseNoGravada + formExonerado + formIsc + formIcbper + formOtrosTributos;
    const montoParaGravada = Math.max(0, valor - otrosComponentes);
    const calcBase = Number((montoParaGravada / (1 + formTasaIgv)).toFixed(2));
    const calcIgv = Number((montoParaGravada - calcBase).toFixed(2));
    setFormBase(calcBase);
    setFormIgv(calcIgv);

    if (formTieneDetraccion) {
      setFormMontoDetraccion(Number((valor * (formPctDetraccion / 100)).toFixed(2)));
    }
    if (formTienePercepcion) {
      setFormMontoPercepcion(Number((valor * (formPctPercepcion / 100)).toFixed(2)));
    }
    if (formTieneRetencion) {
      setFormMontoRetencion(Number((valor * (formPctRetencion / 100)).toFixed(2)));
    }
  };

  // Previsualizar asiento en tiempo real con reglas completas (bases, tributos, detracciones, percepciones, retenciones y desglose)
  useEffect(() => {
    if (formTotal > 0) {
      setLoadingPreview(true);
      const timer = setTimeout(async () => {
        try {
          const metodo = (empresa as any)?.metodoInventario || 'PERMANENTE';
          const lineas: any[] = [];

          // 1. Cuentas de Gasto / Costo
          if (modoDesglose && lineasDesglose.length > 0) {
            for (const ld of lineasDesglose) {
              if (ld.monto > 0) {
                lineas.push({
                  codigoCuenta: ld.cuentaCodigo === '6011' ? '60111' : (ld.cuentaCodigo || '60111'),
                  denominacion: ld.denominacion || 'Compra / Gasto desglosado',
                  glosaLinea: ld.glosa || `Gasto ${ld.cuentaCodigo} ${formSerie}-${formNumero || '00000001'}`,
                  debe: Number(ld.monto),
                  haber: 0,
                  centroCosto: ld.centroCostoId
                });
              }
            }
          } else {
            const costoGravado = formBase + formBaseDestino2 + (formTipoAdquisicion === '3' ? formIgv : 0);
            if (costoGravado > 0) {
              lineas.push({
                codigoCuenta: formCuentaCompra,
                denominacion: 'Mercaderías manufacturadas - Costo',
                glosaLinea: `Compra ${formSerie}-${formNumero || '00000001'} (Destino ${formTipoAdquisicion})`,
                debe: Number(costoGravado.toFixed(2)),
                haber: 0
              });
            }
          }

          // Adquisición No Gravada / Exonerada adicional
          const costoNoGravado = formBaseNoGravada + formExonerado;
          if (costoNoGravado > 0 && formTipoAdquisicion !== '4') {
            lineas.push({
              codigoCuenta: formCuentaCompra,
              denominacion: 'Mercaderías manufacturadas - Adquisiciones no gravadas',
              glosaLinea: `Operaciones no gravadas ${formSerie}-${formNumero || '00000001'}`,
              debe: Number(costoNoGravado.toFixed(2)),
              haber: 0
            });
          } else if (formTipoAdquisicion === '4') {
            lineas.push({
              codigoCuenta: formCuentaCompra,
              denominacion: 'Mercaderías manufacturadas - No gravadas (Destino 4)',
              glosaLinea: `Compra no gravada ${formSerie}-${formNumero || '00000001'}`,
              debe: Number(formTotal.toFixed(2)),
              haber: 0
            });
          }

          // 2. Crédito Fiscal IGV (Cuentas 40111)
          if (formTipoAdquisicion !== '3' && formTipoAdquisicion !== '4' && formIgv > 0) {
            lineas.push({
              codigoCuenta: '40111',
              denominacion: `IGV ${(formTasaIgv * 100).toFixed(0)}% crédito fiscal`,
              glosaLinea: `Crédito fiscal IGV compra ${formSerie}-${formNumero || '00000001'}`,
              debe: Number(formIgv.toFixed(2)),
              haber: 0
            });
          }

          // 3. Tributos Complementarios (ISC, ICBPER, Otros Tributos)
          if (formIsc > 0) {
            lineas.push({
              codigoCuenta: '6412',
              denominacion: 'Impuesto selectivo al consumo',
              glosaLinea: `ISC compra ${formSerie}-${formNumero || '00000001'}`,
              debe: Number(formIsc.toFixed(2)),
              haber: 0
            });
          }

          if (formIcbper > 0) {
            lineas.push({
              codigoCuenta: '6413',
              denominacion: 'Impuesto bolsas de plástico (ICBPER)',
              glosaLinea: `ICBPER ${formSerie}-${formNumero || '00000001'}`,
              debe: Number(formIcbper.toFixed(2)),
              haber: 0
            });
          }

          if (formOtrosTributos > 0) {
            lineas.push({
              codigoCuenta: '6491',
              denominacion: 'Otros tributos y recargos no gravados',
              glosaLinea: `Otros tributos ${formSerie}-${formNumero || '00000001'}`,
              debe: Number(formOtrosTributos.toFixed(2)),
              haber: 0
            });
          }

          // 4. Percepción de IGV (Cuenta 40113 al Debe)
          const montoPercep = formTienePercepcion && formMontoPercepcion > 0 ? formMontoPercepcion : 0;
          if (montoPercep > 0) {
            lineas.push({
              codigoCuenta: '40113',
              denominacion: 'IGV - Régimen de percepciones',
              glosaLinea: `Percepción IGV ${formSeriePercepcion}-${formNumeroPercepcion}`,
              debe: Number(montoPercep.toFixed(2)),
              haber: 0
            });
          }

          // 5. Proveedor y Pasivos Comerciales (4212, 4213, 40114)
          const totalFinanciero = formTotal + montoPercep;
          const montoDet = formTieneDetraccion && formMontoDetraccion > 0 ? formMontoDetraccion : 0;
          const montoRet = formTieneRetencion && formMontoRetencion > 0 ? formMontoRetencion : 0;
          const netoPagar = Math.max(0, Number((totalFinanciero - montoDet - montoRet).toFixed(2)));

          lineas.push({
            codigoCuenta: '4212',
            denominacion: 'Facturas por pagar - Emitidas',
            glosaLinea: `Obligación neta por compra ${formSerie}-${formNumero || '00000001'}`,
            debe: 0,
            haber: netoPagar
          });

          if (montoDet > 0) {
            lineas.push({
              codigoCuenta: '4213',
              denominacion: 'Detracciones por pagar (SPOT Banco de la Nación)',
              glosaLinea: `Detracción SPOT ${formCodigoBienDetraccion} (${formPctDetraccion}%)`,
              debe: 0,
              haber: Number(montoDet.toFixed(2))
            });
          }

          if (montoRet > 0) {
            lineas.push({
              codigoCuenta: '40114',
              denominacion: 'IGV - Régimen de retenciones',
              glosaLinea: `Retención IGV 3% ${formSerieRetencion}-${formNumeroRetencion}`,
              debe: 0,
              haber: Number(montoRet.toFixed(2))
            });
          }

          // 6. Destino al Almacén (SOLO en método PERMANENTE si cuenta empieza con '60')
          if (metodo === 'PERMANENTE' && (formCuentaCompra.startsWith('60') || (modoDesglose && lineasDesglose.some(l => l.cuentaCodigo.startsWith('60'))))) {
            const baseCostoAlmacen = formBase + formBaseDestino2 + (formTipoAdquisicion === '3' ? formIgv : 0) + costoNoGravado;
            if (baseCostoAlmacen > 0) {
              lineas.push({
                codigoCuenta: '20111',
                denominacion: 'Mercaderías manufacturadas - Costo almacén',
                glosaLinea: 'Destino de existencias al almacén',
                debe: Number(baseCostoAlmacen.toFixed(2)),
                haber: 0
              });
              lineas.push({
                codigoCuenta: '6111',
                denominacion: 'Variación de existencias - Mercaderías',
                glosaLinea: 'Variación de existencias',
                debe: 0,
                haber: Number(baseCostoAlmacen.toFixed(2))
              });
            }
          }

          const sumDebe = Number(lineas.reduce((acc, l) => acc + l.debe, 0).toFixed(2));
          const sumHaber = Number(lineas.reduce((acc, l) => acc + l.haber, 0).toFixed(2));
          const dif = Math.abs(Number((sumDebe - sumHaber).toFixed(2)));

          setPreviewAsiento({
            glosaGeneral: formGlosa || `Compra ${formTipo} ${formSerie}-${formNumero || '00000001'}`,
            lineas,
            totalDebe: sumDebe,
            totalHaber: sumHaber,
            diferenciaCuadre: dif,
            cuadrado: dif === 0,
            metodoInventario: metodo
          });
        } catch {
          // ignore transient preview error
        } finally {
          setLoadingPreview(false);
        }
      }, 250);
      return () => clearTimeout(timer);
    } else {
      setPreviewAsiento(null);
    }
  }, [
    formTotal,
    formBase,
    formBaseDestino2,
    formBaseDestino3,
    formBaseNoGravada,
    formExonerado,
    formIsc,
    formIcbper,
    formOtrosTributos,
    formTasaIgv,
    formIgv,
    formTipo,
    formSerie,
    formNumero,
    formGlosa,
    formCuentaCompra,
    formTipoAdquisicion,
    formEsServicio,
    formProveedorId,
    formTieneDetraccion,
    formPctDetraccion,
    formMontoDetraccion,
    formTienePercepcion,
    formMontoPercepcion,
    formTieneRetencion,
    formMontoRetencion,
    modoDesglose,
    lineasDesglose,
    (empresa as any)?.metodoInventario
  ]);

  // Atajos de teclado: Ctrl+Enter (Registrar), Ctrl+N (Nuevo), Ctrl+D (Duplicar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRegistrar();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        limpiarFormulario();
        setActiveTab('DIGITACION');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formTipo, formSerie, formNumero, formProveedorId, formTotal, formBase, formIgv, formTipoAdquisicion, formFormaPago, formTieneDetraccion]);

  const limpiarFormulario = () => {
    setFormNumero('');
    setFormBase(0);
    setFormBaseDestino2(0);
    setFormBaseDestino3(0);
    setFormBaseNoGravada(0);
    setFormExonerado(0);
    setFormIsc(0);
    setFormIcbper(0);
    setFormOtrosTributos(0);
    setFormIgv(0);
    setFormTotal(0);
    setFormGlosa('');
    setFormTieneDetraccion(false);
    setFormMontoDetraccion(0);
    setFormNroConstanciaDetraccion('');
    setFormFechaDetraccion('');
    setFormTienePercepcion(false);
    setFormMontoPercepcion(0);
    setFormSeriePercepcion('');
    setFormNumeroPercepcion('');
    setFormTieneRetencion(false);
    setFormMontoRetencion(0);
    setFormSerieRetencion('');
    setFormNumeroRetencion('');
    setModoDesglose(false);
    setBannerError(null);
  };

  const handleRegistrar = async (comoBorrador = false) => {
    setBannerError(null);
    if (!formSerie || !formNumero) {
      setBannerError('Debe ingresar la serie y el número de comprobante.');
      return;
    }
    if (!formProveedorId) {
      setBannerError('Debe seleccionar o registrar un proveedor.');
      return;
    }
    if (formTotal <= 0) {
      setBannerError('El total debe ser mayor a cero.');
      return;
    }

    if (formTieneRetencion && formTienePercepcion) {
      setBannerError('Incompatibilidad tributaria: Un comprobante no puede estar sujeto simultáneamente a Retención y Percepción de IGV.');
      return;
    }

    if (formTieneDetraccion) {
      const itemOficial = buscarDetraccionPorCodigo(formCodigoBienDetraccion);
      const difiereTasa = itemOficial && Math.abs(formPctDetraccion - itemOficial.porcentaje) > 0.01;
      if (difiereTasa && (!formJustificacionTasaDetraccion || formJustificacionTasaDetraccion.trim().length < 5)) {
        setBannerError(`La tasa de detracción ingresada (${formPctDetraccion}%) difiere de la oficial (${itemOficial?.porcentaje}%). Ingrese la justificación de la tasa especial.`);
        return;
      }
    }

    try {
      await crearCompraMutation.mutateAsync({
        periodoId: periodo,
        fechaEmision: formFechaEmision,
        fechaVencimiento: formFechaVencimiento || (formFormaPago === 'CREDITO' ? new Date(Date.now() + formDiasCredito * 86400000).toISOString().substring(0, 10) : formFechaEmision),
        fechaContable: formFechaContable,
        tipoComprobante: formTipo,
        serie: formSerie.toUpperCase(),
        numero: formNumero,
        proveedorId: formProveedorId,
        moneda: formMoneda,
        tipoCambio: formTipoCambio,
        baseGravada: formBase,
        baseGravadaDestino2: formBaseDestino2,
        baseGravadaDestino3: formBaseDestino3,
        baseNoGravada: formBaseNoGravada,
        exonerado: formExonerado,
        isc: formIsc,
        icbper: formIcbper,
        otrosTributos: formOtrosTributos,
        tasaIgv: formTasaIgv,
        igv: formIgv,
        total: formTotal,
        tipoAdquisicion: formTipoAdquisicion,
        cuentaCompra: formCuentaCompra,
        desgloseCuentas: modoDesglose ? lineasDesglose.filter(l => l.monto > 0).map(l => ({
          cuentaCodigo: l.cuentaCodigo,
          denominacion: l.denominacion,
          monto: l.monto,
          centroCostoId: l.centroCostoId,
          glosa: l.glosa
        })) : undefined,
        formaPago: formFormaPago,
        diasCredito: formDiasCredito,
        tieneDetraccion: formTieneDetraccion,
        codigoBienDetraccion: formCodigoBienDetraccion,
        porcentajeDetraccion: formPctDetraccion,
        montoDetraccion: formMontoDetraccion,
        justificacionTasaDetraccion: formJustificacionTasaDetraccion,
        tieneRetencion: formTieneRetencion,
        porcentajeRetencion: formPctRetencion,
        montoRetencion: formMontoRetencion,
        tienePercepcion: formTienePercepcion,
        porcentajePercepcion: formPctPercepcion,
        montoPercepcion: formMontoPercepcion,
        seriePercepcion: formSeriePercepcion,
        numeroPercepcion: formNumeroPercepcion,
        esServicio: formEsServicio,
        glosa: formGlosa || `Compra ${formTipo} ${formSerie}-${formNumero}`,
        estado: comoBorrador ? 'BORRADOR' : 'REGISTRADO'
      });

      limpiarFormulario();
      refetchCompras();
      refetchLibro();
      setActiveTab('LIBRO');
      success(
        comoBorrador ? 'Comprobante guardado como borrador.' : 'Comprobante contabilizado y registrado en subdiario.',
        'Registro Exitoso'
      );
    } catch (err: any) {
      setBannerError(err?.response?.data?.message || err.message);
    }
  };

  const handleCrearProveedorRapido = async () => {
    if (!nuevoProvRuc || !nuevoProvRazon) return;
    try {
      const nuevo = await crearAnexoMutation.mutateAsync({
        tipoDocumento: '6',
        numeroDocumento: nuevoProvRuc,
        razonSocial: nuevoProvRazon,
        direccion: nuevoProvDireccion,
        tipoEntidad: 'PROVEEDOR',
        condicionSunat: nuevoProvCondicion,
        estadoSunat: 'ACTIVO'
      });
      setFormProveedorId(nuevo.id);
      setModalAltaProveedor(false);
      setNuevoProvRuc('');
      setNuevoProvRazon('');
      setNuevoProvDireccion('');
      success('Proveedor registrado en el catálogo de anexos con éxito.', 'Proveedor Guardado');
    } catch (err: any) {
      error('Error registrando proveedor: ' + (err?.response?.data?.message || err.message), 'Fallo al Guardar');
    }
  };

  const handleConsultarRucEnRegistro = async (forzar = false) => {
    const ruc = rucBusquedaDirecta.trim().replace(/\D/g, '');
    if (!ruc) {
      setErrorConsultaRuc('Ingrese un RUC de 11 dígitos');
      return;
    }
    if (ruc.length !== 11) {
      setErrorConsultaRuc('El RUC debe tener exactamente 11 dígitos');
      return;
    }

    setErrorConsultaRuc(null);
    try {
      const res = await consultarRucMutation.mutateAsync({ ruc, tipoEntidad: 'PROVEEDOR', forzar });
      setResultadoConsultaRuc(res);
      if (res.anexoId) {
        setFormProveedorId(res.anexoId);
      }
      if (res.condicion === 'NO_HABIDO') {
        error(
          'El proveedor figura como NO HABIDO en SUNAT. Según Art. 65-A TUO IGV y Art. 44 TUO LIR, no permite deducir crédito fiscal.',
          'Alerta Tributaria SUNAT'
        );
      } else if (res.estado !== 'ACTIVO') {
        error(
          `El proveedor figura en estado ${res.estado} en SUNAT. Los comprobantes carecen de validez fiscal durante baja o suspensión.`,
          'Alerta Tributaria SUNAT'
        );
      } else {
        success(
          `${res.razonSocial} (${res.origen === 'CACHE_LOCAL' ? 'Caché PostgreSQL' : 'SUNAT en Vivo'})`,
          'RUC Verificado'
        );
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || 'Error al consultar RUC';
      setErrorConsultaRuc(msg);
      error(msg, 'Error Consulta RUC');
    }
  };

  const handleConsultarRucEnModal = async () => {
    const ruc = nuevoProvRuc.trim().replace(/\D/g, '');
    if (ruc.length !== 11) {
      error('El RUC debe contener exactamente 11 dígitos', 'RUC Incompleto');
      return;
    }
    setConsultandoModalRuc(true);
    try {
      const res = await consultarRucMutation.mutateAsync({ ruc, tipoEntidad: 'PROVEEDOR' });
      setNuevoProvRazon(res.razonSocial);
      setNuevoProvDireccion(res.direccion || '');
      setNuevoProvCondicion(res.condicion || 'HABIDO');
      success(`Datos SUNAT cargados: ${res.razonSocial}`, 'Consulta Exitosa');
    } catch (err: any) {
      error(err?.response?.data?.message || err.message || 'Error consultando SUNAT', 'Fallo de Consulta');
    } finally {
      setConsultandoModalRuc(false);
    }
  };

  const handleConfirmarAnular = async () => {
    if (!modalAnular.id || !modalAnular.motivo) return;
    try {
      await anularCompraMutation.mutateAsync({ id: modalAnular.id, motivo: modalAnular.motivo });
      setModalAnular({ isOpen: false, id: '', serieNumero: '', motivo: '' });
      refetchCompras();
      refetchLibro();
      success('Comprobante de compra anulado conforme a normativa SUNAT.', 'Compra Anulada');
    } catch (err: any) {
      error('Error anulando comprobante: ' + (err?.response?.data?.message || err.message), 'Fallo de Anulación');
    }
  };

  // Combinar compras de la API o usar compras de sesión
  const itemsCompras = comprasApiData?.items && comprasApiData.items.length > 0 
    ? comprasApiData.items 
    : legacyCompras.map(c => ({
        id: c.id,
        tipoComprobante: (c as any).tipoComprobante || c.tipoDoc,
        serie: c.serie,
        numero: c.numero,
        fechaEmision: c.fechaEmision,
        proveedorNombre: c.razonSocialEmisor,
        proveedorRuc: c.rucEmisor,
        baseGravada: c.baseImponibleGravada,
        igv: c.igv,
        adquisicionesNoGravadas: (c as any).adquisicionesNoGravadas ?? (c as any).baseNoGravada ?? 0,
        otrosTributos: (c as any).otrosTributos ?? 0,
        total: c.total,
        tipoAdquisicion: '1',
        estado: 'REGISTRADO',
        asientoNumero: '01090001'
      }));

  const filtrados = itemsCompras.filter((c: any) => {
    if (filtroTipo !== 'TODOS' && c.tipoComprobante !== filtroTipo) return false;
    if (filtroEstado !== 'TODOS' && c.estado !== filtroEstado) return false;
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      (c.proveedorNombre && c.proveedorNombre.toLowerCase().includes(q)) ||
      (c.proveedorRuc && c.proveedorRuc.includes(q)) ||
      `${c.serie}-${c.numero}`.toLowerCase().includes(q)
    );
  });

  const cuadre = libroReporte?.cuadreLibroDiario;

  return (
    <div className="space-y-4">
      {/* Top Banner Navigation & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            Registro de Compras Electrónico (RCE) — Formato SIRE 8.4
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Digitación rápida de teclado, contabilización automática por reglas PCGE, libro oficial y cuadre con Libro Diario.
          </p>
        </div>

        {/* Tab switcher & New Button */}
        <div className="flex items-center gap-2">
          <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveTab('LIBRO')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'LIBRO' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Consulta Libro (8.4)
            </button>
            <button
              onClick={() => setActiveTab('DIGITACION')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'DIGITACION' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              Digitación Rápida
              <span className="text-[10px] opacity-75 font-mono">(Ctrl+N)</span>
            </button>
          </div>

          <button
            onClick={() => setModalEstandarOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            title="Abrir vista previa y exportación del Registro de Compras"
          >
            <FileText className="w-4 h-4 text-slate-700" />
            <span>Reporte</span>
          </button>
        </div>
      </div>

      {/* Indicador de Cuadre con Libro Diario Banner */}
      {itemsCompras.length === 0 ? (
        <div className="p-3 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-3 text-xs bg-slate-50 border-slate-200 text-slate-700">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-slate-200 text-slate-700">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold flex items-center gap-2">
                <span>Sin movimientos en el período</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white border border-slate-200 text-slate-600">
                  Periodo {periodo}
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                No se registran comprobantes de compras en el período seleccionado.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] shrink-0 text-slate-500">
            <span>IGV Registro: <strong>S/ 0.00</strong></span>
            <span>|</span>
            <span>Cuenta 40111: <strong>S/ 0.00</strong></span>
          </div>
        </div>
      ) : (
        <div className={`p-3 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-3 text-xs ${
          cuadre?.estaCuadrado !== false
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}>
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${cuadre?.estaCuadrado !== false ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'}`}>
              {cuadre?.estaCuadrado !== false ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </div>
            <div>
              <div className="font-bold flex items-center gap-2">
                <span>{cuadre?.estaCuadrado !== false ? 'Libro Cuadrado con el Diario' : 'Descuadre Detectado con el Libro Diario'}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/70">
                  Periodo {periodo}
                </span>
              </div>
              <div className="text-[11px] opacity-90">
                {cuadre?.mensaje || 'El total de crédito fiscal IGV de compras coincide exactamente con la cuenta 40111 del Libro Diario.'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-[11px] shrink-0">
            <span>IGV Registro: <strong>S/ {libroReporte?.totales?.totalIgv?.toFixed(2) || '0.00'}</strong></span>
            <span>|</span>
            <span>Cuenta 40111 (Debe): <strong>S/ {cuadre?.totalDebeCuenta40111Diario?.toFixed(2) || '0.00'}</strong></span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 1: ASISTENTE DE REGISTRO COMPLETO (COMPROBANTES Y ASIENTO PCGE)       */}
      {/* ========================================================================= */}
      {activeTab === 'DIGITACION' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Columna Izquierda: Formulario Estructurado y Completo (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            {/* Cabecera del Asistente */}
            <div className="bg-white border border-[#E3E8EF] rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-[#E6EDFE] text-[#2457D6]">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Asistente de Registro Completo de Compras
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Registro detallado con bases gravadas (destinos 1, 2, 3), exoneradas, ISC, ICBPER, SPOT, percepciones, retenciones y centros de costo.
                </p>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                <span className="px-2.5 py-1 rounded-md bg-[#F1F4F9] border border-[#E3E8EF] font-bold text-slate-700">
                  Ctrl+Enter: Registrar
                </span>
                <span className="px-2.5 py-1 rounded-md bg-[#F1F4F9] border border-[#E3E8EF] font-bold text-slate-700">
                  Ctrl+N: Nuevo
                </span>
              </div>
            </div>

            {bannerError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{bannerError}</span>
              </div>
            )}

            {/* 1. Comprobante, Fechas y Moneda */}
            <div className="bg-white border border-[#E3E8EF] rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2 text-xs font-bold text-slate-800">
                <FileText className="w-4 h-4 text-[#2457D6]" />
                <span>1. Datos del Comprobante y Fechas</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Tipo Comprobante</label>
                  <select
                    value={formTipo}
                    onChange={(e) => setFormTipo(e.target.value as any)}
                    className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-xl bg-[#F7F9FC] focus:bg-white focus:ring-2 focus:ring-[#2457D6] outline-none"
                  >
                    <option value="01">01 - Factura Electrónica</option>
                    <option value="03">03 - Boleta de Venta</option>
                    <option value="07">07 - Nota de Crédito</option>
                    <option value="08">08 - Nota de Débito</option>
                    <option value="14">14 - Recibo Serv. Públicos</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Serie</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={formSerie}
                    onChange={(e) => setFormSerie(e.target.value.toUpperCase())}
                    placeholder="F001"
                    className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-xl uppercase bg-[#F7F9FC] focus:bg-white focus:ring-2 focus:ring-[#2457D6] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Número Correlativo</label>
                  <input
                    type="text"
                    value={formNumero}
                    onChange={(e) => setFormNumero(e.target.value)}
                    placeholder="00012345"
                    className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-xl bg-[#F7F9FC] focus:bg-white focus:ring-2 focus:ring-[#2457D6] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Moneda y T/C</label>
                  <div className="flex gap-1.5">
                    <select
                      value={formMoneda}
                      onChange={(e) => setFormMoneda(e.target.value as any)}
                      className="w-20 text-xs font-bold p-2 border border-slate-300 rounded-xl bg-[#F7F9FC]"
                    >
                      <option value="PEN">PEN (S/)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                    <input
                      type="number"
                      step="0.001"
                      value={formTipoCambio}
                      onChange={(e) => setFormTipoCambio(parseFloat(e.target.value) || 1.0)}
                      placeholder="1.000"
                      className="flex-1 text-xs font-mono font-bold p-2 border border-slate-300 rounded-xl bg-[#F7F9FC] text-right"
                      title="Tipo de cambio aplicable"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Fecha Emisión</label>
                  <input
                    type="date"
                    value={formFechaEmision}
                    onChange={(e) => setFormFechaEmision(e.target.value)}
                    className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-xl bg-[#F7F9FC] focus:bg-white focus:ring-2 focus:ring-[#2457D6] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Fecha Vencimiento</label>
                  <input
                    type="date"
                    value={formFechaVencimiento}
                    onChange={(e) => setFormFechaVencimiento(e.target.value)}
                    className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-xl bg-[#F7F9FC] focus:bg-white focus:ring-2 focus:ring-[#2457D6] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Fecha Contable</label>
                  <input
                    type="date"
                    value={formFechaContable}
                    onChange={(e) => setFormFechaContable(e.target.value)}
                    className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-xl bg-[#F7F9FC] focus:bg-white focus:ring-2 focus:ring-[#2457D6] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Glosa de la Operación</label>
                <input
                  type="text"
                  value={formGlosa}
                  onChange={(e) => setFormGlosa(e.target.value)}
                  placeholder={`Ej: Compra de mercaderías según factura ${formSerie}-${formNumero || '00000001'}`}
                  className="w-full text-xs p-2 border border-slate-300 rounded-xl bg-[#F7F9FC] focus:bg-white focus:ring-2 focus:ring-[#2457D6] outline-none"
                />
              </div>
            </div>

            {/* 2. Proveedor y Validación SUNAT en Tiempo Real */}
            <div className="bg-white border border-[#E3E8EF] rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Building2 className="w-4 h-4 text-[#2457D6]" />
                  <span>2. Proveedor y Situación Tributaria SUNAT</span>
                </div>
                <button
                  type="button"
                  onClick={() => setModalAltaProveedor(true)}
                  className="text-xs font-bold text-[#2457D6] hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> + Alta Rápida de Proveedor
                </button>
              </div>

              {/* Barra de Consulta RUC en Vivo */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    maxLength={11}
                    value={rucBusquedaDirecta}
                    onChange={(e) => {
                      setRucBusquedaDirecta(e.target.value.replace(/\D/g, ''));
                      if (errorConsultaRuc) setErrorConsultaRuc(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleConsultarRucEnRegistro();
                      }
                    }}
                    placeholder="Consultar RUC (11 dígitos, ej. 20100070970)..."
                    className="w-full text-xs font-mono font-bold pl-3 pr-20 py-2 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-[#2457D6] outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono font-semibold text-slate-400">
                    {rucBusquedaDirecta.length}/11
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleConsultarRucEnRegistro(false)}
                  disabled={consultarRucMutation.isPending || rucBusquedaDirecta.length !== 11}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer ${
                    consultarRucMutation.isPending || rucBusquedaDirecta.length !== 11
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-[#2457D6] hover:bg-blue-700 text-white'
                  }`}
                >
                  {consultarRucMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Verificando...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Consultar SUNAT</span>
                    </>
                  )}
                </button>
              </div>

              {errorConsultaRuc && (
                <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>{errorConsultaRuc}</span>
                </div>
              )}

              {/* Selector de lista de proveedores registrados */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  O seleccionar de catálogo registrado:
                </label>
                <select
                  value={formProveedorId}
                  onChange={(e) => {
                    setFormProveedorId(e.target.value);
                    const p = anexosList.find((a: any) => a.id === e.target.value);
                    if (p) {
                      setRucBusquedaDirecta(p.numeroDocumento);
                      setResultadoConsultaRuc(null);
                    }
                  }}
                  className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-[#2457D6] outline-none"
                >
                  <option value="">-- Seleccionar proveedor del catálogo --</option>
                  {anexosList.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.numeroDocumento} - {a.razonSocial} {a.condicionSunat === 'NO_HABIDO' ? '[NO HABIDO]' : ''} ({a.estadoSunat})
                    </option>
                  ))}
                </select>
              </div>

              {/* Ficha Tributaria del Proveedor */}
              {(proveedorSeleccionado || resultadoConsultaRuc) && (
                <div className="p-3 bg-[#F7F9FC] border border-[#E3E8EF] rounded-xl space-y-2 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                    <div>
                      <div className="font-mono font-bold text-slate-900 text-xs">
                        RUC: {proveedorSeleccionado?.numeroDocumento || resultadoConsultaRuc?.ruc}
                      </div>
                      <div className="font-bold text-slate-800 text-xs mt-0.5">
                        {proveedorSeleccionado?.razonSocial || resultadoConsultaRuc?.razonSocial}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Estado */}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1 ${
                        (proveedorSeleccionado?.estadoSunat || resultadoConsultaRuc?.estado) === 'ACTIVO'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}>
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        {proveedorSeleccionado?.estadoSunat || resultadoConsultaRuc?.estado || 'ACTIVO'}
                      </span>

                      {/* Condición */}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1 ${
                        (proveedorSeleccionado?.condicionSunat || resultadoConsultaRuc?.condicion) === 'HABIDO'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                      }`}>
                        {(proveedorSeleccionado?.condicionSunat || resultadoConsultaRuc?.condicion) === 'HABIDO' ? (
                          'HABIDO'
                        ) : (
                          <>
                            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>NO HABIDO</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-700">Dirección Fiscal: </span>
                    {proveedorSeleccionado?.direccion || resultadoConsultaRuc?.direccion || 'Sin dirección registrada'}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Bases Imponibles y Tributos SUNAT (Asiento Completo) */}
            <div className="bg-white border border-[#E3E8EF] rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Coins className="w-4 h-4 text-[#2457D6]" />
                  <span>3. Bases Imponibles y Tributos del Comprobante</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold text-slate-600">Tasa IGV:</label>
                  <select
                    value={formTasaIgv}
                    onChange={(e) => {
                      const tasa = parseFloat(e.target.value);
                      setFormTasaIgv(tasa);
                      recalcularTotales(formBase, formBaseDestino2, formBaseDestino3, formBaseNoGravada, formExonerado, formIsc, formIcbper, formOtrosTributos, tasa);
                    }}
                    className="text-xs font-bold px-2 py-1 border border-slate-300 rounded-lg bg-[#F7F9FC]"
                  >
                    <option value={0.18}>18% (General)</option>
                    <option value={0.10}>10% (Ley 31556 MYPEs Turismo/Rest.)</option>
                  </select>
                </div>
              </div>

              {formTasaIgv === 0.10 && (
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Advertencia de Tasa Especial (Ley 31556 / Ley 32174): </span>
                    Tasa reducida del 10% (8% IGV + 2% IPM) aplicable únicamente a micro y pequeñas empresas de restaurantes, hoteles y alojamientos turísticos que cumplan los requisitos de ley.
                    <span className="block mt-0.5 text-[11px] text-amber-700">
                      <strong>Vigencia legal:</strong> Del 01/09/2022 hasta el 31/12/2026. A partir del 01/01/2027 rige la tasa general del 18% salvo prórroga legislativa expresa.
                    </span>
                  </div>
                </div>
              )}

              {/* Fila 1: Las 4 Bases Imponibles Oficiales SUNAT */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-2.5 rounded-xl bg-blue-50/50 border border-blue-200">
                  <label className="block text-[10.5px] font-bold text-blue-900 mb-1">
                    Base Gravada (Destino 1)
                  </label>
                  <span className="text-[9.5px] text-slate-500 block mb-1">100% Crédito Fiscal</span>
                  <input
                    type="number"
                    step="0.01"
                    value={formBase || ''}
                    onChange={(e) => handleBaseChange(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full text-xs font-mono font-bold p-2 border border-blue-300 rounded-lg bg-white text-right outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <label className="block text-[10.5px] font-bold text-slate-700 mb-1">
                    Base Gravada (Destino 2)
                  </label>
                  <span className="text-[9.5px] text-slate-500 block mb-1">Prorrata / Común</span>
                  <input
                    type="number"
                    step="0.01"
                    value={formBaseDestino2 || ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setFormBaseDestino2(v);
                      recalcularTotales(formBase, v, formBaseDestino3, formBaseNoGravada, formExonerado, formIsc, formIcbper, formOtrosTributos, formTasaIgv);
                    }}
                    placeholder="0.00"
                    className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-lg bg-white text-right outline-none"
                  />
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <label className="block text-[10.5px] font-bold text-slate-700 mb-1">
                    Base Gravada (Destino 3)
                  </label>
                  <span className="text-[9.5px] text-slate-500 block mb-1">Sin Crédito (Al Costo)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={formBaseDestino3 || ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setFormBaseDestino3(v);
                      recalcularTotales(formBase, formBaseDestino2, v, formBaseNoGravada, formExonerado, formIsc, formIcbper, formOtrosTributos, formTasaIgv);
                    }}
                    placeholder="0.00"
                    className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-lg bg-white text-right outline-none"
                  />
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <label className="block text-[10.5px] font-bold text-slate-700 mb-1">
                    No Gravada / Exonerada
                  </label>
                  <span className="text-[9.5px] text-slate-500 block mb-1">Sin IGV (Destino 4)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={formBaseNoGravada || ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setFormBaseNoGravada(v);
                      recalcularTotales(formBase, formBaseDestino2, formBaseDestino3, v, formExonerado, formIsc, formIcbper, formOtrosTributos, formTasaIgv);
                    }}
                    placeholder="0.00"
                    className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-lg bg-white text-right outline-none"
                  />
                </div>
              </div>

              {/* Fila 2: Tributos Complementarios (IGV, ISC, ICBPER, Otros y Total) */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5 pt-1">
                <div>
                  <label className="block text-[10.5px] font-bold text-blue-900 mb-1">
                    IGV (S/)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formIgv || ''}
                    onChange={(e) => setFormIgv(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full text-xs font-mono font-bold p-2 border border-blue-300 rounded-lg bg-white text-right outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold text-slate-700 mb-1">
                    I.S.C. (S/)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formIsc || ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setFormIsc(v);
                      recalcularTotales(formBase, formBaseDestino2, formBaseDestino3, formBaseNoGravada, formExonerado, v, formIcbper, formOtrosTributos, formTasaIgv);
                    }}
                    placeholder="0.00"
                    className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-lg bg-white text-right outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold text-slate-700 mb-1">
                    ICBPER (Bolsa)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formIcbper || ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setFormIcbper(v);
                      recalcularTotales(formBase, formBaseDestino2, formBaseDestino3, formBaseNoGravada, formExonerado, formIsc, v, formOtrosTributos, formTasaIgv);
                    }}
                    placeholder="0.00"
                    className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-lg bg-white text-right outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold text-slate-700 mb-1">
                    Otros Tributos
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formOtrosTributos || ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setFormOtrosTributos(v);
                      recalcularTotales(formBase, formBaseDestino2, formBaseDestino3, formBaseNoGravada, formExonerado, formIsc, formIcbper, v, formTasaIgv);
                    }}
                    placeholder="0.00"
                    className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-lg bg-white text-right outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[10.5px] font-bold text-[#2457D6] mb-1">
                    Total Comprobante (Precio con IGV)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formTotal || ''}
                    onChange={(e) => handleTotalChange(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full text-sm font-mono font-black text-[#2457D6] p-2 border-2 border-blue-400 rounded-lg bg-blue-50/40 text-right outline-none focus:ring-2 focus:ring-[#2457D6]"
                  />
                </div>
              </div>
            </div>

            {/* 4. Regímenes de Recaudación SUNAT (SPOT, Percepción, Retención) */}
            <div className="bg-white border border-[#E3E8EF] rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs font-bold text-slate-800">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-[#2457D6]" />
                  <span>4. Regímenes de Recaudación (Detracción SPOT / Percepción / Retención)</span>
                </div>
              </div>

              {/* Alerta de Incompatibilidad Normativa: Percepción + Retención */}
              {formTienePercepcion && formTieneRetencion && (
                <div role="alert" className="p-3 bg-rose-50 border border-rose-300 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">COMBINACIÓN BLOQUEADA:</strong> Un comprobante no puede estar sujeto simultáneamente al Régimen de Percepciones y al Régimen de Retenciones del IGV (RS 037-2002/SUNAT y Ley 28053). Desactive uno de los dos regímenes para poder registrar. <span className="font-semibold text-rose-900">[SUPUESTO A VALIDAR con contador]</span>
                  </div>
                </div>
              )}

              {/* Advertencia Normativa: Detracción SPOT + Retención */}
              {formTieneDetraccion && formTieneRetencion && (
                <div role="alert" className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">ADVERTENCIA NORMATIVA (R.S. 037-2002/SUNAT):</strong> Según el Art. 5 inc. a de la norma, las operaciones sujetas al Sistema de Detracciones (SPOT) están excluidas de la Retención del IGV. Verifique si corresponde aplicar ambas en esta operación. <span className="font-semibold text-amber-900">[SUPUESTO A VALIDAR con contador]</span>
                  </div>
                </div>
              )}

              {/* Detracción SPOT */}
              <div className={`p-3 rounded-xl border transition ${formTieneDetraccion ? 'bg-amber-50/60 border-amber-300' : 'bg-[#F7F9FC] border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formTieneDetraccion}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormTieneDetraccion(checked);
                        if (checked) {
                          const item = buscarDetraccionPorCodigo(formCodigoBienDetraccion);
                          const pct = item ? item.porcentaje : formPctDetraccion;
                          setFormPctDetraccion(pct);
                          setFormMontoDetraccion(Number((formTotal * (pct / 100)).toFixed(2)));
                        } else {
                          setFormMontoDetraccion(0);
                          setFormJustificacionTasaDetraccion('');
                        }
                      }}
                      className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                    />
                    <span>Sujeto a Detracción SPOT (Banco de la Nación - Cuenta 4213)</span>
                  </label>
                  {formTieneDetraccion && (
                    <span className="font-mono font-bold text-xs text-amber-800">
                      Monto Detracción: S/ {formMontoDetraccion.toFixed(2)}
                    </span>
                  )}
                </div>

                {formTieneDetraccion && (() => {
                  const itemOficial = buscarDetraccionPorCodigo(formCodigoBienDetraccion);
                  const difiereTasa = itemOficial && formPctDetraccion !== itemOficial.porcentaje;
                  const bajoUmbral = itemOficial && itemOficial.umbralMinimo > 0 && formTotal > 0 && formTotal <= itemOficial.umbralMinimo;

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 pt-2.5 mt-2 border-t border-amber-200 text-xs">
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-bold text-amber-900 mb-1">Catálogo Oficial Bien / Servicio</label>
                        <select
                          value={formCodigoBienDetraccion}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormCodigoBienDetraccion(val);
                            const item = buscarDetraccionPorCodigo(val);
                            if (item) {
                              setFormPctDetraccion(item.porcentaje);
                              setFormMontoDetraccion(Number((formTotal * (item.porcentaje / 100)).toFixed(2)));
                              setFormJustificacionTasaDetraccion('');
                            }
                          }}
                          className="w-full text-xs font-semibold p-1.5 border border-amber-300 rounded-lg bg-white"
                        >
                          {CATALOGO_OFICIAL_DETRACCIONES_SUNAT.map((item) => (
                            <option key={item.codigo} value={item.codigo}>
                              {item.codigo} - {item.descripcion} ({item.porcentaje}% {item.umbralMinimo > 0 ? `- Umbral > S/ ${item.umbralMinimo}` : '- Sin umbral'})
                            </option>
                          ))}
                        </select>
                        {bajoUmbral && (
                          <span className="text-[10px] text-amber-800 font-semibold block mt-1">
                            Aviso: Importe (S/ {formTotal.toFixed(2)}) no supera el umbral oficial (S/ {itemOficial.umbralMinimo.toFixed(2)}). [SUPUESTO A VALIDAR: Verifique si aplica por acumulación].
                          </span>
                        )}
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-amber-900 mb-1">Tasa %</label>
                        <input
                          type="number"
                          step="0.5"
                          value={formPctDetraccion}
                          onChange={(e) => {
                            const p = parseFloat(e.target.value) || 0;
                            setFormPctDetraccion(p);
                            setFormMontoDetraccion(Number((formTotal * (p / 100)).toFixed(2)));
                          }}
                          className="w-full text-xs font-mono font-bold p-1.5 border border-amber-300 rounded-lg bg-white text-right"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-amber-900 mb-1">Nº Constancia Depósito</label>
                        <input
                          type="text"
                          value={formNroConstanciaDetraccion}
                          onChange={(e) => setFormNroConstanciaDetraccion(e.target.value)}
                          placeholder="Ej: 99012345"
                          className="w-full text-xs font-mono p-1.5 border border-amber-300 rounded-lg bg-white"
                        />
                      </div>

                      {difiereTasa && (
                        <div className="md:col-span-4 bg-amber-100/70 p-2.5 rounded-lg border border-amber-300">
                          <label className="block text-[10px] font-bold text-amber-900 mb-1">
                            Justificación visible de tasa especial (Tasa oficial: {itemOficial.porcentaje}% vs ingresada: {formPctDetraccion}%) *
                          </label>
                          <input
                            type="text"
                            value={formJustificacionTasaDetraccion}
                            onChange={(e) => setFormJustificacionTasaDetraccion(e.target.value)}
                            placeholder="Indique convenio, resolución SUNAT o base legal que justifica tasa distinta"
                            className="w-full text-xs p-1.5 border border-amber-400 rounded-lg bg-white"
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Percepción de IGV */}
              <div className={`p-3 rounded-xl border transition ${formTienePercepcion ? 'bg-purple-50/60 border-purple-300' : 'bg-[#F7F9FC] border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formTienePercepcion}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormTienePercepcion(checked);
                        if (checked) {
                          // Incompatibilidad: apagar Retención automáticamente
                          setFormTieneRetencion(false);
                          setFormMontoRetencion(0);
                          setFormMontoPercepcion(Number((formTotal * (formPctPercepcion / 100)).toFixed(2)));
                        } else {
                          setFormMontoPercepcion(0);
                        }
                      }}
                      className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                    />
                    <span>Afecto a Régimen de Percepción de IGV (Suma al pasivo, imputa a cuenta 40113)</span>
                  </label>
                  {formTienePercepcion && (
                    <span className="font-mono font-bold text-xs text-purple-800">
                      Monto Percepción: S/ {formMontoPercepcion.toFixed(2)}
                    </span>
                  )}
                </div>

                {formTienePercepcion && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 pt-2.5 mt-2 border-t border-purple-200 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold text-purple-900 mb-1">Tasa % Percepción</label>
                      <select
                        value={formPctPercepcion}
                        onChange={(e) => {
                          const p = parseFloat(e.target.value) || 2.0;
                          setFormPctPercepcion(p);
                          setFormMontoPercepcion(Number((formTotal * (p / 100)).toFixed(2)));
                        }}
                        className="w-full text-xs font-semibold p-1.5 border border-purple-300 rounded-lg bg-white"
                      >
                        <option value={2.0}>2.0% (Ventas con agentes de percepción)</option>
                        <option value={0.5}>0.5% (Combustibles y derivados)</option>
                        <option value={1.0}>1.0% (Venta interna)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-purple-900 mb-1">Monto Percepción (S/)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formMontoPercepcion || ''}
                        onChange={(e) => setFormMontoPercepcion(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-full text-xs font-mono font-bold p-1.5 border border-purple-300 rounded-lg bg-white text-right"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-purple-900 mb-1">Serie Percepción</label>
                      <input
                        type="text"
                        value={formSeriePercepcion}
                        onChange={(e) => setFormSeriePercepcion(e.target.value.toUpperCase())}
                        placeholder="P001"
                        className="w-full text-xs font-mono p-1.5 border border-purple-300 rounded-lg bg-white uppercase"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-purple-900 mb-1">Número Percepción</label>
                      <input
                        type="text"
                        value={formNumeroPercepcion}
                        onChange={(e) => setFormNumeroPercepcion(e.target.value)}
                        placeholder="000123"
                        className="w-full text-xs font-mono p-1.5 border border-purple-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Retención de IGV */}
              <div className={`p-3 rounded-xl border transition ${formTieneRetencion ? 'bg-indigo-50/60 border-indigo-300' : 'bg-[#F7F9FC] border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formTieneRetencion}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormTieneRetencion(checked);
                        if (checked) {
                          // Incompatibilidad: apagar Percepción automáticamente
                          setFormTienePercepcion(false);
                          setFormMontoPercepcion(0);
                          setFormMontoRetencion(Number((formTotal * (formPctRetencion / 100)).toFixed(2)));
                        } else {
                          setFormMontoRetencion(0);
                        }
                      }}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <span>Afecto a Régimen de Retención de IGV (Resta del pago neto, imputa a cuenta 40114)</span>
                  </label>
                  {formTieneRetencion && (
                    <span className="font-mono font-bold text-xs text-indigo-800">
                      Monto Retenido: S/ {formMontoRetencion.toFixed(2)}
                    </span>
                  )}
                </div>

                {formTieneRetencion && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 pt-2.5 mt-2 border-t border-indigo-200 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-900 mb-1">Tasa % Retención</label>
                      <input
                        type="number"
                        value={formPctRetencion}
                        onChange={(e) => {
                          const p = parseFloat(e.target.value) || 3.0;
                          setFormPctRetencion(p);
                          setFormMontoRetencion(Number((formTotal * (p / 100)).toFixed(2)));
                        }}
                        className="w-full text-xs font-mono font-bold p-1.5 border border-indigo-300 rounded-lg bg-white text-right"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-indigo-900 mb-1">Monto Retención (S/)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formMontoRetencion || ''}
                        onChange={(e) => setFormMontoRetencion(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-full text-xs font-mono font-bold p-1.5 border border-indigo-300 rounded-lg bg-white text-right"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-indigo-900 mb-1">Serie Retención</label>
                      <input
                        type="text"
                        value={formSerieRetencion}
                        onChange={(e) => setFormSerieRetencion(e.target.value.toUpperCase())}
                        placeholder="R001"
                        className="w-full text-xs font-mono p-1.5 border border-indigo-300 rounded-lg bg-white uppercase"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-indigo-900 mb-1">Número Retención</label>
                      <input
                        type="text"
                        value={formNumeroRetencion}
                        onChange={(e) => setFormNumeroRetencion(e.target.value)}
                        placeholder="000456"
                        className="w-full text-xs font-mono p-1.5 border border-indigo-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 5. Desglose Contable y Centros de Costo (U.Negocio) */}
            <div className="bg-white border border-[#E3E8EF] rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-2 gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Layers className="w-4 h-4 text-[#2457D6]" />
                  <span>5. Distribución de Cuentas Contables y Centros de Costo</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModoDesglose(!modoDesglose)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      modoDesglose
                        ? 'bg-[#2457D6] text-white shadow-xs'
                        : 'bg-[#F1F4F9] text-slate-700 hover:bg-[#E8EDF6]'
                    }`}
                  >
                    <Split className="w-3.5 h-3.5" />
                    <span>{modoDesglose ? 'Desglose Multilínea Activo' : 'Cuenta Única (Modo Rápido)'}</span>
                  </button>
                </div>
              </div>

              {!modoDesglose ? (
                /* Modo Simple: Cuenta Única */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-[#F7F9FC] border border-[#E3E8EF] rounded-xl text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Cuenta Contable de Gasto/Costo (PCGE)</label>
                    <select
                      value={formCuentaCompra}
                      onChange={(e) => setFormCuentaCompra(e.target.value)}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-xl bg-white"
                    >
                      <option value="6011">6011 - Mercaderías manufacturadas</option>
                      <option value="6021">6021 - Materias primas</option>
                      <option value="6031">6031 - Materiales auxiliares y suministros</option>
                      <option value="6311">6311 - Transporte de mercaderías y fletes</option>
                      <option value="6321">6321 - Asesoría y consultoría administrativa</option>
                      <option value="6361">6361 - Energía eléctrica</option>
                      <option value="6363">6363 - Agua potable</option>
                      <option value="6364">6364 - Teléfono e Internet</option>
                      <option value="659">659 - Otros gastos de gestión</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Destino Tributario SUNAT</label>
                    <select
                      value={formTipoAdquisicion}
                      onChange={(e) => setFormTipoAdquisicion(e.target.value as any)}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-xl bg-white"
                    >
                      <option value="1">1: Gravada (100% Crédito Fiscal)</option>
                      <option value="2">2: Prorrata (Operaciones Mixtas)</option>
                      <option value="3">3: Gravada sin derecho a crédito fiscal (Al Costo)</option>
                      <option value="4">4: Adquisición No Gravada / Exonerada</option>
                    </select>
                  </div>
                </div>
              ) : (
                /* Modo Multilínea: Hasta 3 o más cuentas y centros de costo */
                <div className="space-y-2.5">
                  <div className="overflow-x-auto border border-[#E3E8EF] rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#F7F9FC] text-slate-700 font-bold border-b border-[#E3E8EF]">
                        <tr>
                          <th className="p-2 w-10 text-center">#</th>
                          <th className="p-2 w-28">Monto (S/)</th>
                          <th className="p-2 w-32">Cta Contable</th>
                          <th className="p-2">Denominación</th>
                          <th className="p-2 w-32">Centro Costo</th>
                          <th className="p-2 w-12 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lineasDesglose.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="p-2 text-center font-bold text-slate-400">{idx + 1}</td>
                            <td className="p-2">
                              <input
                                type="number"
                                step="0.01"
                                value={item.monto || ''}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  const copy = [...lineasDesglose];
                                  copy[idx].monto = val;
                                  setLineasDesglose(copy);
                                }}
                                placeholder="0.00"
                                className="w-full p-1.5 font-mono font-bold text-right border border-slate-300 rounded-lg bg-white"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={item.cuentaCodigo}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const copy = [...lineasDesglose];
                                  copy[idx].cuentaCodigo = val;
                                  setLineasDesglose(copy);
                                }}
                                placeholder="6011"
                                className="w-full p-1.5 font-mono font-bold border border-slate-300 rounded-lg bg-white"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={item.denominacion}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const copy = [...lineasDesglose];
                                  copy[idx].denominacion = val;
                                  setLineasDesglose(copy);
                                }}
                                placeholder="Descripción del gasto"
                                className="w-full p-1.5 border border-slate-300 rounded-lg bg-white"
                              />
                            </td>
                            <td className="p-2">
                              <select
                                value={item.centroCostoId}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const copy = [...lineasDesglose];
                                  copy[idx].centroCostoId = val;
                                  setLineasDesglose(copy);
                                }}
                                className="w-full p-1.5 border border-slate-300 rounded-lg bg-white font-semibold"
                              >
                                <option value="CC-ADM">CC-ADM (Administración)</option>
                                <option value="CC-VTAS">CC-VTAS (Ventas)</option>
                                <option value="CC-PROD">CC-PROD (Producción)</option>
                                <option value="CC-OPER">CC-OPER (Operaciones)</option>
                              </select>
                            </td>
                            <td className="p-2 text-center">
                              {lineasDesglose.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setLineasDesglose(lineasDesglose.filter((_, i) => i !== idx))}
                                  className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                                  title="Eliminar línea"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setLineasDesglose([
                          ...lineasDesglose,
                          {
                            id: String(Date.now()),
                            cuentaCodigo: '6311',
                            denominacion: 'Transporte y fletes',
                            monto: 0,
                            centroCostoId: 'CC-ADM',
                            glosa: 'Gasto complementario'
                          }
                        ]);
                      }}
                      className="px-2.5 py-1 text-xs font-bold text-[#2457D6] bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> + Agregar Cuenta / Gasto
                    </button>

                    <div className="font-mono text-[11px] text-slate-600">
                      Total Desglosado:{' '}
                      <strong className="text-slate-900 font-bold">
                        S/ {lineasDesglose.reduce((acc, l) => acc + (l.monto || 0), 0).toFixed(2)}
                      </strong>{' '}
                      / Base Total: <strong>S/ {(formBase + formBaseDestino2 + formBaseDestino3 + formBaseNoGravada).toFixed(2)}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 6. Forma de Pago */}
            <div className="bg-white border border-[#E3E8EF] rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold text-slate-700">Forma de Pago:</span>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="formaPago"
                    checked={formFormaPago === 'CONTADO'}
                    onChange={() => setFormFormaPago('CONTADO')}
                  />
                  <span>Contado</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="formaPago"
                    checked={formFormaPago === 'CREDITO'}
                    onChange={() => setFormFormaPago('CREDITO')}
                  />
                  <span>Crédito (Genera CxP)</span>
                </label>
              </div>

              {formFormaPago === 'CREDITO' && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Plazo en días:</span>
                  <input
                    type="number"
                    value={formDiasCredito}
                    onChange={(e) => setFormDiasCredito(parseInt(e.target.value, 10) || 30)}
                    className="w-20 p-1 font-mono font-bold text-center border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              )}
            </div>

            {/* Barra de Acciones y Guardado */}
            <div className="bg-white border border-[#E3E8EF] rounded-2xl p-4 shadow-xs flex items-center justify-between">
              <button
                type="button"
                onClick={limpiarFormulario}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold transition cursor-pointer"
              >
                Limpiar (Ctrl+N)
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRegistrar(true)}
                  disabled={crearCompraMutation.isPending}
                  className="px-4 py-2.5 rounded-xl bg-[#F1F4F9] hover:bg-slate-200 text-slate-800 text-xs font-bold transition cursor-pointer"
                >
                  Guardar Borrador
                </button>
                <button
                  type="button"
                  onClick={() => handleRegistrar(false)}
                  disabled={crearCompraMutation.isPending}
                  className="px-5 py-2.5 rounded-xl bg-[#2457D6] hover:bg-blue-700 text-white text-xs font-bold shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Registrar y Contabilizar (Ctrl+Enter)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Columna Derecha: Previsualización de Asiento PCGE en Tiempo Real (4 cols) */}
          <div className="lg:col-span-4 bg-white border border-[#E3E8EF] rounded-2xl p-5 shadow-xs space-y-4 h-fit sticky top-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Previsualización de Asiento PCGE
              </h3>
              {loadingPreview && <RefreshCw className="w-3.5 h-3.5 text-[#2457D6] animate-spin" />}
            </div>

            <p className="text-[11px] text-slate-500">
              Generado en tiempo real según las cuentas, bases tributarias, SPOT y percepciones configuradas.
            </p>

            {previewAsiento ? (
              <div className="space-y-3">
                <div className="p-2.5 rounded-xl bg-[#F7F9FC] border border-[#E3E8EF] text-xs font-mono">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Glosa Automática</div>
                  <div className="font-semibold text-slate-800 truncate">{previewAsiento.glosaGeneral}</div>
                </div>

                <div className="border border-[#E3E8EF] rounded-xl overflow-hidden">
                  <table className="w-full text-[11px] font-mono">
                    <thead className="bg-[#F1F4F9] text-slate-600 font-bold border-b border-[#E3E8EF]">
                      <tr>
                        <th className="p-2 text-left">Cuenta</th>
                        <th className="p-2 text-right">Debe</th>
                        <th className="p-2 text-right">Haber</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewAsiento.lineas.map((l: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2">
                            <div className="font-bold text-slate-800 flex items-center gap-1.5">
                              <span>{l.codigoCuenta}</span>
                              {l.centroCosto && (
                                <span className="text-[9px] px-1 py-0.2 bg-blue-100 text-blue-800 rounded font-sans">
                                  {l.centroCosto}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate max-w-[140px]" title={l.denominacion || l.glosaLinea}>
                              {l.denominacion || l.glosaLinea}
                            </div>
                          </td>
                          <td className="p-2 text-right font-bold text-slate-900">
                            {l.debe > 0 ? l.debe.toFixed(2) : '-'}
                          </td>
                          <td className="p-2 text-right font-bold text-slate-900">
                            {l.haber > 0 ? l.haber.toFixed(2) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-[#F7F9FC] font-bold border-t border-[#E3E8EF] text-slate-900">
                      <tr>
                        <td className="p-2">Total</td>
                        <td className="p-2 text-right">{previewAsiento.totalDebe.toFixed(2)}</td>
                        <td className="p-2 text-right">{previewAsiento.totalHaber.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className={`p-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-between ${
                  previewAsiento.cuadrado
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Partida Doble:</span>
                  </span>
                  <span>{previewAsiento.cuadrado ? `CUADRADO (Dif: S/ ${previewAsiento.diferenciaCuadre.toFixed(2)})` : `DESCUADRADO (Dif: S/ ${previewAsiento.diferenciaCuadre.toFixed(2)})`}</span>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                Ingrese un importe mayor a cero para previsualizar el asiento completo con todas las cuentas y tributos.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 2: CONSULTA Y TABLA DENSA LIBRO 8.4                                 */}
      {/* ========================================================================= */}
      {activeTab === 'LIBRO' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 border border-slate-200 rounded-2xl shadow-xs">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por RUC, razón social, serie o correlativo..."
                className="w-full pl-9 pr-4 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="text-xs p-1.5 border border-slate-200 rounded-xl bg-slate-50 font-semibold"
              >
                <option value="TODOS">Todos los comprobantes</option>
                <option value="01">Factura (01)</option>
                <option value="03">Boleta (03)</option>
                <option value="07">Nota de Crédito (07)</option>
              </select>

              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="text-xs p-1.5 border border-slate-200 rounded-xl bg-slate-50 font-semibold"
              >
                <option value="TODOS">Todos los estados</option>
                <option value="REGISTRADO">Registrados</option>
                <option value="BORRADOR">Borradores</option>
                <option value="ANULADO">Anulados</option>
              </select>
            </div>
          </div>

          {/* Tabla Densa Virtualizada */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 sticky top-0 z-10 text-[11px] uppercase">
                  <tr>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Serie-Número</th>
                    <th className="p-3">RUC Proveedor</th>
                    <th className="p-3">Razón Social</th>
                    <th className="p-3 text-right">Base Gravada</th>
                    <th className="p-3 text-right">IGV (18%)</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-center">Destino</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3 text-center">Asiento</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {filtrados.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="p-4 text-center font-sans">
                        <EmptyStateInstructivo
                          moduloNombre="Registro de Compras (RCE)"
                          titulo="No hay comprobantes de compra en este periodo"
                          descripcion="El Registro de Compras Electrónico (RCE) almacena las adquisiciones con desglose tributario oficial (Base gravada, IGV, No gravada y SPOT de Detracción)."
                          checklist={[
                            { titulo: 'Identificación de Proveedor (RUC/DNI)', cumplido: false, descripcion: 'Verificar condición de habido y estado activo en SUNAT' },
                            { titulo: 'Asignación de Cuenta de Gasto / Inventario', cumplido: false, descripcion: 'Elemento 60 (Mercaderías) o 63/65 (Servicios/Gastos) con destino automático' },
                            { titulo: 'Verificación de Detracción / Bancarización', cumplido: false, descripcion: 'Operaciones sujetas al SPOT mayores a S/ 700.00 (Medio de pago bancarizado)' }
                          ]}
                          onRegistrarNuevo={() => setActiveTab('DIGITACION')}
                          textoRegistrar="Registrar Primera Compra"
                        />
                      </td>
                    </tr>
                  ) : (
                    filtrados.map((c: any) => (
                      <tr key={c.id} className={`hover:bg-slate-50 ${c.estado === 'ANULADO' ? 'opacity-50 line-through' : ''}`}>
                        <td className="p-3 whitespace-nowrap">{c.fechaEmision}</td>
                        <td className="p-3 font-bold text-blue-700">{c.tipoComprobante}</td>
                        <td className="p-3 font-bold text-slate-900 whitespace-nowrap">{c.serie}-{c.numero}</td>
                        <td className="p-3 text-slate-600">{c.proveedorRuc}</td>
                        <td className="p-3 font-sans truncate max-w-[180px] font-medium text-slate-800" title={c.proveedorNombre}>
                          {c.proveedorNombre}
                        </td>
                        <td className="p-3 text-right font-bold text-slate-800">{Number(c.baseGravada).toFixed(2)}</td>
                        <td className="p-3 text-right font-bold text-slate-800">{Number(c.igv).toFixed(2)}</td>
                        <td className="p-3 text-right font-black text-slate-900">{Number(c.total).toFixed(2)}</td>
                        <td className="p-3 text-center">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px]">
                            {c.tipoAdquisicion || '1'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            c.estado === 'REGISTRADO' ? 'bg-emerald-100 text-emerald-800' :
                            c.estado === 'BORRADOR' ? 'bg-amber-100 text-amber-800' :
                            'bg-rose-100 text-rose-800'
                          }`}>
                            {c.estado}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className="text-indigo-600 font-bold">{c.asientoNumero || '-'}</span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                setFormTipo(c.tipoComprobante);
                                setFormSerie(c.serie);
                                setFormNumero(`${parseInt(c.numero, 10) + 1 || 1}`);
                                setFormBase(c.baseGravada);
                                setFormIgv(c.igv);
                                setFormTotal(c.total);
                                setActiveTab('DIGITACION');
                              }}
                              className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition cursor-pointer"
                              title="Duplicar datos para nueva factura (Ctrl+D)"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            {c.estado === 'REGISTRADO' && (
                              <button
                                onClick={() => setModalAnular({
                                  isOpen: true,
                                  id: c.id,
                                  serieNumero: `${c.serie}-${c.numero}`,
                                  motivo: 'Error de digitación'
                                })}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                title="Anular comprobante con extorno contable"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200 text-xs text-slate-900 sticky bottom-0">
                  <tr>
                    <td colSpan={5} className="p-3">Totales ({filtrados.length} comprobantes)</td>
                    <td className="p-3 text-right font-mono">
                      S/ {filtrados.reduce((acc: number, c: any) => acc + (c.estado !== 'ANULADO' ? Number(c.baseGravada) : 0), 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-mono">
                      S/ {filtrados.reduce((acc: number, c: any) => acc + (c.estado !== 'ANULADO' ? Number(c.igv) : 0), 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-mono text-blue-900 font-black">
                      S/ {filtrados.reduce((acc: number, c: any) => acc + (c.estado !== 'ANULADO' ? Number(c.total) : 0), 0).toFixed(2)}
                    </td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ALTA RÁPIDA DE PROVEEDOR */}
      {modalAltaProveedor && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-900 text-base">Alta Rápida de Proveedor</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">RUC (11 dígitos)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={11}
                    value={nuevoProvRuc}
                    onChange={(e) => setNuevoProvRuc(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleConsultarRucEnModal();
                      }
                    }}
                    placeholder="20XXXXXXXXX"
                    className="flex-1 text-xs font-mono font-bold p-2 border border-slate-300 rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={handleConsultarRucEnModal}
                    disabled={consultandoModalRuc || nuevoProvRuc.length !== 11}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                      consultandoModalRuc || nuevoProvRuc.length !== 11
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer shadow-xs'
                    }`}
                  >
                    {consultandoModalRuc ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    )}
                    <span>Consultar</span>
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Razón Social</label>
                <input
                  type="text"
                  value={nuevoProvRazon}
                  onChange={(e) => setNuevoProvRazon(e.target.value.toUpperCase())}
                  placeholder="NOMBRE COMERCIAL S.A.C."
                  className="w-full text-xs font-bold p-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Dirección Fiscal</label>
                <input
                  type="text"
                  value={nuevoProvDireccion}
                  onChange={(e) => setNuevoProvDireccion(e.target.value)}
                  placeholder="Av. Principal 123, Lima"
                  className="w-full text-xs p-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Condición SUNAT</label>
                <select
                  value={nuevoProvCondicion}
                  onChange={(e) => setNuevoProvCondicion(e.target.value as any)}
                  className="w-full text-xs font-bold p-2 border border-slate-300 rounded-xl"
                >
                  <option value="HABIDO">HABIDO</option>
                  <option value="NO_HABIDO">NO HABIDO (Sin derecho a crédito fiscal)</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setModalAltaProveedor(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={handleCrearProveedorRapido}
                className="px-4 py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl"
              >
                Guardar Proveedor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMACIÓN DE ANULACIÓN */}
      {modalAnular.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <Ban className="w-6 h-6" />
              <h3 className="font-bold text-slate-900 text-base">Anular Comprobante</h3>
            </div>
            <p className="text-xs text-slate-600">
              ¿Está seguro de anular el comprobante <strong>{modalAnular.serieNumero}</strong>? Se generará un asiento de extorno vinculado y se cancelará la cuenta por pagar asociada.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Motivo de Anulación</label>
              <input
                type="text"
                value={modalAnular.motivo}
                onChange={(e) => setModalAnular(prev => ({ ...prev, motivo: e.target.value }))}
                className="w-full text-xs p-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setModalAnular({ isOpen: false, id: '', serieNumero: '', motivo: '' })}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarAnular}
                className="px-4 py-2 text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 rounded-xl"
              >
                Confirmar Anulación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de vista previa y exportación unificada */}
      {modalEstandarOpen && (
        <VisorReporteModal
          isOpen={modalEstandarOpen}
          onClose={() => setModalEstandarOpen(false)}
          definicion={construirDefinicionRegistroComprasEstandar(empresa, itemsCompras, periodo)}
        />
      )}
    </div>
  );
};
