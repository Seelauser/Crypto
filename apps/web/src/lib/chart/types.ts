// Shared types for the order-flow chart engine + placement signal engine.
// See ORDERFLOW BEAST REWORK MASTER §8–§9.

export type PlacementDirection = 'long' | 'short' | 'neutral';

export type PlacementTriggerType =
  | 'cvd_divergence'
  | 'sweep_with_absorption'
  | 'delta_exhaustion'
  | 'ob_wall_flip'
  | 'dark_pool_confluence'
  | 'large_print_cluster'
  | 'imbalance_extreme'
  | 'liquidation_approach'
  | 'cvd_cross'
  | 'funding_extreme';

/** Per-trigger weights and minimum tier (rework spec §9.1). */
export const TRIGGER_WEIGHTS: Record<PlacementTriggerType, number> = {
  cvd_divergence:        25,
  sweep_with_absorption: 22,
  delta_exhaustion:      18,
  ob_wall_flip:          15,
  dark_pool_confluence:  15,
  large_print_cluster:   12,
  imbalance_extreme:     10,
  liquidation_approach:  10,
  cvd_cross:             8,
  funding_extreme:       8,
};

export const TRIGGER_MIN_TIER: Record<PlacementTriggerType, 'free' | 'starter' | 'pro'> = {
  cvd_divergence:        'free',
  sweep_with_absorption: 'starter',
  delta_exhaustion:      'starter',
  ob_wall_flip:          'starter',
  dark_pool_confluence:  'pro',
  large_print_cluster:   'free',
  imbalance_extreme:     'starter',
  liquidation_approach:  'starter',
  cvd_cross:             'free',
  funding_extreme:       'starter',
};

/** Sum of all weights — the denominator for confidence scoring (§9.1). */
export const MAX_WEIGHT_SUM = Object.values(TRIGGER_WEIGHTS).reduce((a, b) => a + b, 0); // 143

/** Minimum confidence to emit a marker. */
export const EMIT_THRESHOLD = 30;

export interface PlacementTrigger {
  type:   PlacementTriggerType;
  weight: number;
  /** Human-readable reason this trigger fired (shown in the tooltip). */
  detail: string;
}

export interface PlacementSignal {
  instrument: string;
  direction:  PlacementDirection;
  /** 0–100. */
  confidence: number;
  /** 0 = below emit threshold; 1 small, 2 medium (Haiku on hover), 3 large (auto AI). */
  strength:   0 | 1 | 2 | 3;
  triggers:   PlacementTrigger[];
  cvd:        number;
  regime:     string | null;
  ts:         number;
}

/**
 * Everything the engine can score on. Every field is optional except the
 * instrument — the engine fires only the triggers whose inputs are present,
 * so it degrades gracefully as more data sources come online (footprint,
 * derivatives, on-chain are wired in later phases).
 */
export interface PlacementInputs {
  instrument:     string;
  cvd:            number;
  /** Prior CVD value, for zero-cross detection. */
  cvdPrev?:       number | null;
  /** Output of the divergence detector for this instrument. */
  divergence?:    { kind: 'bullish' | 'bearish'; strength?: number } | null;
  /** Recent large prints (for cluster detection). */
  largePrints?:   { side: 'buy' | 'sell'; notionalUsd: number; ts: number }[];
  /** Most recent sweep, if any. */
  sweep?:         { side: 'buy' | 'sell'; absorbed?: boolean } | null;
  /** Top-of-book imbalance. */
  imbalance?:     { ratio: number; dominant: 'bid' | 'ask' } | null;
  regime?:        string | null;
  ts?:            number;
}
