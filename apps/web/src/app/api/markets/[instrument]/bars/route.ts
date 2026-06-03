import { NextRequest, NextResponse } from 'next/server';
import type { OhlcvBar } from '@orderflow/types';
import { db } from '@/lib/db';

// ─── Instrument Seed Prices (for synthetic fallback) ─────────────────────────

const INSTRUMENT_SEEDS: Record<string, { price: number; volume: number; exchange: string }> = {
  // Crypto
  BTCUSDT:  { price: 50000,  volume: 800,    exchange: 'binance' },
  ETHUSDT:  { price: 3000,   volume: 6000,   exchange: 'binance' },
  SOLUSDT:  { price: 150,    volume: 120000, exchange: 'binance' },
  BNBUSDT:  { price: 400,    volume: 18000,  exchange: 'binance' },
  XRPUSDT:  { price: 0.60,   volume: 4000000, exchange: 'binance' },
  AVAXUSDT: { price: 38,     volume: 220000, exchange: 'binance' },
  DOTUSDT:  { price: 7.5,    volume: 400000, exchange: 'binance' },
  ADAUSDT:  { price: 0.45,   volume: 3000000, exchange: 'binance' },
  MATICUSDT:{ price: 0.90,   volume: 2000000, exchange: 'binance' },
  LINKUSDT: { price: 14,     volume: 350000, exchange: 'binance' },

  // US Stocks
  AAPL:     { price: 180,    volume: 55000,  exchange: 'alpaca' },
  NVDA:     { price: 500,    volume: 45000,  exchange: 'alpaca' },
  TSLA:     { price: 240,    volume: 90000,  exchange: 'alpaca' },
  MSFT:     { price: 370,    volume: 25000,  exchange: 'alpaca' },
  AMZN:     { price: 185,    volume: 35000,  exchange: 'alpaca' },
  GOOGL:    { price: 165,    volume: 20000,  exchange: 'alpaca' },
  META:     { price: 490,    volume: 15000,  exchange: 'alpaca' },
  AMD:      { price: 160,    volume: 60000,  exchange: 'alpaca' },
  INTC:     { price: 35,     volume: 45000,  exchange: 'alpaca' },
  NFLX:     { price: 680,    volume: 8000,   exchange: 'alpaca' },

  // Futures
  ES:       { price: 5200,   volume: 1500,   exchange: 'cme' },
  NQ:       { price: 18500,  volume: 800,    exchange: 'cme' },
  RTY:      { price: 2100,   volume: 1200,   exchange: 'cme' },
  YM:       { price: 39000,  volume: 500,    exchange: 'cme' },
  CL:       { price: 78,     volume: 6000,   exchange: 'cme' },
  GC:       { price: 2000,   volume: 3000,   exchange: 'cme' },
  SI:       { price: 26,     volume: 9000,   exchange: 'cme' },

  // Forex
  EURUSD:   { price: 1.08,   volume: 200000, exchange: 'oanda' },
  GBPUSD:   { price: 1.27,   volume: 120000, exchange: 'oanda' },
  USDJPY:   { price: 149.5,  volume: 180000, exchange: 'oanda' },
  USDCHF:   { price: 0.895,  volume: 80000,  exchange: 'oanda' },
  AUDUSD:   { price: 0.655,  volume: 95000,  exchange: 'oanda' },
  NZDUSD:   { price: 0.605,  volume: 50000,  exchange: 'oanda' },

  // Commodities / Resources
  XAUUSD:   { price: 2000,   volume: 3000,   exchange: 'comex' },
  XAGUSD:   { price: 26,     volume: 9000,   exchange: 'comex' },
  USOIL:    { price: 78,     volume: 6000,   exchange: 'nymex' },
  NATGAS:   { price: 2.5,    volume: 40000,  exchange: 'nymex' },
  COPPER:   { price: 3.9,    volume: 25000,  exchange: 'comex' },
  WHEAT:    { price: 550,    volume: 15000,  exchange: 'cbot' },
  CORN:     { price: 430,    volume: 20000,  exchange: 'cbot' },
};

