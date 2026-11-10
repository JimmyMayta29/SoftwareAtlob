import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle,
  FileText,
  Plus,
  Copy,
  Ban,
  Keyboard,
  RefreshCw,
  Sparkles,
  Building2,
  ShieldCheck,
  ShieldAlert,
  Info,
  Loader2,
  FileSpreadsheet,
  Download,
  Coins,
  Split,
  Layers,
  Receipt
} from 'lucide-react';
import { Comprobante, EmpresaCliente } from '../../types';
import { 
  useVentasList, 
  useRegistroVentasLibro, 
  useCrearVenta, 
  useAnularVenta, 
  useDuplicarVenta, 
  useAnexosList, 
  useCrearAnexo,
  useConsultarRuc
} from '../../hooks/useOperaciones';
import { operacionesApi } from '../../api/operacionesApi';
import { generarSireRvieTxt, exportarComprobantesCsv } from '../../services/sireTxtGenerator';
import { CATALOGO_OFICIAL_DETRACCIONES_SUNAT, buscarDetraccionPorCodigo } from '../../data/detraccionesCatalogo';
import { construirDefinicionRegistroVentasEstandar } from '../../services/reports/formato_estandar/formatoEstandarEngine';
import { VisorReporteModal } from '../modals/VisorReporteModal';
import { useToast } from '../../context/ToastContext';
import { EmptyStateInstructivo } from '../common/EmptyStateInstructivo';

interface RegistroVentasViewProps {
  ventas: Comprobante[];
  empresa: EmpresaCliente;
  periodo: string;
}

