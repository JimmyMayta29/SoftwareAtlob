import type Decimal from 'decimal.js';
import {
  OrigenPartidaLibroV2,
  ReglaAprendidaV2,
  TipoMatchV2,
} from '../../../types/conciliacionV2';
import { Money } from '../../../utils/decimal';

const MS_PER_DAY = 86_400_000;
const FECHA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const STOPWORDS = new Set([
  'DE',
  'DEL',
  'LA',
  'LAS',
  'EL',
  'LOS',
  'Y',
  'EN',
  'POR',
  'PARA',
  'CON',
  'A',
  'AL',
  'SAC',
  'SRL',
  'SA',
  'SAA',
  'EIRL',
  'PAGO',
  'ABONO',
  'CARGO',
  'TRANSFERENCIA',
  'TRANSF',
  'OPERACION',
  'OP',
  'DEPOSITO',
  'DEP',
  'CTA',
  'CTE',
  'BCO',
  'BANCO',
  'FACTURA',
  'FAC',
  'BOLETA',
  'BOL',
  'NRO',
  'NUM',
  'REF',
  'SOLES',
  'USD',
  'PEN',
  'CCI',
]);

const REFERENCIAS_VACIAS = new Set(['', '-', '--', '0', '00', '000', '0000', 'SN', 'S/N', 'NA', 'N/A', 'NINGUNO', 'NONE']);

export interface PartidaBancoMatching {
  id: string;
  fecha: string;
  monto: string;
  referencia: string | null;
  descripcion: string;
  rucExtraido?: string | null;
  contraparteExtraida?: string | null;
  docExtraido?: string | null;
}

export interface PartidaLibroMatching {
  id: string;
  origenLibro: OrigenPartidaLibroV2;
  asientoId: string | null;
  asientoDetalleId: string | null;
  fecha: string;
  importeConSigno: string;
  numeroOperacion: string | null;
  glosa: string;
  anexoId?: string | null;
  anexoNombre?: string | null;
  anexoRuc?: string | null;
  docRef?: string | null;
}

export interface ReglaAprendidaMatching {
  id: string;
  patronContraparte: string;
  rucContraparte: string | null;
  anexoId: string | null;
  cuentaContableId?: string | null;
  tipoClasificacion?: string | null;
  usosConfirmados: number;
  activo: boolean;
}

export interface ParametrosMatching {
  toleranciaDias?: number;
  toleranciaMonto?: string | number | Decimal;
  umbralAutoMatch?: number;
  maxElementosGrupo?: number;
  maxCombinacionesPorAncla?: number;
  maxCandidatosVentana?: number;
}

export interface EjecutarMatchingEngineInput {
  partidasBanco: PartidaBancoMatching[];
  partidasLibro: PartidaLibroMatching[];
  reglasAprendidas?: Array<ReglaAprendidaMatching | ReglaAprendidaV2>;
  parametros?: ParametrosMatching;
}

export interface GrupoCandidatoMatching {
  tipoMatch: TipoMatchV2;
  reglaAplicada: string;
  capaMatching: 1 | 2 | 3 | 4;
  score: number;
  estado: 'CONCILIADO' | 'SUGERIDO';
  diferenciaMonto: string;
  observacion: string;
  itemsBanco: Array<{
    partida: PartidaBancoMatching;
    montoImputado: string;
  }>;
  itemsLibro: Array<{
    partida: PartidaLibroMatching;
    montoImputado: string;
  }>;
}

export interface ResultadoMotorMatching {
  grupos: GrupoCandidatoMatching[];
  estadisticas: {
    autoConciliados: number;
    sugeridos: number;
    pendientesBancoRestantes: number;
    pendientesLibroRestantes: number;
    diferenciaPendiente: string;
  };
}

interface BancoNormalizado {
  raw: PartidaBancoMatching;
  montoDec: Decimal;
  cent: bigint;
  magCent: bigint;
  sign: 1 | -1;
  fechaDias: number;
  opKeys: string[];
  opExactKeys: string[];
  docKeys: string[];
  tokens: Set<string>;
  textoNorm: string;
  ruc: string | null;
  contraparteNorm: string;
}

interface LibroNormalizado {
  raw: PartidaLibroMatching;
  uniqueKey: string;
  montoDec: Decimal;
  cent: bigint;
  magCent: bigint;
  sign: 1 | -1;
  fechaDias: number;
  opKeys: string[];
  opExactKeys: string[];
  docKeys: string[];
  tokens: Set<string>;
  textoNorm: string;
  ruc: string | null;
  anexoId: string | null;
  anexoNombreNorm: string;
}

interface ReglaNormalizada {
  id: string;
  patronNorm: string;
  patronTokens: Set<string>;
  ruc: string | null;
  anexoId: string | null;
  usosConfirmados: number;
}

interface EvaluacionCapa2 {
  banco: BancoNormalizado;
  libro: LibroNormalizado;
  score: number;
  absDifCent: bigint;
  difDias: number;
  motivos: string[];
}

function clampScore(valor: number, min = 0, max = 1): number {
  const acotado = Math.max(min, Math.min(max, valor));
  return Number(acotado.toFixed(4));
}

