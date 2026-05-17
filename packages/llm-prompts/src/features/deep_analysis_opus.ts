export interface DeepAnalysisInput {
  instrument: string;
  exchange: string;
  dataQuality: 'true_l2' | 'inferred';
  bars: Array<{
    ts: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    delta: number;
    cvd: number;
  }>;
  currentState: {
    lastPrice: number;
    cvd: number;
    delta: number;
    imbalanceRatio: number;
    bidVolume: number;
    askVolume: number;
    regime?: string;
  };
  userContext?: string;
  timeframe: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function fmtVol(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function sign(n: number): string {
  return n >= 0 ? '+' : '';
}

// ─── VPOC Approximation ───────────────────────────────────────────────────────
// Returns the bar with the highest volume as the Volume Point of Control.
// In production this would bucket by tick rounded to a price grid; here we
// approximate using bar indices since we work with OHLCV rather than tick data.

function approximateVpoc(bars: DeepAnalysisInput['bars']): {
  price: number;
  volume: number;
} {
  let vpocBar = bars[0];
  for (const bar of bars) {
    if (bar.volume > vpocBar.volume) vpocBar = bar;
  }
  // Use the mid of the bar's high/low as the representative price
  const price = (vpocBar.high + vpocBar.low) / 2;
  return { price, volume: vpocBar.volume };
}

// ─── Volume Profile Summary ───────────────────────────────────────────────────
// Identifies: VPOC, value area (70% of volume), HVN/LVN approximation by
// dividing the price range into 10 buckets and summing volume per bucket.

interface VolProfileSummary {
  vpoc: { price: number; volume: number };
  vah: number;
  val: number;
  highVolumeBuckets: Array<{ priceRange: string; volume: number }>;
  lowVolumeBuckets: Array<{ priceRange: string; volume: number }>;
}

function buildVolumeProfileSummary(
  bars: DeepAnalysisInput['bars'],
): VolProfileSummary {
  if (bars.length === 0) {
    return {
      vpoc: { price: 0, volume: 0 },
      vah: 0,
      val: 0,
      highVolumeBuckets: [],
      lowVolumeBuckets: [],
    };
  }

  const allHighs = bars.map(b => b.high);
  const allLows  = bars.map(b => b.low);
  const rangeHigh = Math.max(...allHighs);
  const rangeLow  = Math.min(...allLows);
  const bucketCount = 10;
  const bucketSize  = (rangeHigh - rangeLow) / bucketCount || 1;

  // Sum volume into price buckets
  const buckets: number[] = new Array(bucketCount).fill(0);
  for (const bar of bars) {
    const mid   = (bar.high + bar.low) / 2;
    const idx   = Math.min(
      bucketCount - 1,
      Math.floor((mid - rangeLow) / bucketSize),
    );
    buckets[idx] += bar.volume;
  }

  const totalVolume = buckets.reduce((a, b) => a + b, 0);

  // VPOC: bucket with highest volume
  let vpocIdx = 0;
  for (let i = 1; i < buckets.length; i++) {
    if (buckets[i] > buckets[vpocIdx]) vpocIdx = i;
  }
  const vpocPrice = rangeLow + vpocIdx * bucketSize + bucketSize / 2;
  const vpocVol   = buckets[vpocIdx];

  // Value area: accumulate 70% of volume starting from VPOC outward
  let accumulated = buckets[vpocIdx];
  let loIdx = vpocIdx;
  let hiIdx = vpocIdx;
  while (accumulated < totalVolume * 0.7 && (loIdx > 0 || hiIdx < bucketCount - 1)) {
    const addLo = loIdx > 0 ? buckets[loIdx - 1] : -1;
    const addHi = hiIdx < bucketCount - 1 ? buckets[hiIdx + 1] : -1;
    if (addLo >= addHi && loIdx > 0) {
      loIdx--;
      accumulated += buckets[loIdx];
    } else if (hiIdx < bucketCount - 1) {
      hiIdx++;
      accumulated += buckets[hiIdx];
    } else {
      break;
    }
  }

  const val = rangeLow + loIdx * bucketSize;
  const vah = rangeLow + (hiIdx + 1) * bucketSize;

  // Label top 3 buckets as HVN, bottom 3 as LVN
  const sortedByVol = buckets
    .map((vol, i) => ({ i, vol }))
    .sort((a, b) => b.vol - a.vol);

  const highVolumeBuckets = sortedByVol.slice(0, 3).map(({ i, vol }) => ({
    priceRange: `${fmtPrice(rangeLow + i * bucketSize)}–${fmtPrice(rangeLow + (i + 1) * bucketSize)}`,
    volume: vol,
  }));
  const lowVolumeBuckets = sortedByVol.slice(-3).map(({ i, vol }) => ({
    priceRange: `${fmtPrice(rangeLow + i * bucketSize)}–${fmtPrice(rangeLow + (i + 1) * bucketSize)}`,
    volume: vol,
  }));

  return {
    vpoc: { price: vpocPrice, volume: vpocVol },
    vah,
    val,
    highVolumeBuckets,
    lowVolumeBuckets,
  };
}

// ─── CVD Trend ────────────────────────────────────────────────────────────────

function describeCvdTrend(bars: DeepAnalysisInput['bars']): string {
  if (bars.length < 2) return 'Insufficient data for CVD trend.';

  const firstCvd  = bars[0].cvd;
  const lastCvd   = bars[bars.length - 1].cvd;
  const cvdChange = lastCvd - firstCvd;
  const direction = cvdChange > 0 ? 'rising' : cvdChange < 0 ? 'falling' : 'flat';

  // Find local peak and trough in CVD series
  let peak   = firstCvd;
  let trough = firstCvd;
  for (const bar of bars) {
    if (bar.cvd > peak)   peak   = bar.cvd;
    if (bar.cvd < trough) trough = bar.cvd;
  }

  return `CVD moved from \`${sign(firstCvd)}${fmtVol(firstCvd)}\` to \`${sign(lastCvd)}${fmtVol(lastCvd)}\` (${direction}, Δ${sign(cvdChange)}${fmtVol(cvdChange)}). Range: peak \`${sign(peak)}${fmtVol(peak)}\` / trough \`${sign(trough)}${fmtVol(trough)}\`.`;
}

// ─── Key Levels From Bar Data ─────────────────────────────────────────────────

function extractKeyLevels(bars: DeepAnalysisInput['bars']): {
  sessionHigh: number;
  sessionLow: number;
  highVolumeHighs: number[];
  highVolumeLows: number[];
} {
  const highs   = bars.map(b => b.high);
  const lows    = bars.map(b => b.low);
  const sessionHigh = Math.max(...highs);
  const sessionLow  = Math.min(...lows);

  // Bars with volume in the top 10%
  const sortedByVol = [...bars].sort((a, b) => b.volume - a.volume);
  const top10Pct    = sortedByVol.slice(0, Math.max(1, Math.floor(bars.length * 0.1)));

  return {
    sessionHigh,
    sessionLow,
    highVolumeHighs: top10Pct.map(b => b.high),
    highVolumeLows:  top10Pct.map(b => b.low),
  };
}

// ─── Main Prompt Builder ──────────────────────────────────────────────────────

export function buildDeepAnalysisPrompt(input: DeepAnalysisInput): string {
  const {
    instrument,
    exchange,
    dataQuality,
    bars,
    currentState,
    userContext,
    timeframe,
  } = input;

  const dataTag = dataQuality === 'true_l2' ? '[True L2]' : '[Inferred]';

  if (bars.length === 0) {
    return `No bar data available for ${instrument}. Cannot perform deep analysis.`;
  }

  // ── Price action summary ──────────────────────────────────────────────────
  const firstBar     = bars[0];
  const lastBar      = bars[bars.length - 1];
  const sessionOpen  = firstBar.open;
  const sessionClose = lastBar.close;
  const allHighs     = bars.map(b => b.high);
  const allLows      = bars.map(b => b.low);
  const sessionHigh  = Math.max(...allHighs);
  const sessionLow   = Math.min(...allLows);
  const rangePct     = ((sessionHigh - sessionLow) / sessionLow) * 100;
  const movePct      = ((sessionClose - sessionOpen) / sessionOpen) * 100;
  const totalVolume  = bars.reduce((sum, b) => sum + b.volume, 0);
  const avgVolume    = totalVolume / bars.length;

  // ── Volume profile ────────────────────────────────────────────────────────
  const volProfile  = buildVolumeProfileSummary(bars);
  const vpoc        = volProfile.vpoc;
  const keyLevels   = extractKeyLevels(bars);

  // ── CVD trend ─────────────────────────────────────────────────────────────
  const cvdTrend = describeCvdTrend(bars);

  // ── High volume zone price clusters ──────────────────────────────────────
  const hvnLine = keyLevels.highVolumeHighs
    .map(p => `\`${fmtPrice(p)}\``)
    .join(', ');
  const lvnLine = keyLevels.highVolumeLows
    .map(p => `\`${fmtPrice(p)}\``)
    .join(', ');

  // ── Sanitized user context ────────────────────────────────────────────────
  const sanitizedContext = userContext
    ? userContext.replace(/[<>]/g, '').slice(0, 500)
    : null;

  return `Deep Order Flow Analysis — ${instrument} (${exchange}) ${dataTag}
Timeframe: ${timeframe} | Bars: ${bars.length} | Analysis window: ${new Date(firstBar.ts).toISOString()} → ${new Date(lastBar.ts).toISOString()}

## 1. Data Quality
${dataQuality === 'true_l2'
  ? 'Data sourced from full Level 2 order book. Delta and CVD values are exact.'
  : 'Data quality is INFERRED — delta and CVD are estimated from trade direction heuristics, not true L2. Treat order flow metrics as directional signals, not precise values.'}

## 2. Price Action Summary (${bars.length} × ${timeframe} bars)
- Session open: \`${fmtPrice(sessionOpen)}\`  /  close: \`${fmtPrice(sessionClose)}\`
- Session move: ${fmtPct(movePct)}
- Range: \`${fmtPrice(sessionLow)}\` – \`${fmtPrice(sessionHigh)}\` (${fmtPct(rangePct)} range)
- Total volume: ${fmtVol(totalVolume)}  |  Average per bar: ${fmtVol(avgVolume)}

Key structural levels from bar extremes:
- Session high: \`${fmtPrice(sessionHigh)}\`  |  Session low: \`${fmtPrice(sessionLow)}\`
- High-volume bar highs (resistance nodes): ${hvnLine}
- High-volume bar lows (support nodes): ${lvnLine}

## 3. Volume Profile (VPOC Approximation)
- VPOC (highest volume price): \`${fmtPrice(vpoc.price)}\` — ${fmtVol(vpoc.volume)} volume transacted
- Value Area High (VAH): \`${fmtPrice(volProfile.vah)}\`
- Value Area Low (VAL): \`${fmtPrice(volProfile.val)}\`
- High Volume Nodes (HVN — area of acceptance):
${volProfile.highVolumeBuckets.map(b => `  • ${b.priceRange} — ${fmtVol(b.volume)}`).join('\n')}
- Low Volume Nodes (LVN — potential fast-move zones):
${volProfile.lowVolumeBuckets.map(b => `  • ${b.priceRange} — ${fmtVol(b.volume)}`).join('\n')}

## 4. CVD Trend Analysis
${cvdTrend}

## 5. Current Market State (live snapshot)
- Last price: \`${fmtPrice(currentState.lastPrice)}\`
- Cumulative Volume Delta (CVD): \`${sign(currentState.cvd)}${fmtVol(currentState.cvd)}\`
- Bar delta: \`${sign(currentState.delta)}${fmtVol(currentState.delta)}\`
- Bid/Ask imbalance ratio: ${currentState.imbalanceRatio.toFixed(2)}× (${currentState.imbalanceRatio >= 1 ? 'bid-dominant' : 'ask-dominant'})
- Bid volume: ${fmtVol(currentState.bidVolume)}  |  Ask volume: ${fmtVol(currentState.askVolume)}

## 6. Regime Context
${currentState.regime
  ? `Current regime: **${currentState.regime.replace(/_/g, ' ').toUpperCase()}**`
  : 'No regime classification available for this instrument.'}

${sanitizedContext ? `## 7. Trader-Provided Context\n${sanitizedContext}\n` : ''}

---

## Analysis Request

You are analyzing ${instrument} on the ${exchange} exchange ${dataTag}. Using the data above, produce a structured order flow analysis covering all four sections below. Maximum 800 words total. Not investment advice.

**A) Structure — Support, Resistance & Volume Nodes**
Identify the most significant price levels acting as support or resistance. Reference the VPOC, VAH, VAL, and HVN/LVN zones. Which levels have the highest confluence (price + volume)?

**B) Order Flow Narrative — Who Is In Control?**
Interpret the CVD trend, bar delta, and imbalance ratio. Are buyers or sellers in control? Is this consistent accumulation/distribution or choppy two-sided trading? Any signs of absorption (price stalling at a level despite heavy volume)?

**C) Forward-Looking — Thesis Confirmation**
What price action and order flow conditions would confirm a bullish thesis? What would confirm a bearish thesis? Include specific price levels and CVD thresholds.

**D) Risk — Thesis Invalidation**
What single event or price move would invalidate the current dominant thesis? Where would a stop logically sit relative to the key levels identified?

Close with: "Not investment advice."`;
}
