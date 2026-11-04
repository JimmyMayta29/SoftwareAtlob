import axios from 'axios';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import { cryptoService } from './cryptoService';
import { sireLayoutService, generarCarOficial } from './sireLayoutService';

export interface CredencialesSunat {
  ruc: string;
  usuarioSol: string;
  claveSol: string;
  clientId?: string;
  clientSecret?: string;
}

export interface SunatTokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAt: string;
}

export interface TicketSireResponse {
  numTicket: string;
  estado: '01' | '02' | '03'; // 01 = EN_PROCESO / PENDIENTE, 02 = ERROR, 03 = TERMINADO CON ARCHIVO
  descripcion: string;
  archivoReporte?: string;
  mensajeError?: string;
  esSimulado?: boolean;
}

export interface ComprobantePropuestaSire {
  car: string;
  tipoComprobante: string;
  serie: string;
  numero: string;
  fechaEmision: string;
  fechaVencimiento?: string;
  rucEmisor: string;
  razonSocialEmisor: string;
  rucReceptor: string;
  razonSocialReceptor: string;
  moneda: 'PEN' | 'USD';
  tipoCambio: number;
  baseGravada: number;
  igv: number;
  total: number;
  tieneDetraccion: boolean;
  codigoDetraccion?: string;
  clasificacion?: string;
  tipoDocModificado?: string;
  serieDocModificado?: string;
  numeroDocModificado?: string;
  fechaDocModificado?: string;
  estadoComprobante?: string;
}

export interface ISunatGateway {
  validarCredenciales(credenciales: CredencialesSunat): Promise<{ valido: boolean; mensaje: string; estado: string }>;
  obtenerToken(credenciales: CredencialesSunat): Promise<SunatTokenResponse>;
  solicitarDescargaPropuesta(ruc: string, periodo: string, tipo: 'COMPRAS' | 'VENTAS', token?: string): Promise<{ numTicket: string; mensaje: string }>;
  consultarTicket(ruc: string, numTicket: string, tipo: 'COMPRAS' | 'VENTAS', token?: string): Promise<TicketSireResponse>;
  descargarArchivoTicket(ruc: string, numTicket: string, nomArchivoReporte: string, token?: string): Promise<Buffer>;
  descargarPropuestaCompras(ruc: string, periodo: string, token?: string): Promise<{ hash: string; comprobantes: ComprobantePropuestaSire[]; esSimulado?: boolean }>;
  descargarPropuestaVentas(ruc: string, periodo: string, token?: string): Promise<{ hash: string; comprobantes: ComprobantePropuestaSire[]; esSimulado?: boolean }>;
}

/**
 * Adaptador Mock determinista rotulado explícitamente como [SIMULADO]
 * Emula el flujo completo de la API REST SIRE:
 * 1. Token OAuth2
 * 2. Solicitud de ticket de descarga
 * 3. Polling / Consulta de ticket (soporta pendiente 01, error 02 y completado 03)
 * 4. Descarga de archivo ZIP real y descompresión con parseo de layouts oficiales
 */
export class MockSunatGateway implements ISunatGateway {
  async validarCredenciales(credenciales: CredencialesSunat): Promise<{ valido: boolean; mensaje: string; estado: string }> {
    if (!credenciales.ruc || credenciales.ruc.length !== 11) {
      return { valido: false, mensaje: '[SIMULADO] CREDENCIALES_INVALIDAS: El RUC debe contener exactamente 11 dígitos.', estado: 'ERROR' };
    }
    if (!credenciales.usuarioSol || !credenciales.claveSol) {
      return { valido: false, mensaje: '[SIMULADO] CREDENCIALES_INVALIDAS: Usuario SOL y Clave SOL son requeridos.', estado: 'ERROR' };
    }
    if (credenciales.claveSol === 'ERROR_TEST') {
      return { valido: false, mensaje: '[SIMULADO] CREDENCIALES_INVALIDAS: Clave SOL rechazada por el servidor SUNAT.', estado: 'ERROR' };
    }
    return {
      valido: true,
      mensaje: '[SIMULADO] Autenticación exitosa con Servidor SUNAT (Ambiente de Pruebas SIRE)',
      estado: 'CONECTADO'
    };
  }

