'use client';

import { useInstrumentTick } from '@/lib/ws';

// ─── Single instrument chip with live price ───────────────────────────────────

function LiveChip({ symbol }: { symbol: string }) {
  const tick = useInstrumentTick(symbol);

  const price = tick
    ? tick.price.toLocaleString('en-US', {
        maximumFractionDigits: tick.price >= 1000 ? 2 : tick.price >= 1 ? 4 : 6,
      })
    : null;

  // Side color: cyan for buy-side tick, red for sell-side
  const sideColor =
    tick?.side === 'buy'  ? '#22d3ee' :
    tick?.side === 'sell' ? '#f97366' :
    '#e6e8ee';

  return (
    <div
      className="flex flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-[#1f2128] bg-[#13141a] px-3 py-1.5 transition-colors hover:border-[#2a2d36] cursor-default"
      title={tick ? `Last: ${price}  Side: ${tick.side}  Size: ${tick.size}` : `Waiting for data on ${symbol}…`}
    >
      <span className="font-mono text-xs font-semibold text-[#e6e8ee]">{symbol}</span>
      {price ? (
        <span className="font-mono text-[10px] font-medium transition-colors" style={{ color: sideColor }}>
          {price}
        </span>
      ) : (
        <span className="h-2 w-10 animate-pulse rounded bg-[#1f2128]" />
      )}
    </div>
  );
}

// ─── Strip ────────────────────────────────────────────────────────────────────

const DEFAULT_INSTRUMENTS = [
  'BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'BNB-USDT', 'XRP-USDT',
  'AAPL', 'TSLA', 'ES1!', 'EUR/USD', 'GC1!',
];

export default function LiveWatchlistStrip({ instruments }: { instruments: string[] }) {
  const display = instruments.length > 0 ? instruments : DEFAULT_INSTRUMENTS;

  return (
    <section className="flex h-[68px] items-center gap-2 overflow-x-auto rounded-xl border border-[#1f2128] bg-[#13141a] px-4 scrollbar-hide">
      <span className="mr-1 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[#5a5f6a]">
        Watchlist
      </span>
      {display.map(symbol => (
        <LiveChip key={symbol} symbol={symbol} />
      ))}
      {/* Color key */}
      <div className="ml-auto flex flex-shrink-0 items-center gap-3 border-l border-[#1f2128] pl-4">
        <span className="flex items-center gap-1 text-[9px] text-[#5a5f6a]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#22d3ee]" /> buy tick
        </span>
        <span className="flex items-center gap-1 text-[9px] text-[#5a5f6a]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#f97366]" /> sell tick
        </span>
      </div>
    </section>
  );
}
