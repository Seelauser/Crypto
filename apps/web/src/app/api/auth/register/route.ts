import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { sendVerificationEmail } from '@/lib/email';
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

// Simple in-memory rate limiter (use Redis in production)
const attempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });
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

  const user = await db.user.create({
    data: {
      username,
      email,
      passwordHash,
      status: 'pending_verification',
      tier: 'free',
      tokenLedger: { create: { balanceCents: 0 } },
    },
  });

  // Store verification token in DB (simplified: store in user metadata or separate table)
  // For MVP we send the token directly; production should use a VerificationToken table
  await sendVerificationEmail(email, username, verificationToken, user.id);

  return NextResponse.json({ ok: true, message: 'Check your email to verify your account.' }, { status: 201 });
}
