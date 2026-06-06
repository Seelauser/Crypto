import { NextRequest, NextResponse } from 'next/server';
import Redis from 'ioredis';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { callLlm } from '@orderflow/llm';
import {
  buildSignalExplanationPrompt,
  buildSignalExplanationHaikuPrompt,
  SYSTEM_PROMPT_CACHE_BLOCK,
} from '@orderflow/llm-prompts';
import type { UserTier, SignalSnapshot } from '@orderflow/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const FREE_AI_QUOTA = 10;
// Sliding-window burst cap: max 1 AI call per 10 seconds per user regardless
// of tier. Prevents a single session from hammering the endpoint.
const BURST_WINDOW_SEC = 10;

// ─── Singletons ───────────────────────────────────────────────────────────────

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns midnight of the next calendar day in ISO format (UTC). */
function nextMidnightIso(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

/** YYYY-MM-DD in UTC. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Auth check
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const tier   = (session.user.tier ?? 'free') as UserTier;

  // 1b. Sliding-window burst guard: 1 req / BURST_WINDOW_SEC per user.
  //     Applied before quota checks so we reject spam cheaply (Redis-only, no DB).
  const burstKey = `ai:burst:explain:${userId}`;
  const burstCount = await redis.incr(burstKey);
  if (burstCount === 1) await redis.expire(burstKey, BURST_WINDOW_SEC);
  if (burstCount > 1) {
    const ttl = await redis.ttl(burstKey);
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSec: ttl > 0 ? ttl : BURST_WINDOW_SEC },
      { status: 429, headers: { 'Retry-After': String(ttl > 0 ? ttl : BURST_WINDOW_SEC) } },
    );
  }

  // Parse body
  const body = await req.json().catch(() => null);
  if (!body?.eventId || typeof body.eventId !== 'string') {
    return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
  }
  const { eventId } = body as { eventId: string };

  // 2. Load the SignalEvent (verify ownership)
  const { id: setupId } = await params;

  const event = await db.signalEvent.findFirst({
    where: { id: eventId, userId, setupId },
  });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // 3. Load the SignalSetup
  const setup = await db.signalSetup.findFirst({
    where: { id: setupId, userId },
  });
  if (!setup) {
    return NextResponse.json({ error: 'Signal setup not found' }, { status: 404 });
  }

  // 4. Tier policy gate. Model selection itself happens inside callLlm; here we
  //    only enforce the per-tier access policy. Free + Starter are metered by
  //    a daily Haiku quota; only Pro draws Sonnet against the token ledger.
  if (tier !== 'pro') {
    // ── Free / Starter: daily quota via Redis (callLlm pins them → Haiku) ──
    const today      = todayUtc();
    const redisKey   = `ai:daily:${userId}:${today}`;

    // Atomic increment; set expiry only on first write (NX)
    const used = await redis.incr(redisKey);
    if (used === 1) {
      // First call today — set TTL so the key expires ~24h after midnight
      await redis.expire(redisKey, 86400);
    }

    if (used > FREE_AI_QUOTA) {
      // Rollback the increment so the count stays accurate
      await redis.decr(redisKey);
      return NextResponse.json(
        { error: 'ai_quota_exceeded', used: used - 1, limit: FREE_AI_QUOTA, resetAt: nextMidnightIso() },
        { status: 429 },
      );
    }

    // Mirror quota to DB (upsert + increment call_count)
    const dateObj = new Date(`${today}T00:00:00.000Z`);
    await db.aiUsageDaily.upsert({
      where:  { userId_date: { userId, date: dateObj } },
      create: { userId, date: dateObj, callCount: 1 },
      update: { callCount: { increment: 1 } },
    });

  } else {
    // ── Pro: must hold a positive token balance. callLlm would silently
    //    downgrade an exhausted user to Haiku, but this route instead surfaces
    //    a 402 so the client can prompt a top-up. ──
    const ledger = await db.tokenLedger.findUnique({
      where:  { userId },
      select: { balanceCents: true },
    });
    const balance = ledger?.balanceCents ?? 0;

    if (balance <= 0) {
      return NextResponse.json(
        { error: 'insufficient_balance', upgradeUrl: '/billing' },
        { status: 402 },
      );
    }
  }

  // 5/6/7. Route through the shared LLM router — it resolves the model
  //        (Haiku for free, Sonnet for premium-with-balance), attaches prompt
  //        caching, writes the `llm_calls` audit row and debits the ledger.
  const snapshot = event.snapshot as unknown as SignalSnapshot;

  let result: Awaited<ReturnType<typeof callLlm>>;
  try {
    result = await callLlm({
      db,
      feature:      'signal_explanation',
      userId,
      // Mirror the tier gate above: only Pro is metered as premium against the
      // token ledger (Sonnet). Free + Starter take the Haiku quota path.
      userTier:     tier === 'pro' ? 'premium' : 'free',
      maxTokens:    256,
      systemBlocks: [SYSTEM_PROMPT_CACHE_BLOCK],
      messages: (model) => [{
        role: 'user',
        content: model.includes('haiku')
          ? buildSignalExplanationHaikuPrompt(snapshot, setup.name)
          : buildSignalExplanationPrompt(snapshot, setup.name),
      }],
    });
  } catch (err) {
    console.error('[signals/explain] callLlm error:', err);
    return NextResponse.json({ error: 'ai_unavailable', message: 'AI service error' }, { status: 502 });
  }

  const explanation = result.text;
  const model       = result.model;
  const costCents   = result.costCents;

  // 10. Update SignalEvent with AI data
  await db.signalEvent.update({
    where: { id: eventId },
    data: {
      aiExplanation: explanation,
      aiModel:       model,
      aiCostCents:   costCents,
    },
  });

  // 11. Return result
  return NextResponse.json({ explanation, model, costCents });
}
