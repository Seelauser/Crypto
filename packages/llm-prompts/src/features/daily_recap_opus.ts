export interface RecapInput {
  date: string;
  watchlistInstruments: string[];
  topSignals: Array<{
    instrument: string;
    triggerType: string;
    price: number;
    cvd: number;
    ts: number;
  }>;
  regimeChanges: Array<{
    instrument: string;
    from: string;
    to: string;
    ts: number;
  }>;
  topSweeps: Array<{
    instrument: string;
    side: string;
    notionalUsd: number;
    ts: number;
  }>;
  marketContext?: string;
}

export function buildDailyRecapPrompt(input: RecapInput): string {
  return `Generate the Daily Order Flow Recap for ${input.date}.

## Watched Instruments
${input.watchlistInstruments.join(', ')}

## Notable Signals (${input.topSignals.length} total)
${input.topSignals.slice(0, 5).map(s =>
  `- ${s.instrument} @ ${s.price} [${s.triggerType}] CVD ${s.cvd > 0 ? '+' : ''}${s.cvd.toFixed(0)} at ${new Date(s.ts).toUTCString()}`
).join('\n')}

## Regime Transitions
${input.regimeChanges.length > 0
  ? input.regimeChanges.map(r => `- ${r.instrument}: ${r.from} → ${r.to} at ${new Date(r.ts).toUTCString()}`).join('\n')
  : 'No regime transitions detected.'}

## Top Sweeps
${input.topSweeps.length > 0
  ? input.topSweeps.slice(0, 3).map(s => `- ${s.instrument}: ${s.side} sweep $${(s.notionalUsd / 1000).toFixed(0)}K at ${new Date(s.ts).toUTCString()}`).join('\n')
  : 'No major sweeps.'}

${input.marketContext ? `## Market Context\n${input.marketContext}` : ''}

Write a 250–300 word recap covering: (1) the most significant order flow event of the session, (2) regime shifts and what they imply, (3) instruments showing notable accumulation or distribution, (4) one forward-looking note on what to watch in the next session. Use precise numbers. Not investment advice.`;
}
