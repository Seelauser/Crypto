import Anthropic from '@anthropic-ai/sdk';
import type { PrismaClient } from '@prisma/client';

// ─── Feature / Model Types ────────────────────────────────────────────────────

export type LlmFeature =
  // Haiku tier
  | 'signal_triage'
  | 'signal_explanation_haiku'
  | 'whale_label'
  | 'qa_retrieval'
  // Sonnet tier
  | 'signal_explanation'
  | 'scan_narrative'
  | 'tape_narrator'
  | 'regime_narration'
  | 'correlation_alert'
  // Opus tier
  | 'scan_synthesis'
  | 'daily_recap'
  | 'deep_analysis'
  | 'whale_forensic'
  | 'qa_synthesis';

export type LlmModel =
  | 'claude-haiku-4-5'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-7';

// ─── Anthropic Client ─────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Feature → Model Map ──────────────────────────────────────────────────────

const FEATURE_MODEL_MAP: Record<LlmFeature, LlmModel> = {
  signal_triage:            'claude-haiku-4-5',
  signal_explanation_haiku: 'claude-haiku-4-5',
  whale_label:              'claude-haiku-4-5',
  qa_retrieval:             'claude-haiku-4-5',

  signal_explanation: 'claude-sonnet-4-6',
  scan_narrative:     'claude-sonnet-4-6',
  tape_narrator:      'claude-sonnet-4-6',
  regime_narration:   'claude-sonnet-4-6',
  correlation_alert:  'claude-sonnet-4-6',

  scan_synthesis: 'claude-opus-4-7',
  daily_recap:    'claude-opus-4-7',
  deep_analysis:  'claude-opus-4-7',
  whale_forensic: 'claude-opus-4-7',
  qa_synthesis:   'claude-opus-4-7',
};

const TIER_ALLOWED_MODELS: Record<'free' | 'premium', LlmModel[]> = {
  free:    ['claude-haiku-4-5'],
  premium: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7'],
};

// ─── Pricing (cents per 1 000 tokens) ─────────────────────────────────────────

interface ModelPricing {
  input:      number;
  output:     number;
  cacheRead:  number;
  cacheWrite: number;
}

const MODEL_PRICE_MAP: Record<LlmModel, ModelPricing> = {
  'claude-haiku-4-5':  { input: 0.100, output: 0.500, cacheRead: 0.050, cacheWrite: 0.125 },
  'claude-sonnet-4-6': { input: 0.300, output: 1.500, cacheRead: 0.015, cacheWrite: 0.375 },
  'claude-opus-4-7':   { input: 0.500, output: 2.500, cacheRead: 0.050, cacheWrite: 0.625 },
};

interface LlmUsage {
  input_tokens:                 number;
  output_tokens:                number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?:     number;
}

export function computeCostCents(model: LlmModel, usage: LlmUsage): number {
  const p = MODEL_PRICE_MAP[model];
  const inputCents      = (usage.input_tokens / 1000) * p.input;
  const outputCents     = (usage.output_tokens / 1000) * p.output;
  const cacheReadCents  = ((usage.cache_read_input_tokens ?? 0) / 1000) * p.cacheRead;
  const cacheWriteCents = ((usage.cache_creation_input_tokens ?? 0) / 1000) * p.cacheWrite;
  // Round up to avoid undercharging.
  return Math.ceil(inputCents + outputCents + cacheReadCents + cacheWriteCents);
}

// ─── Call Parameters ──────────────────────────────────────────────────────────

export interface CallLlmParams {
  db:            PrismaClient;
  feature:       LlmFeature;
  userId:        string;
  userTier:      'free' | 'premium';
  messages:      Anthropic.MessageParam[];
  systemBlocks?: Anthropic.TextBlockParam[];
  maxTokens?:    number;
  stream?:       boolean;
  batch?:        boolean;
}

// ─── Internal: Cache Control ──────────────────────────────────────────────────

function withEphemeralCacheOnLast(
  blocks: Anthropic.TextBlockParam[],
): Anthropic.TextBlockParam[] {
  if (blocks.length === 0) return blocks;
  return blocks.map((block, idx) =>
    idx !== blocks.length - 1
      ? block
      : { ...block, cache_control: { type: 'ephemeral' as const } },
  );
}

// ─── Internal: Token Ledger ───────────────────────────────────────────────────

async function getPremiumBalance(
  db: PrismaClient,
  userId: string,
  userTier: 'free' | 'premium',
): Promise<number | null> {
  if (userTier !== 'premium') return null;
  const ledger = await db.tokenLedger.findUnique({
    where:  { userId },
    select: { balanceCents: true },
  });
  return ledger?.balanceCents ?? 0;
}

async function deductFromLedger(
  db: PrismaClient,
  userId: string,
  costCents: number,
): Promise<void> {
  if (costCents <= 0) return;
  await db.$executeRaw`
    INSERT INTO token_ledger (user_id, balance_cents, updated_at)
    VALUES (${userId}, ${-costCents}, now())
    ON CONFLICT (user_id) DO UPDATE
      SET balance_cents = token_ledger.balance_cents - ${costCents},
          updated_at    = now()
  `;
}

