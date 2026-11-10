import React, { useState, useMemo, useEffect } from 'react';
import { 
  Landmark, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  CreditCard,
  Building,
  DollarSign,
  Upload,
  RefreshCw,
  AlertCircle,
  FileText,
  Lock,
  XCircle,
  ArrowRightLeft,
  Receipt,
  Coins,
  FileCheck,
  RotateCcw,
  SlidersHorizontal,
  Wallet
} from 'lucide-react';
import { MovimientoCajaBanco } from '../../types';
import { 
  useCuentasFinancieras, 
  useMovimientosTesoreria, 
  useRegistrarMovimientoTesoreria,
  useAnularMovimientoTesoreria,
  useConciliacionBancaria,
  useImportarExtracto,
  useConciliarPartida,
  useDesconciliarPartida,
  useCerrarConciliacion
} from '../../hooks/useTesoreriaPlanilla';
import { useCuentasPorCobrar, useCuentasPorPagar, useAnexosList } from '../../hooks/useOperaciones';
import { useToast } from '../../context/ToastContext';

interface CajaBancosViewProps {
  empresaId?: string;
  periodo?: string;
  subdiarioCodigo?: string;
  movimientos?: MovimientoCajaBanco[];
  onAddMovimiento?: (mov: MovimientoCajaBanco) => void;
}

