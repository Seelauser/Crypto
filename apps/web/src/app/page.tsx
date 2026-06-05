import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import {
  ArrowRight, Bell, BrainCircuit, ChevronRight, Clock,
  Crosshair, Database, Eye, Filter, Gauge, LineChart, Lock,
  Radio, ShieldCheck, Sparkles, TrendingUp, Zap,
} from 'lucide-react';

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect('/markets/crypto');

  return (
    <main className="lp-root">
      {/* ── TICKER TAPE ─────────────────────────────────────────────────────── */}
      <div className="lp-ticker" aria-hidden>
        <div className="lp-ticker-track">
          {TICKER.concat(TICKER).map((t, i) => (
            <span key={i} className={`lp-tick lp-tick-${t.dir}`}>
              <span className="lp-tick-sym">{t.sym}</span>
              <span className="lp-tick-px tabular">{t.px}</span>
              <span className="lp-tick-chg tabular">{t.chg}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── NAV ─────────────────────────────────────────────────────────────── */}
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Link href="/" className="lp-logo">
            <span className="lp-logo-mark" aria-hidden>
              <span className="lp-chev" />
              <span className="lp-chev" />
            </span>
            <span className="lp-logo-text">OrderFlow<span className="lp-logo-beast">BEAST</span></span>
          </Link>
          <nav className="lp-nav-links">
            <a href="#features">Features</a>
            <a href="#flow">The Tape</a>
            <a href="#markets">Markets</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="lp-nav-actions">
            <Link href="/login" className="lp-link-quiet">Sign in</Link>
            <Link href="/register" className="lp-btn-primary lp-btn-sm">
              Start free <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-grid" aria-hidden />
        <div className="lp-hero-orb lp-hero-orb-1" aria-hidden />
        <div className="lp-hero-orb lp-hero-orb-2" aria-hidden />
        <div className="lp-hero-orb lp-hero-orb-3" aria-hidden />

        <div className="lp-container lp-hero-inner">
          <div className="lp-hero-copy">
            <div className="lp-eyebrow">
              <span className="lp-pulse" />
              LIVE · True L2 order flow · 6 asset classes
            </div>

            <h1 className="lp-h1">
              The market leaves tracks.<br />
              <span className="lp-accent-beast">Hunt them.</span>
            </h1>

            <p className="lp-sub">
              OrderFlow Beast turns raw exchange tape into actionable signals —
              CVD, imbalance, sweeps, regime shifts — each one explained by AI the
              instant it fires. See where the smart money moves and strike before
              the candle prints.
            </p>

            <div className="lp-hero-cta">
              <Link href="/register" className="lp-btn-primary lp-btn-lg">
                Unleash it — free, no card <ArrowRight size={16} />
              </Link>
              <a href="#flow" className="lp-btn-ghost lp-btn-lg">
                Watch the tape <ChevronRight size={16} />
              </a>
            </div>

            <ul className="lp-hero-trust">
              <li><ShieldCheck size={14} /> Server-side gates · no client trust</li>
              <li><Lock size={14} /> SOC-grade key handling</li>
              <li><Zap size={14} /> &lt;200ms median signal latency</li>
            </ul>
          </div>

          {/* Live feed mock — visual anchor, NOT real data */}
          <aside className="lp-hero-preview" aria-hidden>
            <div className="lp-scanline" />
            <div className="lp-preview-head">
              <span className="lp-preview-dot" />
              <span className="lp-preview-title">Signal tape · last 60s</span>
              <span className="lp-preview-meter">12 · LIVE</span>
            </div>
            <ul className="lp-feed">
              <SignalRow side="buy"  sym="BTC-USDT" type="Sweep buy"           ago="2s"  price="68 412"    delta="+ $4.2M" tag="True L2" />
              <SignalRow side="sell" sym="ES1!"     type="CVD divergence"      ago="8s"  price="5 612.25"  delta="− 8.4×"  tag="Inferred" />
              <SignalRow side="buy"  sym="ETH-USDT" type="Whale absorb"        ago="14s" price="3 718.10"  delta="+ $1.9M" tag="True L2" />
              <SignalRow side="warn" sym="EUR/USD"  type="Regime flip → trend" ago="29s" price="1.0742"    delta="HMM"     tag="Inferred" />
              <SignalRow side="sell" sym="NQ1!"     type="Imbalance 11×"       ago="41s" price="20 184.50" delta="− $7.1M" tag="Inferred" />
              <SignalRow side="buy"  sym="SOL-USDT" type="Large print"         ago="58s" price="187.42"    delta="+ $612K" tag="True L2" />
            </ul>
            <div className="lp-preview-foot">
              <BrainCircuit size={12} /> AI explanation attached to every signal
            </div>
          </aside>
        </div>

        {/* Stat strip */}
        <div className="lp-container lp-stats">
          <Stat n="6" l="asset classes" />
          <Stat n="<200ms" l="median signal latency" />
          <Stat n="True L2" l="Binance · OKX · Bybit · Coinbase" />
          <Stat n="3-tier" l="AI: Haiku · Sonnet · Opus" />
        </div>
      </section>

      {/* ── THE TAPE / FLOW BAND ────────────────────────────────────────────── */}
      <section id="flow" className="lp-flow">
        <div className="lp-container lp-flow-inner">
          <div className="lp-flow-copy">
            <div className="lp-kicker">›››&nbsp;&nbsp;See the beast move</div>
            <h2 className="lp-h2">Cumulative delta, drawn in real time.</h2>
            <p className="lp-flow-sub">
              Every print hits the tape. Buy-side aggression stacks cyan, sell-side
              stacks coral, and the cumulative volume delta line tells you who is
              actually winning the auction — long before price confirms it.
            </p>
            <ul className="lp-flow-bullets">
              <li><Crosshair size={14} /> Aggressor-tagged prints, bid vs. ask</li>
              <li><LineChart size={14} /> Live CVD with divergence detection</li>
              <li><Gauge size={14} /> Absorption &amp; exhaustion highlighted automatically</li>
            </ul>
          </div>

          {/* CSS-drawn flow visualization */}
          <div className="lp-flow-viz" aria-hidden>
            <div className="lp-viz-head">
              <span>BTC-USDT · CVD</span>
              <span className="lp-viz-live"><span className="lp-pulse" /> streaming</span>
            </div>
            <div className="lp-viz-bars">
              {FLOW_BARS.map((h, i) => (
                <div key={i} className="lp-viz-col">
                  <span
                    className={`lp-viz-bar lp-viz-bar-${h.dir}`}
                    style={{ height: `${h.v}%`, animationDelay: `${i * 90}ms` }}
                  />
                </div>
              ))}
              <svg className="lp-viz-line" viewBox="0 0 100 40" preserveAspectRatio="none">
                <polyline
                  points="0,30 10,28 20,31 30,24 40,22 50,25 60,17 70,14 80,16 90,8 100,6"
                  fill="none" stroke="url(#beastgrad)" strokeWidth="1.4"
                  vectorEffect="non-scaling-stroke"
                />
                <defs>
                  <linearGradient id="beastgrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="lp-viz-foot">
              <span className="lp-viz-tag lp-viz-tag-buy">CVD +12.4M</span>
              <span className="lp-viz-tag lp-viz-tag-warn">Bullish divergence</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────────── */}
      <section id="features" className="lp-section">
        <div className="lp-container">
          <SectionHeader
            kicker="Why traders switch"
            title="Order flow that explains itself."
            sub="Six instruments. One unified tape. AI that tells you why a signal fired — not just that it did."
          />

          <div className="lp-features">
            <Feature
              icon={<Radio size={20} />}
              title="True L2 + Inferred"
              body="Crypto streams real Level-2 from CCXT Pro. Stocks, futures, forex, commodities use a calibrated price-position model — always labelled, never misrepresented."
              accent="buy"
            />
            <Feature
              icon={<BrainCircuit size={20} />}
              title="AI-explained signals"
              body="Every fire ships with a 2-sentence narrative: Haiku for fast triage, Sonnet for nuanced explanations, Opus for deep multi-symbol forensics."
              accent="info"
            />
            <Feature
              icon={<Filter size={20} />}
              title="Cross-market scans"
              body="Compose live filters across thousands of instruments: CVD, delta, imbalance, VWAP-distance, OI change. AND / OR logic. Results in milliseconds."
              accent="buy"
            />
            <Feature
              icon={<Gauge size={20} />}
              title="Regime-aware"
              body="An HMM continuously labels the tape as trend / chop / squeeze. Signals are scored differently in each regime so you stop fighting the market."
              accent="warn"
            />
            <Feature
              icon={<Bell size={20} />}
              title="Multi-channel alerts"
              body="Email, browser push, Telegram, signed webhooks. Cooldowns and dedup baked in — no 4 a.m. notification spam from the same trigger."
              accent="info"
            />
            <Feature
              icon={<LineChart size={20} />}
              title="Footprint · Heatmap · DOM"
              body="Pro-tier charts: order-book heatmap with absorption highlights, footprint bars with delta-per-price, DOM ladder with sweep markers."
              accent="sell"
            />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────────────── */}
      <section className="lp-section lp-section-alt">
        <div className="lp-container">
          <SectionHeader
            kicker="3 steps to your first signal"
            title="Trigger → AI explanation → your inbox."
          />
          <div className="lp-steps">
            <Step n="1" icon={<Database size={18} />} title="Pick your tape" body="Crypto pairs, US stocks, futures, FX, commodities, resources. Mix and match in one setup." />
            <Step n="2" icon={<Filter size={18} />} title="Compose triggers" body="Drop in CVD thresholds, imbalance ratios, sweep size, VWAP distance — any combination, AND/OR." />
            <Step n="3" icon={<Sparkles size={18} />} title="Get explained signals" body="When the tape fires your setup, an AI explanation lands on your dashboard, email, push, or Telegram." />
          </div>
        </div>
      </section>

      {/* ── ASSET COVERAGE ──────────────────────────────────────────────────── */}
      <section id="markets" className="lp-section">
        <div className="lp-container">
          <SectionHeader
            kicker="Six markets, one tape"
            title="Trade where the flow is."
            sub="Every instrument labelled by data quality. We never present inferred data as True L2."
          />

          <div className="lp-markets">
            <Market name="Crypto"      tag="True L2"  tagKind="ok"   venues="Binance · OKX · Bybit · Coinbase · Kraken" />
            <Market name="US Stocks"   tag="Inferred" tagKind="warn" venues="NYSE · NASDAQ via Alpaca" />
            <Market name="US Futures"  tag="Inferred" tagKind="warn" venues="CME · CBOT · NYMEX (ES · NQ · CL · GC)" />
            <Market name="Forex"       tag="Inferred" tagKind="warn" venues="Majors + minors via OANDA" />
            <Market name="Commodities" tag="Inferred" tagKind="warn" venues="Gold · Silver · Oil · Nat Gas · Copper" />
            <Market name="Resources"   tag="Inferred" tagKind="warn" venues="Wheat · Corn · Soy · Coffee · Sugar" />
          </div>

          <p className="lp-fine">
            <Eye size={12} /> <strong>True L2</strong> = real order-book + raw trade prints. <strong>Inferred</strong> = delta/CVD reconstructed from OHLCV via price-position. Always badged in the UI.
          </p>
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────────────────────── */}
      <section id="pricing" className="lp-section lp-section-alt">
        <div className="lp-container">
          <SectionHeader
            kicker="Pricing"
            title="Free forever for the basics. $10/mo to go pro."
            sub="No annual contract. Cancel any time. AI usage metered transparently."
          />

          <div className="lp-pricing">
            <PriceCard
              name="Free"
              price="$0"
              cadence="forever"
              cta="Create account"
              ctaHref="/register"
              highlights={[
                '3 active signal setups',
                '5 instruments per setup',
                '10 scans / 24h',
                'AI: 10 Haiku-tier calls / day',
                '7 days of history',
                'Email + browser push',
              ]}
            />
            <PriceCard
              name="Pro"
              price="$10"
              cadence="/ month"
              cta="Start free, upgrade later"
              ctaHref="/register"
              recommended
              highlights={[
                'Unlimited signal setups',
                '10 instruments per setup',
                'Unlimited scans + cross-market',
                'AI: unlimited (metered $) — Haiku · Sonnet · Opus',
                'Full history',
                'Telegram + signed webhooks',
                'Footprint · Heatmap · DOM',
                'CSV export + API access',
              ]}
            />
            <PriceCard
              name="Desk"
              price="custom"
              cadence="team & DMA feeds"
              cta="Contact sales"
              ctaHref="mailto:sales@orderflow-beast.com?subject=Desk%20tier"
              highlights={[
                'Everything in Pro',
                'Bring your own DataBento / Polygon Advanced',
                'Seat-based pricing',
                'Private Slack channel',
                'SLA + uptime credits',
              ]}
            />
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────────── */}
      <section id="faq" className="lp-section">
        <div className="lp-container lp-faq-wrap">
          <SectionHeader
            kicker="FAQ"
            title="The questions every trader asks."
          />
          <div className="lp-faq">
            <Faq q="Is the data real or simulated?" a="Crypto is real True L2 streamed live from major exchanges via CCXT Pro. Stocks, futures, forex and commodities are inferred from OHLCV — clearly badged everywhere in the UI. No data is ever faked." />
            <Faq q="Do you store my API keys?" a="Exchange + brokerage keys are optional and stored encrypted at rest. We never need write/withdraw permissions — read-only is enough. You can rotate or revoke at any time." />
            <Faq q="What if AI usage explodes my bill?" a="Pro includes $10/mo of AI credit. Overage is metered transparently and shown per call. You can cap daily spend in settings — the breaker kicks in before any surprise." />
            <Faq q="Is this financial advice?" a="No. Every signal carries a disclaimer. OrderFlow surfaces flow — you decide the trade." />
            <Faq q="Can I export my data?" a="Yes. Pro users get CSV export of signals and a REST API for programmatic access. Your data is yours." />
            <Faq q="How fast are signals?" a="Median signal latency from tape event to user notification is under 200ms for crypto. Inferred markets depend on data provider — typically 1–3s." />
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ───────────────────────────────────────────────────────── */}
      <section className="lp-cta">
        <div className="lp-cta-orb" aria-hidden />
        <div className="lp-container lp-cta-inner">
          <h2 className="lp-h2">Stop trading from candle charts.</h2>
          <p className="lp-cta-sub">
            Real order flow, AI-explained, free to start. Three minutes to your first signal.
          </p>
          <Link href="/register" className="lp-btn-primary lp-btn-lg">
            Unleash the Beast <ArrowRight size={16} />
          </Link>
          <p className="lp-cta-fine">No credit card. No commitment. Cancel anytime.</p>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <div className="lp-footer-brand">
            <div className="lp-logo">
              <span className="lp-logo-mark" aria-hidden>
                <span className="lp-chev" />
                <span className="lp-chev" />
              </span>
              <span className="lp-logo-text">OrderFlow<span className="lp-logo-beast">BEAST</span></span>
            </div>
            <p className="lp-footer-blurb">
              Professional order-flow analytics for active traders.
              Six asset classes. AI-explained. Built for speed.
            </p>
          </div>
          <div className="lp-footer-cols">
            <div>
              <h5>Product</h5>
              <a href="#features">Features</a>
              <a href="#markets">Markets</a>
              <a href="#pricing">Pricing</a>
            </div>
            <div>
              <h5>Account</h5>
              <Link href="/login">Sign in</Link>
              <Link href="/register">Create account</Link>
            </div>
            <div>
              <h5>Legal</h5>
              <a href="/terms">Terms</a>
              <a href="/privacy">Privacy</a>
              <a href="/risk">Risk disclosure</a>
            </div>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span>© {new Date().getFullYear()} OrderFlow Beast. Not investment advice.</span>
          <span className="lp-footer-meta"><Clock size={11} /> Servers in EU · status: <span className="lp-ok">operational</span></span>
        </div>
      </footer>

      {/* ── STYLES ──────────────────────────────────────────────────────────── */}
      <style>{LP_CSS}</style>
    </main>
  );
}

