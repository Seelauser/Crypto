'use client';

import { useState } from 'react';
import { Bell, Key, User } from 'lucide-react';

export default function SettingsPage() {
  const [telegramLink, setTelegramLink] = useState('');
  const [loadingTelegram, setLoadingTelegram] = useState(false);

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

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6e8ee', marginBottom: 24 }}>Settings</h1>

      {/* Profile section */}
      <section style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <User size={15} color="#8a8f9b" />
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#e6e8ee', margin: 0 }}>Profile</h2>
        </div>
        <p style={{ color: '#8a8f9b', fontSize: 13 }}>Profile editing coming soon.</p>
      </section>

      {/* Notifications section */}
      <section style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Bell size={15} color="#8a8f9b" />
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#e6e8ee', margin: 0 }}>Notifications</h2>
        </div>

        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 12, color: '#8a8f9b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Telegram (Pro)</h3>
          <p style={{ color: '#8a8f9b', fontSize: 13, marginBottom: 12 }}>
            Connect your Telegram account to receive signal alerts in real time.
          </p>
          {telegramLink ? (
            <div style={{ background: '#0a0a0b', borderRadius: 6, padding: 12, border: '1px solid #1f2128' }}>
              <p style={{ color: '#8a8f9b', fontSize: 12, marginBottom: 8 }}>Open this link in Telegram to connect:</p>
              <a href={telegramLink} target="_blank" rel="noopener noreferrer"
                style={{ color: '#22d3ee', fontSize: 13, wordBreak: 'break-all' }}>
                {telegramLink}
              </a>
            </div>
          ) : (
            <button
              onClick={generateTelegramLink}
              disabled={loadingTelegram}
              style={{ background: '#13141a', border: '1px solid #2a2d36', borderRadius: 6, padding: '8px 16px', color: '#e6e8ee', fontSize: 13, cursor: 'pointer' }}
            >
              {loadingTelegram ? 'Generating...' : 'Connect Telegram'}
            </button>
          )}
        </div>
      </section>

      {/* API keys section */}
      <section style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Key size={15} color="#8a8f9b" />
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#e6e8ee', margin: 0 }}>API Access (Pro)</h2>
        </div>
        <p style={{ color: '#8a8f9b', fontSize: 13 }}>API key management coming in V1.1.</p>
      </section>
    </div>
  );
}
