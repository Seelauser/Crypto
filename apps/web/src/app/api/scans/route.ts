import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getLimits, buildTierGateError } from '@/lib/limits';
import { z } from 'zod';
import type { UserTier } from '@orderflow/types';

const scanSchema = z.object({
  scope: z.enum(['single_market', 'cross_market']),
  market: z.string().optional(),
  conditions: z.object({
    logic: z.enum(['AND', 'OR']),
    filters: z.array(z.object({
      field: z.string(),
      op: z.enum(['gt', 'lt', 'gte', 'lte', 'eq']),
      value: z.number(),
    })),
  }),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tier = (session.user.tier ?? 'free') as UserTier;
  const limits = getLimits(tier);

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const parsed = scanSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });

  const { scope, market, conditions } = parsed.data;

  if (scope === 'cross_market' && limits.scan_scope === 'single_market') {
    return NextResponse.json(buildTierGateError('scan_scope', 'cross_market_scan'), { status: 403 });
  }

  // For this MVP API route we return simulated results immediately
  // In production this publishes to BullMQ and polls for results
  const mockResults = generateMockResults(market ?? 'crypto', scope, conditions);

  const scan = await db.scan.create({
    data: {
      userId: session.user.id,
      scope,
      filterConfig: conditions,
      results: mockResults,
      market: market ?? null,
    },
  });

  return NextResponse.json({ scanId: scan.id, results: mockResults, status: 'complete' }, { status: 201 });
}

type ScanConditions = z.infer<typeof scanSchema>['conditions'];

function generateMockResults(market: string, scope: string, conditions: ScanConditions) {
  const cryptoSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
  const stockSymbols = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN'];
  const symbols = market === 'crypto' ? cryptoSymbols : stockSymbols;

  return symbols.map(sym => ({
    instrument: sym,
    exchange: market === 'crypto' ? 'binance' : 'alpaca',
    market,
    cvd: (Math.random() - 0.4) * 2_000_000,
    delta: (Math.random() - 0.45) * 500_000,
    imbalanceRatio: 1 + Math.random() * 4,
    lastPrice: Math.random() * 50000 + 100,
    priceChange24h: (Math.random() - 0.5) * 10,
    volume24h: Math.random() * 1e9,
    dataQuality: market === 'crypto' ? 'true_l2' : 'inferred',
    matchedConditions: conditions.filters.map(f => `${f.field} ${f.op} ${f.value}`),
  }));
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tier = (session.user.tier ?? 'free') as UserTier;
  const limits = getLimits(tier);
  const since = limits.history_days === Infinity
    ? undefined
    : new Date(Date.now() - limits.history_days * 24 * 60 * 60 * 1000);

  const scans = await db.scan.findMany({
    where: {
      userId: session.user.id,
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, scope: true, market: true, createdAt: true, filterConfig: true },
  });

  return NextResponse.json(scans);
}
