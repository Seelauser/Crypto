'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useCvdStream } from '@/lib/ws';
import TermTip from '@/components/ui/TermTip';
import { REGIME_META } from '@/lib/regimes';

// ─── Per-asset CVD state ──────────────────────────────────────────────────────

// Representative instrument per asset class — the one whose CVD drives the tile.
// Symbol form must match what the streaming worker publishes on market:cvd_update
// (raw exchange symbol, e.g. BTCUSDT not BTC-USDT). null → no ingest worker yet,
// tile renders an honest "ingest pending" state instead of a permanent "--".
const CLASS_LEAD: Record<string, string | null> = {
  crypto:      'BTCUSDT',
  stocks:      null,
  futures:     null,
  forex:       null,
  commodities: null,
  resources:   null,
};

const CLASS_COLOR: Record<string, string> = {
  crypto:      '#22d3ee',
  stocks:      '#60a5fa',
  futures:     '#a78bfa',
  forex:       '#34d399',
  commodities: '#fbbf24',
  resources:   '#f97366',
};

// REGIME_META is imported from @/lib/regimes (shared with ScanResults)

// ─── Single asset class tile ──────────────────────────────────────────────────

function CvdTile({
  assetClass,
  regime,
}: {
  assetClass: string;
  regime: { regime: string; confidence: number } | null;
}) {
  const instrument = CLASS_LEAD[assetClass];
  const color       = CLASS_COLOR[assetClass] ?? '#5a5f6a';
  // Subscribe with a placeholder when no ingest exists so the hook is stable.
  const cvdPoints   = useCvdStream(instrument ?? '__disabled__');
  const hasIngest   = instrument !== null;

  // Net delta over the last 20 CVD points — a short-term directional bias
  const recentDelta = (() => {
    if (cvdPoints.length < 2) return 0;
    const slice = cvdPoints.slice(-20);
    return slice[slice.length - 1].cvd - slice[0].cvd;
  })();

  const direction =
    recentDelta > 0  ? 'up' :
    recentDelta < 0  ? 'down' :
    /* flat */         'flat';

  const directionColor =
    direction === 'up'   ? '#22c55e' :
    direction === 'down' ? '#f97366' :
    /* flat */             '#5a5f6a';

  const regimeMeta = regime ? REGIME_META[regime.regime as keyof typeof REGIME_META] : null;

  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-3 transition-colors"
      style={{
        backgroundColor: `${color}10`,
        border: `1px solid ${color}25`,
      }}
    >
      {/* Asset class name */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>
          {assetClass}
        </span>
        {cvdPoints.length > 0 && (
          <span
            className="h-1.5 w-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: '#22c55e' }}
            title="Live data"
          />
        )}
      </div>

      {/* CVD direction arrow */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {direction === 'up'   && <TrendingUp  size={16} color={directionColor} />}
          {direction === 'down' && <TrendingDown size={16} color={directionColor} />}
          {direction === 'flat' && <Minus        size={16} color={directionColor} />}
          <span
            className="font-mono text-xs font-semibold"
            style={{ color: directionColor }}
          >
            {direction === 'flat'
              ? '--'
              : `${recentDelta >= 0 ? '+' : ''}${(recentDelta / 1000).toFixed(1)}K`}
          </span>
        </div>
      </div>

      {/* Regime chip — with plain-language tooltip */}
      {!hasIngest ? (
        <div
          className="rounded-full px-2 py-0.5 text-center text-[9px] text-[#5a5f6a] cursor-help"
          style={{ border: '1px solid #1f2128' }}
          title="No ingest worker configured for this asset class yet. Crypto is live via Binance/Coinbase/Kraken; stocks/futures/forex/commodities require Alpaca/OANDA/Polygon API keys."
        >
          ingest pending
        </div>
      ) : regimeMeta ? (
        <div
          className="rounded-full px-2 py-0.5 text-center text-[9px] font-semibold cursor-help"
          style={{ backgroundColor: `${regimeMeta.color}18`, color: regimeMeta.color, border: `1px solid ${regimeMeta.color}30` }}
          title={regimeMeta.tip}
        >
          {regimeMeta.label}
        </div>
      ) : (
        <div className="rounded-full px-2 py-0.5 text-center text-[9px] text-[#5a5f6a]" style={{ border: '1px solid #1f2128' }}>
          warming up
        </div>
      )}
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

interface RegimeMap {
  [assetClass: string]: { regime: string; confidence: number; instrument: string; ts: number } | null;
}

export default function LiveCvdGrid({ regimes }: { regimes: RegimeMap }) {
  const assetClasses = Object.keys(CLASS_LEAD);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[#1f2128] bg-[#13141a] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#e6e8ee]">
          <TermTip term="cvd">CVD Direction</TermTip>
          {' '}
          <span className="text-[10px] font-normal text-[#5a5f6a]">by asset class</span>
        </h2>
        <span className="text-[10px] text-[#5a5f6a]">live</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {assetClasses.map(ac => (
          <CvdTile key={ac} assetClass={ac} regime={regimes[ac] ?? null} />
        ))}
      </div>

      {/* Plain-language legend */}
      <div className="mt-1 rounded-lg border border-[#1f2128] bg-[#0a0a0b] px-3 py-2">
        <p className="text-[10px] text-[#5a5f6a] leading-relaxed">
          Each tile shows the net buying/selling pressure in that market over the last 20 data points.{' '}
          <TermTip term="cvd">CVD rising</TermTip> = more buyers than sellers.{' '}
          The <TermTip term="regime">regime label</TermTip> shows the statistical market state detected by the AI model.
        </p>
      </div>
    </section>
  );
}
