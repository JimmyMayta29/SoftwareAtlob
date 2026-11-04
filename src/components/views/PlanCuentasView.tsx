import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { PLAN_CONTABLE_PCGE, CuentaPCGE } from '../../data/pcgeAccounts';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';
import { useToast } from '../../context/ToastContext';

interface PlanCuentasViewProps {
  rolUsuario?: string;
  esAdmin?: boolean;
}

export const PlanCuentasView: React.FC<PlanCuentasViewProps> = ({
  rolUsuario = 'ADMINISTRADOR',
  esAdmin = true
}) => {
  const puedeEditar = esAdmin || rolUsuario === 'ADMIN_ESTUDIO' || rolUsuario === 'ADMINISTRADOR' || rolUsuario === 'ADMIN';
  const { success, warning } = useToast();
  const [cuentas, setCuentas] = useState<CuentaPCGE[]>(PLAN_CONTABLE_PCGE);
  const [busqueda, setBusqueda] = useState('');
  const [elementoFiltro, setElementoFiltro] = useState<string>('TODOS');
  const [modalNuevaOpen, setModalNuevaOpen] = useState(false);

  // Nueva cuenta form
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [elemento, setElemento] = useState<number>(6);
  const [naturaleza, setNaturaleza] = useState<'DEUDORA' | 'ACREEDORA'>('DEUDORA');
  const [tipo, setTipo] = useState<'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'GASTO' | 'INGRESO' | 'ORDEN'>('GASTO');

  const filtradas = cuentas.filter((c) => {
    const matchElemento = elementoFiltro === 'TODOS' || String(c.elemento) === elementoFiltro;
    const matchTexto =
      c.codigo.includes(busqueda.trim()) ||
      c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase());
    return matchElemento && matchTexto;
  });

  const handleGuardarCuenta = (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeEditar) {
      warning('Acceso denegado: La modificación del Plan de Cuentas está restringida exclusivamente a ADMIN_ESTUDIO / ADMINISTRADOR. Los contadores tienen permiso de solo consulta.', 'Permiso Insuficiente');
      return;
    }
    if (!codigo.trim() || !nombre.trim()) return;
    const nueva: CuentaPCGE = {
      codigo: codigo.trim(),
      nombre: nombre.trim(),
      elemento: elemento as any,
      nivel: codigo.trim().length,
      naturaleza,
      tipo: (tipo === 'GASTO' || tipo === 'INGRESO' ? 'RESULTADOS' : 'BALANCE') as any,
      tipoNormativo: (tipo === 'GASTO' || tipo === 'INGRESO' ? 'GESTION' : tipo) as any,
      permiteMovimiento: codigo.trim().length >= 3,
      monedaCuenta: 'PEN',
      requiereAnexo: ['12', '14', '16', '42', '43', '46'].some(p => codigo.startsWith(p)),
      requiereDocumento: ['12', '16', '42', '43'].some(p => codigo.startsWith(p)),
      requiereCentroCosto: elemento === 9 || elemento === 6,
      requiereVencimiento: ['12', '42'].some(p => codigo.startsWith(p)),
    };
    setCuentas([nueva, ...cuentas]);
    setModalNuevaOpen(false);
    setCodigo('');
    setNombre('');
    success(`Subcuenta ${nueva.codigo} - ${nueva.nombre} registrada en el PCGE.`, 'Plan de Cuentas');
  };

  return (
    <div className="space-y-2">
      <BarraHerramientasLocal
        tituloModulo="Plan Contable General Empresarial (PCGE)"
        subtitulo={`${filtradas.length} cuentas analíticas y divisionarias — ${puedeEditar ? 'Modo Administración' : 'Solo Consulta (Contador / Auditor)'}`}
        onNuevo={puedeEditar ? () => setModalNuevaOpen(true) : undefined}
        labelNuevo={puedeEditar ? "Nueva Subcuenta" : undefined}
        onExportar={() => success('Catálogo PCGE exportado en formato CSV.', 'Exportación')}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-[#CBD5E1] px-3 py-1.5">
        <div className="relative w-full max-w-md">
          <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-2" strokeWidth={1.5} />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Filtrar por código o denominación (ej. 1041, 40111, 6011, 701)..."
            className="w-full pl-8 pr-2 py-1 border border-[#CBD5E1] text-[12px] focus:outline-none focus:border-[#1D4ED8]"
          />
        </div>

        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-[#475569]">Elemento:</span>
          {['TODOS', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((el) => (
            <button
              key={el}
              type="button"
              onClick={() => setElementoFiltro(el)}
              className={`px-2 py-0.5 border cursor-pointer ${
                elementoFiltro === el
                  ? 'bg-[#1D4ED8] text-white border-[#1D4ED8] font-bold'
                  : 'bg-white text-[#0F172A] border-[#CBD5E1] hover:bg-[#F1F5F9]'
              }`}
            >
              {el === 'TODOS' ? 'Todos' : `El. ${el}`}
            </button>
          ))}
        </div>
      </div>

      <TablaDensa
        datos={filtradas}
        rowKey={(c) => c.codigo}
        columnas={[
          {
            key: 'codigo',
            header: 'Código PCGE',
            width: '110px',
            render: (c) => <span className="font-mono font-bold text-[#1D4ED8]">{c.codigo}</span>
          },
          {
            key: 'nombre',
            header: 'Denominación de la Cuenta Contable',
            render: (c) => <span>{c.nombre}</span>
          },
          {
            key: 'elemento',
            header: 'Elemento',
            width: '95px',
            align: 'center',
            render: (c) => <span className="tabular-nums">Elemento {c.elemento}</span>
          },
          {
            key: 'naturaleza',
            header: 'Naturaleza',
            width: '110px',
            align: 'center',
            render: (c) => (
              <span
                className={`px-1.5 py-0.5 text-[11px] border ${
                  c.naturaleza === 'DEUDORA'
                    ? 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]'
                    : 'bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]'
                }`}
              >
                {c.naturaleza}
              </span>
            )
          },
          {
            key: 'tipo',
            header: 'Clasificación EE.FF.',
            width: '130px',
            render: (c) => <span className="text-[#475569]">{c.tipo}</span>
          }
        ]}
      />

      <VentanaModal
        isOpen={modalNuevaOpen}
        onClose={() => setModalNuevaOpen(false)}
        titulo="Registrar Subcuenta en el Plan Contable (PCGE)"
        ancho="md"
      >
        <form onSubmit={handleGuardarCuenta} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#475569] mb-0.5">Código Contable (4 a 6 dígitos)</label>
              <input
                type="text"
                required
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ej: 632101"
                className="w-full px-2 py-1 border border-[#CBD5E1] font-mono text-[12px]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#475569] mb-0.5">Elemento PCGE</label>
              <select
                value={elemento}
                onChange={(e) => setElemento(Number(e.target.value))}
                className="w-full px-2 py-1 border border-[#CBD5E1] text-[12px] bg-white"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <option key={n} value={n}>Elemento {n}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#475569] mb-0.5">Denominación Oficial</label>
            <input
              type="text"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Asesoría contable y tributaria externa"
              className="w-full px-2 py-1 border border-[#CBD5E1] text-[12px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#475569] mb-0.5">Naturaleza</label>
              <select
                value={naturaleza}
                onChange={(e) => setNaturaleza(e.target.value as any)}
                className="w-full px-2 py-1 border border-[#CBD5E1] text-[12px] bg-white"
              >
                <option value="DEUDORA">DEUDORA</option>
                <option value="ACREEDORA">ACREEDORA</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[#475569] mb-0.5">Rubro en EE.FF.</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as any)}
                className="w-full px-2 py-1 border border-[#CBD5E1] text-[12px] bg-white"
              >
                <option value="ACTIVO">ACTIVO</option>
                <option value="PASIVO">PASIVO</option>
                <option value="PATRIMONIO">PATRIMONIO</option>
                <option value="GASTO">GASTO</option>
                <option value="INGRESO">INGRESO</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#CBD5E1]">
            <button
              type="button"
              onClick={() => setModalNuevaOpen(false)}
              className="px-3 py-1 border border-[#CBD5E1] text-[12px] hover:bg-[#F1F5F9]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-3 py-1 bg-[#1D4ED8] text-white text-[12px] font-bold hover:bg-[#1E40AF]"
            >
              Guardar Subcuenta
            </button>
          </div>
        </form>
      </VentanaModal>
    </div>
  );
};
