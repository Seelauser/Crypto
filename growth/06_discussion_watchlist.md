# Discussion Agent — watchlist + reply rules

Susy's Discussion Agent (BETA Quick Strategy → `enqueue_discussion_reply`)
reads a target tweet, drafts a contextual reply with `claude-haiku-4-5`,
and routes the draft through Telegram approval before posting.

This is the single highest-ROI lever in the playbook. Done well, it
puts OrderFlow Beast in front of warm, qualified audiences without ad
spend. Done badly, it gets the account blocked and demoted.

**Approval timeout policy: `skip`.** Auto-posting drafts is forbidden.

---

## Daily caps

| Metric | Target | Hard stop |
|---|---:|---:|
| Replies drafted | 30 | 40 |
| Replies approved + posted | 20 | 25 |
| Replies per individual account / week | 1 | 2 |

Why caps: more than ~25 replies/day to an audience that doesn't follow
you yet trips X's "reply guy" demotion signal.

---

## Watchlist — tier A (top priority, ~15 accounts)

These are accounts whose audience overlaps strongly with OrderFlow
Beast's ICP — serious traders, footprint users, prop firm content,
order-flow educators. Susy should monitor their last 24h of tweets and
queue replies on the ones with:

- ≥ 50 engagements within 2h of posting (live conversation)
- Topic: market structure, order flow, footprint, CVD, regime, sweeps,
  absorption, prop firms, news shock reads

Fill in the actual handles during operator setup — these are role
slots, not endorsements:

1. Crypto perps tape reader (well-known L2 educator)
2. ES/NQ futures order-flow streamer
3. Footprint-chart educator (institutional bent)
4. Prop firm seat trader (FTMO/Apex/Topstep content)
5. CL/GC tape commentator
6. FX flow specialist (DXY/EURUSD/JPY pairs)
7. Quant-curious retail trader (large reach)
8. Market regime / macro overlay account
9. Auction theory / volume profile educator
10. Crypto orderbook engineer / data nerd
11. Funding rate commentator (perps focus)
12. Day-trading podcast host
13. Trading desk veteran turned educator
14. Volume profile / VPOC educator
15. CME microstructure researcher

## Watchlist — tier B (~20 accounts)

Accounts with smaller reach but very high-quality replies. Reply once
per week max. Goal: be visible to a small, smart audience.

Operator should curate by spending 2 hours skimming high-engagement
order-flow Twitter, then drop 20 handles into Susy's targeting field.

## Watchlist — tier C (search queries)

In addition to handle-based targeting, Susy can run reply targeting on
search queries. Queue draft replies on the top 5 results per query
posted within the last 2h with ≥ 30 engagements.

```
"buy sweep" OR "absorption" OR "iceberg"
"CVD divergence" OR "delta divergence"
"footprint chart" OR "footprint" "chart"
"order flow" trading
"market regime" trading
prop firm "blown account"
NQ OR ES "tape"
binance perps "order book"
```

Susy resolves these via `twitter_api.search_recent_tweets_many` —
already wired.

---

## Reply rules — paste into Susy's Discussion Agent goal text

```
Draft a reply that adds value to the parent tweet's discussion. Treat
this as a peer trader weighing in — not as a brand reply.

ABSOLUTE RULES:
- Never include a URL.
- Never mention "OrderFlow Beast" by name unless the parent EXPLICITLY
  asks "what tools do you use" or similar. Even then, mention it once,
  no link, no marketing pitch.
- Never include @OrderFlowBeast in the reply text.
- Never include hashtags.
- Never use engagement bait. No "RT if", no "follow for more", no
  "DM me".
- Never use hype vocabulary: moon, lambo, 100x, guaranteed, pump,
  rug, ape in, free money.
- Never make political, medical, or definitive directional price
  calls.
- Never dunk on the parent. If they're wrong, disagree politely with
  evidence.

LENGTH:
- 80–200 characters preferred.
- Replies shorter than 60 chars look low-effort and get throttled.
- Hard max 260 chars.

CONTENT:
- Reference a specific number, level, or behaviour from the parent
  tweet (price, time, instrument, indicator).
- If the parent is correct, extend it with ONE concrete additional
  angle — order-flow context, regime context, what to watch next.
- If the parent is incorrect or imprecise, offer a correction with
  evidence (a level, a behaviour, a counter-example).
- Use the order-flow vocabulary from the brand profile.

EMOJI:
- Allowed: 📈 📉 — only if directly annotating a price move.
- Banned: everything else.

If the parent tweet is:
- Spam, scam, or shill — draft a one-line "skip" so the operator can
  reject in Telegram with one tap.
- Political, medical, or off-topic — same.
- Already had a great reply from someone else — same.
- Older than 6 hours — skip; engagement window is over.
```

---

## Operator Telegram approval workflow

Each draft arrives in the Susy bot chat as an inline card:

```
DRAFT REPLY → @target_handle
Parent: "CVD on NQ doesn't agree with the bounce here..."

> Draft: "Agree — speed dropped 35% across the
> last two prints into the lift. Watch 19,840
> as the deciding offer; if it absorbs you'll
> get one more leg."

[Approve] [Reject] [Edit]
```

Approve / Reject buttons are inline keyboard. Edit means open a reply
chat with Susy to send a revised draft.

Operator target: 80%+ approval rate. Below that, retune the goal text
or shrink the watchlist.

---

## Banned reply targets

Do not let Susy draft replies to:

1. The CEO or official account of a directly competing product.
2. Politicians, regulators, or law enforcement.
3. Tragedy / death / illness threads.
4. Memecoin or NFT shill threads.
5. Tweets locked to followers only (technical: Susy won't see them
   anyway via search, but list defensively).
6. Anything in a non-English script unless the operator reads the
   language.

Hardcode the competitor handles in Susy's Brand profile under "do not
mention" so the LLM avoids them on its own.

---

## KPI: reply layer health

Track weekly in the KPI sheet:

| Metric | Target |
|---|---:|
| Replies posted | 100–125 |
| Avg engagements/reply | ≥ 15 |
| Profile clicks from replies | ≥ 800 |
| New followers attributable to reply layer | ≥ 250 |
| Operator approval rate | ≥ 80% |
| Susy Claude spend on Discussion Agent | ≤ $10 |

If avg engagements/reply < 8 for two weeks: the drafts are too
brand-coded. Tighten the "never mention the brand" rule and rewrite
the goal text.
