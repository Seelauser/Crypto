import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { sendVerificationEmail, isEmailEnabled } from '@/lib/email';
import { rateLimit } from '@/lib/rateLimit';

const schema = z.object({ email: z.string().email() });

// Generic success body — never leak which emails are registered.
const GENERIC_OK = NextResponse.json(
  { ok: true, message: 'If that email is registered, a verification link is on its way.' },
  { status: 200 },
);

export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  const limit = await rateLimit('resend', ip, 3, 300);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  if (!isEmailEnabled()) {
    // No mailer configured — accounts auto-activate at register time, so a
    // resend is meaningless. Reply generically to keep the surface uniform.
    return GENERIC_OK;
  }

  const body = await req.json().catch(() => null);
  const parsed = body && schema.safeParse(body);
  if (!parsed || !parsed.success) return GENERIC_OK;

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, username: true, email: true, status: true },
  });
  if (!user || user.status !== 'pending_verification') return GENERIC_OK;

  const token = crypto.randomBytes(32).toString('hex');
  try {
    await sendVerificationEmail(user.email, user.username, token, user.id);
  } catch (err) {
    console.error('[resend] sendVerificationEmail failed:', err);
  }
  return GENERIC_OK;
}
