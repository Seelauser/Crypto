'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  LineData,
  Time,
} from 'lightweight-charts';
import { useCvdStream } from '@/lib/ws';
import type { OhlcvBar, CvdPoint } from '@orderflow/types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  instrument: string;
  height?: number;
  showRealTime?: boolean;
  tier?: 'free' | 'premium';
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
function cvdLineColor(bars: OhlcvBar[]): string {
  if (bars.length < 2) return '#22d3ee';
  const last = bars[bars.length - 1].cvd ?? 0;
  const prev = bars[bars.length - 2].cvd ?? 0;
  return last >= prev ? '#22d3ee' : '#f97366';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CvdChart({
  instrument,
  height = 480,
  showRealTime = false,
  tier = 'free',
}: Props) {
  const containerRef     = useRef<HTMLDivElement>(null);
  const chartRef         = useRef<IChartApi | null>(null);
  const candleSeriesRef  = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const deltaSeriesRef   = useRef<ISeriesApi<'Histogram'> | null>(null);
  const cvdLineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const barsRef          = useRef<OhlcvBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Only subscribe to real-time CVD when premium and showRealTime
  const isRealTime = showRealTime && tier === 'premium';
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

  // ── Mount chart (runs once per height change) ─────────────────────────────
  useEffect(() => {
    if (!containerRef.current || typeof window === 'undefined') return;

    let chart: IChartApi;
    let candleSeries: ISeriesApi<'Candlestick'>;
    let deltaSeries: ISeriesApi<'Histogram'>;
    let cvdLineSeries: ISeriesApi<'Line'>;
    let ro: ResizeObserver;

    // Lazy-load lightweight-charts to avoid SSR issues
    import('lightweight-charts').then(({ createChart, CrosshairMode }) => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const w = container.clientWidth || 800;

      chart = createChart(container, {
        width: w,
        height,
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
      candleSeries = chart.addCandlestickSeries({
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
      deltaSeries = chart.addHistogramSeries({
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
      cvdLineSeries = chart.addLineSeries({
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

      // ── ResizeObserver: fill container width ──────────────────────────────
      ro = new ResizeObserver(entries => {
        for (const entry of entries) {
          const newWidth = entry.contentRect.width;
          if (newWidth > 0) {
            chart.applyOptions({ width: newWidth });
          }
        }
      });
      ro.observe(container);
      resizeObserverRef.current = ro;
    });

    return () => {
      resizeObserverRef.current?.disconnect();
      chartRef.current?.remove();
      chartRef.current        = null;
      candleSeriesRef.current = null;
      deltaSeriesRef.current  = null;
      cvdLineSeriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // Re-populate when instrument changes (chart already mounted)
  useEffect(() => {
    if (barsRef.current.length > 0 && chartRef.current) {
      populateChart(barsRef.current);
    }
  }, [instrument, populateChart]);

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
