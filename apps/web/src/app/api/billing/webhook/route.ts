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
    event = stripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency: ignore events we've already processed (Stripe retries on failure)
  const alreadyProcessed = await db.stripeEvent.findUnique({ where: { stripeId: event.id } });
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, skipped: 'already_processed' });
  }
  await db.stripeEvent.create({ data: { stripeId: event.id, type: event.type } });

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (!userId || session.mode !== 'subscription') break;

      // Which tier was purchased. Sessions created before the 3-tier rollout
      // carry no `tier` metadata → default to 'pro' (the old single product).
      const tier: 'starter' | 'pro' = session.metadata?.tier === 'starter' ? 'starter' : 'pro';

      const ops: any[] = [
        db.user.update({
          where: { id: userId },
          data: { tier },
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
      ];

      // Only Pro includes the $10 monthly token credit; Starter gets none.
      if (tier === 'pro') {
        ops.push(
          db.tokenLedger.upsert({
            where: { userId },
            create: { userId, balanceCents: MONTHLY_TOKEN_CREDIT_CENTS },
            update: { balanceCents: { increment: MONTHLY_TOKEN_CREDIT_CENTS } },
          }),
        );
      }

      await db.$transaction(ops);
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      // Renewal — top up token credit to at least $10
      const sub = await db.subscription.findFirst({
        where: { stripeSubscriptionId: invoice.subscription as string },
        select: { userId: true, user: { select: { tier: true } } },
      });
      if (!sub) break;

      // Only Pro carries a monthly token credit; Starter renewals just refresh
      // the subscription period.
      const isPro = sub.user?.tier === 'pro';
      const ledger = isPro
        ? await db.tokenLedger.findUnique({ where: { userId: sub.userId } })
        : null;
      const currentBalance = ledger?.balanceCents ?? 0;
      const topUp = isPro ? Math.max(0, MONTHLY_TOKEN_CREDIT_CENTS - currentBalance) : 0;

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
