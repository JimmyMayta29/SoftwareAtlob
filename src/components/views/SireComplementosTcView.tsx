import React, { useState } from 'react';
import { Plus, Download, Trash2, CheckCircle2 } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';
import {
  useSireAjustesAnexos,
  useCrearAjusteAnexoSire,
  useEliminarAjusteAnexoSire,
  useGenerarAnexoSire,
  useSireTipoCambioCandidatos,
} from '../../hooks/useSire';
import {
  SireAjusteAnexo,
  ResultadoPaqueteSire,
  descargarArchivoZipBase64,
  descargarArchivoTxtUtf8,
} from '../../api/sireApi';

type TabComplemento = 'ANEXO_2_RVIE' | 'ANEXO_8_RCE' | 'ANEXO_10_TC';

export const SireComplementosTcView: React.FC = () => {
  const { state, notify } = useAppContext();
  const empresaId = state.activeEmpresa;
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-09');
  const [tab, setTab] = useState<TabComplemento>('ANEXO_2_RVIE');
  const [correlativo, setCorrelativo] = useState('01');
  const [preview, setPreview] = useState<ResultadoPaqueteSire | null>(null);

  // Formularios compactos por pestaña
  const [formRvie, setFormRvie] = useState({
    fechaEmision: `${periodo}-10`,
    tipoComprobante: '03',
    serie: 'B001',
    numero: '',
    clienteRuc: '',
    clienteNombre: 'CLIENTES VARIOS',
    baseGravada: 0,
    igv: 0,
    total: 0,
    moneda: 'PEN',
    tipoCambio: 1,
  });

  const [formRceCp, setFormRceCp] = useState({
    fechaEmision: `${periodo}-10`,
    tipoComprobante: '14',
    serie: 'S001',
    numero: '',
    proveedorRuc: '',
    proveedorNombre: '',
    baseGravada: 0,
    igv: 0,
    total: 0,
    moneda: 'PEN',
    tipoCambio: 1,
    tipoAdquisicion: '1',
  });

  const [formInex, setFormInex] = useState({
    carOriginal: '',
    tipoOperacion: 'EXCLUSION' as 'INCLUSION' | 'EXCLUSION',
  });

  const [formTc, setFormTc] = useState({
    fechaEmision: `${periodo}-10`,
    moneda: 'USD',
    tipoCambio: 3.75,
    carOriginal: '',
  });

  const { data: itemsRvie = [] } = useSireAjustesAnexos(empresaId, { periodo, codigoAnexo: 'RVIE_ANEXO_2' });
  const { data: itemsRceCp = [] } = useSireAjustesAnexos(empresaId, { periodo, codigoAnexo: 'RCE_ANEXO_8_CP' });
  const { data: itemsRceInex = [] } = useSireAjustesAnexos(empresaId, { periodo, codigoAnexo: 'RCE_ANEXO_8_INEX' });
  const { data: candidatosTc } = useSireTipoCambioCandidatos(empresaId, periodo);

  const crearMut = useCrearAjusteAnexoSire(empresaId);
  const eliminarMut = useEliminarAjusteAnexoSire(empresaId);
  const generarMut = useGenerarAnexoSire(empresaId);

  const generarYDescargar = async (
    anexo: 'RVIE_ANEXO_2' | 'RCE_ANEXO_8_CP' | 'RCE_ANEXO_8_INEX' | 'RCE_ANEXO_10',
    descargar = true
  ) => {
    try {
      const res = await generarMut.mutateAsync({ anexo, periodo, correlativo, incluirComprasMeAuto: true });
      setPreview(res);
      if (descargar) {
        descargarArchivoZipBase64(res.nombreArchivoZip, res.zipBase64);
        notify(`Archivo ${res.nombreArchivoZip} generado (${res.totalFilas} filas)`, 'success');
      }
    } catch (err: any) {
      notify(err.message || 'Error generando archivo SIRE', 'error');
    }
  };

  const guardarRvieAnexo2 = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await crearMut.mutateAsync({
        periodoPresentacion: periodo,
        periodoAjustado: periodo,
        registro: 'RVIE',
        codigoAnexo: 'RVIE_ANEXO_2',
        tipoOperacion: 'INCLUSION',
        oportunidad: '01',
        correlativo,
        carOriginal: '',
        datosJson: formRvie,
        estado: 'BORRADOR',
      });
      setFormRvie({ ...formRvie, numero: '', baseGravada: 0, igv: 0, total: 0 });
      notify('Comprobante agregado al Complemento RVIE (Anexo 2)', 'success');
    } catch (err: any) {
      notify(err.message || 'Error agregando complemento RVIE', 'error');
    }
  };

  const guardarRceCp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await crearMut.mutateAsync({
        periodoPresentacion: periodo,
        periodoAjustado: periodo,
        registro: 'RCE',
        codigoAnexo: 'RCE_ANEXO_8_CP',
        tipoOperacion: 'INCLUSION',
        oportunidad: '01',
        correlativo,
        carOriginal: '',
        datosJson: formRceCp,
        estado: 'BORRADOR',
      });
      setFormRceCp({ ...formRceCp, numero: '', baseGravada: 0, igv: 0, total: 0 });
      notify('Comprobante agregado al Complemento RCE -CP- (Anexo 8)', 'success');
    } catch (err: any) {
      notify(err.message || 'Error agregando complemento RCE', 'error');
    }
  };

  const guardarInex = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formInex.carOriginal.trim().length !== 27) {
      notify('El CAR SUNAT debe tener exactamente 27 caracteres', 'warning');
      return;
    }
    try {
      await crearMut.mutateAsync({
        periodoPresentacion: periodo,
        periodoAjustado: periodo,
        registro: 'RCE',
        codigoAnexo: 'RCE_ANEXO_8_INEX',
        tipoOperacion: formInex.tipoOperacion,
        oportunidad: '01',
        correlativo,
        carOriginal: formInex.carOriginal.trim(),
        datosJson: {
          carSunat: formInex.carOriginal.trim(),
          indicador: formInex.tipoOperacion === 'INCLUSION' ? '1' : '2',
        },
        estado: 'BORRADOR',
      });
      setFormInex({ ...formInex, carOriginal: '' });
      notify('Registro agregado a RCEINEX (Anexo 8)', 'success');
    } catch (err: any) {
      notify(err.message || 'Error agregando exclusión/inclusión', 'error');
    }
  };

  const guardarTc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formTc.carOriginal.trim().length !== 27) {
      notify('El CAR SUNAT debe tener exactamente 27 caracteres', 'warning');
      return;
    }
    try {
      await crearMut.mutateAsync({
        periodoPresentacion: periodo,
        periodoAjustado: periodo,
        registro: 'RCE',
        codigoAnexo: 'RCE_ANEXO_10',
        tipoOperacion: 'TIPO_CAMBIO',
        oportunidad: '01',
        correlativo,
        carOriginal: formTc.carOriginal.trim(),
        datosJson: { ...formTc, carSunat: formTc.carOriginal.trim() },
        estado: 'BORRADOR',
      });
      setFormTc({ ...formTc, carOriginal: '' });
      notify('Tipo de cambio agregado a RCETCA (Anexo 10)', 'success');
    } catch (err: any) {
      notify(err.message || 'Error guardando tipo de cambio', 'error');
    }
  };

  const colsAjusteGen: ColumnaTablaDensa<SireAjusteAnexo>[] = [
    { key: 'fecha', header: 'F. Emisión', width: '90px', render: (r) => <span className="font-mono">{r.datosJson?.fechaEmision || '-'}</span> },
    { key: 'doc', header: 'Comprobante', width: '130px', render: (r) => <span className="font-mono">{r.datosJson?.tipoComprobante} {r.datosJson?.serie}-{r.datosJson?.numero}</span> },
    { key: 'tercero', header: 'Tercero / Detalle', render: (r) => r.datosJson?.proveedorNombre || r.datosJson?.clienteNombre || r.carOriginal },
    { key: 'total', header: 'Total', width: '90px', align: 'right', render: (r) => Number(r.datosJson?.total || 0).toFixed(2) },
    {
      key: 'del',
      header: 'Quitar',
      width: '65px',
      align: 'center',
      render: (r) => (
        <button type="button" onClick={() => eliminarMut.mutate(r.id)} className="p-1 text-[#B91C1C] hover:bg-[#FEE2E2]">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  const todasTc = [...(candidatosTc?.guardados || []), ...(candidatosTc?.comprasMe || [])];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="SIRE — Complementos de Propuesta (Anexo 2 RVIE, Anexo 8 RCE) y Tipo de Cambio (Anexo 10)"
        subtitulo="Incorporación de comprobantes físicos, exclusión/inclusión por CAR SUNAT y carga masiva RCETCA"
        derecha={
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold">Correlativo:</label>
            <input
              type="text"
              value={correlativo}
              onChange={(e) => setCorrelativo(e.target.value)}
              className="w-12 h-6 px-1.5 border border-[#D1D5DB] font-mono text-[11px] text-center"
            />
            <SelectorPeriodo periodo={periodo} onChange={setPeriodo} />
          </div>
        }
      />

      <div className="px-3 py-1.5 bg-[#F5F7FA] border-b border-[#D1D5DB] flex gap-1.5 text-[11px]">
        <button
          type="button"
          onClick={() => setTab('ANEXO_2_RVIE')}
          className={`px-3 py-1 border font-bold ${tab === 'ANEXO_2_RVIE' ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F]' : 'bg-[#FFFFFF] border-[#D1D5DB]'}`}
        >
          Anexo 2 — Complemento RVIE ({itemsRvie.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('ANEXO_8_RCE')}
          className={`px-3 py-1 border font-bold ${tab === 'ANEXO_8_RCE' ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F]' : 'bg-[#FFFFFF] border-[#D1D5DB]'}`}
        >
          Anexo 8 — Complemento / INEX RCE ({itemsRceCp.length + itemsRceInex.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('ANEXO_10_TC')}
          className={`px-3 py-1 border font-bold ${tab === 'ANEXO_10_TC' ? 'bg-[#1E3A5F] text-[#FFFFFF] border-[#1E3A5F]' : 'bg-[#FFFFFF] border-[#D1D5DB]'}`}
        >
          Anexo 10 — Tipo de Cambio RCETCA ({todasTc.length})
        </button>
      </div>

      <div className="flex-1 p-3 overflow-auto flex flex-col gap-3">
        {tab === 'ANEXO_2_RVIE' && (
          <>
            <form onSubmit={guardarRvieAnexo2} className="p-2.5 bg-[#F9FAFB] border border-[#D1D5DB] grid grid-cols-6 gap-2 text-[11px]">
              <input type="date" required value={formRvie.fechaEmision} onChange={(e) => setFormRvie({ ...formRvie, fechaEmision: e.target.value })} className="h-7 px-2 border border-[#D1D5DB]" />
              <input type="text" required placeholder="Tipo (03/01)" value={formRvie.tipoComprobante} onChange={(e) => setFormRvie({ ...formRvie, tipoComprobante: e.target.value })} className="h-7 px-2 border border-[#D1D5DB]" />
              <input type="text" required placeholder="Serie" value={formRvie.serie} onChange={(e) => setFormRvie({ ...formRvie, serie: e.target.value })} className="h-7 px-2 border border-[#D1D5DB]" />
              <input type="text" required placeholder="Número" value={formRvie.numero} onChange={(e) => setFormRvie({ ...formRvie, numero: e.target.value })} className="h-7 px-2 border border-[#D1D5DB]" />
              <input type="text" placeholder="RUC/DNI Cliente" value={formRvie.clienteRuc} onChange={(e) => setFormRvie({ ...formRvie, clienteRuc: e.target.value })} className="h-7 px-2 border border-[#D1D5DB]" />
              <input type="text" required placeholder="Cliente" value={formRvie.clienteNombre} onChange={(e) => setFormRvie({ ...formRvie, clienteNombre: e.target.value })} className="h-7 px-2 border border-[#D1D5DB]" />
              <input type="number" step="0.01" placeholder="Base" value={formRvie.baseGravada} onChange={(e) => {
                const base = Number(e.target.value);
                const igv = Number((base * 0.18).toFixed(2));
                setFormRvie({ ...formRvie, baseGravada: base, igv, total: Number((base + igv).toFixed(2)) });
              }} className="h-7 px-2 border border-[#D1D5DB]" />
              <input type="number" step="0.01" placeholder="IGV" value={formRvie.igv} onChange={(e) => setFormRvie({ ...formRvie, igv: Number(e.target.value) })} className="h-7 px-2 border border-[#D1D5DB]" />
              <input type="number" step="0.01" placeholder="Total" value={formRvie.total} onChange={(e) => setFormRvie({ ...formRvie, total: Number(e.target.value) })} className="h-7 px-2 border border-[#D1D5DB] font-bold" />
              <button type="submit" className="h-7 px-3 bg-[#1E3A5F] text-[#FFFFFF] font-bold inline-flex items-center justify-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
              <button type="button" onClick={() => generarYDescargar('RVIE_ANEXO_2')} className="col-span-2 h-7 px-3 bg-[#1E6F42] text-[#FFFFFF] font-bold inline-flex items-center justify-center gap-1">
                <Download className="w-3.5 h-3.5" /> Exportar Anexo 2 RVIE (.ZIP)
              </button>
            </form>
            <TablaDensa columnas={colsAjusteGen} datos={itemsRvie} rowKey={(r) => r.id} />
          </>
        )}

        {tab === 'ANEXO_8_RCE' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-bold text-[#1E3A5F]">Complemento Comprobantes (-CP- — 41 cols)</h3>
                <button type="button" onClick={() => generarYDescargar('RCE_ANEXO_8_CP')} className="px-2.5 py-1 bg-[#1E6F42] text-[#FFFFFF] text-[11px] font-bold inline-flex items-center gap-1">
                  <Download className="w-3 h-3" /> ZIP -CP-
                </button>
              </div>
              <form onSubmit={guardarRceCp} className="p-2 bg-[#F9FAFB] border border-[#D1D5DB] grid grid-cols-3 gap-1.5 text-[11px]">
                <input type="date" required value={formRceCp.fechaEmision} onChange={(e) => setFormRceCp({ ...formRceCp, fechaEmision: e.target.value })} className="h-7 px-2 border border-[#D1D5DB]" />
                <input type="text" required placeholder="Tipo (14/01)" value={formRceCp.tipoComprobante} onChange={(e) => setFormRceCp({ ...formRceCp, tipoComprobante: e.target.value })} className="h-7 px-2 border border-[#D1D5DB]" />
                <input type="text" required placeholder="Serie-Nro" value={formRceCp.numero} onChange={(e) => setFormRceCp({ ...formRceCp, numero: e.target.value })} className="h-7 px-2 border border-[#D1D5DB]" />
                <input type="text" required placeholder="RUC Proveedor" value={formRceCp.proveedorRuc} onChange={(e) => setFormRceCp({ ...formRceCp, proveedorRuc: e.target.value })} className="h-7 px-2 border border-[#D1D5DB]" />
                <input type="text" required placeholder="Razón Social" value={formRceCp.proveedorNombre} onChange={(e) => setFormRceCp({ ...formRceCp, proveedorNombre: e.target.value })} className="col-span-2 h-7 px-2 border border-[#D1D5DB]" />
                <input type="number" step="0.01" placeholder="Base" value={formRceCp.baseGravada} onChange={(e) => {
                  const base = Number(e.target.value);
                  const igv = Number((base * 0.18).toFixed(2));
                  setFormRceCp({ ...formRceCp, baseGravada: base, igv, total: Number((base + igv).toFixed(2)) });
                }} className="h-7 px-2 border border-[#D1D5DB]" />
                <input type="number" step="0.01" placeholder="Total" value={formRceCp.total} onChange={(e) => setFormRceCp({ ...formRceCp, total: Number(e.target.value) })} className="h-7 px-2 border border-[#D1D5DB]" />
                <button type="submit" className="h-7 px-2 bg-[#1E3A5F] text-[#FFFFFF] font-bold">+ Agregar CP</button>
              </form>
              <TablaDensa columnas={colsAjusteGen} datos={itemsRceCp} rowKey={(r) => r.id} />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-bold text-[#1E3A5F]">Inclusión / Exclusión (-RCEINEX- — 3 cols)</h3>
                <button type="button" onClick={() => generarYDescargar('RCE_ANEXO_8_INEX')} className="px-2.5 py-1 bg-[#1E6F42] text-[#FFFFFF] text-[11px] font-bold inline-flex items-center gap-1">
                  <Download className="w-3 h-3" /> ZIP -RCEINEX-
                </button>
              </div>
              <form onSubmit={guardarInex} className="p-2 bg-[#F9FAFB] border border-[#D1D5DB] flex gap-1.5 text-[11px]">
                <input type="text" required maxLength={27} placeholder="CAR SUNAT (27 caracteres)" value={formInex.carOriginal} onChange={(e) => setFormInex({ ...formInex, carOriginal: e.target.value })} className="flex-1 h-7 px-2 font-mono border border-[#D1D5DB]" />
                <select value={formInex.tipoOperacion} onChange={(e) => setFormInex({ ...formInex, tipoOperacion: e.target.value as 'INCLUSION' | 'EXCLUSION' })} className="h-7 px-2 border border-[#D1D5DB]">
                  <option value="EXCLUSION">2 - Excluir</option>
                  <option value="INCLUSION">1 - Incluir</option>
                </select>
                <button type="submit" className="h-7 px-2.5 bg-[#1E3A5F] text-[#FFFFFF] font-bold">+ Agregar</button>
              </form>
              <TablaDensa
                columnas={[
                  { key: 'carOriginal', header: 'CAR SUNAT (27 dígitos)', render: (r) => <span className="font-mono font-bold">{r.carOriginal}</span> },
                  { key: 'tipoOperacion', header: 'Acción', width: '90px', render: (r) => <span className="font-bold">{r.tipoOperacion}</span> },
                  {
                    key: 'del',
                    header: 'Quitar',
                    width: '60px',
                    align: 'center',
                    render: (r) => <button type="button" onClick={() => eliminarMut.mutate(r.id)} className="p-1 text-[#B91C1C]"><Trash2 className="w-3.5 h-3.5" /></button>,
                  },
                ]}
                datos={itemsRceInex}
                rowKey={(r) => r.id}
              />
            </div>
          </div>
        )}

        {tab === 'ANEXO_10_TC' && (
          <>
            <form onSubmit={guardarTc} className="p-2.5 bg-[#F9FAFB] border border-[#D1D5DB] flex flex-wrap gap-2 items-center text-[11px]">
              <input type="date" required value={formTc.fechaEmision} onChange={(e) => setFormTc({ ...formTc, fechaEmision: e.target.value })} className="h-7 px-2 border border-[#D1D5DB]" />
              <select value={formTc.moneda} onChange={(e) => setFormTc({ ...formTc, moneda: e.target.value })} className="h-7 px-2 border border-[#D1D5DB]">
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
              <input type="number" step="0.001" required value={formTc.tipoCambio} onChange={(e) => setFormTc({ ...formTc, tipoCambio: Number(e.target.value) })} className="w-24 h-7 px-2 border border-[#D1D5DB]" />
              <input type="text" required maxLength={27} placeholder="CAR SUNAT (27 dígitos)" value={formTc.carOriginal} onChange={(e) => setFormTc({ ...formTc, carOriginal: e.target.value })} className="flex-1 min-w-[220px] h-7 px-2 font-mono border border-[#D1D5DB]" />
              <button type="submit" className="h-7 px-3 bg-[#1E3A5F] text-[#FFFFFF] font-bold">+ Agregar TC Manual</button>
              <button type="button" onClick={() => generarYDescargar('RCE_ANEXO_10')} className="h-7 px-3 bg-[#1E6F42] text-[#FFFFFF] font-bold inline-flex items-center gap-1">
                <Download className="w-3.5 h-3.5" /> Exportar -RCETCA- (.ZIP)
              </button>
            </form>
            <TablaDensa
              columnas={[
                { key: 'origen', header: 'Origen', width: '90px', render: (r: any) => <span className="font-mono font-bold">{r.origen}</span> },
                { key: 'fechaEmision', header: 'F. Emisión', width: '90px', render: (r: any) => <span className="font-mono">{r.fechaEmision}</span> },
                { key: 'moneda', header: 'Moneda', width: '70px', align: 'center', render: (r: any) => <span className="font-mono">{r.moneda}</span> },
                { key: 'tipoCambio', header: 'T. Cambio', width: '85px', align: 'right', render: (r: any) => Number(r.tipoCambio || 1).toFixed(3) },
                { key: 'carSunat', header: 'CAR SUNAT (27 dígitos)', render: (r: any) => <span className="font-mono text-[#1E3A5F]">{r.carSunat}</span> },
                {
                  key: 'del',
                  header: 'Acción',
                  width: '65px',
                  align: 'center',
                  render: (r: any) =>
                    r.origen === 'ANEXO_10' ? (
                      <button type="button" onClick={() => eliminarMut.mutate(r.id)} className="p-1 text-[#B91C1C]"><Trash2 className="w-3.5 h-3.5" /></button>
                    ) : (
                      <span className="text-[10px] text-[#4B5563]">Auto ERP</span>
                    ),
                },
              ]}
              datos={todasTc}
              rowKey={(r: any) => r.id}
            />
          </>
        )}

        {preview && (
          <div className="border border-[#D1D5DB] bg-[#F9FAFB] p-2.5 text-[11px]">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 font-bold text-[#1E3A5F]">
                <CheckCircle2 className={`w-4 h-4 ${preview.validacion.esValido ? 'text-[#1E6F42]' : 'text-[#B91C1C]'}`} />
                <span>{preview.nombreArchivoZip} · {preview.totalFilas} fila(s) · {preview.totalCampos} columnas · SHA-256: {preview.hashSha256.slice(0, 16)}...</span>
              </div>
              <button type="button" onClick={() => descargarArchivoTxtUtf8(preview.nombreArchivoTxt, preview.contenidoTxt)} className="px-2 py-0.5 bg-[#1E3A5F] text-[#FFFFFF]">
                Descargar .TXT
              </button>
            </div>
            <pre className="bg-[#FFFFFF] border border-[#D1D5DB] p-2 font-mono text-[10px] max-h-32 overflow-auto">
              {preview.contenidoTxt || '(Sin filas para el período)'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
