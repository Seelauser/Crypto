# Changelog

All notable changes to OrderFlow Analytics are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-06-05

Makes the chart actually interactive. The v0.1.0 toolbar tracked layer state
but rendered nothing, and the timeframe was hard-coded — so the chart looked
"broken / no evidence of action." This wires the controls to real behaviour.

### Added
- **Timeframe selector** (1m / 5m / 15m / 1h / 4h / 1d) in the chart header.
  Drives the bars fetch (the API already accepted `tf`) and refetches on
  change; marker-hover tolerance now scales with the active timeframe.
- **Vol Profile layer now renders** — POC / VAH / VAL price lines (amber)
  computed from the loaded bars, recalculated per timeframe, cleanly removed
  when toggled off.
- **Footprint layer now renders** the `FootprintChart` view, and **Depth**
  renders the `DomLadder` view. Both components and their APIs
  (`/footprint`, `/orderbook-history`) existed but had never been wired into
  the markets page — the toggles were dead.

### Fixed
- **Chart redraw flicker** — the pane's `ResizeObserver` re-committed height on
  every sub-pixel change, feeding back into the chart's own resize. It now only
  commits changes > 2px, removing the jitter.

## [0.1.0] — 2026-06-05

First tagged release. A chart-first UX pass that puts the order-flow product
front and centre and fixes the long/short readability issue on the CVD line.

### Fixed
- **CVD line "flashing" between long/short.** `cvdLineColor` (CvdChart) coloured
  the entire line by comparing the latest bar's CVD to the *previous* bar's.
  On every real-time tick the live bar's CVD wiggled around that value, flipping
  the whole line cyan↔coral and making direction unreadable. It now colours by
  the sign of *net* cumulative delta over the loaded window — stable against
  single-tick noise and a true read of who controls the auction.
- Legend popover in the chart toolbar anchored to the wrong ancestor because the
  toolbar container was not a positioning context (`position: relative` added).

### Added
- **Chart-first landing.** Authenticated users now land on `/markets/crypto`
  (the live chart + order flow) instead of `/dashboard`. The chart is the
  product; show it first.
- **Market bias badge** in the markets top bar — a stable BULLISH/BEARISH read
  from net CVD over the last 120 × 5m bars, refreshed every 20s. Mirrors the CVD
  line colour so the two never disagree.
- **Colour legend** toggle in the chart toolbar (cyan = buy/long, coral =
  sell/short, amber = alert, grey = neutral) — removes the "which colour means
  what" ambiguity.
- **Tier-aware default chart layers.** Pro lands with the order-flow USP
  (Footprint) + Volume Profile visible by default; Starter gets Volume Profile;
  Free keeps Placement. Surfaces premium value without a click.
- **Collapsible symbol sidebar** (toolbar toggle) for a full-width chart.

### Changed
- Chart layer descriptions reworded to foreground the order-flow value
  ("Order flow: bid/ask volume per price level", etc.).

[0.1.0]: https://github.com/Seelauser/Crypto/releases/tag/v0.1.0
