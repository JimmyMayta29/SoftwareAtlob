import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  ShieldCheck,
  ShieldOff,
  UserMinus,
  UserPlus,
  Users
} from 'lucide-react';
import { obtenerAccessToken } from '../../api/session';
import {
  ResumenLicenciaDTO,
  UsuarioEstudioDTO,
  usuariosLicenciaApi
} from '../../api/usuariosLicenciaApi';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { useToast } from '../../context/ToastContext';
import { evaluarFortalezaPasswordUI } from '../../utils/fortalezaPassword';

function limpiarError(raw: string): string {
  return raw.replace(/^[A-Z0-9_]+:\s*/, '').trim() || 'No se pudo completar la operación.';
}

const ETIQUETA_ROL: Record<string, string> = {
  ADMINISTRADOR: 'ADMINISTRADOR (Titular)',
  CONTADOR_SENIOR: 'CONTADOR SENIOR',
  ASISTENTE_CONTABLE: 'ASISTENTE CONTABLE',
  AUDITOR_REVISOR: 'AUDITOR / SOLO LECTURA'
};

export const UsuariosPermisosView: React.FC = () => {
  const { usuario: usuarioActual } = useEmpresaPeriodo();
  const { success, error: toastError } = useToast();

  const [cargando, setCargando] = useState(true);
  const [usuarios, setUsuarios] = useState<UsuarioEstudioDTO[]>([]);
  const [mfaRequerido, setMfaRequerido] = useState(false);
  const [licencia, setLicencia] = useState<ResumenLicenciaDTO>({
    id: 'local',
    tipo: 'EVALUACION',
    maxUsuarios: 3,
    usuariosActivos: 1,
    vigenteHasta: null,
    creadaEn: new Date().toISOString(),
    puedeCrearUsuario: true
  });
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  // Modal de creación de colaborador
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoUsuario, setNuevoUsuario] = useState('');
  const [nuevoPassword, setNuevoPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [nuevoRol, setNuevoRol] = useState<string>('ASISTENTE_CONTABLE');
  const [guardandoUsuario, setGuardandoUsuario] = useState(false);

  // Enrolamiento 2FA de una sola visualización
  const [enrolamientoMfa, setEnrolamientoMfa] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [codigoMfa, setCodigoMfa] = useState('');
  const [procesandoMfa, setProcesandoMfa] = useState(false);

  const esAdmin = usuarioActual.rolGlobal === 'ADMINISTRADOR' || usuarioActual.rolGlobal === 'ADMIN_ESTUDIO';
  const fortalezaNueva = evaluarFortalezaPasswordUI(nuevoPassword, nuevoUsuario);

  const cargarDatos = useCallback(async () => {
    if (!obtenerAccessToken()) {
      setUsuarios([
        {
          id: usuarioActual.id,
          email: usuarioActual.email,
          nombre: usuarioActual.nombre,
          rolGlobal: 'ADMINISTRADOR',
          mfaActivado: false,
          isActive: true,
          createdAt: new Date().toISOString()
        }
      ]);
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      const estado = await usuariosLicenciaApi.listarEstado();
      setUsuarios(estado.usuarios);
      setMfaRequerido(estado.mfaRequerido);
      setLicencia(estado.licencia);
    } catch (err: any) {
      setErrorServidor(limpiarError(err?.message || 'No se pudo cargar la configuración de usuarios.'));
    } finally {
      setCargando(false);
    }
  }, [usuarioActual.email, usuarioActual.id, usuarioActual.nombre]);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  const handleCrearColaborador = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorServidor(null);

    if (nuevoNombre.trim().length < 2) {
      setErrorServidor('Ingrese el nombre completo del colaborador.');
      return;
    }
    if (nuevoUsuario.trim().length < 3) {
      setErrorServidor('Ingrese un usuario o correo electrónico válido.');
      return;
    }
    if (!fortalezaNueva.valida) {
      setErrorServidor(fortalezaNueva.mensaje || 'La contraseña debe tener al menos 10 caracteres.');
      return;
    }

    const claveEnviar = nuevoPassword;
    setNuevoPassword('');
    setGuardandoUsuario(true);
    try {
      const creado = await usuariosLicenciaApi.crearColaborador({
        nombre: nuevoNombre.trim(),
        usuario: nuevoUsuario.trim().toLowerCase(),
        password: claveEnviar,
        rolGlobal: nuevoRol
      });
      setUsuarios(prev => [...prev, creado.usuario]);
      setLicencia(creado.licencia);
      setIsModalOpen(false);
      setNuevoNombre('');
      setNuevoUsuario('');
      success(`Colaborador ${creado.usuario.nombre} creado correctamente.`, 'Usuario registrado');
    } catch (err: any) {
      const msg = limpiarError(err?.message || 'No se pudo crear el colaborador.');
      setErrorServidor(msg);
      toastError(msg);
      setIsModalOpen(false);
    } finally {
      setGuardandoUsuario(false);
    }
  };

  const handleCambiarEstado = async (u: UsuarioEstudioDTO, activar: boolean) => {
    setErrorServidor(null);
    try {
      const actualizado = await usuariosLicenciaApi.cambiarEstado(u.id, activar);
      setUsuarios(prev => prev.map(item => (item.id === u.id ? actualizado.usuario : item)));
      setLicencia(actualizado.licencia);
      success(
        activar
          ? `Usuario ${u.nombre} reactivado (${actualizado.licencia.usuariosActivos} de ${actualizado.licencia.maxUsuarios} activos).`
          : `Usuario ${u.nombre} desactivado. Su cupo quedó disponible.`
      );
    } catch (err: any) {
      const msg = limpiarError(err?.message || 'No se pudo cambiar el estado del usuario.');
      setErrorServidor(msg);
      toastError(msg);
    }
  };

  const handleIniciarEnrolamientoMfa = async () => {
    setErrorServidor(null);
    setProcesandoMfa(true);
    try {
      const datos = await usuariosLicenciaApi.enrolarMfa();
      setEnrolamientoMfa({ secret: datos.secret, otpauthUrl: datos.otpauthUrl });
      setCodigoMfa('');
    } catch (err: any) {
      const msg = limpiarError(err?.message || 'No se pudo iniciar la configuración de 2FA.');
      setErrorServidor(msg);
      toastError(msg);
    } finally {
      setProcesandoMfa(false);
    }
  };

  const handleConfirmarMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (codigoMfa.trim().length !== 6) {
      setErrorServidor('Ingrese el código de 6 dígitos generado por su aplicación autenticadora.');
      return;
    }
    setErrorServidor(null);
    setProcesandoMfa(true);
    try {
      await usuariosLicenciaApi.activarMfa(codigoMfa.trim());
      // Borrar inmediatamente la semilla mostrada por única vez de la memoria de la interfaz
      setEnrolamientoMfa(null);
      setCodigoMfa('');
      setMfaRequerido(true);
      setUsuarios(prev =>
        prev.map(u => (u.id === usuarioActual.id ? { ...u, mfaActivado: true } : u))
      );
      success('Verificación en dos pasos (2FA) activada y registrada en auditoría.', '2FA Activado');
    } catch (err: any) {
      const msg = limpiarError(err?.message || 'Código 2FA inválido.');
      setErrorServidor(msg);
      toastError(msg);
    } finally {
      setProcesandoMfa(false);
    }
  };

  const handleDesactivarMfa = async () => {
    setErrorServidor(null);
    setProcesandoMfa(true);
    try {
      await usuariosLicenciaApi.desactivarMfa();
      setEnrolamientoMfa(null);
      setCodigoMfa('');
      setMfaRequerido(false);
      setUsuarios(prev =>
        prev.map(u => (u.id === usuarioActual.id ? { ...u, mfaActivado: false } : u))
      );
      success('Verificación en dos pasos (2FA) desactivada y registrada en auditoría.', '2FA Desactivado');
    } catch (err: any) {
      const msg = limpiarError(err?.message || 'No se pudo desactivar el 2FA.');
      setErrorServidor(msg);
      toastError(msg);
    } finally {
      setProcesandoMfa(false);
    }
  };

  const limiteAlcanzado = licencia.usuariosActivos >= licencia.maxUsuarios;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Usuarios, Licencia y Seguridad (2FA)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Administre la cuenta titular, sus colaboradores activos y la autenticación opcional en dos pasos.
          </p>
        </div>

        {esAdmin && (
          <button
            id="btn-nuevo-colaborador"
            type="button"
            onClick={() => {
              setErrorServidor(null);
              setIsModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Agregar colaborador</span>
          </button>
        )}
      </div>

      {errorServidor && (
        <div
          id="alerta-error-usuarios"
          role="alert"
          className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800"
        >
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{errorServidor}</span>
        </div>
      )}

      {/* Tarjetas de Licencia Local y Estado 2FA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Licencia local */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">Licencia de esta instalación</h3>
            </div>
            <span
              id="badge-tipo-licencia"
              className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
            >
              {licencia.tipo === 'COMERCIAL' ? 'Comercial' : 'Evaluación'}
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <span className="text-xs text-slate-600">Usuarios activos en uso:</span>
            <span id="contador-usuarios-licencia" className="text-base font-extrabold text-slate-900">
              {licencia.usuariosActivos} de {licencia.maxUsuarios} usuarios
            </span>
          </div>

          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${limiteAlcanzado ? 'bg-amber-500' : 'bg-indigo-600'}`}
              style={{
                width: `${Math.min(100, Math.round((licencia.usuariosActivos / Math.max(1, licencia.maxUsuarios)) * 100))}%`
              }}
            />
          </div>

          <p className="text-[11.5px] text-slate-600">
            {limiteAlcanzado
              ? `Ha alcanzado el máximo de ${licencia.maxUsuarios} usuarios activos de la licencia ${licencia.tipo}. Los usuarios desactivados no cuentan para el límite.`
              : `Dispone de ${licencia.maxUsuarios - licencia.usuariosActivos} cupo(s) disponible(s). Los usuarios desactivados liberan su cupo automáticamente.`}
          </p>
        </div>

        {/* Configuración de 2FA */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Verificación en dos pasos (2FA / TOTP)</h3>
            </div>
            <span
              id="badge-estado-mfa"
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                mfaRequerido
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {mfaRequerido ? 'Activado' : 'Desactivado (opcional)'}
            </span>
          </div>

          {!enrolamientoMfa ? (
            <div className="space-y-3">
              <p className="text-[11.5px] text-slate-600">
                {mfaRequerido
                  ? 'Al iniciar sesión se solicitará el código temporal de 6 dígitos de su aplicación autenticadora.'
                  : 'Puede activar un código de seguridad adicional en su teléfono cuando lo desee. Cada cambio queda registrado en auditoría.'}
              </p>

              {esAdmin && (
                <div className="flex flex-wrap gap-2">
                  {!mfaRequerido ? (
                    <button
                      id="btn-iniciar-enrolamiento-mfa"
                      type="button"
                      disabled={procesandoMfa}
                      onClick={handleIniciarEnrolamientoMfa}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Configurar y activar 2FA</span>
                    </button>
                  ) : (
                    <button
                      id="btn-desactivar-mfa"
                      type="button"
                      disabled={procesandoMfa}
                      onClick={handleDesactivarMfa}
                      className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 disabled:opacity-50 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <ShieldOff className="w-4 h-4" />
                      <span>Desactivar 2FA</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleConfirmarMfa} className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
              <p className="text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 font-medium">
                Copie esta clave en su aplicación autenticadora ahora. Se muestra una sola vez y no se guarda en registros ni auditoría:
              </p>
              <div className="px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs font-bold text-indigo-700 tracking-wider select-all">
                {enrolamientoMfa.secret}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="input-codigo-mfa"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={codigoMfa}
                  onChange={e => setCodigoMfa(e.target.value.replace(/\D/g, ''))}
                  placeholder="Código de 6 dígitos"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs font-bold tracking-widest"
                  required
                />
                <button
                  id="btn-confirmar-mfa"
                  type="submit"
                  disabled={procesandoMfa}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                >
                  Confirmar 2FA
                </button>
                <button
                  id="btn-cancelar-mfa"
                  type="button"
                  onClick={() => {
                    setEnrolamientoMfa(null);
                    setCodigoMfa('');
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Tabla de usuarios del estudio */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
            <tr>
              <th className="px-5 py-3.5">Nombre completo</th>
              <th className="px-5 py-3.5">Usuario / Correo</th>
              <th className="px-5 py-3.5">Rol</th>
              <th className="px-5 py-3.5">2FA</th>
              <th className="px-5 py-3.5">Estado</th>
              {esAdmin && <th className="px-5 py-3.5 text-right">Acción</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-slate-500">
                  Cargando usuarios del estudio…
                </td>
              </tr>
            ) : (
              usuarios.map(u => (
                <tr key={u.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-5 py-3.5 font-bold text-slate-900">{u.nombre}</td>
                  <td className="px-5 py-3.5 font-mono text-slate-600">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold border ${
                        u.rolGlobal === 'ADMINISTRADOR'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : u.rolGlobal === 'CONTADOR_SENIOR'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : u.rolGlobal === 'ASISTENTE_CONTABLE'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {ETIQUETA_ROL[u.rolGlobal] || u.rolGlobal}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[11px] font-semibold text-slate-600">
                    {u.mfaActivado ? 'Activo' : 'No activo'}
                  </td>
                  <td className="px-5 py-3.5">
                    {u.isActive ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        ACTIVO
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400 font-bold text-[11px]">
                        DESACTIVADO (no ocupa cupo)
                      </span>
                    )}
                  </td>
                  {esAdmin && (
                    <td className="px-5 py-3.5 text-right">
                      {u.id !== usuarioActual.id ? (
                        u.isActive ? (
                          <button
                            id={`btn-desactivar-${u.email}`}
                            type="button"
                            onClick={() => void handleCambiarEstado(u, false)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-[11px] cursor-pointer"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                            <span>Desactivar</span>
                          </button>
                        ) : (
                          <button
                            id={`btn-reactivar-${u.email}`}
                            type="button"
                            onClick={() => void handleCambiarEstado(u, true)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-[11px] cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Reactivar</span>
                          </button>
                        )
                      ) : (
                        <span className="text-[11px] text-slate-400">Cuenta titular</span>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 text-base">Nuevo colaborador</h3>
              <span className="text-[11px] font-semibold text-slate-500">
                Cupo: {licencia.usuariosActivos}/{licencia.maxUsuarios}
              </span>
            </div>

            {limiteAlcanzado && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11.5px] text-amber-800">
                Su licencia {licencia.tipo} admite hasta {licencia.maxUsuarios} usuarios activos. El servidor rechazará el alta mientras no se libere un cupo.
              </div>
            )}

            <form id="form-nuevo-colaborador" onSubmit={handleCrearColaborador} className="space-y-3 text-xs" noValidate>
              <div>
                <label htmlFor="colab-nombre" className="block font-bold text-slate-700 mb-1">
                  Nombre completo *
                </label>
                <input
                  id="colab-nombre"
                  type="text"
                  required
                  value={nuevoNombre}
                  onChange={e => setNuevoNombre(e.target.value)}
                  placeholder="Ej. Ana María Morales"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5"
                />
              </div>
              <div>
                <label htmlFor="colab-usuario" className="block font-bold text-slate-700 mb-1">
                  Usuario o correo electrónico *
                </label>
                <input
                  id="colab-usuario"
                  type="text"
                  required
                  value={nuevoUsuario}
                  onChange={e => setNuevoUsuario(e.target.value)}
                  placeholder="Ej. amorales o amorales@estudio.pe"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-mono"
                />
              </div>
              <div>
                <label htmlFor="colab-rol" className="block font-bold text-slate-700 mb-1">
                  Rol en el estudio *
                </label>
                <select
                  id="colab-rol"
                  value={nuevoRol}
                  onChange={e => setNuevoRol(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold"
                >
                  <option value="CONTADOR_SENIOR">CONTADOR SENIOR (Operación contable y tributaria)</option>
                  <option value="ASISTENTE_CONTABLE">ASISTENTE CONTABLE (Registro de operaciones)</option>
                  <option value="AUDITOR_REVISOR">AUDITOR REVISOR (Solo consulta)</option>
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="colab-password" className="font-bold text-slate-700">
                    Contraseña inicial (mín. 10 caracteres) *
                  </label>
                  <button
                    type="button"
                    onClick={() => setMostrarPassword(v => !v)}
                    className="text-[11px] text-slate-500 inline-flex items-center gap-1"
                  >
                    {mostrarPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{mostrarPassword ? 'Ocultar' : 'Mostrar'}</span>
                  </button>
                </div>
                <input
                  id="colab-password"
                  type={mostrarPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={nuevoPassword}
                  onChange={e => setNuevoPassword(e.target.value)}
                  placeholder="Mínimo 10 caracteres"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5"
                />
                <p className={`text-[11px] mt-1 ${fortalezaNueva.valida ? 'text-emerald-600' : 'text-slate-500'}`}>
                  Fortaleza: <strong>{fortalezaNueva.etiqueta}</strong>
                  {!fortalezaNueva.valida && fortalezaNueva.mensaje ? ` — ${fortalezaNueva.mensaje}` : ''}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setNuevoPassword('');
                    setIsModalOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  id="colab-submit"
                  type="submit"
                  disabled={guardandoUsuario}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold cursor-pointer"
                >
                  {guardandoUsuario ? 'Guardando…' : 'Crear colaborador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
