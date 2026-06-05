import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.user.tier !== 'pro') {
    return NextResponse.json({
      error: 'tier_gate',
      feature: 'telegram_notifications',
      tierRequired: 'pro',
      upgradeUrl: '/billing/upgrade?from=telegram',
    }, { status: 403 });
  }

  const token = Buffer.from(`${session.user.id}:${Date.now()}`).toString('base64url');

  await db.notificationChannel.upsert({
    where: { userId_kind: { userId: session.user.id, kind: 'telegram' } },
    create: { userId: session.user.id, kind: 'telegram', config: { pendingToken: token }, verified: false },
    update: { config: { pendingToken: token }, verified: false },
  });

  const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? 'OrderFlowBot';
  return NextResponse.json({ deepLink: `https://t.me/${botUsername}?start=${token}` });
}
