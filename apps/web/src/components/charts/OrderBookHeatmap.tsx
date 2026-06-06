'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMarketSocket } from '@/lib/ws';
import type { OrderBook } from '@orderflow/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRICE_LEVELS    = 50;          // ±0.5% from mid split across 50 levels
const TIME_WINDOW_MS  = 60_000;      // 60 seconds of history on the X axis
const RENDER_INTERVAL = 200;         // ms between canvas repaints
const MAX_QUEUE       = 300;         // max orderbook snapshots to buffer

// Gradient stops for bid (cyan) and ask (red) heatmap cells
const BID_COLOR_RGB = { r: 34,  g: 211, b: 238 }; // #22d3ee cyan
const ASK_COLOR_RGB = { r: 249, g: 115, b: 102 }; // #f97366 red

// ─── Types ────────────────────────────────────────────────────────────────────

interface HeatCell {
  ts: number;        // unix ms — X axis bucket
  priceIdx: number;  // 0 = lowest price, PRICE_LEVELS-1 = highest
  bidVol: number;
  askVol: number;
}

interface Props {
  instrument: string;
  height?: number;
  tier: 'free' | 'starter' | 'pro';
  /**
   * Price level the reader is currently inspecting in a sibling pane
   * (footprint cell or DOM ladder row — see market-view's lifted
   * `hoveredPrice`). Drawn as a bright marker line so the same level stays
   * visible as you move between "what happened here" (footprint) and
   * "what's resting here right now" (heatmap) — Phase 4 of the order-flow
   * UI redesign, scoped down from full crosshair sync (different rendering
   * stacks made that risky) to the one link that matters most: "this price,
   * across views."
   */
  highlightPrice?: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a CSS rgba string for a heatmap cell.
 * Intensity is log-scaled: alpha = log1p(volume) / log1p(maxVol)
 */
function cellColor(
  vol: number,
  maxVol: number,
  rgb: { r: number; g: number; b: number },
): string {
  if (vol <= 0 || maxVol <= 0) return 'transparent';
  const intensity = Math.log1p(vol) / Math.log1p(maxVol);
  // Clamp to [0.05, 0.92] so even small cells are visible
  const alpha = Math.max(0.05, Math.min(0.92, intensity));
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

/**
 * Map a price to a level index (0 = lowest, PRICE_LEVELS-1 = highest).
 * Returns -1 if outside the ±0.5% range.
 */
function priceToLevel(price: number, midPrice: number): number {
  const range = midPrice * 0.005; // 0.5% of mid
  const low   = midPrice - range;
  const high  = midPrice + range;
  if (price < low || price > high) return -1;
  const idx = Math.floor(((price - low) / (high - low)) * PRICE_LEVELS);
  return Math.max(0, Math.min(PRICE_LEVELS - 1, idx));
}

/**
 * Compute mid price from an order book snapshot.
 */
function getMidPrice(book: OrderBook): number {
  const bestBid = book.bids[0]?.price ?? 0;
  const bestAsk = book.asks[0]?.price ?? 0;
  if (bestBid > 0 && bestAsk > 0) return (bestBid + bestAsk) / 2;
  if (bestBid > 0) return bestBid;
  if (bestAsk > 0) return bestAsk;
  return 0;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrderBookHeatmap({
  instrument,
  height = 220,
  tier,
  highlightPrice,
}: Props) {
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const cellsRef        = useRef<HeatCell[]>([]);
  const queueRef        = useRef<OrderBook[]>([]);
  const rafRef          = useRef<number>(0);
  // Mirrors the `highlightPrice` prop into a ref so the stable `renderFrame`
  // callback (deliberately memoized with no deps — see its definition) can
  // read the latest value each frame without itself needing to change
  // identity, which would otherwise cascade into re-subscribing the render
  // interval on every hover move.
  const highlightPriceRef = useRef<number | null>(null);
  useEffect(() => { highlightPriceRef.current = highlightPrice ?? null; }, [highlightPrice]);
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMidRef      = useRef<number>(0);
  const [dimensions, setDimensions] = useState({ w: 800, h: height });

  const isPremium = tier === 'pro';

  // ── WebSocket: only subscribe when premium ─────────────────────────────────
  const { lastMessage } = useMarketSocket(
    isPremium ? [instrument] : [],
    isPremium ? ['market:orderbook'] : [],
  );

  // ── Ingest incoming orderbook messages ────────────────────────────────────
  useEffect(() => {
    if (!isPremium || !lastMessage) return;
    if (lastMessage.type !== 'orderbook') return;
    const book = lastMessage.data as OrderBook;
    if (book?.instrument !== instrument) return;

    queueRef.current.push(book);
    if (queueRef.current.length > MAX_QUEUE) {
      queueRef.current = queueRef.current.slice(-MAX_QUEUE);
    }
  }, [lastMessage, isPremium, instrument]);

  // ── Process queue into heat cells every RENDER_INTERVAL ms ───────────────
  const processQueue = useCallback(() => {
    const queue = queueRef.current;
    if (queue.length === 0) return;

    const now = Date.now();
    const cutoff = now - TIME_WINDOW_MS;

    // Process each queued snapshot into cells
    for (const book of queue) {
      const mid = getMidPrice(book);
      if (mid <= 0) continue;
      lastMidRef.current = mid;

      for (const level of book.bids) {
        const idx = priceToLevel(level.price, mid);
        if (idx < 0) continue;
        cellsRef.current.push({ ts: book.ts, priceIdx: idx, bidVol: level.size, askVol: 0 });
      }
      for (const level of book.asks) {
        const idx = priceToLevel(level.price, mid);
        if (idx < 0) continue;
        cellsRef.current.push({ ts: book.ts, priceIdx: idx, bidVol: 0, askVol: level.size });
      }
    }
    queueRef.current = [];

    // Evict cells older than the time window
    cellsRef.current = cellsRef.current.filter(c => c.ts >= cutoff);
  }, []);

  // ── Canvas render ─────────────────────────────────────────────────────────
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width: W, height: H } = canvas;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0a0a0b';
    ctx.fillRect(0, 0, W, H);

    const cells = cellsRef.current;
    if (cells.length === 0) {
      // No data yet — show placeholder text
      ctx.fillStyle = '#2a2d36';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for orderbook data…', W / 2, H / 2);
      return;
    }

    const now    = Date.now();
    const cutoff = now - TIME_WINDOW_MS;

    // Compute max volumes for normalisation
    let maxBid = 0;
    let maxAsk = 0;
    for (const c of cells) {
      if (c.bidVol > maxBid) maxBid = c.bidVol;
      if (c.askVol > maxAsk) maxAsk = c.askVol;
    }

    // Each time bucket is 200ms wide → 300 buckets in 60 seconds
    const BUCKET_MS = RENDER_INTERVAL;
    const numBuckets = Math.ceil(TIME_WINDOW_MS / BUCKET_MS);
    const cellW = W / numBuckets;
    const cellH = H / PRICE_LEVELS;

    // Aggregate cells into a 2D grid: [bucketIdx][priceIdx] = {bid, ask}
    type BucketCell = { bid: number; ask: number };
    const grid = new Map<number, Map<number, BucketCell>>();

    for (const c of cells) {
      if (c.ts < cutoff) continue;
      const bucketIdx = Math.floor((c.ts - cutoff) / BUCKET_MS);
      if (bucketIdx < 0 || bucketIdx >= numBuckets) continue;

      if (!grid.has(bucketIdx)) grid.set(bucketIdx, new Map());
      const col = grid.get(bucketIdx)!;
      const existing = col.get(c.priceIdx) ?? { bid: 0, ask: 0 };
      col.set(c.priceIdx, {
        bid: existing.bid + c.bidVol,
        ask: existing.ask + c.askVol,
      });
    }

    // Draw cells
    for (const [bucketIdx, col] of grid) {
      const x = bucketIdx * cellW;
      for (const [priceIdx, volumes] of col) {
        // Y = 0 is TOP of canvas; priceIdx 0 = lowest price = bottom of canvas
        const y = (PRICE_LEVELS - 1 - priceIdx) * cellH;

        // If both bid and ask volume at this level, blend by dominant side
        if (volumes.bid > 0 && volumes.ask === 0) {
          ctx.fillStyle = cellColor(volumes.bid, maxBid, BID_COLOR_RGB);
          ctx.fillRect(x, y, Math.max(cellW - 0.5, 1), Math.max(cellH - 0.5, 1));
        } else if (volumes.ask > 0 && volumes.bid === 0) {
          ctx.fillStyle = cellColor(volumes.ask, maxAsk, ASK_COLOR_RGB);
          ctx.fillRect(x, y, Math.max(cellW - 0.5, 1), Math.max(cellH - 0.5, 1));
        } else if (volumes.bid > 0 && volumes.ask > 0) {
          // Split cell vertically — left half bid, right half ask
          const half = cellW / 2;
          ctx.fillStyle = cellColor(volumes.bid, maxBid, BID_COLOR_RGB);
          ctx.fillRect(x, y, half, Math.max(cellH - 0.5, 1));
          ctx.fillStyle = cellColor(volumes.ask, maxAsk, ASK_COLOR_RGB);
          ctx.fillRect(x + half, y, half, Math.max(cellH - 0.5, 1));
        }
      }
    }

    // ── Grid lines ──────────────────────────────────────────────────────────
    ctx.strokeStyle = '#1f2128';
    ctx.lineWidth   = 0.5;

    // Horizontal grid every 10 price levels
    for (let i = 0; i <= PRICE_LEVELS; i += 10) {
      const y = (i / PRICE_LEVELS) * H;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Vertical grid every 10 seconds
    const secondsStep = 10;
    const bucketStep  = Math.round((secondsStep * 1000) / BUCKET_MS);
    for (let b = 0; b <= numBuckets; b += bucketStep) {
      const x = (b / numBuckets) * W;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // ── Mid-price horizontal line ────────────────────────────────────────────
    if (lastMidRef.current > 0) {
      // Mid price maps to the center of the Y range
      const midY = H / 2;
      ctx.strokeStyle = '#4a4f5a88';
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(W, midY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Cross-pane price highlight ───────────────────────────────────────────
    // The level the reader is currently inspecting in the footprint or DOM
    // ladder, carried over so "this level mattered a moment ago" (footprint)
    // and "this is what's resting there right now" (heatmap) read as the
    // same place rather than two disconnected views.
    const hp = highlightPriceRef.current;
    if (hp != null && lastMidRef.current > 0) {
      const idx = priceToLevel(hp, lastMidRef.current);
      if (idx >= 0) {
        const hy = (PRICE_LEVELS - 1 - idx) * cellH + cellH / 2;
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(0, hy);
        ctx.lineTo(W, hy);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 9px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(hp.toFixed(hp > 100 ? 1 : 5), W - 4, hy - 3);
      }
    }

    // ── X-axis time labels ───────────────────────────────────────────────────
    ctx.fillStyle  = '#5a5f6a';
    ctx.font       = '9px JetBrains Mono, monospace';
    ctx.textAlign  = 'left';

    for (let sec = 0; sec <= 60; sec += 10) {
      const bucketIdx = Math.floor((sec * 1000) / BUCKET_MS);
      const x = (bucketIdx / numBuckets) * W;
      const label = sec === 0 ? 'now−60s' : sec === 60 ? 'now' : `−${60 - sec}s`;
      ctx.fillText(label, x + 2, H - 3);
    }
  }, []);

  // ── Start interval loop ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPremium) return;

    intervalRef.current = setInterval(() => {
      processQueue();
      rafRef.current = requestAnimationFrame(renderFrame);
    }, RENDER_INTERVAL);

    // Initial render to show empty state
    rafRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPremium, processQueue, renderFrame]);

  // ── Draw static placeholder for free tier ─────────────────────────────────
  useEffect(() => {
    if (isPremium) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width: W, height: H } = canvas;
    ctx.fillStyle = '#0a0a0b';
    ctx.fillRect(0, 0, W, H);
    // Faint demo grid
    ctx.strokeStyle = '#1f2128';
    ctx.lineWidth   = 0.5;
    for (let i = 0; i <= PRICE_LEVELS; i += 5) {
      const y = (i / PRICE_LEVELS) * H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    for (let i = 0; i <= 12; i++) {
      const x = (i / 12) * W;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    // Faint demo cells — random blobs to indicate what the heatmap would look like
    const seed = [
      { x: 0.1, y: 0.4, w: 0.08, h: 0.12, bid: true },
      { x: 0.25, y: 0.55, w: 0.06, h: 0.08, bid: false },
      { x: 0.4, y: 0.45, w: 0.1, h: 0.15, bid: true },
      { x: 0.6, y: 0.35, w: 0.05, h: 0.1, bid: false },
      { x: 0.75, y: 0.5, w: 0.07, h: 0.12, bid: true },
    ];
    for (const s of seed) {
      const color = s.bid
        ? `rgba(${BID_COLOR_RGB.r},${BID_COLOR_RGB.g},${BID_COLOR_RGB.b},0.12)`
        : `rgba(${ASK_COLOR_RGB.r},${ASK_COLOR_RGB.g},${ASK_COLOR_RGB.b},0.12)`;
      ctx.fillStyle = color;
      ctx.fillRect(s.x * W, s.y * H, s.w * W, s.h * H);
    }
  }, [isPremium, dimensions]);

  // ── ResizeObserver to keep canvas pixel-perfect ──────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          canvas.width  = Math.round(width * (window.devicePixelRatio || 1));
          canvas.height = Math.round(height * (window.devicePixelRatio || 1));
          ctx_scale(canvas);
          setDimensions({ w: width, h: height });
        }
      }
    });
    ro.observe(canvas.parentElement ?? canvas);
    return () => ro.disconnect();
  }, [height]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        background: '#0a0a0b',
        overflow: 'hidden',
      }}
    >
      {/* ── Canvas ──────────────────────────────────────────────────────────── */}
      <canvas
        ref={canvasRef}
        width={dimensions.w}
        height={height}
        style={{
          width: '100%',
          height,
          display: 'block',
          // Apply blur + opacity when free tier
          filter: isPremium ? 'none' : 'blur(6px)',
          opacity: isPremium ? 1 : 0.3,
        }}
      />

      {/* ── Top-left instrument + title badge ─────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 8,
          zIndex: 5,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.06em',
            padding: '1px 5px',
            borderRadius: 3,
            border: '1px solid #22d3ee30',
            background: '#22d3ee0a',
            color: '#22d3ee',
          }}
        >
          OB Heatmap
        </span>
        <span
          style={{
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            color: '#5a5f6a',
          }}
        >
          {instrument} · 60s
        </span>
      </div>

      {/* ── Legend (top-right) ─────────────────────────────────────────────── */}
      {isPremium && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 8,
            zIndex: 5,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: '#22d3ee80' }} />
            <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#8a8f9b' }}>
              Bid
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: '#f9736680' }} />
            <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#8a8f9b' }}>
              Ask
            </span>
          </div>
        </div>
      )}

      {/* ── Pro gate overlay ───────────────────────────────────────────────── */}
      {!isPremium && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            background: 'rgba(10,10,11,0.55)',
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#22d3ee',
              padding: '3px 10px',
              border: '1px solid #22d3ee40',
              borderRadius: 4,
              background: '#22d3ee10',
            }}
          >
            Pro
          </div>
          <p
            style={{
              color: '#8a8f9b',
              fontSize: 12,
              fontFamily: 'JetBrains Mono, monospace',
              textAlign: 'center',
              maxWidth: 220,
              lineHeight: 1.5,
            }}
          >
            Live order book heatmap requires a Pro subscription.
          </p>
          <a
            href="/billing/upgrade?from=heatmap"
            style={{
              background: '#22d3ee',
              color: '#0a0a0b',
              border: 'none',
              borderRadius: 6,
              padding: '8px 18px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              fontWeight: 700,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            Upgrade to Pro
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Util: apply devicePixelRatio scale to canvas context ─────────────────────

function ctx_scale(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const ctx  = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
}
