'use client';

import { Zap, CreditCard, TrendingUp, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useSession } from 'next-auth/react';

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
  tier: 'free' | 'starter' | 'pro';
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
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponStatus, setCouponStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const { update } = useSession();

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

  async function handleApplyCoupon() {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponStatus(null);
    
    try {
      const res = await fetch('/api/billing/coupon/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode.toUpperCase() }),
      });
      
      const data = await res.json();
      if (res.ok) {
        setCouponStatus({ type: 'success', message: data.message });
        setCouponCode('');
        try { await update({ tier: data.tier ?? 'pro' }); } catch {}
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setCouponStatus({ type: 'error', message: data.error || 'Failed to apply coupon' });
      }
    } catch (_err) {
      setCouponStatus({ type: 'error', message: 'Network error. Please try again.' });
    } finally {
      setCouponLoading(false);
    }
  }

  return (
    <div style={{
      padding: 'clamp(12px, 4vw, 24px)',
      paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 24px)',
      maxWidth: 900,
      margin: '0 auto',
    }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6e8ee', marginBottom: 24 }}>Billing</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 28 }}>
        {/* Subscription card */}
        <div style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <CreditCard size={16} color="#8a8f9b" />
            <span style={{ fontSize: 12, color: '#8a8f9b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Plan</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: tier !== 'free' ? '#22d3ee' : '#e6e8ee', fontFamily: 'JetBrains Mono, monospace', marginBottom: 4 }}>
            {tier.charAt(0).toUpperCase() + tier.slice(1)}
          </div>
          {tier !== 'free' && subscription && (
            <div style={{ fontSize: 12, color: '#8a8f9b' }}>
              Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
            </div>
          )}
          {tier !== 'pro' && (
            <button onClick={handleUpgrade}
              style={{ marginTop: 12, background: '#22d3ee', color: '#0a0a0b', border: 'none', borderRadius: 6, padding: '12px 18px', minHeight: 44, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'opacity 150ms' }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              <Zap size={13} /> Upgrade to Pro — $49/mo
            </button>
          )}
        </div>

        {/* Token balance */}
        <div style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Zap size={16} color="#8a8f9b" />
            <span style={{ fontSize: 12, color: '#8a8f9b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Credits</span>
          </div>
          {tier === 'pro' ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 700, color: balanceCents > 200 ? '#22c55e' : '#f97366', fontFamily: 'JetBrains Mono, monospace', marginBottom: 4 }}>
                {formatCents(balanceCents)}
              </div>
              <div style={{ fontSize: 12, color: '#8a8f9b', marginBottom: 12 }}>available</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {TOPUP_PACKS.map(p => (
                  <button key={p.label} onClick={() => handleTopup(p)}
                    style={{ background: '#0a0a0b', border: '1px solid #2a2d36', borderRadius: 6, padding: '12px 18px', minHeight: 44, color: '#e6e8ee', fontSize: 13, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', transition: 'all 150ms' }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = '#22d3ee'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = '#2a2d36'}
                  >
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

      {/* COUPON SECTION */}
      <div style={{
        background: '#13141a',
        border: '1px solid rgba(34, 211, 238, 0.3)',
        borderRadius: 8,
        padding: 20,
        marginBottom: 28,
        backgroundImage: 'linear-gradient(135deg, rgba(34, 211, 238, 0.05) 0%, rgba(34, 211, 238, 0.02) 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Zap size={18} color="#22d3ee" />
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#e6e8ee', margin: 0 }}>Redeem Coupon for Pro Access</h2>
        </div>
        
        <p style={{ fontSize: 13, color: '#8a8f9b', marginBottom: 16 }}>
          Have a coupon code? Enter it below to unlock pro features for 10 days.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: couponStatus ? 12 : 0 }}>
          <input
            type="text"
            placeholder="e.g., WELCOME10"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            onKeyPress={(e) => e.key === 'Enter' && handleApplyCoupon()}
            disabled={couponLoading}
            style={{
              flex: 1,
              background: '#0a0a0b',
              border: '1px solid #1f2128',
              borderRadius: 6,
              color: '#e6e8ee',
              padding: '10px 12px',
              fontSize: 13,
              outline: 'none',
              transition: 'all 150ms',
              opacity: couponLoading ? 0.6 : 1,
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#22d3ee'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34, 211, 238, 0.1)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#1f2128'; e.currentTarget.style.boxShadow = 'none'; }}
          />
          <button
            onClick={handleApplyCoupon}
            disabled={couponLoading || !couponCode.trim()}
            style={{
              background: '#22d3ee',
              color: '#0a0a0b',
              border: 'none',
              borderRadius: 6,
              padding: '10px 20px',
              fontWeight: 600,
              fontSize: 13,
              cursor: couponLoading || !couponCode.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: couponLoading || !couponCode.trim() ? 0.5 : 1,
              transition: 'opacity 150ms',
            }}
            onMouseEnter={(e) => !couponLoading && !couponCode.trim() && (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => !couponLoading && !couponCode.trim() && (e.currentTarget.style.opacity = '1')}
          >
            {couponLoading ? (
              <>
                <Loader2 size={13} style={{ animation: 'spin 600ms linear infinite' }} />
                Applying...
              </>
            ) : (
              'Apply Coupon'
            )}
          </button>
        </div>

        {couponStatus && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 6,
            background: couponStatus.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${couponStatus.type === 'success' ? '#22c55e' : '#ef4444'}`,
            color: couponStatus.type === 'success' ? '#22c55e' : '#ef4444',
            fontSize: 13,
          }}>
            {couponStatus.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>{couponStatus.message}</span>
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 12, color: '#5a5f6a' }}>
          💡 Test coupons: <code style={{ background: '#0a0a0b', padding: '2px 6px', borderRadius: 3, color: '#22d3ee' }}>WELCOME10</code>, <code style={{ background: '#0a0a0b', padding: '2px 6px', borderRadius: 3, color: '#22d3ee' }}>PROMO2024</code>, <code style={{ background: '#0a0a0b', padding: '2px 6px', borderRadius: 3, color: '#22d3ee' }}>BETA2026</code>
        </div>
      </div>

      {/* Recent LLM calls */}
      {tier === 'pro' && recentCalls.length > 0 && (
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

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
