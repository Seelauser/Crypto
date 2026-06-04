import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { requireChartLayer } from '@/lib/chart-tier';

export const dynamic = 'force-dynamic';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FootprintLevel {
  price:     number;
  bidVol:    number;
  askVol:    number;
  delta:     number;
  imbalance: number; // askVol / bidVol (>1 means ask-heavy)
}

export interface FootprintBar {
  ts:         number;
  open:       number;
  high:       number;
  low:        number;
  close:      number;
  volume:     number;
  delta:      number;
  cvd:        number;
  pocPrice:   number; // Price of Control (highest volume level)
  levels:     FootprintLevel[];
}

// ─── Seed map (mirrors bars/route.ts) ────────────────────────────────────────

const INSTRUMENT_SEEDS: Record<string, { price: number; volume: number }> = {
  BTCUSDT:  { price: 50000, volume: 800    },
  ETHUSDT:  { price: 3000,  volume: 6000   },
  SOLUSDT:  { price: 150,   volume: 120000 },
  BNBUSDT:  { price: 400,   volume: 18000  },
  XRPUSDT:  { price: 0.60,  volume: 4000000 },
  AVAXUSDT: { price: 38,    volume: 220000 },
  DOTUSDT:  { price: 7.5,   volume: 400000 },
  ADAUSDT:  { price: 0.45,  volume: 3000000 },
  MATICUSDT:{ price: 0.90,  volume: 2000000 },
  LINKUSDT: { price: 14,    volume: 350000 },
  AAPL:     { price: 180,   volume: 55000  },
  NVDA:     { price: 500,   volume: 45000  },
  TSLA:     { price: 240,   volume: 90000  },
  ES:       { price: 5200,  volume: 1500   },
  NQ:       { price: 18500, volume: 800    },
  EURUSD:   { price: 1.08,  volume: 200000 },
  XAUUSD:   { price: 2000,  volume: 3000   },
};

const TIMEFRAME_MINUTES: Record<string, number> = {
  '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240,
};

// ─── PRNG ─────────────────────────────────────────────────────────────────────

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

