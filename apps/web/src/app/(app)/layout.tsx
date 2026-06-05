import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AppNav from '@/components/dashboard/AppNav';
import { isAdminSession } from '@/lib/admin';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const user = {
    username: session.user.name ?? '',
    email: session.user.email ?? '',
    tier: session.user.tier ?? 'free',
    tokenBalanceCents: session.user.tokenBalanceCents ?? 0,
    isAdmin: isAdminSession(session),
  };

  return (
    // 100dvh (dynamic viewport height) avoids iOS Safari's 100vh
    // miscalculation when the URL bar shows/hides. On mobile the layout
    // is a column (sticky top-bar above main); on desktop it's a row
    // (sidebar left of main).
    <div
      className="flex flex-col md:flex-row bg-bg overflow-hidden"
      style={{ height: '100dvh' }}
    >
      <AppNav user={user} />
      <main className="flex flex-1 flex-col overflow-auto">
        {children}
      </main>
    </div>
  );
}
