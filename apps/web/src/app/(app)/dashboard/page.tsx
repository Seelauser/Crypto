import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export const metadata = { title: 'Dashboard' };

// ─── Data Shapes ──────────────────────────────────────────────────────────────

type SignalSetupRow = {
  id: string;
  name: string;
  market: string;
  status: 'armed' | 'paused' | 'archived';
  instruments: string[];
  createdAt: string;
};

type SignalEventRow = {
  id: string;
  setupId: string;
  instrument: string;
  aiExplanation: string | null;
  createdAt: string;
  setup: { name: string; market: string } | null;
};

type WatchlistRow = {
  id: string;
  name: string;
  instruments: string[];
};

// ─── Sub-components ───────────────────────────────────────────────────────────

// --- DashboardHeader ----------------------------------------------------------

function TierBadge({ tier }: { tier: string }) {
  if (tier === 'premium') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#fbbf24]/30 bg-[#fbbf24]/10 px-2.5 py-0.5 text-xs font-semibold text-[#fbbf24]">
        Pro
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#1f2128] bg-[#13141a] px-2.5 py-0.5 text-xs font-medium text-[#8a8f9b]">
      Free
    </span>
  );
}

function DashboardHeader({
  username,
  tier,
  tokenBalanceCents,
}: {
  username: string;
  tier: string;
  tokenBalanceCents: number;
}) {
  const balanceDollars = (tokenBalanceCents / 100).toFixed(2);

  return (
    <header className="flex items-center justify-between border-b border-[#1f2128] bg-[#13141a] px-6 py-4">
      <div className="flex items-center gap-3">
        {/* Avatar placeholder */}
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1f2128] text-sm font-semibold text-[#e6e8ee]">
          {username.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold text-[#e6e8ee]">{username}</p>
          <p className="text-xs text-[#8a8f9b]">OrderFlow Analytics</p>
        </div>
        <TierBadge tier={tier} />
      </div>

      <div className="flex items-center gap-4">
        {tier === 'premium' && (
          <div className="flex items-center gap-2 rounded-lg border border-[#1f2128] bg-[#0a0a0b] px-3 py-1.5">
            <span className="text-xs text-[#8a8f9b]">AI Credits</span>
            <span className="text-sm font-semibold tabular-nums text-[#22d3ee]">
              ${balanceDollars}
            </span>
          </div>
        )}

        <a
          href="/signals"
          className="rounded-lg border border-[#1f2128] bg-[#0a0a0b] px-3 py-1.5 text-xs text-[#8a8f9b] transition-colors hover:border-[#2a2d36] hover:text-[#e6e8ee]"
        >
          Signals
        </a>
        <a
          href="/scans"
          className="rounded-lg border border-[#1f2128] bg-[#0a0a0b] px-3 py-1.5 text-xs text-[#8a8f9b] transition-colors hover:border-[#2a2d36] hover:text-[#e6e8ee]"
        >
          Scans
        </a>
      </div>
    </header>
  );
}

// --- ActiveSignalsPanel -------------------------------------------------------

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'armed'    ? '#22c55e' :
    status === 'paused'   ? '#fbbf24' :
    /* archived */          '#5a5f6a';

  return (
    <span
      className="mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

function ActiveSignalsPanel({ setups }: { setups: SignalSetupRow[] }) {
  const active = setups.filter(s => s.status !== 'archived');

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[#1f2128] bg-[#13141a] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#e6e8ee]">Active Setups</h2>
        <span className="rounded-full bg-[#1f2128] px-2 py-0.5 text-xs tabular-nums text-[#8a8f9b]">
          {active.length}
        </span>
      </div>

      {active.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8">
          <p className="text-xs text-[#5a5f6a]">No active signal setups.</p>
          <a
            href="/signals"
            className="rounded-lg border border-[#22d3ee]/30 bg-[#22d3ee]/10 px-3 py-1.5 text-xs font-medium text-[#22d3ee] transition-colors hover:bg-[#22d3ee]/20"
          >
            Create setup
          </a>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {active.map(setup => (
            <li
              key={setup.id}
              className="group flex items-start gap-2 rounded-lg border border-transparent p-2 transition-colors hover:border-[#1f2128] hover:bg-[#0a0a0b]"
            >
              <StatusDot status={setup.status} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#e6e8ee]">{setup.name}</p>
                <p className="mt-0.5 text-xs text-[#8a8f9b]">
                  {setup.market} &middot; {setup.instruments.slice(0, 3).join(', ')}
                  {setup.instruments.length > 3 && ` +${setup.instruments.length - 3}`}
                </p>
              </div>
              <span
                className="mt-0.5 flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor:
                    setup.status === 'armed'  ? '#22c55e22' :
                    setup.status === 'paused' ? '#fbbf2422' : '#1f2128',
                  color:
                    setup.status === 'armed'  ? '#22c55e' :
                    setup.status === 'paused' ? '#fbbf24' : '#5a5f6a',
                }}
              >
                {setup.status}
              </span>
            </li>
          ))}
        </ul>
      )}

      <a
        href="/signals"
        className="mt-auto rounded-lg border border-[#1f2128] py-2 text-center text-xs text-[#8a8f9b] transition-colors hover:border-[#2a2d36] hover:text-[#e6e8ee]"
      >
        Manage setups
      </a>
    </section>
  );
}

