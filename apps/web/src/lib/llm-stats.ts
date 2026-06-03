import type { PrismaClient } from '@prisma/client';
import { estimateUncachedCostCents, type LlmModel } from '@orderflow/llm';

// The set of models we know how to price. Rows logged under any other model
// string still count toward call/cost totals but are skipped for the
// cache-savings estimate (we can't re-price an unknown model).
const KNOWN_MODELS: LlmModel[] = [
  'claude-haiku-4-5',
  'claude-sonnet-4-6',
  'claude-opus-4-7',
];

function isKnownModel(model: string): model is LlmModel {
  return (KNOWN_MODELS as string[]).includes(model);
}

export interface ModelRow {
  model:            string;
  calls:            number;
  costCents:        number;
  cacheReadTokens:  number;
  cacheWriteTokens: number;
  inputTokens:      number;
}

export interface FeatureRow {
  feature:   string;
  calls:     number;
  costCents: number;
}

export interface WindowStats {
  label:             string;
  totalCalls:        number;
  totalCostCents:    number;
  /** What the same calls would have cost with caching disabled. */
  uncachedCostCents: number;
  /** uncachedCostCents − totalCostCents (≥ 0). */
  savedCents:        number;
  inputTokens:       number;
  outputTokens:      number;
  cacheReadTokens:   number;
  cacheWriteTokens:  number;
  /** cacheRead / (cacheRead + cacheWrite) — share of the cacheable prefix served from cache. */
  cacheHitRate:      number;
  /** cacheRead / (cacheRead + cacheWrite + input) — cached share of all prompt input. */
  cachedInputShare:  number;
  byModel:           ModelRow[];
  byFeature:         FeatureRow[];
}

async function windowStats(
  db: PrismaClient,
  label: string,
  since: Date | null,
): Promise<WindowStats> {
  const where = since ? { createdAt: { gte: since } } : {};

  const [byModelRaw, byFeatureRaw] = await Promise.all([
    db.llmCall.groupBy({
      by:     ['model'],
      where,
      _count: { _all: true },
      _sum: {
        costCents:                true,
        inputTokens:              true,
        outputTokens:             true,
        cacheReadInputTokens:     true,
        cacheCreationInputTokens: true,
      },
    }),
    db.llmCall.groupBy({
      by:     ['feature'],
      where,
      _count: { _all: true },
      _sum:   { costCents: true },
    }),
  ]);

  let totalCalls        = 0;
  let totalCostCents    = 0;
  let uncachedCostCents = 0;
  let inputTokens       = 0;
  let outputTokens      = 0;
  let cacheReadTokens   = 0;
  let cacheWriteTokens  = 0;

  const byModel: ModelRow[] = byModelRaw.map(row => {
    const calls      = row._count._all;
    const cost       = row._sum.costCents ?? 0;
    const input      = row._sum.inputTokens ?? 0;
    const output     = row._sum.outputTokens ?? 0;
    const cacheRead  = row._sum.cacheReadInputTokens ?? 0;
    const cacheWrite = row._sum.cacheCreationInputTokens ?? 0;

    totalCalls       += calls;
    totalCostCents   += cost;
    inputTokens      += input;
    outputTokens     += output;
    cacheReadTokens  += cacheRead;
    cacheWriteTokens += cacheWrite;

    // Cache savings: re-price this model's summed usage with caching off.
    if (isKnownModel(row.model)) {
      const usage = {
        input_tokens:                input,
        output_tokens:               output,
        cache_read_input_tokens:     cacheRead,
        cache_creation_input_tokens: cacheWrite,
      };
      uncachedCostCents += estimateUncachedCostCents(row.model, usage);
    } else {
      uncachedCostCents += cost; // unknown model — assume no savings
    }

    return {
      model:            row.model,
      calls,
      costCents:        cost,
      cacheReadTokens:  cacheRead,
      cacheWriteTokens: cacheWrite,
      inputTokens:      input,
    };
  });

  byModel.sort((a, b) => b.costCents - a.costCents);

  const byFeature: FeatureRow[] = byFeatureRaw
    .map(row => ({
      feature:   row.feature,
      calls:     row._count._all,
      costCents: row._sum.costCents ?? 0,
    }))
    .sort((a, b) => b.costCents - a.costCents);

  const cacheablePrefix = cacheReadTokens + cacheWriteTokens;
  const cacheHitRate    = cacheablePrefix > 0 ? cacheReadTokens / cacheablePrefix : 0;
  const allInput        = cacheablePrefix + inputTokens;
  const cachedInputShare = allInput > 0 ? cacheReadTokens / allInput : 0;

  return {
    label,
    totalCalls,
    totalCostCents,
    uncachedCostCents,
    savedCents: Math.max(0, uncachedCostCents - totalCostCents),
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cacheHitRate,
    cachedInputShare,
    byModel,
    byFeature,
  };
}

/**
 * Aggregate `llm_calls` into 24h / 7d / 30d windows for the admin cost-center
 * KPI. Each window reports spend, token mix, cache-hit rate and estimated
 * dollars saved by prompt caching. Aggregate spend uses the per-call
 * `cost_cents` already persisted by `callLlm` at call time.
 */
export async function getLlmStats(db: PrismaClient): Promise<WindowStats[]> {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  return Promise.all([
    windowStats(db, 'Last 24h', new Date(now - day)),
    windowStats(db, 'Last 7d',  new Date(now - 7 * day)),
    windowStats(db, 'Last 30d', new Date(now - 30 * day)),
  ]);
}
