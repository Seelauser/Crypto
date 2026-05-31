import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import Redis from 'ioredis';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import type { UserTier } from '@orderflow/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL = 'claude-haiku-4-5' as const;
const MAX_OUTPUT_TOKENS = 120;      // 50-word narration needs little headroom
const RATE_WINDOW_SECONDS = 30;     // 1 narration per 30s per instrument per user
const FREE_DAILY_LIMIT = 10;        // shared with signal quota

// ─── Pricing for Haiku (cents per 1 000 tokens) ───────────────────────────────
const PRICE_INPUT  = 0.100;
const PRICE_OUTPUT = 0.500;

// ─── Validation ───────────────────────────────────────────────────────────────

const printSchema = z.object({
  size:  z.number(),
  price: z.number(),
  side:  z.string(),
  ts:    z.number(),
});

const bodySchema = z.object({
  instrument:    z.string().min(1).max(30),
  recentPrints:  z.array(printSchema).min(1).max(50),
});

// ─── Clients ──────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  lazyConnect:         true,
  enableOfflineQueue:  false,
  maxRetriesPerRequest: 1,
});

// ─── Rate-limit helpers ───────────────────────────────────────────────────────

/** Per-instrument 30-second cooldown key. */
function cooldownKey(userId: string, instrument: string): string {
  // Window rounded to 30-second slots so bursts at the boundary are fair.
  const slot = Math.floor(Date.now() / (RATE_WINDOW_SECONDS * 1000));
  return `ai:tape:${userId}:${instrument}:${slot}`;
}

/** Daily call count key (shared with signal AI quota for free tier). */
function dailyKey(userId: string): string {
  const d = new Date();
  const yyyymmdd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return `ai:daily:${userId}:${yyyymmdd}`;
}

/** Returns true if the cooldown window for this instrument is active. */
async function isCoolingDown(userId: string, instrument: string): Promise<boolean> {
  const val = await redis.get(cooldownKey(userId, instrument));
  return val !== null;
}

/** Marks the cooldown window for this instrument (TTL = window + 2s grace). */
async function setCooldown(userId: string, instrument: string): Promise<void> {
  const key = cooldownKey(userId, instrument);
  await redis.set(key, '1', 'EX', RATE_WINDOW_SECONDS + 2);
}

/** Returns the current daily count for a user. */
async function getDailyCount(userId: string): Promise<number> {
  const val = await redis.get(dailyKey(userId));
  return val ? parseInt(val, 10) : 0;
}

/** Increments daily count. Sets TTL on first increment so it expires at midnight. */
async function incrementDailyCount(userId: string): Promise<void> {
  const key   = dailyKey(userId);
  const count = await redis.incr(key);
  if (count === 1) {
    // Expire at end of UTC day
    const now      = new Date();
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const ttl      = Math.floor((midnight.getTime() - now.getTime()) / 1000);
    await redis.expire(key, ttl);
  }
}

// ─── Cost helper ──────────────────────────────────────────────────────────────

function computeCostCents(usage: Anthropic.Usage): number {
  const inputCents  = (usage.input_tokens  / 1000) * PRICE_INPUT;
  const outputCents = (usage.output_tokens / 1000) * PRICE_OUTPUT;
  return Math.ceil(inputCents + outputCents);
}

// ─── Deduct balance ───────────────────────────────────────────────────────────

