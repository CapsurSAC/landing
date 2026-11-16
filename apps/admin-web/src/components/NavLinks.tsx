'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

export function NavLinks({ items, orientation }: { items: { href: string; label: string }[]; orientation: 'vertical' | 'horizontal' }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <ul className={cn(orientation === 'vertical' ? 'flex flex-col gap-0.5' : 'flex gap-1 overflow-x-auto pb-1')}>
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'block rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                active ? 'bg-white/12 text-white ring-1 ring-cyan-400/40' : 'text-mist-200 hover:bg-white/8 hover:text-white',
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
