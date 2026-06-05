// placementEngine.ts — the order-flow placement signal scoring engine.
//
// The core product differentiator (rework spec §9). Pure + deterministic:
// given a snapshot of order-flow inputs it returns a confidence-scored
// directional placement read. No I/O, no React — trivially unit-testable and
// reusable from both the API route and (later) the client chart.

import {
  EMIT_THRESHOLD,
  MAX_WEIGHT_SUM,
  TRIGGER_WEIGHTS,
  type PlacementDirection,
  type PlacementInputs,
  type PlacementSignal,
  type PlacementTrigger,
} from './types';

const LARGE_PRINT_MIN_USD = 50_000;
const CLUSTER_WINDOW_MS   = 30_000;
const CLUSTER_MIN_COUNT   = 3;

/** Confidence → strength bucket (§9.1). */
function strengthFor(confidence: number): 0 | 1 | 2 | 3 {
  if (confidence >= 70) return 3;
  if (confidence >= 50) return 2;
  if (confidence >= EMIT_THRESHOLD) return 1;
  return 0;
}

/**
 * Detect a large-print cluster: ≥3 prints ≥$50k on the same side within a 30s
 * window. Returns the dominant side and count, or null.
 */
function detectPrintCluster(
  prints: { side: 'buy' | 'sell'; notionalUsd: number; ts: number }[],
): { side: 'buy' | 'sell'; count: number } | null {
  const now = prints.reduce((m, p) => Math.max(m, p.ts), 0);
  const recentBig = prints.filter(
    p => p.notionalUsd >= LARGE_PRINT_MIN_USD && now - p.ts <= CLUSTER_WINDOW_MS,
  );
  for (const side of ['buy', 'sell'] as const) {
    const count = recentBig.filter(p => p.side === side).length;
    if (count >= CLUSTER_MIN_COUNT) return { side, count };
  }
  return null;
}

/**
 * Score a placement read from whatever inputs are present. Only triggers with
 * available data fire, so the engine degrades gracefully across data phases.
 */
export function scorePlacement(inputs: PlacementInputs): PlacementSignal {
  const triggers: PlacementTrigger[] = [];

  const push = (type: PlacementTrigger['type'], detail: string) =>
    triggers.push({ type, weight: TRIGGER_WEIGHTS[type], detail });

  // cvd_divergence (25) — price/CVD fork from the divergence detector.
  if (inputs.divergence) {
    push('cvd_divergence', `${inputs.divergence.kind} CVD/price divergence`);
  }

  // large_print_cluster (12) — 3+ prints ≥$50k same side within 30s.
  const cluster = inputs.largePrints ? detectPrintCluster(inputs.largePrints) : null;
  if (cluster) {
    push('large_print_cluster', `${cluster.count}× ≥$50k ${cluster.side} prints clustered`);
  }

  // sweep_with_absorption (22) — aggressive sweep met by passive absorption.
  if (inputs.sweep?.absorbed) {
    push('sweep_with_absorption', `${inputs.sweep.side} sweep absorbed by passive book`);
  }

  // imbalance_extreme (10) — top-of-book ratio > 3:1 or < 1:3.
  if (inputs.imbalance && (inputs.imbalance.ratio > 3 || inputs.imbalance.ratio < 1 / 3)) {
    push('imbalance_extreme', `book imbalance ${inputs.imbalance.dominant}-dominant (${inputs.imbalance.ratio.toFixed(2)}×)`);
  }

  // cvd_cross (8) — CVD crossed zero since the prior sample.
  if (
    inputs.cvdPrev != null &&
    Math.sign(inputs.cvd) !== Math.sign(inputs.cvdPrev) &&
    inputs.cvd !== 0
  ) {
    push('cvd_cross', `CVD crossed zero (${inputs.cvd > 0 ? 'turned positive' : 'turned negative'})`);
  }

  // funding_extreme (8) — perp funding rate ±0.1% (crowding → reversal risk).
  if (inputs.funding != null && Math.abs(inputs.funding) >= 0.001) {
    push('funding_extreme', `funding ${(inputs.funding * 100).toFixed(3)}% (${inputs.funding > 0 ? 'longs crowded' : 'shorts crowded'})`);
  }

  // delta_exhaustion (18) — early window's delta magnitude is materially
  // larger than the latest window's, with consistent sign throughout. Signals
  // a fading impulse: the move continues but the order flow driving it is
  // running out. Needs ≥6 samples to compare halves with statistical weight.
  const dh = inputs.recentDeltas;
  if (dh && dh.length >= 6) {
    const half = Math.floor(dh.length / 2);
    const earlier = dh.slice(0, half);
    const later   = dh.slice(half);
    const earlyAbs = earlier.reduce((s, d) => s + Math.abs(d), 0) / earlier.length;
    const lateAbs  = later.reduce((s, d) => s + Math.abs(d), 0) / later.length;
    const sameSign = dh.every(d => d > 0) || dh.every(d => d < 0);
    if (sameSign && lateAbs > 0 && earlyAbs >= lateAbs * 2) {
      push('delta_exhaustion', `delta impulse fading (early avg ${earlyAbs.toFixed(0)} → late ${lateAbs.toFixed(0)})`);
    }
  }

  // ── Score ──────────────────────────────────────────────────────────────────
  const sum        = triggers.reduce((s, t) => s + t.weight, 0);
  const confidence = Math.min(100, Math.round((sum / MAX_WEIGHT_SUM) * 100));
  const strength   = strengthFor(confidence);

  // ── Direction (§9.1) ─────────────────────────────────────────────────────
  let direction: PlacementDirection = 'neutral';
  if (triggers.some(t => t.type === 'cvd_divergence')) {
    // Divergence fired → lean with net CVD.
    direction = inputs.cvd > 0 ? 'long' : inputs.cvd < 0 ? 'short' : 'neutral';
  } else if (inputs.sweep?.absorbed) {
    // Absorbed sweep → fade the sweep side (buy sweep absorbed → short setup).
    direction = inputs.sweep.side === 'buy' ? 'short' : 'long';
  } else if (triggers.some(t => t.type === 'delta_exhaustion')) {
    // Impulse fading → fade direction: positive deltas exhausting → short.
    const last = dh ? dh[dh.length - 1] : 0;
    direction = last > 0 ? 'short' : last < 0 ? 'long' : 'neutral';
  } else if (cluster) {
    direction = cluster.side === 'buy' ? 'long' : 'short';
  }

  return {
    instrument: inputs.instrument,
    direction:  strength === 0 ? 'neutral' : direction,
    confidence,
    strength,
    triggers,
    cvd:        inputs.cvd,
    regime:     inputs.regime ?? null,
    ts:         inputs.ts ?? Date.now(),
  };
}
