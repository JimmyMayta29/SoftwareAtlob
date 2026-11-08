import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Sparkles,
  UserCheck
} from 'lucide-react';
import { Sesion } from '../../api/authApi';
import { apiClient } from '../../api/client';
import { evaluarFortalezaPasswordUI, validarRucModulo11UI } from '../../utils/fortalezaPassword';
import atlobIsotipo from '../../assets/brand/atlob_isotipo.webp';
import atlobLogoBlanco from '../../assets/brand/atlob_logo_horizontal_blanco.webp';

interface AsistenteSetupInicialProps {
  onSetupCompletado: (sesion: Sesion) => Promise<void>;
}

function mensajeClaroSetup(raw: string): string {
  const limpio = raw.replace(/^[A-Z0-9_]+:\s*/, '').trim();
  return limpio || 'No se pudo completar la configuración inicial. Revise los datos ingresados.';
}

export const AsistenteSetupInicial: React.FC<AsistenteSetupInicialProps> = ({
  onSetupCompletado
}) => {
  const [nombreEstudio, setNombreEstudio] = useState('');
  const [rucEstudio, setRucEstudio] = useState('');
  const [adminNombre, setAdminNombre] = useState('');
  const [usuario, setUsuario] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  const fortaleza = evaluarFortalezaPasswordUI(adminPassword, usuario);
  const rucIngresado = rucEstudio.trim();
  const rucEsValido = rucIngresado.length === 0 || (rucIngresado.length === 11 && validarRucModulo11UI(rucIngresado));
  const coincidenPasswords = adminPasswordConfirm.length > 0 && adminPassword === adminPasswordConfirm;

  const coloresBarra = [
    'bg-slate-200',
    'bg-rose-500',
    'bg-amber-500',
    'bg-blue-600',
    'bg-emerald-600'
  ];
  const colorActual = coloresBarra[fortaleza.puntaje] || 'bg-slate-200';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMensaje(null);

    if (nombreEstudio.trim().length < 2) {
      setErrorMensaje('Ingrese el nombre de su estudio contable o despacho.');
      return;
    }
    if (rucIngresado.length > 0 && !validarRucModulo11UI(rucIngresado)) {
      setErrorMensaje('El RUC ingresado no es válido (debe tener 11 dígitos válidos en SUNAT) o puede dejarlo en blanco.');
      return;
    }
    if (adminNombre.trim().length < 2) {
      setErrorMensaje('Ingrese su nombre completo.');
      return;
    }
    const usuarioLimpio = usuario.trim().toLowerCase();
    if (usuarioLimpio.length < 3) {
      setErrorMensaje('Ingrese un usuario (mínimo 3 caracteres, sin espacios) o su correo electrónico.');
      return;
    }
    if (!fortaleza.valida) {
      setErrorMensaje(fortaleza.mensaje || 'Elija una contraseña de al menos 10 caracteres que combine letras y números.');
      return;
    }
    if (adminPassword !== adminPasswordConfirm) {
      setErrorMensaje('La contraseña y su confirmación no coinciden.');
      return;
    }

    setProcesando(true);
    try {
      const respuesta: any = await apiClient.post('/setup/inicializar', {
        nombreEstudio: nombreEstudio.trim(),
        rucEstudio: rucIngresado || undefined,
        adminNombre: adminNombre.trim(),
        usuario: usuarioLimpio,
        adminPassword,
        adminPasswordConfirm
      });
      if (!respuesta?.success || !respuesta?.data?.accessToken) {
        throw new Error(respuesta?.error || 'No se pudo completar el inicio del sistema.');
      }
      setAdminPassword('');
      setAdminPasswordConfirm('');
      await onSetupCompletado(respuesta.data);
    } catch (err: any) {
      setErrorMensaje(mensajeClaroSetup(err?.message || 'Error al registrar la cuenta titular.'));
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden border border-[#CBD5E1]">
        <div className="bg-[#01172C] px-6 py-5 text-white">
          <div className="flex items-center gap-3.5">
            <img
              src={atlobIsotipo}
              alt="ATLOB ERP"
              className="w-11 h-11 object-contain shrink-0"
              width={44}
              height={44}
            />
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
                Bienvenido a ATLOB ERP
              </h1>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                Configure su estudio y la cuenta titular de este equipo en un solo paso.
              </p>
            </div>
          </div>
        </div>

        <form id="form-setup-inicial" onSubmit={handleSubmit} className="p-6 space-y-4" noValidate>
          {errorMensaje && (
            <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMensaje}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="setup-nombre-estudio" className="block text-xs font-semibold text-slate-700 mb-1">
                Nombre del estudio o despacho *
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  id="setup-nombre-estudio"
                  type="text"
                  value={nombreEstudio}
                  onChange={e => setNombreEstudio(e.target.value)}
                  disabled={procesando}
                  placeholder="Ej. Estudio Contable Mendoza & Asociados"
                  className="w-full text-sm pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="setup-ruc-estudio" className="block text-xs font-semibold text-slate-700 mb-1">
                RUC <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <input
                id="setup-ruc-estudio"
                type="text"
                inputMode="numeric"
                maxLength={11}
                value={rucEstudio}
                onChange={e => setRucEstudio(e.target.value.replace(/\D/g, ''))}
                disabled={procesando}
                placeholder="Opcional"
                className={`w-full text-sm px-3 py-2 border rounded-lg font-mono focus:outline-none ${
                  rucIngresado.length > 0
                    ? rucEsValido
                      ? 'border-emerald-500 focus:ring-2 focus:ring-emerald-500'
                      : 'border-rose-400 focus:ring-2 focus:ring-rose-500'
                    : 'border-slate-300 focus:ring-2 focus:ring-indigo-500'
                }`}
              />
              {rucIngresado.length > 0 && (
                <p className={`text-[11px] mt-1 ${rucEsValido ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {rucEsValido ? '✓ RUC válido' : 'Ingrese 11 dígitos válidos o déjelo vacío'}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label htmlFor="setup-nombre-completo" className="block text-xs font-semibold text-slate-700 mb-1">
                Nombre completo del titular *
              </label>
              <div className="relative">
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  id="setup-nombre-completo"
                  type="text"
                  value={adminNombre}
                  onChange={e => setAdminNombre(e.target.value)}
                  disabled={procesando}
                  placeholder="Ej. Carlos Mendoza Quispe"
                  className="w-full text-sm pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="setup-usuario" className="block text-xs font-semibold text-slate-700 mb-1">
                Usuario de ingreso *
              </label>
              <input
                id="setup-usuario"
                type="text"
                autoComplete="username"
                value={usuario}
                onChange={e => setUsuario(e.target.value)}
                disabled={procesando}
                placeholder="Ej. cmendoza o correo@estudio.pe"
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="setup-password" className="text-xs font-semibold text-slate-700">
                  Contraseña (mín. 10 caracteres) *
                </label>
                <button
                  type="button"
                  onClick={() => setMostrarPassword(v => !v)}
                  className="text-slate-500 hover:text-slate-700 text-[11px] inline-flex items-center gap-1"
                >
                  {mostrarPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{mostrarPassword ? 'Ocultar' : 'Mostrar'}</span>
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  id="setup-password"
                  type={mostrarPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  disabled={procesando}
                  placeholder="Mínimo 10 caracteres"
                  className="w-full text-sm pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="setup-password-confirm" className="block text-xs font-semibold text-slate-700 mb-1">
                Confirmar contraseña *
              </label>
              <input
                id="setup-password-confirm"
                type={mostrarPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={adminPasswordConfirm}
                onChange={e => setAdminPasswordConfirm(e.target.value)}
                disabled={procesando}
                placeholder="Repita la contraseña"
                className={`w-full text-sm px-3 py-2 border rounded-lg focus:outline-none ${
                  adminPasswordConfirm.length === 0
                    ? 'border-slate-300 focus:ring-2 focus:ring-indigo-500'
                    : coincidenPasswords
                      ? 'border-emerald-500 focus:ring-2 focus:ring-emerald-500'
                      : 'border-rose-400 focus:ring-2 focus:ring-rose-500'
                }`}
                required
              />
            </div>
          </div>

          {/* Indicador visual de fortaleza */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">Fortaleza de la contraseña:</span>
              <span
                id="setup-password-nivel"
                className={`font-bold ${
                  fortaleza.puntaje >= 3
                    ? 'text-emerald-700'
                    : fortaleza.puntaje === 2
                      ? 'text-amber-700'
                      : 'text-slate-600'
                }`}
              >
                {fortaleza.etiqueta}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
              {[1, 2, 3, 4].map(nivel => (
                <div
                  key={nivel}
                  className={`h-1.5 rounded-full transition-colors ${
                    adminPassword.length > 0 && Math.max(1, fortaleza.puntaje) >= nivel ? colorActual : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
            <p className="text-[11px] text-slate-600">
              {fortaleza.valida
                ? '✓ Contraseña segura. La verificación en dos pasos (2FA) es opcional y puede activarse después en Usuarios y permisos.'
                : fortaleza.mensaje}
            </p>
          </div>

          <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl flex items-start gap-2.5 text-[11.5px] text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <span>
              Se cargarán automáticamente el Plan Contable (PCGE) y los catálogos SUNAT, asignándole el rol{' '}
              <strong>Administrador</strong> titular y una licencia local de evaluación para hasta <strong>3 usuarios</strong>.
            </span>
          </div>

          <div className="pt-1 flex justify-end">
            <button
              id="setup-submit"
              type="submit"
              disabled={procesando}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl shadow-md transition-colors cursor-pointer"
            >
              <span>{procesando ? 'Preparando su estudio…' : 'Crear cuenta y comenzar'}</span>
              {!procesando && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
