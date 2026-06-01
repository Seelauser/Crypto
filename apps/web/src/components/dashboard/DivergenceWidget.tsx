'use client';

import TermTip from '@/components/ui/TermTip';

interface DivergenceHit {
  instrument: string;
  kind: 'bearish' | 'bullish';
  ts: number;
  divergence_strength: number;
  bars_span: number;
  price_extreme: number;
  cvd_at_extreme: number;
}

interface Props {
  /** Pre-fetched divergences from the server component. Falls back to empty list. */
  hits: DivergenceHit[];
}

function relativeTime(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function DivergenceWidget({ hits }: Props) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[#1f2128] bg-[#13141a] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#e6e8ee]">
          <TermTip term="divergence">Delta Divergences</TermTip>
        </h2>
        <span className="rounded-full bg-[#1f2128] px-2 py-0.5 text-xs tabular-nums text-[#8a8f9b]">
          {hits.length}
        </span>
      </div>

      <p className="text-[10px] text-[#5a5f6a] leading-relaxed">
        A <TermTip term="divergence">divergence</TermTip> happens when price makes a new high or low
        but the <TermTip term="cvd">CVD</TermTip> does not confirm it —
        an early warning that the move may reverse.
      </p>

      {hits.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-6">
          <p className="text-xs text-[#5a5f6a]">No active divergences detected.</p>
          <p className="text-[10px] text-[#5a5f6a]">This is a good sign — price and CVD are in agreement.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {hits.slice(0, 6).map((hit, i) => {
            const isBull    = hit.kind === 'bullish';
            const kindColor = isBull ? '#22d3ee' : '#f97366';
            const pct       = Math.round(hit.divergence_strength * 100);

            return (
              <li
                key={`${hit.instrument}-${hit.ts}-${i}`}
                className="rounded-lg p-2.5"
                style={{ background: `${kindColor}10`, border: `1px solid ${kindColor}25` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[#e6e8ee]">
                        {hit.instrument}
                      </span>
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                        style={{ background: `${kindColor}25`, color: kindColor }}
                      >
                        {isBull ? '▲ Bullish' : '▼ Bearish'}
                      </span>
                    </div>
                    <p className="text-[10px] leading-relaxed text-[#8a8f9b]">
                      {isBull
                        ? `Price hit a new low but buyers kept absorbing — hidden demand at ${hit.price_extreme.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                        : `Price hit a new high but sellers emerged — hidden distribution near ${hit.price_extreme.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
                    </p>
                    <p className="text-[10px] text-[#5a5f6a]">
                      Detected {relativeTime(hit.ts)} · spans {hit.bars_span} bars · strength {pct}%
                    </p>
                  </div>

                  <div className="flex flex-shrink-0 flex-col items-center gap-1">
                    <span className="text-[9px] font-mono" style={{ color: kindColor }}>{pct}%</span>
                    <div className="h-12 w-1.5 rounded-full bg-[#1f2128]">
                      <div
                        className="w-full rounded-full"
                        style={{ height: `${pct}%`, background: kindColor }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <a
        href="/scans?preset=divergence"
        className="mt-auto rounded-lg border border-[#1f2128] py-1.5 text-center text-[10px] text-[#8a8f9b] transition-colors hover:border-[#2a2d36] hover:text-[#e6e8ee]"
      >
        Run divergence scan across all markets →
      </a>
    </section>
  );
}
