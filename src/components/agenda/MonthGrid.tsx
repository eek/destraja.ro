'use client';

import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Glyph } from '@/components/ui';
import { CHAMBERS, CHAMBER_SHORT, type CalIndex, WEEKDAYS, dayAriaLabel, monthName, monthWeeks, sessionHasPlenary, shift, shiftMonth, summarize } from './cal';
import { PlenMark } from './marks';

const navBtn =
  'inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink transition-colors hover:border-muted hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface';

/**
 * Luna, de luni până duminică, ca grilă (role="grid"): un singur loc în ordinea Tab, săgețile mută focusul (zi, săptămână),
 * Home/End sar la luni/duminică, PageUp/PageDown la luna vecină, Enter sau Space aleg ziua. Fiecare zi arată câte proiecte
 * urmărite are pe ordinea de zi, pe camere, cu P când sunt și în plen și ▲ când unul are risc ridicat.
 */
export default function MonthGrid({
  ix,
  month,
  selected,
  today,
  minMonth,
  maxMonth,
  onSelect,
  onMonth,
  onToday,
}: {
  ix: CalIndex;
  month: string;
  selected: string;
  today: string;
  minMonth: string;
  maxMonth: string;
  onSelect: (zi: string, how: 'keyboard' | 'pointer') => void;
  onMonth: (month: string) => void;
  onToday: () => void;
}) {
  const weeks = monthWeeks(month);
  const [focus, setFocus] = useState(selected.slice(0, 7) === month ? selected : `${month}-01`);
  const keyboard = useRef(false);
  const cells = useRef(new Map<string, HTMLTableCellElement>());
  const titleId = `luna-${month}`;

  // Focusul urmează ziua aleasă și luna afișată; după o tastă îl mutăm efectiv pe celulă.
  useEffect(() => {
    setFocus((f) => (f.slice(0, 7) === month ? f : selected.slice(0, 7) === month ? selected : `${month}-01`));
  }, [month, selected]);
  useEffect(() => {
    if (keyboard.current) cells.current.get(focus)?.focus();
  }, [focus, month]);

  const move = (zi: string) => {
    const m = zi.slice(0, 7);
    if (m < minMonth || m > maxMonth) return;
    keyboard.current = true;
    setFocus(zi);
    if (m !== month) onMonth(m);
  };

  const onKey = (e: KeyboardEvent, zi: string) => {
    const wd = (new Date(`${zi}T12:00:00Z`).getUTCDay() + 6) % 7;
    const to: Record<string, () => string> = {
      ArrowLeft: () => shift(zi, -1),
      ArrowRight: () => shift(zi, 1),
      ArrowUp: () => shift(zi, -7),
      ArrowDown: () => shift(zi, 7),
      Home: () => shift(zi, -wd),
      End: () => shift(zi, 6 - wd),
      PageUp: () => `${shiftMonth(zi.slice(0, 7), -1)}-${zi.slice(8)}`.replace(/-(29|30|31)$/, '-28'),
      PageDown: () => `${shiftMonth(zi.slice(0, 7), 1)}-${zi.slice(8)}`.replace(/-(29|30|31)$/, '-28'),
    };
    if (to[e.key]) {
      e.preventDefault();
      move(to[e.key]());
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(zi, 'keyboard');
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <h2 id={titleId} aria-live="polite" className="font-display mr-auto pl-1 text-2xl font-normal text-ink">
          {monthName(month)}
        </h2>
        <button type="button" onClick={onToday} className={`${navBtn} w-auto px-3 text-sm font-semibold`}>
          Azi
        </button>
        <button type="button" onClick={() => onMonth(shiftMonth(month, -1))} disabled={month <= minMonth} aria-label={`Luna anterioară, ${monthName(shiftMonth(month, -1))}`} className={navBtn}>
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <button type="button" onClick={() => onMonth(shiftMonth(month, 1))} disabled={month >= maxMonth} aria-label={`Luna următoare, ${monthName(shiftMonth(month, 1))}`} className={navBtn}>
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <table role="grid" aria-labelledby={titleId} className="mt-3 w-full table-fixed border-separate border-spacing-[3px]">
        <thead>
          <tr>
            {WEEKDAYS.map(([short, long]) => (
              <th key={short} scope="col" className="pb-1 text-center text-xs font-semibold text-muted">
                <abbr title={long} className="no-underline">
                  {short}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((zi) => (
                <DayCell
                  key={zi}
                  ix={ix}
                  zi={zi}
                  month={month}
                  today={today}
                  selected={zi === selected}
                  focusable={zi === focus}
                  cellRef={(el) => (el ? cells.current.set(zi, el) : cells.current.delete(zi))}
                  onKeyDown={(e) => onKey(e, zi)}
                  onClick={() => {
                    keyboard.current = false;
                    setFocus(zi);
                    onSelect(zi, 'pointer');
                  }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DayCell({
  ix,
  zi,
  month,
  today,
  selected,
  focusable,
  cellRef,
  onKeyDown,
  onClick,
}: {
  ix: CalIndex;
  zi: string;
  month: string;
  today: string;
  selected: boolean;
  focusable: boolean;
  cellRef: (el: HTMLTableCellElement | null) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onClick: () => void;
}) {
  const s = summarize(ix, zi, today);
  const sessions = ix.data.days[zi] ?? [];
  const outside = zi.slice(0, 7) !== month;
  const noData = CHAMBERS.every((c) => s.by[c].coverage === 'none');
  const pending = !s.bills && !noData && CHAMBERS.every((c) => s.by[c].coverage !== 'read');
  const isToday = zi === today;

  return (
    <td
      ref={cellRef}
      role="gridcell"
      tabIndex={focusable ? 0 : -1}
      aria-selected={selected}
      aria-current={isToday ? 'date' : undefined}
      aria-label={dayAriaLabel(s, today)}
      onKeyDown={onKeyDown}
      onClick={onClick}
      className={`relative h-[66px] cursor-pointer rounded-lg p-1 align-top transition-colors sm:h-[78px] sm:p-1.5 ${
        selected ? 'bg-brand-soft ring-2 ring-inset ring-brand' : pending ? 'cal-hatch hover:bg-sunken' : s.bills ? 'bg-paper hover:bg-sunken' : 'hover:bg-sunken'
      } ${outside ? 'opacity-45' : ''} ${noData && !selected ? 'text-faint' : ''}`}
    >
      <div className="flex items-center justify-between gap-0.5">
        <span
          className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full text-[13px] tabular-nums ${
            isToday ? 'bg-brand font-semibold text-on-brand' : noData ? 'text-faint' : 'font-semibold text-ink'
          }`}
        >
          {Number(zi.slice(8))}
        </span>
        {s.red > 0 && <Glyph level="red" className="mr-0.5 h-2.5 w-2.5" />}
      </div>
      {s.bills > 0 ? (
        <div className="mt-1 space-y-0.5 text-[11px] leading-[15px] tabular-nums sm:text-xs sm:leading-4">
          {CHAMBERS.filter((c) => s.by[c].bills).map((c) => (
            <div key={c} className="flex items-center gap-[3px] whitespace-nowrap text-body">
              <span className="font-semibold text-muted">{CHAMBER_SHORT[c]}</span>
              <span className="font-semibold text-ink">{s.by[c].bills}</span>
              {sessionHasPlenary(sessions, c) && <PlenMark />}
            </div>
          ))}
        </div>
      ) : (
        !noData &&
        !pending && (
          <div aria-hidden className="mt-1 pl-1.5 text-sm font-semibold text-faint">
            –
          </div>
        )
      )}
    </td>
  );
}
