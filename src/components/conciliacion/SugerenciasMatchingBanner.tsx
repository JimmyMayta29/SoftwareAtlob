import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Sparkles,
  X,
} from 'lucide-react';
import type { GrupoConciliacionV2 } from '../../api/conciliacionV2Api';
import { aCentavos, formatearMonedaExacta } from './conciliacionUtils';

export interface SugerenciasMatchingBannerProps {
  sugerencias: GrupoConciliacionV2[];
  moneda: string;
  abierto: boolean;
  onToggleAbierto: () => void;
  operacionesBloqueadas: boolean;
  motivoBloqueo?: string;
  aceptando: boolean;
  rechazandoId: string | null;
  onAceptarGrupos: (grupoIds: string[]) => Promise<void>;
  onRechazarGrupo: (grupoId: string, motivo?: string | null) => Promise<void>;
}

function formatearScore(score: number): string {
  const porcentaje = score <= 1 ? Math.round(score * 100) : Math.round(score);
  return `${Math.max(0, Math.min(100, porcentaje))}%`;
}

function claseBadgeScore(score: number): string {
  const pct = score <= 1 ? score * 100 : score;
  if (pct >= 90) return 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]';
  if (pct >= 75) return 'bg-[#EFF6FF] text-[#1E3A5F] border-[#1E3A5F]';
  return 'bg-[#FEF3C7] text-[#B45309] border-[#B45309]';
}

