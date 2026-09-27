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
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          O
        </div>
        <span className="font-semibold">Ojas Trading</span>
      </div>
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
    </aside>
  );
}
