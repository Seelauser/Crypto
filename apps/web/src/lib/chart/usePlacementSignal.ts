'use client';

import { useEffect, useRef, useState } from 'react';
import { scorePlacement } from './placementEngine';
import type { PlacementDirection, PlacementInputs, PlacementSignal } from './types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4001';
const SWEEP_WINDOW_MS = 30_000;
const ABSORB_WINDOW_MS = 5_000;

/**
 * Exchanges name the same pair differently (Kraken `BTCUSD`, Binance `BTCUSDT`).
 * Match on the base symbol so a stream from any exchange feeds the panel.
 */
function instrumentMatches(streamInstr: string | undefined, target: string): boolean {
  if (!streamInstr) return false;
  if (streamInstr === target) return true;
  const base = (s: string) => s.replace(/(USDT|USDC|USD)$/i, '');
  return base(streamInstr) === base(target);
}

export interface SweepEntry {
  side:        string;
  notionalUsd: number;
  ts:          number;
  absorbed:    boolean;
}

export interface ImbalanceEntry {
  ratio:    number;
  dominant: 'bid' | 'ask';
  ts:       number;
  /** True when ratio exceeded IMBALANCE_SPIKE_THRESHOLD — used for the spike log. */
  spiked:   boolean;
}

export interface PlacementState {
  signal:         PlacementSignal | null;
  /**
   * Recent *emitted* signals (above EMIT_THRESHOLD). One entry per
   * direction-change or significant confidence jump — what the chart renders
   * as markers. Capped at MAX_HISTORY; ordered oldest → newest.
   */
  history:        PlacementSignal[];
  connected:      boolean;
  cvd:            number | null;
  imbalanceRatio: number | null;
  /**
   * Rolling 30-sample imbalance history (newest last). Used for the sparkline
   * in PlacementPanel and for the spike-event log.
   */
  imbalanceHistory: ImbalanceEntry[];
  lastSweep:      SweepEntry | null;
  /**
   * Last 10 sweeps within the session window — powers the sweep-log table
   * in PlacementPanel. The analyst reported that a single "last sweep"
   * number is anecdotal; a sequence reveals structural intent.
   */
  sweepHistory:   SweepEntry[];
  divergence:     { kind: 'bullish' | 'bearish'; strength?: number } | null;
  /**
   * Open interest from the derivatives feed (raw value — USD notional or
   * contract units depending on exchange). Null when the derivatives
   * publisher is not running.
   */
  oi:             number | null;
  /**
   * Regime string from the HMM classifier (e.g. "trending_bull"). Null when
   * the regime publisher hasn't classified this instrument yet.
   */
  regime:         string | null;
}

const EMPTY: PlacementState = {
  signal: null, history: [], connected: false, cvd: null,
  imbalanceRatio: null, imbalanceHistory: [],
  lastSweep: null, sweepHistory: [],
  divergence: null, oi: null, regime: null,
};

const MAX_HISTORY           = 50;
const HISTORY_MAX_AGE       = 60 * 60 * 1000; // 1h
const CONF_JUMP_MIN         = 15;              // re-emit when confidence jumps ≥15pts in same direction
const IMBALANCE_HISTORY_MAX = 30;              // sparkline ring buffer
const IMBALANCE_SPIKE_THRESHOLD = 10;          // ×10 ratio = spike event

// ── Direction stability ───────────────────────────────────────────────────
// Raw per-tick scoring can flip direction rapidly when CVD oscillates near
// zero (the engine derives long/short straight off `Math.sign(cvd)` — see
// placementEngine.ts). At trade cadence that produced a visibly "flashing"
// long ↔ short readout below the chart that users correctly didn't trust.
//
// Fix: only COMMIT a direction change once the new reading has been the
// consistent candidate for MIN_FLIP_DWELL_MS. Confidence/strength/triggers
// still update live every recompute — only the headline direction is
// debounced, so the panel stops thrashing while staying responsive to real
// regime changes (a genuine flip survives 8s of consistent readings; noise
// doesn't).
const MIN_FLIP_DWELL_MS = 8_000;

