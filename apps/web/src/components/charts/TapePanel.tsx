'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMarketSocket } from '@/lib/ws';
import type { Tick } from '@orderflow/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ROWS = 200;
const DEFAULT_MIN_NOTIONAL_FREE    = 100_000;  // $100k free tier
const DEFAULT_MIN_NOTIONAL_PREMIUM =  25_000;  // $25k premium tier

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrintRow {
  id: string;
  ts: number;
  side: 'buy' | 'sell' | 'unknown';
  size: number;
  price: number;
  exchange: string;
  notionalUsd: number;
  isSweep: boolean;
  flashKey: number;   // increments on arrival to trigger flash animation
}

interface Props {
  instrument: string;
  tier: 'free' | 'starter' | 'pro';
  minNotionalUsd?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatNumber(n: number, decimals = 2): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(decimals);
}

function formatNotional(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000)     return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${usd.toFixed(0)}`;
}

let rowCounter = 0;
function makeId(): string {
  return `tape_${++rowCounter}_${Date.now()}`;
}

// ─── Row sub-component ────────────────────────────────────────────────────────

interface RowProps {
  row: PrintRow;
}

function TapeRow({ row }: RowProps) {
  const [flashed, setFlashed] = useState(false);

  // Trigger flash animation on mount / flashKey change
  useEffect(() => {
    setFlashed(true);
    const t = setTimeout(() => setFlashed(false), 600);
    return () => clearTimeout(t);
  }, [row.flashKey]);

  const isBuy  = row.side === 'buy';
  const isSell = row.side === 'sell';
  const accentColor = isBuy ? '#22d3ee' : isSell ? '#f97366' : '#8a8f9b';

  const baseBackground = row.isSweep
    ? isBuy  ? 'rgba(34,211,238,0.07)'
    : isSell ? 'rgba(249,115,102,0.07)'
    : 'rgba(139,148,158,0.05)'
    : 'transparent';

  const flashBackground = flashed
    ? isBuy  ? 'rgba(34,211,238,0.18)'
    : isSell ? 'rgba(249,115,102,0.18)'
    : 'rgba(139,148,158,0.12)'
    : baseBackground;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '68px 42px 90px 90px 70px 80px',
        gap: 0,
        alignItems: 'center',
        padding: '3px 10px 3px 12px',
        borderLeft: `2px solid ${accentColor}`,
        background: flashBackground,
        transition: 'background 400ms ease-out',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, Fira Code, monospace',
        color: '#8a8f9b',
        borderBottom: '1px solid #13141a',
        // Sweep rows: faint glow ring
        boxShadow: row.isSweep
          ? `inset 0 0 12px ${accentColor}10`
          : 'none',
      }}
    >
      {/* Timestamp */}
      <span style={{ color: '#5a5f6a', fontSize: 10 }}>
        {formatTime(row.ts)}
      </span>

      {/* Side badge */}
      <span
        style={{
          color: accentColor,
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: '0.04em',
        }}
      >
        {row.side === 'buy' ? 'BUY' : row.side === 'sell' ? 'SELL' : '?'}
      </span>

      {/* Size */}
      <span style={{ color: '#e6e8ee', textAlign: 'right' }}>
        {formatNumber(row.size, 4)}
      </span>

      {/* Price */}
      <span style={{ color: '#e6e8ee', textAlign: 'right' }}>
        {row.price.toLocaleString('en-US', { maximumFractionDigits: 4 })}
      </span>

      {/* Exchange */}
      <span
        style={{
          color: '#5a5f6a',
          fontSize: 10,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {row.exchange || '—'}
      </span>

      {/* Notional */}
      <span
        style={{
          color: accentColor,
          textAlign: 'right',
          fontWeight: 600,
          fontSize: 11,
        }}
      >
        {formatNotional(row.notionalUsd)}
        {row.isSweep && (
          <span
            style={{
              marginLeft: 4,
              fontSize: 8,
              letterSpacing: '0.08em',
              color: accentColor,
              opacity: 0.8,
              verticalAlign: 'middle',
            }}
          >
            SWEEP
          </span>
        )}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TapePanel({ instrument, tier, minNotionalUsd }: Props) {
  const defaultThreshold = tier === 'pro'
    ? DEFAULT_MIN_NOTIONAL_PREMIUM
    : DEFAULT_MIN_NOTIONAL_FREE;

  const threshold = minNotionalUsd ?? defaultThreshold;

  const [rows, setRows] = useState<PrintRow[]>([]);
  const scrollRef       = useRef<HTMLDivElement>(null);
  const autoScrollRef   = useRef(true);

  // ── WebSocket subscription ──────────────────────────────────────────────
  // Subscribe to raw ticks AND the sweep channel — sweeps come through
  // market:sweep_detected (already flowing for the Placement panel) and are
  // the most reliable source of large-print events. Raw ticks provide the
  // full tape when the ingest workers are publishing.
  const { lastMessage, connected } = useMarketSocket(
    [instrument],
    ['market:ticks', 'market:sweep_detected'],
  );

  // ── Process incoming messages ───────────────────────────────────────────
  useEffect(() => {
    if (!lastMessage) return;

    // ── Raw tick path ────────────────────────────────────────────────────
    // The WS gateway serialises market:ticks → type:'market_ticks' (colons
    // become underscores). Legacy 'tick' kept for back-compat.
    if (lastMessage.type === 'market_ticks' || lastMessage.type === 'tick') {
      const tick = lastMessage.data as Tick;
      if (!tick || tick.instrument !== instrument) return;

      const notional = tick.price * tick.size;
      if (notional < threshold) return;

      // Heuristic sweep detection: large print > 3× threshold
      const isSweep = notional >= threshold * 3;

      const newRow: PrintRow = {
        id:          makeId(),
        ts:          tick.ts,
        side:        tick.side,
        size:        tick.size,
        price:       tick.price,
        exchange:    tick.exchange,
        notionalUsd: notional,
        isSweep,
        flashKey:    rowCounter,
      };

      setRows(prev => {
        const next = [newRow, ...prev];
        if (next.length > MAX_ROWS) return next.slice(0, MAX_ROWS);
        return next;
      });
      return;
    }

    // ── Sweep path ───────────────────────────────────────────────────────
    // market:sweep_detected events are emitted by the Python streaming
    // worker and already power the Placement panel. Route them into the
    // tape as guaranteed sweep rows so the tape is never empty when the
    // Placement panel shows last-sweep data.
    if (lastMessage.type === 'market_sweep_detected') {
      const sw = lastMessage.data as {
        instrument?: string; side?: string;
        price?: number; size?: number; notional_usd?: number;
        exchange?: string; ts?: number;
      };
      if (!sw || sw.instrument !== instrument) return;

      const notional = sw.notional_usd ?? (sw.price ?? 0) * (sw.size ?? 0);
      if (notional < threshold) return;

      const newRow: PrintRow = {
        id:          makeId(),
        ts:          sw.ts ?? Date.now(),
        side:        sw.side === 'sell' ? 'sell' : sw.side === 'buy' ? 'buy' : 'unknown',
        size:        sw.size ?? 0,
        price:       sw.price ?? 0,
        exchange:    sw.exchange ?? '',
        notionalUsd: notional,
        isSweep:     true,  // sweep channel = always a sweep-scale print
        flashKey:    rowCounter,
      };

      setRows(prev => {
        const next = [newRow, ...prev];
        if (next.length > MAX_ROWS) return next.slice(0, MAX_ROWS);
        return next;
      });
    }
  }, [lastMessage, instrument, threshold]);

  // ── Auto-scroll to top (newest) unless user has scrolled away ─────────
  useEffect(() => {
    if (!autoScrollRef.current) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [rows]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    // If user scrolled down more than 60px from top, pause auto-scroll
    autoScrollRef.current = scrollRef.current.scrollTop < 60;
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0a0a0b',
        overflow: 'hidden',
      }}
    >
      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderBottom: '1px solid #1f2128',
          flexShrink: 0,
          background: '#0d0e12',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Title */}
          <span
            style={{
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#8a8f9b',
              letterSpacing: '0.04em',
            }}
          >
            Large Prints
          </span>
          <span
            style={{
              fontSize: 10,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#5a5f6a',
            }}
          >
            {instrument}
          </span>

          {/* Row count */}
          <span
            style={{
              fontSize: 10,
              fontFamily: 'JetBrains Mono, monospace',
              background: '#1f2128',
              color: '#5a5f6a',
              padding: '1px 6px',
              borderRadius: 10,
            }}
          >
            {rows.length}/{MAX_ROWS}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Threshold label */}
          <span
            style={{
              fontSize: 10,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#5a5f6a',
            }}
          >
            min {formatNotional(threshold)}
          </span>

          {/* WS status dot */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: connected ? '#22c55e' : '#f97366',
                boxShadow: connected ? '0 0 4px #22c55e80' : '0 0 4px #f9736680',
              }}
            />
            <span
              style={{
                fontSize: 9,
                fontFamily: 'JetBrains Mono, monospace',
                color: '#5a5f6a',
              }}
            >
              {connected ? 'live' : 'connecting'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Free tier latency notice ───────────────────────────────────────── */}
      {tier === 'free' && (
        <div
          style={{
            padding: '4px 12px',
            background: '#fbbf2408',
            borderBottom: '1px solid #fbbf2420',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 9,
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '0.06em',
              color: '#fbbf24',
            }}
          >
            60s DELAYED
          </span>
          <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#5a5f6a' }}>
            · Upgrade to Pro for real-time tape access
          </span>
          <a
            href="/billing/upgrade?from=tape"
            style={{
              marginLeft: 'auto',
              fontSize: 9,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#22d3ee',
              textDecoration: 'underline',
            }}
          >
            Upgrade
          </a>
        </div>
      )}

      {/* ── Column headers ────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '68px 42px 90px 90px 70px 80px',
          gap: 0,
          padding: '4px 10px 4px 14px',
          borderBottom: '1px solid #1f2128',
          flexShrink: 0,
        }}
      >
        {['TIME', 'SIDE', 'SIZE', 'PRICE', 'EXCHANGE', 'NOTIONAL'].map(col => (
          <span
            key={col}
            style={{
              fontSize: 9,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#5a5f6a',
              letterSpacing: '0.08em',
              textAlign: col === 'SIZE' || col === 'PRICE' || col === 'NOTIONAL' ? 'right' : 'left',
            }}
          >
            {col}
          </span>
        ))}
      </div>

      {/* ── Scrollable tape rows ──────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          // Custom minimal scrollbar
          scrollbarWidth: 'thin',
          scrollbarColor: '#2a2d36 transparent',
        }}
      >
        {rows.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 6,
              paddingTop: 32,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontFamily: 'JetBrains Mono, monospace',
                color: '#2a2d36',
              }}
            >
              Waiting for large prints…
            </span>
            <span
              style={{
                fontSize: 10,
                fontFamily: 'JetBrains Mono, monospace',
                color: '#1f2128',
              }}
            >
              min notional: {formatNotional(threshold)}
            </span>
          </div>
        ) : (
          rows.map(row => <TapeRow key={row.id} row={row} />)
        )}
      </div>
    </div>
  );
}
