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

export type CodigoAnexoSire =
  | 'RVIE_ANEXO_2'
  | 'RVIE_ANEXO_3'
  | 'RVIE_ANEXO_4'
  | 'RVIE_ANEXO_5'
  | 'RCE_ANEXO_8_CP'
  | 'RCE_ANEXO_8_INEX'
  | 'RCE_ANEXO_9'
  | 'RCE_ANEXO_10'
  | 'RCE_ANEXO_11'
  | 'RCE_ANEXO_12_1'
  | 'RCE_ANEXO_12_2'
  | 'RCE_ANEXO_13_1'
  | 'RCE_ANEXO_13_2';

export interface SireNoDomiciliado {
  id: string;
  empresaId: string;
  periodo: string;
  carSunat?: string;
  fechaEmision: string;
  tipoComprobante: string;
  serie?: string;
  numero: string;
  valorAdquisiciones: number;
  otrosConceptos: number;
  importeTotal: number;
  tipoDocSustentaCredito?: string;
  serieDocSustentaCredito?: string;
  anioDua?: string;
  numeroDocSustentaCredito?: string;
  retencionIgv: number;
  moneda: 'PEN' | 'USD';
  tipoCambio: number;
  paisResidencia: string;
  razonSocialNoDomiciliado: string;
  domicilioExtranjero?: string;
  numIdFiscal?: string;
  numIdBeneficiario?: string;
  razonSocialBeneficiario?: string;
  paisBeneficiario?: string;
  vinculoContribuyente: string;
  rentaBruta: number;
  deduccionCosto: number;
  rentaNeta: number;
  tasaRetencion: number;
  impuestoRetenido: number;
  convenioDobleImposicion: string;
  exoneracionAplicada?: string;
  tipoRenta: string;
  modalidadServicio?: string;
  aplicaArt76: boolean;
  carCpModificar?: string;
  estado: 'BORRADOR' | 'REGISTRADO' | 'ANULADO';
}

export interface SireAjusteAnexo {
  id: string;
  empresaId: string;
  periodoPresentacion: string;
  periodoAjustado: string;
  registro: 'RVIE' | 'RCE' | 'RCE_NO_DOMICILIADO';
  codigoAnexo: Exclude<CodigoAnexoSire, 'RVIE_ANEXO_3' | 'RCE_ANEXO_9' | 'RCE_ANEXO_11'>;
  tipoOperacion: 'INCLUSION' | 'EXCLUSION' | 'MODIFICACION' | 'TIPO_CAMBIO';
  oportunidad: '01' | '02' | '03' | '04' | '05';
  correlativo: string;
  carOriginal?: string;
  datosJson: Record<string, any>;
  estado: 'BORRADOR' | 'GENERADO' | 'ENVIADO';
  createdAt?: string;
}

export interface SireAnexoResumenItem {
  anexo: CodigoAnexoSire;
  registro: 'RVIE' | 'RCE' | 'RCE_NO_DOMICILIADO';
  libro: string;
  oportunidadPorDefecto: string;
  usaCorrelativoNN: boolean;
  esArchivoGuionado: boolean;
  totalCampos: number;
  titulo: string;
  norma: string;
  exigeCarOriginal: boolean;
  totalRegistros: number;
  nombreArchivoTxt: string;
  nombreArchivoZip: string;
}

export interface ResultadoPaqueteSire {
  anexo: CodigoAnexoSire;
  especificacion: SireAnexoResumenItem;
  nombreArchivoTxt: string;
  nombreArchivoZip: string;
  contenidoTxt: string;
  zipBase64: string;
  hashSha256: string;
  totalCampos: number;
  totalFilas: number;
  validacion: {
    esValido: boolean;
    totalFilas: number;
    totalErrores: number;
    errores: Array<{ linea: number; columna: number; nombreCampo: string; valor: string; mensaje: string }>;
  };
}

