import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import Redis from 'ioredis';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { buildTierGateError } from '@/lib/limits';
import { buildDeepAnalysisPrompt, SYSTEM_PROMPT_CACHE_BLOCK } from '@orderflow/llm-prompts';
import { z } from 'zod';
import type { UserTier } from '@orderflow/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL = 'claude-opus-4-8' as const;
const MAX_OUTPUT_TOKENS = 800;
const RATE_LIMIT_MAX = 5;       // per hour per user
const RATE_LIMIT_WINDOW = 3600; // seconds (1 hour)

// ─── Validation ───────────────────────────────────────────────────────────────

const bodySchema = z.object({
  instrument: z.string().min(1).max(30),
  timeframe:  z.string().max(10).optional().default('1h'),
  context:    z.string().max(500).optional(),
});

// ─── Clients ──────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  lazyConnect:      true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the Redis key used for hourly rate limiting.
 * Window key format: YYYY-MM-DD-HH in UTC.
 */
function rateLimitKey(userId: string): string {
  const now = new Date();
  const YYYY = now.getUTCFullYear();
  const MM   = String(now.getUTCMonth() + 1).padStart(2, '0');
  const DD   = String(now.getUTCDate()).padStart(2, '0');
  const HH   = String(now.getUTCHours()).padStart(2, '0');
  return `ai:deep:${userId}:${YYYY}-${MM}-${DD}-${HH}`;
}

/**
 * Increments the rate-limit counter for this user/window.
 * Returns the new count after increment.
 */
async function incrementRateLimit(userId: string): Promise<number> {
  const key = rateLimitKey(userId);
  const count = await redis.incr(key);
  // Expire at end of the window so Redis doesn't accumulate stale keys.
  if (count === 1) {
    await redis.expire(key, RATE_LIMIT_WINDOW);
  }
  return count;
}

/**
 * Returns current count without incrementing (for pre-flight check).
 */
async function getRateLimitCount(userId: string): Promise<number> {
  const key   = rateLimitKey(userId);
  const value = await redis.get(key);
  return value ? parseInt(value, 10) : 0;
}

/**
 * Fetches the most recent 100 bars at the given timeframe from the internal
 * markets API. Returns an empty array on failure rather than throwing.
 */
async function fetchBars(
  instrument: string,
  timeframe: string,
): Promise<Array<{
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  delta: number;
  cvd: number;
}>> {
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const url  = `${base}/api/markets/${encodeURIComponent(instrument)}/bars?tf=${encodeURIComponent(timeframe)}&limit=100`;
    const res  = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : (json.bars ?? []);
  } catch {
    return [];
  }
}

/**
 * Reads the current market state for an instrument from Redis.
 * Key pattern: state:{instrument}
 */
