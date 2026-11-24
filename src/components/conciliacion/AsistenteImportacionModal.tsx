import React, { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  conciliacionV2Api,
  type ConfirmarImportacionInput,
  type CuentaBancariaV2,
  type LineaPrevisualizadaV2,
  type PerfilBancoV2,
  type PrevisualizarImportacionInput,
  type ResultadoPrevisualizacionImportacionV2,
  type TipoClasificacionExtracto,
} from '../../api/conciliacionV2Api';
import { useToast } from '../../context/ToastContext';
import {
  extraerMensajeErrorConciliacion,
  useConfirmarImportacionV2,
  usePerfilesBancoV2,
  usePrevisualizarImportacionV2,
} from '../../hooks/useConciliacionV2';
import { ColumnaTablaDensa, TablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';

const MAX_ARCHIVO_BYTES = 5 * 1024 * 1024;
const EXTENSIONES_PERMITIDAS = ['.xlsx', '.csv', '.txt', '.pdf'];

type PasoAsistente = 1 | 2 | 3 | 4 | 5;
type ModoMonto = 'COLUMNA_UNICA' | 'ABONO_CARGO';
type FiltroLineasPreview = 'TODAS' | 'NUEVAS' | 'DUPLICADAS';

export interface AsistenteImportacionModalProps {
  abierto: boolean;
  onCerrar: () => void;
  empresaId: string;
  cuenta: CuentaBancariaV2 | null;
  periodo: string;
  puedeImportar: boolean;
}

function formatearDecimal(valor: string | null | undefined, moneda = 'PEN'): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  const dec = new Decimal(valor);
  const fijo = dec.toFixed(2);
  const neg = fijo.startsWith('-');
  const abs = neg ? fijo.slice(1) : fijo;
  const [ent, decs] = abs.split('.');
  const entComas = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sim = moneda === 'USD' ? 'US$' : 'S/';
  return `${neg ? '-' : ''}${sim} ${entComas}.${decs}`;
}

function claseBadgeClasificacion(tipo: TipoClasificacionExtracto): string {
  switch (tipo) {
    case 'ITF':
    case 'COMISION_BANCARIA':
    case 'MANTENIMIENTO':
    case 'INTERES_GASTO':
      return 'bg-[#FEF3C7] text-[#B45309] border-[#B45309]';
    case 'INTERES_INGRESO':
    case 'TRANSFERENCIA':
      return 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]';
    case 'DETRACCION':
    case 'TRIBUTO_SUNAT':
    case 'AFP_ONP_ESSALUD':
    case 'PLANILLA':
      return 'bg-[#EFF6FF] text-[#1E3A5F] border-[#1E3A5F]';
    case 'CHEQUE':
    case 'OTRO':
    default:
      return 'bg-[#F3F4F6] text-[#374151] border-[#9CA3AF]';
  }
}