/* ── Data ───────────────────────────────────────────────────────────────── */

const TICKER = [
  { sym: 'BTC',  px: '68 412',   chg: '+1.84%', dir: 'buy'  },
  { sym: 'ETH',  px: '3 718',    chg: '+2.10%', dir: 'buy'  },
  { sym: 'SOL',  px: '187.42',   chg: '+4.61%', dir: 'buy'  },
  { sym: 'ES',   px: '5 612.25', chg: '−0.42%', dir: 'sell' },
  { sym: 'NQ',   px: '20 184.5', chg: '−0.88%', dir: 'sell' },
  { sym: 'CL',   px: '78.14',    chg: '+0.93%', dir: 'buy'  },
  { sym: 'GC',   px: '2 412.6',  chg: '+0.31%', dir: 'buy'  },
  { sym: 'EURUSD', px: '1.0742', chg: '−0.12%', dir: 'sell' },
] as const;

const FLOW_BARS: { v: number; dir: 'buy' | 'sell' }[] = [
  { v: 34, dir: 'sell' }, { v: 52, dir: 'buy' }, { v: 41, dir: 'sell' },
  { v: 63, dir: 'buy' },  { v: 58, dir: 'buy' }, { v: 38, dir: 'sell' },
  { v: 72, dir: 'buy' },  { v: 66, dir: 'buy' }, { v: 47, dir: 'sell' },
  { v: 81, dir: 'buy' },  { v: 75, dir: 'buy' }, { v: 90, dir: 'buy' },
];

