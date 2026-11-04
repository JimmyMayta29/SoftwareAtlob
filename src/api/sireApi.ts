import { apiClient } from './client';

export interface SunatConexionEstado {
  configurado: boolean;
  ruc?: string;
  estado: string;
  modoSimulado: boolean;
  ultimoChequeo?: string;
  ultimoError?: string;
}

export interface SireConciliacionLinea {
  id: string;
  conciliacionId: string;
  empresaId: string;
  tipo: 'COMPRAS' | 'VENTAS';
  claveComprobante: string;
  tipoComprobante: string;
  serie: string;
  numero: string;
  rucEmisor: string;
  razonSocialEmisor: string;
  fechaEmision: string;
  moneda: string;
  baseSunat: number;
  igvSunat: number;
  totalSunat: number;
  comprobanteSistemaId?: string;
  baseSistema?: number;
  igvSistema?: number;
  totalSistema?: number;
  estadoConciliacion: 'COINCIDE' | 'SOLO_EN_SISTEMA' | 'SOLO_EN_SUNAT' | 'DIFERENCIA_IMPORTE' | 'ANULADO_EN_SUNAT' | 'PERIODO_DISTINTO' | 'DIFERENCIA_OTROS_CAMPOS' | 'POSIBLE_DUPLICADO';
  diferenciaBase: number;
  diferenciaIgv: number;
  diferenciaTotal: number;
  decision: 'PENDIENTE' | 'ACEPTADA' | 'OBSERVADA' | 'IGNORADA' | 'COLA_REVISION';
  motivoDecision?: string;
  comprobanteGeneradoId?: string;
  asientoAjusteId?: string;
  asientoExtornoId?: string;
  car?: string;
  tieneDetraccion?: boolean;
}

export interface SireConciliacionResumen {
  id: string;
  empresaId: string;
  tipo: 'COMPRAS' | 'VENTAS';
  periodo: string;
  fechaConciliacion: string;
  totalCoinciden: number;
  totalSoloSistema: number;
  totalSoloSunat: number;
  totalDiferencias: number;
  totalAnuladosSunat?: number;
  totalPeriodoDistinto?: number;
  totalDiferenciaOtrosCampos?: number;
  totalPosibleDuplicado?: number;
  lineas: SireConciliacionLinea[];
}

export interface ReglaProveedorSire {
  id?: string;
  empresaId: string;
  proveedorRuc: string;
  proveedorRazonSocial?: string;
  destinoCompra: 'DESTINO_1' | 'DESTINO_2' | 'DESTINO_3' | 'DESTINO_4';
  cuentaGasto: string;
  centroCostoId?: string;
}

