# Next Session — Start From Here

**Last updated:** 2026-06-05 (session 25) · **Latest commit on branch:** `7ce68b4`

This is the single document a future session should read first. It captures
**where we are**, **what's verified working**, and **what to pick up next**
without scrolling through prior checkpoints.

---

## 1. Current state of the live service

| | |
|---|---|
| URL | https://orderflow-beast.com |
| Last health check | 2026-06-05 — HTTP 200 in ~550ms |
| **Live build** | **Phase 5 chart engine essentially complete** — placement markers on the price chart, hover tooltip with `chart-explain` LLM narration (Haiku for starter, Sonnet for pro), tier-aware ChartToolbar, TierGateOverlay. `delta_exhaustion` + `sweep_with_absorption` triggers wired in both TS engine and Python evaluator. |
| **Live AI** | **Phase -1 caching gate PASSED on all 3 tiers** (Haiku 4.5 / Sonnet 4.6 / Opus 4.7 — 100% cache hit on repeat calls). C4 (per-feature second cache block) + C5 (boot-time pre-warm) shipped — dispatcher boot logs `[llm/prewarm] 2/2 cached in ~1.2s`. |
| Live WebSocket | `WS: live` app-wide |
| systemd units active | **17 services + 1 timer** |
| Git | `main` @ `7ce68b4`, pushed to `origin/main` |
| Typecheck | `pnpm typecheck` — green (7/7) |
| Real data | Crypto (BTC/ETH/SOL via Binance + Coinbase + Kraken + Bybit + OKX) + derivatives (Binance funding/OI) + footprint (per-bar bid/ask) |
| Synthetic data | Stocks, futures, forex, commodities, resources — bars API GBM fallback |
| Notifications | Wired but silent (no Resend/VAPID/Telegram keys) |
| Billing | Wired but not flipped on (no Stripe keys) |

---

## 2. Recent shipped work (last session)

Session 25 — autonomous product-owner pass:

| Commit | What |
|---|---|
| `7ce68b4` | perf(llm): C4 per-feature cache block + C5 boot-time pre-warm |
| `6ed1df4` | feat(triggers): delta_exhaustion + sweep_with_absorption (P5-10) |
| `15663e7` | feat(chart): placement markers on price chart + hover tooltip + tier-aware toolbar |

The latest three commits close the chart-engine arc from "scoring works but
only in the side panel" to "scoring drives markers on the price chart with
LLM-narrated tooltips on hover."

Older highlights (session 24): Phase 2 3-tier system live; shared
`@orderflow/llm` router (C2); `/admin` LLM cost-center KPI (C3); live
placement signal engine; footprint + derivatives publishers; Bybit + OKX
ingest; P4-1 through P4-9 chart-data routes; P6-2 health probes.

---

## 3. What's left vs the Master spec

Cross-referenced against `ORDERFLOW BEAST REWORK MASTER.md §14`.

### A) Done

- Phase -1 (caching gate — verified live 2026-06-05)
- Phase 0 (3/4 — P0-2 is credentials, owner-blocked)
- Phase 1 (all 7 — CAGGs + hypertables)
- Phase 2 (5/6 backend done; P2-4 WS-tier enforcement deferred until the
  premium WS channels exist as protected resources)
- Phase 3 (P3-2/3/4/5 + derivs publisher; P3-1/6/7/8/9 require external
  API keys)
- Phase 4 (6/9 — P4-5/6/7 await Polygon + Glassnode)
- Phase 5 (placement engine + chart markers + tooltip + toolbar +
  tier-gate overlay + delta_exhaustion + sweep_with_absorption — the
  customer-facing chart story is shipped)
- Phase 6 P6-2 (health endpoints)
- C-series: C1 + C2 + C3 + **C4** + **C5** all live

### B) Claude-shippable without credentials

These are the remaining "polish" items — none change the user-visible
contract, all are quality wins.