// Throttle re-scoring itself: the order-flow WS can emit many ticks/sec,
// and re-running the engine + a React state update on every single one is
// wasted work that also amplifies the near-threshold jitter above. Trailing
// edge throttle keeps the panel responsive (≤1 update/sec) without dropping
// the latest reading.
const RECOMPUTE_THROTTLE_MS = 1_000;

/**
 * Live placement-signal hook. Opens its own WebSocket to the gateway (isolated
 * from the shared `useMarketSocket`), subscribes to the order-flow streams for
 * `instrument`, polls the divergence detector, and re-scores via the placement
 * engine on every update. Returns the latest signal plus the raw telemetry the
 * panel renders even when no marker is emitted.
 */
export function usePlacementSignal(instrument: string, enabled = true): PlacementState {
  const [state, setState] = useState<PlacementState>(EMPTY);

  // Mutable rolling state — avoids re-subscribing on every tick.
  const roll = useRef<{
    cvd: number | null;
    cvdPrev: number | null;
    imbalance: { ratio: number; dominant: 'bid' | 'ask' } | null;
    imbalanceHistory: ImbalanceEntry[];
    sweeps: { side: 'buy' | 'sell'; notionalUsd: number; ts: number; absorbed: boolean }[];
    lastAbsorbTs: number;
    divergence: { kind: 'bullish' | 'bearish'; strength?: number } | null;
    funding: number | null;
    oi: number | null;
    regime: string | null;
    /** Signed delta_60s samples, oldest → newest, for delta_exhaustion. */
    recentDeltas: number[];
    /** Last COMMITTED direction shown to the user (debounced — see MIN_FLIP_DWELL_MS). */
    stableDirection: PlacementDirection;
    /** Direction currently "auditioning" to replace stableDirection, plus when it first appeared. */
    candidateDirection: PlacementDirection | null;
    candidateSince: number;
  }>({
    cvd: null, cvdPrev: null, imbalance: null, imbalanceHistory: [],
    sweeps: [], lastAbsorbTs: 0, divergence: null, funding: null, oi: null, regime: null,
    recentDeltas: [], stableDirection: 'neutral', candidateDirection: null, candidateSince: 0,
  });

  useEffect(() => {
    if (!enabled || !instrument || typeof window === 'undefined') return;
    roll.current = {
      cvd: null, cvdPrev: null, imbalance: null, imbalanceHistory: [],
      sweeps: [], lastAbsorbTs: 0, divergence: null, funding: null, oi: null, regime: null,
      recentDeltas: [], stableDirection: 'neutral', candidateDirection: null, candidateSince: 0,
    };
    let closed = false;
    let ws: WebSocket | null = null;
    let throttleHandle: ReturnType<typeof setTimeout> | null = null;
    let throttlePending = false;

    const recompute = () => {
      const r = roll.current;
      const recentSweep = r.sweeps.filter(s => Date.now() - s.ts < SWEEP_WINDOW_MS).pop() ?? null;
      const inputs: PlacementInputs = {
        instrument,
        cvd:          r.cvd ?? 0,
        cvdPrev:      r.cvdPrev,
        divergence:   r.divergence,
        imbalance:    r.imbalance,
        sweep:        recentSweep ? { side: recentSweep.side, absorbed: recentSweep.absorbed } : null,
        funding:      r.funding,
        recentDeltas: r.recentDeltas.length ? [...r.recentDeltas] : null,
        regime:       r.regime,
        ts:           Date.now(),
      };
      const rawSignal = scorePlacement(inputs);

      // ── Debounce the headline direction (kills the long/short "flashing") ──
      // The engine can legitimately recompute a different direction tick to
      // tick (raw CVD sign flips near zero, divergence polls land mid-stream,
      // etc). Only adopt a new direction once it's been the consistent
      // candidate for MIN_FLIP_DWELL_MS; otherwise keep showing the last
      // committed one. Confidence/strength/triggers pass through untouched.
      const now = Date.now();
      if (rawSignal.direction !== r.stableDirection) {
        if (r.candidateDirection === rawSignal.direction) {
          if (now - r.candidateSince >= MIN_FLIP_DWELL_MS) {
            r.stableDirection = rawSignal.direction;
            r.candidateDirection = null;
          }
        } else {
          r.candidateDirection = rawSignal.direction;
          r.candidateSince = now;
        }
      } else {
        r.candidateDirection = null;
      }
      const signal: PlacementSignal = { ...rawSignal, direction: r.stableDirection };

      setState(s => {
        // Append to history when a NEW emitted signal is observed:
        //   1) crosses from no-emit → emit,
        //   2) direction changes,
        //   3) confidence jumps ≥ CONF_JUMP_MIN in the same direction.
        const emitted = signal.strength > 0;
        const last    = s.history[s.history.length - 1];
        const shouldAppend =
          emitted && (
            !last ||
            last.direction !== signal.direction ||
            Math.abs(signal.confidence - last.confidence) >= CONF_JUMP_MIN
          );
        let history = s.history;
        if (shouldAppend) {
          history = [...s.history, signal];
        }
        // Drop entries older than 1h and cap at MAX_HISTORY.
        const cutoff = Date.now() - HISTORY_MAX_AGE;
        history = history.filter(h => h.ts >= cutoff).slice(-MAX_HISTORY);
        const now2 = Date.now();
        const activeSweeps = r.sweeps.filter(s => now2 - s.ts < SWEEP_WINDOW_MS);
        return {
          ...s,
          signal,
          history,
          cvd:              r.cvd,
          imbalanceRatio:   r.imbalance?.ratio ?? null,
          imbalanceHistory: [...r.imbalanceHistory],
          lastSweep:        recentSweep
                              ? { side: recentSweep.side, notionalUsd: recentSweep.notionalUsd, ts: recentSweep.ts, absorbed: recentSweep.absorbed }
                              : null,
          sweepHistory:     activeSweeps.slice(-10).map(sw => ({
                              side: sw.side, notionalUsd: sw.notionalUsd, ts: sw.ts, absorbed: sw.absorbed,
                            })),
          divergence:       r.divergence,
          oi:               r.oi,
          regime:           r.regime,
        };
      });
    };

    // Trailing-edge throttle: collapse bursts of WS ticks into ≤1 recompute
    // per RECOMPUTE_THROTTLE_MS while always running once more at the end of
    // the burst so the latest reading is never dropped.
    const requestRecompute = () => {
      if (throttleHandle) { throttlePending = true; return; }
      recompute();
      throttleHandle = setTimeout(() => {
        throttleHandle = null;
        if (throttlePending) { throttlePending = false; requestRecompute(); }
      }, RECOMPUTE_THROTTLE_MS);
    };

    // ── Divergence poll (the detector publishes every ~120s) ───────────────
    const fetchDivergence = async () => {
      try {
        const res = await fetch('/api/market/divergences');
        if (!res.ok) return;
        type DivergenceEntry = { instrument: string; kind: 'bullish' | 'bearish'; divergence_strength?: number };
        const { divergences } = await res.json() as { divergences: DivergenceEntry[] };
        const d = divergences.find(x => instrumentMatches(x.instrument, instrument));
        roll.current.divergence = d ? { kind: d.kind, strength: d.divergence_strength } : null;
        recompute();
      } catch { /* ignore */ }
    };
    void fetchDivergence();
    const divTimer = setInterval(fetchDivergence, 60_000);

    // ── Funding + OI poll (the derivatives publisher refreshes every ~30s) ──
    const fetchFunding = async () => {
      try {
        const res = await fetch(`/api/markets/${encodeURIComponent(instrument)}/derivatives`);
        if (!res.ok) return;
        const { current } = await res.json() as {
          current: { funding_rate?: number; open_interest?: number } | null
        };
        if (current) {
          roll.current.funding = typeof current.funding_rate   === 'number' ? current.funding_rate   : null;
          roll.current.oi      = typeof current.open_interest  === 'number' ? current.open_interest  : null;
        }
        recompute();
      } catch { /* ignore */ }
    };
    void fetchFunding();
    const fundingTimer = setInterval(fetchFunding, 30_000);

    // ── Regime poll (the HMM publisher re-classifies every ~60s) ────────────
    const fetchRegime = async () => {
      try {
        const res = await fetch('/api/market/regime');
        if (!res.ok) return;
        const data = await res.json() as Record<string, string>;
        // Map instrument to asset class. The regime publisher currently
        // only covers crypto; extend this when other publishers ship.
        const assetClass =
          /^(BTC|ETH|SOL|BNB|XRP|DOGE|ADA|AVAX|DOT|LINK)/i.test(instrument)
            ? 'crypto'
            : /^(EUR|GBP|JPY|AUD|CAD|CHF)/i.test(instrument)
            ? 'forex'
            : /^(ES|NQ|RTY|YM)/i.test(instrument)
            ? 'futures'
            : 'stocks';
        roll.current.regime = data[assetClass] ?? null;
        recompute();
      } catch { /* ignore */ }
    };
    void fetchRegime();
    const regimeTimer = setInterval(fetchRegime, 60_000);

    // ── Live order-flow WebSocket ──────────────────────────────────────────
    const connect = () => {
      if (closed) return;
      ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        setState(s => ({ ...s, connected: true }));
        ws?.send(JSON.stringify({
          type: 'subscribe',
          channels: ['market:cvd_update', 'market:imbalance_update', 'market:sweep_detected', 'market:absorption_detected'],
        }));
      };
      ws.onclose = () => { setState(s => ({ ...s, connected: false })); if (!closed) setTimeout(connect, 3_000); };
      ws.onerror = () => ws?.close();
      ws.onmessage = (ev) => {
        type WsData = { instrument?: string; cvd?: number; delta_60s?: number; imbalance_ratio?: number; side?: string; notional_usd?: number; ts?: number };
        let m: { type?: string; data?: WsData };
        try { m = JSON.parse(ev.data); } catch { return; }
        const d = m.data;
        if (!d || !instrumentMatches(d.instrument, instrument)) return;
        const r = roll.current;

        switch (m.type) {
          case 'market_cvd_update':
            if (typeof d.cvd === 'number') { r.cvdPrev = r.cvd; r.cvd = d.cvd; }
            // Track recent 60s deltas for delta_exhaustion. The stream emits
            // per-update deltas; we cap at 12 samples (~12m at the current
            // worker cadence) to give the engine enough signal for halving.
            if (typeof d.delta_60s === 'number') {
              r.recentDeltas.push(d.delta_60s);
              if (r.recentDeltas.length > 12) r.recentDeltas.shift();
            }
            break;
          case 'market_imbalance_update': {
            const ratio = d.imbalance_ratio;
            if (typeof ratio === 'number') {
              const dominant: 'bid' | 'ask' = ratio >= 1 ? 'bid' : 'ask';
              r.imbalance = { ratio, dominant };
              // Append to ring buffer (cap at IMBALANCE_HISTORY_MAX)
              r.imbalanceHistory.push({
                ratio, dominant, ts: Date.now(),
                spiked: ratio >= IMBALANCE_SPIKE_THRESHOLD,
              });
              if (r.imbalanceHistory.length > IMBALANCE_HISTORY_MAX) r.imbalanceHistory.shift();
            } else {
              r.imbalance = null;
            }
            break;
          }
          case 'market_absorption_detected':
            r.lastAbsorbTs = Date.now();
            break;
          case 'market_sweep_detected':
            r.sweeps.push({
              side:        d.side === 'sell' ? 'sell' : 'buy',
              notionalUsd: d.notional_usd ?? 0,
              ts:          d.ts ?? Date.now(),
              // A sweep counts as absorbed if a passive-absorption event landed within 5s.
              absorbed:    Date.now() - r.lastAbsorbTs < ABSORB_WINDOW_MS,
            });
            r.sweeps = r.sweeps.filter(s => Date.now() - s.ts < SWEEP_WINDOW_MS).slice(-10);
            break;
          default:
            return;
        }
        requestRecompute();
      };
    };
    connect();

    return () => {
      closed = true;
      clearInterval(divTimer);
      clearInterval(fundingTimer);
      clearInterval(regimeTimer);
      if (throttleHandle) clearTimeout(throttleHandle);
      ws?.close();
    };
  }, [instrument, enabled]);

  return state;
}
