import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { buildTierGateError } from '@/lib/limits';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if ((session.user as any).tier !== 'pro') {
    return NextResponse.json(buildTierGateError('csv_export', 'export'), { status: 403 });
  }

  const setupId = req.nextUrl.searchParams.get('setupId');
  const since = req.nextUrl.searchParams.get('since');

  const where: Record<string, unknown> = { userId: session.user.id };
  if (setupId) where.setupId = setupId;
  if (since) where.createdAt = { gte: new Date(since) };

  const events = await db.signalEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 5000,
    include: { setup: { select: { name: true, market: true, triggerConfig: true } } },
  });

  // Build CSV
  const headers = [
    'timestamp', 'instrument', 'setup_name', 'market', 'trigger_type',
    'price', 'cvd', 'delta', 'imbalance_ratio', 'bid_volume', 'ask_volume',
    'ai_explanation', 'ai_model',
  ];

  const rows = events.map((e: typeof events[number]) => {
    const snap = e.snapshot as Record<string, unknown>;
    const setup = e.setup as { name: string; market: string; triggerConfig: { type: string } } | null;
    return [
      new Date(e.createdAt).toISOString(),
      e.instrument,
      setup?.name ?? '',
      setup?.market ?? '',
      setup?.triggerConfig?.type ?? '',
      snap?.price ?? '',
      snap?.cvd ?? '',
      snap?.delta ?? '',
      snap?.imbalanceRatio ?? '',
      snap?.bidVolume ?? '',
      snap?.askVolume ?? '',
      `"${(e.aiExplanation ?? '').replace(/"/g, '""')}"`,
      e.aiModel ?? '',
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="orderflow-signals-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
