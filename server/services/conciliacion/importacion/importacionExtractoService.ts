import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { obtenerRangoMesPeriodo } from '../../../../src/utils/periodoFecha';
import { db } from '../../../config/database';
import {
  AdvertenciaImportacion,
  ConfirmarImportacionInput,
  ErrorFilaImportacion,
  EstadoConciliacionV2,
  ImportacionExtractoResumenV2,
  LineaPrevisualizadaV2,
  MapeoColumnasPerfil,
  PerfilBancoV2,
  PrevisualizarImportacionInput,
  ResultadoConfirmacionImportacionV2,
  ResultadoPrevisualizacionImportacionV2,
  ResultadoReversionImportacionV2,
} from '../../../types/conciliacionV2';
import { Money } from '../../../utils/decimal';
import { auditoriaChainService } from '../../auditoriaChainService';
import { ConciliacionV2Error, registrarAuditoriaEnTx } from '../../conciliacionV2Service';
import {
  clasificarLineaExtracto,
  listarReglasPersonalizadasEnTx,
} from '../clasificador/clasificadorGlosaService';
import { obtenerPerfilPorCodigoOIdEnTx } from '../perfilesBanco/perfilesBancoService';
import { buscarPerfilPredefinidoPorBanco } from '../perfilesBanco/perfilesPredefinidos';
import { parsearExtractoBancario, normalizarMontoExtracto } from './parsers';
import {
  sanitizarCeldaExportacion,
  validarArchivoImportacion,
} from './validacionArchivo';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIPOS_CARGO_BANCARIO_AUTOMATICO = new Set(['ITF', 'COMISION_BANCARIA', 'MANTENIMIENTO']);

export class ConciliacionImportacionError extends ConciliacionV2Error {
  public readonly errores?: ErrorFilaImportacion[];

  constructor(
    statusCode: number,
    codigo: string,
    message: string,
    errores?: ErrorFilaImportacion[]
  ) {
    super(statusCode, codigo, message);
    this.errores = errores;
  }
}

function asegurarPostgresDisponible(): void {
  if (!db.isPostgresConnected()) {
    throw new ConciliacionV2Error(
      503,
      'POSTGRESQL_NO_DISPONIBLE',
      'PostgreSQL no está conectado. La importación de extractos requiere persistencia transaccional.'
    );
  }
}

function asegurarUuid(valor: string, nombreCampo: string): void {
  if (!valor || !UUID_REGEX.test(valor)) {
    throw new ConciliacionV2Error(400, 'IDENTIFICADOR_INVALIDO', `${nombreCampo} debe ser un UUID válido.`);
  }
}

