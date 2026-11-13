import crypto from 'crypto';
import AdmZip from 'adm-zip';
import { db } from '../config/database';
import { env } from '../config/env';
import { empresaRepository, EmpresaModel } from '../repositories/empresaRepository';
import { ASIENTOS_MEMORIA, AsientoContableModel } from './asientoService';
import { COMPRAS_MEMORIA, CXP_MEMORIA, CompraModel, CuentaPorPagarModel } from './compraService';
import { VENTAS_MEMORIA, CXC_MEMORIA, VentaModel, CuentaPorCobrarModel } from './ventaService';
import { ANEXOS_MEMORIA, AnexoModel } from './anexoService';
import { CUENTAS_FINANCIERAS_MEMORIA, MOVIMIENTOS_TESORERIA_MEMORIA, CuentaFinancieraModel, MovimientoTesoreriaModel } from './tesoreriaService';
import {
  TRABAJADORES_MEMORIA,
  PLANILLAS_MEMORIA,
  GRATIFICACIONES_MEMORIA,
  CTS_MEMORIA,
  LIQUIDACIONES_BENEFICIOS_MEMORIA,
  TREGISTRO_MOVIMIENTOS_MEMORIA,
  TrabajadorModel,
  PlanillaResumenModel,
  GratificacionLineaModel,
  CtsLineaModel,
  LiquidacionBeneficiosModel,
  TRegistroMovimientoModel
} from './planillaService';
import { PERIODOS_MEMORIA, PeriodoModel } from './periodoService';
import { ARTICULOS_MEMORIA, ArticuloKardexModel } from './kardexService';
import { DECLARACIONES_PDT621_MEMORIA, LiquidacionIGVResultado } from './liquidacionIGVService';
import { DECLARACIONES_PRORRATA_MEMORIA, LiquidacionProrrataIgv } from './prorrataIgvService';
import { DECLARACIONES_RENTA_ANUAL_MEMORIA, CalculoDjAnualRenta } from './djRentaAnualService';
import { DAOT_EXCLUSIONES_MEMORIA, ExclusionDaotItem } from './daotService';
import { auditoriaChainService } from './auditoriaChainService';
import { auditoriaRepository } from '../repositories/auditoriaRepository';
import { sanitizarMensaje } from '../utils/seguridadDatos';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OrigenBackup = 'MANUAL' | 'AUTO_ENTRADA' | 'PREVIO_CIERRE' | 'PREVIO_IMPORTACION' | 'PREVIO_RESET_DEMO';

export interface AlcanceBackup {
  modo: 'PARCIAL_MEMORIA' | 'COMPLETO';
  incluye: string[];
  no_incluye: string[];
}

export const ADVERTENCIA_BACKUP_PARCIAL =
  'Respaldo lógico PARCIAL: solo exporta las colecciones cargadas actualmente en memoria (*_MEMORIA) y la auditoría de la empresa. NO reemplaza el respaldo físico de PostgreSQL (pg_dump) ni incluye archivos físicos, credenciales SUNAT ni usuarios/roles del estudio.';

export const NO_INCLUYE_BACKUP_PARCIAL: readonly string[] = [
  'Datos persistidos directamente en tablas PostgreSQL que no estén cargados en los 20 arreglos *_MEMORIA exportados (plan de cuentas personalizado, subdiarios, reglas de contabilización, tipos de cambio, análisis de cuentas y operaciones posteriores en PostgreSQL)',
  'Módulos en memoria no volcados por este ZIP (activos fijos, caja chica, conciliación bancaria, extractos, honorarios, cierre anual, auditoría preventiva, historial SIRE/PLE y lotes CSV)',
  'Archivos físicos por empresa en disco (REGISTRO_ARCHIVOS_EMPRESA: adjuntos, xml, cdr, pdf, txt, temporales, respaldos)',
  'Credenciales SUNAT (credenciales_sunat, sunat_conexiones, sunat_tokens, sunat_empresa_keys)',
  'Usuarios, roles, membresías, sesiones MFA y licencias del estudio (ámbito control)'
];

