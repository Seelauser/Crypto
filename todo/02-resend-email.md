# 02 — Resend (Email)

**Unlocks:** Real email verification on signup + signal-event email notifications.
**Without it:** Accounts auto-activate (graceful-degradation path). Email channel silently no-ops.

**Time:** 15 min (most of it is DNS propagation wait).

## Steps

1. **Create the API key.**
   - Open https://resend.com/api-keys → "Create API Key".
   - Name `orderflow-prod`. Scope: Full access. Copy the value (`re_…`).

2. **Add the sending domain.**
   - Resend → Domains → Add → `orderflow-beast.com`.
   - Resend shows you 3 DNS records (SPF TXT, DKIM CNAMEs, DMARC TXT).

3. **Publish the DNS records.**
   - You manage DNS via Hostinger. The MCP supports this — just tell Claude:
     > add Resend DNS records for orderflow-beast.com: <paste the 3 records>
   - Or do it by hand at https://hpanel.hostinger.com → Domains → DNS / Nameservers.

4. **Wait for verification.** Click "Verify DNS" on Resend after ~5–10 minutes.

5. **On the server:**
   ```bash
   nano /srv/projects/orderflow/.env
   ```
   Set:
   ```
   RESEND_API_KEY=re_…
   EMAIL_FROM="OrderFlow <notify@orderflow-beast.com>"
   ```

6. **Restart:**
   ```bash
   systemctl restart orderflow-web orderflow-notification-dispatcher
   ```

## Cost

Free tier: 3,000 emails/month + 100/day. Plenty until you have hundreds of active users.

## How to verify

```bash
journalctl -u orderflow-web -n 20 --no-pager | grep -i email
```
Then register a new test account at https://orderflow-beast.com/register — you should receive a verification email within seconds.

## Tell Claude when done

> done with 02

I'll register a test user end-to-end and confirm the email lands in inbox (not spam).
