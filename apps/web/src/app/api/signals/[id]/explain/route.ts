import { NextRequest, NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  buildSignalExplanationPrompt,
  buildSignalExplanationHaikuPrompt,
  SYSTEM_PROMPT_CACHE_BLOCK,
} from '@orderflow/llm-prompts';
import { callLlm } from '@orderflow/llm';
import type { UserTier, SignalSnapshot } from '@orderflow/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const FREE_AI_QUOTA = 10;

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
  const tier   = ((session.user as any).tier ?? 'free') as UserTier;

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

  // 4. Free-tier daily quota gate (callLlm handles model selection + billing).
  if (tier === 'free') {
    const today    = todayUtc();
    const redisKey = `ai:daily:${userId}:${today}`;

    const used = await redis.incr(redisKey);
    if (used === 1) await redis.expire(redisKey, 86400);

    if (used > FREE_AI_QUOTA) {
      await redis.decr(redisKey);
      return NextResponse.json(
        { error: 'ai_quota_exceeded', used: used - 1, limit: FREE_AI_QUOTA, resetAt: nextMidnightIso() },
        { status: 429 },
      );
    }

    const dateObj = new Date(`${today}T00:00:00.000Z`);
    await db.aiUsageDaily.upsert({
      where:  { userId_date: { userId, date: dateObj } },
      create: { userId, date: dateObj, callCount: 1 },
      update: { callCount: { increment: 1 } },
    });
  } else {
    // Premium: 402 when balance is empty so the UI can prompt top-up.
    // callLlm() would silently downgrade to Haiku, but this endpoint's
    // contract is to require a real Sonnet response (or a paywall hit).
    const ledger = await db.tokenLedger.findUnique({
      where:  { userId },
      select: { balanceCents: true },
    });
    if ((ledger?.balanceCents ?? 0) <= 0) {
      return NextResponse.json(
        { error: 'insufficient_balance', upgradeUrl: '/billing' },
        { status: 402 },
      );
    }
  }

  // 5. Build the prompt. Router downgrades free users to Haiku, so feed it
  // the Haiku-shaped prompt — premium gets the richer Sonnet prompt.
  const snapshot = event.snapshot as unknown as SignalSnapshot;
  const promptText = tier === 'free'
    ? buildSignalExplanationHaikuPrompt(snapshot, setup.name)
    : buildSignalExplanationPrompt(snapshot, setup.name);

  let result;
  try {
    result = await callLlm({
      db,
      feature:      'signal_explanation',
      userId,
      userTier:     tier,
      maxTokens:    512,
      systemBlocks: [SYSTEM_PROMPT_CACHE_BLOCK],
      messages:     [{ role: 'user', content: promptText }],
    });
  } catch (err) {
    console.error('[signals/explain] callLlm error:', err);
    return NextResponse.json({ error: 'ai_unavailable', message: 'AI service error' }, { status: 502 });
  }

  const { text: explanation, model, costCents } = result;

  // 6. Persist provenance to SignalEvent (audit row + ledger debit are
  // already handled inside callLlm()).
  await db.signalEvent.update({
    where: { id: eventId },
    data: {
      aiExplanation: explanation,
      aiModel:       model,
      aiCostCents:   costCents,
    },
  });

  return NextResponse.json({ explanation, model, costCents });
}
