# 14-day seed posts — @OrderFlowBeast

Hand-written posts to seed the account *before* Susy takes over.
Purpose: build a backlog of 30–40 quality tweets so the timeline doesn't
look auto-generated when Susy goes LIVE. Susy ingests this voice via
the knowledge base.

Posting cadence during seed phase: 3 posts/day. Use 13:30 UTC, 16:00
UTC, 20:00 UTC slots. Validate every post through Susy's "X Content
Rules" tester before posting.

Replace bracketed `[NUMBER]` and `[INSTRUMENT]` placeholders with real
data the day-of. Never post a teardown without an attached screenshot.

---

## Day 1

**1.** (Tape teardown)
```
NQ printed a textbook sweep at 19,840 — bid lifted 240 contracts in
under 8s, then absorbed.

Footprint showed sell delta into the wick that didn't follow through.
Classic stop run before continuation.

The print is the entry. The candle is the receipt.
```

**2.** (Edge education)
```
CVD divergence is overrated alone.

Two things make it tradeable:
1. The divergence has to fail at a recognised level (VPOC, prior
   day high, weekly open).
2. Order flow has to confirm — absorption or a sweep, not just
   drift.

Without those, you're trading noise that looks like signal.
```

**3.** (Inferred vs True L2)
```
"Inferred delta" sounds like a marketing word. It isn't.

On stocks and futures we estimate delta from where price closes inside
the bar. It's directionally useful for confluence.

On crypto we read the actual book. We label both. Honesty > marketing.
```

---

## Day 2

**1.** (Signal-of-the-day)
```
14:02 UTC — buy sweep alert on ETH-PERP, $3,210.

Tape: 4 lifts in 90s, ask book thinning above. Heatmap had 12M resting
at 3,225 that absorbed the chase.

Posted to the free Telegram 30min later. Live in the app.
```

**2.** (Edge education)
```
Three ways imbalance lies to you:
1. It's a snapshot — slow markets always look "imbalanced."
2. Iceberg orders don't show until they're hit.
3. It doesn't know about news.

The fix: imbalance only counts if it's confirmed by a sweep or a
print at the level.
```

**3.** (Product moment)
```
You can run a scan across crypto and ES futures in the same query now.

"Show me every absorption that happened at the prior day high in the
last 24h."

One scan, two markets, twelve results. Free tier: 10 scans/day.
```

---

## Day 3

**1.** (Tape teardown)
```
CL came into 71.40 at the European open. Footprint showed buy delta
stacked four ticks deep, then nothing followed through.

That's not strength. That's bids loading into a level the sellers were
already short into.

Reversed 80 ticks by NY open.
```

**2.** (Honesty / Inferred vs True L2)
```
Crypto is the only asset class where the L2 book is fully public.

Everywhere else — equities, futures, FX — the venues charge for the
true book. Most order-flow tools quietly use inferred data and call
it L2.

We don't. The badge stays on every chart.
```

**3.** (Edge education — thread starter, optional)
```
"How do I know which trigger to set first?"

Asked every day. Short answer:

Start with absorption-at-prior-day-high or low. Highest hit rate of
the catalogue, easiest to verify with the eye, works in every regime.
Then layer.
```

---

## Day 4

**1.** (Tape teardown)
```
ES bounced 4 ticks off 5,940 and faded. Volume profile said it should
have held — VAH from yesterday.

What killed it: CVD diverged for 11 minutes before the lift. Buyers
were chasing into a tape that wasn't expanding.

Profile told you where. Flow told you when.
```

**2.** (Signal-of-the-day)
```
SOL-PERP — sweep buy at 152.40, 17:48 UTC.

Funding had reset negative. Book thin above. 3 lifts inside 60s.

Move: 154.10 inside 7 minutes. Posted to free Telegram with delay.
Live alerts in app.
```

**3.** (Product moment)
```
Telegram alerts now fire with the trigger type in the subject line.

You see "buy_sweep · ES_F · 5,840.25" before you open the message —
makes scrolling 40 alerts in a session tolerable.

Pro tier. Free uses email + push.
```

---

## Day 5

**1.** (Edge education)
```
The most underrated read in order flow:

Compare the speed of price across two adjacent prints.

If the second print covered the same distance twice as fast as the
first, conviction is rising. Volume confirms but speed leads.

It's in the data — almost no one looks.
```

