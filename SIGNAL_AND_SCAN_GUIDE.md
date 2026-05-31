# OrderFlow Analytics — Signal & Scan Setup Guide

## 🎯 Signals (Real-Time Alerts on Order Flow Conditions)

Signals are automated order-flow detectors that trigger alerts when market conditions match your criteria.

### Step 1: Access Signals Page
- Navigate to `/signals` (sidebar → "Signals")
- Click **"+ New Signal Setup"** button (top right)

### Step 2: Signal Wizard (5 Steps)

#### **Step 1️⃣: Market Selection**
Choose which market class to monitor:
- **Crypto** — True L2 data (Binance order book via CCXT Pro)
- **Stocks** — US equities (inferred delta from price/volume)
- **Futures** — ES, NQ, etc. (inferred)
- **Forex** — EURUSD, GBPUSD, etc. (inferred)
- **Commodities** — GC, SI, CL, etc. (inferred)

**Example:** Select "Crypto"

---

#### **Step 2️⃣: Select Instruments**
Pick which symbols to monitor (e.g., BTCUSDT, ETHUSDT).

- **Free tier:** max 5 instruments per signal
- **Pro tier:** max 10 instruments per signal

**Example:** Select `BTCUSDT`, `ETHUSDT`

---

#### **Step 3️⃣: Choose Trigger Type**

| Trigger | What It Detects |
|---------|-----------------|
| **CVD Threshold Cross** | Cumulative volume delta crosses a level (e.g., CVD > +5000) |
| **Bid/Ask Imbalance** | Imbalance ratio exceeds threshold (e.g., > 2.5×) |
| **Large Print / Sweep** | Single trade or sweep above notional size (e.g., > 50 BTC) |
| **Absorption** | Price stalls while heavy volume hits one side |

**Example:** Select "CVD Threshold Cross"

**Configure Parameters:**
- `threshold`: `+5000` (trigger when CVD > 5000)
- `timeframe`: `1h` (check on 1-hour bars)

---

#### **Step 4️⃣: Notification Channels**

Choose where to receive alerts:

| Channel | Free | Pro |
|---------|------|-----|
| **Email** | ✅ | ✅ |
| **Browser Push** | ✅ | ✅ |
| **Telegram** | ❌ | ✅ |
| **Webhook** | ❌ | ✅ |

**Example:** Select "Email" + "Browser Push"

---

#### **Step 5️⃣: Review & Save**

Review all settings, give your signal a name (auto-generated if blank), and click **"Create Signal"**.

**Example name:** "BTC CVD Spike Alert"

---

### Signal Status Management

Once created, signals appear on the **Signals page** with:
- **Status badge:** Active / Paused / Archived
- **Last triggered:** When it last fired
- **Action buttons:** Pause, Archive, Edit

**Pause a signal** → It won't send alerts but won't be deleted
**Archive a signal** → Hide it; event history is preserved
**Delete** → Permanently remove (use with care)

---

## 🔍 Market Scans (One-Time Market Searches)

Scans let you find all instruments matching order-flow criteria **right now** across a market or all markets.

### Step 1: Access Scans Page
- Navigate to `/scans` (sidebar → "Scans")

### Step 2: Configure Scan

#### **Scope**
- **Single Market** (Free) — Search one market class (e.g., crypto only)
- **Cross-Market** (Pro) — Search all markets simultaneously

**Example:** Select "Single Market"

---

#### **Market Selection** (if Single Market)
Pick one market class: Crypto, Stocks, Futures, Forex, Commodities, Resources

**Example:** Select "Crypto"

---

#### **Logic**
- **AND** — All conditions must be true (stricter)
- **OR** — At least one condition must be true (broader)

**Example:** Select "AND"

---

#### **Add Filters**

Build your scan condition. Each filter is:

```
[Field] [Operator] [Value]
```

| Field | Operator | Example |
|-------|----------|---------|
| CVD | `gt` (>), `gte` (≥), `lt` (<), `lte` (≤) | CVD `gte` 10000 |
| Imbalance Ratio | `gt`, `gte`, `lt`, `lte` | Imbalance Ratio `gt` 2.0 |
| Delta | `gt`, `gte`, `lt`, `lte` | Delta `gte` 5000 |
| Trade Size (USD) | `gt`, `gte`, `lt`, `lte` | Trade Size `gt` 500000 |
| VWAP Distance % | `gt`, `gte`, `lt`, `lte` | VWAP Distance `lt` -2 |
| OI Change % | `gt`, `gte`, `lt`, `lte` | OI Change `gt` 5 |

