import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Sparkles, Plus, Trash2, PowerOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa } from '../ui/TablaDensa';
import { VentanaModal } from '../ui/VentanaModal';
import { useToast } from '../../context/ToastContext';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { pcgeApi, CuentaPCGEApi } from '../../api/pcgeApi';
import { PLAN_CONTABLE_PCGE } from '../../data/pcgeAccounts';

interface PlanCuentasViewProps {
  rolUsuario?: string;
  esAdmin?: boolean;
}

export const PlanCuentasView: React.FC<PlanCuentasViewProps> = ({
  rolUsuario = 'ADMINISTRADOR',
  esAdmin = true
}) => {
  const puedeEditar = esAdmin || rolUsuario === 'ADMIN_ESTUDIO' || rolUsuario === 'ADMINISTRADOR' || rolUsuario === 'ADMIN';
  const { success, warning, error: toastError } = useToast();
  const { empresaId } = useEmpresaPeriodo();

  const [busqueda, setBusqueda] = useState('');
  const [elementoFiltro, setElementoFiltro] = useState<string>('TODOS');
  const [incluirInactivas, setIncluirInactivas] = useState(true);
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [modalNuevaOpen, setModalNuevaOpen] = useState(false);
  const [isCompletando, setIsCompletando] = useState(false);

  // Formulario nueva subcuenta
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [naturaleza, setNaturaleza] = useState<'DEUDORA' | 'ACREEDORA' | 'MIXTA'>('DEUDORA');
  const [clasificacionEeff, setClasificacionEeff] = useState<string>('ACTIVO_CORRIENTE');
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  // Consulta de cuentas desde la API
  const planQuery = useQuery({
    queryKey: ['plan-cuentas', empresaId, elementoFiltro, busqueda, incluirInactivas],
    queryFn: async () => {
      if (!empresaId) {
        return { ok: true, total: PLAN_CONTABLE_PCGE.length, cuentas: PLAN_CONTABLE_PCGE as any };
      }
      return pcgeApi.obtenerPlanCuentas(empresaId, {
        busqueda,
        elemento: elementoFiltro,
        incluirInactivas
      });
    },
    enabled: true
  });

  const cuentasBase: CuentaPCGEApi[] = (planQuery.data?.cuentas || PLAN_CONTABLE_PCGE as any) || [];
  const cuentas = soloPendientes
    ? cuentasBase.filter(c => (c as any).estadoClasificacion === 'PENDIENTE_CONTADOR')
    : cuentasBase;

  const handleCompletarPlan = async () => {
    if (!puedeEditar) {
      warning('Acceso denegado: solo Administradores pueden actualizar el catálogo del plan contable.', 'Seguridad');
      return;
    }
    if (!empresaId) {
      warning('Seleccione una empresa activa para completar su plan contable.', 'Empresa Requerida');
      return;
    }

    try {
      setIsCompletando(true);
      const res = await pcgeApi.completarPlanDesdeCatalogoBase(empresaId);
      if (res.ok) {
        success(res.mensaje, 'Catálogo Base PCGE');
        planQuery.refetch();
      }
    } catch (err: any) {
      toastError(err?.response?.data?.error || err.message, 'Error al Completar Plan');
    } finally {
      setIsCompletando(false);
    }
  };

  const handleGuardarSubcuenta = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorValidacion(null);
    if (!puedeEditar) {
      warning('Acceso denegado: permiso restringido a administradores.', 'Permiso Insuficiente');
      return;
    }
    if (!codigo.trim() || !nombre.trim()) {
      setErrorValidacion('Ingrese el código y la denominación de la subcuenta.');
      return;
    }
    if (!empresaId) {
      warning('Seleccione una empresa activa.', 'Empresa');
      return;
    }

    try {
      const res = await pcgeApi.crearSubcuenta(empresaId, {
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        naturalezaSaldo: naturaleza,
        clasificacionEeff,
        esRegistro: true
      });
      if (res.ok) {
        success(`Subcuenta ${res.cuenta.codigo} - ${res.cuenta.nombre} registrada correctamente.`, 'Subcuenta Creada');
        setModalNuevaOpen(false);
        setCodigo('');
        setNombre('');
        planQuery.refetch();
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message;
      setErrorValidacion(msg);
    }
  };

  const handleEliminarCuenta = async (c: CuentaPCGEApi) => {
    if (!puedeEditar) {
      warning('Acceso denegado: permiso restringido.', 'Permisos');
      return;
    }
    if (!empresaId) return;

    if (!confirm(`¿Está seguro de eliminar la cuenta ${c.codigo} - ${c.nombre}? Si tiene movimientos contables será rechazada.`)) {
      return;
    }

    try {
      const res = await pcgeApi.eliminarCuenta(empresaId, c.codigo);
      if (res.ok) {
        success(res.mensaje, 'Cuenta Eliminada');
        planQuery.refetch();
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message;
      warning(msg, 'No se pudo eliminar');
    }
  };

  const handleToggleInactiva = async (c: CuentaPCGEApi) => {
    if (!puedeEditar) return;
    if (!empresaId) return;

    try {
      const nuevoEstado = !c.esInactiva;
      const res = await pcgeApi.marcarInactiva(empresaId, c.codigo, nuevoEstado);
      if (res.ok) {
        success(res.mensaje, 'Estado de Cuenta');
        planQuery.refetch();
      }
    } catch (err: any) {
      toastError(err?.response?.data?.error || err.message, 'Error');
    }
  };

  return (
    <div className="space-y-2">
      <BarraHerramientasLocal
        tituloModulo="Plan Contable General Empresarial (PCGE)"
        subtitulo={`${cuentas.length} cuentas en catálogo — ${puedeEditar ? 'Modo Administración' : 'Solo Consulta (Contador / Auditor)'}`}
        onNuevo={puedeEditar ? () => setModalNuevaOpen(true) : undefined}
        labelNuevo={puedeEditar ? "Nueva Subcuenta" : undefined}
        accionesExtra={
          puedeEditar ? (
            <button
              type="button"
              onClick={handleCompletarPlan}
              disabled={isCompletando}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 rounded-md text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              title="Agrega las cuentas oficiales del catálogo base PCGE que falten en el plan de la empresa"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>{isCompletando ? 'Completando...' : 'Completar plan con el catálogo base'}</span>
            </button>
          ) : undefined
        }
        onExportar={() => success('Catálogo PCGE exportado.', 'Exportación')}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-[#CBD5E1] px-3 py-1.5">
        <div className="relative w-full max-w-md">
          <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-2" strokeWidth={1.5} />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Filtrar por código o denominación (ej. 1041, 191, 391, 701)..."
            className="w-full pl-8 pr-2 py-1 border border-[#CBD5E1] text-[12px] focus:outline-none focus:border-[#1D4ED8]"
          />
        </div>

        <div className="flex items-center gap-3 text-[11px]">
          <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 select-none">
            <input
              type="checkbox"
              checked={incluirInactivas}
              onChange={(e) => setIncluirInactivas(e.target.checked)}
              className="rounded text-blue-600"
            />
            <span>Mostrar cuentas inactivas</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer text-amber-800 select-none font-semibold">
            <input
              type="checkbox"
              checked={soloPendientes}
              onChange={(e) => setSoloPendientes(e.target.checked)}
              className="rounded text-amber-600"
            />
            <span>Pendientes del plan</span>
          </label>

          <div className="flex items-center gap-1">
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
      </div>

      <TablaDensa
        datos={cuentas}
        rowKey={(c) => c.codigo}
        columnas={[
          {
            key: 'codigo',
            header: 'Código PCGE',
            width: '110px',
            render: (c) => (
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-[#1D4ED8]">{c.codigo}</span>
                {c.esInactiva && (
                  <span className="px-1 py-0.2 bg-amber-100 text-amber-800 text-[9px] rounded font-semibold">INACTIVA</span>
                )}
              </div>
            )
          },
          {
            key: 'nombre',
            header: 'Denominación de la Cuenta Contable',
            render: (c) => (
              <div className="flex items-center gap-2">
                <span>{c.nombre}</span>
                {c.esCorrectora && (
                  <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 text-[10px] rounded font-bold" title="Cuenta correctora del Activo con signo negativo">
                    Correctora (-)
                  </span>
                )}
                {(c as any).estadoClasificacion === 'PENDIENTE_CONTADOR' && (
                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-300 text-[10px] rounded font-bold" title="Clasificación pendiente de validación por el contador">
                    Pendiente Validación
                  </span>
                )}
              </div>
            )
          },
          {
            key: 'elemento',
            header: 'Elemento',
            width: '85px',
            align: 'center',
            render: (c) => <span className="tabular-nums">Elemento {c.elemento}</span>
          },
          {
            key: 'naturalezaSaldo',
            header: 'Naturaleza',
            width: '100px',
            align: 'center',
            render: (c) => (
              <span
                className={`px-1.5 py-0.5 text-[10px] font-bold border rounded ${
                  c.naturalezaSaldo === 'DEUDORA'
                    ? 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]'
                    : c.naturalezaSaldo === 'ACREEDORA'
                    ? 'bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]'
                    : 'bg-slate-100 text-slate-700 border-slate-300'
                }`}
              >
                {c.naturalezaSaldo || 'DEUDORA'}
              </span>
            )
          },
          {
            key: 'clasificacionEeff',
            header: 'Clasificación EE.FF.',
            width: '140px',
            render: (c) => (
              <span className="text-[11px] text-[#475569] font-mono">
                {c.clasificacionEeff || 'NO_APLICA'}
              </span>
            )
          },
          {
            key: 'signoEeff',
            header: 'Signo',
            width: '65px',
            align: 'center',
            render: (c) => (
              <span className={`font-mono font-bold text-xs ${c.signoEeff === -1 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {c.signoEeff === -1 ? '(-1)' : '(+1)'}
              </span>
            )
          },
          {
            key: 'acciones',
            header: 'Acciones',
            width: '90px',
            align: 'center',
            render: (c) => (
              puedeEditar ? (
                <div className="flex items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleToggleInactiva(c)}
                    className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 cursor-pointer"
                    title={c.esInactiva ? "Activar cuenta" : "Marcar como inactiva"}
                  >
                    <PowerOff className={`w-3.5 h-3.5 ${c.esInactiva ? 'text-amber-600' : 'text-slate-400'}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEliminarCuenta(c)}
                    className="p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                    title="Eliminar cuenta (solo si no tiene movimientos)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : null
            )
          }
        ]}
      />

      <VentanaModal
        isOpen={modalNuevaOpen}
        onClose={() => setModalNuevaOpen(false)}
        titulo="Registrar Subcuenta en el Plan Contable (PCGE)"
        ancho="md"
      >
        <form onSubmit={handleGuardarSubcuenta} className="space-y-3">
          {errorValidacion && (
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorValidacion}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#475569] mb-0.5">Código de Subcuenta (ej: 10411, 63211)</label>
              <input
                type="text"
                required
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ej: 10411"
                className="w-full px-2 py-1 border border-[#CBD5E1] font-mono text-[12px]"
              />
              <span className="text-[10px] text-slate-400">Debe tener una cuenta padre en el plan.</span>
            </div>
            <div>
              <label className="block text-[11px] text-[#475569] mb-0.5">Naturaleza del Saldo</label>
              <select
                value={naturaleza}
                onChange={(e) => setNaturaleza(e.target.value as any)}
                className="w-full px-2 py-1 border border-[#CBD5E1] text-[12px]"
              >
                <option value="DEUDORA">DEUDORA (Activo / Gasto)</option>
                <option value="ACREEDORA">ACREEDORA (Pasivo / Patrimonio / Ingreso)</option>
                <option value="MIXTA">MIXTA (Liquidación / Cierre)</option>
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
              placeholder="Ej: Cuentas corrientes operativas en moneda nacional"
              className="w-full px-2 py-1 border border-[#CBD5E1] text-[12px]"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#475569] mb-0.5">Clasificación Estados Financieros</label>
            <select
              value={clasificacionEeff}
              onChange={(e) => setClasificacionEeff(e.target.value)}
              className="w-full px-2 py-1 border border-[#CBD5E1] text-[12px]"
            >
              <option value="ACTIVO_CORRIENTE">ACTIVO_CORRIENTE</option>
              <option value="ACTIVO_NO_CORRIENTE">ACTIVO_NO_CORRIENTE</option>
              <option value="PASIVO_CORRIENTE">PASIVO_CORRIENTE</option>
              <option value="PASIVO_NO_CORRIENTE">PASIVO_NO_CORRIENTE</option>
              <option value="PATRIMONIO">PATRIMONIO</option>
              <option value="GASTO">GASTO (Resultados)</option>
              <option value="COSTO">COSTO (Producción / Venta)</option>
              <option value="NO_APLICA">NO_APLICA</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setModalNuevaOpen(false)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded text-xs font-semibold"
            >
              Guardar Subcuenta
            </button>
          </div>
        </form>
      </VentanaModal>
    </div>
  );
};
