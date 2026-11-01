import React, { useState } from 'react';
import { Download, Save } from 'lucide-react';
import Decimal from 'decimal.js';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { CampoNumerico } from '../ui/CampoNumerico';

const UIT_ANUAL: Record<string, number> = {
  '2026': 5500, // D.S. N° 301-2025-EF (Parámetro VALOR_UIT_2026)
  '2025': 5350, // D.S. N° 260-2024-EF (Parámetro VALOR_UIT_2025)
  '2024': 5150, // D.S. N° 309-2023-EF (Parámetro VALOR_UIT_2024)
};

export const DeclaracionRentaAnualView: React.FC = () => {
  const { notify } = useAppContext();
  const [ejercicio, setEjercicio] = useState('2026');
  const [regimen, setRegimen] = useState<'RMT' | 'GENERAL'>('RMT');
  const [sistemaArrastre, setSistemaArrastre] = useState<'SISTEMA_A' | 'SISTEMA_B'>('SISTEMA_A');
  const [utilidadContable, setUtilidadContable] = useState('145000.00');
  const [adicionesArt37y44, setAdicionesArt37y44] = useState('12800.00');
  const [deduccionesTributarias, setDeduccionesTributarias] = useState('4500.00');
  const [perdidaTributariaArrastrable, setPerdidaTributariaArrastrable] = useState('10000.00');
  const [pagosACuentaAnio, setPagosACuentaAnio] = useState('14200.00');
  const [estadoDj, setEstadoDj] = useState<'BORRADOR' | 'DETERMINADO'>('BORRADOR');

  const uit = new Decimal(UIT_ANUAL[ejercicio] || 5500);
  const tramo15Uit = uit.mul(15);

  const utilCont = new Decimal(utilidadContable || '0');
  const adiciones = new Decimal(adicionesArt37y44 || '0');
  const deducciones = new Decimal(deduccionesTributarias || '0');
  const perdidaDisp = Decimal.max(0, new Decimal(perdidaTributariaArrastrable || '0'));
  const pagosCuenta = new Decimal(pagosACuentaAnio || '0');

  const rentaNetaPrevia = utilCont.plus(adiciones).minus(deducciones);
  const limiteCompensacion =
    rentaNetaPrevia.gt(0)
      ? sistemaArrastre === 'SISTEMA_B'
        ? rentaNetaPrevia.mul('0.50').toDecimalPlaces(2)
        : rentaNetaPrevia
      : new Decimal(0);
  const perdidaAplicada = Decimal.min(perdidaDisp, limiteCompensacion);
  const rentaNetaImponible = Decimal.max(0, rentaNetaPrevia.minus(perdidaAplicada));

  let impuestoTramo10 = new Decimal(0);
  let impuestoTramo295 = new Decimal(0);

  if (regimen === 'RMT') {
    const base10 = Decimal.min(rentaNetaImponible, tramo15Uit);
    const exceso15Uit = Decimal.max(0, rentaNetaImponible.minus(tramo15Uit));
    impuestoTramo10 = base10.mul('0.10').toDecimalPlaces(2);
    impuestoTramo295 = exceso15Uit.mul('0.295').toDecimalPlaces(2);
  } else {
    impuestoTramo295 = rentaNetaImponible.mul('0.295').toDecimalPlaces(2);
  }

  const impuestoRentaAnual = impuestoTramo10.plus(impuestoTramo295);
  const saldoRegularizar = impuestoRentaAnual.minus(pagosCuenta);

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Declaración Jurada Anual del Impuesto a la Renta — 3ra Categoría (Formulario Virtual 710)"
        subtitulo="Conciliación Tributaria (Art. 37° y 44° LIR), Compensación de Pérdidas (Art. 50° LIR) y Liquidación por Tramos UIT"
        acciones={[
          {
            id: 'guardar-dj-anual',
            label: 'Guardar Determinación Anual',
            icono: Save,
            primario: true,
            onClick: () => {
              setEstadoDj('DETERMINADO');
              notify(`Declaración Anual ${ejercicio} guardada (Impuesto calculado: S/ ${impuestoRentaAnual.toFixed(2)})`, 'success');
            },
          },
          {
            id: 'exportar-papeles',
            label: 'Exportar Papeles de Trabajo FV 710',
            icono: Download,
            onClick: () => notify(`Papeles de trabajo DJ Anual ${ejercicio} generados`, 'success'),
          },
        ]}
        derecha={
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] px-2 py-0.5 bg-[#E8ECF1] border border-[#1E3A5F] text-[#1E3A5F] font-bold">
              {estadoDj}
            </span>
            <select
              value={regimen}
              onChange={(e) => setRegimen(e.target.value as 'RMT' | 'GENERAL')}
              className="h-6 px-2 text-[12px] bg-[#FFFFFF] border border-[#D1D5DB]"
            >
              <option value="RMT">Régimen MYPE Tributario (10% hasta 15 UIT / 29.5% exceso)</option>
              <option value="GENERAL">Régimen General (Tasa única 29.5%)</option>
            </select>
            <select
              value={ejercicio}
              onChange={(e) => setEjercicio(e.target.value)}
              className="h-6 px-2 text-[12px] font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
            >
              <option value="2026">Ejercicio 2026 (UIT S/ 5,500)</option>
              <option value="2025">Ejercicio 2025 (UIT S/ 5,350)</option>
              <option value="2024">Ejercicio 2024 (UIT S/ 5,150)</option>
            </select>
          </div>
        }
      />

      <div className="flex-1 p-3 grid grid-cols-2 gap-3 overflow-auto">
        <div className="border border-[#D1D5DB] p-3 space-y-2 bg-[#FFFFFF]">
          <div className="font-bold text-[12px] text-[#1E3A5F] border-b border-[#D1D5DB] pb-1">
            1. Conciliación Tributaria: Utilidad Contable a Renta Neta Imponible
          </div>
          <CampoNumerico
            label="Casilla 100 — Utilidad Contable antes de Impuestos (Estado de Resultados) S/"
            value={utilidadContable}
            onChange={setUtilidadContable}
          />
          <CampoNumerico
            label="Casilla 103 — (+) Adiciones para determinar la Renta Imponible (Art. 44° LIR) S/"
            value={adicionesArt37y44}
            onChange={setAdicionesArt37y44}
          />
          <CampoNumerico
            label="Casilla 105 — (-) Deducciones Tributarias Permitidas (Art. 37° LIR) S/"
            value={deduccionesTributarias}
            onChange={setDeduccionesTributarias}
          />
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="block text-[11px] text-[#4B5563] mb-0.5">
                Sistema Compensación Pérdidas (Art. 50° LIR)
              </label>
              <select
                value={sistemaArrastre}
                onChange={(e) => setSistemaArrastre(e.target.value as 'SISTEMA_A' | 'SISTEMA_B')}
                className="w-full h-6 px-2 text-[11px] bg-[#FFFFFF] border border-[#D1D5DB]"
              >
                <option value="SISTEMA_A">Sistema A — Hasta 4 años (100% Renta Neta)</option>
                <option value="SISTEMA_B">Sistema B — Sin plazo (Máx. 50% Renta Neta)</option>
              </select>
            </div>
            <CampoNumerico
              label="Casilla 107 — (-) Pérdida Tributaria Arrastrable S/"
              value={perdidaTributariaArrastrable}
              onChange={setPerdidaTributariaArrastrable}
            />
          </div>
          <CampoNumerico
            label="Casilla 128 — (-) Pagos a Cuenta Mensuales Aplicados en el Ejercicio S/"
            value={pagosACuentaAnio}
            onChange={setPagosACuentaAnio}
          />
        </div>

        <div className="border border-[#D1D5DB] p-3 bg-[#F5F7FA] flex flex-col justify-between">
          <div className="space-y-1.5 text-[12px]">
            <div className="font-bold text-[12px] text-[#1E3A5F] border-b border-[#D1D5DB] pb-1">
              2. Liquidación del Impuesto a la Renta Anual ({ejercicio} — Parámetro UIT S/ {uit.toFixed(2)})
            </div>
            <div className="flex justify-between py-1 border-b border-[#E5E7EB]">
              <span>Renta Neta antes de Compensación de Pérdidas (Casilla 106):</span>
              <span className="font-mono font-bold">S/ {rentaNetaPrevia.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#E5E7EB]">
              <span>(-) Pérdida Tributaria Compensada ({sistemaArrastre === 'SISTEMA_A' ? 'Sistema A 100%' : 'Sistema B 50%'}):</span>
              <span className="font-mono text-[#1E6F42]">- S/ {perdidaAplicada.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#E5E7EB]">
              <span>Renta Neta Imponible (Casilla 108):</span>
              <span className="font-mono font-bold text-[#1D4ED8]">S/ {rentaNetaImponible.toFixed(2)}</span>
            </div>
            {regimen === 'RMT' && (
              <div className="flex justify-between py-1 border-b border-[#E5E7EB]">
                <span>Tramo 1 — Hasta 15 UIT (S/ {tramo15Uit.toFixed(2)}) × 10%:</span>
                <span className="font-mono">S/ {impuestoTramo10.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between py-1 border-b border-[#E5E7EB]">
              <span>{regimen === 'RMT' ? 'Tramo 2 — Exceso de 15 UIT × 29.5%:' : 'Tasa Régimen General (29.5%):'}</span>
              <span className="font-mono">S/ {impuestoTramo295.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#D1D5DB] font-bold text-[#111827]">
              <span>Impuesto a la Renta Anual Calculado (Casilla 113):</span>
              <span className="font-mono">S/ {impuestoRentaAnual.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#E5E7EB]">
              <span>(-) Créditos por Pagos a Cuenta Mensuales (Casilla 128):</span>
              <span className="font-mono text-[#1E6F42]">- S/ {pagosCuenta.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-2 px-2 bg-[#E8ECF1] border border-[#D1D5DB] font-bold">
              <span>{saldoRegularizar.gte(0) ? 'SALDO POR REGULARIZAR A FAVOR DEL FISCO (CAS. 146):' : 'SALDO A FAVOR DEL CONTRIBUYENTE (CAS. 138):'}</span>
              <span className={`font-mono ${saldoRegularizar.gte(0) ? 'text-[#B91C1C]' : 'text-[#1E6F42]'}`}>
                S/ {saldoRegularizar.abs().toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
