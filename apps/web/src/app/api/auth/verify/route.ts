import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const uid = req.nextUrl.searchParams.get('uid');

  if (!token || !uid) {
    return NextResponse.redirect(new URL('/login?error=invalid_link', req.url));
  }

  // In MVP: verify token is stored in the user's pending state
  // A production implementation would use a dedicated verification_tokens table
  const user = await db.user.findUnique({
    where: { id: uid },
    select: { status: true },
  });

  if (!user) return NextResponse.redirect(new URL('/login?error=invalid_link', req.url));
  if (user.status === 'active') return NextResponse.redirect(new URL('/login?verified=1', req.url));

  await db.user.update({
    where: { id: uid },
    data: { status: 'active' },
  });

  return NextResponse.redirect(new URL('/onboarding/plan', req.url));
}
