# 01 — Anthropic API Key

**Unlocks:** Real AI-written explanations on every triggered signal. Without this, the dispatcher uses a fixed fallback string.

**Time:** 2 min.

## Steps

1. Open https://console.anthropic.com → API Keys → "Create Key".
2. Name it **`orderflow-prod`** (so cost is attributable, separate from Susy X's key).
3. Copy the value (`sk-ant-…`).
4. On the server:
   ```bash
   nano /srv/projects/orderflow/.env
   ```
   Find `ANTHROPIC_API_KEY=` and paste the key after the `=`.

5. Restart:
   ```bash
   systemctl restart orderflow-notification-dispatcher orderflow-web orderflow-api
   ```

## Cost

Pay-per-token. With current routing (Haiku for cheap calls, Sonnet/Opus for premium features) and prompt caching, plan for roughly $0.01–$0.05 per active user per day. Free until users actually trigger signals.

## How to verify

```bash
journalctl -u orderflow-notification-dispatcher -n 30 --no-pager
```
Look for `"AI explanation generated"` instead of `"AI disabled — fallback used"`.

## Tell Claude when done

> done with 01

I'll trigger a real signal end-to-end and verify the explanation reads naturally.
