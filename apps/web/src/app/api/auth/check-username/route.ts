import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u');
  if (!u) return NextResponse.json({ available: false, error: 'Missing username' }, { status: 400 });

  const normalized = u.toLowerCase();
  if (!USERNAME_RE.test(normalized)) {
    return NextResponse.json({
      available: false,
      error: 'Username must be 3–20 characters, lowercase letters, numbers, or underscores.',
    });
  }

  const existing = await db.user.findUnique({ where: { username: normalized }, select: { id: true } });
  return NextResponse.json({ available: !existing });
}
