import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Calculator, 
  Search, 
  X,
  FileText,
  RefreshCw
} from 'lucide-react';
import { AsientoContable, EmpresaCliente } from '../../types';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { construirDefinicionLibroMayorEstandar } from '../../services/reports/formato_estandar/formatoEstandarEngine';
import { VisorReporteModal } from '../modals/VisorReporteModal';
import { reportesApi } from '../../api/reportesApi';
import { obtenerAccessToken } from '../../api/session';

interface LibroMayorViewProps {
  asientos: AsientoContable[];
  empresa: EmpresaCliente;
  periodo: string;
  persistente?: boolean;
}

interface MovimientoMayor {
  asientoId: string;
  numeroAsiento: string;
  fecha: string;
  glosa: string;
  debe: number;
  haber: number;
  referencia?: string;
}

export const LibroMayorView: React.FC<LibroMayorViewProps> = ({
  asientos,
  empresa,
  periodo,
  persistente
}) => {
  const { cruceNavegacion, limpiarCruceNavegacion, navegarCruzado } = useEmpresaPeriodo();
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState<string>('TODAS');
  const [filtroTexto, setFiltroTexto] = useState<string>('');
  const [acumuladoAlMes, setAcumuladoAlMes] = useState<boolean>(false);
  const [modalEstandarOpen, setModalEstandarOpen] = useState(false);

  const usarServidor = persistente ?? Boolean(obtenerAccessToken() && empresa?.id);

  const mayorQuery = useQuery({
    queryKey: ['reportes', empresa?.id, 'libro-mayor', periodo, acumuladoAlMes],
    queryFn: () => reportesApi.getLibroMayor(empresa.id, periodo, acumuladoAlMes),
    enabled: usarServidor && Boolean(empresa?.id),
    staleTime: 0
  });

  // Si viene de navegación cruzada con una cuenta específica
  useEffect(() => {
    if (cruceNavegacion?.filtroOReferencia) {
      setFiltroTexto(cruceNavegacion.filtroOReferencia);
    }
  }, [cruceNavegacion]);

  // Agrupar movimientos de asientos por cuenta contable (desde PostgreSQL o memoria)
  const mayorPorCuenta = useMemo(() => {
    if (usarServidor && mayorQuery.data?.cuentas) {
      return (mayorQuery.data.cuentas as any[]).map((c) => [
        String(c.codigoCuenta),
        {
          denominacion: c.nombreCuenta || `Cuenta ${c.codigoCuenta}`,
          movimientos: (c.movimientos || []).map((m: any) => ({
            asientoId: m.asientoId,
            numeroAsiento: m.asientoNumero,
            fecha: String(m.fecha || '').slice(0, 10),
            glosa: m.glosa || '',
            debe: Number(m.debe || 0),
            haber: Number(m.haber || 0),
            referencia: m.referencia
          }))
        }
      ] as [string, { denominacion: string; movimientos: MovimientoMayor[] }]);
    }

    const map = new Map<string, { denominacion: string; movimientos: MovimientoMayor[] }>();

    asientos.forEach((a) => {
      a.items.forEach((l) => {
        const codigo = l.codigoCuenta;
        if (!map.has(codigo)) {
          map.set(codigo, {
            denominacion: l.denominacionCuenta || `Cuenta ${codigo}`,
            movimientos: []
          });
        }
        map.get(codigo)!.movimientos.push({
          asientoId: a.id,
          numeroAsiento: a.numeroAsiento,
          fecha: a.fecha,
          glosa: l.glosa || a.glosaGeneral,
          debe: l.debe,
          haber: l.haber,
          referencia: a.comprobanteReferencia
        });
      });
    });

    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [usarServidor, mayorQuery.data, asientos]);

  const cuentasFiltradas = useMemo(() => {
    return mayorPorCuenta.filter(([codigo, data]) => {
      if (cuentaSeleccionada !== 'TODAS' && codigo !== cuentaSeleccionada) return false;
      if (filtroTexto) {
        const q = filtroTexto.toLowerCase();
        const coincideCodigo = codigo.toLowerCase().includes(q);
        const coincideDenom = data.denominacion.toLowerCase().includes(q);
        const coincideGlosa = data.movimientos.some(m => 
          m.glosa.toLowerCase().includes(q) || 
          m.numeroAsiento.toLowerCase().includes(q) ||
          (m.referencia && m.referencia.toLowerCase().includes(q))
        );
        return coincideCodigo || coincideDenom || coincideGlosa;
      }
      return true;
    });
  }, [mayorPorCuenta, cuentaSeleccionada, filtroTexto]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-blue-600" />
            Libro Mayor (PCGE SUNAT)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Movimientos centralizados por cuenta contable oficial del período {periodo}.
          </p>
        </div>

        {cruceNavegacion && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl text-xs text-blue-900 font-medium">
            <span>Filtro de Navegación Cruzada: <strong>{cruceNavegacion.filtroOReferencia}</strong></span>
            <button 
              onClick={() => {
                limpiarCruceNavegacion();
                setFiltroTexto('');
              }}
              className="text-blue-700 hover:text-blue-900 font-bold p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
            placeholder="Buscar por cuenta, denominación o glosa..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-800 placeholder-slate-400 text-xs font-medium"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setAcumuladoAlMes(false)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${!acumuladoAlMes ? 'bg-blue-600 text-white' : 'text-slate-600'}`}
            >
              Solo el mes
            </button>
            <button
              type="button"
              onClick={() => setAcumuladoAlMes(true)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${acumuladoAlMes ? 'bg-blue-600 text-white' : 'text-slate-600'}`}
            >
              Acumulado Ene–Mes
            </button>
          </div>
          {usarServidor && (
            <button
              type="button"
              onClick={() => void mayorQuery.refetch()}
              disabled={mayorQuery.isFetching}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${mayorQuery.isFetching ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
          )}
          <button
            onClick={() => setModalEstandarOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap"
            title="Vista previa e impresión / exportación del Libro Mayor"
          >
            <FileText className="w-4 h-4" />
            <span>Reporte</span>
          </button>
          <select
            value={cuentaSeleccionada}
            onChange={(e) => setCuentaSeleccionada(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium cursor-pointer"
          >
            <option value="TODAS">Todas las cuentas con movimientos ({mayorPorCuenta.length})</option>
            {mayorPorCuenta.map(([codigo, data]) => (
              <option key={codigo} value={codigo}>
                {codigo} — {data.denominacion}
              </option>
            ))}
          </select>
        </div>
      </div>

      {usarServidor && mayorQuery.isPending && (
        <div role="status" className="p-4 rounded-2xl border bg-blue-50 border-blue-200 text-blue-800 text-xs font-medium">
          Cargando Libro Mayor desde PostgreSQL…
        </div>
      )}
      {usarServidor && mayorQuery.isError && (
        <div role="alert" className="p-4 rounded-2xl border bg-rose-50 border-rose-300 text-rose-800 text-xs flex items-center justify-between gap-2">
          <span>Error al cargar el Libro Mayor: {(mayorQuery.error as any)?.message || 'Error de conexión'}</span>
          <button
            type="button"
            onClick={() => void mayorQuery.refetch()}
            className="px-3 py-1 rounded-lg bg-rose-600 text-white font-bold text-xs cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* List of Accounts */}
      <div className="space-y-4">
        {cuentasFiltradas.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-xs">
            No se encontraron movimientos de mayor para el filtro especificado.
          </div>
        ) : (
          cuentasFiltradas.map(([codigo, { denominacion, movimientos }]) => {
            const totalDebe = movimientos.reduce((a, m) => a + m.debe, 0);
            const totalHaber = movimientos.reduce((a, m) => a + m.haber, 0);
            const saldo = totalDebe - totalHaber;

            return (
              <div key={codigo} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                {/* Account Header */}
                <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-extrabold text-blue-700 text-sm bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {codigo}
                    </span>
                    <span className="font-extrabold text-slate-900 text-xs">
                      {denominacion}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono font-bold">
                    <span className="text-slate-600">Debe: S/ {totalDebe.toFixed(2)}</span>
                    <span className="text-slate-600">Haber: S/ {totalHaber.toFixed(2)}</span>
                    <span className={saldo >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                      Saldo: S/ {Math.abs(saldo).toFixed(2)} {saldo >= 0 ? '(Deudor)' : '(Acreedor)'}
                    </span>
                  </div>
                </div>

                {/* Table of Movements */}
                <table className="w-full text-xs text-left">
                  <thead className="bg-white text-slate-400 font-semibold border-b border-slate-100 text-[10px] uppercase">
                    <tr>
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2">Asiento</th>
                      <th className="px-4 py-2">Glosa de Operación</th>
                      <th className="px-4 py-2">Comprobante Ref.</th>
                      <th className="px-4 py-2 text-right">Debe</th>
                      <th className="px-4 py-2 text-right">Haber</th>
                      <th className="px-4 py-2 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {movimientos.map((m, idx) => (
                      <tr key={`${codigo}-${idx}`} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2 font-mono text-slate-500">{m.fecha}</td>
                        <td className="px-4 py-2 font-mono font-bold text-slate-800">{m.numeroAsiento}</td>
                        <td className="px-4 py-2 text-slate-700">{m.glosa}</td>
                        <td className="px-4 py-2 font-mono text-slate-500">{m.referencia || '—'}</td>
                        <td className="px-4 py-2 text-right font-mono font-bold text-slate-800">
                          {m.debe > 0 ? m.debe.toFixed(2) : '-'}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-bold text-slate-800">
                          {m.haber > 0 ? m.haber.toFixed(2) : '-'}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => navegarCruzado('diario', m.numeroAsiento)}
                            className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-700 text-[10px] font-bold transition cursor-pointer"
                            title="Ver en Libro Diario"
                          >
                            Ver Asiento →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })
        )}
      </div>
      {/* Modal de Vista Previa Formato Estándar */}
      {modalEstandarOpen && (
        <VisorReporteModal
          isOpen={modalEstandarOpen}
          onClose={() => setModalEstandarOpen(false)}
          definicion={construirDefinicionLibroMayorEstandar(
            empresa,
            usarServidor && mayorQuery.data ? mayorQuery.data : asientos,
            periodo
          )}
        />
      )}
    </div>
  );
};
