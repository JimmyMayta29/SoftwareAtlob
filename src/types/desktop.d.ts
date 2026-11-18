export interface EstadoConexionDesktop {
  modo: 'cliente' | 'local';
  online: boolean;
  servidorUrl: string;
  host: string;
  puerto: string;
  huellaCa: string | null;
  ultimoChequeo: string | null;
  ultimoError: string | null;
  baseDatos: string | null;
}

export interface AtlobDesktopBridge {
  esEscritorio: boolean;
  obtenerEstadoConexion: () => Promise<EstadoConexionDesktop>;
  verificarConexionAhora: () => Promise<EstadoConexionDesktop>;
  reconfigurarServidor: () => Promise<{ ok: boolean }>;
  suscribirEstadoConexion: (callback: (estado: EstadoConexionDesktop) => void) => () => void;
}

declare global {
  interface Window {
    atlobDesktop?: AtlobDesktopBridge;
  }
}

export { };

