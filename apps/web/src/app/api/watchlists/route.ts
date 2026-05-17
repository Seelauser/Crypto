import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getLimits, buildTierGateError } from '@/lib/limits';
import type { UserTier } from '@orderflow/types';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const watchlists = await db.watchlist.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: 'desc' } });
  return NextResponse.json(watchlists);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tier = ((session.user as any).tier ?? 'free') as UserTier;
  const limits = getLimits(tier);

  const count = await db.watchlist.count({ where: { userId: session.user.id } });
  if (count >= limits.watchlists_max) {
    return NextResponse.json(buildTierGateError('watchlists_max', 'watchlist_create'), { status: 403 });
  }

  const { name } = await req.json();
  const watchlist = await db.watchlist.create({ data: { userId: session.user.id, name: name ?? 'My Watchlist', instruments: [] } });
  return NextResponse.json(watchlist, { status: 201 });
}
