# 09 — Susy X Campaign Content

**Unlocks:** Susy X starts posting OrderFlow-promoting content on its scheduled channels, driving traffic to `https://orderflow-beast.com/try?utm_source=...`.
**Currently:** The `/try` route works, but nothing pushes users to it.

**Time:** 5 min (copy-paste).

## Steps

1. Open https://susy-x.com/admin (your admin account).

2. **Brand profile:**
   - Susy X admin → Brand Profile (or equivalent).
   - Open `/root/projects/orderflow/growth/01_brand_profile.md` on the server (or via your editor).
   - Copy the entire contents.
   - Paste into the Brand Profile field. Save.

3. **Campaign briefings:**
   - Susy X admin → Campaign Briefings.
   - Open `/root/projects/orderflow/growth/02_campaign_briefings.md`.
   - Copy contents.
   - Paste. Save.

4. **(Optional) Flip campaigns to LIVE:**
   - By default Susy X runs new campaigns as **drafts** so you can review the auto-generated posts first.
   - When you're happy with the drafts: campaign → toggle LIVE.

## How to verify

Within 24 hours of going LIVE you should see:
- Posts appear on Susy X's configured social channels mentioning OrderFlow.
- Hits on `https://orderflow-beast.com/try?utm_source=…` in nginx logs:
  ```bash
  tail -f /var/log/nginx/access.log | grep '/try?'
  ```

## Tell Claude when done

> done with 09

I'll check Susy X logs to confirm Susy X picked up the briefing, and watch nginx for the first organic `/try` hit.
