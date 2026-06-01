# 21-day launch checklist — OrderFlow Beast x Susy X

Operator-facing day-by-day. Date column is filled in once you commit to
a start date. Susy commands assume you are running both systemd
services and have `is_admin = True` on your operator user.

## Pre-flight (Day 0)

- [ ] `@OrderFlowBeast` X account created, blue verification optional
      but recommended for reach.
- [ ] X account bio set to:
      `Order-flow analytics across crypto, futures, stocks, FX. True L2
      where it exists; Inferred where it doesn't. Free tier → bio link.`
- [ ] X bio link: `orderflowbeast.com/try?utm_source=x&utm_medium=bio`
- [ ] `@orderflowbeast` IG Business account created, linked to a
      Facebook Page.
- [ ] Long-lived IG Page token generated, pasted into Susy under
      Settings → Instagram Accounts.
- [ ] Telegram bot created via @BotFather. Token pasted into Susy
      under Settings → Telegram Approval. Timeout policy: `skip`.
- [ ] Telegram public broadcast channel created
      (`OrderFlow Beast — Live Signals (30min delayed)`).
- [ ] OrderFlow Beast notification dispatcher wired to forward Pro-tier
      signals to the broadcast channel with a 30-minute delay (build
      under `apps/workers/`).
- [ ] `/try` landing page live with UTM tracking.
- [ ] Stripe Pro monthly checkout link verified end-to-end.
- [ ] LLM budget caps set:
      `LLM_DAILY_BUDGET_USD=15`,
      `LLM_MONTHLY_BUDGET_USD=180`,
      `IMAGE_DAILY_BUDGET_USD=5`.

---

## Day 1 — Brand setup

- [ ] Paste brand profile from `01_brand_profile.md` into Susy Brand
      Setup → Brand profile.
- [ ] Upload 6 knowledge base PDFs.
- [ ] Upload 6 visual identity sources.
- [ ] Run Visual Identity confidence check; target ≥ 0.7.
- [ ] Generate 5 hero images via Brand → Visual Identity → Test
      generation. Pick 3 to seed IG grid (post manually for day 1).

## Day 2 — Pinned thread

- [ ] Paste pinned X thread from `03_pinned_thread.md` (7 tweets +
      link reply). Pin tweet 1.
- [ ] Post seed-post day 1 (3 tweets) manually, spaced through the day.

## Day 3 — Campaign A dry run

- [ ] Open Campaign Wizard, paste **Campaign A — Tape School** goal
      text. Step through. Hit Approve & Launch in `DRY_RUN`.
- [ ] Wait 24h. Inspect generated drafts in Content page. Reject any
      drafts that violate the brand voice. Susy learns from this.

## Day 4 — Campaign A live

- [ ] If dry-run drafts pass, flip Campaign A to `LIVE`.
- [ ] Continue posting seed posts day 2 manually for redundancy.

## Day 5 — Campaign B (Discussion Agent)

- [ ] Populate watchlist with handles from `06_discussion_watchlist.md`.
- [ ] Launch Campaign B as Discussion Agent strategy. Telegram approval
      timeout = `skip`.
- [ ] Approve first 5 drafts manually with care. Observe approval rate.

## Day 6 — Telegram broadcast goes live

- [ ] Publish Telegram channel link on X bio (replace `/try` link
      temporarily with a linktree-style page if both need to be
      surfaced).
- [ ] First broadcast signal forwarded.

## Day 7 — First weekly thread

- [ ] Post the long-form Tuesday thread (Day 7 of seed posts —
      "Why CVD divergence fails 6 days out of 10").
- [ ] First weekly KPI review:
      - X follower count
      - Reply impressions
      - /try landing visits
      - Free signups
      - Susy spend in Cost Center

## Day 10 — Engagement Burst (with care)

- [ ] **DRY_RUN first.** Launch Engagement Burst on query:
      `"order flow" OR "footprint" OR "absorption"`.
- [ ] Cap at 50 likes. Zero retweets.
- [ ] Flip to LIVE only if DRY_RUN looks clean.
- [ ] Do not run alongside Campaign A activity on the same hour —
      stagger.

## Day 14 — End of week 2

- [ ] Second weekly KPI review.
- [ ] Audit Susy's image pipeline output for brand consistency.
- [ ] Adjust visual identity sources if generations drift.
- [ ] Read sentiment scores on Content page. Any negative spikes?
      Investigate the offending posts.

## Day 17 — Targeted Outreach (use sparingly)

- [ ] Hand-pick 20 high-signal handles relevant to the next campaign
      theme.
- [ ] Launch Targeted Outreach with 60–900s spacing.
- [ ] Stop if any rate-limit warning appears in the log monitor.

## Day 21 — End of launch window

- [ ] Final weekly KPI review with week-over-week deltas.
- [ ] Decide on Campaign A theme refresh for month 2.
- [ ] Document what worked / didn't in `08_kpi_log.csv`.
- [ ] Plan the LinkedIn manual posting cadence for B2B (prop firms,
      fund managers) — Susy has LinkedIn helpers still in the tree but
      not wired into the wizard.

---

## Daily operator routine (~15 min)

Morning (5 min):
- [ ] Open Telegram bot. Approve / reject overnight Discussion Agent
      drafts.
- [ ] Check log monitor: `python scripts/log_monitor.py --since 12`.

Mid-day (5 min):
- [ ] Approve drafts from US-hours run.
- [ ] Check Content page for any post that surfaced negative
      sentiment > 0.4.

Evening (5 min):
- [ ] Review tomorrow's scheduled actions on the Home page.
- [ ] Note one thing that worked, one that didn't, into KPI log.

---

## Emergency kill switches

- **Master AI switch** (sidebar): disable Claude entirely. Stops all
  briefing + post generation.
- **Image master pause:**
  ```python
  from susy.generation.image_pipeline import set_image_master_paused
  set_image_master_paused(True)
  ```
- **Stop a campaign:** Home page → campaign row → Stop.
- **Stop the worker only:**
  `systemctl stop susy-x-worker.service` (UI keeps running).
- **Stop everything:** `systemctl stop susy-x.service`.

---

## Compliance reminders

- Quick Strategies (Engagement Burst, Targeted Outreach) are
  acknowledged ToS-grey. Throttle, log, and never automate alongside
  paid promotion.
- Never let Susy claim guaranteed returns. The brand profile bans this
  but audit Content page weekly.
- Never auto-post replies. Telegram approval = `skip` policy is the
  guardrail. Verify under Settings → Telegram Approval at least
  weekly.
- If a generated image looks too much like a real chart prediction
  (drawn arrows, "BUY HERE" labels), reject and tighten the visual
  identity sources.
