import React, { useState } from 'react';
import { 
  Plus, 
  Save, 
  CheckCircle, 
  Copy, 
  RotateCcw, 
  Ban, 
  Printer, 
  Search, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight,
  RefreshCw,
  FileText,
  Lock,
  Sparkles
} from 'lucide-react';
import { SUBDIARIOS_SISTEMA } from '../../data/sunatCatalogos';
import { PLANTILLAS_ASIENTOS, PlantillaAsiento } from './plantillasAsientos';

interface VoucherHeaderProps {
  empresaRazonSocial: string;
  empresaRuc: string;
  periodo: string;
  usuarioNombre: string;
  subdiario: string;
  subdiarioFijo?: string;
  subdiarioNombre?: string;
  numeroVoucher: string;
  fechaContable: string;
  fechaEmisionDocRef: string;
  moneda: 'PEN' | 'USD';
  tipoCambioCompra: number;
  tipoCambioVenta: number;
  glosaGeneral: string;
  estado: 'BORRADOR' | 'CONTABILIZADO' | 'ANULADO';
  cuo?: string;
  isPeriodoCerrado?: boolean;
  onSubdiarioChange: (val: string) => void;
  onNumeroVoucherChange: (val: string) => void;
  onFechaContableChange: (val: string) => void;
  onFechaEmisionDocRefChange: (val: string) => void;
  onMonedaChange: (val: 'PEN' | 'USD') => void;
  onActualizarTipoCambio: () => void;
  onGlosaGeneralChange: (val: string) => void;
  onNuevo: () => void;
  onGuardarBorrador: () => void;
  onContabilizar: () => void;
  onDuplicar?: () => void;
  onExtornar?: () => void;
  onAnular?: () => void;
  onImprimirVoucher?: () => void;
  onBuscar?: () => void;
  onSeleccionarPlantilla: (plantilla: PlantillaAsiento) => void;
  onAnteriorVoucher?: () => void;
  onSiguienteVoucher?: () => void;
  puedeContabilizar: boolean;
}

