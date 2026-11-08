import React, { useState, useEffect } from 'react';
import { 
  FolderPlus, 
  Settings2, 
  CheckCircle2, 
  XCircle, 
  Lock, 
  Trash2, 
  Edit3, 
  ShieldCheck, 
  AlertCircle, 
  RefreshCw,
  Building2,
  Landmark,
  BookOpen
} from 'lucide-react';
import { subdiariosApi, SubdiarioItem, TipoOperacionSubdiario } from '../../api/subdiariosApi';
import { useToast } from '../../context/ToastContext';

interface AdministrarSubdiariosViewProps {
  empresaId: string;
  usuarioRol?: string;
}

export const AdministrarSubdiariosView: React.FC<AdministrarSubdiariosViewProps> = ({
  empresaId,
  usuarioRol = 'ADMIN_ESTUDIO'
}) => {
  const { success, error, warning } = useToast();
  const [subdiarios, setSubdiarios] = useState<SubdiarioItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Crear
  const [modalCrearOpen, setModalCrearOpen] = useState(false);
  const [nuevoCodigo, setNuevoCodigo] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoTipo, setNuevoTipo] = useState<TipoOperacionSubdiario>('DIARIO');
  const [permiteManual, setPermiteManual] = useState(true);

  // Modal Editar
  const [subdiarioEditando, setSubdiarioEditando] = useState<SubdiarioItem | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editActivo, setEditActivo] = useState(true);

  const esAdmin = usuarioRol === 'ADMIN_ESTUDIO' || usuarioRol === 'ADMINISTRADOR';

  const cargarSubdiarios = async () => {
    try {
      setLoading(true);
      const data = await subdiariosApi.listar(empresaId);
      setSubdiarios(data);
    } catch (err: any) {
      error(err.message || 'Error al cargar subdiarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarSubdiarios();
  }, [empresaId]);

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!esAdmin) {
      error('Permiso denegado: solo el Administrador puede crear subdiarios.');
      return;
    }

    try {
      await subdiariosApi.crear(empresaId, {
        codigo: nuevoCodigo,
        nombre: nuevoNombre,
        tipoOperacion: nuevoTipo,
        permiteAsientoManual: permiteManual
      });
      success(`Subdiario ${nuevoCodigo} - ${nuevoNombre} creado exitosamente.`);
      setModalCrearOpen(false);
      setNuevoCodigo('');
      setNuevoNombre('');
      cargarSubdiarios();
    } catch (err: any) {
      error(err.message || 'Error al crear el subdiario.');
    }
  };

  const handleActualizar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subdiarioEditando) return;

    try {
      await subdiariosApi.actualizar(empresaId, subdiarioEditando.id, {
        nombre: editNombre,
        activo: editActivo
      });
      success(`Subdiario ${subdiarioEditando.codigo} actualizado con éxito.`);
      setSubdiarioEditando(null);
      cargarSubdiarios();
    } catch (err: any) {
      error(err.message || 'Error al actualizar subdiario.');
    }
  };

  const handleEliminar = async (sub: SubdiarioItem) => {
    if (sub.esSistema) {
      warning('Los subdiarios base del sistema no pueden ser eliminados.');
      return;
    }

    if (!window.confirm(`¿Está seguro de eliminar el subdiario ${sub.codigo} - ${sub.nombre}? Esta acción solo procederá si no tiene asientos contables registrados.`)) {
      return;
    }

    try {
      await subdiariosApi.eliminar(empresaId, sub.id);
      success(`Subdiario ${sub.codigo} eliminado correctamente.`);
      cargarSubdiarios();
    } catch (err: any) {
      error(err.message || 'No se pudo eliminar el subdiario.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-100 font-sans text-xs">
      {/* Cabecera */}
      <div className="bg-white border-b border-slate-300 p-3 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-slate-800" />
          <div>
            <h1 className="font-bold text-slate-900 text-sm tracking-tight">Administración de Subdiarios Contables</h1>
            <p className="text-[11px] text-slate-500">
              Catálogo oficial de libros auxiliares y subdiarios de la empresa conforme a normativa
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={cargarSubdiarios}
            className="px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Actualizar</span>
          </button>

          {esAdmin && (
            <button
              onClick={() => {
                // Sugerir siguiente código disponible >= 12
                const existentes = new Set(subdiarios.map(s => s.codigo));
                let sug = 12;
                while (existentes.has(String(sug).padStart(2, '0')) && sug < 99) sug++;
                setNuevoCodigo(String(sug).padStart(2, '0'));
                setModalCrearOpen(true);
              }}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Nuevo Subdiario</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabla de Subdiarios */}
      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white border border-slate-300 rounded shadow-2xs overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white uppercase text-[10.5px] font-bold tracking-wider">
                <th className="p-2 border-r border-slate-700 w-16 text-center">Código</th>
                <th className="p-2 border-r border-slate-700">Nombre del Subdiario</th>
                <th className="p-2 border-r border-slate-700 w-36">Tipo Operación</th>
                <th className="p-2 border-r border-slate-700 w-28 text-center">Asiento Manual</th>
                <th className="p-2 border-r border-slate-700 w-24 text-center">Origen</th>
                <th className="p-2 border-r border-slate-700 w-24 text-center">Estado</th>
                <th className="p-2 w-28 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-sans">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-slate-500">
                    Cargando subdiarios contables...
                  </td>
                </tr>
              ) : subdiarios.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-slate-500">
                    No se encontraron subdiarios configurados.
                  </td>
                </tr>
              ) : (
                subdiarios.map((sub) => (
                  <tr key={sub.id} className="hover:bg-blue-50/50">
                    <td className="p-2 font-mono font-bold text-center text-slate-900 border-r border-slate-200">
                      {sub.codigo}
                    </td>
                    <td className="p-2 font-bold text-slate-800 border-r border-slate-200">
                      {sub.nombre}
                    </td>
                    <td className="p-2 border-r border-slate-200">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                        {sub.tipoOperacion}
                      </span>
                    </td>
                    <td className="p-2 text-center border-r border-slate-200">
                      {sub.permiteAsientoManual ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Sí
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <XCircle className="w-3.5 h-3.5" /> No (Auto)
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-center border-r border-slate-200">
                      {sub.esSistema ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Lock className="w-3 h-3" /> Sistema
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Personalizado
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-center border-r border-slate-200">
                      {sub.activo ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Activo
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-600">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {esAdmin && (
                          <button
                            onClick={() => {
                              setSubdiarioEditando(sub);
                              setEditNombre(sub.nombre);
                              setEditActivo(sub.activo);
                            }}
                            className="p-1 hover:bg-slate-100 border border-slate-300 rounded text-slate-700 cursor-pointer"
                            title="Editar subdiario"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {esAdmin && !sub.esSistema && (
                          <button
                            onClick={() => handleEliminar(sub)}
                            className="p-1 hover:bg-rose-50 border border-rose-300 rounded text-rose-700 cursor-pointer"
                            title="Eliminar (solo si no tiene asientos)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Crear Subdiario */}
      {modalCrearOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md border border-slate-300 overflow-hidden">
            <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-sm">Nuevo Subdiario Personalizado</h3>
              </div>
              <button
                onClick={() => setModalCrearOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCrear} className="p-4 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Código de Subdiario (2 dígitos, 10 a 99) *
                </label>
                <input
                  type="text"
                  maxLength={2}
                  required
                  value={nuevoCodigo}
                  onChange={(e) => setNuevoCodigo(e.target.value.replace(/\D/g, ''))}
                  className="w-full font-mono text-sm font-bold border border-slate-300 rounded px-2.5 py-1.5 focus:border-blue-600 focus:outline-none"
                  placeholder="12"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Nombre descriptivo del Subdiario *
                </label>
                <input
                  type="text"
                  required
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded px-2.5 py-1.5 focus:border-blue-600 focus:outline-none"
                  placeholder="Ej: Banco BCP Cuenta Corriente MN"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Tipo de Operación *
                </label>
                <select
                  value={nuevoTipo}
                  onChange={(e) => {
                    const t = e.target.value as TipoOperacionSubdiario;
                    setNuevoTipo(t);
                    if (t === 'DIARIO' || t === 'PROVISIONES' || t === 'AJUSTES') {
                      setPermiteManual(true);
                    }
                  }}
                  className="w-full text-xs border border-slate-300 rounded px-2.5 py-1.5 focus:border-blue-600 focus:outline-none bg-white"
                >
                  <option value="BANCO">BANCO (Cuentas corrientes / transferencias)</option>
                  <option value="CAJA">CAJA (Caja chica / ingresos / egresos)</option>
                  <option value="DIARIO">DIARIO (Asientos manuales libres)</option>
                  <option value="PROVISIONES">PROVISIONES (Provisiones varias)</option>
                  <option value="AJUSTES">AJUSTES (Ajustes de cierre / balance)</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chkManual"
                  checked={permiteManual}
                  onChange={(e) => setPermiteManual(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="chkManual" className="text-xs text-slate-700 font-medium cursor-pointer">
                  Permite registro manual / voucher libre
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalCrearOpen(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded font-bold cursor-pointer"
                >
                  Crear Subdiario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Subdiario */}
      {subdiarioEditando && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md border border-slate-300 overflow-hidden">
            <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-sm">
                  Editar Subdiario {subdiarioEditando.codigo}
                </h3>
              </div>
              <button
                onClick={() => setSubdiarioEditando(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleActualizar} className="p-4 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Código (Inmutable)
                </label>
                <input
                  type="text"
                  disabled
                  value={subdiarioEditando.codigo}
                  className="w-full font-mono text-sm font-bold bg-slate-100 border border-slate-300 rounded px-2.5 py-1.5 text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Nombre descriptivo *
                </label>
                <input
                  type="text"
                  required
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded px-2.5 py-1.5 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chkActivo"
                  checked={editActivo}
                  onChange={(e) => setEditActivo(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="chkActivo" className="text-xs text-slate-700 font-medium cursor-pointer">
                  Subdiario activo (permite operaciones en este período)
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSubdiarioEditando(null)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded font-bold cursor-pointer"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

