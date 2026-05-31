import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import signalsRouter from './routes/signals';
import scansRouter from './routes/scans';
import { notificationsRouter } from './routes/notifications';

const app = Fastify({ logger: { level: process.env.NODE_ENV === 'production' ? 'warn' : 'info' } });

app.register(helmet);
app.register(cors, {
  origin: process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
  credentials: true,
});
app.register(rateLimit, { max: 200, timeWindow: '1 minute' });

// Health check
app.get('/health', async () => ({ ok: true, ts: Date.now() }));

// Route plugins
app.register(signalsRouter, { prefix: '/signals' });
app.register(scansRouter, { prefix: '/scans' });
app.register(notificationsRouter, { prefix: '/notifications' });

const PORT = parseInt(process.env.API_PORT ?? '4000');

app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
  console.log(`API server running on :${PORT}`);
});