/* ── Components ─────────────────────────────────────────────────────────── */

function SignalRow({
  side, sym, type, ago, price, delta, tag,
}: {
  side: 'buy' | 'sell' | 'warn';
  sym: string; type: string; ago: string; price: string; delta: string; tag: string;
}) {
  return (
    <li className={`lp-row lp-row-${side}`}>
      <span className="lp-row-side" />
      <span className="lp-row-sym">{sym}</span>
      <span className="lp-row-type">{type}</span>
      <span className="lp-row-price tabular">{price}</span>
      <span className={`lp-row-delta lp-row-delta-${side} tabular`}>{delta}</span>
      <span className={`lp-row-tag lp-row-tag-${tag === 'True L2' ? 'l2' : 'inf'}`}>{tag}</span>
      <span className="lp-row-ago">{ago}</span>
    </li>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div className="lp-stat">
      <div className="lp-stat-n tabular">{n}</div>
      <div className="lp-stat-l">{l}</div>
    </div>
  );
}

function SectionHeader({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="lp-shead">
      <div className="lp-kicker">›››&nbsp;&nbsp;{kicker}</div>
      <h2 className="lp-h2">{title}</h2>
      {sub && <p className="lp-shead-sub">{sub}</p>}
    </div>
  );
}

function Feature({
  icon, title, body, accent,
}: { icon: React.ReactNode; title: string; body: string; accent: 'buy' | 'sell' | 'warn' | 'info' }) {
  return (
    <article className={`lp-feature lp-feature-${accent}`}>
      <div className="lp-feature-icon">{icon}</div>
      <h3 className="lp-h3">{title}</h3>
      <p>{body}</p>
    </article>
  );
}

