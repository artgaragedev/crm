'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  Tags,
  Palette,
  ArrowLeftRight,
  Users,
  Truck,
  BarChart3,
  Menu,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Дашборд', icon: LayoutDashboard },
  { href: '/reports', label: 'Отчёты', icon: BarChart3 },
  { href: '/products', label: 'Товары', icon: Package },
  { href: '/categories', label: 'Категории', icon: Tags },
  { href: '/attributes', label: 'Атрибуты', icon: Palette },
  { href: '/movements', label: 'Движения', icon: ArrowLeftRight },
  { href: '/customers', label: 'Клиенты', icon: Users },
  { href: '/suppliers', label: 'Поставщики', icon: Truck },
];

function NavLinks({ onClick }: { onClick?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-1 p-3">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClick}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        AG
      </span>
      <span>Art Garage</span>
    </Link>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-muted/30 md:flex">
      <div className="flex h-16 items-center border-b px-6">
        <Brand />
      </div>
      <NavLinks />
    </aside>
  );
}

export function MobileSidebarTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Меню">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-64 flex-col p-0">
        <SheetHeader className="flex h-16 flex-row items-center border-b px-6">
          <SheetTitle className="m-0">
            <Brand />
          </SheetTitle>
        </SheetHeader>
        <NavLinks onClick={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
