'use client';

import { useEffect, useRef, useState } from 'react';
import type { UserTier } from '@orderflow/types';
import TierGateModal from '@/components/ui/TierGateModal';

interface DomLevel {
  price: number;
  bidSize: number;
  askSize: number;
  isBid: boolean;
}

interface Props {
  instrument: string;
  tier: UserTier;
  height?: number;
}

function generateMockDom(mid: number, levels = 20): DomLevel[] {
  const tickSize = mid > 1000 ? 10 : mid > 100 ? 1 : 0.01;
  const result: DomLevel[] = [];
  for (let i = levels; i >= 1; i--) {
    const price = mid + i * tickSize;
    result.push({ price, bidSize: 0, askSize: Math.random() * 500 + 50, isBid: false });
  }
  for (let i = 1; i <= levels; i++) {
    const price = mid - i * tickSize;
    result.push({ price, bidSize: Math.random() * 500 + 50, askSize: 0, isBid: true });
  }
  return result;
}

export default function DomLadder({ instrument, tier, height = 400 }: Props) {
  const [showGate, setShowGate] = useState(false);
  const [dom, setDom] = useState<DomLevel[]>([]);
  const [mid, setMid] = useState(50000);

  const BASE_PRICES: Record<string, number> = {
    BTCUSDT: 50000, ETHUSDT: 3000, SOLUSDT: 150,
    AAPL: 180, NVDA: 500, ES: 5200, GC: 2000, EURUSD: 1.082,
  };

  useEffect(() => {
    const base = BASE_PRICES[instrument] ?? 100;
    setMid(base);
    setDom(generateMockDom(base));
    // Simulate live updates
    const interval = setInterval(() => {
      const drift = (Math.random() - 0.5) * base * 0.0005;
      setMid(m => {
        const newMid = m + drift;
        setDom(generateMockDom(newMid));
        return newMid;
      });
    }, 800);
    return () => clearInterval(interval);
  }, [instrument]);

  const maxSize = Math.max(...dom.map(l => Math.max(l.bidSize, l.askSize)), 1);
  const tickSize = mid > 1000 ? 10 : mid > 100 ? 1 : 0.01;

  if (tier === 'free') {
    return (
      <div style={{ position: 'relative', height, background: '#0a0a0b', border: '1px solid #1f2128', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ filter: 'blur(4px)', opacity: 0.25, height: '100%', overflow: 'hidden' }}>
          <DomContent dom={dom} maxSize={maxSize} mid={mid} tickSize={tickSize} />
        </div>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e6e8ee' }}>DOM Ladder</div>
          <p style={{ color: '#8a8f9b', fontSize: 13, textAlign: 'center', maxWidth: 240 }}>
            Real-time depth of market requires Pro.
          </p>
          <button onClick={() => setShowGate(true)} style={{ background: '#22d3ee', color: '#0a0a0b', border: 'none', borderRadius: 6, padding: '8px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Upgrade
          </button>
        </div>
        {showGate && <TierGateModal feature="dom_ladder" message="DOM Ladder requires Pro." onClose={() => setShowGate(false)} />}
      </div>
    );
  }

  return (
    <div style={{ height, background: '#0a0a0b', border: '1px solid #1f2128', borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1f2128', display: 'flex', gap: 16, fontSize: 11 }}>
        <span style={{ color: '#8a8f9b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>DOM · {instrument}</span>
        <span style={{ color: '#22d3ee', fontFamily: 'JetBrains Mono, monospace' }}>{mid.toFixed(mid > 100 ? 1 : 5)}</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <DomContent dom={dom} maxSize={maxSize} mid={mid} tickSize={tickSize} />
      </div>
    </div>
  );
}

function DomContent({ dom, maxSize, mid, tickSize }: { dom: DomLevel[]; maxSize: number; mid: number; tickSize: number }) {
  return (
    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
      {/* Headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px', padding: '4px 8px', borderBottom: '1px solid #1f2128' }}>
        <span style={{ color: '#5a5f6a' }}>Price</span>
        <span style={{ color: '#f97366', textAlign: 'right' }}>Ask</span>
        <span style={{ color: '#22d3ee', textAlign: 'right' }}>Bid</span>
      </div>

      {dom.map((level, i) => {
        const barPct = Math.min((level.isBid ? level.bidSize : level.askSize) / maxSize, 1);
        const isSpread = Math.abs(level.price - mid) < tickSize * 0.5;
        return (
          <div
            key={i}
            style={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: '1fr 70px 70px',
              padding: '2px 8px',
              borderBottom: '1px solid #1f212840',
              background: isSpread ? '#22d3ee08' : 'transparent',
            }}
          >
            {/* Bar fill */}
            <div style={{
              position: 'absolute',
              right: 0, top: 0, bottom: 0,
              width: `${barPct * 100}%`,
              background: level.isBid ? '#22d3ee10' : '#f9736610',
              pointerEvents: 'none',
            }} />
            <span style={{ color: isSpread ? '#22d3ee' : '#e6e8ee', position: 'relative' }}>
              {level.price.toFixed(mid > 100 ? 1 : 5)}
            </span>
            <span style={{ color: level.isBid ? '#5a5f6a' : '#f97366', textAlign: 'right', position: 'relative' }}>
              {level.isBid ? '—' : level.askSize.toFixed(0)}
            </span>
            <span style={{ color: level.isBid ? '#22d3ee' : '#5a5f6a', textAlign: 'right', position: 'relative' }}>
              {level.isBid ? level.bidSize.toFixed(0) : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
