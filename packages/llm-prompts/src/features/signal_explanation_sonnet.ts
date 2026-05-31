import type { SignalSnapshot } from '@orderflow/types';

export function buildSignalExplanationPrompt(snapshot: SignalSnapshot, setupName: string): string {
  return `A signal triggered for "${setupName}" on ${snapshot.instrument}.

## Trigger Data
- Trigger type: ${snapshot.triggerType}
- Timestamp: ${new Date(snapshot.ts).toISOString()}
- Price: ${snapshot.price}
- CVD: ${snapshot.cvd > 0 ? '+' : ''}${snapshot.cvd.toFixed(0)}
- Delta (last bar): ${snapshot.delta > 0 ? '+' : ''}${snapshot.delta.toFixed(0)}
- Bid volume: ${snapshot.bidVolume.toFixed(0)}
- Ask volume: ${snapshot.askVolume.toFixed(0)}
- Imbalance ratio: ${snapshot.imbalanceRatio.toFixed(2)}×
- Trigger values: ${JSON.stringify(snapshot.triggerValues)}
${snapshot.recentSweep ? `- Recent sweep: ${snapshot.recentSweep.side} sweep, $${(snapshot.recentSweep.notionalUsd / 1000).toFixed(0)}K notional, ${snapshot.recentSweep.levelsConsumed} levels consumed` : ''}
${snapshot.recentAbsorption ? `- Recent absorption: ${snapshot.recentAbsorption.side} side absorbed ${snapshot.recentAbsorption.volumeAbsorbed.toFixed(0)} volume at ${snapshot.recentAbsorption.priceLevel}` : ''}
${snapshot.regime ? `- Market regime: ${snapshot.regime}` : ''}
- Data quality: ${snapshot.exchange} [${snapshot.instrument.includes('USDT') || snapshot.instrument.includes('BTC') ? 'True L2' : 'Inferred'}]

Explain in 2–3 sentences why this signal triggered, what the order flow tells us about market participants, and what to watch next. End with: "Not investment advice."`;
}

// Haiku fallback — smaller context, shorter output
export function buildSignalExplanationHaikuPrompt(snapshot: SignalSnapshot, setupName: string): string {
  return `Signal: "${setupName}" on ${snapshot.instrument} @ ${snapshot.price}. Trigger: ${snapshot.triggerType}. CVD ${snapshot.cvd > 0 ? '+' : ''}${snapshot.cvd.toFixed(0)}, imbalance ${snapshot.imbalanceRatio.toFixed(1)}×. Write one sentence explaining what this order flow event means. End: "Not investment advice."`;
}
