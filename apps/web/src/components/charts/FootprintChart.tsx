'use client';

import { useEffect, useRef, useState } from 'react';
import type { UserTier } from '@orderflow/types';
import TierGateModal from '@/components/ui/TierGateModal';

interface FootprintCell {
  price: number;
  bidVol: number;
  askVol: number;
  ratio: number;
  highlight: null | '3x' | '10x';
}

interface FootprintBar {
  ts: number;
  open: number;
  close: number;
  cells: FootprintCell[];
  delta: number;
  totalVol: number;
}

interface Props {
  instrument: string;
  tier: UserTier;
  height?: number;
  /**
   * Most recent sweep read from the lifted placement signal (shared WS
   * subscription — see market-view.tsx). Drives the spike-fade / absorption-
   * glow overlays on the latest bar: a raw sweep flashes and decays quickly,
   * an *absorbed* sweep (aggression met by resting size) glows and holds —
   * the visual distinction between "the move continued" and "the move was
   * eaten" is the whole point of an order-flow-specialised chart (Phase 3 of
   * the UI redesign; ATAS/Bookmap convention).
   */
  lastSweep?: { side: string; notionalUsd: number; ts: number; absorbed: boolean } | null;
  /**
   * Reports the price level under the cursor (or `null` on leave) so a
   * sibling pane — the order-book heatmap — can mark the same level. Phase 4
   * (multi-pane linking), scoped to the one cross-pane link that's actually
   * actionable: "where does this footprint level sit in the live book?"
   */
  onPriceHover?: (price: number | null) => void;
}

/** Spike-fade duration for an un-absorbed sweep — quick flash, quick decay. */
const SWEEP_FLASH_MS = 3_000;
/** Sustained glow duration for an absorbed sweep — the read that matters more. */
const ABSORPTION_GLOW_MS = 12_000;

const CELL_H = 16;
const BAR_W = 80;
const PRICE_COL_W = 72;

const COLORS = {
  bg: '#0a0a0b',
  panel: '#13141a',
  border: '#1f2128',
  fg: '#e6e8ee',
  muted: '#5a5f6a',
  buy: '#22d3ee',
  sell: '#f97366',
  buy3x: 'rgba(251,191,36,0.25)',
  buy10x: 'rgba(239,68,68,0.35)',
  candleUp: '#22d3ee20',
  candleDown: '#f9736620',
  sweepBuy: '34,211,238',   // rgb triplets — alpha varies with the fade/glow timeline
  sweepSell: '249,115,102',
  glow: '251,191,36',
};

/**
 * Imbalance highlight as a continuous intensity, not a binary 3×/10× bucket —
 * the reader should see *how* extreme a level is, not just whether it crossed
 * an arbitrary line. Ramps from transparent at 3× to fully saturated at 10×+,
 * tinted amber→red as it escalates (matches the existing 3x/10x palette so
 * the convention stays familiar, just continuous).
 */
function imbalanceFill(ratio: number): string | null {
  if (ratio < 3) return null;
  const t = Math.min(1, (ratio - 3) / 7); // 3× → 0, 10×+ → 1
  const alpha = 0.12 + t * 0.28;          // 0.12 → 0.40
  // Interpolate amber (251,191,36) → red (239,68,68) as intensity rises.
  const r = Math.round(251 + (239 - 251) * t);
  const g = Math.round(191 + (68 - 191) * t);
  const b = Math.round(36 + (68 - 36) * t);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

function generateMockBars(basePrice: number, count = 12): FootprintBar[] {
  const bars: FootprintBar[] = [];
  let price = basePrice;
  let _cvd = 0;
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const open = price;
    const move = (Math.random() - 0.48) * price * 0.002;
    const close = price + move;
    const high = Math.max(open, close) * (1 + Math.random() * 0.0005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.0005);

    // Generate footprint cells from low to high
    const tickSize = price > 1000 ? 10 : price > 100 ? 1 : price > 1 ? 0.1 : 0.001;
    const numLevels = Math.round((high - low) / tickSize) || 10;
    const cells: FootprintCell[] = [];

    let totalVol = 0;
    let delta = 0;

    for (let j = 0; j <= numLevels; j++) {
      const cellPrice = low + j * tickSize;
      const isNearClose = Math.abs(cellPrice - close) < tickSize * 3;
      const baseLot = price > 1000 ? 2 : price > 100 ? 50 : 10000;
      const askVol = (isNearClose ? 2 : 1) * baseLot * (0.5 + Math.random());
      const bidVol = (isNearClose ? 2 : 1) * baseLot * (0.5 + Math.random());
      const ratio = bidVol > askVol ? bidVol / askVol : askVol / bidVol;
      const highlight = ratio >= 10 ? '10x' : ratio >= 3 ? '3x' : null;
      cells.push({ price: parseFloat(cellPrice.toFixed(8)), bidVol, askVol, ratio, highlight });
      totalVol += bidVol + askVol;
      delta += bidVol - askVol;
    }

    _cvd += delta;
    bars.push({ ts: now - (count - i) * 300_000, open, close, cells, delta, totalVol });
    price = close;
  }
  return bars;
}

