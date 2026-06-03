# Next Session — Start From Here

**Last updated:** 2026-06-03 · **Latest commit on `origin/main`:** `b134211`
(plus the small doc-cross-link commit that follows this file).

This is the single document a future session should read first. It captures
**where we are**, **what's verified working**, and **what to pick up next**
without scrolling through prior checkpoints.

---

## 1. Current state of the live service

| | |
|---|---|
| URL | https://orderflow-beast.com |
| Last health check | 2026-06-03 — HTTP 200 in 135ms |
| systemd units active | **12/12 services + 1 timer** (see [OPERATIONS.md](./OPERATIONS.md) §2) |
| Git | `main` clean, in sync with `origin/main` |
| Typecheck | `pnpm typecheck` — **6/6 green** in 16s |
| Lint | `pnpm lint` — no-op exit 0 (next-lint deprecated, dropped) |
| Real data | Crypto only (BTC/ETH/SOL via Binance + Coinbase + Kraken) |
| Synthetic data | Stocks, futures, forex, commodities, resources — bars API GBM fallback |
| Notifications | Wired but silent (no Resend/VAPID/Telegram keys) |
| Billing | Wired but not flipped on (no Stripe keys) |
| AI | Anthropic key present; routing Haiku/Sonnet/Opus by feature |

---

## 2. Recent shipped work (last 3 sessions)

| Commit | What |
|---|---|
| `b134211` | docs: ARCHITECTURE.md — as-built map, gaps, ranked improvement vectors (381 lines) |
| `63f4e27` | chore: per-package tsconfigs, drop dead next-lint script (3/7 → 6/6 typecheck) |
| `14c7ad4` | docs: per-action TODO files for owner-blocked items |
| `03cdd1a` | docs: refresh CLAUDE.md + add OPERATIONS.md + USER_TODO.md |
| `90a1870` | feat(mobile): wire shared design system + mobile-first dashboard |
| `5f70364` | feat(infra): web:build helper script for standalone deploys |
| `43eea96` | feat(analytics): regime publisher + honest dashboard regime tiles |
| `3b2f2c5` | fix: graceful degradation when ANTHROPIC_API_KEY or RESEND_API_KEY missing |

---

## 3. What to pick up next — by who is blocked

### A) Items Claude can do without credentials (recommended next session)

These are ordered by impact-per-hour. Pick one and tell me **`work E1`** etc.

| # | Item | Effort | Source of truth |
|---|---|---|---|
| **E1** | **Deploy `orderflow-scan-worker.service`** — worker code exists at `apps/orderflow-workers/src/ingest/scan_worker.py`; no systemd unit; jobs queue forever today | ~30 min | ARCHITECTURE.md §5 |
| **E2** | Move registration rate limit from in-memory Map → Redis | ~30 min | ARCHITECTURE.md §10 #6 |
| **E3** | `/api/auth/resend` route + UI button | ~1 h | ARCHITECTURE.md §10 #7 |
| **E4** | TimescaleDB continuous aggregates on `ohlcv_bars` | ~3 h | ARCHITECTURE.md §11 Tier 2 #5 |
| **E5** | Retention policy on `order_book_snapshots` | ~10 min | ARCHITECTURE.md §11 Tier 2 #6 |
| **E6** | Persist streaming CVD baselines | ~2 h | ARCHITECTURE.md §11 Tier 2 #7 |
| **E7** | Per-page mobile audit | ~4 h | ARCHITECTURE.md §11 Tier 4 #12 |
| **E8** | ESLint flat-config migration | ~1 h | ARCHITECTURE.md §11 Tier 5 #18 |

#### Prompt caching (group) — silent no-op today, ~⅔–¾ input-cost cut once fixed

The `cache_control: { type: 'ephemeral' }` markers are wired correctly but the
system prompt is ~350 tokens — **below Anthropic's minimum cacheable prefix**
(2048 for Sonnet 4.6; 4096 for Haiku 4.5 + Opus 4.7). Every call silently writes
`cache_creation_input_tokens: 0` and never caches. No alert on this today.

