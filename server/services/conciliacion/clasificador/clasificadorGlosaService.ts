import type { PoolClient } from 'pg';
import { z } from 'zod';
import { db } from '../../../config/database';
import {
  ActualizarReglaClasificacionInput,
  CrearReglaClasificacionInput,
  ReglaClasificacionV2,
  SENTIDOS_MONTO_REGLA,
  SentidoMontoRegla,
  TIPOS_CLASIFICACION_EXTRACTO,
  TIPOS_COINCIDENCIA_REGLA,
  TipoClasificacionExtracto,
  TipoCoincidenciaRegla,
} from '../../../types/conciliacionV2';
import { Money } from '../../../utils/decimal';
import { auditoriaChainService } from '../../auditoriaChainService';
import { ConciliacionV2Error } from '../../conciliacionV2Service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUC_REGEX = /(?<!\d)((?:10|15|17|20)\d{9})(?!\d)/;
const DOC_SERIE_REGEX = /(?<![A-Z0-9])([FBE][A-Z0-9]{3}-\d{1,12})(?![A-Z0-9])/;
const DOC_PREFIJO_REGEX = /(?<![A-Z0-9])((?:CHQ|OP|FAC|BOL|NC|ND)-[A-Z0-9]{1,20}(?:-\d{1,12})?)(?![A-Z0-9])/;

const crearReglaSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  banco: z.string().trim().min(2).max(80).nullable().optional(),
  tipoClasificacion: z.enum(TIPOS_CLASIFICACION_EXTRACTO),
  patronTexto: z.string().trim().min(2).max(200),
  tipoCoincidencia: z.enum(TIPOS_COINCIDENCIA_REGLA).optional(),
  sentidoMonto: z.enum(SENTIDOS_MONTO_REGLA).optional(),
  prioridad: z.number().int().min(1).max(1000).optional(),
  activo: z.boolean().optional(),
});

const actualizarReglaSchema = z.object({
  nombre: z.string().trim().min(2).max(120).optional(),
  banco: z.string().trim().min(2).max(80).nullable().optional(),
  tipoClasificacion: z.enum(TIPOS_CLASIFICACION_EXTRACTO).optional(),
  patronTexto: z.string().trim().min(2).max(200).optional(),
  tipoCoincidencia: z.enum(TIPOS_COINCIDENCIA_REGLA).optional(),
  sentidoMonto: z.enum(SENTIDOS_MONTO_REGLA).optional(),
  prioridad: z.number().int().min(1).max(1000).optional(),
  activo: z.boolean().optional(),
});

export interface ResultadoClasificacionLinea {
  tipoClasificacion: TipoClasificacionExtracto;
  rucExtraido: string | null;
  docExtraido: string | null;
  contraparteExtraida: string | null;
  reglaAplicada: string | null;
}