function parsearFechaEpochDias(fecha: string): number {
  if (!FECHA_ISO_REGEX.test(fecha)) {
    return 0;
  }
  const [y, m, d] = fecha.split('-').map((n) => Number(n));
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

function toCentavosBigInt(dec: Decimal): bigint {
  return BigInt(Money.round(dec).mul(100).toFixed(0));
}

function absBigInt(v: bigint): bigint {
  return v < 0n ? -v : v;
}

export function normalizarTextoMatching(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extraerTokensSignificativos(texto: string | null | undefined): Set<string> {
  const norm = normalizarTextoMatching(texto);
  if (!norm) return new Set();
  const tokens = norm.split(' ');
  const out = new Set<string>();
  for (const tk of tokens) {
    if (tk.length < 3) continue;
    if (STOPWORDS.has(tk)) continue;
    out.add(tk);
  }
  return out;
}

function construirClavesOperacion(valor: string | null | undefined): {
  exactas: string[];
  normalizadas: string[];
} {
  const trimmed = (valor ?? '').trim().toUpperCase();
  if (!trimmed || REFERENCIAS_VACIAS.has(trimmed)) {
    return { exactas: [], normalizadas: [] };
  }

  const sinEspacios = trimmed.replace(/\s+/g, '');
  if (!sinEspacios || REFERENCIAS_VACIAS.has(sinEspacios)) {
    return { exactas: [], normalizadas: [] };
  }

  const exactas = new Set<string>([sinEspacios]);
  const normalizadas = new Set<string>([sinEspacios]);

  const alfanum = sinEspacios.replace(/[^A-Z0-9]/g, '');
  if (alfanum.length >= 2 && !REFERENCIAS_VACIAS.has(alfanum)) {
    normalizadas.add(alfanum);
    exactas.add(alfanum);
  }

  // Ceros a la izquierda cuando la referencia es numérica (>= 2 dígitos).
  if (/^\d{2,}$/.test(alfanum)) {
    const sinCeros = alfanum.replace(/^0+/, '');
    if (sinCeros.length >= 2) {
      normalizadas.add(`NUM:${sinCeros}`);
    }
  } else {
    // Prefijo alfabético seguido de número (ej. OP-000123 -> OP123 y NUM:123 si >= 3 dígitos)
    const matchPref = alfanum.match(/^(?:OP|REF|NRO|TRF|CHQ)?0*(\d{3,})$/);
    if (matchPref) {
      normalizadas.add(`NUM:${matchPref[1]}`);
    }
  }

  return {
    exactas: Array.from(exactas),
    normalizadas: Array.from(normalizadas),
  };
}

function construirClavesDocumento(valor: string | null | undefined): string[] {
  const trimmed = (valor ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!trimmed || REFERENCIAS_VACIAS.has(trimmed)) {
    return [];
  }

  const claves = new Set<string>();
  const alfanum = trimmed.replace(/[^A-Z0-9]/g, '');
  if (alfanum.length >= 3) {
    claves.add(alfanum);
  }

  // Formato SUNAT opcional tipoDoc-Serie-Numero: ej. 01-F001-000123 vs F001-000123 vs F001-123
  const matchSunat = trimmed.match(/^(?:\d{2}-)?([A-Z0-9]{4})-0*(\d{1,12})$/);
  if (matchSunat) {
    claves.add(`${matchSunat[1]}${matchSunat[2]}`);
    claves.add(`${matchSunat[1]}-${matchSunat[2].padStart(6, '0')}`);
  }

  return Array.from(claves);
}

function jaccardTokens(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let interseccion = 0;
  for (const item of a) {
    if (b.has(item)) interseccion += 1;
  }
  if (interseccion === 0) return 0;
  const union = a.size + b.size - interseccion;
  return interseccion / union;
}

function overlapTokens(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let interseccion = 0;
  for (const item of a) {
    if (b.has(item)) interseccion += 1;
  }
  return interseccion / Math.min(a.size, b.size);
}

function normalizarReglaAprendida(
  regla: ReglaAprendidaMatching | ReglaAprendidaV2
): ReglaNormalizada | null {
  if (!regla.activo) return null;
  const patronNorm = normalizarTextoMatching(regla.patronContraparte);
  const ruc = regla.rucContraparte?.trim() || null;
  if (!patronNorm && !ruc) return null;
  return {
    id: regla.id,
    patronNorm,
    patronTokens: extraerTokensSignificativos(regla.patronContraparte),
    ruc,
    anexoId: regla.anexoId ?? null,
    usosConfirmados: Math.max(1, Number(regla.usosConfirmados || 1)),
  };
}

function buscarReglasCoincidentesBanco(
  banco: BancoNormalizado,
  reglas: ReglaNormalizada[]
): ReglaNormalizada[] {
  const coincidentes: ReglaNormalizada[] = [];
  for (const regla of reglas) {
    const rucMatch = Boolean(regla.ruc && banco.ruc && regla.ruc === banco.ruc);
    const patronEnContraparte =
      Boolean(regla.patronNorm) &&
      (banco.contraparteNorm.includes(regla.patronNorm) || banco.textoNorm.includes(regla.patronNorm));
    const patronPorTokens =
      regla.patronTokens.size >= 2 && overlapTokens(regla.patronTokens, banco.tokens) >= 0.8;

    if (rucMatch || patronEnContraparte || patronPorTokens) {
      coincidentes.push(regla);
    }
  }
  return coincidentes;
}

function reglaVinculaLibro(regla: ReglaNormalizada, libro: LibroNormalizado): boolean {
  if (regla.anexoId && libro.anexoId && regla.anexoId === libro.anexoId) {
    return true;
  }
  if (regla.ruc && libro.ruc && regla.ruc === libro.ruc) {
    return true;
  }
  if (
    regla.patronNorm &&
    (libro.anexoNombreNorm.includes(regla.patronNorm) || libro.textoNorm.includes(regla.patronNorm))
  ) {
    return true;
  }
  return false;
}

function lowerBoundByCent(arr: LibroNormalizado[], targetCent: bigint): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid].cent < targetCent) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBoundByCent(arr: LibroNormalizado[], targetCent: bigint): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid].cent <= targetCent) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function lowerBoundByFecha<T extends { fechaDias: number }>(arr: T[], minDias: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid].fechaDias < minDias) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBoundByFecha<T extends { fechaDias: number }>(arr: T[], maxDias: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid].fechaDias <= maxDias) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

interface SubconjuntoResultado<T> {
  items: T[];
  sumMagCent: bigint;
  absDifCent: bigint;
  avgDifDias: number;
  hasCounterparty: boolean;
  score: number;
}

