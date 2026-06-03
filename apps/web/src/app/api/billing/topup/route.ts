import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createTopUpSession, STRIPE_PRICES } from '@/lib/stripe';
import { db } from '@/lib/db';

const AMOUNT_TO_PRICE: Record<number, string> = {
  1000: STRIPE_PRICES.topup10,
  2500: STRIPE_PRICES.topup25,
  5000: STRIPE_PRICES.topup50,
  10000: STRIPE_PRICES.topup100,
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as any).tier !== 'pro') {
    return NextResponse.json({ error: 'Pro plan required' }, { status: 403 });
  }

  const { amount } = await req.json();
  const priceId = AMOUNT_TO_PRICE[amount];
  if (!priceId) return NextResponse.json({ error: 'Invalid top-up amount' }, { status: 400 });

  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { email: true } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const checkout = await createTopUpSession(session.user.id, user.email, priceId);
  return NextResponse.json({ url: checkout.url });
}
