import { NextRequest, NextResponse } from 'next/server';
import { stripe, MONTHLY_TOKEN_CREDIT_CENTS } from '@/lib/stripe';
import { db } from '@/lib/db';
import Stripe from 'stripe';

export const config = { api: { bodyParser: false } };

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'No signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (!userId || session.mode !== 'subscription') break;

      await db.$transaction([
        db.user.update({
          where: { id: userId },
          data: { tier: 'premium' },
        }),
        db.subscription.upsert({
          where: { userId },
          create: {
            userId,
            stripeSubscriptionId: session.subscription as string,
            stripeCustomerId: session.customer as string,
            status: 'active',
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
          update: {
            stripeSubscriptionId: session.subscription as string,
            status: 'active',
          },
        }),
        // Credit $10 included token balance
        db.tokenLedger.upsert({
          where: { userId },
          create: { userId, balanceCents: MONTHLY_TOKEN_CREDIT_CENTS },
          update: { balanceCents: { increment: MONTHLY_TOKEN_CREDIT_CENTS } },
        }),
      ]);
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      // Renewal — top up token credit to at least $10
      const sub = await db.subscription.findFirst({
        where: { stripeSubscriptionId: invoice.subscription as string },
        select: { userId: true },
      });
      if (!sub) break;

      const ledger = await db.tokenLedger.findUnique({ where: { userId: sub.userId } });
      const currentBalance = ledger?.balanceCents ?? 0;
      const topUp = Math.max(0, MONTHLY_TOKEN_CREDIT_CENTS - currentBalance);

      await db.$transaction([
        db.subscription.update({
          where: { userId: sub.userId },
          data: {
            status: 'active',
            currentPeriodEnd: new Date((invoice.period_end ?? 0) * 1000),
          },
        }),
        ...(topUp > 0
          ? [db.tokenLedger.update({
              where: { userId: sub.userId },
              data: { balanceCents: { increment: topUp } },
            })]
          : []),
      ]);
      break;
    }

    case 'payment_intent.succeeded': {
      // Top-up payment
      const pi = event.data.object as Stripe.PaymentIntent;
      const userId = pi.metadata?.userId;
      const type = pi.metadata?.type;
      if (!userId || type !== 'topup') break;

      // Determine top-up amount from amount_received (in cents, e.g. 1000 = $10.00)
      await db.tokenLedger.upsert({
        where: { userId },
        create: { userId, balanceCents: pi.amount_received },
        update: { balanceCents: { increment: pi.amount_received } },
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const existing = await db.subscription.findFirst({
        where: { stripeSubscriptionId: sub.id },
        select: { userId: true },
      });
      if (!existing) break;

      await db.$transaction([
        db.user.update({ where: { id: existing.userId }, data: { tier: 'free' } }),
        db.subscription.update({ where: { userId: existing.userId }, data: { status: 'cancelled' } }),
      ]);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
