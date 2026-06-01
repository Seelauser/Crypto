# Campaign briefings — paste into Susy X Campaign Wizard

Three campaigns run concurrently. Each block below is the *plain-English
goal text* to paste into Step 1 of the Campaign Wizard. Susy's
briefing model (`claude-opus-4-6`) will expand each into a strategic
brief and schedule.

Always launch each campaign in `DRY_RUN` for 48h, audit the Content
page, then flip to `LIVE`. Keep `LLM_DAILY_BUDGET_USD=15` for the first
two weeks.

---

## Campaign A — Tape School (X + IG)

**Duration:** 30 days, evergreen — relaunch each month with refreshed
themes.

**Platforms:** Twitter + Instagram.

**IG account:** orderflowbeast_main.

**Goal text to paste:**

> Run a 30-day educational acquisition campaign for OrderFlow Beast on
> X and Instagram. Audience: retail crypto-perp and futures day
> traders, 22–45, predominantly English. They already know what CVD is
> or want to.
>
> Objective: build authority on order-flow concepts so the audience
> trusts us enough to try the free tier, then converts to Pro when
> they hit footprint/heatmap paywall.
>
> Daily mix:
>   - X: 4 short posts per day, plus 1 long thread per week (Tuesday).
>     Schedule for US RTH open (13:30 UTC), London close (16:00 UTC),
>     US futures power hour (20:00 UTC), and Asia open (00:00 UTC).
>   - Instagram: 1 carousel per day at 15:00 UTC (peak global
>     engagement), plus 2 stories (8:00 UTC and 21:00 UTC).
>
> Content mix across the week:
>   - 30% tape teardowns — concrete walk-through of a recent print.
>   - 20% edge education — standalone concept explainers.
>   - 15% Inferred vs True L2 honesty content — the differentiator.
>   - 15% signal-of-the-day proof — redacted alert from our scan.
>   - 10% product moments — new feature, UI clip.
>   - 10% community amplification — quote-replying to a trader thread
>     with added context.
>
> Constraints (CRITICAL):
>   - Follow every X algorithm-safe rule loaded into the brand.
>   - No external links in any X post body. Drop the link in a reply.
>   - No more than 2 hashtags. Prefer zero.
>   - Never use engagement bait phrasing.
>   - No hype vocabulary.
>   - Use the order-flow vocabulary from the brand profile — bid,
>     offer, sweep, absorption, CVD, footprint, VPOC, imbalance,
>     delta.
>   - Always cite a number, level, or measurable behaviour when making
>     a market claim.
>   - Never name competitors negatively. Compare features, not brands.
>   - Never make political, medical, or guaranteed-return claims.
>
> Calls to action: rotate, max 1 CTA per 4 posts. CTAs are limited to:
>   1. "Free account, no card. Link in bio."
>   2. "Pro unlocks the footprint and the heatmap. Link in bio."
>   3. "We posted the alert at HH:MM UTC in the public Telegram. Free
>      channel, 30min delay."
>
> Instagram-specific: each carousel is 5–7 slides. Slide 1 is a hook,
> slides 2–6 build the concept, last slide is the CTA. Captions are
> 3–8 sentences. Hashtags grouped at the END of the caption, max 10
> hashtags (IG tolerates more than X). No external links — IG strips
> them. CTA: "Link in bio."
>
> Tone: tape-reader peer, not influencer. Slightly irreverent toward
> hype, never cocky.

---

## Campaign B — Discussion Agent reply layer (X only)

**Duration:** Perpetual.

**Platforms:** Twitter only.

**Mode:** BETA Quick Strategy — Discussion Agent. Drafts only; route
EVERY reply through Telegram approval. Timeout policy: `skip`.

**Goal text to paste (per discussion request):**

> Draft a reply that adds value to the parent tweet's discussion. Treat
> this as a peer trader weighing in — not as a brand reply.
>
> Rules:
>   - Reference a specific number, level, or behaviour from the parent
>     tweet (price, time, instrument, indicator).
>   - If the parent is wrong, disagree politely with evidence. Never
>     dunk.
>   - If the parent is right, extend it with one extra angle — order
>     flow context, regime context, what to watch next.
>   - Never include a link. Never include @OrderFlowBeast handle. Never
>     mention "OrderFlow Beast" by name unless the parent specifically
>     asks "what tools do you use" — and even then, mention it once,
>     without a link.
>   - Never include hashtags in replies.
>   - 80–200 characters preferred. Replies shorter than 60 chars look
>     low-effort and get penalised.
>   - Avoid all engagement bait, hype vocab, and emoji except 📈 📉 if
>     directly annotating a move.

**Watchlist:** see `05_discussion_watchlist.md`.

**Daily cap:** 25 approved replies/day. Hard stop at 30.

---

## Campaign C — Signal Drop (Telegram + X cross-post)

**Duration:** Perpetual.

**Platforms:** Twitter (cross-post recap only). Telegram broadcast
channel runs outside Susy via the product's notification dispatcher.

**Setup:**
   1. Create a public Telegram channel: "OrderFlow Beast — Live
      Signals (30min delayed)".
   2. Wire the OrderFlow Beast notification dispatcher to forward every
      Pro-tier signal to the channel with a 30-minute delay (build in
      `apps/workers/`).
   3. Each forwarded signal includes: timestamp UTC, instrument,
      trigger type, entry zone, "30min delayed — live alerts in
      app".
   4. End-of-day, Susy posts a recap thread on X.

**Goal text to paste for the daily recap:**

> Generate a daily 4-tweet recap thread on X summarising the prior 24h
> of signal alerts that fired in our scan.
>
> Schedule: once per day at 23:00 UTC.
>
> Thread structure:
>   - Tweet 1: hook — total signals fired across asset classes,
>     stand-out instrument of the day, one-line takeaway. No CTA.
>   - Tweet 2: 2–3 best-performing signals with timestamp, trigger
>     type, and how the move played out. Honest about losers if losers
>     were significant.
>   - Tweet 3: one teaching moment — what regime/context made these
>     signals work or fail.
>   - Tweet 4: CTA — "Free Telegram channel (30min delayed). Live
>     alerts in app. Link in bio."
>
> Constraints: same algorithm-safe rules as Campaign A. No links in
> body. Numbers in every tweet. Use UTC times consistently. Never
> claim a P&L figure unless the operator explicitly provides one.

---

## Cost ceiling per campaign

Susy estimates per-launch USD spend on the wizard's step 3. Targets:

| Campaign | Estimated monthly Claude + image spend |
|---|---:|
| A — Tape School | ≤ $90 |
| B — Discussion Agent | ≤ $40 |
| C — Signal Drop | ≤ $20 |
| **Total** | **≤ $150** |

If the cost preview exceeds these on launch, reduce daily post count
before flipping to LIVE. Budget caps:
`LLM_DAILY_BUDGET_USD=15`, `LLM_MONTHLY_BUDGET_USD=180`,
`IMAGE_DAILY_BUDGET_USD=5`.
