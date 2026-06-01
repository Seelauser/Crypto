'use client';

import { useState } from 'react';

// ─── Glossary ─────────────────────────────────────────────────────────────────

export const GLOSSARY: Record<string, { short: string; detail?: string }> = {
  cvd: {
    short: 'Cumulative Volume Delta — running total of buy volume minus sell volume.',
    detail:
      'When CVD rises, more contracts are being bought aggressively than sold. When it falls, sellers are in control. Key insight: if price is rising but CVD is falling, hidden sellers are pushing back — a bearish warning sign even as price looks fine.',
  },
  delta: {
    short: 'Buy volume minus sell volume for a single candle.',
    detail:
      '+500 means 500 more units were bought than sold in that bar. Positive delta = buyers were more aggressive. Large spikes at key levels often precede big price moves.',
  },
  sweep: {
    short: 'A rapid burst of same-direction trades consuming multiple price levels.',
    detail:
      'When someone needs to buy or sell urgently, they hit every limit order in their way. A buy sweep = someone needs in NOW and is willing to pay higher and higher prices. Signals conviction and urgency — often precedes continuation.',
  },
  absorption: {
    short: 'Large sell orders hitting the market but price not falling.',
    detail:
      'When heavy selling meets even heavier hidden buying, the sells get absorbed without moving price down. Bullish signal: a large buyer is holding up the price, soaking up all the supply.',
  },
  exhaustion: {
    short: 'A price move that runs out of momentum — buyers or sellers dry up.',
    detail:
      'Buying exhaustion: price reaches a new high but delta flips negative — the last buyers have committed and nobody is left to push higher. Often precedes a reversal.',
  },
  divergence: {
    short: 'Price and CVD moving in opposite directions — a leading warning signal.',
    detail:
      'Bearish divergence: price makes a new high but CVD does not follow — hidden sellers are distributing into the rally. Bullish divergence: new price low but CVD holds up — buyers are quietly accumulating.',
  },
  imbalance_ratio: {
    short: 'How lopsided the order book is: bid volume ÷ ask volume (or inverse).',
    detail:
      '5× imbalance means one side has 5× more waiting orders than the other. A 5× bid imbalance means large buyers are queued below price — bullish pressure. Most useful when confirmed by CVD.',
  },
  large_print: {
    short: 'A single trade far larger than normal — a whale entering or exiting.',
    detail:
      'Institutions break orders into small pieces to hide intent. When a large print appears, someone was forced to act quickly. $500K+ in crypto, $1M+ in stocks is typically meaningful.',
  },
  vpoc: {
    short: 'Volume Point of Control — the price where the most volume traded.',
    detail:
      'Think of VPOC as the gravitational center of recent trading. Price tends to return to it because that is where the market found the most agreement.',
  },
  vah: {
    short: 'Value Area High — top of the range where 70% of volume traded.',
    detail:
      'Price above the Value Area High is in "premium" territory. Price often snaps back inside the value area. Breakouts that hold above VAH with increasing CVD are genuine.',
  },
  val: {
    short: 'Value Area Low — bottom of the range where 70% of volume traded.',
    detail:
      'Price below VAL is in "discount" territory. Buyers often step in near VAL because it represents a historically agreed-upon price floor.',
  },
  regime: {
    short: 'The current statistical market state: trending, ranging, accumulating, or distributing.',
    detail:
      'Different regimes call for different strategies. In a trending regime, follow CVD direction. In mean-reverting, trade against extremes. The regime is detected by the HMM algorithm.',
  },
  hmm: {
    short: 'Hidden Markov Model — a statistical algorithm that detects hidden market states.',
    detail:
      'Markets cycle through states (trending, ranging, volatile) that must be inferred from price and volume data. HMM is the standard academic approach and powers the Regime indicator here.',
  },
  vwap: {
    short: 'Volume Weighted Average Price — average price weighted by how much traded there.',
    detail:
      'VWAP is the institutional benchmark. Price above VWAP = bulls in control today. Below = bears. A stock down 2% but above VWAP is actually acting strong for the day.',
  },
  oi: {
    short: 'Open Interest — total outstanding futures/options contracts.',
    detail:
      'Rising OI + rising price = new money confirming the uptrend. Rising OI + falling price = shorts piling in. Falling OI = positions being closed — the move may be ending.',
  },
  true_l2: {
    short: 'True Level 2 — full order book data from direct exchange connections.',
    detail:
      'Every bid and ask at every price level, updated in real time. Most accurate order flow analysis. Only available for crypto via direct Binance WebSocket. All True L2 labels are real data.',
  },
  inferred: {
    short: 'Order flow estimated from price movement and OHLCV bars — not raw order book.',
    detail:
      'For stocks, futures, and forex, real-time order books are not available retail. We approximate buy/sell volume by analyzing where within each candle price moved. Less precise than True L2, but actionable for major imbalances.',
  },
  footprint: {
    short: 'A candle showing buy and sell volume at each individual price level inside it.',
    detail:
      'Standard candles hide the battle between buyers and sellers. A footprint chart reveals it: each row shows exactly how much was bought and sold at that price. Stacked imbalances (one side dominating multiple levels) are a powerful directional signal.',
  },
  dom: {
    short: 'Depth of Market — a live ladder showing all resting limit orders at each price.',
    detail:
      'Large bid walls below price provide support. Large ask walls above provide resistance. The DOM changes faster than any other indicator — professional tape readers watch it constantly.',
  },
  stacked_imbalance: {
    short: 'Three or more consecutive price levels where one side dominates the order book.',
    detail:
      'A single imbalance is noise. Three or more stacked imbalances in the same direction signals institutional intent. Buy-side stacked imbalances below price = strong support floor.',
  },
  correlation: {
    short: 'How closely two instruments move together, from +1 (lockstep) to -1 (opposite).',
    detail:
      'BTC and ETH historically have 0.85+ correlation. When that breaks down, it is often a trading opportunity: the diverging instrument will likely snap back.',
  },
  dxy: {
    short: 'US Dollar Index — measures dollar strength against a basket of major currencies.',
    detail:
      'DXY rising = stronger dollar, which typically pressures crypto and commodities downward. DXY falling = weaker dollar, which often lifts crypto, gold, and commodities.',
  },
  vix: {
    short: 'Volatility Index — measures expected stock market volatility (the "fear gauge").',
    detail:
      'VIX above 25 = elevated fear in US equities, often correlating with crypto selling off too. VIX spikes above 30–35 have historically been buying opportunities, marking peak fear.',
  },
  cvd_velocity: {
    short: 'How fast CVD is changing — acceleration of buying or selling pressure.',
    detail:
      'A slowly rising CVD suggests steady institutional accumulation. A rapidly accelerating CVD suggests urgency. High CVD velocity with a sweep event is a very strong signal.',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface TermTipProps {
  term: keyof typeof GLOSSARY;
  children: React.ReactNode;
  /** 'inline' underlines the children text. 'icon' appends a ⓘ badge. Default: 'inline' */
  mode?: 'inline' | 'icon';
}

export default function TermTip({ term, children, mode = 'inline' }: TermTipProps) {
  const entry = GLOSSARY[term];
  const [visible, setVisible] = useState(false);

  if (!entry) return <>{children}</>;

  return (
    <span
      style={{ position: 'relative', display: 'inline' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <span
        style={{
          cursor: 'help',
          ...(mode === 'inline' ? { borderBottom: '1px dashed #5a5f6a' } : {}),
        }}
      >
        {children}
        {mode === 'icon' && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 14, height: 14, borderRadius: '50%', border: '1px solid #5a5f6a',
            color: '#8a8f9b', fontSize: 9, fontWeight: 700, marginLeft: 4,
            verticalAlign: 'middle', lineHeight: 1, flexShrink: 0,
          }}>?</span>
        )}
      </span>

      {visible && (
        <span style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          zIndex: 9999,
          width: 300,
          marginTop: 4,
          background: '#181a21',
          border: '1px solid #2a2d36',
          borderRadius: 8,
          padding: '12px 14px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          pointerEvents: 'none',
          // Prevent the tooltip from overflowing right edge in most cases
          transform: 'translateX(min(0px, calc(100vw - 100% - 16px)))',
        }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#22d3ee', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {term.replace(/_/g, ' ')}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#e6e8ee', lineHeight: 1.6 }}>
            {entry.short}
          </p>
          {entry.detail && (
            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#8a8f9b', lineHeight: 1.7 }}>
              {entry.detail}
            </p>
          )}
        </span>
      )}
    </span>
  );
}

export function InfoBadge({ term }: { term: keyof typeof GLOSSARY }) {
  return <TermTip term={term} mode="icon"><span /></TermTip>;
}
