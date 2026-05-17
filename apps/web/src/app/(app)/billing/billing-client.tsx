'use client';

import { Zap, CreditCard, TrendingUp } from 'lucide-react';

const TOPUP_PACKS = [
  { label: '$10', cents: 1000, priceEnv: 'STRIPE_PRICE_TOPUP_10' },
  { label: '$25', cents: 2500, priceEnv: 'STRIPE_PRICE_TOPUP_25' },
  { label: '$50', cents: 5000, priceEnv: 'STRIPE_PRICE_TOPUP_50' },
  { label: '$100', cents: 10000, priceEnv: 'STRIPE_PRICE_TOPUP_100' },
];

interface LlmCall {
  id: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  costCents: number;
  batched: boolean;
  createdAt: string;
}

interface Props {
  tier: 'free' | 'premium';
  balanceCents: number;
  subscription: { status: string; currentPeriodEnd: string } | null;
  recentCalls: LlmCall[];
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const MODEL_COLORS: Record<string, string> = {
  'claude-haiku-4-5': '#60a5fa',
  'claude-sonnet-4-6': '#22d3ee',
  'claude-opus-4-7': '#a78bfa',
};

export default function BillingClient({ tier, balanceCents, subscription, recentCalls }: Props) {
  const totalSpent = recentCalls.reduce((acc, c) => acc + c.costCents, 0);
  const cacheHits = recentCalls.filter(c => c.cacheReadInputTokens > 0).length;
  const cacheHitRate = recentCalls.length > 0 ? Math.round((cacheHits / recentCalls.length) * 100) : 0;

  async function handleTopup(pack: typeof TOPUP_PACKS[0]) {
    const res = await fetch('/api/billing/topup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: pack.cents }),
    });
    const { url } = await res.json();
    window.location.href = url;
  }

  async function handleUpgrade() {
    const res = await fetch('/api/billing/checkout', { method: 'POST' });
    const { url } = await res.json();
    window.location.href = url;
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6e8ee', marginBottom: 24 }}>Billing</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 28 }}>
        {/* Subscription card */}
        <div style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <CreditCard size={16} color="#8a8f9b" />
            <span style={{ fontSize: 12, color: '#8a8f9b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Plan</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: tier === 'premium' ? '#22d3ee' : '#e6e8ee', fontFamily: 'JetBrains Mono, monospace', marginBottom: 4 }}>
            {tier === 'premium' ? 'Pro' : 'Free'}
          </div>
          {tier === 'premium' && subscription && (
            <div style={{ fontSize: 12, color: '#8a8f9b' }}>
              Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
            </div>
          )}
          {tier === 'free' && (
            <button onClick={handleUpgrade}
              style={{ marginTop: 12, background: '#22d3ee', color: '#0a0a0b', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={13} /> Upgrade — $69/mo
            </button>
          )}
        </div>

        {/* Token balance */}
        <div style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Zap size={16} color="#8a8f9b" />
            <span style={{ fontSize: 12, color: '#8a8f9b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Credit</span>
          </div>
          {tier === 'premium' ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 700, color: balanceCents > 200 ? '#22c55e' : '#f97366', fontFamily: 'JetBrains Mono, monospace', marginBottom: 4 }}>
                {formatCents(balanceCents)}
              </div>
              <div style={{ fontSize: 12, color: '#8a8f9b', marginBottom: 12 }}>available</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {TOPUP_PACKS.map(p => (
                  <button key={p.label} onClick={() => handleTopup(p)}
                    style={{ background: '#0a0a0b', border: '1px solid #2a2d36', borderRadius: 6, padding: '5px 12px', color: '#e6e8ee', fontSize: 12, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace' }}>
                    +{p.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#5a5f6a' }}>Pro plan only</div>
          )}
        </div>

        {/* Usage stats */}
        <div style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <TrendingUp size={16} color="#8a8f9b" />
            <span style={{ fontSize: 12, color: '#8a8f9b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>30-day AI Usage</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#e6e8ee', fontFamily: 'JetBrains Mono, monospace', marginBottom: 4 }}>
            {formatCents(totalSpent)}
          </div>
          <div style={{ fontSize: 12, color: '#8a8f9b' }}>{recentCalls.length} calls · {cacheHitRate}% cache hits</div>
        </div>
      </div>

      {/* Recent LLM calls */}
      {tier === 'premium' && recentCalls.length > 0 && (
        <div style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #1f2128', fontSize: 13, fontWeight: 600, color: '#e6e8ee' }}>
            Recent AI calls
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Feature', 'Model', 'Tokens in', 'Cache read', 'Tokens out', 'Cost'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: '#8a8f9b', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #1f2128', fontWeight: 400, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentCalls.slice(0, 20).map(call => (
                  <tr key={call.id} style={{ borderBottom: '1px solid #1f2128' }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: '#e6e8ee' }}>{call.feature}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: MODEL_COLORS[call.model] ?? '#8a8f9b', fontFamily: 'JetBrains Mono, monospace' }}>{call.model.replace('claude-', '').replace('-4-5', ' 4.5').replace('-4-6', ' 4.6').replace('-4-7', ' 4.7')}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#8a8f9b', fontFamily: 'JetBrains Mono, monospace' }}>{call.inputTokens.toLocaleString()}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#22c55e', fontFamily: 'JetBrains Mono, monospace' }}>{call.cacheReadInputTokens > 0 ? call.cacheReadInputTokens.toLocaleString() : '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#8a8f9b', fontFamily: 'JetBrains Mono, monospace' }}>{call.outputTokens.toLocaleString()}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#e6e8ee', fontFamily: 'JetBrains Mono, monospace' }}>{formatCents(call.costCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
