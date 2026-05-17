import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import BillingClient from './billing-client';

export const metadata = { title: 'Billing' };

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const [user, ledger, recentCalls] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      include: { subscription: true },
    }),
    db.tokenLedger.findUnique({ where: { userId: session.user.id } }),
    db.llmCall.findMany({
      where: {
        userId: session.user.id,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);

  if (!user) redirect('/login');

  return (
    <BillingClient
      tier={user.tier as 'free' | 'premium'}
      balanceCents={ledger?.balanceCents ?? 0}
      subscription={user.subscription ? JSON.parse(JSON.stringify(user.subscription)) : null}
      recentCalls={JSON.parse(JSON.stringify(recentCalls))}
    />
  );
}
