'use client';

// FlowStatsStrip — a compact horizontal read of the last N bars' order-flow
// stats (Volume / Delta / Relative Strength / CVD), modeled on the
// footprint-adjacent stats strips in orderflow-charts. Sits directly under
// the chart so the reader can scan recent bar-by-bar flow without opening
// the full footprint view — Phase 2 of the order-flow UI redesign (see
// memory: the goal is "show the work" rather than collapse everything into
// one headline number).

import { useEffect, useRef, useState } from 'react';
import type { OhlcvBar } from '@orderflow/types';
import type { Timeframe } from '@/components/charts/CvdChart';

const C = {
  long:    '#22d3ee',
  short:   '#f97366',
  neutral: '#5a5f6a',
  ink:     '#e6e8ee',
  dim:     '#8a8f9b',
  panel:   '#13141a',
  border:  '#1f2128',
  bg:      '#0a0a0b',
} as const;
const mono = { fontFamily: 'JetBrains Mono, monospace' } as const;

const BAR_COUNT = 20;
const CELL_W = 34;

interface Props {
  instrument: string;
  timeframe: Timeframe;
  tier: 'free' | 'starter' | 'pro';
}

const fmtCompact = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : Math.abs(n) >= 1_000   ? `${(n / 1_000).toFixed(1)}k`
  : n.toFixed(0);

export default function FlowStatsStrip({ instrument, timeframe, tier }: Props) {
  const [bars, setBars] = useState<OhlcvBar[]>([]);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  // Footprint-derived reads are starter+ (matches the freemium gate table).
  const isPaid = tier !== 'free';

  useEffect(() => {
    if (!isPaid) return;
    const mySeq = ++seq.current;
    setLoading(true);
    fetch(`/api/markets/${instrument}/bars?tf=${timeframe}&limit=${BAR_COUNT}`)
      .then(res => res.json())
      .then((payload: { bars?: OhlcvBar[] } | OhlcvBar[]) => {
        if (seq.current !== mySeq) return;
        const list = Array.isArray(payload) ? payload : (payload.bars ?? []);
        setBars(list.slice(-BAR_COUNT));
      })
      .catch(() => { if (seq.current === mySeq) setBars([]); })
      .finally(() => { if (seq.current === mySeq) setLoading(false); });
  }, [instrument, timeframe, isPaid]);

  if (!isPaid) {
    return (
      <div style={{ padding: '8px 14px', fontSize: 11, color: C.dim, ...mono, borderTop: `1px solid ${C.border}` }}>
        Bar-by-bar flow stats (Volume · Delta · Relative Strength · CVD) — <a href="/billing/upgrade?from=flow_stats" style={{ color: C.long }}>unlock with Starter →</a>
      </div>
    );
  }

  if (loading && bars.length === 0) {
    return (
      <div style={{ padding: '8px 14px', fontSize: 11, color: C.dim, ...mono, borderTop: `1px solid ${C.border}` }}>
        Loading flow stats…
      </div>
    );
  }
  if (bars.length === 0) {
    return (
      <div style={{ padding: '8px 14px', fontSize: 11, color: C.dim, ...mono, borderTop: `1px solid ${C.border}` }}>
        No bar data available for {instrument} @ {timeframe}.
      </div>
    );
  }

  // Relative strength: this bar's volume vs the strip's own rolling average —
  // a quick "is this bar louder than its neighbours" read, independent of
  // absolute scale (which varies wildly across instruments/asset classes).
  const avgVolume = bars.reduce((s, b) => s + b.volume, 0) / bars.length;
  const maxVolume = Math.max(...bars.map(b => b.volume), 1);

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, background: C.panel, overflowX: 'auto' }}>
      <div style={{ display: 'inline-flex', minWidth: '100%', padding: '6px 14px' }}>
        {/* Row labels */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 10, flexShrink: 0 }}>
          <RowLabel>Volume</RowLabel>
          <RowLabel>Delta</RowLabel>
          <RowLabel>Rel. strength</RowLabel>
          <RowLabel>CVD</RowLabel>
        </div>

        {/* Bar columns */}
        <div style={{ display: 'flex', gap: 2 }}>
          {bars.map((b, i) => {
            const delta = b.delta ?? 0;
            const cvd = b.cvd ?? 0;
            const relStrength = avgVolume > 0 ? b.volume / avgVolume : 0;
            const deltaColor = delta > 0 ? C.long : delta < 0 ? C.short : C.neutral;
            const cvdColor = cvd > 0 ? C.long : cvd < 0 ? C.short : C.neutral;
            const isLatest = i === bars.length - 1;

            return (
              <div key={b.ts} title={new Date(b.ts).toLocaleTimeString()}
                style={{
                  width: CELL_W, flexShrink: 0, display: 'flex', flexDirection: 'column',
                  gap: 6, padding: '2px 3px', borderRadius: 3,
                  background: isLatest ? `${C.long}0c` : 'transparent',
                  border: isLatest ? `1px solid ${C.long}30` : '1px solid transparent',
                }}
              >
                {/* Volume — bar-height intensity + compact value */}
                <div style={{ height: 28, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 2 }}>
                  <div style={{
                    width: '100%', borderRadius: 1, alignSelf: 'flex-end',
                    height: `${Math.max(8, (b.volume / maxVolume) * 100)}%`,
                    background: `${C.ink}26`,
                  }} />
                  <Cell color={C.dim}>{fmtCompact(b.volume)}</Cell>
                </div>

                {/* Delta — signed, colored by side */}
                <Cell color={deltaColor}>{delta > 0 ? '+' : ''}{fmtCompact(delta)}</Cell>

                {/* Relative strength — this bar's volume vs the strip's
                    rolling average, intensity-graded so a "loud" bar (≥1.5×)
                    pops without needing to compare raw numbers across instruments. */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                  <div style={{ width: 12, height: 4, borderRadius: 2, background: C.bg, overflow: 'hidden', flexShrink: 0 }}>
                    <div style={{
                      width: `${Math.min(100, (relStrength / 2) * 100)}%`,
                      height: '100%', background: relStrength >= 1.5 ? '#fbbf24' : C.neutral,
                    }} />
                  </div>
                  <Cell color={relStrength >= 1.5 ? '#fbbf24' : C.dim}>{relStrength.toFixed(1)}×</Cell>
                </div>

                {/* CVD — running cumulative read */}
                <Cell color={cvdColor}>{fmtCompact(cvd)}</Cell>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', height: 28, display: 'flex', alignItems: 'center', ...mono }}>
      {children}
    </div>
  );
}

function Cell({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ ...mono, fontSize: 9.5, color, textAlign: 'center', lineHeight: 1.2 }}>
      {children}
    </div>
  );
}
