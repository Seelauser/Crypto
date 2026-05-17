import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createCheckoutSession } from '@/lib/stripe';
import { db } from '@/lib/db';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, tier: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.tier === 'premium') {
    return NextResponse.json({ error: 'Already subscribed' }, { status: 400 });
  }

  const checkout = await createCheckoutSession(session.user.id, user.email);
  return NextResponse.json({ url: checkout.url });
}