function buscarSubconjuntosAcotados<T extends {
  magCent: bigint;
  fechaDias: number;
  ruc: string | null;
  tokens: Set<string>;
}>(params: {
  anchorFechaDias: number;
  anchorRuc: string | null;
  anchorTokens: Set<string>;
  targetMagCent: bigint;
  toleranciaCent: bigint;
  toleranciaDias: number;
  candidatos: T[];
  maxElementos: number;
  maxCombinaciones: number;
}): { mejor: SubconjuntoResultado<T> | null; empatado: boolean } {
  const {
    anchorFechaDias,
    anchorRuc,
    anchorTokens,
    targetMagCent,
    toleranciaCent,
    toleranciaDias,
    candidatos,
    maxElementos,
    maxCombinaciones,
  } = params;

  if (candidatos.length < 2) {
    return { mejor: null, empatado: false };
  }

  const n = candidatos.length;
  const maxSum = targetMagCent + toleranciaCent;
  const minSum = targetMagCent > toleranciaCent ? targetMagCent - toleranciaCent : 1n;

  // Suma sufija para poda O(1) en backtracking
  const suffixSum = new Array<bigint>(n + 1).fill(0n);
  for (let i = n - 1; i >= 0; i -= 1) {
    suffixSum[i] = suffixSum[i + 1] + candidatos[i].magCent;
  }

  if (suffixSum[0] < minSum) {
    return { mejor: null, empatado: false };
  }

  let evaluaciones = 0;
  let visitas = 0;
  const maxVisitas = maxCombinaciones * 12;
  const soluciones: SubconjuntoResultado<T>[] = [];
  const picked: T[] = [];

  function dfs(idx: number, sumaActual: bigint): void {
    if (evaluaciones >= maxCombinaciones || visitas >= maxVisitas) {
      return;
    }
    visitas += 1;

    if (picked.length >= 2) {
      evaluaciones += 1;
      if (sumaActual >= minSum && sumaActual <= maxSum) {
        const absDifCent = absBigInt(sumaActual - targetMagCent);
        let sumDias = 0;
        let hasCounterparty = false;
        for (const item of picked) {
          sumDias += Math.abs(item.fechaDias - anchorFechaDias);
          if (
            (anchorRuc && item.ruc && anchorRuc === item.ruc) ||
            overlapTokens(anchorTokens, item.tokens) >= 0.5
          ) {
            hasCounterparty = true;
          }
        }
        const avgDifDias = sumDias / picked.length;

        let score: number;
        if (absDifCent === 0n) {
          score = 0.9;
          if (avgDifDias <= 1 || (toleranciaDias > 0 && avgDifDias <= toleranciaDias / 2)) {
            score += 0.01;
          }
          if (hasCounterparty) {
            score += 0.01;
          }
          score = clampScore(score, 0.9, 0.92);
        } else {
          score = 0.87;
          if (absDifCent <= 5n) score += 0.01;
          if (avgDifDias <= 1) score += 0.01;
          if (hasCounterparty) score += 0.01;
          score = clampScore(score, 0.85, 0.9);
        }

        soluciones.push({
          items: [...picked],
          sumMagCent: sumaActual,
          absDifCent,
          avgDifDias,
          hasCounterparty,
          score,
        });
      }
    }

    if (picked.length >= maxElementos || idx >= n) {
      return;
    }

    // Poda por cota inferior
    if (sumaActual + suffixSum[idx] < minSum) {
      return;
    }

    for (let i = idx; i < n; i += 1) {
      if (evaluaciones >= maxCombinaciones || visitas >= maxVisitas) {
        break;
      }
      if (sumaActual + suffixSum[i] < minSum) {
        break;
      }
      const nextSum = sumaActual + candidatos[i].magCent;
      if (nextSum > maxSum) {
        continue;
      }
      picked.push(candidatos[i]);
      dfs(i + 1, nextSum);
      picked.pop();
    }
  }

  dfs(0, 0n);

  if (soluciones.length === 0) {
    return { mejor: null, empatado: false };
  }

  soluciones.sort((a, b) => {
    if (a.absDifCent !== b.absDifCent) return a.absDifCent < b.absDifCent ? -1 : 1;
    if (a.score !== b.score) return b.score - a.score;
    if (a.items.length !== b.items.length) return a.items.length - b.items.length;
    return a.avgDifDias - b.avgDifDias;
  });

  const mejor = soluciones[0];
  const segundo = soluciones[1];
  const empatado = Boolean(
    segundo &&
      segundo.absDifCent === mejor.absDifCent &&
      segundo.score === mejor.score &&
      segundo.items.length === mejor.items.length &&
      Math.abs(segundo.avgDifDias - mejor.avgDifDias) < 0.001
  );

  return { mejor, empatado };
}

/**
 * Motor determinista de conciliación bancaria de 4 capas (1:1, 1:N, N:1 y fuzzy con explicabilidad).
 * 100% puro, sin acceso a base de datos y sin aritmética flotante monetaria (usa `Money` + `BigInt` en centavos).
 */
