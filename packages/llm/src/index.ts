export {
  callLlm,
  resolveModel,
  computeCostCents,
  estimateUncachedCostCents,
} from './router';

export type {
  LlmFeature,
  LlmModel,
  UserTier,
  LlmUsage,
  CallLlmParams,
  CallLlmResult,
} from './router';

// Prompt-cache observability — structured, self-diagnosing telemetry consumed
// by the doctor agent. See docs/LLM_CACHE_DOCTOR.md.
export {
  recordCacheEvent,
  classifyCache,
  estimateTokens,
  MODEL_MIN_CACHE_TOKENS,
  CACHE_LOG_SCHEMA_VERSION,
} from './cache-observability';

export type {
  CacheOutcome,
  CacheSeverity,
  CacheEventInput,
} from './cache-observability';

// Boot-time prompt-cache pre-warm (C5). Long-lived workers should call this
// once on startup to move the first-call cache-write off the user-visible
// latency path.
export { prewarmCache } from './prewarm';
