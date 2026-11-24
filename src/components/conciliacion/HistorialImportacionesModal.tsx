import React, { useEffect, useState } from 'react';
import Decimal from 'decimal.js';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import type {
  CuentaBancariaV2,
  ImportacionExtractoResumenV2,
} from '../../api/conciliacionV2Api';
import {
  extraerMensajeErrorConciliacion,
  useHistorialImportacionesV2,
  useRevertirImportacionV2,
} from '../../hooks/useConciliacionV2';
import { ColumnaTablaDensa, TablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';

export interface HistorialImportacionesModalProps {
  abierto: boolean;
  onCerrar: () => void;
  empresaId: string;
  cuenta: CuentaBancariaV2 | null;
  puedeRevertir: boolean;
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

export const HistorialImportacionesModal: React.FC<HistorialImportacionesModalProps> = ({
  abierto,
  onCerrar,
  empresaId,
  cuenta,
  puedeRevertir,
}) => {
  const historialQuery = useHistorialImportacionesV2(
    empresaId,
    cuenta?.id ?? null,
    abierto && Boolean(cuenta?.id)
  );
  const revertirMutation = useRevertirImportacionV2(empresaId);

  const [loteARevertir, setLoteARevertir] = useState<ImportacionExtractoResumenV2 | null>(null);
  const [motivoReversion, setMotivoReversion] = useState('');
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) {
      setLoteARevertir(null);
      setMotivoReversion('');
      setErrorMotivo(null);
    }
  }, [abierto]);

  const moneda = cuenta?.moneda ?? 'PEN';

  const handleConfirmarReversion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loteARevertir || !puedeRevertir) return;

    const motivo = motivoReversion.trim();
    if (motivo.length < 5) {
      setErrorMotivo('El motivo de reversión debe tener al menos 5 caracteres.');
      return;
    }

    setErrorMotivo(null);
    try {
      await revertirMutation.mutateAsync({
        importId: loteARevertir.id,
        payload: { motivo },
      });
      setLoteARevertir(null);
      setMotivoReversion('');
    } catch {
      // Notificado vía toast
    }
  };

  const columnas: ColumnaTablaDensa<ImportacionExtractoResumenV2>[] = [
    {
      key: 'createdAt',
      header: 'Fecha Carga',
      width: '130px',
      render: (r) => (
        <span className="font-mono text-[11px]">
          {r.createdAt.slice(0, 16).replace('T', ' ')}
        </span>
      ),
    },
    {
      key: 'nombreArchivo',
      header: 'Archivo / Perfil',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{r.nombreArchivo}</div>
          {r.bancoPerfilCodigo && (
            <div className="text-[10px] font-mono text-[#4B5563]">
              Perfil: {r.bancoPerfilCodigo}
            </div>
          )}
          {r.estado === 'REVERTIDO' && r.motivoReversion && (
            <div className="text-[10px] text-[#B91C1C] truncate">
              Motivo rev.: {r.motivoReversion}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'formatoArchivo',
      header: 'Formato',
      width: '72px',
      align: 'center',
      render: (r) => <span className="font-mono">{r.formatoArchivo}</span>,
    },
    {
      key: 'periodo',
      header: 'Periodo',
      width: '105px',
      render: (r) => (
        <span className="font-mono text-[11px]">
          {r.periodo || `${r.fechaDesde} / ${r.fechaHasta}`}
        </span>
      ),
    },
    {
      key: 'conteos',
      header: 'Nuevas / Dupl.',
      width: '105px',
      align: 'center',
      render: (r) => (
        <span className="font-mono text-[11px]">
          <strong className="text-[#1E6F42]">{r.filasNuevas}</strong> /{' '}
          <span className="text-[#B45309]">{r.filasDuplicadas}</span>
        </span>
      ),
    },
    {
      key: 'saldos',
      header: `Saldo Inicial → Final (${moneda})`,
      width: '195px',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-[11px]">
          {formatearDecimal(r.saldoInicial, moneda)} → {formatearDecimal(r.saldoFinal, moneda)}
        </span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      width: '90px',
      align: 'center',
      render: (r) => (
        <span
          className={`inline-block px-1.5 py-0.5 text-[10px] font-bold border ${
            r.estado === 'ACTIVO'
              ? 'bg-[#ECFDF5] text-[#1E6F42] border-[#1E6F42]'
              : 'bg-[#FEF2F2] text-[#B91C1C] border-[#B91C1C]'
          }`}
        >
          {r.estado}
        </span>
      ),
    },
    {
      key: 'acciones',
      header: 'Acción',
      width: '95px',
      align: 'center',
      render: (r) =>
        r.estado === 'ACTIVO' ? (
          <button
            type="button"
            disabled={!puedeRevertir || revertirMutation.isPending}
            onClick={() => {
              setLoteARevertir(r);
              setMotivoReversion('');
              setErrorMotivo(null);
            }}
            title={
              puedeRevertir
                ? 'Revertir lote importado'
                : 'Requiere rol ADMINISTRADOR o CONTADOR'
            }
            className="h-6 px-2 bg-[#FFFFFF] hover:bg-[#FEF2F2] text-[#B91C1C] border border-[#D1D5DB] text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed rounded-none"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Revertir</span>
          </button>
        ) : (
          <span className="text-[10px] text-[#9CA3AF]">Revertido</span>
        ),
    },
  ];

  return (
    <VentanaModal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Historial de Importaciones de Extracto Bancario"
      subtitulo={
        cuenta ? `${cuenta.banco} (${cuenta.moneda}) · N° ${cuenta.numero}` : undefined
      }
      ancho="2xl"
      footer={
        <button
          type="button"
          onClick={onCerrar}
          className="h-7 px-3 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border border-[#D1D5DB] text-[12px] cursor-pointer rounded-none"
        >
          Cerrar
        </button>
      }
    >
      <div className="space-y-3">
        {loteARevertir && (
          <form
            onSubmit={handleConfirmarReversion}
            className="p-3 bg-[#FEF2F2] border border-[#B91C1C] space-y-2"
          >
            <div className="flex items-start gap-2 text-[#991B1B]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="text-[12px]">
                <strong>Confirmar Reversión de Lote:</strong> {loteARevertir.nombreArchivo} (
                {loteARevertir.filasNuevas} líneas nuevas). Se eliminarán las partidas no
                conciliadas del lote y se dejará traza en auditoría.
              </div>
            </div>

            {errorMotivo && (
              <div className="text-[11px] text-[#B91C1C] font-bold">{errorMotivo}</div>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[260px]">
                <label className="block text-[11px] font-bold text-[#111827] mb-1">
                  Motivo obligatorio de reversión (mín. 5 caracteres) *
                </label>
                <input
                  type="text"
                  required
                  minLength={5}
                  maxLength={500}
                  value={motivoReversion}
                  onChange={(e) => setMotivoReversion(e.target.value)}
                  placeholder="Ej. Archivo importado con periodo o cuenta incorrecta..."
                  className="w-full h-7 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[12px] rounded-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setLoteARevertir(null)}
                className="h-7 px-3 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border border-[#D1D5DB] text-[12px] cursor-pointer rounded-none"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={revertirMutation.isPending || motivoReversion.trim().length < 5}
                className="h-7 px-3 bg-[#B91C1C] hover:bg-[#991B1B] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-[#FFFFFF] border border-[#B91C1C] text-[12px] font-bold inline-flex items-center gap-1 cursor-pointer rounded-none"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{revertirMutation.isPending ? 'Revirtiendo...' : 'Confirmar Reversión'}</span>
              </button>
            </div>
          </form>
        )}

        <div className="max-h-[400px] overflow-y-auto">
          <TablaDensa
            columnas={columnas}
            datos={historialQuery.data ?? []}
            rowKey={(r) => r.id}
            cargando={historialQuery.isLoading}
            mensajeError={
              historialQuery.error
                ? extraerMensajeErrorConciliacion(
                    historialQuery.error,
                    'No se pudo cargar el historial de importaciones.'
                  )
                : null
            }
            mensajeVacio="No se han registrado importaciones de extracto para esta cuenta."
          />
        </div>
      </div>
    </VentanaModal>
  );
};
