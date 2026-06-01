'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import TermTip from '@/components/ui/TermTip';
import { REGIME_META } from '@/lib/regimes';

export interface ScanResult {
  instrument:        string;
  exchange:          string;
  market:            string;
  cvd:               number;
  delta:             number;
  imbalanceRatio:    number;
  lastPrice:         number;
  priceChange24h:    number;
  volume24h:         number;
  dataQuality:       'true_l2' | 'inferred';
  matchedConditions: string[];
  regime?:           string;   // optional HMM regime for this instrument
  followThroughPct?: number;   // historical hit rate for this condition cluster (0-100)
}

interface Props {
  results:   ScanResult[];
  onExplain: (instrument: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Maps a matched condition ID to a plain-English label and a TermTip term.
const CONDITION_META: Record<string, { label: string; tip: string }> = {
  cvd:             { label: 'CVD positive',      tip: 'Cumulative buying pressure exceeds your threshold.' },
  delta:           { label: 'Delta confirm',     tip: 'Net buy/sell volume on recent bars confirms the direction.' },
  imbalance_ratio: { label: 'Book imbalance',    tip: 'Order book is lopsided — one side has significantly more resting orders.' },
  trade_size:      { label: 'Large print',       tip: 'A single trade of unusual size was detected — potential institutional activity.' },
  vwap_distance:   { label: 'VWAP extension',   tip: 'Price is trading significantly above or below its volume-weighted average for the day.' },
  oi_change:       { label: 'OI shift',          tip: 'Open interest changed significantly — new money flowing in or positions being closed.' },
};

// REGIME_META imported from @/lib/regimes — 'tip' field used as hover text here

// Generates a plain-English "why this matters" summary for a scan result.
function narrateResult(r: ScanResult): string {
  const cvdDir  = r.cvd >= 0 ? 'positive' : 'negative';
  const impulse = Math.abs(r.cvd) > 10000 ? 'strongly ' : '';
  const imb     = r.imbalanceRatio > 2
    ? `The order book shows ${r.imbalanceRatio.toFixed(1)}× more ${r.delta >= 0 ? 'bid' : 'ask'} volume than the opposing side. `
    : '';
  const regime    = r.regime ? REGIME_META[r.regime as keyof typeof REGIME_META] : null;
  const regimeCtx = regime
    ? `Current market state: ${regime.label.toLowerCase()} — ${regime.tip} `
    : '';
  return `${r.instrument} has ${impulse}${cvdDir} cumulative volume delta (${r.cvd >= 0 ? '+' : ''}${(r.cvd / 1000).toFixed(1)}K). ${imb}${regimeCtx}`.trim();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScanResults({ results, onExplain }: Props) {
  // Compute narratives once per result-set, not on every render
  const enriched = useMemo(
    () => results.map(r => ({ ...r, narrative: narrateResult(r) })),
    [results],
  );

  if (results.length === 0) return null;

  return (
    <div>
      {/* Result count */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: '#8a8f9b', margin: 0 }}>
          <strong style={{ color: '#e6e8ee' }}>{results.length}</strong> instrument{results.length !== 1 ? 's' : ''} matched your scan
        </p>
        <p style={{ fontSize: 11, color: '#5a5f6a', margin: 0 }}>
          sorted by signal strength ↓
        </p>
      </div>

      {/* Table */}
      <div style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 120px 110px 90px 80px 80px 100px', borderBottom: '1px solid #1f2128' }}>
          {[
            { label: 'Instrument',   tip: null },
            { label: 'Price',        tip: null },
            { label: 'CVD',          tip: 'cvd' as const },
            { label: 'Imbalance',    tip: 'imbalance_ratio' as const },
            { label: 'Delta',        tip: 'delta' as const },
            { label: 'Regime',       tip: 'regime' as const },
            { label: 'Quality',      tip: 'true_l2' as const },
            { label: 'Action',       tip: null },
          ].map(({ label, tip }) => (
            <div
              key={label}
              style={{ padding: '9px 14px', fontSize: 10, color: '#5a5f6a', textTransform: 'uppercase', letterSpacing: '0.08em' }}
            >
              {tip ? <TermTip term={tip}>{label}</TermTip> : label}
            </div>
          ))}
        </div>

        {/* Rows */}
        {enriched.map((r, i) => {
          const qualityColor = r.dataQuality === 'true_l2' ? '#22d3ee' : '#fbbf24';
          const regimeMeta   = r.regime ? REGIME_META[r.regime as keyof typeof REGIME_META] : null;
          const { narrative } = r;

          return (
            <div
              key={`${r.instrument}-${i}`}
              style={{ borderBottom: '1px solid #1f2128' }}
            >
              {/* Main row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 120px 110px 90px 80px 80px 100px' }}>
                {/* Instrument */}
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#e6e8ee' }}>
                    {r.instrument}
                  </span>
                  <span style={{ fontSize: 10, color: '#8a8f9b', textTransform: 'uppercase' }}>
                    {r.market} · {r.exchange}
                  </span>
                  {r.matchedConditions.length > 0 && (
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 2 }}>
                      {r.matchedConditions.map(c => {
                        const cm = CONDITION_META[c];
                        return (
                          <span
                            key={c}
                            title={cm?.tip ?? c}
                            style={{ fontSize: 9, background: '#22d3ee18', color: '#22d3ee', padding: '1px 5px', borderRadius: 3, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', cursor: 'help' }}
                          >
                            {cm?.label ?? c}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Price */}
                <div style={{ padding: '12px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#e6e8ee', display: 'flex', alignItems: 'center' }}>
                  {r.lastPrice.toLocaleString('en-US', { maximumFractionDigits: r.lastPrice >= 100 ? 2 : 6 })}
                </div>

                {/* CVD */}
                <div style={{ padding: '12px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: r.cvd >= 0 ? '#22d3ee' : '#f97366', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {r.cvd >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {r.cvd >= 0 ? '+' : ''}{(r.cvd / 1000).toFixed(1)}K
                </div>

                {/* Imbalance */}
                <div style={{ padding: '12px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: r.imbalanceRatio >= 2 ? '#fbbf24' : '#e6e8ee', display: 'flex', alignItems: 'center' }}>
                  {r.imbalanceRatio.toFixed(2)}×
                  {r.imbalanceRatio >= 3 && (
                    <span title="Strong imbalance — significant directional pressure" style={{ marginLeft: 4, fontSize: 9, color: '#fbbf24' }}>!</span>
                  )}
                </div>

                {/* Delta */}
                <div style={{ padding: '12px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: r.delta >= 0 ? '#22d3ee' : '#f97366', display: 'flex', alignItems: 'center' }}>
                  {r.delta >= 0 ? '+' : ''}{(r.delta / 1000).toFixed(0)}K
                </div>

                {/* Regime */}
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center' }}>
                  {regimeMeta ? (
                    <span
                      title={regimeMeta.tip}
                      style={{
                        fontSize: 9, padding: '2px 6px', borderRadius: 4,
                        background: `${regimeMeta.color}18`, color: regimeMeta.color,
                        border: `1px solid ${regimeMeta.color}30`, cursor: 'help',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {regimeMeta.label}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: '#5a5f6a' }}>—</span>
                  )}
                </div>

                {/* Quality */}
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center' }}>
                  <span
                    title={r.dataQuality === 'true_l2'
                      ? 'True L2: Full order book data from direct exchange connection. Maximum accuracy.'
                      : 'Inferred: Order flow estimated from OHLCV price data. Accurate for major moves, less precise for small imbalances.'}
                    style={{
                      border: `1px solid ${qualityColor}`, color: qualityColor,
                      fontSize: 9, padding: '2px 5px', borderRadius: 3,
                      fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase',
                      cursor: 'help',
                    }}
                  >
                    {r.dataQuality === 'true_l2' ? 'L2' : 'Inf'}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    onClick={() => onExplain(r.instrument)}
                    style={{
                      background: 'none', border: '1px solid #1f2128', borderRadius: 4,
                      padding: '5px 10px', fontSize: 11, color: '#8a8f9b', cursor: 'pointer',
                    }}
                    title="Get an AI explanation of what the order flow is saying about this instrument right now"
                  >
                    AI
                  </button>
                </div>
              </div>

              {/* Narrative row — plain-English explanation beneath each result */}
              <div style={{ padding: '0 14px 10px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <p style={{ margin: 0, fontSize: 11, color: '#5a5f6a', lineHeight: 1.6, flex: 1 }}>
                  {narrative}
                </p>
                {/* Historical follow-through badge */}
                {r.followThroughPct !== undefined && (
                  <div
                    style={{
                      flexShrink: 0,
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      background: '#0a0a0b', border: '1px solid #1f2128', borderRadius: 6,
                      padding: '6px 10px',
                    }}
                    title="Percentage of historical scans with this condition cluster that moved 1%+ in the expected direction within 4 hours"
                  >
                    <span
                      style={{
                        fontSize: 16, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
                        color: r.followThroughPct >= 65 ? '#22c55e' : r.followThroughPct >= 45 ? '#fbbf24' : '#f97366',
                      }}
                    >
                      {r.followThroughPct}%
                    </span>
                    <span style={{ fontSize: 9, color: '#5a5f6a', marginTop: 2, textAlign: 'center' }}>
                      historical<br />follow-through
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer legend */}
      <div style={{ marginTop: 10, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, background: '#22d3ee18', color: '#22d3ee', padding: '1px 6px', borderRadius: 3, border: '1px solid #22d3ee30', fontFamily: 'JetBrains Mono, monospace' }}>L2</span>
          <span style={{ fontSize: 10, color: '#5a5f6a' }}>
            <TermTip term="true_l2">Full real-time order book</TermTip> (crypto only)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, background: '#fbbf2418', color: '#fbbf24', padding: '1px 6px', borderRadius: 3, border: '1px solid #fbbf2430', fontFamily: 'JetBrains Mono, monospace' }}>Inf</span>
          <span style={{ fontSize: 10, color: '#5a5f6a' }}>
            <TermTip term="inferred">Derived from OHLCV price data</TermTip> (stocks, futures, forex)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#5a5f6a' }}>
            <TermTip term="regime">Regime</TermTip>: current statistical market state — context for signal reliability
          </span>
        </div>
      </div>
    </div>
  );
}
