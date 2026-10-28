'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TowerIcon } from '@/components/Logo';
import { CONSENT_EVENT, readConsent, saveConsent } from '@/lib/analytics';

// Cele două butoane arată la fel: refuzul trebuie să fie la fel de ușor ca acordul.
const choiceCls =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-hover';

export default function CookieNotice() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const sync = () => setShow(readConsent() === null);
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);

  // Pe pagina de cookies alegerea se face din secțiunea „Alegerea ta”.
  if (!show || pathname === '/cookies') return null;

  return (
    <section
      aria-label="Statistici și cookie-uri"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-[920px] rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-lift)] sm:inset-x-6 sm:bottom-5 sm:px-5 sm:py-4"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <TowerIcon className="mt-0.5 h-7 w-auto shrink-0 text-ink" />
          <p className="text-sm leading-6 text-body">
            <strong className="font-semibold text-ink">Ne lași să numărăm vizitele?</strong> Dacă accepți, Google Analytics ne arată ce pagini și ce
            funcții sunt folosite. Nu aflăm cine ești, nu afișăm reclame și nu trimitem nimic din ce scrii pe site.{' '}
            <Link href="/cookies" className="font-semibold text-link underline underline-offset-4">
              Detalii
            </Link>
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2">
          <button type="button" onClick={() => saveConsent('denied')} className={choiceCls}>
            Refuz
          </button>
          <button type="button" onClick={() => saveConsent('granted')} className={choiceCls}>
            Accept
          </button>
        </div>
      </div>
    </section>
  );
}
