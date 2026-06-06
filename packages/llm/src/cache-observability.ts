/**
 * cache-observability.ts — focused, self-diagnosing prompt-cache telemetry.
 *
 * Every LLM call routed through `callLlm` emits ONE structured JSON line here
 * describing whether prompt caching worked and, when it didn't, WHY plus a
 * concrete fix hint. The output is designed to be consumed by an automated
 * "doctor" agent (or a human) — see docs/LLM_CACHE_DOCTOR.md for the playbook.
 *
 * Files (under LLM_CACHE_LOG_DIR, default <tmp>/orderflow-llm-cache):
 *   events-YYYY-MM-DD.jsonl   every call, one line — the full record
 *   health.jsonl              warn/error lines only — the doctor's fast path
 *
 * Design rules:
 *   - Never throws into the caller. Logging a cache event must never break a
 *     user-facing LLM call (same contract as the llm_calls audit row).
 *   - No new dependencies. Node built-ins only.
 *   - Append-only JSONL so the doctor can tail/replay without a DB.
 *   - One schema version field (`v`) so the doctor can evolve safely.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LlmFeature, LlmModel, LlmUsage } from './router';

export const CACHE_LOG_SCHEMA_VERSION = 1;

/**
 * Anthropic's minimum cacheable prefix per model (tokens). A system prefix
 * shorter than this is SILENTLY not cached — no error, cache_creation stays 0.
 * Keep this in sync with platform.claude.com prompt-caching docs.
 */
export const MODEL_MIN_CACHE_TOKENS: Record<LlmModel, number> = {
  'claude-haiku-4-5': 4096,
  'claude-sonnet-4-6':         1024,
  'claude-opus-4-7':           4096,
};

/** Rough token estimate from character count (chars / 3.8). Good enough for a
 *  threshold check; the ground truth is usage.* from the API response. */
export function estimateTokens(text: string): number {
  return Math.round(text.length / 3.8);
}

export type CacheOutcome =
  | 'hit'                 // cache_read > 0 — working as intended
  | 'write_cold'          // wrote cache, no read yet (first call / post-TTL) — healthy
  | 'miss_below_min'      // prefix under the model minimum — the silent killer
  | 'miss_unexpected'     // eligible prefix but no read AND no write — invalidator suspected
  | 'disabled_no_system'  // no system blocks sent — caching impossible
  | 'no_api_key'          // call never made — ANTHROPIC_API_KEY unset
  | 'call_error';         // the Anthropic call threw for another reason

export type CacheSeverity = 'info' | 'warn' | 'error';

export interface CacheEventInput {
  feature:           LlmFeature;
  model:             LlmModel;
  tier:              'free' | 'premium';
  /** Estimated tokens of the cached system prefix (0 when no system sent). */
  systemTokensEst:   number;
  hadSystem:         boolean;
  /** Present when the call completed; absent when it never ran. */
  usage?:            LlmUsage;
  costCents?:        number;
  /** Force a no-call outcome when the API was never reached. */
  notCalled?:        'no_api_key' | 'call_error';
  requestId?:        string | null;
}

interface ClassifiedEvent {
  outcome:   CacheOutcome;
  severity:  CacheSeverity;
  eligible:  boolean;
  diagnosis: string;
  hint:      string;
}

/**
 * Pure classifier — maps a call's facts to an outcome, severity and a concrete
 * remediation hint. Exported so the doctor agent (or tests) can reuse the exact
 * same logic offline against historical lines.
 */
