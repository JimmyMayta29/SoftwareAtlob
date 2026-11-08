import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db, establecerContextoUsuario } from '../config/database';
import { env } from '../config/env';
import { auditoriaRepository } from '../repositories/auditoriaRepository';
import {
  authJwtService,
  normalizarRol,
  REFRESH_TOKENS_MEMORIA,
  RolEstudio,
  USUARIOS_EMPRESA_MEMORIA,
  USUARIOS_ESTUDIO_MEMORIA,
  UsuarioEstudioModel
} from './authJwtService';
import { licenciaService, ResumenLicencia } from './licenciaService';
import { normalizarIdentificadorUsuario, setupService } from './setupService';
import { totpService } from './totpService';

export interface UsuarioPublicoEstudio {
  id: string;
  email: string;
  nombre: string;
  rolGlobal: RolEstudio;
  mfaActivado: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface CrearColaboradorInput {
  nombre: string;
  usuario?: string;
  email?: string;
  password: string;
  rolGlobal: RolEstudio | string;
  empresaIds?: string[];
}

interface EnrolamientoMfaPendiente {
  secret: string;
  creadoEnMs: number;
  expiraEnMs: number;
}

const TTL_ENROLAMIENTO_MS = 10 * 60 * 1000;
const ENROLAMIENTOS_PENDIENTES = new Map<string, EnrolamientoMfaPendiente>();

function limpiarEnrolamientosExpirados(): void {
  const ahora = Date.now();
  for (const [uid, item] of ENROLAMIENTOS_PENDIENTES.entries()) {
    if (item.expiraEnMs <= ahora) {
      ENROLAMIENTOS_PENDIENTES.delete(uid);
    }
  }
}

function aUsuarioPublico(u: {
  id: string;
  email: string;
  nombre: string;
  rolGlobal: string;
  mfaActivado: boolean;
  isActive: boolean;
  createdAt: string | Date;
}): UsuarioPublicoEstudio {
  return {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    rolGlobal: normalizarRol(u.rolGlobal),
    mfaActivado: Boolean(u.mfaActivado),
    isActive: Boolean(u.isActive),
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt)
  };
}

function exigirAlmacenDisponible(): void {
  if (!db.isPostgresConnected() && (env.NODE_ENV === 'production' || env.DATABASE_URL)) {
    throw new Error('DATABASE_NO_DISPONIBLE');
  }
}

