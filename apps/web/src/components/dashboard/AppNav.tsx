'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard, Zap, Search, BookOpen, BarChart2,
  CreditCard, Settings, LogOut, Cpu, Menu,
} from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';

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
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar — hidden on mobile, visible md+ */}
      <DesktopSidebar pathname={pathname} user={user} />

      {/* Mobile top-bar — visible on mobile, hidden md+ */}
      <MobileTopBar
        user={user}
        onMenuClick={() => setDrawerOpen(true)}
      />

      {/* Mobile drawer — wraps the same NAV_ITEMS as the desktop sidebar */}
      <MobileNavDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        pathname={pathname}
        user={user}
      />
    </>
  );
}

// ─── Desktop sidebar ──────────────────────────────────────────────────────────

function DesktopSidebar({
  pathname,
  user,
}: {
  pathname: string;
  user: Props['user'];
}) {
  return (
    <nav className="hidden md:flex w-14 flex-col items-center gap-1 border-r border-[#1f2128] bg-[#0a0a0b] py-3 flex-shrink-0">
      <div className="mb-4 flex items-center justify-center">
        <Cpu size={20} color="#22d3ee" />
      </div>

      {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <NavIcon key={href} href={href} label={label} active={active}>
            <Icon size={18} strokeWidth={1.5} />
          </NavIcon>
        );
      })}

      <div className="flex-1" />

      {BOTTOM_ITEMS.map(({ href, icon: Icon, label }) => {
        const active = pathname === href;
        return (
          <NavIcon key={href} href={href} label={label} active={active}>
            <Icon size={18} strokeWidth={1.5} />
          </NavIcon>
        );
      })}

      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        title="Sign out"
        className="mt-1 flex h-9 w-9 items-center justify-center rounded-md text-[#5a5f6a] hover:text-[#ef4444]"
      >
        <LogOut size={16} strokeWidth={1.5} />
      </button>

      <div
        className="mt-2 mb-1 text-center font-mono"
        style={{
          fontSize: 9,
          color: user.tier === 'premium' ? '#22d3ee' : '#5a5f6a',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {user.tier === 'premium' ? 'PRO' : 'FREE'}
      </div>
    </nav>
  );
}

// ─── Mobile top-bar ───────────────────────────────────────────────────────────

function MobileTopBar({
  user,
  onMenuClick,
}: {
  user: Props['user'];
  onMenuClick: () => void;
}) {
  return (
    <div
      className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[#1f2128] bg-[#0a0a0b] px-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-2"
    >
      <button
        type="button"
        onClick={onMenuClick}
        className="flex h-11 w-11 items-center justify-center rounded-md text-[#e6e8ee] hover:bg-panel-hi"
        aria-label="Open menu"
      >
        <Menu size={22} />
      </button>

      <div className="flex items-center gap-2">
        <Cpu size={18} color="#22d3ee" />
        <span className="text-sm font-semibold text-[#e6e8ee]">OrderFlow</span>
      </div>

      <span
        className="font-mono"
        style={{
          fontSize: 9,
          color: user.tier === 'premium' ? '#22d3ee' : '#5a5f6a',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {user.tier === 'premium' ? 'PRO' : 'FREE'}
      </span>
    </div>
  );
}

// ─── Mobile drawer ────────────────────────────────────────────────────────────

function MobileNavDrawer({
  open,
  onOpenChange,
  pathname,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
  user: Props['user'];
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={user.username || 'Menu'}>
      <div className="flex flex-col gap-1 pb-2">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <DrawerLink
              key={href}
              href={href}
              icon={Icon}
              label={label}
              active={active}
              onSelect={() => onOpenChange(false)}
            />
          );
        })}

        <div className="my-2 h-px bg-[#1f2128]" />

        {BOTTOM_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <DrawerLink
              key={href}
              href={href}
              icon={Icon}
              label={label}
              active={active}
              onSelect={() => onOpenChange(false)}
            />
          );
        })}

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="mt-1 flex h-11 items-center gap-3 rounded-md px-3 text-sm text-[#ef4444] hover:bg-panel-hi"
        >
          <LogOut size={18} strokeWidth={1.5} />
          Sign out
        </button>
      </div>
    </Drawer>
  );
}

function DrawerLink({
  href,
  icon: Icon,
  label,
  active,
  onSelect,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onSelect}
      className={
        'flex h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors ' +
        (active
          ? 'bg-[#22d3ee15] text-[#22d3ee]'
          : 'text-[#e6e8ee] hover:bg-panel-hi')
      }
    >
      <Icon size={18} strokeWidth={1.5} />
      {label}
    </Link>
  );
}

// ─── Shared icon link for the desktop sidebar ─────────────────────────────────

function NavIcon({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={label}
      className={
        'flex h-9 w-9 items-center justify-center rounded-md transition-colors ' +
        (active
          ? 'bg-[#22d3ee15] text-[#22d3ee]'
          : 'text-[#5a5f6a] hover:text-[#e6e8ee]')
      }
    >
      {children}
    </Link>
  );
}
