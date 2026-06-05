import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import crypto from 'crypto';

const schema = z.object({
  url: z.string().url(),
  secret: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.user.tier !== 'pro') {
    return NextResponse.json({ error: 'tier_gate', feature: 'webhook_outbound', tierRequired: 'pro' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 422 });

  const signingSecret = parsed.data.secret || crypto.randomBytes(32).toString('hex');

  await db.notificationChannel.upsert({
    where: { userId_kind: { userId: session.user.id, kind: 'webhook' } },
    create: {
      userId: session.user.id,
      kind: 'webhook',
      config: { url: parsed.data.url, secret: signingSecret },
      verified: true,
    },
    update: {
      config: { url: parsed.data.url, secret: signingSecret },
      verified: true,
    },
  });

  return NextResponse.json({ ok: true, signingSecret });
}
