import Anthropic from '@anthropic-ai/sdk';
import type { PrismaClient } from '@prisma/client';

// ─── Feature / Model Types ────────────────────────────────────────────────────
// This package owns the exhaustive feature → model mapping, the per-model
// pricing table, tier gating, token-ledger debit and the `llm_calls` audit
// row. Every LLM call in the system routes through `callLlm` so billing and
// accounting live in exactly one place.

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

export type UserTier = 'free' | 'premium';

const HAIKU: LlmModel = 'claude-haiku-4-5';

// ─── Anthropic Client ─────────────────────────────────────────────────────────

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── Feature → Model Map ──────────────────────────────────────────────────────

const FEATURE_MODEL_MAP: Record<LlmFeature, LlmModel> = {
  // Haiku
  signal_triage:            'claude-haiku-4-5',
  signal_explanation_haiku: 'claude-haiku-4-5',
  whale_label:              'claude-haiku-4-5',
  qa_retrieval:             'claude-haiku-4-5',

  // Sonnet
  signal_explanation: 'claude-sonnet-4-6',
  scan_narrative:     'claude-sonnet-4-6',
  tape_narrator:      'claude-sonnet-4-6',
  regime_narration:   'claude-sonnet-4-6',
  correlation_alert:  'claude-sonnet-4-6',

  // Opus
  scan_synthesis: 'claude-opus-4-7',
  daily_recap:    'claude-opus-4-7',
  deep_analysis:  'claude-opus-4-7',
  whale_forensic: 'claude-opus-4-7',
  qa_synthesis:   'claude-opus-4-7',
};

// ─── Tier Permissions ─────────────────────────────────────────────────────────

const TIER_ALLOWED_MODELS: Record<UserTier, LlmModel[]> = {
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
  'claude-haiku-4-5': {
    input:      0.100,
    output:     0.500,
    cacheRead:  0.050,
    cacheWrite: 0.125,
  },
  'claude-sonnet-4-6': {
    input:      0.300,
    output:     1.500,
    cacheRead:  0.015,
    cacheWrite: 0.375,
  },
  'claude-opus-4-7': {
    input:      0.500,
    output:     2.500,
    cacheRead:  0.050,
    cacheWrite: 0.625,
  },
};

// ─── Usage Shape ──────────────────────────────────────────────────────────────

export interface LlmUsage {
  input_tokens:                 number;
  output_tokens:                number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?:     number;
}

// ─── Cost Helper ──────────────────────────────────────────────────────────────

export function computeCostCents(model: LlmModel, usage: LlmUsage): number {
  const p = MODEL_PRICE_MAP[model];

  const inputCents      = (usage.input_tokens / 1000) * p.input;
  const outputCents     = (usage.output_tokens / 1000) * p.output;
  const cacheReadCents  = ((usage.cache_read_input_tokens ?? 0) / 1000) * p.cacheRead;
  const cacheWriteCents = ((usage.cache_creation_input_tokens ?? 0) / 1000) * p.cacheWrite;

  // Round up to avoid undercharging
  return Math.ceil(inputCents + outputCents + cacheReadCents + cacheWriteCents);
}

// ─── Model Resolution ─────────────────────────────────────────────────────────

/**
 * Pure model selector. Resolves the intended model for a feature, then:
 *  1. Gates free users down to Haiku.
 *  2. Falls a premium user back to Haiku when their balance is exhausted
 *     (`balanceCents <= 0`). Pass `balanceCents = null` for free users (the
 *     tier gate already pins them to Haiku) or when a balance lookup is N/A.
 */
export function resolveModel(
  feature: LlmFeature,
  userTier: UserTier,
  balanceCents: number | null,
): LlmModel {
  let model = FEATURE_MODEL_MAP[feature];

  if (!TIER_ALLOWED_MODELS[userTier].includes(model)) {
    model = HAIKU;
  }

  if (userTier === 'premium' && model !== HAIKU && balanceCents !== null && balanceCents <= 0) {
    model = HAIKU;
  }

  return model;
}

// ─── Internal: Cache Control ──────────────────────────────────────────────────

/**
 * Returns a new array with `cache_control: { type: 'ephemeral' }` attached to
 * the last block. Idempotent — re-attaching to an already-marked block is a
 * harmless no-op. Does not mutate the input.
 */