export const REGLAS_BASE_SISTEMA: readonly ReglaClasificacionV2[] = [
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_ITF',
    banco: null,
    tipoClasificacion: 'ITF',
    patronTexto: 'ITF',
    tipoCoincidencia: 'PALABRAS_CLAVE',
    sentidoMonto: 'CARGO',
    prioridad: 10,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_ITF_IMPTO',
    banco: null,
    tipoClasificacion: 'ITF',
    patronTexto: 'IMPUESTO TRANSACCIONES FINANCIERAS',
    tipoCoincidencia: 'PALABRAS_CLAVE',
    sentidoMonto: 'CARGO',
    prioridad: 11,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_MANTENIMIENTO',
    banco: null,
    tipoClasificacion: 'MANTENIMIENTO',
    patronTexto: 'MANTENIMIENTO',
    tipoCoincidencia: 'CONTIENE',
    sentidoMonto: 'CARGO',
    prioridad: 15,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_MANT_CUENTA',
    banco: null,
    tipoClasificacion: 'MANTENIMIENTO',
    patronTexto: 'MANT. CUENTA',
    tipoCoincidencia: 'PALABRAS_CLAVE',
    sentidoMonto: 'CARGO',
    prioridad: 16,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_COMISION',
    banco: null,
    tipoClasificacion: 'COMISION_BANCARIA',
    patronTexto: 'COMISION',
    tipoCoincidencia: 'CONTIENE',
    sentidoMonto: 'CARGO',
    prioridad: 20,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_PORTES',
    banco: null,
    tipoClasificacion: 'COMISION_BANCARIA',
    patronTexto: 'PORTES',
    tipoCoincidencia: 'PALABRAS_CLAVE',
    sentidoMonto: 'CARGO',
    prioridad: 21,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_GASTOS_BANCARIOS',
    banco: null,
    tipoClasificacion: 'COMISION_BANCARIA',
    patronTexto: 'GASTOS BANCARIOS',
    tipoCoincidencia: 'CONTIENE',
    sentidoMonto: 'CARGO',
    prioridad: 22,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_INTERES_GASTO',
    banco: null,
    tipoClasificacion: 'INTERES_GASTO',
    patronTexto: 'INTERES',
    tipoCoincidencia: 'CONTIENE',
    sentidoMonto: 'CARGO',
    prioridad: 25,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_INTERES_INGRESO',
    banco: null,
    tipoClasificacion: 'INTERES_INGRESO',
    patronTexto: 'INTERES',
    tipoCoincidencia: 'CONTIENE',
    sentidoMonto: 'ABONO',
    prioridad: 26,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_DETRACCION',
    banco: null,
    tipoClasificacion: 'DETRACCION',
    patronTexto: 'DETRACCION',
    tipoCoincidencia: 'CONTIENE',
    sentidoMonto: 'AMBOS',
    prioridad: 30,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_SPOT',
    banco: null,
    tipoClasificacion: 'DETRACCION',
    patronTexto: 'SPOT',
    tipoCoincidencia: 'PALABRAS_CLAVE',
    sentidoMonto: 'AMBOS',
    prioridad: 31,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_TRIBUTO_SUNAT',
    banco: null,
    tipoClasificacion: 'TRIBUTO_SUNAT',
    patronTexto: 'SUNAT',
    tipoCoincidencia: 'CONTIENE',
    sentidoMonto: 'CARGO',
    prioridad: 35,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_TRIBUTO_NPS',
    banco: null,
    tipoClasificacion: 'TRIBUTO_SUNAT',
    patronTexto: 'NPS',
    tipoCoincidencia: 'PALABRAS_CLAVE',
    sentidoMonto: 'CARGO',
    prioridad: 36,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_AFP',
    banco: null,
    tipoClasificacion: 'AFP_ONP_ESSALUD',
    patronTexto: 'AFP',
    tipoCoincidencia: 'CONTIENE',
    sentidoMonto: 'CARGO',
    prioridad: 40,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_ONP',
    banco: null,
    tipoClasificacion: 'AFP_ONP_ESSALUD',
    patronTexto: 'ONP',
    tipoCoincidencia: 'PALABRAS_CLAVE',
    sentidoMonto: 'CARGO',
    prioridad: 41,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_ESSALUD',
    banco: null,
    tipoClasificacion: 'AFP_ONP_ESSALUD',
    patronTexto: 'ESSALUD',
    tipoCoincidencia: 'CONTIENE',
    sentidoMonto: 'CARGO',
    prioridad: 42,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_PLANILLA',
    banco: null,
    tipoClasificacion: 'PLANILLA',
    patronTexto: 'PLANILLA',
    tipoCoincidencia: 'CONTIENE',
    sentidoMonto: 'CARGO',
    prioridad: 45,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_HABERES',
    banco: null,
    tipoClasificacion: 'PLANILLA',
    patronTexto: 'HABERES',
    tipoCoincidencia: 'CONTIENE',
    sentidoMonto: 'CARGO',
    prioridad: 46,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_CHEQUE',
    banco: null,
    tipoClasificacion: 'CHEQUE',
    patronTexto: 'CHEQUE',
    tipoCoincidencia: 'CONTIENE',
    sentidoMonto: 'AMBOS',
    prioridad: 50,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_CHQ',
    banco: null,
    tipoClasificacion: 'CHEQUE',
    patronTexto: 'CHQ',
    tipoCoincidencia: 'PALABRAS_CLAVE',
    sentidoMonto: 'AMBOS',
    prioridad: 51,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_TRANSFERENCIA',
    banco: null,
    tipoClasificacion: 'TRANSFERENCIA',
    patronTexto: 'TRANSFERENCIA',
    tipoCoincidencia: 'CONTIENE',
    sentidoMonto: 'AMBOS',
    prioridad: 60,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_TRANSF',
    banco: null,
    tipoClasificacion: 'TRANSFERENCIA',
    patronTexto: 'TRANSF',
    tipoCoincidencia: 'CONTIENE',
    sentidoMonto: 'AMBOS',
    prioridad: 61,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: null,
    empresaId: null,
    nombre: 'BASE_CCI',
    banco: null,
    tipoClasificacion: 'TRANSFERENCIA',
    patronTexto: 'CCI',
    tipoCoincidencia: 'PALABRAS_CLAVE',
    sentidoMonto: 'AMBOS',
    prioridad: 62,
    esSistema: true,
    activo: true,
    createdAt: null,
    updatedAt: null,
  },
];

