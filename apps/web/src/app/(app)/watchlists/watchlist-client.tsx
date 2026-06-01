'use client';

import { useState } from 'react';
import { Plus, X, BookOpen } from 'lucide-react';
import { LIMITS } from '@/lib/limits';
import type { UserTier } from '@orderflow/types';

interface Watchlist { id: string; name: string; instruments: string[] }

export default function WatchlistClient({ watchlists: initial, tier }: { watchlists: Watchlist[]; tier: UserTier }) {
  const [lists, setLists] = useState(initial);
  const [newInst, setNewInst] = useState('');
  const [creating, setCreating] = useState(false);
  const limits = LIMITS[tier];

  async function addInstrument(listId: string, instrument: string) {
    const list = lists.find(l => l.id === listId);
    if (!list) return;
    if (list.instruments.length >= limits.watchlist_instruments_max) {
      alert(`Free tier: max ${limits.watchlist_instruments_max} instruments per watchlist.`);
      return;
    }
    const updated = [...list.instruments, instrument.toUpperCase()];
    await fetch(`/api/watchlists/${listId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruments: updated }),
    });
    setLists(prev => prev.map(l => l.id === listId ? { ...l, instruments: updated } : l));
  }

  async function removeInstrument(listId: string, instrument: string) {
    const list = lists.find(l => l.id === listId);
    if (!list) return;
    const updated = list.instruments.filter(i => i !== instrument);
    await fetch(`/api/watchlists/${listId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruments: updated }),
    });
    setLists(prev => prev.map(l => l.id === listId ? { ...l, instruments: updated } : l));
  }

  async function createWatchlist() {
    if (lists.length >= limits.watchlists_max) {
      alert('Upgrade to Pro for unlimited watchlists.');
      return;
    }
    setCreating(true);
    const res = await fetch('/api/watchlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Watchlist ${lists.length + 1}` }),
    });
    const data = await res.json();
    setLists(prev => [...prev, data]);
    setCreating(false);
  }

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 24px)', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6e8ee', margin: 0 }}>Watchlists</h1>
        <button onClick={createWatchlist} disabled={creating}
          style={{ background: '#22d3ee', color: '#0a0a0b', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> New List
        </button>
      </div>

      {lists.length === 0 && (
        <div style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 48, textAlign: 'center' }}>
          <BookOpen size={32} color="#1f2128" style={{ marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ color: '#5a5f6a', fontSize: 14 }}>No watchlists yet. Create one to track instruments.</p>
        </div>
      )}

      {lists.map(list => (
        <div key={list.id} style={{ background: '#13141a', border: '1px solid #1f2128', borderRadius: 8, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#e6e8ee', margin: 0 }}>{list.name}</h2>
            <span style={{ fontSize: 12, color: '#5a5f6a' }}>
              {list.instruments.length}/{limits.watchlist_instruments_max === Infinity ? '∞' : limits.watchlist_instruments_max}
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {list.instruments.map(inst => (
              <div key={inst} style={{ background: '#0a0a0b', border: '1px solid #2a2d36', borderRadius: 4, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#e6e8ee', fontFamily: 'JetBrains Mono, monospace' }}>{inst}</span>
                <button onClick={() => removeInstrument(list.id, inst)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a5f6a', padding: 0, display: 'flex' }}>
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ flex: 1, background: '#0a0a0b', border: '1px solid #1f2128', borderRadius: 6, color: '#e6e8ee', padding: '7px 10px', fontSize: 13, outline: 'none', fontFamily: 'JetBrains Mono, monospace' }}
              placeholder="Add instrument (e.g. BTCUSDT)"
              value={newInst}
              onChange={e => setNewInst(e.target.value.toUpperCase())}
              onKeyDown={e => {
                if (e.key === 'Enter' && newInst.trim()) {
                  addInstrument(list.id, newInst.trim());
                  setNewInst('');
                }
              }}
            />
            <button
              onClick={() => { if (newInst.trim()) { addInstrument(list.id, newInst.trim()); setNewInst(''); } }}
              style={{ background: '#22d3ee', color: '#0a0a0b', border: 'none', borderRadius: 6, padding: '7px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              Add
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
