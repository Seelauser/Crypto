# 10 — Decisions (Pricing + Mode Flags)

These are calls only you can make. No keys, no APIs — just commit to values and tell Claude what you picked.

## A. Pricing

Current `.env.example` placeholders. Decide actual numbers:

| Item | Default | Your number |
|---|---|---|
| Pro monthly | $29/mo | ___ |
| AI metered (per call) | $0.005 | ___ |
| Top-up amounts | $10 / $25 / $50 / $100 | ___ / ___ / ___ / ___ |

Once you decide, configure them as Stripe Products (see `todo/04-stripe-billing.md`).

## B. Signup mode

- [ ] **Open signup** (current state) — anyone can register at `/register`. Maximises growth-funnel, but free-tier costs scale with signups.
- [ ] **Invite-only** — registration disabled, you hand out single-use signup codes. Better cost control + perceived exclusivity. Adds ~1 hr of code to ship.

Tell Claude: `decision: open signup` or `decision: invite-only`.

## C. Which asset class to ship FIRST

Crypto is live. Pick the next one:

- [ ] **Stocks** (Alpaca, free) → `todo/05`
- [ ] **Forex** (OANDA, free) → `todo/06`
- [ ] **Futures + Commodities** (Polygon/Databento, paid $$) → `todo/07`
- [ ] **All three at once** — I'll ship them in parallel

Tell Claude your pick — I'll write the worker.

## D. Susy X LIVE flip

After `todo/09` is done, the campaigns are still in draft mode by default.

- [ ] Review the auto-generated draft posts in Susy X admin first
- [ ] Then flip to LIVE when you're happy

## E. Daily cost ceiling

For paid feeds (07) + Anthropic spend, set a daily cap so you can sleep:

| Service | Suggested cap | Your cap |
|---|---|---|
| Anthropic | $5/day | $___/day |
| Polygon/Databento (if paid) | $7/day | $___/day |

I'll wire the kill-switches once you tell me the numbers.

## Tell Claude when done

> decisions: pro=29, ai=0.005, topups=10/25/50/100, open-signup, ship-stocks-first, susy-x-stay-draft, anthropic-cap=5

Paste your version. I'll set everything up.
