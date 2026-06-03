import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const COUPON_REGEX = /^[A-Z0-9]{4,20}$/;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await req.json().catch(() => null);
    const code = body?.code;
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Coupon code required' }, { status: 400 });
    }

    const codeUpper = code.toUpperCase().trim();
    if (!COUPON_REGEX.test(codeUpper)) {
      return NextResponse.json({ error: 'Invalid coupon code format' }, { status: 400 });
    }

    const coupon = await db.coupon.findUnique({ where: { code: codeUpper } });
    if (!coupon) {
      return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });
    }
    if (coupon.status !== 'active') {
      return NextResponse.json({ error: 'This coupon is no longer active' }, { status: 410 });
    }
    if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: 'This coupon has expired' }, { status: 410 });
    }
    if (coupon.currentUses >= coupon.maxUses) {
      return NextResponse.json({ error: 'This coupon has reached its usage limit' }, { status: 410 });
    }

    const existing = await db.couponRedemption.findUnique({
      where: { couponId_userId: { couponId: coupon.id, userId } },
    });
    if (existing) {
      return NextResponse.json({ error: 'You have already redeemed this coupon' }, { status: 409 });
    }

    const days = coupon.discountType === 'fixed_days' && coupon.discountValue > 0
      ? coupon.discountValue
      : 10;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await db.$transaction([
      db.couponRedemption.create({ data: { couponId: coupon.id, userId } }),
      db.coupon.update({ where: { id: coupon.id }, data: { currentUses: { increment: 1 } } }),
      db.proAccessGrant.upsert({
        where: { userId },
        create: { userId, expiresAt, source: 'coupon' },
        update: { expiresAt, source: 'coupon' },
      }),
      db.user.update({ where: { id: userId }, data: { tier: 'pro' } }),
    ]);

    return NextResponse.json({
      success: true,
      message: `🎉 Pro access granted for ${days} days!`,
      tier: 'pro',
      expiresAt: expiresAt.toISOString(),
      daysRemaining: days,
    });
  } catch (error) {
    console.error('Coupon apply error:', error);
    return NextResponse.json({ error: 'Failed to apply coupon' }, { status: 500 });
  }
}
