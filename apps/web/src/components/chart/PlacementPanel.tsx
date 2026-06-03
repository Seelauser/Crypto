'use client';

import { usePlacementSignal } from '@/lib/chart/usePlacementSignal';
import { EMIT_THRESHOLD } from '@/lib/chart/types';

const C = {
  long:  '#22d3ee',
  short: '#f97366',
  neutral: '#5a5f6a',
  ink:   '#e6e8ee',
  dim:   '#8a8f9b',
  panel: '#13141a',
  border:'#1f2128',
  bg:    '#0a0a0b',
  ok:    '#22c55e',
  warn:  '#fbbf24',
} as const;
const mono = { fontFamily: 'JetBrains Mono, monospace' } as const;

const fmt = (n: number | null, d = 0) =>
  n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

function dirColor(dir: string) {
  return dir === 'long' ? C.long : dir === 'short' ? C.short : C.neutral;
}
function dirArrow(dir: string) {
  return dir === 'long' ? '▲' : dir === 'short' ? '▼' : '—';
}

export default function PlacementPanel({
  instrument,
  tier,
}: {
  instrument: string;
  tier: 'free' | 'starter' | 'pro';
}) {
  const isPaid = tier !== 'free';
  const st = usePlacementSignal(instrument, isPaid);

  if (!isPaid) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: C.dim, fontSize: 13 }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🎯</div>
        <div style={{ color: C.ink, fontWeight: 600, marginBottom: 4 }}>Placement Signals</div>
        <div style={{ marginBottom: 14, lineHeight: 1.5 }}>
          Confidence-scored order-flow placement reads — CVD divergence, sweeps,
          book imbalance and more, fused into a single long/short call.
        </div>
        <a href="/billing/upgrade?from=placement"
           style={{ display: 'inline-block', background: C.long, color: C.bg, padding: '8px 16px', borderRadius: 6, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
          Unlock with Starter →
        </a>
      </div>
    );
  }

  const sig = st.signal;
  const emitted = sig != null && sig.strength > 0;
  const dir = sig?.direction ?? 'neutral';
  const conf = sig?.confidence ?? 0;

  return (
    <div style={{ padding: '12px 14px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Placement Signal</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: C.dim, ...mono }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.connected ? C.ok : C.short, display: 'inline-block' }} />
          {st.connected ? 'LIVE' : 'connecting…'}
        </div>
      </div>

      {/* Big read */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
        <div style={{ ...mono, fontSize: 40, fontWeight: 800, color: dirColor(dir), lineHeight: 1 }}>
          {dirArrow(dir)}
        </div>
        <div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 800, color: dirColor(dir), textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {emitted ? dir : 'no signal'}
          </div>
          <div style={{ fontSize: 11, color: C.dim }}>
            {emitted ? `strength ${sig!.strength} · confidence` : `below ${EMIT_THRESHOLD}% emit threshold`}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', ...mono, fontSize: 30, fontWeight: 800, color: emitted ? dirColor(dir) : C.neutral }}>
          {conf}%
        </div>
      </div>

      {/* Confidence bar */}
      <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ width: `${conf}%`, height: '100%', background: emitted ? dirColor(dir) : C.neutral, transition: 'width 300ms' }} />
      </div>

      {/* Triggers fired */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Triggers</div>
        {sig && sig.triggers.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sig.triggers.map(t => (
              <span key={t.type} title={t.detail}
                style={{ ...mono, fontSize: 11, color: C.ink, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '3px 8px' }}>
                {t.type.replace(/_/g, ' ')} <span style={{ color: C.dim }}>+{t.weight}</span>
              </span>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: C.neutral }}>Waiting for order-flow triggers…</div>
        )}
      </div>

      {/* Live telemetry */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Stat label="CVD" value={fmt(st.cvd)} color={st.cvd != null ? (st.cvd >= 0 ? C.long : C.short) : C.dim} />
        <Stat label="Book imbalance" value={st.imbalanceRatio != null ? `${st.imbalanceRatio.toFixed(2)}×` : '—'}
              color={st.imbalanceRatio != null ? (st.imbalanceRatio >= 1 ? C.long : C.short) : C.dim} />
        <Stat label="Divergence" value={st.divergence ? st.divergence.kind : 'none'}
              color={st.divergence ? (st.divergence.kind === 'bullish' ? C.long : C.short) : C.dim} />
        <Stat label="Regime" value={sig?.regime ?? '—'} color={C.ink} />
      </div>

      {st.lastSweep && (
        <div style={{ marginTop: 10, fontSize: 11, color: C.dim, ...mono }}>
          last sweep: <span style={{ color: st.lastSweep.side === 'buy' ? C.long : C.short }}>{st.lastSweep.side}</span>
          {' '}${fmt(st.lastSweep.notionalUsd)}
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 10, color: C.neutral, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
        Not investment advice. Scored from live order flow — see /admin for engine cost.
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
      <div style={{ ...mono, fontSize: 14, fontWeight: 700, color, textTransform: 'capitalize' }}>{value}</div>
    </div>
  );
}
