'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Zap, Loader2 } from 'lucide-react';

const FREE_FEATURES = [
  '3 active signal setups',
  '5 instruments per setup',
  '10 live scans per day',
  'Single-market scan scope',
  'Email + browser push notifications',
  '7-day signal history',
  'Haiku AI (10 calls/day)',
  '1 watchlist · 15 instruments',
];

const PRO_FEATURES = [
  'Unlimited signal setups',
  '10 instruments per setup',
  'Unlimited cross-market scans',
  'All notification channels (Telegram, Webhook)',
  'Full history, real-time WebSocket refresh',
  'Footprint chart · Heatmap · DOM ladder',
  'Opus AI metered against $10 monthly credit',
  'CSV export · API access · 5 workspaces',
];

export default function PlanPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<'free' | 'pro' | null>(null);

  async function selectFree() {
    setLoading('free');
    await fetch('/api/billing/select-free', { method: 'POST' });
    router.push('/dashboard');
  }

  async function selectPro() {
    setLoading('pro');
    const res = await fetch('/api/billing/checkout', { method: 'POST' });
    const { url } = await res.json();
    window.location.href = url;
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0b',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 24px',
    }}>
      <h1 style={{ color: '#22d3ee', fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
        Choose your plan
      </h1>
      <p style={{ color: '#8a8f9b', marginBottom: 40, fontSize: 14 }}>
        Start free. Upgrade anytime. No time limits — quota-based gating only.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, width: '100%', maxWidth: 760 }}>
        {/* Free Card */}
        <div style={{
          background: '#13141a',
          border: '1px solid #1f2128',
          borderRadius: 8,
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ color: '#e6e8ee', fontSize: 18, fontWeight: 600 }}>Trader</h2>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#e6e8ee', fontFamily: 'JetBrains Mono, monospace' }}>
                $0
              </span>
              <span style={{ color: '#5a5f6a', fontSize: 13, marginLeft: 6 }}>/month</span>
            </div>
            <p style={{ color: '#8a8f9b', fontSize: 12, marginTop: 6 }}>Free forever, no credit card</p>
          </div>

          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24, flex: 1 }}>
            {FREE_FEATURES.map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#8a8f9b' }}>
                <Check size={14} color="#22c55e" style={{ marginTop: 1, flexShrink: 0 }} />
                {f}
              </li>
            ))}
          </ul>

          <button
            onClick={selectFree}
            disabled={loading !== null}
            style={{
              background: 'transparent',
              border: '1px solid #2a2d36',
              borderRadius: 6,
              padding: '10px 20px',
              color: '#e6e8ee',
              fontWeight: 600,
              fontSize: 14,
              cursor: loading !== null ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: loading !== null ? 0.5 : 1,
            }}
          >
            {loading === 'free' ? <Loader2 size={16} className="spin" /> : 'Start Free'}
          </button>
        </div>

        {/* Pro Card */}
        <div style={{
          background: '#13141a',
          border: '2px solid #22d3ee',
          borderRadius: 8,
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            top: -1,
            right: 20,
            background: '#22d3ee',
            color: '#0a0a0b',
            fontSize: 10,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: '0 0 6px 6px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Recommended
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ color: '#e6e8ee', fontSize: 18, fontWeight: 600 }}>Pro</h2>
              <Zap size={16} color="#22d3ee" />
            </div>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#22d3ee', fontFamily: 'JetBrains Mono, monospace' }}>
                $69
              </span>
              <span style={{ color: '#5a5f6a', fontSize: 13, marginLeft: 6 }}>/month</span>
            </div>
            <p style={{ color: '#22d3ee', fontSize: 12, marginTop: 6 }}>Includes $10 AI token credit/mo</p>
          </div>

          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24, flex: 1 }}>
            {PRO_FEATURES.map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#e6e8ee' }}>
                <Check size={14} color="#22d3ee" style={{ marginTop: 1, flexShrink: 0 }} />
                {f}
              </li>
            ))}
          </ul>

          <button
            onClick={selectPro}
            disabled={loading !== null}
            style={{
              background: '#22d3ee',
              border: 'none',
              borderRadius: 6,
              padding: '10px 20px',
              color: '#0a0a0b',
              fontWeight: 700,
              fontSize: 14,
              cursor: loading !== null ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: loading !== null ? 0.5 : 1,
            }}
          >
            {loading === 'pro' ? <Loader2 size={16} className="spin" /> : 'Upgrade — $69/mo'}
          </button>
        </div>
      </div>

      <style>{`
        .spin { animation:spin 600ms linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
        @media (max-width: 600px) {
          div[style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
