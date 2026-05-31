import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import UpgradeClient from './upgrade-client';

export const metadata = { title: 'Upgrade to Pro · OrderFlow' };

type Search = { from?: string | string[] };

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { tier: true },
  });
  if (!user) redirect('/login');

  // Already Pro → send them to the billing dashboard, not the upgrade pitch.
  if (user.tier === 'premium') redirect('/billing');

  const sp = await searchParams;
  const fromRaw = Array.isArray(sp.from) ? sp.from[0] : sp.from;
  const from = typeof fromRaw === 'string' ? fromRaw.slice(0, 64) : null;

  return <UpgradeClient from={from} />;
}
