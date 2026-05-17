import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

export interface TapeNarratorInput {
  instrument:     string;
  exchange:       string;
  dataQuality:    'true_l2' | 'inferred';
  recentTrades:   Array<{ side: 'buy' | 'sell'; price: number; size: number; notional: number; ts: number }>;
  cvd:            number;
  cvdDelta:       number;
  imbalanceRatio: number;
  regime?:        string;
  sweepsDetected: number;
}

export function buildTapeNarratorPrompt(input: TapeNarratorInput): MessageParam[] {
  const {
    instrument, exchange, dataQuality, recentTrades,
    cvd, cvdDelta, imbalanceRatio, regime, sweepsDetected,
  } = input;

  const tradesSummary = recentTrades.slice(-10).map(t =>
    `${t.side.toUpperCase()} ${t.size} @ ${t.price} ($${(t.notional / 1000).toFixed(1)}K)`
  ).join('\n');

  const qualityLabel = dataQuality === 'true_l2' ? 'True L2' : 'Inferred';

  return [
    {
      role: 'user',
      content: `You are narrating live order flow for ${instrument} on ${exchange} [${qualityLabel} data].

Current market state:
- CVD: ${cvd > 0 ? '+' : ''}${cvd.toFixed(0)} (Δ last bar: ${cvdDelta > 0 ? '+' : ''}${cvdDelta.toFixed(0)})
- Bid/Ask Imbalance Ratio: ${imbalanceRatio.toFixed(2)}×${imbalanceRatio > 1 ? ' (bid-dominant)' : ' (ask-dominant)'}
${regime ? `- Market Regime: ${regime}` : ''}
${sweepsDetected > 0 ? `- Sweeps detected (last 60s): ${sweepsDetected}` : ''}

Recent tape (last 10 prints):
${tradesSummary}

Write a 2–3 sentence live narration of what the tape is telling you RIGHT NOW. Be concise, direct, and specific to the numbers above. Mention the dominant side, CVD direction, and any notable prints or sweeps. Do not use hedging phrases like "might" or "could". End with a single-sentence characterisation of current market microstructure (e.g. "Aggressive buyer accumulation", "Passive seller absorption", "Two-sided chop").

⚠️ Not investment advice.`,
    },
  ];
}
