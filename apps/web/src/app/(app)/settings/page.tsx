'use client';

import { useState } from 'react';
import { Bell, Key, User, Webhook, AlertCircle } from 'lucide-react';
import PushToggle from '@/components/ui/PushToggle';
import { useSession } from 'next-auth/react';

export default function SettingsPage() {
  const { data: session } = useSession();
  const tier = (session?.user as any)?.tier ?? 'free';

  const [telegramLink, setTelegramLink] = useState('');
  const [loadingTelegram, setLoadingTelegram] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookSaved, setWebhookSaved] = useState(false);

  async function generateTelegramLink() {
    setLoadingTelegram(true);
    try {
      const res = await fetch('/api/notifications/channels/telegram/link', { method: 'POST' });
      const data = await res.json();
      if (data.deepLink) setTelegramLink(data.deepLink);
    } finally {
      setLoadingTelegram(false);
    }
  }

  async function saveWebhook() {
    if (!webhookUrl) return;
    setWebhookSaving(true);
    try {
      await fetch('/api/notifications/channels/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl, secret: webhookSecret }),
      });
      setWebhookSaved(true);
      setTimeout(() => setWebhookSaved(false), 3000);
    } finally {
      setWebhookSaving(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6e8ee', marginBottom: 24 }}>Settings</h1>

      {/* Profile section */}
      <section style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <User size={15} color="#8a8f9b" />
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#e6e8ee', margin: 0 }}>Account</h2>
        </div>
        <div style={{ display: 'flex', gap: 20, fontSize: 13, color: '#8a8f9b' }}>
          <span><span style={{ color: '#5a5f6a' }}>Username: </span>{session?.user?.name}</span>
          <span><span style={{ color: '#5a5f6a' }}>Email: </span>{session?.user?.email}</span>
          <span><span style={{ color: '#5a5f6a' }}>Plan: </span>
            <span style={{ color: tier === 'premium' ? '#22d3ee' : '#e6e8ee', textTransform: 'capitalize' }}>{tier}</span>
          </span>
        </div>
      </section>

      {/* Notifications section */}
      <section style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <Bell size={15} color="#8a8f9b" />
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#e6e8ee', margin: 0 }}>Notifications</h2>
        </div>

        {/* Browser Push */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 13, color: '#e6e8ee', marginBottom: 2 }}>Browser Push</div>
              <div style={{ fontSize: 12, color: '#8a8f9b' }}>Instant notifications in this browser. Free &amp; Pro.</div>
            </div>
            <PushToggle />
          </div>
        </div>

        {/* Telegram */}
        <div style={{ marginBottom: 24, paddingTop: 16, borderTop: '1px solid #1f2128' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div style={{ fontSize: 13, color: '#e6e8ee' }}>Telegram</div>
            {tier !== 'premium' && <span style={{ border: '1px solid #fbbf24', color: '#fbbf24', fontSize: 10, padding: '1px 5px', borderRadius: 3, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}>Pro</span>}
          </div>
          <div style={{ fontSize: 12, color: '#8a8f9b', marginBottom: 12 }}>
            Receive signal alerts in real time via Telegram bot.
          </div>
          {tier !== 'premium' ? (
            <p style={{ fontSize: 12, color: '#5a5f6a' }}>Upgrade to Pro to connect Telegram.</p>
          ) : telegramLink ? (
            <div style={{ background: '#0a0a0b', borderRadius: 6, padding: 12, border: '1px solid #1f2128' }}>
              <p style={{ color: '#8a8f9b', fontSize: 12, marginBottom: 8 }}>Open this link in Telegram to connect:</p>
              <a href={telegramLink} target="_blank" rel="noopener noreferrer" style={{ color: '#22d3ee', fontSize: 13, wordBreak: 'break-all' }}>
                {telegramLink}
              </a>
            </div>
          ) : (
            <button onClick={generateTelegramLink} disabled={loadingTelegram}
              style={{ background: '#13141a', border: '1px solid #2a2d36', borderRadius: 6, padding: '8px 16px', color: '#e6e8ee', fontSize: 13, cursor: 'pointer' }}>
              {loadingTelegram ? 'Generating...' : 'Connect Telegram'}
            </button>
          )}
        </div>

        {/* Webhook */}
        <div style={{ paddingTop: 16, borderTop: '1px solid #1f2128' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Webhook size={13} color="#8a8f9b" />
            <div style={{ fontSize: 13, color: '#e6e8ee' }}>Outbound Webhook</div>
            {tier !== 'premium' && <span style={{ border: '1px solid #fbbf24', color: '#fbbf24', fontSize: 10, padding: '1px 5px', borderRadius: 3, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}>Pro</span>}
          </div>
          {tier !== 'premium' ? (
            <p style={{ fontSize: 12, color: '#5a5f6a' }}>Upgrade to Pro for outbound webhooks (HMAC-signed JSON).</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, color: '#8a8f9b' }}>
                We'll POST a HMAC-signed JSON payload to your endpoint on every signal trigger.
              </div>
              <input
                style={{ background: '#0a0a0b', border: '1px solid #1f2128', borderRadius: 6, color: '#e6e8ee', padding: '8px 12px', fontSize: 13, outline: 'none' }}
                placeholder="https://your-server.com/webhook"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
              />
              <input
                style={{ background: '#0a0a0b', border: '1px solid #1f2128', borderRadius: 6, color: '#e6e8ee', padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'JetBrains Mono, monospace' }}
                placeholder="HMAC signing secret (optional)"
                value={webhookSecret}
                onChange={e => setWebhookSecret(e.target.value)}
                type="password"
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={saveWebhook} disabled={webhookSaving || !webhookUrl}
                  style={{ background: '#22d3ee', color: '#0a0a0b', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: !webhookUrl ? 0.5 : 1 }}>
                  {webhookSaving ? 'Saving...' : 'Save Webhook'}
                </button>
                {webhookSaved && <span style={{ fontSize: 12, color: '#22c55e' }}>Saved!</span>}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* API keys */}
      <section style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Key size={15} color="#8a8f9b" />
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#e6e8ee', margin: 0 }}>API Access</h2>
          {tier !== 'premium' && <span style={{ border: '1px solid #fbbf24', color: '#fbbf24', fontSize: 10, padding: '1px 5px', borderRadius: 3, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}>Pro</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#8a8f9b' }}>
          <AlertCircle size={13} color="#8a8f9b" />
          REST API + WebSocket API key management coming in V1.1.
        </div>
      </section>
    </div>
  );
}