| # | Item | Effort | Why |
|---|---|---|---|
| **P6-1** | Centralize worker logging → pino + correlation IDs | ~3h | Today every worker uses `console.log`; harder to trace a signal across dispatcher → email → ledger. Worth doing before more workers ship. |
| **P6-3** | Per-page mobile audit (/signals, /scans, /settings, /billing) | ~4h | Only `/dashboard` + `/markets` got the mobile-first pass. |
| **P6-4** | ESLint flat-config migration | ~1h | `next lint` deprecated; CI lint coverage is currently a no-op. |
| **OrderFlowChart** | Unified panes (P5-6 from spec) — split price/volume-profile/footprint/depth into separate pane wrappers around CvdChart | ~4h | Foundational for future chart-engine work. **Optional** — current CvdChart already renders everything the customer needs. |
| **`rescue/llm-extraction-wip` reconcile** | Branch `584bc20` has a fuller `@orderflow/llm` extraction that wasn't merged | ~1h | Improvements should be cherry-picked or dropped; either way close the branch. |
| **Premium enum drop** | Remove the unused `premium` value from Postgres `UserTier` enum | ~10m | Cosmetic; needs a maintenance window since dropping enum values is non-trivial. |

### C) Credential-blocked (owner action)

See [`USER_TODO.md`](./USER_TODO.md) — Stripe + Resend + VAPID + Telegram +
Alpaca/OANDA/Polygon/Glassnode keys. Order of impact:

1. `STRIPE_*` — flip the SaaS into a revenue product (3-plan UI ready)
2. `RESEND_API_KEY` — signup verification email + signal emails
3. `VAPID_*` — browser push (free; generate locally)
4. `ALPACA_KEY_ID` + `ALPACA_SECRET` — US stocks via Alpaca (free tier)
5. `OANDA_*` — forex (free tier)
6. `POLYGON_ADVANCED_KEY` + `DATABENTO_API_KEY` — futures + commodities ($)
7. `GLASSNODE_API_KEY` — on-chain layer for the chart engine ($)
8. `TELEGRAM_BOT_TOKEN` — Pro-tier notification channel

---

## 4. How to resume in a fresh session

A new Claude session should:

1. Read `MEMORY.md` (auto-loaded).
2. Open **this file** for the entry point.
3. Open [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) for end-to-end flow.
4. Open [`docs/OPERATIONS.md`](./OPERATIONS.md) §1 (Quick state check) to
   confirm the live service is still healthy.
5. Wait for the operator to say **`work EN`** (engineering item) or
   **`done with NN`** (credential provided).

If the operator just says "continue," start with **P6-1** (pino logging) —
biggest quality lift per hour for the next round of chart work.

---

## 5. Things explicitly **not** carried forward

These were considered and intentionally deferred:

- **OrderFlowChart unified panes (P5-6 from spec)** — the master spec's
  vision of separate render panes around the price chart. CvdChart already
  renders price + delta + CVD in one chart with the markers overlay; pulling
  that apart adds complexity without changing what the user sees. Revisit
  when footprint + depth become full-blown visualizations (Pro layers).
- **Phase 2 WS-tier enforcement (P2-4)** — gateway currently fans out
  everything; the premium channels (footprint, derivatives, on-chain) are
  already gated at the route layer. Wire a WS-auth token + per-channel
  check when premium-only WS streams ship.
- **P5-10 evaluator triggers in the dispatch-side path** — the placement
  engine fires these in the chart layer (TS); the Python `evaluator.py`
  knows the trigger types so users can set them up. The trigger evaluator
  doesn't *publish* them — sweep + delta producers stay in the streaming
  worker. Right separation of concerns.
- **`premium` enum value in Postgres** — dropping requires a risky type
  recreate; deferred.
- **Engine warning (Node 18 vs `engines >=20`)** — a server-wide upgrade;
  defer until other projects are ready too.

---

## 6. Memory checkpoint pairing

This document pairs with `~/.claude/projects/-root/memory/checkpoint_session25.md`.
Either should be enough to resume; both is best.