export const CajaBancosView: React.FC<CajaBancosViewProps> = ({
  empresaId = '00000000-0000-0000-0000-000000000001',
  periodo = '2026-09',
  subdiarioCodigo,
  movimientos = [],
  onAddMovimiento
}) => {
  const { success, error } = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'digitacion' | 'movimientos' | 'conciliacion'>(
    subdiarioCodigo ? 'digitacion' : 'movimientos'
  );
  const [cuentaSeleccionadaId, setCuentaSeleccionadaId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isModalExtractoOpen, setIsModalExtractoOpen] = useState(false);
  const [modalAnular, setModalAnular] = useState<{ open: boolean; id: string; motivo: string }>({
    open: false,
    id: '',
    motivo: 'Anulación de movimiento bancario por error operativo'
  });

  // Queries
  const { data: cuentas = [], isLoading: loadingCuentas } = useCuentasFinancieras(empresaId);
  const ctaActiva = cuentas.find(c => c.id === cuentaSeleccionadaId) || cuentas[0];

  const { data: movsData, isLoading: loadingMovs } = useMovimientosTesoreria(empresaId, {
    cuentaFinancieraId: ctaActiva?.id,
    tipo: filtroTipo !== 'TODOS' ? filtroTipo : undefined
  });

  const { data: cxcList = [] } = useCuentasPorCobrar(empresaId);
  const { data: cxpList = [] } = useCuentasPorPagar(empresaId);
  const { data: anexos = [] } = useAnexosList(empresaId);

  // Mutations
  const regMovMutation = useRegistrarMovimientoTesoreria(empresaId);
  const anularMovMutation = useAnularMovimientoTesoreria(empresaId);
  const importarExtractoMutation = useImportarExtracto(empresaId);
  const conciliarMutation = useConciliarPartida(empresaId);
  const desconciliarMutation = useDesconciliarPartida(empresaId);
  const cerrarConcilMutation = useCerrarConciliacion(empresaId);

  // Conciliación Query
  const { data: conciliacionData, refetch: refetchConciliacion } = useConciliacionBancaria(
    empresaId,
    ctaActiva?.id || '',
    `per-${periodo}`,
    `${periodo}-30`
  );

  // Form Movimiento State
  const [formTipo, setFormTipo] = useState<'INGRESO' | 'EGRESO'>('INGRESO');
  const [formFecha, setFormFecha] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formMonto, setFormMonto] = useState<number>(0);
  const [formGlosa, setFormGlosa] = useState<string>('');
  const [formOperacion, setFormOperacion] = useState<string>('');
  const [formAnexoId, setFormAnexoId] = useState<string>('');
  const [docSeleccionadoId, setDocSeleccionadoId] = useState<string>('');
  const [montoAplicar, setMontoAplicar] = useState<number>(0);

  // Form Extracto State
  const [extractoCsvTexto, setExtractoCsvTexto] = useState<string>('');
  const [nombreArchivoExtracto, setNombreArchivoExtracto] = useState<string>('extracto_banco.csv');

  // Contexto y Estado para Digitación Rápida de Tesorería por Subdiario
  const codigoSubdiarioActivo = subdiarioCodigo || (ctaActiva?.tipo === 'CAJA' ? '03' : '04');
  const [formModo, setFormModo] = useState<string>(
    codigoSubdiarioActivo === '03'
      ? 'COBRANZA_FACTURA'
      : (codigoSubdiarioActivo === '05' ? 'DEPOSITO_DETRACCION' : 'PAGO_PROVEEDOR')
  );
  const [formMoneda, setFormMoneda] = useState<'PEN' | 'USD'>(ctaActiva?.moneda || 'PEN');
  const [formTipoCambio, setFormTipoCambio] = useState<number>(3.75);
  const [formTieneRetencion, setFormTieneRetencion] = useState<boolean>(false);
  const [formPctRetencion, setFormPctRetencion] = useState<number>(3.0);
  const [formMontoRetencion, setFormMontoRetencion] = useState<number>(0);
  const [formTipoDiferencia, setFormTipoDiferencia] = useState<'GANANCIA' | 'PERDIDA' | 'NINGUNA'>('NINGUNA');
  const [formDiferenciaCambio, setFormDiferenciaCambio] = useState<number>(0);
  const [formTipoTributo, setFormTipoTributo] = useState<'IGV' | 'RENTA' | 'ESSALUD' | 'ONP'>('IGV');
  const [formCuentaDestinoId, setFormCuentaDestinoId] = useState<string>('');

  useEffect(() => {
    if (ctaActiva?.moneda) {
      setFormMoneda(ctaActiva.moneda);
    }
  }, [ctaActiva?.id]);

  useEffect(() => {
    if (subdiarioCodigo === '03') setFormModo('COBRANZA_FACTURA');
    else if (subdiarioCodigo === '04') setFormModo('PAGO_PROVEEDOR');
    else if (subdiarioCodigo === '05') setFormModo('DEPOSITO_DETRACCION');
  }, [subdiarioCodigo]);

  // Previsualización contable en tiempo real para Tesorería
  const previsualizacion = useMemo(() => {
    const lineas: Array<{
      linea: number;
      codigoCuenta: string;
      denominacionCuenta: string;
      debe: number;
      haber: number;
    }> = [];
    let num = 1;
    const monto = Number(formMonto || 0);

    if (monto <= 0) {
      return {
        lineas: [],
        totalDebe: 0,
        totalHaber: 0,
        cuadrado: false,
        diferencia: 0
      };
    }

    if (formModo === 'COBRANZA_FACTURA' || formModo === 'COBRO_EFECTIVO' || formModo === 'COBRO_CHEQUE' || formModo === 'ANTICIPO_CLIENTE' || formModo === 'COBRO_USD') {
      const ctaFin = formModo === 'COBRO_EFECTIVO'
        ? '1011'
        : (formModo === 'COBRO_CHEQUE'
          ? '1031'
          : (formMoneda === 'USD' ? '10412' : '10411'));
      const nomFin = formModo === 'COBRO_EFECTIVO'
        ? 'Caja central - Efectivo'
        : (formModo === 'COBRO_CHEQUE'
          ? 'Efectivo en tránsito - Cheques en cartera'
          : (formMoneda === 'USD'
            ? 'Cuentas corrientes operativas - Moneda extranjera'
            : 'Cuentas corrientes operativas - Moneda nacional'));

      const ctaCobrar = formModo === 'ANTICIPO_CLIENTE' ? '1221' : '1212';
      const nomCobrar = formModo === 'ANTICIPO_CLIENTE'
        ? 'Anticipos de clientes'
        : 'Facturas por cobrar - Emitidas en cartera';

      if (formTipoDiferencia === 'GANANCIA' && formDiferenciaCambio > 0) {
        const montoOrig = Number((monto - formDiferenciaCambio).toFixed(2));
        lineas.push({ linea: num++, codigoCuenta: ctaFin, denominacionCuenta: nomFin, debe: monto, haber: 0 });
        lineas.push({ linea: num++, codigoCuenta: ctaCobrar, denominacionCuenta: nomCobrar, debe: 0, haber: montoOrig });
        lineas.push({ linea: num++, codigoCuenta: '776', denominacionCuenta: 'Ganancia por diferencia de cambio', debe: 0, haber: formDiferenciaCambio });
      } else if (formTipoDiferencia === 'PERDIDA' && formDiferenciaCambio > 0) {
        const montoOrig = Number((monto + formDiferenciaCambio).toFixed(2));
        lineas.push({ linea: num++, codigoCuenta: ctaFin, denominacionCuenta: nomFin, debe: monto, haber: 0 });
        lineas.push({ linea: num++, codigoCuenta: '676', denominacionCuenta: 'Pérdida por diferencia de cambio', debe: formDiferenciaCambio, haber: 0 });
        lineas.push({ linea: num++, codigoCuenta: ctaCobrar, denominacionCuenta: nomCobrar, debe: 0, haber: montoOrig });
      } else {
        lineas.push({ linea: num++, codigoCuenta: ctaFin, denominacionCuenta: nomFin, debe: monto, haber: 0 });
        lineas.push({ linea: num++, codigoCuenta: ctaCobrar, denominacionCuenta: nomCobrar, debe: 0, haber: monto });
      }
    } else if (formModo === 'DEPOSITO_CHEQUE') {
      lineas.push({ linea: num++, codigoCuenta: '10411', denominacionCuenta: 'Cuentas corrientes operativas - Moneda nacional', debe: monto, haber: 0 });
      lineas.push({ linea: num++, codigoCuenta: '1031', denominacionCuenta: 'Efectivo en tránsito - Cheques en cartera', debe: 0, haber: monto });
    } else if (formModo === 'APERTURA_CAJA_CHICA') {
      lineas.push({ linea: num++, codigoCuenta: '1021', denominacionCuenta: 'Fondos fijos - Caja chica moneda nacional', debe: monto, haber: 0 });
      lineas.push({ linea: num++, codigoCuenta: '10411', denominacionCuenta: 'Cuentas corrientes operativas - Moneda nacional', debe: 0, haber: monto });
    } else if (formModo === 'PAGO_PROVEEDOR' || formModo === 'PAGO_RETENCION_CRE' || formModo === 'PAGO_CAJA_CHICA' || formModo === 'PAGO_USD') {
      const ctaPasivo = '4212';
      const ctaFin = formModo === 'PAGO_CAJA_CHICA'
        ? '1021'
        : (formMoneda === 'USD' ? '10412' : '10411');
      const nomFin = formModo === 'PAGO_CAJA_CHICA'
        ? 'Fondos fijos - Caja chica'
        : (formMoneda === 'USD'
          ? 'Cuentas corrientes operativas - Moneda extranjera'
          : 'Cuentas corrientes operativas - Moneda nacional');

      if ((formModo === 'PAGO_RETENCION_CRE' || formTieneRetencion) && formMontoRetencion > 0) {
        const neto = Number((monto - formMontoRetencion).toFixed(2));
        lineas.push({ linea: num++, codigoCuenta: ctaPasivo, denominacionCuenta: 'Facturas por pagar - Emitidas (Total)', debe: monto, haber: 0 });
        lineas.push({ linea: num++, codigoCuenta: '40114', denominacionCuenta: 'IGV - Régimen de retenciones por pagar (3%)', debe: 0, haber: formMontoRetencion });
        lineas.push({ linea: num++, codigoCuenta: ctaFin, denominacionCuenta: nomFin, debe: 0, haber: neto });
      } else if (formTipoDiferencia === 'PERDIDA' && formDiferenciaCambio > 0) {
        const montoOrig = Number((monto - formDiferenciaCambio).toFixed(2));
        lineas.push({ linea: num++, codigoCuenta: ctaPasivo, denominacionCuenta: 'Facturas por pagar - Emitidas', debe: montoOrig, haber: 0 });
        lineas.push({ linea: num++, codigoCuenta: '676', denominacionCuenta: 'Pérdida por diferencia de cambio', debe: formDiferenciaCambio, haber: 0 });
        lineas.push({ linea: num++, codigoCuenta: ctaFin, denominacionCuenta: nomFin, debe: 0, haber: monto });
      } else if (formTipoDiferencia === 'GANANCIA' && formDiferenciaCambio > 0) {
        const montoOrig = Number((monto + formDiferenciaCambio).toFixed(2));
        lineas.push({ linea: num++, codigoCuenta: ctaPasivo, denominacionCuenta: 'Facturas por pagar - Emitidas', debe: montoOrig, haber: 0 });
        lineas.push({ linea: num++, codigoCuenta: '776', denominacionCuenta: 'Ganancia por diferencia de cambio', debe: 0, haber: formDiferenciaCambio });
        lineas.push({ linea: num++, codigoCuenta: ctaFin, denominacionCuenta: nomFin, debe: 0, haber: monto });
      } else {
        lineas.push({ linea: num++, codigoCuenta: ctaPasivo, denominacionCuenta: 'Facturas por pagar - Emitidas', debe: monto, haber: 0 });
        lineas.push({ linea: num++, codigoCuenta: ctaFin, denominacionCuenta: nomFin, debe: 0, haber: monto });
      }
    } else if (formModo === 'PAGO_TRIBUTOS_1662') {
      const ctaTrib = formTipoTributo === 'RENTA' ? '40171' : (formTipoTributo === 'ESSALUD' ? '4031' : (formTipoTributo === 'ONP' ? '4032' : '40111'));
      const nomTrib = formTipoTributo === 'RENTA' ? 'Impuesto a la renta - 3ra categoría' : (formTipoTributo === 'ESSALUD' ? 'EsSalud por pagar' : (formTipoTributo === 'ONP' ? 'ONP por pagar' : 'IGV cuenta propia por pagar'));
      lineas.push({ linea: num++, codigoCuenta: ctaTrib, denominacionCuenta: nomTrib, debe: monto, haber: 0 });
      lineas.push({ linea: num++, codigoCuenta: '10411', denominacionCuenta: 'Cuentas corrientes operativas - Moneda nacional', debe: 0, haber: monto });
    } else if (formModo === 'TRANSFERENCIA_CUENTAS') {
      lineas.push({ linea: num++, codigoCuenta: '10412', denominacionCuenta: 'Cuenta financiera destino (USD / Banco B)', debe: monto, haber: 0 });
      lineas.push({ linea: num++, codigoCuenta: '10411', denominacionCuenta: 'Cuenta financiera origen (PEN / Banco A)', debe: 0, haber: monto });
    } else if (formModo === 'REEMBOLSO_CAJA_CHICA') {
      lineas.push({ linea: num++, codigoCuenta: '1021', denominacionCuenta: 'Fondos fijos - Caja chica (Reposición)', debe: monto, haber: 0 });
      lineas.push({ linea: num++, codigoCuenta: '10411', denominacionCuenta: 'Cuentas corrientes operativas - Moneda nacional', debe: 0, haber: monto });
    } else if (formModo === 'DEPOSITO_DETRACCION') {
      lineas.push({ linea: num++, codigoCuenta: '4213', denominacionCuenta: 'Detracciones por pagar Banco de la Nación', debe: monto, haber: 0 });
      lineas.push({ linea: num++, codigoCuenta: '10411', denominacionCuenta: 'Cuentas corrientes operativas comerciales', debe: 0, haber: monto });
    } else if (formModo === 'AUTODETRACCION') {
      lineas.push({ linea: num++, codigoCuenta: '1071', denominacionCuenta: 'Fondos sujetos a restricción - Banco de la Nación', debe: monto, haber: 0 });
      lineas.push({ linea: num++, codigoCuenta: '1212', denominacionCuenta: 'Facturas por cobrar clientes - SPOT autodetracción', debe: 0, haber: monto });
    } else if (formModo === 'PAGO_TRIBUTOS_DETRACCION') {
      lineas.push({ linea: num++, codigoCuenta: '40111', denominacionCuenta: 'IGV cuenta propia por pagar', debe: monto, haber: 0 });
      lineas.push({ linea: num++, codigoCuenta: '1071', denominacionCuenta: 'Fondos sujetos a restricción - Banco de la Nación', debe: 0, haber: monto });
    } else if (formModo === 'LIBERACION_DETRACCION') {
      lineas.push({ linea: num++, codigoCuenta: '10411', denominacionCuenta: 'Cuentas corrientes operativas comerciales', debe: monto, haber: 0 });
      lineas.push({ linea: num++, codigoCuenta: '1071', denominacionCuenta: 'Fondos sujetos a restricción - Banco de la Nación', debe: 0, haber: monto });
    }

    const totalDebe = Number(lineas.reduce((acc, l) => acc + l.debe, 0).toFixed(2));
    const totalHaber = Number(lineas.reduce((acc, l) => acc + l.haber, 0).toFixed(2));
    const dif = Number(Math.abs(totalDebe - totalHaber).toFixed(2));

    return {
      lineas,
      totalDebe,
      totalHaber,
      cuadrado: totalDebe > 0 && dif === 0,
      diferencia: dif
    };
  }, [formModo, formMonto, formMoneda, formTipoDiferencia, formDiferenciaCambio, formTieneRetencion, formMontoRetencion, formTipoTributo, ctaActiva]);

  const handleRegistrarDigitacion = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ctaActiva || formMonto <= 0 || !formGlosa) {
      error('Complete el importe mayor a 0 y la glosa para registrar el movimiento.', 'Campos Requeridos');
      return;
    }

    try {
      let tipoMov: any = 'INGRESO';
      let esCheque = false;
      let esDepositoCheque = false;
      let esAnticipo = false;
      let cuentaContrapartida: string | undefined = undefined;

      if (formModo === 'COBRANZA_FACTURA' || formModo === 'COBRO_USD') {
        tipoMov = 'INGRESO';
        cuentaContrapartida = '1212';
      } else if (formModo === 'COBRO_EFECTIVO') {
        tipoMov = 'INGRESO';
        cuentaContrapartida = '1212';
      } else if (formModo === 'COBRO_CHEQUE') {
        tipoMov = 'INGRESO';
        esCheque = true;
        cuentaContrapartida = '1212';
      } else if (formModo === 'DEPOSITO_CHEQUE') {
        tipoMov = 'INGRESO';
        esDepositoCheque = true;
        cuentaContrapartida = '1031';
      } else if (formModo === 'ANTICIPO_CLIENTE') {
        tipoMov = 'INGRESO';
        esAnticipo = true;
        cuentaContrapartida = '1221';
      } else if (formModo === 'APERTURA_CAJA_CHICA') {
        tipoMov = 'EGRESO';
        cuentaContrapartida = '1021';
      } else if (formModo === 'PAGO_PROVEEDOR' || formModo === 'PAGO_USD') {
        tipoMov = 'EGRESO';
        cuentaContrapartida = '4212';
      } else if (formModo === 'PAGO_RETENCION_CRE') {
        tipoMov = 'EGRESO';
        cuentaContrapartida = '4212';
      } else if (formModo === 'PAGO_CAJA_CHICA') {
        tipoMov = 'EGRESO';
        cuentaContrapartida = '4212';
      } else if (formModo === 'PAGO_TRIBUTOS_1662') {
        tipoMov = 'EGRESO';
        cuentaContrapartida = formTipoTributo === 'RENTA' ? '40171' : (formTipoTributo === 'ESSALUD' ? '4031' : (formTipoTributo === 'ONP' ? '4032' : '40111'));
      } else if (formModo === 'TRANSFERENCIA_CUENTAS') {
        tipoMov = 'TRANSFERENCIA';
      } else if (formModo === 'REEMBOLSO_CAJA_CHICA') {
        tipoMov = 'EGRESO';
        cuentaContrapartida = '1021';
      } else if (formModo === 'DEPOSITO_DETRACCION') {
        tipoMov = 'DEPOSITO_DETRACCION';
        cuentaContrapartida = '4213';
      } else if (formModo === 'AUTODETRACCION') {
        tipoMov = 'INGRESO';
        cuentaContrapartida = '1212';
      } else if (formModo === 'PAGO_TRIBUTOS_DETRACCION') {
        tipoMov = 'EGRESO';
        cuentaContrapartida = '40111';
      } else if (formModo === 'LIBERACION_DETRACCION') {
        tipoMov = 'INGRESO';
        cuentaContrapartida = '1071';
      }

      const aplicaciones = docSeleccionadoId && montoAplicar > 0
        ? [{ documentoId: docSeleccionadoId, importeAplicado: Math.min(montoAplicar, formMonto) }]
        : undefined;

      await regMovMutation.mutateAsync({
        periodoId: `per-${periodo}`,
        cuentaFinancieraId: ctaActiva.id,
        fecha: formFecha,
        tipo: tipoMov,
        subdiario: codigoSubdiarioActivo,
        medioPago: formModo === 'COBRO_EFECTIVO' || formModo === 'PAGO_CAJA_CHICA' ? '008' : (formModo === 'COBRO_CHEQUE' || formModo === 'DEPOSITO_CHEQUE' ? '001' : '003'),
        numeroOperacion: formOperacion || `OP-${Date.now().toString().slice(-6)}`,
        anexoId: formAnexoId || undefined,
        moneda: formMoneda,
        tipoCambio: formTipoCambio,
        importe: formMonto,
        glosa: formGlosa,
        cuentaContrapartidaCodigo: cuentaContrapartida,
        tieneRetencion: formModo === 'PAGO_RETENCION_CRE' ? true : formTieneRetencion,
        montoRetencion: formModo === 'PAGO_RETENCION_CRE' ? (formMontoRetencion || Number((formMonto * 0.03).toFixed(2))) : formMontoRetencion,
        porcentajeRetencion: formPctRetencion,
        esCheque,
        esDepositoCheque,
        esAnticipo,
        diferenciaCambio: formDiferenciaCambio,
        tipoDiferencia: formTipoDiferencia,
        aplicaciones
      });

      setFormMonto(0);
      setFormGlosa('');
      setFormOperacion('');
      setDocSeleccionadoId('');
      setMontoAplicar(0);
      setFormDiferenciaCambio(0);
      setFormMontoRetencion(0);
      success(`Movimiento contabilizado exitosamente en Subdiario ${codigoSubdiarioActivo} con partida doble cuadrada.`, 'Asiento Generado');
    } catch (err: any) {
      error('Error al registrar movimiento: ' + (err?.response?.data?.error || err.message), 'Fallo al Guardar');
    }
  };

  // Documentos pendientes filtrados por anexo seleccionado
  const docsDisponibles = formTipo === 'INGRESO'
    ? cxcList.filter((d: any) => d.estado !== 'CANCELADO' && (!formAnexoId || d.clienteId === formAnexoId))
    : cxpList.filter((d: any) => d.estado !== 'CANCELADO' && (!formAnexoId || d.proveedorId === formAnexoId));

  const itemsMovimientos = movsData?.items || [];

  const handleCrearMovimiento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ctaActiva || formMonto <= 0 || !formGlosa) return;

    try {
      const aplicaciones = docSeleccionadoId && montoAplicar > 0
        ? [{ documentoId: docSeleccionadoId, importeAplicado: Math.min(montoAplicar, formMonto) }]
        : undefined;

      await regMovMutation.mutateAsync({
        periodoId: `per-${periodo}`,
        cuentaFinancieraId: ctaActiva.id,
        fecha: formFecha,
        tipo: formTipo,
        medioPago: '003',
        numeroOperacion: formOperacion || `OP-${Date.now().toString().slice(-6)}`,
        anexoId: formAnexoId || undefined,
        importe: formMonto,
        glosa: formGlosa,
        aplicaciones
      });

      setIsModalOpen(false);
      setFormMonto(0);
      setFormGlosa('');
      setFormOperacion('');
      setDocSeleccionadoId('');
      setMontoAplicar(0);
      success('Movimiento de tesorería registrado y contabilizado con éxito.', 'Operación Exitosa');
    } catch (err: any) {
      error('Error registrando movimiento: ' + (err?.response?.data?.error || err.message), 'Fallo al Guardar');
    }
  };

  const handleSolicitarAnular = (id: string) => {
    setModalAnular({ open: true, id, motivo: 'Anulación de movimiento bancario por error operativo' });
  };

  const handleConfirmarAnular = async () => {
    if (!modalAnular.id || !modalAnular.motivo) return;
    try {
      await anularMovMutation.mutateAsync({ id: modalAnular.id, motivo: modalAnular.motivo });
      setModalAnular({ open: false, id: '', motivo: '' });
      success('Movimiento de tesorería anulado conforme a auditoría.', 'Movimiento Anulado');
    } catch (err: any) {
      error('Error anulando movimiento: ' + (err?.response?.data?.error || err.message), 'Fallo al Anular');
    }
  };

  const handleImportarExtracto = async () => {
    if (!ctaActiva) return;
    try {
      // Parsear líneas CSV de ejemplo o pegadas (Fecha, Descripción, Referencia, Monto, Saldo)
      const filas = extractoCsvTexto.trim().split('\n');
      const lineas: any[] = [];

      for (const fila of filas) {
        const partes = fila.split(',').map(s => s.trim());
        if (partes.length >= 4) {
          lineas.push({
            fecha: partes[0],
            descripcion: partes[1],
            referencia: partes[2],
            monto: parseFloat(partes[3]),
            saldo: partes[4] ? parseFloat(partes[4]) : undefined
          });
        }
      }

      if (lineas.length === 0) {
        // Cargar lote demostrativo si el campo estaba vacío
        lineas.push(
          { fecha: `${periodo}-05`, descripcion: 'TRANSF BANCARIA COBRO', referencia: 'OP-10291', monto: 3500.00, saldo: 53500.00 },
          { fecha: `${periodo}-12`, descripcion: 'PAGO PROVEEDOR SERVICIOS', referencia: 'TRANS-8891', monto: -1200.00, saldo: 52300.00 },
          { fecha: `${periodo}-18`, descripcion: 'ABONO CLIENTE MAYORISTA', referencia: 'DEP-9988', monto: 4500.00, saldo: 56800.00 },
          { fecha: `${periodo}-25`, descripcion: 'CARGO MANTENIMIENTO CTA', referencia: 'COM-001', monto: -45.00, saldo: 56755.00 }
        );
      }

      await importarExtractoMutation.mutateAsync({
        cuentaFinancieraId: ctaActiva.id,
        nombreArchivo: nombreArchivoExtracto,
        lineas
      });

      setIsModalExtractoOpen(false);
      setExtractoCsvTexto('');
      refetchConciliacion();
      success('Extracto bancario importado exitosamente.', 'Extracto Bancario');
    } catch (err: any) {
      error('Error importando extracto: ' + (err?.response?.data?.error || err.message), 'Error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Account Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Landmark className="w-5 h-5 text-blue-600" />
            Tesorería, Caja y Bancos (Libro 1.1 y 1.2)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Control de cuentas financieras, movimientos bancarizados, conciliación y flujo de efectivo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sub-tabs switch */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200">
            <button
              onClick={() => setActiveSubTab('digitacion')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                activeSubTab === 'digitacion' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" />
              Digitación Rápida
            </button>
            <button
              onClick={() => setActiveSubTab('movimientos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeSubTab === 'movimientos' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Movimientos en Libros
            </button>
            <button
              onClick={() => setActiveSubTab('conciliacion')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                activeSubTab === 'conciliacion' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Conciliación Bancaria
            </button>
          </div>

          {activeSubTab === 'movimientos' && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nuevo Movimiento
            </button>
          )}

          {activeSubTab === 'conciliacion' && (
            <button
              onClick={() => setIsModalExtractoOpen(true)}
              className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Importar Extracto Bancario
            </button>
          )}
        </div>
      </div>

      {/* Account Cards Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cuentas.map(c => {
          const isSelected = ctaActiva?.id === c.id;
          return (
            <div
              key={c.id}
              onClick={() => setCuentaSeleccionadaId(c.id)}
              className={`p-4 rounded-2xl border transition cursor-pointer ${
                isSelected
                  ? 'border-blue-500 bg-blue-50/50 shadow-xs ring-2 ring-blue-500/20'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-blue-600" />
                  {c.banco} ({c.moneda})
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                  Cta {c.cuentaContableCodigo}
                </span>
              </div>
              <div className="text-lg font-black text-slate-900 mt-2 font-mono">
                {c.moneda === 'USD' ? '$' : 'S/'} {c.saldoActual.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 truncate font-mono">
                N° {c.numero}
              </div>
            </div>
          );
        })}
      </div>

      {/* SUB-TAB 0: DIGITACIÓN RÁPIDA DE TESORERÍA (SUBDIARIOS 03, 04, 05) */}
      {activeSubTab === 'digitacion' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Columna Izquierda: Formulario de Digitación Estructurado */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Digitación Rápida de Tesorería — Subdiario {codigoSubdiarioActivo}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {codigoSubdiarioActivo === '03'
                      ? 'Registro de Cobranzas, Ingresos a Caja y Recuperaciones'
                      : (codigoSubdiarioActivo === '05'
                        ? 'Cuentas Corrientes Bancarias, Operaciones SPOT y Detracciones BN'
                        : 'Registro de Pagos a Proveedores, Honorarios y Salidas de Tesorería')}
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                SD: {codigoSubdiarioActivo}
              </span>
            </div>

            {/* Selector de Modo Operacional según Subdiario */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tipo de Operación / Modo Contable
              </label>
              <select
                value={formModo}
                onChange={(e) => setFormModo(e.target.value)}
                className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-slate-900"
              >
                {codigoSubdiarioActivo === '03' && (
                  <>
                    <option value="COBRANZA_FACTURA">ESC-COB-3.01: Cobranza de Facturas / Boletas Comerciales (10411 / 1212)</option>
                    <option value="COBRO_EFECTIVO">ESC-COB-3.02: Cobro en Efectivo a Caja Central (1011 / 1212)</option>
                    <option value="COBRO_USD">ESC-COB-3.03: Cobro en Moneda Extranjera USD con Tipo de Cambio (10412 / 1212 / 776-676)</option>
                    <option value="COBRO_CHEQUE">ESC-COB-3.04: Cobro con Cheque recibido en Cartera (1031 / 1212)</option>
                    <option value="DEPOSITO_CHEQUE">ESC-COB-3.04B: Depósito Bancario de Cheque en Cartera (10411 / 1031)</option>
                    <option value="ANTICIPO_CLIENTE">ESC-COB-3.05: Cobro de Anticipo de Clientes (10411 / 1221)</option>
                    <option value="APERTURA_CAJA_CHICA">ESC-COB-3.06: Apertura y Constitución de Fondo Fijo Caja Chica (1021 / 10411)</option>
                  </>
                )}
                {codigoSubdiarioActivo === '04' && (
                  <>
                    <option value="PAGO_PROVEEDOR">ESC-PAG-4.01: Pago a Proveedor con Transferencia Cta Cte (4212 / 10411)</option>
                    <option value="PAGO_RETENCION_CRE">ESC-PAG-4.02: Pago con Retención Electrónica CRE 3% (4212 / 40114 / 10411)</option>
                    <option value="PAGO_CAJA_CHICA">ESC-PAG-4.03: Pago de Compras Menores con Caja Chica (4212 / 1021)</option>
                    <option value="PAGO_USD">ESC-PAG-4.04: Pago en Dólares USD con Tipo de Cambio (4212 / 10412 / 676-776)</option>
                    <option value="PAGO_TRIBUTOS_1662">ESC-PAG-4.05: Pago de Tributos Guía Pago Fácil FV 1662 (40111-40171 / 10411)</option>
                    <option value="TRANSFERENCIA_CUENTAS">ESC-PAG-4.06: Transferencia entre Cuentas Bancarias Propias (10412 / 10411)</option>
                    <option value="REEMBOLSO_CAJA_CHICA">ESC-PAG-4.07: Rendición y Reembolso / Reposición de Caja Chica (1021 / 10411)</option>
                  </>
                )}
                {codigoSubdiarioActivo === '05' && (
                  <>
                    <option value="DEPOSITO_DETRACCION">ESC-SPOT-5.01: Depósito de Detracción SPOT al Banco de la Nación Proveedor (4213 / 10411)</option>
                    <option value="AUTODETRACCION">ESC-SPOT-5.02: Autodetracción Abonada en Cuenta BN del Titular (1071 / 1212)</option>
                    <option value="PAGO_TRIBUTOS_DETRACCION">ESC-SPOT-5.03: Pago de Tributos con Fondos de Detracciones SPOT BN (40111 / 1071)</option>
                    <option value="LIBERACION_DETRACCION">ESC-SPOT-5.04: Liberación y Traslado de Fondos SPOT a Cta Operativa (10411 / 1071)</option>
                  </>
                )}
              </select>
            </div>

            {/* Cuenta Financiera y Fecha */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cuenta Financiera / Fondo
                </label>
                <select
                  value={cuentaSeleccionadaId || ctaActiva?.id}
                  onChange={(e) => setCuentaSeleccionadaId(e.target.value)}
                  className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  {cuentas.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.banco} ({c.moneda}) - Cta: {c.cuentaContableCodigo} (N° {c.numero})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Fecha de Operación
                </label>
                <input
                  type="date"
                  value={formFecha}
                  onChange={(e) => setFormFecha(e.target.value)}
                  className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Moneda, Tipo de Cambio y N° Operación */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Moneda</label>
                <select
                  value={formMoneda}
                  onChange={(e) => setFormMoneda(e.target.value as any)}
                  className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="PEN">Soles (PEN)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Cambio</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={formTipoCambio}
                  onChange={(e) => setFormTipoCambio(Number(e.target.value))}
                  className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">N° Operación / Constancia</label>
                <input
                  type="text"
                  placeholder="Ej. OP-98231 o Constancia SPOT"
                  value={formOperacion}
                  onChange={(e) => setFormOperacion(e.target.value)}
                  className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>

            {/* Anexo y Documento Pendiente */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {codigoSubdiarioActivo === '03' ? 'Cliente / Anexo' : 'Proveedor / Entidad Anexo'}
                </label>
                <select
                  value={formAnexoId}
                  onChange={(e) => setFormAnexoId(e.target.value)}
                  className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Sin anexo específico / Varios --</option>
                  {anexos.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.numeroDocumento} - {a.razonSocial}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Documento Pendiente Relacionado
                </label>
                <select
                  value={docSeleccionadoId}
                  onChange={(e) => {
                    setDocSeleccionadoId(e.target.value);
                    const d = docsDisponibles.find((x: any) => x.id === e.target.value);
                    if (d) {
                      setMontoAplicar(d.saldoPendiente || d.total);
                      setFormMonto(d.saldoPendiente || d.total);
                      setFormGlosa(`Cobro/Pago ${d.serie}-${d.numero} - ${d.razonSocial || ''}`);
                    }
                  }}
                  className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Selección libre / Sin documento previo --</option>
                  {docsDisponibles.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.tipoComprobante} {d.serie}-{d.numero} (Saldo: {d.moneda === 'USD' ? '$' : 'S/'} {(d.saldoPendiente || d.total).toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Importe y Parámetros Específicos */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Importe Principal ({formMoneda})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formMonto || ''}
                    onChange={(e) => setFormMonto(Number(e.target.value))}
                    className="w-full text-sm font-bold border border-slate-300 rounded-xl p-2.5 bg-white text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Tributo si es pago de impuestos */}
                {(formModo === 'PAGO_TRIBUTOS_1662' || formModo === 'PAGO_TRIBUTOS_DETRACCION') && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Tributo a Cancelar</label>
                    <select
                      value={formTipoTributo}
                      onChange={(e) => setFormTipoTributo(e.target.value as any)}
                      className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800"
                    >
                      <option value="IGV">IGV Cuenta Propia (Cta 40111)</option>
                      <option value="RENTA">Impuesto a la Renta 3ra Cat (Cta 40171)</option>
                      <option value="ESSALUD">Contribución EsSalud 9% (Cta 4031)</option>
                      <option value="ONP">Sistema Nacional Pensiones ONP (Cta 4032)</option>
                    </select>
                  </div>
                )}

                {/* Retención si es pago con CRE */}
                {formModo === 'PAGO_RETENCION_CRE' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Retención CRE (3%)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        value={formMontoRetencion || Number((formMonto * 0.03).toFixed(2))}
                        onChange={(e) => setFormMontoRetencion(Number(e.target.value))}
                        className="w-full text-xs font-bold border border-slate-300 rounded-xl p-2.5 bg-white text-slate-900"
                      />
                      <span className="text-[11px] text-slate-500 whitespace-nowrap">Neto: S/ {(formMonto - (formMontoRetencion || Number((formMonto * 0.03).toFixed(2)))).toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* Diferencia de cambio si es USD */}
                {(formModo === 'COBRO_USD' || formModo === 'PAGO_USD') && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Ajuste por Diferencia de Cambio</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={formTipoDiferencia}
                        onChange={(e) => setFormTipoDiferencia(e.target.value as any)}
                        className="text-xs border border-slate-300 rounded-xl p-2 bg-white text-slate-800"
                      >
                        <option value="NINGUNA">Sin diferencia</option>
                        <option value="GANANCIA">Ganancia (776)</option>
                        <option value="PERDIDA">Pérdida (676)</option>
                      </select>
                      {formTipoDiferencia !== 'NINGUNA' && (
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Monto dif."
                          value={formDiferenciaCambio || ''}
                          onChange={(e) => setFormDiferenciaCambio(Number(e.target.value))}
                          className="w-28 text-xs font-bold border border-slate-300 rounded-xl p-2 bg-white text-slate-900"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Glosa */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Glosa Contable</label>
              <input
                type="text"
                placeholder="Descripción concisa de la operación contable"
                value={formGlosa}
                onChange={(e) => setFormGlosa(e.target.value)}
                className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Columna Derecha: Panel de Previsualización Contable PCGE */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-600" />
                  Previsualización de Asiento PCGE
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase">
                  Partida Doble
                </span>
              </div>

              {/* Glosa Automática */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Glosa Automática</div>
                <div className="text-xs text-slate-800 font-medium truncate mt-0.5">
                  {formGlosa || `${formModo} - Operación ${formOperacion || 'SD' + codigoSubdiarioActivo}`}
                </div>
              </div>

              {/* Grilla de Cuentas */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[10px] uppercase">
                    <tr>
                      <th className="p-2.5">Cuenta</th>
                      <th className="p-2.5 text-right">Debe</th>
                      <th className="p-2.5 text-right">Haber</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {previsualizacion.lineas.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-4 text-center text-slate-400 text-xs">
                          Ingrese el importe y seleccione la operación para ver el asiento contable.
                        </td>
                      </tr>
                    ) : (
                      previsualizacion.lineas.map((l) => (
                        <tr key={l.linea} className="hover:bg-slate-50/60">
                          <td className="p-2.5">
                            <span className="font-mono font-bold text-blue-700">{l.codigoCuenta}</span>
                            <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                              {l.denominacionCuenta}
                            </div>
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold">
                            {l.debe > 0 ? l.debe.toFixed(2) : '-'}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold">
                            {l.haber > 0 ? l.haber.toFixed(2) : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {previsualizacion.lineas.length > 0 && (
                    <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-900">
                      <tr>
                        <td className="p-2.5 text-[11px] uppercase">Totales</td>
                        <td className="p-2.5 text-right font-mono text-xs">
                          {previsualizacion.totalDebe.toFixed(2)}
                        </td>
                        <td className="p-2.5 text-right font-mono text-xs">
                          {previsualizacion.totalHaber.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Estado de Partida Doble */}
              <div className="flex items-center justify-between p-3 rounded-xl border bg-slate-50 border-slate-200">
                <span className="text-xs font-bold text-slate-700">Partida Doble:</span>
                {previsualizacion.cuadrado ? (
                  <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    CUADRADO (Dif: S/ 0.00)
                  </span>
                ) : (
                  <span className="text-xs font-bold text-rose-600 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                    DESCUADRADO (Dif: S/ {Math.abs(previsualizacion.diferencia).toFixed(2)})
                  </span>
                )}
              </div>
            </div>

            {/* Acciones de Registro */}
            <div className="pt-4 border-t border-slate-100 flex flex-col gap-2 mt-4">
              <button
                type="button"
                onClick={handleRegistrarDigitacion}
                disabled={!previsualizacion.cuadrado || previsualizacion.lineas.length === 0}
                className="w-full py-2.5 px-4 bg-[#2457D6] hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <FileCheck className="w-4 h-4" />
                Registrar y Contabilizar (Ctrl+Enter)
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormMonto(0);
                  setFormGlosa('');
                  setFormOperacion('');
                  setDocSeleccionadoId('');
                }}
                className="w-full py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition text-center"
              >
                Limpiar Formulario (Ctrl+N)
              </button>
            </div>
          </div>
        </div>
      )}
      {activeSubTab === 'movimientos' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Filters Bar */}
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Filtro de Tipo:</span>
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="text-xs border border-slate-300 rounded-lg p-1.5 bg-white text-slate-800"
              >
                <option value="TODOS">Todos los tipos</option>
                <option value="INGRESO">Ingresos (+)</option>
                <option value="EGRESO">Egresos (-)</option>
                <option value="DEPOSITO_DETRACCION">Depósito Detracción SPOT</option>
                <option value="COMISION">Comisiones Bancarias</option>
              </select>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Cuenta activa: <strong className="text-slate-800">{ctaActiva?.banco} - {ctaActiva?.numero}</strong>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3">N° Operación</th>
                  <th className="p-3">Glosa / Concepto</th>
                  <th className="p-3 text-right">Importe</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Conciliado</th>
                  <th className="p-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800 font-medium">
                {itemsMovimientos.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      No hay movimientos registrados para esta cuenta financiera en el período.
                    </td>
                  </tr>
                ) : (
                  itemsMovimientos.map(m => {
                    const isIngreso = m.tipo === 'INGRESO';
                    const isAnulado = m.estado === 'ANULADO';
                    return (
                      <tr key={m.id} className={isAnulado ? 'bg-rose-50/40 text-slate-400 line-through' : 'hover:bg-slate-50'}>
                        <td className="p-3 font-mono">{m.fecha}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isIngreso ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {m.tipo}
                          </span>
                        </td>
                        <td className="p-3 font-mono">{m.numeroOperacion || '-'}</td>
                        <td className="p-3 max-w-xs truncate">{m.glosa}</td>
                        <td className={`p-3 text-right font-mono font-bold ${isIngreso ? 'text-emerald-700' : 'text-slate-900'}`}>
                          {isIngreso ? '+' : '-'} {m.moneda === 'USD' ? '$' : 'S/'} {m.importe.toFixed(2)}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            m.estado === 'REGISTRADO' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {m.estado}
                          </span>
                        </td>
                        <td className="p-3">
                          {m.conciliado ? (
                            <span className="text-emerald-600 font-bold flex items-center gap-1 text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Conciliado
                            </span>
                          ) : (
                            <span className="text-amber-600 text-[11px]">En tránsito</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {!isAnulado && (
                            <button
                              onClick={() => handleSolicitarAnular(m.id)}
                              className="text-rose-600 hover:text-rose-800 font-semibold text-[11px] underline cursor-pointer"
                            >
                              Anular
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: CONCILIACIÓN BANCARIA */}
      {activeSubTab === 'conciliacion' && (
        <div className="space-y-6">
          {/* Summary Box */}
          {conciliacionData && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-500 font-semibold">1. Saldo Según Libros</span>
                <div className="text-lg font-black text-slate-900 font-mono mt-1">
                  S/ {conciliacionData.resumen.saldoSegunLibros.toFixed(2)}
                </div>
              </div>
              <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-500 font-semibold">2. Saldo Según Banco</span>
                <div className="text-lg font-black text-blue-700 font-mono mt-1">
                  S/ {conciliacionData.resumen.saldoSegunBanco.toFixed(2)}
                </div>
              </div>
              <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-500 font-semibold">3. Partidas en Tránsito</span>
                <div className="text-lg font-black text-amber-600 font-mono mt-1">
                  S/ {conciliacionData.resumen.partidasEnTransito.toFixed(2)}
                </div>
              </div>
              <div className={`p-4 rounded-2xl border shadow-xs ${
                conciliacionData.resumen.cuadrado ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
              }`}>
                <span className="text-xs font-semibold text-slate-600">Diferencia de Cuadre</span>
                <div className={`text-lg font-black font-mono mt-1 ${
                  conciliacionData.resumen.cuadrado ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  S/ {conciliacionData.resumen.diferencia.toFixed(2)}
                </div>
                <div className="text-[10px] font-bold mt-0.5">
                  {conciliacionData.resumen.cuadrado ? '✅ CONCILIACIÓN CUADRADA' : '⚠️ EXISTE DIFERENCIA'}
                </div>
              </div>
            </div>
          )}

          {/* Coincidencias Sugeridas */}
          {conciliacionData?.coincidenciasSugeridas && conciliacionData.coincidenciasSugeridas.length > 0 && (
            <div className="bg-purple-50/60 border border-purple-200 rounded-2xl p-4 shadow-xs">
              <h3 className="text-xs font-bold text-purple-950 flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="w-4 h-4 text-purple-600" />
                Coincidencias Automáticas Sugeridas ({conciliacionData.coincidenciasSugeridas.length})
              </h3>
              <div className="space-y-2">
                {conciliacionData.coincidenciasSugeridas.map((cs, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-purple-100 text-xs">
                    <span className="text-purple-900 font-medium">{cs.motivo}</span>
                    <button
                      onClick={async () => {
                        await conciliarMutation.mutateAsync({ extractoLineaId: cs.lineaExtractoId, movimientoId: cs.movimientoId });
                        refetchConciliacion();
                      }}
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold text-[11px] shadow-xs cursor-pointer"
                    >
                      Aceptar y Conciliar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Two-Column Comparison View */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Extracto Bancario */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-3 bg-slate-100 font-bold text-xs text-slate-800 border-b border-slate-200 flex items-center justify-between">
                <span>Extracto Bancario (Importado)</span>
                <span className="text-[10px] text-slate-500">
                  {conciliacionData?.extractoLineas?.length || 0} líneas
                </span>
              </div>
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 text-xs">
                {conciliacionData?.extractoLineas?.map(l => (
                  <div key={l.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                    <div>
                      <div className="font-mono text-[11px] text-slate-500">{l.fecha} | Ref: {l.referencia || '-'}</div>
                      <div className="font-medium text-slate-800">{l.descripcion}</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono font-bold ${l.monto >= 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                        S/ {l.monto.toFixed(2)}
                      </div>
                      <span className={`text-[10px] font-bold ${l.conciliada ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {l.conciliada ? 'Conciliada' : 'Pendiente'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Libros de la Empresa */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-3 bg-slate-100 font-bold text-xs text-slate-800 border-b border-slate-200 flex items-center justify-between">
                <span>Libros de Tesorería (Registrados)</span>
                <span className="text-[10px] text-slate-500">
                  {conciliacionData?.movimientosLibros?.length || 0} movimientos
                </span>
              </div>
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 text-xs">
                {conciliacionData?.movimientosLibros?.map(m => (
                  <div key={m.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                    <div>
                      <div className="font-mono text-[11px] text-slate-500">{m.fecha} | Op: {m.numeroOperacion || '-'}</div>
                      <div className="font-medium text-slate-800 truncate max-w-xs">{m.glosa}</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono font-bold ${m.tipo === 'INGRESO' ? 'text-emerald-700' : 'text-slate-900'}`}>
                        {m.tipo === 'INGRESO' ? '+' : '-'} S/ {m.importe.toFixed(2)}
                      </div>
                      <span className={`text-[10px] font-bold ${m.conciliado ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {m.conciliado ? 'Conciliado' : 'En tránsito'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVO MOVIMIENTO CON APLICACIÓN A CARTERA */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              Registrar Movimiento de Tesorería
            </h3>

            <form onSubmit={handleCrearMovimiento} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Tipo de Movimiento</label>
                  <select
                    value={formTipo}
                    onChange={(e: any) => setFormTipo(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 mt-1 bg-white text-slate-800"
                  >
                    <option value="INGRESO">INGRESO (Cobro a Clientes)</option>
                    <option value="EGRESO">EGRESO (Pago a Proveedores)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Fecha Operación</label>
                  <input
                    type="date"
                    value={formFecha}
                    onChange={(e) => setFormFecha(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 mt-1 bg-white text-slate-800"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Importe Total ({ctaActiva?.moneda})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formMonto || ''}
                    onChange={(e) => setFormMonto(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 mt-1 font-mono font-bold text-slate-800"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">N° de Operación / Voucher</label>
                  <input
                    type="text"
                    value={formOperacion}
                    onChange={(e) => setFormOperacion(e.target.value)}
                    placeholder="Ej: OP-982182"
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 mt-1 font-mono text-slate-800"
                  />
                </div>
              </div>

              {/* Selector de Anexo */}
              <div>
                <label className="text-xs font-semibold text-slate-700">
                  {formTipo === 'INGRESO' ? 'Cliente' : 'Proveedor'} (Anexo)
                </label>
                <select
                  value={formAnexoId}
                  onChange={(e) => {
                    setFormAnexoId(e.target.value);
                    setDocSeleccionadoId('');
                  }}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2 mt-1 bg-white text-slate-800"
                >
                  <option value="">Seleccione o deje general...</option>
                  {anexos.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.numeroDocumento} - {a.razonSocial}</option>
                  ))}
                </select>
              </div>

              {/* Selector de Documento de Cartera */}
              {docsDisponibles.length > 0 && (
                <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 space-y-2">
                  <span className="text-[11px] font-bold text-blue-900 block">
                    Aplicar directamente a factura pendiente en cartera:
                  </span>
                  <select
                    value={docSeleccionadoId}
                    onChange={(e) => {
                      setDocSeleccionadoId(e.target.value);
                      const d = docsDisponibles.find((x: any) => x.id === e.target.value);
                      if (d) setMontoAplicar(Math.min(d.saldo, formMonto || d.saldo));
                    }}
                    className="w-full text-xs border border-blue-300 rounded-lg p-1.5 bg-white text-slate-800"
                  >
                    <option value="">-- No aplicar a documento (dejar como anticipo) --</option>
                    {docsDisponibles.map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.serieNumero} (Saldo: S/ {d.saldo.toFixed(2)}) - Vence: {d.fechaVencimiento}
                      </option>
                    ))}
                  </select>

                  {docSeleccionadoId && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-blue-900 font-medium">Monto a aplicar:</span>
                      <input
                        type="number"
                        step="0.01"
                        max={formMonto}
                        value={montoAplicar || ''}
                        onChange={(e) => setMontoAplicar(parseFloat(e.target.value) || 0)}
                        className="w-32 text-xs border border-blue-300 rounded-lg p-1 font-mono font-bold bg-white text-slate-800"
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700">Glosa / Concepto Contable</label>
                <input
                  type="text"
                  value={formGlosa}
                  onChange={(e) => setFormGlosa(e.target.value)}
                  placeholder="Ej: Cobranza factura F001-209 en BCP Soles"
                  className="w-full text-xs border border-slate-300 rounded-lg p-2 mt-1 text-slate-800"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={regMovMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {regMovMutation.isPending ? 'Contabilizando...' : 'Registrar y Contabilizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL IMPORTAR EXTRACTO */}
      {isModalExtractoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Upload className="w-5 h-5 text-purple-600" />
              Importar Extracto Bancario CSV
            </h3>
            <p className="text-xs text-slate-500">
              Pegue las líneas del extracto emitido por su banco (Fecha, Descripción, Referencia, Monto, Saldo) o use las filas de prueba por defecto.
            </p>

            <div>
              <label className="text-xs font-semibold text-slate-700">Nombre del Archivo</label>
              <input
                type="text"
                value={nombreArchivoExtracto}
                onChange={(e) => setNombreArchivoExtracto(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg p-2 mt-1 text-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Líneas CSV (opcional, deje vacío para demo)</label>
              <textarea
                value={extractoCsvTexto}
                onChange={(e) => setExtractoCsvTexto(e.target.value)}
                placeholder="2026-09-10, PAGO SERVICIOS, OP-99182, -450.00, 49550.00"
                rows={5}
                className="w-full text-xs border border-slate-300 rounded-lg p-2 mt-1 font-mono text-slate-800"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsModalExtractoOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImportarExtracto}
                disabled={importarExtractoMutation.isPending}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
              >
                {importarExtractoMutation.isPending ? 'Importando...' : 'Importar Extracto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Anular Movimiento */}
      {modalAnular.open && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">Anular Movimiento de Tesorería</h3>
            <p className="text-xs text-slate-500">
              Indique el motivo que quedará registrado en la pista de auditoría contable:
            </p>
            <input
              type="text"
              value={modalAnular.motivo}
              onChange={(e) => setModalAnular({ ...modalAnular, motivo: e.target.value })}
              placeholder="Ej: Cheque devuelto, error en importe..."
              className="w-full text-xs border border-slate-300 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-blue-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalAnular({ open: false, id: '', motivo: '' })}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarAnular}
                disabled={anularMovMutation.isPending}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition cursor-pointer"
              >
                {anularMovMutation.isPending ? 'Anulando...' : 'Confirmar Anulación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
