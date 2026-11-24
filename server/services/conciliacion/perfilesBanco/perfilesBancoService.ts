import type { PoolClient } from 'pg';
import { z } from 'zod';
import { db } from '../../../config/database';
import {
  ActualizarPerfilBancoInput,
  CrearPerfilBancoInput,
  FORMATOS_EXTRACTO_V2,
  MapeoColumnasPerfil,
  PerfilBancoV2,
} from '../../../types/conciliacionV2';
import { auditoriaChainService } from '../../auditoriaChainService';
import { ConciliacionV2Error } from '../../conciliacionV2Service';
import {
  PERFILES_BANCO_PREDEFINIDOS,
  buscarPerfilPredefinido,
} from './perfilesPredefinidos';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const columnaRefSchema = z.union([z.string().trim().min(1).max(120), z.number().int().min(0).max(200)]);

const mapeoColumnasSchema = z
  .object({
    fecha: columnaRefSchema,
    descripcion: columnaRefSchema,
    referencia: columnaRefSchema.nullable().optional(),
    monto: columnaRefSchema.nullable().optional(),
    abono: columnaRefSchema.nullable().optional(),
    cargo: columnaRefSchema.nullable().optional(),
    saldo: columnaRefSchema.nullable().optional(),
    signoCargoNegativo: z.boolean().optional(),
  })
  .refine(
    (m) => Boolean(m.monto !== undefined && m.monto !== null) || Boolean(m.abono !== undefined && m.abono !== null && m.cargo !== undefined && m.cargo !== null),
    { message: 'mapeoColumnas requiere columna "monto" o el par "abono" y "cargo".' }
  );

const crearPerfilSchema = z.object({
  codigo: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, 'El código solo puede contener letras, números, "_" y "-".'),
  nombre: z.string().trim().min(2).max(120),
  banco: z.string().trim().min(2).max(80),
  formato: z.enum(FORMATOS_EXTRACTO_V2),
  delimitador: z.string().max(5).nullable().optional(),
  codificacion: z.string().trim().min(2).max(20).optional(),
  filaEncabezado: z.number().int().min(1).max(200).optional(),
  formatoFecha: z.string().trim().min(4).max(30).optional(),
  separadorDecimal: z.enum(['.', ',']).optional(),
  mapeoColumnas: mapeoColumnasSchema,
  activo: z.boolean().optional(),
});

const actualizarPerfilSchema = z.object({
  nombre: z.string().trim().min(2).max(120).optional(),
  banco: z.string().trim().min(2).max(80).optional(),
  formato: z.enum(FORMATOS_EXTRACTO_V2).optional(),
  delimitador: z.string().max(5).nullable().optional(),
  codificacion: z.string().trim().min(2).max(20).optional(),
  filaEncabezado: z.number().int().min(1).max(200).optional(),
  formatoFecha: z.string().trim().min(4).max(30).optional(),
  separadorDecimal: z.enum(['.', ',']).optional(),
  mapeoColumnas: mapeoColumnasSchema.optional(),
  activo: z.boolean().optional(),
});

function asegurarPostgresDisponible(): void {
  if (!db.isPostgresConnected()) {
    throw new ConciliacionV2Error(
      503,
      'POSTGRESQL_NO_DISPONIBLE',
      'PostgreSQL no está conectado. Los perfiles bancarios requieren persistencia transaccional.'
    );
  }
}

function asegurarUuid(valor: string, nombreCampo: string): void {
  if (!valor || !UUID_REGEX.test(valor)) {
    throw new ConciliacionV2Error(400, 'IDENTIFICADOR_INVALIDO', `${nombreCampo} debe ser un UUID válido.`);
  }
}

