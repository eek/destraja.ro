'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TowerIcon } from '@/components/Logo';
import { CONSENT_EVENT, readConsent, saveConsent } from '@/lib/analytics';

// Fereastra de acord pentru statistici. Până alegi, acoperă pagina: mulți vizitatori nu observau banda de jos. Cele două
// butoane au aceeași mărime, același loc și aceeași greutate; doar culoarea le deosebește. Refuzul închide fereastra la
// fel ca acordul, iar site-ul merge la fel în ambele cazuri. Alegerea se schimbă oricând din /confidentialitate.
// Tastatura: focusul rămâne în fereastră, Esc nu o închide (e nevoie de o alegere), restul paginii e inert.

const choiceCls =
  'inline-flex min-h-12 w-full items-center justify-center rounded-lg px-5 text-base font-semibold text-white transition-colors';

// Pe pagina de confidențialitate alegerea se face din secțiunea „Alegerea ta”, după ce citești detaliile; panoul de
// administrare nu are statistici.
const hiddenOn = (path: string) => path === '/confidentialitate' || path === '/admin' || path.startsWith('/admin/');

export default function CookieNotice() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const open = show && !hiddenOn(pathname);

  useEffect(() => {
    const sync = () => setShow(readConsent() === null);
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);

  // Restul paginii devine inert (nu primește focus sau clicuri) și nu se derulează cât timp fereastra e deschisă.
  useEffect(() => {
    const el = dialog.current;
    if (!open || !el) return;
    const made: Element[] = [];
    for (const child of Array.from(document.body.children)) {
      if (child.contains(el) || child.hasAttribute('inert') || child.tagName === 'SCRIPT') continue;
      child.setAttribute('inert', '');
      made.push(child);
    }
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = 'hidden';
    // Focusul pe fereastră, nu pe un buton, ca niciuna dintre alegeri să nu fie gata selectată.
    el.focus({ preventScroll: true });
    return () => {
      for (const child of made) child.removeAttribute('inert');
      html.style.overflow = overflow;
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key !== 'Tab' || !dialog.current) return;
    const items = Array.from(dialog.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialog.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-[rgb(var(--shadow-color)/0.6)] backdrop-blur-[2px]">
      <div className="flex min-h-full items-center justify-center px-4 py-6 sm:p-8">
        <div
          ref={dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="acord-titlu"
          aria-describedby="acord-text"
          tabIndex={-1}
          onKeyDown={onKeyDown}
          // Fereastra primește focus doar ca punct de plecare; inelul de focus e pe butoane și pe link. Stil inline, pentru
          // că regula globală :focus-visible din globals.css nu e într-un strat și ar câștiga în fața clasei.
          style={{ outline: 'none' }}
          className="w-full max-w-[540px] rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-lift)] sm:p-8"
        >
          <TowerIcon className="h-9 w-auto text-ink" />
          <h2 id="acord-titlu" className="mt-4 font-display text-[1.75rem] font-normal leading-tight sm:text-[2rem]">
            Ne lași să numărăm vizitele?
          </h2>
          <div id="acord-text" className="mt-3 space-y-3 text-[15px] leading-7 text-body">
            <p>
              Dacă accepți, Google Analytics ne arată ce pagini se citesc și ce funcții se folosesc, de exemplu câți oameni deschid formularul
              Senatului, plus tipul dispozitivului și, aproximativ, orașul. Pune două cookie-uri <span className="font-mono text-sm">_ga</span>,
              valabile 13 luni.
            </p>
            <p>
              Nu aflăm cine ești, nu afișăm reclame și nu trimitem nimic din ce scrii pe site. Dacă refuzi, nu se încarcă nimic de la Google, iar
              site-ul merge la fel.
            </p>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => saveConsent('denied')} className={`${choiceCls} bg-consent-refuse hover:bg-consent-refuse-hover`}>
              Refuz
            </button>
            <button type="button" onClick={() => saveConsent('granted')} className={`${choiceCls} bg-consent-accept hover:bg-consent-accept-hover`}>
              Accept
            </button>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted">
            Poți schimba alegerea oricând.{' '}
            <Link href="/confidentialitate" className="font-semibold text-link underline underline-offset-4">
              Confidențialitate și cookies
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
