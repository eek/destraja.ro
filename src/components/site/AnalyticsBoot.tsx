'use client';

import { useEffect } from 'react';
import { paramsFromDataset, readConsent, startAnalytics, track } from '@/lib/analytics';

/** Pornește statisticile dacă vizitatorul le-a acceptat deja și trimite clicurile marcate cu trackAttrs(). */
export default function AnalyticsBoot() {
  useEffect(() => {
    if (readConsent() === 'granted') startAnalytics();

    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement | SVGElement>('[data-track]');
      if (!el?.dataset.track) return;
      // La <summary> numărăm doar deschiderea, nu și închiderea.
      if (el.tagName === 'SUMMARY' && (el.parentElement as HTMLDetailsElement | null)?.open) return;
      track(el.dataset.track, paramsFromDataset(el));
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  return null;
}
