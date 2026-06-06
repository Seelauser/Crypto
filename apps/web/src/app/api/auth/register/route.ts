import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { sendVerificationEmail, isEmailEnabled } from '@/lib/email';
import { rateLimit } from '@/lib/rateLimit';
import crypto from 'crypto';

const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers, underscores only'),
  email: z.string().email(),
  password: z
    .string()
    .min(10, 'Minimum 10 characters')
    .regex(/[a-zA-Z]/, 'Must include a letter')
    .regex(/[0-9]/, 'Must include a number'),
});

export async function POST(req: NextRequest) {
  // Use x-real-ip (set by nginx) first; fall back to the RIGHTMOST (trusted)
  // entry in x-forwarded-for so a client cannot spoof the rate-limit key by
  // prepending extra IPs. Leftmost entry in x-forwarded-for is user-supplied
  // and must never be trusted for security decisions.
  const ip =
    req.headers.get('x-real-ip')?.trim() ??
    req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ??
    'unknown';
  const limit = await rateLimit('register', ip, 5, 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in a minute.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  const parsed = registerSchema.safeParse({ ...body, username: body.username?.toLowerCase() });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { username, email, password } = parsed.data;

  const existing = await db.user.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { username: true, email: true },
  });
  if (existing) {
    const field = existing.username === username ? 'username' : 'email';
    return NextResponse.json({ error: `${field} already taken` }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const verificationToken = crypto.randomBytes(32).toString('hex');

  // Without an email provider configured we cannot deliver a verification
  // link, so leaving the account in `pending_verification` would lock the
  // user out forever. Activate immediately in that case — the email gate
  // re-engages automatically the moment a Resend key is added.
  const emailEnabled = isEmailEnabled();
  const initialStatus = emailEnabled ? 'pending_verification' : 'active';

  const user = await db.user.create({
    data: {
      username,
      email,
      passwordHash,
      status: initialStatus,
      tier: 'free',
      tokenLedger: { create: { balanceCents: 0 } },
    },
  });

  if (emailEnabled) {
    try {
      await sendVerificationEmail(email, username, verificationToken, user.id);
    } catch (err) {
      console.error('[register] sendVerificationEmail failed:', err);
      // Don't kill registration — the user can re-request via /api/auth/resend.
    }
  }

  const message = emailEnabled
    ? 'Check your email to verify your account.'
    : 'Account created. You can sign in now.';
  return NextResponse.json({ ok: true, message }, { status: 201 });
}
