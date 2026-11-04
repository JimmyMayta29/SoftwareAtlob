import React, { useState } from 'react';
import { Download, CheckCircle2, AlertTriangle, ShieldCheck, FileArchive, Eye } from 'lucide-react';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { useToast } from '../../context/ToastContext';
import {
  useCalcularPlanilla,
  useValidarPlame,
  useExportarPlame
} from '../../hooks/useTesoreriaPlanilla';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';

interface ArchivoPlameFila {
  extension: string;
  estructura: string;
  descripcionAnexo3: string;
  nomenclatura: string;
  contenido: string;
  lineas: number;
}

export const ExportarPlameView: React.FC = () => {
  const { empresaActiva, periodo: ctxPeriodo } = useEmpresaPeriodo();
  const empresaId = empresaActiva?.id || '00000000-0000-0000-0000-000000000001';
  const ruc = empresaActiva?.ruc || '20601234567';
  const [periodo, setPeriodo] = useState(ctxPeriodo || '2026-09');
  const { success, error } = useToast();

  const calcularPlanillaMutation = useCalcularPlanilla(empresaId);
  const validarPlameMutation = useValidarPlame(empresaId);
  const exportarPlameMutation = useExportarPlame(empresaId);

  const [validacionResult, setValidacionResult] = useState<any | null>(null);
  const [exportResult, setExportResult] = useState<any | null>(null);
  const [archivoPreview, setArchivoPreview] = useState<ArchivoPlameFila | null>(null);

  const handleValidarYGenerarPlame = async () => {
    try {
      const planilla: any = await calcularPlanillaMutation.mutateAsync({
        periodoId: `per-${periodo}`,
        mes: periodo
      });
      const val = await validarPlameMutation.mutateAsync(planilla.id);
      setValidacionResult(val);
      const exp = await exportarPlameMutation.mutateAsync(planilla.id);
      setExportResult(exp);
      success(
        `Estructura PLAME (${periodo}) validada y generada (.jor, .snl, .rem, .4ta, .toc).`,
        'Validador PLAME OK'
      );
    } catch (err: any) {
      error(err?.response?.data?.error || err.message || 'Error al validar o exportar PLAME', 'Error PLAME');
    }
  };

  const perCompacto = periodo.replace('-', '');
  const baseName = exportResult?.nombreBase || `0601${perCompacto}${ruc}`;

  const construirFilasArchivos = (): ArchivoPlameFila[] => {
    const getTxt = (val: any): string => (typeof val === 'string' ? val : val?.contenido || '');
    const remTxt = getTxt(exportResult?.archivos?.rem);
    const jorTxt = getTxt(exportResult?.archivos?.jor);
    const snlTxt = getTxt(exportResult?.archivos?.snl);
    const tocTxt = getTxt(exportResult?.archivos?.toc);
    const cuartaTxt = getTxt(exportResult?.archivos?.['4ta'] ?? exportResult?.archivos?.cuarta);

    const contarLineas = (txt: string) =>
      txt
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean).length;

    return [
      {
        extension: '.jor',
        estructura: 'Estructura 14 — Datos de la Jornada Laboral por Trabajador',
        descripcionAnexo3:
          'Tipo Doc | N° Doc | Horas ordinarias | Minutos ordinarios | Horas sobretiempo (25%+35%) | Minutos sobretiempo |',
        nomenclatura: `${baseName}.jor`,
        contenido: jorTxt,
        lineas: contarLineas(jorTxt)
      },
      {
        extension: '.snl',
        estructura: 'Estructura 15 — Subsidios y Otros Días No Laborados',
        descripcionAnexo3:
          'Tipo Doc | N° Doc | Tipo Suspensión Relación Laboral (Tabla 21: 07 Falta no justificada / 05 Licencia SGH) | N° Días |',
        nomenclatura: `${baseName}.snl`,
        contenido: snlTxt,
        lineas: contarLineas(snlTxt)
      },
      {
        extension: '.rem',
        estructura: 'Estructura 18 — Detalle de Ingresos, Tributos, Descuentos y Aportes',
        descripcionAnexo3:
          'Tipo Doc | N° Doc | Cód. Concepto Tabla 22 (0121, 0201, 0105, 0106, 0601, 0605, 0606, 0607, 0608, 0705, 0804) | Monto Devengado | Monto Pagado/Descontado |',
        nomenclatura: `${baseName}.rem`,
        contenido: remTxt,
        lineas: contarLineas(remTxt)
      },
      {
        extension: '.4ta',
        estructura: 'Estructura 20 — Prestadores de Servicios de Cuarta Categoría (Comprobantes)',
        descripcionAnexo3:
          'Tipo Doc | N° Doc | Tipo Comprobante (02=RxH) | Serie | Número | Monto Bruto | Retención 8% | Fecha Emisión | Fecha Pago |',
        nomenclatura: `${baseName}.4ta`,
        contenido: cuartaTxt,
        lineas: contarLineas(cuartaTxt)
      },
      {
        extension: '.toc',
        estructura: 'Estructura 26 — Trabajador: Otras Condiciones y Tasas de Aseguramiento',
        descripcionAnexo3:
          'Tipo Doc | N° Doc | Ind. Asegura tu Pensión | Ind. +Vida | Ind. SCTR Salud | Ind. SCTR Pensión |',
        nomenclatura: `${baseName}.toc`,
        contenido: tocTxt,
        lineas: contarLineas(tocTxt)
      }
    ];
  };

  const filas = construirFilasArchivos();

  const descargarArchivoPlano = (item: ArchivoPlameFila) => {
    const blob = new Blob([item.contenido], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.nomenclatura;
    a.click();
    URL.revokeObjectURL(url);
    success(`Archivo ${item.nomenclatura} descargado.`, 'Exportación PLAME');
  };

  const descargarZipCompleto = () => {
    if (!exportResult?.zipBase64) return;
    const byteChars = atob(exportResult.zipBase64);
    const byteNums = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNums[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportResult.nombreArchivoZip || `${baseName}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    success(`Paquete ${exportResult.nombreArchivoZip || `${baseName}.zip`} descargado.`, 'ZIP PLAME');
  };

  const columnas: ColumnaTablaDensa<ArchivoPlameFila>[] = [
    {
      key: 'extension',
      header: 'Ext.',
      width: '65px',
      align: 'center',
      render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.extension}</span>
    },
    {
      key: 'estructura',
      header: 'Estructura Oficial Anexo 3 PLAME (R.S. 183-2011/SUNAT)',
      width: '310px',
      render: (r) => <span className="font-bold text-[#111827]">{r.estructura}</span>
    },
    {
      key: 'descripcionAnexo3',
      header: 'Layout de Campos Separados por Pipe (|)',
      render: (r) => <span className="text-[11px]">{r.descripcionAnexo3}</span>
    },
    {
      key: 'lineas',
      header: 'Registros',
      width: '75px',
      align: 'center',
      render: (r) => <span className="font-mono font-bold">{r.lineas}</span>
    },
    {
      key: 'nomenclatura',
      header: 'Nomenclatura PDT 0601',
      width: '205px',
      render: (r) => <span className="font-mono text-[#1E6F42] font-bold">{r.nomenclatura}</span>
    },
    {
      key: 'accion',
      header: 'Acciones',
      width: '155px',
      align: 'center',
      render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            disabled={!exportResult}
            onClick={() => setArchivoPreview(r)}
            className="h-5 px-1.5 text-[10px] border border-[#D1D5DB] bg-[#FFFFFF] hover:bg-[#F3F4F6] disabled:opacity-40 inline-flex items-center gap-0.5"
          >
            <Eye className="w-3 h-3 text-[#1D4ED8]" />
            Ver
          </button>
          <button
            type="button"
            disabled={!exportResult}
            onClick={() => descargarArchivoPlano(r)}
            className="h-5 px-2 bg-[#1E3A5F] text-[#FFFFFF] text-[10px] inline-flex items-center gap-1 hover:bg-[#162C49] disabled:opacity-40 font-bold"
          >
            <Download className="w-3 h-3" />
            TXT
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Exportador Oficial de Archivos PDT PLAME (Formulario Virtual 0601)"
        subtitulo="Generación de archivos .jor, .snl, .rem, .4ta y .toc con Validador de Estructura Previo conforme al Anexo 3 R.M. N° 121-2011-TR y R.S. N° 016-2022/SUNAT"
        derecha={
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold">Período:</label>
            <input
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="h-6 px-2 font-mono text-[12px] border border-[#D1D5DB]"
            />
          </div>
        }
        acciones={[
          {
            id: 'validar-plame',
            label: 'Validar Estructura y Generar Archivos PLAME',
            icono: ShieldCheck,
            primario: true,
            onClick: handleValidarYGenerarPlame
          },
          ...(exportResult
            ? [
                {
                  id: 'descargar-zip',
                  label: `Descargar Paquete ${baseName}.zip`,
                  icono: FileArchive,
                  onClick: descargarZipCompleto
                }
              ]
            : [])
        ]}
      />

      {/* Panel del Validador de Estructura Previo */}
      {validacionResult && (
        <div
          className={`mx-3 mt-2 p-2.5 border text-[11px] ${
            validacionResult.esValido
              ? 'bg-[#F0FDF4] border-[#86EFAC] text-[#166534]'
              : 'bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]'
          }`}
        >
          <div className="flex items-center justify-between font-bold">
            <div className="flex items-center gap-1.5">
              {validacionResult.esValido ? (
                <CheckCircle2 className="w-4 h-4 text-[#166534]" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-[#991B1B]" />
              )}
              <span>
                VALIDADOR DE ESTRUCTURA PREVIO PLAME:{' '}
                {validacionResult.esValido ? 'CONFORME (0 ERRORES CRÍTICOS)' : 'OBSERVADO'}
              </span>
            </div>
            <span className="font-mono">
              Trabajadores procesados: {validacionResult.resumen?.trabajadoresProcesados || 0} | Advertencias:{' '}
              {validacionResult.advertencias?.length || 0}
            </span>
          </div>
          {validacionResult.errores?.length > 0 && (
            <ul className="list-disc pl-5 mt-1">
              {validacionResult.errores.map((e: string, idx: number) => (
                <li key={idx}>{e}</li>
              ))}
            </ul>
          )}
          {validacionResult.advertencias?.length > 0 && (
            <ul className="list-disc pl-5 mt-1 text-[#92400E]">
              {validacionResult.advertencias.map((w: string, idx: number) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex-1 p-3 overflow-hidden flex flex-col gap-3">
        <TablaDensa columnas={columnas} datos={filas} rowKey={(r) => r.extension} />

        {/* Nota de supuestos normativos verificados */}
        <div className="p-2 bg-[#F8FAFC] border border-[#D1D5DB] text-[11px] text-[#374151]">
          <strong>Especificación técnica y supuestos verificados (Anexo 3 R.S. 183-2011/SUNAT y modificatorias):</strong>{' '}
          Nomenclatura oficial <code className="font-mono">0601AAAAMMRUC.ext</code>; separador de campos pipe (<code className="font-mono">|</code>) con pipe final obligatorio y salto de línea CRLF; códigos de catálogo Tabla 22 (0121 Básico, 0201 Asig. Familiar, 0105/0106 Horas Extras 25%/35%, 0601/0606/0608 AFP, 0607 ONP, 0605 Renta 5ta, 0804 EsSalud). El exportador de T-Registro (altas, bajas y modificaciones) opera en módulo separado.
        </div>
      </div>

      <VentanaModal
        abierto={Boolean(archivoPreview)}
        onCerrar={() => setArchivoPreview(null)}
        titulo={`Contenido Plano — ${archivoPreview?.nomenclatura || ''}`}
        ancho="lg"
        footer={
          <button
            type="button"
            onClick={() => setArchivoPreview(null)}
            className="h-6 px-3 text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]"
          >
            Cerrar
          </button>
        }
      >
        {archivoPreview && (
          <pre className="p-3 bg-[#111827] text-[#F9FAFB] font-mono text-[11px] overflow-auto max-h-80">
            {archivoPreview.contenido || '(Archivo sin registros en el período seleccionado)'}
          </pre>
        )}
      </VentanaModal>
    </div>
  );
};
