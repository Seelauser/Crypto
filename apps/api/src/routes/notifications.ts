import type { FastifyInstance } from 'fastify';
import { db } from '../db';

export async function notificationsRouter(app: FastifyInstance) {
  // GET /notifications/channels — list user's notification channels
  app.get('/channels', async (req, reply) => {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const channels = await db.notificationChannel.findMany({ where: { userId } });
    return channels;
  });

  // POST /notifications/channels/push — register browser push subscription
  app.post<{ Body: { endpoint: string; keys: Record<string, string> } }>(
    '/channels/push',
    async (req, reply) => {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

      await db.notificationChannel.upsert({
        where: { userId_kind: { userId, kind: 'browser_push' } },
        create: {
          userId,
          kind: 'browser_push',
          config: { endpoint: req.body.endpoint, keys: req.body.keys },
          verified: true,
        },
        update: {
          config: { endpoint: req.body.endpoint, keys: req.body.keys },
          verified: true,
        },
      });
      return { ok: true };
    }
  );

  // POST /notifications/channels/telegram/link — generate deep-link token
  app.post('/channels/telegram/link', async (req, reply) => {
    const userId = req.headers['x-user-id'] as string;
    const tier = req.headers['x-user-tier'] as string;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });
    if (tier !== 'premium') {
      return reply.status(403).send({
        error: 'tier_gate',
        feature: 'telegram_notifications',
        tierRequired: 'premium',
        upgradeUrl: '/billing/upgrade?from=telegram',
      });
    }

    const token = Buffer.from(`${userId}:${Date.now()}`).toString('base64url');
    // Store token temporarily (TTL 10 min) in DB config or Redis
    // For MVP: store in notification_channel config as pending
    await db.notificationChannel.upsert({
      where: { userId_kind: { userId, kind: 'telegram' } },
      create: { userId, kind: 'telegram', config: { pendingToken: token }, verified: false },
      update: { config: { pendingToken: token }, verified: false },
    });

    const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? 'OrderFlowBot';
    return { deepLink: `https://t.me/${botUsername}?start=${token}` };
  });
}
