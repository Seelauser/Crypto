'use client';

import { useState } from 'react';
import { Plus, Zap, Clock, CheckCircle, Pause, Trash2, ChevronRight } from 'lucide-react';
import { LIMITS } from '@/lib/limits';
import type { UserTier } from '@orderflow/types';
import SignalWizard from '@/components/signals/SignalWizard';
import TierGateModal from '@/components/ui/TierGateModal';

interface SignalSetup {
  id: string;
  name: string;
  market: string;
  status: string;
  instruments: string[];
  triggerConfig: any;
  notificationChannels: string[];
  createdAt: string;
}

interface SignalEvent {
  id: string;
  instrument: string;
  aiExplanation: string | null;
  aiModel: string | null;
  createdAt: string;
  setup: { name: string; market: string } | null;
  snapshot: any;
}

interface Props {
  setups: SignalSetup[];
  recentEvents: SignalEvent[];
  tier: UserTier;
}

const STATUS_COLORS: Record<string, string> = {
  armed: '#22c55e',
  paused: '#fbbf24',
  archived: '#5a5f6a',
};

export default function SignalsClient({ setups, recentEvents, tier }: Props) {
  const [showWizard, setShowWizard] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const limits = LIMITS[tier];

  function handleNewSignal() {
    if (setups.length >= limits.signal_setups_max) { setShowGate(true); return; }
    setShowWizard(true);
  }

  return (
    <div style={{
      padding: 'clamp(12px, 4vw, 24px)',
      paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 24px)',
      maxWidth: 1200,
      margin: '0 auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6e8ee', margin: 0 }}>Order Flow Signals</h1>
          <p style={{ color: '#8a8f9b', fontSize: 13, marginTop: 4 }}>
            {setups.length}/{limits.signal_setups_max === Infinity ? '∞' : limits.signal_setups_max} setups active
          </p>
        </div>
        <button
          onClick={handleNewSignal}
          style={{
            background: '#22d3ee',
            color: '#0a0a0b',
            border: 'none',
            borderRadius: 6,
            padding: '12px 18px',
            minHeight: 44,
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Plus size={15} /> New Signal
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        {/* Signal Setups */}
        <div>
          <h2 style={{ fontSize: 13, color: '#8a8f9b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Active Setups
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {setups.length === 0 && (
              <div style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 32, textAlign: 'center', color: '#5a5f6a' }}>
                No signal setups yet. Create your first one.
              </div>
            )}
            {setups.map(setup => (
              <div
                key={setup.id}
                style={{
                  background: '#13141a',
                  border: '1px solid #1f2128',
                  borderRadius: 8,
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: STATUS_COLORS[setup.status] ?? '#5a5f6a',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#e6e8ee', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {setup.name}
                  </div>
                  <div style={{ fontSize: 12, color: '#8a8f9b', display: 'flex', gap: 8 }}>
                    <span style={{ textTransform: 'uppercase' }}>{setup.market}</span>
                    <span>·</span>
                    <span>{setup.instruments.slice(0, 3).join(', ')}{setup.instruments.length > 3 ? ` +${setup.instruments.length - 3}` : ''}</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#5a5f6a', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}>
                  {setup.status}
                </div>
                <ChevronRight size={14} color="#5a5f6a" />
              </div>
            ))}
          </div>
        </div>

        {/* Recent Events */}
        <div>
          <h2 style={{ fontSize: 13, color: '#8a8f9b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Recent Triggers
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentEvents.length === 0 && (
              <div style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 32, textAlign: 'center', color: '#5a5f6a' }}>
                No signals triggered yet.
              </div>
            )}
            {recentEvents.slice(0, 10).map(event => (
              <div
                key={event.id}
                style={{
                  background: '#13141a',
                  border: '1px solid #1f2128',
                  borderLeft: '3px solid #22d3ee',
                  borderRadius: 8,
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#e6e8ee', fontFamily: 'JetBrains Mono, monospace' }}>
                    {event.instrument}
                  </span>
                  <span style={{ fontSize: 11, color: '#5a5f6a' }}>
                    {new Date(event.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                {event.setup && (
                  <div style={{ fontSize: 11, color: '#8a8f9b', marginBottom: 4 }}>{event.setup.name}</div>
                )}
                {event.aiExplanation && (
                  <p style={{ fontSize: 12, color: '#8a8f9b', lineHeight: 1.5, margin: 0 }}>
                    {event.aiExplanation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {showWizard && (
        <SignalWizard tier={tier} onClose={() => setShowWizard(false)} />
      )}

      {showGate && (
        <TierGateModal
          feature="signal_setups_max"
          message={`Free tier supports ${limits.signal_setups_max} active setups. Upgrade to Pro for unlimited.`}
          onClose={() => setShowGate(false)}
        />
      )}
    </div>
  );
}
