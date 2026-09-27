'use client';

import {
  Anchor,
  ArrowLeftRight,
  Handshake,
  LayoutDashboard,
  Package,
  Settings,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Overview',
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    section: 'Trading',
    items: [{ label: 'Trading Desk', href: '/trading', icon: TrendingUp }],
  },
  {
    section: 'Deals',
    items: [
      { label: 'Direct Deals', href: '/deals/direct-deals', icon: Handshake },
      { label: 'Brokerage Deals', href: '/deals/brokerage-deals', icon: ArrowLeftRight },
      { label: 'Degum Deals', href: '/deals/degum-deals', icon: Anchor },
    ],
  },
  {
    section: 'Master Data',
    items: [
      { label: 'Parties', href: '/master/parties', icon: Users },
      { label: 'Products', href: '/master/products', icon: Package },
    ],
  },
  {
    section: 'Configuration',
    items: [
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
        O
      </div>
      <span className="font-semibold">Ojas Trading</span>
    </div>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {NAV.map((group) => (
        <div key={group.section} className="mb-5">
          <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.section}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== '/dashboard' &&
                  item.href !== '/master' &&
                  pathname.startsWith(item.href)) ||
                (item.href === '/master' && pathname === '/master');
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground/80 hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:flex md:flex-col">
      <div className="flex h-14 items-center border-b border-border px-5">
        <Brand />
      </div>
      <SidebarNav />
    </aside>
  );
}

/** Slide-in drawer version of the sidebar, shown below the `md` breakpoint. */
export function MobileSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  // Close when the route changes (covers back/forward as well as link taps).
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className="md:hidden" inert={!open}>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/40 transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <aside
        id="mobile-sidebar"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 max-w-[80vw] flex-col border-r border-border bg-card shadow-lg transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border pl-5 pr-2">
          <Brand />
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close menu">
            <X className="size-4" />
          </Button>
        </div>
        <SidebarNav onNavigate={onClose} />
      </aside>
    </div>
  );
}
