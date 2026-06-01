import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import redis from '@/lib/redis';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let divergences: unknown[] = [];

  try {
    const raw = await redis.lrange('market:divergences', 0, 19);
    divergences = raw
      .map(entry => { try { return JSON.parse(entry); } catch { return null; } })
      .filter(Boolean);
  } catch { /* Redis unavailable — return empty list */ }

  return NextResponse.json({ divergences, ts: Date.now() });
}
