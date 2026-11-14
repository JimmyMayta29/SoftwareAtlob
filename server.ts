import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'path';
import { createServer } from 'node:http';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import { apiRoutes } from './server/routes';
import { runMigrations } from './server/db/migrate';
import { env } from './server/config/env';
import { db, initializeDatabase, closeDatabase } from './server/config/database';
import { fileURLToPath } from 'node:url';
import { sanitizarMensaje } from './server/utils/seguridadDatos';

const escritorio = process.env.ATLOB_DESKTOP === '1';

function esIpPrivadaOLocal(raw?: string): boolean {
  if (!raw) return false;
  const ip = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const segundo = Number(ip.split('.')[1]);
    return Number.isInteger(segundo) && segundo >= 16 && segundo <= 31;
  }
  return false;
}
const parentPort = (process as typeof process & {
  parentPort?: { postMessage(message: unknown): void; on(event: 'message', listener: (event: { data: unknown }) => void): void };
}).parentPort;

async function verificarBaseEscritorio() {
  const { rows: [rol] } = await db.query<{ base: string; seguro: boolean }>(`
    SELECT current_database() AS base,
           rolname = session_user AND NOT (rolsuper OR rolbypassrls OR rolcreaterole) AS seguro
    FROM pg_roles WHERE rolname = current_user
  `);
  if (!rol?.seguro) throw Object.assign(new Error('Use un rol de aplicación con privilegios restringidos.'), { code: 'PG_ROLE_UNSAFE' });
  const base = rol.base.toLowerCase();
  return base === 'sistema_contable' || (base !== 'atlob_test' && process.env.ATLOB_DESKTOP_MIGRATE !== '1');
}

async function startServer() {
  await initializeDatabase();
  await runMigrations({ verifyOnly: escritorio && await verificarBaseEscritorio() });

  const app = express();
  let origenLocal = '';

  if (escritorio) {
    app.use((req, res, next) => {
      const host = `http://${req.headers.host ?? ''}`;
      const origin = req.headers.origin;
      if (host !== origenLocal || (origin && origin !== origenLocal)) {
        res.sendStatus(403);
        return;
      }
      next();
    });
  } else {
    if (process.env.LAN_ONLY === '1') {
      app.use((req, res, next) => {
        if (!esIpPrivadaOLocal(req.socket.remoteAddress)) {
          res.status(403).json({ success: false, error: 'ACCESO_LAN_PRIVADA_REQUERIDO' });
          return;
        }
        next();
      });
    }
    const allowed = process.env.ALLOWED_ORIGIN;
    if (allowed) {
      app.use(cors({ origin: allowed.split(',').map(s => s.trim()), credentials: true }));
    } else {
      app.use(cors());
    }
  }
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Rutas de API Backend
  app.use('/api', apiRoutes);

  // Integración con Vite en desarrollo vs distribución estática en producción
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fileURLToPath(new URL('./dist', import.meta.url));
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpsEnabled = process.env.HTTPS_ENABLED === '1' || process.env.HTTPS_ENABLED === 'true';
  const port = escritorio ? 0 : env.PORT || 3000;
  const host = escritorio ? '127.0.0.1' : process.env.HOST || '0.0.0.0';
  const httpHost = escritorio || httpsEnabled ? (process.env.HTTP_HOST || '127.0.0.1') : host;
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, httpHost, resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('DIRECCION_SERVIDOR_INVALIDA');
  origenLocal = `http://${httpHost}:${address.port}`;

  let httpsServer: HttpsServer | null = null;
  if (!escritorio && httpsEnabled) {
    const keyPath = path.resolve(process.env.SSL_KEY_PATH || path.join('storage', 'certs', 'atlob-lan.key'));
    const certPath = path.resolve(process.env.SSL_CERT_PATH || path.join('storage', 'certs', 'atlob-lan.crt'));
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      const httpsPortRaw = Number(process.env.HTTPS_PORT ?? 3443);
      const httpsPort = Number.isFinite(httpsPortRaw) && httpsPortRaw >= 0 ? httpsPortRaw : 3443;
      httpsServer = createHttpsServer({
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      }, app);
      await new Promise<void>((resolve, reject) => {
        httpsServer!.once('error', reject);
        httpsServer!.listen(httpsPort, host, resolve);
      });
    } else {
      console.warn(`⚠️ [Server] HTTPS_ENABLED=1 pero no se encontraron certificados TLS en ${certPath} / ${keyPath}.`);
    }
  }

  if (escritorio) {
    parentPort?.on('message', ({ data }) => {
      if (!data || typeof data !== 'object' || !('type' in data) || data.type !== 'shutdown') return;
      server.close(() => { void closeDatabase().finally(() => process.exit(0)); });
      server.closeAllConnections();
    });
    parentPort?.postMessage({ type: 'listening', port: address.port });
  } else {
    console.log(`🚀 [Server] Sistema disponible en ${origenLocal}`);
    if (httpsServer) {
      const httpsAddress = httpsServer.address();
      if (httpsAddress && typeof httpsAddress !== 'string') {
        console.log(`🔒 [Server] Transporte HTTPS LAN disponible en https://${host}:${httpsAddress.port}`);
      }
    }
    const cerrarOrdenado = () => {
      const tareas: Promise<void>[] = [
        new Promise<void>(resolve => server.close(() => resolve())),
      ];
      if (httpsServer) {
        tareas.push(new Promise<void>(resolve => httpsServer!.close(() => resolve())));
      }
      void Promise.allSettled(tareas).finally(() => {
        void closeDatabase().finally(() => process.exit(0));
      });
      server.closeAllConnections();
      httpsServer?.closeAllConnections();
    };
    process.once('SIGINT', cerrarOrdenado);
    process.once('SIGTERM', cerrarOrdenado);
  }
}

startServer().catch((err: Error & { code?: string }) => {
  if (escritorio) {
    const conocidos = new Set(['28P01', '28000', '3D000', '42501', '57P03', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'PG_ROLE_UNSAFE', 'MIGRATIONS_PENDING', 'MIGRATIONS_INVALID']);
    parentPort?.postMessage({ type: 'startup-error', code: err.code && conocidos.has(err.code) ? err.code : 'STARTUP_FAILED' });
  } else {
    console.error('❌ [Server] Error crítico iniciando el servidor:', sanitizarMensaje(err));
  }
  process.exitCode = 1;
  void closeDatabase();
});
