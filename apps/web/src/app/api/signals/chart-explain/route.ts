import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import redis from '@/lib/redis';
import { callLlm } from '@orderflow/llm';
import { SYSTEM_PROMPT_CACHE_BLOCK } from '@orderflow/llm-prompts';
import { buildTierGateError } from '@/lib/limits';
import type { UserTier } from '@orderflow/types';

// AI explanation for an order-flow placement signal (rework spec §9.2).
// Tier: starter+ (Haiku for starter, Sonnet for pro). Degrades to a
// deterministic templated explanation when the LLM is unavailable so the
// tooltip is always useful — it upgrades to real AI once ANTHROPIC_API_KEY is set.

interface Body {
  instrument: string;
  direction:  'long' | 'short' | 'neutral';
  confidence: number;
  triggers:   string[];
  cvd:        number;
  regime?:    string | null;
  price?:     number | null;
}

function fallbackExplanation(b: Body): string {
  const flow   = b.cvd >= 0 ? 'net buying pressure' : 'net selling pressure';
  const trig   = b.triggers?.length ? b.triggers.map(t => t.replace(/_/g, ' ')).join(', ') : 'order-flow context';
  const stance =
    b.direction === 'long'  ? 'absorbing supply and building positions' :
    b.direction === 'short' ? 'distributing into strength' :
                              'waiting for the book to resolve';
  const read =
    b.direction === 'long'  ? 'accumulation' :
    b.direction === 'short' ? 'distribution' : 'balance';
  return `${b.instrument} is showing ${flow} with ${trig}, consistent with ${read} at this level (confidence ${b.confidence}%). Institutional desks are likely ${stance} here. Not investment advice.`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const tier   = ((session.user as any).tier ?? 'free') as UserTier;

  // Placement markers + their explanations are a Starter+ feature.
  if (tier === 'free') {
    return NextResponse.json(buildTierGateError('chart_explain', 'placement', 'starter'), { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.instrument || !body?.direction) {
    return NextResponse.json({ error: 'Missing instrument/direction' }, { status: 400 });
  }
  body.triggers = Array.isArray(body.triggers) ? body.triggers : [];
  body.confidence = Number(body.confidence) || 0;
  body.cvd = Number(body.cvd) || 0;

  // Dedupe rapid hovers: cache by instrument + direction + confidence bucket.
  const cacheKey = `chart_explain:${body.instrument}:${body.direction}:${Math.floor(body.confidence / 10)}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return NextResponse.json({ ...parsed, cached: true });
    }
  } catch { /* cache miss is fine */ }

  const prompt =
    `Market: ${body.instrument}${body.price ? ` at ${body.price}` : ''}\n` +
    `Placement read: ${body.direction.toUpperCase()} (confidence ${body.confidence}%)\n` +
    `Order-flow triggers: ${body.triggers.join(', ') || 'none'}\n` +
    `CVD: ${body.cvd} (${body.cvd >= 0 ? 'net buying' : 'net selling'})\n` +
    `Regime: ${body.regime ?? 'n/a'}\n\n` +
    `In two sentences, explain why this is a potential ${body.direction} placement zone and ` +
    `what institutional traders are likely doing here. End with: Not investment advice.`;

  let explanation: string;
  let model: string | null = null;
  let aiPowered = false;

  try {
    const result = await callLlm({
      db,
      feature:      'signal_explanation',
      userId,
      // Only Pro draws Sonnet against the ledger; Starter takes the Haiku quota path.
      userTier:     tier === 'pro' ? 'premium' : 'free',
      maxTokens:    220,
      systemBlocks: [SYSTEM_PROMPT_CACHE_BLOCK],
      messages:     [{ role: 'user', content: prompt }],
    });
    explanation = result.text?.trim() || fallbackExplanation(body);
    model       = result.model;
    aiPowered   = true;
  } catch {
    // No/invalid ANTHROPIC_API_KEY, or LLM error — serve the deterministic read.
    explanation = fallbackExplanation(body);
  }

  const payload = { explanation, model, aiPowered };
  try { await redis.set(cacheKey, JSON.stringify(payload), 'EX', 90); } catch { /* non-fatal */ }

  return NextResponse.json({ ...payload, cached: false });
}