export const AsistenteImportacionModal: React.FC<AsistenteImportacionModalProps> = ({
  abierto,
  onCerrar,
  empresaId,
  cuenta,
  periodo,
  puedeImportar,
}) => {
  const toast = useToast();
  const perfilesQuery = usePerfilesBancoV2(empresaId, abierto);
  const previsualizarMutation = usePrevisualizarImportacionV2(empresaId);
  const confirmarMutation = useConfirmarImportacionV2(empresaId);

  const [paso, setPaso] = useState<PasoAsistente>(1);

  // Paso 1: Archivo
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [contentType, setContentType] = useState<string | null>(null);
  const [tamanoBytes, setTamanoBytes] = useState(0);
  const [contenidoBase64, setContenidoBase64] = useState('');
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [descargandoPlantilla, setDescargandoPlantilla] = useState(false);

  // Paso 2: Perfil y Mapeo
  const [perfilSeleccionadoKey, setPerfilSeleccionadoKey] = useState<string>('MANUAL_PLANTILLA');
  const [ajustarMapeoManual, setAjustarMapeoManual] = useState(false);
  const [filaEncabezado, setFilaEncabezado] = useState('1');
  const [delimitador, setDelimitador] = useState(',');
  const [formatoFecha, setFormatoFecha] = useState('DD/MM/YYYY');
  const [separadorDecimal, setSeparadorDecimal] = useState<'.' | ','>('.');
  const [colFecha, setColFecha] = useState('Fecha');
  const [colDescripcion, setColDescripcion] = useState('Descripcion');
  const [colReferencia, setColReferencia] = useState('Referencia');
  const [modoMonto, setModoMonto] = useState<ModoMonto>('ABONO_CARGO');
  const [colMonto, setColMonto] = useState('Monto');
  const [colAbono, setColAbono] = useState('Abono');
  const [colCargo, setColCargo] = useState('Cargo');
  const [colSaldo, setColSaldo] = useState('Saldo');
  const [signoCargoNegativo, setSignoCargoNegativo] = useState(true);
  const [saldoInicialDeclarado, setSaldoInicialDeclarado] = useState('');
  const [saldoFinalDeclarado, setSaldoFinalDeclarado] = useState('');
  const [errorMapeo, setErrorMapeo] = useState<string | null>(null);

  // Paso 3 & 4: Resultado de previsualización
  const [previsualizacion, setPrevisualizacion] =
    useState<ResultadoPrevisualizacionImportacionV2 | null>(null);
  const [ultimoPayload, setUltimoPayload] = useState<PrevisualizarImportacionInput | null>(null);
  const [filtroPreview, setFiltroPreview] = useState<FiltroLineasPreview>('TODAS');

  const perfiles = perfilesQuery.data ?? [];

  const obtenerClavePerfil = (p: PerfilBancoV2): string =>
    p.id ? `ID:${p.id}` : `COD:${p.codigo}`;

  const perfilSeleccionado = useMemo(
    () => perfiles.find((p) => obtenerClavePerfil(p) === perfilSeleccionadoKey) ?? null,
    [perfiles, perfilSeleccionadoKey]
  );

  // Reset al abrir
  useEffect(() => {
    if (!abierto) return;
    setPaso(1);
    setNombreArchivo('');
    setContentType(null);
    setTamanoBytes(0);
    setContenidoBase64('');
    setErrorArchivo(null);
    setPrevisualizacion(null);
    setUltimoPayload(null);
    setFiltroPreview('TODAS');
    setSaldoInicialDeclarado('');
    setSaldoFinalDeclarado('');
    setErrorMapeo(null);
    setAjustarMapeoManual(false);
    setPerfilSeleccionadoKey('MANUAL_PLANTILLA');
  }, [abierto]);

  // Autoseleccionar perfil coincidente con banco de la cuenta cuando carguen los perfiles
  useEffect(() => {
    if (!abierto || perfiles.length === 0 || !cuenta) return;
    if (perfilSeleccionadoKey !== 'MANUAL_PLANTILLA') return;
    const bancoCuenta = cuenta.banco.trim().toLowerCase();
    const match = perfiles.find(
      (p) => p.activo && bancoCuenta.includes(p.banco.trim().toLowerCase())
    );
    if (match) {
      aplicarPerfilEnFormulario(match);
    }
  }, [abierto, perfiles, cuenta, perfilSeleccionadoKey]);

  const aplicarPerfilEnFormulario = (perfil: PerfilBancoV2 | null) => {
    if (!perfil) {
      setPerfilSeleccionadoKey('MANUAL_PLANTILLA');
      setFilaEncabezado('1');
      setDelimitador(',');
      setFormatoFecha('DD/MM/YYYY');
      setSeparadorDecimal('.');
      setColFecha('Fecha');
      setColDescripcion('Descripcion');
      setColReferencia('Referencia');
      setModoMonto('ABONO_CARGO');
      setColMonto('Monto');
      setColAbono('Abono');
      setColCargo('Cargo');
      setColSaldo('Saldo');
      setSignoCargoNegativo(true);
      setAjustarMapeoManual(true);
      return;
    }

    setPerfilSeleccionadoKey(obtenerClavePerfil(perfil));
    setFilaEncabezado(String(perfil.filaEncabezado || 1));
    setDelimitador(perfil.delimitador ?? '');
    setFormatoFecha(perfil.formatoFecha || 'DD/MM/YYYY');
    setSeparadorDecimal(perfil.separadorDecimal || '.');
    setColFecha(String(perfil.mapeoColumnas.fecha ?? ''));
    setColDescripcion(String(perfil.mapeoColumnas.descripcion ?? ''));
    setColReferencia(
      perfil.mapeoColumnas.referencia !== null && perfil.mapeoColumnas.referencia !== undefined
        ? String(perfil.mapeoColumnas.referencia)
        : ''
    );
    const usaAbonoCargo =
      Boolean(perfil.mapeoColumnas.abono) || Boolean(perfil.mapeoColumnas.cargo);
    setModoMonto(usaAbonoCargo ? 'ABONO_CARGO' : 'COLUMNA_UNICA');
    setColMonto(
      perfil.mapeoColumnas.monto !== null && perfil.mapeoColumnas.monto !== undefined
        ? String(perfil.mapeoColumnas.monto)
        : ''
    );
    setColAbono(
      perfil.mapeoColumnas.abono !== null && perfil.mapeoColumnas.abono !== undefined
        ? String(perfil.mapeoColumnas.abono)
        : ''
    );
    setColCargo(
      perfil.mapeoColumnas.cargo !== null && perfil.mapeoColumnas.cargo !== undefined
        ? String(perfil.mapeoColumnas.cargo)
        : ''
    );
    setColSaldo(
      perfil.mapeoColumnas.saldo !== null && perfil.mapeoColumnas.saldo !== undefined
        ? String(perfil.mapeoColumnas.saldo)
        : ''
    );
    setSignoCargoNegativo(perfil.mapeoColumnas.signoCargoNegativo ?? true);
    setAjustarMapeoManual(false);
  };

  const handleSeleccionarArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setErrorArchivo(null);
    setPrevisualizacion(null);
    if (!file) {
      setNombreArchivo('');
      setTamanoBytes(0);
      setContenidoBase64('');
      return;
    }

    const nombreLower = file.name.toLowerCase();
    const extensionValida = EXTENSIONES_PERMITIDAS.some((ext) => nombreLower.endsWith(ext));
    if (!extensionValida) {
      setErrorArchivo('Formato no soportado. Seleccione un archivo .xlsx, .csv, .txt o .pdf.');
      e.target.value = '';
      return;
    }

    if (file.size === 0) {
      setErrorArchivo('El archivo seleccionado está vacío (0 bytes).');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_ARCHIVO_BYTES) {
      setErrorArchivo(
        `El archivo excede el límite máximo de 5 MB (${(file.size / (1024 * 1024)).toFixed(2)} MB).`
      );
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const resultado = typeof reader.result === 'string' ? reader.result : '';
      const comaIdx = resultado.indexOf(',');
      const base64 = comaIdx >= 0 ? resultado.slice(comaIdx + 1) : resultado;
      if (!base64) {
        setErrorArchivo('No se pudo codificar el contenido del archivo.');
        return;
      }
      setNombreArchivo(file.name);
      setContentType(file.type || null);
      setTamanoBytes(file.size);
      setContenidoBase64(base64);
    };
    reader.onerror = () => {
      setErrorArchivo('Error leyendo el archivo desde el disco local.');
    };
    reader.readAsDataURL(file);
  };

  const handleDescargarPlantilla = async () => {
    setDescargandoPlantilla(true);
    try {
      const blob = await conciliacionV2Api.descargarPlantillaCsv(empresaId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'plantilla_extracto_bancario_v2.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(
        extraerMensajeErrorConciliacion(err, 'No se pudo descargar la plantilla CSV.'),
        'Plantilla CSV'
      );
    } finally {
      setDescargandoPlantilla(false);
    }
  };

  const construirPayloadPrevisualizacion = (): PrevisualizarImportacionInput | null => {
    if (!cuenta) {
      setErrorMapeo('Debe seleccionar una cuenta bancaria antes de importar.');
      return null;
    }

    const filaInt = Number.parseInt(filaEncabezado, 10);
    if (!Number.isInteger(filaInt) || filaInt < 1) {
      setErrorMapeo('La fila de encabezado debe ser un entero mayor o igual a 1.');
      return null;
    }

    if (saldoInicialDeclarado.trim()) {
      try {
        new Decimal(saldoInicialDeclarado.trim());
      } catch {
        setErrorMapeo('El saldo inicial declarado debe ser un número decimal válido.');
        return null;
      }
    }
    if (saldoFinalDeclarado.trim()) {
      try {
        new Decimal(saldoFinalDeclarado.trim());
      } catch {
        setErrorMapeo('El saldo final declarado debe ser un número decimal válido.');
        return null;
      }
    }

    if (ajustarMapeoManual || !perfilSeleccionado) {
      if (!colFecha.trim() || !colDescripcion.trim()) {
        setErrorMapeo('Las columnas Fecha y Descripción son obligatorias en el mapeo.');
        return null;
      }
      if (modoMonto === 'COLUMNA_UNICA' && !colMonto.trim()) {
        setErrorMapeo('Debe indicar la columna de Monto único.');
        return null;
      }
      if (modoMonto === 'ABONO_CARGO' && !colAbono.trim() && !colCargo.trim()) {
        setErrorMapeo('Debe indicar al menos la columna Abono o Cargo.');
        return null;
      }
    }

    setErrorMapeo(null);

    const payload: PrevisualizarImportacionInput = {
      cuentaFinancieraId: cuenta.id,
      periodo,
      nombreArchivo,
      contentType,
      contenidoBase64,
      saldoInicialDeclarado: saldoInicialDeclarado.trim() || null,
      saldoFinalDeclarado: saldoFinalDeclarado.trim() || null,
    };

    if (perfilSeleccionado) {
      if (perfilSeleccionado.id) {
        payload.perfilBancoId = perfilSeleccionado.id;
      }
      payload.perfilCodigo = perfilSeleccionado.codigo;
    }

    if (ajustarMapeoManual || !perfilSeleccionado) {
      payload.mapeoPersonalizado = {
        filaEncabezado: filaInt,
        delimitador: delimitador.trim() ? delimitador : null,
        formatoFecha: formatoFecha.trim() || 'DD/MM/YYYY',
        separadorDecimal,
        fecha: colFecha.trim(),
        descripcion: colDescripcion.trim(),
        referencia: colReferencia.trim() ? colReferencia.trim() : null,
        monto: modoMonto === 'COLUMNA_UNICA' ? colMonto.trim() : null,
        abono: modoMonto === 'ABONO_CARGO' && colAbono.trim() ? colAbono.trim() : null,
        cargo: modoMonto === 'ABONO_CARGO' && colCargo.trim() ? colCargo.trim() : null,
        saldo: colSaldo.trim() ? colSaldo.trim() : null,
        signoCargoNegativo,
      };
    }

    return payload;
  };

  const handleEjecutarValidacion = async () => {
    const payload = construirPayloadPrevisualizacion();
    if (!payload) return;

    setPaso(3);
    setUltimoPayload(payload);
    try {
      const resultado = await previsualizarMutation.mutateAsync(payload);
      setPrevisualizacion(resultado);
    } catch {
      setPrevisualizacion(null);
    }
  };

  const handleConfirmarImportacion = async () => {
    if (!ultimoPayload || !previsualizacion?.valido || !puedeImportar) return;
    const payloadConfirmar: ConfirmarImportacionInput = { ...ultimoPayload };
    try {
      await confirmarMutation.mutateAsync(payloadConfirmar);
      onCerrar();
    } catch {
      // Notificado vía toast
    }
  };

  const lineasFiltradas = useMemo(() => {
    const lineas = previsualizacion?.lineas ?? [];
    if (filtroPreview === 'NUEVAS') return lineas.filter((l) => !l.esDuplicada);
    if (filtroPreview === 'DUPLICADAS') return lineas.filter((l) => l.esDuplicada);
    return lineas;
  }, [previsualizacion?.lineas, filtroPreview]);

  const moneda = cuenta?.moneda ?? 'PEN';

  const columnasPreview: ColumnaTablaDensa<LineaPrevisualizadaV2>[] = [
    {
      key: 'numFila',
      header: '#Fila',
      width: '55px',
      align: 'center',
      render: (r) => <span className="font-mono text-[#4B5563]">{r.numFila}</span>,
    },
    {
      key: 'fecha',
      header: 'Fecha',
      width: '88px',
      render: (r) => <span className="font-mono">{r.fecha}</span>,
    },
    {
      key: 'descripcion',
      header: 'Descripción',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate">{r.descripcion}</div>
          {(r.rucExtraido || r.docExtraido || r.contraparteExtraida) && (
            <div className="text-[10px] text-[#4B5563] font-mono truncate">
              {r.rucExtraido ? `RUC ${r.rucExtraido} ` : ''}
              {r.docExtraido ? `Doc ${r.docExtraido} ` : ''}
              {r.contraparteExtraida ? `· ${r.contraparteExtraida}` : ''}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'referencia',
      header: 'Referencia',
      width: '100px',
      render: (r) => <span className="font-mono text-[#1E3A5F]">{r.referencia || '—'}</span>,
    },
    {
      key: 'tipoClasificacion',
      header: 'Clasificación',
      width: '135px',
      render: (r) => (
        <span
          className={`inline-block px-1.5 py-0.5 text-[10px] font-bold border ${claseBadgeClasificacion(
            r.tipoClasificacion
          )}`}
        >
          {r.tipoClasificacion}
        </span>
      ),
    },
    {
      key: 'monto',
      header: `Monto (${moneda})`,
      width: '110px',
      align: 'right',
      numeric: true,
      render: (r) => {
        const neg = new Decimal(r.monto).lt(0);
        return (
          <span className={`font-mono font-bold ${neg ? 'text-[#B91C1C]' : 'text-[#1E6F42]'}`}>
            {formatearDecimal(r.monto, moneda)}
          </span>
        );
      },
    },
    {
      key: 'saldo',
      header: 'Saldo',
      width: '105px',
      align: 'right',
      numeric: true,
      render: (r) => (
        <span className="font-mono text-[#374151]">
          {r.saldo !== null ? formatearDecimal(r.saldo, moneda) : '—'}
        </span>
      ),
    },
    {
      key: 'esDuplicada',
      header: 'Lote',
      width: '92px',
      align: 'center',
      render: (r) =>
        r.esDuplicada ? (
          <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold bg-[#FEF3C7] text-[#B45309] border border-[#B45309]">
            DUPLICADA
          </span>
        ) : (
          <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold bg-[#ECFDF5] text-[#1E6F42] border border-[#1E6F42]">
            NUEVA
          </span>
        ),
    },
  ];

  const pasosTitulos: Array<{ id: PasoAsistente; titulo: string }> = [
    { id: 1, titulo: '1. Archivo' },
    { id: 2, titulo: '2. Perfil y Mapeo' },
    { id: 3, titulo: '3. Validación' },
    { id: 4, titulo: '4. Vista previa' },
    { id: 5, titulo: '5. Confirmar' },
  ];

  return (
    <VentanaModal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Asistente de Importación de Extracto Bancario V2"
      subtitulo={
        cuenta ? `${cuenta.banco} (${cuenta.moneda}) · N° ${cuenta.numero} · Periodo ${periodo}` : undefined
      }
      ancho="2xl"
      footer={
        <div className="w-full flex items-center justify-between gap-2">
          <div>
            {paso > 1 && (
              <button
                type="button"
                disabled={previsualizarMutation.isPending || confirmarMutation.isPending}
                onClick={() => setPaso((p) => (p > 1 ? ((p - 1) as PasoAsistente) : p))}
                className="h-7 px-3 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border border-[#D1D5DB] text-[12px] inline-flex items-center gap-1 cursor-pointer rounded-none"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Anterior</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCerrar}
              disabled={confirmarMutation.isPending}
              className="h-7 px-3 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border border-[#D1D5DB] text-[12px] cursor-pointer rounded-none"
            >
              Cancelar
            </button>

            {paso === 1 && (
              <button
                type="button"
                disabled={!contenidoBase64 || Boolean(errorArchivo) || !cuenta}
                onClick={() => setPaso(2)}
                className="h-7 px-3 bg-[#1E3A5F] hover:bg-[#162C49] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-[#FFFFFF] border border-[#1E3A5F] disabled:border-[#D1D5DB] text-[12px] inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed rounded-none"
              >
                <span>Siguiente: Perfil y Mapeo</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            {paso === 2 && (
              <button
                type="button"
                disabled={previsualizarMutation.isPending || !contenidoBase64}
                onClick={handleEjecutarValidacion}
                className="h-7 px-3 bg-[#1E3A5F] hover:bg-[#162C49] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-[#FFFFFF] border border-[#1E3A5F] text-[12px] inline-flex items-center gap-1 cursor-pointer rounded-none"
              >
                <span>
                  {previsualizarMutation.isPending ? 'Validando...' : 'Validar y Previsualizar'}
                </span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            {paso === 3 && (
              <button
                type="button"
                disabled={!previsualizacion || previsualizarMutation.isPending}
                onClick={() => setPaso(4)}
                className="h-7 px-3 bg-[#1E3A5F] hover:bg-[#162C49] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-[#FFFFFF] border border-[#1E3A5F] disabled:border-[#D1D5DB] text-[12px] inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed rounded-none"
              >
                <span>Siguiente: Vista previa</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            {paso === 4 && (
              <button
                type="button"
                disabled={!previsualizacion}
                onClick={() => setPaso(5)}
                className="h-7 px-3 bg-[#1E3A5F] hover:bg-[#162C49] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-[#FFFFFF] border border-[#1E3A5F] text-[12px] inline-flex items-center gap-1 cursor-pointer rounded-none"
              >
                <span>Siguiente: Confirmar</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            {paso === 5 && (
              <button
                type="button"
                disabled={
                  !previsualizacion?.valido ||
                  !puedeImportar ||
                  confirmarMutation.isPending
                }
                onClick={handleConfirmarImportacion}
                className="h-7 px-3 bg-[#1E6F42] hover:bg-[#165934] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-[#FFFFFF] border border-[#1E6F42] disabled:border-[#D1D5DB] text-[12px] font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed rounded-none"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>
                  {confirmarMutation.isPending ? 'Importando...' : 'Confirmar Importación'}
                </span>
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Stepper horizontal */}
        <div className="grid grid-cols-5 border border-[#D1D5DB] bg-[#F5F7FA]">
          {pasosTitulos.map((item) => {
            const activo = paso === item.id;
            const completado = paso > item.id;
            return (
              <div
                key={item.id}
                className={`px-2 py-1.5 text-[11px] font-bold text-center border-r last:border-r-0 border-[#D1D5DB] ${
                  activo
                    ? 'bg-[#1E3A5F] text-[#FFFFFF]'
                    : completado
                    ? 'bg-[#ECFDF5] text-[#1E6F42]'
                    : 'text-[#6B7280]'
                }`}
              >
                {item.titulo}
              </div>
            );
          })}
        </div>

        {/* PASO 1: ARCHIVO */}
        {paso === 1 && (
          <div className="space-y-3">
            <div className="p-3 bg-[#F5F7FA] border border-[#D1D5DB] flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold text-[#1E3A5F]">
                  Seleccione el extracto bancario (.xlsx, .csv, .txt o .pdf)
                </div>
                <div className="text-[11px] text-[#4B5563]">
                  Tamaño máximo permitido: 5 MB. Las filas repetidas se detectan automáticamente sin duplicarse.
                </div>
              </div>
              <button
                type="button"
                disabled={descargandoPlantilla}
                onClick={handleDescargarPlantilla}
                className="h-7 px-2.5 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#1E3A5F] border border-[#D1D5DB] text-[12px] inline-flex items-center gap-1.5 cursor-pointer rounded-none"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{descargandoPlantilla ? 'Descargando...' : 'Descargar plantilla CSV'}</span>
              </button>
            </div>

            <div className="p-4 border-2 border-dashed border-[#D1D5DB] bg-[#FFFFFF] text-center space-y-2">
              <FileSpreadsheet className="w-8 h-8 text-[#1E3A5F] mx-auto" strokeWidth={1.5} />
              <div>
                <input
                  type="file"
                  accept=".xlsx,.csv,.txt,.pdf"
                  onChange={handleSeleccionarArchivo}
                  className="text-[12px] file:mr-3 file:py-1 file:px-3 file:border file:border-[#1E3A5F] file:bg-[#1E3A5F] file:text-[#FFFFFF] file:text-[12px] file:cursor-pointer"
                />
              </div>
              {nombreArchivo && !errorArchivo && (
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#ECFDF5] border border-[#1E6F42] text-[#1E6F42] text-[12px] font-mono">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {nombreArchivo} ({(tamanoBytes / 1024).toFixed(1)} KB)
                  </span>
                </div>
              )}
            </div>

            {errorArchivo && (
              <div className="p-2.5 bg-[#FEF2F2] border border-[#B91C1C] text-[#B91C1C] text-[12px] flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>{errorArchivo}</span>
              </div>
            )}
          </div>
        )}

        {/* PASO 2: PERFIL Y MAPEO */}
        {paso === 2 && (
          <div className="space-y-3">
            {errorMapeo && (
              <div className="p-2 bg-[#FEF2F2] border border-[#B91C1C] text-[#B91C1C] text-[12px]">
                {errorMapeo}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#374151] mb-1">
                  Perfil Bancario (Predefinido o Empresa)
                </label>
                <select
                  value={perfilSeleccionadoKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'MANUAL_PLANTILLA') {
                      aplicarPerfilEnFormulario(null);
                    } else {
                      const p = perfiles.find((item) => obtenerClavePerfil(item) === val) ?? null;
                      aplicarPerfilEnFormulario(p);
                    }
                  }}
                  className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] focus:outline-none focus:border-[#1E3A5F] rounded-none"
                >
                  <option value="MANUAL_PLANTILLA">
                    -- Mapeo manual / Plantilla CSV estándar --
                  </option>
                  {perfiles.map((p) => {
                    const key = obtenerClavePerfil(p);
                    return (
                      <option key={key} value={key}>
                        {p.predefinido || p.esSistema ? '[Predefinido]' : '[Empresa]'} {p.banco} ·{' '}
                        {p.nombre} ({p.formato})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 h-7 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ajustarMapeoManual || !perfilSeleccionado}
                    disabled={!perfilSeleccionado}
                    onChange={(e) => setAjustarMapeoManual(e.target.checked)}
                    className="w-4 h-4 accent-[#1E3A5F]"
                  />
                  <span className="text-[12px] font-bold text-[#1E3A5F]">
                    Ajustar columnas y parámetros manualmente
                  </span>
                </label>
              </div>
            </div>

            <div className="p-2.5 bg-[#F5F7FA] border border-[#D1D5DB] space-y-2.5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-[#374151] mb-1">
                    Fila Encabezado
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={filaEncabezado}
                    disabled={!ajustarMapeoManual && Boolean(perfilSeleccionado)}
                    onChange={(e) => setFilaEncabezado(e.target.value)}
                    className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] font-mono disabled:bg-[#F3F4F6] rounded-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#374151] mb-1">
                    Delimitador CSV/TXT
                  </label>
                  <input
                    type="text"
                    maxLength={5}
                    value={delimitador}
                    disabled={!ajustarMapeoManual && Boolean(perfilSeleccionado)}
                    onChange={(e) => setDelimitador(e.target.value)}
                    placeholder=", o ; o |"
                    className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] font-mono disabled:bg-[#F3F4F6] rounded-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#374151] mb-1">
                    Formato de Fecha
                  </label>
                  <select
                    value={formatoFecha}
                    disabled={!ajustarMapeoManual && Boolean(perfilSeleccionado)}
                    onChange={(e) => setFormatoFecha(e.target.value)}
                    className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] font-mono disabled:bg-[#F3F4F6] rounded-none"
                  >
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#374151] mb-1">
                    Separador Decimal
                  </label>
                  <select
                    value={separadorDecimal}
                    disabled={!ajustarMapeoManual && Boolean(perfilSeleccionado)}
                    onChange={(e) => setSeparadorDecimal(e.target.value as '.' | ',')}
                    className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] font-mono disabled:bg-[#F3F4F6] rounded-none"
                  >
                    <option value=".">Punto (.)</option>
                    <option value=",">Coma (,)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-[#374151] mb-1">
                    Columna Fecha *
                  </label>
                  <input
                    type="text"
                    value={colFecha}
                    disabled={!ajustarMapeoManual && Boolean(perfilSeleccionado)}
                    onChange={(e) => setColFecha(e.target.value)}
                    className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] disabled:bg-[#F3F4F6] rounded-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#374151] mb-1">
                    Columna Descripción *
                  </label>
                  <input
                    type="text"
                    value={colDescripcion}
                    disabled={!ajustarMapeoManual && Boolean(perfilSeleccionado)}
                    onChange={(e) => setColDescripcion(e.target.value)}
                    className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] disabled:bg-[#F3F4F6] rounded-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#374151] mb-1">
                    Columna Referencia
                  </label>
                  <input
                    type="text"
                    value={colReferencia}
                    disabled={!ajustarMapeoManual && Boolean(perfilSeleccionado)}
                    onChange={(e) => setColReferencia(e.target.value)}
                    className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] disabled:bg-[#F3F4F6] rounded-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#374151] mb-1">
                    Columna Saldo
                  </label>
                  <input
                    type="text"
                    value={colSaldo}
                    disabled={!ajustarMapeoManual && Boolean(perfilSeleccionado)}
                    onChange={(e) => setColSaldo(e.target.value)}
                    className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] disabled:bg-[#F3F4F6] rounded-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3 pt-1 border-t border-[#D1D5DB]">
                <div>
                  <label className="block text-[11px] font-bold text-[#374151] mb-1">
                    Modo de Importe
                  </label>
                  <select
                    value={modoMonto}
                    disabled={!ajustarMapeoManual && Boolean(perfilSeleccionado)}
                    onChange={(e) => setModoMonto(e.target.value as ModoMonto)}
                    className="h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] disabled:bg-[#F3F4F6] rounded-none"
                  >
                    <option value="ABONO_CARGO">Columnas Abono y Cargo</option>
                    <option value="COLUMNA_UNICA">Columna única (Monto)</option>
                  </select>
                </div>

                {modoMonto === 'COLUMNA_UNICA' ? (
                  <div className="w-44">
                    <label className="block text-[11px] font-bold text-[#374151] mb-1">
                      Columna Monto *
                    </label>
                    <input
                      type="text"
                      value={colMonto}
                      disabled={!ajustarMapeoManual && Boolean(perfilSeleccionado)}
                      onChange={(e) => setColMonto(e.target.value)}
                      className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] disabled:bg-[#F3F4F6] rounded-none"
                    />
                  </div>
                ) : (
                  <>
                    <div className="w-40">
                      <label className="block text-[11px] font-bold text-[#374151] mb-1">
                        Columna Abono
                      </label>
                      <input
                        type="text"
                        value={colAbono}
                        disabled={!ajustarMapeoManual && Boolean(perfilSeleccionado)}
                        onChange={(e) => setColAbono(e.target.value)}
                        className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] disabled:bg-[#F3F4F6] rounded-none"
                      />
                    </div>
                    <div className="w-40">
                      <label className="block text-[11px] font-bold text-[#374151] mb-1">
                        Columna Cargo
                      </label>
                      <input
                        type="text"
                        value={colCargo}
                        disabled={!ajustarMapeoManual && Boolean(perfilSeleccionado)}
                        onChange={(e) => setColCargo(e.target.value)}
                        className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] disabled:bg-[#F3F4F6] rounded-none"
                      />
                    </div>
                  </>
                )}

                <label className="inline-flex items-center gap-1.5 h-7 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={signoCargoNegativo}
                    disabled={!ajustarMapeoManual && Boolean(perfilSeleccionado)}
                    onChange={(e) => setSignoCargoNegativo(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#1E3A5F]"
                  />
                  <span className="text-[11px] text-[#374151]">Cargos con signo negativo</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#374151] mb-1">
                  Saldo Inicial Declarado (Opcional, para cuadre)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={saldoInicialDeclarado}
                  onChange={(e) => setSaldoInicialDeclarado(e.target.value)}
                  placeholder="Ej. 15000.00"
                  className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] font-mono text-right rounded-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#374151] mb-1">
                  Saldo Final Declarado (Opcional, para cuadre)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={saldoFinalDeclarado}
                  onChange={(e) => setSaldoFinalDeclarado(e.target.value)}
                  placeholder="Ej. 18450.25"
                  className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] font-mono text-right rounded-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* PASO 3: VALIDACIÓN */}
        {paso === 3 && (
          <div className="space-y-3">
            {previsualizarMutation.isPending ? (
              <div className="p-6 text-center text-[#4B5563] border border-[#D1D5DB] bg-[#F5F7FA]">
                Validando estructura, fechas, montos y clasificación del extracto...
              </div>
            ) : previsualizarMutation.error ? (
              <div className="p-3 bg-[#FEF2F2] border border-[#B91C1C] text-[#991B1B] text-[12px] flex items-start gap-2">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong>Error en validación:</strong>{' '}
                  {extraerMensajeErrorConciliacion(
                    previsualizarMutation.error,
                    'Error al previsualizar el archivo.'
                  )}
                </div>
              </div>
            ) : previsualizacion ? (
              <>
                <div className="p-2.5 bg-[#F5F7FA] border border-[#D1D5DB] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 text-[11px] font-bold border ${
                        previsualizacion.valido
                          ? 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]'
                          : 'bg-[#FEF2F2] text-[#B91C1C] border-[#B91C1C]'
                      }`}
                    >
                      {previsualizacion.valido ? 'VALIDACIÓN EXITOSA' : 'CON ERRORES DE VALIDACIÓN'}
                    </span>
                    <span className="font-mono text-[11px] text-[#374151]">
                      {previsualizacion.nombreArchivo} ({previsualizacion.formatoArchivo}) · Perfil:{' '}
                      {previsualizacion.perfilAplicadoCodigo || 'Manual'}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-[#4B5563]">
                    Rango: {previsualizacion.fechaDesde ?? '—'} a {previsualizacion.fechaHasta ?? '—'}
                  </div>
                </div>

                {/* Cuadre de saldos */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[12px]">
                  <div className="p-2 bg-[#FFFFFF] border border-[#D1D5DB]">
                    <div className="text-[11px] text-[#4B5563]">Saldo Inicial</div>
                    <div className="font-mono font-bold">
                      {formatearDecimal(previsualizacion.saldoInicial, moneda)}
                    </div>
                  </div>
                  <div className="p-2 bg-[#FFFFFF] border border-[#D1D5DB]">
                    <div className="text-[11px] text-[#4B5563]">(+) Total Abonos</div>
                    <div className="font-mono font-bold text-[#1E6F42]">
                      {formatearDecimal(previsualizacion.totalAbonos, moneda)}
                    </div>
                  </div>
                  <div className="p-2 bg-[#FFFFFF] border border-[#D1D5DB]">
                    <div className="text-[11px] text-[#4B5563]">(−) Total Cargos</div>
                    <div className="font-mono font-bold text-[#B91C1C]">
                      {formatearDecimal(previsualizacion.totalCargos, moneda)}
                    </div>
                  </div>
                  <div className="p-2 bg-[#FFFFFF] border border-[#D1D5DB]">
                    <div className="text-[11px] text-[#4B5563]">Saldo Final Calculado</div>
                    <div className="font-mono font-bold text-[#1E3A5F]">
                      {formatearDecimal(previsualizacion.saldoFinalCalculado, moneda)}
                    </div>
                  </div>
                  <div
                    className={`p-2 border ${
                      previsualizacion.cuadreSaldosValido
                        ? 'bg-[#ECFDF5] border-[#1E6F42]'
                        : 'bg-[#FEF2F2] border-[#B91C1C]'
                    }`}
                  >
                    <div className="text-[11px] text-[#4B5563]">Saldo Final / Cuadre</div>
                    <div className="font-mono font-bold">
                      {formatearDecimal(previsualizacion.saldoFinal, moneda)}
                    </div>
                    <div className="text-[10px] font-bold">
                      {previsualizacion.cuadreSaldosValido ? 'Cuadre exacto' : 'Descuadre'}
                    </div>
                  </div>
                </div>

                {/* Advertencias */}
                {previsualizacion.advertencias.length > 0 && (
                  <div className="space-y-1">
                    {previsualizacion.advertencias.map((adv, idx) => (
                      <div
                        key={`${adv.codigo}-${idx}`}
                        className="p-2 bg-[#FEF3C7] border border-[#B45309] text-[#7C2D12] text-[11px] flex items-start gap-2"
                      >
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#B45309]" />
                        <div>
                          <strong>{adv.codigo}:</strong> {adv.mensaje}
                          {adv.saldoAnteriorEsperado && adv.saldoInicialArchivo && (
                            <span className="ml-1 font-mono">
                              (Esperado: {formatearDecimal(adv.saldoAnteriorEsperado, moneda)} vs
                              Archivo: {formatearDecimal(adv.saldoInicialArchivo, moneda)})
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Errores por fila */}
                {previsualizacion.errores.length > 0 && (
                  <div className="border border-[#B91C1C] bg-[#FFFFFF]">
                    <div className="px-2.5 py-1.5 bg-[#FEF2F2] border-b border-[#B91C1C] text-[#B91C1C] font-bold text-[11px]">
                      Errores detectados ({previsualizacion.errores.length})
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      <table className="tabla-densa">
                        <thead>
                          <tr>
                            <th style={{ width: '70px' }}>Fila</th>
                            <th style={{ width: '160px' }}>Código</th>
                            <th style={{ width: '110px' }}>Campo</th>
                            <th>Mensaje</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previsualizacion.errores.map((err, i) => (
                            <tr key={`${err.codigo}-${i}`}>
                              <td className="font-mono text-center">
                                {err.numFila ?? 'Archivo'}
                              </td>
                              <td className="font-mono text-[#B91C1C] font-bold">{err.codigo}</td>
                              <td className="font-mono">{err.campo || '—'}</td>
                              <td>
                                {err.mensaje}
                                {err.valor ? ` [valor: "${err.valor}"]` : ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* PASO 4: VISTA PREVIA */}
        {paso === 4 && previsualizacion && (
          <div className="space-y-2.5">
            <div className="p-2 bg-[#F5F7FA] border border-[#D1D5DB] flex flex-wrap items-center justify-between gap-2 text-[12px]">
              <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
                <span>
                  Total filas archivo: <strong>{previsualizacion.totalFilasArchivo}</strong>
                </span>
                <span className="text-[#1E6F42]">
                  Nuevas: <strong>{previsualizacion.filasNuevas}</strong>
                </span>
                <span className="text-[#B45309]">
                  Duplicadas (omitidas): <strong>{previsualizacion.filasDuplicadas}</strong>
                </span>
              </div>

              <div className="flex items-center gap-1">
                {(['TODAS', 'NUEVAS', 'DUPLICADAS'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFiltroPreview(f)}
                    className={`h-6 px-2 text-[11px] border cursor-pointer rounded-none ${
                      filtroPreview === f
                        ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F] font-bold'
                        : 'bg-[#FFFFFF] text-[#111827] border-[#D1D5DB]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[340px] overflow-y-auto">
              <TablaDensa
                columnas={columnasPreview}
                datos={lineasFiltradas}
                rowKey={(r) => `${r.numFila}-${r.hashLinea}`}
                mensajeVacio="No hay líneas para el filtro seleccionado."
              />
            </div>
          </div>
        )}

        {/* PASO 5: CONFIRMAR */}
        {paso === 5 && previsualizacion && (
          <div className="space-y-3">
            {!previsualizacion.valido && (
              <div className="p-2.5 bg-[#FEF2F2] border border-[#B91C1C] text-[#B91C1C] text-[12px] font-bold">
                No es posible confirmar la importación porque existen errores de validación en el Paso 3.
              </div>
            )}

            <div className="p-3 bg-[#F5F7FA] border border-[#D1D5DB] space-y-2 text-[12px]">
              <div className="font-bold text-[#1E3A5F] text-[13px]">
                Resumen final de importación
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <strong>Cuenta:</strong> {cuenta?.banco} · {cuenta?.numero} ({moneda})
                </div>
                <div>
                  <strong>Periodo:</strong> <span className="font-mono">{previsualizacion.periodo}</span>
                </div>
                <div>
                  <strong>Archivo:</strong> {previsualizacion.nombreArchivo} ({previsualizacion.formatoArchivo})
                </div>
                <div>
                  <strong>Rango fechas:</strong>{' '}
                  <span className="font-mono">
                    {previsualizacion.fechaDesde ?? '—'} a {previsualizacion.fechaHasta ?? '—'}
                  </span>
                </div>
                <div>
                  <strong>Total filas archivo:</strong>{' '}
                  <span className="font-mono font-bold">{previsualizacion.totalFilasArchivo}</span>
                </div>
                <div>
                  <strong>Resultado idempotente:</strong>{' '}
                  <span className="font-mono font-bold text-[#1E6F42]">
                    {previsualizacion.filasNuevas} nuevas
                  </span>{' '}
                  /{' '}
                  <span className="font-mono font-bold text-[#B45309]">
                    {previsualizacion.filasDuplicadas} duplicadas omitidas
                  </span>
                </div>
                <div>
                  <strong>Saldo Inicial:</strong>{' '}
                  <span className="font-mono">
                    {formatearDecimal(previsualizacion.saldoInicial, moneda)}
                  </span>
                </div>
                <div>
                  <strong>Saldo Final:</strong>{' '}
                  <span className="font-mono font-bold">
                    {formatearDecimal(previsualizacion.saldoFinal, moneda)}
                  </span>
                </div>
              </div>
            </div>

            {previsualizacion.filasNuevas === 0 && previsualizacion.valido && (
              <div className="p-2.5 bg-[#FEF3C7] border border-[#B45309] text-[#7C2D12] text-[12px]">
                Todas las líneas del archivo ya existen en esta cuenta ({previsualizacion.filasDuplicadas}{' '}
                duplicadas). Si confirma, el sistema registrará el intento sin duplicar partidas.
              </div>
            )}
          </div>
        )}
      </div>
    </VentanaModal>
  );
};
