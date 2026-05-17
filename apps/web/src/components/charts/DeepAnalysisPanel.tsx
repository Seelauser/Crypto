'use client';

import { useState, useRef, useCallback } from 'react';
import type { UserTier } from '@orderflow/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  instrument: string;
  tier: UserTier;
}

interface DonePayload {
  model:        string;
  costCents:    number;
  costUsd:      string;
  elapsedMs:    number;
  inputTokens:  number;
  outputTokens: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Blurred placeholder for free tier ───────────────────────────────────────

function FreeTierPlaceholder({ instrument }: { instrument: string }) {
  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      {/* Blurred mock content */}
      <div
        style={{
          filter: 'blur(5px)',
          userSelect: 'none',
          pointerEvents: 'none',
          padding: '16px 14px',
          fontFamily: 'JetBrains Mono, Fira Code, monospace',
          fontSize: 12,
          lineHeight: 1.7,
          color: '#8a8f9b',
        }}
        aria-hidden="true"
      >
        <p><strong>A) Structure</strong></p>
        <p>VPOC at 42,840 is the dominant control level. VAH 43,120 / VAL 42,450 define the value area. HVN cluster at 42,800–42,900 acts as a magnetic zone. LVN at 43,050–43,150 is a fast-move corridor on a breakout attempt.</p>
        <p><strong>B) Order Flow Narrative</strong></p>
        <p>Buyers are in control: CVD rising +12.4K net over the session, imbalance ratio 1.42× bid-dominant. Delta has been consistently positive on up-closes, suggesting genuine accumulation rather than short covering.</p>
        <p><strong>C) Forward-Looking</strong></p>
        <p>Bullish confirmation: reclaim and hold above VAH 43,120 on above-average volume with CVD &gt; +15K. Bearish confirmation: sustained break below VPOC 42,840 with CVD turning negative.</p>
        <p><strong>D) Risk</strong></p>
        <p>Thesis invalidation: 15-minute close below VAL 42,450 on &gt;200K volume. Logical stop sits beneath 42,380 — below the session low and the nearest HVN floor. Not investment advice.</p>
      </div>

      {/* Upgrade overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          background: 'rgba(10,10,11,0.55)',
          backdropFilter: 'blur(2px)',
        }}
      >
        <div
          style={{
            background: '#13141a',
            border: '1px solid #2a2d36',
            borderRadius: 10,
            padding: '20px 24px',
            textAlign: 'center',
            maxWidth: 320,
          }}
        >
          <div
            style={{
              fontSize: 22,
              marginBottom: 8,
              color: '#f59e0b',
            }}
          >
            Pro Feature
          </div>
          <p
            style={{
              fontSize: 12,
              color: '#8a8f9b',
              lineHeight: 1.5,
              marginBottom: 16,
            }}
          >
            Deep analysis of <strong style={{ color: '#e6e8ee' }}>{instrument}</strong> is
            powered by Claude Opus — our most advanced model. Available on Pro plans.
          </p>
          <a
            href="/billing/upgrade?from=deep_analysis"
            style={{
              display: 'inline-block',
              padding: '8px 20px',
              background: '#22d3ee',
              color: '#0a0a0b',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'JetBrains Mono, monospace',
              textDecoration: 'none',
              letterSpacing: '0.04em',
            }}
          >
            Upgrade to Pro
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DeepAnalysisPanel({ instrument, tier }: Props) {
  const [context, setContext]     = useState('');
  const [streaming, setStreaming] = useState(false);
  const [text, setText]           = useState('');
  const [done, setDone]           = useState<DonePayload | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const abortRef                  = useRef<AbortController | null>(null);

  const isPro = tier === 'premium';

  const handleAnalyze = useCallback(async () => {
    if (!isPro || streaming) return;

    // Reset state
    setText('');
    setDone(null);
    setError(null);
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/ai/deep-analysis', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrument,
          timeframe: '1h',
          context:   context.trim() || undefined,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ message: 'Request failed' }));
        if (res.status === 403) {
          setError('This feature requires a Pro subscription.');
        } else if (res.status === 402) {
          setError('Insufficient AI credit. Please top up from Billing.');
        } else if (res.status === 429) {
          setError('Rate limit: maximum 5 deep analyses per hour.');
        } else {
          setError(errJson.message ?? `Error ${res.status}`);
        }
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError('No response stream');
        setStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last (potentially incomplete) line in the buffer.
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;

          try {
            const event = JSON.parse(raw);
            if (event.type === 'delta') {
              setText(prev => prev + (event.text as string));
            } else if (event.type === 'done') {
              setDone(event as DonePayload);
            } else if (event.type === 'error') {
              setError((event.message as string) ?? 'Stream error');
            }
          } catch {
            // Malformed SSE line — skip
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [instrument, context, isPro, streaming]);

  const handleAbort = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display:       'flex',
        flexDirection: 'column',
        height:        '100%',
        background:    '#0a0a0b',
        overflow:      'hidden',
      }}
    >
      {/* ── Header bar ────────────────────────────────────────────────────── */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '6px 12px',
          borderBottom:   '1px solid #1f2128',
          background:     '#0d0e12',
          flexShrink:     0,
          gap:            8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize:      11,
              fontFamily:    'JetBrains Mono, monospace',
              color:         '#8a8f9b',
              letterSpacing: '0.04em',
            }}
          >
            Deep Analysis
          </span>
          <span
            style={{
              fontSize:   10,
              fontFamily: 'JetBrains Mono, monospace',
              color:      '#5a5f6a',
            }}
          >
            {instrument}
          </span>

          {/* Model badge */}
          <span
            style={{
              fontSize:      9,
              fontFamily:    'JetBrains Mono, monospace',
              background:    '#1a1f2e',
              color:         '#60a5fa',
              padding:       '1px 6px',
              borderRadius:  10,
              letterSpacing: '0.04em',
              border:        '1px solid #1e3a5f',
            }}
          >
            claude-opus-4-7
          </span>
        </div>

        {/* Rate limit notice */}
        <span
          style={{
            fontSize:   9,
            fontFamily: 'JetBrains Mono, monospace',
            color:      '#5a5f6a',
          }}
        >
          5/hour limit
        </span>
      </div>

      {/* ── Free tier: blurred placeholder + upgrade CTA ─────────────────── */}
      {!isPro && <FreeTierPlaceholder instrument={instrument} />}

      {/* ── Pro tier: controls + streaming output ────────────────────────── */}
      {isPro && (
        <>
          {/* Controls bar */}
          <div
            style={{
              display:      'flex',
              alignItems:   'flex-end',
              gap:          8,
              padding:      '10px 12px',
              borderBottom: '1px solid #1f2128',
              flexShrink:   0,
              background:   '#0d0e12',
            }}
          >
            {/* Context input */}
            <div style={{ flex: 1 }}>
              <label
                htmlFor="deep-analysis-context"
                style={{
                  display:       'block',
                  fontSize:      9,
                  fontFamily:    'JetBrains Mono, monospace',
                  color:         '#5a5f6a',
                  marginBottom:  4,
                  letterSpacing: '0.06em',
                }}
              >
                ADD CONTEXT (optional, max 500 chars)
              </label>
              <input
                id="deep-analysis-context"
                type="text"
                value={context}
                maxLength={500}
                disabled={streaming}
                onChange={e => setContext(e.target.value)}
                placeholder={`e.g. Watching for breakout above 43,200…`}
                style={{
                  width:        '100%',
                  background:   '#13141a',
                  border:       '1px solid #2a2d36',
                  borderRadius:  4,
                  padding:       '5px 8px',
                  fontSize:      11,
                  fontFamily:   'JetBrains Mono, monospace',
                  color:         '#e6e8ee',
                  outline:       'none',
                  boxSizing:    'border-box',
                }}
              />
            </div>

            {/* Analyze / Stop buttons */}
            {!streaming ? (
              <button
                onClick={handleAnalyze}
                style={{
                  padding:       '6px 14px',
                  background:    '#22d3ee',
                  color:         '#0a0a0b',
                  border:        'none',
                  borderRadius:   5,
                  fontSize:       11,
                  fontFamily:    'JetBrains Mono, monospace',
                  fontWeight:     700,
                  cursor:         'pointer',
                  whiteSpace:    'nowrap',
                  letterSpacing: '0.04em',
                  flexShrink:    0,
                }}
              >
                Analyze with Opus
              </button>
            ) : (
              <button
                onClick={handleAbort}
                style={{
                  padding:       '6px 14px',
                  background:    '#1f2128',
                  color:         '#f97366',
                  border:        '1px solid #f9736640',
                  borderRadius:   5,
                  fontSize:       11,
                  fontFamily:    'JetBrains Mono, monospace',
                  fontWeight:     700,
                  cursor:         'pointer',
                  whiteSpace:    'nowrap',
                  letterSpacing: '0.04em',
                  flexShrink:    0,
                }}
              >
                Stop
              </button>
            )}
          </div>

          {/* Output area */}
          <div
            style={{
              flex:           1,
              overflowY:      'auto',
              padding:        '14px 14px 12px',
              scrollbarWidth: 'thin',
              scrollbarColor: '#2a2d36 transparent',
            }}
          >
            {/* Error state */}
            {error && (
              <div
                style={{
                  background:   '#1a0f0f',
                  border:       '1px solid #f9736640',
                  borderRadius:  6,
                  padding:      '10px 14px',
                  marginBottom: 12,
                  fontSize:     11,
                  fontFamily:  'JetBrains Mono, monospace',
                  color:        '#f97366',
                }}
              >
                {error}
              </div>
            )}

            {/* Spinner while waiting for first token */}
            {streaming && !text && (
              <div
                style={{
                  display:    'flex',
                  alignItems: 'center',
                  gap:         8,
                  padding:    '12px 0',
                  color:       '#5a5f6a',
                  fontSize:    11,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                <span
                  style={{
                    display:      'inline-block',
                    width:         8,
                    height:        8,
                    borderRadius: '50%',
                    background:   '#22d3ee',
                    animation:    'ofPulse 1s ease-in-out infinite',
                  }}
                />
                Analyzing {instrument}…
              </div>
            )}

            {/* Streaming / completed text — rendered as pre-formatted with line breaks */}
            {text && (
              <pre
                style={{
                  whiteSpace:  'pre-wrap',
                  wordBreak:   'break-word',
                  fontFamily:  'JetBrains Mono, Fira Code, monospace',
                  fontSize:     12,
                  lineHeight:   1.75,
                  color:        '#c9d1d9',
                  margin:       0,
                  padding:      0,
                }}
              >
                {text}
                {streaming && (
                  <span
                    style={{
                      display:       'inline-block',
                      width:          8,
                      height:         13,
                      background:     '#22d3ee',
                      marginLeft:     2,
                      verticalAlign: 'text-bottom',
                      borderRadius:   1,
                      opacity:        0.9,
                    }}
                  />
                )}
              </pre>
            )}

            {/* Idle/empty state */}
            {!streaming && !text && !error && (
              <div
                style={{
                  display:        'flex',
                  flexDirection:  'column',
                  alignItems:     'center',
                  justifyContent: 'center',
                  paddingTop:     40,
                  gap:            8,
                  textAlign:      'center',
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1, color: '#2a2d36' }}>◈</span>
                <span
                  style={{
                    fontSize:   11,
                    fontFamily: 'JetBrains Mono, monospace',
                    color:      '#3a3f4a',
                  }}
                >
                  Click &ldquo;Analyze with Opus&rdquo; for a deep order-flow analysis of {instrument}.
                </span>
              </div>
            )}
          </div>

          {/* Footer: model · cost · time — shown after completion */}
          {done && (
            <div
              style={{
                display:    'flex',
                alignItems: 'center',
                gap:         10,
                padding:    '5px 12px',
                borderTop:  '1px solid #1f2128',
                background: '#0d0e12',
                flexShrink:  0,
                flexWrap:   'wrap',
              }}
            >
              <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#5a5f6a' }}>
                {done.model}
              </span>
              <span style={{ color: '#2a2d36', fontSize: 9 }}>·</span>
              <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#5a5f6a' }}>
                ${done.costUsd}
              </span>
              <span style={{ color: '#2a2d36', fontSize: 9 }}>·</span>
              <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#5a5f6a' }}>
                {formatElapsed(done.elapsedMs)}
              </span>
              <span style={{ color: '#2a2d36', fontSize: 9 }}>·</span>
              <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#5a5f6a' }}>
                {done.inputTokens}→{done.outputTokens} tok
              </span>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes ofPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