**2.** (Tape teardown)
```
BTC came back to 67.4k a third time today.

First two: book thin, bids reloaded, breakouts faded.

Third: book stacked, bids absorbed, lift held.

Same level, three different stories. Order flow is the only thing
that told you which one to trade.
```

**3.** (Soft CTA)
```
Free tier exists so you can prove edge before paying.

Three setups. Ten scans a day. Seven days of history. Push alerts.

No card required. Account in 30 seconds.

Link in bio.
```

---

## Day 6

**1.** (Inferred vs True L2)
```
Question we get a lot: "Can Inferred delta even be useful?"

Yes — for confluence, regime, and direction. Not for entries off a
single bar.

Use it like a weather forecast: read the season, not the minute.
Crypto is where you trade the minute.
```

**2.** (Tape teardown)
```
GBPUSD ran into 1.2680 four times today. Each fail had a different
texture in the tape — but the indicator readouts were nearly identical.

That's the whole reason flow exists. Same chart, different stories
underneath.
```

**3.** (Signal-of-the-day)
```
DXY printed an exhaustion sweep at 105.40 — 21:14 UTC.

Lift died inside three bars. Inferred delta backed it. EURUSD and
XAUUSD rallied off the read.

Cross-market confluence is the Pro-tier scan. Free tier sees one
market at a time.
```

---

## Day 7 — thread day

**Thread (5 tweets) — "Why CVD divergence fails 6 days out of 10":**

```
1/ CVD divergence is the most posted, least understood read in
order flow.

Most divergences fail. Here's why — and what makes the survivors
tradeable. 🧵

2/ A divergence only matters at a level the market already cares
about: VPOC, prior session high/low, weekly open, a swept liquidity
pool.

In open space, a CVD divergence is just two lines pointing
different directions.

3/ The divergence must coincide with a behaviour change in the tape.
Examples:
· book thinning above
· absorption (delta into a single price)
· iceberg appearing
· speed dropping

If the tape stays the same, the divergence is decoration.

4/ Time horizon matters. 1m CVD divergence resolves in minutes.
5m takes the session. 1h takes the week.

Trade the divergence on the timeframe of the level you're fading.
Mixing horizons is the most common error.

5/ The shortcut: every time you spot a divergence, ask
"would I take this trade WITHOUT the divergence?"

If no, the divergence is alibi, not edge. If yes, it's confluence.

This is what the OrderFlow Beast scan filters for.
```

---

## Day 8

**1.** (Edge education)
```
Absorption looks like nothing on a candle chart.

It looks like a single price holding under repeated sells, with delta
green and price flat. The candle that prints around it is unremarkable.

That's the read most setups miss. The reversal is already done.
```

**2.** (Tape teardown)
```
NQ rejected 20,100 with a 4-tick wick and no follow-through. Standard
read: "bears in control."

Order flow read: buy delta inside the wick, sellers got filled into a
bid that didn't move. That's a bid that wants to be lifted, not
defended.

Reversed 110 ticks.
```

**3.** (Soft CTA)
```
Pro unlocks footprint, heatmap, DOM, cross-market scans, and Telegram
alerts.

$29/month. AI credit bundled. Cancel anytime.

The free tier is enough to know if it earns its keep.

Link in bio.
```

---

## Day 9

**1.** (Honesty content)
```
Things order flow does not do:
· Predict where price will be in three days
· Make you a profitable trader if you have no plan
· Save a thesis that's already wrong

What it does: tell you who's at the level, right now, with size.

That's it. Use accordingly.
```

**2.** (Signal-of-the-day)
```
GC printed exhaustion at 2,415 — 13:48 UTC.

Buyers lifted four offers, fifth offer wouldn't move. Delta peaked
and rolled within a minute.

The trigger fired on cross-market scan along with DXY's bid stack.

Free Telegram saw it on delay.
```

**3.** (Edge education)
```
Order flow regime check, three questions:

1. Is the book thinner or thicker than usual?
2. Are sweeps single-side or two-sided?
3. Is value migrating or balanced?

Three answers determine whether you trade continuation or fade.

If you trade the wrong regime, no read saves you.
```

---

## Day 10

**1.** (Tape teardown)
```
EURUSD sat at 1.0820 for 90 minutes with delta hovering near zero.

That's the tell — neither side committing, both sides probing. The
break came on a single sweep, 22 contracts on the offer.

No retracement. No mercy.
```