function mapPerfilRow(row: any): PerfilBancoV2 {
  return {
    id: row.id,
    empresaId: row.empresaId,
    codigo: row.codigo,
    nombre: row.nombre,
    banco: row.banco,
    formato: row.formato,
    delimitador: row.delimitador ?? null,
    codificacion: row.codificacion,
    filaEncabezado: Number(row.filaEncabezado),
    formatoFecha: row.formatoFecha,
    separadorDecimal: row.separadorDecimal === ',' ? ',' : '.',
    mapeoColumnas: (row.mapeoColumnasJson ?? {}) as MapeoColumnasPerfil,
    esSistema: Boolean(row.esSistema),
    predefinido: false,
    activo: Boolean(row.activo),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

export async function obtenerPerfilPorCodigoOIdEnTx(
  client: PoolClient,
  empresaId: string,
  identificador: string
): Promise<PerfilBancoV2> {
  const limpio = (identificador ?? '').trim();
  if (!limpio) {
    throw new ConciliacionV2Error(400, 'PERFIL_IDENTIFICADOR_REQUERIDO', 'Debe indicar el ID o código del perfil bancario.');
  }

  if (UUID_REGEX.test(limpio)) {
    const res = await client.query(
      `SELECT id,
              empresa_id AS "empresaId",
              codigo,
              nombre,
              banco,
              formato,
              delimitador,
              codificacion,
              fila_encabezado AS "filaEncabezado",
              formato_fecha AS "formatoFecha",
              separador_decimal AS "separadorDecimal",
              mapeo_columnas_json AS "mapeoColumnasJson",
              es_sistema AS "esSistema",
              activo,
              created_at AS "createdAt",
              updated_at AS "updatedAt"
       FROM conciliacion_perfiles_banco
       WHERE empresa_id = $1 AND id = $2`,
      [empresaId, limpio]
    );
    if (res.rows.length === 0) {
      throw new ConciliacionV2Error(404, 'PERFIL_BANCO_NO_ENCONTRADO', 'Perfil bancario no encontrado para la empresa.');
    }
    return mapPerfilRow(res.rows[0]);
  }

  const codigoUpper = limpio.toUpperCase();
  const res = await client.query(
    `SELECT id,
            empresa_id AS "empresaId",
            codigo,
            nombre,
            banco,
            formato,
            delimitador,
            codificacion,
            fila_encabezado AS "filaEncabezado",
            formato_fecha AS "formatoFecha",
            separador_decimal AS "separadorDecimal",
            mapeo_columnas_json AS "mapeoColumnasJson",
            es_sistema AS "esSistema",
            activo,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
     FROM conciliacion_perfiles_banco
     WHERE empresa_id = $1 AND UPPER(codigo) = $2`,
    [empresaId, codigoUpper]
  );

  if (res.rows.length > 0) {
    return mapPerfilRow(res.rows[0]);
  }

  const predefinido = buscarPerfilPredefinido(codigoUpper);
  if (predefinido) {
    return predefinido;
  }

  throw new ConciliacionV2Error(
    404,
    'PERFIL_BANCO_NO_ENCONTRADO',
    `No existe el perfil bancario "${identificador}".`
  );
}

export const perfilesBancoService = {
  async listarPerfiles(empresaId: string): Promise<PerfilBancoV2[]> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');

    const personalizados = await db.withEmpresaTransaction(empresaId, async (client) => {
      const res = await client.query(
        `SELECT id,
                empresa_id AS "empresaId",
                codigo,
                nombre,
                banco,
                formato,
                delimitador,
                codificacion,
                fila_encabezado AS "filaEncabezado",
                formato_fecha AS "formatoFecha",
                separador_decimal AS "separadorDecimal",
                mapeo_columnas_json AS "mapeoColumnasJson",
                es_sistema AS "esSistema",
                activo,
                created_at AS "createdAt",
                updated_at AS "updatedAt"
         FROM conciliacion_perfiles_banco
         WHERE empresa_id = $1
         ORDER BY banco ASC, nombre ASC`,
        [empresaId]
      );
      return res.rows.map(mapPerfilRow);
    });

    const predefinidos = PERFILES_BANCO_PREDEFINIDOS.map((p) => ({
      ...p,
      mapeoColumnas: { ...p.mapeoColumnas },
    }));

    return [...predefinidos, ...personalizados];
  },

  async obtenerPerfilPorCodigoOId(empresaId: string, identificador: string): Promise<PerfilBancoV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    return db.withEmpresaTransaction(empresaId, (client) =>
      obtenerPerfilPorCodigoOIdEnTx(client, empresaId, identificador)
    );
  },

  async crearPerfil(
    empresaId: string,
    input: CrearPerfilBancoInput,
    usuarioId: string
  ): Promise<PerfilBancoV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(usuarioId, 'usuarioId');

    const parsed = crearPerfilSchema.safeParse(input);
    if (!parsed.success) {
      throw new ConciliacionV2Error(
        400,
        'DATOS_PERFIL_INVALIDOS',
        parsed.error.issues.map((i) => i.message).join(' ')
      );
    }

    const data = parsed.data;
    const codigoNorm = data.codigo.toUpperCase();
    if (buscarPerfilPredefinido(codigoNorm)) {
      throw new ConciliacionV2Error(
        409,
        'PERFIL_SISTEMA_RESERVADO',
        `El código "${codigoNorm}" pertenece a un perfil predefinido del sistema.`
      );
    }

    return db.withEmpresaTransaction(empresaId, async (client) => {
      try {
        const res = await client.query(
          `INSERT INTO conciliacion_perfiles_banco (
             empresa_id, codigo, nombre, banco, formato, delimitador, codificacion,
             fila_encabezado, formato_fecha, separador_decimal, mapeo_columnas_json,
             es_sistema, activo, created_by, updated_by
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11::jsonb,
             FALSE, $12, $13, $13
           )
           RETURNING id,
                     empresa_id AS "empresaId",
                     codigo,
                     nombre,
                     banco,
                     formato,
                     delimitador,
                     codificacion,
                     fila_encabezado AS "filaEncabezado",
                     formato_fecha AS "formatoFecha",
                     separador_decimal AS "separadorDecimal",
                     mapeo_columnas_json AS "mapeoColumnasJson",
                     es_sistema AS "esSistema",
                     activo,
                     created_at AS "createdAt",
                     updated_at AS "updatedAt"`,
          [
            empresaId,
            codigoNorm,
            data.nombre,
            data.banco,
            data.formato,
            data.delimitador ?? null,
            data.codificacion ?? 'UTF-8',
            data.filaEncabezado ?? 1,
            data.formatoFecha ?? 'DD/MM/YYYY',
            data.separadorDecimal ?? '.',
            JSON.stringify(data.mapeoColumnas),
            data.activo ?? true,
            usuarioId,
          ]
        );

        const creado = mapPerfilRow(res.rows[0]);
        await auditoriaChainService.registrar(
          {
            empresaId,
            usuarioId,
            tablaAfectada: 'conciliacion_perfiles_banco',
            registroId: creado.id!,
            accion: 'CREAR_PERFIL_BANCO',
            datosNuevos: {
              id: creado.id,
              codigo: creado.codigo,
              nombre: creado.nombre,
              banco: creado.banco,
              formato: creado.formato,
              delimitador: creado.delimitador,
              codificacion: creado.codificacion,
              filaEncabezado: creado.filaEncabezado,
              formatoFecha: creado.formatoFecha,
              separadorDecimal: creado.separadorDecimal,
              mapeoColumnasJson: creado.mapeoColumnas,
              esSistema: creado.esSistema,
              activo: creado.activo,
            },
          },
          client
        );

        return creado;
      } catch (err: any) {
        if (err?.code === '23505') {
          throw new ConciliacionV2Error(
            409,
            'PERFIL_CODIGO_DUPLICADO',
            `Ya existe un perfil bancario con código "${codigoNorm}" en la empresa.`
          );
        }
        throw err;
      }
    });
  },

  async actualizarPerfil(
    empresaId: string,
    perfilId: string,
    input: ActualizarPerfilBancoInput,
    usuarioId: string
  ): Promise<PerfilBancoV2> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(perfilId, 'perfilId');
    asegurarUuid(usuarioId, 'usuarioId');

    const parsed = actualizarPerfilSchema.safeParse(input);
    if (!parsed.success) {
      throw new ConciliacionV2Error(
        400,
        'DATOS_PERFIL_INVALIDOS',
        parsed.error.issues.map((i) => i.message).join(' ')
      );
    }

    const data = parsed.data;
    return db.withEmpresaTransaction(empresaId, async (client) => {
      const actualRes = await client.query(
        `SELECT id,
                empresa_id AS "empresaId",
                codigo,
                nombre,
                banco,
                formato,
                delimitador,
                codificacion,
                fila_encabezado AS "filaEncabezado",
                formato_fecha AS "formatoFecha",
                separador_decimal AS "separadorDecimal",
                mapeo_columnas_json AS "mapeoColumnasJson",
                es_sistema AS "esSistema",
                activo,
                created_at AS "createdAt",
                updated_at AS "updatedAt"
         FROM conciliacion_perfiles_banco
         WHERE empresa_id = $1 AND id = $2
         FOR UPDATE`,
        [empresaId, perfilId]
      );

      if (actualRes.rows.length === 0) {
        throw new ConciliacionV2Error(404, 'PERFIL_BANCO_NO_ENCONTRADO', 'El perfil bancario no existe.');
      }

      const anterior = mapPerfilRow(actualRes.rows[0]);
      if (anterior.esSistema) {
        throw new ConciliacionV2Error(
          409,
          'PERFIL_SISTEMA_INMUTABLE',
          'Los perfiles del sistema no se pueden modificar.'
        );
      }

      const res = await client.query(
        `UPDATE conciliacion_perfiles_banco
         SET nombre = $3,
             banco = $4,
             formato = $5,
             delimitador = $6,
             codificacion = $7,
             fila_encabezado = $8,
             formato_fecha = $9,
             separador_decimal = $10,
             mapeo_columnas_json = $11::jsonb,
             activo = $12,
             updated_by = $13,
             updated_at = CURRENT_TIMESTAMP
         WHERE empresa_id = $1 AND id = $2
         RETURNING id,
                   empresa_id AS "empresaId",
                   codigo,
                   nombre,
                   banco,
                   formato,
                   delimitador,
                   codificacion,
                   fila_encabezado AS "filaEncabezado",
                   formato_fecha AS "formatoFecha",
                   separador_decimal AS "separadorDecimal",
                   mapeo_columnas_json AS "mapeoColumnasJson",
                   es_sistema AS "esSistema",
                   activo,
                   created_at AS "createdAt",
                   updated_at AS "updatedAt"`,
        [
          empresaId,
          perfilId,
          data.nombre ?? anterior.nombre,
          data.banco ?? anterior.banco,
          data.formato ?? anterior.formato,
          data.delimitador !== undefined ? data.delimitador : anterior.delimitador,
          data.codificacion ?? anterior.codificacion,
          data.filaEncabezado ?? anterior.filaEncabezado,
          data.formatoFecha ?? anterior.formatoFecha,
          data.separadorDecimal ?? anterior.separadorDecimal,
          JSON.stringify(data.mapeoColumnas ?? anterior.mapeoColumnas),
          data.activo !== undefined ? data.activo : anterior.activo,
          usuarioId,
        ]
      );

      const actualizado = mapPerfilRow(res.rows[0]);
      await auditoriaChainService.registrar(
        {
          empresaId,
          usuarioId,
          tablaAfectada: 'conciliacion_perfiles_banco',
          registroId: actualizado.id!,
          accion: 'ACTUALIZAR_PERFIL_BANCO',
          datosAnteriores: {
            nombre: anterior.nombre,
            banco: anterior.banco,
            formato: anterior.formato,
            activo: anterior.activo,
            mapeoColumnasJson: anterior.mapeoColumnas,
          },
          datosNuevos: {
            nombre: actualizado.nombre,
            banco: actualizado.banco,
            formato: actualizado.formato,
            activo: actualizado.activo,
            mapeoColumnasJson: actualizado.mapeoColumnas,
          },
        },
        client
      );

      return actualizado;
    });
  },

  async eliminarPerfil(
    empresaId: string,
    perfilId: string,
    usuarioId: string
  ): Promise<{ eliminado: true; id: string }> {
    asegurarPostgresDisponible();
    asegurarUuid(empresaId, 'empresaId');
    asegurarUuid(perfilId, 'perfilId');
    asegurarUuid(usuarioId, 'usuarioId');

    return db.withEmpresaTransaction(empresaId, async (client) => {
      const actualRes = await client.query(
        `SELECT id, codigo, nombre, banco, es_sistema AS "esSistema"
         FROM conciliacion_perfiles_banco
         WHERE empresa_id = $1 AND id = $2
         FOR UPDATE`,
        [empresaId, perfilId]
      );

      if (actualRes.rows.length === 0) {
        throw new ConciliacionV2Error(404, 'PERFIL_BANCO_NO_ENCONTRADO', 'El perfil bancario no existe.');
      }

      const anterior = actualRes.rows[0];
      if (anterior.esSistema) {
        throw new ConciliacionV2Error(
          409,
          'PERFIL_SISTEMA_INMUTABLE',
          'Los perfiles del sistema no se pueden eliminar.'
        );
      }

      await client.query(
        `DELETE FROM conciliacion_perfiles_banco WHERE empresa_id = $1 AND id = $2`,
        [empresaId, perfilId]
      );

      await auditoriaChainService.registrar(
        {
          empresaId,
          usuarioId,
          tablaAfectada: 'conciliacion_perfiles_banco',
          registroId: perfilId,
          accion: 'ELIMINAR_PERFIL_BANCO',
          datosAnteriores: {
            id: anterior.id,
            codigo: anterior.codigo,
            nombre: anterior.nombre,
            banco: anterior.banco,
          },
        },
        client
      );

      return { eliminado: true, id: perfilId };
    });
  },
};
