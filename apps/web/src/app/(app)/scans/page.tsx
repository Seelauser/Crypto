'use client';

import { useState } from 'react';
import { Play, Loader2, Filter, TrendingUp, TrendingDown } from 'lucide-react';

const MARKETS = ['crypto', 'stocks', 'futures', 'forex', 'commodities', 'resources'];

const FIELDS = [
  { id: 'cvd', label: 'CVD' },
  { id: 'imbalance_ratio', label: 'Imbalance Ratio' },
  { id: 'delta', label: 'Delta' },
  { id: 'trade_size', label: 'Trade Size (USD)' },
  { id: 'vwap_distance', label: 'VWAP Distance %' },
  { id: 'oi_change', label: 'OI Change %' },
];

const OPS = ['gt', 'lt', 'gte', 'lte'];

interface Filter {
  field: string;
  op: string;
  value: string;
}

interface ScanResult {
  instrument: string;
  exchange: string;
  market: string;
  cvd: number;
  delta: number;
  imbalanceRatio: number;
  lastPrice: number;
  priceChange24h: number;
  volume24h: number;
  dataQuality: 'true_l2' | 'inferred';
  matchedConditions: string[];
}

export default function ScansPage() {
  const [scope, setScope] = useState<'single_market' | 'cross_market'>('single_market');
  const [market, setMarket] = useState('crypto');
  const [logic, setLogic] = useState<'AND' | 'OR'>('AND');
  const [filters, setFilters] = useState<Filter[]>([{ field: 'cvd', op: 'gt', value: '' }]);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const tier = 'free'; // Would come from session in real app

  function addFilter() {
    setFilters(prev => [...prev, { field: 'cvd', op: 'gt', value: '' }]);
  }

  function removeFilter(i: number) {
    setFilters(prev => prev.filter((_, idx) => idx !== i));
  }

  async function runScan() {
    if (scanCount >= 10 && tier === 'free') {
      alert('Daily scan limit reached. Upgrade to Pro for unlimited scans.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: tier === 'premium' ? scope : 'single_market',
          market,
          conditions: {
            logic,
            filters: filters.map(f => ({ field: f.field, op: f.op, value: parseFloat(f.value) || 0 })),
          },
        }),
      });
      const data = await res.json();
      if (data.results) {
        setResults(data.results);
        setScanCount(c => c + 1);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6e8ee', margin: 0 }}>Live Order Flow Scan</h1>
          <p style={{ color: '#8a8f9b', fontSize: 13, marginTop: 4 }}>
            {tier === 'free' ? `${scanCount}/10 scans used today` : 'Unlimited scans'}
          </p>
        </div>
      </div>

      {/* Scan Builder */}
      <div style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          {/* Scope */}
          <div>
            <label style={{ fontSize: 12, color: '#8a8f9b', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scope</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ id: 'single_market', label: 'Single Market' }, { id: 'cross_market', label: 'All Markets' }].map(s => (
                <button
                  key={s.id}
                  onClick={() => {
                    if (s.id === 'cross_market' && tier === 'free') {
                      alert('Cross-market scan requires Pro.');
                      return;
                    }
                    setScope(s.id as any);
                  }}
                  style={{
                    background: scope === s.id ? '#22d3ee' : '#0a0a0b',
                    color: scope === s.id ? '#0a0a0b' : '#8a8f9b',
                    border: `1px solid ${scope === s.id ? '#22d3ee' : '#1f2128'}`,
                    borderRadius: 6, padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontWeight: scope === s.id ? 600 : 400,
                    opacity: s.id === 'cross_market' && tier === 'free' ? 0.5 : 1,
                  }}
                >
                  {s.label}
                  {s.id === 'cross_market' && tier === 'free' && <span style={{ marginLeft: 6, fontSize: 10, color: '#fbbf24' }}>Pro</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Market (when single) */}
          {scope === 'single_market' && (
            <div>
              <label style={{ fontSize: 12, color: '#8a8f9b', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Market</label>
              <select
                value={market}
                onChange={e => setMarket(e.target.value)}
                style={{ background: '#0a0a0b', border: '1px solid #1f2128', borderRadius: 6, color: '#e6e8ee', padding: '7px 12px', fontSize: 13, cursor: 'pointer', outline: 'none' }}
              >
                {MARKETS.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </select>
            </div>
          )}

          {/* Logic */}
          <div>
            <label style={{ fontSize: 12, color: '#8a8f9b', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Logic</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['AND', 'OR'] as const).map(l => (
                <button key={l} onClick={() => setLogic(l)}
                  style={{ background: logic === l ? '#181a21' : '#0a0a0b', border: `1px solid ${logic === l ? '#2a2d36' : '#1f2128'}`, borderRadius: 6, padding: '7px 14px', fontSize: 13, cursor: 'pointer', color: logic === l ? '#e6e8ee' : '#8a8f9b', fontFamily: 'JetBrains Mono, monospace' }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {filters.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={f.field} onChange={e => setFilters(prev => prev.map((x, idx) => idx === i ? { ...x, field: e.target.value } : x))}
                style={{ background: '#0a0a0b', border: '1px solid #1f2128', borderRadius: 6, color: '#e6e8ee', padding: '7px 10px', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
                {FIELDS.map(field => <option key={field.id} value={field.id}>{field.label}</option>)}
              </select>
              <select value={f.op} onChange={e => setFilters(prev => prev.map((x, idx) => idx === i ? { ...x, op: e.target.value } : x))}
                style={{ background: '#0a0a0b', border: '1px solid #1f2128', borderRadius: 6, color: '#e6e8ee', padding: '7px 10px', fontSize: 13, cursor: 'pointer', outline: 'none', fontFamily: 'JetBrains Mono, monospace' }}>
                {OPS.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              <input value={f.value} onChange={e => setFilters(prev => prev.map((x, idx) => idx === i ? { ...x, value: e.target.value } : x))}
                placeholder="0"
                style={{ width: 120, background: '#0a0a0b', border: '1px solid #1f2128', borderRadius: 6, color: '#e6e8ee', padding: '7px 10px', fontSize: 13, outline: 'none', fontFamily: 'JetBrains Mono, monospace' }} />
              {filters.length > 1 && (
                <button onClick={() => removeFilter(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a5f6a', fontSize: 18, lineHeight: 1 }}>×</button>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={addFilter} style={{ background: 'none', border: '1px solid #1f2128', borderRadius: 6, padding: '8px 14px', color: '#8a8f9b', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Filter size={13} /> Add Filter
          </button>
          <button onClick={runScan} disabled={loading}
            style={{ background: '#22d3ee', color: '#0a0a0b', border: 'none', borderRadius: 6, padding: '8px 20px', fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: loading ? 0.7 : 1 }}>
            {loading ? <Loader2 size={16} className="spin" /> : <Play size={14} />}
            Run Scan
          </button>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 100px 80px 80px', gap: 0 }}>
            {['Instrument', 'Price', 'CVD', 'Imbalance', 'Delta', 'Quality'].map(h => (
              <div key={h} style={{ padding: '10px 14px', fontSize: 11, color: '#8a8f9b', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #1f2128' }}>
                {h}
              </div>
            ))}

            {results.map((r, i) => (
              <>
                <div key={`${r.instrument}-name-${i}`} style={{ padding: '12px 14px', borderBottom: '1px solid #1f2128', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#e6e8ee' }}>{r.instrument}</span>
                  <span style={{ fontSize: 11, color: '#8a8f9b', textTransform: 'uppercase' }}>{r.market} · {r.exchange}</span>
                </div>
                <div key={`${r.instrument}-price-${i}`} style={{ padding: '12px 14px', borderBottom: '1px solid #1f2128', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#e6e8ee', display: 'flex', alignItems: 'center' }}>{r.lastPrice.toFixed(2)}</div>
                <div key={`${r.instrument}-cvd-${i}`} style={{ padding: '12px 14px', borderBottom: '1px solid #1f2128', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: r.cvd > 0 ? '#22d3ee' : '#f97366', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {r.cvd > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {r.cvd > 0 ? '+' : ''}{(r.cvd / 1000).toFixed(1)}K
                </div>
                <div key={`${r.instrument}-imb-${i}`} style={{ padding: '12px 14px', borderBottom: '1px solid #1f2128', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#e6e8ee', display: 'flex', alignItems: 'center' }}>{r.imbalanceRatio.toFixed(2)}×</div>
                <div key={`${r.instrument}-delta-${i}`} style={{ padding: '12px 14px', borderBottom: '1px solid #1f2128', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: r.delta > 0 ? '#22d3ee' : '#f97366', display: 'flex', alignItems: 'center' }}>{r.delta > 0 ? '+' : ''}{(r.delta / 1000).toFixed(0)}K</div>
                <div key={`${r.instrument}-quality-${i}`} style={{ padding: '12px 14px', borderBottom: '1px solid #1f2128', display: 'flex', alignItems: 'center' }}>
                  <span style={{ border: `1px solid ${r.dataQuality === 'true_l2' ? '#22d3ee' : '#fbbf24'}`, color: r.dataQuality === 'true_l2' ? '#22d3ee' : '#fbbf24', fontSize: 9, padding: '2px 5px', borderRadius: 3, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}>
                    {r.dataQuality === 'true_l2' ? 'True L2' : 'Inferred'}
                  </span>
                </div>
              </>
            ))}
          </div>
        </div>
      )}

      <style>{`.spin { animation: spin 600ms linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