export const RegistroVentasView: React.FC<RegistroVentasViewProps> = ({
  ventas: legacyVentas,
  empresa,
  periodo
}) => {
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState<'LIBRO' | 'DIGITACION'>('LIBRO');
  const [modalEstandarOpen, setModalEstandarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');

  // Modal confirmación anular
  const [modalAnular, setModalAnular] = useState<{ isOpen: boolean; id: string; serieNumero: string; motivo: string }>({
    isOpen: false,
    id: '',
    serieNumero: '',
    motivo: 'Anulación de venta por error de digitación'
  });

  // Modal Alta Rápida de Cliente
  const [modalAltaCliente, setModalAltaCliente] = useState(false);
  const [nuevoCliRuc, setNuevoCliRuc] = useState('');
  const [nuevoCliRazon, setNuevoCliRazon] = useState('');
  const [nuevoCliDireccion, setNuevoCliDireccion] = useState('');

  // Hooks API
  const { data: ventasApiData, refetch: refetchVentas } = useVentasList(empresa.id, {
    periodoId: periodo
  });
  const { data: libroReporte, refetch: refetchLibro } = useRegistroVentasLibro(empresa.id, periodo);
  const { data: anexosList = [] } = useAnexosList(empresa.id, undefined, 'CLIENTE');

  const crearVentaMutation = useCrearVenta(empresa.id);
  const anularVentaMutation = useAnularVenta(empresa.id);
  const duplicarVentaMutation = useDuplicarVenta(empresa.id);
  const crearAnexoMutation = useCrearAnexo(empresa.id);
  const consultarRucMutation = useConsultarRuc(empresa.id);

  // Estados de Consulta RUC en Tiempo Real (SUNAT + Caché PostgreSQL)
  const [rucBusquedaDirecta, setRucBusquedaDirecta] = useState('');
  const [resultadoConsultaRuc, setResultadoConsultaRuc] = useState<any | null>(null);
  const [errorConsultaRuc, setErrorConsultaRuc] = useState<string | null>(null);
  const [consultandoModalRuc, setConsultandoModalRuc] = useState(false);

  // Formulario Digitación Rápida
  const [formTipo, setFormTipo] = useState<'01' | '03' | '07' | '08' | '12'>('01');
  const [formSerie, setFormSerie] = useState('F001');
  const [formNumero, setFormNumero] = useState('');
  const [formFechaEmision, setFormFechaEmision] = useState(() => new Date().toISOString().substring(0, 10));
  const [formFechaVencimiento, setFormFechaVencimiento] = useState(() => new Date().toISOString().substring(0, 10));
  const [formFechaContable, setFormFechaContable] = useState(() => new Date().toISOString().substring(0, 10));
  const [formClienteId, setFormClienteId] = useState('');
  const [formGlosa, setFormGlosa] = useState('');

  // Bases imponibles y tributos
  const [formBase, setFormBase] = useState<number>(0);
  const [formTasaIgv, setFormTasaIgv] = useState<number>(0.18);
  const [formIgv, setFormIgv] = useState<number>(0);
  const [formBaseExonerada, setFormBaseExonerada] = useState<number>(0);
  const [formBaseInafecta, setFormBaseInafecta] = useState<number>(0);
  const [formBaseExportacion, setFormBaseExportacion] = useState<number>(0);
  const [formIsc, setFormIsc] = useState<number>(0);
  const [formIcbper, setFormIcbper] = useState<number>(0);
  const [formOtrosTributos, setFormOtrosTributos] = useState<number>(0);
  const [formTotal, setFormTotal] = useState<number>(0);

  // Moneda y Forma de Pago
  const [formMoneda, setFormMoneda] = useState<'PEN' | 'USD'>('PEN');
  const [formTipoCambio, setFormTipoCambio] = useState<number>(1.0);
  const [formFormaPago, setFormFormaPago] = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  const [formDiasCredito, setFormDiasCredito] = useState<number>(30);

  // Regímenes y Condiciones Especiales
  const [formTieneDetraccion, setFormTieneDetraccion] = useState(false);
  const [formCodigoBienDetraccion, setFormCodigoBienDetraccion] = useState<string>('022');
  const [formPctDetraccion, setFormPctDetraccion] = useState<number>(12);
  const [formMontoDetraccion, setFormMontoDetraccion] = useState<number>(0);
  const [formJustificacionTasaDetraccion, setFormJustificacionTasaDetraccion] = useState('');

  const [formTienePercepcion, setFormTienePercepcion] = useState(false);
  const [formPctPercepcion, setFormPctPercepcion] = useState<number>(2.0);
  const [formMontoPercepcion, setFormMontoPercepcion] = useState<number>(0);

  const [formTieneRetencion, setFormTieneRetencion] = useState(false);
  const [formPctRetencion, setFormPctRetencion] = useState<number>(3.0);
  const [formMontoRetencion, setFormMontoRetencion] = useState<number>(0);

  const [formAnticipoDeducido, setFormAnticipoDeducido] = useState<number>(0);
  const [formEsAnticipo, setFormEsAnticipo] = useState(false);
  const [formEsGratuito, setFormEsGratuito] = useState(false);
  const [formDescuentoGlobal, setFormDescuentoGlobal] = useState<number>(0);
  const [formDescuentoFueraFactura, setFormDescuentoFueraFactura] = useState<number>(0);
  const [formCostoVenta, setFormCostoVenta] = useState<number>(0);
  const [formCuentaVenta, setFormCuentaVenta] = useState<string>('70121');
  const [formCuentaCosto, setFormCuentaCosto] = useState<string>('69121');
  const [formMotivoNota, setFormMotivoNota] = useState('');

  // Previsualización de Asiento
  const [previewAsiento, setPreviewAsiento] = useState<any | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const clienteSeleccionado = anexosList.find((a: any) => a.id === formClienteId);

  // Cálculo automático y sincronización
  const recalcularTotales = (
    baseGrav: number,
    baseExon: number,
    baseInaf: number,
    baseExp: number,
    isc: number,
    icb: number,
    otros: number,
    tasa: number,
    descGlob: number = formDescuentoGlobal,
    anticipo: number = formAnticipoDeducido
  ) => {
    const baseNeta = descGlob > 0 ? Math.max(0, baseGrav - descGlob) : baseGrav;
    const calcIgv = Number((baseNeta * tasa).toFixed(2));
    let calcTotal = Number((baseGrav + baseExon + baseInaf + baseExp + isc + icb + otros + calcIgv).toFixed(2));
    if (anticipo > 0) {
      calcTotal = Math.max(0, Number((calcTotal - anticipo).toFixed(2)));
    }
    setFormIgv(calcIgv);
    setFormTotal(calcTotal);

    if (formTieneDetraccion) {
      setFormMontoDetraccion(Number((calcTotal * (formPctDetraccion / 100)).toFixed(2)));
    }
    if (formTienePercepcion) {
      setFormMontoPercepcion(Number((calcTotal * (formPctPercepcion / 100)).toFixed(2)));
    }
  };

  const handleBaseChange = (valor: number) => {
    setFormBase(valor);
    recalcularTotales(valor, formBaseExonerada, formBaseInafecta, formBaseExportacion, formIsc, formIcbper, formOtrosTributos, formTasaIgv);
  };

  const handleTotalChange = (valor: number) => {
    setFormTotal(valor);
    const tasa = formTasaIgv || 0.18;
    const calcBase = Number((valor / (1 + tasa)).toFixed(2));
    const calcIgv = Number((valor - calcBase).toFixed(2));
    setFormBase(calcBase);
    setFormIgv(calcIgv);
  };

  useEffect(() => {
    if (formTotal > 0 || formEsGratuito) {
      setLoadingPreview(true);
      const timer = setTimeout(async () => {
        try {
          const res = await operacionesApi.previsualizarAsiento(empresa.id, 'VENTA', {
            total: formTotal,
            baseImponible: formBase,
            tasaIgv: formTasaIgv,
            baseExonerada: formBaseExonerada,
            baseInafecta: formBaseInafecta,
            baseExportacion: formBaseExportacion,
            igv: formIgv,
            isc: formIsc,
            icbper: formIcbper,
            otrosTributos: formOtrosTributos,
            docTipo: formTipo,
            docSerie: formSerie,
            docNumero: formNumero || '00000001',
            anexoId: formClienteId || 'anx-01',
            cuentaVenta: formCuentaVenta || (formBaseExportacion > 0 ? '70111' : (formBaseExonerada > 0 ? '70122' : (formBaseInafecta > 0 ? '70123' : '70121'))),
            costoVenta: formCostoVenta,
            cuentaCosto: formCuentaCosto,
            moneda: formMoneda,
            tipoCambio: formTipoCambio,
            tieneDetraccion: formTieneDetraccion,
            montoDetraccion: formMontoDetraccion,
            porcentajeDetraccion: formPctDetraccion,
            codigoDetraccion: formCodigoBienDetraccion,
            tienePercepcion: formTienePercepcion,
            montoPercepcion: formMontoPercepcion,
            porcentajePercepcion: formPctPercepcion,
            tieneRetencion: formTieneRetencion,
            montoRetencion: formMontoRetencion,
            anticipoDeducido: formAnticipoDeducido,
            esAnticipo: formEsAnticipo,
            esGratuito: formEsGratuito,
            descuentoGlobal: formDescuentoGlobal,
            descuentoFueraFactura: formDescuentoFueraFactura,
            motivoNota: formMotivoNota,
            glosa: formGlosa
          });
          setPreviewAsiento(res);
        } catch {
          // ignore
        } finally {
          setLoadingPreview(false);
        }
      }, 250);
      return () => clearTimeout(timer);
    } else {
      setPreviewAsiento(null);
    }
  }, [
    formTotal, formBase, formTasaIgv, formBaseExonerada, formBaseInafecta, formBaseExportacion,
    formIgv, formIsc, formIcbper, formOtrosTributos, formTipo, formSerie, formNumero,
    formClienteId, formCuentaVenta, formCostoVenta, formCuentaCosto, formMoneda, formTipoCambio,
    formTieneDetraccion, formMontoDetraccion, formPctDetraccion, formCodigoBienDetraccion,
    formTienePercepcion, formMontoPercepcion, formPctPercepcion, formTieneRetencion, formMontoRetencion,
    formAnticipoDeducido, formEsAnticipo, formEsGratuito, formDescuentoGlobal, formDescuentoFueraFactura,
    formMotivoNota, formGlosa
  ]);

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
  }, [formTipo, formSerie, formNumero, formClienteId, formTotal, formBase, formIgv, formFormaPago]);

  const limpiarFormulario = () => {
    setFormNumero('');
    setFormBase(0);
    setFormIgv(0);
    setFormBaseExonerada(0);
    setFormBaseInafecta(0);
    setFormBaseExportacion(0);
    setFormIsc(0);
    setFormIcbper(0);
    setFormOtrosTributos(0);
    setFormTotal(0);
    setFormTieneDetraccion(false);
    setFormMontoDetraccion(0);
    setFormTienePercepcion(false);
    setFormMontoPercepcion(0);
    setFormTieneRetencion(false);
    setFormMontoRetencion(0);
    setFormAnticipoDeducido(0);
    setFormEsAnticipo(false);
    setFormEsGratuito(false);
    setFormDescuentoGlobal(0);
    setFormDescuentoFueraFactura(0);
    setFormCostoVenta(0);
    setFormMotivoNota('');
    setBannerError(null);
  };

  const handleRegistrar = async (comoBorrador = false) => {
    setBannerError(null);
    if (!formSerie || !formNumero) {
      setBannerError('Debe ingresar la serie y el número correlativo.');
      return;
    }
    if (!formClienteId && !formEsGratuito) {
      setBannerError('Debe seleccionar o registrar un cliente.');
      return;
    }
    if (formTotal <= 0 && !formEsGratuito) {
      setBannerError('El total debe ser mayor a cero.');
      return;
    }

    if (formTienePercepcion && formTieneRetencion) {
      setBannerError('Un comprobante no puede estar sujeto simultáneamente a Percepción y Retención.');
      return;
    }

    try {
      await crearVentaMutation.mutateAsync({
        periodoId: periodo,
        fechaEmision: formFechaEmision,
        fechaVencimiento: formFormaPago === 'CREDITO' ? formFechaVencimiento : formFechaEmision,
        fechaContable: formFechaContable,
        tipoComprobante: formTipo,
        serie: formSerie.toUpperCase(),
        numero: formNumero,
        clienteId: formClienteId || '00000000-0000-0000-0000-000000000001',
        moneda: formMoneda,
        tipoCambio: formTipoCambio,
        baseGravada: formBase,
        igv: formIgv,
        tasaIgv: formTasaIgv,
        baseNoGravada: formBaseInafecta,
        exonerado: formBaseExonerada,
        baseExportacion: formBaseExportacion,
        isc: formIsc,
        icbper: formIcbper,
        otrosTributos: formOtrosTributos,
        total: formTotal,
        tipoOperacion: formBaseExportacion > 0 ? 'EXPORTACION' : 'VENTA_INTERNA',
        formaPago: formFormaPago,
        diasCredito: formDiasCredito,
        tieneDetraccion: formTieneDetraccion,
        codigoBienDetraccion: formCodigoBienDetraccion,
        porcentajeDetraccion: formPctDetraccion,
        montoDetraccion: formMontoDetraccion,
        justificacionTasaDetraccion: formJustificacionTasaDetraccion,
        tienePercepcion: formTienePercepcion,
        porcentajePercepcion: formPctPercepcion,
        montoPercepcion: formMontoPercepcion,
        tieneRetencion: formTieneRetencion,
        montoRetencion: formMontoRetencion,
        anticipoDeducido: formAnticipoDeducido,
        esAnticipo: formEsAnticipo,
        esGratuito: formEsGratuito,
        descuentoGlobal: formDescuentoGlobal,
        descuentoFueraFactura: formDescuentoFueraFactura,
        costoVenta: formCostoVenta,
        cuentaVenta: formCuentaVenta,
        cuentaCosto: formCuentaCosto,
        motivoNota: formMotivoNota,
        glosa: formGlosa,
        estado: comoBorrador ? 'BORRADOR' : 'REGISTRADO'
      });

      limpiarFormulario();
      refetchVentas();
      refetchLibro();
      setActiveTab('LIBRO');
    } catch (err: any) {
      setBannerError(err?.response?.data?.message || err.message);
    }
  };

  const handleCrearClienteRapido = async () => {
    if (!nuevoCliRuc || !nuevoCliRazon) return;
    try {
      const nuevo = await crearAnexoMutation.mutateAsync({
        tipoDocumento: '6',
        numeroDocumento: nuevoCliRuc,
        razonSocial: nuevoCliRazon,
        direccion: nuevoCliDireccion,
        tipoEntidad: 'CLIENTE',
        condicionSunat: 'HABIDO',
        estadoSunat: 'ACTIVO'
      });
      setFormClienteId(nuevo.id);
      setModalAltaCliente(false);
      setNuevoCliRuc('');
      setNuevoCliRazon('');
      setNuevoCliDireccion('');
      success('Cliente registrado exitosamente en el catálogo de anexos.', 'Cliente Guardado');
    } catch (err: any) {
      error('Error registrando cliente: ' + (err?.response?.data?.message || err.message), 'Fallo al Guardar');
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
      const res = await consultarRucMutation.mutateAsync({ ruc, tipoEntidad: 'CLIENTE', forzar });
      setResultadoConsultaRuc(res);
      if (res.anexoId) {
        setFormClienteId(res.anexoId);
      }
      if (res.condicion === 'NO_HABIDO') {
        error(
          'El cliente figura como NO HABIDO en SUNAT. Verifique la emisión de factura según Resolución SUNAT.',
          'Alerta Tributaria SUNAT'
        );
      } else if (res.estado !== 'ACTIVO') {
        error(
          `El cliente figura en estado ${res.estado} en SUNAT. Compruebe la validez del comprobante.`,
          'Alerta Tributaria SUNAT'
        );
      } else {
        success(
          `${res.razonSocial} (${res.origen === 'CACHE_LOCAL' ? 'Caché PostgreSQL' : 'SUNAT en Vivo'})`,
          'Cliente Verificado'
        );
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || 'Error al consultar RUC';
      setErrorConsultaRuc(msg);
      error(msg, 'Error Consulta RUC');
    }
  };

  const handleConsultarRucEnModal = async () => {
    const ruc = nuevoCliRuc.trim().replace(/\D/g, '');
    if (ruc.length !== 11) {
      error('El RUC debe contener exactamente 11 dígitos', 'RUC Incompleto');
      return;
    }
    setConsultandoModalRuc(true);
    try {
      const res = await consultarRucMutation.mutateAsync({ ruc, tipoEntidad: 'CLIENTE' });
      setNuevoCliRazon(res.razonSocial);
      setNuevoCliDireccion(res.direccion || '');
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
      await anularVentaMutation.mutateAsync({ id: modalAnular.id, motivo: modalAnular.motivo });
      setModalAnular({ isOpen: false, id: '', serieNumero: '', motivo: '' });
      refetchVentas();
      refetchLibro();
      success('Comprobante de venta anulado conforme a normativa SUNAT.', 'Venta Anulada');
    } catch (err: any) {
      error('Error anulando venta: ' + (err?.response?.data?.message || err.message), 'Fallo de Anulación');
    }
  };

  const itemsVentas = ventasApiData?.items && ventasApiData.items.length > 0
    ? ventasApiData.items
    : legacyVentas.map(v => ({
        id: v.id,
        tipoComprobante: (v as any).tipoComprobante || v.tipoDoc,
        serie: v.serie,
        numero: v.numero,
        fechaEmision: v.fechaEmision,
        clienteNombre: v.razonSocialReceptor,
        clienteRuc: v.rucReceptor,
        baseGravada: v.baseImponibleGravada,
        igv: v.igv,
        total: v.total,
        estado: 'REGISTRADO',
        asientoNumero: '02090001'
      }));

  const filtrados = itemsVentas.filter((v: any) => {
    if (filtroTipo !== 'TODOS' && v.tipoComprobante !== filtroTipo) return false;
    if (filtroEstado !== 'TODOS' && v.estado !== filtroEstado) return false;
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      (v.clienteNombre && v.clienteNombre.toLowerCase().includes(q)) ||
      (v.clienteRuc && v.clienteRuc.includes(q)) ||
      `${v.serie}-${v.numero}`.toLowerCase().includes(q)
    );
  });

  const cuadre = libroReporte?.cuadreLibroDiario;

  return (
    <div className="space-y-4">
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            Registro de Ventas e Ingresos Electrónicos (RVIE) — Formato SIRE 14.4
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Emisión y registro de comprobantes de ventas, débito fiscal del IGV, cuadre contable con cuentas 70/40111 y generación de cartera CxC.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveTab('LIBRO')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'LIBRO' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Consulta Libro (14.4)
            </button>
            <button
              onClick={() => setActiveTab('DIGITACION')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'DIGITACION' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
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
            title="Abrir vista previa y exportación del Registro de Ventas"
          >
            <FileText className="w-4 h-4 text-slate-700" />
            <span>Reporte</span>
          </button>
        </div>
      </div>

      {/* Indicador de Cuadre con Libro Diario */}
      {itemsVentas.length === 0 ? (
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
                No se registran comprobantes de ventas en el período seleccionado.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] shrink-0 text-slate-500">
            <span>Base Ventas: <strong>S/ 0.00</strong></span>
            <span>|</span>
            <span>Débito Fiscal (40111): <strong>S/ 0.00</strong></span>
          </div>
        </div>
      ) : (
        <div className={`p-3 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-3 text-xs ${
          cuadre?.estaCuadrado !== false
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-200 text-emerald-800">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold flex items-center gap-2">
                <span>{cuadre?.estaCuadrado !== false ? 'Ventas Cuadradas con Libro Diario' : 'Descuadre Detectado con Cuentas 70 y 40111'}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/70">
                  Periodo {periodo}
                </span>
              </div>
              <div className="text-[11px] opacity-90">
                {cuadre?.mensaje || 'Las ventas y el débito fiscal coinciden exactamente con las cuentas 70 y 40111 al Haber.'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-[11px] shrink-0">
            <span>Base Ventas: <strong>S/ {libroReporte?.totales?.totalBaseGravada?.toFixed(2) || '0.00'}</strong></span>
            <span>|</span>
            <span>Débito Fiscal (40111): <strong>S/ {libroReporte?.totales?.totalIgv?.toFixed(2) || '0.00'}</strong></span>
          </div>
        </div>
      )}

      {/* DIGITACIÓN RÁPIDA DE VENTAS */}
      {activeTab === 'DIGITACION' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm">Digitación Rápida de Comprobante de Venta (RVIE - Subdiario 02)</h3>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                <span className="px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-700">Ctrl+Enter: Registrar</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-700">Ctrl+N: Nuevo</span>
              </div>
            </div>

            {bannerError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{bannerError}</span>
              </div>
            )}

            {/* Fila 1: Comprobante y Numeración */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Tipo Comprobante</label>
                <select
                  value={formTipo}
                  onChange={(e) => {
                    const tipo = e.target.value as any;
                    setFormTipo(tipo);
                    if (tipo === '03' && !formSerie.startsWith('B')) setFormSerie('B001');
                    else if (tipo === '01' && !formSerie.startsWith('F')) setFormSerie('F001');
                    else if (tipo === '07' && !formSerie.startsWith('FC') && !formSerie.startsWith('BC')) setFormSerie('FC01');
                    else if (tipo === '08' && !formSerie.startsWith('FD') && !formSerie.startsWith('BD')) setFormSerie('FD01');
                  }}
                  className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="01">01 - Factura Electrónica</option>
                  <option value="03">03 - Boleta de Venta</option>
                  <option value="07">07 - Nota de Crédito</option>
                  <option value="08">08 - Nota de Débito</option>
                  <option value="12">12 - Ticket o Cinta Emitida por Máquina</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Serie</label>
                <input
                  type="text"
                  maxLength={4}
                  value={formSerie}
                  onChange={(e) => setFormSerie(e.target.value.toUpperCase())}
                  placeholder="F001"
                  className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-xl uppercase bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Número Correlativo</label>
                <input
                  type="text"
                  value={formNumero}
                  onChange={(e) => setFormNumero(e.target.value)}
                  placeholder="00000123"
                  className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            {/* Fila 2: Fechas y Moneda */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Fecha Emisión</label>
                <input
                  type="date"
                  value={formFechaEmision}
                  onChange={(e) => setFormFechaEmision(e.target.value)}
                  className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-xl bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Fecha Contable</label>
                <input
                  type="date"
                  value={formFechaContable}
                  onChange={(e) => setFormFechaContable(e.target.value)}
                  className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-xl bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Moneda</label>
                <select
                  value={formMoneda}
                  onChange={(e) => setFormMoneda(e.target.value as any)}
                  className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-xl bg-slate-50"
                >
                  <option value="PEN">PEN (Soles - S/)</option>
                  <option value="USD">USD (Dólares - $)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Tipo Cambio (SUNAT Compra)</label>
                <input
                  type="number"
                  step="0.001"
                  value={formTipoCambio}
                  onChange={(e) => setFormTipoCambio(parseFloat(e.target.value) || 1.0)}
                  disabled={formMoneda === 'PEN'}
                  className={`w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-xl ${
                    formMoneda === 'PEN' ? 'bg-slate-100 text-slate-400' : 'bg-white focus:ring-2 focus:ring-emerald-500'
                  }`}
                />
              </div>
            </div>

            {/* Fila 3: Cliente con Validación SUNAT en Tiempo Real */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-600" />
                  <label className="text-xs font-bold text-slate-800">
                    Cliente y Validación SUNAT en Tiempo Real
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setModalAltaCliente(true)}
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> + Alta Rápida
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
                    placeholder="Consultar RUC Cliente (11 dígitos, ej. 20601234567)..."
                    className="w-full text-xs font-mono font-bold pl-3 pr-20 py-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono font-semibold text-slate-400">
                    {rucBusquedaDirecta.length}/11
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleConsultarRucEnRegistro(false)}
                  disabled={consultarRucMutation.isPending || rucBusquedaDirecta.length !== 11}
                  className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer ${
                    consultarRucMutation.isPending || rucBusquedaDirecta.length !== 11
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                  }`}
                  title="Verificar estado del cliente en SUNAT y caché local"
                >
                  {consultarRucMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Verificando...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Consultar SUNAT (Simulado)</span>
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

              {/* Selector de lista de clientes guardados */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  O seleccionar cliente del catálogo:
                </label>
                <select
                  value={formClienteId}
                  onChange={(e) => {
                    setFormClienteId(e.target.value);
                    const c = anexosList.find((a: any) => a.id === e.target.value);
                    if (c) {
                      setRucBusquedaDirecta(c.numeroDocumento);
                      setResultadoConsultaRuc(null);
                    }
                  }}
                  className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="">-- Seleccionar cliente del catálogo --</option>
                  {anexosList.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.numeroDocumento} - {a.razonSocial} {a.condicionSunat === 'NO_HABIDO' ? '⚠️ (NO HABIDO)' : ''} ({a.estadoSunat})
                    </option>
                  ))}
                </select>
              </div>

              {/* Ficha de Estado Tributario del Cliente Seleccionado */}
              {(clienteSeleccionado || resultadoConsultaRuc) && (
                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <div>
                      <div className="font-mono font-bold text-slate-900 text-xs">
                        RUC: {clienteSeleccionado?.numeroDocumento || resultadoConsultaRuc?.ruc}
                      </div>
                      <div className="font-bold text-slate-800 text-xs mt-0.5">
                        {clienteSeleccionado?.razonSocial || resultadoConsultaRuc?.razonSocial}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Badge Estado SUNAT */}
                      {(() => {
                        const estado = clienteSeleccionado?.estadoSunat || resultadoConsultaRuc?.estado;
                        const esActivo = estado === 'ACTIVO';
                        return (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1 ${
                            esActivo 
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}>
                            {esActivo ? <ShieldCheck className="w-3 h-3 text-emerald-600" /> : <ShieldAlert className="w-3 h-3 text-rose-600" />}
                            {estado}
                          </span>
                        );
                      })()}

                      {/* Badge Condición SUNAT */}
                      {(() => {
                        const condicion = clienteSeleccionado?.condicionSunat || resultadoConsultaRuc?.condicion;
                        const esHabido = condicion === 'HABIDO';
                        return (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1 ${
                            esHabido 
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                              : 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                          }`}>
                            {esHabido ? 'HABIDO' : '⚠️ NO HABIDO'}
                          </span>
                        );
                      })()}

                      {/* Origen de los datos */}
                      {resultadoConsultaRuc?.origen && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-600">
                          {resultadoConsultaRuc.origen === 'CACHE_LOCAL' ? '⚡ Caché DB' : 'Simulado / sin conexión'}
                        </span>
                      )}

                      {/* Botón Revalidar en Vivo */}
                      <button
                        type="button"
                        onClick={() => handleConsultarRucEnRegistro(true)}
                        disabled={consultarRucMutation.isPending}
                        className="px-2 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg flex items-center gap-1 cursor-pointer transition"
                        title="Forzar actualización en tiempo real desde SUNAT"
                      >
                        <RefreshCw className={`w-3 h-3 ${consultarRucMutation.isPending ? 'animate-spin' : ''}`} />
                        <span>Revalidar</span>
                      </button>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">Dirección Fiscal: </span>
                    {clienteSeleccionado?.direccion || resultadoConsultaRuc?.direccion || 'Sin dirección registrada en padrón'}
                  </div>
                </div>
              )}
            </div>

            {/* Fila 4: Desglose Completo de Bases Imponibles y Tributos (RVIE) */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-emerald-600" />
                  Bases Imponibles y Liquidación Tributaria (RVIE)
                </span>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 font-semibold">Tasa IGV:</span>
                  <select
                    value={formTasaIgv}
                    onChange={(e) => {
                      const tasa = parseFloat(e.target.value);
                      setFormTasaIgv(tasa);
                      recalcularTotales(formBase, formBaseExonerada, formBaseInafecta, formBaseExportacion, formIsc, formIcbper, formOtrosTributos, tasa);
                    }}
                    className="p-1 font-bold border border-slate-300 rounded-lg bg-white text-emerald-800 text-xs"
                  >
                    <option value={0.18}>18% General (16% IGV + 2% IPM)</option>
                    <option value={0.10}>10% Especial (Ley 31556 / 32219 Restaurantes/Hoteles)</option>
                    <option value={0.14}>14% Reducida (2027 Ley 32219)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Base Gravada</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formBase || ''}
                    onChange={(e) => handleBaseChange(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-xl bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">IGV Débito Fiscal</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formIgv || ''}
                    onChange={(e) => setFormIgv(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-xl bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Venta Exonerada (70122)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formBaseExonerada || ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setFormBaseExonerada(v);
                      recalcularTotales(formBase, v, formBaseInafecta, formBaseExportacion, formIsc, formIcbper, formOtrosTributos, formTasaIgv);
                    }}
                    placeholder="0.00"
                    className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-xl bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Venta Inafecta (70123)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formBaseInafecta || ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setFormBaseInafecta(v);
                      recalcularTotales(formBase, formBaseExonerada, v, formBaseExportacion, formIsc, formIcbper, formOtrosTributos, formTasaIgv);
                    }}
                    placeholder="0.00"
                    className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-xl bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Exportación (70111)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formBaseExportacion || ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setFormBaseExportacion(v);
                      recalcularTotales(formBase, formBaseExonerada, formBaseInafecta, v, formIsc, formIcbper, formOtrosTributos, formTasaIgv);
                    }}
                    placeholder="0.00"
                    className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-xl bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">ISC (40121)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formIsc || ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setFormIsc(v);
                      recalcularTotales(formBase, formBaseExonerada, formBaseInafecta, formBaseExportacion, v, formIcbper, formOtrosTributos, formTasaIgv);
                    }}
                    placeholder="0.00"
                    className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-xl bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">ICBPER Bolsas (401891)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formIcbper || ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setFormIcbper(v);
                      recalcularTotales(formBase, formBaseExonerada, formBaseInafecta, formBaseExportacion, formIsc, v, formOtrosTributos, formTasaIgv);
                    }}
                    placeholder="0.00"
                    className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-xl bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-emerald-900 mb-1">Total Comprobante</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formTotal || ''}
                    onChange={(e) => handleTotalChange(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full text-sm font-mono font-black text-emerald-950 p-2 border border-emerald-300 rounded-xl bg-emerald-50/50"
                  />
                </div>
              </div>
            </div>

            {/* Fila 5: Regímenes Tributarios Avanzados (SPOT, Percepción, Anticipo, Gratuito) */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-emerald-600" />
                Regímenes Tributarios y Opciones Contables
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Detracción SPOT Clientes */}
                <div className={`p-3 rounded-xl border transition ${
                  formTieneDetraccion ? 'bg-amber-50/80 border-amber-300' : 'bg-white border-slate-200'
                }`}>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formTieneDetraccion}
                      onChange={(e) => {
                        const check = e.target.checked;
                        setFormTieneDetraccion(check);
                        if (check) {
                          const item = buscarDetraccionPorCodigo(formCodigoBienDetraccion);
                          const pct = item ? item.porcentaje : 12;
                          setFormPctDetraccion(pct);
                          setFormMontoDetraccion(Number((formTotal * (pct / 100)).toFixed(2)));
                        } else {
                          setFormMontoDetraccion(0);
                        }
                      }}
                      className="rounded text-emerald-600"
                    />
                    Sujeto a Detracción SPOT Clientes (12121 / 12122)
                  </label>

                  {formTieneDetraccion && (
                    <div className="mt-2 space-y-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Bien o Servicio Sujeto:</span>
                        <select
                          value={formCodigoBienDetraccion}
                          onChange={(e) => {
                            const cod = e.target.value;
                            setFormCodigoBienDetraccion(cod);
                            const item = buscarDetraccionPorCodigo(cod);
                            if (item) {
                              setFormPctDetraccion(item.porcentaje);
                              setFormMontoDetraccion(Number((formTotal * (item.porcentaje / 100)).toFixed(2)));
                            }
                          }}
                          className="w-full p-1.5 mt-0.5 border border-slate-300 rounded-lg bg-white text-xs"
                        >
                          {CATALOGO_OFICIAL_DETRACCIONES_SUNAT.map((it) => (
                            <option key={it.codigo} value={it.codigo}>
                              {it.codigo} - {it.descripcion} ({it.porcentaje}%)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-1/2">
                          <span className="text-[10px] text-slate-500 font-bold">Tasa SPOT (%):</span>
                          <input
                            type="number"
                            value={formPctDetraccion}
                            onChange={(e) => {
                              const pct = parseFloat(e.target.value) || 0;
                              setFormPctDetraccion(pct);
                              setFormMontoDetraccion(Number((formTotal * (pct / 100)).toFixed(2)));
                            }}
                            className="w-full p-1.5 mt-0.5 font-mono font-bold border border-slate-300 rounded-lg bg-white"
                          />
                        </div>
                        <div className="w-1/2">
                          <span className="text-[10px] text-slate-500 font-bold">Monto Detracción (S/):</span>
                          <input
                            type="number"
                            step="0.01"
                            value={formMontoDetraccion}
                            onChange={(e) => setFormMontoDetraccion(parseFloat(e.target.value) || 0)}
                            className="w-full p-1.5 mt-0.5 font-mono font-bold border border-amber-300 rounded-lg bg-white text-amber-900"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Percepción de IGV */}
                <div className={`p-3 rounded-xl border transition ${
                  formTienePercepcion ? 'bg-indigo-50/80 border-indigo-300' : 'bg-white border-slate-200'
                }`}>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formTienePercepcion}
                      onChange={(e) => {
                        const check = e.target.checked;
                        if (check && formTieneRetencion) {
                          setBannerError('Incompatibilidad normativa: No se puede aplicar Percepción y Retención simultáneamente.');
                          return;
                        }
                        setFormTienePercepcion(check);
                        if (check) {
                          setFormMontoPercepcion(Number((formTotal * (formPctPercepcion / 100)).toFixed(2)));
                        } else {
                          setFormMontoPercepcion(0);
                        }
                      }}
                      className="rounded text-emerald-600"
                    />
                    Agente de Percepción de IGV (40113 al Haber)
                  </label>

                  {formTienePercepcion && (
                    <div className="mt-2 space-y-2 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-1/2">
                          <span className="text-[10px] text-slate-500 font-bold">Tasa Percepción (%):</span>
                          <select
                            value={formPctPercepcion}
                            onChange={(e) => {
                              const pct = parseFloat(e.target.value) || 2.0;
                              setFormPctPercepcion(pct);
                              setFormMontoPercepcion(Number((formTotal * (pct / 100)).toFixed(2)));
                            }}
                            className="w-full p-1.5 mt-0.5 border border-slate-300 rounded-lg bg-white font-bold"
                          >
                            <option value={2.0}>2% Venta Interna de Bienes</option>
                            <option value={0.5}>0.5% Combustibles y Derivados</option>
                          </select>
                        </div>
                        <div className="w-1/2">
                          <span className="text-[10px] text-slate-500 font-bold">Monto Percepción:</span>
                          <input
                            type="number"
                            step="0.01"
                            value={formMontoPercepcion}
                            onChange={(e) => setFormMontoPercepcion(parseFloat(e.target.value) || 0)}
                            className="w-full p-1.5 mt-0.5 font-mono font-bold border border-indigo-300 rounded-lg bg-white text-indigo-900"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Opciones Adicionales: Anticipo, Gratuito, Costo Kardex */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Deducción de Anticipo (1221)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formAnticipoDeducido || ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setFormAnticipoDeducido(v);
                      recalcularTotales(formBase, formBaseExonerada, formBaseInafecta, formBaseExportacion, formIsc, formIcbper, formOtrosTributos, formTasaIgv, formDescuentoGlobal, v);
                    }}
                    placeholder="0.00"
                    className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-xl bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Costo de Ventas (Kardex 69/20)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formCostoVenta || ''}
                    onChange={(e) => setFormCostoVenta(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full text-xs font-mono font-bold p-2 border border-slate-300 rounded-xl bg-white"
                  />
                </div>

                <div className="flex flex-col justify-center space-y-1.5 pt-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formEsGratuito}
                      onChange={(e) => setFormEsGratuito(e.target.checked)}
                      className="rounded text-emerald-600"
                    />
                    Operación a Título Gratuito (659)
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formEsAnticipo}
                      onChange={(e) => setFormEsAnticipo(e.target.checked)}
                      className="rounded text-emerald-600"
                    />
                    Emisión de Factura de Anticipo (1221)
                  </label>
                </div>
              </div>
            </div>

            {/* Fila 6: Forma de Pago */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label className="text-[11px] font-bold text-slate-700">Forma de Pago</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="formaPagoVenta"
                    checked={formFormaPago === 'CONTADO'}
                    onChange={() => setFormFormaPago('CONTADO')}
                  />
                  Contado
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="formaPagoVenta"
                    checked={formFormaPago === 'CREDITO'}
                    onChange={() => setFormFormaPago('CREDITO')}
                  />
                  Crédito (Genera CxC en Cartera)
                </label>
              </div>
              {formFormaPago === 'CREDITO' && (
                <div className="pt-2 flex items-center gap-2 text-xs">
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

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
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
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition cursor-pointer"
                >
                  Guardar Borrador
                </button>
                <button
                  type="button"
                  onClick={() => handleRegistrar(false)}
                  disabled={crearVentaMutation.isPending}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Registrar y Contabilizar (Ctrl+Enter)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Previsualización Asiento */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                Previsualización de Asiento PCGE
              </h3>
              {loadingPreview && <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin" />}
            </div>

            <p className="text-[11px] text-slate-500">
              Generado en tiempo real según las reglas de contabilización de la empresa antes del guardado físico.
            </p>

            {previewAsiento ? (
              <div className="space-y-3">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Glosa Automática</div>
                  <div className="font-semibold text-slate-800 truncate">{previewAsiento.glosaGeneral}</div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-[11px] font-mono">
                    <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
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
                            <div className="font-bold text-slate-800">{l.codigoCuenta}</div>
                            <div className="text-[10px] text-slate-500 truncate max-w-[140px]">{l.denominacionCuenta || l.glosaLinea}</div>
                          </td>
                          <td className="p-2 text-right font-bold text-slate-900">
                            {l.debe > 0 ? Number(l.debe).toFixed(2) : '-'}
                          </td>
                          <td className="p-2 text-right font-bold text-slate-900">
                            {l.haber > 0 ? Number(l.haber).toFixed(2) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                      <tr>
                        <td className="p-2">Total</td>
                        <td className="p-2 text-right">{Number(previewAsiento.totalDebe).toFixed(2)}</td>
                        <td className="p-2 text-right">{Number(previewAsiento.totalHaber).toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className={`p-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-between ${
                  previewAsiento.cuadrado
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  <span>Partida Doble:</span>
                  <span>{previewAsiento.cuadrado ? `CUADRADO (Dif: S/ 0.00)` : `DESCUADRADO (Dif: S/ ${Number(previewAsiento.diferencia).toFixed(2)})`}</span>
                </div>

                {previewAsiento.metodoInventario && (
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-600 font-mono">
                    Método de Inventario: <strong>{previewAsiento.metodoInventario}</strong>
                    {previewAsiento.metodoInventario === 'PERMANENTE' && ' (Costo integrado en venta)'}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                Ingrese un importe o configure la venta para previsualizar el asiento contable en partida doble.
              </div>
            )}
          </div>
        </div>
      )}

      {/* VISTA LIBRO 14.4 */}
      {activeTab === 'LIBRO' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 border border-slate-200 rounded-2xl shadow-xs">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por RUC cliente, razón social o serie-número..."
                className="w-full pl-9 pr-4 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="text-xs p-1.5 border border-slate-200 rounded-xl bg-slate-50 font-semibold"
              >
                <option value="TODOS">Todos los tipos</option>
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

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 sticky top-0 z-10 text-[11px] uppercase">
                  <tr>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Serie-Número</th>
                    <th className="p-3">RUC / DNI</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3 text-right">Base Gravada</th>
                    <th className="p-3 text-right">IGV Débito</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3 text-center">Asiento</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {filtrados.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-4 text-center font-sans">
                        <EmptyStateInstructivo
                          moduloNombre="Registro de Ventas (RVIE)"
                          titulo="No hay comprobantes de venta en este periodo"
                          descripcion="El Registro de Ventas e Ingresos Electrónico (RVIE) consolida la emisión de facturas y boletas con cálculo automático del débito fiscal IGV 18% y cuentas por cobrar (1212)."
                          checklist={[
                            { titulo: 'Identificación de Cliente', cumplido: false, descripcion: 'RUC para Facturas o DNI para Boletas de venta' },
                            { titulo: 'Definición de Serie y Correlativo', cumplido: false, descripcion: 'Serie F001 / B001 con correlativo numérico de 8 dígitos' },
                            { titulo: 'Asignación de Cuenta de Ingreso (70)', cumplido: false, descripcion: 'Cuenta 7012 (Mercaderías) o 7041 (Servicios prestados)' }
                          ]}
                          onRegistrarNuevo={() => setActiveTab('DIGITACION')}
                          textoRegistrar="Emitir Primera Venta"
                        />
                      </td>
                    </tr>
                  ) : (
                    filtrados.map((v: any) => (
                      <tr key={v.id} className={`hover:bg-slate-50 ${v.estado === 'ANULADO' ? 'opacity-50 line-through' : ''}`}>
                        <td className="p-3 whitespace-nowrap">{v.fechaEmision}</td>
                        <td className="p-3 font-bold text-emerald-700">{v.tipoComprobante}</td>
                        <td className="p-3 font-bold text-slate-900 whitespace-nowrap">{v.serie}-{v.numero}</td>
                        <td className="p-3 text-slate-600">{v.clienteRuc}</td>
                        <td className="p-3 font-sans truncate max-w-[180px] font-medium text-slate-800" title={v.clienteNombre}>
                          {v.clienteNombre}
                        </td>
                        <td className="p-3 text-right font-bold text-slate-800">{Number(v.baseGravada).toFixed(2)}</td>
                        <td className="p-3 text-right font-bold text-slate-800">{Number(v.igv).toFixed(2)}</td>
                        <td className="p-3 text-right font-black text-slate-900">{Number(v.total).toFixed(2)}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            v.estado === 'REGISTRADO' ? 'bg-emerald-100 text-emerald-800' :
                            v.estado === 'BORRADOR' ? 'bg-amber-100 text-amber-800' :
                            'bg-rose-100 text-rose-800'
                          }`}>
                            {v.estado}
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold text-indigo-600">{v.asientoNumero || '-'}</td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                setFormTipo(v.tipoComprobante);
                                setFormSerie(v.serie);
                                setFormNumero(`${parseInt(v.numero, 10) + 1 || 1}`);
                                setFormBase(v.baseGravada);
                                setFormIgv(v.igv);
                                setFormTotal(v.total);
                                setActiveTab('DIGITACION');
                              }}
                              className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-100 transition cursor-pointer"
                              title="Duplicar datos para nueva venta (Ctrl+D)"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            {v.estado === 'REGISTRADO' && (
                              <button
                                onClick={() => setModalAnular({
                                  isOpen: true,
                                  id: v.id,
                                  serieNumero: `${v.serie}-${v.numero}`,
                                  motivo: 'Anulación de venta'
                                })}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                title="Anular comprobante de venta"
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
                    <td colSpan={5} className="p-3">Totales ({filtrados.length} ventas)</td>
                    <td className="p-3 text-right font-mono">
                      S/ {filtrados.reduce((acc: number, v: any) => acc + (v.estado !== 'ANULADO' ? Number(v.baseGravada) : 0), 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-mono">
                      S/ {filtrados.reduce((acc: number, v: any) => acc + (v.estado !== 'ANULADO' ? Number(v.igv) : 0), 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-950 font-black">
                      S/ {filtrados.reduce((acc: number, v: any) => acc + (v.estado !== 'ANULADO' ? Number(v.total) : 0), 0).toFixed(2)}
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Alta Rápida de Cliente */}
      {modalAltaCliente && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-900 text-base">Alta Rápida de Cliente</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">RUC o DNI</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={11}
                    value={nuevoCliRuc}
                    onChange={(e) => setNuevoCliRuc(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleConsultarRucEnModal();
                      }
                    }}
                    placeholder="20XXXXXXXXX o DNI"
                    className="flex-1 text-xs font-mono font-bold p-2 border border-slate-300 rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={handleConsultarRucEnModal}
                    disabled={consultandoModalRuc || nuevoCliRuc.length !== 11}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                      consultandoModalRuc || nuevoCliRuc.length !== 11
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer shadow-xs'
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
                <label className="block text-xs font-bold text-slate-600 mb-1">Razón Social o Nombre Completo</label>
                <input
                  type="text"
                  value={nuevoCliRazon}
                  onChange={(e) => setNuevoCliRazon(e.target.value.toUpperCase())}
                  placeholder="CLIENTE S.A.C."
                  className="w-full text-xs font-bold p-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Dirección (Opcional)</label>
                <input
                  type="text"
                  value={nuevoCliDireccion}
                  onChange={(e) => setNuevoCliDireccion(e.target.value)}
                  placeholder="Av. Las Camelias 450, San Isidro"
                  className="w-full text-xs p-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setModalAltaCliente(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={handleCrearClienteRapido}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl"
              >
                Guardar Cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmación Anular */}
      {modalAnular.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <Ban className="w-6 h-6" />
              <h3 className="font-bold text-slate-900 text-base">Anular Comprobante de Venta</h3>
            </div>
            <p className="text-xs text-slate-600">
              ¿Está seguro de anular el comprobante <strong>{modalAnular.serieNumero}</strong>? Se generará un asiento contable de extorno y se anulará la cuenta por cobrar asociada.
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
      {/* Modal de Vista Previa Formato Estándar */}
      {modalEstandarOpen && (
        <VisorReporteModal
          isOpen={modalEstandarOpen}
          onClose={() => setModalEstandarOpen(false)}
          definicion={construirDefinicionRegistroVentasEstandar(empresa, itemsVentas, periodo)}
        />
      )}
    </div>
  );
};
