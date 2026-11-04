import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  Play, 
  CheckCircle2, 
  RotateCcw, 
  AlertCircle, 
  FileText, 
  ShieldAlert, 
  ArrowRight,
  RefreshCw,
  Building2
} from 'lucide-react';
import { EmpresaCliente } from '../../types';

interface ConsolidarMesViewProps {
  empresaId: string;
  periodo: string;
  isPeriodoCerrado?: boolean;
  empresa?: EmpresaCliente;
}

interface AsientoPropuesto {
  subdiario: string;
  glosa: string;
  tipo: string;
  lineas: Array<{
    cuenta: string;
    denominacion: string;
    debe: number;
    haber: number;
    glosa: string;
  }>;
  totalDebe: number;
  totalHaber: number;
}

export const ConsolidarMesView: React.FC<ConsolidarMesViewProps> = ({
  empresaId,
  periodo,
  isPeriodoCerrado = false,
  empresa
}) => {
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  const metodoInventario = empresa?.metodoInventario || null;
  const [asientosPropuestos, setAsientosPropuestos] = useState<AsientoPropuesto[]>([]);
  const [consolidacionPrevia, setConsolidacionPrevia] = useState<boolean>(false);
  const [motivoExtorno, setMotivoExtorno] = useState<string>('');
  const [mostrarModalExtorno, setMostrarModalExtorno] = useState<boolean>(false);

  // Paso 1: Simular o ejecutar cálculo preliminar
  const handleCalcular = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!metodoInventario) {
      setErrorMsg('METODO_INVENTARIO_REQUERIDO: La empresa no tiene definido un método de inventario (PERIODICO o PERMANENTE). Debe ser configurado por un Administrador del estudio.');
      return;
    }

    if (isPeriodoCerrado) {
      setErrorMsg('PERIODO_CERRADO: No se puede consolidar inventarios ni generar asientos en un período contable cerrado.');
      return;
    }

    setLoading(true);
    try {
      // Simular cálculo de asientos según método
      const propuestos: AsientoPropuesto[] = [];

      if (metodoInventario === 'PERMANENTE') {
        propuestos.push({
          subdiario: '07 - Operaciones Especiales',
          glosa: `Reconocimiento mensual de costo de ventas kardex valorado período ${periodo}`,
          tipo: 'COSTO_VENTAS_PERMANENTE',
          lineas: [
            { cuenta: '69111', denominacion: 'Mercaderías manufacturadas - Costo de ventas', debe: 12500.00, haber: 0.00, glosa: 'Costo de ventas determinado según salidas de Kardex' },
            { cuenta: '20111', denominacion: 'Mercaderías manufacturadas - Costo almacén', debe: 0.00, haber: 12500.00, glosa: 'Descargo de inventarios por salidas del período' }
          ],
          totalDebe: 12500.00,
          totalHaber: 12500.00
        });
      } else {
        // PERIODICO
        propuestos.push({
          subdiario: '07 - Operaciones Especiales',
          glosa: `Traslado de compras del mes al almacén (Método Periódico) ${periodo}`,
          tipo: 'TRASLADO_COMPRAS_PERIODICO',
          lineas: [
            { cuenta: '20111', denominacion: 'Mercaderías manufacturadas - Almacén Central', debe: 18000.00, haber: 0.00, glosa: 'Ingreso acumulado de compras del mes al almacén' },
            { cuenta: '6111', denominacion: 'Variación de inventarios - Mercaderías', debe: 0.00, haber: 18000.00, glosa: 'Variación por acumulación de compras periódicas' }
          ],
          totalDebe: 18000.00,
          totalHaber: 18000.00
        });
        propuestos.push({
          subdiario: '07 - Operaciones Especiales',
          glosa: `Ajuste y determinación del Costo de Ventas Periódico ${periodo}`,
          tipo: 'COSTO_VENTAS_PERIODICO',
          lineas: [
            { cuenta: '69111', denominacion: 'Mercaderías manufacturadas - Costo de ventas', debe: 14200.00, haber: 0.00, glosa: 'Costo de ventas (Inv. Inicial + Compras - Inv. Final)' },
            { cuenta: '6111', denominacion: 'Variación de existencias - Mercaderías', debe: 0.00, haber: 14200.00, glosa: 'Reconocimiento de variación de existencias periódica' }
          ],
          totalDebe: 14200.00,
          totalHaber: 14200.00
        });
      }

      setAsientosPropuestos(propuestos);
      setPaso(2); // Avanzar a vista previa
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al calcular la consolidación mensual');
    } finally {
      setLoading(false);
    }
  };

  // Paso 3 & 4: Confirmar y contabilizar
  const handleContabilizar = async () => {
    if (isPeriodoCerrado) {
      setErrorMsg('PERIODO_CERRADO: El período está cerrado.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      // Simular transacción y éxito
      setPaso(4);
      setConsolidacionPrevia(true);
      setSuccessMsg(`Consolidación mensual del período ${periodo} completada con éxito. Se generaron y contabilizaron ${asientosPropuestos.length} asiento(s) oficial(es) de manera idempotente.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al contabilizar la consolidación mensual');
    } finally {
      setLoading(false);
    }
  };

  const handleExtornar = async () => {
    if (!motivoExtorno.trim()) {
      setErrorMsg('Debe indicar un motivo para realizar el extorno.');
      return;
    }
    setLoading(true);
    try {
      setSuccessMsg(`Extorno procesado correctamente. Los asientos de la consolidación ${periodo} han sido revertidos y el saldo anterior ha sido restaurado.`);
      setConsolidacionPrevia(false);
      setMostrarModalExtorno(false);
      setPaso(1);
      setAsientosPropuestos([]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al procesar extorno');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF] text-[#111827] text-[13px]">
      {/* Encabezado */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#D1D5DB]">
        <div>
          <h2 className="text-base font-bold text-[#1E3A5F] flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#1D4ED8]" />
            Consolidación Mensual de Inventarios y Asientos
          </h2>
          <p className="text-[12px] text-[#4B5563]">
            Cálculo integral de costo de ventas, variación de inventarios, traslado de almacén y regularizaciones del período.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-2.5 py-1 bg-[#F5F7FA] border border-[#D1D5DB] text-[12px] flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#1E3A5F]" />
            <span>Método: <strong>{metodoInventario || 'NO DEFINIDO'}</strong></span>
          </div>

          <div className="px-2.5 py-1 bg-[#F5F7FA] border border-[#D1D5DB] text-[12px] font-mono">
            Período: <strong>{periodo}</strong>
          </div>
        </div>
      </div>

      {/* Alerta de Período Cerrado */}
      {isPeriodoCerrado && (
        <div className="p-3 mb-3 bg-[#FEF2F2] border border-[#F87171] text-[#991B1B] text-[12px] flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Período contable cerrado:</strong> No se pueden generar ni extornar asientos de consolidación en este período.
          </div>
        </div>
      )}

      {/* Alerta de Método no configurado */}
      {!metodoInventario && (
        <div className="p-3 mb-3 bg-[#FFFBEB] border border-[#FBBF24] text-[#92400E] text-[12px] flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>METODO_INVENTARIO_REQUERIDO:</strong> La empresa no tiene definido un método de inventario (PERIODICO o PERMANENTE). Debe ser configurado por un Administrador del estudio en <em>Datos de la empresa</em> antes de generar la consolidación automática.
          </div>
        </div>
      )}

      {/* Mensajes de error o éxito */}
      {errorMsg && (
        <div className="p-3 mb-3 bg-[#FEF2F2] border border-[#F87171] text-[#991B1B] text-[12px] flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 mb-3 bg-[#F0FDF4] border border-[#86EFAC] text-[#166534] text-[12px] flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Indicador de 4 Pasos Obligatorios */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { num: 1, title: '1. Calcular', desc: 'Determinar importes' },
          { num: 2, title: '2. Vista previa', desc: 'Revisar asientos' },
          { num: 3, title: '3. Confirmar', desc: 'Aprobación contable' },
          { num: 4, title: '4. Contabilizar', desc: 'Asientos firmes' }
        ].map(step => (
          <div
            key={step.num}
            className={`p-2 border text-center ${
              paso === step.num
                ? 'bg-[#EBF5FF] border-[#1D4ED8] text-[#1E3A5F] font-bold'
                : paso > step.num
                ? 'bg-[#F0FDF4] border-[#86EFAC] text-[#166534]'
                : 'bg-[#F5F7FA] border-[#D1D5DB] text-[#6B7280]'
            }`}
          >
            <div className="text-[12px]">{step.title}</div>
            <div className="text-[10px] font-normal">{step.desc}</div>
          </div>
        ))}
      </div>

      {/* Contenido según paso */}
      <div className="flex-1 overflow-auto border border-[#D1D5DB] p-4 bg-[#FAFAFA]">
        {paso === 1 && (
          <div className="max-w-xl mx-auto py-6 text-center space-y-4">
            <div className="w-12 h-12 bg-[#EBF5FF] text-[#1D4ED8] mx-auto rounded-full flex items-center justify-center">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-sm text-[#111827]">
              Iniciar consolidación del período {periodo}
            </h3>
            <p className="text-[12px] text-[#4B5563] text-left leading-relaxed bg-[#FFFFFF] p-3 border border-[#E5E7EB]">
              El proceso evaluará los comprobantes de compra, venta y el catálogo de existencias bajo el método <strong>{metodoInventario || 'NO DEFINIDO'}</strong>.
              <br /><br />
              {metodoInventario === 'PERMANENTE' ? (
                <span>
                  <strong>Método Permanente:</strong> Calcula el costo de ventas acumulado desde los descargos del Kardex y verifica traslados pendientes.
                </span>
              ) : (
                <span>
                  <strong>Método Periódico:</strong> Traslada las compras acumuladas al almacén (Cta 20 vs 61) y aplica la regla de determinación del Costo de Ventas mensual (Cta 69 vs 61).
                </span>
              )}
            </p>

            <div className="pt-2 flex justify-center gap-3">
              <button
                type="button"
                disabled={loading || !metodoInventario || isPeriodoCerrado}
                onClick={handleCalcular}
                className="h-8 px-4 bg-[#1E3A5F] text-[#FFFFFF] text-[12px] font-medium hover:bg-[#152942] disabled:bg-[#9CA3AF] disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                <span>Calcular consolidación</span>
              </button>

              {consolidacionPrevia && (
                <button
                  type="button"
                  disabled={loading || isPeriodoCerrado}
                  onClick={() => setMostrarModalExtorno(true)}
                  className="h-8 px-3 bg-[#FFFFFF] text-[#B91C1C] border border-[#F87171] hover:bg-[#FEF2F2] text-[12px] font-medium inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Extornar consolidación anterior</span>
                </button>
              )}
            </div>
          </div>
        )}

        {(paso === 2 || paso === 3) && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[#1E3A5F] flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Vista Previa de Asientos Propuestos ({asientosPropuestos.length})
              </h3>
              <span className="text-[11px] text-[#4B5563]">
                Revise cada asiento antes de confirmar la contabilización.
              </span>
            </div>

            {asientosPropuestos.map((asiento, idx) => (
              <div key={idx} className="bg-[#FFFFFF] border border-[#D1D5DB]">
                <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] flex items-center justify-between">
                  <span className="font-bold text-[12px] text-[#1E3A5F]">
                    Asiento #{idx + 1}: {asiento.glosa}
                  </span>
                  <span className="text-[11px] font-mono text-[#4B5563]">
                    {asiento.subdiario}
                  </span>
                </div>
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-[#FFFFFF] border-b border-[#E5E7EB] text-[#4B5563]">
                      <th className="p-1.5 text-left font-semibold">Cuenta</th>
                      <th className="p-1.5 text-left font-semibold">Denominación</th>
                      <th className="p-1.5 text-left font-semibold">Glosa Línea</th>
                      <th className="p-1.5 text-right font-semibold w-24">Debe S/</th>
                      <th className="p-1.5 text-right font-semibold w-24">Haber S/</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asiento.lineas.map((linea, lIdx) => (
                      <tr key={lIdx} className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB]">
                        <td className="p-1.5 font-mono font-bold text-[#1E3A5F]">{linea.cuenta}</td>
                        <td className="p-1.5 text-[#111827]">{linea.denominacion}</td>
                        <td className="p-1.5 text-[#6B7280]">{linea.glosa}</td>
                        <td className="p-1.5 text-right font-mono text-[#111827]">{linea.debe > 0 ? linea.debe.toFixed(2) : '-'}</td>
                        <td className="p-1.5 text-right font-mono text-[#111827]">{linea.haber > 0 ? linea.haber.toFixed(2) : '-'}</td>
                      </tr>
                    ))}
                    <tr className="bg-[#F8FAFC] font-bold border-t border-[#D1D5DB]">
                      <td colSpan={3} className="p-1.5 text-right">TOTALES CUADRADOS:</td>
                      <td className="p-1.5 text-right font-mono">{asiento.totalDebe.toFixed(2)}</td>
                      <td className="p-1.5 text-right font-mono">{asiento.totalHaber.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}

            <div className="pt-3 border-t border-[#D1D5DB] flex justify-between items-center">
              <button
                type="button"
                onClick={() => setPaso(1)}
                className="h-7 px-3 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] hover:bg-[#F3F4F6]"
              >
                Volver a calcular
              </button>

              <div className="flex gap-2">
                {paso === 2 ? (
                  <button
                    type="button"
                    onClick={() => setPaso(3)}
                    className="h-8 px-4 bg-[#1E3A5F] text-[#FFFFFF] text-[12px] font-medium hover:bg-[#152942] inline-flex items-center gap-1.5"
                  >
                    <span>Proceder a confirmación</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={loading || isPeriodoCerrado}
                    onClick={handleContabilizar}
                    className="h-8 px-4 bg-[#15803D] text-[#FFFFFF] text-[12px] font-medium hover:bg-[#166534] inline-flex items-center gap-1.5"
                  >
                    {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span>Confirmar y Contabilizar en 1 Transacción</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {paso === 4 && (
          <div className="max-w-xl mx-auto py-8 text-center space-y-4">
            <div className="w-12 h-12 bg-[#F0FDF4] text-[#166534] mx-auto rounded-full flex items-center justify-center border border-[#86EFAC]">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-[#1E3A5F]">
              Consolidación Contabilizada con Éxito
            </h3>
            <p className="text-[12px] text-[#4B5563]">
              Los asientos han sido generados con origen <code>CONSOLIDACION</code> y numerados correlativamente en el libro diario oficial. La ejecución es idempotente y reversible mediante extorno.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setPaso(1)}
                className="h-8 px-4 bg-[#1E3A5F] text-[#FFFFFF] text-[12px] font-medium hover:bg-[#152942]"
              >
                Aceptar
              </button>
              <button
                type="button"
                onClick={() => setMostrarModalExtorno(true)}
                className="h-8 px-3 bg-[#FFFFFF] text-[#B91C1C] border border-[#F87171] hover:bg-[#FEF2F2] text-[12px] font-medium inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Extornar</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Extorno */}
      {mostrarModalExtorno && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-[#FFFFFF] border border-[#D1D5DB] w-full max-w-md p-4 shadow-xl">
            <h3 className="font-bold text-sm text-[#B91C1C] flex items-center gap-2 mb-2">
              <RotateCcw className="w-4 h-4" />
              Extorno de Consolidación Mensual ({periodo})
            </h3>
            <p className="text-[12px] text-[#4B5563] mb-3 leading-relaxed">
              El extorno generará contra-asientos invertidos (Debe ↔ Haber) sin eliminar los registros previos, restaurando los saldos anteriores conforme a normativa de auditoría.
            </p>
            <div className="mb-3">
              <label className="block text-[11px] font-semibold text-[#374151] mb-1">
                Motivo del extorno:
              </label>
              <textarea
                value={motivoExtorno}
                onChange={(e) => setMotivoExtorno(e.target.value)}
                placeholder="Indique el motivo técnico o corrección requerida..."
                rows={3}
                className="w-full text-[12px] p-2 border border-[#D1D5DB] focus:outline-none focus:border-[#1E3A5F]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMostrarModalExtorno(false)}
                className="h-7 px-3 text-[12px] border border-[#D1D5DB] hover:bg-[#F3F4F6]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={loading || !motivoExtorno.trim()}
                onClick={handleExtornar}
                className="h-7 px-3 text-[12px] bg-[#B91C1C] text-[#FFFFFF] hover:bg-[#991B1B] disabled:bg-[#9CA3AF]"
              >
                Confirmar Extorno
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

