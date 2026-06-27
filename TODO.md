# Your TODO List — OrderFlow

Each item below is a separate file in `todo/` — open the file, follow the steps, paste the values into `/srv/projects/orderflow/.env`, then ping Claude with which file(s) are done so I can run the follow-up tests.

## Critical (unlock real users)
- [ ] [01-anthropic-key.md](todo/01-anthropic-key.md) — Real AI explanations on every triggered signal
- [ ] [02-resend-email.md](todo/02-resend-email.md) — Email verification + signal alerts
- [ ] [03-vapid-push.md](todo/03-vapid-push.md) — Browser push notifications (free, you generate locally)

## Revenue
- [ ] [04-stripe-billing.md](todo/04-stripe-billing.md) — Pro subscriptions + top-ups

## Expand market coverage
- [ ] [05-alpaca-stocks.md](todo/05-alpaca-stocks.md) — US stocks (free Alpaca tier)
- [ ] [06-oanda-forex.md](todo/06-oanda-forex.md) — Forex (free OANDA tier)
- [ ] [07-paid-feeds.md](todo/07-paid-feeds.md) — Futures + commodities (Polygon / Databento, paid)

## Notifications
- [ ] [08-telegram-bot.md](todo/08-telegram-bot.md) — Telegram channel for Pro users

## Growth
- [ ] [09-susy-x-campaigns.md](todo/09-susy-x-campaigns.md) — Push the paste-and-go content into Susy X admin

## Decisions
- [ ] [10-pricing-and-flags.md](todo/10-pricing-and-flags.md) — Pricing tiers, signup mode, Susy X LIVE flip

---

## How to use this list

1. Open one file at a time.
2. Each file has: **what**, **why it matters**, **where to get it**, **what to paste**, **how to verify**.
3. Edit `/srv/projects/orderflow/.env` (the live one on the server) — never commit secrets.
4. Restart the systemd unit named in the file (e.g. `systemctl restart orderflow-web`).
5. Tick the box above and tell me "done with 01" — I'll run the smoke test for that capability.

## Audit which keys are still blank

```bash
grep -E '^[A-Z_]+=' /srv/projects/orderflow/.env | awk -F= '$2=="" || $2=="\"\"" {print $1}'
```

## When you're done

Tell me which items are complete. For each one I will:
- Verify the credential reaches the service it unlocks
- Run an end-to-end test for the feature
- Update memory + a checkpoint reflecting what's now live
