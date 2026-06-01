'use client';

import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import type { UserTier } from '@orderflow/types';
import { LIMITS } from '@/lib/limits';

type Step = 'market' | 'instruments' | 'trigger' | 'notifications' | 'review';

const MARKETS = [
  { id: 'crypto', label: 'Crypto', badge: 'True L2', color: '#22d3ee' },
  { id: 'stocks', label: 'US Stocks', badge: 'Inferred', color: '#fbbf24' },
  { id: 'futures', label: 'US Futures', badge: 'Inferred', color: '#fbbf24' },
  { id: 'forex', label: 'Forex', badge: 'Inferred', color: '#fbbf24' },
  { id: 'commodities', label: 'Commodities', badge: 'Inferred', color: '#fbbf24' },
];

const TRIGGER_TYPES = [
  {
    id: 'cvd_cross',
    label: 'CVD Threshold Cross',
    description: 'Fires when the running total of buy volume minus sell volume crosses a level you set.',
    plainEnglish: 'Good for catching when a market tips from balanced to buyer- or seller-dominated. A CVD cross above +10,000 means 10,000 more units bought than sold in the current session — significant buying interest.',
  },
  {
    id: 'bid_ask_imbalance',
    label: 'Order Book Imbalance',
    description: 'Fires when the bid vs ask volume ratio at the top of the book exceeds a multiplier.',
    plainEnglish: 'If bids are 4× larger than asks, large buyers are queued up and willing to absorb selling. This often precedes upward price moves. The ratio resets as orders are filled or cancelled.',
  },
  {
    id: 'large_print',
    label: 'Large Print / Sweep',
    description: 'Fires when a single trade or rapid burst of trades exceeds a USD notional threshold.',
    plainEnglish: 'Institutions break large orders into pieces to hide their intent — but sometimes a large print slips through. A $500K+ single trade in crypto or $1M+ in stocks is worth watching. Sweeps (multiple levels hit rapidly) signal urgency.',
  },
  {
    id: 'absorption',
    label: 'Absorption',
    description: 'Fires when heavy one-sided volume hits the market but price barely moves.',
    plainEnglish: 'If massive sell orders are hitting the bid but price is holding flat, someone is absorbing all that selling. That someone is usually an institution building a long position. A bullish absorption is one of the highest-conviction order flow signals.',
  },
  {
    id: 'delta_exhaustion',
    label: 'Delta Exhaustion',
    description: 'Fires when delta flips sign while price is at a recent high or low.',
    plainEnglish: 'When price reaches a new high but the delta goes negative in the same bar, buyers have run out. The last buyers committed and there is nobody left to push higher. This is an early warning of a reversal.',
  },
];

const FREE_CHANNELS = ['email', 'browser_push'];
const ALL_CHANNELS = ['email', 'browser_push', 'telegram', 'webhook'];

interface Props {
  tier: UserTier;
  onClose: () => void;
}