// --- TodaysSignals ------------------------------------------------------------

function TodaysSignals({ events }: { events: SignalEventRow[] }) {
  function relativeTime(isoString: string): string {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins  = Math.floor(diff / 60_000);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[#1f2128] bg-[#13141a] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#e6e8ee]">Today&apos;s Signals</h2>
        <span className="rounded-full bg-[#1f2128] px-2 py-0.5 text-xs tabular-nums text-[#8a8f9b]">
          {events.length}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-10">
          <p className="text-xs text-[#5a5f6a]">No signals triggered in the last 24 hours.</p>
          <p className="text-xs text-[#5a5f6a]">Real-time triggers will appear here.</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-[#1f2128]">
          {events.map(ev => (
            <li key={ev.id} className="flex flex-col gap-1 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* Instrument chip */}
                  <span className="rounded border border-[#22d3ee]/20 bg-[#22d3ee]/10 px-1.5 py-0.5 font-mono text-xs font-medium text-[#22d3ee]">
                    {ev.instrument}
                  </span>
                  {ev.setup && (
                    <span className="text-xs text-[#8a8f9b]">{ev.setup.name}</span>
                  )}
                </div>
                <time className="flex-shrink-0 text-xs text-[#5a5f6a]">
                  {relativeTime(ev.createdAt)}
                </time>
              </div>

              {ev.aiExplanation ? (
                <p className="line-clamp-2 text-xs text-[#8a8f9b]">
                  {ev.aiExplanation}
                </p>
              ) : (
                /* Placeholder shimmer while AI explanation is pending */
                <div className="flex flex-col gap-1">
                  <div className="h-2.5 w-full animate-pulse rounded bg-[#1f2128]" />
                  <div className="h-2.5 w-3/4 animate-pulse rounded bg-[#1f2128]" />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// --- QuickStats --------------------------------------------------------------

const ASSET_CLASS_COLORS: Record<string, { bg: string; label: string }> = {
  crypto:      { bg: '#22d3ee', label: 'Crypto' },
  stocks:      { bg: '#60a5fa', label: 'Stocks' },
  futures:     { bg: '#a78bfa', label: 'Futures' },
  forex:       { bg: '#34d399', label: 'Forex' },
  commodities: { bg: '#fbbf24', label: 'Commodities' },
  resources:   { bg: '#f97366', label: 'Resources' },
};

function CvdHeatmapTile({
  assetClass,
}: {
  assetClass: string;
}) {
  const meta = ASSET_CLASS_COLORS[assetClass] ?? { bg: '#5a5f6a', label: assetClass };

  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg p-3"
      style={{ backgroundColor: `${meta.bg}18`, border: `1px solid ${meta.bg}30` }}
    >
      {/* Direction placeholder — will be driven by WebSocket CVD delta */}
      <div
        className="mb-1 h-5 w-5 rounded-full"
        style={{ backgroundColor: `${meta.bg}40` }}
        title="CVD direction — live via WebSocket"
      />
      <span className="text-[10px] font-medium" style={{ color: meta.bg }}>
        {meta.label}
      </span>
      <span className="mt-0.5 text-[10px] text-[#5a5f6a]">--</span>
    </div>
  );
}

function QuickStats({ anomalyCount }: { anomalyCount: number }) {
  const assetClasses = Object.keys(ASSET_CLASS_COLORS);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[#1f2128] bg-[#13141a] p-4">
      <h2 className="text-sm font-semibold text-[#e6e8ee]">CVD Direction</h2>

      <div className="grid grid-cols-3 gap-2">
        {assetClasses.map(ac => (
          <CvdHeatmapTile key={ac} assetClass={ac} />
        ))}
      </div>

      <p className="text-[10px] text-[#5a5f6a]">
        Live data via WebSocket — connecting&hellip;
      </p>

      <div className="mt-1 flex items-center justify-between rounded-lg border border-[#1f2128] bg-[#0a0a0b] px-3 py-2">
        <span className="text-xs text-[#8a8f9b]">Anomalies (24 h)</span>
        <span className="text-sm font-semibold tabular-nums text-[#f97366]">
          {anomalyCount}
        </span>
      </div>
    </section>
  );
}

// --- WatchlistStrip ----------------------------------------------------------

function InstrumentChip({ symbol }: { symbol: string }) {
  return (
    <div className="flex flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-[#1f2128] bg-[#13141a] px-3 py-1 transition-colors hover:border-[#2a2d36]">
      <span className="font-mono text-xs font-semibold text-[#e6e8ee]">{symbol}</span>
      {/* Price placeholder — will be driven by WebSocket tick */}
      <span className="font-mono text-[10px] text-[#5a5f6a]">--</span>
    </div>
  );
}

function WatchlistStrip({ instruments }: { instruments: string[] }) {
  const display = instruments.length > 0
    ? instruments
    : ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'BNB-USDT', 'XRP-USDT', 'AAPL', 'ES1!', 'EUR/USD'];

  return (
    <section className="flex h-[60px] items-center gap-2 overflow-x-auto rounded-xl border border-[#1f2128] bg-[#13141a] px-4 scrollbar-hide">
      <span className="mr-1 flex-shrink-0 text-xs font-medium text-[#5a5f6a]">
        Watchlist
      </span>
      {display.map(symbol => (
        <InstrumentChip key={symbol} symbol={symbol} />
      ))}
    </section>
  );
}

// --- Upgrade Banner ----------------------------------------------------------

function UpgradeBanner() {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[#fbbf24]/20 bg-[#fbbf24]/5 px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-[#fbbf24]">Unlock Pro Features</p>
        <p className="text-xs text-[#8a8f9b]">
          Cross-market scans, unlimited signals, Sonnet &amp; Opus AI, CSV export and more.
        </p>
      </div>
      <a
        href="/billing/upgrade"
        className="flex-shrink-0 rounded-lg bg-[#fbbf24] px-4 py-2 text-xs font-semibold text-[#0a0a0b] transition-opacity hover:opacity-90"
      >
        Upgrade to Pro
      </a>
    </div>
  );
}

// ─── Page (Server Component) ──────────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId           = session.user.id;
  const tier             = (session.user as { tier?: string }).tier ?? 'free';
  const tokenBalance     = (session.user as { tokenBalanceCents?: number }).tokenBalanceCents ?? 0;
  const username         = session.user.name ?? session.user.email ?? 'Trader';
  const since24h         = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Parallel data fetches
  const [signalSetups, todaysEvents, watchlists, tokenLedger] = await Promise.all([
    // 1. Active signal setups
    db.signalSetup.findMany({
      where:   { userId, status: { in: ['armed', 'paused'] } },
      orderBy: { createdAt: 'desc' },
    }),

    // 2. Signal events from the last 24 h
    db.signalEvent.findMany({
      where:   { userId, createdAt: { gte: since24h } },
      orderBy: { createdAt: 'desc' },
      take:    50,
      include: { setup: { select: { name: true, market: true } } },
    }),

    // 3. User's watchlists
    db.watchlist.findMany({
      where: { userId },
      take:  5,
    }),

    // 4. Token balance (fresh from DB for accuracy)
    db.tokenLedger.findUnique({
      where:  { userId },
      select: { balanceCents: true },
    }),
  ]);

  // Flatten watchlist instruments (deduplicated)
  const watchlistInstruments: string[] = Array.from(
    new Set<string>(watchlists.flatMap((w: { instruments: string[] }) => w.instruments)),
  );

  // Anomaly count placeholder (will come from materialized analytics table)
  const anomalyCount = 0;

  // Serialise Prisma results to plain objects (avoids Next.js serialisation warnings)
  const serialisedSetups  = JSON.parse(JSON.stringify(signalSetups))  as SignalSetupRow[];
  const serialisedEvents  = JSON.parse(JSON.stringify(todaysEvents))  as SignalEventRow[];
  const liveBalanceCents  = tokenLedger?.balanceCents ?? tokenBalance;

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ backgroundColor: '#0a0a0b', color: '#e6e8ee' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <DashboardHeader
        username={username}
        tier={tier}
        tokenBalanceCents={liveBalanceCents}
      />

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col gap-4 p-4 lg:p-6">

        {/* Upgrade banner for free users */}
        {tier === 'free' && <UpgradeBanner />}

        {/* 3-column grid */}
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: 'repeat(1, 1fr)',
          }}
        >
          {/* Desktop: 3 cols via inline style override — Tailwind's lg:grid-cols-3
              would need configuration; we apply it safely via inline style so
              this component is self-contained. */}
          <style>{`
            @media (min-width: 1024px) {
              .dashboard-grid {
                grid-template-columns: 30% 40% 30%;
              }
            }
          `}</style>

          <div
            className="dashboard-grid grid gap-4"
            style={{ gridColumn: '1 / -1' }}
          >
            {/* Left — Active Signals */}
            <ActiveSignalsPanel setups={serialisedSetups} />

            {/* Center — Today's Signals */}
            <TodaysSignals events={serialisedEvents} />

            {/* Right — Quick Stats */}
            <QuickStats anomalyCount={anomalyCount} />
          </div>
        </div>

        {/* ── Watchlist strip ─────────────────────────────────────────────── */}
        <WatchlistStrip instruments={watchlistInstruments} />

        {/* ── Free-tier inline hints ─────────────────────────────────────── */}
        {tier === 'free' && serialisedSetups.length >= 3 && (
          <div className="rounded-xl border border-[#1f2128] bg-[#13141a] px-4 py-3 text-xs text-[#8a8f9b]">
            You have reached the free plan limit of{' '}
            <strong className="text-[#e6e8ee]">3 signal setups</strong>.{' '}
            <a
              href="/billing/upgrade"
              className="text-[#22d3ee] underline underline-offset-2 hover:no-underline"
            >
              Upgrade to Pro
            </a>{' '}
            for unlimited setups.
          </div>
        )}
      </main>
    </div>
  );
}