function asegurarPostgresDisponible(): void {
  if (!db.isPostgresConnected()) {
    throw new ConciliacionV2Error(
      503,
      'POSTGRESQL_NO_DISPONIBLE',
      'PostgreSQL no está conectado. Las reglas de clasificación requieren persistencia transaccional.'
    );
  }
}

function asegurarUuid(valor: string, nombreCampo: string): void {
  if (!valor || !UUID_REGEX.test(valor)) {
    throw new ConciliacionV2Error(400, 'IDENTIFICADOR_INVALIDO', `${nombreCampo} debe ser un UUID válido.`);
  }
}

function normalizarTextoSeguro(texto: string): string {
  return texto
    .slice(0, 500)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizarPalabras(textoNorm: string): string[] {
  return textoNorm
    .split(/[^A-Z0-9]+/)
    .filter((p) => p.length > 0);
}

function coincideReglaLineal(
  descNorm: string,
  textoCompletoNorm: string,
  tokensCompleto: Set<string>,
  patronNorm: string,
  tipoCoincidencia: TipoCoincidenciaRegla
): boolean {
  if (!patronNorm) {
    return false;
  }
  if (tipoCoincidencia === 'PREFIJO') {
    return descNorm.startsWith(patronNorm);
  }
  if (tipoCoincidencia === 'PALABRAS_CLAVE') {
    const palabrasPatron = tokenizarPalabras(patronNorm);
    if (palabrasPatron.length === 0) {
      return false;
    }
    return palabrasPatron.every(
      (palabra) => tokensCompleto.has(palabra) || textoCompletoNorm.includes(palabra)
    );
  }
  return textoCompletoNorm.includes(patronNorm);
}

function coincideSentido(sentidoRegla: SentidoMontoRegla, esCargo: boolean, esAbono: boolean): boolean {
  if (sentidoRegla === 'AMBOS') {
    return true;
  }
  if (sentidoRegla === 'CARGO') {
    return esCargo;
  }
  return esAbono;
}

function extraerContraparte(descOriginal: string, ruc: string | null): string | null {
  const texto = descOriginal.slice(0, 500).replace(/\s+/g, ' ').trim();
  const upper = normalizarTextoSeguro(texto);

  const marcadores = ['PROVEEDOR:', 'CLIENTE:', 'BENEFICIARIO:', 'TITULAR:', 'A:', 'DE:'];
  for (const marcador of marcadores) {
    const idx = upper.indexOf(marcador);
    if (idx !== -1) {
      const inicio = idx + marcador.length;
      const resto = texto.slice(inicio).trim();
      const cortado = cortarDelimitadoresContraparte(resto);
      if (cortado && cortado.length >= 2) {
        return cortado.slice(0, 160);
      }
    }
  }

  if (ruc) {
    const idxRuc = texto.indexOf(ruc);
    if (idxRuc !== -1) {
      const despues = texto.slice(idxRuc + ruc.length).replace(/^[\s\-:|/]+/, '').trim();
      const cortadoDespues = cortarDelimitadoresContraparte(despues);
      if (cortadoDespues && cortadoDespues.length >= 2) {
        return cortadoDespues.slice(0, 160);
      }
    }
  }

  return null;
}

function cortarDelimitadoresContraparte(texto: string): string | null {
  if (!texto) {
    return null;
  }
  const upper = normalizarTextoSeguro(texto);
  const separadores = ['|', ';', ' RUC ', ' DOC ', ' OP-', ' F00', ' B00', ' E00', ' CHQ-'];
  let corte = texto.length;

  for (const sep of separadores) {
    const idx = upper.indexOf(sep);
    if (idx !== -1 && idx < corte) {
      corte = idx;
    }
  }

  const limpio = texto
    .slice(0, corte)
    .replace(/^[\s\-:|/]+/, '')
    .replace(/[\s\-:|/]+$/, '')
    .trim();

  return limpio.length >= 2 ? limpio : null;
}

/**
 * Clasifica una línea de extracto bancario evaluando reglas personalizadas (prioridad ASC)
 * y reglas base del sistema sin regex vulnerables a ReDoS.
 */
export function clasificarLineaExtracto(
  descripcion: string,
  referencia: string | null | undefined,
  montoStr: string,
  reglasPersonalizadas: readonly ReglaClasificacionV2[] = [],
  banco?: string | null
): ResultadoClasificacionLinea {
  const descAcotada = (descripcion ?? '').slice(0, 500);
  const refAcotada = (referencia ?? '').slice(0, 120);
  const descNorm = normalizarTextoSeguro(descAcotada);
  const refNorm = normalizarTextoSeguro(refAcotada);
  const textoCompletoNorm = `${descNorm} ${refNorm}`.trim();
  const tokensCompleto = new Set(tokenizarPalabras(textoCompletoNorm));
  const bancoNorm = banco ? normalizarTextoSeguro(banco) : null;

  const montoDec = Money.create(montoStr || '0');
  const esCargo = montoDec.lt(0);
  const esAbono = montoDec.gt(0);

  const textoParaExtraccion = `${descAcotada} ${refAcotada}`.toUpperCase();
  const rucMatch = RUC_REGEX.exec(textoParaExtraccion);
  const rucExtraido = rucMatch ? rucMatch[1] : null;

  const docSerieMatch = DOC_SERIE_REGEX.exec(textoParaExtraccion);
  const docPrefijoMatch = docSerieMatch ? null : DOC_PREFIJO_REGEX.exec(textoParaExtraccion);
  const docRaw = docSerieMatch?.[1] ?? docPrefijoMatch?.[1] ?? null;
  const docExtraido = docRaw ? docRaw.slice(0, 40) : null;

  const contraparteExtraida = extraerContraparte(descAcotada, rucExtraido);

  const reglasOrdenadasPersonalizadas = [...reglasPersonalizadas]
    .filter((r) => r.activo)
    .sort((a, b) => a.prioridad - b.prioridad);

  const reglasOrdenadasBase = [...REGLAS_BASE_SISTEMA].sort((a, b) => a.prioridad - b.prioridad);

  const evaluarLista = (lista: readonly ReglaClasificacionV2[]): ReglaClasificacionV2 | null => {
    for (const regla of lista) {
      if (regla.banco) {
        const reglaBancoNorm = normalizarTextoSeguro(regla.banco);
        if (!bancoNorm || (!bancoNorm.includes(reglaBancoNorm) && !reglaBancoNorm.includes(bancoNorm))) {
          continue;
        }
      }
      if (!coincideSentido(regla.sentidoMonto, esCargo, esAbono)) {
        continue;
      }
      const patronNorm = normalizarTextoSeguro(regla.patronTexto);
      if (coincideReglaLineal(descNorm, textoCompletoNorm, tokensCompleto, patronNorm, regla.tipoCoincidencia)) {
        return regla;
      }
    }
    return null;
  };

  const matchRegla = evaluarLista(reglasOrdenadasPersonalizadas) ?? evaluarLista(reglasOrdenadasBase);

  return {
    tipoClasificacion: matchRegla ? matchRegla.tipoClasificacion : 'OTRO',
    rucExtraido,
    docExtraido,
    contraparteExtraida,
    reglaAplicada: matchRegla ? matchRegla.nombre : null,
  };
}

function mapReglaRow(row: any): ReglaClasificacionV2 {
  return {
    id: row.id,
    empresaId: row.empresaId,
    nombre: row.nombre,
    banco: row.banco ?? null,
    tipoClasificacion: row.tipoClasificacion,
    patronTexto: row.patronTexto,
    tipoCoincidencia: row.tipoCoincidencia,
    sentidoMonto: row.sentidoMonto,
    prioridad: Number(row.prioridad),
    esSistema: false,
    activo: Boolean(row.activo),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

export async function listarReglasPersonalizadasEnTx(
  client: PoolClient,
  empresaId: string
): Promise<ReglaClasificacionV2[]> {
  const res = await client.query(
    `SELECT id,
            empresa_id AS "empresaId",
            nombre,
            banco,
            tipo_clasificacion AS "tipoClasificacion",
            patron_texto AS "patronTexto",
            tipo_coincidencia AS "tipoCoincidencia",
            sentido_monto AS "sentidoMonto",
            prioridad,
            activo,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
     FROM conciliacion_reglas_clasificacion
     WHERE empresa_id = $1
     ORDER BY prioridad ASC, nombre ASC`,
    [empresaId]
  );
  return res.rows.map(mapReglaRow);
}

export const clasificadorGlosaService = {
  clasificarLineaExtracto,

  async listarReglas(empresaId: string): Promise<ReglaClasificacionV2[]> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');

    const personalizadas = await db.withEmpresaTransaction(empresaId, (client) =>
      listarReglasPersonalizadasEnTx(client, empresaId)
    );
    return [...personalizadas, ...REGLAS_BASE_SISTEMA.map((r) => ({ ...r }))];
  },

  async crearRegla(
    empresaId: string,
    input: CrearReglaClasificacionInput,
    usuarioId: string
  ): Promise<ReglaClasificacionV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(usuarioId, 'usuarioId');

    const parsed = crearReglaSchema.safeParse(input);
    if (!parsed.success) {
      throw new ConciliacionV2Error(
        400,
        'DATOS_REGLA_INVALIDOS',
        parsed.error.issues.map((i) => i.message).join(' ')
      );
    }

    const data = parsed.data;
    return db.withEmpresaTransaction(empresaId, async (client) => {
      try {
        const res = await client.query(
          `INSERT INTO conciliacion_reglas_clasificacion (
             empresa_id, nombre, banco, tipo_clasificacion, patron_texto,
             tipo_coincidencia, sentido_monto, prioridad, activo, created_by, updated_by
           ) VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, $8, $9, $10, $10
           )
           RETURNING id,
                     empresa_id AS "empresaId",
                     nombre,
                     banco,
                     tipo_clasificacion AS "tipoClasificacion",
                     patron_texto AS "patronTexto",
                     tipo_coincidencia AS "tipoCoincidencia",
                     sentido_monto AS "sentidoMonto",
                     prioridad,
                     activo,
                     created_at AS "createdAt",
                     updated_at AS "updatedAt"`,
          [
            empresaId,
            data.nombre,
            data.banco ?? null,
            data.tipoClasificacion,
            data.patronTexto,
            data.tipoCoincidencia ?? 'CONTIENE',
            data.sentidoMonto ?? 'AMBOS',
            data.prioridad ?? 100,
            data.activo ?? true,
            usuarioId,
          ]
        );

        const creada = mapReglaRow(res.rows[0]);
        await auditoriaChainService.registrar(
          {
            empresaId,
            usuarioId,
            tablaAfectada: 'conciliacion_reglas_clasificacion',
            registroId: creada.id!,
            accion: 'CREAR_REGLA_CLASIFICACION',
            datosNuevos: {
              id: creada.id,
              nombre: creada.nombre,
              banco: creada.banco,
              tipoClasificacion: creada.tipoClasificacion,
              patronTexto: creada.patronTexto,
              tipoCoincidencia: creada.tipoCoincidencia,
              sentidoMonto: creada.sentidoMonto,
              prioridad: creada.prioridad,
              activo: creada.activo,
            },
          },
          client
        );

        return creada;
      } catch (err: any) {
        if (err?.code === '23505') {
          throw new ConciliacionV2Error(
            409,
            'REGLA_NOMBRE_DUPLICADO',
            `Ya existe una regla de clasificación llamada "${data.nombre}" para esta empresa.`
          );
        }
        throw err;
      }
    });
  },

  async actualizarRegla(
    empresaId: string,
    reglaId: string,
    input: ActualizarReglaClasificacionInput,
    usuarioId: string
  ): Promise<ReglaClasificacionV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(reglaId, 'reglaId');
    asegurarUuid(usuarioId, 'usuarioId');

    const parsed = actualizarReglaSchema.safeParse(input);
    if (!parsed.success) {
      throw new ConciliacionV2Error(
        400,
        'DATOS_REGLA_INVALIDOS',
        parsed.error.issues.map((i) => i.message).join(' ')
      );
    }

    const data = parsed.data;
    return db.withEmpresaTransaction(empresaId, async (client) => {
      const actualRes = await client.query(
        `SELECT id,
                empresa_id AS "empresaId",
                nombre,
                banco,
                tipo_clasificacion AS "tipoClasificacion",
                patron_texto AS "patronTexto",
                tipo_coincidencia AS "tipoCoincidencia",
                sentido_monto AS "sentidoMonto",
                prioridad,
                activo,
                created_at AS "createdAt",
                updated_at AS "updatedAt"
         FROM conciliacion_reglas_clasificacion
         WHERE empresa_id = $1 AND id = $2
         FOR UPDATE`,
        [empresaId, reglaId]
      );

      if (actualRes.rows.length === 0) {
        throw new ConciliacionV2Error(404, 'REGLA_NO_ENCONTRADA', 'La regla de clasificación no existe.');
      }

      const anterior = mapReglaRow(actualRes.rows[0]);
      try {
        const res = await client.query(
          `UPDATE conciliacion_reglas_clasificacion
           SET nombre = $3,
               banco = $4,
               tipo_clasificacion = $5,
               patron_texto = $6,
               tipo_coincidencia = $7,
               sentido_monto = $8,
               prioridad = $9,
               activo = $10,
               updated_by = $11,
               updated_at = CURRENT_TIMESTAMP
           WHERE empresa_id = $1 AND id = $2
           RETURNING id,
                     empresa_id AS "empresaId",
                     nombre,
                     banco,
                     tipo_clasificacion AS "tipoClasificacion",
                     patron_texto AS "patronTexto",
                     tipo_coincidencia AS "tipoCoincidencia",
                     sentido_monto AS "sentidoMonto",
                     prioridad,
                     activo,
                     created_at AS "createdAt",
                     updated_at AS "updatedAt"`,
          [
            empresaId,
            reglaId,
            data.nombre ?? anterior.nombre,
            data.banco !== undefined ? data.banco : anterior.banco,
            data.tipoClasificacion ?? anterior.tipoClasificacion,
            data.patronTexto ?? anterior.patronTexto,
            data.tipoCoincidencia ?? anterior.tipoCoincidencia,
            data.sentidoMonto ?? anterior.sentidoMonto,
            data.prioridad ?? anterior.prioridad,
            data.activo !== undefined ? data.activo : anterior.activo,
            usuarioId,
          ]
        );

        const actualizada = mapReglaRow(res.rows[0]);
        await auditoriaChainService.registrar(
          {
            empresaId,
            usuarioId,
            tablaAfectada: 'conciliacion_reglas_clasificacion',
            registroId: actualizada.id!,
            accion: 'ACTUALIZAR_REGLA_CLASIFICACION',
            datosAnteriores: {
              nombre: anterior.nombre,
              tipoClasificacion: anterior.tipoClasificacion,
              patronTexto: anterior.patronTexto,
              prioridad: anterior.prioridad,
              activo: anterior.activo,
            },
            datosNuevos: {
              nombre: actualizada.nombre,
              tipoClasificacion: actualizada.tipoClasificacion,
              patronTexto: actualizada.patronTexto,
              prioridad: actualizada.prioridad,
              activo: actualizada.activo,
            },
          },
          client
        );

        return actualizada;
      } catch (err: any) {
        if (err?.code === '23505') {
          throw new ConciliacionV2Error(
            409,
            'REGLA_NOMBRE_DUPLICADO',
            `Ya existe una regla de clasificación llamada "${data.nombre}" para esta empresa.`
          );
        }
        throw err;
      }
    });
  },

  async eliminarRegla(
    empresaId: string,
    reglaId: string,
    usuarioId: string
  ): Promise<{ eliminado: true; id: string }> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(reglaId, 'reglaId');
    asegurarUuid(usuarioId, 'usuarioId');

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const actualRes = await client.query(
        `SELECT id, nombre, tipo_clasificacion AS "tipoClasificacion", patron_texto AS "patronTexto"
         FROM conciliacion_reglas_clasificacion
         WHERE empresa_id = $1 AND id = $2
         FOR UPDATE`,
        [empresaId, reglaId]
      );

      if (actualRes.rows.length === 0) {
        throw new ConciliacionV2Error(404, 'REGLA_NO_ENCONTRADA', 'La regla de clasificación no existe.');
      }

      const anterior = actualRes.rows[0];
      await client.query(
        `DELETE FROM conciliacion_reglas_clasificacion WHERE empresa_id = $1 AND id = $2`,
        [empresaId, reglaId]
      );

      await auditoriaChainService.registrar(
        {
          empresaId,
          usuarioId,
          tablaAfectada: 'conciliacion_reglas_clasificacion',
          registroId: reglaId,
          accion: 'ELIMINAR_REGLA_CLASIFICACION',
          datosAnteriores: {
            id: anterior.id,
            nombre: anterior.nombre,
            tipoClasificacion: anterior.tipoClasificacion,
            patronTexto: anterior.patronTexto,
          },
        },
        client
      );

      return { eliminado: true, id: reglaId };
    });
  },
};
