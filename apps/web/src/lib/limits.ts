import type { UserTier } from '@orderflow/types';

export const LIMITS = {
  free: {
    signal_setups_max: 3,
    instruments_per_setup_max: 5,
    scans_per_24h: 10,
    scan_scope: 'single_market' as const,
    watchlists_max: 1,
    watchlist_instruments_max: 15,
    notification_channels: ['email', 'browser_push'] as string[],
    refresh_latency_seconds: 60,
    history_days: 7,
    ai_calls_per_day: 10,
    ai_models_allowed: ['claude-haiku-4-5'] as string[],
    footprint_chart: false,
    dom_ladder: false,
    heatmap: false,
    api_access: false,
    webhook_outbound: false,
    csv_export: false,
    workspaces_max: 1,
    charts_per_workspace_max: 1,
  },
  premium: {
    signal_setups_max: Infinity,
    instruments_per_setup_max: 10,
    scans_per_24h: Infinity,
    scan_scope: 'cross_market' as const,
    watchlists_max: Infinity,
    watchlist_instruments_max: Infinity,
    notification_channels: ['email', 'browser_push', 'telegram', 'webhook'] as string[],
    refresh_latency_seconds: 0,
    history_days: Infinity,
    ai_calls_per_day: Infinity,
    ai_models_allowed: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7'] as string[],
    footprint_chart: true,
    dom_ladder: true,
    heatmap: true,
    api_access: true,
    webhook_outbound: true,
    csv_export: true,
    workspaces_max: 5,
    charts_per_workspace_max: 20,
  },
} as const;

export type Limits = typeof LIMITS;

export function getLimits(tier: UserTier) {
  return LIMITS[tier];
}

export function canUseFeature(tier: UserTier, feature: keyof typeof LIMITS.free): boolean {
  const limits = getLimits(tier);
  const val = limits[feature];
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val > 0;
  return true;
}

export function buildTierGateError(feature: string, upgradeSlug: string) {
  return {
    error: 'tier_gate',
    message: `This feature requires a Pro subscription.`,
    feature,
    tierRequired: 'premium' as UserTier,
    upgradeUrl: `/billing/upgrade?from=${upgradeSlug}`,
  };
}
