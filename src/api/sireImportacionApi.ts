import { apiClient } from './client';

export interface FilaSireAnalizada {
  indice: number;
  car: string;
  periodo: string;
  fechaEmision: string; // DD/MM/YYYY
  fechaEmisionIso: string; // YYYY-MM-DD
  fechaVencimiento?: string;
  fechaVencimientoIso?: string;
  tipoComprobante: string; // 01, 03, 07, 08, etc.
  tipoComprobanteNombre: string;
  serie: string;
  numero: string;
  tipoDocIdentidad: string; // 6=RUC, 1=DNI
  numDocIdentidad: string;
  razonSocial: string;
  baseImponible: number;
  baseNoGravada: number;
  igv: number;
  otrosTributos: number;
  total: number;
  moneda: 'PEN' | 'USD';
  tipoCambio: number;
  totalPen: number;
  clasificacionBssSss?: string;
  detraccion?: boolean;
  tipoOperacion?: string;
  estadoComprobanteSunat?: string;
  esNotaAjuste: boolean;
  docModificadoTipo?: string;
  docModificadoSerie?: string;
  docModificadoNumero?: string;
  docModificadoFecha?: string;
  docModificadoExiste?: boolean;
  docModificadoId?: string;
  cuentaPropuestaCodigo: string;
  cuentaPropuestaNombre: string;
  cuentaRequiereRevision: boolean;
  cuentaIgvCodigo: string;
  cuentaIgvNombre: string;
  cuentaTerceroCodigo: string;
  cuentaTerceroNombre: string;
  auxiliarExiste: boolean;
  auxiliarId?: string;
  glosaPropuesta: string;
  estadoValidacion: 'PENDIENTE' | 'CON_ADVERTENCIA' | 'REQUIERE_REVISION' | 'YA_IMPORTADO' | 'ANULADO';
  advertencias: string[];
  incluir: boolean;
}

export interface ResultadoAnalisisSire {
  tipo: 'COMPRAS' | 'VENTAS';
  nombreArchivo: string;
  rucEmisor: string;
  razonSocialEmisor: string;
  periodo: string;
  totalRegistros: number;
  totalBaseImponible: number;
  totalIgv: number;
  totalImporte: number;
  resumenEstados: {
    pendientes: number;
    conAdvertencia: number;
    requierenRevision: number;
    yaImportados: number;
    anulados: number;
  };
  filas: FilaSireAnalizada[];
}

export interface ReglasMapeoSire {
  compras: {
    clasif1_mercaderias: string;
    clasif2_activoFijo: string;
    clasif3_otrosActivos: string;
    clasif4_servicios: string;
    clasif5_otrosGastos: string;
    igvCreditoFiscal: string;
    proveedorRuc: string;
    proveedorDni: string;
    cuentaDetraccion: string;
  };
  ventas: {
    operacion0101_interna: string;
    operacion0200_exportacion: string;
    operacion0102_anticipos: string;
    operacion0112_gratuita: string;
    igvDebitoFiscal: string;
    clienteRuc: string;
    clienteDni: string;
  };
}

export interface ResultadoContabilizacionSire {
  exitosos: number;
  fallidos: number;
  detalles: Array<{
    indice: number;
    serie: string;
    numero: string;
    comprobanteId?: string;
    asientoId?: string;
    asientoNumero?: string;
    subdiarioCodigo?: string;
    total: number;
    exito: boolean;
    error?: string;
  }>;
}

export function convertirArchivoABase64(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(archivo);
  });
}

export const sireImportacionApi = {
  async analizarZip(
    empresaId: string,
    tipo: 'COMPRAS' | 'VENTAS',
    periodo: string,
    archivo: File
  ): Promise<ResultadoAnalisisSire> {
    const archivoBase64 = await convertirArchivoABase64(archivo);
    const res: any = await apiClient.post(`/empresas/${empresaId}/sire/importar/analizar`, {
      tipo,
      periodo,
      nombreArchivo: archivo.name,
      archivoBase64
    });
    return res.data;
  },

  async contabilizarFilas(
    empresaId: string,
    tipo: 'COMPRAS' | 'VENTAS',
    periodo: string,
    filas: FilaSireAnalizada[]
  ): Promise<ResultadoContabilizacionSire> {
    const res: any = await apiClient.post(`/empresas/${empresaId}/sire/importar/contabilizar`, {
      tipo,
      periodo,
      filas
    });
    return res.data;
  },

  async obtenerReglasMapeo(empresaId: string): Promise<ReglasMapeoSire> {
    const res: any = await apiClient.get(`/empresas/${empresaId}/sire/reglas-mapeo`);
    return res.data;
  },

  async guardarReglasMapeo(empresaId: string, reglas: ReglasMapeoSire): Promise<ReglasMapeoSire> {
    const res: any = await apiClient.put(`/empresas/${empresaId}/sire/reglas-mapeo`, reglas);
    return res.data;
  }
};
