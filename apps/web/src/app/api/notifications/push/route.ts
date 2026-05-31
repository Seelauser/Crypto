import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? '' });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.endpoint || !body?.keys) {
    return NextResponse.json({ error: 'Missing subscription data' }, { status: 400 });
  }

  await db.notificationChannel.upsert({
    where: { userId_kind: { userId: session.user.id, kind: 'browser_push' } },
    create: {
      userId: session.user.id,
      kind: 'browser_push',
      config: { endpoint: body.endpoint, keys: body.keys },
      verified: true,
    },
    update: {
      config: { endpoint: body.endpoint, keys: body.keys },
      verified: true,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await db.notificationChannel.deleteMany({
    where: { userId: session.user.id, kind: 'browser_push' },
  });

  return NextResponse.json({ ok: true });
}
