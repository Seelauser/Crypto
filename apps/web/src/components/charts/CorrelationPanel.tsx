'use client';

import { useState, useCallback } from 'react';
import { RefreshCw, Loader2, GitCompare } from 'lucide-react';
import type { UserTier } from '@orderflow/types';
import { api, ApiError } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  defaultInstrumentA: string;
  defaultInstrumentB: string;
  availableInstruments: string[];
  tier: UserTier;
}

interface CorrelationResult {
  instrumentA:  string;
  instrumentB:  string;
  correlation:  number | null;
  isDivergent:  boolean;
  sampleSize:   number;
  narration:    string | null;
  costCents:    number;
  model:        string | null;
  cached:       boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Maps correlation value to a display colour. */
function corrColor(r: number | null): string {
  if (r === null) return '#5a5f6a';
  if (r >= 0.7)  return '#22c55e';   // strong positive
  if (r >= 0.35) return '#fbbf24';   // moderate
  if (r >= 0)    return '#f97366';   // weak positive
  return '#f97366';                  // negative
}

/** Human-readable label for the coefficient. */
function corrLabel(r: number | null): string {
  if (r === null) return 'n/a';
  if (r >= 0.7)  return 'Strong';
  if (r >= 0.35) return 'Moderate';
  if (r >= 0)    return 'Weak';
  return 'Negative';
}

/** Render a simple horizontal bar showing the coefficient. */
function CorrBar({ r }: { r: number | null }) {
  if (r === null) return null;
  const pct = Math.abs(r) * 100;
  const col = corrColor(r);
  return (
    <div
      style={{
        height:       4,
        background:   '#1f2128',
        borderRadius: 2,
        overflow:     'hidden',
        marginTop:    6,
      }}
    >
      <div
        style={{
          height:       '100%',
          width:        `${pct}%`,
          background:   col,
          borderRadius: 2,
          transition:   'width 400ms ease',
        }}
      />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CorrelationPanel({
  defaultInstrumentA,
  defaultInstrumentB,
  availableInstruments,
  tier: _tier,
}: Props) {
  const [instrumentA, setInstrumentA] = useState(defaultInstrumentA);
  const [instrumentB, setInstrumentB] = useState(
    availableInstruments.find(i => i !== defaultInstrumentA) ?? defaultInstrumentB,
  );
  const [result,  setResult]  = useState<CorrelationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const handleFetch = useCallback(async () => {
    if (instrumentA === instrumentB) {
      setError('Choose two different instruments.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<CorrelationResult>('/api/ai/correlation', {
        instrumentA,
        instrumentB,
        timeframe: '1h',
      });
      setResult(data);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.isRateLimit()) setError('Rate limited — max 20 requests / hour.');
        else setError(err.message);
      } else {
        setError('Failed to load correlation.');
      }
    } finally {
      setLoading(false);
    }
  }, [instrumentA, instrumentB]);

  const selectStyle: React.CSSProperties = {
    background:   '#0a0a0b',
    border:       '1px solid #2a2d36',
    borderRadius:  5,
    color:         '#e6e8ee',
    fontSize:      11,
    fontFamily:   'JetBrains Mono, monospace',
    padding:       '5px 8px',
    outline:       'none',
    cursor:        'pointer',
    flex:          1,
  };

