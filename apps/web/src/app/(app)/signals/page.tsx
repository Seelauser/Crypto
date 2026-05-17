import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import SignalsClient from './signals-client';

export const metadata = { title: 'Signals' };

export default async function SignalsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const [setups, recentEvents] = await Promise.all([
    db.signalSetup.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    }),
    db.signalEvent.findMany({
      where: {
        userId: session.user.id,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { setup: { select: { name: true, market: true } } },
    }),
  ]);

  return (
    <SignalsClient
      setups={JSON.parse(JSON.stringify(setups))}
      recentEvents={JSON.parse(JSON.stringify(recentEvents))}
      tier={(session.user as any).tier ?? 'free'}
    />
  );
}
