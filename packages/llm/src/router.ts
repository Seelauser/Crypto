import Anthropic from '@anthropic-ai/sdk';
import type { PrismaClient } from '@prisma/client';
import { recordCacheEvent, estimateTokens } from './cache-observability';
import { getFeatureSystemPrompt } from '@orderflow/llm-prompts';

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
  | 'claude-haiku-4-5-20251001'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-8';

export type UserTier = 'free' | 'premium';

const HAIKU: LlmModel = 'claude-haiku-4-5-20251001';

// ─── Anthropic Client ─────────────────────────────────────────────────────────

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: {
    'anthropic-beta': 'cache-diagnosis-2026-04-07',
  },
});

// ─── Cache Diagnostics State ──────────────────────────────────────────────────
// Tracks the last response ID per (feature, model) pair so the next call can
// request a cache-miss comparison from the API. In-memory only — resets on
// restart, which is fine: we care about steady-state miss reasons, not boot.
const _lastResponseId = new Map<string, string | null>();

function _diagKey(feature: LlmFeature, model: LlmModel): string {
  return `${feature}:${model}`;
}

// ─── Feature → Model Map ──────────────────────────────────────────────────────

const FEATURE_MODEL_MAP: Record<LlmFeature, LlmModel> = {
  // Haiku
  signal_triage:            'claude-haiku-4-5-20251001',
  signal_explanation_haiku: 'claude-haiku-4-5-20251001',
  whale_label:              'claude-haiku-4-5-20251001',
  qa_retrieval:             'claude-haiku-4-5-20251001',

  // Sonnet
  signal_explanation: 'claude-sonnet-4-6',
  scan_narrative:     'claude-sonnet-4-6',
  tape_narrator:      'claude-sonnet-4-6',
  regime_narration:   'claude-sonnet-4-6',
  correlation_alert:  'claude-sonnet-4-6',

  // Opus
  scan_synthesis: 'claude-opus-4-8',
  daily_recap:    'claude-opus-4-8',
  deep_analysis:  'claude-opus-4-8',
  whale_forensic: 'claude-opus-4-8',
  qa_synthesis:   'claude-opus-4-8',
};

// ─── Tier Permissions ─────────────────────────────────────────────────────────

const TIER_ALLOWED_MODELS: Record<UserTier, LlmModel[]> = {
  free:    ['claude-haiku-4-5-20251001'],
  premium: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-8'],
};

// ─── Pricing (cents per 1 000 tokens) ─────────────────────────────────────────

interface ModelPricing {
  input:      number;
  output:     number;
  cacheRead:  number;
  cacheWrite: number;
}

