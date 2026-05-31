'use client';

import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Loader2, Mic } from 'lucide-react';
import type { UserTier } from '@orderflow/types';

interface Props {
  instrument: string;
  tier: UserTier;
  recentPrints?: Array<{ size: number; price: number; side: string; ts: number }>;
}

const MOCK_PRINTS = (instrument: string) => [
  { side: 'buy', size: 15.4, price: 50200, ts: Date.now() - 5000 },
  { side: 'buy', size: 8.2, price: 50190, ts: Date.now() - 12000 },
  { side: 'sell', size: 22.1, price: 50150, ts: Date.now() - 18000 },
  { side: 'buy', size: 45.0, price: 50210, ts: Date.now() - 25000 },
];

export default function TapeNarrator({ instrument, tier, recentPrints }: Props) {
  const [narration, setNarration] = useState('');
  const [model, setModel] = useState('');
  const [costCents, setCostCents] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [displayText, setDisplayText] = useState('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const typewriterRef = useRef<NodeJS.Timeout | null>(null);

  function typewrite(text: string) {
    if (typewriterRef.current) clearTimeout(typewriterRef.current);
    setDisplayText('');
    let i = 0;
    function step() {
      if (i >= text.length) return;
      setDisplayText(text.slice(0, i + 1));
      i++;
      typewriterRef.current = setTimeout(step, 18);
    }
    step();
  }

  async function fetchNarration() {
    setLoading(true);
    setError('');
    try {
      const prints = recentPrints ?? MOCK_PRINTS(instrument);
      const res = await fetch('/api/ai/tape-narrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instrument, recentPrints: prints }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) setError('Rate limited. Try in 30s.');
        else setError(data.error ?? 'Narration failed.');
        return;
      }
      setNarration(data.narration);
      setModel(data.model);
      setCostCents(data.costCents);
      typewrite(data.narration);
    } catch {
      setError('Failed to fetch narration.');
    } finally {
      setLoading(false);
    }
  }

  // Auto-refresh for premium every 60s
  useEffect(() => {
    if (tier !== 'premium') return;
    intervalRef.current = setInterval(fetchNarration, 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [instrument, tier]);

  return (
    <div style={{
      background: '#13141a',
      border: '1px solid #1f2128',
      borderRadius: 6,
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
    }}>
      <Mic size={13} color="#22d3ee" style={{ flexShrink: 0, marginTop: 2 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {displayText ? (
          <p style={{ fontSize: 13, color: '#e6e8ee', lineHeight: 1.55, margin: 0 }}>
            {displayText}
          </p>
        ) : !loading && (
          <p style={{ fontSize: 13, color: '#5a5f6a', margin: 0, fontStyle: 'italic' }}>
            Tape narration — click to generate
          </p>
        )}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8a8f9b', fontSize: 12 }}>
            <Loader2 size={11} style={{ animation: 'spin 600ms linear infinite' }} />
            Listening to tape...
          </div>
        )}
        {error && <p style={{ fontSize: 11, color: '#ef4444', margin: '4px 0 0' }}>{error}</p>}

        {model && (
          <div style={{ display: 'flex', gap: 8, marginTop: 5, fontSize: 10, color: '#5a5f6a', fontFamily: 'JetBrains Mono, monospace' }}>
            <span>Haiku · ${(costCents / 100).toFixed(5)}</span>
            {tier === 'premium' && <span>auto-refresh 60s</span>}
            {tier === 'free' && <span>manual only</span>}
          </div>
        )}
      </div>

      <button
        onClick={fetchNarration}
        disabled={loading}
        title="Refresh narration"
        style={{
          background: 'none',
          border: 'none',
          cursor: loading ? 'not-allowed' : 'pointer',
          color: loading ? '#5a5f6a' : '#8a8f9b',
          padding: 0,
          display: 'flex',
          flexShrink: 0,
        }}
      >
        <RefreshCw size={12} style={loading ? { animation: 'spin 600ms linear infinite' } : {}} />
      </button>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