export default function FootprintChart({ instrument, tier, height = 480, lastSweep, onPriceHover }: Props) {
  const [showGate, setShowGate] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bars, setBars] = useState<FootprintBar[]>([]);
  const [hoverBar, setHoverBar] = useState<number | null>(null);
  const [hoverCell, setHoverCell] = useState<FootprintCell | null>(null);

  // ── Sweep / absorption animation clock ──────────────────────────────────
  // Re-renders on a timer while a recent sweep is within its flash/glow
  // window, so the overlay visibly decays rather than appearing/vanishing as
  // a hard cut. Stops itself once the active effect has fully faded — no
  // wasted redraws once the read goes stale.
  const [animTick, setAnimTick] = useState(0);
  useEffect(() => {
    if (!lastSweep) return;
    const duration = lastSweep.absorbed ? ABSORPTION_GLOW_MS : SWEEP_FLASH_MS;
    const elapsed = Date.now() - lastSweep.ts;
    if (elapsed >= duration) return;
    const id = setInterval(() => setAnimTick(t => t + 1), 120);
    return () => clearInterval(id);
    // lastSweep is a freshly-allocated object every ~1s recompute cycle even when
    // the underlying sweep hasn't changed; depend on its stable primitive fields
    // instead so the interval doesn't restart on every recompute tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSweep?.ts, lastSweep?.absorbed]);

  // Base price by instrument
  const BASE_PRICES: Record<string, number> = {
    BTCUSDT: 50000, ETHUSDT: 3000, SOLUSDT: 150, BNBUSDT: 400,
    AAPL: 180, NVDA: 500, TSLA: 200, MSFT: 380,
    ES: 5200, NQ: 18000, CL: 78, GC: 2000,
    EURUSD: 1.082, GBPUSD: 1.265,
  };
  const basePrice = BASE_PRICES[instrument] ?? 100;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/markets/${instrument}/footprint?tf=5m&limit=12`);
        if (!res.ok) throw new Error('API error');
        const json = await res.json();
        if (cancelled) return;
        // Map API FootprintBar → local FootprintBar shape
        const mapped: FootprintBar[] = (json.bars ?? []).map((b: {
          ts: number; open: number; close: number; delta: number; volume: number;
          levels: Array<{ price: number; bidVol: number; askVol: number; imbalance: number }>;
        }) => ({
          ts: b.ts, open: b.open, close: b.close, delta: b.delta, totalVol: b.volume,
          cells: b.levels.map(l => ({
            price: l.price, bidVol: l.bidVol, askVol: l.askVol,
            ratio: l.imbalance,
            highlight: l.imbalance >= 10 ? '10x' as const : l.imbalance >= 3 ? '3x' as const : null,
          })),
        }));
        setBars(mapped.length > 0 ? mapped : generateMockBars(basePrice));
      } catch {
        if (!cancelled) setBars(generateMockBars(basePrice));
      }
    }
    load();
    return () => { cancelled = true; };
  }, [instrument, basePrice]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bars.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio ?? 1;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    // Guard: canvas hasn't been laid out yet (offsetWidth/Height = 0 on first
    // render before the browser has measured the element).
    if (W === 0 || H === 0) return;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // The header bar is 32 px tall (position:absolute, zIndex:1) and overlays
    // the top of the canvas.  All cell drawing must stay within the drawable
    // band [HEADER_H .. H] so nothing is hidden beneath it.
    const HEADER_H = 32;
    const drawH = H - HEADER_H; // available vertical pixels for cells

    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    // Price column background (only the drawable band)
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, HEADER_H, PRICE_COL_W, drawH);

    // Draw each bar
    bars.forEach((bar, bIdx) => {
      const isHovered = bIdx === hoverBar;
      const x = PRICE_COL_W + bIdx * (BAR_W + 2);
      if (x > W) return;

      // Bar background (candle direction) — clamped to drawable band
      ctx.fillStyle = isHovered
        ? (bar.close >= bar.open ? 'rgba(34,211,238,0.12)' : 'rgba(249,115,102,0.12)')
        : (bar.close >= bar.open ? COLORS.candleUp : COLORS.candleDown);
      ctx.fillRect(x, HEADER_H, BAR_W, drawH);

      // Cells — map price range onto [HEADER_H .. H - CELL_H]
      const priceMin   = Math.min(...bar.cells.map(c => c.price));
      const priceMax   = Math.max(...bar.cells.map(c => c.price));
      const priceRange = priceMax - priceMin || 1;

      bar.cells.forEach(cell => {
        const yPct = 1 - (cell.price - priceMin) / priceRange;
        // Map 0..1 onto HEADER_H..(H - CELL_H) so no cell is clipped by the header
        const y = HEADER_H + Math.round(yPct * (drawH - CELL_H));

        // Imbalance highlight — continuous intensity (see imbalanceFill),
        // not a binary 3×/10× cutoff. How extreme a level is matters as much
        // as whether it crossed the line.
        const fill = imbalanceFill(cell.ratio);
        if (fill) {
          ctx.fillStyle = fill;
          ctx.fillRect(x, y, BAR_W, CELL_H);
        }

        // Cell border
        ctx.strokeStyle = isHovered ? '#2a2d36' : COLORS.border;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + 0.5, y + 0.5, BAR_W - 1, CELL_H - 1);

        // Bid volume (left half, cyan)
        const halfW = (BAR_W / 2) - 2;
        ctx.fillStyle = COLORS.buy;
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        const bidText = cell.bidVol > 1000 ? `${(cell.bidVol / 1000).toFixed(0)}K` : cell.bidVol.toFixed(0);
        ctx.fillText(bidText, x + halfW, y + 11);

        // Ask volume (right half, red)
        ctx.fillStyle = COLORS.sell;
        ctx.textAlign = 'left';
        const askText = cell.askVol > 1000 ? `${(cell.askVol / 1000).toFixed(0)}K` : cell.askVol.toFixed(0);
        ctx.fillText(askText, x + halfW + 4, y + 11);

        // Price label in price column (leftmost bar only)
        if (bIdx === 0) {
          ctx.fillStyle = COLORS.muted;
          ctx.font = '9px JetBrains Mono, monospace';
          ctx.textAlign = 'right';
          ctx.fillText(cell.price.toFixed(basePrice > 100 ? 0 : 4), PRICE_COL_W - 4, y + 11);
        }
      });

      // Delta at bottom of bar (above the very bottom edge)
      const deltaText = `Δ${bar.delta > 0 ? '+' : ''}${bar.delta > 1000 ? `${(bar.delta / 1000).toFixed(0)}K` : bar.delta.toFixed(0)}`;
      ctx.fillStyle = bar.delta >= 0 ? COLORS.buy : COLORS.sell;
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(deltaText, x + BAR_W / 2, H - 4);

      // ── Sweep / absorption overlay — latest bar only ──────────────────
      // Two distinct visual languages, because they mean opposite things:
      //   • raw sweep (not absorbed): aggression went through cleanly → a
      //     quick, bright spike that fades fast (the moment passed).
      //   • absorbed sweep: aggression met resting size and stalled → a
      //     slow, sustained glow (the level held — the more durable read).
      if (lastSweep && bIdx === bars.length - 1) {
        const duration = lastSweep.absorbed ? ABSORPTION_GLOW_MS : SWEEP_FLASH_MS;
        const elapsed = Date.now() - lastSweep.ts;
        if (elapsed >= 0 && elapsed < duration) {
          const life = 1 - elapsed / duration; // 1 → fresh, 0 → expired
          const rgb = lastSweep.absorbed ? COLORS.glow : (lastSweep.side === 'buy' ? COLORS.sweepBuy : COLORS.sweepSell);
          if (lastSweep.absorbed) {
            // Sustained glow: slow pulse + persistent border halo.
            const pulse = 0.55 + 0.45 * Math.sin(elapsed / 420);
            ctx.fillStyle = `rgba(${rgb},${(life * 0.16 * pulse).toFixed(3)})`;
            ctx.fillRect(x, HEADER_H, BAR_W, drawH);
            ctx.strokeStyle = `rgba(${rgb},${(life * 0.9).toFixed(3)})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 1, HEADER_H + 1, BAR_W - 2, drawH - 2);
          } else {
            // Spike-fade: bright flash that decays quickly (eased — fast at first).
            const eased = life * life;
            ctx.fillStyle = `rgba(${rgb},${(eased * 0.35).toFixed(3)})`;
            ctx.fillRect(x, HEADER_H, BAR_W, drawH);
            ctx.strokeStyle = `rgba(${rgb},${(eased * 0.8).toFixed(3)})`;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 0.75, HEADER_H + 0.75, BAR_W - 1.5, drawH - 1.5);
          }
        }
      }
    });

    // Vertical separator between price column and bars
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PRICE_COL_W, HEADER_H);
    ctx.lineTo(PRICE_COL_W, H);
    ctx.stroke();
  }, [bars, hoverBar, basePrice, lastSweep, animTick]); // animTick drives the sweep/absorption decay redraw

  if (tier === 'free') {
    return (
      <div style={{ position: 'relative', height, background: COLORS.bg, borderRadius: 6, border: `1px solid ${COLORS.border}`, overflow: 'hidden' }}>
        {/* Blurred preview */}
        <div style={{ filter: 'blur(6px)', opacity: 0.3, height: '100%' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        </div>
        {/* Upgrade overlay */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 13, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono, monospace' }}>
            FOOTPRINT CHART
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.fg }}>Pro Feature</div>
          <p style={{ color: COLORS.muted, fontSize: 13, textAlign: 'center', maxWidth: 280 }}>
            Bid/ask footprint with 3× and 10× imbalance highlighting. Upgrade to Pro.
          </p>
          <button
            onClick={() => setShowGate(true)}
            style={{ background: '#22d3ee', color: COLORS.bg, border: 'none', borderRadius: 6, padding: '10px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            Upgrade — $69/mo
          </button>
        </div>
        {showGate && (
          <TierGateModal
            feature="footprint_chart"
            message="Footprint chart with bid/ask imbalance analysis requires a Pro subscription."
            onClose={() => setShowGate(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height, background: COLORS.bg, borderRadius: 6, border: `1px solid ${COLORS.border}`, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 32, background: COLORS.panel, borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', paddingLeft: PRICE_COL_W + 8, gap: 16, zIndex: 1 }}>
        <span style={{ fontSize: 11, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Footprint · 5m</span>
        <span className="badge-true-l2">True L2</span>
        {hoverCell && (
          <span style={{ fontSize: 11, color: COLORS.muted, fontFamily: 'JetBrains Mono, monospace' }}>
            @ {hoverCell.price.toFixed(basePrice > 100 ? 1 : 5)} · bid {hoverCell.bidVol.toFixed(0)} · ask {hoverCell.askVol.toFixed(0)} · {hoverCell.ratio.toFixed(1)}×
          </span>
        )}
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
        onMouseMove={e => {
          const rect = canvasRef.current!.getBoundingClientRect();
          const x = e.clientX - rect.left;
          // Subtract header height so y=0 aligns with the top of the drawable band
          const HEADER_H = 32;
          const y = e.clientY - rect.top - HEADER_H;
          if (y < 0) return; // cursor is over the header — ignore
          const bIdx = Math.floor((x - PRICE_COL_W) / (BAR_W + 2));
          if (bIdx >= 0 && bIdx < bars.length) {
            setHoverBar(bIdx);
            const bar = bars[bIdx]!;
            const priceMin = Math.min(...bar.cells.map(c => c.price));
            const priceMax = Math.max(...bar.cells.map(c => c.price));
            const drawH = rect.height - HEADER_H;
            const pct = 1 - y / drawH;
            const hoverPrice = priceMin + pct * (priceMax - priceMin);
            const closest = bar.cells.reduce((a, b) =>
              Math.abs(a.price - hoverPrice) < Math.abs(b.price - hoverPrice) ? a : b
            );
            setHoverCell(closest);
            onPriceHover?.(closest.price);
          } else {
            // cursor is over the price column or past the last bar — clear so the
            // cross-pane heatmap highlight doesn't get stuck on a stale price
            setHoverBar(null);
            setHoverCell(null);
            onPriceHover?.(null);
          }
        }}
        onMouseLeave={() => { setHoverBar(null); setHoverCell(null); onPriceHover?.(null); }}
      />
    </div>
  );
}
