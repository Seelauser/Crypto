# Next Session — Start From Here

**Last updated:** 2026-06-03 (session 24, C2 done) · **Latest commit on branch:** `8009f04`

This is the single document a future session should read first. It captures
**where we are**, **what's verified working**, and **what to pick up next**
without scrolling through prior checkpoints.

---

## 1. Current state of the live service

| | |
|---|---|
| URL | https://orderflow-beast.com |
| Last health check | 2026-06-03 (session 24) — HTTP 200, public + local |
| **Live build** | **C2 + C3 + Phase 2 deployed** (session 24). 3-tier `free\|starter\|pro` live; `/admin` cost-center KPI live (`ADMIN_USERNAMES=seelauser`). |
| systemd units active | **13 services + 1 timer** |
| Git | `main` @ `1e54c9e`, pushed to `origin/main` |
| Typecheck | `pnpm typecheck` — green (7/7) |
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
| **P2 activation** | Enable Starter purchase: create the $19 Stripe product → set `STRIPE_PRICE_STARTER`, add a 3-plan `/plan` UI. Backend already accepts `{tier}` in `/api/billing/checkout`. | ~2 h | Owner provides Stripe price ID; UI is additive/non-breaking |
| **P2-2 / P2-4** | Chart-tier middleware + WS gateway tier enforcement | ~3 h | **Deferred into the chart-engine phase** — the premium channels they gate (footprint/derivatives) and the WS auth token don't exist until Phase 4/5 |
| **E7** | Per-page mobile audit | ~4 h | ARCHITECTURE.md §11 Tier 4 #12 |
| **E8** | ESLint flat-config migration | ~1 h | ARCHITECTURE.md §11 Tier 5 #18 |

#### Done since previous picklist (move from A to ✓)

- ✅ **E1** Scan-worker deployed (session 22, `5ac6361`)
- ✅ **E2** Rate-limit Map → Redis (this session, `ffd198c`)
- ✅ **E3** `/api/auth/resend` + UI (this session, `74f439f`)
- ✅ **E4** CAGGs on ohlcv_bars (session 22, `5b45890`)
- ✅ **E5** OB retention policy (session 22, `5ac6361`)
- ✅ **P1-3..1-6** 4 additive hypertables (this session, `f7a87c0`)
- ✅ **E6** Persisted CVD baselines (session 23, `2808d64` — Redis hash `streaming:cvd_snapshot`, 60s cadence, 24h staleness guard)
- ✅ **C2** All 3 LLM callers routed through shared `callLlm()` (session 24, `8009f04` — new `@orderflow/llm` package; dispatcher + daily-recap + explain route now share one billing/audit path; −513 lines of duplicated logic)
- ✅ **C3** `/admin` LLM cost-center KPI (session 24, `d5bcfee` — spend + cache-hit + savings, `ADMIN_USERNAMES` allowlist)
- ✅ **P1-7 + Phase 2 backend** 3-tier system `free\|starter\|pro` (session 24 — **breaking, behavior-preserving**: existing `premium` users migrate → `pro`, keep all features). UserTier enum + `tier_migration.sql`, `limits.ts` rewrite (`TIER_RANK`/`tierAtLeast`/`normalizeTier` + starter column), all `premium`→`pro` gates, tier-aware Stripe checkout/webhook (`{tier}` metadata, $10 credit Pro-only), Telegram/webhook/CSV/deep-analysis pinned Pro, Starter gets unlimited setups + 10 scans/day + cross-market + 30d history + Haiku AI. **Not yet deployed** — see deploy steps below. P2-2/P2-4 deferred to chart phase.

#### Prompt caching (group) — gate authored, awaits a real key

The caching path is wired (system prompt expanded to ~3,154 tokens, cache
markers attached). The verify gate `pnpm verify:cache` runs from root now
that root has `@anthropic-ai/sdk` + `tsx`. **Blocked: real key.** The
value in `.env` for `ANTHROPIC_API_KEY` is the empty string — present in
key form so dotenv parses it, but rejected by Anthropic as `401 invalid
x-api-key`.

| # | Item | Effort | Why |
|---|---|---|---|
| ~~**C2**~~ | ✅ Done (session 24, `8009f04`). All 3 callers route through `callLlm()` in the new `@orderflow/llm` package — shared ledger debit, audit row, tier gating + free/exhausted-balance fallback, ephemeral caching. | — | — |
| ~~**C3**~~ | ✅ Done (session 24, `d5bcfee`). `/admin` LLM cost-center: spend + cache-hit rate + savings from `llm_calls`, 24h/7d/30d, by model/feature. Gated by `ADMIN_USERNAMES` allowlist (fail-closed). | — | — |
| **C4** | Sonnet-tier features: per-feature prompt in a second cached system block. | ~1 h | Sonnet's 2048-token bar is easier to clear feature-by-feature. |
| **C5** | Pre-warm with `max_tokens: 0` on `notification-dispatcher` + `daily-recap` boot. | ~30 min | Eliminates first-call cache-miss latency. |

**Recommended pick for next session: C3** (cache-hit KPI — now unblocked by
C2's unified logging) for observability, **E7** for product depth, or
**Phase 2** to retire the breaking-change debt.

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

If the operator just says "continue," start with **C3** unless they
indicate otherwise.

---

## 5. Things explicitly **not** carried forward

These have been examined and intentionally deferred:

- **Unused `premium` enum value** — the session-24 Phase 2 deploy added `starter`/`pro` and migrated data `premium→pro`, but left `premium` in the Postgres `UserTier` enum (dropping an enum value requires a risky type-recreate). It is unreferenced and harmless; drop it in a maintenance window via `prisma db push` once convenient. Schema/code already use only `free|starter|pro`.
- **`rescue/llm-extraction-wip` branch** (`584bc20`) — a parallel, fuller `@orderflow/llm` extraction found uncommitted in the main worktree (moves `batch.ts`+`ledger.ts` into the package, deletes the `apps/api/src/llm` copies, expands `system.ts` for prompt caching). Rescued to a branch, NOT merged. Reconcile its prompt-cache + fuller-extraction improvements onto the deployed C2 when picking up the caching work.
- **Starter not yet purchasable** — backend accepts `{tier:'starter'}` in `/api/billing/checkout`, but no `STRIPE_PRICE_STARTER` is set and there's no 3-plan `/plan` UI yet. Pro checkout still defaults correctly. See "P2 activation" in the picklist.
- `gh-pages` and `claude/create-new-repository-wVr5l` remote-only branches — cruft from earlier scaffolding, no plan to use them. Leave alone unless space matters.
- Worker `console.log` calls — these ARE the operational logs; systemd captures them as journal output. Not dead code.
- `next lint` script in `apps/web/package.json` — removed in `63f4e27`; replaced by E8 above when we want lint back.

---

## 6. Memory checkpoint pairing

This document pairs with `~/.claude/projects/-root/memory/checkpoint_session23.md`. Either should be enough to resume; both is best.
