import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import redis from '@/lib/redis';
import { ASSET_CLASSES } from '@/lib/regimes';
import type { MarketRegime } from '@orderflow/types';

type RegimeDatum = {
  regime: MarketRegime;
  confidence: number;
  instrument: string;
  ts: number;
} | null;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Pre-fill all keys with null so the response shape is always complete.
  const regimes = Object.fromEntries(ASSET_CLASSES.map(ac => [ac, null])) as Record<string, RegimeDatum>;

  try {
    const raw = await redis.hgetall('market:regime');
    for (const ac of ASSET_CLASSES) {
      const val = raw?.[ac];
      if (val) {
        try { regimes[ac] = JSON.parse(val); } catch { /* stays null */ }
      }
    }
  } catch { /* Redis unavailable — all nulls returned */ }

  return NextResponse.json({ regimes, ts: Date.now() });
}
