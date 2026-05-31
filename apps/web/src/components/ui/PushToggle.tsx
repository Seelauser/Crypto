'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { registerServiceWorker, subscribeToPush } from '@/lib/register-sw';

type PushState = 'unsupported' | 'default' | 'granted' | 'denied' | 'loading';

export default function PushToggle() {
  const [state, setState] = useState<PushState>('loading');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setState(sub ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'default');
      });
    });
  }, []);

  async function toggle() {
    if (state === 'granted') {
      // Unsubscribe
      setState('loading');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch('/api/notifications/push', { method: 'DELETE' });
      }
      setState('default');
      return;
    }

    setState('loading');
    const reg = await registerServiceWorker();
    if (!reg) { setState('unsupported'); return; }
    const sub = await subscribeToPush(reg);
    setState(sub ? 'granted' : 'denied');
  }

  if (state === 'unsupported') return null;

  return (
    <button
      onClick={toggle}
      disabled={state === 'loading' || state === 'denied'}
      title={
        state === 'granted' ? 'Disable browser push notifications' :
        state === 'denied' ? 'Notifications blocked in browser settings' :
        'Enable browser push notifications'
      }
      style={{
        background: state === 'granted' ? '#22d3ee15' : '#13141a',
        border: `1px solid ${state === 'granted' ? '#22d3ee' : '#1f2128'}`,
        borderRadius: 6,
        padding: '6px 12px',
        color: state === 'granted' ? '#22d3ee' : state === 'denied' ? '#5a5f6a' : '#8a8f9b',
        fontSize: 12,
        cursor: state === 'loading' || state === 'denied' ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        transition: 'all 150ms',
      }}
    >
      {state === 'loading' ? (
        <Loader2 size={13} style={{ animation: 'spin 600ms linear infinite' }} />
      ) : state === 'granted' ? (
        <Bell size={13} />
      ) : (
        <BellOff size={13} />
      )}
      {state === 'granted' ? 'Push On' : state === 'denied' ? 'Push Blocked' : 'Enable Push'}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
