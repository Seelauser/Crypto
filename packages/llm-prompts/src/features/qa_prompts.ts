import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

// ─── QA Retrieval (Haiku) ─────────────────────────────────────────────────────

export interface QaRetrievalInput {
  question:      string;
  instruments:   string[];
  signalHistory: Array<{
    instrument:  string;
    triggerType: string;
    createdAt:   string;
    explanation: string;
  }>;
  recentScans: Array<{
    scope:       string;
    filters:     string;
    resultCount: number;
    createdAt:   string;
  }>;
}

export function buildQaRetrievalPrompt(input: QaRetrievalInput): MessageParam[] {
  const { question, instruments, signalHistory, recentScans } = input;

  const sigHistory = signalHistory.slice(-10).map(s =>
    `[${s.createdAt}] ${s.instrument} — ${s.triggerType}: ${s.explanation.slice(0, 80)}...`
  ).join('\n');

  const scanHistory = recentScans.slice(-5).map(s =>
    `[${s.createdAt}] ${s.scope} | ${s.filters} → ${s.resultCount} results`
  ).join('\n');

  return [
    {
      role: 'user',
      content: `You are a data retrieval assistant for an order flow analytics platform.

USER QUESTION: "${question}"

AVAILABLE DATA
Watched instruments: ${instruments.join(', ')}

Recent signal events (last 10):
${sigHistory || 'No recent signals.'}

Recent scans (last 5):
${scanHistory || 'No recent scans.'}

Identify which parts of this data are relevant to answering the question. Return ONLY a JSON object:
{
  "relevantSignals": [<indices 0-based into signal history>],
  "relevantScans": [<indices 0-based into scan history>],
  "needsLiveData": <true|false>,
  "dataGaps": "<describe any data missing to fully answer>"
}`,
    },
  ];
}

// ─── QA Synthesis (Opus) ──────────────────────────────────────────────────────

export interface QaSynthesisInput {
  question:       string;
  retrievedData:  {
    signals:      Array<{ instrument: string; triggerType: string; createdAt: string; explanation: string }>;
    scans:        Array<{ scope: string; filters: string; resultCount: number; createdAt: string }>;
    liveSnapshot: Record<string, { cvd: number; delta: number; imbalanceRatio: number; lastPrice: number }> | null;
    dataGaps:     string;
  };
}

export function buildQaSynthesisPrompt(input: QaSynthesisInput): MessageParam[] {
  const { question, retrievedData } = input;
  const { signals, scans, liveSnapshot, dataGaps } = retrievedData;

  const signalContext = signals.map(s =>
    `- [${s.createdAt}] ${s.instrument} ${s.triggerType}: ${s.explanation}`
  ).join('\n');

  const scanContext = scans.map(s =>
    `- [${s.createdAt}] ${s.scope} scan (${s.filters}): ${s.resultCount} matches`
  ).join('\n');

  const liveContext = liveSnapshot
    ? Object.entries(liveSnapshot).map(([inst, d]) =>
        `${inst}: price=${d.lastPrice} CVD=${d.cvd > 0 ? '+' : ''}${d.cvd.toFixed(0)} imbalance=${d.imbalanceRatio.toFixed(2)}×`
      ).join('\n')
    : 'No live snapshot available.';

  return [
    {
      role: 'user',
      content: `You are an expert order flow analyst answering a trader's question.

QUESTION: "${question}"

RELEVANT SIGNAL HISTORY:
${signalContext || 'None retrieved.'}

RELEVANT SCAN RESULTS:
${scanContext || 'None retrieved.'}

LIVE MARKET SNAPSHOT:
${liveContext}

${dataGaps ? `DATA GAPS: ${dataGaps}` : ''}

Provide a direct, specific answer to the question using only the data above. If the data is insufficient, say so clearly. Structure your answer as: (1) direct answer in 1–2 sentences, (2) supporting evidence from the data, (3) one-sentence caveat if data is incomplete.

⚠️ Not investment advice.`,
    },
  ];
}
