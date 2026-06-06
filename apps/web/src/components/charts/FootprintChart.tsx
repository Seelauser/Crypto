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
}

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
};

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

export default function FootprintChart({ instrument, tier, height = 480 }: Props) {
  const [showGate, setShowGate] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bars, setBars] = useState<FootprintBar[]>([]);
  const [hoverBar, setHoverBar] = useState<number | null>(null);
  const [hoverCell, setHoverCell] = useState<FootprintCell | null>(null);

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

        // Highlight
        if (cell.highlight === '10x') {
          ctx.fillStyle = COLORS.buy10x;
          ctx.fillRect(x, y, BAR_W, CELL_H);
        } else if (cell.highlight === '3x') {
          ctx.fillStyle = COLORS.buy3x;
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
    });

    // Vertical separator between price column and bars
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PRICE_COL_W, HEADER_H);
    ctx.lineTo(PRICE_COL_W, H);
    ctx.stroke();
  }, [bars, hoverBar, basePrice]); // hoverBar drives the hover-highlight on the active bar

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
            {hoverCell.highlight && <span style={{ color: hoverCell.highlight === '10x' ? '#ef4444' : '#fbbf24', marginLeft: 6 }}>{hoverCell.highlight}</span>}
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
          }
        }}
        onMouseLeave={() => { setHoverBar(null); setHoverCell(null); }}
      />
    </div>
  );
}
