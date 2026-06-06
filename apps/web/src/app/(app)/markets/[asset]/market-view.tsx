'use client';

import { useState, useMemo, useEffect, useRef, useCallback, type RefObject } from 'react';
import Link from 'next/link';
import CvdChart, { type Timeframe } from '@/components/charts/CvdChart';
import FootprintChart from '@/components/charts/FootprintChart';
import DomLadder from '@/components/charts/DomLadder';
import OrderBookHeatmap from '@/components/charts/OrderBookHeatmap';
import TapePanel from '@/components/charts/TapePanel';
import TapeNarrator from '@/components/charts/TapeNarrator';
import DeepAnalysisPanel from '@/components/charts/DeepAnalysisPanel';
import CorrelationPanel from '@/components/charts/CorrelationPanel';
import PlacementPanel from '@/components/chart/PlacementPanel';
import FlowStatsStrip from '@/components/chart/FlowStatsStrip';
import ChartToolbar, { DEFAULT_LAYERS, type ChartLayerState } from '@/components/chart/ChartToolbar';
import SignalTooltip from '@/components/chart/SignalTooltip';
import MarketBiasIndicator from '@/components/chart/MarketBiasIndicator';
import { usePlacementSignal } from '@/lib/chart/usePlacementSignal';
import { useMarketSocket, useInstrumentTick } from '@/lib/ws';
import type { AssetClass } from '@orderflow/types';
import type { PlacementSignal } from '@/lib/chart/types';

type BottomPanel = 'placement' | 'tape' | 'tape_ai' | 'deep_analysis' | 'correlation';

// ─── Instrument lists per asset class ────────────────────────────────────────

const INSTRUMENTS: Record<AssetClass, string[]> = {
  crypto:      ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT'],
  stocks:      ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META'],
  futures:     ['ES', 'NQ', 'RTY', 'YM', 'CL', 'GC'],
  forex:       ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD'],
  commodities: ['GC', 'SI', 'CL', 'NG', 'ZC', 'ZW'],
  resources:   ['VALE', 'RIO', 'BHP', 'FCX', 'AA', 'NEM'],
};

const ASSET_LABELS: Record<AssetClass, string> = {
  crypto:      'Crypto',
  stocks:      'Stocks',
  futures:     'Futures',
  forex:       'Forex',
  commodities: 'Commodities',
  resources:   'Resources',
};

const ALL_ASSET_CLASSES: AssetClass[] = [
  'crypto', 'stocks', 'futures', 'forex', 'commodities', 'resources',
];

// ─── Seeded mock data helpers (stable across renders) ─────────────────────────

/**
 * Simple mulberry32 PRNG seeded by a string hash.
 * Returns a function that yields values in [0, 1).
 */
function makeRng(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i);
  }
  let s = h >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface MockInstrumentData {
  price: number;
  change24h: number;
  cvdDir: 'up' | 'down' | 'neutral';
  imbalanceRatio: number;
}

function generateMockData(instrument: string): MockInstrumentData {
  const rng = makeRng(instrument);

  // Base price seeded to realistic ranges per instrument class
  let base = 100;
  if (/USDT?$/.test(instrument)) {
    if (instrument.startsWith('BTC'))  base = 60000 + rng() * 40000;
    else if (instrument.startsWith('ETH')) base = 2500 + rng() * 2000;
    else if (instrument.startsWith('SOL')) base = 100 + rng() * 150;
    else if (instrument.startsWith('BNB')) base = 300 + rng() * 200;
    else base = 0.1 + rng() * 5;
  } else if (['ES', 'NQ', 'YM', 'RTY'].includes(instrument)) {
    base = instrument === 'ES' ? 4500 + rng() * 1000
         : instrument === 'NQ' ? 15000 + rng() * 5000
         : instrument === 'YM' ? 35000 + rng() * 5000
         : 1800 + rng() * 400;
  } else if (['AAPL', 'MSFT', 'AMZN', 'META', 'NVDA', 'TSLA'].includes(instrument)) {
    base = instrument === 'NVDA' ? 400 + rng() * 500
         : instrument === 'TSLA' ? 150 + rng() * 200
         : 100 + rng() * 300;
  } else if (['EURUSD', 'GBPUSD', 'AUDUSD'].includes(instrument)) {
    base = 1.05 + rng() * 0.15;
  } else if (['USDJPY'].includes(instrument)) {
    base = 130 + rng() * 20;
  } else if (['USDCHF', 'USDCAD'].includes(instrument)) {
    base = 0.85 + rng() * 0.25;
  } else if (instrument === 'GC') {
    base = 1800 + rng() * 400;
  } else if (instrument === 'SI') {
    base = 20 + rng() * 15;
  } else if (instrument === 'CL') {
    base = 70 + rng() * 30;
  } else {
    base = 10 + rng() * 990;
  }

  const change24h = (rng() - 0.48) * 8;   // -4% to +4%
  const cvdSeed   = rng();
  const cvdDir    = cvdSeed > 0.55 ? 'up' : cvdSeed < 0.45 ? 'down' : 'neutral';
  const imbalanceRatio = 0.8 + rng() * 2.4; // 0.8 to 3.2

  return { price: base, change24h, cvdDir, imbalanceRatio };
}

