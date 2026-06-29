# 08 — Telegram Bot

**Unlocks:** Telegram notification channel (Pro-tier only). Users can route signal events to a Telegram chat.
**Currently:** /settings → Telegram option does nothing.

**Time:** 5 min.

## Steps

1. Open Telegram → search **`@BotFather`** → DM it.
2. Send `/newbot`.
3. Pick a display name: e.g. **OrderFlow Beast**.
4. Pick a username ending in `bot`: e.g. **`OrderFlowBeastBot`**. Must be unique.
5. BotFather replies with a token: `123456789:ABC-DEF1234ghIkl-…`. Copy it.

6. Generate a webhook secret (any random hex):
   ```bash
   openssl rand -hex 32
   ```

7. Paste into `.env`:
   ```bash
   nano /srv/projects/orderflow/.env
   ```
   ```
   TELEGRAM_BOT_TOKEN=123456789:ABC-…
   TELEGRAM_BOT_USERNAME=OrderFlowBeastBot
   TELEGRAM_WEBHOOK_SECRET=<the openssl output>
   ```

8. Register the webhook (one-time):
   ```bash
   TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' /srv/projects/orderflow/.env | cut -d= -f2)
   SECRET=$(grep '^TELEGRAM_WEBHOOK_SECRET=' /srv/projects/orderflow/.env | cut -d= -f2)
   curl -X POST "https://api.telegram.org/bot$TOKEN/setWebhook" \
        -d "url=https://orderflow-beast.com/api/telegram/webhook" \
        -d "secret_token=$SECRET"
   ```

9. Restart:
   ```bash
   systemctl restart orderflow-web orderflow-notification-dispatcher
   ```

## How to verify

DM your new bot `/start` in Telegram — you should get a reply asking you to link your OrderFlow account.

## Tell Claude when done

> done with 08

I'll DM the bot end-to-end, link a test account, fire a fake signal, and confirm it lands in Telegram.
