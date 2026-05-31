import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getLimits } from '@/lib/limits';
import type { UserTier } from '@orderflow/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const tier = ((session.user as any).tier ?? 'free') as UserTier;
  const limits = getLimits(tier);

  const setup = await db.signalSetup.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!setup) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const since = limits.history_days === Infinity
    ? undefined
    : new Date(Date.now() - limits.history_days * 24 * 60 * 60 * 1000);

  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1');
  const pageSize = 20;

  const [events, total] = await Promise.all([
    db.signalEvent.findMany({
      where: {
        setupId: id,
        userId: session.user.id,
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.signalEvent.count({
      where: {
        setupId: id,
        userId: session.user.id,
        ...(since ? { createdAt: { gte: since } } : {}),
      },
    }),
  ]);

  return NextResponse.json({
    data: events,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
}