function escaparCeldaCsv(valor: string): string {
  const sanitizada = sanitizarCeldaExportacion(valor);
  if (/[",\r\n]/.test(sanitizada)) {
    return `"${sanitizada.replace(/"/g, '""')}"`;
  }
  return sanitizada;
}

/**
 * Genera una plantilla CSV segura (UTF-8 con BOM y sanitización contra Formula Injection)
 * para descarga de usuarios.
 */
export function generarPlantillaCsvSegura(): string {
  const filas: string[][] = [
    ['Fecha', 'Descripcion', 'Referencia', 'Abono', 'Cargo', 'Saldo'],
    ['01/10/2026', 'ABONO CLIENTE FACTURA F001-000120 RUC 20123456789', 'OP-10001', '1500.00', '0.00', '1500.00'],
    ['02/10/2026', 'PAGO PROVEEDOR: SERVICIOS GENERALES SAC F001-000045', 'OP-10002', '0.00', '250.00', '1250.00'],
    ['02/10/2026', 'IMPUESTO TRANSACCIONES FINANCIERAS ITF', 'ITF-10002', '0.00', '0.05', '1249.95'],
  ];

  const lineas = filas.map((fila) => fila.map(escaparCeldaCsv).join(','));
  return `\uFEFF${lineas.join('\r\n')}\r\n`;
}

function normalizarTextoHash(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function calcularHashLineaExtracto(params: {
  cuentaFinancieraId: string;
  fecha: string;
  monto: string;
  descripcion: string;
  referencia: string | null;
  saldo: string | null;
  ocurrenciaEnDia: number;
}): string {
  const descNorm = normalizarTextoHash(params.descripcion);
  const refNorm = normalizarTextoHash(params.referencia);
  const payload = `${params.cuentaFinancieraId}|${params.fecha}|${params.monto}|${descNorm}|${refNorm}|${params.saldo ?? ''}|${params.ocurrenciaEnDia}`;
  return createHash('sha256').update(payload).digest('hex');
}

function inferirPeriodoDesdeFechas(fechasValidas: string[]): string {
  if (fechasValidas.length === 0) {
    const hoy = new Date();
    return `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  const conteos = new Map<string, number>();
  for (const fecha of fechasValidas) {
    const ym = fecha.slice(0, 7);
    conteos.set(ym, (conteos.get(ym) ?? 0) + 1);
  }

  let mejorYm = fechasValidas[0].slice(0, 7);
  let maxConteo = -1;
  for (const [ym, count] of conteos.entries()) {
    if (count > maxConteo) {
      maxConteo = count;
      mejorYm = ym;
    }
  }
  return mejorYm;
}

async function verificarPeriodoNoCerradoEnTx(
  client: PoolClient,
  empresaId: string,
  cuentaFinancieraId: string,
  codigoPeriodo: string
): Promise<void> {
  const res = await client.query<{ estado: string }>(
    `SELECT cb.estado
     FROM conciliaciones_bancarias cb
     JOIN periodos p
       ON p.id = cb.periodo_id
      AND p.empresa_id = cb.empresa_id
     WHERE cb.empresa_id = $1
       AND cb.cuenta_financiera_id = $2
       AND p.codigo_periodo = $3
     LIMIT 1`,
    [empresaId, cuentaFinancieraId, codigoPeriodo]
  );

  if (res.rows[0]?.estado === 'CERRADA') {
    throw new ConciliacionV2Error(
      409,
      'CONCILIACION_CERRADA',
      `La conciliación del periodo ${codigoPeriodo} para esta cuenta se encuentra CERRADA. Debe reabrirla antes de modificar extractos.`
    );
  }
}

async function previsualizarImportacionEnTx(
  client: PoolClient,
  empresaId: string,
  input: PrevisualizarImportacionInput
): Promise<ResultadoPrevisualizacionImportacionV2 & { contentTypeNormalizado: string | null }> {
  asegurarUuid(empresaId, 'empresaId');
  asegurarUuid(input.cuentaFinancieraId, 'cuentaFinancieraId');

  // 1. Verificar existencia y propiedad de la cuenta financiera
  const cuentaRes = await client.query<{ id: string; banco: string }>(
    `SELECT id, banco
     FROM cuentas_financieras
     WHERE empresa_id = $1 AND id = $2`,
    [empresaId, input.cuentaFinancieraId]
  );

  if (cuentaRes.rows.length === 0) {
    throw new ConciliacionV2Error(
      404,
      'CUENTA_FINANCIERA_NO_ENCONTRADA',
      'La cuenta financiera solicitada no existe para esta empresa.'
    );
  }
  const cuenta = cuentaRes.rows[0];

  // 2. Validar archivo (tamaño, magic bytes, zip-bomb, XXE, PDF activo)
  const archivoVal = validarArchivoImportacion({
    nombreArchivo: input.nombreArchivo,
    contentType: input.contentType,
    contenidoBase64: input.contenidoBase64,
  });

  // 3. Resolver perfil bancario y mapeo
  let perfilResuelto: PerfilBancoV2 | null = null;
  if (input.perfilBancoId) {
    asegurarUuid(input.perfilBancoId, 'perfilBancoId');
    perfilResuelto = await obtenerPerfilPorCodigoOIdEnTx(client, empresaId, input.perfilBancoId);
  } else if (input.perfilCodigo) {
    perfilResuelto = await obtenerPerfilPorCodigoOIdEnTx(client, empresaId, input.perfilCodigo);
  } else {
    perfilResuelto = buscarPerfilPredefinidoPorBanco(cuenta.banco);
  }

  const mapeoCustom = input.mapeoPersonalizado;
  const mapeoFinal: MapeoColumnasPerfil | null =
    perfilResuelto || mapeoCustom
      ? {
          fecha: mapeoCustom?.fecha ?? perfilResuelto?.mapeoColumnas.fecha ?? 'Fecha',
          descripcion: mapeoCustom?.descripcion ?? perfilResuelto?.mapeoColumnas.descripcion ?? 'Descripción',
          referencia:
            mapeoCustom?.referencia !== undefined
              ? mapeoCustom.referencia
              : perfilResuelto?.mapeoColumnas.referencia ?? null,
          monto:
            mapeoCustom?.monto !== undefined
              ? mapeoCustom.monto
              : perfilResuelto?.mapeoColumnas.monto ?? null,
          abono:
            mapeoCustom?.abono !== undefined
              ? mapeoCustom.abono
              : perfilResuelto?.mapeoColumnas.abono ?? null,
          cargo:
            mapeoCustom?.cargo !== undefined
              ? mapeoCustom.cargo
              : perfilResuelto?.mapeoColumnas.cargo ?? null,
          saldo:
            mapeoCustom?.saldo !== undefined
              ? mapeoCustom.saldo
              : perfilResuelto?.mapeoColumnas.saldo ?? null,
          signoCargoNegativo:
            mapeoCustom?.signoCargoNegativo ?? perfilResuelto?.mapeoColumnas.signoCargoNegativo ?? true,
        }
      : null;

  const delimitadorFinal =
    mapeoCustom?.delimitador !== undefined
      ? mapeoCustom.delimitador
      : perfilResuelto?.delimitador ?? null;
  const filaEncabezadoFinal = mapeoCustom?.filaEncabezado ?? perfilResuelto?.filaEncabezado ?? 1;
  const formatoFechaFinal = mapeoCustom?.formatoFecha ?? perfilResuelto?.formatoFecha ?? 'DD/MM/YYYY';
  const separadorDecimalFinal: '.' | ',' =
    mapeoCustom?.separadorDecimal ?? perfilResuelto?.separadorDecimal ?? '.';

  // 4. Parsear filas según formato real validado
  const filasParseadas = parsearExtractoBancario(archivoVal.buffer, {
    formatoArchivo: archivoVal.formatoArchivo,
    delimitador: delimitadorFinal,
    codificacion: perfilResuelto?.codificacion ?? 'UTF-8',
    filaEncabezado: filaEncabezadoFinal,
    formatoFecha: formatoFechaFinal,
    separadorDecimal: separadorDecimalFinal,
    mapeoColumnas: mapeoFinal,
  });

  // 5. Resolver periodo objetivo y validar rango si fue especificado
  const periodoExplicito = input.periodo ? input.periodo.trim() : null;
  let rangoPeriodoExplicito: { fechaInicio: string; fechaFin: string } | null = null;
  if (periodoExplicito) {
    try {
      rangoPeriodoExplicito = obtenerRangoMesPeriodo(periodoExplicito);
    } catch (err) {
      throw new ConciliacionV2Error(400, 'PERIODO_INVALIDO', (err as Error).message);
    }
  }

  const fechasValidas = filasParseadas
    .map((f) => f.fecha)
    .filter((f): f is string => typeof f === 'string' && f.length === 10);

  const periodoObjetivo = periodoExplicito ?? inferirPeriodoDesdeFechas(fechasValidas);
  const errores: ErrorFilaImportacion[] = [];

  if (filasParseadas.length === 0) {
    errores.push({
      numFila: null,
      codigo: 'ARCHIVO_SIN_FILAS',
      campo: null,
      mensaje: 'El archivo no contiene filas de movimientos bancarios.',
      valor: null,
    });
  }

  const reglasPersonalizadas = await listarReglasPersonalizadasEnTx(client, empresaId);
  const ocurrenciasPorClave = new Map<string, number>();

  let totalAbonosDec = Money.create(0);
  let totalCargosDec = Money.create(0);

  interface FilaEnriquecidaTemp {
    numFila: number;
    fecha: string;
    descripcion: string;
    referencia: string | null;
    monto: string;
    saldo: string | null;
    hashLinea: string;
    tipoClasificacion: LineaPrevisualizadaV2['tipoClasificacion'];
    rucExtraido: string | null;
    contraparteExtraida: string | null;
    docExtraido: string | null;
    rawJson: Record<string, unknown>;
  }

  const filasTemporales: FilaEnriquecidaTemp[] = [];

  for (const fila of filasParseadas) {
    for (const errFila of fila.errores) {
      errores.push({
        numFila: fila.numFila,
        codigo: errFila.codigo,
        campo: errFila.campo,
        mensaje: errFila.mensaje,
        valor: errFila.valor,
      });
    }

    if (
      rangoPeriodoExplicito &&
      fila.fecha &&
      (fila.fecha < rangoPeriodoExplicito.fechaInicio || fila.fecha > rangoPeriodoExplicito.fechaFin)
    ) {
      errores.push({
        numFila: fila.numFila,
        codigo: 'FECHA_FUERA_DE_PERIODO',
        campo: 'fecha',
        mensaje: `La fecha ${fila.fecha} de la fila ${fila.numFila} está fuera del periodo ${periodoObjetivo} (${rangoPeriodoExplicito.fechaInicio} a ${rangoPeriodoExplicito.fechaFin}).`,
        valor: fila.fecha,
      });
    }

    const fechaEfectiva = fila.fecha ?? '';
    const montoEfectivo = fila.monto ?? '0.00';

    if (fila.monto !== null) {
      const montoDec = Money.round(fila.monto);
      if (montoDec.gt(0)) {
        totalAbonosDec = Money.add(totalAbonosDec, montoDec);
      } else if (montoDec.lt(0)) {
        totalCargosDec = Money.add(totalCargosDec, montoDec.abs());
      }
    }

    const clasificacion = clasificarLineaExtracto(
      fila.descripcion,
      fila.referencia,
      montoEfectivo,
      reglasPersonalizadas,
      cuenta.banco
    );

    const claveDia = `${fechaEfectiva}|${montoEfectivo}|${normalizarTextoHash(fila.descripcion)}|${normalizarTextoHash(fila.referencia)}|${fila.saldo ?? ''}`;
    const ocurrenciaEnDia = (ocurrenciasPorClave.get(claveDia) ?? 0) + 1;
    ocurrenciasPorClave.set(claveDia, ocurrenciaEnDia);

    const hashLinea = calcularHashLineaExtracto({
      cuentaFinancieraId: input.cuentaFinancieraId,
      fecha: fechaEfectiva,
      monto: montoEfectivo,
      descripcion: fila.descripcion,
      referencia: fila.referencia,
      saldo: fila.saldo,
      ocurrenciaEnDia,
    });

    filasTemporales.push({
      numFila: fila.numFila,
      fecha: fechaEfectiva,
      descripcion: fila.descripcion,
      referencia: fila.referencia,
      monto: montoEfectivo,
      saldo: fila.saldo,
      hashLinea,
      tipoClasificacion: clasificacion.tipoClasificacion,
      rucExtraido: clasificacion.rucExtraido,
      contraparteExtraida: clasificacion.contraparteExtraida,
      docExtraido: clasificacion.docExtraido,
      rawJson: fila.rawJson,
    });
  }

  // 6. Consultar hashes existentes en extracto_lineas para detección exacta de duplicados
  const hashesUnicos = Array.from(new Set(filasTemporales.map((f) => f.hashLinea)));
  const hashesExistentes = new Set<string>();
  if (hashesUnicos.length > 0) {
    const dupRes = await client.query<{ hash_linea: string }>(
      `SELECT hash_linea
       FROM extracto_lineas
       WHERE empresa_id = $1
         AND hash_linea = ANY($2::varchar[])`,
      [empresaId, hashesUnicos]
    );
    for (const r of dupRes.rows) {
      if (r.hash_linea) {
        hashesExistentes.add(r.hash_linea);
      }
    }
  }

  let filasNuevas = 0;
  let filasDuplicadas = 0;
  const lineas: LineaPrevisualizadaV2[] = filasTemporales.map((f) => {
    const esDuplicada = hashesExistentes.has(f.hashLinea);
    if (esDuplicada) {
      filasDuplicadas += 1;
    } else {
      filasNuevas += 1;
    }

    let estadoSugerido: EstadoConciliacionV2;
    if (esDuplicada) {
      estadoSugerido = 'DUPLICADO';
    } else if (TIPOS_CARGO_BANCARIO_AUTOMATICO.has(f.tipoClasificacion)) {
      estadoSugerido = 'CARGO_BANCARIO_ITF';
    } else {
      estadoSugerido = 'PENDIENTE_LIBROS';
    }

    return {
      numFila: f.numFila,
      fecha: f.fecha,
      descripcion: f.descripcion,
      referencia: f.referencia,
      monto: f.monto,
      saldo: f.saldo,
      hashLinea: f.hashLinea,
      esDuplicada,
      estadoSugerido,
      tipoClasificacion: f.tipoClasificacion,
      rucExtraido: f.rucExtraido,
      contraparteExtraida: f.contraparteExtraida,
      docExtraido: f.docExtraido,
      rawJson: f.rawJson,
    };
  });

  // 7. Calcular saldoInicial, saldoFinal, saldoFinalCalculado y coherencia fila a fila
  const saldoInicialDeclarado =
    input.saldoInicialDeclarado !== undefined && input.saldoInicialDeclarado !== null
      ? normalizarMontoExtracto(String(input.saldoInicialDeclarado), '.')
      : null;

  const saldoFinalDeclarado =
    input.saldoFinalDeclarado !== undefined && input.saldoFinalDeclarado !== null
      ? normalizarMontoExtracto(String(input.saldoFinalDeclarado), '.')
      : null;

  if (
    input.saldoInicialDeclarado !== undefined &&
    input.saldoInicialDeclarado !== null &&
    saldoInicialDeclarado === null
  ) {
    errores.push({
      numFila: null,
      codigo: 'SALDO_INVALIDO',
      campo: 'saldoInicialDeclarado',
      mensaje: 'El saldoInicialDeclarado proporcionado no es un importe válido.',
      valor: String(input.saldoInicialDeclarado),
    });
  }

  if (
    input.saldoFinalDeclarado !== undefined &&
    input.saldoFinalDeclarado !== null &&
    saldoFinalDeclarado === null
  ) {
    errores.push({
      numFila: null,
      codigo: 'SALDO_INVALIDO',
      campo: 'saldoFinalDeclarado',
      mensaje: 'El saldoFinalDeclarado proporcionado no es un importe válido.',
      valor: String(input.saldoFinalDeclarado),
    });
  }

  let saldoInicialDec = Money.create(0);
  if (saldoInicialDeclarado !== null) {
    saldoInicialDec = Money.round(saldoInicialDeclarado);
  } else {
    const primeraConSaldo = filasParseadas.find((f) => f.saldo !== null && f.monto !== null);
    if (primeraConSaldo && primeraConSaldo.saldo !== null && primeraConSaldo.monto !== null) {
      saldoInicialDec = Money.sub(primeraConSaldo.saldo, primeraConSaldo.monto);
    }
  }

  const saldoFinalCalculadoDec = Money.sub(
    Money.add(saldoInicialDec, totalAbonosDec),
    totalCargosDec
  );

  let saldoFinalDec = saldoFinalCalculadoDec;
  if (saldoFinalDeclarado !== null) {
    saldoFinalDec = Money.round(saldoFinalDeclarado);
  } else {
    for (let i = filasParseadas.length - 1; i >= 0; i -= 1) {
      if (filasParseadas[i].saldo !== null) {
        saldoFinalDec = Money.round(filasParseadas[i].saldo!);
        break;
      }
    }
  }

  // Coherencia fila a fila cuando existe columna saldo
  let saldoCorriente = saldoInicialDec;
  for (const f of filasParseadas) {
    if (f.monto === null) {
      continue;
    }
    const esperado = Money.add(saldoCorriente, f.monto);
    if (f.saldo !== null) {
      if (!Money.isEqual(esperado, f.saldo)) {
        errores.push({
          numFila: f.numFila,
          codigo: 'SALDO_INCOHERENTE',
          campo: 'saldo',
          mensaje: `Saldo incoherente en fila ${f.numFila}: esperado ${Money.format(esperado)}, encontrado ${f.saldo}.`,
          valor: f.saldo,
        });
      }
      saldoCorriente = Money.round(f.saldo);
    } else {
      saldoCorriente = esperado;
    }
  }

  const cuadreSaldosValido = Money.isEqual(saldoFinalCalculadoDec, saldoFinalDec);
  if (!cuadreSaldosValido) {
    errores.push({
      numFila: null,
      codigo: 'SALDO_INCOHERENTE',
      campo: 'saldoFinal',
      mensaje: `El saldo final (${Money.format(saldoFinalDec)}) no cuadra con saldo inicial (${Money.format(saldoInicialDec)}) + abonos (${Money.format(totalAbonosDec)}) - cargos (${Money.format(totalCargosDec)}) = ${Money.format(saldoFinalCalculadoDec)}.`,
      valor: Money.format(saldoFinalDec),
    });
  }

  // 8. Fechas corte y continuidad contra el último extracto previo
  const fechasOrdenadas = [...fechasValidas].sort();
  const fechaDesde = fechasOrdenadas.length > 0 ? fechasOrdenadas[0] : null;
  const fechaHasta = fechasOrdenadas.length > 0 ? fechasOrdenadas[fechasOrdenadas.length - 1] : null;

  const advertencias: AdvertenciaImportacion[] = [];
  if (fechaDesde) {
    const prevImportRes = await client.query<{ saldo_final: string }>(
      `SELECT saldo_final::text AS saldo_final
       FROM extracto_import
       WHERE empresa_id = $1
         AND cuenta_financiera_id = $2
         AND estado = 'ACTIVO'
         AND fecha_hasta < $3
       ORDER BY fecha_hasta DESC, created_at DESC
       LIMIT 1`,
      [empresaId, input.cuentaFinancieraId, fechaDesde]
    );

    let saldoAnteriorPrevio: string | null = prevImportRes.rows[0]?.saldo_final ?? null;
    if (saldoAnteriorPrevio === null) {
      const prevLegacyRes = await client.query<{ saldo_final: string }>(
        `SELECT saldo_final::text AS saldo_final
         FROM extractos_bancarios
         WHERE empresa_id = $1
           AND cuenta_financiera_id = $2
           AND estado <> 'ANULADO'
           AND fecha_corte_hasta < $3
         ORDER BY fecha_corte_hasta DESC, created_at DESC
         LIMIT 1`,
        [empresaId, input.cuentaFinancieraId, fechaDesde]
      );
      saldoAnteriorPrevio = prevLegacyRes.rows[0]?.saldo_final ?? null;
    }

    if (saldoAnteriorPrevio !== null && !Money.isEqual(saldoAnteriorPrevio, saldoInicialDec)) {
      advertencias.push({
        codigo: 'CONTINUIDAD_SALDO_ANTERIOR',
        mensaje: `El saldo inicial del archivo (${Money.format(saldoInicialDec)}) difiere del saldo final del extracto anterior (${Money.format(saldoAnteriorPrevio)}).`,
        saldoAnteriorEsperado: Money.format(saldoAnteriorPrevio),
        saldoInicialArchivo: Money.format(saldoInicialDec),
      });
    }
  }

  return {
    valido: errores.length === 0,
    cuentaFinancieraId: input.cuentaFinancieraId,
    periodo: periodoObjetivo,
    fechaDesde,
    fechaHasta,
    nombreArchivo: archivoVal.nombreArchivoNormalizado,
    formatoArchivo: archivoVal.formatoArchivo,
    hashArchivo: archivoVal.hashArchivo,
    tamanoBytes: archivoVal.tamanoBytes,
    perfilAplicadoCodigo: perfilResuelto?.codigo ?? null,
    perfilBancoId: perfilResuelto?.id ?? null,
    saldoInicial: Money.format(saldoInicialDec),
    totalAbonos: Money.format(totalAbonosDec),
    totalCargos: Money.format(totalCargosDec),
    saldoFinal: Money.format(saldoFinalDec),
    saldoFinalCalculado: Money.format(saldoFinalCalculadoDec),
    cuadreSaldosValido,
    totalFilasArchivo: lineas.length,
    filasNuevas,
    filasDuplicadas,
    errores,
    advertencias,
    lineas,
    contentTypeNormalizado: archivoVal.contentTypeNormalizado,
  };
}

function mapImportacionResumenRow(row: any): ImportacionExtractoResumenV2 {
  return {
    id: row.id,
    empresaId: row.empresaId,
    cuentaFinancieraId: row.cuentaFinancieraId,
    extractoBancarioId: row.extractoBancarioId ?? null,
    perfilBancoId: row.perfilBancoId ?? null,
    bancoPerfilCodigo: row.bancoPerfilCodigo ?? null,
    nombreArchivo: row.nombreArchivo,
    formatoArchivo: row.formatoArchivo,
    tamanoBytes: Number(row.tamanoBytes),
    hashArchivo: row.hashArchivo,
    periodo: row.periodo ?? null,
    fechaDesde: row.fechaDesde,
    fechaHasta: row.fechaHasta,
    saldoInicial: Money.format(row.saldoInicial ?? '0'),
    totalAbonos: Money.format(row.totalAbonos ?? '0'),
    totalCargos: Money.format(row.totalCargos ?? '0'),
    saldoFinal: Money.format(row.saldoFinal ?? '0'),
    totalFilasArchivo: Number(row.totalFilasArchivo),
    filasNuevas: Number(row.filasNuevas),
    filasDuplicadas: Number(row.filasDuplicadas),
    estado: row.estado,
    motivoReversion: row.motivoReversion ?? null,
    revertidoPor: row.revertidoPor ?? null,
    revertidoEn: row.revertidoEn ? new Date(row.revertidoEn).toISOString() : null,
    usuarioId: row.usuarioId ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export const importacionExtractoService = {
  generarPlantillaCsvSegura,

  async previsualizarImportacion(
    empresaId: string,
    input: PrevisualizarImportacionInput
  ): Promise<ResultadoPrevisualizacionImportacionV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const res = await previsualizarImportacionEnTx(client, empresaId, input);
      const { contentTypeNormalizado: _, ...dto } = res;
      return dto;
    });
  },

  async confirmarImportacion(
    empresaId: string,
    input: ConfirmarImportacionInput,
    usuarioId: string
  ): Promise<ResultadoConfirmacionImportacionV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(usuarioId, 'usuarioId');

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const prev = await previsualizarImportacionEnTx(client, empresaId, input);

      await verificarPeriodoNoCerradoEnTx(
        client,
        empresaId,
        input.cuentaFinancieraId,
        prev.periodo
      );

      if (!prev.valido || !prev.fechaDesde || !prev.fechaHasta) {
        const soloSaldoIncoherente =
          prev.errores.length > 0 && prev.errores.every((e) => e.codigo === 'SALDO_INCOHERENTE');
        const codigo = soloSaldoIncoherente ? 'SALDO_INCOHERENTE' : 'VALIDACION_EXTRACTO_FALLIDA';
        const resumenErrores = prev.errores
          .slice(0, 5)
          .map((e) => `[${e.codigo}${e.numFila ? ` fila ${e.numFila}` : ''}] ${e.mensaje}`)
          .join(' | ');
        throw new ConciliacionImportacionError(
          400,
          codigo,
          resumenErrores || 'El extracto bancario presenta errores de validación.',
          prev.errores
        );
      }

      // Caso idempotente: todas las líneas ya existían en BD
      if (prev.filasNuevas === 0 && prev.filasDuplicadas > 0) {
        const impExistenteRes = await client.query<{
          id: string;
          extractoBancarioId: string | null;
        }>(
          `SELECT id, extracto_bancario_id AS "extractoBancarioId"
           FROM extracto_import
           WHERE empresa_id = $1
             AND cuenta_financiera_id = $2
             AND hash_archivo = $3
             AND estado = 'ACTIVO'
           ORDER BY created_at DESC
           LIMIT 1`,
          [empresaId, input.cuentaFinancieraId, prev.hashArchivo]
        );

        if (impExistenteRes.rows.length > 0) {
          const existente = impExistenteRes.rows[0];
          return {
            importId: existente.id,
            extractoBancarioId: existente.extractoBancarioId,
            yaExistiaSinNuevas: true,
            hashArchivo: prev.hashArchivo,
            periodo: prev.periodo,
            fechaDesde: prev.fechaDesde,
            fechaHasta: prev.fechaHasta,
            saldoInicial: prev.saldoInicial,
            totalAbonos: prev.totalAbonos,
            totalCargos: prev.totalCargos,
            saldoFinal: prev.saldoFinal,
            totalFilasArchivo: prev.totalFilasArchivo,
            filasNuevas: 0,
            filasDuplicadas: prev.filasDuplicadas,
            estado: 'ACTIVO',
            advertencias: prev.advertencias,
          };
        }

        // Todas las líneas ya existen en BD desde otra importación: registrar cabecera raw sin duplicar extractos_bancarios ni extracto_lineas
        const impRes = await client.query<{ id: string }>(
          `INSERT INTO extracto_import (
             empresa_id, cuenta_financiera_id, extracto_bancario_id,
             perfil_banco_id, banco_perfil_codigo, nombre_archivo, formato_archivo,
             content_type_declarado, tamano_bytes, hash_archivo, periodo,
             fecha_desde, fecha_hasta, saldo_inicial, total_abonos, total_cargos, saldo_final,
             total_filas_archivo, filas_nuevas, filas_duplicadas, estado, usuario_id
           ) VALUES (
             $1, $2, NULL,
             $3, $4, $5, $6,
             $7, $8, $9, $10,
             $11, $12, $13, $14, $15, $16,
             $17, 0, $18, 'ACTIVO', $19
           )
           RETURNING id`,
          [
            empresaId,
            input.cuentaFinancieraId,
            prev.perfilBancoId,
            prev.perfilAplicadoCodigo,
            prev.nombreArchivo,
            prev.formatoArchivo,
            prev.contentTypeNormalizado,
            prev.tamanoBytes,
            prev.hashArchivo,
            prev.periodo,
            prev.fechaDesde,
            prev.fechaHasta,
            prev.saldoInicial,
            prev.totalAbonos,
            prev.totalCargos,
            prev.saldoFinal,
            prev.totalFilasArchivo,
            prev.filasDuplicadas,
            usuarioId,
          ]
        );
        const importId = impRes.rows[0].id;

        for (const linea of prev.lineas) {
          await client.query(
            `INSERT INTO extracto_linea_raw (empresa_id, import_id, num_fila, raw_json, hash_linea, fue_duplicada)
             VALUES ($1, $2, $3, $4::jsonb, $5, TRUE)`,
            [empresaId, importId, linea.numFila, JSON.stringify(linea.rawJson), linea.hashLinea]
          );
        }

        await auditoriaChainService.registrar(
          {
            empresaId,
            usuarioId,
            tablaAfectada: 'extracto_import',
            registroId: importId,
            accion: 'IMPORTAR_EXTRACTO_V2',
            datosNuevos: {
              id: importId,
              cuentaFinancieraId: input.cuentaFinancieraId,
              extractoBancarioId: null,
              nombreArchivo: prev.nombreArchivo,
              formatoArchivo: prev.formatoArchivo,
              hashArchivo: prev.hashArchivo,
              periodo: prev.periodo,
              totalFilasArchivo: prev.totalFilasArchivo,
              filasNuevas: 0,
              filasDuplicadas: prev.filasDuplicadas,
            },
          },
          client
        );

        return {
          importId,
          extractoBancarioId: null,
          yaExistiaSinNuevas: true,
          hashArchivo: prev.hashArchivo,
          periodo: prev.periodo,
          fechaDesde: prev.fechaDesde,
          fechaHasta: prev.fechaHasta,
          saldoInicial: prev.saldoInicial,
          totalAbonos: prev.totalAbonos,
          totalCargos: prev.totalCargos,
          saldoFinal: prev.saldoFinal,
          totalFilasArchivo: prev.totalFilasArchivo,
          filasNuevas: 0,
          filasDuplicadas: prev.filasDuplicadas,
          estado: 'ACTIVO',
          advertencias: prev.advertencias,
        };
      }

      // 1. Upsert seguro en extractos_bancarios (soporta reimportación tras reversión)
      const extRes = await client.query<{ id: string }>(
        `INSERT INTO extractos_bancarios (
           empresa_id, cuenta_financiera_id, nombre_archivo,
           fecha_corte_desde, fecha_corte_hasta, saldo_inicial, saldo_final,
           hash_archivo, estado
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CARGADO')
         ON CONFLICT (empresa_id, cuenta_financiera_id, hash_archivo)
         DO UPDATE SET
           nombre_archivo = EXCLUDED.nombre_archivo,
           fecha_corte_desde = EXCLUDED.fecha_corte_desde,
           fecha_corte_hasta = EXCLUDED.fecha_corte_hasta,
           saldo_inicial = EXCLUDED.saldo_inicial,
           saldo_final = EXCLUDED.saldo_final,
           estado = 'CARGADO'
         RETURNING id`,
        [
          empresaId,
          input.cuentaFinancieraId,
          prev.nombreArchivo,
          prev.fechaDesde,
          prev.fechaHasta,
          prev.saldoInicial,
          prev.saldoFinal,
          prev.hashArchivo,
        ]
      );
      const extractoBancarioId = extRes.rows[0].id;

      // 2. Insertar cabecera de importación
      const impRes = await client.query<{ id: string }>(
        `INSERT INTO extracto_import (
           empresa_id, cuenta_financiera_id, extracto_bancario_id,
           perfil_banco_id, banco_perfil_codigo, nombre_archivo, formato_archivo,
           content_type_declarado, tamano_bytes, hash_archivo, periodo,
           fecha_desde, fecha_hasta, saldo_inicial, total_abonos, total_cargos, saldo_final,
           total_filas_archivo, filas_nuevas, filas_duplicadas, estado, usuario_id
         ) VALUES (
           $1, $2, $3,
           $4, $5, $6, $7,
           $8, $9, $10, $11,
           $12, $13, $14, $15, $16, $17,
           $18, $19, $20, 'ACTIVO', $21
         )
         RETURNING id`,
        [
          empresaId,
          input.cuentaFinancieraId,
          extractoBancarioId,
          prev.perfilBancoId,
          prev.perfilAplicadoCodigo,
          prev.nombreArchivo,
          prev.formatoArchivo,
          prev.contentTypeNormalizado,
          prev.tamanoBytes,
          prev.hashArchivo,
          prev.periodo,
          prev.fechaDesde,
          prev.fechaHasta,
          prev.saldoInicial,
          prev.totalAbonos,
          prev.totalCargos,
          prev.saldoFinal,
          prev.totalFilasArchivo,
          prev.filasNuevas,
          prev.filasDuplicadas,
          usuarioId,
        ]
      );
      const importId = impRes.rows[0].id;

      // 3. Insertar capa raw inmutable (todas las filas) y líneas operativas (solo nuevas)
      for (const linea of prev.lineas) {
        const rawRes = await client.query<{ id: string }>(
          `INSERT INTO extracto_linea_raw (
             empresa_id, import_id, num_fila, raw_json, hash_linea, fue_duplicada
           ) VALUES ($1, $2, $3, $4::jsonb, $5, $6)
           RETURNING id`,
          [
            empresaId,
            importId,
            linea.numFila,
            JSON.stringify(linea.rawJson),
            linea.hashLinea,
            linea.esDuplicada,
          ]
        );
        const lineaRawId = rawRes.rows[0].id;

        if (!linea.esDuplicada) {
          const estadoConciliacion = TIPOS_CARGO_BANCARIO_AUTOMATICO.has(linea.tipoClasificacion)
            ? 'CARGO_BANCARIO_ITF'
            : 'PENDIENTE_LIBROS';

          await client.query(
            `INSERT INTO extracto_lineas (
               extracto_id, empresa_id, fecha, descripcion, referencia,
               monto, saldo, conciliada, estado_conciliacion, hash_linea,
               import_id, linea_raw_id, tipo_clasificacion,
               ruc_extraido, contraparte_extraida, doc_extraido
             ) VALUES (
               $1, $2, $3, $4, $5,
               $6, $7, FALSE, $8, $9,
               $10, $11, $12,
               $13, $14, $15
             )`,
            [
              extractoBancarioId,
              empresaId,
              linea.fecha,
              linea.descripcion,
              linea.referencia,
              linea.monto,
              linea.saldo,
              estadoConciliacion,
              linea.hashLinea,
              importId,
              lineaRawId,
              linea.tipoClasificacion,
              linea.rucExtraido,
              linea.contraparteExtraida,
              linea.docExtraido,
            ]
          );
        }
      }

      // 4. Auditoría transaccional encadenada
      await auditoriaChainService.registrar(
        {
          empresaId,
          usuarioId,
          tablaAfectada: 'extracto_import',
          registroId: importId,
          accion: 'IMPORTAR_EXTRACTO_V2',
          datosNuevos: {
            id: importId,
            cuentaFinancieraId: input.cuentaFinancieraId,
            extractoBancarioId,
            perfilBancoId: prev.perfilBancoId,
            bancoPerfilCodigo: prev.perfilAplicadoCodigo,
            nombreArchivo: prev.nombreArchivo,
            formatoArchivo: prev.formatoArchivo,
            contentTypeDeclarado: prev.contentTypeNormalizado,
            tamanoBytes: prev.tamanoBytes,
            hashArchivo: prev.hashArchivo,
            periodo: prev.periodo,
            fechaDesde: prev.fechaDesde,
            fechaHasta: prev.fechaHasta,
            saldoInicial: prev.saldoInicial,
            totalAbonos: prev.totalAbonos,
            totalCargos: prev.totalCargos,
            saldoFinal: prev.saldoFinal,
            totalFilasArchivo: prev.totalFilasArchivo,
            filasNuevas: prev.filasNuevas,
            filasDuplicadas: prev.filasDuplicadas,
            advertencias: prev.advertencias,
          },
        },
        client
      );

      return {
        importId,
        extractoBancarioId,
        yaExistiaSinNuevas: false,
        hashArchivo: prev.hashArchivo,
        periodo: prev.periodo,
        fechaDesde: prev.fechaDesde,
        fechaHasta: prev.fechaHasta,
        saldoInicial: prev.saldoInicial,
        totalAbonos: prev.totalAbonos,
        totalCargos: prev.totalCargos,
        saldoFinal: prev.saldoFinal,
        totalFilasArchivo: prev.totalFilasArchivo,
        filasNuevas: prev.filasNuevas,
        filasDuplicadas: prev.filasDuplicadas,
        estado: 'ACTIVO',
        advertencias: prev.advertencias,
      };
    });
  },

  async listarImportaciones(
    empresaId: string,
    cuentaFinancieraId?: string
  ): Promise<ImportacionExtractoResumenV2[]> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    if (cuentaFinancieraId) {
      asegurarUuid(cuentaFinancieraId, 'cuentaFinancieraId');
    }

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const params: unknown[] = [empresaId];
      let filtroCuenta = '';
      if (cuentaFinancieraId) {
        params.push(cuentaFinancieraId);
        filtroCuenta = 'AND cuenta_financiera_id = $2';
      }

      const res = await client.query(
        `SELECT id,
                empresa_id AS "empresaId",
                cuenta_financiera_id AS "cuentaFinancieraId",
                extracto_bancario_id AS "extractoBancarioId",
                perfil_banco_id AS "perfilBancoId",
                banco_perfil_codigo AS "bancoPerfilCodigo",
                nombre_archivo AS "nombreArchivo",
                formato_archivo AS "formatoArchivo",
                tamano_bytes AS "tamanoBytes",
                hash_archivo AS "hashArchivo",
                periodo,
                fecha_desde::text AS "fechaDesde",
                fecha_hasta::text AS "fechaHasta",
                saldo_inicial::text AS "saldoInicial",
                total_abonos::text AS "totalAbonos",
                total_cargos::text AS "totalCargos",
                saldo_final::text AS "saldoFinal",
                total_filas_archivo AS "totalFilasArchivo",
                filas_nuevas AS "filasNuevas",
                filas_duplicadas AS "filasDuplicadas",
                estado,
                motivo_reversion AS "motivoReversion",
                revertido_por AS "revertidoPor",
                revertido_en AS "revertidoEn",
                usuario_id AS "usuarioId",
                created_at AS "createdAt"
         FROM extracto_import
         WHERE empresa_id = $1
           ${filtroCuenta}
         ORDER BY created_at DESC`,
        params
      );

      return res.rows.map(mapImportacionResumenRow);
    });
  },

  async revertirImportacion(
    empresaId: string,
    importId: string,
    motivo: string,
    usuarioId: string
  ): Promise<ResultadoReversionImportacionV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(importId, 'importId');
    asegurarUuid(usuarioId, 'usuarioId');

    const motivoLimpio = (motivo ?? '').trim();
    if (motivoLimpio.length < 5) {
      throw new ConciliacionV2Error(
        400,
        'MOTIVO_REVERSION_INVALIDO',
        'El motivo de reversión debe tener al menos 5 caracteres.'
      );
    }

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const impRes = await client.query<{
        id: string;
        cuentaFinancieraId: string;
        extractoBancarioId: string | null;
        periodo: string | null;
        fechaDesde: string;
        estado: string;
        nombreArchivo: string;
      }>(
        `SELECT id,
                cuenta_financiera_id AS "cuentaFinancieraId",
                extracto_bancario_id AS "extractoBancarioId",
                periodo,
                fecha_desde::text AS "fechaDesde",
                estado,
                nombre_archivo AS "nombreArchivo"
         FROM extracto_import
         WHERE empresa_id = $1 AND id = $2
         FOR UPDATE`,
        [empresaId, importId]
      );

      if (impRes.rows.length === 0) {
        throw new ConciliacionV2Error(
          404,
          'IMPORTACION_NO_ENCONTRADA',
          'El lote de importación solicitado no existe para esta empresa.'
        );
      }

      const lote = impRes.rows[0];

      // Serializar operaciones de reversión por cuenta financiera
      await client.query(
        `SELECT id
         FROM cuentas_financieras
         WHERE empresa_id = $1 AND id = $2
         FOR UPDATE`,
        [empresaId, lote.cuentaFinancieraId]
      );

      if (lote.estado === 'REVERTIDO') {
        throw new ConciliacionV2Error(
          409,
          'IMPORTACION_YA_REVERTIDA',
          'Este lote de importación ya fue revertido anteriormente.'
        );
      }

      const periodoVerificar = lote.periodo ?? lote.fechaDesde.slice(0, 7);
      await verificarPeriodoNoCerradoEnTx(
        client,
        empresaId,
        lote.cuentaFinancieraId,
        periodoVerificar
      );

      // Bloquear reversión si alguna línea tiene historial de desconciliación o participa en grupos confirmados/desconciliados
      const historialOGruposRes = await client.query<{ bloqueada: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM extracto_lineas el
           WHERE el.empresa_id = $1
             AND el.import_id = $2
             AND (
               EXISTS (
                 SELECT 1
                 FROM conciliacion_historial_desconciliacion chd
                 WHERE chd.empresa_id = $1
                   AND chd.extracto_linea_id = el.id
               )
               OR EXISTS (
                 SELECT 1
                 FROM conciliacion_item ci
                 JOIN conciliacion_grupo cg
                   ON cg.empresa_id = ci.empresa_id
                  AND cg.id = ci.grupo_id
                 WHERE ci.empresa_id = $1
                   AND ci.extracto_linea_id = el.id
                   AND (
                     cg.estado IN ('CONCILIADO', 'CONCILIADO_MANUAL', 'DESCONCILIADO')
                     OR EXISTS (
                       SELECT 1
                       FROM conciliacion_historial_desconciliacion chd_g
                       WHERE chd_g.empresa_id = $1
                         AND chd_g.grupo_id = cg.id
                     )
                   )
               )
             )
         ) AS bloqueada`,
        [empresaId, importId]
      );

      if (historialOGruposRes.rows[0]?.bloqueada) {
        throw new ConciliacionV2Error(
          409,
          'IMPORTACION_CON_HISTORIAL_CONCILIACION',
          'No se puede revertir la importación porque existen partidas con grupos confirmados o historial de conciliación asociado.'
        );
      }

      // Bloquear reversión si alguna partida del lote ya fue conciliada
      const concilRes = await client.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total
         FROM extracto_lineas
         WHERE empresa_id = $1
           AND import_id = $2
           AND (conciliada = TRUE OR estado_conciliacion IN ('CONCILIADO', 'CONCILIADO_MANUAL'))`,
        [empresaId, importId]
      );

      if (Number(concilRes.rows[0]?.total ?? 0) > 0) {
        throw new ConciliacionV2Error(
          409,
          'IMPORTACION_CON_PARTIDAS_CONCILIADAS',
          'No se puede revertir la importación porque tiene partidas ya conciliadas. Desconcilielas antes de revertir.'
        );
      }

      // Eliminar grupos no confirmados (SUGERIDO / RECHAZADO) vinculados a líneas del lote antes de borrar extracto_lineas
      const gruposNoConfirmadosRes = await client.query<{ id: string; estado: string }>(
        `SELECT cg.id, cg.estado
         FROM conciliacion_grupo cg
         WHERE cg.empresa_id = $1
           AND cg.estado IN ('SUGERIDO', 'RECHAZADO')
           AND EXISTS (
             SELECT 1
             FROM conciliacion_item ci
             JOIN extracto_lineas el
               ON el.empresa_id = ci.empresa_id
              AND el.id = ci.extracto_linea_id
             WHERE ci.empresa_id = cg.empresa_id
               AND ci.grupo_id = cg.id
               AND el.import_id = $2
           )
         ORDER BY cg.id
         FOR UPDATE OF cg`,
        [empresaId, importId]
      );

      let gruposSugeridosEliminados = 0;
      if (gruposNoConfirmadosRes.rows.length > 0) {
        const grupoIds = gruposNoConfirmadosRes.rows.map((r) => r.id);

        const otrasLineasRes = await client.query<{ extractoLineaId: string }>(
          `SELECT DISTINCT ci.extracto_linea_id AS "extractoLineaId"
           FROM conciliacion_item ci
           JOIN extracto_lineas el
             ON el.empresa_id = ci.empresa_id
            AND el.id = ci.extracto_linea_id
           WHERE ci.empresa_id = $1
             AND ci.grupo_id = ANY($2::uuid[])
             AND ci.lado = 'BANCO'
             AND ci.extracto_linea_id IS NOT NULL
             AND el.import_id IS DISTINCT FROM $3`,
          [empresaId, grupoIds, importId]
        );

        const delGruposRes = await client.query(
          `DELETE FROM conciliacion_grupo
           WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
          [empresaId, grupoIds]
        );
        gruposSugeridosEliminados = delGruposRes.rowCount ?? grupoIds.length;

        const otrasLineasIds = otrasLineasRes.rows.map((r) => r.extractoLineaId);
        if (otrasLineasIds.length > 0) {
          await client.query(
            `UPDATE extracto_lineas el
             SET estado_conciliacion = 'PENDIENTE_LIBROS'
             WHERE el.empresa_id = $1
               AND el.id = ANY($2::uuid[])
               AND el.import_id IS DISTINCT FROM $3
               AND el.conciliada = FALSE
               AND el.estado_conciliacion = 'SUGERIDO'
               AND NOT EXISTS (
                 SELECT 1
                 FROM conciliacion_item ci
                 JOIN conciliacion_grupo cg
                   ON cg.empresa_id = ci.empresa_id
                  AND cg.id = ci.grupo_id
                 WHERE ci.empresa_id = el.empresa_id
                   AND ci.lado = 'BANCO'
                   AND ci.extracto_linea_id = el.id
                   AND cg.estado IN ('SUGERIDO', 'CONCILIADO', 'CONCILIADO_MANUAL')
               )`,
            [empresaId, otrasLineasIds, importId]
          );
        }

        await registrarAuditoriaEnTx(client, {
          empresaId,
          usuarioId,
          tablaAfectada: 'conciliacion_grupo',
          registroId: importId,
          accion: 'DELETE_GRUPOS_NO_CONFIRMADOS',
          datosAnteriores: {
            importId,
            gruposEliminados: gruposNoConfirmadosRes.rows,
          },
          datosNuevos: {
            importId,
            gruposSugeridosEliminados,
            grupoIds,
          },
        });
      }

      // Eliminar solo líneas operativas del lote (extracto_linea_raw permanece inmutable)
      const delRes = await client.query(
        `DELETE FROM extracto_lineas
         WHERE empresa_id = $1 AND import_id = $2`,
        [empresaId, importId]
      );
      const filasEliminadas = delRes.rowCount ?? 0;

      const updRes = await client.query<{ revertidoEn: Date }>(
        `UPDATE extracto_import
         SET estado = 'REVERTIDO',
             motivo_reversion = $3,
             revertido_por = $4,
             revertido_en = CURRENT_TIMESTAMP
         WHERE empresa_id = $1 AND id = $2
         RETURNING revertido_en AS "revertidoEn"`,
        [empresaId, importId, motivoLimpio.slice(0, 500), usuarioId]
      );

      let extractoAnulado = false;
      if (lote.extractoBancarioId) {
        const restRes = await client.query<{ tiene: boolean }>(
          `SELECT EXISTS(
             SELECT 1
             FROM extracto_lineas
             WHERE empresa_id = $1 AND extracto_id = $2
           ) AS tiene`,
          [empresaId, lote.extractoBancarioId]
        );
        if (!restRes.rows[0]?.tiene) {
          await client.query(
            `UPDATE extractos_bancarios
             SET estado = 'ANULADO'
             WHERE empresa_id = $1 AND id = $2`,
            [empresaId, lote.extractoBancarioId]
          );
          extractoAnulado = true;
        }
      }

      const revertidoEnIso = new Date(updRes.rows[0].revertidoEn).toISOString();

      await auditoriaChainService.registrar(
        {
          empresaId,
          usuarioId,
          tablaAfectada: 'extracto_import',
          registroId: importId,
          accion: 'REVERTIR_IMPORTACION_EXTRACTO_V2',
          datosAnteriores: {
            id: importId,
            estado: lote.estado,
            nombreArchivo: lote.nombreArchivo,
            extractoBancarioId: lote.extractoBancarioId,
          },
          datosNuevos: {
            id: importId,
            estado: 'REVERTIDO',
            motivoReversion: motivoLimpio.slice(0, 500),
            revertidoPor: usuarioId,
            revertidoEn: revertidoEnIso,
            filasEliminadas,
            extractoAnulado,
          },
        },
        client
      );

      return {
        importId,
        estado: 'REVERTIDO',
        filasEliminadas,
        extractoAnulado,
        motivo: motivoLimpio.slice(0, 500),
        revertidoEn: revertidoEnIso,
      };
    });
  },
};