| # | Item | Effort | Why |
|---|---|---|---|
| **C1** | Pad `packages/llm-prompts/src/system.ts` past **4096 tokens** with stable reference material (concept glossary, formatting rules, calibration examples, asset-class taxonomy, [True L2] vs [Inferred] definitions, refusal rubric). Content must be static — no dates, IDs, or per-user state. | ~1 h | The single biggest cost win. Every call gets ~90% off the system prefix after first write. |
| **C2** | Route the 3 bypassed callers through `callLlm()` — `apps/workers/notification-dispatcher.ts:153`, `apps/workers/daily-recap.ts:185`, `apps/web/src/app/api/signals/[id]/explain/route.ts:179`. Today they call `anthropic.messages.create` directly and lose: token-ledger debit, `llm_calls` audit row, free-tier Haiku fallback, premium-balance-exhausted fallback. | ~1 h | Restores billing + audit integrity. Independent of caching but in the same file set. |
| **C3** | Cost-center / `/admin` KPI for cache-hit rate from `llm_calls.cache_read_input_tokens`. Surface `cached / (cached + input)` as a daily and per-feature percentage. | ~1 h | Without this, the regression is invisible — caching could break again silently. |
| **C4** | For Sonnet-tier features only: move per-feature prompt into the system block as a second block, place `cache_control` on it. Sonnet's 2048-token bar is easier to clear feature-by-feature. | ~1 h | Sonnet routes (`signal_explanation`, `scan_narrative`, `tape_narrator`, `regime_narration`, `correlation_alert`) cache without padding the global prompt. |
| **C5** | Pre-warm with `max_tokens: 0` on `notification-dispatcher` + `daily-recap` boot. | ~30 min | Eliminates first-call cache-miss latency for the long-lived workers. Only worth doing after C1 lands. |

**Recommended order:** C1 (unlocks caching) → C2 (independent hygiene) → C3 (visibility) → C4 / C5 (incremental).

**Recommended pick for the next session: E1.** It is the cheapest in time
and the highest in product impact — it takes "Scans," currently advertised
in the UI but silently broken, and makes it work. If you'd rather attack
cost first, **start with C1** — same effort, immediate per-call cost cut.

### B) Items blocked on the owner pasting a credential

See [`USER_TODO.md`](./USER_TODO.md) for the full list, and the 10 per-
action briefs at [`../todo/NN-*.md`](../todo/). Owner pings me with
`done with NN` when each is set.

Quick-win order if you're going to provide keys:

1. `02-resend-email.md` — without it, signups can't verify and signal emails are silent
2. `01-anthropic-key.md` — AI explanations on triggered signals
3. `03-vapid-push.md` — generated yourself, no signup needed (free)
4. `04-stripe-billing.md` — flip the SaaS into a revenue product

---

## 4. How to resume in a fresh session

A new Claude session should:

1. Read `MEMORY.md` (auto-loaded).
2. Open **this file** (`docs/NEXT_SESSION.md`) for the entry point.
3. Open [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) §10–11 for the gaps + improvement vectors.
4. Open [`docs/OPERATIONS.md`](./OPERATIONS.md) §1 (Quick state check) to confirm the live service is still healthy.
5. Wait for the operator to say **`work EN`** (engineering item) or **`done with NN`** (credential provided).

If the operator just says "continue," start with **E1** unless they
indicate otherwise.

---

## 5. Things explicitly **not** carried forward

These have been examined and intentionally deferred:

- `gh-pages` and `claude/create-new-repository-wVr5l` remote-only branches — cruft from earlier scaffolding, no plan to use them. Leave alone unless space matters.
- Worker `console.log` calls — these ARE the operational logs; systemd captures them as journal output. Not dead code.
- `next lint` script in `apps/web/package.json` — removed in `63f4e27`; replaced by E8 above when we want lint back.

---

## 6. Memory checkpoint pairing

This document pairs with `~/.claude/projects/-root/memory/checkpoint_session21.md`. Either should be enough to resume; both is best.
