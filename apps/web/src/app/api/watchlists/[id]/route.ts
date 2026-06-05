import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getLimits, buildTierGateError } from '@/lib/limits';
import type { UserTier } from '@orderflow/types';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const tier = (session.user.tier ?? 'free') as UserTier;
  const limits = getLimits(tier);

  const watchlist = await db.watchlist.findFirst({ where: { id, userId: session.user.id } });
  if (!watchlist) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { instruments, name } = await req.json();

  if (instruments !== undefined && instruments.length > limits.watchlist_instruments_max) {
    return NextResponse.json(buildTierGateError('watchlist_instruments_max', 'watchlist_instruments'), { status: 403 });
  }

  const updated = await db.watchlist.update({
    where: { id },
    data: { ...(name !== undefined ? { name } : {}), ...(instruments !== undefined ? { instruments } : {}) },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const watchlist = await db.watchlist.findFirst({ where: { id, userId: session.user.id } });
  if (!watchlist) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await db.watchlist.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
