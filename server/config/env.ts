import { createHash, randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import { z } from 'zod';
import { HUELLAS_HISTORICAS_SERVIDOR } from './huellas-secretos';

if (process.env.DOTENV_CONFIG_PATH !== '') {
  dotenv.config({ path: process.env.DOTENV_CONFIG_PATH, quiet: true });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.preprocess(value => value === '8080' || value === 8080 ? 3000 : value, z.coerce.number().default(3000)),
  DATABASE_URL: z.string().default(''),
  JWT_EXPIRES_IN: z.string().default('7d'),
});

export const NOMBRES_SECRETOS_SERVIDOR = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'SUNAT_ENCRYPTION_KEY',
  'MFA_SEED_SECRET',
  'BACKUP_ENCRYPTION_KEY',
] as const;

function motivoSecretoInvalido(valor: string): string | undefined {
  if (!valor) return 'AUSENTE';
  const esHex = /^[0-9a-f]+$/i.test(valor);
  const huella = createHash('sha256').update(esHex ? valor.toLowerCase() : valor).digest('hex');
  if (HUELLAS_HISTORICAS_SERVIDOR.has(huella)) return 'HISTORICO';
  if (!esHex || valor.length !== 64) return 'FORMATO_32_BYTES';
  if (new Set(Buffer.from(valor, 'hex')).size < 16) return 'BAJA_DIVERSIDAD';
}

const config = envSchema.parse(process.env);
if (config.NODE_ENV === 'production' && !config.DATABASE_URL) {
  throw new Error('DATABASE_URL_REQUERIDA: Configure PostgreSQL antes de iniciar el servidor.');
}

type NombreSecreto = typeof NOMBRES_SECRETOS_SERVIDOR[number];
const secretos = {} as Record<NombreSecreto, string>;
const efimeros: NombreSecreto[] = [];
const usados = new Set<string>();
for (const nombre of NOMBRES_SECRETOS_SERVIDOR) {
  const valor = process.env[nombre] || '';
  const motivo = motivoSecretoInvalido(valor) || (usados.has(valor.toLowerCase()) ? 'REUTILIZADO' : undefined);
  if (motivo && config.NODE_ENV === 'production') {
    throw new Error(`SECRETO_CONFIGURACION_INVALIDO: ${nombre} (${motivo})`);
  }
  secretos[nombre] = motivo ? randomBytes(32).toString('hex') : valor;
  usados.add(secretos[nombre].toLowerCase());
  if (motivo) efimeros.push(nombre);
}
if (efimeros.length) console.warn(`[configuración] Secretos efímeros para este proceso: ${efimeros.join(', ')}.`);

export const env = { ...config, ...secretos };
