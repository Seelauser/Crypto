# Next Session — Start From Here

**Last updated:** 2026-06-03 (session 23, E6 added) · **Latest commit on `origin/main`:** `2808d64`

This is the single document a future session should read first. It captures
**where we are**, **what's verified working**, and **what to pick up next**
without scrolling through prior checkpoints.

---

## 1. Current state of the live service

| | |
|---|---|
| URL | https://orderflow-beast.com |
| Last health check | 2026-06-03 — HTTP 200 in 256ms |
| systemd units active | **13 services + 1 timer** (scan-worker now live as of session 22) |
| Git | `main` clean, in sync with `origin/main` |
| Typecheck | `pnpm typecheck` — green |
| Lint | no-op (next-lint deprecated, dropped) |
| Real data | Crypto only (BTC/ETH/SOL via Binance + Coinbase + Kraken) |
| Synthetic data | Stocks, futures, forex, commodities, resources — bars API GBM fallback |
| Notifications | Wired but silent (no Resend/VAPID/Telegram keys) |
| Billing | Wired but not flipped on (no Stripe keys) |
| AI | Prompt-caching gate authored but **awaiting real ANTHROPIC_API_KEY** to verify (current value in `.env` is empty) |

---

## 2. Recent shipped work (last 3 sessions)

| Commit | What |
|---|---|
| `2808d64` | feat(streaming): persist CVD baselines across worker restarts (E6) |
| `6e34ada` | fix(redis): allow commands to buffer during initial connect (cold-start race) |
| `74f439f` | feat(auth): /api/auth/resend route + inline resend on login (E3) |
| `f7a87c0` | feat(db): Phase 1.3–1.6 hypertables (footprint, derivs, on-chain, options) |
| `ffd198c` | fix(auth): registration rate limit Map → Redis (E2) |
| `dde0edc` | chore: hoist tsx + anthropic SDK to root devDeps so verify:cache runs |
| `5b45890` | perf(api/bars): query continuous aggregates instead of raw market_ticks |
| `59b3148` | docs: ORDERFLOW BEAST REWORK MASTER spec |
| `5ac6361` | fix(p0): scan-worker deployed, OB retention policy, evaluator TTL 30s→5s |
| `ab8024a` | perf(llm): expand SYSTEM_PROMPT past Haiku 4.5 cacheable threshold |

---

## 3. What to pick up next — by who is blocked

### A) Items Claude can do without credentials (recommended next session)

These are ordered by impact-per-hour.

| # | Item | Effort | Notes |
|---|---|---|---|
| **C2** | Route 3 bypassed LLM callers through `callLlm()` | ~1 h | Restores ledger debit + audit row. Works without a real Anthropic key. |
| **E7** | Per-page mobile audit | ~4 h | ARCHITECTURE.md §11 Tier 4 #12 |
| **E8** | ESLint flat-config migration | ~1 h | ARCHITECTURE.md §11 Tier 5 #18 |
| **P1-7** | Tier enum migration `free\|premium` → `free\|starter\|pro` | ~1 h | Breaking; saved for Phase 2 bundle |
| **Phase 2** | Full 3-tier system rollout | ~6–10 h | Breaking, well-scoped; coordinated PR |

#### Done since previous picklist (move from A to ✓)

- ✅ **E1** Scan-worker deployed (session 22, `5ac6361`)
- ✅ **E2** Rate-limit Map → Redis (this session, `ffd198c`)
- ✅ **E3** `/api/auth/resend` + UI (this session, `74f439f`)
- ✅ **E4** CAGGs on ohlcv_bars (session 22, `5b45890`)
- ✅ **E5** OB retention policy (session 22, `5ac6361`)
- ✅ **P1-3..1-6** 4 additive hypertables (this session, `f7a87c0`)
- ✅ **E6** Persisted CVD baselines (this session, `2808d64` — Redis hash `streaming:cvd_snapshot`, 60s cadence, 24h staleness guard)

#### Prompt caching (group) — gate authored, awaits a real key

The caching path is wired (system prompt expanded to ~3,154 tokens, cache
markers attached). The verify gate `pnpm verify:cache` runs from root now
that root has `@anthropic-ai/sdk` + `tsx`. **Blocked: real key.** The
value in `.env` for `ANTHROPIC_API_KEY` is the empty string — present in
key form so dotenv parses it, but rejected by Anthropic as `401 invalid
x-api-key`.

| # | Item | Effort | Why |
|---|---|---|---|
| **C2** | Route 3 bypassed callers through `callLlm()` — `apps/workers/notification-dispatcher.ts:153`, `apps/workers/daily-recap.ts:185`, `apps/web/src/app/api/signals/[id]/explain/route.ts:179`. Restores ledger debit, audit row, free-tier fallback. | ~1 h | Independent of caching but in the same file set. |
| **C3** | Cost-center / `/admin` KPI for cache-hit rate from `llm_calls.cache_read_input_tokens`. | ~1 h | Without this, future regressions are invisible. |
| **C4** | Sonnet-tier features: per-feature prompt in a second cached system block. | ~1 h | Sonnet's 2048-token bar is easier to clear feature-by-feature. |
| **C5** | Pre-warm with `max_tokens: 0` on `notification-dispatcher` + `daily-recap` boot. | ~30 min | Eliminates first-call cache-miss latency. Do after C1. |

**Recommended pick for next session: E6** if you want product depth, or
**Phase 2** if you want to retire the breaking-change debt. C2 is also a
clean win independent of credentials.

### B) Items blocked on the owner pasting a credential

See [`USER_TODO.md`](./USER_TODO.md) and the per-action briefs at
[`../todo/NN-*.md`](../todo/). Owner pings me with `done with NN` when each
is set. **Important:** the current `.env` has the key *names* present but
all secret *values* empty. Just pasting the value after the `=` (no quote
change required) is enough — then `pnpm web:deploy` and the corresponding
worker restart.

Quick-win order:

1. `01-anthropic-key.md` — unlocks AI explanations + the caching gate
2. `02-resend-email.md` — unlocks signup verification + signal emails
3. `03-vapid-push.md` — generate yourself, no signup needed (free)
4. `04-stripe-billing.md` — flip the SaaS into a revenue product

---

## 4. How to resume in a fresh session

A new Claude session should:

1. Read `MEMORY.md` (auto-loaded).
2. Open **this file** (`docs/NEXT_SESSION.md`) for the entry point.
3. Open [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) §10–11 for the gaps + improvement vectors.
4. Open [`docs/OPERATIONS.md`](./OPERATIONS.md) §1 (Quick state check) to confirm the live service is still healthy.
5. Wait for the operator to say **`work EN`** (engineering item) or **`done with NN`** (credential provided).

If the operator just says "continue," start with **C2** unless they
indicate otherwise.

---

## 5. Things explicitly **not** carried forward

These have been examined and intentionally deferred:

- `gh-pages` and `claude/create-new-repository-wVr5l` remote-only branches — cruft from earlier scaffolding, no plan to use them. Leave alone unless space matters.
- Worker `console.log` calls — these ARE the operational logs; systemd captures them as journal output. Not dead code.
- `next lint` script in `apps/web/package.json` — removed in `63f4e27`; replaced by E8 above when we want lint back.

---

## 6. Memory checkpoint pairing

This document pairs with `~/.claude/projects/-root/memory/checkpoint_session23.md`. Either should be enough to resume; both is best.
