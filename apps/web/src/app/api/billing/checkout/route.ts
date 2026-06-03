import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createCheckoutSession, type PaidTier } from '@/lib/stripe';
import { db } from '@/lib/db';
import { TIER_RANK } from '@/lib/limits';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Target tier from the request body; defaults to 'pro' for back-compat with
  // older clients that posted no body.
  const body = await req.json().catch(() => ({}));
  const targetTier: PaidTier = body?.tier === 'starter' ? 'starter' : 'pro';

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, tier: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Block a checkout that wouldn't be an upgrade (same tier, or already higher).
  if (TIER_RANK[user.tier] >= TIER_RANK[targetTier]) {
    return NextResponse.json({ error: 'Already subscribed', currentTier: user.tier }, { status: 400 });
  }

  const checkout = await createCheckoutSession(session.user.id, user.email, targetTier);
  return NextResponse.json({ url: checkout.url });
}
