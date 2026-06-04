import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { canUseFeature, LIMITS } from '@/lib/limits';
import type { UserTier } from '@orderflow/types';

// Shared chart-data-route tier guard (rework spec P2-2). Centralises the
// auth + Starter/Pro layer check the chart-data routes were each inlining.

export function sessionTier(session: Session | null): UserTier {
  return ((session?.user as any)?.tier ?? 'free') as UserTier;
}

/**
 * Guard a chart-data route by a limits.ts feature flag. Returns a ready-to-send
 * 401/403 NextResponse to short-circuit on, or `null` when the request is
 * allowed to proceed.
 *
 *   const gate = requireChartLayer(session, 'heatmap', 'orderbook_heatmap');
 *   if (gate) return gate;
 */
export function requireChartLayer(
  session: Session | null,
  feature: keyof typeof LIMITS.free,
  slug: string,
): NextResponse | null {
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!canUseFeature(sessionTier(session), feature)) {
    return NextResponse.json(
      { error: 'tier_gate', feature: slug, tierRequired: 'starter', upgradeUrl: `/billing/upgrade?from=${slug}` },
      { status: 403 },
    );
  }
  return null;
}