  return (
    <div
      style={{
        background:    '#13141a',
        border:        '1px solid #1f2128',
        borderRadius:   6,
        padding:       '10px 14px',
        display:       'flex',
        flexDirection: 'column',
        gap:            10,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <GitCompare size={12} color="#22d3ee" />
          <span
            style={{
              fontSize:      11,
              fontFamily:   'JetBrains Mono, monospace',
              color:         '#8a8f9b',
              letterSpacing: '0.04em',
            }}
          >
            CVD Correlation
          </span>
        </div>

        {result?.cached && (
          <span
            style={{
              fontSize:   9,
              fontFamily: 'JetBrains Mono, monospace',
              color:      '#5a5f6a',
            }}
          >
            cached 5min
          </span>
        )}
      </div>

      {/* ── Instrument selectors + Run ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select value={instrumentA} onChange={e => setInstrumentA(e.target.value)} style={selectStyle}>
          {availableInstruments.map(sym => (
            <option key={sym} value={sym}>{sym}</option>
          ))}
        </select>

        <span style={{ fontSize: 10, color: '#5a5f6a', flexShrink: 0 }}>vs</span>

        <select value={instrumentB} onChange={e => setInstrumentB(e.target.value)} style={selectStyle}>
          {availableInstruments.map(sym => (
            <option key={sym} value={sym}>{sym}</option>
          ))}
        </select>

        <button
          onClick={handleFetch}
          disabled={loading || instrumentA === instrumentB}
          title="Compute correlation"
          style={{
            background:   loading ? '#1f2128' : '#22d3ee',
            color:        loading ? '#5a5f6a' : '#0a0a0b',
            border:       'none',
            borderRadius:  5,
            padding:      '5px 10px',
            cursor:       loading || instrumentA === instrumentB ? 'not-allowed' : 'pointer',
            display:      'flex',
            alignItems:   'center',
            flexShrink:    0,
          }}
        >
          {loading
            ? <Loader2 size={12} style={{ animation: 'spin 600ms linear infinite' }} />
            : <RefreshCw size={12} />}
        </button>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <p style={{ fontSize: 11, color: '#f97366', fontFamily: 'JetBrains Mono, monospace', margin: 0 }}>
          {error}
        </p>
      )}

      {/* ── Result ─────────────────────────────────────────────────────────── */}
      {result && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Coefficient display */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              style={{
                fontSize:   26,
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight:  700,
                color:       corrColor(result.correlation),
                lineHeight:  1,
              }}
            >
              {result.correlation !== null ? result.correlation.toFixed(3) : '—'}
            </span>
            <span
              style={{
                fontSize:   11,
                fontFamily: 'JetBrains Mono, monospace',
                color:       corrColor(result.correlation),
              }}
            >
              {corrLabel(result.correlation)}
            </span>
            {result.isDivergent && (
              <span
                style={{
                  fontSize:      9,
                  fontFamily:   'JetBrains Mono, monospace',
                  background:   '#1a1509',
                  color:         '#fbbf24',
                  border:       '1px solid #fbbf2440',
                  borderRadius:  4,
                  padding:      '2px 6px',
                  marginLeft:    4,
                }}
              >
                DIVERGENCE
              </span>
            )}
          </div>

          <CorrBar r={result.correlation} />

          {/* Sample size */}
          <span style={{ fontSize: 9, color: '#5a5f6a', fontFamily: 'JetBrains Mono, monospace' }}>
            n={result.sampleSize} 1h bars · {result.instrumentA} vs {result.instrumentB}
          </span>

          {/* Narration */}
          {result.narration && (
            <div
              style={{
                marginTop:    4,
                padding:     '8px 10px',
                background:  '#0d0e12',
                borderRadius:  5,
                border:       '1px solid #1f2128',
              }}
            >
              <p
                style={{
                  fontSize:   12,
                  color:      '#c9d1d9',
                  lineHeight:  1.55,
                  margin:     0,
                }}
              >
                {result.narration}
              </p>
              <span
                style={{
                  fontSize:   9,
                  color:      '#3a3f4a',
                  fontFamily: 'JetBrains Mono, monospace',
                  marginTop:   4,
                  display:    'block',
                }}
              >
                {result.model} · ${(result.costCents / 100).toFixed(5)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!result && !error && !loading && (
        <p
          style={{
            fontSize:   11,
            color:      '#3a3f4a',
            fontFamily: 'JetBrains Mono, monospace',
            margin:     0,
            fontStyle:  'italic',
          }}
        >
          Select two instruments and click refresh to compute CVD correlation.
        </p>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
