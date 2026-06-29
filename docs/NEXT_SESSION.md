# Next Session — Start From Here

**Last updated:** 2026-06-27 (session 33) · **Version:** `v0.2.0`+ analyst-audit fixes + LLM hardening + infra security pass

This is the single document a future session should read first. It captures
**where we are**, **what's verified working**, and **what to pick up next**
without scrolling through prior checkpoints.

---

## 1. Current state of the live service

| | |
|---|---|
| URL | https://orderflow-beast.com |
| Last health check | 2026-06-05 — HTTP 200 in ~512ms |
| **Live build** | All credential-free items from the Master spec picklist are now shipped. Phase 5 chart UI complete; Phase 6 P6-1 + P6-3 + P6-4 done. |
| **Live AI** | Cache diagnostics beta live. Model IDs corrected (haiku-4-5-20251001, opus-4-8). 100% cache hit on repeat calls. Billing accuracy fixed (correlation route was logging 0 tokens). |
| Live WebSocket | `WS: live` app-wide |
| systemd units active | **17 services + 1 timer** |
| Git | `main` @ `f6bb42e`; PR `fix/path-corrections-security-hardening` (`e96578a`) open — merge when ready |
| Typecheck | `pnpm typecheck` — green (7/7) |
| Lint | `pnpm lint` — 0 errors, 80 warnings (ESLint v9 flat config) |
| Logging | Structured pino NDJSON with correlation IDs (`cid` field) across workers + api + ws-gateway |
| Real data | Crypto (BTC/ETH/SOL via Binance + Coinbase + Kraken + Bybit + OKX) + derivatives (Binance funding/OI) + footprint |
| Synthetic data | Stocks, futures, forex, commodities, resources — bars API GBM fallback |
| Notifications | Wired but silent (no Resend/VAPID/Telegram keys) |
| Billing | Wired but not flipped on (no Stripe keys) |
| Redis | **Password-protected since 2026-06-23.** All `redis-cli` commands need `-a $REDIS_PASS` (see OPERATIONS.md). |
| API / WS binding | Both now bind to `127.0.0.1` (via `API_HOST`/`WS_HOST` env vars) instead of `0.0.0.0`. |
| Memory | `~/.claude/projects/-srv-projects-orderflow/memory/` initialised — 4 files (user profile, project state, working style, arch gotchas). |

---

## 2. Recent shipped work (last sessions)

Session 33 (2026-06-27) — **memory bootstrap + infra security + docs cleanup**

| Action | What |
|---|---|
| Memory initialised | `~/.claude/projects/-srv-projects-orderflow/memory/` — 4 files (user profile, project state, working style, arch gotchas) |
| `e96578a` (PR open) | Path corrections (`/root/` → `/srv/`) across all docs + todo files; API/WS bind to `127.0.0.1` via env vars; Redis auth documented in OPERATIONS.md; service count 12→16; growth brand assets added |

Session 32 (2026-06-19) — **LLM hardening**

| Commit | What |
|---|---|
| `f6bb42e` | Cache diagnostics beta header, corrected model IDs (`haiku-4-5-20251001`, `opus-4-8`), billing accuracy fix (correlation route was logging 0 tokens), `cacheMissReason` field |
| `11f09a0` | Quota rollback, circuit breaker, explanation dedup cache |

Session 31 (2026-06-07) — **analyst-audit gap fixes (9 of 14)**

| Commit | What |
|---|---|
| `80de4da` | TapePanel type fix (`tick`→`market_ticks`), OB heatmap type fix, sweep history ring-buffer surfaced in PlacementPanel, imbalance sparkline + spike log, OI exposure, regime polling, scoring formula tooltip, footprint CVD row |

Session 30 (2026-06-06) — **order-flow chart UI redesign (Phases 1-4) + QA pass**

| Commit | What |
|---|---|
| `457ecb4` | Phase 1 — `PlacementPanel`: confidence gauge + evidence-split bar replacing binary LONG/SHORT badge |
| `c410078` | Phase 2 — `FlowStatsStrip`: bar-by-bar Volume/Delta/RelStrength/CVD strip (starter+) |
| `f2e3990` | Phase 3 — `FootprintChart` visual overhaul: absorption glow / sweep flash, continuous `imbalanceFill` ramp |
| `653690b` | Phase 4 — cross-pane price-level highlighting: footprint/DOM hover → order-book heatmap dashed line |
| `312f44e` | QA pass: 4 confirmed bugs fixed |

