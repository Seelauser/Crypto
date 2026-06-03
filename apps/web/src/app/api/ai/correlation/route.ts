import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import Redis from 'ioredis';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { SYSTEM_PROMPT_CACHE_BLOCK } from '@orderflow/llm-prompts';
import type { UserTier } from '@orderflow/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL = 'claude-haiku-4-5' as const;
const MAX_OUTPUT_TOKENS = 120;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW = 3600;       // 1 hour
const CACHE_TTL = 300;               // 5-minute result cache per pair
const DIVERGENCE_THRESHOLD = 0.35;  // |r| below this triggers narration

// Haiku pricing (cents per 1 000 tokens)
const PRICE_INPUT  = 0.100;
const PRICE_OUTPUT = 0.500;

// ─── Validation ───────────────────────────────────────────────────────────────

const bodySchema = z.object({
  instrumentA: z.string().min(1).max(30),
  instrumentB: z.string().min(1).max(30),
  timeframe:   z.string().max(10).optional().default('1h'),
});

// ─── Clients ──────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  lazyConnect:          true,
  enableOfflineQueue:   false,
  maxRetriesPerRequest: 1,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rateKey(userId: string): string {
  const d = new Date();
  return `ai:corr:rate:${userId}:${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`;
}

function cacheKey(a: string, b: string, tf: string): string {
  const pair = [a, b].sort().join(':');
  return `ai:corr:cache:${pair}:${tf}`;
}

async function checkRateLimit(userId: string): Promise<{ ok: boolean; count: number }> {
  const key   = rateKey(userId);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW);
  return { ok: count <= RATE_LIMIT_MAX, count };
}

/** Fetch the most recent N CVD values for an instrument from the OHLCV table. */
async function fetchCvdSeries(instrument: string, limit = 50): Promise<number[]> {
  try {
    const rows = await db.$queryRaw<Array<{ cvd: number }>>`
      SELECT cvd
      FROM ohlcv_bars
      WHERE instrument = ${instrument}
      ORDER BY ts DESC
      LIMIT ${limit}
    `;
    // Reverse so oldest-first for correlation math
    return rows.map((r: { cvd: number }) => r.cvd).reverse();
  } catch {
    return [];
  }
}

/** Pearson correlation coefficient between two equal-length arrays. */
function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 5) return NaN;

  const ax = xs.slice(0, n);
  const ay = ys.slice(0, n);

  const meanX = ax.reduce((s, v) => s + v, 0) / n;
  const meanY = ay.reduce((s, v) => s + v, 0) / n;

  let num = 0, sdX = 0, sdY = 0;
  for (let i = 0; i < n; i++) {
    const dx = ax[i] - meanX;
    const dy = ay[i] - meanY;
    num += dx * dy;
    sdX += dx * dx;
    sdY += dy * dy;
  }

  const denom = Math.sqrt(sdX * sdY);
  if (denom === 0) return 0;
  return Math.max(-1, Math.min(1, num / denom));
}

function computeCostCents(usage: Anthropic.Usage): number {
  return Math.ceil(
    (usage.input_tokens  / 1000) * PRICE_INPUT +
    (usage.output_tokens / 1000) * PRICE_OUTPUT,
  );
}

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

async function narrateDivergence(
  instrumentA: string,
  instrumentB: string,
  correlation: number,
): Promise<{ narration: string; costCents: number }> {
  const prompt =
    `You are a market analyst. In ONE sentence (max 40 words), explain what it means that ` +
    `the CVD correlation between ${instrumentA} and ${instrumentB} is ${correlation.toFixed(3)} ` +
    `(${Math.abs(correlation) < 0.1 ? 'strongly diverging' : correlation < 0 ? 'inversely correlated' : 'weakly correlated'}). ` +
    `Use trader language. Not investment advice.`;

  const res = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system:     [SYSTEM_PROMPT_CACHE_BLOCK],
    messages:   [{ role: 'user', content: prompt }],
  });

  const narration = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();

  return { narration, costCents: computeCostCents(res.usage) };
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
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { instrumentA, instrumentB, timeframe } = parsed.data;

  if (instrumentA === instrumentB) {
    return NextResponse.json(
      { error: 'instrumentA and instrumentB must be different' },
      { status: 400 },
    );
  }

  // ── Cache check ───────────────────────────────────────────────────────────
  const ck = cacheKey(instrumentA, instrumentB, timeframe);
  const cached = await redis.get(ck).catch(() => null);
  if (cached) {
    return NextResponse.json({ ...JSON.parse(cached), cached: true });
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  const { ok, count } = await checkRateLimit(userId);
  if (!ok) {
    return NextResponse.json(
      {
        error:   'rate_limit_exceeded',
        message: `Maximum ${RATE_LIMIT_MAX} correlation requests per hour.`,
        count,
      },
      { status: 429 },
    );
  }

  // ── Fetch CVD series in parallel ──────────────────────────────────────────
  const [seriesA, seriesB] = await Promise.all([
    fetchCvdSeries(instrumentA),
    fetchCvdSeries(instrumentB),
  ]);

  const correlation = pearson(seriesA, seriesB);
  const isDivergent = isNaN(correlation) || Math.abs(correlation) < DIVERGENCE_THRESHOLD;

  let narration: string | null = null;
  let costCents = 0;

  if (isDivergent && !isNaN(correlation)) {
    try {
      const result = await narrateDivergence(instrumentA, instrumentB, correlation);
      narration  = result.narration;
      costCents  = result.costCents;

      // Log + deduct
      void (async () => {
        try {
          await db.llmCall.create({
            data: {
              userId,
              feature:                  'correlation_narrator',
              model:                    MODEL,
              inputTokens:              0,
              outputTokens:             0,
              cacheCreationInputTokens: 0,
              cacheReadInputTokens:     0,
              costCents,
              batched: false,
            },
          });
          if (tier === 'pro') await deductBalance(userId, costCents);
        } catch (err) {
          console.error('[correlation] billing error:', err);
        }
      })();
    } catch (err) {
      console.error('[correlation] narration error:', err);
    }
  }

  const responseBody = {
    instrumentA,
    instrumentB,
    timeframe,
    correlation:  isNaN(correlation) ? null : parseFloat(correlation.toFixed(4)),
    isDivergent,
    sampleSize:   Math.min(seriesA.length, seriesB.length),
    narration,
    costCents,
    model:        narration ? MODEL : null,
    cached:       false,
  };

  // ── Cache result for 5 minutes ────────────────────────────────────────────
  await redis.set(ck, JSON.stringify(responseBody), 'EX', CACHE_TTL).catch(() => {});

  return NextResponse.json(responseBody);
}