async function deductBalance(userId: string, costCents: number): Promise<void> {
  if (costCents <= 0) return;
  await db.$executeRaw`
    INSERT INTO token_ledger (user_id, balance_cents, updated_at)
    VALUES (${userId}, ${-costCents}, now())
    ON CONFLICT (user_id) DO UPDATE
      SET balance_cents = token_ledger.balance_cents - ${costCents},
          updated_at    = now()
  `;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

interface Print {
  size:  number;
  price: number;
  side:  string;
  ts:    number;
}

function buildNarratorPrompt(instrument: string, prints: Print[]): string {
  // Summarise the most recent prints into a compact textual form.
  const sorted = [...prints].sort((a, b) => b.ts - a.ts).slice(0, 20);

  const buys  = sorted.filter(p => p.side === 'buy');
  const sells = sorted.filter(p => p.side === 'sell');

  const totalBuySize  = buys.reduce((s, p) => s + p.size, 0);
  const totalSellSize = sells.reduce((s, p) => s + p.size, 0);

  const avgBuyPrice  = buys.length  > 0 ? buys.reduce((s, p) => s + p.price, 0)  / buys.length  : 0;
  const avgSellPrice = sells.length > 0 ? sells.reduce((s, p) => s + p.price, 0) / sells.length : 0;

  const latest    = sorted[0];
  const latestAge = latest ? Math.round((Date.now() - latest.ts) / 1000) : 0;

  const printsSummary = [
    `Instrument: ${instrument}`,
    `Recent prints (last ${sorted.length}): ${buys.length} buys / ${sells.length} sells`,
    `Buy volume: ${totalBuySize.toFixed(4)} @ avg ${avgBuyPrice.toFixed(2)}`,
    `Sell volume: ${totalSellSize.toFixed(4)} @ avg ${avgSellPrice.toFixed(2)}`,
    `Latest print: ${latest?.side ?? 'n/a'} ${latest?.size?.toFixed(4) ?? ''} @ ${latest?.price?.toFixed(2) ?? ''} (${latestAge}s ago)`,
  ].join('. ');

  return `You are a live trading floor narrator. In ONE sentence (max 50 words), describe what the tape is showing for ${instrument}: ${printsSummary}. Use trader shorthand. Not investment advice.`;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const tier   = ((session.user as any).tier ?? 'free') as UserTier;

  // ── Parse body ────────────────────────────────────────────────────────────
  const rawBody = await req.json().catch(() => null);
  if (!rawBody) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { instrument, recentPrints } = parsed.data;

  // ── Rate limit: 30-second cooldown per instrument per user ────────────────
  const cooling = await isCoolingDown(userId, instrument);
  if (cooling) {
    return NextResponse.json(
      {
        error:       'rate_limit',
        message:     `Tape narration is limited to once per ${RATE_WINDOW_SECONDS}s per instrument.`,
        retryAfter:  RATE_WINDOW_SECONDS,
      },
      { status: 429 },
    );
  }

  // ── Free tier: daily call cap ─────────────────────────────────────────────
  if (tier === 'free') {
    const dailyCount = await getDailyCount(userId);
    if (dailyCount >= FREE_DAILY_LIMIT) {
      return NextResponse.json(
        {
          error:   'daily_limit_reached',
          message: `Free tier allows ${FREE_DAILY_LIMIT} AI calls per day. Upgrade to Pro for unlimited.`,
          upgradeUrl: '/billing/upgrade?from=tape_narrator',
        },
        { status: 429 },
      );
    }
  }

  // Mark the cooldown before calling the API to avoid burst races.
  await setCooldown(userId, instrument);
  if (tier === 'free') {
    await incrementDailyCount(userId);
  }

  // ── Build prompt and call Haiku ───────────────────────────────────────────
  const prompt = buildNarratorPrompt(instrument, recentPrints);

  const response = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'user', content: prompt },
    ],
  });

  const narration = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();

  const costCents = computeCostCents(response.usage);

  // ── Log and optionally deduct ─────────────────────────────────────────────
  void (async () => {
    try {
      await db.llmCall.create({
        data: {
          userId,
          feature:                   'tape_narrator',
          model:                     MODEL,
          inputTokens:               response.usage.input_tokens,
          outputTokens:              response.usage.output_tokens,
          cacheCreationInputTokens:  response.usage.cache_creation_input_tokens ?? 0,
          cacheReadInputTokens:      response.usage.cache_read_input_tokens     ?? 0,
          costCents,
          batched: false,
        },
      });
      if (tier === 'premium') {
        await deductBalance(userId, costCents);
      }
    } catch (err) {
      console.error('[tape-narrator] billing error:', err);
    }
  })();

  return NextResponse.json({
    narration,
    model:     MODEL,
    costCents,
    costUsd:   (costCents / 100).toFixed(4),
  });
}