**2.** (Product moment)
```
Scan templates now have presets.

"Absorption at value area high, last 4h, all crypto perps."
"Sweep into prior day low, today, all US futures."

Six presets. Free tier runs them ten times a day. Pro removes the cap.
```

**3.** (CTA rotation)
```
We post the day's recap on X at 23:00 UTC.

Yesterday: 47 signals across six markets, three asset classes. Best:
absorption on CL into the European open.

Live alerts are in the app. Free Telegram channel runs on a 30-minute
delay.
```

---

## Day 11

**1.** (Edge education)
```
Stop-runs and sweeps are not the same read.

Stop-run: price exceeds a swing point, fills resting stops, reverses.
Sweep: price lifts (or hits) a stack of orders quickly, may or may
not reverse.

Sweeps without obvious stop placement are the higher-quality entries.
```

**2.** (Tape teardown)
```
ES_F — sweep buy at 5,840.25 — 14:58 UTC.

Tape: three lifts in 7 seconds, book thinned above, no offer wanted
to refill. Inferred delta backed the read.

The free scan found it. The Telegram channel posted it on delay.
```

**3.** (Honesty content)
```
We don't run a signals service.

We run an order-flow terminal that surfaces signals so traders can
verify them with their own eyes and rules.

If you want black-box alerts to copy, we aren't it. If you want to
understand why a level held, we are.
```

---

## Day 12

**1.** (Inferred vs True L2)
```
True L2 on crypto is a public, raw data stream. Anyone can build
against it.

Inferred delta on equities and futures is a model. Models can be
right or wrong. Ours has the equation visible.

If you ask, we send the methodology PDF. Most don't.
```

**2.** (Tape teardown)
```
BTC bid-stacked at 66,800 with 41M resting visible. Tape sold through
8M of it in 12s — only 8M of the 41M.

Either an iceberg refresh or someone left the order. Either way the
remaining 33M flips your read on the level from "support" to "where
liquidity is parked, not defended."
```

**3.** (Edge education)
```
"How do I scan for absorption?"

Three filters do most of the work:
1. Delta sign opposite to price direction for ≥ 8 prints.
2. Price contained within ≤ 3 ticks during that window.
3. The window sits at a level you'd already trade.

The third is the one most people skip.
```

---

## Day 13

**1.** (Community amplification — quote-style)
```
A point worth amplifying: order flow without context is just numbers.

The skill isn't reading the print — it's knowing which prints to read.

Three reliable contexts: prior-session levels, fresh news shock, and
the open / close auctions.
```

**2.** (Signal-of-the-day)
```
USDJPY — sweep sell at 156.85 — 09:31 UTC.

Inferred delta turned hard, the lift died on a thin book. EURJPY and
GBPJPY backed the move.

Cross-market scan is the Pro feature most underrated by people who
haven't tried it.
```

**3.** (CTA)
```
Free tier:
· 3 setups
· 10 scans / day
· Push + email alerts
· 7-day history

Pro: footprint, heatmap, DOM, unlimited scans, cross-market, Telegram,
webhooks. $29/mo.

Try the free first. Link in bio.
```

---

## Day 14

**1.** (Reflection / brand note)
```
Two weeks of posting. A few observations:

· Tape teardowns get the most thoughtful replies.
· Honesty content (Inferred vs True L2) gets the most signups.
· Signal-of-the-day gets the most retweets.

Doing more of all three.
```

**2.** (Edge education)
```
Confluence beats prediction.

Pick the three reads that almost always agree at a tradeable level:
1. Value area defended
2. Sweep into the boundary
3. Cross-market confirmation

If two of them agree, the trade is worth taking. When all three line
up — size up.
```

**3.** (CTA — soft)
```
If you read these and they're useful, the free tier is built for you.

Three setups, ten scans, seven days of history. Account in 30 seconds.

If after a week it hasn't earned its keep, leave it. No harm.

Link in bio.
```

---

## Validation checklist (run before posting)

For each post above:

- [ ] ≤ 270 chars
- [ ] 0–2 hashtags
- [ ] 0–3 @mentions
- [ ] No banned bait phrases
- [ ] No hype vocabulary
- [ ] Numbers present where claimed
- [ ] No external URLs in body
- [ ] Caps reserved for acronyms

Paste each into Susy's `Brand → X Content Rules` tester to confirm
`severity == ok`.
