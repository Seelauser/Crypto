import type { UserTier } from '@orderflow/types';

// ─── Tier ranking ─────────────────────────────────────────────────────────────
// Single source of truth for "is tier A at least tier B". Use `tierAtLeast`
// for any "this needs a paid plan" gate so the three tiers stay ordered in one
// place rather than scattered `=== 'pro'` comparisons.

export const TIER_RANK: Record<UserTier, number> = { free: 0, starter: 1, pro: 2 };

export function tierAtLeast(userTier: UserTier, required: UserTier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[required];
}

/**
 * Map any legacy/unknown tier string to a valid UserTier. The pre-rework enum
 * used 'premium'; a stale JWT or row could still carry it during rollout, so we
 * fold 'premium' → 'pro' (the behavior-preserving target) and anything else → 'free'.
 */
export function normalizeTier(tier: string | null | undefined): UserTier {
  if (tier === 'pro' || tier === 'premium') return 'pro';
  if (tier === 'starter') return 'starter';
  return 'free';
}

// ─── Feature limits ───────────────────────────────────────────────────────────
// `pro` is the superset (identical to the old `premium`), so existing paid
// users migrated premium→pro keep every feature. `starter` is the new middle
// tier (see ORDERFLOW BEAST REWORK MASTER §3.1).

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
    ai_models_allowed: ['claude-haiku-4-5-20251001'] as string[],
    footprint_chart: false,
    dom_ladder: false,
    heatmap: false,
    api_access: false,
    webhook_outbound: false,
    csv_export: false,
    workspaces_max: 1,
    charts_per_workspace_max: 1,
  },
  starter: {
    signal_setups_max: Infinity,
    instruments_per_setup_max: 10,
    scans_per_24h: 10,
    scan_scope: 'cross_market' as const,
    watchlists_max: Infinity,
    watchlist_instruments_max: Infinity,
    // Telegram + outbound webhook are Pro-only (§3.1, §12.2).
    notification_channels: ['email', 'browser_push'] as string[],
    refresh_latency_seconds: 0,
    history_days: 30,
    // Starter AI = Haiku quota only (§3.1).
    ai_calls_per_day: 10,
    ai_models_allowed: ['claude-haiku-4-5-20251001'] as string[],
    footprint_chart: true,
    dom_ladder: true,
    heatmap: true,
    api_access: false,
    webhook_outbound: false,
    csv_export: false,
    workspaces_max: 3,
    charts_per_workspace_max: 10,
  },
  pro: {
    signal_setups_max: Infinity,
    instruments_per_setup_max: Infinity,
    scans_per_24h: Infinity,
    scan_scope: 'cross_market' as const,
    watchlists_max: Infinity,
    watchlist_instruments_max: Infinity,
    notification_channels: ['email', 'browser_push', 'telegram', 'webhook'] as string[],
    refresh_latency_seconds: 0,
    history_days: Infinity,
    ai_calls_per_day: Infinity,
    ai_models_allowed: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-8'] as string[],
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

/**
 * Standard tier-gate error body. `tierRequired` defaults to 'pro' (the
 * behavior-preserving default for gates that were `=== 'pro'`); pass
 * 'starter' for middle-tier features.
 */
export function buildTierGateError(
  feature: string,
  upgradeSlug: string,
  tierRequired: UserTier = 'pro',
) {
  const tierLabel = tierRequired === 'pro' ? 'Pro' : 'Starter';
  return {
    error: 'tier_gate',
    message: `This feature requires a ${tierLabel} subscription.`,
    feature,
    tierRequired,
    upgradeUrl: `/billing/upgrade?from=${upgradeSlug}`,
  };
}