async function fetchMarketState(instrument: string): Promise<{
  lastPrice:     number;
  cvd:           number;
  delta:         number;
  imbalanceRatio: number;
  bidVolume:     number;
  askVolume:     number;
  regime?:       string;
} | null> {
  try {
    const raw = await redis.get(`state:${instrument}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Computes cost in cents for Opus 4.7 usage.
 * Prices (per 1 000 tokens): input $0.50, output $2.50
 */
function computeCostCents(usage: {
  input_tokens:                number;
  output_tokens:               number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?:    number;
}): number {
  const inputCents      = (usage.input_tokens                       / 1000) * 0.500;
  const outputCents     = (usage.output_tokens                      / 1000) * 2.500;
  const cacheReadCents  = ((usage.cache_read_input_tokens  ?? 0)    / 1000) * 0.050;
  const cacheWriteCents = ((usage.cache_creation_input_tokens ?? 0) / 1000) * 0.625;
  return Math.ceil(inputCents + outputCents + cacheReadCents + cacheWriteCents);
}

/**
 * Atomically deducts `costCents` from the user's token ledger.
 */
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

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  // ── 1. Auth ──────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const tier   = (session.user.tier ?? 'free') as UserTier;

  // ── 1a. Pro tier gate (deep analysis = Opus, Pro-only) ────────────────────
  if (tier !== 'pro') {
    return NextResponse.json(
      buildTierGateError('deep_analysis', 'deep_analysis'),
      { status: 403 },
    );
  }

  // ── 2. Balance check ──────────────────────────────────────────────────────
  const ledger = await db.tokenLedger.findUnique({
    where:  { userId },
    select: { balanceCents: true },
  });
  const balance = ledger?.balanceCents ?? 0;
  if (balance <= 0) {
    return NextResponse.json(
      {
        error:   'insufficient_balance',
        message: 'Your token balance is empty. Please top up to continue.',
      },
      { status: 402 },
    );
  }

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
  const { instrument, timeframe, context } = parsed.data;

  // ── Rate limit check (before incrementing) ────────────────────────────────
  const currentCount = await getRateLimitCount(userId);
  if (currentCount >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      {
        error:   'rate_limit_exceeded',
        message: `Maximum ${RATE_LIMIT_MAX} deep analyses per hour. Try again later.`,
        retryAfter: RATE_LIMIT_WINDOW,
      },
      { status: 429 },
    );
  }

  // Increment before streaming to prevent concurrent bursts from bypassing the check.
  await incrementRateLimit(userId);

  // ── 3. Fetch data ─────────────────────────────────────────────────────────
  const [bars, marketState] = await Promise.all([
    fetchBars(instrument, timeframe),
    fetchMarketState(instrument),
  ]);

  // Fallback current state if Redis has no live data.
  const currentState = marketState ?? {
    lastPrice:      bars.length > 0 ? bars[bars.length - 1].close : 0,
    cvd:            bars.length > 0 ? bars[bars.length - 1].cvd   : 0,
    delta:          bars.length > 0 ? bars[bars.length - 1].delta : 0,
    imbalanceRatio: 1,
    bidVolume:      0,
    askVolume:      0,
  };

  // ── 4. Build prompt ───────────────────────────────────────────────────────
  const sanitizedContext = context
    ? context.replace(/[<>]/g, '').slice(0, 500)
    : undefined;

  const prompt = buildDeepAnalysisPrompt({
    instrument,
    exchange:    'unknown',
    dataQuality: instrument.includes('USDT') || instrument.includes('BTC') ? 'true_l2' : 'inferred',
    bars,
    currentState,
    userContext: sanitizedContext,
    timeframe,
  });

  // ── 5. Stream from Claude Opus ────────────────────────────────────────────
  const startMs = Date.now();

  let finalUsage: {
    input_tokens:  number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?:     number;
  } | null = null;

  // Build a ReadableStream that speaks Server-Sent Events.
  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const enqueue = (data: string): void => {
        controller.enqueue(encoder.encode(data));
      };

      try {
        const stream = anthropic.messages.stream({
          model:      MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          system:     [SYSTEM_PROMPT_CACHE_BLOCK],
          messages: [
            { role: 'user', content: prompt },
          ],
        });

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            const payload = JSON.stringify({ type: 'delta', text: event.delta.text });
            enqueue(`data: ${payload}\n\n`);
          }
        }

        // Capture usage from the final message.
        const finalMessage = await stream.finalMessage();
        finalUsage = {
          input_tokens:  finalMessage.usage.input_tokens,
          output_tokens: finalMessage.usage.output_tokens,
          cache_creation_input_tokens:
            (finalMessage.usage as Record<string, number>)['cache_creation_input_tokens'],
          cache_read_input_tokens:
            (finalMessage.usage as Record<string, number>)['cache_read_input_tokens'],
        };

        const costCents = computeCostCents(finalUsage);
        const elapsedMs = Date.now() - startMs;

        const donePayload = JSON.stringify({
          type:       'done',
          model:      MODEL,
          costCents,
          costUsd:    (costCents / 100).toFixed(4),
          elapsedMs,
          inputTokens:  finalUsage.input_tokens,
          outputTokens: finalUsage.output_tokens,
        });
        enqueue(`data: ${donePayload}\n\n`);
        enqueue('data: [DONE]\n\n');

        // ── 7. Post-stream: log call and deduct balance ──────────────────────
        // Fire-and-forget; billing errors must not interrupt the stream.
        void (async () => {
          try {
            await db.llmCall.create({
              data: {
                userId,
                feature:                   'deep_analysis',
                model:                     MODEL,
                inputTokens:               finalUsage!.input_tokens,
                outputTokens:              finalUsage!.output_tokens,
                cacheCreationInputTokens:  finalUsage!.cache_creation_input_tokens ?? 0,
                cacheReadInputTokens:      finalUsage!.cache_read_input_tokens ?? 0,
                costCents,
                batched: false,
              },
            });
            await deductBalance(userId, costCents);
          } catch (err) {
            console.error('[deep-analysis] post-stream billing error:', err);
          }
        })();
      } catch (err) {
        const errPayload = JSON.stringify({
          type:    'error',
          message: err instanceof Error ? err.message : 'Stream error',
        });
        enqueue(`data: ${errPayload}\n\n`);
        enqueue('data: [DONE]\n\n');
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
