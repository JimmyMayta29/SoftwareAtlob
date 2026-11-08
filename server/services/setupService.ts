import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { db } from '../config/database';
import { env } from '../config/env';
import { runSeeds } from '../db/seed';
import { runCatalogosSeeds } from '../db/seed_catalogos';
import {
  REFRESH_TOKENS_MEMORIA,
  USUARIOS_ESTUDIO_MEMORIA,
  authJwtService,
  establecerMfaRequeridoMemoria,
  obtenerMfaRequeridoMemoria,
  UsuarioEstudioModel
} from './authJwtService';
import {
  establecerLicenciaMemoria,
  licenciaService,
  obtenerLicenciaMemoria
} from './licenciaService';
import { totpService } from './totpService';

export interface DatosEstudioContable {
  tenantId: string;
  nombreEstudio: string;
  rucEstudio?: string | null;
  emailContacto?: string | null;
  telefonoContacto?: string | null;
  direccionFiscal?: string | null;
  mfaRequerido: boolean;
  fechaRegistro: string;
}

export interface EvaluacionPassword {
  valida: boolean;
  puntaje: 0 | 1 | 2 | 3 | 4;
  nivel: 'DEBIL' | 'ACEPTABLE' | 'FUERTE' | 'MUY_FUERTE';
  mensaje?: string;
}

const PATRONES_TRIVIALES = [
  'password',
  'contrasena',
  'contraseña',
  'administrador',
  'admin123',
  'qwerty',
  'asdfgh',
  '123456',
  '234567',
  '345678',
  '456789',
  '654321',
  '987654',
  '000000',
  '111111',
  'abcdef',
  'sistema123',
  'contable123',
  'atloberp'
];

export interface SetupInicialInput {
  nombreEstudio: string;
  rucEstudio?: string;
  emailContacto?: string;
  telefonoContacto?: string;
  direccionFiscal?: string;
  adminNombre: string;
  usuario?: string;
  adminEmail?: string;
  adminPassword: string;
  adminPasswordConfirm?: string;
  mfaRequerido?: boolean;
  mfaSecret?: string;
  mfaCodigoVerificacion?: string;
}

const setupInicialBaseSchema = z.object({
  nombreEstudio: z.string().trim().min(2, 'Ingrese el nombre del estudio contable (mínimo 2 caracteres).').max(150),
  rucEstudio: z.string().trim().optional().or(z.literal('')),
  emailContacto: z.string().trim().max(150).optional().or(z.literal('')),
  telefonoContacto: z.string().trim().max(40).optional().or(z.literal('')),
  direccionFiscal: z.string().trim().max(500).optional().or(z.literal('')),
  adminNombre: z.string().trim().min(2, 'Ingrese su nombre completo (mínimo 2 caracteres).').max(150),
  usuario: z.string().trim().max(120).optional(),
  adminEmail: z.string().trim().max(120).optional(),
  adminPassword: z.string(),
  adminPasswordConfirm: z.string().optional(),
  mfaRequerido: z.boolean().optional(),
  mfaSecret: z.string().trim().optional().or(z.literal('')),
  mfaCodigoVerificacion: z.string().trim().optional().or(z.literal(''))
});

// Almacén en memoria del estudio contable (solo en entorno de pruebas sin PostgreSQL)
let ESTUDIO_CONFIGURADO: DatosEstudioContable | null = null;

export function normalizarIdentificadorUsuario(raw?: string): string {
  if (typeof raw !== 'string') {
    throw new Error('USUARIO_INVALIDO: Ingrese un nombre de usuario o correo electrónico.');
  }
  const limpio = raw.trim().toLowerCase();
  if (limpio.length < 3 || limpio.length > 120) {
    throw new Error('USUARIO_INVALIDO: El usuario debe tener entre 3 y 120 caracteres.');
  }
  if (limpio.includes('@')) {
    const parsed = z.string().email().safeParse(limpio);
    if (!parsed.success) {
      throw new Error('USUARIO_INVALIDO: Ingrese un correo electrónico válido.');
    }
    return limpio;
  }
  if (!/^[a-z0-9](?:[a-z0-9._-]{1,78}[a-z0-9])?$/.test(limpio)) {
    throw new Error('USUARIO_INVALIDO: Use letras, números, punto, guion o guion bajo (sin espacios).');
  }
  return limpio;
}

