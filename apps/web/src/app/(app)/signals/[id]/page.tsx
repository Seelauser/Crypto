import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect, notFound } from 'next/navigation';
import SignalDetailClient from './signal-detail-client';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const setup = await db.signalSetup.findUnique({ where: { id }, select: { name: true } });
  return { title: setup?.name ?? 'Signal Setup' };
}

export default async function SignalDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { id } = await params;

  const [setup, events] = await Promise.all([
    db.signalSetup.findFirst({
      where: { id, userId: session.user.id },
    }),
    db.signalEvent.findMany({
      where: { setupId: id, userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);

  if (!setup) notFound();

  const tier = ((session.user as any).tier ?? 'free') as 'free' | 'starter' | 'pro';

  return (
    <SignalDetailClient
      setup={JSON.parse(JSON.stringify(setup))}
      events={JSON.parse(JSON.stringify(events))}
      tier={tier}
    />
  );
}
