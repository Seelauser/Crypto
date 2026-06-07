'use client';

/**
 * MultiTfCvdWidget
 *
 * Shows the net CVD for a single instrument across three timeframes
 * simultaneously (5m / 1H / 4H), computed from the bars API. Each row shows
 * direction arrow, timeframe label, and CVD value. An agreement indicator
 * glows when all three point the same way — the most actionable confluence
 * read in a multi-timeframe stack.
 *
 * Gap 11 from the analyst audit (2026-06-07): "There is no multi-timeframe
 * CVD view for a single instrument … the cross-timeframe CVD conflict on BTC
 * was identified only because I noticed the discrepancy by luck."
 */

import { useEffect, useState } from 'react';

interface TfRow {
  tf:    '5m' | '1h' | '4h';
  label: string;
  cvd:   number | null;
  bars:  number;
}

interface Props {
  instrument: string;
  /** Starter+ only — widget renders a locked state for free tier. */
  tier: 'free' | 'starter' | 'pro';
}

const C = {
  long:   '#22d3ee',
  short:  '#f97366',
  neutral:'#5a5f6a',
  ink:    '#e6e8ee',
  dim:    '#8a8f9b',
  panel:  '#13141a',
  border: '#1f2128',
  bg:     '#0a0a0b',
  warn:   '#fbbf24',
  ok:     '#22c55e',
} as const;
const mono = { fontFamily: 'JetBrains Mono, monospace' } as const;

const TIMEFRAMES: TfRow[] = [
  { tf: '5m',  label: '5 min',  cvd: null, bars: 48  },  // ~4 h of 5m bars
  { tf: '1h',  label: '1 hour', cvd: null, bars: 48  },  // ~48 h of 1H bars
  { tf: '4h',  label: '4 hour', cvd: null, bars: 30  },  // ~5 days of 4H bars
];

function fmtCvd(n: number): string {
  const abs = Math.abs(n);
  const s = n >= 0 ? '+' : '';
  if (abs >= 1_000_000) return `${s}${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${s}${(n / 1_000).toFixed(1)}K`;
  return `${s}${n.toFixed(0)}`;
}

async function fetchNetCvd(instrument: string, tf: string, bars: number): Promise<number | null> {
  try {
    const res = await fetch(`/api/markets/${encodeURIComponent(instrument)}/bars?tf=${tf}&limit=${bars}`);
    if (!res.ok) return null;
    const { bars: data } = await res.json() as { bars: { delta: number }[] };
    if (!Array.isArray(data) || data.length === 0) return null;
    return data.reduce((acc, b) => acc + (b.delta ?? 0), 0);
  } catch {
    return null;
  }
}

export default function MultiTfCvdWidget({ instrument, tier }: Props) {
  const [rows, setRows]     = useState<TfRow[]>(TIMEFRAMES.map(r => ({ ...r })));
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  const isPaid = tier !== 'free';

  useEffect(() => {
    if (!isPaid || !instrument) return;

    const load = async () => {
      setLoading(true);
      const results = await Promise.all(
        TIMEFRAMES.map(r => fetchNetCvd(instrument, r.tf, r.bars)),
      );
      setRows(TIMEFRAMES.map((r, i) => ({ ...r, cvd: results[i] })));
      setLastUpdate(Date.now());
      setLoading(false);
    };

    void load();

    // Refresh every 60 s so the values stay current without hammering the API.
    const timer = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(timer);
  }, [instrument, isPaid]);

  if (!isPaid) {
    return (
      <div style={{ padding: '10px 12px', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6 }}>
        <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Multi-TF CVD
        </div>
        <div style={{ fontSize: 11, color: C.neutral }}>Available on Starter+</div>
      </div>
    );
  }

  // Agreement: all three non-null values share the same sign.
  const nonNull   = rows.filter(r => r.cvd != null);
  const allBull   = nonNull.length === 3 && nonNull.every(r => (r.cvd ?? 0) > 0);
  const allBear   = nonNull.length === 3 && nonNull.every(r => (r.cvd ?? 0) < 0);
  const agreement = allBull ? 'bull' : allBear ? 'bear' : 'mixed';
  const agreeColor = allBull ? C.ok : allBear ? C.short : C.warn;

  return (
    <div style={{ padding: '10px 12px', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Multi-TF CVD
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!loading && lastUpdate && (
            <span style={{ ...mono, fontSize: 9, color: C.dim }}>
              {new Date(lastUpdate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
          )}
          {loading && (
            <span style={{ fontSize: 9, color: C.dim }}>loading…</span>
          )}
          {/* Agreement indicator */}
          {nonNull.length === 3 && (
            <span style={{
              ...mono, fontSize: 9, fontWeight: 700,
              color: agreeColor,
              background: `${agreeColor}18`,
              border: `1px solid ${agreeColor}40`,
              borderRadius: 3, padding: '1px 5px',
            }}>
              {agreement === 'bull' ? '▲ AGREE BULL' : agreement === 'bear' ? '▼ AGREE BEAR' : '⟺ MIXED'}
            </span>
          )}
        </div>
      </div>

      {/* TF rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map(row => {
          const cvdColor = row.cvd == null
            ? C.dim
            : row.cvd > 0 ? C.long : C.short;
          const arrow = row.cvd == null ? '—' : row.cvd > 0 ? '▲' : '▼';
          return (
            <div
              key={row.tf}
              style={{
                display: 'grid',
                gridTemplateColumns: '16px 52px 1fr',
                alignItems: 'center',
                gap: 8,
                padding: '5px 8px',
                background: C.bg,
                borderRadius: 4,
                border: `1px solid ${C.border}`,
              }}
            >
              <span style={{ ...mono, fontSize: 12, color: cvdColor, fontWeight: 700 }}>
                {arrow}
              </span>
              <span style={{ ...mono, fontSize: 10, color: C.dim }}>
                {row.label}
              </span>
              <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: cvdColor, textAlign: 'right' }}>
                {row.cvd == null ? '—' : fmtCvd(row.cvd)}
              </span>
            </div>
          );
        })}
      </div>

      {nonNull.length < 3 && nonNull.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 9, color: C.neutral }}>
          Waiting for all timeframes…
        </div>
      )}
    </div>
  );
}