function hashInstrument(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

function randNorm(rng: () => number): number {
  const u1 = rng(), u2 = rng();
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
}

// ─── Footprint Generation ─────────────────────────────────────────────────────

const LEVELS_PER_BAR = 10; // price levels per footprint bar

function generateFootprintBars(instrument: string, tf: string, limit: number): FootprintBar[] {
  const tfMin    = TIMEFRAME_MINUTES[tf] ?? 5;
  const seed     = hashInstrument(instrument);
  const rng      = seedRng(seed ^ 0xf00d_cafe);
  const seedInfo = INSTRUMENT_SEEDS[instrument] ?? { price: 100, volume: 10000 };

  let price       = seedInfo.price;
  let cvd         = 0;
  const priceVol  = 0.001 * Math.sqrt(tfMin / 5);
  const intervalMs = tfMin * 60 * 1000;
  const startTs   = Date.now() - (limit - 1) * intervalMs;

  const bars: FootprintBar[] = [];

  for (let i = 0; i < limit; i++) {
    const ts    = startTs + i * intervalMs;
    const pct   = randNorm(rng) * priceVol;
    const close = price * (1 + pct);
    const range = price * Math.abs(randNorm(rng)) * priceVol * 0.6;
    const open  = price;
    const high  = Math.max(open, close) + range * rng();
    const low   = Math.min(open, close) - range * rng();
    const totalVol = Math.round(Math.exp(Math.log(seedInfo.volume) + 0.5 * randNorm(rng)));

    // Distribute volume across LEVELS_PER_BAR price buckets
    const levelSize = (high - low) / LEVELS_PER_BAR;
    const levels: FootprintLevel[] = [];
    let barDelta = 0;
    let maxVol   = 0;
    let pocPrice = low;

    const biasRatio = 0.45 + rng() * 0.10; // 0.45–0.55 buy fraction

    for (let l = 0; l < LEVELS_PER_BAR; l++) {
      const lvlPrice = low + (l + 0.5) * levelSize;
      // Volume profile: gaussian-ish peak in the middle
      const distFromMid = Math.abs(l - LEVELS_PER_BAR / 2) / (LEVELS_PER_BAR / 2);
      const volShare = Math.max(0.02, (1 - distFromMid * 0.7) * (0.8 + rng() * 0.4));
      const lvlVol   = Math.max(1, Math.round(totalVol * volShare / LEVELS_PER_BAR));

      const buyVol  = Math.round(lvlVol * (biasRatio + (rng() - 0.5) * 0.2));
      const askVol  = lvlVol - buyVol;
      const delta   = buyVol - askVol;
      const imbalance = askVol > 0 ? buyVol / askVol : 99;

      barDelta += delta;
      if (lvlVol > maxVol) { maxVol = lvlVol; pocPrice = lvlPrice; }

      levels.push({ price: +lvlPrice.toPrecision(8), bidVol: buyVol, askVol, delta, imbalance: +imbalance.toFixed(3) });
    }

    cvd += barDelta;

    bars.push({
      ts,
      open:    +open.toPrecision(8),
      high:    +high.toPrecision(8),
      low:     +low.toPrecision(8),
      close:   +close.toPrecision(8),
      volume:  totalVol,
      delta:   barDelta,
      cvd,
      pocPrice: +pocPrice.toPrecision(8),
      levels,
    });

    price = close;
  }

  return bars;
}

// ─── Volume Profile (VPOC / VAH / VAL) ───────────────────────────────────────

function computeVolumeProfile(bars: FootprintBar[]): { vpoc: number; vah: number; val: number } {
  const volByPrice: Record<number, number> = {};

  for (const bar of bars) {
    for (const lvl of bar.levels) {
      const bucket = Math.round(lvl.price * 100) / 100;
      volByPrice[bucket] = (volByPrice[bucket] ?? 0) + lvl.bidVol + lvl.askVol;
    }
  }

  const entries = Object.entries(volByPrice)
    .map(([p, v]) => ({ price: parseFloat(p), vol: v }))
    .sort((a, b) => a.price - b.price);

  if (entries.length === 0) return { vpoc: 0, vah: 0, val: 0 };

  const totalVol = entries.reduce((s, e) => s + e.vol, 0);
  const vpoc     = entries.reduce((best, e) => e.vol > best.vol ? e : best, entries[0]).price;

  // Value Area = levels covering 70% of total volume around VPOC
  const vaTarget = totalVol * 0.70;
  const vpocIdx  = entries.findIndex(e => e.price === vpoc);

  let lo = vpocIdx, hi = vpocIdx, accVol = entries[vpocIdx]?.vol ?? 0;
  while (accVol < vaTarget && (lo > 0 || hi < entries.length - 1)) {
    const addLo = lo > 0 ? entries[lo - 1].vol : -Infinity;
    const addHi = hi < entries.length - 1 ? entries[hi + 1].vol : -Infinity;
    if (addLo >= addHi) { lo--; accVol += entries[lo].vol; }
    else                { hi++; accVol += entries[hi].vol; }
  }

  return { vpoc, val: entries[lo].price, vah: entries[hi].price };
}

// ─── Real footprint_bars → FootprintBar mapper ───────────────────────────────

interface FootprintRow {
  ts: number; open: number; high: number; low: number; close: number;
  buy_vol: number; sell_vol: number; delta: number;
  levels: Record<string, { buy: number; sell: number }> | null;
}

function mapDbRows(rows: FootprintRow[]): FootprintBar[] {
  const asc = [...rows].reverse(); // query returns DESC; CVD accumulates forward
  let cvd = 0;
  return asc.map(r => {
    const levelsObj = (r.levels ?? {}) as Record<string, { buy: number; sell: number }>;
    const levels: FootprintLevel[] = Object.entries(levelsObj)
      .map(([p, v]) => {
        const bidVol = Number(v.buy) || 0;
        const askVol = Number(v.sell) || 0;
        return { price: parseFloat(p), bidVol, askVol, delta: bidVol - askVol, imbalance: askVol > 0 ? +(bidVol / askVol).toFixed(3) : 99 };
      })
      .sort((a, b) => a.price - b.price);

    let maxVol = -1;
    let pocPrice = levels[0]?.price ?? Number(r.close);
    for (const l of levels) { const v = l.bidVol + l.askVol; if (v > maxVol) { maxVol = v; pocPrice = l.price; } }

    const delta = Number(r.delta) || 0;
    cvd += delta;
    return {
      ts: Number(r.ts), open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
      volume: (Number(r.buy_vol) || 0) + (Number(r.sell_vol) || 0), delta, cvd, pocPrice, levels,
    };
  });
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ instrument: string }> },
) {
  // Footprint is a Starter+ chart layer.
  const session = await auth();
  const gate = requireChartLayer(session, 'footprint_chart', 'footprint');
  if (gate) return gate;

  const { instrument } = await params;
  const { searchParams } = new URL(req.url);

  const tf    = searchParams.get('tf')    ?? '5m';
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '30', 10)));

  if (!TIMEFRAME_MINUTES[tf]) {
    return NextResponse.json(
      { error: 'invalid_timeframe', supported: Object.keys(TIMEFRAME_MINUTES) },
      { status: 400 },
    );
  }

  const upper = instrument.toUpperCase();

  // Prefer real footprint_bars (the footprint publisher); fall back to a
  // deterministic synthetic profile for instruments with no ingest yet.
  let bars: FootprintBar[] = [];
  let source: 'live' | 'synthetic' = 'synthetic';
  try {
    // Pin to a single exchange (the one with the freshest data for this
    // instrument) so bars from different venues don't interleave at the same ts.
    const rows = await db.$queryRaw<FootprintRow[]>`
      SELECT extract(epoch from ts) * 1000 AS ts,
             open::float8, high::float8, low::float8, close::float8,
             buy_vol::float8, sell_vol::float8, delta::float8, levels
      FROM footprint_bars
      WHERE instrument = ${upper} AND timeframe = ${tf}
        AND exchange = (
          SELECT exchange FROM footprint_bars
          WHERE instrument = ${upper} AND timeframe = ${tf}
          ORDER BY ts DESC LIMIT 1
        )
      ORDER BY ts DESC
      LIMIT ${limit}
    `;
    if (rows.length > 0) {
      bars = mapDbRows(rows);
      source = 'live';
    }
  } catch { /* table/query issue — fall back to synthetic */ }

  if (bars.length === 0) {
    bars = generateFootprintBars(upper, tf, limit);
  }

  const vp = computeVolumeProfile(bars);

  return NextResponse.json(
    { instrument: upper, timeframe: tf, source, bars, ...vp },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
