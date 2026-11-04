import { apiClient } from './client';

export interface PleLibroConfig {
  codigoLibro: string;
  nombreLibro: string;
  versionFormato: string;
  validadoOficial: boolean;
  totalCamposOficial?: number;
  especificacionNormativa: string;
}

export interface PleExportacion {
  id: string;
  empresaId: string;
  periodo: string;
  codigoLibro: string;
  nombreArchivo: string;
  contenidoTxt: string;
  hashSha256: string;
  totalFilas: number;
  esOficial: boolean;
  indicadorContenido?: '0' | '1';
  indicadorOperacion?: '0' | '1' | '2';
  validacionesSuperadas: boolean;
  totalesControl?: {
    totalFilas: number;
    sumaDebe: number;
    sumaHaber: number;
    sumaBase: number;
    sumaIgv: number;
    sumaTotal: number;
  };
  detalleValidaciones?: {
    asientosBorrador: number;
    cuadreContableOk: boolean;
    camposRequeridosOk: boolean;
    advertencias: string[];
  };
  createdAt: string;
}

export interface PleValidacionResult {
  esValido: boolean;
  tipoFormato: string;
  nombreArchivo?: string;
  totalLineas: number;
  totalErrores: number;
  totalAdvertencias: number;
  errores: {
    linea: number;
    columna: number;
    nombreCampo: string;
    valor: string;
    mensaje: string;
  }[];
  advertencias: string[];
  resumenControl: {
    totalFilas: number;
    sumaDebe?: number;
    sumaHaber?: number;
    sumaBase?: number;
    sumaIgv?: number;
    sumaTotal?: number;
  };
}

export const pleApi = {
  async listarLibros(empresaId: string): Promise<PleLibroConfig[]> {
    const res = await apiClient.get<PleLibroConfig[]>(`/empresas/${empresaId}/ple/libros`);
    return res.data || [];
  },

  async prevalidar(empresaId: string, periodo: string, codigoLibro: string) {
    const res = await apiClient.get(`/empresas/${empresaId}/ple/prevalidar?periodo=${periodo}&codigoLibro=${codigoLibro}`);
    return res.data;
  },

  async exportar(empresaId: string, periodo: string, codigoLibro: string, ruc?: string, sinMovimiento?: boolean, esOficial?: boolean, moneda?: 'PEN' | 'USD'): Promise<PleExportacion> {
    const res = await apiClient.post<PleExportacion>(`/empresas/${empresaId}/ple/exportar`, {
      periodo,
      codigoLibro,
      ruc,
      sinMovimiento,
      esOficial,
      moneda
    });
    return res.data;
  },

  async exportarJob(empresaId: string, periodo: string, codigoLibro: string, ruc?: string) {
    const res = await apiClient.post(`/empresas/${empresaId}/ple/exportar-job`, {
      periodo,
      codigoLibro,
      ruc
    });
    return res.data;
  },

  async obtenerExportacion(id: string): Promise<PleExportacion> {
    const res = await apiClient.get<PleExportacion>(`/ple-exportaciones/${id}`);
    return res.data;
  },

  async listarExportaciones(empresaId: string): Promise<PleExportacion[]> {
    const res = await apiClient.get<PleExportacion[]>(`/empresas/${empresaId}/ple/exportaciones`);
    return res.data || [];
  },

  async validarTxt(contenidoTxt: string, codigoLibro?: string, nombreArchivo?: string): Promise<PleValidacionResult> {
    const res = await apiClient.post<PleValidacionResult>('/ple/validar-txt', {
      contenidoTxt,
      codigoLibro,
      nombreArchivo
    });
    return res.data;
  },

  async listarHistorial(empresaId: string, periodo?: string) {
    const q = periodo ? `?periodo=${periodo}` : '';
    const res = await apiClient.get(`/empresas/${empresaId}/ple/historial${q}`);
    return res.data || [];
  }
};

