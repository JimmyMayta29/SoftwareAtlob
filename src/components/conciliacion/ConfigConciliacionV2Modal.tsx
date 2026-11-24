import React, { useEffect, useState } from 'react';
import Decimal from 'decimal.js';
import { Lock, Save, Sparkles, XCircle } from 'lucide-react';
import { VentanaModal } from '../ui/VentanaModal';
import type { ConfigConciliacionV2 } from '../../api/conciliacionV2Api';
import { useActualizarConfigConciliacionV2 } from '../../hooks/useConciliacionV2';

export interface ConfigConciliacionV2ModalProps {
  abierto: boolean;
  onCerrar: () => void;
  empresaId: string;
  config?: ConfigConciliacionV2;
  esAdministrador: boolean;
}

export const ConfigConciliacionV2Modal: React.FC<ConfigConciliacionV2ModalProps> = ({
  abierto,
  onCerrar,
  empresaId,
  config,
  esAdministrador,
}) => {
  const { mutateAsync: actualizarConfig, isPending } = useActualizarConfigConciliacionV2(empresaId);

  const [conciliacionV2Habilitada, setConciliacionV2Habilitada] = useState(false);
  const [toleranciaDias, setToleranciaDias] = useState('3');
  const [toleranciaMonto, setToleranciaMonto] = useState('0.00');
  const [cuentaItfCodigo, setCuentaItfCodigo] = useState('6412');
  const [cuentaComisionCodigo, setCuentaComisionCodigo] = useState('6391');
  const [cuentaInteresGastoCodigo, setCuentaInteresGastoCodigo] = useState('67311');
  const [cuentaInteresIngresoCodigo, setCuentaInteresIngresoCodigo] = useState('');
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  const sugerenciaIngreso = config?.sugerenciaCuentaInteresIngreso || '7793';

  useEffect(() => {
    if (!abierto) return;
    setConciliacionV2Habilitada(Boolean(config?.conciliacionV2Habilitada));
    setToleranciaDias(String(config?.toleranciaDias ?? 3));
    setToleranciaMonto(config?.toleranciaMonto ?? '0.00');
    setCuentaItfCodigo(config?.cuentaItfCodigo || '6412');
    setCuentaComisionCodigo(config?.cuentaComisionCodigo || '6391');
    setCuentaInteresGastoCodigo(config?.cuentaInteresGastoCodigo || '67311');
    // Decisión 2: si en BD es null, mantener vacío; nunca precargar la sugerencia automáticamente.
    setCuentaInteresIngresoCodigo(config?.cuentaInteresIngresoCodigo ?? '');
    setErrorValidacion(null);
  }, [abierto, config]);

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!esAdministrador || isPending) return;

    const diasInt = Number.parseInt(toleranciaDias, 10);
    if (!Number.isInteger(diasInt) || diasInt < 0 || diasInt > 30) {
      setErrorValidacion('La tolerancia en días debe ser un número entero entre 0 y 30.');
      return;
    }

    let montoFormateado: string;
    try {
      const montoText = toleranciaMonto.trim();
      if (!/^-?\d+(\.\d+)?$/.test(montoText)) {
        throw new Error('Formato inválido');
      }
      const montoDec = new Decimal(montoText);
      if (montoDec.lt(0)) {
        setErrorValidacion('La tolerancia de monto no puede ser negativa.');
        return;
      }
      montoFormateado = montoDec.toFixed(2);
    } catch {
      setErrorValidacion('La tolerancia de monto debe ser un número decimal válido (ej. 0.00).');
      return;
    }

    const itfTrim = cuentaItfCodigo.trim();
    const comisionTrim = cuentaComisionCodigo.trim();
    const interesGastoTrim = cuentaInteresGastoCodigo.trim();
    if (itfTrim.length < 2 || comisionTrim.length < 2 || interesGastoTrim.length < 2) {
      setErrorValidacion('Las cuentas de ITF, comisión e interés gasto deben tener al menos 2 caracteres.');
      return;
    }

    const interesIngresoTrim = cuentaInteresIngresoCodigo.trim();
    if (interesIngresoTrim.length > 0 && interesIngresoTrim.length < 2) {
      setErrorValidacion('Si define una cuenta de interés ingreso, debe tener al menos 2 caracteres.');
      return;
    }

    setErrorValidacion(null);

    try {
      await actualizarConfig({
        conciliacionV2Habilitada,
        toleranciaDias: diasInt,
        toleranciaMonto: montoFormateado,
        cuentaItfCodigo: itfTrim,
        cuentaComisionCodigo: comisionTrim,
        cuentaInteresGastoCodigo: interesGastoTrim,
        // Si no fue elegida ni escrita explícitamente, enviar null.
        cuentaInteresIngresoCodigo: interesIngresoTrim.length > 0 ? interesIngresoTrim : null,
      });
      onCerrar();
    } catch {
      // El error real del backend ya se notifica vía toast desde useActualizarConfigConciliacionV2.
    }
  };

  return (
    <VentanaModal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Configuración de Conciliación Bancaria V2"
      subtitulo="Parámetros por empresa y mapeo PCGE"
      ancho="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onCerrar}
            className="h-7 px-3 bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#111827] border border-[#D1D5DB] text-[12px] cursor-pointer rounded-none"
          >
            Cerrar
          </button>
          <button
            type="submit"
            form="form-config-conciliacion-v2"
            disabled={!esAdministrador || isPending}
            className="h-7 px-3 bg-[#1E3A5F] hover:bg-[#162C49] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-[#FFFFFF] border border-[#1E3A5F] disabled:border-[#D1D5DB] text-[12px] inline-flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed rounded-none"
          >
            <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>{isPending ? 'Guardando...' : 'Guardar Configuración'}</span>
          </button>
        </>
      }
    >
      <form id="form-config-conciliacion-v2" onSubmit={handleGuardar} className="space-y-3">
        {!esAdministrador && (
          <div className="p-2.5 bg-[#FEF2F2] border border-[#B91C1C] text-[#991B1B] text-[12px] flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" />
            <span>Solo un usuario con rol ADMINISTRADOR puede modificar la configuración de Conciliación V2.</span>
          </div>
        )}

        {errorValidacion && (
          <div className="p-2 bg-[#FEF2F2] border border-[#B91C1C] text-[#B91C1C] text-[12px] font-medium">
            {errorValidacion}
          </div>
        )}

        <div className="p-2.5 bg-[#F5F7FA] border border-[#D1D5DB] flex items-center justify-between gap-3">
          <div>
            <div className="font-bold text-[#111827] text-[12px]">
              Habilitar Conciliación Bancaria V2 (Feature Flag por empresa)
            </div>
            <div className="text-[11px] text-[#4B5563]">
              Activa el nuevo motor con vinculación PCGE obligatoria, 9 estados y control de integridad Mayor 104x.
            </div>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={conciliacionV2Habilitada}
              onChange={(e) => setConciliacionV2Habilitada(e.target.checked)}
              disabled={!esAdministrador || isPending}
              className="w-4 h-4 accent-[#1E3A5F]"
            />
            <span className="font-bold text-[12px] text-[#1E3A5F]">
              {conciliacionV2Habilitada ? 'ACTIVA' : 'INACTIVA'}
            </span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-[#374151] mb-1">
              Tolerancia en Días (0 - 30)
            </label>
            <input
              type="number"
              min={0}
              max={30}
              step={1}
              value={toleranciaDias}
              onChange={(e) => setToleranciaDias(e.target.value)}
              disabled={!esAdministrador || isPending}
              className="w-full h-7 px-2 border border-[#D1D5DB] bg-[#FFFFFF] text-[12px] font-mono focus:outline-none focus:border-[#1E3A5F] disabled:bg-[#F3F4F6] rounded-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#374151] mb-1">
              Tolerancia de Monto (para Semáforo AMARILLO)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={toleranciaMonto}
              onChange={(e) => setToleranciaMonto(e.target.value)}
              disabled={!esAdministrador || isPending}
              placeholder="0.00"
              className="w-full h-7 px-2 border border-[#D1D5DB] bg-[#FFFFFF] text-[12px] font-mono text-right focus:outline-none focus:border-[#1E3A5F] disabled:bg-[#F3F4F6] rounded-none"
            />
          </div>
        </div>

        <div className="border-t border-[#D1D5DB] pt-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#1E3A5F] mb-2">
            Cuentas PCGE de Ajustes Bancarios
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[#374151] mb-1">
                Cuenta ITF (Default: 6412)
              </label>
              <input
                type="text"
                maxLength={20}
                value={cuentaItfCodigo}
                onChange={(e) => setCuentaItfCodigo(e.target.value)}
                disabled={!esAdministrador || isPending}
                className="w-full h-7 px-2 border border-[#D1D5DB] bg-[#FFFFFF] text-[12px] font-mono focus:outline-none focus:border-[#1E3A5F] disabled:bg-[#F3F4F6] rounded-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#374151] mb-1">
                Cuenta Comisión / Portes (Default: 6391)
              </label>
              <input
                type="text"
                maxLength={20}
                value={cuentaComisionCodigo}
                onChange={(e) => setCuentaComisionCodigo(e.target.value)}
                disabled={!esAdministrador || isPending}
                className="w-full h-7 px-2 border border-[#D1D5DB] bg-[#FFFFFF] text-[12px] font-mono focus:outline-none focus:border-[#1E3A5F] disabled:bg-[#F3F4F6] rounded-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#374151] mb-1">
                Cuenta Interés Gasto (Default: 67311)
              </label>
              <input
                type="text"
                maxLength={20}
                value={cuentaInteresGastoCodigo}
                onChange={(e) => setCuentaInteresGastoCodigo(e.target.value)}
                disabled={!esAdministrador || isPending}
                className="w-full h-7 px-2 border border-[#D1D5DB] bg-[#FFFFFF] text-[12px] font-mono focus:outline-none focus:border-[#1E3A5F] disabled:bg-[#F3F4F6] rounded-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#374151] mb-1">
                Cuenta Interés Ingreso (Opcional / Sin configurar por defecto)
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  maxLength={20}
                  value={cuentaInteresIngresoCodigo}
                  onChange={(e) => setCuentaInteresIngresoCodigo(e.target.value)}
                  disabled={!esAdministrador || isPending}
                  placeholder={`Sugerencia: ${sugerenciaIngreso} (sin configurar)`}
                  className="flex-1 h-7 px-2 border border-[#D1D5DB] bg-[#FFFFFF] text-[12px] font-mono focus:outline-none focus:border-[#1E3A5F] disabled:bg-[#F3F4F6] rounded-none"
                />
                {esAdministrador && cuentaInteresIngresoCodigo.trim() !== sugerenciaIngreso && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setCuentaInteresIngresoCodigo(sugerenciaIngreso)}
                    title={`Aplicar sugerencia ${sugerenciaIngreso}`}
                    className="h-7 px-2 bg-[#F5F7FA] hover:bg-[#E8ECF1] text-[#1E3A5F] border border-[#D1D5DB] text-[11px] inline-flex items-center gap-1 cursor-pointer shrink-0 rounded-none"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Usar sugerencia ({sugerenciaIngreso})</span>
                  </button>
                )}
                {esAdministrador && cuentaInteresIngresoCodigo.trim().length > 0 && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setCuentaInteresIngresoCodigo('')}
                    title="Dejar sin configurar (null)"
                    className="h-7 px-1.5 bg-[#FFFFFF] hover:bg-[#FEF2F2] text-[#B91C1C] border border-[#D1D5DB] text-[11px] inline-flex items-center cursor-pointer shrink-0 rounded-none"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-[10px] text-[#6B7280]">
                Si permanece vacío, se guardará como sin configurar (null) hasta que la empresa lo defina.
              </p>
            </div>
          </div>
        </div>

        {config && (
          <div className="text-[11px] text-[#4B5563] bg-[#F5F7FA] border border-[#D1D5DB] px-2.5 py-1.5 flex flex-wrap justify-between gap-2">
            <span>
              Estado en BD: <strong>{config.configuradaEnBd ? 'Configurada' : 'Valores por defecto'}</strong>
            </span>
            {config.updatedAt && (
              <span>
                Última actualización: <strong className="font-mono">{config.updatedAt}</strong>
              </span>
            )}
          </div>
        )}
      </form>
    </VentanaModal>
  );
};
