import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import redis from '@/lib/redis';

// Liveness/readiness probe (rework spec Phase 6 P6-2). Public (added to
// middleware PUBLIC_PATHS) so monitors can hit it without auth. Checks the two
// hard dependencies — Postgres and Redis — and returns 200 ok / 503 degraded.
export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, 'ok' | 'down'> = {};
  let healthy = true;

  try {
    await db.$queryRaw`SELECT 1`;
    checks.db = 'ok';
  } catch {
    checks.db = 'down';
    healthy = false;
  }

  try {
    const pong = await redis.ping();
    checks.redis = pong === 'PONG' ? 'ok' : 'down';
    if (pong !== 'PONG') healthy = false;
  } catch {
    checks.redis = 'down';
    healthy = false;
  }

  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', service: 'web', checks, ts: Date.now() },
    { status: healthy ? 200 : 503 },
  );
}