// ─── Timeframe → minutes + TimescaleDB bucket interval ───────────────────────

const TIMEFRAME_MINUTES: Record<string, number> = {
  '1m':  1,
  '5m':  5,
  '15m': 15,
  '1h':  60,
  '4h':  240,
  '1d':  1440,
};

const TIMEFRAME_BUCKET: Record<string, string> = {
  '1m':  '1 minute',
  '5m':  '5 minutes',
  '15m': '15 minutes',
  '1h':  '1 hour',
  '4h':  '4 hours',
  '1d':  '1 day',
};

// Timeframes with a dedicated continuous aggregate view in TimescaleDB.
// Other timeframes (4h, 1d) roll up from ohlcv_1h at query time.
const CAGG_VIEW: Record<string, string> = {
  '1m':  'ohlcv_1m',
  '5m':  'ohlcv_5m',
  '15m': 'ohlcv_15m',
  '1h':  'ohlcv_1h',
};

// ─── Real bars from TimescaleDB continuous aggregates ─────────────────────────

interface RawBar {
  bucket_ts: Date;
  open:   string;
  high:   string;
  low:    string;
  close:  string;
  volume: string;
  delta:  string;
}

async function fetchRealBars(
  instrument: string,
  timeframe: string,
  limit: number,
): Promise<OhlcvBar[] | null> {
  const bucket   = TIMEFRAME_BUCKET[timeframe];
  const minutes  = TIMEFRAME_MINUTES[timeframe];
  if (!bucket || !minutes) return null;

  // Window covers (limit + a small buffer) bars to compensate for empty
  // buckets — request a few extra so we still return up to `limit` after
  // the LIMIT clause trims them.
  const windowMin = (limit + 8) * minutes;

  const view = CAGG_VIEW[timeframe];

  // Both `view` and `bucket` are sourced from fixed whitelists above —
  // no injection risk. Numeric inputs use parameterised values.
  const sql = view
    ? // Fast path: direct read from the pre-aggregated view.
      `
      SELECT
        bucket           AS bucket_ts,
        open::text       AS open,
        high::text       AS high,
        low::text        AS low,
        close::text      AS close,
        volume::text     AS volume,
        delta::text      AS delta
      FROM ${view}
      WHERE instrument = $1
        AND bucket >= NOW() - ($2 || ' minutes')::interval
      ORDER BY bucket DESC
      LIMIT $3
      `
    : // Roll-up path: 4h / 1d aggregated from the 1h CAGG on demand.
      `
      SELECT
        time_bucket('${bucket}'::interval, bucket) AS bucket_ts,
        first(open,  bucket)::text  AS open,
        max(high)::text              AS high,
        min(low)::text               AS low,
        last(close, bucket)::text    AS close,
        sum(volume)::text            AS volume,
        sum(delta)::text             AS delta
      FROM ohlcv_1h
      WHERE instrument = $1
        AND bucket >= NOW() - ($2 || ' minutes')::interval
      GROUP BY bucket_ts
      ORDER BY bucket_ts DESC
      LIMIT $3
      `;

  const rows = await db.$queryRawUnsafe<RawBar[]>(
    sql,
    instrument,
    String(windowMin),
    limit,
  );

  if (rows.length === 0) return null;

  // Rows are descending; reverse to ascending for charts + CVD accumulation.
  rows.reverse();

  let cvd = 0;
  const bars: OhlcvBar[] = rows.map(r => {
    const delta = parseFloat(r.delta);
    cvd += delta;
    return {
      instrument,
      exchange: 'binance',
      ts:        r.bucket_ts.getTime(),
      timeframe,
      open:   parseFloat(r.open),
      high:   parseFloat(r.high),
      low:    parseFloat(r.low),
      close:  parseFloat(r.close),
      volume: parseFloat(r.volume),
      delta,
      cvd,
    };
  });

  return bars;
}

// ─── Synthetic fallback (Seeded PRNG + Box-Muller) ───────────────────────────

