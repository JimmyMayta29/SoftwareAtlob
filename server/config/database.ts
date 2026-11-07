import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from './env';

export interface DatabaseService {
  query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
  getClient(): Promise<PoolClient>;
  isPostgresConnected(): boolean;
  withTenantAndEmpresa<T>(userId: string, empresaId: string, action: (client: PoolClient) => Promise<T>): Promise<T>;
  withEmpresaTransaction<T>(empresaId: string, action: (client: PoolClient) => Promise<T>): Promise<T>;
  withUsuarioTransaction<T>(userId: string, action: (client: PoolClient) => Promise<T>): Promise<T>;
}

let pool: Pool | null = null;
let isConnected = false;
const contexto = new AsyncLocalStorage<{ empresaId?: string; userId: string }>();

export function conContextoUsuario<T>(userId: string, action: () => T): T {
  const actual = contexto.getStore();
  if (actual && actual.userId !== userId) throw new Error('CONTEXTO_USUARIO_INCOMPATIBLE');
  return actual ? action() : contexto.run({ userId }, action);
}

export function conContextoEmpresa<T>(empresaId: string, userId: string, action: () => T): T {
  const actual = contexto.getStore();
  if (actual && ((actual.empresaId && actual.empresaId !== empresaId) || actual.userId !== userId)) {
    throw new Error('CONTEXTO_EMPRESA_INCOMPATIBLE');
  }
  return contexto.run({ empresaId, userId }, action);
}

export async function establecerContextoUsuario(client: PoolClient, userId: string) {
  const actual = contexto.getStore();
  if (actual && actual.userId !== userId) throw new Error('CONTEXTO_USUARIO_INCOMPATIBLE');
  await client.query("SELECT set_config('app.current_user_id', $1, true), set_config('app.usuario_id', $1, true)", [userId]);
}

export async function establecerContextoEmpresa(client: PoolClient, empresaId: string, userId?: string) {
  const actual = contexto.getStore();
  if (actual && ((actual.empresaId && actual.empresaId !== empresaId) || (userId && actual.userId !== userId))) {
    throw new Error('CONTEXTO_EMPRESA_INCOMPATIBLE');
  }
  await client.query("SELECT set_config('app.current_empresa_id', $1, true), set_config('app.empresa_id', $1, true)", [empresaId]);
  const actor = actual?.userId ?? userId;
  if (actor) await establecerContextoUsuario(client, actor);
}

export async function initializeDatabase(): Promise<void> {
  if (pool && isConnected) return;
  const currentDbUrl = process.env.DATABASE_URL !== undefined ? process.env.DATABASE_URL : env.DATABASE_URL;
  if (!currentDbUrl) {
    if (env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL_REQUERIDA: Configure PostgreSQL antes de iniciar el servidor.');
    }
    console.warn('⚠️ [Database] ADVERTENCIA: DATABASE_URL no configurada. Operando en modo DESARROLLO/TEST con almacén transaccional en memoria.');
    return;
  }
  const candidate = new Pool({ connectionString: currentDbUrl, max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
  candidate.on('error', () => { isConnected = false; });
  try {
    await candidate.query('SELECT 1');
    pool = candidate;
    isConnected = true;
  } catch (error) {
    await candidate.end();
    if (env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production') {
      throw error;
    }
    console.warn(`⚠️ [Database] No se pudo conectar a PostgreSQL (${(error as Error).message}). Operando en modo DESARROLLO/TEST con almacén en memoria.`);
    pool = null;
    isConnected = false;
  }
}

export async function closeDatabase(): Promise<void> {
  const current = pool;
  pool = null;
  isConnected = false;
  await current?.end();
}

export function setPostgresPool(customPool: Pool | any, connected = true) {
  if (env.NODE_ENV !== 'test') throw new Error('El reemplazo de PostgreSQL solo está disponible en pruebas.');
  pool = customPool;
  isConnected = connected && customPool !== null;
}

async function transaction<T>(empresaId: string | undefined, userId: string | undefined, action: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!pool || !isConnected) {
    if (env.NODE_ENV !== 'production') return action({} as PoolClient);
    throw new Error('DATABASE_NO_DISPONIBLE');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (empresaId) await establecerContextoEmpresa(client, empresaId, userId);
    else if (userId) await establecerContextoUsuario(client, userId);
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export const db: DatabaseService = {
  isPostgresConnected: () => isConnected && pool !== null,
  async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    if (!pool || !isConnected) {
      if (env.NODE_ENV !== 'production') {
        return { rows: [] as T[], rowCount: 0, command: '', oid: 0, fields: [] };
      }
      throw new Error('DATABASE_NO_DISPONIBLE');
    }
    const actual = contexto.getStore();
    if (actual) return transaction(actual.empresaId, actual.userId, client => client.query<T>(text, params));
    return pool.query<T>(text, params);
  },
  async getClient(): Promise<PoolClient> {
    if (!pool || !isConnected) {
      if (env.NODE_ENV !== 'production') {
        return {
          query: async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] }),
          release: () => {}
        } as unknown as PoolClient;
      }
      throw new Error('DATABASE_NO_DISPONIBLE');
    }
    return pool.connect();
  },
  withTenantAndEmpresa: (userId, empresaId, action) => transaction(empresaId, userId, action),
  withEmpresaTransaction: (empresaId, action) => transaction(empresaId, undefined, action),
  withUsuarioTransaction: (userId, action) => transaction(contexto.getStore()?.empresaId, userId, action)
};
