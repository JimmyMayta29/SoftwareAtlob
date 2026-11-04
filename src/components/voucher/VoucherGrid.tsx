import React, { useRef, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { CuentaPCGE, buscarCuentaPCGE } from '../../data/pcgeAccounts';
import { TABLA_10_TIPO_COMPROBANTE } from '../../data/sunatCatalogos';

export interface FilaVoucherGrid {
  linea: number;
  codigoCuenta: string;
  denominacion: string;
  cuentaId?: string;
  permiteMovimiento?: boolean;
  requiereAnexo?: boolean;
  requiereDocumento?: boolean;
  requiereCentroCosto?: boolean;
  requiereVencimiento?: boolean;
  centroCosto: string;
  anexoTipoDoc: string;
  anexoNumDoc: string;
  anexoNombre: string;
  tipoComprobante: string;
  serieComprobante: string;
  numeroComprobante: string;
  fechaEmisionDoc: string;
  fechaVencimientoDoc: string;
  glosaLinea: string;
  debe: number;
  haber: number;
  debeUsd: number;
  haberUsd: number;
  cuo?: string;
}

interface VoucherGridProps {
  filas: FilaVoucherGrid[];
  moneda: 'PEN' | 'USD';
  tipoCambioVenta: number;
  readOnly?: boolean;
  activeCell: { rowIndex: number; colKey: string } | null;
  onActiveCellChange: (cell: { rowIndex: number; colKey: string } | null) => void;
  onFilaChange: (rowIndex: number, campo: keyof FilaVoucherGrid, valor: any) => void;
  onEliminarFila: (rowIndex: number) => void;
  onAgregarFila: () => void;
  onOpenF2Catalogo: (rowIndex: number) => void;
  erroresValidacionPorFila: Record<number, Record<string, string>>;
}

export const VoucherGrid: React.FC<VoucherGridProps> = ({
  filas,
  moneda,
  tipoCambioVenta,
  readOnly = false,
  activeCell,
  onActiveCellChange,
  onFilaChange,
  onEliminarFila,
  onAgregarFila,
  onOpenF2Catalogo,
  erroresValidacionPorFila,
}) => {
  const inputsRef = useRef<Map<string, HTMLInputElement | HTMLSelectElement>>(new Map());

  const setInputRef = (key: string, el: HTMLInputElement | HTMLSelectElement | null) => {
    if (el) inputsRef.current.set(key, el);
    else inputsRef.current.delete(key);
  };

  const focusCell = (rowIndex: number, colKey: string) => {
    onActiveCellChange({ rowIndex, colKey });
    const key = `${rowIndex}_${colKey}`;
    const el = inputsRef.current.get(key);
    if (el) {
      el.focus();
      if ('select' in el && typeof el.select === 'function') {
        el.select();
      }
    }
  };

  const columnasOrdenadas: Array<{ key: keyof FilaVoucherGrid; label: string; width: string; align: 'left' | 'center' | 'right' }> = [
    { key: 'linea', label: 'Nº', width: '32px', align: 'center' },
    { key: 'codigoCuenta', label: 'Cuenta PCGE', width: '90px', align: 'left' },
    { key: 'denominacion', label: 'Denominación de la Cuenta', width: '220px', align: 'left' },
    { key: 'centroCosto', label: 'C.Costo', width: '70px', align: 'center' },
    { key: 'anexoNumDoc', label: 'Anexo (RUC/DNI)', width: '100px', align: 'left' },
    { key: 'tipoComprobante', label: 'T/D', width: '45px', align: 'center' },
    { key: 'serieComprobante', label: 'Serie', width: '55px', align: 'center' },
    { key: 'numeroComprobante', label: 'Número', width: '85px', align: 'left' },
    { key: 'fechaEmisionDoc', label: 'F. Emisión', width: '85px', align: 'center' },
    { key: 'fechaVencimientoDoc', label: 'F. Venc.', width: '85px', align: 'center' },
    { key: 'glosaLinea', label: 'Glosa de la Línea', width: '190px', align: 'left' },
    { key: 'debe', label: 'Debe S/', width: '85px', align: 'right' },
    { key: 'haber', label: 'Haber S/', width: '85px', align: 'right' },
    { key: 'debeUsd', label: 'Debe US$', width: '80px', align: 'right' },
    { key: 'haberUsd', label: 'Haber US$', width: '80px', align: 'right' },
    { key: 'cuo', label: 'CUO', width: '75px', align: 'center' },
  ];

  const editableCols: Array<keyof FilaVoucherGrid> = [
    'codigoCuenta',
    'centroCosto',
    'anexoNumDoc',
    'tipoComprobante',
    'serieComprobante',
    'numeroComprobante',
    'fechaEmisionDoc',
    'fechaVencimientoDoc',
    'glosaLinea',
    'debe',
    'haber',
  ];

  const handleKeyDown = (e: React.KeyboardEvent, rowIndex: number, colKey: keyof FilaVoucherGrid) => {
    if (readOnly) return;

    if (e.key === 'F2' && colKey === 'codigoCuenta') {
      e.preventDefault();
      onOpenF2Catalogo(rowIndex);
      return;
    }

    const colIdx = editableCols.indexOf(colKey);

    if (e.key === 'Tab') {
      // Tab navegación
      if (!e.shiftKey) {
        if (colIdx < editableCols.length - 1) {
          e.preventDefault();
          focusCell(rowIndex, editableCols[colIdx + 1]);
        } else if (rowIndex < filas.length - 1) {
          e.preventDefault();
          focusCell(rowIndex + 1, editableCols[0]);
        } else {
          // Última celda de última fila: agregar fila
          e.preventDefault();
          onAgregarFila();
          setTimeout(() => focusCell(rowIndex + 1, editableCols[0]), 30);
        }
      } else {
        // Shift+Tab retroceso
        if (colIdx > 0) {
          e.preventDefault();
          focusCell(rowIndex, editableCols[colIdx - 1]);
        } else if (rowIndex > 0) {
          e.preventDefault();
          focusCell(rowIndex - 1, editableCols[editableCols.length - 1]);
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (colIdx < editableCols.length - 1) {
        focusCell(rowIndex, editableCols[colIdx + 1]);
      } else if (rowIndex < filas.length - 1) {
        focusCell(rowIndex + 1, editableCols[0]);
      } else {
        // Enter en última celda: agregar fila
        onAgregarFila();
        setTimeout(() => focusCell(rowIndex + 1, editableCols[0]), 30);
      }
    } else if (e.key === 'ArrowDown') {
      if (rowIndex < filas.length - 1) {
        e.preventDefault();
        focusCell(rowIndex + 1, colKey);
      }
    } else if (e.key === 'ArrowUp') {
      if (rowIndex > 0) {
        e.preventDefault();
        focusCell(rowIndex - 1, colKey);
      }
    }
  };

  const handleCuentaBlur = (rowIndex: number, codigo: string) => {
    const cuenta = buscarCuentaPCGE(codigo);
    if (cuenta) {
      onFilaChange(rowIndex, 'denominacion', cuenta.denominacion);
      onFilaChange(rowIndex, 'permiteMovimiento', cuenta.permiteMovimiento);
      onFilaChange(rowIndex, 'requiereAnexo', cuenta.requiereAnexo);
      onFilaChange(rowIndex, 'requiereDocumento', cuenta.requiereDocumento);
      onFilaChange(rowIndex, 'requiereCentroCosto', cuenta.requiereCentroCosto);
      onFilaChange(rowIndex, 'requiereVencimiento', cuenta.requiereVencimiento);
    }
  };

  const handleImporteChange = (rowIndex: number, campo: 'debe' | 'haber', valStr: string) => {
    const num = parseFloat(valStr) || 0;
    onFilaChange(rowIndex, campo, num);

    // Calcular conversión USD automática
    const tc = tipoCambioVenta > 0 ? tipoCambioVenta : 3.75;
    if (moneda === 'PEN') {
      const usdVal = Math.round((num / tc) * 100) / 100;
      onFilaChange(rowIndex, campo === 'debe' ? 'debeUsd' : 'haberUsd', usdVal);
    } else {
      const penVal = Math.round(num * tc * 100) / 100;
      onFilaChange(rowIndex, campo === 'debe' ? 'debe' : 'haber', penVal);
    }

    // Si se llena Debe, vaciar Haber y viceversa
    if (num > 0) {
      const otro = campo === 'debe' ? 'haber' : 'debe';
      onFilaChange(rowIndex, otro, 0);
      onFilaChange(rowIndex, otro === 'haber' ? 'haberUsd' : 'debeUsd', 0);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-300 border border-slate-400 select-none">
      <table className="w-full border-collapse font-mono text-[11px] bg-white">
        {/* Cabecera de Cuadrícula de Escritorio */}
        <thead className="bg-slate-200 sticky top-0 z-10 border-b border-slate-400 font-bold text-slate-800 shadow-2xs">
          <tr className="h-6">
            {columnasOrdenadas.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width, minWidth: col.width }}
                className={`px-1 py-0.5 border-r border-slate-300 text-[10px] font-sans uppercase font-bold truncate ${
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                }`}
              >
                {col.label}
              </th>
            ))}
            {!readOnly && (
              <th style={{ width: '28px', minWidth: '28px' }} className="px-1 py-0.5 text-center text-[10px] font-sans">
                Acc
              </th>
            )}
          </tr>
        </thead>

        {/* Cuerpo de Filas de Cuadrícula (Alta Densidad: 22-24px) */}
        <tbody>
          {filas.map((fila, rIdx) => {
            const erroresFila = erroresValidacionPorFila[rIdx] || {};
            const tieneErrorCuenta = !!erroresFila.codigoCuenta;
            const tieneErrorAnexo = !!erroresFila.anexoNumDoc;
            const tieneErrorDoc = !!erroresFila.numeroComprobante || !!erroresFila.tipoComprobante;
            const tieneErrorCosto = !!erroresFila.centroCosto;

            return (
              <tr
                key={fila.linea || rIdx}
                className={`h-[23px] hover:bg-blue-50/50 border-b border-slate-200 ${
                  rIdx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'
                }`}
              >
                {/* 1. Nº Línea */}
                <td className="text-center font-bold text-slate-500 border-r border-slate-200 bg-slate-100/80 px-1 py-0">
                  {fila.linea}
                </td>

                {/* 2. Cuenta PCGE (F2 abre catálogo) */}
                <td className={`border-r border-slate-200 p-0 relative ${tieneErrorCuenta ? 'bg-red-50' : ''}`}>
                  <input
                    ref={(el) => setInputRef(`${rIdx}_codigoCuenta`, el)}
                    type="text"
                    value={fila.codigoCuenta}
                    onChange={(e) => onFilaChange(rIdx, 'codigoCuenta', e.target.value.trim())}
                    onBlur={(e) => handleCuentaBlur(rIdx, e.target.value.trim())}
                    onKeyDown={(e) => handleKeyDown(e, rIdx, 'codigoCuenta')}
                    onFocus={() => onActiveCellChange({ rowIndex: rIdx, colKey: 'codigoCuenta' })}
                    disabled={readOnly}
                    title={tieneErrorCuenta ? erroresFila.codigoCuenta : 'Presione [F2] para abrir el catálogo PCGE'}
                    placeholder="F2: PCGE"
                    className={`w-full h-[22px] px-1 text-slate-900 font-bold tracking-wider text-[11px] focus:outline-none focus:bg-amber-50 ${
                      tieneErrorCuenta ? 'border border-red-600 bg-red-100 text-red-900 font-extrabold' : 'border-0'
                    }`}
                  />
                </td>

                {/* 3. Denominación (Solo lectura) */}
                <td className="px-1.5 py-0 border-r border-slate-200 text-slate-700 font-sans text-[11px] truncate select-text">
                  {fila.denominacion || <span className="text-slate-300 italic">Nombre cuenta</span>}
                </td>

                {/* 4. Centro de Costo */}
                <td className={`border-r border-slate-200 p-0 ${tieneErrorCosto ? 'bg-red-50' : ''}`}>
                  <input
                    ref={(el) => setInputRef(`${rIdx}_centroCosto`, el)}
                    type="text"
                    value={fila.centroCosto}
                    onChange={(e) => onFilaChange(rIdx, 'centroCosto', e.target.value.toUpperCase())}
                    onKeyDown={(e) => handleKeyDown(e, rIdx, 'centroCosto')}
                    onFocus={() => onActiveCellChange({ rowIndex: rIdx, colKey: 'centroCosto' })}
                    disabled={readOnly || !fila.requiereCentroCosto}
                    placeholder={fila.requiereCentroCosto ? 'REQ' : '-'}
                    className={`w-full h-[22px] px-1 text-center text-slate-800 text-[10px] focus:outline-none focus:bg-amber-50 ${
                      tieneErrorCosto ? 'border border-red-600 bg-red-100 text-red-900' : 'border-0'
                    } ${!fila.requiereCentroCosto ? 'bg-slate-100/50 text-slate-400' : ''}`}
                  />
                </td>

                {/* 5. Anexo / Auxiliar */}
                <td className={`border-r border-slate-200 p-0 ${tieneErrorAnexo ? 'bg-red-50' : ''}`}>
                  <input
                    ref={(el) => setInputRef(`${rIdx}_anexoNumDoc`, el)}
                    type="text"
                    value={fila.anexoNumDoc}
                    onChange={(e) => onFilaChange(rIdx, 'anexoNumDoc', e.target.value.trim())}
                    onKeyDown={(e) => handleKeyDown(e, rIdx, 'anexoNumDoc')}
                    onFocus={() => onActiveCellChange({ rowIndex: rIdx, colKey: 'anexoNumDoc' })}
                    disabled={readOnly}
                    placeholder={fila.requiereAnexo ? 'RUC/DNI *' : ''}
                    title={tieneErrorAnexo ? erroresFila.anexoNumDoc : (fila.anexoNombre || 'RUC o DNI')}
                    className={`w-full h-[22px] px-1 text-slate-800 text-[10px] focus:outline-none focus:bg-amber-50 ${
                      tieneErrorAnexo ? 'border border-red-600 bg-red-100 text-red-900 font-bold' : 'border-0'
                    }`}
                  />
                </td>

                {/* 6. Tipo Comprobante (Catálogo 10) */}
                <td className={`border-r border-slate-200 p-0 ${tieneErrorDoc ? 'bg-red-50' : ''}`}>
                  <select
                    ref={(el) => setInputRef(`${rIdx}_tipoComprobante`, el)}
                    value={fila.tipoComprobante || '01'}
                    onChange={(e) => onFilaChange(rIdx, 'tipoComprobante', e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, rIdx, 'tipoComprobante')}
                    onFocus={() => onActiveCellChange({ rowIndex: rIdx, colKey: 'tipoComprobante' })}
                    disabled={readOnly}
                    className="w-full h-[22px] text-center text-slate-800 text-[10px] font-mono border-0 focus:outline-none focus:bg-amber-50 bg-transparent"
                  >
                    <option value="">--</option>
                    {TABLA_10_TIPO_COMPROBANTE.slice(0, 15).map((t) => (
                      <option key={t.codigo} value={t.codigo}>
                        {t.codigo}
                      </option>
                    ))}
                  </select>
                </td>

                {/* 7. Serie */}
                <td className="border-r border-slate-200 p-0">
                  <input
                    ref={(el) => setInputRef(`${rIdx}_serieComprobante`, el)}
                    type="text"
                    value={fila.serieComprobante}
                    onChange={(e) => onFilaChange(rIdx, 'serieComprobante', e.target.value.toUpperCase())}
                    onKeyDown={(e) => handleKeyDown(e, rIdx, 'serieComprobante')}
                    onFocus={() => onActiveCellChange({ rowIndex: rIdx, colKey: 'serieComprobante' })}
                    disabled={readOnly}
                    placeholder="F001"
                    className="w-full h-[22px] px-1 text-center text-slate-800 text-[10px] border-0 focus:outline-none focus:bg-amber-50"
                  />
                </td>

                {/* 8. Número */}
                <td className={`border-r border-slate-200 p-0 ${tieneErrorDoc ? 'bg-red-50' : ''}`}>
                  <input
                    ref={(el) => setInputRef(`${rIdx}_numeroComprobante`, el)}
                    type="text"
                    value={fila.numeroComprobante}
                    onChange={(e) => onFilaChange(rIdx, 'numeroComprobante', e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, rIdx, 'numeroComprobante')}
                    onFocus={() => onActiveCellChange({ rowIndex: rIdx, colKey: 'numeroComprobante' })}
                    disabled={readOnly}
                    placeholder="0001234"
                    className={`w-full h-[22px] px-1 text-slate-800 text-[10px] focus:outline-none focus:bg-amber-50 ${
                      tieneErrorDoc ? 'border border-red-600 bg-red-100 text-red-900' : 'border-0'
                    }`}
                  />
                </td>

                {/* 9. Fecha Emisión */}
                <td className="border-r border-slate-200 p-0">
                  <input
                    ref={(el) => setInputRef(`${rIdx}_fechaEmisionDoc`, el)}
                    type="date"
                    value={fila.fechaEmisionDoc}
                    onChange={(e) => onFilaChange(rIdx, 'fechaEmisionDoc', e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, rIdx, 'fechaEmisionDoc')}
                    onFocus={() => onActiveCellChange({ rowIndex: rIdx, colKey: 'fechaEmisionDoc' })}
                    disabled={readOnly}
                    className="w-full h-[22px] px-0.5 text-center text-slate-800 text-[10px] border-0 focus:outline-none focus:bg-amber-50"
                  />
                </td>

                {/* 10. Fecha Vencimiento */}
                <td className="border-r border-slate-200 p-0">
                  <input
                    ref={(el) => setInputRef(`${rIdx}_fechaVencimientoDoc`, el)}
                    type="date"
                    value={fila.fechaVencimientoDoc}
                    onChange={(e) => onFilaChange(rIdx, 'fechaVencimientoDoc', e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, rIdx, 'fechaVencimientoDoc')}
                    onFocus={() => onActiveCellChange({ rowIndex: rIdx, colKey: 'fechaVencimientoDoc' })}
                    disabled={readOnly}
                    className="w-full h-[22px] px-0.5 text-center text-slate-800 text-[10px] border-0 focus:outline-none focus:bg-amber-50"
                  />
                </td>

                {/* 11. Glosa Línea */}
                <td className="border-r border-slate-200 p-0">
                  <input
                    ref={(el) => setInputRef(`${rIdx}_glosaLinea`, el)}
                    type="text"
                    value={fila.glosaLinea}
                    onChange={(e) => onFilaChange(rIdx, 'glosaLinea', e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, rIdx, 'glosaLinea')}
                    onFocus={() => onActiveCellChange({ rowIndex: rIdx, colKey: 'glosaLinea' })}
                    disabled={readOnly}
                    className="w-full h-[22px] px-1 text-slate-800 font-sans text-[10px] border-0 focus:outline-none focus:bg-amber-50"
                  />
                </td>

                {/* 12. Debe S/ */}
                <td className="border-r border-slate-200 p-0">
                  <input
                    ref={(el) => setInputRef(`${rIdx}_debe`, el)}
                    type="number"
                    step="0.01"
                    value={fila.debe > 0 ? fila.debe : ''}
                    onChange={(e) => handleImporteChange(rIdx, 'debe', e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, rIdx, 'debe')}
                    onFocus={() => onActiveCellChange({ rowIndex: rIdx, colKey: 'debe' })}
                    disabled={readOnly}
                    placeholder="0.00"
                    className="w-full h-[22px] px-1 text-right text-slate-900 font-bold font-mono text-[11px] border-0 focus:outline-none focus:bg-amber-50"
                  />
                </td>

                {/* 13. Haber S/ */}
                <td className="border-r border-slate-200 p-0">
                  <input
                    ref={(el) => setInputRef(`${rIdx}_haber`, el)}
                    type="number"
                    step="0.01"
                    value={fila.haber > 0 ? fila.haber : ''}
                    onChange={(e) => handleImporteChange(rIdx, 'haber', e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, rIdx, 'haber')}
                    onFocus={() => onActiveCellChange({ rowIndex: rIdx, colKey: 'haber' })}
                    disabled={readOnly}
                    placeholder="0.00"
                    className="w-full h-[22px] px-1 text-right text-slate-900 font-bold font-mono text-[11px] border-0 focus:outline-none focus:bg-amber-50"
                  />
                </td>

                {/* 14. Debe USD (solo lectura) */}
                <td className="px-1 py-0 border-r border-slate-200 text-right text-slate-500 font-mono text-[10px] select-text">
                  {fila.debeUsd > 0 ? fila.debeUsd.toFixed(2) : '-'}
                </td>

                {/* 15. Haber USD (solo lectura) */}
                <td className="px-1 py-0 border-r border-slate-200 text-right text-slate-500 font-mono text-[10px] select-text">
                  {fila.haberUsd > 0 ? fila.haberUsd.toFixed(2) : '-'}
                </td>

                {/* 16. CUO */}
                <td className="px-1 py-0 text-center text-slate-400 font-mono text-[10px] select-text truncate">
                  {fila.cuo || '-'}
                </td>

                {/* Acción eliminar fila */}
                {!readOnly && (
                  <td className="p-0 text-center">
                    <button
                      onClick={() => onEliminarFila(rIdx)}
                      disabled={filas.length <= 2}
                      className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-20 cursor-pointer"
                      title="Eliminar línea del voucher"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

