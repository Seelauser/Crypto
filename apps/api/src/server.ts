import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { signalsRouter } from './routes/signals';
import { scansRouter } from './routes/scans';
import { notificationsRouter } from './routes/notifications';
import { db } from './db';

const app = Fastify({ logger: { level: process.env.NODE_ENV === 'production' ? 'warn' : 'info' } });

app.register(helmet);
app.register(cors, {
  origin: process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
  credentials: true,
});
app.register(rateLimit, { max: 200, timeWindow: '1 minute' });

// Liveness + readiness probe (Phase 6 P6-2): verifies the DB dependency.
app.get('/health', async (_req, reply) => {
  let dbOk = true;
  try { await db.$queryRaw`SELECT 1`; } catch { dbOk = false; }
  return reply
    .code(dbOk ? 200 : 503)
    .send({ status: dbOk ? 'ok' : 'degraded', service: 'api', checks: { db: dbOk ? 'ok' : 'down' }, ts: Date.now() });
});

// Route plugins
app.register(signalsRouter, { prefix: '/signals' });
app.register(scansRouter, { prefix: '/scans' });
app.register(notificationsRouter, { prefix: '/notifications' });

const PORT = parseInt(process.env.API_PORT ?? '4000');

app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
  app.log.info({ port: PORT }, 'api server running');
});
