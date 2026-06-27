# 03 — VAPID Keys (Browser Push)

**Unlocks:** Web-push notification channel (works on Chrome desktop + Android, iOS Safari ≥16.4).
**Without it:** The "Browser push" option in /settings → notification channels does nothing.

**Time:** 1 min. Self-signed — no external service.

## Steps

1. On the server:
   ```bash
   cd /srv/projects/orderflow
   pnpm --dir apps/web exec web-push generate-vapid-keys
   ```
   Output looks like:
   ```
   Public Key:  BL3JN8…
   Private Key: kQzRf8…
   ```

2. Edit `.env`:
   ```bash
   nano /srv/projects/orderflow/.env
   ```
   ```
   VAPID_PUBLIC_KEY=BL3JN8…
   VAPID_PRIVATE_KEY=kQzRf8…
   VAPID_SUBJECT=mailto:ops@orderflow-beast.com
   ```
   (`VAPID_SUBJECT` must be a `mailto:` URL or `https://…` — your real contact, used by push providers to reach you if there's abuse.)

3. Restart:
   ```bash
   systemctl restart orderflow-web orderflow-notification-dispatcher
   ```

## How to verify

In a real browser:
1. Sign in at https://orderflow-beast.com/login
2. Go to /settings → Notification Channels → toggle "Browser push" on
3. Accept the prompt
4. Open `journalctl -u orderflow-web -n 20`. Look for a subscription INSERT.

## Tell Claude when done

> done with 03

I'll send a test push through the dispatcher and confirm it arrives.