function seedRng(seed: number) {
  let s = seed;
  return function(): number {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function instrumentSeed(instrument: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < instrument.length; i++) {
    h ^= instrument.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function randNorm(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
}

function randLogNorm(rng: () => number, mean: number, sigma: number): number {
  return mean * Math.exp(sigma * randNorm(rng));
}

function generateSyntheticBars(
  instrument: string,
  timeframe: string,
  limit: number,
): OhlcvBar[] {
  const tf = TIMEFRAME_MINUTES[timeframe] ?? 5;
  const seed = instrumentSeed(instrument);
  const rng  = seedRng(seed ^ (limit << 16) ^ (tf << 8));

  const seedInfo = INSTRUMENT_SEEDS[instrument.toUpperCase()];
  let   price    = seedInfo?.price ?? (100 + (seed % 9900));
  const baseVol  = seedInfo?.volume ?? 10000;
  const exchange = seedInfo?.exchange ?? 'unknown';

  const volScale = Math.sqrt(tf / 5);
  const priceVol = 0.001 * volScale;

  let cvd = 0;

  const now = Date.now();
  const intervalMs = tf * 60 * 1000;
  const startTs = now - (limit - 1) * intervalMs;

  const bars: OhlcvBar[] = [];

  for (let i = 0; i < limit; i++) {
    const ts = startTs + i * intervalMs;

    const pct    = randNorm(rng) * priceVol;
    const close  = price * (1 + pct);

    const rangeVol = Math.abs(randNorm(rng)) * priceVol * 0.6;
    const range    = price * rangeVol;
    const open     = price;
    const high     = Math.max(open, close) + range * rng();
    const low      = Math.min(open, close) - range * rng();

    const volume = Math.round(randLogNorm(rng, baseVol, 0.5));

    const biasBlock = Math.floor(i / 20) % 3;
    const biasRatio = biasBlock === 0 ? 0.55 : biasBlock === 1 ? 0.45 : 0.50;
    const buyVol  = Math.round(volume * (biasRatio + (rng() - 0.5) * 0.15));
    const sellVol = volume - buyVol;
    const delta   = buyVol - sellVol;
    cvd          += delta;

    bars.push({
      instrument: instrument.toUpperCase(),
      exchange,
      ts,
      timeframe,
      open:   +open.toPrecision(8),
      high:   +high.toPrecision(8),
      low:    +low.toPrecision(8),
      close:  +close.toPrecision(8),
      volume,
      delta,
      cvd,
    });

    price = close;
  }

  return bars;
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ instrument: string }> },
) {
  const { instrument } = await params;
  const { searchParams } = new URL(req.url);

  const tf    = searchParams.get('tf')    ?? '5m';
  const limit = Math.min(2000, Math.max(1, parseInt(searchParams.get('limit') ?? '200', 10)));

  if (!TIMEFRAME_MINUTES[tf]) {
    return NextResponse.json(
      { error: 'invalid_timeframe', supported: Object.keys(TIMEFRAME_MINUTES) },
      { status: 400 },
    );
  }

  const upper = instrument.toUpperCase();

  // Try real data first; fall back to synthetic if the hypertable has none
  // for this instrument yet.
  let bars: OhlcvBar[] | null = null;
  let source: 'live' | 'synthetic' = 'synthetic';
  try {
    bars = await fetchRealBars(upper, tf, limit);
    if (bars && bars.length > 0) source = 'live';
  } catch (err) {
    // DB unreachable — drop into synthetic
    console.error('bars: real-data query failed, falling back to synthetic', err);
    bars = null;
  }

  if (!bars || bars.length === 0) {
    bars = generateSyntheticBars(upper, tf, limit);
  }

  const exchange = bars[0]?.exchange
    ?? INSTRUMENT_SEEDS[upper]?.exchange
    ?? 'unknown';

  return NextResponse.json(
    { instrument: upper, exchange, timeframe: tf, source, bars },
    {
      headers: {
        'Cache-Control': source === 'live'
          ? 's-maxage=5, stale-while-revalidate=10'   // tighter cache for real data
          : (tf === '1m'
              ? 's-maxage=10, stale-while-revalidate=20'
              : 's-maxage=60, stale-while-revalidate=120'),
      },
    },
  );
}