export const sireApi = {
  async obtenerEstadoConexion(empresaId: string): Promise<SunatConexionEstado> {
    const res = await apiClient.get<SunatConexionEstado>(`/empresas/${empresaId}/sire/conexion/estado`);
    return res.data;
  },

  async guardarConexion(empresaId: string, datos: any) {
    const res = await apiClient.put(`/empresas/${empresaId}/sire/conexion`, datos);
    return res.data;
  },

  async validarConexion(empresaId: string) {
    const res = await apiClient.post(`/empresas/${empresaId}/sire/conexion/validar`);
    return res.data;
  },

  async solicitarTicket(empresaId: string, tipo: 'COMPRAS' | 'VENTAS', periodo: string) {
    const res = await apiClient.post(`/empresas/${empresaId}/sire/tickets/solicitar`, { tipo, periodo });
    return res.data;
  },

  async consultarTicket(empresaId: string, tipo: 'COMPRAS' | 'VENTAS', periodo: string, numTicket: string) {
    const res = await apiClient.post(`/empresas/${empresaId}/sire/tickets/consultar`, { tipo, periodo, numTicket });
    return res.data;
  },

  async descargarPropuesta(empresaId: string, tipo: 'COMPRAS' | 'VENTAS', periodo: string) {
    const res = await apiClient.post(`/empresas/${empresaId}/sire/descargar`, { tipo, periodo });
    return res.data;
  },

  async importarPropuestaManual(empresaId: string, tipo: 'COMPRAS' | 'VENTAS', periodo: string, nombreArchivo: string, contenidoBase64: string) {
    const res = await apiClient.post(`/empresas/${empresaId}/sire/propuestas/importar-manual`, {
      tipo,
      periodo,
      nombreArchivo,
      contenidoBase64
    });
    return res.data;
  },

  async obtenerConciliacion(empresaId: string, tipo: 'COMPRAS' | 'VENTAS', periodo: string, tolerancia?: number): Promise<SireConciliacionResumen> {
    const tolParam = tolerancia !== undefined ? `&tolerancia=${tolerancia}` : '';
    const res = await apiClient.get<SireConciliacionResumen>(
      `/empresas/${empresaId}/sire/conciliacion?tipo=${tipo}&periodo=${periodo}${tolParam}`
    );
    return res.data;
  },

  async aplicarConciliacion(empresaId: string, accion: 'ACEPTAR' | 'OBSERVAR' | 'IGNORAR', lineasIds: string[], motivo?: string) {
    const res = await apiClient.post(`/empresas/${empresaId}/sire/conciliacion/aplicar`, {
      accion,
      lineasIds,
      motivo
    });
    return res.data;
  },

  async generarAsientoAjuste(empresaId: string, lineaId: string, cuentaAjuste?: string) {
    const res = await apiClient.post(`/empresas/${empresaId}/sire/lineas/${lineaId}/ajuste`, { cuentaAjuste });
    return res.data;
  },

  async revertirLinea(empresaId: string, lineaId: string, motivo: string) {
    const res = await apiClient.post(`/empresas/${empresaId}/sire/lineas/${lineaId}/revertir`, { motivo });
    return res.data;
  },

  async guardarReglaProveedor(empresaId: string, regla: ReglaProveedorSire) {
    const res = await apiClient.post(`/empresas/${empresaId}/sire/reglas-proveedor`, regla);
    return res.data;
  },

  async listarReglasProveedor(empresaId: string): Promise<ReglaProveedorSire[]> {
    const res = await apiClient.get<ReglaProveedorSire[]>(`/empresas/${empresaId}/sire/reglas-proveedor`);
    return res.data || [];
  },

  async aceptarPropuestaOficial(empresaId: string, tipo: 'COMPRAS' | 'VENTAS', periodo: string) {
    const res = await apiClient.post(`/empresas/${empresaId}/sire/aceptar-oficial`, { tipo, periodo });
    return res.data;
  },

  async reemplazarPropuestaOficial(empresaId: string, tipo: 'COMPRAS' | 'VENTAS', periodo: string, comprobantesReemplazo?: any[], archivoContenidoTxt?: string) {
    const res = await apiClient.post(`/empresas/${empresaId}/sire/reemplazar-oficial`, {
      tipo,
      periodo,
      comprobantesReemplazo: comprobantesReemplazo || [],
      archivoContenidoTxt
    });
    return res.data;
  },

  async registrarAjustePosterior(empresaId: string, periodoAjuste: string, periodoAfectado: string, ajusteData: any) {
    const res = await apiClient.post(`/empresas/${empresaId}/sire/ajustes-posteriores`, {
      periodoAjuste,
      periodoAfectado,
      ajusteData
    });
    return res.data;
  },

  async validarTxt(contenidoTxt: string, tipoLayout: 'RCE_REEMPLAZO' | 'RVIE_REEMPLAZO' | 'RCE_AJUSTE' | 'RVIE_AJUSTE') {
    const res = await apiClient.post('/sire/validar-txt', { contenidoTxt, tipoLayout });
    return res.data;
  },

  async listarHistorial(empresaId: string, periodo?: string) {
    const q = periodo ? `?periodo=${periodo}` : '';
    const res = await apiClient.get(`/empresas/${empresaId}/sire/historial${q}`);
    return res.data || [];
  },

  async listarComprobantesXml(empresaId: string) {
    const res = await apiClient.get<any>(`/empresas/${empresaId}/comprobantes-xml`);
    return res.data || [];
  },

  async importarXml(empresaId: string, archivos: Array<{ nombre: string; contenidoBase64: string }>) {
    const res = await apiClient.post<any>(`/empresas/${empresaId}/comprobantes-xml/importar`, { archivos });
    return res.data;
  }
};

