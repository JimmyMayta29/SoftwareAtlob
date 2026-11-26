import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Lock,
  RefreshCw,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import type {
  CuentaBancariaV2,
  HistorialCierreConciliacionV2,
} from '../../api/conciliacionV2Api';
import { useToast } from '../../context/ToastContext';
import {
  extraerMensajeErrorConciliacion,
  useHistorialCierresV2,
} from '../../hooks/useConciliacionV2';
import { ColumnaTablaDensa, TablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';
import { formatearMonedaExacta } from './conciliacionUtils';

export interface HistorialCierresModalProps {
  abierto: boolean;
  onCerrar: () => void;
  empresaId: string;
  cuenta: CuentaBancariaV2 | null;
  periodo: string;
}

function formatearFechaHora(iso: string): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return iso.slice(0, 19).replace('T', ' ');
  }
  const yyyy = fecha.getFullYear();
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  const hh = String(fecha.getHours()).padStart(2, '0');
  const mi = String(fecha.getMinutes()).padStart(2, '0');
  const ss = String(fecha.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

export const HistorialCierresModal: React.FC<HistorialCierresModalProps> = ({
  abierto,
  onCerrar,
  empresaId,
  cuenta,
  periodo,
}) => {
  const toast = useToast();
  const [soloPeriodoActual, setSoloPeriodoActual] = useState(true);
  const [hashCopiadoId, setHashCopiadoId] = useState<string | null>(null);
  const botonCerrarRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (abierto) {
      setHashCopiadoId(null);
      const timer = window.setTimeout(() => {
        botonCerrarRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [abierto]);

  const historialQuery = useHistorialCierresV2(
    empresaId,
    cuenta?.id ?? null,
    soloPeriodoActual ? periodo : undefined,
    abierto && Boolean(cuenta?.id)
  );

  const eventos = historialQuery.data ?? [];
  const moneda = cuenta?.moneda ?? 'PEN';

  const handleCopiarHash = async (evento: HistorialCierreConciliacionV2) => {
    const hash = evento.hashSnapshotSha256;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(hash);
      } else {
        const temp = document.createElement('textarea');
        temp.value = hash;
        temp.setAttribute('readonly', 'true');
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }
      setHashCopiadoId(evento.id);
      toast.success(
        `Hash SHA-256 del evento #${evento.numeroSecuencia} copiado al portapapeles.`,
        'Historial de Cierres'
      );
      window.setTimeout(() => {
        setHashCopiadoId((prev) => (prev === evento.id ? null : prev));
      }, 2000);
    } catch {
      toast.error(
        'No se pudo copiar automáticamente el hash SHA-256 al portapapeles.',
        'Portapapeles'
      );
    }
  };

  const columnas: ColumnaTablaDensa<HistorialCierreConciliacionV2>[] = [
    {
      key: 'numeroSecuencia',
      header: 'Sec.',
      width: '78px',
      align: 'center',
      render: (r) => (
        <div className="font-mono">
          <div className="font-bold text-[#1E3A5F]">#{r.numeroSecuencia}</div>
          <div className="text-[10px] text-[#4B5563]">{r.codigoPeriodo}</div>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Fecha / Hora',
      width: '140px',
      render: (r) => (
        <div className="font-mono text-[11px]">
          <div className="text-[#111827]">{formatearFechaHora(r.createdAt)}</div>
          <div className="text-[10px] text-[#4B5563]">Corte: {r.fechaCorte}</div>
        </div>
      ),
    },
    {
      key: 'tipoEvento',
      header: 'Evento',
      width: '115px',
      align: 'center',
      render: (r) => {
        const esCierre = r.tipoEvento === 'CIERRE';
        return (
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold border ${
              esCierre
                ? 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]'
                : 'bg-[#FEF3C7] text-[#B45309] border-[#B45309]'
            }`}
          >
            {esCierre ? (
              <Lock className="w-3 h-3" strokeWidth={1.75} />
            ) : (
              <Unlock className="w-3 h-3" strokeWidth={1.75} />
            )}
            {r.tipoEvento}
          </span>
        );
      },
    },
    {
      key: 'saldoFinalBanco',
      header: `Saldo Banco (${moneda})`,
      width: '125px',
      align: 'right',
      numeric: true,
      render: (r) => (
        <span className="font-mono text-[11px]">
          {r.saldoFinalBanco !== null
            ? formatearMonedaExacta(r.saldoFinalBanco, moneda)
            : 'Sin extracto'}
        </span>
      ),
    },
    {
      key: 'saldoLibros',
      header: `Saldo Libros (${moneda})`,
      width: '125px',
      align: 'right',
      numeric: true,
      render: (r) => (
        <span className="font-mono text-[11px] font-bold text-[#1E3A5F]">
          {formatearMonedaExacta(r.saldoLibros, moneda)}
        </span>
      ),
    },
    {
      key: 'diferencia',
      header: `Diferencia (${moneda})`,
      width: '115px',
      align: 'right',
      numeric: true,
      render: (r) => (
        <span className="font-mono text-[11px] font-bold">
          {formatearMonedaExacta(r.diferencia, moneda)}
        </span>
      ),
    },
    {
      key: 'motivo',
      header: 'Motivo',
      render: (r) =>
        r.motivo ? (
          <span className="text-[11px] text-[#111827] break-words">{r.motivo}</span>
        ) : (
          <span className="text-[11px] text-[#6B7280]">—</span>
        ),
    },
    {
      key: 'usuarioEmail',
      header: 'Usuario',
      width: '165px',
      render: (r) => (
        <span className="text-[11px] font-mono text-[#374151] break-all">
          {r.usuarioEmail ?? r.usuarioId ?? 'Sistema'}
        </span>
      ),
    },
    {
      key: 'hashSnapshotSha256',
      header: 'Hash Snapshot SHA-256',
      width: '215px',
      render: (r) => {
        const hash = r.hashSnapshotSha256 || '';
        const resumenHash =
          hash.length > 20 ? `${hash.slice(0, 12)}…${hash.slice(-8)}` : hash || '—';
        const copiado = hashCopiadoId === r.id;
        return (
          <div className="flex items-center justify-between gap-1.5">
            <code
              title={hash}
              className="font-mono text-[10px] text-[#111827] bg-[#F5F7FA] px-1.5 py-0.5 border border-[#D1D5DB] select-all"
            >
              {resumenHash}
            </code>
            {hash && (
              <button
                type="button"
                onClick={() => void handleCopiarHash(r)}
                aria-label={`Copiar hash SHA-256 de evento #${r.numeroSecuencia}`}
                title={`Copiar hash completo: ${hash}`}
                className={`h-6 px-1.5 text-[10px] border inline-flex items-center gap-1 shrink-0 cursor-pointer rounded-none focus-visible:outline-2 focus-visible:outline-[#1E3A5F] ${
                  copiado
                    ? 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42] font-bold'
                    : 'bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#1E3A5F] border-[#D1D5DB]'
                }`}
              >
                {copiado ? (
                  <>
                    <Check className="w-3 h-3" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <VentanaModal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Historial Inmutable de Cierres y Reaperturas"
      subtitulo={
        cuenta
          ? `${cuenta.banco} (${cuenta.moneda}) · N° ${cuenta.numero}`
          : 'Sin cuenta seleccionada'
      }
      ancho="2xl"
      footer={
        <button
          ref={botonCerrarRef}
          type="button"
          onClick={onCerrar}
          className="h-7 px-3 bg-[#1E3A5F] hover:bg-[#162C49] text-[#FFFFFF] border border-[#1E3A5F] text-[12px] font-bold cursor-pointer rounded-none focus-visible:outline-2 focus-visible:outline-[#1E3A5F] focus-visible:outline-offset-2"
        >
          Cerrar [Esc]
        </button>
      }
    >
      <div className="space-y-2.5">
        {/* Encabezado informativo y controles de filtro */}
        <div className="p-2 bg-[#F5F7FA] border border-[#D1D5DB] flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <div className="flex items-center gap-2 text-[#1E3A5F]">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>
              Registro inmutable de auditoría criptográfica (SHA-256) para eventos{' '}
              <strong>CIERRE</strong> y <strong>REAPERTURA</strong>.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#111827] cursor-pointer">
              <input
                type="checkbox"
                checked={soloPeriodoActual}
                onChange={(e) => setSoloPeriodoActual(e.target.checked)}
                className="accent-[#1E3A5F] focus-visible:outline-2 focus-visible:outline-[#1E3A5F]"
              />
              <span>Solo período {periodo}</span>
            </label>

            <span className="px-2 py-0.5 bg-[#FFFFFF] border border-[#D1D5DB] font-mono text-[11px] text-[#374151]">
              {eventos.length} evento(s)
            </span>

            <button
              type="button"
              onClick={() => void historialQuery.refetch()}
              disabled={!cuenta || historialQuery.isFetching}
              aria-label="Actualizar historial de cierres"
              className="h-6 px-2 bg-[#FFFFFF] hover:bg-[#E8ECF1] disabled:opacity-50 text-[#111827] border border-[#D1D5DB] text-[11px] inline-flex items-center gap-1 cursor-pointer rounded-none focus-visible:outline-2 focus-visible:outline-[#1E3A5F]"
            >
              <RefreshCw
                className={`w-3 h-3 ${historialQuery.isFetching ? 'animate-spin' : ''}`}
              />
              <span>Actualizar</span>
            </button>
          </div>
        </div>

        {/* Error explícito del servidor */}
        {historialQuery.error && (
          <div
            role="alert"
            className="p-2 bg-[#FEF2F2] border border-[#B91C1C] text-[#991B1B] text-[12px] flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {extraerMensajeErrorConciliacion(
                  historialQuery.error,
                  'No se pudo cargar el historial de cierres de conciliación.'
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void historialQuery.refetch()}
              className="h-6 px-2 bg-[#FFFFFF] hover:bg-[#FEE2E2] text-[#991B1B] border border-[#B91C1C] text-[11px] font-bold cursor-pointer rounded-none focus-visible:outline-2 focus-visible:outline-[#1E3A5F]"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Tabla densa inmutable */}
        <TablaDensa
          columnas={columnas}
          datos={eventos}
          rowKey={(r) => r.id}
          cargando={historialQuery.isLoading}
          mensajeError={
            historialQuery.error
              ? extraerMensajeErrorConciliacion(
                  historialQuery.error,
                  'Error consultando historial inmutable.'
                )
              : null
          }
          mensajeVacio={
            soloPeriodoActual
              ? `No existen cierres ni reaperturas registrados para el período ${periodo} en esta cuenta.`
              : 'No existen cierres ni reaperturas registrados para esta cuenta bancaria.'
          }
        />
      </div>
    </VentanaModal>
  );
};
