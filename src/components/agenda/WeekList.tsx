'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Glyph } from '@/components/ui';
import { countWord } from '@/lib/format';
import { CHAMBERS, CHAMBER_SHORT, type CalIndex, dayAriaLabel, mediumDay, mondayOf, sessionHasPlenary, shift, shortDay, summarize } from './cal';
import { PlenMark } from './marks';

const navBtn =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink transition-colors hover:border-muted hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface';

/** Săptămâna zilei alese, ca listă de șapte zile: ce ședințe sunt și câte proiecte urmărite; un clic deschide ziua. */
export default function WeekList({
  ix,
  selected,
  today,
  onSelect,
  first,
  last,
  onWeek,
  onToday,
}: {
  ix: CalIndex;
  selected: string;
  today: string;
  onSelect: (zi: string, how: 'keyboard' | 'pointer') => void;
  /** Prima și ultima zi cu date: dincolo de ele nu mai avem săptămâni de arătat. */
  first: string;
  last: string;
  onWeek: (delta: number) => void;
  onToday: (how: 'keyboard' | 'pointer') => void;
}) {
  const monday = mondayOf(selected);
  const days = Array.from({ length: 7 }, (_, i) => shift(monday, i));
  const titleId = `saptamana-${monday}`;
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <h2 id={titleId} aria-live="polite" className="font-display mr-auto min-w-0 pl-1 text-xl font-normal tabular-nums text-ink sm:text-2xl">
          {shortDay(monday)} – {shortDay(days[6])}
        </h2>
        <button type="button" onClick={(e) => onToday(e.detail === 0 ? 'keyboard' : 'pointer')} className={`${navBtn} w-auto px-3 text-sm font-semibold`}>
          Azi
        </button>
        <button type="button" onClick={() => onWeek(-1)} disabled={monday <= first} aria-label="Săptămâna anterioară" className={navBtn}>
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <button type="button" onClick={() => onWeek(1)} disabled={days[6] >= last} aria-label="Săptămâna următoare" className={navBtn}>
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <ul aria-labelledby={titleId} className="mt-3 divide-y divide-line border-t border-line">
        {days.map((zi) => {
          const s = summarize(ix, zi);
          const sessions = ix.data.days[zi] ?? [];
          const pending = !s.bills && CHAMBERS.some((c) => s.by[c].coverage === 'pending') && !CHAMBERS.some((c) => s.by[c].coverage === 'read');
          const on = zi === selected;
          return (
            <li key={zi}>
              <button
                type="button"
                aria-pressed={on}
                aria-current={zi === today ? 'date' : undefined}
                aria-label={dayAriaLabel(s, today)}
                onClick={(e) => onSelect(zi, e.detail === 0 ? 'keyboard' : 'pointer')}
                className={`my-1 flex min-h-14 w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors ${on ? 'bg-brand-soft ring-2 ring-inset ring-brand' : 'hover:bg-sunken'}`}
              >
                <span className="w-24 shrink-0">
                  <span className={`block text-sm font-semibold first-letter:uppercase ${zi === today ? 'text-ink underline decoration-2 underline-offset-4' : 'text-ink'}`}>
                    {mediumDay(zi).split(',')[0]}
                  </span>
                  <span className="block text-xs tabular-nums text-muted">
                    {shortDay(zi)}
                    {zi === today && ' · azi'}
                  </span>
                </span>
                <span className="min-w-0 flex-1 text-sm leading-6">
                  {s.bills ? (
                    <>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums">
                        {CHAMBERS.filter((c) => s.by[c].bills).map((c) => (
                          <span key={c} className="inline-flex items-center gap-1">
                            <span className="font-semibold text-muted">{CHAMBER_SHORT[c]}</span>
                            <span className="font-semibold text-ink">{s.by[c].bills}</span>
                            {sessionHasPlenary(sessions, c) && <PlenMark />}
                          </span>
                        ))}
                        {s.red > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-risk-red-text">
                            <Glyph level="red" className="h-2.5 w-2.5" />
                            {s.red}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {sessions
                          .slice(0, 2)
                          .map((x) => x.comisie)
                          .join(' · ')}
                        {sessions.length > 2 && ` și încă ${countWord(sessions.length - 2, 'ședință', 'ședințe')}`}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted">{pending ? 'Ordinea de zi nu e încă publicată sau citită' : CHAMBERS.every((c) => s.by[c].coverage === 'none') ? 'Fără date' : 'Niciun proiect urmărit'}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