function Step({ n, icon, title, body }: { n: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="lp-step">
      <div className="lp-step-head">
        <span className="lp-step-num tabular">{n}</span>
        <span className="lp-step-icon">{icon}</span>
      </div>
      <h3 className="lp-h3">{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function Market({ name, tag, tagKind, venues }: { name: string; tag: string; tagKind: 'ok' | 'warn'; venues: string }) {
  return (
    <article className="lp-market">
      <header>
        <h3 className="lp-h3">{name}</h3>
        <span className={`lp-tag lp-tag-${tagKind}`}>{tag}</span>
      </header>
      <p>{venues}</p>
    </article>
  );
}

function PriceCard({
  name, price, cadence, cta, ctaHref, highlights, recommended,
}: {
  name: string; price: string; cadence: string; cta: string; ctaHref: string;
  highlights: string[]; recommended?: boolean;
}) {
  return (
    <article className={`lp-price ${recommended ? 'lp-price-rec' : ''}`}>
      {recommended && <div className="lp-price-badge">Most popular</div>}
      <div className="lp-price-name">{name}</div>
      <div className="lp-price-amount">
        <span className="lp-price-num tabular">{price}</span>
        <span className="lp-price-cadence">{cadence}</span>
      </div>
      <ul className="lp-price-list">
        {highlights.map((h, i) => (
          <li key={i}><TrendingUp size={12} /> {h}</li>
        ))}
      </ul>
      <Link href={ctaHref} className={recommended ? 'lp-btn-primary lp-btn-block' : 'lp-btn-ghost lp-btn-block'}>
        {cta} <ArrowRight size={14} />
      </Link>
    </article>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="lp-faq-item">
      <summary>{q}<ChevronRight size={14} /></summary>
      <p>{a}</p>
    </details>
  );
}

/* ── Styles (single CSS string for SSR delivery) ────────────────────────── */

const LP_CSS = `
  .lp-root { background:#060709; color:#e6e8ee; min-height:100vh; overflow-x:hidden; }
  .lp-container { max-width:1180px; margin:0 auto; padding:0 24px; }
  .tabular { font-family:'JetBrains Mono', ui-monospace, monospace; font-variant-numeric:tabular-nums; }

  /* TICKER TAPE */
  .lp-ticker { position:relative; z-index:60; overflow:hidden; background:#0a0b0e; border-bottom:1px solid #16181f; height:34px; display:flex; align-items:center; }
  .lp-ticker-track { display:flex; gap:0; white-space:nowrap; animation:lp-marquee 40s linear infinite; will-change:transform; }
  @keyframes lp-marquee { from { transform:translateX(0); } to { transform:translateX(-50%); } }
  .lp-tick { display:inline-flex; align-items:center; gap:8px; padding:0 22px; font-size:12px; border-right:1px solid #14161c; }
  .lp-tick-sym { color:#aeb4c0; font-weight:600; letter-spacing:0.02em; }
  .lp-tick-px { color:#e6e8ee; font-size:11px; }
  .lp-tick-chg { font-size:11px; }
  .lp-tick-buy .lp-tick-chg { color:#22d3ee; }
  .lp-tick-sell .lp-tick-chg { color:#f97366; }

  /* NAV */
  .lp-nav { position:sticky; top:0; z-index:50; backdrop-filter:blur(14px); background:rgba(6,7,9,0.78); border-bottom:1px solid #16181f; }
  .lp-nav-inner { max-width:1180px; margin:0 auto; padding:14px 24px; display:flex; align-items:center; gap:32px; }
  .lp-logo { display:flex; align-items:center; gap:10px; font-weight:700; font-size:16px; text-decoration:none; color:#e6e8ee; }
  .lp-logo-mark { position:relative; display:inline-flex; width:20px; height:18px; }
  .lp-chev { position:absolute; top:0; width:9px; height:18px; border-right:3px solid #22d3ee; border-bottom:3px solid #22d3ee; transform:skewX(-12deg) rotate(-45deg); transform-origin:center; box-shadow:0 0 10px rgba(34,211,238,0.5); }
  .lp-chev:nth-child(1) { left:0; opacity:0.55; }
  .lp-chev:nth-child(2) { left:7px; }
  .lp-logo-text { letter-spacing:-0.01em; }
  .lp-logo-beast { color:#a855f7; margin-left:3px; font-weight:800; letter-spacing:0.04em; font-size:13px; }
  .lp-nav-links { display:flex; gap:24px; flex:1; }
  .lp-nav-links a { color:#8a8f9b; font-size:13px; text-decoration:none; transition:color 150ms; }
  .lp-nav-links a:hover { color:#e6e8ee; }
  .lp-nav-actions { display:flex; align-items:center; gap:14px; }
  .lp-link-quiet { color:#8a8f9b; font-size:13px; text-decoration:none; transition:color 150ms; }
  .lp-link-quiet:hover { color:#e6e8ee; }
  @media (max-width: 720px) { .lp-nav-links { display:none; } }

  /* BUTTONS */
  .lp-btn-primary, .lp-btn-ghost { display:inline-flex; align-items:center; gap:8px; border-radius:9px; font-weight:600; font-size:13px; text-decoration:none; transition:transform 120ms, box-shadow 200ms, background 150ms, border-color 150ms; cursor:pointer; border:1px solid transparent; }
  .lp-btn-primary { color:#04181c; padding:9px 16px; background:linear-gradient(135deg, #22d3ee 0%, #38bdf8 60%, #a855f7 140%); box-shadow:0 0 0 0 rgba(34,211,238,0.0); }
  .lp-btn-primary:hover { transform:translateY(-1px); box-shadow:0 10px 28px -8px rgba(34,211,238,0.55), 0 0 22px -6px rgba(168,85,247,0.4); }
  .lp-btn-ghost { background:rgba(255,255,255,0.02); color:#e6e8ee; padding:9px 16px; border-color:#1f2128; }
  .lp-btn-ghost:hover { border-color:#2a2d36; background:#13141a; }
  .lp-btn-sm { padding:7px 13px; font-size:12px; }
  .lp-btn-lg { padding:13px 22px; font-size:14px; border-radius:10px; }
  .lp-btn-block { width:100%; justify-content:center; padding:12px 16px; }

  /* HERO */
  .lp-hero { position:relative; padding:72px 0 56px; overflow:hidden; }
  .lp-hero-grid { position:absolute; inset:0; background-image:linear-gradient(#ffffff08 1px, transparent 1px), linear-gradient(90deg, #ffffff08 1px, transparent 1px); background-size:44px 44px; mask-image:radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 75%); pointer-events:none; }
  .lp-hero-orb { position:absolute; border-radius:50%; filter:blur(90px); pointer-events:none; }
  .lp-hero-orb-1 { top:-140px; left:-100px; width:480px; height:480px; background:#22d3ee; opacity:0.20; animation:lp-drift1 16s ease-in-out infinite; }
  .lp-hero-orb-2 { top:60px; right:-160px; width:520px; height:520px; background:#a855f7; opacity:0.16; animation:lp-drift2 19s ease-in-out infinite; }
  .lp-hero-orb-3 { bottom:-180px; left:40%; width:420px; height:420px; background:#7c3aed; opacity:0.10; animation:lp-drift1 22s ease-in-out infinite reverse; }
  @keyframes lp-drift1 { 0%,100% { transform:translate(0,0); } 50% { transform:translate(30px,24px); } }
  @keyframes lp-drift2 { 0%,100% { transform:translate(0,0); } 50% { transform:translate(-34px,20px); } }
  .lp-hero-inner { position:relative; display:grid; grid-template-columns:1.08fr 0.92fr; gap:56px; align-items:center; }
  @media (max-width: 960px) { .lp-hero-inner { grid-template-columns:1fr; gap:40px; } }

  .lp-eyebrow { display:inline-flex; align-items:center; gap:8px; background:rgba(34,211,238,0.07); border:1px solid rgba(34,211,238,0.22); color:#67e8f9; padding:6px 13px; border-radius:99px; font-size:12px; font-weight:500; margin-bottom:24px; letter-spacing:0.02em; }
  .lp-pulse { display:inline-block; width:7px; height:7px; border-radius:50%; background:#22d3ee; box-shadow:0 0 8px #22d3ee; animation:lp-pulse 1.4s ease-in-out infinite; }
  @keyframes lp-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.35; transform:scale(0.82); } }

  .lp-h1 { font-size:60px; line-height:1.02; letter-spacing:-0.03em; font-weight:800; margin-bottom:22px; }
  @media (max-width: 720px) { .lp-h1 { font-size:40px; } }
  .lp-accent-beast { background:linear-gradient(100deg, #22d3ee 0%, #67e8f9 40%, #a855f7 100%); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; position:relative; }

  .lp-sub { color:#9298a4; font-size:16px; line-height:1.65; max-width:540px; margin-bottom:28px; }
  .lp-hero-cta { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:26px; }
  .lp-hero-trust { list-style:none; display:flex; gap:20px; flex-wrap:wrap; color:#5a5f6a; font-size:12px; }
  .lp-hero-trust li { display:flex; align-items:center; gap:6px; }

  /* HERO PREVIEW (live tape) */
  .lp-hero-preview { position:relative; background:linear-gradient(180deg, #0e1014 0%, #0b0c10 100%); border:1px solid #1c1f27; border-radius:14px; padding:18px; box-shadow:0 30px 70px -24px rgba(0,0,0,0.8), 0 0 0 1px rgba(34,211,238,0.04); overflow:hidden; }
  .lp-scanline { position:absolute; left:0; right:0; height:80px; top:-80px; background:linear-gradient(180deg, transparent, rgba(34,211,238,0.07) 60%, transparent); animation:lp-scan 4.5s linear infinite; pointer-events:none; }
  @keyframes lp-scan { 0% { top:-80px; } 100% { top:100%; } }
  .lp-preview-head { display:flex; align-items:center; gap:10px; padding-bottom:14px; border-bottom:1px solid #1c1f27; margin-bottom:10px; }
  .lp-preview-dot { width:8px; height:8px; border-radius:50%; background:#22c55e; box-shadow:0 0 6px #22c55e; animation:lp-pulse 1.6s infinite; }
  .lp-preview-title { font-size:12px; color:#8a8f9b; flex:1; }
  .lp-preview-meter { font-family:'JetBrains Mono', monospace; font-size:11px; color:#22c55e; }

  .lp-feed { list-style:none; }
  .lp-row { display:grid; grid-template-columns:3px 84px 1fr 84px 80px 64px 40px; align-items:center; gap:10px; padding:9px 8px; border-radius:7px; font-size:12px; transition:background 150ms; animation:lp-rowin 600ms ease backwards; }
  .lp-row:nth-child(1){animation-delay:.05s}.lp-row:nth-child(2){animation-delay:.12s}.lp-row:nth-child(3){animation-delay:.19s}.lp-row:nth-child(4){animation-delay:.26s}.lp-row:nth-child(5){animation-delay:.33s}.lp-row:nth-child(6){animation-delay:.40s}
  @keyframes lp-rowin { from { opacity:0; transform:translateX(8px); } to { opacity:1; transform:translateX(0); } }
  .lp-row:hover { background:#15171e; }
  .lp-row + .lp-row { margin-top:2px; }
  .lp-row-side { width:3px; height:24px; border-radius:2px; }
  .lp-row-buy .lp-row-side { background:#22d3ee; box-shadow:0 0 8px #22d3ee; }
  .lp-row-sell .lp-row-side { background:#f97366; box-shadow:0 0 8px #f97366; }
  .lp-row-warn .lp-row-side { background:#fbbf24; box-shadow:0 0 8px #fbbf24; }
  .lp-row-sym { font-weight:600; }
  .lp-row-type { color:#8a8f9b; }
  .lp-row-price { color:#e6e8ee; font-size:11px; text-align:right; }
  .lp-row-delta { font-size:11px; text-align:right; font-weight:500; }
  .lp-row-delta-buy { color:#22d3ee; }
  .lp-row-delta-sell { color:#f97366; }
  .lp-row-delta-warn { color:#fbbf24; }
  .lp-row-tag { font-size:9px; padding:2px 6px; border-radius:4px; text-transform:uppercase; letter-spacing:0.04em; font-weight:600; text-align:center; }
  .lp-row-tag-l2 { background:rgba(34,197,94,0.12); color:#22c55e; }
  .lp-row-tag-inf { background:rgba(251,191,36,0.12); color:#fbbf24; }
  .lp-row-ago { color:#5a5f6a; font-size:10px; font-family:'JetBrains Mono', monospace; text-align:right; }
  .lp-preview-foot { display:flex; align-items:center; gap:6px; padding-top:12px; margin-top:8px; border-top:1px solid #1c1f27; color:#5a5f6a; font-size:11px; }

  /* STATS */
  .lp-stats { margin-top:64px; display:grid; grid-template-columns:repeat(4, 1fr); gap:24px; padding:24px 0; border-top:1px solid #16181f; border-bottom:1px solid #16181f; }
  @media (max-width: 720px) { .lp-stats { grid-template-columns:repeat(2, 1fr); } }
  .lp-stat { text-align:center; }
  .lp-stat-n { font-size:24px; font-weight:700; background:linear-gradient(120deg,#22d3ee,#a855f7); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; letter-spacing:-0.01em; }
  .lp-stat-l { color:#8a8f9b; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; margin-top:4px; }

  /* FLOW BAND */
  .lp-flow { position:relative; padding:88px 0; border-top:1px solid #16181f; background:radial-gradient(ellipse 70% 100% at 80% 50%, rgba(168,85,247,0.06), transparent 70%); }
  .lp-flow-inner { display:grid; grid-template-columns:0.9fr 1.1fr; gap:56px; align-items:center; }
  @media (max-width: 880px) { .lp-flow-inner { grid-template-columns:1fr; gap:36px; } }
  .lp-flow-sub { color:#9298a4; font-size:15px; line-height:1.65; margin:14px 0 20px; }
  .lp-flow-bullets { list-style:none; display:flex; flex-direction:column; gap:11px; }
  .lp-flow-bullets li { display:flex; align-items:center; gap:9px; color:#c3c8d2; font-size:13px; }
  .lp-flow-bullets svg { color:#22d3ee; flex-shrink:0; }

  .lp-flow-viz { background:linear-gradient(180deg, #0d0f13, #0a0b0e); border:1px solid #1c1f27; border-radius:14px; padding:18px; box-shadow:0 30px 70px -28px rgba(0,0,0,0.8); }
  .lp-viz-head { display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#8a8f9b; font-family:'JetBrains Mono', monospace; margin-bottom:16px; }
  .lp-viz-live { display:inline-flex; align-items:center; gap:6px; color:#22c55e; }
  .lp-viz-bars { position:relative; display:flex; align-items:flex-end; gap:6px; height:180px; padding-bottom:2px; }
  .lp-viz-col { flex:1; display:flex; align-items:flex-end; height:100%; }
  .lp-viz-bar { width:100%; border-radius:3px 3px 0 0; transform-origin:bottom; animation:lp-grow 1.1s cubic-bezier(.22,1,.36,1) backwards, lp-breathe 4s ease-in-out infinite; }
  .lp-viz-bar-buy { background:linear-gradient(180deg, #22d3ee, rgba(34,211,238,0.22)); box-shadow:0 0 14px -2px rgba(34,211,238,0.5); }
  .lp-viz-bar-sell { background:linear-gradient(180deg, #f97366, rgba(249,115,102,0.18)); box-shadow:0 0 14px -2px rgba(249,115,102,0.4); }
  @keyframes lp-grow { from { transform:scaleY(0); opacity:0; } to { transform:scaleY(1); opacity:1; } }
  @keyframes lp-breathe { 0%,100% { opacity:1; } 50% { opacity:0.78; } }
  .lp-viz-line { position:absolute; inset:0; width:100%; height:100%; overflow:visible; filter:drop-shadow(0 0 6px rgba(34,211,238,0.45)); }
  .lp-viz-line polyline { stroke-dasharray:300; stroke-dashoffset:300; animation:lp-draw 2.4s ease forwards .3s; }
  @keyframes lp-draw { to { stroke-dashoffset:0; } }
  .lp-viz-foot { display:flex; gap:10px; margin-top:16px; }
  .lp-viz-tag { font-size:11px; padding:4px 10px; border-radius:6px; font-weight:600; font-family:'JetBrains Mono', monospace; }
  .lp-viz-tag-buy { background:rgba(34,211,238,0.12); color:#22d3ee; }
  .lp-viz-tag-warn { background:rgba(251,191,36,0.12); color:#fbbf24; }

  /* SECTIONS */
  .lp-section { padding:88px 0; }
  .lp-section-alt { background:#08090c; border-top:1px solid #16181f; border-bottom:1px solid #16181f; }
  .lp-shead { text-align:center; max-width:680px; margin:0 auto 56px; }
  .lp-kicker { color:#67e8f9; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:14px; }
  .lp-h2 { font-size:38px; line-height:1.14; letter-spacing:-0.02em; font-weight:700; margin-bottom:14px; }
  @media (max-width: 720px) { .lp-h2 { font-size:28px; } }
  .lp-shead-sub { color:#9298a4; font-size:15px; line-height:1.6; }

  /* FEATURES */
  .lp-features { display:grid; grid-template-columns:repeat(3, 1fr); gap:20px; }
  @media (max-width: 960px) { .lp-features { grid-template-columns:repeat(2, 1fr); } }
  @media (max-width: 640px) { .lp-features { grid-template-columns:1fr; } }
  .lp-feature { position:relative; background:#0d0f13; border:1px solid #1a1d24; border-radius:13px; padding:24px; transition:border-color 200ms, transform 200ms, box-shadow 200ms; overflow:hidden; }
  .lp-feature::before { content:''; position:absolute; inset:0 0 auto 0; height:2px; background:linear-gradient(90deg, transparent, currentColor, transparent); opacity:0; transition:opacity 250ms; }
  .lp-feature:hover { border-color:#2a2d36; transform:translateY(-3px); box-shadow:0 18px 40px -22px rgba(0,0,0,0.9); }
  .lp-feature:hover::before { opacity:0.5; }
  .lp-feature-buy { color:#22d3ee; } .lp-feature-sell { color:#f97366; } .lp-feature-warn { color:#fbbf24; } .lp-feature-info { color:#60a5fa; }
  .lp-feature-icon { display:inline-flex; align-items:center; justify-content:center; width:42px; height:42px; border-radius:10px; margin-bottom:16px; background:currentColor; }
  .lp-feature-icon svg { color:#06070a; }
  .lp-feature h3, .lp-feature p { color:#e6e8ee; }
  .lp-h3 { font-size:17px; font-weight:600; margin-bottom:8px; color:#e6e8ee; }
  .lp-feature p, .lp-step p, .lp-market p { color:#9298a4; font-size:13px; line-height:1.6; }

  /* STEPS */
  .lp-steps { display:grid; grid-template-columns:repeat(3, 1fr); gap:20px; }
  @media (max-width: 720px) { .lp-steps { grid-template-columns:1fr; } }
  .lp-step { background:#0d0f13; border:1px solid #1a1d24; border-radius:13px; padding:24px; position:relative; transition:border-color 200ms, transform 200ms; }
  .lp-step:hover { border-color:#2a2d36; transform:translateY(-3px); }
  .lp-step-head { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
  .lp-step-num { color:#22d3ee; font-size:20px; font-weight:700; }
  .lp-step-icon { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:8px; background:rgba(34,211,238,0.1); color:#22d3ee; }

  /* MARKETS */
  .lp-markets { display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; }
  @media (max-width: 880px) { .lp-markets { grid-template-columns:repeat(2, 1fr); } }
  @media (max-width: 540px) { .lp-markets { grid-template-columns:1fr; } }
  .lp-market { background:#0d0f13; border:1px solid #1a1d24; border-radius:11px; padding:20px; transition:border-color 200ms, transform 200ms; }
  .lp-market:hover { border-color:#2a2d36; transform:translateY(-2px); }
  .lp-market header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
  .lp-tag { font-size:10px; padding:3px 8px; border-radius:5px; text-transform:uppercase; letter-spacing:0.04em; font-weight:600; }
  .lp-tag-ok { background:rgba(34,197,94,0.12); color:#22c55e; }
  .lp-tag-warn { background:rgba(251,191,36,0.12); color:#fbbf24; }
  .lp-fine { margin-top:24px; color:#5a5f6a; font-size:12px; display:flex; align-items:center; gap:6px; justify-content:center; }

  /* PRICING */
  .lp-pricing { display:grid; grid-template-columns:repeat(3, 1fr); gap:20px; align-items:stretch; }
  @media (max-width: 880px) { .lp-pricing { grid-template-columns:1fr; } }
  .lp-price { position:relative; background:#0d0f13; border:1px solid #1a1d24; border-radius:15px; padding:28px; display:flex; flex-direction:column; transition:transform 200ms, border-color 200ms; }
  .lp-price:hover { transform:translateY(-3px); border-color:#2a2d36; }
  .lp-price-rec { border-color:transparent; background:linear-gradient(#0d0f13,#0d0f13) padding-box, linear-gradient(135deg,#22d3ee,#a855f7) border-box; box-shadow:0 24px 60px -24px rgba(34,211,238,0.4); transform:translateY(-6px); }
  .lp-price-rec:hover { transform:translateY(-9px); }
  .lp-price-badge { position:absolute; top:-12px; left:50%; transform:translateX(-50%); background:linear-gradient(135deg,#22d3ee,#a855f7); color:#06070a; font-size:11px; font-weight:700; padding:4px 12px; border-radius:99px; text-transform:uppercase; letter-spacing:0.06em; }
  .lp-price-name { color:#8a8f9b; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:10px; }
  .lp-price-amount { display:flex; align-items:baseline; gap:6px; margin-bottom:24px; }
  .lp-price-num { font-size:42px; font-weight:700; letter-spacing:-0.02em; color:#e6e8ee; }
  .lp-price-cadence { color:#8a8f9b; font-size:13px; }
  .lp-price-list { list-style:none; flex:1; margin-bottom:22px; }
  .lp-price-list li { display:flex; align-items:flex-start; gap:8px; color:#e6e8ee; font-size:13px; padding:7px 0; border-bottom:1px solid rgba(26,29,36,0.7); }
  .lp-price-list li:last-child { border-bottom:0; }
  .lp-price-list li svg { color:#22d3ee; flex-shrink:0; margin-top:4px; }

  /* FAQ */
  .lp-faq-wrap { max-width:760px; }
  .lp-faq { display:flex; flex-direction:column; gap:10px; }
  .lp-faq-item { background:#0d0f13; border:1px solid #1a1d24; border-radius:11px; padding:16px 20px; transition:border-color 200ms; }
  .lp-faq-item[open] { border-color:#2a2d36; }
  .lp-faq-item summary { cursor:pointer; list-style:none; display:flex; justify-content:space-between; align-items:center; font-size:14px; font-weight:500; }
  .lp-faq-item summary::-webkit-details-marker { display:none; }
  .lp-faq-item summary svg { color:#8a8f9b; transition:transform 200ms; }
  .lp-faq-item[open] summary svg { transform:rotate(90deg); color:#22d3ee; }
  .lp-faq-item p { color:#9298a4; font-size:13px; line-height:1.7; padding-top:12px; margin-top:12px; border-top:1px solid #16181f; }

  /* CTA */
  .lp-cta { position:relative; padding:104px 0; background:#08090c; border-top:1px solid #16181f; overflow:hidden; }
  .lp-cta-orb { position:absolute; top:50%; left:50%; width:680px; height:340px; transform:translate(-50%,-50%); background:radial-gradient(ellipse, rgba(34,211,238,0.12), rgba(168,85,247,0.08) 45%, transparent 70%); filter:blur(30px); pointer-events:none; }
  .lp-cta-inner { position:relative; text-align:center; max-width:640px; }
  .lp-cta-sub { color:#9298a4; font-size:16px; margin:14px 0 28px; line-height:1.6; }
  .lp-cta-fine { color:#5a5f6a; font-size:12px; margin-top:14px; }

  /* FOOTER */
  .lp-footer { background:#08090c; border-top:1px solid #16181f; padding:48px 0 24px; }
  .lp-footer-inner { display:grid; grid-template-columns:1.4fr 2fr; gap:48px; padding-bottom:32px; border-bottom:1px solid #16181f; }
  @media (max-width: 720px) { .lp-footer-inner { grid-template-columns:1fr; gap:32px; } }
  .lp-footer-brand .lp-logo { margin-bottom:14px; }
  .lp-footer-blurb { color:#5a5f6a; font-size:12px; line-height:1.7; max-width:320px; }
  .lp-footer-cols { display:grid; grid-template-columns:repeat(3, 1fr); gap:32px; }
  .lp-footer-cols h5 { font-size:11px; color:#8a8f9b; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:14px; font-weight:600; }
  .lp-footer-cols a { display:block; color:#5a5f6a; font-size:13px; text-decoration:none; padding:4px 0; transition:color 150ms; }
  .lp-footer-cols a:hover { color:#e6e8ee; }
  .lp-footer-bottom { display:flex; justify-content:space-between; align-items:center; padding-top:20px; color:#5a5f6a; font-size:11px; flex-wrap:wrap; gap:8px; }
  .lp-footer-meta { display:flex; align-items:center; gap:6px; }
  .lp-ok { color:#22c55e; }

  @media (prefers-reduced-motion: reduce) {
    .lp-ticker-track, .lp-scanline, .lp-hero-orb, .lp-viz-bar, .lp-viz-line polyline, .lp-row, .lp-pulse { animation:none !important; }
    .lp-viz-line polyline { stroke-dashoffset:0; }
  }
`;