const MODEL_PRICE_MAP: Record<LlmModel, ModelPricing> = {
  'claude-haiku-4-5-20251001': {
    input:      0.100,
    output:     0.500,
    cacheRead:  0.010,   // $0.10/MTok — 0.1× base input
    cacheWrite: 0.125,   // $1.25/MTok — 1.25× base input (5m TTL)
  },
  'claude-sonnet-4-6': {
    input:      0.300,
    output:     1.500,
    cacheRead:  0.030,   // $0.30/MTok — 0.1× base input
    cacheWrite: 0.375,   // $3.75/MTok — 1.25× base input (5m TTL)
  },
  'claude-opus-4-8': {
    input:      0.500,
    output:     2.500,
    cacheRead:  0.050,   // $0.50/MTok — 0.1× base input
    cacheWrite: 0.625,   // $6.25/MTok — 1.25× base input (5m TTL)
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

/**
 * What a call *would* have cost with prompt caching disabled: the cached-read
 * and cache-write tokens are re-priced at the full input rate. Subtract the
 * real `computeCostCents` from this to get the dollars caching saved. Used by
 * the admin cost-center KPI to quantify cache effectiveness.
 */
export function estimateUncachedCostCents(model: LlmModel, usage: LlmUsage): number {
  const p = MODEL_PRICE_MAP[model];

  const inputLikeTokens =
    usage.input_tokens +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0);

  const inputCents  = (inputLikeTokens / 1000) * p.input;
  const outputCents = (usage.output_tokens / 1000) * p.output;

  return Math.ceil(inputCents + outputCents);
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
 * each block — Anthropic supports up to 4 cache breakpoints per request, and
 * marking every system block lets us chain a global prompt + per-feature
 * prompt and have both reused across calls (C4). For one-block callers this
 * is identical to the old "mark only the last" behavior. Idempotent.
 */
function withEphemeralCacheOnAll(
  blocks: Anthropic.TextBlockParam[],
): Anthropic.TextBlockParam[] {
  if (blocks.length === 0) return blocks;
  // Hard-cap at 4 — beyond that Anthropic rejects the call. Warn loudly so a
  // future feature accidentally piling on extra blocks fails noisily, not
  // silently in prod.
  if (blocks.length > 4) {
    console.warn(`[llm/router] >4 system blocks (${blocks.length}); only first 4 will be marked cacheable`);
  }
  return blocks.map((block, idx) => {
    if (idx >= 4) return block;
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

  // 3. Cache the system prefix.
  //    C4 — append a per-feature system block (if defined) so callers get a
  //    second cache breakpoint without manually wiring it. Each block is then
  //    marked cacheable so both the global and feature prefixes get reused.
  const featureExtra = getFeatureSystemPrompt(feature);
  const enrichedBlocks: Anthropic.TextBlockParam[] = [
    ...(systemBlocks ?? []),
    ...(featureExtra ? [{ type: 'text' as const, text: featureExtra }] : []),
  ];
  const hadSystem = enrichedBlocks.length > 0;
  const systemParam: Anthropic.TextBlockParam[] | undefined = hadSystem
    ? withEphemeralCacheOnAll(enrichedBlocks)
    : undefined;
  const systemTokensEst = hadSystem
    ? enrichedBlocks.reduce((n, b) => n + estimateTokens(b.text ?? ''), 0)
    : 0;

  // 3a. No-key guard — surface the real reason in the cache log instead of an
  //     opaque 401 buried in the caller's catch. This is the #1 cause of an
  //     empty prompt-cache dashboard (see docs/LLM_CACHE_DOCTOR.md).
  if (!process.env.ANTHROPIC_API_KEY) {
    recordCacheEvent({ feature, model, tier: userTier, hadSystem, systemTokensEst, notCalled: 'no_api_key' });
    throw new Error('[llm/router] ANTHROPIC_API_KEY is not set — no LLM call made');
  }

  // 4. Dispatch — pass cache diagnostics to detect silent prefix invalidators.
  const diagKey = _diagKey(feature, model);
  const prevId  = _lastResponseId.has(diagKey) ? _lastResponseId.get(diagKey)! : null;

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create(
      {
        model,
        max_tokens: maxTokens,
        system:     systemParam,
        messages:   resolvedMessages,
        // @ts-ignore — diagnostics is a beta field (cache-diagnosis-2026-04-07)
        diagnostics: { previous_message_id: prevId },
      },
    );
  } catch (err) {
    recordCacheEvent({ feature, model, tier: userTier, hadSystem, systemTokensEst, notCalled: 'call_error' });
    throw err;
  }

  // Store response ID for next call; null on first turn (no prior to compare).
  _lastResponseId.set(diagKey, (response as unknown as Record<string, unknown>)['id'] as string ?? null);

  // Extract diagnostics miss reason if present.
  const diagResult   = (response as unknown as Record<string, unknown>)['diagnostics'] as { cache_miss_reason?: { type: string } | null } | null | undefined;
  const cacheMissReason = diagResult?.cache_miss_reason?.type ?? null;

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

  // 5a. Cache telemetry — one self-diagnosing line per call for the doctor.
  recordCacheEvent({
    feature, model, tier: userTier, hadSystem, systemTokensEst,
    usage, costCents,
    requestId:       (response as { _request_id?: string | null })._request_id ?? null,
    cacheMissReason,
  });

  if (userTier === 'premium') {
    await deductFromLedger(db, userId, costCents);
  }

  return { text, model, costCents, usage };
}
