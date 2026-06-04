import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { canUseFeature } from '@/lib/limits';
import type { UserTier } from '@orderflow/types';

// Volume profile (rework spec §10.1 / P4-3). Computes VPOC / VAH / VAL from
// recent OHLCV bars, server-side. Starter+ (volume profile is a paid layer).
export const dynamic = 'force-dynamic';

const BUCKETS = 48;
const VALUE_AREA = 0.70; // 70% of volume around the POC

export async function GET(req: NextRequest, { params }: { params: Promise<{ instrument: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tier = ((session.user as any).tier ?? 'free') as UserTier;
  if (!canUseFeature(tier, 'footprint_chart')) {
    // Volume profile rides the same Starter+ chart-layer gate as footprint.
    return NextResponse.json({ error: 'tier_gate', feature: 'volume_profile', tierRequired: 'starter', upgradeUrl: '/billing/upgrade?from=volume_profile' }, { status: 403 });
  }

  const { instrument } = await params;

  let rows: Array<{ close: number; volume: number; low: number; high: number }> = [];
  try {
    rows = await db.$queryRaw<Array<{ close: number; volume: number; low: number; high: number }>>`
      SELECT close::float8 AS close, volume::float8 AS volume, low::float8 AS low, high::float8 AS high
      FROM ohlcv_bars
      WHERE instrument = ${instrument}
      ORDER BY ts DESC
      LIMIT 500
    `;
  } catch {
    return NextResponse.json({ instrument, poc: null, vah: null, val: null, profile: [], note: 'no data' });
  }

  if (rows.length === 0) {
    return NextResponse.json({ instrument, poc: null, vah: null, val: null, profile: [] });
  }

  const lo = Math.min(...rows.map(r => r.low ?? r.close));
  const hi = Math.max(...rows.map(r => r.high ?? r.close));
  const span = hi - lo || 1;
  const step = span / BUCKETS;

  const vol = new Array(BUCKETS).fill(0);
  for (const r of rows) {
    const idx = Math.min(BUCKETS - 1, Math.max(0, Math.floor(((r.close - lo) / span) * BUCKETS)));
    vol[idx] += r.volume ?? 0;
  }

  const totalVol = vol.reduce((a, b) => a + b, 0);
  const pocIdx = vol.indexOf(Math.max(...vol));
  const priceAt = (i: number) => +(lo + (i + 0.5) * step).toFixed(8);

  // Value area: expand out from the POC until 70% of volume is covered.
  let loIdx = pocIdx, hiIdx = pocIdx, covered = vol[pocIdx];
  while (covered < totalVol * VALUE_AREA && (loIdx > 0 || hiIdx < BUCKETS - 1)) {
    const below = loIdx > 0 ? vol[loIdx - 1] : -1;
    const above = hiIdx < BUCKETS - 1 ? vol[hiIdx + 1] : -1;
    if (above >= below) { hiIdx++; covered += Math.max(0, above); }
    else { loIdx--; covered += Math.max(0, below); }
  }

  return NextResponse.json({
    instrument,
    poc: priceAt(pocIdx),
    vah: priceAt(hiIdx),
    val: priceAt(loIdx),
    profile: vol.map((v, i) => ({ price: priceAt(i), volume: +v.toFixed(4) })),
    bars: rows.length,
    ts: Date.now(),
  });
}
