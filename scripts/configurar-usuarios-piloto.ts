import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { initializeDatabase, closeDatabase, db } from '../server/config/database';
import { usuarioEstudioService } from '../server/services/usuarioEstudioService';
import { licenciaService } from '../server/services/licenciaService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT_PATH = path.join(PROJECT_ROOT, 'storage', 'instancia', 'credenciales-piloto-local.json');

interface UsuarioPilotoDefinicion {
  usuario: string;
  nombre: string;
  rolGlobal: 'CONTADOR_SENIOR' | 'ASISTENTE_CONTABLE';
}

interface CredencialGuardada {
  id: string;
  usuario: string;
  nombre: string;
  rolGlobal: string;
  password: string;
  empresasAsignadas: string[];
  estado: 'CREADO' | 'REUTILIZADO' | 'ROTADO';
}

const COLABORADORES_PILOTO: UsuarioPilotoDefinicion[] = [
  {
    usuario: 'contador_lan',
    nombre: 'Contador Piloto LAN',
    rolGlobal: 'CONTADOR_SENIOR',
  },
  {
    usuario: 'asistente_lan',
    nombre: 'Asistente Piloto LAN',
    rolGlobal: 'ASISTENTE_CONTABLE',
  },
];

function getArgValue(flag: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return fallback;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function restringirPermisosNtfs(filePath: string): void {
  if (process.platform !== 'win32') return;
  const usuarioActual = process.env.USERNAME || 'jimmy';
  execFileSync(
    'icacls.exe',
    [filePath, '/inheritance:r', '/grant:r', '*S-1-5-18:(F)', '*S-1-5-32-544:(F)', `${usuarioActual}:(F)`],
    { stdio: 'ignore' }
  );
}

function generarPasswordFuerte(): string {
  const randomPart = crypto.randomBytes(8).toString('base64url');
  return `AtlobLan#26!${randomPart}`;
}

async function main() {
  const dbEnv = getArgValue('--db-env', 'DATABASE_URL')!;
  const explicitDbUrl = getArgValue('--database-url');
  const targetDbUrl = explicitDbUrl || process.env[dbEnv];
  const rucFiltro = getArgValue('--ruc', '10722364002')!;
  const outPath = path.resolve(PROJECT_ROOT, getArgValue('--output', DEFAULT_OUT_PATH)!);
  const rotarClaves = hasFlag('--rotar-claves');

  if (!targetDbUrl) {
    throw new Error(`DB_URL_NO_CONFIGURADA: No existe variable ${dbEnv} ni argumento --database-url.`);
  }

  // Asegurar que database.ts utilice exactamente la URL solicitada
  process.env.DATABASE_URL = targetDbUrl;
  await initializeDatabase();

  const pool = new Pool({ connectionString: targetDbUrl });
  try {
    const dbMeta = await pool.query<{ db: string }>('SELECT current_database() AS db');
    const dbNombre = dbMeta.rows[0]?.db;

    // Ubicar administrador activo titular
    const adminRes = await pool.query<{ id: string; email: string; nombre: string }>(
      `SELECT id, email, nombre
       FROM usuarios_estudio
       WHERE rol_global = 'ADMINISTRADOR' AND is_active = TRUE
       ORDER BY created_at ASC
       LIMIT 1`
    );
    const admin = adminRes.rows[0];
    if (!admin) {
      throw new Error('ADMIN_NO_ENCONTRADO: Inicialice el sistema primero antes de provisionar colaboradores piloto.');
    }

    // Ubicar empresa destino (10722364002 en producción o primera empresa disponible si --ruc coincide)
    const empRes = await pool.query<{ id: string; ruc: string; razon_social: string }>(
      `SELECT id, ruc, razon_social
       FROM empresas
       WHERE ($1::text IS NULL OR ruc = $1)
       ORDER BY created_at ASC`,
      [rucFiltro || null]
    );
    if (empRes.rows.length === 0) {
      throw new Error(`EMPRESA_NO_ENCONTRADA: No existe empresa activa para RUC ${rucFiltro}.`);
    }
    const empresaIds = empRes.rows.map((e) => String(e.id));

    // Leer credenciales locales previas si existen (idempotencia sin exponer contraseñas)
    let prevCreds: Record<string, string> = {};
    if (fs.existsSync(outPath)) {
      try {
        const prevJson = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        for (const u of prevJson?.colaboradores || []) {
          if (u?.usuario && u?.password) {
            prevCreds[String(u.usuario).toLowerCase()] = String(u.password);
          }
        }
      } catch {
        // Ignorar archivo corrupto previo
      }
    }

    const licencia = await licenciaService.obtenerLicencia();
    const maxUsuarios = licencia?.maxUsuarios ?? 3;
    const guardados: CredencialGuardada[] = [];

    for (const def of COLABORADORES_PILOTO) {
      const existenteRes = await pool.query<{ id: string; is_active: boolean; rol_global: string }>(
        `SELECT id, is_active, rol_global
         FROM usuarios_estudio
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [def.usuario]
      );
      const existente = existenteRes.rows[0];

      if (existente) {
        if (!existente.is_active) {
          await usuarioEstudioService.cambiarEstadoUsuario(admin.id, existente.id, true);
        }

        // Asegurar membresía en usuario_empresa para la empresa destino respetando RLS (app.usuario_id = usuario_id)
        for (const empId of empresaIds) {
          await db.withTenantAndEmpresa(existente.id, empId, async (client) => {
            await client.query(
              `INSERT INTO usuario_empresa (usuario_id, empresa_id, rol_en_empresa, estado)
               VALUES ($1, $2, $3, 'ACTIVO')
               ON CONFLICT (usuario_id, empresa_id) DO UPDATE SET rol_en_empresa = EXCLUDED.rol_en_empresa, estado = 'ACTIVO'`,
              [existente.id, empId, def.rolGlobal]
            );
          });
        }

        let passwordFinal = prevCreds[def.usuario.toLowerCase()];
        let estado: CredencialGuardada['estado'] = 'REUTILIZADO';

        if (!passwordFinal || rotarClaves) {
          passwordFinal = generarPasswordFuerte();
          const passwordHash = await bcrypt.hash(passwordFinal, 10);
          await db.withUsuarioTransaction(admin.id, async (client) => {
            await client.query(
              `UPDATE usuarios_estudio SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [passwordHash, existente.id]
            );
          });
          estado = 'ROTADO';
        }

        guardados.push({
          id: String(existente.id),
          usuario: def.usuario,
          nombre: def.nombre,
          rolGlobal: def.rolGlobal,
          password: passwordFinal,
          empresasAsignadas: empRes.rows.map((e) => e.ruc),
          estado,
        });
        continue;
      }

      const cupo = await licenciaService.puedeCrearUsuario();
      if (!cupo.permitido) {
        throw new Error(
          `CUPO_LICENCIA_ALCANZADO: Usados ${cupo.usados}/${cupo.maxUsuarios} al intentar crear ${def.usuario}.`
        );
      }

      const nuevaPassword = generarPasswordFuerte();
      const creado = await usuarioEstudioService.crearColaborador(admin.id, {
        nombre: def.nombre,
        usuario: def.usuario,
        password: nuevaPassword,
        rolGlobal: def.rolGlobal,
        empresaIds,
      });

      // Garantizar membresía explícita respetando RLS (app.usuario_id = usuario creado)
      for (const empId of empresaIds) {
        await db.withTenantAndEmpresa(creado.usuario.id, empId, async (client) => {
          await client.query(
            `INSERT INTO usuario_empresa (usuario_id, empresa_id, rol_en_empresa, estado)
             VALUES ($1, $2, $3, 'ACTIVO')
             ON CONFLICT (usuario_id, empresa_id) DO UPDATE SET rol_en_empresa = EXCLUDED.rol_en_empresa, estado = 'ACTIVO'`,
            [creado.usuario.id, empId, def.rolGlobal]
          );
        });
      }

      guardados.push({
        id: creado.usuario.id,
        usuario: def.usuario,
        nombre: def.nombre,
        rolGlobal: def.rolGlobal,
        password: nuevaPassword,
        empresasAsignadas: empRes.rows.map((e) => e.ruc),
        estado: 'CREADO',
      });
    }

    const totalActivos = await licenciaService.usuariosActivos();
    if (totalActivos > maxUsuarios) {
      throw new Error(`EXCESO_MAX_USUARIOS: ${totalActivos} activos supera máximo ${maxUsuarios}`);
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const documentoSalida = {
      generadoEn: new Date().toISOString(),
      baseDatos: dbNombre,
      administradorTitular: {
        id: admin.id,
        usuario: admin.email,
        nombre: admin.nombre,
        nota: 'La contraseña del administrador titular no se modifica ni se almacena aquí.',
      },
      licencia: {
        tipo: licencia?.tipo ?? 'EVALUACION',
        maxUsuarios,
        usuariosActivos: totalActivos,
      },
      empresasAutorizadas: empRes.rows.map((e) => ({
        id: e.id,
        ruc: e.ruc,
        razonSocial: e.razon_social,
      })),
      colaboradores: guardados,
    };

    fs.writeFileSync(outPath, JSON.stringify(documentoSalida, null, 2), 'utf8');
    restringirPermisosNtfs(outPath);

    // Salida por consola ESTRICTAMENTE sin contraseñas
    console.log(
      JSON.stringify(
        {
          ok: true,
          baseDatos: dbNombre,
          usuariosActivos: totalActivos,
          maxUsuarios,
          empresas: documentoSalida.empresasAutorizadas,
          archivoCredencialesProtegido: path.relative(PROJECT_ROOT, outPath),
          colaboradores: guardados.map((c) => ({
            id: c.id,
            usuario: c.usuario,
            rolGlobal: c.rolGlobal,
            estado: c.estado,
            empresasAsignadas: c.empresasAsignadas,
          })),
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
    await closeDatabase();
  }
}

main().catch((err) => {
  console.error('[configurar-usuarios-piloto] ERROR:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