export default function SignalWizard({ tier, onClose }: Props) {
  const limits = LIMITS[tier];
  const [step, setStep] = useState<Step>('market');
  const [market, setMarket] = useState('');
  const [instruments, setInstruments] = useState<string[]>([]);
  const [instrumentInput, setInstrumentInput] = useState('');
  const [triggerType, setTriggerType] = useState('');
  const [triggerParams, setTriggerParams] = useState<Record<string, string>>({});
  const [channels, setChannels] = useState<string[]>(['email']);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const maxInstruments = limits.instruments_per_setup_max;

  async function save() {
    setSaving(true);
    try {
      await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || `${market.toUpperCase()} ${triggerType} signal`,
          market,
          instruments,
          triggerConfig: { type: triggerType, params: triggerParams },
          notificationChannels: channels,
        }),
      });
      onClose();
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  const steps: Step[] = ['market', 'instruments', 'trigger', 'notifications', 'review'];
  const stepIdx = steps.indexOf(step);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: '#13141a', border: '1px solid #1f2128', borderRadius: 8,
        width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #1f2128' }}>
          <h2 style={{ color: '#e6e8ee', fontSize: 16, fontWeight: 600, margin: 0 }}>Create Signal Setup</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8a8f9b' }}>
            <X size={18} />
          </button>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', padding: '12px 24px', gap: 6, borderBottom: '1px solid #1f2128' }}>
          {steps.map((s, i) => (
            <div key={s} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= stepIdx ? '#22d3ee' : '#1f2128',
              transition: 'background 200ms',
            }} />
          ))}
        </div>

        <div style={{ padding: 24 }}>
          {/* Step 1: Market */}
          {step === 'market' && (
            <div>
              <h3 style={{ color: '#e6e8ee', fontSize: 14, marginBottom: 16 }}>Select asset class</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {MARKETS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setMarket(m.id)}
                    style={{
                      background: market === m.id ? '#181a21' : '#0a0a0b',
                      border: `1px solid ${market === m.id ? '#22d3ee' : '#1f2128'}`,
                      borderRadius: 6, padding: '12px 16px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                    }}
                  >
                    <span style={{ flex: 1, color: '#e6e8ee', fontSize: 14 }}>{m.label}</span>
                    <span style={{ border: `1px solid ${m.color}`, color: m.color, fontSize: 10, padding: '2px 6px', borderRadius: 3, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}>
                      {m.badge}
                    </span>
                    {market === m.id && <Check size={14} color="#22d3ee" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Instruments */}
          {step === 'instruments' && (
            <div>
              <h3 style={{ color: '#e6e8ee', fontSize: 14, marginBottom: 4 }}>Add instruments</h3>
              <p style={{ color: '#8a8f9b', fontSize: 12, marginBottom: 16 }}>
                Up to {maxInstruments === Infinity ? '10' : maxInstruments} instruments per setup
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  style={{ flex: 1, background: '#0a0a0b', border: '1px solid #1f2128', borderRadius: 6, color: '#e6e8ee', padding: '9px 12px', fontSize: 13, outline: 'none' }}
                  placeholder="e.g. BTCUSDT, AAPL, EURUSD"
                  value={instrumentInput}
                  onChange={e => setInstrumentInput(e.target.value.toUpperCase())}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && instrumentInput.trim() && instruments.length < (maxInstruments === Infinity ? 10 : maxInstruments)) {
                      setInstruments(prev => [...new Set([...prev, instrumentInput.trim()])]);
                      setInstrumentInput('');
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (instrumentInput.trim() && instruments.length < (maxInstruments === Infinity ? 10 : maxInstruments)) {
                      setInstruments(prev => [...new Set([...prev, instrumentInput.trim()])]);
                      setInstrumentInput('');
                    }
                  }}
                  style={{ background: '#22d3ee', color: '#0a0a0b', border: 'none', borderRadius: 6, padding: '9px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
                >
                  Add
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {instruments.map(inst => (
                  <div key={inst} style={{ background: '#181a21', border: '1px solid #2a2d36', borderRadius: 4, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: '#e6e8ee', fontFamily: 'JetBrains Mono, monospace' }}>{inst}</span>
                    <button onClick={() => setInstruments(prev => prev.filter(i => i !== inst))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a5f6a', padding: 0, display: 'flex' }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Trigger */}
          {step === 'trigger' && (
            <div>
              <h3 style={{ color: '#e6e8ee', fontSize: 14, marginBottom: 16 }}>Configure trigger</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {TRIGGER_TYPES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTriggerType(t.id)}
                    style={{
                      background: triggerType === t.id ? '#181a21' : '#0a0a0b',
                      border: `1px solid ${triggerType === t.id ? '#22d3ee' : '#1f2128'}`,
                      borderRadius: 6, padding: '12px 16px', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ color: '#e6e8ee', fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{t.label}</div>
                    <div style={{ color: '#8a8f9b', fontSize: 12, marginBottom: t.plainEnglish ? 6 : 0 }}>{t.description}</div>
                    {t.plainEnglish && (
                      <div style={{ color: '#5a5f6a', fontSize: 11, lineHeight: 1.55 }}>{t.plainEnglish}</div>
                    )}
                  </button>
                ))}
              </div>

              {triggerType === 'cvd_cross' && (
                <div style={{ background: '#0a0a0b', borderRadius: 6, padding: 16, border: '1px solid #1f2128' }}>
                  <label style={{ fontSize: 12, color: '#8a8f9b', display: 'block', marginBottom: 6 }}>CVD Threshold (units)</label>
                  <input
                    style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 6, color: '#e6e8ee', padding: '8px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', fontFamily: 'JetBrains Mono, monospace' }}
                    placeholder="500000"
                    value={triggerParams.threshold ?? ''}
                    onChange={e => setTriggerParams(p => ({ ...p, threshold: e.target.value }))}
                  />
                </div>
              )}

              {triggerType === 'bid_ask_imbalance' && (
                <div style={{ background: '#0a0a0b', borderRadius: 6, padding: 16, border: '1px solid #1f2128', display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: '#8a8f9b', display: 'block', marginBottom: 6 }}>Min ratio (×)</label>
                    <input style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 6, color: '#e6e8ee', padding: '8px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', fontFamily: 'JetBrains Mono, monospace' }}
                      placeholder="3" value={triggerParams.ratio ?? ''}
                      onChange={e => setTriggerParams(p => ({ ...p, ratio: e.target.value }))} />
                  </div>
                </div>
              )}

              {(triggerType === 'large_print' || triggerType === 'sweep') && (
                <div style={{ background: '#0a0a0b', borderRadius: 6, padding: 16, border: '1px solid #1f2128' }}>
                  <label style={{ fontSize: 12, color: '#8a8f9b', display: 'block', marginBottom: 6 }}>Min notional (USD)</label>
                  <input style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 6, color: '#e6e8ee', padding: '8px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', fontFamily: 'JetBrains Mono, monospace' }}
                    placeholder="500000" value={triggerParams.min_notional_usd ?? ''}
                    onChange={e => setTriggerParams(p => ({ ...p, min_notional_usd: e.target.value }))} />
                </div>
              )}
            </div>
          )}

          {/* Step 4: Notifications */}
          {step === 'notifications' && (
            <div>
              <h3 style={{ color: '#e6e8ee', fontSize: 14, marginBottom: 16 }}>Notification channels</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ALL_CHANNELS.map(ch => {
                  const isPremiumOnly = !FREE_CHANNELS.includes(ch);
                  const locked = isPremiumOnly && tier === 'free';
                  const active = channels.includes(ch);
                  return (
                    <div
                      key={ch}
                      onClick={() => {
                        if (locked) return;
                        setChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);
                      }}
                      style={{
                        background: active ? '#181a21' : '#0a0a0b',
                        border: `1px solid ${active ? '#22d3ee' : '#1f2128'}`,
                        borderRadius: 6, padding: '12px 16px', cursor: locked ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        opacity: locked ? 0.5 : 1,
                      }}
                    >
                      <span style={{ color: '#e6e8ee', fontSize: 13, textTransform: 'capitalize' }}>{ch.replace('_', ' ')}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {locked && <span style={{ fontSize: 10, color: '#fbbf24', border: '1px solid #fbbf24', padding: '1px 6px', borderRadius: 3, textTransform: 'uppercase' }}>Pro</span>}
                        {active && !locked && <Check size={14} color="#22d3ee" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 5: Review */}
          {step === 'review' && (
            <div>
              <h3 style={{ color: '#e6e8ee', fontSize: 14, marginBottom: 16 }}>Review & name your setup</h3>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: '#8a8f9b', display: 'block', marginBottom: 6 }}>Setup name</label>
                <input
                  style={{ background: '#0a0a0b', border: '1px solid #1f2128', borderRadius: 6, color: '#e6e8ee', padding: '9px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none' }}
                  placeholder={`${market.toUpperCase()} ${triggerType} signal`}
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
              <div style={{ background: '#0a0a0b', borderRadius: 6, padding: 16, fontSize: 13, color: '#8a8f9b', lineHeight: 1.8 }}>
                <div><span style={{ color: '#5a5f6a' }}>Market:</span> <span style={{ color: '#e6e8ee' }}>{market}</span></div>
                <div><span style={{ color: '#5a5f6a' }}>Instruments:</span> <span style={{ color: '#e6e8ee', fontFamily: 'JetBrains Mono, monospace' }}>{instruments.join(', ')}</span></div>
                <div><span style={{ color: '#5a5f6a' }}>Trigger:</span> <span style={{ color: '#e6e8ee' }}>{triggerType}</span></div>
                <div><span style={{ color: '#5a5f6a' }}>Channels:</span> <span style={{ color: '#e6e8ee' }}>{channels.join(', ')}</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 24px', borderTop: '1px solid #1f2128' }}>
          <button
            onClick={() => stepIdx > 0 && setStep(steps[stepIdx - 1]!)}
            disabled={stepIdx === 0}
            style={{ background: 'none', border: '1px solid #1f2128', borderRadius: 6, padding: '8px 16px', color: '#8a8f9b', cursor: stepIdx === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: stepIdx === 0 ? 0.4 : 1 }}
          >
            <ChevronLeft size={14} /> Back
          </button>

          {step !== 'review' ? (
            <button
              onClick={() => setStep(steps[stepIdx + 1]!)}
              disabled={
                (step === 'market' && !market) ||
                (step === 'instruments' && instruments.length === 0) ||
                (step === 'trigger' && !triggerType)
              }
              style={{ background: '#22d3ee', color: '#0a0a0b', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: ((step === 'market' && !market) || (step === 'instruments' && instruments.length === 0) || (step === 'trigger' && !triggerType)) ? 0.4 : 1 }}
            >
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={save}
              disabled={saving}
              style={{ background: '#22d3ee', color: '#0a0a0b', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}
            >
              {saving ? 'Saving...' : 'Create Signal'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