**Known dormant feature:** `market:absorption_detected` has no Python publisher yet — `lastSweep.absorbed` always `false`. Degrades gracefully (raw sweep flash still renders). Will activate when absorption-detection lands.

---

## 3. What's left

### A) All credential-free Master-spec items are SHIPPED ✓

Phases -1 / 0 / 1 / 2 / 3 / 4 / 5 / 6 — every item that can be done without
an external API key is now live. The remaining backlog is strictly
owner-credential gated.

### B) Owner-credential picklist (in order of impact)

See [`USER_TODO.md`](./USER_TODO.md) for full details on each:

1. **Stripe** (`STRIPE_SECRET_KEY` + `STRIPE_PRICE_*` + `STRIPE_WEBHOOK_SECRET`)
   — flips the SaaS into a revenue product. 3-tier backend is ready, the
   `/billing/upgrade` page renders, only the keys + Stripe products are missing.
2. **Resend** (`RESEND_API_KEY` + `EMAIL_FROM`) + DNS — signup verification
   + signal emails. Without it, registration auto-activates and email
   channel is a no-op.
3. **VAPID** (`VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`) — browser push.
   Self-generate with `pnpm --dir apps/web exec web-push generate-vapid-keys`.
4. **Telegram** (`TELEGRAM_BOT_TOKEN`) — Pro-tier notification channel.
5. **Alpaca** (`ALPACA_KEY_ID` + `ALPACA_SECRET`) — US stocks (free tier).
   Once set, I'll write the ingest worker.
6. **OANDA** (`OANDA_ACCOUNT_ID` + `OANDA_API_KEY`) — forex (free tier).
7. **Polygon** + **Databento** — futures + commodities (paid).
8. **Glassnode** — on-chain layer for the chart engine (paid).

### C) Things deliberately deferred (no action needed)

- **`OrderFlowChart` unified panes** (P5-6 from spec) — the current
  CvdChart already renders price + delta + CVD + markers in one component.
  Splitting it adds complexity without changing what the user sees. Revisit
  if footprint/depth/profile grow into full-blown visualizations.
- **Phase 2 WS-tier enforcement** (P2-4) — gateway fans out everything;
  premium channels are already gated at the route layer. Wire WS auth +
  per-channel checks when truly-premium WS streams ship.
- **`rescue/llm-extraction-wip` branch (584bc20)** — reviewed, superseded
  by C2/C4/C5/P6-1. The only remaining unique change (moving batch.ts +
  ledger.ts into packages/llm) is pure organization with no functional
  benefit and 96-file diff. Left in remote for future reference.
- **Unused `premium` enum** in Postgres `UserTier` — dropping requires a
  risky type recreate. Cosmetic; safe to leave indefinitely.
- **Node 18 vs `engines >=20`** — server-wide upgrade; deferred until other
  projects on the box (Goaty, Solbatcher, CloddsBot) are ready too.
- **80 ESLint warnings** — baseline at lint-config-flip time. Each is a
  small cleanup; suitable for an opportunistic future pass.

---

## 4. How to resume in a fresh session

A new Claude session should:

1. Read `MEMORY.md` (auto-loaded).
2. Open **this file** for the entry point.
3. Open [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) for end-to-end flow.
4. Open [`docs/OPERATIONS.md`](./OPERATIONS.md) §1 (Quick state check).

If the operator just says "continue" without giving credentials, there
is essentially nothing left of the master spec to ship without their input.
Sensible alternatives:
- Pick from the 80 lint warnings as a low-risk cleanup pass.
- Work on the `OrderFlowChart` unified panes refactor anyway (optional).
- Investigate any operational issue raised since this checkpoint.

If the operator pastes a credential, follow the `done with NN` flow — each
section in `USER_TODO.md` lists the exact `systemctl restart …` to run.

---

## 5. Memory checkpoint pairing

This document pairs with `~/.claude/projects/-srv-projects-orderflow/memory/`
(initialised session 33 — 4 files). Either is enough to resume; both is best.

**To authenticate `gh` for future PR creation:**
```bash
gh auth login
```