export function sanitizarSegmentoNombreArchivo(valor: string): string {
  const limpio = valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return limpio || 'EMPRESA';
}

export function generarNombreArchivoDescargaBackup(params: {
  ruc: string;
  razonSocial?: string;
  fecha?: Date;
  alcance?: AlcanceBackup;
  nombreArchivoFallback: string;
}): string {
  const esParcial = !params.alcance || params.alcance.modo !== 'COMPLETO' || params.alcance.no_incluye.length > 0;
  if (!esParcial) {
    return params.nombreArchivoFallback;
  }
  const fecha = params.fecha || new Date();
  const fechaTag = fecha.toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  const empresaTag = params.razonSocial
    ? `${sanitizarSegmentoNombreArchivo(params.ruc)}_${sanitizarSegmentoNombreArchivo(params.razonSocial)}`
    : sanitizarSegmentoNombreArchivo(params.ruc);
  return `ATLOB_respaldo_PARCIAL_${empresaTag}_${fechaTag}.zip`;
}

export interface ManifestBackup {
  ruc: string;
  razonSocial: string;
  ejercicio: number;
  esquemaVersion: string;
  fechaUtc: string;
  usuarioId: string;
  origen: OrigenBackup;
  alcance?: AlcanceBackup;
  advertencia?: string;
  archivos: Record<string, { lineas: number; sha256: string }>;
}

export interface MetadatosBackupItem {
  id: string;
  empresaId: string;
  ruc: string;
  ejercicio: number;
  nombreArchivo: string;
  nombreArchivoDescarga?: string;
  esParcial?: boolean;
  alcance?: AlcanceBackup;
  advertencia?: string;
  tamanoBytes: number;
  hashSha256: string;
  usuarioId: string;
  origen: OrigenBackup;
  fechaCreacion: string;
  archivoZipBuffer?: Buffer; // Almacén en memoria para descarga/restauración
}

export interface EstadoMarcaAguaEmpresa {
  ultimaModificacion: number;
  ultimoRespaldo: number;
  ultimoBackupId?: string;
}

const BACKUPS_MEMORIA: MetadatosBackupItem[] = [];
const MARCAS_AGUA_EMPRESA = new Map<string, EstadoMarcaAguaEmpresa>();
const RETENCION_MAXIMA_BACKUPS = 10;

