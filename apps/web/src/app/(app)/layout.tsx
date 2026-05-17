import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AppNav from '@/components/dashboard/AppNav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const user = {
    username: session.user.name ?? '',
    email: session.user.email ?? '',
    tier: (session.user as any).tier ?? 'free',
    tokenBalanceCents: (session.user as any).tokenBalanceCents ?? 0,
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0a0b', overflow: 'hidden' }}>
      <AppNav user={user} />
      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  );
}