**Example Scan Conditions:**

**Bullish momentum:** 
- CVD `gte` 15000 **AND**
- Imbalance Ratio `gt` 1.5 **AND**
- Delta `gte` 10000

**Large seller:**
- Trade Size `gt` 1000000 **AND**
- Imbalance Ratio `lt` 0.7 (ask-dominant)

---

#### **Run Scan**

Click **"Run Scan"** button.

**Free tier:** 10 scans per 24 hours
**Pro tier:** Unlimited scans

The scan returns all instruments matching your filters, sorted by matching conditions:

| Result Columns |
|---|
| **Instrument** |
| **Price** (last) |
| **CVD** (current) |
| **Imbalance Ratio** |
| **Delta** |
| **Data Quality** (True L2 or Inferred) |

---

## 📊 Example Workflows

### Workflow 1: "Alert me when BTC CVD spikes"
1. **Signals → Create Signal**
2. Market: Crypto
3. Instruments: BTCUSDT
4. Trigger: CVD Threshold Cross
5. Params: threshold = +20000, timeframe = 1h
6. Channels: Email + Push
7. Save

Now you'll get an alert the next time BTC's 1-hour CVD crosses +20K.

---

### Workflow 2: "Find all crypto with bullish imbalance right now"
1. **Scans → Run Scan**
2. Scope: Single Market
3. Market: Crypto
4. Logic: AND
5. Filters:
   - Imbalance Ratio `gt` 2.0
   - CVD `gte` 5000
   - Delta `gte` 3000
6. Click **Run Scan**

Results show all crypto pairs with strong bid-side dominance and positive momentum.

---

### Workflow 3: "Cross-market scan for large ETH-sized prints" (Pro only)
1. **Scans → Run Scan**
2. Scope: Cross-Market
3. Logic: OR
4. Filters:
   - Trade Size `gt` 1000000 **OR**
   - Imbalance Ratio `gt` 3.0
5. Click **Run Scan**

Returns all instruments across all markets with either huge individual prints or extreme imbalance.

---

## 🔐 Tier Limits

| Feature | Free | Pro |
|---------|------|-----|
| Signal setups | 3 | Unlimited |
| Instruments per setup | 5 | 10 |
| Scans per 24h | 10 | Unlimited |
| Scan scope | Single market | Cross-market |
| Trigger types | All 4 | All 4 |
| Notification channels | Email, Push | +Telegram, Webhook |

---

## 🚀 Tips

1. **Start simple** — One filter, one instrument, then expand
2. **Use AND for precision** — Catches only the best setups
3. **Use OR for breadth** — Casts a wider net, more false alerts
4. **Archive old signals** — Keeps your list clean; history is preserved
5. **Test with low thresholds** — See how often conditions trigger, then raise them
6. **Combine with Markets tab** — Run a scan, then drill into any instrument via `/markets/crypto`

---

## 🛠️ API Integration (Pro)

Once a signal fires, you can:
- Receive **emails** (via Resend)
- Receive **browser push notifications**
- Forward to **Telegram bot** (set up in Settings)
- POST to your own **webhook** (set in Settings)

To set up Telegram:
1. Go to `/settings`
2. Click "Link Telegram Bot"
3. Open the bot link in Telegram
4. Click "Start"
5. Telegram alerts now enabled

---

## 📈 Order Flow Indicators Explained

### CVD (Cumulative Volume Delta)
- **Positive CVD** = More volume on buys than sells (bullish)
- **Negative CVD** = More volume on sells than buys (bearish)
- **Rising CVD** = Momentum building

### Imbalance Ratio
- **Ratio > 1** = Bid-dominant (more buy volume at top of book)
- **Ratio < 1** = Ask-dominant (more sell volume)
- **Ratio > 2** = Extreme imbalance

### Delta
- **+Delta** = More buys than sells on each bar
- **-Delta** = More sells than buys
- **Consistent +Delta** = Sustained accumulation

### Large Print / Sweep
- **Print** = Single trade (market order filled)
- **Sweep** = Multiple levels hit in one direction (aggressive)
- **Notional** = Size × price (e.g., 50 BTC at $68K = $3.4M notional)

---

**Questions?** Check the `/markets/[asset]` page to see live data and test your signal/scan logic before saving.
