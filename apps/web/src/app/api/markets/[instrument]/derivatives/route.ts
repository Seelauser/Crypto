import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import redis from '@/lib/redis';
import { canUseFeature } from '@/lib/limits';
import type { UserTier } from '@orderflow/types';

// Derivatives metrics (rework spec §10.1 / P4-4) — current funding rate, mark
// price and open interest from the keyless Binance-futures publisher
// (market:derivatives Redis hash). Starter+ (the OI/funding overlay layer).
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ instrument: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tier = ((session.user as any).tier ?? 'free') as UserTier;
  // Funding/OI overlay rides the Starter+ chart-layer gate.
  if (!canUseFeature(tier, 'footprint_chart')) {
    return NextResponse.json({ error: 'tier_gate', feature: 'derivatives', tierRequired: 'starter', upgradeUrl: '/billing/upgrade?from=derivatives' }, { status: 403 });
  }

  const { instrument } = await params;

  let current: Record<string, unknown> | null = null;
  try {
    const raw = await redis.hget('market:derivatives', instrument);
    if (raw) current = JSON.parse(raw);
  } catch { /* Redis unavailable */ }

  return NextResponse.json({
    instrument,
    current,                     // { funding_rate, mark_price, open_interest, ts } | null
    available: current != null,  // false until the derivatives publisher has data for this symbol
    ts: Date.now(),
  });
}
