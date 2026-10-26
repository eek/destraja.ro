'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { LastrajaLogo } from '@/components/LastrajaLogo';
import { ALERTS_LIVE } from '@/lib/site';
import { ThemeToggle } from './ThemeControls';

const NAV = [
  { href: '/#legi', label: 'Legi', match: (p: string) => p === '/' || p.startsWith('/legi') },
  { href: '/parlamentari', label: 'Parlamentari', match: (p: string) => p.startsWith('/parlamentari') },
  { href: '/presa', label: 'Presă și date', match: (p: string) => p.startsWith('/presa') },
  { href: '/metodologie', label: 'Metodologie', match: (p: string) => p.startsWith('/metodologie') },
  ...(ALERTS_LIVE ? [{ href: '/abonare', label: 'Alerte', match: (p: string) => p.startsWith('/abonare') }] : []),
];

export default function SiteHeader() {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center gap-4 px-4 sm:h-[72px] sm:px-8 lg:px-10">
        <Link href="/" aria-label="lastraja.ro, pagina principală" className="shrink-0 rounded-md text-ink">
          <LastrajaLogo className="h-9 w-auto sm:h-11" />
        </Link>

        <nav aria-label="Navigație principală" className="ml-auto hidden items-center gap-1 md:flex">
          {NAV.map((n) => {
            const active = n.match(pathname);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? 'text-ink underline decoration-2 underline-offset-[10px]' : 'text-muted hover:bg-sunken hover:text-ink'
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:ml-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="meniu-mobil"
            aria-label={open ? 'Închide meniul' : 'Deschide meniul'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink transition-colors hover:bg-sunken md:hidden"
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      <nav id="meniu-mobil" aria-label="Navigație principală" hidden={!open} className="border-t border-line bg-paper md:hidden">
        <ul className="mx-auto max-w-[1240px] px-4 py-2 sm:px-8">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link
                href={n.href}
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center border-b border-line text-base font-medium text-ink last:border-0"
              >
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
