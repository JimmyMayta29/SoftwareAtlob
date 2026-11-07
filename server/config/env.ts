import { createHash, randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import { z } from 'zod';

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

const huellasHistoricas = new Set([
  '6e2e8153f2b6205d2952f3afa3040b90cdcc58e3b94b815b9c41bc05a02d3a74',
  'f278d2f77b5464dddf8d87a7435d4d2b64036bc5a6c242a95792696965d490a1',
  'ee6beae3f428793dfd51e7d0547f5ac6847471a365e93481ef892d2dc314bd64',
  'c299d362d82a0b4b086295d9415f5ed071df8cdeb8de318111a02f6055b1a533',
  'a8ae6e6ee929abea3afcfc5258c8ccd6f85273e0d4626d26c7279f3250f77c8e',
  '9005463e8aaae34aad5dab99cf301ad2c48db12b89e5d0cba8553de8b09192e2',
  '799d3b9edb8abb06cb4249091a5aa19e244b39c170b6fd66a73ac446b93ed4f1',
  '8be5d113c0871ce1a122d68a7dff940ab7b09ad8dfcfd9a85aa5c1acc026279e',
  '55acd013c975aa6fa9023544df7597e3ba81b5d31327405101aa32299b8e778d',
  'fecaf39f45dabe3609967036d959b5440c5416fa96d1be6b730ea43922cf0b4f',
]);

function motivoSecretoInvalido(valor: string): string | undefined {
  if (!valor) return 'AUSENTE';
  const esHex = /^[0-9a-f]+$/i.test(valor);
  const huella = createHash('sha256').update(esHex ? valor.toLowerCase() : valor).digest('hex');
  if (huellasHistoricas.has(huella)) return 'HISTORICO';
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
