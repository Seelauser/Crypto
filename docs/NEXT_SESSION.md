# Next Session — Start From Here

**Last updated:** 2026-06-05 (session 29) · **Version:** `v0.1.0`

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
| **Live AI** | Phase -1 caching gate **PASSED** (Haiku 4.5 / Sonnet 4.6 / Opus 4.7 — 100% cache hit on repeat calls). C4 (per-feature cache block) + C5 (boot-time pre-warm) live. |
| Live WebSocket | `WS: live` app-wide |
| systemd units active | **17 services + 1 timer** |
| Git | `main` @ `abd5348`, pushed to `origin/main` |
| Typecheck | `pnpm typecheck` — green (7/7) |
| Lint | `pnpm lint` — 0 errors, 80 warnings (ESLint v9 flat config) |
| Logging | Structured pino NDJSON with correlation IDs (`cid` field) across workers + api + ws-gateway |
| Real data | Crypto (BTC/ETH/SOL via Binance + Coinbase + Kraken + Bybit + OKX) + derivatives (Binance funding/OI) + footprint |
| Synthetic data | Stocks, futures, forex, commodities, resources — bars API GBM fallback |
| Notifications | Wired but silent (no Resend/VAPID/Telegram keys) |
| Billing | Wired but not flipped on (no Stripe keys) |

---

## 2. Recent shipped work (last session)

Session 29 — **v0.1.0** chart-first UX pass (UI/UX review, on branch
`claude/confident-lumiere-f967b9`, tagged `v0.1.0`). See [`CHANGELOG.md`](../CHANGELOG.md):

- **Fixed the CVD line "flashing" long/short** — root cause was `cvdLineColor`
  in `CvdChart` comparing last-vs-previous bar, which flips the whole line on
  every live tick. Now colours by sign of net CVD over the window (stable).
- Authenticated landing now `/markets/crypto` (chart first), not `/dashboard`.
- Added market-bias badge, colour legend, tier-aware default layers, and a
  collapsible symbol sidebar on the markets page.
- Fixed legend-popover anchoring (toolbar needed `position: relative`).

Session 28 — owner-homework-prep autonomous pass:

| Commit | What |
|---|---|
| `abd5348` | feat(mobile): /signals /scans /settings /billing per-page mobile pass (P6-3) |
| `6c6b28b` | chore(lint): ESLint v9 flat config migration (P6-4) |
| `e410831` | feat(logging): pino + correlation IDs across workers + api + ws-gateway (P6-1) |

Previous chain (session 26): `dfd27f4` docs · `7ce68b4` C4/C5 cache · `6ed1df4`
P5-10 triggers · `15663e7` chart UI completion.

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

This document pairs with
`~/.claude/projects/-root/memory/checkpoint_session28.md`. Either should be
enough to resume; both is best.
