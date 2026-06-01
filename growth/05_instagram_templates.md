# Instagram visual templates — feed + stories

OrderFlow Beast on Instagram is for proof and education, not engagement
chasing. The grid is the portfolio; the stories are the proof feed.

Susy's image pipeline (`susy/generation/image_pipeline.py`) runs Flux
Pro through Claude-driven creative direction + critique. The five
templates below give Susy strong creative briefs so generations look
like product screenshots, not stock art.

## Visual constants (apply to every template)

- **Background:** `#0a0a0c` (charcoal) with subtle 4% noise.
- **Numeric font:** JetBrains Mono.
- **Body font:** Inter or Söhne, weight 400/600.
- **Colors:** buy `#22d3ee`, sell `#f97366`, warn `#fbbf24`, ok
  `#22c55e`, axis `#525252`, label `#a3a3a3`.
- **No glow. No neon. No drop shadow.** Bloomberg-meets-Linear.
- **Aspect ratios:** feed = 4:5, carousel = 4:5, story = 9:16.
- **Watermark:** small `@orderflowbeast` bottom-right, opacity 35%,
  monospace.
- **No drawn-on arrows predicting future moves.** Only historical
  annotations.

---

## Template 1 — Tape teardown carousel (5 slides, 4:5)

**Slide 1 — Hook**
Brief: *"Single big numeric headline centered. Below: instrument
ticker and timestamp UTC. Top corner: small 'TAPE TEARDOWN' eyebrow."*

Sample text:
- Eyebrow: `TAPE TEARDOWN`
- Headline: `+0.62%`
- Sub: `BTC-PERP · 14:02 UTC · Buy sweep into 67.4k`

**Slide 2 — Chart screenshot**
Brief: *"Footprint chart of the move, cropped to ±15 minutes around the
print. Annotate the sweep candle with a thin label, not an arrow."*

**Slide 3 — Heatmap screenshot**
Brief: *"Side-by-side heatmap showing the resting offer that absorbed
plus the lift that broke through. Label the level cleanly."*

**Slide 4 — Plain-English read**
Brief: *"Black background, four short bullets in mono, max 10 words
each, explaining what the tape said."*

Sample bullets:
- 4 lifts inside 90s
- Book thinned above 67.5k
- Resting 38M absorbed
- Move sustained 38 min

**Slide 5 — CTA**
Brief: *"Centered text card. No image."*

Sample text:
- `Free Telegram channel — 30min delay`
- `Live alerts in app`
- `Link in bio`

---

## Template 2 — Edge education carousel (6 slides, 4:5)

**Slide 1 — Question hook**
Brief: *"Large centered question, no chart."*

Sample: `Why does CVD divergence fail 6 out of 10 times?`

**Slides 2–5 — One reason per slide**
Brief: *"Each slide: numeric heading (Reason 1, Reason 2 …), one-line
problem, one-line fix. Tight typographic layout."*

**Slide 6 — Takeaway + CTA**
Brief: *"Centered text: 'Confluence > prediction'. Sub: 'Free tier
shows the three reads side by side. Link in bio.'"*

---

## Template 3 — Signal-of-the-day card (single feed image, 4:5)

Brief: *"Single composed card mimicking the OrderFlow Beast signal
alert. Header: 'SIGNAL FIRED'. Body: instrument, timestamp, trigger
type, entry zone. Footer: 'Posted to public Telegram with 30min
delay'."*

Sample fields:
- Header: `SIGNAL FIRED`
- Time: `14:02 UTC`
- Instrument: `BTC-PERP`
- Trigger: `buy_sweep`
- Entry: `67,420 → 67,510`
- Outcome: redacted (use `live →` with a small ticker)
- Footer: `@orderflowbeast — free Telegram (30min delay)`

---

## Template 4 — Inferred vs True L2 comparison (single feed, 4:5)

Brief: *"Split image, left and right. Left: 'TRUE L2 — Crypto'. Right:
'INFERRED — Equities, Futures, FX'. Each side shows a compact chart
sample. Bottom strip: 'Same UI. Different data quality. We label
every chart.'"*

The goal of this template is to make data honesty the visual
differentiator. Encourage saves.

---

## Template 5 — Product moment / new feature (single feed, 4:5)

Brief: *"Subtle product screenshot with the new feature highlighted by
a thin cyan rectangle (3px stroke, 100% opacity). Bottom card: feature
name + one-sentence value prop + 'Pro tier'."*

Sample copy:
- Feature: `Cross-market scan`
- Value: `Run one query across crypto and ES futures. Confluence in
  one place.`
- Footer: `Pro · $29/mo · Free tier runs 10 scans/day`

---

## Story templates (9:16, 24h ephemeral)

### Story A — Morning tape recap (post 8:00 UTC daily)
Brief: *"Vertical card. Headline: 'Overnight tape recap'. Body: 3
short bullets — Asia close, Europe open, one notable level. Sticker
poll at bottom: 'Trading this open? Yes / No'."*

### Story B — Mid-session signal flash (post on trigger)
Brief: *"Single chart screenshot with timestamp + trigger label.
Sticker: 'Open in app' link sticker → orderflowbeast.com."*

### Story C — End-of-day mood (post 21:00 UTC)
Brief: *"Vertical card with a single big number: 'X signals fired
today across 6 markets'. Body: one-line teaching moment. Sticker: 'See
the daily recap on our X profile' link sticker."*

---

## Hashtag bank for IG captions

Use 6–10 per post. Group at the END of caption, on a separate line
break.

Tier-1 (highest relevance):
`#OrderFlow #Footprint #DayTrading #CryptoFutures #ESFutures`

Tier-2 (broader):
`#FuturesTrading #ScalpTrader #PriceAction #SmartMoneyConcepts`

Tier-3 (avoid unless directly relevant):
`#Forex #Stocks #Options`

Banned: anything with "crypto signals", "100x", "moonshot",
"guaranteed", "altcoin gem" — IG quietly demotes accounts that mix
education with spam-adjacent tags.

---

## Pipeline notes for the operator

- Daily image-spend cap (`IMAGE_DAILY_BUDGET_USD`) at $5 keeps Susy
  honest. ~125 generations/month at Flux Pro `$0.04`/img.
- Susy's critique step rejects scores < 0.65 and regenerates once. If
  three regenerations fail, skip the image and surface a warning.
- IG account is configured under **Settings → Instagram Accounts**.
  Use a Business account so insights work and external link stickers
  are allowed.