export function descargarArchivoZipBase64(nombreZip: string, zipBase64: string) {
  const bytes = atob(zipBase64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    arr[i] = bytes.charCodeAt(i);
  }
  const blob = new Blob([arr], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreZip;
  a.click();
  URL.revokeObjectURL(url);
}

export function descargarArchivoTxtUtf8(nombreTxt: string, contenidoTxt: string) {
  const blob = new Blob([contenidoTxt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreTxt;
  a.click();
  URL.revokeObjectURL(url);
}

export const sireApi = {
  async obtenerEstadoConexion(empresaId: string): Promise<SunatConexionEstado> {
    const res = await apiClient.get<SunatConexionEstado>(`/empresas/${empresaId}/sire/conexion/estado`);
    return res.data;
  },

  async guardarConexion(empresaId: string, datos: {
    ruc: string;
    usuarioSol: string;
    claveSol: string;
    clientId?: string;
    clientSecret?: string;
    modoSimulado: boolean;
  }): Promise<void> {
    await apiClient.put(`/empresas/${empresaId}/sire/conexion`, datos);
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

  async validarTxt(contenidoTxt: string, tipoLayout: CodigoAnexoSire | 'RCE_REEMPLAZO' | 'RVIE_REEMPLAZO' | 'RCE_AJUSTE' | 'RVIE_AJUSTE') {
    const res = await apiClient.post('/sire/validar-txt', { contenidoTxt, tipoLayout });
    return res.data;
  },

  async obtenerPropuestaPeriodo(empresaId: string, tipo: 'COMPRAS' | 'VENTAS', periodo: string) {
    const res = await apiClient.get<any>(`/empresas/${empresaId}/sire/propuesta?tipo=${tipo}&periodo=${periodo}`);
    return res.data;
  },

  async obtenerResumenAnexos(empresaId: string, periodo: string): Promise<{ empresa: { ruc: string; razonSocial: string }; periodo: string; anexos: SireAnexoResumenItem[] }> {
    const res = await apiClient.get<any>(`/empresas/${empresaId}/sire/anexos/resumen?periodo=${periodo}`);
    return res.data;
  },

  async generarPaqueteAnexo(
    empresaId: string,
    params: {
      anexo: CodigoAnexoSire;
      periodo: string;
      periodoAfectado?: string;
      oportunidad?: '01' | '02' | '03' | '04' | '05';
      correlativo?: string;
      sinMovimiento?: boolean;
      incluirComprasMeAuto?: boolean;
    }
  ): Promise<ResultadoPaqueteSire> {
    const res = await apiClient.post<ResultadoPaqueteSire>(`/empresas/${empresaId}/sire/anexos/generar`, params);
    return res.data;
  },

  async listarNoDomiciliados(empresaId: string, periodo?: string): Promise<SireNoDomiciliado[]> {
    const q = periodo ? `?periodo=${periodo}` : '';
    const res = await apiClient.get<SireNoDomiciliado[]>(`/empresas/${empresaId}/sire/no-domiciliados${q}`);
    return res.data || [];
  },

  async crearNoDomiciliado(empresaId: string, datos: Omit<SireNoDomiciliado, 'id' | 'empresaId'>): Promise<SireNoDomiciliado> {
    const res = await apiClient.post<SireNoDomiciliado>(`/empresas/${empresaId}/sire/no-domiciliados`, datos);
    return res.data;
  },

  async actualizarNoDomiciliado(empresaId: string, registroId: string, datos: Omit<SireNoDomiciliado, 'id' | 'empresaId'>): Promise<SireNoDomiciliado> {
    const res = await apiClient.put<SireNoDomiciliado>(`/empresas/${empresaId}/sire/no-domiciliados/${registroId}`, datos);
    return res.data;
  },

  async eliminarNoDomiciliado(empresaId: string, registroId: string): Promise<void> {
    await apiClient.delete(`/empresas/${empresaId}/sire/no-domiciliados/${registroId}`);
  },

  async listarAjustesAnexos(
    empresaId: string,
    filtros?: { periodo?: string; registro?: string; codigoAnexo?: string }
  ): Promise<SireAjusteAnexo[]> {
    const params = new URLSearchParams();
    if (filtros?.periodo) params.set('periodo', filtros.periodo);
    if (filtros?.registro) params.set('registro', filtros.registro);
    if (filtros?.codigoAnexo) params.set('codigoAnexo', filtros.codigoAnexo);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient.get<SireAjusteAnexo[]>(`/empresas/${empresaId}/sire/ajustes${qs}`);
    return res.data || [];
  },

  async crearAjusteAnexo(empresaId: string, datos: Omit<SireAjusteAnexo, 'id' | 'empresaId' | 'createdAt'>): Promise<SireAjusteAnexo> {
    const res = await apiClient.post<SireAjusteAnexo>(`/empresas/${empresaId}/sire/ajustes`, datos);
    return res.data;
  },

  async actualizarAjusteAnexo(empresaId: string, ajusteId: string, datos: Partial<SireAjusteAnexo>): Promise<SireAjusteAnexo> {
    const res = await apiClient.put<SireAjusteAnexo>(`/empresas/${empresaId}/sire/ajustes/${ajusteId}`, datos);
    return res.data;
  },

  async eliminarAjusteAnexo(empresaId: string, ajusteId: string): Promise<void> {
    await apiClient.delete(`/empresas/${empresaId}/sire/ajustes/${ajusteId}`);
  },

  async listarCandidatosTipoCambio(empresaId: string, periodo: string): Promise<{ comprasMe: any[]; guardados: any[] }> {
    const res = await apiClient.get<any>(`/empresas/${empresaId}/sire/tipo-cambio-candidatos?periodo=${periodo}`);
    return res.data || { comprasMe: [], guardados: [] };
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