export function evaluarFortalezaPassword(
  password: string,
  contexto?: { usuario?: string; nombre?: string }
): EvaluacionPassword {
  if (!password || password.length < 10) {
    return {
      valida: false,
      puntaje: 0,
      nivel: 'DEBIL',
      mensaje: 'La contraseña debe tener al menos 10 caracteres.'
    };
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return {
      valida: false,
      puntaje: 0,
      nivel: 'DEBIL',
      mensaje: 'La contraseña admite como máximo 72 bytes.'
    };
  }

  const minuscula = password.toLowerCase();
  if (PATRONES_TRIVIALES.some(patron => minuscula.includes(patron))) {
    return {
      valida: false,
      puntaje: 1,
      nivel: 'DEBIL',
      mensaje: 'La contraseña elegida es demasiado común o predecible. Use una combinación propia.'
    };
  }
  if (/(.)\1{3,}/.test(password)) {
    return {
      valida: false,
      puntaje: 1,
      nivel: 'DEBIL',
      mensaje: 'No repita el mismo carácter cuatro o más veces seguidas.'
    };
  }
  if (new Set(minuscula).size < 5) {
    return {
      valida: false,
      puntaje: 1,
      nivel: 'DEBIL',
      mensaje: 'La contraseña debe contener al menos 5 caracteres diferentes.'
    };
  }

  const baseUsuario = contexto?.usuario?.trim().toLowerCase().split('@')[0] || '';
  if (baseUsuario.length >= 4 && minuscula.includes(baseUsuario)) {
    return {
      valida: false,
      puntaje: 1,
      nivel: 'DEBIL',
      mensaje: 'La contraseña no debe incluir su nombre de usuario.'
    };
  }

  const tieneMayus = /[A-ZÁÉÍÓÚÑ]/.test(password);
  const tieneMinus = /[a-záéíóúñ]/.test(password);
  const tieneNumero = /[0-9]/.test(password);
  const tieneSimbolo = /[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9\s]/.test(password);
  const clases = [tieneMayus, tieneMinus, tieneNumero, tieneSimbolo].filter(Boolean).length;

  if (!(tieneMayus || tieneMinus) || !tieneNumero) {
    return {
      valida: false,
      puntaje: 1,
      nivel: 'DEBIL',
      mensaje: 'La contraseña debe incluir letras y al menos un número.'
    };
  }

  if (clases < 3 && password.length < 14) {
    return {
      valida: false,
      puntaje: 1,
      nivel: 'DEBIL',
      mensaje: 'Combine mayúsculas, minúsculas y números (o use una frase de al menos 14 caracteres con números).'
    };
  }

  if (clases === 4 && password.length >= 14) {
    return { valida: true, puntaje: 4, nivel: 'MUY_FUERTE' };
  }
  if (clases >= 4 || password.length >= 13) {
    return { valida: true, puntaje: 3, nivel: 'FUERTE' };
  }
  return { valida: true, puntaje: 2, nivel: 'ACEPTABLE' };
}

