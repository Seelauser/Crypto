'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard, Zap, Search, BookOpen, BarChart2,
  CreditCard, Settings, LogOut, Cpu,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/signals', icon: Zap, label: 'Signals' },
  { href: '/scans', icon: Search, label: 'Scans' },
  { href: '/watchlists', icon: BookOpen, label: 'Watchlists' },
  { href: '/markets/crypto', icon: BarChart2, label: 'Markets' },
] as const;

const BOTTOM_ITEMS = [
  { href: '/billing', icon: CreditCard, label: 'Billing' },
  { href: '/settings', icon: Settings, label: 'Settings' },
] as const;

interface Props {
  user: { username: string; tier: string; tokenBalanceCents: number };
}

export default function AppNav({ user }: Props) {
  const pathname = usePathname();

  return (
    <nav style={{
      width: 56,
      background: '#0a0a0b',
      borderRight: '1px solid #1f2128',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '12px 0',
      gap: 4,
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Cpu size={20} color="#22d3ee" />
      </div>

      {/* Main nav */}
      {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <NavIcon key={href} href={href} label={label} active={active}>
            <Icon size={18} strokeWidth={1.5} />
          </NavIcon>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* Bottom nav */}
      {BOTTOM_ITEMS.map(({ href, icon: Icon, label }) => {
        const active = pathname === href;
        return (
          <NavIcon key={href} href={href} label={label} active={active}>
            <Icon size={18} strokeWidth={1.5} />
          </NavIcon>
        );
      })}

      {/* Sign out */}
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        title="Sign out"
        style={{
          background: 'none', border: 'none', cursor: 'pointer', color: '#5a5f6a',
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, transition: 'color 150ms',
          marginTop: 4,
        }}
        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onMouseLeave={e => (e.currentTarget.style.color = '#5a5f6a')}
      >
        <LogOut size={16} strokeWidth={1.5} />
      </button>

      {/* User tier indicator */}
      <div style={{
        marginTop: 8, marginBottom: 4,
        fontSize: 9,
        color: user.tier === 'premium' ? '#22d3ee' : '#5a5f6a',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'center',
      }}>
        {user.tier === 'premium' ? 'PRO' : 'FREE'}
      </div>
    </nav>
  );
}

function NavIcon({ href, label, active, children }: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={label}
      style={{
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        color: active ? '#22d3ee' : '#5a5f6a',
        background: active ? '#22d3ee15' : 'transparent',
        textDecoration: 'none',
        transition: 'color 150ms, background 150ms',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = '#e6e8ee';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = '#5a5f6a';
      }}
    >
      {children}
    </Link>
  );
}
