import React, { useState } from 'react';
import {
  ShieldCheck,
  Search,
  RefreshCw,
  Eye,
  Database,
  FileCode2,
  Link2,
  Copy,
  Check,
  X,
} from 'lucide-react';
import { useAuditoriaList } from '../../hooks/useAsientos';
import type { FiltroOrigenAuditoria, RegistroAuditoriaDto } from '../../api/asientosApi';

interface AuditoriaViewProps {
  empresaId: string;
}

const OPCIONES_ORIGEN: { value: FiltroOrigenAuditoria; label: string }[] = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'ENCADENADA', label: 'Encadenada SHA-256' },
  { value: 'OPERATIVA', label: 'Operativa' },
];

function esOrigenEncadenado(registro: RegistroAuditoriaDto): boolean {
  if (registro.origen === 'ENCADENADA') return true;
  if (registro.origen === 'OPERATIVA') return false;
  return Boolean(registro.hashActual);
}

function formatearFechaHora(valor?: string): string {
  if (!valor) return '—';
  return String(valor).replace('T', ' ').substring(0, 19);
}

export const AuditoriaView: React.FC<AuditoriaViewProps> = ({ empresaId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroOrigen, setFiltroOrigen] = useState<FiltroOrigenAuditoria>('TODOS');
  const [selectedRecord, setSelectedRecord] = useState<RegistroAuditoriaDto | null>(null);
  const [copiedHash, setCopiedHash] = useState<'actual' | 'anterior' | null>(null);

  const { data: registros = [], isLoading, refetch } = useAuditoriaList(empresaId, filtroOrigen);

  const filtrados = registros.filter((r) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      (r.tablaAfectada || '').toLowerCase().includes(term) ||
      (r.accion || '').toLowerCase().includes(term) ||
      (r.usuarioEmail || '').toLowerCase().includes(term) ||
      (r.registroId || '').toLowerCase().includes(term) ||
      (r.hashActual || '').toLowerCase().includes(term)
    );
  });

  const handleCopyHash = async (tipo: 'actual' | 'anterior', valor: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(valor);
        setCopiedHash(tipo);
        setTimeout(() => {
          setCopiedHash((prev) => (prev === tipo ? null : prev));
        }, 1800);
      }
    } catch {
      // Clipboard no disponible en el contexto actual
    }
  };

  const abrirDetalle = (registro: RegistroAuditoriaDto) => {
    setCopiedHash(null);
    setSelectedRecord(registro);
  };

  const cerrarDetalle = () => {
    setCopiedHash(null);
    setSelectedRecord(null);
  };

  const selectedEsEncadenado = selectedRecord ? esOrigenEncadenado(selectedRecord) : false;
  const tieneIntegridadSha256 = Boolean(
    selectedRecord && (selectedRecord.hashActual || selectedRecord.hashAnterior)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" aria-hidden="true" />
            Libro de Auditoría Inmutable & Seguridad
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Trazabilidad dual: eventos operativos y cadena criptográfica SHA-256 con quién, cuándo, tabla, acción e IP.
          </p>
        </div>

        <button
          type="button"
          onClick={() => refetch()}
          aria-label="Actualizar eventos de auditoría"
          className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Actualizar Eventos
        </button>
      </div>

      {/* Filter */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <div className="relative min-w-[260px] flex-1 max-w-md">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Filtrar por tabla, acción, usuario o hash..."
              aria-label="Buscar eventos de auditoría por tabla, acción, usuario o hash"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div
            role="group"
            aria-label="Filtrar por origen de auditoría"
            className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-xl gap-1"
          >
            {OPCIONES_ORIGEN.map((opcion) => {
              const activo = filtroOrigen === opcion.value;
              return (
                <button
                  key={opcion.value}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => setFiltroOrigen(opcion.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    activo
                      ? 'bg-[#1E3A5F] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                  }`}
                >
                  {opcion.value === 'ENCADENADA' && (
                    <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  {opcion.value === 'OPERATIVA' && (
                    <Database className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  {opcion.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="text-xs text-slate-500 shrink-0">
          Registros mostrados: <strong className="text-slate-900">{filtrados.length}</strong>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px]">
            <tr>
              <th className="py-3 px-4">Fecha y Hora</th>
              <th className="py-3 px-4">Origen</th>
              <th className="py-3 px-4">Usuario</th>
              <th className="py-3 px-4">Tabla Afectada</th>
              <th className="py-3 px-3 text-center">Acción</th>
              <th className="py-3 px-3 font-mono">IP Origen</th>
              <th className="py-3 px-4 text-center">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  Cargando eventos de auditoría...
                </td>
              </tr>
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No hay registros de auditoría que coincidan con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              filtrados.map((r) => {
                const encadenado = esOrigenEncadenado(r);
                return (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {formatearFechaHora(r.createdAt)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {encadenado ? (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200"
                          title="Registro sellado en cadena criptográfica SHA-256"
                        >
                          <Link2 className="w-3 h-3 text-indigo-600" aria-hidden="true" />
                          Encadenada SHA-256
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200"
                          title="Registro operativo estándar"
                        >
                          <Database className="w-3 h-3 text-slate-500" aria-hidden="true" />
                          Operativa
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {r.usuarioEmail || r.usuarioId || 'Sistema'}
                    </td>
                    <td className="py-3 px-4 font-mono text-blue-900 font-bold">
                      {r.tablaAfectada}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          r.accion === 'INSERT'
                            ? 'bg-emerald-100 text-emerald-800'
                            : r.accion === 'UPDATE'
                              ? 'bg-blue-100 text-blue-800'
                              : r.accion === 'ANULAR'
                                ? 'bg-rose-100 text-rose-800'
                                : r.accion === 'CIERRE_PERIODO'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {r.accion}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-500">
                      {r.direccionIp || '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => abrirDetalle(r)}
                        aria-label={`Ver detalle de auditoría para ${r.tablaAfectada} (${r.accion})`}
                        className="p-1 rounded-lg text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                        title="Ver comparación de datos e integridad"
                      >
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Detalle JSON */}
      {selectedRecord && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="auditoria-modal-titulo"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 space-y-4 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="space-y-1">
                <h3
                  id="auditoria-modal-titulo"
                  className="font-bold text-slate-900 text-sm flex items-center gap-2 flex-wrap"
                >
                  <FileCode2 className="w-4 h-4 text-blue-600" aria-hidden="true" />
                  <span>
                    Auditoría: {selectedRecord.tablaAfectada} ({selectedRecord.accion})
                  </span>
                  {selectedEsEncadenado ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                      <Link2 className="w-3 h-3 text-indigo-600" aria-hidden="true" />
                      Encadenada SHA-256
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      <Database className="w-3 h-3 text-slate-500" aria-hidden="true" />
                      Operativa
                    </span>
                  )}
                </h3>
                <p className="font-mono text-[11px] text-slate-500">
                  {formatearFechaHora(selectedRecord.createdAt)} · Registro: {selectedRecord.registroId || '—'}
                </p>
              </div>

              <button
                type="button"
                onClick={cerrarDetalle}
                aria-label="Cerrar detalle de auditoría"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {tieneIntegridadSha256 && (
              <section
                aria-label="Integridad criptográfica SHA-256"
                className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" aria-hidden="true" />
                    <span>Integridad Criptográfica SHA-256</span>
                  </div>
                  <span className="text-[11px] font-medium text-indigo-800">
                    Origen encadenado verificado en libro inmutable
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-indigo-900 text-[11px]">
                        Hash Actual (SHA-256):
                      </span>
                      {selectedRecord.hashActual && (
                        <button
                          type="button"
                          onClick={() => handleCopyHash('actual', selectedRecord.hashActual!)}
                          aria-label="Copiar hash actual SHA-256"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-100/70 transition cursor-pointer"
                        >
                          {copiedHash === 'actual' ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                              Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" aria-hidden="true" />
                              Copiar
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <code className="block w-full p-2 rounded-lg bg-white border border-indigo-200/80 font-mono text-[11px] text-slate-800 break-all select-all">
                      {selectedRecord.hashActual || '—'}
                    </code>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-indigo-900 text-[11px]">
                        Hash Anterior (SHA-256):
                      </span>
                      {selectedRecord.hashAnterior && (
                        <button
                          type="button"
                          onClick={() => handleCopyHash('anterior', selectedRecord.hashAnterior!)}
                          aria-label="Copiar hash anterior SHA-256"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-100/70 transition cursor-pointer"
                        >
                          {copiedHash === 'anterior' ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                              Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" aria-hidden="true" />
                              Copiar
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <code className="block w-full p-2 rounded-lg bg-white border border-indigo-200/80 font-mono text-[11px] text-slate-700 break-all select-all">
                      {selectedRecord.hashAnterior || 'Génesis (primer eslabón de la cadena)'}
                    </code>
                  </div>
                </div>
              </section>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="font-bold text-slate-700 block mb-1">Datos Previos:</span>
                <pre className="p-3 bg-slate-50 rounded-xl border border-slate-200 font-mono text-[11px] overflow-auto max-h-56">
                  {selectedRecord.datosAnteriores
                    ? JSON.stringify(selectedRecord.datosAnteriores, null, 2)
                    : '(Ninguno)'}
                </pre>
              </div>
              <div>
                <span className="font-bold text-slate-700 block mb-1">Datos Nuevos:</span>
                <pre className="p-3 bg-slate-50 rounded-xl border border-slate-200 font-mono text-[11px] overflow-auto max-h-56">
                  {selectedRecord.datosNuevos
                    ? JSON.stringify(selectedRecord.datosNuevos, null, 2)
                    : '(Ninguno)'}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={cerrarDetalle}
                className="px-4 py-2 bg-[#1E3A5F] text-white font-bold text-xs rounded-xl hover:bg-[#162d4a] transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
