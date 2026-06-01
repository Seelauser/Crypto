# OrderFlow Beast — Growth playbook (powered by Susy X)

Subscription-acquisition plan: use **Susy X**
(`/root/projects/susy-x/`) as the autonomous social operator pushing
**OrderFlow Beast** (`/root/projects/orderflow/`) on X + Instagram +
Telegram, with manual LinkedIn support.

## Files in this folder

| File | Purpose |
|---|---|
| `01_brand_profile.md` | Paste into Susy → Brand Setup → Brand profile |
| `02_campaign_briefings.md` | Paste each section into Campaign Wizard |
| `03_pinned_thread.md` | 7-tweet pinned thread, hand-written |
| `04_seed_posts_14d.md` | 14 days × 3 posts/day to seed the account |
| `05_instagram_templates.md` | 5 IG templates + 3 story templates |
| `06_discussion_watchlist.md` | Reply layer targets + rules |
| `07_launch_checklist.md` | Day-by-day operator checklist |
| `08_kpi_log.csv` | Weekly KPI tracker (fill in) |
| `09_validation_report.md` | x_rules.py results on the seed posts |
| `_validate.py` | Script — re-runs validation on all drafts |

## Funnel summary

```
X reply / IG carousel  →  bio link / pinned thread  →  /try landing
                                                       ↓
                                         email + free account
                                                       ↓
                                  tier gates (footprint, heatmap, scans)
                                                       ↓
                                          Stripe Pro checkout
```

## Targets — month 1

| KPI | Target |
|---|---:|
| X followers | +1.5k |
| /try landing visits | 12k |
| Free signups | 1.6k |
| Free → Pro conversion | 4–6% |
| Telegram channel subs | 1k |
| Cost per paid Pro acquired | < $8 |
| Total Susy spend | < $150 |

## Three campaigns

1. **Tape School** (X + IG, 30 days) — educational acquisition.
2. **Discussion Agent** (X, perpetual) — Telegram-approved value-add
   replies to high-signal trader threads.
3. **Signal Drop** (Telegram broadcast + X recap) — public channel
   mirrors live alerts with 30-min delay.

## Pre-flight checklist (do this before pasting anything into Susy)

1. `@OrderFlowBeast` X account created with bio + link.
2. `@orderflowbeast` IG Business account linked to FB Page.
3. Telegram bot + public broadcast channel created.
4. OrderFlow Beast notification dispatcher wired to forward Pro
   signals to the broadcast channel with a 30-minute delay
   (`apps/workers/`).
5. `/try` landing page live with UTM params.
6. Susy environment caps set:
   `LLM_DAILY_BUDGET_USD=15`,
   `LLM_MONTHLY_BUDGET_USD=180`,
   `IMAGE_DAILY_BUDGET_USD=5`.

Full sequence in `07_launch_checklist.md`.

## Operating principles

- **Honesty is the wedge.** True L2 vs Inferred is the differentiator
  most competitors hide. Lead with it.
- **Numbers beat adjectives.** Every claim should reference a level, a
  size, a timestamp, or a measurable behaviour.
- **Telegram approval on every Discussion Agent draft.** Auto-posted
  replies are how the account dies.
- **DRY_RUN every new campaign for 48h.** Audit on the Content page
  before flipping to LIVE.
- **Caps over speed.** $150/mo Susy spend is plenty. If the budget
  cap is hitting in week 1, the cadence is too high — reduce posts/day
  before increasing budget.

## What lives outside Susy

These pieces must be built/run separately:

- `/try` landing page (Next.js, `apps/web/src/app/try/`).
- Trial-to-Pro email drip (3 emails — day 1 / 5 / 12).
- In-app paywall copy mirroring X messaging.
- Telegram broadcast signal forwarder with 30-min delay
  (`apps/workers/` Node service or a new Python worker).
- UTM attribution reporting.
- LinkedIn manual posts (3/week — Susy has helpers in tree but no UI).

## Risks acknowledged

- **Engagement Burst / Targeted Outreach** are X ToS-grey. Throttled,
  logged, never run during paid promo windows.
- **Discussion Agent** drafts are LLM-generated; Telegram approval
  is the guardrail. Don't bypass.
- **Generated images** must not predict prices — the operator
  rejects any image with drawn arrows or "BUY HERE" labels.
