'use client';

import { useState } from 'react';
import { Sparkles, Loader2, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import type { UserTier } from '@orderflow/types';
import { Badge } from '@/components/ui/Badge';
import TermTip from '@/components/ui/TermTip';

interface SignalEvent {
  id: string;
  setupId: string;
  instrument: string;
  snapshot: {
    price: number;
    cvd: number;
    delta: number;
    imbalanceRatio: number;
    triggerType: string;
    exchange?: string;
  };
  aiExplanation: string | null;
  aiModel: string | null;
  aiCostCents: number | null;
  createdAt: string;
  setup?: { name: string; market: string };
}

interface Props {
  event: SignalEvent;
  tier: UserTier;
}

const TRIGGER_LABELS: Record<string, { label: string; tip: string }> = {
  cvd_cross:         { label: 'CVD Cross',      tip: 'CVD crossed your threshold — net buying or selling pressure reached a significant level.' },
  bid_ask_imbalance: { label: 'Book Imbalance', tip: 'The order book became lopsided — one side has much more volume waiting than the other.' },
  large_print:       { label: 'Large Print',    tip: 'A single unusually large trade was detected — a potential institutional footprint.' },
  sweep:             { label: 'Sweep',          tip: 'Aggressive orders consumed multiple price levels — someone wanted in or out immediately.' },
  absorption:        { label: 'Absorption',     tip: 'Heavy one-sided volume hit the market but price barely moved — the other side absorbed all of it.' },
  iceberg:           { label: 'Iceberg',        tip: 'Repeated same-size orders at one price — a large hidden order revealing itself in small chunks.' },
};

export default function SignalEventCard({ event, tier }: Props) {
  const [explanation, setExplanation] = useState(event.aiExplanation);
  const [model, setModel] = useState(event.aiModel);
  const [costCents, setCostCents] = useState(event.aiCostCents);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(!!event.aiExplanation);

  const snap = event.snapshot;
  const isCrypto = snap.exchange === 'binance' || event.instrument.endsWith('USDT') || event.instrument.endsWith('BTC');

  async function explain() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/signals/${event.setupId}/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          setError(`AI quota reached. Resets at midnight.`);
        } else if (res.status === 402) {
          setError('Insufficient AI credit. Top up from the Billing page.');
        } else {
          setError(data.error ?? 'Failed to generate explanation.');
        }
        return;
      }
      setExplanation(data.explanation);
      setModel(data.model);
      setCostCents(data.costCents);
      setExpanded(true);
    } finally {
      setLoading(false);
    }
  }

  const triggerMeta = TRIGGER_LABELS[snap.triggerType] ?? { label: snap.triggerType, tip: '' };
  const cvdDir = (snap.cvd ?? 0) >= 0 ? 'buy' : 'sell';

  return (
    <div style={{
      background: '#13141a',
      border: '1px solid #1f2128',
      borderLeft: `3px solid ${cvdDir === 'buy' ? '#22d3ee' : '#f97366'}`,
      borderRadius: 6,
    }}>
      {/* Header */}
      <div
        style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Instrument + time */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 600, color: '#e6e8ee' }}>
              {event.instrument}
            </span>
            <Badge variant={isCrypto ? 'true-l2' : 'inferred'}>
              {isCrypto ? 'True L2' : 'Inferred'}
            </Badge>
            <span title={triggerMeta.tip} style={{ cursor: 'help' }}>
              <Badge variant="neutral">{triggerMeta.label}</Badge>
            </span>
            {event.setup && (
              <span style={{ fontSize: 11, color: '#5a5f6a' }}>{event.setup.name}</span>
            )}
          </div>

          {/* Metrics row — each label has a TermTip so any user can understand */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Metric label="Price" value={`${snap.price?.toFixed(snap.price > 100 ? 2 : 5) ?? '—'}`} />
            <Metric
              label={<TermTip term="cvd">CVD</TermTip>}
              value={`${snap.cvd >= 0 ? '+' : ''}${((snap.cvd ?? 0) / 1000).toFixed(0)}K`}
              color={snap.cvd >= 0 ? '#22d3ee' : '#f97366'}
              icon={snap.cvd >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            />
            <Metric
              label={<TermTip term="delta">Delta</TermTip>}
              value={`${snap.delta >= 0 ? '+' : ''}${((snap.delta ?? 0) / 1000).toFixed(0)}K`}
              color={snap.delta >= 0 ? '#22d3ee' : '#f97366'}
            />
            <Metric
              label={<TermTip term="imbalance_ratio">Imbalance</TermTip>}
              value={`${snap.imbalanceRatio?.toFixed(1) ?? '—'}×`}
              color={snap.imbalanceRatio >= 10 ? '#ef4444' : snap.imbalanceRatio >= 3 ? '#fbbf24' : '#8a8f9b'}
            />
          </div>
        </div>

        {/* Time + expand */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#5a5f6a', whiteSpace: 'nowrap' }}>
            {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {expanded ? <ChevronUp size={14} color="#5a5f6a" /> : <ChevronDown size={14} color="#5a5f6a" />}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '0 14px 14px' }}>
          {explanation ? (
            <div>
              <p style={{ fontSize: 13, color: '#8a8f9b', lineHeight: 1.65, margin: '0 0 8px' }}>
                {explanation}
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {model && (
                  <span style={{ fontSize: 10, color: '#5a5f6a', fontFamily: 'JetBrains Mono, monospace' }}>
                    {model.replace('claude-', '').replace('-4-5', ' 4.5').replace('-4-6', ' 4.6').replace('-4-7', ' 4.7')}
                  </span>
                )}
                {costCents !== null && costCents !== undefined && (
                  <span style={{ fontSize: 10, color: '#5a5f6a', fontFamily: 'JetBrains Mono, monospace' }}>
                    ${(costCents / 100).toFixed(4)}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div>
              {error && (
                <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 10 }}>{error}</p>
              )}
              <button
                onClick={explain}
                disabled={loading}
                style={{
                  background: '#181a21',
                  border: '1px solid #2a2d36',
                  borderRadius: 6,
                  padding: '7px 14px',
                  color: '#22d3ee',
                  fontSize: 12,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading
                  ? <><Loader2 size={12} style={{ animation: 'spin 600ms linear infinite' }} /> Generating...</>
                  : <><Sparkles size={12} /> Explain with AI</>
                }
                {tier === 'free' && !loading && (
                  <span style={{ color: '#5a5f6a', fontSize: 10, marginLeft: 2 }}>Haiku</span>
                )}
              </button>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, color, icon }: { label: React.ReactNode; value: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 9, color: '#5a5f6a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: color ?? '#8a8f9b', display: 'flex', alignItems: 'center', gap: 3 }}>
        {icon}{value}
      </span>
    </div>
  );
}
