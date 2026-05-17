'use client';

import { useRouter } from 'next/navigation';
import { X, Zap } from 'lucide-react';

interface Props {
  feature: string;
  message: string;
  onClose: () => void;
}

export default function TierGateModal({ message, onClose }: Props) {
  const router = useRouter();

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: '#13141a', border: '1px solid #1f2128', borderRadius: 8,
        width: '100%', maxWidth: 400, padding: 28,
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8a8f9b' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Zap size={20} color="#22d3ee" />
          <h3 style={{ color: '#e6e8ee', fontSize: 16, fontWeight: 600, margin: 0 }}>Pro Feature</h3>
        </div>

        <p style={{ color: '#8a8f9b', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
          {message}
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => router.push('/billing/upgrade')}
            style={{
              flex: 1, background: '#22d3ee', color: '#0a0a0b', border: 'none',
              borderRadius: 6, padding: '10px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}
          >
            Upgrade — $69/mo
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid #2a2d36', borderRadius: 6,
              padding: '10px 16px', color: '#8a8f9b', fontSize: 14, cursor: 'pointer',
            }}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
