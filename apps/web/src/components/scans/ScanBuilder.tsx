'use client';

import { Filter as FilterIcon, Play, Loader2 } from 'lucide-react';

const MARKETS = ['crypto', 'stocks', 'futures', 'forex', 'commodities', 'resources'];
const FIELDS  = [
  { id: 'cvd',            label: 'CVD' },
  { id: 'imbalance_ratio', label: 'Imbalance Ratio' },
  { id: 'delta',           label: 'Delta' },
  { id: 'trade_size',      label: 'Trade Size (USD)' },
  { id: 'vwap_distance',   label: 'VWAP Distance %' },
  { id: 'oi_change',       label: 'OI Change %' },
];
const OPS = ['gt', 'lt', 'gte', 'lte'];

export interface ScanFilter {
  field: string;
  op:    string;
  value: string;
}

interface Props {
  scope:     'single_market' | 'cross_market';
  market:    string;
  logic:     'AND' | 'OR';
  filters:   ScanFilter[];
  isLoading: boolean;
  tier:      string;
  scanCount: number;
  onScopeChange:   (s: 'single_market' | 'cross_market') => void;
  onMarketChange:  (m: string) => void;
  onLogicChange:   (l: 'AND' | 'OR') => void;
  onFiltersChange: (f: ScanFilter[]) => void;
  onRun:           () => void;
}

const S = {
  panel:  { background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 20, marginBottom: 20 },
  label:  { fontSize: 12, color: '#8a8f9b', display: 'block' as const, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  select: { background: '#0a0a0b', border: '1px solid #1f2128', borderRadius: 6, color: '#e6e8ee', padding: '7px 10px', fontSize: 13, cursor: 'pointer', outline: 'none' },
  input:  { width: 120, background: '#0a0a0b', border: '1px solid #1f2128', borderRadius: 6, color: '#e6e8ee', padding: '7px 10px', fontSize: 13, outline: 'none', fontFamily: 'JetBrains Mono, monospace' },
} as const;

export default function ScanBuilder({
  scope, market, logic, filters, isLoading, tier, scanCount,
  onScopeChange, onMarketChange, onLogicChange, onFiltersChange, onRun,
}: Props) {
  function addFilter() {
    onFiltersChange([...filters, { field: 'cvd', op: 'gt', value: '' }]);
  }

  function removeFilter(i: number) {
    onFiltersChange(filters.filter((_, idx) => idx !== i));
  }

  function updateFilter(i: number, patch: Partial<ScanFilter>) {
    onFiltersChange(filters.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  }

  return (
    <div style={S.panel}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>

        {/* Scope */}
        <div>
          <label style={S.label}>Scope</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { id: 'single_market', label: 'Single Market' },
              { id: 'cross_market',  label: 'All Markets' },
            ] as const).map(s => {
              const locked = s.id === 'cross_market' && tier === 'free';
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    if (locked) { alert('Cross-market scan requires Pro.'); return; }
                    onScopeChange(s.id);
                  }}
                  style={{
                    background:  scope === s.id ? '#22d3ee' : '#0a0a0b',
                    color:       scope === s.id ? '#0a0a0b' : '#8a8f9b',
                    border:      `1px solid ${scope === s.id ? '#22d3ee' : '#1f2128'}`,
                    borderRadius: 6, padding: '7px 14px', fontSize: 13,
                    cursor: 'pointer', fontWeight: scope === s.id ? 600 : 400,
                    opacity: locked ? 0.5 : 1,
                  }}
                >
                  {s.label}
                  {locked && <span style={{ marginLeft: 6, fontSize: 10, color: '#fbbf24' }}>Pro</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Market (single scope only) */}
        {scope === 'single_market' && (
          <div>
            <label style={S.label}>Market</label>
            <select value={market} onChange={e => onMarketChange(e.target.value)} style={S.select}>
              {MARKETS.map(m => (
                <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
              ))}
            </select>
          </div>
        )}

        {/* Logic */}
        <div>
          <label style={S.label}>Logic</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['AND', 'OR'] as const).map(l => (
              <button key={l} onClick={() => onLogicChange(l)} style={{
                background:  logic === l ? '#181a21' : '#0a0a0b',
                border:      `1px solid ${logic === l ? '#2a2d36' : '#1f2128'}`,
                borderRadius: 6, padding: '7px 14px', fontSize: 13,
                cursor: 'pointer', color: logic === l ? '#e6e8ee' : '#8a8f9b',
                fontFamily: 'JetBrains Mono, monospace',
              }}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filter rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {filters.map((f, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={f.field} onChange={e => updateFilter(i, { field: e.target.value })} style={S.select}>
              {FIELDS.map(field => <option key={field.id} value={field.id}>{field.label}</option>)}
            </select>
            <select value={f.op} onChange={e => updateFilter(i, { op: e.target.value })} style={{ ...S.select, fontFamily: 'JetBrains Mono, monospace' }}>
              {OPS.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
            <input
              value={f.value}
              onChange={e => updateFilter(i, { value: e.target.value })}
              placeholder="0"
              style={S.input}
            />
            {filters.length > 1 && (
              <button onClick={() => removeFilter(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a5f6a', fontSize: 18, lineHeight: 1 }}>×</button>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={addFilter} style={{ background: 'none', border: '1px solid #1f2128', borderRadius: 6, padding: '8px 14px', color: '#8a8f9b', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <FilterIcon size={13} /> Add Filter
        </button>
        <button onClick={onRun} disabled={isLoading} style={{
          background: '#22d3ee', color: '#0a0a0b', border: 'none', borderRadius: 6,
          padding: '8px 20px', fontWeight: 700, fontSize: 14,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 8, opacity: isLoading ? 0.7 : 1,
        }}>
          {isLoading ? <Loader2 size={16} className="spin" /> : <Play size={14} />}
          Run Scan
        </button>
        {tier === 'free' && (
          <span style={{ fontSize: 12, color: '#8a8f9b' }}>{scanCount}/10 scans today</span>
        )}
      </div>
    </div>
  );
}
