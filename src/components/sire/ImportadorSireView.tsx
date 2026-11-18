import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  RefreshCw,
  Check,
  X,
  Search,
  Filter,
  BookOpen,
  Settings,
  ChevronDown,
  ChevronUp,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Download,
  Receipt,
  FileText
} from 'lucide-react';
import { EmpresaCliente } from '../../types';
import { CuentaPCGE } from '../../data/pcgeAccounts';
import { CatalogoCuentasDialog } from '../voucher/CatalogoCuentasDialog';
import { SelectorCuentaContable } from '../common/SelectorCuentaContable';
import {
  sireImportacionApi,
  FilaSireAnalizada,
  ResultadoAnalisisSire,
  ReglasMapeoSire,
  ResultadoContabilizacionSire
} from '../../api/sireImportacionApi';
import { useToast } from '../../context/ToastContext';

interface ImportadorSireViewProps {
  tipo: 'COMPRAS' | 'VENTAS';
  empresa: EmpresaCliente;
  periodo: string;
  onFinalizado?: () => void;
}

export const ImportadorSireView: React.FC<ImportadorSireViewProps> = ({
  tipo,
  empresa,
  periodo,
  onFinalizado
}) => {
  const { success, error, warning } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados de carga y análisis
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAnalisisSire | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Estado de las filas analizadas (editables por el usuario)
  const [filas, setFilas] = useState<FilaSireAnalizada[]>([]);

  // Filtros y búsqueda de la tabla
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');

  // Configuración de reglas PCGE colapsable
  const [mostrarReglas, setMostrarReglas] = useState(false);
  const [reglas, setReglas] = useState<ReglasMapeoSire | null>(null);
  const [guardandoReglas, setGuardandoReglas] = useState(false);

  // Diálogo para cambiar cuenta contable de una fila
  const [filaEdicionCuenta, setFilaEdicionCuenta] = useState<FilaSireAnalizada | null>(null);

  // Estado de contabilización en lote
  const [contabilizando, setContabilizando] = useState(false);
  const [resultadoContabilizacion, setResultadoContabilizacion] = useState<ResultadoContabilizacionSire | null>(null);

  // Cargar reglas iniciales
  useEffect(() => {
    let activo = true;
    sireImportacionApi.obtenerReglasMapeo(empresa.id)
      .then((res) => {
        if (activo) setReglas(res);
      })
      .catch((err) => {
        console.warn('No se pudieron cargar reglas de mapeo SIRE:', err);
      });
    return () => {
      activo = false;
    };
  }, [empresa.id]);

  // Manejador de selección de archivo
  const handleSeleccionarArchivo = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setErrorCarga('El archivo debe ser un paquete ZIP (.zip) descargado directamente desde SUNAT SIRE.');
      setArchivoSeleccionado(null);
      return;
    }
    setErrorCarga(null);
    setArchivoSeleccionado(file);
    ejecutarAnalisis(file);
  };

  const ejecutarAnalisis = async (file: File) => {
    setAnalizando(true);
    setErrorCarga(null);
    setResultado(null);
    setResultadoContabilizacion(null);

    try {
      const data = await sireImportacionApi.analizarZip(empresa.id, tipo, periodo, file);
      setResultado(data);
      setFilas(data.filas || []);
      success(
        `Archivo SIRE analizado: ${data.totalRegistros} comprobantes encontrados.`,
        'Análisis Exitoso'
      );
    } catch (err: any) {
      const msg = err?.message || 'Error al procesar el archivo ZIP de SIRE.';
      setErrorCarga(msg);
      error(msg, 'Error de Análisis');
    } finally {
      setAnalizando(false);
    }
  };

  // Re-aplicar análisis si se cambia el archivo o se guardan reglas
  const reanalizar = () => {
    if (archivoSeleccionado) {
      ejecutarAnalisis(archivoSeleccionado);
    }
  };

  // Guardar reglas editadas
  const handleGuardarReglas = async () => {
    if (!reglas) return;
    setGuardandoReglas(true);
    try {
      const actualizadas = await sireImportacionApi.guardarReglasMapeo(empresa.id, reglas);
      setReglas(actualizadas);
      success('Reglas de asignación contable actualizadas correctamente.', 'Reglas Guardadas');
      if (archivoSeleccionado) {
        ejecutarAnalisis(archivoSeleccionado);
      }
    } catch (err: any) {
      error(err?.message || 'No se pudieron guardar las reglas.', 'Error');
    } finally {
      setGuardandoReglas(false);
    }
  };

  // Toggle inclusión de fila
  const toggleFilaInclusion = (indice: number) => {
    setFilas((prev) =>
      prev.map((f) => {
        if (f.indice === indice) {
          return { ...f, incluir: !f.incluir };
        }
        return f;
      })
    );
  };

  // Toggle seleccionar todos los aptos
  const toggleSeleccionarTodos = () => {
    const todosAptosSeleccionados = filas
      .filter((f) => f.estadoValidacion !== 'YA_IMPORTADO' && !f.cuentaRequiereRevision)
      .every((f) => f.incluir);

    setFilas((prev) =>
      prev.map((f) => {
        if (f.estadoValidacion === 'YA_IMPORTADO') return f;
        return {
          ...f,
          incluir: !todosAptosSeleccionados
        };
      })
    );
  };

  // Edición directa de glosa
  const handleGlosaChange = (indice: number, nuevaGlosa: string) => {
    setFilas((prev) =>
      prev.map((f) => (f.indice === indice ? { ...f, glosaPropuesta: nuevaGlosa } : f))
    );
  };

  // Asignar cuenta desde el diálogo PCGE
  const handleSeleccionarCuentaFila = (cuenta: CuentaPCGE) => {
    if (!filaEdicionCuenta) return;

    setFilas((prev) =>
      prev.map((f) => {
        if (f.indice === filaEdicionCuenta.indice) {
          const nuevasAdvertencias = f.advertencias.filter((a) => !a.includes('No se encontró cuenta'));
          const nuevoEstado =
            nuevasAdvertencias.length > 0
              ? 'CON_ADVERTENCIA'
              : f.estadoValidacion === 'YA_IMPORTADO'
              ? 'YA_IMPORTADO'
              : 'PENDIENTE';

          return {
            ...f,
            cuentaPropuestaCodigo: cuenta.codigo,
            cuentaPropuestaNombre: cuenta.denominacion || cuenta.nombre,
            cuentaRequiereRevision: false,
            advertencias: nuevasAdvertencias,
            estadoValidacion: nuevoEstado,
            incluir: f.estadoValidacion !== 'YA_IMPORTADO' ? true : f.incluir
          };
        }
        return f;
      })
    );

    setFilaEdicionCuenta(null);
  };

  // Filtrado de filas visibles
  const filasFiltradas = useMemo(() => {
    return filas.filter((f) => {
      // Filtro de estado
      if (filtroEstado === 'APTOS' && (f.cuentaRequiereRevision || f.estadoValidacion === 'YA_IMPORTADO')) {
        return false;
      }
      if (filtroEstado === 'CON_ADVERTENCIA' && f.estadoValidacion !== 'CON_ADVERTENCIA') {
        return false;
      }
      if (filtroEstado === 'REQUIERE_REVISION' && !f.cuentaRequiereRevision) {
        return false;
      }
      if (filtroEstado === 'YA_IMPORTADO' && f.estadoValidacion !== 'YA_IMPORTADO') {
        return false;
      }

      // Filtro de búsqueda
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const coincideSerie = `${f.serie}-${f.numero}`.toLowerCase().includes(term);
        const coincideDoc = f.numDocIdentidad.toLowerCase().includes(term);
        const coincideRazon = f.razonSocial.toLowerCase().includes(term);
        const coincideGlosa = f.glosaPropuesta.toLowerCase().includes(term);
        const coincideCuenta = f.cuentaPropuestaCodigo.toLowerCase().includes(term);
        return coincideSerie || coincideDoc || coincideRazon || coincideGlosa || coincideCuenta;
      }

      return true;
    });
  }, [filas, filtroEstado, searchTerm]);

  // Estadísticas dinámicas de la selección
  const seleccionadas = useMemo(() => filas.filter((f) => f.incluir), [filas]);
  const cantidadSeleccionadas = seleccionadas.length;
  const totalImporteSeleccionado = seleccionadas.reduce((acc, f) => acc + f.total, 0);

  // Comprobar si hay filas seleccionadas que requieren revisión (bloquea contabilizar)
  const seleccionadasConError = useMemo(
    () => seleccionadas.filter((f) => f.cuentaRequiereRevision || !f.cuentaPropuestaCodigo),
    [seleccionadas]
  );

  // Ejecutar contabilización masiva
  const handleContabilizar = async () => {
    if (cantidadSeleccionadas === 0) {
      warning('Seleccione al menos un comprobante para contabilizar.', 'Sin selección');
      return;
    }

    if (seleccionadasConError.length > 0) {
      error(
        `Hay ${seleccionadasConError.length} comprobante(s) seleccionado(s) sin cuenta contable asignada. Asigne la cuenta o desmárquelos antes de continuar.`,
        'Revisión Requerida'
      );
      return;
    }

    setContabilizando(true);
    setResultadoContabilizacion(null);

    try {
      const res = await sireImportacionApi.contabilizarFilas(
        empresa.id,
        tipo,
        periodo,
        seleccionadas
      );

      setResultadoContabilizacion(res);

      if (res.exitosos > 0) {
        success(
          `Se contabilizaron ${res.exitosos} comprobante(s) exitosamente.`,
          'Contabilización Finalizada'
        );
        // Actualizar el estado de las filas en la grilla
        const exitososIndices = new Set(
          res.detalles.filter((d) => d.exito).map((d) => d.indice)
        );
        setFilas((prev) =>
          prev.map((f) => {
            if (exitososIndices.has(f.indice)) {
              return {
                ...f,
                estadoValidacion: 'YA_IMPORTADO',
                incluir: false,
                advertencias: [...f.advertencias, 'Contabilizado en esta sesión']
              };
            }
            return f;
          })
        );
      } else {
        warning('Ningún comprobante pudo ser contabilizado. Revise los detalles.', 'Aviso');
      }
    } catch (err: any) {
      error(err?.message || 'Error durante la contabilización de comprobantes.', 'Error');
    } finally {
      setContabilizando(false);
    }
  };

  const formatearMonto = (monto: number) => {
    return new Intl.NumberFormat('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(monto || 0);
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. CABECERA E INSTRUCTIVO                                                 */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-blue-50 text-blue-700 rounded-xl">
                <FileSpreadsheet className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Importación Asistida SIRE — {tipo === 'COMPRAS' ? 'RCE (Compras)' : 'RVIE (Ventas)'}
                </h2>
                <p className="text-xs text-slate-500">
                  Carga el archivo ZIP oficial descargado desde SUNAT SIRE. Los registros serán analizados
                  aritméticamente, validados contra el Plan Contable y preparados para su contabilización.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMostrarReglas(!mostrarReglas)}
              className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              title="Configuración de cuentas contables predeterminadas"
            >
              <Settings className="w-4 h-4 text-slate-600" />
              <span>Reglas de Cuentas</span>
              {mostrarReglas ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {resultado && (
              <button
                onClick={reanalizar}
                disabled={analizando}
                className="px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${analizando ? 'animate-spin' : ''}`} />
                <span>Reanalizar</span>
              </button>
            )}
          </div>
        </div>

        {/* Panel Colapsable de Reglas de Cuentas Contables */}
        {mostrarReglas && reglas && (
          <div className="mt-4 pt-4 border-t border-slate-100 bg-slate-50/70 p-4 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-600" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Cuentas Contables Predeterminadas para {tipo === 'COMPRAS' ? 'Compras (RCE)' : 'Ventas (RVIE)'}
                </h4>
              </div>
              <button
                onClick={handleGuardarReglas}
                disabled={guardandoReglas}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {guardandoReglas ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Guardar y Aplicar
              </button>
            </div>

            {tipo === 'COMPRAS' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Mercaderías (Clasif. 1):</label>
                  <input
                    type="text"
                    value={reglas.compras.clasif1_mercaderias}
                    onChange={(e) =>
                      setReglas({
                        ...reglas,
                        compras: { ...reglas.compras, clasif1_mercaderias: e.target.value }
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-slate-800"
                    placeholder="Ej. 6011"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Servicios (Clasif. 4):</label>
                  <input
                    type="text"
                    value={reglas.compras.clasif4_servicios}
                    onChange={(e) =>
                      setReglas({
                        ...reglas,
                        compras: { ...reglas.compras, clasif4_servicios: e.target.value }
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-slate-800"
                    placeholder="Ej. 63111"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Activo Fijo (Clasif. 2):</label>
                  <input
                    type="text"
                    value={reglas.compras.clasif2_activoFijo}
                    onChange={(e) =>
                      setReglas({
                        ...reglas,
                        compras: { ...reglas.compras, clasif2_activoFijo: e.target.value }
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-slate-800"
                    placeholder="Ej. 33011"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">IGV Crédito Fiscal:</label>
                  <input
                    type="text"
                    value={reglas.compras.igvCreditoFiscal}
                    onChange={(e) =>
                      setReglas({
                        ...reglas,
                        compras: { ...reglas.compras, igvCreditoFiscal: e.target.value }
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-slate-800"
                    placeholder="Ej. 40111"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Proveedores (Cuenta Pasivo):</label>
                  <input
                    type="text"
                    value={reglas.compras.proveedorRuc}
                    onChange={(e) =>
                      setReglas({
                        ...reglas,
                        compras: { ...reglas.compras, proveedorRuc: e.target.value }
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-slate-800"
                    placeholder="Ej. 4212"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Cuenta Detracción:</label>
                  <input
                    type="text"
                    value={reglas.compras.cuentaDetraccion}
                    onChange={(e) =>
                      setReglas({
                        ...reglas,
                        compras: { ...reglas.compras, cuentaDetraccion: e.target.value }
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-slate-800"
                    placeholder="Ej. 422"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Operación Interna (0101):</label>
                  <input
                    type="text"
                    value={reglas.ventas.operacion0101_interna}
                    onChange={(e) =>
                      setReglas({
                        ...reglas,
                        ventas: { ...reglas.ventas, operacion0101_interna: e.target.value }
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-slate-800"
                    placeholder="Ej. 70121"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Exportaciones (0200):</label>
                  <input
                    type="text"
                    value={reglas.ventas.operacion0200_exportacion}
                    onChange={(e) =>
                      setReglas({
                        ...reglas,
                        ventas: { ...reglas.ventas, operacion0200_exportacion: e.target.value }
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-slate-800"
                    placeholder="Ej. 70111"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">IGV Débito Fiscal:</label>
                  <input
                    type="text"
                    value={reglas.ventas.igvDebitoFiscal}
                    onChange={(e) =>
                      setReglas({
                        ...reglas,
                        ventas: { ...reglas.ventas, igvDebitoFiscal: e.target.value }
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-slate-800"
                    placeholder="Ej. 40111"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Clientes (Cuenta Activo):</label>
                  <input
                    type="text"
                    value={reglas.ventas.clienteRuc}
                    onChange={(e) =>
                      setReglas({
                        ...reglas,
                        ventas: { ...reglas.ventas, clienteRuc: e.target.value }
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-slate-800"
                    placeholder="Ej. 1212"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. ZONA DE CARGA DE ARCHIVO ZIP                                           */}
      {/* ========================================================================= */}
      {!resultado && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleSeleccionarArchivo(e.dataTransfer.files[0]);
            }
          }}
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition ${
            analizando
              ? 'border-blue-400 bg-blue-50/40'
              : errorCarga
              ? 'border-rose-300 bg-rose-50/30'
              : 'border-slate-300 hover:border-blue-500 bg-white'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleSeleccionarArchivo(e.target.files[0]);
              }
            }}
          />

          <div className="flex flex-col items-center max-w-md mx-auto">
            {analizando ? (
              <div className="space-y-3">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
                <h3 className="text-base font-bold text-slate-800">
                  Descomprimiendo y analizando comprobantes SIRE...
                </h3>
                <p className="text-xs text-slate-500">
                  Extrayendo layout oficial, validando integridad aritmética y verificando cuentas contra el Plan PCGE.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                  <UploadCloud className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Arrastra o selecciona el archivo ZIP de SUNAT SIRE
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {tipo === 'COMPRAS'
                      ? 'Archivo ZIP de Propuesta RCE (ej. 20615425436-20261106-102409-propuesta.zip)'
                      : 'Archivo ZIP Exp2 RVIE (ej. LE2061542543620261100014040001EXP2.zip)'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition cursor-pointer shadow-xs inline-flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Examinar archivo ZIP
                </button>
              </div>
            )}

            {errorCarga && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2 text-left">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorCarga}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. RESUMEN Y MÉTRICAS DEL ARCHIVO ANALIZADO                               */}
      {/* ========================================================================= */}
      {resultado && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 border border-slate-200 rounded-2xl shadow-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Comprobantes</span>
              <p className="text-xl font-extrabold text-slate-900 mt-1">{resultado.totalRegistros}</p>
              <span className="text-[11px] text-slate-500 truncate block mt-0.5" title={resultado.nombreArchivo}>
                {resultado.nombreArchivo}
              </span>
            </div>

            <div className="bg-white p-4 border border-slate-200 rounded-2xl shadow-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Base Imponible</span>
              <p className="text-xl font-extrabold text-blue-700 mt-1">S/ {formatearMonto(resultado.totalBaseImponible)}</p>
              <span className="text-[11px] text-slate-500 block mt-0.5">Operaciones gravadas</span>
            </div>

            <div className="bg-white p-4 border border-slate-200 rounded-2xl shadow-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">IGV Total</span>
              <p className="text-xl font-extrabold text-indigo-700 mt-1">S/ {formatearMonto(resultado.totalIgv)}</p>
              <span className="text-[11px] text-slate-500 block mt-0.5">Crédito / Débito Fiscal</span>
            </div>

            <div className="bg-white p-4 border border-slate-200 rounded-2xl shadow-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Importe Total</span>
              <p className="text-xl font-extrabold text-slate-900 mt-1">S/ {formatearMonto(resultado.totalImporte)}</p>
              <span className="text-[11px] text-slate-500 block mt-0.5">Total Comprobantes</span>
            </div>
          </div>

          {/* Banner de estados */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-600 font-medium">Estado del archivo:</span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {resultado.resumenEstados.pendientes} listos
              </span>
              {resultado.resumenEstados.conAdvertencia > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {resultado.resumenEstados.conAdvertencia} con advertencia menor
                </span>
              )}
              {resultado.resumenEstados.requierenRevision > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {resultado.resumenEstados.requierenRevision} requieren asignar cuenta
                </span>
              )}
              {resultado.resumenEstados.yaImportados > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {resultado.resumenEstados.yaImportados} ya registrados previamente
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setResultado(null);
                  setFilas([]);
                  setArchivoSeleccionado(null);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              >
                Cargar otro archivo
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 4. RESULTADO DE CONTABILIZACIÓN FINAL (SI APLICA)                         */}
          {/* ========================================================================= */}
          {resultadoContabilizacion && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                    <CheckCircle2 className="w-6 h-6" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-emerald-900">
                      Proceso de Contabilización Completado
                    </h3>
                    <p className="text-xs text-emerald-700">
                      {resultadoContabilizacion.exitosos} comprobante(s) contabilizado(s) en subdiario y libro oficial.
                      {resultadoContabilizacion.fallidos > 0 &&
                        ` (${resultadoContabilizacion.fallidos} con fallas).`}
                    </p>
                  </div>
                </div>

                {onFinalizado && (
                  <button
                    onClick={onFinalizado}
                    className="px-3 py-1.5 bg-emerald-700 text-white text-xs font-bold rounded-lg hover:bg-emerald-800 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Ver en Consulta de Libro</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 5. BARRA DE HERRAMIENTAS Y FILTROS DE TABLA                               */}
          {/* ========================================================================= */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 border border-slate-200 rounded-2xl shadow-xs">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por RUC, Razón Social, Serie-Número o Glosa..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-hidden cursor-pointer"
                >
                  <option value="TODOS">Todos ({filas.length})</option>
                  <option value="APTOS">Listos para Contabilizar</option>
                  <option value="CON_ADVERTENCIA">Con Advertencias</option>
                  <option value="REQUIERE_REVISION">Requieren Revisión</option>
                  <option value="YA_IMPORTADO">Ya Registrados</option>
                </select>
              </div>

              <button
                type="button"
                onClick={toggleSeleccionarTodos}
                className="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer shrink-0"
              >
                Invertir Selección
              </button>

              <button
                type="button"
                onClick={handleContabilizar}
                disabled={contabilizando || cantidadSeleccionadas === 0 || seleccionadasConError.length > 0}
                className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {contabilizando ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Aprobar y Contabilizar ({cantidadSeleccionadas})</span>
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 6. TABLA INTERACTIVA DE COMPROBANTES                                     */}
          {/* ========================================================================= */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[550px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          filas.length > 0 &&
                          filas.filter((f) => f.estadoValidacion !== 'YA_IMPORTADO' && !f.cuentaRequiereRevision)
                            .every((f) => f.incluir)
                        }
                        onChange={toggleSeleccionarTodos}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="p-3 font-bold text-slate-600 w-12">#</th>
                    <th className="p-3 font-bold text-slate-600 w-24">Emisión</th>
                    <th className="p-3 font-bold text-slate-600 w-32">Comprobante</th>
                    <th className="p-3 font-bold text-slate-600">Proveedor / Cliente</th>
                    <th className="p-3 font-bold text-slate-600 text-right w-24">Base Imp.</th>
                    <th className="p-3 font-bold text-slate-600 text-right w-20">IGV</th>
                    <th className="p-3 font-bold text-slate-600 text-right w-24">Total</th>
                    <th className="p-3 font-bold text-slate-600 w-56">Cuenta Propuesta PCGE</th>
                    <th className="p-3 font-bold text-slate-600 w-64">Glosa del Asiento</th>
                    <th className="p-3 font-bold text-slate-600 w-36">Estado / Obs.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filasFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-400">
                        No se encontraron comprobantes con el filtro aplicado.
                      </td>
                    </tr>
                  ) : (
                    filasFiltradas.map((fila) => {
                      const esYaImportado = fila.estadoValidacion === 'YA_IMPORTADO';
                      const tieneError = fila.cuentaRequiereRevision || !fila.cuentaPropuestaCodigo;

                      return (
                        <tr
                          key={fila.indice}
                          className={`hover:bg-slate-50/80 transition ${
                            esYaImportado
                              ? 'bg-slate-50/40 opacity-70'
                              : tieneError
                              ? 'bg-rose-50/30'
                              : fila.incluir
                              ? 'bg-blue-50/10'
                              : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={fila.incluir}
                              disabled={esYaImportado || tieneError}
                              onChange={() => toggleFilaInclusion(fila.indice)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            />
                          </td>

                          {/* Índice */}
                          <td className="p-3 font-mono text-slate-400">{fila.indice}</td>

                          {/* Fecha */}
                          <td className="p-3 font-mono text-slate-700 whitespace-nowrap">
                            {fila.fechaEmision}
                          </td>

                          {/* Comprobante */}
                          <td className="p-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded font-mono font-bold text-[10px] bg-slate-100 text-slate-700">
                                {fila.tipoComprobante}
                              </span>
                              <span className="font-semibold text-slate-800">
                                {fila.serie}-{fila.numero}
                              </span>
                            </div>
                            {fila.esNotaAjuste && (
                              <span className="text-[10px] text-amber-700 font-medium block mt-0.5">
                                Modifica: {fila.docModificadoSerie}-{fila.docModificadoNumero}
                              </span>
                            )}
                          </td>

                          {/* Tercero */}
                          <td className="p-3">
                            <div className="font-semibold text-slate-800 truncate max-w-[200px]" title={fila.razonSocial}>
                              {fila.razonSocial}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
                              <span>{fila.numDocIdentidad}</span>
                              {!fila.auxiliarExiste && (
                                <span className="px-1 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[9px] font-sans font-bold">
                                  Nuevo Anexo
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Base */}
                          <td className="p-3 text-right font-mono text-slate-700">
                            {formatearMonto(fila.baseImponible)}
                          </td>

                          {/* IGV */}
                          <td className="p-3 text-right font-mono text-slate-700">
                            {formatearMonto(fila.igv)}
                          </td>

                          {/* Total */}
                          <td className="p-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                            {fila.moneda === 'USD' ? '$' : 'S/'} {formatearMonto(fila.total)}
                          </td>

                          {/* Cuenta Propuesta (PCGE) */}
                          <td className="p-3">
                            {fila.cuentaPropuestaCodigo ? (
                              <div
                                onClick={() => setFilaEdicionCuenta(fila)}
                                className="group p-1.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg cursor-pointer transition flex items-center justify-between gap-1"
                                title="Haga clic para cambiar de cuenta contable"
                              >
                                <div className="truncate">
                                  <span className="font-mono font-bold text-blue-700 mr-1.5">
                                    {fila.cuentaPropuestaCodigo}
                                  </span>
                                  <span className="text-[11px] text-slate-600 group-hover:text-blue-900 truncate">
                                    {fila.cuentaPropuestaNombre}
                                  </span>
                                </div>
                                <BookOpen className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0" />
                              </div>
                            ) : (
                              <button
                                onClick={() => setFilaEdicionCuenta(fila)}
                                className="w-full p-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 rounded-lg text-left text-[11px] font-bold flex items-center justify-between cursor-pointer transition"
                              >
                                <span>Asignar cuenta PCGE</span>
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              </button>
                            )}
                          </td>

                          {/* Glosa */}
                          <td className="p-3">
                            <input
                              type="text"
                              value={fila.glosaPropuesta}
                              onChange={(e) => handleGlosaChange(fila.indice, e.target.value)}
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-hidden truncate"
                              title={fila.glosaPropuesta}
                            />
                          </td>

                          {/* Estado / Observaciones */}
                          <td className="p-3">
                            {esYaImportado ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 inline-flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 text-slate-500" />
                                Registrado
                              </span>
                            ) : tieneError ? (
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1 cursor-help"
                                title={fila.advertencias.join(', ') || 'Requiere asignar cuenta'}
                              >
                                <AlertCircle className="w-3 h-3 text-rose-600" />
                                Revisar cuenta
                              </span>
                            ) : fila.advertencias.length > 0 ? (
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1 cursor-help"
                                title={fila.advertencias.join('; ')}
                              >
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                Advertencia
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Listo
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pie de tabla con totales seleccionados */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-slate-600 font-medium">
                Mostrando <strong className="text-slate-800">{filasFiltradas.length}</strong> de{' '}
                <strong className="text-slate-800">{filas.length}</strong> comprobantes.{' '}
                <span className="text-blue-700 font-bold ml-1">
                  ({cantidadSeleccionadas} seleccionados para contabilizar)
                </span>
              </div>

              <div className="flex items-center gap-4 font-mono">
                <div>
                  <span className="text-slate-400 mr-1">Total Seleccionado:</span>
                  <strong className="text-sm font-extrabold text-slate-900">
                    S/ {formatearMonto(totalImporteSeleccionado)}
                  </strong>
                </div>

                <button
                  type="button"
                  onClick={handleContabilizar}
                  disabled={contabilizando || cantidadSeleccionadas === 0 || seleccionadasConError.length > 0}
                  className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {contabilizando ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Contabilizar Seleccionados ({cantidadSeleccionadas})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. DIÁLOGO PCGE PARA EDITAR CUENTA DE FILA                                 */}
      {/* ========================================================================= */}
      {filaEdicionCuenta && (
        <CatalogoCuentasDialog
          isOpen={true}
          onClose={() => setFilaEdicionCuenta(null)}
          onSelectCuenta={handleSeleccionarCuentaFila}
          empresaId={empresa.id}
          initialQuery={filaEdicionCuenta.cuentaPropuestaCodigo || (tipo === 'COMPRAS' ? '60' : '70')}
          filtroPrefijo={tipo === 'COMPRAS' ? '6' : '7'}
          permitirMayor={false}
        />
      )}
    </div>
  );
};