// ─── Internal: Call Logger ────────────────────────────────────────────────────

interface LogCallArgs {
  db:        PrismaClient;
  userId:    string;
  feature:   LlmFeature;
  model:     LlmModel;
  usage:     LlmUsage;
  costCents: number;
  batched:   boolean;
}

async function logCall(args: LogCallArgs): Promise<void> {
  const { db, userId, feature, model, usage, costCents, batched } = args;
  try {
    await db.llmCall.create({
      data: {
        userId,
        feature,
        model,
        inputTokens:              usage.input_tokens,
        outputTokens:             usage.output_tokens,
        cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
        cacheReadInputTokens:     usage.cache_read_input_tokens ?? 0,
        costCents,
        batched,
      },
    });
  } catch (err) {
    // Non-fatal — logging must never interrupt the caller.
    console.error('[llm/router] logCall failed:', err);
  }
}

// ─── Main Router ──────────────────────────────────────────────────────────────

export interface LlmCallResult {
  text:      string;
  model:     LlmModel;
  costCents: number;
}

/**
 * Three-tier LLM router.
 *
 * 1. Resolves the intended model from `FEATURE_MODEL_MAP`.
 * 2. Gates free users to Haiku; silently downgrades.
 * 3. For premium Sonnet/Opus calls: checks token balance, falls back to
 *    Haiku when ≤ 0.
 * 4. Attaches `cache_control: { type: 'ephemeral' }` to the last system block.
 * 5. Dispatches the call (streaming or blocking).
 * 6. Writes `llm_calls` and atomically deducts from `token_ledger`.
 *
 * `db` is injected per-call so each app can pass its own PrismaClient
 * (workers, web, api each instantiate independently).
 *
 * Returns `{ text, model, costCents }` for blocking calls so callers can
 * persist provenance (which model actually ran, what it cost) into their
 * own domain records (SignalEvent, DailyRecap, etc.) without hitting
 * `llm_calls` a second time. For `stream:true`, returns an
 * `AsyncIterable<string>` of text deltas (billing is logged in the
 * background once the stream finalises).
 */
export function callLlm(
  params: CallLlmParams & { stream: true },
): Promise<AsyncIterable<string>>;
export function callLlm(
  params: CallLlmParams & { stream?: false },
): Promise<LlmCallResult>;
export async function callLlm(
  params: CallLlmParams,
): Promise<LlmCallResult | AsyncIterable<string>> {
  const {
    db,
    feature,
    userId,
    userTier,
    messages,
    systemBlocks,
    maxTokens = 1024,
    stream    = false,
    batch     = false,
  } = params;

  // 1. Resolve model
  let model: LlmModel = FEATURE_MODEL_MAP[feature];

  // 2. Tier gate
  const allowedModels = TIER_ALLOWED_MODELS[userTier];
  if (!allowedModels.includes(model)) {
    model = 'claude-haiku-4-5';
  }

  // 3. Premium balance fallback
  if (userTier === 'premium' && model !== 'claude-haiku-4-5') {
    const balance = await getPremiumBalance(db, userId, userTier);
    if (balance !== null && balance <= 0) {
      model = 'claude-haiku-4-5';
    }
  }

  // 4. Cache control on last system block
  const systemParam: Anthropic.TextBlockParam[] | undefined =
    systemBlocks && systemBlocks.length > 0
      ? withEphemeralCacheOnLast(systemBlocks)
      : undefined;

  // 5a. Streaming path
  if (stream) {
    const streamResult = await anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      system:     systemParam,
      messages,
    });

    // Log + deduct asynchronously after the stream finalises so the caller
    // is not blocked by billing.
    void (async () => {
      try {
        const finalMsg = await streamResult.finalMessage();
        const streamUsage: LlmUsage = {
          input_tokens:  finalMsg.usage.input_tokens,
          output_tokens: finalMsg.usage.output_tokens,
          cache_creation_input_tokens: finalMsg.usage.cache_creation_input_tokens ?? undefined,
          cache_read_input_tokens:     finalMsg.usage.cache_read_input_tokens     ?? undefined,
        };
        const costCents = computeCostCents(model, streamUsage);
        await logCall({ db, userId, feature, model, usage: streamUsage, costCents, batched: batch });
        if (userTier === 'premium') {
          await deductFromLedger(db, userId, costCents);
        }
      } catch (err) {
        console.error('[llm/router] post-stream billing error:', err);
      }
    })();

    async function* textDeltas(): AsyncIterable<string> {
      for await (const event of streamResult) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    }
    return textDeltas();
  }

  // 5b. Non-streaming path
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system:     systemParam,
    messages,
  });

  const usage: LlmUsage = {
    input_tokens:  response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? undefined,
    cache_read_input_tokens:     response.usage.cache_read_input_tokens     ?? undefined,
  };

  const responseText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');

  // 6. Log + deduct
  const costCents = computeCostCents(model, usage);
  await logCall({ db, userId, feature, model, usage, costCents, batched: batch });

  if (userTier === 'premium') {
    await deductFromLedger(db, userId, costCents);
  }

  return { text: responseText, model, costCents };
}
