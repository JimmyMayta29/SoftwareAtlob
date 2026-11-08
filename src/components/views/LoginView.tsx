import React, { useState, useEffect, useRef } from 'react';
import { LogIn, Eye, EyeOff, AlertCircle, AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react';
import { authApi, Sesion } from '../../api/authApi';
import atlobLogo from '../../assets/brand/atlob_logo_horizontal.webp';

export interface LoginViewProps {
  onAutenticado: (sesion: Sesion) => Promise<void>;
  nombreEstudio?: string;
  version?: string;
}

const STORAGE_RECORDAR_KEY = 'atlob_recordar_usuario';
const STORAGE_USUARIO_KEY = 'atlob_usuario_recordado';

function limpiarMensajeError(raw: string): string {
  if (!raw) return 'Usuario o contraseña incorrectos.';
  const limpio = raw.replace(/^[A-Z0-9_]+:\s*/, '').trim();
  if (raw.includes('CREDENCIALES_INVALIDAS') || raw.includes('USUARIO_NO_ENCONTRADO')) {
    return 'Usuario o contraseña incorrectos.';
  }
  return limpio || 'No se pudo iniciar sesión. Verifique sus datos.';
}

export function LoginView({ onAutenticado, nombreEstudio, version = '2026.1' }: LoginViewProps) {
  const [identificador, setIdentificador] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [bloqMayus, setBloqMayus] = useState(false);
  const [recordarUsuario, setRecordarUsuario] = useState(true);

  // 2FA progresivo en la misma tarjeta
  const [requiereMfa, setRequiereMfa] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  // Estados de proceso y feedback
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const [bloqueoSegundos, setBloqueoSegundos] = useState<number | null>(null);
  const [errorConexion, setErrorConexion] = useState(false);

  const usuarioRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const totpRef = useRef<HTMLInputElement>(null);

  // Cargar preferencia de usuario recordado al montar
  useEffect(() => {
    const preferenciaRecordar = localStorage.getItem(STORAGE_RECORDAR_KEY);
    const usuarioGuardado = localStorage.getItem(STORAGE_USUARIO_KEY);

    if (preferenciaRecordar !== null) {
      setRecordarUsuario(preferenciaRecordar === 'true');
    }

    if (usuarioGuardado && preferenciaRecordar !== 'false') {
      setIdentificador(usuarioGuardado);
      // Foco inteligente en contraseña cuando el usuario ya está cargado
      setTimeout(() => passwordRef.current?.focus(), 80);
    } else {
      setTimeout(() => usuarioRef.current?.focus(), 80);
    }
  }, []);

  // Temporizador de cuenta bloqueada
  useEffect(() => {
    if (bloqueoSegundos === null || bloqueoSegundos <= 0) return;
    const interval = setInterval(() => {
      setBloqueoSegundos((prev) => {
        if (prev === null || prev <= 1) {
          setError('');
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [bloqueoSegundos]);

  // Detector de Bloq Mayús
  const comprobarBloqMayus = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setBloqMayus(e.getModifierState('CapsLock'));
  };

  const manejarSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (procesando || (bloqueoSegundos !== null && bloqueoSegundos > 0)) return;

    setError('');
    setErrorConexion(false);
    setProcesando(true);

    try {
      // Guardar o eliminar usuario recordado según la casilla
      if (recordarUsuario) {
        localStorage.setItem(STORAGE_RECORDAR_KEY, 'true');
        localStorage.setItem(STORAGE_USUARIO_KEY, identificador.trim());
      } else {
        localStorage.setItem(STORAGE_RECORDAR_KEY, 'false');
        localStorage.removeItem(STORAGE_USUARIO_KEY);
      }

      const sesion = await authApi.login(identificador.trim(), password, totpCode.trim());
      setPassword('');
      setTotpCode('');
      await onAutenticado(sesion);
    } catch (err: any) {
      const msg = String(err?.message || '');

      // Caso 1: Requiere 2FA (TOTP)
      if (msg.includes('MFA_REQUERIDO') || (msg.includes('MFA_') && !requiereMfa)) {
        setRequiereMfa(true);
        setError('Ingrese el código temporal de 6 dígitos generado por su aplicación de autenticación.');
        setTimeout(() => totpRef.current?.focus(), 100);
        return;
      }

      // Caso 2: Bloqueo temporal por intentos
      if (msg.includes('CUENTA_BLOQUEADA_TEMPORALMENTE')) {
        const match = msg.match(/(\d+)\s*segundos/i);
        const segundos = match ? parseInt(match[1], 10) : 60;
        setBloqueoSegundos(segundos);
        setError(`Demasiados intentos fallidos. Por seguridad, espere ${segundos} segundos antes de volver a intentar.`);
        return;
      }

      // Caso 3: Servidor no disponible o error de red
      if (
        msg.includes('ECONNREFUSED') ||
        msg.includes('Network Error') ||
        msg.includes('Failed to fetch') ||
        err?.code === 'ERR_NETWORK' ||
        err?.response?.status === 502 ||
        err?.response?.status === 503
      ) {
        setErrorConexion(true);
        setError('No se pudo conectar con el servicio local de ATLOB ERP. Verifique que PostgreSQL esté en ejecución.');
        return;
      }

      // Caso 4: Credenciales inválidas o código TOTP incorrecto
      setError(limpiarMensajeError(msg));
      if (!requiereMfa) {
        passwordRef.current?.select();
      } else {
        totpRef.current?.select();
      }
    } finally {
      setProcesando(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F0F4F8] flex items-center justify-center p-4 selection:bg-[#307AA7] selection:text-white">
      <div className="w-full max-w-md">
        {/* Tarjeta única y sobria de autenticación */}
        <section
          aria-labelledby="login-encabezado"
          className="bg-white rounded-2xl p-7 sm:p-8 shadow-xl border border-[#CBD5E1] transition-all"
        >
          {/* Encabezado con Identidad Oficial */}
          <div className="text-center mb-6">
            <div className="flex justify-center mb-3">
              <img
                src={atlobLogo}
                alt="ATLOB ERP"
                className="h-11 sm:h-12 w-auto object-contain"
                width={220}
                height={82}
              />
            </div>
            <h1 id="login-encabezado" className="text-xl font-extrabold text-[#01172C] tracking-tight">
              Iniciar sesión
            </h1>
            <p className="text-xs text-[#475569] mt-0.5">
              {nombreEstudio && nombreEstudio !== 'ATLOB ERP' ? (
                <span className="font-semibold text-[#01172C]">{nombreEstudio}</span>
              ) : (
                'Sistema Contable & Tributario SUNAT / PCGE'
              )}
              <span className="mx-1 text-[#CBD5E1]">·</span>
              <span className="text-[#64748B] font-mono">v{version}</span>
            </p>
          </div>

          {/* Alerta de Error con accesibilidad aria-live */}
          {error && (
            <div
              role="alert"
              aria-live="polite"
              className={`mb-5 p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                bloqueoSegundos !== null && bloqueoSegundos > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : errorConexion
                    ? 'bg-orange-50 border-orange-200 text-orange-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {bloqueoSegundos !== null && bloqueoSegundos > 0 ? (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              ) : errorConexion ? (
                <RefreshCw className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <span>{error}</span>
                {bloqueoSegundos !== null && bloqueoSegundos > 0 && (
                  <p className="font-bold text-amber-950 mt-1 font-mono">
                    Tiempo restante: {bloqueoSegundos}s
                  </p>
                )}
                {errorConexion && (
                  <p className="text-[11px] text-orange-800 mt-1">
                    Acción sugerida: Abra Servicios de Windows y compruebe el estado de postgresql.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Formulario de Login */}
          <form onSubmit={manejarSubmit} className="space-y-4" noValidate>
            {/* Campo: Usuario */}
            <div>
              <label
                htmlFor="login-identificador"
                className="block text-xs font-bold text-[#01172C] mb-1 tracking-wide"
              >
                Usuario o correo
              </label>
              <input
                ref={usuarioRef}
                id="login-identificador"
                name="username"
                type="text"
                autoComplete="username"
                required
                disabled={procesando || (bloqueoSegundos !== null && bloqueoSegundos > 0)}
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                placeholder="Nombre de usuario o correo"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#94A3B8] rounded-xl text-[#01172C] placeholder-[#94A3B8] focus:border-[#307AA7] focus:ring-2 focus:ring-[#307AA7]/20 outline-hidden transition"
              />
            </div>

            {/* Campo: Contraseña con visualización y aviso Bloq Mayús */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-bold text-[#01172C] tracking-wide"
                >
                  Contraseña
                </label>
                {bloqMayus && (
                  <span
                    role="status"
                    className="text-[11px] font-semibold text-amber-700 flex items-center gap-1 animate-pulse"
                  >
                    <AlertTriangle className="w-3 h-3" /> Bloq Mayús activado
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  ref={passwordRef}
                  id="login-password"
                  name="password"
                  type={mostrarPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  disabled={procesando || (bloqueoSegundos !== null && bloqueoSegundos > 0)}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={comprobarBloqMayus}
                  onKeyUp={comprobarBloqMayus}
                  className="w-full px-3.5 py-2.5 pr-10 text-sm bg-white border border-[#94A3B8] rounded-xl text-[#01172C] placeholder-[#94A3B8] focus:border-[#307AA7] focus:ring-2 focus:ring-[#307AA7]/20 outline-hidden transition"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword(!mostrarPassword)}
                  aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  tabIndex={0}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#64748B] hover:text-[#01172C] rounded-lg transition"
                >
                  {mostrarPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Campo 2FA / TOTP: Aparece dinámicamente en la misma tarjeta solo si es requerido */}
            {requiereMfa && (
              <div className="p-3.5 bg-blue-50/80 border border-[#307AA7]/30 rounded-xl space-y-2 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#01172C]">
                  <ShieldCheck className="w-4 h-4 text-[#307AA7]" />
                  <span>Verificación en dos pasos (2FA)</span>
                </div>
                <label htmlFor="login-totp" className="sr-only">
                  Código de autenticación de 6 dígitos
                </label>
                <input
                  ref={totpRef}
                  id="login-totp"
                  name="one-time-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  required
                  disabled={procesando}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3.5 py-2 text-center text-lg font-mono font-bold tracking-widest bg-white border border-[#307AA7] rounded-xl text-[#01172C] focus:ring-2 focus:ring-[#307AA7]/30 outline-hidden"
                />
                <p className="text-[11px] text-[#475569] text-center">
                  Ingrese el código de 6 dígitos que muestra su teléfono.
                </p>
              </div>
            )}

            {/* Recordar Usuario */}
            <div className="flex items-center justify-between pt-1 text-xs">
              <label className="flex items-center gap-2 text-[#475569] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={recordarUsuario}
                  onChange={(e) => setRecordarUsuario(e.target.checked)}
                  className="w-4 h-4 rounded border-[#94A3B8] text-[#01172C] focus:ring-[#307AA7] cursor-pointer"
                />
                <span>Recordar usuario en este equipo</span>
              </label>
            </div>

            {/* Botón de Ingreso */}
            <button
              id="login-submit"
              type="submit"
              disabled={procesando || (bloqueoSegundos !== null && bloqueoSegundos > 0)}
              className="w-full mt-2 py-2.5 px-4 bg-[#01172C] hover:bg-[#082845] active:bg-[#041220] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              {procesando ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Iniciando sesión...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>{requiereMfa ? 'Verificar e ingresar' : 'Ingresar'}</span>
                </>
              )}
            </button>
          </form>
        </section>

        {/* Pie de pantalla sobrio */}
        <footer className="text-center mt-5 text-[11px] text-[#64748B]">
          <p>© 2026 Atlob Consultores S.A.C. · Confidencialidad y Seguridad Contable</p>
        </footer>
      </div>
    </main>
  );
}
