import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { canUseFeature } from '@/lib/limits';
import type { UserTier } from '@orderflow/types';

// Order-book snapshot history (rework spec §10.1 / P4-2) — feeds the order-book
// heatmap background. Starter+ (heatmap is a paid layer). Reads the
// order_book_snapshots hypertable.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ instrument: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tier = ((session.user as any).tier ?? 'free') as UserTier;
  if (!canUseFeature(tier, 'heatmap')) {
    return NextResponse.json({ error: 'tier_gate', feature: 'orderbook_heatmap', tierRequired: 'starter', upgradeUrl: '/billing/upgrade?from=heatmap' }, { status: 403 });
  }

  const { instrument } = await params;
  const exchange = req.nextUrl.searchParams.get('exchange') ?? 'binance';
  const limit = Math.min(300, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '60', 10) || 60));

  let rows: Array<{ ts: Date; bids: unknown; asks: unknown }> = [];
  try {
    rows = await db.$queryRaw<Array<{ ts: Date; bids: unknown; asks: unknown }>>`
      SELECT ts, bids, asks
      FROM order_book_snapshots
      WHERE instrument = ${instrument} AND exchange = ${exchange}
      ORDER BY ts DESC
      LIMIT ${limit}
    `;
  } catch {
    return NextResponse.json({ instrument, exchange, snapshots: [], note: 'no data' });
  }

  const snapshots = rows
    .map(r => ({ ts: r.ts.getTime(), bids: r.bids, asks: r.asks }))
    .sort((a, b) => a.ts - b.ts);

  return NextResponse.json({ instrument, exchange, count: snapshots.length, snapshots, ts: Date.now() });
}
