# 04 — Stripe (Billing)

**Unlocks:** Pro subscription, AI metering, one-time top-ups. Without it /billing/upgrade 500s on checkout.

**Time:** 25 min.

## Steps

### A. API keys
1. Open https://dashboard.stripe.com/apikeys
2. Reveal "Secret key" → copy `sk_live_…` (or `sk_test_…` for sandbox).

### B. Create 6 prices
Open https://dashboard.stripe.com/products → "Add product" — one product per row below. For each, copy the resulting `price_…` ID.

| Product name | Type | Suggested amount | Env var |
|---|---|---|---|
| OrderFlow Pro — Monthly | Recurring monthly | $29/mo (your call) | `STRIPE_PRICE_PRO_MONTHLY` |
| AI Usage (metered) | Recurring metered | $0.005 per call (your call) | `STRIPE_PRICE_AI_METER` |
| AI Credit — $10 | One-time | $10 | `STRIPE_PRICE_TOPUP_10` |
| AI Credit — $25 | One-time | $25 | `STRIPE_PRICE_TOPUP_25` |
| AI Credit — $50 | One-time | $50 | `STRIPE_PRICE_TOPUP_50` |
| AI Credit — $100 | One-time | $100 | `STRIPE_PRICE_TOPUP_100` |

### C. Webhook endpoint
1. https://dashboard.stripe.com/webhooks → "Add endpoint"
2. URL: `https://orderflow-beast.com/api/billing/webhook`
3. Events to subscribe:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the "Signing secret" (`whsec_…`).

### D. Paste into .env
```bash
nano /root/projects/orderflow/.env
```
```
STRIPE_SECRET_KEY=sk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_PRO_MONTHLY=price_…
STRIPE_PRICE_AI_METER=price_…
STRIPE_PRICE_TOPUP_10=price_…
STRIPE_PRICE_TOPUP_25=price_…
STRIPE_PRICE_TOPUP_50=price_…
STRIPE_PRICE_TOPUP_100=price_…
```

### E. Restart
```bash
systemctl restart orderflow-web
```

## How to verify

1. Hit https://orderflow-beast.com/billing/upgrade → click "Upgrade to Pro" → Stripe checkout page should load (use card `4242 4242 4242 4242` if in test mode).
2. After paying: `journalctl -u orderflow-web -n 30 | grep -i stripe` should show the webhook firing and `tokenLedger.balanceCents` for the user should bump to ~$10 (the Pro included credit).

## Tell Claude when done

> done with 04

I'll run a paid checkout through to a confirmed Pro upgrade + verify the token ledger.
