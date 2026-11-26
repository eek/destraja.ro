'use client';

import { useCallback, useEffect, useId, useRef } from 'react';

const GAP = 8;
const EDGE = 16;
const SHEET_BELOW = 640;

/**
 * Un popover nativ lipit de butonul care îl deschide: sub buton (sau deasupra, dacă jos nu încape), iar pe telefon ca o
 * foaie jos. Se închide cu Esc sau click în afară, ca orice popover="auto".
 */
export function useAnchoredPopover<T extends HTMLElement = HTMLDivElement>() {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<T>(null);

  const place = useCallback(() => {
    const b = btn.current?.getBoundingClientRect();
    const p = pop.current;
    if (!b || !p) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw < SHEET_BELOW) {
      Object.assign(p.style, { left: `${EDGE}px`, right: `${EDGE}px`, top: 'auto', bottom: `${EDGE}px`, width: 'auto' });
      return;
    }
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    const left = Math.min(Math.max(EDGE, b.left), vw - EDGE - w);
    const below = vh - EDGE - (b.bottom + GAP);
    const above = b.top - GAP - EDGE;
    let top = b.bottom + GAP;
    if (h > below && h <= above) top = b.top - GAP - h;
    else if (h > below) {
      // Nu încape nici sub, nici deasupra: pe partea mai largă, cu înălțimea tăiată (conținutul derulează înăuntru).
      const room = Math.max(below, above);
      p.style.maxHeight = `${room}px`;
      top = above > below ? b.top - GAP - Math.min(h, room) : b.bottom + GAP;
    }
    Object.assign(p.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' });
  }, []);

  useEffect(() => {
    const p = pop.current;
    if (!p) return;
    const onScroll = () => place();
    // Conținutul care se încarcă după deschidere (textul unei trimiteri) schimbă înălțimea: îl repoziționăm.
    const sized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => place());
    const onToggle = (e: Event) => {
      if ((e as ToggleEvent).newState === 'open') {
        p.style.maxHeight = '';
        place();
        sized?.observe(p);
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
      } else {
        sized?.disconnect();
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      }
    };
    p.addEventListener('toggle', onToggle);
    return () => {
      sized?.disconnect();
      p.removeEventListener('toggle', onToggle);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [place]);

  return { id, btn, pop };
}