export const VoucherHeader: React.FC<VoucherHeaderProps> = ({
  empresaRazonSocial,
  empresaRuc,
  periodo,
  usuarioNombre,
  subdiario,
  subdiarioFijo,
  subdiarioNombre,
  numeroVoucher,
  fechaContable,
  fechaEmisionDocRef,
  moneda,
  tipoCambioCompra,
  tipoCambioVenta,
  glosaGeneral,
  estado,
  cuo,
  isPeriodoCerrado = false,
  onSubdiarioChange,
  onNumeroVoucherChange,
  onFechaContableChange,
  onFechaEmisionDocRefChange,
  onMonedaChange,
  onActualizarTipoCambio,
  onGlosaGeneralChange,
  onNuevo,
  onGuardarBorrador,
  onContabilizar,
  onDuplicar,
  onExtornar,
  onAnular,
  onImprimirVoucher,
  onBuscar,
  onSeleccionarPlantilla,
  onAnteriorVoucher,
  onSiguienteVoucher,
  puedeContabilizar,
}) => {
  const [dropdownPlantillasOpen, setDropdownPlantillasOpen] = useState(false);

  const subdiarioObj = SUBDIARIOS_SISTEMA.find((s: { codigo: string; descripcion: string }) => s.codigo === subdiario) || {
    codigo: subdiario,
    descripcion: 'SUBDIARIO',
  };

  const esContabilizado = estado === 'CONTABILIZADO';

  return (
    <div className="bg-slate-100 border border-slate-300 font-sans text-xs select-none">
      {/* 1. Barra de Título Superior de Escritorio */}
      <div className="bg-slate-900 text-white px-3 py-1 flex flex-wrap items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-3">
          <span className="font-bold text-amber-400 tracking-wider">
            [VOUCHER #{numeroVoucher || 'PROVISIONAL'}]
          </span>
          <span className="text-slate-300">
            {subdiarioObj.codigo} - {subdiarioObj.descripcion}
          </span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-200">PERÍODO: <strong>{periodo}</strong></span>
        </div>

        <div className="flex items-center gap-3">
          {/* Badge de Estado */}
          {estado === 'CONTABILIZADO' ? (
            <span className="bg-emerald-700 text-white font-bold px-2 py-0.5 text-[10px] tracking-wider border border-emerald-500 flex items-center gap-1">
              <Lock className="w-3 h-3" />
              CONTABILIZADO {cuo ? `[CUO: ${cuo}]` : ''}
            </span>
          ) : estado === 'ANULADO' ? (
            <span className="bg-rose-700 text-white font-bold px-2 py-0.5 text-[10px] tracking-wider border border-rose-500">
              ANULADO
            </span>
          ) : (
            <span className="bg-amber-600 text-white font-bold px-2 py-0.5 text-[10px] tracking-wider border border-amber-400">
              BORRADOR (PROVISIONAL)
            </span>
          )}

          <span className="text-slate-300 text-[11px]">
            Usuario: <strong>{usuarioNombre}</strong>
          </span>
        </div>
      </div>

      {/* 2. Barra de Herramientas de Escritorio con Atajos de Teclado */}
      <div className="bg-slate-200 border-b border-slate-300 px-2 py-1 flex items-center justify-between flex-wrap gap-1">
        <div className="flex items-center gap-1 flex-wrap">
          {/* F10 Nuevo */}
          <button
            onClick={onNuevo}
            className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-400 text-slate-800 font-bold text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs"
            title="Crear nuevo voucher contable (F10)"
          >
            <Plus className="w-3.5 h-3.5 text-blue-600" />
            <span>Nuevo <kbd className="text-[9px] bg-slate-100 px-1 border border-slate-300 text-slate-500">F10</kbd></span>
          </button>

          {/* Ctrl+S Guardar Borrador */}
          <button
            onClick={onGuardarBorrador}
            disabled={esContabilizado || isPeriodoCerrado}
            className="px-2.5 py-1 bg-white hover:bg-slate-50 disabled:opacity-40 border border-slate-400 text-slate-800 font-bold text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs"
            title="Guardar borrador en base de datos (Ctrl+S)"
          >
            <Save className="w-3.5 h-3.5 text-amber-600" />
            <span>Guardar <kbd className="text-[9px] bg-slate-100 px-1 border border-slate-300 text-slate-500">Ctrl+S</kbd></span>
          </button>

          {/* F8 Contabilizar */}
          <button
            onClick={onContabilizar}
            disabled={esContabilizado || isPeriodoCerrado || !puedeContabilizar}
            className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs"
            title="Validar partida doble y asentar con CUO inmutable (F8)"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Contabilizar <kbd className="text-[9px] bg-emerald-800 px-1 border border-emerald-600 text-emerald-200">F8</kbd></span>
          </button>

          <span className="text-slate-400 mx-1">|</span>

          {/* Duplicar */}
          {onDuplicar && (
            <button
              onClick={onDuplicar}
              className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-400 text-slate-700 text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs"
              title="Duplicar asiento en nuevo borrador"
            >
              <Copy className="w-3.5 h-3.5 text-slate-600" />
              <span>Duplicar</span>
            </button>
          )}

          {/* Extornar */}
          {onExtornar && esContabilizado && (
            <button
              onClick={onExtornar}
              className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-400 text-slate-700 text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs"
              title="Generar asiento de extorno inverso"
            >
              <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
              <span>Extornar</span>
            </button>
          )}

          {/* Anular */}
          {onAnular && esContabilizado && (
            <button
              onClick={onAnular}
              className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-400 text-rose-700 text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs"
              title="Anular asiento contabilizado (genera extorno formal)"
            >
              <Ban className="w-3.5 h-3.5 text-rose-600" />
              <span>Anular</span>
            </button>
          )}

          {/* Imprimir */}
          {onImprimirVoucher && (
            <button
              onClick={onImprimirVoucher}
              className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-400 text-slate-700 text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs"
              title="Imprimir comprobante de voucher en formato estándar"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Imprimir</span>
            </button>
          )}

          {/* Buscar */}
          {onBuscar && (
            <button
              onClick={onBuscar}
              className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-400 text-slate-700 text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs"
              title="Buscar vouchers registrados (F3)"
            >
              <Search className="w-3.5 h-3.5 text-slate-600" />
              <span>Buscar <kbd className="text-[9px] bg-slate-100 px-1 border border-slate-300 text-slate-500">F3</kbd></span>
            </button>
          )}

          {/* Desplegable de Plantillas */}
          <div className="relative inline-block text-left">
            <button
              onClick={() => setDropdownPlantillasOpen(!dropdownPlantillasOpen)}
              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Plantillas</span>
              <ChevronDown className="w-3 h-3 text-amber-700" />
            </button>

            {dropdownPlantillasOpen && (
              <div className="absolute left-0 mt-1 w-96 bg-white border border-slate-400 shadow-xl z-50 py-1 text-xs font-sans">
                <div className="px-3 py-1 bg-slate-100 border-b border-slate-200 font-bold text-[10px] text-slate-700 uppercase">
                  Plantillas Frecuentes de Asientos Contables
                </div>
                {PLANTILLAS_ASIENTOS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSeleccionarPlantilla(p);
                      setDropdownPlantillasOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-slate-100 last:border-b-0 cursor-pointer flex flex-col gap-0.5"
                  >
                    <div className="flex items-center justify-between font-bold text-slate-900 text-xs">
                      <span>{p.nombre}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-100 border border-slate-300 text-slate-700">
                        Subd: {p.subdiario}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>Inv: <strong>{p.metodoInventario}</strong></span>
                      <span className="text-amber-700 italic text-[9.5px]">
                        * {p.avisoNormativo}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Navegación de Vouchers Anterior / Siguiente */}
        <div className="flex items-center gap-1">
          {onAnteriorVoucher && (
            <button
              onClick={onAnteriorVoucher}
              className="p-1 bg-white hover:bg-slate-50 border border-slate-400 text-slate-700 cursor-pointer shadow-2xs"
              title="Voucher anterior"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}
          {onSiguienteVoucher && (
            <button
              onClick={onSiguienteVoucher}
              className="p-1 bg-white hover:bg-slate-50 border border-slate-400 text-slate-700 cursor-pointer shadow-2xs"
              title="Voucher siguiente"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 3. Formulario Compacto de Encabezado (2 a 3 filas de escritorio) */}
      <div className="p-2.5 bg-slate-50 border-b border-slate-300 grid grid-cols-12 gap-x-3 gap-y-2 text-xs">
        {/* Fila 1 */}
        {/* Subdiario */}
        <div className="col-span-12 sm:col-span-4 flex items-center gap-1.5">
          <label className="w-20 font-bold text-slate-700 shrink-0">Subdiario:</label>
          {subdiarioFijo ? (
            <div className="flex-1 bg-slate-200 border border-slate-400 px-2 py-0.5 text-slate-900 font-mono font-bold text-xs flex items-center gap-1">
              <span className="bg-slate-800 text-white px-1.5 py-0.2 rounded text-[10px]">{subdiario}</span>
              <span className="truncate">{subdiarioNombre || (subdiario === '10' ? 'Diario General' : subdiario === '08' ? 'Ajustes' : subdiario === '00' ? 'Apertura' : 'Subdiario Asignado')}</span>
            </div>
          ) : (
            <select
              value={subdiario}
              onChange={(e) => onSubdiarioChange(e.target.value)}
              disabled={esContabilizado}
              className="flex-1 bg-white border border-slate-400 px-2 py-0.5 text-slate-900 font-mono text-xs focus:outline-none focus:border-blue-600"
            >
              {SUBDIARIOS_SISTEMA.filter(s => ['00', '08', '09', '10', '11'].includes(s.codigo)).map((s: { codigo: string; descripcion: string }) => (
                <option key={s.codigo} value={s.codigo}>
                  {s.codigo} - {s.descripcion}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Número de Voucher */}
        <div className="col-span-6 sm:col-span-3 flex items-center gap-1.5">
          <label className="w-20 font-bold text-slate-700 shrink-0">Nº Voucher:</label>
          <input
            type="text"
            value={numeroVoucher}
            onChange={(e) => onNumeroVoucherChange(e.target.value)}
            disabled={esContabilizado}
            className="w-full bg-white border border-slate-400 px-2 py-0.5 text-slate-900 font-mono font-bold text-xs focus:outline-none focus:border-blue-600"
            placeholder="01090001"
          />
        </div>

        {/* Fecha Contable */}
        <div className="col-span-6 sm:col-span-3 flex items-center gap-1.5">
          <label className="w-20 font-bold text-slate-700 shrink-0">F. Contable:</label>
          <input
            type="date"
            value={fechaContable}
            onChange={(e) => onFechaContableChange(e.target.value)}
            disabled={esContabilizado}
            className="w-full bg-white border border-slate-400 px-2 py-0.5 text-slate-900 font-mono text-xs focus:outline-none focus:border-blue-600"
          />
        </div>

        {/* Moneda */}
        <div className="col-span-12 sm:col-span-2 flex items-center gap-1.5">
          <label className="w-16 font-bold text-slate-700 shrink-0">Moneda:</label>
          <select
            value={moneda}
            onChange={(e) => onMonedaChange(e.target.value as 'PEN' | 'USD')}
            disabled={esContabilizado}
            className="w-full bg-white border border-slate-400 px-2 py-0.5 text-slate-900 font-mono font-bold text-xs focus:outline-none focus:border-blue-600"
          >
            <option value="PEN">PEN (Soles)</option>
            <option value="USD">USD (Dólares)</option>
          </select>
        </div>

        {/* Fila 2 */}
        {/* Fecha Emisión Referencia */}
        <div className="col-span-12 sm:col-span-4 flex items-center gap-1.5">
          <label className="w-20 font-bold text-slate-700 shrink-0">F. Doc. Ref:</label>
          <input
            type="date"
            value={fechaEmisionDocRef}
            onChange={(e) => onFechaEmisionDocRefChange(e.target.value)}
            disabled={esContabilizado}
            className="w-full bg-white border border-slate-400 px-2 py-0.5 text-slate-900 font-mono text-xs focus:outline-none focus:border-blue-600"
          />
        </div>

        {/* Tipo de Cambio SBS */}
        <div className="col-span-12 sm:col-span-4 flex items-center gap-1.5">
          <label className="w-20 font-bold text-slate-700 shrink-0">T.C. SBS:</label>
          <div className="flex-1 flex items-center gap-1">
            <span className="text-[10px] text-slate-600">C:</span>
            <input
              type="text"
              readOnly
              value={tipoCambioCompra.toFixed(3)}
              className="w-14 bg-slate-100 border border-slate-300 px-1 py-0.5 text-slate-800 font-mono text-xs text-right"
            />
            <span className="text-[10px] text-slate-600">V:</span>
            <input
              type="text"
              readOnly
              value={tipoCambioVenta.toFixed(3)}
              className="w-14 bg-slate-100 border border-slate-300 px-1 py-0.5 text-slate-800 font-mono text-xs text-right font-bold"
            />
            <button
              onClick={onActualizarTipoCambio}
              disabled={esContabilizado}
              className="p-1 bg-white hover:bg-slate-50 border border-slate-400 text-slate-700 cursor-pointer shadow-2xs"
              title="Consultar tipo de cambio SBS oficial"
            >
              <RefreshCw className="w-3 h-3 text-blue-600" />
            </button>
          </div>
        </div>

        {/* Glosa General */}
        <div className="col-span-12 sm:col-span-12 flex items-center gap-1.5 pt-0.5">
          <label className="w-20 font-bold text-slate-700 shrink-0">Glosa General:</label>
          <input
            type="text"
            value={glosaGeneral}
            onChange={(e) => onGlosaGeneralChange(e.target.value)}
            disabled={esContabilizado}
            placeholder="Ingrese la descripción de la operación contable..."
            className="flex-1 bg-white border border-slate-400 px-2 py-1 text-slate-900 text-xs focus:outline-none focus:border-blue-600"
          />
        </div>
      </div>
    </div>
  );
};
