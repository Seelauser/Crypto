'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  LineData,
  SeriesMarker,
  Time,
} from 'lightweight-charts';
import { useCvdStream } from '@/lib/ws';
import type { OhlcvBar, CvdPoint } from '@orderflow/types';
import type { PlacementSignal } from '@/lib/chart/types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  instrument: string;
  height?: number;
  showRealTime?: boolean;
  tier?: 'free' | 'starter' | 'pro';
  /** Emitted placement signals to render as candlestick markers (P5-6).
   *  Caller controls the layer toggle; pass `[]` or omit to hide. */
  placementHistory?: PlacementSignal[];
  /** Fired when the user hovers a marker so a parent can render a tooltip
   *  with the chart-explain LLM call. */
  onMarkerHover?: (signal: PlacementSignal | null, x: number, y: number) => void;
}

// ─── Markers ──────────────────────────────────────────────────────────────────

function signalToMarker(s: PlacementSignal): SeriesMarker<Time> {
  const dir = s.direction;
  const isLong  = dir === 'long';
  const isShort = dir === 'short';
  return {
    time:     Math.floor(s.ts / 1000) as Time,
    position: isLong ? 'belowBar' : isShort ? 'aboveBar' : 'inBar',
    shape:    isLong ? 'arrowUp' : isShort ? 'arrowDown' : 'circle',
    color:    isLong ? '#22d3ee' : isShort ? '#f97366' : '#5a5f6a',
    text:     `${s.confidence}%`,
    size:     s.strength >= 3 ? 2 : 1,
    id:       `pl:${s.ts}:${dir}`,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isCryptoInstrument(instrument: string): boolean {
  // Crypto pairs end in USDT / USDC / BTC / ETH, or look like BTCUSDT
  return /^[A-Z]+USDT?$|^[A-Z]+USDC$|^[A-Z]+BTC$|^[A-Z]+ETH$/i.test(instrument);
}

function barToCandle(bar: OhlcvBar): CandlestickData {
  return {
    time: Math.floor(bar.ts / 1000) as Time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  };
}

function barToDelta(bar: OhlcvBar): HistogramData {
  const delta = bar.delta ?? 0;
  return {
    time: Math.floor(bar.ts / 1000) as Time,
    value: delta,
    color: delta >= 0 ? '#22d3ee40' : '#f9736640',
  };
}

function barToCvdLine(bar: OhlcvBar): LineData {
  return {
    time: Math.floor(bar.ts / 1000) as Time,
    value: bar.cvd ?? 0,
  };
}

// Compute CVD line color based on recent direction
/**
 * CVD line colour by *net* cumulative delta over the loaded window.
 *
 * `bar.cvd` accumulates from 0 at the first bar in the window, so the last
 * bar's cvd is the net buy/sell pressure across the whole window. Colouring
 * by that sign is stable: a single live-bar tick can't flip the whole line
 * (it only moves cvd by a tiny amount relative to the window total). The old
 * implementation compared last-vs-previous bar, which flipped the entire
 * line cyan↔red on every tick as the live bar wiggled — the "flashing"
 * that made long/short unreadable.
 */
function cvdLineColor(bars: OhlcvBar[]): string {
  if (bars.length < 2) return '#22d3ee';
  const net = bars[bars.length - 1].cvd ?? 0;
  return net >= 0 ? '#22d3ee' : '#f97366';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CvdChart({
  instrument,
  height = 480,
  showRealTime = false,
  tier = 'free',
  placementHistory,
  onMarkerHover,
}: Props) {
  const containerRef     = useRef<HTMLDivElement>(null);
  const chartRef         = useRef<IChartApi | null>(null);
  const candleSeriesRef  = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const deltaSeriesRef   = useRef<ISeriesApi<'Histogram'> | null>(null);
  const cvdLineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const barsRef          = useRef<OhlcvBar[]>([]);
  // Current height, read by the mount-once effect without re-running it.
  const heightRef        = useRef(height);
  heightRef.current = height;
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Only subscribe to real-time CVD when premium and showRealTime
  const isRealTime = showRealTime && tier === 'pro';
  const isCrypto   = isCryptoInstrument(instrument);

  // Pass '__disabled__' so useCvdStream skips subscription when not needed
  const cvdStream = useCvdStream(isRealTime ? instrument : '__disabled__');

  // ── Fetch historical bars ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchBars() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/markets/${instrument}/bars?tf=5m&limit=200`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload: { bars?: OhlcvBar[] } | OhlcvBar[] = await res.json();
        const bars: OhlcvBar[] = Array.isArray(payload) ? payload : (payload.bars ?? []);
        if (cancelled) return;
        barsRef.current = bars;
        populateChart(bars);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load bars');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchBars();
    return () => {
      cancelled = true;
    };
  }, [instrument]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply real-time CVD stream updates ────────────────────────────────────
  useEffect(() => {
    if (!isRealTime || cvdStream.length === 0) return;
    const lastPoint = cvdStream[cvdStream.length - 1];
    if (!lastPoint) return;

    const bars = barsRef.current;
    if (bars.length === 0) return;

    // Update last bar's CVD and delta in place
    const lastBar = bars[bars.length - 1];
    const updatedBar: OhlcvBar = {
      ...lastBar,
      cvd: lastPoint.cvd,
      delta: lastPoint.delta,
    };
    bars[bars.length - 1] = updatedBar;

    if (deltaSeriesRef.current) {
      deltaSeriesRef.current.update(barToDelta(updatedBar));
    }

    if (cvdLineSeriesRef.current) {
      // Update CVD line color based on direction
      const lineColor = cvdLineColor(bars);
      cvdLineSeriesRef.current.applyOptions({ color: lineColor });
      cvdLineSeriesRef.current.update(barToCvdLine(updatedBar));
    }
  }, [cvdStream, isRealTime]);

  // ── Build / populate chart with sorted data ────────────────────────────────
  const populateChart = useCallback((bars: OhlcvBar[]) => {
    if (!chartRef.current) return;
    if (
      !candleSeriesRef.current ||
      !deltaSeriesRef.current ||
      !cvdLineSeriesRef.current
    ) return;

    const candles = bars
      .map(barToCandle)
      .sort((a, b) => (a.time as number) - (b.time as number));
    const deltas = bars
      .map(barToDelta)
      .sort((a, b) => (a.time as number) - (b.time as number));
    const cvd = bars
      .map(barToCvdLine)
      .sort((a, b) => (a.time as number) - (b.time as number));

    candleSeriesRef.current.setData(candles);
    deltaSeriesRef.current.setData(deltas);

    // Color CVD line based on direction
    if (bars.length >= 2) {
      const lineColor = cvdLineColor(bars);
      cvdLineSeriesRef.current.applyOptions({ color: lineColor });
    }
    cvdLineSeriesRef.current.setData(cvd);

    chartRef.current.timeScale().fitContent();
  }, []);

  // ── Mount chart ONCE. The old effect was keyed on [height], so a height
  //    change recreated the chart; because lightweight-charts is imported
  //    async, the old import() could resolve after cleanup → an orphan chart
  //    instance whose opaque background hid the real one. We mount once and
  //    apply width/height imperatively (autoSize:true did not size reliably in
  //    v4.2.3, so we keep explicit width + a ResizeObserver).
  useEffect(() => {
    if (!containerRef.current || typeof window === 'undefined') return;

    let cancelled = false;
    let ro: ResizeObserver | undefined;

    // Lazy-load lightweight-charts to avoid SSR issues
    import('lightweight-charts').then(({ createChart, CrosshairMode }) => {
      if (cancelled || !containerRef.current) return;

      const container = containerRef.current;
      const chart = createChart(container, {
        width:  container.clientWidth || 800,
        height: heightRef.current || 420,
        layout: {
          background: { color: '#0a0a0b' },
          textColor: '#8a8f9b',
          fontSize: 11,
          fontFamily: 'JetBrains Mono, Fira Code, monospace',
        },
        grid: {
          vertLines: { color: '#1f2128' },
          horzLines: { color: '#1f2128' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: '#4a4f5a', labelBackgroundColor: '#1f2128' },
          horzLine: { color: '#4a4f5a', labelBackgroundColor: '#1f2128' },
        },
        rightPriceScale: {
          borderColor: '#1f2128',
          textColor: '#8a8f9b',
        },
        timeScale: {
          borderColor: '#1f2128',
          timeVisible: true,
          secondsVisible: false,
        },
        handleScroll: true,
        handleScale: true,
      });

      chartRef.current = chart;

      // ── Top pane: Candlestick series ─────────────────────────────────────
      const candleSeries = chart.addCandlestickSeries({
        upColor:        '#22d3ee',
        downColor:      '#f97366',
        borderUpColor:  '#22d3ee',
        borderDownColor:'#f97366',
        wickUpColor:    '#22d3ee',
        wickDownColor:  '#f97366',
        priceScaleId:   'right',
      });
      candleSeriesRef.current = candleSeries;

      // ── Bottom pane: Delta histogram ──────────────────────────────────────
      const deltaSeries = chart.addHistogramSeries({
        color:       '#22d3ee40',
        priceScaleId:'cvd-delta',
        priceFormat: { type: 'volume' },
        base:        0,
      });

      chart.priceScale('cvd-delta').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
        borderColor: '#1f2128',
      });

      deltaSeriesRef.current = deltaSeries;

      // ── Bottom pane: CVD line ─────────────────────────────────────────────
      const cvdLineSeries = chart.addLineSeries({
        color:                        '#22d3ee',
        lineWidth:                    1,
        priceScaleId:                 'cvd-line',
        lastValueVisible:             true,
        priceLineVisible:             false,
        crosshairMarkerVisible:       true,
        crosshairMarkerRadius:        3,
        crosshairMarkerBackgroundColor: '#22d3ee',
      });

      chart.priceScale('cvd-line').applyOptions({
        scaleMargins: { top: 0.65, bottom: 0.02 },
        borderColor: '#1f2128',
      });

      cvdLineSeriesRef.current = cvdLineSeries;

      // Populate if bars already loaded before chart mounted
      if (barsRef.current.length > 0) {
        populateChart(barsRef.current);
      }

      // Keep the chart's width synced to the container (the container starts
      // 0-wide before layout settles, so the 800px create-time fallback is
      // corrected here once the real width is known).
      ro = new ResizeObserver(entries => {
        for (const entry of entries) {
          const w = entry.contentRect.width;
          if (w > 0) chart.applyOptions({ width: Math.floor(w) });
        }
      });
      ro.observe(container);
      resizeObserverRef.current = ro;
    });

    return () => {
      cancelled = true;
      resizeObserverRef.current?.disconnect();
      chartRef.current?.remove();
      chartRef.current        = null;
      candleSeriesRef.current = null;
      deltaSeriesRef.current  = null;
      cvdLineSeriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply height changes in place (never remount — that caused the orphan).
  useEffect(() => {
    chartRef.current?.applyOptions({ height });
  }, [height]);

  // Re-populate when instrument changes (chart already mounted)
  useEffect(() => {
    if (barsRef.current.length > 0 && chartRef.current) {
      populateChart(barsRef.current);
    }
  }, [instrument, populateChart]);

  // ── Placement markers on candle series (P5-6) ─────────────────────────────
  // The chart's first bar timestamp acts as a floor — markers older than that
  // would clip outside the visible series and lightweight-charts rejects them.
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    if (!placementHistory || placementHistory.length === 0) {
      series.setMarkers([]);
      return;
    }
    const bars = barsRef.current;
    const firstBarSec = bars.length
      ? Math.floor(bars[0].ts / 1000)
      : 0;
    const markers = placementHistory
      .filter(s => Math.floor(s.ts / 1000) >= firstBarSec)
      .map(signalToMarker);
    series.setMarkers(markers);
  }, [placementHistory]);

  // ── Crosshair → onMarkerHover ─────────────────────────────────────────────
  // lightweight-charts has no "hover this marker" event, so we approximate:
  // when the crosshair lands on a candle whose bar-time matches an emitted
  // signal (±half a bar), surface that signal to the parent.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onMarkerHover || !placementHistory?.length) return;

    const handler = (param: any) => {
      if (!param?.time || !param.point) { onMarkerHover(null, 0, 0); return; }
      const tSec = Number(param.time);
      // Tolerance = the 5m bar width in seconds (matches the bars route).
      const TOL = 300;
      const hit = placementHistory.find(s => {
        const sSec = Math.floor(s.ts / 1000);
        return Math.abs(sSec - tSec) <= TOL;
      });
      if (hit) onMarkerHover(hit, param.point.x ?? 0, param.point.y ?? 0);
      else     onMarkerHover(null, 0, 0);
    };
    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, [onMarkerHover, placementHistory]);

  const isL2 = isCryptoInstrument(instrument);
  const showDelayBanner = !isRealTime && tier === 'free';

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        background: '#0a0a0b',
        overflow: 'hidden',
      }}
    >
      {/* ── Top-left badges ─────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 10,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        {/* Data quality badge */}
        <span
          style={{
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.06em',
            padding: '2px 6px',
            borderRadius: 4,
            border: `1px solid ${isL2 ? '#22d3ee40' : '#fbbf2440'}`,
            background: isL2 ? '#22d3ee12' : '#fbbf2412',
            color: isL2 ? '#22d3ee' : '#fbbf24',
          }}
        >
          {isL2 ? '[True L2]' : '[Inferred]'}
        </span>

        {/* Instrument label */}
        <span
          style={{
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
            color: '#e6e8ee',
            letterSpacing: '0.04em',
            fontWeight: 600,
          }}
        >
          {instrument}
        </span>

        {/* Timeframe */}
        <span
          style={{
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            color: '#5a5f6a',
          }}
        >
          5m
        </span>
      </div>

      {/* ── Top-right: delay banner for free tier ─────────────────────────── */}
      {showDelayBanner && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 10,
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.06em',
            padding: '2px 8px',
            borderRadius: 4,
            border: '1px solid #fbbf2440',
            background: '#fbbf2412',
            color: '#fbbf24',
            pointerEvents: 'none',
          }}
        >
          60s delayed
        </div>
      )}

      {/* ── Loading overlay ───────────────────────────────────────────────── */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0b99',
            borderRadius: 4,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div
              style={{
                width: 14,
                height: 14,
                border: '2px solid #22d3ee40',
                borderTopColor: '#22d3ee',
                borderRadius: '50%',
                animation: 'spin 700ms linear infinite',
              }}
            />
            <span
              style={{
                color: '#8a8f9b',
                fontSize: 12,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              Loading bars…
            </span>
          </div>
        </div>
      )}

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {error && !loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0b',
          }}
        >
          <span
            style={{
              color: '#f97366',
              fontSize: 12,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            {error}
          </span>
          <span
            style={{
              color: '#5a5f6a',
              fontSize: 11,
              marginTop: 4,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            Chart will show when data is available.
          </span>
        </div>
      )}

      {/* ── Bottom-left CVD legend ────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          left: 8,
          bottom: 8,
          zIndex: 10,
          fontSize: 9,
          fontFamily: 'JetBrains Mono, monospace',
          color: '#5a5f6a',
          letterSpacing: '0.06em',
          pointerEvents: 'none',
        }}
      >
        CVD — Cumulative Volume Delta
      </div>

      {/* ── Chart mount point ─────────────────────────────────────────────── */}
      <div ref={containerRef} style={{ width: '100%', height }} />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
