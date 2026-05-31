'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Zap, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';

const PRO_FEATURES: ReadonlyArray<{ label: string; detail: string }> = [
  { label: 'Unlimited signal setups',         detail: '10 instruments per setup' },
  { label: 'Unlimited cross-market scans',    detail: 'crypto · stocks · futures · forex · commodities' },
  { label: 'Footprint · Heatmap · DOM ladder', detail: 'institutional-grade order-flow visualizations' },
  { label: 'All notification channels',       detail: 'email · push · Telegram · webhook' },
  { label: 'Full historical depth',           detail: 'no 7-day window — backtest and replay any timeframe' },
  { label: 'Real-time WebSocket refresh',     detail: '0-second latency — no 60-second poll throttle' },
  { label: 'Sonnet 4.6 + Opus 4.7 AI',        detail: 'metered against $10 monthly credit, top-ups available' },
  { label: 'CSV export · API access',         detail: 'integrate with your own systems' },
];

const FROM_LABELS: Record<string, string> = {
  footprint:        'Footprint chart',
  heatmap:          'Order-book heatmap',
  dom_ladder:       'DOM ladder',
  tape:             'Tape narrator',
  tape_narrator:    'Tape narrator',
  deep_analysis:    'Deep analysis',
  correlation:      'Cross-asset correlation',
  telegram:         'Telegram notifications',
  webhook:          'Webhook notifications',
  csv_export:       'CSV export',
  api_access:       'API access',
  signal_setups:    'Unlimited signal setups',
  scan_scope:       'Cross-market scans',
  history:          'Full history',
};

export default function UpgradeClient({ from }: { from: string | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const featureLabel = from ? FROM_LABELS[from] : null;

  async function handleUpgrade() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST' });
      const json: { url?: string; error?: string } = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error ?? 'Could not start checkout. Please try again.');
        setLoading(false);
        return;
      }
      window.location.href = json.url;
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0b', color: '#e6e8ee', padding: '32px 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Back link */}
        <button
          onClick={() => router.back()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24,
            background: 'transparent', border: 'none', color: '#8a8f9b',
            fontSize: 13, cursor: 'pointer', padding: 0,
          }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        {/* From-feature banner */}
        {featureLabel && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(251, 191, 36, 0.08)',
            border: '1px solid rgba(251, 191, 36, 0.25)',
            borderRadius: 8, padding: '12px 16px', marginBottom: 24,
          }}>
            <AlertCircle size={16} color="#fbbf24" />
            <div style={{ fontSize: 13, color: '#fbbf24' }}>
              <strong style={{ fontWeight: 600 }}>{featureLabel}</strong> is a Pro feature. Upgrade to unlock it.
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#22d3ee', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Zap size={22} color="#22d3ee" /> Upgrade to Pro
          </h1>
          <p style={{ fontSize: 14, color: '#8a8f9b', lineHeight: 1.5 }}>
            Unlock the full OrderFlow toolkit — unlimited scans, every notification channel, premium AI models, and the institutional-grade order-flow visualizations.
          </p>
        </div>

        {/* Pro card */}
        <div style={{
          background: '#13141a',
          border: '2px solid #22d3ee',
          borderRadius: 10,
          padding: 28,
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 38, fontWeight: 700, color: '#22d3ee', fontFamily: 'JetBrains Mono, monospace' }}>$69</span>
            <span style={{ fontSize: 14, color: '#5a5f6a' }}>/month</span>
          </div>
          <p style={{ fontSize: 13, color: '#22d3ee', marginBottom: 24 }}>
            Includes $10 AI token credit / month · Cancel any time
          </p>

          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
            {PRO_FEATURES.map(f => (
              <li key={f.label} style={{ display: 'flex', gap: 12 }}>
                <Check size={18} color="#22d3ee" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 14, color: '#e6e8ee', fontWeight: 500 }}>{f.label}</div>
                  <div style={{ fontSize: 12, color: '#8a8f9b', marginTop: 2 }}>{f.detail}</div>
                </div>
              </li>
            ))}
          </ul>

          <button
            onClick={handleUpgrade}
            disabled={loading}
            style={{
              width: '100%',
              background: '#22d3ee',
              border: 'none',
              borderRadius: 8,
              padding: '12px 20px',
              color: '#0a0a0b',
              fontWeight: 700,
              fontSize: 15,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? <Loader2 size={16} className="spin" /> : <><Zap size={15} /> Upgrade — $69/mo</>}
          </button>

          {error && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#f97366', textAlign: 'center' }}>{error}</div>
          )}
        </div>

        {/* Trust line */}
        <p style={{ fontSize: 12, color: '#5a5f6a', textAlign: 'center' }}>
          Secure checkout via Stripe. No long-term commitment — cancel anytime from the billing dashboard.
        </p>

        <style>{`.spin { animation: spin 600ms linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
