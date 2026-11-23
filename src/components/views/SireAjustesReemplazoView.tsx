import React, { useState } from 'react';
import { Download, ShieldCheck, Eye, Plus, Trash2, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';
import {
  useSireAnexosResumen,
  useGenerarAnexoSire,
  useSireAjustesAnexos,
  useCrearAjusteAnexoSire,
  useEliminarAjusteAnexoSire,
  useHistorialSire,
} from '../../hooks/useSire';
import {
  SireAnexoResumenItem,
  SireAjusteAnexo,
  ResultadoPaqueteSire,
  descargarArchivoZipBase64,
  descargarArchivoTxtUtf8,
} from '../../api/sireApi';

type CodigoAnexoAjuste = 'RVIE_ANEXO_4' | 'RVIE_ANEXO_5' | 'RCE_ANEXO_12_1' | 'RCE_ANEXO_12_2' | 'RCE_ANEXO_13_1' | 'RCE_ANEXO_13_2';

export const SireAjustesReemplazoView: React.FC = () => {
  const { state, notify } = useAppContext();
  const empresaId = state.activeEmpresa;
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-09');
  const [tab, setTab] = useState<'MATRIZ' | 'AJUSTES'>('MATRIZ');
  const [correlativo, setCorrelativo] = useState('01');
  const [oportunidadPreSire, setOportunidadPreSire] = useState<'04' | '05'>('04');
  const [sinMovimiento, setSinMovimiento] = useState(false);
  const [preview, setPreview] = useState<ResultadoPaqueteSire | null>(null);

  const [formAjuste, setFormAjuste] = useState({
    codigoAnexo: 'RCE_ANEXO_12_1' as CodigoAnexoAjuste,
    periodoAjustado: '2026-08',
    carOriginal: '',
    fechaEmision: '2026-08-15',
    tipoComprobante: '01',
    serie: 'F001',
    numero: '',
    docTercero: '',
    razonTercero: '',
    baseGravada: 0,
    igv: 0,
    total: 0,
    paisResidencia: '9249',
  });

  const { data: resumen, isLoading, isError, error } = useSireAnexosResumen(empresaId, periodo);
  const { data: ajustesGuardados = [] } = useSireAjustesAnexos(empresaId, { periodo });
  const { data: historial = [] } = useHistorialSire(empresaId, periodo);

  const generarMut = useGenerarAnexoSire(empresaId);
  const crearAjusteMut = useCrearAjusteAnexoSire(empresaId);
  const eliminarAjusteMut = useEliminarAjusteAnexoSire(empresaId);

  const generarPaquete = async (item: SireAnexoResumenItem, accion: 'ZIP' | 'TXT' | 'PREVIEW') => {
    try {
      const oportunidad =
        item.oportunidadPorDefecto === '04' ? oportunidadPreSire : (item.oportunidadPorDefecto as any);
      const res = await generarMut.mutateAsync({
        anexo: item.anexo,
        periodo,
        periodoAfectado: formAjuste.periodoAjustado || periodo,
        oportunidad,
        correlativo,
        sinMovimiento,
        incluirComprasMeAuto: true,
      });
      setPreview(res);
      if (accion === 'ZIP') {
        descargarArchivoZipBase64(res.nombreArchivoZip, res.zipBase64);
        notify(`Archivo ${res.nombreArchivoZip} generado (${res.totalFilas} filas, ${res.totalCampos} cols)`, 'success');
      } else if (accion === 'TXT') {
        descargarArchivoTxtUtf8(res.nombreArchivoTxt, res.contenidoTxt);
        notify(`Archivo ${res.nombreArchivoTxt} descargado`, 'success');
      } else {
        notify(
          res.validacion.esValido
            ? `Validación OK: ${res.nombreArchivoTxt} (${res.totalFilas} filas, ${res.totalCampos} campos)`
            : `Validación detectó ${res.validacion.totalErrores} observación(es)`,
          res.validacion.esValido ? 'success' : 'warning'
        );
      }
    } catch (err: any) {
      notify(err.message || 'Error generando paquete SIRE', 'error');
    }
  };

  const handleGuardarAjuste = async (e: React.FormEvent) => {
    e.preventDefault();
    const esSire = formAjuste.codigoAnexo === 'RVIE_ANEXO_4' || formAjuste.codigoAnexo === 'RCE_ANEXO_12_1' || formAjuste.codigoAnexo === 'RCE_ANEXO_12_2';
    if (esSire && formAjuste.carOriginal.trim().length !== 27) {
      notify('Para ajustes en períodos SIRE (Anexos 4, 12.1 y 12.2) el CAR CP a modificar de 27 dígitos es obligatorio', 'warning');
      return;
    }

    const registro =
      formAjuste.codigoAnexo === 'RVIE_ANEXO_4' || formAjuste.codigoAnexo === 'RVIE_ANEXO_5'
        ? 'RVIE'
        : formAjuste.codigoAnexo === 'RCE_ANEXO_12_2' || formAjuste.codigoAnexo === 'RCE_ANEXO_13_2'
          ? 'RCE_NO_DOMICILIADO'
          : 'RCE';

    try {
      await crearAjusteMut.mutateAsync({
        periodoPresentacion: periodo,
        periodoAjustado: formAjuste.periodoAjustado,
        registro,
        codigoAnexo: formAjuste.codigoAnexo,
        tipoOperacion: 'MODIFICACION',
        oportunidad: esSire ? '03' : oportunidadPreSire,
        correlativo,
        carOriginal: formAjuste.carOriginal.trim(),
        datosJson: {
          fechaEmision: formAjuste.fechaEmision,
          tipoComprobante: formAjuste.tipoComprobante,
          serie: formAjuste.serie,
          numero: formAjuste.numero,
          proveedorRuc: formAjuste.docTercero,
          proveedorNombre: formAjuste.razonTercero,
          clienteRuc: formAjuste.docTercero,
          clienteNombre: formAjuste.razonTercero,
          razonSocialNoDomiciliado: formAjuste.razonTercero,
          paisResidencia: formAjuste.paisResidencia,
          valorAdquisiciones: formAjuste.baseGravada,
          importeTotal: formAjuste.total,
          baseGravada: formAjuste.baseGravada,
          igv: formAjuste.igv,
          total: formAjuste.total,
          moneda: 'PEN',
          tipoCambio: 1,
        },
        estado: 'BORRADOR',
      });
      setFormAjuste({ ...formAjuste, numero: '', carOriginal: '' });
      notify('Ajuste posterior guardado en PostgreSQL', 'success');
    } catch (err: any) {
      notify(err.message || 'Error guardando ajuste posterior', 'error');
    }
  };

  const columnasMatriz: ColumnaTablaDensa<SireAnexoResumenItem>[] = [
    { key: 'registro', header: 'Módulo', width: '115px', render: (r) => <span className="font-bold text-[#1E3A5F]">{r.registro}</span> },
    { key: 'titulo', header: 'Anexo Oficial SUNAT', render: (r) => <span className="font-bold text-[#111827]">{r.titulo}</span> },
    { key: 'libro', header: 'Libro / Opp.', width: '95px', align: 'center', render: (r) => <span className="font-mono text-[11px]">{r.libro} ({r.oportunidadPorDefecto})</span> },
    { key: 'nomenclatura', header: 'Nomenclatura Oficial (G=2)', width: '260px', render: (r) => <span className="font-mono text-[11px] text-[#1E6F42] font-bold">{r.nombreArchivoZip}</span> },
    { key: 'totalCampos', header: 'Cols', width: '55px', align: 'center', render: (r) => <span className="font-mono font-bold">{r.totalCampos}</span> },
    { key: 'totalRegistros', header: 'Regs', width: '55px', align: 'right', render: (r) => <span className="font-mono font-bold">{r.totalRegistros}</span> },
    {
      key: 'acciones',
      header: 'Generar / Validar',
      width: '220px',
      align: 'center',
      render: (r) => (
        <div className="inline-flex items-center gap-1">
          <button type="button" onClick={() => generarPaquete(r, 'ZIP')} className="h-5 px-2 bg-[#1E3A5F] text-[#FFFFFF] text-[10px] inline-flex items-center gap-1 hover:bg-[#162C49]">
            <Download className="w-3 h-3" /> .ZIP
          </button>
          <button type="button" onClick={() => generarPaquete(r, 'TXT')} className="h-5 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[#111827] text-[10px]">
            .TXT
          </button>
          <button type="button" onClick={() => generarPaquete(r, 'PREVIEW')} className="h-5 px-2 bg-[#FFFFFF] border border-[#D1D5DB] text-[#1E3A5F] text-[10px] inline-flex items-center gap-1">
            <Eye className="w-3 h-3" /> Ver
          </button>
        </div>
      ),
    },
  ];

  const columnasAjustes: ColumnaTablaDensa<SireAjusteAnexo>[] = [
    { key: 'codigoAnexo', header: 'Anexo', width: '125px', render: (r) => <span className="font-mono font-bold text-[#1E3A5F]">{r.codigoAnexo}</span> },
    { key: 'periodoAjustado', header: 'Per. Ajustado', width: '90px', render: (r) => <span className="font-mono">{r.periodoAjustado}</span> },
    { key: 'carOriginal', header: 'CAR CP a Modificar', width: '215px', render: (r) => <span className="font-mono text-[11px]">{r.carOriginal || '(Sin CAR / Pre-SIRE)'}</span> },
    { key: 'doc', header: 'Comprobante', width: '130px', render: (r) => <span className="font-mono">{r.datosJson?.tipoComprobante} {r.datosJson?.serie}-{r.datosJson?.numero}</span> },
    { key: 'tercero', header: 'Tercero / Proveedor / Cliente', render: (r) => r.datosJson?.proveedorNombre || r.datosJson?.razonSocialNoDomiciliado || '-' },
    { key: 'total', header: 'Total', width: '85px', align: 'right', render: (r) => Number(r.datosJson?.total || 0).toFixed(2) },
    {
      key: 'del',
      header: 'Quitar',
      width: '60px',
      align: 'center',
      render: (r) => <button type="button" onClick={() => eliminarAjusteMut.mutate(r.id)} className="p-1 text-[#B91C1C]"><Trash2 className="w-3.5 h-3.5" /></button>,
    },
  ];

  const ajustesPosterioresLista = ajustesGuardados.filter((a) =>
    ['RVIE_ANEXO_4', 'RVIE_ANEXO_5', 'RCE_ANEXO_12_1', 'RCE_ANEXO_12_2', 'RCE_ANEXO_13_1', 'RCE_ANEXO_13_2'].includes(a.codigoAnexo)
  );

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="SIRE — Matriz Oficial de 13 Anexos (RVIE 2–5 y RCE 8–13) y Ajustes Posteriores"
        subtitulo="Generación ZIP/TXT desde PostgreSQL conforme a R.S. N° 000112-2021/SUNAT y R.S. N° 000040-2022/SUNAT"
        derecha={<SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="px-3 py-1.5 bg-[#F5F7FA] border-b border-[#D1D5DB] flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTab('MATRIZ')}
            className={`px-3 py-1 border font-bold ${tab === 'MATRIZ' ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F]' : 'bg-[#FFFFFF] border-[#D1D5DB]'}`}
          >
            Matriz Completa 13 Anexos ({resumen?.anexos?.length || 13})
          </button>
          <button
            type="button"
            onClick={() => setTab('AJUSTES')}
            className={`px-3 py-1 border font-bold ${tab === 'AJUSTES' ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F]' : 'bg-[#FFFFFF] border-[#D1D5DB]'}`}
          >
            Gestión de Ajustes Posteriores (Anexos 4, 5, 12, 13) ({ajustesPosterioresLista.length})
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-1">
            <span>Correlativo NN:</span>
            <input type="text" value={correlativo} onChange={(e) => setCorrelativo(e.target.value)} className="w-10 h-6 px-1 text-center font-mono border border-[#D1D5DB] bg-[#FFFFFF]" />
          </label>
          <label className="inline-flex items-center gap-1">
            <span>Pre-SIRE:</span>
            <select value={oportunidadPreSire} onChange={(e) => setOportunidadPreSire(e.target.value as '04' | '05')} className="h-6 px-1 border border-[#D1D5DB] bg-[#FFFFFF]">
              <option value="04">04 - General</option>
              <option value="05">05 - Simplificado</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={sinMovimiento} onChange={(e) => setSinMovimiento(e.target.checked)} />
            <span>Sin Movimiento (I=0)</span>
          </label>
          <div className="text-[#4B5563] flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#1E6F42]" />
            <span>UTF-8 + CRLF + G=2</span>
          </div>
        </div>
      </div>

      <div className="flex-1 p-3 overflow-auto flex flex-col gap-3">
        {tab === 'MATRIZ' ? (
          <TablaDensa
            columnas={columnasMatriz}
            datos={resumen?.anexos || []}
            rowKey={(r) => r.anexo}
            cargando={isLoading}
            mensajeError={isError ? (error as any)?.message || 'Error consultando resumen de anexos' : null}
          />
        ) : (
          <>
            <form onSubmit={handleGuardarAjuste} className="p-2.5 bg-[#F9FAFB] border border-[#D1D5DB] grid grid-cols-6 gap-2 text-[11px]">
              <select value={formAjuste.codigoAnexo} onChange={(e) => setFormAjuste({ ...formAjuste, codigoAnexo: e.target.value as CodigoAnexoAjuste })} className="col-span-2 h-7 px-2 border border-[#D1D5DB] font-bold">
                <option value="RCE_ANEXO_12_1">Anexo 12.1 — RCE Ajustes SIRE (08040003)</option>
                <option value="RCE_ANEXO_12_2">Anexo 12.2 — RCE No Dom. SIRE (08050003)</option>
                <option value="RCE_ANEXO_13_1">Anexo 13.1 — RCE Ajustes Pre-SIRE PLE (08040004)</option>
                <option value="RCE_ANEXO_13_2">Anexo 13.2 — RCE No Dom. Pre-SIRE PLE (08050004)</option>
                <option value="RVIE_ANEXO_4">Anexo 4 — RVIE Ajustes SIRE (14040003)</option>
                <option value="RVIE_ANEXO_5">Anexo 5 — RVIE Ajustes Pre-SIRE PLE (14040004)</option>
              </select>
              <input type="text" required placeholder="Período Ajustado (YYYY-MM)" value={formAjuste.periodoAjustado} onChange={(e) => setFormAjuste({ ...formAjuste, periodoAjustado: e.target.value })} className="h-7 px-2 font-mono border border-[#D1D5DB]" />
              <input type="text" placeholder="CAR CP a modificar (27 dígitos)" maxLength={27} value={formAjuste.carOriginal} onChange={(e) => setFormAjuste({ ...formAjuste, carOriginal: e.target.value })} className="col-span-2 h-7 px-2 font-mono border border-[#D1D5DB]" />
              <input type="date" required value={formAjuste.fechaEmision} onChange={(e) => setFormAjuste({ ...formAjuste, fechaEmision: e.target.value })} className="h-7 px-2 border border-[#D1D5DB]" />

              <input type="text" required placeholder="Tipo (01/07/91)" value={formAjuste.tipoComprobante} onChange={(e) => setFormAjuste({ ...formAjuste, tipoComprobante: e.target.value })} className="h-7 px-2 border border-[#D1D5DB]" />
              <input type="text" placeholder="Serie" value={formAjuste.serie} onChange={(e) => setFormAjuste({ ...formAjuste, serie: e.target.value })} className="h-7 px-2 border border-[#D1D5DB]" />
              <input type="text" required placeholder="Número" value={formAjuste.numero} onChange={(e) => setFormAjuste({ ...formAjuste, numero: e.target.value })} className="h-7 px-2 border border-[#D1D5DB]" />
              <input type="text" placeholder="RUC / DNI Tercero" value={formAjuste.docTercero} onChange={(e) => setFormAjuste({ ...formAjuste, docTercero: e.target.value })} className="h-7 px-2 border border-[#D1D5DB]" />
              <input type="text" required placeholder="Razón Social Tercero" value={formAjuste.razonTercero} onChange={(e) => setFormAjuste({ ...formAjuste, razonTercero: e.target.value })} className="col-span-2 h-7 px-2 border border-[#D1D5DB]" />

              <input type="number" step="0.01" placeholder="Base" value={formAjuste.baseGravada} onChange={(e) => {
                const base = Number(e.target.value);
                const igv = Number((base * 0.18).toFixed(2));
                setFormAjuste({ ...formAjuste, baseGravada: base, igv, total: Number((base + igv).toFixed(2)) });
              }} className="h-7 px-2 border border-[#D1D5DB]" />
              <input type="number" step="0.01" placeholder="IGV" value={formAjuste.igv} onChange={(e) => setFormAjuste({ ...formAjuste, igv: Number(e.target.value) })} className="h-7 px-2 border border-[#D1D5DB]" />
              <input type="number" step="0.01" placeholder="Total" value={formAjuste.total} onChange={(e) => setFormAjuste({ ...formAjuste, total: Number(e.target.value) })} className="h-7 px-2 border border-[#D1D5DB] font-bold" />
              <button type="submit" disabled={crearAjusteMut.isPending} className="col-span-3 h-7 px-3 bg-[#1E3A5F] text-[#FFFFFF] font-bold inline-flex items-center justify-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Registrar Ajuste Posterior en PostgreSQL
              </button>
            </form>

            <TablaDensa columnas={columnasAjustes} datos={ajustesPosterioresLista} rowKey={(r) => r.id} />

            {historial.length > 0 && (
              <div className="border border-[#D1D5DB] p-2 text-[11px]">
                <div className="font-bold text-[#1E3A5F] mb-1">Historial de Generaciones SIRE del Período ({historial.length})</div>
                <div className="max-h-28 overflow-auto divide-y divide-[#E5E7EB]">
                  {historial.slice(0, 8).map((h: any) => (
                    <div key={h.id} className="py-1 flex items-center justify-between font-mono text-[10px]">
                      <span>{h.nombreArchivo} ({h.subtipo})</span>
                      <span>Regs: {h.totalRegistros} · SHA-256: {String(h.hashSha256 || '').slice(0, 16)}...</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {preview && (
          <div className="border border-[#D1D5DB] bg-[#F9FAFB] p-2.5 text-[11px]">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 font-bold">
                {preview.validacion.esValido ? (
                  <CheckCircle2 className="w-4 h-4 text-[#1E6F42]" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-[#B91C1C]" />
                )}
                <span className="text-[#1E3A5F]">{preview.nombreArchivoZip}</span>
                <span className="font-mono text-[#4B5563]">({preview.totalFilas} filas · {preview.totalCampos} cols · SHA-256: {preview.hashSha256.slice(0, 14)}...)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => descargarArchivoZipBase64(preview.nombreArchivoZip, preview.zipBase64)} className="px-2 py-0.5 bg-[#1E6F42] text-[#FFFFFF]">
                  Descargar .ZIP
                </button>
                <button type="button" onClick={() => descargarArchivoTxtUtf8(preview.nombreArchivoTxt, preview.contenidoTxt)} className="px-2 py-0.5 bg-[#1E3A5F] text-[#FFFFFF]">
                  Descargar .TXT
                </button>
                <button type="button" onClick={() => setPreview(null)} className="p-0.5 text-[#4B5563]">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {preview.validacion.errores.length > 0 && (
              <div className="mb-1.5 p-1.5 bg-[#FEF2F2] border border-[#FCA5A5] text-[#991B1B] text-[10px]">
                {preview.validacion.errores.slice(0, 5).map((err, i) => (
                  <div key={i}>Línea {err.linea}, Col {err.columna} ({err.nombreCampo}): {err.mensaje}</div>
                ))}
              </div>
            )}
            <pre className="bg-[#FFFFFF] border border-[#D1D5DB] p-2 font-mono text-[10px] max-h-36 overflow-auto">
              {preview.contenidoTxt || '(Archivo vacío válido para período sin movimiento I=0)'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
