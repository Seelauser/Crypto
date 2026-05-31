import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import {
  Activity, ArrowRight, Bell, BrainCircuit, ChevronRight, Clock,
  Database, Eye, Filter, Gauge, Github, LineChart, Lock,
  Radio, ShieldCheck, Sparkles, TrendingUp, Webhook, Zap,
} from 'lucide-react';

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');

  return (
    <main className="lp-root">
      {/* ── NAV ─────────────────────────────────────────────────────────────── */}
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Link href="/" className="lp-logo">
            <span className="lp-logo-mark">◆</span>
            <span>OrderFlow</span>
          </Link>
          <nav className="lp-nav-links">
            <a href="#features">Features</a>
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
        <div className="lp-hero-orb lp-hero-orb-1" aria-hidden />
        <div className="lp-hero-orb lp-hero-orb-2" aria-hidden />

        <div className="lp-container lp-hero-inner">
          <div className="lp-hero-copy">
            <div className="lp-eyebrow">
              <span className="lp-pulse" />
              True L2 order flow · 6 asset classes · live now
            </div>

            <h1 className="lp-h1">
              See where the <span className="lp-accent-buy">smart money</span><br />
              is actually moving.
            </h1>

            <p className="lp-sub">
              OrderFlow Analytics turns raw exchange tape into actionable signals.
              CVD, imbalance, sweeps, regime shifts — explained by AI in plain English,
              the moment they fire. Built for traders who refuse to guess.
            </p>

            <div className="lp-hero-cta">
              <Link href="/register" className="lp-btn-primary lp-btn-lg">
                Start free — no card <ArrowRight size={16} />
              </Link>
              <a href="#features" className="lp-btn-ghost lp-btn-lg">
                See how it works <ChevronRight size={16} />
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
            <div className="lp-preview-head">
              <span className="lp-preview-dot" />
              <span className="lp-preview-title">Signals · last 60s</span>
              <span className="lp-preview-meter">12 · LIVE</span>
            </div>
            <ul className="lp-feed">
              <SignalRow side="buy" sym="BTC-USDT" type="Sweep buy" ago="2s" price="68 412" delta="+ $4.2M" tag="True L2" />
              <SignalRow side="sell" sym="ES1!" type="CVD divergence" ago="8s" price="5 612.25" delta="− 8.4×" tag="Inferred" />
              <SignalRow side="buy" sym="ETH-USDT" type="Whale absorb" ago="14s" price="3 718.10" delta="+ $1.9M" tag="True L2" />
              <SignalRow side="warn" sym="EUR/USD" type="Regime flip → trend" ago="29s" price="1.0742" delta="HMM" tag="Inferred" />
              <SignalRow side="sell" sym="NQ1!" type="Imbalance 11×" ago="41s" price="20 184.50" delta="− $7.1M" tag="Inferred" />
              <SignalRow side="buy" sym="SOL-USDT" type="Large print" ago="58s" price="187.42" delta="+ $612K" tag="True L2" />
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

      {/* ── FEATURES ────────────────────────────────────────────────────────── */}
      <section id="features" className="lp-section">
        <div className="lp-container">
          <SectionHeader
            kicker="Why traders switch"
            title="Order flow that explains itself."
            sub="Six instruments. One unified tape. AI that tells you *why* a signal fired — not just that it did."
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
            <Market name="Crypto" tag="True L2" tagKind="ok" venues="Binance · OKX · Bybit · Coinbase · Kraken" />
            <Market name="US Stocks" tag="Inferred" tagKind="warn" venues="NYSE · NASDAQ via Alpaca" />
            <Market name="US Futures" tag="Inferred" tagKind="warn" venues="CME · CBOT · NYMEX (ES · NQ · CL · GC)" />
            <Market name="Forex" tag="Inferred" tagKind="warn" venues="Majors + minors via OANDA" />
            <Market name="Commodities" tag="Inferred" tagKind="warn" venues="Gold · Silver · Oil · Nat Gas · Copper" />
            <Market name="Resources" tag="Inferred" tagKind="warn" venues="Wheat · Corn · Soy · Coffee · Sugar" />
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
        <div className="lp-container lp-cta-inner">
          <h2 className="lp-h2">Stop trading from candle charts.</h2>
          <p className="lp-cta-sub">
            Real order flow, AI-explained, free to start. Three minutes to your first signal.
          </p>
          <Link href="/register" className="lp-btn-primary lp-btn-lg">
            Create your account <ArrowRight size={16} />
          </Link>
          <p className="lp-cta-fine">No credit card. No commitment. Cancel anytime.</p>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <div className="lp-footer-brand">
            <div className="lp-logo">
              <span className="lp-logo-mark">◆</span>
              <span>OrderFlow</span>
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
          <span>© {new Date().getFullYear()} OrderFlow Analytics. Not investment advice.</span>
          <span className="lp-footer-meta"><Clock size={11} /> Servers in EU · status: <span className="lp-ok">operational</span></span>
        </div>
      </footer>

      {/* ── STYLES ──────────────────────────────────────────────────────────── */}
      <style>{LP_CSS}</style>
    </main>
  );
}

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
      <div className="lp-kicker">{kicker}</div>
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
  .lp-root { background:#0a0a0b; color:#e6e8ee; min-height:100vh; }
  .lp-container { max-width:1180px; margin:0 auto; padding:0 24px; }

  /* NAV */
  .lp-nav { position:sticky; top:0; z-index:50; backdrop-filter:blur(14px); background:rgba(10,10,11,0.72); border-bottom:1px solid #1f2128; }
  .lp-nav-inner { max-width:1180px; margin:0 auto; padding:14px 24px; display:flex; align-items:center; gap:32px; }
  .lp-logo { display:flex; align-items:center; gap:8px; font-weight:600; font-size:15px; text-decoration:none; color:#e6e8ee; }
  .lp-logo-mark { color:#22d3ee; font-size:18px; line-height:1; transform:translateY(-1px); }
  .lp-nav-links { display:flex; gap:24px; flex:1; }
  .lp-nav-links a { color:#8a8f9b; font-size:13px; text-decoration:none; transition:color 150ms; }
  .lp-nav-links a:hover { color:#e6e8ee; }
  .lp-nav-actions { display:flex; align-items:center; gap:14px; }
  .lp-link-quiet { color:#8a8f9b; font-size:13px; text-decoration:none; transition:color 150ms; }
  .lp-link-quiet:hover { color:#e6e8ee; }

  /* BUTTONS */
  .lp-btn-primary, .lp-btn-ghost { display:inline-flex; align-items:center; gap:8px; border-radius:8px; font-weight:600; font-size:13px; text-decoration:none; transition:transform 120ms, background 150ms, border-color 150ms; cursor:pointer; border:1px solid transparent; }
  .lp-btn-primary { background:#22d3ee; color:#0a0a0b; padding:9px 16px; box-shadow:0 0 0 0 rgba(34,211,238,0.0); }
  .lp-btn-primary:hover { transform:translateY(-1px); box-shadow:0 8px 24px -8px rgba(34,211,238,0.5); }
  .lp-btn-ghost { background:transparent; color:#e6e8ee; padding:9px 16px; border-color:#1f2128; }
  .lp-btn-ghost:hover { border-color:#2a2d36; background:#13141a; }
  .lp-btn-sm { padding:7px 12px; font-size:12px; }
  .lp-btn-lg { padding:13px 22px; font-size:14px; }
  .lp-btn-block { width:100%; justify-content:center; padding:12px 16px; }

  /* HERO */
  .lp-hero { position:relative; padding:64px 0 56px; overflow:hidden; }
  .lp-hero-orb { position:absolute; border-radius:50%; filter:blur(80px); opacity:0.25; pointer-events:none; }
  .lp-hero-orb-1 { top:-120px; left:-100px; width:480px; height:480px; background:#22d3ee; }
  .lp-hero-orb-2 { top:120px; right:-160px; width:520px; height:520px; background:#7c3aed; opacity:0.18; }
  .lp-hero-inner { position:relative; display:grid; grid-template-columns:1.1fr 0.9fr; gap:56px; align-items:center; }
  @media (max-width: 960px) { .lp-hero-inner { grid-template-columns:1fr; gap:40px; } }

  .lp-eyebrow { display:inline-flex; align-items:center; gap:8px; background:rgba(34,211,238,0.08); border:1px solid rgba(34,211,238,0.25); color:#22d3ee; padding:6px 12px; border-radius:99px; font-size:12px; font-weight:500; margin-bottom:24px; }
  .lp-pulse { display:inline-block; width:7px; height:7px; border-radius:50%; background:#22d3ee; box-shadow:0 0 8px #22d3ee; animation:lp-pulse 1.4s ease-in-out infinite; }
  @keyframes lp-pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }

  .lp-h1 { font-size:54px; line-height:1.05; letter-spacing:-0.02em; font-weight:700; margin-bottom:20px; }
  @media (max-width: 720px) { .lp-h1 { font-size:38px; } }
  .lp-accent-buy { color:#22d3ee; background:linear-gradient(180deg, #22d3ee 0%, #67e8f9 100%); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }

  .lp-sub { color:#8a8f9b; font-size:16px; line-height:1.6; max-width:560px; margin-bottom:28px; }
  .lp-hero-cta { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:24px; }

  .lp-hero-trust { list-style:none; display:flex; gap:20px; flex-wrap:wrap; color:#5a5f6a; font-size:12px; }
  .lp-hero-trust li { display:flex; align-items:center; gap:6px; }

  /* HERO PREVIEW */
  .lp-hero-preview { background:#13141a; border:1px solid #1f2128; border-radius:12px; padding:18px; box-shadow:0 24px 56px -16px rgba(0,0,0,0.6); }
  .lp-preview-head { display:flex; align-items:center; gap:10px; padding-bottom:14px; border-bottom:1px solid #1f2128; margin-bottom:10px; }
  .lp-preview-dot { width:8px; height:8px; border-radius:50%; background:#22c55e; box-shadow:0 0 6px #22c55e; animation:lp-pulse 1.6s infinite; }
  .lp-preview-title { font-size:12px; color:#8a8f9b; flex:1; }
  .lp-preview-meter { font-family:'JetBrains Mono', monospace; font-size:11px; color:#22c55e; }

  .lp-feed { list-style:none; }
  .lp-row { display:grid; grid-template-columns:3px 84px 1fr 84px 80px 64px 40px; align-items:center; gap:10px; padding:9px 8px; border-radius:6px; font-size:12px; transition:background 150ms; }
  .lp-row:hover { background:#181a21; }
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

  .lp-preview-foot { display:flex; align-items:center; gap:6px; padding-top:12px; margin-top:8px; border-top:1px solid #1f2128; color:#5a5f6a; font-size:11px; }

  /* STATS */
  .lp-stats { margin-top:64px; display:grid; grid-template-columns:repeat(4, 1fr); gap:24px; padding:24px 0; border-top:1px solid #1f2128; border-bottom:1px solid #1f2128; }
  @media (max-width: 720px) { .lp-stats { grid-template-columns:repeat(2, 1fr); } }
  .lp-stat { text-align:center; }
  .lp-stat-n { font-size:24px; font-weight:600; color:#22d3ee; letter-spacing:-0.01em; }
  .lp-stat-l { color:#8a8f9b; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; margin-top:4px; }

  /* SECTIONS */
  .lp-section { padding:88px 0; }
  .lp-section-alt { background:#0c0c0d; border-top:1px solid #1f2128; border-bottom:1px solid #1f2128; }
  .lp-shead { text-align:center; max-width:680px; margin:0 auto 56px; }
  .lp-kicker { color:#22d3ee; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:14px; }
  .lp-h2 { font-size:38px; line-height:1.15; letter-spacing:-0.02em; font-weight:600; margin-bottom:14px; }
  @media (max-width: 720px) { .lp-h2 { font-size:28px; } }
  .lp-shead-sub { color:#8a8f9b; font-size:15px; line-height:1.6; }

  /* FEATURES */
  .lp-features { display:grid; grid-template-columns:repeat(3, 1fr); gap:20px; }
  @media (max-width: 960px) { .lp-features { grid-template-columns:repeat(2, 1fr); } }
  @media (max-width: 640px) { .lp-features { grid-template-columns:1fr; } }
  .lp-feature { background:#13141a; border:1px solid #1f2128; border-radius:12px; padding:24px; transition:border-color 200ms, transform 200ms; }
  .lp-feature:hover { border-color:#2a2d36; transform:translateY(-2px); }
  .lp-feature-icon { display:inline-flex; align-items:center; justify-content:center; width:40px; height:40px; border-radius:8px; margin-bottom:16px; }
  .lp-feature-buy .lp-feature-icon { background:rgba(34,211,238,0.1); color:#22d3ee; }
  .lp-feature-sell .lp-feature-icon { background:rgba(249,115,102,0.1); color:#f97366; }
  .lp-feature-warn .lp-feature-icon { background:rgba(251,191,36,0.1); color:#fbbf24; }
  .lp-feature-info .lp-feature-icon { background:rgba(96,165,250,0.1); color:#60a5fa; }
  .lp-h3 { font-size:17px; font-weight:600; margin-bottom:8px; }
  .lp-feature p, .lp-step p, .lp-market p { color:#8a8f9b; font-size:13px; line-height:1.6; }

  /* STEPS */
  .lp-steps { display:grid; grid-template-columns:repeat(3, 1fr); gap:20px; }
  @media (max-width: 720px) { .lp-steps { grid-template-columns:1fr; } }
  .lp-step { background:#13141a; border:1px solid #1f2128; border-radius:12px; padding:24px; position:relative; }
  .lp-step-head { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
  .lp-step-num { color:#22d3ee; font-size:20px; font-weight:700; }
  .lp-step-icon { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:6px; background:rgba(34,211,238,0.1); color:#22d3ee; }

  /* MARKETS */
  .lp-markets { display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; }
  @media (max-width: 880px) { .lp-markets { grid-template-columns:repeat(2, 1fr); } }
  @media (max-width: 540px) { .lp-markets { grid-template-columns:1fr; } }
  .lp-market { background:#13141a; border:1px solid #1f2128; border-radius:10px; padding:20px; }
  .lp-market header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
  .lp-tag { font-size:10px; padding:3px 8px; border-radius:4px; text-transform:uppercase; letter-spacing:0.04em; font-weight:600; }
  .lp-tag-ok { background:rgba(34,197,94,0.12); color:#22c55e; }
  .lp-tag-warn { background:rgba(251,191,36,0.12); color:#fbbf24; }
  .lp-fine { margin-top:24px; color:#5a5f6a; font-size:12px; display:flex; align-items:center; gap:6px; justify-content:center; }

  /* PRICING */
  .lp-pricing { display:grid; grid-template-columns:repeat(3, 1fr); gap:20px; align-items:stretch; }
  @media (max-width: 880px) { .lp-pricing { grid-template-columns:1fr; } }
  .lp-price { position:relative; background:#13141a; border:1px solid #1f2128; border-radius:14px; padding:28px; display:flex; flex-direction:column; }
  .lp-price-rec { border-color:#22d3ee; box-shadow:0 0 0 1px #22d3ee, 0 20px 56px -20px rgba(34,211,238,0.35); transform:translateY(-6px); }
  .lp-price-badge { position:absolute; top:-12px; left:50%; transform:translateX(-50%); background:#22d3ee; color:#0a0a0b; font-size:11px; font-weight:700; padding:4px 10px; border-radius:99px; text-transform:uppercase; letter-spacing:0.06em; }
  .lp-price-name { color:#8a8f9b; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:10px; }
  .lp-price-amount { display:flex; align-items:baseline; gap:6px; margin-bottom:24px; }
  .lp-price-num { font-size:42px; font-weight:700; letter-spacing:-0.02em; color:#e6e8ee; }
  .lp-price-cadence { color:#8a8f9b; font-size:13px; }
  .lp-price-list { list-style:none; flex:1; margin-bottom:22px; }
  .lp-price-list li { display:flex; align-items:flex-start; gap:8px; color:#e6e8ee; font-size:13px; padding:7px 0; border-bottom:1px solid rgba(31,33,40,0.5); }
  .lp-price-list li:last-child { border-bottom:0; }
  .lp-price-list li svg { color:#22d3ee; flex-shrink:0; margin-top:4px; }

  /* FAQ */
  .lp-faq-wrap { max-width:760px; }
  .lp-faq { display:flex; flex-direction:column; gap:10px; }
  .lp-faq-item { background:#13141a; border:1px solid #1f2128; border-radius:10px; padding:16px 20px; transition:border-color 200ms; }
  .lp-faq-item[open] { border-color:#2a2d36; }
  .lp-faq-item summary { cursor:pointer; list-style:none; display:flex; justify-content:space-between; align-items:center; font-size:14px; font-weight:500; }
  .lp-faq-item summary::-webkit-details-marker { display:none; }
  .lp-faq-item summary svg { color:#8a8f9b; transition:transform 200ms; }
  .lp-faq-item[open] summary svg { transform:rotate(90deg); color:#22d3ee; }
  .lp-faq-item p { color:#8a8f9b; font-size:13px; line-height:1.7; padding-top:12px; margin-top:12px; border-top:1px solid #1f2128; }

  /* CTA */
  .lp-cta { padding:96px 0; background:radial-gradient(ellipse at center, rgba(34,211,238,0.08), transparent 60%), #0a0a0b; border-top:1px solid #1f2128; }
  .lp-cta-inner { text-align:center; max-width:640px; }
  .lp-cta-sub { color:#8a8f9b; font-size:16px; margin:14px 0 28px; line-height:1.6; }
  .lp-cta-fine { color:#5a5f6a; font-size:12px; margin-top:14px; }

  /* FOOTER */
  .lp-footer { background:#0c0c0d; border-top:1px solid #1f2128; padding:48px 0 24px; }
  .lp-footer-inner { display:grid; grid-template-columns:1.4fr 2fr; gap:48px; padding-bottom:32px; border-bottom:1px solid #1f2128; }
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
`;