// ─── Asset class tab ──────────────────────────────────────────────────────────

function AssetTab({
  asset,
  active,
}: {
  asset: AssetClass;
  active: boolean;
}) {
  return (
    <Link
      href={`/markets/${asset}`}
      style={{
        padding: '5px 12px',
        borderRadius: 5,
        fontSize: 12,
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: active ? 700 : 400,
        color: active ? '#22d3ee' : '#8a8f9b',
        background: active ? '#22d3ee12' : 'transparent',
        border: `1px solid ${active ? '#22d3ee30' : 'transparent'}`,
        textDecoration: 'none',
        transition: 'color 140ms, background 140ms, border-color 140ms',
        whiteSpace: 'nowrap',
      }}
    >
      {ASSET_LABELS[asset]}
    </Link>
  );
}

// ─── Instrument list row ──────────────────────────────────────────────────────

function InstrumentRow({
  instrument,
  selected,
  mockData,
  onSelect,
}: {
  instrument: string;
  selected: boolean;
  mockData: MockInstrumentData;
  onSelect: (sym: string) => void;
}) {
  // Try to pick up real-time tick; fall back to mock price
  const liveTick = useInstrumentTick(instrument);
  const price     = liveTick?.price ?? mockData.price;
  const side      = liveTick?.side;

  const isPos    = mockData.change24h >= 0;
  const cvdColor = mockData.cvdDir === 'up' ? '#22d3ee'
                 : mockData.cvdDir === 'down' ? '#f97366'
                 : '#8a8f9b';

  return (
    <button
      onClick={() => onSelect(instrument)}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '2px 8px',
        padding: '8px 10px',
        borderLeft: `2px solid ${selected ? '#22d3ee' : 'transparent'}`,
        background: selected ? '#22d3ee08' : 'transparent',
        border: 'none',
        borderBottom: '1px solid #13141a',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'background 120ms, border-color 120ms',
      }}
    >
      {/* Row: instrument symbol + CVD arrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            fontSize: 12,
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 600,
            color: selected ? '#e6e8ee' : '#c4c9d4',
            letterSpacing: '0.02em',
          }}
        >
          {instrument}
        </span>
        {/* CVD direction arrow */}
        <span style={{ fontSize: 11, color: cvdColor, lineHeight: 1 }}>
          {mockData.cvdDir === 'up' ? '▲' : mockData.cvdDir === 'down' ? '▼' : '—'}
        </span>
      </div>

      {/* Row: last price */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
        <span
          style={{
            fontSize: 12,
            fontFamily: 'JetBrains Mono, monospace',
            color: liveTick
              ? side === 'buy' ? '#22d3ee' : side === 'sell' ? '#f97366' : '#e6e8ee'
              : '#8a8f9b',
            fontWeight: 600,
          }}
        >
          {price >= 10000
            ? price.toLocaleString('en-US', { maximumFractionDigits: 0 })
            : price >= 1
            ? price.toFixed(2)
            : price.toFixed(5)}
        </span>
        <span
          style={{
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            color: isPos ? '#22c55e' : '#f97366',
          }}
        >
          {isPos ? '+' : ''}{mockData.change24h.toFixed(2)}%
        </span>
      </div>

      {/* Row: imbalance ratio below */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
        <div
          style={{
            height: 2,
            flex: 1,
            borderRadius: 1,
            background: '#1f2128',
            overflow: 'hidden',
          }}
        >
          {/* Bid side fill */}
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, (mockData.imbalanceRatio / 4) * 100)}%`,
              background: mockData.imbalanceRatio >= 1 ? '#22d3ee60' : '#f9736660',
              borderRadius: 1,
              transition: 'width 300ms',
            }}
          />
        </div>
        <span
          style={{
            fontSize: 9,
            fontFamily: 'JetBrains Mono, monospace',
            color: '#5a5f6a',
            whiteSpace: 'nowrap',
          }}
        >
          {mockData.imbalanceRatio.toFixed(2)}x
        </span>
      </div>
    </button>
  );
}

// ─── WS Status indicator ──────────────────────────────────────────────────────

function WsStatusBadge({ connected }: { connected: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 4,
        background: connected ? '#22c55e0a' : '#f973660a',
        border: `1px solid ${connected ? '#22c55e30' : '#f9736630'}`,
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: connected ? '#22c55e' : '#f97366',
          boxShadow: connected ? '0 0 5px #22c55e80' : '0 0 5px #f9736680',
          animation: connected ? 'none' : 'pulse 1.4s ease-in-out infinite',
        }}
      />
      <span
        style={{
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          color: connected ? '#22c55e' : '#f97366',
          letterSpacing: '0.04em',
        }}
      >
        {connected ? 'WS: live' : 'WS: connecting...'}
      </span>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  asset: AssetClass;
  tier: 'free' | 'starter' | 'pro';
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MarketView({ asset, tier }: Props) {
  const instruments = INSTRUMENTS[asset] ?? INSTRUMENTS.crypto;

  const [selectedInstrument, setSelectedInstrument] = useState<string>(instruments[0]);
  const [searchQuery,        setSearchQuery]        = useState('');
  const [bottomPanel,        setBottomPanel]        = useState<BottomPanel>('placement');
  const [sidebarCollapsed,   setSidebarCollapsed]   = useState(false);
  const [timeframe,          setTimeframe]          = useState<Timeframe>('5m');

  // Smart layer defaults by tier — all tiers land on candles + Vol Profile so
  // the timeframe selector and CVD chart are always visible on first load.
  // Footprint and Depth are opt-in via the toolbar (Pro-gated in ChartToolbar).
  // NOTE: Previously Pro defaulted footprint=true which routed to FootprintChart,
  // hiding the CvdChart and its timeframe selector entirely — confirmed broken live.
  const [layers, setLayers] = useState<ChartLayerState>(() => {
    const base = { ...DEFAULT_LAYERS };
    if (tier === 'pro' || tier === 'starter') {
      base.volume_profile = true;
    }
    return base;
  });

  // Connect to WebSocket for all instruments + market channels
  const { connected } = useMarketSocket(instruments, ['market:ticks', 'market:cvd_update', 'market:orderbook']);

  // ─── Lifted placement signal — feeds the chart markers + bottom panel from
  //     a single WebSocket subscription (avoids running the placement hook
  //     twice when both surfaces are visible).
  const placementState = usePlacementSignal(selectedInstrument, tier !== 'free');

  // Cropped, instrument-scoped marker history. Resets when the instrument
  // changes so old BTCUSDT markers don't decorate ETHUSDT's chart.
  const placementHistory = useMemo(
    () => placementState.history.filter(s => s.instrument === selectedInstrument),
    [placementState.history, selectedInstrument],
  );

  // ─── Marker hover state (chart → tooltip)
  const [hover, setHover] = useState<{ signal: PlacementSignal; x: number; y: number } | null>(null);
  const handleMarkerHover = useCallback((signal: PlacementSignal | null, x: number, y: number) => {
    if (!signal) { setHover(null); return; }
    setHover({ signal, x, y });
  }, []);

  // ─── Cross-pane price highlight (Phase 4 — multi-pane linking, scoped) ───
  // The footprint and DOM ladder both report the price level under the
  // cursor; the order-book heatmap (always visible in the sidebar) marks
  // that same level. Lets the reader carry "this level" between "what
  // happened here" (footprint), "what's resting here now" (DOM), and "how
  // has size built up here over the last minute" (heatmap) — instead of
  // three disconnected views of the same instrument.
  const [hoveredPrice, setHoveredPrice] = useState<number | null>(null);
  // Clear a stale highlight when the reader switches instruments or away from
  // a view that reports hover (candles view doesn't emit price-hover at all).
  useEffect(() => { setHoveredPrice(null); }, [selectedInstrument, layers.footprint, layers.orderbook]);

  // Stable mock data per instrument (seeded, consistent across renders)
  const mockDataMap = useMemo<Map<string, MockInstrumentData>>(() => {
    const map = new Map<string, MockInstrumentData>();
    for (const sym of instruments) {
      map.set(sym, generateMockData(sym));
    }
    return map;
  }, [instruments]);

  // Reset selected instrument when asset class changes
  useEffect(() => {
    setSelectedInstrument(instruments[0]);
    setSearchQuery('');
  }, [asset, instruments]);

  // Filtered instrument list based on search
  const filteredInstruments = useMemo(() => {
    if (!searchQuery.trim()) return instruments;
    const q = searchQuery.trim().toUpperCase();
    return instruments.filter(sym => sym.includes(q));
  }, [instruments, searchQuery]);

  const chartPaneRef = useRef<HTMLDivElement>(null);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: '#0a0a0b',
        color: '#e6e8ee',
      }}
    >
      {/* ═══════════════════════════════════════════════════════════════════════
          TOP BAR
      ═══════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 12px',
          borderBottom: '1px solid #1f2128',
          background: '#0d0e12',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        {/* Asset class tabs */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {ALL_ASSET_CLASSES.map(a => (
            <AssetTab key={a} asset={a} active={a === asset} />
          ))}
        </div>

        {/* Separator */}
        <div
          style={{
            width: 1,
            height: 20,
            background: '#1f2128',
            flexShrink: 0,
          }}
        />

        {/* Instrument search */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search symbol…"
            style={{
              background: '#13141a',
              border: '1px solid #2a2d36',
              borderRadius: 5,
              padding: '4px 10px 4px 28px',
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#e6e8ee',
              outline: 'none',
              width: 160,
            }}
          />
          {/* Search icon */}
          <svg
            style={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#5a5f6a"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Selected instrument badge */}
        <span
          style={{
            fontSize: 12,
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 700,
            color: '#e6e8ee',
            padding: '3px 8px',
            border: '1px solid #22d3ee30',
            borderRadius: 4,
            background: '#22d3ee0a',
          }}
        >
          {selectedInstrument}
        </span>

        {/* WS status */}
        <WsStatusBadge connected={connected} />

        {/* Market bias indicator */}
        <MarketBiasIndicator instrument={selectedInstrument} />

        {/* Tier badge */}
        <div
          style={{
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.1em',
            padding: '3px 8px',
            borderRadius: 4,
            border: `1px solid ${tier === 'pro' ? '#fbbf2440' : '#1f2128'}`,
            background: tier === 'pro' ? '#fbbf2410' : '#13141a',
            color: tier === 'pro' ? '#fbbf24' : '#5a5f6a',
          }}
        >
          {tier === 'pro' ? 'PRO' : 'FREE'}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MAIN LAYOUT: left panel + center/right panes
      ═══════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {/* ── Left panel: instrument list + heatmap ───────────────────────── */}
        <div
          style={{
            width: sidebarCollapsed ? 0 : 260,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: sidebarCollapsed ? 'none' : '1px solid #1f2128',
            overflow: 'hidden',
            transition: 'width 200ms ease',
          }}
        >
          {/* Instrument list header */}
          <div
            style={{
              padding: '6px 10px',
              borderBottom: '1px solid #1f2128',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
              background: '#0d0e12',
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontFamily: 'JetBrains Mono, monospace',
                color: '#5a5f6a',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {ASSET_LABELS[asset]}
            </span>
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
              {filteredInstruments.length}
            </span>
          </div>

          {/* Scrollable instrument list */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              scrollbarWidth: 'thin',
              scrollbarColor: '#2a2d36 transparent',
              minHeight: 0,
            }}
          >
            {filteredInstruments.length === 0 ? (
              <div
                style={{
                  padding: '24px 10px',
                  textAlign: 'center',
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                  color: '#2a2d36',
                }}
              >
                No results for &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              filteredInstruments.map(sym => (
                <InstrumentRow
                  key={sym}
                  instrument={sym}
                  selected={sym === selectedInstrument}
                  mockData={mockDataMap.get(sym)!}
                  onSelect={setSelectedInstrument}
                />
              ))
            )}
          </div>

          {/* ── Heatmap pane (below instrument list) ──────────────────────── */}
          <div
            style={{
              flexShrink: 0,
              borderTop: '1px solid #1f2128',
            }}
          >
            <OrderBookHeatmap
              instrument={selectedInstrument}
              height={180}
              tier={tier}
              highlightPrice={hoveredPrice}
            />
          </div>
        </div>

        {/* ── Right section: chart pane + tape panel ─────────────────────── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {/* Layer toolbar (P5-9) — tier-aware chart layer toggles */}
          <ChartToolbar
            tier={tier}
            layers={layers}
            onChange={setLayers}
            sidebarCollapsed={sidebarCollapsed}
            onSidebarToggle={setSidebarCollapsed}
          />

          {/* Chart pane — fills remaining vertical space above tape */}
          <div
            ref={chartPaneRef}
            style={{
              flex: 1,
              overflow: 'hidden',
              minHeight: 0,
              position: 'relative',
            }}
          >
            <ChartPaneAutoHeight
              instrument={selectedInstrument}
              tier={tier}
              containerRef={chartPaneRef}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
              showVolumeProfile={layers.volume_profile}
              primaryView={layers.footprint ? 'footprint' : layers.orderbook ? 'depth' : 'candles'}
              placementHistory={layers.placement ? placementHistory : []}
              onMarkerHover={layers.placement ? handleMarkerHover : undefined}
              lastSweep={placementState.lastSweep}
              onPriceHover={setHoveredPrice}
            />
            <SignalTooltip
              signal={hover?.signal ?? null}
              position={hover ? { x: hover.x, y: hover.y } : null}
              instrument={selectedInstrument}
              tier={tier}
            />
          </div>

          {/* Bar-by-bar flow stats — Volume/Delta/Relative-Strength/CVD for
              the last ~20 bars on the active timeframe (Phase 2 of the
              order-flow UI redesign: scan recent flow without leaving the chart). */}
          <FlowStatsStrip instrument={selectedInstrument} timeframe={timeframe} tier={tier} />

          {/* ── Bottom panel: tab bar + selected panel ─────────────────── */}
          <div
            style={{
              flexShrink:    0,
              borderTop:    '1px solid #1f2128',
              display:      'flex',
              flexDirection: 'column',
              overflow:     'hidden',
            }}
          >
            {/* Tab bar */}
            <div
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:           4,
                padding:      '4px 10px',
                borderBottom: '1px solid #1f2128',
                background:   '#0d0e12',
                flexShrink:    0,
              }}
            >
              {(
                [
                  { id: 'placement',     label: 'Placement' },
                  { id: 'tape',          label: 'Tape' },
                  { id: 'tape_ai',       label: 'Tape AI' },
                  { id: 'deep_analysis', label: 'Deep Analysis', pro: true },
                  { id: 'correlation',   label: 'Correlation' },
                ] as Array<{ id: BottomPanel; label: string; pro?: boolean }>
              ).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setBottomPanel(tab.id)}
                  style={{
                    padding:       '3px 10px',
                    borderRadius:   4,
                    fontSize:       10,
                    fontFamily:    'JetBrains Mono, monospace',
                    fontWeight:     bottomPanel === tab.id ? 700 : 400,
                    color:          bottomPanel === tab.id ? '#22d3ee' : '#5a5f6a',
                    background:     bottomPanel === tab.id ? '#22d3ee12' : 'transparent',
                    border:        `1px solid ${bottomPanel === tab.id ? '#22d3ee30' : 'transparent'}`,
                    cursor:        'pointer',
                    letterSpacing: '0.04em',
                    whiteSpace:    'nowrap',
                    display:       'flex',
                    alignItems:    'center',
                    gap:            4,
                  }}
                >
                  {tab.label}
                  {tab.pro && tier !== 'pro' && (
                    <span style={{ fontSize: 8, color: '#fbbf24' }}>PRO</span>
                  )}
                </button>
              ))}
            </div>

            {/* Panel body */}
            <div
              style={{
                height:   bottomPanel === 'deep_analysis' ? 360 : 240,
                overflow: 'hidden',
                transition: 'height 200ms ease',
              }}
            >
              {bottomPanel === 'placement' && (
                <PlacementPanel instrument={selectedInstrument} tier={tier} state={placementState} />
              )}

              {bottomPanel === 'tape' && (
                <TapePanel instrument={selectedInstrument} tier={tier} />
              )}

              {bottomPanel === 'tape_ai' && (
                <div style={{ padding: '10px 12px', height: '100%', boxSizing: 'border-box' }}>
                  <TapeNarrator instrument={selectedInstrument} tier={tier} />
                </div>
              )}

              {bottomPanel === 'deep_analysis' && (
                <DeepAnalysisPanel instrument={selectedInstrument} tier={tier} />
              )}

              {bottomPanel === 'correlation' && (
                <div style={{ padding: '10px 12px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
                  <CorrelationPanel
                    defaultInstrumentA={instruments[0]}
                    defaultInstrumentB={instruments[1] ?? instruments[0]}
                    availableInstruments={instruments}
                    tier={tier}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Global keyframe animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-component: auto-height chart wrapper ─────────────────────────────────

/**
 * Measures the container height via ResizeObserver and passes it to CvdChart
 * so the chart fills the pane precisely without overflow.
 */
function ChartPaneAutoHeight({
  instrument,
  tier,
  containerRef,
  timeframe,
  onTimeframeChange,
  showVolumeProfile,
  primaryView,
  placementHistory,
  onMarkerHover,
  lastSweep,
  onPriceHover,
}: {
  instrument: string;
  tier: 'free' | 'starter' | 'pro';
  containerRef: RefObject<HTMLDivElement | null>;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  showVolumeProfile: boolean;
  primaryView: 'candles' | 'footprint' | 'depth';
  placementHistory?: PlacementSignal[];
  onMarkerHover?: (signal: PlacementSignal | null, x: number, y: number) => void;
  lastSweep?: { side: string; notionalUsd: number; ts: number; absorbed: boolean } | null;
  onPriceHover?: (price: number | null) => void;
}) {
  const [chartHeight, setChartHeight] = useState(420);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Guard against sub-pixel ResizeObserver oscillation: only commit a new
    // height when it differs meaningfully. Without this the observer can feed
    // back into the chart's own resize and produce a visible redraw flicker.
    const commit = (h: number) => {
      const next = Math.floor(h);
      setChartHeight(prev => (Math.abs(prev - next) > 2 ? next : prev));
    };

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 80) commit(h);
      }
    });
    ro.observe(el);

    const h0 = el.clientHeight;
    if (h0 > 80) commit(h0);

    return () => ro.disconnect();
  }, [containerRef]);

  if (primaryView === 'footprint') {
    return <FootprintChart instrument={instrument} tier={tier} height={chartHeight} lastSweep={lastSweep} onPriceHover={onPriceHover} />;
  }
  if (primaryView === 'depth') {
    return <DomLadder instrument={instrument} tier={tier} height={chartHeight} onPriceHover={onPriceHover} />;
  }

  return (
    <CvdChart
      instrument={instrument}
      height={chartHeight}
      showRealTime={tier === 'pro'}
      tier={tier}
      timeframe={timeframe}
      onTimeframeChange={onTimeframeChange}
      showVolumeProfile={showVolumeProfile}
      placementHistory={placementHistory}
      onMarkerHover={onMarkerHover}
    />
  );
}
