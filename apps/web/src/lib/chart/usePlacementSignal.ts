'use client';

import { useEffect, useRef, useState } from 'react';
import { scorePlacement } from './placementEngine';
import type { PlacementInputs, PlacementSignal } from './types';

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
  lastSweep:      { side: string; notionalUsd: number; ts: number } | null;
  divergence:     { kind: 'bullish' | 'bearish'; strength?: number } | null;
}

const EMPTY: PlacementState = {
  signal: null, history: [], connected: false, cvd: null, imbalanceRatio: null, lastSweep: null, divergence: null,
};

const MAX_HISTORY     = 50;
const HISTORY_MAX_AGE = 60 * 60 * 1000; // 1h
const CONF_JUMP_MIN   = 15;             // re-emit when confidence jumps ≥15pts in same direction

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
    sweeps: { side: 'buy' | 'sell'; notionalUsd: number; ts: number; absorbed: boolean }[];
    lastAbsorbTs: number;
    divergence: { kind: 'bullish' | 'bearish'; strength?: number } | null;
    funding: number | null;
    /** Signed delta_60s samples, oldest → newest, for delta_exhaustion. */
    recentDeltas: number[];
  }>({ cvd: null, cvdPrev: null, imbalance: null, sweeps: [], lastAbsorbTs: 0, divergence: null, funding: null, recentDeltas: [] });

  useEffect(() => {
    if (!enabled || !instrument || typeof window === 'undefined') return;
    roll.current = { cvd: null, cvdPrev: null, imbalance: null, sweeps: [], lastAbsorbTs: 0, divergence: null, funding: null, recentDeltas: [] };
    let closed = false;
    let ws: WebSocket | null = null;

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
        ts:           Date.now(),
      };
      const signal = scorePlacement(inputs);
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
        return {
          ...s,
          signal,
          history,
          cvd:            r.cvd,
          imbalanceRatio: r.imbalance?.ratio ?? null,
          lastSweep:      recentSweep ? { side: recentSweep.side, notionalUsd: recentSweep.notionalUsd, ts: recentSweep.ts } : null,
          divergence:     r.divergence,
        };
      });
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

    // ── Funding poll (the derivatives publisher refreshes every ~30s) ──────
    const fetchFunding = async () => {
      try {
        const res = await fetch(`/api/markets/${encodeURIComponent(instrument)}/derivatives`);
        if (!res.ok) return;
        const { current } = await res.json() as { current: { funding_rate?: number } | null };
        roll.current.funding = current && typeof current.funding_rate === 'number' ? current.funding_rate : null;
        recompute();
      } catch { /* ignore */ }
    };
    void fetchFunding();
    const fundingTimer = setInterval(fetchFunding, 30_000);

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
            r.imbalance = typeof ratio === 'number' ? { ratio, dominant: ratio >= 1 ? 'bid' : 'ask' } : null;
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
        recompute();
      };
    };
    connect();

    return () => { closed = true; clearInterval(divTimer); clearInterval(fundingTimer); ws?.close(); };
  }, [instrument, enabled]);

  return state;
}
