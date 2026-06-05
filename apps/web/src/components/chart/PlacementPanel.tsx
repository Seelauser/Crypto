'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePlacementSignal, type PlacementState } from '@/lib/chart/usePlacementSignal';
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
  state: externalState,
}: {
  instrument: string;
  tier: 'free' | 'starter' | 'pro';
  /** Lifted placement state — when provided, the panel skips its own WS and
   *  reads from this shared source. Required to keep the chart markers and
   *  the panel in lock-step on the same signal stream. */
  state?: PlacementState;
}) {
  const isPaid = tier !== 'free';
  // Only run the internal hook when no external state is supplied (legacy
  // usages, e.g. unit tests). Hooks must be unconditional, so we always call
  // it — but with enabled=false when external state covers us.
  const internalState = usePlacementSignal(instrument, isPaid && !externalState);
  const st = externalState ?? internalState;

  const [explain, setExplain] = useState<{ text: string; ai: boolean } | null>(null);
  const [explaining, setExplaining] = useState(false);
  const sig = st.signal;
  const emitted = sig != null && sig.strength > 0;

  // Reset the explanation when the instrument or direction changes.
  useEffect(() => { setExplain(null); }, [instrument, sig?.direction]);

  const handleExplain = useCallback(async () => {
    if (!sig || explaining) return;
    setExplaining(true);
    try {
      const res = await fetch('/api/signals/chart-explain', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrument,
          direction:  sig.direction,
          confidence: sig.confidence,
          triggers:   sig.triggers.map(t => t.type),
          cvd:        sig.cvd,
          regime:     sig.regime,
        }),
      });
      const data = await res.json();
      if (res.ok) setExplain({ text: data.explanation, ai: !!data.aiPowered });
      else setExplain({ text: data.message ?? data.error ?? 'Could not explain this signal.', ai: false });
    } catch {
      setExplain({ text: 'Could not reach the explanation service.', ai: false });
    } finally {
      setExplaining(false);
    }
  }, [sig, instrument, explaining]);

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

      {/* AI explanation (emitted signals only) */}
      {emitted && (
        <div style={{ marginBottom: 14 }}>
          {!explain ? (
            <button
              onClick={handleExplain}
              disabled={explaining}
              style={{
                background: explaining ? C.panel : `${dirColor(dir)}1a`,
                border: `1px solid ${dirColor(dir)}40`, color: dirColor(dir),
                borderRadius: 6, padding: '7px 12px', fontSize: 12, fontWeight: 600,
                cursor: explaining ? 'default' : 'pointer', width: '100%',
              }}
            >
              {explaining ? 'Reading the flow…' : '✨ Explain this placement'}
            </button>
          ) : (
            <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.55 }}>{explain.text}</div>
              <div style={{ fontSize: 9, color: C.dim, marginTop: 6, ...mono }}>
                {explain.ai ? 'AI-generated' : 'order-flow read'}
              </div>
            </div>
          )}
        </div>
      )}

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
