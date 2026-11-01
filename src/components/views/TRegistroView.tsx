import React, { useState, useEffect } from 'react';
import { Download, ShieldCheck, FileArchive, Eye, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { useToast } from '../../context/ToastContext';
import { useExportarTRegistro } from '../../hooks/useTesoreriaPlanilla';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';

interface ArchivoTRegistroItem {
  codigo: string;
  nombreArchivo: string;
  estructura: string;
  descripcion: string;
  contenido: string;
  lineas: number;
}

export const TRegistroView: React.FC = () => {
  const { empresaActiva } = useEmpresaPeriodo();
  const empresaId = empresaActiva?.id || '00000000-0000-0000-0000-000000000001';
  const ruc = empresaActiva?.ruc || '20601234567';
  const { success, error } = useToast();

  const exportarMutation = useExportarTRegistro(empresaId);
  const [datosTRegistro, setDatosTRegistro] = useState<any | null>(null);
  const [previewItem, setPreviewItem] = useState<ArchivoTRegistroItem | null>(null);

  const cargarTRegistro = async () => {
    try {
      const res = await exportarMutation.mutateAsync();
      setDatosTRegistro(res);
    } catch (err: any) {
      error(err?.response?.data?.error || err.message || 'Error al generar estructuras T-Registro', 'Error');
    }
  };

  useEffect(() => {
    cargarTRegistro();
  }, [empresaId]);

  const contarLineas = (txt: string) =>
    (txt || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean).length;

  const archivos: ArchivoTRegistroItem[] = [
    {
      codigo: 'EST-05',
      nombreArchivo: `RP_${ruc}.tra`,
      estructura: 'Estructura 05 — Datos Laborales del Trabajador (.tra)',
      descripcion:
        'Tipo Doc | N° Doc | País | Régimen Laboral | Categoría Ocupacional | Tipo Contrato | Periodicidad | Monto Básico | Situación | Cuenta Haberes |',
      contenido: datosTRegistro?.archivos?.tra || '',
      lineas: contarLineas(datosTRegistro?.archivos?.tra || '')
    },
    {
      codigo: 'EST-11',
      nombreArchivo: `RP_${ruc}.per`,
      estructura: 'Estructura 11 — Períodos Laborales, Altas, Bajas y Régimen Pensionario (.per)',
      descripcion:
        'Tipo Doc | N° Doc | Categoría (1=Trabajador) | Tipo Registro (1=Período, 2=T.Trab, 3=Salud, 4=Pensión) | Fecha Inicio | Fecha Fin (Cese) | Motivo Baja |',
      contenido: datosTRegistro?.archivos?.per || '',
      lineas: contarLineas(datosTRegistro?.archivos?.per || '')
    },
    {
      codigo: 'ALTAS',
      nombreArchivo: `RP_${ruc}_altas.txt`,
      estructura: 'Reporte de Altas de Trabajadores para Importación Masiva',
      descripcion: 'Movimientos de ingreso de nuevos trabajadores registrados en el padrón con fecha de inicio.',
      contenido: datosTRegistro?.archivos?.altas || '',
      lineas: contarLineas(datosTRegistro?.archivos?.altas || '')
    },
    {
      codigo: 'BAJAS',
      nombreArchivo: `RP_${ruc}_bajas.txt`,
      estructura: 'Reporte de Bajas / Ceses de Trabajadores (Mitad o Fin de Mes)',
      descripcion: 'Movimientos de extinción del vínculo laboral con fecha efectiva de cese y código de motivo.',
      contenido: datosTRegistro?.archivos?.bajas || '',
      lineas: contarLineas(datosTRegistro?.archivos?.bajas || '')
    },
    {
      codigo: 'MODIF',
      nombreArchivo: `RP_${ruc}_modificaciones.txt`,
      estructura: 'Reporte de Modificaciones Contractuales y Previsionales',
      descripcion: 'Cambios de remuneración básica, régimen pensionario (ONP/AFP), CUSPP o cuenta bancaria.',
      contenido: datosTRegistro?.archivos?.modificaciones || '',
      lineas: contarLineas(datosTRegistro?.archivos?.modificaciones || '')
    }
  ];

  const descargarTxt = (item: ArchivoTRegistroItem) => {
    const blob = new Blob([item.contenido], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
    success(`Archivo T-Registro ${item.nombreArchivo} descargado.`, 'T-Registro');
  };

  const descargarZip = () => {
    if (!datosTRegistro?.zipBase64) return;
    const byteChars = atob(datosTRegistro.zipBase64);
    const byteNums = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNums[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = datosTRegistro.nombreArchivoZip || `TREGISTRO_${ruc}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    success('Paquete ZIP de T-Registro descargado.', 'T-Registro');
  };

  const columnasArchivos: ColumnaTablaDensa<ArchivoTRegistroItem>[] = [
    { key: 'codigo', header: 'Cód.', width: '75px', align: 'center', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.codigo}</span> },
    { key: 'estructura', header: 'Estructura T-Registro (SUNAT Operaciones en Línea)', width: '320px', render: (r) => <span className="font-bold">{r.estructura}</span> },
    { key: 'descripcion', header: 'Campos y Contenido Oficial', render: (r) => <span className="text-[11px]">{r.descripcion}</span> },
    { key: 'lineas', header: 'Filas', width: '65px', align: 'center', render: (r) => <span className="font-mono font-bold">{r.lineas}</span> },
    { key: 'nombreArchivo', header: 'Archivo Generado', width: '195px', render: (r) => <span className="font-mono text-[#1E6F42] font-bold">{r.nombreArchivo}</span> },
    {
      key: 'acciones',
      header: 'Exportar',
      width: '150px',
      align: 'center',
      render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => setPreviewItem(r)}
            className="h-5 px-1.5 text-[10px] border border-[#D1D5DB] bg-[#FFFFFF] hover:bg-[#F3F4F6] inline-flex items-center gap-0.5"
          >
            <Eye className="w-3 h-3 text-[#1D4ED8]" />
            Ver
          </button>
          <button
            type="button"
            onClick={() => descargarTxt(r)}
            className="h-5 px-2 bg-[#1E3A5F] text-[#FFFFFF] text-[10px] font-bold inline-flex items-center gap-1"
          >
            <Download className="w-3 h-3" />
            Descargar
          </button>
        </div>
      )
    }
  ];

  const movimientos = datosTRegistro?.movimientos || [];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Exportador Independiente de T-Registro (Altas, Bajas y Modificaciones)"
        subtitulo="Generación separada de estructuras masivas .tra y .per para carga en SUNAT Operaciones en Línea (SOL)"
        acciones={[
          {
            id: 'refrescar-treg',
            label: 'Validar y Regenerar Archivos T-Registro',
            icono: RefreshCw,
            onClick: cargarTRegistro
          },
          {
            id: 'zip-treg',
            label: `Descargar Paquete TREGISTRO_${ruc}.zip`,
            icono: FileArchive,
            primario: true,
            disabled: !datosTRegistro?.zipBase64,
            onClick: descargarZip
          }
        ]}
      />

      {datosTRegistro?.validacion && (
        <div className="mx-3 mt-2 p-2 bg-[#F0FDF4] border border-[#86EFAC] text-[#166534] text-[11px] flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold">
            <CheckCircle2 className="w-4 h-4" />
            <span>
              VALIDACIÓN T-REGISTRO:{' '}
              {datosTRegistro.validacion.esValido ? 'ESTRUCTURAS .TRA Y .PER CONFORMES' : 'CON OBSERVACIONES'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Exportador independiente de PDT PLAME</span>
          </div>
        </div>
      )}

      <div className="flex-1 p-3 overflow-auto space-y-3">
        <TablaDensa columnas={columnasArchivos} datos={archivos} rowKey={(r) => r.codigo} />

        {/* Bitácora de Movimientos de Altas, Bajas y Modificaciones */}
        <div className="border border-[#D1D5DB]">
          <div className="px-3 py-1.5 bg-[#E8ECF1] border-b border-[#D1D5DB] font-bold text-[11px] text-[#111827]">
            Bitácora de Movimientos T-Registro (Altas, Bajas y Modificaciones Registradas: {movimientos.length})
          </div>
          <div className="max-h-48 overflow-auto">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead className="bg-[#F8FAFC] border-b border-[#D1D5DB]">
                <tr>
                  <th className="py-1 px-2 border-r border-[#D1D5DB]">Tipo Mov.</th>
                  <th className="py-1 px-2 border-r border-[#D1D5DB]">Fecha Efectiva</th>
                  <th className="py-1 px-2 border-r border-[#D1D5DB]">Motivo / Detalle</th>
                  <th className="py-1 px-2">Línea Estructura Generada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {movimientos.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-3 text-center text-[#6B7280]">
                      Los movimientos de alta, modificación o baja registrados en Trabajadores o Liquidaciones aparecerán aquí automáticamente.
                    </td>
                  </tr>
                ) : (
                  movimientos.map((m: any) => (
                    <tr key={m.id}>
                      <td className="py-1 px-2 font-mono font-bold border-r border-[#E5E7EB]">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] ${
                            m.tipoMovimiento === 'ALTA'
                              ? 'bg-[#DCFCE7] text-[#166534]'
                              : m.tipoMovimiento === 'BAJA'
                              ? 'bg-[#FEE2E2] text-[#991B1B]'
                              : 'bg-[#DBEAFE] text-[#1E40AF]'
                          }`}
                        >
                          {m.tipoMovimiento}
                        </span>
                      </td>
                      <td className="py-1 px-2 font-mono border-r border-[#E5E7EB]">{m.fechaEfectiva}</td>
                      <td className="py-1 px-2 border-r border-[#E5E7EB]">{m.motivo}</td>
                      <td className="py-1 px-2 font-mono text-[10px] text-[#4B5563]">{m.lineaExportacion}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <VentanaModal
        abierto={Boolean(previewItem)}
        onCerrar={() => setPreviewItem(null)}
        titulo={`Vista Previa — ${previewItem?.nombreArchivo || ''}`}
        ancho="lg"
        footer={
          <button
            type="button"
            onClick={() => setPreviewItem(null)}
            className="h-6 px-3 text-[12px] border border-[#D1D5DB] bg-[#FFFFFF]"
          >
            Cerrar
          </button>
        }
      >
        {previewItem && (
          <pre className="p-3 bg-[#111827] text-[#F9FAFB] font-mono text-[11px] overflow-auto max-h-80">
            {previewItem.contenido || '(Sin registros para este tipo de movimiento)'}
          </pre>
        )}
      </VentanaModal>
    </div>
  );
};
