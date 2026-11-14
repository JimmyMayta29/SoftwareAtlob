import React, { useState } from 'react';
import { Download, CheckCircle2 } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';

interface LibroPleConfig {
  codigoLibro: string;
  denominacion: string;
  periodicidad: string;
  registrosDetectados: number;
}

const LIBROS_PLE: LibroPleConfig[] = [
  { codigoLibro: '050100', denominacion: '5.1 Libro Diario — Formato General (PCGE)', periodicidad: 'Mensual', registrosDetectados: 28 },
  { codigoLibro: '050300', denominacion: '5.3 Libro Diario — Detalle del Plan Contable Utilizado', periodicidad: 'Mensual', registrosDetectados: 142 },
  { codigoLibro: '060100', denominacion: '6.1 Libro Mayor', periodicidad: 'Mensual', registrosDetectados: 28 },
  { codigoLibro: '080100', denominacion: '8.1 Registro de Compras (Contingencia / Períodos previos a SIRE)', periodicidad: 'Mensual', registrosDetectados: 14 },
  { codigoLibro: '080200', denominacion: '8.2 Registro de Compras — Sujetos No Domiciliados', periodicidad: 'Mensual', registrosDetectados: 0 },
  { codigoLibro: '140100', denominacion: '14.1 Registro de Ventas e Ingresos (Contingencia / Períodos previos a SIRE)', periodicidad: 'Mensual', registrosDetectados: 19 },
  { codigoLibro: '010100', denominacion: '1.1 Libro Caja y Bancos — Detalle de los Movimientos del Efectivo', periodicidad: 'Mensual', registrosDetectados: 8 },
  { codigoLibro: '010200', denominacion: '1.2 Libro Caja y Bancos — Detalle de los Movimientos de la Cuenta Corriente', periodicidad: 'Mensual', registrosDetectados: 16 },
];

export const LibrosElectronicosView: React.FC = () => {
  const { state, notify } = useAppContext();
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-03');
  const ruc = (state.activeEmpresaRuc || '20601234567').padEnd(11, '0').slice(0, 11);
  const [anio, mes] = periodo.split('-');

  // Nomenclatura oficial Anexo 2 R.S. N° 286-2009/SUNAT (33 caracteres antes de .txt):
  // LE (2) + RUC (11) + AAAA (4) + MM (2) + DD (2) + LLLLLL (6) + CC (2) + O (1) + I (1) + M (1) + G (1)
  const construirNombrePle33 = (codigoLibro: string, conInformacion: boolean) => {
    const dd = '00';
    const cc = '00';
    const o = '1'; // Empresa operativa
    const i = conInformacion ? '1' : '0';
    const m = '1'; // Soles PEN
    const g = '1'; // Generado por PLE
    return `LE${ruc}${anio}${mes || '03'}${dd}${codigoLibro}${cc}${o}${i}${m}${g}.txt`;
  };

  const descargarLibroPle = async (libro: LibroPleConfig) => {
    const nombreArchivo = construirNombrePle33(libro.codigoLibro, libro.registrosDetectados > 0);
    const empresaId = state.activeEmpresa;
    try {
      const res = await fetch(`/api/sunat/ple/generar?periodo=${periodo}&codigoLibro=${libro.codigoLibro}${empresaId ? `&empresaId=${empresaId}` : ''}`, {
        headers: {
          ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || json?.message || 'Error al generar libro PLE');
      }
      const contenido = json?.data?.contenidoTxt;
      if (!contenido) {
        throw new Error('El servidor no devolvió contenido para el libro solicitado');
      }
      const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = json?.data?.nombreArchivo || nombreArchivo;
      a.click();
      URL.revokeObjectURL(url);
      notify(`Archivo oficial PLE 5.2 generado: ${json?.data?.nombreArchivo || nombreArchivo}`, 'success');
    } catch (err: any) {
      notify(`Error al descargar el archivo PLE: ${err.message || 'Fallo de conexión'}`, 'error');
    }
  };

  const columnas: ColumnaTablaDensa<LibroPleConfig>[] = [
    { key: 'codigoLibro', header: 'Cód. Libro', width: '85px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.codigoLibro}</span> },
    { key: 'denominacion', header: 'Libro o Registro Electrónico (Anexo 2 R.S. 286-2009/SUNAT)', render: (r) => <span className="font-bold text-[#111827]">{r.denominacion}</span> },
    {
      key: 'nombreArchivo',
      header: 'Nomenclatura Oficial PLE 5.2 (33 caracteres + .txt)',
      width: '320px',
      render: (r) => (
        <span className="font-mono text-[11px] text-[#1E6F42] font-bold">
          {construirNombrePle33(r.codigoLibro, r.registrosDetectados > 0)}
        </span>
      ),
    },
    { key: 'registrosDetectados', header: 'Filas', width: '65px', align: 'right', render: (r) => r.registrosDetectados },
    {
      key: 'accion',
      header: 'Exportar TXT',
      width: '120px',
      align: 'center',
      render: (r) => (
        <button
          type="button"
          onClick={() => descargarLibroPle(r)}
          className="h-5 px-2 bg-[#1E3A5F] text-[#FFFFFF] text-[11px] inline-flex items-center gap-1 hover:bg-[#162C49]"
        >
          <Download className="w-3 h-3" strokeWidth={1.5} />
          Descargar .TXT
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Generación de Libros Electrónicos (PLE 5.2 — R.S. N° 286-2009/SUNAT)"
        subtitulo="Estructura oficial de 33 caracteres: LE + RUC(11) + AAAA(4) + MM(2) + DD(2) + LLLLLL(6) + CC(2) + O(1) + I(1) + M(1) + G(1).txt"
        derecha={<SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={LIBROS_PLE}
          rowKey={(r) => r.codigoLibro}
        />
      </div>
    </div>
  );
};