export const usuarioEstudioService = {
  async listarEstadoUsuarios(): Promise<{
    usuarios: UsuarioPublicoEstudio[];
    mfaRequerido: boolean;
    licencia: ResumenLicencia;
  }> {
    exigirAlmacenDisponible();
    const [mfaRequerido, licencia] = await Promise.all([
      authJwtService.obtenerMfaRequeridoEstudio(),
      licenciaService.obtenerResumen()
    ]);

    if (db.isPostgresConnected()) {
      const res = await db.query<{
        id: string;
        email: string;
        nombre: string;
        rolGlobal: string;
        mfaActivado: boolean;
        isActive: boolean;
        createdAt: Date | string;
      }>(`
        SELECT id, email, nombre, rol_global AS "rolGlobal",
               mfa_activado AS "mfaActivado", is_active AS "isActive",
               created_at AS "createdAt"
        FROM usuarios_estudio
        ORDER BY CASE WHEN rol_global = 'ADMINISTRADOR' THEN 0 ELSE 1 END, created_at ASC
      `);
      return {
        usuarios: res.rows.map(aUsuarioPublico),
        mfaRequerido,
        licencia
      };
    }

    return {
      usuarios: USUARIOS_ESTUDIO_MEMORIA.map(aUsuarioPublico),
      mfaRequerido,
      licencia
    };
  },

  async crearColaborador(
    actorId: string,
    datos: CrearColaboradorInput,
    metadatos?: { ip?: string; userAgent?: string }
  ): Promise<{ usuario: UsuarioPublicoEstudio; licencia: ResumenLicencia }> {
    exigirAlmacenDisponible();
    const actor = await authJwtService.obtenerUsuarioPorId(actorId);
    if (!actor || actor.rolGlobal !== 'ADMINISTRADOR') {
      throw new Error('PERMISO_INSUFICIENTE: Solo el administrador titular puede crear usuarios.');
    }

    const nombreLimpio = typeof datos.nombre === 'string' ? datos.nombre.trim() : '';
    if (nombreLimpio.length < 2 || nombreLimpio.length > 150) {
      throw new Error('DATOS_INVALIDOS: Ingrese el nombre completo del colaborador (entre 2 y 150 caracteres).');
    }

    const identificador = normalizarIdentificadorUsuario(datos.usuario || datos.email);
    const rol = normalizarRol(String(datos.rolGlobal || 'ASISTENTE_CONTABLE'));
    const validacionPass = setupService.validarPasswordSegura(datos.password, {
      usuario: identificador,
      nombre: nombreLimpio
    });
    if (!validacionPass.valida) {
      throw new Error(`PASSWORD_INSEGURA: ${validacionPass.mensaje}`);
    }

    const passwordHash = await bcrypt.hash(datos.password, 10);
    const nuevoId = crypto.randomUUID();
    const fechaActual = new Date().toISOString();

    if (db.isPostgresConnected()) {
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        await establecerContextoUsuario(client, actor.id);

        // Validación estricta del límite de licencia en servidor bajo bloqueo transaccional
        await licenciaService.validarCupoDisponible(client);

        const duplicado = await client.query(
          `SELECT id FROM usuarios_estudio WHERE lower(email) = $1 LIMIT 1`,
          [identificador]
        );
        if (duplicado.rows.length > 0) {
          throw new Error('USUARIO_DUPLICADO: Ya existe un usuario registrado con ese nombre o correo.');
        }

        const estudioRes = await client.query<{ tenantId: string }>(
          `SELECT tenant_id AS "tenantId" FROM estudio_configuracion WHERE id = TRUE LIMIT 1`
        );
        const tenantId = estudioRes.rows[0]?.tenantId;

        await client.query(
          `INSERT INTO usuarios_estudio (
             id, email, password_hash, nombre, rol_global, mfa_secret, mfa_activado, is_active, created_at
           )
           VALUES ($1, $2, $3, $4, $5, NULL, FALSE, TRUE, $6)`,
          [nuevoId, identificador, passwordHash, nombreLimpio, rol, fechaActual]
        );

        // Si existen empresas activas en el estudio y el rol no es ADMINISTRADOR, asignar membresías iniciales
        if (rol !== 'ADMINISTRADOR' && tenantId) {
          const empresasRes = await client.query<{ id: string }>(
            `SELECT id FROM empresas WHERE tenant_id = $1 AND is_active = TRUE`,
            [tenantId]
          );
          const candidatas = Array.isArray(datos.empresaIds)
            ? empresasRes.rows.filter(e => datos.empresaIds!.includes(e.id))
            : empresasRes.rows;

          if (candidatas.length > 0) {
            await client.query(
              "SELECT set_config('app.current_user_id', $1, true), set_config('app.usuario_id', $1, true)",
              [nuevoId]
            );
            for (const emp of candidatas) {
              await client.query(
                `INSERT INTO usuario_empresa (usuario_id, empresa_id, rol_en_empresa, estado)
                 VALUES ($1, $2, $3, 'ACTIVO')
                 ON CONFLICT (usuario_id, empresa_id) DO UPDATE SET rol_en_empresa = EXCLUDED.rol_en_empresa, estado = 'ACTIVO'`,
                [nuevoId, emp.id, rol]
              );
            }
            await establecerContextoUsuario(client, actor.id);
          }
        }

        await auditoriaRepository.registrar(
          {
            tenantId,
            usuarioId: actor.id,
            usuarioEmail: actor.email,
            tablaAfectada: 'usuarios_estudio',
            registroId: nuevoId,
            accion: 'INSERT',
            datosNuevos: {
              email: identificador,
              nombre: nombreLimpio,
              rolGlobal: rol,
              isActive: true,
              mfaActivado: false
            },
            direccionIp: metadatos?.ip,
            userAgent: metadatos?.userAgent
          },
          client
        );

        const licencia = await licenciaService.obtenerResumen(client);
        await client.query('COMMIT');

        return {
          usuario: {
            id: nuevoId,
            email: identificador,
            nombre: nombreLimpio,
            rolGlobal: rol,
            mfaActivado: false,
            isActive: true,
            createdAt: fechaActual
          },
          licencia
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    await licenciaService.validarCupoDisponible();
    if (USUARIOS_ESTUDIO_MEMORIA.some(u => u.email.toLowerCase() === identificador)) {
      throw new Error('USUARIO_DUPLICADO: Ya existe un usuario registrado con ese nombre o correo.');
    }

    const nuevoModelo: UsuarioEstudioModel = {
      id: nuevoId,
      email: identificador,
      passwordHash,
      nombre: nombreLimpio,
      rolGlobal: rol,
      mfaActivado: false,
      isActive: true,
      createdAt: fechaActual
    };
    USUARIOS_ESTUDIO_MEMORIA.push(nuevoModelo);

    if (rol !== 'ADMINISTRADOR') {
      const { EMPRESAS_STORE } = await import('../repositories/empresaRepository');
      const estadoSetup = await setupService.obtenerEstadoSetup();
      const empresasTenant = EMPRESAS_STORE.filter(
        e => e.isActive && (!estadoSetup.estudio?.tenantId || e.tenantId === estadoSetup.estudio.tenantId)
      );
      const candidatas = Array.isArray(datos.empresaIds)
        ? empresasTenant.filter(e => datos.empresaIds!.includes(e.id))
        : empresasTenant;
      for (const emp of candidatas) {
        USUARIOS_EMPRESA_MEMORIA.push({
          id: crypto.randomUUID(),
          usuarioId: nuevoId,
          empresaId: emp.id,
          rolEnEmpresa: rol,
          estado: 'ACTIVO',
          createdAt: fechaActual
        });
      }
    }

    const estadoSetup = await setupService.obtenerEstadoSetup();
    await auditoriaRepository.registrar({
      tenantId: estadoSetup.estudio?.tenantId,
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      tablaAfectada: 'usuarios_estudio',
      registroId: nuevoId,
      accion: 'INSERT',
      datosNuevos: {
        email: identificador,
        nombre: nombreLimpio,
        rolGlobal: rol,
        isActive: true,
        mfaActivado: false
      },
      direccionIp: metadatos?.ip,
      userAgent: metadatos?.userAgent
    });

    return {
      usuario: aUsuarioPublico(nuevoModelo),
      licencia: await licenciaService.obtenerResumen()
    };
  },

  async cambiarEstadoUsuario(
    actorId: string,
    usuarioObjetivoId: string,
    activo: boolean,
    metadatos?: { ip?: string; userAgent?: string }
  ): Promise<{ usuario: UsuarioPublicoEstudio; licencia: ResumenLicencia }> {
    exigirAlmacenDisponible();
    const actor = await authJwtService.obtenerUsuarioPorId(actorId);
    if (!actor || actor.rolGlobal !== 'ADMINISTRADOR') {
      throw new Error('PERMISO_INSUFICIENTE: Solo el administrador titular puede modificar el estado de usuarios.');
    }
    if (actor.id === usuarioObjetivoId && !activo) {
      throw new Error('OPERACION_NO_PERMITIDA: No puede desactivar su propia cuenta de administrador.');
    }

    if (db.isPostgresConnected()) {
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        await establecerContextoUsuario(client, actor.id);
        await client.query('SELECT pg_advisory_xact_lock(1398099540)');

        const resObjetivo = await client.query<{
          id: string;
          email: string;
          nombre: string;
          rolGlobal: string;
          mfaActivado: boolean;
          isActive: boolean;
          createdAt: Date | string;
        }>(
          `SELECT id, email, nombre, rol_global AS "rolGlobal",
                  mfa_activado AS "mfaActivado", is_active AS "isActive",
                  created_at AS "createdAt"
           FROM usuarios_estudio
           WHERE id = $1
           FOR UPDATE`,
          [usuarioObjetivoId]
        );
        const actual = resObjetivo.rows[0];
        if (!actual) {
          throw new Error('USUARIO_NO_ENCONTRADO: El usuario solicitado no existe.');
        }

        if (!actual.isActive && activo) {
          // Validar límite de licencia en servidor también al reactivar un usuario desactivado
          await licenciaService.validarCupoDisponible(client);
        }

        if (actual.isActive && !activo && actual.rolGlobal === 'ADMINISTRADOR') {
          const adminsActivos = await client.query<{ total: number }>(
            `SELECT COUNT(*)::int AS total FROM usuarios_estudio WHERE rol_global = 'ADMINISTRADOR' AND is_active = TRUE`
          );
          if ((adminsActivos.rows[0]?.total ?? 0) <= 1) {
            throw new Error('OPERACION_NO_PERMITIDA: Debe permanecer al menos un administrador activo.');
          }
        }

        if (actual.isActive !== activo) {
          await client.query(
            `UPDATE usuarios_estudio SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [activo, usuarioObjetivoId]
          );

          if (!activo) {
            await client.query(
              "SELECT set_config('app.current_user_id', $1, true), set_config('app.usuario_id', $1, true)",
              [usuarioObjetivoId]
            );
            await client.query(
              `UPDATE refresh_tokens SET revoked = TRUE WHERE usuario_id = $1 AND revoked = FALSE`,
              [usuarioObjetivoId]
            );
            await establecerContextoUsuario(client, actor.id);
          }

          const estudioRes = await client.query<{ tenantId: string }>(
            `SELECT tenant_id AS "tenantId" FROM estudio_configuracion WHERE id = TRUE LIMIT 1`
          );
          await auditoriaRepository.registrar(
            {
              tenantId: estudioRes.rows[0]?.tenantId,
              usuarioId: actor.id,
              usuarioEmail: actor.email,
              tablaAfectada: 'usuarios_estudio',
              registroId: usuarioObjetivoId,
              accion: 'UPDATE',
              datosAnteriores: { isActive: actual.isActive, email: actual.email, rolGlobal: actual.rolGlobal },
              datosNuevos: { isActive: activo, email: actual.email, rolGlobal: actual.rolGlobal },
              direccionIp: metadatos?.ip,
              userAgent: metadatos?.userAgent
            },
            client
          );
        }

        const licencia = await licenciaService.obtenerResumen(client);
        await client.query('COMMIT');
        return {
          usuario: aUsuarioPublico({ ...actual, isActive: activo }),
          licencia
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const actual = USUARIOS_ESTUDIO_MEMORIA.find(u => u.id === usuarioObjetivoId);
    if (!actual) {
      throw new Error('USUARIO_NO_ENCONTRADO: El usuario solicitado no existe.');
    }
    if (!actual.isActive && activo) {
      await licenciaService.validarCupoDisponible();
    }
    if (actual.isActive && !activo && actual.rolGlobal === 'ADMINISTRADOR') {
      const admins = USUARIOS_ESTUDIO_MEMORIA.filter(u => u.rolGlobal === 'ADMINISTRADOR' && u.isActive).length;
      if (admins <= 1) {
        throw new Error('OPERACION_NO_PERMITIDA: Debe permanecer al menos un administrador activo.');
      }
    }

    const estadoPrevio = actual.isActive;
    actual.isActive = activo;
    if (!activo) {
      for (const rt of REFRESH_TOKENS_MEMORIA) {
        if (rt.usuarioId === usuarioObjetivoId) rt.revoked = true;
      }
    }
    if (estadoPrevio !== activo) {
      const estadoSetup = await setupService.obtenerEstadoSetup();
      await auditoriaRepository.registrar({
        tenantId: estadoSetup.estudio?.tenantId,
        usuarioId: actor.id,
        usuarioEmail: actor.email,
        tablaAfectada: 'usuarios_estudio',
        registroId: usuarioObjetivoId,
        accion: 'UPDATE',
        datosAnteriores: { isActive: estadoPrevio, email: actual.email, rolGlobal: actual.rolGlobal },
        datosNuevos: { isActive: activo, email: actual.email, rolGlobal: actual.rolGlobal },
        direccionIp: metadatos?.ip,
        userAgent: metadatos?.userAgent
      });
    }

    return {
      usuario: aUsuarioPublico(actual),
      licencia: await licenciaService.obtenerResumen()
    };
  },

  /**
   * Inicia enrolamiento 2FA para el administrador.
   * La semilla se mantiene solo en memoria efímera hasta confirmar el código y se muestra una única vez.
   * Prohibido escribir la semilla en logs o auditoría.
   */
  async iniciarEnrolamientoMfa(actorId: string): Promise<{
    secret: string;
    otpauthUrl: string;
    expiraEnSegundos: number;
  }> {
    exigirAlmacenDisponible();
    limpiarEnrolamientosExpirados();
    const actor = await authJwtService.obtenerUsuarioPorId(actorId);
    if (!actor || actor.rolGlobal !== 'ADMINISTRADOR') {
      throw new Error('PERMISO_INSUFICIENTE: Solo el administrador puede enrolar el segundo factor.');
    }

    const generado = totpService.generarSecreto(actor.email, 'Atlob Consultores ERP');
    const ahora = Date.now();
    ENROLAMIENTOS_PENDIENTES.set(actor.id, {
      secret: generado.secret,
      creadoEnMs: ahora,
      expiraEnMs: ahora + TTL_ENROLAMIENTO_MS
    });

    return {
      secret: generado.secret,
      otpauthUrl: generado.otpauthUrl,
      expiraEnSegundos: Math.floor(TTL_ENROLAMIENTO_MS / 1000)
    };
  },

  /**
   * Confirma el enrolamiento TOTP y activa mfa_requerido en el estudio.
   * Registra únicamente el hecho en auditoría, jamás la semilla.
   */
  async activarMfaEstudio(
    actorId: string,
    codigoVerificacion: string,
    metadatos?: { ip?: string; userAgent?: string }
  ) {
    exigirAlmacenDisponible();
    limpiarEnrolamientosExpirados();
    const actor = await authJwtService.obtenerUsuarioPorId(actorId);
    if (!actor || actor.rolGlobal !== 'ADMINISTRADOR') {
      throw new Error('PERMISO_INSUFICIENTE: Solo el administrador puede activar el segundo factor.');
    }

    const codigo = typeof codigoVerificacion === 'string' ? codigoVerificacion.trim() : '';
    if (!/^\d{6}$/.test(codigo)) {
      throw new Error('MFA_CODIGO_INVALIDO: Ingrese el código de 6 dígitos generado por su aplicación.');
    }

    const pendiente = ENROLAMIENTOS_PENDIENTES.get(actor.id);
    const secretoCandidato = pendiente?.secret || actor.mfaSecret;
    if (!secretoCandidato) {
      throw new Error('MFA_ENROLAMIENTO_REQUERIDO: Genere primero la clave de vinculación para su aplicación autenticadora.');
    }
    if (!totpService.validarToken(secretoCandidato, codigo)) {
      throw new Error('MFA_CODIGO_INVALIDO: El código de 6 dígitos no coincide con su aplicación de autenticación.');
    }

    ENROLAMIENTOS_PENDIENTES.delete(actor.id);
    const mfaPrevio = await authJwtService.obtenerMfaRequeridoEstudio();

    if (db.isPostgresConnected()) {
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        await establecerContextoUsuario(client, actor.id);

        await client.query(
          `UPDATE usuarios_estudio
           SET mfa_secret = $1, mfa_activado = TRUE, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [secretoCandidato, actor.id]
        );
        await setupService.actualizarMfaRequerido(true, client);

        const estudioRes = await client.query<{ tenantId: string }>(
          `SELECT tenant_id AS "tenantId" FROM estudio_configuracion WHERE id = TRUE LIMIT 1`
        );
        await auditoriaRepository.registrar(
          {
            tenantId: estudioRes.rows[0]?.tenantId,
            usuarioId: actor.id,
            usuarioEmail: actor.email,
            tablaAfectada: 'estudio_configuracion',
            registroId: actor.id,
            accion: 'MFA_ACTIVADO',
            datosAnteriores: { mfaRequerido: mfaPrevio, mfaActivado: actor.mfaActivado },
            datosNuevos: { mfaRequerido: true, mfaActivado: true },
            direccionIp: metadatos?.ip,
            userAgent: metadatos?.userAgent
          },
          client
        );

        const usuarioActualizado: UsuarioEstudioModel = {
          ...actor,
          mfaSecret: secretoCandidato,
          mfaActivado: true
        };
        const sesion = await authJwtService.emitirSesion(usuarioActualizado, true, undefined, client);
        await client.query('COMMIT');
        return {
          mfaRequerido: true,
          mfaActivado: true,
          sesion
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const modeloMem = USUARIOS_ESTUDIO_MEMORIA.find(u => u.id === actor.id);
    if (!modeloMem) throw new Error('USUARIO_NO_ENCONTRADO');
    modeloMem.mfaSecret = secretoCandidato;
    modeloMem.mfaActivado = true;
    await setupService.actualizarMfaRequerido(true);

    const estadoSetup = await setupService.obtenerEstadoSetup();
    await auditoriaRepository.registrar({
      tenantId: estadoSetup.estudio?.tenantId,
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      tablaAfectada: 'estudio_configuracion',
      registroId: actor.id,
      accion: 'MFA_ACTIVADO',
      datosAnteriores: { mfaRequerido: mfaPrevio, mfaActivado: actor.mfaActivado },
      datosNuevos: { mfaRequerido: true, mfaActivado: true },
      direccionIp: metadatos?.ip,
      userAgent: metadatos?.userAgent
    });

    const sesion = await authJwtService.emitirSesion(modeloMem, true);
    return {
      mfaRequerido: true,
      mfaActivado: true,
      sesion
    };
  },

  /**
   * Desactiva el 2FA requerido en el estudio y limpia la vinculación del administrador.
   * Registra únicamente el hecho en auditoría, sin semillas ni secretos.
   */
  async desactivarMfaEstudio(
    actorId: string,
    metadatos?: { ip?: string; userAgent?: string }
  ): Promise<{ mfaRequerido: boolean; mfaActivado: boolean }> {
    exigirAlmacenDisponible();
    ENROLAMIENTOS_PENDIENTES.delete(actorId);
    const actor = await authJwtService.obtenerUsuarioPorId(actorId);
    if (!actor || actor.rolGlobal !== 'ADMINISTRADOR') {
      throw new Error('PERMISO_INSUFICIENTE: Solo el administrador puede desactivar el segundo factor.');
    }

    const mfaPrevio = await authJwtService.obtenerMfaRequeridoEstudio();

    if (db.isPostgresConnected()) {
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        await establecerContextoUsuario(client, actor.id);

        await setupService.actualizarMfaRequerido(false, client);
        await client.query(
          `UPDATE usuarios_estudio
           SET mfa_activado = FALSE, mfa_secret = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [actor.id]
        );

        const estudioRes = await client.query<{ tenantId: string }>(
          `SELECT tenant_id AS "tenantId" FROM estudio_configuracion WHERE id = TRUE LIMIT 1`
        );
        await auditoriaRepository.registrar(
          {
            tenantId: estudioRes.rows[0]?.tenantId,
            usuarioId: actor.id,
            usuarioEmail: actor.email,
            tablaAfectada: 'estudio_configuracion',
            registroId: actor.id,
            accion: 'MFA_DESACTIVADO',
            datosAnteriores: { mfaRequerido: mfaPrevio, mfaActivado: actor.mfaActivado },
            datosNuevos: { mfaRequerido: false, mfaActivado: false },
            direccionIp: metadatos?.ip,
            userAgent: metadatos?.userAgent
          },
          client
        );

        await client.query('COMMIT');
        return { mfaRequerido: false, mfaActivado: false };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const modeloMem = USUARIOS_ESTUDIO_MEMORIA.find(u => u.id === actor.id);
    if (modeloMem) {
      modeloMem.mfaActivado = false;
      modeloMem.mfaSecret = undefined;
    }
    await setupService.actualizarMfaRequerido(false);

    const estadoSetup = await setupService.obtenerEstadoSetup();
    await auditoriaRepository.registrar({
      tenantId: estadoSetup.estudio?.tenantId,
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      tablaAfectada: 'estudio_configuracion',
      registroId: actor.id,
      accion: 'MFA_DESACTIVADO',
      datosAnteriores: { mfaRequerido: mfaPrevio, mfaActivado: actor.mfaActivado },
      datosNuevos: { mfaRequerido: false, mfaActivado: false },
      direccionIp: metadatos?.ip,
      userAgent: metadatos?.userAgent
    });

    return { mfaRequerido: false, mfaActivado: false };
  }
};

