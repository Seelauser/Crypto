import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { UserTier } from '@orderflow/types';
import { db } from '../db';

// ─── Tier Limits (inlined per spec) ───────────────────────────────────────────

const LIMITS = {
  free: {
    signal_setups_max:         3,
    instruments_per_setup_max: 5,
    history_days:              7,
  },
  premium: {
    signal_setups_max:         Infinity,
    instruments_per_setup_max: Infinity,
    history_days:              Infinity,
  },
} as const;

// ─── Request Helpers ──────────────────────────────────────────────────────────

function getUserContext(req: FastifyRequest): { userId: string; userTier: UserTier } {
  const userId   = req.headers['x-user-id'] as string;
  const userTier = ((req.headers['x-user-tier'] as string) ?? 'free') as UserTier;
  return { userId, userTier };
}

function tierGateResponse(reply: FastifyReply, feature: string) {
  return reply.code(403).send({
    error:        'tier_gate',
    feature,
    tierRequired: 'premium',
    upgradeUrl:   `/billing/upgrade?from=${feature}`,
  });
}

// ─── Body Interfaces ──────────────────────────────────────────────────────────

interface CreateSignalBody {
  name:                 string;
  market:               string;
  triggerConfig:        Record<string, unknown>;
  instruments:          string[];
  notificationChannels: string[];
  cooldownMinutes?:     number;
  activeHours?:         Record<string, unknown>;
}

interface UpdateSignalBody {
  name?:                 string;
  status?:               'armed' | 'paused' | 'archived';
  triggerConfig?:        Record<string, unknown>;
  instruments?:          string[];
  notificationChannels?: string[];
  cooldownMinutes?:      number;
  activeHours?:          Record<string, unknown>;
}

interface EventsQuerystring {
  page?:     string;
  pageSize?: string;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default async function signalsPlugin(fastify: FastifyInstance): Promise<void> {

  // ── GET / — list signal setups ─────────────────────────────────────────────
  //
  // Free users can see all their setups (creation is what's gated, not reading).
  // Returns `canCreate` so the UI can pre-emptively hide the "New setup" button.

  fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const { userId, userTier } = getUserContext(req);

    const setups = await db.signalSetup.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
    });

    const limit = LIMITS[userTier].signal_setups_max;

    return reply.send({
      data:      setups,
      total:     setups.length,
      tierLimit: limit === Infinity ? null : limit,
      canCreate: setups.length < limit,
    });
  });

  // ── POST / — create signal setup ───────────────────────────────────────────

  fastify.post(
    '/',
    async (
      req: FastifyRequest<{ Body: CreateSignalBody }>,
      reply: FastifyReply,
    ) => {
      const { userId, userTier } = getUserContext(req);
      const body = req.body;

      const setupMax       = LIMITS[userTier].signal_setups_max;
      const instrumentsMax = LIMITS[userTier].instruments_per_setup_max;

      // Gate: max concurrent setups
      const existingCount = await db.signalSetup.count({ where: { userId } });
      if (existingCount >= setupMax) {
        return tierGateResponse(reply, 'signal_setups_max');
      }

      // Gate: max instruments per setup
      const instrumentCount = body.instruments?.length ?? 0;
      if (instrumentCount > instrumentsMax) {
        return tierGateResponse(reply, 'instruments_per_setup_max');
      }

      const setup = await db.signalSetup.create({
        data: {
          userId,
          name:                 body.name,
          market:               body.market,
          triggerConfig:        body.triggerConfig,
          instruments:          body.instruments ?? [],
          notificationChannels: body.notificationChannels ?? [],
          cooldownMinutes:      body.cooldownMinutes ?? 15,
          activeHours:          body.activeHours ?? {},
          status:               'armed',
        },
      });

      return reply.code(201).send(setup);
    },
  );

  // ── PATCH /:id — update signal setup ──────────────────────────────────────

  fastify.patch(
    '/:id',
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: UpdateSignalBody }>,
      reply: FastifyReply,
    ) => {
      const { userId, userTier } = getUserContext(req);
      const { id }               = req.params;
      const body                 = req.body;

      // Ownership check
      const existing = await db.signalSetup.findFirst({ where: { id, userId } });
      if (!existing) {
        return reply
          .code(404)
          .send({ error: 'not_found', message: 'Signal setup not found.' });
      }

      // Gate: instrument count if instruments field is being updated
      if (body.instruments !== undefined) {
        const instrumentsMax = LIMITS[userTier].instruments_per_setup_max;
        if (body.instruments.length > instrumentsMax) {
          return tierGateResponse(reply, 'instruments_per_setup_max');
        }
      }

      const updated = await db.signalSetup.update({
        where: { id },
        data: {
          ...(body.name                 !== undefined && { name:                 body.name }),
          ...(body.status               !== undefined && { status:               body.status }),
          ...(body.triggerConfig        !== undefined && { triggerConfig:        body.triggerConfig }),
          ...(body.instruments          !== undefined && { instruments:          body.instruments }),
          ...(body.notificationChannels !== undefined && { notificationChannels: body.notificationChannels }),
          ...(body.cooldownMinutes      !== undefined && { cooldownMinutes:      body.cooldownMinutes }),
          ...(body.activeHours          !== undefined && { activeHours:          body.activeHours }),
        },
      });

      return reply.send(updated);
    },
  );

  // ── DELETE /:id — delete signal setup ─────────────────────────────────────

  fastify.delete(
    '/:id',
    async (
      req: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { userId } = getUserContext(req);
      const { id }     = req.params;

      const existing = await db.signalSetup.findFirst({ where: { id, userId } });
      if (!existing) {
        return reply
          .code(404)
          .send({ error: 'not_found', message: 'Signal setup not found.' });
      }

      await db.signalSetup.delete({ where: { id } });

      return reply.code(204).send();
    },
  );

  // ── GET /:id/events — list signal events for a setup ──────────────────────
  //
  // Free users are restricted to events from the last 7 days.
  // Supports cursor-based pagination via `page` + `pageSize` query params.

  fastify.get(
    '/:id/events',
    async (
      req: FastifyRequest<{ Params: { id: string }; Querystring: EventsQuerystring }>,
      reply: FastifyReply,
    ) => {
      const { userId, userTier } = getUserContext(req);
      const { id }               = req.params;
      const page     = Math.max(1, parseInt(req.query.page     ?? '1',  10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize ?? '50', 10)));

      // Ownership check
      const setup = await db.signalSetup.findFirst({
        where:  { id, userId },
        select: { id: true },
      });
      if (!setup) {
        return reply
          .code(404)
          .send({ error: 'not_found', message: 'Signal setup not found.' });
      }

      // Gate: free users see only the last 7 days of events
      const historyDays = LIMITS[userTier].history_days;
      const since: Date | undefined =
        historyDays === Infinity
          ? undefined
          : new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000);

      const where = {
        setupId: id,
        userId,
        ...(since !== undefined && { createdAt: { gte: since } }),
      };

      const [events, total] = await Promise.all([
        db.signalEvent.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip:    (page - 1) * pageSize,
          take:    pageSize,
        }),
        db.signalEvent.count({ where }),
      ]);

      return reply.send({
        data:         events,
        total,
        page,
        pageSize,
        hasMore:      total > page * pageSize,
        historyGated: historyDays !== Infinity,
      });
    },
  );
}