export function classifyCache(input: CacheEventInput): ClassifiedEvent {
  const min = MODEL_MIN_CACHE_TOKENS[input.model];
  const eligible = input.hadSystem && input.systemTokensEst >= min;

  if (input.notCalled === 'no_api_key') {
    return {
      outcome: 'no_api_key', severity: 'error', eligible: false,
      diagnosis: 'No LLM call was made — ANTHROPIC_API_KEY is unset, so every AI feature is in fallback mode and nothing reaches the cache.',
      hint: 'Set ANTHROPIC_API_KEY in the systemd EnvironmentFile (/root/projects/orderflow/.env) and restart the affected services.',
    };
  }
  if (input.notCalled === 'call_error') {
    return {
      outcome: 'call_error', severity: 'error', eligible,
      diagnosis: 'The Anthropic call threw before usage was available (network, auth, rate limit, or 4xx).',
      hint: 'Inspect the caller log near this timestamp; check key validity and rate limits.',
    };
  }

  if (!input.hadSystem) {
    return {
      outcome: 'disabled_no_system', severity: 'warn', eligible: false,
      diagnosis: 'Call sent no system blocks, so there is no prefix to cache.',
      hint: 'Pass systemBlocks: [SYSTEM_PROMPT_CACHE_BLOCK] to callLlm for this feature.',
    };
  }

  const u = input.usage;
  const cacheRead  = u?.cache_read_input_tokens ?? 0;
  const cacheWrite = u?.cache_creation_input_tokens ?? 0;

  if (cacheRead > 0) {
    return {
      outcome: 'hit', severity: 'info', eligible: true,
      diagnosis: `Cache hit: ${cacheRead} prefix tokens served from cache.`,
      hint: '',
    };
  }
  if (cacheWrite > 0) {
    return {
      outcome: 'write_cold', severity: 'info', eligible: true,
      diagnosis: `Cache write (cold): ${cacheWrite} tokens written, no read yet — expected on the first call of a 5-minute window.`,
      hint: '',
    };
  }
  if (!eligible) {
    return {
      outcome: 'miss_below_min', severity: 'warn', eligible: false,
      diagnosis: `System prefix ~${input.systemTokensEst} tokens is below the ${min}-token minimum for ${input.model}; cache_control is silently ignored.`,
      hint: `Raise the cached system prefix to >= ${min} tokens for ${input.model} (extend SYSTEM_PROMPT in packages/llm-prompts/src/system.ts), then re-run scripts/verify-cache.ts.`,
    };
  }
  return {
    outcome: 'miss_unexpected', severity: 'warn', eligible: true,
    diagnosis: 'Prefix is large enough to cache but neither a read nor a write occurred — a silent invalidator is changing the prefix between calls.',
    hint: 'Audit the rendered system/tools prefix for per-request content (timestamps, UUIDs, unsorted JSON, varying tool set). Diff two consecutive requests.',
  };
}

// ─── File sink ────────────────────────────────────────────────────────────────

function logDir(): string {
  const fromEnv = process.env.LLM_CACHE_LOG_DIR?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : join(tmpdir(), 'orderflow-llm-cache');
}

let dirReady: Promise<void> | null = null;
function ensureDir(dir: string): Promise<void> {
  if (!dirReady) {
    dirReady = mkdir(dir, { recursive: true }).then(() => undefined);
  }
  return dirReady;
}

function dayStamp(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/**
 * Record one cache event. Fire-and-forget: returns immediately, writes in the
 * background, and swallows every error so a logging fault never affects the
 * caller. Disable entirely with LLM_CACHE_LOG_DISABLED=1.
 */
export function recordCacheEvent(input: CacheEventInput): void {
  if (process.env.LLM_CACHE_LOG_DISABLED === '1') return;

  const now = new Date();
  const c = classifyCache(input);
  const u = input.usage;

  const line = JSON.stringify({
    v:               CACHE_LOG_SCHEMA_VERSION,
    ts:              now.toISOString(),
    feature:         input.feature,
    model:           input.model,
    tier:            input.tier,
    outcome:         c.outcome,
    severity:        c.severity,
    eligible:        c.eligible,
    systemTokensEst: input.systemTokensEst,
    minRequired:     MODEL_MIN_CACHE_TOKENS[input.model],
    usage: {
      input:      u?.input_tokens ?? 0,
      output:     u?.output_tokens ?? 0,
      cacheRead:  u?.cache_read_input_tokens ?? 0,
      cacheWrite: u?.cache_creation_input_tokens ?? 0,
    },
    costCents:  input.costCents ?? 0,
    diagnosis:  c.diagnosis,
    hint:       c.hint,
    requestId:  input.requestId ?? null,
  }) + '\n';

  const dir = logDir();
  void (async () => {
    try {
      await ensureDir(dir);
      await appendFile(join(dir, `events-${dayStamp(now)}.jsonl`), line);
      if (c.severity !== 'info') {
        // Doctor fast-path: only anomalies land here.
        await appendFile(join(dir, 'health.jsonl'), line);
      }
    } catch {
      // Never propagate — observability must not break the call path.
      dirReady = null; // allow a retry on the next event if mkdir failed
    }
  })();
}
