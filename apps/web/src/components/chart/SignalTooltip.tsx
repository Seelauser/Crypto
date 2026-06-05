'use client';

import { useEffect, useRef, useState } from 'react';
import type { PlacementSignal } from '@/lib/chart/types';

const C = {
  panel:  '#13141a',
  border: '#1f2128',
  bg:     '#0a0a0b',
  ink:    '#e6e8ee',
  dim:    '#8a8f9b',
  long:   '#22d3ee',
  short:  '#f97366',
} as const;
const mono = { fontFamily: 'JetBrains Mono, monospace' } as const;

interface Props {
  signal:    PlacementSignal | null;
  /** Pixel position relative to the chart container. Hidden when null. */
  position:  { x: number; y: number } | null;
  instrument: string;
  tier:      'free' | 'starter' | 'pro';
}

interface ExplainState {
  loading: boolean;
  text:    string | null;
  ai:      boolean;
  error:   string | null;
}

const INITIAL_EXPLAIN: ExplainState = { loading: false, text: null, ai: false, error: null };

/**
 * Hover tooltip rendered above the price chart when the crosshair lands on a
 * placement marker (P5-8). For free users the tooltip shows scoring + triggers
 * only. For starter+ it lazy-fetches `/api/signals/chart-explain` (Haiku for
 * starter, Sonnet for pro) and shows the LLM narration.
 *
 * The fetch is debounced and dedupes per (instrument, direction, confidence)
 * so quickly moving the mouse across a marker doesn't spam the LLM.
 */
export default function SignalTooltip({ signal, position, instrument, tier }: Props) {
  const [explain, setExplain] = useState<ExplainState>(INITIAL_EXPLAIN);
  const lastKeyRef = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!signal || !position || tier === 'free') {
      setExplain(INITIAL_EXPLAIN);
      lastKeyRef.current = '';
      abortRef.current?.abort();
      return;
    }

    const key = `${instrument}|${signal.direction}|${Math.floor(signal.confidence / 10)}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;

    setExplain({ loading: true, text: null, ai: false, error: null });

    // 250ms debounce — hovering across multiple markers shouldn't fire all of them.
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/signals/chart-explain', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instrument,
            direction:  signal.direction,
            confidence: signal.confidence,
            triggers:   signal.triggers.map(t => t.type),
            cvd:        signal.cvd,
            regime:     signal.regime,
          }),
          signal: ctl.signal,
        });
        const data = await res.json();
        if (ctl.signal.aborted) return;
        if (res.ok) {
          setExplain({ loading: false, text: data.explanation, ai: !!data.aiPowered, error: null });
        } else {
          setExplain({ loading: false, text: null, ai: false, error: data.message ?? data.error ?? 'Unable to load.' });
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        setExplain({ loading: false, text: null, ai: false, error: 'Connection failed.' });
      }
    }, 250);

    return () => { clearTimeout(t); ctl.abort(); };
  }, [signal, position, instrument, tier]);

  if (!signal || !position) return null;

  const dir = signal.direction;
  const dirColor = dir === 'long' ? C.long : dir === 'short' ? C.short : C.dim;
  const dirArrow = dir === 'long' ? '▲' : dir === 'short' ? '▼' : '—';

  // Position the tooltip with edge-aware offset (the chart pane caps it).
  const x = position.x;
  const y = position.y;
  const offsetX = x > 280 ? -240 : 12;
  const offsetY = y > 200 ? -140 : 12;

  return (
    <div
      style={{
        position: 'absolute',
        left:  Math.max(0, x + offsetX),
        top:   Math.max(0, y + offsetY),
        zIndex: 40,
        width:  230,
        background: C.panel,
        border: `1px solid ${dirColor}50`,
        borderRadius: 6,
        boxShadow: `0 8px 18px #00000080, 0 0 0 1px ${dirColor}20`,
        padding: '10px 12px',
        pointerEvents: 'none',
        color: C.ink,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: dirColor, ...mono }}>{dirArrow}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: dirColor, textTransform: 'uppercase', letterSpacing: '0.06em', ...mono }}>
          {dir}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: dirColor, ...mono }}>
          {signal.confidence}%
        </span>
      </div>

      {/* Triggers */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {signal.triggers.slice(0, 4).map(t => (
          <span
            key={t.type}
            style={{
              ...mono,
              fontSize: 9,
              color: C.ink,
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 3,
              padding: '1px 5px',
            }}
          >
            {t.type.replace(/_/g, ' ')}
          </span>
        ))}
      </div>

      {/* Explanation (starter+) — tier-aware body */}
      {tier === 'free' ? (
        <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.45 }}>
          Starter unlocks AI-narrated placement reads on every marker.
        </div>
      ) : explain.loading ? (
        <div style={{ fontSize: 11, color: C.dim }}>Reading the flow…</div>
      ) : explain.text ? (
        <>
          <div style={{ fontSize: 11, color: C.ink, lineHeight: 1.45 }}>{explain.text}</div>
          <div style={{ fontSize: 9, color: C.dim, marginTop: 6, ...mono }}>
            {explain.ai ? 'AI-generated' : 'order-flow read'} · {tier === 'pro' ? 'Sonnet' : 'Haiku'}
          </div>
        </>
      ) : explain.error ? (
        <div style={{ fontSize: 11, color: C.short }}>{explain.error}</div>
      ) : (
        <div style={{ fontSize: 11, color: C.dim }}>Hover steady to load explanation…</div>
      )}
    </div>
  );
}
