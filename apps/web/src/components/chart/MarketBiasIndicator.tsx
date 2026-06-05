'use client';

import { useEffect, useState } from 'react';
import type { OhlcvBar } from '@orderflow/types';

interface Props {
  instrument: string;
}

// How many 5m bars to accumulate for the net-CVD read. Matches the spirit of
// the chart's CVD line (net buy/sell pressure over the window) so the badge
// and the line never disagree.
const WINDOW_BARS = 120;
const REFRESH_MS = 20_000;

/**
 * Compact buy/sell bias badge for the markets top bar.
 *
 * Reads the *net* cumulative delta over a fixed window — stable, unlike a
 * single-bar delta which flips sign every bar. Cyan = buyers in control,
 * coral = sellers in control. Mirrors the CVD line colour in CvdChart.
 */
export default function MarketBiasIndicator({ instrument }: Props) {
  const [cvd, setCvd] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchNetCvd() {
      try {
        const res = await fetch(`/api/markets/${instrument}/bars?tf=5m&limit=${WINDOW_BARS}`);
        if (!res.ok) return;
        const payload: { bars?: OhlcvBar[] } | OhlcvBar[] = await res.json();
        const bars: OhlcvBar[] = Array.isArray(payload) ? payload : (payload.bars ?? []);
        if (cancelled || bars.length === 0) return;
        // Bars are ascending; the last bar's cvd is the net over the window.
        setCvd(bars[bars.length - 1].cvd ?? 0);
      } catch {
        // Non-critical surface — leave the previous value in place.
      }
    }

    setCvd(null);
    fetchNetCvd();
    const id = setInterval(fetchNetCvd, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [instrument]);

  if (cvd === null) return null;

  const isBullish = cvd >= 0;
  const color = isBullish ? '#22d3ee' : '#f97366';
  const label = isBullish ? 'BULLISH' : 'BEARISH';
  const direction = isBullish ? '▲' : '▼';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        borderRadius: 4,
        border: `1px solid ${color}30`,
        background: `${color}0a`,
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
        color,
        letterSpacing: '0.04em',
        fontWeight: 500,
      }}
      title={`Net CVD over last ${WINDOW_BARS} × 5m bars: ${cvd >= 0 ? '+' : ''}${cvd.toFixed(0)}`}
    >
      <span style={{ opacity: 0.8 }}>{direction}</span>
      {label}
      <span style={{ fontSize: 9, opacity: 0.7 }}>CVD {Math.abs(cvd).toFixed(0)}</span>
    </div>
  );
}
