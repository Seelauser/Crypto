import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

export interface CorrelationNarrationInput {
  instrumentA:      string;
  instrumentB:      string;
  timeframe:        string;
  pearsonR:         number;
  isDivergent:      boolean;
  cvdA:             number;
  cvdB:             number;
  deltaA:           number;
  deltaB:           number;
  priceChangeA:     number;
  priceChangeB:     number;
}

export function buildCorrelationNarrationPrompt(input: CorrelationNarrationInput): MessageParam[] {
  const {
    instrumentA, instrumentB, timeframe, pearsonR,
    isDivergent, cvdA, cvdB, deltaA, deltaB,
    priceChangeA, priceChangeB,
  } = input;

  const corrStrength = Math.abs(pearsonR) >= 0.7 ? 'strongly' : Math.abs(pearsonR) >= 0.35 ? 'moderately' : 'weakly';
  const corrDirection = pearsonR >= 0 ? 'positively' : 'negatively';

  return [
    {
      role: 'user',
      content: `Narrate the order flow correlation between ${instrumentA} and ${instrumentB} over the last ${timeframe}.

Metrics:
- Pearson r: ${pearsonR.toFixed(3)} (${corrStrength} ${corrDirection} correlated)
- ${instrumentA}: CVD ${cvdA > 0 ? '+' : ''}${cvdA.toFixed(0)}, Delta ${deltaA > 0 ? '+' : ''}${deltaA.toFixed(0)}, Price ${priceChangeA > 0 ? '+' : ''}${priceChangeA.toFixed(2)}%
- ${instrumentB}: CVD ${cvdB > 0 ? '+' : ''}${cvdB.toFixed(0)}, Delta ${deltaB > 0 ? '+' : ''}${deltaB.toFixed(0)}, Price ${priceChangeB > 0 ? '+' : ''}${priceChangeB.toFixed(2)}%
${isDivergent ? '⚠️ DIVERGENCE DETECTED: These instruments are moving independently despite typical correlation.' : ''}

Write exactly 2 sentences: (1) what the correlation and CVD data suggest about capital flows between these assets, (2) what a trader should watch for next. Be specific. No hedging.

⚠️ Not investment advice.`,
    },
  ];
}
