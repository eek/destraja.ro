'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LastrajaTowerIcon } from '@/components/LastrajaLogo';

export const COOKIE_NOTICE_KEY = 'lastraja-cookie-notice';

export default function CookieNotice() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(localStorage.getItem(COOKIE_NOTICE_KEY) !== 'v1');
    } catch {
      setShow(true);
    }
    const reopen = () => setShow(true);
    window.addEventListener('lastraja-cookie-notice', reopen);
    return () => window.removeEventListener('lastraja-cookie-notice', reopen);
  }, []);

  if (!show || pathname === '/cookies') return null;

  const dismiss = () => {
    try {
      localStorage.setItem(COOKIE_NOTICE_KEY, 'v1');
    } catch {
      // Fără stocare locală mesajul reapare la vizita următoare.
    }
    setShow(false);
  };

  return (
    <section
      aria-label="Despre cookie-uri"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-[860px] rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-lift)] sm:inset-x-6 sm:bottom-5 sm:px-5 sm:py-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <LastrajaTowerIcon className="h-7 w-auto shrink-0 text-ink" />
          <p className="text-sm leading-6 text-body">
            <strong className="font-semibold text-ink">Fără cookie-uri de urmărire.</strong> Nu folosim reclame, statistici sau rețele sociale;
            păstrăm în browserul tău doar tema aleasă și acest mesaj.
          </p>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-4">
          <Link href="/cookies" className="text-sm font-semibold text-link underline underline-offset-4">
            Detalii
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex min-h-10 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-hover"
          >
            Am înțeles
          </button>
        </div>
      </div>
    </section>
  );
}
