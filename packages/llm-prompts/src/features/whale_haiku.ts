import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

// ─── Whale Label (Haiku) ──────────────────────────────────────────────────────

export interface WhaleLabelInput {
  instrument:     string;
  side:           'buy' | 'sell';
  price:          number;
  size:           number;
  notional:       number;
  isSweep:        boolean;
  levelsHit?:     number;
  cvdAtTime:      number;
  imbalanceRatio: number;
}

export function buildWhaleLabelPrompt(input: WhaleLabelInput): MessageParam[] {
  const { instrument, side, price, size, notional, isSweep, levelsHit, cvdAtTime, imbalanceRatio } = input;

  return [
    {
      role: 'user',
      content: `Classify this large order flow event for ${instrument}.

Event:
- Side: ${side.toUpperCase()}
- Price: ${price}
- Size: ${size} (Notional: $${(notional / 1000).toFixed(1)}K)
- Type: ${isSweep ? `Sweep (${levelsHit ?? '?'} levels hit)` : 'Single Large Print'}
- CVD at time: ${cvdAtTime > 0 ? '+' : ''}${cvdAtTime.toFixed(0)}
- Book imbalance: ${imbalanceRatio.toFixed(2)}×

Respond with ONLY a JSON object (no markdown, no explanation):
{"label": "<one of: institutional_buy|institutional_sell|stop_hunt|iceberg_buyer|iceberg_seller|momentum_chase|unknown>", "confidence": <0.0-1.0>}`,
    },
  ];
}

// ─── Whale Forensic (Opus) ────────────────────────────────────────────────────

export interface WhaleForensicInput {
  instrument:   string;
  exchange:     string;
  dataQuality:  'true_l2' | 'inferred';
  trade:        { side: 'buy' | 'sell'; price: number; size: number; notional: number; ts: number };
  label:        string;
  confidence:   number;
  orderbookBefore: { bids: Array<[number, number]>; asks: Array<[number, number]> };
  cvdHistory:   number[];
  regime?:      string;
}

export function buildWhaleForensicPrompt(input: WhaleForensicInput): MessageParam[] {
  const { instrument, exchange, dataQuality, trade, label, confidence, orderbookBefore, cvdHistory, regime } = input;

  const bidDepth  = orderbookBefore.bids.slice(0, 5).map(([p, s]) => `${p}: ${s}`).join(', ');
  const askDepth  = orderbookBefore.asks.slice(0, 5).map(([p, s]) => `${p}: ${s}`).join(', ');
  const cvdTrend  = cvdHistory.slice(-5).join(' → ');
  const qualityLabel = dataQuality === 'true_l2' ? 'True L2' : 'Inferred';

  return [
    {
      role: 'user',
      content: `Conduct a forensic analysis of this significant order flow event on ${instrument} (${exchange}, ${qualityLabel}).

EVENT
- Side: ${trade.side.toUpperCase()}
- Price: ${trade.price}  |  Size: ${trade.size}  |  Notional: $${(trade.notional / 1000).toFixed(1)}K
- Timestamp: ${new Date(trade.ts).toISOString()}
- AI label: ${label} (confidence ${(confidence * 100).toFixed(0)}%)
${regime ? `- Regime: ${regime}` : ''}

ORDERBOOK (before event, top 5 levels)
Bids: ${bidDepth}
Asks: ${askDepth}

CVD TREND (last 5 values): ${cvdTrend}

Write a 1-paragraph (4–6 sentences) forensic analysis. Explain what likely happened, who the likely actor is (institutional, algorithmic, retail), why this level was chosen, and what the implication is for near-term price action. Be specific and cite the numbers.

⚠️ Not investment advice.`,
    },
  ];
}