export const SugerenciasMatchingBanner: React.FC<SugerenciasMatchingBannerProps> = ({
  sugerencias,
  moneda,
  abierto,
  onToggleAbierto,
  operacionesBloqueadas,
  motivoBloqueo,
  aceptando,
  rechazandoId,
  onAceptarGrupos,
  onRechazarGrupo,
}) => {
  const [seleccionados, setSeleccionados] = useState<string[]>([]);

  useEffect(() => {
    const vigentes = new Set(sugerencias.map((s) => s.id));
    setSeleccionados((prev) => prev.filter((id) => vigentes.has(id)));
  }, [sugerencias]);

  const todosSeleccionados = useMemo(
    () => sugerencias.length > 0 && seleccionados.length === sugerencias.length,
    [sugerencias.length, seleccionados.length]
  );

  if (sugerencias.length === 0 && !abierto) {
    return null;
  }

  const toggleSeleccion = (id: string) => {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleTodos = () => {
    if (todosSeleccionados) {
      setSeleccionados([]);
    } else {
      setSeleccionados(sugerencias.map((s) => s.id));
    }
  };

  const handleAceptarSeleccionadas = async () => {
    if (seleccionados.length === 0 || operacionesBloqueadas || aceptando) return;
    await onAceptarGrupos(seleccionados);
  };

  const handleAceptarTodas = async () => {
    if (sugerencias.length === 0 || operacionesBloqueadas || aceptando) return;
    await onAceptarGrupos(sugerencias.map((s) => s.id));
  };

  return (
    <div className="mx-3 mt-2 border border-[#1E3A5F] bg-[#FFFFFF]">
      {/* Cabecera colapsable de la bandeja */}
      <div className="px-3 py-1.5 bg-[#EFF6FF] border-b border-[#D1D5DB] flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-[#1E3A5F] shrink-0" strokeWidth={1.5} />
          <span className="font-bold text-[#1E3A5F]">
            Bandeja de Sugerencias de Matching
          </span>
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#1E3A5F] text-[#FFFFFF] font-mono">
            {sugerencias.length} pendiente{sugerencias.length === 1 ? '' : 's'}
          </span>
          {seleccionados.length > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#FFFFFF] text-[#1E3A5F] border border-[#1E3A5F]">
              {seleccionados.length} seleccionada{seleccionados.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {sugerencias.length > 0 && (
            <>
              {seleccionados.length > 0 && (
                <button
                  type="button"
                  disabled={operacionesBloqueadas || aceptando || Boolean(rechazandoId)}
                  onClick={() => void handleAceptarSeleccionadas()}
                  title={operacionesBloqueadas ? motivoBloqueo : 'Aceptar sugerencias seleccionadas'}
                  className="h-6 px-2.5 bg-[#1E6F42] hover:bg-[#165532] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-[#FFFFFF] border border-[#1E6F42] disabled:border-[#D1D5DB] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed rounded-none"
                >
                  <Check className="w-3 h-3" />
                  <span>
                    Aceptar seleccionadas ({seleccionados.length})
                  </span>
                </button>
              )}

              <button
                type="button"
                disabled={operacionesBloqueadas || aceptando || Boolean(rechazandoId)}
                onClick={() => void handleAceptarTodas()}
                title={
                  operacionesBloqueadas
                    ? motivoBloqueo
                    : 'Aceptar todas las sugerencias mostradas'
                }
                className="h-6 px-2.5 bg-[#1E3A5F] hover:bg-[#162C49] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-[#FFFFFF] border border-[#1E3A5F] disabled:border-[#D1D5DB] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed rounded-none"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>
                  {aceptando
                    ? 'Aceptando...'
                    : `Aceptar todas (${sugerencias.length})`}
                </span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onToggleAbierto}
            className="h-6 px-2 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border border-[#D1D5DB] text-[11px] inline-flex items-center gap-1 cursor-pointer rounded-none"
          >
            {abierto ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Ocultar</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Ver bandeja</span>
              </>
            )}
          </button>
        </div>
      </div>

      {abierto && (
        <div className="max-h-72 overflow-y-auto">
          {sugerencias.length === 0 ? (
            <div className="p-3 text-center text-[12px] text-[#4B5563]">
              No hay sugerencias de matching pendientes de revisión en este período.
            </div>
          ) : (
            <table className="tabla-densa">
              <thead>
                <tr>
                  <th className="w-8 text-center">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todas las sugerencias"
                      checked={todosSeleccionados}
                      disabled={operacionesBloqueadas || aceptando}
                      onChange={toggleTodos}
                      className="w-3.5 h-3.5 accent-[#1E3A5F] cursor-pointer"
                    />
                  </th>
                  <th className="w-28 text-left">Match / Score</th>
                  <th className="w-48 text-left">Capa y Regla Aplicada</th>
                  <th className="text-left">Partida(s) Extracto Banco</th>
                  <th className="text-left">Partida(s) Libros</th>
                  <th className="w-24 text-right tabular-nums">Diferencia</th>
                  <th className="w-40 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sugerencias.map((g, idx) => {
                  const difCentavos = aCentavos(g.diferenciaMonto);
                  const enProceso = aceptando || rechazandoId === g.id;
                  return (
                    <tr
                      key={g.id}
                      className={idx % 2 === 0 ? 'bg-[#FFFFFF]' : 'bg-[#F5F7FA]'}
                    >
                      <td className="text-center">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar sugerencia ${g.id}`}
                          checked={seleccionados.includes(g.id)}
                          disabled={operacionesBloqueadas || enProceso}
                          onChange={() => toggleSeleccion(g.id)}
                          className="w-3.5 h-3.5 accent-[#1E3A5F] cursor-pointer"
                        />
                      </td>
                      <td>
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="px-1.5 py-0.5 text-[10px] font-bold font-mono bg-[#F5F7FA] text-[#1E3A5F] border border-[#D1D5DB]">
                            {g.tipoMatch}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-bold font-mono border ${claseBadgeScore(
                              g.score
                            )}`}
                          >
                            {formatearScore(g.score)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="text-[11px] font-bold text-[#111827]">
                          Capa {g.capaMatching}
                        </div>
                        <div className="text-[10px] text-[#4B5563] truncate max-w-[180px]" title={g.reglaAplicada}>
                          {g.reglaAplicada}
                        </div>
                      </td>
                      <td>
                        <div className="space-y-1">
                          {g.itemsBanco.map((item) => (
                            <div key={item.id} className="text-[11px] leading-tight">
                              <span className="font-mono text-[#4B5563]">
                                {item.fecha ?? '—'}
                              </span>{' '}
                              {item.referencia && (
                                <span className="font-mono text-[#1E3A5F]">
                                  [{item.referencia}]
                                </span>
                              )}{' '}
                              <span className="text-[#111827]">
                                {item.descripcion ?? 'Línea de extracto'}
                              </span>{' '}
                              <span className="font-mono font-bold text-[#111827]">
                                ({formatearMonedaExacta(item.montoImputado, moneda)})
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="space-y-1">
                          {g.itemsLibro.map((item) => (
                            <div key={item.id} className="text-[11px] leading-tight">
                              <span className="font-mono text-[#4B5563]">
                                {item.fecha ?? '—'}
                              </span>{' '}
                              {item.origenLibro === 'ASIENTO_MANUAL' && (
                                <span className="inline-block px-1 py-0 text-[9px] font-bold bg-[#EFF6FF] text-[#1E3A5F] border border-[#1E3A5F] mr-1">
                                  Asiento Manual 104x
                                </span>
                              )}
                              {item.referencia && (
                                <span className="font-mono text-[#1E3A5F]">
                                  [{item.referencia}]
                                </span>
                              )}{' '}
                              <span className="text-[#111827]">
                                {item.descripcion ?? 'Partida en libros'}
                              </span>{' '}
                              <span className="font-mono font-bold text-[#111827]">
                                ({formatearMonedaExacta(item.montoImputado, moneda)})
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="text-right tabular-nums">
                        <span
                          className={`font-mono font-bold ${
                            difCentavos === 0 ? 'text-[#1E6F42]' : 'text-[#B45309]'
                          }`}
                        >
                          {formatearMonedaExacta(g.diferenciaMonto, moneda)}
                        </span>
                      </td>
                      <td className="text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={operacionesBloqueadas || enProceso}
                            onClick={() => void onAceptarGrupos([g.id])}
                            title={
                              operacionesBloqueadas ? motivoBloqueo : 'Aceptar sugerencia'
                            }
                            className="h-6 px-2 bg-[#1E6F42] hover:bg-[#165532] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-[#FFFFFF] border border-[#1E6F42] disabled:border-[#D1D5DB] text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed rounded-none"
                          >
                            <Check className="w-3 h-3" />
                            <span>Aceptar</span>
                          </button>
                          <button
                            type="button"
                            disabled={operacionesBloqueadas || enProceso}
                            onClick={() => void onRechazarGrupo(g.id, null)}
                            title={
                              operacionesBloqueadas ? motivoBloqueo : 'Rechazar sugerencia'
                            }
                            className="h-6 px-2 bg-[#FFFFFF] hover:bg-[#FEF2F2] disabled:bg-[#F5F7FA] text-[#B91C1C] disabled:text-[#9CA3AF] border border-[#D1D5DB] text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed rounded-none"
                          >
                            <X className="w-3 h-3" />
                            <span>{rechazandoId === g.id ? '...' : 'Rechazar'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
