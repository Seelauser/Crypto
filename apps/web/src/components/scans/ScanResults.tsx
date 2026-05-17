'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';

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
}

interface Props {
  results:   ScanResult[];
  onExplain: (instrument: string) => void;
}

const COLS = 'Instrument Price CVD Imbalance Delta Quality'.split(' ');
const GRID  = '1fr 90px 110px 100px 90px 80px 90px';

export default function ScanResults({ results, onExplain }: Props) {
  if (results.length === 0) return null;

  return (
    <div style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: GRID }}>
        {[...COLS, 'Action'].map(h => (
          <div key={h} style={{ padding: '10px 14px', fontSize: 11, color: '#8a8f9b', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #1f2128' }}>
            {h}
          </div>
        ))}
      </div>

      {/* Rows */}
      {results.map((r, i) => {
        const qualityColor = r.dataQuality === 'true_l2' ? '#22d3ee' : '#fbbf24';
        return (
          <div key={`${r.instrument}-${i}`} style={{ display: 'grid', gridTemplateColumns: GRID }}>
            {/* Instrument */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #1f2128', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#e6e8ee' }}>{r.instrument}</span>
              <span style={{ fontSize: 11, color: '#8a8f9b', textTransform: 'uppercase' }}>{r.market} · {r.exchange}</span>
              {r.matchedConditions.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                  {r.matchedConditions.map(c => (
                    <span key={c} style={{ fontSize: 9, background: '#1f2128', color: '#22d3ee', padding: '1px 5px', borderRadius: 3, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}>
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Price */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #1f2128', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#e6e8ee', display: 'flex', alignItems: 'center' }}>
              {r.lastPrice.toLocaleString('en-US', { maximumFractionDigits: 6 })}
            </div>

            {/* CVD */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #1f2128', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: r.cvd >= 0 ? '#22d3ee' : '#f97366', display: 'flex', alignItems: 'center', gap: 4 }}>
              {r.cvd >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {r.cvd >= 0 ? '+' : ''}{(r.cvd / 1000).toFixed(1)}K
            </div>

            {/* Imbalance */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #1f2128', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#e6e8ee', display: 'flex', alignItems: 'center' }}>
              {r.imbalanceRatio.toFixed(2)}×
            </div>

            {/* Delta */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #1f2128', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: r.delta >= 0 ? '#22d3ee' : '#f97366', display: 'flex', alignItems: 'center' }}>
              {r.delta >= 0 ? '+' : ''}{(r.delta / 1000).toFixed(0)}K
            </div>

            {/* Quality badge */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #1f2128', display: 'flex', alignItems: 'center' }}>
              <span style={{ border: `1px solid ${qualityColor}`, color: qualityColor, fontSize: 9, padding: '2px 5px', borderRadius: 3, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}>
                {r.dataQuality === 'true_l2' ? 'True L2' : 'Inferred'}
              </span>
            </div>

            {/* Explain */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #1f2128', display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => onExplain(r.instrument)}
                style={{ background: 'none', border: '1px solid #1f2128', borderRadius: 4, padding: '4px 10px', fontSize: 11, color: '#8a8f9b', cursor: 'pointer' }}
              >
                Explain
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
