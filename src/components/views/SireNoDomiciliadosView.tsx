import React, { useState } from 'react';
import { Plus, Download, Edit3, Trash2, FileText, Eye, CheckCircle2, X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';
import { SelectorPeriodo } from '../ui/SelectorPeriodo';
import {
  useSireNoDomiciliados,
  useCrearNoDomiciliado,
  useActualizarNoDomiciliado,
  useEliminarNoDomiciliado,
  useGenerarAnexoSire,
} from '../../hooks/useSire';
import {
  SireNoDomiciliado,
  ResultadoPaqueteSire,
  descargarArchivoZipBase64,
  descargarArchivoTxtUtf8,
} from '../../api/sireApi';

const PAISES_COMUNES = [
  { codigo: '9249', label: '9249 - ESTADOS UNIDOS' },
  { codigo: '9245', label: '9245 - ESPAÑA' },
  { codigo: '9169', label: '9169 - COLOMBIA' },
  { codigo: '9158', label: '9158 - CHILE' },
  { codigo: '9493', label: '9493 - MÉXICO' },
  { codigo: '9105', label: '9105 - BRASIL' },
  { codigo: '9364', label: '9364 - IRLANDA' },
  { codigo: '9628', label: '9628 - REINO UNIDO' },
  { codigo: '9215', label: '9215 - CHINA' },
  { codigo: '9586', label: '9586 - PANAMÁ' },
];

const TIPOS_RENTA = [
  { codigo: '00', label: '00 - Bienes / Servicios sin retención' },
  { codigo: '04', label: '04 - Regalías / Licencias' },
  { codigo: '16', label: '16 - Asistencia Técnica (15%)' },
  { codigo: '17', label: '17 - Servicios Digitales (30%)' },
  { codigo: '18', label: '18 - Consultoría / Independientes (30%)' },
  { codigo: '34', label: '34 - Otras rentas fuente peruana' },
];

const CONVENIOS_CDI = [
  { codigo: '00', label: '00 - Ninguno' },
  { codigo: '01', label: '01 - Canadá' },
  { codigo: '02', label: '02 - Chile' },
  { codigo: '03', label: '03 - CAN (Comunidad Andina)' },
  { codigo: '04', label: '04 - Brasil' },
  { codigo: '05', label: '05 - México' },
  { codigo: '06', label: '06 - Corea' },
  { codigo: '07', label: '07 - Suiza' },
  { codigo: '08', label: '08 - Portugal' },
  { codigo: '09', label: '09 - Japón' },
];

const estadoInicialForm = (periodo: string): Omit<SireNoDomiciliado, 'id' | 'empresaId'> => ({
  periodo,
  carSunat: '',
  fechaEmision: `${periodo}-15`,
  tipoComprobante: '91',
  serie: 'INV',
  numero: '',
  valorAdquisiciones: 0,
  otrosConceptos: 0,
  importeTotal: 0,
  tipoDocSustentaCredito: '',
  serieDocSustentaCredito: '',
  anioDua: '',
  numeroDocSustentaCredito: '',
  retencionIgv: 0,
  moneda: 'USD',
  tipoCambio: 3.75,
  paisResidencia: '9249',
  razonSocialNoDomiciliado: '',
  domicilioExtranjero: '',
  numIdFiscal: '',
  numIdBeneficiario: '',
  razonSocialBeneficiario: '',
  paisBeneficiario: '',
  vinculoContribuyente: '00',
  rentaBruta: 0,
  deduccionCosto: 0,
  rentaNeta: 0,
  tasaRetencion: 30,
  impuestoRetenido: 0,
  convenioDobleImposicion: '00',
  exoneracionAplicada: '',
  tipoRenta: '17',
  modalidadServicio: '3',
  aplicaArt76: false,
  carCpModificar: '',
  estado: 'REGISTRADO',
});

export const SireNoDomiciliadosView: React.FC = () => {
  const { state, notify } = useAppContext();
  const empresaId = state.activeEmpresa;
  const [periodo, setPeriodo] = useState(state.activePeriodo || '2026-09');
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(() => estadoInicialForm(periodo));
  const [preview, setPreview] = useState<ResultadoPaqueteSire | null>(null);

  const { data: registros = [], isLoading, isError, error } = useSireNoDomiciliados(empresaId, periodo);
  const crearMut = useCrearNoDomiciliado(empresaId);
  const actualizarMut = useActualizarNoDomiciliado(empresaId);
  const eliminarMut = useEliminarNoDomiciliado(empresaId);
  const generarMut = useGenerarAnexoSire(empresaId);

  const abrirNuevo = () => {
    setEditId(null);
    setForm(estadoInicialForm(periodo));
    setModalOpen(true);
  };

  const abrirEditar = (r: SireNoDomiciliado) => {
    setEditId(r.id);
    setForm({
      periodo: r.periodo,
      carSunat: r.carSunat || '',
      fechaEmision: r.fechaEmision,
      tipoComprobante: r.tipoComprobante,
      serie: r.serie || '',
      numero: r.numero,
      valorAdquisiciones: r.valorAdquisiciones,
      otrosConceptos: r.otrosConceptos,
      importeTotal: r.importeTotal,
      tipoDocSustentaCredito: r.tipoDocSustentaCredito || '',
      serieDocSustentaCredito: r.serieDocSustentaCredito || '',
      anioDua: r.anioDua || '',
      numeroDocSustentaCredito: r.numeroDocSustentaCredito || '',
      retencionIgv: r.retencionIgv,
      moneda: r.moneda,
      tipoCambio: r.tipoCambio,
      paisResidencia: r.paisResidencia,
      razonSocialNoDomiciliado: r.razonSocialNoDomiciliado,
      domicilioExtranjero: r.domicilioExtranjero || '',
      numIdFiscal: r.numIdFiscal || '',
      numIdBeneficiario: r.numIdBeneficiario || '',
      razonSocialBeneficiario: r.razonSocialBeneficiario || '',
      paisBeneficiario: r.paisBeneficiario || '',
      vinculoContribuyente: r.vinculoContribuyente,
      rentaBruta: r.rentaBruta,
      deduccionCosto: r.deduccionCosto,
      rentaNeta: r.rentaNeta,
      tasaRetencion: r.tasaRetencion,
      impuestoRetenido: r.impuestoRetenido,
      convenioDobleImposicion: r.convenioDobleImposicion,
      exoneracionAplicada: r.exoneracionAplicada || '',
      tipoRenta: r.tipoRenta,
      modalidadServicio: r.modalidadServicio || '',
      aplicaArt76: r.aplicaArt76,
      carCpModificar: r.carCpModificar || '',
      estado: r.estado,
    });
    setModalOpen(true);
  };

  const recalcularTotales = (patch: Partial<typeof form>) => {
    const next = { ...form, ...patch };
    const total = Number((Number(next.valorAdquisiciones || 0) + Number(next.otrosConceptos || 0)).toFixed(2));
    const rentaBruta = patch.valorAdquisiciones !== undefined ? Number(next.valorAdquisiciones || 0) : Number(next.rentaBruta || 0);
    const rentaNeta = Number(Math.max(0, rentaBruta - Number(next.deduccionCosto || 0)).toFixed(2));
    const impuestoRetenido = Number(((rentaNeta * Number(next.tasaRetencion || 0)) / 100).toFixed(2));
    setForm({ ...next, importeTotal: total, rentaBruta, rentaNeta, impuestoRetenido });
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId) {
        await actualizarMut.mutateAsync({ registroId: editId, datos: { ...form, periodo } });
        notify('Registro No Domiciliado actualizado en PostgreSQL', 'success');
      } else {
        await crearMut.mutateAsync({ ...form, periodo });
        notify('Comprobante No Domiciliado registrado en PostgreSQL', 'success');
      }
      setModalOpen(false);
    } catch (err: any) {
      notify(err.message || 'Error guardando registro No Domiciliado', 'error');
    }
  };

  const handleEliminar = async (id: string) => {
    try {
      await eliminarMut.mutateAsync(id);
      notify('Registro eliminado', 'info');
    } catch (err: any) {
      notify(err.message || 'Error eliminando registro', 'error');
    }
  };

  const generarAnexo9 = async (modo: 'ZIP' | 'TXT' | 'PREVIEW', sinMovimiento = false) => {
    try {
      const res = await generarMut.mutateAsync({
        anexo: 'RCE_ANEXO_9',
        periodo,
        sinMovimiento,
      });
      setPreview(res);
      if (modo === 'ZIP') {
        descargarArchivoZipBase64(res.nombreArchivoZip, res.zipBase64);
        notify(`Archivo ${res.nombreArchivoZip} (Anexo 9 — 080500) descargado`, 'success');
      } else if (modo === 'TXT') {
        descargarArchivoTxtUtf8(res.nombreArchivoTxt, res.contenidoTxt);
        notify(`Archivo ${res.nombreArchivoTxt} descargado`, 'success');
      } else {
        notify(`Validación Anexo 9: ${res.totalFilas} fila(s), ${res.totalCampos} campos`, res.validacion.esValido ? 'success' : 'warning');
      }
    } catch (err: any) {
      notify(err.message || 'Error generando Anexo 9 (080500)', 'error');
    }
  };

  const totales = registros.reduce(
    (acc, r) => ({
      total: acc.total + Number(r.importeTotal || 0),
      renta: acc.renta + Number(r.impuestoRetenido || 0),
    }),
    { total: 0, renta: 0 }
  );

  const columnas: ColumnaTablaDensa<SireNoDomiciliado>[] = [
    { key: 'fechaEmision', header: 'F. Emisión', width: '90px', render: (r) => <span className="font-mono">{r.fechaEmision}</span> },
    { key: 'tipoComprobante', header: 'Tipo', width: '50px', align: 'center', render: (r) => <span className="font-mono">{r.tipoComprobante}</span> },
    { key: 'doc', header: 'Serie-Nro', width: '125px', render: (r) => <span className="font-mono">{r.serie ? `${r.serie}-${r.numero}` : r.numero}</span> },
    { key: 'paisResidencia', header: 'País', width: '65px', align: 'center', render: (r) => <span className="font-mono">{r.paisResidencia}</span> },
    { key: 'razonSocialNoDomiciliado', header: 'Sujeto No Domiciliado', render: (r) => <span className="font-bold">{r.razonSocialNoDomiciliado}</span> },
    { key: 'numIdFiscal', header: 'ID Fiscal / TIN', width: '105px', render: (r) => <span className="font-mono">{r.numIdFiscal || '-'}</span> },
    { key: 'moneda', header: 'Mon.', width: '50px', align: 'center', render: (r) => <span className="font-mono">{r.moneda}</span> },
    { key: 'importeTotal', header: 'Importe Total', width: '95px', align: 'right', render: (r) => r.importeTotal.toFixed(2) },
    { key: 'impuestoRetenido', header: 'Ret. IR', width: '85px', align: 'right', render: (r) => r.impuestoRetenido.toFixed(2) },
    {
      key: 'acciones',
      header: 'Acciones',
      width: '90px',
      align: 'center',
      render: (r) => (
        <div className="inline-flex items-center gap-1">
          <button type="button" onClick={() => abrirEditar(r)} title="Editar" className="p-1 text-[#1E3A5F] hover:bg-[#E5E7EB]">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => handleEliminar(r.id)} title="Eliminar" className="p-1 text-[#B91C1C] hover:bg-[#FEE2E2]">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="SIRE RCE — Compras a Sujetos No Domiciliados (Anexo 9 — Libro 080500)"
        subtitulo="Registro persistente de invoices del exterior, sustento DUA/IGV y retención IR (35 columnas oficiales)"
        acciones={[
          { id: 'nuevo', label: 'Nuevo No Domiciliado', icono: Plus, primario: true, onClick: abrirNuevo },
          { id: 'zip', label: 'Exportar .ZIP (080500)', icono: Download, onClick: () => generarAnexo9('ZIP', false) },
          { id: 'sinmov', label: 'Sin Movimiento (I=0)', icono: FileText, onClick: () => generarAnexo9('ZIP', true) },
          { id: 'preview', label: 'Previsualizar / Validar', icono: Eye, onClick: () => generarAnexo9('PREVIEW', registros.length === 0) },
        ]}
        derecha={<SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="px-3 py-1.5 bg-[#F5F7FA] border-b border-[#D1D5DB] flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span>
          Nomenclatura oficial: <strong className="font-mono text-[#1E3A5F]">LE{state.activeEmpresaRuc}{periodo.replace('-', '')}00080500021{registros.length > 0 ? '1' : '0'}22.zip</strong>
        </span>
        <div className="flex items-center gap-4 font-mono">
          <span>Registros: <strong>{registros.length}</strong></span>
          <span>Importe Adquisiciones: <strong>{totales.total.toFixed(2)}</strong></span>
          <span>Impuesto Retenido IR: <strong className="text-[#1E6F42]">{totales.renta.toFixed(2)}</strong></span>
        </div>
      </div>

      <div className="flex-1 p-3 overflow-auto flex flex-col gap-3">
        <TablaDensa
          columnas={columnas}
          datos={registros}
          rowKey={(r) => r.id}
          cargando={isLoading}
          mensajeError={isError ? (error as any)?.message || 'Error cargando No Domiciliados' : null}
          mensajeVacio="No hay operaciones con sujetos no domiciliados en este período. Use 'Nuevo No Domiciliado' o 'Sin Movimiento (I=0)'."
        />

        {preview && (
          <div className="border border-[#D1D5DB] bg-[#F9FAFB] p-2.5 text-[11px]">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 font-bold text-[#1E3A5F]">
                <CheckCircle2 className={`w-4 h-4 ${preview.validacion.esValido ? 'text-[#1E6F42]' : 'text-[#B91C1C]'}`} />
                <span>{preview.nombreArchivoTxt} — {preview.totalFilas} fila(s), {preview.totalCampos} campos</span>
              </div>
              <button
                type="button"
                onClick={() => descargarArchivoTxtUtf8(preview.nombreArchivoTxt, preview.contenidoTxt)}
                className="px-2 py-0.5 bg-[#1E3A5F] text-[#FFFFFF] text-[11px]"
              >
                Descargar .TXT
              </button>
            </div>
            <pre className="bg-[#FFFFFF] border border-[#D1D5DB] p-2 font-mono text-[10px] overflow-x-auto max-h-36">
              {preview.contenidoTxt || '(Archivo vacío válido para período sin movimiento I=0)'}
            </pre>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form onSubmit={handleGuardar} className="bg-[#FFFFFF] border border-[#9CA3AF] w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="px-3 py-2 bg-[#1E3A5F] text-[#FFFFFF] flex items-center justify-between">
              <span className="text-[12px] font-bold">
                {editId ? 'Editar Operación No Domiciliado (Anexo 9)' : 'Nueva Operación con Sujeto No Domiciliado (Anexo 9 — 080500)'}
              </span>
              <button type="button" onClick={() => setModalOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 overflow-y-auto grid grid-cols-3 gap-2.5 text-[11px]">
              <div>
                <label className="block font-bold mb-0.5">Tipo Comprobante (Tabla 10)</label>
                <select value={form.tipoComprobante} onChange={(e) => setForm({ ...form, tipoComprobante: e.target.value })} className="w-full h-7 px-2 border border-[#D1D5DB]">
                  <option value="91">91 - Comprobante No Domiciliado</option>
                  <option value="97">97 - Nota de Crédito No Domiciliado</option>
                  <option value="98">98 - Nota de Débito No Domiciliado</option>
                  <option value="00">00 - Otros documentos autorizados</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-0.5">Serie / Prefijo</label>
                <input type="text" value={form.serie} onChange={(e) => setForm({ ...form, serie: e.target.value })} className="w-full h-7 px-2 border border-[#D1D5DB]" />
              </div>
              <div>
                <label className="block font-bold mb-0.5">Número *</label>
                <input type="text" required value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className="w-full h-7 px-2 border border-[#D1D5DB]" />
              </div>

              <div>
                <label className="block font-bold mb-0.5">Fecha Emisión *</label>
                <input type="date" required value={form.fechaEmision} onChange={(e) => setForm({ ...form, fechaEmision: e.target.value })} className="w-full h-7 px-2 border border-[#D1D5DB]" />
              </div>
              <div>
                <label className="block font-bold mb-0.5">Moneda / Tipo Cambio</label>
                <div className="flex gap-1">
                  <select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value as 'PEN' | 'USD' })} className="w-20 h-7 px-1 border border-[#D1D5DB]">
                    <option value="USD">USD</option>
                    <option value="PEN">PEN</option>
                  </select>
                  <input type="number" step="0.001" value={form.tipoCambio} onChange={(e) => setForm({ ...form, tipoCambio: Number(e.target.value) })} className="flex-1 h-7 px-2 border border-[#D1D5DB]" />
                </div>
              </div>
              <div>
                <label className="block font-bold mb-0.5">País Residencia (Tabla 35)</label>
                <select value={form.paisResidencia} onChange={(e) => setForm({ ...form, paisResidencia: e.target.value })} className="w-full h-7 px-2 border border-[#D1D5DB]">
                  {PAISES_COMUNES.map((p) => <option key={p.codigo} value={p.codigo}>{p.label}</option>)}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block font-bold mb-0.5">Razón Social / Nombre del Sujeto No Domiciliado *</label>
                <input type="text" required value={form.razonSocialNoDomiciliado} onChange={(e) => setForm({ ...form, razonSocialNoDomiciliado: e.target.value })} className="w-full h-7 px-2 border border-[#D1D5DB]" />
              </div>
              <div>
                <label className="block font-bold mb-0.5">ID Fiscal / TIN Extranjero</label>
                <input type="text" value={form.numIdFiscal} onChange={(e) => setForm({ ...form, numIdFiscal: e.target.value })} className="w-full h-7 px-2 border border-[#D1D5DB]" />
              </div>

              <div className="col-span-3">
                <label className="block font-bold mb-0.5">Domicilio en el Extranjero</label>
                <input type="text" value={form.domicilioExtranjero} onChange={(e) => setForm({ ...form, domicilioExtranjero: e.target.value })} className="w-full h-7 px-2 border border-[#D1D5DB]" />
              </div>

              <div>
                <label className="block font-bold mb-0.5">Valor Adquisiciones *</label>
                <input type="number" step="0.01" required value={form.valorAdquisiciones} onChange={(e) => recalcularTotales({ valorAdquisiciones: Number(e.target.value) })} className="w-full h-7 px-2 border border-[#D1D5DB]" />
              </div>
              <div>
                <label className="block font-bold mb-0.5">Otros Conceptos</label>
                <input type="number" step="0.01" value={form.otrosConceptos} onChange={(e) => recalcularTotales({ otrosConceptos: Number(e.target.value) })} className="w-full h-7 px-2 border border-[#D1D5DB]" />
              </div>
              <div>
                <label className="block font-bold mb-0.5">Importe Total</label>
                <input type="number" step="0.01" value={form.importeTotal} onChange={(e) => setForm({ ...form, importeTotal: Number(e.target.value) })} className="w-full h-7 px-2 border border-[#D1D5DB] bg-[#F9FAFB] font-bold" />
              </div>

              <div>
                <label className="block font-bold mb-0.5">Tipo Doc. Sustenta Crédito (DUA=50 / 46)</label>
                <input type="text" value={form.tipoDocSustentaCredito} onChange={(e) => setForm({ ...form, tipoDocSustentaCredito: e.target.value })} placeholder="50 o 46" className="w-full h-7 px-2 border border-[#D1D5DB]" />
              </div>
              <div>
                <label className="block font-bold mb-0.5">Serie / Año DUA / Nro Sustento</label>
                <div className="flex gap-1">
                  <input type="text" value={form.serieDocSustentaCredito} onChange={(e) => setForm({ ...form, serieDocSustentaCredito: e.target.value })} placeholder="Serie" className="w-1/3 h-7 px-1 border border-[#D1D5DB]" />
                  <input type="text" value={form.anioDua} onChange={(e) => setForm({ ...form, anioDua: e.target.value })} placeholder="Año" className="w-1/3 h-7 px-1 border border-[#D1D5DB]" />
                  <input type="text" value={form.numeroDocSustentaCredito} onChange={(e) => setForm({ ...form, numeroDocSustentaCredito: e.target.value })} placeholder="Nro" className="w-1/3 h-7 px-1 border border-[#D1D5DB]" />
                </div>
              </div>
              <div>
                <label className="block font-bold mb-0.5">Retención IGV (No Domiciliado)</label>
                <input type="number" step="0.01" value={form.retencionIgv} onChange={(e) => setForm({ ...form, retencionIgv: Number(e.target.value) })} className="w-full h-7 px-2 border border-[#D1D5DB]" />
              </div>

              <div>
                <label className="block font-bold mb-0.5">Tipo de Renta (Tabla 31)</label>
                <select value={form.tipoRenta} onChange={(e) => setForm({ ...form, tipoRenta: e.target.value })} className="w-full h-7 px-2 border border-[#D1D5DB]">
                  {TIPOS_RENTA.map((t) => <option key={t.codigo} value={t.codigo}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-bold mb-0.5">Convenio Doble Imposición (Tabla 25)</label>
                <select value={form.convenioDobleImposicion} onChange={(e) => setForm({ ...form, convenioDobleImposicion: e.target.value })} className="w-full h-7 px-2 border border-[#D1D5DB]">
                  {CONVENIOS_CDI.map((c) => <option key={c.codigo} value={c.codigo}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-bold mb-0.5">Modalidad Servicio (Tabla 32)</label>
                <select value={form.modalidadServicio} onChange={(e) => setForm({ ...form, modalidadServicio: e.target.value })} className="w-full h-7 px-2 border border-[#D1D5DB]">
                  <option value="">No aplica</option>
                  <option value="1">1 - Íntegramente en el Perú</option>
                  <option value="2">2 - Parte Perú / Parte extranjero</option>
                  <option value="3">3 - Íntegramente en el extranjero</option>
                </select>
              </div>

              <div>
                <label className="block font-bold mb-0.5">Renta Bruta / Deducción</label>
                <div className="flex gap-1">
                  <input type="number" step="0.01" value={form.rentaBruta} onChange={(e) => recalcularTotales({ rentaBruta: Number(e.target.value) })} className="w-1/2 h-7 px-2 border border-[#D1D5DB]" />
                  <input type="number" step="0.01" value={form.deduccionCosto} onChange={(e) => recalcularTotales({ deduccionCosto: Number(e.target.value) })} className="w-1/2 h-7 px-2 border border-[#D1D5DB]" />
                </div>
              </div>
              <div>
                <label className="block font-bold mb-0.5">Tasa Ret. (%) / Impuesto Retenido</label>
                <div className="flex gap-1">
                  <input type="number" step="0.01" value={form.tasaRetencion} onChange={(e) => recalcularTotales({ tasaRetencion: Number(e.target.value) })} className="w-20 h-7 px-2 border border-[#D1D5DB]" />
                  <input type="number" step="0.01" value={form.impuestoRetenido} onChange={(e) => setForm({ ...form, impuestoRetenido: Number(e.target.value) })} className="flex-1 h-7 px-2 border border-[#D1D5DB] font-bold" />
                </div>
              </div>
              <div className="flex items-end pb-1">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={form.aplicaArt76} onChange={(e) => setForm({ ...form, aplicaArt76: e.target.checked })} />
                  <span>Aplica Art. 76° último párrafo LIR</span>
                </label>
              </div>
            </div>
            <div className="px-3 py-2 bg-[#F5F7FA] border-t border-[#D1D5DB] flex justify-end gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className="px-3 py-1 border border-[#D1D5DB] bg-[#FFFFFF] text-[12px]">Cancelar</button>
              <button type="submit" disabled={crearMut.isPending || actualizarMut.isPending} className="px-4 py-1 bg-[#1E3A5F] text-[#FFFFFF] text-[12px] font-bold">
                {editId ? 'Guardar Cambios' : 'Registrar Comprobante'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
