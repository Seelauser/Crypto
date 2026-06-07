'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePlacementSignal, type PlacementState } from '@/lib/chart/usePlacementSignal';
import { EMIT_THRESHOLD, TRIGGER_WEIGHTS, MAX_WEIGHT_SUM } from '@/lib/chart/types';

const C = {
  long:    '#22d3ee',
  short:   '#f97366',
  neutral: '#5a5f6a',
  ink:     '#e6e8ee',
  dim:     '#8a8f9b',
  panel:   '#13141a',
  border:  '#1f2128',
  bg:      '#0a0a0b',
  ok:      '#22c55e',
  warn:    '#fbbf24',
} as const;
const mono = { fontFamily: 'JetBrains Mono, monospace' } as const;

const fmt = (n: number | null, d = 0) =>
  n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}

function dirColor(dir: string) {
  return dir === 'long' ? C.long : dir === 'short' ? C.short : C.neutral;
}
function dirArrow(dir: string) {
  return dir === 'long' ? '▲' : dir === 'short' ? '▼' : '—';
}

// ── Inline sparkline for imbalance history ─────────────────────────────────────
// 30 samples rendered as a tiny SVG path so no chart library is needed.
function ImbalanceSparkline({ history }: { history: { ratio: number; spiked: boolean }[] }) {
  if (history.length < 2) return null;
  const W = 100, H = 24;
  const ratios = history.map(h => h.ratio);
  const max = Math.max(...ratios, 5);
  const pts = ratios.map((r, i) => {
    const x = (i / (ratios.length - 1)) * W;
    const y = H - (r / max) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = history[history.length - 1];
  const dotColor = last.spiked ? C.warn : last.ratio >= 1 ? C.long : C.short;
  const lx = parseFloat(pts[pts.length - 1].split(',')[0]);
  const ly = parseFloat(pts[pts.length - 1].split(',')[1]);
  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={C.dim}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Spike markers */}
      {history.map((h, i) => {
        if (!h.spiked) return null;
        const x = (i / (ratios.length - 1)) * W;
        const y = H - (h.ratio / max) * H;
        return <circle key={i} cx={x} cy={y} r={2} fill={C.warn} />;
      })}
      {/* Live dot */}
      <circle cx={lx} cy={ly} r={2.5} fill={dotColor} />
    </svg>
  );
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
  const internalState = usePlacementSignal(instrument, isPaid && !externalState);
  const st = externalState ?? internalState;

  const [explain, setExplain] = useState<{ text: string; ai: boolean } | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [showScoreInfo, setShowScoreInfo] = useState(false);

  const sig = st.signal;
  const emitted = sig != null && sig.strength > 0;

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

  const dir  = sig?.direction ?? 'neutral';
  const conf = sig?.confidence ?? 0;

  // ── Evidence split ─────────────────────────────────────────────────────────
  const triggers     = sig?.triggers ?? [];
  const longWeight    = triggers.filter(t => t.lean === 'long').reduce((s, t) => s + t.weight, 0);
  const shortWeight   = triggers.filter(t => t.lean === 'short').reduce((s, t) => s + t.weight, 0);
  const neutralWeight = triggers.filter(t => t.lean === 'neutral').reduce((s, t) => s + t.weight, 0);
  const evidenceTotal = longWeight + shortWeight + neutralWeight;
  const longPct    = evidenceTotal > 0 ? (longWeight / evidenceTotal) * 100 : 0;
  const shortPct   = evidenceTotal > 0 ? (shortWeight / evidenceTotal) * 100 : 0;
  const neutralPct = evidenceTotal > 0 ? 100 - longPct - shortPct : 100;

  // ── Imbalance history ──────────────────────────────────────────────────────
  const imbHistory  = st.imbalanceHistory;
  const spikeEvents = imbHistory.filter(h => h.spiked);
  const sessionPeak = imbHistory.length > 0
    ? imbHistory.reduce((m, h) => h.ratio > m.ratio ? h : m)
    : null;

  // ── Sweep log ─────────────────────────────────────────────────────────────
  const sweepLog = st.sweepHistory;
  const buySweeps  = sweepLog.filter(s => s.side === 'buy').length;
  const sellSweeps = sweepLog.filter(s => s.side === 'sell').length;

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

      {/* Confidence read */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ ...mono, fontSize: 20, fontWeight: 800, color: emitted ? dirColor(dir) : C.neutral }}>
              {dirArrow(dir)} {emitted ? dir.toUpperCase() : 'NO SIGNAL'}
            </span>
            <span style={{ fontSize: 10, color: C.dim }}>
              {emitted ? `strength ${sig!.strength}` : `below ${EMIT_THRESHOLD}% emit threshold`}
            </span>
          </div>
          <span style={{ ...mono, fontSize: 18, fontWeight: 800, color: emitted ? dirColor(dir) : C.neutral }}>
            {conf}%
          </span>
        </div>
        {/* Confidence gauge with threshold markers */}
        <div
          style={{ position: 'relative', height: 8, background: C.bg, borderRadius: 4, overflow: 'hidden', cursor: 'pointer' }}
          onClick={() => setShowScoreInfo(v => !v)}
          title="Click to see scoring formula"
        >
          <div style={{ width: `${conf}%`, height: '100%', background: emitted ? dirColor(dir) : C.neutral, transition: 'width 400ms ease' }} />
          {[EMIT_THRESHOLD, 50, 70].map(mark => (
            <div key={mark} title={`${mark}% threshold`}
              style={{ position: 'absolute', left: `${mark}%`, top: 0, bottom: 0, width: 1, background: C.bg, opacity: 0.6 }} />
          ))}
        </div>

        {/* ── Score formula tooltip ─── */}
        {showScoreInfo && (
          <div style={{
            marginTop: 8, background: C.panel, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: '10px 12px', fontSize: 11,
          }}>
            <div style={{ color: C.warn, fontWeight: 700, marginBottom: 6, ...mono }}>
              Scoring formula — max {MAX_WEIGHT_SUM} pts = 100%
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 12px', ...mono, fontSize: 10 }}>
              {(Object.entries(TRIGGER_WEIGHTS) as [string, number][]).map(([k, w]) => {
                const fired = triggers.find(t => t.type === k);
                return [
                  <span key={`k-${k}`} style={{ color: fired ? C.ink : C.neutral }}>{k.replace(/_/g, ' ')}</span>,
                  <span key={`v-${k}`} style={{ color: fired ? C.warn : C.dim, textAlign: 'right' }}>+{w}</span>,
                ];
              })}
            </div>
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border}`, color: C.dim, fontSize: 10, ...mono }}>
              current score: <span style={{ color: C.ink }}>{evidenceTotal}</span> / {MAX_WEIGHT_SUM} = {conf}%
              &nbsp;·&nbsp;emit threshold: {EMIT_THRESHOLD}%
            </div>
          </div>
        )}
      </div>

      {/* Evidence split bar */}
      {emitted && evidenceTotal > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
            {longPct > 0 && <div style={{ width: `${longPct}%`, background: C.long }} title={`long-leaning: ${longWeight}`} />}
            {neutralPct > 0 && <div style={{ width: `${neutralPct}%`, background: C.neutral }} title={`neutral: ${neutralWeight}`} />}
            {shortPct > 0 && <div style={{ width: `${shortPct}%`, background: C.short }} title={`short-leaning: ${shortWeight}`} />}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.dim, ...mono }}>
            <span style={{ color: longWeight > 0 ? C.long : C.dim }}>long {longWeight}</span>
            {neutralWeight > 0 && <span>neutral {neutralWeight}</span>}
            <span style={{ color: shortWeight > 0 ? C.short : C.dim }}>short {shortWeight}</span>
          </div>
        </div>
      )}

      {/* Trigger chips */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Evidence breakdown</div>
        {triggers.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {triggers.map(t => (
              <span key={t.type} title={t.detail}
                style={{
                  ...mono, fontSize: 11, color: dirColor(t.lean),
                  background: `${dirColor(t.lean)}14`, border: `1px solid ${dirColor(t.lean)}40`,
                  borderRadius: 4, padding: '3px 8px',
                }}>
                {dirArrow(t.lean)} {t.type.replace(/_/g, ' ')} <span style={{ color: C.dim }}>+{t.weight}</span>
              </span>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: C.neutral }}>Waiting for order-flow triggers…</div>
        )}
      </div>

      {/* AI explanation */}
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

      {/* ── Live telemetry grid ──────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <Stat label="CVD" value={fmt(st.cvd)} color={st.cvd != null ? (st.cvd >= 0 ? C.long : C.short) : C.dim} />
        <Stat label="Divergence" value={st.divergence ? st.divergence.kind : 'none'}
              color={st.divergence ? (st.divergence.kind === 'bullish' ? C.long : C.short) : C.dim} />
        <Stat label="Regime"
              value={st.regime ?? (sig?.regime ?? '—')}
              color={
                (st.regime ?? sig?.regime)?.includes('bull') ? C.long :
                (st.regime ?? sig?.regime)?.includes('bear') ? C.short : C.ink
              } />
        {st.oi != null ? (
          <Stat label="Open Interest" value={`$${fmtCompact(st.oi)}`} color={C.ink} />
        ) : (
          <Stat label="Funding" value={
            sig?.triggers.find(t => t.type === 'funding_extreme')
              ? 'extreme'
              : '—'
          } color={C.dim} />
        )}
      </div>

      {/* ── Book Imbalance — value + sparkline + spike log ───────────────────── */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Book Imbalance</div>
          {sessionPeak && (
            <div style={{ ...mono, fontSize: 9, color: C.dim }}>
              session peak: <span style={{ color: C.warn }}>{sessionPeak.ratio.toFixed(1)}×</span>
              {' '}at {new Date(sessionPeak.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ ...mono, fontSize: 18, fontWeight: 700,
            color: st.imbalanceRatio != null ? (st.imbalanceRatio >= 1 ? C.long : C.short) : C.dim }}>
            {st.imbalanceRatio != null ? `${st.imbalanceRatio.toFixed(2)}×` : '—'}
          </div>
          {imbHistory.length >= 2 && (
            <ImbalanceSparkline history={imbHistory} />
          )}
        </div>
        {spikeEvents.length > 0 && (
          <div style={{ marginTop: 6, borderTop: `1px solid ${C.border}`, paddingTop: 5 }}>
            <div style={{ fontSize: 9, color: C.warn, marginBottom: 3, ...mono }}>
              {spikeEvents.length} spike{spikeEvents.length > 1 ? 's' : ''} this session
            </div>
            {spikeEvents.slice(-3).reverse().map((h, i) => (
              <div key={i} style={{ ...mono, fontSize: 9, color: C.dim, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: C.warn }}>{h.ratio.toFixed(1)}×</span>
                <span>{new Date(h.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Sweep log ────────────────────────────────────────────────────────── */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sweeps (session)</div>
          {sweepLog.length > 0 && (
            <div style={{ ...mono, fontSize: 9 }}>
              <span style={{ color: C.long }}>{buySweeps}B</span>
              <span style={{ color: C.dim }}> / </span>
              <span style={{ color: C.short }}>{sellSweeps}S</span>
            </div>
          )}
        </div>
        {sweepLog.length === 0 ? (
          <div style={{ fontSize: 11, color: C.neutral }}>No sweeps detected yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {sweepLog.slice().reverse().map((sw, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '48px auto 1fr', gap: 6, alignItems: 'center', ...mono, fontSize: 10 }}>
                <span style={{ color: C.dim }}>
                  {new Date(sw.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                </span>
                <span style={{
                  color: sw.side === 'buy' ? C.long : C.short,
                  background: `${sw.side === 'buy' ? C.long : C.short}18`,
                  borderRadius: 3, padding: '1px 5px', fontSize: 9,
                }}>
                  {sw.side === 'buy' ? '▲ BUY' : '▼ SELL'}
                </span>
                <span style={{ color: C.ink, textAlign: 'right' }}>
                  ${fmtCompact(sw.notionalUsd)}
                  {sw.absorbed && <span style={{ color: C.warn, marginLeft: 4 }}>ABS</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ fontSize: 10, color: C.neutral, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
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
