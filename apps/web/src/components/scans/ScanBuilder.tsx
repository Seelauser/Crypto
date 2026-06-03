'use client';

import { useState } from 'react';
import { Filter as FilterIcon, Play, Loader2, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import TermTip from '@/components/ui/TermTip';

// ─── Preset Packs ─────────────────────────────────────────────────────────────
// Each preset is a named, pre-filled scan with a plain-language explanation of
// what it detects, why it matters, and what to do when it fires.

interface Preset {
  id:          string;
  label:       string;
  emoji:       string;
  tagline:     string;       // one sentence — what this scan finds
  explanation: string;       // 2-3 sentences — what it means for the trader
  color:       string;
  proOnly:     boolean;
  scope:       'single_market' | 'cross_market';
  market:      string;
  logic:       'AND' | 'OR';
  filters:     ScanFilter[];
}

const PRESETS: Preset[] = [
  {
    id:          'institutional_accumulation',
    label:       'Institutional Accumulation',
    emoji:       '🐋',
    tagline:     'Find instruments where large buyers are quietly building positions.',
    explanation: 'A sweep with positive CVD near the volume point of control is the classic footprint of an institution entering a long position. They hit the ask aggressively (sweep), net buying pressure is high (CVD positive), and it happens at a price level where a lot of historical volume has traded (near VPOC) — meaning smart money chose THIS price to accumulate.',
    color:       '#22d3ee',
    proOnly:     false,
    scope:       'single_market',
    market:      'crypto',
    logic:       'AND',
    filters: [
      { field: 'cvd',            op: 'gt',  value: '5000'  },
      { field: 'imbalance_ratio', op: 'gt', value: '2.5'  },
      { field: 'trade_size',      op: 'gt', value: '100000' },
    ],
  },
  {
    id:          'exhaustion_top',
    label:       'Exhaustion Top',
    emoji:       '⚠️',
    tagline:     'Find instruments where buying has dried up at recent highs.',
    explanation: 'When price is at or near a recent high but the delta has flipped negative, buyers have run out. The last people to buy are now trapped, and the next move is likely a pullback. This is a high-probability short setup or a signal to take profits on long positions.',
    color:       '#f97366',
    proOnly:     false,
    scope:       'single_market',
    market:      'crypto',
    logic:       'AND',
    filters: [
      { field: 'delta',          op: 'lt',  value: '-2000'  },
      { field: 'vwap_distance',  op: 'gt',  value: '1.5'    },
    ],
  },
  {
    id:          'hidden_buying',
    label:       'Hidden Buying (Bullish Divergence)',
    emoji:       '🔍',
    tagline:     'Price is falling but CVD is rising — institutional buyers are absorbing the drop.',
    explanation: 'When price makes a new low but the CVD stays above its previous low, large buyers are soaking up the selling. The surface-level price action looks bearish, but the order flow tells a different story. This often precedes sharp reversals upward as the sellers finally exhaust themselves.',
    color:       '#22c55e',
    proOnly:     false,
    scope:       'single_market',
    market:      'crypto',
    logic:       'AND',
    filters: [
      { field: 'cvd',            op: 'gt',  value: '1000'   },
      { field: 'imbalance_ratio', op: 'gt', value: '1.8'   },
    ],
  },
  {
    id:          'sweep_momentum',
    label:       'Sweep & Follow-Through',
    emoji:       '⚡',
    tagline:     'Find aggressive buyers or sellers sweeping the order book right now.',
    explanation: 'A sweep means someone is hitting every resting limit order in their way — they need in urgently. Sweeps with high CVD and large trade size suggest real conviction, not noise. These setups have historically shown strong continuation momentum in the sweep direction within the next 15 minutes.',
    color:       '#fbbf24',
    proOnly:     false,
    scope:       'single_market',
    market:      'crypto',
    logic:       'AND',
    filters: [
      { field: 'trade_size',      op: 'gt', value: '250000' },
      { field: 'cvd',             op: 'gt', value: '3000'   },
    ],
  },
  {
    id:          'cross_market_divergence',
    label:       'Cross-Market Divergence',
    emoji:       '🌐',
    tagline:     'Find instruments out-of-step with the broader market trend.',
    explanation: 'When most of a market sector is trending down but one instrument has strongly positive CVD, something specific is happening there — inside buying, news catalyst, or institutional accumulation against the trend. These contrarian setups often have the best risk/reward when confirmed by the order flow.',
    color:       '#a78bfa',
    proOnly:     true,
    scope:       'cross_market',
    market:      'crypto',
    logic:       'AND',
    filters: [
      { field: 'cvd',            op: 'gt', value: '8000'  },
      { field: 'imbalance_ratio', op: 'gt', value: '3.0' },
    ],
  },
  {
    id:          'large_print_cluster',
    label:       'Whale Print Cluster',
    emoji:       '🦈',
    tagline:     'Find instruments with unusually large trades hitting the market.',
    explanation: 'Institutions rarely reveal their full size, but occasionally a large print slips through — a single trade far bigger than the instrument\'s average. When multiple large prints cluster in the same direction, it suggests coordinated institutional activity. These are the footprints of serious money.',
    color:       '#60a5fa',
    proOnly:     false,
    scope:       'single_market',
    market:      'crypto',
    logic:       'AND',
    filters: [
      { field: 'trade_size',     op: 'gt', value: '500000' },
      { field: 'cvd',            op: 'gt', value: '2000'   },
    ],
  },
];

// ─── Markets + Fields ─────────────────────────────────────────────────────────

const MARKETS = ['crypto', 'stocks', 'futures', 'forex', 'commodities', 'resources'];

const FIELDS: Array<{ id: string; label: string; term?: string; description: string }> = [
  { id: 'cvd',            label: 'CVD',              term: 'cvd',            description: 'Cumulative buy minus sell volume' },
  { id: 'imbalance_ratio', label: 'Imbalance Ratio', term: 'imbalance_ratio', description: 'Bid vs ask volume ratio at top of book' },
  { id: 'delta',           label: 'Bar Delta',        term: 'delta',          description: 'Net buy/sell volume this candle' },
  { id: 'trade_size',      label: 'Trade Size (USD)', term: 'large_print',    description: 'Single-trade USD notional' },
  { id: 'vwap_distance',   label: 'VWAP Distance %',  term: 'vwap',           description: '% away from Volume Weighted Average Price' },
  { id: 'oi_change',       label: 'OI Change %',      term: 'oi',             description: 'Open interest % change (futures/options only)' },
];

const OPS: Array<{ id: string; label: string; meaning: string }> = [
  { id: 'gt',  label: '>',  meaning: 'greater than' },
  { id: 'gte', label: '≥',  meaning: 'greater than or equal to' },
  { id: 'lt',  label: '<',  meaning: 'less than' },
  { id: 'lte', label: '≤',  meaning: 'less than or equal to' },
  { id: 'eq',  label: '=',  meaning: 'exactly equal to' },
];

export interface ScanFilter {
  field: string;
  op:    string;
  value: string;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  panel:  { background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 20, marginBottom: 20 },
  label:  { fontSize: 11, color: '#8a8f9b', display: 'block' as const, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.06em' },
  select: { background: '#0a0a0b', border: '1px solid #1f2128', borderRadius: 6, color: '#e6e8ee', padding: '7px 10px', fontSize: 13, cursor: 'pointer', outline: 'none' },
  input:  { width: 110, background: '#0a0a0b', border: '1px solid #1f2128', borderRadius: 6, color: '#e6e8ee', padding: '7px 10px', fontSize: 13, outline: 'none', fontFamily: 'JetBrains Mono, monospace' },
} as const;

// ─── Props ────────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScanBuilder({
  scope, market, logic, filters, isLoading, tier, scanCount,
  onScopeChange, onMarketChange, onLogicChange, onFiltersChange, onRun,
}: Props) {
  const [showPresets, setShowPresets]       = useState(true);
  const [activePreset, setActivePreset]     = useState<string | null>(null);
  const [showCustom, setShowCustom]         = useState(false);
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);

  function applyPreset(preset: Preset) {
    if (preset.proOnly && tier !== 'pro') {
      alert('This preset requires Pro. Upgrade to unlock cross-market scans.');
      return;
    }
    setActivePreset(preset.id);
    onScopeChange(preset.scope);
    onMarketChange(preset.market);
    onLogicChange(preset.logic);
    onFiltersChange(preset.filters);
  }

  function addFilter() {
    onFiltersChange([...filters, { field: 'cvd', op: 'gt', value: '' }]);
  }

  function removeFilter(i: number) {
    onFiltersChange(filters.filter((_, idx) => idx !== i));
  }

  function updateFilter(i: number, patch: Partial<ScanFilter>) {
    onFiltersChange(filters.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  }

  const fieldMeta = (id: string) => FIELDS.find(f => f.id === id);

  return (
    <div style={S.panel}>

      {/* ── Section header ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={14} color="#22d3ee" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e6e8ee' }}>Scan Presets</span>
          <span style={{ fontSize: 11, color: '#5a5f6a' }}>— click to auto-fill</span>
        </div>
        <button
          onClick={() => setShowPresets(p => !p)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a5f6a', display: 'flex', alignItems: 'center' }}
        >
          {showPresets ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* ── Preset cards ─────────────────────────────────────────────────── */}
      {showPresets && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, marginBottom: 20 }}>
          {PRESETS.map(preset => {
            const locked   = preset.proOnly && tier !== 'pro';
            const isActive = activePreset === preset.id;
            const isExpanded = expandedPreset === preset.id;

            return (
              <div
                key={preset.id}
                style={{
                  background:    isActive ? `${preset.color}12` : '#0a0a0b',
                  border:        `1px solid ${isActive ? preset.color : '#1f2128'}`,
                  borderRadius:  8,
                  padding:       '12px 14px',
                  opacity:       locked ? 0.6 : 1,
                  cursor:        locked ? 'not-allowed' : 'pointer',
                  transition:    'border-color 0.15s, background 0.15s',
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 18, lineHeight: 1.2 }}>{preset.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#e6e8ee' }}>{preset.label}</span>
                      {locked && (
                        <span style={{ fontSize: 9, background: '#fbbf2420', color: '#fbbf24', border: '1px solid #fbbf2430', borderRadius: 4, padding: '1px 5px' }}>Pro</span>
                      )}
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: '#8a8f9b', lineHeight: 1.5 }}>
                      {preset.tagline}
                    </p>
                  </div>
                </div>

                {/* Expanded explanation */}
                {isExpanded && (
                  <p style={{ margin: '10px 0 0', fontSize: 11, color: '#8a8f9b', lineHeight: 1.7, borderTop: '1px solid #1f2128', paddingTop: 10 }}>
                    {preset.explanation}
                  </p>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button
                    onClick={() => applyPreset(preset)}
                    disabled={locked}
                    style={{
                      flex:         1,
                      background:   isActive ? preset.color : 'transparent',
                      color:        isActive ? '#0a0a0b' : preset.color,
                      border:       `1px solid ${preset.color}`,
                      borderRadius: 5,
                      padding:      '5px 0',
                      fontSize:     11,
                      fontWeight:   600,
                      cursor:       locked ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isActive ? '✓ Applied' : 'Apply'}
                  </button>
                  <button
                    onClick={() => setExpandedPreset(isExpanded ? null : preset.id)}
                    style={{
                      background:   'transparent',
                      border:       '1px solid #1f2128',
                      borderRadius: 5,
                      padding:      '5px 8px',
                      fontSize:     10,
                      color:        '#5a5f6a',
                      cursor:       'pointer',
                    }}
                    title={isExpanded ? 'Hide explanation' : 'What does this mean?'}
                  >
                    {isExpanded ? '−' : '?'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Custom filter toggle ─────────────────────────────────────────── */}
      <button
        onClick={() => setShowCustom(c => !c)}
        style={{
          background: 'none', border: '1px solid #1f2128', borderRadius: 6,
          padding: '7px 14px', color: '#8a8f9b', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: showCustom ? 16 : 0,
        }}
      >
        <FilterIcon size={12} />
        {showCustom ? 'Hide' : 'Show'} custom filters
        {showCustom ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {/* ── Custom filter builder ────────────────────────────────────────── */}
      {showCustom && (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>

            {/* Scope */}
            <div>
              <label style={S.label}>Scope</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {([
                  { id: 'single_market', label: 'Single Market',          tip: 'Scan one asset class (e.g. only crypto).' },
                  { id: 'cross_market',  label: 'All Markets (Pro)',       tip: 'Scan all asset classes simultaneously — only available on Pro.' },
                ] as const).map(s => {
                  const locked = s.id === 'cross_market' && tier === 'free';
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        if (locked) { alert('Cross-market scan requires Pro.'); return; }
                        onScopeChange(s.id);
                        setActivePreset(null);
                      }}
                      title={s.tip}
                      style={{
                        background:   scope === s.id ? '#22d3ee' : '#0a0a0b',
                        color:        scope === s.id ? '#0a0a0b' : '#8a8f9b',
                        border:       `1px solid ${scope === s.id ? '#22d3ee' : '#1f2128'}`,
                        borderRadius: 6, padding: '7px 14px', fontSize: 12,
                        cursor: locked ? 'not-allowed' : 'pointer',
                        fontWeight: scope === s.id ? 600 : 400,
                        opacity: locked ? 0.5 : 1,
                      }}
                    >
                      {s.id === 'single_market' ? 'Single Market' : 'All Markets'}
                      {locked && <span style={{ marginLeft: 5, fontSize: 9, color: '#fbbf24' }}>Pro</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Market (single scope only) */}
            {scope === 'single_market' && (
              <div>
                <label style={S.label}>Market</label>
                <select
                  value={market}
                  onChange={e => { onMarketChange(e.target.value); setActivePreset(null); }}
                  style={S.select}
                >
                  {MARKETS.map(m => (
                    <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Logic */}
            <div>
              <label style={S.label} title="AND = all conditions must match. OR = any condition matches.">
                Combine Filters
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['AND', 'OR'] as const).map(l => (
                  <button
                    key={l}
                    onClick={() => { onLogicChange(l); setActivePreset(null); }}
                    title={l === 'AND' ? 'All conditions must match' : 'Any condition can match'}
                    style={{
                      background:   logic === l ? '#181a21' : '#0a0a0b',
                      border:       `1px solid ${logic === l ? '#2a2d36' : '#1f2128'}`,
                      borderRadius: 6, padding: '7px 14px', fontSize: 12,
                      cursor: 'pointer', color: logic === l ? '#e6e8ee' : '#8a8f9b',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 10, color: '#5a5f6a' }}>
                {logic === 'AND' ? 'Every filter must match.' : 'At least one filter must match.'}
              </p>
            </div>
          </div>

          {/* Filter rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {filters.map((f, i) => {
              const meta = fieldMeta(f.field);
              return (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={f.field}
                    onChange={e => updateFilter(i, { field: e.target.value })}
                    style={S.select}
                    title={meta?.description}
                  >
                    {FIELDS.map(field => (
                      <option key={field.id} value={field.id}>{field.label}</option>
                    ))}
                  </select>

                  <select
                    value={f.op}
                    onChange={e => updateFilter(i, { op: e.target.value })}
                    style={{ ...S.select, fontFamily: 'JetBrains Mono, monospace' }}
                    title={OPS.find(o => o.id === f.op)?.meaning}
                  >
                    {OPS.map(op => <option key={op.id} value={op.id}>{op.label}</option>)}
                  </select>

                  <input
                    value={f.value}
                    onChange={e => updateFilter(i, { value: e.target.value })}
                    placeholder="value"
                    style={S.input}
                  />

                  {/* Field description */}
                  {meta?.term && (
                    <span style={{ fontSize: 10, color: '#5a5f6a' }}>
                      <TermTip term={meta.term as 'cvd'}>{meta.description}</TermTip>
                    </span>
                  )}

                  {filters.length > 1 && (
                    <button
                      onClick={() => removeFilter(i)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a5f6a', fontSize: 18, lineHeight: 1 }}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={addFilter}
            style={{ background: 'none', border: '1px solid #1f2128', borderRadius: 6, padding: '7px 14px', color: '#8a8f9b', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14 }}
          >
            <FilterIcon size={12} /> Add filter
          </button>
        </>
      )}

      {/* ── Run ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
        <button
          onClick={onRun}
          disabled={isLoading}
          style={{
            background: '#22d3ee', color: '#0a0a0b', border: 'none', borderRadius: 6,
            padding: '9px 24px', fontWeight: 700, fontSize: 14,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, opacity: isLoading ? 0.7 : 1,
          }}
        >
          {isLoading ? <Loader2 size={15} className="spin" /> : <Play size={14} />}
          Run Scan
        </button>
        {tier === 'free' && (
          <span style={{ fontSize: 11, color: '#5a5f6a' }}>
            {scanCount}/10 scans today &mdash;{' '}
            <a href="/billing/upgrade" style={{ color: '#22d3ee', textDecoration: 'none' }}>upgrade for unlimited</a>
          </span>
        )}
      </div>
    </div>
  );
}