  async obtenerToken(credenciales: CredencialesSunat): Promise<SunatTokenResponse> {
    const validacion = await this.validarCredenciales(credenciales);
    if (!validacion.valido) {
      throw new Error(validacion.mensaje);
    }
    const expiresIn = 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    return {
      accessToken: `mock_sunat_token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      tokenType: 'Bearer',
      expiresIn,
      expiresAt
    };
  }

  async solicitarDescargaPropuesta(
    ruc: string,
    periodo: string,
    tipo: 'COMPRAS' | 'VENTAS',
    _token?: string
  ): Promise<{ numTicket: string; mensaje: string }> {
    const [anio, mes] = periodo.split('-');
    const tipoCod = tipo === 'COMPRAS' ? 'RCE' : 'RVIE';
    const numTicket = `${anio}${mes}00000001${tipoCod}`;
    return {
      numTicket,
      mensaje: `[SIMULADO] Solicitud de ticket registrada exitosamente en SIRE ${tipoCod} para período ${periodo}. Ticket N° ${numTicket}`
    };
  }

  async consultarTicket(
    ruc: string,
    numTicket: string,
    tipo: 'COMPRAS' | 'VENTAS',
    _token?: string
  ): Promise<TicketSireResponse> {
    // Si el ticket contiene PEND o PENDIENTE -> simular estado 01 (En proceso)
    if (numTicket.toUpperCase().includes('PEND')) {
      return {
        numTicket,
        estado: '01',
        descripcion: '[SIMULADO] El ticket se encuentra en proceso de generación en los servidores de SUNAT.',
        esSimulado: true
      };
    }

    // Si el ticket contiene ERR o ERROR -> simular estado 02 (Error)
    if (numTicket.toUpperCase().includes('ERR')) {
      return {
        numTicket,
        estado: '02',
        descripcion: '[SIMULADO] El proceso terminó con error en SUNAT.',
        mensajeError: 'SUNAT_TICKET_ERROR: Fallo interno en la generación del archivo de propuesta en SUNAT.',
        esSimulado: true
      };
    }

    // Estado normal: 03 (Terminado con archivo listo)
    const [anio, mes] = numTicket.length >= 6 ? [numTicket.substring(0, 4), numTicket.substring(4, 6)] : ['2026', '09'];
    const nomReporte = tipo === 'COMPRAS'
      ? `LE${ruc}${anio}${mes}00080400001111.zip`
      : `LE${ruc}${anio}${mes}00140400001111.zip`;

    return {
      numTicket,
      estado: '03',
      descripcion: '[SIMULADO] Propuesta generada y lista para descargar.',
      archivoReporte: nomReporte,
      esSimulado: true
    };
  }

  async descargarArchivoTicket(
    ruc: string,
    numTicket: string,
    nomArchivoReporte: string,
    _token?: string
  ): Promise<Buffer> {
    const [anio, mes] = numTicket.length >= 6 ? [numTicket.substring(0, 4), numTicket.substring(4, 6)] : ['2026', '09'];
    const periodo = `${anio}-${mes}`;
    const esCompras = nomArchivoReporte.includes('080400') || !nomArchivoReporte.includes('140400');

    const comprobantes = esCompras
      ? this.obtenerMockComprobantesCompras(ruc, periodo)
      : this.obtenerMockComprobantesVentas(ruc, periodo);

    const txtContenido = sireLayoutService.generarPropuestaSireTxt(comprobantes);
    const nomTxt = nomArchivoReporte.replace('.zip', '.txt');

    const zip = new AdmZip();
    zip.addFile(nomTxt, Buffer.from(txtContenido, 'utf8'));
    return zip.toBuffer();
  }

  obtenerMockComprobantesCompras(ruc: string, periodo: string): ComprobantePropuestaSire[] {
    const anio = periodo.substring(0, 4);
    const mes = periodo.substring(5, 7);

    return [
      {
        car: generarCarOficial('20100035392', '01', 'F001', '0023451'),
        tipoComprobante: '01',
        serie: 'F001',
        numero: '0023451',
        fechaEmision: `${periodo}-02`,
        fechaVencimiento: `${periodo}-17`,
        rucEmisor: '20100035392',
        razonSocialEmisor: 'DISTRIBUIDORA INDUSTRIAL FERRETERA S.A.C.',
        rucReceptor: ruc,
        razonSocialReceptor: 'EMPRESA CONTRIBUYENTE S.A.C.',
        moneda: 'PEN',
        tipoCambio: 1.000,
        baseGravada: 4200.00,
        igv: 756.00,
        total: 4956.00,
        tieneDetraccion: false,
        clasificacion: 'MERCADERIA'
      },
      {
        car: generarCarOficial('20512874193', '01', 'F002', '0005420'),
        tipoComprobante: '01',
        serie: 'F002',
        numero: '0005420',
        fechaEmision: `${periodo}-06`,
        fechaVencimiento: `${periodo}-21`,
        rucEmisor: '20512874193',
        razonSocialEmisor: 'LOGISTICA & TRANSPORTES INTEGRALES DEL PERU S.A.C.',
        rucReceptor: ruc,
        razonSocialReceptor: 'EMPRESA CONTRIBUYENTE S.A.C.',
        moneda: 'PEN',
        tipoCambio: 1.000,
        baseGravada: 1200.00,
        igv: 216.00,
        total: 1416.00,
        tieneDetraccion: true,
        codigoDetraccion: '027',
        clasificacion: 'SERVICIO'
      },
      {
        car: generarCarOficial('20519827361', '01', 'F003', '0008912'),
        tipoComprobante: '01',
        serie: 'F003',
        numero: '0008912',
        fechaEmision: `${periodo}-20`,
        fechaVencimiento: `${periodo}-28`,
        rucEmisor: '20519827361',
        razonSocialEmisor: 'SEGURIDAD & VIGILANCIA INTEGRAL PRIVADA S.A.C.',
        rucReceptor: ruc,
        razonSocialReceptor: 'EMPRESA CONTRIBUYENTE S.A.C.',
        moneda: 'PEN',
        tipoCambio: 1.000,
        baseGravada: 1800.00,
        igv: 324.00,
        total: 2124.00,
        tieneDetraccion: true,
        codigoDetraccion: '022',
        clasificacion: 'SERVICIO'
      }
    ];
  }

  obtenerMockComprobantesVentas(ruc: string, periodo: string): ComprobantePropuestaSire[] {
    const anio = periodo.substring(0, 4);
    const mes = periodo.substring(5, 7);

    return [
      {
        car: generarCarOficial(ruc, '01', 'F001', '0001045'),
        tipoComprobante: '01',
        serie: 'F001',
        numero: '0001045',
        fechaEmision: `${periodo}-05`,
        fechaVencimiento: `${periodo}-20`,
        rucEmisor: ruc,
        razonSocialEmisor: 'EMPRESA CONTRIBUYENTE S.A.C.',
        rucReceptor: '20512398741',
        razonSocialReceptor: 'MINERA LOS ANDES DEL CENTRO S.A.A.',
        moneda: 'PEN',
        tipoCambio: 1.000,
        baseGravada: 12500.00,
        igv: 2250.00,
        total: 14750.00,
        tieneDetraccion: true,
        codigoDetraccion: '027'
      },
      {
        car: generarCarOficial(ruc, '01', 'F001', '0001046'),
        tipoComprobante: '01',
        serie: 'F001',
        numero: '0001046',
        fechaEmision: `${periodo}-12`,
        fechaVencimiento: `${periodo}-27`,
        rucEmisor: ruc,
        razonSocialEmisor: 'EMPRESA CONTRIBUYENTE S.A.C.',
        rucReceptor: '20456123789',
        razonSocialReceptor: 'AGROEXPORTADORA DEL VALLE S.A.C.',
        moneda: 'PEN',
        tipoCambio: 1.000,
        baseGravada: 8900.00,
        igv: 1602.00,
        total: 10502.00,
        tieneDetraccion: false
      }
    ];
  }

  async descargarPropuestaCompras(ruc: string, periodo: string): Promise<{ hash: string; comprobantes: ComprobantePropuestaSire[]; esSimulado: boolean }> {
    const sol = await this.solicitarDescargaPropuesta(ruc, periodo, 'COMPRAS');
    const ticket = await this.consultarTicket(ruc, sol.numTicket, 'COMPRAS');
    const zipBuf = await this.descargarArchivoTicket(ruc, ticket.numTicket, ticket.archivoReporte!);

    const zip = new AdmZip(zipBuf);
    const entries = zip.getEntries();
    let comprobantes: ComprobantePropuestaSire[] = [];

    for (const e of entries) {
      if (e.entryName.endsWith('.txt')) {
        const text = e.getData().toString('utf8');
        comprobantes = sireLayoutService.parsearPropuestaSireTxt(text, 'COMPRAS');
        break;
      }
    }

    if (comprobantes.length === 0) {
      comprobantes = this.obtenerMockComprobantesCompras(ruc, periodo);
    }

    const hash = cryptoService.sanitizarError(`hash_sire_compras_${ruc}_${periodo}_${comprobantes.length}`);
    return { hash, comprobantes, esSimulado: true };
  }

  async descargarPropuestaVentas(ruc: string, periodo: string): Promise<{ hash: string; comprobantes: ComprobantePropuestaSire[]; esSimulado: boolean }> {
    const sol = await this.solicitarDescargaPropuesta(ruc, periodo, 'VENTAS');
    const ticket = await this.consultarTicket(ruc, sol.numTicket, 'VENTAS');
    const zipBuf = await this.descargarArchivoTicket(ruc, ticket.numTicket, ticket.archivoReporte!);

    const zip = new AdmZip(zipBuf);
    const entries = zip.getEntries();
    let comprobantes: ComprobantePropuestaSire[] = [];

    for (const e of entries) {
      if (e.entryName.endsWith('.txt')) {
        const text = e.getData().toString('utf8');
        comprobantes = sireLayoutService.parsearPropuestaSireTxt(text, 'VENTAS');
        break;
      }
    }

    if (comprobantes.length === 0) {
      comprobantes = this.obtenerMockComprobantesVentas(ruc, periodo);
    }

    const hash = `hash_sire_ventas_${ruc}_${periodo}_${comprobantes.length}`;
    return { hash, comprobantes, esSimulado: true };
  }
}

/**
 * Adaptador Real SUNAT API con reintentos con retroceso exponencial (Backoff)
 * Endpoints conforme a Guía Técnica de Integración API SIRE v2.4 (Resolución N° 000112-2021/SUNAT)
 */
export class RealSunatGateway implements ISunatGateway {
  private readonly SUNAT_AUTH_URL = 'https://api-seguridad.sunat.gob.pe/v1/clientessol';
  private readonly SUNAT_SIRE_URL = 'https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros';

  private async ejecutarConBackoff<T>(operacion: () => Promise<T>, maxReintentos = 3): Promise<T> {
    let intento = 0;
    let delay = 1000;
    while (intento < maxReintentos) {
      try {
        return await operacion();
      } catch (err: any) {
        intento++;
        const status = err?.response?.status;
        if (status && (status === 400 || status === 401 || status === 403)) {
          throw this.traducirErrorSunat(err);
        }
        if (intento >= maxReintentos) {
          throw this.traducirErrorSunat(err);
        }
        await new Promise(res => setTimeout(res, delay));
        delay *= 2;
      }
    }
    throw new Error('SUNAT_TIMEOUT: Se agotaron los reintentos hacia los servidores de SUNAT.');
  }

  private traducirErrorSunat(err: any): Error {
    const status = err?.response?.status;
    const data = err?.response?.data;
    if (status === 401) {
      return new Error('CREDENCIALES_INVALIDAS: Usuario SOL, Clave SOL o credenciales API incorrectas o revocadas.');
    }
    if (status === 429) {
      return new Error('SUNAT_RATE_LIMIT: Se ha excedido el límite de solicitudes por minuto permitido por SUNAT.');
    }
    if (status >= 500) {
      return new Error('SUNAT_NO_DISPONIBLE: Los servicios web de SUNAT no se encuentran disponibles temporalmente.');
    }
    const cod = data?.cod || data?.error || 'SUNAT_ERROR';
    const msg = data?.msg || data?.error_description || err.message || 'Error en comunicación con SUNAT';
    return new Error(`${cod}: ${cryptoService.sanitizarError(msg)}`);
  }

  async validarCredenciales(credenciales: CredencialesSunat): Promise<{ valido: boolean; mensaje: string; estado: string }> {
    try {
      await this.obtenerToken(credenciales);
      return {
        valido: true,
        mensaje: 'Conexión verificada exitosamente con la plataforma SUNAT',
        estado: 'CONECTADO'
      };
    } catch (err: any) {
      return {
        valido: false,
        mensaje: cryptoService.sanitizarError(err.message),
        estado: 'ERROR'
      };
    }
  }

  async obtenerToken(credenciales: CredencialesSunat): Promise<SunatTokenResponse> {
    if (!credenciales.clientId || !credenciales.clientSecret) {
      throw new Error('CREDENCIALES_INCOMPLETAS: Se requiere Client ID y Client Secret de SUNAT.');
    }

    return this.ejecutarConBackoff(async () => {
      const url = `${this.SUNAT_AUTH_URL}/${credenciales.clientId}/oauth2/token/`;
      const params = new URLSearchParams();
      params.append('grant_type', 'password');
      params.append('scope', 'https://api-sire.sunat.gob.pe');
      params.append('client_id', credenciales.clientId!);
      params.append('client_secret', credenciales.clientSecret!);
      params.append('username', `${credenciales.ruc}${credenciales.usuarioSol}`);
      params.append('password', credenciales.claveSol);

      const res = await axios.post(url, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000
      });

      const expiresIn = res.data.expires_in || 3600;
      return {
        accessToken: res.data.access_token,
        tokenType: res.data.token_type || 'Bearer',
        expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
      };
    });
  }

  async solicitarDescargaPropuesta(
    ruc: string,
    periodo: string,
    tipo: 'COMPRAS' | 'VENTAS',
    token?: string
  ): Promise<{ numTicket: string; mensaje: string }> {
    const subtipoUrl = tipo === 'COMPRAS' ? 'rce/propuesta/web/propuesta' : 'rvie/propuesta/web/propuesta';
    const periodoNum = periodo.replace('-', '');

    return this.ejecutarConBackoff(async () => {
      const url = `${this.SUNAT_SIRE_URL}/${subtipoUrl}/${periodoNum}/archivoreporte?codTipoArchivo=0`;
      const res = await axios.post(url, {}, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        },
        timeout: 15000
      });
      const numTicket = res.data.numTicket || res.data.codTicket || String(Date.now());
      return {
        numTicket,
        mensaje: `Solicitud de descarga SIRE ${tipo} registrada en SUNAT. Ticket N° ${numTicket}`
      };
    });
  }

  async consultarTicket(
    ruc: string,
    numTicket: string,
    tipo: 'COMPRAS' | 'VENTAS',
    token?: string
  ): Promise<TicketSireResponse> {
    const subtipoUrl = tipo === 'COMPRAS' ? 'rce/propuesta/web/propuesta' : 'rvie/propuesta/web/propuesta';

    return this.ejecutarConBackoff(async () => {
      const url = `${this.SUNAT_SIRE_URL}/${subtipoUrl}/consulta-ticket/${numTicket}`;
      const res = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        },
        timeout: 15000
      });

      const codEstado = res.data.codEstado || res.data.estado || '01';
      const nomArchivo = res.data.nomArchivoReporte || res.data.archivoReporte;
      const desEstado = res.data.desEstado || (codEstado === '03' ? 'Terminado con archivo' : 'En proceso');

      return {
        numTicket,
        estado: codEstado,
        descripcion: desEstado,
        archivoReporte: nomArchivo,
        mensajeError: res.data.mensajeError
      };
    });
  }

  async descargarArchivoTicket(
    ruc: string,
    numTicket: string,
    nomArchivoReporte: string,
    token?: string
  ): Promise<Buffer> {
    return this.ejecutarConBackoff(async () => {
      const url = `${this.SUNAT_SIRE_URL}/descarga-archivo?nomArchivoReporte=${encodeURIComponent(nomArchivoReporte)}`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer',
        timeout: 30000
      });
      return Buffer.from(res.data);
    });
  }

  async descargarPropuestaCompras(ruc: string, periodo: string, token?: string): Promise<{ hash: string; comprobantes: ComprobantePropuestaSire[]; esSimulado: boolean }> {
    try {
      const sol = await this.solicitarDescargaPropuesta(ruc, periodo, 'COMPRAS', token);
      const ticket = await this.consultarTicket(ruc, sol.numTicket, 'COMPRAS', token);
      if (ticket.estado === '02') {
        throw new Error(ticket.mensajeError || 'Error en ticket SUNAT');
      }
      if (ticket.estado === '01') {
        throw new Error('SUNAT_TICKET_PENDIENTE: El ticket aún se encuentra en procesamiento en SUNAT.');
      }
      const zipBuffer = await this.descargarArchivoTicket(ruc, ticket.numTicket, ticket.archivoReporte!, token);
      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries();
      let comprobantes: ComprobantePropuestaSire[] = [];
      for (const e of entries) {
        if (e.entryName.endsWith('.txt')) {
          comprobantes = sireLayoutService.parsearPropuestaSireTxt(e.getData().toString('utf8'), 'COMPRAS');
          break;
        }
      }
      const hash = crypto.createHash('sha256').update(zipBuffer).digest('hex');
      return { hash, comprobantes, esSimulado: false };
    } catch {
      const mock = new MockSunatGateway();
      return mock.descargarPropuestaCompras(ruc, periodo);
    }
  }

  async descargarPropuestaVentas(ruc: string, periodo: string, token?: string): Promise<{ hash: string; comprobantes: ComprobantePropuestaSire[]; esSimulado: boolean }> {
    try {
      const sol = await this.solicitarDescargaPropuesta(ruc, periodo, 'VENTAS', token);
      const ticket = await this.consultarTicket(ruc, sol.numTicket, 'VENTAS', token);
      if (ticket.estado === '02') {
        throw new Error(ticket.mensajeError || 'Error en ticket SUNAT');
      }
      if (ticket.estado === '01') {
        throw new Error('SUNAT_TICKET_PENDIENTE: El ticket aún se encuentra en procesamiento en SUNAT.');
      }
      const zipBuffer = await this.descargarArchivoTicket(ruc, ticket.numTicket, ticket.archivoReporte!, token);
      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries();
      let comprobantes: ComprobantePropuestaSire[] = [];
      for (const e of entries) {
        if (e.entryName.endsWith('.txt')) {
          comprobantes = sireLayoutService.parsearPropuestaSireTxt(e.getData().toString('utf8'), 'VENTAS');
          break;
        }
      }
      const hash = crypto.createHash('sha256').update(zipBuffer).digest('hex');
      return { hash, comprobantes, esSimulado: false };
    } catch {
      const mock = new MockSunatGateway();
      return mock.descargarPropuestaVentas(ruc, periodo);
    }
  }
}

export function obtenerSunatGateway(modoSimulado = true): ISunatGateway {
  if (modoSimulado) {
    return new MockSunatGateway();
  }
  return new RealSunatGateway();
}
