'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CalendarData } from '@/lib/agenda-calendar';
import { Glyph, segCls } from '@/components/ui';
import { dayAriaLabel, indexCalendar, isDay, isMonth, shift, summarize } from './cal';
import MonthGrid from './MonthGrid';
import { PlenMark } from './marks';
import WeekList from './WeekList';
import DayDetails, { startSentence } from './DayDetails';

type View = 'luna' | 'saptamana';
interface Nav {
  zi: string;
  luna: string;
  vedere: View;
}

const bucharestToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());

function fromUrl(today: string): Nav {
  const q = new URLSearchParams(window.location.search);
  const zi = isDay(q.get('zi')) ? q.get('zi')! : today;
  const luna = isMonth(q.get('luna')) ? q.get('luna')! : zi.slice(0, 7);
  return { zi, luna, vedere: q.get('vedere') === 'saptamana' ? 'saptamana' : 'luna' };
}

// Ziua aleasă e mereu în adresă după o alegere, ca linkul să se poată trimite; luna doar când diferă de a zilei.
function toUrl(n: Nav) {
  const q = new URLSearchParams({ zi: n.zi });
  if (n.vedere === 'luna' && n.luna !== n.zi.slice(0, 7)) q.set('luna', n.luna);
  if (n.vedere === 'saptamana') q.set('vedere', 'saptamana');
  return `${window.location.pathname}?${q}`;
}

/**
 * Calendarul agendei: luna (sau săptămâna) în stânga, ziua aleasă în dreapta; pe telefon, una sub alta. Starea (ziua,
 * luna afișată, vederea) stă în adresă, cu istoricul browserului; filtrele zilei rămân locale.
 */
export default function AgendaCalendar({ data }: { data: CalendarData }) {
  const ix = useMemo(() => indexCalendar(data), [data]);
  // La build, „azi” e ziua build-ului; în browser, ziua reală (site-ul se reface doar în zilele lucrătoare).
  const [today, setToday] = useState(data.builtFor);
  const [nav, setNav] = useState<Nav>({ zi: data.builtFor, luna: data.builtFor.slice(0, 7), vedere: 'luna' });
  const [announce, setAnnounce] = useState('');
  const details = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const t = bucharestToday() > data.builtFor ? bucharestToday() : data.builtFor;
    setToday(t);
    const sync = () => setNav(fromUrl(t));
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [data.builtFor]);

  const go = useCallback((next: Nav) => {
    setNav(next);
    const url = toUrl(next);
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.pushState(null, '', url);
  }, []);

  const select = useCallback(
    (zi: string, how: 'keyboard' | 'pointer' | 'link' = 'pointer') => {
      go({ ...nav, zi, luna: zi.slice(0, 7) });
      setAnnounce(`Zi aleasă: ${dayAriaLabel(summarize(ix, zi), today)}`);
      // Pe telefon detaliile sunt sub calendar: le aducem în ecran după o atingere. Cu tastatura focusul rămâne în grilă.
      if (how === 'link' || (how === 'pointer' && window.matchMedia('(max-width: 1023px)').matches)) {
        requestAnimationFrame(() => {
          const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          details.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
          details.current?.focus({ preventScroll: true });
        });
      }
    },
    [go, nav, ix, today],
  );

  const minMonth = (ix.first ?? today).slice(0, 7);
  const maxDay = [ix.last ?? today, today].sort().at(-1)!;
  const maxMonth = maxDay.slice(0, 7);

  return (
    <div className="mt-10 grid items-start gap-8 lg:grid-cols-[440px_minmax(0,1fr)] lg:gap-10">
      <div id="calendar" className="scroll-mt-24 lg:[@media(min-height:880px)]:sticky lg:top-24">
        <div role="group" aria-label="Vederea calendarului" className="inline-flex rounded-lg bg-sunken p-1">
          {(
            [
              ['luna', 'Lună'],
              ['saptamana', 'Săptămână'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={nav.vedere === v} onClick={() => go({ ...nav, vedere: v, luna: nav.zi.slice(0, 7) })} className={`${segCls(nav.vedere === v)} min-h-9 px-4 text-[13px]`}>
              {label}
            </button>
          ))}
        </div>

        <a href="#zi-detalii" className="sr-only focus:not-sr-only focus:ml-3 focus:inline-block focus:text-sm focus:font-semibold focus:text-link focus:underline">
          Sari la detaliile zilei
        </a>
        <div className="mt-4">
          {nav.vedere === 'luna' ? (
            <MonthGrid
              ix={ix}
              month={nav.luna}
              selected={nav.zi}
              today={today}
              minMonth={minMonth}
              maxMonth={maxMonth}
              onSelect={select}
              onMonth={(luna) => go({ ...nav, luna })}
              onToday={(how) => select(today, how)}
            />
          ) : (
            <WeekList
              ix={ix}
              selected={nav.zi}
              today={today}
              onSelect={select}
              first={ix.first ?? today}
              last={maxDay}
              onWeek={(delta) => go({ ...nav, zi: shift(nav.zi, delta * 7), luna: shift(nav.zi, delta * 7).slice(0, 7) })}
              onToday={(how) => select(today, how)}
            />
          )}
        </div>

        <Legend start={ix.start} />
        <p aria-live="polite" className="sr-only">
          {announce}
        </p>
      </div>

      <DayDetails
        key={nav.zi}
        ix={ix}
        zi={nav.zi}
        today={today}
        headingRef={details}
        onSelect={(zi) => select(zi, 'link')}
      />
    </div>
  );
}

function Legend({ start }: { start: Record<'senat' | 'camera', string | null> }) {
  return (
    <div className="mt-5 border-t border-line pt-4 text-xs leading-5 text-muted">
      <p className="sr-only">Legenda calendarului</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        <li>
          <b className="font-semibold text-ink">S</b> Senat, <b className="font-semibold text-ink">C</b> Camera Deputaților: câte proiecte urmărite sunt pe ordinea de zi
        </li>
        <li className="inline-flex items-center gap-1.5">
          <PlenMark />
          <span className="sr-only">P:</span> și în plen
        </li>
        <li className="inline-flex items-center gap-1.5">
          <Glyph level="red" className="h-2.5 w-2.5" />
          <span className="sr-only">Triunghiul:</span> cu risc ridicat
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="font-semibold text-faint">–</span>
          <span className="sr-only">Liniuța:</span> niciun proiect urmărit
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="cal-hatch inline-block h-3 w-4 rounded-sm border border-line" />
          <span className="sr-only">Hașura:</span> ordinea de zi nu e încă publicată sau citită
        </li>
      </ul>
      <p className="mt-2">{startSentence(start)}</p>
    </div>
  );
}
