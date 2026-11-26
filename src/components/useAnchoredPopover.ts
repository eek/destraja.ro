'use client';

import { useCallback, useEffect, useId, useRef } from 'react';

const GAP = 8;
const EDGE = 16;
/** Sub această lățime (sm din Tailwind) popover-ul e o foaie jos; poziția ei vine din clasele `max-sm:` din PopoverSheet. */
const SHEET_BELOW = 640;

/**
 * Un popover nativ lipit de butonul care îl deschide: sub buton (sau deasupra, dacă jos nu încape), iar pe telefon ca o
 * foaie jos, peste un fundal întunecat, cu pagina oprită dedesubt. Se închide cu Esc sau click în afară, ca orice
 * popover="auto".
 */
export function useAnchoredPopover<T extends HTMLElement = HTMLElement>() {
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
      // Foaia stă lipită de marginea de jos prin CSS; stilurile rămase de la o poziționare pe ecran lat ar trage-o înapoi.
      Object.assign(p.style, { left: '', right: '', top: '', bottom: '' });
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
    const root = document.documentElement;
    // Pe telefon pagina nu derulează pe sub foaie: altfel textul ei trece pe lângă și pe sub foaie, ca și cum s-ar suprapune.
    let unlock: (() => void) | null = null;
    const lock = () => {
      if (unlock || window.innerWidth >= SHEET_BELOW) return;
      const prev = root.style.overflow;
      root.style.overflow = 'hidden';
      unlock = () => {
        root.style.overflow = prev;
        unlock = null;
      };
    };
    const onScroll = () => place();
    // Conținutul care se încarcă după deschidere (textul unei trimiteri) schimbă înălțimea: îl repoziționăm.
    const sized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => place());
    const onToggle = (e: Event) => {
      if ((e as ToggleEvent).newState === 'open') {
        p.style.maxHeight = '';
        place();
        lock();
        sized?.observe(p);
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
      } else {
        unlock?.();
        sized?.disconnect();
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      }
    };
    p.addEventListener('toggle', onToggle);
    return () => {
      unlock?.();
      sized?.disconnect();
      p.removeEventListener('toggle', onToggle);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [place]);

  return { id, btn, pop };
}
