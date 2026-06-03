import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { isAdminSession } from '@/lib/admin';
import { getLlmStats, type WindowStats } from '@/lib/llm-stats';

export const metadata = { title: 'Admin · LLM Cost Center' };
export const dynamic  = 'force-dynamic';

// ─── Formatters ───────────────────────────────────────────────────────────────

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const pct = (frac: number) => `${(frac * 100).toFixed(1)}%`;
const num = (n: number) => n.toLocaleString('en-US');

// ─── Shared styles ────────────────────────────────────────────────────────────

const mono = { fontFamily: 'JetBrains Mono, monospace' } as const;
const card = {
  background:   '#13141a',
  border:       '1px solid #1f2128',
  borderRadius: 8,
  padding:      20,
} as const;

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ color: '#8a8f9b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: accent ?? '#e6e8ee' }}>
        {value}
      </div>
    </div>
  );
}

function cacheRateColor(rate: number): string {
  if (rate >= 0.7) return '#22c55e'; // ok
  if (rate >= 0.4) return '#fbbf24'; // warn
  return '#f97366';                  // sell/alert
}

// ─── Window panel ─────────────────────────────────────────────────────────────

function WindowPanel({ w }: { w: WindowStats }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ color: '#e6e8ee', fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>{w.label}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
        <Metric label="Calls"          value={num(w.totalCalls)} />
        <Metric label="Spend"          value={usd(w.totalCostCents)} accent="#22d3ee" />
        <Metric label="Cache hit rate" value={pct(w.cacheHitRate)}   accent={cacheRateColor(w.cacheHitRate)} />
        <Metric label="Cached input"   value={pct(w.cachedInputShare)} />
        <Metric label="Saved by cache" value={usd(w.savedCents)}     accent="#22c55e" />
      </div>

      {w.totalCalls === 0 ? (
        <div style={{ ...card, color: '#5a5f6a', fontSize: 13 }}>No LLM calls in this window.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
          {/* By model */}
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #1f2128', fontSize: 13, fontWeight: 600, color: '#e6e8ee' }}>
              By model
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: '#8a8f9b', textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', padding: '8px 16px', fontWeight: 500 }}>Model</th>
                  <th style={{ padding: '8px 12px', fontWeight: 500 }}>Calls</th>
                  <th style={{ padding: '8px 12px', fontWeight: 500 }}>Spend</th>
                  <th style={{ padding: '8px 16px', fontWeight: 500 }}>Cache R/W</th>
                </tr>
              </thead>
              <tbody>
                {w.byModel.map(m => (
                  <tr key={m.model} style={{ borderTop: '1px solid #1f2128', color: '#e6e8ee' }}>
                    <td style={{ padding: '8px 16px', ...mono }}>{m.model.replace('claude-', '')}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', ...mono }}>{num(m.calls)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', ...mono, color: '#22d3ee' }}>{usd(m.costCents)}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right', ...mono, color: '#8a8f9b' }}>
                      {num(m.cacheReadTokens)} / {num(m.cacheWriteTokens)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* By feature */}
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #1f2128', fontSize: 13, fontWeight: 600, color: '#e6e8ee' }}>
              By feature
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: '#8a8f9b', textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', padding: '8px 16px', fontWeight: 500 }}>Feature</th>
                  <th style={{ padding: '8px 12px', fontWeight: 500 }}>Calls</th>
                  <th style={{ padding: '8px 16px', fontWeight: 500 }}>Spend</th>
                </tr>
              </thead>
              <tbody>
                {w.byFeature.map(f => (
                  <tr key={f.feature} style={{ borderTop: '1px solid #1f2128', color: '#e6e8ee' }}>
                    <td style={{ padding: '8px 16px', ...mono }}>{f.feature}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', ...mono }}>{num(f.calls)}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right', ...mono, color: '#22d3ee' }}>{usd(f.costCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminLlmPage() {
  const session = await auth();

  // Fail-closed: non-admins get a 404, not a 403 — the page's existence is not
  // advertised. Admin allowlist comes from ADMIN_USERNAMES (see lib/admin.ts).
  if (!isAdminSession(session)) notFound();

  const windows = await getLlmStats(db);

  return (
    <div style={{ padding: '24px 24px 64px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: '#e6e8ee', fontSize: 20, fontWeight: 700, margin: 0 }}>LLM Cost Center</h1>
        <p style={{ color: '#8a8f9b', fontSize: 13, margin: '4px 0 0' }}>
          Spend, token mix and prompt-cache effectiveness from <code style={{ ...mono, color: '#22d3ee' }}>llm_calls</code>.
          Cache hit rate = cached-read ÷ (cached-read + cache-write) tokens.
        </p>
      </div>

      {windows.map(w => <WindowPanel key={w.label} w={w} />)}
    </div>
  );
}
