import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import redis from '@/lib/redis';
import type { UserTier } from '@orderflow/types';

// Chart marker feed (rework spec §10.1 / P4-8). Returns the points the chart
// overlays as markers for one instrument: the user's own recent signal events,
// plus CVD/price divergences (a Starter+ layer). Read-only, existing data.
export const dynamic = 'force-dynamic';

interface ChartMarker {
  ts:    number;
  kind:  'signal' | 'divergence';
  label: string;
  side?: 'long' | 'short' | 'neutral';
  price?: number | null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const tier   = ((session.user as any).tier ?? 'free') as UserTier;

  const instrument = req.nextUrl.searchParams.get('instrument');
  if (!instrument) {
    return NextResponse.json({ error: 'Missing instrument' }, { status: 400 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const markers: ChartMarker[] = [];

  // 1. The user's own triggered signal events on this instrument (last 24h).
  try {
    const events = await db.signalEvent.findMany({
      where:   { userId, instrument, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take:    50,
      select:  { createdAt: true, snapshot: true },
    });
    for (const e of events) {
      const snap = (e.snapshot ?? {}) as Record<string, any>;
      markers.push({
        ts:    e.createdAt.getTime(),
        kind:  'signal',
        label: String(snap.triggerType ?? 'signal').replace(/_/g, ' '),
        price: typeof snap.price === 'number' ? snap.price : null,
        side:  snap.side === 'buy' ? 'long' : snap.side === 'sell' ? 'short' : 'neutral',
      });
    }
  } catch { /* DB hiccup — still return divergences */ }

  // 2. Divergence markers (Starter+ layer, §8.3).
  if (tier !== 'free') {
    try {
      const raw = await redis.lrange('market:divergences', 0, 49);
      for (const entry of raw) {
        let d: Record<string, any>;
        try { d = JSON.parse(entry); } catch { continue; }
        if (d.instrument !== instrument) continue;
        markers.push({
          ts:    d.ts,
          kind:  'divergence',
          label: `${d.kind} divergence`,
          price: typeof d.price_extreme === 'number' ? d.price_extreme : null,
          side:  d.kind === 'bullish' ? 'long' : d.kind === 'bearish' ? 'short' : 'neutral',
        });
      }
    } catch { /* Redis unavailable — return what we have */ }
  }

  markers.sort((a, b) => a.ts - b.ts);
  return NextResponse.json({ instrument, markers, ts: Date.now() });
}