export function ejecutarMotorMatching(input: EjecutarMatchingEngineInput): ResultadoMotorMatching {
  const toleranciaDias = Math.max(0, Math.trunc(input.parametros?.toleranciaDias ?? 3));
  const toleranciaDec = Money.round(input.parametros?.toleranciaMonto ?? '0.00').abs();
  const toleranciaCent = toCentavosBigInt(toleranciaDec);
  const umbralRaw = input.parametros?.umbralAutoMatch ?? 0.9;
  const umbralAutoMatch = clampScore(umbralRaw, 0.6, 1.0);
  const maxElementosGrupo = Math.max(2, Math.min(10, Math.trunc(input.parametros?.maxElementosGrupo ?? 6)));
  const maxCombinacionesPorAncla = Math.max(
    10,
    Math.min(1000, Math.trunc(input.parametros?.maxCombinacionesPorAncla ?? 200))
  );
  const maxCandidatosVentana = Math.max(
    2,
    Math.min(100, Math.trunc(input.parametros?.maxCandidatosVentana ?? 25))
  );

  const reglasNorm: ReglaNormalizada[] = (input.reglasAprendidas ?? [])
    .map(normalizarReglaAprendida)
    .filter((r): r is ReglaNormalizada => r !== null)
    .sort((a, b) => a.id.localeCompare(b.id));

  const bancos: BancoNormalizado[] = input.partidasBanco
    .map((b) => {
      const montoDec = Money.round(b.monto);
      const cent = toCentavosBigInt(montoDec);
      const opRef = construirClavesOperacion(b.referencia);
      const docClaves = construirClavesDocumento(b.docExtraido);
      const docDesdeRef = construirClavesDocumento(b.referencia);
      const contraparteNorm = normalizarTextoMatching(b.contraparteExtraida);
      const textoNorm = normalizarTextoMatching(`${b.contraparteExtraida ?? ''} ${b.descripcion}`);

      return {
        raw: { ...b, monto: Money.format(montoDec) },
        montoDec,
        cent,
        magCent: absBigInt(cent),
        sign: (cent >= 0n ? 1 : -1) as 1 | -1,
        fechaDias: parsearFechaEpochDias(b.fecha),
        opKeys: opRef.normalizadas,
        opExactKeys: opRef.exactas,
        docKeys: Array.from(new Set([...docClaves, ...docDesdeRef])),
        tokens: extraerTokensSignificativos(`${b.contraparteExtraida ?? ''} ${b.descripcion}`),
        textoNorm,
        ruc: b.rucExtraido?.trim() || null,
        contraparteNorm,
      };
    })
    .filter((b) => b.cent !== 0n)
    .sort((a, b) => a.fechaDias - b.fechaDias || a.raw.id.localeCompare(b.raw.id));

  const libros: LibroNormalizado[] = input.partidasLibro
    .map((l) => {
      const montoDec = Money.round(l.importeConSigno);
      const cent = toCentavosBigInt(montoDec);
      const opNum = construirClavesOperacion(l.numeroOperacion);
      const docClaves = construirClavesDocumento(l.docRef);
      const docDesdeOp = construirClavesDocumento(l.numeroOperacion);
      const anexoNombreNorm = normalizarTextoMatching(l.anexoNombre);
      const textoNorm = normalizarTextoMatching(`${l.anexoNombre ?? ''} ${l.glosa}`);

      return {
        raw: { ...l, importeConSigno: Money.format(montoDec) },
        uniqueKey: `${l.origenLibro}:${l.id}`,
        montoDec,
        cent,
        magCent: absBigInt(cent),
        sign: (cent >= 0n ? 1 : -1) as 1 | -1,
        fechaDias: parsearFechaEpochDias(l.fecha),
        opKeys: opNum.normalizadas,
        opExactKeys: opNum.exactas,
        docKeys: Array.from(new Set([...docClaves, ...docDesdeOp])),
        tokens: extraerTokensSignificativos(`${l.anexoNombre ?? ''} ${l.glosa}`),
        textoNorm,
        ruc: l.anexoRuc?.trim() || null,
        anexoId: l.anexoId ?? null,
        anexoNombreNorm,
      };
    })
    .filter((l) => l.cent !== 0n)
    .sort((a, b) => a.fechaDias - b.fechaDias || a.uniqueKey.localeCompare(b.uniqueKey));

  const usedBanco = new Set<string>();
  const usedLibro = new Set<string>();
  const grupos: GrupoCandidatoMatching[] = [];

  const marcarConsumidos = (grupo: GrupoCandidatoMatching): void => {
    for (const ib of grupo.itemsBanco) usedBanco.add(ib.partida.id);
    for (const il of grupo.itemsLibro) usedLibro.add(`${il.partida.origenLibro}:${il.partida.id}`);
  };

  // ============================================================================
  // CAPA 1 (1:1): N° operación / documento + mismo signo + monto + ventana
  // ============================================================================
  const indiceLibroOp = new Map<string, LibroNormalizado[]>();
  const indiceLibroDoc = new Map<string, LibroNormalizado[]>();
  for (const l of libros) {
    for (const k of l.opKeys) {
      const lista = indiceLibroOp.get(k);
      if (lista) lista.push(l);
      else indiceLibroOp.set(k, [l]);
    }
    for (const d of l.docKeys) {
      const lista = indiceLibroDoc.get(d);
      if (lista) lista.push(l);
      else indiceLibroDoc.set(d, [l]);
    }
  }

  for (const b of bancos) {
    if (usedBanco.has(b.raw.id)) continue;
    if (b.opKeys.length === 0 && b.docKeys.length === 0) continue;

    const candidatosMap = new Map<
      string,
      {
        libro: LibroNormalizado;
        coincidenciaExacta: boolean;
        tipoClave: string;
        absDifCent: bigint;
        difDias: number;
      }
    >();

    const evaluarCandidatoCapa1 = (
      l: LibroNormalizado,
      coincidenciaExacta: boolean,
      tipoClave: string
    ): void => {
      if (usedLibro.has(l.uniqueKey)) return;
      if (l.sign !== b.sign) return;
      const absDifCent = absBigInt(b.cent - l.cent);
      if (absDifCent > toleranciaCent) return;

      const difDias = Math.abs(b.fechaDias - l.fechaDias);
      const maxDiasCapa1 = coincidenciaExacta ? Math.max(toleranciaDias, 7) : toleranciaDias;
      if (difDias > maxDiasCapa1) return;

      const prev = candidatosMap.get(l.uniqueKey);
      if (!prev || (coincidenciaExacta && !prev.coincidenciaExacta)) {
        candidatosMap.set(l.uniqueKey, {
          libro: l,
          coincidenciaExacta,
          tipoClave,
          absDifCent,
          difDias,
        });
      }
    };

    for (const k of b.opKeys) {
      const lista = indiceLibroOp.get(k);
      if (!lista) continue;
      const esExacta = b.opExactKeys.includes(k);
      for (const l of lista) {
        const esExactaMutua = esExacta && l.opExactKeys.includes(k);
        evaluarCandidatoCapa1(l, esExactaMutua, `N° operación (${k})`);
      }
    }

    for (const d of b.docKeys) {
      const lista = indiceLibroDoc.get(d);
      if (!lista) continue;
      for (const l of lista) {
        evaluarCandidatoCapa1(l, true, `documento (${d})`);
      }
    }

    const candidatos = Array.from(candidatosMap.values()).sort(
      (x, y) =>
        (x.absDifCent < y.absDifCent ? -1 : x.absDifCent > y.absDifCent ? 1 : 0) ||
        x.difDias - y.difDias ||
        (x.coincidenciaExacta === y.coincidenciaExacta ? 0 : x.coincidenciaExacta ? -1 : 1) ||
        x.libro.uniqueKey.localeCompare(y.libro.uniqueKey)
    );

    if (candidatos.length === 0) continue;

    const best = candidatos[0];
    const empatados = candidatos.filter(
      (c) => c.absDifCent === best.absDifCent && c.difDias === best.difDias
    );

    const difDec = Money.sub(b.montoDec, best.libro.montoDec);
    if (!difDec.abs().lte(toleranciaDec)) continue;

    if (empatados.length > 1) {
      const scoreSugerido = Math.min(0.88, clampScore(umbralAutoMatch - 0.02, 0.6, 0.89));
      const grupo: GrupoCandidatoMatching = {
        tipoMatch: '1:1',
        reglaAplicada: 'CAPA_1_OPERACION_MONTO_AMBIGUO',
        capaMatching: 1,
        score: scoreSugerido,
        estado: 'SUGERIDO',
        diferenciaMonto: Money.format(difDec),
        observacion: `Coincidencia por ${best.tipoClave} con ${empatados.length} candidatos de libro empatados en monto y fecha (${best.difDias} día(s)); requiere confirmación manual.`,
        itemsBanco: [{ partida: b.raw, montoImputado: Money.format(b.montoDec) }],
        itemsLibro: [{ partida: best.libro.raw, montoImputado: Money.format(best.libro.montoDec) }],
      };
      grupos.push(grupo);
      marcarConsumidos(grupo);
      continue;
    }

    const score = best.absDifCent === 0n ? 1.0 : 0.99;
    const estado: 'CONCILIADO' | 'SUGERIDO' = score >= umbralAutoMatch ? 'CONCILIADO' : 'SUGERIDO';
    const grupo: GrupoCandidatoMatching = {
      tipoMatch: '1:1',
      reglaAplicada: 'CAPA_1_OPERACION_MONTO',
      capaMatching: 1,
      score,
      estado,
      diferenciaMonto: Money.format(difDec),
      observacion: `Coincidencia exacta por ${best.tipoClave}, mismo signo, diferencia ${Money.format(difDec)} y ${best.difDias} día(s) de desfase.`,
      itemsBanco: [{ partida: b.raw, montoImputado: Money.format(b.montoDec) }],
      itemsLibro: [{ partida: best.libro.raw, montoImputado: Money.format(best.libro.montoDec) }],
    };
    grupos.push(grupo);
    marcarConsumidos(grupo);
  }

  // ============================================================================
  // CAPA 2 (1:1): Monto + ventana de días + contraparte / RUC / regla aprendida
  // ============================================================================
  const librosRestantesCapa2 = libros
    .filter((l) => !usedLibro.has(l.uniqueKey))
    .sort((a, b) => (a.cent < b.cent ? -1 : a.cent > b.cent ? 1 : a.fechaDias - b.fechaDias));

  const evaluacionesPorBanco = new Map<string, EvaluacionCapa2[]>();
  const conteoTopLibro = new Map<string, number>();

  for (const b of bancos) {
    if (usedBanco.has(b.raw.id)) continue;

    const loIdx = lowerBoundByCent(librosRestantesCapa2, b.cent - toleranciaCent);
    const hiIdx = upperBoundByCent(librosRestantesCapa2, b.cent + toleranciaCent);
    if (loIdx >= hiIdx) continue;

    const reglasBanco = buscarReglasCoincidentesBanco(b, reglasNorm);
    const matches: EvaluacionCapa2[] = [];

    for (let i = loIdx; i < hiIdx; i += 1) {
      const l = librosRestantesCapa2[i];
      if (l.sign !== b.sign) continue;
      const difDias = Math.abs(b.fechaDias - l.fechaDias);
      if (difDias > toleranciaDias) continue;

      const absDifCent = absBigInt(b.cent - l.cent);
      if (absDifCent > toleranciaCent) continue;

      const rucMatch = Boolean(b.ruc && l.ruc && b.ruc === l.ruc);
      const reglaVinculada = reglasBanco.find((r) => reglaVinculaLibro(r, l)) ?? null;
      const ovTokens = overlapTokens(b.tokens, l.tokens);
      const jaccTokens = jaccardTokens(b.tokens, l.tokens);
      const subContraparte =
        Boolean(b.contraparteNorm && b.contraparteNorm.length >= 4) &&
        (l.anexoNombreNorm.includes(b.contraparteNorm) ||
          l.textoNorm.includes(b.contraparteNorm) ||
          (l.anexoNombreNorm.length >= 4 && b.textoNorm.includes(l.anexoNombreNorm)));

      if (!rucMatch && !reglaVinculada && ovTokens < 0.34 && !subContraparte) {
        continue;
      }

      let score = 0.9;
      const motivos: string[] = [];

      if (rucMatch) {
        score += 0.05;
        motivos.push(`RUC coincidente (${b.ruc})`);
      }
      if (reglaVinculada) {
        score += 0.04;
        motivos.push(`regla aprendida "${reglaVinculada.patronNorm}"`);
      }
      if (subContraparte || ovTokens >= 0.34) {
        const pesoTexto = Math.max(ovTokens, subContraparte ? 0.8 : 0, jaccTokens);
        score += pesoTexto * 0.03;
        motivos.push('contraparte/glosa compatible');
      }
      if (toleranciaDias > 0) {
        score += (1 - difDias / Math.max(1, toleranciaDias)) * 0.015;
      } else {
        score += 0.015;
      }
      if (absDifCent === 0n) {
        score += 0.01;
      }

      matches.push({
        banco: b,
        libro: l,
        score: clampScore(score, 0.9, 0.98),
        absDifCent,
        difDias,
        motivos,
      });
    }

    if (matches.length === 0) continue;

    matches.sort(
      (x, y) =>
        y.score - x.score ||
        (x.absDifCent < y.absDifCent ? -1 : x.absDifCent > y.absDifCent ? 1 : 0) ||
        x.difDias - y.difDias ||
        x.libro.uniqueKey.localeCompare(y.libro.uniqueKey)
    );

    evaluacionesPorBanco.set(b.raw.id, matches);

    const top = matches[0];
    for (const m of matches) {
      if (m.score === top.score && m.absDifCent === top.absDifCent) {
        const key = `${m.libro.uniqueKey}|${b.cent.toString()}`;
        conteoTopLibro.set(key, (conteoTopLibro.get(key) ?? 0) + 1);
      }
    }
  }

  for (const b of bancos) {
    if (usedBanco.has(b.raw.id)) continue;
    const matches = evaluacionesPorBanco.get(b.raw.id);
    if (!matches || matches.length === 0) continue;

    const disponibles = matches.filter((m) => !usedLibro.has(m.libro.uniqueKey));
    if (disponibles.length === 0) continue;

    const best = disponibles[0];
    const empatadosLibro = matches.filter(
      (m) => m.score === best.score && m.absDifCent === best.absDifCent
    );
    const keyConteo = `${best.libro.uniqueKey}|${b.cent.toString()}`;
    const colisionDesdeBanco = (conteoTopLibro.get(keyConteo) ?? 0) > 1;
    const esAmbiguo = empatadosLibro.length > 1 || colisionDesdeBanco;

    const difDec = Money.sub(b.montoDec, best.libro.montoDec);
    if (!difDec.abs().lte(toleranciaDec)) continue;

    if (esAmbiguo) {
      const scoreAmbiguo = Math.min(0.85, clampScore(umbralAutoMatch - 0.05, 0.6, 0.89));
      const grupo: GrupoCandidatoMatching = {
        tipoMatch: '1:1',
        reglaAplicada: 'CAPA_2_AMBIGUO_DUPLICADO',
        capaMatching: 2,
        score: scoreAmbiguo,
        estado: 'SUGERIDO',
        diferenciaMonto: Money.format(difDec),
        observacion: `Múltiples candidatos con monto idéntico en ventana de ${toleranciaDias} día(s) (${best.motivos.join(', ')}); requiere confirmación manual.`,
        itemsBanco: [{ partida: b.raw, montoImputado: Money.format(b.montoDec) }],
        itemsLibro: [{ partida: best.libro.raw, montoImputado: Money.format(best.libro.montoDec) }],
      };
      grupos.push(grupo);
      marcarConsumidos(grupo);
      continue;
    }

    const estado: 'CONCILIADO' | 'SUGERIDO' =
      best.score >= umbralAutoMatch ? 'CONCILIADO' : 'SUGERIDO';
    const grupo: GrupoCandidatoMatching = {
      tipoMatch: '1:1',
      reglaAplicada: 'CAPA_2_MONTO_VENTANA_CONTRAPARTE',
      capaMatching: 2,
      score: best.score,
      estado,
      diferenciaMonto: Money.format(difDec),
      observacion: `Coincidencia en ventana (${best.difDias} día(s)) por monto y ${best.motivos.join(' + ')}.`,
      itemsBanco: [{ partida: b.raw, montoImputado: Money.format(b.montoDec) }],
      itemsLibro: [{ partida: best.libro.raw, montoImputado: Money.format(best.libro.montoDec) }],
    };
    grupos.push(grupo);
    marcarConsumidos(grupo);
  }

  // ============================================================================
  // CAPA 3 (1:N y N:1): Suma acotada determinista en centavos (BigInt) + Money
  // ============================================================================
  const librosRestantesFecha = libros
    .filter((l) => !usedLibro.has(l.uniqueKey))
    .sort((a, b) => a.fechaDias - b.fechaDias || a.uniqueKey.localeCompare(b.uniqueKey));

  // 3A. 1:N (1 banco vs 2..maxElementosGrupo libro)
  for (const b of bancos) {
    if (usedBanco.has(b.raw.id)) continue;

    const loIdx = lowerBoundByFecha(librosRestantesFecha, b.fechaDias - toleranciaDias);
    const hiIdx = upperBoundByFecha(librosRestantesFecha, b.fechaDias + toleranciaDias);
    if (hiIdx - loIdx < 2) continue;

    const candidatos = librosRestantesFecha
      .slice(loIdx, hiIdx)
      .filter(
        (l) =>
          !usedLibro.has(l.uniqueKey) &&
          l.sign === b.sign &&
          l.magCent < b.magCent + toleranciaCent
      )
      .sort((x, y) => {
        const dx = Math.abs(x.fechaDias - b.fechaDias);
        const dy = Math.abs(y.fechaDias - b.fechaDias);
        if (dx !== dy) return dx - dy;
        if (x.magCent !== y.magCent) return x.magCent > y.magCent ? -1 : 1;
        return x.uniqueKey.localeCompare(y.uniqueKey);
      })
      .slice(0, maxCandidatosVentana);

    if (candidatos.length < 2) continue;

    const { mejor, empatado } = buscarSubconjuntosAcotados({
      anchorFechaDias: b.fechaDias,
      anchorRuc: b.ruc,
      anchorTokens: b.tokens,
      targetMagCent: b.magCent,
      toleranciaCent,
      toleranciaDias,
      candidatos,
      maxElementos: maxElementosGrupo,
      maxCombinaciones: maxCombinacionesPorAncla,
    });

    if (!mejor) continue;

    let sumaLibroDec = Money.create(0);
    for (const item of mejor.items) {
      sumaLibroDec = Money.add(sumaLibroDec, item.montoDec);
    }
    const difDec = Money.sub(b.montoDec, sumaLibroDec);
    if (!difDec.abs().lte(toleranciaDec)) continue;

    const scoreFinal = empatado
      ? Math.min(0.85, clampScore(umbralAutoMatch - 0.05, 0.6, 0.89))
      : mejor.score;
    const estado: 'CONCILIADO' | 'SUGERIDO' =
      !empatado && scoreFinal >= umbralAutoMatch ? 'CONCILIADO' : 'SUGERIDO';

    const grupo: GrupoCandidatoMatching = {
      tipoMatch: '1:N',
      reglaAplicada: empatado ? 'CAPA_3_SUMA_ACOTADA_AMBIGUA' : 'CAPA_3_SUMA_ACOTADA',
      capaMatching: 3,
      score: scoreFinal,
      estado,
      diferenciaMonto: Money.format(difDec),
      observacion: empatado
        ? `Agrupación 1:${mejor.items.length} por suma exacta con múltiples combinaciones posibles; requiere confirmación manual.`
        : `Agrupación 1:${mejor.items.length} dentro de ventana (${toleranciaDias} día(s)) con diferencia ${Money.format(difDec)}.`,
      itemsBanco: [{ partida: b.raw, montoImputado: Money.format(b.montoDec) }],
      itemsLibro: mejor.items.map((l) => ({
        partida: l.raw,
        montoImputado: Money.format(l.montoDec),
      })),
    };
    grupos.push(grupo);
    marcarConsumidos(grupo);
  }

  // 3B. N:1 (2..maxElementosGrupo banco vs 1 libro)
  const bancosRestantesFecha = bancos
    .filter((b) => !usedBanco.has(b.raw.id))
    .sort((a, b) => a.fechaDias - b.fechaDias || a.raw.id.localeCompare(b.raw.id));

  for (const l of librosRestantesFecha) {
    if (usedLibro.has(l.uniqueKey)) continue;

    const loIdx = lowerBoundByFecha(bancosRestantesFecha, l.fechaDias - toleranciaDias);
    const hiIdx = upperBoundByFecha(bancosRestantesFecha, l.fechaDias + toleranciaDias);
    if (hiIdx - loIdx < 2) continue;

    const candidatos = bancosRestantesFecha
      .slice(loIdx, hiIdx)
      .filter(
        (b) =>
          !usedBanco.has(b.raw.id) &&
          b.sign === l.sign &&
          b.magCent < l.magCent + toleranciaCent
      )
      .sort((x, y) => {
        const dx = Math.abs(x.fechaDias - l.fechaDias);
        const dy = Math.abs(y.fechaDias - l.fechaDias);
        if (dx !== dy) return dx - dy;
        if (x.magCent !== y.magCent) return x.magCent > y.magCent ? -1 : 1;
        return x.raw.id.localeCompare(y.raw.id);
      })
      .slice(0, maxCandidatosVentana);

    if (candidatos.length < 2) continue;

    const { mejor, empatado } = buscarSubconjuntosAcotados({
      anchorFechaDias: l.fechaDias,
      anchorRuc: l.ruc,
      anchorTokens: l.tokens,
      targetMagCent: l.magCent,
      toleranciaCent,
      toleranciaDias,
      candidatos,
      maxElementos: maxElementosGrupo,
      maxCombinaciones: maxCombinacionesPorAncla,
    });

    if (!mejor) continue;

    let sumaBancoDec = Money.create(0);
    for (const item of mejor.items) {
      sumaBancoDec = Money.add(sumaBancoDec, item.montoDec);
    }
    const difDec = Money.sub(sumaBancoDec, l.montoDec);
    if (!difDec.abs().lte(toleranciaDec)) continue;

    const scoreFinal = empatado
      ? Math.min(0.85, clampScore(umbralAutoMatch - 0.05, 0.6, 0.89))
      : mejor.score;
    const estado: 'CONCILIADO' | 'SUGERIDO' =
      !empatado && scoreFinal >= umbralAutoMatch ? 'CONCILIADO' : 'SUGERIDO';

    const grupo: GrupoCandidatoMatching = {
      tipoMatch: 'N:1',
      reglaAplicada: empatado ? 'CAPA_3_SUMA_ACOTADA_AMBIGUA' : 'CAPA_3_SUMA_ACOTADA',
      capaMatching: 3,
      score: scoreFinal,
      estado,
      diferenciaMonto: Money.format(difDec),
      observacion: empatado
        ? `Agrupación ${mejor.items.length}:1 por suma exacta con múltiples combinaciones posibles; requiere confirmación manual.`
        : `Agrupación ${mejor.items.length}:1 dentro de ventana (${toleranciaDias} día(s)) con diferencia ${Money.format(difDec)}.`,
      itemsBanco: mejor.items.map((b) => ({
        partida: b.raw,
        montoImputado: Money.format(b.montoDec),
      })),
      itemsLibro: [{ partida: l.raw, montoImputado: Money.format(l.montoDec) }],
    };
    grupos.push(grupo);
    marcarConsumidos(grupo);
  }

  // ============================================================================
  // CAPA 4 (1:1): Fuzzy determinista de glosa, ventana extendida (2x) y reglas
  // ============================================================================
  const librosRestantesCapa4 = libros
    .filter((l) => !usedLibro.has(l.uniqueKey))
    .sort((a, b) => (a.cent < b.cent ? -1 : a.cent > b.cent ? 1 : a.fechaDias - b.fechaDias));

  const ventanaCapa4 = toleranciaDias * 2;
  interface CandidatoCapa4 {
    banco: BancoNormalizado;
    libro: LibroNormalizado;
    score: number;
    absDifCent: bigint;
    difDias: number;
    razon: string;
  }

  const paresCapa4: CandidatoCapa4[] = [];

  for (const b of bancos) {
    if (usedBanco.has(b.raw.id)) continue;

    // Margen máximo de monto evaluado en Capa 4: max(tolerancia + 1.00, 10% del monto)
    const margen10Pct = b.magCent / 10n;
    const margenCent = toleranciaCent + 100n > margen10Pct ? toleranciaCent + 100n : margen10Pct;
    const loIdx = lowerBoundByCent(librosRestantesCapa4, b.cent - margenCent);
    const hiIdx = upperBoundByCent(librosRestantesCapa4, b.cent + margenCent);
    if (loIdx >= hiIdx) continue;

    const reglasBanco = buscarReglasCoincidentesBanco(b, reglasNorm);
    const candidatosLocales: CandidatoCapa4[] = [];

    // Limita comparaciones por ancla si hubiera miles de montos idénticos en la misma banda
    let evaluadosBanda = 0;
    for (let i = loIdx; i < hiIdx && evaluadosBanda < 120; i += 1) {
      const l = librosRestantesCapa4[i];
      if (l.sign !== b.sign) continue;
      const difDias = Math.abs(b.fechaDias - l.fechaDias);
      if (difDias > ventanaCapa4) continue;
      evaluadosBanda += 1;

      const absDifCent = absBigInt(b.cent - l.cent);
      const maxMag = b.magCent > l.magCent ? b.magCent : l.magCent;
      const ratioDif = maxMag > 0n ? Number(absDifCent) / Number(maxMag) : 0;

      // 1. Componente monto (máx 0.45)
      let scoreMonto = 0;
      if (absDifCent <= toleranciaCent) {
        scoreMonto = 0.45;
      } else if (absDifCent <= toleranciaCent + 100n || ratioDif <= 0.02) {
        scoreMonto = 0.45 * (1 - Math.min(1, ratioDif / 0.05));
      } else if (ratioDif <= 0.1) {
        scoreMonto = 0.25 * (1 - ratioDif / 0.1);
      } else {
        continue;
      }

      // 2. Componente proximidad temporal (máx 0.20)
      const denomDias = Math.max(1, ventanaCapa4 + 1);
      const scoreDias = 0.2 * Math.max(0, 1 - difDias / denomDias);

      // 3. Componente glosa / contraparte (máx 0.24)
      const jacc = jaccardTokens(b.tokens, l.tokens);
      const ov = overlapTokens(b.tokens, l.tokens);
      const subTexto =
        Boolean(b.contraparteNorm && b.contraparteNorm.length >= 4) &&
        (l.anexoNombreNorm.includes(b.contraparteNorm) || l.textoNorm.includes(b.contraparteNorm));
      const simTexto = Math.max(jacc, ov * 0.85, subTexto ? 0.78 : 0);
      const scoreTexto = simTexto * 0.24;

      // 4. Bono RUC / regla aprendida (máx 0.15)
      let bono = 0;
      const razones: string[] = [];
      if (b.ruc && l.ruc && b.ruc === l.ruc) {
        bono += 0.1;
        razones.push('RUC');
      }
      const reglaMatch = reglasBanco.find((r) => reglaVinculaLibro(r, l));
      if (reglaMatch) {
        bono += 0.08 + Math.min(0.04, reglaMatch.usosConfirmados * 0.005);
        razones.push(`regla "${reglaMatch.patronNorm}"`);
      }

      const scoreTotal = clampScore(scoreMonto + scoreDias + scoreTexto + bono, 0, 0.89);
      if (scoreTotal < 0.6) continue;

      if (simTexto > 0) razones.push(`similitud texto ${Math.round(simTexto * 100)}%`);
      razones.push(`${difDias} día(s)`);

      candidatosLocales.push({
        banco: b,
        libro: l,
        score: scoreTotal,
        absDifCent,
        difDias,
        razon: razones.join(', '),
      });
    }

    if (candidatosLocales.length > 0) {
      candidatosLocales.sort(
        (x, y) =>
          y.score - x.score ||
          (x.absDifCent < y.absDifCent ? -1 : x.absDifCent > y.absDifCent ? 1 : 0) ||
          x.difDias - y.difDias
      );
      paresCapa4.push(...candidatosLocales.slice(0, 5));
    }
  }

  paresCapa4.sort(
    (x, y) =>
      y.score - x.score ||
      (x.absDifCent < y.absDifCent ? -1 : x.absDifCent > y.absDifCent ? 1 : 0) ||
      x.difDias - y.difDias ||
      x.banco.fechaDias - y.banco.fechaDias ||
      x.banco.raw.id.localeCompare(y.banco.raw.id) ||
      x.libro.uniqueKey.localeCompare(y.libro.uniqueKey)
  );

  for (const par of paresCapa4) {
    if (usedBanco.has(par.banco.raw.id) || usedLibro.has(par.libro.uniqueKey)) {
      continue;
    }

    const difDec = Money.sub(par.banco.montoDec, par.libro.montoDec);
    const estado: 'CONCILIADO' | 'SUGERIDO' =
      par.score >= umbralAutoMatch ? 'CONCILIADO' : 'SUGERIDO';

    const grupo: GrupoCandidatoMatching = {
      tipoMatch: '1:1',
      reglaAplicada: 'CAPA_4_FUZZY_GLOSA',
      capaMatching: 4,
      score: par.score,
      estado,
      diferenciaMonto: Money.format(difDec),
      observacion: `Coincidencia aproximada (${par.razon}), diferencia ${Money.format(difDec)}.`,
      itemsBanco: [{ partida: par.banco.raw, montoImputado: Money.format(par.banco.montoDec) }],
      itemsLibro: [{ partida: par.libro.raw, montoImputado: Money.format(par.libro.montoDec) }],
    };
    grupos.push(grupo);
    marcarConsumidos(grupo);
  }

  // ============================================================================
  // ESTADÍSTICAS FINALES (con Money)
  // ============================================================================
  let autoConciliados = 0;
  let sugeridos = 0;
  const bancoAutoConciliado = new Set<string>();
  const libroAutoConciliado = new Set<string>();

  for (const g of grupos) {
    if (g.estado === 'CONCILIADO') {
      autoConciliados += 1;
      for (const ib of g.itemsBanco) bancoAutoConciliado.add(ib.partida.id);
      for (const il of g.itemsLibro) libroAutoConciliado.add(`${il.partida.origenLibro}:${il.partida.id}`);
    } else {
      sugeridos += 1;
    }
  }

  let sumaBancoPendiente = Money.create(0);
  let pendientesBancoRestantes = 0;
  for (const b of bancos) {
    if (!bancoAutoConciliado.has(b.raw.id)) {
      sumaBancoPendiente = Money.add(sumaBancoPendiente, b.montoDec);
    }
    if (!usedBanco.has(b.raw.id)) {
      pendientesBancoRestantes += 1;
    }
  }

  let sumaLibroPendiente = Money.create(0);
  let pendientesLibroRestantes = 0;
  for (const l of libros) {
    if (!libroAutoConciliado.has(l.uniqueKey)) {
      sumaLibroPendiente = Money.add(sumaLibroPendiente, l.montoDec);
    }
    if (!usedLibro.has(l.uniqueKey)) {
      pendientesLibroRestantes += 1;
    }
  }

  const diferenciaPendienteDec = Money.sub(sumaBancoPendiente, sumaLibroPendiente);

  return {
    grupos,
    estadisticas: {
      autoConciliados,
      sugeridos,
      pendientesBancoRestantes,
      pendientesLibroRestantes,
      diferenciaPendiente: Money.format(diferenciaPendienteDec),
    },
  };
}
