import React, { useState } from 'react';
import { 
  X, 
  Printer, 
  Download, 
  FileSpreadsheet, 
  FileText, 
  ChevronDown, 
  Check
} from 'lucide-react';
import { 
  EstandarReportDefinition,
  exportarReporteEstandarPdf,
  exportarReporteEstandarHojaCalculo,
  formatearImporteEstandar,
  formatearFechaHoraEmision24h
} from '../../services/reports/formato_estandar/formatoEstandarEngine';
import { useReportStyle } from '../../context/ReportStyleContext';

interface VisorReporteModalProps {
  isOpen: boolean;
  onClose: () => void;
  definicion: EstandarReportDefinition;
  onExportarLegacyPdf?: () => void;
}

export const VisorReporteModal: React.FC<VisorReporteModalProps> = ({
  isOpen,
  onClose,
  definicion,
  onExportarLegacyPdf
}) => {
  const { 
    reportStyle, 
    setReportStyle, 
    mostrarFechaHoraImpresion, 
    setMostrarFechaHoraImpresion 
  } = useReportStyle();

  const [dropdownExportarOpen, setDropdownExportarOpen] = useState(false);

  if (!isOpen) return null;

  const handleDescargarPdf = () => {
    const defActualizada: EstandarReportDefinition = {
      ...definicion,
      mostrarFechaHoraImpresion
    };
    exportarReporteEstandarPdf(defActualizada, reportStyle);
    setDropdownExportarOpen(false);
  };

  const handleDescargarHojaCalculo = () => {
    const defActualizada: EstandarReportDefinition = {
      ...definicion,
      mostrarFechaHoraImpresion
    };
    exportarReporteEstandarHojaCalculo(defActualizada);
    setDropdownExportarOpen(false);
  };

  const handlePrint = () => {
    setDropdownExportarOpen(false);
    window.print();
  };

  const tituloLimpio = definicion.titulo.replace(/\*/g, '').trim().toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[98vw] max-h-[96vh] flex flex-col border border-slate-300 overflow-hidden">
        {/* Barra Superior de Control (No imprimible) */}
        <div className="print:hidden flex flex-wrap items-center justify-between p-3.5 bg-slate-100 border-b border-slate-200 gap-3">
          <div className="flex items-center gap-3">
            <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
              reportStyle === 'actual' ? 'bg-[#1E3A5F] text-white' : 'bg-black text-white'
            }`}>
              {reportStyle === 'actual' ? 'Formato actual' : 'Formato estándar'}
            </span>
            <span className="text-xs font-bold text-slate-800 truncate max-w-md">
              {tituloLimpio} — {definicion.empresa.razonSocial}
            </span>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Conmutador Formato: Estándar (B/N) vs Actual (Color) */}
            <div className="flex items-center bg-white rounded-xl border border-slate-300 p-0.5 text-xs font-semibold shadow-xs">
              <span className="px-2 text-[11px] text-slate-500 font-bold uppercase">Formato:</span>
              <button
                onClick={() => setReportStyle('estandar')}
                className={`px-2.5 py-1 rounded-lg text-xs transition cursor-pointer font-bold ${
                  reportStyle === 'estandar'
                    ? 'bg-black text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Estándar (B/N)
              </button>
              <button
                onClick={() => setReportStyle('actual')}
                className={`px-2.5 py-1 rounded-lg text-xs transition cursor-pointer font-bold ${
                  reportStyle === 'actual'
                    ? 'bg-[#1E3A5F] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Actual (Color)
              </button>
            </div>

            {/* Checkbox Fecha y Hora */}
            <label className="flex items-center gap-1.5 px-2 py-1 bg-white rounded-xl border border-slate-300 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={mostrarFechaHoraImpresion}
                onChange={(e) => setMostrarFechaHoraImpresion(e.target.checked)}
                className="rounded text-black focus:ring-black"
              />
              <span className="text-[11px]">Fecha/Hora</span>
            </label>

            {/* Botón Único 'Exportar' con Menú Desplegable */}
            <div className="relative inline-block text-left">
              <div className="inline-flex rounded-xl shadow-xs">
                <button
                  onClick={handleDescargarPdf}
                  className={`px-3.5 py-1.5 text-white text-xs font-bold rounded-l-xl flex items-center gap-1.5 transition cursor-pointer ${
                    reportStyle === 'actual' ? 'bg-[#1E3A5F] hover:bg-[#152a45]' : 'bg-black hover:bg-slate-800'
                  }`}
                  title="Exportar a PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportar PDF</span>
                </button>
                <button
                  onClick={() => setDropdownExportarOpen(!dropdownExportarOpen)}
                  className={`px-2 py-1.5 text-white text-xs font-bold rounded-r-xl border-l border-white/20 transition cursor-pointer ${
                    reportStyle === 'actual' ? 'bg-[#1E3A5F] hover:bg-[#152a45]' : 'bg-black hover:bg-slate-800'
                  }`}
                  title="Más opciones de exportación"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {dropdownExportarOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 text-xs">
                  <button
                    onClick={handleDescargarPdf}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 cursor-pointer font-medium text-slate-800"
                  >
                    <FileText className="w-4 h-4 text-slate-600" />
                    <span>Documento PDF (.pdf)</span>
                  </button>

                  <button
                    onClick={handlePrint}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 cursor-pointer font-medium text-slate-800 border-t border-slate-100"
                  >
                    <Printer className="w-4 h-4 text-slate-600" />
                    <span>Imprimir (Ctrl+P)</span>
                  </button>

                  <button
                    onClick={handleDescargarHojaCalculo}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 cursor-pointer font-medium text-slate-800 border-t border-slate-100"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Hoja de cálculo (.xls)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Cerrar */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition cursor-pointer"
              title="Cerrar ventana"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Hoja Imprimible (A4 Landscape / Estándar B/N o Actual Color) */}
        <div className="flex-1 overflow-auto p-4 sm:p-8 bg-slate-200 print:bg-white print:p-0 print:m-0 flex justify-center">
          <div className="bg-white text-black w-full shadow-lg print:shadow-none p-6 sm:p-8 border border-slate-300 print:border-none font-sans font-light text-[10px] leading-tight select-text">
            
            {/* 1. Encabezado del reporte sin asteriscos */}
            <div className="flex justify-between items-start mb-3 pb-2 border-b border-black">
              {/* Izquierda */}
              <div className="space-y-0.5 text-left">
                <div className="font-normal text-xs text-black tracking-tight">
                  {definicion.empresa.razonSocial.toUpperCase()}
                </div>
                <div className="text-[10px]">
                  PERIODO {definicion.empresa.periodo}
                </div>
                <div className="text-[9px] text-slate-700">
                  {definicion.empresa.direccion}
                </div>
                <div className="text-[10px]">
                  R.U.C.: <span className="font-mono">{definicion.empresa.ruc}</span>
                </div>
              </div>

              {/* Centro: Título Centrado en Mayúsculas Sin Asteriscos */}
              <div className="text-center space-y-0.5">
                <h1 className="font-bold text-xs tracking-wider text-black">
                  {tituloLimpio}
                </h1>
                <div className="text-[10px] font-normal">
                  ({definicion.moneda.toUpperCase()})
                </div>
              </div>

              {/* Derecha (Fecha y hora opcional en 24h) */}
              <div className="text-right text-[9px] text-slate-600 space-y-0.5 min-w-[120px]">
                {mostrarFechaHoraImpresion && (
                  <div>
                    Emitido: {formatearFechaHoraEmision24h()}
                  </div>
                )}
              </div>
            </div>

            {/* 2. Tabla del reporte */}
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-left border-collapse font-light text-[9px] font-sans">
                {/* Cabecera */}
                <thead className={reportStyle === 'actual' ? 'bg-[#1E3A5F] text-white font-bold' : 'border-t-2 border-b-2 border-black font-normal text-black'}>
                  {/* Super Headers */}
                  {definicion.superHeaders && definicion.superHeaders.length > 0 && (
                    <tr className={reportStyle === 'actual' ? 'border-b border-[#2d5280] text-center' : 'border-b border-black font-normal text-center'}>
                      {definicion.superHeaders.map((sh, idx) => (
                        <th
                          key={idx}
                          colSpan={sh.colSpan}
                          className={`p-1 font-semibold ${reportStyle === 'actual' ? 'border-r border-[#2d5280] last:border-r-0' : 'border-r border-black last:border-r-0'}`}
                        >
                          {sh.label}
                        </th>
                      ))}
                    </tr>
                  )}

                  {/* Fila de Columnas */}
                  <tr className="font-semibold">
                    {definicion.columnas.map((col) => (
                      <th
                        key={col.id}
                        className={`p-1 ${reportStyle === 'actual' ? 'border-r border-[#2d5280] last:border-r-0' : 'border-r border-black last:border-r-0'} ${
                          col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                        }`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* Cuerpo de la tabla */}
                <tbody>
                  {definicion.grupos.map((grupo) => (
                    <React.Fragment key={grupo.grupoId}>
                      {/* Subtítulo de Grupo */}
                      <tr className="border-t border-black/40">
                        <td
                          colSpan={definicion.columnas.length}
                          className="pt-2 pb-1 font-bold text-black text-left"
                        >
                          {grupo.tituloGrupo}
                        </td>
                      </tr>

                      {/* Filas de datos del grupo */}
                      {grupo.filas.map((fila, fIdx) => (
                        <tr 
                          key={fIdx} 
                          className={reportStyle === 'actual' ? (fIdx % 2 === 1 ? 'bg-slate-50' : 'bg-white') : 'hover:bg-slate-50 print:hover:bg-white transition'}
                        >
                          {definicion.columnas.map((col) => {
                            const val = fila[col.id];
                            return (
                              <td
                                key={col.id}
                                className={`px-1 py-0.5 whitespace-nowrap ${
                                  col.align === 'right'
                                    ? 'text-right font-mono'
                                    : col.align === 'center'
                                    ? 'text-center'
                                    : 'text-left'
                                }`}
                              >
                                {col.isNumeric ? formatearImporteEstandar(val) : (val ?? '')}
                              </td>
                            );
                          })}
                        </tr>
                      ))}

                      {/* Fila TOTALES del grupo */}
                      <tr className="border-t border-b border-black font-bold">
                        {definicion.columnas.map((col, cIdx) => {
                          if (cIdx === 0) {
                            return (
                              <td key={col.id} className="px-1 py-1 text-left font-bold">
                                TOTALES:
                              </td>
                            );
                          }
                          if (col.isNumeric && col.sumar) {
                            return (
                              <td key={col.id} className="px-1 py-1 text-right font-mono font-bold">
                                {formatearImporteEstandar(grupo.totalesGrupo[col.id])}
                              </td>
                            );
                          }
                          return <td key={col.id} className="px-1 py-1" />;
                        })}
                      </tr>
                    </React.Fragment>
                  ))}

                  {/* Fila TOTAL GENERAL final */}
                  <tr className={`border-t border-black border-b-4 border-double border-black font-bold text-[9.5px] ${
                    reportStyle === 'actual' ? 'bg-slate-100' : ''
                  }`}>
                    {definicion.columnas.map((col, cIdx) => {
                      if (cIdx === 0) {
                        return (
                          <td key={col.id} className="px-1 py-1.5 text-left font-bold">
                            TOTAL GENERAL:
                          </td>
                        );
                      }
                      if (col.isNumeric && col.sumar) {
                        return (
                          <td key={col.id} className="px-1 py-1.5 text-right font-mono font-bold">
                            {formatearImporteEstandar(definicion.totalesGenerales[col.id])}
                          </td>
                        );
                      }
                      return <td key={col.id} className="px-1 py-1.5" />;
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 3. Pie de página centrado */}
            <div className="mt-6 text-center text-[9px] text-black">
              Pág. 1 de 1
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
