import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import Redis from 'ioredis';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  buildSignalExplanationPrompt,
  buildSignalExplanationHaikuPrompt,
  SYSTEM_PROMPT_CACHE_BLOCK,
} from '@orderflow/llm-prompts';
import type { UserTier, SignalSnapshot } from '@orderflow/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const FREE_AI_QUOTA = 10;

const MODEL_HAIKU  = 'claude-haiku-4-5'  as const;
const MODEL_SONNET = 'claude-sonnet-4-6' as const;

// Cents per 1 000 tokens
const MODEL_PRICE_MAP = {
  [MODEL_HAIKU]: {
    input:      0.100,
    output:     0.500,
    cacheRead:  0.050,
    cacheWrite: 0.125,
  },
  [MODEL_SONNET]: {
    input:      0.300,
    output:     1.500,
    cacheRead:  0.015,
    cacheWrite: 0.375,
  },
} as const;

type SupportedModel = keyof typeof MODEL_PRICE_MAP;

// ─── Singletons ───────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const redis     = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

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

interface UsageTokens {
  input_tokens:                 number;
  output_tokens:                number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?:     number;
}

function computeCostCents(model: SupportedModel, usage: UsageTokens): number {
  const p = MODEL_PRICE_MAP[model];
  const input      = (usage.input_tokens / 1000) * p.input;
  const output     = (usage.output_tokens / 1000) * p.output;
  const cacheRead  = ((usage.cache_read_input_tokens  ?? 0) / 1000) * p.cacheRead;
  const cacheWrite = ((usage.cache_creation_input_tokens ?? 0) / 1000) * p.cacheWrite;
  return Math.ceil(input + output + cacheRead + cacheWrite);
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

  // 4. Tier check + model selection
  let model: SupportedModel;

  if (tier === 'free') {
    // ── Free: Haiku only, daily quota enforced via Redis ──────────────────
    model = MODEL_HAIKU;

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
    // ── Premium: Sonnet by default, fall back to Haiku if balance <= 0 ───
    const ledger = await db.tokenLedger.findUnique({
      where:  { userId },
      select: { balanceCents: true },
    });
    const balance = ledger?.balanceCents ?? 0;

    if (balance <= 0) {
      // No balance at all — return 402 so the client can prompt top-up
      return NextResponse.json(
        { error: 'insufficient_balance', upgradeUrl: '/billing' },
        { status: 402 },
      );
    }

    model = MODEL_SONNET;
  }

  // 5. Build the prompt
  const snapshot = event.snapshot as unknown as SignalSnapshot;
  const promptText =
    model === MODEL_HAIKU
      ? buildSignalExplanationHaikuPrompt(snapshot, setup.name)
      : buildSignalExplanationPrompt(snapshot, setup.name);

  // 6. Call Anthropic with cache_control on system prompt block
  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model,
      max_tokens: 512,
      system: [SYSTEM_PROMPT_CACHE_BLOCK],
      messages: [{ role: 'user', content: promptText }],
    });
  } catch (err) {
    console.error('[signals/explain] Anthropic error:', err);
    return NextResponse.json({ error: 'ai_unavailable', message: 'AI service error' }, { status: 502 });
  }

  const rawUsage = response.usage as UsageTokens & Record<string, number>;
  const usageTokens: UsageTokens = {
    input_tokens:                rawUsage.input_tokens,
    output_tokens:               rawUsage.output_tokens,
    cache_creation_input_tokens: rawUsage.cache_creation_input_tokens,
    cache_read_input_tokens:     rawUsage.cache_read_input_tokens,
  };

  // 7. Compute cost
  const costCents = computeCostCents(model, usageTokens);

  const explanation = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  // 8. Write LlmCall record
  await db.llmCall.create({
    data: {
      userId,
      feature:                  'signal_explanation',
      model,
      inputTokens:              usageTokens.input_tokens,
      outputTokens:             usageTokens.output_tokens,
      cacheCreationInputTokens: usageTokens.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens:     usageTokens.cache_read_input_tokens ?? 0,
      costCents,
      batched: false,
    },
  });

  // 9. Deduct from token_ledger (premium only) — atomic raw SQL
  if (tier === 'premium' && costCents > 0) {
    await db.$executeRaw`
      UPDATE token_ledger
      SET balance_cents = balance_cents - ${costCents}
      WHERE user_id = ${userId}
    `;
  }

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
