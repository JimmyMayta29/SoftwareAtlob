import { apiClient } from './client';
import { Sesion } from './authApi';
import { guardarSesion } from './session';

export interface ResumenLicenciaDTO {
  id: string;
  tipo: 'EVALUACION' | 'COMERCIAL';
  maxUsuarios: number;
  usuariosActivos: number;
  vigenteHasta: string | null;
  creadaEn: string;
  puedeCrearUsuario: boolean;
  motivoLimite?: string;
}

export interface UsuarioEstudioDTO {
  id: string;
  email: string;
  nombre: string;
  rolGlobal: 'ADMINISTRADOR' | 'CONTADOR_SENIOR' | 'ASISTENTE_CONTABLE' | 'AUDITOR_REVISOR';
  mfaActivado: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface EstadoUsuariosDTO {
  usuarios: UsuarioEstudioDTO[];
  mfaRequerido: boolean;
  licencia: ResumenLicenciaDTO;
}

export const usuariosLicenciaApi = {
  async obtenerResumenLicencia(): Promise<ResumenLicenciaDTO> {
    const res: any = await apiClient.get('/licencia/resumen');
    if (!res?.data?.tipo) throw new Error('No se pudo leer el estado de la licencia.');
    return res.data;
  },

  async listarEstado(): Promise<EstadoUsuariosDTO> {
    const res: any = await apiClient.get('/usuarios');
    if (!Array.isArray(res?.data?.usuarios)) throw new Error('No se pudo cargar la lista de usuarios.');
    return res.data;
  },

  async crearColaborador(datos: {
    nombre: string;
    usuario: string;
    password: string;
    rolGlobal: string;
  }): Promise<{ usuario: UsuarioEstudioDTO; licencia: ResumenLicenciaDTO }> {
    const res: any = await apiClient.post('/usuarios', datos);
    return res.data;
  },

  async cambiarEstado(
    usuarioId: string,
    activo: boolean
  ): Promise<{ usuario: UsuarioEstudioDTO; licencia: ResumenLicenciaDTO }> {
    const res: any = await apiClient.patch(`/usuarios/${encodeURIComponent(usuarioId)}/estado`, { activo });
    return res.data;
  },

  async enrolarMfa(): Promise<{ secret: string; otpauthUrl: string; expiraEnSegundos: number }> {
    const res: any = await apiClient.post('/usuarios/mfa/enrolar', {});
    return res.data;
  },

  async activarMfa(codigo: string): Promise<{ mfaRequerido: boolean; mfaActivado: boolean; sesion?: Sesion }> {
    const res: any = await apiClient.post('/usuarios/mfa/activar', { codigo });
    if (res?.data?.sesion?.accessToken) {
      guardarSesion(res.data.sesion);
    }
    return res.data;
  },

  async desactivarMfa(): Promise<{ mfaRequerido: boolean; mfaActivado: boolean }> {
    const res: any = await apiClient.post('/usuarios/mfa/desactivar', {});
    return res.data;
  }
};

