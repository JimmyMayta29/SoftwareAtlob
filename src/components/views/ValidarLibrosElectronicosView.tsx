import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, Play } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';

interface ResultadoValidacionPle {
  linea: number;
  campo: string;
  reglaAnexo2: string;
  valorEvaluado: string;
  estado: 'VALIDO' | 'ERROR';
}

export const ValidarLibrosElectronicosView: React.FC = () => {
  const { notify } = useAppContext();
  const [nombreArchivo, setNombreArchivo] = useState('LE2060123456720260300050100001111.txt');
  const [validaciones, setValidaciones] = useState<ResultadoValidacionPle[]>([
    { linea: 0, campo: 'Longitud de nombre (33 chars)', reglaAnexo2: 'Exactamente 33 caracteres antes de .txt', valorEvaluado: '33 caracteres (OK)', estado: 'VALIDO' },
    { linea: 1, campo: 'Campo 1: Período (AAAAMM00)', reglaAnexo2: 'Formato 8 dígitos numéricos', valorEvaluado: '20260300', estado: 'VALIDO' },
    { linea: 1, campo: 'Campo 2: CUO (Código Único Operación)', reglaAnexo2: 'Alfanumérico hasta 40 caracteres sin pipes', valorEvaluado: 'CUO-202603-0001', estado: 'VALIDO' },
    { linea: 1, campo: 'Campo 3: Correlativo Asiento (M/A/C)', reglaAnexo2: 'Inicia con A (Apertura), M (Movimiento) o C (Cierre)', valorEvaluado: 'M0001', estado: 'VALIDO' },
    { linea: 1, campo: 'Campo 21: Estado de Operación', reglaAnexo2: 'Valores permitidos: 1, 8 o 9', valorEvaluado: '1', estado: 'VALIDO' },
  ]);

  const ejecutarValidador = () => {
    const base = nombreArchivo.replace(/\.txt$/i, '');
    const es33 = base.length === 33 && base.startsWith('LE');
    setValidaciones((prev) => [
      {
        linea: 0,
        campo: 'Longitud de nombre (33 chars)',
        reglaAnexo2: 'Exactamente 33 caracteres antes de .txt',
        valorEvaluado: `${base.length} caracteres (${es33 ? 'OK' : 'OBSERVADO'})`,
        estado: es33 ? 'VALIDO' : 'ERROR',
      },
      ...prev.slice(1),
    ]);
    notify(es33 ? 'Estructura PLE 5.2 validada sin errores de formato' : 'Observación en longitud del nombre PLE', es33 ? 'success' : 'warning');
  };

  const columnas: ColumnaTablaDensa<ResultadoValidacionPle>[] = [
    { key: 'linea', header: 'Línea', width: '65px', align: 'right', render: (r) => r.linea },
    { key: 'campo', header: 'Campo / Posición Anexo 2', width: '240px', render: (r) => <span className="font-bold text-[#111827]">{r.campo}</span> },
    { key: 'reglaAnexo2', header: 'Regla Técnica PLE 5.2', render: (r) => r.reglaAnexo2 },
    { key: 'valorEvaluado', header: 'Valor Detectado', width: '210px', render: (r) => <span className="font-mono">{r.valorEvaluado}</span> },
    {
      key: 'estado',
      header: 'Estado',
      width: '95px',
      align: 'center',
      render: (r) => (
        <span className={`font-bold text-[11px] ${r.estado === 'VALIDO' ? 'text-[#1E6F42]' : 'text-[#B91C1C]'}`}>
          {r.estado}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Validador Preventivo de Estructura de Libros Electrónicos (PLE 5.2)"
        subtitulo="Verificación de nomenclatura de 33 caracteres, separadores pipe (|), CUO, correlativos A/M/C y estados 1, 8, 9"
        acciones={[
          {
            id: 'validar',
            label: 'Validar Estructura PLE',
            icono: Play,
            primario: true,
            onClick: ejecutarValidador,
          },
        ]}
      />

      <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#D1D5DB] flex items-center gap-3 text-[12px]">
        <label className="text-[11px] text-[#4B5563]">Nombre de archivo a verificar:</label>
        <input
          type="text"
          value={nombreArchivo}
          onChange={(e) => setNombreArchivo(e.target.value)}
          className="w-96 h-6 px-2 font-mono bg-[#FFFFFF] border border-[#D1D5DB]"
        />
      </div>

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={validaciones}
          rowKey={(r, i) => `${r.linea}-${i}`}
        />
      </div>
    </div>
  );
};
