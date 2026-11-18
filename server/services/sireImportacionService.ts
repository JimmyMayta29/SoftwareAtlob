import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { db } from '../config/database';
import { Money } from '../utils/decimal';
import { pcgeService, CuentaPCGEItem } from './pcgeService';
import { anexoService } from './anexoService';
import { compraService } from './compraService';
import { ventaService } from './ventaService';
import { periodoService } from './periodoService';
import { auditoriaRepository } from '../repositories/auditoriaRepository';

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
  // Campos específicos
  clasificacionBssSss?: string;
  detraccion?: boolean;
  tipoOperacion?: string;
  estadoComprobanteSunat?: string;
  // Referencia a doc modificado (NC/ND)
  esNotaAjuste: boolean;
  docModificadoTipo?: string;
  docModificadoSerie?: string;
  docModificadoNumero?: string;
  docModificadoFecha?: string;
  docModificadoExiste?: boolean;
  docModificadoId?: string;
  // Propuesta contable verificada contra PCGE
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
  // Estado de análisis
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
    clasif1_mercaderias: string; // Ej: 6011
    clasif2_activoFijo: string;   // Ej: 33
    clasif3_otrosActivos: string;
    clasif4_servicios: string;    // Ej: 63
    clasif5_otrosGastos: string;  // Ej: 65
    igvCreditoFiscal: string;     // Ej: 40111
    proveedorRuc: string;         // Ej: 4212
    proveedorDni: string;         // Ej: 4212
    cuentaDetraccion: string;     // Ej: 422
  };
  ventas: {
    operacion0101_interna: string; // Ej: 70121
    operacion0200_exportacion: string; // Ej: 70111
    operacion0102_anticipos: string; // Ej: 122
    operacion0112_gratuita: string; // Ej: 70121
    igvDebitoFiscal: string;      // Ej: 40111
    clienteRuc: string;           // Ej: 1212
    clienteDni: string;           // Ej: 1212
  };
}

// Almacén en memoria de reglas por empresa
const REGLAS_MAPEO_POR_EMPRESA = new Map<string, ReglasMapeoSire>();

// Registro de CAR importados para evitar duplicados en memoria y pruebas
export const CAR_IMPORTADOS_MEMORIA = new Set<string>();

function obtenerReglasMapeoDefault(): ReglasMapeoSire {
  return {
    compras: {
      clasif1_mercaderias: '6011',
      clasif2_activoFijo: '33011',
      clasif3_otrosActivos: '34',
      clasif4_servicios: '63111',
      clasif5_otrosGastos: '65',
      igvCreditoFiscal: '40111',
      proveedorRuc: '4212',
      proveedorDni: '4212',
      cuentaDetraccion: '422',
    },
    ventas: {
      operacion0101_interna: '70121',
      operacion0200_exportacion: '70111',
      operacion0102_anticipos: '122',
      operacion0112_gratuita: '70121',
      igvDebitoFiscal: '40111',
      clienteRuc: '1212',
      clienteDni: '1212',
    }
  };
}

function parseFechaSire(fechaStr?: string): { fecha: string; fechaIso: string } {
  if (!fechaStr) return { fecha: '', fechaIso: '' };
  const raw = fechaStr.trim();
  const partes = raw.split('/');
  if (partes.length === 3) {
    const d = partes[0].padStart(2, '0');
    const m = partes[1].padStart(2, '0');
    const y = partes[2].length === 2 ? `20${partes[2]}` : partes[2];
    return {
      fecha: `${d}/${m}/${y}`,
      fechaIso: `${y}-${m}-${d}`
    };
  }
  return { fecha: raw, fechaIso: raw };
}

function obtenerNombreTipoComprobante(tipo: string): string {
  switch (tipo) {
    case '01': return 'Factura';
    case '03': return 'Boleta de Venta';
    case '07': return 'Nota de Crédito';
    case '08': return 'Nota de Débito';
    case '14': return 'Servicios Públicos';
    default: return `Comprobante (${tipo})`;
  }
}

