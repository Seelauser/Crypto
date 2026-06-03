import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import WatchlistClient from './watchlist-client';

export const metadata = { title: 'Watchlists' };

export default async function WatchlistsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const watchlists = await db.watchlist.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <WatchlistClient
      watchlists={JSON.parse(JSON.stringify(watchlists))}
      tier={((session.user as any).tier ?? 'free') as 'free' | 'starter' | 'pro'}
    />
  );
}
