'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Pause, Play, Trash2 } from 'lucide-react';
import Link from 'next/link';
import SignalEventCard from '@/components/signals/SignalEventCard';
import type { UserTier } from '@orderflow/types';

interface SignalSetup {
  id: string;
  name: string;
  market: string;
  status: string;
  instruments: string[];
  triggerConfig: { type: string; params: Record<string, unknown> };
  notificationChannels: string[];
  cooldownMinutes: number;
  createdAt: string;
}

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
    [key: string]: unknown; // allow extra fields from DB without losing the required shape
  };
  aiExplanation: string | null;
  aiModel: string | null;
  aiCostCents: number | null;
  createdAt: string;
}

interface Props {
  setup: SignalSetup;
  events: SignalEvent[];
  tier: UserTier;
}

const TRIGGER_LABELS: Record<string, string> = {
  cvd_cross: 'CVD Cross',
  bid_ask_imbalance: 'Bid/Ask Imbalance',
  large_print: 'Large Print',
  sweep: 'Sweep',
  absorption: 'Absorption',
};

export default function SignalDetailClient({ setup: initial, events: initialEvents, tier }: Props) {
  const router = useRouter();
  const [setup, setSetup] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function toggleStatus() {
    setLoading(true);
    const newStatus = setup.status === 'armed' ? 'paused' : 'armed';
    const res = await fetch(`/api/signals/${setup.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    setSetup(data);
    setLoading(false);
  }

  async function deleteSetup() {
    if (!confirm(`Archive "${setup.name}"? It will stop triggering but events are preserved.`)) return;
    setLoading(true);
    await fetch(`/api/signals/${setup.id}`, { method: 'DELETE' });
    router.push('/signals');
  }

  const statusColors: Record<string, string> = {
    armed: '#22c55e', paused: '#fbbf24', archived: '#5a5f6a',
  };

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 24px)', maxWidth: 900, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <Link href="/signals" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#8a8f9b', fontSize: 13, textDecoration: 'none', marginBottom: 20 }}>
        <ArrowLeft size={14} /> All Signals
      </Link>

      {/* Header */}
      <div style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColors[setup.status] ?? '#5a5f6a', flexShrink: 0 }} />
              <h1 style={{ fontSize: 18, fontWeight: 600, color: '#e6e8ee', margin: 0 }}>{setup.name}</h1>
              <span style={{ fontSize: 11, color: '#5a5f6a', textTransform: 'uppercase', fontFamily: 'JetBrains Mono, monospace' }}>{setup.status}</span>
            </div>

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, color: '#8a8f9b' }}>
              <span><span style={{ color: '#5a5f6a' }}>Market: </span>{setup.market}</span>
              <span><span style={{ color: '#5a5f6a' }}>Trigger: </span>{TRIGGER_LABELS[setup.triggerConfig.type] ?? setup.triggerConfig.type}</span>
              <span><span style={{ color: '#5a5f6a' }}>Cooldown: </span>{setup.cooldownMinutes}m</span>
              <span><span style={{ color: '#5a5f6a' }}>Instruments: </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
                  {setup.instruments.join(', ')}
                </span>
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {setup.status !== 'archived' && (
              <button
                onClick={toggleStatus}
                disabled={loading}
                style={{ background: '#181a21', border: '1px solid #2a2d36', borderRadius: 6, padding: '7px 14px', color: '#e6e8ee', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {setup.status === 'armed' ? <Pause size={13} /> : <Play size={13} />}
                {setup.status === 'armed' ? 'Pause' : 'Arm'}
              </button>
            )}
            <button
              onClick={deleteSetup}
              disabled={loading}
              style={{ background: '#181a21', border: '1px solid #ef444440', borderRadius: 6, padding: '7px 14px', color: '#ef4444', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Trash2 size={13} /> Archive
            </button>
          </div>
        </div>
      </div>

      {/* Events */}
      <h2 style={{ fontSize: 13, color: '#8a8f9b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        Signal Events ({initialEvents.length})
      </h2>

      {initialEvents.length === 0 ? (
        <div style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 48, textAlign: 'center', color: '#5a5f6a', fontSize: 14 }}>
          No events yet. This signal hasn&apos;t triggered.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {initialEvents.map(event => (
            <SignalEventCard
              key={event.id}
              event={{ ...event, setup: { name: setup.name, market: setup.market } }}
              tier={tier}
            />
          ))}
        </div>
      )}
    </div>
  );
}