export const setupService = {
  /**
   * Valida RUC peruano según algoritmo oficial Módulo 11
   */
  validarRucModulo11(ruc: string): boolean {
    if (!ruc || typeof ruc !== 'string') return false;
    const clean = ruc.trim();
    if (!/^(10|15|17|20)\d{9}$/.test(clean)) return false;

    const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let suma = 0;
    for (let i = 0; i < 10; i++) {
      suma += parseInt(clean[i], 10) * factores[i];
    }
    const residuo = suma % 11;
    let digitoEsperado = 11 - residuo;
    if (digitoEsperado === 10) digitoEsperado = 0;
    else if (digitoEsperado === 11) digitoEsperado = 1;

    return parseInt(clean[10], 10) === digitoEsperado;
  },

  /**
   * Valida complejidad y fortaleza de contraseña (mínimo 10 caracteres, no trivial)
   */
  validarPasswordSegura(
    password: string,
    contexto?: { usuario?: string; nombre?: string }
  ): { valida: boolean; mensaje?: string; nivel?: EvaluacionPassword['nivel']; puntaje?: EvaluacionPassword['puntaje'] } {
    const evaluacion = evaluarFortalezaPassword(password, contexto);
    return {
      valida: evaluacion.valida,
      mensaje: evaluacion.mensaje,
      nivel: evaluacion.nivel,
      puntaje: evaluacion.puntaje
    };
  },

  /**
   * Verifica si el sistema ya fue configurado inicialmente con un ADMINISTRADOR
   */
  async estaConfigurado(): Promise<boolean> {
    if (db.isPostgresConnected()) {
      const res = await db.query(`
        SELECT COUNT(*) as count FROM usuarios_estudio WHERE rol_global = 'ADMINISTRADOR'
      `);
      const count = parseInt(res.rows[0]?.count || '0', 10);
      return count > 0;
    }
    if (env.NODE_ENV === 'production' || env.DATABASE_URL) throw new Error('DATABASE_NO_DISPONIBLE');
    return USUARIOS_ESTUDIO_MEMORIA.some(u => u.rolGlobal === 'ADMINISTRADOR');
  },

  /**
   * Obtiene la información del estudio o estado no configurado
   */
  async obtenerEstadoSetup() {
    const configurado = await this.estaConfigurado();
    if (db.isPostgresConnected()) {
      const resultado = await db.query(`
        SELECT tenant_id AS "tenantId", nombre_estudio AS "nombreEstudio", ruc_estudio AS "rucEstudio",
               email_contacto AS "emailContacto", telefono_contacto AS "telefonoContacto",
               direccion_fiscal AS "direccionFiscal", mfa_requerido AS "mfaRequerido",
               fecha_registro AS "fechaRegistro"
        FROM estudio_configuracion WHERE id = TRUE
      `);
      return { configurado, estudio: (resultado.rows[0] as DatosEstudioContable) || null };
    }
    return {
      configurado,
      estudio: configurado ? ESTUDIO_CONFIGURADO : null
    };
  },

  async actualizarMfaRequerido(mfaRequerido: boolean, client?: PoolClient): Promise<void> {
    if (db.isPostgresConnected()) {
      const sql = `UPDATE estudio_configuracion SET mfa_requerido = $1 WHERE id = TRUE`;
      if (client) await client.query(sql, [mfaRequerido]);
      else await db.query(sql, [mfaRequerido]);
      return;
    }
    establecerMfaRequeridoMemoria(mfaRequerido);
    if (ESTUDIO_CONFIGURADO) {
      ESTUDIO_CONFIGURADO = { ...ESTUDIO_CONFIGURADO, mfaRequerido };
    }
  },

  /**
   * Genera un nuevo secreto MFA TOTP (RFC 6238) en Base32
   */
  generarMfaSecret(identificador: string) {
    const cuenta = normalizarIdentificadorUsuario(identificador);
    return totpService.generarSecreto(cuenta, 'Atlob Consultores ERP');
  },

  /**
   * Inicializa el estudio contable en una sola transacción:
   * catálogos normativos, semillas, licencia local de evaluación, estudio y titular ADMINISTRADOR.
   */
  async inicializarEstudio(datos: SetupInicialInput) {
    const parsed = setupInicialBaseSchema.safeParse(datos);
    if (!parsed.success) {
      const primerMensaje = parsed.error.issues[0]?.message || 'Datos de configuración inicial inválidos.';
      throw new Error(`DATOS_INVALIDOS: ${primerMensaje}`);
    }
    const input = parsed.data;

    if (input.adminPasswordConfirm !== undefined && input.adminPassword !== input.adminPasswordConfirm) {
      throw new Error('PASSWORD_NO_COINCIDE: La contraseña y su confirmación no coinciden.');
    }

    const identificadorUsuario = normalizarIdentificadorUsuario(input.usuario || input.adminEmail);

    const yaConfigurado = await this.estaConfigurado();
    if (yaConfigurado) {
      throw new Error('SISTEMA_YA_CONFIGURADO: El estudio ya cuenta con un usuario Administrador configurado.');
    }

    // 1. Validar RUC del Estudio solo si fue proporcionado (opcional en inicio rápido)
    const rucLimpio = input.rucEstudio?.trim() || '';
    if (rucLimpio.length > 0 && !this.validarRucModulo11(rucLimpio)) {
      throw new Error('RUC_INVALIDO: El RUC del estudio no cumple con el algoritmo Módulo 11 de SUNAT.');
    }

    const emailContactoLimpio = input.emailContacto?.trim() || '';
    if (emailContactoLimpio.length > 0 && !z.string().email().safeParse(emailContactoLimpio).success) {
      throw new Error('EMAIL_INVALIDO: El correo de contacto ingresado no tiene un formato válido.');
    }

    // 2. Validar contraseña (mínimo 10 caracteres y rechazo de contraseñas triviales)
    const checkPass = this.validarPasswordSegura(input.adminPassword, {
      usuario: identificadorUsuario,
      nombre: input.adminNombre
    });
    if (!checkPass.valida) {
      throw new Error(`PASSWORD_INSEGURA: ${checkPass.mensaje}`);
    }

    // 3. Configurar 2FA según modo solicitado (por defecto false en escritorio; true si se envía enrolamiento TOTP)
    const mfaSecretLimpio = input.mfaSecret?.trim() || '';
    const mfaCodigoLimpio = input.mfaCodigoVerificacion?.trim() || '';
    const tieneDatosMfa = mfaSecretLimpio.length > 0 || mfaCodigoLimpio.length > 0;
    const mfaRequerido = input.mfaRequerido ?? tieneDatosMfa;

    let mfaActivado = false;
    let mfaSecretFinal: string | undefined;

    if (tieneDatosMfa || mfaRequerido) {
      if (!/^[A-Z2-7]{16,64}$/.test(mfaSecretLimpio) || !/^\d{6}$/.test(mfaCodigoLimpio)) {
        throw new Error('MFA_OBLIGATORIO: Se requiere configurar el segundo factor de autenticación TOTP para activar 2FA.');
      }
      const mfaValido = authJwtService.verificarTotp(mfaSecretLimpio, mfaCodigoLimpio);
      if (!mfaValido) {
        throw new Error('MFA_CODIGO_INVALIDO: El código de 6 dígitos ingresado no coincide con el generador de autenticación.');
      }
      mfaActivado = true;
      mfaSecretFinal = mfaSecretLimpio;
    }

    // 4. Crear ADMINISTRADOR titular de la PC
    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(input.adminPassword, 10);
    const fechaActual = new Date().toISOString();

    const nuevoAdmin: UsuarioEstudioModel = {
      id: userId,
      email: identificadorUsuario,
      passwordHash,
      nombre: input.adminNombre.trim(),
      rolGlobal: 'ADMINISTRADOR',
      mfaSecret: mfaSecretFinal,
      mfaActivado,
      isActive: true,
      createdAt: fechaActual
    };

    const estudio: DatosEstudioContable = {
      tenantId: crypto.randomUUID(),
      nombreEstudio: input.nombreEstudio.trim(),
      rucEstudio: rucLimpio || null,
      emailContacto: emailContactoLimpio || (identificadorUsuario.includes('@') ? identificadorUsuario : null),
      telefonoContacto: input.telefonoContacto?.trim() || null,
      direccionFiscal: input.direccionFiscal?.trim() || null,
      mfaRequerido,
      fechaRegistro: fechaActual
    };

    if (db.isPostgresConnected()) {
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        // Serializa el primer arranque entre procesos y evita dos administradores iniciales.
        await client.query('SELECT pg_advisory_xact_lock(1398099539)');
        const existente = await client.query("SELECT id FROM usuarios_estudio WHERE rol_global = 'ADMINISTRADOR' LIMIT 1");
        if (existente.rows.length) {
          throw new Error('SISTEMA_YA_CONFIGURADO: El estudio ya cuenta con un usuario Administrador configurado.');
        }

        // Carga automática de semillas y catálogos normativos en la misma transacción
        await runSeeds(client);
        await runCatalogosSeeds(client);

        await client.query('INSERT INTO tenants (id, nombre) VALUES ($1, $2)', [estudio.tenantId, estudio.nombreEstudio]);
        await client.query(`
          INSERT INTO usuarios_estudio (id, email, password_hash, nombre, rol_global, mfa_secret, mfa_activado, is_active, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
        `, [
          nuevoAdmin.id,
          nuevoAdmin.email,
          nuevoAdmin.passwordHash,
          nuevoAdmin.nombre,
          nuevoAdmin.rolGlobal,
          nuevoAdmin.mfaSecret || null,
          nuevoAdmin.mfaActivado,
          fechaActual
        ]);
        await client.query(`
          INSERT INTO estudio_configuracion (
            id, tenant_id, nombre_estudio, ruc_estudio, email_contacto,
            telefono_contacto, direccion_fiscal, mfa_requerido, fecha_registro
          )
          VALUES (TRUE, $1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          estudio.tenantId,
          estudio.nombreEstudio,
          estudio.rucEstudio,
          estudio.emailContacto,
          estudio.telefonoContacto,
          estudio.direccionFiscal,
          estudio.mfaRequerido,
          fechaActual
        ]);
        const licencia = await licenciaService.crearLicenciaInicial(client, {
          tipo: 'EVALUACION',
          maxUsuarios: 3
        });
        const sesion = await authJwtService.emitirSesion(nuevoAdmin, mfaActivado, undefined, client);
        await client.query('COMMIT');
        return { estudio, licencia, ...sesion };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    if (env.NODE_ENV === 'production' || env.DATABASE_URL) throw new Error('DATABASE_NO_DISPONIBLE');
    if (USUARIOS_ESTUDIO_MEMORIA.some(u => u.rolGlobal === 'ADMINISTRADOR')) {
      throw new Error('SISTEMA_YA_CONFIGURADO: El estudio ya cuenta con un usuario Administrador configurado.');
    }
    const estudioAnterior = ESTUDIO_CONFIGURADO;
    const mfaAnterior = obtenerMfaRequeridoMemoria();
    const licenciaAnterior = obtenerLicenciaMemoria();
    USUARIOS_ESTUDIO_MEMORIA.push(nuevoAdmin);
    establecerMfaRequeridoMemoria(estudio.mfaRequerido);
    try {
      const licencia = await licenciaService.crearLicenciaInicial(undefined, {
        tipo: 'EVALUACION',
        maxUsuarios: 3
      });
      const sesion = await authJwtService.emitirSesion(nuevoAdmin, mfaActivado);
      ESTUDIO_CONFIGURADO = estudio;
      return { estudio, licencia, ...sesion };
    } catch (err) {
      const idx = USUARIOS_ESTUDIO_MEMORIA.indexOf(nuevoAdmin);
      if (idx >= 0) USUARIOS_ESTUDIO_MEMORIA.splice(idx, 1);
      for (let i = REFRESH_TOKENS_MEMORIA.length - 1; i >= 0; i--) {
        if (REFRESH_TOKENS_MEMORIA[i].usuarioId === nuevoAdmin.id) REFRESH_TOKENS_MEMORIA.splice(i, 1);
      }
      ESTUDIO_CONFIGURADO = estudioAnterior;
      establecerMfaRequeridoMemoria(mfaAnterior);
      establecerLicenciaMemoria(licenciaAnterior);
      throw err;
    }
  }
};