function withEphemeralCacheOnLast(
  blocks: Anthropic.TextBlockParam[],
): Anthropic.TextBlockParam[] {
  if (blocks.length === 0) return blocks;

  return blocks.map((block, idx) => {
    if (idx !== blocks.length - 1) return block;
    return {
      ...block,
      cache_control: { type: 'ephemeral' as const },
    };
  });
}

// ─── Internal: Token Ledger ───────────────────────────────────────────────────

async function getPremiumBalance(
  db: PrismaClient,
  userId: string,
  userTier: UserTier,
): Promise<number | null> {
  if (userTier !== 'premium') return null;

  const ledger = await db.tokenLedger.findUnique({
    where:  { userId },
    select: { balanceCents: true },
  });

  return ledger?.balanceCents ?? 0;
}

/**
 * Atomically deducts `costCents` from `token_ledger` via an upsert so a
 * missing ledger row is created rather than silently skipped. A no-op when
 * `costCents` is zero.
 */
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

async function logCall(
  db: PrismaClient,
  args: {
    userId:    string;
    feature:   LlmFeature;
    model:     LlmModel;
    usage:     LlmUsage;
    costCents: number;
    batched:   boolean;
  },
): Promise<void> {
  const { userId, feature, model, usage, costCents, batched } = args;

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
    // Non-fatal: an audit-logging failure must not interrupt the caller.
    console.error('[llm/router] logCall failed:', err);
  }
}

// ─── Call Parameters / Result ─────────────────────────────────────────────────

export interface CallLlmParams {
  /** Each app injects its own PrismaClient instance. */
  db:       PrismaClient;
  feature:  LlmFeature;
  userId:   string;
  userTier: UserTier;
  /**
   * The user turn(s). Either a fixed array, or a builder that receives the
   * resolved model so callers can pick a model-specific prompt variant (e.g.
   * the leaner Haiku explanation prompt vs. the richer Sonnet one) without
   * re-implementing model resolution.
   */
  messages:
    | Anthropic.MessageParam[]
    | ((model: LlmModel) => Anthropic.MessageParam[]);
  systemBlocks?: Anthropic.TextBlockParam[];
  maxTokens?:    number;
  batch?:        boolean;
}

export interface CallLlmResult {
  text:      string;
  model:     LlmModel;
  costCents: number;
  usage:     LlmUsage;
}

// ─── Main Router ──────────────────────────────────────────────────────────────

/**
 * Single entry point for non-streaming LLM calls.
 *
 * 1. Resolves the model from feature + tier + balance (see `resolveModel`).
 * 2. Builds the prompt (model-aware if a builder fn was supplied).
 * 3. Attaches `cache_control: ephemeral` to the last system block.
 * 4. Dispatches the call.
 * 5. Writes the `llm_calls` audit row and atomically debits `token_ledger`
 *    (premium only). Free users are metered upstream by the caller's quota.
 *
 * Throws if the Anthropic call fails (e.g. missing/invalid API key); callers
 * are expected to wrap and fall back as appropriate.
 */
export async function callLlm(params: CallLlmParams): Promise<CallLlmResult> {
  const {
    db,
    feature,
    userId,
    userTier,
    messages,
    systemBlocks,
    maxTokens = 1024,
    batch     = false,
  } = params;

  // 1. Resolve model (tier gate + premium balance fallback)
  const balance = await getPremiumBalance(db, userId, userTier);
  const model   = resolveModel(feature, userTier, balance);

  // 2. Build prompt (model-aware when a builder fn is supplied)
  const resolvedMessages =
    typeof messages === 'function' ? messages(model) : messages;

  // 3. Cache the system prefix
  const systemParam: Anthropic.TextBlockParam[] | undefined =
    systemBlocks && systemBlocks.length > 0
      ? withEphemeralCacheOnLast(systemBlocks)
      : undefined;

  // 4. Dispatch
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system:     systemParam,
    messages:   resolvedMessages,
  });

  const usage: LlmUsage = {
    input_tokens:                response.usage.input_tokens,
    output_tokens:               response.usage.output_tokens,
    cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? undefined,
    cache_read_input_tokens:     response.usage.cache_read_input_tokens     ?? undefined,
  };

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');

  // 5. Audit + debit
  const costCents = computeCostCents(model, usage);
  await logCall(db, { userId, feature, model, usage, costCents, batched: batch });

  if (userTier === 'premium') {
    await deductFromLedger(db, userId, costCents);
  }

  return { text, model, costCents, usage };
}
