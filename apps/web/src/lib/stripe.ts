import Stripe from 'stripe';

let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
    });
  }
  return _stripe;
}

export const STRIPE_PRICES = {
  starterMonthly: process.env.STRIPE_PRICE_STARTER!,
  proMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY!,
  aiMeter: process.env.STRIPE_PRICE_AI_METER!,
  topup10: process.env.STRIPE_PRICE_TOPUP_10!,
  topup25: process.env.STRIPE_PRICE_TOPUP_25!,
  topup50: process.env.STRIPE_PRICE_TOPUP_50!,
  topup100: process.env.STRIPE_PRICE_TOPUP_100!,
} as const;

/** Paid subscription tiers and the env-configured Stripe price that backs each. */
export type PaidTier = 'starter' | 'pro';

const TIER_PRICE: Record<PaidTier, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  pro:     process.env.STRIPE_PRICE_PRO_MONTHLY,
};

// $10 included credit in cents (Pro only)
export const MONTHLY_TOKEN_CREDIT_CENTS = 1_000;

export async function createCheckoutSession(userId: string, email: string, tier: PaidTier = 'pro') {
  const price = TIER_PRICE[tier];
  if (!price) {
    throw new Error(`No Stripe price configured for tier '${tier}' — set STRIPE_PRICE_${tier === 'pro' ? 'PRO_MONTHLY' : 'STARTER'}`);
  }
  return stripe().checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [
      { price, quantity: 1 },
    ],
    // `tier` drives what the webhook grants on completion.
    metadata: { userId, tier },
    success_url: `${process.env.NEXTAUTH_URL}/dashboard?upgraded=1`,
    cancel_url: `${process.env.NEXTAUTH_URL}/onboarding/plan?cancelled=1`,
  });
}

export async function createTopUpSession(userId: string, email: string, priceId: string) {
  return stripe().checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { userId, type: 'topup' },
    success_url: `${process.env.NEXTAUTH_URL}/billing?topup=1`,
    cancel_url: `${process.env.NEXTAUTH_URL}/billing`,
  });
}
