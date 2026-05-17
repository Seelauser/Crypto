import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
  typescript: true,
});

export const STRIPE_PRICES = {
  proMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY!,
  aiMeter: process.env.STRIPE_PRICE_AI_METER!,
  topup10: process.env.STRIPE_PRICE_TOPUP_10!,
  topup25: process.env.STRIPE_PRICE_TOPUP_25!,
  topup50: process.env.STRIPE_PRICE_TOPUP_50!,
  topup100: process.env.STRIPE_PRICE_TOPUP_100!,
} as const;

// $10 included credit in cents
export const MONTHLY_TOKEN_CREDIT_CENTS = 1_000;

export async function createCheckoutSession(userId: string, email: string) {
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [
      { price: STRIPE_PRICES.proMonthly, quantity: 1 },
    ],
    metadata: { userId },
    success_url: `${process.env.NEXTAUTH_URL}/dashboard?upgraded=1`,
    cancel_url: `${process.env.NEXTAUTH_URL}/onboarding/plan?cancelled=1`,
  });
}

export async function createTopUpSession(userId: string, email: string, priceId: string) {
  return stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { userId, type: 'topup' },
    success_url: `${process.env.NEXTAUTH_URL}/billing?topup=1`,
    cancel_url: `${process.env.NEXTAUTH_URL}/billing`,
  });
}
