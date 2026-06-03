# LLM Prompt-Cache Doctor

A self-diagnosing log structure for OrderFlow's Anthropic prompt caching. Every
LLM call routed through `callLlm` (`packages/llm/src/router.ts`) writes one
structured line via `recordCacheEvent` (`packages/llm/src/cache-observability.ts`).
This file is the playbook a future "doctor" agent (or a human) follows to detect
a broken cache and fix it.

## Where the logs live

Directory: `$LLM_CACHE_LOG_DIR` (set it in the systemd EnvironmentFile
`/root/projects/orderflow/.env`). If unset, defaults to
`<os-tmpdir>/orderflow-llm-cache` — fine for dev, **set it explicitly in prod**:

```
LLM_CACHE_LOG_DIR=/root/projects/orderflow/logs/llm-cache
```

| File | Contents | Use |
|---|---|---|
| `events-YYYY-MM-DD.jsonl` | **every** call, one JSON line | full history / volume / cost |
| `health.jsonl` | only `warn` + `error` lines | **start here** — the fast path |

Disable logging entirely with `LLM_CACHE_LOG_DISABLED=1`.

## Line schema (`v: 1`)

```jsonc
{
  "v": 1,
  "ts": "2026-06-03T21:00:00.000Z",
  "feature": "deep_analysis",        // which LlmFeature
  "model": "claude-opus-4-7",
  "tier": "premium",                 // free | premium
  "outcome": "miss_below_min",       // see table below
  "severity": "warn",                // info | warn | error
  "eligible": false,                 // was the prefix big enough to cache?
  "systemTokensEst": 3000,           // estimated cached-prefix tokens
  "minRequired": 4096,               // model's minimum cacheable prefix
  "usage": { "input": 3200, "output": 700, "cacheRead": 0, "cacheWrite": 0 },
  "costCents": 4,
  "diagnosis": "human-readable cause",
  "hint": "concrete fix",
  "requestId": "req_..."             // Anthropic request id when available
}
```

## Outcomes → root cause → fix

| `outcome` | severity | What it means | Fix |
|---|---|---|---|
| `hit` | info | `cacheRead > 0` — caching is working. | none |
| `write_cold` | info | Wrote cache, no read yet (first call of a 5-min window). Healthy. | none |
| `no_api_key` | error | `ANTHROPIC_API_KEY` is unset — **no call was made at all.** The single most common cause of a blank cache dashboard. | Put a real key in `/root/projects/orderflow/.env`, then `systemctl restart orderflow-notification-dispatcher orderflow-api orderflow-web`. |
| `miss_below_min` | warn | The cached system prefix is shorter than `minRequired`; `cache_control` is silently ignored. | Extend `SYSTEM_PROMPT` in `packages/llm-prompts/src/system.ts` to clear the largest `minRequired` in use (4096), then `pnpm verify:cache`. |
| `disabled_no_system` | warn | The call sent no system blocks, so there's nothing to cache. | Pass `systemBlocks: [SYSTEM_PROMPT_CACHE_BLOCK]` for that feature's call site. |
| `miss_unexpected` | warn | Prefix is big enough but neither read nor write happened — a silent invalidator is mutating the prefix between calls. | Diff two consecutive rendered prefixes; remove per-request content from the cached region (timestamps, UUIDs, unsorted JSON, varying tool set). |
| `call_error` | error | The Anthropic call threw before usage was available. | Check the caller log near `ts`; validate the key, rate limits, and request shape. |

## Doctor procedure (automatable)

1. **Read `health.jsonl`** (or the last N lines). If empty and `events-*.jsonl`
   has only `hit`/`write_cold`, caching is healthy — stop.
2. **Tally `outcome` over the recent window.** The dominant non-`info` outcome
   is the problem to fix.
3. **Apply the matching fix above.** Each `hint` field is also machine-usable —
   it names the file/action.
4. **Verify**: run `pnpm verify:cache` (needs a live key). It asserts
   `cacheCreation > 0` on call 1 and `cacheRead > 0` on call 2 per model.
5. **Confirm in production**: after the next real traffic, new `events-*.jsonl`
   lines should show `hit` / `write_cold` and `health.jsonl` should stop growing.

## Invariants the doctor can assume

- `recordCacheEvent` never throws into the call path; a missing log is not an
  app failure.
- `minRequired` is sourced from `MODEL_MIN_CACHE_TOKENS` — update that map (and
  this table) if Anthropic changes thresholds.
- `systemTokensEst` is an estimate (chars/3.8). The authoritative numbers are
  `usage.cacheRead` / `usage.cacheWrite` from the API.