export const backupEmpresaService = {
  /**
   * Registra una modificación en los datos de la empresa para la marca de agua
   */
  notificarCambioEmpresa(empresaId: string) {
    const estado = MARCAS_AGUA_EMPRESA.get(empresaId) || { ultimaModificacion: 0, ultimoRespaldo: 0 };
    estado.ultimaModificacion = Date.now();
    MARCAS_AGUA_EMPRESA.set(empresaId, estado);
  },

  /**
   * Evalúa si corresponde ejecutar un respaldo en segundo plano al ingresar a la empresa (debounce 60 min)
   */
  async verificarYDispararAutoBackup(empresaId: string, userId: string): Promise<boolean> {
    const estado = MARCAS_AGUA_EMPRESA.get(empresaId);
    const ahora = Date.now();
    const intervaloMinutos = 60;
    const tiempoMinimo = intervaloMinutos * 60 * 1000;

    // Si nunca se respaldó o pasaron > 60 min y hubo cambios posteriores al último respaldo
    if (!estado || (ahora - estado.ultimoRespaldo >= tiempoMinimo && estado.ultimaModificacion > estado.ultimoRespaldo)) {
      try {
        await this.generarBackupZip(empresaId, 'AUTO_ENTRADA', userId);
        return true;
      } catch (err) {
        console.warn(`[AutoBackup] Advertencia generando backup automático para empresa ${empresaId}:`, sanitizarMensaje(err));
        return false;
      }
    }
    return false;
  },

  /**
   * Genera clave criptográfica simétrica AES-256 de 32 bytes derivada con PBKDF2
   */
  derivarClave(passphrase = env.BACKUP_ENCRYPTION_KEY, salt = 'atlob_estudio_salt_2026'): Buffer {
    return crypto.pbkdf2Sync(passphrase, salt, 10000, 32, 'sha256');
  },

  /**
   * Cifra un buffer con AES-256-GCM (retorna IV de 12 bytes + AuthTag de 16 bytes + Ciphertext)
   */
  cifrarBufferAesGcm(data: Buffer, key: Buffer): Buffer {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Estructura: [IV: 12 bytes] + [TAG: 16 bytes] + [ENCRYPTED DATA]
    return Buffer.concat([iv, tag, encrypted]);
  },

  /**
   * Descifra un buffer AES-256-GCM verificando autenticidad e integridad
   */
  descifrarBufferAesGcm(packedData: Buffer, key: Buffer): Buffer {
    if (packedData.length < 28) {
      throw new Error('BACKUP_CORRUPTO: Longitud de archivo cifrado insuficiente.');
    }
    const iv = packedData.subarray(0, 12);
    const tag = packedData.subarray(12, 28);
    const ciphertext = packedData.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  },

  /**
   * Genera el archivo ZIP por empresa, cifra con AES-256-GCM y almacena con rotación
   */
  async generarBackupZip(
    empresaId: string,
    origen: OrigenBackup = 'MANUAL',
    userId: string = 'usr-admin-01',
    passwordCifrado?: string
  ): Promise<MetadatosBackupItem> {
    const empresa = await empresaRepository.obtenerPorId(empresaId);
    if (!empresa) {
      throw new Error(`EMPRESA_NO_ENCONTRADA: No existe la empresa con ID ${empresaId}`);
    }

    const ruc = empresa.ruc;
    const ejercicio = 2026;
    const now = new Date();
    const timestampStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 15);
    const nombreArchivo = `${ruc}_${ejercicio}_${timestampStr}.zip`;

    // 1. Recopilar datos filtrados estrictamente por empresaId
    // Nota de Seguridad: ¡Cero credenciales SOL ni claves de terceros!
    const tablas: Record<string, any[]> = {
      'empresa.json': [{
        id: empresa.id,
        ruc: empresa.ruc,
        razonSocial: empresa.razonSocial,
        nombreComercial: empresa.nombreComercial,
        regimenTributario: empresa.regimenTributario,
        domicilioFiscal: empresa.domicilioFiscal,
        monedaPrincipal: empresa.monedaPrincipal,
        createdAt: empresa.createdAt
      }],
      'periodos.ndjson': PERIODOS_MEMORIA.filter(p => p.empresaId === empresaId),
      'asientos.ndjson': ASIENTOS_MEMORIA.filter(a => a.empresaId === empresaId),
      'compras.ndjson': COMPRAS_MEMORIA.filter(c => c.empresaId === empresaId),
      'cxp.ndjson': CXP_MEMORIA.filter(c => c.empresaId === empresaId),
      'ventas.ndjson': VENTAS_MEMORIA.filter(v => v.empresaId === empresaId),
      'cxc.ndjson': CXC_MEMORIA.filter(c => c.empresaId === empresaId),
      'anexos.ndjson': ANEXOS_MEMORIA.filter(a => a.empresaId === empresaId),
      'cuentas_financieras.ndjson': CUENTAS_FINANCIERAS_MEMORIA.filter(c => c.empresaId === empresaId),
      'movimientos_tesoreria.ndjson': MOVIMIENTOS_TESORERIA_MEMORIA.filter(m => m.empresaId === empresaId),
      'trabajadores.ndjson': TRABAJADORES_MEMORIA.filter(t => t.empresaId === empresaId),
      'planillas.ndjson': PLANILLAS_MEMORIA.filter(p => p.empresaId === empresaId),
      'planilla_gratificaciones.ndjson': GRATIFICACIONES_MEMORIA.filter(g => g.empresaId === empresaId),
      'planilla_cts.ndjson': CTS_MEMORIA.filter(c => c.empresaId === empresaId),
      'liquidaciones_beneficios.ndjson': LIQUIDACIONES_BENEFICIOS_MEMORIA.filter(l => l.empresaId === empresaId),
      'tregistro_movimientos.ndjson': TREGISTRO_MOVIMIENTOS_MEMORIA.filter(m => m.empresaId === empresaId),
      'articulos_kardex.ndjson': ARTICULOS_MEMORIA.filter(a => a.empresaId === empresaId),
      'declaraciones_pdt621.ndjson': DECLARACIONES_PDT621_MEMORIA.filter(d => d.empresaId === empresaId),
      'declaraciones_prorrata_igv.ndjson': DECLARACIONES_PRORRATA_MEMORIA.filter(d => d.empresaId === empresaId),
      'declaraciones_renta_anual.ndjson': DECLARACIONES_RENTA_ANUAL_MEMORIA.filter(d => d.empresaId === empresaId),
      'daot_exclusiones.ndjson': DAOT_EXCLUSIONES_MEMORIA.filter(d => d.empresaId === empresaId),
      'auditoria.ndjson': await auditoriaChainService.exportarPorEmpresa(empresaId)
    };

    // 2. Construir ZIP interno con archivos NDJSON y calcular hashes SHA-256
    const zipInterno = new AdmZip();
    const manifestArchivos: Record<string, { lineas: number; sha256: string }> = {};

    for (const [filename, rows] of Object.entries(tablas)) {
      let contenido = '';
      if (filename.endsWith('.json')) {
        contenido = JSON.stringify(rows[0] || {}, null, 2);
      } else {
        contenido = rows.map(r => JSON.stringify(r)).join('\n');
      }
      const buffer = Buffer.from(contenido, 'utf8');
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      manifestArchivos[filename] = {
        lineas: rows.length,
        sha256
      };
      zipInterno.addFile(filename, buffer);
    }

    // 3. Crear manifest.json con alcance explícito y advertencia retrocompatible
    const alcance: AlcanceBackup = {
      modo: 'PARCIAL_MEMORIA',
      incluye: Object.keys(tablas),
      no_incluye: [...NO_INCLUYE_BACKUP_PARCIAL]
    };
    const manifest: ManifestBackup = {
      ruc,
      razonSocial: empresa.razonSocial,
      ejercicio,
      esquemaVersion: '2.0.0-fase13',
      fechaUtc: now.toISOString(),
      usuarioId: userId,
      origen,
      alcance,
      advertencia: ADVERTENCIA_BACKUP_PARCIAL,
      archivos: manifestArchivos
    };
    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    zipInterno.addFile('manifest.json', manifestBuffer);

    // 4. Cifrado simétrico AES-256-GCM del paquete ZIP completo
    const zipPlanoBuffer = zipInterno.toBuffer();
    const clave = this.derivarClave(passwordCifrado || undefined);
    const zipCifradoBuffer = this.cifrarBufferAesGcm(zipPlanoBuffer, clave);

    const hashFinalSha256 = crypto.createHash('sha256').update(zipCifradoBuffer).digest('hex');
    const backupId = `bkp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const nombreArchivoDescarga = generarNombreArchivoDescargaBackup({
      ruc,
      razonSocial: empresa.razonSocial,
      fecha: now,
      alcance,
      nombreArchivoFallback: nombreArchivo
    });

    const metadataItem: MetadatosBackupItem = {
      id: backupId,
      empresaId,
      ruc,
      ejercicio,
      nombreArchivo,
      nombreArchivoDescarga,
      esParcial: true,
      alcance,
      advertencia: ADVERTENCIA_BACKUP_PARCIAL,
      tamanoBytes: zipCifradoBuffer.length,
      hashSha256: hashFinalSha256,
      usuarioId: userId,
      origen,
      fechaCreacion: now.toISOString(),
      archivoZipBuffer: zipCifradoBuffer
    };

    // 5. Aplicar política de retención (rotar últimos N backups)
    BACKUPS_MEMORIA.unshift(metadataItem);

    if (db.isPostgresConnected()) {
      try {
        await db.query(`
          INSERT INTO reportes_generados (
            id, empresa_id, tipo_reporte, periodo, parametros, archivo_url, hash_sha256, usuario_id
          ) VALUES ($1, $2, 'BACKUP', $3, $4, $5, $6, $7)
        `, [
          UUID_REGEX.test(backupId) ? backupId : crypto.randomUUID(),
          empresaId,
          `${ejercicio}-00`,
          JSON.stringify({ origen, nombreArchivo: nombreArchivoDescarga }),
          nombreArchivoDescarga,
          hashFinalSha256,
          UUID_REGEX.test(userId) ? userId : null
        ]);
      } catch {
        // Fallback a memoria
      }
    }
    const backupsEmpresa = BACKUPS_MEMORIA.filter(b => b.empresaId === empresaId);
    if (backupsEmpresa.length > RETENCION_MAXIMA_BACKUPS) {
      const sobrantes = backupsEmpresa.slice(RETENCION_MAXIMA_BACKUPS);
      for (const sob of sobrantes) {
        const idx = BACKUPS_MEMORIA.findIndex(b => b.id === sob.id);
        if (idx !== -1) BACKUPS_MEMORIA.splice(idx, 1);
      }
    }

    // 6. Actualizar marca de agua de respaldo
    const marca = MARCAS_AGUA_EMPRESA.get(empresaId) || { ultimaModificacion: Date.now(), ultimoRespaldo: 0 };
    marca.ultimoRespaldo = Date.now();
    marca.ultimoBackupId = backupId;
    MARCAS_AGUA_EMPRESA.set(empresaId, marca);

    // 7. Auditoría
    await auditoriaRepository.registrar({
      empresaId,
      usuarioId: userId,
      tablaAfectada: 'backups_empresa',
      registroId: backupId,
      accion: 'INSERT',
      datosNuevos: { nombreArchivo, origen, tamanoBytes: zipCifradoBuffer.length, hashSha256: hashFinalSha256 }
    });

    return metadataItem;
  },

  /**
   * Verifica la integridad de un archivo de backup (descifra, valida tags GCM y hashes SHA-256)
   */
  verificarIntegridadBackup(
    backupBuffer: Buffer,
    passwordCifrado?: string
  ): { valida: boolean; manifest: ManifestBackup; detalle: string } {
    try {
      const clave = this.derivarClave(passwordCifrado || undefined);
      const zipPlano = this.descifrarBufferAesGcm(backupBuffer, clave);
      const zip = new AdmZip(zipPlano);

      const manifestEntry = zip.getEntry('manifest.json');
      if (!manifestEntry) {
        throw new Error('CORRUPTO: El backup no contiene manifest.json.');
      }

      const manifest: ManifestBackup = JSON.parse(manifestEntry.getData().toString('utf8'));

      // Verificar SHA-256 de cada archivo declarado
      for (const [filename, info] of Object.entries(manifest.archivos)) {
        const entry = zip.getEntry(filename);
        if (!entry) {
          throw new Error(`CORRUPTO: Archivo faltante en el paquete: ${filename}`);
        }
        const data = entry.getData();
        const sha256Calculado = crypto.createHash('sha256').update(data).digest('hex');
        if (sha256Calculado !== info.sha256) {
          throw new Error(`CORRUPTO_HASH: El archivo ${filename} no coincide con el hash del manifest.`);
        }
      }

      return {
        valida: true,
        manifest,
        detalle: `Integridad verificada con éxito. ${Object.keys(manifest.archivos).length} archivos verificados con SHA-256.`
      };
    } catch (err: any) {
      return {
        valida: false,
        manifest: {} as any,
        detalle: sanitizarMensaje(err, 'Error validando integridad del backup.')
      };
    }
  },

  /**
   * Restaura los datos de una empresa a partir de un archivo ZIP de backup verificado
   * Reemplaza en transacción atómica solo los datos de esa empresa sin afectar a terceros.
   */
  async restaurarBackup(
    empresaIdDestino: string,
    backupBuffer: Buffer,
    confirmacionRuc: string,
    userId: string = 'usr-admin-01',
    passwordCifrado?: string
  ): Promise<{ exito: boolean; registrosRestaurados: number; mensaje: string }> {
    const empresa = await empresaRepository.obtenerPorId(empresaIdDestino);
    if (!empresa) {
      throw new Error(`EMPRESA_DESTINO_NO_EXISTE: No se encontró la empresa con ID ${empresaIdDestino}`);
    }

    // Validación de confirmación explícita escribiendo el RUC
    if (confirmacionRuc.trim() !== empresa.ruc.trim()) {
      throw new Error(`CONFIRMACION_RUC_FALLIDA: El RUC de confirmación (${confirmacionRuc}) no coincide con el RUC de la empresa destino (${empresa.ruc}). Operación abortada.`);
    }

    // 1. Validar integridad antes de tocar datos
    const verificacion = this.verificarIntegridadBackup(backupBuffer, passwordCifrado);
    if (!verificacion.valida) {
      throw new Error(`BACKUP_RECHAZADO: ${verificacion.detalle}`);
    }

    const clave = this.derivarClave(passwordCifrado || undefined);
    const zipPlano = this.descifrarBufferAesGcm(backupBuffer, clave);
    const zip = new AdmZip(zipPlano);

    // 2. Transacción de restauración aislada
    let totalRestaurados = 0;

    // Helper para leer NDJSON
    const leerNdjson = <T>(entryName: string): T[] => {
      const entry = zip.getEntry(entryName);
      if (!entry) return [];
      const text = entry.getData().toString('utf8').trim();
      if (!text) return [];
      return text.split('\n').filter(Boolean).map(l => JSON.parse(l));
    };

    const nuevosAsientos = leerNdjson<AsientoContableModel>('asientos.ndjson');
    const nuevasCompras = leerNdjson<CompraModel>('compras.ndjson');
    const nuevasCxp = leerNdjson<CuentaPorPagarModel>('cxp.ndjson');
    const nuevasVentas = leerNdjson<VentaModel>('ventas.ndjson');
    const nuevasCxc = leerNdjson<CuentaPorCobrarModel>('cxc.ndjson');
    const nuevosAnexos = leerNdjson<AnexoModel>('anexos.ndjson');
    const nuevasCuentas = leerNdjson<CuentaFinancieraModel>('cuentas_financieras.ndjson');
    const nuevosMovimientos = leerNdjson<MovimientoTesoreriaModel>('movimientos_tesoreria.ndjson');
    const nuevosTrabajadores = leerNdjson<TrabajadorModel>('trabajadores.ndjson');
    const nuevasPlanillas = leerNdjson<PlanillaResumenModel>('planillas.ndjson');
    const nuevasGratificaciones = leerNdjson<GratificacionLineaModel>('planilla_gratificaciones.ndjson');
    const nuevasCts = leerNdjson<CtsLineaModel>('planilla_cts.ndjson');
    const nuevasLiquidaciones = leerNdjson<LiquidacionBeneficiosModel>('liquidaciones_beneficios.ndjson');
    const nuevosTRegistro = leerNdjson<TRegistroMovimientoModel>('tregistro_movimientos.ndjson');
    const nuevosArticulos = leerNdjson<ArticuloKardexModel>('articulos_kardex.ndjson');
    const nuevosPeriodos = leerNdjson<PeriodoModel>('periodos.ndjson');
    const nuevasDeclPdt621 = leerNdjson<LiquidacionIGVResultado>('declaraciones_pdt621.ndjson');
    const nuevasDeclProrrata = leerNdjson<LiquidacionProrrataIgv>('declaraciones_prorrata_igv.ndjson');
    const nuevasDeclRentaAnual = leerNdjson<CalculoDjAnualRenta>('declaraciones_renta_anual.ndjson');
    const nuevasDaotExclusiones = leerNdjson<ExclusionDaotItem>('daot_exclusiones.ndjson');

    // 3. Sustituir en memoria SOLO los datos que pertenecen a empresaIdDestino
    const reemplazarPorEmpresa = <T extends { empresaId?: string }>(arr: T[], nuevos: T[]) => {
      // Filtrar y remover los de esta empresa
      const filtrados = arr.filter(item => item.empresaId !== empresaIdDestino);
      // Asignar el empresaIdDestino a los nuevos para garantizar consistencia
      const reasignados = nuevos.map(n => ({ ...n, empresaId: empresaIdDestino }));
      arr.splice(0, arr.length, ...filtrados, ...reasignados);
      totalRestaurados += reasignados.length;
    };

    reemplazarPorEmpresa(ASIENTOS_MEMORIA, nuevosAsientos);
    reemplazarPorEmpresa(COMPRAS_MEMORIA, nuevasCompras);
    reemplazarPorEmpresa(CXP_MEMORIA, nuevasCxp);
    reemplazarPorEmpresa(VENTAS_MEMORIA, nuevasVentas);
    reemplazarPorEmpresa(CXC_MEMORIA, nuevasCxc);
    reemplazarPorEmpresa(ANEXOS_MEMORIA, nuevosAnexos);
    reemplazarPorEmpresa(CUENTAS_FINANCIERAS_MEMORIA, nuevasCuentas);
    reemplazarPorEmpresa(MOVIMIENTOS_TESORERIA_MEMORIA, nuevosMovimientos);
    reemplazarPorEmpresa(TRABAJADORES_MEMORIA, nuevosTrabajadores);
    reemplazarPorEmpresa(PLANILLAS_MEMORIA, nuevasPlanillas);
    reemplazarPorEmpresa(GRATIFICACIONES_MEMORIA, nuevasGratificaciones);
    reemplazarPorEmpresa(CTS_MEMORIA, nuevasCts);
    reemplazarPorEmpresa(LIQUIDACIONES_BENEFICIOS_MEMORIA, nuevasLiquidaciones);
    reemplazarPorEmpresa(TREGISTRO_MOVIMIENTOS_MEMORIA, nuevosTRegistro);
    reemplazarPorEmpresa(ARTICULOS_MEMORIA, nuevosArticulos);
    reemplazarPorEmpresa(PERIODOS_MEMORIA, nuevosPeriodos);
    reemplazarPorEmpresa(DECLARACIONES_PDT621_MEMORIA, nuevasDeclPdt621);
    reemplazarPorEmpresa(DECLARACIONES_PRORRATA_MEMORIA, nuevasDeclProrrata);
    reemplazarPorEmpresa(DECLARACIONES_RENTA_ANUAL_MEMORIA, nuevasDeclRentaAnual);
    reemplazarPorEmpresa(DAOT_EXCLUSIONES_MEMORIA, nuevasDaotExclusiones);

    // 4. Registrar en auditoría
    await auditoriaRepository.registrar({
      empresaId: empresaIdDestino,
      usuarioId: userId,
      tablaAfectada: 'restauracion_backup',
      registroId: verificacion.manifest.ruc,
      accion: 'UPDATE',
      datosNuevos: {
        ruc: empresa.ruc,
        totalRestaurados,
        origenBackup: verificacion.manifest.origen,
        fechaBackup: verificacion.manifest.fechaUtc
      }
    });

    this.notificarCambioEmpresa(empresaIdDestino);

    return {
      exito: true,
      registrosRestaurados: totalRestaurados,
      mensaje: `Restauración exitosa para ${empresa.razonSocial}. Se restablecieron ${totalRestaurados} registros contables y operacionales de manera aislada.`
    };
  },

  /**
   * Obtiene la lista de backups registrados para una empresa
   */
  listarBackupsEmpresa(empresaId: string): Omit<MetadatosBackupItem, 'archivoZipBuffer'>[] {
    return BACKUPS_MEMORIA
      .filter(b => b.empresaId === empresaId)
      .map(({ archivoZipBuffer, ...rest }) => rest);
  },

  /**
   * Obtiene el buffer zip cifrado de un backup para descarga
   */
  obtenerBackupParaDescarga(empresaId: string, backupId: string): MetadatosBackupItem | null {
    return BACKUPS_MEMORIA.find(b => b.id === backupId && b.empresaId === empresaId) || null;
  }
};