export const sireImportacionService = {
  /**
   * Obtiene las reglas de mapeo configuradas para la empresa
   */
  obtenerReglasMapeo(empresaId: string): ReglasMapeoSire {
    return REGLAS_MAPEO_POR_EMPRESA.get(empresaId) || obtenerReglasMapeoDefault();
  },

  /**
   * Actualiza las reglas de mapeo de la empresa
   */
  guardarReglasMapeo(empresaId: string, reglas: Partial<ReglasMapeoSire>): ReglasMapeoSire {
    const actual = this.obtenerReglasMapeo(empresaId);
    const fusionado: ReglasMapeoSire = {
      compras: { ...actual.compras, ...(reglas.compras || {}) },
      ventas: { ...actual.ventas, ...(reglas.ventas || {}) }
    };
    REGLAS_MAPEO_POR_EMPRESA.set(empresaId, fusionado);
    return fusionado;
  },

  /**
   * Descomprime un buffer ZIP en memoria y extrae el archivo .txt único
   */
  extraerTxtDeZip(zipBuffer: Buffer): { nombreTxt: string; contenidoTxt: string } {
    let zip: AdmZip;
    try {
      zip = new AdmZip(zipBuffer);
    } catch {
      throw new Error('ARCHIVO_ZIP_INVALIDO: El archivo cargado no es un archivo ZIP válido o se encuentra dañado.');
    }

    const entries = zip.getEntries().filter(e => !e.isDirectory && !e.entryName.startsWith('__MACOSX'));
    const txtEntries = entries.filter(e => e.entryName.toLowerCase().endsWith('.txt'));

    if (txtEntries.length === 0) {
      throw new Error('ZIP_SIN_TXT: El archivo ZIP no contiene ningún archivo de texto (.txt) de propuesta SIRE.');
    }
    if (txtEntries.length > 1) {
      throw new Error(`ZIP_MULTIPLES_TXT: El archivo ZIP contiene ${txtEntries.length} archivos .txt. Debe contener exactamente uno.`);
    }

    const txtEntry = txtEntries[0];
    let rawText = zip.readAsText(txtEntry, 'utf8');

    // Remover UTF-8 BOM si existe
    if (rawText.charCodeAt(0) === 0xFEFF) {
      rawText = rawText.slice(1);
    }

    return {
      nombreTxt: txtEntry.entryName,
      contenidoTxt: rawText
    };
  },

  /**
   * Valida la estructura de columnas y previene cargar archivos invertidos (Ventas en Compras o viceversa)
   */
  validarCabeceras(headers: string[], tipoEsperado: 'COMPRAS' | 'VENTAS'): Map<string, number> {
    const mapa = new Map<string, number>();
    headers.forEach((h, idx) => {
      // Normalizar: remover espacios múltiples, acentos y convertir a minúsculas
      const normalizado = h.trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ');
      mapa.set(normalizado, idx);
    });

    const tieneHeader = (palabrasClave: string[]): boolean => {
      for (const [nom] of mapa.entries()) {
        if (palabrasClave.every(p => nom.includes(p))) return true;
      }
      return false;
    };

    // Comprobación de archivo invertido
    const esArchivoVentas = tieneHeader(['facturado', 'exportacion']) || tieneHeader(['bi gravada']) && !tieneHeader(['dg']);
    const esArchivoCompras = tieneHeader(['bi gravado dg']) || tieneHeader(['clasif', 'bss']);

    if (tipoEsperado === 'COMPRAS' && esArchivoVentas && !esArchivoCompras) {
      throw new Error('TIPO_ARCHIVO_INCORRECTO: El archivo cargado corresponde al Registro de Ventas (RVIE - Exp2), pero se encuentra en el módulo de Compras.');
    }
    if (tipoEsperado === 'VENTAS' && esArchivoCompras && !esArchivoVentas) {
      throw new Error('TIPO_ARCHIVO_INCORRECTO: El archivo cargado corresponde al Registro de Compras (RCE - Propuesta), pero se encuentra en el módulo de Ventas.');
    }

    // Comprobación de columnas mínimas obligatorias
    const requeridas = ['ruc', 'car sunat', 'fecha de emision', 'tipo cp/doc', 'serie del cdp'];
    for (const req of requeridas) {
      if (!tieneHeader([req])) {
        throw new Error(`COLUMNA_FALTANTE: No se encontró la columna requerida "${req}" en el archivo SIRE.`);
      }
    }

    return mapa;
  },

  /**
   * Analiza un archivo ZIP de SIRE (RCE Compras o RVIE Ventas), detecta cuentas de PCGE real,
   * valida duplicados, cuadre aritmético y genera la vista previa
   */
  async analizarArchivoZip(
    empresaId: string,
    tipo: 'COMPRAS' | 'VENTAS',
    periodoParam: string,
    archivoBuffer: Buffer,
    nombreArchivo: string
  ): Promise<ResultadoAnalisisSire> {
    const { nombreTxt, contenidoTxt } = this.extraerTxtDeZip(archivoBuffer);
    const lineas = contenidoTxt.split(/\r?\n/).filter(l => l.trim().length > 0);

    if (lineas.length < 2) {
      throw new Error('ARCHIVO_VACIO: El archivo de texto no contiene filas de comprobantes (solo encabezado o vacío).');
    }

    const headerLine = lineas[0];
    const headers = headerLine.split('|');
    this.validarCabeceras(headers, tipo);

    // Helper para buscar índice de columna por variantes de nombre
    const buscarColumna = (...patrones: RegExp[]): number => {
      for (const pat of patrones) {
        const idx = headers.findIndex(h => pat.test(h.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    // Índices de columnas dinámicos según tipo
    const idxRucEmisor = buscarColumna(/^ruc$/i);
    const idxRazonEmisor = buscarColumna(/razon\s*social/i, /apellidos.*razon/i);
    const idxPeriodo = buscarColumna(/^periodo$/i);
    const idxCar = buscarColumna(/car\s*sunat/i, /^car$/i);
    const idxFechaEmision = buscarColumna(/fecha.*emision/i);
    const idxFechaVcto = buscarColumna(/fecha.*vcto/i, /fecha.*pago/i);
    const idxTipoDoc = buscarColumna(/tipo\s*cp/i, /tipo\s*doc/i);
    const idxSerie = buscarColumna(/serie\s*del\s*cdp/i, /^serie$/i);
    const idxNumero = buscarColumna(/nro\s*cp/i, /nro\s*inicial/i, /^numero$/i);
    const idxTipoDocId = buscarColumna(/tipo\s*doc\s*identidad/i);
    const idxNumDocId = buscarColumna(/nro\s*doc\s*identidad/i, /num.*doc.*identidad/i);
    const idxRazonTercero = buscarColumna(/apellidos\s*nombres.*razon/i, /razon.*social/i);
    const idxMoneda = buscarColumna(/^moneda$/i);
    const idxTc = buscarColumna(/tipo.*cambio/i);
    const idxEstComp = buscarColumna(/est\.\s*comp/i);

    // Columnas de importes Compras
    const idxBiGravadoDg = buscarColumna(/bi\s*gravado\s*dg$/i, /bi\s*gravad.*dg/i);
    const idxIgvDg = buscarColumna(/igv.*ipm\s*dg$/i, /igv.*dg/i);
    const idxBiGravadoDgng = buscarColumna(/bi\s*gravado\s*dgng/i);
    const idxIgvDgng = buscarColumna(/igv.*ipm\s*dgng/i);
    const idxBiGravadoDng = buscarColumna(/bi\s*gravado\s*dng/i);
    const idxIgvDng = buscarColumna(/igv.*ipm\s*dng/i);
    const idxValorAdqNg = buscarColumna(/valor\s*adq\.\s*ng/i, /adq.*no\s*gravada/i);
    const idxIsc = buscarColumna(/^isc$/i);
    const idxIcbper = buscarColumna(/^icbper$/i);
    const idxOtrosTrib = buscarColumna(/otros\s*trib/i);
    const idxTotal = buscarColumna(/total\s*cp/i, /^total$/i);
    const idxClasifBssSss = buscarColumna(/clasif.*bss/i);
    const idxDetraccion = buscarColumna(/^detraccion$/i);

    // Columnas de importes Ventas
    const idxExp = buscarColumna(/exportacion/i);
    const idxBiGravadaVentas = buscarColumna(/bi\s*gravada$/i);
    const idxDsctoBi = buscarColumna(/dscto\s*bi/i);
    const idxIgvVentas = buscarColumna(/igv\s*\/\s*ipm$/i, /^igv$/i);
    const idxDsctoIgv = buscarColumna(/dscto\s*igv/i);
    const idxExonerado = buscarColumna(/exonerado/i);
    const idxInafecto = buscarColumna(/inafecto/i);
    const idxTipoOperacion = buscarColumna(/tipo\s*operacion/i);

    // Columnas de Documento Modificado (NC/ND)
    const idxDocModFecha = buscarColumna(/fecha.*doc.*modificado/i);
    const idxDocModTipo = buscarColumna(/tipo\s*cp\s*modificado/i);
    const idxDocModSerie = buscarColumna(/serie\s*cp\s*modificado/i);
    const idxDocModNumero = buscarColumna(/nro\s*cp\s*modificado/i);

    // Cargar Catálogo PCGE real de la empresa
    const mapaCuentas = await pcgeService.obtenerMapaCuentasEmpresa(empresaId);
    const reglasMapeo = this.obtenerReglasMapeo(empresaId);

    // Cargar Anexos existentes de la empresa
    const anexosEmpresa = await anexoService.listar(empresaId);
    const mapaAnexosPorDoc = new Map<string, any>();
    anexosEmpresa.forEach(a => mapaAnexosPorDoc.set(a.numeroDocumento, a));

    // Cargar Comprobantes ya existentes en la empresa para detectar duplicados y documentos modificados
    let comprobantesExistentes: any[] = [];
    if (tipo === 'COMPRAS') {
      const resCompras = await compraService.listar(empresaId, { limit: 10000 });
      comprobantesExistentes = resCompras?.items || [];
    } else {
      const resVentas = await ventaService.listar(empresaId, { limit: 10000 });
      comprobantesExistentes = resVentas?.items || [];
    }

    const mapaComprobantesExistentes = new Map<string, any>();
    for (const comp of comprobantesExistentes) {
      // Clave: tipo-serie-numero
      const k = `${comp.tipoComprobante}-${comp.serie.toUpperCase()}-${comp.numero}`;
      mapaComprobantesExistentes.set(k, comp);
      if ((comp as any).car) {
        mapaComprobantesExistentes.set(`CAR-${(comp as any).car}`, comp);
      }
    }

    // Metadatos generales detectados del archivo
    let rucEmisorDetectado = '';
    let razonSocialEmisorDetectada = '';
    let periodoDetectado = '';

    const filasAnalizadas: FilaSireAnalizada[] = [];

    // Helper para verificar si una cuenta existe en el plan de cuentas real y es imputable
    const verificarCuentaEnPlan = (codigoCandidato: string): CuentaPCGEItem | null => {
      if (!codigoCandidato) return null;
      const cta = mapaCuentas.get(codigoCandidato);
      if (cta && cta.permiteMovimiento !== false) {
        return cta;
      }
      return null;
    };

    // Procesar cada fila de datos (a partir de la línea 1)
    for (let i = 1; i < lineas.length; i++) {
      const linea = lineas[i];
      const cols = linea.split('|');
      if (cols.length < 5) continue;

      const rucEmisor = cols[idxRucEmisor]?.trim() || '';
      const razonEmisor = cols[idxRazonEmisor]?.trim() || '';
      const periodoFila = cols[idxPeriodo]?.trim() || periodoParam;
      const car = cols[idxCar]?.trim() || '';
      const fechaEmisionRaw = cols[idxFechaEmision]?.trim() || '';
      const { fecha: fechaEmision, fechaIso: fechaEmisionIso } = parseFechaSire(fechaEmisionRaw);
      const fechaVctoRaw = cols[idxFechaVcto]?.trim() || '';
      const { fecha: fechaVcto, fechaIso: fechaVctoIso } = parseFechaSire(fechaVctoRaw);
      const tipoComprobante = (cols[idxTipoDoc]?.trim() || '01').padStart(2, '0');
      const serie = (cols[idxSerie]?.trim() || '').toUpperCase();
      const numero = cols[idxNumero]?.trim() || '';
      const tipoDocId = cols[idxTipoDocId]?.trim() || (cols[idxNumDocId]?.trim().length === 11 ? '6' : '1');
      const numDocId = cols[idxNumDocId]?.trim() || '';
      const razonTercero = cols[idxRazonTercero]?.trim() || '';
      const moneda = (cols[idxMoneda]?.trim() === 'USD' ? 'USD' : 'PEN') as 'PEN' | 'USD';
      const tc = parseFloat(cols[idxTc]?.trim() || '1') || 1.0;
      const estComp = cols[idxEstComp]?.trim() || '1';

      if (!rucEmisorDetectado && rucEmisor) rucEmisorDetectado = rucEmisor;
      if (!razonSocialEmisorDetectada && razonEmisor) razonSocialEmisorDetectada = razonEmisor;
      if (!periodoDetectado && periodoFila) periodoDetectado = periodoFila;

      const advertencias: string[] = [];
      let estadoValidacion: FilaSireAnalizada['estadoValidacion'] = 'PENDIENTE';

      // Importes Compras
      let baseImponible = 0;
      let baseNoGravada = 0;
      let igv = 0;
      let otrosTributos = 0;
      let total = 0;
      let clasifBssSss = '';
      let tieneDetraccion = false;
      let tipoOperacion = '';

      if (tipo === 'COMPRAS') {
        const biDg = parseFloat(cols[idxBiGravadoDg]?.trim() || '0') || 0;
        const igvDg = parseFloat(cols[idxIgvDg]?.trim() || '0') || 0;
        const biDgng = parseFloat(cols[idxBiGravadoDgng]?.trim() || '0') || 0;
        const igvDgng = parseFloat(cols[idxIgvDgng]?.trim() || '0') || 0;
        const biDng = parseFloat(cols[idxBiGravadoDng]?.trim() || '0') || 0;
        const igvDng = parseFloat(cols[idxIgvDng]?.trim() || '0') || 0;
        const adqNg = parseFloat(cols[idxValorAdqNg]?.trim() || '0') || 0;
        const isc = parseFloat(cols[idxIsc]?.trim() || '0') || 0;
        const icbper = parseFloat(cols[idxIcbper]?.trim() || '0') || 0;
        const otros = parseFloat(cols[idxOtrosTrib]?.trim() || '0') || 0;
        const tot = parseFloat(cols[idxTotal]?.trim() || '0') || 0;

        baseImponible = Number((biDg + biDgng + biDng).toFixed(2));
        baseNoGravada = Number(adqNg.toFixed(2));
        igv = Number((igvDg + igvDgng + igvDng).toFixed(2));
        otrosTributos = Number((isc + icbper + otros).toFixed(2));
        total = Number(tot.toFixed(2));

        clasifBssSss = cols[idxClasifBssSss]?.trim() || '';
        tieneDetraccion = cols[idxDetraccion]?.trim() === '1' || cols[idxDetraccion]?.trim().toUpperCase() === 'S';

        // Cuadre aritmético con tolerancia de 0.05
        const sumaCalculada = Money.create(baseImponible)
          .plus(baseNoGravada)
          .plus(igv)
          .plus(otrosTributos);
        const difAritmetica = Money.create(total).minus(sumaCalculada).abs();
        if (difAritmetica.greaterThan(0.05)) {
          advertencias.push(`Diferencia aritmética de S/ ${difAritmetica.toFixed(2)} entre componentes (S/ ${sumaCalculada.toFixed(2)}) y total (S/ ${total.toFixed(2)}).`);
          estadoValidacion = 'CON_ADVERTENCIA';
        }
      } else {
        // Ventas
        const exp = parseFloat(cols[idxExp]?.trim() || '0') || 0;
        const bi = parseFloat(cols[idxBiGravadaVentas]?.trim() || '0') || 0;
        const dsctoBi = parseFloat(cols[idxDsctoBi]?.trim() || '0') || 0;
        const igvVentas = parseFloat(cols[idxIgvVentas]?.trim() || '0') || 0;
        const dsctoIgv = parseFloat(cols[idxDsctoIgv]?.trim() || '0') || 0;
        const exon = parseFloat(cols[idxExonerado]?.trim() || '0') || 0;
        const inaf = parseFloat(cols[idxInafecto]?.trim() || '0') || 0;
        const isc = parseFloat(cols[idxIsc]?.trim() || '0') || 0;
        const icbper = parseFloat(cols[idxIcbper]?.trim() || '0') || 0;
        const otros = parseFloat(cols[idxOtrosTrib]?.trim() || '0') || 0;
        const tot = parseFloat(cols[idxTotal]?.trim() || '0') || 0;

        baseImponible = Number((bi - dsctoBi + exp).toFixed(2));
        baseNoGravada = Number((exon + inaf).toFixed(2));
        igv = Number((igvVentas - dsctoIgv).toFixed(2));
        otrosTributos = Number((isc + icbper + otros).toFixed(2));
        total = Number(tot.toFixed(2));

        tipoOperacion = cols[idxTipoOperacion]?.trim() || '0101';

        // Cuadre aritmético con tolerancia de 0.05
        const sumaCalculada = Money.create(baseImponible)
          .plus(baseNoGravada)
          .plus(igv)
          .plus(otrosTributos);
        const difAritmetica = Money.create(total).minus(sumaCalculada).abs();
        if (difAritmetica.greaterThan(0.05)) {
          advertencias.push(`Diferencia aritmética de S/ ${difAritmetica.toFixed(2)} entre componentes (S/ ${sumaCalculada.toFixed(2)}) y total (S/ ${total.toFixed(2)}).`);
          estadoValidacion = 'CON_ADVERTENCIA';
        }
      }

      // Equivalente en Soles si es moneda extranjera
      const totalPen = moneda === 'USD' ? Number((total * tc).toFixed(2)) : total;

      // Estado del Comprobante en SUNAT: '0'=Anulado, '2'=Baja
      if (estComp === '0' || estComp === '2') {
        estadoValidacion = 'ANULADO';
        advertencias.push('Comprobante comunicado como ANULADO o DADO DE BAJA en SUNAT.');
      }

      // Detección de comprobante modificado (Nota de Crédito 07 o Débito 08)
      const esNotaAjuste = tipoComprobante === '07' || tipoComprobante === '08';
      let docModTipo = cols[idxDocModTipo]?.trim() || '';
      let docModSerie = cols[idxDocModSerie]?.trim() || '';
      let docModNumero = cols[idxDocModNumero]?.trim() || '';
      let docModFecha = cols[idxDocModFecha]?.trim() || '';
      let docModExiste = false;
      let docModId: string | undefined = undefined;

      if (esNotaAjuste) {
        if (docModSerie && docModNumero) {
          const claveMod = `${docModTipo.padStart(2, '0')}-${docModSerie.toUpperCase()}-${docModNumero}`;
          const modificado = mapaComprobantesExistentes.get(claveMod);
          if (modificado) {
            docModExiste = true;
            docModId = modificado.id;
          } else {
            advertencias.push(`Comprobante modificado ${docModSerie}-${docModNumero} no hallado en el sistema (se creará ajuste independiente).`);
          }
        } else {
          advertencias.push('Nota de crédito/débito no especifica serie/número del comprobante modificado.');
        }
      }

      // Detección de duplicado contra registros ya importados o contabilizados
      const claveDup = `${tipoComprobante}-${serie}-${numero}`;
      const yaRegistrado = mapaComprobantesExistentes.has(claveDup) ||
        (car && (mapaComprobantesExistentes.has(`CAR-${car}`) || CAR_IMPORTADOS_MEMORIA.has(car)));

      if (yaRegistrado) {
        estadoValidacion = 'YA_IMPORTADO';
        advertencias.push('Comprobante ya importado o contabilizado previamente en esta empresa.');
      }

      // Detección del Auxiliar (Tercero: Proveedor o Cliente)
      const auxiliar = mapaAnexosPorDoc.get(numDocId);
      const auxiliarExiste = Boolean(auxiliar);
      const auxiliarId = auxiliar?.id;
      if (!auxiliarExiste && numDocId) {
        advertencias.push(`El documento ${numDocId} no está registrado en el catálogo de auxiliares (se creará automáticamente al contabilizar).`);
      }

      // Detección de Cuentas Contables consultando SIRE Reglas y el Plan de Cuentas REAL
      let cuentaGastoIngresoCandidata = '';
      if (tipo === 'COMPRAS') {
        if (clasifBssSss === '2') {
          cuentaGastoIngresoCandidata = reglasMapeo.compras.clasif2_activoFijo;
        } else if (clasifBssSss === '3') {
          cuentaGastoIngresoCandidata = reglasMapeo.compras.clasif3_otrosActivos;
        } else if (clasifBssSss === '4') {
          cuentaGastoIngresoCandidata = reglasMapeo.compras.clasif4_servicios;
        } else if (clasifBssSss === '5') {
          cuentaGastoIngresoCandidata = reglasMapeo.compras.clasif5_otrosGastos;
        } else {
          cuentaGastoIngresoCandidata = reglasMapeo.compras.clasif1_mercaderias;
        }
      } else {
        // Ventas
        if (tipoOperacion === '0200') {
          cuentaGastoIngresoCandidata = reglasMapeo.ventas.operacion0200_exportacion;
        } else if (tipoOperacion === '0102') {
          cuentaGastoIngresoCandidata = reglasMapeo.ventas.operacion0102_anticipos;
        } else if (tipoOperacion === '0112') {
          cuentaGastoIngresoCandidata = reglasMapeo.ventas.operacion0112_gratuita;
        } else {
          cuentaGastoIngresoCandidata = reglasMapeo.ventas.operacion0101_interna;
        }
      }

      // Verificar que la cuenta de gasto/ingreso EXISTA realmente en el Plan de Cuentas
      const ctaValida = verificarCuentaEnPlan(cuentaGastoIngresoCandidata);
      let cuentaPropuestaCodigo = '';
      let cuentaPropuestaNombre = '';
      let cuentaRequiereRevision = false;

      if (ctaValida) {
        cuentaPropuestaCodigo = ctaValida.codigo;
        cuentaPropuestaNombre = ctaValida.nombre;
      } else {
        // Regla de Oro: ¡NUNCA inventar un código que no exista en el plan!
        cuentaPropuestaCodigo = '';
        cuentaPropuestaNombre = '';
        cuentaRequiereRevision = true;
        advertencias.push(`La cuenta sugerida "${cuentaGastoIngresoCandidata}" no existe en el Plan de Cuentas activo de la empresa.`);
        if (estadoValidacion === 'PENDIENTE') {
          estadoValidacion = 'REQUIERE_REVISION';
        }
      }

      // Cuentas de IGV y Tercero
      const ctaIgvCandidata = tipo === 'COMPRAS' ? reglasMapeo.compras.igvCreditoFiscal : reglasMapeo.ventas.igvDebitoFiscal;
      const ctaIgv = verificarCuentaEnPlan(ctaIgvCandidata);
      const cuentaIgvCodigo = ctaIgv?.codigo || '40111';
      const cuentaIgvNombre = ctaIgv?.nombre || 'IGV - Cuenta Propia';

      const ctaTerceroCandidata = tipo === 'COMPRAS'
        ? (tipoDocId === '6' ? reglasMapeo.compras.proveedorRuc : reglasMapeo.compras.proveedorDni)
        : (tipoDocId === '6' ? reglasMapeo.ventas.clienteRuc : reglasMapeo.ventas.clienteDni);
      const ctaTercero = verificarCuentaEnPlan(ctaTerceroCandidata);
      const cuentaTerceroCodigo = ctaTercero?.codigo || (tipo === 'COMPRAS' ? '4212' : '1212');
      const cuentaTerceroNombre = ctaTercero?.nombre || (tipo === 'COMPRAS' ? 'Emitidas' : 'En cartera');

      // Glosa Propuesta
      let glosaPropuesta = '';
      const nombreCmp = obtenerNombreTipoComprobante(tipoComprobante);
      if (esNotaAjuste && docModSerie && docModNumero) {
        glosaPropuesta = `${nombreCmp} s/${serie}-${numero} que modifica ${docModTipo || '01'} ${docModSerie}-${docModNumero}`;
      } else if (tipo === 'COMPRAS') {
        glosaPropuesta = `Compra s/${nombreCmp} ${serie}-${numero} — ${razonTercero || numDocId} — ${periodoFila}`;
      } else {
        glosaPropuesta = `Venta s/${nombreCmp} ${serie}-${numero} — ${razonTercero || numDocId} — ${periodoFila}`;
      }

      filasAnalizadas.push({
        indice: i,
        car,
        periodo: periodoFila,
        fechaEmision,
        fechaEmisionIso,
        fechaVencimiento: fechaVcto,
        fechaVencimientoIso: fechaVctoIso,
        tipoComprobante,
        tipoComprobanteNombre: nombreCmp,
        serie,
        numero,
        tipoDocIdentidad: tipoDocId,
        numDocIdentidad: numDocId,
        razonSocial: razonTercero,
        baseImponible,
        baseNoGravada,
        igv,
        otrosTributos,
        total,
        moneda,
        tipoCambio: tc,
        totalPen,
        clasificacionBssSss: clasifBssSss,
        detraccion: tieneDetraccion,
        tipoOperacion,
        estadoComprobanteSunat: estComp,
        esNotaAjuste,
        docModificadoTipo: docModTipo,
        docModificadoSerie: docModSerie,
        docModificadoNumero: docModNumero,
        docModificadoFecha: docModFecha,
        docModificadoExiste: docModExiste,
        docModificadoId: docModId,
        cuentaPropuestaCodigo,
        cuentaPropuestaNombre,
        cuentaRequiereRevision,
        cuentaIgvCodigo,
        cuentaIgvNombre,
        cuentaTerceroCodigo,
        cuentaTerceroNombre,
        auxiliarExiste,
        auxiliarId,
        glosaPropuesta,
        estadoValidacion,
        advertencias,
        incluir: estadoValidacion !== 'YA_IMPORTADO' && estadoValidacion !== 'ANULADO'
      });
    }

    // Ordenar por fecha de emisión ascendente
    filasAnalizadas.sort((a, b) => a.fechaEmisionIso.localeCompare(b.fechaEmisionIso));

    // Totales y resumen
    let totalBase = 0;
    let totalIgv = 0;
    let totalImporte = 0;
    let pendientes = 0;
    let conAdvertencia = 0;
    let requierenRevision = 0;
    let yaImportados = 0;
    let anulados = 0;

    for (const f of filasAnalizadas) {
      totalBase += f.baseImponible;
      totalIgv += f.igv;
      totalImporte += f.total;
      if (f.estadoValidacion === 'PENDIENTE') pendientes++;
      else if (f.estadoValidacion === 'CON_ADVERTENCIA') conAdvertencia++;
      else if (f.estadoValidacion === 'REQUIERE_REVISION') requierenRevision++;
      else if (f.estadoValidacion === 'YA_IMPORTADO') yaImportados++;
      else if (f.estadoValidacion === 'ANULADO') anulados++;
    }

    return {
      tipo,
      nombreArchivo,
      rucEmisor: rucEmisorDetectado,
      razonSocialEmisor: razonSocialEmisorDetectada,
      periodo: periodoDetectado || periodoParam,
      totalRegistros: filasAnalizadas.length,
      totalBaseImponible: Number(totalBase.toFixed(2)),
      totalIgv: Number(totalIgv.toFixed(2)),
      totalImporte: Number(totalImporte.toFixed(2)),
      resumenEstados: {
        pendientes,
        conAdvertencia,
        requierenRevision,
        yaImportados,
        anulados
      },
      filas: filasAnalizadas
    };
  },

  /**
   * Contabiliza las filas seleccionadas por el usuario utilizando los servicios estándar del sistema
   */
  async contabilizarFilasSeleccionadas(
    empresaId: string,
    tipo: 'COMPRAS' | 'VENTAS',
    periodoParam: string,
    filasParaContabilizar: FilaSireAnalizada[],
    userId: string
  ): Promise<{
    exitosos: number;
    fallidos: number;
    comprobantesIds: string[];
    asientosIds: string[];
    errores: { fila: number; serieNumero: string; error: string }[];
  }> {
    const exitosos: string[] = [];
    const asientosIds: string[] = [];
    const errores: { fila: number; serieNumero: string; error: string }[] = [];

    // Resolver periodo
    const periodoObj = await periodoService.obtenerPorCodigo(empresaId, periodoParam);
    const periodoId = periodoObj?.id || periodoParam;

    for (const fila of filasParaContabilizar) {
      try {
        if (!fila.cuentaPropuestaCodigo) {
          throw new Error('Debe asignar una cuenta contable válida del Plan de Cuentas.');
        }

        // 1. Asegurar la existencia del Anexo (Proveedor o Cliente)
        let anexoId = fila.auxiliarId;
        if (!anexoId) {
          const anexoExistente = await anexoService.obtenerPorDocumento(empresaId, fila.numDocIdentidad);
          if (anexoExistente) {
            anexoId = anexoExistente.id;
          } else {
            const nuevoAnexo = await anexoService.crear(empresaId, {
              tipoDocumento: fila.tipoDocIdentidad as any,
              numeroDocumento: fila.numDocIdentidad,
              razonSocial: fila.razonSocial || (fila.tipoDocIdentidad === '6' ? `PROVEEDOR RUC ${fila.numDocIdentidad}` : `CLIENTE DNI ${fila.numDocIdentidad}`),
              tipoEntidad: tipo === 'COMPRAS' ? 'PROVEEDOR' : 'CLIENTE',
              condicionSunat: 'HABIDO',
              estadoSunat: 'ACTIVO'
            });
            anexoId = nuevoAnexo.id;
          }
        }

        // 2. Contabilización según módulo
        if (tipo === 'COMPRAS') {
          const resCompra = await compraService.registrar(empresaId, {
            periodoId,
            fechaEmision: fila.fechaEmisionIso,
            fechaVencimiento: fila.fechaVencimientoIso || null,
            fechaContable: fila.fechaEmisionIso,
            tipoComprobante: fila.tipoComprobante,
            serie: fila.serie,
            numero: fila.numero,
            proveedorId: anexoId,
            moneda: fila.moneda,
            tipoCambio: fila.tipoCambio,
            baseGravada: fila.baseImponible,
            baseNoGravada: fila.baseNoGravada,
            igv: fila.igv,
            otrosTributos: fila.otrosTributos,
            total: fila.total,
            tieneDetraccion: fila.detraccion,
            glosa: fila.glosaPropuesta,
            cuentaCompra: fila.cuentaPropuestaCodigo,
            formaPago: 'CONTADO'
          } as any, userId);

          exitosos.push(resCompra.id);
          if (resCompra.asientoId) asientosIds.push(resCompra.asientoId);
        } else {
          // VENTAS
          const resVenta = await ventaService.registrar(empresaId, {
            periodoId,
            fechaEmision: fila.fechaEmisionIso,
            fechaVencimiento: fila.fechaVencimientoIso || null,
            fechaContable: fila.fechaEmisionIso,
            tipoComprobante: fila.tipoComprobante,
            serie: fila.serie,
            numero: fila.numero,
            clienteId: anexoId,
            moneda: fila.moneda,
            tipoCambio: fila.tipoCambio,
            baseGravada: fila.baseImponible,
            baseNoGravada: fila.baseNoGravada,
            igv: fila.igv,
            otrosTributos: fila.otrosTributos,
            total: fila.total,
            tipoOperacion: fila.tipoOperacion || 'VENTA_INTERNA',
            glosa: fila.glosaPropuesta,
            cuentaVenta: fila.cuentaPropuestaCodigo,
            formaPago: 'CONTADO'
          } as any, userId);

          exitosos.push(resVenta.id);
          if (resVenta.asientoId) asientosIds.push(resVenta.asientoId);
        }

        // Registrar CAR como procesado
        if (fila.car) {
          CAR_IMPORTADOS_MEMORIA.add(fila.car);
        }
      } catch (err: any) {
        errores.push({
          fila: fila.indice,
          serieNumero: `${fila.serie}-${fila.numero}`,
          error: err.message || 'Error desconocido al contabilizar.'
        });
      }
    }

    // Auditoría del lote
    await auditoriaRepository.registrar({
      empresaId,
      usuarioId: userId,
      tablaAfectada: tipo === 'COMPRAS' ? 'comprobantes_compra' : 'comprobantes_venta',
      registroId: exitosos[0] || 'LOTE_SIRE',
      accion: 'IMPORTACION_SIRE_LOTE',
      datosNuevos: {
        tipo,
        periodo: periodoParam,
        totalEnviados: filasParaContabilizar.length,
        totalExitosos: exitosos.length,
        totalFallidos: errores.length,
        asientosGenerados: asientosIds.length
      }
    });

    return {
      exitosos: exitosos.length,
      fallidos: errores.length,
      comprobantesIds: exitosos,
      asientosIds,
      errores
    };
  }
};
