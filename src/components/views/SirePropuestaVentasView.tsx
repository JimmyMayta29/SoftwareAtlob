import React, { useRef, useState } from 'react';
import { Download, RefreshCw, Upload } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';
import { useGenerarAnexoSire, useSirePropuestaPeriodo } from '../../hooks/useSire';
import { descargarArchivoZipBase64, sireApi } from '../../api/sireApi';

interface FilaVistaRvie {
  id: string;
  carSunat: string;
  fechaEmision: string;
  tipoComp: string;
  serie: string;
  numero: string;
  docCliente: string;
  razonSocialCliente: string;
  biGravada: number;
  igv: number;
  total: number;
  moneda: string;
  estado?: string;
}

export const SirePropuestaVentasView: React.FC = () => {
  const { state, notify } = useAppContext();
  const empresaId = state.activeEmpresa;
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-09');
  const [modoVista, setModoVista] = useState<'PROPUESTA' | 'ERP'>('PROPUESTA');
  const [subiendo, setSubiendo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useSirePropuestaPeriodo(empresaId, 'VENTAS', periodo);
  const generarAnexoMutation = useGenerarAnexoSire(empresaId);

  const filasPropuesta: FilaVistaRvie[] = (data?.propuestaSunat?.lineas || []).map((l: any, i: number) => ({
    id: `sunat-${i}-${l.car || l.numero}`,
    carSunat: l.car || '-',
    fechaEmision: l.fechaEmision || '',
    tipoComp: l.tipoComprobante || '01',
    serie: l.serie || '',
    numero: l.numero || '',
    docCliente: l.rucReceptor || '',
    razonSocialCliente: l.razonSocialReceptor || '',
    biGravada: Number(l.baseGravada || 0),
    igv: Number(l.igv || 0),
    total: Number(l.total || 0),
    moneda: l.moneda || 'PEN',
  }));

  const filasErp: FilaVistaRvie[] = (data?.registrosErp || []).map((v: any) => ({
    id: v.id,
    carSunat: v.car || '-',
    fechaEmision: v.fechaEmision || '',
    tipoComp: v.tipoComprobante || '01',
    serie: v.serie || '',
    numero: v.numero || '',
    docCliente: v.clienteRuc || '',
    razonSocialCliente: v.clienteNombre || '',
    biGravada: v.estado === 'ANULADO' ? 0 : Number(v.baseGravada || 0),
    igv: v.estado === 'ANULADO' ? 0 : Number(v.igv || 0),
    total: v.estado === 'ANULADO' ? 0 : Number(v.total || 0),
    moneda: v.moneda || 'PEN',
    estado: v.estado,
  }));

  const filasMostrar = modoVista === 'PROPUESTA' ? filasPropuesta : filasErp;

  const totales = filasMostrar.reduce(
    (acc, r) => ({
      bi: acc.bi + r.biGravada,
      igv: acc.igv + r.igv,
      total: acc.total + r.total,
    }),
    { bi: 0, igv: 0, total: 0 }
  );

  const handleImportarArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setSubiendo(true);
      const buf = await file.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      const res = await sireApi.importarPropuestaManual(empresaId, 'VENTAS', periodo, file.name, base64);
      await queryClient.invalidateQueries({ queryKey: ['sirePropuestaPeriodo', empresaId, 'VENTAS', periodo] });
      notify(`Propuesta RVIE importada desde ${file.name} (${res.totalRegistros || 0} comprobantes)`, 'success');
    } catch (err: any) {
      notify(err.message || 'Error importando propuesta RVIE', 'error');
    } finally {
      setSubiendo(false);
      e.target.value = '';
    }
  };

  const handleExportarReemplazoZip = async () => {
    try {
      const res = await generarAnexoMutation.mutateAsync({
        anexo: 'RVIE_ANEXO_3',
        periodo,
        sinMovimiento: filasErp.length === 0,
      });
      descargarArchivoZipBase64(res.nombreArchivoZip, res.zipBase64);
      notify(`Reemplazo RVIE Anexo 3 (${res.nombreArchivoZip}) generado con ${res.totalFilas} filas`, 'success');
    } catch (err: any) {
      notify(err.message || 'Error generando Anexo 3 RVIE', 'error');
    }
  };

  const columnas: ColumnaTablaDensa<FilaVistaRvie>[] = [
    { key: 'carSunat', header: 'CAR SUNAT (27 dígitos)', width: '210px', render: (r) => <span className="font-mono text-[11px] font-bold text-[#1E3A5F]">{r.carSunat}</span> },
    { key: 'fechaEmision', header: 'F. Emisión', width: '90px', render: (r) => <span className="font-mono">{r.fechaEmision}</span> },
    { key: 'tipoComp', header: 'Tipo', width: '50px', align: 'center', render: (r) => <span className="font-mono">{r.tipoComp}</span> },
    { key: 'serie', header: 'Serie', width: '65px', render: (r) => <span className="font-mono">{r.serie}</span> },
    { key: 'numero', header: 'Número', width: '90px', render: (r) => <span className="font-mono">{r.numero}</span> },
    { key: 'docCliente', header: 'RUC/DNI Cliente', width: '105px', render: (r) => <span className="font-mono">{r.docCliente}</span> },
    { key: 'razonSocialCliente', header: 'Denominación del Adquirente o Usuario', render: (r) => r.razonSocialCliente },
    { key: 'moneda', header: 'Mon.', width: '50px', align: 'center', render: (r) => <span className="font-mono">{r.moneda}</span> },
    { key: 'biGravada', header: 'BI Gravada', width: '95px', align: 'right', render: (r) => r.biGravada.toFixed(2) },
    { key: 'igv', header: 'IGV / IPM', width: '85px', align: 'right', render: (r) => r.igv.toFixed(2) },
    { key: 'total', header: 'Total CP', width: '95px', align: 'right', render: (r) => <span className="font-bold">{r.total.toFixed(2)}</span> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <input
        ref={inputRef}
        type="file"
        accept=".zip,.txt"
        onChange={handleImportarArchivo}
        className="hidden"
      />
      <BarraHerramientasLocal
        titulo="SIRE — Propuesta RVIE (Anexo 2) y Reemplazo Oficial (Anexo 3 — 140400)"
        subtitulo="Consulta persistente desde PostgreSQL de la Propuesta RVIE y Ventas registradas del período"
        acciones={[
          {
            id: 'importar-manual',
            label: subiendo ? 'Importando...' : 'Cargar ZIP/TXT Propuesta',
            icono: Upload,
            onClick: () => inputRef.current?.click(),
          },
          {
            id: 'reemplazo-zip',
            label: 'Exportar Reemplazo ZIP (Anexo 3)',
            icono: Download,
            primario: true,
            onClick: handleExportarReemplazoZip,
          },
          {
            id: 'refrescar',
            label: 'Actualizar',
            icono: RefreshCw,
            onClick: () => refetch(),
          },
        ]}
        derecha={<SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="px-3 py-1.5 bg-[#F5F7FA] border-b border-[#D1D5DB] flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setModoVista('PROPUESTA')}
            className={`px-2.5 py-1 border text-[11px] font-bold ${modoVista === 'PROPUESTA' ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F]' : 'bg-[#FFFFFF] text-[#374151] border-[#D1D5DB]'}`}
          >
            Propuesta SUNAT Importada ({filasPropuesta.length})
          </button>
          <button
            type="button"
            onClick={() => setModoVista('ERP')}
            className={`px-2.5 py-1 border text-[11px] font-bold ${modoVista === 'ERP' ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F]' : 'bg-[#FFFFFF] text-[#374151] border-[#D1D5DB]'}`}
          >
            Ventas del ERP para Reemplazo ({filasErp.length})
          </button>
        </div>

        <div className="flex items-center gap-4 text-[11px] font-mono">
          <span>Base: <strong>{totales.bi.toFixed(2)}</strong></span>
          <span>IGV: <strong>{totales.igv.toFixed(2)}</strong></span>
          <span>Total: <strong className="text-[#1E3A5F]">{totales.total.toFixed(2)}</strong></span>
        </div>
      </div>

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={filasMostrar}
          rowKey={(r) => r.id}
          cargando={isLoading}
          mensajeError={isError ? (error as any)?.message || 'Error cargando propuesta RVIE' : null}
          mensajeVacio={
            modoVista === 'PROPUESTA'
              ? 'No hay propuesta RVIE cargada para este período. Use "Cargar ZIP/TXT Propuesta" o consulte "Ventas del ERP".'
              : 'No hay ventas registradas en el ERP para este período.'
          }
        />
      </div>
    </div>
  );
};
