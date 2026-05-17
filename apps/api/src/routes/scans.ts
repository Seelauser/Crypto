import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { UserTier } from '@orderflow/types';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { db } from '../db';

// ─── Redis + BullMQ ───────────────────────────────────────────────────────────

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

const scanQueue = new Queue('scans', { connection: redis });

// ─── Tier Limits (inline) ─────────────────────────────────────────────────────

const LIMITS = {
  free: {
    scans_per_24h: 10,
    scope:         'single_market' as const,
    history_days:  7,
  },
  premium: {
    scans_per_24h: Infinity,
    scope:         'cross_market' as const,
    history_days:  Infinity,
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

/** Returns the ISO date string (YYYY-MM-DD) for the current UTC day. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Body / Querystring Interfaces ────────────────────────────────────────────

interface ScanFilter {
  field: string;
  op:    'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  value: number;
}

interface ScanCondition {
  logic:   'AND' | 'OR';
  filters: ScanFilter[];
}

interface CreateScanBody {
  scope:      'single_market' | 'cross_market';
  market?:    string;
  conditions: ScanCondition;
}

interface ListScansQuerystring {
  page?:     string;
  pageSize?: string;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function scansRouter(fastify: FastifyInstance): Promise<void> {

  // ── POST / — run a scan ────────────────────────────────────────────────────
  //
  // Gate rules:
  //   • free: single_market only, max 10 scans per calendar day (UTC)
  //   • premium: unlimited, cross_market allowed
  //
  // Quota is tracked in Redis (`quota:scans:<userId>:<YYYY-MM-DD>`) with an
  // INCR + EXPIRE 86400 pattern so the key auto-expires without a cron job.
  //
  // The scan job is published to BullMQ queue 'scans'; the DB record is stored
  // immediately with status 'pending' and updated by the worker when done.

  fastify.post(
    '/',
    async (
      req: FastifyRequest<{ Body: CreateScanBody }>,
      reply: FastifyReply,
    ) => {
      const { userId, userTier } = getUserContext(req);
      const body = req.body;

      // Gate: scope restriction for free users
      if (body.scope === 'cross_market' && userTier === 'free') {
        return tierGateResponse(reply, 'scan_scope_cross_market');
      }

      // Gate: daily quota for free users
      if (userTier === 'free') {
        const quotaKey    = `quota:scans:${userId}:${todayKey()}`;
        const currentStr  = await redis.get(quotaKey);
        const current     = currentStr ? parseInt(currentStr, 10) : 0;

        if (current >= LIMITS.free.scans_per_24h) {
          return tierGateResponse(reply, 'scans_per_24h');
        }

        // Atomically increment; set TTL on first write to guarantee expiry
        const newCount = await redis.incr(quotaKey);
        if (newCount === 1) {
          // Key was just created — set 24 h TTL
          await redis.expire(quotaKey, 86400);
        }
      }

      // Persist scan record with status 'pending'
      const scan = await db.scan.create({
        data: {
          userId,
          scope:        body.scope,
          market:       body.market ?? null,
          filterConfig: body.conditions,
          results:      [],
        },
      });

      // Publish job to BullMQ
      await scanQueue.add(
        'run_scan',
        {
          scanId:     scan.id,
          userId,
          userTier,
          scope:      body.scope,
          market:     body.market ?? null,
          conditions: body.conditions,
        },
        {
          jobId:    scan.id,
          attempts: 3,
          backoff:  { type: 'exponential', delay: 2000 },
        },
      );

      return reply.code(202).send({
        scanId: scan.id,
        status: 'queued',
      });
    },
  );

  // ── GET /:id — poll scan results ──────────────────────────────────────────

  fastify.get(
    '/:id',
    async (
      req: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { userId } = getUserContext(req);
      const { id }     = req.params;

      const scan = await db.scan.findFirst({
        where: { id, userId },
      });

      if (!scan) {
        return reply
          .code(404)
          .send({ error: 'not_found', message: 'Scan not found.' });
      }

      // Determine live status from BullMQ if the scan has no results yet
      let status: 'queued' | 'running' | 'complete' | 'failed' = 'complete';

      const resultsArray = Array.isArray(scan.results) ? scan.results : [];
      if (resultsArray.length === 0) {
        // Check queue for live state
        try {
          const job = await scanQueue.getJob(scan.id);
          if (job) {
            const state = await job.getState();
            if (state === 'waiting' || state === 'delayed') status = 'queued';
            else if (state === 'active')                     status = 'running';
            else if (state === 'failed')                     status = 'failed';
            else                                             status = 'complete';
          }
        } catch {
          // BullMQ unavailable — best-effort
          status = 'queued';
        }
      }

      return reply.send({
        scanId:     scan.id,
        scope:      scan.scope,
        market:     scan.market,
        conditions: scan.filterConfig,
        status,
        results:    scan.results,
        createdAt:  scan.createdAt,
      });
    },
  );

  // ── GET / — list recent scans ─────────────────────────────────────────────
  //
  // Free users see the last 7 days; premium users see all.

  fastify.get(
    '/',
    async (
      req: FastifyRequest<{ Querystring: ListScansQuerystring }>,
      reply: FastifyReply,
    ) => {
      const { userId, userTier } = getUserContext(req);
      const page     = Math.max(1, parseInt(req.query.page     ?? '1',  10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize ?? '25', 10)));

      const historyDays = LIMITS[userTier].history_days;
      const since: Date | undefined =
        historyDays === Infinity
          ? undefined
          : new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000);

      const where = {
        userId,
        ...(since !== undefined && { createdAt: { gte: since } }),
      };

      const [scans, total] = await Promise.all([
        db.scan.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip:    (page - 1) * pageSize,
          take:    pageSize,
          select: {
            id:          true,
            scope:       true,
            market:      true,
            filterConfig: true,
            results:     true,
            createdAt:   true,
          },
        }),
        db.scan.count({ where }),
      ]);

      return reply.send({
        data:         scans,
        total,
        page,
        pageSize,
        hasMore:      total > page * pageSize,
        historyGated: historyDays !== Infinity,
      });
    },
  );
}
