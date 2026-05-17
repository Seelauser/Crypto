import type { ScanResultRow, ScanCondition } from '@orderflow/types';

export function buildScanSynthesisPrompt(
  results: ScanResultRow[],
  conditions: ScanCondition,
  scope: string
): string {
  const topResults = results.slice(0, 10);
  return `Cross-market order flow scan completed. Scope: ${scope}.

## Scan Conditions
${conditions.logic}: ${conditions.filters.map(f => `${f.field} ${f.op} ${f.value}`).join(`, ${conditions.logic} `)}

## Top ${topResults.length} Results
${topResults.map(r =>
  `${r.instrument} (${r.market}, ${r.exchange}) [${r.dataQuality === 'true_l2' ? 'True L2' : 'Inferred'}]
   CVD: ${r.cvd > 0 ? '+' : ''}${r.cvd.toFixed(0)} | Delta: ${r.delta > 0 ? '+' : ''}${r.delta.toFixed(0)} | Imbalance: ${r.imbalanceRatio.toFixed(2)}× | Price: ${r.lastPrice} | 24h Vol: ${(r.volume24h / 1e6).toFixed(1)}M`
).join('\n\n')}

Total matches: ${results.length}

Synthesize the scan results in 3–4 sentences: Which instruments show the strongest flow confluence? Are there cross-market themes (e.g., USD strength showing across FX + commodities)? Which single result is the highest-conviction setup and why? Not investment advice.`;
}
